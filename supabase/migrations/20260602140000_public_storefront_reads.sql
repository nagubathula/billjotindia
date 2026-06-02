-- Public storefront reads.
--
-- The customer storefront (menu, checkout, order confirmation) is browsed by
-- logged-out visitors, but `restaurants` is members-only and `outlets` is
-- deliberately private ops data (see RLS migration). Rather than open those
-- tables to anon — which would leak owner_user_id, GSTIN, FSSAI, email, etc. —
-- we expose two narrow SECURITY DEFINER readers that return only the columns a
-- storefront needs. This is what makes subdomain / custom-domain storefronts
-- load for anonymous customers.
--
-- Idempotent — safe to re-run.

begin;

-- Resolve a storefront by slug → only public identity fields.
create or replace function public.public_restaurant_by_slug(p_slug text)
returns table (id bigint, slug text, name text)
language sql
stable
security definer
set search_path = public
as $$
  select id, slug, name
  from public.restaurants
  where slug = p_slug
    and status <> 'suspended'
  limit 1;
$$;

-- Customer-facing outlet details for a restaurant. Excludes private ops/tax
-- fields (gstin, fssai_license, email, state_code, timezone, currency, status).
create or replace function public.public_outlets_for_restaurant(p_restaurant_id bigint)
returns table (
  id bigint,
  name text,
  address text,
  city text,
  state text,
  pincode text,
  phone text
)
language sql
stable
security definer
set search_path = public
as $$
  select id, name, address, city, state, pincode, phone
  from public.outlets
  where restaurant_id = p_restaurant_id
  order by id;
$$;

grant execute on function public.public_restaurant_by_slug(text) to anon, authenticated;
grant execute on function public.public_outlets_for_restaurant(bigint) to anon, authenticated;

commit;
