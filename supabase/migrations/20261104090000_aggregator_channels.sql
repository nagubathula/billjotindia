-- Aggregator readiness, part 2 (Swiggy, Zomato and other delivery channels).
--
-- 20260525150017 already gave orders a source / external_order_id /
-- external_payload / external_status, an idempotency index, item mappings and
-- a webhook log. This fills the remaining gaps so a channel adapter only has
-- to translate payloads:
--
--   • channel_outlets         — the aggregator's store id ↔ our outlet, plus
--                               the per-channel online/busy switch
--   • channel_option_mappings — aggregator add-on ids ↔ customization_options
--   • orders: who paid the GST, settlement amounts, masked customer phone and
--     delivery-partner details
--
-- GST note: under Section 9(5) of the CGST Act, food aggregators (e-commerce
-- operators) pay the 5% GST on restaurant orders placed through them. Those
-- orders are flagged gst_paid_by_operator and carry no CGST/SGST of ours, so
-- GST reports don't count tax the restaurant never collected.
--
-- Additive only; safe to re-run.

begin;

-- ---------------------------------------------------------------------------
-- channel_outlets
-- ---------------------------------------------------------------------------
create table if not exists public.channel_outlets (
  id                 uuid primary key default gen_random_uuid(),
  outlet_id          uuid not null references public.outlets (id) on delete cascade,
  channel            text not null
    check (channel in ('zomato','swiggy','magicpin','dunzo','ondc','uber-eats','dotpe','other')),
  external_store_id  text not null,          -- the aggregator's restaurant/store id
  is_online          boolean not null default true,  -- accepting orders on this channel
  prep_time_minutes  int not null default 15 check (prep_time_minutes between 1 and 180),
  last_synced_at     timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (outlet_id, channel),
  unique (channel, external_store_id)
);

-- ---------------------------------------------------------------------------
-- channel_option_mappings
-- ---------------------------------------------------------------------------
create table if not exists public.channel_option_mappings (
  id                  uuid primary key default gen_random_uuid(),
  outlet_id           uuid not null references public.outlets (id) on delete cascade,
  channel             text not null
    check (channel in ('zomato','swiggy','magicpin','dunzo','ondc','uber-eats','dotpe','other')),
  external_option_id  text not null,         -- the aggregator's add-on/variant id
  option_id           uuid not null references public.customization_options (id) on delete cascade,
  price_override      numeric(12,2),
  is_available        boolean not null default true,
  last_synced_at      timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (outlet_id, channel, external_option_id)
);
create index if not exists idx_com_option on public.channel_option_mappings (option_id);

-- ---------------------------------------------------------------------------
-- orders: GST responsibility, settlement, masked contact, rider
-- ---------------------------------------------------------------------------
alter table public.orders
  add column if not exists gst_paid_by_operator boolean not null default false,
  add column if not exists commission_amount    numeric(12,2) not null default 0,  -- aggregator commission (pre-tax)
  add column if not exists platform_discount    numeric(12,2) not null default 0,  -- discount funded by the aggregator
  add column if not exists delivery_charges     numeric(12,2) not null default 0,  -- delivery fee paid by the customer
  add column if not exists net_payout           numeric(12,2),                     -- what the aggregator settles to us
  add column if not exists customer_phone       text,                              -- often a masked/proxy number
  add column if not exists delivery_partner     jsonb;                             -- {name, phone, eta_minutes}

-- ---------------------------------------------------------------------------
-- RLS — same access as channel_item_mappings: admins/managers of the
-- outlet's restaurant. Webhook adapters use the service role.
-- ---------------------------------------------------------------------------
alter table public.channel_outlets enable row level security;
alter table public.channel_option_mappings enable row level security;

drop policy if exists "Admins manage channel_outlets" on public.channel_outlets;
create policy "Admins manage channel_outlets" on public.channel_outlets
  for all using (user_has_restaurant_role(outlet_restaurant_id(outlet_id), ARRAY['admin', 'manager']))
  with check (user_has_restaurant_role(outlet_restaurant_id(outlet_id), ARRAY['admin', 'manager']));

drop policy if exists "Admins manage channel_option_mappings" on public.channel_option_mappings;
create policy "Admins manage channel_option_mappings" on public.channel_option_mappings
  for all using (user_has_restaurant_role(outlet_restaurant_id(outlet_id), ARRAY['admin', 'manager']))
  with check (user_has_restaurant_role(outlet_restaurant_id(outlet_id), ARRAY['admin', 'manager']));

-- updated_at maintenance, matching the other channel tables.
do $$
declare t text;
begin
  foreach t in array array['channel_outlets', 'channel_option_mappings']
  loop
    execute format('drop trigger if exists trg_%I_updated_at on public.%I', t, t);
    execute format('create trigger trg_%I_updated_at before update on public.%I for each row execute function public.set_updated_at()', t, t);
  end loop;
end $$;

commit;
