// login.js — handles sign-in and account creation via Supabase Auth.
//
// Two forms live on login.html, toggled by the tab buttons:
//   • Sign In    — email + password, signs the user into an existing account.
//   • Register   — email + username + password, creates a new account and
//                  inserts a row into the public.profiles table.
//
// On success both flows redirect to index.html.
// If Supabase requires email confirmation (Supabase dashboard default), the
// register flow shows a "check your email" message instead of redirecting.
//
// Depends on: supabase.js (_sb), auth.js (initAuth, getSession)
// ─────────────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {

  // Initialize the session cache before checking whether to redirect.
  await initAuth();

  // Skip the login page entirely if the user is already signed in.
  if (getSession()?.loggedIn) {
    window.location.href = 'index.html';
    return;
  }

  // ── DOM refs ────────────────────────────────────────────────────────────────
  const tabSignin    = document.getElementById('tab-signin');
  const tabRegister  = document.getElementById('tab-register');
  const signinForm   = document.getElementById('signin-form');
  const registerForm = document.getElementById('register-form');
  const signinError  = document.getElementById('signin-error');
  const registerError = document.getElementById('register-error');

  // ── Tab switching ────────────────────────────────────────────────────────────
  tabSignin.addEventListener('click', () => {
    tabSignin.classList.add('login-tab--active');
    tabRegister.classList.remove('login-tab--active');
    signinForm.classList.remove('hidden');
    registerForm.classList.add('hidden');
    hideError(signinError);
    hideError(registerError);
  });

  tabRegister.addEventListener('click', () => {
    tabRegister.classList.add('login-tab--active');
    tabSignin.classList.remove('login-tab--active');
    registerForm.classList.remove('hidden');
    signinForm.classList.add('hidden');
    hideError(signinError);
    hideError(registerError);
  });

  // ── Sign-in form ─────────────────────────────────────────────────────────────
  const siSubmitBtn = signinForm.querySelector('button[type="submit"]');

  signinForm.addEventListener('submit', async e => {
    e.preventDefault();

    const email    = signinForm.elements.email.value.trim();
    const password = signinForm.elements.password.value;

    // Basic client-side guard before hitting the network.
    if (!email || !password) {
      showError(signinError, 'Please enter your email and password.');
      return;
    }

    siSubmitBtn.disabled    = true;
    siSubmitBtn.textContent = 'Signing in…';
    hideError(signinError);

    const { error } = await _sb.auth.signInWithPassword({ email, password });

    if (error) {
      showError(signinError, error.message || 'Sign-in failed. Please try again.');
      siSubmitBtn.disabled    = false;
      siSubmitBtn.textContent = 'Sign In';
    } else {
      // Supabase updates the session automatically; redirect immediately.
      window.location.href = 'index.html';
    }
  });

  // ── Register form ────────────────────────────────────────────────────────────
  const regSubmitBtn = registerForm.querySelector('button[type="submit"]');

  registerForm.addEventListener('submit', async e => {
    e.preventDefault();

    const email    = registerForm.elements.email.value.trim();
    const username = registerForm.elements.username.value.trim();
    const password = registerForm.elements.password.value;

    // Client-side validation before touching Supabase.
    if (!email || !username || !password) {
      showError(registerError, 'Please fill in all fields.');
      return;
    }
    if (password.length < 6) {
      showError(registerError, 'Password must be at least 6 characters.');
      return;
    }
    // Only allow letters, numbers, and underscores in usernames.
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      showError(registerError, 'Username can only contain letters, numbers, and underscores.');
      return;
    }

    regSubmitBtn.disabled    = true;
    regSubmitBtn.textContent = 'Creating account…';
    hideError(registerError);

    // Create the Supabase Auth user.  The username is stored in user_metadata so
    // getSession() can read it without a separate profiles query.
    const { data, error } = await _sb.auth.signUp({
      email,
      password,
      options: { data: { username } },
    });

    if (error) {
      showError(registerError, error.message || 'Registration failed. Please try again.');
      regSubmitBtn.disabled    = false;
      regSubmitBtn.textContent = 'Create Account';
      return;
    }

    // Write the profile row so the admin page and gallery can display the username.
    if (data.user) {
      const { error: profileErr } = await _sb.from('profiles').insert({
        id:       data.user.id,
        username: username,
      });
      // Ignore 23505 (unique violation) — happens if the user re-registers with
      // the same email after email confirmation without signing in.
      if (profileErr && profileErr.code !== '23505') {
        console.error('Profile insert failed:', profileErr);
      }
    }

    if (data.session) {
      // Email confirmation is disabled — the user is signed in immediately.
      window.location.href = 'index.html';
    } else {
      // Supabase requires email confirmation (default for new projects).
      // Show a success message and let the user know to check their inbox.
      regSubmitBtn.textContent = 'Account created!';
      showSuccess(registerError, 'Check your email to confirm your account, then sign in.');
    }
  });

  // ── Helpers ──────────────────────────────────────────────────────────────────

  // Shows an error message in the given element.
  function showError(el, msg) {
    el.textContent  = msg;
    el.style.color  = '';        // reset any previous success colour
    el.classList.remove('hidden');
  }

  // Shows a success / info message (teal) in the given element.
  function showSuccess(el, msg) {
    el.textContent  = msg;
    el.style.color  = 'var(--accent-teal)';
    el.classList.remove('hidden');
  }

  // Hides the error / message element.
  function hideError(el) {
    el.classList.add('hidden');
  }
});
