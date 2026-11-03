-- Restore what the UUID refactor (20260719000000) dropped but never recreated.
--
-- That migration ran `DROP FUNCTION ... CASCADE` on public_restaurant_by_slug
-- and get_my_orders, then only recreated public_restaurant_by_id and
-- public_outlets_for_restaurant. Every storefront that resolves its tenant by
-- slug (the main app's customer pages via lib/auth.ts, and the standalone
-- billjotdemocafe template) and the customer "past orders" page have been
-- failing since. This recreates both with uuid ids.
--
-- Also lands the POS tabs table from scripts/create-pos-tabs.sql, which the
-- POS tab server actions use but which was never applied (and was written for
-- bigint outlet ids).
--
-- Idempotent — safe to re-run.

begin;

-- ---------------------------------------------------------------------------
-- public_restaurant_by_slug(slug) — storefront resolver, public identity only.
-- ---------------------------------------------------------------------------
create or replace function public.public_restaurant_by_slug(p_slug text)
returns table (id uuid, slug text, name text)
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

grant execute on function public.public_restaurant_by_slug(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- get_my_orders(restaurant) — the signed-in customer's orders at this
-- restaurant, matched on the verified email in their JWT. Items carry enough
-- to reorder (product_id, name, base_price, gst_rate).
-- ---------------------------------------------------------------------------
create or replace function public.get_my_orders(p_restaurant_id uuid)
returns table (
  id uuid,
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
            'product_id', oi.product_config ->> 'product_id',
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

revoke execute on function public.get_my_orders(uuid) from public, anon;
grant execute on function public.get_my_orders(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- pos_tabs — open "bar tabs" shared across POS terminals of one outlet.
-- RLS on with staff-only policies; the tab server actions use the service-role
-- client and gate on requireRole themselves.
-- ---------------------------------------------------------------------------
create table if not exists public.pos_tabs (
  id          uuid primary key default gen_random_uuid(),
  outlet_id   uuid not null references public.outlets (id) on delete cascade,
  name        text not null,
  lines       jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists pos_tabs_outlet_idx on public.pos_tabs (outlet_id);

alter table public.pos_tabs enable row level security;

drop policy if exists "Members manage pos_tabs" on public.pos_tabs;
create policy "Members manage pos_tabs" on public.pos_tabs
  for all using (user_has_restaurant_access(outlet_restaurant_id(outlet_id)))
  with check (user_has_restaurant_access(outlet_restaurant_id(outlet_id)));

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pos_tabs'
     ) then
    alter publication supabase_realtime add table public.pos_tabs;
  end if;
end $$;

commit;
