import { Hono } from 'hono'
import { initDb, seedVendors } from '../db/seed'
import type { Bindings } from '../types'

// WORKER_VERSION: bump this to force Cloudflare to recognise the new bundle
const WORKER_VERSION = '2026-07-25-v15'

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

// GET /rfps/:id/pdf — server-side PDF generation with correct A4 layout
apiRouter.get('/rfps/:id/pdf', async (c) => {
  const id = c.req.param('id')
  const rfp = await c.env.DB.prepare('SELECT * FROM rfps WHERE id=?').bind(id).first()
  if (!rfp) return c.json({ error: 'Not found' }, 404)
  if (!(rfp as any).content) return c.json({ error: 'RFP has no generated content yet' }, 400)
  try {
    const pdfBytes = generateRfpPdf(rfp)
    const safeRef = ((rfp as any).ref_number || String(id)).replace(/\//g, '_').replace(/[^a-zA-Z0-9_\-]/g, '')
    const filename = `CPC_RFP_${safeRef}.pdf`
    return new Response(pdfBytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(pdfBytes.length),
        'Cache-Control': 'no-cache',
      },
    })
  } catch (e: any) {
    return c.json({ error: 'PDF generation failed: ' + e.message }, 500)
  }
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
    const existingRfp = await c.env.DB.prepare('SELECT * FROM rfps WHERE id=?').bind(id).first<any>()
    let archDocText = body.arch_doc_text || existingRfp?.arch_doc_text || ''
    let brdDocText  = body.brd_doc_text  || existingRfp?.brd_doc_text  || ''

    // If either doc field is just a placeholder note (text not extracted), attempt R2 re-fetch + extract
    const isPlaceholder = (t: string) => !t || t.length < 500 || t.startsWith('[Document uploaded:') || t.startsWith('[PDF:')
    const bucket: R2Bucket | undefined = (c.env as any).PROPOSALS_BUCKET
    if (bucket && (isPlaceholder(archDocText) || isPlaceholder(brdDocText))) {
      // List arch-docs keys for this RFP to find the stored PDFs
      const listed = await bucket.list({ prefix: `arch-docs/${id}/` })
      for (const obj of listed.objects) {
        const r2Obj = await bucket.get(obj.key)
        if (!r2Obj) continue
        const ab = await r2Obj.arrayBuffer()
        const bytes = new Uint8Array(ab)
        const extracted = extractTextFromPdfBytes(bytes)
        if (!extracted || extracted.length < 200) continue
        const docType = r2Obj.customMetadata?.docType || (obj.key.toLowerCase().includes('brd') ? 'brd' : 'arch')
        const text = `[Source: ${obj.key}, ${Math.round(bytes.length/1024)}KB]\n\n${extracted.slice(0, 15000)}`
        if (docType === 'brd' && isPlaceholder(brdDocText)) {
          brdDocText = text
          await c.env.DB.prepare(`UPDATE rfps SET brd_doc_text=?, updated_at=datetime('now') WHERE id=?`).bind(text, id).run()
        } else if (docType !== 'brd' && isPlaceholder(archDocText)) {
          archDocText = text
          await c.env.DB.prepare(`UPDATE rfps SET arch_doc_text=?, updated_at=datetime('now') WHERE id=?`).bind(text, id).run()
        }
      }
    }

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

// PDF text extraction for Cloudflare Workers (no Node.js fs/buffer APIs available)
// Uses a streaming byte-level parser to extract raw text from PDF content streams.
function extractTextFromPdfBytes(bytes: Uint8Array): string {
  try {
    // Decode PDF bytes to string (latin1 to preserve all byte values)
    const decoder = new TextDecoder('latin1')
    const raw = decoder.decode(bytes)

    const textParts: string[] = []

    // Strategy 1: Extract all BT...ET (text blocks) from content streams
    // First extract stream contents between "stream" and "endstream"
    const streamRe = /stream\r?\n([\s\S]*?)endstream/g
    let sm: RegExpExecArray | null
    while ((sm = streamRe.exec(raw)) !== null) {
      const streamContent = sm[1]
      // Extract text from Tj and TJ operators within BT/ET blocks
      const btRe = /BT([\s\S]*?)ET/g
      let bm: RegExpExecArray | null
      while ((bm = btRe.exec(streamContent)) !== null) {
        const block = bm[1]
        // Extract string args from Tj: (text) Tj
        const tjRe = /\(([^)\\]*(?:\\.[^)\\]*)*)\)\s*Tj/g
        let tj: RegExpExecArray | null
        while ((tj = tjRe.exec(block)) !== null) {
          textParts.push(unescapePdfString(tj[1]))
        }
        // Extract string arrays from TJ: [(text)(text)...] TJ
        const tjArrayRe = /\[((?:[^[\]]*|\[[^\]]*\])*)\]\s*TJ/g
        let ta: RegExpExecArray | null
        while ((ta = tjArrayRe.exec(block)) !== null) {
          const arrayContent = ta[1]
          const strRe = /\(([^)\\]*(?:\\.[^)\\]*)*)\)/g
          let sr: RegExpExecArray | null
          while ((sr = strRe.exec(arrayContent)) !== null) {
            textParts.push(unescapePdfString(sr[1]))
          }
          textParts.push(' ')
        }
        textParts.push('\n')
      }
    }

    // Strategy 2: Also extract text from any decoded unicode strings (PDF /ToUnicode)
    // Look for UTF-16 encoded strings that start with BOM
    const utf16Re = /\xfe\xff([\s\S]{2,200}?)(?=\x00\x00|\))/g
    let um: RegExpExecArray | null
    while ((um = utf16Re.exec(raw)) !== null) {
      try {
        const utf16Bytes = []
        const s = um[1]
        for (let i = 0; i < s.length; i++) utf16Bytes.push(s.charCodeAt(i))
        const buf = new Uint8Array(utf16Bytes)
        const text = new TextDecoder('utf-16be').decode(buf)
        if (/[\w\s]{3,}/.test(text)) textParts.push(text)
      } catch (_) {}
    }

    // Combine, clean up PDF escape sequences and non-printable chars
    let combined = textParts.join('')
    // Remove non-printable chars except newlines/tabs/spaces
    combined = combined.replace(/[^\x09\x0A\x0D\x20-\x7E\u00A0-\uFFFF]/g, ' ')
    // Collapse excessive whitespace but preserve paragraph breaks
    combined = combined.replace(/[ \t]+/g, ' ')
    combined = combined.replace(/\n{3,}/g, '\n\n')
    combined = combined.trim()

    // If extraction got very little text (< 200 chars), return empty to signal failure
    if (combined.length < 200) return ''
    return combined
  } catch (_) {
    return ''
  }
}

function unescapePdfString(s: string): string {
  return s
    .replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t')
    .replace(/\\b/g, '\b').replace(/\\f/g, '\f')
    .replace(/\\\(/g, '(').replace(/\\\)/g, ')').replace(/\\\\/g, '\\')
    .replace(/\\([0-7]{1,3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)))
}

// POST /rfps/:id/upload-arch-doc — upload a supporting document PDF with text extraction
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

    // Store in R2 if available
    const bucket: R2Bucket | undefined = (c.env as any).PROPOSALS_BUCKET
    let r2Key = ''
    if (bucket) {
      r2Key = `arch-docs/${id}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
      await bucket.put(r2Key, bytes, {
        httpMetadata: { contentType: file.type || 'application/pdf' },
        customMetadata: { rfpId: String(id), docType: isBRD ? 'brd' : 'arch' },
      })
    }

    // Extract text from the PDF for LLM context
    let extractedText = extractTextFromPdfBytes(bytes)
    let storageNote = ''
    if (!extractedText || extractedText.length < 200) {
      // Fallback: store a metadata note indicating text could not be extracted
      storageNote = `[PDF: ${file.name}, ${Math.round(bytes.length/1024)}KB — text extraction incomplete. File stored in R2 at key: ${r2Key}. Use file name and context to infer content type.]`
      extractedText = storageNote
    } else {
      // Prefix extracted text with document metadata
      storageNote = `[Source: ${file.name}, ${Math.round(bytes.length/1024)}KB]\n\n`
      extractedText = storageNote + extractedText
      // Cap at 40000 chars to stay within LLM context window
      if (extractedText.length > 40000) extractedText = extractedText.slice(0, 40000) + '\n\n[... document continues — content above is sufficient for RFP generation ...]'
    }

    if (isBRD) {
      await c.env.DB.prepare(`UPDATE rfps SET brd_doc_text=?, updated_at=datetime('now') WHERE id=?`).bind(extractedText, id).run()
    } else {
      await c.env.DB.prepare(`UPDATE rfps SET arch_doc_text=?, updated_at=datetime('now') WHERE id=?`).bind(extractedText, id).run()
    }

    return c.json({
      ok: true,
      column: isBRD ? 'brd_doc_text' : 'arch_doc_text',
      size: bytes.length,
      r2Key,
      extracted_chars: extractedText.length,
      extraction_ok: extractedText.length > 500
    })
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

  try {
    const rfp = await c.env.DB.prepare('SELECT * FROM rfps WHERE id=?').bind(rfpId).first<any>()

    const { results: allQuestions } = await c.env.DB.prepare(`
      SELECT q.*, COALESCE(v.name, 'Unknown Vendor') as vendor_name
      FROM questions q
      LEFT JOIN vendors v ON q.vendor_id = v.id
      WHERE q.rfp_id=? AND q.published=1
      ORDER BY q.vendor_id, q.id
    `).bind(rfpId).all<any>()

    const xlsxBytes = generateQAExcel(allQuestions)
    const xlsxBase64 = uint8ToBase64(xlsxBytes)
    const xlsxFilename = `QA_Consolidated_${(rfp?.ref_number || 'RFP').replace(/\//g,'_')}.xlsx`

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
            await c.env.DB.prepare(`
              INSERT INTO email_log (rfp_id, vendor_id, recipient, subject, body, email_type, status, has_attachment, created_at)
              VALUES (?,?,?,?,?,'qa_response','sent',1,datetime('now'))
            `).bind(rfpId, vendor.id, vendor.contact_email,
              `Q&A Consolidated Response – ${rfp?.title || 'CPC RFP'} (Ref: ${rfp?.ref_number || ''})`,
              emailText).run()
          } else {
            sentTo.push(vendor.contact_email + ' (send-failed)')
          }
        } catch(sendErr: any) {
          sentTo.push(vendor.contact_email + ' (error)')
        }
      } else {
        sentTo.push(vendor.contact_email + ' (simulated)')
        await c.env.DB.prepare(`
          INSERT INTO email_log (rfp_id, vendor_id, recipient, subject, body, email_type, status, has_attachment, created_at)
          VALUES (?,?,?,?,?,'qa_response','simulated',1,datetime('now'))
        `).bind(rfpId, vendor.id, vendor.contact_email,
          `Q&A Consolidated Response – ${rfp?.title || 'CPC RFP'} (Ref: ${rfp?.ref_number || ''})`,
          emailText).run()
      }
    }

    return c.json({ ok: true, sentTo, totalQuestions: allQuestions.length, vendorCount: activeVendors.length })
  } catch(e: any) {
    return c.json({ ok: false, error: e?.message }, 500)
  }
})

// ============================================================
// EMAILS — send invitations
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
    if (v.rfp_status === 'declined') {
      results.push({ vendor: v.name, status: 'declined_skipped' })
      continue
    }

    const existing = await c.env.DB.prepare(
      `SELECT id, status FROM email_log WHERE vendor_id=? AND rfp_id=? AND email_type='invitation'`
    ).bind(v.id, rfpId).first<any>()

    if (existing?.status === 'sent') {
      results.push({ vendor: v.name, status: 'already_sent' })
      continue
    }
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

  let realQuestions: string[] = []
  try {
    realQuestions = await readVendorEmailReplies(rfp)
  } catch(e) {
    // no real email integration configured
  }

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
// Simplified: store attachments in R2, create proposal entity.
// No AI evaluation, no PDF text extraction.
// ============================================================
apiRouter.post('/webhook/inbound-email', async (c) => {
  try {
    const payload = await c.req.json() as any
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
    let rfp: any = null
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

    // ── Vendor Identification ────────────────────────────────────
    let vendorRow: any = null
    let codeRfpId: number | null = null

    const participantCodeMatch = (bodyText + '\n' + subject).match(/RFP-(\d+)-V(\d+)/i)
    if (participantCodeMatch) {
      codeRfpId = parseInt(participantCodeMatch[1], 10)
      const codeVendorId = parseInt(participantCodeMatch[2], 10)
      vendorRow = await db.prepare(`SELECT * FROM vendors WHERE id=?`).bind(codeVendorId).first<any>()
      if (codeRfpId && codeRfpId !== rfpId) {
        const codeRfp = await db.prepare(`SELECT * FROM rfps WHERE id=?`).bind(codeRfpId).first<any>()
        if (codeRfp) { rfp = codeRfp }
      }
    }

    if (!vendorRow && fromAddress) {
      vendorRow = await db.prepare(
        `SELECT * FROM vendors WHERE contact_email=? OR contact_email LIKE ? LIMIT 1`
      ).bind(fromAddress, `%${fromAddress.split('@')[1] || 'NOMATCH'}%`).first<any>()
    }

    const vendorId = vendorRow?.id || null
    const vendorDisplayName = vendorRow?.name || fromAddress || 'Vendor'

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

    // ── Simple email categorization (heuristic only — no LLM) ───
    let emailCategory = 'plain_email'
    const bodyLower = bodyText.toLowerCase()
    const declineKeywords = [
      'not interested', 'decline to participate', 'declining to participate',
      'unable to participate', 'cannot participate', 'regret to inform',
      'pass on this opportunity', 'withdraw from', 'will not be submitting',
      'no thank you',
    ]
    const proposalKeywords = ['find attached', 'please find', 'proposal', 'rfp response', 'bid', 'tender response', 'submission', 'attached our', 'attaching our']

    if (declineKeywords.some(kw => bodyLower.includes(kw))) {
      emailCategory = 'decline'
    } else if (pdfAttachment && !spreadsheetAttachment) {
      emailCategory = 'proposal'
    } else if (spreadsheetAttachment) {
      emailCategory = 'questions'
    } else if (pdfAttachment) {
      emailCategory = 'proposal'
    } else if (proposalKeywords.some(k => bodyLower.includes(k)) && hasAttachment) {
      emailCategory = 'proposal'
    }

    console.log(`[webhook] Email category: ${emailCategory} | from: ${fromAddress} | vendor: ${vendorDisplayName} | attachments: ${attachments.length}`)

    // ── Log the inbound email ────────────────────────────────────
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
    let newCount = 0

    if (emailCategory === 'decline') {
      // Mark vendor as declined
      if (vendorId) {
        await db.prepare(`
          INSERT INTO rfp_vendors (rfp_id, vendor_id, shortlisted, status, declined_at)
          VALUES (?,?,0,'declined',datetime('now'))
          ON CONFLICT(rfp_id, vendor_id) DO UPDATE SET status='declined', declined_at=datetime('now')
        `).bind(rfpId, vendorId).run()
      }

    } else if (emailCategory === 'questions') {
      // ── Q&A Closed Check — reject questions if Q&A stage is over ──────────
      const qaClosedStages = ['submissions_closed', 'evaluation', 'awarded']
      if (qaClosedStages.includes(rfp.stage)) {
        // Send auto-rejection email back to sender
        const resendKey = (c.env as any).RESEND_API_KEY || ''
        if (resendKey && fromAddress && fromAddress.includes('@')) {
          const rfpTitle = rfp?.title || 'CPC RFP'
          const rfpRef   = rfp?.ref_number || ''
          const rejectionBody = `Dear ${vendorDisplayName},

Thank you for your enquiry regarding the following procurement:

RFP Title:        ${rfpTitle}
Reference Number: ${rfpRef}

We regret to inform you that the Q&A period for this Request for Proposal has now closed. The Crown Prince's Court (CPC) is no longer able to accept or process clarification questions for this tender.

All vendors have been provided with a consolidated Q&A response document containing answers to all submitted questions. If you have not received this document, please contact procurement@cpc-rfp.website referencing the RFP above.

Proposal submissions continue to be accepted until the stated deadline. Please refer to your original invitation letter for submission instructions and the deadline date.

We appreciate your interest in participating in this procurement and look forward to receiving your proposal.

Best regards,
Procurement & Contracting Department
Crown Prince's Court, Abu Dhabi
procurement@cpc-rfp.website`

          try {
            await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                from: 'CPC Procurement <procurement@cpc-rfp.website>',
                to: [fromAddress],
                subject: `RE: ${subject || 'Q&A Query'} — Q&A Period Closed`,
                text: rejectionBody,
              }),
            })
          } catch(_) {}
        }

        // Log the rejection
        await db.prepare(`
          INSERT INTO email_log (rfp_id, vendor_id, recipient, from_email, subject, body, email_type, status, created_at)
          VALUES (?,?,?,?,?,?,'qa_rejection','sent',datetime('now'))
        `).bind(rfpId, vendorId, fromAddress, 'procurement@cpc-rfp.website',
          `RE: ${subject} — Q&A Period Closed`,
          `Auto-reply sent: Q&A closed for RFP ${rfp?.ref_number}. Question from ${vendorDisplayName} rejected.`).run()

        return c.json({ ok: true, emailCategory: 'questions_rejected', note: 'Q&A is closed — auto-rejection sent to sender' })
      }

      // Q&A is open — Parse questions from email body
      const bodyQuestions = parseQuestionsFromBody(bodyText)

      // Fetch Q&A spreadsheet attachment if present
      let excelQuestions: string[] = []
      try {
        const attachListRes = await fetch(`https://api.resend.com/emails/receiving/${emailId}/attachments`, {
          headers: { 'Authorization': `Bearer ${apiKey}` }
        })
        if (attachListRes.ok) {
          const attachList = await attachListRes.json() as any
          const allAttachData: any[] = attachList.data || []
          const attachData = allAttachData.find((a: any) => a.id === spreadsheetAttachment?.id) || allAttachData[0]
          if (attachData?.download_url) {
            const fileRes = await fetch(attachData.download_url)
            if (fileRes.ok) {
              const fileBuffer = await fileRes.arrayBuffer()
              const filename: string = spreadsheetAttachment?.filename || ''
              if (filename.match(/\.xlsx$/i) || spreadsheetAttachment?.content_type?.includes('spreadsheet')) {
                excelQuestions = await parseXlsxBuffer(fileBuffer)
              } else {
                const text = new TextDecoder('utf-8').decode(fileBuffer)
                excelQuestions = parseCsvQuestions(text)
              }
            }
          }
        }
      } catch(_) {}

      const allQuestions = [...new Set([...excelQuestions, ...bodyQuestions])]
      for (const question of allQuestions) {
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

      if (vendorId) {
        await db.prepare(`
          INSERT INTO rfp_vendors (rfp_id, vendor_id, shortlisted, questions_responded)
          VALUES (?,?,1,1)
          ON CONFLICT(rfp_id, vendor_id) DO UPDATE SET questions_responded=1
        `).bind(rfpId, vendorId).run()
      }

    } else if (emailCategory === 'proposal') {
      // ── Store attachments in R2 + create proposal entity ────────
      // No text extraction, no AI evaluation.
      const bucket: R2Bucket | undefined = (c.env as any).PROPOSALS_BUCKET
      const safeVendorName = (vendorDisplayName || 'vendor').replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,40)

      let pdfR2Key = ''
      let pdfFilename = ''
      const allProposalAttachments: Array<{
        r2_key: string
        filename: string
        size_bytes: number
        content_type: string
        label: string
      }> = []

      try {
        const attachListRes = await fetch(`https://api.resend.com/emails/receiving/${emailId}/attachments`, {
          headers: { 'Authorization': `Bearer ${apiKey}` }
        })
        if (attachListRes.ok) {
          const attachList = await attachListRes.json() as any
          const allAttachData: any[] = attachList.data || []

          const docAttachments = allAttachData.filter((a: any) =>
            a.filename?.match(/\.(pdf|doc|docx)$/i) ||
            a.content_type?.includes('pdf') ||
            a.content_type?.includes('word') ||
            a.content_type?.includes('msword') ||
            a.content_type?.includes('officedocument')
          )
          const attachsToProcess = docAttachments.length > 0 ? docAttachments : allAttachData.slice(0, 5)

          for (let attachIdx = 0; attachIdx < attachsToProcess.length; attachIdx++) {
            const attachData = attachsToProcess[attachIdx]
            const fn = attachData.filename || `document_${attachIdx + 1}.pdf`
            const ct = attachData.content_type || 'application/pdf'
            const label = detectAttachmentLabel(fn)
            const ts = Date.now() + attachIdx
            const r2Key = `proposals/${rfpId}/${vendorId}_${safeVendorName}_${ts}_${attachIdx}.pdf`

            if (!attachData?.download_url) {
              allProposalAttachments.push({ r2_key: '', filename: fn, size_bytes: 0, content_type: ct, label })
              continue
            }

            try {
              const controller = new AbortController()
              const timeoutId = setTimeout(() => controller.abort(), 25000)
              const fileRes = await fetch(attachData.download_url, { signal: controller.signal })
              clearTimeout(timeoutId)

              if (!fileRes.ok) {
                allProposalAttachments.push({ r2_key: '', filename: fn, size_bytes: 0, content_type: ct, label })
                continue
              }

              let storedR2Key = ''
              if (bucket && fileRes.body) {
                // Stream directly to R2 — no buffering, works for any file size
                try {
                  await bucket.put(r2Key, fileRes.body, {
                    httpMetadata: { contentType: ct },
                    customMetadata: { rfpId: String(rfpId), vendorId: String(vendorId), filename: fn, label },
                  })
                  storedR2Key = r2Key
                  console.log(`[webhook] Attachment ${attachIdx} (${label}) stored in R2: ${r2Key}`)
                } catch(r2Err: any) {
                  console.error(`[webhook] R2 put failed for ${fn}: ${r2Err?.message}`)
                }
              }

              const getSize = parseInt(fileRes.headers.get('Content-Length') || '0', 10)
              allProposalAttachments.push({ r2_key: storedR2Key, filename: fn, size_bytes: getSize, content_type: ct, label })

              if (attachIdx === 0 || (label === 'technical' && !pdfR2Key)) {
                pdfR2Key = storedR2Key
                pdfFilename = fn
              }
            } catch(downloadErr: any) {
              console.error(`[webhook] Attachment ${attachIdx} download error: ${downloadErr?.message}`)
              allProposalAttachments.push({ r2_key: '', filename: fn, size_bytes: 0, content_type: ct, label })
            }
          }
        }
      } catch(_e) {}

      // Fallback: if no download URL at all, record filename from metadata
      if (allProposalAttachments.length === 0 && attachments.length > 0) {
        const first = pdfAttachment || attachments[0]
        pdfFilename = first?.filename || ''
        if (pdfFilename) {
          allProposalAttachments.push({ r2_key: '', filename: pdfFilename, size_bytes: 0, content_type: first?.content_type || 'application/pdf', label: detectAttachmentLabel(pdfFilename) })
        }
      } else if (!pdfFilename && attachments.length > 0) {
        pdfFilename = (pdfAttachment || attachments[0])?.filename || ''
      }

      const pdfUrl = pdfR2Key ? `r2://${pdfR2Key}` : null
      const proposalAttachmentsJson = allProposalAttachments.length > 0 ? JSON.stringify(allProposalAttachments) : null

      const existing = await db.prepare('SELECT id FROM proposals WHERE vendor_id=? AND rfp_id=?').bind(vendorId, rfpId).first<any>()

      if (existing) {
        await db.prepare(`
          UPDATE proposals SET
            pdf_attachment_url=?, pdf_filename=?, proposal_attachments=?,
            status='submitted', is_real_submission=?
          WHERE id=?
        `).bind(pdfUrl, pdfFilename || null, proposalAttachmentsJson, vendorRow?.contact_email?.includes('andersenlab.com') ? 1 : 0, existing.id).run()
      } else {
        await db.prepare(`
          INSERT INTO proposals (
            rfp_id, vendor_id, status, is_real_submission,
            pdf_attachment_url, pdf_filename, proposal_attachments, created_at
          )
          VALUES (?,?,'submitted',?,?,?,?,datetime('now'))
        `).bind(
          rfpId, vendorId,
          vendorRow?.contact_email?.includes('andersenlab.com') ? 1 : 0,
          pdfUrl, pdfFilename || null, proposalAttachmentsJson
        ).run()
      }

      if (vendorId) {
        await db.prepare(`
          INSERT INTO rfp_vendors (rfp_id, vendor_id, shortlisted, status)
          VALUES (?,?,1,'active')
          ON CONFLICT(rfp_id, vendor_id) DO UPDATE SET shortlisted=1
        `).bind(rfpId, vendorId).run()
      }

      console.log(`[webhook] Proposal from ${vendorDisplayName} stored — ${allProposalAttachments.length} attachment(s)`)

      // Note: Do NOT auto-advance stage — award is manual via Award button only
    }

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

    // Block replies after RFP is awarded
    if (rfp?.stage === 'awarded') {
      return c.json({ ok: false, error: 'Cannot send email — this RFP has been awarded and is now closed. No further correspondence is permitted.' }, 403)
    }

    const rfpVendorRow = await c.env.DB.prepare(
      `SELECT status FROM rfp_vendors WHERE rfp_id=? AND vendor_id=?`
    ).bind(rfpId, vendorId).first<any>()
    if (rfpVendorRow?.status === 'declined') {
      return c.json({ ok: false, error: `Cannot send email — ${vendor.name} has declined participation in this RFP.` }, 403)
    }

    const replySubject = subject || `RE: Invitation to Tender – ${rfp?.title || 'CPC RFP'} (Ref: ${rfp?.ref_number || ''})`
    const participantCode = buildParticipantCode(rfpId, vendorId)
    const replyFooter = `\n\n──────────────────────────────────────────────\nPARTICIPANT REFERENCE: ${participantCode}\nPlease include this reference code in ALL correspondence regarding this RFP.\n──────────────────────────────────────────────`
    const fullBody = (text || '') + replyFooter

    const result = await sendRealEmail(vendor.contact_email, replySubject, fullBody, rfp, c.env)

    await c.env.DB.prepare(`
      INSERT INTO email_log (rfp_id, vendor_id, recipient, subject, body, email_type, status, created_at)
      VALUES (?,?,?,?,?,'reply',?,datetime('now'))
    `).bind(rfpId, vendorId, vendor.contact_email, replySubject, fullBody, result.ok ? 'sent' : 'simulated').run()

    return c.json({ ok: result.ok, error: result.error })
  } catch(e: any) {
    return c.json({ ok: false, error: e.message }, 500)
  }
})

apiRouter.post('/rfps/:id/emails/reprocess-questions', async (c) => {
  const rfpId = c.req.param('id')
  // Just return ok — no-op for now
  return c.json({ ok: true, processed: 0 })
})

apiRouter.get('/inbound-status', async (c) => {
  return c.json({ ok: true, mode: 'webhook', endpoint: '/api/webhook/inbound-email' })
})

// ============================================================
// DEBUG
// ============================================================
apiRouter.post('/debug/clear-simulated-invitations', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({})) as any
    const rfpId = body.rfp_id
    if (rfpId) {
      await c.env.DB.prepare(`DELETE FROM email_log WHERE rfp_id=? AND email_type='invitation' AND status='simulated'`).bind(rfpId).run()
    } else {
      await c.env.DB.prepare(`DELETE FROM email_log WHERE email_type='invitation' AND status='simulated'`).run()
    }
    return c.json({ ok: true })
  } catch(e: any) {
    return c.json({ ok: false, error: e.message }, 500)
  }
})

apiRouter.get('/debug/email-log', async (c) => {
  const { results } = await c.env.DB.prepare(`SELECT * FROM email_log ORDER BY id DESC LIMIT 50`).all()
  return c.json(results)
})

// ============================================================
// PROPOSALS
// ============================================================
apiRouter.get('/rfps/:id/proposals', async (c) => {
  const rfpId = c.req.param('id')
  const { results } = await c.env.DB.prepare(`
    SELECT p.*,
      v.name as vendor_name, v.contact_email, v.erp_experience,
      v.certifications, v.specializations, v.size
    FROM proposals p
    LEFT JOIN vendors v ON p.vendor_id = v.id
    WHERE p.rfp_id=?
    ORDER BY p.id DESC
  `).bind(rfpId).all()
  return c.json(results)
})

// GET /proposals/pdf/:key — download a PDF from R2 by key
apiRouter.get('/proposals/pdf/:key{.+}', async (c) => {
  const key = c.req.param('key')
  const bucket: R2Bucket | undefined = (c.env as any).PROPOSALS_BUCKET
  if (!bucket) return c.json({ error: 'Storage not configured' }, 500)

  const obj = await bucket.get(key)
  if (!obj) return c.json({ error: 'File not found' }, 404)

  const headers = new Headers()
  headers.set('Content-Type', obj.httpMetadata?.contentType || 'application/pdf')
  headers.set('Content-Disposition', `inline; filename="${key.split('/').pop()}"`)
  headers.set('Cache-Control', 'private, max-age=3600')

  return new Response(obj.body, { headers })
})

// PUT /rfps/:rfpId/proposals/:proposalId/upload-pdf — manual PDF upload
apiRouter.put('/rfps/:rfpId/proposals/:proposalId/upload-pdf', async (c) => {
  const rfpId = c.req.param('rfpId')
  const proposalId = c.req.param('proposalId')

  try {
    const formData = await c.req.formData()
    const file = formData.get('file') as File | null
    if (!file) return c.json({ error: 'No file uploaded' }, 400)

    const bucket: R2Bucket | undefined = (c.env as any).PROPOSALS_BUCKET
    if (!bucket) return c.json({ error: 'R2 storage not configured' }, 500)

    const bytes = new Uint8Array(await file.arrayBuffer())
    const r2Key = `proposals/${rfpId}/manual_upload_${proposalId}_${Date.now()}.pdf`

    await bucket.put(r2Key, bytes, {
      httpMetadata: { contentType: file.type || 'application/pdf' },
      customMetadata: { rfpId, proposalId, filename: file.name, uploadedManually: '1' },
    })

    const pdfUrl = `r2://${r2Key}`
    await c.env.DB.prepare(`
      UPDATE proposals SET pdf_attachment_url=?, pdf_filename=? WHERE id=?
    `).bind(pdfUrl, file.name, proposalId).run()

    return c.json({ ok: true, r2Key, filename: file.name, size: bytes.length })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// POST /rfps/:id/proposals/sample — generate sample proposals for testing
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
// AWARD PROPOSAL
// POST /rfps/:rfpId/proposals/:proposalId/award
// ============================================================
apiRouter.post('/rfps/:rfpId/proposals/:proposalId/award', async (c) => {
  const rfpId = c.req.param('rfpId')
  const proposalId = c.req.param('proposalId')
  const db = c.env.DB
  try {
    // Check proposal exists
    const proposal = await db.prepare('SELECT * FROM proposals WHERE id=? AND rfp_id=?').bind(proposalId, rfpId).first<any>()
    if (!proposal) return c.json({ error: 'Proposal not found' }, 404)

    // Mark this proposal as awarded, all others as not_awarded
    await db.prepare(`UPDATE proposals SET status='awarded' WHERE id=?`).bind(proposalId).run()
    await db.prepare(`UPDATE proposals SET status='not_awarded' WHERE rfp_id=? AND id!=?`).bind(rfpId, proposalId).run()

    // Advance RFP stage to awarded (disables submissions & email replies)
    await db.prepare(`UPDATE rfps SET stage='awarded', updated_at=datetime('now') WHERE id=?`).bind(rfpId).run()

    // Log award in email_log for audit trail
    const vendor = await db.prepare('SELECT name, contact_email FROM vendors WHERE id=?').bind(proposal.vendor_id).first<any>()
    const rfp = await db.prepare('SELECT ref_number, title FROM rfps WHERE id=?').bind(rfpId).first<any>()
    await db.prepare(`
      INSERT INTO email_log (rfp_id, vendor_id, recipient, subject, body, email_type, status, created_at)
      VALUES (?,?,?,?,?,'award','simulated',datetime('now'))
    `).bind(
      rfpId, proposal.vendor_id,
      vendor?.contact_email || '',
      `Contract Award Notification – ${rfp?.title || 'CPC RFP'} (Ref: ${rfp?.ref_number || ''})`,
      `Contract has been awarded to ${vendor?.name || 'vendor'} (Proposal ID: ${proposalId}). RFP stage set to Awarded.`
    ).run()

    return c.json({ ok: true, proposalId, rfpId, stage: 'awarded', vendorName: vendor?.name })
  } catch (e: any) {
    return c.json({ ok: false, error: e.message }, 500)
  }
})

// ============================================================
// PUBLIC VENDOR SUBMISSION PORTAL
// ============================================================

// GET /submit/:rfpId — public RFP summary for the submission page
apiRouter.get('/submit/:rfpId', async (c) => {
  const rfpId = c.req.param('rfpId')
  const rfp = await c.env.DB.prepare(
    `SELECT id, ref_number, title, category, deadline, scope, objectives, tech_requirements, background, stage FROM rfps WHERE id=?`
  ).bind(rfpId).first<any>()
  if (!rfp) return c.json({ error: 'RFP not found' }, 404)
  const closedStages = ['awarded', 'archived']
  if (closedStages.includes(rfp.stage)) return c.json({ error: 'This RFP is no longer accepting submissions.' }, 403)
  return c.json(rfp)
})

// POST /submit/:rfpId — submit a full vendor proposal (multipart form)
// Fields: vendor_code (participant ref), cover_letter, files[] (PDFs)
// Simplified: stores files in R2, creates proposal entity. No AI processing.
apiRouter.post('/submit/:rfpId', async (c) => {
  const rfpId = c.req.param('rfpId')
  const rfp = await c.env.DB.prepare('SELECT * FROM rfps WHERE id=?').bind(rfpId).first<any>()
  if (!rfp) return c.json({ error: 'RFP not found' }, 404)
  const closedStages = ['awarded', 'archived']
  if (closedStages.includes(rfp.stage)) return c.json({ error: 'This RFP is no longer accepting submissions.' }, 403)

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
    const genericFiles = formData.getAll('files') as File[]
    for (const gf of genericFiles) {
      if (gf instanceof File) files.push(gf)
    }

    if (files.length === 0) return c.json({ error: 'Please attach at least one proposal document.' }, 400)

    const bucket: R2Bucket | undefined = (c.env as any).PROPOSALS_BUCKET
    const storedAttachments: any[] = []

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
      let storedR2Key = ''
      if (bucket) {
        await bucket.put(r2Key, bytes, {
          httpMetadata: { contentType: ct },
          customMetadata: { rfpId: String(rfpId), vendorId: String(vendorId), filename: fn },
        })
        storedR2Key = r2Key
      }

      storedAttachments.push({
        r2_key: storedR2Key || null,
        filename: fn,
        content_type: ct,
        label,
        size_bytes: bytes.length,
      })
    }

    const pdfUrl = storedAttachments[0]?.r2_key ? `r2://${storedAttachments[0].r2_key}` : null
    const pdfFilename = storedAttachments[0]?.filename || null
    const proposalAttachmentsJson = JSON.stringify(storedAttachments)

    // Cover letter stored as technical_proposal for reference
    const technicalProposalText = coverLetter || null

    const existing = await c.env.DB.prepare(
      `SELECT id FROM proposals WHERE rfp_id=? AND vendor_id=? ORDER BY id DESC LIMIT 1`
    ).bind(rfpId, vendorId).first<any>()

    let proposalId: number
    if (existing) {
      await c.env.DB.prepare(`
        UPDATE proposals SET
          technical_proposal=?,
          proposal_attachments=?,
          pdf_attachment_url=?, pdf_filename=?,
          status='submitted', is_real_submission=1,
          updated_at=datetime('now')
        WHERE id=?
      `).bind(technicalProposalText, proposalAttachmentsJson, pdfUrl, pdfFilename, existing.id).run()
      proposalId = existing.id
    } else {
      const ins = await c.env.DB.prepare(`
        INSERT INTO proposals
          (rfp_id, vendor_id, technical_proposal,
           proposal_attachments, pdf_attachment_url, pdf_filename,
           status, is_real_submission, created_at, updated_at)
        VALUES (?,?,?,?,?,?,'submitted',1,datetime('now'),datetime('now'))
      `).bind(rfpId, vendorId, technicalProposalText, proposalAttachmentsJson, pdfUrl, pdfFilename).run()
      proposalId = ins.meta.last_row_id as number
    }

    console.log(`[submit] Proposal from ${vendorName} stored — ${storedAttachments.length} file(s)`)

    return c.json({
      ok: true,
      proposal_id: proposalId,
      vendor_name: vendorName,
      files_stored: storedAttachments.length,
      message: 'Proposal submitted successfully.',
    })
  } catch(err: any) {
    console.error('[submit]', err)
    return c.json({ error: err.message || 'Submission failed' }, 500)
  }
})

// ============================================================
// LLM INTEGRATION — used for RFP generation and Q&A drafting
// ============================================================

async function callLLM(systemPrompt: string, userPrompt: string, env: any, model = 'gpt-5-mini', maxTokens = 2000): Promise<string> {
  const apiKey = env?.OPENAI_API_KEY || (globalThis as any).OPENAI_API_KEY || ''
  const baseUrl = env?.OPENAI_BASE_URL || 'https://www.genspark.ai/api/llm_proxy/v1'
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured')

  // Use streaming to prevent Cloudflare Worker 30s subrequest timeout.
  // With stream:true the LLM sends SSE chunks every few seconds, keeping the
  // connection alive. We collect all chunks and return the assembled text.
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
      stream: true,
    }),
  })
  if (!res.ok) {
    const errText = await res.text().catch(() => 'unknown error')
    throw new Error(`LLM API error ${res.status}: ${errText}`)
  }
  if (!res.body) throw new Error('LLM returned no response body')

  // Read SSE stream and collect delta content chunks
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let fullContent = ''
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    // Process complete SSE lines
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? '' // keep incomplete last line in buffer
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed === 'data: [DONE]') continue
      if (!trimmed.startsWith('data: ')) continue
      try {
        const json = JSON.parse(trimmed.slice(6))
        const delta = json.choices?.[0]?.delta?.content
        if (delta) fullContent += delta
      } catch {
        // skip malformed SSE lines
      }
    }
  }
  // Flush any remaining buffer
  if (buffer.trim().startsWith('data: ') && buffer.trim() !== 'data: [DONE]') {
    try {
      const json = JSON.parse(buffer.trim().slice(6))
      const delta = json.choices?.[0]?.delta?.content
      if (delta) fullContent += delta
    } catch { /* ignore */ }
  }

  return fullContent
}

async function generateRFPWithLLM(data: any, archDocText: string, brdDocText: string, env: any): Promise<string> {
  // Letterhead image is stored permanently in R2 and served through the worker.
  // This URL is injected into the prompt so the LLM can reference it in the generated HTML.
  const LETTERHEAD_BG_URL = 'https://a7b32759-e743-4139-9bb0-4bae44886667.vip.gensparksite.com/api/proposals/pdf/letterhead/bg_a4.png'

  const systemPrompt = `You are a senior government procurement specialist at the Crown Prince's Court (CPC) of Abu Dhabi, UAE. You are producing a formal, comprehensive, publication-ready Request for Proposal (RFP) document issued to external vendors on official CPC letterhead.

IDENTITY AND TONE
- You write on behalf of the Crown Prince's Court (Diwan Wali Al Ahd), Abu Dhabi, a sovereign UAE government institution.
- Language must be authoritative, precise, and formal, as if it will be signed and stamped by a Director-General.
- No filler sentences, no vague boilerplate. Every paragraph must contain actionable, verifiable requirements.
- Write in formal English throughout. No abbreviations unless industry-standard.
- This RFP must be as detailed and comprehensive as a real government procurement document. Vendors must be able to fully scope and price the work from this document alone.

CRITICAL: HOW TO USE SUPPORTING DOCUMENTS
You will receive SUPPORTING DOCUMENTS (Business Requirements Document, Architecture Document) as plain extracted text.
- READ and fully ABSORB the content of these documents into the RFP body sections.
- The RFP must stand completely alone. A vendor reading only this RFP must understand the full scope, requirements, and context without access to any other file.
- DO NOT reference document filenames or use phrases like "as per the BRD", "refer to the Architecture Document", "as specified in [filename]", "as defined in the attached document", "refer to [document name].pdf", or any similar external reference.
- DO NOT write sentences like "acceptance criteria defined in the Business Requirements Document" -- instead, state the actual acceptance criteria inline within the RFP.
- Extract specific data from the supporting documents: actual field names, table names, KPIs, module names, exact counts, business rules, data flows, user roles, access control requirements, report titles -- and embed them directly in the RFP text.
- If a supporting document provides a list of reports, dashboards, data entities, or user roles, enumerate them explicitly in the relevant RFP section.
- Supporting documents are internal working materials. The RFP is the external public procurement instrument. ALL information must live in the RFP body.

DEPTH AND LENGTH REQUIREMENT
- This RFP must be comprehensive. Each section must contain full substantive content, not bullet summaries.
- Section 3 (Scope of Work) must be the longest section. Elaborate each workstream or phase with specific activities, inputs, outputs, and acceptance criteria stated inline.
- Section 4 (Technical Requirements) must list each requirement as a specific, testable, measurable statement, structured as a table.
- Target a minimum of 6,000 to 8,000 words of actual textual content spread across all 8 sections.
- Do not truncate or summarize. Write every requirement in full.

PAGE AND LETTERHEAD LAYOUT (MANDATORY)
The document is rendered on official CPC A4 letterhead. The letterhead image is the page background.

PAGING: Output multiple A4 pages as separate page divs.
Each page div uses exactly this inline style:
style="position:relative; width:210mm; min-height:297mm; max-width:210mm; margin:0 auto 8mm auto; background-image:url('${LETTERHEAD_BG_URL}'); background-size:210mm 297mm; background-repeat:no-repeat; background-position:top left; font-family:Arial,Calibri,'Segoe UI',sans-serif; color:#1A1A1A; box-sizing:border-box; overflow:hidden; page-break-after:always;"

Content inner wrapper inside each page div:
style="padding-top:72mm; padding-bottom:28mm; padding-left:25mm; padding-right:25mm; box-sizing:border-box;"

Page footer (position absolute, bottom of each page div):
<div style="position:absolute; bottom:10mm; left:0; right:0; text-align:center; font-family:Arial,Calibri,'Segoe UI',sans-serif; font-size:9pt; color:#888888;">Crown Prince's Court &mdash; Confidential &nbsp;|&nbsp; Page N</div>

PAGING GUIDE:
- Page 1: Cover page only -- title, subtitle, RFP metadata table, Table of Contents
- Page 2: Sections 1 and 2 (Background and Objectives)
- Page 3 onward: Scope of Work sections (3.1, 3.2 ...) -- use as many pages as needed
- Continue: Technical Requirements, Evaluation Criteria, Vendor Qualifications, Submission Timeline, Terms and Conditions
- Each major section starts at or near the top of a new page

WHAT THE BACKGROUND IMAGE ALREADY CONTAINS (do NOT recreate any of these in HTML):
- Top strip approximately 20mm: geometric Arabic ornamental pattern, warm khaki
- Chain border full width below ornament
- Logo block below chain: Arabic calligraphy plus CROWN PRINCE COURT text plus heraldic eagle emblem
- Below logo: clean white content field

COVER PAGE METADATA TABLE (place on page 1 after title and subtitle):
<table style="width:80%; margin:16pt auto; border-collapse:collapse; font-family:Arial,Calibri,'Segoe UI',sans-serif; font-size:10.5pt; color:#1A1A1A;">
  <tr><td style="padding:5pt 10pt; border:1px solid #CCCCCC; font-weight:700; width:38%;">RFP Reference Number</td><td style="padding:5pt 10pt; border:1px solid #CCCCCC;">[insert ref_number]</td></tr>
  <tr><td style="padding:5pt 10pt; border:1px solid #CCCCCC; font-weight:700;">Issue Date</td><td style="padding:5pt 10pt; border:1px solid #CCCCCC;">[insert today date]</td></tr>
  <tr><td style="padding:5pt 10pt; border:1px solid #CCCCCC; font-weight:700;">Proposal Submission Deadline</td><td style="padding:5pt 10pt; border:1px solid #CCCCCC;">[insert deadline]</td></tr>
  <tr><td style="padding:5pt 10pt; border:1px solid #CCCCCC; font-weight:700;">Category</td><td style="padding:5pt 10pt; border:1px solid #CCCCCC;">[insert category]</td></tr>
  <tr><td style="padding:5pt 10pt; border:1px solid #CCCCCC; font-weight:700;">Issuing Authority</td><td style="padding:5pt 10pt; border:1px solid #CCCCCC;">Crown Prince's Court, Abu Dhabi, UAE</td></tr>
  <tr><td style="padding:5pt 10pt; border:1px solid #CCCCCC; font-weight:700;">Submission Email</td><td style="padding:5pt 10pt; border:1px solid #CCCCCC;">procurement@cpc-rfp.website</td></tr>
</table>

COLOR PALETTE -- STRICTLY ENFORCED
- All body text: #1A1A1A (near-black)
- Section heading underline accent: #A79C7F (warm khaki)
- Table and rule borders: #CCCCCC (light grey)
- Footer text: #888888 (grey, page footer only)
- PROHIBITED everywhere in body content and tables: blues, greens, teals, oranges, gradients, any other accent

TYPOGRAPHY -- ALL STYLES MUST BE INLINE (required for self-contained HTML and PDF export)
Apply every style as an inline style= attribute. No style blocks. No CSS classes.

TITLE: style="font-family:Arial,Calibri,'Segoe UI',sans-serif; font-size:20pt; font-weight:700; text-align:center; color:#1A1A1A; margin:0 0 10pt 0; line-height:1.2;"
SUBTITLE REQUEST FOR PROPOSAL: style="font-family:Arial,Calibri,'Segoe UI',sans-serif; font-size:13.5pt; font-weight:400; text-align:center; letter-spacing:2.5px; color:#1A1A1A; margin:16pt 0 16pt 0;"
SECTION HEADING: style="font-family:Arial,Calibri,'Segoe UI',sans-serif; font-size:13pt; font-weight:700; color:#1A1A1A; margin-top:14pt; margin-bottom:7pt; padding-bottom:3pt; border-bottom:1.5px solid #A79C7F;"
SUBHEADING: style="font-family:Arial,Calibri,'Segoe UI',sans-serif; font-size:11pt; font-weight:700; color:#1A1A1A; margin-top:10pt; margin-bottom:4pt;"
BODY PARAGRAPH p: style="font-family:Arial,Calibri,'Segoe UI',sans-serif; font-size:10.5pt; line-height:1.35; color:#1A1A1A; margin:0 0 5pt 0; text-align:justify;"
BULLET LIST ul: style="font-family:Arial,Calibri,'Segoe UI',sans-serif; font-size:10.5pt; line-height:1.35; color:#1A1A1A; list-style-type:disc; padding-left:18pt; margin:3pt 0 6pt 0;"
LIST ITEM li: style="margin-bottom:3pt; color:#1A1A1A;"
NUMBERED LIST ol: style="font-family:Arial,Calibri,'Segoe UI',sans-serif; font-size:10.5pt; line-height:1.35; color:#1A1A1A; padding-left:18pt; margin:3pt 0 6pt 0;"

TABLE OF CONTENTS ROWS:
Top-level: <div style="display:flex; justify-content:space-between; border-bottom:1px dotted #CCCCCC; padding:4pt 0; font-family:Arial,Calibri,'Segoe UI',sans-serif; font-size:10.5pt; color:#1A1A1A;"><span style="font-weight:700;">N. Section Title</span><span style="white-space:nowrap;">N</span></div>
Sub-item: <div style="display:flex; justify-content:space-between; border-bottom:1px dotted #CCCCCC; padding:3pt 0 3pt 16pt; font-family:Arial,Calibri,'Segoe UI',sans-serif; font-size:10.5pt; color:#1A1A1A;"><span>N.M Sub-section Title</span><span style="white-space:nowrap;">N</span></div>

TABLES (use for technical requirements, evaluation criteria, qualification requirements, timeline):
Outer: <table style="width:100%; border-collapse:collapse; font-family:Arial,Calibri,'Segoe UI',sans-serif; font-size:10.5pt; color:#1A1A1A; margin:6pt 0 10pt 0;">
Header th: style="font-weight:700; color:#1A1A1A; background:#F5F5F5; padding:5pt 7pt; border:1px solid #CCCCCC; text-align:left;"
Data td: style="color:#1A1A1A; background:#FFFFFF; padding:5pt 7pt; border:1px solid #CCCCCC; vertical-align:top;"
Rules: No colored cell fills. No merged cells. Alternate rows may use #FAFAFA background for readability if needed.

CONTENT RULES -- STRICTLY ENFORCED
1. ALL content must be derived exclusively from the PROVIDED PROJECT DETAILS and SUPPORTING DOCUMENTS. Do not invent, add, or extrapolate anything.
2. Scope of Work sub-sections must cover every workstream, phase, and deliverable mentioned. Do not omit or condense.
3. Section 4 (Technical Requirements) must be a STRUCTURED TABLE with columns: Requirement Area | Specific Requirement | Classification (Mandatory or Preferred). Minimum 15 rows. One requirement per row.
4. Evaluation Criteria weights must sum to exactly 100 percent.
5. Section 7 (Submission Requirements and Timeline) must include a FULL procurement milestone table: RFP Issue Date, Clarification Request Deadline, CPC Responses to Clarifications, Proposal Submission Deadline, Evaluation Period, Award Notification, Contract Signature, Project Kick-off. Derive all dates relative to the Proposal Deadline provided.
6. NEVER reference filenames, document names, or external documents anywhere in the RFP body. All information must be stated inline.
7. Vendor Qualification Requirements must be specific to this project domain.
8. Where the supporting documents mention specific system names, module names, report names, KPI names, user roles, or data entities -- include them explicitly by name in the RFP.

HTML OUTPUT RULES
- Return ONLY the inner HTML -- no DOCTYPE, no html tag, no body tag, no head tag, no style blocks.
- The outermost element is a plain wrapper div with no styling.
- Inside it, each A4 page is a separate div with the page wrapper inline style shown above.
- Inside each page div, place the content inner wrapper div with the padding style shown above.
- ALL styling via inline style= attributes ONLY. No classes. No style blocks. No external stylesheets.
- Use proper HTML: p, ul, ol, li, table, thead, tbody, tr, th, td, strong, em, div.
- Do NOT use markdown, code fences, or non-HTML syntax.
- Do NOT embed base64 images or data URIs.`

  // Helper: check if a doc text field is a real extracted text or just a placeholder note
  const isRealDocText = (t: string) => t && t.length > 500 && !t.startsWith('[Document uploaded:') && !t.startsWith('[PDF:')

  const docSections: string[] = []
  if (archDocText && isRealDocText(archDocText)) {
    docSections.push(
      `${'='.repeat(60)}\nSOLUTION ARCHITECTURE DOCUMENT (extracted text — read in full and incorporate all technical detail into the RFP)\n${'='.repeat(60)}\n${archDocText.slice(0, 15000)}\n${'='.repeat(60)}`
    )
  }
  if (brdDocText && isRealDocText(brdDocText)) {
    docSections.push(
      `${'='.repeat(60)}\nBUSINESS REQUIREMENTS DOCUMENT (extracted text — read in full and incorporate all functional requirements, report names, KPIs, user roles, acceptance criteria, and data entities into the RFP body — do NOT reference this document by name in the output)\n${'='.repeat(60)}\n${brdDocText.slice(0, 15000)}\n${'='.repeat(60)}`
    )
  }
  const archSection = docSections.length
    ? `\n${'='.repeat(60)}\nSUPPORTING DOCUMENTS (fully absorb into the RFP — do not reference these by name in the output):\n${'='.repeat(60)}\n${docSections.join('\n\n')}\n`
    : ''

  // Build deadline-relative milestone dates
  const deadlineDate = data.deadline ? new Date(data.deadline) : new Date(Date.now() + 30*24*60*60*1000)
  const fmtDate = (d: Date) => d.toISOString().split('T')[0]
  const rfpIssueDate = fmtDate(new Date())
  const clarDeadline = fmtDate(new Date(deadlineDate.getTime() - 21*24*60*60*1000))
  const qaPublished   = fmtDate(new Date(deadlineDate.getTime() - 14*24*60*60*1000))
  const evalEnd       = fmtDate(new Date(deadlineDate.getTime() + 21*24*60*60*1000))
  const awardNotif    = fmtDate(new Date(deadlineDate.getTime() + 28*24*60*60*1000))
  const contractSign  = fmtDate(new Date(deadlineDate.getTime() + 42*24*60*60*1000))
  const kickoff       = fmtDate(new Date(deadlineDate.getTime() + 56*24*60*60*1000))

  const userPrompt = `Generate a COMPLETE, COMPREHENSIVE, multi-page RFP HTML document for the Crown Prince's Court (CPC), Abu Dhabi.
This must be a detailed government procurement document — every section must be fully written, not summarized.
Use ONLY the information provided below. Do not add anything not stated here or in the supporting documents.

${'='.repeat(60)}
PROJECT DETAILS
${'='.repeat(60)}
RFP Reference:          ${data.ref_number || 'CPC/PROC/' + new Date().getFullYear() + '/TBD'}
Title:                  ${data.title || 'Not specified'}
Category:               ${data.category || 'IT & Digital Transformation'}
Budget Envelope:        ${data.budget ? 'AED ' + data.budget + ' (indicative ceiling)' : 'Confidential — to be disclosed to shortlisted vendors'}
RFP Issue Date:         ${rfpIssueDate}
Proposal Deadline:      ${data.deadline || fmtDate(deadlineDate)}

BACKGROUND
${data.background || '(not provided)'}

OBJECTIVES
${data.objectives || '(not provided)'}

SCOPE OF WORK
${data.scope || '(not provided)'}

TECHNICAL REQUIREMENTS AND CONSTRAINTS
${data.tech_requirements || '(not provided — derive from Scope and Supporting Documents only)'}
${archSection}
${'='.repeat(60)}
PROCUREMENT MILESTONE DATES (use these exactly in Section 7)
${'='.repeat(60)}
RFP Issue Date:                      ${rfpIssueDate}
Deadline for Clarification Requests: ${clarDeadline}
CPC Responses to Clarifications:     ${qaPublished}
Proposal Submission Deadline:        ${data.deadline || fmtDate(deadlineDate)}
Evaluation and Scoring Period Ends:  ${evalEnd}
Award Notification to Vendors:       ${awardNotif}
Contract Signature:                  ${contractSign}
Project Kick-off:                    ${kickoff}
${'='.repeat(60)}
REQUIRED DOCUMENT SECTIONS — produce all 8 in full detail
${'='.repeat(60)}

1. PROJECT BACKGROUND AND CONTEXT
   Expand into 4–6 substantial paragraphs:
   - Organisational context: what the Crown Prince's Court is, the new operating unit being established, its position within the CPC Oracle ERP environment.
   - Current-state problem: describe the fragmented data landscape in specific terms — which source systems hold which data, what the operational impact is (reporting delays, reconciliation burden, inconsistent KPIs, reliance on BI Publisher static reports).
   - Strategic mandate: why this initiative was commissioned, what governance or leadership directive drives it.
   - Why external vendor engagement is required: specific capability gap that CPC cannot address internally.
   - Closing sentence: state exactly what this RFP is soliciting.
   Write at least 400 words for this section.

2. PROJECT OBJECTIVES
   Numbered list. Each objective must be specific, measurable, and directly tied to input data.
   Do not add generic objectives not mentioned. Write at least 4 objectives with full explanatory sentences, not one-line bullets.

3. SCOPE OF WORK
   This is the longest and most detailed section. Structure as numbered sub-sections (3.1, 3.2, etc.) mirroring the workstreams from the Scope field and supporting documents.
   For EACH sub-section write:
   a) A descriptive sub-heading
   b) An introductory paragraph (2–4 sentences) explaining what this workstream covers and why it is critical
   c) A detailed bullet list of specific activities, inputs, tools, and methods — be specific about source systems, data volumes, layer names, tool names
   d) Specific acceptance criteria for this workstream (what CPC will test or verify before sign-off)
   e) A "Key Deliverables" line listing formal deliverable artifacts
   Include at minimum these sub-sections (add more if the supporting documents indicate additional scope):
   - Architecture Design and Data Platform Build
   - Data Migration from source systems
   - Business Intelligence Platform Deployment (Tableau Server on-premise)
   - Dashboard and Report Development (enumerate ALL dashboards and reports by name or category if the supporting documents list them)
   - Data Governance, Catalog and Lineage
   - Knowledge Transfer, Training and Documentation
   Write at least 1,200 words for this section.

4. TECHNICAL REQUIREMENTS AND ARCHITECTURE
   Render as a TABLE with three columns: Requirement Area | Specific Requirement | Classification (Mandatory / Preferred).
   Write at minimum 18 rows covering: Deployment Environment, Security and Access Control, Architecture Pattern, Licensing Strategy, Source System Integration, Data Volume and Performance, BI Tool, Active Directory Integration, Data Classification Compliance, Backup and Recovery, Monitoring and Alerting, Open-Source Stack Constraints, Scalability, Data Lineage, Metadata Management, High Availability, Documentation Standards, Change Management.
   Each requirement must be a specific, testable, one-sentence statement — not a category label.

5. EVALUATION CRITERIA
   Table with columns: Criterion | Weight % | Detailed Description.
   Weights must sum to exactly 100%.
   Tailor all criterion names and descriptions specifically to a data warehouse and BI analytics project.

6. VENDOR QUALIFICATION REQUIREMENTS
   Table with columns: Requirement Category | Minimum Standard | Evidence Required.
   Cover: years of experience in data warehouse delivery, on-premise Tableau deployments, Oracle EBS integrations, government or large enterprise clients in MENA, team certifications specific to this domain (Tableau, data engineering, ETL), financial standing.
   Do NOT require certifications unrelated to data, BI, or ETL.

7. SUBMISSION REQUIREMENTS AND TIMELINE
   First: a full procurement milestone TABLE using the exact dates provided above. All 8 milestones must appear.
   Then: a bulleted list of all documents required in the submission package (technical proposal, financial proposal, implementation plan, team CVs, company profile, audited financials, security compliance statement, references).
   Submission email: procurement@cpc-rfp.website

8. TERMS AND CONDITIONS
   8 to 12 bullet points covering: confidentiality obligations, intellectual property (all developed IP vests in CPC), right to reject all proposals, disqualification grounds (including cloud hosting proposals), no guarantee of award, vendor costs not reimbursable, governing law (laws of Abu Dhabi and UAE), language of contract (English and Arabic), subcontracting restrictions, conflict of interest declaration requirement.

REMINDER: Do NOT reference any document filename, BRD name, or attached file anywhere in the output. All content must be stated inline as if you wrote it yourself.`

  const llmContent = await callLLM(systemPrompt, userPrompt, env, 'gpt-5-mini', 16000)
  if (llmContent && llmContent.length > 400) {
    return `<div class="rfp-doc">${llmContent}</div>`
  }
  throw new Error(`LLM returned insufficient content (${llmContent?.length || 0} chars)`)
}

async function draftAnswerLLM(question: string, rfp: any, env: any): Promise<{ answer: string, needsManual: boolean }> {
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

2. INFORMED ANSWER (use for most questions): If not explicitly documented but you can answer it confidently as a senior CPC procurement manager familiar with UAE government projects of this type — just answer it. Do NOT signal that you are inferring or that the RFP doesn't cover it.

3. ESCALATE TO MANUAL REVIEW (last resort only — < 10% of questions): Only if the answer genuinely requires an undisclosed internal CPC decision. Respond with exactly: "NEEDS_MANUAL_REVIEW: " followed by one sentence.

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
    return { answer: 'LLM unavailable — please provide a manual answer for this question.', needsManual: true }
  }
}

// ============================================================
// HELPERS — ATTACHMENT LABEL DETECTION
// ============================================================
function detectAttachmentLabel(filename: string): 'technical' | 'commercial' | 'other' {
  const lower = filename.toLowerCase()
  if (lower.includes('commercial') || lower.includes('financial') || lower.includes('cost') || lower.includes('price') || lower.includes('fee') || lower.includes('budget')) {
    return 'commercial'
  }
  if (lower.includes('technical') || lower.includes('tech') || lower.includes('proposal') || lower.includes('approach') || lower.includes('methodology') || lower.includes('solution')) {
    return 'technical'
  }
  return 'other'
}

// ============================================================
// HELPERS — Q&A EXCEL GENERATION
// ============================================================
function generateQAExcel(questions: any[]): Uint8Array {
  // Build a minimal XLSX file with the Q&A data
  const rows: string[][] = [
    ['Ref', 'Vendor', 'Question', 'Answer', 'Status'],
    ...questions.map((q: any, i: number) => [
      String(i + 1),
      q.vendor_name || 'Unknown',
      q.question || '',
      q.answer || '',
      q.published ? 'Published' : 'Draft',
    ])
  ]

  // Minimal XML for a valid XLSX
  const sharedStrings: string[] = []
  const ssMap = new Map<string, number>()
  const getCellRef = (s: string) => {
    if (!ssMap.has(s)) { ssMap.set(s, sharedStrings.length); sharedStrings.push(s) }
    return ssMap.get(s)!
  }

  const cols = ['A','B','C','D','E']
  let sheetRows = ''
  rows.forEach((row, ri) => {
    const cells = row.map((val, ci) => {
      const ref = `${cols[ci]}${ri+1}`
      const idx = getCellRef(val)
      return `<c r="${ref}" t="s"><v>${idx}</v></c>`
    }).join('')
    sheetRows += `<row r="${ri+1}">${cells}</row>`
  })

  const ssXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${sharedStrings.length}" uniqueCount="${sharedStrings.length}">${sharedStrings.map(s => `<si><t>${escXml(s)}</t></si>`).join('')}</sst>`
  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`
  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Q&amp;A" sheetId="1" r:id="rId1"/></sheets></workbook>`
  const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>`
  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>`

  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': encodeUtf8(contentTypesXml),
    '_rels/.rels': encodeUtf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    'xl/workbook.xml': encodeUtf8(workbookXml),
    'xl/_rels/workbook.xml.rels': encodeUtf8(relsXml),
    'xl/worksheets/sheet1.xml': encodeUtf8(sheetXml),
    'xl/sharedStrings.xml': encodeUtf8(ssXml),
  }
  return buildZip(files)
}

function encodeUtf8(str: string): Uint8Array {
  return new TextEncoder().encode(str)
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = ''
  const len = bytes.byteLength
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

function generateRfpPdf(rfp: any): Uint8Array {
  // Generate a well-structured, multi-page PDF with CPC letterhead styling.
  // We use pure PDF 1.4 primitives (no external libs — Workers environment).
  const title   = rfp?.title    || 'Request for Proposal'
  const refNum  = rfp?.ref_number || ''
  const rawHtml = rfp?.content  || ''
  const deadline = rfp?.deadline || ''
  const category = rfp?.category || ''

  // ── 1. HTML → structured sections ──────────────────────────────────────────
  // Parse the HTML into a sequence of typed lines for PDF layout
  type PdfLine = { text: string; bold?: boolean; size?: number; indent?: number; spaceBefore?: number; spaceAfter?: number; divider?: boolean; centered?: boolean }

  function htmlToLines(html: string): PdfLine[] {
    const lines: PdfLine[] = []

    // Strip outer rfp-doc wrapper
    html = html.replace(/<div class="rfp-doc">/gi, '').replace(/<\/div>\s*$/i, '')

    // Split into blocks by tags — process sequentially
    const blockRe = /<(h[1-6]|p|li|div|tr|th|td|ul|ol)[^>]*>([\s\S]*?)<\/\1>/gi
    let match: RegExpExecArray | null
    const processed = new Set<string>()

    // Simple sequential tag parser
    const tagStack: string[] = []
    let i = 0
    let textBuf = ''
    const tokens: Array<{ type: 'open'|'close'|'self'|'text'; tag?: string; attrs?: string; text?: string }> = []

    // Tokenize HTML
    const htmlStr = html
    let pos = 0
    while (pos < htmlStr.length) {
      const lt = htmlStr.indexOf('<', pos)
      if (lt === -1) {
        tokens.push({ type: 'text', text: htmlStr.slice(pos) })
        break
      }
      if (lt > pos) tokens.push({ type: 'text', text: htmlStr.slice(pos, lt) })
      const gt = htmlStr.indexOf('>', lt)
      if (gt === -1) break
      const tag = htmlStr.slice(lt + 1, gt)
      if (tag.startsWith('/')) {
        tokens.push({ type: 'close', tag: tag.slice(1).split(/\s/)[0].toLowerCase() })
      } else if (tag.endsWith('/')) {
        tokens.push({ type: 'self', tag: tag.slice(0, -1).trim().split(/\s/)[0].toLowerCase() })
      } else {
        const tagName = tag.split(/\s/)[0].toLowerCase()
        tokens.push({ type: 'open', tag: tagName, attrs: tag })
      }
      pos = gt + 1
    }

    // Convert tokens to lines
    const contextStack: string[] = []
    let pendingText = ''
    let inHeader = false
    let inBold = false
    let inTh = false

    const flush = (opts: Partial<PdfLine> = {}) => {
      const t = pendingText.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim()
      if (t) lines.push({ text: t, ...opts })
      pendingText = ''
    }

    for (const tok of tokens) {
      if (tok.type === 'text') {
        pendingText += tok.text
        continue
      }
      if (tok.type === 'open') {
        const tag = tok.tag || ''
        if (['h1','h2','h3','h4','h5','h6'].includes(tag)) {
          flush()
          inHeader = true
          contextStack.push(tag)
        } else if (['p','div'].includes(tag)) {
          flush()
          contextStack.push(tag)
        } else if (tag === 'li') {
          flush()
          contextStack.push('li')
          pendingText = '• '
        } else if (tag === 'strong' || tag === 'b') {
          inBold = true
        } else if (tag === 'th') {
          flush()
          inTh = true
          contextStack.push('th')
        } else if (tag === 'td') {
          flush()
          contextStack.push('td')
        } else if (tag === 'tr') {
          contextStack.push('tr')
        } else if (tag === 'table') {
          flush()
          lines.push({ text: '', spaceBefore: 4 })
        } else if (tag === 'br') {
          pendingText += '\n'
        }
      } else if (tok.type === 'close') {
        const tag = tok.tag || ''
        if (['h1','h2','h3','h4','h5','h6'].includes(tag)) {
          const level = parseInt(tag.charAt(1))
          const size = level === 1 ? 16 : level === 2 ? 13 : 11
          const spaceBefore = level <= 2 ? 14 : 8
          flush({ bold: true, size, spaceBefore, spaceAfter: 4 })
          inHeader = false
          contextStack.pop()
        } else if (tag === 'p') {
          flush({ size: 10, spaceAfter: 3 })
          contextStack.pop()
        } else if (tag === 'div') {
          flush({ size: 10 })
          contextStack.pop()
        } else if (tag === 'li') {
          flush({ size: 10, indent: 12, spaceAfter: 1 })
          contextStack.pop()
        } else if (tag === 'strong' || tag === 'b') {
          inBold = false
        } else if (tag === 'th') {
          flush({ bold: true, size: 10, indent: 0 })
          inTh = false
          contextStack.pop()
        } else if (tag === 'td') {
          flush({ size: 10, indent: 0 })
          contextStack.pop()
        } else if (tag === 'tr') {
          lines.push({ text: '', divider: true })
          contextStack.pop()
        } else if (tag === 'table') {
          lines.push({ text: '', spaceAfter: 4 })
        } else if (tag === 'ul' || tag === 'ol') {
          lines.push({ text: '', spaceAfter: 2 })
        }
      }
    }
    flush({ size: 10 })
    return lines
  }

  const contentLines = htmlToLines(rawHtml)

  // ── 2. PDF layout parameters ────────────────────────────────────────────────
  const PW = 595   // A4 width in pt
  const PH = 842   // A4 height in pt
  const ML = 56    // left margin (matches letterhead content area)
  const MR = 56    // right margin
  const MT = 168   // top margin in pt ≈ 59mm — well below logo block (~52mm tall)
  const MB = 56    // bottom margin
  const TW = PW - ML - MR  // text width = 483pt ≈ 170mm (full usable column)

  // Header band height (decorative)
  const HEADER_H = 148  // pt ≈ 52mm — ornament strip + chain + logo block
  const LOGO_Y   = PH - 40  // logo baseline (unused, kept for reference)

  // Fonts (built-in Type1)
  const FONT_REG  = '/F1'  // Helvetica
  const FONT_BOLD = '/F2'  // Helvetica-Bold

  // ── 3. Page text layout ─────────────────────────────────────────────────────
  type PageContent = { stream: string; pageNum: number }
  const pages: PageContent[] = []

  let curY = PH - MT  // current Y (top of content area, below header+clearance)
  let stream = ''
  let pageNum = 1

  function charsPerWidth(size: number, w: number) {
    return Math.floor(w / (size * 0.52))
  }

  function wordWrap(text: string, size: number, maxWidth: number, indent: number): string[] {
    const cpw = charsPerWidth(size, maxWidth - indent)
    const words = text.split(' ')
    const wrapped: string[] = []
    let line = ''
    for (const w of words) {
      if (w.includes('\n')) {
        const parts = w.split('\n')
        for (let pi = 0; pi < parts.length; pi++) {
          if (pi > 0) { if (line) wrapped.push(line); line = parts[pi] }
          else line = line ? line + ' ' + parts[pi] : parts[pi]
        }
        continue
      }
      const candidate = line ? line + ' ' + w : w
      if (candidate.length > cpw && line) {
        wrapped.push(line)
        line = w
      } else {
        line = candidate
      }
    }
    if (line) wrapped.push(line)
    return wrapped.length ? wrapped : ['']
  }

  function drawHeaderBand(): string {
    // Letterhead header replicating the background image layout:
    //   0–24pt:   warm khaki ornament strip
    //   24–32pt:  chain divider (black rule)
    //   32–148pt: white logo area with CPC text centred
    //   148–152pt: thin grey rule separating header from content
    let s = ''
    // Top ornament strip — warm khaki #A79C7F
    s += `0.655 0.612 0.498 rg\n`
    s += `0 ${PH - 24} ${PW} 24 re f\n`
    // Chain / divider rule
    s += `0 0 0 rg\n`
    s += `1.2 w\n0 ${PH - 28} m ${PW} ${PH - 28} l S\n`
    // White logo block (28pt → 148pt from top = 120pt tall)
    s += `1 1 1 rg\n`
    s += `0 ${PH - HEADER_H} ${PW} ${HEADER_H - 28} re f\n`
    // Arabic org name (centered, bold)
    s += `0 0 0 rg\n`
    const logoMidY = PH - HEADER_H + (HEADER_H - 28) / 2
    s += `BT\n${FONT_BOLD} 13 Tf\n`
    s += `${PW/2 - 120} ${logoMidY + 18} Td\n`
    s += `(CROWN PRINCE'S COURT  \u2014  DIWAN WALI AL AHD) Tj\n`
    // Sub-label
    s += `${FONT_REG} 8.5 Tf\n`
    s += `${PW/2 - 78} ${logoMidY + 2} Td\n`
    s += `(Abu Dhabi, United Arab Emirates) Tj\n`
    // Contact line
    s += `${FONT_REG} 7.5 Tf\n`
    s += `${PW/2 - 70} ${logoMidY - 13} Td\n`
    s += `(procurement@cpc-rfp.website     \u2022     cpc-rfp.website) Tj\n`
    s += `ET\n`
    // Thin gold rule below header band
    s += `0.729 0.592 0.396 RG\n0.75 w\n0 ${PH - HEADER_H - 2} m ${PW} ${PH - HEADER_H - 2} l S\n`
    // Thin grey rule just above content start (at MT)
    s += `0.8 0.8 0.8 RG\n0.25 w\n${ML} ${PH - MT + 4} m ${PW - MR} ${PH - MT + 4} l S\n`
    s += `0 0 0 RG\n0 0 0 rg\n`
    return s
  }

  function drawFooter(pn: number): string {
    let s = ''
    s += `0.6 0.6 0.6 rg\n`
    s += `BT\n${FONT_REG} 8 Tf\n`
    // Page number centered
    const pnStr = `Page ${pn}`
    const pnX = PW / 2 - pnStr.length * 2.2
    s += `${pnX} ${MB - 16} Td\n(${pnStr}) Tj\nET\n`
    // Footer rule
    s += `0.8 0.8 0.8 RG\n0.5 w\n${ML} ${MB - 4} m ${PW - MR} ${MB - 4} l S\n`
    s += `0 0 0 RG\n0 0 0 rg\n`
    return s
  }

  function newPage() {
    if (stream) {
      pages.push({ stream: drawHeaderBand() + stream + drawFooter(pageNum), pageNum })
    }
    stream = ''
    pageNum++
    curY = PH - MT  // reset Y to top of content area on new page
  }

  // Cover page
  stream += drawHeaderBand()
  // Cover title block — starts at MT (below header clearance)
  let coverY = PH - MT - 10
  stream += `BT\n${FONT_BOLD} 11 Tf\n`
  stream += `${ML} ${coverY} Td\n`
  stream += `(REQUEST FOR PROPOSAL) Tj\n`
  stream += `${FONT_REG} 9 Tf\n0 -16 Td\n`
  if (refNum) stream += `(Reference: ${escPdfString(refNum)}) Tj\n0 -13 Td\n`
  if (category) stream += `(Category: ${escPdfString(category)}) Tj\n0 -13 Td\n`
  if (deadline) stream += `(Submission Deadline: ${escPdfString(deadline)}) Tj\n0 -13 Td\n`
  stream += `ET\n`
  // Large title
  const titleWrapped = wordWrap(title, 18, TW, 0)
  let ty = coverY - 70
  stream += `BT\n${FONT_BOLD} 18 Tf\n`
  for (const tl of titleWrapped) {
    stream += `${ML} ${ty} Td\n(${escPdfString(tl)}) Tj\n`
    ty -= 26
  }
  stream += `ET\n`

  curY = ty - 16
  // Horizontal rule after title
  stream += `0.729 0.592 0.396 RG\n1.5 w\n${ML} ${curY} m ${PW - MR} ${curY} l S\n0 0 0 RG\n1 w\n`
  curY -= 20

  // Render cover header area separately then start content
  // Flush cover page and start content
  pages.push({ stream, pageNum })
  stream = ''
  pageNum++
  curY = PH - MT - HEADER_H

  // Content pages
  for (const line of contentLines) {
    const size  = line.size || 10
    const bold  = line.bold || false
    const indent = line.indent || 0
    const spBef  = line.spaceBefore || 0
    const spAft  = line.spaceAfter || 0
    const font   = bold ? FONT_BOLD : FONT_REG
    const lh     = size * 1.35

    if (line.divider) {
      curY -= 2
      stream += `0.8 0.8 0.8 RG\n0.25 w\n${ML} ${curY} m ${PW - MR} ${curY} l S\n0 0 0 RG\n`
      curY -= 2
      continue
    }

    curY -= spBef

    const wrapped = line.text ? wordWrap(line.text, size, TW, indent) : ['']

    for (const wl of wrapped) {
      if (curY - lh < MB + 10) {
        // Start new page
        stream += drawFooter(pageNum)
        pages.push({ stream: drawHeaderBand() + stream, pageNum })
        stream = ''
        pageNum++
        curY = PH - MT  // top of content area on new page
      }

      if (wl.trim()) {
        const x = ML + indent
        stream += `BT\n${font} ${size} Tf\n${x} ${curY - lh} Td\n(${escPdfString(wl)}) Tj\nET\n`
      }
      curY -= lh
    }
    curY -= spAft
  }

  // Final page
  if (stream || pages.length === 1) {
    stream += drawFooter(pageNum)
    pages.push({ stream: drawHeaderBand() + stream, pageNum })
  }

  // ── 4. Assemble PDF objects ─────────────────────────────────────────────────
  const pdfObjects: string[] = []
  let objId = 1

  // obj 1: Catalog (placeholder — will be fixed below)
  const catalogObjId = objId++  // 1
  // obj 2: Pages (placeholder)
  const pagesObjId = objId++   // 2
  // obj 3-4: Fonts
  const fontRegId = objId++    // 3
  const fontBoldId = objId++   // 4

  pdfObjects.push(`${catalogObjId} 0 obj\n<< /Type /Catalog /Pages ${pagesObjId} 0 R >>\nendobj\n`)
  // Pages will be filled after we know all page IDs
  pdfObjects.push('')  // placeholder for Pages obj
  pdfObjects.push(`${fontRegId} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n`)
  pdfObjects.push(`${fontBoldId} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj\n`)

  const pageObjIds: number[] = []
  const contentObjIds: number[] = []

  for (let pi = 0; pi < pages.length; pi++) {
    const pageObj   = objId++
    const contentObj = objId++
    pageObjIds.push(pageObj)
    contentObjIds.push(contentObj)

    // Page object
    pdfObjects.push(`${pageObj} 0 obj\n<< /Type /Page /Parent ${pagesObjId} 0 R /MediaBox [0 0 ${PW} ${PH}] /Contents ${contentObj} 0 R /Resources << /Font << /F1 ${fontRegId} 0 R /F2 ${fontBoldId} 0 R >> >> >>\nendobj\n`)

    // Content stream
    const cs = pages[pi].stream
    const csBytes = encodeUtf8(cs)
    pdfObjects.push(`${contentObj} 0 obj\n<< /Length ${csBytes.length} >>\nstream\n${cs}\nendstream\nendobj\n`)
  }

  // Fix Pages object
  pdfObjects[1] = `${pagesObjId} 0 obj\n<< /Type /Pages /Kids [${pageObjIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>\nendobj\n`

  // ── 5. Cross-reference table ────────────────────────────────────────────────
  const header = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'
  const offsets: number[] = []
  let body = header

  for (let oi = 0; oi < pdfObjects.length; oi++) {
    offsets.push(body.length)
    body += pdfObjects[oi]
  }

  const xrefOffset = body.length
  const totalObjs  = pdfObjects.length + 1
  let xref = `xref\n0 ${totalObjs}\n0000000000 65535 f \n`
  for (const off of offsets) {
    xref += String(off).padStart(10, '0') + ' 00000 n \n'
  }
  body += xref
  body += `trailer\n<< /Size ${totalObjs} /Root ${catalogObjId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`

  return encodeUtf8(body)
}

function escPdfString(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)').replace(/[\r\n]/g, ' ')
}

function buildZip(files: Record<string, Uint8Array>): Uint8Array {
  const entries: Array<{ name: Uint8Array, data: Uint8Array, offset: number, crc: number }> = []
  let localOffset = 0
  const parts: Uint8Array[] = []

  for (const [name, data] of Object.entries(files)) {
    const nameBytes = encodeUtf8(name)
    const crcVal = crc32(data)

    const local = new Uint8Array(30 + nameBytes.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034B50, true)
    lv.setUint16(4, 20, true)
    lv.setUint16(6, 0, true)
    lv.setUint16(8, 0, true)
    lv.setUint16(10, 0, true)
    lv.setUint16(12, 0, true)
    lv.setUint32(14, crcVal, true)
    lv.setUint32(18, data.length, true)
    lv.setUint32(22, data.length, true)
    lv.setUint16(26, nameBytes.length, true)
    lv.setUint16(28, 0, true)
    local.set(nameBytes, 30)

    entries.push({ name: nameBytes, data, offset: localOffset, crc: crcVal })
    localOffset += local.length + data.length
    parts.push(local, data)
  }

  const centralDirParts: Uint8Array[] = []
  let centralDirSize = 0
  const centralStart = localOffset

  for (const entry of entries) {
    const cd = new Uint8Array(46 + entry.name.length)
    const cv = new DataView(cd.buffer)
    cv.setUint32(0, 0x02014B50, true)
    cv.setUint16(4, 20, true)
    cv.setUint16(6, 20, true)
    cv.setUint16(8, 0, true)
    cv.setUint16(10, 0, true)
    cv.setUint16(12, 0, true)
    cv.setUint16(14, 0, true)
    cv.setUint32(16, entry.crc, true)
    cv.setUint32(20, entry.data.length, true)
    cv.setUint32(24, entry.data.length, true)
    cv.setUint16(28, entry.name.length, true)
    cv.setUint16(30, 0, true)
    cv.setUint16(32, 0, true)
    cv.setUint16(34, 0, true)
    cv.setUint16(36, 0, true)
    cv.setUint32(38, 0, true)
    cv.setUint32(42, entry.offset, true)
    cd.set(entry.name, 46)
    centralDirParts.push(cd)
    centralDirSize += cd.length
  }

  const eocd = new Uint8Array(22)
  const ev = new DataView(eocd.buffer)
  ev.setUint32(0, 0x06054B50, true)
  ev.setUint16(4, 0, true)
  ev.setUint16(6, 0, true)
  ev.setUint16(8, entries.length, true)
  ev.setUint16(10, entries.length, true)
  ev.setUint32(12, centralDirSize, true)
  ev.setUint32(16, centralStart, true)
  ev.setUint16(20, 0, true)

  const allParts = [...parts, ...centralDirParts, eocd]
  const totalLen = allParts.reduce((s, p) => s + p.length, 0)
  const out = new Uint8Array(totalLen)
  let pos = 0
  for (const p of allParts) { out.set(p, pos); pos += p.length }
  return out
}

function crc32(data: Uint8Array): number {
  let crc = 0xFFFFFFFF
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i]
    for (let j = 0; j < 8; j++) {
      crc = (crc & 1) ? (crc >>> 1) ^ 0xEDB88320 : crc >>> 1
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0
}

// ============================================================
// HELPER — XML/HTML ESCAPING
// ============================================================
function escXml(s: any): string {
  if (!s) return ''
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

// ============================================================
// HELPERS — VENDOR SCORING (for AI shortlisting)
// ============================================================
function computeVendorScore(v: any, rfp: any): number {
  const specs = (v.specializations || '').toLowerCase()
  const exp   = (v.erp_experience || '').toLowerCase()
  const certs = (v.certifications || '').toLowerCase()
  const rfpTitle = (rfp?.title || '').toLowerCase()
  const rfpScope = (rfp?.scope || '').toLowerCase()
  const rfpTech  = (rfp?.tech_requirements || '').toLowerCase()
  const rfpAll   = rfpTitle + ' ' + rfpScope + ' ' + rfpTech

  const rfpNeedsOracle = rfpAll.includes('oracle') || rfpAll.includes('ebs') || rfpAll.includes('r12')
  const rfpNeedsERP    = rfpAll.includes('erp') || rfpNeedsOracle
  const rfpNeedsData   = rfpAll.includes('data') || rfpAll.includes('warehouse') || rfpAll.includes('dwh') || rfpAll.includes('bi') || rfpAll.includes('analytics') || rfpAll.includes('machine learning')
  const rfpNeedsCRM    = rfpAll.includes('crm') || rfpAll.includes('salesforce') || rfpAll.includes('dynamics')
  const rfpNeedsSAP    = rfpAll.includes('sap')

  let score = 30

  // Platform specificity
  if (rfpNeedsOracle) {
    if (specs.includes('oracle ebs') || specs.includes('oracle erp') || exp.includes('oracle ebs')) {
      score += 35
    } else if (specs.includes('oracle')) {
      score += 20
    } else if (specs.includes('jd edwards') || specs.includes('peoplesoft')) {
      score += 10
    } else if (specs.includes('sap') && !specs.includes('oracle')) {
      score += 2
    } else {
      score += 0
    }
  } else if (rfpNeedsSAP) {
    if (specs.includes('sap')) score += 35
    else if (specs.includes('erp')) score += 10
  } else if (rfpNeedsData) {
    if (specs.includes('data') || specs.includes('analytics') || specs.includes('bi') || exp.includes('data')) score += 25
    else if (specs.includes('erp')) score += 5
  } else if (rfpNeedsCRM) {
    if (specs.includes('crm') || specs.includes('salesforce') || specs.includes('dynamics')) score += 30
    else if (specs.includes('erp')) score += 10
  } else if (rfpNeedsERP) {
    if (specs.includes('erp')) score += 20
    else score += 5
  } else {
    score += 10
  }

  // Government experience
  if (exp.includes('government') || exp.includes('ministry') || exp.includes('uae') || exp.includes('abu dhabi')) {
    score += 15
  } else if (exp.includes('public sector') || exp.includes('federal')) {
    score += 8
  }

  // Certifications
  if (certs.includes('iso 27001')) score += 5
  if (certs.includes('iso 9001')) score += 3
  if (rfpNeedsOracle && (certs.includes('oracle') || certs.includes('ocp') || certs.includes('oce'))) score += 10
  if (rfpNeedsSAP && certs.includes('sap')) score += 10

  // Company size
  if (v.size === 'Large') score += 5
  else if (v.size === 'Medium') score += 3

  return Math.min(Math.max(score, 0), 100)
}

function buildFitRationale(v: any, score: number): string {
  const grade = score >= 80 ? 'Excellent fit' : score >= 65 ? 'Good fit' : score >= 50 ? 'Moderate fit' : 'Poor fit'
  const reasons: string[] = []
  const specs = (v.specializations || '').toLowerCase()
  const exp = (v.erp_experience || '').toLowerCase()

  if (specs.includes('oracle')) reasons.push('Oracle expertise')
  if (specs.includes('sap')) reasons.push('SAP expertise')
  if (specs.includes('data') || specs.includes('analytics')) reasons.push('Data/Analytics expertise')
  if (exp.includes('government')) reasons.push('Government sector experience')
  if (v.size === 'Large') reasons.push('Large enterprise')

  return `${grade} (${score}/100). ${reasons.length > 0 ? reasons.join(', ') + '.' : 'General IT services provider.'}`
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
  const toAddr = (to || '').toLowerCase().trim()
  if (!toAddr.endsWith('@andersenlab.com')) {
    return { ok: true, id: 'simulated-' + Date.now(), simulated: true }
  }

  const RESEND_API_KEY = env?.RESEND_API_KEY || (globalThis as any).RESEND_API_KEY || ''
  if (!RESEND_API_KEY) {
    return { ok: false, error: 'RESEND_API_KEY not configured' }
  }

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
  // Inbound emails handled via Resend webhook — this is kept for backward compatibility
  return []
}

// ============================================================
// XLSX PARSER — Workers-native async DecompressionStream
// ============================================================
async function inflateAsync(compressed: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate-raw')
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
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }
  return result
}

async function unzipEntries(bytes: Uint8Array): Promise<Record<string, Uint8Array>> {
  const entries: Record<string, Uint8Array> = {}

  if (bytes[0] !== 0x50 || bytes[1] !== 0x4B || bytes[2] !== 0x03 || bytes[3] !== 0x04) {
    throw new Error('Not a valid ZIP file')
  }

  let pos = 0
  while (pos < bytes.length - 4) {
    const sig = (bytes[pos] | (bytes[pos+1] << 8) | (bytes[pos+2] << 16) | (bytes[pos+3] << 24)) >>> 0
    if (sig !== 0x04034B50) break

    const method       = bytes[pos+8]  | (bytes[pos+9] << 8)
    const compSize     = bytes[pos+18] | (bytes[pos+19] << 8) | (bytes[pos+20] << 16) | (bytes[pos+21] << 24)
    const fnLen        = bytes[pos+26] | (bytes[pos+27] << 8)
    const extraLen     = bytes[pos+28] | (bytes[pos+29] << 8)

    const fnStart  = pos + 30
    const dataStart = fnStart + fnLen + extraLen
    const filename  = new TextDecoder('utf-8').decode(bytes.slice(fnStart, fnStart + fnLen))
    const compData  = bytes.slice(dataStart, dataStart + compSize)

    if (method === 0) {
      entries[filename] = compData
    } else if (method === 8) {
      try {
        entries[filename] = await inflateAsync(compData)
      } catch (_) {}
    }

    pos = dataStart + compSize
  }
  return entries
}

async function parseXlsxBuffer(buf: ArrayBuffer): Promise<string[]> {
  try {
    const bytes = new Uint8Array(buf)
    const entries = await unzipEntries(bytes)

    const ssKey = Object.keys(entries).find(k => k.endsWith('sharedStrings.xml'))
    const ssXml = ssKey ? new TextDecoder('utf-8').decode(entries[ssKey]) : ''

    const sharedStrings: string[] = []
    const siRegex = /<si>([\s\S]*?)<\/si>/g
    let siMatch: RegExpExecArray | null
    while ((siMatch = siRegex.exec(ssXml)) !== null) {
      const tRegex = /<t[^>]*>([\s\S]*?)<\/t>/g
      let text = ''
      let tMatch: RegExpExecArray | null
      while ((tMatch = tRegex.exec(siMatch[1])) !== null) {
        text += tMatch[1]
      }
      sharedStrings.push(text.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'"))
    }

    const sheetKey = Object.keys(entries).find(k => k.match(/xl\/worksheets\/sheet\d+\.xml/))
    if (!sheetKey) return []
    const sheetXml = new TextDecoder('utf-8').decode(entries[sheetKey])

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
        const vMatch = /<v>([\s\S]*?)<\/v>/.exec(inner)
        const tMatch = /<t[^>]*>([\s\S]*?)<\/t>/.exec(inner)
        let val = ''
        if (attrs.includes('t="s"') && vMatch) {
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

    const headerRow = rows[0]
    let questionCol = ''
    for (const [col, val] of Object.entries(headerRow)) {
      if (/question/i.test(String(val))) { questionCol = col; break }
    }
    if (!questionCol) questionCol = 'C'

    const questions: string[] = []
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i]
      if (!row || Object.keys(row).length === 0) continue
      let q = (row[questionCol] || '').trim()
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

function parseCsvQuestions(text: string): string[] {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0)
  const questions: string[] = []
  for (const line of lines) {
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

// ============================================================
// HELPERS — SAMPLE PROPOSALS (for testing/demo)
// ============================================================
function buildVendorProposal(v: any, isAndersen: boolean, isEPAM: boolean): any {
  if (isAndersen) {
    return {
      technical: `TECHNICAL PROPOSAL — ${v.name}\n\nAndersen Lab proposes a phased, risk-mitigated delivery approach leveraging our certified Oracle EBS team's deep experience across 12+ UAE government implementations.\n\nProposed Timeline: 14 months end-to-end\nTeam: 8 certified Oracle professionals + 3 Tableau/DWH specialists + dedicated PM`,
      financial: 4800000,
      status: 'submitted',
    }
  }
  if (isEPAM) {
    return {
      technical: `TECHNICAL PROPOSAL — EPAM Systems\n\nEPAM Systems proposes a modern, engineering-excellence driven approach to CPC's ERP and Data Platform requirements.\n\nProposed Timeline: 13 months end-to-end\nTeam: 6 Oracle certified consultants + 4 data engineers + 2 Tableau experts + PM`,
      financial: 3950000,
      status: 'submitted',
    }
  }
  const financial = 4000000 + Math.floor(Math.random() * 3000000)
  return {
    technical: `Technical Proposal from ${v.name}:\n\nOur team proposes a comprehensive solution leveraging our ${v.specializations || 'enterprise software'} expertise.\n\nProposed Timeline: 14-18 months.`,
    financial: financial,
    status: 'submitted',
  }
}
