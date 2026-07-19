-- Public storefront reads by ID.
-- Resolves a storefront by ID instead of slug, returning only public identity fields.

begin;

create or replace function public.public_restaurant_by_id(p_restaurant_id bigint)
returns table (id bigint, slug text, name text)
language sql
stable
security definer
set search_path = public
as $$
  select id, slug, name
  from public.restaurants
  where id = p_restaurant_id
    and status <> 'suspended'
  limit 1;
$$;

grant execute on function public.public_restaurant_by_id(bigint) to anon, authenticated;

commit;
