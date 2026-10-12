-- FamSplit database. Run this once in the Supabase SQL editor of a new project.
--
-- A trip is shared by every signed-in user listed for it in trip_users. Ids are
-- generated on the phone, so child tables are keyed by (trip_id, id).

create table public.trips (
  id text primary key,
  name text not null,
  invite_code text not null unique,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
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
