/**
 * app.js — wires services + state + router to the DOM.
 * No auth logic lives here; this file only reacts to AuthState and
 * calls AuthService/Router/permissions.
 *
 * Provider selection (Phase 3): the real SupabaseAuthProvider is the
 * default. DevMockAuthProvider is only ever used when a developer
 * explicitly sets USE_DEV_MOCK_AUTH = true in js/config.js — the app
 * never silently falls back to fake accounts.
 */
const authProvider = window.AIMERS_CONFIG && window.AIMERS_CONFIG.USE_DEV_MOCK_AUTH
  ? new DevMockAuthProvider()
  : new SupabaseAuthProvider(window.AimersSupabase);

window.AimersAuthService = new AuthService(authProvider);

// ---- Toast ----
let toastTimer;
function showToast(msg) {
  const t = document.getElementById('toast');
  document.getElementById('toast-msg').textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}

// ---- Login form ----
const loginForm = {};

function initLoginForm() {
  loginForm.idEl = document.getElementById('in-id');
  loginForm.passEl = document.getElementById('in-pass');
  loginForm.btn = document.getElementById('login-btn');
  loginForm.btnLabel = document.getElementById('login-btn-label');
  loginForm.spinner = document.getElementById('login-spinner');
  loginForm.errorBox = document.getElementById('login-error');

  document.getElementById('pass-toggle').addEventListener('click', () => {
    const isPass = loginForm.passEl.type === 'password';
    loginForm.passEl.type = isPass ? 'text' : 'password';
    document.getElementById('pass-toggle').textContent = isPass ? 'HIDE' : 'SHOW';
  });

  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await handleLoginSubmit();
  });

  document.getElementById('forgot-link').addEventListener('click', () => Router.go('forgot-password'));
}

function validateLoginFields() {
  let valid = true;
  loginForm.errorBox.hidden = true;

  if (!loginForm.idEl.value.trim()) {
    loginForm.idEl.classList.add('error-state');
    valid = false;
  } else {
    loginForm.idEl.classList.remove('error-state');
  }

  if (!loginForm.passEl.value) {
    loginForm.passEl.classList.add('error-state');
    valid = false;
  } else {
    loginForm.passEl.classList.remove('error-state');
  }

  return valid;
}

async function handleLoginSubmit() {
  if (!validateLoginFields()) return;
  if (loginForm.btn.disabled) return; // prevent duplicate submission

  setLoginLoading(true);
  try {
    await AuthState.login(loginForm.idEl.value.trim(), loginForm.passEl.value);
    loginForm.passEl.value = '';
    routeAfterAuthChange();
  } catch (err) {
    showLoginError(err);
  } finally {
    setLoginLoading(false);
  }
}

function setLoginLoading(isLoading) {
  loginForm.btn.disabled = isLoading;
  loginForm.btnLabel.textContent = isLoading ? 'Logging in…' : 'Log in';
  loginForm.spinner.hidden = !isLoading;
}

function showLoginError(err) {
  loginForm.errorBox.textContent = err.message || 'Something went wrong signing you in. Please try again.';
  loginForm.errorBox.hidden = false;
}

/** After a successful login OR a restored session, send the user wherever their actual state says they belong. */
function routeAfterAuthChange() {
  const { status, profileStatus } = AuthState.getState();
  if (status === 'authenticated') {
    Router.goToOwnDashboard();
    renderDashboardForRole();
    showToast('Logged in successfully');
  } else if (status === 'account-issue') {
    renderAccountIssue(profileStatus);
    Router.renderRaw('account-issue');
  }
}

function renderAccountIssue(profileStatus) {
  const messages = {
    missing: "Your account is authenticated, but your institute profile has not been configured yet. Please contact the institute administrator.",
    disabled: "Your account has been disabled. Please contact the institute administrator if you believe this is a mistake.",
  };
  document.getElementById('account-issue-message').textContent =
    messages[profileStatus] || "There's a problem with your account. Please contact the institute administrator.";
}

// ---- Forgot password form ----
function initForgotPasswordForm() {
  document.getElementById('fp-back').addEventListener('click', () => Router.go('login'));
  document.getElementById('fp-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const emailEl = document.getElementById('fp-email');
    const errorEl = document.getElementById('fp-error');
    const btn = document.getElementById('fp-btn');
    const btnLabel = document.getElementById('fp-btn-label');
    const spinner = document.getElementById('fp-spinner');
    errorEl.hidden = true;

    if (!emailEl.value.trim() || !/^\S+@\S+\.\S+$/.test(emailEl.value.trim())) {
      emailEl.classList.add('error-state');
      errorEl.textContent = 'Enter a valid email address.';
      errorEl.hidden = false;
      return;
    }
    emailEl.classList.remove('error-state');

    btn.disabled = true; btnLabel.textContent = 'Sending…'; spinner.hidden = false;
    try {
      const result = await window.AimersAuthService.forgotPassword(emailEl.value.trim());
      document.getElementById('fp-confirm-message').textContent = result.message;
      Router.renderRaw('forgot-password-sent');
    } catch (err) {
      errorEl.textContent = err.message || 'Could not send reset instructions right now. Please try again.';
      errorEl.hidden = false;
    } finally {
      btn.disabled = false; btnLabel.textContent = 'Send reset instructions'; spinner.hidden = true;
    }
  });
  document.getElementById('fp-sent-done').addEventListener('click', () => Router.go('login'));
}

// ---- Password reset (arrived via Supabase recovery link) ----
function initPasswordResetForm() {
  document.getElementById('pr-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const pw1 = document.getElementById('pr-password');
    const pw2 = document.getElementById('pr-password-confirm');
    const errorEl = document.getElementById('pr-error');
    const btn = document.getElementById('pr-btn');
    const btnLabel = document.getElementById('pr-btn-label');
    const spinner = document.getElementById('pr-spinner');
    errorEl.hidden = true;
    pw1.classList.remove('error-state'); pw2.classList.remove('error-state');

    if (pw1.value.length < 8) {
      pw1.classList.add('error-state');
      errorEl.textContent = 'Password must be at least 8 characters.';
      errorEl.hidden = false;
      return;
    }
    if (pw1.value !== pw2.value) {
      pw2.classList.add('error-state');
      errorEl.textContent = "Passwords don't match.";
      errorEl.hidden = false;
      return;
    }

    btn.disabled = true; btnLabel.textContent = 'Updating…'; spinner.hidden = false;
    try {
      await window.AimersAuthService.updatePassword(pw1.value);
      pw1.value = ''; pw2.value = '';
      showToast('Password updated — you can log in with it now');
      Router.renderRaw('login');
    } catch (err) {
      errorEl.textContent = err.message || 'Could not update your password right now. Please try again.';
      errorEl.hidden = false;
    } finally {
      btn.disabled = false; btnLabel.textContent = 'Update password'; spinner.hidden = true;
    }
  });
}

// ---- Role-based dashboard + nav rendering ----
function renderDashboardForRole() {
  const { role, user } = AuthState.getState();
  if (!role) return;

  document.querySelectorAll('[data-role-tag]').forEach(el => { el.textContent = ROLE_LABEL[role]; });
  document.querySelectorAll('[data-avatar-initial]').forEach(el => { el.textContent = (user && user.avatarInitial) || '?'; });
  document.querySelectorAll('[data-user-name]').forEach(el => { el.textContent = (user && user.fullName) || '—'; });
  document.querySelectorAll('[data-user-email]').forEach(el => { el.textContent = (user && user.email) || '—'; });

  const h = new Date().getHours();
  const tag = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  document.querySelectorAll('[data-greeting]').forEach(el => { el.textContent = tag; });

  buildNav(role);
}

function buildNav(role) {
  const items = ROLE_NAV[role] || [];
  document.querySelectorAll('.bottom-nav').forEach(nav => {
    nav.innerHTML = items.map(item => `
      <button class="nav-item" data-nav="${item.key}" onclick="handleNavClick('${item.key}')">
        <svg><use href="#${item.icon}"></use></svg>
        <span>${item.label}</span>
      </button>
    `).join('');
  });
}

function handleNavClick(key) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.nav === key));
  if (key === 'home') return;
  if (key === 'profile') return Router.go('profile');
  showToast(key.charAt(0).toUpperCase() + key.slice(1) + ' module coming in a later phase');
}

// ---- Logout confirmation modal ----
function initLogoutFlow() {
  document.getElementById('profile-logout-row').addEventListener('click', () => {
    document.getElementById('logout-modal').classList.add('show');
  });
  document.getElementById('logout-cancel').addEventListener('click', () => {
    document.getElementById('logout-modal').classList.remove('show');
  });
  document.getElementById('logout-confirm').addEventListener('click', async () => {
    const btn = document.getElementById('logout-confirm');
    btn.disabled = true;
    try {
      await AuthState.logout();
      Router.renderRaw('welcome');
      showToast("You've been logged out");
    } catch (err) {
      showToast(err.message || 'Could not log out right now. Please try again.');
    } finally {
      btn.disabled = false;
      document.getElementById('logout-modal').classList.remove('show');
    }
  });
}

// ---- Remote auth events (token refresh, sign-out elsewhere, password-recovery link) ----
function initAuthListener() {
  window.AimersAuthService.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') {
      Router.renderRaw('password-reset');
    } else if (event === 'SIGNED_OUT' && AuthState.getState().status === 'authenticated') {
      AuthState.expireSession();
      Router.renderRaw('session-expired');
    }
  });
}

// ---- Boot sequence ----
async function boot() {
  Router.renderRaw('splash');
  await AuthState.init();
  const { status } = AuthState.getState();

  setTimeout(() => {
    if (status === 'authenticated') {
      Router.goToOwnDashboard();
      renderDashboardForRole();
    } else if (status === 'account-issue') {
      renderAccountIssue(AuthState.getState().profileStatus);
      Router.renderRaw('account-issue');
    } else if (status === 'error') {
      document.getElementById('config-error-message').textContent =
        AuthState.getState().error.message || 'The app is not connected to a backend yet.';
      Router.renderRaw('config-error');
    } else {
      Router.renderRaw('welcome');
    }
  }, 900);
}

document.addEventListener('DOMContentLoaded', () => {
  initLoginForm();
  initForgotPasswordForm();
  initPasswordResetForm();
  initLogoutFlow();
  try { initAuthListener(); } catch (e) { console.warn('Auth listener failed:', e); }

  document.getElementById('welcome-login-btn').addEventListener('click', () => Router.go('login'));
  document.getElementById('login-back').addEventListener('click', () => Router.go('welcome'));
  document.getElementById('session-expired-login-btn').addEventListener('click', () => Router.go('login'));
  document.getElementById('access-restricted-back-btn').addEventListener('click', () => Router.goToOwnDashboard());
  document.getElementById('account-issue-logout-btn').addEventListener('click', async () => {
    await AuthState.logout();
    Router.renderRaw('welcome');
  });

  boot();
});
