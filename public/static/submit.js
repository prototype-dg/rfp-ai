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
    var url = '/api/submit/' + RFP_ID + (PRESET_CODE ? '?vendor_code=' + encodeURIComponent(PRESET_CODE) : '');
    fetch(url)
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          return { ok: res.ok, status: res.status, data: data };
        });
      })
      .then(function (result) {
        if (!result.ok) {
          // Declined vendor — show polite removal message instead of form
          if (result.status === 403 && result.data && result.data.declined) {
            showDeclinedMessage();
            document.getElementById('formCard').style.display = 'none';
            return;
          }
          showRfpError(result.data.error || 'This RFP is not available for submission.');
          document.getElementById('formCard').style.display = 'none';
          return;
        }
        rfpData = result.data;
        renderRfpCard(result.data);
      })
      .catch(function () {
        showRfpError('Could not load RFP details. Please refresh the page.');
      });
  }

  function showDeclinedMessage() {
    var html = '<div style="background:#FBF8F2;border:1px solid #E7DFCE;border-radius:8px;padding:32px 24px;text-align:center;max-width:480px;margin:0 auto">'
      + '<div style="width:56px;height:56px;border-radius:50%;background:#F5F0E8;display:flex;align-items:center;justify-content:center;margin:0 auto 16px">'
      + '<i class="fas fa-info-circle" style="color:#BA9765;font-size:1.5rem"></i></div>'
      + '<h3 style="color:#1B1712;font-family:Georgia,serif;font-size:1.1rem;margin:0 0 12px">Thank You for Your Interest</h3>'
      + '<p style="color:#5a4e3a;font-size:0.9rem;line-height:1.6;margin:0 0 12px">'
      + 'We appreciate your time and interest in this procurement opportunity.</p>'
      + '<p style="color:#5a4e3a;font-size:0.9rem;line-height:1.6;margin:0">'
      + 'Following your earlier communication, your organization has been respectfully removed from the list of participants for this RFP. '
      + 'This portal link is no longer active for your account.</p>'
      + '<p style="color:#9ca3af;font-size:0.8rem;margin:16px 0 0">If you believe this is an error, please contact the procurement team directly.'
      + (rfpData && rfpData.procurement_email ? ' Email: <a href="mailto:' + rfpData.procurement_email + '" style="color:#BA9765">' + rfpData.procurement_email + '</a>' : '') + '</p>'
      + '</div>';
    document.getElementById('rfpCard').innerHTML = html;
  }

  /* ── Render RFP card ──────────────────────────────────────── */
  function renderRfpCard(rfp) {
    var deadline = rfp.deadline
      ? new Date(rfp.deadline).toLocaleDateString('en-AE', { day: 'numeric', month: 'long', year: 'numeric' })
      : '\u2014';

    var sections = '';
    if (rfp.background)        sections += sectionBlock('Project Background',      rfp.background,        'fa-info-circle',  '#745B35');
    if (rfp.objectives)        sections += sectionBlock('Objectives',              rfp.objectives,        'fa-bullseye',     '#166534');
    if (rfp.scope)             sections += sectionBlock('Scope of Work',           rfp.scope,             'fa-list-alt',     '#745B35');
    if (rfp.tech_requirements) sections += sectionBlock('Technical Requirements',  rfp.tech_requirements, 'fa-microchip',    '#745B35');

    var html = '';

    // Ref eyebrow
    html += '<div style="font-family:JetBrains Mono,monospace;font-size:0.6rem;font-weight:600;color:#7A6E62;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:8px">';
    html += '<i class="fas fa-hashtag" style="margin-right:4px;color:#BA9765"></i>' + esc(rfp.ref_number || '\u2014') + '</div>';

    // Title
    html += '<div style="font-family:Cormorant Garamond,Georgia,serif;font-size:1.35rem;font-weight:600;color:#1B1712;line-height:1.25;margin-bottom:16px">';
    html += esc(rfp.title || '') + '</div>';

    // Meta grid: Issuing Entity | Category | Submission Deadline
    html += '<div class="rfp-meta">';
    html += '<div class="rfp-meta-item"><div class="label">Issuing Entity</div><div class="value">Crown Prince\u2019s Court (CPC)</div></div>';
    html += '<div class="rfp-meta-item"><div class="label">Category</div><div class="value">' + esc(rfp.category || '\u2014') + '</div></div>';
    html += '<div class="rfp-meta-item"><div class="label">Submission Deadline</div><div class="value" style="color:#8B2020;font-variant-numeric:tabular-nums">' + deadline + '</div></div>';
    html += '</div>';

    // Expandable sections
    html += sections;

    document.getElementById('rfpCard').innerHTML = html;
  }

  /* ── Expandable section block ─────────────────────────────── */
  // Threshold: ~4 lines ≈ 300 chars is a reasonable collapse point
  var COLLAPSE_THRESHOLD = 300;

  function sectionBlock(title, text, icon, color) {
    var id = 'sec_' + Math.random().toString(36).slice(2);
    var needsCollapse = text.length > COLLAPSE_THRESHOLD;

    var html = '<div class="rfp-section-block">';
    html += '<div class="sec-title"><i class="fas ' + icon + '" style="color:' + color + '"></i>' + esc(title) + '</div>';
    // Apply CSS line-clamp via class; full text always in DOM — no scrollable overflow
    html += '<div class="sec-body' + (needsCollapse ? ' collapsed' : '') + '" id="' + id + '">' + esc(text) + '</div>';
    if (needsCollapse) {
      html += '<button class="expand-btn" id="btn_' + id + '" onclick="expandSection(\'' + id + '\')">'
            + '<i class="fas fa-chevron-down" style="font-size:0.55rem"></i>Show more</button>';
    }
    html += '</div>';
    return html;
  }

  function expandSection(id) {
    var body = document.getElementById(id);
    var btn  = document.getElementById('btn_' + id);
    if (!body) return;
    var isCollapsed = body.classList.contains('collapsed');
    if (isCollapsed) {
      body.classList.remove('collapsed');
      if (btn) btn.innerHTML = '<i class="fas fa-chevron-up" style="font-size:0.55rem"></i>Show less';
    } else {
      body.classList.add('collapsed');
      if (btn) btn.innerHTML = '<i class="fas fa-chevron-down" style="font-size:0.55rem"></i>Show more';
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
      var entry = { file: file, label: 'other', summary: '', confidence: 'medium', status: 'done' };
      uploadedFiles.push(entry);
      renderFileList();
      updateSubmitBtn();
    }
    // Reset input so same file can be re-selected if removed
    var fi = document.getElementById('fileInput');
    if (fi) fi.value = '';
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
      var confClass     = entry.confidence === 'high' ? 'high' : entry.confidence === 'low' ? 'low' : '';
      var displayStatus = entry.status === 'ready' ? 'done' : entry.status;

      var labelOptions = Object.keys(LABEL_META).map(function (k) {
        var v = LABEL_META[k];
        return '<option value="' + k + '"' + (entry.label === k ? ' selected' : '') + '>' + v.text + '</option>';
      }).join('');

      var html = '<div class="file-item ' + displayStatus + '">';
      html += '<div class="file-icon"><i class="fas fa-file-pdf"></i></div>';
      html += '<div class="file-info">';
      html += '<div class="file-name" title="' + esc(entry.file.name) + '">' + esc(entry.file.name) + '</div>';
      html += '<div class="file-size">' + sizeMb + ' MB</div>';

      html += '<div class="file-summary">' + esc(entry.summary);
      if (entry.confidence && entry.summary) {
        html += ' <span class="conf-badge ' + confClass + '">' + entry.confidence + ' confidence</span>';
      }
      html += '</div>';

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
    var hasFiles = uploadedFiles.length > 0;
    var hasCode  = /^RFP-\d+-V\d+$/i.test(code);
    document.getElementById('submitBtn').disabled = !(hasCode && hasFiles);
  }

  function submitProposal() {
    var code = getCode();
    if (!code) { showAlert('error', 'Please enter your Participant Reference Code.'); return; }
    if (!uploadedFiles.length) { showAlert('error', 'Please upload at least one proposal document.'); return; }
    // (document-type categorization removed — no processing gate)

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
        // 13.3 — send confirmation email (best-effort, non-blocking)
        var vendorEmail = (rfpData && rfpData.vendor_email) || '';
        var vendorName  = (rfpData && rfpData.vendor_name)  || 'Vendor';
        fetch('/api/submit/' + RFP_ID + '/confirmation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vendor_email: vendorEmail, vendor_name: vendorName, vendor_code: code })
        }).catch(function() {});
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
