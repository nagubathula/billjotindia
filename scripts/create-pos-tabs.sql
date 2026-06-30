-- DB-backed POS tabs: open "bar tabs" that sync across terminals.
-- Run once in the Supabase SQL editor (Dashboard → SQL).
-- After running, regenerate types so the table is typed:
--   npx supabase gen types typescript --linked > lib/database.types.ts
-- (The tab server actions use the service-role client and don't depend on the
--  generated types, so the feature works before regenerating.)

create table if not exists public.pos_tabs (
  id          uuid primary key default gen_random_uuid(),
  outlet_id   bigint not null references public.outlets (id) on delete cascade,
  name        text not null,
  lines       jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists pos_tabs_outlet_idx on public.pos_tabs (outlet_id);

-- RLS on. Server actions use the service-role client (bypasses RLS) and gate on
-- staff role themselves, mirroring the orders API. Add finer policies later if
-- the browser ever reads this table directly.
alter table public.pos_tabs enable row level security;

-- Optional: instant cross-terminal sync (same pattern as the kitchen display).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='pos_tabs'
  ) then
    alter publication supabase_realtime add table public.pos_tabs;
  end if;
end $$;
