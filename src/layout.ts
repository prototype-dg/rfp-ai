export function getLayout(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CPC AI-Powered RFP Tool</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
  <style>
    :root {
      --cpc-navy: #1a1a2e;
      --cpc-blue: #0f3460;
      --cpc-gold: #c9a84c;
      --cpc-gold-light: #e8c96e;
      --cpc-light: #f8f6f0;
    }
    body { font-family: 'Segoe UI', system-ui, sans-serif; background: var(--cpc-light); }
    .cpc-sidebar { background: var(--cpc-navy); min-height: 100vh; }
    .cpc-header { background: var(--cpc-blue); }
    .cpc-gold { color: var(--cpc-gold); }
    .cpc-gold-bg { background: var(--cpc-gold); }
    .cpc-navy-bg { background: var(--cpc-navy); }
    .cpc-blue-bg { background: var(--cpc-blue); }
    .nav-item { transition: all 0.2s; border-left: 3px solid transparent; }
    .nav-item:hover, .nav-item.active { background: rgba(201,168,76,0.15); border-left-color: var(--cpc-gold); color: var(--cpc-gold); }
    .card { background: white; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
    .btn-primary { background: var(--cpc-gold); color: var(--cpc-navy); font-weight: 600; border-radius: 8px; padding: 0.5rem 1.25rem; transition: all 0.2s; cursor: pointer; border: none; }
    .btn-primary:hover { background: var(--cpc-gold-light); transform: translateY(-1px); }
    .btn-secondary { background: var(--cpc-blue); color: white; font-weight: 600; border-radius: 8px; padding: 0.5rem 1.25rem; transition: all 0.2s; cursor: pointer; border: none; }
    .btn-secondary:hover { background: var(--cpc-navy); }
    .btn-danger { background: #dc3545; color: white; font-weight: 600; border-radius: 8px; padding: 0.5rem 1.25rem; cursor: pointer; border: none; }
    .stage-badge { padding: 0.25rem 0.75rem; border-radius: 20px; font-size: 0.75rem; font-weight: 600; }
    .stage-draft { background: #e3e8f0; color: #475569; }
    .stage-published { background: #dbeafe; color: #1d4ed8; }
    .stage-evaluation { background: #fef3c7; color: #92400e; }
    .stage-awarded { background: #d1fae5; color: #065f46; }
    .spinner { border: 3px solid #f3f3f3; border-top: 3px solid var(--cpc-gold); border-radius: 50%; width: 20px; height: 20px; animation: spin 0.8s linear infinite; display: inline-block; }
    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    .toast { position: fixed; top: 1rem; right: 1rem; z-index: 9999; padding: 0.875rem 1.25rem; border-radius: 10px; color: white; font-weight: 500; opacity: 0; transition: opacity 0.3s; box-shadow: 0 4px 12px rgba(0,0,0,0.2); }
    .toast.show { opacity: 1; }
    .toast.success { background: #065f46; }
    .toast.error { background: #991b1b; }
    .toast.info { background: var(--cpc-blue); }
    table { width: 100%; border-collapse: collapse; }
    th { background: var(--cpc-blue); color: white; padding: 0.75rem 1rem; text-align: left; font-weight: 600; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.05em; }
    th:first-child { border-radius: 8px 0 0 0; }
    th:last-child { border-radius: 0 8px 0 0; }
    td { padding: 0.75rem 1rem; border-bottom: 1px solid #e5e7eb; }
    tr:hover td { background: #f9fafb; }
    .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 1000; display: none; align-items: center; justify-content: center; }
    .modal-overlay.open { display: flex; }
    .modal { background: white; border-radius: 16px; padding: 2rem; max-width: 600px; width: 90%; max-height: 90vh; overflow-y: auto; box-shadow: 0 20px 60px rgba(0,0,0,0.3); }
    .score-bar { height: 8px; border-radius: 4px; background: #e5e7eb; overflow: hidden; }
    .score-fill { height: 100%; border-radius: 4px; background: linear-gradient(90deg, var(--cpc-blue), var(--cpc-gold)); transition: width 0.8s ease; }
    .progress-step { display: flex; align-items: center; flex: 1; }
    .progress-step:last-child { flex: 0; }
    .step-circle { width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.85rem; flex-shrink: 0; }
    .step-line { flex: 1; height: 3px; }
    .step-done .step-circle { background: var(--cpc-gold); color: var(--cpc-navy); }
    .step-active .step-circle { background: var(--cpc-blue); color: white; box-shadow: 0 0 0 4px rgba(15,52,96,0.2); }
    .step-pending .step-circle { background: #e5e7eb; color: #9ca3af; }
    .step-done .step-line { background: var(--cpc-gold); }
    .step-active .step-line, .step-pending .step-line { background: #e5e7eb; }
    input, textarea, select { border: 1.5px solid #d1d5db; border-radius: 8px; padding: 0.5rem 0.75rem; width: 100%; font-size: 0.9rem; outline: none; transition: border-color 0.2s; }
    input:focus, textarea:focus, select:focus { border-color: var(--cpc-gold); box-shadow: 0 0 0 3px rgba(201,168,76,0.15); }
    label { font-weight: 600; color: #374151; font-size: 0.85rem; display: block; margin-bottom: 0.25rem; }
    .ai-thinking { display: flex; align-items: center; gap: 0.5rem; color: var(--cpc-blue); font-style: italic; }
    .pulse { animation: pulse 1.5s infinite; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
    .vendor-card { cursor: pointer; transition: all 0.2s; }
    .vendor-card:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,0.12); }
    .vendor-card.selected { border: 2px solid var(--cpc-gold); }
    .tag { display: inline-block; background: #e0f2fe; color: #0369a1; padding: 0.15rem 0.5rem; border-radius: 12px; font-size: 0.75rem; margin: 0.1rem; }
    .rfp-preview { font-family: 'Georgia', serif; line-height: 1.8; color: #1a1a1a; }
    .rfp-preview h1 { color: var(--cpc-navy); border-bottom: 3px solid var(--cpc-gold); padding-bottom: 0.5rem; }
    .rfp-preview h2 { color: var(--cpc-blue); margin-top: 1.5rem; }
    .rfp-preview .section { margin: 1.5rem 0; padding: 1rem; background: #f8f6f0; border-left: 4px solid var(--cpc-gold); border-radius: 0 8px 8px 0; }
  </style>
</head>
<body>
<div id="app" class="flex">
  <!-- Sidebar -->
  <aside class="cpc-sidebar w-64 flex-shrink-0 flex flex-col" id="sidebar">
    <div class="p-5 border-b border-white/10">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-lg cpc-gold-bg flex items-center justify-center">
          <i class="fas fa-crown text-sm" style="color: var(--cpc-navy)"></i>
        </div>
        <div>
          <div class="text-white font-bold text-sm leading-tight">Crown Prince's Court</div>
          <div class="cpc-gold text-xs">AI RFP Management</div>
        </div>
      </div>
    </div>
    <nav class="flex-1 p-3 space-y-1 mt-2" id="mainNav">
      <a href="#" class="nav-item flex items-center gap-3 px-4 py-3 rounded-lg text-gray-300 text-sm font-medium active" data-page="dashboard">
        <i class="fas fa-home w-4"></i><span>Dashboard</span>
      </a>
      <a href="#" class="nav-item flex items-center gap-3 px-4 py-3 rounded-lg text-gray-300 text-sm font-medium" data-page="rfp">
        <i class="fas fa-file-contract w-4"></i><span>RFP Generation</span>
      </a>
      <a href="#" class="nav-item flex items-center gap-3 px-4 py-3 rounded-lg text-gray-300 text-sm font-medium" data-page="vendors">
        <i class="fas fa-building w-4"></i><span>Vendor Shortlisting</span>
      </a>
      <a href="#" class="nav-item flex items-center gap-3 px-4 py-3 rounded-lg text-gray-300 text-sm font-medium" data-page="emails">
        <i class="fas fa-envelope w-4"></i><span>Email Invitations</span>
      </a>
      <a href="#" class="nav-item flex items-center gap-3 px-4 py-3 rounded-lg text-gray-300 text-sm font-medium" data-page="qa">
        <i class="fas fa-comments w-4"></i><span>Q&A Management</span>
      </a>
      <a href="#" class="nav-item flex items-center gap-3 px-4 py-3 rounded-lg text-gray-300 text-sm font-medium" data-page="proposals">
        <i class="fas fa-inbox w-4"></i><span>Proposals</span>
      </a>
      <a href="#" class="nav-item flex items-center gap-3 px-4 py-3 rounded-lg text-gray-300 text-sm font-medium" data-page="evaluation">
        <i class="fas fa-star-half-alt w-4"></i><span>AI Evaluation</span>
      </a>
      <a href="#" class="nav-item flex items-center gap-3 px-4 py-3 rounded-lg text-gray-300 text-sm font-medium" data-page="recommendation">
        <i class="fas fa-trophy w-4"></i><span>Recommendation</span>
      </a>
    </nav>
    <div class="p-4 border-t border-white/10">
      <div class="flex items-center gap-3">
        <div class="w-8 h-8 rounded-full cpc-gold-bg flex items-center justify-center text-xs font-bold" style="color: var(--cpc-navy)">PM</div>
        <div>
          <div class="text-white text-sm font-medium">Procurement Manager</div>
          <div class="text-gray-400 text-xs">CPC - Abu Dhabi</div>
        </div>
      </div>
    </div>
  </aside>

  <!-- Main content -->
  <main class="flex-1 flex flex-col min-h-screen">
    <!-- Top header -->
    <header class="cpc-header text-white px-6 py-4 flex items-center justify-between shadow-lg">
      <div>
        <h1 class="text-lg font-bold" id="pageTitle">Dashboard</h1>
        <p class="text-blue-200 text-xs" id="pageSubtitle">AI-Powered Procurement Management</p>
      </div>
      <div class="flex items-center gap-4">
        <div id="rfpStageBadge" class="stage-badge stage-draft hidden">Draft</div>
        <div class="text-sm text-blue-200" id="headerDate"></div>
      </div>
    </header>

    <!-- Page content -->
    <div class="flex-1 p-6" id="pageContent">
      <div class="flex items-center justify-center h-40">
        <div class="spinner"></div>
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

<script>
// ============================================================
// CPC RFP TOOL - Main Application
// ============================================================
const API = '/api';
let currentPage = 'dashboard';
let appState = {
  rfp: null,
  vendors: [],
  questions: [],
  proposals: [],
  evaluations: [],
  emails: []
};

// ============================================================
// Utilities
// ============================================================
function showToast(msg, type='info') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show ' + type;
  setTimeout(() => t.className = 'toast', 3500);
}

function showModal(html) {
  document.getElementById('modalContent').innerHTML = html;
  document.getElementById('modalOverlay').classList.add('open');
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
}

document.getElementById('modalOverlay').addEventListener('click', (e) => {
  if (e.target.id === 'modalOverlay') closeModal();
});

document.getElementById('headerDate').textContent = new Date().toLocaleDateString('en-AE', { weekday:'long', year:'numeric', month:'long', day:'numeric' });

async function api(method, path, data) {
  try {
    const opts = { method, headers: {'Content-Type':'application/json'} };
    if (data) opts.body = JSON.stringify(data);
    const r = await fetch(API + path, opts);
    const json = await r.json();
    if (!r.ok) throw new Error(json.error || json.message || 'Request failed');
    return json;
  } catch(e) {
    showToast(e.message, 'error');
    throw e;
  }
}

function setLoading(el, loading, text='') {
  if (loading) {
    el.disabled = true;
    el.dataset.originalText = el.textContent;
    el.innerHTML = '<span class="spinner mr-2"></span>' + (text || 'Processing...');
  } else {
    el.disabled = false;
    el.innerHTML = el.dataset.originalText || text;
  }
}

// ============================================================
// Navigation
// ============================================================
const pageTitles = {
  dashboard: ['Dashboard', 'AI-Powered Procurement Overview'],
  rfp: ['RFP Generation', 'Generate & Manage Request for Proposal'],
  vendors: ['Vendor Shortlisting', 'Select & Manage Qualified Vendors'],
  emails: ['Email Invitations', 'Track All Correspondence'],
  qa: ['Q&A Management', 'Vendor Questions & AI-Drafted Answers'],
  proposals: ['Proposal Submissions', 'Review Vendor Proposals'],
  evaluation: ['AI Evaluation', 'Automated Scoring & Analysis'],
  recommendation: ['Award Recommendation', 'Final Decision & Contract Award'],
};

document.getElementById('mainNav').addEventListener('click', (e) => {
  const link = e.target.closest('[data-page]');
  if (!link) return;
  e.preventDefault();
  navigateTo(link.dataset.page);
});

function navigateTo(page) {
  currentPage = page;
  document.querySelectorAll('[data-page]').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });
  const [title, sub] = pageTitles[page] || [page, ''];
  document.getElementById('pageTitle').textContent = title;
  document.getElementById('pageSubtitle').textContent = sub;
  document.getElementById('pageContent').innerHTML = '<div class="flex items-center justify-center h-40"><div class="spinner"></div></div>';
  pages[page]();
}

// ============================================================
// INIT
// ============================================================
async function init() {
  await api('POST', '/init', {});
  navigateTo('dashboard');
}

// ============================================================
// PAGE: DASHBOARD
// ============================================================
const pages = {
  async dashboard() {
    const [stats, rfp] = await Promise.all([
      api('GET', '/stats'),
      api('GET', '/rfp').catch(() => null)
    ]);
    appState.rfp = rfp;

    const stage = rfp?.stage || 'draft';
    const stages = ['draft','published','qa_open','submissions_closed','evaluation','awarded'];
    const stageIdx = stages.indexOf(stage);
    const stageLabels = ['Draft','Published','Q&A Open','Submissions Closed','Evaluation','Awarded'];

    document.getElementById('pageContent').innerHTML = \`
      <div class="space-y-6">
        <!-- Stage Progress -->
        <div class="card p-6">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-lg font-bold text-gray-800"><i class="fas fa-route mr-2 cpc-gold"></i>Procurement Stage</h2>
            \${rfp ? \`<span class="stage-badge stage-\${stage === 'awarded' ? 'awarded' : stage === 'evaluation' ? 'evaluation' : stage === 'draft' ? 'draft' : 'published'}">\${stageLabels[stageIdx] || stage}</span>\` : '<span class="text-gray-400 text-sm">No active RFP</span>'}
          </div>
          <div class="flex items-center">
            \${stageLabels.map((label, i) => \`
              <div class="progress-step \${i < stageIdx ? 'step-done' : i === stageIdx ? 'step-active' : 'step-pending'}">
                <div class="flex flex-col items-center">
                  <div class="step-circle">\${i < stageIdx ? '<i class="fas fa-check text-xs"></i>' : i+1}</div>
                  <div class="text-xs mt-1 text-center w-16 \${i === stageIdx ? 'font-semibold text-gray-800' : 'text-gray-500'}">\${label}</div>
                </div>
                \${i < stageLabels.length - 1 ? '<div class="step-line mx-1 mb-4"></div>' : ''}
              </div>
            \`).join('')}
          </div>
          \${rfp ? \`
          <div class="mt-4 pt-4 border-t flex gap-3">
            \${stage === 'draft' ? '<button class="btn-primary" onclick="advanceStage(\'published\')"><i class="fas fa-paper-plane mr-2"></i>Publish RFP</button>' : ''}
            \${stage === 'published' ? '<button class="btn-primary" onclick="advanceStage(\'qa_open\')"><i class="fas fa-comments mr-2"></i>Open Q&A</button>' : ''}
            \${stage === 'qa_open' ? '<button class="btn-primary" onclick="advanceStage(\'submissions_closed\')"><i class="fas fa-lock mr-2"></i>Close Submissions</button>' : ''}
            \${stage === 'submissions_closed' ? '<button class="btn-primary" onclick="advanceStage(\'evaluation\')"><i class="fas fa-star mr-2"></i>Start Evaluation</button>' : ''}
            \${stage === 'evaluation' ? '<button class="btn-primary" onclick="navigateTo(\'evaluation\')"><i class="fas fa-robot mr-2"></i>Run AI Evaluation</button>' : ''}
          </div>\` : ''}
        </div>

        <!-- Stats Cards -->
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
          \${[
            {icon:'fa-building', label:'Total Vendors', value:stats.vendors||0, color:'#0f3460'},
            {icon:'fa-check-circle', label:'Shortlisted', value:stats.shortlisted||0, color:'#c9a84c'},
            {icon:'fa-inbox', label:'Proposals', value:stats.proposals||0, color:'#065f46'},
            {icon:'fa-envelope', label:'Emails Sent', value:stats.emails||0, color:'#7c3aed'},
          ].map(s => \`
            <div class="card p-5">
              <div class="flex items-center justify-between mb-2">
                <div class="w-10 h-10 rounded-lg flex items-center justify-center" style="background:\${s.color}20">
                  <i class="fas \${s.icon}" style="color:\${s.color}"></i>
                </div>
                <span class="text-3xl font-bold" style="color:\${s.color}">\${s.value}</span>
              </div>
              <div class="text-sm text-gray-500 font-medium">\${s.label}</div>
            </div>
          \`).join('')}
        </div>

        <!-- Quick Actions -->
        <div class="card p-6">
          <h2 class="text-lg font-bold text-gray-800 mb-4"><i class="fas fa-bolt mr-2 cpc-gold"></i>Quick Actions</h2>
          <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
            \${[
              {icon:'fa-file-contract', label:'Generate RFP', page:'rfp'},
              {icon:'fa-building', label:'Shortlist Vendors', page:'vendors'},
              {icon:'fa-comments', label:'Manage Q&A', page:'qa'},
              {icon:'fa-star-half-alt', label:'Run Evaluation', page:'evaluation'},
            ].map(a => \`
              <button class="btn-secondary py-4 flex flex-col items-center gap-2 text-sm" onclick="navigateTo('\${a.page}')">
                <i class="fas \${a.icon} text-xl" style="color:var(--cpc-gold)"></i>
                <span>\${a.label}</span>
              </button>
            \`).join('')}
          </div>
        </div>

        <!-- Active RFP Info -->
        \${rfp ? \`
        <div class="card p-6">
          <h2 class="text-lg font-bold text-gray-800 mb-4"><i class="fas fa-file-contract mr-2 cpc-gold"></i>Active RFP</h2>
          <div class="grid grid-cols-2 gap-4">
            <div><label>Title</label><p class="font-medium">\${rfp.title}</p></div>
            <div><label>Category</label><p class="font-medium">\${rfp.category||'-'}</p></div>
            <div><label>Budget</label><p class="font-medium">\${rfp.budget||'TBD'}</p></div>
            <div><label>Deadline</label><p class="font-medium">\${rfp.deadline ? new Date(rfp.deadline).toLocaleDateString() : 'TBD'}</p></div>
          </div>
        </div>\` : \`
        <div class="card p-10 text-center">
          <i class="fas fa-file-circle-plus text-5xl text-gray-200 mb-4"></i>
          <p class="text-gray-500 mb-4">No active RFP. Start by generating one with AI.</p>
          <button class="btn-primary" onclick="navigateTo('rfp')"><i class="fas fa-magic mr-2"></i>Generate RFP with AI</button>
        </div>\`}
      </div>
    \`;
  },

  // ============================================================
  // PAGE: RFP GENERATION
  // ============================================================
  async rfp() {
    const rfp = await api('GET', '/rfp').catch(() => null);
    appState.rfp = rfp;

    document.getElementById('pageContent').innerHTML = \`
      <div class="grid grid-cols-2 gap-6">
        <!-- Input Form -->
        <div class="card p-6">
          <h2 class="text-lg font-bold text-gray-800 mb-4"><i class="fas fa-magic mr-2 cpc-gold"></i>AI RFP Generator</h2>
          <div class="space-y-4">
            <div>
              <label>Project Title *</label>
              <input id="rfpTitle" placeholder="e.g. ERP System Implementation for CPC" value="\${rfp?.title||'Enterprise Resource Planning (ERP) System Implementation'}">
            </div>
            <div>
              <label>Category</label>
              <select id="rfpCategory">
                <option value="IT & Digital Transformation" \${rfp?.category==='IT & Digital Transformation'?'selected':''}>IT & Digital Transformation</option>
                <option value="Consulting Services">Consulting Services</option>
                <option value="Infrastructure">Infrastructure</option>
                <option value="Professional Services">Professional Services</option>
              </select>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label>Budget (AED)</label>
                <input id="rfpBudget" placeholder="e.g. 5,000,000" value="\${rfp?.budget||''}">
              </div>
              <div>
                <label>Submission Deadline</label>
                <input type="date" id="rfpDeadline" value="\${rfp?.deadline||''}">
              </div>
            </div>
            <div>
              <label>Scope of Work</label>
              <textarea id="rfpScope" rows="4" placeholder="Describe the project scope...">\${rfp?.scope||'Implementation of a comprehensive ERP system covering HR, Finance, Procurement, and Operations modules for the Crown Prince Court of Abu Dhabi. The system must integrate with existing government portals and comply with UAE data residency requirements.'}</textarea>
            </div>
            <div>
              <label>Technical Requirements</label>
              <textarea id="rfpTech" rows="3" placeholder="Cloud/on-premise, integrations, security...">\${rfp?.tech_requirements||'Cloud-based SaaS deployment, Arabic language support, UAE Pass integration, ISO 27001 certified infrastructure, 99.9% SLA uptime'}</textarea>
            </div>
            <div class="flex gap-3 pt-2">
              <button class="btn-primary flex-1" id="generateBtn" onclick="generateRFP()">
                <i class="fas fa-robot mr-2"></i>Generate with AI
              </button>
              <button class="btn-secondary" onclick="saveRFP()">
                <i class="fas fa-save mr-2"></i>Save
              </button>
            </div>
          </div>
        </div>

        <!-- RFP Preview -->
        <div class="card p-6">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-lg font-bold text-gray-800"><i class="fas fa-eye mr-2 cpc-gold"></i>RFP Preview</h2>
            \${rfp?.content ? '<button class="btn-primary text-sm" onclick="navigateTo(\'vendors\')"><i class="fas fa-arrow-right mr-1"></i>Next: Vendors</button>' : ''}
          </div>
          <div id="rfpPreview" class="rfp-preview text-sm max-h-96 overflow-y-auto">
            \${rfp?.content ? rfp.content : \`
              <div class="text-center text-gray-400 py-10">
                <i class="fas fa-file-alt text-4xl mb-3"></i>
                <p>Click "Generate with AI" to create your RFP document</p>
              </div>
            \`}
          </div>
        </div>
      </div>
    \`;
  },

  // ============================================================
  // PAGE: VENDORS
  // ============================================================
  async vendors() {
    const vendors = await api('GET', '/vendors');
    appState.vendors = vendors;

    document.getElementById('pageContent').innerHTML = \`
      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <div>
            <h2 class="text-lg font-bold text-gray-800">Vendor Database</h2>
            <p class="text-sm text-gray-500">\${vendors.length} vendors loaded from CPO ERP Scope of Work</p>
          </div>
          <div class="flex gap-3">
            <button class="btn-secondary" onclick="aiShortlist()"><i class="fas fa-robot mr-2"></i>AI Shortlist</button>
            <button class="btn-primary" onclick="sendInvitations()"><i class="fas fa-paper-plane mr-2"></i>Send Invitations</button>
          </div>
        </div>
        
        <div class="grid grid-cols-1 gap-3">
          \${vendors.map(v => \`
            <div class="card p-4 vendor-card \${v.shortlisted ? 'selected' : ''}" id="vendor-\${v.id}">
              <div class="flex items-start justify-between">
                <div class="flex items-start gap-4 flex-1">
                  <div class="w-10 h-10 rounded-lg cpc-blue-bg flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                    \${v.name.charAt(0)}
                  </div>
                  <div class="flex-1">
                    <div class="flex items-center gap-2 flex-wrap">
                      <span class="font-semibold text-gray-800">\${v.name}</span>
                      \${v.shortlisted ? '<span class="stage-badge stage-published">✓ Shortlisted</span>' : ''}
                      \${v.fit_score ? \`<span class="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full font-medium">AI Score: \${v.fit_score}/100</span>\` : ''}
                    </div>
                    <div class="text-sm text-gray-500 mt-0.5">\${v.category||''} • \${v.country||'UAE'} • \${v.size||''}</div>
                    <div class="mt-1.5 flex flex-wrap gap-1">
                      \${(v.specializations||'').split(',').filter(s=>s.trim()).slice(0,4).map(s => \`<span class="tag">\${s.trim()}</span>\`).join('')}
                    </div>
                  </div>
                </div>
                <div class="flex gap-2 ml-3">
                  <button class="btn-\${v.shortlisted?'danger':'primary'} text-sm" onclick="toggleShortlist(\${v.id}, \${!v.shortlisted})">
                    \${v.shortlisted ? '<i class="fas fa-times mr-1"></i>Remove' : '<i class="fas fa-plus mr-1"></i>Add'}
                  </button>
                  <button class="btn-secondary text-sm" onclick="viewVendor(\${v.id})">
                    <i class="fas fa-eye"></i>
                  </button>
                </div>
              </div>
              \${v.fit_score ? \`
              <div class="mt-3 pt-3 border-t">
                <div class="flex justify-between text-xs text-gray-500 mb-1">
                  <span>AI Fit Score</span><span>\${v.fit_score}/100</span>
                </div>
                <div class="score-bar"><div class="score-fill" style="width:\${v.fit_score}%"></div></div>
              </div>\` : ''}
            </div>
          \`).join('')}
        </div>
      </div>
    \`;
  },

  // ============================================================
  // PAGE: EMAILS
  // ============================================================
  async emails() {
    const emails = await api('GET', '/emails');
    appState.emails = emails;

    document.getElementById('pageContent').innerHTML = \`
      <div class="card">
        <div class="p-4 border-b flex items-center justify-between">
          <h2 class="font-bold text-gray-800">Email Correspondence Log</h2>
          <span class="text-sm text-gray-500">\${emails.length} emails</span>
        </div>
        \${emails.length === 0 ? \`
        <div class="p-10 text-center text-gray-400">
          <i class="fas fa-envelope-open-text text-4xl mb-3"></i>
          <p>No emails sent yet. Go to Vendor Shortlisting to send invitations.</p>
        </div>\` : \`
        <div class="overflow-x-auto">
          <table>
            <thead><tr>
              <th>To</th><th>Subject</th><th>Type</th><th>Status</th><th>Sent At</th>
            </tr></thead>
            <tbody>
              \${emails.map(e => \`
                <tr>
                  <td class="font-medium">\${e.vendor_name||e.recipient}</td>
                  <td>\${e.subject}</td>
                  <td><span class="tag">\${e.email_type}</span></td>
                  <td>
                    \${e.status === 'sent' 
                      ? '<span class="text-green-600 font-medium"><i class="fas fa-check-circle mr-1"></i>Sent</span>'
                      : e.status === 'simulated'
                      ? '<span class="text-blue-600 font-medium"><i class="fas fa-flask mr-1"></i>Simulated</span>'
                      : '<span class="text-gray-500">'+e.status+'</span>'}
                  </td>
                  <td class="text-gray-500 text-sm">\${e.created_at ? new Date(e.created_at).toLocaleString() : '-'}</td>
                </tr>
              \`).join('')}
            </tbody>
          </table>
        </div>\`}
      </div>
    \`;
  },

  // ============================================================
  // PAGE: Q&A MANAGEMENT
  // ============================================================
  async qa() {
    const questions = await api('GET', '/questions');
    appState.questions = questions;

    const pending = questions.filter(q => !q.published && !q.answer);
    const answered = questions.filter(q => q.answer && !q.published);
    const published = questions.filter(q => q.published);

    document.getElementById('pageContent').innerHTML = \`
      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <div class="flex gap-3">
            <span class="text-sm font-medium text-gray-600">\${pending.length} pending</span>
            <span class="text-sm font-medium text-amber-600">\${answered.length} awaiting approval</span>
            <span class="text-sm font-medium text-green-600">\${published.length} published</span>
          </div>
          <div class="flex gap-3">
            <button class="btn-secondary" onclick="draftAllAnswers()"><i class="fas fa-robot mr-2"></i>AI Draft All</button>
            <button class="btn-primary" onclick="publishAllAnswers()"><i class="fas fa-paper-plane mr-2"></i>Publish All Approved</button>
          </div>
        </div>

        <div class="space-y-3" id="qaList">
          \${questions.length === 0 ? \`
          <div class="card p-10 text-center text-gray-400">
            <i class="fas fa-comments text-4xl mb-3"></i>
            <p>No questions yet. They will appear here when vendors submit them.</p>
            <button class="btn-secondary mt-4" onclick="loadSampleQuestions()">Load Sample Questions</button>
          </div>\` :
          questions.map(q => \`
            <div class="card p-5" id="q-\${q.id}">
              <div class="flex items-start justify-between gap-4">
                <div class="flex-1">
                  <div class="flex items-center gap-2 mb-2">
                    <span class="text-xs font-semibold text-gray-400">Q\${q.id} • \${q.vendor_name||'Anonymous'}</span>
                    \${q.published ? '<span class="stage-badge stage-published">Published</span>' : q.answer ? '<span class="stage-badge" style="background:#fef3c7;color:#92400e">Pending Approval</span>' : '<span class="stage-badge stage-draft">Unanswered</span>'}
                  </div>
                  <p class="font-medium text-gray-800 mb-3">\${q.question}</p>
                  \${q.answer ? \`
                    <div class="bg-amber-50 border border-amber-200 rounded-lg p-3">
                      <div class="text-xs font-semibold text-amber-700 mb-1"><i class="fas fa-robot mr-1"></i>AI Draft Answer</div>
                      <p class="text-sm text-gray-700">\${q.answer}</p>
                    </div>
                  \` : ''}
                </div>
                <div class="flex flex-col gap-2">
                  \${!q.answer ? \`<button class="btn-secondary text-sm" onclick="draftAnswer(\${q.id})"><i class="fas fa-robot mr-1"></i>AI Draft</button>\` : ''}
                  \${q.answer && !q.published ? \`
                    <button class="btn-primary text-sm" onclick="approveAnswer(\${q.id})"><i class="fas fa-check mr-1"></i>Approve</button>
                    <button class="btn-secondary text-sm" onclick="editAnswer(\${q.id})"><i class="fas fa-edit mr-1"></i>Edit</button>
                  \` : ''}
                </div>
              </div>
            </div>
          \`).join('')}
        </div>
      </div>
    \`;
  },

  // ============================================================
  // PAGE: PROPOSALS
  // ============================================================
  async proposals() {
    const proposals = await api('GET', '/proposals');
    appState.proposals = proposals;

    document.getElementById('pageContent').innerHTML = \`
      <div class="space-y-4">
        <div class="flex justify-between items-center">
          <p class="text-sm text-gray-600">\${proposals.length} proposals received</p>
          <button class="btn-primary" onclick="addSampleProposal()"><i class="fas fa-plus mr-2"></i>Add Sample Proposal</button>
        </div>
        \${proposals.length === 0 ? \`
        <div class="card p-10 text-center text-gray-400">
          <i class="fas fa-inbox text-4xl mb-3"></i>
          <p>No proposals submitted yet.</p>
          <button class="btn-secondary mt-4" onclick="addSampleProposal()">Add Sample Proposals</button>
        </div>\` : \`
        <div class="card overflow-hidden">
          <table>
            <thead><tr>
              <th>Vendor</th><th>Submitted</th><th>Tech Score</th><th>Financial</th><th>Status</th><th>Actions</th>
            </tr></thead>
            <tbody>
              \${proposals.map(p => \`
                <tr>
                  <td class="font-medium">\${p.vendor_name||'Unknown'}</td>
                  <td class="text-sm text-gray-500">\${p.created_at ? new Date(p.created_at).toLocaleDateString() : '-'}</td>
                  <td>\${p.technical_score != null ? p.technical_score+'/100' : '<span class="text-gray-400">-</span>'}</td>
                  <td>\${p.financial_proposal ? 'AED '+Number(p.financial_proposal).toLocaleString() : '<span class="text-gray-400">-</span>'}</td>
                  <td><span class="stage-badge \${p.status==='submitted'?'stage-published':'stage-draft'}">\${p.status}</span></td>
                  <td><button class="btn-secondary text-sm" onclick="viewProposal(\${p.id})"><i class="fas fa-eye mr-1"></i>View</button></td>
                </tr>
              \`).join('')}
            </tbody>
          </table>
        </div>\`}
      </div>
    \`;
  },

  // ============================================================
  // PAGE: EVALUATION
  // ============================================================
  async evaluation() {
    const [evaluations, proposals] = await Promise.all([
      api('GET', '/evaluations'),
      api('GET', '/proposals')
    ]);

    document.getElementById('pageContent').innerHTML = \`
      <div class="space-y-4">
        <div class="flex justify-between items-center">
          <p class="text-sm text-gray-600">\${evaluations.length} evaluations complete</p>
          <div class="flex gap-3">
            <button class="btn-secondary" id="runEvalBtn" onclick="runEvaluation()"><i class="fas fa-robot mr-2"></i>Run AI Evaluation</button>
            <button class="btn-primary" onclick="navigateTo('recommendation')"><i class="fas fa-trophy mr-2"></i>View Recommendation</button>
          </div>
        </div>

        \${evaluations.length === 0 ? \`
        <div class="card p-10 text-center text-gray-400">
          <i class="fas fa-star-half-alt text-4xl mb-3"></i>
          <p class="mb-4">No evaluations yet. Run AI evaluation to score all proposals.</p>
          <button class="btn-primary" onclick="runEvaluation()"><i class="fas fa-robot mr-2"></i>Run AI Evaluation</button>
        </div>\` : \`
        <div class="grid gap-4">
          \${evaluations.map(e => \`
            <div class="card p-5">
              <div class="flex items-start justify-between mb-4">
                <div>
                  <h3 class="font-semibold text-gray-800">\${e.vendor_name||'Vendor'}</h3>
                  <p class="text-sm text-gray-500">\${e.proposal_id ? 'Proposal #'+e.proposal_id : ''}</p>
                </div>
                <div class="text-right">
                  <div class="text-2xl font-bold" style="color:var(--cpc-gold)">\${e.total_score||0}</div>
                  <div class="text-xs text-gray-500">Total Score / 100</div>
                </div>
              </div>
              <div class="grid grid-cols-3 gap-4 mb-3">
                \${[
                  {label:'Technical', val:e.technical_score},
                  {label:'Financial', val:e.financial_score},
                  {label:'Experience', val:e.experience_score},
                ].map(s => \`
                  <div>
                    <div class="flex justify-between text-xs text-gray-500 mb-1">
                      <span>\${s.label}</span><span>\${s.val||0}/100</span>
                    </div>
                    <div class="score-bar"><div class="score-fill" style="width:\${s.val||0}%"></div></div>
                  </div>
                \`).join('')}
              </div>
              \${e.ai_summary ? \`<p class="text-xs text-gray-600 bg-gray-50 rounded p-3">\${e.ai_summary}</p>\` : ''}
            </div>
          \`).join('')}
        </div>\`}
      </div>
    \`;
  },

  // ============================================================
  // PAGE: RECOMMENDATION
  // ============================================================
  async recommendation() {
    const rec = await api('GET', '/recommendation').catch(() => null);

    document.getElementById('pageContent').innerHTML = \`
      <div class="space-y-4">
        \${!rec ? \`
        <div class="card p-10 text-center text-gray-400">
          <i class="fas fa-trophy text-4xl mb-3"></i>
          <p class="mb-4">No recommendation yet. Complete the evaluation first.</p>
          <button class="btn-primary" onclick="generateRecommendation()"><i class="fas fa-robot mr-2"></i>Generate AI Recommendation</button>
        </div>\` : \`
        <div class="grid grid-cols-3 gap-4">
          \${(rec.rankings||[]).map((r, i) => \`
            <div class="card p-5 \${i===0 ? 'border-2' : ''}" style="\${i===0 ? 'border-color:var(--cpc-gold)' : ''}">
              <div class="flex items-center gap-3 mb-3">
                <div class="w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg
                  \${i===0 ? 'cpc-gold-bg' : i===1 ? 'bg-gray-200' : 'bg-amber-100'}"
                  style="\${i===0?'color:var(--cpc-navy)':''}">
                  \${i===0 ? '🥇' : i===1 ? '🥈' : '🥉'}
                </div>
                <div>
                  <div class="font-bold \${i===0?'text-gray-800':'text-gray-700'}">\${r.vendor_name}</div>
                  <div class="text-xs text-gray-500">Rank #\${i+1}</div>
                </div>
              </div>
              <div class="text-3xl font-bold mb-1" style="color:var(--cpc-gold)">\${r.total_score}</div>
              <div class="text-xs text-gray-500 mb-2">Total Score / 100</div>
              \${i===0 ? '<span class="stage-badge stage-awarded">Recommended</span>' : ''}
            </div>
          \`).join('')}
        </div>

        <div class="card p-6">
          <h2 class="text-lg font-bold text-gray-800 mb-3"><i class="fas fa-robot mr-2 cpc-gold"></i>AI Recommendation Summary</h2>
          <div class="bg-amber-50 border border-amber-200 rounded-lg p-4 text-gray-700 leading-relaxed">
            \${rec.summary||''}
          </div>
          <div class="mt-4 flex gap-3">
            <button class="btn-primary" onclick="awardContract()">
              <i class="fas fa-handshake mr-2"></i>Award Contract
            </button>
            <button class="btn-secondary" onclick="generateRecommendation()">
              <i class="fas fa-refresh mr-2"></i>Regenerate
            </button>
          </div>
        </div>\`}
      </div>
    \`;
  }
};

// ============================================================
// ACTION HANDLERS
// ============================================================
async function generateRFP() {
  const btn = document.getElementById('generateBtn');
  setLoading(btn, true, 'Generating...');
  try {
    const data = {
      title: document.getElementById('rfpTitle').value,
      category: document.getElementById('rfpCategory').value,
      budget: document.getElementById('rfpBudget').value,
      deadline: document.getElementById('rfpDeadline').value,
      scope: document.getElementById('rfpScope').value,
      tech_requirements: document.getElementById('rfpTech').value
    };
    const result = await api('POST', '/rfp/generate', data);
    document.getElementById('rfpPreview').innerHTML = result.content;
    appState.rfp = result;
    showToast('RFP generated successfully!', 'success');
  } catch(e) {
    console.error(e);
  } finally {
    setLoading(btn, false, '<i class="fas fa-robot mr-2"></i>Generate with AI');
  }
}

async function saveRFP() {
  const data = {
    title: document.getElementById('rfpTitle').value,
    category: document.getElementById('rfpCategory').value,
    budget: document.getElementById('rfpBudget').value,
    deadline: document.getElementById('rfpDeadline').value,
    scope: document.getElementById('rfpScope').value,
    tech_requirements: document.getElementById('rfpTech').value
  };
  await api('POST', '/rfp', data);
  showToast('RFP saved successfully!', 'success');
}

async function advanceStage(stage) {
  await api('POST', '/rfp/stage', { stage });
  showToast('Stage advanced to: ' + stage.replace('_', ' '), 'success');
  navigateTo('dashboard');
}

async function toggleShortlist(vendorId, shortlist) {
  await api('PUT', '/vendors/' + vendorId + '/shortlist', { shortlisted: shortlist });
  showToast(shortlist ? 'Vendor shortlisted!' : 'Vendor removed from shortlist', 'success');
  navigateTo('vendors');
}

async function aiShortlist() {
  showToast('Running AI shortlisting analysis...', 'info');
  await api('POST', '/vendors/ai-shortlist', {});
  showToast('AI shortlisting complete!', 'success');
  navigateTo('vendors');
}

async function sendInvitations() {
  const shortlisted = appState.vendors.filter(v => v.shortlisted);
  if (shortlisted.length === 0) {
    showToast('Please shortlist vendors first', 'error');
    return;
  }
  await api('POST', '/emails/send-invitations', {});
  showToast(\`Invitations sent to \${shortlisted.length} vendors!\`, 'success');
  navigateTo('emails');
}

async function draftAnswer(qId) {
  const el = document.getElementById('q-' + qId);
  if (el) {
    const btn = el.querySelector('button');
    if (btn) setLoading(btn, true, 'Drafting...');
  }
  try {
    await api('POST', '/questions/' + qId + '/draft', {});
    showToast('AI answer drafted!', 'success');
    navigateTo('qa');
  } catch(e) {}
}

async function draftAllAnswers() {
  showToast('AI drafting all answers...', 'info');
  await api('POST', '/questions/draft-all', {});
  showToast('All answers drafted!', 'success');
  navigateTo('qa');
}

async function approveAnswer(qId) {
  await api('PUT', '/questions/' + qId + '/approve', {});
  showToast('Answer approved and published!', 'success');
  navigateTo('qa');
}

async function editAnswer(qId) {
  const q = appState.questions.find(q => q.id === qId);
  if (!q) return;
  showModal(\`
    <h3 class="text-lg font-bold mb-4">Edit Answer for Q\${qId}</h3>
    <p class="text-gray-600 mb-3">\${q.question}</p>
    <label>Answer</label>
    <textarea id="editAnswerText" rows="6" class="mb-4">\${q.answer||''}</textarea>
    <div class="flex gap-3">
      <button class="btn-primary" onclick="saveAnswer(\${qId})">Save & Approve</button>
      <button class="btn-secondary" onclick="closeModal()">Cancel</button>
    </div>
  \`);
}

async function saveAnswer(qId) {
  const text = document.getElementById('editAnswerText').value;
  await api('PUT', '/questions/' + qId + '/answer', { answer: text });
  showToast('Answer saved!', 'success');
  closeModal();
  navigateTo('qa');
}

async function publishAllAnswers() {
  await api('POST', '/questions/publish-all', {});
  showToast('All approved answers published!', 'success');
  navigateTo('qa');
}

async function loadSampleQuestions() {
  await api('POST', '/questions/load-samples', {});
  showToast('Sample questions loaded!', 'success');
  navigateTo('qa');
}

async function runEvaluation() {
  const btn = document.getElementById('runEvalBtn');
  if (btn) setLoading(btn, true, 'Running AI Evaluation...');
  try {
    await api('POST', '/evaluations/run', {});
    showToast('AI evaluation complete!', 'success');
    navigateTo('evaluation');
  } catch(e) {
    if (btn) setLoading(btn, false, '<i class="fas fa-robot mr-2"></i>Run AI Evaluation');
  }
}

async function generateRecommendation() {
  showToast('Generating AI recommendation...', 'info');
  await api('POST', '/recommendation/generate', {});
  showToast('Recommendation generated!', 'success');
  navigateTo('recommendation');
}

async function awardContract() {
  await api('POST', '/rfp/stage', { stage: 'awarded' });
  showToast('Contract awarded successfully!', 'success');
  navigateTo('dashboard');
}

async function addSampleProposal() {
  await api('POST', '/proposals/sample', {});
  showToast('Sample proposals added!', 'success');
  navigateTo('proposals');
}

async function viewVendor(id) {
  const v = appState.vendors.find(v => v.id === id);
  if (!v) return;
  showModal(\`
    <div class="flex items-center gap-3 mb-4">
      <div class="w-12 h-12 rounded-xl cpc-blue-bg flex items-center justify-center text-white font-bold text-lg">\${v.name.charAt(0)}</div>
      <div>
        <h3 class="text-lg font-bold">\${v.name}</h3>
        <p class="text-gray-500 text-sm">\${v.category||''}</p>
      </div>
    </div>
    <div class="grid grid-cols-2 gap-3 text-sm mb-4">
      <div><label>Contact</label><p>\${v.contact_name||'-'}</p></div>
      <div><label>Email</label><p>\${v.contact_email||'-'}</p></div>
      <div><label>Country</label><p>\${v.country||'-'}</p></div>
      <div><label>Size</label><p>\${v.size||'-'}</p></div>
      <div><label>Certifications</label><p>\${v.certifications||'-'}</p></div>
      <div><label>ERP Experience</label><p>\${v.erp_experience||'-'}</p></div>
    </div>
    \${v.fit_score ? \`
    <div class="bg-amber-50 rounded-lg p-3 mb-4">
      <div class="text-sm font-semibold text-amber-700 mb-1">AI Fit Score: \${v.fit_score}/100</div>
      <div class="score-bar"><div class="score-fill" style="width:\${v.fit_score}%"></div></div>
      \${v.fit_rationale ? \`<p class="text-xs text-gray-600 mt-2">\${v.fit_rationale}</p>\` : ''}
    </div>\` : ''}
    <button class="btn-secondary w-full" onclick="closeModal()">Close</button>
  \`);
}

async function viewProposal(id) {
  const p = appState.proposals.find(p => p.id === id);
  if (!p) return;
  showModal(\`
    <h3 class="text-lg font-bold mb-4">Proposal from \${p.vendor_name||'Unknown'}</h3>
    <div class="grid grid-cols-2 gap-3 text-sm mb-4">
      <div><label>Technical Score</label><p class="font-bold text-xl">\${p.technical_score||'-'}</p></div>
      <div><label>Financial Proposal</label><p class="font-bold text-xl">\${p.financial_proposal ? 'AED '+Number(p.financial_proposal).toLocaleString() : '-'}</p></div>
    </div>
    \${p.technical_proposal ? \`
    <div class="mb-3">
      <label>Technical Proposal</label>
      <div class="bg-gray-50 rounded-lg p-3 text-sm max-h-40 overflow-y-auto">\${p.technical_proposal}</div>
    </div>\` : ''}
    <button class="btn-secondary w-full" onclick="closeModal()">Close</button>
  \`);
}

// Start the app
init();
</script>
</body>
</html>`
}
