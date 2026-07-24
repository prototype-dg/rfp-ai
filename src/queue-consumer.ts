/**
 * Cloudflare Queue Consumer — Async PDF Processing Worker
 *
 * Handles messages enqueued by the webhook when a submitted proposal file is
 * too large to process inline (>5 MB) or produced PostScript garbage during
 * inline extraction.
 *
 * Each message carries:
 *   - r2Key: the file already stored in R2 (streamed there during webhook)
 *   - rfpId / vendorId / proposalId: DB identifiers
 *   - label: 'technical' | 'commercial' | 'other'
 *
 * Processing steps:
 *   1. Fetch raw bytes from R2 (no network download needed — already stored)
 *   2. Extract text via extractPdfText() — no CPU time limit in Queue consumers
 *   3. Run LLM field extraction (budget, timeline, executive summary, etc.)
 *   4. Run full LLM evaluation with complete context (RFP, BRD, arch, questions)
 *   5. Update proposals + evaluations tables in D1
 */

import type { Bindings, ProposalQueueMessage } from './types'

// ── Re-export the queue handler so src/index.tsx can wire it up ─────────────
export { handleQueue }

async function handleQueue(
  batch: MessageBatch<ProposalQueueMessage>,
  env: Bindings
): Promise<void> {
  for (const message of batch.messages) {
    try {
      await processQueueMessage(message.body, env)
      message.ack()
    } catch (err: any) {
      console.error(`[queue] Failed to process message: ${err?.message}`, message.body)
      message.retry()
    }
  }
}

async function processQueueMessage(
  msg: ProposalQueueMessage,
  env: Bindings
): Promise<void> {
  const { rfpId, vendorId, r2Key, filename, label } = msg as any
  console.log(`[queue] Processing: rfpId=${rfpId} vendorId=${vendorId} r2Key=${r2Key}`)

  const bucket = env.PROPOSALS_BUCKET
  const db = env.DB

  // 1. Fetch bytes from R2 (already stored — no Resend download needed)
  if (!bucket) {
    console.error('[queue] PROPOSALS_BUCKET binding missing')
    return
  }
  const obj = await bucket.get(r2Key)
  if (!obj) {
    console.error(`[queue] R2 object not found: ${r2Key}`)
    return
  }
  const rawBytes = new Uint8Array(await obj.arrayBuffer())
  console.log(`[queue] Fetched ${rawBytes.length} bytes from R2`)

  // 2. Extract text — no 30ms CPU limit in queue consumers
  const { extractPdfText, isPostScriptGarbage, extractProposedDuration, extractProposalFieldsWithLLM, evaluateProposalWithLLM } = await import('./api/index')

  const extracted = await extractPdfText(rawBytes)
  console.log(`[queue] Extracted ${extracted.length} chars from ${filename}`)

  if (!extracted || extracted.length < 200) {
    console.warn(`[queue] Extraction yielded too little text for ${filename} — giving up`)
    return
  }
  if (isPostScriptGarbage(extracted)) {
    console.warn(`[queue] PostScript garbage still detected after extraction for ${filename}`)
    // Nothing more we can do without a Python fallback — mark proposal with a note
    const proposal = await db.prepare(
      `SELECT id FROM proposals WHERE rfp_id=? AND vendor_id=? ORDER BY id DESC LIMIT 1`
    ).bind(rfpId, vendorId).first<any>()
    if (proposal) {
      await db.prepare(`UPDATE proposals SET key_strengths=? WHERE id=?`)
        .bind('⚠ PDF text extraction failed — complex embedded fonts detected. Upload a text-based or OCR-processed PDF.', proposal.id)
        .run()
    }
    return
  }

  // 3. Find the proposal record (latest for this vendor+RFP)
  const proposal = await db.prepare(`
    SELECT p.*, v.name as vendor_name, v.contact_email
    FROM proposals p LEFT JOIN vendors v ON p.vendor_id=v.id
    WHERE p.rfp_id=? AND p.vendor_id=? ORDER BY p.id DESC LIMIT 1
  `).bind(rfpId, vendorId).first<any>()
  if (!proposal) {
    console.error(`[queue] No proposal found for rfpId=${rfpId} vendorId=${vendorId}`)
    return
  }

  const rfp = await db.prepare(`SELECT * FROM rfps WHERE id=?`).bind(rfpId).first<any>()
  if (!rfp) {
    console.error(`[queue] RFP not found: ${rfpId}`)
    return
  }

  // 4. LLM field extraction
  const rfpTitle = rfp.title || 'RFP'
  let fields: any = {}
  try {
    fields = await extractProposalFieldsWithLLM(extracted, '', proposal.vendor_name || 'Vendor', rfpTitle, env)
    console.log(`[queue] Fields: budget=${fields.budget_amount}, timeline=${fields.timeline_months}`)
  } catch (e: any) {
    console.error(`[queue] Field extraction failed: ${e?.message}`)
    fields = {
      executive_summary: '',
      key_strengths: '',
      budget_amount: null,
      budget_currency: 'AED',
      timeline_months: null,
      technical_proposal: extracted.slice(0, 120000),
    }
  }

  const proposedDuration = extractProposedDuration(extracted)

  // Merge extracted text with any existing text from other attachments
  const existingText = proposal.technical_proposal || ''
  const mergedText = existingText && !isPostScriptGarbage(existingText)
    ? existingText + '\n\n' + `=== ${label.toUpperCase()} PROPOSAL (${filename}) ===\n` + (fields.technical_proposal || extracted)
    : `=== ${label.toUpperCase()} PROPOSAL (${filename}) ===\n` + (fields.technical_proposal || extracted)

  // 5. Update proposal record
  await db.prepare(`
    UPDATE proposals SET
      executive_summary=?, key_strengths=?,
      budget_amount=?, budget_currency=?, timeline_months=?,
      technical_proposal=?, proposed_duration=?,
      pdf_attachment_url=COALESCE(NULLIF(pdf_attachment_url,''), ?)
    WHERE id=?
  `).bind(
    fields.executive_summary || proposal.executive_summary,
    fields.key_strengths || proposal.key_strengths,
    fields.budget_amount ?? proposal.budget_amount,
    fields.budget_currency || 'AED',
    fields.timeline_months ?? proposal.timeline_months,
    mergedText,
    proposedDuration || proposal.proposed_duration,
    `r2://${r2Key}`,
    proposal.id
  ).run()

  console.log(`[queue] Proposal #${proposal.id} updated with ${mergedText.length} chars of text`)

  // 6. Full LLM evaluation with complete context
  const updatedProposal = {
    ...proposal,
    technical_proposal: mergedText,
    budget_amount: fields.budget_amount ?? proposal.budget_amount,
    timeline_months: fields.timeline_months ?? proposal.timeline_months,
    proposed_duration: proposedDuration || proposal.proposed_duration,
  }

  try {
    const evalResult = await evaluateProposalWithLLM(updatedProposal, rfp, env)
    const total = evalResult.scoringDetails && evalResult.scoringDetails.length > 0
      ? Math.round(evalResult.scoringDetails.reduce((s: number, c: any) =>
          s + (c.weighted !== undefined ? Number(c.weighted) : Number(c.weight || 0) * Number(c.score || 0) / 100), 0))
      : Math.round(evalResult.scores.business * 0.30 + evalResult.scores.technical * 0.40 + evalResult.scores.financial * 0.30)

    await db.prepare('DELETE FROM evaluations WHERE proposal_id=?').bind(proposal.id).run()
    await db.prepare(`
      INSERT INTO evaluations (rfp_id, proposal_id, vendor_id, business_score, technical_score,
        financial_score, experience_score, total_score, ai_summary, scoring_details_json, is_real, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,1,datetime('now'))
    `).bind(
      rfpId, proposal.id, vendorId,
      evalResult.scores.business, evalResult.scores.technical,
      evalResult.scores.financial, evalResult.scores.experience,
      total, evalResult.summary, JSON.stringify(evalResult.scoringDetails)
    ).run()

    console.log(`[queue] Evaluation complete for ${proposal.vendor_name}: total=${total}`)
  } catch (evalErr: any) {
    console.error(`[queue] Evaluation failed for ${proposal.vendor_name}: ${evalErr?.message}`)
    // Proposal text was updated — evaluation can be re-run manually from the UI
  }
}
