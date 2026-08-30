/**
 * DevMockAuthProvider — DEVELOPMENT/TESTING ONLY
 * ------------------------------------------------------------------
 * ⚠️ This file must be deleted (and replaced with a real provider,
 * e.g. FirebaseAuthProvider / SupabaseAuthProvider / a REST-API
 * provider) before this application is connected to production
 * data or deployed. It exists only so the auth UI in Phase 2 can
 * be exercised end-to-end without a backend configured yet.
 *
 * - No real users, passwords, or institute data live here.
 * - Test accounts below are obviously fake (.test email domain).
 * - Simulates network latency and realistic failure modes so the
 *   UI's loading/error states are genuinely tested.
 * - Role is decided here, on the "server" side of this mock — the
 *   login form never sends or lets the user pick a role, matching
 *   how a real backend would authorize the role.
 * ------------------------------------------------------------------
 */
const DEV_TEST_ACCOUNTS = Object.freeze([
  { identifier: 'dev.student@aimers.test', password: 'DevStudent#1', role: 'student',
    user: { id: 'dev-s-01', fullName: 'Dev Student', email: 'dev.student@aimers.test', phone: null, avatarInitial: 'S', batchId: 'DEV-BATCH-A', status: 'active' } },
  { identifier: 'dev.teacher@aimers.test', password: 'DevTeacher#1', role: 'teacher',
    user: { id: 'dev-t-01', fullName: 'Dev Teacher', email: 'dev.teacher@aimers.test', phone: null, avatarInitial: 'T', batchId: null, status: 'active' } },
  { identifier: 'dev.admin@aimers.test', password: 'DevAdmin#1', role: 'admin',
    user: { id: 'dev-a-01', fullName: 'Dev Admin', email: 'dev.admin@aimers.test', phone: null, avatarInitial: 'A', batchId: null, status: 'active' } },
]);

function delay(ms) { return new Promise(res => setTimeout(res, ms)); }

class DevMockAuthProvider {
  async login(identifier, password) {
    await delay(700 + Math.random() * 400); // simulate network round-trip

    if (Math.random() < 0.03) {
      // Occasionally simulate a network/backend failure so the
      // "network error, please retry" state is genuinely reachable.
      throw new AuthError('NETWORK_ERROR', "Couldn't reach the server. Check your connection and try again.");
    }

    const match = DEV_TEST_ACCOUNTS.find(
      a => a.identifier.toLowerCase() === String(identifier).toLowerCase() && a.password === password
    );

    if (!match) {
      throw new AuthError('INVALID_CREDENTIALS', 'That login ID or password is incorrect.');
    }

    return {
      user: match.user,
      role: match.role,
      sessionToken: 'dev-session-' + Math.random().toString(36).slice(2),
    };
  }

  async logout(_sessionToken) {
    await delay(250);
    return;
  }

  async forgotPassword(_identifier) {
    await delay(600);
    // Generic response regardless of whether the identifier matches
    // a known account — never confirms or denies account existence.
    return { message: "If an account exists for that email, we've sent password reset instructions." };
  }
}
