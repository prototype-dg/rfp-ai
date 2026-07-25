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
  emails: [],
  receivedEmails: [],
  currentRfp: null,
  previousPage: null,
  unreadQA: false,
  notifications: [],
  unreadNotifications: 0,
};

// ============================================================
// UTILITIES
// ============================================================
function showToast(msg, type, duration) {
  type = type || 'info';
  duration = duration || 4000;
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show ' + type;
  setTimeout(function() { t.className = 'toast'; }, duration);
}

// ============================================================
// NOTIFICATION SYSTEM — bell icon + popup cards
// ============================================================
var _notifIdCounter = 0;

function addNotification(type, title, message, rfpId, tab, vendorId) {
  const id = ++_notifIdCounter;
  const notif = {
    id: id,
    type: type,          // 'email' | 'questions' | 'proposal' | 'info'
    title: title,
    message: message,
    rfpId: rfpId || null,
    tab: tab || null,
    vendorId: vendorId || null,
    time: new Date(),
    read: false,
  };
  appState.notifications.unshift(notif);
  if (appState.notifications.length > 50) appState.notifications.pop();
  appState.unreadNotifications = appState.notifications.filter(function(n){ return !n.read; }).length;
  updateBellBadge();
  showNotifPopup(notif);
}

function updateBellBadge() {
  const badge = document.getElementById('bellBadge');
  const count = appState.unreadNotifications;
  if (badge) {
    badge.textContent = count > 9 ? '9+' : String(count);
    badge.style.display = count > 0 ? 'flex' : 'none';
  }
}

function showNotifPopup(notif) {
  const icons = { email: 'fa-envelope', questions: 'fa-question-circle', proposal: 'fa-inbox', info: 'fa-info-circle', decline: 'fa-times-circle', stage: 'fa-flag' };
  const colors = { email: '#BA9765', questions: '#745B35', proposal: '#BA9765', info: '#6b7280', decline: '#dc2626', stage: '#16a34a' };
  const icon = icons[notif.type] || 'fa-bell';
  const color = colors[notif.type] || '#6b7280';
  const popupId = 'notif-popup-' + notif.id;
  const navigateBtn = (notif.rfpId && (notif.tab || notif.vendorId))
    ? '<button onclick="navigateFromNotif(' + notif.id + ')" style="background:' + color + ';color:white;border:none;border-radius:6px;padding:4px 10px;font-size:0.75rem;cursor:pointer;margin-right:6px">View</button>'
    : '';
  const popup = document.createElement('div');
  popup.id = popupId;
  popup.style.cssText = 'position:fixed;bottom:' + (80 + appState.notifications.filter(function(n,i){ return i < 5 && !n.popupDismissed; }).length * 0) + 'px;right:20px;z-index:10000;background:white;border:1px solid #e5e7eb;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,0.15);padding:14px 16px;min-width:300px;max-width:380px;animation:notifSlideIn 0.35s ease;border-left:4px solid ' + color;
  popup.innerHTML = '<div style="display:flex;align-items:flex-start;gap:10px">'
    + '<div style="width:32px;height:32px;border-radius:50%;background:' + color + '22;display:flex;align-items:center;justify-content:center;flex-shrink:0">'
    + '<i class="fas ' + icon + '" style="color:' + color + ';font-size:0.875rem"></i></div>'
    + '<div style="flex:1;min-width:0">'
    + '<div style="font-weight:700;font-size:0.82rem;color:#1f2937;margin-bottom:2px">' + escHtml(notif.title) + '</div>'
    + '<div style="font-size:0.77rem;color:#6b7280;line-height:1.4">' + escHtml(notif.message) + '</div>'
    + '<div style="margin-top:8px;display:flex;align-items:center">' + navigateBtn
    + '<button onclick="dismissNotifPopup(\'' + popupId + '\',' + notif.id + ')" style="background:#f3f4f6;color:#374151;border:none;border-radius:6px;padding:4px 10px;font-size:0.75rem;cursor:pointer">Dismiss</button>'
    + '</div></div>'
    + '<button onclick="dismissNotifPopup(\'' + popupId + '\',' + notif.id + ')" style="background:none;border:none;cursor:pointer;color:#9ca3af;font-size:1rem;line-height:1;padding:0;margin-left:4px">&times;</button>'
    + '</div>';
  // Stack popups
  var existingPopups = document.querySelectorAll('[id^="notif-popup-"]');
  var offset = 20;
  existingPopups.forEach(function(p) { offset += p.offsetHeight + 10; });
  popup.style.bottom = offset + 'px';
  document.body.appendChild(popup);
  // Auto-dismiss after 8 seconds
  setTimeout(function() { dismissNotifPopup(popupId, notif.id); }, 8000);
}

function dismissNotifPopup(popupId, notifId) {
  const popup = document.getElementById(popupId);
  if (popup) {
    popup.style.animation = 'notifSlideOut 0.3s ease forwards';
    setTimeout(function() { if (popup.parentNode) popup.parentNode.removeChild(popup); repositionPopups(); }, 300);
  }
  const notif = appState.notifications.find(function(n){ return n.id === notifId; });
  if (notif) notif.popupDismissed = true;
}

function repositionPopups() {
  var popups = Array.from(document.querySelectorAll('[id^="notif-popup-"]'));
  var offset = 20;
  popups.forEach(function(p) {
    p.style.bottom = offset + 'px';
    offset += p.offsetHeight + 10;
  });
}

function navigateFromNotif(notifId) {
  const notif = appState.notifications.find(function(n){ return n.id === notifId; });
  if (!notif) return;
  markNotifRead(notifId);
  dismissNotifPopup('notif-popup-' + notifId, notifId);
  if (notif.rfpId && notif.vendorId) {
    // Navigate to vendor-specific communications page
    navigateTo('vendor_comms', { rfpId: notif.rfpId, vendorId: notif.vendorId });
  } else if (notif.rfpId && notif.tab) {
    navigateTo('rfp_detail', { rfpId: notif.rfpId });
    setTimeout(function() { switchRfpTab(notif.tab, notif.rfpId); }, 400);
  }
}

function markNotifRead(notifId) {
  const notif = appState.notifications.find(function(n){ return n.id === notifId; });
  if (notif) notif.read = true;
  appState.unreadNotifications = appState.notifications.filter(function(n){ return !n.read; }).length;
  updateBellBadge();
}

function markAllNotifsRead() {
  appState.notifications.forEach(function(n){ n.read = true; });
  appState.unreadNotifications = 0;
  updateBellBadge();
}

function toggleNotifPanel() {
  var panel = document.getElementById('notifPanel');
  if (!panel) return;
  var isOpen = panel.style.display !== 'none';
  if (isOpen) {
    panel.style.display = 'none';
  } else {
    renderNotifPanel();
    panel.style.display = 'block';
    markAllNotifsRead();
  }
}

function renderNotifPanel() {
  var panel = document.getElementById('notifPanel');
  if (!panel) return;
  const typeColors = { email: '#BA9765', questions: '#745B35', proposal: '#BA9765', info: '#6b7280', decline: '#dc2626', stage: '#16a34a' };
  const typeIcons = { email: 'fa-envelope', questions: 'fa-question-circle', proposal: 'fa-inbox', info: 'fa-info-circle', decline: 'fa-times-circle', stage: 'fa-flag' };
  let html = '<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid #f3f4f6">'
    + '<span style="font-weight:700;font-size:0.875rem;color:#1f2937"><i class="fas fa-bell mr-1"></i>Notifications</span>'
    + '<button onclick="markAllNotifsRead();renderNotifPanel()" style="font-size:0.72rem;color:var(--cpc-gold-deep);background:none;border:none;cursor:pointer">Mark all read</button>'
    + '</div>';
  if (appState.notifications.length === 0) {
    html += '<div style="padding:2rem;text-align:center;color:#9ca3af;font-size:0.82rem"><i class="fas fa-bell-slash" style="display:block;font-size:1.5rem;margin-bottom:0.5rem"></i>No notifications yet</div>';
  } else {
    html += '<div style="max-height:400px;overflow-y:auto">';
    appState.notifications.slice(0, 20).forEach(function(n) {
      const color = typeColors[n.type] || '#6b7280';
      const icon = typeIcons[n.type] || 'fa-bell';
      const timeStr = n.time ? n.time.toLocaleTimeString('en-AE', { hour: '2-digit', minute: '2-digit' }) : '';
      const unreadDot = !n.read ? '<span style="width:8px;height:8px;border-radius:50%;background:var(--cpc-gold);display:inline-block;margin-left:4px"></span>' : '';
      const clickable = (n.rfpId && n.tab) ? 'cursor:pointer' : '';
      html += '<div style="padding:10px 16px;border-bottom:1px solid #f9fafb;display:flex;gap:10px;align-items:flex-start;' + (n.read ? '' : 'background:#faf5ff;') + '" '
        + (n.rfpId && n.tab ? 'onclick="navigateFromNotif(' + n.id + ');toggleNotifPanel()" style="' + clickable + '"' : '') + '>'
        + '<div style="width:28px;height:28px;border-radius:50%;background:' + color + '22;display:flex;align-items:center;justify-content:center;flex-shrink:0">'
        + '<i class="fas ' + icon + '" style="color:' + color + ';font-size:0.75rem"></i></div>'
        + '<div style="flex:1;min-width:0">'
        + '<div style="font-weight:600;font-size:0.8rem;color:#1f2937">' + escHtml(n.title) + unreadDot + '</div>'
        + '<div style="font-size:0.75rem;color:#6b7280;line-height:1.4">' + escHtml(n.message) + '</div>'
        + '<div style="font-size:0.7rem;color:#9ca3af;margin-top:2px">' + timeStr + '</div>'
        + '</div></div>';
    });
    html += '</div>';
  }
  panel.innerHTML = html;
}

// Close notif panel when clicking outside
document.addEventListener('click', function(e) {
  const panel = document.getElementById('notifPanel');
  const bell = document.getElementById('bellBtn');
  if (panel && panel.style.display !== 'none' && !panel.contains(e.target) && e.target !== bell && !bell.contains(e.target)) {
    panel.style.display = 'none';
  }
});

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

// Returns short label text for an attachment label value
function attachmentLabelText(label) {
  if (label === 'technical') return 'Technical';
  if (label === 'commercial') return 'Commercial';
  return 'Document';
}

// Returns colour-coded pill HTML for an attachment label
function attachmentLabelPill(label) {
  var colors = {
    technical:  'background:#eff6ff;color:var(--cpc-ink);border:1px solid #bfdbfe',
    commercial: 'background:#f0fdf4;color:#15803d;border:1px solid #bbf7d0',
    other:      'background:#f9fafb;color:#6b7280;border:1px solid #e5e7eb',
  };
  var style = colors[label] || colors.other;
  return '<span style="' + style + ';font-size:0.65rem;font-weight:700;padding:1px 6px;border-radius:4px;text-transform:uppercase;letter-spacing:0.04em">' + attachmentLabelText(label) + '</span>';
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
    draft: 'Publish RFP',
    published: 'Invite',
    qa_open: 'Q&A',
    submissions_closed: 'Proposals',
    evaluation: 'Proposals',   // legacy compat
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
// 5 stages — Evaluation removed; renamed per v9 spec
var STAGES = ['draft','published','qa_open','submissions_closed','awarded'];
var STAGE_LABELS = ['Publish\nRFP','Invite','Q&A','Proposals','Award'];
var STAGE_ICONS = ['fa-paper-plane','fa-envelope-open-text','fa-comments','fa-inbox','fa-trophy'];

// Explicit completion flags — keyed by rfpId, set when each milestone is reached
// Keys: publish, invite, qa, proposals, award
var _stageCompleted = {};

function getCompletedFlags(rfpId) {
  return _stageCompleted[rfpId] || {};
}

function markStageCompleted(rfpId, key) {
  if (!_stageCompleted[rfpId]) _stageCompleted[rfpId] = {};
  _stageCompleted[rfpId][key] = true;
  // Award implies proposals also done
  if (key === 'award') _stageCompleted[rfpId]['proposals'] = true;
}

function renderLifecycleBar(rfp) {
  if (!rfp) return;
  const rfpId = rfp.id;
  const stage = rfp.stage || 'draft';
  const flags = getCompletedFlags(rfpId);

  // Determine completion per stage from explicit flags
  // Stage order: draft(0), published(1), qa_open(2), submissions_closed(3), awarded(4)
  // 'publish'   → step 0 done when stage moved past draft OR flag set
  // 'invite'    → step 1 done when flag set
  // 'qa'        → step 2 done when flag set
  // 'proposals' → step 3 done when flag set (set together with award)
  // 'award'     → step 4 done when flag set

  const stageIdx = STAGES.indexOf(stage);
  const completionMap = [
    flags.publish  || stageIdx > 0,                                           // Publish RFP: done once past draft
    flags.invite   || stageIdx >= 2,                                           // Invite: done once stage is qa_open or beyond
    flags.qa       || stageIdx >= 3 || stage === 'submissions_closed' || stage === 'awarded',  // Q&A
    flags.proposals || stage === 'awarded',                                    // Proposals
    flags.award,                                                               // Award
  ];

  // Active step: first step not yet completed
  let activeIdx = -1;
  for (let i = 0; i < STAGES.length; i++) {
    if (!completionMap[i]) { activeIdx = i; break; }
  }
  if (activeIdx === -1) activeIdx = STAGES.length - 1; // all done

  let html = '';
  for (let i = 0; i < STAGES.length; i++) {
    let cls;
    if (completionMap[i]) {
      cls = 'lc-done';
    } else if (i === activeIdx) {
      cls = 'lc-active';
    } else {
      cls = 'lc-pending';
    }
    const icon = completionMap[i] ? 'fa-check' : STAGE_ICONS[i];
    const labelLines = STAGE_LABELS[i].split('\n');
    html += '<div class="lc-step ' + cls + '">';
    html += '<div class="lc-node">';
    html += '<div class="lc-circle" style="display:flex;align-items:center;justify-content:center"><i class="fas ' + icon + '" style="font-size:0.72rem;line-height:1"></i></div>';
    html += '<div class="lc-label">' + labelLines.join('<br>') + '</div>';
    html += '</div>';
    if (i < STAGES.length - 1) html += '<div class="lc-connector"></div>';
    html += '</div>';
  }
  // No info pill

  document.getElementById('lifecycleBar').innerHTML = '<div class="lifecycle-bar">' + html + '</div>';
  document.getElementById('lifecycleBar').style.display = 'block';
}

// ============================================================
// RFP TABS BAR
// ============================================================
var RFP_TABS = [
  { id: 'generate',        icon: 'fa-file-alt',      label: 'Generate' },
  { id: 'vendors',         icon: 'fa-building',       label: 'Vendors' },
  { id: 'qa',              icon: 'fa-comments',       label: 'Q&A' },
  { id: 'proposals',       icon: 'fa-inbox',          label: 'Proposals' },
];

function renderRfpTabs(activeTab, rfpId, qaBadge) {
  let html = '<div class="rfp-tabs">';
  RFP_TABS.forEach(function(tab) {
    const isActive = tab.id === activeTab;
    const qaBadgeHtml = (tab.id === 'qa' && qaBadge) ? '<span style="background:#ef4444;color:white;border-radius:10px;padding:1px 6px;font-size:0.68rem;margin-left:4px">!</span>' : '';
    const emailBadgeCount = appState.unreadEmailCount || 0;
    const emailBadgeHtml = (tab.id === 'emails' && emailBadgeCount > 0) ? '<span style="background:var(--cpc-gold);color:white;border-radius:10px;padding:1px 6px;font-size:0.68rem;margin-left:4px">' + emailBadgeCount + '</span>' : '';
    html += '<div class="rfp-tab' + (isActive ? ' active' : '') + '" onclick="switchRfpTab(\'' + tab.id + '\',' + rfpId + ')">';
    html += '<i class="fas ' + tab.icon + '"></i>' + escHtml(tab.label) + qaBadgeHtml + emailBadgeHtml;
    html += '</div>';
  });
  html += '</div>';
  document.getElementById('rfpTabsBar').innerHTML = html;
  document.getElementById('rfpTabsBar').style.display = 'block';
}

function switchRfpTab(tab, rfpId) {
  appState.currentRfpTab = tab;
  // Clear Q&A unread badge when user navigates to the Q&A tab
  if (tab === 'qa' && appState.unreadQA) {
    appState.unreadQA = false;
  }
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
  let stats;
  try {
    stats = await apiCall('GET', '/stats');
  } catch(e) {
    stats = { totalRfps:0, activeRfps:0, awardedRfps:0, winRate:0, totalVendors:0, totalProposals:0, totalEmails:0, avgDuration:null, stageBreakdown:[] };
  }

  const stageBreakdown = stats.stageBreakdown || [];
  const maxStage = stageBreakdown.reduce(function(m,s){ return Math.max(m, s.cnt); }, 1);

  // KPI cards
  const kpis = [
    { label:'Total RFPs',      value: stats.totalRfps || 0,      icon:'fa-layer-group',   color:'#745B35', sub: (stats.activeRfps||0) + ' active' },
    { label:'Win Rate',        value: (stats.winRate||0) + '%',  icon:'fa-trophy',        color:'#BA9765', sub: (stats.awardedRfps||0) + ' awarded' },
    { label:'Avg Duration',    value: stats.avgDuration ? stats.avgDuration + 'd' : 'N/A', icon:'fa-clock', color:'#065f46', sub: 'per RFP cycle' },
    { label:'Vendor Pool',     value: stats.totalVendors || 0,   icon:'fa-building',      color:'#BA9765', sub: 'registered vendors' },
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

  // Split into active and archived (awarded = archived)
  const activeRfps = rfps.filter(function(r){ return r.stage !== 'awarded'; });
  const archivedRfps = rfps.filter(function(r){ return r.stage === 'awarded'; });

  function buildRfpCard(rfp) {
    const stage = rfp.stage || 'draft';
    const isArchived = stage === 'awarded';
    const badgeCls = stageBadgeClass(stage);
    const stageLabel = stageLabelMap(stage);
    const stageIdx = STAGES.indexOf(stage);
    const progress = Math.round(((stageIdx + 1) / STAGES.length) * 100);
    const dateStr = rfp.created_at ? new Date(rfp.created_at).toLocaleDateString('en-AE', {year:'numeric',month:'short',day:'numeric'}) : '-';

    return '<div class="rfp-card" onclick="openRfp(' + rfp.id + ')" style="' + (isArchived ? 'opacity:0.85;border-left:4px solid var(--cpc-gold)' : '') + '">'
      + '<div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:0.75rem">'
      + '<div style="flex:1;min-width:0">'
      + '<div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.3rem">'
      + '<span style="font-size:0.72rem;color:#9ca3af;font-family:monospace">' + escHtml(rfp.ref_number||'') + '</span>'
      + '<span class="stage-badge ' + badgeCls + '">' + stageLabel + '</span>'
      + (isArchived ? '<span style="background:#d1fae5;color:#065f46;border-radius:4px;padding:1px 6px;font-size:0.68rem;font-weight:700"><i class="fas fa-trophy mr-1"></i>Awarded</span>' : '')
      + '</div>'
      + '<h3 style="font-weight:700;color:#1f2937;font-size:0.97rem;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + escHtml(rfp.title||'Untitled RFP') + '</h3>'
      + '<p style="color:#6b7280;font-size:0.8rem;margin:0.2rem 0 0">' + escHtml(rfp.category||'') + ' &bull; Created ' + dateStr + '</p>'
      + '</div>'
      + '<div style="margin-left:1rem;text-align:right;flex-shrink:0">'
      + (isArchived
        ? '<div style="font-size:1.1rem;font-weight:700;color:#065f46"><i class="fas fa-trophy"></i></div><div style="font-size:0.7rem;color:#9ca3af">Completed</div>'
        : '<div style="font-size:1.5rem;font-weight:700;color:var(--cpc-ink)">' + progress + '%</div><div style="font-size:0.7rem;color:#9ca3af">Complete</div>')
      + '</div>'
      + '</div>'
      + '<div style="margin-bottom:0.5rem">'
      + '<div style="height:4px;border-radius:2px;background:#e5e7eb;overflow:hidden">'
      + '<div style="height:100%;background:' + (isArchived ? 'var(--cpc-gold)' : 'linear-gradient(90deg,var(--cpc-ink),var(--cpc-gold))') + ';width:100%;border-radius:2px"></div>'
      + '</div></div>'
      + '<div style="display:flex;align-items:center;justify-content:space-between">'
      + '<div style="font-size:0.78rem;color:#9ca3af">'
      + (rfp.deadline ? '<i class="fas fa-calendar-alt" style="margin-right:4px"></i>Deadline: ' + new Date(rfp.deadline).toLocaleDateString('en-AE') : '<i class="fas fa-infinity" style="margin-right:4px"></i>No deadline set')
      + '</div>'
      + '<div style="font-size:0.78rem;color:' + (isArchived ? '#065f46' : 'var(--cpc-ink)') + ';font-weight:600">Open <i class="fas fa-arrow-right" style="margin-left:4px"></i></div>'
      + '</div>'
      + '</div>';
  }

  let activeCardsHtml = '';
  activeRfps.forEach(function(rfp) { activeCardsHtml += buildRfpCard(rfp); });

  let archivedCardsHtml = '';
  archivedRfps.forEach(function(rfp) { archivedCardsHtml += buildRfpCard(rfp); });

  let content = '<div style="display:flex;flex-direction:column;gap:1.5rem">'
    + '<div style="display:flex;align-items:center;justify-content:space-between">'
    + '<div><h2 style="font-weight:700;color:#1f2937;font-size:1rem;margin:0">Active Procurements</h2>'
    + '<p style="color:#9ca3af;font-size:0.82rem;margin:0">' + activeRfps.length + ' RFP' + (activeRfps.length !== 1 ? 's' : '') + ' in progress</p></div>'
    + '<button class="btn-primary" onclick="showCreateRfpModal()"><i class="fas fa-plus"></i>New RFP</button>'
    + '</div>';

  if (activeRfps.length === 0) {
    content += '<div class="card" style="padding:2rem;text-align:center;color:#9ca3af"><i class="fas fa-check-circle" style="font-size:2rem;display:block;margin-bottom:0.75rem;color:#d1d5db"></i><p>No active procurements — all RFPs have been awarded!</p></div>';
  } else {
    content += '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:1rem">' + activeCardsHtml + '</div>';
  }

  if (archivedRfps.length > 0) {
    content += '<div style="border-top:2px solid #e5e7eb;padding-top:1.25rem">'
      + '<div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:1rem">'
      + '<div style="width:32px;height:32px;border-radius:8px;background:#d1fae5;display:flex;align-items:center;justify-content:center">'
      + '<i class="fas fa-archive" style="color:#065f46;font-size:0.875rem"></i></div>'
      + '<div><h3 style="font-weight:700;color:#374151;font-size:0.92rem;margin:0">Archived — Awarded Contracts</h3>'
      + '<p style="font-size:0.78rem;color:#9ca3af;margin:0">' + archivedRfps.length + ' completed procurement' + (archivedRfps.length !== 1 ? 's' : '') + '</p>'
      + '</div></div>'
      + '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:1rem">' + archivedCardsHtml + '</div>'
      + '</div>';
  }

  content += '</div>';
  setContent(content);
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

  // Always start background inbox poller when opening any RFP detail page
  // so new emails (questions/proposals) are detected even without sending invitations first.
  startGlobalInboxPolling(rfpId);
};

// ============================================================
// RFP TABS
// ============================================================
var rfpTabs = {};

// --- TAB: GENERATE ---
// Default scoring matrix template
var DEFAULT_SCORING_MATRIX = [
  { criterion: 'Technical Approach & Methodology', weight: 30, description: 'Quality and clarity of the proposed technical approach, architecture, and methodology' },
  { criterion: 'Functional Fit & Solution Quality', weight: 25, description: 'Degree to which the proposed solution meets functional and reporting requirements' },
  { criterion: 'Team Qualifications & Experience', weight: 20, description: 'Relevant experience and qualifications of the proposed team and track record on comparable projects' },
  { criterion: 'Financial Proposal', weight: 15, description: 'Cost competitiveness, clarity of pricing, and total cost of ownership' },
  { criterion: 'Implementation Plan & Timeline', weight: 10, description: 'Feasibility and completeness of the implementation plan, milestones and risk mitigation' },
];

function getScoringMatrix(rfp) {
  if (rfp && rfp.scoring_matrix) {
    try {
      var m = typeof rfp.scoring_matrix === 'string' ? JSON.parse(rfp.scoring_matrix) : rfp.scoring_matrix;
      if (Array.isArray(m) && m.length > 0) return m;
    } catch(_) {}
  }
  return JSON.parse(JSON.stringify(DEFAULT_SCORING_MATRIX));
}

// Render the compact READ-ONLY summary shown inline on the Generate tab
function renderScoringMatrixSummary(matrix) {
  var total = matrix.reduce(function(s, r){ return s + (Number(r.weight)||0); }, 0);
  var totalOk = total === 100;
  var rows = matrix.map(function(r){
    return '<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 10px;border-bottom:1px solid var(--cpc-line)">'
      + '<span style="font-size:0.82rem;color:var(--cpc-ink);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding-right:8px">' + escHtml(r.criterion||'') + '</span>'
      + '<span style="font-family:\'JetBrains Mono\',monospace;font-size:0.8rem;font-weight:700;color:var(--cpc-gold-deep);background:var(--cpc-gold-tint);border:1px solid var(--cpc-line);border-radius:5px;padding:2px 8px;flex-shrink:0">' + (r.weight||0) + '%</span>'
      + '</div>';
  }).join('');
  return '<div style="border:1px solid var(--cpc-line);border-radius:6px;overflow:hidden">'
    + rows
    + '<div style="padding:6px 10px;display:flex;align-items:center;justify-content:space-between;background:var(--cpc-ivory)">'
    + '<span style="font-family:\'JetBrains Mono\',monospace;font-size:11px;font-weight:700;color:' + (totalOk ? '#065f46' : '#dc2626') + '">'
    + 'Total: ' + total + '%' + (totalOk ? ' ✓' : ' ⚠') + '</span>'
    + '</div>'
    + '</div>';
}

// Render the FULL editable table used inside the modal
function renderScoringMatrixEditor(matrix) {
  var total = matrix.reduce(function(s, r){ return s + (Number(r.weight)||0); }, 0);
  var totalColor = total === 100 ? '#065f46' : '#dc2626';
  var rows = matrix.map(function(r, i){
    return '<tr>'
      + '<td style="padding:8px 10px;border:1px solid var(--cpc-line)">'
      + '<input id="sm_crit_' + i + '" value="' + escHtml(r.criterion) + '" '
      + 'style="width:100%;border:none;background:transparent;font-size:13px;font-family:inherit;outline:none;color:var(--cpc-ink)" '
      + 'placeholder="Criterion name" oninput="updateScoringMatrixRow(' + i + ')">'
      + '</td>'
      + '<td style="padding:8px 10px;border:1px solid var(--cpc-line);width:72px;text-align:center">'
      + '<input id="sm_wt_' + i + '" type="number" min="0" max="100" value="' + (r.weight||0) + '" '
      + 'style="width:52px;border:none;background:transparent;font-size:13px;font-family:\'JetBrains Mono\',monospace;text-align:center;outline:none;color:var(--cpc-ink);font-weight:700" '
      + 'oninput="updateScoringMatrixRow(' + i + ')">'
      + '</td>'
      + '<td style="padding:8px 10px;border:1px solid var(--cpc-line)">'
      + '<input id="sm_desc_' + i + '" value="' + escHtml(r.description||'') + '" '
      + 'style="width:100%;border:none;background:transparent;font-size:12px;font-family:inherit;outline:none;color:#4b5563" '
      + 'placeholder="Describe what this criterion evaluates..." oninput="updateScoringMatrixRow(' + i + ')">'
      + '</td>'
      + '<td style="padding:4px 6px;border:1px solid var(--cpc-line);width:32px;text-align:center">'
      + '<button onclick="removeScoringMatrixRow(' + i + ')" class="btn-ghost btn-sm" style="padding:3px 6px;color:#dc2626" title="Remove"><i class="fas fa-times"></i></button>'
      + '</td>'
      + '</tr>';
  }).join('');
  return '<table style="width:100%;border-collapse:collapse;font-size:13px">'
    + '<thead><tr style="background:var(--cpc-gold-tint)">'
    + '<th style="padding:9px 10px;text-align:left;font-family:\'JetBrains Mono\',monospace;font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:var(--cpc-gold-deep);border-bottom:2px solid var(--cpc-line)">Criterion</th>'
    + '<th style="padding:9px 10px;text-align:center;font-family:\'JetBrains Mono\',monospace;font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:var(--cpc-gold-deep);border-bottom:2px solid var(--cpc-line);width:72px">Wt %</th>'
    + '<th style="padding:9px 10px;text-align:left;font-family:\'JetBrains Mono\',monospace;font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:var(--cpc-gold-deep);border-bottom:2px solid var(--cpc-line)">Description</th>'
    + '<th style="width:32px;border-bottom:2px solid var(--cpc-line)"></th>'
    + '</tr></thead>'
    + '<tbody>' + rows + '</tbody>'
    + '</table>'
    + '<div style="padding:8px 12px;display:flex;align-items:center;justify-content:space-between;background:var(--cpc-ivory);border-top:1px solid var(--cpc-line)">'
    + '<button onclick="addScoringMatrixRow()" class="btn-ghost btn-sm" style="font-size:12px"><i class="fas fa-plus"></i>Add Criterion</button>'
    + '<span id="smTotal" style="font-family:\'JetBrains Mono\',monospace;font-size:12px;font-weight:700;color:' + totalColor + '">Total: ' + total + '%' + (total !== 100 ? ' ⚠ must be 100%' : ' ✓') + '</span>'
    + '</div>';
}

// Open the scoring matrix edit modal
function openScoringMatrixModal(rfpId) {
  // Sync working copy from DOM state
  var matrix = window._currentScoringMatrix || getScoringMatrix(appState.currentRfp);
  window._currentScoringMatrix = JSON.parse(JSON.stringify(matrix));

  showModal(
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem">'
    + '<div>'
    + '<h3 style="font-size:1rem;font-weight:700;margin:0"><i class="fas fa-balance-scale cpc-gold" style="margin-right:8px"></i>Evaluation Scoring Matrix</h3>'
    + '<p style="font-size:0.75rem;color:#9ca3af;margin:4px 0 0 0">Define criteria and weights used in AI generation and vendor evaluation. Weights must sum to 100%.</p>'
    + '</div>'
    + '</div>'
    + '<div style="border:1px solid var(--cpc-line);border-radius:6px;overflow:hidden;margin-bottom:1rem" id="scoringMatrixEditor">'
    + renderScoringMatrixEditor(window._currentScoringMatrix)
    + '</div>'
    + '<div style="display:flex;gap:8px;justify-content:flex-end">'
    + '<button class="btn-ghost" onclick="closeModal()">Cancel</button>'
    + '<button class="btn-primary" onclick="saveScoringMatrixAndClose(' + rfpId + ')"><i class="fas fa-save"></i>Save Matrix</button>'
    + '</div>'
  );
}

// Save from modal and close, refreshing the inline summary
async function saveScoringMatrixAndClose(rfpId) {
  var matrix = window._currentScoringMatrix || getScoringMatrix(appState.currentRfp);
  var total = matrix.reduce(function(s,r){ return s+(Number(r.weight)||0); }, 0);
  if (total !== 100) { showToast('Weights must sum to 100%. Current total: ' + total + '%.', 'error'); return; }
  try {
    await apiCall('POST', '/rfps/' + rfpId + '/scoring-matrix', { matrix: matrix });
    if (appState.currentRfp) appState.currentRfp.scoring_matrix = JSON.stringify(matrix);
    // Refresh inline summary
    var summaryDiv = document.getElementById('scoringMatrixSummary');
    if (summaryDiv) summaryDiv.innerHTML = renderScoringMatrixSummary(matrix);
    showToast('Scoring matrix saved.', 'success');
    closeModal();
  } catch(e) { /* apiCall shows error toast */ }
}

function updateScoringMatrixRow(i) {
  // read current matrix from DOM — do not touch appState.currentRfp directly
  var matrix = window._currentScoringMatrix || getScoringMatrix(appState.currentRfp);
  if (!matrix[i]) return;
  var critEl = document.getElementById('sm_crit_' + i);
  var wtEl   = document.getElementById('sm_wt_' + i);
  var descEl = document.getElementById('sm_desc_' + i);
  if (critEl) matrix[i].criterion = critEl.value;
  if (wtEl)   matrix[i].weight    = Number(wtEl.value) || 0;
  if (descEl) matrix[i].description = descEl.value;
  window._currentScoringMatrix = matrix;
  // Update total indicator
  var total = matrix.reduce(function(s,r){ return s+(Number(r.weight)||0); }, 0);
  var el = document.getElementById('smTotal');
  if (el) {
    el.style.color = total === 100 ? '#065f46' : '#dc2626';
    el.textContent = 'Total: ' + total + '%' + (total !== 100 ? ' ⚠ must be 100%' : ' ✓');
  }
}

function addScoringMatrixRow() {
  var matrix = window._currentScoringMatrix || getScoringMatrix(appState.currentRfp);
  matrix.push({ criterion: '', weight: 0, description: '' });
  window._currentScoringMatrix = matrix;
  var smDiv = document.getElementById('scoringMatrixEditor');
  if (smDiv) smDiv.innerHTML = renderScoringMatrixEditor(matrix);
  // focus new criterion input
  var newInput = document.getElementById('sm_crit_' + (matrix.length - 1));
  if (newInput) { newInput.focus(); newInput.select(); }
}

function removeScoringMatrixRow(i) {
  var matrix = window._currentScoringMatrix || getScoringMatrix(appState.currentRfp);
  matrix.splice(i, 1);
  window._currentScoringMatrix = matrix;
  var smDiv = document.getElementById('scoringMatrixEditor');
  if (smDiv) smDiv.innerHTML = renderScoringMatrixEditor(matrix);
}

// Legacy save (kept for compatibility — modal path now uses saveScoringMatrixAndClose)
async function saveScoringMatrix(rfpId) {
  var matrix = window._currentScoringMatrix || getScoringMatrix(appState.currentRfp);
  var total = matrix.reduce(function(s,r){ return s+(Number(r.weight)||0); }, 0);
  if (total !== 100) { showToast('Weights must sum to 100%. Current total: ' + total + '%.', 'error'); return; }
  try {
    await apiCall('POST', '/rfps/' + rfpId + '/scoring-matrix', { matrix: matrix });
    if (appState.currentRfp) appState.currentRfp.scoring_matrix = JSON.stringify(matrix);
    var summaryDiv = document.getElementById('scoringMatrixSummary');
    if (summaryDiv) summaryDiv.innerHTML = renderScoringMatrixSummary(matrix);
    showToast('Scoring matrix saved.', 'success');
  } catch(e) { /* apiCall shows error */ }
}

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

  // Init scoring matrix from RFP or defaults
  var scoringMatrix = getScoringMatrix(rfp);
  window._currentScoringMatrix = JSON.parse(JSON.stringify(scoringMatrix));

  const previewHtml = hasContent
    ? rfp.content
    : '<div style="text-align:center;padding:3rem 1.5rem;color:#9ca3af">'
      + '<i class="fas fa-file-alt" style="font-size:2.5rem;display:block;margin-bottom:1rem;color:#d1d5db"></i>'
      + '<p style="margin:0">Fill in the details and click <strong>Generate with AI</strong> to produce a professional RFP document</p>'
      + '</div>';

  setContent(
    '<div style="display:grid;grid-template-columns:460px 1fr;gap:1.25rem;height:calc(100vh - 240px)">'
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
    + '<div class="form-group"><label>Project Background <span style="color:#ef4444">*</span></label><textarea id="rfpBackground" rows="3" placeholder="Describe the current situation, business problem, and strategic drivers...">' + escHtml(bgVal) + '</textarea></div>'
    + '<div class="form-group"><label>Objectives <span style="color:#ef4444">*</span></label><textarea id="rfpObjectives" rows="3" placeholder="List 4-6 measurable objectives for this project...">' + escHtml(objVal) + '</textarea></div>'
    + '<div class="form-group"><label>Scope of Work <span style="color:#ef4444">*</span></label><textarea id="rfpScope" rows="4" placeholder="Detail the work phases, deliverables, and what is in/out of scope...">' + escHtml(scopeVal) + '</textarea></div>'
    + '<div class="form-group"><label>Technical Requirements</label><textarea id="rfpTech" rows="3" placeholder="Infrastructure, hosting, security, compliance, integration specs...">' + escHtml(techVal) + '</textarea></div>'
    // SCORING MATRIX SECTION — read-only summary + Edit Matrix modal button
    + '<div style="border-top:1px solid var(--cpc-line);padding-top:0.875rem;margin-top:0.25rem">'
    + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">'
    + '<label style="margin:0;font-weight:600;color:var(--cpc-ink);font-size:0.82rem"><i class="fas fa-balance-scale cpc-gold" style="margin-right:6px"></i>Evaluation Scoring Matrix</label>'
    + '<button onclick="openScoringMatrixModal(' + rfpId + ')" class="btn-ghost btn-sm" style="font-size:11px;display:flex;align-items:center;gap:4px"><i class="fas fa-edit"></i>Edit Matrix</button>'
    + '</div>'
    + '<div id="scoringMatrixSummary">' + renderScoringMatrixSummary(window._currentScoringMatrix) + '</div>'
    + '</div>'
    // END SCORING MATRIX SECTION
    + '<div style="display:flex;gap:0.5rem;padding-top:0.25rem">'
    + '<button class="btn-primary" id="genBtn" style="flex:1" onclick="generateRfpDoc(' + rfpId + ')"><i class="fas fa-robot"></i>Generate with AI</button>'
    + '<button class="btn-secondary" onclick="saveRfpFields(' + rfpId + ')"><i class="fas fa-save"></i>Save</button>'
    + '</div>'
    + '<div id="genActionButtons" style="' + (hasContent ? 'display:flex' : 'display:none') + ';gap:0.5rem">'
      + '<button class="btn-ghost" style="flex:1" onclick="downloadRfpPdf(' + rfpId + ')"><i class="fas fa-file-pdf"></i>Download PDF</button>'
      + advanceStageButton(rfp)
      + '</div>'
    + '</div>'
    // RIGHT: preview
    + '<div class="card" style="overflow-y:auto;padding:0">'
    + '<div style="padding:0.875rem 1.25rem;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;justify-content:space-between;background:#f9fafb">'
    + '<span style="font-weight:600;color:#374151;font-size:0.88rem"><i class="fas fa-eye cpc-gold" style="margin-right:6px"></i>RFP Preview</span>'
    + '<button id="genPreviewPdfBtn" class="btn-ghost btn-sm" onclick="downloadRfpPdf(' + rfpId + ')" style="' + (hasContent ? '' : 'display:none') + '"><i class="fas fa-download"></i>PDF</button>'
    + '</div>'
    + '<div id="rfpPreviewArea" style="padding:0">' + previewHtml + '</div>'
    + '</div>'
    + '</div>'
  );
};

function advanceStageButton(rfp) {
  const stage = rfp ? rfp.stage : 'draft';
  const id = rfp ? rfp.id : '';
  if (stage === 'draft') return '<button class="btn-primary" style="flex:1" onclick="advanceRfpStage(' + id + ',\'published\')"><i class="fas fa-rocket"></i>Publish RFP</button>';
  return '';
}

async function generateRfpDoc(rfpId) {
  // Validate mandatory fields before calling the API
  var background = document.getElementById('rfpBackground').value.trim();
  var objectives = document.getElementById('rfpObjectives').value.trim();
  var scope      = document.getElementById('rfpScope').value.trim();
  var title      = document.getElementById('rfpTitle').value.trim();
  if (!background || !objectives || !scope) {
    var missing = [];
    if (!background) missing.push('Project Background');
    if (!objectives)  missing.push('Objectives');
    if (!scope)       missing.push('Scope of Work');
    showToast('Please fill in: ' + missing.join(', ') + ' before generating.', 'error');
    return;
  }

  var btn = document.getElementById('genBtn');
  setLoading(btn, true, 'Generating...');
  try {
    var data = {
      title:            title,
      category:         document.getElementById('rfpCategory').value,
      budget:           document.getElementById('rfpBudget').value,
      deadline:         document.getElementById('rfpDeadline').value,
      scope:            scope,
      tech_requirements:document.getElementById('rfpTech').value,
      objectives:       objectives,
      background:       background,
    };
    var result = await apiCall('POST', '/rfps/' + rfpId + '/generate', data);
    appState.currentRfp = result;
    showToast('RFP document generated!', 'success');
    // 1. Update the preview area immediately (fast path)
    var previewEl = document.getElementById('rfpPreviewArea');
    if (previewEl) previewEl.innerHTML = result.content || '';
    // 2. Show the action buttons (may already exist in DOM from initial render)
    var actionDiv = document.getElementById('genActionButtons');
    if (actionDiv) {
      actionDiv.style.display = 'flex';
    }
    var pdfBtn = document.getElementById('genPreviewPdfBtn');
    if (pdfBtn) pdfBtn.style.display = '';
    // 3. Full re-render as reliable fallback (rebuilds entire left panel with hasContent=true)
    renderRfpTabs('generate', rfpId, appState.unreadQA);
    rfpTabs.generate(rfpId, result);
  } catch(e) {
    // error shown by apiCall
    setLoading(btn, false);
  }
  // Note: do NOT call setLoading in finally — rfpTabs.generate() recreates the DOM
  // so the original btn reference is stale. The new genBtn is enabled by default.
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
  // reload RFP detail
  const rfp = await apiCall('GET', '/rfps/' + rfpId);
  appState.currentRfp = rfp;
  document.getElementById('pageSubtitle').textContent = (rfp.ref_number||'') + ' \u2022 ' + stageLabelMap(rfp.stage||'draft');
  renderLifecycleBar(rfp);

  // Mark Publish RFP stage complete
  if (stage === 'published') {
    markStageCompleted(rfpId, 'publish');
    showToast('\uD83C\uDF89 RFP Published! Now proceed to the Vendors tab to invite vendors.', 'success', 5000);
  }
  renderRfpTabs(appState.currentRfpTab, rfpId, appState.unreadQA);
  switchRfpTab(appState.currentRfpTab, rfpId);
}

// Fetch the letterhead image and return a base64 data URI so html2canvas
// can render it without CORS issues.
async function fetchLetterheadDataUri() {
  try {
    var res = await fetch('/api/proposals/pdf/letterhead/bg_a4.png');
    if (!res.ok) return null;
    var blob = await res.blob();
    return await new Promise(function(resolve) {
      var reader = new FileReader();
      reader.onloadend = function() { resolve(reader.result); };
      reader.readAsDataURL(blob);
    });
  } catch(e) {
    return null;
  }
}

// Rewrite background-image URL in RFP HTML to embedded data URI so
// html2canvas can render the letterhead without any CORS issue.
function inlineLetterheadInHtml(html, dataUri) {
  if (!dataUri) return html;
  // Replace any URL pointing to the letterhead PNG (absolute or relative)
  return html.replace(/url\(['"]?[^'")\s]*bg_a4\.png['"]?\)/g, "url('" + dataUri + "')");
}

// Build a self-contained HTML document from RFP content, with letterhead inlined.
async function buildRfpHtmlDoc(rfpContent) {
  var dataUri = await fetchLetterheadDataUri();
  var inlined = inlineLetterheadInHtml(rfpContent, dataUri);
  return '<!DOCTYPE html><html><head><meta charset="UTF-8">'
    + '<style>'
    + '* { box-sizing: border-box; margin: 0; padding: 0; }'
    + 'body { background: #e8e8e8; font-family: Arial, "Segoe UI", sans-serif; }'
    + '.rfp-doc > div { display: block; margin: 0 auto; }'
    + '</style>'
    + '</head><body>' + inlined + '</body></html>';
}

// Generate PDF blob from RFP content.
// Strategy: render each LLM-generated A4 page div individually with html2canvas,
// then assemble them into a single jsPDF document — one canvas per PDF page.
// This avoids ALL html2pdf pagination/scaling bugs since we control page boundaries exactly.
async function generateRfpPdfBlob(rfpId) {
  var rfp = appState.currentRfp;
  if (!rfp || !rfp.content) throw new Error('No RFP content to export');

  // Require standalone html2canvas and jspdf (loaded as separate CDN scripts)
  if (typeof window.html2canvas === 'undefined' || typeof window.jspdf === 'undefined') {
    throw new Error('PDF libraries not loaded');
  }
  var jsPDF = window.jspdf.jsPDF;

  var safeRef = (rfp.ref_number || rfp.title || String(rfpId)).replace(/[^a-zA-Z0-9_\-]/g, '_');
  var filename = 'CPC_RFP_' + safeRef + '.pdf';

  // Inline the letterhead image as a base64 data URI so html2canvas
  // can render it without any CORS restriction.
  var dataUri = await fetchLetterheadDataUri();
  var inlined = inlineLetterheadInHtml(rfp.content, dataUri);

  // A4 at 96dpi = 794 × 1123 px.  The LLM generates each page as a div with
  // width:210mm — at 96dpi that is exactly 793.7 ≈ 794px.
  var PAGE_W_PX = 794;
  var PAGE_H_PX = 1123;

  // Mount a hidden iframe so the A4 divs render with correct pixel dimensions.
  // opacity:0 keeps it invisible; position:fixed + large negative z-index keeps
  // it out of the stacking context.  It MUST be in the viewport (top:0,left:0)
  // so that the browser assigns real layout metrics.
  var iframe = document.createElement('iframe');
  iframe.style.cssText = [
    'position:fixed', 'top:0', 'left:0',
    'width:' + PAGE_W_PX + 'px',
    'height:' + PAGE_H_PX + 'px',
    'opacity:0', 'pointer-events:none', 'border:none', 'z-index:-9999',
  ].join(';');
  document.body.appendChild(iframe);

  var iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
  iframeDoc.open();
  iframeDoc.write([
    '<!DOCTYPE html><html><head><meta charset="UTF-8">',
    '<style>',
    '* { box-sizing:border-box; margin:0; padding:0; }',
    // Force body to be exactly A4 width — no auto-centering margins
    'body { width:' + PAGE_W_PX + 'px; background:#e8e8e8; overflow:hidden; }',
    // Each A4 page div: strip any outer margin/auto so they stack flush
    '.rfp-doc > div { margin:0 !important; display:block !important; }',
    '</style>',
    '</head><body>', inlined, '</body></html>',
  ].join(''));
  iframeDoc.close();

  // Wait for load (fonts + background image)
  await new Promise(function(resolve) {
    if (iframe.contentDocument.readyState === 'complete') { resolve(); return; }
    iframe.contentWindow.addEventListener('load', resolve);
    setTimeout(resolve, 4000);
  });
  await new Promise(function(r) { setTimeout(r, 800); }); // extra paint tick

  try {
    // Collect all A4 page divs — the LLM wraps everything in <div class="rfp-doc">
    // and each page is a direct child div.
    var rfpDoc = iframeDoc.querySelector('.rfp-doc');
    var pageDivs = rfpDoc ? Array.from(rfpDoc.children) : [iframeDoc.body];
    if (pageDivs.length === 0) pageDivs = [iframeDoc.body];

    // Create jsPDF in A4 portrait (units: mm)
    var pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    var A4_W_MM = 210;
    var A4_H_MM = 297;

    for (var i = 0; i < pageDivs.length; i++) {
      var pageEl = pageDivs[i];

      // Capture this single page div at scale:2 (retina quality)
      var canvas = await window.html2canvas(pageEl, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        logging: false,
        width: PAGE_W_PX,
        height: PAGE_H_PX,
        windowWidth: PAGE_W_PX,
        windowHeight: PAGE_H_PX,
      });

      var imgData = canvas.toDataURL('image/jpeg', 0.92);

      // Add a new page for every page after the first
      if (i > 0) pdf.addPage('a4', 'portrait');

      // Place the image filling the entire A4 page exactly
      pdf.addImage(imgData, 'JPEG', 0, 0, A4_W_MM, A4_H_MM, '', 'FAST');
    }

    var blob = pdf.output('blob');
    return { blob: blob, filename: filename };
  } finally {
    if (iframe.parentNode) document.body.removeChild(iframe);
  }
}

// Convert Blob to base64 string
function blobToBase64(blob) {
  return new Promise(function(resolve, reject) {
    var reader = new FileReader();
    reader.onloadend = function() {
      // reader.result is "data:application/pdf;base64,AAAA..."
      var b64 = reader.result.split(',')[1];
      resolve(b64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function downloadRfpPdf(rfpId) {
  var rfp = appState.currentRfp;
  if (!rfp || !rfp.content) {
    showToast('Please generate the RFP document first', 'error');
    return;
  }

  // Check html2pdf.js is loaded
  if (typeof html2pdf === 'undefined') {
    showToast('PDF library not loaded — opening print preview instead', 'warning');
    window.open('/api/rfps/' + rfpId + '/pdf', '_blank');
    return;
  }

  showToast('Generating PDF — please wait (this may take 10–20 seconds)…', 'info', 25000);
  generateRfpPdfBlob(rfpId)
    .then(function(result) {
      // Trigger browser download
      var url = URL.createObjectURL(result.blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = result.filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(function() {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 1000);
      showToast('PDF downloaded: ' + result.filename, 'success');
    })
    .catch(function(err) {
      console.error('PDF generation error:', err);
      showToast('PDF generation failed — opening print preview instead', 'warning');
      window.open('/api/rfps/' + rfpId + '/pdf', '_blank');
    });
  return;

  // LEGACY html2pdf path (kept for reference — no longer used):
  // Use a hidden iframe approach: inject a full HTML document with embedded
  // styles so html2canvas sees a properly rendered page (not an offscreen div).
  // This reliably captures all CSS-styled content including tables and colours.
  var safeTitle = (rfp.ref_number || rfp.title || 'RFP').replace(/[^a-zA-Z0-9_\-]/g, '_');
  var filename = 'CPC_RFP_' + safeTitle + '.pdf';

  // Build a self-contained HTML document string with all styles inlined
  var rfpCss = [
    'body{margin:0;padding:0;font-family:Arial,Calibri,sans-serif;font-size:11pt;color:#1a1a1a;background:#fff;}',
    '.rfp-doc{max-width:794px;margin:0 auto;}',
    '.rfp-header-band{height:20pt;width:100%;background:#A79C7F;background-image:repeating-linear-gradient(90deg,rgba(255,255,255,0.15) 0,rgba(255,255,255,0.15) 2px,transparent 2px,transparent 10px),repeating-linear-gradient(0deg,rgba(255,255,255,0.15) 0,rgba(255,255,255,0.15) 2px,transparent 2px,transparent 10px);}',
    '.rfp-circle-divider{height:8pt;border-top:2px solid #1A1A1A;background:white;}',
    '.rfp-cover{background:white;page-break-after:always;min-height:220mm;}',
    '.rfp-cover-logo{display:flex;align-items:center;justify-content:center;gap:18pt;padding:18pt 36pt 12pt;}',
    '.rfp-logo-emblem{flex-shrink:0;width:56pt;height:56pt;border-radius:50%;border:2pt solid #1A1A1A;display:flex;align-items:center;justify-content:center;background:white;}',
    '.rfp-logo-emblem svg{width:40pt;height:40pt;}',
    '.rfp-logo-text{display:flex;flex-direction:column;gap:4pt;}',
    '.rfp-logo-text .rfp-org-arabic{font-size:16pt;font-weight:700;color:#1a1a1a;direction:rtl;font-family:serif;}',
    '.rfp-logo-text .rfp-org-name{font-size:9pt;font-weight:700;color:#1a1a1a;letter-spacing:2px;text-transform:uppercase;font-family:Arial,sans-serif;}',
    '.rfp-cover-divider{width:calc(100% - 72pt);height:0.5pt;background:#d1d5db;margin:0 36pt;}',
    '.rfp-cover-body{padding:36pt 36pt 24pt;}',
    '.rfp-cover-body .rfp-doc-type{font-size:10pt;font-weight:700;letter-spacing:0.1em;color:#BA9765;text-transform:uppercase;margin-bottom:6pt;}',
    '.rfp-cover-body .rfp-doc-title{font-size:22pt;font-weight:700;line-height:1.25;color:#1a1a1a;margin-bottom:12pt;}',
    '.rfp-cover-body .rfp-doc-date{font-size:9pt;color:#745B35;font-weight:600;}',
    '.rfp-cover-footer-bar{display:none;}',
    '.rfp-page-header{display:flex;align-items:center;justify-content:space-between;padding:4pt 24pt;border-bottom:1.5pt solid #BA9765;background:white;}',
    '.rfp-page-header-logo{font-size:8pt;font-weight:700;color:#745B35;}',
    '.rfp-page-header-ref{font-size:7.5pt;color:#9ca3af;}',
    '.rfp-meta-table{width:100%;border-collapse:collapse;font-size:9pt;margin:8pt 0;}',
    '.rfp-meta-table th{background:#745B35;color:white;padding:6pt 10pt;font-weight:700;border:0.5pt solid #E9DCC4;}',
    '.rfp-meta-table td{background:white;padding:6pt 10pt;border:0.5pt solid #d1d5db;vertical-align:top;}',
    '.rfp-toc{padding:14pt 24pt 10pt;}',
    '.rfp-toc-title{font-size:13pt;font-weight:700;color:#BA9765;margin-bottom:8pt;border-bottom:1pt solid #BA9765;padding-bottom:4pt;}',
    '.rfp-toc-item{display:flex;justify-content:space-between;padding:3pt 0;font-size:9pt;color:#745B35;border-bottom:0.5pt dotted #d1d5db;}',
    '.rfp-toc-item.bold{font-weight:700;}',
    '.rfp-toc-item.indent{padding-left:14pt;color:#374151;font-weight:400;}',
    '.rfp-section{padding:12pt 24pt;border-bottom:0.5pt solid #e5e7eb;}',
    '.rfp-section-title{font-size:12pt;font-weight:700;color:#1a1a1a;margin-bottom:7pt;border-bottom:1.5pt solid #BA9765;padding-bottom:3pt;}',
    '.rfp-section-num{display:inline-block;width:18pt;height:18pt;border-radius:50%;background:#BA9765;color:white;text-align:center;line-height:18pt;font-weight:700;font-size:8pt;margin-right:4pt;vertical-align:middle;}',
    '.rfp-section p{font-size:10pt;line-height:1.5;margin:0 0 6pt;}',
    '.rfp-section ul{margin:3pt 0 6pt 16pt;}',
    '.rfp-section li{font-size:9.5pt;line-height:1.5;margin-bottom:2pt;}',
    '.rfp-subsection{margin:9pt 0 4pt;}',
    '.rfp-subsection-title{font-size:10pt;font-weight:700;color:#745B35;margin-bottom:4pt;}',
    '.rfp-deliverables{background:var(--cpc-gold-tint);border-left:2.5pt solid #BA9765;padding:5pt 9pt;font-size:9pt;color:#374151;margin-top:4pt;line-height:1.5;}',
    '.rfp-spec-table{width:100%;border-collapse:collapse;margin:7pt 0;font-size:9pt;}',
    '.rfp-spec-table th{background:#745B35;color:white;padding:5pt 9pt;font-weight:700;border:0.5pt solid #E9DCC4;}',
    '.rfp-spec-table td{padding:4.5pt 9pt;border:0.5pt solid #d1d5db;line-height:1.5;vertical-align:top;background:white;}',
    '.rfp-spec-table tr:nth-child(even) td{background:var(--cpc-gold-tint);}',
    '.rfp-footer{background:#745B35;color:white;padding:10pt 24pt;text-align:center;font-size:8pt;line-height:1.8;}',
    'table{border-collapse:collapse;}',
    'h1,h2,h3,h4{color:#1a1a1a;}',
  ].join('\n');

  var fullHtml = '<!DOCTYPE html><html><head><meta charset="UTF-8">'
    + '<style>' + rfpCss + '</style>'
    + '</head><body><div class="rfp-doc">'
    + rfp.content
    + '</div></body></html>';

  // Build a wrapper div with content rendered in a hidden but on-screen container.
  // html2canvas requires the element to be in the viewport or visible in DOM.
  var container = document.createElement('div');
  container.style.cssText = [
    'position:fixed',
    'left:-9999px',
    'top:0',
    'width:794px',
    'min-height:1123px',
    'background:#ffffff',
    'z-index:-1',
    'overflow:visible',
  ].join(';');

  container.innerHTML = fullHtml
    .replace('<!DOCTYPE html><html><head><meta charset="UTF-8"><style>', '<style>')
    .replace('</style></head><body><div class="rfp-doc">', '</style><div class="rfp-doc">')
    .replace('</div></body></html>', '</div>');

  // Alternatively, just inject the full HTML as-is inside the div
  container.innerHTML = '<div style="font-family:Arial,Calibri,sans-serif;font-size:11pt;color:#1a1a1a;background:#fff;padding:20px">'
    + '<style>' + rfpCss + '</style>'
    + '<div class="rfp-doc">' + rfp.content + '</div>'
    + '</div>';

  document.body.appendChild(container);

  // Give browser time to lay out the element before capturing
  requestAnimationFrame(function() {
    setTimeout(function() {
      var opt = {
        margin:      [12, 12, 12, 12],
        filename:    filename,
        image:       { type: 'jpeg', quality: 0.97 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          allowTaint: true,
          backgroundColor: '#ffffff',
          logging: false,
          windowWidth: 794,
        },
        jsPDF:       { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak:   { mode: ['css', 'legacy'] },
      };

      html2pdf().set(opt).from(container.firstChild || container).save()
        .then(function() {
          document.body.removeChild(container);
          showToast('PDF downloaded successfully!', 'success');
        })
        .catch(function(err) {
          document.body.removeChild(container);
          console.error('html2pdf error:', err);
          showToast('PDF generation failed: ' + (err && err.message ? err.message : err), 'error');
        });
    }, 400);
  });
}

// --- TAB: VENDORS ---
rfpTabs.vendors = async function(rfpId, rfp) {
  const [vendors, emailLog] = await Promise.all([
    apiCall('GET', '/rfps/' + rfpId + '/vendors').catch(function(){ return []; }),
    apiCall('GET', '/rfps/' + rfpId + '/emails').catch(function(){ return []; }),
  ]);
  appState.rfpVendors = vendors;

  const shortlistedVendors = vendors.filter(function(v){ return v.shortlisted; });
  const otherVendors = vendors.filter(function(v){ return !v.shortlisted; });
  const shortlistedCount = shortlistedVendors.length;

  // Build invitation status map per vendor
  const invitationMap = {};
  emailLog.forEach(function(e) {
    if (e.email_type === 'invitation' && e.vendor_id) {
      invitationMap[e.vendor_id] = e;
    }
  });
  // Build received email map per vendor
  const receivedMap = {};
  emailLog.forEach(function(e) {
    if (e.status === 'received' && e.vendor_id) {
      if (!receivedMap[e.vendor_id]) receivedMap[e.vendor_id] = 0;
      receivedMap[e.vendor_id]++;
    }
  });

  function buildVendorRow(v, allowRemove) {
    const isDeclined = v.rfp_status === 'declined';
    const score = v.rfp_fit_score || v.fit_score || 0;
    const fitCls = score >= 75 ? 'perf-high' : score >= 50 ? 'perf-mid' : 'perf-low';
    // Show first 3 tags; clicking the cell opens full vendor detail with all specs
    var allSpecs = (v.specializations||'').split(',').filter(Boolean);
    var visibleTags = allSpecs.slice(0,3).map(function(s){ return '<span class="tag">' + escHtml(s.trim()) + '</span>'; }).join('');
    var moreCount = allSpecs.length - 3;
    var moreHint = moreCount > 0 ? '<span style="cursor:pointer;font-size:0.75rem;color:var(--cpc-gold-deep);text-decoration:underline;margin-left:3px">+' + moreCount + ' more</span>' : '';
    const tags = visibleTags + moreHint;

    // Row background: RED tint if declined
    const rowStyle = isDeclined ? ' style="background:#fef2f2;opacity:0.85"' : '';

    const actionBtn = isDeclined
      ? '<span style="font-size:0.72rem;color:#dc2626;font-weight:600;padding:2px 8px">Declined</span>'
      : allowRemove
        ? '<button class="btn-danger btn-sm" onclick="toggleVendorShortlist(' + rfpId + ',' + v.id + ',false)"><i class="fas fa-minus"></i>Remove</button>'
        : '<button class="btn-secondary btn-sm" onclick="toggleVendorShortlist(' + rfpId + ',' + v.id + ',true)"><i class="fas fa-plus"></i>Add</button>';

    // Participation status badge — declined overrides invitation badge
    let invBadge = '';
    if (isDeclined) {
      invBadge = '<span style="background:#fee2e2;color:#991b1b;border-radius:20px;padding:2px 8px;font-size:0.72rem;font-weight:700;border:1px solid #fca5a5">'
        + '<i class="fas fa-times-circle mr-1"></i>Declined</span>';
    } else {
      const inv = invitationMap[v.id];
      if (!inv) {
        invBadge = '<span style="background:#f3f4f6;color:#6b7280;border-radius:20px;padding:2px 8px;font-size:0.72rem;font-weight:500">Not Invited</span>';
      } else if (inv.status === 'sent') {
        invBadge = '<span style="background:#d1fae5;color:#065f46;border-radius:20px;padding:2px 8px;font-size:0.72rem;font-weight:600"><i class="fas fa-check-circle mr-1"></i>Invited</span>';
      } else {
        invBadge = '<span style="background:#ede9fe;color:#5b21b6;border-radius:20px;padding:2px 8px;font-size:0.72rem;font-weight:500"><i class="fas fa-flask mr-1"></i>Simulated</span>';
      }
    }

    // Received emails count
    const rxCount = receivedMap[v.id] || 0;
    const rxBadge = rxCount > 0
      ? '<span style="background:#ede9fe;color:var(--cpc-gold-deep);border-radius:20px;padding:2px 8px;font-size:0.72rem;font-weight:600;margin-left:4px"><i class="fas fa-reply mr-1"></i>' + rxCount + ' replied</span>'
      : '';

    // Communications button: disabled if declined
    const commBtn = isDeclined
      ? '<button class="btn-ghost btn-sm" disabled title="Communications prohibited — vendor declined" style="opacity:0.4;cursor:not-allowed"><i class="fas fa-ban"></i>No Comms</button>'
      : '<button class="btn-ghost btn-sm" onclick="navigateToVendorComms(' + rfpId + ',' + v.id + ')" title="Open Communications"><i class="fas fa-comments"></i>Comms</button>';

    // Avatar background: red if declined
    const avatarBg = isDeclined ? '#dc2626' : 'var(--cpc-ink)';

    // Participant code (only shown when vendor is shortlisted/invited)
    const participantCode = allowRemove ? 'RFP-' + rfpId + '-V' + v.id : '';

    return '<tr' + rowStyle + '>'
      + '<td><div style="display:flex;align-items:center;gap:0.75rem">'
      + '<div style="width:36px;height:36px;border-radius:8px;background:' + avatarBg + ';display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:0.9rem;flex-shrink:0">'
      + (isDeclined ? '<i class="fas fa-times" style="font-size:0.8rem"></i>' : escHtml(v.name.charAt(0))) + '</div>'
      + '<div><div style="font-weight:600;font-size:0.95rem' + (isDeclined ? ';color:#991b1b' : '') + '">' + escHtml(v.name) + '</div>'
      + '<div style="font-size:0.78rem;color:#9ca3af">' + escHtml(v.country||'UAE') + ' &bull; ' + escHtml(v.size||'')
      + (participantCode ? ' &bull; <span style="font-family:monospace;color:var(--cpc-ink);font-weight:600" title="Participant Reference">' + participantCode + '</span>' : '')
      + '</div>'
      + '</div></div></td>'
      + '<td onclick="viewVendorDetail(' + v.id + ')" style="cursor:pointer" title="Click to see all specializations"><div class="tag-group">' + tags + '</div></td>'
      + '<td><span class="perf-badge ' + fitCls + '">' + score + '/100</span></td>'
      + '<td>' + invBadge + rxBadge + '</td>'
      + '<td style="text-align:center">' + actionBtn + '</td>'
      + '<td><div style="display:flex;gap:4px">' + commBtn + '<button class="btn-ghost btn-sm" onclick="viewVendorDetail(' + v.id + ')"><i class="fas fa-eye"></i></button></div></td>'
      + '</tr>';
  }

  // Shortlisted table rows
  let shortlistedRows = '';
  shortlistedVendors.forEach(function(v){ shortlistedRows += buildVendorRow(v, true); });

  // Other vendors collapsed section
  let otherRows = '';
  otherVendors.forEach(function(v){ otherRows += buildVendorRow(v, false); });

  const tableHead = '<thead><tr><th>Vendor</th><th>Specializations</th><th>AI Fit Score</th><th>Participation Status</th><th style="text-align:center">Shortlist</th><th></th></tr></thead>';

  setContent(
    '<div class="space-y-4">'

    // Header with actions
    + '<div style="display:flex;align-items:center;justify-content:space-between">'
    + '<div>'
    + '<h3 style="font-weight:700;font-size:0.95rem;color:#1f2937;margin:0">Vendor Shortlist & Participation</h3>'
    + '<p style="font-size:0.8rem;color:#9ca3af;margin:0">' + shortlistedCount + ' shortlisted &bull; Invitation status and vendor responses tracked below</p>'
    + '</div>'
    + '<div style="display:flex;gap:0.5rem">'
    + '<button class="btn-secondary" id="aiShortlistBtn" onclick="aiShortlistVendors(' + rfpId + ')"><i class="fas fa-robot"></i>AI Suggested Vendors</button>'
    + '<button class="btn-primary" onclick="sendRfpInvitations(' + rfpId + ')"><i class="fas fa-paper-plane"></i>Send Invitations</button>'
    + '</div>'
    + '</div>'

    // Shortlisted vendors table (always visible)
    + (shortlistedCount === 0
      ? '<div class="card" style="padding:2.5rem;text-align:center;color:#9ca3af">'
        + '<i class="fas fa-clipboard-list" style="font-size:2rem;display:block;margin-bottom:0.75rem;color:#d1d5db"></i>'
        + '<p style="font-weight:600;color:#6b7280;margin-bottom:0.5rem">No vendors shortlisted yet</p>'
        + '<p style="font-size:0.85rem">Use <strong>AI Suggested Vendors</strong> to auto-shortlist, or add vendors manually from the pool below.</p>'
        + '</div>'
      : '<div class="card"><div style="overflow-x:auto"><table>' + tableHead + '<tbody>' + shortlistedRows + '</tbody></table></div></div>')

    // Other vendors — collapsible
    + '<div>'
    + '<button class="btn-ghost btn-sm" style="font-size:0.82rem;color:#9ca3af" onclick="toggleOtherVendors()">'
    + '<i class="fas fa-chevron-right" id="otherVendorsChevron" style="margin-right:4px;font-size:0.72rem"></i>'
    + 'Show full vendor pool (' + otherVendors.length + ' not shortlisted)'
    + '</button>'
    + '<div id="otherVendorsPanel" style="display:none;margin-top:0.75rem">'
    + '<div class="card"><div style="overflow-x:auto"><table>' + tableHead + '<tbody>' + otherRows + '</tbody></table></div></div>'
    + '</div>'
    + '</div>'

    + '</div>'
  );
};

function navigateToVendorComms(rfpId, vendorId) {
  navigateTo('vendor_comms', { rfpId: rfpId, vendorId: vendorId });
}

function toggleOtherVendors() {
  var panel = document.getElementById('otherVendorsPanel');
  var chevron = document.getElementById('otherVendorsChevron');
  if (!panel) return;
  var showing = panel.style.display !== 'none';
  panel.style.display = showing ? 'none' : 'block';
  if (chevron) chevron.className = showing ? 'fas fa-chevron-right' : 'fas fa-chevron-down';
}

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
  var btn = document.getElementById('sendInvBtn');
  setLoading(btn, true, 'Sending...');
  try {
    var qDeadline = document.getElementById('invQDeadline').value;
    var sDeadline = document.getElementById('invSDeadline').value;
    var notes = document.getElementById('invNotes').value;

    // Generate PDF and attach to email if html2pdf is available and RFP has content
    var pdfBase64 = null;
    var pdfFilename = null;
    var rfp = appState.currentRfp;
    if (rfp && rfp.content && typeof html2pdf !== 'undefined') {
      try {
        setLoading(btn, true, 'Generating PDF…');
        var pdfResult = await generateRfpPdfBlob(rfpId);
        pdfBase64 = await blobToBase64(pdfResult.blob);
        pdfFilename = pdfResult.filename;
        setLoading(btn, true, 'Sending…');
      } catch(pdfErr) {
        console.warn('PDF generation for email failed, sending without attachment:', pdfErr);
      }
    }

    var payload = {
      questions_deadline: qDeadline,
      submission_deadline: sDeadline,
      notes: notes,
    };
    if (pdfBase64) {
      payload.pdf_base64 = pdfBase64;
      payload.pdf_filename = pdfFilename;
    }

    var result = await apiCall('POST', '/rfps/' + rfpId + '/emails/send-invitations', payload);
    // Advance stage from published → qa_open to mark Vendor Invitation as complete on the lifecycle bar
    var currentStage = appState.currentRfp ? appState.currentRfp.stage : 'published';
    if (currentStage === 'published') {
      await apiCall('POST', '/rfps/' + rfpId + '/stage', { stage: 'qa_open' }).catch(function(){});
    }
    // Refresh RFP state and lifecycle bar
    var rfp = await apiCall('GET', '/rfps/' + rfpId);
    appState.currentRfp = rfp;
    document.getElementById('pageSubtitle').textContent = (rfp.ref_number||'') + ' \u2022 ' + stageLabelMap(rfp.stage||'draft');
    renderLifecycleBar(rfp);
    renderRfpTabs('vendors', rfpId, appState.unreadQA);
    // Count shortlisted vendors from local state (avoid undefined reference)
    var sentCount = (result && result.results) ? result.results.length : (appState.rfpVendors ? appState.rfpVendors.filter(function(v){ return v.shortlisted; }).length : 0);
    // Mark Invite stage completed on lifecycle bar
    markStageCompleted(rfpId, 'publish');
    markStageCompleted(rfpId, 'invite');
    renderLifecycleBar(rfp);
    var pdfNote = pdfBase64 ? ' with PDF attachment' : '';
    showToast('\u2709\uFE0F Invitations sent to ' + sentCount + ' vendor(s)' + pdfNote + '!', 'success', 5000);
    addNotification('email', 'Invitations Sent', 'RFP invitations sent to ' + sentCount + ' vendor(s)' + pdfNote, rfpId, 'vendors', null);
    closeModal();
    // Stay on Vendors tab — no redirect
    switchRfpTab('vendors', rfpId);
    // Start 5s global background poller — runs regardless of active tab for 2h
    startGlobalInboxPolling(rfpId);
  } catch(e) {
    setLoading(btn, false);
  }
}

// --- TAB: EMAILS (kept as dead code — no longer in RFP_TABS) ---
rfpTabs.emails = async function(rfpId) {
  const [allEmails, received] = await Promise.all([
    apiCall('GET', '/rfps/' + rfpId + '/emails').catch(function(){ return []; }),
    apiCall('GET', '/rfps/' + rfpId + '/emails/received').catch(function(){ return []; }),
  ]);
  appState.emails = allEmails;
  appState.receivedEmails = received;
  appState.unreadEmailCount = 0; // reset unread count when viewing

  // Group all emails by vendor
  const vendorMap = {}; // vendorId -> { vendor_name, emails[] }
  allEmails.forEach(function(e) {
    const vid = e.vendor_id || 'unknown';
    if (!vendorMap[vid]) vendorMap[vid] = { vendor_name: e.vendor_name || e.recipient || 'Unknown Vendor', emails: [] };
    vendorMap[vid].emails.push(e);
  });
  received.forEach(function(e) {
    const vid = e.vendor_id || 'unknown';
    if (!vendorMap[vid]) vendorMap[vid] = { vendor_name: e.vendor_name || e.from_email || 'Unknown Vendor', emails: [] };
    // avoid duplicates (received is already in allEmails via status=received)
    const exists = vendorMap[vid].emails.find(function(x){ return x.id === e.id; });
    if (!exists) vendorMap[vid].emails.push(e);
  });

  // Auto-start inbox polling
  startInboxPolling(rfpId);

  // Header
  const totalVendors = Object.keys(vendorMap).length;
  const inboxCount = received.length;

  let vendorThreadsHtml = '';
  if (totalVendors === 0) {
    vendorThreadsHtml = '<div class="card" style="padding:2.5rem;text-align:center;color:#9ca3af">'
      + '<i class="fas fa-comments" style="font-size:2rem;display:block;margin-bottom:0.75rem;color:#d1d5db"></i>'
      + '<p style="font-weight:600;color:#6b7280;margin-bottom:0.25rem">No email correspondence yet</p>'
      + '<p style="font-size:0.82rem">Send invitations from the <strong>Vendors</strong> tab to start vendor communication.<br>'
      + 'Incoming replies will appear here automatically via <strong>procurement@cpc-rfp.website</strong>.</p>'
      + '</div>';
  } else {
    Object.entries(vendorMap).forEach(function(entry) {
      const vid = entry[0];
      const vdata = entry[1];
      const vEmails = vdata.emails.slice().sort(function(a,b){ return (a.id||0)-(b.id||0); });
      const vReceivedCount = vEmails.filter(function(e){ return e.status === 'received'; }).length;
      const threadId = 'thread-vendor-' + vid;
      const isNumericVid = vid !== 'unknown' && !isNaN(Number(vid));

      let threadEmails = '';
      vEmails.forEach(function(e) {
        const isInbound = e.status === 'received';
        const dateStr = e.created_at ? new Date(e.created_at).toLocaleString('en-AE') : '-';
        const attachBadge = e.has_attachment
          ? '<span style="background:#fef3c7;color:#92400e;border-radius:4px;padding:2px 6px;font-size:0.7rem;font-weight:600"><i class="fas fa-paperclip mr-1"></i>Attachment</span>'
          : (e.has_pdf ? '<span style="background:#ede9fe;color:var(--cpc-gold-deep);border-radius:4px;padding:2px 6px;font-size:0.7rem;font-weight:600"><i class="fas fa-file-pdf mr-1"></i>PDF</span>' : '');
        const typeBadge = '<span style="background:#f3f4f6;color:#6b7280;border-radius:4px;padding:2px 6px;font-size:0.7rem">' + escHtml(e.email_type||'') + '</span>';

        const bodyCollapseId = 'email-body-' + e.id;
        const bodyContent = e.email_body_html
          ? '<iframe srcdoc="' + escHtml(e.email_body_html) + '" style="width:100%;border:none;min-height:180px;border-radius:6px;background:white" sandbox="allow-same-origin"></iframe>'
          : '<pre style="white-space:pre-wrap;font-size:0.82rem;color:#374151;font-family:inherit;margin:0;background:#f9fafb;padding:0.75rem;border-radius:6px">' + escHtml((e.body||'(no body)').slice(0,2000)) + '</pre>';

        threadEmails += '<div style="display:flex;gap:0.75rem;margin-bottom:0.875rem;flex-direction:' + (isInbound ? 'row' : 'row-reverse') + '">'
          // Avatar
          + '<div style="width:32px;height:32px;border-radius:50%;background:' + (isInbound ? '#BA9765' : 'var(--cpc-gold)') + ';display:flex;align-items:center;justify-content:center;flex-shrink:0">'
          + '<i class="fas ' + (isInbound ? 'fa-user' : 'fa-crown') + '" style="color:white;font-size:0.75rem"></i></div>'
          // Bubble
          + '<div style="flex:1;max-width:85%">'
          + '<div style="background:' + (isInbound ? '#f5f3ff' : '#fff7e6') + ';border:1px solid ' + (isInbound ? '#ede9fe' : '#fde68a') + ';border-radius:' + (isInbound ? '0 12px 12px 12px' : '12px 0 12px 12px') + ';padding:0.75rem 1rem">'
          + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.4rem;gap:0.5rem;flex-wrap:wrap">'
          + '<span style="font-weight:600;font-size:0.8rem;color:' + (isInbound ? '#BA9765' : '#b45309') + '">' + escHtml(isInbound ? (e.from_email||vdata.vendor_name) : 'CPC Procurement') + '</span>'
          + '<div style="display:flex;align-items:center;gap:0.4rem;flex-wrap:wrap">' + typeBadge + attachBadge + '<span style="font-size:0.7rem;color:#9ca3af">' + dateStr + '</span></div>'
          + '</div>'
          + '<div style="font-size:0.82rem;font-weight:600;color:#374151;margin-bottom:0.4rem">' + escHtml(e.subject||'(no subject)') + '</div>'
          + '<button onclick="toggleInboundBody(\'' + bodyCollapseId + '\')" style="font-size:0.72rem;color:' + (isInbound ? '#BA9765' : '#b45309') + ';background:none;border:none;cursor:pointer;padding:0;margin-bottom:0.4rem">'
          + '<i class="fas fa-chevron-down" id="chevron-' + bodyCollapseId + '"></i> View body</button>'
          + '<div id="' + bodyCollapseId + '" style="display:none;margin-top:0.5rem">' + bodyContent + '</div>'
          + (isInbound && e.has_attachment ? '<div style="margin-top:0.5rem;font-size:0.75rem;color:#92400e;background:#fef3c7;padding:4px 8px;border-radius:4px"><i class="fas fa-file-excel mr-1"></i>Attachment processed — see Q&A tab</div>' : '')
          + '</div>'
          + '</div>'
          + '</div>';
      });

      const replyFormId = 'reply-form-' + vid;
      const replyTextId = 'reply-text-' + vid;
      const replySubjId = 'reply-subj-' + vid;

      const replySection = isNumericVid ? (
        '<div id="' + replyFormId + '" style="display:none;padding:1rem;border-top:1px solid #f3f4f6;background:#fafafa">'
        + '<div style="font-weight:600;font-size:0.8rem;color:#374151;margin-bottom:0.5rem"><i class="fas fa-reply mr-1"></i>Reply to ' + escHtml(vdata.vendor_name) + '</div>'
        + '<input id="' + replySubjId + '" type="text" placeholder="Subject..." style="width:100%;padding:7px 10px;border:1px solid #e5e7eb;border-radius:6px;font-size:0.82rem;margin-bottom:0.5rem;box-sizing:border-box">'
        + '<textarea id="' + replyTextId + '" rows="4" placeholder="Your reply message..." style="width:100%;padding:8px 10px;border:1px solid #e5e7eb;border-radius:6px;font-size:0.82rem;resize:vertical;box-sizing:border-box"></textarea>'
        + '<div style="display:flex;gap:0.5rem;margin-top:0.5rem">'
        + '<button class="btn-primary btn-sm" onclick="sendVendorReply(' + rfpId + ',' + vid + ')"><i class="fas fa-paper-plane"></i>Send Reply</button>'
        + '<button class="btn-ghost btn-sm" onclick="document.getElementById(\'' + replyFormId + '\').style.display=\'none\'">Cancel</button>'
        + '</div>'
        + '</div>'
      ) : '';

      vendorThreadsHtml += '<div class="card" style="padding:0;overflow:hidden;margin-bottom:0.875rem">'
        // Thread header
        + '<div style="padding:0.875rem 1rem;background:linear-gradient(135deg,#1B17120a,#4f46e508);display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #f3f4f6">'
        + '<div style="display:flex;align-items:center;gap:0.75rem">'
        + '<div style="width:36px;height:36px;border-radius:8px;background:var(--cpc-ink);display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:0.85rem">' + escHtml((vdata.vendor_name||'?').charAt(0)) + '</div>'
        + '<div>'
        + '<div style="font-weight:700;font-size:0.9rem;color:#1f2937">' + escHtml(vdata.vendor_name) + '</div>'
        + '<div style="font-size:0.75rem;color:#9ca3af">' + vEmails.length + ' message(s)' + (vReceivedCount > 0 ? ' &bull; <span style="color:var(--cpc-gold-deep);font-weight:600">' + vReceivedCount + ' received</span>' : '') + '</div>'
        + '</div>'
        + '</div>'
        + '<div style="display:flex;gap:0.5rem">'
        + (isNumericVid ? '<button class="btn-ghost btn-sm" onclick="toggleVendorReply(\'' + replyFormId + '\')"><i class="fas fa-reply"></i>Reply</button>' : '')
        + '<button class="btn-ghost btn-sm" onclick="toggleThreadBody(\'' + threadId + '\')"><i class="fas fa-chevron-down" id="chevron-' + threadId + '"></i></button>'
        + '</div>'
        + '</div>'
        // Thread body (collapsible)
        + '<div id="' + threadId + '" style="padding:1rem">'
        + (threadEmails || '<div style="padding:1rem;color:#9ca3af;font-size:0.82rem;text-align:center">No emails yet</div>')
        + '</div>'
        // Reply form
        + replySection
        + '</div>';
    });
  }

  setContent(
    '<div class="space-y-4">'

    // Header
    + '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:0.5rem">'
    + '<div>'
    + '<h3 style="font-weight:700;font-size:0.95rem;color:#1f2937;margin:0"><i class="fas fa-comments mr-2" style="color:var(--cpc-ink)"></i>Email Correspondence</h3>'
    + '<p style="font-size:0.8rem;color:#9ca3af;margin:0">'
    + totalVendors + ' vendor thread(s) &bull; '
    + '<div style="display:inline-flex;align-items:center;gap:4px"><div style="width:8px;height:8px;border-radius:50%;background:#22c55e;animation:pulse 2s infinite"></div>'
    + ' <code style="font-size:0.78rem;background:#f3f4f6;padding:1px 5px;border-radius:4px">procurement@cpc-rfp.website</code></div>'
    + '</p>'
    + '</div>'
    + '<div style="display:flex;gap:0.5rem">'
    + '<button class="btn-secondary" onclick="checkInboxForQA(' + rfpId + ')" id="checkInboxBtn"><i class="fas fa-sync"></i>Refresh</button>'
    + '</div>'
    + '</div>'

    // Vendor threads
    + '<div>' + vendorThreadsHtml + '</div>'

    + '</div>'
  );
};

function toggleInboundBody(id) {
  var el = document.getElementById(id);
  var chevron = document.getElementById('chevron-' + id);
  if (!el) return;
  var hidden = el.style.display === 'none';
  el.style.display = hidden ? 'block' : 'none';
  if (chevron) chevron.className = hidden ? 'fas fa-chevron-up' : 'fas fa-chevron-down';
}

function toggleVendorReply(formId) {
  var form = document.getElementById(formId);
  if (!form) return;
  form.style.display = form.style.display === 'none' ? 'block' : 'none';
}

function toggleThreadBody(threadId) {
  var el = document.getElementById(threadId);
  var chevron = document.getElementById('chevron-' + threadId);
  if (!el) return;
  var hidden = el.style.display === 'none';
  el.style.display = hidden ? 'block' : 'none';
  if (chevron) chevron.className = hidden ? 'fas fa-chevron-up' : 'fas fa-chevron-down';
}

async function sendVendorReply(rfpId, vendorId) {
  const subjEl = document.getElementById('reply-subj-' + vendorId);
  const textEl = document.getElementById('reply-text-' + vendorId);
  if (!textEl || !textEl.value.trim()) { showToast('Please enter a reply message', 'error'); return; }
  try {
    const result = await apiCall('POST', '/rfps/' + rfpId + '/vendors/' + vendorId + '/reply', {
      subject: subjEl ? subjEl.value : '',
      text: textEl.value,
    });
    if (result.ok) {
      showToast('Reply sent successfully!', 'success');
      addNotification('email', 'Reply Sent', 'Reply sent to vendor', rfpId, 'emails');
    } else {
      showToast('Reply simulated (no real API key): ' + (result.error || ''), 'info');
    }
    rfpTabs.emails(rfpId);
  } catch(e) {
    showToast('Failed to send reply: ' + e.message, 'error');
  }
}

// Polling for new inbound emails — runs every 5s while on emails tab
// Also runs as a global background poller (5s) after invitations are sent,
// so new emails are detected even when the user is on a different tab.
var _inboxPollTimer = null;
var _inboxPollRfpId = null;

// Start tab-scoped polling (stops when user leaves the emails tab)
function startInboxPolling(rfpId) {
  if (_inboxPollTimer) clearInterval(_inboxPollTimer);
  _inboxPollRfpId = rfpId;
  _inboxPollTimer = setInterval(function() {
    if (appState.currentRfpTab !== 'emails') { clearInterval(_inboxPollTimer); _inboxPollTimer = null; return; }
    silentCheckInbox(rfpId);
  }, 5000);
}

// Global background poller — keeps running regardless of active tab.
// Started once per RFP when invitations are sent; stops after 2 hours.
var _globalPollTimer = null;
var _globalPollRfpId = null;
var _globalPollStart = 0;
function startGlobalInboxPolling(rfpId) {
  if (_globalPollTimer) clearInterval(_globalPollTimer);
  _globalPollRfpId = rfpId;
  _globalPollStart = Date.now();
  _globalPollTimer = setInterval(function() {
    // Auto-stop after 2 hours
    if (Date.now() - _globalPollStart > 2 * 60 * 60 * 1000) {
      clearInterval(_globalPollTimer); _globalPollTimer = null; return;
    }
    // Skip if the tab-scoped poller is already running (avoids double calls)
    if (_inboxPollTimer && appState.currentRfpTab === 'emails') return;
    silentCheckInbox(rfpId);
  }, 5000);
}

// Track last seen email ID per RFP — survives tab switches (unlike length comparison)
var _lastSeenEmailId = {};

async function silentCheckInbox(rfpId) {
  try {
    const received = await apiCall('GET', '/rfps/' + rfpId + '/emails/received').catch(function(){ return []; });

    // Also fetch current RFP state to detect stage changes (e.g. Q&A auto-closed)
    const rfpNow = await apiCall('GET', '/rfps/' + rfpId).catch(function(){ return null; });
    const prevStage = appState.currentRfp ? appState.currentRfp.stage : null;
    const currentStage = rfpNow ? rfpNow.stage : prevStage;

    // ── Stage transition detection: Q&A closed → submissions_closed ──
    if (prevStage === 'qa_open' && currentStage === 'submissions_closed') {
      if (rfpNow) appState.currentRfp = rfpNow;
      // No auto-redirect — just update bar and notify
      if (appState.currentRfpId && String(appState.currentRfpId) === String(rfpId)) {
        renderLifecycleBar(rfpNow);
      }
      addNotification('stage',
        '\uD83D\uDD12 Q&A Stage Closed',
        'Q&A is now closed. You can now proceed to reviewing proposals.',
        rfpId, 'qa', null
      );
      return;
    }

    // Update lifecycle bar if stage changed for other reasons
    if (rfpNow && prevStage !== currentStage) {
      appState.currentRfp = rfpNow;
      if (appState.currentRfpId && String(appState.currentRfpId) === String(rfpId)) {
        renderLifecycleBar(rfpNow);
      }
    }

    if (!received || received.length === 0) return;

    // Detect new emails by comparing the newest email's id to the last seen id
    var newestId = received[0] ? received[0].id : null;
    var lastSeen = _lastSeenEmailId[rfpId] || null;

    // On first poll for this rfp: initialise lastSeen to current newest so we don't
    // retroactively trigger on already-visible emails.
    if (lastSeen === null) {
      _lastSeenEmailId[rfpId] = newestId;
      appState.receivedEmails = received;
      return;
    }

    // Find emails that arrived after lastSeen
    var newEmails = received.filter(function(e) { return e.id > lastSeen; });
    if (newEmails.length === 0) return;

    // Update state
    _lastSeenEmailId[rfpId] = newestId;
    appState.receivedEmails = received;
    appState.unreadEmailCount = (appState.unreadEmailCount || 0) + newEmails.length;

    var newest = newEmails[0];
    var attachBadge = newest && newest.has_attachment ? ' with Excel attachment' : '';
    var senderName = (newest && (newest.vendor_name || newest.from_email)) || 'vendor';
    var newestVendorId = newest ? (newest.vendor_id || null) : null;

    // Determine what kind of email arrived (use email_category set by LLM in webhook)
    var isDeclineEmail   = newest && (newest.email_category === 'decline'   || newest.email_type === 'decline');
    var isQuestionsEmail = newest && (newest.email_category === 'questions' || newest.email_type === 'qa_questions');
    var isProposalEmail  = newest && (newest.email_category === 'proposal'  || newest.email_type === 'proposal');

    if (isDeclineEmail) {
      addNotification('decline',
        '⛔ Vendor Declined — ' + senderName,
        senderName + ' has declined participation in this RFP. Shown in red in Vendors tab.',
        rfpId, 'vendors', newestVendorId
      );
      showToast(senderName + ' declined participation in this RFP.', 'warning', 5000);
      if (appState.currentRfpId && String(appState.currentRfpId) === String(rfpId)) {
        if (appState.currentRfpTab === 'vendors') rfpTabs.vendors(rfpId, appState.currentRfp);
      }

    } else if (isQuestionsEmail) {
      var questions = await apiCall('GET', '/rfps/' + rfpId + '/questions').catch(function(){ return []; });
      var emailQs = questions.filter(function(q){ return q.source === 'email'; }).length;

      appState.unreadQA = true;
      pulseQATab();
      addNotification('questions',
        '📋 Questions ready in Q&A tab',
        (emailQs > 0 ? emailQs + ' question(s)' : 'Questions') + ' from ' + senderName + ' added automatically.',
        rfpId, 'qa', null
      );
      addNotification('email', '📨 New Email from ' + senderName,
        (newest.subject || 'No Subject') + attachBadge, rfpId, null, newestVendorId);

      if (appState.currentRfpId && String(appState.currentRfpId) === String(rfpId)) {
        renderRfpTabs('qa', rfpId, true);
        rfpTabs.qa(rfpId);
      }

    } else if (isProposalEmail) {
      addNotification('proposal',
        '📄 Proposal Received — ' + senderName,
        senderName + ' submitted a proposal with PDF. Added to Proposals tab.',
        rfpId, 'proposals', newestVendorId
      );
      addNotification('email', '📨 New Email from ' + senderName,
        (newest.subject || 'No Subject') + ' (PDF proposal)', rfpId, null, newestVendorId);
      showToast('Proposal received from ' + senderName + '. Redirecting to Proposals tab...', 'success', 4000);

      if (appState.currentRfpId && String(appState.currentRfpId) === String(rfpId)) {
        renderRfpTabs('proposals', rfpId, false);
        rfpTabs.proposals(rfpId);
      }

    } else {
      addNotification('email', '📨 New Email from ' + senderName,
        (newest && newest.subject ? newest.subject : 'No Subject') + attachBadge,
        rfpId, null, newestVendorId);
      if (appState.currentRfpId && String(appState.currentRfpId) === String(rfpId)) {
        renderRfpTabs(appState.currentRfpTab, rfpId, appState.unreadQA);
      }
    }
  } catch(e) {}
}

function pulseQATab() {
  var tabs = document.querySelectorAll('.rfp-tab');
  tabs.forEach(function(t) {
    if (t.textContent && t.textContent.includes('Q&A')) {
      t.style.animation = 'none';
      t.style.background = '#7c3aed22';
      t.style.borderColor = '#BA9765';
      setTimeout(function() { t.style.background = ''; t.style.borderColor = ''; }, 3000);
    }
  });
}

async function checkInboxForQA(rfpId) {
  var btn = document.getElementById('checkInboxBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>Checking...'; }
  try {
    // Fetch received emails from DB (populated by Resend webhook)
    const received = await apiCall('GET', '/rfps/' + rfpId + '/emails/received').catch(function(){ return []; });
    const prev = (appState.receivedEmails || []).length;
    appState.receivedEmails = received;

    // Count questions loaded from these emails
    const questions = await apiCall('GET', '/rfps/' + rfpId + '/questions').catch(function(){ return []; });
    const emailQs = questions.filter(function(q){ return q.source === 'email'; }).length;

    if (received.length > prev) {
      appState.unreadQA = true;
      renderRfpTabs(appState.currentRfpTab, rfpId, true);
      pulseQATab();
      const newCount = received.length - prev;
      addNotification('email', 'New Email(s) Received', newCount + ' new vendor email(s). ' + emailQs + ' question(s) extracted.', rfpId, 'emails');
      if (emailQs > 0) {
        addNotification('questions', 'Questions Extracted', emailQs + ' vendor question(s) ready for Q&A tab', rfpId, 'qa');
      }
    } else if (received.length > 0) {
      showToast('Inbox up to date — ' + received.length + ' email(s), ' + emailQs + ' question(s) extracted.', 'info');
    } else {
      showToast('Inbox empty — no vendor replies yet. Waiting for email at procurement@cpc-rfp.website', 'info');
    }
    rfpTabs.emails(rfpId);
  } catch(e) {
    showToast('Inbox check failed.', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-sync"></i>Refresh'; }
  }
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

  const manualNeeded = questions.filter(function(q){ return q.needs_manual && !q.published; }).length;

  let qCards = '';
  if (questions.length === 0) {
    qCards = '<div class="card" style="padding:2.5rem;text-align:center;color:#9ca3af">'
      + '<i class="fas fa-comments" style="font-size:2.5rem;display:block;margin-bottom:1rem;color:#d1d5db"></i>'
      + '<p style="margin-bottom:0.5rem;font-weight:600;color:#374151">No vendor questions yet</p>'
      + '<p style="margin-bottom:1rem;font-size:0.85rem">Vendors submit questions by replying to the RFP invitation email with an Excel attachment.<br>If you received an email but questions are not showing, try <strong>Re-extract Questions</strong> below.</p>'
      + '<div style="display:flex;gap:0.75rem;justify-content:center;flex-wrap:wrap">'
      + '<button class="btn-secondary" id="reprocessQBtn" onclick="reprocessQuestions(' + rfpId + ')"><i class="fas fa-sync"></i>Re-extract Questions from Emails</button>'
      // Load Demo Questions button removed (v9)
      + '</div>'
      + '</div>';
  } else {
    questions.forEach(function(q) {
      const needsManual = q.needs_manual && !q.published;
      const cardBg = needsManual ? 'background:#fff5f5;border:1.5px solid #fca5a5' : '';

      const badgeHtml = q.published
        ? '<span class="stage-badge stage-published">Published</span>'
        : needsManual
        ? '<span style="background:#fee2e2;color:#991b1b;border-radius:20px;padding:2px 8px;font-size:0.72rem;font-weight:700"><i class="fas fa-exclamation-triangle mr-1"></i>Manual Required</span>'
        : q.answer
        ? '<span class="stage-badge stage-submissions_closed">Awaiting Approval</span>'
        : '<span class="stage-badge stage-draft">Unanswered</span>';

      let answerBlock = '';
      if (needsManual && !q.answer) {
        answerBlock = '<div style="background:#fee2e2;border:1px solid #fca5a5;border-radius:8px;padding:0.75rem;margin-top:0.75rem">'
          + '<div style="font-size:0.72rem;font-weight:700;color:#991b1b;margin-bottom:4px"><i class="fas fa-robot mr-1"></i>AI could not generate an answer</div>'
          + '<p style="font-size:0.82rem;color:#7f1d1d;margin:0">This question requires manual input. Please edit and provide an answer before publishing.</p>'
          + '</div>';
      } else if (q.answer) {
        answerBlock = '<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:0.75rem;margin-top:0.75rem">'
          + '<div style="font-size:0.72rem;font-weight:700;color:#92400e;margin-bottom:4px"><i class="fas fa-robot mr-1"></i>AI Draft Answer</div>'
          + '<p style="font-size:0.875rem;color:#374151;margin:0">' + escHtml(q.answer) + '</p>'
          + '</div>';
      }

      const isFromEmail = q.source === 'email';
      const btns = (!q.answer || needsManual
        ? '<button class="btn-secondary btn-sm" onclick="draftOneAnswer(' + rfpId + ',' + q.id + ')"><i class="fas fa-robot"></i>AI Draft</button>'
          + '<button class="btn-ghost btn-sm" onclick="editQAnswer(' + q.id + ')"><i class="fas fa-edit"></i>Manual Edit</button>'
        : '') + (q.answer && !q.published && !needsManual
        ? '<button class="btn-primary btn-sm" onclick="approveQAnswer(' + rfpId + ',' + q.id + ')"><i class="fas fa-check"></i>Approve & Send</button>'
          + '<button class="btn-ghost btn-sm" onclick="editQAnswer(' + q.id + ')"><i class="fas fa-edit"></i>Edit</button>'
        : '') + (q.answer && !q.published && needsManual
        ? '<button class="btn-primary btn-sm" onclick="approveQAnswer(' + rfpId + ',' + q.id + ')"><i class="fas fa-check"></i>Approve</button>'
        : '');

      qCards += '<div class="card" style="padding:1rem;' + cardBg + '" id="q-' + q.id + '">'
        + '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:1rem">'
        + '<div style="flex:1">'
        + '<div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.5rem;flex-wrap:wrap">'
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

  const manualWarning = manualNeeded > 0
    ? '<div style="background:#fee2e2;border:1.5px solid #fca5a5;border-radius:8px;padding:0.75rem 1rem;display:flex;align-items:center;gap:0.75rem">'
      + '<i class="fas fa-exclamation-triangle" style="color:#dc2626;font-size:1.1rem;flex-shrink:0"></i>'
      + '<div><div style="font-weight:700;font-size:0.85rem;color:#991b1b">' + manualNeeded + ' question(s) require manual answers</div>'
      + '<div style="font-size:0.78rem;color:#7f1d1d">AI could not generate answers for highlighted questions. Please provide manual answers before publishing.</div></div>'
      + '</div>'
    : '';

  setContent(
    '<div class="space-y-4">'
    + '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:0.5rem">'
    + '<div style="display:flex;gap:1rem;flex-wrap:wrap">'
    + '<span style="font-size:0.82rem;color:#6b7280"><strong>' + pending + '</strong> pending</span>'
    + '<span style="font-size:0.82rem;color:#92400e"><strong>' + answered + '</strong> awaiting approval</span>'
    + '<span style="font-size:0.82rem;color:#065f46"><strong>' + published + '</strong> published</span>'
    + (manualNeeded > 0 ? '<span style="font-size:0.82rem;color:#dc2626;font-weight:600"><strong>' + manualNeeded + '</strong> need manual input</span>' : '')
    + '</div>'
    + '<div style="display:flex;gap:0.5rem;flex-wrap:wrap">'
    + '<button class="btn-ghost btn-sm" id="reprocessQBtn" onclick="reprocessQuestions(' + rfpId + ')" title="Re-extract questions from received emails"><i class="fas fa-sync"></i>Re-extract</button>'
    + '<button class="btn-secondary" id="draftAllBtn" onclick="draftAllQAnswers(' + rfpId + ')"><i class="fas fa-robot"></i>AI Answer All</button>'
    + '<button class="btn-primary" onclick="publishAllQAnswers(' + rfpId + ')" ' + (manualNeeded > 0 ? 'title="Blocked: ' + manualNeeded + ' question(s) need manual answers" style="opacity:0.6"' : '') + '><i class="fas fa-paper-plane"></i>Publish All Approved</button>'
    + (appState.currentRfp && appState.currentRfp.stage === 'qa_open'
        ? '<button class="btn-danger" onclick="closeQA(' + rfpId + ')" title="Stop accepting vendor questions and mark Q&amp;A stage as complete" style="background:#dc2626;color:#fff;border:none;padding:0.35rem 0.75rem;border-radius:6px;font-size:0.82rem;cursor:pointer;display:flex;align-items:center;gap:0.35rem"><i class="fas fa-lock"></i>Close Q&amp;A</button>'
        : (appState.currentRfp && ['submissions_closed','evaluation','awarded'].includes(appState.currentRfp.stage)
            ? '<span style="font-size:0.78rem;color:#065f46;font-weight:600;display:flex;align-items:center;gap:0.35rem;padding:0.35rem 0.5rem"><i class="fas fa-lock mr-1"></i>Q&amp;A Closed</span>'
            : ''))
    + '</div>'
    + '</div>'
    + manualWarning
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
  const btn = document.getElementById('draftAllBtn');
  setLoading(btn, true, 'AI Answering...');
  try {
    await apiCall('POST', '/rfps/' + rfpId + '/questions/draft-all', {});
    showToast('AI answers generated! Questions needing manual input are highlighted in red.', 'success', 5000);
    rfpTabs.qa(rfpId);
  } catch(e) {
    setLoading(btn, false);
  }
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
  try {
    await apiCall('POST', '/rfps/' + rfpId + '/questions/publish-all', {});
    // NOTE: Publish All Approved does NOT advance stage — use "Close Q&A" button for that
    showToast('\u2705 Q&A answers published and sent to all vendors!', 'success', 5000);
    addNotification('info', '\u2705 Answers Published', 'All approved Q&A answers sent to vendors.', rfpId, 'qa', null);
    // Stay on Q&A tab, clear badge
    appState.unreadQA = false;
    renderRfpTabs('qa', rfpId, false);
    rfpTabs.qa(rfpId);
  } catch(e) {
    showToast('Publish failed: ' + e.message, 'error');
  }
}

async function closeQA(rfpId) {
  if (!confirm('Close Q&A? This will mark the Q&A stage as complete and prevent further vendor questions from being processed. Vendors will still be able to submit proposals.')) return;
  try {
    await apiCall('POST', '/rfps/' + rfpId + '/stage', { stage: 'submissions_closed' });
    // Mark Q&A stage completed in lifecycle bar
    markStageCompleted(rfpId, 'qa');
    // Refresh RFP to update lifecycle bar
    const rfp = await apiCall('GET', '/rfps/' + rfpId).catch(function(){ return null; });
    if (rfp) {
      appState.currentRfp = rfp;
      renderLifecycleBar(rfp);
      document.getElementById('pageSubtitle').textContent = (rfp.ref_number||'') + ' \u2022 ' + stageLabelMap(rfp.stage||'draft');
    }
    showToast('\uD83D\uDD12 Q&A closed. Vendor questions will be rejected with an auto-reply. Proposals are now being accepted.', 'success', 6000);
    addNotification('info', '\uD83D\uDD12 Q&A Closed', 'Q&A stage complete. Vendors will receive auto-rejection for any new questions.', rfpId, 'qa', null);
    // Refresh Q&A tab to hide the Close Q&A button (stage is now submissions_closed)
    appState.unreadQA = false;
    renderRfpTabs('qa', rfpId, false);
    rfpTabs.qa(rfpId);
  } catch(e) {
    showToast('Close Q&A failed: ' + e.message, 'error');
  }
}

async function loadSampleQs(rfpId) {
  await apiCall('POST', '/rfps/' + rfpId + '/questions/load-samples', {});
  showToast('Sample questions loaded!', 'success');
  rfpTabs.qa(rfpId);
}

async function reprocessQuestions(rfpId) {
  var btn = document.getElementById('reprocessQBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>Re-extracting...'; }
  try {
    const result = await apiCall('POST', '/rfps/' + rfpId + '/emails/reprocess-questions', {});
    if (result.totalNew > 0) {
      showToast(result.totalNew + ' new question(s) extracted from received emails!', 'success', 6000);
      addNotification('questions', 'Questions Extracted', result.totalNew + ' question(s) extracted from email attachments', rfpId, 'qa');
    } else {
      showToast('No new questions found in received emails. Check the Communications tab for email content.', 'info', 5000);
    }
    rfpTabs.qa(rfpId);
  } catch(e) {
    showToast('Re-extraction failed: ' + e.message, 'error');
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-sync"></i>Re-extract'; }
  }
}

// --- TAB: PROPOSALS ---
rfpTabs.proposals = async function(rfpId) {
  const proposals = await apiCall('GET', '/rfps/' + rfpId + '/proposals').catch(function(){ return []; });
  appState.proposals = proposals;

  function statusBadge(p) {
    const s = p.status || 'submitted';
    if (s === 'awarded') return '<span style="background:#d1fae5;color:#065f46;border-radius:20px;padding:3px 10px;font-size:0.73rem;font-weight:700"><i class="fas fa-trophy mr-1"></i>Awarded</span>';
    if (s === 'recommended') return '<span style="background:#fef3c7;color:#92400e;border-radius:20px;padding:3px 10px;font-size:0.73rem;font-weight:700"><i class="fas fa-star mr-1"></i>Recommended</span>';
    if (s === 'not_awarded') return '<span style="background:#f3f4f6;color:#6b7280;border-radius:20px;padding:3px 10px;font-size:0.73rem;font-weight:500">Not Awarded</span>';
    return '<span style="background:#e0f2fe;color:#0369a1;border-radius:20px;padding:3px 10px;font-size:0.73rem;font-weight:500">Submitted</span>';
  }

  let rows = '';
  proposals.forEach(function(p) {
    // Use budget_amount/currency if available, fallback to financial_proposal
    let fin = '-';
    if (p.budget_amount && p.budget_amount > 0) {
      const cur = p.budget_currency || 'AED';
      fin = cur + ' ' + Number(p.budget_amount).toLocaleString();
    } else if (p.financial_proposal) {
      fin = 'AED ' + Number(p.financial_proposal).toLocaleString();
    }
    // Use timeline_months if available, fallback to proposed_duration
    let dur = '-';
    if (p.timeline_months && p.timeline_months > 0) {
      dur = p.timeline_months + ' mo';
    } else if (p.proposed_duration) {
      dur = p.proposed_duration;
    }
    const dateStr = p.created_at ? new Date(p.created_at).toLocaleDateString('en-AE') : '-';
    const isReal = p.is_real_submission;
    const isAwarded = (p.status === 'awarded');
    const rowBg = isAwarded ? 'background:#f0fdf4' : (isReal ? 'background:#fffbeb' : '');

    // File count badge — clickable to open side panel with download links
    var attachments = [];
    try { if (p.proposal_attachments) attachments = JSON.parse(p.proposal_attachments); } catch(e) {}
    var attachCount = attachments.length || (p.pdf_attachment_url ? 1 : 0);

    var filesCell = attachCount > 0
      ? '<span class="file-count-badge" onclick="viewProposalDetail(' + p.id + ')" title="Click to view &amp; download ' + attachCount + ' file(s)">'
        + '<i class="fas fa-paperclip"></i>' + attachCount + ' file' + (attachCount !== 1 ? 's' : '') + '</span>'
      : '<span style="color:#9ca3af;font-size:0.8rem">—</span>';

    // Award button — gold, prominent, shown only if not yet awarded; locked if another was awarded
    var rfpAwarded = proposals.some(function(pp){ return pp.status === 'awarded'; });
    var awardBtn = '';
    if (isAwarded) {
      awardBtn = '<span style="background:linear-gradient(135deg,#d4a017,#f5c842);color:#1a1a1a;border-radius:6px;padding:0.3rem 0.7rem;font-size:0.78rem;font-weight:700;display:inline-flex;align-items:center;gap:4px"><i class="fas fa-trophy"></i>Awarded</span>';
    } else if (!rfpAwarded) {
      awardBtn = '<button onclick="awardProposal(' + rfpId + ',' + p.id + ',\'' + escHtml(p.vendor_name||'this vendor') + '\')" '
        + 'style="background:linear-gradient(135deg,#d4a017,#f5c842);color:#1a1a1a;border:none;border-radius:6px;padding:0.3rem 0.7rem;font-size:0.78rem;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:4px;box-shadow:0 2px 6px rgba(212,160,23,0.45);transition:opacity 0.15s" '
        + 'title="Award contract to ' + escHtml(p.vendor_name||'vendor') + '">'
        + '<i class="fas fa-trophy"></i>Award</button>';
    }

    rows += '<tr style="' + rowBg + '">'
      + '<td><div style="display:flex;align-items:center;gap:8px">'
      + '<div style="width:32px;height:32px;border-radius:8px;background:var(--cpc-ink);display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:0.8rem;flex-shrink:0">' + escHtml((p.vendor_name||'?').charAt(0)) + '</div>'
      + '<div><div style="font-weight:600;font-size:0.87rem">' + escHtml(p.vendor_name||'Unknown') + '</div></div>'
      + '</div></td>'
      + '<td style="font-size:0.82rem;color:#6b7280">' + dateStr + '</td>'
      + '<td style="font-weight:600">' + fin + '</td>'
      + '<td style="font-size:0.82rem;color:#6b7280">' + escHtml(dur) + '</td>'
      + '<td>' + filesCell + '</td>'
      + '<td>' + statusBadge(p) + '</td>'
      + '<td style="white-space:nowrap">'
      + '<button class="btn-ghost btn-sm" onclick="viewProposalDetail(' + p.id + ')" style="margin-right:4px"><i class="fas fa-eye"></i>View</button>'
      + awardBtn
      + '</td>'
      + '</tr>';
  });

  setContent(
    '<div class="space-y-4">'
    + '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.5rem">'
    + '<div><h3 style="font-weight:700;font-size:0.95rem;color:#1f2937;margin:0">Submitted Proposals</h3>'
    + '<p style="font-size:0.8rem;color:#9ca3af;margin:0">' + proposals.length + ' proposal(s) received</p></div>'
    + '</div>'

    + '<div class="card" style="overflow:hidden">'
    + (proposals.length === 0
      ? '<div style="padding:3rem;text-align:center;color:#9ca3af"><i class="fas fa-inbox" style="font-size:2.5rem;display:block;margin-bottom:1rem;color:#d1d5db"></i>'
        + '<p style="margin-bottom:0.5rem">No proposals received yet.</p>'
        + '<p style="font-size:0.8rem;color:#c4b5fd;margin:0"><i class="fas fa-link" style="margin-right:4px"></i>Vendors submit proposals via the secure submission portal link included in their invitation email.</p></div>'
      : '<div style="overflow-x:auto"><table>'
        + '<thead><tr>'
        + '<th>Vendor</th><th>Date</th><th>Financial</th><th>Duration</th>'
        + '<th>Files</th><th>Status</th>'
        + '<th style="text-align:right">Actions</th>'
        + '</tr></thead>'
        + '<tbody>' + rows + '</tbody>'
        + '</table></div>')
    + '</div>'
    + '</div>'
  );
};

async function loadSampleProposals(rfpId) {
  await apiCall('POST', '/rfps/' + rfpId + '/proposals/sample', {});
  showToast('Sample proposals added!', 'success');
  rfpTabs.proposals(rfpId);
}

async function awardProposal(rfpId, proposalId, vendorName) {
  if (!confirm('Award contract to ' + vendorName + '?\n\nThis will:\n• Mark this proposal as Awarded\n• Mark the RFP as complete (Awarded)\n• Disable further document submissions and email replies for this RFP\n\nThis action cannot be undone.')) return;

  try {
    await apiCall('POST', '/rfps/' + rfpId + '/proposals/' + proposalId + '/award', {});
    // Mark Award and Proposals stages complete on lifecycle bar
    markStageCompleted(rfpId, 'award');
    markStageCompleted(rfpId, 'proposals');
    // Refresh RFP and lifecycle bar
    var rfp = await apiCall('GET', '/rfps/' + rfpId).catch(function(){ return null; });
    if (rfp) {
      appState.currentRfp = rfp;
      renderLifecycleBar(rfp);
      document.getElementById('pageSubtitle').textContent = (rfp.ref_number||'') + ' \u2022 ' + stageLabelMap(rfp.stage||'awarded');
    }
    showToast('\uD83C\uDFC6 Contract awarded to ' + vendorName + '! RFP is now complete. Submissions and email replies are disabled.', 'success', 7000);
    addNotification('info', '\uD83C\uDFC6 Contract Awarded', 'Contract awarded to ' + vendorName + '. RFP procurement cycle is complete.', rfpId, 'proposals', null);
    // Refresh proposals tab
    rfpTabs.proposals(rfpId);
  } catch(e) {
    showToast('Award failed: ' + (e.message || e), 'error');
  }
}

function downloadProposalPdf(id) {
  var p = appState.proposals.find(function(pp){ return pp.id === id; });
  if (!p || !p.pdf_attachment_url || !p.pdf_filename) { showToast('PDF not available', 'error'); return; }
  try {
    // Convert data: URI to Blob and trigger programmatic download
    var dataUrl = p.pdf_attachment_url;
    if (dataUrl.startsWith('data:')) {
      var parts = dataUrl.split(',');
      var mime = (parts[0].match(/data:([^;]+)/) || [])[1] || 'application/pdf';
      var binary = atob(parts[1]);
      var bytes = new Uint8Array(binary.length);
      for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      var blob = new Blob([bytes], { type: mime });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = p.pdf_filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(function() { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);
    } else {
      // Regular URL — use normal anchor download
      var a2 = document.createElement('a');
      a2.href = dataUrl;
      a2.download = p.pdf_filename;
      a2.target = '_blank';
      document.body.appendChild(a2);
      a2.click();
      document.body.removeChild(a2);
    }
  } catch(e) {
    showToast('Download failed: ' + (e.message || e), 'error');
  }
}

function closeProposalPanel() {
  var overlay = document.getElementById('proposalPanelOverlay');
  var panel = document.getElementById('proposalSidePanel');
  if (overlay) { overlay.style.opacity = '0'; setTimeout(function(){ overlay.remove(); }, 250); }
  if (panel) { panel.style.transform = 'translateX(100%)'; setTimeout(function(){ panel.remove(); }, 300); }
}

function viewProposalDetail(id) {
  const p = appState.proposals.find(function(p){ return p.id === id; });
  if (!p) return;


  // ── Budget & Timeline ────────────────────────────────────────────────────
  let fin = '-';
  if (p.budget_amount && p.budget_amount > 0) {
    const currency = p.budget_currency || 'AED';
    fin = currency + ' ' + Number(p.budget_amount).toLocaleString();
  } else if (p.financial_proposal) {
    fin = 'AED ' + Number(p.financial_proposal).toLocaleString();
  }
  let dur = '-';
  if (p.timeline_months && p.timeline_months > 0) {
    dur = p.timeline_months + ' month' + (p.timeline_months === 1 ? '' : 's');
  } else if (p.proposed_duration) {
    dur = p.proposed_duration;
  }
  const dateStr = p.created_at ? new Date(p.created_at).toLocaleString('en-AE') : '-';

  // ── Technical approach ──────────────────────────────────────────────────
  let techHtml = '';
  if (p.executive_summary) {
    techHtml = '<div style="margin-bottom:1.25rem">'
      + '<div class="panel-section-title"><i class="fas fa-file-alt" style="color:var(--cpc-ink)"></i>Technical Approach</div>'
      + '<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:0.875rem;font-size:0.82rem;line-height:1.7;color:#1e3a5f">' + escHtml(p.executive_summary) + '</div>'
      + '</div>';
  } else if (p.technical_proposal) {
    var tp = p.technical_proposal;
    var psOpCount = (tp.match(/\b(dup|pop|exch|sub|add|truncate|ifelse|RG|rg|Tf|Td|Tm|BT|ET|NonStruct|F\d+)\b/g) || []).length;
    var totalWords = (tp.match(/\S+/g) || []).length;
    var isGarbage = totalWords > 10 && (psOpCount / totalWords) > 0.15;
    if (isGarbage) {
      techHtml = '<div style="margin-bottom:1.25rem"><div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:0.875rem;font-size:0.82rem;color:#92400e"><i class="fas fa-exclamation-triangle mr-2"></i>PDF uses complex font encoding — text could not be extracted. Download the file to read it.</div></div>';
    } else {
      techHtml = '<div style="margin-bottom:1.25rem">'
        + '<div class="panel-section-title"><i class="fas fa-lightbulb" style="color:var(--cpc-gold)"></i>Technical Approach</div>'
        + '<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:0.875rem;font-size:0.82rem;max-height:160px;overflow-y:auto;white-space:pre-wrap;line-height:1.6;color:#374151">' + escHtml(tp.slice(0, 1200)) + (tp.length > 1200 ? '…' : '') + '</div>'
        + '</div>';
    }
  }

  // ── Key Strengths ───────────────────────────────────────────────────────
  let strengthsHtml = '';
  if (p.key_strengths) {
    const lines = p.key_strengths.split('\n').map(function(l){ return l.trim().replace(/^[•\-\*]\s*/, ''); }).filter(Boolean);
    if (lines.length > 0) {
      strengthsHtml = '<div style="margin-bottom:1.25rem">'
        + '<div class="panel-section-title"><i class="fas fa-star" style="color:var(--cpc-gold)"></i>Key Strengths</div>'
        + '<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:0.875rem">'
        + '<ul style="margin:0;padding-left:1.25rem;font-size:0.82rem;line-height:1.7;color:#374151">'
        + lines.map(function(l){ return '<li>' + escHtml(l) + '</li>'; }).join('')
        + '</ul></div></div>';
    }
  }

  // ── Documents list ──────────────────────────────────────────────────────
  let docsHtml = '';
  var attachments = [];
  try { if (p.proposal_attachments) attachments = JSON.parse(p.proposal_attachments); } catch(e) {}

  if (attachments.length > 0) {
    var docItems = attachments.map(function(a) {
      var sizeStr = a.size_bytes > 0 ? (Math.round(a.size_bytes / 1024 / 1024 * 10) / 10) + ' MB' : '';
      var openBtn = a.url
        ? '<a href="' + escHtml(a.url) + '" target="_blank" style="text-decoration:none;font-size:0.75rem;font-weight:600;color:var(--cpc-ink);padding:3px 8px;border:1px solid #bfdbfe;border-radius:5px;background:#eff6ff;display:inline-flex;align-items:center;gap:3px"><i class="fas fa-external-link-alt" style="font-size:0.6rem"></i>Open</a>' : '';
      var dlBtn = a.url
        ? '<a href="' + escHtml(a.url) + '" download="' + escHtml(a.filename) + '" style="text-decoration:none;font-size:0.75rem;color:#6b7280;padding:3px 7px;border:1px solid #e5e7eb;border-radius:5px;background:#f9fafb;display:inline-flex;align-items:center;gap:3px"><i class="fas fa-download" style="font-size:0.6rem"></i>Save</a>' : '';
      return '<div style="display:flex;align-items:center;gap:0.625rem;padding:0.55rem 0.75rem;border-bottom:1px solid #f3f4f6">'
        + '<i class="fas fa-file-pdf" style="color:#dc2626;font-size:1rem;flex-shrink:0"></i>'
        + '<div style="flex:1;min-width:0">'
        + '<div style="font-size:0.8rem;font-weight:600;color:#1f2937;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + escHtml(a.filename) + '</div>'
        + '<div style="font-size:0.7rem;color:#9ca3af">' + (sizeStr || '') + (sizeStr && a.label ? ' · ' : '') + (a.label ? attachmentLabelText(a.label) : '') + '</div>'
        + '</div>'
        + attachmentLabelPill(a.label)
        + '<div style="display:flex;gap:0.3rem;flex-shrink:0">' + openBtn + dlBtn + '</div>'
        + '</div>';
    }).join('');
    docsHtml = '<div style="margin-bottom:1.25rem">'
      + '<div class="panel-section-title"><i class="fas fa-paperclip" style="color:#6b7280"></i>Submitted Documents (' + attachments.length + ')</div>'
      + '<div style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;background:#fff">' + docItems + '</div>'
      + '</div>';
  } else if (p.pdf_attachment_url) {
    var singleOpen = p.pdf_attachment_url.startsWith('data:')
      ? '<button class="btn-secondary" onclick="downloadProposalPdf(' + p.id + ')"><i class="fas fa-download mr-1"></i>Download PDF</button>'
      : '<a href="' + escHtml(p.pdf_attachment_url) + '" target="_blank" style="text-decoration:none;font-size:0.78rem;font-weight:600;color:var(--cpc-ink);padding:5px 12px;border:1px solid #bfdbfe;border-radius:6px;background:#eff6ff;display:inline-flex;align-items:center;gap:4px"><i class="fas fa-external-link-alt" style="font-size:0.65rem"></i>Open PDF</a>'
        + ' <a href="' + escHtml(p.pdf_attachment_url) + '" download="' + escHtml(p.pdf_filename||'proposal.pdf') + '" style="text-decoration:none;font-size:0.78rem;color:#6b7280;padding:5px 10px;border:1px solid #e5e7eb;border-radius:6px;background:#f9fafb;display:inline-flex;align-items:center;gap:4px;margin-left:4px"><i class="fas fa-download" style="font-size:0.65rem"></i>Save</a>';
    docsHtml = '<div style="margin-bottom:1.25rem">'
      + '<div class="panel-section-title"><i class="fas fa-paperclip" style="color:#6b7280"></i>Submitted Document</div>'
      + '<div style="padding:0.75rem;border:1px solid #e5e7eb;border-radius:8px;display:flex;align-items:center;gap:0.75rem">'
      + '<i class="fas fa-file-pdf" style="color:#dc2626;font-size:1.1rem"></i>'
      + '<div style="flex:1;font-size:0.82rem;font-weight:600;color:#1f2937">' + escHtml(p.pdf_filename||'proposal.pdf') + '</div>'
      + '<div>' + singleOpen + '</div>'
      + '</div></div>';
  }

  // ── Build side panel ────────────────────────────────────────────────────
  // Remove any existing panel
  closeProposalPanel();

  var overlay = document.createElement('div');
  overlay.id = 'proposalPanelOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.35);z-index:900;transition:opacity 0.25s';
  overlay.addEventListener('click', closeProposalPanel);

  var panel = document.createElement('div');
  panel.id = 'proposalSidePanel';
  panel.style.cssText = 'position:fixed;top:0;right:0;bottom:0;width:min(680px,100vw);background:#fff;z-index:901;overflow-y:auto;box-shadow:-4px 0 32px rgba(0,0,0,0.15);transform:translateX(100%);transition:transform 0.3s cubic-bezier(0.16,1,0.3,1);display:flex;flex-direction:column';

  panel.innerHTML =
    // ── Panel header ──────────────────────────────────────────────────────
    '<div style="position:sticky;top:0;z-index:10;background:#fff;border-bottom:1px solid #e5e7eb;padding:1rem 1.25rem;display:flex;align-items:center;gap:0.875rem">'
    + '<div style="width:40px;height:40px;border-radius:10px;background:var(--cpc-ink);display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:1rem;flex-shrink:0">' + escHtml((p.vendor_name||'?').charAt(0)) + '</div>'
    + '<div style="flex:1;min-width:0">'
    + '<div style="font-weight:700;font-size:0.97rem;color:#1f2937;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + escHtml(p.vendor_name||'Unknown Vendor') + '</div>'
    + '<div style="font-size:0.75rem;color:#9ca3af">' + dateStr + '</div>'
    + '</div>'
    + '<button onclick="closeProposalPanel()" style="flex-shrink:0;width:32px;height:32px;border-radius:8px;border:1px solid #e5e7eb;background:#f9fafb;color:#6b7280;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:1rem;transition:background 0.15s" title="Close panel"><i class="fas fa-times"></i></button>'
    + '</div>'

    // ── Key metrics bar ───────────────────────────────────────────────────
    + '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0;border-bottom:1px solid #e5e7eb">'
    + '<div style="padding:0.875rem 1.25rem;border-right:1px solid #e5e7eb">'
    + '<div style="font-size:0.68rem;color:#9ca3af;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:3px">Budget</div>'
    + '<div style="font-size:1rem;font-weight:700;color:#745B35">' + escHtml(fin) + '</div>'
    + '</div>'
    + '<div style="padding:0.875rem 1.25rem;border-right:1px solid #e5e7eb">'
    + '<div style="font-size:0.68rem;color:#9ca3af;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:3px">Delivery Timeline</div>'
    + '<div style="font-size:1rem;font-weight:700;color:#745B35">' + escHtml(dur) + '</div>'
    + '</div>'
    + '<div style="padding:0.875rem 1.25rem">'
    + '<div style="font-size:0.68rem;color:#9ca3af;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:3px">Status</div>'
    + '<div style="margin-top:1px">' + (p.status === 'awarded' ? '<span style="font-size:0.82rem;font-weight:700;color:#065f46"><i class="fas fa-trophy mr-1"></i>Awarded</span>' : '<span style="font-size:0.82rem;font-weight:600;color:#374151">' + escHtml((p.status||'submitted').replace(/_/g,' ')) + '</span>') + '</div>'
    + '</div>'
    + '</div>'

    // ── Scrollable body ───────────────────────────────────────────────────
    + '<div style="padding:1.25rem;flex:1">'
    + techHtml
    + strengthsHtml
    + docsHtml
    + '</div>'

    // ── Footer ─────────────────────────────────────────────────────────────
    + '<div style="position:sticky;bottom:0;background:#fff;border-top:1px solid #e5e7eb;padding:0.875rem 1.25rem;display:flex;gap:0.5rem;justify-content:flex-end">'
    + '<button class="btn-ghost" onclick="closeProposalPanel()" style="padding:0.5rem 1.25rem">Close</button>'
    + '</div>';

  document.body.appendChild(overlay);
  document.body.appendChild(panel);

  // Trigger animations
  requestAnimationFrame(function() {
    overlay.style.opacity = '1';
    requestAnimationFrame(function() { panel.style.transform = 'translateX(0)'; });
  });
}

// rfpTabs.evaluation, rfpTabs.recommendation, and rfpTabs.scoring removed — AI evaluation features removed in v8

// ============================================================
// PAGE: VENDOR COMMUNICATIONS (per-vendor thread)
// ============================================================
pages.vendor_comms = async function(opts) {
  const rfpId = opts.rfpId;
  const vendorId = opts.vendorId;

  // Show back button
  var backBtn = document.getElementById('backBtn');
  if (backBtn) backBtn.style.display = 'inline-flex';

  // Fetch all emails + vendor info + vendor status for this RFP
  let allEmails = [], received = [], rfp = appState.currentRfp, vendorDeclined = false;
  try {
    [allEmails, received] = await Promise.all([
      apiCall('GET', '/rfps/' + rfpId + '/emails').catch(function(){ return []; }),
      apiCall('GET', '/rfps/' + rfpId + '/emails/received').catch(function(){ return []; }),
    ]);
    if (!rfp) rfp = await apiCall('GET', '/rfps/' + rfpId).catch(function(){ return null; });
    // Check if vendor is declined for this RFP
    const rfpVendors = appState.rfpVendors || await apiCall('GET', '/rfps/' + rfpId + '/vendors').catch(function(){ return []; });
    const vendorEntry = rfpVendors.find(function(v){ return String(v.id) === String(vendorId); });
    vendorDeclined = vendorEntry ? vendorEntry.rfp_status === 'declined' : false;
  } catch(e) {}

  // Combine and filter by vendorId
  const combined = {};
  allEmails.forEach(function(e) {
    combined[e.id] = e;
  });
  received.forEach(function(e) {
    if (!combined[e.id]) combined[e.id] = e;
  });

  const vendorEmails = Object.values(combined).filter(function(e) {
    return String(e.vendor_id) === String(vendorId);
  }).sort(function(a, b) { return (a.id||0) - (b.id||0); });

  // Determine vendor name
  const anyEmail = vendorEmails[0] || allEmails.find(function(e){ return String(e.vendor_id)===String(vendorId); });
  const vendorName = anyEmail ? (anyEmail.vendor_name || anyEmail.recipient || anyEmail.from_email || 'Vendor') : 'Vendor #' + vendorId;

  // Update page header
  document.getElementById('pageTitle').textContent = vendorName + ' — Communications';
  document.getElementById('pageSubtitle').textContent = (rfp ? rfp.title || 'RFP' : 'RFP') + ' \u2022 Vendor Communication Thread';

  // Build thread HTML
  let threadHtml = '';
  if (vendorEmails.length === 0) {
    threadHtml = '<div class="card" style="padding:3rem;text-align:center;color:#9ca3af">'
      + '<i class="fas fa-comments" style="font-size:2.5rem;display:block;margin-bottom:1rem;color:#d1d5db"></i>'
      + '<p style="font-weight:600;color:#6b7280;margin-bottom:0.5rem">No email correspondence yet</p>'
      + '<p style="font-size:0.82rem">Emails with this vendor will appear here once communication starts.</p>'
      + '</div>';
  } else {
    vendorEmails.forEach(function(e) {
      const isInbound = e.status === 'received';
      const dateStr = e.created_at ? new Date(e.created_at).toLocaleString('en-AE') : '';
      const bodyCollapseId = 'vc-email-body-' + e.id;

      const hasAttach = e.has_attachment || e.has_pdf;
      let attachBadgeHtml = '';
      if (e.has_pdf) {
        attachBadgeHtml = '<span style="background:#ede9fe;color:var(--cpc-gold-deep);border-radius:4px;padding:2px 6px;font-size:0.7rem;font-weight:600"><i class="fas fa-file-pdf mr-1"></i>PDF Proposal</span>';
      } else if (e.has_attachment) {
        attachBadgeHtml = '<span style="background:#fef3c7;color:#92400e;border-radius:4px;padding:2px 6px;font-size:0.7rem;font-weight:600"><i class="fas fa-paperclip mr-1"></i>Attachment</span>';
      }
      const typeBadge = e.email_type
        ? '<span style="background:#f3f4f6;color:#6b7280;border-radius:4px;padding:2px 5px;font-size:0.68rem">' + escHtml(e.email_type) + '</span>'
        : '';
      const catBadge = e.email_category
        ? '<span style="background:#e0f2fe;color:#0369a1;border-radius:4px;padding:2px 5px;font-size:0.68rem"><i class="fas fa-robot mr-1"></i>' + escHtml(e.email_category) + '</span>'
        : '';

      const bodyContent = e.email_body_html
        ? '<iframe srcdoc="' + escHtml(e.email_body_html) + '" style="width:100%;border:none;min-height:160px;border-radius:6px;background:white" sandbox="allow-same-origin"></iframe>'
        : '<pre style="white-space:pre-wrap;font-size:0.82rem;color:#374151;font-family:inherit;margin:0;background:#f9fafb;padding:0.75rem;border-radius:6px">' + escHtml((e.body||'(no body)').slice(0,2000)) + '</pre>';

      const bubbleStyle = isInbound
        ? 'background:#f5f3ff;border:1px solid #ede9fe;border-radius:0 12px 12px 12px;padding:0.875rem 1rem'
        : 'background:#fff7e6;border:1px solid #fde68a;border-radius:12px 0 12px 12px;padding:0.875rem 1rem';
      const nameColor = isInbound ? '#BA9765' : '#b45309';
      const avatarBg = isInbound ? '#BA9765' : 'var(--cpc-gold)';
      const avatarIcon = isInbound ? 'fa-user' : 'fa-crown';
      const alignDir = isInbound ? 'row' : 'row-reverse';
      const displayName = isInbound ? escHtml(e.from_email || vendorName) : 'CPC Procurement';

      threadHtml += '<div style="display:flex;gap:0.75rem;margin-bottom:1rem;flex-direction:' + alignDir + ';align-items:flex-start">'
        // Avatar
        + '<div style="width:36px;height:36px;border-radius:50%;background:' + avatarBg + ';display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:4px">'
        + '<i class="fas ' + avatarIcon + '" style="color:white;font-size:0.8rem"></i></div>'
        // Bubble
        + '<div style="flex:1;max-width:85%">'
        + '<div style="' + bubbleStyle + '">'
        // Header row
        + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.4rem;gap:0.5rem;flex-wrap:wrap">'
        + '<span style="font-weight:700;font-size:0.82rem;color:' + nameColor + '">' + displayName + '</span>'
        + '<div style="display:flex;align-items:center;gap:0.4rem;flex-wrap:wrap">'
        + typeBadge + catBadge + attachBadgeHtml
        + '<span style="font-size:0.7rem;color:#9ca3af">' + dateStr + '</span>'
        + '</div></div>'
        // Subject
        + '<div style="font-size:0.85rem;font-weight:600;color:#1f2937;margin-bottom:0.35rem">' + escHtml(e.subject||'(no subject)') + '</div>'
        // Toggle body
        + '<button onclick="toggleInboundBody(\'' + bodyCollapseId + '\')" style="font-size:0.72rem;color:' + nameColor + ';background:none;border:none;cursor:pointer;padding:0;margin-bottom:0.35rem">'
        + '<i class="fas fa-chevron-down" id="chevron-' + bodyCollapseId + '"></i> View message</button>'
        + '<div id="' + bodyCollapseId + '" style="display:none;margin-top:0.5rem">' + bodyContent + '</div>'
        // Attachment note
        + (isInbound && e.has_attachment ? '<div style="margin-top:0.5rem;font-size:0.75rem;color:#92400e;background:#fef3c7;padding:4px 8px;border-radius:4px"><i class="fas fa-file-excel mr-1"></i>Attachment processed \u2014 questions added to Q&A tab</div>' : '')
        + (isInbound && e.has_pdf ? '<div style="margin-top:0.5rem;font-size:0.75rem;color:#5b21b6;background:#ede9fe;padding:4px 8px;border-radius:4px"><i class="fas fa-file-pdf mr-1"></i>PDF proposal received \u2014 added to Proposals tab</div>' : '')
        + '</div>'
        + '</div>'
        + '</div>';
    });
  }

  // Reply form — blocked if vendor declined
  const replySection = vendorDeclined
    ? '<div class="card" style="padding:1.25rem;margin-top:1rem;background:#fef2f2;border:1.5px solid #fca5a5">'
      + '<div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:0.5rem">'
      + '<i class="fas fa-ban" style="color:#dc2626;font-size:1.25rem;flex-shrink:0"></i>'
      + '<div><div style="font-weight:700;font-size:0.9rem;color:#991b1b">Correspondence Prohibited</div>'
      + '<div style="font-size:0.8rem;color:#dc2626">' + escHtml(vendorName) + ' has declined participation in this RFP. No further correspondence is permitted.</div>'
      + '</div></div>'
      + '<button class="btn-ghost" onclick="navigateTo(\'rfp_detail\',{rfpId:' + rfpId + ',tab:\'vendors\'})"><i class="fas fa-arrow-left"></i>Back to RFP</button>'
      + '</div>'
    : '<div class="card" style="padding:1.25rem;margin-top:1rem">'
      + '<h4 style="font-weight:700;font-size:0.875rem;color:#1f2937;margin:0 0 0.75rem"><i class="fas fa-reply mr-2" style="color:var(--cpc-ink)"></i>Reply to ' + escHtml(vendorName) + '</h4>'
      + '<div class="form-group" style="margin-bottom:0.5rem">'
      + '<input id="vc-reply-subj" type="text" placeholder="Subject..." style="width:100%;padding:7px 10px;border:1px solid #e5e7eb;border-radius:6px;font-size:0.82rem;box-sizing:border-box">'
      + '</div>'
      + '<div class="form-group" style="margin-bottom:0.5rem">'
      + '<textarea id="vc-reply-text" rows="4" placeholder="Type your message..." style="width:100%;padding:8px 10px;border:1px solid #e5e7eb;border-radius:6px;font-size:0.82rem;resize:vertical;box-sizing:border-box"></textarea>'
      + '</div>'
      + '<div style="display:flex;gap:0.5rem">'
      + '<button class="btn-primary" onclick="sendVendorCommReply(' + rfpId + ',' + vendorId + ')"><i class="fas fa-paper-plane"></i>Send Reply</button>'
      + '<button class="btn-ghost" onclick="navigateTo(\'rfp_detail\',{rfpId:' + rfpId + ',tab:\'vendors\'})"><i class="fas fa-arrow-left"></i>Back to RFP</button>'
      + '</div>'
      + '</div>';

  const declinedBanner = vendorDeclined
    ? '<div style="background:#fee2e2;border:1.5px solid #fca5a5;border-radius:8px;padding:0.75rem 1rem;display:flex;align-items:center;gap:0.75rem;margin-bottom:1rem">'
      + '<i class="fas fa-times-circle" style="color:#dc2626;font-size:1.1rem;flex-shrink:0"></i>'
      + '<div><div style="font-weight:700;font-size:0.85rem;color:#991b1b">Vendor Declined Participation</div>'
      + '<div style="font-size:0.78rem;color:#dc2626">This vendor replied to the RFP invitation indicating they are not interested. All correspondence is now prohibited.</div></div>'
      + '</div>'
    : '';

  setContent(
    '<div style="max-width:860px;margin:0 auto">'
    // Declined banner (if applicable)
    + declinedBanner
    // Header card
    + '<div class="card" style="padding:1rem 1.25rem;margin-bottom:1rem;display:flex;align-items:center;justify-content:space-between' + (vendorDeclined ? ';background:#fef2f2;border:1.5px solid #fca5a5' : '') + '">'
    + '<div style="display:flex;align-items:center;gap:0.875rem">'
    + '<div style="width:44px;height:44px;border-radius:10px;background:' + (vendorDeclined ? '#dc2626' : 'var(--cpc-ink)') + ';display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:1.1rem">'
    + (vendorDeclined ? '<i class="fas fa-times" style="font-size:1rem"></i>' : escHtml((vendorName||'?').charAt(0))) + '</div>'
    + '<div>'
    + '<div style="font-weight:700;font-size:0.95rem;color:' + (vendorDeclined ? '#991b1b' : '#1f2937') + '">' + escHtml(vendorName) + '</div>'
    + '<div style="font-size:0.78rem;color:#9ca3af">' + vendorEmails.length + ' message(s) in thread'
    + ' &bull; <span style="font-family:monospace;color:var(--cpc-ink);font-weight:600" title="Participant Reference Code">RFP-' + rfpId + '-V' + vendorId + '</span>'
    + (vendorDeclined ? ' &bull; <span style="color:#dc2626;font-weight:600">DECLINED</span>' : '') + '</div>'
    + '</div></div>'
    + '<div style="display:flex;gap:0.5rem">'
    + '<button class="btn-secondary btn-sm" onclick="pages.vendor_comms({rfpId:' + rfpId + ',vendorId:' + vendorId + '})"><i class="fas fa-sync"></i>Refresh</button>'
    + '<button class="btn-ghost btn-sm" onclick="navigateTo(\'rfp_detail\',{rfpId:' + rfpId + ',tab:\'vendors\'})"><i class="fas fa-arrow-left"></i>Back to RFP</button>'
    + '</div>'
    + '</div>'
    // Messages
    + '<div style="display:flex;flex-direction:column;gap:0;padding:0 0 0.5rem">'
    + (threadHtml || '<div style="padding:2rem;text-align:center;color:#9ca3af">No messages yet</div>')
    + '</div>'
    // Reply
    + replySection
    + '</div>'
  );

  // Start polling for new messages
  startVendorCommsPolling(rfpId, vendorId);
};

var _vcPollTimer = null;
function startVendorCommsPolling(rfpId, vendorId) {
  if (_vcPollTimer) clearInterval(_vcPollTimer);
  _vcPollTimer = setInterval(function() {
    if (appState.currentPage !== 'vendor_comms') { clearInterval(_vcPollTimer); _vcPollTimer = null; return; }
    silentCheckInbox(rfpId);
  }, 8000);
}

async function sendVendorCommReply(rfpId, vendorId) {
  const subjEl = document.getElementById('vc-reply-subj');
  const textEl = document.getElementById('vc-reply-text');
  if (!textEl || !textEl.value.trim()) { showToast('Please enter a message', 'error'); return; }
  try {
    const result = await apiCall('POST', '/rfps/' + rfpId + '/vendors/' + vendorId + '/reply', {
      subject: subjEl ? subjEl.value : '',
      text: textEl.value,
    });
    if (result.ok) {
      showToast('Reply sent!', 'success');
    } else {
      showToast('Reply simulated (no real email sent)', 'info');
    }
    if (textEl) textEl.value = '';
    if (subjEl) subjEl.value = '';
    // Reload page
    pages.vendor_comms({ rfpId: rfpId, vendorId: vendorId });
  } catch(e) {
    showToast('Failed to send: ' + e.message, 'error');
  }
}

// ============================================================
// PAGE: VENDORS (global registry)
// ============================================================
pages.vendors = async function() {
  const vendors = await apiCall('GET', '/vendors').catch(function(){ return []; });
  appState.vendors = vendors;

  let rows = '';
  vendors.forEach(function(v) {
    var allSpecs2 = (v.specializations||'').split(',').filter(Boolean);
    var visTags2 = allSpecs2.slice(0,3).map(function(s){ return '<span class="tag">' + escHtml(s.trim()) + '</span>'; }).join('');
    var more2 = allSpecs2.length - 3;
    var moreBadge2 = more2 > 0 ? '<span style="font-size:0.75rem;color:var(--cpc-gold-deep);text-decoration:underline;margin-left:3px">+' + more2 + ' more</span>' : '';
    const tags = visTags2 + moreBadge2;

    rows += '<tr>'
      + '<td><div style="display:flex;align-items:center;gap:0.75rem">'
      + '<div style="width:36px;height:36px;border-radius:8px;background:var(--cpc-ink);display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:0.9rem;flex-shrink:0">' + escHtml(v.name.charAt(0)) + '</div>'
      + '<div><div style="font-weight:600;font-size:0.95rem">' + escHtml(v.name) + '</div>'
      + '<div style="font-size:0.78rem;color:#9ca3af">' + escHtml(v.country||'UAE') + ' &bull; ' + escHtml(v.size||'') + '</div>'
      + '</div></div></td>'
      + '<td>' + escHtml(v.category||'') + '</td>'
      + '<td onclick="viewVendorDetail(' + v.id + ')" style="cursor:pointer" title="Click to see all specializations"><div class="tag-group">' + tags + '</div></td>'
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
    + '<thead><tr><th>Vendor</th><th>Category</th><th>Specializations</th><th></th></tr></thead>'
    + '<tbody>' + rows + '</tbody>'
    + '</table></div></div>'
    + '</div>'
  );
};

function viewVendorDetail(id) {
  const v = appState.vendors.find(function(v){ return v.id === id; });
  const rv = appState.rfpVendors ? appState.rfpVendors.find(function(v){ return v.id === id; }) : null;
  const vendor = v || rv;
  if (!vendor) return;

  // Helper: render a labelled field row (label on same line as value, never pushed to next line)
  function field(label, value, fullWidth) {
    var val = escHtml(value || '–');
    return '<div style="' + (fullWidth ? 'grid-column:1/-1;' : '') + 'min-width:0">'
      + '<div style="font-size:0.7rem;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#9a8c78;margin-bottom:2px">' + label + '</div>'
      + '<div style="font-size:0.84rem;color:var(--cpc-ink);line-height:1.45;word-break:break-word">' + val + '</div>'
      + '</div>';
  }

  // Helper: render a section header divider
  function sectionHead(title) {
    return '<div style="grid-column:1/-1;border-top:1px solid var(--cpc-line);padding-top:0.75rem;margin-top:0.25rem">'
      + '<span style="font-size:0.68rem;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:var(--cpc-gold)">' + title + '</span>'
      + '</div>';
  }

  // Render semi-colon-separated items as tag pills
  function tagList(str) {
    if (!str) return '<span style="font-size:0.84rem;color:#9a8c78">–</span>';
    return str.split(';').filter(Boolean).map(function(s){
      return '<span class="tag" style="white-space:normal;max-width:none;word-break:break-word;margin-bottom:2px">' + escHtml(s.trim()) + '</span>';
    }).join('');
  }

  // Website link
  var websiteHtml = vendor.website
    ? '<a href="https://' + escHtml(vendor.website) + '" target="_blank" rel="noopener" style="font-size:0.84rem;color:var(--cpc-gold-deep);text-decoration:none">'
      + escHtml(vendor.website) + ' <i class="fas fa-external-link-alt" style="font-size:0.65rem"></i></a>'
    : '<span style="font-size:0.84rem;color:#9a8c78">–</span>';

  var websiteFieldHtml = '<div style="min-width:0">'
    + '<div style="font-size:0.7rem;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#9a8c78;margin-bottom:2px">Website</div>'
    + websiteHtml + '</div>';

  // Founded badge
  var foundedStr = vendor.founded_year ? String(vendor.founded_year) : '–';

  var html = ''
    // ── Header ──
    + '<div style="display:flex;align-items:center;gap:0.875rem;margin-bottom:1.25rem">'
    +   '<div style="width:52px;height:52px;border-radius:12px;background:var(--cpc-ink);display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:1.35rem;flex-shrink:0">' + escHtml(vendor.name.charAt(0)) + '</div>'
    +   '<div style="min-width:0">'
    +     '<h3 style="font-size:1.05rem;font-weight:700;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + escHtml(vendor.name) + '</h3>'
    +     '<div style="display:flex;align-items:center;gap:8px;margin-top:3px;flex-wrap:wrap">'
    +       '<span style="font-size:0.78rem;color:#6b7280">' + escHtml(vendor.category||'') + '</span>'
    +       (vendor.founded_year ? '<span style="font-size:0.72rem;background:var(--cpc-ivory);border:1px solid var(--cpc-line);border-radius:4px;padding:1px 7px;color:#74635a">Est. ' + foundedStr + '</span>' : '')
    +       (vendor.size ? '<span style="font-size:0.72rem;background:var(--cpc-ivory);border:1px solid var(--cpc-line);border-radius:4px;padding:1px 7px;color:#74635a">' + escHtml(vendor.size) + '</span>' : '')
    +     '</div>'
    +   '</div>'
    + '</div>'

    // ── Grid body ──
    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem 1.25rem;font-size:0.85rem;margin-bottom:0.5rem">'

    // Section: Company
    + sectionHead('Company')
    + field('Country', vendor.country)
    + field('Headquarters', vendor.hq_city)
    + websiteFieldHtml
    + field('Annual Revenue', vendor.annual_revenue_usd)

    // Section: Contact
    + sectionHead('Contact')
    + field('Contact Name', vendor.contact_name)
    + '<div style="min-width:0">'
    +   '<div style="font-size:0.7rem;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#9a8c78;margin-bottom:2px">Contact Email <span style="font-size:0.68rem;color:#b8a898;font-weight:400;text-transform:none;letter-spacing:0">(editable)</span></div>'
    +   '<div style="display:flex;gap:6px;align-items:center">'
    +     '<input id="vendorEmailInput_' + id + '" type="email" value="' + escHtml(vendor.contact_email||'') + '" '
    +     'style="flex:1;border:1px solid #d1d5db;border-radius:6px;padding:5px 8px;font-size:0.82rem;min-width:0" '
    +     'placeholder="email@vendor.com">'
    +     '<button class="btn-primary" style="padding:5px 12px;font-size:0.78rem;white-space:nowrap;flex-shrink:0" onclick="saveVendorEmail(' + id + ')"><i class="fas fa-save"></i>Save</button>'
    +   '</div>'
    +   '<div id="vendorEmailMsg_' + id + '" style="font-size:0.72rem;margin-top:3px"></div>'
    + '</div>'

    // Section: Technical Profile
    + sectionHead('Technical Profile')
    + '<div style="grid-column:1/-1;min-width:0">'
    +   '<div style="font-size:0.7rem;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#9a8c78;margin-bottom:6px">Platforms &amp; Technologies</div>'
    +   '<div class="tag-group" style="flex-wrap:wrap;gap:4px">' + tagList(vendor.platforms) + '</div>'
    + '</div>'
    + '<div style="grid-column:1/-1;min-width:0">'
    +   '<div style="font-size:0.7rem;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#9a8c78;margin-bottom:6px">Specializations</div>'
    +   '<div class="tag-group" style="flex-wrap:wrap;gap:4px">'
    +   (vendor.specializations||'').split(/[,;]/).filter(Boolean).map(function(s){
          return '<span class="tag" style="white-space:normal;max-width:none;word-break:break-word;margin-bottom:2px">' + escHtml(s.trim()) + '</span>';
        }).join('')
    +   '</div>'
    + '</div>'
    + field('Certifications', vendor.certifications, true)

    // Section: Industry Experience
    + sectionHead('Industry Experience')
    + field('Experience Summary', vendor.erp_experience, true)
    + field('Public Sector References', vendor.public_sector_refs, true)

    + '</div>' // end grid

    // ── Close button ──
    + '<button class="btn-ghost" style="width:100%;margin-top:0.75rem" onclick="closeModal()">Close</button>';

  showModal(html);
}

async function saveVendorEmail(vendorId) {
  const input = document.getElementById('vendorEmailInput_' + vendorId);
  const msgEl = document.getElementById('vendorEmailMsg_' + vendorId);
  if (!input) return;
  const newEmail = (input.value || '').trim();
  if (!newEmail || !newEmail.includes('@')) {
    if (msgEl) { msgEl.style.color='#dc2626'; msgEl.textContent='Please enter a valid email address.'; }
    return;
  }
  try {
    if (msgEl) { msgEl.style.color='#6b7280'; msgEl.textContent='Saving...'; }
    const result = await apiCall('PUT', '/vendors/' + vendorId, { contact_email: newEmail });
    if (result.ok) {
      // Update local state
      var v = appState.vendors ? appState.vendors.find(function(v){ return v.id === vendorId; }) : null;
      if (v) v.contact_email = newEmail;
      var rv = appState.rfpVendors ? appState.rfpVendors.find(function(v){ return v.id === vendorId; }) : null;
      if (rv) rv.contact_email = newEmail;
      if (msgEl) { msgEl.style.color='#065f46'; msgEl.textContent='✓ Email updated successfully.'; }
      showToast('Vendor email updated successfully.', 'success');
    } else {
      if (msgEl) { msgEl.style.color='#dc2626'; msgEl.textContent = result.error || 'Failed to save.'; }
    }
  } catch(e) {
    if (msgEl) { msgEl.style.color='#dc2626'; msgEl.textContent='Error: ' + e.message; }
  }
}

// ============================================================
// PAGE: REPORTS
// ============================================================
pages.reports = async function() {
  let stats;
  try {
    stats = await apiCall('GET', '/stats');
  } catch(e) {
    stats = {};
  }

  setContent(
    '<div class="space-y-4">'
    + '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:0.875rem">'
    + '<div class="stat-card"><div class="stat-label">Total RFPs</div><div class="stat-value" style="color:var(--cpc-ink)">' + (stats.totalRfps||0) + '</div></div>'
    + '<div class="stat-card"><div class="stat-label">Win Rate</div><div class="stat-value" style="color:var(--cpc-gold)">' + (stats.winRate||0) + '%</div></div>'
    + '<div class="stat-card"><div class="stat-label">Avg RFP Duration</div><div class="stat-value" style="color:#065f46">' + (stats.avgDuration ? stats.avgDuration + 'd' : 'N/A') + '</div></div>'
    + '<div class="stat-card"><div class="stat-label">Registered Vendors</div><div class="stat-value" style="color:var(--cpc-gold-deep)">' + (stats.totalVendors||0) + '</div></div>'
    + '</div>'
    + '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:0.875rem">'
    + '<div class="stat-card"><div class="stat-label">Total Proposals</div><div class="stat-value" style="color:var(--cpc-gold-deep)">' + (stats.totalProposals||0) + '</div></div>'
    + '<div class="stat-card"><div class="stat-label">Emails Sent</div><div class="stat-value" style="color:var(--cpc-ink)">' + (stats.totalEmails||0) + '</div></div>'
    + '<div class="stat-card"><div class="stat-label">Awarded RFPs</div><div class="stat-value" style="color:#065f46">' + (stats.awardedRfps||0) + '</div></div>'
    + '</div>'
    + '</div>'
  );
};

// ============================================================
// CREATE RFP MODAL (two-step: step 1 = title + arch doc, step 2 = details)
// ============================================================
var _createRfpDocFiles = [];   // array of { slotId, file, label }

function showCreateRfpModal() {
  _createRfpDocFiles = [];
  showModal(
    // Header
    '<div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:1rem">'
    + '<div style="width:36px;height:36px;border-radius:50%;background:var(--cpc-gold);display:flex;align-items:center;justify-content:center;color:white;flex-shrink:0">'
    + '<i class="fas fa-file-circle-plus" style="font-size:1rem"></i></div>'
    + '<div><h3 style="font-size:1rem;font-weight:700;margin:0">Create New RFP</h3>'
    + '<div style="font-size:0.72rem;color:#9ca3af">Enter project basics and optionally upload supporting documents. Fill in detailed requirements on the next page.</div>'
    + '</div></div>'

    // Title
    + '<div class="form-group" style="margin-bottom:0.625rem"><label>Project Title *</label>'
    + '<input id="newRfpTitle" placeholder="e.g. CRM Modernisation, Fraud Detection Platform, Data Warehouse..."></div>'

    // Category / Budget / Deadline in one row
    + '<div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:0.625rem;margin-bottom:0.75rem">'
    + '<div class="form-group" style="margin:0"><label>Category</label><select id="newRfpCat">'
    + ['IT & Digital Transformation','Consulting Services','Infrastructure','Professional Services','Data & Analytics'].map(function(c){ return '<option>' + c + '</option>'; }).join('')
    + '</select></div>'
    + '<div class="form-group" style="margin:0"><label>Budget (AED)</label><input id="newRfpBudget" placeholder="5,000,000"></div>'
    + '<div class="form-group" style="margin:0"><label>Deadline</label><input type="date" id="newRfpDeadline" value="' + getDateOffset(30) + '"></div>'
    + '</div>'

    // Two upload slots
    + '<div style="margin-bottom:1rem">'
    + '<label style="display:flex;align-items:center;gap:6px;font-size:0.82rem;font-weight:600;color:#374151;margin-bottom:0.5rem">'
    + '<i class="fas fa-file-pdf" style="color:#dc2626"></i>Supporting Documents'
    + '<span style="font-weight:400;color:#9ca3af;font-size:0.72rem;margin-left:4px">— Optional. AI will read these during generation.</span></label>'
    + buildDocUploadSlot('doc0', 'Conceptual Solution Architecture', 'fa-sitemap', '#BA9765')
    + buildDocUploadSlot('doc1', 'Business Requirements Document', 'fa-clipboard-list', '#745B35')
    + '</div>'

    // Action buttons
    + '<div style="display:flex;gap:0.5rem">'
    + '<button class="btn-primary" id="createRfpBtn" style="flex:1" onclick="createRfp()"><i class="fas fa-rocket"></i>Create RFP</button>'
    + '<button class="btn-ghost" onclick="closeModal()">Cancel</button>'
    + '</div>'
  );
}

function buildDocUploadSlot(slotId, docLabel, icon, color) {
  return '<div id="slot-wrap-' + slotId + '" onclick="document.getElementById(\'file-' + slotId + '\').click()" '
    + 'style="border:2px dashed #d1d5db;border-radius:8px;padding:0.625rem 0.875rem;display:flex;align-items:center;gap:0.75rem;cursor:pointer;transition:border-color 0.2s;background:#fafafa;margin-bottom:0.5rem" '
    + 'onmouseover="this.style.borderColor=\'' + color + '\'" onmouseout="if(!document.getElementById(\'file-' + slotId + '\').files.length){this.style.borderColor=\'#d1d5db\'}">'
    + '<div style="width:30px;height:30px;border-radius:7px;background:' + color + '18;display:flex;align-items:center;justify-content:center;flex-shrink:0">'
    + '<i class="fas ' + icon + '" style="color:' + color + ';font-size:0.82rem"></i></div>'
    + '<div style="flex:1;min-width:0">'
    + '<div style="font-size:0.78rem;font-weight:600;color:#374151">' + docLabel + '</div>'
    + '<div id="slot-label-' + slotId + '" style="font-size:0.7rem;color:#9ca3af">Click to upload PDF (optional)</div>'
    + '</div>'
    + '<i class="fas fa-cloud-upload-alt" id="slot-icon-' + slotId + '" style="color:#d1d5db;font-size:1rem"></i>'
    + '</div>'
    + '<input type="file" id="file-' + slotId + '" accept=".pdf" style="display:none" onchange="handleDocSlotSelect(\'' + slotId + '\',\'' + docLabel + '\',event)">';
}

function handleDocSlotSelect(slotId, docLabel, event) {
  const file = event.target.files[0];
  if (!file) return;
  _createRfpDocFiles = _createRfpDocFiles.filter(function(d){ return d.slotId !== slotId; });
  _createRfpDocFiles.push({ slotId: slotId, file: file, label: docLabel });
  var labelEl = document.getElementById('slot-label-' + slotId);
  var iconEl  = document.getElementById('slot-icon-' + slotId);
  var wrapEl  = document.getElementById('slot-wrap-' + slotId);
  if (labelEl) labelEl.innerHTML = '<strong style="color:#065f46">' + escHtml(file.name) + '</strong> &bull; ' + (file.size/1024).toFixed(1) + ' KB';
  if (iconEl)  { iconEl.className = 'fas fa-check-circle'; iconEl.style.color = '#065f46'; }
  if (wrapEl)  wrapEl.style.borderColor = '#065f46';
}

async function createRfp() {
  const title = (document.getElementById('newRfpTitle') ? document.getElementById('newRfpTitle').value : '').trim();
  if (!title) { showToast('Please enter a project title', 'error'); return; }

  const btn = document.getElementById('createRfpBtn');
  setLoading(btn, true, 'Creating...');
  try {
    // 1. Create RFP record (no detail fields yet — user fills them on Generate tab)
    const rfpBody = {
      title: title,
      category: document.getElementById('newRfpCat') ? document.getElementById('newRfpCat').value : 'IT & Digital Transformation',
      budget: document.getElementById('newRfpBudget') ? document.getElementById('newRfpBudget').value : '',
      deadline: document.getElementById('newRfpDeadline') ? document.getElementById('newRfpDeadline').value : '',
      scope: '', background: '', objectives: '', tech_requirements: '',
    };
    const rfp = await apiCall('POST', '/rfps', rfpBody);

    // 2. Upload supporting documents if any
    if (_createRfpDocFiles.length > 0) {
      setLoading(btn, true, 'Uploading ' + _createRfpDocFiles.length + ' doc(s)...');
      for (var di = 0; di < _createRfpDocFiles.length; di++) {
        var docEntry = _createRfpDocFiles[di];
        try {
          const fd = new FormData();
          fd.append('file', docEntry.file);
          fd.append('doc_label', docEntry.label);
          await fetch(API + '/rfps/' + rfp.id + '/upload-arch-doc', { method: 'POST', body: fd });
        } catch(uploadErr) {
          showToast('Could not upload "' + docEntry.label + '"', 'info', 3000);
        }
      }
      if (_createRfpDocFiles.length > 0) {
        showToast(_createRfpDocFiles.length + ' document(s) uploaded — AI will use them during generation.', 'success', 4000);
      }
    }

    // 3. Close modal and go to Generate tab — user fills in details and hits Generate
    closeModal();
    _createRfpDocFiles = [];
    showToast('RFP "' + title + '" created. Fill in details and click Generate with AI.', 'success', 5000);
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
