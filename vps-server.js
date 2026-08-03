// /opt/pdf-service/server.js
// Node.js / Express / Puppeteer PDF render service
// Runs on the sidecar VPS at 127.0.0.1:8001
// Proxied by nginx at https://api.cpc-rfp.website/pdf/
//
// v2: Accept letterhead_data_uri (base64 data URI) instead of letterhead_url.
//     Puppeteer headerTemplate runs in an isolated context with no network access,
//     so external URLs always fail. A data URI is the only reliable approach.
//     Header div uses height:72mm; overflow:hidden to show only the top decorative
//     portion of the full-A4 letterhead background image.

'use strict';
const express = require('express');
const puppeteer = require('puppeteer');

const app = express();
app.use(express.json({ limit: '20mb' }));

const PORT = 8001;
const SECRET = process.env.PDF_SERVICE_SECRET || '';

// ── Health check ────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'pdf-render', version: '2' });
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
// Body: { html: string, letterhead_data_uri?: string }
// Returns: application/pdf bytes
app.post('/render-pdf', requireAuth, async (req, res) => {
  const { html, letterhead_data_uri } = req.body || {};

  if (!html || typeof html !== 'string') {
    return res.status(400).json({ error: 'Missing required field: html' });
  }

  // ── Build header template ────────────────────────────────────────────────
  // The letterhead image is a full A4 page (210mm × 297mm).
  // We display it at 210mm wide inside a 72mm-tall div with overflow:hidden
  // so only the top decorative portion (Arabic ornament + logo block) is shown.
  // margin.top = 72mm reserves this exact height on every page.
  //
  // IMPORTANT: Puppeteer headerTemplate runs in an isolated context with no
  // network access. External <img src="https://..."> always fails silently.
  // Only inline base64 data URIs work reliably. The Worker fetches the image
  // from R2 and sends it as a data URI in letterhead_data_uri.
  let headerHtml;
  if (letterhead_data_uri) {
    headerHtml = `
      <div style="margin:0; padding:0; width:210mm; height:72mm; overflow:hidden; line-height:0;">
        <img src="${letterhead_data_uri}"
             style="width:210mm; display:block; margin:0; padding:0; border:0;" />
      </div>`;
  } else {
    // No letterhead available — use an empty placeholder div.
    // margin.top:72mm still reserves space so content doesn't collide with the top.
    headerHtml = `<div style="width:210mm; height:72mm;"></div>`;
  }

  // ── Build footer template ────────────────────────────────────────────────
  // Puppeteer injects <span class="pageNumber"> and <span class="totalPages">
  // automatically when those class names appear in footerTemplate.
  const footerHtml = `
    <div style="width:210mm; text-align:center; font-family:Arial,Calibri,'Segoe UI',sans-serif;
                font-size:9pt; color:#888888; padding:0 25mm; box-sizing:border-box;">
      Crown Prince&rsquo;s Court &mdash; Confidential &nbsp;|&nbsp;
      Page <span class="pageNumber"></span> of <span class="totalPages"></span>
    </div>`;

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
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: headerHtml,
      footerTemplate: footerHtml,
      margin: {
        top: '72mm',    // matches headerTemplate height — reserves space for letterhead
        bottom: '18mm', // reserves space for footerTemplate
        left: '0',
        right: '0',
      },
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
