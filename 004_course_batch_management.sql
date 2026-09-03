-- Aimers Institute — Phase 6 — Course & Batch Management
-- Run AFTER 001, 002, 003. Safe to re-run.
-- Extends (does not recreate) the minimal `batches` table from 002.

-- ---------------------------------------------------------------
-- 1. Courses
-- ---------------------------------------------------------------
create table if not exists public.courses (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  code         text not null unique,
  description  text,
  duration     text,
  status       text not null default 'active' check (status in ('active', 'inactive', 'archived')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists courses_status_idx on public.courses(status);

drop trigger if exists set_courses_updated_at on public.courses;
create trigger set_courses_updated_at
  before update on public.courses
  for each row execute function public.touch_updated_at();

alter table public.courses enable row level security;

drop policy if exists "courses_select_authenticated" on public.courses;
create policy "courses_select_authenticated"
  on public.courses for select to authenticated using (true);

drop policy if exists "courses_admin_write" on public.courses;
create policy "courses_admin_write"
  on public.courses for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.courses to authenticated;

-- ---------------------------------------------------------------
-- 2. Extend the existing `batches` table (created in 002) rather
--    than recreating it — students.batch_id already references it.
-- ---------------------------------------------------------------
alter table public.batches add column if not exists course_id uuid references public.courses(id) on delete set null;
alter table public.batches add column if not exists batch_code text;
alter table public.batches add column if not exists start_date date;
alter table public.batches add column if not exists end_date date;
alter table public.batches add column if not exists schedule text;
alter table public.batches add column if not exists capacity integer;
alter table public.batches add column if not exists status text not null default 'upcoming';
alter table public.batches add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'batches_status_check') then
    alter table public.batches add constraint batches_status_check
      check (status in ('upcoming', 'active', 'completed', 'inactive'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'batches_capacity_check') then
    alter table public.batches add constraint batches_capacity_check
      check (capacity is null or capacity > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'batches_dates_check') then
    alter table public.batches add constraint batches_dates_check
      check (start_date is null or end_date is null or end_date >= start_date);
  end if;
end $$;

create unique index if not exists batches_batch_code_key on public.batches(batch_code) where batch_code is not null;
create index if not exists batches_course_id_idx on public.batches(course_id);
create index if not exists batches_status_idx on public.batches(status);

drop trigger if exists set_batches_updated_at on public.batches;
create trigger set_batches_updated_at
  before update on public.batches
  for each row execute function public.touch_updated_at();

-- batches_select_authenticated / batches_admin_write already exist
-- from 002 and need no change — batch metadata (including the new
-- columns) is not sensitive, same reasoning as batch names.

-- ---------------------------------------------------------------
-- 3. Teacher ↔ Batch junction
-- ---------------------------------------------------------------
create table if not exists public.batch_teachers (
  batch_id    uuid not null references public.batches(id) on delete cascade,
  teacher_id  uuid not null references public.teachers(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (batch_id, teacher_id)
);

alter table public.batch_teachers enable row level security;

-- A teacher may see their own assignments (for "My Batches").
drop policy if exists "batch_teachers_select_own" on public.batch_teachers;
create policy "batch_teachers_select_own"
  on public.batch_teachers for select to authenticated
  using (exists (select 1 from public.teachers t where t.id = teacher_id and t.profile_id = auth.uid()));

drop policy if exists "batch_teachers_admin_all" on public.batch_teachers;
create policy "batch_teachers_admin_all"
  on public.batch_teachers for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.batch_teachers to authenticated;

-- ---------------------------------------------------------------
-- 4. Student ↔ Batch: unchanged. students.batch_id (single FK,
--    added in 002) is preserved as-is — a many-to-many relationship
--    isn't required for this institute's architecture, and changing
--    it now would risk existing student records for no benefit.
-- ---------------------------------------------------------------
