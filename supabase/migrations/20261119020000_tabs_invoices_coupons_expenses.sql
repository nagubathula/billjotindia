-- Coupons, People's Tab Management (Khata), Corporate B2B GST Invoices,
-- and Petty Cash / Outlet Expenses.
-- All tables are restaurant-scoped with RLS enforcing role-based access.

begin;

-- ===========================================================================
-- 1. COUPONS & PROMO CODES
-- ===========================================================================

create table if not exists public.coupons (
  id               uuid primary key default gen_random_uuid(),
  restaurant_id    uuid not null references public.restaurants(id) on delete cascade,
  code             text not null,
  title            text not null,
  discount_type    text not null check (discount_type in ('percentage', 'flat')),
  discount_value   numeric(10,2) not null check (discount_value > 0),
  max_discount     numeric(10,2) check (max_discount is null or max_discount > 0),
  min_order_amount numeric(10,2) not null default 0 check (min_order_amount >= 0),
  channel          text not null default 'all' check (channel in ('all', 'storefront', 'pos', 'dine_in')),
  usage_limit      integer check (usage_limit is null or usage_limit > 0),
  used_count       integer not null default 0 check (used_count >= 0),
  expires_at       timestamptz,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create unique index if not exists idx_coupons_restaurant_code
  on public.coupons (restaurant_id, upper(code));

create index if not exists idx_coupons_restaurant_active
  on public.coupons (restaurant_id, is_active);

drop trigger if exists trg_coupons_updated_at on public.coupons;
create trigger trg_coupons_updated_at
  before update on public.coupons
  for each row execute function public.set_updated_at();

-- ===========================================================================
-- 2. PEOPLE'S TAB MANAGEMENT (KHATA / RUNNING CUSTOMER CREDIT ACCOUNTS)
-- ===========================================================================

create table if not exists public.customer_tabs (
  id               uuid primary key default gen_random_uuid(),
  restaurant_id    uuid not null references public.restaurants(id) on delete cascade,
  outlet_id        uuid references public.outlets(id) on delete set null,
  customer_name    text not null,
  phone            text,
  email            text,
  company_or_notes text,
  credit_limit     numeric(12,2) not null default 5000 check (credit_limit >= 0),
  current_balance  numeric(12,2) not null default 0,
  status           text not null default 'active' check (status in ('active', 'suspended', 'closed')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists idx_customer_tabs_restaurant_status
  on public.customer_tabs (restaurant_id, status);

drop trigger if exists trg_customer_tabs_updated_at on public.customer_tabs;
create trigger trg_customer_tabs_updated_at
  before update on public.customer_tabs
  for each row execute function public.set_updated_at();

create table if not exists public.customer_tab_transactions (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  tab_id        uuid not null references public.customer_tabs(id) on delete cascade,
  order_id      uuid references public.orders(id) on delete set null,
  entry_type    text not null check (entry_type in ('charge', 'payment', 'credit_note')),
  amount        numeric(12,2) not null check (amount > 0),
  balance_after numeric(12,2) not null default 0,
  payment_mode  text check (payment_mode is null or payment_mode in ('cash', 'upi', 'card', 'bank_transfer')),
  reference_no  text,
  note          text,
  recorded_at   timestamptz not null default now()
);

create index if not exists idx_customer_tab_tx_tab_date
  on public.customer_tab_transactions (tab_id, recorded_at desc);

create index if not exists idx_customer_tab_tx_restaurant_date
  on public.customer_tab_transactions (restaurant_id, recorded_at desc);

-- ===========================================================================
-- 3. CORPORATE CLIENTS & B2B GST TAX INVOICES
-- ===========================================================================

create table if not exists public.corporate_clients (
  id              uuid primary key default gen_random_uuid(),
  restaurant_id   uuid not null references public.restaurants(id) on delete cascade,
  company_name    text not null,
  gstin           text,
  contact_person  text,
  email           text,
  phone           text,
  billing_address text,
  state_name      text default 'Telangana',
  state_code      text default '36',
  payment_terms   text not null default 'net_15' check (payment_terms in ('due_on_receipt', 'net_7', 'net_15', 'net_30')),
  credit_limit    numeric(12,2) not null default 50000 check (credit_limit >= 0),
  status          text not null default 'active' check (status in ('active', 'inactive')),
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_corporate_clients_restaurant_status
  on public.corporate_clients (restaurant_id, status);

drop trigger if exists trg_corporate_clients_updated_at on public.corporate_clients;
create trigger trg_corporate_clients_updated_at
  before update on public.corporate_clients
  for each row execute function public.set_updated_at();

create table if not exists public.corporate_invoices (
  id                  uuid primary key default gen_random_uuid(),
  restaurant_id       uuid not null references public.restaurants(id) on delete cascade,
  outlet_id           uuid references public.outlets(id) on delete set null,
  corporate_client_id uuid not null references public.corporate_clients(id) on delete restrict,
  invoice_number      text not null,
  invoice_date        date not null default current_date,
  due_date            date,
  po_reference        text,
  place_of_supply     text,
  supply_type         text not null default 'intra' check (supply_type in ('intra', 'inter')),
  line_items          jsonb not null default '[]'::jsonb,
  linked_order_ids    uuid[] not null default '{}',
  taxable_subtotal    numeric(12,2) not null default 0,
  cgst_amount         numeric(12,2) not null default 0,
  sgst_amount         numeric(12,2) not null default 0,
  igst_amount         numeric(12,2) not null default 0,
  total_amount        numeric(12,2) not null default 0,
  amount_paid         numeric(12,2) not null default 0,
  payment_status      text not null default 'unpaid' check (payment_status in ('unpaid', 'partial', 'paid')),
  status              text not null default 'issued' check (status in ('draft', 'issued', 'cancelled')),
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create unique index if not exists idx_corporate_invoices_restaurant_no
  on public.corporate_invoices (restaurant_id, upper(invoice_number));

create index if not exists idx_corporate_invoices_restaurant_date
  on public.corporate_invoices (restaurant_id, invoice_date desc);

drop trigger if exists trg_corporate_invoices_updated_at on public.corporate_invoices;
create trigger trg_corporate_invoices_updated_at
  before update on public.corporate_invoices
  for each row execute function public.set_updated_at();

-- ===========================================================================
-- 4. PETTY CASH & OUTLET EXPENSES
-- ===========================================================================

create table if not exists public.outlet_expenses (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  outlet_id     uuid references public.outlets(id) on delete set null,
  expense_date  date not null default current_date,
  category      text not null default 'supplies'
    check (category in ('supplies', 'utilities', 'gas_fuel', 'repairs', 'cleaning', 'staff_welfare', 'marketing', 'logistics', 'misc')),
  title         text not null,
  amount        numeric(12,2) not null check (amount > 0),
  payment_mode  text not null default 'cash' check (payment_mode in ('cash', 'upi', 'card', 'bank_transfer')),
  paid_to       text,
  note          text,
  created_at    timestamptz not null default now()
);

create index if not exists idx_outlet_expenses_restaurant_date
  on public.outlet_expenses (restaurant_id, expense_date desc);

-- ===========================================================================
-- 5. ROW LEVEL SECURITY
-- ===========================================================================

alter table public.coupons enable row level security;
alter table public.customer_tabs enable row level security;
alter table public.customer_tab_transactions enable row level security;
alter table public.corporate_clients enable row level security;
alter table public.corporate_invoices enable row level security;
alter table public.outlet_expenses enable row level security;

drop policy if exists "Ops manage coupons" on public.coupons;
create policy "Ops manage coupons" on public.coupons
  for all using (public.user_has_restaurant_role(restaurant_id, array['admin', 'manager']))
  with check (public.user_has_restaurant_role(restaurant_id, array['admin', 'manager']));

drop policy if exists "POS read coupons" on public.coupons;
create policy "POS read coupons" on public.coupons
  for select using (public.user_has_restaurant_role(restaurant_id, array['admin', 'manager', 'user']));

drop policy if exists "Ops manage customer_tabs" on public.customer_tabs;
create policy "Ops manage customer_tabs" on public.customer_tabs
  for all using (public.user_has_restaurant_role(restaurant_id, array['admin', 'manager']))
  with check (public.user_has_restaurant_role(restaurant_id, array['admin', 'manager']));

drop policy if exists "POS read customer_tabs" on public.customer_tabs;
create policy "POS read customer_tabs" on public.customer_tabs
  for select using (public.user_has_restaurant_role(restaurant_id, array['admin', 'manager', 'user']));

drop policy if exists "Ops manage customer_tab_transactions" on public.customer_tab_transactions;
create policy "Ops manage customer_tab_transactions" on public.customer_tab_transactions
  for all using (public.user_has_restaurant_role(restaurant_id, array['admin', 'manager']))
  with check (public.user_has_restaurant_role(restaurant_id, array['admin', 'manager']));

drop policy if exists "Ops manage corporate_clients" on public.corporate_clients;
create policy "Ops manage corporate_clients" on public.corporate_clients
  for all using (public.user_has_restaurant_role(restaurant_id, array['admin', 'manager']))
  with check (public.user_has_restaurant_role(restaurant_id, array['admin', 'manager']));

drop policy if exists "Ops manage corporate_invoices" on public.corporate_invoices;
create policy "Ops manage corporate_invoices" on public.corporate_invoices
  for all using (public.user_has_restaurant_role(restaurant_id, array['admin', 'manager']))
  with check (public.user_has_restaurant_role(restaurant_id, array['admin', 'manager']));

drop policy if exists "Ops manage outlet_expenses" on public.outlet_expenses;
create policy "Ops manage outlet_expenses" on public.outlet_expenses
  for all using (public.user_has_restaurant_role(restaurant_id, array['admin', 'manager']))
  with check (public.user_has_restaurant_role(restaurant_id, array['admin', 'manager']));

commit;
