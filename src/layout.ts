export function getLayout(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CPC AI-Powered RFP Tool</title>
  <script src="https://cdn.tailwindcss.com" defer><\/script>
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
  <link href="/static/style.css" rel="stylesheet">
  <style>
    :root { --cpc-navy:#1a1a2e; --cpc-blue:#0f3460; --cpc-gold:#c9a84c; --cpc-gold-light:#e8c96e; --cpc-light:#f8f6f0; }
    body { font-family:'Segoe UI',system-ui,sans-serif; background:var(--cpc-light); margin:0; }
    .cpc-sidebar { background:var(--cpc-navy); min-height:100vh; }
    .cpc-header { background:var(--cpc-blue); }
    .cpc-gold { color:var(--cpc-gold); }
    .cpc-gold-bg { background:var(--cpc-gold); }
    .cpc-navy-bg { background:var(--cpc-navy); }
    .cpc-blue-bg { background:var(--cpc-blue); }
    .nav-item { transition:all 0.2s; border-left:3px solid transparent; display:flex; align-items:center; gap:0.75rem; padding:0.75rem 1rem; border-radius:0.5rem; color:#d1d5db; font-size:0.875rem; font-weight:500; text-decoration:none; }
    .nav-item:hover, .nav-item.active { background:rgba(201,168,76,0.15); border-left-color:var(--cpc-gold); color:var(--cpc-gold); }
    .card { background:white; border-radius:12px; box-shadow:0 2px 8px rgba(0,0,0,0.08); }
    .btn-primary { background:var(--cpc-gold); color:var(--cpc-navy); font-weight:600; border-radius:8px; padding:0.5rem 1.25rem; transition:all 0.2s; cursor:pointer; border:none; display:inline-flex; align-items:center; }
    .btn-primary:hover { background:var(--cpc-gold-light); transform:translateY(-1px); }
    .btn-secondary { background:var(--cpc-blue); color:white; font-weight:600; border-radius:8px; padding:0.5rem 1.25rem; transition:all 0.2s; cursor:pointer; border:none; display:inline-flex; align-items:center; }
    .btn-secondary:hover { background:var(--cpc-navy); }
    .btn-danger { background:#dc3545; color:white; font-weight:600; border-radius:8px; padding:0.5rem 1.25rem; cursor:pointer; border:none; display:inline-flex; align-items:center; }
    .stage-badge { padding:0.2rem 0.6rem; border-radius:20px; font-size:0.75rem; font-weight:600; display:inline-block; }
    .stage-draft { background:#e3e8f0; color:#475569; }
    .stage-published { background:#dbeafe; color:#1d4ed8; }
    .stage-evaluation { background:#fef3c7; color:#92400e; }
    .stage-awarded { background:#d1fae5; color:#065f46; }
    .spinner { border:3px solid #f3f3f3; border-top:3px solid var(--cpc-gold); border-radius:50%; width:20px; height:20px; animation:spin 0.8s linear infinite; display:inline-block; }
    @keyframes spin { 0%{transform:rotate(0deg)} 100%{transform:rotate(360deg)} }
    .toast { position:fixed; top:1rem; right:1rem; z-index:9999; padding:0.875rem 1.25rem; border-radius:10px; color:white; font-weight:500; opacity:0; transition:opacity 0.3s; box-shadow:0 4px 12px rgba(0,0,0,0.2); pointer-events:none; }
    .toast.show { opacity:1; }
    .toast.success { background:#065f46; }
    .toast.error { background:#991b1b; }
    .toast.info { background:var(--cpc-blue); }
    table { width:100%; border-collapse:collapse; }
    th { background:var(--cpc-blue); color:white; padding:0.75rem 1rem; text-align:left; font-weight:600; font-size:0.85rem; text-transform:uppercase; letter-spacing:0.05em; }
    td { padding:0.75rem 1rem; border-bottom:1px solid #e5e7eb; }
    tr:hover td { background:#f9fafb; }
    .modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:1000; display:none; align-items:center; justify-content:center; }
    .modal-overlay.open { display:flex; }
    .modal { background:white; border-radius:16px; padding:2rem; max-width:600px; width:90%; max-height:90vh; overflow-y:auto; box-shadow:0 20px 60px rgba(0,0,0,0.3); }
    .score-bar { height:8px; border-radius:4px; background:#e5e7eb; overflow:hidden; }
    .score-fill { height:100%; border-radius:4px; background:linear-gradient(90deg,var(--cpc-blue),var(--cpc-gold)); transition:width 0.8s ease; }
    .progress-step { display:flex; align-items:center; flex:1; }
    .progress-step:last-child { flex:0; }
    .step-circle { width:36px; height:36px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:0.85rem; flex-shrink:0; }
    .step-line { flex:1; height:3px; }
    .step-done .step-circle { background:var(--cpc-gold); color:var(--cpc-navy); }
    .step-active .step-circle { background:var(--cpc-blue); color:white; box-shadow:0 0 0 4px rgba(15,52,96,0.2); }
    .step-pending .step-circle { background:#e5e7eb; color:#9ca3af; }
    .step-done .step-line { background:var(--cpc-gold); }
    .step-active .step-line, .step-pending .step-line { background:#e5e7eb; }
    input, textarea, select { border:1.5px solid #d1d5db; border-radius:8px; padding:0.5rem 0.75rem; width:100%; font-size:0.9rem; outline:none; transition:border-color 0.2s; box-sizing:border-box; }
    input:focus, textarea:focus, select:focus { border-color:var(--cpc-gold); box-shadow:0 0 0 3px rgba(201,168,76,0.15); }
    label { font-weight:600; color:#374151; font-size:0.85rem; display:block; margin-bottom:0.25rem; }
    .tag { display:inline-block; background:#e0f2fe; color:#0369a1; padding:0.15rem 0.5rem; border-radius:12px; font-size:0.75rem; margin:0.1rem; }
    .rfp-preview { font-family:'Georgia',serif; line-height:1.8; color:#1a1a1a; }
    .rfp-preview h1 { color:var(--cpc-navy); border-bottom:3px solid var(--cpc-gold); padding-bottom:0.5rem; }
    .rfp-preview h2 { color:var(--cpc-blue); margin-top:1.5rem; }
    .rfp-preview .section { margin:1.5rem 0; padding:1rem; background:#f8f6f0; border-left:4px solid var(--cpc-gold); border-radius:0 8px 8px 0; }
    .space-y-4 > * + * { margin-top:1rem; }
    .space-y-6 > * + * { margin-top:1.5rem; }
    #pageContent { flex:1; padding:1.5rem; }
  </style>
</head>
<body>
<div style="display:flex">
  <!-- Sidebar -->
  <aside class="cpc-sidebar" style="width:256px;flex-shrink:0;display:flex;flex-direction:column">
    <div style="padding:1.25rem;border-bottom:1px solid rgba(255,255,255,0.1)">
      <div style="display:flex;align-items:center;gap:0.75rem">
        <div style="width:40px;height:40px;border-radius:8px;background:var(--cpc-gold);display:flex;align-items:center;justify-content:center">
          <i class="fas fa-crown" style="color:var(--cpc-navy);font-size:0.875rem"></i>
        </div>
        <div>
          <div style="color:white;font-weight:700;font-size:0.875rem;line-height:1.2">Crown Prince's Court</div>
          <div style="color:var(--cpc-gold);font-size:0.75rem">AI RFP Management</div>
        </div>
      </div>
    </div>
    <nav style="flex:1;padding:0.75rem;margin-top:0.5rem" id="mainNav">
      <a href="#" class="nav-item active" data-page="dashboard"><i class="fas fa-home" style="width:16px"></i><span>Dashboard</span></a>
      <a href="#" class="nav-item" data-page="rfp"><i class="fas fa-file-contract" style="width:16px"></i><span>RFP Generation</span></a>
      <a href="#" class="nav-item" data-page="vendors"><i class="fas fa-building" style="width:16px"></i><span>Vendor Shortlisting</span></a>
      <a href="#" class="nav-item" data-page="emails"><i class="fas fa-envelope" style="width:16px"></i><span>Email Invitations</span></a>
      <a href="#" class="nav-item" data-page="qa"><i class="fas fa-comments" style="width:16px"></i><span>Q&amp;A Management</span></a>
      <a href="#" class="nav-item" data-page="proposals"><i class="fas fa-inbox" style="width:16px"></i><span>Proposals</span></a>
      <a href="#" class="nav-item" data-page="evaluation"><i class="fas fa-star-half-alt" style="width:16px"></i><span>AI Evaluation</span></a>
      <a href="#" class="nav-item" data-page="recommendation"><i class="fas fa-trophy" style="width:16px"></i><span>Recommendation</span></a>
    </nav>
    <div style="padding:1rem;border-top:1px solid rgba(255,255,255,0.1)">
      <div style="display:flex;align-items:center;gap:0.75rem">
        <div style="width:32px;height:32px;border-radius:50%;background:var(--cpc-gold);display:flex;align-items:center;justify-content:center;font-size:0.75rem;font-weight:700;color:var(--cpc-navy)">PM</div>
        <div>
          <div style="color:white;font-size:0.875rem;font-weight:500">Procurement Manager</div>
          <div style="color:#9ca3af;font-size:0.75rem">CPC - Abu Dhabi</div>
        </div>
      </div>
    </div>
  </aside>

  <!-- Main content -->
  <main style="flex:1;display:flex;flex-direction:column;min-height:100vh">
    <header class="cpc-header" style="color:white;padding:1rem 1.5rem;display:flex;align-items:center;justify-content:space-between;box-shadow:0 2px 8px rgba(0,0,0,0.2)">
      <div>
        <h1 style="font-size:1.125rem;font-weight:700;margin:0" id="pageTitle">Dashboard</h1>
        <p style="color:#bfdbfe;font-size:0.75rem;margin:0" id="pageSubtitle">AI-Powered Procurement Management</p>
      </div>
      <div style="display:flex;align-items:center;gap:1rem">
        <div style="font-size:0.875rem;color:#bfdbfe" id="headerDate"></div>
      </div>
    </header>

    <div id="pageContent" style="flex:1;padding:1.5rem">
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
