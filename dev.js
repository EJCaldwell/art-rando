// ─────────────────────────────────────────────────────────────────────────────
// dev.js — secret developer options panel.
//
// Activated by typing the sequence  W W S S A D A D  anywhere on the page
// (keyboard focus must not be inside a text input).
//
// Exposes runtime controls that are too technical / destructive for the
// regular Edit Lists modal:
//   • Spin speed slider
//   • Instant-spin toggle (nearly-zero duration for fast testing)
//   • Clear saved preferences cookie
//   • Copy raw cookie data to clipboard
// ─────────────────────────────────────────────────────────────────────────────

(function () {

  // ── Konami-style sequence detection ────────────────────────────────────────
  const SECRET_SEQUENCE = ['w', 'w', 's', 's', 'a', 'd', 'a', 'd'];
  let keyBuffer = []; // rolling buffer of the last N keypresses

  document.addEventListener('keydown', (e) => {
    // Ignore keypresses while the user is typing in an input or textarea
    // so editing the Edit Lists modal doesn't accidentally fire the panel.
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    keyBuffer.push(e.key.toLowerCase());

    // Keep the buffer trimmed to the length of the secret sequence.
    if (keyBuffer.length > SECRET_SEQUENCE.length) {
      keyBuffer.shift();
    }

    // Check if the buffer now matches the sequence exactly.
    if (keyBuffer.join(',') === SECRET_SEQUENCE.join(',')) {
      keyBuffer = []; // reset so it can be triggered again
      openDevPanel();
    }
  });

  // ── Dev panel ───────────────────────────────────────────────────────────────

  function openDevPanel() {
    // Don't open a second panel if one is already showing.
    if (document.getElementById('dev-panel')) return;

    // ── Overlay ──────────────────────────────────────────────────────────────
    const overlay = document.createElement('div');
    overlay.id        = 'dev-overlay';
    overlay.className = 'dev-overlay';

    // ── Panel card ────────────────────────────────────────────────────────────
    const panel = document.createElement('div');
    panel.id        = 'dev-panel';
    panel.className = 'dev-panel';

    // ── Header ────────────────────────────────────────────────────────────────
    const header = document.createElement('div');
    header.className = 'dev-header';

    const titleWrap = document.createElement('div');
    titleWrap.className = 'dev-title-wrap';

    // Blinking cursor dot for the terminal aesthetic
    const dot = document.createElement('span');
    dot.className = 'dev-dot';

    const titleText = document.createElement('span');
    titleText.textContent = 'dev options';

    titleWrap.appendChild(dot);
    titleWrap.appendChild(titleText);

    const closeBtn = document.createElement('button');
    closeBtn.className   = 'dev-close';
    closeBtn.textContent = '[ close ]';
    closeBtn.addEventListener('click', close);

    header.appendChild(titleWrap);
    header.appendChild(closeBtn);

    // ── Body ──────────────────────────────────────────────────────────────────
    const body = document.createElement('div');
    body.className = 'dev-body';

    // ── Section: Spin speed ──────────────────────────────────────────────────
    body.appendChild(buildSection('spin speed', buildSpeedControls()));

    // ── Section: Data ────────────────────────────────────────────────────────
    body.appendChild(buildSection('data', buildDataControls()));

    // ── Footer hint ───────────────────────────────────────────────────────────
    const hint = document.createElement('p');
    hint.className   = 'dev-hint';
    hint.textContent = '// w w s s a d a d to reopen';

    panel.appendChild(header);
    panel.appendChild(body);
    panel.appendChild(hint);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    // Clicking the overlay backdrop closes the panel.
    overlay.addEventListener('mousedown', (e) => {
      if (e.target === overlay) close();
    });

    // Trigger the fade-in transition on the next frame.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      overlay.classList.add('dev--visible');
    }));

    // ── Build helpers ─────────────────────────────────────────────────────────

    // Wraps a block of controls in a labelled section.
    function buildSection(label, content) {
      const section = document.createElement('div');
      section.className = 'dev-section';
      const sectionLabel = document.createElement('p');
      sectionLabel.className   = 'dev-section-label';
      sectionLabel.textContent = '// ' + label;
      section.appendChild(sectionLabel);
      section.appendChild(content);
      return section;
    }

    // ── Spin speed controls ───────────────────────────────────────────────────
    function buildSpeedControls() {
      const wrap = document.createElement('div');
      wrap.className = 'dev-controls';

      // ── Duration slider ──────────────────────────────────────────────────
      const sliderRow = document.createElement('div');
      sliderRow.className = 'dev-row';

      const sliderLabel = document.createElement('label');
      sliderLabel.className   = 'dev-label';
      sliderLabel.textContent = 'duration';

      const sliderValue = document.createElement('span');
      sliderValue.className   = 'dev-value';
      sliderValue.textContent = SPIN_DURATION + ' ms';

      const slider = document.createElement('input');
      slider.type  = 'range';
      slider.min   = '200';
      slider.max   = '8000';
      slider.step  = '100';
      slider.value = String(SPIN_DURATION);
      slider.className = 'dev-slider';

      slider.addEventListener('input', () => {
        SPIN_DURATION = parseInt(slider.value, 10);
        sliderValue.textContent = SPIN_DURATION + ' ms';
        // Uncheck instant mode if the slider is moved manually.
        instantCheck.checked = false;
      });

      sliderRow.appendChild(sliderLabel);
      sliderRow.appendChild(slider);
      sliderRow.appendChild(sliderValue);

      // ── Instant-spin toggle ──────────────────────────────────────────────
      const instantRow = document.createElement('div');
      instantRow.className = 'dev-row';

      const instantLabel = document.createElement('label');
      instantLabel.className   = 'dev-label dev-label--checkbox';
      instantLabel.textContent = 'instant spin';

      const instantCheck = document.createElement('input');
      instantCheck.type      = 'checkbox';
      instantCheck.className = 'dev-checkbox';
      // Pre-tick if duration is already near-zero.
      instantCheck.checked = SPIN_DURATION < 200;

      instantCheck.addEventListener('change', () => {
        if (instantCheck.checked) {
          // Store the previous duration so we can restore it on uncheck.
          instantCheck.dataset.prev = slider.value;
          SPIN_DURATION            = 80;
          slider.value             = '200'; // slider min; 80 is below its range
          sliderValue.textContent  = '80 ms';
        } else {
          // Restore the previous value.
          const prev  = parseInt(instantCheck.dataset.prev || '4000', 10);
          SPIN_DURATION           = prev;
          slider.value            = String(prev);
          sliderValue.textContent = prev + ' ms';
        }
      });

      instantLabel.prepend(instantCheck);
      instantRow.appendChild(instantLabel);

      wrap.appendChild(sliderRow);
      wrap.appendChild(instantRow);
      return wrap;
    }

    // ── Data controls ─────────────────────────────────────────────────────────
    function buildDataControls() {
      const wrap = document.createElement('div');
      wrap.className = 'dev-controls';

      // ── Clear preferences ────────────────────────────────────────────────
      const clearBtn = document.createElement('button');
      clearBtn.className   = 'dev-btn';
      clearBtn.textContent = 'clear preferences cookie';
      clearBtn.addEventListener('click', () => {
        if (!confirm('Delete the saved preferences cookie? The page will reload with defaults.')) return;
        // Expire the cookie by setting a past date, then reload.
        document.cookie = 'art_rando_prefs=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;';
        location.reload();
      });

      // ── Copy raw cookie data ─────────────────────────────────────────────
      const copyBtn = document.createElement('button');
      copyBtn.className   = 'dev-btn';
      copyBtn.textContent = 'copy cookie json';
      copyBtn.addEventListener('click', () => {
        // Read the raw cookie string directly.
        const match = document.cookie.match(/(?:^|;\s*)art_rando_prefs=([^;]*)/);
        const json  = match ? decodeURIComponent(match[1]) : '(no cookie set)';
        navigator.clipboard.writeText(json).then(() => {
          copyBtn.textContent = 'copied';
          setTimeout(() => { copyBtn.textContent = 'copy cookie json'; }, 2000);
        }).catch(() => {
          // Clipboard API may be blocked — fall back to showing the data.
          prompt('Copy the JSON below:', json);
        });
      });

      wrap.appendChild(clearBtn);
      wrap.appendChild(copyBtn);
      return wrap;
    }

    // ── Close handler ─────────────────────────────────────────────────────────
    function close() {
      overlay.classList.remove('dev--visible');
      setTimeout(() => {
        if (document.body.contains(overlay)) document.body.removeChild(overlay);
      }, 250);
    }
  }

})();
