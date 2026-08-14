// /opt/pdf-service/server.js
// Node.js / Express / Puppeteer PDF render service
// Runs on the sidecar VPS at 127.0.0.1:8001
// Proxied by nginx at https://api.cpc-rfp.website/pdf/
//
// v3: New Andersen inline-HTML design.
//     - Header/footer are fully inline inside each LLM page div.
//     - Puppeteer's displayHeaderFooter/headerTemplate/footerTemplate disabled.
//     - Page size comes from the request body (page_width x page_height).
//       Default: 794px x 1123px (96dpi A4) matching LLM page div dimensions.
//       1 LLM page div → exactly 1 PDF page.
//     - All margins are 0 — the LLM page divs have their own inner padding.

'use strict';
const express = require('express');
const puppeteer = require('puppeteer');

const app = express();
app.use(express.json({ limit: '20mb' }));

const PORT = 8001;
const SECRET = process.env.PDF_SERVICE_SECRET || '';

// ── Health check ────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'pdf-render', version: '3' });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// ── Auth middleware ──────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  if (!SECRET) return next(); // no secret configured → open (dev mode)
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (token !== SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// ── POST /render-pdf ─────────────────────────────────────────────────────────
// Body: {
//   html: string,
//   page_width?: string,   // e.g. "794px"  — default "794px"
//   page_height?: string,  // e.g. "1123px" — default "1123px"
//   letterhead_data_uri?: string  // ignored (kept for API compat — new design is inline)
// }
// Returns: application/pdf bytes
app.post('/render-pdf', requireAuth, async (req, res) => {
  const { html, page_width, page_height } = req.body || {};

  if (!html || typeof html !== 'string') {
    return res.status(400).json({ error: 'Missing required field: html' });
  }

  // Page dimensions — LLM generates 794×1123px divs (96dpi A4).
  // Accept override from caller but fall back to the canonical values.
  const pageW = page_width  || '794px';
  const pageH = page_height || '1123px';

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--font-render-hinting=none',
      ],
    });

    const page = await browser.newPage();

    // Set content and wait for fonts / layout to settle
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const pdfBuffer = await page.pdf({
      // Use explicit pixel dimensions matching LLM page div size.
      // This ensures 1 LLM page div (794×1123px) = exactly 1 PDF page.
      // Do NOT use format:'A4' — A4 at 96dpi is only ~841px tall, causing
      // each 1123px div to overflow into ~1.34 pages → many blank pages.
      width: pageW,
      height: pageH,
      printBackground: true,
      // Puppeteer header/footer overlay is DISABLED.
      // The new Andersen design embeds header/footer inline inside each
      // LLM page div — no Puppeteer overlay is needed or wanted.
      // Enabling it with an empty template creates a mandatory top margin
      // that pushes content down, causing the white-space-at-top bug.
      displayHeaderFooter: false,
      // Zero margins — LLM page divs have their own inner padding.
      margin: { top: '0', bottom: '0', left: '0', right: '0' },
    });

    await browser.close();
    browser = null;

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Length': pdfBuffer.length,
      'Cache-Control': 'no-cache',
    });
    res.send(pdfBuffer);

  } catch (err) {
    if (browser) {
      try { await browser.close(); } catch (_) {}
    }
    console.error('[pdf-render] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`[pdf-render] Listening on 127.0.0.1:${PORT} (secret configured: ${!!SECRET})`);
});
