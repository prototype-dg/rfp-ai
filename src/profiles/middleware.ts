/**
 * Profile Loader Middleware
 * =========================
 * Reads the active profile from the DB config table and caches it
 * in memory. Re-checks every 60 seconds so a profile switch takes
 * effect within one minute without any app restart.
 *
 * Usage in index-azure.ts / index.tsx:
 *   import { profileMiddleware } from './profiles/middleware'
 *   app.use('*', profileMiddleware)
 */

import type { Context, Next } from 'hono'
import { getActiveProfile, setActiveProfile, shouldRefresh, markRefreshed, type ProfileId } from './index'

export async function profileMiddleware(c: Context, next: Next) {
  // Only refresh from DB if the cache has expired
  if (shouldRefresh()) {
    try {
      const db = (c.env as any)?.DB
      if (db) {
        // Ensure config table exists (safe on every request — SQLite no-ops if exists)
        await db.prepare(`CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value TEXT NOT NULL)`).run()

        const row = await db.prepare(`SELECT value FROM config WHERE key = 'active_profile'`).first<{ value: string }>()
        const profileId: ProfileId = (row?.value as ProfileId) ?? 'andersen'
        setActiveProfile(profileId)
      } else {
        markRefreshed()
      }
    } catch (err) {
      // Never crash a request over a profile load failure — keep current profile
      console.warn('[profile] Failed to load active profile from DB:', err)
      markRefreshed()
    }
  }

  await next()
}
