import { logoFullDataUri, bgDarkDataUri, bgLightDataUri } from './brand-assets'
import { getActiveProfile } from './profiles/index'

export function getLayout(): string {
  const p = getActiveProfile()
  const isCpc = p.id === 'cpc'
  return `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="theme-color" content="${p.faviconColor}">
  <title>${p.appTitle}</title>
  <!-- Brand Fonts (profile-specific) -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="${p.fonts.googleFontsUrl}" rel="stylesheet">
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
  <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"><\/script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"><\/script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"><\/script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js"><\/script>
  <script src="https://cdn.jsdelivr.net/npm/marked@13/marked.min.js"><\/script>
  <link href="/static/style.css" rel="stylesheet">
  <style>
    /* ── Brand asset data URIs injected at build time ── */
    :root {
      --brand-logo-full:  url("${logoFullDataUri}");
      --brand-bg-dark:    url("${bgDarkDataUri}");
      --brand-bg-light:   url("${bgLightDataUri}");
    }
  </style>
  <style>
    /* ============================================================
       ANDERSEN DESIGN SYSTEM — extracted from andersenlab.com
       ============================================================ */
    :root {
      /* Brand colors (verbatim from andersenlab.com) */
      --a-yellow:        #FFDB00;
      --a-yellow-hover:  #FFE963;
      --a-yellow-wash:   #FFFBEC;
      --a-navy:          #020D1C;
      --a-navy-2:        #0B1626;
      --a-ink:           #020303;
      --a-charcoal:      #3A3E45;
      --a-slate:         #556170;
      --a-focus-blue:    #1A73E8;
      --a-line:          #E0E0E0;
      --a-track:         #EBEBEB;
      --a-mute:          #ADADAD;
      --a-dot:           #D7D7D7;
      --a-pale:          #FAFAFA;

      /* Semantic aliases used throughout codebase */
      --cpc-gold:        var(--a-yellow);
      --cpc-gold-stroke: #D4B800;
      --cpc-gold-deep:   #3A3E45;
      --cpc-gold-light:  #FFE963;
      --cpc-gold-tint:   #FFFBEC;
      --cpc-red:         #C43042;
      --cpc-ivory:       #F5F5F5;
      --cpc-paper:       #FFFFFF;
      --cpc-ink:         #020303;
      --cpc-ink-2:       #556170;
      --cpc-line:        #E0E0E0;
      --cpc-gray-bg:     #F5F5F5;

      /* Status semantic colors */
      --status-ok-bg:    #E6F5E9;
      --status-ok-fg:    #1B7A32;
      --status-err-bg:   #FBE7EA;
      --status-err-fg:   #C43042;

      /* Dark surface */
      --dark-surface:    #020D1C;

      /* Spacing */
      --page-gutter: 56px;
      --card-pad: 24px;
      --card-gap: 20px;
      --section-mb: 72px;

      /* Radius — Andersen uses tight radii (not soft) */
      --r-input: 4px;
      --r-card: 8px;
      --r-block: 16px;
      --r-hero: 24px;
      --r-pill: 4px;   /* Andersen uses rectangular badges, not pills */

      /* Shadows — cards use borders, not shadows, on light backgrounds */
      --shadow-float:  0 8px 40px rgba(0,0,0,0.08);
      --shadow-modal:  0 20px 60px rgba(0,0,0,0.2);
    }

    /* ── PROFILE DESIGN TOKEN OVERRIDES ── injected server-side per active profile ── */
    :root {
      --a-yellow:        ${p.css.accent};
      --a-yellow-hover:  ${p.css.accentHover};
      --a-yellow-wash:   ${p.css.accentTint};
      --a-navy:          ${p.css.sidebarBg};
      --a-ink:           ${p.css.ink};
      --a-charcoal:      ${p.css.accentDeep};
      --a-slate:         ${p.css.inkMid};
      --a-line:          ${p.css.line};
      --a-mute:          ${p.css.inkMuted};
      --a-pale:          ${p.css.pageBg};

      --cpc-gold:        ${p.css.accent};
      --cpc-gold-stroke: ${p.css.accentHover};
      --cpc-gold-deep:   ${p.css.accentDeep};
      --cpc-gold-light:  ${p.css.accentHover};
      --cpc-gold-tint:   ${p.css.accentTint};
      --cpc-paper:       ${p.css.paper};
      --cpc-ink:         ${p.css.ink};
      --cpc-ink-2:       ${p.css.inkMid};
      --cpc-line:        ${p.css.line};
      --cpc-gray-bg:     ${p.css.pageBg};
      --cpc-ivory:       ${p.css.accentTint};

      --status-err-bg:   ${p.css.errorBg};
      --status-err-fg:   ${p.css.errorFg};
      --status-ok-bg:    ${p.css.successBg};
      --status-ok-fg:    ${p.css.successFg};

      --dark-surface:    ${p.css.sidebarBg};
      --r-pill:          ${p.css.radiusPill};
    }

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    html, body {
      height: 100%;
      /* Light wave-line brand texture — fixed so it doesn't scroll */
      background: ${p.css.pageBg} var(--brand-bg-light) center center / cover fixed;
      color: var(--a-ink);
      font-family: ${p.fonts.body};
      font-weight: 400;
      line-height: 1.6;
      -webkit-font-smoothing: antialiased;
      font-size: 15px; /* Increased base for readability */
    }

    /* ── LAYOUT SHELL ── */
    .app-shell { display: flex; height: 100vh; overflow: hidden; }

    /* ── SIDEBAR — dark charcoal grey + brand texture ── */
    .cpc-sidebar {
      width: 260px;
      flex-shrink: 0;
      /*
       * Dark-grey overlay (matches andersen-bg-dark.png tones: #3A3F45)
       * replaces old navy (#020D1C) overlay — texture now reads as warm dark grey
       * rather than blue-navy, matching the brand image palette.
       * right center keeps line-art (right half of landscape image) visible.
       */
      background:
        linear-gradient(180deg, ${p.css.sidebarBg}d4 0%, ${p.css.sidebarBg}c8 100%),
        var(--brand-bg-dark) right center / auto 100% fixed;
      border-right: 1px solid rgba(255,255,255,0.08);
      display: flex;
      flex-direction: column;
      overflow-y: auto;
      transition: transform 0.22s cubic-bezier(0.4,0,0.2,1);
      z-index: 200;
    }

    /* Sidebar brand — full logo PNG (icon + wordmark) */
    .sidebar-brand {
      padding: 18px 16px 14px;
      border-bottom: 1px solid rgba(255,255,255,0.08);
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    /* Full logo: icon + wordmark in one image (landscape, e.g. Andersen 1024×267) */
    .sidebar-logo-full {
      display: block;
      height: 34px;
      width: auto;
      max-width: 188px;
      object-fit: contain;
      object-position: left center;
    }
    /* Square/portrait emblem variant (e.g. CPC emblem PNG) */
    .sidebar-logo-emblem {
      display: block;
      height: 52px;
      width: 52px;
      object-fit: contain;
      object-position: center;
      margin-bottom: 2px;
    }
    .sidebar-wordmark .wm-product {
      font-family: ${p.fonts.body};
      font-size: 14px;
      font-weight: 600;
      letter-spacing: 0.02em;
      text-transform: none;
      color: rgba(255,255,255,0.92);
      margin-top: 0;
    }
    /* Legacy emblem class — hidden, replaced by sidebar-logo-full */
    .sidebar-emblem { display: none; }
    .sidebar-wordmark .wm-org { display: none; }

    /* Nav */
    .sidebar-nav { flex: 1; padding: 12px 8px; }
    .nav-section-label {
      font-family: var(--font-mono);
      font-size: 10px;
      font-weight: 500;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: rgba(255,255,255,0.42);
      padding: 14px 12px 5px;
    }
    .nav-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      border-radius: 4px;
      font-size: 14px;
      font-weight: 400;
      color: rgba(255,255,255,0.72);
      text-decoration: none;
      cursor: pointer;
      margin-bottom: 2px;
      border-left: 3px solid transparent;
      transition: background 0.18s cubic-bezier(0.4,0,0.2,1), color 0.18s, border-color 0.18s;
      position: relative;
    }
    .nav-item i {
      width: 18px;
      height: 18px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      flex-shrink: 0;
      line-height: 1;
    }
    .nav-item:hover {
      background: rgba(255,219,0,0.08);
      color: rgba(255,255,255,0.9);
    }
    .nav-item.active {
      background: rgba(255,219,0,0.10);
      border-left-color: var(--a-yellow);
      color: #FFFFFF;
      font-weight: 500;
    }

    /* Sidebar user chip */
    .sidebar-user {
      padding: 14px 16px;
      border-top: 1px solid rgba(255,255,255,0.06);
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .user-avatar {
      width: 30px;
      height: 30px;
      border-radius: 4px;
      background: rgba(255,219,0,0.15);
      border: 1px solid rgba(255,219,0,0.3);
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: var(--font-mono);
      font-size: 10px;
      font-weight: 500;
      color: var(--a-yellow);
      flex-shrink: 0;
    }
    .user-info .user-name {
      font-size: 13px;
      font-weight: 600;
      color: #FFFFFF;
      line-height: 1.2;
    }
    .user-info .user-role {
      font-family: var(--font-mono);
      font-size: 10px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: rgba(255,255,255,0.45);
    }

    /* ── MAIN AREA ── */
    .app-main {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-height: 100vh;
      overflow: hidden;
      /* Light texture comes through from body bg — page cards sit on top */
      background: transparent;
    }

    /* ── TOP HEADER — frosted white bar over light texture ── */
    .cpc-header {
      height: 64px;
      background: rgba(255,255,255,0.88);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      border-bottom: 1px solid rgba(224,224,224,0.8);
      padding: 0 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-shrink: 0;
    }
    .header-left { display: flex; align-items: center; gap: 12px; }
    .header-page-title {
      font-family: var(--font-body);
      font-weight: 700;
      font-size: 22px;
      color: var(--a-ink);
      line-height: 1.2;
    }
    .header-page-subtitle {
      font-family: var(--font-mono);
      font-size: 11px;
      letter-spacing: 0.10em;
      text-transform: uppercase;
      color: var(--a-slate);
      margin-top: 1px;
    }
    .header-right { display: flex; align-items: center; gap: 12px; }
    .header-date {
      font-family: var(--font-mono);
      font-size: 12px;
      letter-spacing: 0.05em;
      color: var(--a-slate);
    }

    /* ── LANGUAGE DROPDOWN (replaces old pill toggle) ── */
    .lang-dropdown-wrap {
      position: relative;
    }
    .lang-dropdown-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      border: 1px solid var(--a-line);
      border-radius: 4px;
      background: #FFFFFF;
      font-family: var(--font-mono);
      font-size: 11px;
      font-weight: 500;
      letter-spacing: 0.10em;
      text-transform: uppercase;
      color: var(--a-ink);
      padding: 6px 10px;
      cursor: pointer;
      transition: border-color 0.18s, background 0.18s;
      white-space: nowrap;
      min-width: 64px;
    }
    .lang-dropdown-btn:hover { border-color: var(--a-ink); }
    .lang-dropdown-btn .lang-active-label { color: var(--a-ink); }
    .lang-dropdown-btn i { font-size: 9px; color: var(--a-slate); }
    .lang-dropdown-menu {
      display: none;
      position: absolute;
      top: calc(100% + 4px);
      right: 0;
      background: #FFFFFF;
      border: 1px solid var(--a-line);
      border-radius: 4px;
      min-width: 120px;
      z-index: 2000;
      box-shadow: 0 4px 16px rgba(0,0,0,0.10);
      overflow: hidden;
    }
    .lang-dropdown-menu.open { display: block; }
    .lang-option {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      font-family: var(--font-mono);
      font-size: 11px;
      font-weight: 400;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--a-slate);
      cursor: pointer;
      transition: background 0.12s;
      border: none;
      background: transparent;
      width: 100%;
      text-align: left;
    }
    .lang-option:hover { background: var(--a-pale); color: var(--a-ink); }
    .lang-option.active { color: var(--a-ink); font-weight: 500; background: #FFFBEC; }
    .lang-option .lang-flag { font-size: 14px; }

    /* Keep old class name for backward compat */
    .lang-pill { display: none; }
    .header-lang-toggle { display: none; }

    /* Back button in header */
    .btn-back {
      display: none;
      align-items: center;
      gap: 6px;
      background: transparent;
      border: 1px solid var(--a-line);
      border-radius: 4px;
      padding: 6px 12px;
      font-size: 13px;
      font-weight: 500;
      color: var(--a-slate);
      cursor: pointer;
      transition: border-color 0.2s, color 0.2s;
    }
    .btn-back:hover { border-color: var(--a-ink); color: var(--a-ink); }

    /* Bell / notification */
    #bellBtn {
      position: relative;
      background: transparent;
      border: 1px solid var(--a-line);
      color: var(--a-slate);
      border-radius: 4px;
      padding: 6px 10px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      transition: border-color 0.2s, color 0.2s;
    }
    #bellBtn:hover { border-color: var(--a-ink); color: var(--a-ink); }
    #bellBadge {
      position: absolute;
      top: -6px;
      right: -6px;
      background: var(--status-err-fg);
      color: white;
      border-radius: 50%;
      width: 16px;
      height: 16px;
      display: none;
      align-items: center;
      justify-content: center;
      font-family: var(--font-mono);
      font-size: 9px;
      font-weight: 500;
      border: 2px solid var(--cpc-paper);
    }

    /* ── NOTIFICATION DRAWER ── */
    #notifDrawerOverlay {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.3);
      z-index: 8000;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.25s;
    }
    #notifDrawerOverlay.open {
      opacity: 1;
      pointer-events: auto;
    }
    #notifPanel {
      position: fixed;
      top: 0;
      right: 0;
      bottom: 0;
      width: 380px;
      max-width: 100vw;
      background: var(--cpc-paper);
      border-left: 1px solid var(--a-line);
      box-shadow: -4px 0 32px rgba(0,0,0,0.12);
      z-index: 8001;
      transform: translateX(100%);
      transition: transform 0.3s cubic-bezier(0.16,1,0.3,1);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    #notifPanel.open {
      transform: translateX(0);
    }
    .notif-drawer-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 18px;
      border-bottom: 1px solid var(--a-line);
      background: var(--cpc-paper);
      flex-shrink: 0;
    }
    .notif-drawer-body {
      flex: 1;
      overflow-y: auto;
      padding: 8px 0;
    }
    .notif-drawer-footer {
      flex-shrink: 0;
      padding: 10px 18px;
      border-top: 1px solid var(--a-line);
      background: var(--a-pale);
    }

    /* ── PAGE CONTENT ── */
    /* pageContent: transparent so light bg texture from body shows through */
    #pageContent { flex: 1; overflow-y: auto; padding: 32px; background: transparent; }

    /* 1.1 — Breadcrumb bar */
    #breadcrumbBar {
      display: none;
      align-items: center;
      gap: 6px;
      padding: 7px 24px;
      background: var(--cpc-paper);
      border-bottom: 1px solid var(--a-line);
      font-size: 13px;
      color: var(--a-slate);
      flex-shrink: 0;
    }
    #breadcrumbBar.visible { display: flex; }
    .bc-item { cursor: pointer; color: var(--a-slate); transition: color 0.15s; }
    .bc-item:hover { color: var(--a-ink); }
    .bc-sep { opacity: 0.45; font-size: 10px; }
    .bc-current { color: var(--a-ink); font-weight: 600; pointer-events: none; }

    /* 1.4 — Command palette overlay */
    #cmdPaletteOverlay {
      position: fixed;
      inset: 0;
      background: rgba(2,13,28,0.55);
      z-index: 9500;
      display: none;
      align-items: flex-start;
      justify-content: center;
      padding-top: 90px;
    }
    #cmdPaletteOverlay.open { display: flex; }
    #cmdPalette {
      width: 580px;
      max-width: calc(100vw - 32px);
      background: var(--cpc-paper);
      border-radius: 8px;
      border: 1px solid var(--a-line);
      box-shadow: 0 24px 64px rgba(0,0,0,0.22);
      overflow: hidden;
      animation: cmdSlideIn 0.18s cubic-bezier(0.16,1,0.3,1);
    }
    @keyframes cmdSlideIn {
      from { opacity:0; transform:translateY(-12px) scale(0.97); }
      to   { opacity:1; transform:translateY(0) scale(1); }
    }
    #cmdInput {
      width: 100%;
      padding: 14px 18px;
      font-size: 14px;
      border: none;
      border-bottom: 1px solid var(--a-line);
      background: transparent;
      color: var(--a-ink);
      font-family: var(--font-body);
      outline: none;
      box-sizing: border-box;
    }
    #cmdResults {
      max-height: 340px;
      overflow-y: auto;
    }
    .cmd-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 16px;
      cursor: pointer;
      font-size: 13px;
      color: var(--a-ink);
      transition: background 0.1s;
    }
    .cmd-item:hover, .cmd-item.selected {
      background: var(--a-yellow-wash);
    }
    .cmd-item i { width: 18px; text-align: center; color: var(--a-charcoal); flex-shrink: 0; }
    .cmd-item-sub { font-size: 12px; color: var(--a-slate); margin-left: auto; white-space: nowrap; }
    #cmdEmpty { padding: 24px; text-align: center; color: var(--a-slate); font-size: 13px; }

    /* 4.2 — Stage action banner below lifecycle bar */
    #stageActionBanner {
      display: none;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 9px 24px;
      background: linear-gradient(90deg, #FFFBEC 0%, #FFFFFF 100%);
      border-bottom: 1px solid #FFE963;
      font-size: 14px;
      flex-shrink: 0;
    }
    #stageActionBanner.visible { display: flex; }
    .sab-text { color: var(--a-ink); }
    .sab-text strong { color: var(--a-charcoal); }
    .sab-btn {
      flex-shrink: 0;
      padding: 5px 14px;
      font-size: 12px;
      font-weight: 500;
      background: var(--a-yellow);
      color: var(--a-ink);
      border: none;
      border-radius: 4px;
      cursor: pointer;
      white-space: nowrap;
      transition: background 0.2s;
    }
    .sab-btn:hover { background: var(--a-yellow-hover); }

    /* ── LIFECYCLE BAR ── */
    .lifecycle-bar {
      background: var(--cpc-paper);
      border-bottom: 1px solid var(--a-line);
      padding: 14px 24px;
      display: flex;
      align-items: center;
      gap: 0;
      overflow-x: auto;
    }
    .lc-step { display: flex; align-items: flex-start; flex-shrink: 0; }
    .lc-node { display: flex; flex-direction: column; align-items: center; gap: 4px; min-width: 76px; max-width: 90px; }
    .lc-circle {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: var(--font-mono);
      font-size: 11px;
      font-weight: 500;
      flex-shrink: 0;
      border: 2px solid transparent;
    }
    .lc-label {
      font-family: var(--font-mono);
      font-size: 11px;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      text-align: center;
      white-space: normal;
      line-height: 1.25;
      min-height: 2.5em;
      display: flex;
      align-items: flex-start;
      justify-content: center;
      padding-top: 1px;
    }
    .lc-pending .lc-label  { color: var(--a-slate); opacity: 0.75; }
    .lc-connector { height: 2px; width: 36px; flex-shrink: 0; margin-top: 15px; }
    .lc-done .lc-circle    { background: var(--a-yellow); color: var(--a-ink); border-color: var(--a-yellow); }
    .lc-done .lc-label     { color: var(--a-charcoal); }
    .lc-done .lc-connector { background: var(--a-yellow); }
    @keyframes lc-pulse {
      0%   { box-shadow: 0 0 0 0 rgba(255,219,0,0.5); }
      70%  { box-shadow: 0 0 0 7px rgba(255,219,0,0); }
      100% { box-shadow: 0 0 0 0 rgba(255,219,0,0); }
    }
    .lc-active .lc-circle  { background: var(--a-ink); color: #FFFFFF; border-color: var(--a-ink); animation: lc-pulse 1.8s ease-out infinite; }
    .lc-active .lc-label   { color: var(--a-ink); font-weight: 600; }
    .lc-active .lc-connector { background: var(--a-line); }
    .lc-pending .lc-circle { background: var(--a-pale); color: var(--a-slate); border-color: var(--a-line); }
    .lc-pending .lc-label  { color: var(--a-slate); }
    .lc-pending .lc-connector { background: var(--a-line); }
    .lc-info-pill {
      margin-left: 20px;
      background: #FFFBEC;
      border: 1px solid #FFE963;
      border-radius: 4px;
      padding: 4px 14px;
      font-family: var(--font-mono);
      font-size: 10px;
      letter-spacing: 0.06em;
      color: var(--a-charcoal);
      font-weight: 500;
      white-space: nowrap;
    }

    /* 4.1 — Lifecycle step tooltip */
    .lc-step { position: relative; }
    .lc-tooltip {
      position: absolute;
      bottom: calc(100% + 8px);
      left: 50%;
      transform: translateX(-50%);
      background: var(--a-ink);
      color: #FFFFFF;
      font-size: 10px;
      line-height: 1.4;
      padding: 5px 9px;
      border-radius: 4px;
      white-space: nowrap;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.15s;
      z-index: 100;
    }
    .lc-tooltip::after {
      content: '';
      position: absolute;
      top: 100%;
      left: 50%;
      transform: translateX(-50%);
      border: 4px solid transparent;
      border-top-color: var(--a-ink);
    }
    .lc-step:hover .lc-tooltip { opacity: 0; }

    /* ── RFP TABS ── */
    .rfp-tabs {
      display: flex;
      gap: 0;
      border-bottom: 1px solid var(--a-line);
      background: var(--cpc-paper);
      padding: 0 24px;
    }
    .rfp-tab {
      padding: 12px 20px;
      font-size: 13px;
      font-weight: 400;
      color: var(--a-slate);
      cursor: pointer;
      border-bottom: 2px solid transparent;
      margin-bottom: -1px;
      display: flex;
      align-items: center;
      gap: 6px;
      white-space: nowrap;
      transition: color 0.15s;
      font-family: var(--font-body);
    }
    .rfp-tab:hover { color: var(--a-ink); }
    .rfp-tab.active { color: var(--a-ink); border-bottom-color: var(--a-yellow); font-weight: 500; }

    /* 14.5 — Global focus-visible ring */
    :focus-visible {
      outline: 2px solid var(--a-focus-blue);
      outline-offset: 2px;
    }

    /* 14.2 — Skeleton loading */
    @keyframes shimmer {
      0%   { background-position: -600px 0; }
      100% { background-position: 600px 0; }
    }
    .skeleton {
      background: linear-gradient(90deg, #EBEBEB 25%, #F5F5F5 50%, #EBEBEB 75%);
      background-size: 600px 100%;
      animation: shimmer 1.4s infinite;
      border-radius: 4px;
    }
    .skeleton-text { height: 14px; margin-bottom: 8px; }
    .skeleton-title { height: 22px; margin-bottom: 12px; width: 60%; }
    .skeleton-card {
      background: var(--cpc-paper);
      border-radius: var(--r-card);
      border: 1px solid var(--a-line);
      padding: 20px;
      margin-bottom: 14px;
    }

    /* 14.4 — Confirm/destructive dialog */
    #confirmDialogOverlay {
      position: fixed;
      inset: 0;
      background: rgba(2,13,28,0.5);
      z-index: 9200;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 16px;
    }
    #confirmDialogOverlay.open { display: flex; }
    #confirmDialog {
      background: var(--cpc-paper);
      border-radius: 8px;
      border: 1px solid var(--a-line);
      box-shadow: 0 20px 60px rgba(0,0,0,0.2);
      padding: 24px;
      max-width: 440px;
      width: 100%;
      animation: cmdSlideIn 0.18s cubic-bezier(0.16,1,0.3,1);
    }
    .confirm-icon {
      width: 48px; height: 48px;
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-size: 1.4rem;
      margin: 0 auto 14px;
    }
    .confirm-icon.danger { background: #fee2e2; color: #dc2626; }
    .confirm-icon.warning { background: #fef3c7; color: #d97706; }
    .confirm-icon.info { background: #FFFBEC; color: var(--a-charcoal); }
    .confirm-title { font-size: 1rem; font-weight: 700; text-align: center; margin-bottom: 8px; color: var(--a-ink); }
    .confirm-body { font-size: 0.85rem; text-align: center; color: #6b7280; margin-bottom: 20px; line-height: 1.55; }
    .confirm-list {
      background: var(--a-pale);
      border: 1px solid var(--a-line);
      border-radius: 4px;
      padding: 10px 14px;
      margin-bottom: 18px;
      max-height: 160px;
      overflow-y: auto;
      font-size: 0.8rem;
      line-height: 1.7;
    }
    .confirm-actions { display: flex; gap: 10px; justify-content: flex-end; }

    /* ── BUTTONS ── */
    .btn-primary {
      background: var(--a-yellow);
      color: var(--a-ink);
      font-weight: 500;
      border-radius: 4px;
      padding: 10px 20px;
      border: 1px solid var(--a-yellow);
      font-family: var(--font-body);
      font-size: 14px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: background 0.2s cubic-bezier(0.4,0,0.2,1);
      white-space: nowrap;
      letter-spacing: 0.01em;
    }
    .btn-primary:hover { background: var(--a-yellow-hover); border-color: var(--a-yellow-hover); }

    .btn-secondary {
      background: transparent;
      color: var(--a-ink);
      font-weight: 500;
      border-radius: 4px;
      padding: 10px 20px;
      border: 1px solid var(--a-ink);
      font-family: var(--font-body);
      font-size: 14px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: background 0.2s, color 0.2s;
    }
    .btn-secondary:hover { background: var(--a-ink); color: #FFFFFF; }

    .btn-ghost {
      background: transparent;
      color: var(--a-slate);
      font-weight: 500;
      border-radius: 4px;
      padding: 10px 20px;
      border: 1px solid var(--a-line);
      font-family: var(--font-body);
      font-size: 14px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: border-color 0.2s, color 0.2s, background 0.2s;
    }
    .btn-ghost:hover { border-color: var(--a-ink); color: var(--a-ink); }

    .btn-danger {
      background: var(--status-err-fg);
      color: white;
      font-weight: 500;
      border-radius: 4px;
      padding: 10px 20px;
      border: 1px solid var(--status-err-fg);
      font-family: var(--font-body);
      font-size: 14px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }

    .btn-sm { padding: 6px 12px; font-size: 13px; }
    .btn-xs { padding: 4px 10px; font-size: 12px; }

    /* Award button */
    .award-btn {
      background: var(--a-yellow);
      color: var(--a-ink);
      font-weight: 600;
      border-radius: 4px;
      padding: 8px 18px;
      cursor: pointer;
      border: 1px solid var(--a-yellow);
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      font-family: var(--font-body);
      transition: background 0.2s;
    }
    .award-btn:hover { background: var(--a-yellow-hover); border-color: var(--a-yellow-hover); }
    .award-btn i { font-size: 11px; }

    /* ── CARDS ── */
    .card {
      background: var(--cpc-paper);
      border-radius: var(--r-card);
      border: 1px solid var(--a-line);
    }
    .card-hover {
      cursor: pointer;
      transition: border-color 0.15s;
    }
    .card-hover:hover {
      border-color: var(--a-charcoal);
    }

    /* ── STAT / KPI CARDS — 4px yellow left rail ── */
    .stat-card {
      background: var(--cpc-paper);
      border-radius: var(--r-card);
      border: 1px solid var(--a-line);
      padding: 20px 24px;
      position: relative;
    }
    .stat-card::before {
      content: '';
      position: absolute;
      left: 0; top: 0; bottom: 0;
      width: 4px;
      background: var(--a-yellow);
      border-radius: 8px 0 0 8px;
    }
    .stat-value {
      font-family: var(--font-body);
      font-weight: 700;
      font-size: 36px;
      line-height: 1.1;
      color: var(--a-ink);
      font-feature-settings: 'tnum';
      letter-spacing: -0.02em;
    }
    .stat-label {
      font-family: var(--font-mono);
      font-size: 11px;
      letter-spacing: 0.10em;
      text-transform: uppercase;
      color: var(--a-slate);
      margin-bottom: 8px;
    }
    .stat-change {
      font-size: 12px;
      margin-top: 8px;
      display: flex;
      align-items: center;
      gap: 4px;
      color: var(--a-slate);
      font-family: var(--font-body);
    }

    /* ── STAGE BADGES — rectangular (4px radius), Andersen style ── */
    .stage-badge {
      display: inline-block;
      padding: 3px 10px;
      border-radius: 4px;
      font-family: var(--font-mono);
      font-size: 11px;
      font-weight: 500;
      letter-spacing: 0.05em;
      white-space: nowrap;
      border: 1px solid transparent;
    }
    .stage-draft            { background: var(--a-yellow); color: var(--a-ink); border-color: var(--a-yellow); }
    .stage-published        { background: #EEF2FF; color: #3730A3; border-color: #C7D2FE; }
    .stage-qa_open          { background: #FFFBEC; color: var(--a-charcoal); border-color: #FFE963; }
    .stage-submissions_closed { background: #FEF9C3; color: #854D0E; border-color: #FDE047; }
    .stage-evaluation       { background: #FFF7ED; color: #9A3412; border-color: #FED7AA; }
    .stage-awarded          { background: var(--status-ok-bg); color: var(--status-ok-fg); border-color: #BBF7D0; }

    /* ── TABLES ── */
    table { width: 100%; border-collapse: collapse; }
    thead th {
      background: transparent;
      color: var(--a-slate);
      padding: 11px 16px;
      text-align: left;
      font-family: var(--font-mono);
      font-size: 12px;
      font-weight: 400;
      letter-spacing: 0.10em;
      text-transform: uppercase;
      border-bottom: 1px solid var(--a-line);
    }
    tbody td {
      padding: 15px 16px;
      border-bottom: 1px solid var(--a-line);
      font-size: 14px;
      color: var(--a-ink);
      font-family: var(--font-body);
      vertical-align: middle;
    }
    tbody tr:nth-child(even) td { background: var(--a-pale); }
    tbody tr:hover > td { background: #FFFBEC !important; }
    tbody tr:hover > td:last-child > * { background: transparent; }

    /* Mono ID chips in tables */
    .id-chip {
      font-family: var(--font-mono);
      font-size: 11px;
      background: var(--a-pale);
      color: var(--a-charcoal);
      padding: 2px 8px;
      border-radius: 4px;
      border: 1px solid var(--a-line);
      white-space: nowrap;
    }

    /* ── FORMS ── */
    input, textarea, select {
      border: 1px solid var(--a-line);
      border-radius: 4px;
      padding: 10px 14px;
      width: 100%;
      font-size: 14px;
      font-family: var(--font-body);
      outline: none;
      transition: border-color 0.2s, box-shadow 0.2s;
      background: var(--cpc-paper);
      color: var(--a-ink);
      min-height: 44px;
    }
    input:focus, textarea:focus, select:focus {
      border-color: var(--a-ink);
      box-shadow: 0 0 0 2px var(--a-yellow);
    }
    label {
      font-family: var(--font-mono);
      font-weight: 400;
      font-size: 12px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--a-slate);
      display: block;
      margin-bottom: 6px;
    }
    .form-group { margin-bottom: 16px; }

    /* ── MODAL ── */
    .modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(2,13,28,0.55);
      z-index: 1000;
      display: none;
      align-items: center;
      justify-content: center;
    }
    .modal-overlay.open { display: flex; }
    .modal {
      background: var(--cpc-paper);
      border-radius: 8px;
      border: 1px solid var(--a-line);
      padding: 32px;
      max-width: 680px;
      width: 93%;
      max-height: 90vh;
      overflow-y: auto;
      box-shadow: var(--shadow-modal);
      animation: modalEnter 0.2s cubic-bezier(0.4,0,0.2,1);
    }
    @keyframes modalEnter { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }

    /* ── TOAST ── */
    .toast {
      position: fixed;
      top: 16px;
      right: 16px;
      z-index: 9999;
      padding: 12px 20px;
      border-radius: 4px;
      font-size: 13px;
      font-weight: 500;
      opacity: 0;
      transition: opacity 0.2s;
      box-shadow: var(--shadow-modal);
      pointer-events: none;
      max-width: 360px;
      border: 1px solid transparent;
    }
    .toast.show { opacity: 1; }
    .toast.success { background: var(--status-ok-bg); color: var(--status-ok-fg); border-color: #BBF7D0; }
    .toast.error   { background: var(--status-err-bg); color: var(--status-err-fg); border-color: #FECDD3; }
    .toast.info    { background: #FFFBEC; color: var(--a-charcoal); border-color: #FFE963; }
    .toast.warning { background: #FEF9C3; color: #854D0E; border-color: #FDE047; }

    /* ── SPINNER ── */
    .spinner {
      border: 2px solid var(--a-line);
      border-top: 2px solid var(--a-yellow);
      border-radius: 50%;
      width: 18px;
      height: 18px;
      animation: spin 0.7s linear infinite;
      display: inline-block;
    }
    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }

    /* ── SCORE BAR ── */
    .score-bar { height: 4px; border-radius: 2px; background: var(--a-line); overflow: hidden; }
    .score-fill { height: 100%; border-radius: 2px; background: var(--a-yellow); transition: width 0.8s ease; transform-origin: left; }

    /* ── RFP CARD (list view) ── */
    .rfp-card {
      background: var(--cpc-paper);
      border-radius: var(--r-card);
      border: 1px solid var(--a-line);
      padding: 20px 24px;
      cursor: pointer;
      transition: border-color 0.15s;
    }
    .rfp-card:hover {
      border-color: var(--a-charcoal);
    }

    /* ── AI SUGGESTION CARD — 4px yellow left rail on dark surface ── */
    .ai-suggestion {
      background: #FFFBEC;
      border: 1px solid #FFE963;
      border-left: 4px solid var(--a-yellow);
      border-radius: var(--r-card);
      padding: 16px 20px;
    }
    .ai-label {
      font-family: var(--font-mono);
      font-size: 10px;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--a-charcoal);
      font-weight: 500;
      margin-bottom: 8px;
    }
    .ai-label::before { content: 'AI · '; color: var(--a-yellow); font-weight: 700; }
    .ai-meta {
      font-family: var(--font-mono);
      font-size: 10px;
      color: var(--a-slate);
      letter-spacing: 0.06em;
    }

    /* ── SECTION HEADINGS ── */
    .sec-head {
      display: flex;
      align-items: baseline;
      gap: 14px;
      margin-bottom: 24px;
      padding-bottom: 14px;
      border-bottom: 2px solid var(--a-yellow);
    }
    .sec-num {
      font-family: var(--font-mono);
      font-size: 11px;
      color: var(--a-slate);
      letter-spacing: 0.15em;
    }
    .sec-title {
      font-family: var(--font-body);
      font-weight: 700;
      font-size: 22px;
      color: var(--a-ink);
      line-height: 1.1;
      letter-spacing: -0.01em;
    }

    /* Page-level heading */
    .page-heading {
      font-family: var(--font-body);
      font-weight: 700;
      font-size: 28px;
      color: var(--a-ink);
      line-height: 1.15;
      margin-bottom: 4px;
      letter-spacing: -0.01em;
    }
    .page-sub {
      font-family: var(--font-mono);
      font-size: 11px;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--a-slate);
    }

    /* ── NOTIFICATION SYSTEM ── */
    @keyframes notifSlideIn  { from { opacity:0; transform:translateX(40px);  } to { opacity:1; transform:translateX(0);   } }
    @keyframes notifSlideOut { from { opacity:1; transform:translateX(0);     } to { opacity:0; transform:translateX(40px); } }
    @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.5;transform:scale(1.15)} }

    /* ── TAGS ── */
    .tag {
      display: inline-block;
      background: #FFFBEC;
      color: var(--a-charcoal);
      padding: 3px 10px;
      border-radius: 4px;
      font-size: 11px;
      font-family: var(--font-mono);
      letter-spacing: 0.04em;
      margin: 2px 2px;
      border: 1px solid #FFE963;
      white-space: nowrap;
      max-width: 220px;
      overflow: hidden;
      text-overflow: ellipsis;
      vertical-align: middle;
    }
    .tag-group {
      display: flex;
      flex-wrap: wrap;
      gap: 3px;
      align-items: center;
    }

    /* ── SPACE HELPERS ── */
    .space-y-4 > * + * { margin-top: 1rem; }
    .space-y-6 > * + * { margin-top: 1.5rem; }

    /* ── PERF BADGE ── */
    .perf-badge { padding: 3px 8px; border-radius: 4px; font-size: 10px; font-weight: 500; font-family: var(--font-mono); letter-spacing: 0.05em; border: 1px solid transparent; }
    .perf-high  { background: var(--status-ok-bg); color: var(--status-ok-fg); border-color: #BBF7D0; }
    .perf-mid   { background: #FEF9C3; color: #854D0E; border-color: #FDE047; }
    .perf-low   { background: var(--status-err-bg); color: var(--status-err-fg); border-color: #FECDD3; }

    /* ── FILE COUNT BADGE ── */
    .file-count-badge {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-family: var(--font-mono);
      font-size: 10px;
      font-weight: 500;
      letter-spacing: 0.05em;
      color: var(--a-charcoal);
      background: #FFFBEC;
      border: 1px solid #FFE963;
      border-radius: 4px;
      padding: 3px 10px;
      cursor: pointer;
      transition: background 0.15s, border-color 0.15s;
      user-select: none;
      white-space: nowrap;
    }
    .file-count-badge:hover { background: #FFE963; border-color: var(--a-yellow); }

    /* ── PANEL SECTION TITLE ── */
    .panel-section-title {
      display: flex;
      align-items: center;
      gap: 6px;
      font-family: var(--font-mono);
      font-size: 10px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      font-weight: 500;
      color: var(--a-slate);
      margin-bottom: 10px;
    }

    /* ── Topographic / node decorative SVG background (replaces old pattern) ── */
    .pattern-bg {
      pointer-events: none;
      position: absolute;
      width: 400px;
      height: 400px;
      opacity: 0.04;
    }

    /* ── RFP DOCUMENT STYLES ── */
    .rfp-doc {
      font-family: var(--font-body);
      color: #1A1A1A;
      max-width: 860px;
      margin: 0 auto;
      background: white;
      border: 1px solid var(--a-line);
      border-radius: var(--r-card);
      overflow: hidden;
    }

    /* Mini bar chart */
    .mini-bar { display: flex; align-items: flex-end; gap: 6px; height: 60px; }
    .mini-bar-item { flex: 1; border-radius: 2px 2px 0 0; background: var(--a-yellow); opacity: 0.65; min-width: 20px; transition: opacity 0.2s; }
    .mini-bar-item:hover { opacity: 1; }

    /* ── HAMBURGER BUTTON ── */
    .sidebar-toggle {
      display: none;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      background: transparent;
      border: 1px solid var(--a-line);
      border-radius: 4px;
      cursor: pointer;
      color: var(--a-slate);
      font-size: 14px;
      flex-shrink: 0;
      transition: border-color 0.2s, color 0.2s;
    }
    .sidebar-toggle:hover { border-color: var(--a-ink); color: var(--a-ink); }

    /* ── SIDEBAR OVERLAY (mobile backdrop) ── */
    .sidebar-overlay {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(2,13,28,0.5);
      z-index: 199;
      transition: opacity 0.28s;
    }
    .sidebar-overlay.open { display: block; }

    /* ── MOBILE RESPONSIVE ── */
    .proposals-table-wrap {
      overflow-x: auto;
      position: relative;
    }
    .proposals-table-wrap::after {
      content: '';
      position: absolute;
      top: 0; right: 0; bottom: 0;
      width: 32px;
      background: linear-gradient(to right, transparent, rgba(245,245,245,0.85));
      pointer-events: none;
    }
    @media (min-width: 1200px) {
      .proposals-table-wrap::after { display: none; }
    }

    /* 6.2 — Vendor hover card */
    .vendor-hover-card {
      position: absolute;
      z-index: 500;
      background: var(--cpc-paper);
      border: 1px solid var(--a-line);
      border-radius: 8px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.14);
      padding: 14px 16px;
      width: 260px;
      pointer-events: none;
      opacity: 0;
      transform: translateY(6px);
      transition: opacity 0.18s, transform 0.18s;
    }
    .vendor-hover-card.visible {
      opacity: 1;
      transform: translateY(0);
      pointer-events: auto;
    }

    @media (max-width: 768px) {
      .sidebar-toggle { display: flex; }
      .cpc-sidebar {
        position: fixed;
        top: 0; left: 0; bottom: 0;
        transform: translateX(-100%);
      }
      html[dir="rtl"] .cpc-sidebar {
        left: auto; right: 0;
        transform: translateX(100%);
      }
      .cpc-sidebar.open {
        transform: translateX(0);
        box-shadow: var(--shadow-modal);
      }
      .cpc-header { padding: 0 14px; }
      #pageContent { padding: 16px; }
      .lifecycle-bar { padding: 10px 14px; }
      .rfp-tabs { padding: 0 14px; overflow-x: auto; }
      .generate-layout { grid-template-columns: 1fr !important; }
      .sm-table-wrap { overflow-x: auto; }
      .comp-table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
      .header-page-title { font-size: 18px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 180px; }
      .header-page-subtitle { display: none; }
      .header-date { display: none; }
    }

    /* ── RTL / ARABIC OVERRIDES ── */
    html[dir="rtl"] body { font-family: ${p.fonts.arabic || p.fonts.body}; }
    html[dir="rtl"] .app-shell { flex-direction: row-reverse; }
    html[dir="rtl"] .cpc-sidebar { border-right: none; border-left: 1px solid rgba(255,255,255,0.06); }
    html[dir="rtl"] .sidebar-brand { flex-direction: row-reverse; }
    html[dir="rtl"] .sidebar-user  { flex-direction: row-reverse; }
    html[dir="rtl"] .nav-item      { flex-direction: row-reverse; border-left: none; border-right: 3px solid transparent; }
    html[dir="rtl"] .nav-item.active { border-right-color: var(--a-yellow); border-left: none; }
    html[dir="rtl"] .nav-item i    { margin-right: 0; margin-left: 0; }
    html[dir="rtl"] .header-left   { flex-direction: row-reverse; }
    html[dir="rtl"] .header-right  { flex-direction: row-reverse; }
    html[dir="rtl"] .btn-back i    { transform: scaleX(-1); }
    html[dir="rtl"] .lc-step       { flex-direction: row-reverse; }
    html[dir="rtl"] .lc-connector  { transform: scaleX(-1); }
    html[dir="rtl"] .rfp-tabs      { flex-direction: row-reverse; }
    html[dir="rtl"] .card-header, html[dir="rtl"] .card-title { flex-direction: row-reverse; }
    html[dir="rtl"] .lifecycle-bar { flex-direction: row-reverse; }
    html[dir="rtl"] #pageContent   { text-align: right; }
    html[dir="rtl"] input, html[dir="rtl"] textarea, html[dir="rtl"] select { text-align: right; direction: ltr; }
    html[dir="rtl"] .rfp-doc, html[dir="rtl"] [contenteditable] { direction: ltr; text-align: left; }
    html[dir="rtl"] .modal { text-align: right; }
    html[dir="rtl"] .toast { left: 20px; right: auto; }
    html[dir="rtl"] .sidebar-toggle { margin-right: 0; }
    html[dir="rtl"] .wm-org, html[dir="rtl"] .wm-product { text-align: right; }
    html[dir="rtl"] .lang-dropdown-menu { right: auto; left: 0; }
    html[dir="rtl"] #notifPanel { right: auto; left: 0; border-left: none; border-right: 1px solid var(--a-line); transform: translateX(-100%); }
    html[dir="rtl"] #notifPanel.open { transform: translateX(0); }
    html[dir="rtl"] .score-bar { direction: ltr; }
    html[dir="rtl"] .rfp-card { text-align: right; }
    html[dir="rtl"] .lc-label { text-align: center; }
    html[dir="rtl"] .stat-card::before { left: auto; right: 0; border-radius: 0 8px 8px 0; }
  </style>
</head>
<body>
<div class="app-shell">
  <!-- ── SIDEBAR ── -->
  <aside class="cpc-sidebar">
    <!-- Brand -->
    <div class="sidebar-brand">
      <!-- Brand logo — profile-driven: landscape wordmark (Andersen) or square emblem (CPC) -->
      <img src="${p.logoPath}" alt="${p.logoAlt}" class="${isCpc ? 'sidebar-logo-emblem' : 'sidebar-logo-full'}">
      <div class="sidebar-wordmark">
        <div class="wm-product" data-i18n="product_name">AI RFP Management</div>
      </div>
    </div>

    <!-- Navigation -->
    <nav class="sidebar-nav" id="mainNav">
      <div class="nav-section-label" data-i18n="nav_overview">Overview</div>
      <a href="#" class="nav-item active" data-page="dashboard">
        <i class="fas fa-chart-pie"></i><span data-i18n="nav_dashboard">Dashboard</span>
      </a>

      <div class="nav-section-label" style="margin-top:8px" data-i18n="nav_procurement">Procurement</div>
      <a href="#" class="nav-item" data-page="rfps">
        <i class="fas fa-layer-group"></i><span data-i18n="nav_rfps">All RFPs</span>
      </a>
      <a href="#" class="nav-item" data-page="vendors">
        <i class="fas fa-building"></i><span data-i18n="nav_vendors">Vendor Registry</span>
      </a>

      <div class="nav-section-label" style="margin-top:8px" data-i18n="nav_analytics">Analytics</div>
      <a href="#" class="nav-item" data-page="reports">
        <i class="fas fa-chart-bar"></i><span data-i18n="nav_reports">Reports</span>
      </a>

      <div class="nav-section-label" style="margin-top:8px">Settings</div>
      <a href="#" class="nav-item" data-page="settings">
        <i class="fas fa-cog"></i><span data-i18n="nav_settings">Settings</span>
      </a>
    </nav>

    <!-- User chip -->
    <div class="sidebar-user">
      <div class="user-avatar">PM</div>
      <div class="user-info">
        <div class="user-name" data-i18n="user_name">Procurement Manager</div>
        <div class="user-role" data-i18n="user_role">${p.orgNameShort} · ${isCpc ? 'Abu Dhabi' : 'Global'}</div>
      </div>
    </div>
  </aside>

  <!-- ── MAIN ── -->
  <main class="app-main">
    <!-- Top header -->
    <header class="cpc-header">
      <div class="header-left">
        <button class="sidebar-toggle" id="sidebarToggleBtn" onclick="toggleSidebar()" aria-label="Toggle navigation">
          <i class="fas fa-bars"></i>
        </button>
        <button id="backBtn" onclick="goBack()" class="btn-back" style="display:none">
          <i class="fas fa-arrow-left" style="font-size:11px"></i> <span data-i18n="btn_back">Back</span>
        </button>
        <div>
          <div class="header-page-title" id="pageTitle">Dashboard</div>
          <div class="header-page-subtitle" id="pageSubtitle">AI-Powered Procurement Management</div>
        </div>
      </div>
      <div class="header-right">
        <span class="header-date" id="headerDate"></span>

        <!-- Language dropdown -->
        <div class="lang-dropdown-wrap" id="langDropdownWrap">
          <button class="lang-dropdown-btn" id="langDropdownBtn" onclick="toggleLangDropdown()" aria-haspopup="listbox" aria-expanded="false">
            <span class="lang-active-label" id="langActiveLabel">EN</span>
            <i class="fas fa-chevron-down"></i>
          </button>
          <div class="lang-dropdown-menu" id="langDropdownMenu" role="listbox">
            <button class="lang-option active" data-lang="en" onclick="setLang('en');closeLangDropdown()">
              <span class="lang-flag">🇬🇧</span> English
            </button>
            <button class="lang-option" data-lang="de" onclick="setLang('de');closeLangDropdown()">
              <span class="lang-flag">🇩🇪</span> Deutsch
            </button>
            <button class="lang-option" data-lang="fr" onclick="setLang('fr');closeLangDropdown()">
              <span class="lang-flag">🇫🇷</span> Français
            </button>
            <button class="lang-option" data-lang="pl" onclick="setLang('pl');closeLangDropdown()">
              <span class="lang-flag">🇵🇱</span> Polski
            </button>
            <button class="lang-option" data-lang="ar" onclick="setLang('ar');closeLangDropdown()">
              <span class="lang-flag">🇦🇪</span> العربية
            </button>
          </div>
        </div>

        <button id="bellBtn" onclick="toggleNotifPanel()" title="Notifications">
          <i class="fas fa-bell"></i>
          <span id="bellBadge">0</span>
        </button>
      </div>
    </header>

    <!-- Notification drawer overlay -->
    <div id="notifDrawerOverlay" onclick="toggleNotifPanel()"></div>
    <!-- Notification panel / slide-in drawer -->
    <div id="notifPanel" role="dialog" aria-label="Notifications"></div>
    <!-- Breadcrumb bar -->
    <div id="breadcrumbBar"></div>
    <!-- Stage action banner -->
    <div id="stageActionBanner"></div>

    <!-- RFP lifecycle bar -->
    <div id="lifecycleBar" style="display:none"></div>

    <!-- RFP tabs -->
    <div id="rfpTabsBar" style="display:none"></div>

    <!-- Page content -->
    <div id="pageContent">
      <div style="display:flex;align-items:center;justify-content:center;height:200px">
        <div class="spinner" style="width:28px;height:28px;border-width:3px"></div>
      </div>
    </div>
  </main>
</div>

<!-- Toast -->
<div class="toast" id="toast"></div>

<!-- Modal -->
<div class="modal-overlay" id="modalOverlay">
  <div class="modal" id="modalContent"></div>
</div>

<!-- 14.4 Confirm dialog -->
<div id="confirmDialogOverlay">
  <div id="confirmDialog" role="alertdialog" aria-modal="true">
    <div class="confirm-icon" id="confirmIcon"></div>
    <div class="confirm-title" id="confirmTitle"></div>
    <div class="confirm-body" id="confirmBody"></div>
    <div class="confirm-list" id="confirmList" style="display:none"></div>
    <div class="confirm-actions" id="confirmActions"></div>
  </div>
</div>

<!-- 1.4 Command palette -->
<div id="cmdPaletteOverlay" onclick="if(event.target===this)closeCmdPalette()" role="dialog" aria-modal="true" aria-label="Command palette">
  <div id="cmdPalette">
    <input id="cmdInput" type="text" placeholder="Search RFPs, vendors, pages…  (Esc to close)" autocomplete="off" oninput="renderCmdResults()" onkeydown="handleCmdKey(event)">
    <div id="cmdResults"></div>
    <div id="cmdEmpty" style="display:none">No results found</div>
  </div>
</div>

<!-- Sidebar backdrop overlay (mobile) -->
<div class="sidebar-overlay" id="sidebarOverlay" onclick="toggleSidebar()"></div>

<!-- Vendor hover card (shared, repositioned by JS) -->
<div id="vendorHoverCard" class="vendor-hover-card"></div>

<script src="/static/app.js" defer><\/script>
</body>
</html>`;
}
