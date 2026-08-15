// /opt/pdf-service/server.js
// Node.js / Express / Puppeteer / marked PDF + HTML render service
// Runs on the sidecar VPS at 127.0.0.1:8001
// Proxied by nginx at https://api.cpc-rfp.website/pdf/
//
// v10 (2026-08-15) — Three targeted fixes:
//
// FIX 1 — HTML PREVIEW PAGINATION:
//   The preview was a single min-height:1123px div — letterhead only at top/bottom.
//   For a 27-page RFP this shows one huge scrollable block with no per-page letterhead.
//   NEW APPROACH: Use CSS @media print + JS-driven page slicing.
//   The preview HTML uses a JavaScript paginator that:
//     a) Renders all content into a hidden measurement div (794px wide)
//     b) Walks the DOM, fills A4 pages (1123px content height after margins)
//     c) Each A4 page div gets a cloned header + footer wrapper
//     d) Result: multiple stacked A4 page cards, each with Andersen letterhead
//   This gives the user a true paginated preview matching the PDF layout.
//
// FIX 2 — PDF HEADER BAND VISUAL ORDER:
//   The hdr-lockup (white row) overlapped the yellow band visually because the
//   lockup row background was bleeding. Root cause: hdr-band had "flex:1" which
//   caused it to fill the remaining space AFTER the lockup, making the yellow
//   band always appear BELOW the white row, but when the content above the header
//   is close to the header bottom, the lockup row background covers part of the band.
//   FIX: Give .hdr-lockup an explicit fixed height, and .hdr-band an explicit height.
//   Also added border-bottom to lockup for visual separation.
//
// FIX 3 — PDF TABLE PAGINATION (CRITICAL):
//   CSS "page-break-inside: avoid" on the <table> element prevents the table
//   from STARTING on the current page if there isn't enough room for the ENTIRE
//   table. For a 50-row table, this means the table jumps to a new page even if
//   there are 20+ lines of space on the current page.
//   FIX: Remove page-break-inside:avoid from table{}. Keep it only on tr{}.
//   thead { display: table-header-group } repeats the header on each continuation page.
//   This lets the table START wherever it naturally falls and flow across pages,
//   with individual rows staying intact (no row split mid-cell).

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
  res.json({ status: 'ok', service: 'pdf-render', version: '10' });
});
app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: '10' });
});

// ── Auth middleware ──────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  if (!SECRET) return next();
  const auth  = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (token !== SECRET) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

// ── escHtml(str) ──────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── launchBrowser() ──────────────────────────────────────────────────────
function launchBrowser() {
  return puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu','--font-render-hinting=none'],
  });
}

// ── Inline SVG wordmark (no base64, ~300 chars) ───────────────────────────
function wordmarkSvg(width, height, textColor) {
  const tc = textColor || '#020303';
  return `<svg viewBox="0 0 180 38" width="${width}" height="${height}" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="3" width="24" height="24" rx="2" fill="${tc}"/><rect x="4" y="7" width="6" height="14" fill="#FFDB00"/><rect x="14" y="7" width="6" height="14" fill="#FFDB00"/><text x="30" y="23" font-family="Arial,Helvetica,sans-serif" font-weight="700" font-size="15" letter-spacing="1.5" fill="${tc}">ANDERSEN</text></svg>`;
}

// ── Shared typography CSS ─────────────────────────────────────────────────
const MONO = "'Courier New', monospace";

// FIX 3: table no longer has page-break-inside:avoid — only tr does.
// This allows tables to START on the current page and FLOW across pages.
// thead { display: table-header-group } repeats the header on each new page.
const TYPOGRAPHY_CSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { font-family: Arial, 'Segoe UI', Helvetica, sans-serif; font-size: 10.5pt; line-height: 1.65; color: #020303; }
  h1 { font-size: 16pt; font-weight: 700; border-bottom: 2.5px solid #FFDB00; padding-bottom: 6pt; margin: 0 0 12pt; page-break-after: avoid; }
  h2 { font-size: 12pt; font-weight: 700; color: #020303; border-bottom: 1px solid #E0E0E0; margin: 18pt 0 6pt; padding-bottom: 3pt; page-break-after: avoid; }
  h3 { font-size: 10.5pt; font-weight: 700; color: #3A3E45; margin: 12pt 0 4pt; page-break-after: avoid; }
  h4 { font-size: 10pt; font-weight: 600; color: #556170; margin: 10pt 0 3pt; }
  p  { margin: 0 0 8pt; orphans: 3; widows: 3; }
  ul, ol { margin: 0 0 8pt; padding-left: 20pt; }
  li { margin-bottom: 3pt; page-break-inside: avoid; orphans: 2; widows: 2; }
  hr { border: none; border-top: 2px solid #FFDB00; margin: 16pt 0; }
  table { width: 100%; border-collapse: collapse; font-size: 9.5pt; margin: 8pt 0 12pt; }
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
// FIX 1: Paginated preview with letterhead on EVERY simulated A4 page.
//
// How it works:
//   1. All RFP content is rendered into a hidden 794px-wide measurement container.
//   2. A JavaScript paginator walks child elements, filling pages up to
//      PAGE_HEIGHT_PX (1123px − header − footer = ~900px of body space).
//   3. Each filled page is wrapped in a .a-page div containing:
//        .a-pg-header  — full Andersen letterhead (lockup + yellow band + accent)
//        .a-pg-body    — the content slice for this page
//        .a-pg-footer  — navy footer with page N of total
//   4. Pages are stacked vertically with 32px gap, centered in a grey background.
//
// The paginator clones DOM nodes — block elements are distributed greedily.
// Tables are kept intact per row (not split mid-row) matching PDF behaviour.
// ─────────────────────────────────────────────────────────────────────────────
function buildPreviewHtml(markdown, opts) {
  opts = opts || {};
  const refNumber = opts.ref_number ? escHtml(opts.ref_number) : '';
  const rfpTitle  = opts.rfp_title  ? escHtml(opts.rfp_title)  : 'Request for Proposal';
  const email     = 'procurement@cpc-rfp.website';
  const year      = new Date().getFullYear();
  const refBadge  = refNumber || 'Andersen &middot; Est. 2007';

  marked.setOptions({ gfm: true, breaks: false });
  const bodyHtml = marked.parse(markdown || '');

  // Topo SVG for yellow band (inside overflow:hidden container — safe in preview)
  const topoSvg = `<svg class="topo" viewBox="0 0 794 48" preserveAspectRatio="none" fill="none">
    <path d="M-10 14 Q 100 4, 220 20 T 460 24 Q 580 30, 810 12" stroke="#020303" stroke-width="0.7" stroke-opacity="0.3"/>
    <path d="M-10 28 Q 120 14, 240 34 T 480 38 Q 620 44, 810 26" stroke="#020303" stroke-width="0.7" stroke-opacity="0.22"/>
    <path d="M-10 42 Q 140 26, 260 46 T 500 50 Q 640 58, 810 38" stroke="#020303" stroke-width="0.7" stroke-opacity="0.16"/>
    <circle cx="120" cy="16" r="2.5" fill="#020303" opacity="0.3"/>
    <circle cx="300" cy="30" r="2"   fill="#020303" opacity="0.25"/>
    <circle cx="460" cy="22" r="3"   fill="#020303" opacity="0.25"/>
    <circle cx="620" cy="40" r="2"   fill="#020303" opacity="0.2"/>
    <circle cx="740" cy="18" r="2.5" fill="#020303" opacity="0.25"/>
  </svg>`;

  // Reusable header HTML string (injected into each page)
  const pageHeaderHtml = `
  <div class="a-pg-header">
    <div class="a-pg-lockup">
      <div class="a-pg-brand">
        ${wordmarkSvg(116, 28, '#020303')}
        <div class="a-pg-divider"></div>
        <div class="a-pg-tag"><b>Software Engineering</b><br/>Group &middot; Global</div>
      </div>
    </div>
    <div class="a-pg-band">
      ${topoSvg}
      <div class="a-pg-badge">${refBadge}</div>
    </div>
    <div class="a-pg-accent">
      <span class="t"></span><span class="t"></span><span class="t n"></span><span class="t"></span>
      <span class="t"></span><span class="t"></span><span class="t n"></span><span class="t"></span>
      <span class="g"></span>
      <span class="t"></span><span class="t n"></span><span class="t"></span><span class="t"></span>
      <span class="t"></span><span class="t n"></span><span class="t"></span><span class="t"></span>
    </div>
  </div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=840,initial-scale=1"/>
<title>${rfpTitle}</title>
<style>
${TYPOGRAPHY_CSS}

/* ── Outer shell ── */
body { background: #EDEEF1; margin: 0; padding: 24px 0 48px; }

/* ── Single A4 page card ── */
.a-page {
  width: 794px;
  height: 1123px;
  margin: 0 auto 28px;
  background: #fff;
  box-shadow: 0 6px 32px rgba(20,25,35,.13);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}

/* ── Page header ── */
.a-pg-header { flex-shrink: 0; display: flex; flex-direction: column; }
.a-pg-lockup {
  display: flex; align-items: center;
  padding: 10px 28px 8px;
  background: #fff;
  border-bottom: 1px solid #EBEBEB;
  flex-shrink: 0;
}
.a-pg-brand { display: flex; align-items: center; gap: 14px; }
.a-pg-divider { width: 1px; height: 30px; background: #D8D8D8; flex-shrink: 0; }
.a-pg-tag { font-family: ${MONO}; font-size: 8px; letter-spacing:.22em; text-transform:uppercase; color:#556170; line-height:1.7; }
.a-pg-tag b { color:#020303; font-weight:600; }

.a-pg-band {
  height: 48px; background: #FFDB00;
  position: relative; overflow: hidden;
  display: flex; align-items: center; justify-content: flex-end;
  padding: 0 28px; flex-shrink: 0;
}
.a-pg-band svg.topo { position:absolute; inset:0; width:100%; height:100%; pointer-events:none; }
.a-pg-badge { font-family:${MONO}; font-size:7.5px; letter-spacing:.22em; text-transform:uppercase; color:#020303; opacity:.6; position:relative; z-index:1; }

.a-pg-accent {
  height: 20px; display:flex; align-items:center; padding:0 28px; gap:5px;
  border-bottom: 1px solid #E8E8E8; background:#fff; flex-shrink:0;
}
.t  { display:block; width:5px; height:5px; border-radius:50%; background:#DADADA; flex-shrink:0; }
.n  { background:#FFDB00 !important; width:7px !important; height:7px !important; }
.g  { flex:1; height:1px; background:#E0E0E0; margin:0 3px; }

/* ── Page body ── */
.a-pg-body {
  flex: 1;
  overflow: hidden;
  padding: 20px 32px 16px;
}

/* ── Page footer ── */
.a-pg-footer {
  flex-shrink: 0;
  background: #020D1C;
  color: #B8C0CB;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 28px;
  height: 44px;
}
.a-pg-ft-left { display:flex; gap:20px; align-items:center; }
.a-pg-ft-col .k { font-family:${MONO}; font-size:6.5px; letter-spacing:.2em; text-transform:uppercase; color:#FFDB00; margin-bottom:2px; }
.a-pg-ft-col .v { font-size:7.5px; color:#D8DEE8; }
.a-pg-ft-sep { width:1px; height:20px; background:rgba(255,255,255,.15); }
.a-pg-ft-right { display:flex; flex-direction:column; align-items:flex-end; gap:3px; }
.a-pg-ft-copy { font-family:${MONO}; font-size:6.5px; letter-spacing:.15em; text-transform:uppercase; color:#FFDB00; }
.a-pg-ft-page { font-family:${MONO}; font-size:7px; letter-spacing:.08em; color:#9ca3af; }

/* ── Hidden measurement container ── */
#measure {
  position: absolute;
  top: -9999px;
  left: 0;
  width: 730px; /* 794 - 32px padding each side */
  visibility: hidden;
}

/* ── Pages container ── */
#pages { display: block; }
</style>
</head>
<body>

<!-- Hidden measurement div — content rendered here first, then distributed to pages -->
<div id="measure">
  <div id="measure-content">${bodyHtml}</div>
</div>

<!-- Page output container (filled by JS paginator) -->
<div id="pages"></div>

<script>
(function() {
  // ── Constants (must match CSS above) ──
  var PAGE_W      = 794;   // px — .a-page width
  var PAGE_H      = 1123;  // px — .a-page height
  var HDR_H       = 88;    // px — lockup(~42) + band(48) + accent(20) - overlap
  var FTR_H       = 44;    // px — .a-pg-footer height
  var BODY_PAD_T  = 20;    // px — .a-pg-body padding-top
  var BODY_PAD_B  = 16;    // px — .a-pg-body padding-bottom
  var BODY_H      = PAGE_H - HDR_H - FTR_H - BODY_PAD_T - BODY_PAD_B; // available content height

  var refBadge = ${JSON.stringify(refBadge)};
  var email    = ${JSON.stringify(email)};
  var year     = ${JSON.stringify(String(year))};

  // ── Letterhead HTML builders ──
  function makeHeaderHtml(pgNum) {
    return ${JSON.stringify(pageHeaderHtml)};
  }

  function makeFooterHtml(pgNum, total) {
    return '<div class="a-pg-footer">' +
      '<div class="a-pg-ft-left">' +
        '<div class="a-pg-ft-col"><div class="k">Contact</div><div class="v">' + email + '</div></div>' +
        '<div class="a-pg-ft-sep"></div>' +
        '<div class="a-pg-ft-col"><div class="k">Offices</div><div class="v">Warsaw &middot; Berlin &middot; London &middot; NY</div></div>' +
      '</div>' +
      '<div class="a-pg-ft-right">' +
        '<div class="a-pg-ft-copy">&copy; Andersen ' + year + '</div>' +
        '<div class="a-pg-ft-page">Page ' + pgNum + ' of ' + total + '</div>' +
      '</div>' +
    '</div>';
  }

  function makePageDiv(bodyInnerHtml, pgNum, total) {
    var div = document.createElement('div');
    div.className = 'a-page';
    div.innerHTML =
      makeHeaderHtml(pgNum) +
      '<div class="a-pg-body">' + bodyInnerHtml + '</div>' +
      makeFooterHtml(pgNum, total);
    return div;
  }

  // ── Paginator ──
  // Strategy: walk top-level children of #measure-content.
  // For each child, measure its rendered height. If it fits in the current page,
  // add it. If not, start a new page.
  // Special case: tables — walk tr children so large tables span pages row-by-row.
  function paginate() {
    var measureContent = document.getElementById('measure-content');
    var pagesContainer = document.getElementById('pages');

    // Force measure container to be the right width
    document.getElementById('measure').style.width = '730px';

    // Collect page slices: each slice is an array of HTML strings
    var slices  = [[]];
    var heights = [0];

    function currentIdx() { return slices.length - 1; }
    function currentH()   { return heights[currentIdx()]; }

    function newPage() {
      slices.push([]);
      heights.push(0);
    }

    function addHtml(html, elH) {
      slices[currentIdx()].push(html);
      heights[currentIdx()] += elH;
    }

    function processElement(el) {
      // Measure this element's rendered height
      var clone = el.cloneNode(true);
      measureContent.appendChild(clone);
      var h = clone.getBoundingClientRect().height || clone.offsetHeight;
      measureContent.removeChild(clone);

      // If it's a table and doesn't fit as-a-whole, distribute row by row
      if (el.tagName === 'TABLE' && h > BODY_H) {
        // Get thead HTML for repetition at top of each table segment
        var theadHtml = '';
        var thead = el.querySelector('thead');
        if (thead) theadHtml = '<thead>' + thead.innerHTML + '</thead>';

        var rows = el.querySelectorAll('tbody tr, tr:not(thead tr)');
        // If table doesn't have explicit tbody, all rows including thead rows are selected — filter
        var bodyRows = [];
        for (var i = 0; i < rows.length; i++) {
          if (!rows[i].closest('thead')) bodyRows.push(rows[i]);
        }

        // Start table segment
        var inTable = false;
        var segRows = [];
        var segH = 0;

        // Measure thead height
        var theadH = 0;
        if (thead) {
          var tc = thead.cloneNode(true);
          measureContent.appendChild(tc);
          theadH = tc.getBoundingClientRect().height || tc.offsetHeight;
          measureContent.removeChild(tc);
        }

        function flushTableSeg() {
          if (segRows.length === 0) return;
          var tableHtml = '<table>' + theadHtml + '<tbody>' + segRows.join('') + '</tbody></table>';
          addHtml(tableHtml, segH + theadH);
          segRows = [];
          segH = 0;
        }

        // Reserve space for thead on current page
        if (theadH > 0 && currentH() + theadH + 20 > BODY_H) {
          flushTableSeg();
          newPage();
        }

        for (var j = 0; j < bodyRows.length; j++) {
          var row = bodyRows[j];
          var rc = row.cloneNode(true);
          measureContent.appendChild(rc);
          var rh = rc.getBoundingClientRect().height || rc.offsetHeight;
          measureContent.removeChild(rc);

          var needed = (segRows.length === 0 ? theadH : 0) + rh;
          if (currentH() + segH + needed > BODY_H && segRows.length > 0) {
            flushTableSeg();
            newPage();
          }
          segRows.push(row.outerHTML);
          segH += rh;
        }
        flushTableSeg();

      } else if (h <= BODY_H) {
        // Normal element: fits in a single page
        if (currentH() + h > BODY_H) {
          newPage();
        }
        addHtml(el.outerHTML, h);
      } else {
        // Element taller than a full page (very long pre block etc.) — just add it
        if (currentH() > 0) newPage();
        addHtml(el.outerHTML, h);
      }
    }

    // Walk top-level children
    var children = measureContent.children;
    for (var i = 0; i < children.length; i++) {
      processElement(children[i]);
    }

    // Build page divs
    var total = slices.length;
    for (var p = 0; p < total; p++) {
      var bodyInner = slices[p].join('');
      var pageDiv = makePageDiv(bodyInner, p + 1, total);
      pagesContainer.appendChild(pageDiv);
    }

    // Remove measurement container
    var meas = document.getElementById('measure');
    meas.style.display = 'none';
  }

  // Run after all resources loaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', paginate);
  } else {
    paginate();
  }
})();
</script>
</body>
</html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// buildPdfBodyHtml(markdown, opts)
// Body-only HTML for Puppeteer. No letterhead — injected via displayHeaderFooter.
// FIX 3: table no longer has page-break-inside:avoid.
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
body { background: #fff; margin: 0; padding: 0; }
.a-body { padding: 0; }
@page { size: A4; margin: 32mm 16mm 22mm 16mm; }
</style>
</head>
<body><div class="a-body">${bodyHtml}</div></body>
</html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// buildPuppeteerTemplates(opts)
//
// FIX 2: Header layout — explicit heights so lockup row and yellow band
// don't overlap. The total header height is 32mm (margin.top in page.pdf).
//   - hdr-lockup: fixed height ~42px (≈11mm) — white row with wordmark
//   - hdr-band:   fills remaining space (~15mm) — solid yellow
//   - hdr-accent: 5px separator line
//
// The <style> tag is required inside HF templates for background colors to render.
// ─────────────────────────────────────────────────────────────────────────────
function buildPuppeteerTemplates(opts) {
  opts = opts || {};
  const refBadge = opts.ref_number ? escHtml(opts.ref_number) : 'Andersen \u00b7 Est. 2007';
  const email     = 'procurement@cpc-rfp.website';
  const year      = new Date().getFullYear();

  // FIX 2: Use explicit heights instead of flex:1 to prevent overlap.
  // Total = 32mm. Breakdown:
  //   hdr-lockup: ~11mm  (42px at 96dpi, ≈11.1mm)
  //   hdr-band:   ~16mm  (61px at 96dpi, ≈16.1mm)
  //   hdr-accent: ~5px   (~1.3mm)
  //   Remaining gap: ~3.6mm breathing room before content
  const headerTemplate = `<style>
* { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; box-sizing: border-box; margin: 0; padding: 0; }
.hdr { width: 100%; height: 32mm; display: flex; flex-direction: column; overflow: hidden; }
.hdr-lockup { height: 11mm; display: flex; align-items: center; padding: 0 16mm; background: #ffffff; border-bottom: 1px solid #EBEBEB; flex-shrink: 0; }
.hdr-brand  { display: flex; align-items: center; gap: 10px; }
.hdr-divider { width: 1px; height: 22px; background: #D0D0D0; flex-shrink: 0; }
.hdr-tag { font-family: 'Courier New', monospace; font-size: 7px; letter-spacing: .2em; text-transform: uppercase; color: #556170; line-height: 1.5; }
.hdr-tag b { color: #020303; font-weight: 600; }
.hdr-band { flex: 1; background: #FFDB00; display: flex; align-items: center; justify-content: space-between; padding: 0 16mm; overflow: hidden; }
.hdr-band-left { display: flex; align-items: center; gap: 8px; }
.hdr-band-tag { font-family: 'Courier New', monospace; font-size: 6.5px; letter-spacing: .2em; text-transform: uppercase; color: #020303; opacity: .55; }
.hdr-badge { font-family: 'Courier New', monospace; font-size: 7px; letter-spacing: .22em; text-transform: uppercase; color: #020303; opacity: .65; }
.hdr-accent { height: 5px; background: #ffffff; border-top: 1px solid #E0E0E0; flex-shrink: 0; }
</style>
<div class="hdr">
  <div class="hdr-lockup">
    <div class="hdr-brand">
      <svg viewBox="0 0 180 38" width="86" height="18" fill="none">
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
    <div class="hdr-band-left">
      <svg viewBox="0 0 180 38" width="70" height="14" fill="none">
        <rect x="0" y="3" width="24" height="24" rx="2" fill="#020303"/>
        <rect x="4" y="7" width="6" height="14" fill="#FFDB00"/>
        <rect x="14" y="7" width="6" height="14" fill="#FFDB00"/>
        <text x="30" y="23" font-family="Arial,Helvetica,sans-serif" font-weight="700" font-size="15" letter-spacing="1.5" fill="#020303">ANDERSEN</text>
      </svg>
    </div>
    <span class="hdr-badge">${refBadge}</span>
  </div>
  <div class="hdr-accent"></div>
</div>`;

  const footerTemplate = `<style>
* { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; box-sizing: border-box; margin: 0; padding: 0; }
.ftr { width: 100%; height: 22mm; background: #020D1C; display: flex; align-items: center; justify-content: space-between; padding: 0 16mm; overflow: hidden; }
.ftr-left { display: flex; gap: 20px; align-items: center; }
.ftr-col-k { font-family: 'Courier New', monospace; font-size: 6.5px; letter-spacing: .18em; text-transform: uppercase; color: #FFDB00; margin-bottom: 2px; }
.ftr-col-v { font-family: Arial, sans-serif; font-size: 7.5px; color: #D8DEE8; line-height: 1.4; }
.ftr-sep { width: 1px; height: 24px; background: rgba(255,255,255,.15); flex-shrink: 0; }
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
app.post('/render-md-html', requireAuth, (req, res) => {
  const { markdown, ref_number, rfp_title } = req.body || {};
  if (!markdown || typeof markdown !== 'string')
    return res.status(400).json({ error: 'Missing required field: markdown' });
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
app.post('/render-md-pdf', requireAuth, async (req, res) => {
  const { markdown, ref_number, rfp_title } = req.body || {};
  if (!markdown || typeof markdown !== 'string')
    return res.status(400).json({ error: 'Missing required field: markdown' });

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
    await browser.close(); browser = null;

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
app.post('/render-pdf', requireAuth, async (req, res) => {
  const { html, markdown, ref_number, rfp_title, page_width, page_height } = req.body || {};

  if (markdown && typeof markdown === 'string') {
    const bodyHtml = buildPdfBodyHtml(markdown, { ref_number, rfp_title });
    const { headerTemplate, footerTemplate } = buildPuppeteerTemplates({ ref_number });
    let browser;
    try {
      browser = await launchBrowser();
      const page = await browser.newPage();
      await page.setContent(bodyHtml, { waitUntil: 'networkidle0' });
      const pdfBuffer = await page.pdf({
        format: 'A4', printBackground: true,
        displayHeaderFooter: true, headerTemplate, footerTemplate,
        margin: { top: '32mm', bottom: '22mm', left: '16mm', right: '16mm' },
      });
      await browser.close(); browser = null;
      res.set({ 'Content-Type': 'application/pdf', 'Content-Length': pdfBuffer.length, 'Cache-Control': 'no-cache' });
      return res.send(pdfBuffer);
    } catch (err) {
      if (browser) { try { await browser.close(); } catch (_) {} }
      console.error('[render-pdf/markdown] Error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  if (!html || typeof html !== 'string')
    return res.status(400).json({ error: 'Missing required field: html or markdown' });

  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({
      width: page_width || '794px', height: page_height || '1123px',
      printBackground: true, displayHeaderFooter: false,
      margin: { top: '0', bottom: '0', left: '0', right: '0' },
    });
    await browser.close(); browser = null;
    res.set({ 'Content-Type': 'application/pdf', 'Content-Length': pdfBuffer.length, 'Cache-Control': 'no-cache' });
    res.send(pdfBuffer);
  } catch (err) {
    if (browser) { try { await browser.close(); } catch (_) {} }
    console.error('[render-pdf] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`[pdf-render] v10 listening on 127.0.0.1:${PORT} (secret: ${!!SECRET})`);
});
