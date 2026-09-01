-- Aimers Institute — Phase 5 — Teacher Management
-- Run AFTER 001 and 002. Safe to re-run.

create table if not exists public.teachers (
  id               uuid primary key default gen_random_uuid(),
  profile_id       uuid not null unique references public.profiles(id) on delete cascade,
  employee_code    text not null unique,
  phone            text,
  subject          text,
  qualification    text,
  joining_date     date not null default current_date,
  status           text not null default 'active'
                   check (status in ('active', 'inactive', 'on_leave')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.teachers is
  'Teacher-specific record, one-to-one with a profiles row whose role = ''teacher''.';

create index if not exists teachers_status_idx on public.teachers(status);
create index if not exists teachers_employee_code_idx on public.teachers(employee_code);

drop trigger if exists set_teachers_updated_at on public.teachers;
create trigger set_teachers_updated_at
  before update on public.teachers
  for each row execute function public.touch_updated_at();

alter table public.teachers enable row level security;

-- A teacher may read only their own record.
drop policy if exists "teachers_select_own" on public.teachers;
create policy "teachers_select_own"
  on public.teachers for select
  to authenticated
  using (profile_id = auth.uid());

-- Admin: full access (reuses the is_admin() helper from 002).
drop policy if exists "teachers_admin_all" on public.teachers;
create policy "teachers_admin_all"
  on public.teachers for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select, insert, update, delete on public.teachers to authenticated;

-- Narrow, audited path to onboard an already-signed-up user as a
-- teacher — same shape as admin_assign_student_role from 002.
create or replace function public.admin_assign_teacher_role(target_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only an administrator can assign a role.';
  end if;
  update public.profiles set role = 'teacher' where id = target_profile_id;
end;
$$;

grant execute on function public.admin_assign_teacher_role(uuid) to authenticated;
