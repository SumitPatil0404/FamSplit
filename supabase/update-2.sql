-- FamSplit update 2: trip finalising, UPI ids and the activity log.
-- Run this once in the Supabase SQL editor of a project that already ran the first schema.sql.

alter table public.trips add column finalized_at timestamptz;
alter table public.members add column upi_id text;

-- A record of who changed what, written by the database itself so it cannot be skipped or edited from a phone.
create table public.activity (
  id bigint generated always as identity primary key,
  trip_id text not null references public.trips (id) on delete cascade,
  at timestamptz not null default now(),
  -- Which member the signed-in user was at the time; null if they had not said yet.
  actor_member_id text,
  entity text not null,
  action text not null,
  before jsonb,
  after jsonb
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

  insert into public.activity (trip_id, actor_member_id, entity, action, before, after)
  values (
    trip,
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
