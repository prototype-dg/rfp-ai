import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { apiRouter } from './api/index'
import { getLayout } from './layout'
import { getSubmitPage } from './submit-page'
import type { Bindings } from './types'
import { sqliteDb } from './services/db'
import { azureBlobBucket } from './services/blob-bucket'
// Import static assets as raw strings at build time (Vite ?raw)
import appJs from '../public/static/app.js?raw'
import styleCss from '../public/static/style.css?raw'
import submitJs from '../public/static/submit.js?raw'
import patternSvg from '../public/static/pattern.svg?raw'
import { emblemPngBase64 } from './emblem-data'
import { profileMiddleware } from './profiles/middleware'

const app = new Hono<{ Bindings: Bindings }>()

app.use('*', cors())
app.use('*', profileMiddleware)

// ── Azure adapter injection ────────────────────────────────────────────────
// On Azure App Service, Cloudflare bindings (D1, R2) are not available.
// This middleware injects our local adapters so every downstream route sees
// c.env.DB (better-sqlite3 shim) and c.env.PROPOSALS_BUCKET (Azure Blob shim)
// with the exact same interface as D1Database and R2Bucket.
app.use('*', async (c, next) => {
  if (!c.env) (c as any).env = {}
  if (!c.env.DB) (c.env as any).DB = sqliteDb
  if (!(c.env as any).PROPOSALS_BUCKET) (c.env as any).PROPOSALS_BUCKET = azureBlobBucket
  // Inject env vars from process.env as fallbacks for secrets not passed via Cloudflare
  if (!c.env.OPENAI_API_KEY) (c.env as any).OPENAI_API_KEY = process.env.OPENAI_API_KEY
  if (!c.env.RESEND_API_KEY) (c.env as any).RESEND_API_KEY = process.env.RESEND_API_KEY
  if (!c.env.GSK_API_KEY) (c.env as any).GSK_API_KEY = process.env.GSK_API_KEY
  if (!c.env.GSK_PROJECT_ID) (c.env as any).GSK_PROJECT_ID = process.env.GSK_PROJECT_ID
  if (!(c.env as any).GOOGLE_VISION_API_KEY) (c.env as any).GOOGLE_VISION_API_KEY = process.env.GOOGLE_VISION_API_KEY
  if (!(c.env as any).AZURE_STORAGE_CONNECTION_STRING) (c.env as any).AZURE_STORAGE_CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING
  await next()
})

// Global error handler to surface actual error messages
app.onError((err, c) => {
  console.error('Unhandled error:', err.message, err.stack)
  return c.json({ error: err.message || 'Internal Server Error' }, 500)
})

// Serve static files (bundled at build time via Vite ?raw imports)
app.get('/static/app.js', (c) => {
  return c.body(appJs, 200, {
    'Content-Type': 'application/javascript; charset=utf-8',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
  })
})

app.get('/static/style.css', (c) => {
  return c.body(styleCss, 200, {
    'Content-Type': 'text/css; charset=utf-8',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
  })
})

app.get('/static/submit.js', (c) => {
  return c.body(submitJs, 200, {
    'Content-Type': 'application/javascript; charset=utf-8',
    'Cache-Control': 'no-cache',
  })
})

app.get('/static/pattern.svg', (c) => {
  return c.body(patternSvg, 200, {
    'Content-Type': 'image/svg+xml; charset=utf-8',
    'Cache-Control': 'public, max-age=86400',
  })
})

app.get('/static/cpc-emblem.png', (c) => {
  // emblemPngBase64 is a clean base64 string (no whitespace) from emblem-data.ts
  // Note: file is actually JPEG format despite the .png extension
  const bin = atob(emblemPngBase64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return c.body(bytes, 200, {
    'Content-Type': 'image/jpeg',
    'Cache-Control': 'public, max-age=86400',
  })
})

// API routes
app.route('/api', apiRouter)

// Public vendor proposal submission page
app.get('/submit/:rfpId', (c) => {
  const rfpId = c.req.param('rfpId')
  const code = c.req.query('code') || ''
  return c.html(getSubmitPage(rfpId, code))
})

// SPA - serve for all non-API routes
app.get('*', (c) => {
  return c.html(getLayout())
})

export default app
