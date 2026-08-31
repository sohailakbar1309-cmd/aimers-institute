/**
 * Router
 * ------------------------------------------------------------------
 * Guards screen navigation using AuthState — the single source of
 * truth for auth status and role. This is a UX convenience layer
 * only: it prevents an authenticated Student from casually tapping
 * into an Admin screen client-side, but it is NOT a security
 * boundary. Real authorization must be enforced by the backend on
 * every request regardless of what this router allows on-screen.
 *
 * SCREEN_CONFIG.access:
 *   'public'        -> anyone
 *   'auth-only'      -> must be authenticated, any role
 *   ['student', ...] -> must be authenticated AND role in this list
 * ------------------------------------------------------------------
 */
const SCREEN_CONFIG = Object.freeze({
  boot: { access: 'public' },
  splash: { access: 'public' },
  welcome: { access: 'public' },
  login: { access: 'public' },
  'forgot-password': { access: 'public' },
  'password-reset': { access: 'public' }, // reachable only via a genuine Supabase recovery-link event, not by guessing the URL
  'session-expired': { access: 'public' },
  'access-restricted': { access: 'public' },
  'account-issue': { access: 'public' }, // rendered only right after a real authenticated session comes back with no usable role

  'dashboard-student': { access: ['student'] },
  'dashboard-teacher': { access: ['teacher'] },
  'dashboard-admin': { access: ['admin'] },
  profile: { access: 'auth-only' },

  'student-profile': { access: ['student'] },
  'admin-student-list': { access: ['admin'] },
  'admin-student-add': { access: ['admin'] },
  'admin-student-detail': { access: ['admin'] },
});

const Router = (() => {
  let currentScreen = 'boot';

  function roleDashboard(role) {
    return { student: 'dashboard-student', teacher: 'dashboard-teacher', admin: 'dashboard-admin' }[role] || 'login';
  }

  function render(name) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const el = document.getElementById('screen-' + name);
    if (!el) return;
    el.classList.add('active');
    currentScreen = name;
    document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.nav === name.replace('dashboard-', '')));
  }

  return {
    getCurrentScreen: () => currentScreen,

    /** Main navigation entry point — every screen change should go through this. */
    go(name) {
      const config = SCREEN_CONFIG[name];
      if (!config) return;
      const { status, role } = AuthState.getState();

      // Never redirect while the initial session check is still in
      // flight — that race is exactly what caused Phase 2's flash-
      // of-login-screen risk. app.js's boot() owns navigation until
      // AuthState.init() resolves; Router.go() simply refuses to act.
      if (status === 'initializing') return;

      if (config.access === 'public') return render(name);

      if (status !== 'authenticated') {
        return render('login');
      }

      if (config.access === 'auth-only') return render(name);

      if (Array.isArray(config.access) && !config.access.includes(role)) {
        return render('access-restricted');
      }

      render(name);
    },

    /** Sends an authenticated user to the dashboard for their own role. */
    goToOwnDashboard() {
      const { role } = AuthState.getState();
      render(roleDashboard(role));
    },

    renderRaw: render, // for boot/splash/session-expired transitions that bypass guarding
  };
})();
