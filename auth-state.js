/**
 * AuthState
 * ------------------------------------------------------------------
 * Single centralized store for authentication state. No screen or
 * component keeps its own copy of "am I logged in" / "who is this"
 * — everything reads from here and subscribes to changes.
 *
 * status:
 *   'initializing'   — checking for a persisted session (page just loaded)
 *   'unauthenticated'
 *   'authenticating' — a login attempt is in flight
 *   'authenticated'  — real session + a usable profiles row with a role
 *   'account-issue'  — real session, but no usable role (see profileStatus)
 *   'session-expired'
 *   'error'          — e.g. Supabase not configured yet (see error.code)
 *
 * profileStatus (only meaningful in 'account-issue'):
 *   'missing'  — authenticated but no profiles row exists yet
 *   'disabled' — profiles row exists but status = 'disabled'
 *
 * Phase 3: session persistence is now real (Supabase's own session
 * storage, handled entirely inside supabase-client.js /
 * supabase-auth-provider.js — this file never touches tokens
 * directly), fixing the Phase 2 in-memory-only limitation. The
 * router waits for 'initializing' to resolve before making any
 * redirect decision, so there is no flash-of-login-screen race.
 * ------------------------------------------------------------------
 */
const AuthState = (() => {
  let state = {
    status: 'initializing',
    user: null,
    role: null,
    sessionToken: null,
    profileStatus: null,
    error: null,
  };

  const listeners = new Set();

  function set(partial) {
    state = { ...state, ...partial };
    listeners.forEach(fn => fn(state));
  }

  function applyAuthResult(result) {
    if (result.profileStatus && result.profileStatus !== 'ok') {
      set({
        status: 'account-issue',
        user: result.user,
        role: null,
        sessionToken: result.sessionToken,
        profileStatus: result.profileStatus,
        error: null,
      });
    } else {
      set({
        status: 'authenticated',
        user: result.user,
        role: result.role,
        sessionToken: result.sessionToken,
        profileStatus: 'ok',
        error: null,
      });
    }
  }

  return {
    getState: () => state,
    subscribe(fn) {
      listeners.add(fn);
      fn(state);
      return () => listeners.delete(fn);
    },

    /** Called once at boot. Restores a real persisted session if Supabase has one. */
    async init() {
      set({ status: 'initializing' });
      try {
        const session = await Promise.race([window.AimersAuthService.getSession(), new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 6000))]);
        if (!session) {
          set({ status: 'unauthenticated', user: null, role: null, sessionToken: null, profileStatus: null, error: null });
          return;
        }
        applyAuthResult(session);
      } catch (err) {
        if (err.code === 'CONFIG_MISSING') {
          set({ status: 'error', error: err });
        } else {
          // Fail safe to unauthenticated rather than trapping the user on a broken screen.
          set({ status: 'unauthenticated', user: null, role: null, sessionToken: null, profileStatus: null, error: null });
        }
      }
    },

    async login(identifier, password) {
      set({ status: 'authenticating', error: null });
      try {
        const result = await window.AimersAuthService.login(identifier, password);
        applyAuthResult(result);
        return result;
      } catch (err) {
        set({ status: 'unauthenticated', error: err });
        throw err;
      }
    },

    async logout() {
      const token = state.sessionToken;
      try {
        await window.AimersAuthService.logout(token);
      } finally {
        set({ status: 'unauthenticated', user: null, role: null, sessionToken: null, profileStatus: null, error: null });
      }
    },

    /** Marks the session invalid without a user-initiated logout (e.g. expired/revoked token detected remotely). */
    expireSession() {
      set({ status: 'session-expired', user: null, role: null, sessionToken: null, profileStatus: null, error: { code: 'SESSION_EXPIRED' } });
    },

    isAuthenticated: () => state.status === 'authenticated',
    getRole: () => state.role,
  };
})();
