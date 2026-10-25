-- FamSplit database. Run this once in the Supabase SQL editor of a new project.
-- (A project set up earlier needs the supabase/update-N.sql files it has not run yet instead.)
-- After running it, set the address of your "notify" Edge Function for push notifications:
--   insert into public.app_settings values ('notify_url', 'https://YOUR-PROJECT.supabase.co/functions/v1/notify');
--
-- A trip is shared by every signed-in user listed for it in trip_users. Ids are
-- generated on the phone, so child tables are keyed by (trip_id, id).

create table public.trips (
  id text primary key,
  name text not null,
  -- 'families': heads settle first, then each family inside. 'friends': everyone settles with everyone.
  kind text not null default 'families' check (kind in ('families', 'friends')),
  invite_code text not null unique,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  -- Set when the trip is closed: expenses are locked and only payments remain.
  finalized_at timestamptz
);

-- Who can open a trip, and which of its members that user is.
create table public.trip_users (
  trip_id text not null references public.trips (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  member_id text,
  primary key (trip_id, user_id)
);

create table public.families (
  trip_id text not null references public.trips (id) on delete cascade,
  id text not null,
  name text not null,
  head_id text not null,
  color text not null,
  position integer not null default 0,
  primary key (trip_id, id)
);

create table public.members (
  trip_id text not null references public.trips (id) on delete cascade,
  id text not null,
  family_id text not null,
  name text not null,
  -- Where others can send this person money, e.g. name@bank. Optional.
  upi_id text,
  position integer not null default 0,
  primary key (trip_id, id)
);

-- Amounts are whole paise. paid_by and split use the same JSON shapes as the app.
create table public.expenses (
  trip_id text not null references public.trips (id) on delete cascade,
  id text not null,
  description text not null,
  amount bigint not null check (amount > 0),
  paid_by jsonb not null,
  split jsonb not null,
  category text,
  date timestamptz not null default now(),
  primary key (trip_id, id)
);

create table public.payments (
  trip_id text not null references public.trips (id) on delete cascade,
  id text not null,
  from_member_id text not null,
  to_member_id text not null,
  amount bigint not null check (amount > 0),
  date timestamptz not null default now(),
  primary key (trip_id, id)
);

create index trip_users_user_id_idx on public.trip_users (user_id);

-- Runs with the owner's rights so policies can ask "is this user on the trip?"
-- without tripping over trip_users' own policies.
create function public.is_trip_user(target text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.trip_users
    where trip_id = target and user_id = (select auth.uid())
  );
$$;

-- Whoever creates a trip is its first user.
create function public.add_trip_creator()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.created_by is not null then
    insert into public.trip_users (trip_id, user_id)
    values (new.id, new.created_by)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

create trigger trips_add_creator
after insert on public.trips
for each row execute function public.add_trip_creator();

-- The only way to get onto someone else's trip: knowing its invite code.
create function public.join_trip(code text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  target text;
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in to join a trip';
  end if;

  select id into target
  from public.trips
  where invite_code = upper(regexp_replace(code, '[^A-Za-z0-9]', '', 'g'));

  if target is null then
    raise exception 'No trip found for that code';
  end if;

  insert into public.trip_users (trip_id, user_id)
  values (target, (select auth.uid()))
  on conflict do nothing;

  return target;
end;
$$;

revoke execute on function public.join_trip(text) from public, anon;
grant execute on function public.join_trip(text) to authenticated;
revoke execute on function public.add_trip_creator() from public, anon, authenticated;

-- Signed-in users reach the tables through the API; the policies below decide which rows.
-- Nothing is granted to the anonymous role.
grant select, insert, update, delete on
  public.trips, public.trip_users, public.families, public.members, public.expenses, public.payments
  to authenticated;

alter table public.trips enable row level security;
alter table public.trip_users enable row level security;
alter table public.families enable row level security;
alter table public.members enable row level security;
alter table public.expenses enable row level security;
alter table public.payments enable row level security;

create policy "Trip users can read their trips" on public.trips
  for select to authenticated
  using (created_by = (select auth.uid()) or public.is_trip_user(id));

create policy "Signed-in users can create trips" on public.trips
  for insert to authenticated
  with check (created_by = (select auth.uid()));

create policy "Trip users can rename their trips" on public.trips
  for update to authenticated
  using (public.is_trip_user(id))
  with check (public.is_trip_user(id));

create policy "Only the creator can delete a trip" on public.trips
  for delete to authenticated
  using (created_by = (select auth.uid()));

-- No insert policy: rows are only added by the trigger and by join_trip().
create policy "Users can see their own trip links" on public.trip_users
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Users can say which member they are" on public.trip_users
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Users can leave a trip" on public.trip_users
  for delete to authenticated
  using (user_id = (select auth.uid()));

create policy "Trip users manage families" on public.families
  for all to authenticated
  using (public.is_trip_user(trip_id))
  with check (public.is_trip_user(trip_id));

create policy "Trip users manage members" on public.members
  for all to authenticated
  using (public.is_trip_user(trip_id))
  with check (public.is_trip_user(trip_id));

create policy "Trip users manage expenses" on public.expenses
  for all to authenticated
  using (public.is_trip_user(trip_id))
  with check (public.is_trip_user(trip_id));

create policy "Trip users manage payments" on public.payments
  for all to authenticated
  using (public.is_trip_user(trip_id))
  with check (public.is_trip_user(trip_id));

-- Lets phones hear about each other's changes straight away.
alter publication supabase_realtime add table
  public.trips, public.trip_users, public.families, public.members, public.expenses, public.payments;

-- A record of who changed what, written by the database itself so it cannot be skipped or edited from a phone.
create table public.activity (
  id bigint generated always as identity primary key,
  trip_id text not null references public.trips (id) on delete cascade,
  at timestamptz not null default now(),
  actor_id uuid,
  -- Which member the signed-in user was at the time; null if they had not said yet.
  actor_member_id text,
  entity text not null,
  action text not null,
  before jsonb,
  after jsonb,
  -- Set once push notifications for this line have been sent, so they are never sent twice.
  notified_at timestamptz
);

create index activity_trip_id_idx on public.activity (trip_id, id desc);

create function public.log_activity()
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

revoke execute on function public.log_activity() from public, anon, authenticated;

create trigger trips_log after insert or update on public.trips
  for each row execute function public.log_activity('trip');
create trigger families_log after insert or update or delete on public.families
  for each row execute function public.log_activity('family');
create trigger members_log after insert or update or delete on public.members
  for each row execute function public.log_activity('member');
create trigger expenses_log after insert or update or delete on public.expenses
  for each row execute function public.log_activity('expense');
create trigger payments_log after insert or update or delete on public.payments
  for each row execute function public.log_activity('payment');

-- Read-only for trip users: there are no policies for writing, so only the triggers add rows.
grant select on public.activity to authenticated;
alter table public.activity enable row level security;

create policy "Trip users can read the activity log" on public.activity
  for select to authenticated
  using (public.is_trip_user(trip_id));

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

-- Personal expenses: spending that belongs to no trip. Only their owner can see or change them,
-- and they go when the account is deleted.
create table public.personal_expenses (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  description text not null,
  amount bigint not null check (amount > 0),
  category text,
  date timestamptz not null default now(),
  primary key (user_id, id)
);

grant select, insert, update, delete on public.personal_expenses to authenticated;
alter table public.personal_expenses enable row level security;

create policy "Users manage their own personal expenses" on public.personal_expenses
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter publication supabase_realtime add table public.personal_expenses;
