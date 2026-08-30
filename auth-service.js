/**
 * AuthService
 * ------------------------------------------------------------------
 * Backend-agnostic authentication service.
 *
 * This file must never contain real credentials, fake user records,
 * or backend-specific code. It only knows how to talk to a
 * "provider" object that implements:
 *
 *   provider.login(identifier, password) -> Promise<{ user, role, sessionToken }>
 *   provider.logout(sessionToken)        -> Promise<void>
 *   provider.forgotPassword(identifier)  -> Promise<{ message }>
 *
 * Swap the provider in app.js to connect a real backend
 * (e.g. Firebase Auth, Supabase Auth, a custom REST API) without
 * touching this file, AuthState, the router, or any screen markup.
 *
 * Phase 2 status: no real backend is configured yet, so app.js
 * currently injects DevMockAuthProvider (see dev-mock-provider.js,
 * a separate, clearly-isolated, development-only file). Nothing in
 * this file depends on that provider being a mock — it would work
 * identically against a real one.
 * ------------------------------------------------------------------
 */
class AuthService {
  constructor(provider) {
    if (!provider) throw new Error('AuthService requires an auth provider.');
    this.provider = provider;
  }

  /**
   * Attempts to authenticate. Never resolves with a "success" unless
   * the provider genuinely confirms one. Throws on any failure so
   * callers must handle the error state explicitly.
   */
  async login(identifier, password) {
    if (!identifier || !password) {
      throw new AuthError('MISSING_FIELDS', 'Enter your login ID and password.');
    }
    return this.provider.login(identifier, password);
  }

  async logout(sessionToken) {
    return this.provider.logout(sessionToken);
  }

  /**
   * Returns a generic confirmation regardless of whether the account
   * exists, to avoid revealing account existence to an attacker.
   */
  async forgotPassword(identifier) {
    if (!identifier) {
      throw new AuthError('MISSING_FIELDS', 'Enter the email linked to your account.');
    }
    return this.provider.forgotPassword(identifier);
  }

  /** Sets a new password after the user arrives via a password-recovery link. Not all providers support this. */
  async updatePassword(newPassword) {
    if (!newPassword || newPassword.length < 8) {
      throw new AuthError('WEAK_PASSWORD', 'Password must be at least 8 characters.');
    }
    if (typeof this.provider.updatePassword !== 'function') {
      throw new AuthError('UNSUPPORTED', 'Password reset is not available with the current sign-in method.');
    }
    return this.provider.updatePassword(newPassword);
  }

  /** Restores a persisted session on load. Providers without real persistence (e.g. the dev mock) may omit this. */
  async getSession() {
    if (typeof this.provider.getSession !== 'function') return null;
    return this.provider.getSession();
  }

  /** Subscribes to provider-level auth events (token refresh, remote sign-out, password-recovery link). Returns an unsubscribe function, or a no-op if unsupported. */
  onAuthStateChange(callback) {
    if (typeof this.provider.onAuthStateChange !== 'function') return () => {};
    return this.provider.onAuthStateChange(callback);
  }
}

class AuthError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code; // e.g. 'INVALID_CREDENTIALS' | 'NETWORK_ERROR' | 'MISSING_FIELDS'
  }
}
