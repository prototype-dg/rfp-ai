// ============================================================
// CPC RFP TOOL - Multi-RFP Edition
// ============================================================
'use strict';
const API = '/api';

let appState = {
  currentPage: 'dashboard',
  currentRfpId: null,
  currentRfpTab: 'generate',
  rfps: [],
  vendors: [],
  rfpVendors: [],
  questions: [],
  proposals: [],
  evaluations: [],
  emails: [],
  currentRfp: null,
  previousPage: null,
  unreadQA: false,
};

// ============================================================
// UTILITIES
// ============================================================
function showToast(msg, type) {
  type = type || 'info';
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show ' + type;
  setTimeout(function() { t.className = 'toast'; }, 4000);
}

function showModal(html) {
  document.getElementById('modalContent').innerHTML = html;
  document.getElementById('modalOverlay').classList.add('open');
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
}

function setContent(html) {
  document.getElementById('pageContent').innerHTML = html;
}

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function scoreBar(val) {
  val = val || 0;
  return '<div class="score-bar"><div class="score-fill" style="width:' + val + '%"></div></div>';
}

function stageBadgeClass(stage) {
  const map = {
    draft: 'stage-draft',
    published: 'stage-published',
    qa_open: 'stage-qa_open',
    submissions_closed: 'stage-submissions_closed',
    evaluation: 'stage-evaluation',
    awarded: 'stage-awarded',
  };
  return map[stage] || 'stage-draft';
}

function stageLabelMap(stage) {
  const map = {
    draft: 'Draft',
    published: 'Published',
    qa_open: 'Q&A Open',
    submissions_closed: 'Closed',
    evaluation: 'Evaluation',
    awarded: 'Awarded',
  };
  return map[stage] || stage;
}

function setLoading(el, loading, text) {
  if (!el) return;
  if (loading) {
    el.disabled = true;
    el.dataset.originalText = el.innerHTML;
    el.innerHTML = '<span class="spinner" style="margin-right:6px"></span>' + (text || 'Processing...');
  } else {
    el.disabled = false;
    el.innerHTML = el.dataset.originalText || text || '';
  }
}

async function apiCall(method, path, data) {
  try {
    const opts = { method: method, headers: { 'Content-Type': 'application/json' } };
    if (data !== undefined) opts.body = JSON.stringify(data);
    const r = await fetch(API + path, opts);
    const json = await r.json();
    if (!r.ok) throw new Error(json.error || json.message || 'Request failed (' + r.status + ')');
    return json;
  } catch(e) {
    showToast(e.message, 'error');
    throw e;
  }
}

document.getElementById('headerDate').textContent = new Date().toLocaleDateString('en-AE', {
  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
});

document.getElementById('modalOverlay').addEventListener('click', function(e) {
  if (e.target.id === 'modalOverlay') closeModal();
});

// ============================================================
// NAVIGATION
// ============================================================
var pageTitles = {
  dashboard:  ['Dashboard', 'AI-Powered Procurement Overview'],
  rfps:       ['All RFPs', 'Manage Active & Historic Procurement'],
  vendors:    ['Vendor Registry', 'Global Vendor Pool & Performance'],
  reports:    ['Reports & Analytics', 'Cross-RFP Performance Metrics'],
};

document.getElementById('mainNav').addEventListener('click', function(e) {
  const link = e.target.closest('[data-page]');
  if (!link) return;
  e.preventDefault();
  navigateTo(link.dataset.page);
});

function navigateTo(page, opts) {
  opts = opts || {};
  appState.previousPage = appState.currentPage;
  appState.currentPage = page;
  appState.currentRfpId = opts.rfpId || null;
  appState.currentRfpTab = opts.tab || 'generate';

  // nav active state
  document.querySelectorAll('[data-page]').forEach(function(el) {
    el.classList.toggle('active', el.dataset.page === page);
  });

  // header title
  const info = pageTitles[page] || [page, ''];
  document.getElementById('pageTitle').textContent = opts.title || info[0];
  document.getElementById('pageSubtitle').textContent = opts.subtitle || info[1];

  // back button
  const backBtn = document.getElementById('backBtn');
  if (page === 'rfp_detail') {
    backBtn.style.display = 'inline-flex';
  } else {
    backBtn.style.display = 'none';
  }

  // hide lifecycle / tabs by default
  document.getElementById('lifecycleBar').style.display = 'none';
  document.getElementById('rfpTabsBar').style.display = 'none';

  setContent('<div style="display:flex;align-items:center;justify-content:center;height:160px"><div class="spinner" style="width:36px;height:36px;border-width:4px"></div></div>');

  const fn = pages[page];
  if (fn) fn(opts);
}

function goBack() {
  navigateTo('rfps');
}

// ============================================================
// LIFECYCLE BAR
// ============================================================
var STAGES = ['draft','published','qa_open','submissions_closed','evaluation','awarded'];
var STAGE_LABELS = ['Draft','Published','Q&A Open','Submissions\nClosed','Evaluation','Awarded'];
var STAGE_ICONS = ['fa-pencil-alt','fa-paper-plane','fa-comments','fa-lock','fa-star','fa-trophy'];
var STAGE_INFO = {
  draft: 'RFP is being prepared. Fill in details and generate the document.',
  published: 'RFP is live. Vendor invitations can be sent.',
  qa_open: 'Vendors can submit questions. Q&A management is active.',
  submissions_closed: 'Proposal submissions are closed. Evaluation phase begins.',
  evaluation: 'AI is scoring and ranking vendor proposals.',
  awarded: 'Contract has been awarded. Procurement is complete.',
};

function renderLifecycleBar(rfp) {
  const stage = rfp ? rfp.stage : 'draft';
  const idx = STAGES.indexOf(stage);
  let html = '';
  for (let i = 0; i < STAGES.length; i++) {
    const cls = i < idx ? 'lc-done' : (i === idx ? 'lc-active' : 'lc-pending');
    const icon = i < idx ? 'fa-check' : STAGE_ICONS[i];
    const labelLines = STAGE_LABELS[i].split('\n');
    html += '<div class="lc-step ' + cls + '">';
    html += '<div class="lc-node">';
    html += '<div class="lc-circle"><i class="fas ' + icon + '" style="font-size:0.72rem"></i></div>';
    html += '<div class="lc-label">' + labelLines.join('<br>') + '</div>';
    html += '</div>';
    if (i < STAGES.length - 1) html += '<div class="lc-connector"></div>';
    html += '</div>';
  }
  // info pill
  html += '<div class="lc-info-pill"><i class="fas fa-info-circle" style="margin-right:4px"></i>' + (STAGE_INFO[stage] || '') + '</div>';

  document.getElementById('lifecycleBar').innerHTML = '<div class="lifecycle-bar">' + html + '</div>';
  document.getElementById('lifecycleBar').style.display = 'block';
}

// ============================================================
// RFP TABS BAR
// ============================================================
var RFP_TABS = [
  { id: 'generate',    icon: 'fa-file-alt',      label: 'Generate' },
  { id: 'vendors',     icon: 'fa-building',       label: 'Vendors' },
  { id: 'emails',      icon: 'fa-envelope',       label: 'Invitations' },
  { id: 'qa',          icon: 'fa-comments',       label: 'Q&A' },
  { id: 'proposals',   icon: 'fa-inbox',          label: 'Proposals' },
  { id: 'scoring',     icon: 'fa-balance-scale',  label: 'Scoring Model' },
  { id: 'evaluation',  icon: 'fa-star-half-alt',  label: 'Evaluation' },
  { id: 'recommendation', icon: 'fa-trophy',      label: 'Recommendation' },
];

function renderRfpTabs(activeTab, rfpId, qaBadge) {
  let html = '<div class="rfp-tabs">';
  RFP_TABS.forEach(function(tab) {
    const isActive = tab.id === activeTab;
    const badge = (tab.id === 'qa' && qaBadge) ? '<span style="background:#ef4444;color:white;border-radius:10px;padding:1px 6px;font-size:0.68rem;margin-left:4px">!</span>' : '';
    html += '<div class="rfp-tab' + (isActive ? ' active' : '') + '" onclick="switchRfpTab(\'' + tab.id + '\',' + rfpId + ')">';
    html += '<i class="fas ' + tab.icon + '"></i>' + escHtml(tab.label) + badge;
    html += '</div>';
  });
  html += '</div>';
  document.getElementById('rfpTabsBar').innerHTML = html;
  document.getElementById('rfpTabsBar').style.display = 'block';
}

function switchRfpTab(tab, rfpId) {
  appState.currentRfpTab = tab;
  renderRfpTabs(tab, rfpId, appState.unreadQA);
  const rfp = appState.currentRfp;
  const tabFn = rfpTabs[tab];
  if (tabFn) {
    setContent('<div style="display:flex;align-items:center;justify-content:center;height:120px"><div class="spinner" style="width:32px;height:32px;border-width:3px"></div></div>');
    tabFn(rfpId, rfp);
  }
}

// ============================================================
// INIT
// ============================================================
async function init() {
  try { await apiCall('POST', '/init', {}); } catch(e) {}
  navigateTo('dashboard');
}

// ============================================================
// PAGE: DASHBOARD
// ============================================================
var pages = {};

pages.dashboard = async function() {
  let stats, perfData;
  try {
    [stats, perfData] = await Promise.all([
      apiCall('GET', '/stats'),
      apiCall('GET', '/vendor-performance').catch(function(){ return []; }),
    ]);
  } catch(e) {
    stats = { totalRfps:0, activeRfps:0, awardedRfps:0, winRate:0, totalVendors:0, totalProposals:0, totalEmails:0, avgDuration:null, stageBreakdown:[] };
    perfData = [];
  }

  const stageBreakdown = stats.stageBreakdown || [];
  const maxStage = stageBreakdown.reduce(function(m,s){ return Math.max(m, s.cnt); }, 1);

  // KPI cards
  const kpis = [
    { label:'Total RFPs',      value: stats.totalRfps || 0,      icon:'fa-layer-group',   color:'#0f3460', sub: (stats.activeRfps||0) + ' active' },
    { label:'Win Rate',        value: (stats.winRate||0) + '%',  icon:'fa-trophy',        color:'#c9a84c', sub: (stats.awardedRfps||0) + ' awarded' },
    { label:'Avg Duration',    value: stats.avgDuration ? stats.avgDuration + 'd' : 'N/A', icon:'fa-clock', color:'#065f46', sub: 'per RFP cycle' },
    { label:'Vendor Pool',     value: stats.totalVendors || 0,   icon:'fa-building',      color:'#7c3aed', sub: 'registered vendors' },
    { label:'Proposals',       value: stats.totalProposals || 0, icon:'fa-inbox',         color:'#dc6803', sub: 'total received' },
    { label:'Emails Sent',     value: stats.totalEmails || 0,    icon:'fa-envelope',      color:'#1d4ed8', sub: 'invitations & replies' },
  ];
  let kpiHtml = '';
  kpis.forEach(function(k) {
    kpiHtml += '<div class="stat-card">'
      + '<div style="display:flex;align-items:flex-start;justify-content:space-between">'
      + '<div style="width:40px;height:40px;border-radius:10px;background:' + k.color + '18;display:flex;align-items:center;justify-content:center">'
      + '<i class="fas ' + k.icon + '" style="color:' + k.color + ';font-size:1rem"></i></div>'
      + '<div style="text-align:right"><div class="stat-value" style="color:' + k.color + '">' + k.value + '</div></div>'
      + '</div>'
      + '<div class="stat-label">' + k.label + '</div>'
      + '<div style="font-size:0.72rem;color:#9ca3af;margin-top:2px">' + k.sub + '</div>'
      + '</div>';
  });

  // Stage breakdown mini chart
  let stageChart = '';
  if (stageBreakdown.length > 0) {
    stageBreakdown.forEach(function(s) {
      const h = Math.max(8, Math.round((s.cnt / maxStage) * 50));
      stageChart += '<div style="display:flex;flex-direction:column;align-items:center;gap:4px;flex:1">'
        + '<div style="font-size:0.7rem;font-weight:700;color:#374151">' + s.cnt + '</div>'
        + '<div class="mini-bar-item" style="height:' + h + 'px" title="' + stageLabelMap(s.stage) + ': ' + s.cnt + '"></div>'
        + '<div style="font-size:0.65rem;color:#9ca3af;text-align:center">' + stageLabelMap(s.stage) + '</div>'
        + '</div>';
    });
  } else {
    stageChart = '<div style="color:#9ca3af;font-size:0.85rem;padding:1rem">No RFP data yet</div>';
  }

  // Top vendor performance table (top 5)
  const topVendors = (perfData || []).slice(0, 5);
  let perfRows = '';
  topVendors.forEach(function(v) {
    const score = v.avg_score ? Math.round(v.avg_score) : 0;
    const perfCls = score >= 75 ? 'perf-high' : score >= 50 ? 'perf-mid' : 'perf-low';
    perfRows += '<tr>'
      + '<td style="font-weight:500">' + escHtml(v.name) + '</td>'
      + '<td style="text-align:center">' + (v.rfps_shortlisted||0) + '</td>'
      + '<td style="text-align:center">' + (v.proposals_submitted||0) + '</td>'
      + '<td><div style="display:flex;align-items:center;gap:8px"><span>' + score + '</span>' + scoreBar(score) + '</div></td>'
      + '<td style="text-align:center"><span class="perf-badge ' + perfCls + '">' + (v.awards_won||0) + ' won</span></td>'
      + '</tr>';
  });

  setContent(
    '<div style="display:flex;flex-direction:column;gap:1.25rem">'
    // KPI grid
    + '<div style="display:grid;grid-template-columns:repeat(6,1fr);gap:0.875rem">' + kpiHtml + '</div>'

    // Row 2: stage chart + quick actions
    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:1.25rem">'
    + '<div class="card" style="padding:1.25rem">'
    + '<h3 style="font-weight:700;color:#1f2937;font-size:0.9rem;margin:0 0 1rem"><i class="fas fa-chart-bar mr-2 cpc-gold"></i>RFP Stage Breakdown</h3>'
    + '<div class="mini-bar" style="align-items:flex-end;gap:8px">' + stageChart + '</div>'
    + '</div>'
    + '<div class="card" style="padding:1.25rem">'
    + '<h3 style="font-weight:700;color:#1f2937;font-size:0.9rem;margin:0 0 1rem"><i class="fas fa-bolt mr-2 cpc-gold"></i>Quick Actions</h3>'
    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem">'
    + '<button class="btn-primary" style="flex-direction:column;padding:0.875rem;justify-content:center" onclick="showCreateRfpModal()">'
    + '<i class="fas fa-plus-circle" style="font-size:1.25rem;margin-bottom:4px"></i><span style="font-size:0.8rem">New RFP</span></button>'
    + '<button class="btn-secondary" style="flex-direction:column;padding:0.875rem;justify-content:center" onclick="navigateTo(\'rfps\')">'
    + '<i class="fas fa-layer-group" style="font-size:1.25rem;margin-bottom:4px"></i><span style="font-size:0.8rem">All RFPs</span></button>'
    + '<button class="btn-ghost" style="flex-direction:column;padding:0.875rem;justify-content:center" onclick="navigateTo(\'vendors\')">'
    + '<i class="fas fa-building" style="font-size:1.25rem;margin-bottom:4px"></i><span style="font-size:0.8rem">Vendors</span></button>'
    + '<button class="btn-ghost" style="flex-direction:column;padding:0.875rem;justify-content:center" onclick="navigateTo(\'reports\')">'
    + '<i class="fas fa-chart-line" style="font-size:1.25rem;margin-bottom:4px"></i><span style="font-size:0.8rem">Reports</span></button>'
    + '</div></div>'
    + '</div>'

    // Vendor performance table
    + '<div class="card">'
    + '<div style="padding:1rem 1.25rem;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;justify-content:space-between">'
    + '<h3 style="font-weight:700;color:#1f2937;font-size:0.9rem;margin:0"><i class="fas fa-star mr-2 cpc-gold"></i>Top Vendor Performance</h3>'
    + '<button class="btn-ghost btn-sm" onclick="navigateTo(\'reports\')">Full Report <i class="fas fa-arrow-right" style="margin-left:4px"></i></button>'
    + '</div>'
    + (perfRows ? '<div style="overflow-x:auto"><table><thead><tr><th>Vendor</th><th style="text-align:center">Shortlisted</th><th style="text-align:center">Proposals</th><th>Avg Score</th><th style="text-align:center">Awards</th></tr></thead><tbody>' + perfRows + '</tbody></table></div>'
      : '<div style="padding:2rem;text-align:center;color:#9ca3af">No vendor performance data yet</div>')
    + '</div>'
    + '</div>'
  );
};

// ============================================================
// PAGE: ALL RFPs
// ============================================================
pages.rfps = async function() {
  const rfps = await apiCall('GET', '/rfps').catch(function(){ return []; });
  appState.rfps = rfps;

  if (rfps.length === 0) {
    setContent(
      '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:400px;gap:1.25rem">'
      + '<div style="width:80px;height:80px;border-radius:50%;background:#f3f4f6;display:flex;align-items:center;justify-content:center">'
      + '<i class="fas fa-file-circle-plus" style="font-size:2rem;color:#d1d5db"></i></div>'
      + '<div style="text-align:center"><h2 style="font-size:1.25rem;font-weight:700;color:#374151;margin:0 0 0.5rem">No RFPs Yet</h2>'
      + '<p style="color:#9ca3af;margin:0">Create your first RFP to start the procurement process</p></div>'
      + '<button class="btn-primary" onclick="showCreateRfpModal()"><i class="fas fa-plus"></i>Create New RFP</button>'
      + '</div>'
    );
    return;
  }

  let cardsHtml = '';
  rfps.forEach(function(rfp) {
    const stage = rfp.stage || 'draft';
    const badgeCls = stageBadgeClass(stage);
    const stageLabel = stageLabelMap(stage);
    const stageIdx = STAGES.indexOf(stage);
    const progress = Math.round(((stageIdx + 1) / STAGES.length) * 100);
    const dateStr = rfp.created_at ? new Date(rfp.created_at).toLocaleDateString('en-AE', {year:'numeric',month:'short',day:'numeric'}) : '-';

    cardsHtml += '<div class="rfp-card" onclick="openRfp(' + rfp.id + ')">'
      + '<div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:0.75rem">'
      + '<div style="flex:1;min-width:0">'
      + '<div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.3rem">'
      + '<span style="font-size:0.72rem;color:#9ca3af;font-family:monospace">' + escHtml(rfp.ref_number||'') + '</span>'
      + '<span class="stage-badge ' + badgeCls + '">' + stageLabel + '</span>'
      + '</div>'
      + '<h3 style="font-weight:700;color:#1f2937;font-size:0.97rem;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + escHtml(rfp.title||'Untitled RFP') + '</h3>'
      + '<p style="color:#6b7280;font-size:0.8rem;margin:0.2rem 0 0">' + escHtml(rfp.category||'') + ' &bull; Created ' + dateStr + '</p>'
      + '</div>'
      + '<div style="margin-left:1rem;text-align:right;flex-shrink:0">'
      + '<div style="font-size:1.5rem;font-weight:700;color:var(--cpc-blue)">' + progress + '%</div>'
      + '<div style="font-size:0.7rem;color:#9ca3af">Complete</div>'
      + '</div>'
      + '</div>'
      + '<div style="margin-bottom:0.5rem">'
      + '<div style="height:4px;border-radius:2px;background:#e5e7eb;overflow:hidden">'
      + '<div style="height:100%;background:linear-gradient(90deg,var(--cpc-blue),var(--cpc-gold));width:' + progress + '%;border-radius:2px;transition:width 0.5s"></div>'
      + '</div></div>'
      + '<div style="display:flex;align-items:center;justify-content:space-between">'
      + '<div style="font-size:0.78rem;color:#9ca3af">'
      + (rfp.deadline ? '<i class="fas fa-calendar-alt" style="margin-right:4px"></i>Deadline: ' + new Date(rfp.deadline).toLocaleDateString('en-AE') : '<i class="fas fa-infinity" style="margin-right:4px"></i>No deadline set')
      + '</div>'
      + '<div style="font-size:0.78rem;color:var(--cpc-blue);font-weight:600">Open <i class="fas fa-arrow-right" style="margin-left:4px"></i></div>'
      + '</div>'
      + '</div>';
  });

  setContent(
    '<div style="display:flex;flex-direction:column;gap:1.25rem">'
    + '<div style="display:flex;align-items:center;justify-content:space-between">'
    + '<div><h2 style="font-weight:700;color:#1f2937;font-size:1rem;margin:0">Active Procurements</h2>'
    + '<p style="color:#9ca3af;font-size:0.82rem;margin:0">' + rfps.length + ' RFP' + (rfps.length !== 1 ? 's' : '') + ' in pipeline</p></div>'
    + '<button class="btn-primary" onclick="showCreateRfpModal()"><i class="fas fa-plus"></i>New RFP</button>'
    + '</div>'
    + '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:1rem">' + cardsHtml + '</div>'
    + '</div>'
  );
};

function openRfp(rfpId) {
  navigateTo('rfp_detail', { rfpId: rfpId });
}

// ============================================================
// PAGE: RFP DETAIL
// ============================================================
pages.rfp_detail = async function(opts) {
  const rfpId = opts.rfpId;
  let rfp;
  try {
    rfp = await apiCall('GET', '/rfps/' + rfpId);
  } catch(e) {
    setContent('<div style="padding:2rem;text-align:center;color:#9ca3af">Failed to load RFP</div>');
    return;
  }
  appState.currentRfp = rfp;
  appState.currentRfpId = rfpId;

  document.getElementById('pageTitle').textContent = rfp.title || 'RFP Detail';
  document.getElementById('pageSubtitle').textContent = (rfp.ref_number||'') + ' \u2022 ' + stageLabelMap(rfp.stage||'draft');

  renderLifecycleBar(rfp);
  renderRfpTabs(opts.tab || appState.currentRfpTab, rfpId, appState.unreadQA);

  const tab = opts.tab || appState.currentRfpTab;
  const tabFn = rfpTabs[tab];
  if (tabFn) tabFn(rfpId, rfp);
};

// ============================================================
// RFP TABS
// ============================================================
var rfpTabs = {};

// --- TAB: GENERATE ---
rfpTabs.generate = function(rfpId, rfp) {
  const titleVal = (rfp && rfp.title) || '';
  const catVal = (rfp && rfp.category) || 'IT & Digital Transformation';
  const budgetVal = (rfp && rfp.budget) || '';
  const deadlineVal = (rfp && rfp.deadline) || '';
  const scopeVal = (rfp && rfp.scope) || '';
  const techVal = (rfp && rfp.tech_requirements) || '';
  const objVal = (rfp && rfp.objectives) || '';
  const bgVal = (rfp && rfp.background) || '';
  const hasContent = rfp && rfp.content;

  const previewHtml = hasContent
    ? rfp.content
    : '<div style="text-align:center;padding:3rem 1.5rem;color:#9ca3af">'
      + '<i class="fas fa-file-alt" style="font-size:2.5rem;display:block;margin-bottom:1rem;color:#d1d5db"></i>'
      + '<p style="margin:0">Fill in the details and click <strong>Generate with AI</strong> to produce a professional RFP document</p>'
      + '</div>';

  setContent(
    '<div style="display:grid;grid-template-columns:420px 1fr;gap:1.25rem;height:calc(100vh - 240px)">'
    // LEFT: form
    + '<div class="card" style="padding:1.25rem;overflow-y:auto;display:flex;flex-direction:column;gap:0.875rem">'
    + '<h3 style="font-weight:700;color:#1f2937;font-size:0.9rem;margin:0"><i class="fas fa-magic cpc-gold" style="margin-right:6px"></i>RFP Parameters</h3>'
    + '<div class="form-group"><label>Project Title *</label><input id="rfpTitle" placeholder="e.g. New Oracle ERP Setup, Data Warehouse and Data Visualization" value="' + escHtml(titleVal) + '"></div>'
    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem">'
    + '<div class="form-group"><label>Category</label><select id="rfpCategory">'
    + ['IT & Digital Transformation','Consulting Services','Infrastructure','Professional Services','Data & Analytics'].map(function(c){ return '<option value="' + c + '"' + (catVal===c?' selected':'') + '>' + c + '</option>'; }).join('')
    + '</select></div>'
    + '<div class="form-group"><label>Budget (AED)</label><input id="rfpBudget" placeholder="e.g. 5,000,000" value="' + escHtml(budgetVal) + '"></div>'
    + '</div>'
    + '<div class="form-group"><label>Submission Deadline</label><input type="date" id="rfpDeadline" value="' + escHtml(deadlineVal) + '"></div>'
    + '<div class="form-group"><label>Project Background</label><textarea id="rfpBackground" rows="3" placeholder="Describe the current situation and drivers...">' + escHtml(bgVal) + '</textarea></div>'
    + '<div class="form-group"><label>Objectives</label><textarea id="rfpObjectives" rows="3" placeholder="List the key objectives by phase...">' + escHtml(objVal) + '</textarea></div>'
    + '<div class="form-group"><label>Scope of Work</label><textarea id="rfpScope" rows="4" placeholder="Detail the work to be performed...">' + escHtml(scopeVal) + '</textarea></div>'
    + '<div class="form-group"><label>Technical Requirements</label><textarea id="rfpTech" rows="3" placeholder="Infrastructure, security, compliance specs...">' + escHtml(techVal) + '</textarea></div>'
    + '<div style="display:flex;gap:0.5rem;padding-top:0.25rem">'
    + '<button class="btn-primary" id="genBtn" style="flex:1" onclick="generateRfpDoc(' + rfpId + ')"><i class="fas fa-robot"></i>Generate with AI</button>'
    + '<button class="btn-secondary" onclick="saveRfpFields(' + rfpId + ')"><i class="fas fa-save"></i>Save</button>'
    + '</div>'
    + (hasContent
      ? '<div style="display:flex;gap:0.5rem">'
        + '<button class="btn-ghost" style="flex:1" onclick="downloadRfpPdf(' + rfpId + ')"><i class="fas fa-file-pdf"></i>Download PDF</button>'
        + advanceStageButton(rfp)
        + '</div>'
      : '')
    + '</div>'
    // RIGHT: preview
    + '<div class="card" style="overflow-y:auto;padding:0">'
    + '<div style="padding:0.875rem 1.25rem;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;justify-content:space-between;background:#f9fafb">'
    + '<span style="font-weight:600;color:#374151;font-size:0.88rem"><i class="fas fa-eye cpc-gold" style="margin-right:6px"></i>RFP Preview</span>'
    + (hasContent ? '<button class="btn-ghost btn-sm" onclick="downloadRfpPdf(' + rfpId + ')"><i class="fas fa-download"></i>PDF</button>' : '')
    + '</div>'
    + '<div id="rfpPreviewArea" style="padding:0">' + previewHtml + '</div>'
    + '</div>'
    + '</div>'
  );
};

function advanceStageButton(rfp) {
  const stage = rfp ? rfp.stage : 'draft';
  const id = rfp ? rfp.id : '';
  if (stage === 'draft') return '<button class="btn-primary" style="flex:1" onclick="advanceRfpStage(' + id + ',\'published\')"><i class="fas fa-paper-plane"></i>Publish RFP</button>';
  return '';
}

async function generateRfpDoc(rfpId) {
  const btn = document.getElementById('genBtn');
  setLoading(btn, true, 'Generating...');
  try {
    const data = {
      title: document.getElementById('rfpTitle').value,
      category: document.getElementById('rfpCategory').value,
      budget: document.getElementById('rfpBudget').value,
      deadline: document.getElementById('rfpDeadline').value,
      scope: document.getElementById('rfpScope').value,
      tech_requirements: document.getElementById('rfpTech').value,
      objectives: document.getElementById('rfpObjectives').value,
      background: document.getElementById('rfpBackground').value,
    };
    const result = await apiCall('POST', '/rfps/' + rfpId + '/generate', data);
    appState.currentRfp = result;
    document.getElementById('pageSubtitle').textContent = (result.ref_number||'') + ' \u2022 ' + stageLabelMap(result.stage||'draft');
    document.getElementById('rfpPreviewArea').innerHTML = result.content || '';
    showToast('RFP document generated!', 'success');
    // refresh tab buttons
    renderRfpTabs('generate', rfpId, appState.unreadQA);
  } catch(e) {
    // error shown by apiCall
  } finally {
    setLoading(btn, false);
  }
}

async function saveRfpFields(rfpId) {
  const data = {
    title: document.getElementById('rfpTitle').value,
    category: document.getElementById('rfpCategory').value,
    budget: document.getElementById('rfpBudget').value,
    deadline: document.getElementById('rfpDeadline').value,
    scope: document.getElementById('rfpScope').value,
    tech_requirements: document.getElementById('rfpTech').value,
    objectives: document.getElementById('rfpObjectives').value,
    background: document.getElementById('rfpBackground').value,
  };
  await apiCall('PUT', '/rfps/' + rfpId, data);
  showToast('RFP saved!', 'success');
}

async function advanceRfpStage(rfpId, stage) {
  await apiCall('POST', '/rfps/' + rfpId + '/stage', { stage: stage });
  showToast('Stage advanced to: ' + stageLabelMap(stage), 'success');
  // reload RFP detail
  const rfp = await apiCall('GET', '/rfps/' + rfpId);
  appState.currentRfp = rfp;
  document.getElementById('pageSubtitle').textContent = (rfp.ref_number||'') + ' \u2022 ' + stageLabelMap(rfp.stage||'draft');
  renderLifecycleBar(rfp);
  renderRfpTabs(appState.currentRfpTab, rfpId, appState.unreadQA);
  switchRfpTab(appState.currentRfpTab, rfpId);
}

function downloadRfpPdf(rfpId) {
  const rfp = appState.currentRfp;
  if (!rfp || !rfp.content) {
    showToast('Please generate the RFP document first', 'error');
    return;
  }
  // Use browser print-to-PDF
  const printWin = window.open('', '_blank', 'width=900,height=700');
  if (!printWin) { showToast('Please allow popups for PDF download', 'error'); return; }
  printWin.document.write('<html><head><title>' + escHtml(rfp.title||'RFP') + '</title>');
  printWin.document.write('<style>');
  printWin.document.write('body{font-family:Georgia,serif;margin:0;padding:0;background:white;color:#1a1a1a}');
  printWin.document.write(':root{--cpc-navy:#1a1a2e;--cpc-blue:#0f3460;--cpc-gold:#c9a84c;--cpc-gold-light:#e8c96e}');
  // copy all stylesheet text
  const allStyles = Array.from(document.styleSheets).map(function(ss) {
    try { return Array.from(ss.cssRules).map(function(r){ return r.cssText; }).join('\n'); }
    catch(e){ return ''; }
  }).join('\n');
  printWin.document.write(allStyles);
  printWin.document.write('</style></head><body>');
  printWin.document.write(rfp.content);
  printWin.document.write('</body></html>');
  printWin.document.close();
  setTimeout(function() { printWin.print(); }, 600);
}

// --- TAB: VENDORS ---
rfpTabs.vendors = async function(rfpId, rfp) {
  const vendors = await apiCall('GET', '/rfps/' + rfpId + '/vendors').catch(function(){ return []; });
  appState.rfpVendors = vendors;

  const shortlisted = vendors.filter(function(v){ return v.shortlisted; }).length;

  let rows = '';
  vendors.forEach(function(v) {
    const score = v.rfp_fit_score || v.fit_score || 0;
    const fitCls = score >= 75 ? 'perf-high' : score >= 50 ? 'perf-mid' : 'perf-low';
    const tags = (v.specializations||'').split(',').filter(Boolean).slice(0,3)
      .map(function(s){ return '<span class="tag">' + escHtml(s.trim()) + '</span>'; }).join('');
    const isShortlisted = v.shortlisted;
    rows += '<tr>'
      + '<td><div style="display:flex;align-items:center;gap:0.75rem">'
      + '<div style="width:34px;height:34px;border-radius:8px;background:var(--cpc-blue);display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:0.82rem;flex-shrink:0">' + escHtml(v.name.charAt(0)) + '</div>'
      + '<div><div style="font-weight:600;font-size:0.875rem">' + escHtml(v.name) + '</div>'
      + '<div style="font-size:0.72rem;color:#9ca3af">' + escHtml(v.country||'UAE') + ' &bull; ' + escHtml(v.size||'') + '</div>'
      + '</div></div></td>'
      + '<td><div>' + tags + '</div></td>'
      + '<td><div style="display:flex;align-items:center;gap:8px;min-width:100px"><span class="perf-badge ' + fitCls + '">' + score + '/100</span></div>'
      + (v.rfp_fit_rationale ? '<div style="font-size:0.72rem;color:#6b7280;margin-top:2px;max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="' + escHtml(v.rfp_fit_rationale||'') + '">' + escHtml((v.rfp_fit_rationale||'').substring(0,60)) + '...</div>' : '')
      + '</td>'
      + '<td style="text-align:center">'
      + (isShortlisted
        ? '<button class="btn-danger btn-sm" onclick="toggleVendorShortlist(' + rfpId + ',' + v.id + ',false)"><i class="fas fa-minus"></i>Remove</button>'
        : '<button class="btn-secondary btn-sm" onclick="toggleVendorShortlist(' + rfpId + ',' + v.id + ',true)"><i class="fas fa-plus"></i>Add</button>')
      + '</td>'
      + '<td><button class="btn-ghost btn-sm" onclick="viewVendorDetail(' + v.id + ')"><i class="fas fa-eye"></i></button></td>'
      + '</tr>';
  });

  setContent(
    '<div class="space-y-4">'
    + '<div style="display:flex;align-items:center;justify-content:space-between">'
    + '<div>'
    + '<h3 style="font-weight:700;font-size:0.95rem;color:#1f2937;margin:0">Vendor Selection for this RFP</h3>'
    + '<p style="font-size:0.8rem;color:#9ca3af;margin:0">' + vendors.length + ' vendors in pool &bull; ' + shortlisted + ' shortlisted</p>'
    + '</div>'
    + '<div style="display:flex;gap:0.5rem">'
    + '<button class="btn-secondary" id="aiShortlistBtn" onclick="aiShortlistVendors(' + rfpId + ')"><i class="fas fa-robot"></i>AI Suggested Vendors</button>'
    + '<button class="btn-primary" onclick="sendRfpInvitations(' + rfpId + ')"><i class="fas fa-paper-plane"></i>Send Invitations</button>'
    + '</div>'
    + '</div>'
    + '<div class="card"><div style="overflow-x:auto"><table>'
    + '<thead><tr><th>Vendor</th><th>Specializations</th><th>AI Fit Score</th><th style="text-align:center">Shortlist</th><th></th></tr></thead>'
    + '<tbody>' + rows + '</tbody>'
    + '</table></div></div>'
    + '</div>'
  );
};

async function toggleVendorShortlist(rfpId, vendorId, val) {
  await apiCall('PUT', '/rfps/' + rfpId + '/vendors/' + vendorId + '/shortlist', { shortlisted: val });
  showToast(val ? 'Vendor shortlisted!' : 'Removed from shortlist', 'success');
  rfpTabs.vendors(rfpId, appState.currentRfp);
}

async function aiShortlistVendors(rfpId) {
  const btn = document.getElementById('aiShortlistBtn');
  setLoading(btn, true, 'Scoring...');
  try {
    await apiCall('POST', '/rfps/' + rfpId + '/vendors/ai-shortlist', {});
    showToast('AI shortlisting complete! Qualified vendors are now highlighted.', 'success');
    rfpTabs.vendors(rfpId, appState.currentRfp);
  } catch(e) {
    setLoading(btn, false);
  }
}

async function sendRfpInvitations(rfpId) {
  const shortlisted = appState.rfpVendors.filter(function(v){ return v.shortlisted; });
  if (shortlisted.length === 0) { showToast('Please shortlist vendors first', 'error'); return; }
  const rfp = appState.currentRfp;
  if (!rfp || !rfp.content) {
    if (!confirm('No RFP document generated. Send invitation without PDF attachment?')) return;
  }
  // Collect real email for Andersen
  const andersen = shortlisted.find(function(v){ return v.contact_email && v.contact_email.includes('andersenlab.com'); });
  showModal(
    '<h3 style="font-size:1rem;font-weight:700;margin-bottom:1rem"><i class="fas fa-paper-plane cpc-gold mr-2"></i>Send RFP Invitations</h3>'
    + '<p style="color:#6b7280;font-size:0.875rem;margin-bottom:1rem">Sending to <strong>' + shortlisted.length + '</strong> shortlisted vendors. '
    + (andersen ? 'A <strong>real email</strong> will be sent to ' + escHtml(andersen.contact_email) + '. All others are simulated.' : 'All emails will be simulated.')
    + '</p>'
    + '<div class="form-group"><label>Questions Deadline</label><input type="date" id="invQDeadline" value="' + getDateOffset(14) + '"></div>'
    + '<div class="form-group"><label>Submission Deadline</label><input type="date" id="invSDeadline" value="' + (rfp && rfp.deadline ? rfp.deadline : getDateOffset(30)) + '"></div>'
    + '<div class="form-group"><label>Additional Notes</label><textarea id="invNotes" rows="2" placeholder="Any special instructions for vendors..."></textarea></div>'
    + '<div style="display:flex;gap:0.75rem;margin-top:1rem">'
    + '<button class="btn-primary" id="sendInvBtn" onclick="confirmSendInvitations(' + rfpId + ')"><i class="fas fa-send"></i>Send Invitations + PDF</button>'
    + '<button class="btn-ghost" onclick="closeModal()">Cancel</button>'
    + '</div>'
  );
}

function getDateOffset(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

async function confirmSendInvitations(rfpId) {
  const btn = document.getElementById('sendInvBtn');
  setLoading(btn, true, 'Sending...');
  try {
    const qDeadline = document.getElementById('invQDeadline').value;
    const sDeadline = document.getElementById('invSDeadline').value;
    const notes = document.getElementById('invNotes').value;
    await apiCall('POST', '/rfps/' + rfpId + '/emails/send-invitations', {
      questions_deadline: qDeadline,
      submission_deadline: sDeadline,
      notes: notes,
    });
    showToast('Invitations sent! Check the Invitations tab.', 'success');
    closeModal();
    switchRfpTab('emails', rfpId);
  } catch(e) {
    setLoading(btn, false);
  }
}

// --- TAB: EMAILS ---
rfpTabs.emails = async function(rfpId) {
  const emails = await apiCall('GET', '/rfps/' + rfpId + '/emails').catch(function(){ return []; });
  appState.emails = emails;

  let rows = '';
  emails.forEach(function(e) {
    const statusHtml = e.status === 'sent'
      ? '<span style="color:#065f46;font-weight:500"><i class="fas fa-check-circle mr-1"></i>Sent</span>'
      : e.status === 'simulated'
      ? '<span style="color:#1d4ed8;font-weight:500"><i class="fas fa-flask mr-1"></i>Simulated</span>'
      : e.status === 'received'
      ? '<span style="color:#7c3aed;font-weight:500"><i class="fas fa-inbox mr-1"></i>Received</span>'
      : '<span style="color:#6b7280">' + escHtml(e.status) + '</span>';
    const dateStr = e.created_at ? new Date(e.created_at).toLocaleString() : '-';
    const hasPdf = e.has_pdf ? '<i class="fas fa-paperclip" title="PDF attached" style="color:var(--cpc-gold);margin-left:4px"></i>' : '';
    rows += '<tr>'
      + '<td style="font-weight:500">' + escHtml(e.vendor_name||e.recipient||'') + '</td>'
      + '<td>' + escHtml(e.subject||'') + hasPdf + '</td>'
      + '<td><span class="tag">' + escHtml(e.email_type||'') + '</span></td>'
      + '<td>' + statusHtml + '</td>'
      + '<td style="font-size:0.8rem;color:#6b7280">' + dateStr + '</td>'
      + '</tr>';
  });

  setContent(
    '<div class="space-y-4">'
    + '<div style="display:flex;align-items:center;justify-content:space-between">'
    + '<div><h3 style="font-weight:700;font-size:0.95rem;color:#1f2937;margin:0">Email Correspondence</h3>'
    + '<p style="font-size:0.8rem;color:#9ca3af;margin:0">' + emails.length + ' messages</p></div>'
    + '<button class="btn-secondary" onclick="checkInboxForQA(' + rfpId + ')"><i class="fas fa-sync"></i>Check Inbox for Replies</button>'
    + '</div>'
    + '<div class="card">'
    + (emails.length === 0
      ? '<div style="padding:3rem;text-align:center;color:#9ca3af"><i class="fas fa-envelope-open-text" style="font-size:2.5rem;display:block;margin-bottom:1rem;color:#d1d5db"></i><p>No emails yet. Send invitations from the Vendors tab.</p></div>'
      : '<div style="overflow-x:auto"><table><thead><tr><th>To/From</th><th>Subject</th><th>Type</th><th>Status</th><th>Date</th></tr></thead><tbody>' + rows + '</tbody></table></div>')
    + '</div>'
    + '</div>'
  );
};

async function checkInboxForQA(rfpId) {
  showToast('Checking inbox for vendor replies...', 'info');
  try {
    const result = await apiCall('POST', '/rfps/' + rfpId + '/emails/check-inbox', {});
    if (result.newQuestions > 0) {
      appState.unreadQA = true;
      renderRfpTabs(appState.currentRfpTab, rfpId, true);
      showToast(result.newQuestions + ' new vendor question(s) loaded! Check Q&A tab.', 'success');
    } else {
      showToast('No new vendor replies found.', 'info');
    }
    rfpTabs.emails(rfpId);
  } catch(e) {}
}

// --- TAB: Q&A ---
rfpTabs.qa = async function(rfpId) {
  appState.unreadQA = false;
  renderRfpTabs('qa', rfpId, false);

  const questions = await apiCall('GET', '/rfps/' + rfpId + '/questions').catch(function(){ return []; });
  appState.questions = questions;

  const pending   = questions.filter(function(q){ return !q.published && !q.answer; }).length;
  const answered  = questions.filter(function(q){ return q.answer && !q.published; }).length;
  const published = questions.filter(function(q){ return q.published; }).length;

  let qCards = '';
  if (questions.length === 0) {
    qCards = '<div class="card" style="padding:2.5rem;text-align:center;color:#9ca3af">'
      + '<i class="fas fa-comments" style="font-size:2.5rem;display:block;margin-bottom:1rem;color:#d1d5db"></i>'
      + '<p style="margin-bottom:1rem">No questions yet. Load sample questions or check inbox for vendor replies.</p>'
      + '<button class="btn-secondary" onclick="loadSampleQs(' + rfpId + ')">Load Sample Questions</button>'
      + '</div>';
  } else {
    questions.forEach(function(q) {
      const badgeHtml = q.published
        ? '<span class="stage-badge stage-published">Published</span>'
        : q.answer
        ? '<span class="stage-badge stage-submissions_closed">Awaiting Approval</span>'
        : '<span class="stage-badge stage-draft">Unanswered</span>';

      const answerBlock = q.answer
        ? '<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:0.75rem;margin-top:0.75rem">'
          + '<div style="font-size:0.72rem;font-weight:700;color:#92400e;margin-bottom:4px"><i class="fas fa-robot mr-1"></i>AI Draft Answer</div>'
          + '<p style="font-size:0.875rem;color:#374151;margin:0">' + escHtml(q.answer) + '</p>'
          + '</div>'
        : '';

      const isFromEmail = q.source === 'email';
      const btns = (!q.answer
        ? '<button class="btn-secondary btn-sm" onclick="draftOneAnswer(' + rfpId + ',' + q.id + ')"><i class="fas fa-robot"></i>AI Draft</button>'
        : '') + (q.answer && !q.published
        ? '<button class="btn-primary btn-sm" onclick="approveQAnswer(' + rfpId + ',' + q.id + ')"><i class="fas fa-check"></i>Approve & Send</button>'
          + '<button class="btn-ghost btn-sm" onclick="editQAnswer(' + q.id + ')"><i class="fas fa-edit"></i>Edit</button>'
        : '');

      qCards += '<div class="card" style="padding:1rem" id="q-' + q.id + '">'
        + '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:1rem">'
        + '<div style="flex:1">'
        + '<div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.5rem">'
        + '<span style="font-size:0.72rem;font-weight:600;color:#9ca3af">Q' + q.id + ' &bull; ' + escHtml(q.vendor_name||'Anonymous') + '</span>'
        + badgeHtml
        + (isFromEmail ? '<span class="tag" style="background:#ede9fe;color:#6d28d9"><i class="fas fa-envelope mr-1"></i>Via Email</span>' : '')
        + '</div>'
        + '<p style="font-weight:500;color:#1f2937;margin:0">' + escHtml(q.question) + '</p>'
        + answerBlock
        + '</div>'
        + '<div style="display:flex;flex-direction:column;gap:0.4rem;flex-shrink:0">' + btns + '</div>'
        + '</div></div>';
    });
  }

  setContent(
    '<div class="space-y-4">'
    + '<div style="display:flex;align-items:center;justify-content:space-between">'
    + '<div style="display:flex;gap:1rem">'
    + '<span style="font-size:0.82rem;color:#6b7280"><strong>' + pending + '</strong> pending</span>'
    + '<span style="font-size:0.82rem;color:#92400e"><strong>' + answered + '</strong> awaiting approval</span>'
    + '<span style="font-size:0.82rem;color:#065f46"><strong>' + published + '</strong> published</span>'
    + '</div>'
    + '<div style="display:flex;gap:0.5rem">'
    + '<button class="btn-secondary" onclick="draftAllQAnswers(' + rfpId + ')"><i class="fas fa-robot"></i>AI Draft All</button>'
    + '<button class="btn-primary" onclick="publishAllQAnswers(' + rfpId + ')"><i class="fas fa-paper-plane"></i>Publish All Approved</button>'
    + '</div>'
    + '</div>'
    + '<div style="display:grid;gap:0.75rem">' + qCards + '</div>'
    + '</div>'
  );
};

async function draftOneAnswer(rfpId, qId) {
  showToast('AI drafting answer...', 'info');
  await apiCall('POST', '/rfps/' + rfpId + '/questions/' + qId + '/draft', {});
  showToast('Answer drafted!', 'success');
  rfpTabs.qa(rfpId);
}

async function draftAllQAnswers(rfpId) {
  showToast('AI drafting all answers...', 'info');
  await apiCall('POST', '/rfps/' + rfpId + '/questions/draft-all', {});
  showToast('All answers drafted!', 'success');
  rfpTabs.qa(rfpId);
}

async function approveQAnswer(rfpId, qId) {
  await apiCall('PUT', '/rfps/' + rfpId + '/questions/' + qId + '/approve', {});
  showToast('Answer approved and sent back to vendor!', 'success');
  rfpTabs.qa(rfpId);
}

function editQAnswer(qId) {
  const q = appState.questions.find(function(q){ return q.id === qId; });
  if (!q) return;
  showModal(
    '<h3 style="font-size:1rem;font-weight:700;margin-bottom:0.75rem">Edit Answer for Q' + qId + '</h3>'
    + '<p style="color:#6b7280;font-size:0.875rem;margin-bottom:0.75rem;background:#f9fafb;padding:0.75rem;border-radius:6px">' + escHtml(q.question) + '</p>'
    + '<label>Answer</label>'
    + '<textarea id="editAnswerText" rows="5" style="margin-bottom:1rem">' + escHtml(q.answer||'') + '</textarea>'
    + '<div style="display:flex;gap:0.5rem">'
    + '<button class="btn-primary" onclick="saveQAnswer(' + appState.currentRfpId + ',' + qId + ')">Save &amp; Approve</button>'
    + '<button class="btn-ghost" onclick="closeModal()">Cancel</button>'
    + '</div>'
  );
}

async function saveQAnswer(rfpId, qId) {
  const text = document.getElementById('editAnswerText').value;
  await apiCall('PUT', '/rfps/' + rfpId + '/questions/' + qId + '/answer', { answer: text });
  showToast('Answer saved!', 'success');
  closeModal();
  rfpTabs.qa(rfpId);
}

async function publishAllQAnswers(rfpId) {
  await apiCall('POST', '/rfps/' + rfpId + '/questions/publish-all', {});
  showToast('All approved answers published!', 'success');
  rfpTabs.qa(rfpId);
}

async function loadSampleQs(rfpId) {
  await apiCall('POST', '/rfps/' + rfpId + '/questions/load-samples', {});
  showToast('Sample questions loaded!', 'success');
  rfpTabs.qa(rfpId);
}

// --- TAB: PROPOSALS ---
rfpTabs.proposals = async function(rfpId) {
  const proposals = await apiCall('GET', '/rfps/' + rfpId + '/proposals').catch(function(){ return []; });
  appState.proposals = proposals;

  let rows = '';
  proposals.forEach(function(p) {
    const badge = p.status === 'submitted' || p.status === 'real'
      ? '<span class="stage-badge stage-published">' + (p.status === 'real' ? 'Real Submission' : 'Submitted') + '</span>'
      : '<span class="stage-badge stage-draft">' + escHtml(p.status) + '</span>';
    const fin = p.financial_proposal ? 'AED ' + Number(p.financial_proposal).toLocaleString() : '-';
    const dateStr = p.created_at ? new Date(p.created_at).toLocaleDateString() : '-';
    const isReal = p.is_real_submission;
    rows += '<tr' + (isReal ? ' style="background:#fffbeb"' : '') + '>'
      + '<td style="font-weight:500">' + escHtml(p.vendor_name||'Unknown') + (isReal ? ' <span class="tag" style="background:#fef3c7;color:#92400e">Real</span>' : '') + '</td>'
      + '<td style="font-size:0.82rem;color:#6b7280">' + dateStr + '</td>'
      + '<td>' + fin + '</td>'
      + '<td>' + badge + '</td>'
      + '<td><button class="btn-ghost btn-sm" onclick="viewProposalDetail(' + p.id + ')"><i class="fas fa-eye"></i>View</button></td>'
      + '</tr>';
  });

  setContent(
    '<div class="space-y-4">'
    + '<div style="display:flex;justify-content:space-between;align-items:center">'
    + '<div><h3 style="font-weight:700;font-size:0.95rem;color:#1f2937;margin:0">Submitted Proposals</h3>'
    + '<p style="font-size:0.8rem;color:#9ca3af;margin:0">' + proposals.length + ' proposals received</p></div>'
    + '<div style="display:flex;gap:0.5rem">'
    + '<button class="btn-secondary" onclick="loadSampleProposals(' + rfpId + ')"><i class="fas fa-plus"></i>Add Sample Proposals</button>'
    + '<button class="btn-primary" onclick="switchRfpTab(\'evaluation\',' + rfpId + ')"><i class="fas fa-star"></i>Go to Evaluation</button>'
    + '</div>'
    + '</div>'
    + '<div class="card">'
    + (proposals.length === 0
      ? '<div style="padding:3rem;text-align:center;color:#9ca3af"><i class="fas fa-inbox" style="font-size:2.5rem;display:block;margin-bottom:1rem;color:#d1d5db"></i><p>No proposals yet. Vendors submit proposals after invitation.</p></div>'
      : '<div style="overflow-x:auto"><table><thead><tr><th>Vendor</th><th>Date</th><th>Financial</th><th>Status</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>')
    + '</div>'
    + '</div>'
  );
};

async function loadSampleProposals(rfpId) {
  await apiCall('POST', '/rfps/' + rfpId + '/proposals/sample', {});
  showToast('Sample proposals added!', 'success');
  rfpTabs.proposals(rfpId);
}

function viewProposalDetail(id) {
  const p = appState.proposals.find(function(p){ return p.id === id; });
  if (!p) return;
  showModal(
    '<h3 style="font-size:1rem;font-weight:700;margin-bottom:1rem">Proposal: ' + escHtml(p.vendor_name||'Unknown') + '</h3>'
    + (p.is_real_submission ? '<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:0.5rem 0.875rem;font-size:0.8rem;color:#92400e;margin-bottom:1rem"><i class="fas fa-star mr-1"></i>Real submission from vendor</div>' : '')
    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;font-size:0.875rem;margin-bottom:1rem">'
    + '<div><label>Financial Proposal</label><p style="font-size:1.2rem;font-weight:700">' + (p.financial_proposal ? 'AED ' + Number(p.financial_proposal).toLocaleString() : '-') + '</p></div>'
    + '<div><label>Submitted</label><p>' + (p.created_at ? new Date(p.created_at).toLocaleDateString() : '-') + '</p></div>'
    + '</div>'
    + (p.technical_proposal ? '<div><label>Technical Proposal Summary</label><div style="background:#f9fafb;border-radius:8px;padding:0.75rem;font-size:0.82rem;max-height:200px;overflow-y:auto;margin-top:0.25rem;white-space:pre-wrap">' + escHtml(p.technical_proposal) + '</div></div>' : '')
    + '<button class="btn-ghost" style="width:100%;margin-top:1rem" onclick="closeModal()">Close</button>'
  );
}

// --- TAB: SCORING MODEL ---
rfpTabs.scoring = async function(rfpId, rfp) {
  let model;
  try {
    model = await apiCall('GET', '/rfps/' + rfpId + '/scoring-model');
  } catch(e) {
    model = null;
  }

  if (!model) {
    setContent(
      '<div class="card" style="padding:2rem;text-align:center;color:#9ca3af">'
      + '<i class="fas fa-balance-scale" style="font-size:2.5rem;display:block;margin-bottom:1rem;color:#d1d5db"></i>'
      + '<p>Scoring model will be auto-generated when the RFP is published.</p>'
      + '<button class="btn-primary" onclick="generateScoringModel(' + rfpId + ')"><i class="fas fa-robot"></i>Generate Scoring Model</button>'
      + '</div>'
    );
    return;
  }

  const criteria = model.criteria || [];
  let criteriaRows = '';
  criteria.forEach(function(c) {
    criteriaRows += '<tr>'
      + '<td style="font-weight:500">' + escHtml(c.name) + '</td>'
      + '<td><span class="tag" style="background:#e0f2fe;color:#0369a1">' + escHtml(c.dimension) + '</span></td>'
      + '<td style="font-weight:700;font-size:1.1rem;color:var(--cpc-blue)">' + c.weight + '%</td>'
      + '<td style="font-size:0.82rem;color:#6b7280">' + escHtml(c.description) + '</td>'
      + '<td style="font-size:0.82rem;color:#374151">' + escHtml(c.scoring_guide) + '</td>'
      + '</tr>';
  });

  setContent(
    '<div class="space-y-4">'
    + '<div style="display:flex;align-items:center;justify-content:space-between">'
    + '<div><h3 style="font-weight:700;font-size:0.95rem;color:#1f2937;margin:0">Evaluation Scoring Model</h3>'
    + '<p style="font-size:0.8rem;color:#9ca3af;margin:0">AI-generated scoring framework for this RFP</p></div>'
    + '<button class="btn-secondary" onclick="generateScoringModel(' + rfpId + ')"><i class="fas fa-sync"></i>Regenerate</button>'
    + '</div>'
    // dimension summary
    + '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:0.875rem">'
    + buildDimensionCard('Business', '#7c3aed', criteria, 'Business')
    + buildDimensionCard('Technical', '#0f3460', criteria, 'Technical')
    + buildDimensionCard('Commercial', '#c9a84c', criteria, 'Commercial')
    + '</div>'
    + '<div class="card"><div style="overflow-x:auto"><table>'
    + '<thead><tr><th>Criterion</th><th>Dimension</th><th>Weight</th><th>Description</th><th>Scoring Guide</th></tr></thead>'
    + '<tbody>' + criteriaRows + '</tbody>'
    + '</table></div></div>'
    + (model.notes ? '<div class="card" style="padding:1rem;background:#fffbeb;border:1px solid #fde68a"><p style="font-size:0.85rem;color:#374151;margin:0">' + escHtml(model.notes) + '</p></div>' : '')
    + '</div>'
  );
};

function buildDimensionCard(dim, color, criteria, dimKey) {
  const total = criteria.filter(function(c){ return c.dimension === dimKey; }).reduce(function(s,c){ return s + c.weight; }, 0);
  return '<div class="stat-card" style="border-left:4px solid ' + color + '">'
    + '<div style="font-size:0.8rem;color:#6b7280;font-weight:600">' + dim + ' Score</div>'
    + '<div class="stat-value" style="color:' + color + '">' + total + '%</div>'
    + '<div style="font-size:0.72rem;color:#9ca3af">' + criteria.filter(function(c){ return c.dimension === dimKey; }).length + ' criteria</div>'
    + '</div>';
}

async function generateScoringModel(rfpId) {
  showToast('Generating scoring model...', 'info');
  await apiCall('POST', '/rfps/' + rfpId + '/scoring-model/generate', {});
  showToast('Scoring model generated!', 'success');
  rfpTabs.scoring(rfpId, appState.currentRfp);
}

// --- TAB: EVALUATION ---
rfpTabs.evaluation = async function(rfpId) {
  const evaluations = await apiCall('GET', '/rfps/' + rfpId + '/evaluations').catch(function(){ return []; });
  appState.evaluations = evaluations;

  let evalCards = '';
  if (evaluations.length === 0) {
    evalCards = '<div class="card" style="padding:2.5rem;text-align:center;color:#9ca3af">'
      + '<i class="fas fa-star-half-alt" style="font-size:2.5rem;display:block;margin-bottom:1rem;color:#d1d5db"></i>'
      + '<p style="margin-bottom:1rem">No evaluations yet. Run AI evaluation to score all proposals.</p>'
      + '<button class="btn-primary" id="runEvalBtn" onclick="runRfpEval(' + rfpId + ')"><i class="fas fa-robot"></i>Run AI Evaluation</button>'
      + '</div>';
  } else {
    // Sort by total score
    const sorted = evaluations.slice().sort(function(a,b){ return (b.total_score||0)-(a.total_score||0); });
    sorted.forEach(function(e, i) {
      const isBest = i === 0;
      const medal = ['🥇','🥈','🥉'][i] || String(i+1);
      const scores = [
        { label:'Business', val: e.business_score, color:'#7c3aed' },
        { label:'Technical', val: e.technical_score, color:'#0f3460' },
        { label:'Commercial', val: e.financial_score, color:'#c9a84c' },
      ];
      let scoresHtml = '';
      scores.forEach(function(s) {
        scoresHtml += '<div>'
          + '<div style="display:flex;justify-content:space-between;font-size:0.72rem;color:#6b7280;margin-bottom:3px"><span>' + s.label + '</span><span style="color:' + s.color + ';font-weight:600">' + (s.val||0) + '</span></div>'
          + '<div class="score-bar"><div style="height:100%;border-radius:4px;background:' + s.color + ';width:' + (s.val||0) + '%"></div></div>'
          + '</div>';
      });
      evalCards += '<div class="card" style="padding:1.25rem' + (isBest ? ';border:2px solid var(--cpc-gold)' : '') + '">'
        + '<div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:1rem">'
        + '<div style="display:flex;align-items:center;gap:0.75rem">'
        + '<div style="font-size:1.75rem">' + medal + '</div>'
        + '<div><h3 style="font-weight:700;color:#1f2937;margin:0;font-size:0.95rem">' + escHtml(e.vendor_name||'Vendor') + '</h3>'
        + (e.is_real ? '<span class="tag" style="background:#fef3c7;color:#92400e"><i class="fas fa-star mr-1"></i>Real Submission</span>' : '')
        + '</div></div>'
        + '<div style="text-align:right">'
        + '<div style="font-size:2rem;font-weight:700;color:var(--cpc-gold)">' + (e.total_score||0) + '</div>'
        + '<div style="font-size:0.72rem;color:#9ca3af">/ 100</div>'
        + '</div></div>'
        + '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:0.875rem;margin-bottom:0.75rem">' + scoresHtml + '</div>'
        + (e.ai_summary ? '<p style="font-size:0.78rem;color:#4b5563;background:#f9fafb;border-radius:6px;padding:0.75rem;margin:0">' + escHtml(e.ai_summary) + '</p>' : '')
        + '</div>';
    });
  }

  setContent(
    '<div class="space-y-4">'
    + '<div style="display:flex;justify-content:space-between;align-items:center">'
    + '<div><h3 style="font-weight:700;font-size:0.95rem;color:#1f2937;margin:0">AI Evaluation Results</h3>'
    + '<p style="font-size:0.8rem;color:#9ca3af;margin:0">' + evaluations.length + ' evaluations complete</p></div>'
    + '<div style="display:flex;gap:0.5rem">'
    + '<button class="btn-secondary" id="runEvalBtn" onclick="runRfpEval(' + rfpId + ')"><i class="fas fa-robot"></i>Run Evaluation</button>'
    + '<button class="btn-primary" onclick="switchRfpTab(\'recommendation\',' + rfpId + ')"><i class="fas fa-trophy"></i>See Recommendation</button>'
    + '</div></div>'
    + '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:0.875rem">' + evalCards + '</div>'
    + '</div>'
  );
};

async function runRfpEval(rfpId) {
  const btn = document.getElementById('runEvalBtn');
  setLoading(btn, true, 'Running...');
  try {
    await apiCall('POST', '/rfps/' + rfpId + '/evaluations/run', {});
    showToast('AI evaluation complete!', 'success');
    rfpTabs.evaluation(rfpId);
  } catch(e) {
    setLoading(btn, false);
  }
}

// --- TAB: RECOMMENDATION ---
rfpTabs.recommendation = async function(rfpId) {
  const rec = await apiCall('GET', '/rfps/' + rfpId + '/recommendation').catch(function(){ return null; });

  if (!rec) {
    setContent(
      '<div class="card" style="padding:2.5rem;text-align:center;color:#9ca3af">'
      + '<i class="fas fa-trophy" style="font-size:2.5rem;display:block;margin-bottom:1rem;color:#d1d5db"></i>'
      + '<p style="margin-bottom:1rem">No recommendation yet. Complete the evaluation first.</p>'
      + '<button class="btn-primary" onclick="genRfpRecommendation(' + rfpId + ')"><i class="fas fa-robot"></i>Generate Recommendation</button>'
      + '</div>'
    );
    return;
  }

  const rankings = rec.rankings || [];
  const medals = ['🥇','🥈','🥉'];
  let rankCards = '';
  rankings.slice(0,3).forEach(function(r, i) {
    const isBest = i === 0;
    rankCards += '<div class="card" style="padding:1.25rem' + (isBest ? ';border:2px solid var(--cpc-gold)' : '') + '">'
      + '<div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:0.875rem">'
      + '<div style="font-size:2rem">' + (medals[i]||String(i+1)) + '</div>'
      + '<div><div style="font-weight:700;color:#1f2937;font-size:0.95rem">' + escHtml(r.vendor_name) + '</div>'
      + '<div style="font-size:0.72rem;color:#9ca3af">Rank #' + (i+1) + '</div></div>'
      + '</div>'
      + '<div style="font-size:2rem;font-weight:700;color:var(--cpc-gold)">' + r.total_score + '<span style="font-size:1rem;color:#9ca3af">/100</span></div>'
      + '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:0.4rem;margin-top:0.75rem">'
      + '<div style="text-align:center;font-size:0.72rem"><div style="font-weight:700;color:#7c3aed">' + (r.business_score||'-') + '</div><div style="color:#9ca3af">Business</div></div>'
      + '<div style="text-align:center;font-size:0.72rem"><div style="font-weight:700;color:#0f3460">' + (r.technical_score||'-') + '</div><div style="color:#9ca3af">Technical</div></div>'
      + '<div style="text-align:center;font-size:0.72rem"><div style="font-weight:700;color:#c9a84c">' + (r.financial_score||'-') + '</div><div style="color:#9ca3af">Commercial</div></div>'
      + '</div>'
      + (isBest ? '<div style="margin-top:0.75rem"><span class="stage-badge stage-awarded">&#9733; Recommended</span></div>' : '')
      + '</div>';
  });

  setContent(
    '<div class="space-y-4">'
    + '<div style="display:flex;justify-content:space-between;align-items:center">'
    + '<h3 style="font-weight:700;font-size:0.95rem;color:#1f2937;margin:0"><i class="fas fa-trophy cpc-gold" style="margin-right:6px"></i>Award Recommendation</h3>'
    + '<div style="display:flex;gap:0.5rem">'
    + '<button class="btn-ghost btn-sm" onclick="genRfpRecommendation(' + rfpId + ')"><i class="fas fa-sync"></i>Regenerate</button>'
    + '<button class="btn-primary" onclick="awardRfpContract(' + rfpId + ')"><i class="fas fa-handshake"></i>Award Contract</button>'
    + '</div></div>'
    + '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1rem">' + rankCards + '</div>'
    + '<div class="card" style="padding:1.25rem">'
    + '<h4 style="font-weight:700;color:#1f2937;font-size:0.875rem;margin:0 0 0.75rem"><i class="fas fa-robot cpc-gold" style="margin-right:6px"></i>AI Recommendation Summary</h4>'
    + '<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:1rem;color:#374151;font-size:0.875rem;line-height:1.7">' + (rec.summary||'') + '</div>'
    + '</div>'
    + '</div>'
  );
};

async function genRfpRecommendation(rfpId) {
  showToast('Generating recommendation...', 'info');
  await apiCall('POST', '/rfps/' + rfpId + '/recommendation/generate', {});
  showToast('Recommendation generated!', 'success');
  rfpTabs.recommendation(rfpId);
}

async function awardRfpContract(rfpId) {
  await apiCall('POST', '/rfps/' + rfpId + '/stage', { stage: 'awarded' });
  showToast('Contract awarded! RFP is now complete.', 'success');
  const rfp = await apiCall('GET', '/rfps/' + rfpId);
  appState.currentRfp = rfp;
  document.getElementById('pageSubtitle').textContent = (rfp.ref_number||'') + ' \u2022 Awarded';
  renderLifecycleBar(rfp);
  renderRfpTabs('recommendation', rfpId, false);
}

// ============================================================
// PAGE: VENDORS (global registry)
// ============================================================
pages.vendors = async function() {
  const [vendors, perfData] = await Promise.all([
    apiCall('GET', '/vendors').catch(function(){ return []; }),
    apiCall('GET', '/vendor-performance').catch(function(){ return []; }),
  ]);
  appState.vendors = vendors;

  // merge performance data
  const perfMap = {};
  (perfData||[]).forEach(function(p){ perfMap[p.id] = p; });

  let rows = '';
  vendors.forEach(function(v) {
    const perf = perfMap[v.id] || {};
    const avgScore = perf.avg_score ? Math.round(perf.avg_score) : null;
    const perfCls = avgScore ? (avgScore >= 75 ? 'perf-high' : avgScore >= 50 ? 'perf-mid' : 'perf-low') : '';
    const tags = (v.specializations||'').split(',').filter(Boolean).slice(0,3)
      .map(function(s){ return '<span class="tag">' + escHtml(s.trim()) + '</span>'; }).join('');

    rows += '<tr>'
      + '<td><div style="display:flex;align-items:center;gap:0.75rem">'
      + '<div style="width:34px;height:34px;border-radius:8px;background:var(--cpc-blue);display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:0.82rem;flex-shrink:0">' + escHtml(v.name.charAt(0)) + '</div>'
      + '<div><div style="font-weight:600;font-size:0.875rem">' + escHtml(v.name) + '</div>'
      + '<div style="font-size:0.72rem;color:#9ca3af">' + escHtml(v.country||'UAE') + ' &bull; ' + escHtml(v.size||'') + '</div>'
      + '</div></div></td>'
      + '<td>' + escHtml(v.category||'') + '</td>'
      + '<td>' + tags + '</td>'
      + '<td style="text-align:center">' + (perf.rfps_shortlisted||0) + '</td>'
      + '<td style="text-align:center">' + (perf.proposals_submitted||0) + '</td>'
      + (avgScore ? '<td><span class="perf-badge ' + perfCls + '">' + avgScore + '/100</span></td>' : '<td><span style="color:#9ca3af">-</span></td>')
      + '<td style="text-align:center">' + (perf.awards_won||0) + '</td>'
      + '<td><button class="btn-ghost btn-sm" onclick="viewVendorDetail(' + v.id + ')"><i class="fas fa-eye"></i></button></td>'
      + '</tr>';
  });

  setContent(
    '<div class="space-y-4">'
    + '<div style="display:flex;align-items:center;justify-content:space-between">'
    + '<div><h3 style="font-weight:700;font-size:0.95rem;color:#1f2937;margin:0">Global Vendor Registry</h3>'
    + '<p style="font-size:0.8rem;color:#9ca3af;margin:0">' + vendors.length + ' registered vendors</p></div>'
    + '</div>'
    + '<div class="card"><div style="overflow-x:auto"><table>'
    + '<thead><tr><th>Vendor</th><th>Category</th><th>Specializations</th><th style="text-align:center">Shortlisted</th><th style="text-align:center">Proposals</th><th>Avg Score</th><th style="text-align:center">Awards</th><th></th></tr></thead>'
    + '<tbody>' + rows + '</tbody>'
    + '</table></div></div>'
    + '</div>'
  );
};

function viewVendorDetail(id) {
  const v = appState.vendors.find(function(v){ return v.id === id; });
  const rv = appState.rfpVendors.find(function(v){ return v.id === id; });
  const vendor = v || rv;
  if (!vendor) return;
  showModal(
    '<div style="display:flex;align-items:center;gap:0.875rem;margin-bottom:1.25rem">'
    + '<div style="width:48px;height:48px;border-radius:12px;background:var(--cpc-blue);display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:1.25rem">' + escHtml(vendor.name.charAt(0)) + '</div>'
    + '<div><h3 style="font-size:1rem;font-weight:700;margin:0">' + escHtml(vendor.name) + '</h3>'
    + '<p style="color:#6b7280;font-size:0.82rem;margin:0">' + escHtml(vendor.category||'') + '</p></div>'
    + '</div>'
    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0.875rem;font-size:0.85rem;margin-bottom:1rem">'
    + '<div><label>Contact Name</label><p style="margin:0">' + escHtml(vendor.contact_name||'-') + '</p></div>'
    + '<div><label>Contact Email</label><p style="margin:0"><a href="mailto:' + escHtml(vendor.contact_email||'') + '" style="color:var(--cpc-blue)">' + escHtml(vendor.contact_email||'-') + '</a></p></div>'
    + '<div><label>Country</label><p style="margin:0">' + escHtml(vendor.country||'-') + '</p></div>'
    + '<div><label>Size</label><p style="margin:0">' + escHtml(vendor.size||'-') + '</p></div>'
    + '<div><label>Certifications</label><p style="margin:0">' + escHtml(vendor.certifications||'-') + '</p></div>'
    + '<div><label>ERP Experience</label><p style="margin:0">' + escHtml(vendor.erp_experience||'-') + '</p></div>'
    + '</div>'
    + '<div style="margin-bottom:1rem"><label>Specializations</label><div style="margin-top:4px">'
    + (vendor.specializations||'').split(',').filter(Boolean).map(function(s){ return '<span class="tag">' + escHtml(s.trim()) + '</span>'; }).join('')
    + '</div></div>'
    + '<button class="btn-ghost" style="width:100%" onclick="closeModal()">Close</button>'
  );
}

// ============================================================
// PAGE: REPORTS
// ============================================================
pages.reports = async function() {
  let stats, perfData;
  try {
    [stats, perfData] = await Promise.all([
      apiCall('GET', '/stats'),
      apiCall('GET', '/vendor-performance').catch(function(){ return []; }),
    ]);
  } catch(e) {
    stats = {};
    perfData = [];
  }

  let perfRows = '';
  (perfData||[]).forEach(function(v) {
    const score = v.avg_score ? Math.round(v.avg_score) : 0;
    const perfCls = score >= 75 ? 'perf-high' : score >= 50 ? 'perf-mid' : 'perf-low';
    perfRows += '<tr>'
      + '<td style="font-weight:500">' + escHtml(v.name) + '</td>'
      + '<td>' + escHtml(v.category||'') + '</td>'
      + '<td style="text-align:center">' + (v.rfps_shortlisted||0) + '</td>'
      + '<td style="text-align:center">' + (v.proposals_submitted||0) + '</td>'
      + '<td><div style="display:flex;align-items:center;gap:8px">'
      + '<span class="perf-badge ' + perfCls + '">' + score + '</span>'
      + '<div style="flex:1;min-width:60px">' + scoreBar(score) + '</div>'
      + '</div></td>'
      + '<td style="text-align:center"><strong>' + (v.awards_won||0) + '</strong></td>'
      + '</tr>';
  });

  setContent(
    '<div class="space-y-4">'
    + '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:0.875rem">'
    + '<div class="stat-card"><div class="stat-label">Total RFPs</div><div class="stat-value" style="color:var(--cpc-blue)">' + (stats.totalRfps||0) + '</div></div>'
    + '<div class="stat-card"><div class="stat-label">Win Rate</div><div class="stat-value" style="color:var(--cpc-gold)">' + (stats.winRate||0) + '%</div></div>'
    + '<div class="stat-card"><div class="stat-label">Avg RFP Duration</div><div class="stat-value" style="color:#065f46">' + (stats.avgDuration ? stats.avgDuration + 'd' : 'N/A') + '</div></div>'
    + '<div class="stat-card"><div class="stat-label">Registered Vendors</div><div class="stat-value" style="color:#7c3aed">' + (stats.totalVendors||0) + '</div></div>'
    + '</div>'
    + '<div class="card">'
    + '<div style="padding:1rem 1.25rem;border-bottom:1px solid #e5e7eb"><h3 style="font-weight:700;font-size:0.9rem;color:#1f2937;margin:0">Vendor Performance Analytics</h3></div>'
    + (perfRows
      ? '<div style="overflow-x:auto"><table><thead><tr><th>Vendor</th><th>Category</th><th style="text-align:center">Shortlisted</th><th style="text-align:center">Proposals</th><th>Avg Score</th><th style="text-align:center">Awards Won</th></tr></thead><tbody>' + perfRows + '</tbody></table></div>'
      : '<div style="padding:2rem;text-align:center;color:#9ca3af">No performance data yet</div>')
    + '</div>'
    + '</div>'
  );
};

// ============================================================
// CREATE RFP MODAL
// ============================================================
function showCreateRfpModal() {
  showModal(
    '<h3 style="font-size:1rem;font-weight:700;margin-bottom:1.25rem"><i class="fas fa-file-circle-plus cpc-gold" style="margin-right:6px"></i>Create New RFP</h3>'
    + '<div class="form-group"><label>Project Title *</label>'
    + '<input id="newRfpTitle" placeholder="e.g. New Oracle ERP Setup, Data Warehouse and Data Visualization"></div>'
    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem">'
    + '<div class="form-group"><label>Category</label><select id="newRfpCat">'
    + ['IT & Digital Transformation','Consulting Services','Infrastructure','Professional Services','Data & Analytics'].map(function(c){ return '<option>' + c + '</option>'; }).join('')
    + '</select></div>'
    + '<div class="form-group"><label>Budget (AED)</label><input id="newRfpBudget" placeholder="e.g. 5,000,000"></div>'
    + '</div>'
    + '<div class="form-group"><label>Submission Deadline</label><input type="date" id="newRfpDeadline" value="' + getDateOffset(30) + '"></div>'
    + '<div class="form-group"><label>Describe the project in your own words</label>'
    + '<textarea id="newRfpDesc" rows="4" placeholder="Tell us what you need — background, what it should achieve, any specific requirements. Our AI will structure this into a professional RFP..."></textarea></div>'
    + '<div style="display:flex;gap:0.5rem;margin-top:0.5rem">'
    + '<button class="btn-primary" id="createRfpBtn" style="flex:1" onclick="createRfp()"><i class="fas fa-wand-magic-sparkles"></i>Create RFP</button>'
    + '<button class="btn-ghost" onclick="closeModal()">Cancel</button>'
    + '</div>'
  );
}

async function createRfp() {
  const title = document.getElementById('newRfpTitle').value.trim();
  if (!title) { showToast('Please enter a project title', 'error'); return; }
  const btn = document.getElementById('createRfpBtn');
  setLoading(btn, true, 'Creating...');
  try {
    const desc = document.getElementById('newRfpDesc').value;
    const rfp = await apiCall('POST', '/rfps', {
      title: title,
      category: document.getElementById('newRfpCat').value,
      budget: document.getElementById('newRfpBudget').value,
      deadline: document.getElementById('newRfpDeadline').value,
      scope: desc,
      background: desc,
    });
    showToast('RFP created!', 'success');
    closeModal();
    navigateTo('rfp_detail', { rfpId: rfp.id, tab: 'generate' });
  } catch(e) {
    setLoading(btn, false);
  }
}

// ============================================================
// START
// ============================================================
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
