// auth.js — session helpers backed by Supabase Auth.
//
// ── Usage ────────────────────────────────────────────────────────────────────
//
//   1. Call `await initAuth()` once at the top of your DOMContentLoaded handler.
//      This populates the internal session cache and subscribes to future changes.
//
//   2. After that, call `getSession()` synchronously anywhere to read the
//      current user.  It returns null when not signed in.
//
//   3. Call `clearSession()` to sign the user out (async, fire-and-forget is fine).
//
// Depends on: supabase.js (_sb must be defined before this script loads)
// ─────────────────────────────────────────────────────────────────────────────

// Internal cache — populated by initAuth() and kept fresh by onAuthStateChange.
let _session = null;

// Fetches the current session from Supabase and starts listening for auth events.
// Must be awaited before getSession() is reliable.
async function initAuth() {
  const { data: { session } } = await _sb.auth.getSession();
  _session = session;

  // Keep the cache in sync whenever the user signs in, signs out, or the
  // token is silently refreshed in the background.
  _sb.auth.onAuthStateChange((_event, session) => {
    _session = session;
  });
}

// Returns a plain session object, or null if the user is not signed in.
// Sync — safe to call anywhere after initAuth() has resolved.
function getSession() {
  if (!_session) return null;
  return {
    loggedIn: true,
    userId:   _session.user.id,
    // Prefer the username stored in user_metadata (set during registration).
    user:     _session.user.user_metadata?.username || _session.user.email,
    email:    _session.user.email,
  };
}

// Signs the user out via Supabase.  Returns a Promise; awaiting is optional.
async function clearSession() {
  await _sb.auth.signOut();
}

