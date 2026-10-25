-- FamSplit update 6: personal expenses, which belong to no trip and only their owner can see.
-- Run this once in the Supabase SQL editor of a project that already ran update-5.sql.

create table if not exists public.personal_expenses (
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

drop policy if exists "Users manage their own personal expenses" on public.personal_expenses;
create policy "Users manage their own personal expenses" on public.personal_expenses
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Lets a second phone hear about changes straight away. Row-level security still applies.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'personal_expenses'
  ) then
    alter publication supabase_realtime add table public.personal_expenses;
  end if;
end;
$$;
