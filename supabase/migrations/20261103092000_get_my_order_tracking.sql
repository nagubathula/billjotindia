-- get_my_order(order) — one order, with its line items and modifiers, for the
-- signed-in customer who placed it. Powers the live order-tracking page on the
-- storefronts (polled while the kitchen moves the order through its statuses).
--
-- Same trust model as get_my_orders: SECURITY DEFINER, matched on the verified
-- email in the caller's JWT, so a customer can only ever see their own order.
-- Returns no rows for anyone else (including anon, which can't execute it).
--
-- Idempotent — safe to re-run.

begin;

create or replace function public.get_my_order(p_order_id uuid)
returns table (
  id uuid,
  unique_order_id text,
  status text,
  order_type text,
  subtotal numeric,
  cgst_amount numeric,
  sgst_amount numeric,
  takeaway_charges numeric,
  total_amount numeric,
  placed_at timestamptz,
  updated_at timestamptz,
  outlet_name text,
  outlet_phone text,
  items jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    o.id,
    o.unique_order_id,
    o.status,
    o.order_type,
    o.subtotal,
    o.cgst_amount,
    o.sgst_amount,
    o.takeaway_charges,
    o.total_amount,
    o.placed_at,
    o.updated_at,
    ou.name,
    ou.phone,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'product_id', oi.product_config ->> 'product_id',
            'name', oi.product_config ->> 'name',
            'options', coalesce(oi.product_config -> 'selected_options', '[]'::jsonb),
            'quantity', oi.quantity,
            'unit_price', oi.unit_price,
            'total_price', oi.total_price
          )
          order by oi.id
        )
        from public.order_items oi
        where oi.order_id = o.id
      ),
      '[]'::jsonb
    ) as items
  from public.orders o
  join public.outlets ou on ou.id = o.outlet_id
  where o.id = p_order_id
    and o.customer_email = (auth.jwt() ->> 'email')
    and (auth.jwt() ->> 'email') is not null
  limit 1;
$$;

revoke execute on function public.get_my_order(uuid) from public, anon;
grant execute on function public.get_my_order(uuid) to authenticated;

commit;
