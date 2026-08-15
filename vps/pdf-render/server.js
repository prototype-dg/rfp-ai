// /opt/pdf-service/server.js
// Node.js / Express / Puppeteer / marked PDF + HTML render service
// Runs on the sidecar VPS at 127.0.0.1:8001
// Proxied by nginx at https://api.cpc-rfp.website/pdf/
//
// v8 (2026-08-15) — Critical fixes for Puppeteer displayHeaderFooter
//
// ROOT CAUSES FIXED (diagnosed from user PDF via pdftoppm visual analysis):
//
//   1. TOPO SVG BLEEDING IN HEADER TEMPLATE:
//      The SVG had position:absolute;inset:0 but Puppeteer HF templates don't
//      clip absolutely-positioned children to the parent div's bounds.
//      The SVG expanded beyond the header band and overlapped body text.
//      FIX: Remove the topo SVG from the PDF header template entirely.
//      Use a solid #FFDB00 background div with a border-bottom accent line instead.
//
//   2. NO BACKGROUND COLORS IN HF TEMPLATES:
//      Chromium strips background-color from header/footer template elements.
//      The standard CSS rule (-webkit-print-color-adjust:exact) doesn't help
//      because it must be applied via a <style> tag INSIDE the template, not
//      as an inline style property.
//      FIX: Wrap each template in:
//        <style>* { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }</style>
//      This forces Chromium to render all background-colors inside the template.
//
//   3. HTML PREVIEW — MISSING FOOTER:
//      The .a-foot div at the bottom of .a-page had no guaranteed visibility.
//      FIX: Ensure the .a-page is a flex column (justify-content: space-between)
//      so header + body + footer are always laid out correctly.
//      Also fixed the preview footer to use the inline SVG wordmark (not a broken img tag).
//
// RENDERING STRATEGY (v8):
//   PREVIEW (/render-md-html): Full in-flow HTML, no position:fixed, iframes work.
//   PDF (/render-md-pdf):      Body-only HTML + displayHeaderFooter:true with compact
//                              inline-SVG templates that correctly print background colors.

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
  res.json({ status: 'ok', service: 'pdf-render', version: '9' });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: '9' });
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

// ── Inline SVG wordmark ──────────────────────────────────────────────────────
// Compact inline SVG — NO base64, < 400 chars.
// Black square glyph with yellow bars + "ANDERSEN" in Arial Bold.
function wordmarkSvg(width, height, textColor) {
  const tc = textColor || '#020303';
  return (
    '<svg viewBox="0 0 180 38" width="' + width + '" height="' + height + '" fill="none" xmlns="http://www.w3.org/2000/svg">' +
      '<rect x="0" y="3" width="24" height="24" rx="2" fill="' + tc + '"/>' +
      '<rect x="4" y="7" width="6" height="14" fill="#FFDB00"/>' +
      '<rect x="14" y="7" width="6" height="14" fill="#FFDB00"/>' +
      '<text x="30" y="23" font-family="Arial,Helvetica,sans-serif" font-weight="700"' +
        ' font-size="15" letter-spacing="1.5" fill="' + tc + '">ANDERSEN</text>' +
    '</svg>'
  );
}

// ── Shared typography CSS ─────────────────────────────────────────────────────
const MONO = "'Courier New', monospace";

const TYPOGRAPHY_CSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    font-family: Arial, 'Segoe UI', Helvetica, sans-serif;
    font-size: 10.5pt; line-height: 1.65; color: #020303;
  }
  h1 { font-size: 16pt; font-weight: 700; border-bottom: 2.5px solid #FFDB00; padding-bottom: 6pt; margin: 0 0 12pt; page-break-after: avoid; }
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
  pre  { background: #f3f4f6; padding: 10pt; border-radius: 4pt; margin: 8pt 0; page-break-inside: avoid; overflow-x: auto; }
  pre code { background: transparent; padding: 0; }
  strong { color: #111827; }
  a { color: #1d4ed8; }
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
`;

// ─────────────────────────────────────────────────────────────────────────────
// buildPreviewHtml(markdown, opts)
//
// Returns full standalone HTML with in-flow Andersen letterhead.
// Used by /render-md-html — displayed in the app's iframe preview panel.
//
// Layout (flex column, no position:fixed):
//   .a-page
//     .a-lockup   — white row: wordmark SVG + divider + tag line
//     .a-band     — yellow band (solid, no topo SVG — SVGs cause overflow in some iframe contexts)
//     .a-accent   — dotted rule separator
//     .a-body     — RFP content (flex-grow:1 so it fills space)
//     .a-foot     — navy footer with contact info + copyright
//
// HTML preview is a SINGLE "page" representation — not paginated.
// The app controls pagination only for PDF download.
// ─────────────────────────────────────────────────────────────────────────────
function buildPreviewHtml(markdown, opts) {
  opts = opts || {};
  const refNumber = opts.ref_number ? escHtml(opts.ref_number) : '';
  const rfpTitle  = opts.rfp_title  ? escHtml(opts.rfp_title)  : 'Request for Proposal';
  const email     = 'procurement@cpc-rfp.website';
  const year      = new Date().getFullYear();

  marked.setOptions({ gfm: true, breaks: false });
  const bodyHtml = marked.parse(markdown || '');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=794,initial-scale=1"/>
<title>${rfpTitle}</title>
<style>
${TYPOGRAPHY_CSS}

body {
  background: #EDEEF1;
  padding: 24px 16px 40px;
  margin: 0;
}

/* ── A4 page container ── */
.a-page {
  width: 794px;
  min-height: 1123px;
  margin: 0 auto;
  background: #fff;
  box-shadow: 0 8px 40px rgba(20,25,35,.15);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ── Letterhead: wordmark lockup ── */
.a-lockup {
  display: flex;
  align-items: center;
  padding: 12px 28px 10px;
  background: #fff;
  flex-shrink: 0;
}
.a-brand { display: flex; align-items: center; gap: 14px; }
.a-divider { width: 1px; height: 30px; background: #D8D8D8; flex-shrink: 0; }
.a-tag {
  font-family: ${MONO};
  font-size: 8px;
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
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 0 28px;
}
/* Topo SVG curves as background decoration */
.a-band svg.topo {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
.a-badge {
  font-family: ${MONO};
  font-size: 7.5px;
  letter-spacing: .24em;
  text-transform: uppercase;
  color: #020303;
  opacity: .6;
  position: relative;
  z-index: 1;
}

/* ── Dotted accent rule ── */
.a-accent {
  height: 20px;
  display: flex;
  align-items: center;
  padding: 0 28px;
  gap: 5px;
  border-bottom: 1px solid #E8E8E8;
  background: #fff;
  flex-shrink: 0;
}
.a-tick  { display: block; width: 5px; height: 5px; border-radius: 50%; background: #DADADA; flex-shrink: 0; }
.a-node  { background: #FFDB00 !important; width: 7px !important; height: 7px !important; }
.a-grow  { flex: 1; height: 1px; background: #E0E0E0; margin: 0 3px; }

/* ── RFP body content ── */
.a-body {
  padding: 24px 32px 32px;
  flex-grow: 1;
}

/* ── Navy footer ── */
.a-foot {
  background: #020D1C !important;
  color: #B8C0CB;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 28px;
  font-size: 8px;
  letter-spacing: .05em;
  flex-shrink: 0;
  -webkit-print-color-adjust: exact !important;
  print-color-adjust: exact !important;
}
.a-foot-cols { display: flex; gap: 24px; }
.a-foot-col .a-k {
  font-family: ${MONO};
  font-size: 7px;
  letter-spacing: .2em;
  text-transform: uppercase;
  color: #FFDB00;
  margin-bottom: 2px;
}
.a-foot-col .a-v { font-size: 8px; color: #D8DEE8; line-height: 1.5; }
.a-foot-right { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
.a-foot-mono {
  font-family: ${MONO};
  font-size: 7px;
  letter-spacing: .2em;
  text-transform: uppercase;
  color: #FFDB00;
}
</style>
</head>
<body>
<div class="a-page">

  <!-- Wordmark lockup -->
  <div class="a-lockup">
    <div class="a-brand">
      ${wordmarkSvg(116, 28, '#020303')}
      <div class="a-divider"></div>
      <div class="a-tag"><b>Software Engineering</b><br/>Group &middot; Global</div>
    </div>
  </div>

  <!-- Yellow topo band -->
  <div class="a-band">
    <svg class="topo" viewBox="0 0 794 48" preserveAspectRatio="none" fill="none">
      <path d="M-10 14 Q 100 4, 220 20 T 460 24 Q 580 30, 810 12" stroke="#020303" stroke-width="0.7" stroke-opacity="0.35"/>
      <path d="M-10 28 Q 120 14, 240 34 T 480 38 Q 620 44, 810 26" stroke="#020303" stroke-width="0.7" stroke-opacity="0.25"/>
      <path d="M-10 42 Q 140 26, 260 46 T 500 50 Q 640 58, 810 38" stroke="#020303" stroke-width="0.7" stroke-opacity="0.18"/>
      <circle cx="120" cy="16" r="2.5" fill="#020303" opacity="0.35"/>
      <circle cx="300" cy="30" r="2"   fill="#020303" opacity="0.3"/>
      <circle cx="460" cy="22" r="3"   fill="#020303" opacity="0.3"/>
      <circle cx="620" cy="40" r="2"   fill="#020303" opacity="0.25"/>
      <circle cx="740" cy="18" r="2.5" fill="#020303" opacity="0.3"/>
    </svg>
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
      ${wordmarkSvg(80, 18, '#ffffff')}
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
// Used by /render-md-pdf. Puppeteer injects header/footer via displayHeaderFooter.
//
// CRITICAL: No position:fixed elements here. Clean typography only.
// ─────────────────────────────────────────────────────────────────────────────
function buildPdfBodyHtml(markdown, opts) {
  opts = opts || {};
  const rfpTitle = opts.rfp_title ? escHtml(opts.rfp_title) : 'Request for Proposal';

  marked.setOptions({ gfm: true, breaks: false });
  const bodyHtml = marked.parse(markdown || '');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=794,initial-scale=1"/>
<title>${rfpTitle}</title>
<style>
${TYPOGRAPHY_CSS}
body {
  background: #fff;
  margin: 0;
  padding: 0;
}
.a-body { padding: 0; }
@page {
  size: A4;
  margin: 32mm 16mm 22mm 16mm;
}
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
// Returns { headerTemplate, footerTemplate } for Puppeteer displayHeaderFooter.
//
// CRITICAL RULES for Puppeteer HF templates (learned the hard way):
//
//   1. Background colors ARE stripped by Chromium unless you add a <style> tag
//      inside the template with:
//        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
//      This MUST be a <style> tag, not inline style properties.
//
//   2. position:absolute on children of the outer div causes overflow/bleed
//      past the template bounds. The topo SVG with position:absolute;inset:0
//      was the v7 bug — it bled over body text.
//      FIX: Use overflow:hidden on the outer div + clip SVG strictly inside.
//
//   3. No base64 images (silently truncated at ~32KB — Andersen logo = 40KB).
//      Use inline SVG only.
//
//   4. Margin values in page.pdf() must EXACTLY match the template height.
//      top margin = headerTemplate visual height
//      bottom margin = footerTemplate visual height
//
//   5. Font sizes in templates are independent of the page CSS.
//      Always specify font-family and font-size inline in template elements.
// ─────────────────────────────────────────────────────────────────────────────
function buildPuppeteerTemplates(opts) {
  opts = opts || {};
  const refBadge = opts.ref_number ? escHtml(opts.ref_number) : 'Andersen \u00b7 Est. 2007';
  const email     = 'procurement@cpc-rfp.website';
  const year      = new Date().getFullYear();

  // ── Header template ──────────────────────────────────────────────────────
  // Height: 28mm (matches margin.top in page.pdf())
  // Layout: white lockup row (wordmark + tag) + yellow band (solid fill + ref) + accent line
  //
  // IMPORTANT: The <style> tag at the top is REQUIRED for background-color to render.
  // overflow:hidden on the outer div prevents any child from bleeding out.
  const headerTemplate = `<style>
* { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; box-sizing: border-box; margin: 0; padding: 0; }
.hdr { width: 100%; height: 28mm; display: flex; flex-direction: column; overflow: hidden; background: #ffffff; }
.hdr-lockup { display: flex; align-items: center; padding: 4px 16mm 3px; flex-shrink: 0; background: #ffffff; border-bottom: 1px solid #f0f0f0; }
.hdr-brand { display: flex; align-items: center; gap: 10px; }
.hdr-divider { width: 1px; height: 22px; background: #D8D8D8; flex-shrink: 0; }
.hdr-tag { font-family: 'Courier New', monospace; font-size: 7px; letter-spacing: .2em; text-transform: uppercase; color: #556170; line-height: 1.6; }
.hdr-tag b { color: #020303; font-weight: 600; }
.hdr-band { flex: 1; background: #FFDB00; display: flex; align-items: center; justify-content: flex-end; padding: 0 16mm; overflow: hidden; }
.hdr-badge { font-family: 'Courier New', monospace; font-size: 7px; letter-spacing: .22em; text-transform: uppercase; color: #020303; opacity: .65; }
.hdr-accent { height: 5px; background: #ffffff; border-bottom: 1px solid #E0E0E0; flex-shrink: 0; }
</style>
<div class="hdr">
  <div class="hdr-lockup">
    <div class="hdr-brand">
      <svg viewBox="0 0 180 38" width="90" height="19" fill="none">
        <rect x="0" y="3" width="24" height="24" rx="2" fill="#020303"/>
        <rect x="4" y="7" width="6" height="14" fill="#FFDB00"/>
        <rect x="14" y="7" width="6" height="14" fill="#FFDB00"/>
        <text x="30" y="23" font-family="Arial,Helvetica,sans-serif" font-weight="700" font-size="15" letter-spacing="1.5" fill="#020303">ANDERSEN</text>
      </svg>
      <div class="hdr-divider"></div>
      <div class="hdr-tag"><b>Software Engineering</b><br/>Group &middot; Global</div>
    </div>
  </div>
  <div class="hdr-band">
    <span class="hdr-badge">${refBadge}</span>
  </div>
  <div class="hdr-accent"></div>
</div>`;

  // ── Footer template ──────────────────────────────────────────────────────
  // Height: 20mm (matches margin.bottom in page.pdf())
  // Layout: navy band with left (contact cols) and right (wordmark + page numbers)
  const footerTemplate = `<style>
* { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; box-sizing: border-box; margin: 0; padding: 0; }
.ftr { width: 100%; height: 20mm; background: #020D1C; display: flex; align-items: center; justify-content: space-between; padding: 0 16mm; overflow: hidden; }
.ftr-left { display: flex; gap: 20px; align-items: center; }
.ftr-col-k { font-family: 'Courier New', monospace; font-size: 6.5px; letter-spacing: .18em; text-transform: uppercase; color: #FFDB00; margin-bottom: 2px; }
.ftr-col-v { font-family: Arial, sans-serif; font-size: 7.5px; color: #D8DEE8; line-height: 1.4; }
.ftr-sep { width: 1px; height: 24px; background: #ffffff22; flex-shrink: 0; }
.ftr-right { display: flex; flex-direction: column; align-items: flex-end; gap: 3px; }
.ftr-copy { font-family: 'Courier New', monospace; font-size: 6.5px; letter-spacing: .15em; text-transform: uppercase; color: #FFDB00; }
.ftr-page { font-family: 'Courier New', monospace; font-size: 7px; letter-spacing: .1em; color: #9ca3af; }
</style>
<div class="ftr">
  <div class="ftr-left">
    <div>
      <div class="ftr-col-k">Contact</div>
      <div class="ftr-col-v">${email}</div>
    </div>
    <div class="ftr-sep"></div>
    <div>
      <div class="ftr-col-k">Offices</div>
      <div class="ftr-col-v">Warsaw &middot; Berlin &middot; London &middot; NY</div>
    </div>
  </div>
  <div class="ftr-right">
    <div class="ftr-copy">&copy; Andersen ${year}</div>
    <div class="ftr-page">Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>
  </div>
</div>`;

  return { headerTemplate, footerTemplate };
}

// ── POST /render-md-html ──────────────────────────────────────────────────
// Body: { markdown, logo_data_uri?, ref_number?, rfp_title? }
// Returns: text/html — full styled HTML for embedding in the UI preview iframe.
app.post('/render-md-html', requireAuth, (req, res) => {
  const { markdown, ref_number, rfp_title } = req.body || {};

  if (!markdown || typeof markdown !== 'string') {
    return res.status(400).json({ error: 'Missing required field: markdown' });
  }

  try {
    const html = buildPreviewHtml(markdown, { ref_number, rfp_title });
    res.set({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.send(html);
  } catch (err) {
    console.error('[render-md-html] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /render-md-pdf ───────────────────────────────────────────────────
// Body: { markdown, logo_data_uri?, ref_number?, rfp_title? }
// Returns: application/pdf — A4 PDF with Andersen letterhead on every page.
app.post('/render-md-pdf', requireAuth, async (req, res) => {
  const { markdown, ref_number, rfp_title } = req.body || {};

  if (!markdown || typeof markdown !== 'string') {
    return res.status(400).json({ error: 'Missing required field: markdown' });
  }

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

      // displayHeaderFooter:true — Puppeteer injects header+footer on EVERY page.
      // Templates use <style> tags for background color (required — inline styles alone don't work).
      // Templates are pure inline SVG, no base64 images.
      displayHeaderFooter: true,
      headerTemplate,
      footerTemplate,

      // Margins = template height + small breathing gap:
      //   top    32mm — header height (28mm) + 4mm gap before content
      //   bottom 22mm — footer height (20mm) + 2mm gap after content
      //   left/right 16mm — standard document margins
      margin: {
        top:    '32mm',
        bottom: '22mm',
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
// Accepts { markdown? } → new Puppeteer HF pipeline
// Accepts { html? }    → legacy path (no letterhead, custom dimensions)
app.post('/render-pdf', requireAuth, async (req, res) => {
  const { html, markdown, ref_number, rfp_title, page_width, page_height } = req.body || {};

  // ── Markdown path ─────────────────────────────────────────────────────────
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
        margin: { top: '32mm', bottom: '22mm', left: '16mm', right: '16mm' },
      });
      await browser.close();
      browser = null;
      res.set({ 'Content-Type': 'application/pdf', 'Content-Length': pdfBuffer.length, 'Cache-Control': 'no-cache' });
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
      width: pageW, height: pageH,
      printBackground: true,
      displayHeaderFooter: false,
      margin: { top: '0', bottom: '0', left: '0', right: '0' },
    });
    await browser.close();
    browser = null;
    res.set({ 'Content-Type': 'application/pdf', 'Content-Length': pdfBuffer.length, 'Cache-Control': 'no-cache' });
    res.send(pdfBuffer);
  } catch (err) {
    if (browser) { try { await browser.close(); } catch (_) {} }
    console.error('[render-pdf] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`[pdf-render] v9 listening on 127.0.0.1:${PORT} (secret: ${!!SECRET})`);
});
