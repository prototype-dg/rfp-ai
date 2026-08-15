// /opt/pdf-service/server.js
// Node.js / Express / Puppeteer / marked PDF + HTML render service
// Runs on the sidecar VPS at 127.0.0.1:8001
// Proxied by nginx at https://api.cpc-rfp.website/pdf/
//
// v7 (2026-08-15) — Split preview / PDF rendering strategy
//
//   PREVIEW mode (/render-md-html, preview:true):
//     - Returns full standalone HTML with in-flow letterhead at top,
//       content in the middle, footer at the bottom.
//     - NO position:fixed. Works correctly in iframes and scroll views.
//     - Single .a-page div, 794px wide, with box-shadow for A4 feel.
//
//   PDF mode (/render-md-pdf, preview:false):
//     - Returns ONLY the body content — NO letterhead structure in HTML.
//     - Puppeteer injects header/footer via displayHeaderFooter:true
//       with compact INLINE-SVG templates (no base64 images, <3KB each).
//     - Margin: top 26mm (header space), bottom 18mm (footer space).
//
//   WHY NOT position:fixed for PDF?
//     Chromium's Skia PDF backend places position:fixed elements relative to
//     page-1's viewport coordinates and does NOT repeat them on subsequent pages.
//     This causes header/footer to appear only on page 1 and at wrong positions.
//     pdftotext -layout confirmed: letterhead text bled into body paragraphs (v56).
//
//   WHY NOT base64 PNG in Puppeteer HF templates?
//     Puppeteer silently truncates headerTemplate strings > ~32KB.
//     The Andersen logo base64 PNG is 40,642 chars — truncated mid-string → broken template.
//     Inline SVG wordmark is ~400 chars and works reliably (v57).

'use strict';
const express   = require('express');
const puppeteer = require('puppeteer');
const { marked } = require('marked');

const app = express();
app.use(express.json({ limit: '30mb' }));

const PORT   = 8001;
const SECRET = process.env.PDF_SERVICE_SECRET || '';

// ── Health check ────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'pdf-render', version: '7' });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: '7' });
});

// ── Auth middleware ──────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  if (!SECRET) return next();
  const auth  = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (token !== SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// ── escHtml(str) — minimal HTML entity escaping ───────────────────────────
function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── launchBrowser() — shared Puppeteer launch config ──────────────────────
function launchBrowser() {
  return puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--font-render-hinting=none',
    ],
  });
}

// ── Shared typography CSS (used in both preview and PDF body) ────────────
const MONO = "'Courier New', monospace";

const TYPOGRAPHY_CSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    font-family: Arial, 'Segoe UI', Helvetica, sans-serif;
    font-size: 10.5pt; line-height: 1.65; color: #020303;
  }
  h1 { font-size: 16pt; font-weight: 700; border-bottom: 2px solid #FFDB00; padding-bottom: 6pt; margin: 0 0 12pt; page-break-after: avoid; }
  h2 { font-size: 12pt; font-weight: 700; color: #020303; border-bottom: 1px solid #E0E0E0; margin: 18pt 0 6pt; padding-bottom: 3pt; page-break-after: avoid; }
  h3 { font-size: 10.5pt; font-weight: 700; color: #3A3E45; margin: 12pt 0 4pt; page-break-after: avoid; }
  h4 { font-size: 10pt; font-weight: 600; color: #556170; margin: 10pt 0 3pt; }
  p  { margin: 0 0 8pt; orphans: 3; widows: 3; }
  ul, ol { margin: 0 0 8pt; padding-left: 20pt; }
  li { margin-bottom: 3pt; page-break-inside: avoid; orphans: 2; widows: 2; }
  hr { border: none; border-top: 2px solid #FFDB00; margin: 16pt 0; }
  table { width: 100%; border-collapse: collapse; font-size: 9.5pt; margin: 8pt 0 12pt; page-break-inside: avoid; }
  thead { display: table-header-group; }
  th { background: #020D1C; color: #FFDB00; font-weight: 700; padding: 6pt 10pt; text-align: left; border: 1px solid #020D1C; }
  td { padding: 5pt 10pt; border: 1px solid #E0E0E0; vertical-align: top; }
  tr { page-break-inside: avoid; orphans: 2; widows: 2; }
  tr:nth-child(even) td { background: #f9fafb; }
  blockquote { border-left: 4px solid #FFDB00; margin: 8pt 0; padding: 6pt 12pt; background: #fffef0; page-break-inside: avoid; }
  code { font-family: ${MONO}; font-size: 9pt; background: #f3f4f6; padding: 1pt 3pt; border-radius: 2pt; }
  pre  { background: #f3f4f6; padding: 10pt; border-radius: 4pt; margin: 8pt 0; page-break-inside: avoid; }
  pre code { background: transparent; padding: 0; }
  strong { color: #111827; }
  a { color: #1d4ed8; }
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
`;

// ── Topo SVG paths — reused in both preview header and PDF HF template ──
const TOPO_SVG_PATHS = `
  <path d="M-10 14 Q 100 4, 220 20 T 460 24 Q 580 30, 810 12" stroke="#020303" stroke-width="0.7" stroke-opacity="0.55"/>
  <path d="M-10 28 Q 120 14, 240 34 T 480 38 Q 620 44, 810 26" stroke="#020303" stroke-width="0.7" stroke-opacity="0.45"/>
  <path d="M-10 42 Q 140 26, 260 46 T 500 50 Q 640 58, 810 38" stroke="#020303" stroke-width="0.7" stroke-opacity="0.35"/>
  <circle cx="120" cy="16"  r="3"   fill="#020303"/>
  <circle cx="300" cy="34"  r="2.5" fill="#020303"/>
  <circle cx="460" cy="24"  r="3.5" fill="#020303"/>
  <circle cx="620" cy="44"  r="2.5" fill="#020303"/>
  <circle cx="740" cy="20"  r="3"   fill="#020303"/>`;

// ── Inline SVG wordmark — used in PDF HF templates (NO base64, ~400 chars) ─
// Black square glyph + "ANDERSEN" text in Arial bold.
// Must stay under ~3KB total per template or Puppeteer may truncate it.
function wordmarkSvg(width, height) {
  return (
    '<svg viewBox="0 0 160 36" width="' + width + '" height="' + height + '" fill="none" xmlns="http://www.w3.org/2000/svg">' +
      '<rect x="0" y="2" width="22" height="22" rx="2" fill="#020303"/>' +
      '<rect x="3.5" y="5.5" width="6" height="13" fill="#FFDB00"/>' +
      '<rect x="12.5" y="5.5" width="6" height="13" fill="#FFDB00"/>' +
      '<text x="28" y="20" font-family="Arial,Helvetica,sans-serif" font-weight="700"' +
        ' font-size="14" letter-spacing="1.5" fill="#020303">ANDERSEN</text>' +
    '</svg>'
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// buildPreviewHtml(markdown, opts)
//
// Returns a full standalone HTML document with in-flow Andersen letterhead.
// Used by /render-md-html for the in-app iframe preview.
//
// Structure:
//   <body>
//     <div class="a-page">
//       <div class="a-lockup">   — wordmark + divider + tag line
//       <div class="a-band">    — yellow topo band
//       <div class="a-accent">  — dotted rule
//       <div class="a-body">    — markdown content
//       <div class="a-foot">    — navy footer
//     </div>
//   </body>
//
// NO position:fixed, NO @page rules. Scrolls normally in an iframe.
// ─────────────────────────────────────────────────────────────────────────────
function buildPreviewHtml(markdown, opts) {
  opts = opts || {};
  const refNumber = opts.ref_number ? escHtml(opts.ref_number) : '';
  const rfpTitle  = opts.rfp_title  ? escHtml(opts.rfp_title)  : 'Request for Proposal';
  const email     = 'procurement@cpc-rfp.website';
  const year      = new Date().getFullYear();

  marked.setOptions({ gfm: true, breaks: false });
  const bodyHtml = marked.parse(markdown || '');

  const previewCss = `
    body {
      background: #EDEEF1;
      padding: 24px 0 40px;
      margin: 0;
    }
    .a-page {
      width: 794px;
      margin: 0 auto;
      background: #fff;
      box-shadow: 0 12px 48px rgba(20,25,35,.18);
      overflow: hidden;
    }

    /* ── Letterhead: wordmark lockup row ── */
    .a-lockup {
      display: flex;
      align-items: center;
      padding: 10px 24px 8px;
      background: #fff;
      border-bottom: 1px solid #f0f0f0;
    }
    .a-brand { display: flex; align-items: center; gap: 14px; }
    .a-divider { width: 1px; height: 28px; background: #E0E0E0; }
    .a-tag {
      font-family: ${MONO};
      font-size: 8.5px;
      letter-spacing: .22em;
      text-transform: uppercase;
      color: #556170;
      line-height: 1.7;
    }
    .a-tag b { color: #020303; font-weight: 600; }

    /* ── Yellow topo band ── */
    .a-band {
      height: 48px;
      background: #FFDB00;
      position: relative;
      overflow: hidden;
    }
    .a-band svg {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
    }
    .a-badge {
      position: absolute;
      top: 50%;
      transform: translateY(-50%);
      right: 24px;
      font-family: ${MONO};
      font-size: 7.5px;
      letter-spacing: .24em;
      text-transform: uppercase;
      color: #020303;
      opacity: .6;
    }

    /* ── Dotted accent rule ── */
    .a-accent {
      height: 22px;
      display: flex;
      align-items: center;
      padding: 0 24px;
      gap: 5px;
      border-bottom: 1px solid #E8E8E8;
      background: #fff;
    }
    .a-tick  { display: block; width: 5px; height: 5px; border-radius: 50%; background: #DADADA; flex-shrink: 0; }
    .a-node  { background: #FFDB00 !important; width: 7px !important; height: 7px !important; }
    .a-grow  { flex: 1; height: 1px; background: #E0E0E0; margin: 0 3px; }

    /* ── Body content ── */
    .a-body {
      padding: 24px 32px 32px;
    }

    /* ── Navy footer ── */
    .a-foot {
      background: #020D1C;
      color: #B8C0CB;
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 24px;
      font-size: 8.5px;
      letter-spacing: .05em;
      margin-top: 8px;
    }
    .a-foot-cols { display: flex; gap: 24px; }
    .a-foot-col .a-k {
      font-family: ${MONO};
      font-size: 7.5px;
      letter-spacing: .2em;
      text-transform: uppercase;
      color: #FFDB00;
      margin-bottom: 2px;
    }
    .a-foot-col .a-v { font-size: 8.5px; color: #D8DEE8; line-height: 1.5; }
    .a-foot-right { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
    .a-foot-mono {
      font-family: ${MONO};
      font-size: 7.5px;
      letter-spacing: .2em;
      text-transform: uppercase;
      color: #FFDB00;
    }
  `;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=794,initial-scale=1"/>
<title>${rfpTitle}</title>
<style>
${TYPOGRAPHY_CSS}
${previewCss}
</style>
</head>
<body>
<div class="a-page">

  <!-- Wordmark lockup -->
  <div class="a-lockup">
    <div class="a-brand">
      ${wordmarkSvg(120, 28)}
      <div class="a-divider"></div>
      <div class="a-tag"><b>Software Engineering</b><br/>Group &middot; Global</div>
    </div>
  </div>

  <!-- Yellow topo band -->
  <div class="a-band">
    <svg viewBox="0 0 794 48" preserveAspectRatio="none" fill="none">${TOPO_SVG_PATHS}</svg>
    <div class="a-badge">${refNumber ? refNumber : 'Andersen &middot; Est. 2007'}</div>
  </div>

  <!-- Dotted accent rule -->
  <div class="a-accent">
    <span class="a-tick"></span><span class="a-tick"></span>
    <span class="a-tick a-node"></span><span class="a-tick"></span>
    <span class="a-tick"></span><span class="a-tick"></span>
    <span class="a-tick a-node"></span><span class="a-tick"></span>
    <span class="a-grow"></span>
    <span class="a-tick"></span><span class="a-tick a-node"></span>
    <span class="a-tick"></span><span class="a-tick"></span>
    <span class="a-tick"></span><span class="a-tick a-node"></span>
    <span class="a-tick"></span><span class="a-tick"></span>
  </div>

  <!-- RFP content -->
  <div class="a-body">
    ${bodyHtml}
  </div>

  <!-- Navy footer -->
  <div class="a-foot">
    <div class="a-foot-cols">
      <div class="a-foot-col">
        <div class="a-k">Web</div>
        <div class="a-v">andersenlab.com</div>
      </div>
      <div class="a-foot-col">
        <div class="a-k">Contact</div>
        <div class="a-v">${email}</div>
      </div>
      <div class="a-foot-col">
        <div class="a-k">Offices</div>
        <div class="a-v">Warsaw &middot; Berlin &middot; London &middot; New York</div>
      </div>
    </div>
    <div class="a-foot-right">
      ${wordmarkSvg(80, 18)}
      <div class="a-foot-mono">&copy; Andersen ${year}</div>
    </div>
  </div>

</div>
</body>
</html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// buildPdfBodyHtml(markdown, opts)
//
// Returns ONLY the body content — no letterhead structure.
// Used by /render-md-pdf and /render-pdf (markdown path).
// Puppeteer injects header/footer via displayHeaderFooter:true.
//
// IMPORTANT: This HTML must NOT contain any position:fixed elements.
// The header/footer are injected by Puppeteer into @page margin space.
// ─────────────────────────────────────────────────────────────────────────────
function buildPdfBodyHtml(markdown, opts) {
  opts = opts || {};
  const rfpTitle = opts.rfp_title ? escHtml(opts.rfp_title) : 'Request for Proposal';

  marked.setOptions({ gfm: true, breaks: false });
  const bodyHtml = marked.parse(markdown || '');

  const pdfCss = `
    body {
      background: #fff;
      margin: 0;
      padding: 0;
    }
    .a-body {
      padding: 0;
    }
    @page {
      size: A4;
      margin: 26mm 16mm 18mm 16mm;
    }
  `;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=794,initial-scale=1"/>
<title>${rfpTitle}</title>
<style>
${TYPOGRAPHY_CSS}
${pdfCss}
</style>
</head>
<body>
<div class="a-body">
  ${bodyHtml}
</div>
</body>
</html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// buildPuppeteerTemplates(opts)
//
// Returns { headerTemplate, footerTemplate } for Puppeteer's displayHeaderFooter.
//
// Rules for Puppeteer HF templates:
//   - Must be self-contained HTML strings (inline styles only, no external CSS)
//   - NO base64 images (silently truncated at ~32KB — Andersen PNG is 40KB)
//   - Use inline SVG for logos (compact, reliable)
//   - Puppeteer injects special classes: pageNumber, totalPages, date, title, url
//   - The outer div should be exactly the full header/footer height
//   - width:100% and a fixed height is required for correct rendering
// ─────────────────────────────────────────────────────────────────────────────
function buildPuppeteerTemplates(opts) {
  opts = opts || {};
  const refNumber = opts.ref_number ? escHtml(opts.ref_number) : 'Andersen &middot; Est. 2007';
  const email     = 'procurement@cpc-rfp.website';
  const year      = new Date().getFullYear();

  // ── Header template — yellow topo band with inline SVG wordmark ──────────
  // Total height = 26mm (matches margin.top in page.pdf())
  // Layout: full-width yellow band with topo SVG background, wordmark left, ref right
  const headerTemplate = (
    '<div style="width:100%;height:26mm;background:#FFDB00;position:relative;' +
      'overflow:hidden;display:flex;align-items:center;justify-content:space-between;' +
      'padding:0 16mm;box-sizing:border-box;font-family:Arial,sans-serif;">' +
      // Topo SVG background
      '<svg style="position:absolute;inset:0;width:100%;height:100%;display:block"' +
        ' viewBox="0 0 794 74" preserveAspectRatio="none" fill="none">' +
        TOPO_SVG_PATHS +
      '</svg>' +
      // Wordmark (left) — inline SVG, NO base64
      '<div style="position:relative;z-index:1;display:flex;align-items:center;gap:10px;">' +
        '<svg viewBox="0 0 160 36" width="110" height="25" fill="none"' +
          ' xmlns="http://www.w3.org/2000/svg">' +
          '<rect x="0" y="2" width="22" height="22" rx="2" fill="#020303"/>' +
          '<rect x="3.5" y="5.5" width="6" height="13" fill="#FFDB00"/>' +
          '<rect x="12.5" y="5.5" width="6" height="13" fill="#FFDB00"/>' +
          '<text x="28" y="20" font-family="Arial,Helvetica,sans-serif" font-weight="700"' +
            ' font-size="14" letter-spacing="1.5" fill="#020303">ANDERSEN</text>' +
        '</svg>' +
        '<span style="font-family:\'Courier New\',monospace;font-size:7pt;letter-spacing:.2em;' +
          'text-transform:uppercase;color:#020303;opacity:.6;">Software Engineering</span>' +
      '</div>' +
      // Reference number (right)
      '<span style="position:relative;z-index:1;font-family:\'Courier New\',monospace;' +
        'font-size:7pt;letter-spacing:.2em;text-transform:uppercase;color:#020303;opacity:.55;">' +
        refNumber +
      '</span>' +
    '</div>'
  );

  // ── Footer template — navy band with contact info and page numbers ────────
  // Total height = 18mm (matches margin.bottom in page.pdf())
  const footerTemplate = (
    '<div style="width:100%;height:18mm;background:#020D1C;' +
      'display:flex;align-items:center;justify-content:space-between;' +
      'padding:0 16mm;box-sizing:border-box;font-family:Arial,sans-serif;">' +
      // Left: copyright + email
      '<span style="font-family:\'Courier New\',monospace;font-size:7pt;' +
        'letter-spacing:.08em;color:#9ca3af;">' +
        '&copy; Andersen ' + year + ' &middot; ' + email +
      '</span>' +
      // Right: page numbers (Puppeteer injects pageNumber / totalPages)
      '<span style="font-family:\'Courier New\',monospace;font-size:7pt;' +
        'letter-spacing:.1em;color:#FFDB00;">' +
        'Page <span class="pageNumber"></span> of <span class="totalPages"></span>' +
      '</span>' +
    '</div>'
  );

  return { headerTemplate, footerTemplate };
}

// ── POST /render-md-html ──────────────────────────────────────────────────
// Body: { markdown, logo_data_uri?, ref_number?, rfp_title? }
// Returns: text/html — full styled HTML for embedding in the UI preview iframe.
// Does NOT invoke Puppeteer — pure server-side marked + template rendering.
app.post('/render-md-html', requireAuth, (req, res) => {
  const { markdown, ref_number, rfp_title } = req.body || {};

  if (!markdown || typeof markdown !== 'string') {
    return res.status(400).json({ error: 'Missing required field: markdown' });
  }

  try {
    const html = buildPreviewHtml(markdown, { ref_number, rfp_title });

    res.set({
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache',
    });
    res.send(html);
  } catch (err) {
    console.error('[render-md-html] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /render-md-pdf ───────────────────────────────────────────────────
// Body: { markdown, logo_data_uri?, ref_number?, rfp_title? }
// Returns: application/pdf — A4 PDF with Andersen letterhead via Puppeteer HF.
app.post('/render-md-pdf', requireAuth, async (req, res) => {
  const { markdown, ref_number, rfp_title } = req.body || {};

  if (!markdown || typeof markdown !== 'string') {
    return res.status(400).json({ error: 'Missing required field: markdown' });
  }

  // Build body-only HTML (no letterhead) — Puppeteer injects header/footer
  const bodyHtml = buildPdfBodyHtml(markdown, { ref_number, rfp_title });

  // Build compact inline-SVG Puppeteer HF templates
  const { headerTemplate, footerTemplate } = buildPuppeteerTemplates({ ref_number });

  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();

    // networkidle0 ensures all content is rendered before PDF generation
    await page.setContent(bodyHtml, { waitUntil: 'networkidle0' });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,

      // displayHeaderFooter:true — Puppeteer injects header/footer on EVERY page.
      // Templates are compact inline SVG (no base64), well under the 32KB limit.
      displayHeaderFooter: true,
      headerTemplate,
      footerTemplate,

      // Margins create space for the injected header/footer bands:
      //   top    26mm — matches header band height (yellow topo band)
      //   bottom 18mm — matches footer band height (navy band)
      //   left/right 16mm — standard document margins
      margin: {
        top:    '26mm',
        bottom: '18mm',
        left:   '16mm',
        right:  '16mm',
      },
    });

    await browser.close();
    browser = null;

    const safeFilename = escHtml(ref_number || 'document').replace(/[^a-zA-Z0-9_\-]/g, '_');
    res.set({
      'Content-Type':        'application/pdf',
      'Content-Length':      pdfBuffer.length,
      'Content-Disposition': `attachment; filename="Andersen_RFP_${safeFilename}.pdf"`,
      'Cache-Control':       'no-cache',
    });
    res.send(pdfBuffer);

  } catch (err) {
    if (browser) { try { await browser.close(); } catch (_) {} }
    console.error('[render-md-pdf] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /render-pdf (legacy) ─────────────────────────────────────────────
// Body: { html?, markdown?, logo_data_uri?, ref_number?, rfp_title?, page_width?, page_height? }
// If markdown is present → uses the new Puppeteer HF pipeline (same as /render-md-pdf).
// If only html is present → legacy path (no letterhead, custom dimensions).
// Returns: application/pdf bytes
app.post('/render-pdf', requireAuth, async (req, res) => {
  const { html, markdown, ref_number, rfp_title, page_width, page_height } = req.body || {};

  // ── Markdown path — new A4 Puppeteer HF pipeline ─────────────────────────
  if (markdown && typeof markdown === 'string') {
    const bodyHtml = buildPdfBodyHtml(markdown, { ref_number, rfp_title });
    const { headerTemplate, footerTemplate } = buildPuppeteerTemplates({ ref_number });

    let browser;
    try {
      browser = await launchBrowser();
      const page = await browser.newPage();
      await page.setContent(bodyHtml, { waitUntil: 'networkidle0' });
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate,
        footerTemplate,
        margin: { top: '26mm', bottom: '18mm', left: '16mm', right: '16mm' },
      });
      await browser.close();
      browser = null;
      res.set({
        'Content-Type':   'application/pdf',
        'Content-Length': pdfBuffer.length,
        'Cache-Control':  'no-cache',
      });
      return res.send(pdfBuffer);
    } catch (err) {
      if (browser) { try { await browser.close(); } catch (_) {} }
      console.error('[render-pdf/markdown] Error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  // ── Legacy HTML path ──────────────────────────────────────────────────────
  if (!html || typeof html !== 'string') {
    return res.status(400).json({ error: 'Missing required field: html or markdown' });
  }

  const pageW = page_width  || '794px';
  const pageH = page_height || '1123px';

  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({
      width: pageW,
      height: pageH,
      printBackground: true,
      displayHeaderFooter: false,
      margin: { top: '0', bottom: '0', left: '0', right: '0' },
    });
    await browser.close();
    browser = null;
    res.set({
      'Content-Type':   'application/pdf',
      'Content-Length': pdfBuffer.length,
      'Cache-Control':  'no-cache',
    });
    res.send(pdfBuffer);
  } catch (err) {
    if (browser) { try { await browser.close(); } catch (_) {} }
    console.error('[render-pdf] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`[pdf-render] v7 listening on 127.0.0.1:${PORT} (secret: ${!!SECRET})`);
});
