// ─────────────────────────────────────────────────────────────────────────────
// SPIN_DURATION — how long (ms) one spin animation lasts.
// SPIN_MIN_CYCLES — minimum full drum rotations before landing on the winner.
// Both are `let` so dev.js and settings.js can override them at runtime.
// ─────────────────────────────────────────────────────────────────────────────
let SPIN_DURATION   = 4000;
let SPIN_MIN_CYCLES = 2;

// ─────────────────────────────────────────────────────────────────────────────
// PALETTE — item card colors, cycling through for any number of items.
// ─────────────────────────────────────────────────────────────────────────────
const PALETTE = [
  '#E63946', '#F4A261', '#2A9D8F', '#E9C46A', '#457B9D',
  '#A8DADC', '#F77F00', '#8338EC', '#06D6A0', '#FF6B6B'
];

// Muted colors used when the wheel is in a "waiting / not yet active" state.
const GRAYED_PALETTE = ['#2e2e4a', '#252540', '#2a2a45', '#232338'];

// How many item rows are visible in the drum at once.
// itemHeight = canvas.height / VISIBLE_ROWS (380 / 5 = 76px each).
const VISIBLE_ROWS = 5;

// ─────────────────────────────────────────────────────────────────────────────
// Wheel — vertical slot-machine drum backed by a single <canvas> element.
//
// Items scroll vertically (top → down). The center row is the "selected" slot,
// flanked by red indicator lines. Non-center rows are dimmed.
//
// Public API (unchanged from the original circular wheel):
//   new Wheel(canvasEl, items)  — create and draw idle state immediately
//   wheel.setItems(items)       — swap segments; used for wheels 2 & 3
//   wheel.spin(onComplete)      — animate; calls onComplete(winnerIndex)
//   wheel.drawIdle()            — redraw static drum (e.g. after reset)
//   wheel.drawGrayed()          — draw muted placeholder (waiting state)
// ─────────────────────────────────────────────────────────────────────────────
class Wheel {
  constructor(canvasEl, items) {
    this.canvas = canvasEl;
    this.ctx    = canvasEl.getContext('2d');
    this.items  = items || [];

    // Tracks total vertical scroll in pixels.  Grows continuously so we never
    // have to worry about modular arithmetic on the startOffset during a spin.
    this.currentOffset = 0;

    this._raf = null; // requestAnimationFrame handle

    if (items && items.length > 0) {
      this.drawIdle();
    } else {
      this.drawGrayed();
    }
  }

  // Height of each item card in pixels.
  get _itemHeight() {
    return this.canvas.height / VISIBLE_ROWS;
  }

  // Total height of one full pass through all items.
  // Scrolling by cycleHeight returns to the same visual position (seamless loop).
  get _cycleHeight() {
    return this._itemHeight * Math.max(this.items.length, 1);
  }

  // Swap in a new item list and redraw from the top.
  // Called by app.js before spinning wheels 2 and 3.
  setItems(items) {
    this.items        = items;
    this.currentOffset = 0;
    this.drawIdle();
  }

  drawIdle() {
    this._draw(this.currentOffset, false);
  }

  drawGrayed() {
    this._drawGrayedState();
  }

  // ── Spin animation ────────────────────────────────────────────────────────
  spin(onComplete) {
    if (!this.items.length) return;

    const ih      = this._itemHeight;
    const cycle   = this._cycleHeight;
    const h       = this.canvas.height;
    const itemCount = this.items.length;

    // Choose a random winning item.
    const winnerIndex = Math.floor(Math.random() * itemCount);

    // ── Work out how far to scroll so the winner lands in the center slot ──
    //
    // When the drum is drawn, item i's vertical center is at:
    //   y_center(i) = i * ih + ih/2 - (offset % cycle)
    //
    // We want the winner's center to equal h/2 (the canvas midpoint):
    //   winnerIndex * ih + ih/2 - targetMod = h/2
    //   targetMod = winnerIndex * ih + ih/2 - h/2
    //
    // Normalise into [0, cycle) to get a clean positive remainder.
    let targetMod = winnerIndex * ih + ih / 2 - h / 2;
    targetMod = ((targetMod % cycle) + cycle) % cycle;

    // Add several full cycles before the final landing offset so the drum
    // visibly spins around multiple times — the effect feels satisfying.
    // SPIN_MIN_CYCLES is a module-level variable settings.js can override.
    const numCycles  = SPIN_MIN_CYCLES + Math.floor(Math.random() * 4);
    const currentMod = ((this.currentOffset % cycle) + cycle) % cycle;

    // delta = how many extra pixels to scroll within the current cycle to
    // reach targetMod; always positive so we always scroll forward.
    let delta = targetMod - currentMod;
    if (delta < 0) delta += cycle;

    const totalScroll  = numCycles * cycle + delta;
    const startOffset  = this.currentOffset;
    // SPIN_DURATION is a module-level variable so dev.js can override it at runtime.
    const duration = SPIN_DURATION;
    let   startTime    = null;

    const frame = (timestamp) => {
      if (!startTime) startTime = timestamp;

      const elapsed = timestamp - startTime;
      const t       = Math.min(elapsed / duration, 1.0); // 0 → 1

      // Quartic ease-out: fast start, smooth deceleration to a stop.
      const eased = 1 - Math.pow(1 - t, 4);

      this.currentOffset = startOffset + totalScroll * eased;
      this._draw(this.currentOffset, false);

      if (t < 1.0) {
        this._raf = requestAnimationFrame(frame);
      } else {
        // Snap to exact final position to avoid floating-point drift.
        this.currentOffset = startOffset + totalScroll;
        this._draw(this.currentOffset, false);
        if (onComplete) onComplete(winnerIndex);
      }
    };

    this._raf = requestAnimationFrame(frame);
  }

  // ── Main draw routine ─────────────────────────────────────────────────────
  // Draws the full drum at the given scroll offset.
  // Called every animation frame during a spin, and once on idle/reset.
  _draw(offset, grayed) {
    const ctx       = this.ctx;
    const w         = this.canvas.width;
    const h         = this.canvas.height;
    const ih        = this._itemHeight;
    const itemCount = this.items.length;

    ctx.clearRect(0, 0, w, h);

    // Drum background — slightly darker than the page so the cards pop.
    ctx.fillStyle = '#12122a';
    ctx.fillRect(0, 0, w, h);

    // If there are no items yet, fall back to the grayed placeholder.
    if (!itemCount) {
      this._drawGrayedState();
      return;
    }

    const cycle = ih * itemCount;

    // Normalise the offset into [0, cycle) so we can tile items cleanly.
    const norm = ((offset % cycle) + cycle) % cycle;

    // Index of the first item that starts at or just above the top of the canvas.
    const firstIdx = Math.floor(norm / ih);

    // How far the first item's top edge is above y=0 (always ≤ 0).
    const firstY = -(norm % ih);

    // ── Draw item cards ───────────────────────────────────────────────────
    // We draw one extra row above (-1) and one below (VISIBLE_ROWS) the
    // visible area so there's no gap during fast scrolling.
    for (let row = -1; row <= VISIBLE_ROWS + 1; row++) {
      const itemIndex = ((firstIdx + row) % itemCount + itemCount) % itemCount;
      const y = firstY + row * ih;

      // Skip rows that are fully outside the canvas bounds.
      if (y + ih <= 0 || y >= h) continue;

      // A row is the "center" (selected) row when its vertical midpoint
      // falls within half an item-height of the canvas midpoint.
      const rowMidY  = y + ih / 2;
      const isCenter = Math.abs(rowMidY - h / 2) < ih / 2;

      const color = grayed
        ? GRAYED_PALETTE[itemIndex % GRAYED_PALETTE.length]
        : PALETTE[itemIndex % PALETTE.length];

      // Dim non-center rows to draw attention to the selected item.
      ctx.globalAlpha = isCenter ? 1.0 : 0.3;
      ctx.fillStyle   = color;
      this._roundRect(ctx, 6, y + 3, w - 12, ih - 6, 10);
      ctx.fill();

      // Draw the label text, sized to fit within the card width.
      ctx.globalAlpha    = isCenter ? 1.0 : 0.45;
      ctx.textAlign      = 'center';
      ctx.textBaseline   = 'middle';
      ctx.fillStyle      = '#ffffff';
      ctx.shadowColor    = 'rgba(0,0,0,0.55)';
      ctx.shadowBlur     = isCenter ? 4 : 0;

      const label    = this.items[itemIndex];
      const maxWidth = w - 32;
      let fontSize   = isCenter ? 17 : 13;
      ctx.font = `bold ${fontSize}px system-ui, sans-serif`;

      // Reduce font size until the label fits in the card.
      while (ctx.measureText(label).width > maxWidth && fontSize > 8) {
        fontSize--;
        ctx.font = `bold ${fontSize}px system-ui, sans-serif`;
      }

      ctx.fillText(label, w / 2, y + ih / 2);
      ctx.shadowBlur  = 0;
      ctx.globalAlpha = 1.0;
    }

    // ── Gradient fade at top and bottom edges ─────────────────────────────
    // This softens the cut-off of rows entering and leaving the drum,
    // giving the illusion of depth.
    const gradH = ih * 1.5;

    const topGrad = ctx.createLinearGradient(0, 0, 0, gradH);
    topGrad.addColorStop(0, '#12122a');
    topGrad.addColorStop(1, 'rgba(18,18,42,0)');
    ctx.fillStyle = topGrad;
    ctx.fillRect(0, 0, w, gradH);

    const botGrad = ctx.createLinearGradient(0, h - gradH, 0, h);
    botGrad.addColorStop(0, 'rgba(18,18,42,0)');
    botGrad.addColorStop(1, '#12122a');
    ctx.fillStyle = botGrad;
    ctx.fillRect(0, h - gradH, w, gradH);

    // ── Center selection indicator lines ─────────────────────────────────
    // Two horizontal lines flanking the center row mark the "landing zone".
    const selY = (h - ih) / 2;
    ctx.strokeStyle = grayed ? '#3a3a5e' : '#e94560';
    ctx.lineWidth   = 2;
    ctx.beginPath();
    ctx.moveTo(0, selY);         ctx.lineTo(w, selY);        // top line
    ctx.moveTo(0, selY + ih);    ctx.lineTo(w, selY + ih);   // bottom line
    ctx.stroke();
  }

  // ── Grayed placeholder ────────────────────────────────────────────────────
  // Drawn when no items are loaded (wheels 2 & 3 before wheel 1 lands).
  _drawGrayedState() {
    const ctx = this.ctx;
    const w   = this.canvas.width;
    const h   = this.canvas.height;
    const ih  = this._itemHeight;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#12122a';
    ctx.fillRect(0, 0, w, h);

    // Draw VISIBLE_ROWS placeholder cards using muted colors.
    for (let row = 0; row < VISIBLE_ROWS; row++) {
      const y        = row * ih;
      const isCenter = row === Math.floor(VISIBLE_ROWS / 2);

      ctx.globalAlpha = isCenter ? 1.0 : 0.35;
      ctx.fillStyle   = GRAYED_PALETTE[row % GRAYED_PALETTE.length];
      this._roundRect(ctx, 6, y + 3, w - 12, ih - 6, 10);
      ctx.fill();
      ctx.globalAlpha = 1.0;

      // Show "Waiting..." only in the center card.
      if (isCenter) {
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.font         = 'bold 14px system-ui, sans-serif';
        ctx.fillStyle    = '#6060a0';
        ctx.fillText('Waiting…', w / 2, y + ih / 2);
      }
    }

    // Apply the same gradient fade so the placeholder matches the live drum.
    const gradH = ih * 1.5;

    const topGrad = ctx.createLinearGradient(0, 0, 0, gradH);
    topGrad.addColorStop(0, '#12122a');
    topGrad.addColorStop(1, 'rgba(18,18,42,0)');
    ctx.fillStyle = topGrad;
    ctx.fillRect(0, 0, w, gradH);

    const botGrad = ctx.createLinearGradient(0, h - gradH, 0, h);
    botGrad.addColorStop(0, 'rgba(18,18,42,0)');
    botGrad.addColorStop(1, '#12122a');
    ctx.fillStyle = botGrad;
    ctx.fillRect(0, h - gradH, w, gradH);

    // Muted selection lines so the layout reads consistently even when waiting.
    const selY = (h - ih) / 2;
    ctx.strokeStyle = '#3a3a5e';
    ctx.lineWidth   = 2;
    ctx.beginPath();
    ctx.moveTo(0, selY);      ctx.lineTo(w, selY);
    ctx.moveTo(0, selY + ih); ctx.lineTo(w, selY + ih);
    ctx.stroke();
  }

  // ── Utility: rounded rectangle path ──────────────────────────────────────
  // Canvas doesn't have a built-in roundRect in all browsers, so we draw it
  // manually with quadratic curves at each corner.
  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y,     x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x,     y + h, x,     y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x,     y,     x + r, y);
    ctx.closePath();
  }
}
