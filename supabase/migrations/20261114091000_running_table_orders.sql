-- Running table orders: "Send KOT" puts a table's items on the kitchen board
-- straight away as one unpaid order per table; later KOTs add to that order,
-- and the cashier settles the same order at the end.
--
--   • pos_tabs.order_id links a table's tab to its running order. Cleared when
--     the bill is settled; set null if the order is deleted.
--   • Which lines were already sent is kept in the tab's lines JSON (sentQty),
--     so no schema change is needed for that.
--   • A running order is marked customer_email = 'pos+open@billjot.local'
--     until it's settled, when it becomes pos+cash / pos+upi / pos+card like
--     any POS bill. Day-end cash totals leave open orders out.
--
-- Additive only; safe to re-run.

begin;

alter table public.pos_tabs
  add column if not exists order_id uuid references public.orders (id) on delete set null;

create index if not exists idx_pos_tabs_order_id
  on public.pos_tabs (order_id)
  where order_id is not null;

commit;
