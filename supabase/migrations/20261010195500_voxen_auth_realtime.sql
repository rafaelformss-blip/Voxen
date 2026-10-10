-- Voxen: preserve requested player handles, remove recursive membership-delete policy,
-- and enable realtime for feed posts and text messages.
create or replace function public.handle_new_voxen_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  requested_username text;
  safe_username text;
  display_label text;
begin
  requested_username := lower(regexp_replace(coalesce(new.raw_user_meta_data ->> 'username', split_part(coalesce(new.email, ''), '@', 1), 'user'), '[^a-zA-Z0-9_-]', '', 'g'));
  if char_length(requested_username) < 3 then requested_username := 'player'; end if;
  requested_username := left(requested_username, 24);
  safe_username := requested_username;
  if exists (select 1 from public.profiles p where p.username = safe_username) then
    safe_username := left(requested_username, 17) || '_' || substr(new.id::text, 1, 6);
  end if;
  display_label := left(coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), requested_username, 'Novo usuário'), 48);
  insert into public.profiles (id, username, display_name)
  values (new.id, safe_username, display_label)
  on conflict (id) do nothing;
  return new;
end;
$function$;

drop policy if exists "members leave or admins manage memberships" on public.group_members;
drop policy if exists "users can leave their own memberships" on public.group_members;
create policy "users can leave their own memberships"
on public.group_members for delete to authenticated
using (user_id = (select auth.uid()));

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'feed_posts'
  ) then
    alter publication supabase_realtime add table public.feed_posts;
  end if;
end $$;
