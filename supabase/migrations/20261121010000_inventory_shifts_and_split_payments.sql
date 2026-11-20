-- DB-backed Kitchen Inventory & Recipe BOM, Persisted Cash Register Shifts,
-- and Multi-Tender POS Split Payments (`orders.payment_mode` & `order_payments`).

begin;

-- ===========================================================================
-- 1. KITCHEN INVENTORY, RECIPE BOM & STOCK MOVEMENTS
-- ===========================================================================

create table if not exists public.inventory_materials (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references public.restaurants(id) on delete cascade,
  outlet_id      uuid null references public.outlets(id) on delete set null,
  vendor_id      uuid null references public.vendors(id) on delete set null,
  sku            text not null,
  name           text not null check (char_length(btrim(name)) between 1 and 140),
  category       text not null default 'grocery'
    check (category in (
      'produce',
      'meat_seafood',
      'dairy_oils',
      'grocery',
      'spices',
      'packaging',
      'beverages',
      'other'
    )),
  unit           text not null default 'kg' check (char_length(btrim(unit)) between 1 and 24),
  current_stock  numeric(12,3) not null default 0 check (current_stock >= 0),
  reorder_level  numeric(12,3) not null default 0 check (reorder_level >= 0),
  cost_per_unit  numeric(12,2) not null default 0 check (cost_per_unit >= 0),
  status         text not null default 'active' check (status in ('active', 'inactive')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create unique index if not exists idx_inventory_materials_restaurant_sku
  on public.inventory_materials (restaurant_id, upper(sku));

create index if not exists idx_inventory_materials_restaurant_status
  on public.inventory_materials (restaurant_id, status);

drop trigger if exists trg_inventory_materials_updated_at on public.inventory_materials;
create trigger trg_inventory_materials_updated_at
  before update on public.inventory_materials
  for each row execute function public.set_updated_at();

create table if not exists public.product_recipes (
  id                uuid primary key default gen_random_uuid(),
  restaurant_id     uuid not null references public.restaurants(id) on delete cascade,
  product_id        uuid not null references public.products(id) on delete cascade,
  material_id       uuid not null references public.inventory_materials(id) on delete cascade,
  quantity_per_unit numeric(12,4) not null check (quantity_per_unit > 0),
  wastage_pct       numeric(5,2) not null default 0 check (wastage_pct between 0 and 100),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (product_id, material_id)
);

create index if not exists idx_product_recipes_restaurant_product
  on public.product_recipes (restaurant_id, product_id);

drop trigger if exists trg_product_recipes_updated_at on public.product_recipes;
create trigger trg_product_recipes_updated_at
  before update on public.product_recipes
  for each row execute function public.set_updated_at();

create table if not exists public.inventory_stock_movements (
  id                 uuid primary key default gen_random_uuid(),
  restaurant_id      uuid not null references public.restaurants(id) on delete cascade,
  outlet_id          uuid null references public.outlets(id) on delete set null,
  material_id        uuid not null references public.inventory_materials(id) on delete cascade,
  movement_type      text not null
    check (movement_type in (
      'opening',
      'purchase_grn',
      'order_consumption',
      'wastage',
      'manual_adjustment'
    )),
  quantity_delta     numeric(12,3) not null,
  stock_after        numeric(12,3) not null,
  unit_cost          numeric(12,2) null,
  reference_order_id uuid null references public.orders(id) on delete set null,
  reference_po_id    uuid null references public.vendor_purchase_orders(id) on delete set null,
  note               text null,
  created_by         text null,
  created_at         timestamptz not null default now()
);

create index if not exists idx_inventory_movements_restaurant_created
  on public.inventory_stock_movements (restaurant_id, created_at desc);

create unique index if not exists idx_inventory_movements_order_dedupe
  on public.inventory_stock_movements (reference_order_id, material_id)
  where movement_type = 'order_consumption' and reference_order_id is not null;

create unique index if not exists idx_inventory_movements_po_dedupe
  on public.inventory_stock_movements (reference_po_id, material_id)
  where movement_type = 'purchase_grn' and reference_po_id is not null;

alter table public.inventory_materials enable row level security;
alter table public.product_recipes enable row level security;
alter table public.inventory_stock_movements enable row level security;

drop policy if exists "Ops manage inventory_materials" on public.inventory_materials;
create policy "Ops manage inventory_materials" on public.inventory_materials
  for all
  using (public.user_has_restaurant_role(restaurant_id, array['admin', 'manager']))
  with check (public.user_has_restaurant_role(restaurant_id, array['admin', 'manager']));

drop policy if exists "Ops manage product_recipes" on public.product_recipes;
create policy "Ops manage product_recipes" on public.product_recipes
  for all
  using (public.user_has_restaurant_role(restaurant_id, array['admin', 'manager']))
  with check (public.user_has_restaurant_role(restaurant_id, array['admin', 'manager']));

drop policy if exists "Ops manage inventory_stock_movements" on public.inventory_stock_movements;
create policy "Ops manage inventory_stock_movements" on public.inventory_stock_movements
  for all
  using (public.user_has_restaurant_role(restaurant_id, array['admin', 'manager']))
  with check (public.user_has_restaurant_role(restaurant_id, array['admin', 'manager']));

-- ===========================================================================
-- 2. PERSISTED CASH REGISTER SHIFTS (DAY-END Z-REPORT AUDIT)
-- ===========================================================================

create table if not exists public.register_shifts (
  id                  uuid primary key default gen_random_uuid(),
  restaurant_id       uuid not null references public.restaurants(id) on delete cascade,
  outlet_id           uuid not null references public.outlets(id) on delete cascade,
  shift_date          date not null,
  status              text not null default 'open' check (status in ('open', 'closed')),
  opening_float       numeric(12,2) not null default 5000 check (opening_float >= 0),
  expected_cash       numeric(12,2) not null default 0,
  counted_cash        numeric(12,2) null check (counted_cash is null or counted_cash >= 0),
  variance            numeric(12,2) null,
  denominations       jsonb not null default '{}'::jsonb,
  cash_sales          numeric(12,2) not null default 0,
  upi_sales           numeric(12,2) not null default 0,
  card_sales          numeric(12,2) not null default 0,
  tab_sales           numeric(12,2) not null default 0,
  online_sales        numeric(12,2) not null default 0,
  petty_cash_expenses numeric(12,2) not null default 0,
  variance_note       text null,
  opened_by           text null,
  closed_by           text null,
  opened_at           timestamptz not null default now(),
  closed_at           timestamptz null,
  updated_at          timestamptz not null default now(),
  unique (outlet_id, shift_date)
);

create index if not exists idx_register_shifts_restaurant_date
  on public.register_shifts (restaurant_id, shift_date desc);

drop trigger if exists trg_register_shifts_updated_at on public.register_shifts;
create trigger trg_register_shifts_updated_at
  before update on public.register_shifts
  for each row execute function public.set_updated_at();

alter table public.register_shifts enable row level security;

drop policy if exists "Ops manage register_shifts" on public.register_shifts;
create policy "Ops manage register_shifts" on public.register_shifts
  for all
  using (public.user_has_restaurant_role(restaurant_id, array['admin', 'manager']))
  with check (public.user_has_restaurant_role(restaurant_id, array['admin', 'manager']));

drop policy if exists "POS read register_shifts" on public.register_shifts;
create policy "POS read register_shifts" on public.register_shifts
  for select
  using (public.user_has_restaurant_role(restaurant_id, array['admin', 'manager', 'user']));

-- ===========================================================================
-- 3. EXPLICIT PAYMENT MODE & MULTI-TENDER ORDER PAYMENTS
-- ===========================================================================

alter table public.orders
  add column if not exists payment_mode text null
    check (
      payment_mode is null
      or payment_mode in (
        'open',
        'cash',
        'upi',
        'card',
        'razorpay',
        'stripe',
        'tab',
        'online',
        'split',
        'aggregator'
      )
    );

update public.orders
   set payment_mode = case
     when source = 'pos' and lower(coalesce(customer_email, '')) like 'pos+open%' then 'open'
     when source = 'pos' and lower(coalesce(customer_email, '')) like 'pos+tab%' then 'tab'
     when source = 'pos' and lower(coalesce(customer_email, '')) like 'pos+upi%' then 'upi'
     when source = 'pos' and lower(coalesce(customer_email, '')) like 'pos+razorpay%' then 'razorpay'
     when source = 'pos' and lower(coalesce(customer_email, '')) like 'pos+card%' then 'card'
     when source = 'pos' and lower(coalesce(customer_email, '')) like 'pos+stripe%' then 'stripe'
     when source = 'pos' then 'cash'
     when source in ('web', 'kiosk') then 'online'
     else 'aggregator'
   end
 where payment_mode is null;

create table if not exists public.order_payments (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  outlet_id     uuid not null references public.outlets(id) on delete cascade,
  order_id      uuid not null references public.orders(id) on delete cascade,
  payment_mode  text not null
    check (payment_mode in ('cash', 'upi', 'card', 'razorpay', 'stripe', 'tab', 'online')),
  amount        numeric(12,2) not null check (amount > 0),
  reference_no  text null,
  created_at    timestamptz not null default now()
);

create index if not exists idx_order_payments_order
  on public.order_payments (order_id);

create index if not exists idx_order_payments_outlet_created
  on public.order_payments (outlet_id, created_at desc);

alter table public.order_payments enable row level security;

drop policy if exists "Billing staff manage order_payments" on public.order_payments;
create policy "Billing staff manage order_payments" on public.order_payments
  for all
  using (public.user_has_restaurant_role(restaurant_id, array['admin', 'manager', 'user']))
  with check (public.user_has_restaurant_role(restaurant_id, array['admin', 'manager', 'user']));

commit;
