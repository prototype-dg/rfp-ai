/* submit.js — Vendor Proposal Submission Portal
 * RFP_ID and PRESET_CODE are injected as window globals by the inline <script> in submit-page.ts
 * Using single quotes throughout — no TypeScript template literal, no escaping conflicts.
 */
(function () {
  'use strict';

  var RFP_ID      = window.RFP_ID      || 0;
  var PRESET_CODE = window.PRESET_CODE || '';

  var uploadedFiles = []; // [{ file, label, summary, confidence, status, unreadable }]
  var rfpData = null;

  /* ── Expose globals needed by inline HTML event handlers ──── */
  window.handleDrop      = handleDrop;
  window.handleFiles     = handleFiles;
  window.removeFile      = removeFile;
  window.setLabel        = setLabel;
  window.submitProposal  = submitProposal;
  window.onCodeInput     = onCodeInput;
  window.expandSection   = expandSection;

  /* ── Boot ─────────────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', function () {
    loadRfp();
    if (PRESET_CODE) updateSubmitBtn();
  });

  /* ── Load RFP info ────────────────────────────────────────── */
  function loadRfp() {
    fetch('/api/submit/' + RFP_ID)
      .then(function (res) {
        if (!res.ok) {
          return res.json().catch(function () { return {}; }).then(function (err) {
            showRfpError(err.error || 'This RFP is not available for submission.');
            document.getElementById('formCard').style.display = 'none';
          });
        }
        return res.json().then(function (data) {
          rfpData = data;
          renderRfpCard(data);
        });
      })
      .catch(function () {
        showRfpError('Could not load RFP details. Please refresh the page.');
      });
  }

  /* ── Render RFP card ──────────────────────────────────────── */
  function renderRfpCard(rfp) {
    var deadline = rfp.deadline
      ? new Date(rfp.deadline).toLocaleDateString('en-AE', { day: 'numeric', month: 'long', year: 'numeric' })
      : '\u2014';

    var sections = '';
    if (rfp.background)        sections += sectionBlock('Project Background',      rfp.background,        'fa-info-circle',         '#745B35');
    if (rfp.scope)             sections += sectionBlock('Scope of Work',           rfp.scope,             'fa-list-alt',            '#745B35');
    if (rfp.tech_requirements) sections += sectionBlock('Technical Requirements',  rfp.tech_requirements, 'fa-microchip',           '#745B35');
    if (rfp.objectives)        sections += sectionBlock('Objectives',              rfp.objectives,        'fa-bullseye',            '#166534');

    var html = '';

    // Top row: ref + deadline badge
    html += '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap">';
    var metaLabel = 'font-family:JetBrains Mono,monospace;font-size:0.6rem;font-weight:600;color:#7A6E62;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:4px';
    var metaValue = 'font-size:0.88rem;font-weight:600;color:#1B1712';

    html += '<div style="display:flex;font-family:JetBrains Mono,monospace">';
    html += '<div style="flex:1"><div style="' + metaLabel + '">RFP Reference</div><div style="' + metaValue + '">' + esc(rfp.ref_number || '\u2014') + '</div></div>';
    html += '<div style="text-align:right"><span style="background:#F5EFE3;color:#745B35;border:1px solid #E9DCC4;border-radius:100px;padding:4px 14px;font-family:JetBrains Mono,monospace;font-size:0.62rem;font-weight:600;letter-spacing:0.08em">';
    html += '<i class="fas fa-clock" style="margin-right:4px"></i>DEADLINE&nbsp;&nbsp;' + deadline + '</span></div>';
    html += '</div>';

    // Title row
    html += '<div style="margin-top:12px">';
    html += '<div style="font-family:Cormorant Garamond,Georgia,serif;font-size:1.3rem;font-weight:600;color:#1B1712;line-height:1.25">' + esc(rfp.title || '') + '</div>';
    html += '<div style="font-family:JetBrains Mono,monospace;font-size:0.65rem;color:#7A6E62;margin-top:5px;letter-spacing:0.06em">' + esc(rfp.category || '') + ' &nbsp;·&nbsp; Crown Prince\u2019s Court, Abu Dhabi</div>';
    html += '</div>';

    // Meta grid
    html += '<div class="rfp-meta" style="margin-top:16px;padding-top:14px;border-top:1px solid #E7DFCE">';
    html += '<div class="rfp-meta-item"><div class="label">Issuing Entity</div><div class="value">Crown Prince\u2019s Court (CPC)</div></div>';
    html += '<div class="rfp-meta-item"><div class="label">Category</div><div class="value">' + esc(rfp.category || '\u2014') + '</div></div>';
    html += '<div class="rfp-meta-item"><div class="label">Submission Deadline</div><div class="value" style="color:#8B2020">' + deadline + '</div></div>';
    html += '</div>';

    // Expandable sections
    html += sections;

    document.getElementById('rfpCard').innerHTML = html;
  }

  /* ── Expandable section block ─────────────────────────────── */
  var _expandMap = {};

  function sectionBlock(title, text, icon, color) {
    var id = 'sec_' + Math.random().toString(36).slice(2);
    var truncated = text.length > 280;
    var display = truncated ? text.slice(0, 280) + '\u2026' : text;
    _expandMap[id] = text;

    var html = '<div class="rfp-section-block">';
    html += '<div class="sec-title"><i class="fas ' + icon + '" style="color:' + color + '"></i>' + esc(title) + '</div>';
    html += '<div class="sec-body" id="' + id + '">' + esc(display) + '</div>';
    if (truncated) {
      html += '<button class="expand-btn" data-secid="' + id + '" onclick="expandSection(this)">Show more</button>';
    }
    html += '</div>';
    return html;
  }

  function expandSection(btn) {
    var id = btn.getAttribute('data-secid');
    if (id && _expandMap[id]) {
      document.getElementById(id).textContent = _expandMap[id];
      btn.style.display = 'none';
    }
  }

  function showRfpError(msg) {
    var html = '<div style="background:#FDF2F2;border:1px solid #F5C0C0;border-radius:3px;padding:16px;color:#8B2020;font-size:0.85rem">';
    html += '<i class="fas fa-exclamation-triangle" style="margin-right:8px"></i>' + esc(msg) + '</div>';
    document.getElementById('rfpCard').innerHTML = html;
  }

  /* ── Code input (when no preset) ─────────────────────────── */
  function onCodeInput(val) {
    document.getElementById('codeDisplay').textContent = val || '\u2014';
    updateSubmitBtn();
  }

  function getCode() {
    if (PRESET_CODE) return PRESET_CODE;
    var el = document.getElementById('codeInput');
    return el ? el.value.trim() : '';
  }

  /* ── File handling ────────────────────────────────────────── */
  function handleDrop(event) {
    event.preventDefault();
    document.getElementById('dropZone').classList.remove('dragover');
    var files = Array.from(event.dataTransfer.files).filter(function (f) {
      return f.type === 'application/pdf' || f.name.endsWith('.pdf');
    });
    if (files.length) {
      handleFiles(files);
    } else {
      showAlert('error', 'Please upload PDF files only.');
    }
  }

  function handleFiles(filesOrList) {
    var files = Array.from(filesOrList);
    var pdfs   = files.filter(function (f) { return f.type === 'application/pdf' || f.name.endsWith('.pdf'); });
    var nonPdf = files.filter(function (f) { return f.type !== 'application/pdf' && !f.name.endsWith('.pdf'); });

    if (nonPdf.length) {
      showAlert('error', 'Only PDF files are accepted. ' + nonPdf.map(function (f) { return f.name; }).join(', ') + ' skipped.');
    }

    for (var i = 0; i < pdfs.length; i++) {
      var file = pdfs[i];
      var already = uploadedFiles.find(function (f) { return f.file.name === file.name && f.file.size === file.size; });
      if (already) continue;
      if (file.size > 50 * 1024 * 1024) {
        showAlert('error', file.name + ' exceeds 50 MB limit and was skipped.');
        continue;
      }
      var entry = { file: file, label: 'other', summary: '', confidence: 'medium', status: 'pending' };
      uploadedFiles.push(entry);
      renderFileList();
      categorizeFile(entry);
    }
    // Reset input so same file can be re-selected if removed
    var fi = document.getElementById('fileInput');
    if (fi) fi.value = '';
  }

  function categorizeFile(entry) {
    entry.status = 'categorizing';
    renderFileList();

    var fd = new FormData();
    fd.append('file', entry.file);

    fetch('/api/submit/' + RFP_ID + '/categorize', { method: 'POST', body: fd })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        entry.label      = data.label      || 'other';
        entry.summary    = data.summary    || '';
        entry.confidence = data.confidence || 'medium';
        entry.unreadable = !!data.unreadable;
        // unreadable PDFs are still valid to submit — use 'ready' so submit button enables
        entry.status = entry.unreadable ? 'ready' : 'done';
        renderFileList();
        updateSubmitBtn();
      })
      .catch(function () {
        entry.label      = 'other';
        entry.summary    = 'Categorization failed \u2014 please set the document type manually.';
        entry.status     = 'error';
        entry.unreadable = false;
        renderFileList();
        updateSubmitBtn();
      });
  }

  function removeFile(idx) {
    uploadedFiles.splice(idx, 1);
    renderFileList();
    updateSubmitBtn();
  }

  function setLabel(idx, val) {
    uploadedFiles[idx].label = val;
    renderFileList();
  }

  var LABEL_META = {
    technical:  { text: 'Technical Proposal',  icon: 'fa-laptop-code',         color: '#1d4ed8' },
    commercial: { text: 'Commercial Proposal',  icon: 'fa-file-invoice-dollar', color: '#166534' },
    supporting: { text: 'Supporting Document',  icon: 'fa-paperclip',           color: '#BA9765' },
    other:      { text: 'Other Document',       icon: 'fa-file',                color: '#6b7280' }
  };

  function renderFileList() {
    var container = document.getElementById('fileList');
    if (!uploadedFiles.length) { container.innerHTML = ''; return; }

    container.innerHTML = uploadedFiles.map(function (entry, idx) {
      var lm            = LABEL_META[entry.label] || LABEL_META.other;
      var sizeMb        = (entry.file.size / 1024 / 1024).toFixed(1);
      var isCategorizing = entry.status === 'categorizing' || entry.status === 'pending';
      var confClass     = entry.confidence === 'high' ? 'high' : entry.confidence === 'low' ? 'low' : '';
      // unreadable = complex font PDF; 'ready' status = still submittable
      var displayStatus = isCategorizing ? 'categorizing' : (entry.status === 'ready' ? 'done' : entry.status);

      var labelOptions = Object.keys(LABEL_META).map(function (k) {
        var v = LABEL_META[k];
        return '<option value="' + k + '"' + (entry.label === k ? ' selected' : '') + '>' + v.text + '</option>';
      }).join('');

      var html = '<div class="file-item ' + displayStatus + '">';
      html += '<div class="file-icon"><i class="fas fa-file-pdf"></i></div>';
      html += '<div class="file-info">';
      html += '<div class="file-name" title="' + esc(entry.file.name) + '">' + esc(entry.file.name) + '</div>';
      html += '<div class="file-size">' + sizeMb + ' MB</div>';

      if (isCategorizing) {
        html += '<div class="cat-spinner"><i class="fas fa-spinner fa-spin"></i> Analysing document\u2026</div>';
      } else if (entry.unreadable) {
        // Complex-font PDF — show a clear amber notice instead of error styling
        html += '<div style="font-size:0.78rem;color:#92400e;background:#fef3c7;border:1px solid #fde68a;border-radius:6px;padding:6px 10px;margin-top:4px;line-height:1.5">';
        html += '<i class="fas fa-exclamation-triangle" style="margin-right:5px"></i>';
        html += esc(entry.summary);
        html += '</div>';
      } else {
        html += '<div class="file-summary">' + esc(entry.summary);
        if (entry.confidence) {
          html += ' <span class="conf-badge ' + confClass + '">' + entry.confidence + ' confidence</span>';
        }
        html += '</div>';
      }

      html += '<div class="file-label-row">';
      html += '<span style="font-size:0.72rem;color:#6b7280;font-weight:600">Type:</span>';
      html += '<select class="label-select" onchange="setLabel(' + idx + ', this.value)">' + labelOptions + '</select>';
      html += '<span style="font-size:0.72rem;color:' + lm.color + ';font-weight:700">';
      html += '<i class="fas ' + lm.icon + '" style="margin-right:3px"></i>' + lm.text + '</span>';
      html += '</div>';
      html += '</div>';
      html += '<button class="file-remove" onclick="removeFile(' + idx + ')" title="Remove"><i class="fas fa-times"></i></button>';
      html += '</div>';
      return html;
    }).join('');
  }

  /* ── Submit ───────────────────────────────────────────────── */
  function updateSubmitBtn() {
    var code     = getCode();
    // 'categorizing' and 'pending' are in-progress states — block submit
    // 'done', 'ready' (unreadable PDF), 'error' (network fail) are all terminal — allow submit
    var hasFiles = uploadedFiles.length > 0 && uploadedFiles.every(function (f) {
      return f.status !== 'categorizing' && f.status !== 'pending';
    });
    var hasCode  = /^RFP-\d+-V\d+$/i.test(code);
    document.getElementById('submitBtn').disabled = !(hasCode && hasFiles);
  }

  function submitProposal() {
    var code = getCode();
    if (!code) { showAlert('error', 'Please enter your Participant Reference Code.'); return; }
    if (!uploadedFiles.length) { showAlert('error', 'Please upload at least one proposal document.'); return; }
    if (uploadedFiles.some(function (f) { return f.status === 'categorizing' || f.status === 'pending'; })) {
      showAlert('error', 'Please wait for all files to finish processing before submitting.');
      return;
    }

    showLoading('Submitting your proposal\u2026 please do not close this window.');

    var fd = new FormData();
    fd.append('vendor_code', code);
    fd.append('cover_letter', document.getElementById('coverLetter').value.trim());

    var fileLabels = {};
    uploadedFiles.forEach(function (entry, i) {
      fd.append('file_' + i, entry.file, entry.file.name);
      fileLabels[entry.file.name] = entry.label;
      fileLabels[String(i)]       = entry.label;
    });
    fd.append('file_labels', JSON.stringify(fileLabels));

    fetch('/api/submit/' + RFP_ID, { method: 'POST', body: fd })
      .then(function (res) {
        return res.json().then(function (data) { return { ok: res.ok, data: data }; });
      })
      .then(function (result) {
        hideLoading();
        if (!result.ok || result.data.error) {
          showAlert('error', result.data.error || 'Submission failed. Please try again.');
          return;
        }
        document.getElementById('formCard').style.display = 'none';
        var ss = document.getElementById('successScreen');
        ss.style.display = 'block';
        document.getElementById('successRef').textContent = code;
        var n = result.data.files_stored || uploadedFiles.length;
        document.getElementById('successFiles').textContent =
          n + ' document' + (n === 1 ? '' : 's') + ' received';
      })
      .catch(function () {
        hideLoading();
        showAlert('error', 'Network error. Please check your connection and try again.');
      });
  }

  /* ── Helpers ──────────────────────────────────────────────── */
  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function showAlert(type, msg) {
    var el = document.getElementById('alert' + (type === 'error' ? 'Error' : 'Info'));
    if (!el) return;
    el.textContent = msg;
    el.style.display = 'block';
    setTimeout(function () { el.style.display = 'none'; }, 8000);
  }

  function showLoading(msg) {
    document.getElementById('loadingText').textContent = msg || 'Loading\u2026';
    document.getElementById('loadingOverlay').classList.add('show');
  }

  function hideLoading() {
    document.getElementById('loadingOverlay').classList.remove('show');
  }

})();
