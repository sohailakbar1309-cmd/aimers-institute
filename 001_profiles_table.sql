-- ============================================================
-- Aimers Institute — Phase 3
-- profiles table + Row Level Security
-- ============================================================
-- Run this in your Supabase project's SQL editor
-- (Dashboard → SQL Editor → New query). This is NOT applied
-- automatically — no live Supabase project is connected in this
-- build environment, so this script is the deliverable itself.
--
-- Safe to re-run: uses IF NOT EXISTS / CREATE OR REPLACE / DROP
-- POLICY IF EXISTS throughout.
-- ============================================================

-- ---------------------------------------------------------------
-- 1. Table
-- ---------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  email       text,
  phone       text,
  role        text check (role in ('student', 'teacher', 'admin')), -- NULL until an admin assigns one
  avatar_url  text,
  batch_id    text,
  status      text not null default 'active' check (status in ('active', 'disabled')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.profiles is
  'One row per authenticated Aimers Institute user. role is NULL until an administrator assigns one through a controlled process (Supabase dashboard / service-role backend job) — it is never set by the client.';

-- ---------------------------------------------------------------
-- 2. Auto-create a bare profile row when a new auth user signs up
-- ---------------------------------------------------------------
-- Runs as the table owner (security definer) specifically so it can
-- insert into profiles despite RLS forbidding client-side inserts
-- (see section 4). This is the ONLY path that creates a profiles
-- row — role is intentionally left NULL, so the app shows the
-- "account not ready" state (see supabase-auth-provider.js) until
-- an administrator assigns a role directly in the database.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, status)
  values (new.id, new.email, 'active');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------
-- 3. Keep updated_at current
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

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------
-- 4. Row Level Security — minimal, intentionally, for this phase
-- ---------------------------------------------------------------
alter table public.profiles enable row level security;

-- A user may read only their own profile row.
-- (No "admins can read every profile" policy yet — that requires a
-- security-definer helper function to check the caller's role
-- without the classic self-referencing-RLS infinite recursion
-- problem, and is deliberately deferred to the phase that builds
-- real admin management features rather than added speculatively.)
drop policy if exists "select_own_profile" on public.profiles;
create policy "select_own_profile"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

-- A user may update only their own profile row, AND (via the
-- column privileges below) only non-sensitive columns — never
-- their own role or status. There is intentionally no INSERT
-- policy for authenticated users: rows are created only by the
-- handle_new_user trigger above, and DELETE is not permitted at
-- all from the client.
drop policy if exists "update_own_profile" on public.profiles;
create policy "update_own_profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ---------------------------------------------------------------
-- 5. Column-level privileges
-- ---------------------------------------------------------------
-- RLS controls WHICH ROWS a policy applies to; it does not by
-- itself stop a user from writing to a column a row-policy lets
-- them touch. Explicit column grants are what stop a student from
-- setting role = 'admin' on their own row.
revoke all on public.profiles from authenticated;
grant select (id, full_name, email, phone, role, avatar_url, batch_id, status, created_at, updated_at)
  on public.profiles to authenticated;
grant update (full_name, phone, avatar_url)
  on public.profiles to authenticated;
-- role, status, email, batch_id are deliberately NOT grant-updatable
-- by authenticated users. Change them only via the Supabase
-- dashboard's table editor or a service-role backend job.
