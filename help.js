// ─────────────────────────────────────────────────────────────────────────────
// help.js — welcome / how-to-use modal.
//
// openHelp(onDone) — shows the modal. onDone() fires when it closes.
// Call openHelp() on first visit (seenHelp pref absent) so new users know
// what art-rando does without needing to read docs.
//
// Depends on: editor.js (loadData, saveData) for the seenHelp pref flag.
// ─────────────────────────────────────────────────────────────────────────────

// Opens the How to Use modal and marks the user as having seen it so it
// doesn't auto-open again on future visits.
function openHelp(onDone) {

  // Mark as seen immediately so a page refresh during the modal won't re-show it.
  const data = loadData();
  if (!data._prefs) data._prefs = {};
  data._prefs.seenHelp = true;
  saveData(data);

  // ── Modal shell (reuses the same .modal-overlay / .modal-card pattern) ──────
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const card = document.createElement('div');
  card.className = 'modal-card';

  // Header
  const header = document.createElement('div');
  header.className = 'modal-header';
  const title = document.createElement('h2');
  title.textContent = 'How to Use art-rando';
  const closeX = document.createElement('button');
  closeX.className = 'modal-close-btn';
  closeX.innerHTML = '&times;';
  closeX.addEventListener('click', close);
  header.appendChild(title);
  header.appendChild(closeX);

  // Body
  const body = document.createElement('div');
  body.className = 'modal-body help-body';

  // Intro blurb
  const intro = document.createElement('p');
  intro.className = 'help-intro';
  intro.textContent = 'art-rando gives you a random creative challenge by spinning through a series of wheels. Each wheel builds on the last, so your final prompt feels intentional even though it\'s completely random.';
  body.appendChild(intro);

  // Step-by-step breakdown
  const steps = [
    {
      num: '1',
      color: 'var(--accent-blue)',
      label: 'Category',
      desc: 'The broad art discipline — Drawing, Painting, Digital Art, etc.'
    },
    {
      num: '2',
      color: 'var(--accent)',
      label: 'Medium',
      desc: 'The specific material or tool for your chosen category — Pencil, Watercolor, Pixel Art, etc.'
    },
    {
      num: '3',
      color: 'var(--accent-purple)',
      label: 'Form (optional)',
      desc: 'The artistic approach — Sketch, Study, Finished Piece, etc. Off by default; toggle it on in Settings.'
    },
    {
      num: '4',
      color: 'var(--accent-teal)',
      label: 'Subject',
      desc: 'What to make — Portrait, Landscape, Character Design, etc.'
    },
  ];

  const stepList = document.createElement('div');
  stepList.className = 'help-steps';

  steps.forEach(({ num, color, label, desc }) => {
    const row = document.createElement('div');
    row.className = 'help-step-row';

    // Coloured number badge
    const badge = document.createElement('span');
    badge.className = 'help-step-badge';
    badge.textContent = num;
    badge.style.background = color;

    const textWrap = document.createElement('div');
    const labelEl = document.createElement('span');
    labelEl.className = 'help-step-label';
    labelEl.textContent = label;

    const descEl = document.createElement('span');
    descEl.className = 'help-step-desc';
    descEl.textContent = desc;

    textWrap.appendChild(labelEl);
    textWrap.appendChild(descEl);
    row.appendChild(badge);
    row.appendChild(textWrap);
    stepList.appendChild(row);
  });

  body.appendChild(stepList);

  // Example result
  const exampleWrap = document.createElement('div');
  exampleWrap.className = 'help-example';

  const exampleLabel = document.createElement('p');
  exampleLabel.className = 'help-example-label';
  exampleLabel.textContent = 'Example result';

  const exampleText = document.createElement('p');
  exampleText.className = 'help-example-text';
  exampleText.innerHTML =
    'Make a <strong style="color:var(--accent-teal)">Portrait</strong> ' +
    'using <strong style="color:var(--accent)">Watercolor</strong> ' +
    '<span style="color:var(--text-muted);font-size:0.9rem">(Painting)</span>';

  exampleWrap.appendChild(exampleLabel);
  exampleWrap.appendChild(exampleText);
  body.appendChild(exampleWrap);

  // Settings tip
  const tip = document.createElement('p');
  tip.className = 'help-tip';
  tip.innerHTML = '<strong>Tip:</strong> Use the <strong>Settings</strong> button to adjust spin speed, enable the Form wheel, or customise what\'s on each wheel.';
  body.appendChild(tip);

  // Recommendation to personalise the wheel lists
  const rec = document.createElement('div');
  rec.className = 'help-rec';

  const recIcon = document.createElement('span');
  recIcon.className = 'help-rec-icon';
  recIcon.textContent = '';

  const recText = document.createElement('div');
  recText.className = 'help-rec-text';

  const recHeading = document.createElement('strong');
  recHeading.textContent = 'Before you start — make it yours';

  const recDesc = document.createElement('p');
  recDesc.textContent = 'The wheels come pre-loaded with defaults, but the best experience is a personalised one. Head into Settings → Edit Wheel Lists and go through each category: remove anything that doesn\'t fit your practice, add the tools and subjects you actually use, and delete whole categories you\'ll never spin. The wheels will feel a lot more relevant once they reflect you.';

  recText.appendChild(recHeading);
  recText.appendChild(recDesc);
  rec.appendChild(recIcon);
  rec.appendChild(recText);
  body.appendChild(rec);

  // School project disclaimer — shown at the very bottom of the body, above the
  // footer button, so it's visible but doesn't overshadow the actual content.
  const schoolNote = document.createElement('p');
  schoolNote.className = 'help-school-note';
  schoolNote.textContent = 'This was made as a school project — sorry if you run into any bugs! Feel free to report them using the Bug button in the corner. If you would like to support me please check out my Ko-fi at the bottom of the page :).';
  body.appendChild(schoolNote);

  // Footer with "Let's spin!" button
  const footer = document.createElement('div');
  footer.className = 'modal-footer';
  const spinBtn = document.createElement('button');
  spinBtn.className = 'btn btn--spin';
  spinBtn.style.cssText = 'font-size:1rem;padding:0.65rem 2.5rem;margin-left:auto;';
  spinBtn.textContent = "Let's spin!";
  spinBtn.addEventListener('click', close);
  footer.appendChild(spinBtn);

  card.appendChild(header);
  card.appendChild(body);
  card.appendChild(footer);
  overlay.appendChild(card);
  document.body.appendChild(overlay);

  // Backdrop click closes
  overlay.addEventListener('mousedown', e => { if (e.target === overlay) close(); });

  // Two rAF calls so the fade-in transition fires after paint
  requestAnimationFrame(() => requestAnimationFrame(() => overlay.classList.add('modal--visible')));

  // ── Close ───────────────────────────────────────────────────────────────────
  function close() {
    overlay.classList.remove('modal--visible');
    setTimeout(() => {
      if (document.body.contains(overlay)) document.body.removeChild(overlay);
      if (onDone) onDone();
    }, 300);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// openBugReport() — collects a bug description and saves it to the
// bug_reports table in Supabase so it shows up in the admin panel.
// Works for both signed-in and anonymous users.
// ─────────────────────────────────────────────────────────────────────────────

function openBugReport() {

  // ── Modal shell ──────────────────────────────────────────────────────────────
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const card = document.createElement('div');
  card.className = 'modal-card';

  // Header
  const header = document.createElement('div');
  header.className = 'modal-header';

  const title = document.createElement('h2');
  title.textContent = 'Report a Bug';

  const closeX = document.createElement('button');
  closeX.className = 'modal-close-btn';
  closeX.innerHTML = '&times;';
  closeX.addEventListener('click', close);

  header.appendChild(title);
  header.appendChild(closeX);

  // Body — a single textarea for the description
  const body = document.createElement('div');
  body.className = 'modal-body';
  body.style.gap = '0.85rem';

  const desc = document.createElement('p');
  desc.className   = 'help-intro';
  desc.textContent = 'Describe what went wrong and what you expected to happen. Your report goes straight to the developer.';

  const textarea = document.createElement('textarea');
  textarea.className   = 'bug-report-textarea';
  textarea.placeholder = 'e.g. The wheel didn\'t stop spinning after clicking Spin…';
  textarea.rows        = 5;

  // Status line — hidden until the submit attempt resolves
  const statusEl = document.createElement('p');
  statusEl.className = 'bug-report-confirm hidden';

  body.appendChild(desc);
  body.appendChild(textarea);
  body.appendChild(statusEl);

  // Footer — Cancel + Send Report buttons
  const footer = document.createElement('div');
  footer.className = 'modal-footer';

  const cancelBtn = document.createElement('button');
  cancelBtn.className   = 'btn btn--close-sheet';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', close);

  const sendBtn = document.createElement('button');
  sendBtn.className     = 'btn btn--spin';
  sendBtn.style.cssText = 'font-size:1rem;padding:0.65rem 2rem;';
  sendBtn.textContent   = 'Send Report';

  sendBtn.addEventListener('click', async () => {
    const report = textarea.value.trim();

    if (!report) {
      textarea.style.borderColor = 'var(--accent)';
      textarea.focus();
      return;
    }

    sendBtn.disabled    = true;
    sendBtn.textContent = 'Sending…';
    statusEl.classList.add('hidden');
    textarea.style.borderColor = '';

    // Attach user info if logged in; anonymous reports are also accepted.
    const session = getSession();
    const { error } = await _sb.from('bug_reports').insert({
      description: report,
      page_url:    window.location.href,
      user_id:     session?.userId || null,
      username:    session?.user   || null,
    });

    if (error) {
      // Show the error inline so the user can try again.
      statusEl.textContent = 'Could not send — please try again.';
      statusEl.style.color = 'var(--accent)';
      statusEl.classList.remove('hidden');
      sendBtn.disabled    = false;
      sendBtn.textContent = 'Send Report';
      return;
    }

    // Success — confirm and close after a brief pause.
    statusEl.textContent = 'Report sent — thanks!';
    statusEl.style.color = 'var(--accent-teal)';
    statusEl.classList.remove('hidden');
    sendBtn.textContent = 'Sent!';
    setTimeout(() => close(), 1600);
  });

  footer.appendChild(cancelBtn);
  footer.appendChild(sendBtn);

  // ── Assemble ─────────────────────────────────────────────────────────────────
  card.appendChild(header);
  card.appendChild(body);
  card.appendChild(footer);
  overlay.appendChild(card);
  document.body.appendChild(overlay);

  overlay.addEventListener('mousedown', e => { if (e.target === overlay) close(); });
  requestAnimationFrame(() => requestAnimationFrame(() => overlay.classList.add('modal--visible')));

  // Focus the textarea once the modal is visible so the user can start typing.
  setTimeout(() => textarea.focus(), 320);

  // ── Close ─────────────────────────────────────────────────────────────────────
  function close() {
    overlay.classList.remove('modal--visible');
    setTimeout(() => {
      if (document.body.contains(overlay)) document.body.removeChild(overlay);
    }, 300);
  }
}
