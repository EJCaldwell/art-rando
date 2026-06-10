// ─────────────────────────────────────────────────────────────────────────────
// gallery.js — placeholder gallery modal.
// Currently shows a "work in progress" notice.
// ─────────────────────────────────────────────────────────────────────────────

function openGallery() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const card = document.createElement('div');
  card.className = 'modal-card';

  // Header
  const header = document.createElement('div');
  header.className = 'modal-header';
  const title = document.createElement('h2');
  title.textContent = 'Gallery';
  const closeX = document.createElement('button');
  closeX.className = 'modal-close-btn';
  closeX.innerHTML = '&times;';
  closeX.addEventListener('click', close);
  header.appendChild(title);
  header.appendChild(closeX);

  // Body — WIP notice
  const body = document.createElement('div');
  body.className = 'modal-body gallery-wip-body';

  const icon = document.createElement('p');
  icon.className = 'gallery-wip-icon';
  icon.textContent = '🖼';

  const heading = document.createElement('p');
  heading.className = 'gallery-wip-heading';
  heading.textContent = 'Work in Progress';

  const desc = document.createElement('p');
  desc.className = 'gallery-wip-desc';
  desc.textContent = 'The gallery is on its way. Check back soon!';

  body.appendChild(icon);
  body.appendChild(heading);
  body.appendChild(desc);

  // Footer
  const footer = document.createElement('div');
  footer.className = 'modal-footer';
  const okBtn = document.createElement('button');
  okBtn.className = 'btn btn--spin';
  okBtn.style.cssText = 'font-size:1rem;padding:0.65rem 2.5rem;margin-left:auto;';
  okBtn.textContent = 'Got it';
  okBtn.addEventListener('click', close);
  footer.appendChild(okBtn);

  card.appendChild(header);
  card.appendChild(body);
  card.appendChild(footer);
  overlay.appendChild(card);
  document.body.appendChild(overlay);

  overlay.addEventListener('mousedown', e => { if (e.target === overlay) close(); });
  requestAnimationFrame(() => requestAnimationFrame(() => overlay.classList.add('modal--visible')));

  function close() {
    overlay.classList.remove('modal--visible');
    setTimeout(() => {
      if (document.body.contains(overlay)) document.body.removeChild(overlay);
    }, 300);
  }
}
