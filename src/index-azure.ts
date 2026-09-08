/**
 * index-azure.ts — Azure App Service entry point
 *
 * Functionally equivalent to index.tsx but without Vite ?raw imports.
 * On Azure, static files are served directly from disk via serveStatic,
 * not bundled into the Worker at build time.
 */

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from '@hono/node-server/serve-static'
import { apiRouter } from './api/index'
import { getLayout } from './layout'
import { getSubmitPage } from './submit-page'
import { getDemoSwitcherPage } from './demo-switcher'
import type { Bindings } from './types'
import { sqliteDb } from './services/db'
import { azureBlobBucket } from './services/blob-bucket'
import { profileMiddleware } from './profiles/middleware'

const app = new Hono<{ Bindings: Bindings }>()

app.use('*', cors())
app.use('*', profileMiddleware)

// ── Azure adapter injection ────────────────────────────────────────────────
app.use('*', async (c, next) => {
  if (!c.env) (c as any).env = {}
  if (!c.env.DB) (c.env as any).DB = sqliteDb
  if (!(c.env as any).PROPOSALS_BUCKET) (c.env as any).PROPOSALS_BUCKET = azureBlobBucket
  if (!c.env.OPENAI_API_KEY) (c.env as any).OPENAI_API_KEY = process.env.OPENAI_API_KEY
  if (!c.env.RESEND_API_KEY) (c.env as any).RESEND_API_KEY = process.env.RESEND_API_KEY
  if (!c.env.GSK_API_KEY) (c.env as any).GSK_API_KEY = process.env.GSK_API_KEY
  if (!c.env.GSK_PROJECT_ID) (c.env as any).GSK_PROJECT_ID = process.env.GSK_PROJECT_ID
  if (!(c.env as any).GOOGLE_VISION_API_KEY) (c.env as any).GOOGLE_VISION_API_KEY = process.env.GOOGLE_VISION_API_KEY
  if (!(c.env as any).AZURE_STORAGE_CONNECTION_STRING) (c.env as any).AZURE_STORAGE_CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING
  await next()
})

// Global error handler
app.onError((err, c) => {
  console.error('Unhandled error:', err.message, err.stack)
  return c.json({ error: err.message || 'Internal Server Error' }, 500)
})

// ── Static files served from disk (not Vite ?raw bundled) ─────────────────
// Files live in public/static/ relative to the project root
app.use('/static/*', serveStatic({ root: './public' }))

// API routes
app.route('/api', apiRouter)

// Demo presenter control panel
app.get('/demo', (c) => {
  return c.html(getDemoSwitcherPage())
})

// Public vendor proposal submission page
app.get('/submit/:rfpId', (c) => {
  const rfpId = c.req.param('rfpId')
  const code = c.req.query('code') || ''
  return c.html(getSubmitPage(rfpId, code))
})

// SPA — serve for all non-API, non-static routes
app.get('*', (c) => {
  return c.html(getLayout())
})

export default app
