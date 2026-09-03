/**
 * BatchService — batches + batch_teachers junction.
 */
class BatchServiceError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

const BatchService = (() => {
  const PAGE_SIZE = 20;

  function client() {
    if (!window.AimersSupabase) throw new BatchServiceError('CONFIG_MISSING', 'Batches aren\'t available yet — the app has not been connected to a Supabase project.');
    return window.AimersSupabase;
  }

  function mapError(error) {
    if (!error) return new BatchServiceError('UNEXPECTED', 'Something went wrong. Please try again.');
    if (error.code === '23505') {
      if (/batch_code/i.test(error.message || '')) return new BatchServiceError('DUPLICATE_CODE', 'That batch code is already in use.');
      if (/batch_teachers/i.test(error.message || '')) return new BatchServiceError('DUPLICATE_ASSIGNMENT', 'This teacher is already assigned to the batch.');
      return new BatchServiceError('DUPLICATE', 'This record already exists.');
    }
    if (error.code === '23514') return new BatchServiceError('INVALID_DATA', 'Check the dates and capacity — one of them is invalid.');
    if (/permission denied|row-level security/i.test(error.message || '')) return new BatchServiceError('PERMISSION_DENIED', "You don't have permission to do that.");
    if (/network/i.test(error.message || '')) return new BatchServiceError('NETWORK_ERROR', "Couldn't reach the server. Check your connection and try again.");
    return new BatchServiceError('UNEXPECTED', 'Something went wrong. Please try again.');
  }

  const BATCH_SELECT = `id, name, batch_code, course_id, start_date, end_date, schedule, capacity, status, created_at, updated_at, courses:course_id ( id, name, code )`;

  return {
    PAGE_SIZE,

    async listBatches({ page = 0, search = '', status = '', courseId = '' } = {}) {
      const from = page * PAGE_SIZE, to = from + PAGE_SIZE - 1;
      let query = client().from('batches').select(BATCH_SELECT, { count: 'exact' }).order('created_at', { ascending: false }).range(from, to);
      if (status) query = query.eq('status', status);
      if (courseId) query = query.eq('course_id', courseId);
      if (search && search.trim()) query = query.or(`name.ilike.%${search.trim()}%,batch_code.ilike.%${search.trim()}%`);
      const { data, error, count } = await query;
      if (error) throw mapError(error);
      return { batches: data || [], total: count || 0, page, pageSize: PAGE_SIZE };
    },

    async getBatch(id) {
      const { data, error } = await client().from('batches').select(BATCH_SELECT).eq('id', id).maybeSingle();
      if (error) throw mapError(error);
      if (!data) throw new BatchServiceError('NOT_FOUND', 'That batch could not be found.');
      return data;
    },

    async createBatch(fields) {
      const { data, error } = await client().from('batches').insert({
        name: fields.name, batch_code: fields.batchCode || null, course_id: fields.courseId || null,
        start_date: fields.startDate || null, end_date: fields.endDate || null,
        schedule: fields.schedule || null, capacity: fields.capacity || null,
        status: fields.status || 'upcoming',
      }).select(BATCH_SELECT).single();
      if (error) throw mapError(error);
      return data;
    },

    async updateBatch(id, fields) {
      const patch = {};
      ['name', 'schedule'].forEach(k => { if (fields[k] !== undefined) patch[k] = fields[k] || null; });
      if (fields.courseId !== undefined) patch.course_id = fields.courseId || null;
      if (fields.batchCode !== undefined) patch.batch_code = fields.batchCode || null;
      if (fields.startDate !== undefined) patch.start_date = fields.startDate || null;
      if (fields.endDate !== undefined) patch.end_date = fields.endDate || null;
      if (fields.capacity !== undefined) patch.capacity = fields.capacity || null;
      const { data, error } = await client().from('batches').update(patch).eq('id', id).select(BATCH_SELECT).single();
      if (error) throw mapError(error);
      return data;
    },

    async updateBatchStatus(id, status) {
      const { data, error } = await client().from('batches').update({ status }).eq('id', id).select(BATCH_SELECT).single();
      if (error) throw mapError(error);
      return data;
    },

    async getBatchTeachers(batchId) {
      const { data, error } = await client().from('batch_teachers').select('teacher_id, teachers:teacher_id ( id, employee_code, subject, profiles:profile_id ( full_name, email ) )').eq('batch_id', batchId);
      if (error) throw mapError(error);
      return data || [];
    },

    async assignTeacher(batchId, teacherId) {
      const { error } = await client().from('batch_teachers').insert({ batch_id: batchId, teacher_id: teacherId });
      if (error) throw mapError(error);
    },

    async removeTeacher(batchId, teacherId) {
      const { error } = await client().from('batch_teachers').delete().eq('batch_id', batchId).eq('teacher_id', teacherId);
      if (error) throw mapError(error);
    },

    /** Count-only — never fetches full student rows just to display a number. */
    async getBatchStudentCount(batchId) {
      const { count, error } = await client().from('students').select('id', { count: 'exact', head: true }).eq('batch_id', batchId);
      if (error) throw mapError(error);
      return count || 0;
    },

    /** For a teacher: the batches they're assigned to (via batch_teachers, RLS-scoped to their own rows). */
    async getMyBatches(teacherId) {
      const { data, error } = await client().from('batch_teachers').select('batch_id, batches:batch_id ( id, name, batch_code, status, courses:course_id ( name ) )').eq('teacher_id', teacherId);
      if (error) throw mapError(error);
      return (data || []).map(row => row.batches).filter(Boolean);
    },
  };
})();
