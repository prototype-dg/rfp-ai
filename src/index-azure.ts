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

// ── CORS — explicit origin allowlist, NOT wildcard ──────────────────────────
// Only the two production hostnames are trusted origins.
// Browser preflight (OPTIONS) and actual cross-origin requests from any other
// origin will receive no Access-Control-Allow-Origin header, which causes the
// browser to block the response before the JS can read it.
//
// Routes that must accept requests from external vendor browsers
// (/api/submit/*, /api/webhook/*) are called directly from the vendor portal
// page served by THIS same origin, so they do not need cross-origin access.
const ALLOWED_ORIGINS = [
  'https://rfp-ai.andersenlab.com',
  'https://app-rfp-tool.azurewebsites.net',
  'https://demo.andersenlab.com',
]
app.use('*', cors({
  origin: (origin) => ALLOWED_ORIGINS.includes(origin) ? origin : null,
  allowMethods: ['GET', 'HEAD', 'PUT', 'POST', 'DELETE', 'PATCH'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-Admin-Key'],
  exposeHeaders: [],
  credentials: false,
}))

// ── Azure adapter injection ─────────────────────────────────────────────────
// MUST be registered BEFORE profileMiddleware so c.env.DB is available when
// the profile loader runs. Reverse order caused active_profile to be silently
// skipped (DB was undefined → markRefreshed() fired → 60s window of wrong profile).
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
  if (!(c.env as any).ADMIN_API_KEY) (c.env as any).ADMIN_API_KEY = process.env.ADMIN_API_KEY
  await next()
})

// ── Profile loader — runs after DB adapter so c.env.DB is always set ────────
app.use('*', profileMiddleware)

// ── Security headers ─────────────────────────────────────────────────────────
// Applied to every response before any route handler runs.
// These headers reduce the blast radius of XSS (CSP, X-Content-Type-Options),
// prevent clickjacking (X-Frame-Options), force HTTPS (HSTS), and stop
// referrer leakage (Referrer-Policy).
//
// X-Content-Type-Options: nosniff — critical for the file-upload XSS vector:
//   an HTML file stored in R2 and served via /api/proposals/pdf/:key would be
//   executed as HTML by Chrome if the browser sniffs its MIME type. This header
//   forces browsers to honour the declared Content-Type instead.
//
// Content-Security-Policy: intentionally permissive for script-src because the
//   SPA loads CDN scripts (Chart.js, marked, html2pdf, FontAwesome). A strict
//   hash/nonce-based CSP would break those. The policy here blocks the most
//   dangerous vectors (object-src, base-uri, form-action) without breaking
//   the existing CDN-loaded frontend.
app.use('*', async (c, next) => {
  await next()
  // HSTS — tell browsers this host is HTTPS-only for 1 year, include subdomains
  c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  // Prevent MIME-type sniffing (blocks HTML-upload-to-R2 XSS path)
  c.header('X-Content-Type-Options', 'nosniff')
  // Allow same-origin framing only — the SPA uses iframes to render RFP preview
  // (/api/rfps/:id/preview-html) and uploaded PDFs (/api/proposals/pdf/:key).
  // SAMEORIGIN blocks cross-origin clickjacking while permitting same-origin iframes.
  c.header('X-Frame-Options', 'SAMEORIGIN')
  // Don't send Referer header to third-party origins
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin')
  // Disable browser features not used by this app
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  // CSP — blocks the most dangerous injection vectors while allowing CDN scripts
  c.header(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      // CDN scripts used by the SPA (Chart.js, marked, html2pdf, html2canvas, jsPDF)
      "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://cdn.tailwindcss.com",
      // Fonts and icons from Google Fonts and FontAwesome CDN
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net",
      "font-src 'self' https://fonts.gstatic.com https://cdn.jsdelivr.net",
      // Images: self + data URIs (brand asset data URIs in layout) + blob (PDF generation)
      "img-src 'self' data: blob:",
      // fetch() / XHR: same origin only — admin API calls are all same-origin
      "connect-src 'self'",
      // Block all plugin content (Flash, Silverlight, etc.)
      "object-src 'none'",
      // Prevent base tag injection (would redirect all relative URLs)
      "base-uri 'self'",
      // Block form submissions to external origins
      "form-action 'self'",
      // Allow same-origin framing only (belt-and-suspenders with X-Frame-Options: SAMEORIGIN)
      "frame-ancestors 'self'",
    ].join('; ')
  )
})

// Global error handler
app.onError((err, c) => {
  console.error('Unhandled error:', err.message, err.stack)
  return c.json({ error: err.message || 'Internal Server Error' }, 500)
})

// ── Static files served from disk (not Vite ?raw bundled) ─────────────────
// Files live in public/static/ relative to the project root
app.use('/static/*', serveStatic({ root: './public' }))

// ── Admin API key authentication ────────────────────────────────────────────
// All /api/* routes require the X-Admin-Key header to match ADMIN_API_KEY,
// EXCEPT the two paths that external parties (vendors, email providers) must
// reach without credentials:
//
//   /api/submit/*          — vendor proposal submission portal (public link)
//   /api/webhook/*         — inbound-email webhook from Resend (no shared secret possible)
//
// The SPA (same-origin) sends the key as a request header on every fetch.
// The key is stored as an Azure App Setting (ADMIN_API_KEY) and injected into
// c.env by the adapter middleware above.
app.use('/api/*', async (c, next) => {
  const path = c.req.path

  // Public paths — skip auth check entirely
  if (path.startsWith('/api/submit/') || path.startsWith('/api/webhook/')) {
    return next()
  }

  // Demo switcher paths — called cross-origin from demo.andersenlab.com.
  // /api/demo/status is read-only (no auth needed).
  // /api/admin/set-profile is PIN-protected at the handler level (DEMO_SWITCH_PIN),
  // which is a separate credential from ADMIN_API_KEY — the PIN is its own
  // auth mechanism, so X-Admin-Key is not required here.
  if (path === '/api/demo/status' || path === '/api/admin/set-profile') {
    return next()
  }

  // Browser-navigation paths — loaded as iframe src= or window.open(), not via fetch().
  // The browser never sends custom headers on direct navigations, so X-Admin-Key
  // cannot be attached. These endpoints are all read-only and serve content only
  // for RFPs/proposals that already exist (no mutation possible).
  //   /api/rfps/:id/preview-html  — RFP letterhead preview rendered in iframe
  //   /api/proposals/pdf/*        — proposal PDF streamed inline in iframe or new tab
  //   /api/rfps/:id/pdf           — generated RFP PDF opened in new tab
  if (
    /^\/api\/rfps\/\d+\/preview-html$/.test(path) ||
    /^\/api\/rfps\/\d+\/pdf$/.test(path) ||
    path.startsWith('/api/proposals/pdf/')
  ) {
    return next()
  }

  const adminKey: string = (c.env as any)?.ADMIN_API_KEY || process.env.ADMIN_API_KEY || ''

  // If ADMIN_API_KEY is not configured on this instance, refuse all requests
  // rather than silently running open — fail-closed is intentional.
  if (!adminKey) {
    return c.json({ error: 'API authentication not configured' }, 503)
  }

  const provided = c.req.header('X-Admin-Key') || ''
  if (provided !== adminKey) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  return next()
})

// API routes
app.route('/api', apiRouter)

// Demo presenter control panel
app.get('/demo', (c) => {
  c.header('Cache-Control', 'no-store')
  return c.html(getDemoSwitcherPage())
})

// Public vendor proposal submission page
app.get('/submit/:rfpId', (c) => {
  const rfpId = c.req.param('rfpId')
  const code = c.req.query('code') || ''
  return c.html(getSubmitPage(rfpId, code))
})

// SPA — profile-aware HTML must never be cached by browser or proxy.
// layout.ts injects profile-specific font-family and org name server-side,
// so a stale cached page would show the wrong brand after a profile switch.
// The ADMIN_API_KEY is embedded as window._adminKey so app.js can include it
// in X-Admin-Key headers on every API request.
app.get('*', (c) => {
  c.header('Cache-Control', 'no-store')
  const adminKey: string = (c.env as any)?.ADMIN_API_KEY || process.env.ADMIN_API_KEY || ''
  return c.html(getLayout(adminKey))
})

export default app
