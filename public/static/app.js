// ============================================================
// CPC RFP TOOL — Multi-RFP Frontend
// ============================================================
'use strict';
const API = '/api';

var appState = {
  currentPage: 'dashboard',
  currentRfpId: null,
  currentRfpTab: 'generate',
  rfps: [],
  vendors: [],
  questions: [],
  proposals: [],
  evaluations: [],
  emails: []
};

// ============================================================
// UTILITIES
// ============================================================
function showToast(msg, type) {
  type = type || 'info';
  var t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show ' + type;
  setTimeout(function() { t.className = 'toast'; }, 3800);
}

function showModal(html) {
  document.getElementById('modalContent').innerHTML = html;
  document.getElementById('modalOverlay').classList.add('open');
}
function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
}

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function scoreBar(val) {
  return '<div class="score-bar"><div class="score-fill" style="width:' + (val||0) + '%"></div></div>';
}

function stageBadgeHtml(stage) {
  var labels = {
    draft:'Draft', published:'Published', qa_open:'Q&amp;A Open',
    submissions_closed:'Submissions Closed', evaluation:'Evaluation', awarded:'Awarded'
  };
  var cls = 'stage-' + (stage||'draft');
  return '<span class="stage-badge ' + cls + '">' + (labels[stage]||stage) + '</span>';
}

function setLoading(el, loading, text) {
  if (!el) return;
  if (loading) {
    el.disabled = true;
    el.dataset.origHtml = el.innerHTML;
    el.innerHTML = '<span class="spinner" style="margin-right:6px;width:14px;height:14px;border-width:2px"></span>' + (text||'Processing...');
  } else {
    el.disabled = false;
    el.innerHTML = el.dataset.origHtml || text || '';
  }
}

function setContent(html) {
  document.getElementById('pageContent').innerHTML = html;
}

async function apiCall(method, path, data) {
  try {
    var opts = { method: method, headers: { 'Content-Type': 'application/json' } };
    if (data) opts.body = JSON.stringify(data);
    var r = await fetch(API + path, opts);
    var json = await r.json();
    if (!r.ok) throw new Error(json.error || json.message || 'Request failed ' + r.status);
    return json;
  } catch(e) {
    showToast(e.message, 'error');
    throw e;
  }
}

// ============================================================
// NAVIGATION
// ============================================================
document.getElementById('modalOverlay').addEventListener('click', function(e) {
  if (e.target.id === 'modalOverlay') closeModal();
});

document.getElementById('headerDate').textContent = new Date().toLocaleDateString('en-AE', {
  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
});

document.getElementById('mainNav').addEventListener('click', function(e) {
  var link = e.target.closest('[data-page]');
  if (!link) return;
  e.preventDefault();
  navigateTo(link.dataset.page);
});

var pageTitles = {
  dashboard:  ['Dashboard',        'Cross-RFP Analytics & Overview'],
  rfps:       ['All RFPs',         'Active & Historical RFP Pipeline'],
  vendors:    ['Vendor Registry',  'Global Vendor Database & Performance'],
  reports:    ['Reports',          'Vendor Performance & Procurement Analytics'],
};

function navigateTo(page) {
  appState.currentPage = page;
  appState.currentRfpId = null;

  // Update nav active state
  document.querySelectorAll('[data-page]').forEach(function(el) {
    el.classList.toggle('active', el.dataset.page === page);
  });

  var info = pageTitles[page] || [page, ''];
  document.getElementById('pageTitle').textContent = info[0];
  document.getElementById('pageSubtitle').textContent = info[1];

  // Hide lifecycle bar and tabs
  document.getElementById('lifecycleBar').style.display = 'none';
  document.getElementById('rfpTabsBar').style.display = 'none';
  document.getElementById('backBtn').style.display = 'none';

  setContent('<div style="display:flex;align-items:center;justify-content:center;height:200px"><div class="spinner" style="width:36px;height:36px;border-width:4px"></div></div>');

  if (pages[page]) pages[page]();
}

function goBack() {
  if (appState.currentRfpId) {
    navigateTo('rfps');
  } else {
    navigateTo('dashboard');
  }
}

// ============================================================
// LIFECYCLE BAR RENDERER
// ============================================================
var LC_STAGES = ['draft','published','qa_open','submissions_closed','evaluation','awarded'];
var LC_LABELS = ['Draft','Published','Q&A Open','Closed','Evaluation','Awarded'];
var LC_ICONS  = ['fa-pencil','fa-paper-plane','fa-comments','fa-lock','fa-star','fa-trophy'];
var LC_INFOS  = {
  draft:               'RFP is being authored. Complete and publish to invite vendors.',
  published:           'RFP is published. Open Q&A period to accept vendor questions.',
  qa_open:             'Vendors can submit questions. Draft and publish official answers.',
  submissions_closed:  'Submission window is closed. Collect proposals before evaluation.',
  evaluation:          'Proposals are under AI-powered evaluation and scoring.',
  awarded:             'Contract has been awarded. Procurement cycle is complete.',
};

function showLifecycleBar(stage, rfpId) {
  var idx = LC_STAGES.indexOf(stage);
  var html = '';
  LC_STAGES.forEach(function(s, i) {
    var cls = i < idx ? 'lc-done' : (i === idx ? 'lc-active' : 'lc-pending');
    var icon = i < idx ? 'fa-check' : LC_ICONS[i];
    html += '<div class="lc-step ' + cls + '">';
    html += '<div class="lc-node">';
    html += '<div class="lc-circle"><i class="fas ' + icon + '" style="font-size:0.7rem"></i></div>';
    html += '<div class="lc-label">' + LC_LABELS[i] + '</div>';
    html += '</div>';
    if (i < LC_STAGES.length - 1) html += '<div class="lc-connector"></div>';
    html += '</div>';
  });
  html += '<div class="lc-info-pill"><i class="fas fa-info-circle" style="margin-right:4px"></i>' + (LC_INFOS[stage]||stage) + '</div>';

  // Stage advance button
  var nextStage = LC_STAGES[idx + 1];
  var nextLabel = LC_LABELS[idx + 1];
  var advBtns = '';
  if (nextStage) {
    advBtns = '<button class="btn-primary btn-sm" style="margin-left:auto;flex-shrink:0" onclick="advanceRfpStage(' + rfpId + ',\'' + nextStage + '\')"><i class="fas fa-arrow-right"></i> ' + nextLabel + '</button>';
  } else {
    advBtns = '<span class="stage-badge stage-awarded" style="margin-left:auto;padding:0.35rem 0.875rem"><i class="fas fa-trophy" style="margin-right:4px"></i>Awarded</span>';
  }

  var bar = document.getElementById('lifecycleBar');
  bar.className = 'lifecycle-bar';
  bar.style.display = 'flex';
  bar.innerHTML = html + advBtns;
}

// ============================================================
// RFP TABS RENDERER
// ============================================================
var TABS = [
  { id:'generate',       label:'Generate',    icon:'fa-magic' },
  { id:'vendors',        label:'Vendors',     icon:'fa-building' },
  { id:'qa',             label:'Q&A',         icon:'fa-comments' },
  { id:'emails',         label:'Emails',      icon:'fa-envelope' },
  { id:'proposals',      label:'Proposals',   icon:'fa-inbox' },
  { id:'evaluation',     label:'Evaluation',  icon:'fa-star-half-alt' },
  { id:'recommendation', label:'Award',       icon:'fa-trophy' },
];

function showRfpTabs(activeTab, rfpId) {
  var html = '';
  TABS.forEach(function(t) {
    var cls = t.id === activeTab ? 'rfp-tab active' : 'rfp-tab';
    html += '<div class="' + cls + '" onclick="switchRfpTab(' + rfpId + ',\'' + t.id + '\')">'
      + '<i class="fas ' + t.icon + '"></i>' + t.label + '</div>';
  });
  var bar = document.getElementById('rfpTabsBar');
  bar.className = 'rfp-tabs';
  bar.style.display = 'flex';
  bar.innerHTML = html;
}

function switchRfpTab(rfpId, tab) {
  appState.currentRfpTab = tab;
  showRfpTabs(tab, rfpId);
  setContent('<div style="display:flex;align-items:center;justify-content:center;height:200px"><div class="spinner" style="width:36px;height:36px;border-width:4px"></div></div>');
  rfpTabPages[tab](rfpId);
}

// ============================================================
// INIT
// ============================================================
async function init() {
  try { await apiCall('POST', '/init', {}); } catch(e) {}
  navigateTo('dashboard');
}

// ============================================================
// PAGE: DASHBOARD (cross-RFP stats)
// ============================================================
var pages = {};

pages.dashboard = async function() {
  var stats, perf;
  try {
    [stats, perf] = await Promise.all([
      apiCall('GET', '/stats'),
      apiCall('GET', '/vendor-performance').catch(function() { return []; })
    ]);
  } catch(e) {
    stats = {};
    perf = [];
  }

  var stageBreakdown = stats.stageBreakdown || [];
  var stageLabels = { draft:'Draft', published:'Published', qa_open:'Q&A Open', submissions_closed:'Closed', evaluation:'Evaluation', awarded:'Awarded' };
  var stageColors = { draft:'#94a3b8', published:'#3b82f6', qa_open:'#8b5cf6', submissions_closed:'#f59e0b', evaluation:'#f97316', awarded:'#10b981' };

  // Stage breakdown bars
  var maxCnt = Math.max(1, Math.max.apply(null, stageBreakdown.map(function(s){return s.cnt;})));
  var stageBarHtml = stageBreakdown.length === 0
    ? '<div style="color:#9ca3af;font-size:0.875rem;padding:1rem 0">No RFPs yet</div>'
    : stageBreakdown.map(function(s) {
        var pct = Math.round((s.cnt/maxCnt)*100);
        var col = stageColors[s.stage] || '#94a3b8';
        return '<div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:0.6rem">'
          + '<div style="width:110px;font-size:0.78rem;color:#374151;font-weight:500">' + (stageLabels[s.stage]||s.stage) + '</div>'
          + '<div style="flex:1;background:#f3f4f6;border-radius:6px;height:18px;overflow:hidden">'
          + '<div style="width:' + pct + '%;background:' + col + ';height:100%;border-radius:6px;transition:width 0.6s"></div></div>'
          + '<div style="width:28px;text-align:right;font-size:0.8rem;font-weight:600;color:#374151">' + s.cnt + '</div>'
          + '</div>';
      }).join('');

  // Top performers table
  var topPerf = (perf||[]).slice(0, 5);
  var perfRows = topPerf.length === 0
    ? '<tr><td colspan="4" style="text-align:center;color:#9ca3af;padding:2rem">No vendor data yet</td></tr>'
    : topPerf.map(function(v) {
        var avgScore = v.avg_score ? Math.round(v.avg_score) : 0;
        var grade = avgScore >= 75 ? 'perf-high' : avgScore >= 50 ? 'perf-mid' : 'perf-low';
        return '<tr>'
          + '<td><span style="font-weight:600">' + escHtml(v.name) + '</span><br><span style="font-size:0.75rem;color:#9ca3af">' + escHtml(v.category||'') + '</span></td>'
          + '<td style="text-align:center">' + (v.rfps_shortlisted||0) + '</td>'
          + '<td style="text-align:center">' + (v.proposals_submitted||0) + '</td>'
          + '<td style="text-align:center"><span class="perf-badge ' + grade + '">' + (avgScore||'—') + (avgScore?'/100':'') + '</span></td>'
          + '</tr>';
      }).join('');

  // Stats cards
  var kpis = [
    { icon:'fa-layer-group',  label:'Total RFPs',       value: stats.totalRfps||0,       color:'#0f3460' },
    { icon:'fa-bolt',         label:'Active RFPs',      value: stats.activeRfps||0,       color:'#3b82f6' },
    { icon:'fa-trophy',       label:'Awarded',          value: stats.awardedRfps||0,      color:'#065f46' },
    { icon:'fa-percent',      label:'Win Rate',         value: (stats.winRate||0)+'%',    color:'#c9a84c' },
    { icon:'fa-building',     label:'Registered Vendors', value: stats.totalVendors||0,   color:'#7c3aed' },
    { icon:'fa-inbox',        label:'Total Proposals',  value: stats.totalProposals||0,   color:'#0891b2' },
    { icon:'fa-clock',        label:'Avg Duration',     value: stats.avgDuration ? stats.avgDuration+'d' : 'N/A', color:'#9ca3af' },
    { icon:'fa-star',         label:'Top Vendor',       value: stats.topVendor ? stats.topVendor.split(' ')[0] : 'N/A', color:'#f59e0b' },
  ];
  var kpiHtml = kpis.map(function(k) {
    return '<div class="stat-card">'
      + '<div style="display:flex;justify-content:space-between;align-items:flex-start">'
      + '<div class="stat-value" style="color:' + k.color + '">' + k.value + '</div>'
      + '<div style="width:34px;height:34px;border-radius:8px;display:flex;align-items:center;justify-content:center" style="background:' + k.color + '18">'
      + '<i class="fas ' + k.icon + '" style="color:' + k.color + ';font-size:0.9rem"></i></div>'
      + '</div>'
      + '<div class="stat-label">' + k.label + '</div>'
      + '</div>';
  }).join('');

  setContent(
    '<div class="space-y-6">'
    // KPI grid
    + '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:0.875rem">' + kpiHtml + '</div>'

    // Two-column row: Stage breakdown + Top vendors
    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">'

    // Stage breakdown card
    + '<div class="card" style="padding:1.25rem">'
    + '<h3 style="font-weight:700;color:#1f2937;margin-bottom:1rem;font-size:0.95rem"><i class="fas fa-chart-bar mr-2 cpc-gold"></i>RFPs by Stage</h3>'
    + stageBarHtml
    + '</div>'

    // Top vendor perf card
    + '<div class="card" style="padding:1.25rem">'
    + '<h3 style="font-weight:700;color:#1f2937;margin-bottom:1rem;font-size:0.95rem"><i class="fas fa-medal mr-2 cpc-gold"></i>Top Vendors</h3>'
    + '<div style="overflow-x:auto">'
    + '<table style="font-size:0.82rem"><thead><tr>'
    + '<th>Vendor</th><th style="text-align:center">RFPs</th><th style="text-align:center">Props</th><th style="text-align:center">Avg Score</th>'
    + '</tr></thead><tbody>' + perfRows + '</tbody></table></div>'
    + '</div>'
    + '</div>'

    // Quick actions
    + '<div class="card" style="padding:1.25rem">'
    + '<h3 style="font-weight:700;color:#1f2937;margin-bottom:1rem;font-size:0.95rem"><i class="fas fa-bolt mr-2 cpc-gold"></i>Quick Actions</h3>'
    + '<div style="display:flex;gap:0.75rem;flex-wrap:wrap">'
    + '<button class="btn-primary" onclick="openCreateRfpModal()"><i class="fas fa-plus"></i>New RFP</button>'
    + '<button class="btn-secondary" onclick="navigateTo(\'rfps\')"><i class="fas fa-layer-group"></i>View All RFPs</button>'
    + '<button class="btn-ghost" onclick="navigateTo(\'vendors\')"><i class="fas fa-building"></i>Vendor Registry</button>'
    + '<button class="btn-ghost" onclick="navigateTo(\'reports\')"><i class="fas fa-chart-bar"></i>Full Report</button>'
    + '</div>'
    + '</div>'
    + '</div>'
  );
};

// ============================================================
// PAGE: ALL RFPs LIST
// ============================================================
pages.rfps = async function() {
  var rfps;
  try { rfps = await apiCall('GET', '/rfps'); } catch(e) { rfps = []; }
  appState.rfps = rfps;

  if (rfps.length === 0) {
    setContent(
      '<div class="space-y-4">'
      + '<div style="display:flex;justify-content:space-between;align-items:center">'
      + '<h2 style="font-weight:700;color:#1f2937;font-size:1.05rem">All RFPs</h2>'
      + '<button class="btn-primary" onclick="openCreateRfpModal()"><i class="fas fa-plus"></i>Create New RFP</button>'
      + '</div>'
      + '<div class="card" style="padding:3rem;text-align:center;color:#9ca3af">'
      + '<i class="fas fa-layer-group" style="font-size:3rem;display:block;margin-bottom:1rem"></i>'
      + '<p style="margin-bottom:1rem">No RFPs yet. Create your first RFP to get started.</p>'
      + '<button class="btn-primary" onclick="openCreateRfpModal()"><i class="fas fa-magic"></i>Create RFP with AI</button>'
      + '</div></div>'
    );
    return;
  }

  var cards = rfps.map(function(rfp) {
    var created = rfp.created_at ? new Date(rfp.created_at).toLocaleDateString('en-AE', {year:'numeric',month:'short',day:'numeric'}) : '-';
    var stageIdx = LC_STAGES.indexOf(rfp.stage);
    var progress = Math.round(((stageIdx < 0 ? 0 : stageIdx) / (LC_STAGES.length - 1)) * 100);
    return '<div class="rfp-card" onclick="openRfp(' + rfp.id + ')">'
      + '<div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:0.75rem">'
      + '<div style="flex:1">'
      + '<div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;margin-bottom:0.25rem">'
      + '<span style="font-weight:700;color:#1f2937;font-size:0.95rem">' + escHtml(rfp.title||'Untitled RFP') + '</span>'
      + stageBadgeHtml(rfp.stage)
      + '</div>'
      + '<div style="font-size:0.78rem;color:#6b7280">'
      + '<span><i class="fas fa-hashtag" style="margin-right:3px"></i>' + escHtml(rfp.ref_number||'—') + '</span>'
      + ' &bull; <span><i class="fas fa-tag" style="margin-right:3px"></i>' + escHtml(rfp.category||'—') + '</span>'
      + ' &bull; <span><i class="fas fa-calendar" style="margin-right:3px"></i>' + created + '</span>'
      + (rfp.budget ? ' &bull; <span><i class="fas fa-coins" style="margin-right:3px"></i>AED ' + escHtml(rfp.budget) + '</span>' : '')
      + '</div>'
      + '</div>'
      + '<button class="btn-ghost btn-sm" style="flex-shrink:0;margin-left:1rem" onclick="event.stopPropagation();openRfp(' + rfp.id + ')">Open <i class="fas fa-arrow-right"></i></button>'
      + '</div>'
      // Progress line
      + '<div style="display:flex;align-items:center;gap:0.5rem">'
      + '<div style="flex:1;background:#e5e7eb;border-radius:6px;height:6px;overflow:hidden">'
      + '<div style="width:' + progress + '%;background:var(--cpc-gold);height:100%;border-radius:6px;transition:width 0.5s"></div>'
      + '</div>'
      + '<span style="font-size:0.72rem;color:#9ca3af;white-space:nowrap">' + (stageIdx+1) + '/' + LC_STAGES.length + ' stages</span>'
      + '</div>'
      + '</div>';
  }).join('');

  setContent(
    '<div class="space-y-4">'
    + '<div style="display:flex;justify-content:space-between;align-items:center">'
    + '<div><h2 style="font-weight:700;color:#1f2937;font-size:1.05rem">All RFPs</h2>'
    + '<p style="font-size:0.82rem;color:#6b7280;margin:0">' + rfps.length + ' RFP' + (rfps.length!==1?'s':'') + ' in pipeline</p></div>'
    + '<button class="btn-primary" onclick="openCreateRfpModal()"><i class="fas fa-plus"></i>Create New RFP</button>'
    + '</div>'
    + '<div style="display:grid;gap:0.75rem">' + cards + '</div>'
    + '</div>'
  );
};

// ============================================================
// OPEN SINGLE RFP (detail view with lifecycle bar + tabs)
// ============================================================
async function openRfp(rfpId) {
  appState.currentRfpId = rfpId;
  appState.currentRfpTab = 'generate';

  var rfp;
  try { rfp = await apiCall('GET', '/rfps/' + rfpId); } catch(e) { return; }

  // Update header
  document.getElementById('pageTitle').textContent = rfp.title || 'RFP Detail';
  document.getElementById('pageSubtitle').textContent = rfp.ref_number || '';

  // Show back button
  var bb = document.getElementById('backBtn');
  bb.style.display = 'inline-flex';

  // Remove active from nav
  document.querySelectorAll('[data-page]').forEach(function(el) { el.classList.remove('active'); });

  // Show lifecycle bar
  showLifecycleBar(rfp.stage || 'draft', rfpId);

  // Show tabs
  showRfpTabs('generate', rfpId);

  // Load first tab
  rfpTabPages.generate(rfpId);
}

// ============================================================
// RFP TAB PAGES
// ============================================================
var rfpTabPages = {};

// --- GENERATE TAB ---
rfpTabPages.generate = async function(rfpId) {
  var rfp;
  try { rfp = await apiCall('GET', '/rfps/' + rfpId); } catch(e) { rfp = {}; }

  var previewHtml = rfp.content
    ? rfp.content
    : '<div style="text-align:center;padding:3rem;color:#9ca3af">'
      + '<i class="fas fa-file-alt" style="font-size:3rem;display:block;margin-bottom:1rem"></i>'
      + '<p>Fill in the details and click "Generate with AI" to create the RFP document</p>'
      + '</div>';

  var catOptions = ['IT & Digital Transformation','Consulting Services','Infrastructure','Professional Services','Construction','Healthcare','Legal']
    .map(function(c) {
      return '<option value="' + c + '"' + (rfp.category===c?' selected':'') + '>' + c + '</option>';
    }).join('');

  setContent(
    '<div style="display:grid;grid-template-columns:420px 1fr;gap:1rem;height:calc(100vh - 220px)">'
    // Left: form
    + '<div class="card" style="padding:1.25rem;overflow-y:auto;display:flex;flex-direction:column;gap:0.875rem">'
    + '<h3 style="font-weight:700;color:#1f2937;margin:0;font-size:0.95rem"><i class="fas fa-magic cpc-gold" style="margin-right:0.5rem"></i>RFP Generator</h3>'
    + '<div class="form-group"><label>Project Title *</label><input id="rfpTitle" placeholder="e.g. ERP System Implementation" value="' + escHtml(rfp.title||'') + '"></div>'
    + '<div class="form-group"><label>Category</label><select id="rfpCategory">' + catOptions + '</select></div>'
    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem">'
    + '<div class="form-group"><label>Budget (AED)</label><input id="rfpBudget" placeholder="e.g. 5,000,000" value="' + escHtml(rfp.budget||'') + '"></div>'
    + '<div class="form-group"><label>Deadline</label><input type="date" id="rfpDeadline" value="' + escHtml(rfp.deadline||'') + '"></div>'
    + '</div>'
    + '<div class="form-group"><label>Background <span style="font-weight:400;color:#9ca3af">(human language)</span></label>'
    + '<textarea id="rfpBackground" rows="3" placeholder="Describe the current situation and context...">' + escHtml(rfp.background||'') + '</textarea></div>'
    + '<div class="form-group"><label>Objectives <span style="font-weight:400;color:#9ca3af">(what you want to achieve)</span></label>'
    + '<textarea id="rfpObjectives" rows="3" placeholder="List the main goals of this project...">' + escHtml(rfp.objectives||'') + '</textarea></div>'
    + '<div class="form-group"><label>Scope of Work</label>'
    + '<textarea id="rfpScope" rows="3" placeholder="Key deliverables and areas to be covered...">' + escHtml(rfp.scope||'') + '</textarea></div>'
    + '<div class="form-group"><label>Technical Requirements</label>'
    + '<textarea id="rfpTech" rows="2" placeholder="Cloud, Arabic support, certifications...">' + escHtml(rfp.tech_requirements||'') + '</textarea></div>'
    + '<div style="display:flex;gap:0.5rem;padding-top:0.25rem">'
    + '<button class="btn-primary" id="generateBtn" style="flex:1" onclick="generateRfpContent(' + rfpId + ')"><i class="fas fa-robot"></i>Generate with AI</button>'
    + '<button class="btn-ghost" onclick="saveRfpFields(' + rfpId + ')"><i class="fas fa-save"></i>Save</button>'
    + '</div>'
    + '</div>'
    // Right: preview
    + '<div class="card" style="padding:1.25rem;display:flex;flex-direction:column;overflow:hidden">'
    + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.875rem;flex-shrink:0">'
    + '<h3 style="font-weight:700;color:#1f2937;margin:0;font-size:0.95rem"><i class="fas fa-eye cpc-gold" style="margin-right:0.5rem"></i>RFP Document Preview</h3>'
    + (rfp.content ? '<button class="btn-primary btn-sm" onclick="downloadRfpPdf(' + rfpId + ')"><i class="fas fa-file-pdf"></i>Download PDF</button>' : '')
    + '</div>'
    + '<div id="rfpPreview" style="flex:1;overflow-y:auto;font-size:0.875rem">' + previewHtml + '</div>'
    + '</div>'
    + '</div>'
  );
};

// --- VENDORS TAB ---
rfpTabPages.vendors = async function(rfpId) {
  var vendors;
  try { vendors = await apiCall('GET', '/rfps/' + rfpId + '/vendors'); } catch(e) { vendors = []; }
  appState.vendors = vendors;

  var rows = vendors.map(function(v) {
    var tags = (v.specializations||'').split(',').filter(Boolean).slice(0,3)
      .map(function(s) { return '<span class="tag">' + escHtml(s.trim()) + '</span>'; }).join('');
    var scored = v.rfp_fit_score ? '<span style="font-size:0.72rem;background:#fffbeb;color:#92400e;padding:2px 8px;border-radius:12px;font-weight:500">AI: ' + v.rfp_fit_score + '/100</span>' : '';
    var btn = v.shortlisted
      ? '<button class="btn-danger btn-sm" onclick="toggleShortlist(' + rfpId + ',' + v.id + ',false)"><i class="fas fa-times"></i></button>'
      : '<button class="btn-primary btn-sm" onclick="toggleShortlist(' + rfpId + ',' + v.id + ',true)"><i class="fas fa-plus"></i>Add</button>';
    return '<div class="card" style="padding:0.875rem;' + (v.shortlisted ? 'border:2px solid var(--cpc-gold)' : '') + ';margin-bottom:0.5rem">'
      + '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:0.75rem">'
      + '<div style="display:flex;gap:0.75rem;flex:1">'
      + '<div style="width:36px;height:36px;border-radius:8px;background:var(--cpc-blue);display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:0.82rem;flex-shrink:0">' + escHtml(v.name.charAt(0)) + '</div>'
      + '<div style="flex:1">'
      + '<div style="display:flex;align-items:center;gap:0.4rem;flex-wrap:wrap">'
      + '<span style="font-weight:600;color:#1f2937;font-size:0.9rem">' + escHtml(v.name) + '</span>'
      + (v.shortlisted ? '<span class="stage-badge stage-published">&#10003; Shortlisted</span>' : '')
      + scored
      + '</div>'
      + '<div style="font-size:0.78rem;color:#6b7280;margin-top:2px">' + escHtml(v.category||'') + ' &bull; ' + escHtml(v.country||'UAE') + '</div>'
      + '<div style="margin-top:4px">' + tags + '</div>'
      + (v.rfp_fit_rationale ? '<div style="font-size:0.75rem;color:#6b7280;margin-top:4px;font-style:italic">' + escHtml(v.rfp_fit_rationale) + '</div>' : '')
      + '</div></div>'
      + '<div style="display:flex;gap:0.4rem;flex-shrink:0">' + btn + '</div>'
      + '</div></div>';
  }).join('');

  var shortlistCount = vendors.filter(function(v) { return v.shortlisted; }).length;

  setContent(
    '<div class="space-y-4">'
    + '<div style="display:flex;align-items:center;justify-content:space-between">'
    + '<p style="font-size:0.875rem;color:#6b7280">' + vendors.length + ' vendors &bull; <strong style="color:var(--cpc-navy)">' + shortlistCount + ' shortlisted</strong></p>'
    + '<div style="display:flex;gap:0.5rem">'
    + '<button class="btn-ghost" onclick="aiShortlistRfp(' + rfpId + ')"><i class="fas fa-robot"></i>AI Shortlist</button>'
    + '<button class="btn-primary" onclick="sendRfpInvitations(' + rfpId + ')"><i class="fas fa-paper-plane"></i>Send Invitations</button>'
    + '</div></div>'
    + '<div>' + rows + '</div>'
    + '</div>'
  );
};

// --- Q&A TAB ---
rfpTabPages.qa = async function(rfpId) {
  var questions;
  try { questions = await apiCall('GET', '/rfps/' + rfpId + '/questions'); } catch(e) { questions = []; }
  appState.questions = questions;

  var pending   = questions.filter(function(q) { return !q.published && !q.answer; }).length;
  var answered  = questions.filter(function(q) { return q.answer && !q.published; }).length;
  var published = questions.filter(function(q) { return q.published; }).length;

  var qCards = questions.length === 0
    ? '<div class="card" style="padding:3rem;text-align:center;color:#9ca3af">'
      + '<i class="fas fa-comments" style="font-size:3rem;display:block;margin-bottom:1rem"></i>'
      + '<p style="margin-bottom:1rem">No questions yet.</p>'
      + '<button class="btn-secondary" onclick="loadSampleQuestions(' + rfpId + ')">Load Sample Questions</button>'
      + '</div>'
    : questions.map(function(q) {
        var badge = q.published
          ? '<span class="stage-badge stage-published">Published</span>'
          : q.answer ? '<span class="stage-badge" style="background:#fef3c7;color:#92400e">Awaiting Approval</span>'
          : '<span class="stage-badge stage-draft">Unanswered</span>';
        var answerBlock = q.answer
          ? '<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:0.6rem 0.75rem;margin-top:0.6rem">'
            + '<div style="font-size:0.72rem;font-weight:700;color:#92400e;margin-bottom:3px"><i class="fas fa-robot" style="margin-right:3px"></i>AI Draft</div>'
            + '<p style="font-size:0.85rem;color:#374151;margin:0">' + escHtml(q.answer) + '</p>'
            + '</div>' : '';
        var btns = (!q.answer
          ? '<button class="btn-secondary btn-sm" onclick="draftQAnswer(' + rfpId + ',' + q.id + ')"><i class="fas fa-robot"></i>Draft</button>'
          : '') + (q.answer && !q.published
          ? '<button class="btn-primary btn-sm" onclick="approveQAnswer(' + rfpId + ',' + q.id + ')"><i class="fas fa-check"></i>Approve</button>'
          : '');
        return '<div class="card" style="padding:0.875rem;margin-bottom:0.5rem" id="q-' + q.id + '">'
          + '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:0.75rem">'
          + '<div style="flex:1">'
          + '<div style="display:flex;align-items:center;gap:0.4rem;margin-bottom:0.4rem">'
          + '<span style="font-size:0.72rem;font-weight:600;color:#9ca3af">Q' + q.id + ' &bull; ' + escHtml(q.vendor_name||'Vendor') + '</span>'
          + badge + '</div>'
          + '<p style="font-weight:500;color:#1f2937;font-size:0.875rem;margin:0">' + escHtml(q.question) + '</p>'
          + answerBlock
          + '</div>'
          + '<div style="display:flex;flex-direction:column;gap:0.4rem;flex-shrink:0">' + btns + '</div>'
          + '</div></div>';
      }).join('');

  setContent(
    '<div class="space-y-4">'
    + '<div style="display:flex;align-items:center;justify-content:space-between">'
    + '<div style="display:flex;gap:1rem">'
    + '<span style="font-size:0.82rem;color:#6b7280">' + pending + ' pending</span>'
    + '<span style="font-size:0.82rem;color:#92400e">' + answered + ' awaiting approval</span>'
    + '<span style="font-size:0.82rem;color:#065f46">' + published + ' published</span>'
    + '</div>'
    + '<div style="display:flex;gap:0.5rem">'
    + '<button class="btn-ghost" onclick="draftAllQAnswers(' + rfpId + ')"><i class="fas fa-robot"></i>AI Draft All</button>'
    + '<button class="btn-primary" onclick="publishAllQAnswers(' + rfpId + ')"><i class="fas fa-paper-plane"></i>Publish Approved</button>'
    + '</div></div>'
    + '<div>' + qCards + '</div>'
    + '</div>'
  );
};

// --- EMAILS TAB ---
rfpTabPages.emails = async function(rfpId) {
  var emails;
  try { emails = await apiCall('GET', '/rfps/' + rfpId + '/emails'); } catch(e) { emails = []; }

  var rows = emails.map(function(e) {
    var statusHtml = e.status === 'sent'
      ? '<span style="color:#065f46;font-weight:500"><i class="fas fa-check-circle" style="margin-right:3px"></i>Sent</span>'
      : e.status === 'simulated'
      ? '<span style="color:#1d4ed8;font-weight:500"><i class="fas fa-flask" style="margin-right:3px"></i>Simulated</span>'
      : '<span style="color:#6b7280">' + escHtml(e.status) + '</span>';
    var dateStr = e.created_at ? new Date(e.created_at).toLocaleString() : '-';
    return '<tr>'
      + '<td style="font-weight:500">' + escHtml(e.vendor_name||e.recipient||'') + '</td>'
      + '<td style="font-size:0.8rem">' + escHtml(e.subject||'') + '</td>'
      + '<td><span class="tag">' + escHtml(e.email_type||'') + '</span></td>'
      + '<td>' + statusHtml + '</td>'
      + '<td style="font-size:0.78rem;color:#6b7280">' + dateStr + '</td>'
      + '</tr>';
  }).join('');

  var content = emails.length === 0
    ? '<div style="padding:3rem;text-align:center;color:#9ca3af">'
      + '<i class="fas fa-envelope-open-text" style="font-size:3rem;display:block;margin-bottom:1rem"></i>'
      + '<p>No emails sent yet. Go to Vendors tab to send invitations.</p></div>'
    : '<div style="overflow-x:auto"><table><thead><tr><th>To</th><th>Subject</th><th>Type</th><th>Status</th><th>Sent At</th></tr></thead><tbody>' + rows + '</tbody></table></div>';

  setContent(
    '<div class="card">'
    + '<div style="padding:1rem;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;justify-content:space-between">'
    + '<h3 style="font-weight:700;color:#1f2937;margin:0">Email Correspondence Log</h3>'
    + '<span style="font-size:0.82rem;color:#6b7280">' + emails.length + ' emails</span>'
    + '</div>' + content + '</div>'
  );
};

// --- PROPOSALS TAB ---
rfpTabPages.proposals = async function(rfpId) {
  var proposals;
  try { proposals = await apiCall('GET', '/rfps/' + rfpId + '/proposals'); } catch(e) { proposals = []; }
  appState.proposals = proposals;

  var rows = proposals.map(function(p) {
    var fin = p.financial_proposal ? 'AED ' + Number(p.financial_proposal).toLocaleString() : '-';
    var dateStr = p.created_at ? new Date(p.created_at).toLocaleDateString() : '-';
    return '<tr>'
      + '<td style="font-weight:500">' + escHtml(p.vendor_name||'Unknown') + '</td>'
      + '<td style="font-size:0.8rem;color:#6b7280">' + dateStr + '</td>'
      + '<td>' + (p.technical_score != null ? p.technical_score + '/100' : '<span style="color:#9ca3af">—</span>') + '</td>'
      + '<td>' + fin + '</td>'
      + '<td>' + stageBadgeHtml('published') + '</td>'
      + '<td><button class="btn-ghost btn-sm" onclick="viewProposal(' + p.id + ')"><i class="fas fa-eye"></i></button></td>'
      + '</tr>';
  }).join('');

  var content = proposals.length === 0
    ? '<div style="padding:3rem;text-align:center;color:#9ca3af">'
      + '<i class="fas fa-inbox" style="font-size:3rem;display:block;margin-bottom:1rem"></i>'
      + '<p style="margin-bottom:1rem">No proposals yet.</p>'
      + '<button class="btn-primary" onclick="addSampleProposals(' + rfpId + ')"><i class="fas fa-plus"></i>Add Sample Proposals</button>'
      + '</div>'
    : '<div style="overflow-x:auto"><table><thead><tr><th>Vendor</th><th>Submitted</th><th>Tech Score</th><th>Financial</th><th>Status</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>';

  setContent(
    '<div class="space-y-4">'
    + '<div style="display:flex;justify-content:space-between;align-items:center">'
    + '<p style="font-size:0.875rem;color:#6b7280">' + proposals.length + ' proposals received</p>'
    + '<button class="btn-primary" onclick="addSampleProposals(' + rfpId + ')"><i class="fas fa-plus"></i>Add Sample Proposals</button>'
    + '</div>'
    + '<div class="card">' + content + '</div>'
    + '</div>'
  );
};

// --- EVALUATION TAB ---
rfpTabPages.evaluation = async function(rfpId) {
  var evaluations;
  try { evaluations = await apiCall('GET', '/rfps/' + rfpId + '/evaluations'); } catch(e) { evaluations = []; }
  appState.evaluations = evaluations;

  var evalCards = evaluations.length === 0
    ? '<div class="card" style="padding:3rem;text-align:center;color:#9ca3af">'
      + '<i class="fas fa-star-half-alt" style="font-size:3rem;display:block;margin-bottom:1rem"></i>'
      + '<p style="margin-bottom:1rem">No evaluations yet. Add proposals first, then run AI evaluation.</p>'
      + '<button class="btn-primary" id="runEvalBtn" onclick="runRfpEvaluation(' + rfpId + ')"><i class="fas fa-robot"></i>Run AI Evaluation</button>'
      + '</div>'
    : evaluations.map(function(e) {
        var scores = [
          { label:'Technical', val:e.technical_score },
          { label:'Financial', val:e.financial_score },
          { label:'Experience', val:e.experience_score },
        ];
        var scoreHtml = scores.map(function(s) {
          return '<div><div style="display:flex;justify-content:space-between;font-size:0.72rem;color:#6b7280;margin-bottom:3px"><span>' + s.label + '</span><span>' + (s.val||0) + '/100</span></div>'
            + scoreBar(s.val) + '</div>';
        }).join('');
        return '<div class="card" style="padding:1.1rem;margin-bottom:0.75rem">'
          + '<div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:0.875rem">'
          + '<div><h3 style="font-weight:600;color:#1f2937;font-size:0.95rem;margin:0">' + escHtml(e.vendor_name||'Vendor') + '</h3></div>'
          + '<div style="text-align:right"><div style="font-size:1.75rem;font-weight:700;color:var(--cpc-gold)">' + (e.total_score||0) + '</div>'
          + '<div style="font-size:0.72rem;color:#6b7280">/ 100</div></div>'
          + '</div>'
          + '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:0.875rem;margin-bottom:0.75rem">' + scoreHtml + '</div>'
          + (e.ai_summary ? '<p style="font-size:0.78rem;color:#4b5563;background:#f9fafb;border-radius:6px;padding:0.6rem;margin:0">' + escHtml(e.ai_summary) + '</p>' : '')
          + '</div>';
      }).join('');

  setContent(
    '<div class="space-y-4">'
    + '<div style="display:flex;justify-content:space-between;align-items:center">'
    + '<p style="font-size:0.875rem;color:#6b7280">' + evaluations.length + ' evaluations</p>'
    + '<div style="display:flex;gap:0.5rem">'
    + '<button class="btn-ghost" id="runEvalBtn" onclick="runRfpEvaluation(' + rfpId + ')"><i class="fas fa-robot"></i>Run AI Evaluation</button>'
    + '<button class="btn-primary" onclick="switchRfpTab(' + rfpId + ',\'recommendation\')"><i class="fas fa-trophy"></i>View Award</button>'
    + '</div></div>'
    + evalCards
    + '</div>'
  );
};

// --- RECOMMENDATION / AWARD TAB ---
rfpTabPages.recommendation = async function(rfpId) {
  var rec;
  try { rec = await apiCall('GET', '/rfps/' + rfpId + '/recommendation'); } catch(e) { rec = null; }

  var content;
  if (!rec) {
    content = '<div class="card" style="padding:3rem;text-align:center;color:#9ca3af">'
      + '<i class="fas fa-trophy" style="font-size:3rem;display:block;margin-bottom:1rem"></i>'
      + '<p style="margin-bottom:1rem">No recommendation yet. Complete evaluation first.</p>'
      + '<button class="btn-primary" onclick="generateRfpRecommendation(' + rfpId + ')"><i class="fas fa-robot"></i>Generate AI Recommendation</button>'
      + '</div>';
  } else {
    var rankings = rec.rankings || [];
    var medals = ['🥇','🥈','🥉'];
    var rankCards = rankings.map(function(r, i) {
      var isBest = i === 0;
      return '<div class="card" style="padding:1.25rem;' + (isBest ? 'border:2px solid var(--cpc-gold)' : '') + '">'
        + '<div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:0.75rem">'
        + '<div style="width:40px;height:40px;border-radius:50%;background:' + (isBest?'var(--cpc-gold)':i===1?'#e5e7eb':'#fef3c7') + ';display:flex;align-items:center;justify-content:center;font-size:1.25rem">' + (medals[i]||String(i+1)) + '</div>'
        + '<div><div style="font-weight:700;color:#1f2937">' + escHtml(r.vendor_name) + '</div>'
        + '<div style="font-size:0.75rem;color:#6b7280">Rank #' + (i+1) + '</div></div>'
        + '</div>'
        + '<div style="font-size:2rem;font-weight:700;color:var(--cpc-gold)">' + r.total_score + '</div>'
        + '<div style="font-size:0.72rem;color:#6b7280;margin-bottom:0.5rem">/100</div>'
        + (isBest ? '<span class="stage-badge stage-awarded">Recommended</span>' : '')
        + '</div>';
    }).join('');

    content = '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:0.875rem;margin-bottom:1rem">' + rankCards + '</div>'
      + '<div class="card" style="padding:1.25rem">'
      + '<h3 style="font-weight:700;color:#1f2937;margin-bottom:0.75rem;font-size:0.95rem"><i class="fas fa-robot cpc-gold" style="margin-right:0.5rem"></i>AI Recommendation Summary</h3>'
      + '<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:1rem;color:#374151;line-height:1.7;font-size:0.875rem">' + (rec.summary||'') + '</div>'
      + '<div style="margin-top:1rem;display:flex;gap:0.75rem">'
      + '<button class="btn-primary" onclick="awardRfpContract(' + rfpId + ')"><i class="fas fa-handshake"></i>Award Contract</button>'
      + '<button class="btn-ghost" onclick="generateRfpRecommendation(' + rfpId + ')"><i class="fas fa-sync"></i>Regenerate</button>'
      + '</div></div>';
  }

  setContent('<div class="space-y-4">' + content + '</div>');
};

// ============================================================
// PAGE: VENDORS (global registry + performance)
// ============================================================
pages.vendors = async function() {
  var vendors, perf;
  try {
    [vendors, perf] = await Promise.all([
      apiCall('GET', '/vendors'),
      apiCall('GET', '/vendor-performance').catch(function() { return []; })
    ]);
  } catch(e) { vendors = []; perf = []; }

  var perfMap = {};
  (perf||[]).forEach(function(p) { perfMap[p.id] = p; });

  var rows = vendors.map(function(v) {
    var p = perfMap[v.id] || {};
    var avgScore = p.avg_score ? Math.round(p.avg_score) : 0;
    var grade = avgScore >= 75 ? 'perf-high' : avgScore >= 50 ? 'perf-mid' : 'perf-low';
    var tags = (v.specializations||'').split(',').filter(Boolean).slice(0,3)
      .map(function(s) { return '<span class="tag">' + escHtml(s.trim()) + '</span>'; }).join('');
    return '<tr>'
      + '<td><span style="font-weight:600">' + escHtml(v.name) + '</span><br><span style="font-size:0.75rem;color:#9ca3af">' + escHtml(v.category||'') + '</span></td>'
      + '<td>' + escHtml(v.country||'UAE') + '</td>'
      + '<td>' + escHtml(v.size||'—') + '</td>'
      + '<td>' + tags + '</td>'
      + '<td style="text-align:center">' + (p.rfps_shortlisted||0) + '</td>'
      + '<td style="text-align:center">' + (p.proposals_submitted||0) + '</td>'
      + '<td style="text-align:center"><span class="perf-badge ' + grade + '">' + (avgScore||'—') + (avgScore?'/100':'') + '</span></td>'
      + '<td style="text-align:center">' + (p.awards_won||0) + '</td>'
      + '</tr>';
  }).join('');

  setContent(
    '<div class="space-y-4">'
    + '<div style="display:flex;justify-content:space-between;align-items:center">'
    + '<div><h2 style="font-weight:700;color:#1f2937;font-size:1.05rem">Vendor Registry</h2>'
    + '<p style="font-size:0.82rem;color:#6b7280;margin:0">' + vendors.length + ' registered vendors</p></div>'
    + '</div>'
    + '<div class="card" style="overflow-x:auto">'
    + '<table><thead><tr>'
    + '<th>Vendor</th><th>Country</th><th>Size</th><th>Specializations</th>'
    + '<th style="text-align:center">RFPs Shortlisted</th><th style="text-align:center">Proposals</th>'
    + '<th style="text-align:center">Avg Score</th><th style="text-align:center">Awards</th>'
    + '</tr></thead><tbody>' + rows + '</tbody></table>'
    + '</div></div>'
  );
};

// ============================================================
// PAGE: REPORTS
// ============================================================
pages.reports = async function() {
  var perf, stats;
  try {
    [perf, stats] = await Promise.all([
      apiCall('GET', '/vendor-performance').catch(function() { return []; }),
      apiCall('GET', '/stats').catch(function() { return {}; })
    ]);
  } catch(e) { perf = []; stats = {}; }

  var topPerf = (perf||[]).filter(function(v) { return v.proposals_submitted > 0; });

  var perfRows = topPerf.length === 0
    ? '<tr><td colspan="6" style="text-align:center;color:#9ca3af;padding:2rem">Run evaluations to see performance data</td></tr>'
    : topPerf.map(function(v) {
        var avgScore = v.avg_score ? Math.round(v.avg_score) : 0;
        var grade = avgScore >= 75 ? 'perf-high' : avgScore >= 50 ? 'perf-mid' : 'perf-low';
        var convRate = v.rfps_shortlisted > 0 ? Math.round((v.proposals_submitted / v.rfps_shortlisted) * 100) + '%' : '—';
        return '<tr>'
          + '<td><strong>' + escHtml(v.name) + '</strong></td>'
          + '<td style="text-align:center">' + (v.rfps_shortlisted||0) + '</td>'
          + '<td style="text-align:center">' + (v.proposals_submitted||0) + '</td>'
          + '<td style="text-align:center"><span class="perf-badge ' + grade + '">' + (avgScore||'—') + (avgScore?'/100':'') + '</span></td>'
          + '<td style="text-align:center">' + (v.awards_won||0) + '</td>'
          + '<td style="text-align:center">' + convRate + '</td>'
          + '</tr>';
      }).join('');

  var summaryCards = [
    { label:'Total RFPs Issued',     value: stats.totalRfps||0,       icon:'fa-layer-group',  color:'#0f3460' },
    { label:'Contracts Awarded',     value: stats.awardedRfps||0,     icon:'fa-handshake',    color:'#065f46' },
    { label:'Overall Win Rate',      value: (stats.winRate||0)+'%',   icon:'fa-percent',      color:'#c9a84c' },
    { label:'Total Proposals',       value: stats.totalProposals||0,  icon:'fa-inbox',        color:'#0891b2' },
    { label:'Avg Cycle Duration',    value: stats.avgDuration ? stats.avgDuration+'d' : 'N/A', icon:'fa-clock', color:'#9ca3af' },
    { label:'Registered Vendors',    value: stats.totalVendors||0,    icon:'fa-building',     color:'#7c3aed' },
  ].map(function(k) {
    return '<div class="stat-card"><div class="stat-value" style="color:' + k.color + '">' + k.value + '</div>'
      + '<div class="stat-label"><i class="fas ' + k.icon + '" style="margin-right:4px;color:' + k.color + '"></i>' + k.label + '</div></div>';
  }).join('');

  setContent(
    '<div class="space-y-6">'
    + '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:0.875rem">' + summaryCards + '</div>'
    + '<div class="card" style="padding:1.25rem">'
    + '<h3 style="font-weight:700;color:#1f2937;margin-bottom:1rem;font-size:0.95rem"><i class="fas fa-chart-line cpc-gold" style="margin-right:0.5rem"></i>Vendor Performance Report</h3>'
    + '<div style="overflow-x:auto">'
    + '<table><thead><tr>'
    + '<th>Vendor</th><th style="text-align:center">Shortlisted</th><th style="text-align:center">Proposals</th>'
    + '<th style="text-align:center">Avg Score</th><th style="text-align:center">Awards Won</th><th style="text-align:center">Conversion</th>'
    + '</tr></thead><tbody>' + perfRows + '</tbody></table>'
    + '</div></div>'
    + '</div>'
  );
};

// ============================================================
// CREATE RFP MODAL
// ============================================================
function openCreateRfpModal() {
  showModal(
    '<div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:1.25rem">'
    + '<div style="width:40px;height:40px;border-radius:10px;background:var(--cpc-gold);display:flex;align-items:center;justify-content:center;flex-shrink:0">'
    + '<i class="fas fa-magic" style="color:var(--cpc-navy)"></i></div>'
    + '<div><h3 style="margin:0;font-size:1.1rem;font-weight:700">Create New RFP</h3>'
    + '<p style="margin:0;font-size:0.8rem;color:#6b7280">Describe in plain language — AI generates the full document</p>'
    + '</div></div>'
    + '<div class="form-group"><label>Project Title *</label>'
    + '<input id="newRfpTitle" placeholder="e.g. Oracle ERP System Implementation" autofocus></div>'
    + '<div class="form-group"><label>Category</label>'
    + '<select id="newRfpCategory">'
    + '<option>IT &amp; Digital Transformation</option><option>Consulting Services</option>'
    + '<option>Infrastructure</option><option>Professional Services</option>'
    + '<option>Construction</option><option>Healthcare</option>'
    + '</select></div>'
    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem">'
    + '<div class="form-group"><label>Budget (AED)</label><input id="newRfpBudget" placeholder="e.g. 5,000,000"></div>'
    + '<div class="form-group"><label>Deadline</label><input type="date" id="newRfpDeadline"></div>'
    + '</div>'
    + '<div class="form-group"><label>Background <span style="font-weight:400;color:#9ca3af">(describe the situation)</span></label>'
    + '<textarea id="newRfpBackground" rows="3" placeholder="e.g. CPC is currently operating on legacy Oracle EBS. We need to upgrade to Oracle Fusion Cloud to improve process efficiency..."></textarea></div>'
    + '<div class="form-group"><label>Objectives <span style="font-weight:400;color:#9ca3af">(what you want to achieve)</span></label>'
    + '<textarea id="newRfpObjectives" rows="2" placeholder="e.g. Migrate to cloud ERP, reduce manual processes, improve reporting..."></textarea></div>'
    + '<div class="form-group"><label>Scope of Work <span style="font-weight:400;color:#9ca3af">(key areas)</span></label>'
    + '<textarea id="newRfpScope" rows="2" placeholder="e.g. HR, Finance, Procurement modules, data migration, training..."></textarea></div>'
    + '<div style="display:flex;gap:0.75rem;margin-top:0.5rem">'
    + '<button class="btn-primary" style="flex:1" id="createRfpBtn" onclick="createRfp()"><i class="fas fa-magic"></i>Create RFP</button>'
    + '<button class="btn-ghost" onclick="closeModal()">Cancel</button>'
    + '</div>'
  );
}

async function createRfp() {
  var btn = document.getElementById('createRfpBtn');
  var title = document.getElementById('newRfpTitle').value.trim();
  if (!title) { showToast('Please enter a project title', 'error'); return; }

  setLoading(btn, true, 'Creating...');
  try {
    var data = {
      title:             title,
      category:          document.getElementById('newRfpCategory').value,
      budget:            document.getElementById('newRfpBudget').value,
      deadline:          document.getElementById('newRfpDeadline').value,
      background:        document.getElementById('newRfpBackground').value,
      objectives:        document.getElementById('newRfpObjectives').value,
      scope:             document.getElementById('newRfpScope').value,
      tech_requirements: '',
    };
    var rfp = await apiCall('POST', '/rfps', data);
    closeModal();
    showToast('RFP created! Now generate the document.', 'success');
    openRfp(rfp.id);
  } catch(e) {
    setLoading(btn, false, '<i class="fas fa-magic"></i>Create RFP');
  }
}

// ============================================================
// RFP ACTIONS
// ============================================================
async function generateRfpContent(rfpId) {
  var btn = document.getElementById('generateBtn');
  setLoading(btn, true, 'Generating...');
  try {
    var data = {
      title:             document.getElementById('rfpTitle').value,
      category:          document.getElementById('rfpCategory').value,
      budget:            document.getElementById('rfpBudget').value,
      deadline:          document.getElementById('rfpDeadline').value,
      background:        document.getElementById('rfpBackground').value,
      objectives:        document.getElementById('rfpObjectives').value,
      scope:             document.getElementById('rfpScope').value,
      tech_requirements: document.getElementById('rfpTech').value
    };
    var rfp = await apiCall('POST', '/rfps/' + rfpId + '/generate', data);
    var preview = document.getElementById('rfpPreview');
    if (preview) preview.innerHTML = rfp.content || '';
    showToast('RFP document generated!', 'success');
    // Reload tab to show download button
    rfpTabPages.generate(rfpId);
  } catch(e) {
    setLoading(btn, false, '<i class="fas fa-robot"></i>Generate with AI');
  }
}

async function saveRfpFields(rfpId) {
  try {
    var data = {
      title:             document.getElementById('rfpTitle').value,
      category:          document.getElementById('rfpCategory').value,
      budget:            document.getElementById('rfpBudget').value,
      deadline:          document.getElementById('rfpDeadline').value,
      background:        document.getElementById('rfpBackground').value,
      objectives:        document.getElementById('rfpObjectives').value,
      scope:             document.getElementById('rfpScope').value,
      tech_requirements: document.getElementById('rfpTech').value
    };
    await apiCall('PUT', '/rfps/' + rfpId, data);
    showToast('RFP fields saved!', 'success');
  } catch(e) {}
}

async function advanceRfpStage(rfpId, stage) {
  try {
    await apiCall('POST', '/rfps/' + rfpId + '/stage', { stage: stage });
    var labels = { published:'Published', qa_open:'Q&A Open', submissions_closed:'Submissions Closed', evaluation:'Evaluation', awarded:'Awarded' };
    showToast('Stage advanced to: ' + (labels[stage]||stage), 'success');
    // Refresh lifecycle bar
    var rfp = await apiCall('GET', '/rfps/' + rfpId);
    showLifecycleBar(rfp.stage, rfpId);
  } catch(e) {}
}

// ============================================================
// VENDOR ACTIONS
// ============================================================
async function toggleShortlist(rfpId, vendorId, shortlist) {
  await apiCall('PUT', '/rfps/' + rfpId + '/vendors/' + vendorId + '/shortlist', { shortlisted: shortlist });
  showToast(shortlist ? 'Vendor shortlisted!' : 'Removed from shortlist', 'success');
  rfpTabPages.vendors(rfpId);
}

async function aiShortlistRfp(rfpId) {
  showToast('Running AI shortlisting...', 'info');
  try {
    await apiCall('POST', '/rfps/' + rfpId + '/vendors/ai-shortlist', {});
    showToast('AI shortlisting complete!', 'success');
    rfpTabPages.vendors(rfpId);
  } catch(e) {}
}

async function sendRfpInvitations(rfpId) {
  var shortlisted = appState.vendors.filter(function(v) { return v.shortlisted; });
  if (shortlisted.length === 0) { showToast('Please shortlist vendors first', 'error'); return; }
  try {
    await apiCall('POST', '/rfps/' + rfpId + '/emails/send-invitations', {});
    showToast('Invitations sent to ' + shortlisted.length + ' vendors!', 'success');
    switchRfpTab(rfpId, 'emails');
  } catch(e) {}
}

// ============================================================
// Q&A ACTIONS
// ============================================================
async function draftQAnswer(rfpId, qId) {
  try {
    await apiCall('POST', '/rfps/' + rfpId + '/questions/' + qId + '/draft', {});
    showToast('AI answer drafted!', 'success');
    rfpTabPages.qa(rfpId);
  } catch(e) {}
}

async function draftAllQAnswers(rfpId) {
  showToast('AI drafting all answers...', 'info');
  try {
    await apiCall('POST', '/rfps/' + rfpId + '/questions/draft-all', {});
    showToast('All answers drafted!', 'success');
    rfpTabPages.qa(rfpId);
  } catch(e) {}
}

async function approveQAnswer(rfpId, qId) {
  try {
    await apiCall('PUT', '/rfps/' + rfpId + '/questions/' + qId + '/approve', {});
    showToast('Answer approved!', 'success');
    rfpTabPages.qa(rfpId);
  } catch(e) {}
}

async function publishAllQAnswers(rfpId) {
  try {
    await apiCall('POST', '/rfps/' + rfpId + '/questions/publish-all', {});
    showToast('All approved answers published!', 'success');
    rfpTabPages.qa(rfpId);
  } catch(e) {}
}

async function loadSampleQuestions(rfpId) {
  try {
    await apiCall('POST', '/rfps/' + rfpId + '/questions/load-samples', {});
    showToast('Sample questions loaded!', 'success');
    rfpTabPages.qa(rfpId);
  } catch(e) {}
}

// ============================================================
// PROPOSALS / EVAL / AWARD
// ============================================================
async function addSampleProposals(rfpId) {
  try {
    await apiCall('POST', '/rfps/' + rfpId + '/proposals/sample', {});
    showToast('Sample proposals added!', 'success');
    rfpTabPages.proposals(rfpId);
  } catch(e) {}
}

async function runRfpEvaluation(rfpId) {
  var btn = document.getElementById('runEvalBtn');
  if (btn) setLoading(btn, true, 'Running...');
  try {
    await apiCall('POST', '/rfps/' + rfpId + '/evaluations/run', {});
    showToast('AI evaluation complete!', 'success');
    rfpTabPages.evaluation(rfpId);
  } catch(e) {
    if (btn) setLoading(btn, false, '<i class="fas fa-robot"></i>Run AI Evaluation');
  }
}

async function generateRfpRecommendation(rfpId) {
  showToast('Generating recommendation...', 'info');
  try {
    await apiCall('POST', '/rfps/' + rfpId + '/recommendation/generate', {});
    showToast('Recommendation generated!', 'success');
    rfpTabPages.recommendation(rfpId);
  } catch(e) {}
}

async function awardRfpContract(rfpId) {
  try {
    await apiCall('POST', '/rfps/' + rfpId + '/stage', { stage: 'awarded' });
    showToast('Contract awarded successfully!', 'success');
    var rfp = await apiCall('GET', '/rfps/' + rfpId);
    showLifecycleBar(rfp.stage, rfpId);
    rfpTabPages.recommendation(rfpId);
  } catch(e) {}
}

// ============================================================
// VIEW HELPERS
// ============================================================
function viewProposal(id) {
  var p = appState.proposals.find(function(p) { return p.id === id; });
  if (!p) return;
  showModal(
    '<h3 style="font-size:1.1rem;font-weight:700;margin-bottom:1rem">Proposal — ' + escHtml(p.vendor_name||'Unknown') + '</h3>'
    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;font-size:0.875rem;margin-bottom:1rem">'
    + '<div><label>Technical Score</label><p style="font-size:1.5rem;font-weight:700;margin:0">' + (p.technical_score||'—') + '</p></div>'
    + '<div><label>Financial Proposal</label><p style="font-size:1.25rem;font-weight:700;margin:0">' + (p.financial_proposal ? 'AED ' + Number(p.financial_proposal).toLocaleString() : '—') + '</p></div>'
    + '</div>'
    + (p.technical_proposal ? '<div style="margin-bottom:1rem"><label>Technical Proposal</label><div style="background:#f9fafb;border-radius:8px;padding:0.75rem;font-size:0.82rem;max-height:200px;overflow-y:auto">' + escHtml(p.technical_proposal) + '</div></div>' : '')
    + '<button class="btn-ghost" style="width:100%;justify-content:center" onclick="closeModal()">Close</button>'
  );
}

// ============================================================
// PDF DOWNLOAD
// ============================================================
async function downloadRfpPdf(rfpId) {
  try {
    var rfp = await apiCall('GET', '/rfps/' + rfpId);
    if (!rfp.content) { showToast('Generate the RFP document first', 'error'); return; }
    showToast('Preparing PDF download...', 'info');

    // Use window.print approach with a hidden iframe for clean PDF output
    var printWindow = window.open('', '_blank', 'width=900,height=700');
    printWindow.document.write('<!DOCTYPE html><html><head>'
      + '<meta charset="UTF-8"><title>' + escHtml(rfp.title||'RFP') + '</title>'
      + '<style>'
      + 'body{font-family:Georgia,serif;color:#1a1a1a;margin:0;padding:20px}'
      + '.rfp-cover{text-align:center;padding:40px 30px;background:linear-gradient(135deg,#1a1a2e,#0f3460);color:white;margin-bottom:0}'
      + '.rfp-emblem{font-size:48px;margin-bottom:8px}'
      + '.rfp-org-name{font-size:20px;font-weight:700}'
      + '.rfp-org-arabic{font-size:16px;color:#e8c96e;margin:4px 0}'
      + '.rfp-org-sub{font-size:12px;color:#bfdbfe;margin-bottom:30px}'
      + '.rfp-doc-type{font-size:13px;font-weight:700;letter-spacing:0.15em;color:#e8c96e;text-transform:uppercase}'
      + '.rfp-doc-title{font-size:24px;font-weight:700;margin:12px 0;color:white}'
      + '.rfp-doc-subtitle{font-size:14px;color:#bfdbfe}'
      + '.rfp-doc-date{font-size:12px;color:#bfdbfe;margin-top:10px}'
      + '.rfp-meta-table{width:100%;border-collapse:collapse}'
      + '.rfp-meta-table th{background:#f0f4f8;color:#1a1a2e;padding:10px;font-size:12px;border:1px solid #d1d5db}'
      + '.rfp-meta-table td{background:white;padding:10px;font-size:13px;border:1px solid #d1d5db}'
      + '.rfp-toc{padding:20px;background:#f8f6f0;border-bottom:1px solid #e5e7eb}'
      + '.rfp-toc-item{display:flex;justify-content:space-between;padding:5px 0;font-size:13px;color:#0f3460;border-bottom:1px dotted #d1d5db}'
      + '.rfp-section{display:flex;gap:20px;padding:24px 20px;border-bottom:1px solid #e5e7eb;page-break-inside:avoid}'
      + '.rfp-section-num{width:36px;height:36px;border-radius:50%;background:#c9a84c;color:#1a1a2e;display:flex;align-items:center;justify-content:center;font-weight:700;flex-shrink:0}'
      + '.rfp-section-body{flex:1}'
      + '.rfp-section-title{font-size:15px;font-weight:700;color:#1a1a2e;margin-bottom:10px;font-family:Segoe UI,sans-serif}'
      + '.rfp-section p,.rfp-section li{font-size:13px;line-height:1.7}'
      + '.rfp-subsection-title{font-size:13px;font-weight:700;color:#0f3460;margin:12px 0 6px;border-left:3px solid #c9a84c;padding-left:8px}'
      + '.rfp-deliverables{background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:8px 12px;font-size:12px;color:#374151;margin-top:8px}'
      + '.rfp-spec-table{width:100%;border-collapse:collapse;margin:10px 0;font-size:12px}'
      + '.rfp-spec-table th{background:#1a1a2e;color:white;padding:8px;font-weight:600}'
      + '.rfp-spec-table td{padding:8px;border:1px solid #e5e7eb}'
      + '.rfp-spec-table tr:nth-child(even) td{background:#f9fafb}'
      + '.rfp-footer{background:#1a1a2e;color:white;padding:16px 20px;text-align:center;font-size:12px;line-height:1.8}'
      + '@media print{body{padding:0}}'
      + '</style></head><body>'
      + rfp.content
      + '</body></html>');
    printWindow.document.close();
    setTimeout(function() {
      printWindow.focus();
      printWindow.print();
    }, 800);
  } catch(e) {
    showToast('Failed to open PDF: ' + e.message, 'error');
  }
}

// ============================================================
// START
// ============================================================
async function init() {
  try { await apiCall('POST', '/init', {}); } catch(e) {}
  navigateTo('dashboard');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
