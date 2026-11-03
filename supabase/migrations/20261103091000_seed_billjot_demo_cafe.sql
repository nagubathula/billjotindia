-- Seed the "billjot-demo-cafe" tenant that the billjotdemocafe storefront
-- template points at (NEXT_PUBLIC_RESTAURANT_SLUG=billjot-demo-cafe).
--
-- The UUID refactor truncated every public table, so the demo tenant no longer
-- exists and the template renders a 404. This recreates the restaurant, one
-- outlet, and a sample menu with modifiers — mirroring scripts/seed-demo.mjs,
-- minus the auth users (create those with scripts/create-user.mjs).
--
-- Runs only when the slug is missing, so it never touches a demo menu someone
-- has since edited. Safe to re-run.

do $$
declare
  v_restaurant uuid;
  v_outlet     uuid;
  g_coffee     uuid;
  g_milk       uuid;
  g_pizza      uuid;
  g_toppings   uuid;
  p            record;
begin
  if exists (select 1 from public.restaurants where slug = 'billjot-demo-cafe') then
    raise notice 'billjot-demo-cafe already exists, skipping seed';
    return;
  end if;

  insert into public.restaurants (slug, name, status)
  values ('billjot-demo-cafe', 'Billjot Demo Cafe', 'active')
  returning id into v_restaurant;

  insert into public.outlets (
    restaurant_id, slug, name, address, city, state, state_code, pincode,
    phone, gstin, fssai_license, status
  ) values (
    v_restaurant, 'main', 'Billjot Demo Cafe — MG Road', '12 MG Road, Indiranagar',
    'Bengaluru', 'Karnataka', '29', '560038', '+91 80 1234 5678',
    '29ABCDE1234F1Z5', '12345678901234', 'active'
  )
  returning id into v_outlet;

  insert into public.categories (outlet_id, name, emoji, sort_order, status) values
    (v_outlet, 'Coffee',            '☕', 1, 'active'),
    (v_outlet, 'Tea & Coolers',     '🧋', 2, 'active'),
    (v_outlet, 'All-day Breakfast', '🍳', 3, 'active'),
    (v_outlet, 'Pizza',             '🍕', 4, 'active'),
    (v_outlet, 'Cakes & Desserts',  '🍰', 5, 'active');

  -- Modifier groups ---------------------------------------------------------
  insert into public.customization_groups (outlet_id, name, display_name, selection_type, is_required, sort_order, status)
  values (v_outlet, 'coffee-size', 'Coffee size', 'single', true, 1, 'active') returning id into g_coffee;
  insert into public.customization_options (group_id, name, price, sort_order, status) values
    (g_coffee, 'Regular', 0, 1, 'active'),
    (g_coffee, 'Large', 40, 2, 'active');

  insert into public.customization_groups (outlet_id, name, display_name, selection_type, is_required, sort_order, status)
  values (v_outlet, 'milk', 'Milk', 'single', true, 2, 'active') returning id into g_milk;
  insert into public.customization_options (group_id, name, price, sort_order, status) values
    (g_milk, 'Whole milk', 0, 1, 'active'),
    (g_milk, 'Skimmed milk', 0, 2, 'active'),
    (g_milk, 'Oat milk', 30, 3, 'active'),
    (g_milk, 'Almond milk', 30, 4, 'active');

  insert into public.customization_groups (outlet_id, name, display_name, selection_type, is_required, sort_order, status)
  values (v_outlet, 'pizza-size', 'Pizza size', 'single', true, 3, 'active') returning id into g_pizza;
  insert into public.customization_options (group_id, name, price, sort_order, status) values
    (g_pizza, 'Personal (7")', 0, 1, 'active'),
    (g_pizza, 'Medium (10")', 120, 2, 'active'),
    (g_pizza, 'Large (13")', 250, 3, 'active');

  insert into public.customization_groups (outlet_id, name, display_name, selection_type, is_required, sort_order, status)
  values (v_outlet, 'extra-toppings', 'Extra toppings', 'multi', false, 4, 'active') returning id into g_toppings;
  insert into public.customization_options (group_id, name, price, sort_order, status) values
    (g_toppings, 'Extra cheese', 50, 1, 'active'),
    (g_toppings, 'Mushroom', 40, 2, 'active'),
    (g_toppings, 'Black olives', 40, 3, 'active'),
    (g_toppings, 'Jalapeños', 30, 4, 'active'),
    (g_toppings, 'Grilled chicken', 80, 5, 'active');

  -- Products ----------------------------------------------------------------
  for p in
    select * from (values
      ('Espresso',              'Coffee',            120, 'Veg',     'A short, intense double shot pulled from our house blend.',           'coffee'),
      ('Cappuccino',            'Coffee',            150, 'Veg',     'Espresso with steamed milk and a thick cap of foam.',                 'coffee'),
      ('Caffè Latte',           'Coffee',            160, 'Veg',     'Smooth espresso with lots of silky steamed milk.',                    'coffee'),
      ('Cold Brew',             'Coffee',            180, 'Veg',     'Steeped for 18 hours, served over ice. Low acid, big flavour.',        'coffee'),
      ('Filter Kaapi',          'Coffee',            90,  'Veg',     'South Indian decoction coffee with frothy hot milk.',                 null),
      ('Masala Chai',           'Tea & Coolers',     80,  'Veg',     'Assam tea brewed with ginger, cardamom and fresh milk.',              null),
      ('Iced Lemon Tea',        'Tea & Coolers',     110, 'Veg',     'Black tea shaken with lemon and a hint of mint.',                     null),
      ('Mango Lassi',           'Tea & Coolers',     130, 'Veg',     'Alphonso mango blended with thick yoghurt.',                          null),
      ('Avocado Toast',         'All-day Breakfast', 260, 'Veg',     'Smashed avocado, chilli flakes and lime on sourdough.',               null),
      ('Masala Omelette',       'All-day Breakfast', 180, 'Non-Veg', 'Three eggs with onion, tomato, green chilli and coriander.',          null),
      ('Paneer Bhurji Sandwich','All-day Breakfast', 200, 'Veg',     'Spiced scrambled paneer in toasted multigrain bread.',                null),
      ('Margherita Pizza',      'Pizza',             250, 'Veg',     'San Marzano tomato, fresh mozzarella and basil.',                     'pizza'),
      ('Farmhouse Pizza',       'Pizza',             320, 'Veg',     'Bell peppers, onion, mushroom and sweet corn.',                       'pizza'),
      ('Paneer Tikka Pizza',    'Pizza',             340, 'Veg',     'Tandoori paneer, onion and mint mayo drizzle.',                       'pizza'),
      ('Pepperoni Pizza',       'Pizza',             360, 'Non-Veg', 'Loaded with spicy pepperoni and mozzarella.',                         'pizza'),
      ('Chocolate Truffle Slice','Cakes & Desserts', 140, 'Veg',     'Dark chocolate sponge layered with ganache.',                         null),
      ('Red Velvet Slice',      'Cakes & Desserts',  150, 'Veg',     'Cocoa sponge with cream cheese frosting.',                            null),
      ('New York Cheesecake',   'Cakes & Desserts',  180, 'Veg',     'Baked, dense and creamy with a biscuit base.',                        null)
    ) as t(name, category, price, veg, description, mods)
  loop
    declare
      v_product uuid;
    begin
      insert into public.products (
        outlet_id, name, category, price, gst_rate, hsn_code, veg_status,
        description, status, is_kot_required, has_addons
      ) values (
        v_outlet, p.name, p.category, p.price, 5, '996331', p.veg,
        p.description, 'active', true, p.mods is not null
      )
      returning id into v_product;

      if p.mods = 'coffee' then
        insert into public.product_customizations (product_id, group_id, sort_order) values
          (v_product, g_coffee, 1), (v_product, g_milk, 2);
      elsif p.mods = 'pizza' then
        insert into public.product_customizations (product_id, group_id, sort_order) values
          (v_product, g_pizza, 1), (v_product, g_toppings, 2);
      end if;
    end;
  end loop;
end $$;
