-- public_bestsellers(restaurant) — the restaurant's best-selling products over
-- the last 30 days, for "Bestseller" tags on public storefronts.
--
-- SECURITY DEFINER so anon storefronts can call it without read access to
-- orders. Returns only product ids and the quantity sold — no order, customer
-- or revenue data. Cancelled orders don't count.
--
-- Idempotent — safe to re-run.

begin;

create or replace function public.public_bestsellers(p_restaurant_id uuid, p_limit int default 5)
returns table (product_id uuid, quantity bigint)
language sql
stable
security definer
set search_path = public
as $$
  select (oi.product_config ->> 'product_id')::uuid as product_id,
         sum(oi.quantity)::bigint as quantity
  from public.order_items oi
  join public.orders o   on o.id = oi.order_id
  join public.outlets ou on ou.id = o.outlet_id
  where ou.restaurant_id = p_restaurant_id
    and o.status is distinct from 'cancelled'
    and o.placed_at > now() - interval '30 days'
    and (oi.product_config ->> 'product_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  group by 1
  order by 2 desc
  limit least(greatest(p_limit, 1), 20);
$$;

grant execute on function public.public_bestsellers(uuid, int) to anon, authenticated;

commit;
