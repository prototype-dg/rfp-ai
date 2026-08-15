import os
import io
import logging
import asyncio
from typing import Optional

import httpx
import pdfplumber
from fastapi import FastAPI, HTTPException, Security, Depends, BackgroundTasks
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
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

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("pdf-sidecar")

app = FastAPI(title="PDF Sidecar", version="6.0.0")
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
        "version": "5.0.0",
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
