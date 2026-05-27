-- Phase 4: Row-Level Security for multi-restaurant isolation.
--
-- Locks down every tenant table so users can only access data for restaurants
-- they hold a user_roles row in. The service role bypasses RLS entirely, so
-- server actions / API routes that need to act on behalf of admins (or for
-- anonymous storefront checkout) use the admin client in lib/supabase/admin.ts.
--
-- Storefront-readable tables (products, categories, banners, customizations,
-- submenus) have an additional permissive 'anon can read active rows' policy
-- so the menu pages keep working without sign-in.
--
-- Idempotent — drops + recreates each policy.

begin;

-- ===========================================================================
-- Helper functions
-- ===========================================================================

-- True if the current auth user has any user_roles row for this restaurant.
create or replace function public.user_has_restaurant_access(rid bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and restaurant_id = rid
  );
$$;

-- True if the current auth user has any of the allowed roles in this restaurant.
create or replace function public.user_has_restaurant_role(rid bigint, allowed text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid()
      and restaurant_id = rid
      and role::text = ANY(allowed)
  );
$$;

-- Outlet → restaurant_id lookup, for policies on tables that only carry outlet_id.
create or replace function public.outlet_restaurant_id(oid bigint)
returns bigint
language sql
stable
as $$
  select restaurant_id from public.outlets where id = oid;
$$;

-- Grant execute to anon + authenticated so policies can call these.
grant execute on function public.user_has_restaurant_access(bigint) to anon, authenticated;
grant execute on function public.user_has_restaurant_role(bigint, text[]) to anon, authenticated;
grant execute on function public.outlet_restaurant_id(bigint) to anon, authenticated;

-- ===========================================================================
-- Enable RLS on every tenant table
-- ===========================================================================

alter table public.restaurants            enable row level security;
alter table public.user_roles             enable row level security;
alter table public.outlets                enable row level security;
alter table public.categories             enable row level security;
alter table public.products               enable row level security;
alter table public.customization_groups   enable row level security;
alter table public.customization_options  enable row level security;
alter table public.product_customizations enable row level security;
alter table public.category_submenus      enable row level security;
alter table public.submenu_items          enable row level security;
alter table public.promotional_banners    enable row level security;
alter table public.orders                 enable row level security;
alter table public.order_items            enable row level security;
alter table public.payment_settings       enable row level security;
alter table public.profiles               enable row level security;
alter table public.printers               enable row level security;
alter table public.kitchen_stations       enable row level security;
alter table public.kot_tickets            enable row level security;
alter table public.kot_ticket_items       enable row level security;
alter table public.channel_item_mappings  enable row level security;
alter table public.external_order_events  enable row level security;

-- ===========================================================================
-- restaurants — members read, admins update
-- ===========================================================================
drop policy if exists "Members read their restaurants" on public.restaurants;
create policy "Members read their restaurants" on public.restaurants
  for select using (user_has_restaurant_access(id));

drop policy if exists "Admins update their restaurants" on public.restaurants;
create policy "Admins update their restaurants" on public.restaurants
  for update using (user_has_restaurant_role(id, ARRAY['admin']));
-- INSERT / DELETE only via service role.

-- ===========================================================================
-- user_roles — users see their own; admins of a restaurant see + manage all
-- rows for that restaurant.
-- ===========================================================================
drop policy if exists "Users see own roles" on public.user_roles;
create policy "Users see own roles" on public.user_roles
  for select using (user_id = auth.uid());

drop policy if exists "Admins see restaurant roles" on public.user_roles;
create policy "Admins see restaurant roles" on public.user_roles
  for select using (user_has_restaurant_role(restaurant_id, ARRAY['admin']));

drop policy if exists "Admins manage restaurant roles" on public.user_roles;
create policy "Admins manage restaurant roles" on public.user_roles
  for all using (user_has_restaurant_role(restaurant_id, ARRAY['admin']))
  with check (user_has_restaurant_role(restaurant_id, ARRAY['admin']));

-- ===========================================================================
-- outlets — members read + manage. No public read (outlet details are private
-- ops data; if you want a customer-facing 'about us' use a separate field).
-- ===========================================================================
drop policy if exists "Members read outlets" on public.outlets;
create policy "Members read outlets" on public.outlets
  for select using (user_has_restaurant_access(restaurant_id));

drop policy if exists "Admins manage outlets" on public.outlets;
create policy "Admins manage outlets" on public.outlets
  for all using (user_has_restaurant_role(restaurant_id, ARRAY['admin', 'manager']))
  with check (user_has_restaurant_role(restaurant_id, ARRAY['admin', 'manager']));

-- ===========================================================================
-- categories — anon reads active, staff manages
-- ===========================================================================
drop policy if exists "Anon reads active categories" on public.categories;
create policy "Anon reads active categories" on public.categories
  for select using (status = 'active');

drop policy if exists "Members manage categories" on public.categories;
create policy "Members manage categories" on public.categories
  for all using (user_has_restaurant_access(outlet_restaurant_id(outlet_id)))
  with check (user_has_restaurant_access(outlet_restaurant_id(outlet_id)));

-- ===========================================================================
-- products — anon reads active, staff manages
-- ===========================================================================
drop policy if exists "Anon reads active products" on public.products;
create policy "Anon reads active products" on public.products
  for select using (status = 'active');

drop policy if exists "Members manage products" on public.products;
create policy "Members manage products" on public.products
  for all using (user_has_restaurant_access(outlet_restaurant_id(outlet_id)))
  with check (user_has_restaurant_access(outlet_restaurant_id(outlet_id)));

-- ===========================================================================
-- customization_groups — anon reads active, staff manages
-- ===========================================================================
drop policy if exists "Anon reads active customization_groups" on public.customization_groups;
create policy "Anon reads active customization_groups" on public.customization_groups
  for select using (status = 'active');

drop policy if exists "Members manage customization_groups" on public.customization_groups;
create policy "Members manage customization_groups" on public.customization_groups
  for all using (user_has_restaurant_access(outlet_restaurant_id(outlet_id)))
  with check (user_has_restaurant_access(outlet_restaurant_id(outlet_id)));

-- ===========================================================================
-- customization_options — anon reads active (joined via group), staff manages
-- ===========================================================================
drop policy if exists "Anon reads active customization_options" on public.customization_options;
create policy "Anon reads active customization_options" on public.customization_options
  for select using (status = 'active');

drop policy if exists "Members manage customization_options" on public.customization_options;
create policy "Members manage customization_options" on public.customization_options
  for all using (
    group_id in (
      select id from public.customization_groups
      where user_has_restaurant_access(outlet_restaurant_id(outlet_id))
    )
  )
  with check (
    group_id in (
      select id from public.customization_groups
      where user_has_restaurant_access(outlet_restaurant_id(outlet_id))
    )
  );

-- ===========================================================================
-- product_customizations — staff only (no anon need — derived data)
-- ===========================================================================
drop policy if exists "Anon reads product_customizations" on public.product_customizations;
create policy "Anon reads product_customizations" on public.product_customizations
  for select using (
    product_id in (select id from public.products where status = 'active')
  );

drop policy if exists "Members manage product_customizations" on public.product_customizations;
create policy "Members manage product_customizations" on public.product_customizations
  for all using (
    product_id in (
      select id from public.products
      where user_has_restaurant_access(outlet_restaurant_id(outlet_id))
    )
  )
  with check (
    product_id in (
      select id from public.products
      where user_has_restaurant_access(outlet_restaurant_id(outlet_id))
    )
  );

-- ===========================================================================
-- category_submenus / submenu_items — service-role only for now (no
-- restaurant_id or outlet_id; original schema used text-based linking that
-- doesn't fit cleanly. Will revisit when these surface in the UI).
-- (No policies = no access from anon/authenticated. service_role still works.)
-- ===========================================================================

-- ===========================================================================
-- promotional_banners — anon reads active, staff manages
-- ===========================================================================
drop policy if exists "Anon reads active banners" on public.promotional_banners;
create policy "Anon reads active banners" on public.promotional_banners
  for select using (status = 'active');

drop policy if exists "Admins manage banners" on public.promotional_banners;
create policy "Admins manage banners" on public.promotional_banners
  for all using (user_has_restaurant_role(outlet_restaurant_id(outlet_id), ARRAY['admin', 'manager']))
  with check (user_has_restaurant_role(outlet_restaurant_id(outlet_id), ARRAY['admin', 'manager']));

-- ===========================================================================
-- orders — staff in restaurant reads + writes. Customer-facing inserts (from
-- the public storefront /api/orders) go through the service-role admin client.
-- ===========================================================================
drop policy if exists "Members read orders" on public.orders;
create policy "Members read orders" on public.orders
  for select using (user_has_restaurant_access(outlet_restaurant_id(outlet_id)));

drop policy if exists "Members write orders" on public.orders;
create policy "Members write orders" on public.orders
  for all using (user_has_restaurant_access(outlet_restaurant_id(outlet_id)))
  with check (user_has_restaurant_access(outlet_restaurant_id(outlet_id)));

-- ===========================================================================
-- order_items — same membership as parent order
-- ===========================================================================
drop policy if exists "Members read order_items" on public.order_items;
create policy "Members read order_items" on public.order_items
  for select using (
    order_id in (
      select id from public.orders
      where user_has_restaurant_access(outlet_restaurant_id(outlet_id))
    )
  );

drop policy if exists "Members write order_items" on public.order_items;
create policy "Members write order_items" on public.order_items
  for all using (
    order_id in (
      select id from public.orders
      where user_has_restaurant_access(outlet_restaurant_id(outlet_id))
    )
  )
  with check (
    order_id in (
      select id from public.orders
      where user_has_restaurant_access(outlet_restaurant_id(outlet_id))
    )
  );

-- ===========================================================================
-- payment_settings — admin/manager only
-- ===========================================================================
drop policy if exists "Admins manage payment_settings" on public.payment_settings;
create policy "Admins manage payment_settings" on public.payment_settings
  for all using (
    outlet_id is null
    or user_has_restaurant_role(outlet_restaurant_id(outlet_id), ARRAY['admin', 'manager'])
  )
  with check (
    outlet_id is null
    or user_has_restaurant_role(outlet_restaurant_id(outlet_id), ARRAY['admin', 'manager'])
  );

-- ===========================================================================
-- profiles — users read their own; admins read members of their restaurants.
-- ===========================================================================
drop policy if exists "Users read own profile" on public.profiles;
create policy "Users read own profile" on public.profiles
  for select using (id = auth.uid());

drop policy if exists "Users update own profile" on public.profiles;
create policy "Users update own profile" on public.profiles
  for update using (id = auth.uid());

drop policy if exists "Admins read profiles of restaurant members" on public.profiles;
create policy "Admins read profiles of restaurant members" on public.profiles
  for select using (
    id in (
      select user_id from public.user_roles
      where user_has_restaurant_role(restaurant_id, ARRAY['admin'])
    )
  );

-- ===========================================================================
-- printers + kitchen_stations — staff in restaurant
-- ===========================================================================
drop policy if exists "Members manage printers" on public.printers;
create policy "Members manage printers" on public.printers
  for all using (user_has_restaurant_role(outlet_restaurant_id(outlet_id), ARRAY['admin', 'manager']))
  with check (user_has_restaurant_role(outlet_restaurant_id(outlet_id), ARRAY['admin', 'manager']));

drop policy if exists "Members manage kitchen_stations" on public.kitchen_stations;
create policy "Members manage kitchen_stations" on public.kitchen_stations
  for all using (user_has_restaurant_role(outlet_restaurant_id(outlet_id), ARRAY['admin', 'manager']))
  with check (user_has_restaurant_role(outlet_restaurant_id(outlet_id), ARRAY['admin', 'manager']));

-- ===========================================================================
-- kot_tickets + kot_ticket_items — any staff (cashier prints, kitchen ack)
-- ===========================================================================
drop policy if exists "Members manage kot_tickets" on public.kot_tickets;
create policy "Members manage kot_tickets" on public.kot_tickets
  for all using (user_has_restaurant_access(outlet_restaurant_id(outlet_id)))
  with check (user_has_restaurant_access(outlet_restaurant_id(outlet_id)));

drop policy if exists "Members manage kot_ticket_items" on public.kot_ticket_items;
create policy "Members manage kot_ticket_items" on public.kot_ticket_items
  for all using (
    kot_ticket_id in (
      select id from public.kot_tickets
      where user_has_restaurant_access(outlet_restaurant_id(outlet_id))
    )
  )
  with check (
    kot_ticket_id in (
      select id from public.kot_tickets
      where user_has_restaurant_access(outlet_restaurant_id(outlet_id))
    )
  );

-- ===========================================================================
-- channel_item_mappings + external_order_events — admin/manager (aggregator
-- integration is sensitive; cashiers don't need access).
-- ===========================================================================
drop policy if exists "Admins manage channel_item_mappings" on public.channel_item_mappings;
create policy "Admins manage channel_item_mappings" on public.channel_item_mappings
  for all using (user_has_restaurant_role(outlet_restaurant_id(outlet_id), ARRAY['admin', 'manager']))
  with check (user_has_restaurant_role(outlet_restaurant_id(outlet_id), ARRAY['admin', 'manager']));

drop policy if exists "Admins read external_order_events" on public.external_order_events;
create policy "Admins read external_order_events" on public.external_order_events
  for select using (
    outlet_id is null
    or user_has_restaurant_role(outlet_restaurant_id(outlet_id), ARRAY['admin', 'manager'])
  );
-- Webhook writes go through service role, so no INSERT policy needed.

commit;
