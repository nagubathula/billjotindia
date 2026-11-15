-- Consolidated additive migration for:
--   1. Per-key allowed websites (`restaurant_api_keys.allowed_origins`)
--   2. Public API fixed-window rate limiting (`api_rate_limits` + `consume_rate_limit`)
--   3. Real table link (`orders.table_id`), void audit log (`orders.voided_items`),
--      and strict `orders.order_type` check constraint
--   4. Item creation timestamp (`order_items.created_at`) for KOT batch tracking
--   5. Staff read access to `kitchen_stations` so Cashiers & Captains can use KDS
--   6. Brand visibility for admins of any restaurant attached to the brand
--
-- Additive and idempotent; safe to re-run.

begin;

-- ---------------------------------------------------------------------------
-- 1. Per-key allowed websites on restaurant_api_keys
-- ---------------------------------------------------------------------------
alter table public.restaurant_api_keys
  add column if not exists allowed_origins text[] not null default '{}';

create index if not exists idx_restaurant_api_keys_origins
  on public.restaurant_api_keys using gin (allowed_origins);

-- ---------------------------------------------------------------------------
-- 2. Public API rate limiting (service_role only)
-- ---------------------------------------------------------------------------
create table if not exists public.api_rate_limits (
  bucket_key    text not null,
  window_start  timestamptz not null,
  hits          integer not null default 1,
  primary key (bucket_key, window_start)
);

create index if not exists idx_api_rate_limits_window
  on public.api_rate_limits (window_start);

alter table public.api_rate_limits enable row level security;

create or replace function public.consume_rate_limit(
  p_bucket text,
  p_window_seconds integer default 60
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_win   integer := greatest(coalesce(p_window_seconds, 60), 1);
  v_start timestamptz := to_timestamp(floor(extract(epoch from now()) / v_win) * v_win);
  v_hits  integer;
begin
  insert into public.api_rate_limits (bucket_key, window_start, hits)
  values (p_bucket, v_start, 1)
  on conflict (bucket_key, window_start)
  do update set hits = public.api_rate_limits.hits + 1
  returning hits into v_hits;

  if random() < 0.02 then
    delete from public.api_rate_limits
    where window_start < now() - interval '15 minutes';
  end if;

  return jsonb_build_object(
    'hits', v_hits,
    'reset_at', v_start + make_interval(secs => v_win)
  );
end;
$$;

revoke all on function public.consume_rate_limit(text, integer) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, integer) to service_role;

-- ---------------------------------------------------------------------------
-- 3. Orders: real table_id FK, voided_items audit trail, order_type check
-- ---------------------------------------------------------------------------
alter table public.orders
  add column if not exists table_id uuid references public.pos_tabs (id) on delete set null,
  add column if not exists voided_items jsonb not null default '[]'::jsonb;

create index if not exists idx_orders_table_id
  on public.orders (table_id)
  where table_id is not null;

update public.orders
set order_type = 'dine-in'
where order_type = 'dine_in';

update public.orders
set order_type = 'takeaway'
where order_type is null
   or order_type not in ('dine-in', 'takeaway', 'delivery');

alter table public.orders
  alter column order_type set default 'takeaway';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_order_type_check'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_order_type_check
      check (order_type in ('dine-in', 'takeaway', 'delivery'));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Order items: created_at timestamp for later-KOT item tracking
-- ---------------------------------------------------------------------------
alter table public.order_items
  add column if not exists created_at timestamptz not null default now();

-- ---------------------------------------------------------------------------
-- 5. Kitchen stations: allow all restaurant staff (including cashier/captain)
--    to read stations on the KDS
-- ---------------------------------------------------------------------------
drop policy if exists "Staff read kitchen_stations" on public.kitchen_stations;
create policy "Staff read kitchen_stations" on public.kitchen_stations
  for select using (
    public.user_has_restaurant_access(public.outlet_restaurant_id(outlet_id))
  );

-- ---------------------------------------------------------------------------
-- 6. Brands: allow admins of any attached restaurant to view the brand
-- ---------------------------------------------------------------------------
create or replace function public.user_is_brand_restaurant_admin(bid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.restaurants r
    join public.user_roles ur on ur.restaurant_id = r.id
    where r.brand_id = bid
      and ur.user_id = auth.uid()
      and ur.role = 'admin'
  );
$$;

grant execute on function public.user_is_brand_restaurant_admin(uuid) to authenticated;

drop policy if exists "Owner reads brand" on public.brands;
create policy "Owner reads brand" on public.brands
  for select using (
    owner_user_id = auth.uid()
    or public.user_is_brand_restaurant_admin(id)
  );

commit;
