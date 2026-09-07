"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSubmitPage = getSubmitPage;
const index_1 = require("./profiles/index");
const brand_assets_1 = require("./brand-assets");
function getSubmitPage(rfpId, participantCode) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${(0, index_1.getActiveProfile)().vendorPortal.pageTitle}</title>

  <!-- Andersen Brand Fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
  <link href="${(0, index_1.getActiveProfile)().fonts.googleFontsUrl}" rel="stylesheet"/>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css"/>

  <style>
    /* ── Brand asset data URIs — guaranteed rendering regardless of path routing ── */
    :root {
      --brand-logo-full: url("${brand_assets_1.logoFullDataUri}");
      --brand-bg-dark:   url("${brand_assets_1.bgDarkDataUri}");
      --brand-bg-light:  url("${brand_assets_1.bgLightDataUri}");
    }
  </style>
  <style>
    /* ── Andersen Design Tokens ── */
    :root {
      --cpc-gold:        #FFDB00;
      --cpc-gold-deep:   #3A3E45;
      --cpc-gold-tint:   #FFFBEC;
      --cpc-gold-line:   #E0E0E0;
      --cpc-ivory:       #F7F7F7;
      --cpc-ink:         #020303;
      --cpc-ink-mid:     #3A3E45;
      --cpc-ink-muted:   #556170;
      --cpc-line:        #E0E0E0;
      --cpc-white:       #FFFFFF;
      --cpc-success:     #2E7D52;
      --cpc-success-bg:  #EDFAF3;
      --cpc-success-bdr: #A8D5BC;
      --cpc-error:       #8B2020;
      --cpc-error-bg:    #FDF2F2;
      --cpc-error-bdr:   #F5C0C0;
      /* Andersen primaries */
      --a-yellow:        #FFDB00;
      --a-navy:          #020D1C;
      --a-ink:           #020303;
      --a-charcoal:      #3A3E45;

      --font-display: 'Roboto', system-ui, sans-serif;
      --font-body:    'Roboto', system-ui, sans-serif;
      --font-mono:    'JetBrains Mono', 'Courier New', monospace;
      --font-arabic:  'Noto Sans Arabic', sans-serif;
    }

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: var(--font-body);
      /* Light wave-line brand texture — inlined as data URI for guaranteed rendering */
      background: #EFEFEF var(--brand-bg-light) center top / cover fixed;
      min-height: 100vh;
      color: var(--cpc-ink);
      -webkit-font-smoothing: antialiased;
    }

    /* ── Header — dark brand texture + navy overlay ── */
    .header {
      /* Gradient overlay dims the charcoal texture; right-align shows the flame lines */
      background:
        linear-gradient(180deg, rgba(2,13,28,0.72) 0%, rgba(2,13,28,0.60) 100%),
        var(--brand-bg-dark) right center / auto 100% no-repeat;
      border-bottom: 4px solid var(--a-yellow);
      padding: 0;
      position: relative;
    }
    .header::before {
      content: '';
      position: absolute;
      inset: 0;
      background: rgba(2,13,28,0.68);
      pointer-events: none;
    }
    .header-inner {
      position: relative;
      z-index: 1;
      max-width: 860px;
      margin: 0 auto;
      padding: 22px 32px;
      display: flex;
      align-items: center;
      gap: 24px;
    }
    /* Full logo PNG (icon glyph + ANDERSEN wordmark) — 1024×267 landscape */
    .header-logo-full {
      display: block;
      height: 40px;
      width: auto;
      max-width: 220px;
      object-fit: contain;
      object-position: left center;
      flex-shrink: 0;
    }
    .header-divider {
      width: 1px;
      height: 44px;
      background: rgba(255,255,255,0.18);
      flex-shrink: 0;
    }
    .header-text {}
    .header-text .sub {
      font-family: var(--font-mono);
      font-size: 0.65rem;
      color: rgba(255,219,0,0.85);
      letter-spacing: 0.16em;
      text-transform: uppercase;
    }
    .header-badge {
      margin-left: auto;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 4px;
    }
    .header-badge .secure-label {
      font-family: var(--font-mono);
      font-size: 0.6rem;
      color: rgba(255,219,0,0.85);
      letter-spacing: 0.12em;
      text-transform: uppercase;
      display: flex;
      align-items: center;
      gap: 5px;
    }
    .header-badge .secure-label i { font-size: 0.65rem; }
    .header-badge .location-label {
      font-family: var(--font-mono);
      font-size: 0.6rem;
      color: rgba(255,255,255,0.45);
      letter-spacing: 0.1em;
    }

    /* ── Pattern strip under header — thin yellow accent ── */
    .header-pattern {
      height: 0;
      display: none;
    }

    /* ── Page layout ── */
    .page {
      max-width: 860px;
      margin: 0 auto;
      padding: 36px 32px 72px;
    }

    /* ── Page heading ── */
    .page-heading {
      margin-bottom: 28px;
      padding-bottom: 20px;
      border-bottom: 1px solid var(--cpc-line);
    }
    .page-heading .eyebrow {
      font-family: var(--font-mono);
      font-size: 0.62rem;
      color: var(--cpc-gold-deep);
      letter-spacing: 0.15em;
      text-transform: uppercase;
      margin-bottom: 8px;
    }
    .page-heading h2 {
      font-family: var(--font-display);
      font-size: 1.9rem;
      font-weight: 600;
      color: var(--cpc-ink);
      line-height: 1.2;
    }
    .page-heading .desc {
      font-size: 0.85rem;
      color: var(--cpc-ink-muted);
      margin-top: 6px;
      line-height: 1.6;
    }

    /* ── Cards ── */
    .card {
      background: var(--cpc-white);
      border: 1px solid var(--cpc-line);
      border-radius: 4px;
      padding: 24px 28px;
      margin-bottom: 20px;
    }
    .card-title {
      font-family: var(--font-mono);
      font-size: 0.65rem;
      font-weight: 600;
      color: var(--cpc-gold-deep);
      letter-spacing: 0.14em;
      text-transform: uppercase;
      margin-bottom: 16px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--cpc-line);
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .card-title i { font-size: 0.7rem; }

    /* ── RFP info card ── */
    .rfp-card {}
    .rfp-meta {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 0;
      border: 1px solid var(--cpc-line);
      border-radius: 4px;
      overflow: hidden;
      margin-top: 16px;
    }
    .rfp-meta-item {
      padding: 12px 16px;
      border-right: 1px solid var(--cpc-line);
    }
    .rfp-meta-item:last-child { border-right: none; }
    .rfp-meta-item .label {
      font-family: var(--font-mono);
      font-size: 0.6rem;
      font-weight: 600;
      color: var(--cpc-ink-muted);
      text-transform: uppercase;
      letter-spacing: 0.1em;
      margin-bottom: 4px;
    }
    .rfp-meta-item .value {
      font-family: var(--font-body);
      font-size: 0.88rem;
      font-weight: 600;
      color: var(--cpc-ink);
    }
    .rfp-section-block {
      margin-top: 16px;
      padding-top: 14px;
      border-top: 1px solid var(--cpc-line);
    }
    .rfp-section-block .sec-title {
      font-family: var(--font-mono);
      font-size: 0.65rem;
      font-weight: 600;
      color: var(--cpc-gold-deep);
      letter-spacing: 0.12em;
      text-transform: uppercase;
      margin-bottom: 6px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .rfp-section-block .sec-body {
      font-size: 0.83rem;
      color: var(--cpc-ink-mid);
      line-height: 1.7;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .sec-body.collapsed {
      display: -webkit-box;
      -webkit-line-clamp: 4;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .expand-btn {
      font-family: var(--font-mono);
      font-size: 0.65rem;
      color: var(--cpc-gold);
      cursor: pointer;
      border: none;
      background: none;
      margin-top: 6px;
      padding: 0;
      letter-spacing: 0.05em;
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .expand-btn:hover { color: var(--cpc-gold-deep); }

    /* ── Form elements ── */
    .form-group { margin-bottom: 22px; }
    .form-group label {
      display: block;
      font-size: 0.83rem;
      font-weight: 600;
      color: var(--cpc-ink);
      margin-bottom: 6px;
    }
    .form-group .hint {
      font-size: 0.75rem;
      color: var(--cpc-ink-muted);
      margin-bottom: 8px;
      line-height: 1.5;
    }
    .form-control {
      width: 100%;
      padding: 10px 14px;
      border: 1.5px solid var(--cpc-line);
      border-radius: 3px;
      font-size: 0.88rem;
      font-family: var(--font-body);
      color: var(--cpc-ink);
      background: var(--cpc-white);
      transition: border-color 0.15s, box-shadow 0.15s;
    }
    .form-control:focus {
      outline: none;
      border-color: var(--cpc-gold);
      box-shadow: 0 0 0 3px rgba(186,151,101,0.12);
    }
    textarea.form-control {
      resize: vertical;
      min-height: 120px;
      line-height: 1.65;
    }

    /* ── Code field ── */
    .code-field {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      border: 1.5px solid var(--cpc-gold-line);
      border-radius: 3px;
      background: var(--cpc-gold-tint);
    }
    .code-field .code-val {
      font-family: var(--font-mono);
      font-size: 0.98rem;
      font-weight: 600;
      color: var(--cpc-gold-deep);
      flex: 1;
      letter-spacing: 0.06em;
    }
    .code-badge {
      font-family: var(--font-mono);
      font-size: 0.6rem;
      background: var(--cpc-success-bg);
      color: var(--cpc-success);
      border: 1px solid var(--cpc-success-bdr);
      padding: 3px 10px;
      border-radius: 100px;
      font-weight: 600;
      white-space: nowrap;
      letter-spacing: 0.08em;
    }

    /* ── Section divider ── */
    .section-divider {
      display: flex;
      align-items: center;
      gap: 12px;
      margin: 24px 0;
      font-family: var(--font-mono);
      font-size: 0.62rem;
      font-weight: 600;
      color: var(--cpc-gold-deep);
      text-transform: uppercase;
      letter-spacing: 0.14em;
    }
    .section-divider::before,
    .section-divider::after {
      content: '';
      flex: 1;
      height: 1px;
      background: var(--cpc-line);
    }

    /* ── Drop zone ── */
    .drop-zone {
      border: 1.5px dashed var(--cpc-gold-line);
      border-radius: 4px;
      padding: 36px 20px;
      text-align: center;
      cursor: pointer;
      transition: all 0.2s;
      background: var(--cpc-ivory);
    }
    .drop-zone:hover,
    .drop-zone.dragover {
      border-color: var(--cpc-gold);
      background: var(--cpc-gold-tint);
    }
    .drop-zone .dz-icon {
      font-size: 2rem;
      color: var(--cpc-gold);
      margin-bottom: 12px;
    }
    .drop-zone .dz-text {
      font-size: 0.88rem;
      color: var(--cpc-ink-mid);
    }
    .drop-zone .dz-text strong { color: var(--cpc-gold-deep); }
    .drop-zone .dz-sub {
      font-family: var(--font-mono);
      font-size: 0.65rem;
      color: var(--cpc-ink-muted);
      margin-top: 6px;
      letter-spacing: 0.05em;
    }

    /* ── File list ── */
    .file-list { margin-top: 16px; display: flex; flex-direction: column; gap: 10px; }
    .file-item {
      border: 1.5px solid var(--cpc-line);
      border-radius: 4px;
      padding: 12px 14px;
      display: flex;
      align-items: flex-start;
      gap: 12px;
      background: var(--cpc-white);
      transition: border-color 0.15s;
    }
    .file-item.done  { border-color: var(--cpc-success-bdr); background: var(--cpc-success-bg); }
    .file-item.error { border-color: var(--cpc-error-bdr);   background: var(--cpc-error-bg); }
    .file-icon { font-size: 1.3rem; color: var(--cpc-error); flex-shrink: 0; margin-top: 2px; }
    .file-info { flex: 1; min-width: 0; }
    .file-name {
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--cpc-ink);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .file-size {
      font-family: var(--font-mono);
      font-size: 0.65rem;
      color: var(--cpc-ink-muted);
      margin-top: 2px;
    }
    .file-summary { font-size: 0.78rem; color: var(--cpc-ink-mid); margin-top: 5px; line-height: 1.5; }
    .file-label-row { display: flex; align-items: center; gap: 8px; margin-top: 8px; flex-wrap: wrap; }
    .label-pill {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 3px 10px;
      border-radius: 100px;
      font-family: var(--font-mono);
      font-size: 0.6rem;
      font-weight: 600;
      cursor: pointer;
      border: 1.5px solid transparent;
      transition: all 0.15s;
      white-space: nowrap;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    .label-pill.technical  { background: #EFF6FF; color: #1D4ED8; border-color: #BFDBFE; }
    .label-pill.commercial { background: var(--cpc-success-bg); color: var(--cpc-success); border-color: var(--cpc-success-bdr); }
    .label-pill.supporting { background: var(--cpc-gold-tint); color: var(--cpc-gold-deep); border-color: var(--cpc-gold-line); }
    .label-pill.other      { background: #F3F4F6; color: #6B7280; border-color: #D1D5DB; }
    .label-pill.selected   { box-shadow: 0 0 0 2px currentColor; }
    .label-select {
      font-family: var(--font-mono);
      font-size: 0.65rem;
      padding: 3px 8px;
      border: 1px solid var(--cpc-line);
      border-radius: 3px;
      background: var(--cpc-white);
      cursor: pointer;
      color: var(--cpc-ink);
    }
    .file-remove {
      flex-shrink: 0;
      background: none;
      border: none;
      color: var(--cpc-ink-muted);
      cursor: pointer;
      font-size: 0.85rem;
      padding: 2px 4px;
      border-radius: 3px;
      align-self: flex-start;
    }
    .file-remove:hover { color: var(--cpc-error); background: var(--cpc-error-bg); }
    .cat-spinner {
      font-family: var(--font-mono);
      font-size: 0.65rem;
      color: var(--cpc-ink-muted);
      display: flex;
      align-items: center;
      gap: 5px;
    }
    .conf-badge {
      font-family: var(--font-mono);
      font-size: 0.6rem;
      padding: 2px 8px;
      border-radius: 100px;
      font-weight: 600;
      background: #FEF3C7;
      color: #92400E;
      letter-spacing: 0.06em;
    }
    .conf-badge.high { background: var(--cpc-success-bg); color: var(--cpc-success); }
    .conf-badge.low  { background: var(--cpc-error-bg);   color: var(--cpc-error); }

    /* ── Submit button ── */
    .submit-btn {
      width: 100%;
      padding: 14px;
      background: var(--a-yellow);
      color: var(--a-ink);
      border: none;
      border-radius: 3px;
      font-family: var(--font-mono);
      font-size: 0.75rem;
      font-weight: 600;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      cursor: pointer;
      transition: background 0.15s;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
    }
    .submit-btn:hover:not(:disabled) { background: #FFE963; }
    .submit-btn:disabled { background: var(--cpc-line); color: var(--cpc-ink-muted); cursor: not-allowed; }

    .submit-footer {
      font-family: var(--font-mono);
      font-size: 0.62rem;
      color: var(--cpc-ink-muted);
      text-align: center;
      margin-top: 12px;
      letter-spacing: 0.06em;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
    }
    .submit-footer i { color: var(--cpc-gold); font-size: 0.65rem; }

    /* ── Success screen ── */
    .success-screen {
      background: var(--cpc-white);
      border: 1px solid var(--cpc-line);
      border-radius: 4px;
      padding: 56px 36px;
      text-align: center;
      display: none;
    }
    .success-icon {
      width: 72px;
      height: 72px;
      border-radius: 50%;
      background: var(--cpc-success-bg);
      border: 2px solid var(--cpc-success-bdr);
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 24px;
    }
    .success-icon i { font-size: 2rem; color: var(--cpc-success); }
    .success-screen h2 {
      font-family: var(--font-display);
      font-size: 1.8rem;
      font-weight: 600;
      color: var(--cpc-ink);
      margin-bottom: 14px;
    }
    .success-screen p {
      font-size: 0.88rem;
      color: var(--cpc-ink-muted);
      line-height: 1.75;
      max-width: 500px;
      margin: 0 auto;
    }
    .success-ref {
      background: var(--cpc-gold-tint);
      border: 1px solid var(--cpc-gold-line);
      border-radius: 4px;
      padding: 16px 24px;
      margin-top: 24px;
      display: inline-block;
      text-align: left;
    }
    .success-ref .ref-label {
      font-family: var(--font-mono);
      font-size: 0.6rem;
      color: var(--cpc-gold-deep);
      text-transform: uppercase;
      letter-spacing: 0.12em;
      margin-bottom: 4px;
    }
    .success-ref .ref-value {
      font-family: var(--font-mono);
      font-size: 1.05rem;
      font-weight: 600;
      color: var(--cpc-gold-deep);
    }
    .success-ref .ref-files {
      font-family: var(--font-mono);
      font-size: 0.65rem;
      color: var(--cpc-ink-muted);
      margin-top: 6px;
    }

    /* ── Alert ── */
    .alert {
      padding: 12px 16px;
      border-radius: 3px;
      font-size: 0.83rem;
      margin-bottom: 16px;
      display: none;
      line-height: 1.5;
    }
    .alert.error { background: var(--cpc-error-bg); border: 1px solid var(--cpc-error-bdr); color: var(--cpc-error); }
    .alert.info  { background: var(--cpc-gold-tint); border: 1px solid var(--cpc-gold-line); color: var(--cpc-gold-deep); }

    /* ── Loading overlay ── */
    .loading-overlay {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(27,23,18,0.55);
      z-index: 9999;
      align-items: center;
      justify-content: center;
      flex-direction: column;
      gap: 20px;
      backdrop-filter: blur(2px);
    }
    .loading-overlay.show { display: flex; }
    .loading-box {
      background: var(--cpc-white);
      border: 1px solid var(--cpc-line);
      border-radius: 4px;
      padding: 32px 48px;
      text-align: center;
    }
    .loading-spinner {
      width: 44px;
      height: 44px;
      border: 3px solid var(--cpc-line);
      border-top-color: var(--cpc-gold);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin: 0 auto 16px;
    }
    .loading-text {
      font-family: var(--font-mono);
      font-size: 0.72rem;
      color: var(--cpc-ink-muted);
      letter-spacing: 0.1em;
      text-transform: uppercase;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* ── Footer ── */
    .page-footer {
      max-width: 860px;
      margin: 0 auto;
      padding: 24px 32px;
      border-top: 1px solid var(--cpc-line);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }
    .page-footer .footer-left {
      font-family: var(--font-mono);
      font-size: 0.6rem;
      color: var(--cpc-ink-muted);
      letter-spacing: 0.08em;
    }
    .page-footer .footer-right {
      font-family: var(--font-mono);
      font-size: 0.6rem;
      color: var(--cpc-ink-muted);
      letter-spacing: 0.08em;
      text-align: right;
    }

    /* ── Responsive ── */
    @media (max-width: 640px) {
      .header-inner { padding: 16px 20px; gap: 14px; }
      .header-badge { display: none; }
      .page { padding: 24px 16px 56px; }
      .card { padding: 16px; }
      .rfp-meta { grid-template-columns: repeat(2, 1fr); }
      .page-footer { flex-direction: column; align-items: flex-start; }
      .drop-zone { padding: 24px 16px; }
      .dz-text { font-size: 0.9rem; }
      /* 13.4: show mobile upload button, hide drag-and-drop hint on phones */
      .mobile-upload-btn { display: flex !important; }
    }
    @media (max-width: 480px) {
      .rfp-meta { grid-template-columns: 1fr; }
      .submit-btn { font-size: 1rem; padding: 0.9rem 1.5rem; }
    }
    .mobile-upload-btn {
      display: none;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      width: 100%;
      padding: 0.75rem 1rem;
      margin-top: 0.75rem;
      background: #f5f0e8;
      border: 1.5px solid ${(0, index_1.getActiveProfile)().css.accent};
      border-radius: 8px;
      color: ${(0, index_1.getActiveProfile)().css.sidebarBg};
      font-weight: 600;
      font-size: 0.92rem;
      cursor: pointer;
    }
  </style>
</head>
<body>

<!-- ── Header ── -->
<header class="header">
  <div class="header-inner">
    <!-- Full brand logo: yellow glyph + ANDERSEN wordmark in one PNG -->
    <img src="${(0, index_1.getActiveProfile)().id === 'cpc' ? (0, index_1.getActiveProfile)().logoPath : brand_assets_1.logoFullDataUri}" alt="${(0, index_1.getActiveProfile)().orgName}" class="header-logo-full"/>
    <div class="header-divider"></div>
    <div class="header-text">
      <div class="sub">Procurement Portal &nbsp;·&nbsp; Proposal Submission</div>
    </div>
    <div class="header-badge">
      <div class="secure-label"><i class="fas fa-lock"></i> Secure Submission</div>
      <div class="location-label">${(0, index_1.getActiveProfile)().orgLocation}</div>
    </div>
  </div>
</header>
<div class="header-pattern"></div>

<!-- ── Loading overlay ── -->
<div class="loading-overlay" id="loadingOverlay">
  <div class="loading-box">
    <div class="loading-spinner"></div>
    <div class="loading-text" id="loadingText">Submitting proposal…</div>
  </div>
</div>

<!-- ── Main content ── -->
<main class="page">

  <!-- Page heading -->
  <div class="page-heading">
    <div class="eyebrow"><i class="fas fa-file-import" style="margin-right:6px"></i>Tender Reference &mdash; RFP-${rfpId}</div>
    <h2>Vendor Proposal Submission</h2>
    <p class="desc">
      Upload your proposal documents and submit your response to this Request for Proposal.
      All submissions are encrypted in transit and securely stored. Please ensure all required
      documents are included before submitting.
    </p>
  </div>

  <!-- RFP Info card (populated dynamically) -->
  <div class="card rfp-card" id="rfpCard">
    <div class="card-title"><i class="fas fa-file-alt"></i> Tender Information</div>
    <div style="display:flex;align-items:center;gap:10px;color:var(--cpc-ink-muted);font-size:0.83rem">
      <i class="fas fa-spinner fa-spin" style="color:var(--cpc-gold)"></i>
      Loading tender details…
    </div>
  </div>

  <!-- Success screen -->
  <div class="success-screen" id="successScreen">
    <div class="success-icon"><i class="fas fa-check"></i></div>
    <h2>Proposal Successfully Submitted</h2>
    <p>
      Thank you for submitting your proposal to the ${(0, index_1.getActiveProfile)().orgName} procurement process.
      Your submission has been received and securely recorded. Our evaluation team will review
      all proposals and notify shortlisted vendors of the next steps.
    </p>
    <p style="margin-top:10px">
      Please retain this confirmation for your records. For enquiries, contact us at
      <strong>${(0, index_1.getActiveProfile)().procurementEmail}</strong>, quoting your participant reference.
    </p>
    <div class="success-ref">
      <div class="ref-label">Participant Reference</div>
      <div class="ref-value" id="successRef"></div>
      <div class="ref-files" id="successFiles"></div>
    </div>
  </div>

  <!-- Submission form -->
  <div class="card" id="formCard">
    <div class="card-title"><i class="fas fa-upload"></i> Submit Your Proposal</div>

    <div class="alert error" id="alertError"></div>
    <div class="alert info"  id="alertInfo"></div>

    <!-- Participant code -->
    <div class="form-group">
      <label>Participant Reference Code</label>
      <div class="hint">
        This code uniquely identifies your organisation for this tender and was provided
        in your invitation letter. It cannot be changed.
      </div>
      <div class="code-field">
        <i class="fas fa-key" style="color:var(--cpc-gold);font-size:0.9rem"></i>
        <span class="code-val" id="codeDisplay">${participantCode || '—'}</span>
        ${participantCode
        ? '<span class="code-badge"><i class="fas fa-check" style="margin-right:3px;font-size:0.55rem"></i>Verified</span>'
        : ''}
      </div>
      ${!participantCode
        ? '<input type="text" class="form-control" id="codeInput" placeholder="e.g. RFP-1-V5" style="margin-top:10px" oninput="onCodeInput(this.value)"/>'
        : ''}
    </div>

    <div class="section-divider">Cover Letter</div>

    <!-- Cover letter -->
    <div class="form-group">
      <label for="coverLetter">
        Cover Letter
        <span style="font-weight:400;color:var(--cpc-ink-muted);font-size:0.78rem"> — Optional</span>
      </label>
      <div class="hint">
        Briefly introduce your organisation and summarise your key qualifications for this tender.
      </div>
      <textarea class="form-control" id="coverLetter"
        placeholder="Dear Procurement Committee,&#10;&#10;We are pleased to submit our proposal in response to this Request for Proposal…"
        rows="6"></textarea>
    </div>

    <div class="section-divider">Proposal Documents</div>

    <!-- File upload -->
    <div class="form-group">
      <label>
        Proposal Documents
        <span style="color:var(--cpc-error);margin-left:3px">*</span>
      </label>
      <div class="hint">
        Upload your Technical Proposal, Commercial Proposal, and any supporting documents
        (CVs, certifications, references). PDF format only. Multiple files accepted.
      </div>

      <div class="drop-zone" id="dropZone"
           onclick="document.getElementById('fileInput').click()"
           ondragover="event.preventDefault(); this.classList.add('dragover')"
           ondragleave="this.classList.remove('dragover')"
           ondrop="handleDrop(event)">
        <div class="dz-icon"><i class="fas fa-cloud-upload-alt"></i></div>
        <div class="dz-text"><strong>Tap to browse files</strong> or drag &amp; drop here</div>
        <div class="dz-sub">PDF documents only &nbsp;·&nbsp; Multiple files accepted &nbsp;·&nbsp; Max 50 MB per file</div>
      </div>
      <input type="file" id="fileInput" multiple accept=".pdf,application/pdf" style="display:none"
             onchange="handleFiles(this.files)"/>
      <!-- 13.4: dedicated mobile tap-to-upload button visible only on small screens -->
      <label for="fileInputMobile" class="mobile-upload-btn" style="display:none">
        <i class="fas fa-camera"></i> Upload from Camera or Files
      </label>
      <input type="file" id="fileInputMobile" multiple accept=".pdf,application/pdf,image/*"
             style="display:none" onchange="handleFiles(this.files)"/>

      <div class="file-list" id="fileList"></div>
    </div>

    <button class="submit-btn" id="submitBtn" onclick="submitProposal()" disabled>
      <i class="fas fa-paper-plane"></i>
      Submit Proposal
    </button>
    <div class="submit-footer">
      <i class="fas fa-shield-alt"></i>
      Encrypted transmission &nbsp;·&nbsp; Secure storage &nbsp;·&nbsp; Late submissions are not accepted
    </div>
  </div>

</main>

<!-- ── Footer ── -->
<footer class="page-footer">
  <div class="footer-left">
    © ${(0, index_1.getActiveProfile)().orgName} · ${(0, index_1.getActiveProfile)().orgLocation}<br/>
    AI RFP Management System
  </div>
  <div class="footer-right">
    Confidential — Authorised vendors only<br/>
    All submissions are logged and audited
  </div>
</footer>

<script>
/* Server-injected globals — read by submit.js */
window.RFP_ID = ${rfpId};
window.PRESET_CODE = ${JSON.stringify(participantCode)};
</script>
<script src="/static/submit.js"></script>
</body>
</html>`;
}
//# sourceMappingURL=submit-page.js.map