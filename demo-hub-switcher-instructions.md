# Demo Hub — RFP Profile Switcher: Implementation Instructions

**Target file:** `demo.andersenlab.com` (static site — `index.html`, `css/style.css`, `js/main.js`)  
**Goal:** Add an inline Andersen ↔ CPC brand switcher to the existing RFP demo card, with live status badge and PIN-protected switch button.

---

## Background

The RFP app at `https://rfp.andersenlab.com.pl` supports two brand profiles:

| Profile ID | Name | Accent colour |
|---|---|---|
| `andersen` | Andersen | `#FFC400` (yellow) |
| `cpc` | Crown Prince's Court | `#BA9765` (gold) |

The active profile is switched server-side — all visitors see the new branding immediately. Two API endpoints handle this:

```
GET  https://rfp.andersenlab.com.pl/api/demo/status
→ { "ok": true, "activeProfile": "andersen", "orgName": "Andersen" }

POST https://rfp.andersenlab.com.pl/api/admin/set-profile
     Content-Type: application/json
     Body: { "pin": "<secret>", "profileId": "andersen" | "cpc" }
→ success: { "ok": true, "activeProfile": "cpc" }
→ wrong PIN: { "ok": false, "error": "Invalid PIN" }  (HTTP 403)
```

CORS is open on both endpoints — cross-origin fetch from `demo.andersenlab.com` works with no proxy.

---

## 1 — Change to `index.html`

### 1a — Update the card `data-url` (already done, confirm it reads)

The RFP card `data-url` attribute should be:
```
data-url="https://rfp.andersenlab.com.pl/"
```
And the two `<a href=...>` links inside the card (the card-body button and the modal button) should also point to `https://rfp.andersenlab.com.pl/`.

### 1b — Insert the switcher block inside the card body

Find this exact block in the RFP card:

```html
        <p class="card-desc">AI-powered procurement intelligence that digitalises and automates the entire RFP lifecycle — drafting, vendor evaluation with weighted scoring, and ranked shortlist recommendations, all in one audit-ready interface.</p>
        <span class="read-more-link" data-modal-target="modal-procurement">Learn more</span>
        <a href="https://rfp.andersenlab.com.pl/" target="_blank" rel="noopener" class="open-demo-btn">Open Demo <i class="fa-solid fa-arrow-right"></i></a>
```

Replace it with:

```html
        <p class="card-desc">AI-powered procurement intelligence that digitalises and automates the entire RFP lifecycle — drafting, vendor evaluation with weighted scoring, and ranked shortlist recommendations, all in one audit-ready interface.</p>

        <!-- ── RFP Profile Switcher ───────────────────────────────────────── -->
        <div class="rfp-switcher" id="rfp-switcher">

          <!-- Status line -->
          <div class="rfp-switcher__status">
            <span class="rfp-switcher__dot" id="rfp-status-dot"></span>
            <span class="rfp-switcher__status-label">Client profile:</span>
            <span class="rfp-switcher__status-value" id="rfp-status-value">Loading…</span>
            <button class="rfp-switcher__toggle-btn" id="rfp-toggle-btn" aria-expanded="false">
              Switch <i class="fa-solid fa-chevron-down rfp-switcher__chevron" id="rfp-chevron"></i>
            </button>
          </div>

          <!-- Expandable panel -->
          <div class="rfp-switcher__panel" id="rfp-panel">

            <!-- Profile chips -->
            <div class="rfp-switcher__chips">
              <button class="rfp-switcher__chip" id="rfp-chip-andersen" data-profile="andersen">
                <span class="rfp-switcher__chip-dot rfp-switcher__chip-dot--andersen"></span>
                Andersen
              </button>
              <button class="rfp-switcher__chip" id="rfp-chip-cpc" data-profile="cpc">
                <span class="rfp-switcher__chip-dot rfp-switcher__chip-dot--cpc"></span>
                Crown Prince's Court
              </button>
            </div>

            <!-- PIN row -->
            <div class="rfp-switcher__pin-row">
              <input
                type="password"
                id="rfp-pin"
                class="rfp-switcher__pin-input"
                placeholder="Demo PIN"
                maxlength="32"
                autocomplete="off"
                inputmode="numeric"
              >
              <button class="rfp-switcher__apply-btn" id="rfp-apply-btn" disabled>
                Apply
              </button>
            </div>

            <!-- Inline feedback -->
            <div class="rfp-switcher__feedback" id="rfp-feedback"></div>

          </div>
        </div>
        <!-- ── end RFP Profile Switcher ──────────────────────────────────── -->

        <span class="read-more-link" data-modal-target="modal-procurement">Learn more</span>
        <a href="https://rfp.andersenlab.com.pl/" target="_blank" rel="noopener" class="open-demo-btn">Open Demo <i class="fa-solid fa-arrow-right"></i></a>
```

### 1c — Update the modal button URL

In `<div class="modal-overlay" id="modal-procurement">`, update the Open Demo link:

```html
<!-- BEFORE (already updated) -->
<a href="https://rfp.andersenlab.com.pl/" target="_blank" rel="noopener" class="open-demo-btn">

<!-- AFTER -->
<a href="https://rfp.andersenlab.com.pl/" target="_blank" rel="noopener" class="open-demo-btn">
```

---

## 2 — Add to `css/style.css`

Append these rules at the **end** of `style.css`. They follow the existing naming conventions and use the site's existing CSS variables (`--yellow`, `--navy`, `--tag-bg`):

```css
/* ==========================================================================
   RFP Profile Switcher — inline brand switcher on the procurement card
   ========================================================================== */

.rfp-switcher {
  margin-bottom: 16px;
  border: 1px solid #D7DBE2;
  border-radius: 10px;
  overflow: hidden;
  background: #FAFBFC;
}

/* ── Status row (always visible) ── */
.rfp-switcher__status {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  cursor: default;
}

.rfp-switcher__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #94a3b8;
  flex-shrink: 0;
  transition: background 0.2s;
}
.rfp-switcher__dot.active   { background: #22c55e; }
.rfp-switcher__dot.andersen { background: #FFC400; }
.rfp-switcher__dot.cpc      { background: #BA9765; }

.rfp-switcher__status-label {
  font-size: 12px;
  color: #6B7688;
  white-space: nowrap;
}

.rfp-switcher__status-value {
  font-size: 12px;
  font-weight: 700;
  color: #101A2C;
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.rfp-switcher__toggle-btn {
  margin-left: auto;
  background: none;
  border: 1px solid #D7DBE2;
  border-radius: 6px;
  padding: 5px 10px;
  font-size: 12px;
  font-weight: 600;
  color: var(--navy);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 5px;
  white-space: nowrap;
  transition: border-color 0.15s, background 0.15s;
  font-family: inherit;
}
.rfp-switcher__toggle-btn:hover { border-color: var(--navy); background: #f0f4ff; }

.rfp-switcher__chevron {
  font-size: 10px;
  transition: transform 0.2s;
}
.rfp-switcher__chevron.open { transform: rotate(180deg); }

/* ── Expandable panel ── */
.rfp-switcher__panel {
  display: none;
  padding: 12px 14px 14px;
  border-top: 1px solid #E9EBF0;
  background: #fff;
}
.rfp-switcher__panel.open { display: block; }

/* ── Profile chips ── */
.rfp-switcher__chips {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.rfp-switcher__chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1.5px solid #D7DBE2;
  background: #fff;
  border-radius: 999px;
  padding: 6px 14px;
  font-size: 12.5px;
  font-weight: 600;
  color: #2B3446;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
  font-family: inherit;
}
.rfp-switcher__chip:hover { border-color: #9ca3af; }

.rfp-switcher__chip.selected-andersen {
  border-color: #FFC400;
  background: #FFFBEC;
  color: var(--navy);
}
.rfp-switcher__chip.selected-cpc {
  border-color: #BA9765;
  background: #F9F4EC;
  color: #1B1712;
}
.rfp-switcher__chip.is-active::after {
  content: '✓';
  font-size: 11px;
  opacity: 0.7;
}

.rfp-switcher__chip-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.rfp-switcher__chip-dot--andersen { background: #FFC400; }
.rfp-switcher__chip-dot--cpc      { background: #BA9765; }

/* ── PIN row ── */
.rfp-switcher__pin-row {
  display: flex;
  gap: 8px;
}

.rfp-switcher__pin-input {
  flex: 1;
  height: 38px;
  border: 1.5px solid #D7DBE2;
  border-radius: 8px;
  padding: 0 12px;
  font-size: 14px;
  font-family: inherit;
  letter-spacing: 0.1em;
  outline: none;
  transition: border-color 0.15s;
  background: #FAFBFC;
}
.rfp-switcher__pin-input:focus { border-color: var(--navy); }
.rfp-switcher__pin-input.error { border-color: #ef4444; }

.rfp-switcher__apply-btn {
  height: 38px;
  padding: 0 16px;
  background: var(--navy);
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 700;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.15s, opacity 0.15s;
  white-space: nowrap;
}
.rfp-switcher__apply-btn:hover:not(:disabled) { background: #0D1B2E; }
.rfp-switcher__apply-btn:disabled { opacity: 0.4; cursor: not-allowed; }

/* ── Inline feedback ── */
.rfp-switcher__feedback {
  margin-top: 8px;
  font-size: 12px;
  font-weight: 600;
  min-height: 16px;
}
.rfp-switcher__feedback.success { color: #16a34a; }
.rfp-switcher__feedback.error   { color: #dc2626; }
```

---

## 3 — Add to `js/main.js`

Append this **entire block** at the very end of `main.js`, outside and after the existing `document.addEventListener('DOMContentLoaded', ...)` closure:

```js
// ==========================================================================
// RFP Profile Switcher
// Inline Andersen ↔ CPC brand switcher on the procurement demo card.
// API base: https://rfp.andersenlab.com.pl
// ==========================================================================

(function () {
  var API = 'https://rfp.andersenlab.com.pl';

  var selectedProfile = null;
  var activeProfile   = null;

  var statusDot   = document.getElementById('rfp-status-dot');
  var statusValue = document.getElementById('rfp-status-value');
  var toggleBtn   = document.getElementById('rfp-toggle-btn');
  var chevron     = document.getElementById('rfp-chevron');
  var panel       = document.getElementById('rfp-panel');
  var pinInput    = document.getElementById('rfp-pin');
  var applyBtn    = document.getElementById('rfp-apply-btn');
  var feedback    = document.getElementById('rfp-feedback');
  var chipAndersen = document.getElementById('rfp-chip-andersen');
  var chipCpc      = document.getElementById('rfp-chip-cpc');

  if (!statusDot) return; // guard — switcher not in DOM

  // ── Fetch active profile ──────────────────────────────────────────────────
  function fetchStatus() {
    fetch(API + '/api/demo/status')
      .then(function (r) { return r.json(); })
      .then(function (d) { applyActiveProfile(d.activeProfile); })
      .catch(function ()  { statusValue.textContent = 'Unavailable'; });
  }

  function applyActiveProfile(id) {
    activeProfile = id;

    // Dot colour
    statusDot.className = 'rfp-switcher__dot ' + id;

    // Label
    statusValue.textContent = id === 'andersen' ? 'Andersen' : "Crown Prince's Court";

    // Mark active chip
    [chipAndersen, chipCpc].forEach(function (chip) {
      chip.classList.toggle('is-active', chip.dataset.profile === id);
    });

    updateApplyBtn();
  }

  // ── Toggle panel open / closed ────────────────────────────────────────────
  toggleBtn.addEventListener('click', function () {
    var isOpen = panel.classList.toggle('open');
    chevron.classList.toggle('open', isOpen);
    toggleBtn.setAttribute('aria-expanded', isOpen);
    if (isOpen && !activeProfile) fetchStatus();
  });

  // ── Profile chip selection ────────────────────────────────────────────────
  [chipAndersen, chipCpc].forEach(function (chip) {
    chip.addEventListener('click', function () {
      selectedProfile = chip.dataset.profile;

      chipAndersen.classList.remove('selected-andersen', 'selected-cpc');
      chipCpc.classList.remove('selected-andersen', 'selected-cpc');

      chip.classList.add('selected-' + selectedProfile);

      clearFeedback();
      updateApplyBtn();
    });
  });

  function updateApplyBtn() {
    if (!selectedProfile || selectedProfile === activeProfile) {
      applyBtn.disabled = true;
    } else {
      applyBtn.disabled = (pinInput.value.trim() === '');
    }
  }

  pinInput.addEventListener('input', function () {
    pinInput.classList.remove('error');
    clearFeedback();
    updateApplyBtn();
  });

  pinInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !applyBtn.disabled) applyBtn.click();
  });

  // ── Apply switch ──────────────────────────────────────────────────────────
  applyBtn.addEventListener('click', function () {
    var pin = pinInput.value.trim();
    if (!pin) {
      showFeedback('Enter the demo PIN first.', 'error');
      pinInput.classList.add('error');
      pinInput.focus();
      return;
    }
    if (!selectedProfile) {
      showFeedback('Select a profile first.', 'error');
      return;
    }

    applyBtn.disabled = true;
    applyBtn.textContent = '…';
    clearFeedback();

    fetch(API + '/api/admin/set-profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: pin, profileId: selectedProfile })
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
      .then(function (res) {
        if (res.ok && res.data.ok) {
          applyActiveProfile(res.data.activeProfile);
          showFeedback(
            '✓ Switched to ' + (res.data.activeProfile === 'andersen' ? 'Andersen' : "Crown Prince's Court"),
            'success'
          );
          pinInput.value = '';
          selectedProfile = null;
          chipAndersen.classList.remove('selected-andersen', 'selected-cpc');
          chipCpc.classList.remove('selected-andersen', 'selected-cpc');
        } else {
          showFeedback(res.data.error || 'Switch failed.', 'error');
          if (res.data.error === 'Invalid PIN') {
            pinInput.classList.add('error');
            pinInput.select();
          }
        }
      })
      .catch(function () { showFeedback('Network error — try again.', 'error'); })
      .finally(function () {
        applyBtn.disabled = false;
        applyBtn.textContent = 'Apply';
        updateApplyBtn();
      });
  });

  // ── Feedback helpers ──────────────────────────────────────────────────────
  var feedbackTimer = null;
  function showFeedback(msg, type) {
    feedback.textContent = msg;
    feedback.className = 'rfp-switcher__feedback ' + type;
    clearTimeout(feedbackTimer);
    if (type === 'success') {
      feedbackTimer = setTimeout(clearFeedback, 3000);
    }
  }
  function clearFeedback() {
    feedback.textContent = '';
    feedback.className = 'rfp-switcher__feedback';
  }

  // ── Load status on page load (silently, no panel open needed) ─────────────
  fetchStatus();

})();
```

---

## 4 — Summary of all changes

| File | Change |
|---|---|
| `index.html` | Insert `.rfp-switcher` HTML block inside the RFP card body, between `<p class="card-desc">` and `<span class="read-more-link">` |
| `index.html` | Update both Open Demo links to `https://rfp.andersenlab.com.pl/` (card button + modal button) |
| `css/style.css` | Append all `.rfp-switcher` CSS rules at the end of the file |
| `js/main.js` | Append the self-contained switcher IIFE at the end of the file |

**No other files need to change.** The switcher is fully self-contained and does not modify any existing JS logic.

---

## 5 — Presenter usage flow

1. Open `demo.andersenlab.com`
2. On the RFP card, the active profile badge loads automatically (e.g. **● Andersen**)
3. Click **Switch** to expand the panel
4. Click the **Crown Prince's Court** chip → enter the Demo PIN → click **Apply**
5. Badge updates to **● Crown Prince's Court**, success message appears
6. Click **Open Demo** — the app opens with CPC gold branding, Arabic support, and government-themed content
7. Switch back to Andersen the same way before the next demo
