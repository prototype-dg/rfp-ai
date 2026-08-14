# VPS Sidecar Services

Two services run on `api.cpc-rfp.website` (vm15981785), managed by **systemd**.

---

## Architecture

```
Cloudflare Worker  (api/index.ts)
        │
        ├─ POST /pdf/render-pdf  ──────────────────────────────────────┐
        │                                                               │
        └─ POST /                (OCR / proposal extraction)           │
               ↓                                                        │
        nginx  (api.cpc-rfp.website:443)                               │
               │                                                        │
               ├─ /pdf/*  → 127.0.0.1:8001  (pdf-render — Node.js)  ◄─┘
               │
               └─ /*      → 127.0.0.1:8000  (pdf-sidecar — Python/FastAPI)
```

---

## Services

### 1. `pdf-render` — Puppeteer PDF generation

| Item | Value |
|------|-------|
| Code | `vps/pdf-render/server.js` (this repo) |
| Live path | `/opt/pdf-service/server.js` |
| Port | `127.0.0.1:8001` |
| Public URL | `https://api.cpc-rfp.website/pdf/` |
| Process manager | **systemd** — `pdf-render.service` |
| Node version | v20.20.2 |
| Current version | **v3** |

**Version history:**

| Ver | Change |
|-----|--------|
| v1 | Initial — `format:'A4'`, no auth |
| v2 | Add `letterhead_data_uri`, Bearer auth — still `format:'A4'` + `displayHeaderFooter:true` + 72mm top margin (caused white-space-at-top bug) |
| v3 | **Current** — `width:'794px'`, `height:'1123px'`, `displayHeaderFooter:false`, `margin:0`. Inline Andersen header/footer. 1 LLM page div = 1 PDF page. |

**Deploy (update `server.js` only):**
```bash
# From project root in this sandbox:
bash vps/deploy.sh

# Or manually:
scp vps/pdf-render/server.js root@api.cpc-rfp.website:/opt/pdf-service/server.js
ssh root@api.cpc-rfp.website "systemctl restart pdf-render.service"
```

**Logs:**
```bash
ssh root@api.cpc-rfp.website "journalctl -u pdf-render.service -n 50 -f"
```

---

### 2. `pdf-sidecar` — Python/FastAPI PDF extraction (OCR)

| Item | Value |
|------|-------|
| Code | `vps/pdf-sidecar/main.py` (this repo) |
| Live path | `/opt/pdf-sidecar/main.py` |
| Port | `127.0.0.1:8000` |
| Public URL | `https://api.cpc-rfp.website/` |
| Process manager | **systemd** — `pdf-sidecar.service` |
| Runtime | Python 3 / uvicorn (venv at `/opt/pdf-sidecar/venv`) |
| Current version | v5.0.0 |

**Deploy (update `main.py` only):**
```bash
scp vps/pdf-sidecar/main.py root@api.cpc-rfp.website:/opt/pdf-sidecar/main.py
ssh root@api.cpc-rfp.website "systemctl restart pdf-sidecar.service"
```

**Deploy (after requirements.txt change):**
```bash
scp vps/pdf-sidecar/requirements.txt root@api.cpc-rfp.website:/opt/pdf-sidecar/requirements.txt
ssh root@api.cpc-rfp.website "
  source /opt/pdf-sidecar/venv/bin/activate
  pip install -r /opt/pdf-sidecar/requirements.txt
  systemctl restart pdf-sidecar.service
"
```

**Logs:**
```bash
ssh root@api.cpc-rfp.website "journalctl -u pdf-sidecar.service -n 50 -f"
```

---

## Systemd Units

Reference copies in `vps/systemd/` (secrets replaced with placeholders — actual values set on VPS).

| File | Live path |
|------|-----------|
| `systemd/pdf-render.service` | `/etc/systemd/system/pdf-render.service` |
| `systemd/pdf-sidecar.service` | `/etc/systemd/system/pdf-sidecar.service` |

**After editing a unit file on VPS:**
```bash
ssh root@api.cpc-rfp.website "systemctl daemon-reload && systemctl restart pdf-render.service"
```

---

## Nginx Config

Reference copy in `vps/nginx/pdf-sidecar.conf` (live at `/etc/nginx/sites-available/pdf-sidecar`).

```
/pdf/*  →  127.0.0.1:8001   (pdf-render, Node.js, 60s timeout)
/*      →  127.0.0.1:8000   (pdf-sidecar, Python, 600s timeout)
```

TLS is managed by Certbot at `/etc/letsencrypt/live/api.cpc-rfp.website/`.

**After editing nginx config:**
```bash
ssh root@api.cpc-rfp.website "nginx -t && systemctl reload nginx"
```

---

## Environment Secrets

Secrets are set in the systemd unit files on the VPS — **never committed to git**.
The repo contains placeholder values for reference only.

| Secret | Unit | Used by |
|--------|------|---------|
| `PDF_SERVICE_SECRET` | `pdf-render.service` | Worker → pdf-render auth |
| `PDF_SIDECAR_SECRET` | `pdf-sidecar.service` | Worker → pdf-sidecar auth |
| `GOOGLE_VISION_API_KEY` | `pdf-sidecar.service` | Google Vision OCR |

The Cloudflare Worker reads these as secrets (`PDF_RENDER_SECRET`, `PDF_RENDER_URL`).

---

## Sandbox SSH Access

The sandbox `~/.ssh/vps_deploy_key` (ED25519) is authorized on the VPS.
`~/.ssh/config` has a `vps-pdf` alias pointing to `root@api.cpc-rfp.website`.

```bash
# Test connection
ssh vps-pdf "systemctl is-active pdf-render pdf-sidecar"

# Quick health check
curl https://api.cpc-rfp.website/pdf/
# → {"status":"ok","service":"pdf-render","version":"3"}
```

---

## Quick-Reference Commands

```bash
# Deploy pdf-render update (most common):
bash vps/deploy.sh

# SSH to VPS:
ssh vps-pdf

# Check all services:
ssh vps-pdf "systemctl status pdf-render pdf-sidecar nginx"

# Stream live logs:
ssh vps-pdf "journalctl -u pdf-render.service -f"
ssh vps-pdf "journalctl -u pdf-sidecar.service -f"

# Verify public endpoints:
curl https://api.cpc-rfp.website/pdf/
curl https://api.cpc-rfp.website/health
```
