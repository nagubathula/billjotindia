-- Phase 1: multi-restaurant foundation.
--
-- Adds a `restaurants` tenant entity above outlets, scopes user_roles to a
-- restaurant, and backfills a single default restaurant containing all
-- existing data. Pure foundation — no app behaviour changes until later
-- phases (URL routing, RLS, restaurant-scoped auth helpers).
--
-- Idempotent — safe to re-run.

begin;

-- ---------------------------------------------------------------------------
-- 1. restaurants — top-level tenant
-- ---------------------------------------------------------------------------
create table if not exists public.restaurants (
  id              bigserial primary key,
  slug            text not null unique,         -- /r/<slug>/... in future routing
  name            text not null,
  owner_user_id   uuid references auth.users(id) on delete set null,
  status          text not null default 'active', -- 'active' | 'trial' | 'suspended'
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Seed the single default tenant covering all existing data.
insert into public.restaurants (slug, name, status)
values ('default', 'Default Restaurant', 'active')
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- 2. outlets.restaurant_id — every outlet rolls up to a restaurant
-- ---------------------------------------------------------------------------
do $$
declare
  default_rid bigint;
begin
  select id into default_rid from public.restaurants where slug = 'default';

  alter table public.outlets
    add column if not exists restaurant_id bigint
      references public.restaurants(id) on delete restrict;

  update public.outlets set restaurant_id = default_rid where restaurant_id is null;
end $$;

alter table public.outlets alter column restaurant_id set not null;
create index if not exists idx_outlets_restaurant on public.outlets(restaurant_id);

-- ---------------------------------------------------------------------------
-- 3. user_roles.restaurant_id — roles are scoped per restaurant
--    (a user can be admin of A and manager of B without ambiguity)
-- ---------------------------------------------------------------------------
do $$
declare
  default_rid bigint;
begin
  select id into default_rid from public.restaurants where slug = 'default';

  alter table public.user_roles
    add column if not exists restaurant_id bigint
      references public.restaurants(id) on delete cascade;

  update public.user_roles set restaurant_id = default_rid where restaurant_id is null;
end $$;

alter table public.user_roles alter column restaurant_id set not null;

-- Old unique constraints on user_roles likely held (user_id) or (user_id, role).
-- We now want (user_id, restaurant_id, role) — same email can hold different
-- roles across restaurants. Drop any older single-scope constraint defensively.
alter table public.user_roles drop constraint if exists user_roles_user_id_role_key;
alter table public.user_roles drop constraint if exists user_roles_user_id_key;

create unique index if not exists uq_user_roles_user_restaurant_role
  on public.user_roles(user_id, restaurant_id, role);

create index if not exists idx_user_roles_restaurant on public.user_roles(restaurant_id);

-- ---------------------------------------------------------------------------
-- 4. updated_at trigger for restaurants
-- ---------------------------------------------------------------------------
drop trigger if exists trg_restaurants_updated_at on public.restaurants;
create trigger trg_restaurants_updated_at
  before update on public.restaurants
  for each row execute function public.set_updated_at();

commit;
