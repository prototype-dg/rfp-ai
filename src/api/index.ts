import { Hono } from 'hono'
import { initDb, seedVendors } from '../db/seed'
import type { Bindings } from '../types'
import { emblemPngBase64 } from '../emblem-data'

// WORKER_VERSION: bump this to force Cloudflare to recognise the new bundle
const WORKER_VERSION = '2026-07-26-v41'

// ── PDF Sidecar ────────────────────────────────────────────────────────────────
// Calls the Python/pdfplumber sidecar running at api.cpc-rfp.website.
// The sidecar fetches the PDF from the given URL and returns extracted text.
// Requires env.PDF_SIDECAR_URL and env.PDF_SIDECAR_SECRET to be set as Worker secrets.
async function callSidecar(
  pdfUrl: string,
  env: any,
  maxPages = 100
): Promise<{ text: string; pages_total: number; pages_extracted: number; chars: number; truncated: boolean } | null> {
  const sidecarUrl = env?.PDF_SIDECAR_URL || (globalThis as any).PDF_SIDECAR_URL || ''
  const sidecarSecret = env?.PDF_SIDECAR_SECRET || (globalThis as any).PDF_SIDECAR_SECRET || ''
  if (!sidecarUrl || !sidecarSecret) {
    console.warn('[sidecar] PDF_SIDECAR_URL or PDF_SIDECAR_SECRET not configured — skipping extraction')
    return null
  }
  try {
    const res = await fetch(`${sidecarUrl}/extract-pdf`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${sidecarSecret}`,
      },
      body: JSON.stringify({ pdf_url: pdfUrl, max_pages: maxPages }),
    })
    if (!res.ok) {
      const err = await res.text().catch(() => '')
      console.error(`[sidecar] HTTP ${res.status}: ${err.slice(0, 200)}`)
      return null
    }
    return await res.json() as any
  } catch (e: any) {
    console.error('[sidecar] fetch error:', e.message)
    return null
  }
}

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

// GET /rfps/summary — per-RFP activity counts for dashboard cards
// Returns { rfpId: { unanswered_questions, unread_emails, declined_vendors, unevaluated_proposals } }
apiRouter.get('/rfps/summary', async (c) => {
  try {
    const db = c.env.DB
    const [qRows, eRows, vRows, pRows] = await Promise.all([
      // Unanswered (not yet published) questions per RFP
      db.prepare(`SELECT rfp_id, COUNT(*) as cnt FROM questions WHERE published=0 GROUP BY rfp_id`).all(),
      // Unread received emails per RFP (status='received' = inbound from vendor)
      db.prepare(`SELECT rfp_id, COUNT(*) as cnt FROM email_log WHERE status='received' AND email_type != 'invitation' GROUP BY rfp_id`).all(),
      // Declined vendors per RFP
      db.prepare(`SELECT rfp_id, COUNT(*) as cnt FROM rfp_vendors WHERE status='declined' GROUP BY rfp_id`).all(),
      // Proposals without AI evaluation per RFP
      db.prepare(`SELECT rfp_id, COUNT(*) as cnt FROM proposals WHERE ai_recommendation IS NULL GROUP BY rfp_id`).all(),
    ])
    const summary: Record<string, any> = {}
    const merge = (rows: any[], key: string) => {
      rows.forEach((r: any) => {
        if (!summary[r.rfp_id]) summary[r.rfp_id] = {}
        summary[r.rfp_id][key] = r.cnt
      })
    }
    merge(qRows.results, 'unanswered_questions')
    merge(eRows.results, 'unread_emails')
    merge(vRows.results, 'declined_vendors')
    merge(pRows.results, 'unevaluated_proposals')
    return c.json(summary)
  } catch (e: any) {
    return c.json({}, 200) // non-fatal — cards just won't show counts
  }
})

apiRouter.get('/rfps/:id', async (c) => {
  const id = c.req.param('id')
  const rfp = await c.env.DB.prepare('SELECT * FROM rfps WHERE id=?').bind(id).first()
  if (!rfp) return c.json({ error: 'Not found' }, 404)
  return c.json(rfp)
})

// GET /rfps/:id/pdf-content — returns raw RFP HTML only (no print wrapper)
// Used by client-side html2pdf.js to generate a real downloadable PDF
apiRouter.get('/rfps/:id/pdf-content', async (c) => {
  const id = c.req.param('id')
  const rfp = await c.env.DB.prepare('SELECT * FROM rfps WHERE id=?').bind(id).first()
  if (!rfp) return c.json({ error: 'Not found' }, 404)
  if (!(rfp as any).content) return c.json({ error: 'RFP has no generated content yet' }, 400)
  return new Response((rfp as any).content || '', {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache',
    },
  })
})

// GET /rfps/:id/pdf — returns a print-ready HTML page (kept for legacy/fallback)
apiRouter.get('/rfps/:id/pdf', async (c) => {
  const id = c.req.param('id')
  const rfp = await c.env.DB.prepare('SELECT * FROM rfps WHERE id=?').bind(id).first()
  if (!rfp) return c.json({ error: 'Not found' }, 404)
  if (!(rfp as any).content) return c.json({ error: 'RFP has no generated content yet' }, 400)

  const safeRef = ((rfp as any).ref_number || String(id)).replace(/\//g, '_').replace(/[^a-zA-Z0-9_\-]/g, '')
  const filename = `CPC_RFP_${safeRef}.pdf`
  const content = (rfp as any).content || ''

  // Build a self-contained print-ready HTML page
  // The LLM generates each A4 page as a div with background-image letterhead + correct padding
  // Browser print preserves all of this perfectly — no reflow or layout loss
  const printHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${((rfp as any).title || 'RFP').replace(/</g,'&lt;')}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: #e8e8e8;
    font-family: Arial, 'Segoe UI', sans-serif;
  }
  /* Each A4 page div from LLM output is already styled with background-image, padding, etc. */
  /* Just ensure pages are displayed correctly and separated */
  .rfp-doc > div {
    display: block;
    box-shadow: 0 2px 12px rgba(0,0,0,0.18);
    margin: 20px auto !important;
  }
  /* Print styles: remove browser chrome, render pages exactly */
  @media print {
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
    html, body { background: white; margin: 0; padding: 0; }
    .no-print { display: none !important; }
    .rfp-doc > div {
      box-shadow: none !important;
      margin: 0 !important;
      page-break-after: always;
    }
    .rfp-doc > div:last-child { page-break-after: avoid; }
  }
</style>
</head>
<body>
<!-- Print toolbar (hidden on print) -->
<div class="no-print" style="position:fixed;top:0;left:0;right:0;z-index:9999;background:#1B1712;color:white;padding:10px 24px;display:flex;align-items:center;justify-content:space-between;font-family:Arial,sans-serif;font-size:13px;box-shadow:0 2px 8px rgba(0,0,0,0.3)">
  <div style="display:flex;align-items:center;gap:12px">
    <span style="font-weight:700;letter-spacing:0.05em">Crown Prince&apos;s Court — RFP Document</span>
    <span style="opacity:0.6;font-size:11px">${((rfp as any).ref_number||'').replace(/</g,'&lt;')}</span>
  </div>
  <div style="display:flex;gap:10px">
    <button onclick="window.print()" style="background:#BA9765;color:white;border:none;padding:7px 20px;border-radius:5px;font-size:13px;font-weight:600;cursor:pointer;letter-spacing:0.04em">&#x2193; Save as PDF / Print</button>
    <button onclick="window.close()" style="background:transparent;color:#ccc;border:1px solid #555;padding:7px 14px;border-radius:5px;font-size:12px;cursor:pointer">Close</button>
  </div>
</div>
<!-- Page content area — shifted down to clear the toolbar -->
<div class="no-print" style="height:52px"></div>
${content}
<script>
// Auto-open print dialog after a short delay for fonts/images to load
window.addEventListener('load', function() {
  setTimeout(function() { window.print(); }, 800);
});
</script>
</body>
</html>`

  return new Response(printHtml, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Disposition': `inline; filename="${filename}.html"`,
      'Cache-Control': 'no-cache',
    },
  })
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
    // Build SET clause dynamically so partial updates (single-field auto-save)
    // never pass undefined to D1 (D1_TYPE_ERROR).
    const fieldMap: Record<string, string> = {
      title: 'title', category: 'category', budget: 'budget', deadline: 'deadline',
      scope: 'scope', tech_requirements: 'tech_requirements', objectives: 'objectives',
      background: 'background', content: 'content'
    }
    const setParts: string[] = []
    const bindings: any[] = []
    for (const [bodyKey, col] of Object.entries(fieldMap)) {
      if (body[bodyKey] !== undefined) {
        setParts.push(`${col}=?`)
        bindings.push(body[bodyKey] ?? '')
      }
    }
    // Handle scoring_matrix separately (needs JSON serialisation)
    if (body.scoring_matrix !== undefined) {
      setParts.push('scoring_matrix=?')
      bindings.push(body.scoring_matrix ? JSON.stringify(body.scoring_matrix) : null)
    }
    if (setParts.length === 0) {
      // Nothing to update — just return current record
      const rfp = await c.env.DB.prepare('SELECT * FROM rfps WHERE id=?').bind(id).first()
      return c.json(rfp)
    }
    setParts.push("updated_at=datetime('now')")
    bindings.push(id)
    await c.env.DB.prepare(`UPDATE rfps SET ${setParts.join(', ')} WHERE id=?`)
      .bind(...bindings).run()
    const rfp = await c.env.DB.prepare('SELECT * FROM rfps WHERE id=?').bind(id).first()
    return c.json(rfp)
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// Save scoring matrix separately (lightweight, no full PUT needed)
apiRouter.post('/rfps/:id/scoring-matrix', async (c) => {
  try {
    const id = c.req.param('id')
    const body = await c.req.json()
    const matrixJson = JSON.stringify(body.matrix || [])
    await c.env.DB.prepare(`UPDATE rfps SET scoring_matrix=?, updated_at=datetime('now') WHERE id=?`).bind(matrixJson, id).run()
    return c.json({ ok: true })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// POST /rfps/:id/generate — streams LLM tokens as SSE to avoid Cloudflare CPU timeout.
// The client reads the SSE stream and shows live progress; the Worker saves to DB after
// the LLM finishes and sends a final event: data: {"done":true,"rfp":{...}}
apiRouter.post('/rfps/:id/generate', async (c) => {
  const id = c.req.param('id')
  let body: any
  try { body = await c.req.json() } catch { body = {} }

  const existingRfp = await c.env.DB.prepare('SELECT * FROM rfps WHERE id=?').bind(id).first<any>().catch(() => null)

  // Use doc text already extracted at upload time — skip expensive re-extraction at generate time.
  // Only fall back to R2 if the DB field is genuinely empty (not a placeholder from a failed extract).
  let archDocText = body.arch_doc_text || existingRfp?.arch_doc_text || ''
  let brdDocText  = body.brd_doc_text  || existingRfp?.brd_doc_text  || ''

  const isPlaceholder = (t: string) => !t || t.length < 500 || t.startsWith('[Document uploaded:') || t.startsWith('[PDF:')
  const bucket: R2Bucket | undefined = (c.env as any).PROPOSALS_BUCKET
  if (bucket && (isPlaceholder(archDocText) || isPlaceholder(brdDocText))) {
    try {
      const listed = await bucket.list({ prefix: `arch-docs/${id}/` })
      for (const obj of listed.objects) {
        const docType = (obj.customHttpMetadata as any)?.docType
          || obj.key.toLowerCase().includes('brd') ? 'brd' : 'arch'
        if (docType === 'brd' && !isPlaceholder(brdDocText)) continue
        if (docType !== 'brd' && !isPlaceholder(archDocText)) continue

        // Generate a signed URL so the sidecar can fetch the PDF directly from R2
        const signedUrl = await (bucket as any).createSignedUrl
          ? await (bucket as any).createSignedUrl(obj.key, { expiresIn: 300 })
          : null

        // Fallback: build a proxied URL through our own /api/proposals/pdf/:key endpoint
        const pdfUrl = signedUrl
          || `https://a7b32759-e743-4139-9bb0-4bae44886667.vip.gensparksite.com/api/proposals/pdf/${encodeURIComponent(obj.key)}`

        const result = await callSidecar(pdfUrl, c.env, 100)
        if (!result || result.chars < 200) continue

        const sizeKb = Math.round((obj.size || 0) / 1024)
        const text = `[Source: ${obj.key}, ${sizeKb}KB, ${result.pages_extracted}/${result.pages_total} pages${result.truncated ? ' — truncated' : ''}]\n\n${result.text.slice(0, 30000)}`

        if (docType === 'brd' && isPlaceholder(brdDocText)) {
          brdDocText = text
          c.env.DB.prepare(`UPDATE rfps SET brd_doc_text=?, updated_at=datetime('now') WHERE id=?`).bind(text, id).run().catch(() => {})
        } else if (docType !== 'brd' && isPlaceholder(archDocText)) {
          archDocText = text
          c.env.DB.prepare(`UPDATE rfps SET arch_doc_text=?, updated_at=datetime('now') WHERE id=?`).bind(text, id).run().catch(() => {})
        }
      }
    } catch (_) { /* non-fatal — generate without doc context */ }
  }

  const existingScoringMatrix = existingRfp?.scoring_matrix || null

  // Build the prompts (same as generateRFPWithLLM but without calling callLLM yet)
  const { systemPrompt, userPrompt } = buildRFPPrompt(body, archDocText, brdDocText, existingScoringMatrix)

  const apiKey = c.env?.OPENAI_API_KEY || (globalThis as any).OPENAI_API_KEY || ''
  const baseUrl = c.env?.OPENAI_BASE_URL || 'https://www.genspark.ai/api/llm_proxy/v1'

  if (!apiKey) {
    return c.json({ error: 'OPENAI_API_KEY not configured' }, 500)
  }

  // Open upstream SSE stream to LLM
  let llmRes: Response
  try {
    llmRes = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-5-mini',
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
        max_tokens: 30000,
        temperature: 0.3,
        stream: true,
      }),
    })
  } catch (e: any) {
    return c.json({ error: 'LLM fetch failed: ' + e.message }, 502)
  }

  if (!llmRes.ok || !llmRes.body) {
    const errText = await llmRes.text().catch(() => 'unknown')
    return c.json({ error: `LLM error ${llmRes.status}: ${errText}` }, 502)
  }

  // Pipe upstream SSE → client SSE while collecting full content for DB save.
  // TransformStream bridges the upstream reader into the response body.
  let fullContent = ''
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()

  const { readable, writable } = new TransformStream()
  const writer = writable.getWriter()

  // Process upstream in background — ctx.waitUntil keeps the Worker alive after headers flush
  const streamTask = (async () => {
    try {
      const reader = llmRes.body!.getReader()
      let buf = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''
        for (const line of lines) {
          const t = line.trim()
          if (!t || t === 'data: [DONE]') continue
          if (!t.startsWith('data: ')) continue
          try {
            const json = JSON.parse(t.slice(6))
            const delta = json.choices?.[0]?.delta?.content
            if (delta) {
              fullContent += delta
              // Forward raw SSE token chunk to client
              await writer.write(encoder.encode(`data: ${JSON.stringify({ token: delta })}\n\n`))
            }
          } catch { /* skip malformed */ }
        }
      }

      // Save to DB
      const content = fullContent.length > 400 ? `<div class="rfp-doc">${fullContent}</div>` : ''
      if (content) {
        await c.env.DB.prepare(`
          UPDATE rfps SET title=?, category=?, budget=?, deadline=?, scope=?, tech_requirements=?,
            objectives=?, background=?, content=?, arch_doc_text=?, brd_doc_text=?, updated_at=datetime('now')
          WHERE id=?
        `).bind(
          body.title, body.category, body.budget, body.deadline, body.scope,
          body.tech_requirements || '', body.objectives || '', body.background || '',
          content, archDocText, brdDocText, id
        ).run()
      }

      const rfp = await c.env.DB.prepare('SELECT * FROM rfps WHERE id=?').bind(id).first().catch(() => null)
      // Send final DONE event with the saved RFP
      await writer.write(encoder.encode(`data: ${JSON.stringify({ done: true, rfp })}\n\n`))
    } catch (e: any) {
      await writer.write(encoder.encode(`data: ${JSON.stringify({ error: e.message })}\n\n`)).catch(() => {})
    } finally {
      await writer.close().catch(() => {})
    }
  })()

  // Keep Worker alive for the duration of the stream
  c.executionCtx.waitUntil(streamTask)

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
    },
  })
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

    // Extract text via Python sidecar (pdfplumber) — far more reliable than JS regex
    const sizeKb = Math.round(bytes.length / 1024)
    let extractedText = ''
    let extractionOk = false

    if (r2Key) {
      // Build proxied URL through our own PDF endpoint so sidecar can fetch it
      const pdfProxyUrl = `https://a7b32759-e743-4139-9bb0-4bae44886667.vip.gensparksite.com/api/proposals/pdf/${encodeURIComponent(r2Key)}`
      const sidecarResult = await callSidecar(pdfProxyUrl, c.env, 100)
      if (sidecarResult && sidecarResult.chars >= 200) {
        extractedText = `[Source: ${file.name}, ${sizeKb}KB, ${sidecarResult.pages_extracted}/${sidecarResult.pages_total} pages${sidecarResult.truncated ? ' — truncated' : ''}]\n\n${sidecarResult.text}`
        if (extractedText.length > 40000) extractedText = extractedText.slice(0, 40000) + '\n\n[... document continues — content above is sufficient for RFP generation ...]'
        extractionOk = true
      }
    }

    if (!extractionOk) {
      extractedText = `[PDF: ${file.name}, ${sizeKb}KB — text extraction incomplete. File stored in R2 at key: ${r2Key}. Use file name and context to infer content type.]`
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
      extraction_ok: extractionOk
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

// PUT /vendors/:id — update vendor fields (email required; all other fields optional)
apiRouter.put('/vendors/:id', async (c) => {
  const id = c.req.param('id')
  try {
    const body = await c.req.json() as any
    const { contact_email, contact_name, website, hq_city, founded_year,
            annual_revenue_usd, platforms, certifications, erp_experience,
            public_sector_refs, specializations } = body
    if (!contact_email || !contact_email.includes('@')) {
      return c.json({ ok: false, error: 'Valid email address required' }, 400)
    }
    await c.env.DB.prepare(`
      UPDATE vendors SET
        contact_email=?,
        contact_name=COALESCE(?,contact_name),
        website=COALESCE(?,website),
        hq_city=COALESCE(?,hq_city),
        founded_year=COALESCE(?,founded_year),
        annual_revenue_usd=COALESCE(?,annual_revenue_usd),
        platforms=COALESCE(?,platforms),
        certifications=COALESCE(?,certifications),
        erp_experience=COALESCE(?,erp_experience),
        public_sector_refs=COALESCE(?,public_sector_refs),
        specializations=COALESCE(?,specializations)
      WHERE id=?`)
      .bind(
        contact_email.trim().toLowerCase(),
        contact_name?.trim() || null,
        website?.trim() || null,
        hq_city?.trim() || null,
        founded_year || null,
        annual_revenue_usd?.trim() || null,
        platforms?.trim() || null,
        certifications?.trim() || null,
        erp_experience?.trim() || null,
        public_sector_refs?.trim() || null,
        specializations?.trim() || null,
        id
      ).run()
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
  // Target ALL questions NOT yet emailed to vendors (emailed_at IS NULL).
  // This includes: unanswered, draft-answered, and approved-but-not-sent questions.
  // Questions already sent (emailed_at IS NOT NULL) are excluded — they are locked.
  const { results: qs } = await c.env.DB.prepare(
    `SELECT * FROM questions WHERE (emailed_at IS NULL OR emailed_at='') AND rfp_id=?`
  ).bind(rfpId).all<any>()

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

// POST /rfps/:id/questions/approve-all — mark all answered, non-manual, unpublished questions as approved
apiRouter.post('/rfps/:id/questions/approve-all', async (c) => {
  const rfpId = c.req.param('id')
  const result = await c.env.DB.prepare(`
    UPDATE questions SET published=1
    WHERE rfp_id=? AND published=0 AND needs_manual=0
      AND answer IS NOT NULL AND answer != ''
  `).bind(rfpId).run()
  return c.json({ ok: true, approved: result.meta.changes })
})

apiRouter.put('/rfps/:rfpId/questions/:id/answer', async (c) => {
  const id = c.req.param('id')
  const { answer } = await c.req.json()
  // Save the edited answer and clear needs_manual flag.
  // Do NOT auto-approve (published=1) — the user must explicitly click Approve.
  await c.env.DB.prepare('UPDATE questions SET answer=?, needs_manual=0 WHERE id=?').bind(answer, id).run()
  return c.json({ ok: true })
})

apiRouter.post('/rfps/:id/questions/publish-all', async (c) => {
  const rfpId = c.req.param('id')
  // NOTE: We do NOT bulk-set published=1 here — that is done by approve / approve-all.
  // This endpoint only sends emails and stamps emailed_at on success.

  try {
    const rfp = await c.env.DB.prepare('SELECT * FROM rfps WHERE id=?').bind(rfpId).first<any>()

    // Fetch all approved (published=1) questions — anonymize using participant codes
    const { results: allQuestions } = await c.env.DB.prepare(`
      SELECT q.*, COALESCE(v.name, 'Unknown Vendor') as vendor_name, q.vendor_id as q_vendor_id
      FROM questions q
      LEFT JOIN vendors v ON q.vendor_id = v.id
      WHERE q.rfp_id=? AND q.published=1
      ORDER BY q.vendor_id, q.id
    `).bind(rfpId).all<any>()

    // Build anonymized questions — replace vendor_name with participant code
    const anonymizedQuestions = allQuestions.map((q: any) => ({
      ...q,
      vendor_name: q.q_vendor_id
        ? buildParticipantCode(rfpId, q.q_vendor_id)
        : 'Participant',
    }))

    const xlsxBytes = generateQAExcel(anonymizedQuestions)
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
    const nowStamp = new Date().toISOString()

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
        // No Resend key — simulate send (dev/staging)
        sentTo.push(vendor.contact_email + ' (simulated)')
        await c.env.DB.prepare(`
          INSERT INTO email_log (rfp_id, vendor_id, recipient, subject, body, email_type, status, has_attachment, created_at)
          VALUES (?,?,?,?,?,'qa_response','simulated',1,datetime('now'))
        `).bind(rfpId, vendor.id, vendor.contact_email,
          `Q&A Consolidated Response – ${rfp?.title || 'CPC RFP'} (Ref: ${rfp?.ref_number || ''})`,
          emailText).run()
      }
    }

    // Mark all approved questions as emailed (both real sends and simulated — simulated = dev environment)
    // Only stamp questions that are published=1 and not yet stamped (emailed_at IS NULL)
    await c.env.DB.prepare(`
      UPDATE questions SET emailed_at=?
      WHERE rfp_id=? AND published=1 AND (emailed_at IS NULL OR emailed_at='')
    `).bind(nowStamp, rfpId).run()

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
  const pdfBase64: string | undefined = body.pdf_base64 || undefined
  const pdfFilename: string | undefined = body.pdf_filename || undefined

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
        c.env,
        pdfBase64,
        pdfFilename
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

    // ── Email categorization ─────────────────────────────────────
    // Rules:
    //  1. spreadsheet attachment  → questions (parse Q&A)
    //  2. PDF attachment only     → plain communication (log + notify, no proposal created)
    //  3. no attachment, text only → use LLM to detect decline intent
    //  4. everything else         → plain_email
    let emailCategory = 'plain_email'

    if (spreadsheetAttachment) {
      emailCategory = 'questions'
    } else if (pdfAttachment) {
      emailCategory = 'plain_email'  // PDF emails are comms only — no proposal entity
    } else if (!hasAttachment && bodyText.trim().length > 0) {
      // Text-only email: detect decline intent via LLM + keyword fallback
      //
      // Strip quoted reply chain before analysis — everything after the first
      // "From: CPC Procurement" / "-----Original Message-----" / "On ... wrote:" line
      // so the LLM and keywords only see the vendor's own words, not the original invitation.
      const quoteStripPatterns = [
        /\r?\nFrom:\s*CPC Procurement/i,
        /\r?\n-{3,}[ \t]*Original Message[ \t]*-{3,}/i,
        /\r?\nOn .{5,100}wrote:/i,
        /\r?\n_{3,}/,
        /\r?\n>{1}/,  // "> quoted text" lines
      ]
      let cleanBody = bodyText
      for (const pat of quoteStripPatterns) {
        const idx = cleanBody.search(pat)
        if (idx > 30) { cleanBody = cleanBody.slice(0, idx); break }
      }
      cleanBody = cleanBody.trim()

      // Comprehensive decline keyword list — applied to stripped body only
      const declineKeywords = [
        'not interested', 'decline to participate', 'declining to participate',
        'unable to participate', 'cannot participate', 'regret to inform',
        'pass on this opportunity', 'withdraw from', 'will not be submitting',
        'no thank you', 'not in a position', 'unable to bid',
        'not going to participate', 'not participate', 'will not participate',
        'unable to submit', 'cannot submit', 'not able to participate',
        'not able to submit', 'not in a position to participate',
        'unable to respond', 'cannot respond', 'will not be responding',
        'not bidding', 'not tendering', 'unable to tender',
        'respectfully decline', 'must decline', 'have to decline',
        'choosing not to participate', 'opted not to participate',
        'will not be able to participate', 'are not going to participate',
        'not going to be able', 'not able to bid', 'not able to tender',
        'withdrawing from', 'withdraw our', 'not in a position to bid',
        'cannot take part', 'unable to take part', 'not able to take part',
      ]
      const cleanBodyLower = cleanBody.toLowerCase()
      const keywordHit = declineKeywords.some(kw => cleanBodyLower.includes(kw))

      if (keywordHit) {
        // Keywords matched on clean text — no need for LLM
        emailCategory = 'decline'
      } else {
        // No keyword hit — ask LLM on stripped body only
        const openAiKey = (c.env as any).OPENAI_API_KEY || (globalThis as any).OPENAI_API_KEY || ''
        if (openAiKey) {
          try {
            const intentRes = await fetch('https://api.openai.com/v1/chat/completions', {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${openAiKey}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                model: 'gpt-4o-mini',
                max_tokens: 10,
                temperature: 0,
                messages: [
                  { role: 'system', content: 'You categorize vendor reply emails for a procurement system. The vendor received an RFP invitation and is replying. Reply with exactly one word: DECLINE if the vendor is declining, withdrawing, or expressing inability/unwillingness to participate in the RFP. Reply NEUTRAL for acknowledgements, questions, or anything else.' },
                  { role: 'user', content: `Subject: ${subject}\n\nVendor reply (quoted text removed):\n${cleanBody.slice(0, 600)}` },
                ],
              }),
            })
            if (intentRes.ok) {
              const intentData = await intentRes.json() as any
              const verdict = (intentData?.choices?.[0]?.message?.content || '').trim().toUpperCase()
              if (verdict === 'DECLINE') emailCategory = 'decline'
            }
          } catch(_) {}
        }
      }
    }

    console.log(`[webhook] Email category: ${emailCategory} | from: ${fromAddress} | vendor: ${vendorDisplayName} | attachments: ${attachments.length}`)

    // ── Log the inbound email ────────────────────────────────────
    const emailTypeForLog = emailCategory === 'questions' ? 'qa_questions'
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

    }
    // Note: plain_email (including PDF attachments) is just logged above — no further processing

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
    ORDER BY COALESCE(p.ai_total_score, -1) DESC, p.id DESC
  `).bind(rfpId).all()
  return c.json(results)
})

// GET /proposals/pdf/:key — stream a PDF from R2 (inline or download)
// Pass ?dl=1 to force Content-Disposition: attachment (triggers browser save)
apiRouter.get('/proposals/pdf/:key{.+}', async (c) => {
  const key = c.req.param('key')
  const bucket: R2Bucket | undefined = (c.env as any).PROPOSALS_BUCKET
  if (!bucket) return c.json({ error: 'Storage not configured' }, 500)

  const obj = await bucket.get(key)
  if (!obj) return c.json({ error: 'File not found' }, 404)

  const fname = key.split('/').pop() || 'proposal.pdf'
  const forceDownload = c.req.query('dl') === '1'
  const disposition = forceDownload ? `attachment; filename="${fname}"` : `inline; filename="${fname}"`

  const headers = new Headers()
  headers.set('Content-Type', obj.httpMetadata?.contentType || 'application/pdf')
  headers.set('Content-Disposition', disposition)
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
// AI PROPOSAL EVALUATION ENGINE — v26
// ============================================================

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Extract up to maxChars of text from a proposal record.
 *  Uses the pre-extracted technical_proposal text and any text stored in
 *  proposal_attachments[].extracted_text / technical_proposal fields.
 *  We never try to parse a raw PDF binary at runtime (Worker memory limits). */
function extractProposalText(proposal: any): string {
  const parts: string[] = []
  if (proposal.technical_proposal && typeof proposal.technical_proposal === 'string') {
    parts.push(proposal.technical_proposal.slice(0, 12000))
  }
  if (proposal.executive_summary) parts.push(proposal.executive_summary)
  if (proposal.key_strengths) parts.push(proposal.key_strengths)
  try {
    const atts: any[] = JSON.parse(proposal.proposal_attachments || '[]')
    for (const a of atts) {
      if (a.extracted_text) parts.push(String(a.extracted_text).slice(0, 4000))
    }
  } catch (_) {}
  return parts.join('\n\n').slice(0, 20000)
}

/** Chunk text into ~4000-char blocks */
function chunkText(text: string, size = 4000): string[] {
  const chunks: string[] = []
  for (let i = 0; i < text.length; i += size) chunks.push(text.slice(i, i + size))
  return chunks.length ? chunks : ['']
}

/** Simple keyword-overlap relevance: how many words from query appear in chunk */
function relevanceScore(query: string, chunk: string): number {
  const words = query.toLowerCase().split(/\W+/).filter(w => w.length > 3)
  if (!words.length) return 0
  const lower = chunk.toLowerCase()
  return words.filter(w => lower.includes(w)).length / words.length
}

/** Pick the 2 most relevant chunks for a requirement */
function topChunks(reqText: string, chunks: string[], n = 2): string {
  return chunks
    .map(c => ({ c, s: relevanceScore(reqText, c) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, n)
    .map(x => x.c)
    .join('\n...\n')
}

/** Extract key noun phrases from a requirement (simplified regex) */
function keyPhrases(req: string): string[] {
  return req.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 4 && !['shall','must','should','vendor','provide','ensure','that','with','from','have','this','will','been','they','their','which','where','when','also','some','into','than','been','more','such','each','both','then'].includes(w))
    .slice(0, 10)
}

/** Phase 1 deterministic compliance check */
function checkCompliance(reqText: string, proposalText: string): boolean {
  const phrases = keyPhrases(reqText)
  if (!phrases.length) return false
  const lower = proposalText.toLowerCase()
  const matched = phrases.filter(p => lower.includes(p))
  return matched.length >= Math.ceil(phrases.length * 0.4)
}

/** Extract budget from text: returns { amount, currency, confidence } */
function extractBudget(text: string): { amount: number | null; currency: string; confidence: number } {
  const currencies = ['AED', 'USD', 'EUR', 'GBP', 'SAR']
  // Priority 1: Total/Grand Total line
  const totalRe = /(?:total|grand total|subtotal|total cost|total price)[^\n\r]{0,60}?(AED|USD|EUR|GBP|SAR)?\s*[\$€£]?\s*([\d,]+(?:\.\d{1,2})?)/gi
  let m: RegExpExecArray | null
  while ((m = totalRe.exec(text)) !== null) {
    const cur = m[1] || 'AED'
    const amt = parseFloat(m[2].replace(/,/g, ''))
    if (amt > 0) return { amount: amt, currency: cur, confidence: 1.0 }
  }
  // Priority 2: Largest currency amount
  const anyRe = /(AED|USD|EUR|GBP|SAR)?\s*[\$€£]?\s*([\d,]+(?:\.\d{1,2})?)/g
  let best = { amount: 0, currency: 'AED' }
  while ((m = anyRe.exec(text)) !== null) {
    const amt = parseFloat(m[2].replace(/,/g, ''))
    if (amt > best.amount && amt < 1e10) { best = { amount: amt, currency: m[1] || 'AED' } }
  }
  if (best.amount > 1000) return { amount: best.amount, currency: best.currency, confidence: 0.3 }
  return { amount: null, currency: 'AED', confidence: 0.0 }
}

/** Extract duration from text */
function extractDuration(text: string): string | null {
  const re = /(\d+(?:\.\d+)?)\s*(month|months|week|weeks|quarter|quarters|year|years)/gi
  const m = re.exec(text)
  return m ? `${m[1]} ${m[2]}` : null
}

/** Parse integer from LLM JSON that may be embedded in markdown */
function parseLLMScore(raw: string): { score: number; justification: string } {
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const obj = JSON.parse(jsonMatch[0])
      return { score: Math.min(100, Math.max(0, parseInt(obj.score) || 0)), justification: String(obj.justification || '').slice(0, 150) }
    }
  } catch (_) {}
  const numMatch = raw.match(/\b(\d{1,3})\b/)
  return { score: numMatch ? Math.min(100, parseInt(numMatch[1])) : 0, justification: raw.slice(0, 120) }
}

// ── Core evaluation function ──────────────────────────────────────────────────

async function evaluateProposal(proposal: any, rfp: any, env: any): Promise<any> {
  // Step 1: Try to get text from DB fields (fast path — already extracted at upload time)
  let proposalText = extractProposalText(proposal)

  // Step 2: If DB text fields are empty, fetch PDFs from R2 via the sidecar
  if (proposalText.length < 200) {
    const textParts: string[] = []
    try {
      const atts: any[] = JSON.parse(proposal.proposal_attachments || '[]')
      for (const att of atts) {
        if (!att.r2_key) continue
        const pdfUrl = `https://a7b32759-e743-4139-9bb0-4bae44886667.vip.gensparksite.com/api/proposals/pdf/${encodeURIComponent(att.r2_key)}`
        // Cap pages to avoid OOM on VPS — large PDFs (>10MB) get fewer pages
        const sizeMb = (att.size_bytes || 0) / 1024 / 1024
        const maxPages = sizeMb > 10 ? 30 : sizeMb > 5 ? 50 : 80
        const result = await callSidecar(pdfUrl, env, maxPages)
        if (result && result.chars >= 100) {
          textParts.push(`[${att.label || att.filename}, ${result.pages_extracted}/${result.pages_total} pages]\n${result.text}`)
        }
      }
    } catch (_) {}

    // Also try legacy single pdf_attachment_url field
    // Strip r2:// prefix if present (legacy storage format)
    if (!textParts.length && proposal.pdf_attachment_url) {
      const pdfKey = proposal.pdf_attachment_url
        .replace(/^r2:\/\//, '')   // strip r2:// prefix
        .replace(/^\//, '')         // strip leading slash
      const pdfUrl = `https://a7b32759-e743-4139-9bb0-4bae44886667.vip.gensparksite.com/api/proposals/pdf/${encodeURIComponent(pdfKey)}`
      const result = await callSidecar(pdfUrl, env, 40)
      if (result && result.chars >= 100) {
        textParts.push(`[${proposal.pdf_filename || 'proposal.pdf'}, ${result.pages_extracted}/${result.pages_total} pages]\n${result.text}`)
      }
    }

    if (textParts.length) {
      proposalText = textParts.join('\n\n---\n\n').slice(0, 40000)
    }
  }

  // ── Step 3: Sanity check — is this actually a vendor proposal? ───────────────
  // Cheap single call (max 80 tokens) before spending budget on scoring.
  // Skip if text is too short to classify (OCR failure / empty upload).
  if (proposalText.length >= 200) {
    try {
      const sample = proposalText.slice(0, 3000) // first 3 KB is enough to classify
      const raw = await callLLM(
        'You are a document classifier for a procurement system. Answer only with valid JSON.',
        `Classify the following document. Is it a vendor proposal (i.e. a response to an RFP / tender / request for proposal)?

A vendor proposal typically contains: company introduction, proposed solution or methodology, pricing or commercial offer, team / CV section, compliance statements, or a covering letter to a procurement team.

A document is NOT a vendor proposal if it is: the RFP/tender document itself, a contract, a policy, a report, a recipe, a poem, a presentation unrelated to a bid, or any other non-bid document.

Document excerpt:
"""
${sample}
"""

Respond ONLY with JSON: {"is_proposal": true|false, "reason": "<one sentence, max 15 words>"}`,
        env, 'gpt-5-mini', 80
      )
      // Parse — accept any JSON blob in the response
      const jsonMatch = raw.match(/\{[\s\S]*?\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        if (parsed.is_proposal === false) {
          return {
            evaluated_at: new Date().toISOString(),
            proposal_id: proposal.id,
            vendor_name: proposal.vendor_name || '',
            total_score: 0,
            recommendation: 'INVALID',
            validation_status: 'WRONG_DOCUMENT',
            wrong_document_reason: parsed.reason || 'Document does not appear to be a vendor proposal.',
            compliance_score: 0,
            quality_score: 0,
            commercial_score: null,
            budget_extracted: null,
            budget_currency: null,
            budget_confidence: 0,
            duration_extracted: null,
            strengths: [],
            weaknesses: [],
            recommendation_reasoning: parsed.reason || 'Document does not appear to be a vendor proposal.',
            mandatory_failed: [],
            compliance_breakdown: [],
            scoring_breakdown: [],
            glossary_used: 0,
            text_chars_analyzed: proposalText.length,
          }
        }
      }
    } catch (_) {
      // Classification failed — proceed with evaluation anyway (fail open)
    }
  }

  const chunks = chunkText(proposalText)

  // Parse scoring matrix
  let scoringMatrix: any[] = []
  try { scoringMatrix = JSON.parse(rfp.scoring_matrix || '[]') } catch (_) {}
  if (!scoringMatrix.length) {
    scoringMatrix = [
      { criterion: 'Technical Approach', weight: 40 },
      { criterion: 'Commercial / Price', weight: 30 },
      { criterion: 'Compliance', weight: 20 },
      { criterion: 'Company Experience', weight: 10 },
    ]
  }

  // ── Build or parse requirement glossary ──────────────────────────────────────
  // Priority 1: pre-saved glossary in DB (fastest, already vetted)
  // Priority 2: parse the "Technical Requirements and Architecture" table from the
  //             generated RFP document (rfps.content) — this is the authoritative source,
  //             the exact same document vendors received
  // Priority 3: LLM extraction from structured fields (scope / tech_requirements / objectives)
  // Priority 4: last-resort line extraction
  let glossary: any[] = []
  try { glossary = JSON.parse(rfp.requirement_glossary || '[]') } catch (_) {}

  if (!glossary.length && rfp.content) {
    // Parse the Technical Requirements table from the generated RFP HTML.
    // The table structure after HTML-stripping is:
    //   <Area text> <Requirement text> Mandatory|Desirable|Optional  (repeating)
    // We split on Classification keywords to identify row boundaries.
    try {
      const htmlContent: string = rfp.content
      // Find the "TECHNICAL REQUIREMENTS AND ARCHITECTURE" section (second occurrence —
      // first is the TOC entry, second is the actual section heading with the table)
      const sectionMarker = /technical requirements and architecture/gi
      let sectionStart = -1
      let match: RegExpExecArray | null
      let count = 0
      while ((match = sectionMarker.exec(htmlContent)) !== null) {
        count++
        if (count === 2) { sectionStart = match.index; break }
      }
      if (sectionStart === -1 && count === 1) {
        // Only one occurrence — use it (some RFPs may not have a TOC)
        sectionMarker.lastIndex = 0
        const m = sectionMarker.exec(htmlContent)
        if (m) sectionStart = m.index
      }

      if (sectionStart >= 0) {
        // Extract up to 16K chars of the section, strip HTML tags
        const sectionHtml = htmlContent.slice(sectionStart, sectionStart + 16000)
        const sectionText = sectionHtml
          .replace(/<[^>]+>/g, ' ')
          .replace(/&amp;/g, '&').replace(/&mdash;/g, '-').replace(/&nbsp;/g, ' ')
          .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
          .replace(/\s{2,}/g, ' ')
          .trim()

        // Split on Classification values to get row chunks
        // Pattern: [area text] [requirement text] Mandatory|Desirable|Optional
        const chunks = sectionText.split(/(Mandatory|Desirable|Optional)/)
        // chunks[0] = header, chunks[1] = first classification, chunks[2] = text before next, etc.
        // Pairs: (chunks[2i], chunks[2i+1]) = (text_before_classification, classification)
        for (let i = 0; i + 1 < chunks.length; i += 2) {
          const classification = chunks[i].trim()  // "Mandatory" | "Desirable" | "Optional"
          const textBefore = (i === 0 ? '' : chunks[i - 1]).trim()
          if (!classification.match(/^(Mandatory|Desirable|Optional)$/)) continue
          if (textBefore.length < 20) continue

          // The textBefore contains: [area name] + [requirement sentence]
          // The requirement sentence is the longer, more descriptive part.
          // Heuristic: split into sentences, take the longest as the requirement text.
          const sentences = textBefore.split(/(?<=[.!?])\s+/).map((s: string) => s.trim()).filter((s: string) => s.length > 20)
          const reqText = sentences.length > 0
            ? sentences.reduce((a: string, b: string) => b.length > a.length ? b : a)
            : textBefore.slice(0, 300)

          // Skip if this looks like a header/note rather than a requirement
          if (/^(notes?|each mandatory|issuance|Crown Prince)/i.test(reqText)) continue

          glossary.push({
            id: `req_${glossary.length + 1}`,
            text: reqText.slice(0, 400),
            mandatory: classification === 'Mandatory',
          })

          if (glossary.length >= 20) break  // cap at 20 requirements
        }
      }

      // If we successfully parsed requirements from the document, save them to DB
      // so future evaluations skip this parsing step entirely
      if (glossary.length > 0) {
        try {
          await env.DB.prepare(
            `UPDATE rfps SET requirement_glossary=?, updated_at=datetime('now') WHERE id=?`
          ).bind(JSON.stringify(glossary), rfp.id).run()
        } catch (_) { /* non-fatal */ }
      }
    } catch (_) {
      // HTML parsing failed — fall through to LLM extraction
    }
  }

  if (!glossary.length) {
    // Priority 3: LLM extraction from structured fields
    const structuredText = [rfp.scope || '', rfp.tech_requirements || '', rfp.objectives || ''].join('\n\n').trim()
    const contentStripped = (rfp.content || '').replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, ' ').trim()
    const rfpSource = structuredText.length > 200 ? structuredText : contentStripped
    const cleanedRfpText = rfpSource
      .split(/[\n\r]+/)
      .map((l: string) => l.trim())
      .filter((l: string) => {
        if (l.length < 15) return false
        if (/^\d+\.?\s+.{5,60}\s{2,}\d{1,3}$/.test(l)) return false  // TOC entry
        return true
      })
      .join('\n')
      .slice(0, 6000)

    try {
      const rawGlossary = await callLLM(
        'You are a procurement analyst. Extract a list of concrete requirements from an RFP document.',
        `Extract up to 10 specific, distinct requirements from this RFP. Each requirement must be a full sentence describing what the vendor must deliver or demonstrate.

Do NOT include section headings, table of contents entries, boilerplate, or duplicates.
Mark mandatory=true only if the text uses "must", "shall", "required", or "mandatory".

Return ONLY a JSON array:
[
  { "id": "req_1", "text": "<full requirement sentence>", "mandatory": true },
  ...
]

RFP Content:
${cleanedRfpText}`,
        env, 'gpt-5-mini', 1500
      )
      const jsonMatch = rawGlossary.match(/\[\s*\{[\s\S]*?\}\s*\]/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        if (Array.isArray(parsed) && parsed.length > 0) {
          glossary = parsed.slice(0, 12).map((r: any, i: number) => ({
            id: r.id || `req_${i + 1}`,
            text: String(r.text || '').slice(0, 350),
            mandatory: !!r.mandatory,
          }))
        }
      }
    } catch (_) { /* LLM failed */ }

    // Priority 4: last-resort line extraction
    if (!glossary.length && rfpSource) {
      const fallbackLines = rfpSource.split('\n').filter((l: string) => l.length > 30).slice(0, 8)
      glossary = fallbackLines.map((l: string, i: number) => ({
        id: `req_${i + 1}`,
        text: l.slice(0, 300),
        mandatory: /\bmust\b|\bshall\b|\brequired\b|\bmandatory\b/i.test(l),
      }))
    }
  }

  // ── Phase 1+2: Compliance + AI depth scoring per requirement ────────────────
  const complianceBreakdown: any[] = []
  let totalAiScore = 0; let aiScoreCount = 0
  const totalMandatory = glossary.filter((r: any) => r.mandatory).length
  let mandatoryMet = 0; let mandatoryFailed: string[] = []

  // ── Step 1: keyword-based compliance pass (no LLM, instant) ─────────────
  const reqsToScore: any[] = []
  for (const req of glossary.slice(0, 15)) {  // cap at 15 reqs
    const complianceMet = checkCompliance(req.text, proposalText)
    if (req.mandatory && complianceMet) mandatoryMet++
    if (req.mandatory && !complianceMet) mandatoryFailed.push(req.text.slice(0, 80))
    complianceBreakdown.push({
      id: req.id, text: req.text, mandatory: req.mandatory,
      compliance_met: complianceMet, ai_score: 0, justification: 'Not addressed',
    })
    if (complianceMet && proposalText.length > 50) reqsToScore.push(req)
  }

  // ── Step 2: single batch LLM call for all requirements (avoids serial timeout) ──
  if (reqsToScore.length > 0) {
    // Build a representative sample: first 3K + middle 2K + last 3K chars
    const pLen = proposalText.length
    const sampleMid = pLen > 10000 ? proposalText.slice(Math.floor(pLen / 2) - 1000, Math.floor(pLen / 2) + 1000) : ''
    const proposalSample = proposalText.slice(0, 3000)
      + (sampleMid ? '\n\n[...middle excerpt...]\n\n' + sampleMid : '')
      + (pLen > 6000 ? '\n\n[...end excerpt...]\n\n' + proposalText.slice(-3000) : '')

    try {
      const reqList = reqsToScore.map((r, i) => `${i + 1}. [${r.id}] ${r.text}`).join('\n')
      const rawBatch = await callLLM(
        'You are an expert procurement evaluator. Score how well the vendor proposal addresses each listed requirement.',
        `Requirements to evaluate:
${reqList}

Vendor Proposal (key excerpts, ${pLen} chars total):
${proposalSample.slice(0, 7000)}

For each requirement, rate 0-100 how thoroughly it is addressed (depth, specificity, feasibility).
- 0-30: Not addressed or only mentioned briefly
- 31-60: Partially addressed, missing key details
- 61-80: Well addressed with some gaps
- 81-100: Fully and thoroughly addressed

Return ONLY a JSON array — no markdown, no extra text:
[{"id":"<req_id>","score":<0-100>,"justification":"<2-3 sentence explanation citing specific evidence from proposal>"}]`,
        env, 'gpt-5-mini', 1500
      )

      // Parse batch result
      const arrMatch = rawBatch.match(/\[[\s\S]*\]/)
      if (arrMatch) {
        const batchResults: Array<{ id: string; score: number; justification: string }> = JSON.parse(arrMatch[0])
        const byId = new Map(batchResults.map(r => [r.id, r]))
        for (const entry of complianceBreakdown) {
          if (!entry.compliance_met) continue
          const result = byId.get(entry.id)
          if (result) {
            entry.ai_score = Math.max(0, Math.min(100, Math.round(result.score) || 0))
            entry.justification = result.justification || 'Addressed'
            totalAiScore += entry.ai_score
            aiScoreCount++
          }
        }
      }
    } catch (_) {
      // Batch failed — mark all as scored=0 with error note (already default)
      for (const entry of complianceBreakdown) {
        if (entry.compliance_met) {
          entry.justification = 'AI scoring unavailable — manual review required'
        }
      }
    }
  }

  // ── Budget & Duration ────────────────────────────────────────────────────────
  // NOTE: Full budget extraction (sidecar OCR + analytical LLM) is done in the
  // separate /evaluate-budget endpoint to avoid exceeding the 30s Worker CPU limit.
  // Here we do a fast regex pass on proposalText as a fallback only.
  let budget = { amount: null as number | null, currency: 'AED', confidence: 0.0 }
  let duration: string | null = proposal.proposed_duration || null

  // Fast regex pass on whatever text we already have (no extra network calls)
  try {
    const regexBudget = extractBudget(proposalText)
    if (regexBudget.amount) {
      budget = { ...regexBudget, confidence: Math.min(regexBudget.confidence, 0.35) }
    }
    const regexDuration = extractDuration(proposalText)
    if (regexDuration) duration = regexDuration
  } catch (_) {}

  // NOTE: Deep budget enrichment (sidecar OCR + analytical LLM) is handled by the
  // separate POST /rfps/:rfpId/proposals/:proposalId/evaluate-budget endpoint.

  // Use stored budget_amount if we still have nothing
  if (!budget.amount && proposal.budget_amount) {
    budget.amount = proposal.budget_amount
    budget.currency = proposal.budget_currency || 'AED'
    budget.confidence = 0.4
  }

  // ── Score calculation ──────────────────────────────────────────────────────
  const complianceScore = totalMandatory > 0 ? (mandatoryMet / totalMandatory) * 100 : (complianceBreakdown.filter(r => r.compliance_met).length / Math.max(1, complianceBreakdown.length)) * 100
  const qualityScore = aiScoreCount > 0 ? totalAiScore / aiScoreCount : 0

  let commercialScore: number | null = null
  let validationStatus = 'EVALUATED'
  if (budget.confidence < 0.8) {
    validationStatus = 'PENDING_MANUAL_REVIEW'
  } else if (budget.amount) {
    // Compare against RFP budget ceiling if available
    const rfpBudget = parseFloat((rfp.budget || '').replace(/[^0-9.]/g, '')) || 0
    commercialScore = rfpBudget > 0 ? Math.min(100, (rfpBudget / budget.amount) * 100) : 70
  }

  let totalScore: number
  if (commercialScore !== null) {
    totalScore = (complianceScore * 0.3) + (qualityScore * 0.5) + (commercialScore * 0.2)
  } else {
    totalScore = (complianceScore * 0.4) + (qualityScore * 0.6)
  }
  totalScore = Math.round(totalScore * 10) / 10

  // ── Strengths & Weaknesses ─────────────────────────────────────────────────
  const strengths = complianceBreakdown.filter(r => r.compliance_met && r.ai_score > 80).map(r => r.justification).filter(Boolean)
  // Emit rich weakness objects so the UI can render criticality badges + expand/collapse
  const weaknesses = complianceBreakdown
    .filter(r => !r.compliance_met || r.ai_score < 40)
    .map(r => ({
      id: r.id,
      text: r.text,
      mandatory: r.mandatory,
      compliance_met: r.compliance_met,
      ai_score: r.ai_score,
      justification: r.justification,
    }))

  // ── AI Verdict ─────────────────────────────────────────────────────────────
  let recommendation: string
  let reasoning: string
  if (mandatoryFailed.length > 0) {
    recommendation = 'NOT RECOMMENDED'
    reasoning = `Vendor failed ${mandatoryFailed.length} mandatory requirement(s): ${mandatoryFailed.slice(0, 2).join('; ')}`
  } else if (totalScore >= 80) {
    recommendation = 'RECOMMENDED'
    reasoning = `Strong compliance (${Math.round(complianceScore)}%) and high quality scores (avg ${Math.round(qualityScore)}/100).`
  } else if (totalScore >= 60) {
    recommendation = 'CONDITIONAL'
    reasoning = `Meets most requirements but some gaps exist. Review weaknesses before proceeding.`
  } else {
    recommendation = 'NOT RECOMMENDED'
    reasoning = `Insufficient compliance or quality. Total score ${totalScore}/100 is below threshold.`
  }

  // ── Scoring Matrix breakdown ───────────────────────────────────────────────
  const scoringBreakdown = scoringMatrix.map((criterion: any) => {
    const name = (criterion.criterion || criterion.name || '').toLowerCase()
    let achieved: number
    if (name.includes('technical') || name.includes('approach') || name.includes('methodology')) {
      achieved = qualityScore
    } else if (name.includes('commercial') || name.includes('price') || name.includes('financial') || name.includes('cost')) {
      achieved = commercialScore ?? 0
    } else if (name.includes('compliance') || name.includes('mandatory')) {
      achieved = complianceScore
    } else {
      achieved = (qualityScore + complianceScore) / 2
    }
    const weight = criterion.weight || 0
    return {
      criterion: criterion.criterion || criterion.name,
      weight,
      achieved: Math.round(achieved),
      weighted: Math.round(achieved * weight / 100 * 10) / 10,
    }
  })

  return {
    evaluated_at: new Date().toISOString(),
    proposal_id: proposal.id,
    vendor_name: proposal.vendor_name || '',
    total_score: totalScore,
    recommendation,
    validation_status: validationStatus,
    compliance_score: Math.round(complianceScore),
    quality_score: Math.round(qualityScore),
    commercial_score: commercialScore !== null ? Math.round(commercialScore) : null,
    budget_extracted: budget.amount,
    budget_currency: budget.currency,
    budget_confidence: budget.confidence,
    duration_extracted: duration,
    strengths,
    weaknesses,
    recommendation_reasoning: reasoning,
    mandatory_failed: mandatoryFailed,
    compliance_breakdown: complianceBreakdown,
    scoring_breakdown: scoringBreakdown,
    glossary_used: glossary.length,
    text_chars_analyzed: proposalText.length,
  }
}

// ── POST /api/rfps/:id/proposals/evaluate-all — batch AI evaluation ────────
apiRouter.post('/rfps/:id/proposals/evaluate-all', async (c) => {
  const rfpId = c.req.param('id')
  const db = c.env.DB
  try {
    const rfp = await db.prepare('SELECT * FROM rfps WHERE id=?').bind(rfpId).first<any>()
    if (!rfp) return c.json({ error: 'RFP not found' }, 404)

    const { results: proposals } = await db.prepare(`
      SELECT p.*, v.name as vendor_name FROM proposals p
      LEFT JOIN vendors v ON p.vendor_id = v.id
      WHERE p.rfp_id=? ORDER BY p.id ASC
    `).bind(rfpId).all<any>()

    if (!proposals.length) return c.json({ ok: true, evaluated: 0, message: 'No proposals to evaluate' })

    const results: any[] = []
    for (const proposal of proposals) {
      try {
        const evalData = await evaluateProposal(proposal, rfp, c.env)
        await db.prepare(`
          UPDATE proposals SET
            evaluation_data=?, ai_total_score=?, ai_recommendation=?,
            ai_validation_status=?, ai_evaluated_at=datetime('now'),
            ai_compliance_score=?, ai_quality_score=?, ai_commercial_score=?,
            updated_at=datetime('now')
          WHERE id=?
        `).bind(
          JSON.stringify(evalData),
          evalData.total_score,
          evalData.recommendation,
          evalData.validation_status,
          evalData.compliance_score,
          evalData.quality_score,
          evalData.commercial_score,
          proposal.id
        ).run()
        results.push({ id: proposal.id, vendor: proposal.vendor_name, score: evalData.total_score, recommendation: evalData.recommendation })
      } catch (e: any) {
        results.push({ id: proposal.id, vendor: proposal.vendor_name, error: e?.message || 'failed' })
      }
    }
    return c.json({ ok: true, evaluated: results.length, results })
  } catch (e: any) {
    return c.json({ ok: false, error: e?.message }, 500)
  }
})

// ── POST /api/rfps/:rfpId/proposals/:proposalId/evaluate — single evaluation ─
apiRouter.post('/rfps/:rfpId/proposals/:proposalId/evaluate', async (c) => {
  const rfpId = c.req.param('rfpId')
  const proposalId = c.req.param('proposalId')
  const db = c.env.DB
  try {
    const rfp = await db.prepare('SELECT * FROM rfps WHERE id=?').bind(rfpId).first<any>()
    if (!rfp) return c.json({ error: 'RFP not found' }, 404)
    const proposal = await db.prepare(`
      SELECT p.*, v.name as vendor_name FROM proposals p
      LEFT JOIN vendors v ON p.vendor_id = v.id WHERE p.id=? AND p.rfp_id=?
    `).bind(proposalId, rfpId).first<any>()
    if (!proposal) return c.json({ error: 'Proposal not found' }, 404)

    const evalData = await evaluateProposal(proposal, rfp, c.env)
    await db.prepare(`
      UPDATE proposals SET
        evaluation_data=?, ai_total_score=?, ai_recommendation=?,
        ai_validation_status=?, ai_evaluated_at=datetime('now'),
        ai_compliance_score=?, ai_quality_score=?, ai_commercial_score=?,
        updated_at=datetime('now')
      WHERE id=?
    `).bind(
      JSON.stringify(evalData), evalData.total_score, evalData.recommendation,
      evalData.validation_status, evalData.compliance_score, evalData.quality_score,
      evalData.commercial_score, proposal.id
    ).run()
    return c.json({ ok: true, ...evalData })
  } catch (e: any) {
    return c.json({ ok: false, error: e?.message }, 500)
  }
})

// ── POST /api/rfps/:rfpId/proposals/:proposalId/evaluate-budget ──────────────
// Standalone budget enrichment: runs sidecar OCR on the commercial PDF attachment,
// then runs the 6-step analytical LLM prompt. Designed as a separate request so
// the main /evaluate stays well within the 30s Worker CPU limit.
// The frontend should fire this call immediately after /evaluate returns.
apiRouter.post('/rfps/:rfpId/proposals/:proposalId/evaluate-budget', async (c) => {
  const rfpId = c.req.param('rfpId')
  const proposalId = c.req.param('proposalId')
  const db = c.env.DB
  try {
    const proposal = await db.prepare(`
      SELECT p.*, v.name as vendor_name FROM proposals p
      LEFT JOIN vendors v ON p.vendor_id = v.id WHERE p.id=? AND p.rfp_id=?
    `).bind(proposalId, rfpId).first<any>()
    if (!proposal) return c.json({ error: 'Proposal not found' }, 404)

    let budget = { amount: null as number | null, currency: 'AED', confidence: 0.0 }
    let duration: string | null = proposal.proposed_duration || null

    // ── Step 1: Identify the commercial PDF attachment ────────────────────────
    let commercialText = ''
    const atts: any[] = JSON.parse(proposal.proposal_attachments || '[]')
    const commercialAtt = atts.find((a: any) =>
      (a.label || '').toLowerCase().includes('commercial') ||
      (a.filename || '').toLowerCase().includes('commercial')
    ) || atts[0]

    if (commercialAtt?.r2_key) {
      const pdfUrl = `https://a7b32759-e743-4139-9bb0-4bae44886667.vip.gensparksite.com/api/proposals/pdf/${encodeURIComponent(commercialAtt.r2_key)}`
      try {
        const result = await callSidecar(pdfUrl, c.env, 100)
        if (result && result.chars >= 100) commercialText = result.text
      } catch (_) {}
    }

    // Fall back to stored text fields if sidecar returned nothing
    const proposalText = commercialText.length > 100 ? commercialText : extractProposalText(proposal)
    if (proposalText.length < 50) {
      return c.json({ ok: false, error: 'No text extracted from commercial PDF', budget: null, duration })
    }

    // ── Step 2: 6-step analytical budget prompt ───────────────────────────────
    const rawBudget = await callLLM(
      'You are a financial extraction analyst. I will provide you with the raw OCR text of a commercial proposal.',
      `Your task is to find, categorize, and sum all costs to calculate the total budget.
Do not assume any specific section titles (like "MVP1" or "Tableau"). Instead, use the following logical methodology to parse the text dynamically:

**Step 1: Identify all monetary values**
- Scan the entire text and locate every figure that includes a currency symbol or code (e.g., AED, USD, EUR, SAR, $, etc.).
- For each monetary value, read the 3-5 lines of text immediately before and after it to understand its context.

**Step 2: Group monetary values into cost clusters**
- **Implementation/Phase Clusters**: If a monetary value appears after a long list of technical tasks, deliverables, or work items, treat that value as the total cost for that specific phase or workstream. There may be multiple such clusters (e.g., Phase 1, Phase 2).
- **Auxiliary One-Time Clusters**: If a monetary value appears near words like "License", "Subscription", "Training", "Workshop", "Enablement", or "Setup", treat it as an additional one-time fixed cost.
- **Recurring Support Clusters**: If a monetary value appears near words like "Support", "Maintenance", "Managed Services", or contains phrases like "per month", "monthly", or "hours per month", calculate the total monthly recurring cost by summing the individual line items in that cluster.

**Step 3: Determine the project timeline (for recurring costs)**
- Scan the text for any phrases indicating duration (e.g., "in X months", "X weeks", "quarter", "by QX").
- If the total project duration or support period is explicitly stated, use that.
- If the support duration is missing, use a baseline assumption of 12 months, but clearly flag this as an assumption in your output.

**Step 4: Detect currency and tax rules**
- Identify the dominant currency code/symbol used.
- Look for mentions of "VAT", "GST", or "tax" and note the percentage. If found, calculate the inclusive total.

**Step 5: Perform the calculations**
- **Total Fixed (One-Time) Budget** = Sum of all Implementation/Phase clusters + Sum of all Auxiliary one-time clusters.
- **Total Budget with Support** = Total Fixed Budget + (Monthly Recurring Support Cost * number of support months, or the 12-month baseline assumption).
- **Tax-Inclusive Total** = Add the detected tax percentage to the final total.

**Step 6: Output your findings as JSON**
Return ONLY valid JSON (no markdown, no extra text):
{
  "clusters": [
    {"description": "<cluster name>", "type": "fixed|recurring_monthly", "amount": <number>, "currency": "<AED|USD|EUR>", "how_identified": "<brief explanation>"}
  ],
  "total_fixed": <number or null>,
  "total_with_support": <number or null>,
  "support_months": <number>,
  "support_months_assumed": <true|false>,
  "tax_rate": <0.05 for 5% VAT, or 0 if none>,
  "tax_inclusive_total": <number or null>,
  "currency": "<dominant currency>",
  "duration": "<e.g. 3.5 months or next quarter>"|null,
  "confidence": <0.0-1.0>,
  "missing_info": ["<list any missing data that prevents definitive answer>"]
}

**Here is the OCR text to analyze:**
${proposalText.slice(0, 14000)}`,
      c.env, 'gpt-5-mini', 1200
    )

    // ── Step 3: parse LLM response ────────────────────────────────────────────
    const jsonMatch = rawBudget.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      const bestTotal = parsed.tax_inclusive_total || parsed.total_with_support || parsed.total_fixed
      if (bestTotal && bestTotal > 0 && bestTotal < 1e10) {
        budget = {
          amount: Math.round(bestTotal),
          currency: parsed.currency || 'AED',
          confidence: Math.min(1.0, Math.max(0.0, parseFloat(parsed.confidence) || 0.5)),
        }
      }
      if (parsed.duration && typeof parsed.duration === 'string') duration = parsed.duration

      // ── Step 4: patch the saved evaluation_data and top-level columns ─────
      const rfpBudget = 0  // commercial score recalc happens at main eval time
      if (budget.amount) {
        // Update proposal top-level columns
        await db.prepare(`
          UPDATE proposals SET
            budget_amount=?, budget_currency=?, proposed_duration=?,
            updated_at=datetime('now')
          WHERE id=?
        `).bind(budget.amount, budget.currency, duration, proposal.id).run()

        // Also patch evaluation_data JSON so the UI reflects the new budget
        try {
          let evalData: any = {}
          try { evalData = JSON.parse(proposal.evaluation_data || '{}') } catch (_) {}
          evalData.budget_extracted = budget.amount
          evalData.budget_currency = budget.currency
          evalData.budget_confidence = budget.confidence
          evalData.duration_extracted = duration
          evalData.budget_clusters = parsed.clusters || []
          evalData.budget_missing_info = parsed.missing_info || []
          await db.prepare(`UPDATE proposals SET evaluation_data=? WHERE id=?`)
            .bind(JSON.stringify(evalData), proposal.id).run()
        } catch (_) {}
      }

      return c.json({
        ok: true,
        budget_amount: budget.amount,
        budget_currency: budget.currency,
        budget_confidence: budget.confidence,
        duration,
        clusters: parsed.clusters || [],
        missing_info: parsed.missing_info || [],
        text_source: commercialText.length > 100 ? 'commercial_pdf_ocr' : 'stored_text',
        text_chars: proposalText.length,
      })
    }

    return c.json({ ok: false, error: 'LLM returned no parseable JSON', raw: rawBudget.slice(0, 300) })
  } catch (e: any) {
    return c.json({ ok: false, error: e?.message }, 500)
  }
})

// ── GET /api/rfps/:rfpId/proposals/:proposalId/evaluation — fetch results ────
apiRouter.get('/rfps/:rfpId/proposals/:proposalId/evaluation', async (c) => {
  const proposalId = c.req.param('proposalId')
  const proposal = await c.env.DB.prepare('SELECT * FROM proposals WHERE id=?').bind(proposalId).first<any>()
  if (!proposal) return c.json({ error: 'Not found' }, 404)
  let evalData = null
  try { evalData = proposal.evaluation_data ? JSON.parse(proposal.evaluation_data) : null } catch (_) {}
  return c.json({
    proposal_id: proposal.id,
    ai_total_score: proposal.ai_total_score,
    ai_recommendation: proposal.ai_recommendation,
    ai_validation_status: proposal.ai_validation_status,
    ai_evaluated_at: proposal.ai_evaluated_at,
    evaluation_data: evalData,
  })
})

// ── POST /api/rfps/:rfpId/proposals/:proposalId/manual-override ──────────────
apiRouter.post('/rfps/:rfpId/proposals/:proposalId/manual-override', async (c) => {
  const proposalId = c.req.param('proposalId')
  const db = c.env.DB
  try {
    const body = await c.req.json()
    const proposal = await db.prepare('SELECT * FROM proposals WHERE id=?').bind(proposalId).first<any>()
    if (!proposal) return c.json({ error: 'Not found' }, 404)
    let evalData: any = {}
    try { evalData = JSON.parse(proposal.evaluation_data || '{}') } catch (_) {}

    if (body.manual_budget) {
      const rfp = await db.prepare('SELECT budget FROM rfps WHERE id=?').bind(c.req.param('rfpId')).first<any>()
      const rfpBudget = parseFloat((rfp?.budget || '').replace(/[^0-9.]/g, '')) || 0
      const commercialScore = rfpBudget > 0 ? Math.min(100, (rfpBudget / body.manual_budget) * 100) : 70
      evalData.budget_extracted = body.manual_budget
      evalData.budget_confidence = 1.0
      evalData.commercial_score = Math.round(commercialScore)
      evalData.validation_status = 'MANUALLY_VALIDATED'
      // Recalculate total
      const cs = evalData.compliance_score || 0
      const qs = evalData.quality_score || 0
      evalData.total_score = Math.round(((cs * 0.3) + (qs * 0.5) + (commercialScore * 0.2)) * 10) / 10
      // Update recommendation
      if (evalData.mandatory_failed?.length > 0) evalData.recommendation = 'NOT RECOMMENDED'
      else if (evalData.total_score >= 80) evalData.recommendation = 'RECOMMENDED'
      else if (evalData.total_score >= 60) evalData.recommendation = 'CONDITIONAL'
      else evalData.recommendation = 'NOT RECOMMENDED'
    }

    await db.prepare(`
      UPDATE proposals SET evaluation_data=?, ai_total_score=?, ai_recommendation=?,
      ai_validation_status=?, ai_commercial_score=?, updated_at=datetime('now') WHERE id=?
    `).bind(JSON.stringify(evalData), evalData.total_score, evalData.recommendation,
      evalData.validation_status, evalData.commercial_score, proposalId).run()

    return c.json({ ok: true, ...evalData })
  } catch (e: any) {
    return c.json({ ok: false, error: e?.message }, 500)
  }
})

// ── POST /api/rfps/:id/ingest — extract requirement glossary from RFP text ───
apiRouter.post('/rfps/:id/ingest', async (c) => {
  const rfpId = c.req.param('id')
  const db = c.env.DB
  try {
    const rfp = await db.prepare('SELECT * FROM rfps WHERE id=?').bind(rfpId).first<any>()
    if (!rfp) return c.json({ error: 'RFP not found' }, 404)
    const rfpText = [rfp.content || '', rfp.scope || '', rfp.tech_requirements || '', rfp.objectives || '', rfp.arch_doc_text || '', rfp.brd_doc_text || '']
      .join('\n').replace(/<[^>]+>/g, ' ').slice(0, 12000)

    const raw = await callLLM(
      'You are a procurement analyst. Extract structured requirements from an RFP document.',
      `Extract all vendor requirements from this RFP text. For each requirement, determine if it is mandatory (contains "must", "shall", "required", "mandatory"). Return a JSON array of objects: [{"id":"req_1","text":"...","mandatory":true/false},...]. Extract up to 20 requirements. Return ONLY the JSON array.\n\nRFP TEXT:\n${rfpText}`,
      c.env, 'gpt-5-mini', 2000
    )
    let glossary: any[] = []
    try {
      const match = raw.match(/\[[\s\S]*\]/)
      if (match) glossary = JSON.parse(match[0])
    } catch (_) {}

    if (!glossary.length) {
      // Fallback: regex extraction
      const lines = rfpText.split(/[\n\r]+/).filter(l => l.trim().length > 20)
      let id = 0
      for (const line of lines) {
        const lo = line.toLowerCase()
        if (/must|shall|required|mandatory|criteria|scope|objective/.test(lo) || /^[-•*\d]/.test(line.trim())) {
          glossary.push({ id: `req_${++id}`, text: line.trim().slice(0, 300), mandatory: /must|shall/.test(lo) })
          if (id >= 20) break
        }
      }
    }
    await db.prepare(`UPDATE rfps SET requirement_glossary=?, updated_at=datetime('now') WHERE id=?`).bind(JSON.stringify(glossary), rfpId).run()
    return c.json({ ok: true, requirements: glossary.length, glossary })
  } catch (e: any) {
    return c.json({ ok: false, error: e?.message }, 500)
  }
})

// ── GET /api/proposals/pdf/:key — with Content-Disposition: attachment ────────
// (Also update the existing endpoint to support download mode)

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

  // Declined vendor check — requires vendor_code query param to resolve vendor
  const vendorCode = (c.req.query('vendor_code') || '').trim().toUpperCase()
  if (vendorCode) {
    const codeMatch = vendorCode.match(/^RFP-(\d+)-V(\d+)$/)
    if (codeMatch && Number(codeMatch[1]) === Number(rfpId)) {
      const vId = Number(codeMatch[2])
      const rv = await c.env.DB.prepare(
        `SELECT status FROM rfp_vendors WHERE rfp_id=? AND vendor_id=?`
      ).bind(rfpId, vId).first<any>()
      if (rv?.status === 'declined') {
        return c.json({ declined: true }, 403)
      }
    }
  }

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

  // Early declined-vendor check before processing form data
  // We need to read the vendor_code from formData — do a quick peek
  // (This is checked again below after full vendor resolution)
  // Full check happens after vendorId is resolved below.

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

    // Declined vendor check — block portal submission
    const rvStatus = await c.env.DB.prepare(
      `SELECT status FROM rfp_vendors WHERE rfp_id=? AND vendor_id=?`
    ).bind(rfpId, vendorId).first<any>()
    if (rvStatus?.status === 'declined') {
      return c.json({ declined: true }, 403)
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

// buildRFPPrompt — pure function, returns {systemPrompt, userPrompt} without calling the LLM.
// Used by the streaming generate route. generateRFPWithLLM wraps it for batch/test usage.
function buildRFPPrompt(data: any, archDocText: string, brdDocText: string, scoringMatrixJson?: string | null): { systemPrompt: string; userPrompt: string } {
  // Use a relative URL so the letterhead works on any domain (local dev, staging, prod).
  // The browser resolves it against the page origin when rendering the preview.
  // For PDF export the frontend inlines it as a base64 data URI before rendering.
  const LETTERHEAD_BG_URL = '/api/proposals/pdf/letterhead/bg_a4.png'

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
   ${scoringMatrixJson ? (() => {
     try {
       const matrix = JSON.parse(scoringMatrixJson)
       if (Array.isArray(matrix) && matrix.length > 0) {
         const rows = matrix.map((r: any) => `   - ${r.criterion}: ${r.weight}% — ${r.description || 'as described'}`).join('\n')
         return `USE EXACTLY THESE criteria from the procurement manager (do not change weights, do not add or remove criteria — reproduce them verbatim in the table):\n${rows}\n   Total weight must equal exactly ${matrix.reduce((s: number, r: any) => s + (Number(r.weight)||0), 0)}%.`
       }
     } catch(_) {}
     return 'Table with columns: Criterion | Weight % | Detailed Description. Weights must sum to exactly 100%. Tailor all criterion names and descriptions specifically to this project domain.'
   })() : 'Table with columns: Criterion | Weight % | Detailed Description. Weights must sum to exactly 100%. Tailor all criterion names and descriptions specifically to this project domain.'}

6. VENDOR QUALIFICATION REQUIREMENTS
   Table with columns: Requirement Category | Minimum Standard | Evidence Required.
   Derive qualification requirements specifically from the project category "${data.category || 'IT & Digital Transformation'}" and the scope described above.
   Cover: minimum years of relevant experience in this specific domain, similar government or large enterprise projects in MENA, required team certifications and roles, financial standing (minimum annual revenue or balance sheet), legal registration and compliance requirements.
   Do NOT copy requirements from a different project domain — base every row on the actual scope and technical requirements stated above.

7. SUBMISSION REQUIREMENTS AND TIMELINE
   First: a full procurement milestone TABLE using the exact dates provided above in the PROCUREMENT MILESTONE DATES section. All 8 milestones must appear with their exact dates.
   Columns: Milestone | Date | Responsible Party.
   Then: a bulleted list of all documents required in the submission package (technical proposal, financial proposal, implementation plan Gantt chart, team CVs and certifications, company profile and registration, audited financial statements for last 2 years, security and data compliance statement, three client references with contact details).
   Then: submission instructions — Submission email: procurement@cpc-rfp.website. State file format requirements (PDF, max 50MB per file, English language), naming convention for files, and that late submissions will not be accepted.

8. TERMS AND CONDITIONS
   8 to 12 bullet points covering: confidentiality obligations (all RFP content and project details are confidential), intellectual property (all developed deliverables, code, and documentation vest entirely in CPC upon payment), right to reject all proposals without explanation, disqualification grounds (misrepresentation, conflict of interest, non-compliance with requirements), no guarantee of award, vendor costs for proposal preparation not reimbursable, governing law (laws of Abu Dhabi Emirate and the UAE), language of contract (English and Arabic, Arabic prevailing in case of discrepancy), subcontracting restrictions (prior written CPC approval required), conflict of interest declaration required with submission, CPC's right to audit vendor premises and references before award.

REMINDER: Do NOT reference any document filename, BRD name, or attached file anywhere in the output. All content must be stated inline as if you wrote it yourself.`

  return { systemPrompt, userPrompt }
}

async function generateRFPWithLLM(data: any, archDocText: string, brdDocText: string, env: any, scoringMatrixJson?: string | null): Promise<string> {
  const { systemPrompt, userPrompt } = buildRFPPrompt(data, archDocText, brdDocText, scoringMatrixJson)
  const llmContent = await callLLM(systemPrompt, userPrompt, env, 'gpt-5-mini', 30000)
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
  // Build a formatted XLSX file with Q&A data.
  // Columns C (Question) and D (Answer) use wrapText=true so long text is readable.
  // Vendor column (B) already contains anonymized participant codes (caller's responsibility).
  const rows: string[][] = [
    ['Ref', 'Participant', 'Question', 'Answer', 'Status'],
    ...questions.map((q: any, i: number) => [
      String(i + 1),
      q.vendor_name || 'Participant',
      q.question || '',
      q.answer || '',
      q.emailed_at ? 'Sent' : (q.published ? 'Approved' : 'Draft'),
    ])
  ]

  // ── Shared strings ────────────────────────────────────────────────────────
  const sharedStrings: string[] = []
  const ssMap = new Map<string, number>()
  const getSSIdx = (s: string) => {
    if (!ssMap.has(s)) { ssMap.set(s, sharedStrings.length); sharedStrings.push(s) }
    return ssMap.get(s)!
  }

  // ── Styles — two xf entries:
  //   xfId 0 = default (header + Ref/Participant/Status cols)
  //   xfId 1 = wrapText=true (Question col C, Answer col D)
  // ─────────────────────────────────────────────────────────────────────────
  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`
    + `<fonts count="2">`
    +   `<font><sz val="11"/><name val="Calibri"/></font>`
    +   `<font><b/><sz val="11"/><name val="Calibri"/></font>`
    + `</fonts>`
    + `<fills count="2">`
    +   `<fill><patternFill patternType="none"/></fill>`
    +   `<fill><patternFill patternType="gray125"/></fill>`
    + `</fills>`
    + `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>`
    + `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>`
    + `<cellXfs count="3">`
    +   `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>`
    +   `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"><alignment wrapText="1" vertical="top"/></xf>`
    +   `<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0"><alignment wrapText="1" vertical="top"/></xf>`
    + `</cellXfs>`
    + `</styleSheet>`
  // xf index 0 = normal, 1 = wrapText+top, 2 = bold+wrapText+top (header row)

  const cols = ['A','B','C','D','E']
  let sheetRows = ''
  rows.forEach((row, ri) => {
    const isHeader = ri === 0
    const cells = row.map((val, ci) => {
      const ref = `${cols[ci]}${ri+1}`
      const idx = getSSIdx(val)
      // Apply wrapText style to Question (ci=2) and Answer (ci=3) cells; bold wrap for header
      let styleAttr = ''
      if (isHeader) {
        styleAttr = ' s="2"'          // bold + wrapText
      } else if (ci === 2 || ci === 3) {
        styleAttr = ' s="1"'          // wrapText only
      }
      return `<c r="${ref}" t="s"${styleAttr}><v>${idx}</v></c>`
    }).join('')
    sheetRows += `<row r="${ri+1}">${cells}</row>`
  })

  // Column widths: A=6, B=22, C=55, D=55, E=12
  const colDefs = `<cols>`
    + `<col min="1" max="1" width="6" customWidth="1"/>`
    + `<col min="2" max="2" width="22" customWidth="1"/>`
    + `<col min="3" max="3" width="55" customWidth="1"/>`
    + `<col min="4" max="4" width="55" customWidth="1"/>`
    + `<col min="5" max="5" width="12" customWidth="1"/>`
    + `</cols>`

  const ssXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${sharedStrings.length}" uniqueCount="${sharedStrings.length}">`
    + sharedStrings.map(s => `<si><t xml:space="preserve">${escXml(s)}</t></si>`).join('')
    + `</sst>`

  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`
    + colDefs
    + `<sheetData>${sheetRows}</sheetData>`
    + `</worksheet>`

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">`
    + `<sheets><sheet name="Q&amp;A" sheetId="1" r:id="rId1"/></sheets>`
    + `</workbook>`

  const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
    + `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>`
    + `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>`
    + `<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`
    + `</Relationships>`

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
    + `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>`
    + `<Default Extension="xml" ContentType="application/xml"/>`
    + `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>`
    + `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
    + `<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>`
    + `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>`
    + `</Types>`

  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': encodeUtf8(contentTypesXml),
    '_rels/.rels': encodeUtf8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
      + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
      + `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>`
      + `</Relationships>`
    ),
    'xl/workbook.xml': encodeUtf8(workbookXml),
    'xl/_rels/workbook.xml.rels': encodeUtf8(relsXml),
    'xl/worksheets/sheet1.xml': encodeUtf8(sheetXml),
    'xl/sharedStrings.xml': encodeUtf8(ssXml),
    'xl/styles.xml': encodeUtf8(stylesXml),
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
  to: string, subject: string, bodyText: string, rfp: any, env?: any, pdfBase64?: string, pdfFilenameHint?: string
): Promise<{ ok: boolean; id?: string; error?: string; simulated?: boolean }> {
  const toAddr = (to || '').toLowerCase().trim()
  if (!toAddr.endsWith('@andersenlab.com')) {
    return { ok: true, id: 'simulated-' + Date.now(), simulated: true }
  }

  const RESEND_API_KEY = env?.RESEND_API_KEY || (globalThis as any).RESEND_API_KEY || ''
  if (!RESEND_API_KEY) {
    return { ok: false, error: 'RESEND_API_KEY not configured' }
  }

  // ── CPC Brandbook Email Template ──────────────────────────────────────────
  // Colors: --cpc-gold #BA9765 | --cpc-gold-deep #745B35 | --cpc-ivory #FBF8F2
  //         --cpc-ink #1B1712 | --cpc-line #E7DFCE | --cpc-gold-tint #F5EFE3
  const safeBody = bodyText.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  const bodyHtmlContent = safeBody.replace(/\n/g,'<br>')
  const htmlBody = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>CPC Procurement</title></head>
<body style="margin:0;padding:0;background:#F1F1F1;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F1F1F1;padding:32px 0">
  <tr><td align="center">
    <table width="620" cellpadding="0" cellspacing="0" border="0" style="max-width:620px;width:100%">

      <!-- ── Header ── -->
      <tr>
        <td style="background:#1B1712;border-radius:12px 12px 0 0;padding:28px 36px">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="padding-right:16px;vertical-align:middle;width:60px">
                <img src="data:image/jpeg;base64,${emblemPngBase64}" alt="CPC Emblem" width="52" height="72" style="display:block;border:0;outline:none;object-fit:contain">
              </td>
              <td style="vertical-align:middle">
                <div style="font-family:Georgia,'Times New Roman',serif;font-size:19px;font-weight:700;color:#BA9765;letter-spacing:0.02em;line-height:1.2">Crown Prince's Court</div>
                <div style="font-family:'Courier New',monospace;font-size:9px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:#E9DCC4;margin-top:4px;opacity:0.85">PROCUREMENT &amp; CONTRACTING</div>
              </td>
              <td align="right" style="vertical-align:middle">
                <div style="font-family:'Courier New',monospace;font-size:9px;color:#BA9765;letter-spacing:0.12em;text-transform:uppercase;opacity:0.75">Abu Dhabi, UAE</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- ── Gold rule ── -->
      <tr>
        <td style="background:#BA9765;height:3px;font-size:0;line-height:0">&nbsp;</td>
      </tr>

      <!-- ── Body ── -->
      <tr>
        <td style="background:#FFFFFF;padding:36px 36px 28px;border-left:1px solid #E7DFCE;border-right:1px solid #E7DFCE">
          <div style="font-size:14px;line-height:1.75;color:#1B1712">${bodyHtmlContent}</div>
        </td>
      </tr>

      <!-- ── Footer ── -->
      <tr>
        <td style="background:#FBF8F2;border:1px solid #E7DFCE;border-top:none;border-radius:0 0 12px 12px;padding:20px 36px">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td>
                <div style="font-family:'Courier New',monospace;font-size:9px;letter-spacing:0.14em;text-transform:uppercase;color:#745B35;font-weight:700;margin-bottom:4px">Official Procurement Correspondence</div>
                <div style="font-size:11px;color:#4A4238;line-height:1.5">Crown Prince's Court &nbsp;·&nbsp; Abu Dhabi, UAE<br>
                <a href="mailto:procurement@cpc-rfp.website" style="color:#BA9765;text-decoration:none">procurement@cpc-rfp.website</a></div>
              </td>
              <td align="right" style="vertical-align:bottom">
                <div style="font-family:'Courier New',monospace;font-size:8px;color:#9ca3af;letter-spacing:0.06em;text-transform:uppercase">AI RFP Management System</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- ── Disclaimer ── -->
      <tr>
        <td style="padding:14px 0 0;text-align:center">
          <div style="font-size:10px;color:#9ca3af;line-height:1.5">This is an official procurement communication from the Crown Prince's Court.<br>
          Please do not reply to this message unless instructed.</div>
        </td>
      </tr>

    </table>
  </td></tr>
</table>
</body>
</html>`

  // Attach PDF if provided (base64 string from client-side html2pdf generation)
  const attachments: any[] = pdfBase64
    ? [{ filename: pdfFilenameHint || 'RFP_Document.pdf', content: pdfBase64 }]
    : []

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

// ============================================================
// SETTINGS — GET/PUT categories and procurement email
// ============================================================
apiRouter.get('/settings', async (c) => {
  try {
    await c.env.DB.prepare(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`).run()
    const rows = await c.env.DB.prepare(`SELECT key, value FROM settings`).all()
    const out: Record<string,string> = {}
    for (const r of (rows.results||[])) { out[(r as any).key] = (r as any).value }
    return c.json(out)
  } catch(e:any) { return c.json({}, 200) }
})

apiRouter.put('/settings', async (c) => {
  try {
    await c.env.DB.prepare(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`).run()
    const body = await c.req.json()
    for (const [k, v] of Object.entries(body)) {
      await c.env.DB.prepare(`INSERT INTO settings (key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`).bind(k, String(v)).run()
    }
    return c.json({ ok: true })
  } catch(e:any) { return c.json({ error: e.message }, 500) }
})

apiRouter.get('/settings/categories', async (c) => {
  try {
    await c.env.DB.prepare(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`).run()
    const row = await c.env.DB.prepare(`SELECT value FROM settings WHERE key='categories'`).first<any>()
    const cats = row ? JSON.parse(row.value) : ['IT & Technology','Construction','Professional Services','Healthcare','Facilities','Legal','Finance','Other']
    return c.json(cats)
  } catch(e:any) { return c.json(['IT & Technology','Construction','Professional Services','Healthcare','Facilities','Legal','Finance','Other'], 200) }
})

apiRouter.put('/settings/categories', async (c) => {
  try {
    await c.env.DB.prepare(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`).run()
    const cats = await c.req.json()
    await c.env.DB.prepare(`INSERT INTO settings (key,value) VALUES('categories',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`).bind(JSON.stringify(cats)).run()
    return c.json({ ok: true })
  } catch(e:any) { return c.json({ error: e.message }, 500) }
})

// ============================================================
// VENDOR PROCUREMENT HISTORY
// ============================================================
apiRouter.get('/vendors/:id/history', async (c) => {
  try {
    const id = c.req.param('id')
    const rows = await c.env.DB.prepare(
      `SELECT r.id, r.title, r.ref_number, r.stage, rp.submitted_at, rp.awarded_at
       FROM rfp_vendors rv
       JOIN rfps r ON r.id = rv.rfp_id
       LEFT JOIN rfp_proposals rp ON rp.rfp_id=rv.rfp_id AND rp.vendor_id=rv.vendor_id
       WHERE rv.vendor_id=? ORDER BY r.created_at DESC LIMIT 50`
    ).bind(id).all()
    return c.json(rows.results||[])
  } catch(e:any) { return c.json([], 200) }
})

// ============================================================
// CONFIRMATION EMAIL ON SUBMISSION
// ============================================================
apiRouter.post('/submit/:rfpId/confirmation', async (c) => {
  try {
    const rfpId = c.req.param('rfpId')
    const { vendor_email, vendor_name } = await c.req.json()
    const rfp = await c.env.DB.prepare('SELECT title, ref_number FROM rfps WHERE id=?').bind(rfpId).first<any>()
    if (!rfp) return c.json({ error: 'RFP not found' }, 404)
    // Log confirmation (email would be sent via Mailgun/SendGrid in production)
    console.log(`Confirmation: ${vendor_name} <${vendor_email}> submitted proposal for ${rfp.ref_number} - ${rfp.title}`)
    return c.json({ ok: true, message: 'Confirmation noted' })
  } catch(e:any) { return c.json({ error: e.message }, 500) }
})
