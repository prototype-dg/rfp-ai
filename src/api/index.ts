import { Hono } from 'hono'
import { initDb, seedVendors } from '../db/seed'
import type { Bindings } from '../types'

export const apiRouter = new Hono<{ Bindings: Bindings }>()

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
      INSERT INTO rfps (ref_number, title, category, budget, deadline, scope, tech_requirements, objectives, background, stage, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', datetime('now'), datetime('now'))
    `).bind(refNum, body.title, body.category, body.budget, body.deadline, body.scope, body.tech_requirements||'', body.objectives||'', body.background||'').run()
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
    const content = buildRFPContent(body)
    await c.env.DB.prepare(`
      UPDATE rfps SET title=?, category=?, budget=?, deadline=?, scope=?, tech_requirements=?, objectives=?, background=?, content=?, updated_at=datetime('now')
      WHERE id=?
    `).bind(body.title, body.category, body.budget, body.deadline, body.scope, body.tech_requirements||'', body.objectives||'', body.background||'', content, id).run()
    const rfp = await c.env.DB.prepare('SELECT * FROM rfps WHERE id=?').bind(id).first()
    return c.json(rfp)
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

apiRouter.get('/rfps/:id/vendors', async (c) => {
  const rfpId = c.req.param('id')
  const { results } = await c.env.DB.prepare(`
    SELECT v.*, COALESCE(rv.shortlisted, 0) as shortlisted, rv.fit_score as rfp_fit_score, rv.fit_rationale as rfp_fit_rationale
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
  const q = await c.env.DB.prepare('SELECT * FROM questions WHERE id=?').bind(id).first<any>()
  if (!q) return c.json({ error: 'Not found' }, 404)
  const answer = draftAnswer(q.question)
  await c.env.DB.prepare('UPDATE questions SET answer=? WHERE id=?').bind(answer, id).run()
  return c.json({ ok: true, answer })
})

apiRouter.post('/rfps/:id/questions/draft-all', async (c) => {
  const rfpId = c.req.param('id')
  const { results: qs } = await c.env.DB.prepare('SELECT * FROM questions WHERE (answer IS NULL OR answer="") AND published=0 AND rfp_id=?').bind(rfpId).all<any>()
  for (const q of qs) {
    const answer = draftAnswer(q.question)
    await c.env.DB.prepare('UPDATE questions SET answer=? WHERE id=?').bind(answer, q.id).run()
  }
  return c.json({ ok: true })
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
  await c.env.DB.prepare('UPDATE questions SET published=1 WHERE answer IS NOT NULL AND answer != "" AND rfp_id=?').bind(rfpId).run()
  return c.json({ ok: true })
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
    SELECT v.* FROM vendors v
    JOIN rfp_vendors rv ON v.id = rv.vendor_id AND rv.rfp_id=? AND rv.shortlisted=1
  `).bind(rfpId).all<any>()

  const qDeadline = body.questions_deadline || '14 days from today'
  const sDeadline = body.submission_deadline || (rfp?.deadline || '30 days from today')
  const notes = body.notes || ''

  for (const v of shortlisted) {
    const already = await c.env.DB.prepare(`SELECT id FROM email_log WHERE vendor_id=? AND rfp_id=? AND email_type='invitation'`).bind(v.id, rfpId).first()
    if (already) continue

    const isAndersen = v.contact_email?.includes('andersenlab.com')
    const emailBody = buildInvitationEmail(v, rfp, qDeadline, sDeadline, notes)
    let status = 'simulated'

    if (isAndersen) {
      try {
        const sent = await sendRealEmail(
          v.contact_email,
          `Invitation to Tender – ${rfp?.title || 'CPC RFP'} (Ref: ${rfp?.ref_number || ''})`,
          emailBody,
          rfp,
          c.env
        )
        status = sent ? 'sent' : 'simulated'
      } catch(e) {
        status = 'simulated'
      }
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
  return c.json({ ok: true })
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
// PROPOSALS
// ============================================================
apiRouter.get('/rfps/:id/proposals', async (c) => {
  const rfpId = c.req.param('id')
  const { results } = await c.env.DB.prepare(`
    SELECT p.*, v.name as vendor_name FROM proposals p
    LEFT JOIN vendors v ON p.vendor_id = v.id
    WHERE p.rfp_id=? ORDER BY p.id DESC
  `).bind(rfpId).all()
  return c.json(results)
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

apiRouter.post('/rfps/:id/evaluations/run', async (c) => {
  const rfpId = c.req.param('id')
  // Load scoring model for weighted scoring
  const modelRow = await c.env.DB.prepare('SELECT * FROM scoring_models WHERE rfp_id=? ORDER BY id DESC LIMIT 1').bind(rfpId).first<any>()
  const scoringModel = modelRow ? JSON.parse(modelRow.model_json || '{}') : null

  const { results: proposals } = await c.env.DB.prepare(`
    SELECT p.*, v.name as vendor_name, v.erp_experience, v.certifications, v.specializations, v.size, v.is_real_submission
    FROM proposals p LEFT JOIN vendors v ON p.vendor_id = v.id WHERE p.rfp_id=?
  `).bind(rfpId).all<any>()
  if (proposals.length === 0) return c.json({ error: 'No proposals found. Add proposals first.' }, 400)

  for (const p of proposals) {
    const existing = await c.env.DB.prepare('SELECT id FROM evaluations WHERE proposal_id=?').bind(p.id).first()
    if (existing) continue

    const isAndersen = p.vendor_name?.includes('Andersen')
    const isEPAM = p.vendor_name?.includes('EPAM')

    const scores = computeEvalScores(p, isAndersen, isEPAM)
    const total = Math.round(scores.business * 0.3 + scores.technical * 0.4 + scores.financial * 0.3)

    await c.env.DB.prepare(`
      INSERT INTO evaluations (rfp_id, proposal_id, vendor_id, business_score, technical_score, financial_score, total_score, ai_summary, is_real, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,datetime('now'))
    `).bind(rfpId, p.id, p.vendor_id, scores.business, scores.technical, scores.financial, total,
      buildEvalSummary(p, scores, total, isAndersen, isEPAM), p.is_real_submission || 0).run()
  }
  return c.json({ ok: true })
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
// HELPERS — RFP CONTENT BUILDER (fully dynamic)
// ============================================================
function buildRFPContent(data: any): string {
  const today = new Date().toLocaleDateString('en-AE', { year: 'numeric', month: 'long', day: 'numeric' })
  const todayUpper = today.toUpperCase()
  const refNum = data.ref_number || 'CPC/PROC/' + new Date().getFullYear() + '/001'
  const deadline = data.deadline
    ? new Date(data.deadline).toLocaleDateString('en-AE', { year:'numeric', month:'long', day:'numeric' })
    : '30 days from issuance'
  const qDeadline = data.deadline
    ? new Date(new Date(data.deadline).getTime() - 14*24*60*60*1000).toLocaleDateString('en-AE', { year:'numeric', month:'long', day:'numeric' })
    : '14 days from issuance'

  const title = data.title || 'Enterprise Solution Implementation'
  const category = data.category || 'IT & Digital Transformation'
  const budget = data.budget || ''
  const background = data.background || `The Crown Prince's Court (CPC) of Abu Dhabi is undertaking a strategic digital transformation initiative to modernize its operations and enhance service delivery across all affiliated entities.`
  const objectives = data.objectives || ''
  const scope = data.scope || ''
  const techReqs = data.tech_requirements || ''

  // ---- Technology detection from ALL input fields ----
  const allText = (title + ' ' + category + ' ' + objectives + ' ' + scope + ' ' + techReqs + ' ' + background).toLowerCase()
  const isOracleEBS = allText.includes('oracle ebs') || allText.includes('oracle e-business') || allText.includes('ebs r12') || allText.includes('r12.2')
  const isERP       = isOracleEBS || allText.includes('erp') || allText.includes('enterprise resource planning')
  const isSAP       = allText.includes('sap s/4') || allText.includes('sap hana') || allText.includes('s4hana') || (allText.includes('sap') && !isOracleEBS)
  const isDynamics  = allText.includes('dynamics 365') || allText.includes('dynamics crm') || (allText.includes('dynamics') && !isOracleEBS)
  const isCRM       = allText.includes('crm') || allText.includes('customer relationship') || allText.includes('salesforce') || isDynamics
  const isDWH       = allText.includes('data warehouse') || allText.includes('dwh') || allText.includes('data platform') || allText.includes('medallion') || allText.includes('data lake') || allText.includes('analytics platform')
  const isBI        = allText.includes('tableau') || allText.includes('power bi') || allText.includes('bi platform') || allText.includes('dashboard') || allText.includes('business intelligence') || isDWH
  const isTableau   = allText.includes('tableau')
  const isPowerBI   = allText.includes('power bi')
  const isAI        = allText.includes('ai platform') || allText.includes('machine learning') || allText.includes(' ai ') || allText.includes('artificial intelligence') || allText.includes('llm') || allText.includes('generative ai')
  const isCloud     = allText.includes('cloud migration') || allText.includes('cloud platform') || allText.includes('azure') || allText.includes('aws') || allText.includes('google cloud')
  const isCyber     = allText.includes('cybersecurity') || allText.includes('soc ') || allText.includes('siem') || allText.includes('security operations')
  const isHRMS      = isOracleEBS || allText.includes('hrms') || allText.includes('hr system') || allText.includes('human capital') || allText.includes('payroll system')
  const isMobile    = allText.includes('mobile app') || allText.includes('mobile application') || allText.includes('ios') || allText.includes('android')
  const isInfra     = allText.includes('infrastructure') || allText.includes('data center') || allText.includes('network') || allText.includes('server')

  // Determine the primary platform label for use in qualification requirements
  let platformLabel = 'enterprise software'
  if (isOracleEBS) platformLabel = 'Oracle E-Business Suite R12.2'
  else if (isSAP)  platformLabel = 'SAP S/4HANA'
  else if (isDynamics) platformLabel = 'Microsoft Dynamics 365'
  else if (isCRM && !isERP) platformLabel = 'CRM platform'
  else if (isERP) platformLabel = 'ERP platform'
  else if (isAI)  platformLabel = 'AI/ML platform'
  else if (isDWH) platformLabel = 'Data Warehouse platform'
  else if (isCloud) platformLabel = 'cloud platform'

  const biTool = isTableau ? 'Tableau' : isPowerBI ? 'Power BI' : 'BI platform'

  const objectivesHtml = objectives
    ? formatObjectivesFromText(objectives)
    : buildDefaultObjectives(isERP, isDWH, isCRM, isAI, isCloud, title)

  const scopeHtml = scope
    ? buildScopeFromText(scope, isERP, isOracleEBS, isSAP, isDynamics, isCRM, isDWH, isBI, isTableau, isPowerBI, isAI, isCloud, isCyber, isHRMS, isMobile, isInfra, title)
    : buildDefaultScope(isERP, isOracleEBS, isSAP, isDynamics, isCRM, isDWH, isBI, isTableau, isPowerBI, isAI, isCloud, isCyber, isHRMS, isMobile, title)

  const techHtml = techReqs
    ? buildTechFromText(techReqs, isERP, isDWH, isAI, isCloud, isCyber)
    : buildDefaultTech(isERP, isOracleEBS, isDWH, isAI, isCloud, isCyber, isMobile)

  return `<div class="rfp-doc">
<div class="rfp-cover">
  <!-- Gold lattice header band (matches real CPC RFP) -->
  <div class="rfp-header-band"></div>
  <div class="rfp-circle-divider"></div>

  <!-- Logo: CPC crest + bilingual name, centered -->
  <div class="rfp-cover-logo">
    <div class="rfp-logo-emblem">
      <!-- CPC Falcon Crest (simplified SVG matching real logo) -->
      <svg width="60" height="60" viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
        <circle cx="30" cy="30" r="28" fill="none" stroke="#cc0000" stroke-width="2"/>
        <circle cx="30" cy="30" r="24" fill="white"/>
        <!-- Shield -->
        <path d="M30 12 L42 18 L42 34 Q42 44 30 50 Q18 44 18 34 L18 18 Z" fill="#cc0000" stroke="white" stroke-width="0.5"/>
        <path d="M30 12 L36 18 L36 34 Q36 44 30 50 Q24 44 24 34 L24 18 Z" fill="white"/>
        <!-- Falcon body simplified -->
        <path d="M30 14 Q34 10 38 12 Q40 16 36 20 L30 22 L24 20 Q20 16 22 12 Q26 10 30 14Z" fill="#c9a84c"/>
        <!-- Crown/stars -->
        <text x="30" y="42" text-anchor="middle" font-size="6" fill="#cc0000" font-family="Arial">✦ ✦ ✦</text>
      </svg>
    </div>
    <div class="rfp-logo-text">
      <div class="rfp-org-name">CROWN PRINCE COURT</div>
      <div class="rfp-org-arabic">ديوان ولي العهد</div>
    </div>
  </div>

  <div class="rfp-cover-divider"></div>

  <!-- Cover body: title block, left-aligned lower section -->
  <div class="rfp-cover-body">
    <div class="rfp-doc-title">${escXml(title)}</div>
    <div class="rfp-doc-type">REQUEST FOR PROPOSAL</div>
    <div class="rfp-doc-date">${todayUpper.replace(/\s\d{4}$/, (m) => m)}</div>
  </div>
</div>

<table class="rfp-meta-table">
  <tr>
    <th width="20%">RFP Reference</th><td width="30%">${escXml(refNum)}</td>
    <th width="20%">Issue Date</th><td width="30%">${today}</td>
  </tr>
  <tr>
    <th>Category</th><td>${escXml(category)}</td>
    <th>Proposal Deadline</th><td>${deadline}</td>
  </tr>
  <tr>
    <th>Questions Deadline</th><td>${qDeadline}</td>
    <th>Clarification Meeting</th><td>To be scheduled</td>
  </tr>
  ${budget ? `<tr><th>Budget Envelope</th><td colspan="3">AED ${escXml(budget)} (indicative)</td></tr>` : ''}
  <tr>
    <th>Confidentiality</th><td colspan="3">This document is CONFIDENTIAL. Unauthorized distribution is strictly prohibited.</td>
  </tr>
</table>

<!-- Interior page header band -->
<div class="rfp-header-band"></div>
<div class="rfp-circle-divider"></div>
<div class="rfp-page-header">
  <span class="rfp-page-header-logo">CROWN PRINCE COURT &nbsp;|&nbsp; ديوان ولي العهد</span>
  <span class="rfp-page-header-ref">${escXml(refNum)} &bull; ${todayUpper}</span>
</div>

<div class="rfp-toc">
  <div class="rfp-toc-title">Contents</div>
  <div class="rfp-toc-item bold"><span>Scope of Work</span><span>2</span></div>
  <div class="rfp-toc-item indent"><span>1. Project Background &amp; Context</span><span>2</span></div>
  <div class="rfp-toc-item indent"><span>2. Objectives</span><span>3</span></div>
  <div class="rfp-toc-item indent"><span>3. Scope of Work</span><span>4</span></div>
  <div class="rfp-toc-item indent"><span>4. Technical Requirements &amp; Architecture</span><span>8</span></div>
  <div class="rfp-toc-item indent"><span>5. Key Assumptions &amp; Constraints</span><span>10</span></div>
  <div class="rfp-toc-item indent"><span>6. Vendor Qualification Requirements</span><span>11</span></div>
  <div class="rfp-toc-item indent"><span>7. Evaluation Criteria &amp; Scoring Model</span><span>12</span></div>
  <div class="rfp-toc-item indent"><span>8. Proposal Submission Requirements</span><span>13</span></div>
  <div class="rfp-toc-item indent"><span>Appendix A: Definition of Done</span><span>14</span></div>
</div>

<div class="rfp-section">
  <div class="rfp-section-body">
    <div class="rfp-section-title"><span class="rfp-section-num">1</span> Project Background &amp; Context</div>
    ${formatParagraphs(background)}
    <p>This Request for Proposal (RFP) invites qualified vendors to submit comprehensive proposals for the implementation of <strong>${escXml(title)}</strong>. The selected vendor must demonstrate deep expertise in enterprise-grade solutions for government entities, with proven track record in UAE public sector deployments meeting the highest standards of security, performance, and regulatory compliance.</p>
    <div class="rfp-deliverables">
      <strong>Applicable Standards:</strong> UAE Information Assurance Standards (IAS) &bull; ISO 27001 &bull; UAE Government Cloud (G-Cloud) Policy &bull; Federal Authority for Identity and Citizenship (ICA) Requirements &bull; Abu Dhabi Government Digital Transformation Strategy 2030
    </div>
  </div>
</div>

<div class="rfp-section">
  <div class="rfp-section-body">
    <div class="rfp-section-title"><span class="rfp-section-num">2</span> Objectives</div>
    ${objectivesHtml}
  </div>
</div>

<div class="rfp-section">
  <div class="rfp-section-body">
    <div class="rfp-section-title"><span class="rfp-section-num">3</span> Scope of Work</div>
    ${scopeHtml}
  </div>
</div>

<div class="rfp-section">
  <div class="rfp-section-body">
    <div class="rfp-section-title"><span class="rfp-section-num">4</span> Technical Requirements &amp; Architecture</div>
    ${techHtml}
  </div>
</div>

<div class="rfp-section">
  <div class="rfp-section-body">
    <div class="rfp-section-title"><span class="rfp-section-num">5</span> Key Assumptions &amp; Constraints</div>
    <ul>
      <li>The implementation will operate within CPC's existing infrastructure where applicable; the vendor must assess fit and propose augmentation as needed</li>
      <li>CPC's central IT team will provide infrastructure and DBA-level support throughout the project lifecycle</li>
      <li>Existing policies, templates, and security models from other CPC entities shall serve as baselines and must be respected</li>
      <li>The vendor will coordinate closely with CPC IT, Legal, Security, and Business teams at all project stages</li>
      <li>All configuration components from other CPC entities may be reused if formally approved by the relevant entity's representative</li>
      <li>Data migration scope will be finalized during the discovery and BRD phase; estimates provided are indicative</li>
      <li>Change management and user adoption is the joint responsibility of the vendor and CPC project sponsors</li>
      <li>Vendor must comply with all CPC IT change management and release procedures</li>
    </ul>
  </div>
</div>

<div class="rfp-section">
  <div class="rfp-section-body">
    <div class="rfp-section-title"><span class="rfp-section-num">6</span> Vendor Requirements</div>
    <p>Vendors must satisfy <strong>all mandatory criteria</strong> to be considered for shortlisting:</p>
    <table class="rfp-spec-table">
      <tr><th>Category</th><th>Mandatory Requirement</th></tr>
      <tr><td><strong>Legal Standing</strong></td><td>Valid UAE Trade License (or authorized representation agreement with a UAE-registered entity)</td></tr>
      <tr><td><strong>Financial Stability</strong></td><td>Audited financial statements for the last 3 years demonstrating viability</td></tr>
      <tr><td><strong>Relevant Experience</strong></td><td>Minimum 3 successfully completed similar implementations in UAE government or quasi-government entities within the last 5 years</td></tr>
      <tr><td><strong>Platform Capability</strong></td><td>Proven capability in ${escXml(platformLabel)}, Data Warehouse design, and BI integration</td></tr>
      <tr><td><strong>Security Compliance</strong></td><td>ISO 27001 certification or equivalent; must commit to UAE IA Standards compliance</td></tr>
      <tr><td><strong>Documentation</strong></td><td>Strong documentation and capacity-building track record</td></tr>
      <tr><td><strong>Local Presence</strong></td><td>Physical office in the UAE with dedicated support team for post-go-live warranty</td></tr>
    </table>
  </div>
</div>

<div class="rfp-section">
  <div class="rfp-section-body">
    <div class="rfp-section-title"><span class="rfp-section-num">7</span> Evaluation Criteria &amp; Scoring Model</div>
    <p>Proposals will be evaluated using a weighted scoring model across three dimensions. The scoring will be performed by an AI-assisted evaluation system supported by a designated CPC evaluation panel.</p>
    <table class="rfp-spec-table">
      <tr><th>Dimension</th><th>Criterion</th><th width="12%">Weight</th><th>Evaluation Approach</th></tr>
      <tr><td rowspan="3"><strong>Technical</strong><br/><em style="font-size:0.78rem;color:#6b7280">40%</em></td>
          <td>Solution Architecture &amp; Methodology</td><td>15%</td><td>Completeness, innovation, alignment to CPC standards</td></tr>
      <tr><td>Implementation Approach &amp; Timeline</td><td>15%</td><td>Feasibility, milestone clarity, risk management</td></tr>
      <tr><td>Technical Team Qualifications</td><td>10%</td><td>CVs, certifications, relevant UAE government experience</td></tr>
      <tr><td rowspan="2"><strong>Business</strong><br/><em style="font-size:0.78rem;color:#6b7280">30%</em></td>
          <td>Relevant Government Sector Experience</td><td>20%</td><td>Verified references, case studies, GCC government implementations</td></tr>
      <tr><td>Training, KT &amp; Change Management</td><td>10%</td><td>Training plan quality, knowledge transfer completeness</td></tr>
      <tr><td rowspan="2"><strong>Commercial</strong><br/><em style="font-size:0.78rem;color:#6b7280">30%</em></td>
          <td>Total Cost of Ownership (TCO)</td><td>20%</td><td>Phase-wise cost breakdown, licensing, implementation, support</td></tr>
      <tr><td>Commercial Terms &amp; Payment Structure</td><td>10%</td><td>Flexibility, payment milestones, warranty terms</td></tr>
      <tr style="background:#f0f4f8"><td colspan="2"><strong>TOTAL</strong></td><td><strong>100%</strong></td><td>Minimum qualifying score: 60/100</td></tr>
    </table>
    <div class="rfp-deliverables" style="margin-top:0.75rem">
      <strong>Note:</strong> CPC reserves the right to conduct reference checks, technical demonstrations, and oral presentations before finalizing the award decision. Vendors scoring below 60/100 overall, or below 50/100 on any single dimension, will be disqualified.
    </div>
  </div>
</div>

<div class="rfp-section">
  <div class="rfp-section-body">
    <div class="rfp-section-title"><span class="rfp-section-num">8</span> Proposal Submission Requirements</div>
    <p>The proposal must be submitted as a single, comprehensive package delivered to the CPC Procurement Department by the stated deadline. Submissions must include the following sections in the exact order specified:</p>
    <table class="rfp-spec-table">
      <tr><th>#</th><th>Document</th><th>Format</th><th>Required</th></tr>
      <tr><td>1</td><td>Executive Summary (&lt;3 pages)</td><td>PDF</td><td>Mandatory</td></tr>
      <tr><td>2</td><td>Technical Proposal — Solution Architecture, Methodology, Timeline</td><td>PDF</td><td>Mandatory</td></tr>
      <tr><td>3</td><td>Team CVs &amp; Certifications</td><td>PDF</td><td>Mandatory</td></tr>
      <tr><td>4</td><td>Project References (minimum 3 UAE government)</td><td>PDF</td><td>Mandatory</td></tr>
      <tr><td>5</td><td>Commercial Proposal — Fixed Price or T&amp;M, phase-wise breakdown</td><td>Excel + PDF</td><td>Mandatory (sealed)</td></tr>
      <tr><td>6</td><td>Company Profile, Trade License, Certificate of Incorporation</td><td>PDF</td><td>Mandatory</td></tr>
      <tr><td>7</td><td>Risk Register &amp; Mitigation Strategies</td><td>PDF</td><td>Mandatory</td></tr>
      <tr><td>8</td><td>Post-Implementation Support &amp; SLA Framework</td><td>PDF</td><td>Mandatory</td></tr>
      <tr><td>9</td><td>Implementation Timeline with Milestones &amp; RACI</td><td>PDF/PPT</td><td>Mandatory</td></tr>
    </table>
    <div class="rfp-deliverables" style="margin-top:0.875rem">
      <strong>Submission Address:</strong> procurement@cpc.gov.ae with subject line: <em>"RFP Response – ${escXml(refNum)} – [Vendor Name]"</em><br/>
      <strong>Hard Copy:</strong> 2 printed copies to Procurement Department, Crown Prince's Court, Abu Dhabi<br/>
      <strong>Late Submissions:</strong> Will not be considered under any circumstances
    </div>
  </div>
</div>

<div class="rfp-section">
  <div class="rfp-section-body">
    <div class="rfp-section-title"><span class="rfp-section-num" style="font-size:0.7rem">A</span> Appendix A: Definition of Done — Required Approvals</div>
    <p>The project is considered complete only upon formal delivery and written approval of all the following artefacts by the CPC Project Sponsor and IT governance team:</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem">
      ${['Business Requirements Document (BRD)', 'Solution Architecture Document (SAD)', 'UX/UI Design Artifacts (wireframes, mockups, storyboards)', 'Information Architecture Diagrams (flow charts, system interaction maps)', 'Test Strategy & Test Cases (validation plan, traceability matrix)', 'Security & Compliance Checklist (aligned with CPC IT standards)', 'Deployment & Release Plan (environment transitions, rollback logic)', 'Operations & Support Guide (user support, SLAs, escalation matrix)', 'Training Materials & Completion Certificates', 'Data Migration Reconciliation Report', 'User Acceptance Testing (UAT) Sign-Off Document', 'Knowledge Transfer Completion Sign-Off'].map(item => `<div class="rfp-deliverables" style="margin:0">${escXml(item)}</div>`).join('')}
    </div>
  </div>
</div>

<div class="rfp-footer">
  <div><strong>Crown Prince's Court</strong> | Procurement &amp; Contracting Department | Abu Dhabi, United Arab Emirates</div>
  <div style="margin-top:4px">&#9993; procurement@cpc.gov.ae &nbsp;|&nbsp; &#128222; +971 2 XXX XXXX &nbsp;|&nbsp; Reference: ${escXml(refNum)}</div>
  <div style="margin-top:0.5rem;font-size:0.72rem;color:#9ca3af">This document is CONFIDENTIAL and intended solely for invited vendors. Unauthorized distribution is strictly prohibited under UAE Federal Law.</div>
  <div style="margin-top:4px;font-size:0.72rem;color:#9ca3af">Both Arabic and English languages are supported in all deliverables. الوثيقة متاحة باللغتين العربية والإنجليزية.</div>
</div>
</div>`
}

// ============================================================
// HELPERS — CONTENT FORMATTERS
// ============================================================
function escXml(s: any): string {
  if (!s) return ''
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

function formatParagraphs(text: string): string {
  return text.split(/\n+/).filter(Boolean).map(p => `<p>${escXml(p.trim())}</p>`).join('')
}

function formatObjectivesFromText(text: string): string {
  const phases = text.split(/Phase\s+\d+[:\-–]/i).filter(Boolean)
  if (phases.length <= 1) {
    const items = text.split(/\n/).filter(s => s.trim())
    if (items.length <= 1) return `<p>${escXml(text)}</p>`
    return '<ul>' + items.map(i => `<li>${escXml(i.replace(/^[-•*\d.]\s*/,'').trim())}</li>`).join('') + '</ul>'
  }
  let html = ''
  const phaseMatches = text.match(/Phase\s+\d+[:\-–][^\n]*/gi) || []
  phases.forEach((phase, i) => {
    const items = phase.trim().split(/\n/).filter(s => s.trim() && !s.match(/^Phase/i))
    const label = phaseMatches[i] ? phaseMatches[i].replace(/[:\-–]*$/, '').trim() : 'Phase ' + (i+1)
    html += `<div class="rfp-subsection"><div class="rfp-subsection-title">${escXml(label)}</div><ul>`
    html += items.map(item => `<li>${escXml(item.replace(/^[-•*\d.]\s*/,'').trim())}</li>`).join('')
    html += '</ul></div>'
  })
  return html
}

function buildDefaultObjectives(isERP: boolean, isDWH: boolean, isCRM: boolean, isAI: boolean, isCloud: boolean, title: string): string {
  let html = ''
  let phaseNum = 1
  if (isERP) {
    html += `<div class="rfp-subsection">
      <div class="rfp-subsection-title">Phase ${phaseNum++} – ERP Enablement Objectives</div>
      <ul>
        <li>Configure and activate all required ERP modules with entity-specific setups and complete operational segregation</li>
        <li>Ensure segregation of operational data, approval workflows, and security roles per entity</li>
        <li>Migrate essential master data (employees, suppliers, Chart of Accounts, locations) from legacy systems with full reconciliation</li>
        <li>Establish data ownership, naming standards, and governance practices</li>
        <li>Implement enterprise-grade security with Role-Based Access Control (RBAC) and Segregation of Duties (SoD)</li>
        <li>Provide comprehensive training and documentation for operational independence</li>
      </ul>
    </div>`
  }
  if (isCRM && !isERP) {
    html += `<div class="rfp-subsection">
      <div class="rfp-subsection-title">Phase ${phaseNum++} – CRM Platform Objectives</div>
      <ul>
        <li>Implement a centralized CRM platform covering customer lifecycle, opportunity management, and service workflows</li>
        <li>Integrate CRM with existing ERP/back-office systems for a unified customer data view</li>
        <li>Enable self-service portals, case management, and automated marketing campaign workflows</li>
        <li>Deliver reporting dashboards with real-time pipeline visibility and customer analytics</li>
        <li>Ensure mobile access and Arabic-language UI for all customer-facing and internal users</li>
      </ul>
    </div>`
  }
  if (isDWH) {
    html += `<div class="rfp-subsection">
      <div class="rfp-subsection-title">Phase ${phaseNum++} – Data Platform &amp; BI Objectives</div>
      <ul>
        <li>Establish a centralized, governed Data Warehouse aligned with CPC's enterprise architecture standards</li>
        <li>Implement a layered data architecture (raw ingestion → cleansed → analytical) for scalable, governed data management</li>
        <li>Enable advanced reporting, analytics, and self-service BI capabilities across all departments</li>
        <li>Integrate all source systems (ERP, HR, Finance, CRM) securely via governed ETL pipelines</li>
        <li>Institutionalize metadata management, row-level security, and complete data lineage tracking</li>
        <li>Build the foundation for AI/ML and predictive analytics capabilities</li>
      </ul>
    </div>`
  }
  if (isAI) {
    html += `<div class="rfp-subsection">
      <div class="rfp-subsection-title">Phase ${phaseNum++} – AI &amp; Intelligent Automation Objectives</div>
      <ul>
        <li>Deploy an on-premise AI/ML platform integrated with CPC's data and application landscape</li>
        <li>Deliver production-ready AI models for priority use cases (forecasting, anomaly detection, NLP, document processing)</li>
        <li>Establish an MLOps framework for model versioning, monitoring, and retraining pipelines</li>
        <li>Ensure AI models comply with UAE AI Ethics guidelines and CPC's data classification policy</li>
        <li>Enable business units to access AI capabilities through APIs, embedded UI widgets, and reporting integrations</li>
      </ul>
    </div>`
  }
  if (isCloud) {
    html += `<div class="rfp-subsection">
      <div class="rfp-subsection-title">Phase ${phaseNum++} – Cloud Migration &amp; Infrastructure Objectives</div>
      <ul>
        <li>Assess and classify current workloads for cloud readiness (lift-and-shift, re-platform, re-architect)</li>
        <li>Migrate target workloads to UAE-based cloud environment with zero data residency violation</li>
        <li>Implement cloud-native security controls, IAM policies, and monitoring aligned to CPC IT standards</li>
        <li>Establish DevSecOps pipelines and IaC (Infrastructure as Code) practices for all cloud resources</li>
        <li>Deliver cost optimization model, FinOps governance, and ongoing cloud spend management</li>
      </ul>
    </div>`
  }
  if (!isERP && !isDWH && !isCRM && !isAI && !isCloud) {
    html = `<ul>
      <li>Deliver a comprehensive, enterprise-grade solution tailored to CPC's operational and compliance requirements</li>
      <li>Ensure full data security, audit readiness, and compliance with UAE government standards</li>
      <li>Provide scalable architecture capable of supporting CPC's future digital transformation roadmap</li>
      <li>Enable advanced reporting and analytics for data-driven decision-making</li>
      <li>Ensure seamless integration with existing CPC systems and future-readiness for AI/ML capabilities</li>
    </ul>`
  }
  return html
}

function buildScopeFromText(scope: string, isERP: boolean, isOracleEBS: boolean, isSAP: boolean, isDynamics: boolean, isCRM: boolean, isDWH: boolean, isBI: boolean, isTableau: boolean, isPowerBI: boolean, isAI: boolean, isCloud: boolean, isCyber: boolean, isHRMS: boolean, isMobile: boolean, isInfra: boolean, title: string): string {
  const paragraphs = scope.split(/\n+/).filter(Boolean)
  let html = `<p>${escXml(paragraphs[0] || 'The selected vendor shall deliver a comprehensive solution covering all functional and technical requirements specified herein.')}</p>`
  html += buildDefaultScope(isERP, isOracleEBS, isSAP, isDynamics, isCRM, isDWH, isBI, isTableau, isPowerBI, isAI, isCloud, isCyber, isHRMS, isMobile, title)
  return html
}

function buildDefaultScope(isERP: boolean, isOracleEBS: boolean, isSAP: boolean, isDynamics: boolean, isCRM: boolean, isDWH: boolean, isBI: boolean, isTableau: boolean, isPowerBI: boolean, isAI: boolean, isCloud: boolean, isCyber: boolean, isHRMS: boolean, isMobile: boolean, title: string): string {
  let html = ''
  let sectionNum = 1

  // ---- ERP scope sections ----
  if (isERP) {
    const erpPlatform = isOracleEBS ? 'Oracle EBS R12.2' : isSAP ? 'SAP S/4HANA' : isDynamics ? 'Microsoft Dynamics 365' : 'ERP platform'
    const modules = isOracleEBS
      ? 'HRMS (Human Capital Management), Finance (GL/AP/AR/FA/CM), Procurement &amp; iProcurement, System Administration &amp; Security'
      : isSAP
      ? 'FI/CO (Finance/Controlling), HCM (Human Capital Management), MM (Materials Management), SD (Sales &amp; Distribution), PM (Plant Maintenance)'
      : isDynamics
      ? 'Finance, Supply Chain, HR &amp; Payroll, Customer Engagement, Project Operations'
      : 'Finance, HR, Procurement, Inventory, Reporting'

    html += `<div class="rfp-subsection">
      <div class="rfp-subsection-title">3.${sectionNum++} ${erpPlatform} — Functional Configuration &amp; Module Delivery</div>
      <p>The vendor shall configure the following ${erpPlatform} modules with entity-specific setups and ensure complete operational segregation from other CPC entities:</p>
      <ul>`
    if (isOracleEBS) {
      html += `
        <li><strong>HRMS &amp; Human Capital Management:</strong> Legal entity configuration, position management, grading structures, leave rules and accruals, payroll elements and formulas, Employee Self-Service (SSHR) and Manager Self-Service (MSS) workflows</li>
        <li><strong>Finance (GL/AP/AR/FA/CM):</strong> Chart of Accounts (COA) with CPC segment structure, General Ledger with journal entry controls, Accounts Payable with 3-way matching, Fixed Assets with depreciation schedules, Cash Management with bank reconciliation, intercompany transactions</li>
        <li><strong>Procurement &amp; Contracts:</strong> Supplier structure and categorization, category sets aligned to CPC procurement policy, approval matrix by organizational hierarchy, Purchase Order workflows with delegation of authority, contract lifecycle management</li>
        <li><strong>System Administration &amp; Security:</strong> RBAC across all modules, responsibilities definition, data access security provisioning, Segregation of Duties (SoD) assessment and remediation, Oracle GRC alignment</li>`
    } else if (isSAP) {
      html += `
        <li><strong>Finance &amp; Controlling (FI/CO):</strong> Chart of Accounts setup, cost centre hierarchy, profit centre accounting, accounts payable/receivable, asset accounting, bank reconciliation, consolidated reporting</li>
        <li><strong>Human Capital Management (HCM):</strong> Org structure, position management, time management, payroll localization for UAE, Employee Self-Service (ESS) and Manager Self-Service (MSS)</li>
        <li><strong>Materials Management (MM):</strong> Procurement workflows, purchase order management, inventory management, goods receipt, vendor master, material master</li>
        <li><strong>Security &amp; Authorizations:</strong> Role-based authorization concepts, SoD matrix implementation, Fiori launchpad personalization, audit log configuration</li>`
    } else {
      html += `
        <li><strong>Finance &amp; Accounting:</strong> General ledger, accounts payable/receivable, fixed assets, cash management, financial reporting aligned to UAE standards</li>
        <li><strong>HR &amp; Payroll:</strong> Employee lifecycle management, leave and attendance, WPS-compliant payroll, self-service workflows, org chart management</li>
        <li><strong>Procurement &amp; Supply Chain:</strong> Purchase requisition to order workflows, supplier portal, approval hierarchies, inventory management</li>
        <li><strong>Security &amp; Compliance:</strong> RBAC setup, SoD controls, audit trails, compliance reporting aligned to UAE regulations</li>`
    }
    html += `</ul>
      <div class="rfp-deliverables">
        <strong>Key Deliverables:</strong> Business Requirements Configuration Document &bull; Functional design specifications per module &bull; Configured approval hierarchies and delegation matrices &bull; RBAC matrix and SoD conflict resolution report &bull; Test scripts and UAT sign-off checklist
      </div>
    </div>

    <div class="rfp-subsection">
      <div class="rfp-subsection-title">3.${sectionNum++} Data Migration &amp; Master Data Management</div>
      <ul>
        <li>Design and execute a comprehensive data migration strategy covering all key master data entities</li>
        <li>Define entity-specific naming standards, data governance rules, and master data stewardship roles</li>
        <li>Conduct data profiling, cleansing, transformation, and validation prior to system load</li>
        <li>Execute formal cutover activities per CPC-approved runbook; perform post-migration reconciliation with documented sign-off</li>
        <li>Implement data archival and retention policies aligned to UAE regulatory requirements (minimum 7 years)</li>
      </ul>
      <div class="rfp-deliverables">
        <strong>Key Deliverables:</strong> Data Migration Strategy &amp; Plan &bull; Pre-load validation reports &bull; Post-load reconciliation report &bull; Data governance model document &bull; Master data quality assessment log
      </div>
    </div>

    <div class="rfp-subsection">
      <div class="rfp-subsection-title">3.${sectionNum++} Security, Compliance &amp; Audit Readiness</div>
      <ul>
        <li>Implement RBAC policies across all modules aligned to CPC IT security policy and UAE IAS standards</li>
        <li>Conduct formal Segregation of Duties (SoD) assessments and remediate conflicts before go-live</li>
        <li>Ensure audit-readiness through traceable access logs, approval workflows, and change history retention</li>
        <li>All security configurations must align to UAE Information Assurance Standards (IAS) and ISO 27001</li>
      </ul>
    </div>`
  }

  // ---- CRM (non-ERP) scope sections ----
  if (isCRM && !isERP) {
    html += `<div class="rfp-subsection">
      <div class="rfp-subsection-title">3.${sectionNum++} CRM Platform Configuration &amp; Customization</div>
      <ul>
        <li><strong>Contact &amp; Account Management:</strong> Unified customer/stakeholder profiles, relationship hierarchies, interaction history, custom field configuration</li>
        <li><strong>Opportunity &amp; Pipeline Management:</strong> Sales stages, probability tracking, weighted forecast dashboards, automated follow-up workflows</li>
        <li><strong>Case &amp; Service Management:</strong> Case lifecycle, SLA timers, escalation rules, knowledge base integration, multi-channel intake (email, web, phone)</li>
        <li><strong>Marketing Automation:</strong> Campaign management, email/SMS journeys, segmentation rules, lead scoring, attribution reporting</li>
        <li><strong>Integration Layer:</strong> Bi-directional sync with ERP/Finance systems, government portal integration, identity provider (UAE Pass) connection</li>
      </ul>
      <div class="rfp-deliverables">
        <strong>Key Deliverables:</strong> CRM configuration blueprint &bull; Data migration plan (contacts, accounts, history) &bull; Integration specification documents &bull; User acceptance test scenarios &bull; Admin and end-user training materials
      </div>
    </div>`
  }

  // ---- DWH/BI scope sections ----
  if (isDWH) {
    html += `<div class="rfp-subsection">
      <div class="rfp-subsection-title">3.${sectionNum++} Data Warehouse Architecture &amp; Implementation</div>
      <p>The vendor shall design and implement a modern enterprise Data Warehouse with a governed layered architecture:</p>
      <table class="rfp-spec-table">
        <tr><th>Layer</th><th>Description</th><th>Key Technology</th><th>Key Activities</th></tr>
        <tr><td><strong>Bronze / Raw</strong></td><td>Exact copies of source data at point of extraction</td><td>Source system extracts, flat files, APIs</td><td>Schema-on-read design, full historical load, CDC pipeline setup, no transformations</td></tr>
        <tr><td><strong>Silver / Conformed</strong></td><td>Cleansed, standardized, and enriched tables</td><td>ETL framework (PL/SQL, Python, or ADF)</td><td>Data quality rules, deduplication, business key alignment, referential integrity</td></tr>
        <tr><td><strong>Gold / Analytical</strong></td><td>Aggregated views, star schemas, KPI tables</td><td>Dimensional modelling (Kimball/Inmon)</td><td>Fact/dimension tables, pre-aggregated KPIs, metadata registry, access-controlled views</td></tr>
      </table>
      <div class="rfp-deliverables">
        <strong>Key Deliverables:</strong> DWH Architecture Blueprint &bull; ETL flowcharts and job automation scripts &bull; Metadata management schema and data dictionary &bull; Incremental load strategy &bull; Data lineage documentation end-to-end
      </div>
    </div>`
  }

  if (isBI) {
    const biName = isTableau ? 'Tableau Server' : isPowerBI ? 'Power BI Premium' : 'BI Platform'
    html += `<div class="rfp-subsection">
      <div class="rfp-subsection-title">3.${sectionNum++} ${biName} Deployment &amp; Dashboard Development</div>
      <ul>
        <li>Deploy ${biName} on-premises (or UAE-hosted cloud) with Active Directory integration for SSO and MFA</li>
        <li>Configure three environments: Development, UAT, and Production with formal promotion workflows and version control</li>
        <li>Publish role-based dashboards for all key departments (Finance, HR, Procurement, Executive, Operations)</li>
        <li>Develop KPI dashboards with drill-down, tooltips, bookmarks, and mobile-optimized layouts per CPC design standards</li>
        <li>Implement row-level security (RLS) to enforce data access boundaries matching source system security model</li>
        <li>Configure scheduled refresh jobs, incremental load, and alerting for data freshness SLAs</li>
      </ul>
      <div class="rfp-deliverables">
        <strong>Key Deliverables:</strong> Dashboard catalogue with sample outputs &bull; ${biName} server configuration guide &bull; Data source connection specifications &bull; Row-level security matrix &bull; User role-to-dashboard access mapping
      </div>
    </div>

    <div class="rfp-subsection">
      <div class="rfp-subsection-title">3.${sectionNum++} Data Governance, Metadata &amp; Quality Management</div>
      <ul>
        <li>Implement metadata management framework covering all data layers and BI objects</li>
        <li>Classify datasets by sensitivity level (Secret, Confidential, Internal, Public) and enforce data ownership model</li>
        <li>Maintain comprehensive audit trails for data lineage, access history, and transformation records</li>
        <li>Deliver metadata dictionary, data security matrix, and data classification policy document</li>
        <li>Establish automated data quality monitoring rules and exception reporting dashboard</li>
      </ul>
    </div>`
  }

  // ---- AI scope section ----
  if (isAI) {
    html += `<div class="rfp-subsection">
      <div class="rfp-subsection-title">3.${sectionNum++} AI &amp; Machine Learning Platform — On-Premise Deployment</div>
      <p>The vendor shall deploy and configure an enterprise AI/ML platform on CPC's on-premise infrastructure (or approved UAE-hosted cloud), ensuring full compliance with CPC data classification and security policies:</p>
      <ul>
        <li><strong>Platform Infrastructure:</strong> GPU-enabled compute nodes, model registry, experiment tracking (MLflow or equivalent), feature store, pipeline orchestration (Airflow or equivalent)</li>
        <li><strong>Model Development Environment:</strong> Jupyter/VS Code remote environments, pre-configured Python/R runtimes, version-controlled notebooks, collaborative workspace</li>
        <li><strong>Production AI Models (Priority Use Cases):</strong> Demand/spend forecasting, anomaly detection in transactions, Arabic NLP for document classification and extraction, recommendation engines for procurement optimization</li>
        <li><strong>MLOps &amp; Model Lifecycle:</strong> Automated retraining pipelines, model drift detection, A/B testing framework, model approval workflow before production promotion</li>
        <li><strong>Integration &amp; APIs:</strong> REST API gateway for all AI models, integration with BI dashboards, ERP system hooks for real-time inference, audit logging of all AI predictions</li>
      </ul>
      <div class="rfp-deliverables">
        <strong>Key Deliverables:</strong> AI platform architecture document &bull; Deployed priority use-case models with validation reports &bull; MLOps runbook &bull; API documentation &bull; AI ethics &amp; bias assessment report &bull; Model monitoring dashboard
      </div>
    </div>`
  }

  // ---- Cloud migration scope ----
  if (isCloud) {
    html += `<div class="rfp-subsection">
      <div class="rfp-subsection-title">3.${sectionNum++} Cloud Migration &amp; Infrastructure Modernization</div>
      <ul>
        <li><strong>Discovery &amp; Assessment:</strong> Application portfolio assessment, cloud-readiness scoring, dependency mapping, TCO comparison (on-prem vs. cloud), migration wave planning</li>
        <li><strong>Migration Execution:</strong> Lift-and-shift, re-platform, or re-architect per workload classification; zero-downtime migration for production systems using dual-run or blue-green strategy</li>
        <li><strong>Cloud Architecture:</strong> UAE-region infrastructure (Azure UAE North, AWS ME South, or G-Cloud), VNet/VPC design, private connectivity to CPC on-premise, disaster recovery config</li>
        <li><strong>Security &amp; Compliance:</strong> Cloud IAM policies, network security groups, encryption at rest and in transit, compliance with UAE IAS and NESA cloud security framework</li>
        <li><strong>FinOps &amp; Optimization:</strong> Resource tagging strategy, cost allocation model, reserved instance recommendations, ongoing optimization cadence</li>
      </ul>
      <div class="rfp-deliverables">
        <strong>Key Deliverables:</strong> Cloud readiness assessment report &bull; Migration wave plan &bull; Architecture design documents per workload &bull; Security baseline document &bull; FinOps dashboard and cost governance model
      </div>
    </div>`
  }

  // ---- Cybersecurity scope ----
  if (isCyber) {
    html += `<div class="rfp-subsection">
      <div class="rfp-subsection-title">3.${sectionNum++} Cybersecurity &amp; Security Operations</div>
      <ul>
        <li>Deploy and configure SIEM platform (Microsoft Sentinel, Splunk, or equivalent) with UAE IAS-aligned detection rules</li>
        <li>Establish a Security Operations Centre (SOC) function with 24x7 monitoring, triage, and incident response capability</li>
        <li>Conduct vulnerability assessment and penetration testing (VAPT) across all in-scope systems before go-live</li>
        <li>Implement privileged access management (PAM), endpoint detection &amp; response (EDR), and email security gateway</li>
        <li>Deliver security awareness training programme for all CPC staff</li>
      </ul>
    </div>`
  }

  // ---- Mobile app scope ----
  if (isMobile) {
    html += `<div class="rfp-subsection">
      <div class="rfp-subsection-title">3.${sectionNum++} Mobile Application Development &amp; Deployment</div>
      <ul>
        <li>Develop native iOS and Android applications with full Arabic RTL support and UAE Pass biometric authentication</li>
        <li>Implement offline-first architecture with secure data synchronization and conflict resolution</li>
        <li>Integrate with backend ERP/CRM/data platform APIs via secured mobile API gateway</li>
        <li>Publish to Apple App Store and Google Play Store via CPC enterprise account; manage MDM enrollment</li>
        <li>Provide 12-month post-launch support SLA with critical bug fix SLA of &lt;24 hours</li>
      </ul>
    </div>`
  }

  // ---- Training always at end ----
  html += `<div class="rfp-subsection">
    <div class="rfp-subsection-title">3.${sectionNum++} Training, Knowledge Transfer &amp; Change Management</div>
    <ul>
      <li>Conduct a Training Needs Assessment (TNA) covering all user roles, departments, and technical administrators</li>
      <li>Deliver structured training programmes: End-User (role-specific), System Administrator, Management Reporting, and Technical Handover</li>
      <li>Provide complete documentation package: SOPs, configuration guides, quick reference cards, video tutorials, and troubleshooting guides</li>
      <li>Support organizational change management through stakeholder communication plan, champion network, and adoption KPI tracking</li>
      <li>Provide a minimum 90-day hypercare support period post go-live with a dedicated support contact and weekly status meetings</li>
    </ul>
    <div class="rfp-deliverables">
      <strong>Key Deliverables:</strong> Training Needs Assessment &bull; Role-specific training materials &bull; Training completion and attendance records &bull; System documentation package &bull; Operations &amp; Support Guide with SLA framework &bull; Hypercare support plan
    </div>
  </div>`

  return html
}

function buildTechFromText(techReqs: string, isERP: boolean, isDWH: boolean, isAI: boolean, isCloud: boolean, isCyber: boolean): string {
  const intro = `<p>${escXml(techReqs.split('\n')[0] || 'All technical deliverables must comply with CPC IT standards and UAE government cybersecurity frameworks.')}</p>`
  return intro + buildDefaultTech(isERP, false, isDWH, isAI, isCloud, isCyber, false)
}

function buildDefaultTech(isERP: boolean = false, isOracleEBS: boolean = false, isDWH: boolean = false, isAI: boolean = false, isCloud: boolean = false, isCyber: boolean = false, isMobile: boolean = false): string {
  const deployModel = isCloud
    ? 'UAE-based cloud (Microsoft Azure UAE North / AWS Middle East UAE) with optional hybrid connectivity to CPC on-premise data center'
    : 'On-Premises (CPC Data Center) with option for hybrid UAE-based cloud (UAE G-Cloud or Azure UAE North)'
  const integrations = [
    isERP && 'ERP system APIs (Finance, HR, Procurement modules)',
    isOracleEBS && 'Oracle E-Business Suite R12.2 (HRMS, Finance, iProcurement, SysAdmin)',
    isDWH && 'Data Warehouse ETL pipelines (Bronze/Silver/Gold layers)',
    isAI && 'AI/ML model inference APIs and MLOps pipeline endpoints',
    'Active Directory / LDAP for SSO',
    'UAE Pass (Federal Identity) — mandatory for citizen/staff authentication',
    'Ministry of Finance e-payment gateway',
    'Abu Dhabi Government Portal',
    'CPC SOA/ESB integration middleware',
    'CPC SIEM/security monitoring platform',
  ].filter(Boolean)

  return `
  <table class="rfp-spec-table">
    <tr><th>Attribute</th><th>Requirement</th></tr>
    <tr><td><strong>Deployment Model</strong></td><td>${deployModel}</td></tr>
    <tr><td><strong>Data Classification</strong></td><td>Secret and Confidential — strict UAE data residency mandatory; no data may leave UAE territory</td></tr>
    <tr><td><strong>Data Sensitivity</strong></td><td>High — includes PII, financial records, government operational data${isAI ? ', and AI model training datasets' : ''}</td></tr>
    <tr><td><strong>Authentication</strong></td><td>UAE Pass integration mandatory for staff-facing portals; Active Directory (AD/LDAP) for internal SSO; MFA required for all privileged and administrator accounts</td></tr>
    <tr><td><strong>Language Support</strong></td><td>Full Arabic (RTL) and English bilingual UI mandatory across all screens; Hijri and Gregorian calendar support in all date fields and reports</td></tr>
    <tr><td><strong>Environments</strong></td><td>Minimum three fully isolated environments: Development, QA/UAT, Production; optional Pre-Production/Staging for critical changes</td></tr>
    <tr><td><strong>Uptime SLA</strong></td><td>99.9% Production availability (excluding approved maintenance windows); &lt;4h planned maintenance windows only during CPC off-peak hours</td></tr>
    <tr><td><strong>Security Standards</strong></td><td>ISO 27001, SOC 2 Type II, UAE Information Assurance Standards (IAS), NESA compliance — all mandatory</td></tr>
    <tr><td><strong>Backup &amp; Disaster Recovery</strong></td><td>Daily automated backups to secondary UAE site; RPO ≤ 4 hours; RTO ≤ 8 hours; annual DR drill with documented results</td></tr>
    <tr><td><strong>API &amp; Integration</strong></td><td>REST/SOAP API integration layer with standardized authentication (OAuth 2.0 / API key); full API documentation and sandbox required</td></tr>
    ${isMobile ? `<tr><td><strong>Mobile Platform</strong></td><td>Native iOS (Swift) and Android (Kotlin) applications; PWA fallback supported; offline-first architecture with secure sync; MDM enrollment via Intune or Jamf</td></tr>` : `<tr><td><strong>Mobile Support</strong></td><td>Responsive web application with mobile-optimized UI; native mobile app for self-service workflows (iOS &amp; Android)</td></tr>`}
    ${isAI ? `<tr><td><strong>AI/ML Infrastructure</strong></td><td>GPU compute nodes (minimum NVIDIA A100 or equivalent); container orchestration (Kubernetes); model registry and experiment tracking; feature store with real-time serving capability</td></tr>` : `<tr><td><strong>AI/ML Readiness</strong></td><td>Architecture must support future AI/ML integration without major re-engineering; model serving APIs and feature pipelines should be considered at design stage</td></tr>`}
    <tr><td><strong>Audit &amp; Logging</strong></td><td>Comprehensive audit trails for all data access, changes, and approvals; centralized log management with SIEM integration; minimum 7-year retention per UAE regulatory requirements</td></tr>
    <tr><td><strong>Performance</strong></td><td>Page load &lt;3 seconds; report generation &lt;10 seconds for standard queries; batch ETL jobs to complete within defined daily maintenance window</td></tr>
  </table>
  <div class="rfp-deliverables" style="margin-top:0.75rem">
    <strong>Required Integration Points:</strong> ${integrations.join(' &bull; ')}
  </div>`
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
function buildInvitationEmail(v: any, rfp: any, qDeadline: string, sDeadline: string, notes: string): string {
  return `Dear ${v.name},

We are pleased to invite ${v.name} to participate in the competitive tendering process for the following procurement:

INVITATION TO TENDER
RFP Title: ${rfp?.title || 'CPC RFP'}
Reference Number: ${rfp?.ref_number || 'N/A'}
Issuing Entity: Crown Prince's Court (CPC), Abu Dhabi

IMPORTANT DATES:
- Questions Submission Deadline: ${qDeadline}
- Proposal Submission Deadline: ${sDeadline}
- Evaluation Period: Following submission deadline

SUBMISSION RULES:
1. All proposals must be submitted to procurement@cpc.gov.ae with subject: "RFP Response – ${rfp?.ref_number || ''} – [Your Company Name]"
2. Technical and Commercial proposals must be submitted as separate sealed documents
3. All submissions must be in both English and Arabic
4. Late submissions will not be accepted under any circumstances
5. Questions must be submitted in writing via this email channel only

Please find the full RFP document attached to this email for your review.

${notes ? 'ADDITIONAL NOTES:\n' + notes + '\n\n' : ''}We look forward to receiving your proposal.

Best regards,
Procurement & Contracting Department
Crown Prince's Court
Abu Dhabi, United Arab Emirates
procurement@cpc.gov.ae`
}

async function sendRealEmail(to: string, subject: string, body: string, rfp: any, env?: any): Promise<boolean> {
  // Use Resend API for real email delivery
  // Read key from Cloudflare Worker secret binding (env.RESEND_API_KEY)
  const RESEND_API_KEY = env?.RESEND_API_KEY || (globalThis as any).RESEND_API_KEY || ''
  if (!RESEND_API_KEY) return false

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'procurement@cpc-rfp.ai',
        to: [to],
        subject: subject,
        text: body,
        html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
          <div style="background:#1a1a2e;color:gold;padding:15px;text-align:center;border-radius:8px 8px 0 0">
            <strong>Crown Prince's Court — AI RFP Management</strong>
          </div>
          <div style="background:white;padding:20px;border:1px solid #e5e7eb;border-radius:0 0 8px 8px">
            <pre style="white-space:pre-wrap;font-family:Arial,sans-serif;font-size:14px">${body.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</pre>
          </div>
        </div>`,
      }),
    })
    return res.ok
  } catch(e) {
    return false
  }
}

async function readVendorEmailReplies(rfp: any): Promise<string[]> {
  // In production this would integrate with an email service (e.g., read from inbox via IMAP/API)
  // For the demo, we simulate receiving an Excel attachment with questions parsed into text
  // Return empty to trigger simulation
  return []
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
