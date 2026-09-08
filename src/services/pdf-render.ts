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

  // Azure App Service (Linux) container launch flags.
  //
  // PIPE TRANSPORT REMOVED: pipe:true uses /proc/self/fd/3+4 for the DevTools protocol.
  // Azure App Service containers mount /proc with restricted fd access — the pipe FDs are
  // never established, causing immediate "Target closed" on launch.
  // Solution: use WebSocket transport (pipe:false, the default) which uses a TCP socket
  // on localhost and is fully supported in Azure App Service containers.
  //
  // --no-zygote: avoids zygote sandbox failure in restricted Linux namespaces.
  // --single-process REMOVED: collapses renderer into browser process, deadlocks page.pdf().
  // --user-data-dir=/tmp: ensures writable profile dir (/home/site/wwwroot is read-only).
  // --disable-dev-shm-usage: /dev/shm is typically tiny (64MB) or absent in containers.
  // --remote-debugging-port=0: required when pipe:false so Chromium binds a random port
  //   for the WebSocket DevTools endpoint (Puppeteer connects to it automatically).
  const launchArgs = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--no-zygote',
    '--user-data-dir=/tmp/chrome-user-data',
    '--remote-debugging-port=0',
    '--disable-extensions',
    '--disable-background-networking',
    '--disable-sync',
    '--mute-audio',
    '--hide-scrollbars',
    '--font-render-hinting=none',
  ]

  const launchOpts: Parameters<typeof puppeteer.launch>[0] = {
    headless: true,
    args:     launchArgs,
    pipe:     false,           // WebSocket transport — works in Azure (pipe needs /proc/self/fd)
    timeout:  60000,
  }

  // Resolve the chrome-headless-shell binary from the bundled cache.
  //
  // We ship chrome-headless-shell (not the full Chrome) in the zip because it is
  // purpose-built for headless rendering (page.pdf / page.screenshot) and is ~130 MB
  // smaller than full Chrome.  The binary lands at:
  //   <PUPPETEER_CACHE_DIR>/chrome-headless-shell/linux-<rev>/chrome-headless-shell-linux64/chrome-headless-shell
  //
  // Priority order:
  //   1. PUPPETEER_EXECUTABLE_PATH — explicit override (e.g. system chromium in dev)
  //   2. PUPPETEER_CACHE_DIR       — bundled headless-shell (production / Azure)
  //   3. puppeteer.executablePath() — Puppeteer's own default resolution (local dev)
  const explicitPath = process.env.PUPPETEER_EXECUTABLE_PATH
  if (explicitPath) {
    console.log(`[pdf-render] using PUPPETEER_EXECUTABLE_PATH: ${explicitPath}`)
    launchOpts.executablePath = explicitPath
  } else {
    const cacheDir = process.env.PUPPETEER_CACHE_DIR
    if (cacheDir) {
      // Glob for the headless-shell binary under the cache dir.
      // The revision directory name changes with Puppeteer version (e.g. linux-152.0.7977.54),
      // so we scan one level rather than hardcoding the revision.
      const fs   = require('fs')  as typeof import('fs')
      const path = require('path') as typeof import('path')
      const shellBase = path.join(cacheDir, 'chrome-headless-shell')
      try {
        const revDirs = fs.readdirSync(shellBase)
        for (const rev of revDirs) {
          const candidate = path.join(shellBase, rev, 'chrome-headless-shell-linux64', 'chrome-headless-shell')
          if (fs.existsSync(candidate)) {
            console.log(`[pdf-render] using bundled headless-shell: ${candidate}`)
            launchOpts.executablePath = candidate
            break
          }
        }
      } catch {
        // shellBase doesn't exist — fall through to Puppeteer default
      }
      if (!launchOpts.executablePath) {
        console.warn(`[pdf-render] PUPPETEER_CACHE_DIR set but no headless-shell found under ${shellBase} — falling back to Puppeteer default`)
      }
    }
  }

  _browserLaunching = puppeteer
    .launch(launchOpts)
    .then((b) => {
      _browser = b
      _browserLaunching = null
      b.on('disconnected', () => {
        _browser = null
        console.warn('[pdf-render] browser disconnected — will relaunch on next request')
      })
      return b
    })
    .catch((err) => {
      // Clear the launching promise on failure so the next request retries cleanly
      // instead of awaiting a permanently rejected promise.
      _browserLaunching = null
      _browser = null
      throw err
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
  const tc    = textColor || '#020303'
  const p     = getActiveProfile()
  const label = p.orgNameShort.toUpperCase()
  const acc   = p.css.accent
  return `<svg viewBox="0 0 180 38" width="${width}" height="${height}" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="3" width="24" height="24" rx="2" fill="${tc}"/><rect x="4" y="7" width="6" height="14" fill="${acc}"/><rect x="14" y="7" width="6" height="14" fill="${acc}"/><text x="30" y="23" font-family="Arial,Helvetica,sans-serif" font-weight="700" font-size="15" letter-spacing="1.5" fill="${tc}">${label}</text></svg>`
}

// ── buildHeaderSvg ────────────────────────────────────────────────────────────
// Produces a 794×168 SVG (= HDR_H_PX, 15% of A4) that fills the header zone
// with no scaling or distortion.
//
// Layout (top → bottom):
//   Row 1 — white lockup bar  : 48 px  (wordmark + company subtitle + ref badge)
//   Row 2 — yellow topo band  : 115 px (expanded to consume the full 168px zone)
//   Row 3 — accent strip      :   5 px
//
// The optional `_targetH` parameter is kept for call-site compatibility but is
// ignored — the SVG is always rendered at its native 794×168 size.
function buildHeaderSvg(refBadge?: string, _targetH?: number): string {
  const W    = 794
  const LKH  = 48    // white lockup row height
  const BAND = 115   // yellow band — expanded to fill 168px total (48+115+5)
  const ACC  = 5     // accent strip
  const H    = LKH + BAND + ACC   // 168px — exactly HDR_H_PX
  const PAD  = 60

  const glyphX = PAD
  const glyphY = Math.round((LKH - 16) / 2)

  const bY = LKH   // yellow band starts here

  // Topo contour lines — spread across the taller yellow band
  const topo1 = `M-10,${bY+20}  Q130,${bY+8}   280,${bY+28}  T520,${bY+35} Q650,${bY+42} 810,${bY+18}`
  const topo2 = `M-10,${bY+45}  Q150,${bY+20}  300,${bY+52}  T540,${bY+60} Q660,${bY+72} 810,${bY+40}`
  const topo3 = `M-10,${bY+72}  Q160,${bY+45}  320,${bY+80}  T560,${bY+88} Q680,${bY+95} 810,${bY+65}`
  const topo4 = `M-10,${bY+95}  Q200,${bY+70}  380,${bY+102} T600,${bY+108} Q720,${bY+112} 810,${bY+92}`

  const d1y = bY + 22, d2y = bY + 55, d3y = bY + 32, d4y = bY + 78, d5y = bY + 30
  const d6y = bY + 90, d7y = bY + 48, d8y = bY + 100

  const badge = String(refBadge || '').slice(0, 50)

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <!-- Row 1: White lockup (${LKH}px) -->
  <rect x="0" y="0" width="${W}" height="${LKH}" fill="#ffffff"/>
  <line x1="0" y1="${LKH}" x2="${W}" y2="${LKH}" stroke="#E8E8E8" stroke-width="1"/>

  <!-- Wordmark glyph -->
  <rect x="${glyphX}" y="${glyphY}" width="16" height="16" rx="2" fill="#020303"/>
  <rect x="${glyphX+3}" y="${glyphY+3}" width="4" height="10" fill="${getActiveProfile().css.accent}"/>
  <rect x="${glyphX+9}" y="${glyphY+3}" width="4" height="10" fill="${getActiveProfile().css.accent}"/>
  <text x="${glyphX+22}" y="${glyphY+12}" font-family="Arial,Helvetica,sans-serif" font-weight="700" font-size="12" letter-spacing="1.5" fill="#020303">${getActiveProfile().orgNameShort.toUpperCase()}</text>
  <line x1="${glyphX+122}" y1="${glyphY+2}" x2="${glyphX+122}" y2="${glyphY+14}" stroke="#D0D0D0" stroke-width="1"/>
  <text x="${glyphX+130}" y="${glyphY+8}" font-family="Courier New,monospace" font-weight="600" font-size="6.5" letter-spacing="0.8" fill="#020303">SOFTWARE ENGINEERING</text>
  <text x="${glyphX+130}" y="${glyphY+16}" font-family="Courier New,monospace" font-size="6.5" letter-spacing="0.8" fill="#556170">GROUP · GLOBAL</text>

  <!-- RFP ref badge (top-right) -->
  ${badge ? `<text x="${W - PAD}" y="${glyphY+8}" font-family="Courier New,monospace" font-size="7" letter-spacing="1.8" fill="#556170" text-anchor="end">REF</text>
  <text x="${W - PAD}" y="${glyphY+17}" font-family="Courier New,monospace" font-weight="600" font-size="7.5" letter-spacing="1.2" fill="#020303" text-anchor="end">${badge}</text>` : ''}

  <!-- Row 2: Yellow topo band (${BAND}px) -->
  <rect x="0" y="${bY}" width="${W}" height="${BAND}" fill="#FFDB00"/>

  <!-- Topo contour lines (spread across expanded band) -->
  <path d="${topo1}" stroke="#020303" stroke-width="0.9" stroke-opacity="0.28" fill="none"/>
  <path d="${topo2}" stroke="#020303" stroke-width="0.9" stroke-opacity="0.20" fill="none"/>
  <path d="${topo3}" stroke="#020303" stroke-width="0.9" stroke-opacity="0.14" fill="none"/>
  <path d="${topo4}" stroke="#020303" stroke-width="0.8" stroke-opacity="0.10" fill="none"/>
  <circle cx="140" cy="${d1y}" r="2"   fill="#020303" opacity="0.25"/>
  <circle cx="320" cy="${d2y}" r="1.5" fill="#020303" opacity="0.20"/>
  <circle cx="490" cy="${d3y}" r="2.2" fill="#020303" opacity="0.20"/>
  <circle cx="640" cy="${d4y}" r="1.5" fill="#020303" opacity="0.16"/>
  <circle cx="750" cy="${d5y}" r="2"   fill="#020303" opacity="0.20"/>
  <circle cx="200" cy="${d6y}" r="1.8" fill="#020303" opacity="0.18"/>
  <circle cx="550" cy="${d7y}" r="1.5" fill="#020303" opacity="0.15"/>
  <circle cx="400" cy="${d8y}" r="2"   fill="#020303" opacity="0.12"/>

  <!-- Row 3: White accent strip (${ACC}px) -->
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

  // buildHeaderSvg now returns a native 794×168 SVG (= HDR_H_PX)
  const svgContent = buildHeaderSvg(refBadge)
  const svgDataUri = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgContent)

  // Puppeteer sets body font-size to 0 inside header/footer template context,
  // so every font-size must use absolute px units. Relative units (em/rem/pt) collapse.
  const headerTemplate = `<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { margin: 0; padding: 0; font-size: 10px; }
</style>
<img src="${svgDataUri}" width="794" height="168"
     style="display:block;width:794px;height:168px;-webkit-print-color-adjust:exact;print-color-adjust:exact;"/>` 

  // Puppeteer header/footer templates run in an isolated context:
  //   • body font-size is forced to 0 → every font-size MUST be absolute px
  //   • -webkit-print-color-adjust must be on EACH colored element (the * rule
  //     is applied but sometimes dropped by the isolated renderer)
  //   • background-color on <body> alone is insufficient — needs to be on the
  //     outermost visible element too
  //   • height: 83px on the table tells Puppeteer exactly how much space to reserve
  const footerTemplate = `<style>
* { margin: 0; padding: 0; box-sizing: border-box;
    -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
html, body { margin: 0; padding: 0; font-size: 10px; background: #020D1C; }
</style>
<table style="width:794px;height:83px;min-height:83px;background:#020D1C;
             border-collapse:collapse;table-layout:fixed;
             -webkit-print-color-adjust:exact;print-color-adjust:exact;">
  <tr>
    <td style="width:440px;padding:0 0 0 60px;vertical-align:middle;
               background:#020D1C;-webkit-print-color-adjust:exact;">
      <span style="font-family:'Courier New',monospace;font-size:6px;letter-spacing:1.5px;
                   text-transform:uppercase;color:#FFDB00;display:block;margin-bottom:2px;
                   -webkit-print-color-adjust:exact;">Contact</span>
      <span style="font-family:Arial,sans-serif;font-size:7.5px;color:#D8DEE8;
                   display:block;-webkit-print-color-adjust:exact;">${email}</span>
      <span style="display:inline-block;width:1px;height:22px;
                   background:rgba(255,255,255,0.25);margin:0 16px;
                   vertical-align:middle;-webkit-print-color-adjust:exact;"></span>
      <span style="font-family:'Courier New',monospace;font-size:6px;letter-spacing:1.5px;
                   text-transform:uppercase;color:#FFDB00;display:inline-block;
                   -webkit-print-color-adjust:exact;">Offices</span>
      <span style="font-family:Arial,sans-serif;font-size:7.5px;color:#D8DEE8;
                   display:inline-block;margin-left:6px;
                   -webkit-print-color-adjust:exact;">${profile.orgLocation}</span>
    </td>
    <td style="width:294px;padding:0 60px 0 0;vertical-align:middle;text-align:right;
               background:#020D1C;-webkit-print-color-adjust:exact;">
      <span style="font-family:'Courier New',monospace;font-size:6px;letter-spacing:1.2px;
                   text-transform:uppercase;color:#FFDB00;display:block;margin-bottom:3px;
                   -webkit-print-color-adjust:exact;">© ${profile.orgNameShort} ${year}</span>
      <span style="font-family:'Courier New',monospace;font-size:7px;letter-spacing:0.8px;
                   color:#9ca3af;display:block;-webkit-print-color-adjust:exact;">Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
    </td>
  </tr>
</table>`

  return { headerTemplate, footerTemplate }
}

// ── Page layout constants (A4 three-zone model) ──────────────────────────────
// A4 at 96 dpi = 794 × 1123 px  /  210 × 297 mm
//
// Zone allocation (fixed percentages of total page height):
//   Header : top 15%  → 1123 × 0.15 = 168 px  = 44.6 mm
//   Footer : bot 10%  → 1123 × 0.10 = 112 px  = 29.7 mm
//   Content: mid 75%  → 1123 × 0.75 = 843 px  (available body area)
//
// These constants are shared between buildPdfBodyHtml (Puppeteer PDF) and
// buildPreviewHtml (JS paginator) so both outputs are pixel-identical.
const A4_H_PX   = 1123   // A4 page height at 96 dpi
const A4_W_PX   = 794    // A4 page width  at 96 dpi
const HDR_H_PX  = Math.round(A4_H_PX * 0.15)   // 168 px  — header zone
const FTR_H_PX  = Math.round(A4_H_PX * 0.10)   // 112 px  — footer zone
const BODY_H_PX = A4_H_PX - HDR_H_PX - FTR_H_PX // 843 px  — content zone
// @page margins in mm (exact conversions: px / 1123 * 297, rounded up 0.5mm)
const HDR_MM    = '44.6mm'   // top margin  = header zone
const FTR_MM    = '29.7mm'   // bottom margin = footer zone
const SIDE_MM   = '16mm'     // left / right margins (unchanged)

// ── buildPdfBodyHtml ──────────────────────────────────────────────────────────
// Embeds header + footer as position:fixed HTML inside the page body.
//
// WHY: Puppeteer's displayHeaderFooter:true injects templates via IPC into an
// isolated renderer context.  On Azure App Service Linux (restricted namespaces,
// no /dev/shm) that IPC channel crashes even without --single-process, producing
// "Protocol error (Target.setDiscoverTargets): Target closed".
//
// FIX: position:fixed elements are part of the page's own DOM — no IPC needed.
// Chromium repeats fixed elements on every printed page, identical to how
// displayHeaderFooter works but entirely in-process.  displayHeaderFooter is
// set to false so Puppeteer never attempts the IPC injection.
//
// LAYOUT: three fixed zones — header 15% / content 75% / footer 10% of A4.
// The @page margin equals each zone's mm height so the content area starts
// exactly at the header bottom and ends exactly at the footer top.
function buildPdfBodyHtml(markdown: string, opts: { ref_number?: string; rfp_title?: string }): string {
  const profile  = getActiveProfile()
  const rfpTitle = opts.rfp_title ? escHtml(opts.rfp_title) : 'Request for Proposal'
  const refBadge = opts.ref_number
    ? String(opts.ref_number)
    : `${profile.orgNameShort} · ${profile.orgLocation.split(',')[0]}`
  const email = profile.procurementEmail
  const year  = new Date().getFullYear()

  marked.setOptions({ gfm: true, breaks: false } as any)
  const bodyHtml = marked.parse(markdown || '') as string

  // Build header SVG — native 794×168 (HDR_H_PX), no scaling needed
  const svgInlineHeader = buildHeaderSvg(refBadge)

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=${A4_W_PX},initial-scale=1"/>
<title>${rfpTitle}</title>
<style>
${TYPOGRAPHY_CSS}
body { background: #fff; margin: 0; padding: 0; }

/* Three-zone A4 layout:
   @page margin top    = header zone  (${HDR_MM})  → content starts below header
   @page margin bottom = footer zone  (${FTR_MM})  → content ends above footer
   Fixed elements are pulled into those margin zones via negative top/bottom. */
@page { size: A4; margin: ${HDR_MM} ${SIDE_MM} ${FTR_MM} ${SIDE_MM}; }

/* ── Header zone: top 15% of A4 (${HDR_H_PX}px) — repeats every page ── */
.pdf-header {
  position: fixed;
  top: -${HDR_MM};
  left: -${SIDE_MM};
  right: -${SIDE_MM};
  width: ${A4_W_PX}px;
  height: ${HDR_H_PX}px;
  z-index: 1000;
  overflow: hidden;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.pdf-header svg {
  display: block;
  width: ${A4_W_PX}px;
  height: ${HDR_H_PX}px;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

/* ── Footer zone: bottom 10% of A4 (${FTR_H_PX}px) — repeats every page ── */
.pdf-footer {
  position: fixed;
  bottom: -${FTR_MM};
  left: -${SIDE_MM};
  right: -${SIDE_MM};
  width: ${A4_W_PX}px;
  height: ${FTR_H_PX}px;
  background: #020D1C;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 60px;
  box-sizing: border-box;
  z-index: 1000;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.pdf-footer * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
.pdf-ft-left  { display:flex; align-items:center; }
.pdf-ft-sep   { width:1px; height:24px; background:rgba(255,255,255,0.25); margin:0 16px; flex-shrink:0; }
.pdf-ft-lbl   { font-family:'Courier New',monospace; font-size:6.5px; letter-spacing:1.5px;
                text-transform:uppercase; color:#FFDB00; display:block; margin-bottom:3px; }
.pdf-ft-val   { font-family:Arial,sans-serif; font-size:8px; color:#D8DEE8; display:block; }
.pdf-ft-right { text-align:right; }
.pdf-ft-copy  { font-family:'Courier New',monospace; font-size:6.5px; letter-spacing:1.2px;
                text-transform:uppercase; color:#FFDB00; display:block; margin-bottom:3px; }
.pdf-ft-page  { font-family:'Courier New',monospace; font-size:7.5px; letter-spacing:0.8px; color:#9ca3af; display:block; }

/* ── Content zone: middle 75% of A4 (${BODY_H_PX}px) ── */
.a-body { padding: 16px 0 0; }
</style>
</head>
<body>
<!-- Header zone: fixed, pulled into @page top margin, repeats on every page -->
<div class="pdf-header">
  ${svgInlineHeader}
</div>

<!-- Footer zone: fixed, pulled into @page bottom margin, repeats on every page -->
<div class="pdf-footer">
  <div class="pdf-ft-left">
    <div>
      <span class="pdf-ft-lbl">Contact</span>
      <span class="pdf-ft-val">${email}</span>
    </div>
    <div class="pdf-ft-sep"></div>
    <div>
      <span class="pdf-ft-lbl">Offices</span>
      <span class="pdf-ft-val">${profile.orgLocation}</span>
    </div>
  </div>
  <div class="pdf-ft-right">
    <span class="pdf-ft-copy">© ${profile.orgNameShort} ${year}</span>
    <span class="pdf-ft-page">Confidential</span>
  </div>
</div>

<!-- Content zone: middle 75% — bounded by @page margins above and below -->
<div class="a-body">${bodyHtml}</div>
</body>
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

  // Inline SVG directly — buildHeaderSvg returns a native 794×168 SVG (= HDR_H_PX)
  // No <img> wrapper needed; no scaling issues with SVG data URIs in Chromium print
  const svgInline = buildHeaderSvg(refNumber || undefined)
  const pageHeaderHtml = `<div class="a-pg-hd" style="width:100%;height:${HDR_H_PX}px;overflow:hidden;flex-shrink:0;">${svgInline}</div>`

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
/* Header zone: 15% of 1123px = 168px */
.a-pg-hd  { flex: 0 0 168px; width: 100%; overflow: hidden; }
.a-pg-hd img { display:block; width:100%; height:168px; object-fit:cover; object-position:top; }
/* Content zone: 75% of 1123px = 843px — flex:1 fills the remaining space */
.a-pg-body{ flex: 1 1 auto; padding: 16px 60px 0; overflow: hidden; }
/* Footer zone: 10% of 1123px = 112px */
.a-pg-ft  { flex: 0 0 112px; width: 100%; background: #020D1C;
             display: flex; align-items: center; justify-content: space-between;
             padding: 0 60px; box-sizing: border-box; }
.a-pg-ft-left { display:flex; align-items:center; gap:0; }
.a-pg-ft-sep  { width:1px; height:24px; background:rgba(255,255,255,0.15); margin:0 16px; }
.a-pg-ft-lbl  { font-family: 'Courier New',monospace; font-size:6.5px; letter-spacing:1.5px; text-transform:uppercase; color:#FFDB00; display:block; margin-bottom:3px; }
.a-pg-ft-val  { font-family:Arial,sans-serif; font-size:8px; color:#D8DEE8; display:block; }
.a-pg-ft-page { font-family:'Courier New',monospace; font-size:7.5px; letter-spacing:0.8px; color:#9ca3af; }
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
  var HDR_H       = 168;   // 15% of 1123
  var FTR_H       = 112;   // 10% of 1123
  var BODY_PAD_T  = 16;
  var BODY_PAD_LR = 60;
  var BODY_H      = PAGE_H - HDR_H - FTR_H - BODY_PAD_T;  // 843 - 16 = 827px usable
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
      } else {
        var c2 = el.cloneNode(true);
        measureContent.appendChild(c2);
        var h2 = c2.getBoundingClientRect().height || c2.offsetHeight;
        measureContent.removeChild(c2);
        if (h2 <= BODY_H) {
          if (currentH() + h2 > BODY_H) newPage();
          addHtml(el.outerHTML, h2);
        } else {
          // Element taller than a full page (e.g. very long pre block) — add on fresh page
          if (currentH() > 0) newPage();
          addHtml(el.outerHTML, h2);
        }
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
  console.log(`[pdf-render] launching browser for profile=${profile.id}`)
  const browser = await getBrowser()
  console.log(`[pdf-render] browser launched, opening new page`)
  const page    = await browser.newPage()
  console.log(`[pdf-render] page opened, rendering content`)

  try {
    if (profile.id === 'cpc') {
      // ── CPC: background-image letterhead, no Puppeteer header/footer chrome ──
      const { profilePdfBodyHtml } = await import('../brand/letterhead')
      marked.setOptions({ gfm: true, breaks: false } as any)
      const renderedBody = marked.parse(markdown || '') as string
      const fullHtml = profilePdfBodyHtml({ bodyHtml: renderedBody, refNumber: opts.ref_number, title: opts.rfp_title })
      await page.setContent(fullHtml, { waitUntil: 'load', timeout: 30000 })
      console.log(`[pdf-render] CPC content set, calling page.pdf()`)
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        displayHeaderFooter: false,
        margin: { top: '0', bottom: '0', left: '0', right: '0' },
        timeout: 60000,
      })
      console.log(`[pdf-render] CPC page.pdf() done, ${pdfBuffer.length} bytes`)
      return Buffer.from(pdfBuffer)
    } else {
      // ── Andersen: reuse the JS paginator from buildPreviewHtml ──
      //
      // The preview paginator already produces exact 794×1123px page divs,
      // each containing header (168px) + body (auto) + footer (112px) as
      // normal block children — no position:fixed, no IPC, no margin tricks.
      //
      // For PDF we inject @media print CSS that:
      //   • sets @page { size: A4; margin: 0 }  — no Puppeteer margins needed
      //   • removes screen chrome (body background, box-shadow, gap between pages)
      //   • forces each .a-page to break onto its own PDF page
      //
      // waitUntil:'networkidle0' ensures the paginator JS has run and all
      // .a-page divs are in the DOM before page.pdf() is called.
      const paginatorHtml = await buildPreviewHtml(markdown, opts)

      // Inject print-only overrides into the <head>
      const printHtml = paginatorHtml.replace('</head>', `
<style>
@media print {
  @page { size: A4; margin: 0; }
  html, body { background: #fff !important; margin: 0; padding: 0; }
  #measure { display: none !important; }
  .a-page {
    width: 794px !important;
    height: 1123px !important;
    min-height: 1123px !important;
    max-height: 1123px !important;
    margin: 0 !important;
    box-shadow: none !important;
    page-break-after: always !important;
    break-after: page !important;
    overflow: hidden !important;
  }
  .a-page:last-child { page-break-after: auto !important; break-after: auto !important; }
}
</style>
</head>`)

      // waitUntil:'load' fires after the DOM is ready; we then wait explicitly
      // for the JS paginator to finish (it populates #pages synchronously on
      // DOMContentLoaded, so by 'load' it's always done).
      await page.setContent(printHtml, { waitUntil: 'load', timeout: 45000 })
      // Extra guard: wait until at least one .a-page exists in the DOM
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await page.waitForFunction(
        () => (globalThis as any).document.querySelectorAll('.a-page').length > 0,
        { timeout: 15000 }
      )
      console.log(`[pdf-render] Andersen paginator done, calling page.pdf()`)
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        displayHeaderFooter: false,
        margin: { top: '0', bottom: '0', left: '0', right: '0' },
        timeout: 60000,
      })
      console.log(`[pdf-render] Andersen page.pdf() done, ${pdfBuffer.length} bytes`)
      return Buffer.from(pdfBuffer)
    }
  } finally {
    await page.close()
  }
}
