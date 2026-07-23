// ============================================================
// CPC RFP TOOL - Main Application JS (external static file)
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
function showToast(msg, type) {
  type = type || 'info';
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show ' + type;
  setTimeout(function() { t.className = 'toast'; }, 3500);
}

function showModal(html) {
  document.getElementById('modalContent').innerHTML = html;
  document.getElementById('modalOverlay').classList.add('open');
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
}

document.getElementById('modalOverlay').addEventListener('click', function(e) {
  if (e.target.id === 'modalOverlay') closeModal();
});

document.getElementById('headerDate').textContent = new Date().toLocaleDateString('en-AE', {
  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
});

async function apiCall(method, path, data) {
  try {
    const opts = { method: method, headers: { 'Content-Type': 'application/json' } };
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

function setLoading(el, loading, text) {
  if (loading) {
    el.disabled = true;
    el.dataset.originalText = el.innerHTML;
    el.innerHTML = '<span class="spinner" style="margin-right:6px"></span>' + (text || 'Processing...');
  } else {
    el.disabled = false;
    el.innerHTML = el.dataset.originalText || text || '';
  }
}

function setContent(html) {
  document.getElementById('pageContent').innerHTML = html;
}

function scoreBar(val) {
  return '<div class="score-bar"><div class="score-fill" style="width:' + (val || 0) + '%"></div></div>';
}

function stageBadgeClass(stage) {
  if (stage === 'awarded') return 'stage-awarded';
  if (stage === 'evaluation' || stage === 'submissions_closed') return 'stage-evaluation';
  if (stage === 'draft') return 'stage-draft';
  return 'stage-published';
}

// ============================================================
// Navigation
// ============================================================
var pageTitles = {
  dashboard:      ['Dashboard', 'AI-Powered Procurement Overview'],
  rfp:            ['RFP Generation', 'Generate & Manage Request for Proposal'],
  vendors:        ['Vendor Shortlisting', 'Select & Manage Qualified Vendors'],
  emails:         ['Email Invitations', 'Track All Correspondence'],
  qa:             ['Q&A Management', 'Vendor Questions & AI-Drafted Answers'],
  proposals:      ['Proposal Submissions', 'Review Vendor Proposals'],
  evaluation:     ['AI Evaluation', 'Automated Scoring & Analysis'],
  recommendation: ['Award Recommendation', 'Final Decision & Contract Award'],
};

document.getElementById('mainNav').addEventListener('click', function(e) {
  const link = e.target.closest('[data-page]');
  if (!link) return;
  e.preventDefault();
  navigateTo(link.dataset.page);
});

function navigateTo(page) {
  currentPage = page;
  document.querySelectorAll('[data-page]').forEach(function(el) {
    el.classList.toggle('active', el.dataset.page === page);
  });
  const info = pageTitles[page] || [page, ''];
  document.getElementById('pageTitle').textContent = info[0];
  document.getElementById('pageSubtitle').textContent = info[1];
  setContent('<div class="flex items-center justify-center h-40"><div class="spinner" style="width:36px;height:36px;border-width:4px"></div></div>');
  if (pages[page]) pages[page]();
}

// ============================================================
// INIT
// ============================================================
async function init() {
  try {
    await apiCall('POST', '/init', {});
  } catch(e) {
    // ignore init errors, tables may already exist
  }
  navigateTo('dashboard');
}

// ============================================================
// PAGE: DASHBOARD
// ============================================================
var pages = {};

pages.dashboard = async function() {
  let stats, rfp;
  try {
    [stats, rfp] = await Promise.all([
      apiCall('GET', '/stats'),
      apiCall('GET', '/rfp').catch(function() { return null; })
    ]);
  } catch(e) {
    stats = { vendors: 0, shortlisted: 0, proposals: 0, emails: 0 };
    rfp = null;
  }
  appState.rfp = rfp;

  const stage = (rfp && rfp.stage) ? rfp.stage : 'draft';
  const stages = ['draft','published','qa_open','submissions_closed','evaluation','awarded'];
  const stageLabels = ['Draft','Published','Q&A Open','Submissions Closed','Evaluation','Awarded'];
  const stageIdx = stages.indexOf(stage);

  // Build stage progress steps
  let stepsHtml = '';
  for (let i = 0; i < stageLabels.length; i++) {
    const cls = i < stageIdx ? 'step-done' : (i === stageIdx ? 'step-active' : 'step-pending');
    const icon = i < stageIdx ? '<i class="fas fa-check" style="font-size:0.7rem"></i>' : String(i + 1);
    const labelCls = i === stageIdx ? 'font-semibold' : '';
    stepsHtml += '<div class="progress-step ' + cls + '">';
    stepsHtml += '<div class="flex flex-col items-center">';
    stepsHtml += '<div class="step-circle">' + icon + '</div>';
    stepsHtml += '<div class="text-xs mt-1 text-center ' + labelCls + '" style="width:60px;color:' + (i===stageIdx?'#1a1a2e':'#9ca3af') + '">' + stageLabels[i] + '</div>';
    stepsHtml += '</div>';
    if (i < stageLabels.length - 1) {
      stepsHtml += '<div class="step-line mx-1" style="margin-bottom:20px"></div>';
    }
    stepsHtml += '</div>';
  }

  // Stage action buttons
  let stageActions = '';
  if (rfp) {
    if (stage === 'draft')               stageActions += '<button class="btn-primary" onclick="advanceStage(\'published\')"><i class="fas fa-paper-plane mr-2"></i>Publish RFP</button>';
    if (stage === 'published')           stageActions += '<button class="btn-primary" onclick="advanceStage(\'qa_open\')"><i class="fas fa-comments mr-2"></i>Open Q&amp;A</button>';
    if (stage === 'qa_open')             stageActions += '<button class="btn-primary" onclick="advanceStage(\'submissions_closed\')"><i class="fas fa-lock mr-2"></i>Close Submissions</button>';
    if (stage === 'submissions_closed')  stageActions += '<button class="btn-primary" onclick="advanceStage(\'evaluation\')"><i class="fas fa-star mr-2"></i>Start Evaluation</button>';
    if (stage === 'evaluation')          stageActions += '<button class="btn-primary" onclick="navigateTo(\'evaluation\')"><i class="fas fa-robot mr-2"></i>Run AI Evaluation</button>';
  }

  const badgeClass = stageBadgeClass(stage);
  const stageDisplay = rfp
    ? '<span class="stage-badge ' + badgeClass + '">' + (stageLabels[stageIdx] || stage) + '</span>'
    : '<span style="color:#9ca3af;font-size:0.875rem">No active RFP</span>';

  // Stats cards
  const statsData = [
    { icon: 'fa-building',    label: 'Total Vendors',  value: stats.vendors || 0,    color: '#0f3460' },
    { icon: 'fa-check-circle',label: 'Shortlisted',    value: stats.shortlisted || 0, color: '#c9a84c' },
    { icon: 'fa-inbox',       label: 'Proposals',      value: stats.proposals || 0,   color: '#065f46' },
    { icon: 'fa-envelope',    label: 'Emails Sent',    value: stats.emails || 0,      color: '#7c3aed' },
  ];
  let statsHtml = '';
  statsData.forEach(function(s) {
    statsHtml += '<div class="card p-5">'
      + '<div class="flex items-center justify-between mb-2">'
      + '<div class="w-10 h-10 rounded-lg flex items-center justify-center" style="background:' + s.color + '20">'
      + '<i class="fas ' + s.icon + '" style="color:' + s.color + '"></i></div>'
      + '<span class="text-3xl font-bold" style="color:' + s.color + '">' + s.value + '</span>'
      + '</div>'
      + '<div class="text-sm text-gray-500 font-medium">' + s.label + '</div>'
      + '</div>';
  });

  // Quick actions
  const actions = [
    { icon: 'fa-file-contract',  label: 'Generate RFP',    page: 'rfp' },
    { icon: 'fa-building',       label: 'Shortlist Vendors',page: 'vendors' },
    { icon: 'fa-comments',       label: 'Manage Q&A',       page: 'qa' },
    { icon: 'fa-star-half-alt',  label: 'Run Evaluation',   page: 'evaluation' },
  ];
  let actionsHtml = '';
  actions.forEach(function(a) {
    actionsHtml += '<button class="btn-secondary py-4 flex flex-col items-center gap-2 text-sm" onclick="navigateTo(\'' + a.page + '\')">'
      + '<i class="fas ' + a.icon + ' text-xl" style="color:var(--cpc-gold)"></i>'
      + '<span>' + a.label + '</span></button>';
  });

  // RFP info section
  let rfpSection = '';
  if (rfp) {
    rfpSection = '<div class="card p-6">'
      + '<h2 class="text-lg font-bold text-gray-800 mb-4"><i class="fas fa-file-contract mr-2 cpc-gold"></i>Active RFP</h2>'
      + '<div class="grid grid-cols-2 gap-4">'
      + '<div><label>Title</label><p class="font-medium">' + (rfp.title || '-') + '</p></div>'
      + '<div><label>Category</label><p class="font-medium">' + (rfp.category || '-') + '</p></div>'
      + '<div><label>Budget</label><p class="font-medium">' + (rfp.budget || 'TBD') + '</p></div>'
      + '<div><label>Deadline</label><p class="font-medium">' + (rfp.deadline ? new Date(rfp.deadline).toLocaleDateString() : 'TBD') + '</p></div>'
      + '</div></div>';
  } else {
    rfpSection = '<div class="card p-10 text-center">'
      + '<i class="fas fa-file-circle-plus text-5xl mb-4" style="color:#e5e7eb"></i>'
      + '<p class="text-gray-500 mb-4">No active RFP. Start by generating one with AI.</p>'
      + '<button class="btn-primary" onclick="navigateTo(\'rfp\')"><i class="fas fa-magic mr-2"></i>Generate RFP with AI</button>'
      + '</div>';
  }

  setContent(
    '<div class="space-y-6">'
    + '<div class="card p-6">'
    + '<div class="flex items-center justify-between mb-4">'
    + '<h2 class="text-lg font-bold text-gray-800"><i class="fas fa-route mr-2 cpc-gold"></i>Procurement Stage</h2>'
    + stageDisplay
    + '</div>'
    + '<div class="flex items-center">' + stepsHtml + '</div>'
    + (stageActions ? '<div class="mt-4 pt-4" style="border-top:1px solid #e5e7eb;display:flex;gap:0.75rem">' + stageActions + '</div>' : '')
    + '</div>'
    + '<div class="grid grid-cols-2 gap-4" style="grid-template-columns:repeat(4,1fr)">' + statsHtml + '</div>'
    + '<div class="card p-6">'
    + '<h2 class="text-lg font-bold text-gray-800 mb-4"><i class="fas fa-bolt mr-2 cpc-gold"></i>Quick Actions</h2>'
    + '<div class="grid grid-cols-4 gap-3">' + actionsHtml + '</div>'
    + '</div>'
    + rfpSection
    + '</div>'
  );
};

// ============================================================
// PAGE: RFP GENERATION
// ============================================================
pages.rfp = async function() {
  const rfp = await apiCall('GET', '/rfp').catch(function() { return null; });
  appState.rfp = rfp;

  const titleVal = (rfp && rfp.title) ? rfp.title : 'Enterprise Resource Planning (ERP) System Implementation';
  const catVal = (rfp && rfp.category) ? rfp.category : 'IT & Digital Transformation';
  const budgetVal = (rfp && rfp.budget) ? rfp.budget : '';
  const deadlineVal = (rfp && rfp.deadline) ? rfp.deadline : '';
  const scopeVal = (rfp && rfp.scope) ? rfp.scope : 'Implementation of a comprehensive ERP system covering HR, Finance, Procurement, and Operations modules for the Crown Prince Court of Abu Dhabi.';
  const techVal = (rfp && rfp.tech_requirements) ? rfp.tech_requirements : 'Cloud-based SaaS deployment, Arabic language support, UAE Pass integration, ISO 27001 certified infrastructure, 99.9% SLA uptime';
  const previewHtml = (rfp && rfp.content) ? rfp.content : '<div class="text-center py-10" style="color:#9ca3af"><i class="fas fa-file-alt" style="font-size:3rem;display:block;margin-bottom:1rem"></i><p>Click "Generate with AI" to create your RFP document</p></div>';

  setContent(
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:1.5rem">'
    + '<div class="card p-6">'
    + '<h2 class="text-lg font-bold text-gray-800 mb-4"><i class="fas fa-magic mr-2 cpc-gold"></i>AI RFP Generator</h2>'
    + '<div class="space-y-4">'
    + '<div><label>Project Title *</label><input id="rfpTitle" placeholder="e.g. ERP System Implementation" value="' + escHtml(titleVal) + '"></div>'
    + '<div><label>Category</label><select id="rfpCategory">'
    + '<option value="IT & Digital Transformation"' + (catVal === 'IT & Digital Transformation' ? ' selected' : '') + '>IT &amp; Digital Transformation</option>'
    + '<option value="Consulting Services"' + (catVal === 'Consulting Services' ? ' selected' : '') + '>Consulting Services</option>'
    + '<option value="Infrastructure"' + (catVal === 'Infrastructure' ? ' selected' : '') + '>Infrastructure</option>'
    + '<option value="Professional Services"' + (catVal === 'Professional Services' ? ' selected' : '') + '>Professional Services</option>'
    + '</select></div>'
    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem">'
    + '<div><label>Budget (AED)</label><input id="rfpBudget" placeholder="e.g. 5,000,000" value="' + escHtml(budgetVal) + '"></div>'
    + '<div><label>Submission Deadline</label><input type="date" id="rfpDeadline" value="' + escHtml(deadlineVal) + '"></div>'
    + '</div>'
    + '<div><label>Scope of Work</label><textarea id="rfpScope" rows="4">' + escHtml(scopeVal) + '</textarea></div>'
    + '<div><label>Technical Requirements</label><textarea id="rfpTech" rows="3">' + escHtml(techVal) + '</textarea></div>'
    + '<div style="display:flex;gap:0.75rem;padding-top:0.5rem">'
    + '<button class="btn-primary" id="generateBtn" style="flex:1" onclick="generateRFP()"><i class="fas fa-robot mr-2"></i>Generate with AI</button>'
    + '<button class="btn-secondary" onclick="saveRFP()"><i class="fas fa-save mr-2"></i>Save</button>'
    + '</div></div></div>'
    + '<div class="card p-6">'
    + '<div class="flex items-center justify-between mb-4">'
    + '<h2 class="text-lg font-bold text-gray-800"><i class="fas fa-eye mr-2 cpc-gold"></i>RFP Preview</h2>'
    + ((rfp && rfp.content) ? '<button class="btn-primary text-sm" onclick="navigateTo(\'vendors\')"><i class="fas fa-arrow-right mr-1"></i>Next: Vendors</button>' : '')
    + '</div>'
    + '<div id="rfpPreview" class="rfp-preview" style="font-size:0.875rem;max-height:480px;overflow-y:auto">' + previewHtml + '</div>'
    + '</div></div>'
  );
};

// ============================================================
// PAGE: VENDORS
// ============================================================
pages.vendors = async function() {
  const vendors = await apiCall('GET', '/vendors');
  appState.vendors = vendors;

  let rows = '';
  vendors.forEach(function(v) {
    const tags = (v.specializations || '').split(',').filter(function(s) { return s.trim(); }).slice(0, 4)
      .map(function(s) { return '<span class="tag">' + escHtml(s.trim()) + '</span>'; }).join('');

    const scoreBar = v.fit_score
      ? '<div class="mt-3 pt-3" style="border-top:1px solid #e5e7eb">'
        + '<div style="display:flex;justify-content:space-between;font-size:0.75rem;color:#9ca3af;margin-bottom:4px"><span>AI Fit Score</span><span>' + v.fit_score + '/100</span></div>'
        + '<div class="score-bar"><div class="score-fill" style="width:' + v.fit_score + '%"></div></div>'
        + '</div>'
      : '';

    const addBtn = v.shortlisted
      ? '<button class="btn-danger text-sm" onclick="toggleShortlist(' + v.id + ', false)"><i class="fas fa-times mr-1"></i>Remove</button>'
      : '<button class="btn-primary text-sm" onclick="toggleShortlist(' + v.id + ', true)"><i class="fas fa-plus mr-1"></i>Add</button>';

    rows += '<div class="card p-4" style="' + (v.shortlisted ? 'border:2px solid var(--cpc-gold)' : '') + '">'
      + '<div style="display:flex;align-items:flex-start;justify-content:space-between">'
      + '<div style="display:flex;align-items:flex-start;gap:1rem;flex:1">'
      + '<div style="width:40px;height:40px;border-radius:8px;background:var(--cpc-blue);display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:0.875rem;flex-shrink:0">' + escHtml(v.name.charAt(0)) + '</div>'
      + '<div style="flex:1">'
      + '<div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap">'
      + '<span style="font-weight:600;color:#1f2937">' + escHtml(v.name) + '</span>'
      + (v.shortlisted ? '<span class="stage-badge stage-published">&#10003; Shortlisted</span>' : '')
      + (v.fit_score ? '<span style="font-size:0.75rem;background:#fffbeb;color:#92400e;padding:2px 8px;border-radius:12px;font-weight:500">AI Score: ' + v.fit_score + '/100</span>' : '')
      + '</div>'
      + '<div style="font-size:0.875rem;color:#6b7280;margin-top:2px">' + escHtml(v.category || '') + ' &bull; ' + escHtml(v.country || 'UAE') + ' &bull; ' + escHtml(v.size || '') + '</div>'
      + '<div style="margin-top:6px">' + tags + '</div>'
      + '</div></div>'
      + '<div style="display:flex;gap:0.5rem;margin-left:0.75rem">'
      + addBtn
      + '<button class="btn-secondary text-sm" onclick="viewVendor(' + v.id + ')"><i class="fas fa-eye"></i></button>'
      + '</div></div>'
      + scoreBar
      + '</div>';
  });

  setContent(
    '<div class="space-y-4">'
    + '<div style="display:flex;align-items:center;justify-content:space-between">'
    + '<div><h2 class="text-lg font-bold text-gray-800">Vendor Database</h2>'
    + '<p style="font-size:0.875rem;color:#6b7280">' + vendors.length + ' vendors loaded from CPO ERP Scope of Work</p></div>'
    + '<div style="display:flex;gap:0.75rem">'
    + '<button class="btn-secondary" onclick="aiShortlist()"><i class="fas fa-robot mr-2"></i>AI Shortlist</button>'
    + '<button class="btn-primary" onclick="sendInvitations()"><i class="fas fa-paper-plane mr-2"></i>Send Invitations</button>'
    + '</div></div>'
    + '<div style="display:grid;gap:0.75rem">' + rows + '</div>'
    + '</div>'
  );
};

// ============================================================
// PAGE: EMAILS
// ============================================================
pages.emails = async function() {
  const emails = await apiCall('GET', '/emails');
  appState.emails = emails;

  let rows = '';
  emails.forEach(function(e) {
    const statusHtml = e.status === 'sent'
      ? '<span style="color:#065f46;font-weight:500"><i class="fas fa-check-circle mr-1"></i>Sent</span>'
      : e.status === 'simulated'
      ? '<span style="color:#1d4ed8;font-weight:500"><i class="fas fa-flask mr-1"></i>Simulated</span>'
      : '<span style="color:#6b7280">' + escHtml(e.status) + '</span>';
    const dateStr = e.created_at ? new Date(e.created_at).toLocaleString() : '-';
    rows += '<tr>'
      + '<td style="font-weight:500">' + escHtml(e.vendor_name || e.recipient || '') + '</td>'
      + '<td>' + escHtml(e.subject || '') + '</td>'
      + '<td><span class="tag">' + escHtml(e.email_type || '') + '</span></td>'
      + '<td>' + statusHtml + '</td>'
      + '<td style="font-size:0.875rem;color:#6b7280">' + dateStr + '</td>'
      + '</tr>';
  });

  const tableOrEmpty = emails.length === 0
    ? '<div style="padding:3rem;text-align:center;color:#9ca3af">'
      + '<i class="fas fa-envelope-open-text" style="font-size:3rem;display:block;margin-bottom:1rem"></i>'
      + '<p>No emails sent yet. Go to Vendor Shortlisting to send invitations.</p></div>'
    : '<div style="overflow-x:auto"><table><thead><tr><th>To</th><th>Subject</th><th>Type</th><th>Status</th><th>Sent At</th></tr></thead><tbody>' + rows + '</tbody></table></div>';

  setContent(
    '<div class="card">'
    + '<div style="padding:1rem;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;justify-content:space-between">'
    + '<h2 style="font-weight:700;color:#1f2937">Email Correspondence Log</h2>'
    + '<span style="font-size:0.875rem;color:#6b7280">' + emails.length + ' emails</span>'
    + '</div>'
    + tableOrEmpty
    + '</div>'
  );
};

// ============================================================
// PAGE: Q&A MANAGEMENT
// ============================================================
pages.qa = async function() {
  const questions = await apiCall('GET', '/questions');
  appState.questions = questions;

  const pending   = questions.filter(function(q) { return !q.published && !q.answer; }).length;
  const answered  = questions.filter(function(q) { return q.answer && !q.published; }).length;
  const published = questions.filter(function(q) { return q.published; }).length;

  let qCards = '';
  if (questions.length === 0) {
    qCards = '<div class="card p-10 text-center" style="color:#9ca3af">'
      + '<i class="fas fa-comments" style="font-size:3rem;display:block;margin-bottom:1rem"></i>'
      + '<p>No questions yet. Load sample questions to get started.</p>'
      + '<button class="btn-secondary mt-4" onclick="loadSampleQuestions()" style="margin-top:1rem">Load Sample Questions</button>'
      + '</div>';
  } else {
    questions.forEach(function(q) {
      const badgeHtml = q.published
        ? '<span class="stage-badge stage-published">Published</span>'
        : q.answer
        ? '<span class="stage-badge" style="background:#fef3c7;color:#92400e">Pending Approval</span>'
        : '<span class="stage-badge stage-draft">Unanswered</span>';

      const answerBlock = q.answer
        ? '<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:0.75rem;margin-top:0.75rem">'
          + '<div style="font-size:0.75rem;font-weight:700;color:#92400e;margin-bottom:4px"><i class="fas fa-robot mr-1"></i>AI Draft Answer</div>'
          + '<p style="font-size:0.875rem;color:#374151">' + escHtml(q.answer) + '</p>'
          + '</div>'
        : '';

      const btns = (!q.answer
        ? '<button class="btn-secondary text-sm" onclick="draftAnswer(' + q.id + ')"><i class="fas fa-robot mr-1"></i>AI Draft</button>'
        : '') + (q.answer && !q.published
        ? '<button class="btn-primary text-sm" onclick="approveAnswer(' + q.id + ')"><i class="fas fa-check mr-1"></i>Approve</button>'
          + '<button class="btn-secondary text-sm" onclick="editAnswer(' + q.id + ')"><i class="fas fa-edit mr-1"></i>Edit</button>'
        : '');

      qCards += '<div class="card p-5" id="q-' + q.id + '">'
        + '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:1rem">'
        + '<div style="flex:1">'
        + '<div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.5rem">'
        + '<span style="font-size:0.75rem;font-weight:600;color:#9ca3af">Q' + q.id + ' &bull; ' + escHtml(q.vendor_name || 'Anonymous') + '</span>'
        + badgeHtml + '</div>'
        + '<p style="font-weight:500;color:#1f2937">' + escHtml(q.question) + '</p>'
        + answerBlock
        + '</div>'
        + '<div style="display:flex;flex-direction:column;gap:0.5rem">' + btns + '</div>'
        + '</div></div>';
    });
  }

  setContent(
    '<div class="space-y-4">'
    + '<div style="display:flex;align-items:center;justify-content:space-between">'
    + '<div style="display:flex;gap:0.75rem">'
    + '<span style="font-size:0.875rem;color:#6b7280">' + pending + ' pending</span>'
    + '<span style="font-size:0.875rem;color:#92400e">' + answered + ' awaiting approval</span>'
    + '<span style="font-size:0.875rem;color:#065f46">' + published + ' published</span>'
    + '</div>'
    + '<div style="display:flex;gap:0.75rem">'
    + '<button class="btn-secondary" onclick="draftAllAnswers()"><i class="fas fa-robot mr-2"></i>AI Draft All</button>'
    + '<button class="btn-primary" onclick="publishAllAnswers()"><i class="fas fa-paper-plane mr-2"></i>Publish All Approved</button>'
    + '</div></div>'
    + '<div style="display:grid;gap:0.75rem" id="qaList">' + qCards + '</div>'
    + '</div>'
  );
};

// ============================================================
// PAGE: PROPOSALS
// ============================================================
pages.proposals = async function() {
  const proposals = await apiCall('GET', '/proposals');
  appState.proposals = proposals;

  let rows = '';
  proposals.forEach(function(p) {
    const badge = p.status === 'submitted'
      ? '<span class="stage-badge stage-published">submitted</span>'
      : '<span class="stage-badge stage-draft">' + escHtml(p.status) + '</span>';
    const fin = p.financial_proposal ? 'AED ' + Number(p.financial_proposal).toLocaleString() : '-';
    const dateStr = p.created_at ? new Date(p.created_at).toLocaleDateString() : '-';
    rows += '<tr>'
      + '<td style="font-weight:500">' + escHtml(p.vendor_name || 'Unknown') + '</td>'
      + '<td style="font-size:0.875rem;color:#6b7280">' + dateStr + '</td>'
      + '<td>' + (p.technical_score != null ? p.technical_score + '/100' : '<span style="color:#9ca3af">-</span>') + '</td>'
      + '<td>' + fin + '</td>'
      + '<td>' + badge + '</td>'
      + '<td><button class="btn-secondary text-sm" onclick="viewProposal(' + p.id + ')"><i class="fas fa-eye mr-1"></i>View</button></td>'
      + '</tr>';
  });

  const tableOrEmpty = proposals.length === 0
    ? '<div style="padding:3rem;text-align:center;color:#9ca3af">'
      + '<i class="fas fa-inbox" style="font-size:3rem;display:block;margin-bottom:1rem"></i>'
      + '<p>No proposals submitted yet.</p></div>'
    : '<div style="overflow-x:auto"><table><thead><tr><th>Vendor</th><th>Submitted</th><th>Tech Score</th><th>Financial</th><th>Status</th><th>Actions</th></tr></thead><tbody>' + rows + '</tbody></table></div>';

  setContent(
    '<div class="space-y-4">'
    + '<div style="display:flex;justify-content:space-between;align-items:center">'
    + '<p style="font-size:0.875rem;color:#6b7280">' + proposals.length + ' proposals received</p>'
    + '<button class="btn-primary" onclick="addSampleProposal()"><i class="fas fa-plus mr-2"></i>Add Sample Proposals</button>'
    + '</div>'
    + '<div class="card">' + tableOrEmpty + '</div>'
    + '</div>'
  );
};

// ============================================================
// PAGE: EVALUATION
// ============================================================
pages.evaluation = async function() {
  const evaluations = await apiCall('GET', '/evaluations');
  appState.evaluations = evaluations;

  let evalCards = '';
  if (evaluations.length === 0) {
    evalCards = '<div class="card p-10 text-center" style="color:#9ca3af">'
      + '<i class="fas fa-star-half-alt" style="font-size:3rem;display:block;margin-bottom:1rem"></i>'
      + '<p style="margin-bottom:1rem">No evaluations yet. Run AI evaluation to score all proposals.</p>'
      + '<button class="btn-primary" onclick="runEvaluation()"><i class="fas fa-robot mr-2"></i>Run AI Evaluation</button>'
      + '</div>';
  } else {
    evaluations.forEach(function(e) {
      const scores = [
        { label: 'Technical', val: e.technical_score },
        { label: 'Financial', val: e.financial_score },
        { label: 'Experience', val: e.experience_score },
      ];
      let scoresHtml = '';
      scores.forEach(function(s) {
        scoresHtml += '<div>'
          + '<div style="display:flex;justify-content:space-between;font-size:0.75rem;color:#6b7280;margin-bottom:4px"><span>' + s.label + '</span><span>' + (s.val || 0) + '/100</span></div>'
          + '<div class="score-bar"><div class="score-fill" style="width:' + (s.val || 0) + '%"></div></div>'
          + '</div>';
      });
      evalCards += '<div class="card p-5">'
        + '<div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:1rem">'
        + '<div><h3 style="font-weight:600;color:#1f2937">' + escHtml(e.vendor_name || 'Vendor') + '</h3></div>'
        + '<div style="text-align:right"><div style="font-size:1.75rem;font-weight:700;color:var(--cpc-gold)">' + (e.total_score || 0) + '</div>'
        + '<div style="font-size:0.75rem;color:#6b7280">Total Score / 100</div></div>'
        + '</div>'
        + '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1rem;margin-bottom:0.75rem">' + scoresHtml + '</div>'
        + (e.ai_summary ? '<p style="font-size:0.75rem;color:#4b5563;background:#f9fafb;border-radius:6px;padding:0.75rem">' + escHtml(e.ai_summary) + '</p>' : '')
        + '</div>';
    });
  }

  setContent(
    '<div class="space-y-4">'
    + '<div style="display:flex;justify-content:space-between;align-items:center">'
    + '<p style="font-size:0.875rem;color:#6b7280">' + evaluations.length + ' evaluations complete</p>'
    + '<div style="display:flex;gap:0.75rem">'
    + '<button class="btn-secondary" id="runEvalBtn" onclick="runEvaluation()"><i class="fas fa-robot mr-2"></i>Run AI Evaluation</button>'
    + '<button class="btn-primary" onclick="navigateTo(\'recommendation\')"><i class="fas fa-trophy mr-2"></i>View Recommendation</button>'
    + '</div></div>'
    + evalCards
    + '</div>'
  );
};

// ============================================================
// PAGE: RECOMMENDATION
// ============================================================
pages.recommendation = async function() {
  const rec = await apiCall('GET', '/recommendation').catch(function() { return null; });

  let content = '';
  if (!rec) {
    content = '<div class="card p-10 text-center" style="color:#9ca3af">'
      + '<i class="fas fa-trophy" style="font-size:3rem;display:block;margin-bottom:1rem"></i>'
      + '<p style="margin-bottom:1rem">No recommendation yet. Complete the evaluation first.</p>'
      + '<button class="btn-primary" onclick="generateRecommendation()"><i class="fas fa-robot mr-2"></i>Generate AI Recommendation</button>'
      + '</div>';
  } else {
    const rankings = rec.rankings || [];
    const medals = ['🥇', '🥈', '🥉'];
    let rankCards = '';
    rankings.forEach(function(r, i) {
      const isBest = i === 0;
      rankCards += '<div class="card p-5" style="' + (isBest ? 'border:2px solid var(--cpc-gold)' : '') + '">'
        + '<div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:0.75rem">'
        + '<div style="width:40px;height:40px;border-radius:50%;background:' + (isBest ? 'var(--cpc-gold)' : i===1 ? '#e5e7eb' : '#fef3c7') + ';display:flex;align-items:center;justify-content:center;font-size:1.25rem">' + (medals[i] || String(i+1)) + '</div>'
        + '<div><div style="font-weight:700;color:#1f2937">' + escHtml(r.vendor_name) + '</div>'
        + '<div style="font-size:0.75rem;color:#6b7280">Rank #' + (i+1) + '</div></div>'
        + '</div>'
        + '<div style="font-size:2rem;font-weight:700;color:var(--cpc-gold)">' + r.total_score + '</div>'
        + '<div style="font-size:0.75rem;color:#6b7280;margin-bottom:0.5rem">Total Score / 100</div>'
        + (isBest ? '<span class="stage-badge stage-awarded">Recommended</span>' : '')
        + '</div>';
    });

    content = '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1rem">' + rankCards + '</div>'
      + '<div class="card p-6">'
      + '<h2 style="font-size:1.125rem;font-weight:700;color:#1f2937;margin-bottom:0.75rem"><i class="fas fa-robot mr-2 cpc-gold"></i>AI Recommendation Summary</h2>'
      + '<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:1rem;color:#374151;line-height:1.7">' + (rec.summary || '') + '</div>'
      + '<div style="margin-top:1rem;display:flex;gap:0.75rem">'
      + '<button class="btn-primary" onclick="awardContract()"><i class="fas fa-handshake mr-2"></i>Award Contract</button>'
      + '<button class="btn-secondary" onclick="generateRecommendation()"><i class="fas fa-sync mr-2"></i>Regenerate</button>'
      + '</div></div>';
  }

  setContent('<div class="space-y-4">' + content + '</div>');
};

// ============================================================
// HTML ESCAPE HELPER
// ============================================================
function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ============================================================
// ACTION HANDLERS
// ============================================================
async function generateRFP() {
  const btn = document.getElementById('generateBtn');
  setLoading(btn, true, 'Generating...');
  try {
    const data = {
      title:             document.getElementById('rfpTitle').value,
      category:          document.getElementById('rfpCategory').value,
      budget:            document.getElementById('rfpBudget').value,
      deadline:          document.getElementById('rfpDeadline').value,
      scope:             document.getElementById('rfpScope').value,
      tech_requirements: document.getElementById('rfpTech').value
    };
    const result = await apiCall('POST', '/rfp/generate', data);
    document.getElementById('rfpPreview').innerHTML = result.content || '';
    appState.rfp = result;
    showToast('RFP generated successfully!', 'success');
  } catch(e) {
    // error already shown by apiCall
  } finally {
    setLoading(btn, false, '<i class="fas fa-robot mr-2"></i>Generate with AI');
  }
}

async function saveRFP() {
  const data = {
    title:             document.getElementById('rfpTitle').value,
    category:          document.getElementById('rfpCategory').value,
    budget:            document.getElementById('rfpBudget').value,
    deadline:          document.getElementById('rfpDeadline').value,
    scope:             document.getElementById('rfpScope').value,
    tech_requirements: document.getElementById('rfpTech').value
  };
  await apiCall('POST', '/rfp', data);
  showToast('RFP saved!', 'success');
}

async function advanceStage(stage) {
  await apiCall('POST', '/rfp/stage', { stage: stage });
  const labels = { published:'Published', qa_open:'Q&A Open', submissions_closed:'Submissions Closed', evaluation:'Evaluation', awarded:'Awarded' };
  showToast('Stage advanced to: ' + (labels[stage] || stage), 'success');
  navigateTo('dashboard');
}

async function toggleShortlist(vendorId, shortlist) {
  await apiCall('PUT', '/vendors/' + vendorId + '/shortlist', { shortlisted: shortlist });
  showToast(shortlist ? 'Vendor shortlisted!' : 'Removed from shortlist', 'success');
  navigateTo('vendors');
}

async function aiShortlist() {
  showToast('Running AI shortlisting...', 'info');
  await apiCall('POST', '/vendors/ai-shortlist', {});
  showToast('AI shortlisting complete!', 'success');
  navigateTo('vendors');
}

async function sendInvitations() {
  const shortlisted = appState.vendors.filter(function(v) { return v.shortlisted; });
  if (shortlisted.length === 0) { showToast('Please shortlist vendors first', 'error'); return; }
  await apiCall('POST', '/emails/send-invitations', {});
  showToast('Invitations sent to ' + shortlisted.length + ' vendors!', 'success');
  navigateTo('emails');
}

async function draftAnswer(qId) {
  const el = document.getElementById('q-' + qId);
  const btn = el && el.querySelector('button');
  if (btn) setLoading(btn, true, 'Drafting...');
  try {
    await apiCall('POST', '/questions/' + qId + '/draft', {});
    showToast('AI answer drafted!', 'success');
    navigateTo('qa');
  } catch(e) {
    if (btn) setLoading(btn, false, '<i class="fas fa-robot mr-1"></i>AI Draft');
  }
}

async function draftAllAnswers() {
  showToast('AI drafting all answers...', 'info');
  await apiCall('POST', '/questions/draft-all', {});
  showToast('All answers drafted!', 'success');
  navigateTo('qa');
}

async function approveAnswer(qId) {
  await apiCall('PUT', '/questions/' + qId + '/approve', {});
  showToast('Answer approved and published!', 'success');
  navigateTo('qa');
}

async function editAnswer(qId) {
  const q = appState.questions.find(function(q) { return q.id === qId; });
  if (!q) return;
  showModal(
    '<h3 style="font-size:1.125rem;font-weight:700;margin-bottom:1rem">Edit Answer for Q' + qId + '</h3>'
    + '<p style="color:#6b7280;margin-bottom:0.75rem">' + escHtml(q.question) + '</p>'
    + '<label>Answer</label>'
    + '<textarea id="editAnswerText" rows="6" style="margin-bottom:1rem">' + escHtml(q.answer || '') + '</textarea>'
    + '<div style="display:flex;gap:0.75rem">'
    + '<button class="btn-primary" onclick="saveAnswer(' + qId + ')">Save &amp; Approve</button>'
    + '<button class="btn-secondary" onclick="closeModal()">Cancel</button>'
    + '</div>'
  );
}

async function saveAnswer(qId) {
  const text = document.getElementById('editAnswerText').value;
  await apiCall('PUT', '/questions/' + qId + '/answer', { answer: text });
  showToast('Answer saved!', 'success');
  closeModal();
  navigateTo('qa');
}

async function publishAllAnswers() {
  await apiCall('POST', '/questions/publish-all', {});
  showToast('All approved answers published!', 'success');
  navigateTo('qa');
}

async function loadSampleQuestions() {
  await apiCall('POST', '/questions/load-samples', {});
  showToast('Sample questions loaded!', 'success');
  navigateTo('qa');
}

async function runEvaluation() {
  const btn = document.getElementById('runEvalBtn');
  if (btn) setLoading(btn, true, 'Running AI Evaluation...');
  try {
    await apiCall('POST', '/evaluations/run', {});
    showToast('AI evaluation complete!', 'success');
    navigateTo('evaluation');
  } catch(e) {
    if (btn) setLoading(btn, false, '<i class="fas fa-robot mr-2"></i>Run AI Evaluation');
  }
}

async function generateRecommendation() {
  showToast('Generating AI recommendation...', 'info');
  await apiCall('POST', '/recommendation/generate', {});
  showToast('Recommendation generated!', 'success');
  navigateTo('recommendation');
}

async function awardContract() {
  await apiCall('POST', '/rfp/stage', { stage: 'awarded' });
  showToast('Contract awarded successfully!', 'success');
  navigateTo('dashboard');
}

async function addSampleProposal() {
  await apiCall('POST', '/proposals/sample', {});
  showToast('Sample proposals added!', 'success');
  navigateTo('proposals');
}

function viewVendor(id) {
  const v = appState.vendors.find(function(v) { return v.id === id; });
  if (!v) return;
  const scoreBlock = v.fit_score
    ? '<div style="background:#fffbeb;border-radius:8px;padding:0.75rem;margin-bottom:1rem">'
      + '<div style="font-size:0.875rem;font-weight:600;color:#92400e;margin-bottom:4px">AI Fit Score: ' + v.fit_score + '/100</div>'
      + '<div class="score-bar"><div class="score-fill" style="width:' + v.fit_score + '%"></div></div>'
      + (v.fit_rationale ? '<p style="font-size:0.75rem;color:#4b5563;margin-top:0.5rem">' + escHtml(v.fit_rationale) + '</p>' : '')
      + '</div>'
    : '';
  showModal(
    '<div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:1rem">'
    + '<div style="width:48px;height:48px;border-radius:12px;background:var(--cpc-blue);display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:1.25rem">' + escHtml(v.name.charAt(0)) + '</div>'
    + '<div><h3 style="font-size:1.125rem;font-weight:700">' + escHtml(v.name) + '</h3>'
    + '<p style="color:#6b7280;font-size:0.875rem">' + escHtml(v.category || '') + '</p></div>'
    + '</div>'
    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;font-size:0.875rem;margin-bottom:1rem">'
    + '<div><label>Contact</label><p>' + escHtml(v.contact_name || '-') + '</p></div>'
    + '<div><label>Email</label><p>' + escHtml(v.contact_email || '-') + '</p></div>'
    + '<div><label>Country</label><p>' + escHtml(v.country || '-') + '</p></div>'
    + '<div><label>Size</label><p>' + escHtml(v.size || '-') + '</p></div>'
    + '<div><label>Certifications</label><p>' + escHtml(v.certifications || '-') + '</p></div>'
    + '<div><label>ERP Experience</label><p>' + escHtml(v.erp_experience || '-') + '</p></div>'
    + '</div>'
    + scoreBlock
    + '<button class="btn-secondary" style="width:100%" onclick="closeModal()">Close</button>'
  );
}

function viewProposal(id) {
  const p = appState.proposals.find(function(p) { return p.id === id; });
  if (!p) return;
  showModal(
    '<h3 style="font-size:1.125rem;font-weight:700;margin-bottom:1rem">Proposal from ' + escHtml(p.vendor_name || 'Unknown') + '</h3>'
    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;font-size:0.875rem;margin-bottom:1rem">'
    + '<div><label>Technical Score</label><p style="font-size:1.5rem;font-weight:700">' + (p.technical_score || '-') + '</p></div>'
    + '<div><label>Financial Proposal</label><p style="font-size:1.25rem;font-weight:700">' + (p.financial_proposal ? 'AED ' + Number(p.financial_proposal).toLocaleString() : '-') + '</p></div>'
    + '</div>'
    + (p.technical_proposal ? '<div style="margin-bottom:0.75rem"><label>Technical Proposal</label><div style="background:#f9fafb;border-radius:8px;padding:0.75rem;font-size:0.875rem;max-height:200px;overflow-y:auto">' + escHtml(p.technical_proposal) + '</div></div>' : '')
    + '<button class="btn-secondary" style="width:100%" onclick="closeModal()">Close</button>'
  );
}

// ============================================================
// START
// ============================================================
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
