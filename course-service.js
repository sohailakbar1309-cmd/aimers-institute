/**
 * CourseService — mirrors StudentService/TeacherService's pattern.
 */
class CourseServiceError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

const CourseService = (() => {
  function client() {
    if (!window.AimersSupabase) throw new CourseServiceError('CONFIG_MISSING', 'Courses aren\'t available yet — the app has not been connected to a Supabase project.');
    return window.AimersSupabase;
  }

  function mapError(error) {
    if (!error) return new CourseServiceError('UNEXPECTED', 'Something went wrong. Please try again.');
    if (error.code === '23505') return new CourseServiceError('DUPLICATE_CODE', 'That course code is already in use.');
    if (/permission denied|row-level security/i.test(error.message || '')) return new CourseServiceError('PERMISSION_DENIED', "You don't have permission to do that.");
    if (/network/i.test(error.message || '')) return new CourseServiceError('NETWORK_ERROR', "Couldn't reach the server. Check your connection and try again.");
    return new CourseServiceError('UNEXPECTED', 'Something went wrong. Please try again.');
  }

  return {
    async listCourses({ search = '' } = {}) {
      let query = client().from('courses').select('*').order('name', { ascending: true });
      if (search && search.trim()) query = query.or(`name.ilike.%${search.trim()}%,code.ilike.%${search.trim()}%`);
      const { data, error } = await query;
      if (error) throw mapError(error);
      return data || [];
    },
    async getCourse(id) {
      const { data, error } = await client().from('courses').select('*').eq('id', id).maybeSingle();
      if (error) throw mapError(error);
      if (!data) throw new CourseServiceError('NOT_FOUND', 'That course could not be found.');
      return data;
    },
    async createCourse(fields) {
      const { data, error } = await client().from('courses').insert({
        name: fields.name, code: fields.code, description: fields.description || null,
        duration: fields.duration || null, status: fields.status || 'active',
      }).select('*').single();
      if (error) throw mapError(error);
      return data;
    },
    async updateCourse(id, fields) {
      const patch = {};
      ['name', 'description', 'duration'].forEach(k => { if (fields[k] !== undefined) patch[k] = fields[k] || null; });
      const { data, error } = await client().from('courses').update(patch).eq('id', id).select('*').single();
      if (error) throw mapError(error);
      return data;
    },
    async updateCourseStatus(id, status) {
      const { data, error } = await client().from('courses').update({ status }).eq('id', id).select('*').single();
      if (error) throw mapError(error);
      return data;
    },
  };
})();
