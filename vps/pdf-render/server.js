// /opt/pdf-service/server.js
// Node.js / Express / Puppeteer / marked PDF + HTML render service
// Runs on the sidecar VPS at 127.0.0.1:8001
// Proxied by nginx at https://api.cpc-rfp.website/pdf/
//
// v11 (2026-08-15) — IMAGE-BASED PDF HEADER (definitive fix):
//
// ROOT CAUSE (v10 and earlier):
//   Puppeteer's displayHeaderFooter injects the template HTML into a special
//   Chromium "header frame" that is approximately 794×113px (for 32mm @ 96dpi).
//   Inside this frame, CSS flex/background rendering is subtly broken:
//     - background-color on child divs (not the outermost element) is unreliable
//     - position:absolute children bleed outside frame bounds
//     - SVG overlays with position:absolute inside flex containers are ignored
//   All our CSS-layout approaches (flex columns, explicit heights, overflow:hidden)
//   hit this same Chromium HF rendering limitation.
//
// SOLUTION — SINGLE SVG IMAGE (v11):
//   Replace the entire multi-div CSS header with ONE <img> tag whose src is a
//   data:image/svg+xml URI encoding the complete header as a flat SVG.
//   SVG advantages in Puppeteer HF templates:
//     - No CSS layout engine — SVG uses its own coordinate system
//     - All fills/strokes render exactly as authored (no background-color stripping)
//     - Topo contour lines, wordmark, yellow band — all in one vector
//     - ~2KB text — no base64 truncation risk (only PNG >32KB is truncated)
//     - The <img> element's background is transparent; outermost fill is on SVG rect
//   The SVG header encodes (top-to-bottom):
//     [1] White lockup row  (11mm) — wordmark SVG glyph + ANDERSEN text + divider + tag
//     [2] Yellow band       (16mm) — #FFDB00 rect + topo contour paths + ref badge
//     [3] Accent strip      ( 5px) — white with top border
//
// FIX 2 — HTML PREVIEW PAGINATION (from v10, unchanged):
//   JS paginator creates fixed-height A4 page cards, each with letterhead cloned in.
//
// FIX 3 — PDF TABLE PAGINATION (from v10, unchanged):
//   page-break-inside:avoid removed from table{}, kept only on tr{}.
//   thead { display: table-header-group } repeats on continuation pages.

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
  res.json({ status: 'ok', service: 'pdf-render', version: '14' });
});
app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: '14' });
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
  h1 { font-size: 16pt; font-weight: 700; border-bottom: 2.5px solid #FFDB00; padding-bottom: 6pt; margin: 0 0 12pt; page-break-after: avoid; page-break-inside: avoid; }
  h2 { font-size: 12pt; font-weight: 700; color: #020303; border-bottom: 1px solid #E0E0E0; margin: 14pt 0 5pt; padding-bottom: 3pt; page-break-after: avoid; page-break-inside: avoid; }
  h3 { font-size: 10.5pt; font-weight: 700; color: #3A3E45; margin: 10pt 0 3pt; page-break-after: avoid; page-break-inside: avoid; }
  h4 { font-size: 10pt; font-weight: 600; color: #556170; margin: 8pt 0 2pt; page-break-after: avoid; }
  p  { margin: 0 0 7pt; orphans: 2; widows: 2; }
  ul, ol { margin: 0 0 7pt; padding-left: 20pt; }
  li { margin-bottom: 2pt; page-break-inside: avoid; orphans: 2; widows: 2; }
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
  const topoSvg = `<svg class="topo" viewBox="0 0 794 24" preserveAspectRatio="none" fill="none">
    <path d="M-10 7  Q 100 2, 220 10 T 460 12 Q 580 15, 810 6"  stroke="#020303" stroke-width="0.7" stroke-opacity="0.3"/>
    <path d="M-10 14 Q 120 7, 240 17 T 480 19 Q 620 22, 810 13" stroke="#020303" stroke-width="0.7" stroke-opacity="0.22"/>
    <path d="M-10 21 Q 140 13, 260 23 T 500 24 Q 640 24, 810 19" stroke="#020303" stroke-width="0.7" stroke-opacity="0.16"/>
    <circle cx="120" cy="8"  r="1.5" fill="#020303" opacity="0.3"/>
    <circle cx="300" cy="15" r="1.2" fill="#020303" opacity="0.25"/>
    <circle cx="460" cy="11" r="1.8" fill="#020303" opacity="0.25"/>
    <circle cx="620" cy="20" r="1.2" fill="#020303" opacity="0.2"/>
    <circle cx="740" cy="9"  r="1.5" fill="#020303" opacity="0.25"/>
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
  height: 24px; background: #FFDB00;  /* halved from 48px */
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
  var HDR_H       = 77;    // px — lockup(48) + band(24) + accent(5) = 77px HTML preview header
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

    // Walk top-level children.
    // HEADING LOOKAHEAD (fixes HTML preview white-space gaps):
    // When a heading (H1-H4) is followed by a sibling, measure them together.
    // If they don't both fit on the current page, start a new page BEFORE the
    // heading — so the heading always lands with its following content, never
    // stranded at the bottom of a page with a blank gap after it.
    var children = Array.prototype.slice.call(measureContent.children);

    function measureEl(el) {
      var c = el.cloneNode(true);
      measureContent.appendChild(c);
      var h = c.getBoundingClientRect().height || c.offsetHeight;
      measureContent.removeChild(c);
      return h;
    }

    for (var i = 0; i < children.length; i++) {
      var el  = children[i];
      var tag = el.tagName;
      var isHeading = (tag === 'H1' || tag === 'H2' || tag === 'H3' || tag === 'H4');

      if (isHeading && i + 1 < children.length) {
        var hH   = measureEl(el);
        var next = children[i + 1];
        var nH   = measureEl(next);
        var combinedH = hH + nH;

        if (combinedH <= BODY_H) {
          // They fit together on one page — if current page can't hold both, break first
          if (currentH() + combinedH > BODY_H) newPage();
          addHtml(el.outerHTML, hH);
          addHtml(next.outerHTML, nH);
          i++; // next sibling already consumed
        } else {
          // Combined too tall (e.g. heading + huge table) — place heading, then sibling normally
          processElement(el);
          processElement(next);
          i++;
        }
      } else {
        processElement(el);
      }
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
@page { size: A4; margin: 29mm 16mm 22mm 16mm; }  /* 29mm = 87px header + 6mm breathing gap before content */
</style>
</head>
<body><div class="a-body">${bodyHtml}</div></body>
</html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// buildPuppeteerTemplates(opts)
//
// v11: DEFINITIVE FIX — the entire header is ONE SVG image.
//
// Why: Puppeteer's HF template frame has broken CSS rendering for child element
// backgrounds, position:absolute overlays, and flex layout edge cases. After 5
// failed CSS-only attempts, we bypass the CSS layout engine entirely.
//
// Approach: Build a single flat SVG (794 × 121px ≈ 32mm @ 96dpi) that encodes:
//   Row 1 (0–42px):   white lockup — wordmark glyph + ANDERSEN + divider + tag text
//   Row 2 (42–116px): yellow band #FFDB00 + topo contour paths + ref badge text
//   Row 3 (116–121px): white accent strip with top border line
//
// This SVG is embedded as a data:image/svg+xml URI in a single <img> tag.
// No CSS layout, no flex, no position:absolute — pure SVG coordinate rendering.
// The <img> itself sits in a minimal wrapper with only margin:0/padding:0 reset.
// ─────────────────────────────────────────────────────────────────────────────
function buildHeaderSvg(refBadge) {
  // Dimensions in px (96 dpi basis — Puppeteer HF template viewport)
  // Width = A4 width = 794px
  //
  // Layout (v13 — yellow band halved):
  //   Row 1 (0–48px):   white lockup — wordmark LEFT, RFP badge RIGHT
  //   Row 2 (48–82px):  yellow band 34px (was 68px — halved)
  //   Row 3 (82–87px):  white accent strip with top border
  //   Total H = 87px ≈ 23mm @ 96dpi  (margin.top updated to match)
  const W    = 794;
  const LKH  = 48;   // lockup row height
  const BAND = 34;   // yellow band height — 50% of previous 68px
  const ACC  = 5;    // accent strip height
  const H    = LKH + BAND + ACC;  // = 87px
  const PAD  = 60;   // horizontal padding

  // Wordmark glyph centred in lockup row
  const glyphX = PAD;
  const glyphY = Math.round((LKH - 16) / 2);

  // Topo paths — scaled to fit within 34px band height (bY to bY+BAND-ACC)
  // Original offsets (0–68px range) are scaled by factor 34/68 = 0.5
  const bY = LKH;  // band top y = 48
  const bH = BAND; // band usable height = 34
  // Scale factor: new offsets = original * (bH / 68)
  // topo1 original deltas: +7,+2,+18,+22,+28,+10  → halved
  const topo1 = `M-10,${bY+7}  Q130,${bY+1}  280,${bY+9}  T520,${bY+11} Q650,${bY+14} 810,${bY+5}`;
  const topo2 = `M-10,${bY+15} Q150,${bY+6}  300,${bY+16} T540,${bY+19} Q660,${bY+23} 810,${bY+12}`;
  const topo3 = `M-10,${bY+23} Q160,${bY+14} 320,${bY+25} T560,${bY+27} Q680,${bY+30} 810,${bY+20}`;

  // Dots scaled to new band height
  const d1y = bY + 8,  d2y = bY + 17, d3y = bY + 10, d4y = bY + 22, d5y = bY + 9;

  // RFP badge — right side of white row
  const badge = String(refBadge || '').slice(0, 50);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">

  <!-- ── Row 1: White lockup (48px) ── -->
  <rect x="0" y="0" width="${W}" height="${LKH}" fill="#ffffff"/>
  <line x1="0" y1="${LKH}" x2="${W}" y2="${LKH}" stroke="#E8E8E8" stroke-width="1"/>

  <!-- Wordmark glyph -->
  <rect x="${glyphX}" y="${glyphY}" width="16" height="16" rx="2" fill="#020303"/>
  <rect x="${glyphX+3}" y="${glyphY+3}" width="4" height="10" fill="#FFDB00"/>
  <rect x="${glyphX+9}" y="${glyphY+3}" width="4" height="10" fill="#FFDB00"/>
  <text x="${glyphX+22}" y="${glyphY+12}" font-family="Arial,Helvetica,sans-serif" font-weight="700" font-size="12" letter-spacing="1.5" fill="#020303">ANDERSEN</text>
  <line x1="${glyphX+122}" y1="${glyphY+2}" x2="${glyphX+122}" y2="${glyphY+14}" stroke="#D0D0D0" stroke-width="1"/>
  <text x="${glyphX+130}" y="${glyphY+8}" font-family="Courier New,monospace" font-weight="600" font-size="6.5" letter-spacing="0.8" fill="#020303">SOFTWARE ENGINEERING</text>
  <text x="${glyphX+130}" y="${glyphY+16}" font-family="Courier New,monospace" font-size="6.5" letter-spacing="0.8" fill="#556170">GROUP · GLOBAL</text>

  <!-- RFP ref — right of white row -->
  ${badge ? `<text x="${W - PAD}" y="${glyphY+8}" font-family="Courier New,monospace" font-size="7" letter-spacing="1.8" fill="#556170" text-anchor="end">REF</text>
  <text x="${W - PAD}" y="${glyphY+17}" font-family="Courier New,monospace" font-weight="600" font-size="7.5" letter-spacing="1.2" fill="#020303" text-anchor="end">${badge}</text>` : ''}

  <!-- ── Row 2: Yellow band (34px — halved from 68px) ── -->
  <rect x="0" y="${bY}" width="${W}" height="${BAND}" fill="#FFDB00"/>

  <!-- Topo contour lines scaled to 34px band height -->
  <path d="${topo1}" stroke="#020303" stroke-width="0.9" stroke-opacity="0.28" fill="none"/>
  <path d="${topo2}" stroke="#020303" stroke-width="0.9" stroke-opacity="0.20" fill="none"/>
  <path d="${topo3}" stroke="#020303" stroke-width="0.9" stroke-opacity="0.14" fill="none"/>
  <!-- Accent dots (scaled positions) -->
  <circle cx="140" cy="${d1y}" r="2"   fill="#020303" opacity="0.25"/>
  <circle cx="320" cy="${d2y}" r="1.5" fill="#020303" opacity="0.20"/>
  <circle cx="490" cy="${d3y}" r="2.2" fill="#020303" opacity="0.20"/>
  <circle cx="640" cy="${d4y}" r="1.5" fill="#020303" opacity="0.16"/>
  <circle cx="750" cy="${d5y}" r="2"   fill="#020303" opacity="0.20"/>

  <!-- ── Row 3: White accent strip (5px) ── -->
  <rect x="0" y="${bY + BAND}" width="${W}" height="${ACC}" fill="#ffffff"/>
  <line x1="0" y1="${bY + BAND}" x2="${W}" y2="${bY + BAND}" stroke="#E0E0E0" stroke-width="1"/>
</svg>`;
}

function buildPuppeteerTemplates(opts) {
  opts = opts || {};
  const refBadge = opts.ref_number ? String(opts.ref_number) : 'Andersen · Est. 2007';
  const email     = 'procurement@cpc-rfp.website';
  const year      = new Date().getFullYear();

  // Build header as SVG, encode as data URI for <img> tag
  const svgContent  = buildHeaderSvg(refBadge);
  const svgDataUri  = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgContent);

  // DEFINITIVE: single <img> tag — no CSS layout, no flex, no backgrounds on divs.
  // The <style> block only resets margin/padding on the outermost element.
  // Puppeteer reliably renders <img src="data:image/svg+xml,..."> in HF templates.
  const headerTemplate = `<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { margin: 0; padding: 0; }
</style>
<img src="${svgDataUri}" width="794" height="87" style="display:block;width:794px;height:87px;"/>`;  // 87px = 48 lockup + 34 band + 5 accent

  // Footer template: use a TABLE layout (most reliable in Puppeteer HF frames).
  // Tables render predictably — no flex, no position:absolute, no SVG overlay needed.
  // The outermost element gets background-color via -webkit-print-color-adjust.
  // Height = 22mm = 83px @ 96dpi — matches margin.bottom in page.pdf().
  //
  // Layout: one row, three cells:
  //   [LEFT cell]  Contact + Offices info
  //   [MID cell]   spacer (flex:1)
  //   [RIGHT cell] © Andersen year + Page N of M
  const footerTemplate = `<style>
* { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;
    margin: 0; padding: 0; box-sizing: border-box; }
body { margin: 0; padding: 0; background: #020D1C; }
table.ftr { width: 794px; height: 83px; background: #020D1C;
            border-collapse: collapse; table-layout: fixed; }
td.fl { width: 440px; padding: 0 0 0 60px; vertical-align: middle; }
td.fr { width: 294px; padding: 0 60px 0 0; vertical-align: middle; text-align: right; }
.fk { font-family: 'Courier New', monospace; font-size: 6px; letter-spacing: 1.5px;
      text-transform: uppercase; color: #FFDB00; display: block; margin-bottom: 2px; }
.fv { font-family: Arial, sans-serif; font-size: 7.5px; color: #D8DEE8; display: block; }
.fsep { display: inline-block; width: 1px; height: 22px; background: rgba(255,255,255,0.15);
        margin: 0 16px; vertical-align: middle; }
.fcopy { font-family: 'Courier New', monospace; font-size: 6px; letter-spacing: 1.2px;
         text-transform: uppercase; color: #FFDB00; display: block; margin-bottom: 3px; }
.fpg { font-family: 'Courier New', monospace; font-size: 7px; letter-spacing: 0.8px;
       color: #9ca3af; display: block; }
</style>
<table class="ftr">
  <tr>
    <td class="fl">
      <span class="fk">Contact</span><span class="fv">${email}</span>
      <span class="fsep"></span>
      <span class="fk" style="display:inline-block;margin-bottom:0">Offices</span>
      <span class="fv" style="display:inline-block">Warsaw · Berlin · London · NY</span>
    </td>
    <td class="fr">
      <span class="fcopy">© Andersen ${year}</span>
      <span class="fpg">Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
    </td>
  </tr>
</table>`;

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
      margin: { top: '29mm', bottom: '22mm', left: '16mm', right: '16mm' },
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
        margin: { top: '29mm', bottom: '22mm', left: '16mm', right: '16mm' },
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
