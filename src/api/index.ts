import { Hono } from 'hono'
import { initDb, seedVendors } from '../db/seed'
import type { Bindings } from '../types'
// emblem-data import removed — email template now uses inline SVG (no external image dependency)

// WORKER_VERSION: bump this to force Cloudflare to recognise the new bundle
const WORKER_VERSION = '2026-07-29-v52'  // v52: PDF fixes — correct page-break-after, robust footer regex (both property orders), single+double quote padding strip

// ── PDF Sidecar ────────────────────────────────────────────────────────────────
// Calls the Python/pdfplumber sidecar running at api.andersenlab.com.
// The sidecar fetches the PDF from the given URL and returns extracted text.
// Requires env.PDF_SIDECAR_URL and env.PDF_SIDECAR_SECRET to be set as Worker secrets.

// SYNC mode: waits for OCR result (use only for small/text-layer PDFs < 3MB)
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

// ASYNC mode: fires sidecar with callback_url, returns immediately (202).
// The sidecar will POST OCR results back to callbackUrl when done.
// Returns true if the request was accepted, false on config/network error.
async function callSidecarAsync(
  pdfUrl: string,
  env: any,
  maxPages: number,
  callbackUrl: string,
  callbackSecret: string
): Promise<boolean> {
  const sidecarUrl = env?.PDF_SIDECAR_URL || (globalThis as any).PDF_SIDECAR_URL || ''
  const sidecarSecret = env?.PDF_SIDECAR_SECRET || (globalThis as any).PDF_SIDECAR_SECRET || ''
  if (!sidecarUrl || !sidecarSecret) {
    console.warn('[sidecar-async] PDF_SIDECAR_URL or PDF_SIDECAR_SECRET not configured')
    return false
  }
  try {
    const res = await fetch(`${sidecarUrl}/extract-pdf`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${sidecarSecret}`,
      },
      body: JSON.stringify({
        pdf_url: pdfUrl,
        max_pages: maxPages,
        callback_url: callbackUrl,
        callback_secret: callbackSecret,
      }),
    })
    if (!res.ok) {
      const err = await res.text().catch(() => '')
      console.error(`[sidecar-async] HTTP ${res.status}: ${err.slice(0, 200)}`)
      return false
    }
    const body: any = await res.json()
    console.log(`[sidecar-async] accepted async_mode=${body.async_mode} method=${body.method}`)
    return true
  } catch (e: any) {
    console.error('[sidecar-async] fetch error:', e.message)
    return false
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
    const bucket: R2Bucket | undefined = (c.env as any).PROPOSALS_BUCKET

    // --- 1. Purge R2 objects for all RFP-related prefixes ---
    // Collect all R2 keys under arch-docs/ and proposals/ then delete in batches
    const r2Prefixes = ['arch-docs/', 'proposals/']
    let r2Deleted = 0
    if (bucket) {
      for (const prefix of r2Prefixes) {
        let cursor: string | undefined = undefined
        do {
          const listed = await bucket.list({ prefix, limit: 1000, ...(cursor ? { cursor } : {}) })
          const keys = listed.objects.map((o: any) => o.key as string)
          if (keys.length > 0) {
            await Promise.all(keys.map((k: string) => bucket.delete(k)))
            r2Deleted += keys.length
          }
          cursor = listed.truncated ? (listed as any).cursor : undefined
        } while (cursor)
      }
    }

    // --- 2. Purge all DB tables in dependency order ---
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

    return c.json({ ok: true, message: 'All RFPs, documents, scores and evaluations cleared.', r2_deleted: r2Deleted })
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
// TOP VENDORS BY AWARDED CONTRACTS
// ============================================================
apiRouter.get('/stats/top-vendors', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT v.name, COUNT(p.id) as wins
      FROM proposals p
      JOIN vendors v ON p.vendor_id = v.id
      WHERE p.status = 'awarded'
      GROUP BY p.vendor_id, v.name
      ORDER BY wins DESC
      LIMIT 10
    `).all<{name:string, wins:number}>()
    return c.json(results || [])
  } catch {
    return c.json([])
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

// GET /rfps/:id/pdf — generate a real PDF via the Puppeteer render service on the sidecar VPS.
// Strips the LLM's page-div wrappers into a continuous HTML document, then calls
// POST https://api.andersenlab.com/pdf/render-pdf which returns application/pdf bytes.
// The letterhead is passed as a public URL so Puppeteer can fetch it directly.
// Falls back to the legacy print-HTML page if the render service is unavailable.
apiRouter.get('/rfps/:id/pdf', async (c) => {
  const id = c.req.param('id')
  const rfp = await c.env.DB.prepare('SELECT * FROM rfps WHERE id=?').bind(id).first()
  if (!rfp) return c.json({ error: 'Not found' }, 404)
  if (!(rfp as any).content) return c.json({ error: 'RFP has no generated content yet' }, 400)

  const safeRef = ((rfp as any).ref_number || String(id)).replace(/\//g, '_').replace(/[^a-zA-Z0-9_\-]/g, '')
  const filename = `Andersen_RFP_${safeRef}.pdf`
  const content = (rfp as any).content as string

  const renderUrl = c.env.PDF_RENDER_URL || (globalThis as any).PDF_RENDER_URL || ''
  const renderSecret = c.env.PDF_RENDER_SECRET || (globalThis as any).PDF_RENDER_SECRET || ''

  // ── Puppeteer path ────────────────────────────────────────────────────────
  // Version-gate: the render service must be v3+ to handle the new Andersen inline-HTML design.
  // v2 used format:'A4' + displayHeaderFooter:true + 72mm top margin → white-space bug.
  // v3 uses page.pdf({width:'794px',height:'1123px'}) + displayHeaderFooter:false + margin:0.
  // If the service reports v2 (or we can't reach it), skip to the browser-print fallback below.
  let renderServiceVersion = 0
  if (renderUrl && renderSecret) {
    try {
      const healthRes = await fetch(`${renderUrl}/`, {
        headers: { 'Authorization': `Bearer ${renderSecret}` },
        signal: AbortSignal.timeout(5000),
      }).catch(() => null)
      if (healthRes?.ok) {
        const health = await healthRes.json().catch(() => ({})) as any
        renderServiceVersion = parseInt(health?.version || '0', 10)
        console.log(`[pdf-render] Render service version: ${renderServiceVersion}`)
      }
    } catch (_) {}
  }

  if (renderUrl && renderSecret && renderServiceVersion >= 3) {
    try {
      // Andersen letterhead is now fully inline HTML inside every LLM page div.
      // No headerTemplate image is needed — letterhead_data_uri is intentionally empty.
      // (The old bg_a4.png CPC letterhead has been removed from R2.)
      const letterheadDataUri = ''

      // Fix 2 — Clean up LLM HTML for Puppeteer rendering.
      // Remove: background images (letterhead is now inline HTML — no headerTemplate),
      //         min-height:297mm (prevents extra blank space at bottom of each page div).
      // DO NOT strip overflow:hidden from page divs — they need it to clip content
      //   that would otherwise bleed over the absolute-positioned navy footer.
      // DO NOT strip page-break-after:always — the LLM inline styles already have it,
      //   and it is the only thing that forces one PDF page per LLM page div.
      const continuous = content
        // Remove background-image declarations (no longer needed — letterhead is inline HTML)
        .replace(/background-image\s*:\s*url\([^)]*\)\s*;?\s*/gi, '')
        .replace(/background-size\s*:[^;]+;\s*/gi, '')
        .replace(/background-repeat\s*:[^;]+;\s*/gi, '')
        .replace(/background-position\s*:[^;]+;\s*/gi, '')
        // Remove fixed min-height — prevents blank space at bottom of short pages
        .replace(/min-height\s*:\s*297mm\s*;?\s*/gi, '')
        // Remove only CPC/Crown Prince Court legacy footer text divs (plain text match — safe).
        // NOTE: Do NOT strip position:absolute+bottom:N divs — the Andersen navy footer
        //       uses exactly that pattern (position:absolute; bottom:0) and must be preserved.
        .replace(/<div[^>]*>[^<]*Crown Prince[^<]*<\/div>/gi, '')
        .replace(/<div[^>]*>[^<]*Confidential[^<]*Page \d+[^<]*<\/div>/gi, '')

      // Fix 3 — Remove legacy padding-top:72mm / padding-bottom:28mm from content wrappers.
      // Old LLM prompt used a background-image letterhead requiring 72mm top padding.
      // New Andersen letterhead is fully inline HTML — no padding compensation needed.
      const cleanHtml = continuous
        .replace(/(style=["'][^"'>]*?)padding-top\s*:\s*72mm\s*;?\s*/gi, '$1')
        .replace(/(style=["'][^"'>]*?)padding-bottom\s*:\s*28mm\s*;?\s*/gi, '$1')

      // Wrap in a minimal HTML document for Puppeteer.
      //
      // Page sizing strategy: we pass page_width/page_height to the render service
      // which calls page.pdf({ width:'794px', height:'1123px' }) — this is what controls
      // the actual paper size. The render service has displayHeaderFooter:false and
      // margin:0 so LLM inline headers/footers render without any Puppeteer overlay.
      //
      // The CSS here just provides a safety-net page-break between LLM page divs.
      // DO NOT set height/max-height/overflow:hidden on page divs in CSS — that would
      // clip content or cause all content to collapse into a single page.
      // DO NOT set @page size here — Puppeteer's page.pdf() width/height overrides it.
      const PAGE_W = 794
      const PAGE_H = 1123
      const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Calibri, 'Segoe UI', sans-serif; font-size: 11pt; color: #1A1A1A; background: #fff; width: ${PAGE_W}px; }
  /* Safety-net page break between LLM page divs.
     LLM structure: body > .rfp-doc > [page divs]
     Each page div already has page-break-after:always in its inline style. */
  body > div > div { page-break-after: always; page-break-inside: avoid; }
  body > div > div:last-child { page-break-after: avoid; }
  h1, h2, h3 { color: #1A1A1A; }
  table { border-collapse: collapse; width: 100%; }
  td, th { border: 1px solid #d1d5db; padding: 6px 10px; }
</style>
</head>
<body>${cleanHtml}</body>
</html>`

      const renderRes = await fetch(`${renderUrl}/render-pdf`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${renderSecret}`,
        },
        // page_width/page_height tell the render service to use page.pdf({width, height})
        // instead of format:'A4'. This matches LLM page div dimensions → 1 div = 1 PDF page.
        body: JSON.stringify({
          html,
          letterhead_data_uri: letterheadDataUri,
          page_width: `${PAGE_W}px`,
          page_height: `${PAGE_H}px`,
        }),
      })

      if (!renderRes.ok) {
        const errText = await renderRes.text().catch(() => 'unknown error')
        console.error(`[pdf-render] HTTP ${renderRes.status}: ${errText.slice(0, 200)}`)
        throw new Error(`Render service returned ${renderRes.status}`)
      }

      const pdfBytes = await renderRes.arrayBuffer()
      console.log(`[pdf-render] Generated PDF for RFP ${id}: ${pdfBytes.byteLength} bytes`)

      return new Response(pdfBytes, {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Cache-Control': 'no-cache',
        },
      })
    } catch (err: any) {
      console.error('[pdf-render] Puppeteer render failed, falling back to print-HTML:', err.message)
      // Fall through to legacy path below
    }
  }

  // ── Legacy fallback: print-ready HTML page (browser prints to PDF) ────────
  // Clean legacy CPC markers from stored content before serving to browser
  const cleanContent = content
    .replace(/background-image\s*:\s*url\([^)]*\)\s*;?\s*/gi, '')
    .replace(/background-size\s*:[^;]+;\s*/gi, '')
    .replace(/background-repeat\s*:[^;]+;\s*/gi, '')
    .replace(/background-position\s*:[^;]+;\s*/gi, '')
    .replace(/min-height\s*:\s*297mm\s*;?\s*/gi, '')
    // Do NOT strip position:absolute+bottom:N — Andersen navy footer uses this pattern.
    .replace(/<div[^>]*>[^<]*Crown Prince[^<]*<\/div>/gi, '')
    .replace(/<div[^>]*>[^<]*Confidential[^<]*Page \d+[^<]*<\/div>/gi, '')
  const printHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${((rfp as any).title || 'RFP').replace(/</g,'&lt;')}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #e8e8e8; font-family: Arial, 'Segoe UI', sans-serif; }
  .rfp-doc > div { display: block; box-shadow: 0 2px 12px rgba(0,0,0,0.18); margin: 20px auto !important; }
  @page { size: 794px 1123px; margin: 0; }
  @media print {
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    html, body { background: white; margin: 0; padding: 0; width: 794px; }
    .no-print { display: none !important; }
    .rfp-doc > div {
      box-shadow: none !important; margin: 0 !important;
      page-break-after: always; page-break-inside: avoid;
    }
    .rfp-doc > div:last-child { page-break-after: avoid; }
  }
</style>
</head>
<body>
<div class="no-print" style="position:fixed;top:0;left:0;right:0;z-index:9999;background:#020303;color:white;padding:10px 24px;display:flex;align-items:center;justify-content:space-between;font-family:Arial,sans-serif;font-size:13px;box-shadow:0 2px 8px rgba(0,0,0,0.3)">
  <div style="display:flex;align-items:center;gap:12px">
    <span style="font-weight:700;letter-spacing:0.05em">Andersen — RFP Document</span>
    <span style="opacity:0.6;font-size:11px">${((rfp as any).ref_number||'').replace(/</g,'&lt;')}</span>
  </div>
  <div style="display:flex;gap:10px">
    <button onclick="window.print()" style="background:#FFDB00;color:white;border:none;padding:7px 20px;border-radius:5px;font-size:13px;font-weight:600;cursor:pointer;">&#x2193; Save as PDF / Print</button>
    <button onclick="window.close()" style="background:transparent;color:#ccc;border:1px solid #555;padding:7px 14px;border-radius:5px;font-size:12px;cursor:pointer">Close</button>
  </div>
</div>
<div class="no-print" style="height:52px"></div>
${cleanContent}
<script>window.addEventListener('load', function() { setTimeout(function() { window.print(); }, 800); });</script>
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
    const refNum = 'AND/PROC/' + new Date().getFullYear() + '/' + String(Math.floor(Math.random()*9000)+1000)
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

  // v50: prefer scoring_matrix from request body (sent by browser from window._currentScoringMatrix)
  // so the matrix the user set in the modal is always used even if the DB write hasn't landed yet.
  // Fall back to the existing DB value if the body doesn't include one.
  const bodyScoringMatrix = body.scoring_matrix
    ? (typeof body.scoring_matrix === 'string' ? body.scoring_matrix : JSON.stringify(body.scoring_matrix))
    : null
  const existingScoringMatrix = bodyScoringMatrix || existingRfp?.scoring_matrix || null

  // Load settings (procurement_email, issuer_name, issuer_location) for prompt parameterisation
  const settingsRows = await c.env.DB.prepare(`SELECT key, value FROM settings`).all().catch(() => ({ results: [] }))
  const settings: Record<string,string> = {}
  for (const r of (settingsRows.results || [])) { settings[(r as any).key] = (r as any).value }

  // Build the prompts (same as generateRFPWithLLM but without calling callLLM yet)
  const { systemPrompt, userPrompt } = buildRFPPrompt(body, archDocText, brdDocText, existingScoringMatrix, settings)

  const apiKey = c.env?.OPENAI_API_KEY || (globalThis as any).OPENAI_API_KEY || ''
  const baseUrl = c.env?.OPENAI_BASE_URL || 'https://www.genspark.ai/api/llm_proxy/v1'

  if (!apiKey) {
    return c.json({ error: 'OPENAI_API_KEY not configured' }, 500)
  }

  // ─── Option A: Two-phase parallel RFP generation ─────────────────────────────
  // Phase 1 (~10–15 s): single LLM call → JSON outline with canonical terms,
  //   key figures, and per-section content blueprints.
  // Phase 2 (~25–35 s wall clock): Promise.all(8 section calls) using the
  //   outline as a shared contract, preventing terminology drift.
  // Total expected: ~40–55 s vs. 7–10 min for sequential single-call generation.
  // Client receives SSE progress events between phases so the UI stays responsive.
  // ─────────────────────────────────────────────────────────────────────────────

  const encoder = new TextEncoder()
  const { readable, writable } = new TransformStream()
  const writer = writable.getWriter()

  // Helper: send a progress event to the client (non-token; kept separate from
  // token events so the UI can display a spinner/step label)
  const sendProgress = async (step: string, detail?: string) => {
    await writer.write(encoder.encode(`data: ${JSON.stringify({ progress: step, detail })}\n\n`))
  }

  // Helper: call LLM and collect full response text (streaming internally to
  // avoid Cloudflare 30 s subrequest timeout)
  const llmCall = async (sp: string, up: string, model: string, maxTok: number): Promise<string> => {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: sp }, { role: 'user', content: up }],
        max_tokens: maxTok,
        temperature: 0.3,
        stream: true,
      }),
    })
    if (!res.ok) {
      const errText = await res.text().catch(() => 'unknown')
      throw new Error(`LLM error ${res.status}: ${errText}`)
    }
    if (!res.body) throw new Error('LLM returned no body')
    const reader = res.body.getReader()
    const dec = new TextDecoder()
    let out = '', buf = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += dec.decode(value, { stream: true })
      const lines = buf.split('\n'); buf = lines.pop() ?? ''
      for (const line of lines) {
        const t = line.trim()
        if (!t || t === 'data: [DONE]' || !t.startsWith('data: ')) continue
        try { const j = JSON.parse(t.slice(6)); const d = j.choices?.[0]?.delta?.content; if (d) out += d } catch { /* skip */ }
      }
    }
    return out
  }

  const streamTask = (async () => {
    try {
      // ── PHASE 1: Outline ────────────────────────────────────────────────────
      await sendProgress('outline', 'Generating document outline and shared vocabulary…')

      const procEmail  = settings?.procurement_email || 'procurement@andersenlab.com'
      const issuerName = settings?.issuer_name       || 'Andersen'
      const issuerLoc  = settings?.issuer_location   || 'Warsaw, Poland'

      // Build deadline-relative milestone dates (duplicated from buildRFPPrompt for Phase 1 context)
      const deadlineDate = body.deadline ? new Date(body.deadline) : new Date(Date.now() + 30*24*60*60*1000)
      const fmtDate = (d: Date) => d.toISOString().split('T')[0]
      const rfpIssueDate  = fmtDate(new Date())
      const clarDeadline  = fmtDate(new Date(deadlineDate.getTime() - 21*24*60*60*1000))
      const qaPublished   = fmtDate(new Date(deadlineDate.getTime() - 14*24*60*60*1000))
      const evalEnd       = fmtDate(new Date(deadlineDate.getTime() + 21*24*60*60*1000))
      const awardNotif    = fmtDate(new Date(deadlineDate.getTime() + 28*24*60*60*1000))
      const contractSign  = fmtDate(new Date(deadlineDate.getTime() + 42*24*60*60*1000))
      const kickoff       = fmtDate(new Date(deadlineDate.getTime() + 56*24*60*60*1000))

      const milestoneDates = `RFP Issue Date: ${rfpIssueDate}
Deadline for Clarification Requests: ${clarDeadline}
${issuerName} Responses to Clarifications: ${qaPublished}
Proposal Submission Deadline: ${body.deadline || fmtDate(deadlineDate)}
Evaluation and Scoring Period Ends: ${evalEnd}
Award Notification to Vendors: ${awardNotif}
Contract Signature: ${contractSign}
Project Kick-off: ${kickoff}`

      // Determine whether scoring matrix was provided
      let scoringMatrixNote = 'Not provided — generate domain-appropriate criteria, weights summing to 100%.'
      if (existingScoringMatrix) {
        try {
          const mx = JSON.parse(existingScoringMatrix)
          if (Array.isArray(mx) && mx.length > 0) {
            scoringMatrixNote = mx.map((r: any) => `${r.criterion}: ${r.weight}% — ${r.description || ''}`).join('\n')
          }
        } catch { /* ignore */ }
      }

      const outlineSysPrompt = `You are a senior procurement architect. Your task is to produce a structured JSON outline that will be used as a shared contract by 8 parallel writers producing sections of a formal RFP document. The outline must lock all canonical terminology, key figures, technology names, system names, role names, and cross-section references so that every section writer uses identical language. Return ONLY valid JSON — no markdown fences, no explanation.`

      const outlineUserPrompt = `Produce a JSON outline for an RFP with this structure:

{
  "rfp_meta": {
    "title": "<RFP title>",
    "ref_number": "<ref>",
    "issuer": "<issuer name and location>",
    "submission_email": "<email>",
    "issue_date": "<date>",
    "proposal_deadline": "<date>"
  },
  "milestone_dates": {
    "rfp_issue": "<date>",
    "clarification_deadline": "<date>",
    "qa_published": "<date>",
    "submission_deadline": "<date>",
    "eval_end": "<date>",
    "award_notification": "<date>",
    "contract_signature": "<date>",
    "project_kickoff": "<date>"
  },
  "canonical_terms": {
    "source_systems": ["<list every source system name from scope/BRD>"],
    "tech_stack": ["<list every tool, platform, framework named>"],
    "modules": ["<list every functional module or workstream named>"],
    "roles": ["<list every user role or team role named>"],
    "deliverables": ["<list every named deliverable artifact>"],
    "kpis": ["<list every KPI or metric named>"]
  },
  "key_figures": {
    "total_duration_months": <number or null>,
    "budget_confidential": true,
    "data_volume": "<any stated data volume or 'not specified'>",
    "user_count": "<any stated user count or 'not specified'>",
    "phase_count": <number of delivery phases>
  },
  "sections": {
    "s1_background": {
      "heading": "1. Project Background and Context",
      "key_points": ["<4–6 bullet points of what to cover — specific, not generic>"],
      "min_words": 400
    },
    "s2_objectives": {
      "heading": "2. Project Objectives",
      "key_points": ["<4–6 specific measurable objectives>"],
      "min_words": 200
    },
    "s3_scope": {
      "heading": "3. Scope of Work",
      "subsections": ["<list subsection headings 3.1, 3.2, etc. derived from scope/BRD>"],
      "key_points": ["<specific activities, inputs, outputs per subsection>"],
      "min_words": 1200
    },
    "s4_technical": {
      "heading": "4. Technical Requirements and Architecture",
      "requirement_areas": ["<list at minimum 18 requirement areas for the table>"],
      "min_rows": 18
    },
    "s5_evaluation": {
      "heading": "5. Evaluation Criteria",
      "criteria": [{"name": "<criterion>", "weight": <number>, "description": "<description>"}],
      "total_weight": 100
    },
    "s6_qualification": {
      "heading": "6. Vendor Qualification Requirements",
      "categories": ["<list requirement categories for qualification table>"]
    },
    "s7_submission": {
      "heading": "7. Submission Requirements and Timeline",
      "required_documents": ["<list all required submission documents>"]
    },
    "s8_terms": {
      "heading": "8. Terms and Conditions",
      "bullet_points": ["<8–12 specific T&C bullet points — derive governing law and language from context, do not hardcode Poland or Arabic>"]
    }
  }
}

PROJECT DATA:
RFP Reference: ${body.ref_number || 'AND/PROC/' + new Date().getFullYear() + '/TBD'}
Title: ${body.title || 'Not specified'}
Category: ${body.category || 'IT & Digital Transformation'}
Issuer: ${issuerName}, ${issuerLoc}
Submission Email: ${procEmail}

MILESTONE DATES:
${milestoneDates}

BACKGROUND:
${body.background || '(not provided)'}

OBJECTIVES:
${body.objectives || '(not provided)'}

SCOPE:
${body.scope || '(not provided)'}

TECHNICAL REQUIREMENTS:
${body.tech_requirements || '(not provided)'}

SCORING MATRIX (Section 5 — use exactly if provided):
${scoringMatrixNote}

${archDocText && archDocText.length > 500 ? `ARCHITECTURE DOCUMENT (extract all tech names, modules, roles, deliverables into canonical_terms):\n${archDocText.slice(0, 12000)}` : ''}
${brdDocText && brdDocText.length > 500 ? `BRD (extract all module names, report names, KPIs, user roles, acceptance criteria into canonical_terms):\n${brdDocText.slice(0, 12000)}` : ''}

Return ONLY the JSON object. No markdown. No explanation.`

      const outlineRaw = await llmCall(outlineSysPrompt, outlineUserPrompt, 'gpt-5-mini', 8000)

      // Parse outline — strip any accidental markdown fences
      let outlineClean = outlineRaw.trim()
      if (outlineClean.startsWith('```')) {
        outlineClean = outlineClean.split('\n').slice(1).join('\n').replace(/```\s*$/, '').trim()
      }
      let outline: any = {}
      try { outline = JSON.parse(outlineClean) } catch {
        // Outline parse failed — fall back to single-call sequential generation
        await sendProgress('fallback', 'Outline parse failed — falling back to sequential generation…')
        const { systemPrompt: sp, userPrompt: up } = buildRFPPrompt(body, archDocText, brdDocText, existingScoringMatrix, settings)
        const llmContent = await llmCall(sp, up, 'gpt-5-mini', 64000)
        const repairedContent = repairTruncatedHtml(llmContent)
        const content = repairedContent.length > 400 ? `<div class="rfp-doc">${repairedContent}</div>` : ''
        if (content) {
          const rfpFullText = llmContent.replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, ' ').trim()
          await c.env.DB.prepare(`UPDATE rfps SET title=?,category=?,budget=?,deadline=?,scope=?,tech_requirements=?,objectives=?,background=?,content=?,rfp_full_text=?,arch_doc_text=?,brd_doc_text=?,updated_at=datetime('now') WHERE id=?`)
            .bind(body.title, body.category, body.budget, body.deadline, body.scope, body.tech_requirements||'', body.objectives||'', body.background||'', content, rfpFullText.slice(0,100000), archDocText, brdDocText, id).run()
        }
        const rfp = await c.env.DB.prepare('SELECT * FROM rfps WHERE id=?').bind(id).first().catch(() => null)
        await writer.write(encoder.encode(`data: ${JSON.stringify({ done: true, rfp })}\n\n`))
        return
      }

      await sendProgress('sections', 'Outline complete — generating all 8 sections in parallel…')

      // ── PHASE 2: Parallel section generation ───────────────────────────────
      // Shared context injected into every section prompt
      const canonicalJson = JSON.stringify(outline.canonical_terms || {}, null, 2)
      const keyFiguresJson = JSON.stringify(outline.key_figures || {}, null, 2)
      const milestonesJson = JSON.stringify(outline.milestone_dates || {}, null, 2)
      const rfpMetaJson = JSON.stringify(outline.rfp_meta || {}, null, 2)

      const sharedCtx = `
CANONICAL TERMS (use these EXACT names throughout — do not paraphrase or invent alternatives):
${canonicalJson}

KEY FIGURES:
${keyFiguresJson}

RFP META:
${rfpMetaJson}

PROJECT DATA SUMMARY:
Title: ${body.title}
Category: ${body.category}
Background: ${body.background || '(not provided)'}
Objectives: ${body.objectives || '(not provided)'}
Scope: ${body.scope || '(not provided)'}
Technical Requirements: ${body.tech_requirements || '(not provided)'}
${archDocText && archDocText.length > 500 ? `Architecture Document:\n${archDocText.slice(0, 8000)}` : ''}
${brdDocText && brdDocText.length > 500 ? `BRD:\n${brdDocText.slice(0, 8000)}` : ''}`.trim()

      // Letterhead template (same as buildRFPPrompt systemPrompt, inlined here)
      const letterheadSys = systemPrompt  // reuse already-built systemPrompt from buildRFPPrompt

      // Section generator: returns raw HTML content for one section (no page wrapping — assembler adds pages)
      const genSection = (sectionKey: string, sectionSpec: any, extraInstruction: string): Promise<string> => {
        const sp = `${letterheadSys}

You are writing ONE section of a formal RFP. Output ONLY the HTML content for this section — no page wrappers, no letterhead, no DOCTYPE. Use inline styles only. The assembler will place your content inside the correct page structure.
CRITICAL: Use ONLY the canonical terms and key figures provided. Do not introduce any technology name, system name, or role name not present in the canonical terms list.`

        const up = `${sharedCtx}

SECTION BLUEPRINT:
${JSON.stringify(sectionSpec, null, 2)}

${extraInstruction}

Write the complete HTML for section "${sectionSpec?.heading || sectionKey}" now. Minimum word count: ${sectionSpec?.min_words || 150}. Output HTML content only — no page wrappers.`

        return llmCall(sp, up, 'gpt-5-mini', 10000).catch(err => `<p style="color:red">Section generation error: ${err.message}</p>`)
      }

      const s = outline.sections || {}

      // Build scoring matrix note for section 5
      let s5Extra = 'Generate domain-appropriate evaluation criteria. Weights must sum to exactly 100%.'
      if (s.s5_evaluation?.criteria?.length > 0) {
        const crit = s.s5_evaluation.criteria
        s5Extra = `Use EXACTLY these criteria from the outline (reproduce verbatim — do not alter weights or names):\n${crit.map((r: any) => `- ${r.name}: ${r.weight}% — ${r.description}`).join('\n')}\nTotal: ${crit.reduce((acc: number, r: any) => acc + (Number(r.weight)||0), 0)}%`
      }

      // Section 7 milestone table data
      const s7Extra = `MILESTONE DATES — reproduce all 8 rows exactly:\n${milestoneDates}\nSubmission email: ${procEmail}\nIssuer: ${issuerName}`

      // Section 8 T&C — pass outline's bullet points as guide
      const s8bulletGuide = s.s8_terms?.bullet_points?.length > 0
        ? `Use these as the basis for T&C bullets (do not hardcode any specific jurisdiction or language not derived from the project context):\n${s.s8_terms.bullet_points.map((b: string, i: number) => `${i+1}. ${b}`).join('\n')}`
        : `Write 8–12 T&C bullet points. Derive governing law and contract language from the project context — do not hardcode Poland or Arabic.`

      // Fire all 8 section calls in parallel
      const [html1, html2, html3, html4, html5, html6, html7, html8] = await Promise.all([
        genSection('s1_background',   s.s1_background,   'Write 4–6 substantial paragraphs. At least 400 words.'),
        genSection('s2_objectives',   s.s2_objectives,   'Write as a numbered list. Each objective: specific, measurable, tied to input data. At least 4 objectives with full explanatory sentences.'),
        genSection('s3_scope',        s.s3_scope,        `Write sub-sections ${(s.s3_scope?.subsections || ['3.1','3.2','3.3','3.4','3.5','3.6']).join(', ')}. Each subsection: heading, intro paragraph, detailed bullet list of activities, acceptance criteria, and key deliverables. At least 1,200 words.`),
        genSection('s4_technical',    s.s4_technical,    `Render as a table: Requirement Area | Specific Requirement | Classification (Mandatory/Preferred). Minimum ${s.s4_technical?.min_rows || 18} rows. One specific testable requirement per row.`),
        genSection('s5_evaluation',   s.s5_evaluation,   s5Extra),
        genSection('s6_qualification',s.s6_qualification,'Render as a table: Requirement Category | Minimum Standard | Evidence Required. Derive from project domain and scope. Cover experience, certifications, financial standing, compliance.'),
        genSection('s7_submission',   s.s7_submission,   s7Extra),
        genSection('s8_terms',        s.s8_terms,        s8bulletGuide),
      ])

      await sendProgress('assembling', 'All sections complete — assembling document…')

      // ── PHASE 3: Assemble into full HTML document ──────────────────────────
      // Cover page is generated from outline meta (no LLM call needed)
      // Strip leading "N. " or "N.N " prefix from heading if present — the <ol>
      // was replaced with a plain <ul> to avoid double-numbering like "1. 1. Background".
      const tocItems = Object.values(s).map((sec: any) => {
        const h = (sec?.heading || '').trim()
        // Remove leading numbering pattern: "1. ", "1.2 ", "Section 1: ", etc.
        return h.replace(/^(\d+\.?\d*\.?\s+|Section\s+\d+[:\s]+)/i, '').trim()
      }).filter(Boolean)
      const tocHtml = tocItems.map((h: string, idx: number) => 
        `<li style="margin-bottom:5pt;font-family:Roboto,Arial,sans-serif;font-size:10.5pt;color:#020303;display:flex;gap:8pt;"><span style="min-width:18pt;font-weight:600;color:#020303;">${idx+1}.</span><span>${h}</span></li>`
      ).join('')

      const coverContent = `
<h1 style="font-family:Roboto,Arial,sans-serif;font-size:20pt;font-weight:700;text-align:center;color:#020303;margin:0 0 10pt 0;line-height:1.2;">${outline.rfp_meta?.title || body.title || 'Request for Proposal'}</h1>
<p style="font-family:Roboto,Arial,sans-serif;font-size:13.5pt;font-weight:300;text-align:center;letter-spacing:2.5px;color:#020303;margin:16pt 0;">REQUEST FOR PROPOSAL</p>
<table style="width:80%;margin:16pt auto;border-collapse:collapse;font-family:Roboto,Arial,sans-serif;font-size:10.5pt;color:#020303;">
  <tr><td style="padding:5pt 10pt;border:1px solid #E0E0E0;font-weight:700;width:38%;">RFP Reference Number</td><td style="padding:5pt 10pt;border:1px solid #E0E0E0;">${outline.rfp_meta?.ref_number || body.ref_number || ''}</td></tr>
  <tr><td style="padding:5pt 10pt;border:1px solid #E0E0E0;font-weight:700;">Issue Date</td><td style="padding:5pt 10pt;border:1px solid #E0E0E0;">${rfpIssueDate}</td></tr>
  <tr><td style="padding:5pt 10pt;border:1px solid #E0E0E0;font-weight:700;">Proposal Submission Deadline</td><td style="padding:5pt 10pt;border:1px solid #E0E0E0;">${body.deadline || fmtDate(deadlineDate)}</td></tr>
  <tr><td style="padding:5pt 10pt;border:1px solid #E0E0E0;font-weight:700;">Category</td><td style="padding:5pt 10pt;border:1px solid #E0E0E0;">${body.category || ''}</td></tr>
  <tr><td style="padding:5pt 10pt;border:1px solid #E0E0E0;font-weight:700;">Issuing Authority</td><td style="padding:5pt 10pt;border:1px solid #E0E0E0;">${issuerName}, ${issuerLoc}</td></tr>
  <tr><td style="padding:5pt 10pt;border:1px solid #E0E0E0;font-weight:700;">Submission Email</td><td style="padding:5pt 10pt;border:1px solid #E0E0E0;">${procEmail}</td></tr>
</table>
<div style="margin:20pt 0 8pt 0;font-family:Roboto,Arial,sans-serif;font-size:11pt;font-weight:700;color:#020303;border-bottom:2px solid #FFDB00;padding-bottom:4pt;">Table of Contents</div>
<ul style="margin:0;padding:0;list-style:none;">${tocHtml}</ul>`

      // ── Page wrapper builder ────────────────────────────────────────────────
      // Produces one A4 page div (794×1123px) with full letterhead + navy footer.
      // Puppeteer renders width=794px height=1123px → exactly 1 PDF page per div.
      // The content area is overflow:hidden at 909px (1123 - header~146 - footer68).
      // Do NOT remove the height/overflow — Puppeteer requires fixed-size page divs.
      // Instead, use buildPages() below to split content BEFORE calling buildPage().
      const buildPage = (content: string) => `<div style="position:relative;width:794px;height:1123px;max-width:794px;margin:0 auto 20px auto;background:#ffffff;overflow:hidden;box-sizing:border-box;page-break-after:always;font-family:Roboto,Arial,'Segoe UI',sans-serif;color:#020303;">
<div style="padding:18px 36px 14px;display:flex;align-items:center;gap:18px;border-bottom:none;">
  <div style="display:flex;align-items:center;gap:14px;">
    <div style="font-family:Roboto,Arial,sans-serif;font-size:18px;font-weight:700;color:#020D1C;letter-spacing:-0.02em;">${issuerName}</div>
    <div style="width:1px;height:28px;background:#E0E0E0;"></div>
    <div style="font-family:'Courier New',monospace;font-size:9px;letter-spacing:0.22em;text-transform:uppercase;color:#556170;line-height:1.6;"><strong style="color:#020303;font-weight:500;">Procurement</strong><br/>Group &middot; Global</div>
  </div>
</div>
<div style="height:48px;background:#FFDB00;position:relative;overflow:hidden;flex-shrink:0;">
  <svg style="position:absolute;top:0;left:0;width:100%;height:100%;display:block;" viewBox="0 0 794 48" preserveAspectRatio="none" fill="none">
    <path d="M-10 12 Q 100 3, 220 17 T 460 20 Q 580 26, 810 10" stroke="#020303" stroke-width="0.7" stroke-opacity="0.55"/>
    <path d="M-10 24 Q 120 11, 240 29 T 480 32 Q 620 38, 810 22" stroke="#020303" stroke-width="0.7" stroke-opacity="0.45"/>
    <path d="M-10 36 Q 140 22, 260 39 T 500 43 Q 640 50, 810 32" stroke="#020303" stroke-width="0.7" stroke-opacity="0.35"/>
  </svg>
</div>
<div style="height:18px;display:flex;align-items:center;padding:0 36px;gap:5px;border-bottom:1px solid #E0E0E0;">
  <span style="display:block;width:5px;height:5px;border-radius:50%;background:#E0E0E0;"></span>
  <span style="display:block;width:7px;height:7px;border-radius:50%;background:#FFDB00;"></span>
  <span style="flex:1;height:1px;background:#E0E0E0;margin:0 4px;"></span>
  <span style="display:block;width:7px;height:7px;border-radius:50%;background:#FFDB00;"></span>
</div>
<div style="padding:20px 56px 80px;position:relative;overflow:hidden;height:929px;box-sizing:border-box;">${content}</div>
<div style="position:absolute;bottom:0;left:0;right:0;background:#020D1C;color:#B8C0CB;padding:16px 36px;display:flex;justify-content:space-between;align-items:center;font-size:9px;letter-spacing:0.05em;height:68px;box-sizing:border-box;">
  <div style="display:flex;gap:28px;">
    <div><div style="font-family:'Courier New',monospace;font-size:8px;letter-spacing:0.2em;text-transform:uppercase;color:#FFDB00;margin-bottom:3px;">Contact</div><div style="font-family:Roboto,Arial,sans-serif;font-size:9px;color:#D8DEE8;">${procEmail}</div></div>
  </div>
  <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;">
    <div style="font-family:Roboto,Arial,sans-serif;font-size:12px;font-weight:700;color:#ffffff;letter-spacing:-0.01em;">${issuerName}</div>
    <div style="font-family:'Courier New',monospace;font-size:8px;letter-spacing:0.18em;text-transform:uppercase;color:#FFDB00;">&copy; ${issuerName} ${new Date().getFullYear()}</div>
  </div>
</div>
</div>`

      // ── HTML content paginator ──────────────────────────────────────────────
      // Splits section HTML into 794×1123px page-sized chunks (one buildPage()
      // wrapper each). Three budget constants govern how tightly pages pack:
      //
      //   PROSE_BUDGET  — for paragraphs, headings, and list containers
      //   TABLE_BUDGET  — for table content (rows measured individually)
      //   LIST_ITEM_BUDGET — for individual <li> items within a list block
      //
      // Calibrated from real RFP 16 analysis (Data Platform Modernization):
      //   Content area: 909px tall, 682px wide, 11pt/14px body, 1.4 line-height
      //   ~20px per prose line → ~45 lines → ~2160 plain-text chars theoretically
      //   Real S1 background: 5 paragraphs × ~1100 chars each → need PROSE_BUDGET ≥ 2200
      //   Real S3 scope: 91 list items in nested divs → need <li>-level splitting
      //   Real S4 table: 35 rows × ~360 chars/row → TABLE_BUDGET controls row packing
      //   Real tables pages 12-18: 3 rows at 1342-1671 chars → budget was too tight
      //
      // Architecture:
      //   paginateHtml()     — main entry point; calls tokenise() on top-level elements
      //   tokenise()         — extracts top-level element strings (handles nesting)
      //   splitTable()       — descends <table>, splits at <tr> boundaries
      //   splitList()        — descends <ol>/<ul>, splits at <li> boundaries
      //   splitDivChildren() — descends <div>/<section>, splits at child boundaries
      const PROSE_BUDGET = 2400      // plain-text-equiv chars per page for prose content
      const TABLE_BUDGET = 2400      // budget for table (calibrated: 4 rows × ~502w/row + thead)
      // List items: same as prose — they can be dense but benefit from generous packing
      const LIST_BUDGET  = 2400      // budget for list containers

      // ── Weight estimator ──────────────────────────────────────────────────
      // Converts HTML fragment to an approximate "rendered height in text chars".
      // Each rendered pixel ≈ 0.42 text chars (at 14px font, 48 chars/line, 20px/line).
      //   <tr>   ~45px rendered (multi-line cells) → +55 overhead
      //   <h2/3> ~34px rendered (heading + margin)  → +70 overhead
      //   <li>   ~22px rendered (line + margin)      → +18 overhead (text already counted)
      //   <p>    ~14px extra margin-bottom           → +14 overhead
      //   <div section heading style> ~34px          → +50 overhead
      function estimateWeight(html: string): number {
        const text = html.replace(/<[^>]+>/g, '').replace(/&[a-zA-Z#0-9]+;/g, ' ').replace(/\s+/g, ' ').trim()
        const base  = text.length
        const trs   = (html.match(/<tr[\s>]/gi)     || []).length
        const heads = (html.match(/<h[1-4][\s>]/gi) || []).length
        const lis   = (html.match(/<li[\s>]/gi)     || []).length
        const ps    = (html.match(/<p[\s>]/gi)      || []).length
        return base + trs * 55 + heads * 70 + lis * 18 + ps * 14
      }

      // ── Low-level HTML element tokeniser ─────────────────────────────────
      // Extracts immediate children of an HTML fragment as separate strings.
      // Handles nested tags correctly via depth tracking.
      function tokenise(html: string): string[] {
        const segs: string[] = []
        const voidTags = new Set(['br','hr','img','input','meta','link','col','colgroup','area','base','source','track','wbr'])
        let rem = html.trim()

        while (rem.length > 0) {
          const ws = rem.match(/^\s+/)
          if (ws) { rem = rem.slice(ws[0].length); continue }

          if (!rem.startsWith('<')) {
            const nx = rem.indexOf('<')
            if (nx === -1) { segs.push(rem); break }
            segs.push(rem.slice(0, nx)); rem = rem.slice(nx); continue
          }

          const tm = rem.match(/^<([a-zA-Z][a-zA-Z0-9]*)/)
          if (!tm) { segs.push(rem[0]); rem = rem.slice(1); continue }

          const tag = tm[1].toLowerCase()
          if (voidTags.has(tag)) {
            const end = rem.indexOf('>') + 1
            segs.push(rem.slice(0, end)); rem = rem.slice(end); continue
          }

          // Depth-aware close-tag search
          let depth = 0, scanPos = 0, found = -1
          while (scanPos < rem.length) {
            const sub = rem.slice(scanPos)
            const om = sub.match(/^<([a-zA-Z][a-zA-Z0-9]*)[\s\/>]/)
            if (om && om[1].toLowerCase() === tag && !sub.startsWith('</')) {
              depth++; const te = sub.indexOf('>'); scanPos += (te === -1 ? 1 : te + 1); continue
            }
            const cm = sub.match(/^<\/([a-zA-Z][a-zA-Z0-9]*)\s*>/)
            if (cm && cm[1].toLowerCase() === tag) {
              depth--; if (depth === 0) { found = scanPos + cm[0].length; break }
              scanPos += cm[0].length; continue
            }
            scanPos++
          }

          if (found === -1) { segs.push(rem); break }
          segs.push(rem.slice(0, found)); rem = rem.slice(found)
        }
        return segs
      }

      // ── Table splitter ────────────────────────────────────────────────────
      // Splits <table> at <tr> boundaries. <thead> repeats on every chunk.
      function splitTable(tableHtml: string): string[] {
        const tableOpenM = tableHtml.match(/^(<table[^>]*>)/i)
        const tableOpen  = tableOpenM ? tableOpenM[1] : '<table>'
        const theadM     = tableHtml.match(/(<thead[\s\S]*?<\/thead>)/i)
        const thead      = theadM ? theadM[1] : ''
        const theadW     = estimateWeight(thead)

        // Strip thead, table open/close, tbody/tfoot wrappers → get raw row HTML
        let body = tableHtml
          .replace(/<thead[\s\S]*?<\/thead>/gi, '')
          .replace(/<\/table\s*>/gi, '').replace(tableOpen, '')
          .replace(/<\/?tbody[^>]*>/gi, '').replace(/<\/?tfoot[^>]*>/gi, '')

        // Extract individual <tr>...</tr> elements
        const rows: string[] = []
        let rem = body.trim()
        while (rem.length > 0) {
          rem = rem.trimStart()
          if (!/^<tr/i.test(rem)) { const nx = rem.search(/<tr/i); if (nx < 0) break; rem = rem.slice(nx); continue }
          let depth = 0, scan = 0, end = -1
          while (scan < rem.length) {
            const sub = rem.slice(scan)
            if (/^<tr[\s>]/i.test(sub)) { depth++; const te = sub.indexOf('>'); scan += te + 1; continue }
            const cm = sub.match(/^<\/tr\s*>/i)
            if (cm) { depth--; if (!depth) { end = scan + cm[0].length; break }; scan += cm[0].length; continue }
            scan++
          }
          if (end < 0) { rows.push(rem); break }
          rows.push(rem.slice(0, end)); rem = rem.slice(end)
        }

        if (!rows.length) return [tableHtml]

        const chunks: string[] = []
        let buf: string[] = [], bufW = theadW
        for (const row of rows) {
          const rw = estimateWeight(row)
          if (bufW + rw > TABLE_BUDGET && buf.length) {
            chunks.push(`${tableOpen}${thead}<tbody>${buf.join('')}</tbody></table>`)
            buf = []; bufW = theadW
          }
          buf.push(row); bufW += rw
        }
        if (buf.length) chunks.push(`${tableOpen}${thead}<tbody>${buf.join('')}</tbody></table>`)
        return chunks.length ? chunks : [tableHtml]
      }

      // ── List splitter ─────────────────────────────────────────────────────
      // Splits <ol>/<ul> at <li> boundaries. Preserves list tag + attributes.
      function splitList(listHtml: string): string[] {
        const listOpenM = listHtml.match(/^(<(?:ol|ul)[^>]*>)/i)
        const listOpen  = listOpenM ? listOpenM[1] : '<ul>'
        const listClose = listOpen.startsWith('<ol') ? '</ol>' : '</ul>'

        // Extract <li> items (depth-aware)
        const items: string[] = []
        let rem = listHtml.replace(/^<(?:ol|ul)[^>]*>/i, '').replace(/<\/(?:ol|ul)\s*>$/i, '').trim()
        while (rem.length > 0) {
          rem = rem.trimStart()
          if (!/^<li/i.test(rem)) { const nx = rem.search(/<li/i); if (nx < 0) break; rem = rem.slice(nx); continue }
          let depth = 0, scan = 0, end = -1
          while (scan < rem.length) {
            const sub = rem.slice(scan)
            if (/^<li[\s>]/i.test(sub)) { depth++; const te = sub.indexOf('>'); scan += te + 1; continue }
            const cm = sub.match(/^<\/li\s*>/i)
            if (cm) { depth--; if (!depth) { end = scan + cm[0].length; break }; scan += cm[0].length; continue }
            scan++
          }
          if (end < 0) { items.push(rem); break }
          items.push(rem.slice(0, end)); rem = rem.slice(end)
        }

        if (!items.length) return [listHtml]

        const chunks: string[] = []
        let buf: string[] = [], bufW = 0
        for (const item of items) {
          const iw = estimateWeight(item)
          if (bufW + iw > LIST_BUDGET && buf.length) {
            chunks.push(`${listOpen}${buf.join('')}${listClose}`)
            buf = []; bufW = 0
          }
          buf.push(item); bufW += iw
        }
        if (buf.length) chunks.push(`${listOpen}${buf.join('')}${listClose}`)
        return chunks.length ? chunks : [listHtml]
      }

      // ── Div child splitter ────────────────────────────────────────────────
      // For a <div> or <section> whose children are too heavy for one page,
      // descend and split at child element boundaries using PROSE_BUDGET.
      function splitDivChildren(divHtml: string): string[] {
        const divOpenM = divHtml.match(/^(<(?:div|section)[^>]*>)/i)
        if (!divOpenM) return [divHtml]
        const divOpen  = divOpenM[1]
        const tagName  = divOpenM[1].match(/^<([a-zA-Z]+)/i)![1].toLowerCase()
        const divClose = `</${tagName}>`

        const inner = divHtml.replace(/^<(?:div|section)[^>]*>/i, '').replace(/<\/(?:div|section)\s*>$/i, '')
        const children = tokenise(inner)
        if (children.length <= 1) return [divHtml]

        const chunks: string[] = []
        let buf = '', bufW = 0
        for (const child of children) {
          const cw = estimateWeight(child)
          if (bufW + cw > PROSE_BUDGET && buf.trim()) {
            chunks.push(`${divOpen}${buf}${divClose}`)
            buf = ''; bufW = 0
          }
          buf += child; bufW += cw
        }
        if (buf.trim()) chunks.push(`${divOpen}${buf}${divClose}`)
        return chunks.length ? chunks : [divHtml]
      }

      // ── Main paginator ────────────────────────────────────────────────────
      // Converts section HTML into page-budget-sized chunks for buildPage().
      // Handles 4 element types specially:
      //   <table>          → splitTable() at <tr> boundaries
      //   <ol>/<ul>        → splitList()  at <li> boundaries
      //   <div>/<section>  → splitDivChildren() if too heavy (scope sections)
      //   everything else  → atomic, packed by weight into current chunk
      function paginateHtml(html: string): string[] {
        const pages: string[] = []
        let chunk = '', weight = 0

        function flush() { if (chunk.trim()) { pages.push(chunk); chunk = ''; weight = 0 } }

        function addChunk(seg: string, budget: number) {
          const w = estimateWeight(seg)
          if (weight + w > budget && chunk.trim()) flush()
          chunk += seg; weight += w
        }

        for (const seg of tokenise(html)) {
          const tag = (seg.match(/^<([a-zA-Z][a-zA-Z0-9]*)/) || [])[1]?.toLowerCase() || ''

          if (tag === 'table') {
            // Split at row boundaries; each sub-table placed on page independently
            for (const tc of splitTable(seg)) {
              const tw = estimateWeight(tc)
              if (weight + tw > TABLE_BUDGET && chunk.trim()) flush()
              chunk += tc; weight += tw
            }
          } else if (tag === 'ol' || tag === 'ul') {
            // Split at list-item boundaries
            for (const lc of splitList(seg)) {
              addChunk(lc, LIST_BUDGET)
            }
          } else if ((tag === 'div' || tag === 'section') && estimateWeight(seg) > PROSE_BUDGET) {
            // Heavy div (scope workstream container etc.) — descend and split children
            for (const dc of splitDivChildren(seg)) {
              addChunk(dc, PROSE_BUDGET)
            }
          } else {
            // Prose element (p, h2, h3, dl, blockquote, etc.) — pack by weight
            addChunk(seg, PROSE_BUDGET)
          }
        }
        flush()

        return pages.length > 0 ? pages : ['']
      }

      // Convenience: paginate HTML and wrap each chunk in a full buildPage()
      function buildPages(html: string): string {
        return paginateHtml(html).map(chunk => buildPage(chunk)).join('\n')
      }

      // ── PHASE 3: Assemble into full HTML document ──────────────────────────
      // Each section is independently paginated so no content is ever clipped.
      // Cover page always fits on one page (it's just a title table + TOC).
      // Sections s1+s2 (background + objectives) share a starting page but
      // will overflow onto additional pages if combined content is large.
      // All other sections are paginated independently.
      //
      // IMPORTANT: wrap all page divs in a bare <div> so DOM depth matches
      // the old single-call LLM output. Both the preview CSS (.rfp-doc > div > div)
      // and the Puppeteer PDF CSS (body > div > div) target grandchildren.
      const pagesHtml = [
        buildPage(coverContent),         // cover — always 1 page
        buildPages(html1 + html2),       // background + objectives — 1–2 pages
        buildPages(html3),               // scope — 2–4 pages (subsections)
        buildPages(html4),               // technical requirements table — 2–3 pages
        buildPages(html5 + html6),       // evaluation + qualification — 1–3 pages
        buildPages(html7),               // submission + timeline — 1–2 pages
        buildPages(html8),               // terms & conditions — 1–2 pages
      ].join('\n')
      const fullHtml = `<div>${pagesHtml}</div>`

      const repairedContent = repairTruncatedHtml(fullHtml)
      const content = repairedContent.length > 400 ? `<div class="rfp-doc">${repairedContent}</div>` : ''

      if (content) {
        const rfpFullText = fullHtml
          .replace(/<[^>]+>/g, ' ')
          .replace(/&amp;/g,'&').replace(/&mdash;/g,'—').replace(/&nbsp;/g,' ')
          .replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"')
          .replace(/\s{2,}/g, ' ').trim()
        await c.env.DB.prepare(`
          UPDATE rfps SET title=?, category=?, budget=?, deadline=?, scope=?, tech_requirements=?,
            objectives=?, background=?, content=?, rfp_full_text=?, arch_doc_text=?, brd_doc_text=?, updated_at=datetime('now')
          WHERE id=?
        `).bind(
          body.title, body.category, body.budget, body.deadline, body.scope,
          body.tech_requirements || '', body.objectives || '', body.background || '',
          content, rfpFullText.slice(0, 100000), archDocText, brdDocText, id
        ).run()
      }

      const rfp = await c.env.DB.prepare('SELECT * FROM rfps WHERE id=?').bind(id).first().catch(() => null)
      await writer.write(encoder.encode(`data: ${JSON.stringify({ done: true, rfp })}\n\n`))
    } catch (e: any) {
      await writer.write(encoder.encode(`data: ${JSON.stringify({ error: e.message })}\n\n`)).catch(() => {})
    } finally {
      await writer.close().catch(() => {})
    }
  })()

  // Keep Worker alive for the duration of the parallel generation
  c.executionCtx.waitUntil(streamTask)

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
    },
  })
})

/**
 * repairTruncatedHtml — close any HTML tags left open if the LLM was cut off mid-output.
 * Handles the most likely truncation patterns: mid-attribute, mid-tag, mid-table-row/cell.
 * Returns the input string with proper closing tags appended.
 */
function repairTruncatedHtml(html: string): string {
  if (!html) return html

  let s = html

  // 1. If the string ends mid-attribute (e.g. "border:1px solid</div>"), strip the broken tag.
  //    A broken open-tag looks like: <tagname ...attributes... without closing >
  //    We detect this by finding a < that is never closed by >
  const lastOpenAngle = s.lastIndexOf('<')
  const lastCloseAngle = s.lastIndexOf('>')
  if (lastOpenAngle > lastCloseAngle) {
    // We have a dangling open tag fragment — strip it
    s = s.slice(0, lastOpenAngle).trimEnd()
  }

  // 2. Count open vs close tags for the structural elements we care about.
  //    We close in reverse nesting order: td → tr → tbody/thead → table → div
  const countOpen  = (tag: string) => (s.match(new RegExp(`<${tag}(\\s[^>]*)?>`, 'gi')) || []).length
  const countClose = (tag: string) => (s.match(new RegExp(`</${tag}>`, 'gi')) || []).length

  const openTd    = countOpen('td')    - countClose('td')
  const openTr    = countOpen('tr')    - countClose('tr')
  const openTbody = (countOpen('tbody') + countOpen('thead')) - (countClose('tbody') + countClose('thead'))
  const openTable = countOpen('table') - countClose('table')
  const openDiv   = countOpen('div')   - countClose('div')

  // 3. Append the minimum closing tags needed (in correct nesting order)
  if (openTd > 0)    s += Array(openTd).fill('</td>').join('')
  if (openTr > 0)    s += Array(openTr).fill('</tr>').join('')
  if (openTbody > 0) s += Array(openTbody).fill('</tbody>').join('')
  if (openTable > 0) s += Array(openTable).fill('</table>').join('')
  if (openDiv > 0)   s += Array(openDiv).fill('</div>').join('')

  return s
}

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

// POST /rfps/:id/upload-arch-doc — upload BRD/arch doc, fire async OCR immediately
// v28: returns immediately after R2 store + async sidecar fire. OCR result saved via callback.
apiRouter.post('/rfps/:id/upload-arch-doc', async (c) => {
  try {
    const id = c.req.param('id')
    const formData = await c.req.formData()
    const file = formData.get('file') as File | null
    if (!file) return c.json({ error: 'No file uploaded' }, 400)

    const docLabel = (formData.get('doc_label') as string || '').toLowerCase()
    const isBRD = docLabel.includes('business requirement') || docLabel.includes('brd')
    const docType = isBRD ? 'brd' : 'arch'

    const arrayBuffer = await file.arrayBuffer()
    const bytes = new Uint8Array(arrayBuffer)
    const sizeKb = Math.round(bytes.length / 1024)

    // Store in R2
    const bucket: R2Bucket | undefined = (c.env as any).PROPOSALS_BUCKET
    let r2Key = ''
    if (bucket) {
      r2Key = `arch-docs/${id}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
      await bucket.put(r2Key, bytes, {
        httpMetadata: { contentType: file.type || 'application/pdf' },
        customMetadata: { rfpId: String(id), docType },
      })
    }

    // Save r2Key + placeholder text immediately
    const placeholder = `[PDF: ${file.name}, ${sizeKb}KB — OCR in progress...]`
    if (isBRD) {
      await c.env.DB.prepare(`UPDATE rfps SET brd_doc_r2_key=?, brd_doc_text=?, updated_at=datetime('now') WHERE id=?`).bind(r2Key, placeholder, id).run()
    } else {
      await c.env.DB.prepare(`UPDATE rfps SET arch_doc_r2_key=?, arch_doc_text=?, updated_at=datetime('now') WHERE id=?`).bind(r2Key, placeholder, id).run()
    }

    // Fire async OCR — callback will write the real text when done
    if (r2Key) {
      const workerBase = `https://a7b32759-e743-4139-9bb0-4bae44886667.vip.gensparksite.com/api`
      const pdfUrl = `${workerBase}/proposals/pdf/${encodeURIComponent(r2Key)}`
      const callbackUrl = `${workerBase}/callback/rfps/${id}/doc-ocr-complete?doc_type=${docType}&filename=${encodeURIComponent(file.name)}&size_kb=${sizeKb}`
      const secret = c.env.PDF_SIDECAR_SECRET || (globalThis as any).PDF_SIDECAR_SECRET || ''
      await callSidecarAsync(pdfUrl, c.env, 100, callbackUrl, secret)
      console.log(`[upload-arch-doc] async OCR fired rfp=${id} docType=${docType}`)
    }

    return c.json({ ok: true, column: isBRD ? 'brd_doc_text' : 'arch_doc_text', size: bytes.length, r2Key, ocr_status: 'processing' })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// POST /callback/rfps/:rfpId/doc-ocr-complete — sidecar calls this when arch/brd OCR finishes
apiRouter.post('/callback/rfps/:rfpId/doc-ocr-complete', async (c) => {
  const rfpId = c.req.param('rfpId')
  const docType  = c.req.query('doc_type') || 'arch'
  const filename = decodeURIComponent(c.req.query('filename') || 'document.pdf')
  const sizeKb   = c.req.query('size_kb') || '?'
  const db = c.env.DB
  const expectedSecret = c.env.PDF_SIDECAR_SECRET || (globalThis as any).PDF_SIDECAR_SECRET || ''
  try {
    const body: any = await c.req.json()
    if (expectedSecret && body.callback_secret !== expectedSecret) return c.json({ error: 'Unauthorized' }, 401)
    let text: string
    if (body.ok && body.chars >= 200) {
      text = `[Source: ${filename}, ${sizeKb}KB, ${body.pages_extracted}/${body.pages_total} pages]\n\n${body.text}`
      if (text.length > 60000) text = text.slice(0, 60000) + '\n\n[... truncated ...]'
    } else {
      text = `[PDF: ${filename}, ${sizeKb}KB — OCR yielded ${body.chars || 0} chars. ${body.error || ''}]`
    }
    if (docType === 'brd') {
      await db.prepare(`UPDATE rfps SET brd_doc_text=?, updated_at=datetime('now') WHERE id=?`).bind(text, rfpId).run()
    } else {
      await db.prepare(`UPDATE rfps SET arch_doc_text=?, updated_at=datetime('now') WHERE id=?`).bind(text, rfpId).run()
    }
    console.log(`[doc-ocr-callback] rfp=${rfpId} docType=${docType} chars=${text.length}`)
    return c.json({ ok: true, chars: text.length })
  } catch (e: any) {
    return c.json({ ok: false, error: e?.message }, 500)
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

RFP Title:        ${rfp?.title || 'Andersen RFP'}
Reference Number: ${rfp?.ref_number || ''}

This document consolidates all clarification questions submitted by all participating vendors, together with Andersen's official answers. The document is provided to all shortlisted vendors to ensure full transparency and equal access to information.

Please review the attached Excel file carefully and incorporate the clarifications into your proposal submission.

For any further queries, please reply to this email referencing your Participant Reference below.

Best regards,
Procurement & Contracting Department
Andersen, Warsaw
procurement@cpc-rfp.website

──────────────────────────────────────────────
PARTICIPANT REFERENCE: ${participantCode}
Please include this reference code in ALL correspondence regarding this RFP.
──────────────────────────────────────────────`

      if (resendKey) {
        try {
          const emailPayload = {
            from: 'Andersen Procurement <procurement@cpc-rfp.website>',
            to: [vendor.contact_email],
            subject: `Q&A Consolidated Response – ${rfp?.title || 'Andersen RFP'} (Ref: ${rfp?.ref_number || ''})`,
            text: emailText,
            html: buildAndersenEmailHtml(emailText),
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
              `Q&A Consolidated Response – ${rfp?.title || 'Andersen RFP'} (Ref: ${rfp?.ref_number || ''})`,
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
          `Q&A Consolidated Response – ${rfp?.title || 'Andersen RFP'} (Ref: ${rfp?.ref_number || ''})`,
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

    const baseUrl = new URL(c.req.url).origin
    const emailBody = buildInvitationEmailText(v, rfp, qDeadline, sDeadline, notes, baseUrl)
    let status = 'simulated'
    let sendError = ''
    let resendId: string | undefined

    const isAndersenVendor = (v.contact_email || '').toLowerCase().includes('@andersenlab.com')
    if (isAndersenVendor) {
      // Real Andersen email — attempt actual delivery via Resend
      const result = await sendRealEmail(
        v.contact_email,
        `Invitation to Tender – ${rfp?.title || 'Andersen RFP'} (Ref: ${rfp?.ref_number || ''})`,
        emailBody,
        rfp,
        c.env,
        pdfBase64,
        pdfFilename
      )
      status = result.ok ? 'sent' : 'simulated'
      sendError = result.error || ''
      resendId = result.id
    }
    // Non-@andersenlab.com vendors → always simulate (prototype guard)
    results.push({ vendor: v.name, status, resendId, error: sendError })

    await c.env.DB.prepare(`
      INSERT INTO email_log (rfp_id, vendor_id, recipient, subject, body, email_type, status, has_pdf, created_at)
      VALUES (?,?,?,?,?,'invitation',?,1,datetime('now'))
    `).bind(
      rfpId, v.id,
      v.contact_email || 'contact@vendor.com',
      `Invitation to Tender – ${rfp?.title || 'Andersen RFP'} (Ref: ${rfp?.ref_number || ''})`,
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
    const refPattern = /AND\/PROC\/\d{4}\/\d+/g
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

    // ── Email categorization — LLM-FIRST ────────────────────────
    // Step 1: Run LLM on ALL emails with body text to detect intent.
    //         LLM returns DECLINE | QUESTIONS | NEUTRAL.
    // Step 2: Attachment checks are secondary confirmations, not routing gates.
    //         - spreadsheet attachment upgrades NEUTRAL → questions
    //         - DECLINE always wins regardless of attachments (thread carry-overs ignored)
    //
    // This prevents Outlook carrying the original RFP PDF as a thread attachment
    // from short-circuiting decline/question detection.

    // Strip quoted reply chain so only vendor's own words go to LLM.
    const quoteStripPatterns = [
      /\r?\nFrom:\s*Andersen Procurement/i,
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

    // LLM intent classification — runs for ALL emails with body text.
    let llmVerdict = 'NEUTRAL'
    const openAiKey = (c.env as any).OPENAI_API_KEY || (globalThis as any).OPENAI_API_KEY || ''
    if (openAiKey && cleanBody.length > 0) {
      try {
        const intentRes = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${openAiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            max_tokens: 10,
            temperature: 0,
            messages: [
              {
                role: 'system',
                content: 'You are an intent classifier for a procurement system. A vendor has received an RFP invitation and is replying by email. Analyse only the vendor\'s own words (quoted original message text is already stripped). Reply with exactly one word — no punctuation, no explanation:\n- DECLINE — the vendor is declining, withdrawing, expressing inability or unwillingness to participate, or otherwise opting out.\n- QUESTIONS — the vendor is asking questions about the RFP or submitting a question list.\n- NEUTRAL — anything else: acknowledgements, confirmations of participation, or unclear intent.',
              },
              {
                role: 'user',
                content: `Subject: ${subject}\n\nVendor reply:\n${cleanBody.slice(0, 4000)}`,
              },
            ],
          }),
        })
        if (intentRes.ok) {
          const intentData = await intentRes.json() as any
          const raw = (intentData?.choices?.[0]?.message?.content || '').trim().toUpperCase()
          // Use startsWith to tolerate punctuation (e.g. "DECLINE." from model)
          if (raw.startsWith('DECLINE')) llmVerdict = 'DECLINE'
          else if (raw.startsWith('QUESTIONS')) llmVerdict = 'QUESTIONS'
          else llmVerdict = 'NEUTRAL'
        }
      } catch(_) {}
    }

    // Map LLM verdict + attachment signals → final email category
    let emailCategory = 'plain_email'
    if (llmVerdict === 'DECLINE') {
      // Decline wins regardless of attachments
      emailCategory = 'decline'
    } else if (spreadsheetAttachment || llmVerdict === 'QUESTIONS') {
      // Spreadsheet is a hard signal for Q&A; LLM QUESTIONS also routes here
      emailCategory = 'questions'
    } else {
      // NEUTRAL — plain communication (PDF carry-overs, acks, etc.)
      emailCategory = 'plain_email'
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
          const rfpTitle = rfp?.title || 'Andersen RFP'
          const rfpRef   = rfp?.ref_number || ''
          const rejectionBody = `Dear ${vendorDisplayName},

Thank you for your enquiry regarding the following procurement:

RFP Title:        ${rfpTitle}
Reference Number: ${rfpRef}

We regret to inform you that the Q&A period for this Request for Proposal has now closed. The Andersen is no longer able to accept or process clarification questions for this tender.

All vendors have been provided with a consolidated Q&A response document containing answers to all submitted questions. If you have not received this document, please contact procurement@cpc-rfp.website referencing the RFP above.

Proposal submissions continue to be accepted until the stated deadline. Please refer to your original invitation letter for submission instructions and the deadline date.

We appreciate your interest in participating in this procurement and look forward to receiving your proposal.

Best regards,
Procurement & Contracting Department
Andersen, Warsaw
procurement@cpc-rfp.website`

          try {
            await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                from: 'Andersen Procurement <procurement@cpc-rfp.website>',
                to: [fromAddress],
                subject: `RE: ${subject || 'Q&A Query'} — Q&A Period Closed`,
                text: rejectionBody,
                html: buildAndersenEmailHtml(rejectionBody),
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

    const replySubject = subject || `RE: Invitation to Tender – ${rfp?.title || 'Andersen RFP'} (Ref: ${rfp?.ref_number || ''})`
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
      `Contract Award Notification – ${rfp?.title || 'Andersen RFP'} (Ref: ${rfp?.ref_number || ''})`,
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
  // v28: priority order — proposal_full_text (OCR at upload) > ocr_job_text (legacy async) > legacy fields
  // No slicing — pass the full extracted text to the LLM.
  if (proposal.proposal_full_text && proposal.proposal_full_text.length > 200) {
    return proposal.proposal_full_text
  }
  if (proposal.ocr_job_text && proposal.ocr_job_text.length > 200) {
    return proposal.ocr_job_text
  }
  // Legacy fallback: assemble from individual text fields
  const parts: string[] = []
  if (proposal.technical_proposal && typeof proposal.technical_proposal === 'string') {
    parts.push(proposal.technical_proposal)
  }
  if (proposal.executive_summary) parts.push(proposal.executive_summary)
  if (proposal.key_strengths) parts.push(proposal.key_strengths)
  try {
    const atts: any[] = JSON.parse(proposal.proposal_attachments || '[]')
    for (const a of atts) {
      if (a.extracted_text) parts.push(String(a.extracted_text))
    }
  } catch (_) {}
  return parts.join('\n\n')
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
    const cur = m[1] || 'USD'
    const amt = parseFloat(m[2].replace(/,/g, ''))
    if (amt > 0) return { amount: amt, currency: cur, confidence: 1.0 }
  }
  // Priority 2: Largest currency amount
  const anyRe = /(AED|USD|EUR|GBP|SAR)?\s*[\$€£]?\s*([\d,]+(?:\.\d{1,2})?)/g
  let best = { amount: 0, currency: 'USD' }
  while ((m = anyRe.exec(text)) !== null) {
    const amt = parseFloat(m[2].replace(/,/g, ''))
    if (amt > best.amount && amt < 1e10) { best = { amount: amt, currency: m[1] || 'USD' } }
  }
  if (best.amount > 1000) return { amount: best.amount, currency: best.currency, confidence: 0.3 }
  return { amount: null, currency: 'USD', confidence: 0.0 }
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

  // Step 2: v28 — text comes from DB only (pre-extracted at upload time).
  // No sidecar calls here. If proposal_full_text is empty it means OCR hasn't finished yet
  // or was never triggered — return a clear status so the UI can tell the user to wait.
  if (proposalText.length < 200) {
    console.log(`[evaluateProposal] proposalId=${proposal.id} — no text in DB (proposal_full_text empty). OCR may still be running.`)
    // Return early with a clear status instead of silently scoring an empty text
    return {
      evaluated_at: new Date().toISOString(),
      proposal_id: proposal.id,
      vendor_name: proposal.vendor_name || '',
      total_score: 0,
      recommendation: 'PENDING',
      validation_status: 'OCR_PENDING',
      compliance_score: 0,
      quality_score: 0,
      commercial_score: null,
      budget_extracted: null,
      budget_currency: 'USD',
      budget_confidence: 0,
      duration_extracted: null,
      strengths: [],
      weaknesses: [],
      recommendation_reasoning: 'Proposal text not yet available — OCR extraction may still be running. Please wait 1-2 minutes and try again.',
      mandatory_failed: [],
      compliance_breakdown: [],
      scoring_breakdown: [],
      glossary_used: 0,
      text_chars_analyzed: 0,
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

  // ── Budget & Duration — run inline extraction ────────────────────────────────
  // Always run runBudgetLLM here so budget + duration are always fresh from
  // the full proposal text. Results are saved to DB as a side-effect.
  let budget = { amount: null as number | null, currency: 'USD', confidence: 0.0 }
  let duration: string | null = proposal.proposed_duration || null

  try {
    const budgetResult = await runBudgetLLM(proposalText, proposal, env.DB, env)
    if (budgetResult.budget_amount) {
      budget.amount     = budgetResult.budget_amount
      budget.currency   = budgetResult.budget_currency || 'USD'
      budget.confidence = budgetResult.budget_confidence || 0.9
    }
    if (budgetResult.duration) duration = budgetResult.duration
    console.log(`[eval-v48] budget extracted: ${budget.currency} ${budget.amount} duration=${duration}`)
  } catch (budgetErr: any) {
    // Budget extraction failure is non-fatal — proceed with technical evaluation
    console.error(`[eval-v48] budget extraction error: ${budgetErr?.message}`)
    // Fall back to any stored values
    if (proposal.budget_amount) {
      budget.amount     = proposal.budget_amount
      budget.currency   = proposal.budget_currency || 'USD'
      budget.confidence = 0.4
    }
  }

  // ── Parse scoring_matrix to find commercial weight ───────────────────────────
  // scoring_matrix JSON: [{ criterion, weight, description }, ...]
  // The commercial/cost criterion is identified by criterion name containing
  // "commercial" or "cost" (case-insensitive). Default weight = 10 if not found.
  let commercialWeight = 10
  let technicalTotal   = 90   // sum of all non-commercial weights
  try {
    const matrixArr: any[] = JSON.parse(rfp.scoring_matrix || '[]')
    if (matrixArr.length > 0) {
      const commercialCrit = matrixArr.find((c: any) =>
        /commercial|cost competitiveness|price/i.test(c.criterion || c.name || '')
      )
      if (commercialCrit) {
        commercialWeight = Number(commercialCrit.weight) || 10
      }
      const allWeights = matrixArr.reduce((sum: number, c: any) => sum + (Number(c.weight) || 0), 0)
      if (allWeights > 0) technicalTotal = allWeights - commercialWeight
    }
  } catch (_) {}
  console.log(`[eval-v48] commercialWeight=${commercialWeight} technicalTotal=${technicalTotal}`)

  // ── Single-call LLM scoring ──────────────────────────────────────────────────
  // One gpt-5 call receives both full documents and returns structured scores
  // for all criteria, strengths, and weaknesses in a single JSON response.
  const rfpFullText   = (rfp.rfp_full_text || '').trim()
  const scoringMatrix = (rfp.scoring_matrix || '').trim() || '(not configured — use standard procurement scoring criteria as defined in the RFP)'

  console.log(`[eval-v48] proposalId=${proposal.id} rfp_full_text=${rfpFullText.length} proposal_full_text=${proposalText.length}`)

  const evalSystemPrompt = `You are a procurement evaluation expert. You will be given two documents:

RFP Document: Contains project requirements, mandatory technical specifications
Vendor Response: The submitted proposal.`

  const evalUserPrompt = `Your task is to evaluate the vendor's proposal strictly against the RFP's evaluation criteria, excluding Commercial Proposal and Cost Competitiveness and project duration (which falls under Implementation Approach, but we exclude schedule/timeline assessment and focus only on methodology, risk management, and workstream quality).
Scoring Instructions

For each criterion, assign a score out of the criterion's weight (e.g., for Technical Compliance, score out of 30). Then calculate the total weighted score as the sum of all individual scores.

Scoring scale per criterion (out of its weight):

90-100% = Excellent - fully meets and exceeds requirements with clear evidence.
70-89% = Good - meets core requirements with minor gaps.
50-69% = Partial - meets some but lacks important mandatory elements.
Below 50% = Poor - fails to address the criterion or critical non-compliance.
Mandatory Requirements Check: If the proposal fails to provide mandatory evidence (e.g., project references, personnel CVs as explicitly required in RFP Section 7), reflect that in the score with a severe penalty (<=33% of the criterion weight).

Output Format:
Return a structured JSON object with the following fields:
{
  "scores": [
    {
      "criterion": "Technical Compliance and Architecture",
      "weight": 30,
      "score_achieved": 28,
      "justification": "Detailed explanation..."
    }
  ],
  "total_score": 65.0,
  "strengths": ["strength 1", "strength 2"],
  "weaknesses": ["weakness 1", "weakness 2"]
}

Evaluation Guidelines:
Be factual - base all assessments solely on content present in the provided documents. Do not assume unstated capabilities.
Check mandatory requirements - highlight missing mandatory deliverables (e.g., references, CVs, on-premise statement) in the justification and weakness list.
Justification must be concise but substantive - tie each score to specific evidence (or lack thereof) from the vendor's response.
Total score = sum of all score_achieved values (since weights sum to 90 after excluding cost).
Strengths = max 5 items. Weaknesses = max 5 items, prioritizing mandatory omissions.

Input Data:
RFP Document:
${rfpFullText}

Vendor Response:
${proposalText}

Scoring Matrix:
${scoringMatrix}

Final Output:
Now evaluate the proposal and return only the JSON object. Do not include any additional commentary outside the JSON.`

  // Defaults in case LLM call fails
  let totalScore = 0
  let scoringBreakdown: any[] = []
  let strengths: string[] = []
  let weaknesses: any[] = []
  let recommendation = 'NOT RECOMMENDED'
  let reasoning = 'Evaluation could not be completed.'
  let validationStatus = 'EVALUATED'
  let mandatoryFailed: string[] = []
  let complianceBreakdown: any[] = []

  try {
    const rawEval = await callLLM(evalSystemPrompt, evalUserPrompt, env, 'gpt-5', 16000)
    console.log(`[eval-v48] LLM raw response length=${rawEval.length} preview="${rawEval.slice(0, 200)}"`)

    // Strip markdown fences if present
    let clean = rawEval.trim()
    if (clean.startsWith('```')) {
      const lines = clean.split('\n')
      clean = lines.slice(1).join('\n')
      clean = clean.slice(0, clean.lastIndexOf('```')).trim()
    }
    // Extract outermost JSON object
    const jsonMatch = clean.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON object in LLM response')
    const parsed = JSON.parse(jsonMatch[0])

    // ── Map parsed fields ──────────────────────────────────────────────────────
    const scores: Array<{ criterion: string; weight: number; score_achieved: number; justification: string }> =
      Array.isArray(parsed.scores) ? parsed.scores : []

    totalScore = typeof parsed.total_score === 'number'
      ? Math.round(parsed.total_score * 10) / 10
      : scores.reduce((sum: number, s: any) => sum + (Number(s.score_achieved) || 0), 0)

    // scoring_breakdown — direct pass-through of LLM criterion scores
    scoringBreakdown = scores.map((s: any) => ({
      criterion: s.criterion || '',
      weight: Number(s.weight) || 0,
      score_achieved: Math.max(0, Math.min(Number(s.weight) || 100, Number(s.score_achieved) || 0)),
      justification: s.justification || '',
      // Derived % for UI progress bars
      achieved_pct: s.weight > 0 ? Math.round((Number(s.score_achieved) / Number(s.weight)) * 100) : 0,
    }))

    // strengths — array of strings
    strengths = Array.isArray(parsed.strengths)
      ? parsed.strengths.filter((x: any) => typeof x === 'string').slice(0, 5)
      : []

    // weaknesses — keep as strings (UI already handles both string and object forms)
    weaknesses = Array.isArray(parsed.weaknesses)
      ? parsed.weaknesses.filter((x: any) => typeof x === 'string').slice(0, 5)
      : []

    // compliance_breakdown — synthesise from scores for backward compat with UI
    complianceBreakdown = scores.map((s: any) => ({
      id: `crit_${s.criterion?.replace(/\s+/g, '_').toLowerCase()}`,
      text: s.criterion,
      mandatory: false,
      compliance_met: (Number(s.score_achieved) / Math.max(1, Number(s.weight))) >= 0.5,
      ai_score: s.weight > 0 ? Math.round((Number(s.score_achieved) / Number(s.weight)) * 100) : 0,
      justification: s.justification || '',
    }))

    // Identify any low-scoring criteria as "mandatory failed" for recommendation logic
    mandatoryFailed = scores
      .filter((s: any) => Number(s.weight) >= 10 && (Number(s.score_achieved) / Math.max(1, Number(s.weight))) < 0.34)
      .map((s: any) => `${s.criterion} (${s.score_achieved}/${s.weight})`)

    validationStatus = 'EVALUATED'
    console.log(`[eval-v48] technical DONE total_score=${totalScore} criteria=${scores.length}`)

  } catch (evalErr: any) {
    console.log(`[eval-v48] LLM EXCEPTION: ${evalErr?.message || evalErr}`)
    validationStatus = 'EVAL_FAILED'
    reasoning = `Evaluation failed: ${evalErr?.message || evalErr}`
  }

  // ── Commercial / Cost Competitiveness scoring ────────────────────────────────
  // Runs after technical evaluation. Compares extracted budget against the RFP's
  // stated budget range (if any) and awards a score out of commercialWeight.
  // Scoring logic (read from RFP text):
  //   • If RFP states a budget ceiling (rfp.budget field), compare against it.
  //   • ≤ budget ceiling             → 100% of commercialWeight
  //   • ≤ 110% of budget ceiling     → 70%  of commercialWeight
  //   • ≤ 125% of budget ceiling     → 40%  of commercialWeight
  //   • > 125% of budget ceiling     → 10%  of commercialWeight
  //   • Budget not extracted         → 0  (excluded from total; note in reasoning)
  let commercialScore: number | null = null
  let commercialJustification = ''
  const commercialScoreAchieved: number | null = null  // kept as let for mutation below
  let commercialScoreActual: number | null = null

  if (budget.amount && commercialWeight > 0) {
    // Try to get RFP budget ceiling from rfp.budget field
    let rfpBudgetCeiling: number | null = null
    if (rfp.budget) {
      const rfpBudgetStr = String(rfp.budget).replace(/,/g, '')
      const rfpBudgetNum = parseFloat(rfpBudgetStr.replace(/[^\d.]/g, ''))
      if (rfpBudgetNum > 0 && rfpBudgetNum < 1e10) rfpBudgetCeiling = rfpBudgetNum
    }
    // Also search rfp_full_text for "budget" + number pattern as fallback
    if (!rfpBudgetCeiling && rfpFullText) {
      const budgetPatterns = [
        /total\s+budget[^a-z]*?([\d,]+(?:\.\d+)?)/i,
        /budget[^a-z]*?(?:aed|usd|eur)?\s*([\d,]+(?:\.\d+)?)/i,
        /(?:aed|usd|eur)\s*([\d,]+(?:\.\d+)?)\s*(?:total\s+budget|budget\s+ceiling|estimated\s+budget)/i,
      ]
      for (const pat of budgetPatterns) {
        const m = rfpFullText.match(pat)
        if (m) {
          const val = parseFloat(m[1].replace(/,/g, ''))
          if (val > 10000 && val < 1e10) { rfpBudgetCeiling = val; break }
        }
      }
    }

    if (rfpBudgetCeiling) {
      const ratio = budget.amount / rfpBudgetCeiling
      let pct: number
      if (ratio <= 1.0)  pct = 1.00
      else if (ratio <= 1.10) pct = 0.70
      else if (ratio <= 1.25) pct = 0.40
      else pct = 0.10

      commercialScoreActual = Math.round(pct * commercialWeight * 10) / 10
      const ratioStr = (ratio * 100).toFixed(0)
      commercialJustification = `Proposed cost ${budget.currency} ${budget.amount.toLocaleString()} is ${ratioStr}% of the RFP budget ceiling ${budget.currency} ${rfpBudgetCeiling.toLocaleString()}. Score: ${commercialScoreActual}/${commercialWeight} (${Math.round(pct*100)}%).`
    } else {
      // No RFP budget ceiling found — use market-average heuristic:
      // Score = commercialWeight × (1 - penalty), where penalty grows with budget size
      // This rewards lower bids relative to no benchmark (neutral mid score = 60%).
      commercialScoreActual = Math.round(commercialWeight * 0.6 * 10) / 10
      commercialJustification = `No RFP budget ceiling specified. Awarded ${Math.round(commercialWeight * 0.6 * 10)/10}/${commercialWeight} (neutral 60%) — budget extracted: ${budget.currency} ${budget.amount.toLocaleString()}. Manual review recommended.`
    }
    commercialScore = Math.round((commercialScoreActual / commercialWeight) * 100)
    console.log(`[eval-v48] commercial score=${commercialScoreActual}/${commercialWeight} (${commercialScore}%)`)
  } else {
    commercialJustification = budget.amount
      ? `Commercial criterion weight is 0 — excluded from scoring.`
      : `Budget could not be extracted from proposal text — commercial score omitted.`
    console.log(`[eval-v48] commercial skipped: budget=${budget.amount} weight=${commercialWeight}`)
  }

  // ── Merge commercial into total score ─────────────────────────────────────────
  const technicalScore = totalScore  // the /90 (or /technicalTotal) score from LLM
  if (commercialScoreActual !== null) {
    totalScore = Math.round((technicalScore + commercialScoreActual) * 10) / 10
    // Add commercial row to scoring breakdown
    scoringBreakdown.push({
      criterion: 'Commercial Proposal & Cost Competitiveness',
      weight: commercialWeight,
      score_achieved: commercialScoreActual,
      justification: commercialJustification,
      achieved_pct: commercialScore ?? 0,
    })
    // Add to compliance breakdown for UI back-compat
    complianceBreakdown.push({
      id: 'crit_commercial_proposal_cost_competitiveness',
      text: 'Commercial Proposal & Cost Competitiveness',
      mandatory: false,
      compliance_met: (commercialScore ?? 0) >= 50,
      ai_score: commercialScore ?? 0,
      justification: commercialJustification,
    })
  }

  const maxScore = technicalTotal + commercialWeight  // e.g. 90 + 10 = 100

  // ── Recommendation (now out of maxScore) ─────────────────────────────────────
  const threshold80 = maxScore * 0.80
  const threshold60 = maxScore * 0.60
  if (mandatoryFailed.length > 0) {
    recommendation = 'NOT RECOMMENDED'
    reasoning = `Critical criteria scored below 34%: ${mandatoryFailed.slice(0, 2).join('; ')}.`
  } else if (totalScore >= threshold80) {
    recommendation = 'RECOMMENDED'
    reasoning = `Strong overall score of ${totalScore}/${maxScore}. Proposal meets most RFP criteria.`
  } else if (totalScore >= threshold60) {
    recommendation = 'CONDITIONAL'
    reasoning = `Score of ${totalScore}/${maxScore} meets minimum threshold. Review weaknesses before proceeding.`
  } else {
    recommendation = 'NOT RECOMMENDED'
    reasoning = `Score of ${totalScore}/${maxScore} is below the acceptance threshold.`
  }

  console.log(`[eval-v48] FINAL total=${totalScore}/${maxScore} technical=${technicalScore}/${technicalTotal} commercial=${commercialScoreActual ?? 'n/a'}/${commercialWeight} rec=${recommendation}`)

  return {
    evaluated_at: new Date().toISOString(),
    proposal_id: proposal.id,
    vendor_name: proposal.vendor_name || '',
    total_score: totalScore,
    max_score: maxScore,
    recommendation,
    validation_status: validationStatus,
    compliance_score: totalScore,
    quality_score: totalScore,
    commercial_score: commercialScore,
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
    glossary_used: 0,
    text_chars_analyzed: proposalText.length,
  }
}

// ── POST /callback/proposals/:proposalId/file-ocr-complete ───────────────────
// Called by sidecar once per uploaded file when OCR finishes at submission time.
// Appends extracted text to proposal_full_text. Multiple files arrive as separate calls.
apiRouter.post('/callback/proposals/:proposalId/file-ocr-complete', async (c) => {
  const proposalId = c.req.param('proposalId')
  const label    = decodeURIComponent(c.req.query('label') || 'other')
  const filename = decodeURIComponent(c.req.query('filename') || 'document.pdf')
  const db = c.env.DB
  const expectedSecret = c.env.PDF_SIDECAR_SECRET || (globalThis as any).PDF_SIDECAR_SECRET || ''
  try {
    const body: any = await c.req.json()
    if (expectedSecret && body.callback_secret !== expectedSecret) return c.json({ error: 'Unauthorized' }, 401)

    // Build section text for this file
    let fileText: string
    if (body.ok && body.chars >= 100) {
      fileText = `=== FILE: ${filename} [label: ${label}] (${body.pages_extracted}/${body.pages_total} pages, ${body.chars} chars) ===\n\n${body.text}`
    } else {
      fileText = `=== FILE: ${filename} [label: ${label}] — OCR yielded ${body.chars || 0} chars${body.error ? ': ' + body.error : ''} ===`
    }

    // Append to existing proposal_full_text (multiple files arrive independently)
    const existing = await db.prepare(`SELECT proposal_full_text FROM proposals WHERE id=?`).bind(proposalId).first<any>()
    const currentText: string = existing?.proposal_full_text || ''
    const merged = (currentText + '\n\n' + fileText).slice(0, 200000).trim()

    await db.prepare(`UPDATE proposals SET proposal_full_text=?, updated_at=datetime('now') WHERE id=?`).bind(merged, proposalId).run()
    console.log(`[file-ocr-callback] proposalId=${proposalId} label=${label} chars=${body.chars} total_merged=${merged.length}`)

    // v49: Decrement ocr_pending_files counter. When it hits 0 and we have text, mark ready_for_evaluation.
    await db.prepare(`
      UPDATE proposals
      SET ocr_pending_files = MAX(0, COALESCE(ocr_pending_files, 1) - 1),
          updated_at = datetime('now')
      WHERE id=?
    `).bind(proposalId).run()

    const fresh = await db.prepare(`SELECT ocr_pending_files, proposal_full_text FROM proposals WHERE id=?`).bind(proposalId).first<any>()
    const pending = fresh?.ocr_pending_files ?? 0
    const hasText = (fresh?.proposal_full_text?.length || 0) > 100
    if (pending === 0 && hasText) {
      await db.prepare(`UPDATE proposals SET status='ready_for_evaluation', updated_at=datetime('now') WHERE id=?`).bind(proposalId).run()
      console.log(`[file-ocr-callback] proposalId=${proposalId} → status=ready_for_evaluation`)
    } else {
      console.log(`[file-ocr-callback] proposalId=${proposalId} pending_files=${pending} hasText=${hasText} — not yet ready`)
    }

    return c.json({ ok: true, merged_chars: merged.length, pending_files: pending })
  } catch (e: any) {
    console.error(`[file-ocr-callback] error: ${e?.message}`)
    return c.json({ ok: false, error: e?.message }, 500)
  }
})

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

    // v49: Gate on OCR readiness — only evaluate proposals with status in the allowed set.
    // Legacy grace: submitted proposals with OCR text already extracted are also allowed.
    const EVAL_READY_STATUSES = ['ready_for_evaluation', 'evaluated', 'awarded', 'not_awarded', 'simulated']
    const isReadyP = (p: any) => {
      const st = p.status || 'submitted'
      if (EVAL_READY_STATUSES.includes(st)) return true
      // Legacy: text already extracted
      return (p.proposal_full_text?.length || 0) > 100 || p.ocr_job_status === 'done'
    }
    const notReady = proposals.filter((p: any) => !isReadyP(p))
    if (notReady.length > 0) {
      // If ALL proposals are not ready, block entirely
      if (notReady.length === proposals.length) {
        return c.json({
          ok: false,
          blocked: true,
          not_ready_count: notReady.length,
          message: `${notReady.length} proposal(s) are still being prepared for evaluation — their documents are being processed. Please wait a moment and try again.`,
        }, 202)
      }
      // Partial: filter to only ready proposals and continue
    }
    const readyProposals = proposals.filter((p: any) => isReadyP(p))

    const results: any[] = []
    // Add skipped entries for not-ready proposals
    for (const p of notReady) {
      results.push({ id: p.id, vendor: p.vendor_name, skipped: true, reason: 'Documents still being processed' })
    }
    for (const proposal of readyProposals) {
      try {
        const evalData = await evaluateProposal(proposal, rfp, c.env)
        await db.prepare(`
          UPDATE proposals SET
            evaluation_data=?, ai_total_score=?, ai_recommendation=?,
            ai_validation_status=?, ai_evaluated_at=datetime('now'),
            ai_compliance_score=?, ai_quality_score=?, ai_commercial_score=?,
            status='evaluated', updated_at=datetime('now')
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
    return c.json({ ok: true, evaluated: results.filter((r: any) => !r.skipped).length, skipped: notReady.length, results })
  } catch (e: any) {
    return c.json({ ok: false, error: e?.message }, 500)
  }
})

// ── POST /api/rfps/:rfpId/proposals/:proposalId/evaluate — single evaluation ─
// New async flow for image-based PDFs:
//   1. If proposalText is available in DB → run scoring synchronously as before (fast path)
//   2. If proposalText is empty → fire sidecar async with callback_url, return 202 immediately
//      Sidecar will POST back to /api/callback/proposals/:id/ocr-complete when done
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

    // v49: Gate on OCR readiness — block evaluation if documents are still being processed.
    // Legacy grace: if status='submitted' but OCR text already exists (ocr_job_status='done' or
    // proposal_full_text present), allow evaluation so existing proposals keep working.
    const SINGLE_EVAL_READY = ['ready_for_evaluation', 'evaluated', 'awarded', 'not_awarded', 'simulated']
    const propStatus = proposal.status || 'submitted'
    const hasText = (proposal.proposal_full_text?.length || 0) > 100 || proposal.ocr_job_status === 'done'
    if (!SINGLE_EVAL_READY.includes(propStatus) && !hasText) {
      return c.json({
        ok: false,
        blocked: true,
        status: propStatus,
        message: 'This proposal\'s documents are still being prepared for evaluation. Please wait a moment and try again.',
        proposal_id: parseInt(proposalId),
      }, 202)
    }

    // v28: text must already be in DB (extracted at upload time)
    // evaluateProposal() returns OCR_PENDING if proposal_full_text is empty
    const evalData = await evaluateProposal(proposal, rfp, c.env)

    if (evalData.validation_status === 'OCR_PENDING') {
      // Text not ready yet — tell UI to wait and retry
      return c.json({
        ok: true,
        status: 'ocr_pending',
        validation_status: 'OCR_PENDING',
        message: 'Proposal text extraction is still running. Please wait 1-2 minutes and try again.',
        proposal_id: parseInt(proposalId),
      }, 202)
    }

    await db.prepare(`
      UPDATE proposals SET
        evaluation_data=?, ai_total_score=?, ai_recommendation=?,
        ai_validation_status=?, ai_evaluated_at=datetime('now'),
        ai_compliance_score=?, ai_quality_score=?, ai_commercial_score=?,
        ocr_job_status='done', status='evaluated', updated_at=datetime('now')
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

// ── POST /api/callback/proposals/:proposalId/ocr-complete ─────────────────────
// Called by the sidecar when OCR finishes (async callback pattern).
// PIPELINE — (1) persist OCR text, (2) load proposal + RFP rows,
//            (3) call evaluateProposal() — same single gpt-5 full-document
//                scoring path used by the synchronous evaluate endpoint.
apiRouter.post('/callback/proposals/:proposalId/ocr-complete', async (c) => {
  const proposalId = c.req.param('proposalId')
  const rfpId = c.req.query('rfp_id') || ''
  const db = c.env.DB
  const expectedSecret = c.env.PDF_SIDECAR_SECRET || (globalThis as any).PDF_SIDECAR_SECRET || ''

  try {
    const body: any = await c.req.json()
    console.log(`[ocr-callback] received proposalId=${proposalId} ok=${body.ok} chars=${body.chars}`)

    if (expectedSecret && body.callback_secret !== expectedSecret) {
      console.error(`[ocr-callback] invalid callback_secret`)
      return c.json({ error: 'Unauthorized' }, 401)
    }

    if (!body.ok) {
      await db.prepare(`UPDATE proposals SET ocr_job_status='error', updated_at=datetime('now') WHERE id=?`).bind(proposalId).run()
      return c.json({ ok: false, error: body.error })
    }

    const ocrText: string = (body.text || '').slice(0, 50000)
    console.log(`[ocr-callback] OCR chars=${ocrText.length}`)

    // 1. Persist OCR text immediately
    await db.prepare(`UPDATE proposals SET ocr_job_text=?, updated_at=datetime('now') WHERE id=?`)
      .bind(ocrText, proposalId).run()

    // 2. Load proposal + RFP
    const proposal = await db.prepare(
      `SELECT p.*, v.name as vendor_name FROM proposals p LEFT JOIN vendors v ON p.vendor_id=v.id WHERE p.id=?`
    ).bind(proposalId).first<any>()
    if (!proposal) return c.json({ error: 'Proposal not found' }, 404)

    const rfpRow = rfpId
      ? await db.prepare('SELECT * FROM rfps WHERE id=?').bind(rfpId).first<any>()
      : await db.prepare('SELECT * FROM rfps WHERE id=?').bind(proposal.rfp_id).first<any>()
    if (!rfpRow) return c.json({ error: 'RFP not found' }, 404)

    // 3. Run full evaluation using the same single gpt-5 call as evaluateProposal()
    // proposal_full_text already includes ocrText merged in — pass the freshly stored row
    // (reload so proposal_full_text reflects the newly written ocr text if needed)
    const freshProposal = await db.prepare(
      `SELECT p.*, v.name as vendor_name FROM proposals p LEFT JOIN vendors v ON p.vendor_id=v.id WHERE p.id=?`
    ).bind(proposalId).first<any>()

    // evaluateProposal reads proposal_full_text (or falls back to ocr_job_text) internally
    const evalData = await evaluateProposal(freshProposal || proposal, rfpRow, { DB: db })

    // 4. Save to DB
    const totalScore = evalData.total_score ?? 0
    const recommendation = evalData.recommendation ?? 'NOT RECOMMENDED'
    await db.prepare(`
      UPDATE proposals SET
        evaluation_data=?, ai_total_score=?, ai_recommendation=?,
        ai_validation_status=?, ai_evaluated_at=datetime('now'),
        ai_compliance_score=?, ai_quality_score=?, ai_commercial_score=NULL,
        ocr_job_status='done', status='evaluated', updated_at=datetime('now')
      WHERE id=?
    `).bind(
      JSON.stringify(evalData),
      totalScore,
      recommendation,
      evalData.validation_status ?? 'EVALUATED',
      Math.round(evalData.compliance_score ?? totalScore),
      Math.round(evalData.quality_score ?? totalScore),
      proposalId
    ).run()

    console.log(`[ocr-callback] DONE score=${totalScore} recommendation=${recommendation} chars=${evalData.text_chars_analyzed}`)
    return c.json({ ok: true, score: totalScore, recommendation, chars_analyzed: evalData.text_chars_analyzed })

  } catch (e: any) {
    console.error(`[ocr-callback] error: ${e?.message}`)
    await db.prepare(`UPDATE proposals SET ocr_job_status='error', updated_at=datetime('now') WHERE id=?`).bind(proposalId).run()
    return c.json({ ok: false, error: e?.message }, 500)
  }
})

// ── POST /api/rfps/:rfpId/proposals/:proposalId/evaluate-budget ──────────────
// v28: No sidecar calls. Reads directly from proposal_full_text (extracted at upload time).
// Finds the commercial file section (=== FILE: ... [label: commercial] ===) and runs
// runBudgetLLM() synchronously. Falls back to full proposal_full_text or legacy fields
// if no commercial section is found. Returns 200 with budget data or 202 if text missing.
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

    // ── Step 1: build the full text from DB (no PDFs ever touched here) ──────
    const fullText: string = extractProposalText(proposal)
    if (fullText.length < 100) {
      console.log(`[eval-budget] no text in DB for proposalId=${proposalId} — OCR may still be running`)
      return c.json({
        ok: true,
        status: 'ocr_pending',
        message: 'Proposal text extraction is still running. Please wait 1-2 minutes and try again.',
        proposal_id: parseInt(proposalId),
      }, 202)
    }

    // ── Step 2: try to isolate the commercial section ─────────────────────────
    // proposal_full_text is built by the callback as:
    //   === FILE: <filename> [label: <label>] ===\n<text>\n
    // We find the block whose label includes "commercial".
    let budgetText = ''
    let textSource = 'full_text'

    // Try to find commercial section marker
    const commercialMatch = fullText.match(
      /={3} FILE:[^\n]*\[label:\s*commercial[^\]]*\][^\n]*\n([\s\S]*?)(?:={3} FILE:|$)/i
    )
    if (commercialMatch && commercialMatch[1].trim().length > 100) {
      budgetText = commercialMatch[1].trim()
      textSource = 'commercial_section'
      console.log(`[eval-budget] found commercial section: ${budgetText.length} chars`)
    } else {
      // No labelled commercial section — fall back to entire merged text
      // (covers legacy proposals that have ocr_job_text or only one attachment)
      budgetText = fullText
      textSource = fullText === proposal.proposal_full_text ? 'proposal_full_text'
                 : fullText === proposal.ocr_job_text       ? 'ocr_job_text'
                 : 'legacy_fields'
      console.log(`[eval-budget] no commercial section found — using ${textSource} (${budgetText.length} chars)`)
    }

    // ── Step 3: run budget LLM synchronously ─────────────────────────────────
    const result = await runBudgetLLM(budgetText, proposal, db, c.env)
    return c.json({ ok: true, ...result, text_source: textSource })

  } catch (e: any) {
    console.error(`[eval-budget] error: ${e?.message}`)
    return c.json({ ok: false, error: e?.message }, 500)
  }
})

// ── POST /api/callback/proposals/:proposalId/budget-complete ──────────────────
// Called by sidecar when commercial PDF OCR finishes.
// Runs the 6-step budget LLM prompt and saves result to DB.
apiRouter.post('/callback/proposals/:proposalId/budget-complete', async (c) => {
  const proposalId = c.req.param('proposalId')
  const db = c.env.DB
  const expectedSecret = c.env.PDF_SIDECAR_SECRET || (globalThis as any).PDF_SIDECAR_SECRET || ''

  try {
    const body: any = await c.req.json()
    console.log(`[budget-callback] received for proposalId=${proposalId} ok=${body.ok} chars=${body.chars}`)

    if (expectedSecret && body.callback_secret !== expectedSecret) {
      return c.json({ error: 'Unauthorized' }, 401)
    }

    if (!body.ok) {
      await db.prepare(`UPDATE proposals SET ocr_job_status='error', updated_at=datetime('now') WHERE id=?`).bind(proposalId).run()
      return c.json({ ok: false, error: body.error })
    }

    const ocrText: string = body.text || ''
    console.log(`[budget-callback] OCR text: ${ocrText.length} chars`)

    const proposal = await db.prepare(`
      SELECT p.*, v.name as vendor_name FROM proposals p
      LEFT JOIN vendors v ON p.vendor_id = v.id WHERE p.id=?
    `).bind(proposalId).first<any>()
    if (!proposal) return c.json({ error: 'Proposal not found' }, 404)

    // Cache OCR text so future calls skip sidecar
    await db.prepare(`UPDATE proposals SET ocr_budget_text=?, updated_at=datetime('now') WHERE id=?`)
      .bind(ocrText.slice(0, 50000), proposalId).run()

    const result = await runBudgetLLM(ocrText, proposal, db, undefined)

    await db.prepare(`UPDATE proposals SET ocr_job_status='done', updated_at=datetime('now') WHERE id=?`).bind(proposalId).run()

    console.log(`[budget-callback] budget extracted: amount=${result.budget_amount} currency=${result.budget_currency}`)
    return c.json({ ok: true, ...result })

  } catch (e: any) {
    console.error(`[budget-callback] error: ${e?.message}`)
    await db.prepare(`UPDATE proposals SET ocr_job_status='error', updated_at=datetime('now') WHERE id=?`).bind(proposalId).run()
    return c.json({ ok: false, error: e?.message }, 500)
  }
})

// ── Shared budget LLM function ────────────────────────────────────────────────
// Uses the structured extraction prompt: sums core phase costs + mandatory
// 3rd-party licenses; excludes optional add-ons, support, VAT, hosting.
async function runBudgetLLM(proposalText: string, proposal: any, db: D1Database, env?: any): Promise<any> {
  const systemPrompt = `You are a procurement expert AI. Your task is to analyze the provided vendor proposal text and extract the TOTAL PROJECT COST and TOTAL PROJECT DURATION.`

  const userPrompt = `Follow these rules strictly:

1.  **Total Cost Calculation**:
    *   Identify all core project development phases (e.g., MVP1, MVP2, Phase 1, Phase 2, etc.) and sum their fixed-price costs.
    *   Identify all mandatory third-party software licenses explicitly stated in the proposal as required for the base solution, and add their first-year cost to the sum.
    *   **STRICTLY EXCLUDE** the following from the total: Optional add-on services (e.g., separate training workshops), post-launch ongoing support/maintenance fees, Value Added Tax (VAT), and infrastructure/hosting costs (unless explicitly bundled into the mandatory phase totals).

2.  **Duration Calculation**:
    *   Identify the timeline. Sum the durations of all sequential phases (e.g., MVP1 + MVP2).
    *   If the proposal states a total duration directly (e.g., "7 months"), use that.
    *   Express the duration in months (e.g., "7 months") or weeks if months are not specified.

3.  **Output Format**:
    *   Return **ONLY** a valid JSON object.
    *   Do not include any other text, explanations, or markdown formatting (like \`\`\`json) in your response.
    *   The JSON must have exactly these two keys:
        *   "total_cost": A string, including the currency code and the formatted number (e.g., "1,000,000 USD").
        *   "duration": A string, specifying the total time (e.g., "7 months").

Example Output:
{"total_cost": "1,000,000 USD", "duration": "7 months"}

Now, analyze the following vendor proposal text and output the JSON:

${proposalText}`

  const rawBudget = await callLLM(systemPrompt, userPrompt, env || {}, 'gpt-5', 16000)

  // Strip markdown fences
  let cleanRaw = rawBudget.trim()
  if (cleanRaw.startsWith('```')) {
    cleanRaw = cleanRaw.split('\n').slice(1).join('\n').replace(/```\s*$/, '').trim()
  }

  const jsonMatch = cleanRaw.match(/\{[\s\S]*?\}/)
  if (!jsonMatch) return { budget_amount: null, budget_currency: 'USD', budget_confidence: 0, duration: null, missing_info: ['LLM returned no JSON'] }

  let parsed: any
  try { parsed = JSON.parse(jsonMatch[0]) } catch (_) {
    return { budget_amount: null, budget_currency: 'USD', budget_confidence: 0, duration: null, missing_info: ['JSON parse failed'] }
  }

  // Parse "total_cost" string like "1,832,436 AED" or "AED 1,832,436"
  let budgetAmount: number | null = null
  let budgetCurrency = 'USD'
  const totalCostStr: string = (parsed.total_cost || '').toString()
  if (totalCostStr) {
    // Extract currency code
    const curMatch = totalCostStr.match(/\b(AED|USD|EUR|GBP|SAR|QAR|KWD|BHD)\b/i)
    if (curMatch) budgetCurrency = curMatch[1].toUpperCase()
    // Extract numeric value
    const numMatch = totalCostStr.replace(/,/g, '').match(/[\d]+(?:\.\d+)?/)
    if (numMatch) {
      const val = parseFloat(numMatch[0])
      if (val > 0 && val < 1e10) budgetAmount = Math.round(val)
    }
  }

  const duration: string | null = (parsed.duration && typeof parsed.duration === 'string')
    ? parsed.duration
    : (proposal.proposed_duration || null)

  if (budgetAmount) {
    await db.prepare(`
      UPDATE proposals SET budget_amount=?, budget_currency=?, proposed_duration=?, updated_at=datetime('now') WHERE id=?
    `).bind(budgetAmount, budgetCurrency, duration, proposal.id).run()
    try {
      let evalData: any = {}
      try { evalData = JSON.parse(proposal.evaluation_data || '{}') } catch (_) {}
      evalData.budget_extracted = budgetAmount
      evalData.budget_currency  = budgetCurrency
      evalData.budget_confidence = 0.9   // high confidence — model was given clear rules
      evalData.duration_extracted = duration
      await db.prepare(`UPDATE proposals SET evaluation_data=? WHERE id=?`).bind(JSON.stringify(evalData), proposal.id).run()
    } catch (_) {}
  }

  return {
    budget_amount:     budgetAmount,
    budget_currency:   budgetCurrency,
    budget_confidence: budgetAmount ? 0.9 : 0,
    duration,
    raw_total_cost: totalCostStr,
    missing_info:  budgetAmount ? [] : ['Could not parse monetary value from LLM response'],
    text_chars:    proposalText.length,
  }
}

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

    // Fire async OCR for each uploaded file — each calls back to /callback/proposals/:id/file-ocr-complete
    // The callback merges all texts into proposal_full_text. No OCR happens at evaluation time.
    const workerBase = `https://a7b32759-e743-4139-9bb0-4bae44886667.vip.gensparksite.com/api`
    const callbackSecret = c.env.PDF_SIDECAR_SECRET || (globalThis as any).PDF_SIDECAR_SECRET || ''
    let ocrFired = 0
    for (const att of storedAttachments) {
      if (!att.r2_key) continue
      const pdfUrl = `${workerBase}/proposals/pdf/${encodeURIComponent(att.r2_key)}`
      const cbUrl  = `${workerBase}/callback/proposals/${proposalId}/file-ocr-complete?label=${encodeURIComponent(att.label || 'other')}&filename=${encodeURIComponent(att.filename || 'document.pdf')}`
      try {
        await callSidecarAsync(pdfUrl, c.env, 100, cbUrl, callbackSecret)
        ocrFired++
      } catch (_) {}
    }
    console.log(`[submit] OCR fired for ${ocrFired}/${storedAttachments.length} files`)

    // v49: Track how many file-ocr-complete callbacks are still expected.
    // When all arrive, the callback sets status='ready_for_evaluation'.
    // If no files were OCR'd (e.g. no attachments), mark ready immediately.
    if (ocrFired > 0) {
      await c.env.DB.prepare(
        `UPDATE proposals SET ocr_pending_files=?, updated_at=datetime('now') WHERE id=?`
      ).bind(ocrFired, proposalId).run()
    } else {
      // No OCR to wait for — proposal is immediately ready for evaluation
      await c.env.DB.prepare(
        `UPDATE proposals SET ocr_pending_files=0, status='ready_for_evaluation', updated_at=datetime('now') WHERE id=?`
      ).bind(proposalId).run()
    }

    return c.json({
      ok: true,
      proposal_id: proposalId,
      vendor_name: vendorName,
      files_stored: storedAttachments.length,
      ocr_started: ocrFired,
      message: 'Proposal submitted successfully. Text extraction running in background.',
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
// settings: optional key→value map from the settings table (procurement_email, issuer_name, issuer_location)
function buildRFPPrompt(data: any, archDocText: string, brdDocText: string, scoringMatrixJson?: string | null, settings?: Record<string,string>): { systemPrompt: string; userPrompt: string } {
  const procEmail    = settings?.procurement_email   || 'procurement@andersenlab.com'
  const issuerName   = settings?.issuer_name         || 'Andersen'
  const issuerLoc    = settings?.issuer_location     || 'Warsaw, Poland'
  const systemPrompt = `You are a senior government procurement specialist at the Andersen. You are producing a formal, comprehensive, publication-ready Request for Proposal (RFP) document issued to external vendors on official Andersen letterhead.

IDENTITY AND TONE
- You write on behalf of the Andersen, a leading professional services firm.
- Language must be authoritative, precise, and formal, as if it will be signed and approved by a Director-General.
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
Each page is rendered as a standalone A4 div that contains the full Andersen corporate letterhead structure — header band, accent rule, wordmark lockup, content area, and footer — ALL built from inline HTML with inline styles. Do NOT use background images.

PAGING: Output multiple A4 pages as separate page divs.
Each page div uses exactly this inline style:
style="position:relative; width:794px; height:1123px; max-width:794px; margin:0 auto 20px auto; background:#ffffff; overflow:hidden; box-sizing:border-box; page-break-after:always; font-family:Roboto,Arial,'Segoe UI',sans-serif; color:#020303;"

LETTERHEAD STRUCTURE — reproduce EXACTLY inside every page div (all inline styles, no classes):

<!-- 1. WORDMARK LOCKUP (top of every page) -->
<div style="padding:18px 36px 14px; display:flex; align-items:center; gap:18px; border-bottom:none;">
  <div style="display:flex; align-items:center; gap:14px;">
    <div style="font-family:Roboto,Arial,sans-serif; font-size:18px; font-weight:700; color:#020D1C; letter-spacing:-0.02em;">Andersen</div>
    <div style="width:1px; height:28px; background:#E0E0E0;"></div>
    <div style="font-family:'Courier New',monospace; font-size:9px; letter-spacing:0.22em; text-transform:uppercase; color:#556170; line-height:1.6;"><strong style="color:#020303; font-weight:500;">Software Engineering</strong><br/>Group &middot; Global</div>
  </div>
</div>

<!-- 2. YELLOW TOP BAND with topographic lines -->
<div style="height:48px; background:#FFDB00; position:relative; overflow:hidden; flex-shrink:0;">
  <svg style="position:absolute;top:0;left:0;width:100%;height:100%;display:block;" viewBox="0 0 794 48" preserveAspectRatio="none" fill="none">
    <path d="M-10 12 Q 100 3, 220 17 T 460 20 Q 580 26, 810 10" stroke="#020303" stroke-width="0.7" stroke-opacity="0.55"/>
    <path d="M-10 24 Q 120 11, 240 29 T 480 32 Q 620 38, 810 22" stroke="#020303" stroke-width="0.7" stroke-opacity="0.45"/>
    <path d="M-10 36 Q 140 22, 260 39 T 500 43 Q 640 50, 810 32" stroke="#020303" stroke-width="0.7" stroke-opacity="0.35"/>
    <circle cx="120" cy="14" r="2.5" fill="#020303"/>
    <circle cx="300" cy="29" r="2" fill="#020303"/>
    <circle cx="460" cy="20" r="3" fill="#020303"/>
    <circle cx="620" cy="38" r="2" fill="#020303"/>
    <circle cx="740" cy="17" r="2.5" fill="#020303"/>
  </svg>
  <div style="position:absolute;top:50%;right:36px;transform:translateY(-50%);font-family:'Courier New',monospace;font-size:9px;letter-spacing:0.24em;text-transform:uppercase;color:#020303;opacity:0.55;">Andersen &middot; Est. 2007</div>
</div>

<!-- 3. DOTTED ACCENT RULE -->
<div style="height:18px; display:flex; align-items:center; padding:0 36px; gap:5px; border-bottom:1px solid #E0E0E0;">
  <span style="display:block;width:5px;height:5px;border-radius:50%;background:#E0E0E0;"></span>
  <span style="display:block;width:5px;height:5px;border-radius:50%;background:#E0E0E0;"></span>
  <span style="display:block;width:7px;height:7px;border-radius:50%;background:#FFDB00;"></span>
  <span style="display:block;width:5px;height:5px;border-radius:50%;background:#E0E0E0;"></span>
  <span style="display:block;width:5px;height:5px;border-radius:50%;background:#E0E0E0;"></span>
  <span style="flex:1;height:1px;background:#E0E0E0;margin:0 4px;"></span>
  <span style="display:block;width:7px;height:7px;border-radius:50%;background:#FFDB00;"></span>
  <span style="display:block;width:5px;height:5px;border-radius:50%;background:#E0E0E0;"></span>
  <span style="display:block;width:5px;height:5px;border-radius:50%;background:#E0E0E0;"></span>
</div>

<!-- 4. CONTENT AREA (place all page content here) -->
<div style="padding:20px 56px 88px; position:relative; overflow:hidden; height:997px; box-sizing:border-box;">
  [PAGE CONTENT GOES HERE]
</div>

<!-- 5. FOOTER -->
<div style="position:absolute; bottom:0; left:0; right:0; background:#020D1C; color:#B8C0CB; padding:16px 36px; display:flex; justify-content:space-between; align-items:center; font-size:9px; letter-spacing:0.05em; height:68px; box-sizing:border-box;">
  <div style="display:flex; gap:28px;">
    <div><div style="font-family:'Courier New',monospace;font-size:8px;letter-spacing:0.2em;text-transform:uppercase;color:#FFDB00;margin-bottom:3px;">Web</div><div style="font-family:Roboto,Arial,sans-serif;font-size:9px;color:#D8DEE8;">andersenlab.com</div></div>
    <div><div style="font-family:'Courier New',monospace;font-size:8px;letter-spacing:0.2em;text-transform:uppercase;color:#FFDB00;margin-bottom:3px;">Contact</div><div style="font-family:Roboto,Arial,sans-serif;font-size:9px;color:#D8DEE8;">${procEmail}</div></div>
    <div><div style="font-family:'Courier New',monospace;font-size:8px;letter-spacing:0.2em;text-transform:uppercase;color:#FFDB00;margin-bottom:3px;">Offices</div><div style="font-family:Roboto,Arial,sans-serif;font-size:9px;color:#D8DEE8;">Warsaw &middot; Berlin &middot; London &middot; New York</div></div>
  </div>
  <div style="display:flex; flex-direction:column; align-items:flex-end; gap:4px;">
    <div style="font-family:Roboto,Arial,sans-serif;font-size:12px;font-weight:700;color:#ffffff;letter-spacing:-0.01em;">Andersen</div>
    <div style="font-family:'Courier New',monospace;font-size:8px;letter-spacing:0.18em;text-transform:uppercase;color:#FFDB00;">&copy; Andersen 2026</div>
  </div>
</div>

PAGING GUIDE:
- Page 1: Cover page only -- title, subtitle, RFP metadata table, Table of Contents
- Page 2: Sections 1 and 2 (Background and Objectives)
- Page 3 onward: Scope of Work sections (3.1, 3.2 ...) -- use as many pages as needed
- Continue: Technical Requirements, Evaluation Criteria, Vendor Qualifications, Submission Timeline, Terms and Conditions
- Each major section starts at or near the top of a new page

COVER PAGE METADATA TABLE (place inside the content area on page 1, after title and subtitle):
<table style="width:80%; margin:16pt auto; border-collapse:collapse; font-family:Roboto,Arial,sans-serif; font-size:10.5pt; color:#020303;">
  <tr><td style="padding:5pt 10pt; border:1px solid #E0E0E0; font-weight:700; width:38%;">RFP Reference Number</td><td style="padding:5pt 10pt; border:1px solid #E0E0E0;">[insert ref_number]</td></tr>
  <tr><td style="padding:5pt 10pt; border:1px solid #E0E0E0; font-weight:700;">Issue Date</td><td style="padding:5pt 10pt; border:1px solid #E0E0E0;">[insert today date]</td></tr>
  <tr><td style="padding:5pt 10pt; border:1px solid #E0E0E0; font-weight:700;">Proposal Submission Deadline</td><td style="padding:5pt 10pt; border:1px solid #E0E0E0;">[insert deadline]</td></tr>
  <tr><td style="padding:5pt 10pt; border:1px solid #E0E0E0; font-weight:700;">Category</td><td style="padding:5pt 10pt; border:1px solid #E0E0E0;">[insert category]</td></tr>
  <tr><td style="padding:5pt 10pt; border:1px solid #E0E0E0; font-weight:700;">Issuing Authority</td><td style="padding:5pt 10pt; border:1px solid #E0E0E0;">${issuerName}, ${issuerLoc}</td></tr>
  <tr><td style="padding:5pt 10pt; border:1px solid #E0E0E0; font-weight:700;">Submission Email</td><td style="padding:5pt 10pt; border:1px solid #E0E0E0;">${procEmail}</td></tr>
</table>

COLOR PALETTE -- STRICTLY ENFORCED
- All body text: #020303 (near-black, Andersen ink)
- Section heading underline accent: #FFDB00 (Andersen yellow)
- Table and rule borders: #E0E0E0 (light grey)
- Footer: navy background #020D1C with yellow #FFDB00 labels
- Accent highlights (e.g. yellow row stripe): #FFDB00 at very low opacity or #FFFDE7
- PROHIBITED everywhere in body content: blues, greens, teals, oranges, gradients, reds, any other accent color

TYPOGRAPHY -- ALL STYLES MUST BE INLINE (required for self-contained HTML and PDF export)
Apply every style as an inline style= attribute. No style blocks. No CSS classes.

TITLE: style="font-family:Roboto,Arial,sans-serif; font-size:20pt; font-weight:700; text-align:center; color:#020303; margin:0 0 10pt 0; line-height:1.2;"
SUBTITLE REQUEST FOR PROPOSAL: style="font-family:Roboto,Arial,sans-serif; font-size:13.5pt; font-weight:300; text-align:center; letter-spacing:2.5px; color:#020303; margin:16pt 0 16pt 0;"
SECTION HEADING: style="font-family:Roboto,Arial,sans-serif; font-size:13pt; font-weight:700; color:#020303; margin-top:14pt; margin-bottom:7pt; padding-bottom:3pt; border-bottom:2px solid #FFDB00;"
SUBHEADING: style="font-family:Roboto,Arial,sans-serif; font-size:11pt; font-weight:700; color:#020303; margin-top:10pt; margin-bottom:4pt;"
BODY PARAGRAPH p: style="font-family:Roboto,Arial,sans-serif; font-size:10.5pt; line-height:1.35; color:#020303; margin:0 0 5pt 0; text-align:justify;"
BULLET LIST ul: style="font-family:Roboto,Arial,sans-serif; font-size:10.5pt; line-height:1.35; color:#020303; list-style-type:disc; padding-left:18pt; margin:3pt 0 6pt 0;"
LIST ITEM li: style="margin-bottom:3pt; color:#020303;"
NUMBERED LIST ol: style="font-family:Roboto,Arial,sans-serif; font-size:10.5pt; line-height:1.35; color:#020303; padding-left:18pt; margin:3pt 0 6pt 0;"

TABLE OF CONTENTS ROWS:
Top-level: <div style="display:flex; justify-content:space-between; border-bottom:1px dotted #E0E0E0; padding:4pt 0; font-family:Roboto,Arial,sans-serif; font-size:10.5pt; color:#020303;"><span style="font-weight:700;">N. Section Title</span><span style="white-space:nowrap;">N</span></div>
Sub-item: <div style="display:flex; justify-content:space-between; border-bottom:1px dotted #E0E0E0; padding:3pt 0 3pt 16pt; font-family:Roboto,Arial,sans-serif; font-size:10.5pt; color:#020303;"><span>N.M Sub-section Title</span><span style="white-space:nowrap;">N</span></div>

TABLES (use for technical requirements, evaluation criteria, qualification requirements, timeline):
Outer: <table style="width:100%; border-collapse:collapse; font-family:Roboto,Arial,sans-serif; font-size:10.5pt; color:#020303; margin:6pt 0 10pt 0;">
Header th: style="font-weight:700; color:#020303; background:#FFFDE7; padding:5pt 7pt; border:1px solid #E0E0E0; text-align:left;"
Data td: style="color:#020303; background:#FFFFFF; padding:5pt 7pt; border:1px solid #E0E0E0; vertical-align:top;"
Rules: No colored cell fills. No merged cells. Alternate rows may use #FAFAFA background for readability if needed.

CONTENT RULES -- STRICTLY ENFORCED
1. ALL content must be derived exclusively from the PROVIDED PROJECT DETAILS and SUPPORTING DOCUMENTS. Do not invent, add, or extrapolate anything.
2. Scope of Work sub-sections must cover every workstream, phase, and deliverable mentioned. Do not omit or condense.
3. Section 4 (Technical Requirements) must be a STRUCTURED TABLE with columns: Requirement Area | Specific Requirement | Classification (Mandatory or Preferred). Minimum 15 rows. One requirement per row.
4. Evaluation Criteria weights must sum to exactly 100 percent.
5. Section 7 (Submission Requirements and Timeline) must include a FULL procurement milestone table: RFP Issue Date, Clarification Request Deadline, ${issuerName} Responses to Clarifications, Proposal Submission Deadline, Evaluation Period, Award Notification, Contract Signature, Project Kick-off. Derive all dates relative to the Proposal Deadline provided.
6. NEVER reference filenames, document names, or external documents anywhere in the RFP body. All information must be stated inline.
7. Vendor Qualification Requirements must be specific to this project domain.
8. Where the supporting documents mention specific system names, module names, report names, KPI names, user roles, or data entities -- include them explicitly by name in the RFP.

HTML OUTPUT RULES
- Return ONLY the inner HTML -- no DOCTYPE, no html tag, no body tag, no head tag, no style blocks.
- The outermost element is a plain wrapper div with no styling.
- Inside it, each A4 page is a separate div using EXACTLY the page wrapper inline style shown above (794px wide, 1123px tall, white background, no background-image).
- Inside each page div, reproduce the full Andersen letterhead structure in this order: wordmark lockup, yellow band with inline SVG, dotted accent rule, content area div, and navy footer -- as shown above with all inline styles.
- Place the actual page content (title, sections, tables, etc.) INSIDE the content area div, replacing the [PAGE CONTENT GOES HERE] placeholder.
- Do NOT use background-image anywhere. The letterhead is pure inline HTML + CSS.
- Do NOT use external images or img tags.
- ALL styling via inline style= attributes ONLY. No classes. No style blocks. No external stylesheets.
- Use proper HTML: p, ul, ol, li, table, thead, tbody, tr, th, td, strong, em, div, svg.
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

  const userPrompt = `Generate a COMPLETE, COMPREHENSIVE, multi-page RFP HTML document for ${issuerName}, ${issuerLoc}.
This must be a detailed government procurement document — every section must be fully written, not summarized.
Use ONLY the information provided below. Do not add anything not stated here or in the supporting documents.

${'='.repeat(60)}
PROJECT DETAILS
${'='.repeat(60)}
RFP Reference:          ${data.ref_number || 'AND/PROC/' + new Date().getFullYear() + '/TBD'}
Title:                  ${data.title || 'Not specified'}
Category:               ${data.category || 'IT & Digital Transformation'}
Budget Envelope:        CONFIDENTIAL — DO NOT include any budget figure, budget ceiling, or indicative cost in the RFP document. The budget is used only for internal evaluation and must never appear in the text published to vendors.
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
${issuerName} Responses to Clarifications: ${qaPublished}
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
   - Organisational context: what the Andersen is, the new operating unit being established, its position within Andersen Oracle ERP environment.
   - Current-state problem: describe the fragmented data landscape in specific terms — which source systems hold which data, what the operational impact is (reporting delays, reconciliation burden, inconsistent KPIs, reliance on BI Publisher static reports).
   - Strategic mandate: why this initiative was commissioned, what governance or leadership directive drives it.
   - Why external vendor engagement is required: specific capability gap that Andersen cannot address internally.
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
   d) Specific acceptance criteria for this workstream (what Andersen will test or verify before sign-off)
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
   Then: submission instructions — Submission email: ${procEmail}. State file format requirements (PDF, max 50MB per file, English language), naming convention for files, and that late submissions will not be accepted.

8. TERMS AND CONDITIONS
   8 to 12 bullet points covering: confidentiality obligations (all RFP content and project details are confidential), intellectual property (all developed deliverables, code, and documentation vest entirely in ${issuerName} upon payment), right to reject all proposals without explanation, disqualification grounds (misrepresentation, conflict of interest, non-compliance with requirements), no guarantee of award, vendor costs for proposal preparation not reimbursable, governing law and dispute resolution (derive the applicable jurisdiction from the project context and location described above — do not assume a jurisdiction), language of contract (derive from the project context and target market described above — specify prevailing language if multiple languages apply), subcontracting restrictions (prior written ${issuerName} approval required), conflict of interest declaration required with submission, ${issuerName}'s right to audit vendor premises and references before award.

REMINDER: Do NOT reference any document filename, BRD name, or attached file anywhere in the output. All content must be stated inline as if you wrote it yourself.`

  return { systemPrompt, userPrompt }
}

async function generateRFPWithLLM(data: any, archDocText: string, brdDocText: string, env: any, scoringMatrixJson?: string | null, settings?: Record<string,string>): Promise<string> {
  const { systemPrompt, userPrompt } = buildRFPPrompt(data, archDocText, brdDocText, scoringMatrixJson, settings)
  const llmContent = await callLLM(systemPrompt, userPrompt, env, 'gpt-5-mini', 64000)
  if (llmContent && llmContent.length > 400) {
    return `<div class="rfp-doc">${repairTruncatedHtml(llmContent)}</div>`
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

  const systemPrompt = `You are ${rfp?.contact_name || 'the procurement manager'} at the Andersen, Warsaw, Poland. You are personally answering vendor clarification questions about this RFP. Write as a real, senior government procurement professional who knows this project inside out — not as a generic system or AI assistant.

TONE RULES (critical):
- Write in first person where natural: "We require...", "Our team will...", "From our side..."
- Be direct and specific — never hedge with phrases like "Based on standard enterprise practice", "While the RFP doesn't specify", "It is generally expected that", "Industry-standard practice suggests"
- Sound like a human expert who lives and breathes this project, not a consultant producing boilerplate
- Short, confident sentences. No throat-clearing. No caveats unless genuinely needed.
- If a question has an obvious answer given the project context, just answer it plainly

ANSWERING RULES — apply in order:

1. DIRECT ANSWER (preferred): If the answer is in the RFP, Architecture doc, BRD, or project fields — answer it directly and specifically. You may reference the section (e.g. "Section 3.2 covers this") but skip filler like "As explicitly stated in..."

2. INFORMED ANSWER (use for most questions): If not explicitly documented but you can answer it confidently as a senior Andersen procurement manager familiar with professional services projects of this type — just answer it. Do NOT signal that you are inferring or that the RFP doesn't cover it.

3. ESCALATE TO MANUAL REVIEW (last resort only — < 10% of questions): Only if the answer genuinely requires an undisclosed internal Andersen decision. Respond with exactly: "NEEDS_MANUAL_REVIEW: " followed by one sentence.

Never say "I don't know". Never say "Based on standard enterprise/industry practice". Never say "While the RFP doesn't specify". Answer like a human who owns this procurement.`

  const userPrompt = `${context ? `CONTEXT DOCUMENTS:\n${context}\n\n---\n\n` : ''}VENDOR QUESTION:\n${question}`

  try {
    const answer = await callLLM(systemPrompt, userPrompt, env, 'gpt-5-mini', 1500)
    const trimmed = answer.trim()
    if (trimmed.startsWith('NEEDS_MANUAL_REVIEW')) {
      const explanation = trimmed.replace(/^NEEDS_MANUAL_REVIEW[:\s]*/i, '').trim()
      return {
        answer: explanation || 'This question requires a decision or clarification from the Andersen procurement team.',
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
  // Generate a well-structured, multi-page PDF with Andersen letterhead styling.
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
    //   32–148pt: white logo area with Andersen text centred
    //   148–152pt: thin grey rule separating header from content
    let s = ''
    // Top ornament strip — warm khaki #A79C7F
    s += `1.0 0.859 0.0 rg\n`
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
    s += `(ANDERSEN) Tj\n`
    // Sub-label
    s += `${FONT_REG} 8.5 Tf\n`
    s += `${PW/2 - 78} ${logoMidY + 2} Td\n`
    s += `(Warsaw · Berlin · London · New York) Tj\n`
    // Contact line
    s += `${FONT_REG} 7.5 Tf\n`
    s += `${PW/2 - 70} ${logoMidY - 13} Td\n`
    s += `(procurement@andersenlab.com     \u2022     andersenlab.com) Tj\n`
    s += `ET\n`
    // Thin gold rule below header band
    s += `1.0 0.859 0.0 RG\n0.75 w\n0 ${PH - HEADER_H - 2} m ${PW} ${PH - HEADER_H - 2} l S\n`
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
  stream += `1.0 0.859 0.0 RG\n1.5 w\n${ML} ${curY} m ${PW - MR} ${curY} l S\n0 0 0 RG\n1 w\n`
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
RFP Title:        ${rfp?.title || 'Andersen RFP'}
Reference Number: ${rfp?.ref_number || 'N/A'}
Issuing Entity:   Andersen, Warsaw

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
Andersen
Warsaw · Berlin · London · New York
procurement@cpc-rfp.website

──────────────────────────────────────────────
PARTICIPANT REFERENCE: ${participantCode}
SUBMISSION PORTAL:     ${submissionUrl}
──────────────────────────────────────────────`
}

/** Build the Andersen-branded HTML email wrapper around plain-text body content.
 *  All three outbound send paths use this helper so the letterhead is consistent. */
function buildAndersenEmailHtml(bodyText: string): string {
  const safeBody = bodyText.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  const bodyHtmlContent = safeBody.replace(/\n/g,'<br>')
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Andersen Procurement</title></head>
<body style="margin:0;padding:0;background:#F1F1F1;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F1F1F1;padding:32px 0">
  <tr><td align="center">
    <table width="620" cellpadding="0" cellspacing="0" border="0" style="max-width:620px;width:100%">

      <!-- ── Header ── -->
      <tr>
        <td style="background:#020D1C;border-radius:12px 12px 0 0;padding:24px 36px">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="padding-right:20px;vertical-align:middle;width:48px">
                <!-- Andersen geometric diamond mark — inline SVG, no external dependency -->
                <svg width="44" height="44" viewBox="0 0 44 44" xmlns="http://www.w3.org/2000/svg" style="display:block">
                  <polygon points="22,2 42,22 22,42 2,22" fill="none" stroke="#FFDB00" stroke-width="2.5"/>
                  <polygon points="22,9 35,22 22,35 9,22" fill="#FFDB00"/>
                </svg>
              </td>
              <td style="vertical-align:middle">
                <div style="font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:700;color:#FFDB00;letter-spacing:0.04em;line-height:1.15">Andersen</div>
                <div style="font-family:'Courier New',monospace;font-size:8.5px;font-weight:700;letter-spacing:0.22em;text-transform:uppercase;color:#8fa3bb;margin-top:5px">PROCUREMENT &amp; CONTRACTING</div>
              </td>
              <td align="right" style="vertical-align:middle">
                <div style="font-family:'Courier New',monospace;font-size:8px;color:#FFDB00;letter-spacing:0.14em;text-transform:uppercase;opacity:0.7">Warsaw, Poland</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- ── Gold rule ── -->
      <tr>
        <td style="background:#FFDB00;height:3px;font-size:0;line-height:0">&nbsp;</td>
      </tr>

      <!-- ── Body ── -->
      <tr>
        <td style="background:#FFFFFF;padding:36px 36px 28px;border-left:1px solid #E0E0E0;border-right:1px solid #E0E0E0">
          <div style="font-size:14px;line-height:1.75;color:#020303">${bodyHtmlContent}</div>
        </td>
      </tr>

      <!-- ── Footer ── -->
      <tr>
        <td style="background:#020D1C;border-radius:0 0 12px 12px;padding:18px 36px">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td>
                <div style="font-family:'Courier New',monospace;font-size:8px;letter-spacing:0.16em;text-transform:uppercase;color:#FFDB00;font-weight:700;margin-bottom:4px">Official Procurement Correspondence</div>
                <div style="font-size:11px;color:#8fa3bb;line-height:1.5">Andersen &nbsp;·&nbsp; Warsaw, Poland<br>
                <a href="mailto:procurement@cpc-rfp.website" style="color:#FFDB00;text-decoration:none">procurement@cpc-rfp.website</a></div>
              </td>
              <td align="right" style="vertical-align:middle">
                <div style="font-family:'Courier New',monospace;font-size:7.5px;color:#4a6080;letter-spacing:0.06em;text-transform:uppercase">AI RFP Management System</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- ── Disclaimer ── -->
      <tr>
        <td style="padding:14px 0 0;text-align:center">
          <div style="font-size:10px;color:#6b7280;line-height:1.5">This is an official procurement communication from Andersen.<br>
          Please do not reply to this message unless instructed to do so.</div>
        </td>
      </tr>

    </table>
  </td></tr>
</table>
</body>
</html>`
}

async function sendRealEmail(
  to: string, subject: string, bodyText: string, rfp: any, env?: any, pdfBase64?: string, pdfFilenameHint?: string
): Promise<{ ok: boolean; id?: string; error?: string; simulated?: boolean }> {
  const toAddr = (to || '').toLowerCase().trim()
  // No domain restriction — send to any valid vendor email address.
  const RESEND_API_KEY = env?.RESEND_API_KEY || (globalThis as any).RESEND_API_KEY || ''
  if (!RESEND_API_KEY) {
    return { ok: false, error: 'RESEND_API_KEY not configured' }
  }

  const htmlBody = buildAndersenEmailHtml(bodyText)

  // Attach PDF if provided (base64 string from client-side html2pdf generation)
  const attachments: any[] = pdfBase64
    ? [{ filename: pdfFilenameHint || 'RFP_Document.pdf', content: pdfBase64 }]
    : []

  try {
    const payload: any = {
      from: 'Andersen Procurement <procurement@cpc-rfp.website>',
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
    { question: 'Is this a greenfield implementation or will the vendor be required to integrate with or migrate from existing legacy systems?' },
    { question: 'What is the scope of data migration — specifically how many years of historical data must be migrated, and what is the estimated data volume?' },
    { question: 'Which integrations with third-party systems or external platforms are mandatory for Phase 1 go-live?' },
    { question: 'What are the infrastructure specifications and access procedures for the target deployment environment?' },
    { question: 'Are the architectural patterns and technology stack described in the RFP hard requirements, or can vendors propose alternatives with justification?' },
    { question: 'What is the current state of data quality in the source systems, and will a data cleansing phase be in scope?' },
    { question: 'Are there regulatory, compliance, or government reporting obligations that the solution must satisfy?' },
    { question: 'What language, localisation, and accessibility requirements apply to the end-user interfaces?' },
    { question: 'What is the preferred commercial model (Fixed Price vs. Time & Materials), and will the budget envelope be disclosed during clarification?' },
  ]
}

// ============================================================
// HELPERS — SAMPLE PROPOSALS (for testing/demo)
// ============================================================
function buildVendorProposal(v: any, isAndersen: boolean, isEPAM: boolean): any {
  if (isAndersen) {
    return {
      technical: `TECHNICAL PROPOSAL — ${v.name}\n\nWe propose a phased, risk-mitigated delivery approach that aligns directly with the scope and technical requirements stated in this RFP. Our team brings proven expertise in the solution domain and has successfully delivered comparable implementations for large enterprise and public-sector clients.\n\nProposed Timeline: 14 months end-to-end\nTeam: 8 certified specialists + 3 senior engineers + dedicated Project Manager`,
      financial: 4800000,
      status: 'submitted',
    }
  }
  if (isEPAM) {
    return {
      technical: `TECHNICAL PROPOSAL — ${v.name}\n\nWe propose a modern, engineering-excellence driven approach fully addressing the stated requirements. Our methodology emphasises iterative delivery, continuous stakeholder validation, and knowledge transfer throughout all project phases.\n\nProposed Timeline: 13 months end-to-end\nTeam: 6 senior certified consultants + 4 specialist engineers + 2 solution architects + PM`,
      financial: 3950000,
      status: 'submitted',
    }
  }
  const financial = 4000000 + Math.floor(Math.random() * 3000000)
  return {
    technical: `Technical Proposal from ${v.name}:\n\nOur team proposes a comprehensive solution leveraging our ${v.specializations || 'enterprise software'} expertise, directly addressing all mandatory requirements set out in the RFP.\n\nProposed Timeline: 14-18 months.`,
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
