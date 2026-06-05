-- Extend get_my_orders so each item carries enough to "reorder": the
-- product_id, name, base_price and gst_rate captured in product_config at order
-- time, plus quantity and the line total. Same function signature (items is
-- still jsonb) — only the per-item shape grows.
--
-- Idempotent — safe to re-run.

begin;

create or replace function public.get_my_orders(p_restaurant_id bigint)
returns table (
  id bigint,
  unique_order_id text,
  status text,
  order_type text,
  total_amount numeric,
  placed_at timestamptz,
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
    o.total_amount,
    o.placed_at,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'product_id', (oi.product_config ->> 'product_id')::bigint,
            'name', oi.product_config ->> 'name',
            'base_price', coalesce((oi.product_config ->> 'base_price')::numeric, oi.unit_price),
            'gst_rate', (oi.product_config ->> 'gst_rate')::numeric,
            'quantity', oi.quantity,
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
  where ou.restaurant_id = p_restaurant_id
    and o.customer_email = (auth.jwt() ->> 'email')
    and (auth.jwt() ->> 'email') is not null
  order by o.placed_at desc nulls last, o.id desc
  limit 100;
$$;

grant execute on function public.get_my_orders(bigint) to authenticated;

commit;
