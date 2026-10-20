-- FamSplit update 4: expense categories.
-- Run this once in the Supabase SQL editor of a project that already ran update-3.sql.

alter table public.expenses add column if not exists category text;
