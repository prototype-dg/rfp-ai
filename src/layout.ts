export function getLayout(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CPC AI-Powered RFP Tool</title>
  <script src="https://cdn.tailwindcss.com" defer><\/script>
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
  <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"><\/script>
  <link href="/static/style.css" rel="stylesheet">
  <style>
    :root {
      --cpc-navy:#1a1a2e;
      --cpc-blue:#0f3460;
      --cpc-gold:#c9a84c;
      --cpc-gold-light:#e8c96e;
      --cpc-light:#f8f6f0;
    }
    * { box-sizing: border-box; }
    body { font-family:'Segoe UI',system-ui,sans-serif; background:var(--cpc-light); margin:0; }
    .cpc-sidebar { background:var(--cpc-navy); min-height:100vh; }
    .cpc-header { background:var(--cpc-blue); }
    .cpc-gold { color:var(--cpc-gold); }
    .cpc-gold-bg { background:var(--cpc-gold); }
    .cpc-navy-bg { background:var(--cpc-navy); }
    .cpc-blue-bg { background:var(--cpc-blue); }

    /* Navigation */
    .nav-item { transition:all 0.2s; border-left:3px solid transparent; display:flex; align-items:center; gap:0.75rem; padding:0.7rem 1rem; border-radius:0.5rem; color:#d1d5db; font-size:0.875rem; font-weight:500; text-decoration:none; cursor:pointer; margin-bottom:2px; }
    .nav-item:hover, .nav-item.active { background:rgba(201,168,76,0.15); border-left-color:var(--cpc-gold); color:var(--cpc-gold); }
    .nav-section-label { font-size:0.65rem; font-weight:700; text-transform:uppercase; letter-spacing:0.1em; color:#6b7280; padding:0.75rem 1rem 0.25rem; }

    /* Cards */
    .card { background:white; border-radius:12px; box-shadow:0 2px 8px rgba(0,0,0,0.08); }
    .card-hover { transition:transform 0.2s, box-shadow 0.2s; cursor:pointer; }
    .card-hover:hover { transform:translateY(-2px); box-shadow:0 6px 20px rgba(0,0,0,0.12); }

    /* Buttons */
    .btn-primary { background:var(--cpc-gold); color:var(--cpc-navy); font-weight:600; border-radius:8px; padding:0.5rem 1.25rem; transition:all 0.2s; cursor:pointer; border:none; display:inline-flex; align-items:center; gap:0.4rem; font-size:0.875rem; }
    .btn-primary:hover { background:var(--cpc-gold-light); transform:translateY(-1px); }
    .btn-secondary { background:var(--cpc-blue); color:white; font-weight:600; border-radius:8px; padding:0.5rem 1.25rem; transition:all 0.2s; cursor:pointer; border:none; display:inline-flex; align-items:center; gap:0.4rem; font-size:0.875rem; }
    .btn-secondary:hover { background:var(--cpc-navy); }
    .btn-danger { background:#dc3545; color:white; font-weight:600; border-radius:8px; padding:0.5rem 1.25rem; cursor:pointer; border:none; display:inline-flex; align-items:center; gap:0.4rem; font-size:0.875rem; }
    .btn-ghost { background:transparent; color:#6b7280; font-weight:500; border-radius:8px; padding:0.4rem 0.875rem; cursor:pointer; border:1px solid #e5e7eb; display:inline-flex; align-items:center; gap:0.4rem; font-size:0.875rem; transition:all 0.2s; }
    .btn-ghost:hover { background:#f3f4f6; }
    .btn-sm { padding:0.3rem 0.75rem; font-size:0.8rem; }
    /* Award button — gold, highlighted, end-of-process */
    .award-btn { background:linear-gradient(135deg,#c9a84c,#e8c84a,#c9a84c); color:#1a1a2e; font-weight:700; border-radius:8px; padding:0.35rem 0.9rem; cursor:pointer; border:2px solid #c9a84c; display:inline-flex; align-items:center; gap:0.4rem; font-size:0.8rem; box-shadow:0 2px 8px rgba(201,168,76,0.45); transition:all 0.2s; letter-spacing:0.02em; }
    .award-btn:hover { background:linear-gradient(135deg,#e8c84a,#ffd740,#e8c84a); box-shadow:0 4px 16px rgba(201,168,76,0.6); transform:translateY(-1px) scale(1.03); }
    .award-btn i { font-size:0.85rem; }

    /* Stage badges */
    .stage-badge { padding:0.2rem 0.6rem; border-radius:20px; font-size:0.72rem; font-weight:600; display:inline-block; white-space:nowrap; }
    .stage-draft { background:#e3e8f0; color:#475569; }
    .stage-published { background:#dbeafe; color:#1d4ed8; }
    .stage-qa_open { background:#ede9fe; color:#6d28d9; }
    .stage-submissions_closed { background:#fef3c7; color:#92400e; }
    .stage-evaluation { background:#fff7ed; color:#c2410c; }
    .stage-awarded { background:#d1fae5; color:#065f46; }

    /* ===== LIFECYCLE BAR ===== */
    .lifecycle-bar {
      background:white;
      border-bottom:1px solid #e5e7eb;
      padding:0.875rem 1.5rem;
      display:flex;
      align-items:center;
      gap:0;
      overflow-x:auto;
    }
    .lc-step {
      display:flex;
      align-items:center;
      flex-shrink:0;
    }
    .lc-node {
      display:flex;
      flex-direction:column;
      align-items:center;
      gap:4px;
      min-width:90px;
    }
    .lc-circle {
      width:34px;
      height:34px;
      border-radius:50%;
      display:flex;
      align-items:center;
      justify-content:center;
      font-size:0.78rem;
      font-weight:700;
      flex-shrink:0;
      border:2px solid transparent;
    }
    .lc-label {
      font-size:0.7rem;
      font-weight:600;
      text-align:center;
      white-space:nowrap;
      line-height:1.2;
    }
    .lc-connector {
      height:2px;
      width:48px;
      flex-shrink:0;
      margin-bottom:18px;
    }
    .lc-done .lc-circle { background:var(--cpc-gold); color:var(--cpc-navy); border-color:var(--cpc-gold); }
    .lc-done .lc-label { color:var(--cpc-gold); }
    .lc-done .lc-connector { background:var(--cpc-gold); }
    .lc-active .lc-circle { background:var(--cpc-blue); color:white; border-color:var(--cpc-blue); box-shadow:0 0 0 4px rgba(15,52,96,0.18); }
    .lc-active .lc-label { color:var(--cpc-blue); font-weight:700; }
    .lc-active .lc-connector { background:#e5e7eb; }
    .lc-pending .lc-circle { background:#f3f4f6; color:#9ca3af; border-color:#e5e7eb; }
    .lc-pending .lc-label { color:#9ca3af; }
    .lc-pending .lc-connector { background:#e5e7eb; }
    .lc-info-pill {
      margin-left:1.25rem;
      background:rgba(15,52,96,0.06);
      border:1px solid rgba(15,52,96,0.12);
      border-radius:20px;
      padding:0.35rem 0.875rem;
      font-size:0.78rem;
      color:var(--cpc-blue);
      font-weight:500;
      white-space:nowrap;
    }

    /* ===== RFP TABS ===== */
    .rfp-tabs {
      display:flex;
      gap:0;
      border-bottom:2px solid #e5e7eb;
      background:white;
      padding:0 1.5rem;
    }
    .rfp-tab {
      padding:0.75rem 1.25rem;
      font-size:0.85rem;
      font-weight:500;
      color:#6b7280;
      cursor:pointer;
      border-bottom:2px solid transparent;
      margin-bottom:-2px;
      display:flex;
      align-items:center;
      gap:0.4rem;
      white-space:nowrap;
      transition:color 0.15s;
    }
    .rfp-tab:hover { color:var(--cpc-blue); }
    .rfp-tab.active { color:var(--cpc-blue); border-bottom-color:var(--cpc-blue); font-weight:600; }

    /* Spinner */
    .spinner { border:3px solid #f3f3f3; border-top:3px solid var(--cpc-gold); border-radius:50%; width:20px; height:20px; animation:spin 0.8s linear infinite; display:inline-block; }
    @keyframes spin { 0%{transform:rotate(0deg)} 100%{transform:rotate(360deg)} }
    @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.5;transform:scale(1.15)} }

    /* Toast */
    .toast { position:fixed; top:1rem; right:1rem; z-index:9999; padding:0.875rem 1.25rem; border-radius:10px; color:white; font-weight:500; opacity:0; transition:opacity 0.3s; box-shadow:0 4px 12px rgba(0,0,0,0.2); pointer-events:none; max-width:360px; }
    .toast.show { opacity:1; }
    .toast.success { background:#065f46; }
    .toast.error { background:#991b1b; }
    .toast.info { background:var(--cpc-blue); }
    .toast.warning { background:#b45309; }

    /* Tables */
    table { width:100%; border-collapse:collapse; }
    th { background:var(--cpc-blue); color:white; padding:0.75rem 1rem; text-align:left; font-weight:600; font-size:0.82rem; text-transform:uppercase; letter-spacing:0.05em; }
    td { padding:0.7rem 1rem; border-bottom:1px solid #e5e7eb; font-size:0.875rem; }
    tr:hover td { background:#f9fafb; }

    /* Modal */
    .modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.55); z-index:1000; display:none; align-items:center; justify-content:center; }
    .modal-overlay.open { display:flex; }
    .modal { background:white; border-radius:16px; padding:2rem; max-width:680px; width:93%; max-height:92vh; overflow-y:auto; box-shadow:0 20px 60px rgba(0,0,0,0.3); }

    /* Score bar */
    .score-bar { height:8px; border-radius:4px; background:#e5e7eb; overflow:hidden; }
    .score-fill { height:100%; border-radius:4px; background:linear-gradient(90deg,var(--cpc-blue),var(--cpc-gold)); transition:width 0.8s ease; }

    /* Form inputs */
    input, textarea, select { border:1.5px solid #d1d5db; border-radius:8px; padding:0.5rem 0.75rem; width:100%; font-size:0.9rem; outline:none; transition:border-color 0.2s; background:white; }
    input:focus, textarea:focus, select:focus { border-color:var(--cpc-gold); box-shadow:0 0 0 3px rgba(201,168,76,0.15); }
    label { font-weight:600; color:#374151; font-size:0.83rem; display:block; margin-bottom:0.3rem; }
    .form-group { margin-bottom:1rem; }

    /* Tags */
    .tag { display:inline-block; background:#e0f2fe; color:#0369a1; padding:0.15rem 0.5rem; border-radius:12px; font-size:0.72rem; margin:0.1rem; }

    /* Space helpers */
    .space-y-4 > * + * { margin-top:1rem; }
    .space-y-6 > * + * { margin-top:1.5rem; }

    /* Stats cards */
    .stat-card { background:white; border-radius:12px; padding:1.25rem; box-shadow:0 2px 8px rgba(0,0,0,0.06); }
    .stat-value { font-size:2rem; font-weight:700; line-height:1.1; }
    .stat-label { font-size:0.82rem; color:#6b7280; margin-top:0.25rem; font-weight:500; }
    .stat-change { font-size:0.75rem; margin-top:0.5rem; display:flex; align-items:center; gap:0.25rem; }

    /* RFP Cards */
    .rfp-card { background:white; border-radius:12px; box-shadow:0 2px 8px rgba(0,0,0,0.07); padding:1.25rem 1.5rem; cursor:pointer; transition:all 0.2s; border:2px solid transparent; }
    .rfp-card:hover { transform:translateY(-2px); box-shadow:0 6px 20px rgba(0,0,0,0.1); border-color:var(--cpc-gold); }

    /* Page content area */
    #pageContent { flex:1; overflow-y:auto; }

    /* ===== RFP DOCUMENT STYLES — matches real CPC RFP template ===== */
    /* Real doc: white background, Calibri font, CPC logo top-center,
       gold lattice header band, teal accent colors, clean body text */

    /* Lattice pattern: repeating interlocking circles in gold */
    @keyframes none {}
    .rfp-doc {
      font-family:'Calibri','Segoe UI',Arial,sans-serif;
      color:#1a1a1a; max-width:860px; margin:0 auto; background:white;
      border:1px solid #e5e7eb; border-radius:4px; overflow:hidden;
    }

    /* ── COVER PAGE ── */
    .rfp-cover {
      background:white; color:#1a1a1a;
      padding:0; border-radius:4px 4px 0 0;
      border-bottom:1px solid #e5e7eb;
    }

    /* Gold lattice header band (top of every page) */
    .rfp-header-band {
      height:22px; width:100%;
      background: repeating-linear-gradient(
        90deg,
        #c9a84c 0px, #c9a84c 2px, transparent 2px, transparent 8px
      ),
      repeating-linear-gradient(
        0deg,
        #c9a84c 0px, #c9a84c 2px, transparent 2px, transparent 8px
      );
      background-color: #f5e6c0;
    }

    /* Thin separator line of hollow circles below gold band */
    .rfp-circle-divider {
      height:8px; width:100%;
      background: radial-gradient(circle at center, transparent 2px, #d1d5db 2px, #d1d5db 3px, transparent 3px);
      background-size:12px 8px;
      background-repeat:repeat-x;
      background-position:center;
      border-bottom:1px solid #e5e7eb;
    }

    /* Logo area: centered with bilingual text + crest */
    .rfp-cover-logo {
      display:flex; align-items:center; justify-content:center;
      gap:1.5rem; padding:1.25rem 2.5rem 1rem; width:100%;
    }
    .rfp-logo-emblem {
      flex-shrink:0;
    }
    .rfp-logo-text {
      display:flex; flex-direction:column; gap:1px; align-items:flex-start;
    }
    .rfp-logo-text .rfp-org-name {
      font-size:1.05rem; font-weight:700; color:#1a1a1a;
      letter-spacing:0.03em; font-family:'Calibri','Segoe UI',sans-serif;
    }
    .rfp-logo-text .rfp-org-arabic {
      font-size:0.95rem; color:#1a1a1a; direction:rtl;
      font-family:'Calibri',Arial,sans-serif;
    }
    .rfp-cover-divider {
      width:calc(100% - 5rem); height:1px;
      background:#d1d5db; margin:0 2.5rem;
    }

    /* Cover body: title left-aligned, lower-left as in real doc */
    .rfp-cover-body {
      padding:3rem 2.5rem 2rem;
    }
    .rfp-cover-body .rfp-doc-type {
      font-size:0.82rem; font-weight:700; letter-spacing:0.12em;
      color:#4BACED; text-transform:uppercase;
      font-family:'Calibri','Segoe UI',sans-serif;
      margin-bottom:0.3rem;
    }
    .rfp-cover-body .rfp-doc-title {
      font-size:2rem; font-weight:700; line-height:1.25;
      color:#1a1a1a; margin:0 0 1rem;
      font-family:'Calibri','Segoe UI',sans-serif;
    }
    .rfp-cover-body .rfp-doc-subtitle {
      font-size:0.88rem; color:#4BACED; margin:0 0 0.25rem;
      font-style:italic; font-family:'Calibri',sans-serif;
    }
    .rfp-cover-body .rfp-doc-date {
      font-size:0.85rem; color:#215868; margin:0;
      font-weight:600; font-family:'Calibri',sans-serif;
    }
    .rfp-cover-footer-bar {
      display:none; /* not in real doc, removed */
    }

    /* ── META / INFO TABLE ── */
    .rfp-meta-table { width:100%; border-collapse:collapse; margin:0; }
    .rfp-meta-table th {
      background:#215868; color:white; padding:0.6rem 1rem;
      font-size:0.82rem; font-weight:700; border:1px solid #1a4455;
      text-transform:none; letter-spacing:0;
      font-family:'Calibri','Segoe UI',sans-serif;
    }
    .rfp-meta-table td {
      background:white; padding:0.6rem 1rem; font-size:0.875rem;
      border:1px solid #d1d5db;
      font-family:'Calibri','Segoe UI',sans-serif;
    }

    /* ── PAGE HEADER (interior pages) ── */
    .rfp-page-header {
      display:flex; align-items:center; justify-content:space-between;
      padding:0.6rem 2rem; border-bottom:2px solid #4BACED;
    }
    .rfp-page-header-logo {
      font-size:0.78rem; font-weight:700; color:#215868;
    }
    .rfp-page-header-ref {
      font-size:0.75rem; color:#9ca3af;
    }

    /* ── TOC ── */
    .rfp-toc {
      padding:1.5rem 2rem 1rem; background:white;
      border-bottom:1px solid #e5e7eb;
    }
    .rfp-toc-title {
      font-size:1.1rem; font-weight:700; color:#4BACED;
      margin-bottom:0.75rem;
      font-family:'Calibri','Segoe UI',sans-serif;
    }
    .rfp-toc-item {
      display:flex; justify-content:space-between;
      padding:0.28rem 0; font-size:0.88rem; color:#215868;
      border-bottom:1px dotted #d1d5db;
      font-family:'Calibri','Segoe UI',sans-serif;
    }
    .rfp-toc-item.bold { font-weight:700; }
    .rfp-toc-item.indent { padding-left:1.25rem; color:#374151; font-weight:400; }

    /* ── SECTIONS ── */
    .rfp-section {
      padding:1.5rem 2rem; border-bottom:1px solid #e5e7eb;
    }
    .rfp-section-body { flex:1; }
    .rfp-section-title {
      font-size:1.1rem; font-weight:700; color:#1a1a1a;
      margin-bottom:0.75rem;
      font-family:'Calibri','Segoe UI',sans-serif;
      border-bottom:2px solid #4BACED;
      padding-bottom:0.35rem;
    }
    .rfp-section p {
      font-size:0.9rem; line-height:1.75; margin:0 0 0.65rem;
      font-family:'Calibri','Segoe UI',sans-serif;
    }
    .rfp-section ul { margin:0.4rem 0 0.65rem 1.5rem; }
    .rfp-section li {
      font-size:0.875rem; line-height:1.7; margin-bottom:0.2rem;
      font-family:'Calibri','Segoe UI',sans-serif;
    }
    .rfp-subsection { margin:1rem 0 0.4rem; }
    .rfp-subsection-title {
      font-size:0.95rem; font-weight:700; color:#215868;
      margin-bottom:0.4rem;
      font-family:'Calibri','Segoe UI',sans-serif;
    }
    .rfp-deliverables {
      background:#f0f9ff; border-left:3px solid #4BACED;
      padding:0.55rem 0.875rem; font-size:0.82rem;
      color:#374151; margin-top:0.4rem; line-height:1.6;
      font-family:'Calibri','Segoe UI',sans-serif;
    }
    .rfp-deliverables strong { color:#215868; }

    /* ── SPEC / DATA TABLES ── */
    .rfp-spec-table {
      width:100%; border-collapse:collapse; margin:0.65rem 0;
      font-size:0.85rem; font-family:'Calibri','Segoe UI',sans-serif;
    }
    .rfp-spec-table th {
      background:#215868; color:white; padding:0.55rem 0.875rem;
      font-weight:700; text-transform:none; letter-spacing:0;
      font-size:0.85rem;
    }
    .rfp-spec-table td {
      padding:0.5rem 0.875rem; border:1px solid #d1d5db;
      line-height:1.5; vertical-align:top;
    }
    .rfp-spec-table tr:nth-child(even) td { background:#f0f9ff; }

    /* ── FOOTER ── */
    .rfp-footer {
      background:#215868; color:white; padding:1rem 2rem;
      text-align:center; font-size:0.8rem; line-height:1.8;
      border-radius:0 0 4px 4px;
      font-family:'Calibri','Segoe UI',sans-serif;
    }

    /* Section num badge — now inline before title */
    .rfp-section-num {
      display:inline-block;
      width:26px; height:26px; border-radius:50%;
      background:#4BACED; color:white;
      line-height:26px; text-align:center;
      font-weight:700; font-size:0.8rem;
      margin-right:0.5rem; vertical-align:middle;
      flex-shrink:0;
    }

    /* Chart placeholder */
    .mini-bar { display:flex; align-items:flex-end; gap:6px; height:60px; }
    .mini-bar-item { flex:1; border-radius:4px 4px 0 0; background:var(--cpc-blue); opacity:0.85; min-width:20px; transition:opacity 0.2s; }
    .mini-bar-item:hover { opacity:1; }

    /* Vendor perf table */
    .perf-badge { padding:0.15rem 0.45rem; border-radius:10px; font-size:0.7rem; font-weight:600; }
    .perf-high { background:#d1fae5; color:#065f46; }
    .perf-mid { background:#fef3c7; color:#92400e; }
    .perf-low { background:#fee2e2; color:#991b1b; }

    /* ===== NOTIFICATION SYSTEM ===== */
    #bellBtn { position:relative; background:rgba(255,255,255,0.15); border:none; color:white; border-radius:8px; padding:0.4rem 0.6rem; cursor:pointer; display:inline-flex; align-items:center; justify-content:center; font-size:1rem; transition:background 0.2s; }
    #bellBtn:hover { background:rgba(255,255,255,0.25); }
    #bellBadge { position:absolute; top:-6px; right:-6px; background:#ef4444; color:white; border-radius:50%; width:18px; height:18px; display:none; align-items:center; justify-content:center; font-size:0.65rem; font-weight:700; border:2px solid var(--cpc-blue); }
    #notifPanel { position:absolute; top:60px; right:1rem; width:360px; background:white; border:1px solid #e5e7eb; border-radius:12px; box-shadow:0 12px 40px rgba(0,0,0,0.18); z-index:9999; }
    @keyframes notifSlideIn { from { opacity:0; transform:translateX(40px); } to { opacity:1; transform:translateX(0); } }
    @keyframes notifSlideOut { from { opacity:1; transform:translateX(0); } to { opacity:0; transform:translateX(40px); } }
  </style>
</head>
<body>
<div style="display:flex;height:100vh;overflow:hidden">
  <!-- Sidebar -->
  <aside class="cpc-sidebar" style="width:240px;flex-shrink:0;display:flex;flex-direction:column;overflow-y:auto">
    <div style="padding:1.1rem 1rem;border-bottom:1px solid rgba(255,255,255,0.1)">
      <div style="display:flex;align-items:center;gap:0.75rem">
        <div style="width:38px;height:38px;border-radius:8px;background:var(--cpc-gold);display:flex;align-items:center;justify-content:center;flex-shrink:0">
          <i class="fas fa-crown" style="color:var(--cpc-navy);font-size:0.85rem"></i>
        </div>
        <div>
          <div style="color:white;font-weight:700;font-size:0.82rem;line-height:1.2">Crown Prince's Court</div>
          <div style="color:var(--cpc-gold);font-size:0.72rem">AI RFP Management</div>
        </div>
      </div>
    </div>

    <nav style="flex:1;padding:0.5rem 0.5rem;margin-top:0.25rem" id="mainNav">
      <div class="nav-section-label">Overview</div>
      <a href="#" class="nav-item active" data-page="dashboard">
        <i class="fas fa-chart-pie" style="width:16px;text-align:center"></i><span>Dashboard</span>
      </a>

      <div class="nav-section-label" style="margin-top:0.5rem">Procurement</div>
      <a href="#" class="nav-item" data-page="rfps">
        <i class="fas fa-layer-group" style="width:16px;text-align:center"></i><span>All RFPs</span>
      </a>
      <a href="#" class="nav-item" data-page="vendors">
        <i class="fas fa-building" style="width:16px;text-align:center"></i><span>Vendor Registry</span>
      </a>

      <div class="nav-section-label" style="margin-top:0.5rem">Analytics</div>
      <a href="#" class="nav-item" data-page="reports">
        <i class="fas fa-chart-bar" style="width:16px;text-align:center"></i><span>Reports</span>
      </a>
    </nav>

    <div style="padding:0.875rem;border-top:1px solid rgba(255,255,255,0.1)">
      <div style="display:flex;align-items:center;gap:0.75rem">
        <div style="width:30px;height:30px;border-radius:50%;background:var(--cpc-gold);display:flex;align-items:center;justify-content:center;font-size:0.7rem;font-weight:700;color:var(--cpc-navy);flex-shrink:0">PM</div>
        <div>
          <div style="color:white;font-size:0.8rem;font-weight:500">Procurement Manager</div>
          <div style="color:#9ca3af;font-size:0.7rem">CPC - Abu Dhabi</div>
        </div>
      </div>
    </div>
  </aside>

  <!-- Main content -->
  <main style="flex:1;display:flex;flex-direction:column;min-height:100vh;overflow:hidden">
    <!-- Top header -->
    <header class="cpc-header" style="color:white;padding:0.875rem 1.5rem;display:flex;align-items:center;justify-content:space-between;box-shadow:0 2px 8px rgba(0,0,0,0.2);flex-shrink:0">
      <div style="display:flex;align-items:center;gap:0.75rem">
        <button id="backBtn" onclick="goBack()" style="display:none;background:rgba(255,255,255,0.15);border:none;color:white;border-radius:6px;padding:0.35rem 0.7rem;cursor:pointer;font-size:0.85rem;display:none;align-items:center;gap:0.4rem" id="backBtn">
          <i class="fas fa-arrow-left"></i> Back
        </button>
        <div>
          <h1 style="font-size:1.05rem;font-weight:700;margin:0;line-height:1.2" id="pageTitle">Dashboard</h1>
          <p style="color:#bfdbfe;font-size:0.72rem;margin:0" id="pageSubtitle">AI-Powered Procurement Management</p>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:0.875rem">
        <div style="font-size:0.8rem;color:#bfdbfe" id="headerDate"></div>
        <button id="bellBtn" onclick="toggleNotifPanel()" title="Notifications">
          <i class="fas fa-bell"></i>
          <span id="bellBadge">0</span>
        </button>
      </div>
    </header>
    <!-- Notification panel (absolute positioned below header) -->
    <div id="notifPanel" style="display:none"></div>

    <!-- RFP lifecycle bar (hidden unless on RFP detail) -->
    <div id="lifecycleBar" style="display:none"></div>

    <!-- RFP tabs (hidden unless on RFP detail) -->
    <div id="rfpTabsBar" style="display:none"></div>

    <!-- Page content -->
    <div id="pageContent" style="flex:1;padding:1.5rem;overflow-y:auto">
      <div style="display:flex;align-items:center;justify-content:center;height:160px">
        <div class="spinner" style="width:36px;height:36px;border-width:4px"></div>
      </div>
    </div>
  </main>
</div>

<!-- Toast notification -->
<div class="toast" id="toast"></div>

<!-- Modal -->
<div class="modal-overlay" id="modalOverlay">
  <div class="modal" id="modalContent"></div>
</div>

<script src="/static/app.js" defer><\/script>
</body>
</html>`;
}
