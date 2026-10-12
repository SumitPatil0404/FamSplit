-- FamSplit update 3: push notifications and reminders.
-- Run this once in the Supabase SQL editor of a project that already ran update-2.sql.

alter table public.activity add column actor_id uuid;
alter table public.activity add column notified_at timestamptz;

create or replace function public.log_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  entity text := tg_argv[0];
  old_row jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  new_row jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  trip text := coalesce(new_row, old_row) ->> (case when entity = 'trip' then 'id' else 'trip_id' end);
begin
  -- Reordering on its own is not worth a line in the log.
  if tg_op = 'UPDATE' and (old_row - 'position') = (new_row - 'position') then
    return null;
  end if;
  -- Rows that disappear because the whole trip was deleted have nothing left to log against.
  if not exists (select 1 from public.trips where id = trip) then
    return null;
  end if;

  insert into public.activity (trip_id, actor_id, actor_member_id, entity, action, before, after)
  values (
    trip,
    (select auth.uid()),
    (select member_id from public.trip_users where trip_id = trip and user_id = (select auth.uid())),
    entity,
    case tg_op when 'INSERT' then 'added' when 'UPDATE' then 'changed' else 'removed' end,
    old_row,
    new_row
  );
  return null;
end;
$$;


-- Push notifications. Nothing here is reachable directly from a phone: tables have no policies or
-- grants, and phones go through the functions below.

create extension if not exists pg_net;

-- Where the "notify" Edge Function lives. Set by whoever sets the project up.
create table public.app_settings (
  key text primary key,
  value text not null
);
alter table public.app_settings enable row level security;
revoke all on public.app_settings from anon, authenticated;

-- One row per phone that should receive notifications for a user.
create table public.push_tokens (
  token text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null default 'android',
  updated_at timestamptz not null default now()
);
create index push_tokens_user_id_idx on public.push_tokens (user_id);
alter table public.push_tokens enable row level security;
revoke all on public.push_tokens from anon, authenticated;

create function public.register_push_token(device_token text, device_platform text default 'android')
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in first';
  end if;
  -- A phone belongs to whoever signed in on it last.
  insert into public.push_tokens (token, user_id, platform)
  values (device_token, (select auth.uid()), device_platform)
  on conflict (token) do update
    set user_id = excluded.user_id, platform = excluded.platform, updated_at = now();
end;
$$;

create function public.unregister_push_token(device_token text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_tokens where token = device_token and user_id = (select auth.uid());
$$;

-- Who to tell that `from_member` owes money: that person if they use the app, otherwise
-- whoever in their family does. Never the person sending the reminder.
create function public.reminder_recipients(trip text, from_member text, sender uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  with direct as (
    select user_id from public.trip_users
    where trip_id = trip and member_id = from_member and user_id <> sender
  ),
  family as (
    select u.user_id
    from public.trip_users u
    join public.members m on m.trip_id = u.trip_id and m.id = u.member_id
    where u.trip_id = trip
      and u.user_id <> sender
      and m.family_id = (select family_id from public.members where trip_id = trip and id = from_member)
  )
  select user_id from direct
  union
  select user_id from family where not exists (select 1 from direct);
$$;

create table public.reminders (
  id bigint generated always as identity primary key,
  trip_id text not null references public.trips (id) on delete cascade,
  from_member_id text not null,
  to_member_id text not null,
  amount bigint not null check (amount > 0),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  notified_at timestamptz
);
alter table public.reminders enable row level security;
revoke all on public.reminders from anon, authenticated;

-- Sends a "please pay" notification. Returns how many phones it will reach; 0 means the person
-- (and their family) do not use the app, so the caller should remind them some other way.
create function public.send_reminder(trip text, from_member text, to_member text, owed bigint)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  phones integer;
begin
  if me is null or not public.is_trip_user(trip) then
    raise exception 'You are not on this trip';
  end if;
  if exists (
    select 1 from public.reminders
    where trip_id = trip and from_member_id = from_member and to_member_id = to_member
      and created_at > now() - interval '10 minutes'
  ) then
    raise exception 'A reminder was already sent a few minutes ago';
  end if;

  select count(*) into phones
  from public.push_tokens
  where user_id in (select public.reminder_recipients(trip, from_member, me));

  if phones > 0 then
    insert into public.reminders (trip_id, from_member_id, to_member_id, amount, created_by)
    values (trip, from_member, to_member, owed, me);
  end if;
  return phones;
end;
$$;

revoke execute on function public.register_push_token(text, text) from public, anon;
revoke execute on function public.unregister_push_token(text) from public, anon;
revoke execute on function public.send_reminder(text, text, text, bigint) from public, anon;
revoke execute on function public.reminder_recipients(text, text, uuid) from public, anon, authenticated;
grant execute on function public.register_push_token(text, text) to authenticated;
grant execute on function public.unregister_push_token(text) to authenticated;
grant execute on function public.send_reminder(text, text, text, bigint) to authenticated;
-- The Edge Function works out who to notify with the same rule.
grant execute on function public.reminder_recipients(text, text, uuid) to service_role;

-- Asks the Edge Function to send notifications for a new activity or reminder row. The request
-- goes out after the change is saved, and a failure here never blocks the change itself.
create function public.request_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target text;
begin
  select value into target from public.app_settings where key = 'notify_url';
  if target is not null then
    perform net.http_post(
      url := target,
      body := jsonb_build_object('kind', tg_argv[0], 'id', new.id),
      headers := jsonb_build_object('Content-Type', 'application/json')
    );
  end if;
  return null;
exception when others then
  return null;
end;
$$;

revoke execute on function public.request_notification() from public, anon, authenticated;

create trigger activity_notify after insert on public.activity
  for each row execute function public.request_notification('activity');
create trigger reminders_notify after insert on public.reminders
  for each row execute function public.request_notification('reminder');

-- The address of this project's "notify" Edge Function.
insert into public.app_settings values ('notify_url', 'https://rkbbtjpvqjhmiuytfjtq.supabase.co/functions/v1/notify');
