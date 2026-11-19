-- Table bookings, scheduled reservations, live walk-in waitlist,
-- per-outlet booking/deposit policies, and external API booking scopes.

begin;

-- 1. Expand API key scopes to allow bookings:read and bookings:write
do $$
declare r record;
begin
  for r in (
    select conname
      from pg_constraint
     where conrelid = 'public.restaurant_api_keys'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%scopes%'
  ) loop
    execute format(
      'alter table public.restaurant_api_keys drop constraint if exists %I',
      r.conname
    );
  end loop;
end $$;

alter table public.restaurant_api_keys
  add constraint restaurant_api_keys_scopes_check
  check (
    cardinality(scopes) > 0
    and scopes <@ array['menu:read', 'orders:write', 'bookings:read', 'bookings:write']
  );

-- 2. Per-outlet booking & deposit policy settings
alter table public.outlets
  add column if not exists bookings_enabled boolean not null default true,
  add column if not exists booking_slot_minutes integer not null default 30
    check (booking_slot_minutes in (15, 30, 60)),
  add column if not exists booking_turn_minutes integer not null default 90
    check (booking_turn_minutes between 30 and 360),
  add column if not exists booking_max_party_size integer not null default 20
    check (booking_max_party_size between 1 and 200),
  add column if not exists booking_advance_days integer not null default 30
    check (booking_advance_days between 1 and 180),
  add column if not exists booking_deposit_per_guest numeric(10,2) not null default 0
    check (booking_deposit_per_guest >= 0),
  add column if not exists booking_deposit_min_party integer not null default 1
    check (booking_deposit_min_party >= 1);

-- 3. Table bookings & walk-in waitlist entries
create table if not exists public.table_bookings (
  id                  uuid primary key default gen_random_uuid(),
  restaurant_id       uuid not null references public.restaurants(id) on delete cascade,
  outlet_id           uuid not null references public.outlets(id) on delete cascade,
  table_id            uuid null references public.pos_tabs(id) on delete set null,
  booking_code        text not null unique,
  booking_type        text not null default 'reservation'
    check (booking_type in ('reservation', 'waitlist')),
  source              text not null default 'web'
    check (source in ('admin', 'pos', 'web', 'api', 'phone', 'walk_in')),
  status              text not null default 'confirmed'
    check (status in (
      'pending_payment',
      'pending',
      'confirmed',
      'waitlisted',
      'notified',
      'seated',
      'completed',
      'cancelled',
      'no_show'
    )),
  customer_name       text not null check (char_length(btrim(customer_name)) between 1 and 120),
  customer_phone      text not null check (char_length(btrim(customer_phone)) between 5 and 30),
  customer_email      text null,
  party_size          integer not null check (party_size between 1 and 200),
  preferred_zone      text null,
  occasion            text null,
  special_requests    text null,
  reserved_for        timestamptz not null,
  duration_minutes    integer not null default 90 check (duration_minutes between 15 and 480),
  quoted_wait_minutes integer null check (quoted_wait_minutes is null or quoted_wait_minutes between 0 and 300),
  queue_number        integer null,
  deposit_amount      numeric(10,2) not null default 0 check (deposit_amount >= 0),
  deposit_status      text not null default 'none'
    check (deposit_status in ('none', 'pending', 'paid', 'refunded', 'waived')),
  payment_provider    text null,
  payment_reference   text null,
  seated_at           timestamptz null,
  completed_at        timestamptz null,
  cancelled_at        timestamptz null,
  cancel_reason       text null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_table_bookings_outlet_reserved
  on public.table_bookings (outlet_id, reserved_for);

create index if not exists idx_table_bookings_outlet_status_reserved
  on public.table_bookings (outlet_id, status, reserved_for);

create index if not exists idx_table_bookings_restaurant_created
  on public.table_bookings (restaurant_id, created_at desc);

drop trigger if exists trg_table_bookings_updated_at on public.table_bookings;
create trigger trg_table_bookings_updated_at
  before update on public.table_bookings
  for each row execute function public.set_updated_at();

alter table public.table_bookings enable row level security;

drop policy if exists "Staff manage table_bookings" on public.table_bookings;
create policy "Staff manage table_bookings" on public.table_bookings
  for all
  using (public.user_has_restaurant_role(restaurant_id, array['admin', 'manager', 'user', 'captain']))
  with check (public.user_has_restaurant_role(restaurant_id, array['admin', 'manager', 'user', 'captain']));

commit;
