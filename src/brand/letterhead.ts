/**
 * src/brand/letterhead.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Andersen corporate letterhead — single source of truth for ALL brand
 * templates: PDF pages, HTML preview, outgoing email wrappers.
 *
 * Design reference: "Andersen Letterhead.html" (uploaded 2026-08-15)
 *   - Yellow band (#FFDB00) with topographic SVG + node marks
 *   - Dotted accent rule below the band
 *   - Wordmark lockup (logo + "Software Engineering / Group · Global")
 *   - Dark navy footer (#020D1C) with Web / Contact / Offices cols + inverted logo
 *
 * Usage:
 *   import { andersenCss, andersenHeader, andersenFooter,
 *            andersenPageHtml, andersenEmailHtml } from '../brand/letterhead'
 *
 * Functions:
 *   andersenCss()           → <style> block (typography, band, footer, print rules)
 *   andersenHeader(logo)    → header HTML (lockup + band + accent)
 *   andersenFooter(logo)    → footer HTML (navy strip)
 *   andersenPageHtml(opts)  → full A4 HTML page around body content (preview/fallback)
 *   andersenEmailHtml(opts) → table-based email HTML (Resend / inbox-compatible)
 *   andersenPdfBodyHtml(opts) → lightweight HTML for Puppeteer A4 PDF (no Roboto CDN)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { logoFullDataUri, cpcHeaderDataUri } from '../brand-assets'
import { getActiveProfile } from '../profiles/index'

// ── Brand tokens ──────────────────────────────────────────────────────────────
export const BRAND = {
  yellow:    '#FFDB00',
  yellowHov: '#FFE963',
  navy:      '#020D1C',
  ink:       '#020303',
  charcoal:  '#3A3E45',
  slate:     '#556170',
  line:      '#E0E0E0',
  mute:      '#ADADAD',
} as const

// ── Topographic band SVG paths ────────────────────────────────────────────────
// Extracted verbatim from the reference letterhead file
const TOPO_SVG = `<svg class="a-topo" viewBox="0 0 794 56" preserveAspectRatio="none" fill="none" style="position:absolute;inset:0;width:100%;height:100%;display:block">
  <path d="M-10 14 Q 100 4, 220 20 T 460 24 Q 580 30, 810 12" stroke="#020303" stroke-width="0.7" stroke-opacity="0.55"/>
  <path d="M-10 28 Q 120 14, 240 34 T 480 38 Q 620 44, 810 26" stroke="#020303" stroke-width="0.7" stroke-opacity="0.45"/>
  <path d="M-10 42 Q 140 26, 260 46 T 500 50 Q 640 58, 810 38" stroke="#020303" stroke-width="0.7" stroke-opacity="0.35"/>
  <circle cx="120" cy="16"  r="3"   fill="#020303"/>
  <circle cx="300" cy="34"  r="2.5" fill="#020303"/>
  <circle cx="460" cy="24"  r="3.5" fill="#020303"/>
  <circle cx="620" cy="44"  r="2.5" fill="#020303"/>
  <circle cx="740" cy="20"  r="3"   fill="#020303"/>
</svg>`

// ── Watermark SVG (body background) ──────────────────────────────────────────
const WATERMARK_SVG = `<svg style="position:absolute;inset:0;width:100%;height:100%;opacity:.05;pointer-events:none" viewBox="0 0 700 700" preserveAspectRatio="xMidYMid slice" fill="none">
  <path d="M-40 220 Q 200 120, 400 260 T 780 300" stroke="#020303" stroke-width="0.5"/>
  <path d="M-40 360 Q 220 240, 420 380 T 780 440" stroke="#020303" stroke-width="0.5"/>
  <path d="M-40 500 Q 240 380, 440 520 T 780 580" stroke="#020303" stroke-width="0.5"/>
  <circle cx="200" cy="230" r="6" fill="#FFDB00"/>
  <circle cx="480" cy="330" r="8" fill="#FFDB00"/>
  <circle cx="640" cy="480" r="5" fill="#FFDB00"/>
</svg>`

// ── Accent tick dots row ──────────────────────────────────────────────────────
const ACCENT_DOTS = `<span class="a-tick"></span>
      <span class="a-tick"></span>
      <span class="a-tick a-node"></span>
      <span class="a-tick"></span>
      <span class="a-tick"></span>
      <span class="a-tick"></span>
      <span class="a-tick a-node"></span>
      <span class="a-tick"></span>
      <span class="a-grow"></span>
      <span class="a-tick"></span>
      <span class="a-tick a-node"></span>
      <span class="a-tick"></span>
      <span class="a-tick"></span>
      <span class="a-tick"></span>
      <span class="a-tick a-node"></span>
      <span class="a-tick"></span>
      <span class="a-tick"></span>`

// ── CSS block shared by preview pages ─────────────────────────────────────────
export function andersenCss(opts: { forPdf?: boolean } = {}): string {
  return `
    :root {
      --a-yellow: #FFDB00; --a-navy: #020D1C; --a-ink: #020303;
      --a-slate: #556170; --a-line: #E0E0E0; --a-mute: #ADADAD;
    }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      background: ${opts.forPdf ? '#fff' : '#EDEEF1'};
      font-family: ${opts.forPdf
        ? "Arial, 'Segoe UI', Helvetica, sans-serif"
        : "Roboto, -apple-system, 'Segoe UI', sans-serif"};
      color: var(--a-ink);
      -webkit-font-smoothing: antialiased;
      ${opts.forPdf ? '' : 'padding: 40px 0;'}
    }

    /* ── Lockup ── */
    .a-lockup {
      padding: 22px 36px 18px;
      display: flex; justify-content: flex-start; align-items: center;
      flex-shrink: 0;
    }
    .a-brand { display: flex; align-items: center; gap: 18px; }
    .a-brand img { height: 44px; width: auto; display: block; }
    .a-divider { width: 1px; height: 30px; background: var(--a-line); }
    .a-tag {
      font-family: ${opts.forPdf ? "'Courier New', monospace" : "'JetBrains Mono', monospace"};
      font-size: 10px; letter-spacing: .22em; text-transform: uppercase;
      color: var(--a-slate); line-height: 1.6;
    }
    .a-tag b { color: var(--a-ink); font-weight: 500; }

    /* ── Top yellow band ── */
    .a-band {
      height: 56px; background: var(--a-yellow);
      position: relative; overflow: hidden; flex-shrink: 0;
    }
    .a-badge {
      position: absolute; top: 50%; transform: translateY(-50%); right: 36px;
      font-family: ${opts.forPdf ? "'Courier New', monospace" : "'JetBrains Mono', monospace"};
      font-size: 10px; letter-spacing: .24em; text-transform: uppercase;
      color: var(--a-ink); opacity: .55;
    }

    /* ── Accent dots rule ── */
    .a-accent {
      height: 22px; display: flex; align-items: center;
      padding: 0 36px; gap: 6px; flex-shrink: 0;
      border-bottom: 1px solid var(--a-line);
    }
    .a-tick { display: block; width: 6px; height: 6px; border-radius: 50%; background: var(--a-line); }
    .a-tick.a-node { background: var(--a-yellow); width: 8px; height: 8px; }
    .a-grow { flex: 1; height: 1px; background: var(--a-line); margin: 0 4px; }

    /* ── Body writing area ── */
    .a-body {
      flex: 1; padding: 32px 64px; position: relative;
    }
    .a-body::before, .a-body::after {
      content: ''; position: absolute; width: 16px; height: 16px;
      border-color: var(--a-line); border-style: solid; border-width: 0;
    }
    .a-body::before { top: 0; left: 52px; border-top-width: 1px; border-left-width: 1px; }
    .a-body::after  { bottom: 0; right: 52px; border-bottom-width: 1px; border-right-width: 1px; }

    /* ── RFP markdown content ── */
    .a-content { font-size: 10.5pt; line-height: 1.65; color: var(--a-ink); }
    .a-content h1 { font-size: 16pt; font-weight: 700; border-bottom: 2px solid var(--a-yellow); padding-bottom: 6pt; margin: 0 0 12pt; page-break-after: avoid; }
    .a-content h2 { font-size: 12pt; font-weight: 700; border-bottom: 1px solid var(--a-line); margin: 18pt 0 6pt; page-break-after: avoid; }
    .a-content h3 { font-size: 10.5pt; font-weight: 700; margin: 12pt 0 4pt; page-break-after: avoid; }
    .a-content h4 { font-size: 10pt; font-weight: 600; color: var(--a-charcoal, #3A3E45); margin: 10pt 0 3pt; }
    .a-content p  { margin: 0 0 8pt; orphans: 3; widows: 3; page-break-inside: avoid; }
    .a-content ul, .a-content ol { margin: 0 0 8pt; padding-left: 20pt; }
    .a-content li { margin-bottom: 3pt; page-break-inside: avoid; }
    .a-content hr { border: none; border-top: 2px solid var(--a-yellow); margin: 16pt 0; }
    .a-content table { width: 100%; border-collapse: collapse; font-size: 9.5pt; margin: 8pt 0 12pt; page-break-inside: avoid; }
    .a-content thead { display: table-header-group; }
    .a-content th { background: var(--a-navy); color: var(--a-yellow); font-weight: 700; padding: 6pt 10pt; text-align: left; border: 1px solid var(--a-navy); }
    .a-content td { padding: 5pt 10pt; border: 1px solid var(--a-line); vertical-align: top; }
    .a-content tr { page-break-inside: avoid; }
    .a-content tr:nth-child(even) td { background: #f9fafb; }
    .a-content blockquote { border-left: 4px solid var(--a-yellow); margin: 8pt 0; padding: 6pt 12pt; background: #fffef0; page-break-inside: avoid; }
    .a-content code { font-family: 'Courier New', monospace; font-size: 9pt; background: #f3f4f6; padding: 1pt 3pt; border-radius: 2pt; }
    .a-content pre  { background: #f3f4f6; padding: 10pt; border-radius: 4pt; margin: 8pt 0; page-break-inside: avoid; }
    .a-content pre code { background: transparent; padding: 0; }
    .a-content strong { color: #111827; }

    /* ── Footer ── */
    .a-foot {
      background: var(--a-navy); color: #B8C0CB;
      padding: 22px 36px; display: flex;
      justify-content: space-between; align-items: center;
      flex-shrink: 0; font-size: 10px; letter-spacing: .05em;
      position: relative; overflow: hidden;
    }
    .a-foot-cols { display: flex; gap: 36px; }
    .a-foot-col .a-k {
      font-family: ${opts.forPdf ? "'Courier New', monospace" : "'JetBrains Mono', monospace"};
      font-size: 9px; letter-spacing: .2em; text-transform: uppercase;
      color: var(--a-yellow); margin-bottom: 4px;
    }
    .a-foot-col .a-v { font-size: 10px; color: #D8DEE8; line-height: 1.5; }
    .a-foot-col .a-v a { color: inherit; text-decoration: none; }
    .a-foot-right { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }
    .a-foot-right img { height: 20px; width: auto; filter: brightness(0) invert(1); opacity: .9; }
    .a-foot-right .a-mono {
      font-family: ${opts.forPdf ? "'Courier New', monospace" : "'JetBrains Mono', monospace"};
      font-size: 9px; letter-spacing: .2em; text-transform: uppercase; color: var(--a-yellow);
    }

    /* ── A4 page container (preview only) ── */
    .a-page {
      width: 794px; min-height: 1123px;
      margin: 0 auto; background: #fff;
      position: relative;
      display: flex; flex-direction: column;
      ${opts.forPdf ? '' : 'box-shadow: 0 12px 48px rgba(20,25,35,.18);'}
    }

    /* ── Print rules ── */
    @media print {
      body { background: #fff; padding: 0; }
      .a-page { box-shadow: none; margin: 0; }
      @page { size: A4; margin: 0; }
      * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      .no-print { display: none !important; }
      h2, h3 { page-break-after: avoid; }
    }
  `
}

// ── Header block: lockup + yellow band + accent rule ─────────────────────────
export function andersenHeader(logo: string = logoFullDataUri): string {
  return `
  <!-- Andersen Letterhead: Wordmark Lockup -->
  <div class="a-lockup">
    <div class="a-brand">
      <img src="${logo}" alt="Andersen" />
      <div class="a-divider"></div>
      <div class="a-tag"><b>Software Engineering</b><br/>Group &middot; Global</div>
    </div>
  </div>

  <!-- Andersen Letterhead: Yellow Topo Band -->
  <div class="a-band">
    ${TOPO_SVG}
    <div class="a-badge">Andersen &middot; Est. 2007</div>
  </div>

  <!-- Andersen Letterhead: Dotted Accent Rule -->
  <div class="a-accent">
    ${ACCENT_DOTS}
  </div>`
}

// ── Footer block: navy strip with columns ─────────────────────────────────────
export function andersenFooter(
  logo: string = logoFullDataUri,
  opts: { email?: string; year?: number } = {}
): string {
  const p     = getActiveProfile()
  const email = opts.email || p.procurementEmail
  const year  = opts.year  || new Date().getFullYear()
  return `
  <!-- Andersen Letterhead: Footer -->
  <div class="a-foot">
    <div class="a-foot-cols">
      <div class="a-foot-col">
        <div class="a-k">Web</div>
        <div class="a-v">${p.procurementEmail.replace(/^[^@]+@/, '')}</div>
      </div>
      <div class="a-foot-col">
        <div class="a-k">Contact</div>
        <div class="a-v"><a href="mailto:${email}">${email}</a></div>
      </div>
      <div class="a-foot-col">
        <div class="a-k">Offices</div>
        <div class="a-v">${p.orgLocation}</div>
      </div>
    </div>
    <div class="a-foot-right">
      <img src="${logo}" alt="${p.orgNameShort}" />
      <div class="a-mono">&copy; ${p.orgNameShort} ${year}</div>
    </div>
  </div>`
}

// ── Full A4 page HTML (for browser preview / print fallback) ──────────────────
export function andersenPageHtml(opts: {
  title:      string
  bodyHtml:   string
  logo?:      string
  email?:     string
  refNumber?: string
  showToolbar?: boolean
}): string {
  const logo  = opts.logo  || logoFullDataUri
  const title = (opts.title || 'RFP').replace(/</g, '&lt;')
  const ref   = (opts.refNumber || '').replace(/</g, '&lt;')

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=794,initial-scale=1"/>
<title>${title}</title>
<link href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>${andersenCss()}</style>
</head>
<body>
${opts.showToolbar ? `
<div class="no-print" style="position:fixed;top:0;left:0;right:0;z-index:9999;background:#020303;color:#fff;padding:10px 24px;display:flex;align-items:center;justify-content:space-between;font-family:Arial,sans-serif;font-size:13px;box-shadow:0 2px 8px rgba(0,0,0,0.3)">
  <div style="display:flex;align-items:center;gap:12px">
    <span style="font-weight:700;letter-spacing:.05em">Andersen — RFP Document</span>
    <span style="opacity:.6;font-size:11px">${ref}</span>
  </div>
  <div style="display:flex;gap:10px">
    <button onclick="window.print()" style="background:#FFDB00;color:#020303;border:none;padding:7px 20px;border-radius:5px;font-size:13px;font-weight:600;cursor:pointer">&#x2193; Save as PDF / Print</button>
    <button onclick="window.close()" style="background:transparent;color:#ccc;border:1px solid #555;padding:7px 14px;border-radius:5px;font-size:12px;cursor:pointer">Close</button>
  </div>
</div>
<div class="no-print" style="height:52px"></div>
` : ''}

<div class="a-page">
  ${andersenHeader(logo)}

  <!-- Body -->
  <div class="a-body">
    ${WATERMARK_SVG}
    <div class="a-content">
      ${opts.bodyHtml}
    </div>
  </div>

  ${andersenFooter(logo, { email: opts.email })}
</div>
</body>
</html>`
}

// ── Lightweight PDF body HTML (for Puppeteer /render-md-pdf) ─────────────────
// No Google Fonts CDN — Puppeteer networkidle0 waits for external requests.
// Instead we use system fonts that Puppeteer's bundled Chromium has.
// The header/footer are injected by Puppeteer's displayHeaderFooter mechanism.
export function andersenPdfBodyHtml(opts: {
  bodyHtml: string   // already-rendered HTML (from marked.parse)
  logo?:    string
}): string {
  const logo = opts.logo || logoFullDataUri
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<style>
${andersenCss({ forPdf: true })}
/* Puppeteer adds header/footer via displayHeaderFooter — no extra padding needed here.
   Margins are controlled by the page.pdf() margin option. */
.a-lockup, .a-band, .a-accent, .a-foot { display: none; }
</style>
</head>
<body style="background:#fff;padding:0">
<div class="a-body" style="padding:0">
  <div class="a-content">
    ${opts.bodyHtml}
  </div>
</div>
</body>
</html>`
}

// ── Puppeteer header/footer templates ─────────────────────────────────────────
// These are self-contained HTML snippets passed to page.pdf().
// Rules: inline styles only, no external CSS, font-size must be explicit.
export function andersenPdfHeaderTemplate(opts: {
  logo?:      string
  refNumber?: string
}): string {
  const logo = opts.logo || logoFullDataUri
  const ref  = escHtml(opts.refNumber || '')
  // Topo SVG as inline background — slimmed down for header strip
  return `<div style="
    width:100%;height:100%;
    background:#FFDB00;
    display:flex;align-items:center;justify-content:space-between;
    padding:0 16mm;
    font-family:Arial,sans-serif;
    box-sizing:border-box;
    position:relative;overflow:hidden;
  ">
    <svg style="position:absolute;inset:0;width:100%;height:100%" viewBox="0 0 794 56" preserveAspectRatio="none" fill="none">
      <path d="M-10 14 Q 100 4, 220 20 T 460 24 Q 580 30, 810 12" stroke="#020303" stroke-width="0.7" stroke-opacity="0.45"/>
      <path d="M-10 28 Q 120 14, 240 34 T 480 38 Q 620 44, 810 26" stroke="#020303" stroke-width="0.7" stroke-opacity="0.35"/>
      <circle cx="120" cy="16" r="3"   fill="#020303" opacity="0.5"/>
      <circle cx="460" cy="24" r="3.5" fill="#020303" opacity="0.5"/>
      <circle cx="740" cy="20" r="3"   fill="#020303" opacity="0.5"/>
    </svg>
    <img src="${logo}" style="height:20px;position:relative;z-index:1" />
    <span style="font-size:8pt;letter-spacing:.1em;text-transform:uppercase;color:#020303;opacity:.6;position:relative;z-index:1">${ref}</span>
  </div>`
}

export function andersenPdfFooterTemplate(opts: {
  email?: string
} = {}): string {
  const p     = getActiveProfile()
  const email = escHtml(opts.email || p.procurementEmail)
  const year  = new Date().getFullYear()
  return `<div style="
    width:100%;height:100%;
    background:#020D1C;
    display:flex;align-items:center;justify-content:space-between;
    padding:0 16mm;
    font-family:Arial,sans-serif;
    font-size:8pt;
    box-sizing:border-box;
  ">
    <span style="color:#FFDB00;letter-spacing:.1em;font-size:7.5pt">&copy; ${p.orgNameShort} ${year} &nbsp;&middot;&nbsp; ${email}</span>
    <span style="color:#9ca3af">
      Page <span class="pageNumber"></span> of <span class="totalPages"></span>
    </span>
  </div>`
}

// ── Table-based HTML email wrapper ─────────────────────────────────────────────
// Email clients strip <style> blocks and most block-level CSS.
// All styling must be inline. Uses table layout for maximum compatibility.
// Matches the letterhead design: yellow top rule, navy header/footer, ink body.
export function andersenEmailHtml(opts: {
  bodyText:    string   // plain text — will be escaped and line-break converted
  subject?:   string
  refNumber?: string
  email?:     string
}): string {
  const p     = getActiveProfile()
  const email = opts.email || p.procurementEmail
  const year  = new Date().getFullYear()
  const safeBody = (opts.bodyText || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>')

  // Inline topo SVG for email — simplified (many email clients block complex SVG)
  // We use a flat yellow bar + dotted rule to represent the brand band instead.
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${escHtml(opts.subject || p.orgNameShort + ' Procurement')}</title></head>
<body style="margin:0;padding:0;background:#EDEEF1;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif">

<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#EDEEF1;padding:32px 0">
<tr><td align="center">
<table width="620" cellpadding="0" cellspacing="0" border="0" style="max-width:620px;width:100%">

  <!-- ── Wordmark row ── -->
  <tr>
    <td style="background:#fff;padding:18px 36px 12px;border-radius:12px 12px 0 0;border:1px solid #E0E0E0;border-bottom:none">
      <table cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="padding-right:14px;vertical-align:middle">
            <!-- Andersen diamond glyph — SVG inline icon (works in most email clients) -->
            <svg width="36" height="36" viewBox="0 0 44 44" xmlns="http://www.w3.org/2000/svg" style="display:block">
              <polygon points="22,2 42,22 22,42 2,22" fill="none" stroke="#FFDB00" stroke-width="2.5"/>
              <polygon points="22,9 35,22 22,35 9,22" fill="#FFDB00"/>
            </svg>
          </td>
          <td style="vertical-align:middle;border-left:1px solid #E0E0E0;padding-left:14px">
            <div style="font-family:Georgia,'Times New Roman',serif;font-size:20px;font-weight:700;color:#020303;letter-spacing:.03em;line-height:1.15">Andersen</div>
            <div style="font-family:'Courier New',monospace;font-size:8px;font-weight:700;letter-spacing:.22em;text-transform:uppercase;color:#556170;margin-top:3px">Software Engineering &nbsp;&middot;&nbsp; Group &middot; Global</div>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- ── Yellow topo band ── -->
  <tr>
    <td style="background:#FFDB00;height:48px;padding:0 36px;border-left:1px solid #E0E0E0;border-right:1px solid #E0E0E0;position:relative">
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td>
            <!-- Simplified topo mark — dots only (SVG paths unreliable in Gmail) -->
            <table cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td width="6" height="6" style="background:#E0E0E0;border-radius:3px"></td>
                <td width="4"></td>
                <td width="6" height="6" style="background:#E0E0E0;border-radius:3px"></td>
                <td width="4"></td>
                <td width="8" height="8" style="background:#020303;border-radius:4px;opacity:.6"></td>
                <td width="4"></td>
                <td width="6" height="6" style="background:#E0E0E0;border-radius:3px"></td>
              </tr>
            </table>
          </td>
          <td align="right" style="font-family:'Courier New',monospace;font-size:9px;letter-spacing:.2em;text-transform:uppercase;color:#020303;opacity:.55">Andersen &middot; Est. 2007</td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- ── Gold top-rule separator ── -->
  <tr><td style="background:#FFDB00;height:3px;font-size:0;line-height:0;border-left:1px solid #E0E0E0;border-right:1px solid #E0E0E0">&nbsp;</td></tr>

  <!-- ── Body ── -->
  <tr>
    <td style="background:#fff;padding:36px 36px 28px;border-left:1px solid #E0E0E0;border-right:1px solid #E0E0E0">
      <div style="font-size:14px;line-height:1.75;color:#020303">${safeBody}</div>
    </td>
  </tr>

  <!-- ── Dotted separator ── -->
  <tr>
    <td style="background:#F8F9FA;height:1px;font-size:0;line-height:0;border-left:1px solid #E0E0E0;border-right:1px solid #E0E0E0">&nbsp;</td>
  </tr>

  <!-- ── Navy footer ── -->
  <tr>
    <td style="background:#020D1C;border-radius:0 0 12px 12px;padding:20px 36px">
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td>
            <table cellpadding="0" cellspacing="0" border="0" style="margin-bottom:10px">
              <tr>
                <td style="padding-right:28px;vertical-align:top">
                  <div style="font-family:'Courier New',monospace;font-size:8px;letter-spacing:.2em;text-transform:uppercase;color:#FFDB00;margin-bottom:3px">Web</div>
                  <div style="font-size:10px;color:#D8DEE8">andersenlab.com</div>
                </td>
                <td style="padding-right:28px;vertical-align:top">
                  <div style="font-family:'Courier New',monospace;font-size:8px;letter-spacing:.2em;text-transform:uppercase;color:#FFDB00;margin-bottom:3px">Contact</div>
                  <div style="font-size:10px;color:#D8DEE8"><a href="mailto:${email}" style="color:#D8DEE8;text-decoration:none">${email}</a></div>
                </td>
                <td style="vertical-align:top">
                  <div style="font-family:'Courier New',monospace;font-size:8px;letter-spacing:.2em;text-transform:uppercase;color:#FFDB00;margin-bottom:3px">Offices</div>
                  <div style="font-size:10px;color:#D8DEE8">${p.orgLocation}</div>
                </td>
              </tr>
            </table>
            <div style="font-family:'Courier New',monospace;font-size:7.5px;color:#4a6080;letter-spacing:.08em;text-transform:uppercase">&copy; ${p.orgNameShort} ${year} &nbsp;&middot;&nbsp; Official Procurement Correspondence</div>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- ── Disclaimer ── -->
  <tr>
    <td style="padding:14px 0 0;text-align:center">
      <div style="font-size:10px;color:#6b7280;line-height:1.5">This is an official procurement communication from Andersen.<br>
      Please do not reply to this message unless instructed to do so.</div>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>`
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROFILE-AWARE UNIFIED FUNCTIONS
// These read the active profile and dispatch to the correct brand template.
// All call sites in api/index.ts should use these instead of the andersen-
// specific functions above.
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * profileEmailHtml — generates branded email HTML for the active profile.
 * Andersen: yellow topo band + navy footer (existing andersenEmailHtml)
 * CPC: dark navy header with gold text + minimal footer
 */
export function profileEmailHtml(opts: {
  bodyText:   string
  subject?:   string
  refNumber?: string
  email?:     string
}): string {
  const p = getActiveProfile()
  const email = opts.email || p.procurementEmail
  if (p.id === 'andersen') {
    return andersenEmailHtml({ ...opts, email })
  }
  // ── CPC email template ────────────────────────────────────────────────────
  const year = new Date().getFullYear()
  const safeBody = (opts.bodyText || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>')
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${escHtml(opts.subject || "Crown Prince's Court Procurement")}</title></head>
<body style="margin:0;padding:0;background:#F0EDE8;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif">

<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F0EDE8;padding:32px 0">
<tr><td align="center">
<table width="620" cellpadding="0" cellspacing="0" border="0" style="max-width:620px;width:100%">

  <!-- ── CPC Header ── -->
  <tr>
    <td style="background:#1a1a2e;padding:20px 36px;border-radius:12px 12px 0 0">
      <table cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr>
          <td>
            <div style="font-size:16px;font-weight:700;color:#c9a84c;font-family:Georgia,serif">Crown Prince's Court</div>
            <div style="font-size:11px;color:#e5c87a;margin-top:3px;font-family:Arial,sans-serif">Procurement &amp; Contracting Department</div>
            <div style="font-size:10px;color:#8899aa;margin-top:2px;font-family:Arial,sans-serif">${email}</div>
          </td>
          <td align="right" style="font-family:Arial,sans-serif;font-size:10px;color:#8899aa;direction:rtl">
            ديوان ولي العهد<br>أبوظبي، الإمارات العربية المتحدة
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- ── Gold rule ── -->
  <tr><td style="background:#c9a84c;height:3px;font-size:0;line-height:0">&nbsp;</td></tr>

  <!-- ── Body ── -->
  <tr>
    <td style="background:#fff;padding:36px 36px 28px;border:1px solid #E7DFCE;border-top:none">
      <div style="font-size:14px;line-height:1.75;color:#1B1712;font-family:Arial,sans-serif">${safeBody}</div>
    </td>
  </tr>

  <!-- ── Ivory footer ── -->
  <tr>
    <td style="background:#F5EFE3;border-radius:0 0 12px 12px;padding:16px 36px;border:1px solid #E7DFCE;border-top:none">
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td>
            <div style="font-size:10px;color:#745B35;font-family:Arial,sans-serif">
              <strong>Crown Prince's Court</strong> &nbsp;|&nbsp; Procurement &amp; Contracting Department<br>
              Abu Dhabi, United Arab Emirates &nbsp;|&nbsp; <a href="mailto:${email}" style="color:#745B35">${email}</a>
            </div>
            <div style="margin-top:6px;font-size:9px;color:#9ca3af;font-family:Arial,sans-serif">
              &copy; ${year} Crown Prince's Court. This document is CONFIDENTIAL.<br>
              هذه المراسلة سرية ومخصصة للمستلم المحدد فقط.
            </div>
          </td>
        </tr>
      </table>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>`
}

/**
 * profilePdfBodyHtml — generates a full A4 HTML document for Puppeteer PDF rendering.
 * Andersen: inline topo SVG header + navy footer (existing andersenPdfBodyHtml)
 * CPC: background image letterhead (bg_a4.png) with content overlaid
 */
export function profilePdfBodyHtml(opts: {
  bodyHtml:   string
  refNumber?: string
  title?:     string
}): string {
  const p = getActiveProfile()
  if (p.id === 'andersen') {
    return andersenPdfBodyHtml({ bodyHtml: opts.bodyHtml })
  }
  // ── CPC PDF: two-zone model — header image (15%) + content (85%), no footer ──
  //
  // Zone allocation (A4 at 96 dpi = 794 × 1123 px):
  //   Header : 129 px  →  48.3 mm  (image natural height at 794px width)
  //   Content: remaining space below header
  //
  // The header image is served as an inline data URI so Puppeteer never
  // makes a network request (it runs on Azure with no local static server).
  // position:fixed + background-image pulls the header into the @page top-margin
  // zone and repeats on every page. background-image renders synchronously
  // (no async img load), which is critical for Puppeteer correctness.
  const { fontFamily, bodyColor, accentBorderColor } = p.pdf
  const CPC_HDR_MM   = '48.3mm'   // 129px / 794px × 297mm
  const CPC_SIDE_MM  = '16mm'
  const CPC_BOT_MM   = '10mm'
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  *, *::before, *::after { margin:0; padding:0; box-sizing:border-box; }
  body { background:#fff; font-family:${fontFamily}; color:${bodyColor}; }

  /* Two-zone layout: top margin = header zone (15%), no bottom chrome */
  @page { size: A4; margin: ${CPC_HDR_MM} ${CPC_SIDE_MM} ${CPC_BOT_MM} ${CPC_SIDE_MM}; }

  /* Header zone: fixed, pulled into @page top margin — repeats every page.
     Use background-image (not <img>) so Puppeteer renders synchronously.
     left/right negative offsets expand to full A4 width; no explicit px width. */
  .cpc-pdf-hd {
    position: fixed;
    top: -${CPC_HDR_MM};
    left: -${CPC_SIDE_MM};
    right: -${CPC_SIDE_MM};
    height: 129px;
    background-image: url('${cpcHeaderDataUri}');
    background-size: 100% 100%;
    background-repeat: no-repeat;
    background-position: top center;
    overflow: hidden;
    z-index: 1000;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  /* Content zone: 85% of A4, starts below header */
  .cpc-pdf-body { padding: 12pt 0 0; }

  /* Typography */
  h1 { font-size:18pt; font-weight:700; color:${bodyColor}; margin:0 0 12pt; line-height:1.2; border-bottom:2px solid #BA9765; padding-bottom:6pt; page-break-after:avoid; }
  h2 { font-size:13pt; font-weight:700; color:${bodyColor}; margin:16pt 0 6pt; border-bottom:1px solid ${accentBorderColor}; padding-bottom:3pt; page-break-after:avoid; }
  h3 { font-size:11pt; font-weight:700; color:${bodyColor}; margin:11pt 0 4pt; page-break-after:avoid; }
  h4 { font-size:10.5pt; font-weight:600; color:#745B35; margin:9pt 0 3pt; }
  p  { font-size:10.5pt; line-height:1.65; color:${bodyColor}; margin:0 0 7pt; orphans:3; widows:3; }
  ul, ol { font-size:10.5pt; line-height:1.65; color:${bodyColor}; padding-left:18pt; margin:0 0 7pt; }
  li { margin-bottom:3pt; page-break-inside:avoid; }
  hr { border:none; border-top:2px solid #BA9765; margin:14pt 0; }
  table { width:100%; border-collapse:collapse; font-size:10pt; margin:6pt 0 10pt; page-break-inside:avoid; }
  thead { display:table-header-group; }
  th { background:#FAF7F0; color:#745B35; font-weight:700; padding:6pt 10pt; text-align:left; border:1px solid #E9DCC4; font-family:'JetBrains Mono','Courier New',monospace; font-size:9pt; letter-spacing:0.04em; }
  td { padding:5pt 10pt; border:1px solid #E9DCC4; vertical-align:top; }
  tr { page-break-inside:avoid; }
  tr:nth-child(even) td { background:#FAF7F0; }
  blockquote { border-left:4px solid #BA9765; margin:8pt 0; padding:6pt 12pt; background:#FAF7F0; page-break-inside:avoid; }
  code { font-family:'Courier New',monospace; font-size:9pt; background:#f3f4f6; padding:1pt 3pt; border-radius:2pt; }
  pre  { background:#f3f4f6; padding:8pt; border-radius:3pt; margin:6pt 0; page-break-inside:avoid; }
  pre code { background:transparent; padding:0; }
  strong { color:#3A332B; }
  * { -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; }
</style>
</head>
<body>
<!-- CPC Header zone: fixed at top, repeats on every PDF page -->
<div class="cpc-pdf-hd"></div>
<!-- Content zone: 85% of A4 — bounded by @page top margin above -->
<div class="cpc-pdf-body">
  ${opts.bodyHtml}
</div>
</body>
</html>`
}

/**
 * profilePageHtml — generates a full A4 HTML page for browser preview / print fallback.
 * Andersen: existing topo-band letterhead (andersenPageHtml).
 * CPC:      clean ivory page with CPC header bar and profile fonts.
 */
export function profilePageHtml(opts: {
  title:       string
  bodyHtml:    string
  logo?:       string
  email?:      string
  refNumber?:  string
  showToolbar?: boolean
}): string {
  const p = getActiveProfile()
  if (p.id === 'andersen') {
    return andersenPageHtml(opts)
  }
  // ── CPC page HTML: two-zone paginated preview ────────────────────────────
  // Matches the PDF exactly:
  //   • Each .cpc-page = 794×1123px card
  //   • Header zone: 168px (15%) — cpc-header.png scaled to full 794px width
  //   • Content zone: 955px (85%) — RFP body text
  //   • No footer zone (two-zone model)
  //
  // JS paginator slices the body HTML across pages identically to Andersen,
  // using BODY_H (955 - 16px top-pad = 939px usable) as the breakpoint.
  const title    = escHtml(opts.title || 'RFP')
  const refBadge = escHtml(opts.refNumber || '')
  const email    = opts.email || p.procurementEmail
  const year     = new Date().getFullYear()

  // Header block injected into every page card
  // Header image: width:100% fills the 794px page card; height:auto preserves
  // the natural aspect ratio so it scales correctly in any viewport/iframe.
  const cpcPageHeaderHtml = `<div class="cpc-pg-hd" style="width:100%;overflow:hidden;flex-shrink:0;"><img src="${cpcHeaderDataUri}" style="display:block;width:100%;height:auto;" alt="Crown Prince's Court" /></div>`

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=794,initial-scale=1"/>
<title>${title}</title>
<link href="${p.fonts.googleFontsUrl}" rel="stylesheet">
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { background: #E9DCC4; }

  /* ── A4 page card ── */
  .cpc-page {
    width: 794px; min-height: 1123px;
    background: #fff;
    margin: 24px auto;
    box-shadow: 0 2px 12px rgba(0,0,0,0.15);
    display: flex; flex-direction: column;
    overflow: hidden;
    page-break-after: always;
  }
  /* Header zone: width:100% of the 794px card; height follows natural image aspect ratio */
  .cpc-pg-hd { flex: 0 0 auto; width: 100%; overflow: hidden; }
  .cpc-pg-hd img { display:block; width:100%; height:auto; }
  /* Content zone: 85% = 955px — flex:1 fills remaining space (no footer div) */
  .cpc-pg-body {
    flex: 1 1 auto;
    padding: 16px 56px 20px;
    overflow: hidden;
    font-family: ${p.fonts.body};
    font-size: 10.5pt;
    line-height: 1.65;
    color: ${p.css.ink};
  }

  /* Typography */
  .cpc-pg-body h1 { font-family: ${p.fonts.display}; font-size: 18pt; font-weight: 700; border-bottom: 2px solid #BA9765; padding-bottom: 6pt; margin: 0 0 14pt; page-break-after: avoid; }
  .cpc-pg-body h2 { font-size: 12pt; font-weight: 700; color: ${p.css.ink}; border-bottom: 1px solid #E9DCC4; margin: 14pt 0 5pt; padding-bottom: 3pt; page-break-after: avoid; }
  .cpc-pg-body h3 { font-size: 10.5pt; font-weight: 700; color: ${p.css.inkMid}; margin: 10pt 0 3pt; page-break-after: avoid; }
  .cpc-pg-body h4 { font-size: 10pt; font-weight: 600; color: #745B35; margin: 8pt 0 2pt; }
  .cpc-pg-body p  { margin: 0 0 7pt; orphans: 3; widows: 3; }
  .cpc-pg-body ul, .cpc-pg-body ol { margin: 0 0 7pt; padding-left: 20pt; }
  .cpc-pg-body li { margin-bottom: 2pt; page-break-inside: avoid; }
  .cpc-pg-body hr { border: none; border-top: 2px solid #BA9765; margin: 16pt 0; }
  .cpc-pg-body table { width: 100%; border-collapse: collapse; font-size: 9.5pt; margin: 8pt 0 12pt; page-break-inside: avoid; }
  .cpc-pg-body thead { display: table-header-group; }
  .cpc-pg-body th { background: #FAF7F0; color: #745B35; font-weight: 700; padding: 6pt 10pt; text-align: left; border: 1px solid #E9DCC4; font-family: ${p.fonts.mono}; font-size: 9pt; letter-spacing: 0.04em; }
  .cpc-pg-body td { padding: 5pt 10pt; border: 1px solid #E9DCC4; vertical-align: top; }
  .cpc-pg-body tr { page-break-inside: avoid; }
  .cpc-pg-body tr:nth-child(even) td { background: #FAF7F0; }
  .cpc-pg-body blockquote { border-left: 4px solid #BA9765; margin: 8pt 0; padding: 6pt 12pt; background: #FAF7F0; page-break-inside: avoid; }
  .cpc-pg-body code { font-family: ${p.fonts.mono}; font-size: 9pt; background: #f3f4f6; padding: 1pt 3pt; border-radius: 2pt; }
  .cpc-pg-body pre  { background: #f3f4f6; padding: 10pt; border-radius: 4pt; margin: 8pt 0; page-break-inside: avoid; }
  .cpc-pg-body pre code { background: transparent; padding: 0; }
  .cpc-pg-body strong { color: #3A332B; }

  /* Hidden measurement div */
  #cpc-measure { position:fixed; top:-9999px; left:0; width:682px; visibility:hidden; pointer-events:none;
    font-family:${p.fonts.body}; font-size:10.5pt; line-height:1.65; color:${p.css.ink}; }

  @media print {
    html, body { background: #fff !important; margin: 0; padding: 0; }
    #cpc-measure { display: none !important; }
    .cpc-page {
      width: 794px !important; height: 1123px !important; min-height: 1123px !important;
      max-height: 1123px !important; margin: 0 !important; box-shadow: none !important;
      page-break-after: always !important; break-after: page !important; overflow: hidden !important;
    }
    .cpc-page:last-child { page-break-after: auto !important; break-after: auto !important; }
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  }
</style>
</head>
<body>
${opts.showToolbar ? `
<div class="no-print" style="position:fixed;top:0;left:0;right:0;z-index:9999;background:${p.css.sidebarBg};color:${p.css.accent};padding:10px 24px;display:flex;align-items:center;justify-content:space-between;font-family:Arial,sans-serif;font-size:13px;box-shadow:0 2px 8px rgba(0,0,0,0.3);border-bottom:2px solid ${p.css.accent}">
  <div style="display:flex;align-items:center;gap:12px">
    <span style="font-weight:700;letter-spacing:.05em">${p.orgNameShort} \u2014 RFP Document</span>
    <span style="opacity:.6;font-size:11px">${refBadge}</span>
  </div>
  <div style="display:flex;gap:10px">
    <button onclick="window.print()" style="background:${p.css.accent};color:#fff;border:none;padding:7px 20px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer">&#x2193; Save as PDF / Print</button>
    <button onclick="window.close()" style="background:transparent;color:${p.css.inkMuted};border:1px solid ${p.css.line};padding:7px 14px;border-radius:8px;font-size:12px;cursor:pointer">Close</button>
  </div>
</div>
<div class="no-print" style="height:52px"></div>
` : ''}
<!-- Hidden measurement div for JS paginator -->
<div id="cpc-measure"><div id="cpc-measure-content">${opts.bodyHtml}</div></div>
<div id="cpc-pages"></div>
<script>
(function(){
  var PAGE_W     = 794;
  var PAGE_H     = 1123;
  var HDR_H      = 129;    // natural height of 794px-wide header image
  var BODY_PAD_T = 16;     // .cpc-pg-body padding-top
  var BODY_PAD_B = 20;     // .cpc-pg-body padding-bottom
  var BODY_H     = PAGE_H - HDR_H - BODY_PAD_T - BODY_PAD_B;  // 958px usable
  var pageHeaderHtml = ${JSON.stringify(cpcPageHeaderHtml)};

  function makePageDiv(bodyInner) {
    var div = document.createElement('div');
    div.className = 'cpc-page';
    div.innerHTML = pageHeaderHtml + '<div class="cpc-pg-body">' + bodyInner + '</div>';
    return div;
  }

  function paginate() {
    var measureContent = document.getElementById('cpc-measure-content');
    if (!measureContent) return;

    var slices  = [[]];
    var heights = [0];

    function currentH() { return heights[heights.length - 1]; }
    function newPage()  { slices.push([]); heights.push(0); }
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
        var tableOpen = '<table style="' + (el.getAttribute('style') || '') + '">';
        var tableClose = '</table>';
        for (var ri = 0; ri < rows.length; ri++) {
          var row = rows[ri];
          if (row.closest('thead')) continue;
          var rowH = row.offsetHeight || 24;
          if (currentH() + rowH > BODY_H && currentH() > 0) newPage();
          addHtml(tableOpen + (theadHtml ? '<thead>' + theadHtml + '</thead>' : '') + '<tbody>' + row.outerHTML + '</tbody>' + tableClose, rowH);
        }
        return;
      }

      var h = el.offsetHeight || 0;
      if (h === 0) { addHtml(el.outerHTML, 0); return; }

      if (currentH() + h > BODY_H && currentH() > 0) newPage();
      if (h > BODY_H) {
        // Element taller than one page — force onto current page
        addHtml(el.outerHTML, h);
      } else {
        addHtml(el.outerHTML, h);
      }
    }

    var children = measureContent.children;
    for (var i = 0; i < children.length; i++) processElement(children[i]);

    var pages = document.getElementById('cpc-pages');
    if (!pages) return;
    for (var p = 0; p < slices.length; p++) {
      var pageDiv = makePageDiv(slices[p].join(''));
      pages.appendChild(pageDiv);
    }
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

// ── Internal: HTML entity escape ─────────────────────────────────────────────
function escHtml(s: string): string {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}
