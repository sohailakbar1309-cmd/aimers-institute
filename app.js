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

  if (role === 'student') loadStudentDashboardBatchCard();
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
  if (key === 'students' && AuthState.getState().role === 'admin') {
    Router.go('admin-student-list');
    loadAdminStudentList(0);
    return;
  }
  showToast(key.charAt(0).toUpperCase() + key.slice(1) + ' module coming in a later phase');
}

// ---- Student dashboard "My batch" card ----
function loadStudentDashboardBatchCard() {
  const { user } = AuthState.getState();
  const nameEl = document.getElementById('sd-batch-name');
  const subEl = document.getElementById('sd-batch-sub');
  if (!user || !user.id || !nameEl) return;
  StudentService.getCurrentStudent(user.id).then(student => {
    if (!student) {
      nameEl.textContent = 'No student profile yet';
      subEl.textContent = 'Contact the institute administrator to get set up.';
      return;
    }
    nameEl.textContent = (student.batches && student.batches.name) || 'No batch assigned yet';
    subEl.textContent = `Admission #${student.admission_number} · ${student.status}`;
  }).catch(() => {
    nameEl.textContent = 'Could not load batch info';
    subEl.textContent = 'Pull to refresh or try again shortly.';
  });
}

// ---- Student profile screen (student's own record) ----
async function openStudentProfile() {
  Router.go('student-profile');
  const loading = document.getElementById('sp-loading');
  const empty = document.getElementById('sp-empty');
  const content = document.getElementById('sp-content');
  const errorBox = document.getElementById('sp-error');
  loading.hidden = false; empty.hidden = true; content.hidden = true; errorBox.hidden = true;

  const { user } = AuthState.getState();
  try {
    const student = await StudentService.getCurrentStudent(user.id);
    loading.hidden = true;
    if (!student) { empty.hidden = false; return; }

    document.getElementById('sp-avatar-initial').textContent = (user.fullName || user.email || '?').trim().charAt(0).toUpperCase();
    document.getElementById('sp-name').textContent = user.fullName || '—';
    document.getElementById('sp-email').textContent = user.email || '—';
    document.getElementById('sp-status-badge').textContent = student.status;
    document.getElementById('sp-admission-number').textContent = student.admission_number;
    document.getElementById('sp-phone').textContent = user.phone || '—';
    document.getElementById('sp-batch').textContent = (student.batches && student.batches.name) || 'Not assigned yet';
    document.getElementById('sp-admission-date').textContent = student.admission_date || '—';
    content.hidden = false;
  } catch (err) {
    loading.hidden = true;
    document.getElementById('sp-error-msg').textContent = err.message || 'Could not load your student profile.';
    errorBox.hidden = false;
  }
}

// ---- Admin: student list (search + filter + pagination) ----
let aslCurrentPage = 0;
let aslSearchDebounce;

async function loadAdminStudentList(page) {
  aslCurrentPage = page;
  const loading = document.getElementById('asl-loading');
  const empty = document.getElementById('asl-empty');
  const errorBox = document.getElementById('asl-error');
  const listEl = document.getElementById('asl-list');
  const pagination = document.getElementById('asl-pagination');
  loading.hidden = false; empty.hidden = true; errorBox.hidden = true; listEl.innerHTML = ''; pagination.hidden = true;

  const search = document.getElementById('asl-search-input').value;
  const status = document.getElementById('asl-status-filter').value;

  try {
    const { students, total, pageSize } = await StudentService.listStudents({ page, search, status });
    loading.hidden = true;

    if (students.length === 0) {
      document.getElementById('asl-empty-title').textContent = search || status
        ? 'No students match your search.'
        : 'No students have been added yet.';
      empty.hidden = false;
      return;
    }

    listEl.innerHTML = students.map(s => {
      const name = (s.profiles && s.profiles.full_name) || (s.profiles && s.profiles.email) || 'Unnamed';
      const initial = name.trim().charAt(0).toUpperCase();
      const badgeClass = { active: 'badge-success', inactive: 'badge-muted', graduated: 'badge-info', suspended: 'badge-error' }[s.status] || 'badge-muted';
      return `
        <div class="profile-row" data-student-id="${s.id}" onclick="openAdminStudentDetail('${s.id}')">
          <div class="profile-row-icon">${initial}</div>
          <div class="grow">
            <div class="t-label">${escapeHtml(name)}</div>
            <div class="t-support">#${escapeHtml(s.admission_number)}</div>
          </div>
          <span class="badge ${badgeClass}">${s.status}</span>
        </div>
      `;
    }).join('');

    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    document.getElementById('asl-page-label').textContent = `Page ${page + 1} of ${totalPages}`;
    document.getElementById('asl-prev-btn').disabled = page === 0;
    document.getElementById('asl-next-btn').disabled = page + 1 >= totalPages;
    pagination.hidden = false;
  } catch (err) {
    loading.hidden = true;
    document.getElementById('asl-error-msg').textContent = err.message || 'Could not load students.';
    errorBox.hidden = false;
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

function initAdminStudentList() {
  document.getElementById('asl-back').addEventListener('click', () => Router.goToOwnDashboard());
  document.getElementById('ad-manage-students-btn').addEventListener('click', () => {
    Router.go('admin-student-list');
    loadAdminStudentList(0);
  });
  document.getElementById('asl-add-btn').addEventListener('click', () => openAdminStudentAdd());
  document.getElementById('asl-search-input').addEventListener('input', () => {
    clearTimeout(aslSearchDebounce);
    aslSearchDebounce = setTimeout(() => loadAdminStudentList(0), 350);
  });
  document.getElementById('asl-status-filter').addEventListener('change', () => loadAdminStudentList(0));
  document.getElementById('asl-prev-btn').addEventListener('click', () => loadAdminStudentList(Math.max(0, aslCurrentPage - 1)));
  document.getElementById('asl-next-btn').addEventListener('click', () => loadAdminStudentList(aslCurrentPage + 1));
}

// ---- Admin: add student (lookup by email, then create) ----
let asaFoundProfile = null;

async function populateBatchSelects() {
  try {
    const batches = await StudentService.listBatches();
    const options = batches.map(b => `<option value="${b.id}">${escapeHtml(b.name)}</option>`).join('');
    const asaSel = document.getElementById('asa-batch');
    const asdSel = document.getElementById('asd-batch');
    if (asaSel) asaSel.innerHTML = '<option value="">No batch yet</option>' + options;
    if (asdSel) asdSel.innerHTML = '<option value="">No batch</option>' + options;
  } catch (err) {
    // Non-fatal — forms still work without a batch assigned.
  }
}

function openAdminStudentAdd() {
  asaFoundProfile = null;
  document.getElementById('asa-lookup-email').value = '';
  document.getElementById('asa-lookup-error').hidden = true;
  document.getElementById('asa-lookup-result').hidden = true;
  document.getElementById('asa-form').hidden = true;
  document.getElementById('asa-form').reset();
  document.getElementById('asa-admission-date').value = new Date().toISOString().slice(0, 10);
  populateBatchSelects();
  Router.go('admin-student-add');
}

function initAdminStudentAdd() {
  document.getElementById('asa-back').addEventListener('click', () => Router.go('admin-student-list'));

  document.getElementById('asa-lookup-btn').addEventListener('click', async () => {
    const emailEl = document.getElementById('asa-lookup-email');
    const errorEl = document.getElementById('asa-lookup-error');
    const btn = document.getElementById('asa-lookup-btn');
    const label = document.getElementById('asa-lookup-btn-label');
    const spinner = document.getElementById('asa-lookup-spinner');
    errorEl.hidden = true;
    document.getElementById('asa-lookup-result').hidden = true;
    document.getElementById('asa-form').hidden = true;

    const email = emailEl.value.trim();
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      errorEl.querySelector('span').textContent = 'Enter a valid email address.';
      errorEl.hidden = false;
      return;
    }

    btn.disabled = true; label.textContent = 'Searching…'; spinner.hidden = false;
    try {
      const profile = await StudentService.findProfileByEmail(email);
      if (!profile) {
        errorEl.querySelector('span').textContent = 'No Aimers Institute account found for that email. They need to sign in at least once first.';
        errorEl.hidden = false;
        return;
      }
      asaFoundProfile = profile;
      document.getElementById('asa-found-name').textContent = profile.full_name || '(no name set yet)';
      document.getElementById('asa-found-email').textContent = profile.email;
      document.getElementById('asa-lookup-result').hidden = false;
      document.getElementById('asa-form').hidden = false;
    } catch (err) {
      errorEl.querySelector('span').textContent = err.message || 'Could not search right now. Please try again.';
      errorEl.hidden = false;
    } finally {
      btn.disabled = false; label.textContent = 'Find account'; spinner.hidden = true;
    }
  });

  document.getElementById('asa-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!asaFoundProfile) return;

    const admissionNumberEl = document.getElementById('asa-admission-number');
    const admissionNumberError = document.getElementById('asa-admission-number-error');
    const formError = document.getElementById('asa-form-error');
    const btn = document.getElementById('asa-submit-btn');
    const label = document.getElementById('asa-submit-btn-label');
    const spinner = document.getElementById('asa-submit-spinner');
    admissionNumberError.hidden = true; formError.hidden = true;
    admissionNumberEl.classList.remove('error-state');

    if (!admissionNumberEl.value.trim()) {
      admissionNumberEl.classList.add('error-state');
      admissionNumberError.textContent = 'Admission number is required.';
      admissionNumberError.hidden = false;
      return;
    }

    btn.disabled = true; label.textContent = 'Creating…'; spinner.hidden = false;
    try {
      await StudentService.createStudent(asaFoundProfile.id, {
        admissionNumber: admissionNumberEl.value.trim(),
        dateOfBirth: document.getElementById('asa-dob').value,
        gender: document.getElementById('asa-gender').value,
        guardianName: document.getElementById('asa-guardian-name').value.trim(),
        guardianPhone: document.getElementById('asa-guardian-phone').value.trim(),
        address: document.getElementById('asa-address').value.trim(),
        batchId: document.getElementById('asa-batch').value,
        admissionDate: document.getElementById('asa-admission-date').value,
        status: document.getElementById('asa-status').value,
      });
      showToast('Student record created');
      Router.go('admin-student-list');
      loadAdminStudentList(0);
    } catch (err) {
      if (err.code === 'DUPLICATE_ADMISSION_NUMBER') {
        admissionNumberEl.classList.add('error-state');
        admissionNumberError.textContent = err.message;
        admissionNumberError.hidden = false;
      } else if (err.code === 'DUPLICATE') {
        formError.querySelector('span').textContent = 'This account already has a student record.';
        formError.hidden = false;
      } else {
        formError.querySelector('span').textContent = err.message || 'Could not create the student record. Please try again.';
        formError.hidden = false;
      }
    } finally {
      btn.disabled = false; label.textContent = 'Create student record'; spinner.hidden = true;
    }
  });
}

// ---- Admin: student detail (view, edit fields, change status) ----
let asdCurrentStudentId = null;

async function openAdminStudentDetail(studentId) {
  asdCurrentStudentId = studentId;
  Router.go('admin-student-detail');
  const loading = document.getElementById('asd-loading');
  const content = document.getElementById('asd-content');
  const errorBox = document.getElementById('asd-error');
  loading.hidden = false; content.hidden = true; errorBox.hidden = true;
  await populateBatchSelects();

  try {
    const student = await StudentService.getStudentById(studentId);
    loading.hidden = true;
    const name = (student.profiles && student.profiles.full_name) || (student.profiles && student.profiles.email) || 'Unnamed';
    document.getElementById('asd-avatar-initial').textContent = name.trim().charAt(0).toUpperCase();
    document.getElementById('asd-name').textContent = name;
    document.getElementById('asd-email').textContent = (student.profiles && student.profiles.email) || '—';
    document.getElementById('asd-admission-number').textContent = student.admission_number;
    const badgeClass = { active: 'badge-success', inactive: 'badge-muted', graduated: 'badge-info', suspended: 'badge-error' }[student.status] || 'badge-muted';
    const statusBadge = document.getElementById('asd-status-badge');
    statusBadge.textContent = student.status;
    statusBadge.className = 'badge ' + badgeClass;
    document.getElementById('asd-status-select').value = student.status;

    document.getElementById('asd-batch').value = student.batch_id || '';
    document.getElementById('asd-admission-date').value = student.admission_date || '';
    document.getElementById('asd-dob').value = student.date_of_birth || '';
    document.getElementById('asd-gender').value = student.gender || '';
    document.getElementById('asd-guardian-name').value = student.guardian_name || '';
    document.getElementById('asd-guardian-phone').value = student.guardian_phone || '';
    document.getElementById('asd-address').value = student.address || '';

    content.hidden = false;
  } catch (err) {
    loading.hidden = true;
    document.getElementById('asd-error-msg').textContent = err.message || 'Could not load this student record.';
    errorBox.hidden = false;
  }
}

function initAdminStudentDetail() {
  document.getElementById('asd-back').addEventListener('click', () => Router.go('admin-student-list'));

  document.getElementById('asd-status-save-btn').addEventListener('click', async () => {
    if (!asdCurrentStudentId) return;
    const btn = document.getElementById('asd-status-save-btn');
    const label = document.getElementById('asd-status-save-label');
    const spinner = document.getElementById('asd-status-spinner');
    const newStatus = document.getElementById('asd-status-select').value;
    btn.disabled = true; label.textContent = 'Updating…'; spinner.hidden = false;
    try {
      const updated = await StudentService.updateStudentStatus(asdCurrentStudentId, newStatus);
      const badgeClass = { active: 'badge-success', inactive: 'badge-muted', graduated: 'badge-info', suspended: 'badge-error' }[updated.status] || 'badge-muted';
      const statusBadge = document.getElementById('asd-status-badge');
      statusBadge.textContent = updated.status;
      statusBadge.className = 'badge ' + badgeClass;
      showToast('Status updated');
    } catch (err) {
      showToast(err.message || 'Could not update status right now.');
    } finally {
      btn.disabled = false; label.textContent = 'Update'; spinner.hidden = true;
    }
  });

  document.getElementById('asd-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!asdCurrentStudentId) return;
    const formError = document.getElementById('asd-form-error');
    const btn = document.getElementById('asd-save-btn');
    const label = document.getElementById('asd-save-btn-label');
    const spinner = document.getElementById('asd-save-spinner');
    formError.hidden = true;
    btn.disabled = true; label.textContent = 'Saving…'; spinner.hidden = false;
    try {
      await StudentService.updateStudent(asdCurrentStudentId, {
        batchId: document.getElementById('asd-batch').value,
        admissionDate: document.getElementById('asd-admission-date').value,
        dateOfBirth: document.getElementById('asd-dob').value,
        gender: document.getElementById('asd-gender').value,
        guardianName: document.getElementById('asd-guardian-name').value.trim(),
        guardianPhone: document.getElementById('asd-guardian-phone').value.trim(),
        address: document.getElementById('asd-address').value.trim(),
      });
      showToast('Student details saved');
    } catch (err) {
      formError.querySelector('span').textContent = err.message || 'Could not save changes. Please try again.';
      formError.hidden = false;
    } finally {
      btn.disabled = false; label.textContent = 'Save changes'; spinner.hidden = true;
    }
  });
}

function initStudentManagementNav() {
  const batchCard = document.getElementById('sd-batch-card');
  if (batchCard) batchCard.addEventListener('click', () => openStudentProfile());
  const spBack = document.getElementById('sp-back');
  if (spBack) spBack.addEventListener('click', () => Router.goToOwnDashboard());

  initAdminStudentList();
  initAdminStudentAdd();
  initAdminStudentDetail();
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
  initStudentManagementNav();
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
