"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.profileMiddleware = profileMiddleware;
const index_1 = require("./index");
async function profileMiddleware(c, next) {
    // Only refresh from DB if the cache has expired
    if ((0, index_1.shouldRefresh)()) {
        try {
            const db = c.env?.DB;
            if (db) {
                // Ensure config table exists (safe on every request — SQLite no-ops if exists)
                await db.prepare(`CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value TEXT NOT NULL)`).run();
                const row = await db.prepare(`SELECT value FROM config WHERE key = 'active_profile'`).first();
                const profileId = row?.value ?? 'andersen';
                (0, index_1.setActiveProfile)(profileId);
            }
            else {
                (0, index_1.markRefreshed)();
            }
        }
        catch (err) {
            // Never crash a request over a profile load failure — keep current profile
            console.warn('[profile] Failed to load active profile from DB:', err);
            (0, index_1.markRefreshed)();
        }
    }
    await next();
}
//# sourceMappingURL=middleware.js.map