/**
 * pdf-render.ts
 *
 * Inline replacement for the VPS pdf-render sidecar (vps/pdf-render/server.js v11).
 * All logic ported verbatim from the original; the only structural change is:
 *   - A long-lived browser pool (getBrowser) replaces per-request launchBrowser().
 *   - Functions are exported as TypeScript ESM rather than Express route handlers.
 *
 * Phase 1 of the Azure sidecar inline migration.
 */

import puppeteer, { type Browser } from 'puppeteer'
import { marked } from 'marked'
import { getActiveProfile } from '../profiles/index'

// ── Browser pool ──────────────────────────────────────────────────────────────
// One Chromium instance is kept alive for the lifetime of the Node.js process.
// Per-render: a new Page is created, used, then closed (no page reuse — avoids
// state leakage between requests). Browser restarts automatically on disconnect.

let _browser: Browser | null = null
let _browserLaunching: Promise<Browser> | null = null

export async function getBrowser(): Promise<Browser> {
  if (_browser && _browser.connected) return _browser
  if (_browserLaunching) return _browserLaunching

  _browserLaunching = puppeteer
    .launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--font-render-hinting=none',
      ],
    })
    .then((b) => {
      _browser = b
      _browserLaunching = null
      b.on('disconnected', () => {
        _browser = null
        console.warn('[pdf-render] browser disconnected — will relaunch on next request')
      })
      return b
    })

  return _browserLaunching
}

/** Call once at app startup to pay the cold-start cost before any real request. */
export async function warmupBrowser(): Promise<void> {
  console.log('[pdf-render] warming up Chromium...')
  const browser = await getBrowser()
  const page = await browser.newPage()
  await page.setContent('<html><body>warmup</body></html>')
  await page.close()
  console.log('[pdf-render] Chromium ready')
}

// ── Helpers (ported 1-to-1 from server.js) ────────────────────────────────────

function escHtml(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const MONO = "'Courier New', monospace"

// Typography CSS — identical to server.js (FIX 3: table has no page-break-inside:avoid)
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
`

function wordmarkSvg(width: number, height: number, textColor?: string): string {
  const tc = textColor || '#020303'
  return `<svg viewBox="0 0 180 38" width="${width}" height="${height}" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="3" width="24" height="24" rx="2" fill="${tc}"/><rect x="4" y="7" width="6" height="14" fill="#FFDB00"/><rect x="14" y="7" width="6" height="14" fill="#FFDB00"/><text x="30" y="23" font-family="Arial,Helvetica,sans-serif" font-weight="700" font-size="15" letter-spacing="1.5" fill="${tc}">ANDERSEN</text></svg>`
}

// ── buildHeaderSvg ────────────────────────────────────────────────────────────
// v13 layout: Row1 48px lockup | Row2 34px yellow band | Row3 5px accent = 87px total
function buildHeaderSvg(refBadge?: string): string {
  const W    = 794
  const LKH  = 48
  const BAND = 34
  const ACC  = 5
  const H    = LKH + BAND + ACC   // 87px
  const PAD  = 60

  const glyphX = PAD
  const glyphY = Math.round((LKH - 16) / 2)

  const bY = LKH
  const bH = BAND

  const topo1 = `M-10,${bY+7}  Q130,${bY+1}  280,${bY+9}  T520,${bY+11} Q650,${bY+14} 810,${bY+5}`
  const topo2 = `M-10,${bY+15} Q150,${bY+6}  300,${bY+16} T540,${bY+19} Q660,${bY+23} 810,${bY+12}`
  const topo3 = `M-10,${bY+23} Q160,${bY+14} 320,${bY+25} T560,${bY+27} Q680,${bY+30} 810,${bY+20}`

  const d1y = bY + 8, d2y = bY + 17, d3y = bY + 10, d4y = bY + 22, d5y = bY + 9

  const badge = String(refBadge || '').slice(0, 50)

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">

  <!-- Row 1: White lockup (48px) -->
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

  <!-- RFP ref badge -->
  ${badge ? `<text x="${W - PAD}" y="${glyphY+8}" font-family="Courier New,monospace" font-size="7" letter-spacing="1.8" fill="#556170" text-anchor="end">REF</text>
  <text x="${W - PAD}" y="${glyphY+17}" font-family="Courier New,monospace" font-weight="600" font-size="7.5" letter-spacing="1.2" fill="#020303" text-anchor="end">${badge}</text>` : ''}

  <!-- Row 2: Yellow band (34px) -->
  <rect x="0" y="${bY}" width="${W}" height="${BAND}" fill="#FFDB00"/>

  <!-- Topo contour lines -->
  <path d="${topo1}" stroke="#020303" stroke-width="0.9" stroke-opacity="0.28" fill="none"/>
  <path d="${topo2}" stroke="#020303" stroke-width="0.9" stroke-opacity="0.20" fill="none"/>
  <path d="${topo3}" stroke="#020303" stroke-width="0.9" stroke-opacity="0.14" fill="none"/>
  <circle cx="140" cy="${d1y}" r="2"   fill="#020303" opacity="0.25"/>
  <circle cx="320" cy="${d2y}" r="1.5" fill="#020303" opacity="0.20"/>
  <circle cx="490" cy="${d3y}" r="2.2" fill="#020303" opacity="0.20"/>
  <circle cx="640" cy="${d4y}" r="1.5" fill="#020303" opacity="0.16"/>
  <circle cx="750" cy="${d5y}" r="2"   fill="#020303" opacity="0.20"/>

  <!-- Row 3: White accent strip (5px) -->
  <rect x="0" y="${bY + BAND}" width="${W}" height="${ACC}" fill="#ffffff"/>
  <line x1="0" y1="${bY + BAND}" x2="${W}" y2="${bY + BAND}" stroke="#E0E0E0" stroke-width="1"/>
</svg>`
}

function buildPuppeteerTemplates(opts: { ref_number?: string }): {
  headerTemplate: string
  footerTemplate: string
} {
  const profile = getActiveProfile()
  const refBadge = opts.ref_number ? String(opts.ref_number) : `${profile.orgNameShort} · ${profile.orgLocation.split(',')[0]}`
  const email = profile.procurementEmail
  const year  = new Date().getFullYear()

  const svgContent = buildHeaderSvg(refBadge)
  const svgDataUri = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgContent)

  const headerTemplate = `<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { margin: 0; padding: 0; }
</style>
<img src="${svgDataUri}" width="794" height="87" style="display:block;width:794px;height:87px;"/>`

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
</table>`

  return { headerTemplate, footerTemplate }
}

// ── buildPdfBodyHtml ──────────────────────────────────────────────────────────
function buildPdfBodyHtml(markdown: string, opts: { ref_number?: string; rfp_title?: string }): string {
  const rfpTitle = opts.rfp_title ? escHtml(opts.rfp_title) : 'Request for Proposal'
  marked.setOptions({ gfm: true, breaks: false } as any)
  const bodyHtml = marked.parse(markdown || '') as string

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
@page { size: A4; margin: 29mm 16mm 22mm 16mm; }
</style>
</head>
<body><div class="a-body">${bodyHtml}</div></body>
</html>`
}

// ── buildPreviewHtml ──────────────────────────────────────────────────────────
// Profile-aware preview HTML:
//   Andersen: paginated JS letterhead preview (simulated A4 page cards).
//   CPC:      single-page profilePageHtml from brand/letterhead.
export async function buildPreviewHtml(
  markdown: string,
  opts: { ref_number?: string; rfp_title?: string }
): Promise<string> {
  const profile  = getActiveProfile()
  const rfpTitle = opts.rfp_title || 'Request for Proposal'

  marked.setOptions({ gfm: true, breaks: false } as any)
  const bodyHtml = marked.parse(markdown || '') as string

  if (profile.id !== 'andersen') {
    // Non-Andersen profiles: use profilePageHtml for a properly branded page
    const { profilePageHtml } = await import('../brand/letterhead')
    return profilePageHtml({ title: rfpTitle, bodyHtml, refNumber: opts.ref_number })
  }

  const rfpTitleEsc  = escHtml(rfpTitle)
  const refNumber    = opts.ref_number ? escHtml(opts.ref_number) : ''

  // Letterhead header HTML (injected into every A4 page card — Andersen only)
  const svgContent = buildHeaderSvg(refNumber || undefined)
  const svgDataUri = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgContent)
  const pageHeaderHtml = `<div class="a-pg-hd"><img src="${svgDataUri}" width="794" height="87" style="display:block;width:100%;height:auto;"/></div>`

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=794,initial-scale=1"/>
<title>${rfpTitleEsc}</title>
<style>
${TYPOGRAPHY_CSS}
html, body { background: #e5e7eb; margin: 0; padding: 0; }
#pages { display: block; }
.a-page {
  width: 794px; min-height: 1123px;
  background: #fff;
  margin: 24px auto;
  box-shadow: 0 2px 12px rgba(0,0,0,0.15);
  display: flex; flex-direction: column;
  overflow: hidden;
  page-break-after: always;
}
.a-pg-hd  { flex: 0 0 auto; width: 100%; }
.a-pg-body{ flex: 1 1 auto; padding: 20px 60px 0; overflow: hidden; }
.a-pg-ft  { flex: 0 0 83px; width: 100%; background: #020D1C;
             display: flex; align-items: center; justify-content: space-between;
             padding: 0 60px; margin-top: auto; }
.a-pg-ft-left { display:flex; align-items:center; gap:0; }
.a-pg-ft-sep  { width:1px; height:22px; background:rgba(255,255,255,0.15); margin:0 16px; }
.a-pg-ft-lbl  { font-family: 'Courier New',monospace; font-size:6px; letter-spacing:1.5px; text-transform:uppercase; color:#FFDB00; display:block; margin-bottom:2px; }
.a-pg-ft-val  { font-family:Arial,sans-serif; font-size:7.5px; color:#D8DEE8; display:block; }
.a-pg-ft-page { font-family:'Courier New',monospace; font-size:7px; letter-spacing:0.8px; color:#9ca3af; }
#measure { position:fixed; top:-9999px; left:0; width:674px; visibility:hidden; pointer-events:none; font-family:Arial,'Segoe UI',Helvetica,sans-serif; font-size:10.5pt; line-height:1.65; color:#020303; }
</style>
</head>
<body>
<!-- Hidden measurement div -->
<div id="measure"><div id="measure-content">${bodyHtml}</div></div>
<div id="pages"></div>
<script>
(function(){
  var PAGE_W      = 794;
  var PAGE_H      = 1123;
  var HDR_H       = 87;
  var FTR_H       = 83;
  var BODY_PAD_T  = 20;
  var BODY_PAD_LR = 60;
  var BODY_H      = PAGE_H - HDR_H - FTR_H - BODY_PAD_T;
  var email       = ${JSON.stringify(getActiveProfile().procurementEmail)};
  var year        = new Date().getFullYear();
  var pageHeaderHtml = ${JSON.stringify(pageHeaderHtml)};

  function makeFooter(pgNum, total) {
    return '<div class="a-pg-ft">' +
      '<div class="a-pg-ft-left">' +
        '<div><span class="a-pg-ft-lbl">Contact</span><span class="a-pg-ft-val">' + email + '</span></div>' +
        '<div class="a-pg-ft-sep"></div>' +
        '<div><span class="a-pg-ft-lbl">Offices</span><span class="a-pg-ft-val">${getActiveProfile().orgLocation}</span></div>' +
      '</div>' +
      '<div><span class="a-pg-ft-lbl" style="text-align:right">© ${getActiveProfile().orgNameShort} ' + year + '</span>' +
        '<span class="a-pg-ft-page">Page ' + pgNum + ' of ' + total + '</span></div>' +
    '</div>';
  }

  function makePageDiv(bodyInner, pgNum, total) {
    var div = document.createElement('div');
    div.className = 'a-page';
    div.innerHTML = pageHeaderHtml +
      '<div class="a-pg-body">' + bodyInner + '</div>' +
      makeFooter(pgNum, total);
    return div;
  }

  function paginate() {
    var measureContent = document.getElementById('measure-content');
    if (!measureContent) return;

    var slices = [[]];
    var heights = [0];

    function currentH() { return heights[heights.length - 1]; }
    function newPage() { slices.push([]); heights.push(0); }
    function addHtml(html, h) {
      slices[slices.length - 1].push(html);
      heights[heights.length - 1] += h;
    }

    function processElement(el) {
      var tag = el.tagName;

      if (tag === 'TABLE') {
        var thead = el.querySelector('thead');
        var theadHtml = thead ? thead.outerHTML : '';
        var rows = el.querySelectorAll('tr');
        var bodyRows = [];
        for (var i = 0; i < rows.length; i++) {
          if (!rows[i].closest('thead')) bodyRows.push(rows[i]);
        }
        var theadH = 0;
        if (thead) {
          var tc = thead.cloneNode(true);
          measureContent.appendChild(tc);
          theadH = tc.getBoundingClientRect().height || tc.offsetHeight;
          measureContent.removeChild(tc);
        }
        var segRows = [], segH = 0;
        function flushTableSeg() {
          if (segRows.length === 0) return;
          addHtml('<table>' + theadHtml + '<tbody>' + segRows.join('') + '</tbody></table>', segH + theadH);
          segRows = []; segH = 0;
        }
        if (theadH > 0 && currentH() + theadH + 20 > BODY_H) { flushTableSeg(); newPage(); }
        for (var j = 0; j < bodyRows.length; j++) {
          var row = bodyRows[j];
          var rc  = row.cloneNode(true);
          measureContent.appendChild(rc);
          var rh  = rc.getBoundingClientRect().height || rc.offsetHeight;
          measureContent.removeChild(rc);
          var needed = (segRows.length === 0 ? theadH : 0) + rh;
          if (currentH() + segH + needed > BODY_H && segRows.length > 0) { flushTableSeg(); newPage(); }
          segRows.push(row.outerHTML);
          segH += rh;
        }
        flushTableSeg();
      } else if (measureContent.offsetHeight <= BODY_H) {
        var c2 = el.cloneNode(true);
        measureContent.appendChild(c2);
        var h2 = c2.getBoundingClientRect().height || c2.offsetHeight;
        measureContent.removeChild(c2);
        if (currentH() + h2 > BODY_H) newPage();
        addHtml(el.outerHTML, h2);
      } else {
        if (currentH() > 0) newPage();
        addHtml(el.outerHTML, BODY_H);
      }
    }

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
      var tag2 = el.tagName;
      var isHeading = (tag2==='H1'||tag2==='H2'||tag2==='H3'||tag2==='H4');
      if (isHeading && i + 1 < children.length) {
        var hH   = measureEl(el);
        var next = children[i + 1];
        var nH   = measureEl(next);
        if (hH + nH <= BODY_H) {
          if (currentH() + hH + nH > BODY_H) newPage();
          addHtml(el.outerHTML, hH);
          addHtml(next.outerHTML, nH);
          i++;
        } else {
          processElement(el);
          processElement(next);
          i++;
        }
      } else {
        processElement(el);
      }
    }

    var total = slices.length;
    var pagesContainer = document.getElementById('pages');
    for (var p = 0; p < total; p++) {
      var pageDiv = makePageDiv(slices[p].join(''), p + 1, total);
      pagesContainer.appendChild(pageDiv);
    }
    var meas = document.getElementById('measure');
    meas.style.display = 'none';
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', paginate);
  } else {
    paginate();
  }
})();
</script>
</body>
</html>`
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Render markdown → Andersen-branded A4 PDF bytes.
 * Uses the long-lived browser pool — warm calls take ~2–5s.
 */
export async function renderMarkdownToPdf(
  markdown: string,
  opts: { ref_number?: string; rfp_title?: string }
): Promise<Buffer> {
  const profile = getActiveProfile()
  const browser = await getBrowser()
  const page    = await browser.newPage()

  try {
    if (profile.id === 'cpc') {
      // ── CPC: background-image letterhead, no Puppeteer header/footer chrome ──
      const { profilePdfBodyHtml } = await import('../brand/letterhead')
      marked.setOptions({ gfm: true, breaks: false } as any)
      const renderedBody = marked.parse(markdown || '') as string
      const fullHtml = profilePdfBodyHtml({ bodyHtml: renderedBody, refNumber: opts.ref_number, title: opts.rfp_title })
      await page.setContent(fullHtml, { waitUntil: 'domcontentloaded' })
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        displayHeaderFooter: false,
        margin: { top: '0', bottom: '0', left: '0', right: '0' },
      })
      return Buffer.from(pdfBuffer)
    } else {
      // ── Andersen: SVG topo header + footer via Puppeteer displayHeaderFooter ──
      const bodyHtml = buildPdfBodyHtml(markdown, opts)
      const { headerTemplate, footerTemplate } = buildPuppeteerTemplates({ ref_number: opts.ref_number })
      await page.setContent(bodyHtml, { waitUntil: 'domcontentloaded' })
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate,
        footerTemplate,
        margin: { top: '29mm', bottom: '22mm', left: '16mm', right: '16mm' },
      })
      return Buffer.from(pdfBuffer)
    }
  } finally {
    await page.close()
  }
}
