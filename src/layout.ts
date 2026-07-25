export function getLayout(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AI RFP Management — Crown Prince's Court</title>
  <!-- CPC Brand Fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&family=Noto+Kufi+Arabic:wght@300;400;500;700&display=swap" rel="stylesheet">
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
  <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"><\/script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"><\/script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"><\/script>
  <link href="/static/style.css" rel="stylesheet">
  <style>
    /* ============================================================
       CPC DESIGN SYSTEM — extracted from cpc.gov.ae & brandbook
       ============================================================ */
    :root {
      /* Brand colors (verbatim from cpc.gov.ae stylesheet) */
      --cpc-gold:        #BA9765;
      --cpc-gold-stroke: #B49365;
      --cpc-gold-deep:   #745B35;
      --cpc-gold-light:  #E9DCC4;
      --cpc-gold-tint:   #F5EFE3;
      --cpc-red:         #C8102E;   /* emblem + errors ONLY */
      --cpc-ivory:       #FBF8F2;
      --cpc-paper:       #FFFFFF;
      --cpc-ink:         #1B1712;
      --cpc-ink-2:       #4A4238;
      --cpc-line:        #E7DFCE;
      --cpc-gray-bg:     #F1F1F1;

      /* Status semantic colors */
      --status-ok-bg:    #E6F2EA;
      --status-ok-fg:    #1E6B3A;
      --status-err-bg:   #FBE7EA;
      --status-err-fg:   #C8102E;

      /* Dark surface (for prompt/code blocks) */
      --dark-surface:    #0F0D0A;

      /* Spacing */
      --page-gutter: 56px;
      --card-pad: 24px;
      --card-gap: 20px;
      --section-mb: 72px;

      /* Radius */
      --r-input: 8px;
      --r-card: 12px;
      --r-block: 16px;
      --r-hero: 24px;
      --r-pill: 100px;

      /* Shadows */
      --shadow-float:  0 8px 40px rgba(90,70,40,0.08);
      --shadow-modal:  0 20px 60px rgba(27,23,18,0.22);
    }

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    html, body {
      height: 100%;
      background: var(--cpc-ivory);
      color: var(--cpc-ink);
      font-family: 'Inter', system-ui, sans-serif;
      font-weight: 400;
      line-height: 1.55;
      -webkit-font-smoothing: antialiased;
      font-size: 15px;
    }

    /* ── LAYOUT SHELL ── */
    .app-shell { display: flex; height: 100vh; overflow: hidden; }

    /* ── SIDEBAR ── */
    .cpc-sidebar {
      width: 240px;
      flex-shrink: 0;
      background: var(--cpc-ivory);
      border-right: 1px solid var(--cpc-line);
      display: flex;
      flex-direction: column;
      overflow-y: auto;
    }

    /* Sidebar wordmark */
    .sidebar-brand {
      padding: 24px 20px 20px;
      border-bottom: 1px solid var(--cpc-line);
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .sidebar-emblem {
      width: 52px;
      height: 52px;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .sidebar-emblem img {
      width: 52px;
      height: 52px;
      object-fit: contain;
      filter: none;
    }
    .sidebar-wordmark {}
    .sidebar-wordmark .wm-org {
      font-family: 'Cormorant Garamond', serif;
      font-weight: 600;
      font-size: 16px;
      line-height: 1.25;
      color: var(--cpc-ink);
      letter-spacing: 0.01em;
    }
    .sidebar-wordmark .wm-product {
      font-family: 'JetBrains Mono', monospace;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--cpc-gold);
      margin-top: 4px;
    }

    /* Nav */
    .sidebar-nav { flex: 1; padding: 12px 8px; }
    .nav-section-label {
      font-family: 'JetBrains Mono', monospace;
      font-size: 9px;
      font-weight: 500;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: var(--cpc-ink-2);
      padding: 12px 12px 4px;
      opacity: 0.6;
    }
    .nav-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 9px 12px;
      border-radius: var(--r-input);
      font-size: 13px;
      font-weight: 500;
      color: var(--cpc-ink-2);
      text-decoration: none;
      cursor: pointer;
      margin-bottom: 2px;
      border-left: 3px solid transparent;
      transition: background 0.15s, color 0.15s, border-color 0.15s;
      position: relative;
    }
    .nav-item i {
      width: 16px;
      height: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 13px;
      flex-shrink: 0;
      line-height: 1;
    }
    .nav-item:hover {
      background: var(--cpc-gold-tint);
      color: var(--cpc-gold-deep);
    }
    .nav-item.active {
      background: var(--cpc-gold-tint);
      border-left-color: var(--cpc-gold);
      color: var(--cpc-gold-deep);
      font-weight: 600;
    }

    /* Sidebar user chip */
    .sidebar-user {
      padding: 14px 16px;
      border-top: 1px solid var(--cpc-line);
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .user-avatar {
      width: 30px;
      height: 30px;
      border-radius: 50%;
      background: var(--cpc-gold-tint);
      border: 1px solid var(--cpc-gold-light);
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'JetBrains Mono', monospace;
      font-size: 10px;
      font-weight: 500;
      color: var(--cpc-gold-deep);
      flex-shrink: 0;
    }
    .user-info .user-name {
      font-size: 12px;
      font-weight: 600;
      color: var(--cpc-ink);
      line-height: 1.2;
    }
    .user-info .user-role {
      font-family: 'JetBrains Mono', monospace;
      font-size: 9px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--cpc-ink-2);
    }

    /* ── MAIN AREA ── */
    .app-main { flex: 1; display: flex; flex-direction: column; min-height: 100vh; overflow: hidden; }

    /* ── TOP HEADER ── */
    .cpc-header {
      height: 64px;
      background: var(--cpc-paper);
      border-bottom: 1px solid var(--cpc-line);
      padding: 0 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-shrink: 0;
    }
    .header-left { display: flex; align-items: center; gap: 12px; }
    .header-page-title {
      font-family: 'Cormorant Garamond', serif;
      font-weight: 600;
      font-size: 22px;
      color: var(--cpc-ink);
      line-height: 1.2;
    }
    .header-page-subtitle {
      font-family: 'JetBrains Mono', monospace;
      font-size: 10px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--cpc-ink-2);
      margin-top: 1px;
    }
    .header-right { display: flex; align-items: center; gap: 12px; }
    .header-date {
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      letter-spacing: 0.06em;
      color: var(--cpc-ink-2);
    }
    .header-lang-toggle {
      font-family: 'JetBrains Mono', monospace;
      font-size: 10px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--cpc-ink-2);
      padding: 4px 10px;
      border: 1px solid var(--cpc-line);
      border-radius: var(--r-input);
      cursor: pointer;
      background: transparent;
      transition: border-color 0.2s, color 0.2s;
    }
    .header-lang-toggle:hover { border-color: var(--cpc-gold); color: var(--cpc-gold-deep); }

    /* Back button in header */
    .btn-back {
      display: none;
      align-items: center;
      gap: 6px;
      background: transparent;
      border: 1px solid var(--cpc-line);
      border-radius: var(--r-input);
      padding: 6px 12px;
      font-size: 13px;
      font-weight: 500;
      color: var(--cpc-ink-2);
      cursor: pointer;
      transition: border-color 0.2s, color 0.2s;
    }
    .btn-back:hover { border-color: var(--cpc-gold); color: var(--cpc-gold-deep); }

    /* Bell / notification */
    #bellBtn {
      position: relative;
      background: transparent;
      border: 1px solid var(--cpc-line);
      color: var(--cpc-ink-2);
      border-radius: var(--r-input);
      padding: 6px 10px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      transition: border-color 0.2s, color 0.2s;
    }
    #bellBtn:hover { border-color: var(--cpc-gold); color: var(--cpc-gold-deep); }
    #bellBadge {
      position: absolute;
      top: -6px;
      right: -6px;
      background: var(--cpc-red);
      color: white;
      border-radius: 50%;
      width: 16px;
      height: 16px;
      display: none;
      align-items: center;
      justify-content: center;
      font-family: 'JetBrains Mono', monospace;
      font-size: 9px;
      font-weight: 500;
      border: 2px solid var(--cpc-paper);
    }

    /* Notification panel */
    #notifPanel {
      position: absolute;
      top: 68px;
      right: 16px;
      width: 360px;
      background: var(--cpc-paper);
      border: 1px solid var(--cpc-line);
      border-radius: var(--r-card);
      box-shadow: var(--shadow-modal);
      z-index: 9999;
    }

    /* ── PAGE CONTENT ── */
    #pageContent { flex: 1; overflow-y: auto; padding: 32px; background: var(--cpc-ivory); }

    /* ── LIFECYCLE BAR ── */
    .lifecycle-bar {
      background: var(--cpc-paper);
      border-bottom: 1px solid var(--cpc-line);
      padding: 14px 24px;
      display: flex;
      align-items: center;
      gap: 0;
      overflow-x: auto;
    }
    .lc-step { display: flex; align-items: flex-start; flex-shrink: 0; }
    .lc-node { display: flex; flex-direction: column; align-items: center; gap: 4px; min-width: 90px; }
    .lc-circle {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      font-weight: 500;
      flex-shrink: 0;
      border: 2px solid transparent;
    }
    .lc-label {
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      text-align: center;
      white-space: nowrap;
      line-height: 1.2;
    }
    .lc-pending .lc-label  { color: var(--cpc-ink-2); opacity: 0.75; }
    /* margin-top:15px = (32px circle height / 2) - (2px connector height / 2) — aligns the
       connector's centre with the circle's centre regardless of label height below */
    .lc-connector { height: 2px; width: 48px; flex-shrink: 0; margin-top: 15px; }
    .lc-done .lc-circle    { background: var(--cpc-gold); color: var(--cpc-paper); border-color: var(--cpc-gold); }
    .lc-done .lc-label     { color: var(--cpc-gold-deep); }
    .lc-done .lc-connector { background: var(--cpc-gold); }
    .lc-active .lc-circle  { background: var(--cpc-ink); color: var(--cpc-paper); border-color: var(--cpc-ink); box-shadow: 0 0 0 4px rgba(27,23,18,0.12); }
    .lc-active .lc-label   { color: var(--cpc-ink); font-weight: 600; }
    .lc-active .lc-connector { background: var(--cpc-line); }
    .lc-pending .lc-circle { background: var(--cpc-gold-tint); color: var(--cpc-ink-2); border-color: var(--cpc-line); }
    .lc-pending .lc-label  { color: var(--cpc-ink-2); }
    .lc-pending .lc-connector { background: var(--cpc-line); }
    .lc-info-pill {
      margin-left: 20px;
      background: var(--cpc-gold-tint);
      border: 1px solid var(--cpc-gold-light);
      border-radius: var(--r-pill);
      padding: 4px 14px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 10px;
      letter-spacing: 0.06em;
      color: var(--cpc-gold-deep);
      font-weight: 500;
      white-space: nowrap;
    }

    /* ── RFP TABS ── */
    .rfp-tabs {
      display: flex;
      gap: 0;
      border-bottom: 1px solid var(--cpc-line);
      background: var(--cpc-paper);
      padding: 0 24px;
    }
    .rfp-tab {
      padding: 12px 20px;
      font-size: 13px;
      font-weight: 500;
      color: var(--cpc-ink-2);
      cursor: pointer;
      border-bottom: 2px solid transparent;
      margin-bottom: -1px;
      display: flex;
      align-items: center;
      gap: 6px;
      white-space: nowrap;
      transition: color 0.15s;
      font-family: 'Inter', sans-serif;
    }
    .rfp-tab:hover { color: var(--cpc-gold-deep); }
    .rfp-tab.active { color: var(--cpc-gold-deep); border-bottom-color: var(--cpc-gold); font-weight: 600; }

    /* ── BUTTONS ── */
    .btn-primary {
      background: var(--cpc-gold);
      color: var(--cpc-paper);
      font-weight: 500;
      border-radius: var(--r-input);
      padding: 10px 20px;
      border: 1px solid var(--cpc-gold);
      font-family: 'Inter', sans-serif;
      font-size: 13px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: background 0.2s cubic-bezier(0.4,0,0.2,1);
      white-space: nowrap;
    }
    .btn-primary:hover { background: var(--cpc-gold-deep); border-color: var(--cpc-gold-deep); }

    .btn-secondary {
      background: var(--cpc-paper);
      color: var(--cpc-gold-deep);
      font-weight: 500;
      border-radius: var(--r-input);
      padding: 10px 20px;
      border: 1px solid var(--cpc-gold);
      font-family: 'Inter', sans-serif;
      font-size: 13px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: background 0.2s, color 0.2s;
    }
    .btn-secondary:hover { background: var(--cpc-gold-tint); }

    .btn-ghost {
      background: transparent;
      color: var(--cpc-ink-2);
      font-weight: 500;
      border-radius: var(--r-input);
      padding: 10px 20px;
      border: 1px solid var(--cpc-line);
      font-family: 'Inter', sans-serif;
      font-size: 13px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: border-color 0.2s, color 0.2s, background 0.2s;
    }
    .btn-ghost:hover { border-color: var(--cpc-gold); color: var(--cpc-gold-deep); background: var(--cpc-gold-tint); }

    .btn-danger {
      background: var(--cpc-red);
      color: white;
      font-weight: 500;
      border-radius: var(--r-input);
      padding: 10px 20px;
      border: 1px solid var(--cpc-red);
      font-family: 'Inter', sans-serif;
      font-size: 13px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }

    .btn-sm { padding: 6px 12px; font-size: 12px; }
    .btn-xs { padding: 4px 10px; font-size: 11px; }

    /* Award button — primary gold, positioned */
    .award-btn {
      background: var(--cpc-gold);
      color: var(--cpc-paper);
      font-weight: 600;
      border-radius: var(--r-input);
      padding: 8px 18px;
      cursor: pointer;
      border: 1px solid var(--cpc-gold);
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      font-family: 'Inter', sans-serif;
      transition: background 0.2s;
    }
    .award-btn:hover { background: var(--cpc-gold-deep); border-color: var(--cpc-gold-deep); }
    .award-btn i { font-size: 11px; }

    /* ── CARDS ── */
    .card {
      background: var(--cpc-paper);
      border-radius: var(--r-card);
      border: 1px solid var(--cpc-line);
    }
    .card-hover {
      cursor: pointer;
      transition: border-color 0.15s, box-shadow 0.15s;
    }
    .card-hover:hover {
      border-color: var(--cpc-gold);
      box-shadow: var(--shadow-float);
    }

    /* ── STAT / KPI CARDS ── */
    .stat-card {
      background: var(--cpc-paper);
      border-radius: var(--r-card);
      border: 1px solid var(--cpc-line);
      padding: 20px 24px;
    }
    .stat-value {
      font-family: 'Cormorant Garamond', serif;
      font-weight: 600;
      font-size: 36px;
      line-height: 1.1;
      color: var(--cpc-ink);
      font-feature-settings: 'tnum';
    }
    .stat-label {
      font-family: 'JetBrains Mono', monospace;
      font-size: 10px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--cpc-gold-deep);
      margin-bottom: 8px;
    }
    .stat-change {
      font-size: 12px;
      margin-top: 8px;
      display: flex;
      align-items: center;
      gap: 4px;
      color: var(--cpc-ink-2);
      font-family: 'Inter', sans-serif;
    }

    /* ── STAGE BADGES ── */
    .stage-badge {
      display: inline-block;
      padding: 3px 10px;
      border-radius: var(--r-pill);
      font-family: 'JetBrains Mono', monospace;
      font-size: 10px;
      font-weight: 500;
      letter-spacing: 0.05em;
      white-space: nowrap;
      border: 1px solid transparent;
    }
    .stage-draft            { background: var(--cpc-gold-tint); color: var(--cpc-gold-deep); border-color: var(--cpc-gold-light); }
    .stage-published        { background: #EEF2FF; color: #3730A3; border-color: #C7D2FE; }
    .stage-qa_open          { background: var(--cpc-gold-tint); color: var(--cpc-gold-deep); border-color: var(--cpc-gold-light); }
    .stage-submissions_closed { background: #FEF9C3; color: #854D0E; border-color: #FDE047; }
    .stage-evaluation       { background: #FFF7ED; color: #9A3412; border-color: #FED7AA; }
    .stage-awarded          { background: var(--status-ok-bg); color: var(--status-ok-fg); border-color: #BBF7D0; }

    /* ── TABLES ── */
    table { width: 100%; border-collapse: collapse; }
    thead th {
      background: transparent;
      color: var(--cpc-gold-deep);
      padding: 11px 16px;
      text-align: left;
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.10em;
      text-transform: uppercase;
      border-bottom: 1px solid var(--cpc-line);
    }
    tbody td {
      padding: 15px 16px;
      border-bottom: 1px solid var(--cpc-line);
      font-size: 14px;
      color: var(--cpc-ink);
      font-family: 'Inter', sans-serif;
      vertical-align: middle;
    }
    tbody tr:nth-child(even) td { background: var(--cpc-ivory); }
    /* Hover: use tr background so ALL columns are covered, including flex-display last-td */
    tbody tr:hover > td { background: var(--cpc-gold-tint) !important; }
    tbody tr:hover > td:last-child > * { background: transparent; }

    /* Mono ID chips in tables */
    .id-chip {
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      background: var(--cpc-gold-tint);
      color: var(--cpc-gold-deep);
      padding: 2px 8px;
      border-radius: 4px;
      border: 1px solid var(--cpc-gold-light);
      white-space: nowrap;
    }

    /* ── FORMS ── */
    input, textarea, select {
      border: 1px solid var(--cpc-line);
      border-radius: var(--r-input);
      padding: 10px 14px;
      width: 100%;
      font-size: 14px;
      font-family: 'Inter', sans-serif;
      outline: none;
      transition: border-color 0.2s, box-shadow 0.2s;
      background: var(--cpc-paper);
      color: var(--cpc-ink);
      min-height: 44px;
    }
    input:focus, textarea:focus, select:focus {
      border-color: var(--cpc-gold);
      box-shadow: 0 0 0 3px rgba(186,151,101,0.12);
    }
    label {
      font-family: 'Inter', sans-serif;
      font-weight: 500;
      font-size: 12px;
      color: var(--cpc-ink-2);
      display: block;
      margin-bottom: 6px;
    }
    .form-group { margin-bottom: 16px; }

    /* ── MODAL ── */
    .modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(27,23,18,0.55);
      z-index: 1000;
      display: none;
      align-items: center;
      justify-content: center;
    }
    .modal-overlay.open { display: flex; }
    .modal {
      background: var(--cpc-paper);
      border-radius: var(--r-block);
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
      border-radius: var(--r-card);
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
    .toast.info    { background: var(--cpc-gold-tint); color: var(--cpc-gold-deep); border-color: var(--cpc-gold-light); }
    .toast.warning { background: #FEF9C3; color: #854D0E; border-color: #FDE047; }

    /* ── SPINNER ── */
    .spinner {
      border: 2px solid var(--cpc-line);
      border-top: 2px solid var(--cpc-gold);
      border-radius: 50%;
      width: 18px;
      height: 18px;
      animation: spin 0.7s linear infinite;
      display: inline-block;
    }
    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }

    /* ── SCORE BAR ── */
    .score-bar { height: 6px; border-radius: 3px; background: var(--cpc-line); overflow: hidden; }
    .score-fill { height: 100%; border-radius: 3px; background: var(--cpc-gold); transition: width 0.8s ease; }

    /* ── RFP CARD (list view) ── */
    .rfp-card {
      background: var(--cpc-paper);
      border-radius: var(--r-card);
      border: 1px solid var(--cpc-line);
      padding: 20px 24px;
      cursor: pointer;
      transition: border-color 0.15s, box-shadow 0.15s;
    }
    .rfp-card:hover {
      border-color: var(--cpc-gold);
      box-shadow: var(--shadow-float);
    }

    /* ── AI SUGGESTION CARD ── */
    .ai-suggestion {
      background: var(--cpc-gold-tint);
      border: 1px solid var(--cpc-gold-light);
      border-left: 3px solid var(--cpc-gold);
      border-radius: var(--r-card);
      padding: 16px 20px;
    }
    .ai-label {
      font-family: 'JetBrains Mono', monospace;
      font-size: 10px;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--cpc-gold);
      font-weight: 500;
      margin-bottom: 8px;
    }
    .ai-meta {
      font-family: 'JetBrains Mono', monospace;
      font-size: 10px;
      color: var(--cpc-ink-2);
      letter-spacing: 0.06em;
    }

    /* ── SECTION HEADINGS ── */
    .sec-head {
      display: flex;
      align-items: baseline;
      gap: 14px;
      margin-bottom: 24px;
      padding-bottom: 14px;
      border-bottom: 1px solid var(--cpc-line);
    }
    .sec-num {
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      color: var(--cpc-gold);
      letter-spacing: 0.15em;
    }
    .sec-title {
      font-family: 'Cormorant Garamond', serif;
      font-weight: 500;
      font-size: 28px;
      color: var(--cpc-ink);
      line-height: 1.1;
    }

    /* Page-level heading (dashboard, list) */
    .page-heading {
      font-family: 'Cormorant Garamond', serif;
      font-weight: 600;
      font-size: 32px;
      color: var(--cpc-ink);
      line-height: 1.15;
      margin-bottom: 4px;
    }
    .page-sub {
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--cpc-ink-2);
    }

    /* ── NOTIFICATION SYSTEM ── */
    @keyframes notifSlideIn  { from { opacity:0; transform:translateX(40px);  } to { opacity:1; transform:translateX(0);   } }
    @keyframes notifSlideOut { from { opacity:1; transform:translateX(0);     } to { opacity:0; transform:translateX(40px); } }
    @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.5;transform:scale(1.15)} }

    /* ── TAGS ── */
    .tag {
      display: inline-block;
      background: var(--cpc-gold-tint);
      color: var(--cpc-gold-deep);
      padding: 3px 10px;
      border-radius: var(--r-pill);
      font-size: 11px;
      font-family: 'JetBrains Mono', monospace;
      letter-spacing: 0.04em;
      margin: 2px 2px;
      border: 1px solid var(--cpc-gold-light);
      white-space: nowrap;
      max-width: 220px;
      overflow: hidden;
      text-overflow: ellipsis;
      vertical-align: middle;
    }
    /* Tag container: allow wrapping but never stretch individual tag */
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
    .perf-badge { padding: 3px 8px; border-radius: var(--r-pill); font-size: 10px; font-weight: 500; font-family: 'JetBrains Mono', monospace; letter-spacing: 0.05em; border: 1px solid transparent; }
    .perf-high  { background: var(--status-ok-bg); color: var(--status-ok-fg); border-color: #BBF7D0; }
    .perf-mid   { background: #FEF9C3; color: #854D0E; border-color: #FDE047; }
    .perf-low   { background: var(--status-err-bg); color: var(--status-err-fg); border-color: #FECDD3; }

    /* ── FILE COUNT BADGE ── */
    .file-count-badge {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 10px;
      font-weight: 500;
      letter-spacing: 0.05em;
      color: var(--cpc-gold-deep);
      background: var(--cpc-gold-tint);
      border: 1px solid var(--cpc-gold-light);
      border-radius: var(--r-pill);
      padding: 3px 10px;
      cursor: pointer;
      transition: background 0.15s, border-color 0.15s;
      user-select: none;
      white-space: nowrap;
    }
    .file-count-badge:hover { background: var(--cpc-gold-light); border-color: var(--cpc-gold); }

    /* ── PANEL SECTION TITLE ── */
    .panel-section-title {
      display: flex;
      align-items: center;
      gap: 6px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 10px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      font-weight: 500;
      color: var(--cpc-gold-deep);
      margin-bottom: 10px;
    }

    /* ── HERITAGE PATTERN overlay (decorative, low-opacity) ── */
    .pattern-bg {
      pointer-events: none;
      position: absolute;
      width: 400px;
      height: 400px;
      background: url('/static/pattern.svg') center / contain no-repeat;
      opacity: 0.05;
    }

    /* ── RFP DOCUMENT STYLES ── */
    .rfp-doc {
      font-family: 'Inter', Arial, sans-serif;
      color: #1A1A1A;
      max-width: 860px;
      margin: 0 auto;
      background: white;
      border: 1px solid var(--cpc-line);
      border-radius: var(--r-card);
      overflow: hidden;
    }

    /* Mini bar chart */
    .mini-bar { display: flex; align-items: flex-end; gap: 6px; height: 60px; }
    .mini-bar-item { flex: 1; border-radius: 4px 4px 0 0; background: var(--cpc-gold); opacity: 0.65; min-width: 20px; transition: opacity 0.2s; }
    .mini-bar-item:hover { opacity: 1; }
  </style>
</head>
<body>
<div class="app-shell">
  <!-- ── SIDEBAR ── -->
  <aside class="cpc-sidebar">
    <!-- Brand -->
    <div class="sidebar-brand">
      <div class="sidebar-emblem">
        <img src="/static/cpc-emblem.png" alt="CPC Emblem" style="width:52px;height:52px;object-fit:contain;">
      </div>
      <div class="sidebar-wordmark">
        <div class="wm-org">Crown Prince's Court</div>
        <div class="wm-product">AI RFP Management</div>
      </div>
    </div>

    <!-- Navigation -->
    <nav class="sidebar-nav" id="mainNav">
      <div class="nav-section-label">Overview</div>
      <a href="#" class="nav-item active" data-page="dashboard">
        <i class="fas fa-chart-pie"></i><span>Dashboard</span>
      </a>

      <div class="nav-section-label" style="margin-top:8px">Procurement</div>
      <a href="#" class="nav-item" data-page="rfps">
        <i class="fas fa-layer-group"></i><span>All RFPs</span>
      </a>
      <a href="#" class="nav-item" data-page="vendors">
        <i class="fas fa-building"></i><span>Vendor Registry</span>
      </a>

      <div class="nav-section-label" style="margin-top:8px">Analytics</div>
      <a href="#" class="nav-item" data-page="reports">
        <i class="fas fa-chart-bar"></i><span>Reports</span>
      </a>
    </nav>

    <!-- User chip -->
    <div class="sidebar-user">
      <div class="user-avatar">PM</div>
      <div class="user-info">
        <div class="user-name">Procurement Manager</div>
        <div class="user-role">CPC · Abu Dhabi</div>
      </div>
    </div>
  </aside>

  <!-- ── MAIN ── -->
  <main class="app-main">
    <!-- Top header -->
    <header class="cpc-header">
      <div class="header-left">
        <button id="backBtn" onclick="goBack()" class="btn-back" style="display:none">
          <i class="fas fa-arrow-left" style="font-size:11px"></i> Back
        </button>
        <div>
          <div class="header-page-title" id="pageTitle">Dashboard</div>
          <div class="header-page-subtitle" id="pageSubtitle">AI-Powered Procurement Management</div>
        </div>
      </div>
      <div class="header-right">
        <span class="header-date" id="headerDate"></span>
        <button class="header-lang-toggle">AR / EN</button>
        <button id="bellBtn" onclick="toggleNotifPanel()" title="Notifications">
          <i class="fas fa-bell"></i>
          <span id="bellBadge">0</span>
        </button>
      </div>
    </header>

    <!-- Notification panel -->
    <div id="notifPanel" style="display:none"></div>

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

<script src="/static/app.js" defer><\/script>
</body>
</html>`;
}
