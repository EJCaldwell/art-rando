// ─────────────────────────────────────────────────────────────────────────────
// app.js — 4-step state machine for the sequential single-wheel experience.
//
// Spin order:
//   1. Category — broad art discipline (Drawing, Painting, etc.)
//   2. Medium   — material for the chosen category (Pencil, Oil, etc.)
//   3. Form     — optional artistic approach (Sketch, Study, etc.)
//                 The user can skip this wheel entirely via the Skip button.
//   4. Subject  — topic to depict (Portrait, Landscape, etc.)
//
// Only one wheel is visible at a time.  After each spin the wheel fades out,
// the next set of items loads, and the wheel fades back in.
//
// After the final spin a results sheet slides up from the bottom showing the
// full creative prompt. The form phrase is omitted if the user skipped it.
// ─────────────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {

  // ── DOM refs ──────────────────────────────────────────────────────────────
  const theCanvas      = document.getElementById('the-wheel');
  const spinBtn        = document.getElementById('spin-btn');
  const skipBtn        = document.getElementById('skip-btn');
  const settingsBtn    = document.getElementById('settings-btn');
  const helpBtn        = document.getElementById('help-btn');
  const galleryBtn     = document.getElementById('gallery-btn');
  const wheelQuestion  = document.getElementById('wheel-question');
  const wheelResultLbl = document.getElementById('wheel-result');
  const chosenRow      = document.getElementById('chosen-row');

  const resultsSheet   = document.getElementById('results-sheet');
  const sheetBackdrop  = document.getElementById('sheet-backdrop');
  const resCategory    = document.getElementById('res-category');
  const resMedium      = document.getElementById('res-medium');
  const resForm        = document.getElementById('res-form');
  const resFormPhrase  = document.getElementById('res-form-phrase'); // the whole "as a [form]" span
  const resSubject     = document.getElementById('res-subject');
  const closeSheetBtn  = document.getElementById('close-sheet-btn');
  const respinBtn      = document.getElementById('respin-btn');

  // One DOM element per step pill in the progress indicator.
  const stepEls = {
    category: document.getElementById('step-category'),
    medium:   document.getElementById('step-medium'),
    form:     document.getElementById('step-form'),
    subject:  document.getElementById('step-subject'),
  };

  // ── Step definitions ──────────────────────────────────────────────────────
  // Four steps in order. The 'optional' flag marks steps the user can skip —
  // currently only 'form'. When a step is skipped its state value stays null
  // and its chip is not added.
  const STEPS = [
    { key: 'category', question: 'What category?',            chipClass: 'chosen-chip--category', optional: false },
    { key: 'medium',   question: 'What medium?',              chipClass: 'chosen-chip--medium',   optional: false },
    { key: 'form',     question: 'What form? (or skip it)',   chipClass: 'chosen-chip--form',     optional: true  },
    { key: 'subject',  question: 'What subject?',             chipClass: 'chosen-chip--subject',  optional: false },
  ];

  // ── App-wide variables ────────────────────────────────────────────────────
  let currentData; // full data object from cookie / ART_DATA default
  let categories;  // Object.keys(currentData) minus the special _forms key
  let forms;       // currentData._forms — the global Forms list
  let theWheel;      // single Wheel instance reused across all four steps
  let state;         // { phase, stepIndex, category, medium, form, subject }
  let activeSteps;   // subset of STEPS computed from prefs (form may be excluded)

  // ── initApp ───────────────────────────────────────────────────────────────
  // Full reset: reload data, rebuild the wheel, clear all UI state.
  // Called on page load and after the editor modal closes.
  function initApp() {
    currentData = loadData(); // from editor.js — reads cookie or falls back to ART_DATA
    // Filter out special non-category keys when listing selectable categories.
    categories = Object.keys(currentData).filter(k => k !== '_forms' && k !== '_prefs');
    forms      = currentData._forms || [];

    // Apply saved preferences: animation speed, rotation count, and which wheels
    // to include. Defaults match wheel.js initial values for a clean first visit.
    const prefs = currentData._prefs || {};
    SPIN_DURATION   = prefs.spinDuration   || 4000;
    SPIN_MIN_CYCLES = prefs.spinMinCycles  || 2;
    const showForm  = prefs.showFormWheel === true; // default off

    // Exclude the Form step entirely when the pref is off.
    activeSteps = STEPS.filter(s => s.key !== 'form' || showForm);

    // Show or hide the form pill in the progress indicator.
    stepEls.form.classList.toggle('hidden', !showForm);

    state = {
      phase:     'idle',
      stepIndex: 0,
      category:  null,
      medium:    null,
      form:      null, // null means the user skipped the form wheel
      subject:   null,
    };

    // Load the first step (Category) into the wheel.
    theWheel = new Wheel(theCanvas, categories);

    // Reset progress pills — first step is active, rest are idle.
    updateStepIndicator(0);

    // Reset labels.
    wheelQuestion.textContent  = activeSteps[0].question;
    wheelResultLbl.textContent = '—';

    // Clear chips from the previous run.
    chosenRow.innerHTML = '';

    // Reset canvas visual state.
    theCanvas.classList.remove('wheel--fading', 'wheel--active', 'wheel--done');

    // The skip button is only shown on optional steps.
    skipBtn.classList.add('hidden');

    // Hide the results sheet without animation on reset.
    hideSheet(false);

    spinBtn.disabled    = false;
    settingsBtn.disabled = false;
  }

  // ── Step indicator helpers ────────────────────────────────────────────────

  // Updates the step pills: steps before activeIndex get --done,
  // the active step gets --active, steps after are unstyled.
  // Uses activeSteps so hidden steps (e.g. form when disabled) are skipped.
  function updateStepIndicator(activeIndex) {
    activeSteps.forEach(({ key }, i) => {
      const el = stepEls[key];
      el.classList.remove('step--active', 'step--done');
      if      (i < activeIndex)  el.classList.add('step--done');
      else if (i === activeIndex) el.classList.add('step--active');
    });
  }

  // Appends a small coloured chip above the wheel summarising a chosen value.
  function addChosenChip(chipClass, value) {
    const chip = document.createElement('span');
    chip.className   = `chosen-chip ${chipClass}`;
    chip.textContent = value;
    chosenRow.appendChild(chip);
  }

  // ── Wheel transition ──────────────────────────────────────────────────────
  // Fades the canvas out, swaps in the new items, then fades it back in.
  function transitionToStep(stepIndex) {
    theCanvas.classList.add('wheel--fading');

    setTimeout(() => {
      const { key, optional } = activeSteps[stepIndex];

      // Determine which item list to show for the incoming step.
      let items;
      switch (key) {
        case 'category': items = categories;                                  break;
        case 'medium':   items = currentData[state.category].media    || []; break;
        case 'form':     items = forms;                                       break;
        case 'subject':  items = currentData[state.category].subjects || []; break;
      }

      theWheel.setItems(items);

      // Update labels and pill state.
      wheelQuestion.textContent  = STEPS[stepIndex].question;
      wheelResultLbl.textContent = '—';
      theCanvas.classList.remove('wheel--done');
      updateStepIndicator(stepIndex);

      // Show the Skip button only for optional steps (the Form wheel).
      if (optional) {
        skipBtn.classList.remove('hidden');
      } else {
        skipBtn.classList.add('hidden');
      }

      state.phase    = 'idle';
      spinBtn.disabled = false;

      // Fade back in.
      theCanvas.classList.remove('wheel--fading');
    }, 320); // slightly longer than the 0.3s CSS transition
  }

  // ── Advance to the next step (or show results) ────────────────────────────
  // Shared logic used by both the spin callback and the skip button so both
  // paths go through the same post-step flow.
  function completeStep(stepIndex) {
    const nextStepIndex = stepIndex + 1;

    if (nextStepIndex < activeSteps.length) {
      // More wheels to go — transition after a brief pause so the user can
      // register the result (or the "skipped" state) before the next wheel loads.
      state.stepIndex = nextStepIndex;
      setTimeout(() => transitionToStep(nextStepIndex), 750);
    } else {
      // All steps done — show the results sheet.
      state.phase = 'done';
      setTimeout(showSheet, 750);
    }
  }

  // ── Results sheet ─────────────────────────────────────────────────────────

  // Populates the prompt and slides the sheet up into view.
  // The "as a [form]" phrase is hidden when state.form is null (skipped).
  function showSheet() {
    resCategory.textContent = state.category;
    resMedium.textContent   = state.medium;
    resSubject.textContent  = state.subject;

    if (state.form) {
      // Form was spun — show the phrase.
      resForm.textContent = state.form;
      resFormPhrase.classList.remove('hidden');
    } else {
      // Form was skipped — hide the whole "as a [form]" portion.
      resFormPhrase.classList.add('hidden');
    }

    resultsSheet.classList.add('sheet--visible');
    sheetBackdrop.classList.add('sheet--visible');
  }

  // Slides the sheet back down.
  // `animate` = false skips the CSS transition (used on hard reset).
  function hideSheet(animate) {
    if (!animate) {
      resultsSheet.style.transition  = 'none';
      sheetBackdrop.style.transition = 'none';
    }

    resultsSheet.classList.remove('sheet--visible');
    sheetBackdrop.classList.remove('sheet--visible');

    if (!animate) {
      // Re-enable the transition after the next paint.
      requestAnimationFrame(() => {
        resultsSheet.style.transition  = '';
        sheetBackdrop.style.transition = '';
      });
    }
  }

  // ── Spin button ───────────────────────────────────────────────────────────
  spinBtn.addEventListener('click', () => {
    if (state.phase !== 'idle') return;
    state.phase = 'spinning';
    spinBtn.disabled     = true;
    skipBtn.classList.add('hidden'); // hide skip while spinning
    settingsBtn.disabled = true;

    const currentStepIndex = state.stepIndex;
    const { key, chipClass } = activeSteps[currentStepIndex];

    theCanvas.classList.add('wheel--active');

    theWheel.spin(winnerIdx => {
      const value = theWheel.items[winnerIdx];

      // Store the result.
      state[key] = value;

      // Update the result label and wheel border colour.
      wheelResultLbl.textContent = value;
      theCanvas.classList.remove('wheel--active');
      theCanvas.classList.add('wheel--done');

      // Mark the step pill as done and add a chip.
      stepEls[key].classList.remove('step--active');
      stepEls[key].classList.add('step--done');
      addChosenChip(chipClass, value);

      completeStep(currentStepIndex);
    });
  });

  // ── Skip button ───────────────────────────────────────────────────────────
  // Only active on the Form step. Skips it without recording a value.
  skipBtn.addEventListener('click', () => {
    if (state.phase !== 'idle') return;

    const currentStepIndex = state.stepIndex;
    const { key, optional } = activeSteps[currentStepIndex];

    // Guard: only skippable steps should ever have this button visible,
    // but double-check so a mis-click on another step can't skip it.
    if (!optional) return;

    // Leave state[key] as null to signal "skipped".
    // Mark the pill as done (skipped counts as resolved).
    stepEls[key].classList.remove('step--active');
    stepEls[key].classList.add('step--done');

    // Hide the skip button immediately so it can't be double-clicked.
    skipBtn.classList.add('hidden');

    // Update the result label to communicate the skip to the user.
    wheelResultLbl.textContent = 'skipped';

    completeStep(currentStepIndex);
  });

  // ── Sheet buttons ─────────────────────────────────────────────────────────

  closeSheetBtn.addEventListener('click', () => hideSheet(true));
  sheetBackdrop.addEventListener('click', () => hideSheet(true));

  respinBtn.addEventListener('click', () => {
    hideSheet(true);
    setTimeout(initApp, 420);
  });

  // ── Settings button ───────────────────────────────────────────────────────
  // Opens the settings panel; on close, reinitialises the wheels so any
  // preference changes (form wheel toggle, speed, etc.) take effect.
  settingsBtn.addEventListener('click', () => {
    if (state.phase === 'spinning') return;
    openSettings(() => initApp());
  });

  // ── Help button ───────────────────────────────────────────────────────────
  helpBtn.addEventListener('click', () => {
    if (state.phase === 'spinning') return;
    openHelp(() => {});
  });

  // ── Gallery button ────────────────────────────────────────────────────────
  galleryBtn.addEventListener('click', () => openGallery());

  // ── Boot ──────────────────────────────────────────────────────────────────
  initApp();

  // Auto-open the help modal on first visit (seenHelp pref not yet set).
  // Runs after initApp() so the wheels are ready behind the modal.
  const bootPrefs = (loadData()._prefs) || {};
  if (!bootPrefs.seenHelp) {
    openHelp(() => {});
  }
});
