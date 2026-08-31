-- ============================================================
-- Aimers Institute — Phase 4
-- Student Management: students + batches foundation + RLS
-- ============================================================
-- Run this in your Supabase project's SQL editor AFTER
-- 001_profiles_table.sql has already been run (this migration
-- references public.profiles and reuses its touch_updated_at()
-- trigger function).
--
-- Safe to re-run: uses IF NOT EXISTS / CREATE OR REPLACE / DROP
-- POLICY IF EXISTS throughout.
-- ============================================================

-- ---------------------------------------------------------------
-- 0. Shared trigger helper (idempotent — may already exist from
--    001_profiles_table.sql; recreated here so this file is also
--    safe to run standalone against a profiles table that already
--    exists but was created some other way).
-- ---------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------
-- 1. Batches — MINIMAL foundation only.
--    Full Batch Management (schedules, teacher assignment,
--    capacity, etc.) is a later phase. This table exists only so
--    students can be associated with a batch.
-- ---------------------------------------------------------------
create table if not exists public.batches (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

comment on table public.batches is
  'Minimal foundation for student → batch assignment. Full batch management (schedule, teacher, capacity) is a later phase.';

alter table public.batches enable row level security;

-- Batch names aren't sensitive — any authenticated user may read
-- the list (needed to show "My batch" and for admin assignment
-- dropdowns). Only an admin may create/change batches.
drop policy if exists "batches_select_authenticated" on public.batches;
create policy "batches_select_authenticated"
  on public.batches for select
  to authenticated
  using (true);

drop policy if exists "batches_admin_write" on public.batches;
create policy "batches_admin_write"
  on public.batches for all
  to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin' and p.status = 'active'
  ))
  with check (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin' and p.status = 'active'
  ));

grant select, insert, update, delete on public.batches to authenticated;

-- ---------------------------------------------------------------
-- 2. Students
-- ---------------------------------------------------------------
create table if not exists public.students (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid not null unique references public.profiles(id) on delete cascade,
  admission_number text not null unique,
  date_of_birth   date,
  gender          text check (gender in ('male', 'female', 'other')),
  guardian_name   text,
  guardian_phone  text,
  address         text,
  batch_id        uuid references public.batches(id) on delete set null,
  admission_date  date not null default current_date,
  status          text not null default 'active'
                  check (status in ('active', 'inactive', 'graduated', 'suspended')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.students is
  'Student-specific record, one-to-one with a profiles row whose role = ''student''. Identity/auth stays in auth.users + profiles; this table only holds institute-specific student data.';

create index if not exists students_batch_id_idx on public.students(batch_id);
create index if not exists students_status_idx on public.students(status);
create index if not exists students_admission_number_idx on public.students(admission_number);

drop trigger if exists set_students_updated_at on public.students;
create trigger set_students_updated_at
  before update on public.students
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------
-- 3. Row Level Security
-- ---------------------------------------------------------------
alter table public.students enable row level security;

-- A student may read only their own student record. There is
-- intentionally NO update/insert/delete policy for students —
-- students cannot edit any student-record field (including
-- guardian/address/batch) in this phase. All writes go through
-- the admin policy below.
drop policy if exists "students_select_own" on public.students;
create policy "students_select_own"
  on public.students for select
  to authenticated
  using (profile_id = auth.uid());

-- Teacher access is intentionally NOT granted yet — there is no
-- teacher/batch authorization model built yet (that requires a
-- teacher-batch assignment table, which is a later phase). Adding
-- broad teacher read access now ("authenticated users can read all
-- students") would be insecure, so it is deliberately deferred.

-- An active admin may read and write every student record. This
-- reuses the same auth.uid()-scoped subquery pattern as
-- batches_admin_write above — it queries the caller's OWN profiles
-- row (already readable via select_own_profile from 001), so there
-- is no self-referencing-RLS recursion.
drop policy if exists "students_admin_all" on public.students;
create policy "students_admin_all"
  on public.students for all
  to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin' and p.status = 'active'
  ))
  with check (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin' and p.status = 'active'
  ));

-- Table-level grant. RLS policies above (not this grant) are what
-- actually decide which rows/operations a given user can touch —
-- without this grant, Postgres would deny access before RLS is
-- even evaluated.
grant select, insert, update, delete on public.students to authenticated;

-- ---------------------------------------------------------------
-- 4. Admin read/assign access on profiles — a NECESSARY, additive
--    extension of 001_profiles_table.sql (that file is not edited;
--    these are new objects only).
--
--    Why this is needed now: Student Management requires an admin
--    to (a) look up an existing signed-up user by email to attach
--    a student record to them, and (b) assign role = 'student' to
--    that user. 001 deliberately left both out ("deferred to the
--    phase that builds real admin management features" — this is
--    that phase, scoped to exactly what Student Management needs).
--
--    A plain "exists (select ... from profiles where id=auth.uid()
--    and role='admin')" policy DIRECTLY on the profiles table (as
--    used for students/batches above, on OTHER tables) causes
--    self-referencing RLS recursion when applied to profiles
--    itself. A SECURITY DEFINER helper function breaks that loop
--    by reading profiles once, bypassing RLS, before any policy
--    on profiles is evaluated.
-- ---------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and status = 'active'
  );
$$;

-- Read-only: lets an admin see every profile (needed for the
-- student list — showing each student's name/email — and to look
-- up a profile by email when adding a student). Does NOT grant any
-- write access to profiles; 001's tight self-service write rules
-- (full_name/phone/avatar_url only, never role/status/email) are
-- completely unchanged.
drop policy if exists "profiles_admin_select" on public.profiles;
create policy "profiles_admin_select"
  on public.profiles for select
  to authenticated
  using (public.is_admin());

-- Narrow, audited path for an admin to onboard an already-signed-up
-- user as a student. Deliberately NOT a general "update role"
-- function — it can only ever set role to 'student', nothing else,
-- so even if this were somehow called by a non-admin the exception
-- fires and nothing changes; and even a legitimate admin call can
-- never be used to grant 'teacher' or 'admin' through this path.
create or replace function public.admin_assign_student_role(target_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only an administrator can assign a role.';
  end if;
  update public.profiles set role = 'student' where id = target_profile_id;
end;
$$;

grant execute on function public.admin_assign_student_role(uuid) to authenticated;
