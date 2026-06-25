// admin.js — moderation panel for reviewing gallery submissions.
//
// Access:
//   Only users whose row in public.profiles has is_admin = true can use this
//   page.  To grant admin access, open the Supabase dashboard, go to the
//   Table Editor → profiles, find your user row, and set is_admin = true.
//
// Workflow:
//   All posts are shown newest-first with a status badge (pending / approved /
//   rejected).  Pending posts have Approve and Reject buttons.  Rejected posts
//   show the reason returned by the auto-moderator.
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

  // ── Tab switching ──────────────────────────────────────────────────────────
  const tabQueue = document.getElementById('tab-queue');
  const tabBugs  = document.getElementById('tab-bugs');

  tabQueue.addEventListener('click', () => {
    tabQueue.classList.add('gallery-tab--active');
    tabBugs.classList.remove('gallery-tab--active');
    loadAll();
  });

  tabBugs.addEventListener('click', () => {
    tabBugs.classList.add('gallery-tab--active');
    tabQueue.classList.remove('gallery-tab--active');
    loadBugReports();
  });

  // ── Manual weekly cleanse button ───────────────────────────────────────────
  document.getElementById('cleanse-btn').addEventListener('click', async () => {
    if (!confirm('Delete all gallery posts older than 7 days? This cannot be undone.')) return;
    await runCleanse();
  });

  // ── Load all posts ─────────────────────────────────────────────────────────
  loadAll();

  async function loadAll() {
    content.innerHTML = '<p class="gallery-loading">Loading posts…</p>';

    const { data: posts, error } = await _sb
      .from('gallery_posts')
      .select('*')
      .order('created_at', { ascending: false });  // newest first

    if (error) {
      content.innerHTML = '<p class="gallery-error">Failed to load posts.</p>';
      return;
    }

    if (!posts || posts.length === 0) {
      content.innerHTML = '<p class="gallery-loading" style="text-align:center;padding:4rem 0">No posts yet.</p>';
      return;
    }

    const pending  = posts.filter(p => p.status === 'pending').length;
    const approved = posts.filter(p => p.status === 'approved').length;
    const rejected = posts.filter(p => p.status === 'rejected').length;

    const summary = document.createElement('p');
    summary.className        = 'gallery-img-meta';
    summary.style.marginBottom = '1rem';
    summary.textContent = `${posts.length} total — ${pending} pending · ${approved} approved · ${rejected} rejected`;

    const grid = document.createElement('div');
    grid.className = 'gallery-img-grid';

    posts.forEach(post => grid.appendChild(buildCard(post)));

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

    // Status badge.
    const badge = document.createElement('span');
    badge.textContent = post.status;
    badge.style.cssText = [
      'display:inline-block',
      'font-size:0.7rem',
      'font-weight:600',
      'letter-spacing:0.05em',
      'text-transform:uppercase',
      'padding:0.2rem 0.55rem',
      'border-radius:999px',
      'margin-bottom:0.4rem',
      post.status === 'approved' ? 'background:rgba(52,211,153,0.15);color:#34d399;'
        : post.status === 'rejected' ? 'background:rgba(248,113,113,0.15);color:#f87171;'
        : 'background:rgba(251,191,36,0.15);color:#fbbf24;',
    ].join(';');

    // Artist name and submission date.
    const meta = document.createElement('p');
    meta.className   = 'gallery-img-meta';
    meta.textContent = `${post.username} · ${new Date(post.created_at).toLocaleDateString()}`;

    // The prompt the user was given for this artwork.
    const promptEl = document.createElement('p');
    promptEl.className   = 'gallery-img-prompt';
    promptEl.textContent = buildPromptText(post.prompt);

    caption.appendChild(badge);
    caption.appendChild(meta);
    caption.appendChild(promptEl);

    // Rejection reason — shown only on rejected posts.
    if (post.status === 'rejected' && post.rejection_reason) {
      const reason = document.createElement('p');
      reason.style.cssText = 'font-size:0.78rem;color:#f87171;margin-top:0.25rem;';
      reason.textContent   = 'Rejected: ' + post.rejection_reason;
      caption.appendChild(reason);
    }

    // Action buttons — approve/reject only on pending; delete on all.
    const actions = document.createElement('div');
    actions.className = 'admin-card-actions';

    if (post.status === 'pending') {
      const approveBtn = document.createElement('button');
      approveBtn.textContent   = 'Approve';
      approveBtn.className     = 'btn btn--spin';
      approveBtn.style.cssText = 'font-size:0.78rem;padding:0.4rem 1rem;';
      approveBtn.addEventListener('click', () => setStatus(post.id, 'approved', card));

      const rejectBtn = document.createElement('button');
      rejectBtn.textContent   = 'Reject';
      rejectBtn.className     = 'btn btn--close-sheet';
      rejectBtn.style.cssText = 'font-size:0.78rem;padding:0.4rem 1rem;color:var(--accent);border-color:var(--accent);';
      rejectBtn.addEventListener('click', () => setStatus(post.id, 'rejected', card));

      actions.appendChild(approveBtn);
      actions.appendChild(rejectBtn);
    }

    if (post.status === 'rejected') {
      const approveBtn = document.createElement('button');
      approveBtn.textContent   = 'Approve';
      approveBtn.className     = 'btn btn--spin';
      approveBtn.style.cssText = 'font-size:0.78rem;padding:0.4rem 1rem;';
      approveBtn.addEventListener('click', () => setStatus(post.id, 'approved', card));
      actions.appendChild(approveBtn);
    }

    // Delete button — permanently removes the image from Storage and the DB row.
    const deleteBtn = document.createElement('button');
    deleteBtn.textContent   = 'Delete';
    deleteBtn.className     = 'btn btn--edit';
    deleteBtn.style.cssText = 'font-size:0.78rem;padding:0.4rem 1rem;color:var(--text-muted);';
    deleteBtn.addEventListener('click', () => deletePost(post, card));
    actions.appendChild(deleteBtn);

    caption.appendChild(actions);
    card.appendChild(img);
    card.appendChild(caption);
    return card;
  }

  // ── Set status (approve or reject) ────────────────────────────────────────
  // Updates the post status and reviewed_at timestamp, then fades out the card.
  // Clears rejection_reason when manually approving so stale reasons don't linger.
  async function setStatus(postId, status, cardEl) {
    const update = { status, reviewed_at: new Date().toISOString() };
    if (status === 'approved') update.rejection_reason = null;

    const { error } = await _sb
      .from('gallery_posts')
      .update(update)
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

  // ── Bug reports ───────────────────────────────────────────────────────────
  // Fetches all submitted bug reports newest-first and renders a simple list.
  async function loadBugReports() {
    content.innerHTML = '<p class="gallery-loading">Loading bug reports…</p>';

    const { data: reports, error } = await _sb
      .from('bug_reports')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      content.innerHTML = '<p class="gallery-error">Failed to load bug reports.</p>';
      return;
    }

    if (!reports || reports.length === 0) {
      content.innerHTML = '<p class="gallery-loading" style="text-align:center;padding:4rem 0">No bug reports yet.</p>';
      return;
    }

    const summary = document.createElement('p');
    summary.className = 'gallery-img-meta';
    summary.style.marginBottom = '1rem';
    summary.textContent = `${reports.length} report${reports.length !== 1 ? 's' : ''}`;

    const list = document.createElement('div');
    list.style.cssText = 'display:flex;flex-direction:column;gap:0.75rem;';

    reports.forEach(report => {
      const row = document.createElement('div');
      row.className = 'gallery-img-card';
      row.style.cssText = 'padding:1rem 1.2rem;display:flex;flex-direction:column;gap:0.4rem;';

      // Who submitted it and when
      const meta = document.createElement('p');
      meta.className   = 'gallery-img-meta';
      meta.textContent = `${report.username || 'Anonymous'} · ${new Date(report.created_at).toLocaleString()}`;

      // The bug description
      const desc = document.createElement('p');
      desc.style.cssText  = 'color:var(--text);white-space:pre-wrap;word-break:break-word;';
      desc.textContent = report.description;

      // Page URL where the bug occurred
      const url = document.createElement('p');
      url.className   = 'gallery-img-meta';
      url.textContent = report.page_url || '';

      // Delete button — removes the report from the DB
      const delBtn = document.createElement('button');
      delBtn.className   = 'btn btn--edit';
      delBtn.style.cssText = 'font-size:0.78rem;padding:0.35rem 0.9rem;align-self:flex-end;color:var(--text-muted);';
      delBtn.textContent = 'Dismiss';
      delBtn.addEventListener('click', async () => {
        delBtn.disabled = true;
        const { error: delErr } = await _sb.from('bug_reports').delete().eq('id', report.id);
        if (delErr) { delBtn.disabled = false; return; }
        // Fade out and remove the row
        row.style.transition = 'opacity 0.35s';
        row.style.opacity    = '0.2';
        setTimeout(() => row.remove(), 370);
      });

      row.appendChild(meta);
      row.appendChild(desc);
      if (report.page_url) row.appendChild(url);
      row.appendChild(delBtn);
      list.appendChild(row);
    });

    content.innerHTML = '';
    content.appendChild(summary);
    content.appendChild(list);
  }

  // ── Weekly cleanse ─────────────────────────────────────────────────────────
  // Deletes all posts older than 7 days and removes their Storage images.
  // Mirrors the automated Edge Function so admins can also trigger it on demand.
  async function runCleanse() {
    const cleanseBtn = document.getElementById('cleanse-btn');
    cleanseBtn.disabled = true;
    cleanseBtn.textContent = 'Cleansing…';

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);

    // Fetch old posts so we can remove their Storage files.
    const { data: old, error: fetchErr } = await _sb
      .from('gallery_posts')
      .select('id, image_path')
      .lt('created_at', cutoff.toISOString());

    if (fetchErr) {
      alert('Could not fetch old posts: ' + fetchErr.message);
      cleanseBtn.disabled = false;
      cleanseBtn.textContent = 'Run Weekly Cleanse';
      return;
    }

    if (!old || old.length === 0) {
      alert('Nothing to cleanse — no posts older than 7 days.');
      cleanseBtn.disabled = false;
      cleanseBtn.textContent = 'Run Weekly Cleanse';
      return;
    }

    // Delete Storage files (best-effort — missing files are not an error).
    const paths = old.map(p => p.image_path);
    await _sb.storage.from('gallery-images').remove(paths);

    // Delete DB rows.
    const ids = old.map(p => p.id);
    const { error: deleteErr } = await _sb
      .from('gallery_posts')
      .delete()
      .in('id', ids);

    if (deleteErr) {
      alert('Could not delete posts: ' + deleteErr.message);
      cleanseBtn.disabled = false;
      cleanseBtn.textContent = 'Run Weekly Cleanse';
      return;
    }

    alert(`Cleanse complete — ${old.length} post${old.length !== 1 ? 's' : ''} removed.`);
    cleanseBtn.disabled = false;
    cleanseBtn.textContent = 'Run Weekly Cleanse';

    // Refresh whichever tab is currently active.
    if (tabQueue.classList.contains('gallery-tab--active')) loadAll();
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
