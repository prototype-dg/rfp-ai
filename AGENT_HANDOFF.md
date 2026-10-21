# AGENT HANDOFF DOCUMENT — RFP AI Tool
## `prototype-dg/rfp-ai` · branch `main`

> **Purpose:** This document is the complete operational context for an AI coding agent taking over
> maintenance of this repository. Read this file fully before making any changes. It contains
> architecture decisions, security posture, credential references, pending work, and standing
> operating procedures.
>
> **Last updated:** 2026-10-21  
> **Last commit at time of writing:** `aa4a020` — _fix: exempt browser-navigation API paths from X-Admin-Key auth_

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Repository Structure](#2-repository-structure)
3. [Architecture](#3-architecture)
4. [Environment Variables & Credentials](#4-environment-variables--credentials)
5. [GitHub Actions CI/CD Pipeline](#5-github-actions-cicd-pipeline)
6. [Security Posture & Recent Hardening](#6-security-posture--recent-hardening)
7. [Brand Profile System](#7-brand-profile-system)
8. [External Services](#8-external-services)
9. [Key Source Files (with current state)](#9-key-source-files-with-current-state)
10. [Pending Security Items (Manual)](#10-pending-security-items-manual)
11. [Pending Code Fixes (App-Level)](#11-pending-code-fixes-app-level)
12. [Standing Operating Procedures](#12-standing-operating-procedures)
13. [Session History: What Changed and Why](#13-session-history-what-changed-and-why)
14. [Pentest Findings Reference](#14-pentest-findings-reference)
15. [Quick-Start Checklist for New Agent](#15-quick-start-checklist-for-new-agent)

---

## 1. Project Overview

**What it is:** An AI-powered RFP (Request for Proposals) procurement management tool. It allows
procurement officers to draft RFPs, invite vendors to submit proposals, run AI-powered evaluation
and scoring of proposals, and generate branded PDF outputs.

**Demo purpose:** Primarily a sales demonstration tool for Andersen Lab. Supports two brand
profiles (Andersen and Crown Prince's Court / CPC) that can be switched at runtime without restart.

**Live URLs:**
- Primary: `https://rfp.andersenlab.com.pl` (custom domain → Azure App Service)
- Azure native: `https://app-rfp-tool.azurewebsites.net`
- Demo switcher (external site, reads status): `https://demo.andersenlab.com`
- Demo control panel (on app itself): `https://rfp.andersenlab.com.pl/demo`

**GitHub repo:** `https://github.com/prototype-dg/rfp-ai`  
**GitHub user:** `prototype-dg`  
**Default branch:** `main` — always push to `main`

---

## 2. Repository Structure

```
rfp-ai/
├── src/
│   ├── index-azure.ts        ← MAIN entry point for Azure (DO NOT confuse with index.tsx)
│   ├── index.tsx             ← Cloudflare Workers entry (NOT used in production Azure path)
│   ├── server-azure.ts       ← Node.js wrapper — starts @hono/node-server, loads startup profile
│   ├── layout.ts             ← SPA HTML shell — injects adminKey + brand profile CSS vars
│   ├── submit-page.ts        ← Public vendor submission portal HTML
│   ├── demo-switcher.ts      ← /demo control panel page
│   ├── types.ts              ← Bindings interface for Hono environment
│   ├── renderer.tsx          ← Hono JSX renderer (Cloudflare path only)
│   ├── cloudflare-stubs.d.ts ← Type stubs for R2Bucket etc.
│   ├── emblem-data.ts        ← CPC emblem SVG data URI
│   ├── brand-assets.ts       ← Logo / bg data URIs (injected into layout CSS)
│   ├── api/
│   │   └── index.ts          ← All /api/* route handlers (~3000 lines)
│   ├── brand/
│   │   └── letterhead.ts     ← PDF letterhead HTML generators (Andersen + CPC)
│   ├── db/
│   │   └── seed.ts           ← DB schema init + vendor seeding
│   ├── profiles/
│   │   ├── index.ts          ← Brand profile definitions + active profile state
│   │   └── middleware.ts     ← Profile reload middleware (60s refresh interval)
│   └── services/
│       ├── db.ts             ← better-sqlite3 D1-compatible adapter
│       ├── blob-bucket.ts    ← Azure Blob R2-compatible adapter (AzureBlobBucket class)
│       ├── blob-upload.ts    ← uploadStreamToBlob / downloadBlobAsStream helpers
│       ├── pdf-render.ts     ← Puppeteer PDF generation service
│       └── ocr.ts            ← Google Vision OCR (pdf-to-img + Vision API)
├── public/
│   └── static/
│       ├── app.js            ← SPA frontend JS (vanilla, no bundler)
│       └── style.css         ← SPA CSS
├── .github/
│   └── workflows/
│       └── main_app-rfp-tool.yml  ← CI/CD — deploys to Azure on push to main
├── letterhead/               ← Static letterhead assets (logos, bg images for PDF)
├── dist-azure/               ← Compiled JS output (tsc → CommonJS)
├── startup.sh                ← Azure startup script (installs Chromium libs + starts Node)
├── ecosystem.config.cjs      ← PM2 config (local dev / Cloudflare sandbox only)
├── package.json              ← Node.js dependencies
├── tsconfig.azure.json       ← TypeScript config for Azure build (CommonJS, outDir=dist-azure)
├── tsconfig.json             ← TypeScript config for Cloudflare/Vite build
├── vite.config.ts            ← Vite build (Cloudflare Workers path only)
├── wrangler.jsonc            ← Cloudflare Pages config (NOT used in Azure production path)
├── demo-hub-switcher-instructions.md  ← Instructions for demo.andersenlab.com integration
└── simulate_parallel.cjs     ← Load testing script
```

**Critical distinction:**
- `src/index-azure.ts` + `src/server-azure.ts` → **production path** (Azure App Service)
- `src/index.tsx` + `wrangler.jsonc` → **Cloudflare Workers path** (not used in production)
- `tsconfig.azure.json` → must compile cleanly before every commit

---

## 3. Architecture

### Runtime
- **Platform:** Azure App Service B3 Linux (2 cores, 7 GB RAM)
- **Node.js:** 22 LTS
- **Framework:** [Hono](https://hono.dev/) v4 — lightweight TypeScript web framework
- **Server wrapper:** `@hono/node-server` — adapts Hono's `fetch` handler to Node.js `http.createServer`
- **Process start:** `startup.sh` (Azure startup command) → installs apt packages → `node dist-azure/server-azure.js`
- **Port:** `8080` (Azure sets `PORT` env var; `WEBSITES_PORT=8080` also honoured)

### Database
- **Engine:** `better-sqlite3` — synchronous SQLite bound native module
- **File location:** `/home/data/app.db` (Azure Files persistent mount — survives restarts/deploys)
- **D1 compatibility:** `src/services/db.ts` implements the exact Cloudflare D1 async interface
  (`prepare().bind().run()/.all()/.first()/.batch()`) wrapping the sync better-sqlite3 calls
- **DB_PATH env var:** defaults to `/home/data/app.db` if not set

### File Storage
- **Engine:** Azure Blob Storage via `@azure/storage-blob`
- **Container:** `proposal-uploads` (configurable via `AZURE_BLOB_CONTAINER` env var)
- **R2 compatibility:** `src/services/blob-bucket.ts` implements the R2Bucket interface
  (`put/get/delete/list`) over Azure Blob. This means all `c.env.PROPOSALS_BUCKET` call sites
  work unchanged on both Cloudflare (native R2) and Azure (blob adapter).
- **Upload helper:** `src/services/blob-upload.ts` — `uploadStreamToBlob`, `downloadBlobAsStream`, `deleteBlobIfExists`

### PDF Generation
- **Engine:** Puppeteer with `chrome-headless-shell` (not full Chrome — saves ~130 MB)
- **Cache location:** `./puppeteer-cache/` (project-relative, travels in deploy zip)
- **Why:** Azure's default container lacks Chromium; we ship the binary in the zip and install
  system `.so` dependencies at startup via `startup.sh`
- **Warmup:** `warmupBrowser()` is called once at module load in `src/api/index.ts` to pay the
  cold-start Puppeteer launch cost before the first request

### OCR
- **Engine:** Google Cloud Vision API
- **Flow:** `pdf-to-img` (pdfium WASM) converts PDF pages to images → batched to Vision API
- **Service:** `src/services/ocr.ts` → `extractTextFromPdf(pdfUrl, apiKey, maxPages)`
- **Env var:** `GOOGLE_VISION_API_KEY`

### Frontend (SPA)
- **Pattern:** Server-rendered HTML shell from Hono (`getLayout()` in `src/layout.ts`),
  then vanilla JS SPA in `public/static/app.js` (~3000 lines)
- **No bundler:** Frontend is plain JS loaded from `/static/app.js`, using CDN dependencies
- **CDN libraries:** Chart.js, marked.js, html2pdf.js, html2canvas, jsPDF, FontAwesome, Tailwind
- **Admin key injection:** Server injects `window._adminKey = "..."` into the HTML shell so
  the SPA can send `X-Admin-Key` on every API fetch without exposing the key to external origins

### Key Middleware Chain (in order, `src/index-azure.ts`)
```
1. CORS — origin allowlist check
2. Azure adapter — injects DB, PROPOSALS_BUCKET, all env vars into c.env
3. profileMiddleware — reloads active brand profile from DB every 60s
4. Security headers — HSTS, nosniff, X-Frame-Options, CSP, Referrer-Policy, Permissions-Policy
5. Error handler (onError)
6. Static files — /static/* → public/static/
7. Auth middleware — X-Admin-Key check on /api/* (with exemptions)
8. API router — /api/* routes
9. /demo route — demo switcher control panel
10. /submit/:rfpId — public vendor submission page
11. SPA catch-all /* — returns HTML shell with injected adminKey, Cache-Control: no-store
```

---

## 4. Environment Variables & Credentials

All secrets are stored as **Azure App Settings** (App Service application settings) and as
**GitHub Actions secrets** (for deployment). They are never committed to the repository.

### Secret Names (GitHub Actions secrets → Azure App Settings)

| Secret Name | Purpose | Risk Level | Action Required |
|---|---|---|---|
| `ADMIN_API_KEY` | X-Admin-Key shared secret; all /api/* require this | High | ✅ Set — confirm value works |
| `OPENAI_API_KEY` | GPT-4o calls for RFP evaluation + proposal scoring | High | ⚠️ Verify spend limit set |
| `RESEND_API_KEY` | Transactional email (proposal submission notifications) | High | ⚠️ ROTATE — had exposure window |
| `DEMO_SWITCH_PIN` | PIN to switch brand profile via /demo or demo.andersenlab.com | Medium | ✅ Set |
| `AZURE_CREDENTIALS` | Service principal JSON for Azure CLI in GitHub Actions | Critical | ⚠️ Verify RG-scope only |
| `AZURE_STORAGE_CONNECTION_STRING` | Azure Blob Storage account-level connection string | High | ⚠️ Verify account isolation |
| `GOOGLE_VISION_API_KEY` | Google Cloud Vision OCR for PDF text extraction | Medium | ✅ In use |

### Azure App Settings (non-secret, set in workflow)

| Setting | Value | Purpose |
|---|---|---|
| `SCM_DO_BUILD_DURING_DEPLOYMENT` | `false` | Skip Oryx build — we pre-build in CI |
| `DISABLE_ORYX_BUILD` | `true` | Same — prevents Oryx from overriding our build |
| `NODE_ENV` | `production` | Enables prod optimisations in Node.js |
| `PORT` | `8080` | HTTP port Azure binds to |
| `DB_PATH` | `/home/data/app.db` | Persistent SQLite file on Azure Files mount |
| `PUPPETEER_CACHE_DIR` | `/home/site/wwwroot/puppeteer-cache` | Where chrome-headless-shell binary lives |
| `PUPPETEER_CHROME_SKIP_DOWNLOAD` | `true` | Prevents Puppeteer from downloading Chrome at runtime |

### Azure Resources

| Resource | Name | Resource Group |
|---|---|---|
| App Service | `app-rfp-tool` | `Dima-Gibert-RG` |
| Resource Group | `Dima-Gibert-RG` | — |
| Blob Storage Account | *(extract from `AZURE_STORAGE_CONNECTION_STRING`)* | Verify in portal |
| Blob Container | `proposal-uploads` | Within storage account |

### How to Authenticate (GitHub CLI / git push)

```bash
# If running in a new sandbox, call setup_github_environment first.
# This configures git credentials globally so git push works without tokens.
# The GitHub user is: prototype-dg

# Clone the repo:
git clone "https://x-access-token:$(gh auth token)@github.com/prototype-dg/rfp-ai.git"

# Push to main:
git push origin main
```

### ADMIN_API_KEY Value

The ADMIN_API_KEY value is stored as a GitHub Actions secret (`ADMIN_API_KEY`) and as an Azure
App Setting. It was provided and confirmed working after the X-Admin-Key rollout.  
**To rotate:** Generate a new UUID/random string → update GitHub secret → update Azure App Setting
→ the SPA will pick it up on next page load (injected server-side by `getLayout(adminKey)`).

---

## 5. GitHub Actions CI/CD Pipeline

**File:** `.github/workflows/main_app-rfp-tool.yml`  
**Trigger:** push to `main` branch + manual `workflow_dispatch`  
**Concurrency:** cancels older in-flight runs on same branch (`cancel-in-progress: true`)  
**Permissions block:** `contents: read` only — GITHUB_TOKEN cannot write to repo

### Deploy Steps (in order)

1. `actions/checkout@v4` — checkout main
2. `actions/setup-node@v4` — Node.js 22 + npm cache
3. `npm ci` — install ALL deps (devDeps needed for tsc)
4. `npm run build:azure` — `tsc --project tsconfig.azure.json` → `dist-azure/`
5. `npm ci --omit=dev` — strip devDeps (reduces zip ~300MB → ~80MB)
6. Download `chrome-headless-shell` into `./puppeteer-cache/` (binary travels in zip)
7. Verify key files exist (`dist-azure/server-azure.js`, better-sqlite3 prebuild, etc.)
8. `azure/login@v2` with `AZURE_CREDENTIALS` service principal
9. **RBAC scope check** — fails deploy if service principal has subscription-level Contributor/Owner
10. **Storage isolation check** — prints account name + RG for manual review
11. `az webapp config appsettings set` — sets all env vars on the App Service
12. `az webapp config set --startup-file /home/site/wwwroot/startup.sh`
13. `zip -r deploy.zip .` — excludes: `.git`, `.env`, `src/`, `vite.config*`, `tsconfig*`, etc.
14. `az webapp deploy --type zip` — synchronous zip deploy via ARM
15. `az webapp restart` — explicit restart to load new zip
16. Poll `https://rfp.andersenlab.com.pl/` for HTTP 200 (40 attempts × 15s = 10 min timeout)

### Startup Sequence (Azure side)
```
Azure starts container
→ startup.sh runs:
    apt-get install libglib2.0-0 libnss3 libnspr4 ... (Chromium .so deps)
    exec node /home/site/wwwroot/dist-azure/server-azure.js
→ server-azure.ts:
    loadProfileFromDb() — reads active_profile from SQLite, sets in-memory state
    serve({ fetch: app.fetch, port: 8080 })
→ api/index.ts module load:
    warmupBrowser() — launches chrome-headless-shell once (pays cold-start cost)
```

---

## 6. Security Posture & Recent Hardening

All security work was done in commits `590abb4` through `aa4a020` (Oct 8–9, 2026).

### Current Security Controls

#### CORS (`src/index-azure.ts`)
```typescript
const ALLOWED_ORIGINS = [
  'https://rfp-ai.andersenlab.com',      // primary production URL
  'https://app-rfp-tool.azurewebsites.net', // Azure native URL
  'https://demo.andersenlab.com',         // external demo switcher
]
// Any other origin → no Access-Control-Allow-Origin header → browser blocks
```

#### Authentication (`src/index-azure.ts`)
All `/api/*` routes require `X-Admin-Key: <ADMIN_API_KEY>` header, **except**:

| Exemption | Path Pattern | Reason |
|---|---|---|
| Public vendor portal | `/api/submit/*` | External vendors — no credentials |
| Webhook | `/api/webhook/*` | Resend inbound-email — no shared secret possible |
| Demo status | `/api/demo/status` | Read-only, cross-origin from demo.andersenlab.com |
| Profile switch | `/api/admin/set-profile` | PIN-protected at handler level (DEMO_SWITCH_PIN) |
| RFP preview | `/api/rfps/:id/preview-html` | Browser navigation (iframe src=) — cannot send headers |
| RFP PDF | `/api/rfps/:id/pdf` | Browser navigation (window.open) — cannot send headers |
| Proposal PDF | `/api/proposals/pdf/*` | Browser navigation (iframe src=) — cannot send headers |

**Fail-closed:** Returns `503 {"error":"API authentication not configured"}` if `ADMIN_API_KEY`
env var is absent. This prevents accidental open access if the secret is not set.

#### Security Headers (all responses)
```
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
X-Frame-Options: SAMEORIGIN          ← SAMEORIGIN not DENY — SPA uses iframes for PDF preview
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' cdn.jsdelivr.net ...
  frame-ancestors 'self'             ← belt-and-suspenders with X-Frame-Options: SAMEORIGIN
```

**Important:** `X-Frame-Options` is `SAMEORIGIN` (not `DENY`) because the SPA renders:
- `<iframe src="/api/rfps/:id/preview-html">` — RFP letterhead preview
- `<iframe src="/api/proposals/pdf/:key">` — proposal PDF inline viewer

#### Removed Endpoints
- `/api/pdf-diag` — **deleted** in commit `6aab0c3`. This endpoint dumped `process.env`
  (including `RESEND_API_KEY`, `OPENAI_API_KEY`, `AZURE_STORAGE_CONNECTION_STRING`) as JSON.
  PDF generation is working; the diagnostic endpoint had served its purpose.

#### Frontend Security
- `window._adminKey` is injected server-side into the HTML shell (same-origin only)
- SPA's `_getAdminHeaders()` helper reads `window._adminKey` and includes it on every API fetch
- The admin key is NOT in any JS file on disk — only rendered into the HTML at request time

---

## 7. Brand Profile System

### Profiles
| Profile ID | Name | Accent | Use Case |
|---|---|---|---|
| `andersen` | Andersen | `#FFDB00` yellow | Default — Andersen Lab demos |
| `cpc` | Crown Prince's Court | `#BA9765` gold | Saudi government procurement demos |

### How It Works
1. Active profile stored in SQLite: `SELECT value FROM config WHERE key = 'active_profile'`
2. `src/profiles/middleware.ts` reloads from DB every 60 seconds (no restart needed to switch)
3. `src/server-azure.ts` eagerly loads profile from DB at startup to avoid cold-start race condition
4. `getLayout(adminKey)` in `src/layout.ts` calls `getActiveProfile()` and injects profile-specific
   fonts, CSS variables, org name, and brand asset data URIs into the HTML shell
5. All responses include `Cache-Control: no-store` on the SPA catch-all to prevent stale branding

### Switching Profile
**Via demo control panel:**  `https://rfp.andersenlab.com.pl/demo`
- Requires `DEMO_SWITCH_PIN` — this is a separate credential from `ADMIN_API_KEY`

**Via API (PIN-protected, no admin key required):**
```bash
POST /api/admin/set-profile
Content-Type: application/json
{"pin": "<DEMO_SWITCH_PIN>", "profileId": "cpc"}
```

**Via external demo hub:**  `https://demo.andersenlab.com`
- Sends cross-origin requests to `/api/demo/status` and `/api/admin/set-profile`
- Both are in CORS allowlist + exempted from X-Admin-Key middleware
- See `demo-hub-switcher-instructions.md` for full implementation details

---

## 8. External Services

### OpenAI (LLM)
- **Used for:** RFP scope generation, vendor evaluation scoring, proposal budget analysis
- **API key:** `OPENAI_API_KEY` Azure App Setting
- **Base URL:** `https://api.openai.com/v1` (hardcoded in `src/api/index.ts`)
- **Model:** GPT-4o (check `WORKER_VERSION` constant in `src/api/index.ts` for current config)
- **Risk:** If key is shared with other Andersen projects, quota exhaustion is possible.
  **Action required:** Verify this key is demo-dedicated with a spend limit in OpenAI dashboard.

### Resend (Email)
- **Used for:** Proposal submission notification emails to procurement officers
- **API key:** `RESEND_API_KEY` Azure App Setting
- **Sending domain:** `andersenlab.com` (verified in Resend dashboard)
- **Risk:** Key had an exposure window before X-Admin-Key auth was added (the `/api/pdf-diag`
  endpoint was dumping env vars and was accessible without auth). The key should be rotated.
- **Action required (URGENT):** Rotate in Resend dashboard → update GitHub secret.

### Azure Blob Storage
- **Used for:** Storing uploaded proposal PDFs and generated documents
- **Connection string:** `AZURE_STORAGE_CONNECTION_STRING` — account-level credential
- **Container:** `proposal-uploads` (env var `AZURE_BLOB_CONTAINER`, defaults to this)
- **Adapter:** `src/services/blob-bucket.ts` — implements R2Bucket interface
- **Risk:** Account-level connection string grants access to ALL containers in the account.
  If shared with other apps, a leaked string exposes their data too.
- **Action required:** Verify storage account is dedicated to this demo. Consider migrating
  to a SAS token scoped to `proposal-uploads` container only.

### Google Cloud Vision (OCR)
- **Used for:** Extracting text from uploaded vendor proposal PDFs
- **API key:** `GOOGLE_VISION_API_KEY` Azure App Setting
- **Flow:** `pdf-to-img` (pdfium) → base64 image → Vision API `DOCUMENT_TEXT_DETECTION`
- **Service:** `src/services/ocr.ts`

### Azure App Service (hosting)
- **Resource:** `app-rfp-tool` in resource group `Dima-Gibert-RG`
- **Plan:** B3 Linux (2 vCPU, 7 GB RAM) — needed for Puppeteer PDF generation
- **Persistent storage:** `/home/data/` — Azure Files mount; SQLite DB lives here
- **Deployment method:** Zip deploy via `az webapp deploy --type zip` (bypasses Kudu SCM auth)

---

## 9. Key Source Files (with current state)

### `src/index-azure.ts` — Main Application Entry Point

**Current state (as of commit `aa4a020`):**
- CORS allowlist: `rfp-ai.andersenlab.com`, `app-rfp-tool.azurewebsites.net`, `demo.andersenlab.com`
- Azure adapter middleware: injects DB, PROPOSALS_BUCKET, all env vars into `c.env`
- Profile middleware: runs after DB adapter (ordering is critical — see comment in file)
- Security headers middleware: HSTS, nosniff, SAMEORIGIN, CSP, Referrer-Policy, Permissions-Policy
- Error handler: `app.onError` — returns `500` JSON with error message
- Static files: `app.use('/static/*', serveStatic({ root: './public' }))`
- Auth middleware: X-Admin-Key on `/api/*` with all documented exemptions
- Routes: `/api/*` → apiRouter, `/demo`, `/submit/:rfpId`, `/*` (SPA catch-all)

**Known quirk — profile middleware ordering:**
The Azure adapter MUST register before profileMiddleware. If reversed, `c.env.DB` is undefined
when the profile loader runs, causing `markRefreshed()` to fire with the wrong profile for up
to 60 seconds. This ordering is enforced by comment in the file.

### `src/api/index.ts` — API Route Handlers

**Size:** ~3000 lines  
**Current WORKER_VERSION:** `2026-08-17-v101`

Key endpoints:
- `GET /api/version` — canary, returns WORKER_VERSION
- `POST /api/init` — initialises DB schema + seeds vendors (run once after fresh deploy)
- `GET /api/rfps` — list all RFPs
- `POST /api/rfps` — create new RFP
- `POST /api/rfps/:id/generate` — SSE stream — GPT-4o generates RFP scope
- `GET /api/rfps/:id/preview-html` — render RFP letterhead HTML (browser-nav exempt)
- `GET /api/rfps/:id/pdf` — generate RFP PDF via Puppeteer (browser-nav exempt)
- `POST /api/rfps/:id/evaluate` — AI evaluate all proposals for an RFP
- `GET /api/proposals/pdf/:key` — stream proposal PDF from blob (browser-nav exempt)
- `POST /api/submit/:rfpId` — vendor proposal submission (public)
- `POST /api/admin/set-profile` — switch brand profile (PIN-protected, X-Admin-Key exempt)
- `GET /api/demo/status` — get current active profile (public, X-Admin-Key exempt)
- **DELETED:** `GET /api/pdf-diag` — was dumping process.env; removed in `6aab0c3`

### `public/static/app.js` — Frontend SPA

**Current state:** Vanilla JS, ~3000 lines  
Key patterns:
```javascript
// Admin key helper — reads server-injected window._adminKey
function _getAdminHeaders() {
  const key = (window._adminKey || '').trim()
  return key ? { 'X-Admin-Key': key } : {}
}

// Central API call function
async function apiCall(method, path, body) {
  const headers = { ..._getAdminHeaders(), 'Content-Type': 'application/json' }
  // ...
}

// Direct fetch() calls (bypass apiCall) also include admin headers:
// - /api/generate SSE
// - /api/rfps/:id/pdf (window.open — no header needed, browser-nav exempt)
// - /api/proposals/pdf/letterhead
// - upload-rfp-pdf FormData
// - rfps/:id poll
// - upload-arch-doc
```

### `src/services/blob-bucket.ts` — Azure Blob R2 Adapter

R2Bucket interface implementation over Azure Blob Storage.  
Container name: `process.env.AZURE_BLOB_CONTAINER || 'proposal-uploads'`  
Methods: `put(key, body, options?)`, `get(key)`, `delete(key|key[])`, `list({prefix,limit,cursor?})`

### `src/services/db.ts` — D1-Compatible SQLite Adapter

Wraps `better-sqlite3` (synchronous) with the async D1 interface:
- `prepare(sql).bind(...args).run()` → `{ success, meta }`
- `prepare(sql).bind(...args).all()` → `{ results }`
- `prepare(sql).bind(...args).first()` → `row | null`
- `batch([stmt1, stmt2, ...])` → `[result1, result2, ...]`

DB file: `process.env.DB_PATH || '/data/webapp.db'`  
Singleton: one connection per process, created lazily on first use.

### `startup.sh` — Azure Container Startup Script

```bash
apt-get install -y --no-install-recommends \
  libglib2.0-0 libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 \
  libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
  libgbm1 libasound2 libpango-1.0-0 libpangocairo-1.0-0 libcairo2

exec node /home/site/wwwroot/dist-azure/server-azure.js
```

These are Chromium shared library dependencies absent in Azure's default Debian container.

### `tsconfig.azure.json` — TypeScript Config for Azure Build

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",         // CommonJS output — Node.js require()
    "moduleResolution": "Bundler",
    "outDir": "dist-azure",       // compiled output
    "rootDir": "src",
    "strict": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "jsx": "react-jsx",
    "jsxImportSource": "hono/jsx"
  },
  "include": ["src/**/*"],
  "exclude": [
    "node_modules", "dist", "dist-azure",
    "src/index.tsx",              // Cloudflare path — excluded from Azure build
    "src/queue-consumer.ts"       // not used in Azure path
  ]
}
```

---

## 10. Pending Security Items (Manual)

These require action in external dashboards — they cannot be done by code changes alone.

### 🔴 URGENT: Rotate RESEND_API_KEY
**Risk:** The key was accessible via `/api/pdf-diag` (which dumped process.env) before
authentication was added. Any caller who hit that endpoint before commit `6aab0c3` has the key.  
**Steps:**
1. Resend dashboard → API Keys → revoke the current key → generate new key
2. Update GitHub Actions secret: `RESEND_API_KEY`
3. Trigger a deploy so the new key is set as Azure App Setting
4. Audit Resend send logs for unexpected emails during the exposure window

**Bonus:** While rotating, change to minimum-permission key (Sending access only, not Full access).

### 🔴 Verify AZURE_CREDENTIALS RBAC Scope
**Risk:** If the service principal has subscription-level Contributor/Owner, a leaked key gives
full Azure tenant access.  
**Steps:**
1. Azure portal → Resource groups → `Dima-Gibert-RG` → IAM → Role assignments
2. Find the service principal from `AZURE_CREDENTIALS` JSON (`clientId` field)
3. Confirm its assignment is scoped to `Dima-Gibert-RG` (not `/subscriptions/<uuid>`)
4. If subscription-scoped: add resource-group-scoped Contributor role → remove subscription role
   
**Note:** The workflow now auto-checks this on every deploy and fails if wrong.

### 🟡 Verify Azure Storage Account Isolation
**Risk:** Account-level connection string grants access to ALL containers in the storage account.  
**Steps:**
1. Extract `AccountName` from `AZURE_STORAGE_CONNECTION_STRING` secret
2. Azure portal → Storage accounts → find that account
3. Confirm it has no containers for other applications
4. Long-term: create a SAS token scoped to `proposal-uploads` container only

### 🟡 Verify OpenAI Spend Limit
**Risk:** If `OPENAI_API_KEY` is shared with other Andersen projects, repeated AI generation
can exhaust shared quota.  
**Steps:**
1. OpenAI dashboard → Settings → Billing → Usage limits
2. Confirm a hard spend limit is set for this key
3. If key is shared, create a dedicated key for this demo project

---

## 11. Pending Code Fixes (App-Level)

These are security/reliability improvements identified during pentest that require code changes.
None are deployed yet.

### 1. Uninvited Vendor Bypass (resolveVendorForSubmit null check)
**Finding:** A vendor not on the invited list might be able to submit a proposal if
`resolveVendorForSubmit()` returns null and the null check is absent.  
**Fix needed:** Add explicit null check in `POST /api/submit/:rfpId` handler:
```typescript
const vendor = await resolveVendorForSubmit(rfpId, code)
if (!vendor) return c.json({ error: 'Invalid submission link' }, 403)
```

### 2. Content-Type Allowlist on File Upload
**Finding:** File upload endpoint doesn't validate `Content-Type` — a malicious actor could
upload an HTML file that gets stored in blob and later served with a wrong MIME type.  
**Fix needed:** In the upload handler in `src/api/index.ts`, add allowlist:
```typescript
const ALLOWED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/tiff']
if (!ALLOWED_MIME_TYPES.includes(contentType)) {
  return c.json({ error: 'File type not allowed' }, 415)
}
```
Note: The `X-Content-Type-Options: nosniff` header mitigates the XSS risk, but allowlisting
is defence-in-depth.

### 3. Rate Limiting on Submit + LLM Endpoints
**Finding:** No rate limiting on vendor submission or LLM generation endpoints.  
**Fix needed:** Add per-IP rate limiting middleware on:
- `POST /api/submit/:rfpId` — prevent submission spam
- `POST /api/rfps/:id/generate` — prevent SSE stream abuse (LLM cost)
- `POST /api/rfps/:id/evaluate` — prevent evaluation spam (LLM cost)

Suggested approach: in-memory rate limiter keyed by IP + endpoint (acceptable for single-instance
Azure App Service). For multi-instance, use D1 (SQLite) as a distributed counter.

### 4. DOMPurify Before marked.js Rendering
**Finding:** Vendor-submitted proposal text is rendered via `marked.js` in the SPA without
sanitisation, creating a stored XSS risk.  
**Fix needed:** Add DOMPurify to `public/static/app.js`:
```javascript
// In HTML <head> (via layout.ts):
<script src="https://cdn.jsdelivr.net/npm/dompurify@3/dist/purify.min.js"></script>

// In app.js wherever marked() is called:
element.innerHTML = DOMPurify.sanitize(marked.parse(markdownText))
```

### 5. Collapse RFP Enumeration Error Messages
**Finding:** Error messages from `/api/rfps/:id/*` endpoints reveal whether an ID exists
(e.g., "RFP not found" vs "Access denied"). This allows enumeration.  
**Fix needed:** Return a uniform `404` with no detail on missing vs. forbidden resources.

### 6. Admin Key Not Injected on Vendor Portal Routes
**Finding:** `getLayout(adminKey)` only injects `window._adminKey` on the main SPA. The vendor
submission page (`/submit/:rfpId` from `src/submit-page.ts`) and potentially `/demo` don't
receive the admin key. This is intentional for vendor portal, but confirm `/demo` is OK.  
**Current state:** Vendor portal correctly does NOT need the admin key (uses `/api/submit/*`
which is public). The `/demo` page calls `/api/admin/set-profile` directly (PIN-auth, not key-auth).
This is probably fine as-is but worth a review pass.

---

## 12. Standing Operating Procedures

### Before Every Commit
```bash
# TypeScript check MUST pass 0 errors
cd /path/to/rfp-ai-repo
npx tsc --project tsconfig.azure.json --noEmit

# If 0 errors, commit and push
git add .
git commit -m "descriptive message"
git push origin main  # ALWAYS push to main
```

### After Pushing to Main
The GitHub Actions workflow triggers automatically. Monitor at:
`https://github.com/prototype-dg/rfp-ai/actions`

The workflow polls `https://rfp.andersenlab.com.pl/` for HTTP 200 with a 10-minute timeout.
If the deploy fails, check:
1. Kudu debug console: `https://app-rfp-tool.scm.azurewebsites.net/DebugConsole`
2. GitHub Actions logs for the failed step
3. TypeScript compilation errors (should have been caught pre-commit, but verify)

### Checking Live Version
```bash
curl https://rfp.andersenlab.com.pl/api/version
# Returns: {"version":"2026-08-17-v101","ok":true}
```
Compare `version` string to `WORKER_VERSION` constant in `src/api/index.ts`.

### Adding New API Routes
1. Add handler in `src/api/index.ts` (uses `apiRouter.get/post/etc.`)
2. If the route needs to be public (no admin key): add exemption in auth middleware
   in `src/index-azure.ts`
3. If frontend needs to call it: add `_getAdminHeaders()` to the fetch call in `app.js`
4. Run `npx tsc --project tsconfig.azure.json --noEmit` → must be 0 errors
5. Commit + push

### Switching to CPC Profile (for demo)
```bash
# Via API:
curl -X POST https://rfp.andersenlab.com.pl/api/admin/set-profile \
  -H "Content-Type: application/json" \
  -d '{"pin": "<DEMO_SWITCH_PIN>", "profileId": "cpc"}'

# Via /demo page in browser:
# https://rfp.andersenlab.com.pl/demo
```

### Resetting the Database
```bash
# Via API (wipes all RFPs, proposals, vendors — re-seeds vendors):
curl -X POST https://rfp.andersenlab.com.pl/api/admin/reset-rfps \
  -H "X-Admin-Key: <ADMIN_API_KEY>"

# Re-init (creates schema + seeds vendors from scratch):
curl -X POST https://rfp.andersenlab.com.pl/api/init \
  -H "X-Admin-Key: <ADMIN_API_KEY>"
```

---

## 13. Session History: What Changed and Why

### Prior to Oct 8 2026 (established baseline)
- App was running on Azure App Service with wildcard CORS (`*`)
- No authentication on any `/api/*` endpoints
- `/api/debug/*` endpoints (bid amounts, AI scores) fully open
- Brand profile system working with andersen + cpc profiles
- Puppeteer PDF generation working via chrome-headless-shell in zip
- Azure Blob adapter (blob-bucket.ts) in place as R2 drop-in
- `better-sqlite3` SQLite on Azure Files persistent mount

### Oct 8 2026 — Commit `590abb4`: CORS Allowlist + X-Admin-Key Auth
**Why:** All API endpoints were completely unauthenticated. Wildcard CORS allowed any website
to read 571 KB of CPC procurement data cross-origin. Debug endpoints exposed vendor bid amounts
and AI evaluation scores without any auth.

**What changed:**
- `cors()` wildcard → explicit ALLOWED_ORIGINS list
- Added X-Admin-Key middleware on `/api/*` (fail-closed)
- `src/layout.ts` — `getLayout(adminKey?)` signature; injects `window._adminKey`
- `public/static/app.js` — `_getAdminHeaders()` helper; 7 fetch() calls updated
- `src/types.ts` — `ADMIN_API_KEY?: string` added to Bindings
- `.github/workflows/...` — `ADMIN_API_KEY` secret added to `az webapp config appsettings set`

**Issue discovered post-rollout:** `ADMIN_API_KEY` GitHub secret had not been added → all API
calls returned `503 "API authentication not configured"`. Fix: added the secret value.

### Oct 8 2026 — Commit `6aab0c3`: Corporate Infra Hardening
**Why:** Security assessment identified corporate infrastructure risks — env vars dumped by
`/api/pdf-diag` endpoint, missing security headers, over-broad GitHub Actions token permissions,
RBAC scope uncertainty.

**What changed:**
- **DELETED** `/api/pdf-diag` from `src/api/index.ts` (was dumping process.env to JSON)
- Added HSTS, nosniff, X-Frame-Options: DENY, Referrer-Policy, Permissions-Policy, CSP headers
- Added `permissions: contents: read` to workflow
- Added RBAC scope verification step (fails deploy if subscription-level Contributor/Owner)
- Added storage isolation check step (prints account info for manual review)
- Added RESEND/OPENAI/STORAGE guidance comments to workflow appsettings step

### Oct 8 2026 — Commit `3f29ecb`: Restore demo.andersenlab.com Switcher
**Why:** After X-Admin-Key auth rolled out, the external demo switcher at `demo.andersenlab.com`
broke. It makes cross-origin fetch calls to `/api/demo/status` and `/api/admin/set-profile`,
which were now blocked by both CORS and auth middleware.

**What changed (both in `src/index-azure.ts`):**
1. Added `'https://demo.andersenlab.com'` to `ALLOWED_ORIGINS`
2. Exempted `/api/demo/status` and `/api/admin/set-profile` from X-Admin-Key middleware
   (with clear comment explaining why — PIN is a separate credential)

### Oct 9 2026 — Commit `381b3ac`: X-Frame-Options SAMEORIGIN
**Why:** `X-Frame-Options: DENY` (set in previous commit) blocked same-origin iframes. The SPA
renders RFP content via `<iframe src="/api/rfps/:id/preview-html">` and proposal PDFs via
`<iframe src="/api/proposals/pdf/:key">`. Both broke.

**What changed:**
- `X-Frame-Options: DENY` → `SAMEORIGIN`
- `frame-ancestors 'none'` → `frame-ancestors 'self'` in CSP

### Oct 9 2026 — Commit `aa4a020`: Exempt Browser-Navigation API Paths
**Why:** After X-Admin-Key was required on all `/api/*`, three paths broke because they are
loaded as iframe `src=` or `window.open()` targets — browser direct navigations cannot send
custom headers.

**What changed in `src/index-azure.ts` auth middleware:**
```typescript
// Browser-navigation exemptions added:
if (
  /^\/api\/rfps\/\d+\/preview-html$/.test(path) ||
  /^\/api\/rfps\/\d+\/pdf$/.test(path) ||
  path.startsWith('/api/proposals/pdf/')
) {
  return next()
}
```

All three exempted paths are read-only (no mutation possible).

---

## 14. Pentest Findings Reference

A full pentest was conducted in Oct 2026. 8 findings documented. Summary:

| ID | Severity | Status | Finding |
|---|---|---|---|
| F-AUTH-1 | Critical | ✅ Fixed | All /api/* routes unauthenticated |
| F-AUTH-2 | High | ✅ Fixed | CORS wildcard — any site could read procurement data |
| F-XSS-1 | Medium | ⚠️ Pending | marked.js renders vendor text without DOMPurify |
| F-UPLOAD-1 | Medium | ⚠️ Pending | No content-type allowlist on file upload |
| F-ENUM-1 | Low | ⚠️ Pending | RFP ID enumeration via distinct error messages |
| F-SUBMIT-1 | Medium | ⚠️ Pending | resolveVendorForSubmit null check absent |
| F-RATE-1 | Low | ⚠️ Pending | No rate limiting on submit/LLM endpoints |
| F-CORP-1 | High | ⚠️ Manual | AZURE_CREDENTIALS scope unverified; OPENAI_API_KEY possibly shared |
| F-CORP-2 | High | ⚠️ Manual | RESEND_API_KEY had exposure window — rotate required |
| F-CORP-3 | Medium | ⚠️ Manual | AZURE_STORAGE_CONNECTION_STRING account-level; isolation unverified |

---

## 15. Quick-Start Checklist for New Agent

Follow this sequence when starting work in a new chat session:

```
1. Authenticate with GitHub
   → call setup_github_environment (configures git + gh as prototype-dg)

2. Clone the repository
   → git clone "https://x-access-token:$(gh auth token)@github.com/prototype-dg/rfp-ai.git"

3. Verify current state
   → cd rfp-ai
   → git log --oneline -5       (latest commit should be aa4a020 or newer)
   → curl https://rfp.andersenlab.com.pl/api/version   (confirm live version)

4. Read the critical files before making any changes
   → src/index-azure.ts     (middleware chain, CORS, auth, security headers)
   → src/api/index.ts       (all route handlers)
   → public/static/app.js   (_getAdminHeaders, all fetch() calls)

5. Before any commit, run TypeScript check
   → npx tsc --project tsconfig.azure.json --noEmit
   → Must be 0 errors

6. Push to main only
   → git push origin main

7. Check this file for pending work
   → Section 10: Pending Security Items (Manual)
   → Section 11: Pending Code Fixes (App-Level)
```

### Key Facts to Keep in Mind
- **Production platform:** Azure App Service, NOT Cloudflare Workers
- **Entry point:** `src/index-azure.ts` — NOT `src/index.tsx`
- **Build command:** `npm run build:azure` (= `tsc --project tsconfig.azure.json`)
- **Deploy:** automatic on push to `main` via GitHub Actions
- **Auth secret:** `ADMIN_API_KEY` — in GitHub secrets + Azure App Settings
- **Demo PIN:** `DEMO_SWITCH_PIN` — separate from ADMIN_API_KEY, used only for profile switching
- **DB location:** `/home/data/app.db` on Azure Files persistent storage
- **iframes work:** `X-Frame-Options: SAMEORIGIN` — same-origin iframes are allowed (PDF preview)
- **Browser navigations exempt from auth:** preview-html, rfp pdf, proposals/pdf/* — cannot send headers

---

*This document was auto-generated by an AI agent on 2026-10-21 from repository state at commit `aa4a020`.*  
*Update this file when significant architecture changes are made.*
