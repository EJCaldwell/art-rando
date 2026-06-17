// admin.js — moderation panel for reviewing pending gallery submissions.
//
// Access:
//   Only users whose row in public.profiles has is_admin = true can use this
//   page.  To grant admin access, open the Supabase dashboard, go to the
//   Table Editor → profiles, find your user row, and set is_admin = true.
//
// Workflow:
//   Pending posts load in chronological order (oldest first) so the queue
//   drains from the front.  Approve or Reject each post; the card fades out
//   and the status is written to gallery_posts.reviewed_at + status.
//
// Depends on: supabase.js (_sb), auth.js (initAuth, getSession)
// ─────────────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {

  await initAuth();    // populate the session cache

  const session = getSession();
  const content = document.getElementById('mod-content');

  // Guard: not signed in at all.
  if (!session?.loggedIn) {
    content.innerHTML = '<p class="gallery-error">You must be signed in to access this page.</p>';
    return;
  }

  // Guard: check the is_admin flag in the profiles table.
  const { data: profile, error: profileErr } = await _sb
    .from('profiles')
    .select('is_admin')
    .eq('id', session.userId)
    .single();

  if (profileErr || !profile?.is_admin) {
    content.innerHTML = '<p class="gallery-error">Access denied — admin only.</p>';
    return;
  }

  // ── Load pending posts ─────────────────────────────────────────────────────
  loadPending();

  async function loadPending() {
    content.innerHTML = '<p class="gallery-loading">Loading pending posts…</p>';

    const { data: posts, error } = await _sb
      .from('gallery_posts')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true });   // oldest first so the queue drains in order

    if (error) {
      content.innerHTML = '<p class="gallery-error">Failed to load posts.</p>';
      return;
    }

    if (!posts || posts.length === 0) {
      content.innerHTML = '<p class="gallery-loading" style="text-align:center;padding:4rem 0">Queue is empty — no posts pending review.</p>';
      return;
    }

    // Summary line above the grid.
    const summary = document.createElement('p');
    summary.className   = 'gallery-img-meta';
    summary.style.marginBottom = '1rem';
    summary.textContent = `${posts.length} post${posts.length !== 1 ? 's' : ''} pending review`;

    const grid = document.createElement('div');
    grid.className = 'gallery-img-grid';

    posts.forEach(post => {
      const card = buildCard(post);
      grid.appendChild(card);
    });

    content.innerHTML = '';
    content.appendChild(summary);
    content.appendChild(grid);
  }

  // ── Build one moderation card ──────────────────────────────────────────────
  function buildCard(post) {
    const card = document.createElement('div');
    card.className = 'gallery-img-card';

    // Resolve the public Storage URL for the submitted image.
    const { data: urlData } = _sb.storage.from('gallery-images').getPublicUrl(post.image_path);

    const img = document.createElement('img');
    img.className = 'gallery-img';
    img.src       = urlData.publicUrl;
    img.alt       = 'Submitted artwork';
    img.loading   = 'lazy';

    const caption = document.createElement('div');
    caption.className = 'gallery-img-caption';

    // Artist name and submission date.
    const meta = document.createElement('p');
    meta.className   = 'gallery-img-meta';
    meta.textContent = `${post.username} · ${new Date(post.created_at).toLocaleDateString()}`;

    // The prompt the user was given for this artwork.
    const promptEl = document.createElement('p');
    promptEl.className   = 'gallery-img-prompt';
    promptEl.textContent = buildPromptText(post.prompt);

    // Approve / Reject action buttons.
    const actions = document.createElement('div');
    actions.className = 'admin-card-actions';

    const approveBtn = document.createElement('button');
    approveBtn.textContent = '✓ Approve';
    approveBtn.className   = 'btn btn--spin';
    approveBtn.style.cssText = 'font-size:0.78rem;padding:0.4rem 1rem;';
    approveBtn.addEventListener('click', () => setStatus(post.id, 'approved', card));

    const rejectBtn = document.createElement('button');
    rejectBtn.textContent = '✕ Reject';
    rejectBtn.className   = 'btn btn--close-sheet';
    rejectBtn.style.cssText = 'font-size:0.78rem;padding:0.4rem 1rem;color:var(--accent);border-color:var(--accent);';
    rejectBtn.addEventListener('click', () => setStatus(post.id, 'rejected', card));

    // Delete button — permanently removes the image from Storage and the DB row.
    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = '🗑 Delete';
    deleteBtn.className   = 'btn btn--edit';
    deleteBtn.style.cssText = 'font-size:0.78rem;padding:0.4rem 1rem;color:var(--text-muted);';
    deleteBtn.addEventListener('click', () => deletePost(post, card));

    actions.appendChild(approveBtn);
    actions.appendChild(rejectBtn);
    actions.appendChild(deleteBtn);

    caption.appendChild(meta);
    caption.appendChild(promptEl);
    caption.appendChild(actions);
    card.appendChild(img);
    card.appendChild(caption);
    return card;
  }

  // ── Set status (approve or reject) ────────────────────────────────────────
  // Updates the post status and reviewed_at timestamp, then fades out the card.
  async function setStatus(postId, status, cardEl) {
    const { error } = await _sb
      .from('gallery_posts')
      .update({ status, reviewed_at: new Date().toISOString() })
      .eq('id', postId);

    if (error) {
      alert('Failed to update status: ' + error.message);
      return;
    }

    // Fade out and remove the card so the admin can see the queue shrinking.
    cardEl.style.transition = 'opacity 0.35s';
    cardEl.style.opacity    = '0.2';
    setTimeout(() => cardEl.remove(), 370);
  }

  // ── Permanently delete a post ─────────────────────────────────────────────
  // Removes the image file from Supabase Storage and deletes the DB row, then
  // fades the card out.  Asks for confirmation first since this can't be undone.
  async function deletePost(post, cardEl) {
    if (!confirm(`Permanently delete this post by ${post.username}? This cannot be undone.`)) return;

    // Delete the image file from Storage first so no orphan files are left behind.
    const { error: storageErr } = await _sb.storage
      .from('gallery-images')
      .remove([post.image_path]);

    if (storageErr) {
      alert('Could not delete image file: ' + storageErr.message);
      return;
    }

    // Remove the database record.
    const { error: dbErr } = await _sb
      .from('gallery_posts')
      .delete()
      .eq('id', post.id);

    if (dbErr) {
      alert('Could not delete post record: ' + dbErr.message);
      return;
    }

    // Fade out and remove the card.
    cardEl.style.transition = 'opacity 0.35s';
    cardEl.style.opacity    = '0.2';
    setTimeout(() => cardEl.remove(), 370);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  // Converts a prompt JSONB object into a readable sentence.
  function buildPromptText(prompt) {
    if (!prompt) return '—';
    let text = 'Make a ' + (prompt.subject || '—');
    if (prompt.form)     text += ` as a ${prompt.form}`;
    if (prompt.medium)   text += ` using ${prompt.medium}`;
    if (prompt.category) text += ` (${prompt.category})`;
    return text;
  }
});
