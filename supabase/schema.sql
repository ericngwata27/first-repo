-- =========================================================
-- planmyfuture: database setup
--
-- HOW TO USE: Supabase dashboard -> SQL Editor -> New query ->
-- paste this whole file -> Run. It's safe to run again.
-- Then do the same with delete-account.sql (the "Delete my account" button).
--
-- One row per person holds their whole planner, in the same shape
-- as the "Export my data" file (see DATA_MODEL.md). That way the
-- website's save("universities") etc. maps straight onto one column.
-- =========================================================

create table if not exists public.planner_data (
  -- Whose data this is. Filled in automatically from the signed-in user.
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  universities jsonb not null default '[]',          -- DATA_MODEL.md section 1 (and 2)
  timeline jsonb not null default '{}',              -- section 3 and 4
  profile jsonb not null default '{}',               -- section 5
  academic_profile jsonb not null default '{}',      -- section 6
  settings jsonb not null default '{}',              -- section 7: { globe: {...} } (never the API key)
  updated_at timestamptz not null default now()
);

-- ----- Security: everyone can only see and change their OWN row -----
-- Row Level Security (RLS) checks every request against the rules below.
alter table public.planner_data enable row level security;

drop policy if exists "Read your own planner" on public.planner_data;
create policy "Read your own planner" on public.planner_data
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Create your own planner" on public.planner_data;
create policy "Create your own planner" on public.planner_data
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Update your own planner" on public.planner_data;
create policy "Update your own planner" on public.planner_data
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Delete your own planner" on public.planner_data;
create policy "Delete your own planner" on public.planner_data
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Signed-in users may use the table (the rules above still apply).
-- Visitors who aren't signed in ("anon") get nothing.
grant select, insert, update, delete on public.planner_data to authenticated;
revoke all on public.planner_data from anon;

-- Keep updated_at current on every change
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists planner_data_touch on public.planner_data;
create trigger planner_data_touch
  before update on public.planner_data
  for each row execute function public.touch_updated_at();
