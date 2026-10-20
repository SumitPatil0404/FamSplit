-- FamSplit update 5: friends trips, where everyone settles with everyone.
-- Run this once in the Supabase SQL editor of a project that already ran update-4.sql.

alter table public.trips add column if not exists kind text not null default 'families'
  check (kind in ('families', 'friends'));
