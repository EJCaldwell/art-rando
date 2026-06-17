// ─────────────────────────────────────────────────────────────────────────────
// settings.js — user-facing settings panel.
//
// Opens via the Settings button in the main UI.
// Controls preferences stored under the _prefs key of the data cookie:
//   showFormWheel  — include/exclude the Form wheel from the spin sequence
//   spinDuration   — spin animation length in milliseconds
//   spinMinCycles  — minimum full drum rotations per spin
//
// "Edit Wheel Lists" inside this modal opens the editor.js modal on top.
// All preference changes write immediately to the cookie so they survive
// across sessions without a separate Save step.
//
// Depends on:
//   editor.js — loadData(), saveData()
//   wheel.js  — SPIN_DURATION, SPIN_MIN_CYCLES (globals applied on save)
// ─────────────────────────────────────────────────────────────────────────────

// Opens the Settings modal. onDone() is called when the modal closes so
// app.js can reinitialise the wheels with any preference changes applied.
function openSettings(onDone) {

  // Read the current preferences from the cookie and fill in defaults for any
  // keys that may be absent (e.g. on first visit or from an older cookie).
  const initialData = loadData(); // from editor.js
  const prefs = Object.assign(
    { showCategoryWheel: true, showMediumWheel: true, showFormWheel: false, showSubjectWheel: true, spinDuration: 4000, spinMinCycles: 2 },
    initialData._prefs || {}
  );

  // Writes prefs without clobbering list data that editor.js may have changed
  // while this modal was open (both call loadData independently, so we always
  // re-read fresh list data before writing back).
  // Also pushes the new animation values to the wheel.js globals immediately
  // so the next spin reflects the change without a full page reload.
  function persistPrefs() {
    const fresh = loadData(); // re-read to get any editor.js list changes
    fresh._prefs = prefs;
    saveData(fresh); // from editor.js
    SPIN_DURATION   = prefs.spinDuration;  // live wheel.js globals
    SPIN_MIN_CYCLES = prefs.spinMinCycles;
  }

  // ── Modal shell ──────────────────────────────────────────────────────────────
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const card = document.createElement('div');
  card.className = 'modal-card';

  // Header: title + close button
  const header = document.createElement('div');
  header.className = 'modal-header';
  const title  = document.createElement('h2');
  title.textContent = 'Settings';
  const closeX = document.createElement('button');
  closeX.className = 'modal-close-btn';
  closeX.innerHTML = '&times;';
  closeX.addEventListener('click', close);
  header.appendChild(title);
  header.appendChild(closeX);

  // Scrollable body — contains all settings sections
  const body = document.createElement('div');
  body.className = 'modal-body';

  // Footer: single Done button (changes save on-the-fly, no explicit apply needed)
  const footer = document.createElement('div');
  footer.className = 'modal-footer';
  const doneBtn = document.createElement('button');
  doneBtn.className = 'btn btn--spin';
  doneBtn.style.cssText = 'font-size:1rem;padding:0.65rem 2.5rem;margin-left:auto;';
  doneBtn.textContent = 'Done';
  doneBtn.addEventListener('click', close);
  footer.appendChild(doneBtn);

  // Populate the three sections
  body.appendChild(buildSection('Wheel Options',  buildWheelOptions()));
  body.appendChild(buildSection('Spin Animation', buildSpinOptions()));
  body.appendChild(buildSection('Wheel Lists',    buildListsLink()));

  // Assemble and inject into the page
  card.appendChild(header);
  card.appendChild(body);
  card.appendChild(footer);
  overlay.appendChild(card);
  document.body.appendChild(overlay);

  // Clicking the dark backdrop closes the panel
  overlay.addEventListener('mousedown', e => { if (e.target === overlay) close(); });

  // Two rAF calls ensure the element is painted before the CSS transition fires,
  // otherwise the fade-in is skipped on first render.
  requestAnimationFrame(() => requestAnimationFrame(() => overlay.classList.add('modal--visible')));

  // ── Helper: section wrapper ────────────────────────────────────────────────────
  // Wraps a controls block with a small uppercase section label.
  function buildSection(label, content) {
    const section = document.createElement('div');
    section.className = 'settings-section';
    const heading = document.createElement('p');
    heading.className   = 'settings-section-label';
    heading.textContent = label;
    section.appendChild(heading);
    section.appendChild(content);
    return section;
  }

  // ── Wheel Options ──────────────────────────────────────────────────────────────
  // One toggle per wheel — controls which wheels appear in the spin sequence.
  function buildWheelOptions() {
    const wrap = document.createElement('div');
    wrap.className = 'settings-controls';

    const wheels = [
      { key: 'showCategoryWheel', label: 'Show Category wheel', desc: 'Picks the art discipline (Drawing, Painting, etc.). If off, a category is chosen randomly.' },
      { key: 'showMediumWheel',   label: 'Show Medium wheel',   desc: 'Picks the material or tool for the chosen category.' },
      { key: 'showFormWheel',     label: 'Show Form wheel',     desc: 'Optional wheel for artistic approach — Sketch, Study, Finished Piece, etc. You can still skip it each run.' },
      { key: 'showSubjectWheel',  label: 'Show Subject wheel',  desc: 'Picks what to depict (Portrait, Landscape, etc.).' },
    ];

    wheels.forEach(({ key, label, desc }) => {
      const row = document.createElement('label');
      row.className = 'settings-toggle-row';

      const checkbox = document.createElement('input');
      checkbox.type      = 'checkbox';
      checkbox.className = 'settings-checkbox';
      checkbox.checked   = prefs[key];
      checkbox.addEventListener('change', () => {
        prefs[key] = checkbox.checked;
        persistPrefs();
      });

      const textWrap = document.createElement('div');
      textWrap.className = 'settings-toggle-text';

      const labelSpan = document.createElement('span');
      labelSpan.className   = 'settings-toggle-label';
      labelSpan.textContent = label;

      const descSpan = document.createElement('span');
      descSpan.className   = 'settings-toggle-desc';
      descSpan.textContent = desc;

      textWrap.appendChild(labelSpan);
      textWrap.appendChild(descSpan);
      row.appendChild(checkbox);
      row.appendChild(textWrap);
      wrap.appendChild(row);
    });

    return wrap;
  }

  // ── Spin Animation ─────────────────────────────────────────────────────────────
  // Speed and minimum-rotations sliders.
  function buildSpinOptions() {
    const wrap = document.createElement('div');
    wrap.className = 'settings-controls';

    // Spin duration in milliseconds (500ms – 8 seconds)
    wrap.appendChild(buildSliderRow(
      'Speed',
      500, 8000, 100,
      prefs.spinDuration,
      v => v + ' ms',
      val => { prefs.spinDuration = val; persistPrefs(); }
    ));

    // Minimum number of full rotations before the drum stops
    wrap.appendChild(buildSliderRow(
      'Min rotations',
      1, 8, 1,
      prefs.spinMinCycles,
      v => v + (v === 1 ? ' spin' : ' spins'),
      val => { prefs.spinMinCycles = val; persistPrefs(); }
    ));

    return wrap;
  }

  // Builds one labelled range-slider row: [label]───[slider]───[value].
  function buildSliderRow(label, min, max, step, initial, formatFn, onChange) {
    const row = document.createElement('div');
    row.className = 'settings-slider-row';

    const labelEl = document.createElement('span');
    labelEl.className   = 'settings-slider-label';
    labelEl.textContent = label;

    const valueEl = document.createElement('span');
    valueEl.className   = 'settings-slider-value';
    valueEl.textContent = formatFn(initial);

    const slider = document.createElement('input');
    slider.type      = 'range';
    slider.min       = String(min);
    slider.max       = String(max);
    slider.step      = String(step);
    slider.value     = String(initial);
    slider.className = 'settings-slider';
    slider.addEventListener('input', () => {
      const val = parseInt(slider.value, 10);
      valueEl.textContent = formatFn(val);
      onChange(val);
    });

    row.appendChild(labelEl);
    row.appendChild(slider);
    row.appendChild(valueEl);
    return row;
  }

  // ── Wheel Lists ────────────────────────────────────────────────────────────────
  // Shortcut button that opens the editor.js modal on top of this one.
  function buildListsLink() {
    const wrap = document.createElement('div');
    wrap.className = 'settings-controls';

    const desc = document.createElement('p');
    desc.className   = 'settings-list-desc';
    desc.textContent = 'Add or remove items from each wheel, manage categories, and edit form options.';

    const editBtn = document.createElement('button');
    editBtn.className   = 'btn btn--edit';
    editBtn.textContent = 'Edit Wheel Lists';
    // The editor opens as a new overlay on top of settings (later in DOM = higher
    // stacking order even at equal z-index). Settings stays open underneath.
    // When the editor's onDone fires (no-op here), settings is still showing.
    // The app reinits only after settings itself closes.
    editBtn.addEventListener('click', () => openEditor(() => {}));

    wrap.appendChild(desc);
    wrap.appendChild(editBtn);
    return wrap;
  }

  // ── Close ──────────────────────────────────────────────────────────────────────
  function close() {
    overlay.classList.remove('modal--visible');
    setTimeout(() => {
      if (document.body.contains(overlay)) document.body.removeChild(overlay);
      if (onDone) onDone();
    }, 300); // matches the CSS fade-out transition
  }
}
