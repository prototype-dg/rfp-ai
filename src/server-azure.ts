/**
 * server-azure.ts — Node.js entry point for Azure App Service
 *
 * This file replaces the Cloudflare Workers `export default app` pattern.
 * It wraps the same Hono app with @hono/node-server so it runs as a
 * standard Node.js HTTP server on Azure App Service.
 *
 * Build:  npx tsc --project tsconfig.azure.json
 * Start:  node dist-azure/server-azure.js
 */

import { serve } from '@hono/node-server'
import app from './index-azure'
import { sqliteDb } from './services/db'
import { setActiveProfile, markRefreshed, type ProfileId } from './profiles/index'

const PORT = parseInt(process.env.PORT || process.env.WEBSITES_PORT || '8080', 10)

// ── Eagerly load active profile from DB at process startup ───────────────────
// This ensures the correct profile is set before the first HTTP request arrives,
// regardless of middleware order. Without this, a cold-start race window (up to
// 60 seconds) could serve the in-memory default 'andersen' profile even when
// CPC is stored in the DB.
async function loadProfileFromDb(): Promise<void> {
  try {
    const db = sqliteDb
    await db.prepare(`CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value TEXT NOT NULL)`).run()
    const row = await (db.prepare(`SELECT value FROM config WHERE key = 'active_profile'`).first as () => Promise<{ value: string } | null>)()
    const profileId: ProfileId = (row?.value as ProfileId) ?? 'andersen'
    setActiveProfile(profileId)
    markRefreshed()
    console.log(`[azure] Startup profile loaded from DB: ${profileId}`)
  } catch (err) {
    console.warn('[azure] Could not load profile from DB at startup — defaulting to andersen:', err)
    markRefreshed()
  }
}

loadProfileFromDb().then(() => {
  serve(
    {
      fetch: app.fetch,
      port: PORT,
    },
    (info) => {
      console.log(`[azure] RFP Tool server listening on port ${info.port}`)
      console.log(`[azure] DB_PATH: ${process.env.DB_PATH || '/data/webapp.db'}`)
      console.log(`[azure] NODE_ENV: ${process.env.NODE_ENV || 'production'}`)
    }
  )
})
