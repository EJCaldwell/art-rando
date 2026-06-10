// ─────────────────────────────────────────────────────────────────────────────
// easter-eggs.js — hidden cheat codes (type anywhere on the page):
//
//   "gravity"     — page elements fall to the floor; app still works
//   "antigravity" — elements float and can be dragged/thrown around
//   "spin"        — everything spins CW or CCW (randomly chosen)
//
// Typing the same code again deactivates the current mode.
// ─────────────────────────────────────────────────────────────────────────────

(function () {

  const LONGEST  = 'antigravity'.length;
  let buffer     = '';
  let activeMode = null;
  let rafId      = null;
  let items      = [];
  let dragTarget = null;
  let dragOffX = 0, dragOffY = 0;
  let lastMX = 0, lastMY = 0;
  let mouseVX = 0, mouseVY = 0;

  // ── Keypress detection ────────────────────────────────────────────────────
  document.addEventListener('keydown', e => {
    if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    buffer = (buffer + e.key.toLowerCase()).slice(-LONGEST);

    if      (buffer.endsWith('antigravity')) { activate('antigravity'); buffer = ''; }
    else if (buffer.endsWith('gravity'))     { activate('gravity');     buffer = ''; }
    else if (buffer.endsWith('spin'))        { activate('spin');        buffer = ''; }
  });

  // ── Activate / deactivate ─────────────────────────────────────────────────
  function activate(mode) {
    if (activeMode === mode) { deactivate(); return; }
    if (activeMode) deactivate(true);
    activeMode = mode;

    if (mode === 'spin') {

      // Apply to each element individually so each spins around its own center,
      // not around the container's center like adding to <main> would do.
      const stepsEl    = document.getElementById('steps');
      const wheelStage = document.querySelector('.wheel-stage');
      const actionsRow = document.querySelector('.actions-row');
      const footer     = document.querySelector('.creator-links');
      const cornerCtrl = document.querySelector('.corner-controls');

      const spinTargets = [
        ...stepsEl.querySelectorAll('.step:not(.hidden)'),
        wheelStage.querySelector('.wheel-question'),
        document.getElementById('the-wheel'),
        wheelStage.querySelector('.wheel-result-label'),
        ...actionsRow.querySelectorAll('.btn:not(.hidden)'),
        ...(footer ? footer.querySelectorAll('.creator-link, .creator-links-sep') : []),
        ...(cornerCtrl ? cornerCtrl.querySelectorAll('.btn--icon') : []),
      ].filter(Boolean);

      // Each element gets its own random direction and speed
      spinTargets.forEach(el => {
        el.dataset.easterSpin = Math.random() < 0.5 ? 'cw' : 'ccw';
        const r = Math.random();
        const dur = r < 0.001 ? 0.01 : r < 0.01 ? 0.1 : r < 0.05 ? 0.5 : (1 + Math.random() * 3);
        el.style.animationDuration = dur.toFixed(2) + 's';
        el.classList.add('easter-spinning');
      });
    } else {
      startPhysics(mode);
    }
  }

  function deactivate(silent) {
    cancelAnimationFrame(rafId);
    rafId = null;

    if (activeMode === 'spin') {
      document.querySelectorAll('.easter-spinning').forEach(el => {
        el.classList.remove('easter-spinning');
        el.style.animationDuration = '';
        delete el.dataset.easterSpin;
      });
    } else {
      stopPhysics();
    }

    activeMode = null;
  }

  // ── Toast ─────────────────────────────────────────────────────────────────
  function showToast(msg) {
    const old = document.querySelector('.easter-toast');
    if (old) old.remove();
    const el = document.createElement('div');
    el.className   = 'easter-toast';
    el.textContent = msg;
    document.body.appendChild(el);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('easter-toast--visible')));
    setTimeout(() => {
      el.classList.remove('easter-toast--visible');
      setTimeout(() => el.remove(), 400);
    }, 2400);
  }

  // ── Physics ───────────────────────────────────────────────────────────────

  function startPhysics(mode) {
    const hiddenParents = new Set();

    // Register one element as a physics body.
    // parentToHide is the container that should go invisible so it
    // doesn't ghost behind its floating child.
    function collect(el, parentToHide) {
      if (!el || el.classList.contains('hidden')) return;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return;

      if (parentToHide) hiddenParents.add(parentToHide);

      const mass  = 1 + (r.width * r.height) / 250000;
      const speed = mode === 'antigravity' ? 5 : 0;

      items.push({
        el,
        origX: r.left, origY: r.top,
        w: r.width,    h: r.height,
        mass,
        // Saved inline styles for restoration
        _pos: el.style.position, _left: el.style.left, _top: el.style.top,
        _w:   el.style.width,    _h:    el.style.height,
        _m:   el.style.margin,   _z:    el.style.zIndex,
        _pe:  el.style.pointerEvents,   _tr: el.style.transform,
        _vis: el.style.visibility,
        dx: 0, dy: 0,
        angle: 0,
        angularVel: (Math.random() - 0.5) * (3 / mass),
        vx: (Math.random() - 0.5) * speed,
        vy: (Math.random() - 0.5) * speed,
        dragging: false,
      });
    }

    const stepsEl    = document.getElementById('steps');
    const wheelStage = document.querySelector('.wheel-stage');
    const actionsRow = document.querySelector('.actions-row');
    const footer     = document.querySelector('.creator-links');
    const cornerCtrl = document.querySelector('.corner-controls');
    const chosenRow  = document.querySelector('.chosen-row');

    // Individual step pills
    stepsEl.querySelectorAll('.step:not(.hidden)').forEach(el => collect(el, stepsEl));

    // Chosen chips row (only if populated)
    if (chosenRow && chosenRow.children.length > 0) collect(chosenRow, null);

    // Wheel stage — three separate items
    collect(wheelStage.querySelector('.wheel-question'),    wheelStage);
    collect(document.getElementById('the-wheel'),           wheelStage);
    collect(wheelStage.querySelector('.wheel-result-label'), wheelStage);

    // Individual action buttons
    actionsRow.querySelectorAll('.btn:not(.hidden)').forEach(el => collect(el, actionsRow));

    // Individual creator links + separator
    if (footer) {
      footer.querySelectorAll('.creator-link, .creator-links-sep').forEach(el => collect(el, footer));
    }

    // Corner buttons — collect just the button circles, not the wraps.
    // Hiding cornerCtrl keeps the label spans under visibility:hidden for the
    // whole session, so the hover text can never appear during physics.
    if (cornerCtrl) {
      cornerCtrl.querySelectorAll('.btn--icon').forEach(el => collect(el, cornerCtrl));
    }

    // Hide container shells so they don't ghost behind their children.
    // visibility:hidden is used instead of opacity:0 because opacity creates
    // a stacking context that traps position:fixed children inside the parent,
    // making them vanish. visibility:hidden has no such side-effect.
    hiddenParents.forEach(p => {
      if (!p) return;
      p.dataset.easterHide  = '1';
      p.style.visibility    = 'hidden';
      p.style.pointerEvents = 'none';
    });

    // Lock every item to its current screen position
    items.forEach(item => {
      item.el.style.position    = 'fixed';
      item.el.style.left        = item.origX + 'px';
      item.el.style.top         = item.origY + 'px';
      item.el.style.width       = item.w + 'px';
      item.el.style.height      = item.h + 'px';
      item.el.style.margin        = '0';
      item.el.style.zIndex        = '100';
      item.el.style.pointerEvents = 'auto';
      // Override the visibility:hidden inherited from the now-hidden parent
      item.el.style.visibility    = 'visible';
    });

    document.addEventListener('mousedown',  onDown);
    document.addEventListener('mousemove',  onMove);
    document.addEventListener('mouseup',    onUp);
    document.addEventListener('touchstart', onTouchStart, { passive: false });
    document.addEventListener('touchmove',  onTouchMove,  { passive: false });
    document.addEventListener('touchend',   onTouchEnd);

    runPhysics(mode);
  }

  function stopPhysics() {
    items.forEach(item => {
      item.el.style.position    = item._pos;
      item.el.style.left        = item._left;
      item.el.style.top         = item._top;
      item.el.style.width       = item._w;
      item.el.style.height      = item._h;
      item.el.style.margin      = item._m;
      item.el.style.zIndex      = item._z;
      item.el.style.pointerEvents = item._pe;
      item.el.style.transform     = item._tr;
      item.el.style.visibility    = item._vis;
    });

    document.querySelectorAll('[data-easter-hide]').forEach(el => {
      el.style.visibility   = '';
      el.style.pointerEvents = '';
      delete el.dataset.easterHide;
    });

    items = [];
    document.removeEventListener('mousedown',  onDown);
    document.removeEventListener('mousemove',  onMove);
    document.removeEventListener('mouseup',    onUp);
    document.removeEventListener('touchstart', onTouchStart);
    document.removeEventListener('touchmove',  onTouchMove);
    document.removeEventListener('touchend',   onTouchEnd);
  }

  function runPhysics(mode) {
    const G      = 0.2;    // gravity per frame
    const BOUNCE = 0.55;   // velocity kept on wall/floor bounce
    const DRAG   = 0.992;  // antigravity air resistance
    const ASPIN  = 0.985;  // angular friction

    function tick() {
      items.forEach(item => {
        if (!item.dragging) {
          if (mode === 'gravity')     item.vy += G * item.mass;
          if (mode === 'antigravity') { item.vx *= DRAG; item.vy *= DRAG; }

          item.dx += item.vx;
          item.dy += item.vy;
        }

        // Angular spin always applies (even while dragging — onMove sets angularVel)
        item.angularVel *= ASPIN;
        item.angle      += item.angularVel;

        if (!item.dragging) {
          // Extra friction when the item is nearly still — prevents infinite low-speed spinning
          const speed = Math.sqrt(item.vx * item.vx + item.vy * item.vy);
          if (speed < 0.8) item.angularVel *= 0.88;

          // Use the rotated AABB so the visual edges, not the unrotated rect, hit the walls.
          const box = getAABB(item);

          // Floor — reduce spin without reversing (sign flip every frame causes oscillation)
          if (box.cy + box.hh > window.innerHeight) {
            item.dy -= (box.cy + box.hh - window.innerHeight);
            item.vy *= -BOUNCE; item.vx *= 0.88;
            item.angularVel *= 0.45;
            if (Math.abs(item.vy) < 0.4) item.vy = 0;
          }

          // Ceiling
          if (box.cy - box.hh < 0) {
            item.dy -= (box.cy - box.hh);
            item.vy *= -BOUNCE; item.angularVel *= 0.5;
          }

          // Left wall
          if (box.cx - box.hw < 0) {
            item.dx -= (box.cx - box.hw);
            item.vx *= -BOUNCE; item.angularVel *= 0.55;
          }

          // Right wall
          if (box.cx + box.hw > window.innerWidth) {
            item.dx -= (box.cx + box.hw - window.innerWidth);
            item.vx *= -BOUNCE; item.angularVel *= 0.55;
          }
        }

        applyTransform(item);
      });

      // Item-to-item collisions — both modes
      for (let i = 0; i < items.length; i++) {
        for (let j = i + 1; j < items.length; j++) {
          pushApart(items[i], items[j]);
        }
      }

      rafId = requestAnimationFrame(tick);
    }

    rafId = requestAnimationFrame(tick);
  }

  function applyTransform(item) {
    item.el.style.transform = `translate(${item.dx}px,${item.dy}px) rotate(${item.angle}deg)`;
  }

  // Axis-aligned bounding box of the item at its current rotated angle.
  // The visual extents expand as the item rotates, so hitboxes match the screen appearance.
  function getAABB(item) {
    const rad = item.angle * Math.PI / 180;
    const cos = Math.abs(Math.cos(rad));
    const sin = Math.abs(Math.sin(rad));
    return {
      cx: item.origX + item.dx + item.w / 2,
      cy: item.origY + item.dy + item.h / 2,
      hw: (item.w * cos + item.h * sin) / 2,
      hh: (item.w * sin + item.h * cos) / 2,
    };
  }

  // AABB soft push — position correction + velocity + angular impulse
  function pushApart(a, b) {
    const A = getAABB(a), B = getAABB(b);
    const cx = A.cx - B.cx;
    const cy = A.cy - B.cy;
    const hw = A.hw + B.hw;
    const hh = A.hh + B.hh;

    if (Math.abs(cx) >= hw || Math.abs(cy) >= hh) return;

    const px = hw - Math.abs(cx);
    const py = hh - Math.abs(cy);
    const f  = 0.14;

    // Relative speed at the moment of collision — zero means items are resting
    const relVx = a.vx - b.vx, relVy = a.vy - b.vy;
    const relSpeed = Math.sqrt(relVx * relVx + relVy * relVy);

    // Contact friction always slows spin; tiny angular kick only on real impact
    const spinFriction = 0.92;
    const kickScale    = relSpeed > 0.5 ? 0.06 : 0;

    if (px < py) {
      const s = cx > 0 ? 1 : -1;
      const share = px * 0.5;
      if (!a.dragging) {
        a.dx += s * share; a.vx += s * px * f / a.mass;
        a.angularVel = a.angularVel * spinFriction + s * kickScale / a.mass;
      }
      if (!b.dragging) {
        b.dx -= s * share; b.vx -= s * px * f / b.mass;
        b.angularVel = b.angularVel * spinFriction - s * kickScale / b.mass;
      }
    } else {
      const s = cy > 0 ? 1 : -1;
      const share = py * 0.5;
      if (!a.dragging) {
        a.dy += s * share; a.vy += s * py * f / a.mass;
        a.angularVel = a.angularVel * spinFriction + s * kickScale * 0.7 / a.mass;
      }
      if (!b.dragging) {
        b.dy -= s * share; b.vy -= s * py * f / b.mass;
        b.angularVel = b.angularVel * spinFriction - s * kickScale * 0.7 / b.mass;
      }
    }
  }

  // ── Drag ──────────────────────────────────────────────────────────────────
  function onDown(e) {
    const hit = items.find(item => item.el.contains(e.target));
    if (!hit) return;
    dragTarget   = hit;
    hit.dragging = true;
    dragOffX     = e.clientX - hit.dx;
    dragOffY     = e.clientY - hit.dy;
    lastMX = e.clientX; lastMY = e.clientY;
    mouseVX = mouseVY = 0;
  }

  function onMove(e) {
    mouseVX = e.clientX - lastMX;
    mouseVY = e.clientY - lastMY;
    lastMX  = e.clientX; lastMY = e.clientY;
    if (!dragTarget) return;
    dragTarget.dx = e.clientX - dragOffX;
    dragTarget.dy = e.clientY - dragOffY;
    // Spin based on horizontal drag speed
    dragTarget.angularVel = mouseVX * 0.25;
    applyTransform(dragTarget);
  }

  function onUp() {
    if (!dragTarget) return;
    dragTarget.vx       = mouseVX * 0.65 / dragTarget.mass;
    dragTarget.vy       = mouseVY * 0.65 / dragTarget.mass;
    dragTarget.dragging = false;
    dragTarget          = null;
  }

  // ── Touch ─────────────────────────────────────────────────────────────────
  function onTouchStart(e) {
    const t = e.touches[0];
    onDown({ clientX: t.clientX, clientY: t.clientY, target: document.elementFromPoint(t.clientX, t.clientY) });
  }
  function onTouchMove(e) {
    e.preventDefault();
    const t = e.touches[0];
    onMove({ clientX: t.clientX, clientY: t.clientY });
  }
  function onTouchEnd() { onUp(); }

})();
