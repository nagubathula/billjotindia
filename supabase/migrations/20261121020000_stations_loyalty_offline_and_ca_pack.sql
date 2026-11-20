-- Petpooja Parity Wave (excluding WhatsApp):
-- 1. Kitchen station category defaults & printer cash drawer kick support
-- 2. Offline POS order sync idempotency columns on public.orders
-- 3. Phone-number Loyalty Settings, Wallets & Transactions Ledger

begin;

-- ===========================================================================
-- 1. KITCHEN STATIONS & PRINTERS ENHANCEMENTS
-- ===========================================================================

alter table public.categories
  add column if not exists station_id uuid null
    references public.kitchen_stations(id) on delete set null;

create index if not exists idx_categories_station
  on public.categories (station_id)
  where station_id is not null;

alter table public.printers
  add column if not exists kick_cash_drawer boolean not null default false;

-- Allow all signed-in restaurant staff (cashiers, captains, kitchen) to read
-- active printers and kitchen stations for KOT routing & local print dispatch.
drop policy if exists "Members read printers" on public.printers;
create policy "Members read printers" on public.printers
  for select
  using (public.user_has_restaurant_access(public.outlet_restaurant_id(outlet_id)));

drop policy if exists "Members read kitchen_stations" on public.kitchen_stations;
create policy "Members read kitchen_stations" on public.kitchen_stations
  for select
  using (public.user_has_restaurant_access(public.outlet_restaurant_id(outlet_id)));

-- ===========================================================================
-- 2. ORDERS: OFFLINE SYNC IDEMPOTENCY & LOYALTY TRACEABILITY
-- ===========================================================================

alter table public.orders
  add column if not exists offline_id text null,
  add column if not exists offline_synced_at timestamptz null,
  add column if not exists loyalty_points_redeemed integer not null default 0,
  add column if not exists loyalty_discount_amount numeric(10,2) not null default 0,
  add column if not exists loyalty_points_earned integer not null default 0;

create unique index if not exists idx_orders_outlet_offline_id
  on public.orders (outlet_id, offline_id)
  where offline_id is not null;

-- ===========================================================================
-- 3. PHONE-NUMBER LOYALTY PROGRAM (SETTINGS, WALLETS & LEDGER)
-- ===========================================================================

create table if not exists public.loyalty_settings (
  restaurant_id         uuid primary key references public.restaurants(id) on delete cascade,
  is_enabled            boolean not null default true,
  points_per_100        numeric(8,2) not null default 5 check (points_per_100 >= 0),
  point_value           numeric(8,2) not null default 1 check (point_value > 0),
  min_order_for_earn    numeric(10,2) not null default 100 check (min_order_for_earn >= 0),
  min_points_to_redeem  integer not null default 25 check (min_points_to_redeem >= 1),
  max_redeem_pct        numeric(5,2) not null default 25 check (max_redeem_pct between 0 and 100),
  welcome_bonus_points  integer not null default 25 check (welcome_bonus_points >= 0),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

drop trigger if exists trg_loyalty_settings_updated_at on public.loyalty_settings;
create trigger trg_loyalty_settings_updated_at
  before update on public.loyalty_settings
  for each row execute function public.set_updated_at();

create table if not exists public.loyalty_wallets (
  id                uuid primary key default gen_random_uuid(),
  restaurant_id     uuid not null references public.restaurants(id) on delete cascade,
  phone_normalized  text not null check (char_length(phone_normalized) >= 10),
  customer_name     text null,
  customer_email    text null,
  points_balance    integer not null default 0 check (points_balance >= 0),
  lifetime_earned   integer not null default 0,
  lifetime_redeemed integer not null default 0,
  visits_count      integer not null default 0,
  total_spent       numeric(12,2) not null default 0,
  last_visit_at     timestamptz null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (restaurant_id, phone_normalized)
);

create index if not exists idx_loyalty_wallets_restaurant_updated
  on public.loyalty_wallets (restaurant_id, updated_at desc);

drop trigger if exists trg_loyalty_wallets_updated_at on public.loyalty_wallets;
create trigger trg_loyalty_wallets_updated_at
  before update on public.loyalty_wallets
  for each row execute function public.set_updated_at();

create table if not exists public.loyalty_transactions (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  wallet_id     uuid not null references public.loyalty_wallets(id) on delete cascade,
  outlet_id     uuid null references public.outlets(id) on delete set null,
  order_id      uuid null references public.orders(id) on delete set null,
  txn_type      text not null check (txn_type in ('earn', 'redeem', 'welcome_bonus', 'adjustment')),
  points_delta  integer not null,
  rupee_value   numeric(10,2) not null default 0,
  balance_after integer not null,
  note          text null,
  created_by    uuid null references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index if not exists idx_loyalty_txns_wallet_created
  on public.loyalty_transactions (wallet_id, created_at desc);

create index if not exists idx_loyalty_txns_restaurant_created
  on public.loyalty_transactions (restaurant_id, created_at desc);

create unique index if not exists idx_loyalty_txns_order_type
  on public.loyalty_transactions (order_id, txn_type)
  where order_id is not null and txn_type in ('earn', 'redeem', 'welcome_bonus');

alter table public.loyalty_settings enable row level security;
alter table public.loyalty_wallets enable row level security;
alter table public.loyalty_transactions enable row level security;

drop policy if exists "Staff read loyalty_settings" on public.loyalty_settings;
create policy "Staff read loyalty_settings" on public.loyalty_settings
  for select
  using (public.user_has_restaurant_access(restaurant_id));

drop policy if exists "Ops manage loyalty_settings" on public.loyalty_settings;
create policy "Ops manage loyalty_settings" on public.loyalty_settings
  for all
  using (public.user_has_restaurant_role(restaurant_id, array['admin', 'manager']))
  with check (public.user_has_restaurant_role(restaurant_id, array['admin', 'manager']));

drop policy if exists "Billing read loyalty_wallets" on public.loyalty_wallets;
create policy "Billing read loyalty_wallets" on public.loyalty_wallets
  for select
  using (public.user_has_restaurant_role(restaurant_id, array['admin', 'manager', 'user']));

drop policy if exists "Ops manage loyalty_wallets" on public.loyalty_wallets;
create policy "Ops manage loyalty_wallets" on public.loyalty_wallets
  for all
  using (public.user_has_restaurant_role(restaurant_id, array['admin', 'manager']))
  with check (public.user_has_restaurant_role(restaurant_id, array['admin', 'manager']));

drop policy if exists "Billing read loyalty_transactions" on public.loyalty_transactions;
create policy "Billing read loyalty_transactions" on public.loyalty_transactions
  for select
  using (public.user_has_restaurant_role(restaurant_id, array['admin', 'manager', 'user']));

drop policy if exists "Ops manage loyalty_transactions" on public.loyalty_transactions;
create policy "Ops manage loyalty_transactions" on public.loyalty_transactions
  for all
  using (public.user_has_restaurant_role(restaurant_id, array['admin', 'manager']))
  with check (public.user_has_restaurant_role(restaurant_id, array['admin', 'manager']));

commit;
