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
    // Average RFP duration (days from created_at to updated_at for awarded RFPs)
    const durationResult = await db.prepare(`
      SELECT AVG(CAST(julianday(updated_at) - julianday(created_at) AS REAL)) as avg_days
      FROM rfps WHERE stage='awarded'
    `).first<{avg_days:number|null}>()
    // Win rate = awarded / total
    const total = totalRfps?.cnt || 0
    const awarded = awardedRfps?.cnt || 0
    const winRate = total > 0 ? Math.round((awarded / total) * 100) : 0

    // Top vendor by proposals
    const topVendorResult = await db.prepare(`
      SELECT v.name, COUNT(p.id) as cnt FROM proposals p 
      LEFT JOIN vendors v ON p.vendor_id = v.id
      GROUP BY p.vendor_id ORDER BY cnt DESC LIMIT 1
    `).first<{name:string,cnt:number}>()

    // Stage breakdown
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
// RFP LIST
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
    `).bind(refNum, body.title, body.category, body.budget, body.deadline, body.scope, body.tech_requirements, body.objectives||'', body.background||'').run()
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
    `).bind(body.title, body.category, body.budget, body.deadline, body.scope, body.tech_requirements, body.objectives||'', body.background||'', id).run()
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
    `).bind(body.title, body.category, body.budget, body.deadline, body.scope, body.tech_requirements, body.objectives||'', body.background||'', content, id).run()
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
// VENDORS (global registry)
// ============================================================
apiRouter.get('/vendors', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM vendors ORDER BY name ASC').all()
  return c.json(results)
})

// Per-RFP vendor shortlisting
apiRouter.get('/rfps/:id/vendors', async (c) => {
  const rfpId = c.req.param('id')
  const { results } = await c.env.DB.prepare(`
    SELECT v.*, COALESCE(rv.shortlisted, 0) as shortlisted, rv.fit_score as rfp_fit_score, rv.fit_rationale as rfp_fit_rationale
    FROM vendors v
    LEFT JOIN rfp_vendors rv ON v.id = rv.vendor_id AND rv.rfp_id = ?
    ORDER BY v.name ASC
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
// QUESTIONS (per RFP)
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
      await c.env.DB.prepare(`INSERT INTO questions (rfp_id, question, vendor_id, published, created_at) VALUES (?,?,?,0,datetime('now'))`)
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
// EMAILS (per RFP)
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
  const rfp = await c.env.DB.prepare('SELECT * FROM rfps WHERE id=?').bind(rfpId).first<any>()
  const { results: shortlisted } = await c.env.DB.prepare(`
    SELECT v.* FROM vendors v
    JOIN rfp_vendors rv ON v.id = rv.vendor_id AND rv.rfp_id=? AND rv.shortlisted=1
  `).bind(rfpId).all<any>()
  for (const v of shortlisted) {
    const already = await c.env.DB.prepare(`SELECT id FROM email_log WHERE vendor_id=? AND rfp_id=? AND email_type='invitation'`).bind(v.id, rfpId).first()
    if (already) continue
    const isAndersen = v.contact_email?.includes('andersenlab.com')
    await c.env.DB.prepare(`
      INSERT INTO email_log (rfp_id, vendor_id, recipient, subject, body, email_type, status, created_at)
      VALUES (?,?,?,?,?,'invitation',?,datetime('now'))
    `).bind(
      rfpId, v.id,
      v.contact_email || 'contact@' + v.name.toLowerCase().replace(/\s/g,'') + '.com',
      `Invitation to Tender - ${rfp?.title || 'CPC RFP'} (Ref: ${rfp?.ref_number || ''})`,
      `Dear ${v.name},\n\nThe Crown Prince's Court (CPC) invites your organization to submit a proposal for the ${rfp?.title || 'RFP'}.\n\nReference: ${rfp?.ref_number || ''}\n\nPlease review the RFP document and submit your proposal by the deadline.\n\nBest regards,\nProcurement Department\nCrown Prince's Court`,
      isAndersen ? 'sent' : 'simulated'
    ).run()
  }
  return c.json({ ok: true })
})

// ============================================================
// PROPOSALS (per RFP)
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
    JOIN rfp_vendors rv ON v.id = rv.vendor_id AND rv.rfp_id=? AND rv.shortlisted=1 LIMIT 6
  `).bind(rfpId).all<any>()
  const targets = shortlisted.length > 0 ? shortlisted : (await c.env.DB.prepare('SELECT * FROM vendors LIMIT 6').all<any>()).results
  for (const v of targets) {
    const already = await c.env.DB.prepare('SELECT id FROM proposals WHERE vendor_id=? AND rfp_id=?').bind(v.id, rfpId).first()
    if (already) continue
    const tech = 50000000 + Math.floor(Math.random() * 50000000)
    await c.env.DB.prepare(`
      INSERT INTO proposals (rfp_id, vendor_id, technical_proposal, financial_proposal, status, created_at)
      VALUES (?,?,?,?,'submitted',datetime('now'))
    `).bind(rfpId, v.id,
      `Technical Proposal from ${v.name}:\n\nOur team proposes a comprehensive solution leveraging our ${v.specializations || 'enterprise software'} expertise. The approach ensures minimal disruption while delivering a future-ready platform aligned with CPC standards.\n\nProposed Timeline: 14 months.\nReferences: 3 UAE government implementations available upon request.`,
      tech
    ).run()
  }
  return c.json({ ok: true })
})

// ============================================================
// EVALUATIONS (per RFP)
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
  const { results: proposals } = await c.env.DB.prepare(`
    SELECT p.*, v.name as vendor_name, v.erp_experience, v.certifications, v.specializations
    FROM proposals p LEFT JOIN vendors v ON p.vendor_id = v.id WHERE p.rfp_id=?
  `).bind(rfpId).all<any>()
  if (proposals.length === 0) return c.json({ error: 'No proposals found. Add proposals first.' }, 400)
  for (const p of proposals) {
    const existing = await c.env.DB.prepare('SELECT id FROM evaluations WHERE proposal_id=?').bind(p.id).first()
    if (existing) continue
    const techScore = 50 + Math.floor(Math.random() * 40)
    const finScore = 50 + Math.floor(Math.random() * 40)
    const expScore = computeExperienceScore(p)
    const total = Math.round((techScore * 0.4) + (finScore * 0.3) + (expScore * 0.3))
    await c.env.DB.prepare(`
      INSERT INTO evaluations (rfp_id, proposal_id, vendor_id, technical_score, financial_score, experience_score, total_score, ai_summary, created_at)
      VALUES (?,?,?,?,?,?,?,?,datetime('now'))
    `).bind(rfpId, p.id, p.vendor_id, techScore, finScore, expScore, total, buildEvalSummary(p, techScore, finScore, expScore, total)).run()
  }
  return c.json({ ok: true })
})

// ============================================================
// RECOMMENDATION (per RFP)
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
    technical_score: e.technical_score, financial_score: e.financial_score, experience_score: e.experience_score,
  }))
  const top = rankings[0]
  const summary = buildRecommendationSummary(top, rankings)
  await c.env.DB.prepare(`
    INSERT INTO recommendations (rfp_id, top_vendor, rankings_json, summary, created_at)
    VALUES (?,?,?,?,datetime('now'))
  `).bind(rfpId, top.vendor_name, JSON.stringify(rankings), summary).run()
  return c.json({ ok: true, rankings, summary })
})

// ============================================================
// VENDOR PERFORMANCE (global analytics)
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
// HELPER FUNCTIONS
// ============================================================
function buildRFPContent(data: any): string {
  const today = new Date().toLocaleDateString('en-AE', { year: 'numeric', month: 'long', day: 'numeric' })
  const refNum = data.ref_number || 'CPC/PROC/' + new Date().getFullYear() + '/001'
  const deadline = data.deadline ? new Date(data.deadline).toLocaleDateString('en-AE', { year:'numeric', month:'long', day:'numeric' }) : '30 days from issuance'

  return `<div class="rfp-doc">
  <div class="rfp-cover">
    <div class="rfp-cover-logo">
      <div class="rfp-emblem">&#9812;</div>
      <div class="rfp-org-name">Crown Prince's Court</div>
      <div class="rfp-org-arabic">ديوان ولي العهد</div>
      <div class="rfp-org-sub">Abu Dhabi, United Arab Emirates</div>
    </div>
    <div class="rfp-cover-title">
      <div class="rfp-doc-type">REQUEST FOR PROPOSAL</div>
      <div class="rfp-doc-title">${data.title || 'Enterprise Resource Planning (ERP) System Implementation'}</div>
      <div class="rfp-doc-subtitle">${data.category || 'IT &amp; Digital Transformation'}</div>
      <div class="rfp-doc-date">ISSUED: ${today.toUpperCase()}</div>
    </div>
  </div>

  <table class="rfp-meta-table">
    <tr><th>RFP Reference</th><td>${refNum}</td><th>Issue Date</th><td>${today}</td></tr>
    <tr><th>Category</th><td>${data.category || 'IT &amp; Digital Transformation'}</td><th>Deadline</th><td>${deadline}</td></tr>
    ${data.budget ? `<tr><th>Budget Envelope</th><td colspan="3">AED ${data.budget}</td></tr>` : ''}
  </table>

  <div class="rfp-toc">
    <div class="rfp-section-title">Table of Contents</div>
    <div class="rfp-toc-item"><span>1. Project Background</span><span>2</span></div>
    <div class="rfp-toc-item"><span>2. Objectives</span><span>3</span></div>
    <div class="rfp-toc-item"><span>3. Scope of Work</span><span>4</span></div>
    <div class="rfp-toc-item"><span>4. Technical Requirements</span><span>8</span></div>
    <div class="rfp-toc-item"><span>5. Key Assumptions</span><span>10</span></div>
    <div class="rfp-toc-item"><span>6. Vendor Requirements</span><span>11</span></div>
    <div class="rfp-toc-item"><span>7. Evaluation Criteria</span><span>12</span></div>
    <div class="rfp-toc-item"><span>8. Proposal Submission Requirements</span><span>13</span></div>
  </div>

  <div class="rfp-section">
    <div class="rfp-section-num">1</div>
    <div class="rfp-section-body">
      <div class="rfp-section-title">Project Background</div>
      <p>${data.background || 'The Crown Prince\'s Court (CPC) of Abu Dhabi is undertaking a strategic digital transformation initiative. This project is structured to support key workstreams critical to the operational excellence of CPC and its affiliated entities, aligning with the broader vision of Abu Dhabi\'s digital government agenda.'}</p>
      <p>This Request for Proposal (RFP) invites qualified vendors to submit comprehensive proposals for the implementation of ${data.title || 'an enterprise-grade solution'} that meets the highest standards of security, performance, and compliance with UAE government regulations.</p>
    </div>
  </div>

  <div class="rfp-section">
    <div class="rfp-section-num">2</div>
    <div class="rfp-section-body">
      <div class="rfp-section-title">Objectives</div>
      ${data.objectives ? `<p>${data.objectives}</p>` : `
      <ul>
        <li>Configure and activate enterprise modules with entity-specific setups aligned to CPC operational requirements</li>
        <li>Ensure segregation of operational data, approval workflows, and security roles at all levels</li>
        <li>Migrate essential master and transactional data from legacy systems with full data integrity validation</li>
        <li>Establish a centralized, governed platform aligned with CPC enterprise architecture standards</li>
        <li>Enable advanced reporting, analytics, and self-service capabilities using modern BI tools</li>
        <li>Integrate source systems securely and support future AI-readiness through architectural best practices</li>
        <li>Institutionalize metadata management, role-based access, and complete lineage tracking</li>
        <li>Provide comprehensive training and system documentation to enable operational independence</li>
      </ul>`}
    </div>
  </div>

  <div class="rfp-section">
    <div class="rfp-section-num">3</div>
    <div class="rfp-section-body">
      <div class="rfp-section-title">Scope of Work</div>
      <p>${data.scope || 'The selected vendor shall deliver a comprehensive solution covering all functional and technical requirements specified herein.'}</p>
      
      <div class="rfp-subsection">
        <div class="rfp-subsection-title">3.1 Functional Configuration &amp; Validation</div>
        <p>Configure the following modules with entity-specific setups:</p>
        <ul>
          <li><strong>HR &amp; Human Capital Management:</strong> Legal entity, positions, leave rules, payroll elements, self-service workflows</li>
          <li><strong>Finance &amp; Accounting:</strong> Chart of Accounts, GL/AP/AR/FA, Cash Management, intercompany transactions</li>
          <li><strong>Procurement &amp; Contracts:</strong> Supplier structure, category sets, approval matrix, purchase order workflows, contract management</li>
          <li><strong>System Administration:</strong> RBAC, responsibilities, and data access security provisioning</li>
        </ul>
        <div class="rfp-deliverables">
          <strong>Deliverables:</strong> Functional configuration documents (BR100s, RD20s, MD50s) · Defined approval hierarchies · Value sets and cross-validation rules
        </div>
      </div>

      <div class="rfp-subsection">
        <div class="rfp-subsection-title">3.2 Data Migration &amp; Master Data Setup</div>
        <ul>
          <li>Clean, validate, and import employee, supplier, item, COA, and location data</li>
          <li>Define naming standards, governance rules, and master data stewardship practices</li>
          <li>Execute cutover activities and reconciliation post-migration</li>
        </ul>
        <div class="rfp-deliverables">
          <strong>Deliverables:</strong> Pre-load validation and post-load reconciliation reports · Data ownership and governance model
        </div>
      </div>

      <div class="rfp-subsection">
        <div class="rfp-subsection-title">3.3 Reporting &amp; Business Intelligence</div>
        <ul>
          <li>Implement Medallion Architecture (Bronze → Silver → Gold layers) for data warehouse</li>
          <li>Deploy BI platform with role-based dashboards for Finance, HR, and Procurement</li>
          <li>Establish security-aware report access model with row-level security</li>
          <li>Develop management dashboards with KPIs, drill-downs, and tooltips</li>
        </ul>
        <div class="rfp-deliverables">
          <strong>Deliverables:</strong> Report inventory and output samples · Dashboard templates · User role-to-report access mapping
        </div>
      </div>

      <div class="rfp-subsection">
        <div class="rfp-subsection-title">3.4 Integration Architecture</div>
        <ul>
          <li>All existing integrations with source systems shall remain operational without disruption</li>
          <li>API-based integration with UAE Government Portal, UAE Pass, and ministry systems</li>
          <li>Seamless connectivity supporting structured, unstructured, and semi-structured data</li>
        </ul>
      </div>

      <div class="rfp-subsection">
        <div class="rfp-subsection-title">3.5 Training &amp; Knowledge Transfer</div>
        <ul>
          <li>Deliver targeted end-user training across all departments</li>
          <li>Provide technical handover and administration training for designated CPC staff</li>
          <li>Share comprehensive SOPs, configuration guides, and quick reference materials</li>
        </ul>
      </div>
    </div>
  </div>

  <div class="rfp-section">
    <div class="rfp-section-num">4</div>
    <div class="rfp-section-body">
      <div class="rfp-section-title">Technical Requirements</div>
      <p>${data.tech_requirements || 'All technical deliverables must comply with CPC IT standards and UAE government cybersecurity frameworks.'}</p>
      <table class="rfp-spec-table">
        <tr><th>Attribute</th><th>Requirement</th></tr>
        <tr><td>Target Organization</td><td>Crown Prince's Court, Abu Dhabi</td></tr>
        <tr><td>Deployment Model</td><td>On-Premise (CPC Data Center) / Cloud with UAE Data Residency</td></tr>
        <tr><td>Data Classification</td><td>Secret, Confidential</td></tr>
        <tr><td>Row-Level Security</td><td>Mandatory across all modules</td></tr>
        <tr><td>Authentication</td><td>UAE Pass / Active Directory integration required</td></tr>
        <tr><td>Language Support</td><td>Full Arabic (RTL) and English, Hijri calendar support</td></tr>
        <tr><td>Environments</td><td>Development, QA/UAT, Production</td></tr>
        <tr><td>Uptime SLA</td><td>Minimum 99.9% for production environment</td></tr>
        <tr><td>Security Standards</td><td>ISO 27001 / SOC 2 / UAE IA Standards compliant</td></tr>
        <tr><td>Mobile Support</td><td>iOS and Android applications required</td></tr>
      </table>
    </div>
  </div>

  <div class="rfp-section">
    <div class="rfp-section-num">5</div>
    <div class="rfp-section-body">
      <div class="rfp-section-title">Key Assumptions</div>
      <ul>
        <li>The implementation will leverage existing CPC infrastructure where applicable</li>
        <li>CPC's central IT team will provide infrastructure and DBA-level support</li>
        <li>Existing policies, templates, and security models will serve as baselines for customization</li>
        <li>Vendor will coordinate closely with CPC IT, Legal, and Security teams throughout the project</li>
        <li>All configuration components from other CPC entities may be reused if applicable and approved</li>
      </ul>
    </div>
  </div>

  <div class="rfp-section">
    <div class="rfp-section-num">6</div>
    <div class="rfp-section-body">
      <div class="rfp-section-title">Vendor Requirements</div>
      <ul>
        <li>Proven capability in enterprise ERP, Data Warehouse design, and BI platform integration</li>
        <li>Demonstrated understanding of secure multi-entity environments and metadata governance</li>
        <li>Minimum 3 successfully completed implementations in UAE government or quasi-government entities within the last 5 years</li>
        <li>Strong documentation, capacity-building, and knowledge transfer track record</li>
        <li>Valid UAE Trade License and relevant professional certifications</li>
        <li>Dedicated project team with certified professionals for each module</li>
      </ul>
    </div>
  </div>

  <div class="rfp-section">
    <div class="rfp-section-num">7</div>
    <div class="rfp-section-body">
      <div class="rfp-section-title">Evaluation Criteria</div>
      <table class="rfp-spec-table">
        <tr><th>Criterion</th><th>Weight</th><th>Description</th></tr>
        <tr><td>Technical Proposal Quality</td><td>40%</td><td>Completeness, approach, methodology, and innovation</td></tr>
        <tr><td>Financial Proposal</td><td>30%</td><td>Value for money, transparency, phase-wise breakdown</td></tr>
        <tr><td>Relevant Experience</td><td>20%</td><td>Government sector ERP and BI implementations in GCC</td></tr>
        <tr><td>Certifications &amp; Compliance</td><td>10%</td><td>ISO 27001, SOC 2, and UAE regulatory compliance</td></tr>
      </table>
    </div>
  </div>

  <div class="rfp-section">
    <div class="rfp-section-num">8</div>
    <div class="rfp-section-body">
      <div class="rfp-section-title">Proposal Submission Requirements</div>
      <p>Vendors must submit a complete proposal package including:</p>
      <ul>
        <li>A comprehensive technical and project execution plan with detailed resourcing plan</li>
        <li>Portfolio of completed comparable projects with reference contact details</li>
        <li>CVs and certifications of proposed delivery team members</li>
        <li>Commercial proposal (Fixed Price or T&amp;M) with clear phase-wise cost breakdown</li>
        <li>Company profile, valid Trade License, and Certificate of Registration</li>
        <li>Implementation timeline with major milestones and deliverables schedule</li>
        <li>Risk register and proposed mitigation strategies</li>
        <li>Post-implementation support and warranty terms</li>
      </ul>
      <div class="rfp-deliverables" style="margin-top:1rem">
        <strong>Definition of Done — Required Approvals:</strong><br>
        Business Requirements Document (BRD) · Solution Architecture Document (SAD) · UX/UI Design Artifacts · Test Strategy &amp; Cases · Security &amp; Compliance Checklist · Deployment &amp; Release Plan · Operations &amp; Support Guide · Information Architecture Diagrams
      </div>
    </div>
  </div>

  <div class="rfp-footer">
    <div>Crown Prince's Court | Procurement Department | Abu Dhabi, United Arab Emirates</div>
    <div>procurement@cpc.gov.ae | +971 2 XXX XXXX | Ref: ${refNum}</div>
    <div style="margin-top:0.5rem;font-size:0.75rem;color:#888">This document is CONFIDENTIAL and intended solely for invited vendors. Unauthorized distribution is prohibited.</div>
  </div>
</div>`
}

function computeVendorScore(v: any, rfp: any): number {
  let score = 40
  const specs = (v.specializations || '').toLowerCase()
  const rfpText = ((rfp?.title || '') + ' ' + (rfp?.scope || '') + ' ' + (rfp?.tech_requirements || '')).toLowerCase()
  if (specs.includes('erp')) score += 15
  if (specs.includes('oracle') && rfpText.includes('oracle')) score += 15
  else if (specs.includes('sap') || specs.includes('oracle') || specs.includes('microsoft')) score += 10
  if (specs.includes('government') || specs.includes('public sector')) score += 10
  if ((v.erp_experience || '').toLowerCase().includes('government')) score += 10
  if ((v.certifications || '').includes('ISO')) score += 5
  if (v.size === 'Large') score += 5
  return Math.min(score, 100)
}

function buildFitRationale(v: any, score: number): string {
  const factors: string[] = []
  if ((v.specializations || '').toLowerCase().includes('erp')) factors.push('Strong ERP expertise')
  if ((v.specializations || '').toLowerCase().includes('oracle')) factors.push('Oracle certified')
  if ((v.specializations || '').toLowerCase().includes('government')) factors.push('Government sector experience')
  if ((v.certifications || '').includes('ISO')) factors.push('ISO certified')
  if (score >= 70) return `Strong candidate: ${factors.join(', ') || 'well-positioned'}. Recommended for shortlist.`
  if (score >= 50) return `Moderate fit: ${factors.join(', ') || 'meets minimum requirements'} with some gaps.`
  return `Limited fit for this RFP. Consider for future tenders.`
}

function computeExperienceScore(v: any): number {
  let score = 50
  if ((v.erp_experience || '').toLowerCase().includes('government')) score += 20
  if ((v.certifications || '').includes('ISO')) score += 10
  if (v.size === 'Large') score += 10
  if ((v.specializations || '').toLowerCase().includes('erp')) score += 10
  return Math.min(score, 95)
}

function buildEvalSummary(p: any, tech: number, fin: number, exp: number, total: number): string {
  const grade = total >= 80 ? 'Excellent' : total >= 65 ? 'Good' : total >= 50 ? 'Adequate' : 'Below threshold'
  return `${grade} candidate (${total}/100). Technical: ${tech}/100, Financial: ${fin}/100, Experience: ${exp}/100. ${total >= 70 ? 'Recommended for shortlist.' : 'Requires further review.'}`
}

function buildRecommendationSummary(top: any, rankings: any[]): string {
  return `Based on comprehensive AI-driven evaluation of ${rankings.length} submitted proposals, <strong>${top.vendor_name}</strong> is recommended as the preferred vendor, achieving the highest composite score of <strong>${top.total_score}/100</strong>.\n\nKey differentiators include strong technical capability (${top.technical_score}/100), competitive financial proposal (${top.financial_score}/100), and proven relevant experience (${top.experience_score}/100). The vendor demonstrates deep expertise in government sector implementations and compliance with UAE regulatory requirements.\n\nProcurement Management endorses proceeding with contract negotiations with ${top.vendor_name} as primary vendor, with ${rankings[1]?.vendor_name || 'second-ranked vendor'} retained as fallback option.`
}

function draftAnswer(question: string): string {
  const q = question.toLowerCase()
  if (q.includes('timeline') || q.includes('duration') || q.includes('implementation')) return 'The expected project timeline is 12-18 months for full implementation, including discovery, design, development, UAT, and go-live phases. A detailed project plan will be required as part of the technical proposal.'
  if (q.includes('data') && q.includes('migrat')) return 'Data migration is included in the scope. Vendors must provide a comprehensive data migration strategy covering legacy system extraction, cleansing, transformation, and validation. CPC will provide access to legacy systems during the migration phase.'
  if (q.includes('integrat')) return 'The system must integrate with UAE Government Portal, UAE Pass authentication, Ministry of Finance systems, and internal CPC legacy applications. A detailed integration specification will be provided to shortlisted vendors during due diligence.'
  if (q.includes('training') || q.includes('support')) return 'Comprehensive training is mandatory for system administrators, end-users, and management. Post-go-live support must include a minimum 2-year warranty period with 24/7 helpdesk support.'
  if (q.includes('arabic') || q.includes('language')) return 'Full Arabic language support is a mandatory requirement. The system must support RTL text rendering, Arabic date formats (Hijri calendar), and comply with UAE localization standards across all modules.'
  if (q.includes('cloud') || q.includes('hosting')) return 'The system must be hosted on UAE-based cloud infrastructure to comply with data residency requirements. Accepted providers include Microsoft Azure UAE, AWS Middle East (UAE), and UAE Government Cloud (G-Cloud).'
  if (q.includes('budget') || q.includes('cost') || q.includes('price')) return 'The budget envelope will be disclosed to shortlisted vendors during the technical briefing session. The financial proposal must provide a detailed cost breakdown including licensing, implementation, training, support, and maintenance costs.'
  if (q.includes('experience') || q.includes('reference')) return 'Vendors must demonstrate a minimum of 3 successfully completed implementations in UAE government or quasi-government entities within the last 5 years. Reference letters and contact details must be provided for verification.'
  return 'Thank you for your question. This matter will be addressed in the official Q&A document to be published to all shortlisted vendors. If urgent, please contact procurement@cpc.gov.ae.'
}

function getSampleQuestions() {
  return [
    { question: 'What is the expected project implementation timeline from contract signing to go-live?' },
    { question: 'What are the specific data migration requirements from legacy systems?' },
    { question: 'Which government systems must the solution integrate with (e.g., UAE Pass, Ministry of Finance)?' },
    { question: 'What training programs and post-implementation support are required?' },
    { question: 'Are there specific requirements for Arabic language and Hijri calendar support?' },
    { question: 'What are the cloud hosting and data residency requirements for UAE compliance?' },
    { question: 'What is the budget envelope for this project?' },
    { question: 'What government sector experience is required from the vendor?' },
    { question: 'What security certifications are mandatory (ISO 27001, SOC 2, etc.)?' },
  ]
}
