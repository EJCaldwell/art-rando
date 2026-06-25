// ─────────────────────────────────────────────────────────────────────────────
// editor.js — cookie-backed data layer + Edit Lists modal UI.
//
// Exports (as globals, loaded before app.js):
//   getCookie(name)     → decoded cookie value or null
//   setCookie(name, value, days) → writes a cookie; days < 0 expires it
//   loadData()          → returns the active data object (cookie or ART_DATA)
//   saveData(data)      → writes the data object to the cookie
//   openEditor(onDone)  → opens the modal; calls onDone() when it closes
//
// Data shape expected by the rest of the app:
//   data._forms            — flat string[] of artistic forms (wheel 3)
//   data[category].media   — string[] of mediums for that category
//   data[category].subjects— string[] of subjects for that category
// ─────────────────────────────────────────────────────────────────────────────

// ── Cookie helpers ────────────────────────────────────────────────────────────

// Returns the decoded value of a named cookie, or null if absent.
function getCookie(name) {
  const m = document.cookie.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : null;
}

// Writes a cookie. Pass days < 0 to expire (delete) it immediately.
function setCookie(name, value, days) {
  const d = new Date();
  d.setTime(d.getTime() + days * 24 * 60 * 60 * 1000);
  document.cookie = name + '=' + encodeURIComponent(value) +
    ';expires=' + d.toUTCString() + ';path=/;SameSite=Lax';
}

// ── One-time cache clear ──────────────────────────────────────────────────────
// Runs on every page load but only acts once. Version marker is stored in
// localStorage (not a cookie) so it can never be wiped by this same function.
// Bumping the version string here will trigger another one-time clear.
(function clearStaleCookies() {
  if (localStorage.getItem('art_rando_v') === '1') return;
  setCookie('art_rando_prefs',     '', -1);
  setCookie('art_rando_last_spin', '', -1);
  localStorage.setItem('art_rando_v', '1');
}());

// ── Public data API ───────────────────────────────────────────────────────────

// Returns the active data object. Reads from the cookie first; falls back
// to a deep copy of the hard-coded ART_DATA defaults on first visit or if
// the cookie JSON is corrupt.
function loadData() {
  const raw = getCookie('art_rando_prefs');
  if (raw) {
    try { return JSON.parse(raw); } catch (e) {}
  }
  // Deep copy so mutations never affect the original ART_DATA constant.
  return JSON.parse(JSON.stringify(ART_DATA));
}

// Serialises the data object and writes it to a 365-day cookie.
function saveData(data) {
  setCookie('art_rando_prefs', JSON.stringify(data), 365);
}

// ── Editor modal ──────────────────────────────────────────────────────────────

// Opens the Edit Lists modal. `onDone` is called when the modal closes so
// app.js can reinitialise the wheels with the (possibly updated) data.
function openEditor(onDone) {
  // Work on a live reference so every add/remove immediately affects the same
  // object that gets serialised by saveData().
  const data = loadData();

  // ── Build modal shell ───────────────────────────────────────────────────
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const card = document.createElement('div');
  card.className = 'modal-card';

  // Header: title + ✕ close button
  const header = document.createElement('div');
  header.className = 'modal-header';
  const title  = document.createElement('h2');
  title.textContent = 'Edit Lists';
  const closeX = document.createElement('button');
  closeX.className = 'modal-close-btn';
  closeX.innerHTML = '&times;';
  closeX.addEventListener('click', close);
  header.appendChild(title);
  header.appendChild(closeX);

  // Scrollable body — rebuilt by renderAll() after every change.
  const body = document.createElement('div');
  body.className = 'modal-body';

  // Footer: "Reset to Defaults" (left) + "Done" (right)
  const footer = document.createElement('div');
  footer.className = 'modal-footer';

  const resetBtn = document.createElement('button');
  resetBtn.className   = 'btn btn--reset-defaults';
  resetBtn.textContent = 'Reset to Defaults';
  resetBtn.addEventListener('click', () => {
    if (!confirm('Reset all lists back to the original defaults? Your changes will be lost.')) return;
    // Expire the cookie immediately.
    setCookie('art_rando_prefs', '', -1);
    // Swap the in-memory data with a fresh copy of ART_DATA so the modal
    // re-renders without a page reload.
    const fresh = JSON.parse(JSON.stringify(ART_DATA));
    Object.keys(data).forEach(k => delete data[k]);
    Object.assign(data, fresh);
    renderAll();
  });

  const doneBtn = document.createElement('button');
  doneBtn.className = 'btn btn--spin';
  doneBtn.style.cssText = 'font-size:1rem;padding:0.65rem 2.5rem;';
  doneBtn.textContent = 'Done';
  doneBtn.addEventListener('click', close);

  footer.appendChild(resetBtn);
  footer.appendChild(doneBtn);

  // ── Render functions ────────────────────────────────────────────────────

  // Rebuilds the entire modal body from the current data object.
  // Called after every add/remove action — simple and correct at the cost
  // of losing keyboard focus on re-render (acceptable for a settings panel).
  function renderAll() {
    body.innerHTML = '';

    // ── Special "Forms" section at the top ──────────────────────────────
    // _forms is a flat string array, not a category object, so it gets
    // its own dedicated section instead of going through buildCategory().
    body.appendChild(buildFormsSection());

    // ── One section per category (skip special non-category keys) ──────
    Object.keys(data).forEach(cat => {
      if (cat === '_forms' || cat === '_prefs') return;
      body.appendChild(buildCategory(cat));
    });

    // ── Add-category row ─────────────────────────────────────────────────
    const addCatRow = document.createElement('div');
    addCatRow.className = 'editor-add-cat-row';

    const newCatInput = document.createElement('input');
    newCatInput.type        = 'text';
    newCatInput.className   = 'editor-input';
    newCatInput.placeholder = 'New category name…';

    const addCatBtn = document.createElement('button');
    addCatBtn.className   = 'btn btn--chip-add btn--add-cat';
    addCatBtn.textContent = '+ Add Category';

    const doAddCat = () => {
      const name = newCatInput.value.trim();
      // Skip empty names or names that already exist (including _forms).
      if (!name || Object.prototype.hasOwnProperty.call(data, name)) return;
      data[name] = { media: [], subjects: [] };
      saveData(data);
      newCatInput.value = '';
      renderAll();
    };

    addCatBtn.addEventListener('click', doAddCat);
    newCatInput.addEventListener('keydown', e => { if (e.key === 'Enter') doAddCat(); });

    addCatRow.appendChild(newCatInput);
    addCatRow.appendChild(addCatBtn);
    body.appendChild(addCatRow);
  }

  // ── Forms section ───────────────────────────────────────────────────────
  // Renders the global _forms list with add/remove chips.
  // Unlike categories, _forms is a plain array rather than {media, subjects}.
  function buildFormsSection() {
    const section = document.createElement('div');
    // Extra CSS class so the heading can be coloured differently.
    section.className = 'editor-cat-section editor-cat-section--forms';

    const head = document.createElement('div');
    head.className = 'editor-cat-head';
    const nameEl = document.createElement('span');
    nameEl.className   = 'editor-cat-name';
    nameEl.textContent = 'Forms';
    head.appendChild(nameEl);
    section.appendChild(head);

    // Chip row + inline add form for the _forms array.
    section.appendChild(buildFormsRow());
    return section;
  }

  // Builds a chip row for the flat _forms array (no label prefix needed).
  function buildFormsRow() {
    const row = document.createElement('div');
    row.className = 'editor-list-row';

    const chips = document.createElement('div');
    chips.className = 'editor-chips';

    (data._forms || []).forEach(item => {
      const chip = document.createElement('span');
      chip.className = 'editor-chip';
      const txt = document.createElement('span');
      txt.textContent = item;
      const x = document.createElement('button');
      x.className = 'editor-chip-x';
      x.innerHTML = '&times;';
      x.addEventListener('click', () => {
        data._forms = (data._forms || []).filter(i => i !== item);
        saveData(data);
        renderAll();
      });
      chip.appendChild(txt);
      chip.appendChild(x);
      chips.appendChild(chip);
    });

    // Inline add form
    const addForm = document.createElement('span');
    addForm.className = 'editor-inline-add';
    const inp = document.createElement('input');
    inp.type        = 'text';
    inp.className   = 'editor-input editor-input--sm';
    inp.placeholder = 'Add…';
    const addBtn      = document.createElement('button');
    addBtn.className  = 'btn btn--chip-add';
    addBtn.textContent = '+';
    const doAdd = () => {
      const val = inp.value.trim();
      if (!val || (data._forms || []).includes(val)) return;
      if (!data._forms) data._forms = [];
      data._forms.push(val);
      saveData(data);
      renderAll();
    };
    addBtn.addEventListener('click', doAdd);
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') doAdd(); });
    addForm.appendChild(inp);
    addForm.appendChild(addBtn);
    chips.appendChild(addForm);
    row.appendChild(chips);
    return row;
  }

  // ── Category section ─────────────────────────────────────────────────────
  // Builds a section for one category: header + Media row + Subjects row.
  function buildCategory(cat) {
    const section = document.createElement('div');
    section.className = 'editor-cat-section';

    const head      = document.createElement('div');
    head.className  = 'editor-cat-head';
    const nameEl    = document.createElement('span');
    nameEl.className   = 'editor-cat-name';
    nameEl.textContent = cat;
    const removeBtn = document.createElement('button');
    removeBtn.className   = 'editor-remove-cat';
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', () => {
      delete data[cat];
      saveData(data);
      renderAll();
    });

    head.appendChild(nameEl);
    head.appendChild(removeBtn);
    section.appendChild(head);
    section.appendChild(buildListRow(cat, 'media',    'Media'));
    section.appendChild(buildListRow(cat, 'subjects', 'Subjects'));
    return section;
  }

  // Builds a labelled chip row for one list inside a category (media or subjects).
  function buildListRow(cat, key, label) {
    const row = document.createElement('div');
    row.className = 'editor-list-row';

    const rowLabel = document.createElement('span');
    rowLabel.className   = 'editor-row-label';
    rowLabel.textContent = label + ':';
    row.appendChild(rowLabel);

    const chips = document.createElement('div');
    chips.className = 'editor-chips';

    // One chip per existing item, each with a remove button.
    (data[cat][key] || []).forEach(item => {
      const chip = document.createElement('span');
      chip.className = 'editor-chip';
      const txt = document.createElement('span');
      txt.textContent = item;
      const x = document.createElement('button');
      x.className = 'editor-chip-x';
      x.innerHTML = '&times;';
      x.addEventListener('click', () => {
        data[cat][key] = (data[cat][key] || []).filter(i => i !== item);
        saveData(data);
        renderAll();
      });
      chip.appendChild(txt);
      chip.appendChild(x);
      chips.appendChild(chip);
    });

    // Inline add form appended after the existing chips.
    const addForm = document.createElement('span');
    addForm.className = 'editor-inline-add';
    const inp = document.createElement('input');
    inp.type        = 'text';
    inp.className   = 'editor-input editor-input--sm';
    inp.placeholder = 'Add…';
    const addBtn      = document.createElement('button');
    addBtn.className  = 'btn btn--chip-add';
    addBtn.textContent = '+';
    const doAdd = () => {
      const val = inp.value.trim();
      if (!val || (data[cat][key] || []).includes(val)) return;
      if (!data[cat][key]) data[cat][key] = [];
      data[cat][key].push(val);
      saveData(data);
      renderAll();
    };
    addBtn.addEventListener('click', doAdd);
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') doAdd(); });
    addForm.appendChild(inp);
    addForm.appendChild(addBtn);
    chips.appendChild(addForm);
    row.appendChild(chips);
    return row;
  }

  // ── Close ────────────────────────────────────────────────────────────────
  // Fades the overlay out, removes it from the DOM, then calls onDone so
  // app.js can reinitialise the wheels with the (possibly updated) data.
  function close() {
    overlay.classList.remove('modal--visible');
    setTimeout(() => {
      if (document.body.contains(overlay)) document.body.removeChild(overlay);
      if (onDone) onDone();
    }, 300); // matches the CSS transition duration
  }

  // Clicking the dark backdrop (outside the card) also closes.
  overlay.addEventListener('mousedown', e => { if (e.target === overlay) close(); });

  // ── Assemble and show ───────────────────────────────────────────────────
  card.appendChild(header);
  card.appendChild(body);
  card.appendChild(footer);
  overlay.appendChild(card);
  document.body.appendChild(overlay);

  renderAll();

  // Two rAF calls ensure the element is painted before the CSS transition
  // fires; without this the fade-in is skipped on first render.
  requestAnimationFrame(() => requestAnimationFrame(() => overlay.classList.add('modal--visible')));
}
