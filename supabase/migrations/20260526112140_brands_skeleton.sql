-- Phase 6 #3: brand-above-restaurant skeleton.
--
-- A `brand` is the franchise-level entity owning multiple restaurants. The
-- brand owner sees roll-up info across their restaurants. This migration adds
-- ONLY the schema + minimal RLS (owner-only) so the brand admin UI can be
-- built on top. Brand-scoped roles, master-menu inheritance, consolidated
-- reports across restaurants — all deferred to a future phase.
--
-- restaurants.brand_id is nullable: solo restaurants (no brand) work unchanged.

begin;

-- ---------------------------------------------------------------------------
-- 1. brands table
-- ---------------------------------------------------------------------------
create table if not exists public.brands (
  id              bigserial primary key,
  slug            text not null unique,
  name            text not null,
  owner_user_id   uuid references auth.users(id) on delete set null,
  status          text not null default 'active',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 2. restaurants.brand_id (nullable — un-branded restaurants are fine)
-- ---------------------------------------------------------------------------
alter table public.restaurants
  add column if not exists brand_id bigint references public.brands(id) on delete set null;

create index if not exists idx_restaurants_brand on public.restaurants(brand_id);

-- ---------------------------------------------------------------------------
-- 3. updated_at trigger
-- ---------------------------------------------------------------------------
drop trigger if exists trg_brands_updated_at on public.brands;
create trigger trg_brands_updated_at
  before update on public.brands
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 4. RLS — owner-only for v0. Member-of-brand access (e.g. restaurant admins
-- inheriting brand menus) lands in a future phase.
-- ---------------------------------------------------------------------------
alter table public.brands enable row level security;

drop policy if exists "Owner reads brand" on public.brands;
create policy "Owner reads brand" on public.brands
  for select using (owner_user_id = auth.uid());

drop policy if exists "Owner updates brand" on public.brands;
create policy "Owner updates brand" on public.brands
  for update using (owner_user_id = auth.uid());

-- INSERT / DELETE via service role.

commit;
