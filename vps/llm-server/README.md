# VPS LLM Server — Install Manifest

**Installed**: 2026-08-15  
**Purpose**: Local OpenAI-compatible LLM inference on the VPS to eliminate the Genspark proxy bottleneck.  
**Host**: `api.cpc-rfp.website` (same server running the PDF sidecar)  
**External endpoint**: `https://api.cpc-rfp.website/llm/v1`  
**Health check**: `https://api.cpc-rfp.website/llm/health` → `{"status":"ok"}`

---

## Software Installed

### 1. llama.cpp — binary release b10448

| Property | Value |
|---|---|
| Version | b10448 (Ubuntu x64 pre-built binary) |
| Source | https://github.com/ggerganov/llama.cpp/releases/tag/b10448 |
| Archive downloaded | `llama-b10448-bin-ubuntu-x64.zip` |
| Install path | `/opt/llama-server/llama-b10448/` |
| Binary | `/opt/llama-server/llama-b10448/llama-server` |
| Shared libs | `/opt/llama-server/llama-b10448/libggml*.so*`, `libllama*.so*` |
| Runtime lib path | `/opt/llama-server/bin/` (symlinked/copied, added to ldconfig) |
| ldconfig conf | `/etc/ld.so.conf.d/llama-server.conf` → adds `/opt/llama-server/bin` |
| Original archive | `/opt/llama-server/llama-bin.tar.gz` |

### 2. Model — Qwen2.5-3B-Instruct Q4_K_M

| Property | Value |
|---|---|
| Model name | Qwen2.5-3B-Instruct Q4_K_M |
| GGUF file | `/opt/llama-server/models/Qwen2.5-3B-Instruct-Q4_K_M.gguf` |
| Size on disk | ~1.8 GB |
| RAM at runtime | ~1.7 GB |
| Source | Hugging Face: `Qwen/Qwen2.5-3B-Instruct-GGUF` |
| Context window | 16384 tokens |
| Max output | 6000 tokens |

### 3. systemd service

| Property | Value |
|---|---|
| Unit file | `/etc/systemd/system/llama-server.service` |
| Service name | `llama-server` |
| Runs as | `root` |
| Listen address | `127.0.0.1:11434` (localhost only, nginx proxies externally) |
| API key file | `/opt/llama-server/api.key` |
| API key value | `23eb310d5c8764c8ec84a4a119d4257a17fa5c93e98e77d0` |
| Memory limit | 4 GB (`MemoryMax=4G`) |
| Auto-restart | Yes (`Restart=on-failure`, `RestartSec=5`) |

Copy of the unit file: [`llama-server.service`](./llama-server.service)

### 4. nginx — /llm/ location block

| Property | Value |
|---|---|
| nginx config file modified | `/etc/nginx/sites-enabled/pdf-sidecar` |
| Pre-modification backup | `/etc/nginx/sites-available/pdf-sidecar.bak` |
| Block added | `location /llm/ { proxy_pass http://127.0.0.1:11434/; ... }` |
| Read timeout | 180s (handles long LLM inference) |
| Buffering | disabled (`proxy_buffering off`) |

Copy of the nginx snippet: [`nginx-llm.conf`](./nginx-llm.conf)

### 5. Cloudflare Worker secrets updated

| Secret | Value |
|---|---|
| `OPENAI_BASE_URL` | `https://api.cpc-rfp.website/llm/v1` |
| `OPENAI_API_KEY` | `23eb310d5c8764c8ec84a4a119d4257a17fa5c93e98e77d0` |

These point the Worker's `callLLM()` function at the local VPS instead of the Genspark proxy.

---

## Directory Layout on VPS

```
/opt/llama-server/
├── llama-b10448/                          # extracted release build
│   ├── llama-server                       # main server binary
│   ├── libggml.so -> libggml.so.0
│   ├── libggml.so.0
│   ├── libggml-base.so -> libggml-base.so.0
│   ├── libggml-base.so.0
│   ├── libggml-cpu.so -> libggml-cpu.so.0
│   ├── libggml-cpu.so.0
│   ├── libllama.so -> libllama.so.0
│   ├── libllama.so.0
│   └── ...other shared libs
├── bin/                                   # copied binary + libs (on ldconfig path)
├── models/
│   └── Qwen2.5-3B-Instruct-Q4_K_M.gguf  # 1.8 GB model
├── api.key                                # API key file (chmod 600)
└── llama-bin.tar.gz                       # original downloaded archive

/etc/systemd/system/llama-server.service   # systemd unit
/etc/ld.so.conf.d/llama-server.conf        # ldconfig path entry
/etc/nginx/sites-enabled/pdf-sidecar       # modified (added /llm/ block)
/etc/nginx/sites-available/pdf-sidecar.bak # pre-modification backup
```

---

## Runtime Performance (observed)

| Metric | Value |
|---|---|
| VPS CPU | 4-core Intel Xeon (AVX-512 capable) |
| VPS RAM total | ~8 GB |
| RAM used by llama-server | ~1.7 GB |
| Short JSON response time | ~2.5s |
| Full RFP extraction (30k chars → 5000 tokens out) | ~35s |
| Comparison: Genspark proxy same task | 45s+ with frequent timeouts |

---

## Status Checks

```bash
# Is the service running?
systemctl status llama-server

# Is it listening on 11434?
ss -tlnp | grep 11434

# RAM usage
systemctl status llama-server | grep Memory

# External health check
curl https://api.cpc-rfp.website/llm/health

# Quick inference smoke test
curl -s https://api.cpc-rfp.website/llm/v1/chat/completions \
  -H "Authorization: Bearer 23eb310d5c8764c8ec84a4a119d4257a17fa5c93e98e77d0" \
  -H "Content-Type: application/json" \
  -d '{"model":"qwen2.5-3b-instruct","messages":[{"role":"user","content":"Reply with: {\"ok\":true}"}],"max_tokens":20,"stream":false}'
```

---

## Uninstall Instructions

Follow these steps **in order** to completely remove the LLM server from the VPS.

### Step 1 — Stop and disable the systemd service

```bash
systemctl stop llama-server
systemctl disable llama-server
```

### Step 2 — Remove the systemd unit file and reload

```bash
rm /etc/systemd/system/llama-server.service
systemctl daemon-reload
systemctl reset-failed
```

### Step 3 — Remove the nginx /llm/ location block

Edit `/etc/nginx/sites-enabled/pdf-sidecar` and delete the entire `location /llm/ { ... }` block
(the block added from `nginx-llm.conf`). The pre-modification backup is at
`/etc/nginx/sites-available/pdf-sidecar.bak` — you can restore it directly:

```bash
# Option A: restore from backup
cp /etc/nginx/sites-available/pdf-sidecar.bak /etc/nginx/sites-enabled/pdf-sidecar

# Option B: manually edit out the /llm/ block
nano /etc/nginx/sites-enabled/pdf-sidecar
# Delete the block:
#   location /llm/ { ... }

# Test and reload
nginx -t && systemctl reload nginx
```

### Step 4 — Remove the ldconfig entry and refresh

```bash
rm /etc/ld.so.conf.d/llama-server.conf
ldconfig
```

### Step 5 — Remove all installed files

```bash
rm -rf /opt/llama-server
```

### Step 6 — Revert Worker secrets to Genspark proxy

```bash
# From the webapp repo directory on the build machine:
gsk hosted secret_put --name OPENAI_BASE_URL --value "https://www.genspark.ai/api/llm_proxy/v1"
gsk hosted secret_put --name OPENAI_API_KEY --value "<original-genspark-api-key>"
```

> **Note**: The original Genspark API key is stored only in the Worker secret (write-only, cannot be read back).
> If you need to revert and don't have the original key, generate a new one from the Genspark dashboard.

### Step 7 — Verify removal

```bash
# Service gone
systemctl status llama-server  # should report "not found"

# Port free
ss -tlnp | grep 11434  # should return nothing

# nginx no longer proxying /llm/
curl https://api.cpc-rfp.website/llm/health  # should return 404
```

---

## Why This Was Installed

The Genspark LLM proxy (`genspark.ai/api/llm_proxy/v1`) had chronic TTFB latency of 30–45s for
large RFP documents (30k chars input), causing frequent `AbortSignal.timeout(60s)` fires in the
Cloudflare Worker. The proxy is the bottleneck — DeepSeek itself returns results in 2–3s.

Installing Qwen2.5-3B-Instruct Q4_K_M directly on the VPS:
- Eliminates proxy round-trip entirely
- Delivers ~35s end-to-end for full RFP extraction (same task, no timeouts)
- Costs zero additional API credits per extraction
- Runs fully under our control (no external dependency for inference)
