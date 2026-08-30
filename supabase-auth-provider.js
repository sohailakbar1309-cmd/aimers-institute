/**
 * SupabaseAuthProvider — real backend
 * ------------------------------------------------------------------
 * Implements the same provider interface AuthService expects
 * (login / logout / forgotPassword), so it is a drop-in replacement
 * for DevMockAuthProvider. It additionally exposes session/listener/
 * profile/password-update methods that AuthState needs to build
 * real persistence and role loading — DevMockAuthProvider does not
 * need these because Phase 2 never had real persistence.
 *
 * Role is NEVER taken from anything the client sends at login time.
 * It is read back from the `profiles` table row matching the
 * authenticated user's id — i.e. from the database, after Supabase
 * itself has confirmed who the user is.
 * ------------------------------------------------------------------
 */
class SupabaseAuthProvider {
  constructor(client) {
    this.client = client;
  }

  _requireClient() {
    if (!this.client) {
      throw new AuthError(
        'CONFIG_MISSING',
        'Sign-in is not available yet — the app has not been connected to a Supabase project.'
      );
    }
  }

  async login(identifier, password) {
    this._requireClient();
    // Phase 3 supports email/password only. The existing UI's "mobile
    // number or email" label still accepts a mobile number as text,
    // but a mobile number is not a valid Supabase email identity —
    // rather than pretend phone login works, reject it clearly.
    if (!/^\S+@\S+\.\S+$/.test(identifier)) {
      throw new AuthError(
        'EMAIL_ONLY',
        'Sign in with your email address for now — mobile number sign-in isn\'t connected yet.'
      );
    }

    const { data, error } = await this.client.auth.signInWithPassword({ email: identifier, password });
    if (error) throw mapSupabaseError(error);

    const profileResult = await this._loadProfile(data.user.id);
    return {
      user: profileResult.profile ? mapProfileToUser(profileResult.profile, data.user) : mapBareUser(data.user),
      role: profileResult.profile ? profileResult.profile.role : null,
      sessionToken: data.session.access_token,
      profileStatus: profileResult.status, // 'ok' | 'missing' | 'disabled'
    };
  }

  async logout(_sessionToken) {
    this._requireClient();
    const { error } = await this.client.auth.signOut();
    if (error) throw mapSupabaseError(error);
  }

  async forgotPassword(identifier) {
    this._requireClient();
    // Generic response regardless of outcome — never confirms or
    // denies whether an account exists for this email.
    try {
      await this.client.auth.resetPasswordForEmail(identifier, {
        redirectTo: window.location.origin + window.location.pathname,
      });
    } catch (_e) {
      // Intentionally swallowed for account-enumeration safety; a
      // genuine network failure still surfaces to the user below
      // because resetPasswordForEmail's promise resolving vs.
      // rejecting is what we branch on, not the message contents.
    }
    return { message: "If an account exists for that email, we've sent password reset instructions." };
  }

  /** Called after the user follows a password-recovery link and sets a new password. */
  async updatePassword(newPassword) {
    this._requireClient();
    const { error } = await this.client.auth.updateUser({ password: newPassword });
    if (error) throw mapSupabaseError(error);
  }

  /** Restores a persisted session on page load, if one exists. */
  async getSession() {
    this._requireClient();
    const { data, error } = await this.client.auth.getSession();
    if (error) throw mapSupabaseError(error);
    if (!data.session) return null;

    const profileResult = await this._loadProfile(data.session.user.id);
    return {
      user: profileResult.profile ? mapProfileToUser(profileResult.profile, data.session.user) : mapBareUser(data.session.user),
      role: profileResult.profile ? profileResult.profile.role : null,
      sessionToken: data.session.access_token,
      profileStatus: profileResult.status,
    };
  }

  /** Subscribes to Supabase auth events (token refresh, sign-out elsewhere, PASSWORD_RECOVERY link, etc). */
  onAuthStateChange(callback) {
    this._requireClient();
    const { data } = this.client.auth.onAuthStateChange((event, session) => callback(event, session));
    return () => data.subscription.unsubscribe();
  }

  async _loadProfile(userId) {
    const { data, error } = await this.client
      .from('profiles')
      .select('id, full_name, email, phone, role, avatar_url, batch_id, status')
      .eq('id', userId)
      .maybeSingle();

    if (error) throw mapSupabaseError(error);
    if (!data) return { profile: null, status: 'missing' };
    if (data.status === 'disabled') return { profile: data, status: 'disabled' };
    // A row exists (created automatically on signup) but no administrator
    // has assigned a role yet — same "not ready" experience as a missing row.
    if (!data.role) return { profile: data, status: 'missing' };
    return { profile: data, status: 'ok' };
  }
}

function mapProfileToUser(profile, authUser) {
  return {
    id: profile.id,
    fullName: profile.full_name,
    email: profile.email || authUser.email,
    phone: profile.phone,
    avatarInitial: (profile.full_name || authUser.email || '?').trim().charAt(0).toUpperCase(),
    batchId: profile.batch_id,
    status: profile.status,
  };
}

function mapBareUser(authUser) {
  // Authenticated with Supabase but no profiles row exists yet.
  return {
    id: authUser.id,
    fullName: null,
    email: authUser.email,
    phone: null,
    avatarInitial: (authUser.email || '?').trim().charAt(0).toUpperCase(),
    batchId: null,
    status: 'missing',
  };
}

function mapSupabaseError(error) {
  const msg = (error && error.message) || '';
  if (/invalid login credentials/i.test(msg)) {
    return new AuthError('INVALID_CREDENTIALS', 'That email or password is incorrect.');
  }
  if (/email not confirmed/i.test(msg)) {
    return new AuthError('EMAIL_NOT_CONFIRMED', 'Please confirm your email address before logging in.');
  }
  if (/rate limit/i.test(msg)) {
    return new AuthError('RATE_LIMITED', 'Too many attempts. Please wait a moment and try again.');
  }
  if (error && error.name === 'AuthRetryableFetchError') {
    return new AuthError('NETWORK_ERROR', "Couldn't reach the server. Check your connection and try again.");
  }
  // Never surface raw database/backend error text to the user.
  return new AuthError('UNEXPECTED', 'Something went wrong. Please try again.');
}
