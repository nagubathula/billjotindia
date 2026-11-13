-- API keys for a restaurant's own frontends (websites, apps, kiosks built
-- outside Billjot). An admin creates a key in Administration → API keys; the
-- frontend sends it on every call to /api/menu and /api/orders.
--
--   • Only a SHA-256 hash of the key is stored. The full key is shown once,
--     when it is created, and can't be recovered afterwards.
--   • A key belongs to one restaurant and may be limited to one outlet.
--   • scopes: 'menu:read' (read the menu and store details) and
--     'orders:write' (place orders and read their status).
--   • Revoking sets revoked_at; the row stays so the list keeps a history.
--
-- RLS is on with no policies: only the server (service role) reads or writes
-- this table, after checking the signed-in user is an admin of the restaurant.
--
-- Additive only; safe to re-run.

begin;

create table if not exists public.restaurant_api_keys (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references public.restaurants (id) on delete cascade,
  outlet_id      uuid references public.outlets (id) on delete cascade,
  name           text not null check (char_length(btrim(name)) between 1 and 80),
  key_prefix     text not null,
  key_hash       text not null unique,
  scopes         text[] not null default array['menu:read', 'orders:write']
    check (
      cardinality(scopes) > 0
      and scopes <@ array['menu:read', 'orders:write']
    ),
  created_by     uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  last_used_at   timestamptz,
  revoked_at     timestamptz
);

create index if not exists idx_restaurant_api_keys_restaurant
  on public.restaurant_api_keys (restaurant_id, created_at desc);

alter table public.restaurant_api_keys enable row level security;

commit;
