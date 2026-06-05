-- Customer order history (storefront "My orders" / profile).
--
-- The orders table is RLS-locked to staff. A signed-in customer on a storefront
-- needs to see THEIR OWN past orders — matched by the verified email in their
-- JWT. This SECURITY DEFINER function does exactly that, scoped to one
-- restaurant's outlets, so a per-tenant storefront only shows its own orders.
--
-- Secret-free: the storefront calls this with the customer's session (anon key
-- + their access token), and the function reads auth.jwt() to know who they are.
-- A caller with no session gets nothing (email is null). Granted to
-- `authenticated` only.
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
            'name', oi.product_config ->> 'name',
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
