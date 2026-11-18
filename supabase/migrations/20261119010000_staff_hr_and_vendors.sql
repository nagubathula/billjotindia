-- Staff HR System & Vendor Management System
-- Tables:
--   1. hr_employees, hr_attendance, hr_advances, hr_payroll_entries
--   2. vendors, vendor_purchase_orders, vendor_payments
-- All tables are restaurant-scoped with RLS enforcing admin/manager access.

begin;

-- ===========================================================================
-- 1. STAFF HR SYSTEM
-- ===========================================================================

create table if not exists public.hr_employees (
  id              uuid primary key default gen_random_uuid(),
  restaurant_id   uuid not null references public.restaurants(id) on delete cascade,
  outlet_id       uuid references public.outlets(id) on delete set null,
  auth_user_id    uuid references auth.users(id) on delete set null,
  employee_code   text not null,
  full_name       text not null,
  phone           text,
  email           text,
  department      text not null default 'kitchen'
    check (department in ('kitchen', 'service', 'counter', 'delivery', 'housekeeping', 'management')),
  designation     text not null,
  employment_type text not null default 'full_time'
    check (employment_type in ('full_time', 'part_time', 'daily_wage', 'contract')),
  shift_name      text not null default 'General',
  pay_type        text not null default 'monthly'
    check (pay_type in ('monthly', 'daily')),
  base_pay        numeric(12,2) not null default 0 check (base_pay >= 0),
  upi_or_bank     text,
  govt_id_note    text,
  joined_on       date not null default current_date,
  status          text not null default 'active'
    check (status in ('active', 'on_leave', 'inactive')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index if not exists idx_hr_employees_restaurant_code
  on public.hr_employees (restaurant_id, upper(employee_code));

create index if not exists idx_hr_employees_restaurant_status
  on public.hr_employees (restaurant_id, status);

drop trigger if exists trg_hr_employees_updated_at on public.hr_employees;
create trigger trg_hr_employees_updated_at
  before update on public.hr_employees
  for each row execute function public.set_updated_at();

create table if not exists public.hr_attendance (
  id              uuid primary key default gen_random_uuid(),
  restaurant_id   uuid not null references public.restaurants(id) on delete cascade,
  employee_id     uuid not null references public.hr_employees(id) on delete cascade,
  work_date       date not null,
  status          text not null
    check (status in ('present', 'half_day', 'absent', 'paid_leave', 'weekly_off')),
  check_in        time,
  check_out       time,
  overtime_hours  numeric(5,2) not null default 0 check (overtime_hours >= 0),
  note            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (employee_id, work_date)
);

create index if not exists idx_hr_attendance_restaurant_date
  on public.hr_attendance (restaurant_id, work_date);

drop trigger if exists trg_hr_attendance_updated_at on public.hr_attendance;
create trigger trg_hr_attendance_updated_at
  before update on public.hr_attendance
  for each row execute function public.set_updated_at();

create table if not exists public.hr_advances (
  id                     uuid primary key default gen_random_uuid(),
  restaurant_id          uuid not null references public.restaurants(id) on delete cascade,
  employee_id            uuid not null references public.hr_employees(id) on delete cascade,
  advance_date           date not null default current_date,
  amount                 numeric(12,2) not null check (amount > 0),
  payment_mode           text not null default 'cash'
    check (payment_mode in ('cash', 'upi', 'bank_transfer')),
  note                   text,
  deducted_payroll_month text,
  created_at             timestamptz not null default now()
);

create index if not exists idx_hr_advances_restaurant_date
  on public.hr_advances (restaurant_id, advance_date desc);

create table if not exists public.hr_payroll_entries (
  id                uuid primary key default gen_random_uuid(),
  restaurant_id     uuid not null references public.restaurants(id) on delete cascade,
  employee_id       uuid not null references public.hr_employees(id) on delete cascade,
  payroll_month     text not null check (payroll_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  days_in_month     integer not null check (days_in_month between 28 and 31),
  payable_days      numeric(5,2) not null default 0,
  overtime_hours    numeric(6,2) not null default 0,
  gross_earned      numeric(12,2) not null default 0,
  overtime_pay      numeric(12,2) not null default 0,
  bonus_amount      numeric(12,2) not null default 0,
  advance_deduction numeric(12,2) not null default 0,
  other_deduction   numeric(12,2) not null default 0,
  net_payable       numeric(12,2) not null default 0,
  payment_status    text not null default 'pending'
    check (payment_status in ('pending', 'paid')),
  payment_mode      text
    check (payment_mode is null or payment_mode in ('cash', 'upi', 'bank_transfer')),
  paid_at           timestamptz,
  note              text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (employee_id, payroll_month)
);

create index if not exists idx_hr_payroll_restaurant_month
  on public.hr_payroll_entries (restaurant_id, payroll_month);

drop trigger if exists trg_hr_payroll_entries_updated_at on public.hr_payroll_entries;
create trigger trg_hr_payroll_entries_updated_at
  before update on public.hr_payroll_entries
  for each row execute function public.set_updated_at();

-- ===========================================================================
-- 2. VENDOR MANAGEMENT SYSTEM
-- ===========================================================================

create table if not exists public.vendors (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references public.restaurants(id) on delete cascade,
  vendor_code    text not null,
  name           text not null,
  category       text not null default 'grocery'
    check (category in ('produce', 'meat_seafood', 'dairy_oils', 'grocery', 'spices', 'packaging', 'beverages', 'utilities_maintenance', 'other')),
  contact_person text,
  phone          text,
  email          text,
  gstin          text,
  address        text,
  payment_terms  text not null default 'cod'
    check (payment_terms in ('cod', 'net_7', 'net_15', 'net_30')),
  upi_or_bank    text,
  status         text not null default 'active'
    check (status in ('active', 'inactive')),
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create unique index if not exists idx_vendors_restaurant_code
  on public.vendors (restaurant_id, upper(vendor_code));

create index if not exists idx_vendors_restaurant_status
  on public.vendors (restaurant_id, status);

drop trigger if exists trg_vendors_updated_at on public.vendors;
create trigger trg_vendors_updated_at
  before update on public.vendors
  for each row execute function public.set_updated_at();

create table if not exists public.vendor_purchase_orders (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references public.restaurants(id) on delete cascade,
  outlet_id      uuid references public.outlets(id) on delete set null,
  vendor_id      uuid not null references public.vendors(id) on delete restrict,
  po_number      text not null,
  order_date     date not null default current_date,
  expected_date  date,
  received_at    timestamptz,
  invoice_number text,
  status         text not null default 'ordered'
    check (status in ('draft', 'ordered', 'received', 'cancelled')),
  items          jsonb not null default '[]'::jsonb,
  subtotal       numeric(12,2) not null default 0,
  gst_amount     numeric(12,2) not null default 0,
  total_amount   numeric(12,2) not null default 0,
  amount_paid    numeric(12,2) not null default 0,
  payment_status text not null default 'unpaid'
    check (payment_status in ('unpaid', 'partial', 'paid')),
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create unique index if not exists idx_vendor_pos_restaurant_po
  on public.vendor_purchase_orders (restaurant_id, upper(po_number));

create index if not exists idx_vendor_pos_restaurant_date
  on public.vendor_purchase_orders (restaurant_id, order_date desc);

drop trigger if exists trg_vendor_purchase_orders_updated_at on public.vendor_purchase_orders;
create trigger trg_vendor_purchase_orders_updated_at
  before update on public.vendor_purchase_orders
  for each row execute function public.set_updated_at();

create table if not exists public.vendor_payments (
  id                uuid primary key default gen_random_uuid(),
  restaurant_id     uuid not null references public.restaurants(id) on delete cascade,
  vendor_id         uuid not null references public.vendors(id) on delete restrict,
  purchase_order_id uuid references public.vendor_purchase_orders(id) on delete set null,
  payment_date      date not null default current_date,
  amount            numeric(12,2) not null check (amount > 0),
  payment_mode      text not null default 'upi'
    check (payment_mode in ('cash', 'upi', 'bank_transfer', 'cheque')),
  reference_no      text,
  note              text,
  created_at        timestamptz not null default now()
);

create index if not exists idx_vendor_payments_restaurant_date
  on public.vendor_payments (restaurant_id, payment_date desc);

-- ===========================================================================
-- 3. ROW LEVEL SECURITY
-- ===========================================================================

alter table public.hr_employees enable row level security;
alter table public.hr_attendance enable row level security;
alter table public.hr_advances enable row level security;
alter table public.hr_payroll_entries enable row level security;
alter table public.vendors enable row level security;
alter table public.vendor_purchase_orders enable row level security;
alter table public.vendor_payments enable row level security;

drop policy if exists "Ops manage hr_employees" on public.hr_employees;
create policy "Ops manage hr_employees" on public.hr_employees
  for all using (public.user_has_restaurant_role(restaurant_id, array['admin', 'manager']))
  with check (public.user_has_restaurant_role(restaurant_id, array['admin', 'manager']));

drop policy if exists "Ops manage hr_attendance" on public.hr_attendance;
create policy "Ops manage hr_attendance" on public.hr_attendance
  for all using (public.user_has_restaurant_role(restaurant_id, array['admin', 'manager']))
  with check (public.user_has_restaurant_role(restaurant_id, array['admin', 'manager']));

drop policy if exists "Ops manage hr_advances" on public.hr_advances;
create policy "Ops manage hr_advances" on public.hr_advances
  for all using (public.user_has_restaurant_role(restaurant_id, array['admin', 'manager']))
  with check (public.user_has_restaurant_role(restaurant_id, array['admin', 'manager']));

drop policy if exists "Ops manage hr_payroll_entries" on public.hr_payroll_entries;
create policy "Ops manage hr_payroll_entries" on public.hr_payroll_entries
  for all using (public.user_has_restaurant_role(restaurant_id, array['admin', 'manager']))
  with check (public.user_has_restaurant_role(restaurant_id, array['admin', 'manager']));

drop policy if exists "Ops manage vendors" on public.vendors;
create policy "Ops manage vendors" on public.vendors
  for all using (public.user_has_restaurant_role(restaurant_id, array['admin', 'manager']))
  with check (public.user_has_restaurant_role(restaurant_id, array['admin', 'manager']));

drop policy if exists "Ops manage vendor_purchase_orders" on public.vendor_purchase_orders;
create policy "Ops manage vendor_purchase_orders" on public.vendor_purchase_orders
  for all using (public.user_has_restaurant_role(restaurant_id, array['admin', 'manager']))
  with check (public.user_has_restaurant_role(restaurant_id, array['admin', 'manager']));

drop policy if exists "Ops manage vendor_payments" on public.vendor_payments;
create policy "Ops manage vendor_payments" on public.vendor_payments
  for all using (public.user_has_restaurant_role(restaurant_id, array['admin', 'manager']))
  with check (public.user_has_restaurant_role(restaurant_id, array['admin', 'manager']));

commit;
