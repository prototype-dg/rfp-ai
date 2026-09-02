"use strict";
/**
 * index-azure.ts — Azure App Service entry point
 *
 * Functionally equivalent to index.tsx but without Vite ?raw imports.
 * On Azure, static files are served directly from disk via serveStatic,
 * not bundled into the Worker at build time.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const hono_1 = require("hono");
const cors_1 = require("hono/cors");
const serve_static_1 = require("@hono/node-server/serve-static");
const index_1 = require("./api/index");
const layout_1 = require("./layout");
const submit_page_1 = require("./submit-page");
const db_1 = require("./services/db");
const blob_bucket_1 = require("./services/blob-bucket");
const app = new hono_1.Hono();
app.use('*', (0, cors_1.cors)());
// ── Azure adapter injection ────────────────────────────────────────────────
app.use('*', async (c, next) => {
    if (!c.env)
        c.env = {};
    if (!c.env.DB)
        c.env.DB = db_1.sqliteDb;
    if (!c.env.PROPOSALS_BUCKET)
        c.env.PROPOSALS_BUCKET = blob_bucket_1.azureBlobBucket;
    if (!c.env.OPENAI_API_KEY)
        c.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!c.env.RESEND_API_KEY)
        c.env.RESEND_API_KEY = process.env.RESEND_API_KEY;
    if (!c.env.GSK_API_KEY)
        c.env.GSK_API_KEY = process.env.GSK_API_KEY;
    if (!c.env.GSK_PROJECT_ID)
        c.env.GSK_PROJECT_ID = process.env.GSK_PROJECT_ID;
    if (!c.env.GOOGLE_VISION_API_KEY)
        c.env.GOOGLE_VISION_API_KEY = process.env.GOOGLE_VISION_API_KEY;
    if (!c.env.AZURE_STORAGE_CONNECTION_STRING)
        c.env.AZURE_STORAGE_CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING;
    await next();
});
// Global error handler
app.onError((err, c) => {
    console.error('Unhandled error:', err.message, err.stack);
    return c.json({ error: err.message || 'Internal Server Error' }, 500);
});
// ── Static files served from disk (not Vite ?raw bundled) ─────────────────
// Files live in public/static/ relative to the project root
app.use('/static/*', (0, serve_static_1.serveStatic)({ root: './public' }));
// API routes
app.route('/api', index_1.apiRouter);
// Public vendor proposal submission page
app.get('/submit/:rfpId', (c) => {
    const rfpId = c.req.param('rfpId');
    const code = c.req.query('code') || '';
    return c.html((0, submit_page_1.getSubmitPage)(rfpId, code));
});
// SPA — serve for all non-API, non-static routes
app.get('*', (c) => {
    return c.html((0, layout_1.getLayout)());
});
exports.default = app;
//# sourceMappingURL=index-azure.js.map