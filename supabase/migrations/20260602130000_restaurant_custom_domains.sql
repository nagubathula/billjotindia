-- Custom domains for restaurants.
--
-- Lets a tenant point their own domain (e.g. order.cafemocha.com) at the app,
-- in addition to the platform subdomain (cafemocha.billjot.app). The host →
-- restaurant resolution happens in middleware, which can't carry an auth
-- session, so we expose a narrow SECURITY DEFINER lookup (host → slug only)
-- callable by anon rather than opening up the restaurants table.
--
-- Idempotent — safe to re-run.

begin;

-- ---------------------------------------------------------------------------
-- 1. restaurants.custom_domain — at most one restaurant per domain.
--    Stored normalized: lowercase, no scheme, no port, no path.
--    NULL = no custom domain (the unique index ignores NULLs).
-- ---------------------------------------------------------------------------
alter table public.restaurants
  add column if not exists custom_domain text;

-- Reject anything that isn't a bare, lowercase hostname.
alter table public.restaurants
  drop constraint if exists restaurants_custom_domain_format;
alter table public.restaurants
  add constraint restaurants_custom_domain_format
    check (
      custom_domain is null
      or custom_domain ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'
    );

create unique index if not exists uq_restaurants_custom_domain
  on public.restaurants(custom_domain)
  where custom_domain is not null;

-- ---------------------------------------------------------------------------
-- 2. restaurant_slug_for_domain(host) — middleware resolver.
--    Returns the slug of the ACTIVE restaurant owning this custom domain, or
--    NULL. SECURITY DEFINER so it works without an auth session and without a
--    public read policy on restaurants. Only ever leaks the slug, nothing else.
-- ---------------------------------------------------------------------------
create or replace function public.restaurant_slug_for_domain(host text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select slug
  from public.restaurants
  where custom_domain = lower(host)
    and status <> 'suspended'
  limit 1;
$$;

grant execute on function public.restaurant_slug_for_domain(text) to anon, authenticated;

commit;
