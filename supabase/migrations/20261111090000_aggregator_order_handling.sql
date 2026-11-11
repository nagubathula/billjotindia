-- Aggregator readiness, part 3: the order handling a delivery platform expects
-- from a POS, plus a way to stop keeping the data platforms send us.
--
--   • orders       — cooking instructions; why, when and by whom an order was
--                    rejected/cancelled, and which products were out of stock
--   • order_items  — per-item instructions
--   • channel_outlets — why an outlet is offline on a channel, and since when
--   • outlets      — weekly opening hours
--   • purge_channel_data() — strips platform-supplied personal data and raw
--                    payloads from old orders, and deletes old webhook events
--
-- Nothing here talks to a platform; the channel adapters will read and write
-- these columns. Additive only; safe to re-run.

begin;

-- ---------------------------------------------------------------------------
-- orders: instructions and cancellation detail
-- ---------------------------------------------------------------------------
-- cancel_reason holds one of our own reason codes (lib/order-cancel.ts). It is
-- deliberately not check-constrained: each platform has its own reason list,
-- and the adapter maps ours onto theirs.
alter table public.orders
  add column if not exists instructions       text,
  add column if not exists cancel_reason      text,
  add column if not exists cancel_note        text,
  add column if not exists cancelled_by       text
    check (cancelled_by is null or cancelled_by in ('merchant','customer','platform','system')),
  add column if not exists cancelled_at       timestamptz,
  add column if not exists cancel_product_ids uuid[] not null default '{}';  -- products that were out of stock

alter table public.order_items
  add column if not exists instructions text;

-- ---------------------------------------------------------------------------
-- channel_outlets: offline reason
-- ---------------------------------------------------------------------------
alter table public.channel_outlets
  add column if not exists offline_reason text,
  add column if not exists offline_since  timestamptz;

-- ---------------------------------------------------------------------------
-- outlets: opening hours
-- ---------------------------------------------------------------------------
-- {"mon":[{"open":"09:00","close":"22:00"}], "tue":[], ...} in the outlet's
-- own timezone. An empty array is a closed day; a close time earlier than the
-- open time runs past midnight. NULL means hours were never set.
alter table public.outlets
  add column if not exists opening_hours jsonb;

-- ---------------------------------------------------------------------------
-- purge_channel_data
-- ---------------------------------------------------------------------------
-- For one channel, on orders placed before (now - p_older_than):
--   • clears the raw platform payload, the customer's phone and rider details
--   • replaces the customer's name with 'Customer'
-- and deletes that channel's webhook events of the same age.
--
-- Amounts, items, tax and the platform's order id stay, so reports, invoices
-- and reconciliation keep working. Pass interval '0' to scrub everything for a
-- channel (for example when an integration ends).
--
-- Not scheduled here: see scripts/schedule-aggregator-purge.sql.
create or replace function public.purge_channel_data(
  p_channel    text,
  p_older_than interval default interval '90 days'
)
returns table (orders_scrubbed bigint, events_deleted bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cutoff timestamptz := now() - p_older_than;
  v_orders bigint;
  v_events bigint;
begin
  if p_channel in ('pos', 'kiosk', 'web') then
    raise exception 'purge_channel_data is for aggregator channels, not %', p_channel;
  end if;

  update public.orders
     set external_payload = null,
         customer_phone   = null,
         delivery_partner = null,
         customer_name    = 'Customer'
   where source = p_channel
     and placed_at < v_cutoff
     and (external_payload is not null
          or customer_phone is not null
          or delivery_partner is not null
          or customer_name <> 'Customer');
  get diagnostics v_orders = row_count;

  delete from public.external_order_events
   where channel = p_channel
     and received_at < v_cutoff;
  get diagnostics v_events = row_count;

  return query select v_orders, v_events;
end $$;

revoke all on function public.purge_channel_data(text, interval) from public, anon, authenticated;
grant execute on function public.purge_channel_data(text, interval) to service_role;

commit;
