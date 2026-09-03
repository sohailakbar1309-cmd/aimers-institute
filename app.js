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
  if (role === 'teacher') { loadTeacherDashboardCard(); loadTeacherDashboardBatches(); }
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
  if (key === 'teachers' && AuthState.getState().role === 'admin') {
    Router.go('admin-teacher-list');
    loadAdminTeacherList(0);
    return;
  }
  if (key === 'courses' && AuthState.getState().role === 'student') return openStudentProfile();
  if (key === 'batches' && AuthState.getState().role === 'teacher') return openTeacherBatches();
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
    document.getElementById('sp-course').textContent = (student.batches && student.batches.courses && student.batches.courses.name) || 'Not assigned yet';
    const batchStatusEl = document.getElementById('sp-batch-status');
    if (student.batches && student.batches.status) {
      batchStatusEl.textContent = student.batches.status;
      batchStatusEl.hidden = false;
    } else {
      batchStatusEl.hidden = true;
    }
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

// ==================== TEACHER MANAGEMENT (Phase 5) ====================

function loadTeacherDashboardCard() {
  const { user } = AuthState.getState();
  const nameEl = document.getElementById('td-subject-name');
  const subEl = document.getElementById('td-profile-sub');
  if (!user || !user.id || !nameEl) return;
  TeacherService.getCurrentTeacher(user.id).then(teacher => {
    if (!teacher) {
      nameEl.textContent = 'No teacher profile yet';
      subEl.textContent = 'Contact the institute administrator to get set up.';
      return;
    }
    nameEl.textContent = teacher.subject || 'No subject set';
    subEl.textContent = `Employee #${teacher.employee_code} · ${teacher.status}`;
  }).catch(() => {
    nameEl.textContent = 'Could not load profile';
    subEl.textContent = 'Pull to refresh or try again shortly.';
  });
}

async function openTeacherProfile() {
  Router.go('teacher-profile');
  const loading = document.getElementById('tp-loading');
  const empty = document.getElementById('tp-empty');
  const content = document.getElementById('tp-content');
  const errorBox = document.getElementById('tp-error');
  loading.hidden = false; empty.hidden = true; content.hidden = true; errorBox.hidden = true;

  const { user } = AuthState.getState();
  try {
    const teacher = await TeacherService.getCurrentTeacher(user.id);
    loading.hidden = true;
    if (!teacher) { empty.hidden = false; return; }

    document.getElementById('tp-avatar-initial').textContent = (user.fullName || user.email || '?').trim().charAt(0).toUpperCase();
    document.getElementById('tp-name').textContent = user.fullName || '—';
    document.getElementById('tp-email').textContent = user.email || '—';
    document.getElementById('tp-status-badge').textContent = teacher.status;
    document.getElementById('tp-employee-code').textContent = teacher.employee_code;
    document.getElementById('tp-phone').textContent = teacher.phone || '—';
    document.getElementById('tp-subject').textContent = teacher.subject || 'Not set';
    document.getElementById('tp-qualification').textContent = teacher.qualification || '—';
    document.getElementById('tp-joining-date').textContent = teacher.joining_date || '—';
    content.hidden = false;
  } catch (err) {
    loading.hidden = true;
    document.getElementById('tp-error-msg').textContent = err.message || 'Could not load your teacher profile.';
    errorBox.hidden = false;
  }
}

// ---- Admin: teacher list ----
let atlCurrentPage = 0;
let atlSearchDebounce;

async function loadAdminTeacherList(page) {
  atlCurrentPage = page;
  const loading = document.getElementById('atl-loading');
  const empty = document.getElementById('atl-empty');
  const errorBox = document.getElementById('atl-error');
  const listEl = document.getElementById('atl-list');
  const pagination = document.getElementById('atl-pagination');
  loading.hidden = false; empty.hidden = true; errorBox.hidden = true; listEl.innerHTML = ''; pagination.hidden = true;

  const search = document.getElementById('atl-search-input').value;
  const status = document.getElementById('atl-status-filter').value;

  try {
    const { teachers, total, pageSize } = await TeacherService.listTeachers({ page, search, status });
    loading.hidden = true;

    if (teachers.length === 0) {
      document.getElementById('atl-empty-title').textContent = search || status
        ? 'No teachers match your search.'
        : 'No teachers have been added yet.';
      empty.hidden = false;
      return;
    }

    listEl.innerHTML = teachers.map(t => {
      const name = (t.profiles && t.profiles.full_name) || (t.profiles && t.profiles.email) || 'Unnamed';
      const initial = name.trim().charAt(0).toUpperCase();
      const badgeClass = { active: 'badge-success', inactive: 'badge-muted', on_leave: 'badge-warning' }[t.status] || 'badge-muted';
      return `
        <div class="profile-row" data-teacher-id="${t.id}" onclick="openAdminTeacherDetail('${t.id}')">
          <div class="profile-row-icon">${initial}</div>
          <div class="grow">
            <div class="t-label">${escapeHtml(name)}</div>
            <div class="t-support">#${escapeHtml(t.employee_code)}${t.subject ? ' · ' + escapeHtml(t.subject) : ''}</div>
          </div>
          <span class="badge ${badgeClass}">${t.status}</span>
        </div>
      `;
    }).join('');

    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    document.getElementById('atl-page-label').textContent = `Page ${page + 1} of ${totalPages}`;
    document.getElementById('atl-prev-btn').disabled = page === 0;
    document.getElementById('atl-next-btn').disabled = page + 1 >= totalPages;
    pagination.hidden = false;
  } catch (err) {
    loading.hidden = true;
    document.getElementById('atl-error-msg').textContent = err.message || 'Could not load teachers.';
    errorBox.hidden = false;
  }
}

function initAdminTeacherList() {
  document.getElementById('atl-back').addEventListener('click', () => Router.goToOwnDashboard());
  const manageBtn = document.getElementById('ad-manage-teachers-btn');
  if (manageBtn) manageBtn.addEventListener('click', () => { Router.go('admin-teacher-list'); loadAdminTeacherList(0); });
  document.getElementById('atl-add-btn').addEventListener('click', () => openAdminTeacherAdd());
  document.getElementById('atl-search-input').addEventListener('input', () => {
    clearTimeout(atlSearchDebounce);
    atlSearchDebounce = setTimeout(() => loadAdminTeacherList(0), 350);
  });
  document.getElementById('atl-status-filter').addEventListener('change', () => loadAdminTeacherList(0));
  document.getElementById('atl-prev-btn').addEventListener('click', () => loadAdminTeacherList(Math.max(0, atlCurrentPage - 1)));
  document.getElementById('atl-next-btn').addEventListener('click', () => loadAdminTeacherList(atlCurrentPage + 1));
}

// ---- Admin: add teacher ----
let ataFoundProfile = null;

function openAdminTeacherAdd() {
  ataFoundProfile = null;
  document.getElementById('ata-lookup-email').value = '';
  document.getElementById('ata-lookup-error').hidden = true;
  document.getElementById('ata-lookup-result').hidden = true;
  document.getElementById('ata-form').hidden = true;
  document.getElementById('ata-form').reset();
  document.getElementById('ata-joining-date').value = new Date().toISOString().slice(0, 10);
  Router.go('admin-teacher-add');
}

function initAdminTeacherAdd() {
  document.getElementById('ata-back').addEventListener('click', () => Router.go('admin-teacher-list'));

  document.getElementById('ata-lookup-btn').addEventListener('click', async () => {
    const emailEl = document.getElementById('ata-lookup-email');
    const errorEl = document.getElementById('ata-lookup-error');
    const btn = document.getElementById('ata-lookup-btn');
    const label = document.getElementById('ata-lookup-btn-label');
    const spinner = document.getElementById('ata-lookup-spinner');
    errorEl.hidden = true;
    document.getElementById('ata-lookup-result').hidden = true;
    document.getElementById('ata-form').hidden = true;

    const email = emailEl.value.trim();
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      errorEl.querySelector('span').textContent = 'Enter a valid email address.';
      errorEl.hidden = false;
      return;
    }

    btn.disabled = true; label.textContent = 'Searching…'; spinner.hidden = false;
    try {
      const profile = await TeacherService.findProfileByEmail(email);
      if (!profile) {
        errorEl.querySelector('span').textContent = 'No Aimers Institute account found for that email. They need to sign in at least once first.';
        errorEl.hidden = false;
        return;
      }
      ataFoundProfile = profile;
      document.getElementById('ata-found-name').textContent = profile.full_name || '(no name set yet)';
      document.getElementById('ata-found-email').textContent = profile.email;
      document.getElementById('ata-lookup-result').hidden = false;
      document.getElementById('ata-form').hidden = false;
    } catch (err) {
      errorEl.querySelector('span').textContent = err.message || 'Could not search right now. Please try again.';
      errorEl.hidden = false;
    } finally {
      btn.disabled = false; label.textContent = 'Find account'; spinner.hidden = true;
    }
  });

  document.getElementById('ata-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!ataFoundProfile) return;

    const codeEl = document.getElementById('ata-employee-code');
    const codeError = document.getElementById('ata-employee-code-error');
    const formError = document.getElementById('ata-form-error');
    const btn = document.getElementById('ata-submit-btn');
    const label = document.getElementById('ata-submit-btn-label');
    const spinner = document.getElementById('ata-submit-spinner');
    codeError.hidden = true; formError.hidden = true;
    codeEl.classList.remove('error-state');

    if (!codeEl.value.trim()) {
      codeEl.classList.add('error-state');
      codeError.textContent = 'Employee code is required.';
      codeError.hidden = false;
      return;
    }

    btn.disabled = true; label.textContent = 'Creating…'; spinner.hidden = false;
    try {
      await TeacherService.createTeacher(ataFoundProfile.id, {
        employeeCode: codeEl.value.trim(),
        subject: document.getElementById('ata-subject').value.trim(),
        qualification: document.getElementById('ata-qualification').value.trim(),
        phone: document.getElementById('ata-phone').value.trim(),
        joiningDate: document.getElementById('ata-joining-date').value,
        status: document.getElementById('ata-status').value,
      });
      showToast('Teacher record created');
      Router.go('admin-teacher-list');
      loadAdminTeacherList(0);
    } catch (err) {
      if (err.code === 'DUPLICATE_EMPLOYEE_CODE') {
        codeEl.classList.add('error-state');
        codeError.textContent = err.message;
        codeError.hidden = false;
      } else if (err.code === 'DUPLICATE') {
        formError.querySelector('span').textContent = 'This account already has a teacher record.';
        formError.hidden = false;
      } else {
        formError.querySelector('span').textContent = err.message || 'Could not create the teacher record. Please try again.';
        formError.hidden = false;
      }
    } finally {
      btn.disabled = false; label.textContent = 'Create teacher record'; spinner.hidden = true;
    }
  });
}

// ---- Admin: teacher detail ----
let atdCurrentTeacherId = null;

async function openAdminTeacherDetail(teacherId) {
  atdCurrentTeacherId = teacherId;
  Router.go('admin-teacher-detail');
  const loading = document.getElementById('atd-loading');
  const content = document.getElementById('atd-content');
  const errorBox = document.getElementById('atd-error');
  loading.hidden = false; content.hidden = true; errorBox.hidden = true;

  try {
    const teacher = await TeacherService.getTeacherById(teacherId);
    loading.hidden = true;
    const name = (teacher.profiles && teacher.profiles.full_name) || (teacher.profiles && teacher.profiles.email) || 'Unnamed';
    document.getElementById('atd-avatar-initial').textContent = name.trim().charAt(0).toUpperCase();
    document.getElementById('atd-name').textContent = name;
    document.getElementById('atd-email').textContent = (teacher.profiles && teacher.profiles.email) || '—';
    document.getElementById('atd-employee-code').textContent = teacher.employee_code;
    const badgeClass = { active: 'badge-success', inactive: 'badge-muted', on_leave: 'badge-warning' }[teacher.status] || 'badge-muted';
    const statusBadge = document.getElementById('atd-status-badge');
    statusBadge.textContent = teacher.status;
    statusBadge.className = 'badge ' + badgeClass;
    document.getElementById('atd-status-select').value = teacher.status;

    document.getElementById('atd-subject').value = teacher.subject || '';
    document.getElementById('atd-qualification').value = teacher.qualification || '';
    document.getElementById('atd-phone').value = teacher.phone || '';
    document.getElementById('atd-joining-date').value = teacher.joining_date || '';

    content.hidden = false;
  } catch (err) {
    loading.hidden = true;
    document.getElementById('atd-error-msg').textContent = err.message || 'Could not load this teacher record.';
    errorBox.hidden = false;
  }
}

function initAdminTeacherDetail() {
  document.getElementById('atd-back').addEventListener('click', () => Router.go('admin-teacher-list'));

  document.getElementById('atd-status-save-btn').addEventListener('click', async () => {
    if (!atdCurrentTeacherId) return;
    const btn = document.getElementById('atd-status-save-btn');
    const label = document.getElementById('atd-status-save-label');
    const spinner = document.getElementById('atd-status-spinner');
    const newStatus = document.getElementById('atd-status-select').value;
    btn.disabled = true; label.textContent = 'Updating…'; spinner.hidden = false;
    try {
      const updated = await TeacherService.updateTeacherStatus(atdCurrentTeacherId, newStatus);
      const badgeClass = { active: 'badge-success', inactive: 'badge-muted', on_leave: 'badge-warning' }[updated.status] || 'badge-muted';
      const statusBadge = document.getElementById('atd-status-badge');
      statusBadge.textContent = updated.status;
      statusBadge.className = 'badge ' + badgeClass;
      showToast('Status updated');
    } catch (err) {
      showToast(err.message || 'Could not update status right now.');
    } finally {
      btn.disabled = false; label.textContent = 'Update'; spinner.hidden = true;
    }
  });

  document.getElementById('atd-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!atdCurrentTeacherId) return;
    const formError = document.getElementById('atd-form-error');
    const btn = document.getElementById('atd-save-btn');
    const label = document.getElementById('atd-save-btn-label');
    const spinner = document.getElementById('atd-save-spinner');
    formError.hidden = true;
    btn.disabled = true; label.textContent = 'Saving…'; spinner.hidden = false;
    try {
      await TeacherService.updateTeacher(atdCurrentTeacherId, {
        subject: document.getElementById('atd-subject').value.trim(),
        qualification: document.getElementById('atd-qualification').value.trim(),
        phone: document.getElementById('atd-phone').value.trim(),
        joiningDate: document.getElementById('atd-joining-date').value,
      });
      showToast('Teacher details saved');
    } catch (err) {
      formError.querySelector('span').textContent = err.message || 'Could not save changes. Please try again.';
      formError.hidden = false;
    } finally {
      btn.disabled = false; label.textContent = 'Save changes'; spinner.hidden = true;
    }
  });
}

function initTeacherManagementNav() {
  const profileCard = document.getElementById('td-profile-card');
  if (profileCard) profileCard.addEventListener('click', () => openTeacherProfile());
  const tpBack = document.getElementById('tp-back');
  if (tpBack) tpBack.addEventListener('click', () => Router.goToOwnDashboard());

  initAdminTeacherList();
  initAdminTeacherAdd();
  initAdminTeacherDetail();
}

// ==================== COURSE & BATCH MANAGEMENT (Phase 6) ====================

// ---- Admin: course list ----
let aclSearchDebounce;

async function loadAdminCourseList() {
  const loading = document.getElementById('acl-loading');
  const empty = document.getElementById('acl-empty');
  const errorBox = document.getElementById('acl-error');
  const listEl = document.getElementById('acl-list');
  loading.hidden = false; empty.hidden = true; errorBox.hidden = true; listEl.innerHTML = '';

  const search = document.getElementById('acl-search-input').value;
  try {
    const courses = await CourseService.listCourses({ search });
    loading.hidden = true;
    if (courses.length === 0) {
      document.getElementById('acl-empty-title').textContent = search ? 'No courses match your search.' : 'No courses have been added yet.';
      empty.hidden = false;
      return;
    }
    const badgeClass = { active: 'badge-success', inactive: 'badge-muted', archived: 'badge-error' };
    listEl.innerHTML = courses.map(c => `
      <div class="profile-row" onclick="openAdminCourseForm('${c.id}')">
        <div class="profile-row-icon">${escapeHtml((c.name || '?').charAt(0).toUpperCase())}</div>
        <div class="grow">
          <div class="t-label">${escapeHtml(c.name)}</div>
          <div class="t-support">${escapeHtml(c.code)}</div>
        </div>
        <span class="badge ${badgeClass[c.status] || 'badge-muted'}">${c.status}</span>
      </div>
    `).join('');
  } catch (err) {
    loading.hidden = true;
    document.getElementById('acl-error-msg').textContent = err.message || 'Could not load courses.';
    errorBox.hidden = false;
  }
}

let acfEditingCourseId = null;

function openAdminCourseForm(courseId) {
  acfEditingCourseId = courseId || null;
  document.getElementById('acf-form').reset();
  document.getElementById('acf-form-error').hidden = true;
  document.getElementById('acf-name-error').hidden = true;
  document.getElementById('acf-code-error').hidden = true;
  const statusField = document.getElementById('acf-status-field');
  const codeEl = document.getElementById('acf-code');

  if (courseId) {
    document.getElementById('acf-title').textContent = 'Edit course';
    statusField.hidden = false;
    codeEl.disabled = true;
    CourseService.getCourse(courseId).then(c => {
      document.getElementById('acf-name').value = c.name || '';
      document.getElementById('acf-code').value = c.code || '';
      document.getElementById('acf-duration').value = c.duration || '';
      document.getElementById('acf-description').value = c.description || '';
      document.getElementById('acf-status').value = c.status;
    }).catch(err => showToast(err.message || 'Could not load course.'));
  } else {
    document.getElementById('acf-title').textContent = 'Add course';
    statusField.hidden = true;
    codeEl.disabled = false;
  }
  Router.go('admin-course-form');
}

function initAdminCourseManagement() {
  document.getElementById('acl-back').addEventListener('click', () => Router.goToOwnDashboard());
  const manageBtn = document.getElementById('ad-manage-courses-btn');
  if (manageBtn) manageBtn.addEventListener('click', () => { Router.go('admin-course-list'); loadAdminCourseList(); });
  document.getElementById('acl-add-btn').addEventListener('click', () => openAdminCourseForm(null));
  document.getElementById('acl-search-input').addEventListener('input', () => {
    clearTimeout(aclSearchDebounce);
    aclSearchDebounce = setTimeout(loadAdminCourseList, 350);
  });
  document.getElementById('acf-back').addEventListener('click', () => { Router.go('admin-course-list'); loadAdminCourseList(); });

  document.getElementById('acf-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nameEl = document.getElementById('acf-name');
    const codeEl = document.getElementById('acf-code');
    const nameError = document.getElementById('acf-name-error');
    const codeError = document.getElementById('acf-code-error');
    const formError = document.getElementById('acf-form-error');
    const btn = document.getElementById('acf-submit-btn');
    const label = document.getElementById('acf-submit-btn-label');
    const spinner = document.getElementById('acf-submit-spinner');
    nameError.hidden = true; codeError.hidden = true; formError.hidden = true;
    nameEl.classList.remove('error-state'); codeEl.classList.remove('error-state');

    let valid = true;
    if (!nameEl.value.trim()) { nameEl.classList.add('error-state'); nameError.textContent = 'Course name is required.'; nameError.hidden = false; valid = false; }
    if (!acfEditingCourseId && !codeEl.value.trim()) { codeEl.classList.add('error-state'); codeError.textContent = 'Course code is required.'; codeError.hidden = false; valid = false; }
    if (!valid) return;

    btn.disabled = true; label.textContent = 'Saving…'; spinner.hidden = false;
    try {
      if (acfEditingCourseId) {
        await CourseService.updateCourse(acfEditingCourseId, {
          name: nameEl.value.trim(), duration: document.getElementById('acf-duration').value.trim(), description: document.getElementById('acf-description').value.trim(),
        });
        await CourseService.updateCourseStatus(acfEditingCourseId, document.getElementById('acf-status').value);
        showToast('Course updated');
      } else {
        await CourseService.createCourse({
          name: nameEl.value.trim(), code: codeEl.value.trim(), duration: document.getElementById('acf-duration').value.trim(), description: document.getElementById('acf-description').value.trim(),
        });
        showToast('Course created');
      }
      Router.go('admin-course-list');
      loadAdminCourseList();
    } catch (err) {
      if (err.code === 'DUPLICATE_CODE') { codeEl.classList.add('error-state'); codeError.textContent = err.message; codeError.hidden = false; }
      else { formError.querySelector('span').textContent = err.message || 'Could not save the course. Please try again.'; formError.hidden = false; }
    } finally {
      btn.disabled = false; label.textContent = acfEditingCourseId ? 'Save changes' : 'Create course'; spinner.hidden = true;
    }
  });
}

// ---- Admin: batch list ----
let ablCurrentPage = 0;
let ablSearchDebounce;
let ablPresetBatchCourseFilterLabel = null;

async function populateCourseFilterDropdown() {
  try {
    const courses = await CourseService.listCourses({});
    const opts = courses.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
    const filterSel = document.getElementById('abl-course-filter');
    if (filterSel) filterSel.innerHTML = '<option value="">All courses</option>' + opts;
    const abaSel = document.getElementById('aba-course');
    if (abaSel) abaSel.innerHTML = '<option value="">No course yet</option>' + opts;
    const abdSel = document.getElementById('abd-edit-course');
    if (abdSel) abdSel.innerHTML = '<option value="">No course</option>' + opts;
  } catch (err) { /* non-fatal — forms still work without course options */ }
}

async function loadAdminBatchList(page) {
  ablCurrentPage = page;
  const loading = document.getElementById('abl-loading');
  const empty = document.getElementById('abl-empty');
  const errorBox = document.getElementById('abl-error');
  const listEl = document.getElementById('abl-list');
  const pagination = document.getElementById('abl-pagination');
  loading.hidden = false; empty.hidden = true; errorBox.hidden = true; listEl.innerHTML = ''; pagination.hidden = true;

  const search = document.getElementById('abl-search-input').value;
  const status = document.getElementById('abl-status-filter').value;
  const courseId = document.getElementById('abl-course-filter').value;

  try {
    const { batches, total, pageSize } = await BatchService.listBatches({ page, search, status, courseId });
    loading.hidden = true;
    if (batches.length === 0) {
      document.getElementById('abl-empty-title').textContent = (search || status || courseId) ? 'No batches match your search.' : 'No batches have been added yet.';
      empty.hidden = false;
      return;
    }
    const badgeClass = { active: 'badge-success', inactive: 'badge-muted', upcoming: 'badge-info', completed: 'badge-warning' };
    listEl.innerHTML = batches.map(b => `
      <div class="profile-row" onclick="openAdminBatchDetail('${b.id}')">
        <div class="profile-row-icon">${escapeHtml((b.name || '?').charAt(0).toUpperCase())}</div>
        <div class="grow">
          <div class="t-label">${escapeHtml(b.name)}</div>
          <div class="t-support">${b.batch_code ? escapeHtml(b.batch_code) + ' · ' : ''}${(b.courses && escapeHtml(b.courses.name)) || 'No course'}</div>
        </div>
        <span class="badge ${badgeClass[b.status] || 'badge-muted'}">${b.status}</span>
      </div>
    `).join('');

    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    document.getElementById('abl-page-label').textContent = `Page ${page + 1} of ${totalPages}`;
    document.getElementById('abl-prev-btn').disabled = page === 0;
    document.getElementById('abl-next-btn').disabled = page + 1 >= totalPages;
    pagination.hidden = false;
  } catch (err) {
    loading.hidden = true;
    document.getElementById('abl-error-msg').textContent = err.message || 'Could not load batches.';
    errorBox.hidden = false;
  }
}

function initAdminBatchList() {
  document.getElementById('abl-back').addEventListener('click', () => Router.goToOwnDashboard());
  const manageBtn = document.getElementById('ad-manage-batches-btn');
  if (manageBtn) manageBtn.addEventListener('click', () => {
    document.getElementById('abl-filter-note').hidden = true;
    document.getElementById('abl-course-filter').value = '';
    populateCourseFilterDropdown();
    Router.go('admin-batch-list');
    loadAdminBatchList(0);
  });
  document.getElementById('abl-add-btn').addEventListener('click', () => openAdminBatchAdd());
  document.getElementById('abl-search-input').addEventListener('input', () => {
    clearTimeout(ablSearchDebounce);
    ablSearchDebounce = setTimeout(() => loadAdminBatchList(0), 350);
  });
  document.getElementById('abl-status-filter').addEventListener('change', () => loadAdminBatchList(0));
  document.getElementById('abl-course-filter').addEventListener('change', () => loadAdminBatchList(0));
  document.getElementById('abl-prev-btn').addEventListener('click', () => loadAdminBatchList(Math.max(0, ablCurrentPage - 1)));
  document.getElementById('abl-next-btn').addEventListener('click', () => loadAdminBatchList(ablCurrentPage + 1));
}

// ---- Admin: add batch ----
function openAdminBatchAdd() {
  document.getElementById('aba-form').reset();
  document.getElementById('aba-form-error').hidden = true;
  document.getElementById('aba-name-error').hidden = true;
  document.getElementById('aba-batch-code-error').hidden = true;
  document.getElementById('aba-end-date-error').hidden = true;
  document.getElementById('aba-capacity-error').hidden = true;
  populateCourseFilterDropdown();
  Router.go('admin-batch-add');
}

function initAdminBatchAdd() {
  document.getElementById('aba-back').addEventListener('click', () => Router.go('admin-batch-list'));

  document.getElementById('aba-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nameEl = document.getElementById('aba-name');
    const nameError = document.getElementById('aba-name-error');
    const codeError = document.getElementById('aba-batch-code-error');
    const endDateEl = document.getElementById('aba-end-date');
    const endDateError = document.getElementById('aba-end-date-error');
    const capacityEl = document.getElementById('aba-capacity');
    const capacityError = document.getElementById('aba-capacity-error');
    const formError = document.getElementById('aba-form-error');
    const btn = document.getElementById('aba-submit-btn');
    const label = document.getElementById('aba-submit-btn-label');
    const spinner = document.getElementById('aba-submit-spinner');
    [nameError, codeError, endDateError, capacityError, formError].forEach(el => el.hidden = true);
    nameEl.classList.remove('error-state'); endDateEl.classList.remove('error-state'); capacityEl.classList.remove('error-state');

    let valid = true;
    if (!nameEl.value.trim()) { nameEl.classList.add('error-state'); nameError.textContent = 'Batch name is required.'; nameError.hidden = false; valid = false; }
    const startDate = document.getElementById('aba-start-date').value;
    if (startDate && endDateEl.value && endDateEl.value < startDate) {
      endDateEl.classList.add('error-state'); endDateError.textContent = 'End date cannot be before the start date.'; endDateError.hidden = false; valid = false;
    }
    if (capacityEl.value && Number(capacityEl.value) <= 0) {
      capacityEl.classList.add('error-state'); capacityError.textContent = 'Capacity must be a positive number.'; capacityError.hidden = false; valid = false;
    }
    if (!valid) return;

    btn.disabled = true; label.textContent = 'Creating…'; spinner.hidden = false;
    try {
      await BatchService.createBatch({
        name: nameEl.value.trim(),
        courseId: document.getElementById('aba-course').value,
        batchCode: document.getElementById('aba-batch-code').value.trim(),
        startDate, endDate: endDateEl.value,
        schedule: document.getElementById('aba-schedule').value.trim(),
        capacity: capacityEl.value ? Number(capacityEl.value) : null,
        status: document.getElementById('aba-status').value,
      });
      showToast('Batch created');
      Router.go('admin-batch-list');
      loadAdminBatchList(0);
    } catch (err) {
      if (err.code === 'DUPLICATE_CODE') { document.getElementById('aba-batch-code').classList.add('error-state'); codeError.textContent = err.message; codeError.hidden = false; }
      else { formError.querySelector('span').textContent = err.message || 'Could not create the batch. Please try again.'; formError.hidden = false; }
    } finally {
      btn.disabled = false; label.textContent = 'Create batch'; spinner.hidden = true;
    }
  });
}

// ---- Admin: batch detail ----
let abdCurrentBatchId = null;

async function loadBatchTeachersSection(batchId) {
  const listEl = document.getElementById('abd-teachers-list');
  const emptyEl = document.getElementById('abd-teachers-empty');
  listEl.innerHTML = '';
  try {
    const assignments = await BatchService.getBatchTeachers(batchId);
    if (assignments.length === 0) { emptyEl.hidden = false; return; }
    emptyEl.hidden = true;
    listEl.innerHTML = assignments.map(a => {
      const t = a.teachers;
      const name = (t && t.profiles && t.profiles.full_name) || (t && t.profiles && t.profiles.email) || 'Unnamed';
      return `
        <div class="profile-row">
          <div class="profile-row-icon">${escapeHtml(name.trim().charAt(0).toUpperCase())}</div>
          <div class="grow">
            <div class="t-label">${escapeHtml(name)}</div>
            <div class="t-support">${escapeHtml((t && t.subject) || t.employee_code)}</div>
          </div>
          <button class="btn btn-icon btn-secondary" onclick="removeBatchTeacher('${batchId}', '${t.id}')" aria-label="Remove">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>
      `;
    }).join('');
  } catch (err) {
    showToast(err.message || 'Could not load assigned teachers.');
  }
}

async function populateAssignTeacherSelect(excludeTeacherIds) {
  try {
    const { teachers } = await TeacherService.listTeachers({ status: 'active' });
    const sel = document.getElementById('abd-assign-teacher-select');
    const available = teachers.filter(t => !excludeTeacherIds.includes(t.id));
    sel.innerHTML = '<option value="">Select a teacher…</option>' + available.map(t => {
      const name = (t.profiles && t.profiles.full_name) || (t.profiles && t.profiles.email) || t.employee_code;
      return `<option value="${t.id}">${escapeHtml(name)}</option>`;
    }).join('');
  } catch (err) { /* non-fatal */ }
}

async function refreshBatchDetailTeachers(batchId) {
  await loadBatchTeachersSection(batchId);
  try {
    const assignments = await BatchService.getBatchTeachers(batchId);
    await populateAssignTeacherSelect(assignments.map(a => a.teacher_id));
  } catch (err) { /* non-fatal */ }
}

async function removeBatchTeacher(batchId, teacherId) {
  try {
    await BatchService.removeTeacher(batchId, teacherId);
    showToast('Teacher removed');
    refreshBatchDetailTeachers(batchId);
  } catch (err) {
    showToast(err.message || 'Could not remove teacher.');
  }
}

async function openAdminBatchDetail(batchId) {
  abdCurrentBatchId = batchId;
  Router.go('admin-batch-detail');
  const loading = document.getElementById('abd-loading');
  const content = document.getElementById('abd-content');
  const errorBox = document.getElementById('abd-error');
  loading.hidden = false; content.hidden = true; errorBox.hidden = true;
  await populateCourseFilterDropdown();

  try {
    const batch = await BatchService.getBatch(batchId);
    const studentCount = await BatchService.getBatchStudentCount(batchId);
    loading.hidden = true;

    document.getElementById('abd-name').textContent = batch.name;
    document.getElementById('abd-course').textContent = (batch.courses && batch.courses.name) || 'Not set';
    document.getElementById('abd-code').textContent = batch.batch_code || '—';
    document.getElementById('abd-dates').textContent = batch.start_date || batch.end_date ? `${batch.start_date || '?'} → ${batch.end_date || '?'}` : '—';
    document.getElementById('abd-schedule').textContent = batch.schedule || '—';
    document.getElementById('abd-capacity').textContent = batch.capacity != null ? `${studentCount} / ${batch.capacity}` : String(studentCount);
    document.getElementById('abd-student-count').textContent = String(studentCount);
    const badgeClass = { active: 'badge-success', inactive: 'badge-muted', upcoming: 'badge-info', completed: 'badge-warning' }[batch.status] || 'badge-muted';
    const statusBadge = document.getElementById('abd-status-badge');
    statusBadge.textContent = batch.status;
    statusBadge.className = 'badge ' + badgeClass;
    document.getElementById('abd-status-select').value = batch.status;

    document.getElementById('abd-edit-name').value = batch.name || '';
    document.getElementById('abd-edit-course').value = batch.course_id || '';
    document.getElementById('abd-edit-code').value = batch.batch_code || '';
    document.getElementById('abd-edit-start').value = batch.start_date || '';
    document.getElementById('abd-edit-end').value = batch.end_date || '';
    document.getElementById('abd-edit-schedule').value = batch.schedule || '';
    document.getElementById('abd-edit-capacity').value = batch.capacity != null ? batch.capacity : '';

    content.hidden = false;
    refreshBatchDetailTeachers(batchId);
  } catch (err) {
    loading.hidden = true;
    document.getElementById('abd-error-msg').textContent = err.message || 'Could not load this batch.';
    errorBox.hidden = false;
  }
}

function initAdminBatchDetail() {
  document.getElementById('abd-back').addEventListener('click', () => Router.go('admin-batch-list'));

  document.getElementById('abd-view-students-btn').addEventListener('click', () => {
    ablPresetBatchCourseFilterLabel = document.getElementById('abd-name').textContent;
    Router.go('admin-student-list');
    const filterNote = document.getElementById('asl-error'); // reuse pattern below via student list wiring
    loadAdminStudentListForBatch(abdCurrentBatchId, ablPresetBatchCourseFilterLabel);
  });

  document.getElementById('abd-status-save-btn').addEventListener('click', async () => {
    if (!abdCurrentBatchId) return;
    const btn = document.getElementById('abd-status-save-btn');
    const label = document.getElementById('abd-status-save-label');
    const spinner = document.getElementById('abd-status-spinner');
    const newStatus = document.getElementById('abd-status-select').value;
    btn.disabled = true; label.textContent = 'Updating…'; spinner.hidden = false;
    try {
      const updated = await BatchService.updateBatchStatus(abdCurrentBatchId, newStatus);
      const badgeClass = { active: 'badge-success', inactive: 'badge-muted', upcoming: 'badge-info', completed: 'badge-warning' }[updated.status] || 'badge-muted';
      const statusBadge = document.getElementById('abd-status-badge');
      statusBadge.textContent = updated.status;
      statusBadge.className = 'badge ' + badgeClass;
      showToast('Status updated');
    } catch (err) {
      showToast(err.message || 'Could not update status right now.');
    } finally {
      btn.disabled = false; label.textContent = 'Update'; spinner.hidden = true;
    }
  });

  document.getElementById('abd-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!abdCurrentBatchId) return;
    const endDateEl = document.getElementById('abd-edit-end');
    const endDateError = document.getElementById('abd-edit-end-error');
    const capacityEl = document.getElementById('abd-edit-capacity');
    const capacityError = document.getElementById('abd-edit-capacity-error');
    const codeError = document.getElementById('abd-edit-code-error');
    const formError = document.getElementById('abd-form-error');
    [endDateError, capacityError, codeError, formError].forEach(el => el.hidden = true);
    endDateEl.classList.remove('error-state'); capacityEl.classList.remove('error-state');

    let valid = true;
    const startDate = document.getElementById('abd-edit-start').value;
    if (startDate && endDateEl.value && endDateEl.value < startDate) {
      endDateEl.classList.add('error-state'); endDateError.textContent = 'End date cannot be before the start date.'; endDateError.hidden = false; valid = false;
    }
    if (capacityEl.value && Number(capacityEl.value) <= 0) {
      capacityEl.classList.add('error-state'); capacityError.textContent = 'Capacity must be a positive number.'; capacityError.hidden = false; valid = false;
    }
    if (!valid) return;

    const btn = document.getElementById('abd-save-btn');
    const label = document.getElementById('abd-save-btn-label');
    const spinner = document.getElementById('abd-save-spinner');
    btn.disabled = true; label.textContent = 'Saving…'; spinner.hidden = false;
    try {
      await BatchService.updateBatch(abdCurrentBatchId, {
        name: document.getElementById('abd-edit-name').value.trim(),
        courseId: document.getElementById('abd-edit-course').value,
        batchCode: document.getElementById('abd-edit-code').value.trim(),
        startDate, endDate: endDateEl.value,
        schedule: document.getElementById('abd-edit-schedule').value.trim(),
        capacity: capacityEl.value ? Number(capacityEl.value) : null,
      });
      showToast('Batch details saved');
      openAdminBatchDetail(abdCurrentBatchId);
    } catch (err) {
      if (err.code === 'DUPLICATE_CODE') { document.getElementById('abd-edit-code').classList.add('error-state'); codeError.textContent = err.message; codeError.hidden = false; }
      else { formError.querySelector('span').textContent = err.message || 'Could not save changes. Please try again.'; formError.hidden = false; }
    } finally {
      btn.disabled = false; label.textContent = 'Save changes'; spinner.hidden = true;
    }
  });

  document.getElementById('abd-assign-teacher-btn').addEventListener('click', async () => {
    const sel = document.getElementById('abd-assign-teacher-select');
    const errorBox = document.getElementById('abd-teacher-error');
    errorBox.hidden = true;
    if (!sel.value || !abdCurrentBatchId) return;
    try {
      await BatchService.assignTeacher(abdCurrentBatchId, sel.value);
      showToast('Teacher assigned');
      refreshBatchDetailTeachers(abdCurrentBatchId);
    } catch (err) {
      errorBox.querySelector('span').textContent = err.message || 'Could not assign teacher.';
      errorBox.hidden = false;
    }
  });
}

// Loads the admin student list pre-filtered to one batch (from "View students" on batch detail).
async function loadAdminStudentListForBatch(batchId, batchLabel) {
  document.getElementById('asl-search-input').value = '';
  document.getElementById('asl-status-filter').value = '';
  const note = document.getElementById('abl-filter-note');
  // The student list screen doesn't have its own note UI; show via toast instead to avoid duplicating markup.
  showToast(`Showing students in ${batchLabel}`);
  const loading = document.getElementById('asl-loading');
  const empty = document.getElementById('asl-empty');
  const errorBox = document.getElementById('asl-error');
  const listEl = document.getElementById('asl-list');
  const pagination = document.getElementById('asl-pagination');
  loading.hidden = false; empty.hidden = true; errorBox.hidden = true; listEl.innerHTML = ''; pagination.hidden = true;
  try {
    const { students, total, pageSize } = await StudentService.listStudents({ page: 0, batchId });
    loading.hidden = true;
    if (students.length === 0) { document.getElementById('asl-empty-title').textContent = 'No students in this batch yet.'; empty.hidden = false; return; }
    listEl.innerHTML = students.map(s => {
      const name = (s.profiles && s.profiles.full_name) || (s.profiles && s.profiles.email) || 'Unnamed';
      const initial = name.trim().charAt(0).toUpperCase();
      const badgeClass = { active: 'badge-success', inactive: 'badge-muted', graduated: 'badge-info', suspended: 'badge-error' }[s.status] || 'badge-muted';
      return `
        <div class="profile-row" onclick="openAdminStudentDetail('${s.id}')">
          <div class="profile-row-icon">${initial}</div>
          <div class="grow"><div class="t-label">${escapeHtml(name)}</div><div class="t-support">#${escapeHtml(s.admission_number)}</div></div>
          <span class="badge ${badgeClass}">${s.status}</span>
        </div>`;
    }).join('');
    document.getElementById('asl-page-label').textContent = `Page 1 of ${Math.max(1, Math.ceil(total / pageSize))}`;
    document.getElementById('asl-prev-btn').disabled = true;
    document.getElementById('asl-next-btn').disabled = total <= pageSize;
    pagination.hidden = false;
  } catch (err) {
    loading.hidden = true;
    document.getElementById('asl-error-msg').textContent = err.message || 'Could not load students.';
    errorBox.hidden = false;
  }
}

// ---- Teacher: My Batches ----
async function openTeacherBatches() {
  Router.go('teacher-batches');
  const loading = document.getElementById('tb-loading');
  const empty = document.getElementById('tb-empty');
  const errorBox = document.getElementById('tb-error');
  const listEl = document.getElementById('tb-list');
  loading.hidden = false; empty.hidden = true; errorBox.hidden = true; listEl.innerHTML = '';

  const { user } = AuthState.getState();
  try {
    const teacher = await TeacherService.getCurrentTeacher(user.id);
    if (!teacher) { loading.hidden = true; empty.hidden = false; return; }
    const batches = await BatchService.getMyBatches(teacher.id);
    loading.hidden = true;
    if (batches.length === 0) { empty.hidden = false; return; }
    const badgeClass = { active: 'badge-success', inactive: 'badge-muted', upcoming: 'badge-info', completed: 'badge-warning' };
    listEl.innerHTML = batches.map(b => `
      <div class="profile-row">
        <div class="profile-row-icon">${escapeHtml((b.name || '?').charAt(0).toUpperCase())}</div>
        <div class="grow">
          <div class="t-label">${escapeHtml(b.name)}</div>
          <div class="t-support">${(b.courses && escapeHtml(b.courses.name)) || 'No course'}${b.batch_code ? ' · ' + escapeHtml(b.batch_code) : ''}</div>
        </div>
        <span class="badge ${badgeClass[b.status] || 'badge-muted'}">${b.status}</span>
      </div>
    `).join('');
  } catch (err) {
    loading.hidden = true;
    document.getElementById('tb-error-msg').textContent = err.message || 'Could not load your batches.';
    errorBox.hidden = false;
  }
}

async function loadTeacherDashboardBatches() {
  const { user } = AuthState.getState();
  const loading = document.getElementById('td-batches-loading');
  const empty = document.getElementById('td-batches-empty');
  const listEl = document.getElementById('td-batches-list');
  if (!user || !user.id || !loading) return;
  loading.hidden = false; empty.hidden = true; listEl.innerHTML = '';
  try {
    const teacher = await TeacherService.getCurrentTeacher(user.id);
    if (!teacher) { loading.hidden = true; empty.hidden = false; return; }
    const batches = await BatchService.getMyBatches(teacher.id);
    loading.hidden = true;
    if (batches.length === 0) { empty.hidden = false; return; }
    const badgeClass = { active: 'badge-success', inactive: 'badge-muted', upcoming: 'badge-info', completed: 'badge-warning' };
    listEl.innerHTML = batches.slice(0, 3).map(b => `
      <div class="profile-row">
        <div class="profile-row-icon">${escapeHtml((b.name || '?').charAt(0).toUpperCase())}</div>
        <div class="grow"><div class="t-label">${escapeHtml(b.name)}</div><div class="t-support">${(b.courses && escapeHtml(b.courses.name)) || 'No course'}</div></div>
        <span class="badge ${badgeClass[b.status] || 'badge-muted'}">${b.status}</span>
      </div>
    `).join('');
  } catch (err) {
    loading.hidden = true;
    empty.hidden = false;
  }
}

function initCourseBatchManagementNav() {
  const tbBack = document.getElementById('tb-back');
  if (tbBack) tbBack.addEventListener('click', () => Router.goToOwnDashboard());

  initAdminCourseManagement();
  initAdminBatchList();
  initAdminBatchAdd();
  initAdminBatchDetail();
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
  initTeacherManagementNav();
  initCourseBatchManagementNav();
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
