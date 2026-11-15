-- API Webhooks, Storefront Customer Accounts, and Production Error Telemetry

-- 1. Outgoing order-status webhook settings per API key
alter table public.restaurant_api_keys
  add column if not exists webhook_url text,
  add column if not exists webhook_secret text;

-- 2. Restaurant-scoped customer accounts for API frontends
create table if not exists public.storefront_customers (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  email text not null,
  name text not null,
  phone text,
  password_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_storefront_customers_restaurant_email
  on public.storefront_customers (restaurant_id, lower(email));

alter table public.storefront_customers enable row level security;

drop trigger if exists trg_storefront_customers_updated_at on public.storefront_customers;
create trigger trg_storefront_customers_updated_at
  before update on public.storefront_customers
  for each row execute function public.set_updated_at();

-- Link orders to storefront customer accounts when placed while signed in
alter table public.orders
  add column if not exists customer_account_id uuid
  references public.storefront_customers(id) on delete set null;

create index if not exists idx_orders_customer_account_id
  on public.orders (customer_account_id)
  where customer_account_id is not null;

-- 3. Server-side 5xx error telemetry log (service-role-only under RLS)
create table if not exists public.server_error_logs (
  id uuid primary key default gen_random_uuid(),
  route text not null,
  method text,
  error_name text,
  message text not null,
  digest text,
  stack text,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_server_error_logs_created_at
  on public.server_error_logs (created_at desc);

alter table public.server_error_logs enable row level security;
