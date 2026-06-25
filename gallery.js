// gallery.js — community image gallery backed by Supabase Storage + Postgres.
//
// Public API:
//   openGallery()              — opens the gallery modal
//   openUploadModal(prompt)    — opens the artwork upload dialog; called from app.js
//                               after the results sheet is shown.
//
// Gallery has two tabs when the user is logged in:
//   Public Gallery — approved posts from all users (image grid)
//   My Uploads     — the current user's own posts at all statuses, with delete
//
// Images are stored in the "gallery-images" Supabase Storage bucket under the
// path {userId}/{timestamp}.{ext}.  Posts land in gallery_posts with
// status = 'pending' and move to 'approved' or 'rejected' via admin.html.
//
// Depends on: supabase.js (_sb), auth.js (getSession, clearSession)
// ─────────────────────────────────────────────────────────────────────────────

// ── Shared upload constants ───────────────────────────────────────────────────
// Static image types accepted by both upload modals — GIF and video excluded.
const ALLOWED_IMAGE_TYPES = [
  'image/jpeg', 'image/png', 'image/heic', 'image/heif',
  'image/webp', 'image/avif', 'image/bmp', 'image/tiff',
];
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 20 MB

// Wires file input and drag-drop events onto a drop zone.
// Validates type/size, renders a preview, and enables the submit button.
// Returns a getter — call it inside the submit handler to retrieve the chosen file.
function setupDropZone(zone, fileInput, preview, submitBtn, showErr, hideErr) {
  let file = null;

  function pick(f) {
    if (!ALLOWED_IMAGE_TYPES.includes(f.type)) {
      showErr('Please choose a static image (JPG, PNG, HEIC, WEBP, etc.) — no GIFs or videos.');
      return;
    }
    if (f.size > MAX_UPLOAD_BYTES) {
      showErr('Image must be 20 MB or smaller.');
      return;
    }
    hideErr();
    file = f;
    submitBtn.disabled = false;
    zone.classList.add('upload-drop-zone--has-file');
    const reader = new FileReader();
    reader.onload = ev => { preview.src = ev.target.result; preview.classList.remove('hidden'); };
    reader.readAsDataURL(f);
  }

  fileInput.addEventListener('change', () => { if (fileInput.files[0]) pick(fileInput.files[0]); });
  zone.addEventListener('dragover',  e => { e.preventDefault(); zone.classList.add('upload-drop-zone--over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('upload-drop-zone--over'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('upload-drop-zone--over');
    if (e.dataTransfer.files[0]) pick(e.dataTransfer.files[0]);
  });

  return () => file;
}

// ── Gallery modal ─────────────────────────────────────────────────────────────

function openGallery() {
  const session = getSession();

  // ── Build the modal shell ──────────────────────────────────────────────────
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const card = document.createElement('div');
  // modal-card--gallery overrides the default modal width/height so the image
  // grid has more room without affecting other modals.
  card.className = 'modal-card modal-card--gallery';

  // ── Header ─────────────────────────────────────────────────────────────────
  const header = document.createElement('div');
  header.className = 'modal-header';

  const title = document.createElement('h2');
  title.textContent = 'Gallery';

  const headerRight = document.createElement('div');
  headerRight.className = 'gallery-header-right';

  if (session?.loggedIn) {
    // Show the signed-in username alongside a sign-out button.
    const userLabel = document.createElement('span');
    userLabel.className   = 'gallery-user-label';
    userLabel.textContent = session.user;

    const signOutBtn = document.createElement('button');
    signOutBtn.className   = 'btn--reset-defaults gallery-signout-btn';
    signOutBtn.textContent = 'Sign out';
    signOutBtn.addEventListener('click', async () => {
      await clearSession();
      close();
    });

    headerRight.appendChild(userLabel);
    headerRight.appendChild(signOutBtn);
  } else {
    // Guest — show a sign-in link so they can reach the login page.
    const signInLink = document.createElement('a');
    signInLink.href      = 'login.html';
    signInLink.className = 'btn btn--edit';
    signInLink.style.cssText = 'text-decoration:none;font-size:0.82rem;padding:0.35rem 0.9rem;';
    signInLink.textContent   = 'Sign In';
    headerRight.appendChild(signInLink);
  }

  const closeX = document.createElement('button');
  closeX.className = 'modal-close-btn';
  closeX.innerHTML = '&times;';
  closeX.addEventListener('click', close);
  headerRight.appendChild(closeX);

  header.appendChild(title);
  header.appendChild(headerRight);

  // ── Tab bar — always shown; My Uploads only when signed in ───────────────
  const tabBar = document.createElement('div');
  tabBar.className = 'gallery-tabs';

  const publicTab = document.createElement('button');
  publicTab.className   = 'gallery-tab gallery-tab--active';
  publicTab.textContent = 'Public Gallery';
  tabBar.appendChild(publicTab);

  const myTab = document.createElement('button');
  myTab.className   = 'gallery-tab';
  myTab.textContent = 'My Uploads';

  if (session?.loggedIn) {
    tabBar.appendChild(myTab);
  }

  // ── Scrollable body ────────────────────────────────────────────────────────
  const body = document.createElement('div');
  body.className = 'modal-body gallery-body';

  // Loads and renders the public (approved) posts tab.
  async function showPublicGallery() {
    publicTab.classList.add('gallery-tab--active');
    myTab.classList.remove('gallery-tab--active');
    body.innerHTML = '<p class="gallery-loading">Loading…</p>';

    const { data: posts, error } = await _sb
      .from('gallery_posts')
      .select('*')
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .limit(60);

    if (error) {
      body.innerHTML = '<p class="gallery-error">Could not load gallery. Please try again.</p>';
      return;
    }

    body.innerHTML = '';

    // Retention notice — separate from the upload content policy.
    const notice = document.createElement('p');
    notice.className   = 'gallery-policy-notice';
    notice.textContent = 'The gallery is cleansed weekly to make room for new artwork — uploaded images are not kept permanently. This is not a storage service; do not rely on it to preserve your work. The gallery owner is not responsible for any content removed during a weekly cleanse.';
    body.appendChild(notice);

    const gridWrap = document.createElement('div');
    body.appendChild(gridWrap);

    // showStatus = false so the public tab shows artist name, not status badges.
    renderPostGrid(gridWrap, posts, false);
  }

  // Loads and renders the current user's own posts (all statuses).
  async function showMyUploads() {
    myTab.classList.add('gallery-tab--active');
    publicTab.classList.remove('gallery-tab--active');
    body.innerHTML = '<p class="gallery-loading">Loading…</p>';

    const { data: posts, error } = await _sb
      .from('gallery_posts')
      .select('*')
      .eq('user_id', session.userId)
      .order('created_at', { ascending: false });

    if (error) {
      body.innerHTML = '<p class="gallery-error">Could not load your uploads. Please try again.</p>';
      return;
    }

    body.innerHTML = '';

    // Upload button at the top — lets the user post artwork even without the
    // results sheet open, using the last spin result stored in localStorage.
    const uploadRow = document.createElement('div');
    uploadRow.className = 'gallery-upload-row';

    const uploadBtn = document.createElement('button');
    uploadBtn.className   = 'btn btn--save-gallery';
    uploadBtn.style.cssText = 'font-size:0.9rem;padding:0.55rem 1.5rem;';
    uploadBtn.textContent = '+ Upload Artwork';
    uploadBtn.addEventListener('click', () => openGalleryUploadModal(showMyUploads));

    uploadRow.appendChild(uploadBtn);
    body.appendChild(uploadRow);

    // Separate container so renderPostGrid's innerHTML reset doesn't wipe the button.
    const gridWrap = document.createElement('div');
    body.appendChild(gridWrap);

    // showStatus = true so each card shows pending/approved/rejected + a delete button.
    renderPostGrid(gridWrap, posts, true, showMyUploads);
  }

  publicTab.addEventListener('click', showPublicGallery);
  myTab.addEventListener('click', showMyUploads);

  // ── Footer ─────────────────────────────────────────────────────────────────
  const footer = document.createElement('div');
  footer.className = 'modal-footer';

  const closeBtn = document.createElement('button');
  closeBtn.className     = 'btn btn--spin';
  closeBtn.style.cssText = 'font-size:1rem;padding:0.65rem 2.5rem;margin-left:auto;';
  closeBtn.textContent   = 'Close';
  closeBtn.addEventListener('click', close);
  footer.appendChild(closeBtn);

  // ── Assemble and mount ─────────────────────────────────────────────────────
  card.appendChild(header);
  card.appendChild(tabBar);
  card.appendChild(body);
  card.appendChild(footer);
  overlay.appendChild(card);
  document.body.appendChild(overlay);

  // Backdrop click closes the modal.
  overlay.addEventListener('mousedown', e => { if (e.target === overlay) close(); });

  // Two rAFs give the browser a frame to paint before the fade transition fires.
  requestAnimationFrame(() => requestAnimationFrame(() => overlay.classList.add('modal--visible')));

  // Always show the public gallery; sign-in is only needed to upload.
  showPublicGallery();

  // Async admin check — runs after the modal is visible so it doesn't delay
  // opening.  Inserts an Admin Panel link into the header for admin users only.
  if (session?.loggedIn) {
    _sb.from('profiles').select('is_admin').eq('id', session.userId).single()
      .then(({ data }) => {
        if (!data?.is_admin) return;
        const adminLink = document.createElement('a');
        adminLink.href      = 'admin.html';
        adminLink.className = 'btn btn--edit';
        adminLink.style.cssText = 'text-decoration:none;font-size:0.78rem;padding:0.35rem 0.9rem;';
        adminLink.textContent   = 'Admin Panel';
        // Insert before the close × so it sits inside the header right section.
        headerRight.insertBefore(adminLink, closeX);
      });
  }

  // ── Close helper ───────────────────────────────────────────────────────────
  function close() {
    overlay.classList.remove('modal--visible');
    setTimeout(() => {
      if (document.body.contains(overlay)) document.body.removeChild(overlay);
    }, 300);
  }
}

// ── Post grid renderer ────────────────────────────────────────────────────────
//
// Clears `container` and renders a grid of gallery post cards.
//   showStatus — true on "My Uploads": adds status badge + delete button.
//   onDelete   — callback fired after a successful deletion so the grid
//                can be refreshed without reopening the modal.
function renderPostGrid(container, posts, showStatus, onDelete) {
  container.innerHTML = '';

  if (!posts || posts.length === 0) {
    // Empty state — different message depending on which tab we're on.
    container.innerHTML = `
      <div class="gallery-empty">
        <p class="gallery-state-icon"></p>
        <p class="gallery-state-heading">${showStatus ? 'No uploads yet' : 'No artwork yet'}</p>
        <p class="gallery-state-desc">${
          showStatus
            ? 'Upload your first artwork after spinning the wheels.'
            : 'Be the first to share your artwork here!'
        }</p>
      </div>
    `;
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'gallery-img-grid';

  posts.forEach(post => {
    const card = document.createElement('div');
    card.className = 'gallery-img-card';

    // Resolve the public URL for this image from Supabase Storage.
    const { data: urlData } = _sb.storage.from('gallery-images').getPublicUrl(post.image_path);

    const img = document.createElement('img');
    img.className = 'gallery-img';
    img.src       = urlData.publicUrl;
    img.alt       = 'Artwork';
    img.loading   = 'lazy';       // defer off-screen images

    const caption = document.createElement('div');
    caption.className = 'gallery-img-caption';

    // Status badge — only on the My Uploads tab.
    if (showStatus) {
      const badge = document.createElement('span');
      badge.className   = `gallery-status-badge gallery-status-badge--${post.status}`;
      badge.textContent = post.status.charAt(0).toUpperCase() + post.status.slice(1);
      caption.appendChild(badge);
    }

    // Individual spin results shown as color-coded chips — one per wheel,
    // matching the chosen-chip colors used during spinning.
    caption.appendChild(buildPromptChips(post.prompt));

    // Artist name + date on the public tab.
    if (!showStatus) {
      const meta = document.createElement('p');
      meta.className   = 'gallery-img-meta';
      meta.textContent = `${post.username} · ${formatDate(post.created_at)}`;
      caption.appendChild(meta);
    }

    // Delete button — only on the My Uploads tab.
    if (showStatus) {
      const delBtn = document.createElement('button');
      delBtn.className   = 'gallery-card-delete';
      delBtn.textContent = 'Delete';
      delBtn.title       = 'Delete this post';
      delBtn.addEventListener('click', async () => {
        delBtn.disabled = true;
        // Remove the file from Storage, then the database record.
        await _sb.storage.from('gallery-images').remove([post.image_path]);
        await _sb.from('gallery_posts').delete().eq('id', post.id);
        if (onDelete) onDelete();
      });
      card.appendChild(delBtn);
    }

    card.appendChild(img);
    card.appendChild(caption);
    grid.appendChild(card);
  });

  container.appendChild(grid);
}

// ── Auth gate ─────────────────────────────────────────────────────────────────
// Shown inside the gallery body when the user is not signed in.
function renderAuthGate(container) {
  container.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'gallery-auth-prompt';
  wrap.innerHTML = `
    <p class="gallery-state-heading">Sign in to view the gallery</p>
    <p class="gallery-state-desc">Create a free account to browse artwork and upload your own.</p>
    <a href="login.html" class="btn btn--spin gallery-auth-btn">Sign In / Register</a>
  `;
  container.appendChild(wrap);
}

// ── Upload modal ──────────────────────────────────────────────────────────────
//
// Called from app.js when the user clicks "Upload Artwork" on the results sheet.
// promptState: { category, medium, form, subject } — the current spin result.
//
// Flow:
//   1. User picks or drags a static image (JPG, PNG, HEIC, WEBP, etc., max 20 MB).
//   2. File uploads to Supabase Storage at {userId}/{timestamp}.{ext}.
//   3. A gallery_posts row is inserted with status = 'pending'.
//   4. Success message: image will appear in the gallery after review.
function openUploadModal(promptState) {
  const session = getSession();

  // Redirect to login if the user is not signed in.
  if (!session?.loggedIn) {
    window.location.href = 'login.html';
    return;
  }

  // ── Build the modal ────────────────────────────────────────────────────────
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const card = document.createElement('div');
  card.className = 'modal-card';

  card.innerHTML = `
    <div class="modal-header">
      <h2>Upload Artwork</h2>
      <button class="modal-close-btn" id="upload-close-x">&times;</button>
    </div>
    <div class="modal-body" style="gap:1rem">
      <p class="upload-prompt-label">Your prompt</p>
      <p class="upload-prompt-text">${buildPromptText(promptState)}</p>

      <!-- Hidden file input — triggered by clicking the drop zone label -->
      <label class="upload-drop-zone" id="upload-zone" tabindex="0">
        <input type="file" id="upload-file-input"
               accept="image/jpeg,image/png,image/heic,image/heif,image/webp,image/avif,image/bmp,image/tiff"
               style="display:none" />
        <span class="upload-zone-icon"></span>
        <span class="upload-zone-text">Click to choose an image</span>
        <span class="upload-zone-hint">JPG · PNG · HEIC · WEBP — no GIFs or video — max 20 MB</span>
      </label>

      <!-- Preview appears after a file is selected -->
      <img id="upload-preview" class="upload-preview hidden" alt="Preview" />

      <p id="upload-error" class="login-error hidden"></p>

      <p class="gallery-policy-notice">No inappropriate or AI-generated content. Violations will be rejected and may result in a permanent account ban.</p>
      <p class="gallery-policy-notice">The gallery is cleansed weekly — images are not stored permanently. This is not a storage service; the gallery owner is not responsible for deleted content.</p>
    </div>
    <div class="modal-footer">
      <button id="upload-cancel-btn" class="btn btn--close-sheet">Cancel</button>
      <button id="upload-submit-btn" class="btn btn--spin"
              style="font-size:1rem;padding:0.65rem 2rem;" disabled>
        Upload
      </button>
    </div>
  `;

  overlay.appendChild(card);
  document.body.appendChild(overlay);
  requestAnimationFrame(() => requestAnimationFrame(() => overlay.classList.add('modal--visible')));

  // ── Element refs ───────────────────────────────────────────────────────────
  const fileInput = card.querySelector('#upload-file-input');
  const zone      = card.querySelector('#upload-zone');
  const preview   = card.querySelector('#upload-preview');
  const submitBtn = card.querySelector('#upload-submit-btn');
  const cancelBtn = card.querySelector('#upload-cancel-btn');
  const closeXBtn = card.querySelector('#upload-close-x');
  const errorEl   = card.querySelector('#upload-error');

  // ── File selection ─────────────────────────────────────────────────────────
  const getFile = setupDropZone(zone, fileInput, preview, submitBtn, showErr, hideErr);

  // ── Upload handler ─────────────────────────────────────────────────────────
  submitBtn.addEventListener('click', async () => {
    const selectedFile = getFile();
    if (!selectedFile) return;

    submitBtn.disabled    = true;
    submitBtn.textContent = 'Compressing…';
    hideErr();

    // Compress to JPEG before uploading; falls back to the original if it can't
    // be decoded (e.g. HEIC on non-Apple) or if compression makes it larger.
    const fileToUpload = await compressImage(selectedFile);

    // Store at {userId}/{timestamp}.{ext} — the prefix is checked by the delete RLS policy.
    submitBtn.textContent = 'Uploading…';
    const ext  = fileToUpload.name.split('.').pop().toLowerCase() || 'jpg';
    const path = `${session.userId}/${Date.now()}.${ext}`;

    const { error: uploadErr } = await _sb.storage
      .from('gallery-images')
      .upload(path, fileToUpload, { contentType: fileToUpload.type });

    if (uploadErr) {
      showErr('Upload failed: ' + uploadErr.message);
      submitBtn.disabled    = false;
      submitBtn.textContent = 'Upload';
      return;
    }

    // Insert the gallery_posts record with status = 'pending'.
    const { error: insertErr } = await _sb.from('gallery_posts').insert({
      user_id:    session.userId,
      username:   session.user,
      prompt:     promptState,
      image_path: path,
      status:     'pending',
    });

    if (insertErr) {
      // Roll back the Storage upload so orphan files don't accumulate.
      await _sb.storage.from('gallery-images').remove([path]);
      showErr('Could not save your post. Please try again.');
      submitBtn.disabled    = false;
      submitBtn.textContent = 'Upload';
      return;
    }

    // Show a confirmation message then close after a brief pause.
    submitBtn.textContent = 'Submitted for review!';
    setTimeout(() => closeModal(), 1800);
  });

  // ── Close handlers ─────────────────────────────────────────────────────────
  cancelBtn.addEventListener('click', closeModal);
  closeXBtn.addEventListener('click', closeModal);
  overlay.addEventListener('mousedown', e => { if (e.target === overlay) closeModal(); });

  function closeModal() {
    overlay.classList.remove('modal--visible');
    setTimeout(() => {
      if (document.body.contains(overlay)) document.body.removeChild(overlay);
    }, 300);
  }

  // ── Error helpers ──────────────────────────────────────────────────────────
  function showErr(msg) {
    errorEl.textContent = msg;
    errorEl.style.color = '';
    errorEl.classList.remove('hidden');
  }

  function hideErr() {
    errorEl.classList.add('hidden');
  }
}

// ── Gallery upload modal ──────────────────────────────────────────────────────
//
// Opened from the "My Uploads" tab so users can post artwork even if they
// dismissed the results sheet.  Prompt fields are pre-filled from the last
// spin result saved in localStorage; all fields are editable in case the user
// wants to correct them or upload art for an older spin.
//
// onSuccess — callback fired after a successful upload (used to refresh the tab).
function openGalleryUploadModal(onSuccess) {
  const session = getSession();
  if (!session?.loggedIn) {
    window.location.href = 'login.html';
    return;
  }

  // Load the last spin result saved by app.js when the results sheet opened.
  let lastSpin = {};
  try {
    lastSpin = JSON.parse(getCookie('art_rando_last_spin')) || {};
  } catch (_) {}

  // ── Build the modal ────────────────────────────────────────────────────────
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const card = document.createElement('div');
  card.className = 'modal-card';

  card.innerHTML = `
    <div class="modal-header">
      <h2>Upload Artwork</h2>
      <button class="modal-close-btn" id="gup-close-x">&times;</button>
    </div>
    <div class="modal-body" style="gap:0.85rem">

      <p class="upload-prompt-label">What was your prompt?</p>
      <p class="gallery-img-meta" style="margin-top:-0.4rem">
        Pre-filled from your last spin — edit if needed.
      </p>

      <!-- Editable prompt fields: one per wheel -->
      <div class="gup-fields">
        <div class="gup-field">
          <label class="gup-label gup-label--cat">Category</label>
          <input id="gup-category" class="editor-input gup-input" type="text"
                 placeholder="e.g. Painting" value="${escHtml(lastSpin.category || '')}" />
        </div>
        <div class="gup-field">
          <label class="gup-label gup-label--med">Medium</label>
          <input id="gup-medium" class="editor-input gup-input" type="text"
                 placeholder="e.g. Watercolor" value="${escHtml(lastSpin.medium || '')}" />
        </div>
        <div class="gup-field">
          <label class="gup-label gup-label--form">Form <span style="font-weight:400;opacity:.6">(optional)</span></label>
          <input id="gup-form" class="editor-input gup-input" type="text"
                 placeholder="e.g. Sketch" value="${escHtml(lastSpin.form || '')}" />
        </div>
        <div class="gup-field">
          <label class="gup-label gup-label--sub">Subject</label>
          <input id="gup-subject" class="editor-input gup-input" type="text"
                 placeholder="e.g. Portrait" value="${escHtml(lastSpin.subject || '')}" />
        </div>
      </div>

      <!-- File drop zone -->
      <label class="upload-drop-zone" id="gup-zone" tabindex="0">
        <input type="file" id="gup-file-input"
               accept="image/jpeg,image/png,image/heic,image/heif,image/webp,image/avif,image/bmp,image/tiff"
               style="display:none" />
        <span class="upload-zone-icon"></span>
        <span class="upload-zone-text">Click to choose an image</span>
        <span class="upload-zone-hint">JPG · PNG · HEIC · WEBP — no GIFs or video — max 20 MB</span>
      </label>

      <img id="gup-preview" class="upload-preview hidden" alt="Preview" />
      <p id="gup-error" class="login-error hidden"></p>

      <p class="gallery-policy-notice">No inappropriate or AI-generated content. Violations will be rejected and may result in a permanent account ban.</p>
      <p class="gallery-policy-notice">The gallery is cleansed weekly — images are not stored permanently. This is not a storage service; the gallery owner is not responsible for deleted content.</p>
    </div>
    <div class="modal-footer">
      <button id="gup-cancel" class="btn btn--close-sheet">Cancel</button>
      <button id="gup-submit" class="btn btn--spin"
              style="font-size:1rem;padding:0.65rem 2rem;" disabled>
        Upload
      </button>
    </div>
  `;

  overlay.appendChild(card);
  document.body.appendChild(overlay);
  requestAnimationFrame(() => requestAnimationFrame(() => overlay.classList.add('modal--visible')));

  // ── Element refs ───────────────────────────────────────────────────────────
  const fileInput  = card.querySelector('#gup-file-input');
  const zone       = card.querySelector('#gup-zone');
  const preview    = card.querySelector('#gup-preview');
  const submitBtn  = card.querySelector('#gup-submit');
  const cancelBtn  = card.querySelector('#gup-cancel');
  const closeXBtn  = card.querySelector('#gup-close-x');
  const errorEl    = card.querySelector('#gup-error');

  // ── File selection ─────────────────────────────────────────────────────────
  const getFile = setupDropZone(zone, fileInput, preview, submitBtn, showErr, hideErr);

  // ── Upload handler ─────────────────────────────────────────────────────────
  submitBtn.addEventListener('click', async () => {
    const selectedFile = getFile();
    if (!selectedFile) return;

    // Build the prompt from the editable fields.
    const promptState = {
      category: card.querySelector('#gup-category').value.trim() || null,
      medium:   card.querySelector('#gup-medium').value.trim()   || null,
      form:     card.querySelector('#gup-form').value.trim()     || null,
      subject:  card.querySelector('#gup-subject').value.trim()  || null,
    };

    // Subject is the only required field — the gallery card leans on it.
    if (!promptState.subject) {
      showErr('Please fill in the Subject field at minimum.');
      return;
    }

    submitBtn.disabled    = true;
    submitBtn.textContent = 'Compressing…';
    hideErr();

    const fileToUpload = await compressImage(selectedFile);

    submitBtn.textContent = 'Uploading…';
    const ext  = fileToUpload.name.split('.').pop().toLowerCase() || 'jpg';
    const path = `${session.userId}/${Date.now()}.${ext}`;

    const { error: uploadErr } = await _sb.storage
      .from('gallery-images')
      .upload(path, fileToUpload, { contentType: fileToUpload.type });

    if (uploadErr) {
      showErr('Upload failed: ' + uploadErr.message);
      submitBtn.disabled    = false;
      submitBtn.textContent = 'Upload';
      return;
    }

    const { error: insertErr } = await _sb.from('gallery_posts').insert({
      user_id:    session.userId,
      username:   session.user,
      prompt:     promptState,
      image_path: path,
      status:     'pending',
    });

    if (insertErr) {
      await _sb.storage.from('gallery-images').remove([path]);
      showErr('Could not save your post. Please try again.');
      submitBtn.disabled    = false;
      submitBtn.textContent = 'Upload';
      return;
    }

    submitBtn.textContent = 'Submitted for review!';
    setTimeout(() => {
      closeModal();
      if (onSuccess) onSuccess();
    }, 1400);
  });

  // ── Close handlers ─────────────────────────────────────────────────────────
  cancelBtn.addEventListener('click', closeModal);
  closeXBtn.addEventListener('click', closeModal);
  overlay.addEventListener('mousedown', e => { if (e.target === overlay) closeModal(); });

  function closeModal() {
    overlay.classList.remove('modal--visible');
    setTimeout(() => {
      if (document.body.contains(overlay)) document.body.removeChild(overlay);
    }, 300);
  }

  function showErr(msg) {
    errorEl.textContent = msg;
    errorEl.classList.remove('hidden');
  }
  function hideErr() { errorEl.classList.add('hidden'); }
}

// ── Shared helpers ────────────────────────────────────────────────────────────

// Builds a color-coded chip row showing each individual wheel spin result.
// Colors match the chosen-chip palette used during spinning in the main UI.
// Only chips for non-null fields are rendered so skipped wheels stay hidden.
function buildPromptChips(prompt) {
  const wrap = document.createElement('div');
  wrap.className = 'gallery-prompt-chips';

  // Each entry: [key, CSS modifier, label shown in chip]
  const slots = [
    ['subject',  'sub',  prompt?.subject],
    ['medium',   'med',  prompt?.medium],
    ['category', 'cat',  prompt?.category],
    ['form',     'form', prompt?.form],
  ];

  slots.forEach(([, mod, value]) => {
    if (!value) return;   // skip wheels that weren't spun or were skipped
    const chip = document.createElement('span');
    chip.className   = `gpc gpc--${mod}`;
    chip.textContent = value;
    chip.title       = value;   // full text on hover if chip truncates
    wrap.appendChild(chip);
  });

  // Fallback when the prompt object is empty or missing entirely.
  if (wrap.childElementCount === 0) {
    const fallback = document.createElement('span');
    fallback.className   = 'gallery-img-meta';
    fallback.textContent = '—';
    wrap.appendChild(fallback);
  }

  return wrap;
}

// Builds a plain-text summary of a prompt object.
// Works with both the JSONB shape from the DB and the live state object from app.js.
function buildPromptText(prompt) {
  if (!prompt) return '—';
  let text = 'Make a ' + (prompt.subject || '—');
  if (prompt.form)     text += ` as a ${prompt.form}`;
  if (prompt.medium)   text += ` using ${prompt.medium}`;
  if (prompt.category) text += ` (${prompt.category})`;
  return text;
}

// Escapes a string for safe injection into an HTML attribute value.
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Compresses an image file to JPEG before uploading, capping the longest side
// at maxPx and using the given quality (0–1).  Falls back silently to the
// original file if the browser can't decode it (e.g. HEIC on non-Apple devices)
// or if the compressed result is actually larger than the original.
function compressImage(file, maxPx = 1920, quality = 0.82) {
  return new Promise(resolve => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      // Scale down while preserving aspect ratio if either dimension exceeds maxPx.
      let { width, height } = img;
      if (width > maxPx || height > maxPx) {
        const scale = maxPx / Math.max(width, height);
        width  = Math.round(width  * scale);
        height = Math.round(height * scale);
      }

      const canvas = document.createElement('canvas');
      canvas.width  = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);

      canvas.toBlob(blob => {
        if (!blob || blob.size >= file.size) {
          resolve(file);   // compression made it bigger — keep the original
          return;
        }
        // Rename to .jpg since canvas always outputs JPEG here.
        resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }));
      }, 'image/jpeg', quality);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);   // can't decode (e.g. HEIC on non-Apple) — upload as-is
    };

    img.src = url;
  });
}

// Formats a UTC timestamp string or ms number into a short readable date.
function formatDate(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}
