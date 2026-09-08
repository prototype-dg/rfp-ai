/**
 * demo-switcher.ts — Demo presenter control page
 *
 * Served at GET /demo
 * Lets a presenter PIN-authenticate and switch the live brand profile
 * between Andersen and CPC with a single click. No curl required.
 */

export function getDemoSwitcherPage(): string {
  return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Demo Control — RFP Platform</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --navy:   #020D1C;
      --yellow: #FFDB00;
      --gold:   #BA9765;
      --ink:    #1a1a1a;
      --muted:  #6b7280;
      --line:   #e5e7eb;
      --bg:     #f8fafc;
      --paper:  #ffffff;
      --radius: 12px;
      --shadow: 0 4px 24px rgba(0,0,0,0.08);
    }

    body {
      font-family: 'Inter', system-ui, sans-serif;
      background: var(--bg);
      color: var(--ink);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }

    /* ── Header ─────────────────────────────────────────────────────────── */
    .page-header {
      text-align: center;
      margin-bottom: 32px;
    }
    .page-header .eyebrow {
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--muted);
      margin-bottom: 8px;
    }
    .page-header h1 {
      font-size: 28px;
      font-weight: 700;
      color: var(--navy);
    }
    .page-header p {
      margin-top: 8px;
      font-size: 14px;
      color: var(--muted);
    }

    /* ── Card shell ─────────────────────────────────────────────────────── */
    .card {
      background: var(--paper);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      padding: 32px;
      width: 100%;
      max-width: 520px;
    }

    /* ── Status bar ─────────────────────────────────────────────────────── */
    .status-bar {
      display: flex;
      align-items: center;
      gap: 10px;
      background: #f1f5f9;
      border-radius: 8px;
      padding: 12px 16px;
      margin-bottom: 28px;
      font-size: 13px;
    }
    .status-dot {
      width: 8px; height: 8px;
      border-radius: 50%;
      background: #94a3b8;
      flex-shrink: 0;
    }
    .status-dot.active { background: #22c55e; }
    .status-label { color: var(--muted); }
    .status-value { font-weight: 600; color: var(--ink); margin-left: 2px; }
    .status-refresh {
      margin-left: auto;
      font-size: 11px;
      color: var(--muted);
      cursor: pointer;
      display: flex; align-items: center; gap: 4px;
    }
    .status-refresh:hover { color: var(--navy); }

    /* ── PIN section ────────────────────────────────────────────────────── */
    .section-label {
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--muted);
      margin-bottom: 10px;
    }
    .pin-row {
      display: flex;
      gap: 8px;
      margin-bottom: 24px;
    }
    .pin-input {
      flex: 1;
      height: 44px;
      border: 1.5px solid var(--line);
      border-radius: 8px;
      padding: 0 14px;
      font-size: 15px;
      font-family: 'Inter', monospace;
      letter-spacing: 0.15em;
      outline: none;
      transition: border-color 0.15s;
      background: #fcfdfe;
    }
    .pin-input:focus { border-color: var(--navy); }
    .pin-input.error { border-color: #ef4444; }

    /* ── Profile cards ──────────────────────────────────────────────────── */
    .profiles-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin-bottom: 20px;
    }

    .profile-card {
      border: 2px solid var(--line);
      border-radius: 10px;
      padding: 18px 16px;
      cursor: pointer;
      transition: border-color 0.15s, box-shadow 0.15s, transform 0.1s;
      position: relative;
      user-select: none;
    }
    .profile-card:hover {
      transform: translateY(-1px);
      box-shadow: 0 6px 20px rgba(0,0,0,0.1);
    }
    .profile-card.selected {
      border-color: currentColor;
      box-shadow: 0 0 0 3px color-mix(in srgb, currentColor 15%, transparent);
    }
    .profile-card.active-profile::after {
      content: 'LIVE';
      position: absolute;
      top: 10px; right: 10px;
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.1em;
      padding: 2px 7px;
      border-radius: 20px;
      background: #dcfce7;
      color: #16a34a;
    }

    .profile-card.andersen { color: #FFDB00; }
    .profile-card.andersen .profile-name { color: var(--navy); }

    .profile-card.cpc { color: #BA9765; }
    .profile-card.cpc .profile-name { color: #1B1712; }

    .profile-accent-bar {
      height: 4px;
      border-radius: 2px;
      background: currentColor;
      margin-bottom: 14px;
    }
    .profile-logo {
      font-size: 22px;
      margin-bottom: 10px;
    }
    .profile-name {
      font-size: 15px;
      font-weight: 700;
      margin-bottom: 4px;
    }
    .profile-desc {
      font-size: 12px;
      color: var(--muted);
      line-height: 1.4;
    }

    /* ── Action button ──────────────────────────────────────────────────── */
    .switch-btn {
      width: 100%;
      height: 48px;
      border: none;
      border-radius: 8px;
      background: var(--navy);
      color: #fff;
      font-size: 15px;
      font-weight: 600;
      font-family: 'Inter', sans-serif;
      cursor: pointer;
      transition: background 0.15s, opacity 0.15s;
      display: flex; align-items: center; justify-content: center; gap: 8px;
    }
    .switch-btn:hover:not(:disabled) { background: #0b1626; }
    .switch-btn:disabled { opacity: 0.45; cursor: not-allowed; }
    .switch-btn.loading { opacity: 0.7; }

    /* ── Toast ──────────────────────────────────────────────────────────── */
    .toast {
      position: fixed;
      bottom: 28px; left: 50%;
      transform: translateX(-50%) translateY(20px);
      background: var(--navy);
      color: #fff;
      padding: 12px 24px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      opacity: 0;
      transition: opacity 0.2s, transform 0.2s;
      pointer-events: none;
      white-space: nowrap;
      z-index: 999;
      max-width: calc(100vw - 32px);
      text-align: center;
    }
    .toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }
    .toast.success { background: #16a34a; }
    .toast.error   { background: #dc2626; }

    /* ── Open app link ──────────────────────────────────────────────────── */
    .open-app-row {
      margin-top: 20px;
      padding-top: 20px;
      border-top: 1px solid var(--line);
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      flex-wrap: wrap;
    }
    .open-link {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 16px;
      border-radius: 6px;
      border: 1.5px solid var(--line);
      font-size: 13px;
      font-weight: 500;
      color: var(--navy);
      text-decoration: none;
      transition: border-color 0.15s, background 0.15s;
    }
    .open-link:hover { border-color: var(--navy); background: #f0f4ff; }
    .open-link.primary {
      background: var(--navy);
      color: #fff;
      border-color: var(--navy);
    }
    .open-link.primary:hover { background: #0b1626; }

    /* ── Responsive ─────────────────────────────────────────────────────── */
    @media (max-width: 460px) {
      .profiles-grid { grid-template-columns: 1fr; }
      .card { padding: 24px 20px; }
    }
  </style>
</head>
<body>

  <div class="page-header">
    <div class="eyebrow">Demo Control Panel</div>
    <h1>RFP Platform Switcher</h1>
    <p>Switch the live brand profile shown to visitors in real time.</p>
  </div>

  <div class="card">

    <!-- Status bar -->
    <div class="status-bar" id="status-bar">
      <div class="status-dot" id="status-dot"></div>
      <span class="status-label">Active profile:</span>
      <span class="status-value" id="status-value">Loading…</span>
      <span class="status-refresh" id="refresh-btn" title="Refresh status">
        <i class="fa-solid fa-rotate-right"></i> Refresh
      </span>
    </div>

    <!-- PIN -->
    <div class="section-label">Demo PIN</div>
    <div class="pin-row">
      <input
        type="password"
        id="pin-input"
        class="pin-input"
        placeholder="Enter PIN"
        maxlength="32"
        autocomplete="off"
        inputmode="numeric"
      >
    </div>

    <!-- Profile selector -->
    <div class="section-label">Select Profile</div>
    <div class="profiles-grid">

      <div class="profile-card andersen" id="card-andersen" data-profile="andersen">
        <div class="profile-accent-bar"></div>
        <div class="profile-logo"><i class="fa-solid fa-building"></i></div>
        <div class="profile-name">Andersen</div>
        <div class="profile-desc">Global consulting — yellow accent, dark sidebar</div>
      </div>

      <div class="profile-card cpc" id="card-cpc" data-profile="cpc">
        <div class="profile-accent-bar"></div>
        <div class="profile-logo"><i class="fa-solid fa-crown"></i></div>
        <div class="profile-name">Crown Prince's Court</div>
        <div class="profile-desc">UAE government — gold accent, RTL support</div>
      </div>

    </div>

    <!-- Switch button -->
    <button class="switch-btn" id="switch-btn" disabled>
      <i class="fa-solid fa-repeat"></i>
      <span id="switch-label">Select a profile to switch</span>
    </button>

    <!-- Open app -->
    <div class="open-app-row">
      <a href="/" class="open-link primary" target="_blank" rel="noopener">
        <i class="fa-solid fa-arrow-up-right-from-square"></i>
        Open Live App
      </a>
      <a href="https://rfp-ai.andersenlab.com/" class="open-link" target="_blank" rel="noopener">
        rfp-ai.andersenlab.com
      </a>
    </div>

  </div>

  <div class="toast" id="toast"></div>

  <script>
    const API_BASE = window.location.origin

    let selectedProfile = null
    let activeProfile   = null

    // ── Fetch current active profile ────────────────────────────────────────
    async function fetchStatus() {
      try {
        const r = await fetch(API_BASE + '/api/demo/status')
        if (!r.ok) throw new Error('HTTP ' + r.status)
        const d = await r.json()
        setActiveProfile(d.activeProfile)
      } catch(e) {
        document.getElementById('status-value').textContent = 'Unknown'
      }
    }

    function setActiveProfile(id) {
      activeProfile = id

      const dot   = document.getElementById('status-dot')
      const label = document.getElementById('status-value')

      dot.className   = 'status-dot active'
      label.textContent = id === 'andersen' ? 'Andersen' : "Crown Prince's Court (CPC)"

      // Mark active card
      document.querySelectorAll('.profile-card').forEach(c => {
        c.classList.toggle('active-profile', c.dataset.profile === id)
      })

      updateSwitchBtn()
    }

    // ── Profile card selection ──────────────────────────────────────────────
    document.querySelectorAll('.profile-card').forEach(card => {
      card.addEventListener('click', () => {
        document.querySelectorAll('.profile-card').forEach(c => c.classList.remove('selected'))
        card.classList.add('selected')
        selectedProfile = card.dataset.profile
        updateSwitchBtn()
      })
    })

    function updateSwitchBtn() {
      const btn   = document.getElementById('switch-btn')
      const label = document.getElementById('switch-label')

      if (!selectedProfile) {
        btn.disabled = true
        label.textContent = 'Select a profile to switch'
        return
      }
      if (selectedProfile === activeProfile) {
        btn.disabled = true
        label.textContent = selectedProfile === 'andersen' ? 'Andersen is already active' : 'CPC is already active'
        return
      }
      btn.disabled = false
      label.textContent = selectedProfile === 'andersen'
        ? 'Switch to Andersen'
        : "Switch to Crown Prince's Court"
    }

    // ── Switch action ───────────────────────────────────────────────────────
    document.getElementById('switch-btn').addEventListener('click', async () => {
      const pin = document.getElementById('pin-input').value.trim()
      if (!pin) {
        showToast('Enter your demo PIN first', 'error')
        document.getElementById('pin-input').classList.add('error')
        document.getElementById('pin-input').focus()
        return
      }
      document.getElementById('pin-input').classList.remove('error')

      const btn = document.getElementById('switch-btn')
      btn.classList.add('loading')
      btn.disabled = true
      document.getElementById('switch-label').textContent = 'Switching…'

      try {
        const r = await fetch(API_BASE + '/api/admin/set-profile', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ pin, profileId: selectedProfile }),
        })
        const d = await r.json()

        if (r.ok && d.ok) {
          setActiveProfile(d.activeProfile)
          showToast(
            d.activeProfile === 'andersen'
              ? '✓ Switched to Andersen'
              : "✓ Switched to Crown Prince's Court",
            'success'
          )
        } else {
          showToast(d.error || 'Switch failed', 'error')
          if (d.error === 'Invalid PIN') {
            document.getElementById('pin-input').classList.add('error')
            document.getElementById('pin-input').select()
          }
          updateSwitchBtn()
        }
      } catch(e) {
        showToast('Network error — try again', 'error')
        updateSwitchBtn()
      } finally {
        btn.classList.remove('loading')
      }
    })

    // ── PIN enter key ────────────────────────────────────────────────────────
    document.getElementById('pin-input').addEventListener('keydown', e => {
      if (e.key === 'Enter' && !document.getElementById('switch-btn').disabled) {
        document.getElementById('switch-btn').click()
      }
      document.getElementById('pin-input').classList.remove('error')
    })

    // ── Refresh ──────────────────────────────────────────────────────────────
    document.getElementById('refresh-btn').addEventListener('click', () => {
      document.getElementById('status-value').textContent = 'Refreshing…'
      document.getElementById('status-dot').className = 'status-dot'
      fetchStatus()
    })

    // ── Toast ────────────────────────────────────────────────────────────────
    let toastTimer = null
    function showToast(msg, type = '') {
      const t = document.getElementById('toast')
      t.textContent = msg
      t.className = 'toast show ' + type
      clearTimeout(toastTimer)
      toastTimer = setTimeout(() => { t.className = 'toast' }, 3000)
    }

    // ── Init ─────────────────────────────────────────────────────────────────
    fetchStatus()
  </script>
</body>
</html>`
}
