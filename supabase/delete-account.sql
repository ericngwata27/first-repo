-- =========================================================
-- planmyfuture: "Delete my account"
--
-- HOW TO USE: Supabase dashboard -> SQL Editor -> New query ->
-- paste this whole file -> Run. It's safe to run again.
-- (Run it after schema.sql.)
--
-- The website's key isn't allowed to delete users (good: nobody can
-- delete someone else). This function runs with the database's own
-- rights, but ONLY ever deletes the person who calls it.
-- =========================================================

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer          -- runs with the owner's rights, so it may delete the login
set search_path = ''      -- only uses the schemas named below (a safety rule)
as $$
declare
  me uuid := auth.uid();  -- the signed-in person calling this
begin
  if me is null then
    raise exception 'Not signed in';
  end if;
  delete from public.planner_data where user_id = me;   -- their planner
  delete from auth.users where id = me;                 -- their login (and sessions)
end;
$$;

-- Only signed-in people may call it; visitors who aren't signed in can't
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
