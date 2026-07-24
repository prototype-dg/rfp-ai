export function getSubmitPage(rfpId: string, participantCode: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Proposal Submission — Crown Prince's Court</title>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css"/>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; background: #f0f4f8; min-height: 100vh; color: #1a202c; }

    /* ── Header ── */
    .header {
      background: linear-gradient(135deg, #0f3460 0%, #1a1a2e 100%);
      color: white; padding: 0;
    }
    .header-inner {
      max-width: 860px; margin: 0 auto; padding: 28px 24px 24px;
      display: flex; align-items: center; gap: 18px;
    }
    .header-crest {
      width: 56px; height: 56px; background: rgba(201,168,76,0.2);
      border: 2px solid #c9a84c; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-size: 26px; flex-shrink: 0;
    }
    .header-text h1 { font-size: 1.25rem; font-weight: 700; letter-spacing: 0.01em; }
    .header-text .sub { font-size: 0.82rem; color: #c9a84c; margin-top: 3px; }
    .header-strip {
      background: #c9a84c; height: 4px;
    }

    /* ── Layout ── */
    .page { max-width: 860px; margin: 0 auto; padding: 32px 24px 64px; }

    /* ── RFP Info Card ── */
    .rfp-card {
      background: white; border-radius: 12px; border: 1px solid #e2e8f0;
      padding: 24px 28px; margin-bottom: 24px;
      box-shadow: 0 1px 4px rgba(0,0,0,0.06);
    }
    .rfp-card .label { font-size: 0.68rem; font-weight: 700; color: #9ca3af;
      text-transform: uppercase; letter-spacing: 0.07em; margin-bottom: 4px; }
    .rfp-card .value { font-size: 0.9rem; font-weight: 600; color: #0f3460; }
    .rfp-meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 16px; margin-top: 16px; padding-top: 16px; border-top: 1px solid #f1f5f9; }
    .rfp-section-block { margin-top: 16px; padding-top: 14px; border-top: 1px solid #f1f5f9; }
    .rfp-section-block .sec-title { font-size: 0.78rem; font-weight: 700; color: #374151;
      margin-bottom: 6px; display: flex; align-items: center; gap: 6px; }
    .rfp-section-block .sec-body { font-size: 0.82rem; color: #4b5563; line-height: 1.7;
      max-height: 120px; overflow-y: auto; white-space: pre-wrap; }
    .expand-btn { font-size: 0.75rem; color: #3b82f6; cursor: pointer; border: none;
      background: none; margin-top: 4px; padding: 0; text-decoration: underline; }

    /* ── Form Card ── */
    .form-card {
      background: white; border-radius: 12px; border: 1px solid #e2e8f0;
      padding: 28px; box-shadow: 0 1px 4px rgba(0,0,0,0.06);
    }
    .form-card h2 { font-size: 1rem; font-weight: 700; color: #1f2937; margin-bottom: 20px;
      display: flex; align-items: center; gap: 8px; }
    .form-group { margin-bottom: 20px; }
    .form-group label { display: block; font-size: 0.82rem; font-weight: 600; color: #374151;
      margin-bottom: 6px; }
    .form-group .hint { font-size: 0.75rem; color: #9ca3af; margin-bottom: 6px; }
    .form-control {
      width: 100%; padding: 10px 14px; border: 1.5px solid #d1d5db; border-radius: 8px;
      font-size: 0.88rem; font-family: inherit; color: #1a202c;
      transition: border-color 0.15s;
    }
    .form-control:focus { outline: none; border-color: #0f3460; box-shadow: 0 0 0 3px rgba(15,52,96,0.08); }
    textarea.form-control { resize: vertical; min-height: 120px; line-height: 1.6; }

    /* ── Code field ── */
    .code-field {
      display: flex; align-items: center; gap: 10px;
      padding: 10px 14px; border: 1.5px solid #d1d5db; border-radius: 8px;
      background: #f8fafc;
    }
    .code-field .code-val { font-family: monospace; font-size: 0.95rem;
      font-weight: 700; color: #0f3460; flex: 1; }
    .code-badge { font-size: 0.68rem; background: #dcfce7; color: #166534;
      padding: 2px 8px; border-radius: 20px; font-weight: 700; white-space: nowrap; }

    /* ── Drop Zone ── */
    .drop-zone {
      border: 2px dashed #cbd5e1; border-radius: 10px; padding: 32px 20px;
      text-align: center; cursor: pointer; transition: all 0.2s;
      background: #f8fafc;
    }
    .drop-zone.dragover { border-color: #0f3460; background: #eff6ff; }
    .drop-zone .dz-icon { font-size: 2.2rem; color: #94a3b8; margin-bottom: 10px; }
    .drop-zone .dz-text { font-size: 0.88rem; color: #4b5563; }
    .drop-zone .dz-text strong { color: #0f3460; }
    .drop-zone .dz-sub { font-size: 0.75rem; color: #9ca3af; margin-top: 4px; }

    /* ── File list ── */
    .file-list { margin-top: 16px; display: flex; flex-direction: column; gap: 10px; }
    .file-item {
      border: 1.5px solid #e2e8f0; border-radius: 8px; padding: 12px 14px;
      display: flex; align-items: flex-start; gap: 12px; background: white;
    }
    .file-item.categorizing { opacity: 0.7; }
    .file-item.done { border-color: #bbf7d0; background: #f0fdf4; }
    .file-item.error { border-color: #fecaca; background: #fef2f2; }
    .file-icon { font-size: 1.4rem; color: #dc2626; flex-shrink: 0; margin-top: 2px; }
    .file-info { flex: 1; min-width: 0; }
    .file-name { font-size: 0.85rem; font-weight: 600; color: #1f2937;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .file-size { font-size: 0.72rem; color: #9ca3af; margin-top: 1px; }
    .file-summary { font-size: 0.78rem; color: #4b5563; margin-top: 5px; line-height: 1.5; }
    .file-label-row { display: flex; align-items: center; gap: 8px; margin-top: 8px; flex-wrap: wrap; }
    .label-pill {
      display: inline-flex; align-items: center; gap: 4px; padding: 3px 10px;
      border-radius: 20px; font-size: 0.72rem; font-weight: 700; cursor: pointer;
      border: 1.5px solid transparent; transition: all 0.15s; white-space: nowrap;
    }
    .label-pill.technical { background: #eff6ff; color: #1d4ed8; border-color: #bfdbfe; }
    .label-pill.commercial { background: #f0fdf4; color: #166534; border-color: #bbf7d0; }
    .label-pill.supporting { background: #faf5ff; color: #7c3aed; border-color: #ddd6fe; }
    .label-pill.other { background: #f3f4f6; color: #6b7280; border-color: #d1d5db; }
    .label-pill.selected { box-shadow: 0 0 0 2px currentColor; }
    .label-select { font-size: 0.78rem; padding: 3px 8px; border: 1px solid #d1d5db;
      border-radius: 6px; background: white; cursor: pointer; color: #374151; }
    .file-remove { flex-shrink: 0; background: none; border: none; color: #9ca3af;
      cursor: pointer; font-size: 0.9rem; padding: 2px 4px; border-radius: 4px;
      align-self: flex-start; }
    .file-remove:hover { color: #dc2626; background: #fef2f2; }
    .cat-spinner { font-size: 0.75rem; color: #6b7280; display: flex; align-items: center; gap: 5px; }
    .conf-badge { font-size: 0.65rem; padding: 1px 6px; border-radius: 10px; font-weight: 600;
      background: #fef3c7; color: #92400e; }
    .conf-badge.high { background: #dcfce7; color: #166534; }
    .conf-badge.low { background: #fee2e2; color: #991b1b; }

    /* ── Submit button ── */
    .submit-btn {
      width: 100%; padding: 14px; background: #0f3460; color: white;
      border: none; border-radius: 8px; font-size: 0.95rem; font-weight: 700;
      cursor: pointer; transition: background 0.15s; display: flex;
      align-items: center; justify-content: center; gap: 8px;
    }
    .submit-btn:hover:not(:disabled) { background: #1a4a7a; }
    .submit-btn:disabled { background: #94a3b8; cursor: not-allowed; }

    /* ── Success / Error states ── */
    .success-screen {
      background: white; border-radius: 12px; padding: 48px 28px; text-align: center;
      box-shadow: 0 1px 4px rgba(0,0,0,0.06); display: none;
    }
    .success-icon { font-size: 3.5rem; color: #22c55e; margin-bottom: 16px; }
    .success-screen h2 { font-size: 1.4rem; font-weight: 700; color: #1f2937; margin-bottom: 12px; }
    .success-screen p { font-size: 0.88rem; color: #6b7280; line-height: 1.7; max-width: 480px; margin: 0 auto; }
    .success-ref { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px;
      padding: 14px 20px; margin-top: 20px; font-size: 0.85rem; color: #166534; display: inline-block; }
    .success-ref strong { font-family: monospace; font-size: 1rem; }

    .alert { padding: 12px 16px; border-radius: 8px; font-size: 0.85rem;
      margin-bottom: 16px; display: none; }
    .alert.error { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; }
    .alert.info { background: #eff6ff; border: 1px solid #bfdbfe; color: #1d4ed8; }

    /* ── Divider ── */
    .section-divider {
      display: flex; align-items: center; gap: 12px; margin: 24px 0;
      font-size: 0.75rem; font-weight: 700; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.06em;
    }
    .section-divider::before, .section-divider::after {
      content: ''; flex: 1; height: 1px; background: #e2e8f0;
    }

    /* ── Loading overlay ── */
    .loading-overlay {
      display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.4);
      z-index: 9999; align-items: center; justify-content: center; flex-direction: column; gap: 16px;
    }
    .loading-overlay.show { display: flex; }
    .loading-spinner { width: 48px; height: 48px; border: 5px solid rgba(255,255,255,0.3);
      border-top-color: white; border-radius: 50%; animation: spin 0.8s linear infinite; }
    .loading-text { color: white; font-size: 0.9rem; font-weight: 600; }
    @keyframes spin { to { transform: rotate(360deg); } }

    @media (max-width: 600px) {
      .rfp-meta { grid-template-columns: repeat(2, 1fr); }
      .header-inner { padding: 20px 16px; }
      .page { padding: 20px 16px 48px; }
    }
  </style>
</head>
<body>

<div class="header">
  <div class="header-inner">
    <div class="header-crest">👑</div>
    <div class="header-text">
      <h1>Crown Prince's Court — Procurement Portal</h1>
      <div class="sub">Secure Proposal Submission System &nbsp;|&nbsp; Abu Dhabi, UAE</div>
    </div>
  </div>
  <div class="header-strip"></div>
</div>

<div class="loading-overlay" id="loadingOverlay">
  <div class="loading-spinner"></div>
  <div class="loading-text" id="loadingText">Submitting your proposal…</div>
</div>

<div class="page">

  <!-- RFP Info (loaded dynamically) -->
  <div class="rfp-card" id="rfpCard">
    <div style="display:flex;align-items:center;gap:10px;color:#9ca3af;font-size:0.85rem">
      <i class="fas fa-spinner fa-spin"></i> Loading RFP details…
    </div>
  </div>

  <!-- Success screen -->
  <div class="success-screen" id="successScreen">
    <div class="success-icon"><i class="fas fa-check-circle"></i></div>
    <h2>Proposal Successfully Submitted</h2>
    <p>
      Thank you for submitting your proposal to the Crown Prince's Court procurement process.
      Your submission has been received and securely recorded. Our evaluation team will review
      all proposals and contact shortlisted vendors with next steps.
    </p>
    <p style="margin-top:12px">
      Please retain this confirmation for your records. If you have any queries, contact us
      at <strong>procurement@cpc-rfp.website</strong>, quoting your participant reference below.
    </p>
    <div class="success-ref">
      Participant Reference: <strong id="successRef"></strong><br/>
      <span style="font-size:0.78rem;color:#166534;margin-top:4px;display:block" id="successFiles"></span>
    </div>
  </div>

  <!-- Submission Form -->
  <div class="form-card" id="formCard">
    <h2><i class="fas fa-file-upload" style="color:#0f3460"></i> Submit Your Proposal</h2>

    <div class="alert error" id="alertError"></div>
    <div class="alert info" id="alertInfo"></div>

    <!-- Participant Code -->
    <div class="form-group">
      <label>Participant Reference Code</label>
      <div class="hint">This code uniquely identifies your organisation for this tender. It was provided in your invitation email.</div>
      <div class="code-field">
        <i class="fas fa-key" style="color:#c9a84c;font-size:1rem"></i>
        <span class="code-val" id="codeDisplay">${participantCode || '—'}</span>
        ${participantCode ? '<span class="code-badge"><i class="fas fa-check" style="font-size:0.6rem"></i> Verified</span>' : ''}
      </div>
      ${!participantCode ? '<input type="text" class="form-control" id="codeInput" placeholder="e.g. RFP-1-V5" style="margin-top:8px" oninput="onCodeInput(this.value)"/>' : ''}
    </div>

    <div class="section-divider">Cover Letter</div>

    <!-- Cover Letter -->
    <div class="form-group">
      <label for="coverLetter">Cover Letter <span style="color:#9ca3af;font-weight:400">(optional)</span></label>
      <div class="hint">Briefly introduce your organisation and summarise your key qualifications for this tender.</div>
      <textarea class="form-control" id="coverLetter" placeholder="Dear Procurement Team,&#10;&#10;We are pleased to submit our proposal for…" rows="6"></textarea>
    </div>

    <div class="section-divider">Proposal Documents</div>

    <!-- File Upload -->
    <div class="form-group">
      <label>Proposal Documents <span style="color:#dc2626">*</span></label>
      <div class="hint">Upload your Technical Proposal, Commercial Proposal, and any supporting documents (CVs, certifications, references). PDF format only.</div>

      <div class="drop-zone" id="dropZone"
           onclick="document.getElementById('fileInput').click()"
           ondragover="event.preventDefault(); this.classList.add('dragover')"
           ondragleave="this.classList.remove('dragover')"
           ondrop="handleDrop(event)">
        <div class="dz-icon"><i class="fas fa-cloud-upload-alt"></i></div>
        <div class="dz-text"><strong>Click to browse</strong> or drag & drop files here</div>
        <div class="dz-sub">PDF documents only • Multiple files accepted • Max 50 MB per file</div>
      </div>
      <input type="file" id="fileInput" multiple accept=".pdf,application/pdf" style="display:none"
             onchange="handleFiles(this.files)"/>

      <div class="file-list" id="fileList"></div>
    </div>

    <button class="submit-btn" id="submitBtn" onclick="submitProposal()" disabled>
      <i class="fas fa-paper-plane"></i> Submit Proposal
    </button>
    <div style="font-size:0.75rem;color:#9ca3af;text-align:center;margin-top:10px">
      <i class="fas fa-lock" style="margin-right:4px"></i>
      Your submission is encrypted and securely stored. Late submissions will not be accepted.
    </div>
  </div>

</div><!-- /page -->

<script>
/* Server-injected globals — read by submit.js */
window.RFP_ID = ${rfpId};
window.PRESET_CODE = ${JSON.stringify(participantCode)};
</script>
<script src="/static/submit.js"></script>
</body>
</html>`
}
