/**
 * TeacherService — mirrors StudentService's pattern for teachers.
 * All teacher DB access lives here, not in UI code.
 */
class TeacherServiceError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const TeacherService = (() => {
  const PAGE_SIZE = 20;

  function client() {
    if (!window.AimersSupabase) {
      throw new TeacherServiceError('CONFIG_MISSING', 'Teacher records aren\'t available yet — the app has not been connected to a Supabase project.');
    }
    return window.AimersSupabase;
  }

  function mapError(error) {
    if (!error) return new TeacherServiceError('UNEXPECTED', 'Something went wrong. Please try again.');
    if (error.code === '23505') {
      if (/employee_code/i.test(error.message || '')) {
        return new TeacherServiceError('DUPLICATE_EMPLOYEE_CODE', 'That employee code is already in use.');
      }
      return new TeacherServiceError('DUPLICATE', 'This teacher record already exists.');
    }
    if (/permission denied|row-level security/i.test(error.message || '')) {
      return new TeacherServiceError('PERMISSION_DENIED', "You don't have permission to do that.");
    }
    if (/network/i.test(error.message || '')) {
      return new TeacherServiceError('NETWORK_ERROR', "Couldn't reach the server. Check your connection and try again.");
    }
    return new TeacherServiceError('UNEXPECTED', 'Something went wrong. Please try again.');
  }

  const TEACHER_SELECT = `
    id, employee_code, phone, subject, qualification, joining_date, status, created_at, updated_at,
    profiles:profile_id ( id, full_name, email, avatar_url )
  `;

  return {
    PAGE_SIZE,

    async getCurrentTeacher(profileId) {
      const { data, error } = await client().from('teachers').select(TEACHER_SELECT).eq('profile_id', profileId).maybeSingle();
      if (error) throw mapError(error);
      return data;
    },

    async getTeacherById(teacherId) {
      const { data, error } = await client().from('teachers').select(TEACHER_SELECT).eq('id', teacherId).maybeSingle();
      if (error) throw mapError(error);
      if (!data) throw new TeacherServiceError('NOT_FOUND', 'That teacher record could not be found.');
      return data;
    },

    async listTeachers({ page = 0, search = '', status = '' } = {}) {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      let query = client().from('teachers').select(TEACHER_SELECT, { count: 'exact' }).order('created_at', { ascending: false }).range(from, to);
      if (status) query = query.eq('status', status);
      if (search && search.trim()) {
        const term = search.trim();
        query = query.or(`employee_code.ilike.%${term}%,subject.ilike.%${term}%`);
      }
      const { data, error, count } = await query;
      if (error) throw mapError(error);
      return { teachers: data || [], total: count || 0, page, pageSize: PAGE_SIZE };
    },

    async findProfileByEmail(email) {
      const { data, error } = await client().from('profiles').select('id, full_name, email, role').eq('email', email.trim()).maybeSingle();
      if (error) throw mapError(error);
      return data;
    },

    async createTeacher(profileId, fields) {
      const rpc = await client().rpc('admin_assign_teacher_role', { target_profile_id: profileId });
      if (rpc.error) throw mapError(rpc.error);
      const { data, error } = await client()
        .from('teachers')
        .insert({
          profile_id: profileId,
          employee_code: fields.employeeCode,
          phone: fields.phone || null,
          subject: fields.subject || null,
          qualification: fields.qualification || null,
          joining_date: fields.joiningDate || undefined,
          status: fields.status || 'active',
        })
        .select(TEACHER_SELECT)
        .single();
      if (error) throw mapError(error);
      return data;
    },

    async updateTeacher(teacherId, fields) {
      const patch = {};
      ['phone', 'subject', 'qualification'].forEach(key => { if (fields[key] !== undefined) patch[key] = fields[key] || null; });
      if (fields.joiningDate !== undefined) patch.joining_date = fields.joiningDate || null;
      const { data, error } = await client().from('teachers').update(patch).eq('id', teacherId).select(TEACHER_SELECT).single();
      if (error) throw mapError(error);
      return data;
    },

    async updateTeacherStatus(teacherId, status) {
      const { data, error } = await client().from('teachers').update({ status }).eq('id', teacherId).select(TEACHER_SELECT).single();
      if (error) throw mapError(error);
      return data;
    },
  };
})();
