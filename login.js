// login.js — handles sign-in and account creation via Supabase Auth.
//
// Two forms live on login.html, toggled by the tab buttons:
//   • Sign In  — username + password.
//   • Register — username + password.
//
// Supabase Auth requires an email address internally.  We generate a fixed
// internal email from the username (username@art-rando.local) that is never
// shown to the user.
//
// NOTE: Email confirmation must be disabled in the Supabase dashboard
// (Authentication → Settings → uncheck "Enable email confirmations") because
// the internal email address is not a real deliverable inbox.
//
// Depends on: supabase.js (_sb), auth.js (initAuth, getSession)
// ─────────────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {

  await initAuth();

  // Skip the login page entirely if the user is already signed in.
  if (getSession()?.loggedIn) {
    window.location.href = 'index.html';
    return;
  }

  // ── DOM refs ────────────────────────────────────────────────────────────────
  const tabSignin     = document.getElementById('tab-signin');
  const tabRegister   = document.getElementById('tab-register');
  const signinForm    = document.getElementById('signin-form');
  const registerForm  = document.getElementById('register-form');
  const signinError   = document.getElementById('signin-error');
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

    const username = signinForm.elements.username.value.trim();
    const password = signinForm.elements.password.value;

    if (!username || !password) {
      showError(signinError, 'Please enter your username and password.');
      return;
    }

    siSubmitBtn.disabled    = true;
    siSubmitBtn.textContent = 'Signing in…';
    hideError(signinError);

    // Resolve the auth email: if the input contains @ use it directly as an email.
    // Otherwise look up the profile row to get the stored auth_email for that username.
    let authEmail;
    if (username.includes('@')) {
      authEmail = username;
    } else {
      const { data: profile } = await _sb
        .from('profiles')
        .select('auth_email')
        .eq('username', username)
        .single();
      authEmail = profile?.auth_email ?? internalEmail(username);
    }

    const { error } = await _sb.auth.signInWithPassword({ email: authEmail, password });

    if (error) {
      showError(signinError, 'Incorrect username or password.');
      siSubmitBtn.disabled    = false;
      siSubmitBtn.textContent = 'Sign In';
    } else {
      window.location.href = 'index.html';
    }
  });

  // ── Register form ────────────────────────────────────────────────────────────
  const regSubmitBtn = registerForm.querySelector('button[type="submit"]');

  registerForm.addEventListener('submit', async e => {
    e.preventDefault();

    const username = registerForm.elements.username.value.trim();
    const password = registerForm.elements.password.value;

    if (!username || !password) {
      showError(registerError, 'Please fill in your username and password.');
      return;
    }
    if (password.length < 6) {
      showError(registerError, 'Password must be at least 6 characters.');
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      showError(registerError, 'Username can only contain letters, numbers, and underscores.');
      return;
    }

    regSubmitBtn.disabled    = true;
    regSubmitBtn.textContent = 'Checking username…';
    hideError(registerError);

    // Check availability before creating an auth user — case-insensitive so
    // "EJ" and "ej" are treated as the same name.
    const { data: existing } = await _sb
      .from('profiles')
      .select('id')
      .ilike('username', username)
      .maybeSingle();

    if (existing) {
      showError(registerError, 'That username is already taken.');
      regSubmitBtn.disabled    = false;
      regSubmitBtn.textContent = 'Create Account';
      return;
    }

    regSubmitBtn.textContent = 'Creating account…';

    // Build metadata — full_name is what the Supabase dashboard shows as display name.
    const metadata = { username, full_name: username };

    const { data, error } = await _sb.auth.signUp({
      email:    internalEmail(username),
      password,
      options:  { data: metadata },
    });

    if (error) {
      showError(registerError, error.message || 'Registration failed. Please try again.');
      regSubmitBtn.disabled    = false;
      regSubmitBtn.textContent = 'Create Account';
      return;
    }

    // Write the profile row so the admin page and gallery can display the username.
    // auth_email is stored here so username-based sign-in can look it up later.
    if (data.user) {
      const { error: profileErr } = await _sb.from('profiles').insert({
        id:         data.user.id,
        username:   username,
        auth_email: internalEmail(username),
      });
      if (profileErr) {
        console.error('Profile insert failed:', profileErr);
      }
    }

    if (data.session) {
      // Email confirmation is disabled — signed in immediately.
      window.location.href = 'index.html';
    } else {
      // Email confirmation is still on in the Supabase dashboard.
      // Disable it at Authentication → Settings → "Enable email confirmations".
      regSubmitBtn.textContent = 'Account created!';
      showSuccess(registerError, 'Your account was created. Sign in to continue.');
    }
  });

  // ── Helpers ──────────────────────────────────────────────────────────────────

  // Derives a consistent internal Supabase auth email from a username.
  // Users never see this address — it only exists to satisfy Supabase's
  // email requirement.
  function internalEmail(username) {
    return username.toLowerCase() + '@art-rando.local';
  }

  function showError(el, msg) {
    el.textContent = msg;
    el.style.color = '';
    el.classList.remove('hidden');
  }

  function showSuccess(el, msg) {
    el.textContent = msg;
    el.style.color = 'var(--accent-teal)';
    el.classList.remove('hidden');
  }

  function hideError(el) {
    el.classList.add('hidden');
  }
});
