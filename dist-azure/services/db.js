"use strict";
/**
 * db.ts — D1-compatible SQLite adapter for Azure App Service
 *
 * Wraps `better-sqlite3` with the exact same interface as Cloudflare D1:
 *   db.prepare(sql).bind(...args).run()
 *   db.prepare(sql).bind(...args).all()
 *   db.prepare(sql).bind(...args).first()
 *   db.prepare(sql).run()
 *   db.batch([...])
 *
 * Drop-in replacement: no call-site changes needed in index.ts.
 * Database file lives at DB_PATH env var (default: /data/webapp.db).
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sqliteDb = void 0;
exports.getSqliteDb = getSqliteDb;
exports.getDb = getDb;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
// ── Path resolution ────────────────────────────────────────────────────────
const DB_PATH = process.env.DB_PATH || '/data/webapp.db';
// Ensure the directory exists (Azure Files mount or local fallback)
function ensureDir(filePath) {
    const dir = path_1.default.dirname(filePath);
    try {
        if (!fs_1.default.existsSync(dir)) {
            fs_1.default.mkdirSync(dir, { recursive: true });
        }
    }
    catch {
        // ignore — directory may already exist or be read-only
    }
}
// ── Singleton connection ───────────────────────────────────────────────────
let _db = null;
function getSqliteDb() {
    if (_db)
        return _db;
    ensureDir(DB_PATH);
    _db = new better_sqlite3_1.default(DB_PATH, { verbose: undefined });
    // Enable WAL mode for better concurrent read performance
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = ON');
    _db.pragma('synchronous = NORMAL');
    console.log(`[db] SQLite opened at ${DB_PATH}`);
    return _db;
}
// ── Prepared statement wrapper ────────────────────────────────────────────
class D1PreparedStatement {
    sql;
    args = [];
    constructor(sql) {
        this.sql = sql;
    }
    bind(...args) {
        this.args = args;
        return this;
    }
    async run() {
        const db = getSqliteDb();
        const start = Date.now();
        try {
            const stmt = db.prepare(this.sql);
            const result = stmt.run(...this.args);
            return {
                success: true,
                meta: {
                    last_row_id: Number(result.lastInsertRowid),
                    changes: result.changes,
                    duration: Date.now() - start,
                },
            };
        }
        catch (err) {
            console.error('[db] run() error:', err.message, '\nSQL:', this.sql, '\nArgs:', this.args);
            throw err;
        }
    }
    async all() {
        const db = getSqliteDb();
        const start = Date.now();
        try {
            const stmt = db.prepare(this.sql);
            const rows = stmt.all(...this.args);
            return {
                results: rows,
                success: true,
                meta: { last_row_id: 0, changes: 0, duration: Date.now() - start },
            };
        }
        catch (err) {
            console.error('[db] all() error:', err.message, '\nSQL:', this.sql, '\nArgs:', this.args);
            throw err;
        }
    }
    async first() {
        const db = getSqliteDb();
        try {
            const stmt = db.prepare(this.sql);
            const row = stmt.get(...this.args);
            return row ?? null;
        }
        catch (err) {
            console.error('[db] first() error:', err.message, '\nSQL:', this.sql, '\nArgs:', this.args);
            throw err;
        }
    }
}
// ── D1Database-compatible facade ──────────────────────────────────────────
class SqliteD1Database {
    prepare(sql) {
        return new D1PreparedStatement(sql);
    }
    async batch(statements) {
        const results = [];
        for (const stmt of statements) {
            results.push(await stmt.run());
        }
        return results;
    }
    exec(sql) {
        const db = getSqliteDb();
        db.exec(sql);
    }
}
// ── Exported singleton ────────────────────────────────────────────────────
exports.sqliteDb = new SqliteD1Database();
/**
 * Returns the D1-compatible database instance.
 * Use this anywhere c.env.DB was previously injected.
 */
function getDb() {
    return exports.sqliteDb;
}
//# sourceMappingURL=db.js.map