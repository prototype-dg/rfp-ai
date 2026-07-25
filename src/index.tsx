import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { apiRouter } from './api/index'
import { getLayout } from './layout'
import { getSubmitPage } from './submit-page'
import type { Bindings } from './types'
// Import static assets as raw strings at build time (Vite ?raw)
import appJs from '../public/static/app.js?raw'
import styleCss from '../public/static/style.css?raw'
import submitJs from '../public/static/submit.js?raw'
import patternSvg from '../public/static/pattern.svg?raw'
import emblemPng from '../public/static/cpc-emblem.png?base64'

const app = new Hono<{ Bindings: Bindings }>()

app.use('*', cors())

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
  const bin = atob(emblemPng)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return c.body(bytes, 200, {
    'Content-Type': 'image/png',
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
