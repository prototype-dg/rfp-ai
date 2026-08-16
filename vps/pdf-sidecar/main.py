import os
import re
import io
import hmac
import time
import shutil
import hashlib
import logging
import asyncio
import pathlib
import secrets
from typing import Optional

import httpx
import pdfplumber
from fastapi import FastAPI, HTTPException, Security, Depends, BackgroundTasks, Request, Response
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel
from pdf2image import convert_from_bytes
from google.cloud import vision
from google.api_core.client_options import ClientOptions

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
SECRET = os.environ.get("PDF_SIDECAR_SECRET", "")
MAX_PAGES = int(os.environ.get("PDF_MAX_PAGES", "100"))
MAX_BYTES = int(os.environ.get("PDF_MAX_BYTES", str(50 * 1024 * 1024)))  # 50 MB
OCR_DPI = int(os.environ.get("OCR_DPI", "150"))
OCR_THREADS = int(os.environ.get("OCR_THREADS", "4"))
GOOGLE_VISION_API_KEY = os.environ.get("GOOGLE_VISION_API_KEY", "")

# Proposal relay storage — temp files live here until the Worker fetches & streams to R2
PROPOSAL_TMP_DIR = pathlib.Path(os.environ.get("PROPOSAL_TMP_DIR", "/tmp/proposal-uploads"))
PROPOSAL_TMP_DIR.mkdir(parents=True, exist_ok=True)
PROPOSAL_TOKEN_TTL = int(os.environ.get("PROPOSAL_TOKEN_TTL", str(2 * 3600)))  # 2 hours
PROPOSAL_MAX_FILE_BYTES = int(os.environ.get("PROPOSAL_MAX_FILE_BYTES", str(500 * 1024 * 1024)))  # 500 MB per file

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("pdf-sidecar")

app = FastAPI(title="PDF Sidecar", version="7.0.0")
bearer = HTTPBearer()

# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------
def verify_token(credentials: HTTPAuthorizationCredentials = Security(bearer)):
    if not SECRET:
        raise HTTPException(status_code=500, detail="Server secret not configured")
    if credentials.credentials != SECRET:
        raise HTTPException(status_code=401, detail="Invalid token")
    return True

# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
class ExtractRequest(BaseModel):
    pdf_url: str
    max_pages: Optional[int] = None
    callback_url: Optional[str] = None
    callback_secret: Optional[str] = None

class ExtractResponse(BaseModel):
    text: str
    pages_total: int
    pages_extracted: int
    chars: int
    truncated: bool
    filename: Optional[str] = None
    method: str
    async_mode: bool = False

# ---------------------------------------------------------------------------
# pdfplumber fast path — for text-layer PDFs (Word/Docs exports)
# ---------------------------------------------------------------------------
def extract_text_pdfplumber(pdf_bytes: bytes, max_pages: int) -> dict:
    text_parts = []
    pages_total = 0
    pages_extracted = 0
    truncated = False

    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        pages_total = len(pdf.pages)
        limit = min(max_pages, pages_total)
        if limit < pages_total:
            truncated = True
        for i, page in enumerate(pdf.pages[:limit]):
            pages_extracted += 1
            page_text = page.extract_text(x_tolerance=2, y_tolerance=2)
            if page_text:
                text_parts.append(f"--- Page {i + 1} ---\n{page_text}")
            tables = page.extract_tables()
            for table in tables:
                for row in table:
                    row_text = " | ".join(cell.strip() if cell else "" for cell in row)
                    if row_text.strip(" |"):
                        text_parts.append(row_text)

    full_text = "\n\n".join(text_parts)
    return {
        "text": full_text,
        "pages_total": pages_total,
        "pages_extracted": pages_extracted,
        "chars": len(full_text),
        "truncated": truncated,
    }

# ---------------------------------------------------------------------------
# Google Vision OCR — for image-based PDFs (Figma exports, scanned docs)
# ---------------------------------------------------------------------------
def extract_text_google_vision(pdf_bytes: bytes, max_pages: int) -> dict:
    if not GOOGLE_VISION_API_KEY:
        raise RuntimeError("GOOGLE_VISION_API_KEY not configured")

    logger.info(f"Google Vision OCR at {OCR_DPI} DPI, max {max_pages} pages...")

    pages_total = max_pages
    try:
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            pages_total = len(pdf.pages)
    except Exception:
        pass

    truncated = pages_total > max_pages

    images = convert_from_bytes(
        pdf_bytes,
        dpi=OCR_DPI,
        first_page=1,
        last_page=max_pages,
        fmt="jpeg",
        thread_count=OCR_THREADS,
    )
    logger.info(f"Rendered {len(images)} pages")

    client = vision.ImageAnnotatorClient(
        client_options=ClientOptions(api_key=GOOGLE_VISION_API_KEY)
    )

    text_parts = []
    pages_extracted = 0

    for i, img in enumerate(images):
        try:
            buf = io.BytesIO()
            img.save(buf, format="JPEG", quality=85)
            img_bytes = buf.getvalue()

            response = client.document_text_detection(
                image=vision.Image(content=img_bytes)
            )

            if response.error.message:
                logger.warning(f"Vision API error on page {i+1}: {response.error.message}")
                text_parts.append(f"--- Page {i + 1} ---\n[extraction failed]")
            else:
                page_text = response.full_text_annotation.text or ""
                text_parts.append(f"--- Page {i + 1} ---\n{page_text}")
                pages_extracted += 1
                logger.info(f"Page {i+1}: {len(page_text)} chars")

        except Exception as e:
            logger.warning(f"Failed to process page {i+1}: {e}")
            text_parts.append(f"--- Page {i + 1} ---\n[extraction failed]")

    full_text = "\n\n".join(text_parts)
    return {
        "text": full_text,
        "pages_total": pages_total,
        "pages_extracted": pages_extracted,
        "chars": len(full_text),
        "truncated": truncated,
    }

# ---------------------------------------------------------------------------
# Core extraction logic (shared by sync and async paths)
# ---------------------------------------------------------------------------
async def run_extraction(pdf_url: str, max_pages: int) -> tuple[dict, str, str]:
    """Downloads PDF and always runs Google Vision OCR. Returns (result, method, filename).

    We always use Google Vision regardless of PDF size or whether a text layer exists.
    pdfplumber faithfully reproduces text-layer artifacts (TOC dot-leaders, table pipe
    separators, repeated whitespace) that degrade downstream LLM extraction quality.
    Google Vision's layout-aware OCR produces clean, paragraph-structured output even
    for vector/text-layer PDFs, which is what we need.
    """
    logger.info(f"Fetching PDF: {pdf_url[:80]}...")

    async with httpx.AsyncClient(timeout=120.0, follow_redirects=True) as client:
        response = await client.get(pdf_url)
        response.raise_for_status()

    pdf_bytes = response.content
    size_mb = len(pdf_bytes) / 1024 / 1024
    logger.info(f"PDF size: {size_mb:.1f} MB")

    if len(pdf_bytes) > MAX_BYTES:
        raise ValueError(f"PDF too large: {size_mb:.1f} MB (max {MAX_BYTES // 1024 // 1024} MB)")

    filename = pdf_url.split("/")[-1].split("?")[0] or None

    # Always use Google Vision — no pdfplumber fast-path, no size threshold.
    method = "google_vision"
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, extract_text_google_vision, pdf_bytes, max_pages)

    logger.info(
        f"[{method}] Extracted {result['chars']} chars from "
        f"{result['pages_extracted']}/{result['pages_total']} pages"
        f"{' (truncated)' if result['truncated'] else ''}"
    )

    return result, method, filename

# ---------------------------------------------------------------------------
# Background task: run extraction then POST result to callback_url
# ---------------------------------------------------------------------------
async def extract_and_callback(
    pdf_url: str,
    max_pages: int,
    callback_url: str,
    callback_secret: Optional[str],
    filename: Optional[str],
):
    logger.info(f"[async] Starting background extraction for {pdf_url[:80]}")
    try:
        result, method, fname = await run_extraction(pdf_url, max_pages)
        payload = {
            "ok": True,
            "text": result["text"],
            "pages_total": result["pages_total"],
            "pages_extracted": result["pages_extracted"],
            "chars": result["chars"],
            "truncated": result["truncated"],
            "filename": fname or filename,
            "method": method,
        }
        if callback_secret:
            payload["callback_secret"] = callback_secret
    except Exception as e:
        logger.error(f"[async] Extraction failed: {e}")
        payload = {
            "ok": False,
            "error": str(e),
            "callback_secret": callback_secret,
        }

    # POST result back to the Worker callback endpoint
    logger.info(f"[async] POSTing result to callback_url: {callback_url[:80]}")
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(callback_url, json=payload)
            logger.info(f"[async] Callback response: {resp.status_code}")
    except Exception as e:
        logger.error(f"[async] Failed to deliver callback: {e}")

# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@app.get("/health")
def health():
    return {
        "status": "ok",
        "version": "6.0.0",
        "ocr_engine": "google_vision" if GOOGLE_VISION_API_KEY else "unavailable",
        "ocr_dpi": OCR_DPI,
        "ocr_threads": OCR_THREADS,
    }

@app.post("/extract-pdf", response_model=ExtractResponse, dependencies=[Depends(verify_token)])
async def extract_pdf(req: ExtractRequest, background_tasks: BackgroundTasks):
    max_pages = req.max_pages or MAX_PAGES
    filename = req.pdf_url.split("/")[-1].split("?")[0] or None

    # ── ASYNC MODE: fire and forget, return 202 immediately ──────────────────
    if req.callback_url:
        logger.info(f"[async] callback_url provided — returning 202 immediately")
        background_tasks.add_task(
            extract_and_callback,
            req.pdf_url,
            max_pages,
            req.callback_url,
            req.callback_secret,
            filename,
        )
        return ExtractResponse(
            text="",
            pages_total=0,
            pages_extracted=0,
            chars=0,
            truncated=False,
            filename=filename,
            method="pending",
            async_mode=True,
        )

    # ── SYNC MODE: original behaviour (no callback_url) ─────────────────────
    try:
        result, method, fname = await run_extraction(req.pdf_url, max_pages)
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch PDF: {e.response.status_code}")
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"Network error fetching PDF: {str(e)}")
    except ValueError as e:
        raise HTTPException(status_code=413, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"OCR failed: {str(e)}")

    return ExtractResponse(filename=fname, method=method, async_mode=False, **result)


# ---------------------------------------------------------------------------
# LLM extraction — runs llama-server locally, callbacks results to Worker
# ---------------------------------------------------------------------------
import json as _json

LLM_API_KEY = os.environ.get("LLM_API_KEY", "23eb310d5c8764c8ec84a4a119d4257a17fa5c93e98e77d0")
LLM_BASE_URL = os.environ.get("LLM_BASE_URL", "http://127.0.0.1:11434/v1")

EXTRACTION_SYSTEM_PROMPT = """You are an expert procurement analyst. Extract structured fields from the provided RFP text and return a single valid JSON object with these keys only:
{
  "title": "<string, max 120 chars>",
  "category": "<one of: IT & Digital Transformation | ERP & Business Applications | Data & Analytics | Cloud & Infrastructure | Cybersecurity | AI & Machine Learning | Digital Marketing | Consulting | Construction | Professional Services>",
  "background": "<string, max 500 chars>",
  "objectives": "<string, max 500 chars>",
  "scope": "<string, max 800 chars>",
  "tech_requirements": "<string, max 600 chars>",
  "budget": "<digits only or empty string>",
  "deadline": "<YYYY-MM-DD or empty string>",
  "scoring_criteria": [{"criterion": "<string>", "weight": <integer 0-100>, "description": "<1-2 sentences>"}],
  "vendor_requirements": [{"id": "req_<n>", "text": "<actionable requirement>", "mandatory": <true|false>}]
}
Scoring rules:
- Copy criterion names and weights EXACTLY as they appear in the RFP evaluation/scoring table.
- If the document states weights (e.g. "Technical 40%, Commercial 30%, Experience 20%, Presentation 10%"), use those exact numbers.
- Weights must sum to exactly 100. If the document weights do not sum to 100, scale them proportionally.
- Do NOT invent criteria or weights that are not in the document.
Other rules: Extract 10-25 vendor_requirements. Return ONLY the JSON object, no markdown, no explanation."""

class LlmExtractRequest(BaseModel):
    rfp_id: int
    ocr_text: str
    callback_url: str
    callback_secret: Optional[str] = None
    max_input_chars: Optional[int] = 20000
    max_tokens: Optional[int] = 2000

async def llm_extract_and_callback(
    rfp_id: int,
    ocr_text: str,
    callback_url: str,
    callback_secret: Optional[str],
    max_input_chars: int,
    max_tokens: int,
):
    logger.info(f"[llm-extract] rfp={rfp_id} ocr_chars={len(ocr_text)} max_input={max_input_chars} max_tokens={max_tokens}")
    try:
        input_text = ocr_text[:max_input_chars]
        user_prompt = f"Extract all structured fields from this RFP:\n\n{input_text}"

        async with httpx.AsyncClient(timeout=300.0) as client:
            resp = await client.post(
                f"{LLM_BASE_URL}/chat/completions",
                headers={"Authorization": f"Bearer {LLM_API_KEY}", "Content-Type": "application/json"},
                json={
                    "model": "qwen2.5-3b-instruct",
                    "messages": [
                        {"role": "system", "content": EXTRACTION_SYSTEM_PROMPT},
                        {"role": "user", "content": user_prompt},
                    ],
                    "max_tokens": max_tokens,
                    "temperature": 0.3,
                    "stream": False,
                },
            )
            resp.raise_for_status()
            data = resp.json()

        usage = data.get("usage", {})
        timings = data.get("timings", {})
        logger.info(
            f"[llm-extract] rfp={rfp_id} prompt_tok={usage.get('prompt_tokens')} "
            f"completion_tok={usage.get('completion_tokens')} "
            f"prefill_ms={timings.get('prompt_ms',0):.0f} gen_ms={timings.get('predicted_ms',0):.0f}"
        )

        raw = data["choices"][0]["message"]["content"]
        # Strip markdown fences if present
        raw = re.sub(r"^```json\s*", "", raw.strip(), flags=re.IGNORECASE)
        raw = re.sub(r"^```\s*", "", raw, flags=re.IGNORECASE)
        raw = re.sub(r"\s*```\s*$", "", raw)
        raw = raw.strip()

        # Extract JSON object
        s = raw.find("{")
        e = raw.rfind("}")
        if s == -1 or e == -1 or e <= s:
            raise ValueError(f"No JSON object in LLM output (chars={len(raw)}): {raw[:200]}")

        parsed = _json.loads(raw[s:e+1])

        # ── Normalize scoring_criteria weights to exactly 100 ──────────────────
        criteria = parsed.get("scoring_criteria") or []
        if criteria and isinstance(criteria, list):
            # Use 'weight' key; fall back to 'score' if model used wrong key name
            for c in criteria:
                if "score" in c and "weight" not in c:
                    c["weight"] = c.pop("score")
                if "weight" not in c:
                    c["weight"] = 0
                # Coerce to int
                try:
                    c["weight"] = int(round(float(c["weight"])))
                except (ValueError, TypeError):
                    c["weight"] = 0
            total = sum(c.get("weight", 0) for c in criteria)
            if total > 0 and total != 100:
                # Scale weights proportionally so they sum to exactly 100
                scaled = [round(c["weight"] * 100 / total) for c in criteria]
                # Fix rounding error on the largest criterion to hit exactly 100
                diff = 100 - sum(scaled)
                if diff != 0:
                    max_idx = scaled.index(max(scaled))
                    scaled[max_idx] += diff
                for i, c in enumerate(criteria):
                    c["weight"] = scaled[i]
                logger.info(f"[llm-extract] rfp={rfp_id} normalized weights: {total}→100 ({[c['weight'] for c in criteria]})")
            parsed["scoring_criteria"] = criteria
        # ───────────────────────────────────────────────────────────────────────

        payload = {
            "ok": True,
            "rfp_id": rfp_id,
            "extracted": parsed,
            "callback_secret": callback_secret,
            "prompt_tokens": usage.get("prompt_tokens"),
            "completion_tokens": usage.get("completion_tokens"),
        }

    except Exception as ex:
        logger.error(f"[llm-extract] rfp={rfp_id} failed: {ex}")
        payload = {
            "ok": False,
            "rfp_id": rfp_id,
            "error": str(ex),
            "callback_secret": callback_secret,
        }

    logger.info(f"[llm-extract] rfp={rfp_id} posting callback to {callback_url[:80]}")
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            cb_resp = await client.post(callback_url, json=payload)
            logger.info(f"[llm-extract] rfp={rfp_id} callback status={cb_resp.status_code}")
    except Exception as ex:
        logger.error(f"[llm-extract] rfp={rfp_id} callback failed: {ex}")


@app.post("/llm-extract", dependencies=[Depends(verify_token)])
async def llm_extract(req: LlmExtractRequest, background_tasks: BackgroundTasks):
    """Fire-and-forget LLM extraction. Runs llama-server locally, POSTs results to callback_url."""
    background_tasks.add_task(
        llm_extract_and_callback,
        req.rfp_id,
        req.ocr_text,
        req.callback_url,
        req.callback_secret,
        req.max_input_chars or 20000,
        req.max_tokens or 2000,
    )
    logger.info(f"[llm-extract] rfp={req.rfp_id} queued for background extraction")
    return {"ok": True, "rfp_id": req.rfp_id, "status": "queued"}


# ---------------------------------------------------------------------------
# Proposal Upload Relay — browser uploads here, Worker fetches to stream → R2
#
# Why: CF Workers has a 128MB memory limit and ~150s wall-clock limit.
#      Buffering large PDFs with arrayBuffer() + R2.put() exceeds both limits.
#      The VPS has no such constraints — nginx handles large bodies natively,
#      and uvicorn streams the bytes directly to disk without buffering.
#
# Flow:
#   1. Worker POST /proposal-upload/init   — creates signed token, returns upload URLs
#   2. Browser PUT /proposal-upload/<tok>/<filename>  — streams file to VPS disk
#   3. Worker POST /submit/:id/finalize    — Worker GETs /proposal-temp/<tok>/<filename>,
#                                           streams bytes into R2, deletes temp file
#
# Token format: <rfp_id>:<vendor_id>:<slot_index>:<expiry_ts>:<hmac_hex>
# HMAC key: PDF_SIDECAR_SECRET — Worker already knows this secret.
# ---------------------------------------------------------------------------

def _make_upload_token(rfp_id: int, vendor_id: int, slot_idx: int) -> str:
    """Generate a short-lived signed token for one upload slot."""
    expiry = int(time.time()) + PROPOSAL_TOKEN_TTL
    payload = f"{rfp_id}:{vendor_id}:{slot_idx}:{expiry}"
    sig = hmac.new(SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()[:16]
    return f"{payload}:{sig}"

def _verify_upload_token(token: str) -> tuple[int, int, int]:
    """Verify token and return (rfp_id, vendor_id, slot_idx). Raises ValueError on failure."""
    if not SECRET:
        raise ValueError("Server secret not configured")
    parts = token.split(":")
    if len(parts) != 5:
        raise ValueError("Malformed token")
    rfp_id, vendor_id, slot_idx, expiry_str, sig = parts
    payload = f"{rfp_id}:{vendor_id}:{slot_idx}:{expiry_str}"
    expected_sig = hmac.new(SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()[:16]
    if not hmac.compare_digest(sig, expected_sig):
        raise ValueError("Invalid token signature")
    if int(time.time()) > int(expiry_str):
        raise ValueError("Token expired")
    return int(rfp_id), int(vendor_id), int(slot_idx)


class ProposalUploadInitRequest(BaseModel):
    rfp_id: int
    vendor_id: int
    files: list[dict]  # [{ filename, content_type, size_bytes, label }]
    sidecar_base_url: Optional[str] = None  # e.g. "https://api.cpc-rfp.website"


@app.post("/proposal-upload/init", dependencies=[Depends(verify_token)])
async def proposal_upload_init(req: ProposalUploadInitRequest):
    """
    Called by the Worker (not the browser) to generate upload slots.
    Returns per-file upload URLs pointing back to this VPS.
    The Worker passes sidecar_base_url so URLs are correctly self-referential.
    """
    if not req.files:
        raise HTTPException(status_code=400, detail="No files specified")
    if len(req.files) > 10:
        raise HTTPException(status_code=400, detail="Maximum 10 files per submission")

    base_url = (req.sidecar_base_url or "").rstrip("/")
    if not base_url:
        raise HTTPException(status_code=400, detail="sidecar_base_url required")

    slots = []
    for i, f in enumerate(req.files):
        token = _make_upload_token(req.rfp_id, req.vendor_id, i)
        safe_name = re.sub(r"[^a-zA-Z0-9._-]", "_", f.get("filename") or f"document_{i+1}.pdf")
        upload_url = f"{base_url}/proposal-upload/{token}/{safe_name}"
        fetch_url  = f"{base_url}/proposal-temp/{token}/{safe_name}"
        slots.append({
            "slot_idx":     i,
            "token":        token,
            "filename":     f.get("filename") or f"document_{i+1}.pdf",
            "safe_name":    safe_name,
            "label":        f.get("label", "other"),
            "content_type": f.get("content_type", "application/pdf"),
            "size_bytes":   f.get("size_bytes", 0),
            "upload_url":   upload_url,
            "fetch_url":    fetch_url,
        })
    logger.info(f"[proposal-relay] init rfp={req.rfp_id} vendor={req.vendor_id} files={len(slots)}")
    return {"ok": True, "slots": slots}


@app.put("/proposal-upload/{token}/{filename}")
async def proposal_upload_receive(token: str, filename: str, request: Request):
    """
    Browser streams raw file bytes here via XHR PUT (no Auth header needed —
    the signed token IS the auth). Stores to PROPOSAL_TMP_DIR/<token>/<filename>.
    nginx must be configured with client_max_body_size 500m; proxy_read_timeout 1800s.
    """
    try:
        rfp_id, vendor_id, slot_idx = _verify_upload_token(token)
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e))

    safe_name = re.sub(r"[^a-zA-Z0-9._-]", "_", filename)
    slot_dir  = PROPOSAL_TMP_DIR / token
    slot_dir.mkdir(parents=True, exist_ok=True)
    dest_path = slot_dir / safe_name

    content_length = request.headers.get("content-length")
    max_bytes = PROPOSAL_MAX_FILE_BYTES
    if content_length and int(content_length) > max_bytes:
        raise HTTPException(status_code=413, detail=f"File too large (max {max_bytes // 1024 // 1024} MB)")

    bytes_written = 0
    try:
        with open(dest_path, "wb") as f:
            async for chunk in request.stream():
                bytes_written += len(chunk)
                if bytes_written > max_bytes:
                    f.close()
                    dest_path.unlink(missing_ok=True)
                    raise HTTPException(status_code=413, detail="File too large (exceeded during stream)")
                f.write(chunk)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[proposal-relay] upload error rfp={rfp_id} vendor={vendor_id}: {e}")
        raise HTTPException(status_code=500, detail="Upload failed")

    size_mb = bytes_written / 1024 / 1024
    logger.info(f"[proposal-relay] stored rfp={rfp_id} vendor={vendor_id} slot={slot_idx} file={safe_name} size={size_mb:.1f}MB path={dest_path}")
    return {"ok": True, "filename": safe_name, "bytes": bytes_written}


@app.get("/proposal-temp/{token}/{filename}")
async def proposal_temp_fetch(token: str, filename: str, request: Request):
    """
    Called by the Worker (with Bearer auth) to stream the temp file into R2.
    After the Worker confirms R2 write, it calls DELETE on this endpoint to clean up.
    We also check Bearer token so random internet can't fetch temp files.
    """
    # Auth: require Bearer with the shared secret
    auth_header = request.headers.get("authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing auth")
    provided = auth_header[7:]
    if not SECRET or not hmac.compare_digest(provided, SECRET):
        raise HTTPException(status_code=401, detail="Invalid token")

    try:
        _verify_upload_token(token)
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e))

    safe_name = re.sub(r"[^a-zA-Z0-9._-]", "_", filename)
    dest_path = PROPOSAL_TMP_DIR / token / safe_name

    if not dest_path.exists():
        raise HTTPException(status_code=404, detail="Temp file not found or already fetched")

    file_size = dest_path.stat().st_size

    def iterfile():
        with open(dest_path, "rb") as f:
            while chunk := f.read(64 * 1024):  # 64 KB chunks
                yield chunk

    return StreamingResponse(
        iterfile(),
        media_type="application/octet-stream",
        headers={
            "Content-Length": str(file_size),
            "X-Filename": safe_name,
        },
    )


@app.delete("/proposal-temp/{token}/{filename}", dependencies=[Depends(verify_token)])
async def proposal_temp_delete(token: str, filename: str):
    """Worker calls this after successfully streaming the file into R2."""
    try:
        _verify_upload_token(token)
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e))

    safe_name = re.sub(r"[^a-zA-Z0-9._-]", "_", filename)
    slot_dir  = PROPOSAL_TMP_DIR / token
    dest_path = slot_dir / safe_name

    if dest_path.exists():
        dest_path.unlink()
        logger.info(f"[proposal-relay] deleted temp file: {dest_path}")
    # Clean up directory if empty
    try:
        slot_dir.rmdir()
    except OSError:
        pass

    return {"ok": True, "deleted": safe_name}


@app.on_event("startup")
async def cleanup_old_temp_files():
    """Remove temp files older than TTL on startup (best-effort)."""
    cutoff = time.time() - PROPOSAL_TOKEN_TTL - 3600  # extra hour grace
    removed = 0
    try:
        for slot_dir in PROPOSAL_TMP_DIR.iterdir():
            if slot_dir.is_dir():
                try:
                    if slot_dir.stat().st_mtime < cutoff:
                        shutil.rmtree(slot_dir, ignore_errors=True)
                        removed += 1
                except Exception:
                    pass
    except Exception:
        pass
    if removed:
        logger.info(f"[proposal-relay] startup cleanup: removed {removed} expired upload dirs")
