/**
 * Permissions & role navigation config
 * ------------------------------------------------------------------
 * Centralized so Student/Teacher/Admin authorization logic is never
 * duplicated across screens. This is a FOUNDATION only — it governs
 * what UI is shown, not real authorization. A real backend must
 * independently re-check every one of these permissions server-side
 * before performing any action; this file is not a security boundary.
 * ------------------------------------------------------------------
 */
const PERMISSIONS = Object.freeze({
  student: ['view_own_courses', 'view_own_classes', 'view_own_attendance', 'view_own_results'],
  teacher: ['view_assigned_batches', 'manage_attendance_assigned', 'manage_study_material_assigned', 'manage_tests_authorized'],
  admin: ['manage_students', 'manage_teachers', 'manage_courses', 'manage_batches', 'manage_fees', 'manage_announcements', 'manage_settings'],
});

function hasPermission(role, permission) {
  return Array.isArray(PERMISSIONS[role]) && PERMISSIONS[role].includes(permission);
}

/** icon keys map to the <svg> markup already defined once in index.html's <symbol> defs. */
const ROLE_NAV = Object.freeze({
  student: [
    { key: 'home', label: 'Home', icon: 'icon-home' },
    { key: 'courses', label: 'Courses', icon: 'icon-courses' },
    { key: 'classes', label: 'Classes', icon: 'icon-classes' },
    { key: 'tests', label: 'Tests', icon: 'icon-tests' },
    { key: 'profile', label: 'Profile', icon: 'icon-profile' },
  ],
  teacher: [
    { key: 'home', label: 'Home', icon: 'icon-home' },
    { key: 'batches', label: 'Batches', icon: 'icon-courses' },
    { key: 'students', label: 'Students', icon: 'icon-classes' },
    { key: 'tests', label: 'Tests', icon: 'icon-tests' },
    { key: 'profile', label: 'Profile', icon: 'icon-profile' },
  ],
  admin: [
    { key: 'home', label: 'Dashboard', icon: 'icon-home' },
    { key: 'students', label: 'Students', icon: 'icon-classes' },
    { key: 'teachers', label: 'Teachers', icon: 'icon-courses' },
    { key: 'fees', label: 'Fees', icon: 'icon-tests' },
    { key: 'profile', label: 'Profile', icon: 'icon-profile' },
  ],
});

const ROLE_LABEL = Object.freeze({ student: 'Student', teacher: 'Teacher', admin: 'Admin' });
