-- Migration: multi-outlet + aggregator-ready foundation
-- Run in Supabase SQL editor. Idempotent — safe to re-run.
--
-- Adds: outlets, kitchen_stations, printers, kot_tickets/items,
--       channel_item_mappings, external_order_events.
-- Extends: orders (source/channel/external_*/gst/discount/cashier/placed_at),
--          products (gst_rate/hsn_code/sku/station_id/is_kot_required),
--          and adds outlet_id FK to scoped tables.
-- Backfills: a single default outlet for existing rows.

begin;

-- ---------------------------------------------------------------------------
-- 1. Outlets (the spine of multi-outlet support)
-- ---------------------------------------------------------------------------
create table if not exists public.outlets (
  id            bigserial primary key,
  slug          text not null unique,
  name          text not null,
  address       text,
  city          text,
  state         text,
  state_code    text,         -- two-digit GST state code, drives CGST/SGST vs IGST
  pincode       text,
  phone         text,
  email         text,
  gstin         text,         -- 15-char GSTIN, nullable for unregistered outlets
  fssai_license text,
  timezone      text not null default 'Asia/Kolkata',
  currency      text not null default 'INR',
  status        text not null default 'active',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

insert into public.outlets (slug, name, status)
values ('default', 'Main Outlet', 'active')
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- 2. outlet_id FK on existing scoped tables (nullable + backfill + NOT NULL)
-- ---------------------------------------------------------------------------
do $$
declare
  default_outlet_id bigint;
begin
  select id into default_outlet_id from public.outlets where slug = 'default';

  -- categories
  alter table public.categories
    add column if not exists outlet_id bigint references public.outlets(id) on delete restrict;
  update public.categories set outlet_id = default_outlet_id where outlet_id is null;

  -- products
  alter table public.products
    add column if not exists outlet_id bigint references public.outlets(id) on delete restrict;
  update public.products set outlet_id = default_outlet_id where outlet_id is null;

  -- customization_groups
  alter table public.customization_groups
    add column if not exists outlet_id bigint references public.outlets(id) on delete restrict;
  update public.customization_groups set outlet_id = default_outlet_id where outlet_id is null;

  -- promotional_banners
  alter table public.promotional_banners
    add column if not exists outlet_id bigint references public.outlets(id) on delete restrict;
  update public.promotional_banners set outlet_id = default_outlet_id where outlet_id is null;

  -- payment_settings (one row per outlet, going forward)
  alter table public.payment_settings
    add column if not exists outlet_id bigint references public.outlets(id) on delete restrict;
  update public.payment_settings set outlet_id = default_outlet_id where outlet_id is null;

  -- orders
  alter table public.orders
    add column if not exists outlet_id bigint references public.outlets(id) on delete restrict;
  update public.orders set outlet_id = default_outlet_id where outlet_id is null;
end $$;

alter table public.categories          alter column outlet_id set not null;
alter table public.products            alter column outlet_id set not null;
alter table public.customization_groups alter column outlet_id set not null;
alter table public.promotional_banners alter column outlet_id set not null;
alter table public.orders              alter column outlet_id set not null;
-- payment_settings: leave nullable for now; will become NOT NULL once per-outlet settings UI lands.

create index if not exists idx_products_outlet            on public.products(outlet_id);
create index if not exists idx_categories_outlet          on public.categories(outlet_id);
create index if not exists idx_orders_outlet              on public.orders(outlet_id);
create index if not exists idx_banners_outlet             on public.promotional_banners(outlet_id);
create index if not exists idx_customization_groups_outlet on public.customization_groups(outlet_id);

-- ---------------------------------------------------------------------------
-- 3. Kitchen stations + printers (KOT routing foundation)
-- ---------------------------------------------------------------------------
create table if not exists public.printers (
  id           bigserial primary key,
  outlet_id    bigint not null references public.outlets(id) on delete cascade,
  name         text not null,
  purpose      text not null default 'kot' check (purpose in ('kot','bill','customer_display','label')),
  interface    text not null default 'network' check (interface in ('network','usb','bluetooth','cloud')),
  address      text,           -- ip:port, USB path, BT MAC, or cloud printer id
  paper_width  smallint not null default 80 check (paper_width in (58, 80, 110)),
  status       text not null default 'active',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_printers_outlet on public.printers(outlet_id);

create table if not exists public.kitchen_stations (
  id          bigserial primary key,
  outlet_id   bigint not null references public.outlets(id) on delete cascade,
  name        text not null,        -- 'Tandoor', 'Chinese', 'Cold', 'Bar', 'Counter'
  printer_id  bigint references public.printers(id) on delete set null,
  sort_order  int not null default 0,
  status      text not null default 'active',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (outlet_id, name)
);
create index if not exists idx_stations_outlet on public.kitchen_stations(outlet_id);

-- ---------------------------------------------------------------------------
-- 4. Products: GST, HSN, SKU, station routing, KOT toggle
-- ---------------------------------------------------------------------------
alter table public.products
  add column if not exists gst_rate        numeric(5,2) not null default 5.00,   -- 5/12/18 are typical F&B slabs
  add column if not exists hsn_code        text,
  add column if not exists sku             text,
  add column if not exists station_id      bigint references public.kitchen_stations(id) on delete set null,
  add column if not exists is_kot_required boolean not null default true;

create unique index if not exists uq_products_outlet_sku
  on public.products(outlet_id, sku) where sku is not null;

-- ---------------------------------------------------------------------------
-- 5. Orders: channel/source, external IDs, GST breakdown, cashier, placed_at
-- ---------------------------------------------------------------------------
alter table public.orders
  add column if not exists source             text not null default 'web'
    check (source in ('pos','kiosk','web','zomato','swiggy','magicpin','dunzo','ondc','uber-eats','dotpe','other')),
  add column if not exists external_order_id  text,   -- aggregator's order id, e.g. Zomato's
  add column if not exists external_payload   jsonb,  -- raw aggregator payload (audit + replay)
  add column if not exists external_status    text,   -- aggregator-side status, mirrored
  add column if not exists cgst_amount        numeric(12,2) not null default 0,
  add column if not exists sgst_amount        numeric(12,2) not null default 0,
  add column if not exists igst_amount        numeric(12,2) not null default 0,
  add column if not exists discount_amount    numeric(12,2) not null default 0,
  add column if not exists rounding_amount    numeric(12,2) not null default 0,
  add column if not exists cashier_id         uuid references public.profiles(id) on delete set null,
  add column if not exists placed_at          timestamptz not null default now();

-- Idempotency: aggregator webhooks will retry. A given (source, external_order_id) is unique per outlet.
create unique index if not exists uq_orders_external
  on public.orders(outlet_id, source, external_order_id)
  where external_order_id is not null;

create index if not exists idx_orders_source on public.orders(source);
create index if not exists idx_orders_placed_at on public.orders(placed_at desc);

-- ---------------------------------------------------------------------------
-- 6. KOT tickets (kitchen order tickets, fan-out from one order)
-- ---------------------------------------------------------------------------
create table if not exists public.kot_tickets (
  id            bigserial primary key,
  order_id      bigint not null references public.orders(id) on delete cascade,
  outlet_id     bigint not null references public.outlets(id) on delete cascade,
  station_id    bigint references public.kitchen_stations(id) on delete set null,
  ticket_number int,                 -- per-outlet daily counter; populated by trigger or app
  status        text not null default 'queued'
    check (status in ('queued','printing','printed','acknowledged','ready','served','void')),
  printer_id    bigint references public.printers(id) on delete set null,
  printed_at    timestamptz,
  acknowledged_at timestamptz,
  ready_at      timestamptz,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_kot_order   on public.kot_tickets(order_id);
create index if not exists idx_kot_outlet  on public.kot_tickets(outlet_id);
create index if not exists idx_kot_status  on public.kot_tickets(status);

create table if not exists public.kot_ticket_items (
  id             bigserial primary key,
  kot_ticket_id  bigint not null references public.kot_tickets(id) on delete cascade,
  order_item_id  bigint not null references public.order_items(id) on delete cascade,
  quantity       int not null check (quantity > 0),
  notes          text,
  created_at     timestamptz not null default now()
);
create index if not exists idx_kot_items_ticket on public.kot_ticket_items(kot_ticket_id);

-- ---------------------------------------------------------------------------
-- 7. Channel item mappings (aggregator-side IDs ↔ our product IDs)
-- ---------------------------------------------------------------------------
create table if not exists public.channel_item_mappings (
  id                bigserial primary key,
  outlet_id         bigint not null references public.outlets(id) on delete cascade,
  channel           text not null
    check (channel in ('zomato','swiggy','magicpin','dunzo','ondc','uber-eats','dotpe','other')),
  external_item_id  text not null,         -- aggregator's item id
  product_id        bigint not null references public.products(id) on delete cascade,
  price_override    numeric(12,2),         -- aggregators often charge a different price than dine-in
  is_available      boolean not null default true,
  last_synced_at    timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (outlet_id, channel, external_item_id)
);
create index if not exists idx_cim_product on public.channel_item_mappings(product_id);
create index if not exists idx_cim_channel on public.channel_item_mappings(outlet_id, channel);

-- ---------------------------------------------------------------------------
-- 8. External order events (webhook audit log — every aggregator callback)
-- ---------------------------------------------------------------------------
create table if not exists public.external_order_events (
  id           bigserial primary key,
  outlet_id    bigint references public.outlets(id) on delete set null,
  order_id     bigint references public.orders(id) on delete set null,
  channel      text not null,
  event_type   text not null,           -- 'order.placed', 'order.cancelled', 'rider.assigned', ...
  external_event_id text,               -- aggregator's event id, for dedup
  payload      jsonb not null,
  signature_ok boolean,                 -- HMAC verification result
  received_at  timestamptz not null default now()
);
create index if not exists idx_eoe_order on public.external_order_events(order_id);
create unique index if not exists uq_eoe_dedup
  on public.external_order_events(channel, external_event_id)
  where external_event_id is not null;

-- ---------------------------------------------------------------------------
-- 9. updated_at triggers (lightweight — only for new tables we own here)
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['outlets','printers','kitchen_stations','kot_tickets','channel_item_mappings']
  loop
    execute format('drop trigger if exists trg_%I_updated_at on public.%I', t, t);
    execute format('create trigger trg_%I_updated_at before update on public.%I for each row execute function public.set_updated_at()', t, t);
  end loop;
end $$;

commit;
