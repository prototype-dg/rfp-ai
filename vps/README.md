# VPS PDF Render Sidecar

Puppeteer-based PDF generation service running on `api.cpc-rfp.website`.

## Architecture

```
Browser / Cloudflare Worker
        │
        │  POST /pdf/render-pdf
        │  { html, page_width, page_height }
        ▼
  nginx (api.cpc-rfp.website:443)
        │ proxy_pass  strips /pdf prefix
        ▼
  Node.js / Express (127.0.0.1:8001)   ← this service
        │  page.pdf({ width, height, displayHeaderFooter:false, margin:0 })
        ▼
  Puppeteer / Chromium
        │
        ▼
  PDF bytes → response
```

## File Layout (on VPS)

```
/opt/pdf-service/
├── server.js            ← main service (copy of vps/server.js in this repo)
├── package.json         ← deps: express + puppeteer
├── ecosystem.config.cjs ← PM2 config
└── node_modules/
```

## Version History

| Version | Change |
|---------|--------|
| v1 | Initial — `format:'A4'`, no auth |
| v2 | Add `letterhead_data_uri` support, Bearer auth. Still `format:'A4'` + `displayHeaderFooter:true` + 72mm top margin |
| v3 | **Current** — `width/height` from request body (default 794×1123px), `displayHeaderFooter:false`, zero margins. 1 LLM page div = 1 PDF page. Inline Andersen header/footer design. |

## Key Config

| Item | Value |
|------|-------|
| Listen address | `127.0.0.1:8001` |
| Nginx public path | `https://api.cpc-rfp.website/pdf/` |
| PM2 process name | `pdf-service` |
| Auth | `Authorization: Bearer $PDF_SERVICE_SECRET` |
| Version endpoint | `GET /pdf/` → `{"version":"3"}` |

## Deployment

### First-time setup (already done)
```bash
# On VPS as root/sudo user
mkdir -p /opt/pdf-service /var/log/pdf-service
cd /opt/pdf-service
npm install express puppeteer   # installs Chromium automatically
pm2 start ecosystem.config.cjs
pm2 save && pm2 startup
```

### Update service code (normal deploy)
```bash
# From project root in this repo sandbox:
bash vps/deploy.sh [user@api.cpc-rfp.website]

# Or manually over SSH:
scp vps/server.js user@api.cpc-rfp.website:/opt/pdf-service/server.js
ssh user@api.cpc-rfp.website "pm2 reload pdf-service"
```

### Verify live version
```bash
curl https://api.cpc-rfp.website/pdf/
# Expected: {"status":"ok","service":"pdf-render","version":"3"}
```

## Environment Variables

| Variable | Where set | Purpose |
|----------|-----------|---------|
| `PDF_SERVICE_SECRET` | PM2 env / `.env` on VPS | Bearer token the Worker sends; must match `PDF_RENDER_SECRET` Cloudflare secret |

Set it on the VPS without committing:
```bash
# Option A — export before pm2 start (in /etc/environment or .bashrc)
export PDF_SERVICE_SECRET="your-secret-here"
pm2 restart pdf-service

# Option B — pm2 env (per-process)
pm2 set pdf-service:PDF_SERVICE_SECRET "your-secret-here"
pm2 restart pdf-service
```

## Logs & Monitoring

```bash
pm2 logs pdf-service            # stream live logs
pm2 logs pdf-service --nostream # dump recent logs
pm2 status                      # process health
tail -f /var/log/pdf-service/error.log
```

## Nginx Config

See `vps/nginx.conf` in this repo. The live file lives at:
```
/etc/nginx/sites-available/andersen-pdf
/etc/nginx/sites-enabled/andersen-pdf  (symlink)
```

Reload nginx after changes:
```bash
sudo nginx -t && sudo systemctl reload nginx
```
