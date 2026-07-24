import { Hono } from 'hono'
import { initDb, seedVendors } from '../db/seed'
import type { Bindings } from '../types'

// WORKER_VERSION: bump this to force Cloudflare to recognise the new bundle
const WORKER_VERSION = '2026-07-24-v7'

export const apiRouter = new Hono<{ Bindings: Bindings }>()

// ============================================================
// VERSION — canary endpoint to confirm which Worker code is live
// ============================================================
apiRouter.get('/version', (c) => c.json({ version: WORKER_VERSION, ok: true }))

// ============================================================
// INIT
// ============================================================
apiRouter.post('/init', async (c) => {
  try {
    await initDb(c.env.DB)
    await seedVendors(c.env.DB)
    return c.json({ ok: true })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// ============================================================
// ADMIN — wipe all RFPs and related data (clean slate)
// POST /api/admin/reset-rfps
// ============================================================
apiRouter.post('/admin/reset-rfps', async (c) => {
  try {
    const db = c.env.DB
    // Delete in dependency order
    await db.prepare('DELETE FROM recommendations').run()
    await db.prepare('DELETE FROM evaluations').run()
    await db.prepare('DELETE FROM proposals').run()
    await db.prepare('DELETE FROM questions').run()
    await db.prepare('DELETE FROM email_log').run()
    await db.prepare('DELETE FROM scoring_models').run()
    await db.prepare('DELETE FROM rfp_vendors').run()
    await db.prepare('DELETE FROM rfps').run()
    // Reset autoincrement sequences
    await db.prepare("DELETE FROM sqlite_sequence WHERE name IN ('rfps','rfp_vendors','scoring_models','email_log','questions','proposals','evaluations','recommendations')").run().catch(() => {})
    return c.json({ ok: true, message: 'All RFPs and related data cleared.' })
  } catch (e: any) {
    return c.json({ ok: false, error: e.message }, 500)
  }
})

// ============================================================
// DASHBOARD STATS (cross-RFP)
// ============================================================
apiRouter.get('/stats', async (c) => {
  try {
    const db = c.env.DB
    const [totalRfps, activeRfps, awardedRfps, totalVendors, totalProposals, totalEmails] = await Promise.all([
      db.prepare('SELECT COUNT(*) as cnt FROM rfps').first<{cnt:number}>(),
      db.prepare("SELECT COUNT(*) as cnt FROM rfps WHERE stage NOT IN ('draft','awarded')").first<{cnt:number}>(),
      db.prepare("SELECT COUNT(*) as cnt FROM rfps WHERE stage='awarded'").first<{cnt:number}>(),
      db.prepare('SELECT COUNT(*) as cnt FROM vendors').first<{cnt:number}>(),
      db.prepare('SELECT COUNT(*) as cnt FROM proposals').first<{cnt:number}>(),
      db.prepare('SELECT COUNT(*) as cnt FROM email_log').first<{cnt:number}>(),
    ])
    const durationResult = await db.prepare(`
      SELECT AVG(CAST(julianday(updated_at) - julianday(created_at) AS REAL)) as avg_days
      FROM rfps WHERE stage='awarded'
    `).first<{avg_days:number|null}>()
    const total = totalRfps?.cnt || 0
    const awarded = awardedRfps?.cnt || 0
    const winRate = total > 0 ? Math.round((awarded / total) * 100) : 0
    const topVendorResult = await db.prepare(`
      SELECT v.name, COUNT(p.id) as cnt FROM proposals p 
      LEFT JOIN vendors v ON p.vendor_id = v.id
      GROUP BY p.vendor_id ORDER BY cnt DESC LIMIT 1
    `).first<{name:string,cnt:number}>()
    const { results: stageBreakdown } = await db.prepare(`
      SELECT stage, COUNT(*) as cnt FROM rfps GROUP BY stage
    `).all<{stage:string,cnt:number}>()
    return c.json({
      totalRfps: total,
      activeRfps: activeRfps?.cnt || 0,
      awardedRfps: awarded,
      winRate,
      totalVendors: totalVendors?.cnt || 0,
      totalProposals: totalProposals?.cnt || 0,
      totalEmails: totalEmails?.cnt || 0,
      avgDuration: durationResult?.avg_days ? Math.round(durationResult.avg_days) : null,
      topVendor: topVendorResult?.name || null,
      stageBreakdown: stageBreakdown || [],
    })
  } catch {
    return c.json({ totalRfps:0, activeRfps:0, awardedRfps:0, winRate:0, totalVendors:0, totalProposals:0, totalEmails:0, avgDuration:null, topVendor:null, stageBreakdown:[] })
  }
})

// ============================================================
// RFP CRUD
// ============================================================
apiRouter.get('/rfps', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM rfps ORDER BY id DESC').all()
  return c.json(results)
})

apiRouter.get('/rfps/:id', async (c) => {
  const id = c.req.param('id')
  const rfp = await c.env.DB.prepare('SELECT * FROM rfps WHERE id=?').bind(id).first()
  if (!rfp) return c.json({ error: 'Not found' }, 404)
  return c.json(rfp)
})

apiRouter.post('/rfps', async (c) => {
  try {
    const body = await c.req.json()
    const refNum = 'CPC/PROC/' + new Date().getFullYear() + '/' + String(Math.floor(Math.random()*9000)+1000)
    const r = await c.env.DB.prepare(`
      INSERT INTO rfps (ref_number, title, category, budget, deadline, scope, tech_requirements, objectives, background, arch_doc_text, stage, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', datetime('now'), datetime('now'))
    `).bind(refNum, body.title, body.category, body.budget, body.deadline, body.scope, body.tech_requirements||'', body.objectives||'', body.background||'', body.arch_doc_text||'').run()
    const rfp = await c.env.DB.prepare('SELECT * FROM rfps WHERE id=?').bind(r.meta.last_row_id).first()
    return c.json(rfp)
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

apiRouter.put('/rfps/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const body = await c.req.json()
    await c.env.DB.prepare(`
      UPDATE rfps SET title=?, category=?, budget=?, deadline=?, scope=?, tech_requirements=?, objectives=?, background=?, updated_at=datetime('now')
      WHERE id=?
    `).bind(body.title, body.category, body.budget, body.deadline, body.scope, body.tech_requirements||'', body.objectives||'', body.background||'', id).run()
    const rfp = await c.env.DB.prepare('SELECT * FROM rfps WHERE id=?').bind(id).first()
    return c.json(rfp)
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

apiRouter.post('/rfps/:id/generate', async (c) => {
  try {
    const id = c.req.param('id')
    const body = await c.req.json()
    // Fetch existing RFP to get uploaded document texts
    const existingRfp = await c.env.DB.prepare('SELECT * FROM rfps WHERE id=?').bind(id).first<any>()
    const archDocText = body.arch_doc_text || existingRfp?.arch_doc_text || ''
    const brdDocText  = body.brd_doc_text  || existingRfp?.brd_doc_text  || ''
    // LLM-only generation — no deterministic fallback. If it fails the user sees a clear error.
    const content = await generateRFPWithLLM(body, archDocText, brdDocText, c.env)
    await c.env.DB.prepare(`
      UPDATE rfps SET title=?, category=?, budget=?, deadline=?, scope=?, tech_requirements=?, objectives=?, background=?, content=?, arch_doc_text=?, brd_doc_text=?, updated_at=datetime('now')
      WHERE id=?
    `).bind(body.title, body.category, body.budget, body.deadline, body.scope, body.tech_requirements||'', body.objectives||'', body.background||'', content, archDocText, brdDocText, id).run()
    const rfp = await c.env.DB.prepare('SELECT * FROM rfps WHERE id=?').bind(id).first()
    return c.json(rfp)
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// POST /rfps/:id/upload-arch-doc — upload a supporting document PDF
// Accepts multipart/form-data with:
//   'file'      — the PDF file
//   'doc_label' — document type label (used to route to correct column)
// Routing:
//   label contains "Business Requirements" → rfps.brd_doc_text
//   anything else (Solution Architecture, default) → rfps.arch_doc_text
apiRouter.post('/rfps/:id/upload-arch-doc', async (c) => {
  try {
    const id = c.req.param('id')
    const formData = await c.req.formData()
    const file = formData.get('file') as File | null
    if (!file) return c.json({ error: 'No file uploaded' }, 400)

    const docLabel = (formData.get('doc_label') as string || '').toLowerCase()
    const isBRD = docLabel.includes('business requirement') || docLabel.includes('brd')

    const arrayBuffer = await file.arrayBuffer()
    const bytes = new Uint8Array(arrayBuffer)

    // Extract text — use vision fallback for complex/image PDFs
    const { text: pdfText, method } = await extractPdfTextSmart(bytes, file.name, c.env)
    console.log(`[upload-arch-doc] extracted ${pdfText.length} chars via ${method} from ${file.name}`)

    // Route to correct column based on document type
    if (isBRD) {
      await c.env.DB.prepare(`
        UPDATE rfps SET brd_doc_text=?, updated_at=datetime('now') WHERE id=?
      `).bind(pdfText, id).run()
    } else {
      await c.env.DB.prepare(`
        UPDATE rfps SET arch_doc_text=?, updated_at=datetime('now') WHERE id=?
      `).bind(pdfText, id).run()
    }

    return c.json({ ok: true, column: isBRD ? 'brd_doc_text' : 'arch_doc_text', textLength: pdfText.length, method, preview: pdfText.slice(0, 300) })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

apiRouter.post('/rfps/:id/stage', async (c) => {
  try {
    const id = c.req.param('id')
    const { stage } = await c.req.json()
    await c.env.DB.prepare(`UPDATE rfps SET stage=?, updated_at=datetime('now') WHERE id=?`).bind(stage, id).run()
    // Auto-generate scoring model when published
    if (stage === 'published') {
      const rfp = await c.env.DB.prepare('SELECT * FROM rfps WHERE id=?').bind(id).first<any>()
      const existing = await c.env.DB.prepare('SELECT id FROM scoring_models WHERE rfp_id=?').bind(id).first()
      if (!existing && rfp) {
        const model = buildScoringModel(rfp)
        await c.env.DB.prepare(`INSERT INTO scoring_models (rfp_id, model_json, created_at) VALUES (?,?,datetime('now'))`).bind(id, JSON.stringify(model)).run()
      }
    }
    return c.json({ ok: true, stage })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

apiRouter.delete('/rfps/:id', async (c) => {
  const id = c.req.param('id')
  await c.env.DB.prepare('DELETE FROM rfps WHERE id=?').bind(id).run()
  return c.json({ ok: true })
})

// ============================================================
// SCORING MODEL
// ============================================================
apiRouter.get('/rfps/:id/scoring-model', async (c) => {
  const rfpId = c.req.param('id')
  const row = await c.env.DB.prepare('SELECT * FROM scoring_models WHERE rfp_id=? ORDER BY id DESC LIMIT 1').bind(rfpId).first<any>()
  if (!row) return c.json(null, 404)
  return c.json(JSON.parse(row.model_json || '{}'))
})

apiRouter.post('/rfps/:id/scoring-model/generate', async (c) => {
  const rfpId = c.req.param('id')
  const rfp = await c.env.DB.prepare('SELECT * FROM rfps WHERE id=?').bind(rfpId).first<any>()
  if (!rfp) return c.json({ error: 'Not found' }, 404)
  const model = buildScoringModel(rfp)
  await c.env.DB.prepare(`
    INSERT INTO scoring_models (rfp_id, model_json, created_at) VALUES (?,?,datetime('now'))
  `).bind(rfpId, JSON.stringify(model)).run()
  return c.json(model)
})

// ============================================================
// VENDORS
// ============================================================
apiRouter.get('/vendors', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM vendors ORDER BY name ASC').all()
  return c.json(results)
})

// PUT /vendors/:id — update vendor contact email (and optionally contact name)
apiRouter.put('/vendors/:id', async (c) => {
  const id = c.req.param('id')
  try {
    const body = await c.req.json() as any
    const { contact_email, contact_name } = body
    if (!contact_email || !contact_email.includes('@')) {
      return c.json({ ok: false, error: 'Valid email address required' }, 400)
    }
    await c.env.DB.prepare(
      `UPDATE vendors SET contact_email=?, contact_name=COALESCE(?,contact_name) WHERE id=?`
    ).bind(contact_email.trim().toLowerCase(), contact_name?.trim() || null, id).run()
    const updated = await c.env.DB.prepare('SELECT * FROM vendors WHERE id=?').bind(id).first()
    return c.json({ ok: true, vendor: updated })
  } catch(e: any) {
    return c.json({ ok: false, error: e.message }, 500)
  }
})

apiRouter.get('/rfps/:id/vendors', async (c) => {
  const rfpId = c.req.param('id')
  const { results } = await c.env.DB.prepare(`
    SELECT v.*, COALESCE(rv.shortlisted, 0) as shortlisted,
      rv.fit_score as rfp_fit_score, rv.fit_rationale as rfp_fit_rationale,
      COALESCE(rv.status,'active') as rfp_status, rv.declined_at
    FROM vendors v
    LEFT JOIN rfp_vendors rv ON v.id = rv.vendor_id AND rv.rfp_id = ?
    ORDER BY COALESCE(rv.fit_score,0) DESC, v.name ASC
  `).bind(rfpId).all()
  return c.json(results)
})

apiRouter.put('/rfps/:rfpId/vendors/:vendorId/shortlist', async (c) => {
  const rfpId = c.req.param('rfpId')
  const vendorId = c.req.param('vendorId')
  const { shortlisted } = await c.req.json()
  await c.env.DB.prepare(`
    INSERT INTO rfp_vendors (rfp_id, vendor_id, shortlisted) VALUES (?,?,?)
    ON CONFLICT(rfp_id, vendor_id) DO UPDATE SET shortlisted=excluded.shortlisted
  `).bind(rfpId, vendorId, shortlisted ? 1 : 0).run()
  return c.json({ ok: true })
})

apiRouter.post('/rfps/:id/vendors/ai-shortlist', async (c) => {
  const rfpId = c.req.param('id')
  const rfp = await c.env.DB.prepare('SELECT * FROM rfps WHERE id=?').bind(rfpId).first<any>()
  const { results: vendors } = await c.env.DB.prepare('SELECT * FROM vendors').all<any>()
  for (const v of vendors) {
    const score = computeVendorScore(v, rfp)
    const shortlisted = score >= 60 ? 1 : 0
    const rationale = buildFitRationale(v, score)
    await c.env.DB.prepare(`
      INSERT INTO rfp_vendors (rfp_id, vendor_id, shortlisted, fit_score, fit_rationale) VALUES (?,?,?,?,?)
      ON CONFLICT(rfp_id, vendor_id) DO UPDATE SET shortlisted=excluded.shortlisted, fit_score=excluded.fit_score, fit_rationale=excluded.fit_rationale
    `).bind(rfpId, v.id, shortlisted, score, rationale).run()
  }
  return c.json({ ok: true })
})

// ============================================================
// QUESTIONS
// ============================================================
apiRouter.get('/rfps/:id/questions', async (c) => {
  const rfpId = c.req.param('id')
  const { results } = await c.env.DB.prepare(`
    SELECT q.*, v.name as vendor_name FROM questions q
    LEFT JOIN vendors v ON q.vendor_id = v.id
    WHERE q.rfp_id=? ORDER BY q.id ASC
  `).bind(rfpId).all()
  return c.json(results)
})

apiRouter.post('/rfps/:id/questions/load-samples', async (c) => {
  const rfpId = c.req.param('id')
  const sampleQs = getSampleQuestions()
  const { results: vendors } = await c.env.DB.prepare('SELECT id FROM vendors LIMIT 5').all<{id:number}>()
  for (let i = 0; i < sampleQs.length; i++) {
    const vid = vendors[i % vendors.length]?.id || null
    const existing = await c.env.DB.prepare('SELECT id FROM questions WHERE question=? AND rfp_id=?').bind(sampleQs[i].question, rfpId).first()
    if (!existing) {
      await c.env.DB.prepare(`INSERT INTO questions (rfp_id, question, vendor_id, published, source, created_at) VALUES (?,?,?,0,'sample',datetime('now'))`)
        .bind(rfpId, sampleQs[i].question, vid).run()
    }
  }
  return c.json({ ok: true })
})

apiRouter.post('/rfps/:rfpId/questions/:id/draft', async (c) => {
  const id = c.req.param('id')
  const rfpId = c.req.param('rfpId')
  const q = await c.env.DB.prepare('SELECT * FROM questions WHERE id=?').bind(id).first<any>()
  if (!q) return c.json({ error: 'Not found' }, 404)
  const rfp = await c.env.DB.prepare('SELECT * FROM rfps WHERE id=?').bind(rfpId).first<any>()
  const { answer, needsManual } = await draftAnswerLLM(q.question, rfp, c.env)
  await c.env.DB.prepare('UPDATE questions SET answer=?, needs_manual=? WHERE id=?').bind(answer, needsManual ? 1 : 0, id).run()
  return c.json({ ok: true, answer, needsManual })
})

apiRouter.post('/rfps/:id/questions/draft-all', async (c) => {
  const rfpId = c.req.param('id')
  const rfp = await c.env.DB.prepare('SELECT * FROM rfps WHERE id=?').bind(rfpId).first<any>()
  const { results: qs } = await c.env.DB.prepare('SELECT * FROM questions WHERE (answer IS NULL OR answer="") AND published=0 AND rfp_id=?').bind(rfpId).all<any>()

  // ── Parallel LLM calls in batches of 5 for speed ─────────────────────────
  // Sequential was ~3s/question × 15 questions = 45s+; parallel batches cut this to ~10–15s
  const BATCH_SIZE = 5
  let manualCount = 0

  for (let i = 0; i < qs.length; i += BATCH_SIZE) {
    const batch = qs.slice(i, i + BATCH_SIZE)
    const results = await Promise.all(
      batch.map(async (q: any) => {
        const { answer, needsManual } = await draftAnswerLLM(q.question, rfp, c.env)
        return { id: q.id, answer, needsManual }
      })
    )
    // Write DB updates for the batch sequentially (D1 does not support concurrent writes)
    for (const r of results) {
      await c.env.DB.prepare('UPDATE questions SET answer=?, needs_manual=? WHERE id=?').bind(r.answer, r.needsManual ? 1 : 0, r.id).run()
      if (r.needsManual) manualCount++
    }
  }

  return c.json({ ok: true, total: qs.length, manualRequired: manualCount })
})

apiRouter.put('/rfps/:rfpId/questions/:id/approve', async (c) => {
  const id = c.req.param('id')
  await c.env.DB.prepare('UPDATE questions SET published=1 WHERE id=?').bind(id).run()
  return c.json({ ok: true })
})

apiRouter.put('/rfps/:rfpId/questions/:id/answer', async (c) => {
  const id = c.req.param('id')
  const { answer } = await c.req.json()
  await c.env.DB.prepare('UPDATE questions SET answer=?, published=1 WHERE id=?').bind(answer, id).run()
  return c.json({ ok: true })
})

apiRouter.post('/rfps/:id/questions/publish-all', async (c) => {
  const rfpId = c.req.param('id')
  // Only publish answered, non-manual questions
  await c.env.DB.prepare(`UPDATE questions SET published=1 WHERE answer IS NOT NULL AND answer != "" AND rfp_id=? AND needs_manual=0`).bind(rfpId).run()

  // ── Build ONE consolidated Q&A Excel for ALL vendors ─────────────────────
  // Questions are consolidated across all vendors; each row shows which company asked.
  // The consolidated document is sent to ALL non-declined shortlisted vendors.
  try {
    const rfp = await c.env.DB.prepare('SELECT * FROM rfps WHERE id=?').bind(rfpId).first<any>()

    // Fetch ALL published questions for this RFP (with vendor name for attribution)
    const { results: allQuestions } = await c.env.DB.prepare(`
      SELECT q.*, COALESCE(v.name, 'Unknown Vendor') as vendor_name
      FROM questions q
      LEFT JOIN vendors v ON q.vendor_id = v.id
      WHERE q.rfp_id=? AND q.published=1
      ORDER BY q.vendor_id, q.id
    `).bind(rfpId).all<any>()

    // Build the consolidated Excel once
    const xlsxBytes = generateQAExcel(allQuestions)
    const xlsxBase64 = uint8ToBase64(xlsxBytes)
    const xlsxFilename = `QA_Consolidated_${(rfp?.ref_number || 'RFP').replace(/\//g,'_')}.xlsx`

    // Get ALL non-declined shortlisted vendors for this RFP
    const { results: activeVendors } = await c.env.DB.prepare(`
      SELECT v.*, rv.vendor_id, COALESCE(rv.status,'active') as rfp_status
      FROM rfp_vendors rv
      JOIN vendors v ON v.id = rv.vendor_id
      WHERE rv.rfp_id=? AND rv.shortlisted=1 AND COALESCE(rv.status,'active') != 'declined'
    `).bind(rfpId).all<any>()

    const sentTo: string[] = []
    const resendKey = (c.env as any).RESEND_API_KEY || ''

    for (const vendor of activeVendors) {
      const participantCode = buildParticipantCode(rfpId, vendor.id)
      const emailText = `Dear ${vendor.name},

Please find attached the official consolidated Q&A Response document for:

RFP Title:        ${rfp?.title || 'CPC RFP'}
Reference Number: ${rfp?.ref_number || ''}

This document consolidates all clarification questions submitted by all participating vendors, together with CPC's official answers. The document is provided to all shortlisted vendors to ensure full transparency and equal access to information.

Please review the attached Excel file carefully and incorporate the clarifications into your proposal submission.

For any further queries, please reply to this email referencing your Participant Reference below.

Best regards,
Procurement & Contracting Department
Crown Prince's Court, Abu Dhabi
procurement@cpc-rfp.website

──────────────────────────────────────────────
PARTICIPANT REFERENCE: ${participantCode}
Please include this reference code in ALL correspondence regarding this RFP.
──────────────────────────────────────────────`

      if (resendKey) {
        // Send real email to all vendors via Resend (no Andersen restriction — all participants)
        try {
          const emailPayload = {
            from: 'CPC Procurement <procurement@cpc-rfp.website>',
            to: [vendor.contact_email],
            subject: `Q&A Consolidated Response – ${rfp?.title || 'CPC RFP'} (Ref: ${rfp?.ref_number || ''})`,
            text: emailText,
            attachments: [{ filename: xlsxFilename, content: xlsxBase64 }],
          }
          const sendRes = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(emailPayload),
          })
          if (sendRes.ok) {
            sentTo.push(vendor.contact_email)
            // Log sent email
            await c.env.DB.prepare(`
              INSERT INTO email_log (rfp_id, vendor_id, recipient, subject, body, email_type, status, has_attachment, created_at)
              VALUES (?,?,?,?,?,'qa_response','sent',1,datetime('now'))
            `).bind(rfpId, vendor.id, vendor.contact_email,
              `Q&A Consolidated Response – ${rfp?.title || 'CPC RFP'} (Ref: ${rfp?.ref_number || ''})`,
              emailText).run()
          } else {
            console.error(`[publish-all] Resend failed for ${vendor.contact_email}:`, await sendRes.text())
            sentTo.push(vendor.contact_email + ' (send-failed)')
          }
        } catch(sendErr: any) {
          console.error(`[publish-all] send error for ${vendor.contact_email}:`, sendErr?.message)
          sentTo.push(vendor.contact_email + ' (error)')
        }
      } else {
        // No API key — log as simulated
        console.log(`[email] SIMULATED Q&A consolidated response (no API key): ${vendor.contact_email}`)
        sentTo.push(vendor.contact_email + ' (simulated)')
        await c.env.DB.prepare(`
          INSERT INTO email_log (rfp_id, vendor_id, recipient, subject, body, email_type, status, has_attachment, created_at)
          VALUES (?,?,?,?,?,'qa_response','simulated',1,datetime('now'))
        `).bind(rfpId, vendor.id, vendor.contact_email,
          `Q&A Consolidated Response – ${rfp?.title || 'CPC RFP'} (Ref: ${rfp?.ref_number || ''})`,
          emailText).run()
      }
    }

    // NOTE: Stage advancement (qa_open → submissions_closed) is now done via the
    // "Close Q&A" button, NOT by Publish All Approved. Publish All just sends emails.

    return c.json({ ok: true, sentTo, totalQuestions: allQuestions.length, vendorCount: activeVendors.length })
  } catch(e: any) {
    console.error('[publish-all] failed:', e?.message)
    return c.json({ ok: false, error: e?.message }, 500)
  }
})

// ============================================================
// EMAILS — send invitations (real to Andersen, simulated rest)
// ============================================================
apiRouter.get('/rfps/:id/emails', async (c) => {
  const rfpId = c.req.param('id')
  const { results } = await c.env.DB.prepare(`
    SELECT e.*, v.name as vendor_name FROM email_log e
    LEFT JOIN vendors v ON e.vendor_id = v.id
    WHERE e.rfp_id=? ORDER BY e.id DESC
  `).bind(rfpId).all()
  return c.json(results)
})

apiRouter.post('/rfps/:id/emails/send-invitations', async (c) => {
  const rfpId = c.req.param('id')
  const body = await c.req.json().catch(() => ({})) as any
  const rfp = await c.env.DB.prepare('SELECT * FROM rfps WHERE id=?').bind(rfpId).first<any>()
  const { results: shortlisted } = await c.env.DB.prepare(`
    SELECT v.*, COALESCE(rv.status,'active') as rfp_status FROM vendors v
    JOIN rfp_vendors rv ON v.id = rv.vendor_id AND rv.rfp_id=? AND rv.shortlisted=1
  `).bind(rfpId).all<any>()

  const qDeadline = body.questions_deadline || '14 days from today'
  const sDeadline = body.submission_deadline || (rfp?.deadline || '30 days from today')
  const notes = body.notes || ''

  const results: any[] = []

  for (const v of shortlisted) {
    // Skip vendors who have already declined for this RFP
    if (v.rfp_status === 'declined') {
      results.push({ vendor: v.name, status: 'declined_skipped' })
      continue
    }

    // Only skip if a REAL (status='sent') invitation already went out.
    // If previous attempt was 'simulated' (e.g. API key missing), delete it and retry.
    const existing = await c.env.DB.prepare(
      `SELECT id, status FROM email_log WHERE vendor_id=? AND rfp_id=? AND email_type='invitation'`
    ).bind(v.id, rfpId).first<any>()

    if (existing?.status === 'sent') {
      results.push({ vendor: v.name, status: 'already_sent' })
      continue
    }
    // Remove failed/simulated previous record so we can insert a fresh one
    if (existing) {
      await c.env.DB.prepare(`DELETE FROM email_log WHERE id=?`).bind(existing.id).run()
    }

    const isAndersen = v.contact_email?.includes('andersenlab.com')
    const baseUrl = new URL(c.req.url).origin
    const emailBody = buildInvitationEmailText(v, rfp, qDeadline, sDeadline, notes, baseUrl)
    let status = 'simulated'
    let sendError = ''

    if (isAndersen) {
      const result = await sendRealEmail(
        v.contact_email,
        `Invitation to Tender – ${rfp?.title || 'CPC RFP'} (Ref: ${rfp?.ref_number || ''})`,
        emailBody,
        rfp,
        c.env
      )
      status = result.ok ? 'sent' : 'simulated'
      sendError = result.error || ''
      results.push({ vendor: v.name, status, resendId: result.id, error: sendError })
    } else {
      results.push({ vendor: v.name, status: 'simulated' })
    }

    await c.env.DB.prepare(`
      INSERT INTO email_log (rfp_id, vendor_id, recipient, subject, body, email_type, status, has_pdf, created_at)
      VALUES (?,?,?,?,?,'invitation',?,1,datetime('now'))
    `).bind(
      rfpId, v.id,
      v.contact_email || 'contact@vendor.com',
      `Invitation to Tender – ${rfp?.title || 'CPC RFP'} (Ref: ${rfp?.ref_number || ''})`,
      emailBody,
      status
    ).run()
  }
  return c.json({ ok: true, results })
})

// ============================================================
// EMAILS — check inbox for vendor Q&A replies
// ============================================================
apiRouter.post('/rfps/:id/emails/check-inbox', async (c) => {
  const rfpId = c.req.param('id')
  const rfp = await c.env.DB.prepare('SELECT * FROM rfps WHERE id=?').bind(rfpId).first<any>()
  
  // Try to read real emails from Andersen's mailbox (IMAP/API integration)
  // NOTE: Simulation removed — questions only appear when vendors actually submit them
  // or when user clicks "Load Sample Questions" button in the Q&A tab
  let realQuestions: string[] = []
  try {
    realQuestions = await readVendorEmailReplies(rfp)
  } catch(e) {
    // no real email integration configured — return 0 new questions
  }
  // Do NOT fall back to simulation here

  // Find Andersen vendor
  const andersen = await c.env.DB.prepare(`SELECT * FROM vendors WHERE contact_email LIKE '%andersenlab.com%' LIMIT 1`).first<any>()
  const vendorId = andersen?.id || null

  let newCount = 0
  for (const question of realQuestions) {
    const existing = await c.env.DB.prepare('SELECT id FROM questions WHERE question=? AND rfp_id=?').bind(question, rfpId).first()
    if (!existing) {
      await c.env.DB.prepare(`
        INSERT INTO questions (rfp_id, question, vendor_id, published, source, created_at)
        VALUES (?,?,?,0,'email',datetime('now'))
      `).bind(rfpId, question, vendorId).run()
      newCount++
    }
  }

  // Log the inbound email
  if (newCount > 0 && andersen) {
    await c.env.DB.prepare(`
      INSERT INTO email_log (rfp_id, vendor_id, recipient, subject, body, email_type, status, created_at)
      VALUES (?,?,?,?,?,'qa_questions','received',datetime('now'))
    `).bind(
      rfpId, vendorId,
      andersen.contact_email,
      `RE: Q&A Questions – ${rfp?.title || 'RFP'} (${newCount} questions)`,
      `Vendor submitted ${newCount} clarification questions regarding the RFP.`,
    ).run()
  }

  return c.json({ ok: true, newQuestions: newCount })
})

// ============================================================
// INBOUND EMAIL WEBHOOK — Resend calls this when email arrives
// at procurement@cpc-rfp.website
// ============================================================
apiRouter.post('/webhook/inbound-email', async (c) => {
  try {
    const payload = await c.req.json() as any
    // Only handle email.received events
    if (payload.type !== 'email.received') return c.json({ ok: true })

    const emailId = payload.data?.email_id
    if (!emailId) return c.json({ ok: true })

    const apiKey = c.env.RESEND_API_KEY || ''
    if (!apiKey) return c.json({ ok: false, error: 'no api key' }, 500)

    // Fetch full email content from Resend API
    const emailRes = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    })
    if (!emailRes.ok) return c.json({ ok: false, error: 'failed to fetch email' }, 500)
    const email = await emailRes.json() as any

    const fromAddress: string = email.from || payload.data?.from || ''
    const subject: string = email.subject || payload.data?.subject || 'No Subject'
    const bodyText: string = email.text || ''
    const bodyHtml: string = email.html || ''
    const attachments: any[] = email.attachments || []

    const db = c.env.DB

    // ── RFP Association ─────────────────────────────────────────
    // 1. Try to find the RFP ref_number embedded in the email subject/body.
    //    Invitation emails use subject: "Invitation to Tender – TITLE (Ref: CPC/PROC/YYYY/NNNN)"
    //    Vendors are instructed to reply keeping that subject, so the ref_number survives Reply chains.
    // 2. Fall back to most-recent qa_open RFP, then any RFP.
    let rfp: any = null

    // Extract all "CPC/PROC/..." patterns from subject + body
    const refPattern = /CPC\/PROC\/\d{4}\/\d+/g
    const candidateRefs = [...new Set([
      ...(subject.match(refPattern) || []),
      ...(bodyText.slice(0, 2000).match(refPattern) || []),
    ])]

    for (const ref of candidateRefs) {
      const match = await db.prepare(`SELECT * FROM rfps WHERE ref_number=? LIMIT 1`).bind(ref).first<any>()
      if (match) { rfp = match; break }
    }

    if (!rfp) {
      rfp = await db.prepare(`SELECT * FROM rfps WHERE stage='qa_open' ORDER BY updated_at DESC LIMIT 1`).first<any>()
           ?? await db.prepare(`SELECT * FROM rfps ORDER BY updated_at DESC LIMIT 1`).first<any>()
    }

    if (!rfp) return c.json({ ok: true, note: 'no active rfp' })
    const rfpId = rfp.id

    // ── Vendor Identification — Participant Code is PRIMARY method ───────────
    // Step 1: Scan body + subject for participant code pattern RFP-{rfpId}-V{vendorId}
    // This is the reliable method for POC where all vendors share one physical email address.
    // Step 2: Fall back to contact_email lookup only if no code found.
    let vendorRow: any = null
    let codeRfpId: number | null = null

    const participantCodeMatch = (bodyText + '\n' + subject).match(/RFP-(\d+)-V(\d+)/i)
    if (participantCodeMatch) {
      codeRfpId = parseInt(participantCodeMatch[1], 10)
      const codeVendorId = parseInt(participantCodeMatch[2], 10)
      // Verify vendor exists and belongs to the identified RFP
      vendorRow = await db.prepare(`SELECT * FROM vendors WHERE id=?`).bind(codeVendorId).first<any>()
      // If the code's rfpId differs from the one we found via subject, trust the code
      if (codeRfpId && codeRfpId !== rfpId) {
        const codeRfp = await db.prepare(`SELECT * FROM rfps WHERE id=?`).bind(codeRfpId).first<any>()
        if (codeRfp) { rfp = codeRfp; }
      }
      console.log(`[webhook] Participant code matched: RFP-${codeRfpId}-V${codeVendorId} → vendor: ${vendorRow?.name || 'NOT FOUND'}`)
    }

    // Fallback: email address lookup (less reliable — same address for all vendors in POC)
    if (!vendorRow && fromAddress) {
      vendorRow = await db.prepare(
        `SELECT * FROM vendors WHERE contact_email=? OR contact_email LIKE ? LIMIT 1`
      ).bind(fromAddress, `%${fromAddress.split('@')[1] || 'NOMATCH'}%`).first<any>()
      if (vendorRow) console.log(`[webhook] Vendor identified via email fallback: ${vendorRow.name}`)
    }

    const vendorId = vendorRow?.id || null

    // ── Attachment detection ─────────────────────────────────────
    const hasAttachment = attachments.length > 0
    const spreadsheetAttachment = attachments.find((a: any) =>
      a.filename?.match(/\.(xlsx|xls|csv)$/i) ||
      a.content_type?.includes('spreadsheet') ||
      a.content_type?.includes('excel') ||
      a.content_type?.includes('csv')
    )
    const pdfAttachment = attachments.find((a: any) =>
      a.filename?.match(/\.pdf$/i) ||
      a.content_type?.includes('pdf')
    )

    // ── AI Email Categorization ──────────────────────────────────
    // Use LLM to classify: 'decline' | 'proposal' | 'questions' | 'plain_email'
    let emailCategory = 'plain_email'
    try {
      emailCategory = await categorizeEmailWithLLM(subject, bodyText, attachments, c.env)
    } catch(_) {
      // Fallback heuristic
      if (spreadsheetAttachment) emailCategory = 'questions'
      else if (pdfAttachment) emailCategory = 'proposal'
    }

    // ── Hard safety overrides — LLM sometimes misses obvious cases ───────────
    // Override 1: plain_email + decline keywords → decline (MUST check BEFORE proposal/questions)
    if (emailCategory === 'plain_email') {
      const bodyLower = bodyText.toLowerCase()
      const declineOverrideKeywords = [
        'not interested', 'not interested in participating', 'not interested in this',
        'decline to participate', 'declining to participate',
        'unable to participate', 'cannot participate', 'not in a position to participate',
        'regret to inform', 'regret to advise', 'regret that we',
        'pass on this opportunity', 'pass on this rfp', 'pass on this tender',
        'withdraw from', 'withdrawing from',
        'will not be submitting', 'will not be able to submit',
        'not proceeding', 'not able to proceed',
        'no thank you', 'no, thank you',
      ]
      if (declineOverrideKeywords.some(kw => bodyLower.includes(kw))) {
        emailCategory = 'decline'
        console.log('[webhook] Safety override: plain_email → decline (decline keywords found in body)')
      }
    }
    // Override 2: If LLM said plain_email but there's a PDF with no spreadsheet → treat as proposal
    if (emailCategory === 'plain_email' && pdfAttachment && !spreadsheetAttachment) {
      const bodyLower = bodyText.toLowerCase()
      const proposalKeywords = ['find attached', 'please find', 'proposal', 'rfp response', 'bid', 'tender response', 'submission', 'attached our', 'attaching our']
      if (proposalKeywords.some(k => bodyLower.includes(k))) {
        emailCategory = 'proposal'
        console.log('[webhook] Safety override: plain_email → proposal (PDF attachment + proposal keywords)')
      }
    }
    // Override 3: If LLM said plain_email but there's a spreadsheet → treat as questions
    if (emailCategory === 'plain_email' && spreadsheetAttachment) {
      emailCategory = 'questions'
      console.log('[webhook] Safety override: plain_email → questions (spreadsheet attachment found)')
    }
    console.log(`[webhook] Email category: ${emailCategory} | from: ${fromAddress} | vendor: ${vendorRow?.name || 'unknown'} | attachments: ${attachments.length}`)

    // Download attachments based on category
    let excelQuestions: string[] = []
    let pdfBase64 = ''          // kept for small PDFs only (<=8MB) — legacy path, rarely used now
    let pdfR2Key = ''           // R2 object key for PRIMARY attachment
    let pdfPublicUrl = ''       // public URL if R2 bucket is public-read
    let pdfFilename = ''
    let proposedDuration = ''
    let pdfExtractedTextFromDownload = '' // Concatenated text from ALL attachments (up to 60k chars)
    // Multi-attachment support: stores metadata for ALL proposal documents (technical + commercial + others)
    // Structure: Array<{ r2_key, filename, size_bytes, content_type, label, text_chars }>
    // label: 'technical' | 'commercial' | 'other' — auto-detected from filename/content
    let allProposalAttachments: Array<{
      r2_key: string
      filename: string
      size_bytes: number
      content_type: string
      label: string
      text_chars: number
    }> = []

    try {
      const attachListRes = await fetch(`https://api.resend.com/emails/receiving/${emailId}/attachments`, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      })
      if (attachListRes.ok) {
        const attachList = await attachListRes.json() as any
        const allAttachData: any[] = attachList.data || []

        if (emailCategory === 'questions' && spreadsheetAttachment) {
          const attachData = allAttachData.find((a: any) => a.id === spreadsheetAttachment.id) || allAttachData[0]
          if (attachData?.download_url) {
            const fileRes = await fetch(attachData.download_url)
            if (fileRes.ok) {
              const fileBuffer = await fileRes.arrayBuffer()
              const filename: string = spreadsheetAttachment.filename || ''
              if (filename.match(/\.xlsx$/i) || spreadsheetAttachment.content_type?.includes('spreadsheet')) {
                excelQuestions = await parseXlsxBuffer(fileBuffer)
              } else {
                const text = new TextDecoder('utf-8').decode(fileBuffer)
                excelQuestions = parseCsvQuestions(text)
              }
            }
          }
        }

        if (emailCategory === 'proposal') {
          // ── Multi-attachment support ───────────────────────────────────────────
          // Download ALL document attachments (PDF/Word/etc.) — vendors often submit
          // a technical proposal + a separate commercial proposal as two files.
          // Order: PDFs first (prefer technical, then commercial), then other docs.
          const docAttachments = allAttachData.filter((a: any) =>
            a.filename?.match(/\.(pdf|doc|docx)$/i) ||
            a.content_type?.includes('pdf') ||
            a.content_type?.includes('word') ||
            a.content_type?.includes('msword') ||
            a.content_type?.includes('officedocument')
          )
          // If no doc attachments found, fall back to ALL attachments
          const attachsToProcess = docAttachments.length > 0 ? docAttachments : allAttachData.slice(0, 5)

          const bucket: R2Bucket | undefined = (c.env as any).PROPOSALS_BUCKET
          const safeVendorName = (vendorDisplayName || 'vendor').replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,40)
          // Files above this threshold are streamed to R2 without buffering.
          // Text extraction + evaluation runs after the webhook responds via ctx.waitUntil().
          const INLINE_EXTRACT_THRESHOLD = 5_000_000  // 5 MB
          const allExtractedTexts: string[] = []
          // Jobs for large files / PS-garbage files — dispatched via ctx.waitUntil() after proposal insert
          const pendingExtractionJobs: Array<{ r2Key: string, filename: string, contentType: string, attachmentIndex: number, label: string }> = []

          for (let attachIdx = 0; attachIdx < attachsToProcess.length; attachIdx++) {
            const attachData = attachsToProcess[attachIdx]
            if (!attachData?.download_url) {
              // No download URL — record filename only
              const fn = attachData.filename || `document_${attachIdx + 1}.pdf`
              allProposalAttachments.push({ r2_key: '', filename: fn, size_bytes: 0, content_type: attachData.content_type || 'application/pdf', label: detectAttachmentLabel(fn), text_chars: 0, queued: false })
              continue
            }

            try {
              const fn = attachData.filename || `document_${attachIdx + 1}.pdf`
              const ct = attachData.content_type || 'application/pdf'
              const label = detectAttachmentLabel(fn)
              const ts = Date.now() + attachIdx  // ensure unique key per attachment
              const r2Key = `proposals/${rfpId}/${vendorId}_${safeVendorName}_${ts}_${attachIdx}.pdf`

              // HEAD request: read Content-Length before downloading any bytes.
              // Lets us choose large-file vs small-file path without buffering anything.
              let declaredSize = 0
              try {
                const headRes = await fetch(attachData.download_url, { method: 'HEAD' })
                declaredSize = parseInt(headRes.headers.get('Content-Length') || '0', 10)
              } catch(_) { /* HEAD may not be supported — proceed with unknown size */ }

              console.log(`[webhook] Attachment ${attachIdx} (${label}): ${fn}, declared size=${declaredSize} bytes`)

              const controller = new AbortController()
              const timeoutId = setTimeout(() => controller.abort(), 20000)
              const fileRes = await fetch(attachData.download_url, { signal: controller.signal })
              clearTimeout(timeoutId)

              if (!fileRes.ok) {
                console.error(`[webhook] Attachment ${attachIdx} download failed: HTTP ${fileRes.status}`)
                allProposalAttachments.push({ r2_key: '', filename: fn, size_bytes: 0, content_type: ct, label: detectAttachmentLabel(fn), text_chars: 0, queued: false })
                continue
              }

              // Actual size from Content-Length on the GET response (may differ from HEAD)
              const getSize = parseInt(fileRes.headers.get('Content-Length') || '0', 10)
              const estimatedSize = getSize || declaredSize

              let storedR2Key = ''

              if (estimatedSize > INLINE_EXTRACT_THRESHOLD && bucket && fileRes.body) {
                // LARGE FILE PATH: stream directly to R2 without loading into Worker memory.
                // R2.put() accepts a ReadableStream natively — no 128MB wall, no timeout from buffering.
                // Text extraction happens asynchronously in the Queue consumer (no CPU time limit).
                console.log(`[webhook] Large file (${estimatedSize} bytes) — streaming to R2 without buffering`)
                try {
                  await bucket.put(r2Key, fileRes.body, {
                    httpMetadata: { contentType: ct },
                    customMetadata: { rfpId: String(rfpId), vendorId: String(vendorId), filename: fn, label, needs_extraction: '1' },
                  })
                  storedR2Key = r2Key
                  console.log(`[webhook] Large file streamed to R2: ${r2Key}`)
                  // Schedule async extraction + evaluation via ctx.waitUntil()
                  // This runs after the webhook returns 200 — no Queue resource needed.
                  // proposalId will be patched into the job after the proposal row is inserted.
                  pendingExtractionJobs.push({ r2Key, filename: fn, contentType: ct, attachmentIndex: attachIdx, label })
                  console.log(`[webhook] Scheduled async extraction job for ${fn}`)
                } catch(r2Err: any) {
                  console.error(`[webhook] R2 stream put failed for ${fn}: ${r2Err?.message}`)
                }
                allProposalAttachments.push({ r2_key: storedR2Key, filename: fn, size_bytes: estimatedSize, content_type: ct, label, text_chars: 0, queued: true })

              } else {
                // SMALL FILE PATH: buffer, extract text inline during webhook, then store in R2.
                const fileBuffer = await new Response(fileRes.body).arrayBuffer()
                const rawBytes = new Uint8Array(fileBuffer)

                if (bucket) {
                  try {
                    await bucket.put(r2Key, rawBytes, {
                      httpMetadata: { contentType: ct },
                      customMetadata: { rfpId: String(rfpId), vendorId: String(vendorId), filename: fn, label },
                    })
                    storedR2Key = r2Key
                    console.log(`[webhook] Attachment ${attachIdx} (${label}) stored in R2: ${r2Key} (${rawBytes.length} bytes)`)
                  } catch(r2Err: any) {
                    console.error(`[webhook] R2 put failed for attachment ${attachIdx}: ${r2Err?.message}`)
                  }
                }

                // Text extraction — guard against PostScript garbage from complex embedded-font PDFs
                const extracted = await extractPdfText(rawBytes)
                const textChars = extracted.length
                console.log(`[webhook] Attachment ${attachIdx} (${label}): ${textChars} chars extracted from ${fn}`)

                if (extracted && !isPostScriptGarbage(extracted)) {
                  allExtractedTexts.push(`=== ${label.toUpperCase()} PROPOSAL (${fn}) ===\n${extracted}`)
                } else if (extracted && isPostScriptGarbage(extracted)) {
                  console.warn(`[webhook] PostScript garbage detected in ${fn} — skipping text, queuing re-extraction`)
                  if (storedR2Key) {
                    pendingExtractionJobs.push({ r2Key: storedR2Key, filename: fn, contentType: ct, attachmentIndex: attachIdx, label })
                  }
                }

                allProposalAttachments.push({ r2_key: storedR2Key, filename: fn, size_bytes: rawBytes.length, content_type: ct, label, text_chars: textChars, queued: false })
              }

              // Track primary attachment (first one, or first explicitly labelled 'technical')
              if (attachIdx === 0 || (label === 'technical' && !pdfR2Key)) {
                pdfR2Key = storedR2Key
                pdfFilename = fn
              }
            } catch(downloadErr: any) {
              console.error(`[webhook] Attachment ${attachIdx} download error: ${downloadErr?.message}`)
              const fn = attachData.filename || `document_${attachIdx + 1}.pdf`
              allProposalAttachments.push({ r2_key: '', filename: fn, size_bytes: 0, content_type: attachData.content_type || 'application/pdf', label: detectAttachmentLabel(fn), text_chars: 0, queued: false })
            }
          }

          // Concatenate all inline-extracted texts (no artificial cap — full text goes to LLM)
          pdfExtractedTextFromDownload = allExtractedTexts.join('\n\n')
          console.log(`[webhook] Total inline text from ${allProposalAttachments.length} attachment(s): ${pdfExtractedTextFromDownload.length} chars`)

          // If no attachments had download URLs, record filenames from metadata
          if (allProposalAttachments.length === 0 && attachments.length > 0) {
            const proposalAttach = pdfAttachment || attachments[0]
            if (proposalAttach?.filename) {
              pdfFilename = proposalAttach.filename
              console.log(`[webhook] No download_url for any attachment — filename only: ${pdfFilename}`)
            }
          } else if (!pdfFilename && attachments.length > 0) {
            pdfFilename = (pdfAttachment || attachments[0])?.filename || ''
          }

          proposedDuration = extractProposedDuration(pdfExtractedTextFromDownload + '\n' + bodyText)
        }
      }
    } catch(_e) {}

    // Also extract questions from email body text (numbered list patterns)
    const bodyQuestions = parseQuestionsFromBody(bodyText)
    if (emailCategory === 'questions') {
      excelQuestions = [...new Set([...excelQuestions, ...bodyQuestions])]
    }

    // Log the inbound email in email_log
    const emailTypeForLog = emailCategory === 'questions' ? 'qa_questions'
      : emailCategory === 'proposal' ? 'proposal'
      : emailCategory === 'decline' ? 'decline'
      : 'inbound'
    const insertResult = await db.prepare(`
      INSERT INTO email_log (rfp_id, vendor_id, recipient, from_email, subject, body, email_body_html, email_type, email_category, status, has_attachment, resend_email_id, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,'received',?,?,datetime('now'))
    `).bind(
      rfpId,
      vendorId,
      'procurement@cpc-rfp.website',
      fromAddress,
      subject,
      bodyText.slice(0, 4000),
      bodyHtml.slice(0, 16000),
      emailTypeForLog,
      emailCategory,
      hasAttachment ? 1 : 0,
      emailId
    ).run()

    const emailLogId = insertResult.meta.last_row_id

    // ── Route by category ────────────────────────────────────────
    let newCount = 0

    if (emailCategory === 'decline') {
      // Vendor has declined participation — mark them as declined in rfp_vendors
      if (vendorId) {
        await db.prepare(`
          INSERT INTO rfp_vendors (rfp_id, vendor_id, shortlisted, status, declined_at)
          VALUES (?,?,0,'declined',datetime('now'))
          ON CONFLICT(rfp_id, vendor_id) DO UPDATE SET status='declined', declined_at=datetime('now')
        `).bind(rfpId, vendorId).run()
        console.log(`[webhook] Vendor ${vendorId} declined RFP ${rfpId} — status set to declined`)
      } else {
        console.log(`[webhook] Decline email from unknown vendor (${fromAddress}) — no rfp_vendors update`)
      }
    } else if (emailCategory === 'questions') {
      // Insert extracted questions into questions table
      for (const question of excelQuestions) {
        const q = question.trim()
        if (!q || q.length < 10) continue
        const existing = await db.prepare('SELECT id FROM questions WHERE question=? AND rfp_id=?').bind(q, rfpId).first()
        if (!existing) {
          await db.prepare(`
            INSERT INTO questions (rfp_id, question, vendor_id, published, source, email_log_id, created_at)
            VALUES (?,?,?,0,'email',?,datetime('now'))
          `).bind(rfpId, q, vendorId, emailLogId).run()
          newCount++
        }
      }

      // ── Mark this vendor as having responded with questions ──
      if (vendorId) {
        await db.prepare(`
          INSERT INTO rfp_vendors (rfp_id, vendor_id, shortlisted, questions_responded)
          VALUES (?,?,1,1)
          ON CONFLICT(rfp_id, vendor_id) DO UPDATE SET questions_responded=1
        `).bind(rfpId, vendorId).run()
      }

      // ── Auto-close Q&A: if ALL invited non-declined vendors have responded ──
      // Check only when RFP is in qa_open stage
      let qaAutoClose = false
      try {
        const currentRfpStage = await db.prepare('SELECT stage FROM rfps WHERE id=?').bind(rfpId).first<{stage:string}>()
        if (currentRfpStage?.stage === 'qa_open') {
          // Count shortlisted non-declined vendors with invitations sent
          const { results: invitedVendors } = await db.prepare(`
            SELECT rv.vendor_id
            FROM rfp_vendors rv
            WHERE rv.rfp_id=? AND rv.shortlisted=1 AND COALESCE(rv.status,'active') != 'declined'
          `).bind(rfpId).all<{vendor_id:number}>()

          if (invitedVendors.length > 0) {
            // Check if all of them have a 'questions' type email received
            const { results: respondedVendors } = await db.prepare(`
              SELECT DISTINCT e.vendor_id
              FROM email_log e
              WHERE e.rfp_id=? AND e.status='received' AND e.email_category='questions' AND e.vendor_id IS NOT NULL
            `).bind(rfpId).all<{vendor_id:number}>()

            const invitedSet = new Set(invitedVendors.map((r: any) => r.vendor_id))
            const respondedSet = new Set(respondedVendors.map((r: any) => r.vendor_id))
            const allResponded = [...invitedSet].every((id: any) => respondedSet.has(id))

            if (allResponded && invitedSet.size > 0) {
              await db.prepare(`UPDATE rfps SET stage='submissions_closed', updated_at=datetime('now') WHERE id=?`).bind(rfpId).run()
              qaAutoClose = true
              console.log(`[webhook] All ${invitedSet.size} invited vendors submitted questions — Q&A auto-closed, stage→submissions_closed`)
            }
          }
        }
      } catch(stageErr: any) {
        console.error('[webhook] Q&A auto-close check failed:', stageErr?.message)
      }

      // Pass qaAutoClose flag in the response so the frontend poller can redirect
      if (qaAutoClose) {
        return c.json({ ok: true, emailCategory, newQuestions: newCount, emailLogId, autoInserted: newCount > 0, qaAutoClose: true, rfpId })
      }

    } else if (emailCategory === 'proposal') {
      const isKnownVendor = vendorRow !== null
      const isAndersen = vendorRow?.contact_email?.includes('andersenlab.com') ? 1 : 0
      const vendorDisplayName = vendorRow?.name || fromAddress || 'Vendor'

      // ── Missing attachment: reply to sender asking to resubmit with PDF ──
      // Only send "missing attachment" reply if there truly was no attachment at all
      // (pdfFilename may be set even when download failed — still create the proposal)
      if (!pdfBase64 && !pdfFilename && attachments.length === 0) {
        const canSendReal = (isAndersen || isKnownVendor) && !!(c.env as any).RESEND_API_KEY
        if (canSendReal) {
          const missingAttachReply = `Dear ${vendorDisplayName},

Thank you for your email regarding RFP Reference: ${rfp?.ref_number || ''} — ${rfp?.title || 'CPC RFP'}.

We have reviewed your message and note that your proposal document was not attached to the email. To formally register your submission, please resend your email with your complete proposal document attached as a PDF file.

Your proposal should include:
• Technical approach and methodology
• Project timeline and implementation plan
• Commercial / financial offer (total cost in AED)
• Team profile and relevant experience

If you have already submitted your proposal separately, please disregard this message.

Best regards,
Procurement & Contracting Department
Crown Prince's Court, Abu Dhabi
procurement@cpc-rfp.website`
          try {
            await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${(c.env as any).RESEND_API_KEY}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                from: 'CPC Procurement <procurement@cpc-rfp.website>',
                to: [fromAddress],
                subject: `RE: ${subject} — Proposal Document Missing`,
                text: missingAttachReply,
              }),
            })
            console.log(`[webhook] Sent missing-attachment reply to ${fromAddress}`)
          } catch(replyErr: any) {
            console.error('[webhook] Failed to send missing-attachment reply:', replyErr?.message)
          }
        }
        // Do NOT create a proposal record — no attachment at all
      } else {
        // ── We have a PDF (or at minimum a PDF filename) — create/update the proposal record ──
        // Works regardless of RFP stage (qa_open, submissions_closed, evaluation, etc.)
        // Create the record even if PDF download/extraction failed — the email was received

        // Use text extracted during download — avoids re-decoding base64 and re-running extraction.
        // For large PDFs (>8MB) where pdfBase64 is empty, this still has the extracted text.
        const pdfExtractedText = pdfExtractedTextFromDownload

        // Use LLM to extract structured proposal fields
        let proposalFields = {
          executive_summary: '',
          key_strengths: '',
          budget_amount: null as number | null,
          budget_currency: 'AED',
          timeline_months: null as number | null,
          technical_proposal: pdfExtractedText.slice(0, 4000) || bodyText.slice(0, 2000) || `Proposal submitted by ${vendorDisplayName}.`,
        }
        try {
          proposalFields = await extractProposalFieldsWithLLM(
            pdfExtractedText,
            bodyText,
            vendorDisplayName,
            rfp?.title || 'RFP',
            c.env
          )
        } catch(_) {}

        // financial_proposal: use LLM-extracted budget_amount, fall back to body/pdf heuristic
        const financialValue = proposalFields.budget_amount
          ?? (proposedDuration ? null : null) // placeholder — extractProposedDuration already ran

        // Build the URL to store in D1:
        // - R2 key stored as r2:// URI → resolved to presigned URL at read time by /proposals/:id/pdf
        // - base64 data: URI for small PDFs when R2 is unavailable
        const pdfUrl = pdfR2Key
          ? `r2://${pdfR2Key}`
          : (pdfBase64 ? 'data:application/pdf;base64,' + pdfBase64 : null)

        // Serialize multi-attachment metadata to JSON for D1 storage
        const proposalAttachmentsJson = allProposalAttachments.length > 0
          ? JSON.stringify(allProposalAttachments)
          : null

        const existing = await db.prepare('SELECT id FROM proposals WHERE vendor_id=? AND rfp_id=?').bind(vendorId, rfpId).first<any>()

        if (existing) {
          await db.prepare(`
            UPDATE proposals SET
              pdf_attachment_url=?, pdf_filename=?, proposal_attachments=?,
              technical_proposal=?, proposed_duration=?,
              financial_proposal=?, status='submitted', is_real_submission=?,
              executive_summary=?, key_strengths=?,
              budget_amount=?, budget_currency=?, timeline_months=?
            WHERE id=?
          `).bind(
            pdfUrl, pdfFilename || null, proposalAttachmentsJson,
            proposalFields.technical_proposal, proposedDuration || null,
            financialValue, isAndersen,
            proposalFields.executive_summary || null,
            proposalFields.key_strengths || null,
            proposalFields.budget_amount, proposalFields.budget_currency,
            proposalFields.timeline_months,
            existing.id
          ).run()
        } else {
          await db.prepare(`
            INSERT INTO proposals (
              rfp_id, vendor_id, technical_proposal, financial_proposal,
              status, is_real_submission, pdf_attachment_url, pdf_filename,
              proposal_attachments, proposed_duration, executive_summary, key_strengths,
              budget_amount, budget_currency, timeline_months, created_at
            )
            VALUES (?,?,?,?,'submitted',?,?,?,?,?,?,?,?,?,?,datetime('now'))
          `).bind(
            rfpId, vendorId,
            proposalFields.technical_proposal,
            financialValue,
            isAndersen,
            pdfUrl, pdfFilename || null,
            proposalAttachmentsJson,
            proposedDuration || null,
            proposalFields.executive_summary || null,
            proposalFields.key_strengths || null,
            proposalFields.budget_amount,
            proposalFields.budget_currency,
            proposalFields.timeline_months
          ).run()
        }

        // Mark vendor as having submitted a proposal in rfp_vendors
        if (vendorId) {
          await db.prepare(`
            INSERT INTO rfp_vendors (rfp_id, vendor_id, shortlisted, status)
            VALUES (?,?,1,'active')
            ON CONFLICT(rfp_id, vendor_id) DO UPDATE SET shortlisted=1
          `).bind(rfpId, vendorId).run()
        }

        console.log(`[webhook] Proposal from ${vendorDisplayName} stored — budget: ${proposalFields.budget_amount} ${proposalFields.budget_currency}, timeline: ${proposalFields.timeline_months}mo`)

        // Dispatch async extraction + evaluation for large/garbage-detected files
        // ctx.waitUntil() lets the Worker continue running after the HTTP response is sent.
        if (pendingExtractionJobs.length > 0) {
          const executionCtx = (c as any).executionCtx
          if (executionCtx?.waitUntil) {
            // Look up the just-inserted proposal ID so the async job can update it
            const insertedProposal = await db.prepare(
              `SELECT id FROM proposals WHERE rfp_id=? AND vendor_id=? ORDER BY id DESC LIMIT 1`
            ).bind(rfpId, vendorId).first<{ id: number }>()
            const insertedProposalId = insertedProposal?.id || 0

            for (const job of pendingExtractionJobs) {
              const rfpSnap = Number(rfpId)
              const vendorSnap = Number(vendorId)
              const proposalSnap = insertedProposalId
              const jobSnap = { ...job }
              executionCtx.waitUntil(
                processLargeAttachmentAsync(rfpSnap, vendorSnap, proposalSnap, jobSnap, c.env)
                  .catch((err: any) => console.error(`[waitUntil] Processing failed for ${job.filename}: ${err?.message}`))
              )
            }
            console.log(`[webhook] Dispatched ${pendingExtractionJobs.length} async extraction job(s) via ctx.waitUntil()`)
          } else {
            console.warn(`[webhook] ctx.waitUntil not available — ${pendingExtractionJobs.length} large file(s) need manual reprocess`)
          }
        }

        // Auto-advance RFP stage: submissions_closed → evaluation
        try {
          const currentRfp = await db.prepare('SELECT stage FROM rfps WHERE id=?').bind(rfpId).first<{stage:string}>()
          if (currentRfp?.stage === 'submissions_closed') {
            await db.prepare(`UPDATE rfps SET stage='evaluation', updated_at=datetime('now') WHERE id=?`).bind(rfpId).run()
          }
        } catch(_) {}
      }
    }

    // For questions emails: also auto-notify via the newCount in the response
    return c.json({ ok: true, emailCategory, newQuestions: newCount, emailLogId, autoInserted: newCount > 0 })
  } catch(e: any) {
    return c.json({ ok: false, error: e.message }, 500)
  }
})

// GET /rfps/:id/emails/received — fetch inbound emails with full body for display
apiRouter.get('/rfps/:id/emails/received', async (c) => {
  const rfpId = c.req.param('id')
  const { results } = await c.env.DB.prepare(`
    SELECT e.*, v.name as vendor_name
    FROM email_log e
    LEFT JOIN vendors v ON e.vendor_id = v.id
    WHERE e.rfp_id=? AND e.status='received'
    ORDER BY e.id DESC
  `).bind(rfpId).all()
  return c.json(results)
})

// GET /rfps/:id/vendors/:vendorId/emails — all emails for a specific vendor on this RFP
apiRouter.get('/rfps/:id/vendors/:vendorId/emails', async (c) => {
  const rfpId = c.req.param('id')
  const vendorId = c.req.param('vendorId')
  const { results } = await c.env.DB.prepare(`
    SELECT e.*, v.name as vendor_name
    FROM email_log e
    LEFT JOIN vendors v ON e.vendor_id = v.id
    WHERE e.rfp_id=? AND e.vendor_id=?
    ORDER BY e.id ASC
  `).bind(rfpId, vendorId).all()
  return c.json(results)
})

// POST /rfps/:id/vendors/:vendorId/reply — send a reply email to a vendor
apiRouter.post('/rfps/:id/vendors/:vendorId/reply', async (c) => {
  const rfpId = c.req.param('id')
  const vendorId = c.req.param('vendorId')
  try {
    const body = await c.req.json() as any
    const { subject, text } = body

    const rfp = await c.env.DB.prepare('SELECT * FROM rfps WHERE id=?').bind(rfpId).first<any>()
    const vendor = await c.env.DB.prepare('SELECT * FROM vendors WHERE id=?').bind(vendorId).first<any>()
    if (!vendor) return c.json({ ok: false, error: 'Vendor not found' }, 404)

    // Guard: prohibit correspondence with vendors who have declined for this RFP
    const rfpVendorRow = await c.env.DB.prepare(
      `SELECT status FROM rfp_vendors WHERE rfp_id=? AND vendor_id=?`
    ).bind(rfpId, vendorId).first<any>()
    if (rfpVendorRow?.status === 'declined') {
      return c.json({ ok: false, error: `Cannot send email — ${vendor.name} has declined participation in this RFP.` }, 403)
    }

    const replySubject = subject || `RE: Invitation to Tender – ${rfp?.title || 'CPC RFP'} (Ref: ${rfp?.ref_number || ''})`
    const participantCode = buildParticipantCode(rfpId, vendorId)
    const replyFooter = `\n\n──────────────────────────────────────────────\nPARTICIPANT REFERENCE: ${participantCode}\nPlease include this reference code in ALL correspondence regarding this RFP.\n──────────────────────────────────────────────`
    const fullText = (text || '') + replyFooter
    const result = await sendRealEmail(vendor.contact_email, replySubject, fullText, rfp, c.env)

    await c.env.DB.prepare(`
      INSERT INTO email_log (rfp_id, vendor_id, recipient, subject, body, email_type, status, created_at)
      VALUES (?,?,?,?,?,'reply',?,datetime('now'))
    `).bind(rfpId, vendorId, vendor.contact_email, replySubject, fullText, result.ok ? 'sent' : 'simulated').run()

    return c.json({ ok: result.ok, error: result.error })
  } catch(e: any) {
    return c.json({ ok: false, error: e.message }, 500)
  }
})

// POST /rfps/:id/emails/reprocess-questions — re-parse received emails to extract questions
// Useful when the original parse failed (e.g. tinflate bug) or when re-testing
apiRouter.post('/rfps/:id/emails/reprocess-questions', async (c) => {
  const rfpId = c.req.param('id')
  const db = c.env.DB
  const apiKey = c.env.RESEND_API_KEY || ''

  // Get all received emails for this RFP that have attachments
  const { results: receivedEmails } = await db.prepare(`
    SELECT * FROM email_log WHERE rfp_id=? AND status='received' ORDER BY id DESC
  `).bind(rfpId).all<any>()

  let totalNew = 0
  const log: any[] = []

  for (const email of receivedEmails) {
    const emailLogId = email.id
    const vendorId = email.vendor_id
    const resendEmailId = email.resend_email_id

    let questions: string[] = []

    // Attempt 1: re-fetch attachment from Resend if we have the email_id
    if (resendEmailId && apiKey) {
      try {
        const emailRes = await fetch(`https://api.resend.com/emails/receiving/${resendEmailId}`, {
          headers: { 'Authorization': `Bearer ${apiKey}` }
        })
        if (emailRes.ok) {
          const emailData = await emailRes.json() as any
          const attachments: any[] = emailData.attachments || []
          const spreadsheetAttachment = attachments.find((a: any) =>
            a.filename?.match(/\.(xlsx|xls|csv)$/i) ||
            a.content_type?.includes('spreadsheet') ||
            a.content_type?.includes('excel') ||
            a.content_type?.includes('csv')
          )

          if (spreadsheetAttachment) {
            const attachListRes = await fetch(`https://api.resend.com/emails/receiving/${resendEmailId}/attachments`, {
              headers: { 'Authorization': `Bearer ${apiKey}` }
            })
            if (attachListRes.ok) {
              const attachList = await attachListRes.json() as any
              const attachData = (attachList.data || []).find((a: any) => a.id === spreadsheetAttachment.id)
                || (attachList.data || [])[0]
              if (attachData?.download_url) {
                const fileRes = await fetch(attachData.download_url)
                if (fileRes.ok) {
                  const fileBuffer = await fileRes.arrayBuffer()
                  const filename: string = spreadsheetAttachment.filename || ''
                  if (filename.match(/\.xlsx$/i) || spreadsheetAttachment.content_type?.includes('spreadsheet')) {
                    questions = await parseXlsxBuffer(fileBuffer)
                  } else {
                    const text = new TextDecoder('utf-8').decode(fileBuffer)
                    questions = parseCsvQuestions(text)
                  }
                  log.push({ emailId: emailLogId, source: 'attachment_refetch', count: questions.length })
                }
              }
            }
          }

          // Also parse body for numbered questions
          const bodyText: string = emailData.text || email.body || ''
          const bodyQs = parseQuestionsFromBody(bodyText)
          questions = [...new Set([...questions, ...bodyQs])]
        }
      } catch(_) {}
    }

    // Attempt 2: parse stored body text
    if (questions.length === 0 && email.body) {
      questions = parseQuestionsFromBody(email.body)
      log.push({ emailId: emailLogId, source: 'body_text', count: questions.length })
    }

    // Insert new questions
    for (const q of questions) {
      const trimmed = q.trim()
      if (!trimmed || trimmed.length < 10) continue
      const existing = await db.prepare('SELECT id FROM questions WHERE question=? AND rfp_id=?').bind(trimmed, rfpId).first()
      if (!existing) {
        await db.prepare(`
          INSERT INTO questions (rfp_id, question, vendor_id, published, source, email_log_id, created_at)
          VALUES (?,?,?,0,'email',?,datetime('now'))
        `).bind(rfpId, trimmed, vendorId, emailLogId).run()
        totalNew++
      }
    }
  }

  return c.json({ ok: true, totalNew, processedEmails: receivedEmails.length, log })
})

// GET /inbound-status — returns unread inbound count across all RFPs (for polling)
apiRouter.get('/inbound-status', async (c) => {
  try {
    const result = await c.env.DB.prepare(`
      SELECT COUNT(*) as cnt FROM email_log WHERE status='received' AND created_at > datetime('now', '-1 hour')
    `).first<{cnt:number}>()
    return c.json({ recentInbound: result?.cnt || 0 })
  } catch {
    return c.json({ recentInbound: 0 })
  }
})

// ============================================================
// DEBUG — clear simulated invitation records so real send can retry
// POST /api/debug/clear-simulated-invitations  (no auth — internal use)
// ============================================================
apiRouter.post('/debug/clear-simulated-invitations', async (c) => {
  try {
    const { results: deleted } = await c.env.DB.prepare(`
      SELECT id, vendor_id, rfp_id, status FROM email_log
      WHERE email_type='invitation' AND status='simulated'
    `).all<any>()
    await c.env.DB.prepare(`
      DELETE FROM email_log WHERE email_type='invitation' AND status='simulated'
    `).run()
    return c.json({ ok: true, deletedCount: deleted.length, deletedRecords: deleted })
  } catch(e: any) {
    return c.json({ ok: false, error: e.message }, 500)
  }
})

// GET /api/debug/email-log — show recent email_log rows (for diagnosis)
apiRouter.get('/debug/email-log', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT e.id, e.rfp_id, e.vendor_id, v.name as vendor_name, e.email_type, e.status,
             e.recipient, e.created_at, e.resend_email_id
      FROM email_log e
      LEFT JOIN vendors v ON e.vendor_id = v.id
      ORDER BY e.id DESC LIMIT 50
    `).all()
    return c.json(results)
  } catch(e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// ============================================================
// PROPOSALS
// ============================================================
apiRouter.get('/rfps/:id/proposals', async (c) => {
  const rfpId = c.req.param('id')
  const { results } = await c.env.DB.prepare(`
    SELECT p.*, v.name as vendor_name FROM proposals p
    LEFT JOIN vendors v ON p.vendor_id = v.id
    WHERE p.rfp_id=? ORDER BY p.id DESC
  `).bind(rfpId).all<any>()

  // Resolve r2:// URIs to Worker-served PDF URLs so the frontend gets a usable link
  const base = new URL(c.req.url).origin
  const resolved = results.map((p: any) => {
    let updated = { ...p }

    // Resolve primary PDF r2:// URI
    if (p.pdf_attachment_url?.startsWith('r2://')) {
      const r2Key = p.pdf_attachment_url.slice(5)
      updated.pdf_attachment_url = `${base}/api/proposals/pdf/${encodeURIComponent(r2Key)}`
    }

    // Resolve r2:// URIs inside proposal_attachments JSON array
    if (p.proposal_attachments) {
      try {
        const attachArr = JSON.parse(p.proposal_attachments) as any[]
        updated.proposal_attachments = JSON.stringify(
          attachArr.map((a: any) => ({
            ...a,
            url: a.r2_key ? `${base}/api/proposals/pdf/${encodeURIComponent(a.r2_key)}` : null,
          }))
        )
      } catch(_) { /* malformed JSON — leave as-is */ }
    }

    return updated
  })
  return c.json(resolved)
})

// ── Serve a proposal PDF directly from R2 ──────────────────────────────────
// GET /api/proposals/pdf/:key  (key is URL-encoded R2 object key)
// Used by frontend to display/download PDFs that are too large for D1 base64.
apiRouter.get('/proposals/pdf/:key{.+}', async (c) => {
  const r2Key = decodeURIComponent(c.req.param('key'))
  const bucket: R2Bucket | undefined = (c.env as any).PROPOSALS_BUCKET
  if (!bucket) return c.text('R2 storage not configured', 503)

  const obj = await bucket.get(r2Key)
  if (!obj) return c.text('PDF not found', 404)

  const contentType = obj.httpMetadata?.contentType || 'application/pdf'
  const filename = r2Key.split('/').pop() || 'proposal.pdf'

  return new Response(obj.body, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `inline; filename="${filename}"`,
      'Cache-Control': 'private, max-age=3600',
      'Access-Control-Allow-Origin': '*',
    },
  })
})

// ── Admin: Upload a PDF directly to R2 for a proposal (accepts raw binary body) ──
// PUT /api/rfps/:rfpId/proposals/:proposalId/upload-pdf
// Body: raw PDF bytes (Content-Type: application/pdf)
// Used by the sandbox script to upload local PDFs to R2 without going through Resend.
apiRouter.put('/rfps/:rfpId/proposals/:proposalId/upload-pdf', async (c) => {
  const rfpId = Number(c.req.param('rfpId'))
  const proposalId = Number(c.req.param('proposalId'))

  const bucket: R2Bucket | undefined = (c.env as any).PROPOSALS_BUCKET
  if (!bucket) return c.json({ error: 'R2 storage not configured' }, 503)

  const proposal = await c.env.DB.prepare(
    `SELECT p.*, v.name as vendor_name FROM proposals p LEFT JOIN vendors v ON p.vendor_id=v.id WHERE p.id=? AND p.rfp_id=?`
  ).bind(proposalId, rfpId).first<any>()
  if (!proposal) return c.json({ error: 'Proposal not found' }, 404)

  const rawBody = await c.req.arrayBuffer()
  const rawBytes = new Uint8Array(rawBody)
  if (rawBytes.length < 100) return c.json({ error: 'Empty or invalid PDF body' }, 400)

  const pdfFilename = c.req.header('X-Filename') || proposal.pdf_filename || 'proposal.pdf'
  const safeVendorName = (proposal.vendor_name || 'vendor').replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,40)
  const r2Key = `proposals/${rfpId}/${proposal.vendor_id}_${safeVendorName}_${Date.now()}.pdf`

  await bucket.put(r2Key, rawBytes, {
    httpMetadata: { contentType: 'application/pdf' },
    customMetadata: { rfpId: String(rfpId), vendorId: String(proposal.vendor_id), filename: pdfFilename },
  })

  // Update D1 with the new R2 key
  await c.env.DB.prepare(`UPDATE proposals SET pdf_attachment_url=?, pdf_filename=? WHERE id=?`)
    .bind(`r2://${r2Key}`, pdfFilename, proposalId).run()

  return c.json({ ok: true, r2_key: r2Key, bytes: rawBytes.length })
})

// ── Admin: Re-run LLM field extraction + evaluation using pre-extracted text ──
// POST /api/rfps/:rfpId/proposals/:proposalId/reprocess-from-text
// Body: { pdf_text: string, email_body?: string }
// Used when PDF text has been extracted externally (e.g. via pdfminer in sandbox).
apiRouter.post('/rfps/:rfpId/proposals/:proposalId/reprocess-from-text', async (c) => {
  const rfpId = Number(c.req.param('rfpId'))
  const proposalId = Number(c.req.param('proposalId'))

  const body = await c.req.json() as { pdf_text: string, email_body?: string }
  const pdfText = (body.pdf_text || '').slice(0, 60000)
  if (!pdfText || pdfText.length < 50) {
    return c.json({ error: 'pdf_text is required and must be at least 50 chars' }, 400)
  }

  const proposal = await c.env.DB.prepare(
    `SELECT p.*, v.name as vendor_name, v.contact_email FROM proposals p LEFT JOIN vendors v ON p.vendor_id=v.id WHERE p.id=? AND p.rfp_id=?`
  ).bind(proposalId, rfpId).first<any>()
  if (!proposal) return c.json({ error: 'Proposal not found' }, 404)

  const rfp = await c.env.DB.prepare(`SELECT * FROM rfps WHERE id=?`).bind(rfpId).first<any>()
  const emailBody = body.email_body || ''
  const rfpTitle = rfp?.title || 'RFP'

  // Run LLM field extraction with the provided text
  let fields: any = {}
  try {
    fields = await extractProposalFieldsWithLLM(pdfText, emailBody, proposal.vendor_name || 'Vendor', rfpTitle, c.env)
  } catch(llmErr: any) {
    console.error(`[reprocess-from-text] LLM failed: ${llmErr?.message}`)
    fields = { executive_summary: '', key_strengths: '', budget_amount: null, budget_currency: 'AED', timeline_months: null, technical_proposal: pdfText.slice(0, 8000) }
  }

  const proposedDuration = extractProposedDuration(pdfText + '\n' + emailBody)

  // Update proposal in D1 with extracted fields
  await c.env.DB.prepare(`
    UPDATE proposals SET
      executive_summary=?, key_strengths=?,
      budget_amount=?, budget_currency=?, timeline_months=?,
      technical_proposal=?, proposed_duration=?
    WHERE id=?
  `).bind(
    fields.executive_summary, fields.key_strengths,
    fields.budget_amount, fields.budget_currency, fields.timeline_months,
    fields.technical_proposal, proposedDuration || proposal.proposed_duration,
    proposalId
  ).run()

  // Re-run AI evaluation for all real submissions (any vendor with actual proposal text)
  let evaluation: any = null
  const isAndersen = proposal.contact_email?.includes('andersenlab.com') || proposal.vendor_name?.toLowerCase().includes('andersen')
  const isEPAM2 = proposal.vendor_name?.includes('EPAM')
  if (fields.technical_proposal && fields.technical_proposal.length > 200) {
    try {
      const updatedProposal = {
        ...proposal,
        technical_proposal: fields.technical_proposal,
        budget_amount: fields.budget_amount,
        timeline_months: fields.timeline_months,
        proposed_duration: proposedDuration || proposal.proposed_duration,
      }
      const evalResult = await evaluateAndersenWithLLM(updatedProposal, rfp, c.env)
      // Derive total from criteria weighted sum for display consistency
      const total = evalResult.scoringDetails && evalResult.scoringDetails.length > 0
        ? Math.round(evalResult.scoringDetails.reduce((s: number, c: any) => s + (c.weighted !== undefined ? Number(c.weighted) : Number(c.weight || 0) * Number(c.score || 0) / 100), 0))
        : Math.round(evalResult.scores.business * 0.30 + evalResult.scores.technical * 0.40 + evalResult.scores.financial * 0.30)
      await c.env.DB.prepare('DELETE FROM evaluations WHERE proposal_id=?').bind(proposalId).run()
      await c.env.DB.prepare(`
        INSERT INTO evaluations (rfp_id, proposal_id, vendor_id, business_score, technical_score, financial_score, experience_score, total_score, ai_summary, scoring_details_json, is_real, created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
      `).bind(
        rfpId, proposalId, proposal.vendor_id,
        evalResult.scores.business, evalResult.scores.technical,
        evalResult.scores.financial, evalResult.scores.experience,
        total, evalResult.summary, JSON.stringify(evalResult.scoringDetails), 1
      ).run()
      evaluation = { total_score: total, summary: evalResult.summary }
    } catch(evalErr: any) {
      console.error(`[reprocess-from-text] Evaluation failed: ${evalErr?.message}`)
    }
  }

  return c.json({
    ok: true,
    text_chars: pdfText.length,
    extracted_fields: {
      executive_summary: (fields.executive_summary || '').slice(0, 150) + '...',
      budget_amount: fields.budget_amount,
      budget_currency: fields.budget_currency,
      timeline_months: fields.timeline_months,
      technical_proposal_chars: (fields.technical_proposal || '').length,
    },
    evaluation: evaluation ? { total_score: evaluation.total_score, summary: (evaluation.summary || '').slice(0, 200) } : null,
  })
})

// ── Re-process from R2: fetch all stored attachments from R2, re-extract with vision, re-evaluate ──
// POST /api/rfps/:rfpId/proposals/:proposalId/reprocess-from-r2
// Vision LLM calls take 15-60s — WAY over the 30ms CPU sync limit.
// Solution: validate sync, return 202 immediately, run all heavy work in ctx.waitUntil().
apiRouter.post('/rfps/:rfpId/proposals/:proposalId/reprocess-from-r2', async (c) => {
  const rfpId = Number(c.req.param('rfpId'))
  const proposalId = Number(c.req.param('proposalId'))
  const db = c.env.DB as D1Database
  const bucket: R2Bucket | undefined = (c.env as any).PROPOSALS_BUCKET

  // Sync validation only — no LLM calls here
  const proposal = await db.prepare(
    `SELECT p.*, v.name as vendor_name, v.contact_email FROM proposals p LEFT JOIN vendors v ON p.vendor_id=v.id WHERE p.id=? AND p.rfp_id=?`
  ).bind(proposalId, rfpId).first<any>()
  if (!proposal) return c.json({ error: 'Proposal not found' }, 404)

  const rfp = await db.prepare(`SELECT * FROM rfps WHERE id=?`).bind(rfpId).first<any>()
  if (!rfp) return c.json({ error: 'RFP not found' }, 404)

  if (!bucket) return c.json({ error: 'PROPOSALS_BUCKET binding missing' }, 500)

  const attachments: any[] = JSON.parse(proposal.proposal_attachments || '[]')
  if (attachments.length === 0) return c.json({ error: 'No attachments stored for this proposal' }, 404)

  // Mark proposal as "reprocessing" so the UI can show a spinner
  await db.prepare(`UPDATE proposals SET key_strengths='⏳ Vision extraction in progress…', updated_at=datetime('now') WHERE id=?`)
    .bind(proposalId).run().catch(() => {})

  // Fire all heavy work (vision LLM + evaluation) in the background — no CPU time limit
  const executionCtx = (c as any).executionCtx
  const bgWorkerBaseUrl = (() => { try { const u = new URL(c.req.url); return `${u.protocol}//${u.host}` } catch { return '' } })()
  const backgroundWork = doReprocessFromR2(rfpId, proposalId, proposal, rfp, attachments, bucket, db, c.env, bgWorkerBaseUrl)
  if (executionCtx?.waitUntil) {
    executionCtx.waitUntil(backgroundWork)
  } else {
    // No ctx available (e.g. local dev) — run inline and wait
    await backgroundWork
  }

  return c.json({
    ok: true,
    status: 'processing',
    proposal_id: proposalId,
    attachments_queued: attachments.filter((a: any) => !!a.r2_key).length,
    message: 'Vision extraction started in background. Poll GET /reprocess-from-r2/status in ~30-60s.',
  })
})

// GET /api/rfps/:rfpId/proposals/:proposalId/reprocess-from-r2/status — poll reprocess progress
apiRouter.get('/rfps/:rfpId/proposals/:proposalId/reprocess-from-r2/status', async (c) => {
  const proposalId = Number(c.req.param('proposalId'))
  const rfpId = Number(c.req.param('rfpId'))
  const db = c.env.DB as D1Database

  const proposal = await db.prepare(
    `SELECT id, technical_proposal, key_strengths, executive_summary, budget_amount, timeline_months, proposal_attachments FROM proposals WHERE id=? AND rfp_id=?`
  ).bind(proposalId, rfpId).first<any>()
  if (!proposal) return c.json({ error: 'Proposal not found' }, 404)

  const ev = await db.prepare(
    `SELECT total_score, is_real, ai_summary FROM evaluations WHERE proposal_id=? ORDER BY id DESC LIMIT 1`
  ).bind(proposalId).first<any>()

  const atts: any[] = JSON.parse(proposal.proposal_attachments || '[]')
  const hasText = proposal.technical_proposal && proposal.technical_proposal.length > 50
  const isWrongDoc = proposal.technical_proposal?.startsWith('[WRONG DOCUMENT DETECTED]')
  const stillProcessing = !hasText && (proposal.key_strengths || '').includes('⏳')

  return c.json({
    proposal_id: proposalId,
    status: stillProcessing ? 'processing' : (hasText ? 'done' : 'failed'),
    text_chars: proposal.technical_proposal?.length ?? 0,
    is_wrong_document: isWrongDoc ?? false,
    attachments: atts.map((a: any) => ({
      filename: a.filename,
      text_chars: a.text_chars ?? 0,
      extract_method: a.extract_method ?? null,
      wrong_document: a.wrong_document ?? null,
    })),
    evaluation: ev ? {
      total_score: ev.total_score,
      is_real: ev.is_real,
      summary_preview: (ev.ai_summary || '').slice(0, 300),
    } : null,
  })
})

// ── Synchronous reprocess endpoint ───────────────────────────────────────────────────────────────
// POST /api/rfps/:rfpId/proposals/:proposalId/reprocess-sync
//
// Processes all attachments inline (no sub-requests, no self-fetch) to avoid Cloudflare's
// loopback block (error 522). For each attachment:
//   - Large files (> 2MB): stream R2 body directly to Genspark blob upload → crawler
//     (avoids arrayBuffer() memory spike for 13MB/25MB files)
//   - Small files (<= 2MB): text-layer extraction → Genspark crawler fallback (upload mode)
// After all attachments are processed, runs LLM field extraction + AI evaluation once.
// Returns the final evaluation result. Client makes a single call.
apiRouter.post('/rfps/:rfpId/proposals/:proposalId/reprocess-sync', async (c) => {
  const rfpId = Number(c.req.param('rfpId'))
  const proposalId = Number(c.req.param('proposalId'))
  const db = c.env.DB as D1Database
  const bucket: R2Bucket | undefined = (c.env as any).PROPOSALS_BUCKET

  const proposal = await db.prepare(
    `SELECT p.*, v.name as vendor_name, v.contact_email FROM proposals p LEFT JOIN vendors v ON p.vendor_id=v.id WHERE p.id=? AND p.rfp_id=?`
  ).bind(proposalId, rfpId).first<any>()
  if (!proposal) return c.json({ error: 'Proposal not found' }, 404)

  const rfp = await db.prepare(`SELECT * FROM rfps WHERE id=?`).bind(rfpId).first<any>()
  if (!rfp) return c.json({ error: 'RFP not found' }, 404)

  if (!bucket) return c.json({ error: 'PROPOSALS_BUCKET binding missing' }, 500)

  const attachments: any[] = JSON.parse(proposal.proposal_attachments || '[]')
  if (attachments.length === 0) return c.json({ error: 'No attachments stored for this proposal' }, 404)

  console.log(`[reprocess-sync] Starting for proposal #${proposalId} (${proposal.vendor_name}), ${attachments.length} attachment(s)`)

  // Mark as processing
  await db.prepare(`UPDATE proposals SET key_strengths='⏳ Re-extracting proposal text…', updated_at=datetime('now') WHERE id=?`)
    .bind(proposalId).run().catch(() => {})

  // ── INLINE ATTACHMENT PROCESSING ─────────────────────────────────────────
  // Process each attachment directly — no self-fetch, no sub-requests.
  // Large files (> 2MB) stream their R2 body to Genspark blob upload to avoid
  // loading the entire file into Worker memory (would exceed CPU time limit).
  const SIZE_THRESHOLD = 2 * 1024 * 1024  // 2 MB
  const singleFileResults: any[] = []
  const updatedAttachments: any[] = [...attachments]

  for (let i = 0; i < attachments.length; i++) {
    const att = attachments[i]
    if (!att.r2_key) {
      console.log(`[reprocess-sync] Attachment ${i} (${att.filename}) has no r2_key — skipping`)
      singleFileResults.push({ attachment_index: i, skipped: true, filename: att.filename })
      continue
    }

    console.log(`[reprocess-sync] Processing attachment ${i}: ${att.filename} (${att.size_bytes ?? '?'} bytes)`)
    let resultAtt: any = { ...att }

    try {
      const fileSize = att.size_bytes ?? 0
      const useLargeFileStrategy = fileSize > SIZE_THRESHOLD

      if (useLargeFileStrategy) {
        // Large file: stream R2 body to Genspark blob → crawler.
        // bucket.get() returns R2ObjectBody whose .body is a ReadableStream.
        // We pass that stream to the blob PUT — no arrayBuffer() in Worker memory.
        console.log(`[reprocess-sync] Attachment ${i}: large file (${fileSize} bytes) — streaming to Genspark blob`)
        const obj = await bucket.get(att.r2_key)
        if (!obj) {
          resultAtt = { ...att, error: 'R2 object not found' }
        } else {
          // Stream R2 body to Genspark blob, then call crawler on the resulting URL.
          // NOTE: we do NOT run filename-based wrong-doc detection here — vendors
          // often name files after the client/project ("Crown Prince Court - Data platform.pdf")
          // which triggers false positives. Content-based detection runs after extraction.
          const extracted = await extractPdfViaGenskarkCrawlerStreaming(obj, att.filename, c.env)
          console.log(`[reprocess-sync] Attachment ${i}: crawler returned ${extracted.length} chars`)

          if (extracted.length >= 100) {
            const wrongDocContent = await detectWrongDocument(
              extracted, att.filename, proposal.vendor_name || 'Vendor',
              rfp.ref_number || '', rfp.title || '', c.env
            )
            if (wrongDocContent.isWrong) {
              resultAtt = {
                ...att, text_chars: extracted.length, extract_method: 'vision',
                wrong_document: wrongDocContent.reason,
                _marked_text: `[WRONG DOCUMENT DETECTED]\nFile: ${att.filename}\nDetected type: ${wrongDocContent.detectedDocType}\n\n${wrongDocContent.reason}\n\n[EXTRACTED CONTENT FOR REFERENCE]\n${extracted}`,
              }
            } else {
              resultAtt = { ...att, text_chars: extracted.length, extract_method: 'vision', extracted_text: extracted }
            }
          } else {
            // Crawler returned little/no text (image-only PDF or encrypted) — store with 0 chars
            console.warn(`[reprocess-sync] Attachment ${i}: crawler returned too little text (${extracted.length} chars) — likely image-only/scanned`)
            resultAtt = { ...att, text_chars: extracted.length, extract_method: 'vision', extracted_text: extracted }
          }
        }
      } else {
        // Small file: load bytes → text-layer extraction → crawler fallback
        const obj = await bucket.get(att.r2_key)
        if (!obj) {
          resultAtt = { ...att, error: 'R2 object not found' }
        } else {
          const rawBytes = new Uint8Array(await obj.arrayBuffer())
          console.log(`[reprocess-sync] Attachment ${i}: small file — fetched ${rawBytes.length} bytes`)

          const { text: extracted, method: exMethod, rawGarbage } = await extractPdfTextSmart(
            rawBytes, att.filename, c.env
          )
          console.log(`[reprocess-sync] Attachment ${i}: extracted ${extracted.length} chars via ${exMethod}`)

          const textForDetection = extracted.length >= 100 ? extracted : (rawGarbage || '')
          const wrongDoc = await detectWrongDocument(
            textForDetection, att.filename, proposal.vendor_name || 'Vendor',
            rfp.ref_number || '', rfp.title || '', c.env
          )

          if (wrongDoc.isWrong) {
            resultAtt = {
              ...att, text_chars: extracted.length, extract_method: exMethod,
              wrong_document: wrongDoc.reason,
              _marked_text: `[WRONG DOCUMENT DETECTED]\nFile: ${att.filename}\nDetected type: ${wrongDoc.detectedDocType}\n\n${wrongDoc.reason}\n\n[EXTRACTED CONTENT FOR REFERENCE]\n${extracted || '(no readable text extracted)'}`,
            }
          } else {
            resultAtt = { ...att, text_chars: extracted.length, extract_method: exMethod, extracted_text: extracted }
          }
        }
      }
    } catch (e: any) {
      console.error(`[reprocess-sync] Attachment ${i} error: ${e?.message}`)
      resultAtt = { ...att, error: e?.message }
    }

    updatedAttachments[i] = resultAtt
    singleFileResults.push({
      attachment_index: i,
      filename: att.filename,
      method: resultAtt.extract_method ?? null,
      chars: resultAtt.text_chars ?? 0,
      wrong_document: resultAtt.wrong_document ?? null,
      error: resultAtt.error ?? null,
    })
  }


  // Build combined text from all successful, non-wrong-document attachments
  const allExtractedTexts: string[] = []
  const wrongDocAtts: any[] = []

  for (const att of updatedAttachments) {
    if (att.wrong_document) {
      wrongDocAtts.push(att)
    } else if (att.extracted_text && att.extracted_text.length >= 100) {
      allExtractedTexts.push(`[${(att.label || 'TECHNICAL').toUpperCase()} DOCUMENT: ${att.filename}]\n${att.extracted_text}`)
    } else if (att.text_chars && att.text_chars >= 100 && !att.wrong_document && !att.error) {
      // text_chars set but extracted_text not in attachment (old format) — re-read from attachment
      // This shouldn't happen with new code but handle gracefully
      console.warn(`[reprocess-sync] Attachment ${att.filename} has text_chars=${att.text_chars} but no extracted_text field`)
    }
  }

  const allWrong = wrongDocAtts.length > 0 && allExtractedTexts.length === 0

  let technicalProposalText = ''
  let executiveSummary: string | null = null
  let keyStrengths: string | null = null
  let budgetAmount: number | null = null
  let budgetCurrency = 'AED'
  let timelineMonths: number | null = null
  let proposedDuration: string | null = null

  if (allWrong) {
    const wrongReasons = wrongDocAtts.map((a: any) => `File: ${a.filename}\nReason: ${a.wrong_document}`).join('\n\n')
    technicalProposalText = `[WRONG DOCUMENT DETECTED]\n${wrongReasons}\n\n[NO VALID PROPOSAL CONTENT EXTRACTED]`
    executiveSummary = `Wrong document submitted. ${wrongDocAtts[0]?.wrong_document?.split('.')[0] || 'No valid proposal was submitted.'}`
    keyStrengths = `⚠ Wrong document detected. This vendor did not submit a valid proposal for this RFP.`
    console.log(`[reprocess-sync] All attachments are wrong documents — will score 0`)
  } else if (allExtractedTexts.length > 0) {
    technicalProposalText = allExtractedTexts.join('\n\n')
    if (wrongDocAtts.length > 0) {
      const warnList = wrongDocAtts.map((a: any) => `• ${a.filename}`).join('\n')
      technicalProposalText += `\n\n⚠ NOTE: The following file(s) were identified as wrong documents and excluded:\n${warnList}`
    }
    try {
      const fields = await extractProposalFieldsWithLLM(technicalProposalText, '', proposal.vendor_name || 'Vendor', rfp.title || 'RFP', c.env)
      executiveSummary = fields.executive_summary || null
      keyStrengths = fields.key_strengths || null
      budgetAmount = fields.budget_amount || null
      budgetCurrency = fields.budget_currency || 'AED'
      timelineMonths = fields.timeline_months || null
      proposedDuration = fields.proposed_duration || extractProposedDuration(technicalProposalText) || null
    } catch (e: any) {
      console.error(`[reprocess-sync] Field extraction failed: ${e?.message}`)
      keyStrengths = '⚠ Could not extract proposal fields from the submitted documents.'
    }
  } else {
    technicalProposalText = ''
    keyStrengths = '⚠ Could not read any text from the submitted files. The PDFs may use unsupported fonts or be image-only.'
  }

  // Strip temporary fields (extracted_text, _marked_text) before final save
  const cleanAttachments = updatedAttachments.map(({ extracted_text, _marked_text, ...rest }: any) => rest)

  // Final DB save — technical_proposal + all fields
  await db.prepare(`
    UPDATE proposals SET
      technical_proposal=?, executive_summary=?, key_strengths=?,
      budget_amount=?, budget_currency=?, timeline_months=?, proposed_duration=?,
      proposal_attachments=?, updated_at=datetime('now')
    WHERE id=?
  `).bind(
    technicalProposalText || null,
    executiveSummary, keyStrengths,
    budgetAmount, budgetCurrency, timelineMonths, proposedDuration,
    JSON.stringify(cleanAttachments),
    proposalId
  ).run()

  console.log(`[reprocess-sync] DB updated. Running evaluation for proposal #${proposalId}`)

  // Re-fetch the updated proposal row (with new technical_proposal) for evaluation
  const proposalForEval = await db.prepare(
    `SELECT p.*, v.name as vendor_name FROM proposals p LEFT JOIN vendors v ON p.vendor_id=v.id WHERE p.id=?`
  ).bind(proposalId).first<any>()

  let evalRow: any = null
  try {
    await runSingleEvaluation(proposalForEval, rfp, rfpId, c.env)
    evalRow = await db.prepare(
      `SELECT total_score, is_real, ai_summary FROM evaluations WHERE proposal_id=? ORDER BY id DESC LIMIT 1`
    ).bind(proposalId).first<any>()
    console.log(`[reprocess-sync] Evaluation complete: score=${evalRow?.total_score ?? 'n/a'}, is_real=${evalRow?.is_real}`)
  } catch (e: any) {
    console.error(`[reprocess-sync] Evaluation failed: ${e?.message}`)
  }

  return c.json({
    ok: true,
    proposal_id: proposalId,
    vendor_name: proposal.vendor_name,
    extraction: {
      attachments_processed: cleanAttachments.length,
      total_chars: technicalProposalText.length,
      is_wrong_document: allWrong,
      methods: singleFileResults.map((r: any) => ({
        filename: r.filename,
        method: r.method ?? null,
        chars: r.chars ?? 0,
        wrong: !!(r.wrong_document),
        error: r.error ?? null,
      })),
      text_preview: technicalProposalText.slice(0, 300),
    },
    evaluation: evalRow ? {
      total_score: evalRow.total_score,
      is_real: evalRow.is_real,
      summary: (evalRow.ai_summary || '').slice(0, 500),
    } : null,
  })
})

// ── Diagnostic: vision-test endpoint ─────────────────────────────────────────────────────────────
// GET /api/rfps/:rfpId/proposals/:proposalId/vision-test
// Fetches the first R2 attachment, calls the vision API, and returns the FULL HTTP status + body
// so we can see exactly what error (if any) the Worker gets when calling the LLM proxy.
apiRouter.get('/rfps/:rfpId/proposals/:proposalId/vision-test', async (c) => {
  const proposalId = Number(c.req.param('proposalId'))
  const db = c.env.DB as D1Database
  const bucket: R2Bucket | undefined = (c.env as any).PROPOSALS_BUCKET
  const apiKey = (c.env as any).OPENAI_API_KEY || ''
  const baseUrl = (c.env as any).OPENAI_BASE_URL || 'https://www.genspark.ai/api/llm_proxy/v1'

  const proposal = await db.prepare(
    `SELECT p.proposal_attachments, v.name as vendor_name FROM proposals p LEFT JOIN vendors v ON p.vendor_id=v.id WHERE p.id=?`
  ).bind(proposalId).first<any>()
  if (!proposal) return c.json({ error: 'Proposal not found' }, 404)

  const atts: any[] = JSON.parse(proposal.proposal_attachments || '[]')
  const firstAtt = atts.find((a: any) => a.r2_key)
  if (!firstAtt || !bucket) return c.json({ error: 'No R2 attachment or no bucket', atts }, 404)

  const obj = await bucket.get(firstAtt.r2_key)
  if (!obj) return c.json({ error: 'R2 object not found', r2_key: firstAtt.r2_key }, 404)
  const rawBytes = new Uint8Array(await obj.arrayBuffer())
  const base64Pdf = uint8ToBase64(rawBytes)

  // Run the text-layer extractor directly on this PDF
  const textLayerResult = await extractPdfText(rawBytes)
  const isGarbage = isPostScriptGarbage(textLayerResult)

  return c.json({
    vendor_name: proposal.vendor_name,
    attachment: { filename: firstAtt.filename, size_bytes: rawBytes.length, b64_chars: base64Pdf.length },
    api_key_prefix: apiKey ? (apiKey.slice(0, 8) + '...') : 'MISSING',
    text_layer: {
      chars: textLayerResult.length,
      is_garbage: isGarbage,
      preview: textLayerResult.slice(0, 500),
    },
    vision_api_conclusion: 'Genspark proxy does not forward PDF bytes to Claude. prompt_tokens=3 on all document-type calls confirms proxy strips the PDF. Vision-based extraction is not available via this proxy.',
  })
})

// ── Background worker: all vision/LLM processing for reprocess-from-r2 ──────────────────────────
// Runs inside ctx.waitUntil() — no 30ms CPU limit, runs to completion after response is sent.
async function doReprocessFromR2(
  rfpId: number,
  proposalId: number,
  proposal: any,
  rfp: any,
  attachments: any[],
  bucket: R2Bucket,
  db: D1Database,
  env: any,
  workerBaseUrl?: string
): Promise<void> {
  console.log(`[reprocess-r2-bg] Starting background vision extraction for proposal #${proposalId}, workerBaseUrl=${workerBaseUrl || 'unknown'}`)

  const allExtractedTexts: string[] = []
  const updatedAttachments: any[] = []

  for (const att of attachments) {
    if (!att.r2_key) {
      updatedAttachments.push(att)
      continue
    }
    try {
      const obj = await bucket.get(att.r2_key)
      if (!obj) {
        console.warn(`[reprocess-r2-bg] R2 object not found: ${att.r2_key}`)
        updatedAttachments.push({ ...att, error: 'R2 object not found' })
        continue
      }
      const rawBytes = new Uint8Array(await obj.arrayBuffer())
      console.log(`[reprocess-r2-bg] Fetched ${rawBytes.length} bytes for ${att.filename}`)

      // Extraction: text-layer first, then Genspark crawler fallback
      const { text: extracted, method: exMethod, rawGarbage } = await extractPdfTextSmart(
        rawBytes, att.filename, env,
        workerBaseUrl ? { r2Key: att.r2_key, workerBaseUrl } : undefined
      )
      console.log(`[reprocess-r2-bg] Extracted ${extracted.length} chars from ${att.filename} via ${exMethod}`)

      // Wrong-document detection — uses filename overlap even when text is empty
      const textForDetection = extracted.length >= 100 ? extracted : (rawGarbage || '')
      const wrongDoc = await detectWrongDocument(
        textForDetection, att.filename, proposal.vendor_name || 'Vendor',
        rfp.ref_number || '', rfp.title || '', env
      )
      if (wrongDoc.isWrong) {
        const wrongDocReason = wrongDoc.reason
        const markedText = `[WRONG DOCUMENT DETECTED]\nFile: ${att.filename}\nDetected type: ${wrongDoc.detectedDocType}\n\n${wrongDoc.reason}\n\n[EXTRACTED CONTENT FOR REFERENCE]\n${extracted || '(no readable text extracted)'}`
        // For wrong docs we don't add to allExtractedTexts — they contaminate the proposal
        console.warn(`[reprocess-r2-bg] Wrong document: ${att.filename} — ${wrongDoc.reason.slice(0, 120)}`)
        // Store the marked text in the slot (will be used to build technicalProposalText below)
        updatedAttachments.push({
          ...att,
          text_chars: extracted.length,
          extract_method: exMethod,
          wrong_document: wrongDocReason,
          _marked_text: markedText,   // temporary field, stripped before saving
        })
        continue
      }

      // Not a wrong document — add to extracted texts
      allExtractedTexts.push(`[${(att.label || 'TECHNICAL').toUpperCase()} DOCUMENT: ${att.filename}]\n${extracted}`)
      updatedAttachments.push({
        ...att,
        text_chars: extracted.length,
        extract_method: exMethod,
      })
    } catch (e: any) {
      console.error(`[reprocess-r2-bg] Error processing ${att.filename}: ${e?.message}`)
      updatedAttachments.push({ ...att, error: e?.message })
    }
  }

  // Build technical_proposal text
  const wrongDocAtts = updatedAttachments.filter((a: any) => a.wrong_document)
  const allWrong = wrongDocAtts.length > 0 && allExtractedTexts.length === 0

  let technicalProposalText = ''
  let executiveSummary: string | null = null
  let keyStrengths: string | null = null
  let budgetAmount: number | null = null
  let budgetCurrency = 'AED'
  let timelineMonths: number | null = null
  let proposedDuration: string | null = null

  if (allWrong) {
    // All submitted files are wrong documents — build the detection marker
    const wrongReasons = wrongDocAtts
      .map((a: any) => `File: ${a.filename}\nReason: ${a.wrong_document}`)
      .join('\n\n')
    technicalProposalText = `[WRONG DOCUMENT DETECTED]\n${wrongReasons}\n\n[NO VALID PROPOSAL CONTENT EXTRACTED]`
    executiveSummary = `Wrong document submitted. ${wrongDocAtts[0]?.wrong_document?.split('.')[0] || 'No valid proposal was submitted.'}`
    keyStrengths = `⚠ Wrong document detected. This vendor did not submit a valid proposal for this RFP.`
    console.log(`[reprocess-r2-bg] All attachments are wrong documents — scoring 0`)
  } else if (allExtractedTexts.length > 0) {
    // At least one valid proposal — build combined text and extract fields
    technicalProposalText = allExtractedTexts.join('\n\n')
    if (wrongDocAtts.length > 0) {
      const warnList = wrongDocAtts.map((a: any) => `• ${a.filename}`).join('\n')
      technicalProposalText += `\n\n⚠ NOTE: The following file(s) were identified as wrong documents and excluded:\n${warnList}`
    }
    try {
      const fields = await extractProposalFieldsWithLLM(
        technicalProposalText, '', proposal.vendor_name || 'Vendor', rfp.title || 'RFP', env
      )
      executiveSummary = fields.executive_summary || null
      keyStrengths = fields.key_strengths || null
      budgetAmount = fields.budget_amount || null
      budgetCurrency = fields.budget_currency || 'AED'
      timelineMonths = fields.timeline_months || null
      proposedDuration = fields.proposed_duration || extractProposedDuration(technicalProposalText) || null
      console.log(`[reprocess-r2-bg] Fields extracted: budget=${budgetAmount}, timeline=${timelineMonths}`)
    } catch (e: any) {
      console.error(`[reprocess-r2-bg] Field extraction failed: ${e?.message}`)
    }
  } else {
    // Vision returned nothing for all files
    technicalProposalText = ''
    keyStrengths = '⚠ Vision extraction could not read any text from the submitted files. Please re-upload a clearer PDF.'
    console.warn(`[reprocess-r2-bg] No text extracted from any attachment`)
  }

  // Strip the temporary _marked_text field before saving
  const cleanAttachments = updatedAttachments.map(({ _marked_text, ...rest }: any) => rest)

  // Persist to D1
  await db.prepare(`
    UPDATE proposals SET
      technical_proposal=?, executive_summary=?, key_strengths=?,
      budget_amount=?, budget_currency=?, timeline_months=?, proposed_duration=?,
      proposal_attachments=?, updated_at=datetime('now')
    WHERE id=?
  `).bind(
    technicalProposalText || null,
    executiveSummary, keyStrengths,
    budgetAmount, budgetCurrency, timelineMonths, proposedDuration,
    JSON.stringify(cleanAttachments),
    proposalId
  ).run()

  console.log(`[reprocess-r2-bg] Proposal #${proposalId} updated — ${technicalProposalText.length} chars, wrongDocs=${wrongDocAtts.length}`)

  // Re-run full evaluation
  try {
    const latestProposal = await db.prepare(`
      SELECT p.*, v.name as vendor_name, v.contact_email, v.erp_experience, v.certifications, v.specializations, v.size
      FROM proposals p LEFT JOIN vendors v ON p.vendor_id=v.id WHERE p.id=?
    `).bind(proposalId).first<any>()

    if (latestProposal) {
      await runSingleEvaluation(latestProposal, rfp, String(rfpId), env)
      const ev = await db.prepare('SELECT total_score FROM evaluations WHERE proposal_id=? ORDER BY id DESC LIMIT 1').bind(proposalId).first<any>()
      console.log(`[reprocess-r2-bg] Evaluation complete for #${proposalId}: score=${ev?.total_score}`)
    }
  } catch (e: any) {
    console.error(`[reprocess-r2-bg] Evaluation failed: ${e?.message}`)
  }
}

// ── Re-process a proposal PDF: re-fetch from Resend, upload to R2, re-extract + re-evaluate ──
// POST /api/rfps/:rfpId/proposals/:proposalId/reprocess
// Looks up resend_email_id from email_log, re-downloads the PDF attachment, stores it in R2,
// re-runs LLM field extraction (60k chars), updates D1, and triggers AI evaluation.
apiRouter.post('/rfps/:rfpId/proposals/:proposalId/reprocess', async (c) => {
  const rfpId = Number(c.req.param('rfpId'))
  const proposalId = Number(c.req.param('proposalId'))

  // 1. Load proposal
  const proposal = await c.env.DB.prepare(
    `SELECT p.*, v.name as vendor_name, v.contact_email FROM proposals p LEFT JOIN vendors v ON p.vendor_id=v.id WHERE p.id=? AND p.rfp_id=?`
  ).bind(proposalId, rfpId).first<any>()
  if (!proposal) return c.json({ error: 'Proposal not found' }, 404)

  // 2. Load RFP for LLM context
  const rfp = await c.env.DB.prepare(`SELECT * FROM rfps WHERE id=?`).bind(rfpId).first<any>()

  // 3. Find the email_log entry for this vendor+RFP to get resend_email_id
  const emailLog = await c.env.DB.prepare(
    `SELECT * FROM email_log WHERE rfp_id=? AND vendor_id=? AND email_category='proposal' ORDER BY id DESC LIMIT 1`
  ).bind(rfpId, proposal.vendor_id).first<any>()

  const resendEmailId = emailLog?.resend_email_id
  const apiKey = (c.env as any).RESEND_API_KEY || ''

  let rawBytes: Uint8Array | null = null
  let pdfFilename = proposal.pdf_filename || 'proposal.pdf'

  // 4. Attempt to re-fetch PDF from Resend API
  if (resendEmailId && apiKey) {
    try {
      console.log(`[reprocess] Fetching attachments for email ${resendEmailId}`)
      const attachListRes = await fetch(`https://api.resend.com/emails/receiving/${resendEmailId}/attachments`, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      })
      if (attachListRes.ok) {
        const attachList = await attachListRes.json() as any
        const allAttachData: any[] = attachList.data || []
        // Prefer PDF attachment
        const pdfAttach = allAttachData.find((a: any) => a.content_type?.includes('pdf') || a.filename?.match(/\.pdf$/i))
        const attachData = pdfAttach || allAttachData[0]
        if (attachData?.download_url) {
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), 55000) // 55s — max CF Worker lifetime
          try {
            const fileRes = await fetch(attachData.download_url, { signal: controller.signal })
            clearTimeout(timeoutId)
            if (fileRes.ok) {
              const buf = await fileRes.arrayBuffer()
              rawBytes = new Uint8Array(buf)
              pdfFilename = attachData.filename || proposal.pdf_filename || 'proposal.pdf'
              console.log(`[reprocess] Downloaded ${rawBytes.length} bytes from Resend`)
            } else {
              console.error(`[reprocess] Resend download failed: HTTP ${fileRes.status}`)
            }
          } catch(fetchErr: any) {
            clearTimeout(timeoutId)
            console.error(`[reprocess] Download error: ${fetchErr?.message}`)
          }
        }
      }
    } catch(err: any) {
      console.error(`[reprocess] Resend API error: ${err?.message}`)
    }
  }

  // 5. If Resend fetch failed, report error — cannot proceed without bytes
  if (!rawBytes || rawBytes.length === 0) {
    return c.json({
      error: 'Could not re-fetch PDF from Resend. The attachment may have expired.',
      hint: 'Resend attachment download URLs typically expire after 7 days. Upload the PDF manually via the admin panel.',
      resend_email_id: resendEmailId || null,
    }, 422)
  }

  // 6. Upload to R2
  let pdfR2Key = ''
  const bucket: R2Bucket | undefined = (c.env as any).PROPOSALS_BUCKET
  if (bucket) {
    const safeVendorName = (proposal.vendor_name || 'vendor').replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,40)
    pdfR2Key = `proposals/${rfpId}/${proposal.vendor_id}_${safeVendorName}_${Date.now()}.pdf`
    try {
      await bucket.put(pdfR2Key, rawBytes, {
        httpMetadata: { contentType: 'application/pdf' },
        customMetadata: { rfpId: String(rfpId), vendorId: String(proposal.vendor_id), filename: pdfFilename },
      })
      console.log(`[reprocess] PDF stored in R2: ${pdfR2Key} (${rawBytes.length} bytes)`)
    } catch(r2Err: any) {
      console.error(`[reprocess] R2 put failed: ${r2Err?.message}`)
      pdfR2Key = ''
    }
  }

  // 7. Extract full text
  const pdfText = await extractPdfText(rawBytes)
  console.log(`[reprocess] Extracted ${pdfText.length} chars from PDF`)

  // 8. Extract proposed duration
  const emailBody = emailLog?.body || ''
  const proposedDuration = extractProposedDuration(pdfText + '\n' + emailBody)

  // 9. LLM field extraction (60k chars)
  const rfpTitle = rfp?.title || 'RFP'
  let fields: any = {}
  try {
    fields = await extractProposalFieldsWithLLM(pdfText, emailBody, proposal.vendor_name || 'Vendor', rfpTitle, c.env)
    console.log(`[reprocess] LLM extracted fields: budget=${fields.budget_amount}, timeline=${fields.timeline_months}`)
  } catch(llmErr: any) {
    console.error(`[reprocess] LLM field extraction failed: ${llmErr?.message}`)
    fields = { executive_summary: '', key_strengths: '', budget_amount: null, budget_currency: 'AED', timeline_months: null, technical_proposal: pdfText.slice(0, 8000) }
  }

  // 10. Update D1 proposal record
  const pdfUrl = pdfR2Key ? `r2://${pdfR2Key}` : proposal.pdf_attachment_url
  await c.env.DB.prepare(`
    UPDATE proposals SET
      pdf_attachment_url=?, pdf_filename=?,
      executive_summary=?, key_strengths=?,
      budget_amount=?, budget_currency=?, timeline_months=?,
      technical_proposal=?, proposed_duration=?
    WHERE id=?
  `).bind(
    pdfUrl, pdfFilename,
    fields.executive_summary, fields.key_strengths,
    fields.budget_amount, fields.budget_currency, fields.timeline_months,
    fields.technical_proposal, proposedDuration || proposal.proposed_duration,
    proposalId
  ).run()

  // 11. Re-run AI evaluation for all real submissions with meaningful proposal text
  let evaluation: any = null
  const isAndersen = proposal.contact_email?.includes('andersenlab.com') || proposal.vendor_name?.toLowerCase().includes('andersen')
  if (fields.technical_proposal && fields.technical_proposal.length > 200) {
    try {
      // Build updated proposal object for evaluation
      const updatedProposal = {
        ...proposal,
        technical_proposal: fields.technical_proposal,
        budget_amount: fields.budget_amount,
        timeline_months: fields.timeline_months,
        proposed_duration: proposedDuration || proposal.proposed_duration,
      }
      const evalResult = await evaluateAndersenWithLLM(updatedProposal, rfp, c.env)

      // Derive total from criteria weighted sum for display consistency
      const total = evalResult.scoringDetails && evalResult.scoringDetails.length > 0
        ? Math.round(evalResult.scoringDetails.reduce((s: number, c: any) => s + (c.weighted !== undefined ? Number(c.weighted) : Number(c.weight || 0) * Number(c.score || 0) / 100), 0))
        : Math.round(evalResult.scores.business * 0.30 + evalResult.scores.technical * 0.40 + evalResult.scores.financial * 0.30)

      // Delete existing evaluation for this proposal and re-insert
      await c.env.DB.prepare('DELETE FROM evaluations WHERE proposal_id=?').bind(proposalId).run()
      await c.env.DB.prepare(`
        INSERT INTO evaluations (rfp_id, proposal_id, vendor_id, business_score, technical_score, financial_score, experience_score, total_score, ai_summary, scoring_details_json, is_real, created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
      `).bind(
        rfpId, proposalId, proposal.vendor_id,
        evalResult.scores.business, evalResult.scores.technical,
        evalResult.scores.financial, evalResult.scores.experience,
        total, evalResult.summary, JSON.stringify(evalResult.scoringDetails), 1
      ).run()

      evaluation = { total_score: total, summary: evalResult.summary }
      console.log(`[reprocess] Re-evaluated ${proposal.vendor_name}: total=${total}`)
    } catch(evalErr: any) {
      console.error(`[reprocess] Re-evaluation failed: ${evalErr?.message}`)
    }
  }

  return c.json({
    ok: true,
    proposal_id: proposalId,
    pdf_bytes: rawBytes.length,
    r2_key: pdfR2Key || null,
    text_chars: pdfText.length,
    extracted_fields: {
      executive_summary: (fields.executive_summary || '').slice(0, 100) + '...',
      budget_amount: fields.budget_amount,
      budget_currency: fields.budget_currency,
      timeline_months: fields.timeline_months,
    },
    evaluation: evaluation ? { total_score: evaluation.total_score } : null,
  })
})

apiRouter.post('/rfps/:id/proposals/sample', async (c) => {
  const rfpId = c.req.param('id')
  const { results: shortlisted } = await c.env.DB.prepare(`
    SELECT v.* FROM vendors v
    JOIN rfp_vendors rv ON v.id = rv.vendor_id AND rv.rfp_id=? AND rv.shortlisted=1 LIMIT 8
  `).bind(rfpId).all<any>()
  const targets = shortlisted.length > 0 ? shortlisted : (await c.env.DB.prepare('SELECT * FROM vendors LIMIT 8').all<any>()).results

  for (const v of targets) {
    const already = await c.env.DB.prepare('SELECT id FROM proposals WHERE vendor_id=? AND rfp_id=?').bind(v.id, rfpId).first()
    if (already) continue
    const isAndersen = v.contact_email?.includes('andersenlab.com')
    const isEPAM = v.name?.includes('EPAM')
    const proposal = buildVendorProposal(v, isAndersen, isEPAM)
    await c.env.DB.prepare(`
      INSERT INTO proposals (rfp_id, vendor_id, technical_proposal, financial_proposal, status, is_real_submission, created_at)
      VALUES (?,?,?,?,?,?,datetime('now'))
    `).bind(rfpId, v.id, proposal.technical, proposal.financial, proposal.status, isAndersen ? 1 : 0).run()
  }
  return c.json({ ok: true })
})

// ============================================================
// EVALUATIONS
// ============================================================
apiRouter.get('/rfps/:id/evaluations', async (c) => {
  const rfpId = c.req.param('id')
  const { results } = await c.env.DB.prepare(`
    SELECT e.*, v.name as vendor_name FROM evaluations e
    LEFT JOIN vendors v ON e.vendor_id = v.id
    WHERE e.rfp_id=? ORDER BY e.total_score DESC
  `).bind(rfpId).all()
  return c.json(results)
})

// POST /rfps/:id/evaluations/run — evaluate all proposals
apiRouter.post('/rfps/:id/evaluations/run', async (c) => {
  const rfpId = c.req.param('id')
  const rfp = await c.env.DB.prepare('SELECT * FROM rfps WHERE id=?').bind(rfpId).first<any>()

  const { results: proposals } = await c.env.DB.prepare(`
    SELECT p.*, v.name as vendor_name, v.contact_email, v.erp_experience, v.certifications, v.specializations, v.size
    FROM proposals p LEFT JOIN vendors v ON p.vendor_id = v.id WHERE p.rfp_id=?
  `).bind(rfpId).all<any>()
  if (proposals.length === 0) return c.json({ error: 'No proposals found. Add proposals first.' }, 400)

  for (const p of proposals) {
    await runSingleEvaluation(p, rfp, rfpId, c.env)
  }

  // Advance stage → submissions_closed when Run AI Evaluation is pressed
  // (signals that no more proposals will be accepted from this point)
  try {
    const currentRfp = await c.env.DB.prepare('SELECT stage FROM rfps WHERE id=?').bind(rfpId).first<{stage:string}>()
    const eligibleStages = ['qa_open', 'published', 'evaluation']
    if (currentRfp && eligibleStages.includes(currentRfp.stage)) {
      await c.env.DB.prepare(`UPDATE rfps SET stage='submissions_closed', updated_at=datetime('now') WHERE id=?`).bind(rfpId).run()
    }
  } catch(_) {}

  return c.json({ ok: true })
})

// POST /rfps/:id/proposals/:proposalId/evaluate — evaluate single proposal
apiRouter.post('/rfps/:id/proposals/:proposalId/evaluate', async (c) => {
  const rfpId = c.req.param('id')
  const proposalId = c.req.param('proposalId')
  const rfp = await c.env.DB.prepare('SELECT * FROM rfps WHERE id=?').bind(rfpId).first<any>()

  const p = await c.env.DB.prepare(`
    SELECT p.*, v.name as vendor_name, v.contact_email, v.erp_experience, v.certifications, v.specializations, v.size
    FROM proposals p LEFT JOIN vendors v ON p.vendor_id = v.id WHERE p.id=?
  `).bind(proposalId).first<any>()
  if (!p) return c.json({ error: 'Proposal not found' }, 404)

  await runSingleEvaluation(p, rfp, rfpId, c.env)
  return c.json({ ok: true })
})

// POST /rfps/:id/proposals/:proposalId/award — award contract to this proposal
apiRouter.post('/rfps/:id/proposals/:proposalId/award', async (c) => {
  const rfpId = c.req.param('id')
  const proposalId = c.req.param('proposalId')
  const db = c.env.DB

  // Get winner proposal + vendor
  const winner = await db.prepare(`
    SELECT p.*, v.name as vendor_name, v.contact_email FROM proposals p
    LEFT JOIN vendors v ON p.vendor_id = v.id WHERE p.id=?
  `).bind(proposalId).first<any>()
  if (!winner) return c.json({ error: 'Proposal not found' }, 404)

  const rfp = await db.prepare('SELECT * FROM rfps WHERE id=?').bind(rfpId).first<any>()

  // Update statuses
  await db.prepare(`UPDATE proposals SET status='awarded' WHERE id=?`).bind(proposalId).run()
  await db.prepare(`UPDATE proposals SET status='not_awarded' WHERE rfp_id=? AND id!=?`).bind(rfpId, proposalId).run()
  await db.prepare(`UPDATE rfps SET stage='awarded', updated_at=datetime('now') WHERE id=?`).bind(rfpId).run()

  // Send award email — route through sendRealEmail which enforces @andersenlab.com-only constraint
  let emailSent = false
  if (winner.contact_email) {
    const awardBody = buildAwardEmail(winner, rfp)
    const result = await sendRealEmail(
      winner.contact_email,
      `Contract Award Notification – ${rfp?.title || 'CPC RFP'} (Ref: ${rfp?.ref_number || ''})`,
      awardBody,
      rfp,
      c.env
    )
    emailSent = result.ok
  }

  // Log the award email
  await db.prepare(`
    INSERT INTO email_log (rfp_id, vendor_id, recipient, subject, body, email_type, status, created_at)
    VALUES (?,?,?,?,?,'award',?,datetime('now'))
  `).bind(rfpId, winner.vendor_id, winner.contact_email,
    `Contract Award – ${rfp?.title || 'CPC RFP'} (Ref: ${rfp?.ref_number || ''})`,
    `Award notification sent to ${winner.vendor_name}`,
    emailSent ? 'sent' : 'simulated'
  ).run()

  return c.json({ ok: true, emailSent, winner: winner.vendor_name })
})

// ============================================================
// RECOMMENDATION
// ============================================================
apiRouter.get('/rfps/:id/recommendation', async (c) => {
  const rfpId = c.req.param('id')
  const rec = await c.env.DB.prepare('SELECT * FROM recommendations WHERE rfp_id=? ORDER BY id DESC LIMIT 1').bind(rfpId).first<any>()
  if (!rec) return c.json(null, 404)
  return c.json({ ...rec, rankings: JSON.parse(rec.rankings_json || '[]') })
})

apiRouter.post('/rfps/:id/recommendation/generate', async (c) => {
  const rfpId = c.req.param('id')
  const { results: evals } = await c.env.DB.prepare(`
    SELECT e.*, v.name as vendor_name FROM evaluations e
    LEFT JOIN vendors v ON e.vendor_id = v.id
    WHERE e.rfp_id=? ORDER BY e.total_score DESC
  `).bind(rfpId).all<any>()
  if (evals.length === 0) return c.json({ error: 'No evaluations found. Run evaluation first.' }, 400)

  const rankings = evals.map((e: any, i: number) => ({
    rank: i + 1, vendor_name: e.vendor_name, total_score: e.total_score,
    business_score: e.business_score, technical_score: e.technical_score, financial_score: e.financial_score,
    is_real: e.is_real,
  }))
  const top = rankings[0]
  const second = rankings[1]
  const summary = buildRecommendationSummary(top, second, rankings)

  await c.env.DB.prepare(`
    INSERT INTO recommendations (rfp_id, top_vendor, rankings_json, summary, created_at)
    VALUES (?,?,?,?,datetime('now'))
  `).bind(rfpId, top.vendor_name, JSON.stringify(rankings), summary).run()
  return c.json({ ok: true, rankings, summary })
})

// ============================================================
// VENDOR PERFORMANCE
// ============================================================
// VENDOR PROPOSAL SUBMISSION (public web portal)
// ============================================================

// GET /submit/:rfpId — public RFP summary for the submission page
apiRouter.get('/submit/:rfpId', async (c) => {
  const rfpId = c.req.param('rfpId')
  const rfp = await c.env.DB.prepare(
    `SELECT id, ref_number, title, category, deadline, scope, objectives, tech_requirements, background, stage FROM rfps WHERE id=?`
  ).bind(rfpId).first<any>()
  if (!rfp) return c.json({ error: 'RFP not found' }, 404)
  // Allow submission only if stage allows it
  const closedStages = ['awarded', 'archived']
  if (closedStages.includes(rfp.stage)) return c.json({ error: 'This RFP is no longer accepting submissions.' }, 403)
  return c.json(rfp)
})

// POST /submit/:rfpId/categorize — AI categorize a single uploaded file
// Accepts multipart: file (PDF binary) → returns { label, confidence, summary }
apiRouter.post('/submit/:rfpId/categorize', async (c) => {
  const rfpId = c.req.param('rfpId')
  const rfp = await c.env.DB.prepare('SELECT id, title FROM rfps WHERE id=?').bind(rfpId).first<any>()
  if (!rfp) return c.json({ error: 'RFP not found' }, 404)

  try {
    const formData = await c.req.formData()
    const file = formData.get('file') as File | null
    if (!file) return c.json({ error: 'No file provided' }, 400)

    const bytes = new Uint8Array(await file.arrayBuffer())

    // Use vision-aware extraction — works for Type3 fonts, vector PDFs, all types
    const { text: rawText, method: extractMethod } = await extractPdfTextSmart(bytes, file.name, c.env)

    if (!rawText || rawText.length < 100) {
      // Even vision failed — heuristic from filename
      const nameLower = file.name.toLowerCase()
      const heuristicLabel = nameLower.includes('commercial') || nameLower.includes('financial') || nameLower.includes('cost') || nameLower.includes('price')
        ? 'commercial'
        : nameLower.includes('technical') || nameLower.includes('tech') || nameLower.includes('proposal')
        ? 'technical'
        : 'supporting'
      return c.json({
        label: heuristicLabel,
        confidence: 'low',
        summary: 'PDF text could not be extracted even with AI vision. The file will be stored and reviewed manually. Please set the document type below.',
        filename: file.name,
        size_bytes: bytes.length,
        unreadable: true,
        extract_method: 'failed',
      })
    }

    // Ask LLM to categorize using the extracted text
    const apiKey = (c.env as any).OPENAI_API_KEY || ''
    const baseUrl = (c.env as any).OPENAI_BASE_URL || 'https://www.genspark.ai/api/llm_proxy/v1'
    if (!apiKey) {
      const name = file.name.toLowerCase()
      const label = name.includes('commercial') || name.includes('financial') || name.includes('cost') ? 'commercial'
        : name.includes('technical') || name.includes('tech') || name.includes('architecture') ? 'technical'
        : 'supporting'
      return c.json({ label, confidence: 'medium', summary: 'Categorized by filename.', filename: file.name, size_bytes: bytes.length, extract_method: extractMethod })
    }

    const snippet = rawText.slice(0, 3000)
    const catRes = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-5-mini',
        max_tokens: 400,
        messages: [
          { role: 'system', content: `You are a procurement document classifier for a government RFP system. Analyze the document excerpt and return JSON with:
- label: one of "technical" (technical proposal, methodology, architecture, approach), "commercial" (pricing, cost, financial proposal, budget), "supporting" (company profile, certifications, CVs, references, compliance), or "other"
- confidence: "high", "medium", or "low"
- summary: one sentence (max 150 chars) describing what this document contains` },
          { role: 'user', content: `RFP: ${rfp.title}\n\nDocument excerpt:\n${snippet}\n\nRespond with JSON only.` }
        ],
        response_format: { type: 'json_object' }
      })
    })
    const catData: any = await catRes.json()
    let result: any = {}
    try { result = JSON.parse(catData.choices?.[0]?.message?.content || '{}') } catch(_) {}

    return c.json({
      label: result.label || 'other',
      confidence: result.confidence || 'medium',
      summary: result.summary || '',
      filename: file.name,
      size_bytes: bytes.length,
      extract_method: extractMethod,
      text_preview: rawText.slice(0, 200),
    })
  } catch(err: any) {
    console.error('[categorize]', err)
    return c.json({ error: err.message || 'Failed to categorize file' }, 500)
  }
})

// POST /submit/:rfpId — submit a full vendor proposal (multipart form)
// Fields: vendor_code (participant ref), cover_letter, files[] (PDFs)
apiRouter.post('/submit/:rfpId', async (c) => {
  const rfpId = c.req.param('rfpId')
  const rfp = await c.env.DB.prepare('SELECT * FROM rfps WHERE id=?').bind(rfpId).first<any>()
  if (!rfp) return c.json({ error: 'RFP not found' }, 404)
  const closedStages = ['awarded', 'archived']
  if (closedStages.includes(rfp.stage)) return c.json({ error: 'This RFP is no longer accepting submissions.' }, 403)

  // Ensure all schema migrations are applied (idempotent — ALTER TABLE errors are swallowed)
  try { await initDb(c.env.DB) } catch (_) {}

  try {
    const formData = await c.req.formData()
    const vendorCode = (formData.get('vendor_code') as string || '').trim().toUpperCase()
    const coverLetter = (formData.get('cover_letter') as string || '').trim()
    const fileLabels: Record<string, string> = {}
    try {
      const labelsJson = formData.get('file_labels') as string
      if (labelsJson) Object.assign(fileLabels, JSON.parse(labelsJson))
    } catch(_) {}

    // Resolve vendor from participant code RFP-{rfpId}-V{vendorId}
    let vendorId: number | null = null
    let vendorName = 'Unknown Vendor'
    if (vendorCode) {
      const codeMatch = vendorCode.match(/^RFP-(\d+)-V(\d+)$/)
      if (codeMatch && Number(codeMatch[1]) === Number(rfpId)) {
        vendorId = Number(codeMatch[2])
        const v = await c.env.DB.prepare('SELECT id, name FROM vendors WHERE id=?').bind(vendorId).first<any>()
        if (v) { vendorId = v.id; vendorName = v.name }
        else vendorId = null
      }
    }

    if (!vendorId) {
      // Try to find by rfp_vendors shortlisted — if only 1 vendor with no code just accept
      return c.json({ error: 'Invalid participant code. Please use the code from your invitation email.' }, 400)
    }

    // Collect all uploaded files
    const files: File[] = []
    let i = 0
    while (true) {
      const f = formData.get(`file_${i}`) as File | null
      if (!f) break
      files.push(f)
      i++
    }
    // Also try generic 'files' key
    const genericFiles = formData.getAll('files') as File[]
    for (const gf of genericFiles) {
      if (gf instanceof File) files.push(gf)
    }

    if (files.length === 0) return c.json({ error: 'Please attach at least one proposal document.' }, 400)

    const bucket: R2Bucket | undefined = (c.env as any).PROPOSALS_BUCKET
    const INLINE_EXTRACT_THRESHOLD = 5_000_000
    const allExtractedTexts: string[] = []
    const storedAttachments: any[] = []
    const pendingExtractionJobs: any[] = []

    for (let idx = 0; idx < files.length; idx++) {
      const file = files[idx]
      const fn = file.name || `document_${idx + 1}.pdf`
      const ct = file.type || 'application/pdf'
      const label = fileLabels[fn] || fileLabels[String(idx)] || 'other'
      const ts = Date.now() + idx
      const safeVendorName = vendorName.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 20)
      const r2Key = `proposals/${rfpId}/${vendorId}_${safeVendorName}_${ts}.pdf`

      const bytes = new Uint8Array(await file.arrayBuffer())

      // Store in R2
      if (bucket) {
        const httpMetadata = { contentType: ct }
        const customMetadata = { rfpId: String(rfpId), vendorId: String(vendorId), filename: fn }
        await bucket.put(r2Key, bytes, { httpMetadata, customMetadata })
      }

      const storedSize = bytes.length
      let extractedText = ''
      let textChars = 0
      let wrongDocReason = ''

      if (storedSize > INLINE_EXTRACT_THRESHOLD) {
        // Large file (>5MB) — schedule async extraction with vision fallback
        pendingExtractionJobs.push({ r2Key, filename: fn, contentType: ct, label })
      } else {
        // Small file — extract inline with vision fallback
        const { text: raw, method: exMethod } = await extractPdfTextSmart(bytes, fn, c.env)
        console.log(`[submit] ${fn}: ${raw.length} chars via ${exMethod}`)

        if (raw && raw.length >= 100) {
          // Check if this looks like the wrong document (e.g. RFP submitted instead of proposal)
          const wrongDoc = await detectWrongDocument(raw, fn, vendorName, rfp.ref_number || '', rfp.title || '', c.env)
          if (wrongDoc.isWrong) {
            wrongDocReason = wrongDoc.reason
            console.warn(`[submit] WRONG DOCUMENT detected for ${vendorName}: ${wrongDoc.reason}`)
            // Store the text but flag it — evaluation will score 0 with explanation
            extractedText = `[WRONG DOCUMENT DETECTED]\n${wrongDoc.reason}\n\n[EXTRACTED CONTENT FOR REFERENCE]\n${raw}`
            textChars = raw.length
          } else {
            extractedText = raw
            textChars = raw.length
            if (label === 'technical' || label === 'commercial' || label === 'other') {
              allExtractedTexts.push(`[${label.toUpperCase()} DOCUMENT: ${fn}]\n${raw}`)
            }
          }
        }
        // If raw is empty — file stays with textChars=0, will be handled by evaluator
      }

      // Track wrong-doc reason in attachment metadata
      const attachEntry: any = {
        r2_key: bucket ? r2Key : null,
        filename: fn,
        content_type: ct,
        label,
        size_bytes: storedSize,
        text_chars: textChars,
        url: null,
      }
      if (wrongDocReason) attachEntry.wrong_document = wrongDocReason

      storedAttachments.push(attachEntry)
    }

    // Combine cover letter + extracted texts (only clean/valid documents)
    const combinedText = [
      coverLetter ? `[COVER LETTER]\n${coverLetter}` : '',
      ...allExtractedTexts,
    ].filter(Boolean).join('\n\n')

    // Check if any attachment was flagged as wrong document
    const wrongDocAttachments = storedAttachments.filter((a: any) => a.wrong_document)
    const anyWrongDoc = wrongDocAttachments.length > 0
    const allWrongDoc = wrongDocAttachments.length === storedAttachments.filter((a: any) => a.content_type === 'application/pdf').length

    // Build technical_proposal: for wrong-doc submissions, include the detection marker
    // so runSingleEvaluation can detect and score 0.
    let technicalProposalText = combinedText
    if (anyWrongDoc && allExtractedTexts.length === 0) {
      // All PDFs were wrong documents — build a marker text
      const wrongReasons = wrongDocAttachments.map((a: any) =>
        `File: ${a.filename}\nReason: ${a.wrong_document}`
      ).join('\n\n')
      technicalProposalText = `[WRONG DOCUMENT DETECTED]\n${wrongReasons}\n\n[NO VALID PROPOSAL CONTENT EXTRACTED]`
    } else if (anyWrongDoc && combinedText.length > 0) {
      // Mix of valid + wrong — keep valid content but append warning
      const wrongReasons = wrongDocAttachments.map((a: any) =>
        `File: ${a.filename}: ${a.wrong_document}`
      ).join('\n')
      technicalProposalText = combinedText + `\n\n⚠ NOTE: ${wrongDocAttachments.length} file(s) were identified as wrong documents and excluded from evaluation: ${wrongReasons}`
    }

    // LLM field extraction — skip for pure wrong-document submissions
    let budgetAmount: number | null = null
    let budgetCurrency = 'AED'
    let timelineMonths: number | null = null
    let executiveSummary: string | null = null
    let keyStrengths: string | null = null
    let proposedDuration: string | null = null

    if (allWrongDoc && allExtractedTexts.length === 0) {
      // All files wrong — set error fields
      const firstWrong = wrongDocAttachments[0]
      executiveSummary = `Wrong document submitted. ${firstWrong?.wrong_document?.split('.')[0] || 'The submitted file is not a valid proposal.'}`
      keyStrengths = `⚠ Wrong document detected. This vendor did not submit a valid proposal for this RFP.`
    } else if (combinedText.length > 100) {
      try {
        const fields = await extractProposalFieldsWithLLM(combinedText, '', vendorName, rfp.title || 'RFP', (c.env as any))
        budgetAmount = fields.budget_amount || null
        budgetCurrency = fields.budget_currency || 'AED'
        timelineMonths = fields.timeline_months || null
        executiveSummary = fields.executive_summary || null
        keyStrengths = fields.key_strengths || null
        proposedDuration = fields.proposed_duration || extractProposedDuration(combinedText) || null
      } catch(e) { console.error('[submit] field extraction failed:', e) }
    }

    // Check if proposal already exists for this vendor+RFP
    const existing = await c.env.DB.prepare(
      `SELECT id FROM proposals WHERE rfp_id=? AND vendor_id=? ORDER BY id DESC LIMIT 1`
    ).bind(rfpId, vendorId).first<any>()

    const proposalAttachmentsJson = JSON.stringify(storedAttachments)

    let proposalId: number
    if (existing) {
      // Update existing proposal
      await c.env.DB.prepare(`
        UPDATE proposals SET
          technical_proposal=?, executive_summary=?, key_strengths=?,
          budget_amount=?, budget_currency=?, timeline_months=?, proposed_duration=?,
          proposal_attachments=?,
          status='submitted', is_real_submission=1,
          updated_at=datetime('now')
        WHERE id=?
      `).bind(
        technicalProposalText || null, executiveSummary, keyStrengths,
        budgetAmount, budgetCurrency, timelineMonths, proposedDuration,
        proposalAttachmentsJson, existing.id
      ).run()
      proposalId = existing.id
    } else {
      const ins = await c.env.DB.prepare(`
        INSERT INTO proposals
          (rfp_id, vendor_id, technical_proposal, executive_summary, key_strengths,
           budget_amount, budget_currency, timeline_months, proposed_duration,
           proposal_attachments, status, is_real_submission, created_at, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,'submitted',1,datetime('now'),datetime('now'))
      `).bind(
        rfpId, vendorId, technicalProposalText || null, executiveSummary, keyStrengths,
        budgetAmount, budgetCurrency, timelineMonths, proposedDuration,
        proposalAttachmentsJson
      ).run()
      proposalId = ins.meta.last_row_id as number
    }

    // Auto-evaluate in background after response
    const executionCtx = (c as any).executionCtx
    if (executionCtx?.waitUntil) {
      executionCtx.waitUntil(
        (async () => {
          try {
            // Handle any pending large-file extraction jobs first
            for (const job of pendingExtractionJobs) {
              await processLargeAttachmentAsync(
                Number(rfpId), vendorId as number, proposalId, job, c.env
              ).catch((e: any) => console.error('[submit] async extraction failed:', e))
            }
            // Then run evaluation
            const latestProposal = await (c.env as any).DB.prepare(`
              SELECT p.*, v.name as vendor_name, v.contact_email, v.erp_experience, v.certifications, v.specializations, v.size
              FROM proposals p LEFT JOIN vendors v ON p.vendor_id = v.id WHERE p.id=?
            `).bind(proposalId).first<any>()
            if (latestProposal) {
              await runSingleEvaluation(latestProposal, rfp, String(rfpId), c.env)
            }
          } catch(e) { console.error('[submit] auto-eval failed:', e) }
        })()
      )
    }

    return c.json({
      ok: true,
      proposal_id: proposalId,
      vendor_name: vendorName,
      files_stored: storedAttachments.length,
      message: 'Proposal submitted successfully.'
    })
  } catch(err: any) {
    console.error('[submit]', err)
    return c.json({ error: err.message || 'Submission failed' }, 500)
  }
})

// ============================================================
apiRouter.get('/vendor-performance', async (c) => {
  const { results } = await c.env.DB.prepare(`
    SELECT v.id, v.name, v.category, v.size, v.country,
      COUNT(DISTINCT rv.rfp_id) as rfps_shortlisted,
      COUNT(DISTINCT p.id) as proposals_submitted,
      AVG(e.total_score) as avg_score,
      SUM(CASE WHEN r.top_vendor = v.name THEN 1 ELSE 0 END) as awards_won
    FROM vendors v
    LEFT JOIN rfp_vendors rv ON v.id = rv.vendor_id AND rv.shortlisted=1
    LEFT JOIN proposals p ON v.id = p.vendor_id
    LEFT JOIN evaluations e ON v.id = e.vendor_id
    LEFT JOIN recommendations r ON r.top_vendor = v.name
    GROUP BY v.id ORDER BY avg_score DESC NULLS LAST
  `).all()
  return c.json(results)
})

// ============================================================
// LLM INTEGRATION — OpenAI-compatible API via Genspark proxy
// ============================================================

async function callLLM(systemPrompt: string, userPrompt: string, env: any, model = 'gpt-5-mini', maxTokens = 2000): Promise<string> {
  const apiKey = env?.OPENAI_API_KEY || (globalThis as any).OPENAI_API_KEY || ''
  const baseUrl = env?.OPENAI_BASE_URL || 'https://www.genspark.ai/api/llm_proxy/v1'
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured')

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: maxTokens,
      temperature: 0.3,
    }),
  })
  if (!res.ok) {
    const errText = await res.text().catch(() => 'unknown error')
    throw new Error(`LLM API error ${res.status}: ${errText}`)
  }
  const data = await res.json() as any
  return data.choices?.[0]?.message?.content || ''
}

async function generateRFPWithLLM(data: any, archDocText: string, brdDocText: string, env: any): Promise<string> {
  const systemPrompt = `You are a senior government procurement specialist at the Crown Prince's Court (CPC) of Abu Dhabi, UAE. You are producing a formal, publication-ready Request for Proposal (RFP) document that will be issued to external vendors.

IDENTITY & TONE
- You write on behalf of the Crown Prince's Court (CPC), Abu Dhabi — a sovereign government institution.
- Language must be authoritative, precise, and formal — as if it will be signed and stamped by a Director-General.
- No filler sentences, no vague boilerplate. Every paragraph must contain actionable, verifiable requirements.

CONTENT RULES — STRICTLY ENFORCED
1. Derive ALL content exclusively from the PROJECT DETAILS and SUPPORTING DOCUMENTS provided. Do not invent, assume, or extrapolate any requirement, technology, vendor, module, or feature that is not stated or strongly implied by the input.
2. The Scope of Work sub-sections must mirror exactly what is described in the input — structured as phases, workstreams, or functional areas exactly as the user described them. Do not add scope items that were not mentioned.
3. Technical Requirements must reflect only the technical constraints, hosting preferences, integration points, and compliance standards that are explicitly stated. Do not add generic IT requirements unless the user mentioned them.
4. Evaluation Criteria weights must sum to exactly 100%. Use UAE government procurement norms: Technical Approach & Methodology (30%), Functional Fit & Solution Quality (25%), Team Qualifications & Experience (20%), Financial Proposal (15%), Implementation Plan & Timeline (10%). Adjust these only if the project domain clearly warrants it (e.g. a pure consulting engagement would weight Financial differently).
5. Vendor Qualification Requirements must be proportionate to the project described — do not demand Oracle/SAP certifications for a CRM or analytics project, and do not demand CRM certifications for an ERP project.

HTML FORMATTING RULES
- Return ONLY the inner HTML — no <!DOCTYPE>, no <html>, no <body>, no <head>.
- Use this exact class structure for sections:
  <div class="rfp-section"><div class="rfp-section-body"><div class="rfp-section-title"><span class="rfp-section-num">N</span> Section Title</div> ... </div></div>
- Use <div class="rfp-subsection"><div class="rfp-subsection-title">N.M Sub-title</div> ... </div> for sub-sections.
- Use <div class="rfp-deliverables"><strong>Key Deliverables:</strong> Item 1 &bull; Item 2</div> at the end of each scope sub-section.
- Use <table class="rfp-spec-table"> for evaluation criteria and qualification tables.
- Use <ul> / <ol> for lists. Use <p> for narrative paragraphs.
- Do NOT use inline styles. Do NOT use markdown. Do NOT use code fences.`

  const docSections: string[] = []
  if (archDocText) {
    docSections.push(
      `${'='.repeat(60)}\nCONCEPTUAL SOLUTION ARCHITECTURE DOCUMENT\n(Use as primary technical reference — extract scope phases, architecture decisions, and constraints directly)\n${'='.repeat(60)}\n${archDocText.slice(0, 12000)}\n${'='.repeat(60)}`
    )
  }
  if (brdDocText) {
    docSections.push(
      `${'='.repeat(60)}\nBUSINESS REQUIREMENTS DOCUMENT\n(Use as primary functional reference — extract business needs, process flows, and acceptance criteria directly)\n${'='.repeat(60)}\n${brdDocText.slice(0, 12000)}\n${'='.repeat(60)}`
    )
  }
  const archSection = docSections.length
    ? `\nSUPPORTING DOCUMENTS PROVIDED BY CPC TEAM:\n${docSections.join('\n\n')}\n`
    : ''

  const userPrompt = `Generate a complete, formal RFP HTML document for the Crown Prince's Court (CPC), Abu Dhabi.
Use ONLY the information below. Do not add anything that is not stated here.

${'='.repeat(60)}
PROJECT DETAILS
${'='.repeat(60)}
Title:                  ${data.title || 'Not specified'}
Category:               ${data.category || 'IT & Digital Transformation'}
Budget Envelope:        ${data.budget ? 'AED ' + data.budget + ' (indicative)' : 'To be disclosed to shortlisted vendors'}
Proposal Deadline:      ${data.deadline || '30 days from RFP issuance'}

BACKGROUND
${data.background || '(not provided)'}

OBJECTIVES
${data.objectives || '(not provided)'}

SCOPE OF WORK
${data.scope || '(not provided)'}

TECHNICAL REQUIREMENTS & CONSTRAINTS
${data.tech_requirements || '(not provided — derive from Scope and Supporting Documents only)'}
${archSection}
${'='.repeat(60)}
REQUIRED DOCUMENT SECTIONS (produce all eight, in order)
${'='.repeat(60)}

1. PROJECT BACKGROUND & CONTEXT
   - Expand the Background field into 3–5 paragraphs covering: organisational context, current-state problem or gap, strategic mandate driving this initiative, and why an external vendor engagement is required.
   - Close with a one-sentence statement of what this RFP is soliciting.

2. PROJECT OBJECTIVES
   - Render as a numbered list. Each objective must be specific and measurable.
   - Map directly to what is stated in the Objectives field. Do not add generic objectives not mentioned.

3. SCOPE OF WORK
   - Structure as numbered sub-sections (3.1, 3.2, …) that mirror the phases, workstreams, or functional areas described in the Scope of Work field.
   - Each sub-section must have: a descriptive title, a short introductory sentence, a <ul> of specific deliverables/activities, and a <div class="rfp-deliverables"> listing the key formal deliverables.
   - Do not create sub-sections for topics not mentioned in the Scope field or Supporting Documents.

4. TECHNICAL REQUIREMENTS & ARCHITECTURE
   - Organised under logical sub-headings (e.g. Hosting & Infrastructure, Security & Compliance, Integration, Performance, Language & Accessibility).
   - Include only requirements that are stated in Technical Requirements field, Scope field, or Supporting Documents. Do not invent requirements.

5. EVALUATION CRITERIA
   - Render as <table class="rfp-spec-table"> with columns: Criterion | Weight % | Description.
   - Weights must sum to 100%.
   - Tailor criteria names to this specific project domain.

6. VENDOR QUALIFICATION REQUIREMENTS
   - Render as <table class="rfp-spec-table"> with columns: Requirement | Minimum Standard.
   - Include: years of relevant experience, number of comparable government/enterprise projects, team certifications relevant to THIS project, financial standing.
   - Do not require certifications irrelevant to the project domain.

7. SUBMISSION REQUIREMENTS & TIMELINE
   - Include a timeline table: Milestone | Date — using the Proposal Deadline as the anchor.
   - List required documents in the submission package.
   - Provide submission address: procurement@cpc-rfp.website

8. TERMS & CONDITIONS
   - Cover: confidentiality, IP ownership, right to reject, disqualification grounds, governing law (Abu Dhabi / UAE), language (English and Arabic).
   - Keep concise — 6–10 bullet points.`

  const llmContent = await callLLM(systemPrompt, userPrompt, env, 'gpt-5-mini', 16000)
  if (llmContent && llmContent.length > 400) {
    return `<div class="rfp-doc">${llmContent}</div>`
  }
  throw new Error(`LLM returned insufficient content (${llmContent?.length || 0} chars)`)
}

// ============================================================
// PROPOSAL FIELD EXTRACTION — LLM parses PDF text for structured data
// ─────────────────────────────────────────────────────────────────────────────
// ASYNC LARGE-FILE PROCESSOR — runs via ctx.waitUntil() after webhook returns
// ─────────────────────────────────────────────────────────────────────────────
// Called for:
//   (a) files >5MB: already streamed to R2 during webhook, bytes loaded here from R2
//   (b) small files where extractPdfText() produced PostScript garbage
//
// No CPU time limit applies inside ctx.waitUntil() — the 30ms limit only covers
// the time up to Response creation. This function runs to completion in the background.
async function processLargeAttachmentAsync(
  rfpId: number,
  vendorId: number,
  proposalId: number,
  job: { r2Key: string, filename: string, contentType: string, attachmentIndex: number, label: string },
  env: any
): Promise<void> {
  const db = env.DB as D1Database
  const bucket: R2Bucket | undefined = env.PROPOSALS_BUCKET

  console.log(`[async] Starting extraction: rfp=${rfpId} vendor=${vendorId} proposal=${proposalId} file=${job.filename}`)

  // 1. Fetch bytes from R2 (already stored during webhook — no Resend download needed)
  if (!bucket) { console.error('[async] PROPOSALS_BUCKET binding missing'); return }
  const obj = await bucket.get(job.r2Key)
  if (!obj) { console.error(`[async] R2 object not found: ${job.r2Key}`); return }
  const rawBytes = new Uint8Array(await obj.arrayBuffer())
  console.log(`[async] Fetched ${rawBytes.length} bytes from R2`)

  // 2. Extract text using smart extractor (text-layer → vision fallback)
  const { text: extracted, method: exMethod } = await extractPdfTextSmart(rawBytes, job.filename, env)
  console.log(`[async] Extracted ${extracted.length} chars from ${job.filename} via ${exMethod}`)

  if (!extracted || extracted.length < 200) {
    console.warn(`[async] Too little text for ${job.filename} (method=${exMethod}) — marking proposal`)
    if (proposalId) {
      await db.prepare(`UPDATE proposals SET key_strengths=? WHERE id=?`)
        .bind('⚠ PDF text extraction yielded insufficient content even after vision analysis. Please upload a clearer document.', proposalId)
        .run().catch(() => {})
    }
    return
  }

  // 3. Load proposal and RFP from DB
  const proposal = await db.prepare(`
    SELECT p.*, v.name as vendor_name, v.contact_email
    FROM proposals p LEFT JOIN vendors v ON p.vendor_id=v.id
    WHERE p.id=?
  `).bind(proposalId).first<any>().catch(() => null)

  if (!proposal) {
    // Proposal may not exist yet (race condition) — try by vendor+rfp
    const fallback = await db.prepare(
      `SELECT p.*, v.name as vendor_name FROM proposals p LEFT JOIN vendors v ON p.vendor_id=v.id WHERE p.rfp_id=? AND p.vendor_id=? ORDER BY p.id DESC LIMIT 1`
    ).bind(rfpId, vendorId).first<any>().catch(() => null)
    if (!fallback) { console.error(`[async] Proposal not found rfpId=${rfpId} vendorId=${vendorId}`); return }
    return processLargeAttachmentAsync(rfpId, vendorId, fallback.id, job, env)
  }

  const rfp = await db.prepare(`SELECT * FROM rfps WHERE id=?`).bind(rfpId).first<any>().catch(() => null)
  if (!rfp) { console.error(`[async] RFP not found: ${rfpId}`); return }

  // 4. Wrong-document detection — check if vendor submitted an RFP document instead of proposal
  const vendorName = proposal.vendor_name || 'Vendor'
  const wrongDoc = await detectWrongDocument(extracted, job.filename, vendorName, rfp.ref_number || '', rfp.title || '', env)
  let effectiveText = extracted
  let isWrongDocFlag = false
  if (wrongDoc.isWrong) {
    console.warn(`[async] Wrong document detected for ${job.filename}: ${wrongDoc.reason}`)
    isWrongDocFlag = true
    effectiveText = `[WRONG DOCUMENT DETECTED]\nFile: ${job.filename}\nDetected type: ${wrongDoc.detectedDocType}\n\n${wrongDoc.reason}\n\n[EXTRACTED CONTENT FOR REFERENCE]\n${extracted}`
  }

  // 5. LLM field extraction (skip for wrong-doc submissions)
  let fields: any = {}
  if (!isWrongDocFlag) {
    try {
      fields = await extractProposalFieldsWithLLM(effectiveText, '', vendorName, rfp.title || 'RFP', env)
      console.log(`[async] Fields: budget=${fields.budget_amount}, timeline=${fields.timeline_months}`)
    } catch (e: any) {
      console.error(`[async] Field extraction failed: ${e?.message}`)
      fields = { executive_summary: '', key_strengths: '', budget_amount: null, budget_currency: 'AED', timeline_months: null, technical_proposal: effectiveText.slice(0, 120000) }
    }
  } else {
    // Wrong document — set fields to reflect the error state
    fields = {
      executive_summary: `Wrong document submitted: ${wrongDoc.detectedDocType}. This appears to be ${wrongDoc.reason.split('.')[0]}.`,
      key_strengths: `⚠ Wrong document detected. ${wrongDoc.reason}`,
      budget_amount: null,
      budget_currency: 'AED',
      timeline_months: null,
      technical_proposal: effectiveText,
    }
  }

  // Merge with existing text (other attachments already stored inline)
  const existingText = proposal.technical_proposal || ''
  const label = job.label || 'technical'
  // If existing text is a wrong-doc marker or garbage, prefer new extraction
  const existingIsClean = existingText && !isPostScriptGarbage(existingText) && !existingText.startsWith('[WRONG DOCUMENT DETECTED]')
  const mergedText = existingIsClean
    ? existingText + `\n\n=== ${label.toUpperCase()} PROPOSAL (${job.filename}) ===\n` + (fields.technical_proposal || effectiveText)
    : `=== ${label.toUpperCase()} PROPOSAL (${job.filename}) ===\n` + (fields.technical_proposal || effectiveText)

  const proposedDuration = isWrongDocFlag ? null : extractProposedDuration(extracted)

  // 5. Update proposal record — also update proposal_attachments JSON to include wrong_document flag
  const existingAttachmentsJson = proposal.proposal_attachments || '[]'
  let updatedAttachments: any[] = []
  try {
    const parsedAttachments = JSON.parse(existingAttachmentsJson)
    updatedAttachments = parsedAttachments.map((att: any) => {
      if (att.filename === job.filename || att.r2_key === job.r2Key) {
        return {
          ...att,
          text_chars: effectiveText.length,
          extract_method: exMethod,
          ...(isWrongDocFlag ? { wrong_document: wrongDoc.reason } : {}),
        }
      }
      return att
    })
    // If not found in existing, add it
    if (!updatedAttachments.some((a: any) => a.filename === job.filename || a.r2_key === job.r2Key)) {
      updatedAttachments.push({
        r2_key: job.r2Key,
        filename: job.filename,
        content_type: job.contentType,
        label: job.label,
        text_chars: effectiveText.length,
        extract_method: exMethod,
        url: null,
        ...(isWrongDocFlag ? { wrong_document: wrongDoc.reason } : {}),
      })
    }
  } catch {
    updatedAttachments = []
  }

  await db.prepare(`
    UPDATE proposals SET
      executive_summary=COALESCE(NULLIF(?,\'\'), executive_summary),
      key_strengths=COALESCE(NULLIF(?,\'\'), key_strengths),
      budget_amount=COALESCE(?,budget_amount), budget_currency=COALESCE(?,budget_currency),
      timeline_months=COALESCE(?,timeline_months),
      technical_proposal=?,
      proposed_duration=COALESCE(NULLIF(?,\'\'),proposed_duration),
      pdf_attachment_url=COALESCE(NULLIF(pdf_attachment_url,\'\'), ?),
      proposal_attachments=?
    WHERE id=?
  `).bind(
    fields.executive_summary, fields.key_strengths,
    fields.budget_amount, fields.budget_currency, fields.timeline_months,
    mergedText, proposedDuration,
    `r2://${job.r2Key}`,
    JSON.stringify(updatedAttachments),
    proposal.id
  ).run()

  console.log(`[async] Proposal #${proposal.id} updated — ${mergedText.length} chars of text, wrongDoc=${isWrongDocFlag}`)

  // 6. Full LLM evaluation (wrong-doc proposals get score=0 with clear explanation)
  const updatedProposal = {
    ...proposal,
    technical_proposal: mergedText,
    budget_amount: fields.budget_amount ?? proposal.budget_amount,
    timeline_months: fields.timeline_months ?? proposal.timeline_months,
    proposed_duration: proposedDuration || proposal.proposed_duration,
  }

  try {
    const evalResult = await evaluateProposalWithLLM(updatedProposal, rfp, env)
    const total = evalResult.scoringDetails?.length > 0
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

    console.log(`[async] Evaluation complete for ${proposal.vendor_name}: total=${total}`)
  } catch (evalErr: any) {
    console.error(`[async] Evaluation failed for ${proposal.vendor_name}: ${evalErr?.message}`)
    // Proposal text was updated — evaluation can be re-run manually from the UI
  }
}

// ============================================================
export async function extractProposalFieldsWithLLM(
  pdfText: string,
  emailBody: string,
  vendorName: string,
  rfpTitle: string,
  env: any
): Promise<{
  executive_summary: string
  key_strengths: string
  budget_amount: number | null
  budget_currency: string
  timeline_months: number | null
  technical_proposal: string
}> {
  // Use up to 58000 chars of PDF text + 2000 chars email body = 60000 char context for LLM
  // gpt-5-mini supports ~128k token context; 60k chars ≈ 15k tokens — well within limits
  const combinedText = (pdfText.slice(0, 58000) + '\n\n' + emailBody.slice(0, 2000)).slice(0, 60000)

  const systemPrompt = `You are a procurement analyst extracting structured information from a vendor proposal document.
Extract the following fields and return them as a JSON object (no markdown, no code block, just raw JSON):

{
  "executive_summary": "2-3 sentence summary of what the vendor is proposing and their key differentiators",
  "key_strengths": "3-5 bullet points of the vendor's main strengths/advantages (use • as bullet prefix, one per line)",
  "budget_amount": <number or null — the total financial bid amount as a plain number with no commas or currency symbols>,
  "budget_currency": "<3-letter currency code, e.g. AED or USD — default AED if not specified>",
  "timeline_months": <integer or null — implementation timeline in months>,
  "technical_proposal": "Detailed technical summary: approach, methodology, technology stack, team, milestones, commercials (max 3000 chars)"
}

Rules:
- If a field cannot be determined from the text, use null for numbers or "" for strings.
- budget_amount must be a plain number (e.g. 1250000, not "1,250,000 AED")
- timeline_months must be an integer (e.g. 18 for "18 months")
- Do not invent information not present in the document.
- Even if only partial text is available, extract whatever is visible.`

  const userPrompt = `Vendor: ${vendorName}
RFP: ${rfpTitle}

Proposal text:
${combinedText}`

  try {
    // Large token budget for rich proposals — 3000 output tokens, large input context
    const result = await callLLM(systemPrompt, userPrompt, env, 'gpt-5-mini', 3000)
    const cleaned = result.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/, '').trim()
    const parsed = JSON.parse(cleaned)
    return {
      executive_summary: parsed.executive_summary || '',
      key_strengths: parsed.key_strengths || '',
      budget_amount: (parsed.budget_amount && !isNaN(Number(parsed.budget_amount))) ? Number(parsed.budget_amount) : null,
      budget_currency: parsed.budget_currency || 'AED',
      timeline_months: (parsed.timeline_months && !isNaN(Number(parsed.timeline_months))) ? Number(parsed.timeline_months) : null,
      technical_proposal: parsed.technical_proposal || pdfText.slice(0, 8000) || emailBody.slice(0, 2000),
    }
  } catch(_) {
    // Graceful fallback — use raw text
    return {
      executive_summary: '',
      key_strengths: '',
      budget_amount: null,
      budget_currency: 'AED',
      timeline_months: null,
      technical_proposal: pdfText.slice(0, 8000) || emailBody.slice(0, 2000) || `Proposal submitted by ${vendorName}.`,
    }
  }
}

async function categorizeEmailWithLLM(subject: string, body: string, attachments: any[], env: any): Promise<string> {
  const attachInfo = attachments.map((a: any) => `${a.filename || 'unnamed'} (${a.content_type || 'unknown type'})`).join(', ')

  const systemPrompt = `You are an email classification assistant for a government procurement system. Classify incoming vendor emails into exactly one of these categories:

- "decline": Email expresses that the vendor is NOT interested, is declining the invitation, withdrawing, or unable to participate. Signals: "not interested", "decline", "unable to participate", "regret to inform", "pass on this opportunity", "withdraw", "not in a position to", "cannot participate", "no thank you".

- "proposal": Email is a vendor submitting their RFP response / bid / proposal. Signals: "please find attached", "find attached our proposal", "RFP response", "our bid", "submission", "proposal document", "technical proposal", "commercial proposal", "find enclosed", "attaching our", "response to the RFP", "response to tender", has a PDF attachment, subject contains "RE:" with proposal/bid/response keywords.

- "questions": Email contains clarification questions about the RFP, asks specific questions about requirements, or has an Excel/spreadsheet attachment with questions.

- "plain_email": General correspondence, acknowledgment, out-of-office, or any other email type.

IMPORTANT RULES:
1. Check for "decline" signals FIRST.
2. If email says "please find attached" / "find attached" / "please see attached" AND there is a PDF or any attachment → classify as "proposal".
3. If the vendor is clearly submitting something (a response, a bid, a document) → "proposal".
4. When uncertain between "proposal" and "plain_email", prefer "proposal" if any attachment exists.

Return ONLY the category word, nothing else: decline, proposal, questions, or plain_email`

  const userPrompt = `Subject: ${subject}
Attachments: ${attachInfo || 'none'}
Body: ${body.slice(0, 1000)}

Category:`

  try {
    const result = await callLLM(systemPrompt, userPrompt, env, 'gpt-5-nano', 20)
    const clean = result.trim().toLowerCase().replace(/[^a-z_]/g, '')
    if (clean.includes('decline')) return 'decline'
    if (clean.includes('proposal')) return 'proposal'
    if (clean.includes('question')) return 'questions'
    return 'plain_email'
  } catch(_) {
    // Fallback heuristic — check body for key signals
    const bodyLower = body.toLowerCase()
    const declineKeywords = ['not interested', 'decline', 'unable to participate', 'regret to inform',
      'pass on this', 'withdraw', 'cannot participate', 'not in a position', 'not proceed', 'no thank you']
    if (declineKeywords.some(kw => bodyLower.includes(kw))) return 'decline'
    // Proposal heuristic: "find attached" + any attachment is a strong signal
    const proposalKeywords = ['find attached', 'please find', 'find enclosed', 'rfp response', 'our proposal',
      'our bid', 'our submission', 'response to the rfp', 'response to tender', 'please see attached']
    if (proposalKeywords.some(kw => bodyLower.includes(kw)) && attachments.length > 0) return 'proposal'
    if (attachments.some((a: any) => a.filename?.match(/\.(xlsx|xls|csv)$/i))) return 'questions'
    if (attachments.some((a: any) => a.filename?.match(/\.pdf$/i))) return 'proposal'
    return 'plain_email'
  }
}

async function draftAnswerLLM(question: string, rfp: any, env: any): Promise<{ answer: string, needsManual: boolean }> {
  // Build rich context — strip HTML tags from generated RFP content for cleaner LLM input
  const rfpText = rfp?.content ? rfp.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : ''

  const context = [
    rfpText
      ? `RFP DOCUMENT (full generated text):\n${rfpText.slice(0, 20000)}`
      : '',
    rfp?.arch_doc_text
      ? `SOLUTION ARCHITECTURE DOCUMENT:\n${rfp.arch_doc_text.slice(0, 12000)}`
      : '',
    rfp?.brd_doc_text
      ? `BUSINESS REQUIREMENTS DOCUMENT:\n${rfp.brd_doc_text.slice(0, 12000)}`
      : '',
    rfp?.background
      ? `PROJECT BACKGROUND:\n${rfp.background}`
      : '',
    rfp?.objectives
      ? `PROJECT OBJECTIVES:\n${rfp.objectives}`
      : '',
    rfp?.scope
      ? `SCOPE OF WORK:\n${rfp.scope}`
      : '',
    rfp?.tech_requirements
      ? `TECHNICAL REQUIREMENTS:\n${rfp.tech_requirements}`
      : '',
  ].filter(Boolean).join('\n\n---\n\n')

  const systemPrompt = `You are ${rfp?.contact_name || 'the procurement manager'} at the Crown Prince's Court (CPC), Abu Dhabi, UAE. You are personally answering vendor clarification questions about this RFP. Write as a real, senior government procurement professional who knows this project inside out — not as a generic system or AI assistant.

TONE RULES (critical):
- Write in first person where natural: "We require...", "Our team will...", "From our side..."
- Be direct and specific — never hedge with phrases like "Based on standard enterprise practice", "While the RFP doesn't specify", "It is generally expected that", "Industry-standard practice suggests"
- Sound like a human expert who lives and breathes this project, not a consultant producing boilerplate
- Short, confident sentences. No throat-clearing. No caveats unless genuinely needed.
- If a question has an obvious answer given the project context, just answer it plainly

ANSWERING RULES — apply in order:

1. DIRECT ANSWER (preferred): If the answer is in the RFP, Architecture doc, BRD, or project fields — answer it directly and specifically. You may reference the section (e.g. "Section 3.2 covers this") but skip filler like "As explicitly stated in..."

2. INFORMED ANSWER (use for most questions): If not explicitly documented but you can answer it confidently as a senior CPC procurement manager familiar with UAE government projects of this type — just answer it. Do NOT signal that you are inferring or that the RFP doesn't cover it. A real person wouldn't say "while the RFP doesn't specify this" — they would just answer the question. Treat your knowledge of UAE government procurement norms, Abu Dhabi digital economy standards, and project delivery expectations as your own professional expertise.

3. ESCALATE TO MANUAL REVIEW (last resort only — < 10% of questions): Only if the answer genuinely requires an undisclosed internal CPC decision (e.g. exact budget envelope, a specific internal approval threshold not mentioned anywhere). Respond with exactly: "NEEDS_MANUAL_REVIEW: " followed by one sentence.

Never say "I don't know". Never say "Based on standard enterprise/industry practice". Never say "While the RFP doesn't specify". Answer like a human who owns this procurement.`

  const userPrompt = `${context ? `CONTEXT DOCUMENTS:\n${context}\n\n---\n\n` : ''}VENDOR QUESTION:\n${question}`

  try {
    const answer = await callLLM(systemPrompt, userPrompt, env, 'gpt-5-mini', 1500)
    const trimmed = answer.trim()
    if (trimmed.startsWith('NEEDS_MANUAL_REVIEW')) {
      const explanation = trimmed.replace(/^NEEDS_MANUAL_REVIEW[:\s]*/i, '').trim()
      return {
        answer: explanation || 'This question requires a decision or clarification from the CPC procurement team.',
        needsManual: true
      }
    }
    if (trimmed.length < 20) {
      return { answer: 'This question requires manual review by the procurement team.', needsManual: true }
    }
    return { answer: trimmed, needsManual: false }
  } catch(llmErr: any) {
    console.error('[draftAnswer] LLM failed:', llmErr?.message || llmErr)
    return { answer: 'LLM unavailable — please provide a manual answer for this question.', needsManual: true }
  }
}

async function runSingleEvaluation(p: any, rfp: any, rfpId: any, env: any): Promise<void> {
  const db = env.DB

  // Delete existing evaluation for this proposal
  await db.prepare('DELETE FROM evaluations WHERE proposal_id=?').bind(p.id).run()

  let scores: { business: number, technical: number, financial: number, experience: number }
  let scoringDetails: any[]
  let aiSummary: string
  let usedRealLLM = 0

  const proposalCandidate = p.technical_proposal || ''

  // ── WRONG DOCUMENT CHECK ────────────────────────────────────────────────────
  // Detect proposals that contain the [WRONG DOCUMENT DETECTED] marker from
  // submission-time or async processing. Score them all 0 with a clear explanation.
  const isWrongDocument = proposalCandidate.startsWith('[WRONG DOCUMENT DETECTED]')
  if (isWrongDocument) {
    // Extract the reason text — everything between the marker and [EXTRACTED CONTENT FOR REFERENCE]
    const reasonMatch = proposalCandidate.match(/\[WRONG DOCUMENT DETECTED\]\n?([\s\S]*?)(?:\[EXTRACTED CONTENT FOR REFERENCE\]|$)/)
    const wrongReason = reasonMatch ? reasonMatch[1].trim() : 'This vendor submitted a wrong document instead of a proposal.'
    console.warn(`[evaluation] Wrong document detected for ${p.vendor_name} — scoring 0 across all criteria`)

    // Build zero-score evaluation with detailed explanation
    const criteriaNames = ['Technical Approach & Methodology', 'Relevant Experience & References', 'Team Qualifications', 'Commercial & Financial Proposal', 'Project Management & Risk']
    scoringDetails = criteriaNames.map(name => ({
      criterion: name,
      score: 0,
      weight: 20,
      weighted: 0,
      justification: `Score: 0/100 — No valid proposal was submitted. ${wrongReason.split('\n')[0]}`,
    }))
    scores = { business: 0, technical: 0, financial: 0, experience: 0 }
    aiSummary = `⚠️ INVALID SUBMISSION — WRONG DOCUMENT DETECTED\n\n${wrongReason}\n\nThis vendor did not submit a valid proposal for this RFP. All evaluation criteria are scored 0. The vendor should be contacted to resubmit the correct document.`
    usedRealLLM = 1 // Mark as real (not simulation) so it shows in UI

  // ── MEANINGFUL PROPOSAL CHECK ───────────────────────────────────────────────
  // All proposals must be evaluated by real LLM — no simulation fallback allowed.
  // If text extraction failed (empty or PostScript garbage), score 0 with explanation.
  // If LLM errors, surface the error rather than producing fake scores.
  } else {
    const isGarbage = proposalCandidate.length > 0 && isPostScriptGarbage(proposalCandidate)
    const hasMeaningfulProposal = proposalCandidate.length > 200 && !isGarbage

    if (!hasMeaningfulProposal) {
      // No usable text — either extraction failed entirely or produced PostScript garbage.
      // Score 0 with a clear explanation so evaluators know why.
      const criteriaNames = ['Technical Approach & Methodology', 'Relevant Experience & References', 'Team Qualifications', 'Commercial & Financial Proposal', 'Project Management & Risk']
      const reason = isGarbage
        ? `PDF text extraction returned only PostScript/font rendering bytecode (${proposalCandidate.length} chars of unreadable data). The PDF uses complex embedded Type3 fonts that cannot be parsed by the text extractor. The vendor should re-upload their proposal as a text-searchable or flattened PDF.`
        : `No proposal text was extracted from the submitted file(s). The PDF may be encrypted, image-only (scanned without OCR), or empty. The vendor should re-upload a searchable PDF.`
      scoringDetails = criteriaNames.map(name => ({
        criterion: name,
        score: 0,
        weight: 20,
        weighted: 0,
        justification: `Score: 0/100 — Proposal text could not be extracted. ${reason.split('.')[0]}.`,
      }))
      scores = { business: 0, technical: 0, financial: 0, experience: 0 }
      aiSummary = `⚠️ EVALUATION FAILED — UNREADABLE PROPOSAL\n\n${reason}\n\nAll criteria scored 0. No evaluation can be performed without readable proposal content. Please contact the vendor to resubmit a text-searchable PDF.`
      usedRealLLM = 0
      console.warn(`[evaluation] No readable text for ${p.vendor_name} — scored 0. isGarbage=${isGarbage}, chars=${proposalCandidate.length}`)
    } else {
      // Has meaningful text — always use real LLM evaluation
      try {
        const evalResult = await evaluateAndersenWithLLM(p, rfp, env)
        scores = evalResult.scores
        scoringDetails = evalResult.scoringDetails
        aiSummary = evalResult.summary
        usedRealLLM = 1
      } catch(llmErr: any) {
        console.error(`[evaluation] LLM failed for ${p.vendor_name}:`, llmErr?.message || llmErr)
        // Surface LLM failure — do NOT simulate
        const criteriaNames = ['Technical Approach & Methodology', 'Relevant Experience & References', 'Team Qualifications', 'Commercial & Financial Proposal', 'Project Management & Risk']
        scoringDetails = criteriaNames.map(name => ({
          criterion: name,
          score: 0,
          weight: 20,
          weighted: 0,
          justification: `Score: 0/100 — LLM evaluation failed: ${llmErr?.message || 'Unknown error'}. Please retry evaluation.`,
        }))
        scores = { business: 0, technical: 0, financial: 0, experience: 0 }
        aiSummary = `⚠️ EVALUATION ERROR — LLM UNAVAILABLE\n\nThe AI evaluation service returned an error: ${llmErr?.message || 'Unknown error'}\n\nPlease retry the evaluation. All scores are set to 0 pending a successful evaluation run.`
        usedRealLLM = 0
      }
    }
  }

  // Derive total from the per-criterion weighted scores to keep display consistent.
  // This ensures the header total matches the scoring table grand total.
  let total: number
  if (scoringDetails && scoringDetails.length > 0) {
    const weightedSum = scoringDetails.reduce((sum: number, c: any) => {
      const ws = c.weighted !== undefined ? Number(c.weighted) : (Number(c.weight || 0) * Number(c.score || 0) / 100)
      return sum + ws
    }, 0)
    total = Math.round(weightedSum)
  } else {
    total = Math.round(
      scores.business * 0.30 +
      scores.technical * 0.40 +
      scores.financial * 0.30
    )
  }

  await db.prepare(`
    INSERT INTO evaluations (rfp_id, proposal_id, vendor_id, business_score, technical_score, financial_score, experience_score, total_score, ai_summary, scoring_details_json, is_real, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
  `).bind(
    rfpId, p.id, p.vendor_id,
    scores.business, scores.technical, scores.financial, scores.experience,
    total, aiSummary,
    JSON.stringify(scoringDetails),
    usedRealLLM
  ).run()

  // Update proposal status to reflect evaluation
  await db.prepare(`UPDATE proposals SET status='submitted' WHERE id=?`).bind(p.id).run()
}

export async function evaluateProposalWithLLM(p: any, rfp: any, env: any): Promise<{
  scores: { business: number, technical: number, financial: number, experience: number },
  scoringDetails: any[],
  summary: string
}> {
  // ── Build full evaluation context (no character caps on reference documents) ──────────────────
  // 1. Full RFP document (HTML stripped)
  const rfpFullText = rfp?.content
    ? rfp.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    : ''
  // 2. Full Business Requirements Document
  const brdFullText = rfp?.brd_doc_text || ''
  // 3. Full Conceptual Architecture document
  const archFullText = rfp?.arch_doc_text || ''
  // 4. Vendor questions submitted for this RFP (vendor-specific + all published Q&A)
  let vendorQuestionsText = ''
  try {
    const db = env.DB as D1Database
    // Fetch this vendor's questions AND all published Q&A (published=1 means answered+visible to all)
    const { results: allQs } = await db.prepare(`
      SELECT q.question, q.answer, q.source, v.name as vendor_name
      FROM questions q
      LEFT JOIN vendors v ON q.vendor_id = v.id
      WHERE q.rfp_id = ?
        AND (q.vendor_id = ? OR q.published = 1)
        AND q.answer IS NOT NULL AND q.answer != ''
      ORDER BY q.id ASC
    `).bind(rfp.id, p.vendor_id).all<any>()
    if (allQs.length > 0) {
      vendorQuestionsText = allQs.map((q: any) =>
        `Q (${q.vendor_name || 'Vendor'}): ${q.question}\nA: ${q.answer}`
      ).join('\n\n')
    }
  } catch(_) { /* questions are optional context — evaluation proceeds without them */ }

  // 5. All submitted proposal files (technical_proposal already contains combined text from all attachments)
  const proposalText = p.technical_proposal || ''

  // Verify proposal text is real content, not PostScript garbage or a wrong-document marker
  if (isPostScriptGarbage(proposalText)) {
    console.warn(`[evaluateProposal] PostScript garbage detected for ${p.vendor_name} — cannot evaluate, returning zero scores`)
    throw new Error('Proposal text is PostScript rendering bytecode, not readable content. PDF needs re-extraction.')
  }
  if (proposalText.startsWith('[WRONG DOCUMENT DETECTED]')) {
    console.warn(`[evaluateProposal] Wrong document marker in technical_proposal for ${p.vendor_name} — scoring 0`)
    throw new Error('Wrong document submitted — not a valid proposal. See proposal text for details.')
  }

  // ── Assemble system prompt ────────────────────────────────────────────────────────────────────
  const systemPrompt = `You are a senior evaluation committee member at the Crown Prince's Court (CPC), Abu Dhabi.
You have been given the complete RFP document, the Business Requirements Document (BRD), the Conceptual Architecture document, vendor clarification questions and their answers, and the vendor's full proposal submission.

EVALUATION PRINCIPLES:
- Evaluate STRICTLY based on what is actually written in the submitted documents. Do NOT assume or infer expertise not mentioned.
- COMPLETENESS is a scored dimension: if the vendor's proposal does not address a requirement from the RFP, BRD, or Architecture document, this MUST reduce the relevant criterion score and be explicitly noted in the justification.
- Cross-reference the proposal against the RFP scope, BRD requirements, and CPC Architecture vision. Flag gaps clearly.
- The vendor's Q&A responses are part of their submission and contribute to the overall assessment.
- Financial scores must reflect actual disclosed pricing. If no financial data is provided, score TCO and Commercial Terms as 0 and state this explicitly.
- Scores must be internally consistent: if a criterion justification says "not addressed", the score must be low (0–30), not mid-range.

Return a JSON object with EXACTLY this structure — no extra fields, no markdown:
{
  "scores": {
    "business": <integer 0-100>,
    "technical": <integer 0-100>,
    "financial": <integer 0-100>,
    "experience": <integer 0-100>
  },
  "criteria": [
    {"name": "Solution Architecture & Methodology", "dimension": "Technical", "weight": 15, "score": <int 0-100>, "justification": "<2-3 sentences: what was proposed vs what RFP/BRD/Arch required; note any gaps>", "weighted": <weight*score/100 as float>},
    {"name": "Implementation Approach & Timeline", "dimension": "Technical", "weight": 15, "score": <int 0-100>, "justification": "<2-3 sentences: milestone plan, phasing, risk mitigation; note missing elements>", "weighted": <float>},
    {"name": "Technical Team Qualifications", "dimension": "Technical", "weight": 10, "score": <int 0-100>, "justification": "<2-3 sentences: named roles, certifications, UAE gov experience evidenced in proposal>", "weighted": <float>},
    {"name": "Government Sector Experience", "dimension": "Business", "weight": 20, "score": <int 0-100>, "justification": "<2-3 sentences: UAE/Abu Dhabi government references stated in proposal; lack of evidence = low score>", "weighted": <float>},
    {"name": "Training & Knowledge Transfer", "dimension": "Business", "weight": 10, "score": <int 0-100>, "justification": "<2-3 sentences: training plan, KT methodology, Arabic-language materials; note if absent>", "weighted": <float>},
    {"name": "Total Cost of Ownership (TCO)", "dimension": "Commercial", "weight": 20, "score": <int 0-100>, "justification": "<2-3 sentences: stated price, breakdown, multi-year support cost; score 0 if no financial data submitted>", "weighted": <float>},
    {"name": "Commercial Terms & Payment Structure", "dimension": "Commercial", "weight": 10, "score": <int 0-100>, "justification": "<2-3 sentences: payment milestones, warranty, liability; score 0 if not disclosed>", "weighted": <float>}
  ],
  "summary": "<4-5 sentence evaluation: reference the actual RFP topic, the vendor's key strengths, identified gaps vs RFP/BRD requirements, financial position, and a clear recommendation>"
}
Return ONLY the JSON. No markdown code blocks, no commentary outside the JSON.`

  // ── Assemble user prompt with ALL reference documents (no caps) ───────────────────────────────
  const sections: string[] = []

  if (rfpFullText) {
    sections.push(`=== RFP DOCUMENT (full text) ===\n${rfpFullText}`)
  } else {
    // Fallback: use structured fields
    const structured = [
      rfp?.title ? `TITLE: ${rfp.title}` : '',
      rfp?.objectives ? `OBJECTIVES:\n${rfp.objectives}` : '',
      rfp?.scope ? `SCOPE:\n${rfp.scope}` : '',
      rfp?.tech_requirements ? `TECHNICAL REQUIREMENTS:\n${rfp.tech_requirements}` : '',
    ].filter(Boolean).join('\n\n')
    if (structured) sections.push(`=== RFP DETAILS ===\n${structured}`)
  }

  if (brdFullText) {
    sections.push(`=== BUSINESS REQUIREMENTS DOCUMENT (BRD, full text) ===\n${brdFullText}`)
  }

  if (archFullText) {
    sections.push(`=== CONCEPTUAL ARCHITECTURE DOCUMENT (full text) ===\n${archFullText}`)
  }

  if (vendorQuestionsText) {
    sections.push(`=== VENDOR CLARIFICATION Q&A ===\n${vendorQuestionsText}`)
  }

  sections.push(`=== VENDOR PROPOSAL SUBMISSION ===
VENDOR: ${p.vendor_name}
Stated Financial Offer: AED ${p.financial_proposal ? Number(p.financial_proposal).toLocaleString() : 'Not disclosed'}
Extracted Budget: AED ${p.budget_amount ? Number(p.budget_amount).toLocaleString() : 'Not extracted'}
Proposed Duration: ${p.proposed_duration || (p.timeline_months ? p.timeline_months + ' months' : 'Not specified')}

FULL PROPOSAL TEXT (all submitted documents combined):
${proposalText}`)

  const userPrompt = sections.join('\n\n---\n\n')

  console.log(`[evaluateProposal] Context size for ${p.vendor_name}: ${userPrompt.length} chars (rfp=${rfpFullText.length}, brd=${brdFullText.length}, arch=${archFullText.length}, questions=${vendorQuestionsText.length}, proposal=${proposalText.length})`)

  try {
    // gpt-5 has a large context window — sufficient for full documents with no truncation needed
    // Use 4000 output tokens to allow thorough justifications across 7 criteria
    const result = await callLLM(systemPrompt, userPrompt, env, 'gpt-5', 4000)
    const jsonMatch = result.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      // Use ?? 0 (nullish coalescing) not || so LLM-returned 0 is preserved, not replaced by fallback
      return {
        scores: {
          business:   Math.min(100, Math.max(0, Math.round(parsed.scores?.business   ?? 0))),
          technical:  Math.min(100, Math.max(0, Math.round(parsed.scores?.technical  ?? 0))),
          financial:  Math.min(100, Math.max(0, Math.round(parsed.scores?.financial  ?? 0))),
          experience: Math.min(100, Math.max(0, Math.round(parsed.scores?.experience ?? 0))),
        },
        scoringDetails: parsed.criteria || [],
        summary: parsed.summary || `${p.vendor_name} evaluation complete. See criteria breakdown for details.`,
      }
    }
    throw new Error('LLM response did not contain valid JSON')
  } catch(llmErr: any) {
    console.error('[evaluateProposal] LLM failed:', llmErr?.message || llmErr)
    throw llmErr  // propagate — caller falls back to simulation
  }
}

// Keep old name as alias for backward compatibility with existing call sites
const evaluateAndersenWithLLM = evaluateProposalWithLLM

function simulateAndersenEvaluation(p: any): { scores: any, scoringDetails: any[], summary: string } {
  const vendorName = p.vendor_name || 'Andersen Lab'
  const fin = p.financial_proposal ? Number(p.financial_proposal).toLocaleString() : 'Not disclosed'
  const dur = p.proposed_duration || 'as proposed'
  const criteria = [
    { name: 'Solution Architecture & Methodology', dimension: 'Technical', weight: 15, score: 92, justification: `${vendorName} presents a well-structured solution architecture with clear component breakdown and integration approach. Documentation is comprehensive and aligns with CPC technical standards.`, weighted: 13.8 },
    { name: 'Implementation Approach & Timeline', dimension: 'Technical', weight: 15, score: 90, justification: `Phased delivery plan (${dur}) with clearly defined milestones, risk mitigation strategies, and bi-weekly CPC stakeholder reviews. Sprint methodology is well-documented.`, weighted: 13.5 },
    { name: 'Technical Team Qualifications', dimension: 'Technical', weight: 10, score: 94, justification: `${vendorName} fields a team of certified professionals with verified UAE government delivery history and relevant domain expertise. CMMI Level 3 certified organization.`, weighted: 9.4 },
    { name: 'Government Sector Experience', dimension: 'Business', weight: 20, score: 91, justification: `Multiple verified UAE government project implementations with formal reference letters. Deep understanding of UAE IA Standards, data classification policy, and G-Cloud requirements.`, weighted: 18.2 },
    { name: 'Training & Knowledge Transfer', dimension: 'Business', weight: 10, score: 88, justification: `Comprehensive TNA-based training plan covering all user levels with a full documentation suite including SOPs, configuration guides, and video tutorials.`, weighted: 8.8 },
    { name: 'Total Cost of Ownership (TCO)', dimension: 'Commercial', weight: 20, score: 74, justification: `Commercial proposal (AED ${fin}) is positioned at a premium relative to other bids, reflecting the vendor's specialized capability and UAE government track record.`, weighted: 14.8 },
    { name: 'Commercial Terms & Payment Structure', dimension: 'Commercial', weight: 10, score: 76, justification: `Milestone-based payment structure with 24-month warranty. Terms are market-standard with limited flexibility on payment timing — negotiation recommended.`, weighted: 7.6 },
  ]
  const totalScore = Math.round(criteria.reduce((s, c) => s + c.weighted, 0))
  return {
    scores: { business: 89, technical: 92, financial: 75, experience: 91 },
    scoringDetails: criteria,
    summary: `${vendorName} demonstrates exceptional technical depth and extensive UAE government sector experience directly relevant to this project. The proposed methodology and team qualifications are well-aligned with CPC requirements. The commercial proposal, while positioned at a premium, reflects the vendor's specialized capability and proven delivery track record. Total weighted score: ${totalScore}/100. RECOMMENDATION: Primary preferred vendor — engage in commercial negotiation to optimize cost positioning.`,
  }
}

function simulateVendorEvaluation(p: any, isEPAM: boolean): { scores: any, scoringDetails: any[], summary: string } {
  const vendorName = p.vendor_name || 'Vendor'

  if (isEPAM) {
    const fin = p.financial_proposal ? `AED ${Number(p.financial_proposal).toLocaleString()}` : 'AED 4,200,000 (competitive)'
    const criteria = [
      { name: 'Solution Architecture & Methodology', dimension: 'Technical', weight: 15, score: 82, justification: `${vendorName} presents a solid agile-based architecture with CI/CD pipeline and automated testing. The technical documentation is clear and covers core integration points, though UAE-government-specific customisations are less detailed than the leading bid.`, weighted: 12.3 },
      { name: 'Implementation Approach & Timeline', dimension: 'Technical', weight: 15, score: 80, justification: `Phased delivery plan is realistic and uses proprietary accelerators to compress timeline. RACI matrix and governance structure are well-defined; however the plan does not account for CPC internal approval gates.`, weighted: 12.0 },
      { name: 'Technical Team Qualifications', dimension: 'Technical', weight: 10, score: 85, justification: `CMMI Level 5 certified firm with strong engineering culture. The proposed team includes certified professionals with relevant domain experience, though fewer UAE government-side deliveries are evidenced compared to the preferred vendor.`, weighted: 8.5 },
      { name: 'Government Sector Experience', dimension: 'Business', weight: 20, score: 72, justification: `Verified MENA government project portfolio with 5+ references. UAE-specific implementations are documented but limited to 2 direct Abu Dhabi government entities — below the depth shown by the top-ranked bid.`, weighted: 14.4 },
      { name: 'Training & Knowledge Transfer', dimension: 'Business', weight: 10, score: 76, justification: `Role-based training programme with e-learning modules is included. The knowledge transfer framework covers documentation and SOPs but does not address Arabic-language training materials or CPC-specific onboarding.`, weighted: 7.6 },
      { name: 'Total Cost of Ownership (TCO)', dimension: 'Commercial', weight: 20, score: 84, justification: `${fin} is competitive and includes a transparent phase-wise breakdown with clear licensing and support cost assumptions. Represents good value but the support tier pricing beyond year 3 is not fixed.`, weighted: 16.8 },
      { name: 'Commercial Terms & Payment Structure', dimension: 'Commercial', weight: 10, score: 80, justification: `Milestone-based payment structure with 36-month warranty is commercially attractive. Payment terms are flexible and the escalation process is clearly defined — strongest commercial package among alternative bids.`, weighted: 8.0 },
    ]
    const totalScore = Math.round(criteria.reduce((s, c) => s + c.weighted, 0))
    return {
      scores: { business: 74, technical: 82, financial: 82, experience: 76 },
      scoringDetails: criteria,
      summary: `${vendorName} scores ${totalScore}/100 — the strongest alternative to the preferred vendor. Technical capability and commercial offer are competitive. The key gap is in UAE-government-specific delivery depth: ${vendorName} has fewer Abu Dhabi government references and the knowledge transfer plan needs supplementing with Arabic-language materials. If commercial negotiation with the preferred vendor does not converge, ${vendorName} is the recommended fallback and should be shortlisted for further commercial discussion.`,
    }
  }

  // ── Generic simulated vendors (all other shortlisted firms) ──────────────────
  // Scores are deterministic per vendor (based on vendor id hash) so re-evaluating
  // produces consistent results, not random noise.
  const seed = p.vendor_id ? (p.vendor_id * 7 + 13) % 100 : 50
  const hasGov = (p.erp_experience || '').toLowerCase().includes('government')
  const hasCert = (p.certifications || '').toLowerCase().includes('iso')

  // Score bands: deliberately lower than Andersen (86-92) and EPAM (79-84)
  const tech  = 52 + (seed % 18)          // 52–69
  const biz   = hasGov ? 58 + (seed % 12) : 44 + (seed % 14)  // 58–69 or 44–57
  const finSc = 55 + (seed % 20)           // 55–74
  const certBonus = hasCert ? 4 : 0

  const criteria = [
    { name: 'Solution Architecture & Methodology', dimension: 'Technical', weight: 15, score: tech - 3 + certBonus,
      justification: `The proposal addresses the core architectural requirements at a high level but lacks the detail expected for a UAE government implementation of this scale. Integration architecture with existing CPC systems is not adequately described.`,
      weighted: ((tech - 3 + certBonus) * 0.15) },
    { name: 'Implementation Approach & Timeline', dimension: 'Technical', weight: 15, score: tech + certBonus,
      justification: `The implementation methodology is standard and the proposed timeline is broadly feasible. The plan does not include vendor-specific accelerators or pre-built UAE government connectors that would reduce risk.`,
      weighted: (tech + certBonus) * 0.15 },
    { name: 'Technical Team Qualifications', dimension: 'Technical', weight: 10, score: tech + 2 + certBonus,
      justification: `The team profile includes qualified professionals but UAE government project experience is limited. ${hasCert ? 'ISO certification is noted.' : 'No relevant quality certifications were presented.'}`,
      weighted: (tech + 2 + certBonus) * 0.10 },
    { name: 'Government Sector Experience', dimension: 'Business', weight: 20, score: biz,
      justification: `${hasGov ? `Government sector experience is referenced but the majority of projects cited are outside the UAE/Abu Dhabi context. Local government delivery track record does not meet CPC's preferred threshold.` : `References are primarily from commercial clients. No verified UAE government project implementations were provided, which is a significant gap for this procurement.`}`,
      weighted: biz * 0.20 },
    { name: 'Training & Knowledge Transfer', dimension: 'Business', weight: 10, score: biz - 5,
      justification: `A basic training plan is included covering end-user and administrator roles. The knowledge transfer methodology lacks specificity on Arabic-language materials, CPC organisational structure, and post go-live support handover.`,
      weighted: (biz - 5) * 0.10 },
    { name: 'Total Cost of Ownership (TCO)', dimension: 'Commercial', weight: 20, score: finSc,
      justification: `Commercial proposal is within the acceptable range. However, the cost breakdown does not clearly separate implementation from licensing fees, and the annual support cost escalation clause is open-ended.`,
      weighted: finSc * 0.20 },
    { name: 'Commercial Terms & Payment Structure', dimension: 'Commercial', weight: 10, score: finSc - 6,
      justification: `Standard milestone-based payment terms with a 12-month warranty. No flexibility on payment timing was offered and the liability cap is below CPC's minimum contractual requirement.`,
      weighted: (finSc - 6) * 0.10 },
  ]
  const totalScore = Math.round(criteria.reduce((s, c) => s + c.weighted, 0))
  const verdict = totalScore >= 65 ? 'Qualifies for further consideration' : totalScore >= 55 ? 'Below preferred threshold — conditional consideration only' : 'Does not meet CPC minimum qualifying score of 60/100'

  return {
    scores: { business: Math.min(biz, 70), technical: Math.min(tech + certBonus, 72), financial: Math.min(finSc, 75), experience: Math.min(biz - 2, 68) },
    scoringDetails: criteria,
    summary: `${vendorName} scores ${totalScore}/100. Technical submission covers the baseline requirements but lacks depth on UAE government integration, local delivery experience, and Arabic-language support. Commercial terms are standard with limited flexibility. ${verdict}. Not recommended as primary award — retain in reserve list pending outcome of commercial negotiations with higher-ranked vendors.`,
  }
}

// ============================================================
// HELPERS — PDF TEXT EXTRACTION (text layer)
// Supports both uncompressed and FlateDecode-compressed streams
// using the Workers-native DecompressionStream('deflate-raw') API.
// ============================================================

/** Inflate a DEFLATE (FlateDecode) byte stream using the native Workers API. */
async function inflatePdfStream(compressed: Uint8Array): Promise<Uint8Array> {
  // PDF FlateDecode uses raw DEFLATE (zlib header + data). We try deflate-raw
  // first (strips 2-byte zlib header); if that fails, try 'deflate' (with header).
  for (const format of ['deflate-raw', 'deflate'] as const) {
    try {
      const ds = new DecompressionStream(format)
      const writer = ds.writable.getWriter()
      const reader = ds.readable.getReader()
      await writer.write(compressed)
      await writer.close()
      const chunks: Uint8Array[] = []
      let totalLen = 0
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
        totalLen += value.length
      }
      const result = new Uint8Array(totalLen)
      let offset = 0
      for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length }
      return result
    } catch (_) { /* try next format */ }
  }
  return new Uint8Array(0)
}

/** Extract printable text from a decompressed PDF stream buffer.
 *  Handles both Latin-1 (legacy) and UTF-16BE (FEFF BOM) encodings. */
/**
 * Detect whether extracted text is PostScript rendering bytecode rather than readable content.
 * Complex embedded-font PDFs produce output like "dup truncate sub 0 le pop .7882 .6588 .298"
 * which passes the length check but is garbage. This guards both the webhook extraction path
 * and the evaluation gate.
 *
 * Returns true if the text looks like PS garbage (should be discarded / queued for re-extraction).
 */
export function isPostScriptGarbage(text: string): boolean {
  if (!text || text.length < 100) return false
  const tokens = text.split(/\s+/).slice(0, 500)  // sample first 500 tokens
  let psOpCount = 0
  let numCount = 0
  let wordCount = 0
  for (const t of tokens) {
    if (!t) continue
    if (/^-?[0-9]+\.?[0-9]*$/.test(t)) { numCount++; continue }
    if (/^(dup|pop|exch|sub|add|mul|div|neg|abs|truncate|round|ceiling|floor|ifelse|if|loop|for|def|put|get|exec|load|store|begin|end|true|false|null|NonStruct|setgray|setrgbcolor|moveto|lineto|curveto|closepath|fill|stroke|clip|newpath|translate|scale|rotate|concat|setfont|findfont|scalefont|show|showpage|gsave|grestore|rg|RG|re|cm|Tj|TJ|BT|ET|Tf|Td|TD|Tm|Tc|Tw|Tz)$/.test(t)) { psOpCount++; continue }
    if (/^[A-Za-z]{3,}/.test(t)) wordCount++
  }
  const total = tokens.length || 1
  const psRatio = (psOpCount + numCount) / total
  // Garbage heuristic: >40% of tokens are PS operators/numbers AND <20% are real words
  return psRatio > 0.40 && wordCount / total < 0.20
}

// PostScript operators that appear in content streams but are NOT readable text.
// These come from complex font encodings (Type3, embedded PostScript programs, colour ops, etc.)
const PS_OPERATOR_RE = /^(?:dup|pop|exch|sub|add|mul|div|mod|neg|abs|truncate|round|ceiling|floor|sqrt|exp|ln|log|sin|cos|atan|idiv|copy|roll|index|mark|cleartomark|counttomark|and|or|not|xor|bitshift|eq|ne|gt|ge|lt|le|ifelse|if|loop|repeat|for|forall|exit|stop|exec|load|store|def|put|get|known|where|currentfile|filter|closefile|flush|flushfile|print|pstack|stack|type|cvn|cvs|cvi|cvr|string|array|dict|begin|end|gsave|grestore|setgray|setrgbcolor|setcmykcolor|setlinewidth|setlinecap|setlinejoin|moveto|lineto|curveto|closepath|fill|stroke|clip|newpath|currentpoint|translate|scale|rotate|concat|setfont|findfont|scalefont|makefont|show|showpage|copypage|erasepage|initgraphics|rg|RG|re|w|W|W\*|n|h|f|F|f\*|b|b\*|B|B\*|q|Q|cm|m|l|c|v|y|k|K|g|G|d|ri|i|cs|CS|scn|SCN|sc|SC|sh|Do|BI|ID|EI|BMC|BDC|EMC|MP|DP|BT|ET|Tc|Tw|Tz|TL|Tf|Tr|Ts|Td|TD|Tm|T\*|Tj|TJ|\')\s*$/.test

function isPostScriptOperatorLine(s: string): boolean {
  // Lines that are purely PDF/PostScript operators (no readable text)
  // Filter: if >50% of tokens look like PS operators or numbers, skip it.
  const tokens = s.trim().split(/\s+/)
  if (tokens.length === 0) return false
  let opCount = 0
  for (const t of tokens) {
    if (/^-?[0-9]+\.?[0-9]*$/.test(t)) { opCount++; continue }  // number
    if (/^[A-Z][A-Z*]?$/.test(t) && t.length <= 3) { opCount++; continue } // short PDF ops (RG, rg, Tf, Td, Tj, TJ, BT, ET, etc.)
    if (/^(dup|pop|exch|sub|add|mul|div|neg|abs|truncate|round|ceiling|floor|ifelse|if|loop|for|def|put|get|exec|load|store|begin|end|true|false|null|NonStruct)$/.test(t)) { opCount++ }
  }
  return opCount > tokens.length * 0.45
}

function extractTextFromStreamBytes(buf: Uint8Array): string {
  // Detect UTF-16BE (starts with FEFF BOM)
  if (buf.length >= 2 && buf[0] === 0xFE && buf[1] === 0xFF) {
    try {
      const utf16text = new TextDecoder('utf-16be').decode(buf.slice(2))
      return utf16text.replace(/[^\x20-\x7E\n\r\t\u0600-\u06FF]/g, ' ')
    } catch (_) { /* fall through */ }
  }
  const latin = new TextDecoder('latin1').decode(buf)
  const lines: string[] = []

  // BT...ET text blocks with Tj / TJ operators
  const btRegex = /BT\s*([\s\S]*?)\s*ET/g
  let btMatch: RegExpExecArray | null
  while ((btMatch = btRegex.exec(latin)) !== null) {
    const block = btMatch[1]
    const tjRegex = /\(((?:[^()\\]|\\[\s\S])*)\)\s*Tj/g
    let m: RegExpExecArray | null
    while ((m = tjRegex.exec(block)) !== null) {
      const text = m[1]
        .replace(/\\n/g,'\n').replace(/\\r/g,'\r')
        .replace(/\\\(/g,'(').replace(/\\\)/g,')').replace(/\\\\/g,'\\')
      // Skip lines that are just PostScript operators
      if (!isPostScriptOperatorLine(text)) lines.push(text)
    }
    const arrRegex = /\[((?:[^\[\]]*\([^()]*\)[^\[\]]*)*)\]\s*TJ/g
    while ((m = arrRegex.exec(block)) !== null) {
      const inner = m[1].match(/\(([^()]*)\)/g) || []
      for (const p of inner) {
        const text = p.slice(1,-1)
        if (!isPostScriptOperatorLine(text)) lines.push(text)
      }
    }
  }

  // If no BT/ET found, treat the whole stream as plain text (for some stream types)
  if (lines.length === 0) {
    const words = latin.match(/[A-Za-z][A-Za-z0-9 .,;:!?()\-']{8,}/g) || []
    lines.push(...words)
  }
  return lines.join(' ').replace(/\s+/g,' ').replace(/[^\x20-\x7E\n]/g,' ').trim()
}

export async function extractPdfText(bytes: Uint8Array): Promise<string> {
  try {
    const latin = new TextDecoder('latin1').decode(bytes)
    const collectedText: string[] = []

    // --- Pass 1: uncompressed BT/ET text blocks (for PDFs without compression) ---
    const btRegex = /BT\s*([\s\S]*?)\s*ET/g
    let btMatch: RegExpExecArray | null
    while ((btMatch = btRegex.exec(latin)) !== null) {
      const block = btMatch[1]
      const tjRegex = /\(((?:[^()\\]|\\[\s\S])*)\)\s*Tj/g
      let m: RegExpExecArray | null
      while ((m = tjRegex.exec(block)) !== null) {
        collectedText.push(m[1].replace(/\\n/g,'\n').replace(/\\\(/g,'(').replace(/\\\)/g,')').replace(/\\\\/g,'\\'))
      }
      const arrRegex = /\[((?:[^\[\]]*\([^()]*\)[^\[\]]*)*)\]\s*TJ/g
      while ((m = arrRegex.exec(block)) !== null) {
        const inner = m[1].match(/\(([^()]*)\)/g) || []
        for (const p of inner) collectedText.push(p.slice(1,-1))
      }
    }

    // --- Pass 2: decompress FlateDecode streams ---
    // Locate each stream object header and extract compressed payload
    const streamStartRe = /stream\r?\n/g
    const streamEndMarker = 'endstream'
    let sMatch: RegExpExecArray | null
    let streamCount = 0
    while ((sMatch = streamStartRe.exec(latin)) !== null && streamCount < 1000) {
      streamCount++
      const headerStart = Math.max(0, sMatch.index - 400)
      const headerSlice = latin.slice(headerStart, sMatch.index)

      // Only decompress FlateDecode streams
      if (!headerSlice.includes('FlateDecode')) continue

      // Try to find Length from the object dictionary
      const lenMatch = headerSlice.match(/\/Length\s+(\d+)/)
      const dataStart = sMatch.index + sMatch[0].length

      let compressedBytes: Uint8Array
      if (lenMatch) {
        const declaredLen = parseInt(lenMatch[1], 10)
        if (declaredLen <= 0 || declaredLen > 20_000_000) continue
        compressedBytes = bytes.slice(dataStart, dataStart + declaredLen)
      } else {
        // Fallback: scan for 'endstream' marker in latin string
        const endIdx = latin.indexOf(streamEndMarker, dataStart)
        if (endIdx < 0 || endIdx - dataStart > 20_000_000) continue
        // Strip trailing \r\n before endstream
        let endPos = endIdx
        if (endPos > 0 && latin[endPos-1] === '\n') endPos--
        if (endPos > 0 && latin[endPos-1] === '\r') endPos--
        compressedBytes = bytes.slice(dataStart, endPos)
      }

      if (compressedBytes.length < 4) continue

      const decompressed = await inflatePdfStream(compressedBytes)
      if (decompressed.length === 0) continue

      const streamText = extractTextFromStreamBytes(decompressed)
      if (streamText.length > 10) collectedText.push(streamText)

      // Stop early if we have enough text — 60k chars covers most full proposals
      const currentTotal = collectedText.join(' ').length
      if (currentTotal > 60_000) break
    }

    const combined = collectedText.join(' ').replace(/\s+/g,' ').replace(/[^\x20-\x7E\n]/g,' ').trim()
    if (combined.length > 100) return combined.slice(0, 60000)

    // --- Last resort: ASCII word sequences from raw bytes ---
    const asciiWords = latin.match(/[A-Za-z][A-Za-z0-9 .,;:!?()\-']{20,}/g) || []
    return asciiWords.slice(0, 1000).join(' ').slice(0, 60000)
  } catch(err) {
    console.error('[extractPdfText] error:', err)
    return ''
  }
}

// ============================================================
// VISION-BASED PDF TEXT EXTRACTION
// ============================================================
// Called when extractPdfText() returns 0 useful chars (Type3 fonts,
// vector-graphics-only PDFs, FlateDecode-only with no readable BT blocks).
//
// Strategy: Use Claude Sonnet (claude-sonnet-4-5) with Anthropic's native
// PDF document support via the `document` content type. This is the
// recommended approach for the Genspark LLM proxy which supports Claude models.
//
// Returns extracted text (may be empty string if vision also fails).
// ============================================================

async function extractPdfTextWithVision(bytes: Uint8Array, filename: string, env: any): Promise<string> {
  const apiKey = env?.OPENAI_API_KEY || (globalThis as any).OPENAI_API_KEY || ''
  const baseUrl = env?.OPENAI_BASE_URL || 'https://www.genspark.ai/api/llm_proxy/v1'
  if (!apiKey) {
    console.warn('[vision] No OPENAI_API_KEY — skipping vision extraction')
    return ''
  }

  // Encode the PDF as base64
  const base64Pdf = uint8ToBase64(bytes)
  const fileSizeMb = (bytes.length / 1_048_576).toFixed(1)

  const extractionSystemPrompt = `You are a document text extractor. Extract ALL readable text from this PDF document completely and verbatim.
Rules:
- Extract every word, number, table cell, heading, and sentence visible on every page.
- For tables: preserve rows and columns clearly (use | as column separator).
- For pricing tables: capture EVERY number, currency amount (AED, USD etc), total, subtotal exactly as shown.
- For timelines/Gantt charts: describe each phase, duration, start/end months, and all role names.
- For team/resource sections: list every role, person, allocation.
- Do NOT summarize — extract verbatim content.
- If a page has no text (decorative/blank), write "--- [Page N: no text content] ---".
- Output plain text only, no markdown formatting.`

  console.log(`[vision] Sending ${filename} (${fileSizeMb} MB, ${base64Pdf.length} b64 chars) to Claude for PDF text extraction`)

  // --- Attempt 1: Claude with Anthropic-style document content block ---
  // claude-sonnet-4-5 natively supports PDF documents via the `document` content type.
  // Many LLM proxies (including Genspark) support this format for Claude models.
  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 4096,
        temperature: 0.1,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'document',
                source: {
                  type: 'base64',
                  media_type: 'application/pdf',
                  data: base64Pdf
                },
                title: filename,
                context: extractionSystemPrompt,
              },
              {
                type: 'text',
                text: `Please extract all text from this PDF document (${filename}). Follow the extraction rules above. Output plain text only.`
              }
            ]
          }
        ]
      })
    })

    const responseText = await res.text().catch(() => '')
    if (res.ok) {
      let data: any = {}
      try { data = JSON.parse(responseText) } catch { /* ignore */ }
      // Claude returns content as array [{type:'text', text:'...'}] or choices[0].message.content
      const content = data.choices?.[0]?.message?.content || data.content?.[0]?.text || ''
      const extracted = typeof content === 'string' ? content : (Array.isArray(content) ? content.map((b: any) => b.text || '').join('') : '')
      if (extracted.length >= 100) {
        console.log(`[vision] Claude document extraction OK: ${extracted.length} chars from ${filename}`)
        return extracted
      }
      console.warn(`[vision] Claude document extraction returned too little: ${extracted.length} chars. Raw response start: ${responseText.slice(0, 200)}`)
    } else {
      console.error(`[vision] Claude document attempt failed HTTP ${res.status}: ${responseText.slice(0, 500)}`)
    }
  } catch (err: any) {
    console.error(`[vision] Claude document attempt threw: ${err?.message}`)
  }

  // --- Attempt 2: Claude with plain text (base64 inline) ---
  // Fallback: send the base64 PDF as a plain text block.
  // Claude can sometimes parse PDF content from raw base64 in text messages.
  return await extractPdfTextWithVisionImages(bytes, filename, env)
}

// Fallback: send PDF as base64 in a plain text message to Claude.
// Used when the `document` content block approach is not supported.
async function extractPdfTextWithVisionImages(bytes: Uint8Array, filename: string, env: any): Promise<string> {
  const apiKey = env?.OPENAI_API_KEY || (globalThis as any).OPENAI_API_KEY || ''
  const baseUrl = env?.OPENAI_BASE_URL || 'https://www.genspark.ai/api/llm_proxy/v1'
  if (!apiKey) return ''

  // Truncate to 400KB base64 chars (~300KB PDF) to stay within context limits
  const base64Pdf = uint8ToBase64(bytes)
  const truncatedB64 = base64Pdf.slice(0, 400000)
  const wasTruncated = base64Pdf.length > 400000

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 4096,
        temperature: 0.1,
        messages: [
          {
            role: 'user',
            content: `This is a PDF document encoded as base64${wasTruncated ? ' (first portion only)' : ''}. Extract ALL text content from it verbatim, including all tables (use | for columns), all numbers/prices/AED amounts, all phase names, timelines, team roles, and headings. Output plain text only.\n\nFilename: ${filename}\nPDF base64 data:\n${truncatedB64}`
          }
        ]
      })
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => 'unknown')
      console.error(`[vision-fallback] Claude plain-text also failed: ${res.status}: ${errText.slice(0, 300)}`)
      return ''
    }
    const data = await res.json() as any
    const content = data.choices?.[0]?.message?.content || data.content?.[0]?.text || ''
    const text = typeof content === 'string' ? content : (Array.isArray(content) ? content.map((b: any) => b.text || '').join('') : '')
    console.log(`[vision-fallback] plain-text result: ${text.length} chars from ${filename}`)
    return text
  } catch (err: any) {
    console.error('[vision-fallback] error:', err?.message)
    return ''
  }
}

// ============================================================
// MASTER PDF EXTRACTION — tries text layer first, falls back to vision
// ============================================================
// This replaces all direct calls to extractPdfText() in the proposal
// submission / evaluation pipeline.
export async function extractPdfTextSmart(
  bytes: Uint8Array,
  filename: string,
  env: any,
  options?: { r2Key?: string; workerBaseUrl?: string }
): Promise<{ text: string; method: 'text' | 'vision' | 'failed'; chars: number; rawGarbage?: string }> {
  // Step 1: Try the existing text-layer extractor
  const textLayerResult = await extractPdfText(bytes)
  const isGarbage = isPostScriptGarbage(textLayerResult)
  const hasEnoughText = textLayerResult && !isGarbage && textLayerResult.length >= 200

  if (hasEnoughText) {
    console.log(`[smart-extract] ${filename}: text-layer OK (${textLayerResult.length} chars)`)
    return { text: textLayerResult, method: 'text', chars: textLayerResult.length }
  }

  // Step 2: Text layer failed or produced PostScript garbage.
  // Try Genspark Crawler fallback.
  // Strategy A (preferred for R2 files): pass the Worker's own PDF-serve URL — no upload, just streaming.
  // Strategy B (fallback): upload PDF bytes to Genspark blob storage, then crawl.
  const reason = !textLayerResult ? 'empty' : isGarbage ? 'PostScript-garbage' : 'too-short'
  console.warn(`[smart-extract] ${filename}: text-layer ${reason} (${textLayerResult?.length ?? 0} chars). Trying Genspark crawler fallback...`)

  try {
    let crawlerText: string
    if (options?.r2Key && options?.workerBaseUrl) {
      // Strategy A: Use the Worker's own /api/proposals/pdf/:key endpoint as source URL
      // No upload needed — crawler fetches the PDF directly from our Worker
      const pdfUrl = `${options.workerBaseUrl}/api/proposals/pdf/${encodeURIComponent(options.r2Key)}`
      console.log(`[smart-extract] ${filename}: Using Worker PDF URL strategy: ${pdfUrl}`)
      crawlerText = await extractPdfViaGenskarkCrawler(null, filename, env, pdfUrl)
    } else {
      // Strategy B: Upload bytes to Genspark blob storage (for cases without r2Key)
      console.log(`[smart-extract] ${filename}: Using upload strategy (no r2Key provided)`)
      crawlerText = await extractPdfViaGenskarkCrawler(bytes, filename, env, null)
    }

    if (crawlerText && crawlerText.length >= 200 && !isPostScriptGarbage(crawlerText)) {
      console.log(`[smart-extract] ${filename}: Genspark crawler OK (${crawlerText.length} chars)`)
      return { text: crawlerText, method: 'vision', chars: crawlerText.length, rawGarbage: textLayerResult }
    }
    console.warn(`[smart-extract] ${filename}: Genspark crawler returned insufficient text (${crawlerText?.length ?? 0} chars)`)
  } catch (crawlerErr: any) {
    console.error(`[smart-extract] ${filename}: Genspark crawler failed: ${crawlerErr?.message}`)
  }

  // All extraction methods failed — return rawGarbage for filename-based detection
  return { text: '', method: 'failed', chars: 0, rawGarbage: textLayerResult }
}

/**
 * Use the Genspark Crawler API to extract text from a PDF.
 * Supports two modes:
 *   - URL mode (preferred): pass a public URL for the PDF (e.g. the Worker's own /api/proposals/pdf/:key)
 *     The crawler fetches the PDF itself — no upload needed, no CPU overhead for the Worker.
 *   - Upload mode (fallback): pass PDF bytes to upload to Genspark blob storage first.
 *     Only used when no public URL is available (e.g. PDFs uploaded inline without R2).
 *
 * URL mode flow: POST /api/tool_cli/crawler with the PDF URL → extracted text
 *
 * Upload mode flow:
 *   1. POST /api/tool_cli/file/upload_url → get Azure blob upload URL + file wrapper URL
 *   2. PUT bytes to blob URL
 *   3. POST /api/tool_cli/crawler with the file wrapper URL → extracted text
 */
async function extractPdfViaGenskarkCrawler(
  bytes: Uint8Array | null,
  filename: string,
  env: any,
  directUrl: string | null
): Promise<string> {
  const gskApiKey = (env as any).GSK_API_KEY
  const gskProjectId = (env as any).GSK_PROJECT_ID || ''
  if (!gskApiKey) {
    throw new Error('GSK_API_KEY secret not configured')
  }

  const baseUrl = 'https://www.genspark.ai'
  let pdfUrl: string

  if (directUrl) {
    // URL mode: use the provided URL directly (no upload)
    pdfUrl = directUrl
    console.log(`[gsk-crawler] Using direct URL for ${filename}: ${pdfUrl}`)
  } else if (bytes) {
    // Upload mode: upload bytes to Genspark blob storage first
    console.log(`[gsk-crawler] Uploading ${filename} (${bytes.length} bytes) to Genspark storage...`)

    // Step 1: Get upload URL from Genspark
    const uploadUrlRes = await fetch(`${baseUrl}/api/tool_cli/file/upload_url`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${gskApiKey}`,
        'Content-Type': 'application/json',
        ...(gskProjectId ? { 'X-Project-Id': gskProjectId } : {}),
      },
      body: JSON.stringify({
        content_type: 'application/pdf',
        name: filename,
        ...(gskProjectId ? { project_id: gskProjectId } : {}),
      }),
    })

    if (!uploadUrlRes.ok) {
      const errText = await uploadUrlRes.text()
      throw new Error(`Upload URL request failed ${uploadUrlRes.status}: ${errText.slice(0, 200)}`)
    }

    const uploadUrlData = await uploadUrlRes.json() as any
    const blobUploadUrl: string = uploadUrlData?.data?.upload_url || uploadUrlData?.upload_url
    const fileWrapperUrl: string = uploadUrlData?.data?.file_wrapper_url || uploadUrlData?.file_wrapper_url

    if (!blobUploadUrl || !fileWrapperUrl) {
      throw new Error(`Invalid upload URL response: ${JSON.stringify(uploadUrlData).slice(0, 300)}`)
    }

    // Step 2: Upload PDF bytes to blob storage
    const putRes = await fetch(blobUploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/pdf',
        'x-ms-blob-type': 'BlockBlob',  // Required for Azure Blob Storage
      },
      body: bytes,
    })

    if (!putRes.ok) {
      const errText = await putRes.text()
      throw new Error(`Blob upload failed ${putRes.status}: ${errText.slice(0, 200)}`)
    }

    pdfUrl = fileWrapperUrl
    console.log(`[gsk-crawler] PDF uploaded. File wrapper URL: ${pdfUrl}`)
  } else {
    throw new Error('extractPdfViaGenskarkCrawler: either bytes or directUrl must be provided')
  }

  // Call Genspark Crawler API with the PDF URL
  console.log(`[gsk-crawler] Calling crawler for ${filename}...`)
  const crawlerRes = await fetch(`${baseUrl}/api/tool_cli/crawler`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${gskApiKey}`,
      'Content-Type': 'application/json',
      ...(gskProjectId ? { 'X-Project-Id': gskProjectId } : {}),
    },
    body: JSON.stringify({
      url: pdfUrl,
      ...(gskProjectId ? { project_id: gskProjectId } : {}),
    }),
  })

  if (!crawlerRes.ok) {
    const errText = await crawlerRes.text()
    throw new Error(`Crawler API failed ${crawlerRes.status}: ${errText.slice(0, 200)}`)
  }

  const crawlerData = await crawlerRes.json() as any
  const extractedText: string = crawlerData?.data?.result || crawlerData?.result || ''

  console.log(`[gsk-crawler] Extracted ${extractedText.length} chars from ${filename}`)
  return extractedText
}

// Streaming variant — accepts an R2ObjectBody and pipes its ReadableStream body
// directly to Genspark blob storage upload, then calls the crawler.
// This avoids loading large files (13MB, 25MB) into Worker memory via arrayBuffer().
async function extractPdfViaGenskarkCrawlerStreaming(
  r2Object: R2ObjectBody,
  filename: string,
  env: any,
): Promise<string> {
  const gskApiKey = (env as any).GSK_API_KEY
  const gskProjectId = (env as any).GSK_PROJECT_ID || ''
  if (!gskApiKey) {
    throw new Error('GSK_API_KEY secret not configured')
  }

  const baseUrl = 'https://www.genspark.ai'
  console.log(`[gsk-crawler-stream] Uploading ${filename} (size: ${r2Object.size} bytes) via streaming...`)

  // Step 1: Get a pre-signed upload URL from Genspark
  const uploadUrlRes = await fetch(`${baseUrl}/api/tool_cli/file/upload_url`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${gskApiKey}`,
      'Content-Type': 'application/json',
      ...(gskProjectId ? { 'X-Project-Id': gskProjectId } : {}),
    },
    body: JSON.stringify({
      content_type: 'application/pdf',
      name: filename,
      ...(gskProjectId ? { project_id: gskProjectId } : {}),
    }),
  })

  if (!uploadUrlRes.ok) {
    const errText = await uploadUrlRes.text()
    throw new Error(`Upload URL request failed ${uploadUrlRes.status}: ${errText.slice(0, 200)}`)
  }

  const uploadUrlData = await uploadUrlRes.json() as any
  const blobUploadUrl: string = uploadUrlData?.data?.upload_url || uploadUrlData?.upload_url
  const fileWrapperUrl: string = uploadUrlData?.data?.file_wrapper_url || uploadUrlData?.file_wrapper_url

  if (!blobUploadUrl || !fileWrapperUrl) {
    throw new Error(`Invalid upload URL response: ${JSON.stringify(uploadUrlData).slice(0, 300)}`)
  }

  // Step 2: Stream R2 body directly to Azure Blob — no arrayBuffer() buffering
  // r2Object.body is a ReadableStream<Uint8Array>
  const putRes = await fetch(blobUploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/pdf',
      'x-ms-blob-type': 'BlockBlob',
      ...(r2Object.size ? { 'Content-Length': String(r2Object.size) } : {}),
    },
    body: r2Object.body,
    // @ts-ignore — duplex is required by some runtimes for streaming request bodies
    duplex: 'half',
  })

  if (!putRes.ok) {
    const errText = await putRes.text()
    throw new Error(`Blob streaming upload failed ${putRes.status}: ${errText.slice(0, 200)}`)
  }

  console.log(`[gsk-crawler-stream] Streamed upload complete. File wrapper URL: ${fileWrapperUrl}`)

  // Step 3: Call Genspark Crawler with the uploaded file URL
  const crawlerRes = await fetch(`${baseUrl}/api/tool_cli/crawler`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${gskApiKey}`,
      'Content-Type': 'application/json',
      ...(gskProjectId ? { 'X-Project-Id': gskProjectId } : {}),
    },
    body: JSON.stringify({
      url: fileWrapperUrl,
      ...(gskProjectId ? { project_id: gskProjectId } : {}),
    }),
  })

  if (!crawlerRes.ok) {
    const errText = await crawlerRes.text()
    throw new Error(`Crawler API failed ${crawlerRes.status}: ${errText.slice(0, 200)}`)
  }

  const crawlerData = await crawlerRes.json() as any
  const extractedText: string = crawlerData?.data?.result || crawlerData?.result || ''

  console.log(`[gsk-crawler-stream] Extracted ${extractedText.length} chars from ${filename}`)
  return extractedText
}

// ============================================================
// WRONG-DOCUMENT DETECTION
// ============================================================
// Detects when a vendor submitted the wrong file (e.g. the RFP document
// itself instead of their proposal). Returns a detection result.
async function detectWrongDocument(
  text: string,
  filename: string,
  submittingVendorName: string,
  rfpRefNumber: string,
  rfpTitle: string,
  env: any
): Promise<{ isWrong: boolean; reason: string; detectedDocType: string }> {
  // --- Filename-based detection (works even when text extraction failed) ---
  const filenameLower = filename.toLowerCase().replace(/[^a-z0-9\s]/g, ' ')
  const rfpTitleLower = (rfpTitle || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ')
  const rfpTitleWords = rfpTitleLower.split(/\s+/).filter(w => w.length > 3)
  const filenameWords = filenameLower.split(/\s+/).filter(w => w.length > 3)

  // Check 1: Filename closely matches this RFP's title → vendor submitted the RFP itself.
  const overlap = rfpTitleWords.filter(w => filenameWords.includes(w)).length
  const overlapRatio = rfpTitleWords.length > 0 ? overlap / rfpTitleWords.length : 0
  if (overlapRatio >= 0.5 && overlap >= 2) {
    return {
      isWrong: true,
      reason: `The submitted file "${filename}" appears to be the RFP document itself ("${rfpTitle}"), not a vendor proposal. ${overlap}/${rfpTitleWords.length} key words in the filename match the RFP title. The vendor likely uploaded the wrong file by mistake.`,
      detectedDocType: 'RFP document',
    }
  }

  // Check 2: Filename looks like a procurement/project document for a DIFFERENT project.
  // Pattern: "<Project Title> — <Organization>.pdf" or filenames with procurement keywords.
  // Vendor proposals are usually named like "VendorName - Technical Proposal.pdf" or
  // "Andersen_CRM_Response.pdf", not like "CRM Modernisation — Crown Prince's Court.pdf".
  const rfpFilenameSignals = [
    'request for proposal', 'scope of work', 'terms of reference', 'tor',
    'modernisation', 'modernization', 'implementation plan', 'feasibility',
    'specification', 'procurement', 'tender document', 'rfp',
  ]
  // Organization/government name signals that appear in document titles, not proposal names
  const orgNameSignals = [
    "crown prince", "crown prince's court", "ministry", "government", "authority",
    "municipality", "department", "agency", "council", "bureau", "commission",
  ]
  const filenameHasRfpSignal = rfpFilenameSignals.some(s => filenameLower.includes(s))
  const filenameHasOrgSignal = orgNameSignals.some(s => filenameLower.includes(s))
  // Typical vendor proposal filenames contain vendor name or "proposal"/"response"/"bid"
  const filenameHasProposalSignal = ['proposal', 'response', 'bid', 'offer', 'submission', 'quotation'].some(s => filenameLower.includes(s))
  // If the submitting vendor's own name appears in the filename, it's almost certainly
  // their own document (vendors often name files like "VendorName - ProjectName.pdf").
  // Never flag it as wrong based on filename alone in that case.
  const vendorNameLower = (submittingVendorName || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ')
  const vendorWords = vendorNameLower.split(/\s+/).filter(w => w.length > 2)
  const filenameHasVendorName = vendorWords.length > 0 && vendorWords.some(w => filenameLower.includes(w))
  // If filename has BOTH procurement signals AND org signals but NO proposal signals → likely wrong document
  // IMPORTANT: An org name alone (e.g. "Crown Prince Court - Data platform.pdf") is NOT sufficient
  // to flag wrong doc — vendors routinely name files after the client project.
  // Only flag based on filename if there is an explicit RFP/procurement keyword AND an org signal,
  // OR an explicit procurement keyword alone (e.g. "RFP_Document.pdf", "Scope of Work.pdf").
  // Never flag based on org name alone.
  if (filenameHasRfpSignal && !filenameHasProposalSignal && !filenameHasVendorName) {
    const docType = 'procurement document'
    return {
      isWrong: true,
      reason: `The submitted file "${filename}" appears to be a ${docType} (not a vendor proposal). The filename contains procurement/project terminology rather than vendor submission terminology. The vendor likely uploaded the wrong file — perhaps the RFP or SOW they downloaded, instead of their own proposal document.`,
      detectedDocType: docType,
    }
  }

  if (!text || text.length < 200) {
    return { isWrong: false, reason: '', detectedDocType: 'unknown' }
  }

  // Fast heuristic: does the text contain strong RFP-authoring signals?
  const textLower = text.toLowerCase()
  const rfpSignals = [
    'request for proposal',
    'scope of work',
    'evaluation criteria',
    'proposal submission requirements',
    'mandatory requirements',
    'vendor qualification',
    'terms and conditions',
    'instruction to bidders',
    'closing date for submissions',
    'evaluation committee',
  ]
  const vendorSignals = [
    'our team',
    'our approach',
    'we propose',
    'our solution',
    'our company',
    'our experience',
    'we have',
    'we will',
    'years of experience',
    'our methodology',
    'proposed timeline',
    'commercial proposal',
    'technical proposal',
  ]

  const rfpHits = rfpSignals.filter(s => textLower.includes(s)).length
  const vendorHits = vendorSignals.filter(s => textLower.includes(s)).length

  // Does the vendor's own name appear in the document?
  // Proposals always mention the submitting vendor's name. If it does, it's almost
  // certainly their own document regardless of other signals.
  const vendorMentioned = submittingVendorName
    ? textLower.includes(submittingVendorName.toLowerCase().split(' ')[0].toLowerCase())
    : true

  // Does it contain a DIFFERENT RFP ref number than expected?
  const refMatch = text.match(/CPC\/PROC\/\d{4}\/\d+/g)
  const differentRef = refMatch && !refMatch.includes(rfpRefNumber) && refMatch.length > 0
  const foundRef = refMatch ? refMatch[0] : null

  // If the doc looks overwhelmingly like an RFP with NO vendor signals and vendor not mentioned:
  // Use a strict threshold — proposals often quote RFP language in compliance matrices.
  // Only flag if: lots of RFP signals (>=5), almost no vendor signals (<=1), AND vendor not mentioned.
  const looksLikeRfp = rfpHits >= 5 && vendorHits <= 1 && !vendorMentioned

  if (looksLikeRfp || differentRef) {
    const reason = differentRef
      ? `Document appears to be RFP ${foundRef} — a different procurement document, not a vendor proposal for ${rfpRefNumber}. The file "${filename}" was likely uploaded by mistake.`
      : `Document contains RFP-authoring language (${rfpHits} procurement issuer signals vs ${vendorHits} vendor proposal signals) and does not mention the submitting vendor. This appears to be a procurement/tender document, not a vendor submission.`
    return {
      isWrong: true,
      reason,
      detectedDocType: differentRef ? `RFP document (${foundRef})` : 'RFP/tender document'
    }
  }

  return { isWrong: false, reason: '', detectedDocType: 'vendor proposal' }
}

// ── Detect whether an attachment is a technical, commercial, or other proposal ──
// Uses filename keywords; the label is stored in proposal_attachments JSON and
// shown in the UI to help evaluators quickly identify each document's role.
function detectAttachmentLabel(filename: string): 'technical' | 'commercial' | 'other' {
  const lower = (filename || '').toLowerCase()
  if (lower.match(/commerc|financ|pricing|cost|budget|price|bill|quotat|commercial/)) return 'commercial'
  if (lower.match(/tech|solution|architect|scope|approach|method|delivery|proposal|rfp|response|sow/)) return 'technical'
  return 'other'
}

export function extractProposedDuration(text: string): string {
  if (!text) return ''
  // Look for duration patterns
  const patterns = [
    /(?:proposed?|estimated?|total|project)\s+(?:duration|timeline|period|implementation)\s*[:=]?\s*(\d+[\s-]*(?:month|week|year)s?(?:\s+(?:end-to-end|overall|total))?)/i,
    /(\d+[\s-]*month)s?\s+(?:end-to-end|overall|total|implementation|delivery)/i,
    /(?:deliver(?:y|ed?)|complet(?:e|ion)|go-live)\s+(?:in|within|by)\s+(\d+[\s-]*(?:month|week|year)s?)/i,
    /timeline\s*:\s*(\d+[\s-]*(?:month|week|year)s?)/i,
  ]
  for (const pattern of patterns) {
    const m = text.match(pattern)
    if (m) return m[1].trim()
  }
  return ''
}

// ============================================================
// HELPERS — XLSX WRITER (for QA Response export)
// ============================================================
function generateQAExcel(questions: any[]): Uint8Array {
  // Build a minimal valid XLSX file (ZIP + XML)
  // Structure: [Content_Types].xml, xl/workbook.xml, xl/worksheets/sheet1.xml, xl/styles.xml, xl/sharedStrings.xml

  const sharedStrings: string[] = []
  const sharedStringMap: Record<string, number> = {}

  function getSharedStringIdx(val: string): number {
    if (sharedStringMap[val] !== undefined) return sharedStringMap[val]
    const idx = sharedStrings.length
    sharedStrings.push(val)
    sharedStringMap[val] = idx
    return idx
  }

  // Build rows
  const rows: Array<[string, string, string, string]> = [
    ['#', 'Question', 'Answer', 'Vendor'],
    ...questions.map((q: any, i: number) => [
      String(i + 1),
      q.question || '',
      q.answer || '',
      q.vendor_name || 'Unknown',
    ]),
  ]

  // Build sheet XML
  let sheetRows = ''
  rows.forEach((row, rowIdx) => {
    let cellsXml = ''
    row.forEach((cell, colIdx) => {
      const colLetter = String.fromCharCode(65 + colIdx)
      const cellRef = `${colLetter}${rowIdx + 1}`
      const ssIdx = getSharedStringIdx(String(cell))
      cellsXml += `<c r="${cellRef}" t="s"><v>${ssIdx}</v></c>`
    })
    sheetRows += `<row r="${rowIdx + 1}">${cellsXml}</row>`
  })

  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetData>${sheetRows}</sheetData>
</worksheet>`

  const sharedStringsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${sharedStrings.length}" uniqueCount="${sharedStrings.length}">
${sharedStrings.map(s => `<si><t xml:space="preserve">${escXml(s)}</t></si>`).join('')}
</sst>`

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="Q&amp;A Responses" sheetId="1" r:id="rId1"/></sheets>
</workbook>`

  const workbookRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
</Relationships>`

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
</Types>`

  const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`

  // Build ZIP file in memory
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': encodeUtf8(contentTypesXml),
    '_rels/.rels': encodeUtf8(relsXml),
    'xl/workbook.xml': encodeUtf8(workbookXml),
    'xl/_rels/workbook.xml.rels': encodeUtf8(workbookRelsXml),
    'xl/worksheets/sheet1.xml': encodeUtf8(sheetXml),
    'xl/sharedStrings.xml': encodeUtf8(sharedStringsXml),
  }

  return buildZip(files)
}

function encodeUtf8(str: string): Uint8Array {
  return new TextEncoder().encode(str)
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 8192
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  return btoa(binary)
}

// ─────────────────────────────────────────────────────────────────────────────
// REAL PDF GENERATOR — produces a valid PDF 1.4 binary from plain text content
// Works in Cloudflare Workers (no Node.js / headless browser needed).
// Strips HTML tags from rfp.content and lays out the text as PDF text objects.
// ─────────────────────────────────────────────────────────────────────────────
function generateRfpPdf(rfp: any): Uint8Array {
  const enc = new TextEncoder()

  // Strip HTML, decode entities, clean up whitespace
  const rawText = (rfp?.content || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|li|h[1-6]|tr|td|th|section|article)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  // Build header lines
  const headerLines = [
    'Crown Prince\'s Court — Procurement & Contracting',
    `Reference: ${rfp?.ref_number || ''}`,
    `Title: ${rfp?.title || 'Request for Proposal'}`,
    `Date: ${new Date().toLocaleDateString('en-GB')}`,
    '─────────────────────────────────────────────────────────',
    '',
  ]

  const fullText = headerLines.join('\n') + '\n' + rawText + '\n\n' +
    '─────────────────────────────────────────────────────────\n' +
    'Official procurement document — Crown Prince\'s Court, Abu Dhabi, UAE\n' +
    `Reference: ${rfp?.ref_number || ''} | Generated: ${new Date().toLocaleDateString('en-GB')}`

  // Split into lines, then into pages (≈ 55 lines per page)
  const LINE_W = 95  // chars per line before wrapping
  const LINES_PER_PAGE = 52
  const PAGE_W = 595.28  // A4 width in pt
  const PAGE_H = 841.89  // A4 height in pt
  const MARGIN_L = 57    // 20mm
  const MARGIN_T = 800   // top y (from bottom)
  const LINE_H = 14      // pt per line
  const FONT_SIZE = 10

  // Word-wrap each source line to LINE_W chars
  function wrapLine(line: string): string[] {
    if (line.length <= LINE_W) return [line]
    const words = line.split(' ')
    const out: string[] = []
    let cur = ''
    for (const w of words) {
      if ((cur + (cur ? ' ' : '') + w).length <= LINE_W) {
        cur = cur ? cur + ' ' + w : w
      } else {
        if (cur) out.push(cur)
        cur = w.length > LINE_W ? w.slice(0, LINE_W) : w
      }
    }
    if (cur) out.push(cur)
    return out
  }

  const allLines: string[] = []
  for (const raw of fullText.split('\n')) {
    for (const wrapped of wrapLine(raw)) {
      allLines.push(wrapped)
    }
  }

  // Split into pages
  const pages: string[][] = []
  for (let i = 0; i < allLines.length; i += LINES_PER_PAGE) {
    pages.push(allLines.slice(i, i + LINES_PER_PAGE))
  }
  if (pages.length === 0) pages.push(['(No content)'])

  // PDF escape: parens and backslash
  function pdfStr(s: string): string {
    return s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)').replace(/[\x80-\xff]/g, (c) => `\\${c.charCodeAt(0).toString(8).padStart(3,'0')}`)
  }

  // Build PDF objects
  const objects: string[] = []
  const offsets: number[] = []

  function addObj(content: string): number {
    const n = objects.length + 1
    objects.push(content)
    return n
  }

  // Object 1: Catalog (filled after we know page refs)
  // Object 2: Pages (filled after page content objects created)
  // We build content objects first, then circle back.

  // Page content streams
  const pageContentObjNums: number[] = []
  const pageObjNums: number[] = []

  // Reserve obj 1 (catalog) and obj 2 (pages) as placeholders
  objects.push('')  // placeholder obj 1
  objects.push('')  // placeholder obj 2

  for (const pageLines of pages) {
    // Build BT...ET text block
    // Use Tm (absolute text matrix) for each line — Td is cumulative and causes misplacement
    let textCmds = `BT\n/F1 ${FONT_SIZE} Tf\n`
    let y = MARGIN_T
    for (const line of pageLines) {
      // Tm sets absolute text matrix: [1 0 0 1 x y] Tm  (identity + translation)
      textCmds += `1 0 0 1 ${MARGIN_L} ${y} Tm\n(${pdfStr(line)}) Tj\n`
      y -= LINE_H
    }
    textCmds += 'ET\n'

    const stream = enc.encode(textCmds)
    const contentObj = `<< /Length ${stream.length} >>\nstream\n` +
      new TextDecoder('latin1').decode(stream) +
      '\nendstream'
    const contentNum = objects.length + 1
    objects.push(contentObj)
    pageContentObjNums.push(contentNum)

    // Page object
    const pageNum = objects.length + 1
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Contents ${contentNum} 0 R /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> >>`)
    pageObjNums.push(pageNum)
  }

  // Fill placeholder obj 1: Catalog
  objects[0] = `<< /Type /Catalog /Pages 2 0 R >>`

  // Fill placeholder obj 2: Pages
  const kidsRef = pageObjNums.map(n => `${n} 0 R`).join(' ')
  objects[1] = `<< /Type /Pages /Kids [${kidsRef}] /Count ${pages.length} >>`

  // Build PDF bytes
  const header = `%PDF-1.4\n%\xE2\xE3\xCF\xD3\n`
  let body = header
  const bodyOffsets: number[] = []

  for (let i = 0; i < objects.length; i++) {
    bodyOffsets.push(body.length)
    body += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`
  }

  // Cross-reference table
  const xrefOffset = body.length
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const off of bodyOffsets) {
    body += String(off).padStart(10, '0') + ' 00000 n \n'
  }

  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`

  // Encode as latin1 bytes (PDF is a binary format)
  const result = new Uint8Array(body.length)
  for (let i = 0; i < body.length; i++) {
    result[i] = body.charCodeAt(i) & 0xff
  }
  return result
}

function buildZip(files: Record<string, Uint8Array>): Uint8Array {
  const parts: Uint8Array[] = []
  const centralDir: Uint8Array[] = []
  let offset = 0

  for (const [name, data] of Object.entries(files)) {
    const nameBytes = encodeUtf8(name)
    // Local file header
    const header = new Uint8Array(30 + nameBytes.length)
    const dv = new DataView(header.buffer)
    dv.setUint32(0, 0x04034b50, true)  // signature
    dv.setUint16(4, 20, true)           // version needed
    dv.setUint16(6, 0, true)            // flags
    dv.setUint16(8, 0, true)            // compression (stored)
    dv.setUint16(10, 0, true)           // mod time
    dv.setUint16(12, 0, true)           // mod date
    dv.setUint32(14, crc32(data), true) // CRC-32
    dv.setUint32(18, data.length, true) // compressed size
    dv.setUint32(22, data.length, true) // uncompressed size
    dv.setUint16(26, nameBytes.length, true) // filename length
    dv.setUint16(28, 0, true)           // extra length
    header.set(nameBytes, 30)

    parts.push(header)
    parts.push(data)

    // Central directory entry
    const cd = new Uint8Array(46 + nameBytes.length)
    const cdv = new DataView(cd.buffer)
    cdv.setUint32(0, 0x02014b50, true)  // signature
    cdv.setUint16(4, 20, true)           // version made by
    cdv.setUint16(6, 20, true)           // version needed
    cdv.setUint16(8, 0, true)            // flags
    cdv.setUint16(10, 0, true)           // compression
    cdv.setUint16(12, 0, true)           // mod time
    cdv.setUint16(14, 0, true)           // mod date
    cdv.setUint32(16, crc32(data), true) // CRC-32
    cdv.setUint32(20, data.length, true) // compressed size
    cdv.setUint32(24, data.length, true) // uncompressed size
    cdv.setUint16(28, nameBytes.length, true) // filename length
    cdv.setUint16(30, 0, true)           // extra length
    cdv.setUint16(32, 0, true)           // comment length
    cdv.setUint16(34, 0, true)           // disk number start
    cdv.setUint16(36, 0, true)           // internal attributes
    cdv.setUint32(38, 0, true)           // external attributes
    cdv.setUint32(42, offset, true)      // relative offset
    cd.set(nameBytes, 46)
    centralDir.push(cd)

    offset += header.length + data.length
  }

  // End of central directory
  const cdSize = centralDir.reduce((s, cd) => s + cd.length, 0)
  const eocd = new Uint8Array(22)
  const eocdv = new DataView(eocd.buffer)
  eocdv.setUint32(0, 0x06054b50, true)
  eocdv.setUint16(4, 0, true)
  eocdv.setUint16(6, 0, true)
  eocdv.setUint16(8, centralDir.length, true)
  eocdv.setUint16(10, centralDir.length, true)
  eocdv.setUint32(12, cdSize, true)
  eocdv.setUint32(16, offset, true)
  eocdv.setUint16(20, 0, true)

  const allParts = [...parts, ...centralDir, eocd]
  const totalLen = allParts.reduce((s, p) => s + p.length, 0)
  const result = new Uint8Array(totalLen)
  let pos = 0
  for (const p of allParts) {
    result.set(p, pos)
    pos += p.length
  }
  return result
}

function crc32(data: Uint8Array): number {
  // Standard CRC-32 table
  let table: number[] | undefined
  if (!table) {
    table = []
    for (let i = 0; i < 256; i++) {
      let c = i
      for (let j = 0; j < 8; j++) {
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
      }
      table[i] = c
    }
  }
  let crc = 0xFFFFFFFF
  for (let i = 0; i < data.length; i++) {
    crc = table[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8)
  }
  return (crc ^ 0xFFFFFFFF) >>> 0
}

function buildAwardEmail(winner: any, rfp: any): string {
  return `Dear ${winner.vendor_name || 'Vendor'},

Subject: CONTRACT AWARD NOTIFICATION — ${rfp?.title || 'CPC RFP'}

Reference: ${rfp?.ref_number || 'N/A'}
Decision Date: ${new Date().toLocaleDateString('en-AE', { year: 'numeric', month: 'long', day: 'numeric' })}

On behalf of the Crown Prince's Court (CPC), Abu Dhabi, we are pleased to formally notify you that following a comprehensive evaluation process involving ${winner.vendor_name} and other qualified vendors, the Evaluation Committee has unanimously decided to AWARD the contract for:

"${rfp?.title || 'CPC Digital Transformation Project'}"

to ${winner.vendor_name}.

Your proposal demonstrated exceptional quality across all evaluation dimensions, including technical capability, UAE government sector experience, and project delivery approach. The Evaluation Committee was particularly impressed by the depth of your technical solution, your implementation methodology, and your proven delivery track record with UAE government entities.

NEXT STEPS:
1. The CPC Contracts team will be in contact within 3 business days to initiate contract negotiations.
2. Please prepare your legal and commercial teams for contract finalization meetings.
3. A formal contract will be issued within 14 business days.
4. Please acknowledge receipt of this notification by replying to this email.

We look forward to a successful partnership with ${winner.vendor_name} in delivering this critical initiative for the Crown Prince's Court.

Congratulations once again on this achievement.

Best regards,
Procurement & Contracting Department
Crown Prince's Court
Abu Dhabi, United Arab Emirates
procurement@cpc-rfp.website`
}


// ============================================================
// HELPER — XML/HTML ESCAPING
// ============================================================
function escXml(s: any): string {
  if (!s) return ''
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

// ============================================================
// HELPERS — SCORING MODEL
// ============================================================
function buildScoringModel(rfp: any): any {
  const isERP = (rfp.title || '').toLowerCase().includes('erp')
  const isDWH = (rfp.title || '').toLowerCase().includes('data')
  const isOracle = (rfp.title || '').toLowerCase().includes('oracle')

  return {
    rfp_id: rfp.id,
    version: '1.0',
    total_weight: 100,
    dimensions: [
      { name: 'Technical', weight: 40, color: '#0f3460' },
      { name: 'Business', weight: 30, color: '#7c3aed' },
      { name: 'Commercial', weight: 30, color: '#c9a84c' },
    ],
    criteria: [
      { name: 'Solution Architecture & Methodology', dimension: 'Technical', weight: 15, description: 'Quality and completeness of proposed technical solution architecture', scoring_guide: '0-49: Insufficient; 50-69: Basic; 70-84: Good; 85-100: Excellent' },
      { name: 'Implementation Approach & Timeline', dimension: 'Technical', weight: 15, description: 'Feasibility of proposed project plan, milestones, and risk management', scoring_guide: '0-49: Unrealistic; 50-69: Feasible; 70-84: Detailed; 85-100: Exemplary' },
      { name: 'Technical Team Qualifications', dimension: 'Technical', weight: 10, description: isOracle ? 'Oracle certifications, relevant UAE government experience' : 'Team certifications and relevant experience', scoring_guide: '0-49: Missing certs; 50-69: Basic certs; 70-84: Certified; 85-100: Expert team' },
      { name: 'Government Sector Experience', dimension: 'Business', weight: 20, description: 'Verified references for UAE/GCC government implementations in last 5 years', scoring_guide: '0-49: None; 50-69: 1-2 refs; 70-84: 3 refs; 85-100: 3+ UAE gov refs' },
      { name: 'Training & Knowledge Transfer', dimension: 'Business', weight: 10, description: 'Comprehensiveness of training plan and knowledge transfer framework', scoring_guide: '0-49: Minimal; 50-69: Standard; 70-84: Comprehensive; 85-100: Best-in-class' },
      { name: 'Total Cost of Ownership (TCO)', dimension: 'Commercial', weight: 20, description: 'Competitiveness and transparency of complete cost proposal (implementation + licensing + support)', scoring_guide: '0-49: Overpriced; 50-69: Market; 70-84: Competitive; 85-100: Best value' },
      { name: 'Commercial Terms & Payment Structure', dimension: 'Commercial', weight: 10, description: 'Flexibility, milestone-based payment, warranty terms, and post-go-live support costs', scoring_guide: '0-49: Poor terms; 50-69: Standard; 70-84: Flexible; 85-100: Excellent' },
    ],
    notes: 'Minimum qualifying score: 60/100 overall. Vendors scoring below 50/100 on any single dimension are automatically disqualified. Reference checks will be conducted for all shortlisted vendors before final award decision.',
  }
}

// ============================================================
// HELPERS — EVALUATION
// ============================================================
function computeEvalScores(p: any, isAndersen: boolean, isEPAM: boolean): { business: number, technical: number, financial: number } {
  if (isAndersen) {
    // Andersen: excellent technical + business, slightly above market on cost
    return { business: 88, technical: 92, financial: 74 }
  }
  if (isEPAM) {
    // EPAM: excellent technical, good business, very competitive cost
    return { business: 80, technical: 89, financial: 87 }
  }
  // Simulated vendors — score based on profile
  let tech = 55 + Math.floor(Math.random() * 30)
  let biz = 50 + Math.floor(Math.random() * 30)
  const spec = (p.specializations || '').toLowerCase()
  const cert = (p.certifications || '').toLowerCase()
  const exp = (p.erp_experience || '').toLowerCase()
  if (spec.includes('erp')) tech += 5
  if (spec.includes('oracle')) tech += 5
  if (exp.includes('government')) biz += 10
  if (cert.includes('iso 27001')) biz += 5
  if (p.size === 'Large') biz += 5
  const fin = 55 + Math.floor(Math.random() * 35)
  return {
    business: Math.min(biz, 90),
    technical: Math.min(tech, 90),
    financial: Math.min(fin, 95),
  }
}

function buildEvalSummary(p: any, scores: any, total: number, isAndersen: boolean, isEPAM: boolean): string {
  if (isAndersen) {
    return `${p.vendor_name} demonstrates exceptional technical depth and extensive UAE government sector experience (${scores.technical}/100 Technical, ${scores.business}/100 Business). The commercial proposal reflects their premium positioning with a higher TCO (${scores.financial}/100 Commercial). Overall composite score: ${total}/100. RECOMMENDATION: Primary preferred vendor — outstanding technical and delivery credentials, negotiate on commercial terms.`
  }
  if (isEPAM) {
    return `${p.vendor_name} presents a technically strong proposal with a highly competitive commercial offer (${scores.technical}/100 Technical, ${scores.financial}/100 Commercial). Business references are solid but slightly fewer UAE government projects compared to top-ranked vendor (${scores.business}/100 Business). Overall composite score: ${total}/100. RECOMMENDATION: Strong alternative — excellent value for money, consider as preferred vendor if Andersen commercial terms cannot be met.`
  }
  const grade = total >= 80 ? 'Strong candidate' : total >= 65 ? 'Acceptable candidate' : total >= 50 ? 'Below threshold' : 'Disqualified'
  return `${grade} (${total}/100). Technical: ${scores.technical}/100, Business: ${scores.business}/100, Commercial: ${scores.financial}/100. ${total >= 70 ? 'Qualifies for further consideration.' : 'Does not meet minimum qualifying score of 60/100.'}`
}

function buildRecommendationSummary(top: any, second: any, rankings: any[]): string {
  const isAndersenTop = top.vendor_name?.includes('Andersen')
  const isEPAMSecond = second?.vendor_name?.includes('EPAM')

  if (isAndersenTop && isEPAMSecond) {
    return `<p>Based on comprehensive AI-driven evaluation of <strong>${rankings.length} submitted proposals</strong> using a weighted scoring model (Technical 40% | Business 30% | Commercial 30%), <strong>${top.vendor_name}</strong> is recommended as the <strong>preferred vendor</strong> with a composite score of <strong>${top.total_score}/100</strong>.</p>
<p><strong>Key differentiators for ${top.vendor_name}:</strong> The vendor demonstrates exceptional technical mastery in Oracle ERP/Data Warehouse implementations (${top.technical_score}/100), the highest business score reflecting deep UAE government sector credentials (${top.business_score}/100), and proven delivery track record for entities of CPC's complexity.</p>
<p><strong>Commercial Note:</strong> ${top.vendor_name}'s commercial proposal (${top.financial_score}/100) is marginally above ${second.vendor_name} (${second.financial_score}/100) — a difference of approximately 15-20% in estimated TCO. CPC Procurement recommends engaging ${top.vendor_name} in commercial negotiation to bridge this gap. If commercial alignment cannot be achieved within 10% variance, <strong>${second.vendor_name}</strong> (Score: ${second.total_score}/100) represents a technically excellent alternative at a more competitive price point.</p>
<p><strong>Recommended Action:</strong> Award contract to <strong>${top.vendor_name}</strong> subject to successful commercial negotiation. Retain ${second.vendor_name} as primary fallback. Notify all other vendors of outcome as per CPC procurement policy.</p>`
  }

  return `<p>Based on comprehensive AI-driven evaluation of <strong>${rankings.length} submitted proposals</strong>, <strong>${top.vendor_name}</strong> is recommended as the preferred vendor with a composite score of <strong>${top.total_score}/100</strong>.</p>
<p>Key differentiators include strong technical capability (${top.technical_score}/100), competitive commercial proposal (${top.financial_score}/100), and proven government sector experience (${top.business_score}/100).</p>
<p>Procurement Management endorses proceeding with contract negotiations with <strong>${top.vendor_name}</strong> as primary vendor${second ? ', with ' + second.vendor_name + ' (Score: ' + second.total_score + '/100) retained as fallback option.' : '.'}</p>`
}

// ============================================================
// HELPERS — VENDOR SCORING
// ============================================================
function computeVendorScore(v: any, rfp: any): number {
  const specs = (v.specializations || '').toLowerCase()
  const exp   = (v.erp_experience || '').toLowerCase()
  const certs = (v.certifications || '').toLowerCase()
  const rfpTitle = (rfp?.title || '').toLowerCase()
  const rfpScope = (rfp?.scope || '').toLowerCase()
  const rfpTech  = (rfp?.tech_requirements || '').toLowerCase()
  const rfpAll   = rfpTitle + ' ' + rfpScope + ' ' + rfpTech

  // ---- Determine RFP technology type ----
  const rfpNeedsOracle = rfpAll.includes('oracle') || rfpAll.includes('ebs') || rfpAll.includes('r12')
  const rfpNeedsERP    = rfpAll.includes('erp') || rfpNeedsOracle
  const rfpNeedsData   = rfpAll.includes('data') || rfpAll.includes('warehouse') || rfpAll.includes('dwh') || rfpAll.includes('bi') || rfpAll.includes('tableau') || rfpAll.includes('analytics') || rfpAll.includes('ai platform') || rfpAll.includes('machine learning')
  const rfpNeedsCRM    = rfpAll.includes('crm') || rfpAll.includes('salesforce') || rfpAll.includes('dynamics')
  const rfpNeedsSAP    = rfpAll.includes('sap')

  // ---- Start from baseline ----
  let score = 30
  const reasons: string[] = []
  const gaps: string[] = []

  // ---- CRITERION 1: Platform specificity (most important, worth up to 35 pts) ----
  if (rfpNeedsOracle) {
    if (specs.includes('oracle ebs') || specs.includes('oracle erp') || exp.includes('oracle ebs')) {
      score += 35; reasons.push('Oracle EBS specialist')
    } else if (specs.includes('oracle')) {
      score += 20; reasons.push('Oracle platform experience')
    } else if (specs.includes('jd edwards') || specs.includes('peoplesoft')) {
      score += 10; reasons.push('Oracle family product experience')
    } else if (specs.includes('sap') && !specs.includes('oracle')) {
      score += 2; gaps.push('SAP specialist — Oracle EBS not in portfolio')
    } else if (specs.includes('workday') || specs.includes('dynamics') || specs.includes('infor') || specs.includes('ifs') || specs.includes('sage') || specs.includes('odoo') || specs.includes('unit4') || specs.includes('epicor') || specs.includes('netsuite') || specs.includes('acumatica') || specs.includes('ramco')) {
      score += 1; gaps.push('Non-Oracle ERP platform — RFP requires Oracle EBS R12')
    } else {
      gaps.push('No Oracle EBS expertise identified')
    }
  } else if (rfpNeedsSAP) {
    if (specs.includes('sap')) { score += 35; reasons.push('SAP specialist') }
    else { gaps.push('No SAP expertise') }
  } else if (rfpNeedsCRM) {
    if (specs.includes('crm') || specs.includes('salesforce') || specs.includes('dynamics')) { score += 30; reasons.push('CRM platform match') }
  } else if (rfpNeedsERP) {
    if (specs.includes('erp')) { score += 20; reasons.push('ERP experience') }
  }

  // ---- CRITERION 2: AI / Data platform on-premise capability (up to 20 pts) ----
  if (rfpNeedsData) {
    const hasDataEng = specs.includes('data warehouse') || specs.includes('data engineering') || specs.includes('etl') || specs.includes('dwh') || specs.includes('medallion')
    const hasBI      = specs.includes('tableau') || specs.includes('power bi') || specs.includes('bi') || specs.includes('visualization')
    const hasAI      = specs.includes('ai') || specs.includes('machine learning') || specs.includes('ml') || specs.includes('analytics')
    if (hasDataEng && hasBI) { score += 20; reasons.push('Data engineering + BI platform capability') }
    else if (hasDataEng) { score += 13; reasons.push('Data engineering capability') }
    else if (hasBI) { score += 10; reasons.push('BI/reporting capability') }
    else if (hasAI) { score += 8; reasons.push('AI/analytics capability') }
    else { gaps.push('No data/BI platform expertise') }
  }

  // ---- CRITERION 3: Government sector experience (up to 15 pts) ----
  if (exp.includes('government') || specs.includes('government') || specs.includes('public sector')) {
    if (exp.includes('uae') || exp.includes('abu dhabi') || exp.includes('mena')) {
      score += 15; reasons.push('UAE/GCC government delivery track record')
    } else {
      score += 10; reasons.push('Government sector experience')
    }
  } else {
    gaps.push('No government sector references')
  }

  // ---- CRITERION 4: Certifications & maturity (up to 10 pts) ----
  if (certs.includes('iso 27001')) { score += 5; reasons.push('ISO 27001 certified') }
  if (certs.includes('cmmi') || certs.includes('iso 9001')) { score += 3; reasons.push('Process maturity certified') }
  if (certs.includes('oracle gold') || certs.includes('oracle partner')) { score += 4; reasons.push('Oracle Gold Partner') }

  // ---- CRITERION 5: Vendor size & brand (up to 10 pts) ----
  // EPAM gets brand premium as a large, globally recognised engineering firm
  if (v.name?.includes('EPAM')) {
    score += 10; reasons.push('Global engineering leader — strong brand & scale')
  } else if (v.size === 'Large') {
    score += 5; reasons.push('Large enterprise vendor')
  } else if (v.size === 'Medium') {
    score += 3
  }

  // Andersen gets direct recognition for known Oracle EBS + UAE government delivery
  if (v.name?.includes('Andersen')) {
    score += 5; reasons.push('Proven Oracle EBS UAE government delivery (reference: CPC)')
  }

  return Math.min(Math.round(score), 100)
}

function buildFitRationale(v: any, score: number): string {
  const specs = (v.specializations || '').toLowerCase()
  const exp   = (v.erp_experience || '').toLowerCase()

  const hasOracle  = specs.includes('oracle ebs') || specs.includes('oracle')
  const hasData    = specs.includes('data') || specs.includes('etl') || specs.includes('tableau') || specs.includes('bi')
  const hasGovt    = exp.includes('government') || specs.includes('government')
  const isEPAM     = v.name?.includes('EPAM')
  const isAndersen = v.name?.includes('Andersen')

  if (score >= 80) {
    if (isAndersen) return 'Exceptional fit: Oracle EBS R12.2 specialist with verified UAE government delivery, Medallion DWH + Tableau experience, CMMI L3. Top recommended vendor for this RFP.'
    if (isEPAM) return 'Excellent fit: Oracle Gold Partner + data engineering + Tableau capabilities, CMMI L5, global scale. Highly competitive on cost. Strong alternative to top vendor.'
    return `Strong fit (${score}/100): ${[hasOracle && 'Oracle expertise', hasData && 'Data/BI capability', hasGovt && 'Government experience'].filter(Boolean).join(', ')}. Recommended for shortlist.`
  }
  if (score >= 60) {
    return `Moderate fit (${score}/100): ${[hasOracle && 'Oracle experience', hasData && 'data/BI background', hasGovt && 'government references'].filter(Boolean).join(', ') || 'meets partial requirements'}. Review specific capability gaps before shortlisting.`
  }
  if (score >= 40) {
    return `Limited fit (${score}/100): Vendor's primary platform does not align with Oracle EBS requirement. Consider only if scope changes to generic ERP.`
  }
  return `Not recommended (${score}/100): Vendor specializes in ${specs.split(',')[0] || 'other platforms'}, which does not match Oracle EBS + Data Platform requirements of this RFP.`
}

// ============================================================
// HELPERS — EMAIL SENDING
// ============================================================
function buildParticipantCode(rfpId: number | string, vendorId: number | string): string {
  return `RFP-${rfpId}-V${vendorId}`
}

function buildInvitationEmailText(v: any, rfp: any, qDeadline: string, sDeadline: string, notes: string, baseUrl?: string): string {
  const participantCode = buildParticipantCode(rfp?.id || 0, v.id)
  const submissionUrl = baseUrl
    ? `${baseUrl}/submit/${rfp?.id || 0}?code=${participantCode}`
    : `https://a7b32759-e743-4139-9bb0-4bae44886667.vip.gensparksite.com/submit/${rfp?.id || 0}?code=${participantCode}`
  return `Dear ${v.name},

We are pleased to invite ${v.name} to participate in the competitive tendering process for the following procurement:

INVITATION TO TENDER
RFP Title:        ${rfp?.title || 'CPC RFP'}
Reference Number: ${rfp?.ref_number || 'N/A'}
Issuing Entity:   Crown Prince's Court (CPC), Abu Dhabi

IMPORTANT DATES:
- Questions Submission Deadline: ${qDeadline}
- Proposal Submission Deadline:  ${sDeadline}
- Evaluation Period:             Following submission deadline

HOW TO SUBMIT YOUR PROPOSAL:
Use the dedicated secure submission portal below to upload your proposal documents:

  ${submissionUrl}

Your unique Participant Reference Code (pre-filled in the link above):
  ${participantCode}

SUBMISSION GUIDELINES:
1. Access the submission portal using the link above — your Participant Reference is pre-filled.
2. Submit your questions by email, replying to this message with a spreadsheet (xlsx/csv): Ref | Section | Question
3. Upload Technical and Commercial proposals as separate PDF documents via the portal.
4. Late submissions will not be accepted under any circumstances.

Please find the full RFP document attached to this email for your review.

${notes ? 'ADDITIONAL NOTES:\n' + notes + '\n\n' : ''}We look forward to receiving your proposal.

Best regards,
Procurement & Contracting Department
Crown Prince's Court
Abu Dhabi, United Arab Emirates
procurement@cpc-rfp.website

──────────────────────────────────────────────
PARTICIPANT REFERENCE: ${participantCode}
SUBMISSION PORTAL:     ${submissionUrl}
──────────────────────────────────────────────`
}

async function sendRealEmail(
  to: string, subject: string, bodyText: string, rfp: any, env?: any
): Promise<{ ok: boolean; id?: string; error?: string; simulated?: boolean }> {
  // HARD CONSTRAINT: Only send real emails to @andersenlab.com addresses.
  // All other domains must be simulated — never reach Resend API.
  const toAddr = (to || '').toLowerCase().trim()
  if (!toAddr.endsWith('@andersenlab.com')) {
    console.log(`[email] SIMULATED (non-andersenlab domain): ${to}`)
    return { ok: true, id: 'simulated-' + Date.now(), simulated: true }
  }

  const RESEND_API_KEY = env?.RESEND_API_KEY || (globalThis as any).RESEND_API_KEY || ''
  if (!RESEND_API_KEY) {
    return { ok: false, error: 'RESEND_API_KEY not configured' }
  }

  // Build the HTML version of the cover email
  const htmlBody = `<div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;padding:24px">
    <div style="background:#1a1a2e;color:#c9a84c;padding:18px 24px;border-radius:8px 8px 0 0;display:flex;align-items:center;gap:12px">
      <span style="font-size:22px">👑</span>
      <div>
        <div style="font-size:16px;font-weight:700">Crown Prince's Court — Procurement</div>
        <div style="font-size:12px;color:#e5c87a;opacity:0.85">procurement@cpc-rfp.website</div>
      </div>
    </div>
    <div style="background:#fff;padding:28px;border:1px solid #e5e7eb;border-radius:0 0 8px 8px">
      <pre style="white-space:pre-wrap;font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#111">${bodyText.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</pre>
    </div>
    <div style="margin-top:12px;font-size:11px;color:#9ca3af;text-align:center">
      This is an official procurement communication from the Crown Prince's Court, Abu Dhabi.
    </div>
  </div>`

  // Build the RFP attachment as a genuine PDF binary (valid PDF 1.4)
  // generateRfpPdf() strips HTML tags and produces text pages readable by any viewer.
  const rfpRef = (rfp?.ref_number || 'document').replace(/\//g,'_')
  const rfpFilename = `RFP_${rfpRef}.pdf`
  let attachments: any[] = []
  if (rfp?.content) {
    const pdfBytes = generateRfpPdf(rfp)
    const attachBase64 = uint8ToBase64(pdfBytes)
    attachments = [{
      filename: rfpFilename,
      content: attachBase64,
      content_type: 'application/pdf',
    }]
  }

  try {
    const payload: any = {
      from: 'CPC Procurement <procurement@cpc-rfp.website>',
      to: [to],
      subject: subject,
      text: bodyText,
      html: htmlBody,
      attachments,
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    let data: any = {}
    try { data = await res.json() } catch(_) {}

    if (res.ok) {
      return { ok: true, id: data.id }
    } else {
      const errMsg = data.message || data.name || `HTTP ${res.status}`
      return { ok: false, error: errMsg }
    }
  } catch(e: any) {
    return { ok: false, error: e.message || 'network error' }
  }
}

async function readVendorEmailReplies(rfp: any): Promise<string[]> {
  // Inbound emails are now handled via Resend webhook (POST /api/webhook/inbound-email)
  // This function is kept for backward compatibility but is no longer the primary path
  return []
}

// ─────────────────────────────────────────────────────────────────────────────
// XLSX PARSER — Workers-native async DecompressionStream (replaces broken tinflate)
// Uses native Workers DecompressionStream('deflate-raw') for DEFLATE decompression
// ─────────────────────────────────────────────────────────────────────────────

/** Inflate a DEFLATE-compressed (method 8) byte array using native Workers API. */
async function inflateAsync(compressed: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate-raw')
  const writer = ds.writable.getWriter()
  const reader = ds.readable.getReader()
  // Write all compressed data then close the writer
  await writer.write(compressed)
  await writer.close()
  // Collect decompressed chunks
  const chunks: Uint8Array[] = []
  let totalLen = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    totalLen += value.length
  }
  // Concatenate all chunks into a single Uint8Array
  const result = new Uint8Array(totalLen)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }
  return result
}

/** Unzip all ZIP entries from raw bytes. Returns map of { filename → bytes }. */
async function unzipEntries(bytes: Uint8Array): Promise<Record<string, Uint8Array>> {
  const entries: Record<string, Uint8Array> = {}

  // Validate ZIP magic: PK\x03\x04
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4B || bytes[2] !== 0x03 || bytes[3] !== 0x04) {
    throw new Error('Not a valid ZIP file')
  }

  // Walk through local file headers (signature PK\x03\x04 = 0x04034B50)
  let pos = 0
  while (pos < bytes.length - 4) {
    const sig = (bytes[pos] | (bytes[pos+1] << 8) | (bytes[pos+2] << 16) | (bytes[pos+3] << 24)) >>> 0
    if (sig !== 0x04034B50) break  // Not a local file header — stop

    const method       = bytes[pos+8]  | (bytes[pos+9] << 8)
    const compSize     = bytes[pos+18] | (bytes[pos+19] << 8) | (bytes[pos+20] << 16) | (bytes[pos+21] << 24)
    const uncompSize   = bytes[pos+22] | (bytes[pos+23] << 8) | (bytes[pos+24] << 16) | (bytes[pos+25] << 24)
    const fnLen        = bytes[pos+26] | (bytes[pos+27] << 8)
    const extraLen     = bytes[pos+28] | (bytes[pos+29] << 8)

    const fnStart  = pos + 30
    const dataStart = fnStart + fnLen + extraLen
    const filename  = new TextDecoder('utf-8').decode(bytes.slice(fnStart, fnStart + fnLen))
    const compData  = bytes.slice(dataStart, dataStart + compSize)

    if (method === 0) {
      // Stored — no compression
      entries[filename] = compData
    } else if (method === 8) {
      // DEFLATE — use native Workers DecompressionStream
      try {
        entries[filename] = await inflateAsync(compData)
      } catch (_) {
        // Skip files we can't decompress
      }
    }
    // Skip other methods (method 12 = bzip2, etc.) — xlsx never uses them

    pos = dataStart + compSize
  }
  return entries
}

/** Parse an xlsx ArrayBuffer entirely in the Workers runtime (no Node APIs).
 *  Returns the list of question strings found in the spreadsheet. */
async function parseXlsxBuffer(buf: ArrayBuffer): Promise<string[]> {
  try {
    const bytes = new Uint8Array(buf)
    const entries = await unzipEntries(bytes)

    // Find the shared strings table (xl/sharedStrings.xml)
    const ssKey = Object.keys(entries).find(k => k.endsWith('sharedStrings.xml'))
    const ssXml = ssKey ? new TextDecoder('utf-8').decode(entries[ssKey]) : ''

    // Parse shared strings: <si><t>VALUE</t></si>
    const sharedStrings: string[] = []
    const siRegex = /<si>([\s\S]*?)<\/si>/g
    let siMatch: RegExpExecArray | null
    while ((siMatch = siRegex.exec(ssXml)) !== null) {
      // Collect all <t>...</t> runs inside the <si>
      const tRegex = /<t[^>]*>([\s\S]*?)<\/t>/g
      let text = ''
      let tMatch: RegExpExecArray | null
      while ((tMatch = tRegex.exec(siMatch[1])) !== null) {
        text += tMatch[1]
      }
      sharedStrings.push(text.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'"))
    }

    // Find the first worksheet (xl/worksheets/sheet1.xml)
    const sheetKey = Object.keys(entries).find(k => k.match(/xl\/worksheets\/sheet\d+\.xml/))
    if (!sheetKey) return []
    const sheetXml = new TextDecoder('utf-8').decode(entries[sheetKey])

    // Parse all rows and cells
    type CellMap = Record<string, string>
    const rows: CellMap[] = []
    const rowRegex = /<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g
    let rowMatch: RegExpExecArray | null
    while ((rowMatch = rowRegex.exec(sheetXml)) !== null) {
      const rowNum = parseInt(rowMatch[1]) - 1
      const rowXml = rowMatch[2]
      const cells: CellMap = {}
      const cellRegex = /<c\s+r="([A-Z]+)(\d+)"([^>]*)>([\s\S]*?)<\/c>/g
      let cellMatch: RegExpExecArray | null
      while ((cellMatch = cellRegex.exec(rowXml)) !== null) {
        const col = cellMatch[1]
        const attrs = cellMatch[3]
        const inner = cellMatch[4]
        // Get cell value
        const vMatch = /<v>([\s\S]*?)<\/v>/.exec(inner)
        const tMatch = /<t[^>]*>([\s\S]*?)<\/t>/.exec(inner)
        let val = ''
        if (attrs.includes('t="s"') && vMatch) {
          // Shared string reference
          const idx = parseInt(vMatch[1])
          val = sharedStrings[idx] || ''
        } else if (attrs.includes('t="inlineStr"') && tMatch) {
          val = tMatch[1]
        } else if (vMatch) {
          val = vMatch[1]
        }
        cells[col] = val
      }
      while (rows.length <= rowNum) rows.push({})
      Object.assign(rows[rowNum], cells)
    }

    if (rows.length === 0) return []

    // Detect header row (first row) — look for a column containing "question"
    const headerRow = rows[0]
    let questionCol = ''
    for (const [col, val] of Object.entries(headerRow)) {
      if (/question/i.test(String(val))) { questionCol = col; break }
    }
    // Fallback: use column C (typically "Question" in CPC template)
    if (!questionCol) questionCol = 'C'

    // Extract questions from data rows (skip header)
    const questions: string[] = []
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i]
      if (!row || Object.keys(row).length === 0) continue
      let q = (row[questionCol] || '').trim()
      // If question column is empty, try the longest cell
      if (!q) {
        let longest = ''
        for (const v of Object.values(row)) { if (String(v).length > longest.length) longest = String(v) }
        q = longest.trim()
      }
      if (q.length < 10) continue
      if (/^(question|ref|section|no\.|#|item)/i.test(q)) continue
      if (!q.endsWith('?')) q += '?'
      questions.push(q)
    }

    return questions.slice(0, 50)
  } catch (_e) {
    return []
  }
}

function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder('utf-8').decode(bytes)
}


/** Parse CSV/plain-text spreadsheet (fallback when xlsx parser not applicable). */
function parseCsvQuestions(text: string): string[] {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0)
  const questions: string[] = []
  for (const line of lines) {
    // Strip CSV quotes, BOM, leading numbers/ref like "Q1" "1." etc.
    let q = line.replace(/^[\uFEFF"]+|["]+$/g, '')
               .replace(/^Q[0-9]+[.):\s]*/i, '')
               .replace(/^[0-9]+[.):\s]+/, '').trim()
    if (q.length < 15) continue
    if (/^(question|no\.|ref\.?|#|item|sr\.?|section)/i.test(q)) continue
    if (!q.endsWith('?')) q += '?'
    questions.push(q)
  }
  return questions.slice(0, 50)
}

// Parse numbered/bulleted questions from plain email body text
function parseQuestionsFromBody(text: string): string[] {
  if (!text) return []
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0)
  const questions: string[] = []
  for (const line of lines) {
    const isNumbered = /^[0-9]{1,2}[.):\s]/.test(line)
    const isBulleted = /^[-•*]\s/.test(line)
    const hasQuestion = line.includes('?')
    if ((isNumbered || isBulleted) && hasQuestion && line.length > 20) {
      let q = line.replace(/^[0-9]{1,2}[.):\s]+/, '').replace(/^[-•*]\s+/, '').trim()
      questions.push(q)
    }
  }
  return questions.slice(0, 20)
}

function getAndersenSampleQuestions(): string[] {
  return [
    'What is the expected project implementation timeline from contract signing to full go-live across all modules?',
    'Does CPC have an existing Oracle EBS R12.2 environment we can leverage, or will this be a greenfield implementation?',
    'What is the scope of data migration — specifically, how many years of historical transactional data needs to be migrated from legacy systems?',
    'Are there specific UAE Pass integration requirements, and what is the current state of UAE Pass adoption within CPC?',
    'What are the infrastructure specifications for the production environment, and will the vendor have direct access to the CPC data center?',
    'Is the Medallion Architecture (Bronze/Silver/Gold) a hard requirement, or can we propose an alternative DWH architecture that achieves the same business outcomes?',
    'What is the current state of master data quality in the existing legacy systems — has any data profiling or cleansing been done previously?',
    'Are there any existing integrations with Ministry of Finance or other government portals that must remain operational without disruption during implementation?',
  ]
}

// ============================================================
// HELPERS — PROPOSALS
// ============================================================
function buildVendorProposal(v: any, isAndersen: boolean, isEPAM: boolean): any {
  if (isAndersen) {
    return {
      technical: `TECHNICAL PROPOSAL — ${v.name}\n\nExecutive Summary:\nAndersen Lab proposes a phased, risk-mitigated delivery approach leveraging our certified Oracle EBS team's deep experience across 12+ UAE government implementations. Our solution fully addresses CPC's requirements for Entity O onboarding, Data Warehouse implementation using Medallion Architecture, and Tableau BI deployment.\n\nApproach:\nPhase 1 (Oracle ERP): We will leverage existing CPC Oracle EBS R12.2 configuration as a baseline, ensuring minimal disruption and accelerated delivery. Our Oracle-certified team will configure HRMS, Finance, Procurement, and System Administration modules with complete SoD compliance.\n\nPhase 2 (DWH & BI): Medallion Architecture implementation using industry-standard ETL framework. Tableau Server on-premises with AD integration, role-based dashboards for all departments.\n\nProposed Timeline: 14 months end-to-end (Phase 1: 8 months, Phase 2: 6 months concurrent)\nTeam: 8 certified Oracle professionals + 3 Tableau/DWH specialists + dedicated PM\nReferences: Available for 3 UAE government Oracle EBS implementations (2021-2024)`,
      financial: 4800000,
      status: 'real',
    }
  }
  if (isEPAM) {
    return {
      technical: `TECHNICAL PROPOSAL — EPAM Systems\n\nEPAM Systems proposes a modern, engineering-excellence driven approach to CPC's ERP and Data Platform requirements. Our global delivery center with UAE-based leadership team combines world-class software engineering with deep Oracle expertise.\n\nApproach:\nPhase 1 (Oracle ERP): Agile-based configuration sprints with bi-weekly CPC stakeholder reviews. Our certified Oracle EBS team will configure all required modules with automated testing framework ensuring quality at every milestone.\n\nPhase 2 (DWH & BI): Cloud-native Medallion Architecture on UAE Azure with Tableau Server for BI. Our data engineering team will implement best-practice pipelines ensuring AI/ML readiness from day one.\n\nProposed Timeline: 13 months end-to-end\nTeam: 6 Oracle certified consultants + 4 data engineers + 2 Tableau experts + PM + Scrum Master\nKey Differentiator: EPAM's proprietary delivery accelerators reduce implementation time by 20% vs. traditional waterfall`,
      financial: 3950000,
      status: 'submitted',
    }
  }
  const financial = 4000000 + Math.floor(Math.random() * 3000000)
  return {
    technical: `Technical Proposal from ${v.name}:\n\nOur team proposes a comprehensive solution leveraging our ${v.specializations || 'enterprise software'} expertise. The approach ensures minimal disruption while delivering a future-ready platform aligned with CPC standards.\n\nProposed Timeline: 14-18 months.\nTeam: Certified professionals for each module.\nReferences: UAE government implementations available upon request.`,
    financial: financial,
    status: 'submitted',
  }
}

// ============================================================
// HELPERS — Q&A
// ============================================================
function draftAnswer(question: string): string {
  const q = question.toLowerCase()
  if (q.includes('timeline') || q.includes('duration') || q.includes('go-live')) return 'The expected project timeline is 12-18 months for full end-to-end delivery across both phases, including discovery, design, configuration/development, UAT, training, and go-live. A detailed project plan with milestones and RACI will be required as part of the technical proposal. The exact timeline will be agreed during contract negotiation based on the vendor\'s approach.'
  if (q.includes('data migration') || q.includes('historical data') || q.includes('legacy')) return 'Data migration scope encompasses employee records, supplier master, Chart of Accounts segments, item master, and location data. The scope of historical transactional data migration (years and volume) will be finalized during the Business Requirements (BRD) phase. Vendors should provide their data migration methodology in the technical proposal and highlight any risks or assumptions.'
  if (q.includes('integrat') || q.includes('uae pass') || q.includes('ministry')) return 'Integration requirements include: UAE Pass for citizen/staff authentication, Active Directory for SSO, Ministry of Finance e-payment gateway, Abu Dhabi Government Portal, and CPC\'s existing SOA middleware. A detailed integration specification will be provided to shortlisted vendors during the technical due diligence session. UAE Pass integration is mandatory for the production environment.'
  if (q.includes('training') || q.includes('support') || q.includes('knowledge transfer')) return 'Comprehensive training is mandatory across all user levels: end-user training (role-specific), system administrator training, and management/reporting training. Post-go-live hypercare support of minimum 90 days is required, followed by a minimum 24-month warranty period with defined SLAs and a dedicated support point of contact.'
  if (q.includes('arabic') || q.includes('language') || q.includes('rtl')) return 'Full Arabic language support is a mandatory, non-negotiable requirement. The system must support RTL text rendering across all modules and reports, Arabic date formats with Hijri calendar, Arabic UI for all user-facing screens, and bilingual document generation. All deliverables — documentation, training materials, and user guides — must be provided in both Arabic and English.'
  if (q.includes('cloud') || q.includes('hosting') || q.includes('infrastructure') || q.includes('data center')) return 'The solution must be hosted on CPC\'s on-premises data center infrastructure, with UAE data residency being a non-negotiable requirement. Any cloud component must use UAE-based cloud services (Microsoft Azure UAE, AWS Middle East UAE, or UAE G-Cloud) with formal data residency confirmation. Vendor must coordinate with CPC IT team for infrastructure provisioning and DBA support.'
  if (q.includes('budget') || q.includes('cost') || q.includes('price') || q.includes('financial')) return 'The indicative budget envelope will be shared with shortlisted vendors during the technical briefing session. The commercial proposal must include a phase-wise cost breakdown covering: software licensing, implementation professional services, project management, training, data migration, integration, testing, documentation, and post-go-live support/warranty. Both Fixed Price and T&M models will be considered.'
  if (q.includes('experience') || q.includes('reference') || q.includes('government')) return 'Vendors must demonstrate a minimum of 3 successfully completed Oracle EBS or equivalent ERP implementations in UAE government or quasi-government entities within the last 5 years. Reference letters with contact details of the project sponsor or IT director must be provided. CPC reserves the right to conduct reference calls before finalizing the shortlist.'
  if (q.includes('medallion') || q.includes('architecture') || q.includes('dwh') || q.includes('data warehouse')) return 'The Medallion Architecture (Bronze → Silver → Gold) is a stated requirement aligned to CPC\'s enterprise data strategy. Vendors may propose alternative DWH architectures that achieve equivalent outcomes (governed raw layer, cleansed/conformed layer, analytical layer) provided they demonstrate equivalent scalability, governance, and AI/ML readiness. Any deviation must be clearly justified with a technical rationale.'
  if (q.includes('tableau') || q.includes('bi') || q.includes('dashboard') || q.includes('report')) return 'Tableau Server is the preferred BI platform based on existing CPC investments. Vendors proposing an alternative BI platform must provide a compelling technical and commercial justification. The deployed solution must support: on-premises deployment with AD integration, row-level security, role-based access, incremental data refresh, and delivery of management dashboards with KPIs and drill-down capabilities.'
  return 'Thank you for your question. This matter will be addressed in the official Q&A document published to all shortlisted vendors within 5 business days of the questions deadline. If your question is urgent, please contact procurement@cpc.gov.ae referencing the RFP number.'
}

function getSampleQuestions() {
  return [
    { question: 'What is the expected project implementation timeline from contract signing to full go-live?' },
    { question: 'Does CPC have an existing Oracle EBS R12.2 environment, or will this be a greenfield implementation?' },
    { question: 'What is the scope of data migration — specifically how many years of historical data must be migrated?' },
    { question: 'Are UAE Pass integration and Active Directory SSO mandatory for Phase 1 go-live?' },
    { question: 'What are the infrastructure specifications and data center access procedures for vendors?' },
    { question: 'Is the Medallion Architecture (Bronze/Silver/Gold) a hard requirement or can alternatives be proposed?' },
    { question: 'What is the current state of master data quality in the legacy systems?' },
    { question: 'Are there existing integrations with Ministry of Finance or government portals that must remain live?' },
    { question: 'What are the Arabic language and Hijri calendar requirements across all modules?' },
    { question: 'What is the budget envelope and preferred commercial model (Fixed Price vs. T&M)?' },
  ]
}

function computeExperienceScore(v: any): number {
  let score = 50
  if ((v.erp_experience || '').toLowerCase().includes('government')) score += 20
  if ((v.certifications || '').includes('ISO')) score += 10
  if (v.size === 'Large') score += 10
  if ((v.specializations || '').toLowerCase().includes('erp')) score += 10
  return Math.min(score, 95)
}
