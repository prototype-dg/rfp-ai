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
// STATS
// ============================================================
apiRouter.get('/stats', async (c) => {
  try {
    const db = c.env.DB
    const [vendors, shortlisted, proposals, emails] = await Promise.all([
      db.prepare('SELECT COUNT(*) as cnt FROM vendors').first<{cnt:number}>(),
      db.prepare('SELECT COUNT(*) as cnt FROM vendors WHERE shortlisted=1').first<{cnt:number}>(),
      db.prepare('SELECT COUNT(*) as cnt FROM proposals').first<{cnt:number}>(),
      db.prepare('SELECT COUNT(*) as cnt FROM email_log').first<{cnt:number}>(),
    ])
    return c.json({
      vendors: vendors?.cnt || 0,
      shortlisted: shortlisted?.cnt || 0,
      proposals: proposals?.cnt || 0,
      emails: emails?.cnt || 0,
    })
  } catch {
    return c.json({ vendors: 0, shortlisted: 0, proposals: 0, emails: 0 })
  }
})

// ============================================================
// RFP
// ============================================================
apiRouter.get('/rfp', async (c) => {
  const rfp = await c.env.DB.prepare('SELECT * FROM rfps ORDER BY id DESC LIMIT 1').first()
  if (!rfp) return c.json(null, 404)
  return c.json(rfp)
})

apiRouter.post('/rfp', async (c) => {
  const body = await c.req.json()
  const existing = await c.env.DB.prepare('SELECT id FROM rfps LIMIT 1').first<{id:number}>()
  if (existing) {
    await c.env.DB.prepare(`
      UPDATE rfps SET title=?, category=?, budget=?, deadline=?, scope=?, tech_requirements=?, updated_at=datetime('now')
      WHERE id=?
    `).bind(body.title, body.category, body.budget, body.deadline, body.scope, body.tech_requirements, existing.id).run()
    const rfp = await c.env.DB.prepare('SELECT * FROM rfps WHERE id=?').bind(existing.id).first()
    return c.json(rfp)
  } else {
    const r = await c.env.DB.prepare(`
      INSERT INTO rfps (title, category, budget, deadline, scope, tech_requirements, stage, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'draft', datetime('now'), datetime('now'))
    `).bind(body.title, body.category, body.budget, body.deadline, body.scope, body.tech_requirements).run()
    const rfp = await c.env.DB.prepare('SELECT * FROM rfps WHERE id=?').bind(r.meta.last_row_id).first()
    return c.json(rfp)
  }
})

apiRouter.post('/rfp/generate', async (c) => {
  const body = await c.req.json()
  const content = buildRFPContent(body)

  const existing = await c.env.DB.prepare('SELECT id FROM rfps LIMIT 1').first<{id:number}>()
  let rfpId: number
  if (existing) {
    await c.env.DB.prepare(`
      UPDATE rfps SET title=?, category=?, budget=?, deadline=?, scope=?, tech_requirements=?, content=?, updated_at=datetime('now')
      WHERE id=?
    `).bind(body.title, body.category, body.budget, body.deadline, body.scope, body.tech_requirements, content, existing.id).run()
    rfpId = existing.id
  } else {
    const r = await c.env.DB.prepare(`
      INSERT INTO rfps (title, category, budget, deadline, scope, tech_requirements, content, stage, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', datetime('now'), datetime('now'))
    `).bind(body.title, body.category, body.budget, body.deadline, body.scope, body.tech_requirements, content).run()
    rfpId = r.meta.last_row_id as number
  }

  const rfp = await c.env.DB.prepare('SELECT * FROM rfps WHERE id=?').bind(rfpId).first()
  return c.json(rfp)
})

apiRouter.post('/rfp/stage', async (c) => {
  const { stage } = await c.req.json()
  const existing = await c.env.DB.prepare('SELECT id FROM rfps LIMIT 1').first<{id:number}>()
  if (!existing) return c.json({ error: 'No RFP found' }, 404)
  await c.env.DB.prepare(`UPDATE rfps SET stage=?, updated_at=datetime('now') WHERE id=?`).bind(stage, existing.id).run()
  return c.json({ ok: true, stage })
})

// ============================================================
// VENDORS
// ============================================================
apiRouter.get('/vendors', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM vendors ORDER BY name ASC').all()
  return c.json(results)
})

apiRouter.put('/vendors/:id/shortlist', async (c) => {
  const id = c.req.param('id')
  const { shortlisted } = await c.req.json()
  await c.env.DB.prepare('UPDATE vendors SET shortlisted=? WHERE id=?').bind(shortlisted ? 1 : 0, id).run()
  return c.json({ ok: true })
})

apiRouter.post('/vendors/ai-shortlist', async (c) => {
  // Score all vendors based on ERP expertise
  const { results: vendors } = await c.env.DB.prepare('SELECT * FROM vendors').all<any>()
  for (const v of vendors) {
    const score = computeVendorScore(v)
    const shortlisted = score >= 60 ? 1 : 0
    await c.env.DB.prepare('UPDATE vendors SET fit_score=?, shortlisted=?, fit_rationale=? WHERE id=?')
      .bind(score, shortlisted, buildFitRationale(v, score), v.id).run()
  }
  return c.json({ ok: true })
})

// ============================================================
// QUESTIONS
// ============================================================
apiRouter.get('/questions', async (c) => {
  const { results } = await c.env.DB.prepare(`
    SELECT q.*, v.name as vendor_name 
    FROM questions q 
    LEFT JOIN vendors v ON q.vendor_id = v.id
    ORDER BY q.id ASC
  `).all()
  return c.json(results)
})

apiRouter.post('/questions/load-samples', async (c) => {
  const sampleQs = getSampleQuestions()
  const { results: vendors } = await c.env.DB.prepare('SELECT id FROM vendors LIMIT 5').all<{id:number}>()
  for (let i = 0; i < sampleQs.length; i++) {
    const vid = vendors[i % vendors.length]?.id || null
    const existing = await c.env.DB.prepare('SELECT id FROM questions WHERE question=?').bind(sampleQs[i].question).first()
    if (!existing) {
      await c.env.DB.prepare(`
        INSERT INTO questions (question, vendor_id, published, created_at)
        VALUES (?, ?, 0, datetime('now'))
      `).bind(sampleQs[i].question, vid).run()
    }
  }
  return c.json({ ok: true })
})

apiRouter.post('/questions/:id/draft', async (c) => {
  const id = c.req.param('id')
  const q = await c.env.DB.prepare('SELECT * FROM questions WHERE id=?').bind(id).first<any>()
  if (!q) return c.json({ error: 'Not found' }, 404)
  const answer = draftAnswer(q.question)
  await c.env.DB.prepare('UPDATE questions SET answer=? WHERE id=?').bind(answer, id).run()
  return c.json({ ok: true, answer })
})

apiRouter.post('/questions/draft-all', async (c) => {
  const { results: qs } = await c.env.DB.prepare('SELECT * FROM questions WHERE (answer IS NULL OR answer="") AND published=0').all<any>()
  for (const q of qs) {
    const answer = draftAnswer(q.question)
    await c.env.DB.prepare('UPDATE questions SET answer=? WHERE id=?').bind(answer, q.id).run()
  }
  return c.json({ ok: true })
})

apiRouter.put('/questions/:id/approve', async (c) => {
  const id = c.req.param('id')
  await c.env.DB.prepare('UPDATE questions SET published=1 WHERE id=?').bind(id).run()
  return c.json({ ok: true })
})

apiRouter.put('/questions/:id/answer', async (c) => {
  const id = c.req.param('id')
  const { answer } = await c.req.json()
  await c.env.DB.prepare('UPDATE questions SET answer=?, published=1 WHERE id=?').bind(answer, id).run()
  return c.json({ ok: true })
})

apiRouter.post('/questions/publish-all', async (c) => {
  await c.env.DB.prepare('UPDATE questions SET published=1 WHERE answer IS NOT NULL AND answer != ""').run()
  return c.json({ ok: true })
})

// ============================================================
// EMAILS
// ============================================================
apiRouter.get('/emails', async (c) => {
  const { results } = await c.env.DB.prepare(`
    SELECT e.*, v.name as vendor_name 
    FROM email_log e 
    LEFT JOIN vendors v ON e.vendor_id = v.id
    ORDER BY e.id DESC
  `).all()
  return c.json(results)
})

apiRouter.post('/emails/send-invitations', async (c) => {
  const { results: vendors } = await c.env.DB.prepare('SELECT * FROM vendors WHERE shortlisted=1').all<any>()
  for (const v of vendors) {
    const already = await c.env.DB.prepare(`SELECT id FROM email_log WHERE vendor_id=? AND email_type='invitation'`).bind(v.id).first()
    if (already) continue
    const isAndersen = v.contact_email?.includes('andersenlab.com') || v.name?.toLowerCase().includes('andersen')
    await c.env.DB.prepare(`
      INSERT INTO email_log (vendor_id, recipient, subject, body, email_type, status, created_at)
      VALUES (?, ?, ?, ?, 'invitation', ?, datetime('now'))
    `).bind(
      v.id,
      v.contact_email || 'contact@' + v.name.toLowerCase().replace(/\s/g, '') + '.com',
      `Invitation to Tender - CPC ERP System RFP`,
      `Dear ${v.name},\n\nThe Crown Prince's Court (CPC) invites your organization to submit a proposal for the Enterprise Resource Planning (ERP) System Implementation.\n\nPlease review the attached RFP document and submit your proposal by the deadline.\n\nBest regards,\nProcurement Department\nCrown Prince's Court`,
      isAndersen ? 'sent' : 'simulated'
    ).run()
  }
  return c.json({ ok: true })
})

// ============================================================
// PROPOSALS
// ============================================================
apiRouter.get('/proposals', async (c) => {
  const { results } = await c.env.DB.prepare(`
    SELECT p.*, v.name as vendor_name
    FROM proposals p
    LEFT JOIN vendors v ON p.vendor_id = v.id
    ORDER BY p.id DESC
  `).all()
  return c.json(results)
})

apiRouter.post('/proposals/sample', async (c) => {
  const { results: vendors } = await c.env.DB.prepare('SELECT * FROM vendors WHERE shortlisted=1 LIMIT 6').all<any>()
  if (vendors.length === 0) {
    const { results: allV } = await c.env.DB.prepare('SELECT * FROM vendors LIMIT 6').all<any>()
    for (const v of allV) {
      await insertSampleProposal(c.env.DB, v)
    }
  } else {
    for (const v of vendors) {
      const already = await c.env.DB.prepare('SELECT id FROM proposals WHERE vendor_id=?').bind(v.id).first()
      if (!already) await insertSampleProposal(c.env.DB, v)
    }
  }
  return c.json({ ok: true })
})

// ============================================================
// EVALUATIONS
// ============================================================
apiRouter.get('/evaluations', async (c) => {
  const { results } = await c.env.DB.prepare(`
    SELECT e.*, v.name as vendor_name
    FROM evaluations e
    LEFT JOIN vendors v ON e.vendor_id = v.id
    ORDER BY e.total_score DESC
  `).all()
  return c.json(results)
})

apiRouter.post('/evaluations/run', async (c) => {
  const { results: proposals } = await c.env.DB.prepare(`
    SELECT p.*, v.name as vendor_name, v.erp_experience, v.certifications, v.specializations
    FROM proposals p
    LEFT JOIN vendors v ON p.vendor_id = v.id
  `).all<any>()

  if (proposals.length === 0) {
    await insertSampleProposal(c.env.DB, null)
    return c.json({ ok: true, message: 'No proposals found. Added samples.' })
  }

  for (const p of proposals) {
    const existing = await c.env.DB.prepare('SELECT id FROM evaluations WHERE proposal_id=?').bind(p.id).first()
    if (existing) continue

    const techScore = 50 + Math.floor(Math.random() * 40)
    const finScore = 50 + Math.floor(Math.random() * 40)
    const expScore = computeExperienceScore(p)
    const total = Math.round((techScore * 0.4) + (finScore * 0.3) + (expScore * 0.3))

    await c.env.DB.prepare(`
      INSERT INTO evaluations (proposal_id, vendor_id, technical_score, financial_score, experience_score, total_score, ai_summary, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).bind(
      p.id, p.vendor_id,
      techScore, finScore, expScore, total,
      buildEvalSummary(p, techScore, finScore, expScore, total)
    ).run()
  }
  return c.json({ ok: true })
})

// ============================================================
// RECOMMENDATION
// ============================================================
apiRouter.get('/recommendation', async (c) => {
  const rec = await c.env.DB.prepare('SELECT * FROM recommendations ORDER BY id DESC LIMIT 1').first<any>()
  if (!rec) return c.json(null, 404)
  return c.json({ ...rec, rankings: JSON.parse(rec.rankings_json || '[]') })
})

apiRouter.post('/recommendation/generate', async (c) => {
  const { results: evals } = await c.env.DB.prepare(`
    SELECT e.*, v.name as vendor_name
    FROM evaluations e
    LEFT JOIN vendors v ON e.vendor_id = v.id
    ORDER BY e.total_score DESC
  `).all<any>()

  if (evals.length === 0) return c.json({ error: 'No evaluations found. Run evaluation first.' }, 400)

  const rankings = evals.map((e: any, i: number) => ({
    rank: i + 1,
    vendor_name: e.vendor_name,
    total_score: e.total_score,
    technical_score: e.technical_score,
    financial_score: e.financial_score,
    experience_score: e.experience_score,
  }))

  const top = rankings[0]
  const summary = buildRecommendationSummary(top, rankings)

  await c.env.DB.prepare(`
    INSERT OR REPLACE INTO recommendations (top_vendor, rankings_json, summary, created_at)
    VALUES (?, ?, ?, datetime('now'))
  `).bind(top.vendor_name, JSON.stringify(rankings), summary).run()

  return c.json({ ok: true, rankings, summary })
})

// ============================================================
// HELPER FUNCTIONS
// ============================================================
function buildRFPContent(data: any): string {
  const today = new Date().toLocaleDateString('en-AE', { year: 'numeric', month: 'long', day: 'numeric' })
  return `
    <div class="rfp-preview">
      <div style="text-align:center;margin-bottom:2rem">
        <div style="font-size:1.5rem;font-weight:900;color:var(--cpc-navy);letter-spacing:2px">Crown Prince's Court</div>
        <div style="color:var(--cpc-gold);font-weight:600;margin-top:0.25rem">دیوان ولی العهد</div>
        <div style="font-size:0.8rem;color:#666;margin-top:0.5rem">Abu Dhabi, United Arab Emirates</div>
      </div>
      <h1>Request for Proposal (RFP)</h1>
      <h2 style="color:var(--cpc-gold)">${data.title || 'Enterprise Resource Planning (ERP) System'}</h2>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin:1rem 0;font-size:0.9rem">
        <div><strong>RFP Reference:</strong> CPC/PROC/2025/ERP-001</div>
        <div><strong>Issue Date:</strong> ${today}</div>
        <div><strong>Category:</strong> ${data.category || 'IT & Digital Transformation'}</div>
        <div><strong>Submission Deadline:</strong> ${data.deadline ? new Date(data.deadline).toLocaleDateString('en-AE') : '30 days from issuance'}</div>
        ${data.budget ? `<div><strong>Budget:</strong> AED ${data.budget}</div>` : ''}
      </div>
      <div class="section">
        <h2>1. Executive Summary</h2>
        <p>The Crown Prince's Court (CPC) of Abu Dhabi invites qualified vendors to submit proposals for the ${data.title || 'Enterprise Resource Planning (ERP) System Implementation'}. This initiative is part of CPC's digital transformation strategy to modernize administrative operations and enhance government service delivery across the Emirate of Abu Dhabi.</p>
      </div>
      <div class="section">
        <h2>2. Scope of Work</h2>
        <p>${data.scope || 'Implementation of a comprehensive ERP system covering all administrative functions of the Crown Prince\'s Court.'}</p>
        <ul style="margin-top:0.75rem;padding-left:1.5rem">
          <li>HR & Payroll Management System</li>
          <li>Finance & Accounting Module</li>
          <li>Procurement & Contract Management</li>
          <li>Document & Records Management</li>
          <li>Business Intelligence & Reporting</li>
          <li>Arabic Language Support (Full RTL)</li>
          <li>UAE Government Portal Integration</li>
        </ul>
      </div>
      <div class="section">
        <h2>3. Technical Requirements</h2>
        <p>${data.tech_requirements || 'Cloud-based deployment with UAE data residency, ISO 27001 certified, 99.9% SLA uptime.'}</p>
        <ul style="margin-top:0.75rem;padding-left:1.5rem">
          <li>Cloud-Based SaaS Architecture</li>
          <li>UAE Data Residency Compliance</li>
          <li>UAE Pass & UAEIDA Integration</li>
          <li>ISO 27001 / SOC 2 Certification</li>
          <li>Mobile Application Support (iOS/Android)</li>
          <li>Real-time Analytics Dashboard</li>
        </ul>
      </div>
      <div class="section">
        <h2>4. Evaluation Criteria</h2>
        <table style="width:100%;border-collapse:collapse;font-size:0.9rem">
          <tr style="background:var(--cpc-blue);color:white">
            <th style="padding:0.5rem;text-align:left">Criterion</th>
            <th style="padding:0.5rem;text-align:center">Weight</th>
          </tr>
          <tr><td style="padding:0.5rem;border-bottom:1px solid #eee">Technical Proposal</td><td style="padding:0.5rem;text-align:center;border-bottom:1px solid #eee">40%</td></tr>
          <tr><td style="padding:0.5rem;border-bottom:1px solid #eee">Financial Proposal</td><td style="padding:0.5rem;text-align:center;border-bottom:1px solid #eee">30%</td></tr>
          <tr><td style="padding:0.5rem;border-bottom:1px solid #eee">Relevant Experience</td><td style="padding:0.5rem;text-align:center;border-bottom:1px solid #eee">20%</td></tr>
          <tr><td style="padding:0.5rem">Certifications & Compliance</td><td style="padding:0.5rem;text-align:center">10%</td></tr>
        </table>
      </div>
      <div class="section">
        <h2>5. Submission Requirements</h2>
        <p>Vendors must submit their proposals electronically via the CPC Procurement Portal. The submission package must include:</p>
        <ul style="margin-top:0.75rem;padding-left:1.5rem">
          <li>Technical Proposal (max 50 pages)</li>
          <li>Financial Proposal (sealed envelope)</li>
          <li>Company Profile & Credentials</li>
          <li>Proposed Project Timeline</li>
          <li>References from 3 similar government implementations</li>
          <li>Valid Trade License & CR Certificate</li>
        </ul>
      </div>
      <div style="margin-top:2rem;padding:1rem;background:var(--cpc-navy);border-radius:8px;color:white;text-align:center;font-size:0.85rem">
        <strong>Crown Prince's Court | Procurement Department</strong><br>
        Abu Dhabi, United Arab Emirates | procurement@cpc.gov.ae | +971 2 XXX XXXX
      </div>
    </div>
  `
}

function computeVendorScore(v: any): number {
  let score = 40
  const specs = (v.specializations || '').toLowerCase()
  if (specs.includes('erp')) score += 20
  if (specs.includes('sap') || specs.includes('oracle') || specs.includes('microsoft')) score += 15
  if (specs.includes('government') || specs.includes('public sector')) score += 10
  if ((v.erp_experience || '').toLowerCase().includes('government')) score += 10
  if ((v.certifications || '').includes('ISO')) score += 5
  if (v.size === 'Large') score += 5
  return Math.min(score, 100)
}

function buildFitRationale(v: any, score: number): string {
  const factors = []
  if ((v.specializations || '').toLowerCase().includes('erp')) factors.push('Strong ERP expertise')
  if ((v.specializations || '').toLowerCase().includes('government')) factors.push('Government sector experience')
  if ((v.certifications || '').includes('ISO')) factors.push('ISO certified')
  if (score >= 70) return `Strong candidate: ${factors.join(', ')}. Well-positioned for CPC ERP requirements.`
  if (score >= 50) return `Moderate fit: ${factors.join(', ')}. Meets minimum requirements with some gaps.`
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
  return `${grade} candidate (${total}/100). Technical: ${tech}/100, Financial: ${fin}/100, Experience: ${exp}/100. ${
    total >= 70 ? 'Recommended for shortlist.' : 'Requires further review.'
  }`
}

function buildRecommendationSummary(top: any, rankings: any[]): string {
  return `Based on comprehensive AI-driven evaluation of ${rankings.length} submitted proposals, <strong>${top.vendor_name}</strong> is recommended as the preferred vendor for the CPC ERP System Implementation, achieving the highest composite score of <strong>${top.total_score}/100</strong>.\n\nKey differentiators include strong technical capability (${top.technical_score}/100), competitive financial proposal (${top.financial_score}/100), and proven relevant experience (${top.experience_score}/100). The vendor demonstrates deep expertise in government sector ERP implementations and compliance with UAE regulatory requirements.\n\nProcurement Management endorses proceeding with contract negotiations with ${top.vendor_name} as primary vendor, with ${rankings[1]?.vendor_name || 'second-ranked vendor'} retained as fallback option.`
}

function draftAnswer(question: string): string {
  const q = question.toLowerCase()
  if (q.includes('timeline') || q.includes('duration') || q.includes('implementation')) {
    return 'The expected project timeline is 12-18 months for full implementation, including discovery, design, development, UAT, and go-live phases. A detailed project plan will be required as part of the technical proposal.'
  }
  if (q.includes('data') && q.includes('migrat')) {
    return 'Data migration is included in the scope. Vendors must provide a comprehensive data migration strategy covering legacy system extraction, cleansing, transformation, and validation. The Crown Prince\'s Court will provide access to legacy systems during the migration phase.'
  }
  if (q.includes('integrat')) {
    return 'The system must integrate with UAE Government Portal, UAE Pass authentication, Ministry of Finance systems, and internal CPC legacy applications. A detailed integration specification document will be provided to shortlisted vendors during the due diligence phase.'
  }
  if (q.includes('training') || q.includes('support')) {
    return 'Comprehensive training is mandatory, covering system administrators (technical training), end-users (functional training), and management (executive dashboard training). Post-go-live support must include a minimum 2-year warranty period with 24/7 helpdesk support.'
  }
  if (q.includes('arabic') || q.includes('language')) {
    return 'Full Arabic language support is a mandatory requirement. The system must support right-to-left (RTL) text rendering, Arabic date formats (Hijri calendar), and comply with UAE localization standards across all modules and reports.'
  }
  if (q.includes('cloud') || q.includes('hosting')) {
    return 'The system must be hosted on UAE-based cloud infrastructure to comply with data residency requirements. Accepted providers include Microsoft Azure UAE, AWS Middle East (UAE), and UAE Government Cloud (G-Cloud). On-premise deployment options may be considered for specific modules.'
  }
  if (q.includes('budget') || q.includes('cost') || q.includes('price')) {
    return 'The budget range will be disclosed to shortlisted vendors during the technical briefing session. The financial proposal must provide a detailed cost breakdown including licensing, implementation, training, support, and year-2/3 maintenance costs.'
  }
  if (q.includes('experience') || q.includes('reference')) {
    return 'Vendors must demonstrate a minimum of 3 successfully completed ERP implementations in UAE government or quasi-government entities within the last 5 years. Reference letters and contact details must be provided for verification.'
  }
  return `Thank you for your question. This matter will be addressed in the official Q&A document to be published to all shortlisted vendors. If urgent clarification is needed, please contact the procurement team at procurement@cpc.gov.ae, referencing RFP No. CPC/PROC/2025/ERP-001.`
}

function getSampleQuestions() {
  return [
    { question: 'What is the expected project implementation timeline from contract signing to go-live?' },
    { question: 'What are the specific data migration requirements from legacy systems?' },
    { question: 'Which government systems must the ERP integrate with (e.g., UAE Pass, Ministry of Finance)?' },
    { question: 'What training programs and post-implementation support are required?' },
    { question: 'Are there specific requirements for Arabic language and Hijri calendar support?' },
    { question: 'What are the cloud hosting and data residency requirements for UAE compliance?' },
    { question: 'What is the budget envelope for this project?' },
    { question: 'What government sector ERP experience is required from the vendor?' },
    { question: 'What security certifications are mandatory (ISO 27001, SOC 2, etc.)?' },
  ]
}

async function insertSampleProposal(db: D1Database, vendor: any) {
  const { results: vs } = await db.prepare('SELECT * FROM vendors WHERE shortlisted=1 LIMIT 3').all<any>()
  const targets = vendor ? [vendor] : vs
  for (const v of targets) {
    const already = await db.prepare('SELECT id FROM proposals WHERE vendor_id=?').bind(v.id).first()
    if (already) continue
    const tech = 50000000 + Math.floor(Math.random() * 50000000)
    await db.prepare(`
      INSERT INTO proposals (vendor_id, technical_proposal, financial_proposal, status, created_at)
      VALUES (?, ?, ?, 'submitted', datetime('now'))
    `).bind(
      v.id,
      `Technical Proposal from ${v.name}:\n\nExecutive Summary: ${v.name} proposes a comprehensive ERP solution leveraging our ${v.specializations || 'enterprise software'} expertise. Our approach ensures minimal disruption to CPC operations while delivering a future-ready platform.\n\nProposed Solution: SAP S/4HANA Cloud implementation with UAE-specific localization, covering all required modules including HR, Finance, Procurement, and Operations.\n\nImplementation Methodology: Agile-hybrid approach with 4-week sprint cycles. Go-live in 14 months.\n\nReferences: 3 UAE government implementations available upon request.`,
      tech
    ).run()
  }
}
