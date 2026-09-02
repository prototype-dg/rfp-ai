/**
 * ocr.ts
 *
 * Inline replacement for the VPS pdf-sidecar OCR pipeline (vps/pdf-sidecar/main.py).
 *
 * Key improvements over the Python sidecar:
 *   - pdf-to-img (PDFium WASM) instead of pdf2image/poppler — 2-3× faster rasterisation
 *   - Google Vision API calls are PARALLELISED with Promise.all (was serial for-loop)
 *   - No network round-trips: runs in-process, result returned directly to caller
 *   - Configurable concurrency cap (VISION_CONCURRENCY) to bound memory under load
 *
 * Phase 2 of the Azure sidecar inline migration.
 */
import { ImageAnnotatorClient } from '@google-cloud/vision';
// Config — mirrors the Python sidecar's env vars
const OCR_DPI = parseInt(process.env.OCR_DPI || '150', 10);
const MAX_PAGES = parseInt(process.env.PDF_MAX_PAGES || '100', 10);
const MAX_BYTES = parseInt(process.env.PDF_MAX_BYTES || String(50 * 1024 * 1024), 10);
const VISION_CONCURRENCY = parseInt(process.env.VISION_CONCURRENCY || '20', 10);
// ── Vision client (lazy, singleton) ──────────────────────────────────────────
let _visionClient = null;
function getVisionClient(apiKey) {
    if (!_visionClient) {
        _visionClient = new ImageAnnotatorClient({
            apiKey,
        });
    }
    return _visionClient;
}
// ── Chunk helper ──────────────────────────────────────────────────────────────
function chunkArray(arr, size) {
    const chunks = [];
    for (let i = 0; i < arr.length; i += size) {
        chunks.push(arr.slice(i, i + size));
    }
    return chunks;
}
/**
 * extractTextFromPdf
 *
 * Downloads a PDF from `pdfUrl`, rasterises every page with pdf-to-img (PDFium),
 * then calls Google Vision document_text_detection in parallel batches.
 *
 * @param pdfUrl   Publicly accessible URL of the PDF (R2 signed URL or proxy URL)
 * @param apiKey   Google Vision API key (from env.GOOGLE_VISION_API_KEY)
 * @param maxPages Override page cap (default MAX_PAGES = 100)
 */
export async function extractTextFromPdf(pdfUrl, apiKey, maxPages) {
    if (!apiKey)
        throw new Error('GOOGLE_VISION_API_KEY not configured');
    const limit = maxPages ?? MAX_PAGES;
    // ── 1. Download PDF ───────────────────────────────────────────────────────
    console.log(`[ocr] fetching PDF: ${pdfUrl.slice(0, 80)}...`);
    const resp = await fetch(pdfUrl, { redirect: 'follow' });
    if (!resp.ok)
        throw new Error(`Failed to fetch PDF: HTTP ${resp.status}`);
    const pdfBuffer = Buffer.from(await resp.arrayBuffer());
    const sizeMb = pdfBuffer.length / 1024 / 1024;
    console.log(`[ocr] PDF size: ${sizeMb.toFixed(1)} MB`);
    if (pdfBuffer.length > MAX_BYTES) {
        throw new Error(`PDF too large: ${sizeMb.toFixed(1)} MB (max ${MAX_BYTES / 1024 / 1024} MB)`);
    }
    const filename = pdfUrl.split('/').pop()?.split('?')[0] || undefined;
    // ── 2. Rasterise with pdf-to-img (PDFium WASM, 2-3× faster than poppler) ──
    console.log(`[ocr] rasterising at ${OCR_DPI} DPI (max ${limit} pages) with pdfium...`);
    // pdf-to-img is an ESM-only package; dynamic import handles the module boundary
    const { pdf } = await import('pdf-to-img');
    const document = await pdf(pdfBuffer, { scale: OCR_DPI / 72 });
    const pages_total = document.length;
    const pages_to_process = Math.min(limit, pages_total);
    const truncated = pages_total > limit;
    // Collect JPEG buffers for all pages up to the limit
    const imageBuffers = [];
    let pageIdx = 0;
    for await (const page of document) {
        if (pageIdx >= pages_to_process)
            break;
        // pdf-to-img returns PNG Uint8Array; Vision API accepts PNG directly
        imageBuffers.push(Buffer.from(page));
        pageIdx++;
    }
    console.log(`[ocr] rasterised ${imageBuffers.length} pages`);
    // ── 3. Call Vision API in parallel batches ────────────────────────────────
    const client = getVisionClient(apiKey);
    const textParts = [];
    let pages_extracted = 0;
    const chunks = chunkArray(imageBuffers, VISION_CONCURRENCY);
    let chunkStart = 0;
    for (const chunk of chunks) {
        console.log(`[ocr] Vision API batch: pages ${chunkStart + 1}–${chunkStart + chunk.length} (${chunk.length} parallel)`);
        const results = await Promise.all(chunk.map(async (imgBuf, idx) => {
            const pageNum = chunkStart + idx + 1;
            try {
                const [response] = await client.documentTextDetection({
                    image: { content: imgBuf },
                });
                if (response.error?.message) {
                    console.warn(`[ocr] Vision API error page ${pageNum}: ${response.error.message}`);
                    return { pageNum, text: null, error: response.error.message };
                }
                const pageText = response.fullTextAnnotation?.text || '';
                console.log(`[ocr] page ${pageNum}: ${pageText.length} chars`);
                return { pageNum, text: pageText, error: null };
            }
            catch (e) {
                console.warn(`[ocr] Vision API exception page ${pageNum}: ${e.message}`);
                return { pageNum, text: null, error: e.message };
            }
        }));
        for (const r of results) {
            if (r.text !== null) {
                textParts.push(`--- Page ${r.pageNum} ---\n${r.text}`);
                pages_extracted++;
            }
            else {
                textParts.push(`--- Page ${r.pageNum} ---\n[extraction failed: ${r.error}]`);
            }
        }
        chunkStart += chunk.length;
    }
    const full_text = textParts.join('\n\n');
    console.log(`[ocr] done: ${pages_extracted}/${pages_total} pages extracted, ${full_text.length} chars${truncated ? ' (truncated)' : ''}`);
    return {
        text: full_text,
        pages_total,
        pages_extracted,
        chars: full_text.length,
        truncated,
        method: 'google_vision',
        filename,
    };
}
//# sourceMappingURL=ocr.js.map