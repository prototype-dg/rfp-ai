"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_server_1 = require("@hono/node-server");
const index_azure_1 = __importDefault(require("./index-azure"));
const PORT = parseInt(process.env.PORT || process.env.WEBSITES_PORT || '8080', 10);
(0, node_server_1.serve)({
    fetch: index_azure_1.default.fetch,
    port: PORT,
}, (info) => {
    console.log(`[azure] RFP Tool server listening on port ${info.port}`);
    console.log(`[azure] DB_PATH: ${process.env.DB_PATH || '/data/webapp.db'}`);
    console.log(`[azure] NODE_ENV: ${process.env.NODE_ENV || 'production'}`);
});
//# sourceMappingURL=server-azure.js.map