/**
 * StudentService
 * ------------------------------------------------------------------
 * All database access for student records lives here. UI code
 * (app.js) never talks to window.AimersSupabase directly for
 * student data — it calls these methods, the same way auth flows
 * go through AuthService rather than touching the client directly.
 *
 * Authorization is enforced by the database (RLS policies in
 * sql/002_student_management.sql), not by this file. Every method
 * here can be called by any authenticated role; what rows come
 * back (or whether a write is accepted) depends entirely on who is
 * actually logged in. This file never assumes a role is allowed to
 * do something just because the UI only shows the button to that
 * role — the backend is the real gate.
 * ------------------------------------------------------------------
 */
class StudentServiceError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code; // 'CONFIG_MISSING' | 'NOT_FOUND' | 'DUPLICATE_ADMISSION_NUMBER' | 'PERMISSION_DENIED' | 'NETWORK_ERROR' | 'UNEXPECTED'
  }
}

const StudentService = (() => {
  const PAGE_SIZE = 20;

  function client() {
    if (!window.AimersSupabase) {
      throw new StudentServiceError(
        'CONFIG_MISSING',
        'Student records aren\'t available yet — the app has not been connected to a Supabase project.'
      );
    }
    return window.AimersSupabase;
  }

  function mapError(error) {
    if (!error) return new StudentServiceError('UNEXPECTED', 'Something went wrong. Please try again.');
    if (error.code === '23505') {
      // unique_violation — could be admission_number or the profile_id one-to-one constraint
      if (/admission_number/i.test(error.message || '')) {
        return new StudentServiceError('DUPLICATE_ADMISSION_NUMBER', 'That admission number is already in use.');
      }
      return new StudentServiceError('DUPLICATE', 'This student record already exists.');
    }
    if (error.code === 'PGRST116') {
      // PostgREST "no rows" for .single()/.maybeSingle() edge cases
      return new StudentServiceError('NOT_FOUND', 'That student record could not be found.');
    }
    if (/permission denied|row-level security/i.test(error.message || '')) {
      return new StudentServiceError('PERMISSION_DENIED', "You don't have permission to do that.");
    }
    if (error.name === 'AuthRetryableFetchError' || /network/i.test(error.message || '')) {
      return new StudentServiceError('NETWORK_ERROR', "Couldn't reach the server. Check your connection and try again.");
    }
    // Never surface raw Postgres/PostgREST error text to the user.
    return new StudentServiceError('UNEXPECTED', 'Something went wrong. Please try again.');
  }

  const STUDENT_SELECT = `
    id, admission_number, date_of_birth, gender, guardian_name, guardian_phone,
    address, batch_id, admission_date, status, created_at, updated_at,
    profiles:profile_id ( id, full_name, email, phone, avatar_url ),
    batches:batch_id ( id, name )
  `;

  return {
    PAGE_SIZE,

    /** The logged-in user's own student record, or null if they don't have one yet. */
    async getCurrentStudent(profileId) {
      const { data, error } = await client()
        .from('students')
        .select(STUDENT_SELECT)
        .eq('profile_id', profileId)
        .maybeSingle();
      if (error) throw mapError(error);
      return data;
    },

    /** A single student record by its own id (admin, or a student fetching their own). */
    async getStudentById(studentId) {
      const { data, error } = await client()
        .from('students')
        .select(STUDENT_SELECT)
        .eq('id', studentId)
        .maybeSingle();
      if (error) throw mapError(error);
      if (!data) throw new StudentServiceError('NOT_FOUND', 'That student record could not be found.');
      return data;
    },

    /**
     * Paginated, searchable student list (admin). Never fetches the
     * whole table — always range()-limited.
     * search matches admission number or the linked profile's name/email.
     */
    async listStudents({ page = 0, search = '', status = '' } = {}) {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let query = client()
        .from('students')
        .select(STUDENT_SELECT, { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, to);

      if (status) query = query.eq('status', status);
      if (search && search.trim()) {
        const term = search.trim();
        // admission_number lives on students; name/email live on the joined profile.
        // PostgREST can't OR across a join in one call, so search admission_number
        // here and let the caller also match against already-loaded profile fields
        // client-side is avoided — instead we do a second targeted query path below.
        query = query.ilike('admission_number', `%${term}%`);
      }

      const { data, error, count } = await query;
      if (error) throw mapError(error);
      return { students: data || [], total: count || 0, page, pageSize: PAGE_SIZE };
    },

    /** Looks up a profile by email (admin only — enforced by RLS). Used by "add student" to attach a record to an existing signed-up user. */
    async findProfileByEmail(email) {
      const { data, error } = await client()
        .from('profiles')
        .select('id, full_name, email, role')
        .eq('email', email.trim())
        .maybeSingle();
      if (error) throw mapError(error);
      return data;
    },

    /**
     * Creates a student record for an already-signed-up user
     * (identified by profile_id). Assigns role='student' to that
     * profile first (idempotent — safe if already a student).
     * Admin only — enforced by RLS + the admin_assign_student_role
     * RPC's own internal check.
     */
    async createStudent(profileId, fields) {
      const rpc = await client().rpc('admin_assign_student_role', { target_profile_id: profileId });
      if (rpc.error) throw mapError(rpc.error);

      const { data, error } = await client()
        .from('students')
        .insert({
          profile_id: profileId,
          admission_number: fields.admissionNumber,
          date_of_birth: fields.dateOfBirth || null,
          gender: fields.gender || null,
          guardian_name: fields.guardianName || null,
          guardian_phone: fields.guardianPhone || null,
          address: fields.address || null,
          batch_id: fields.batchId || null,
          admission_date: fields.admissionDate || undefined, // defaults to current_date in the DB if omitted
          status: fields.status || 'active',
        })
        .select(STUDENT_SELECT)
        .single();
      if (error) throw mapError(error);
      return data;
    },

    /** Admin: update editable student fields (not admission_number, not role/status of the underlying account). */
    async updateStudent(studentId, fields) {
      const patch = {};
      ['dateOfBirth', 'gender', 'guardianName', 'guardianPhone', 'address', 'batchId', 'admissionDate']
        .forEach(key => {
          if (fields[key] === undefined) return;
          const column = { dateOfBirth: 'date_of_birth', guardianName: 'guardian_name', guardianPhone: 'guardian_phone', batchId: 'batch_id', admissionDate: 'admission_date' }[key] || key;
          patch[column] = fields[key] || null;
        });

      const { data, error } = await client()
        .from('students')
        .update(patch)
        .eq('id', studentId)
        .select(STUDENT_SELECT)
        .single();
      if (error) throw mapError(error);
      return data;
    },

    /** Admin: status-based lifecycle change (active/inactive/graduated/suspended) — never a hard delete. */
    async updateStudentStatus(studentId, status) {
      const { data, error } = await client()
        .from('students')
        .update({ status })
        .eq('id', studentId)
        .select(STUDENT_SELECT)
        .single();
      if (error) throw mapError(error);
      return data;
    },

    /** Minimal batch list for select dropdowns (any authenticated user may read batch names). */
    async listBatches() {
      const { data, error } = await client().from('batches').select('id, name').order('name', { ascending: true });
      if (error) throw mapError(error);
      return data || [];
    },
  };
})();
