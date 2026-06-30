-- Enable Supabase Realtime for the Kitchen Display (instant ticket updates).
-- Run once in the Supabase SQL editor (Dashboard → SQL) or via the CLI.
--
-- The KitchenBoard subscribes to changes on `orders`; until this runs it falls
-- back to 15s polling. Safe to re-run (guarded).

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'orders'
  ) then
    alter publication supabase_realtime add table public.orders;
  end if;
end $$;

-- Realtime only emits the changed row's primary key by default; REPLICA
-- IDENTITY FULL ensures full-row payloads (handy if you later filter by outlet).
alter table public.orders replica identity full;
