-- Sample menu and operating data for the "Manaruchulu" restaurant (Telugu
-- home-style / South Indian), so its overview, orders, kitchen, channels,
-- reports and customers screens have something to show.
--
-- The restaurant itself is NOT created here — it must already exist (it was
-- made from the app). It is found by name; if there is none this does nothing.
-- If several share the name, the one whose slug was shown when this was asked
-- for is used, and failing that it stops rather than guess.
--
-- What it adds to that restaurant's first outlet:
--   • a menu, only if the outlet has no products yet: 5 categories, 24 items
--     and 4 add-on groups (the 15 items of the original starter menu at their
--     original prices, plus a few more)
--   • outlet address, phone, tax ids and opening hours — only where blank
--   • Swiggy and Zomato store mappings, with item and add-on mappings at ~10%
--     platform pricing
--   • ~30 days of orders across POS, web, Swiggy and Zomato, and a live queue
--     for today: completed, ready, preparing, accepted and new orders
--   • customer instructions on some orders and items, and a reason on every
--     cancelled order
--
-- The GSTIN and FSSAI numbers are made up. Replace them before a real invoice
-- is printed.
--
-- Every sample order has unique_order_id 'DEMO-MR-…' and external_payload
-- {"sample": true}. Remove the orders and channel data with:
--   delete from public.orders where unique_order_id like 'DEMO-MR-%';
--   delete from public.external_order_events where external_event_id like 'evt_demo_mr_%';
--   delete from public.channel_option_mappings where external_option_id like '%-DEMO-MR-%';
--   delete from public.channel_item_mappings where external_item_id like '%-DEMO-MR-%';
--   delete from public.channel_outlets where external_store_id in ('SWG-DEMO-615204', 'ZOM-DEMO-275318');
--
-- Skips the orders if sample orders are already present. Safe to re-run.

do $$
declare
  v_restaurant  uuid;
  v_outlet      uuid;
  v_now         timestamptz := now();
  v_today       date := (now() at time zone 'Asia/Kolkata')::date;
  v_mins_today  int;
  v_gap         int;
  d             int;
  k             int;
  n_orders      int;
  v_slot        int;
  v_seq         int := 0;
  v_src         text;
  v_type        text;
  v_status      text;
  v_ext_status  text;
  v_placed      timestamptz;
  v_order       uuid;
  v_ext_id      text;
  v_store       text;
  v_name        text;
  v_email       text;
  v_phone       text;
  v_lines       int;
  v_qty         int;
  v_base        numeric;
  v_unit        numeric;
  v_line        numeric;
  v_total       numeric;
  v_gst         numeric;
  v_pack        numeric;
  v_deliv       numeric;
  v_comm        numeric;
  v_pdisc       numeric;
  v_payout      numeric;
  v_opts        jsonb;
  v_ext_items   jsonb;
  v_payload     jsonb;
  v_rider       jsonb;
  v_ext_item_id text;
  v_agg         boolean;
  v_count       int;
  n_cancel      int;
  n_notes       int;
  n_item_notes  int;
  g_dosa        uuid;
  g_spice       uuid;
  g_meal        uuid;
  g_coffee      uuid;
  p             record;
  r_prod        record;
  r_grp         record;
  r_opt         record;
  web_names   text[] := array['Sravani Reddy','Kiran Kumar','Lakshmi Prasanna','Venkat Rao','Anusha Devi',
                              'Harsha Vardhan','Swathi Naidu','Ravi Teja','Padmaja Rao','Sai Krishna',
                              'Divya Sree','Naveen Chowdary'];
  agg_names   text[] := array['Srinivas','Madhavi','Chaitanya','Bhavana','Praveen','Keerthi','Rajesh',
                              'Sindhu','Mahesh','Lavanya','Imran','Deepthi'];
  rider_names text[] := array['Ramesh K','Suresh M','Imran S','Mahesh P','Anil T','Venkat R'];
  pos_modes   text[] := array['cash','upi','card'];
  today_srcs  text[] := array['zomato','pos','swiggy','web','pos','swiggy','web','zomato',
                              'pos','swiggy','pos','web','zomato','swiggy'];
begin
  -- -------------------------------------------------------------------------
  -- Which restaurant and outlet
  -- -------------------------------------------------------------------------
  -- The one this was asked for: its admin sidebar showed the slug starting
  -- '487a0c64-30ac-4251-93f2-0'. That wins if several share the name.
  select count(*) into v_count
  from public.restaurants
  where lower(name) = 'manaruchulu' and slug like '487a0c64-30ac-4251-93f2-0%';
  if v_count = 1 then
    select id into v_restaurant
    from public.restaurants
    where lower(name) = 'manaruchulu' and slug like '487a0c64-30ac-4251-93f2-0%';
  else
    select count(*) into v_count from public.restaurants where lower(name) = 'manaruchulu';
    if v_count = 0 then
      raise notice 'no restaurant named Manaruchulu, skipping sample data';
      return;
    end if;
    if v_count > 1 then
      raise exception 'found % restaurants named Manaruchulu; not guessing which one to fill', v_count;
    end if;
    select id into v_restaurant from public.restaurants where lower(name) = 'manaruchulu';
  end if;

  select id into v_outlet
  from public.outlets
  where restaurant_id = v_restaurant
  order by (slug = 'main') desc, created_at
  limit 1;
  if v_outlet is null then
    raise notice 'Manaruchulu has no outlet, skipping sample data';
    return;
  end if;

  -- -------------------------------------------------------------------------
  -- Outlet details — only where nothing has been entered
  -- -------------------------------------------------------------------------
  update public.outlets set
    address       = coalesce(address, 'Road No. 2, Banjara Hills'),
    city          = coalesce(city, 'Hyderabad'),
    state         = coalesce(state, 'Telangana'),
    state_code    = coalesce(state_code, '36'),
    pincode       = coalesce(pincode, '500081'),
    phone         = coalesce(phone, '+91 40 4567 1199'),
    gstin         = coalesce(gstin, '36MANAR1234C1Z9'),
    fssai_license = coalesce(fssai_license, '10021045566778'),
    opening_hours = coalesce(opening_hours, '{
      "mon": [{"open": "06:30", "close": "22:30"}],
      "tue": [{"open": "06:30", "close": "22:30"}],
      "wed": [{"open": "06:30", "close": "22:30"}],
      "thu": [{"open": "06:30", "close": "22:30"}],
      "fri": [{"open": "06:30", "close": "22:30"}],
      "sat": [{"open": "06:30", "close": "23:00"}],
      "sun": [{"open": "07:00", "close": "23:00"}]
    }'::jsonb)
  where id = v_outlet;

  -- -------------------------------------------------------------------------
  -- Menu — only into an outlet that has no products
  -- -------------------------------------------------------------------------
  if not exists (select 1 from public.products where outlet_id = v_outlet) then
    insert into public.categories (outlet_id, name, emoji, sort_order, status)
    select v_outlet, c.name, c.emoji, c.sort_order, 'active'
    from (values
      ('Tiffins',   '🥞', 10),
      ('Meals',     '🍛', 20),
      ('Curries',   '🥘', 30),
      ('Sweets',    '🍮', 40),
      ('Beverages', '☕', 50)
    ) as c(name, emoji, sort_order)
    where not exists (
      select 1 from public.categories x where x.outlet_id = v_outlet and x.name = c.name
    );

    insert into public.customization_groups (outlet_id, name, display_name, selection_type, is_required, sort_order, status)
    values (v_outlet, 'dosa-extras', 'Dosa extras', 'multi', false, 1, 'active') returning id into g_dosa;
    insert into public.customization_options (group_id, name, price, sort_order, status) values
      (g_dosa, 'Extra ghee', 20, 1, 'active'),
      (g_dosa, 'Cheese', 30, 2, 'active'),
      (g_dosa, 'Podi (gunpowder)', 15, 3, 'active'),
      (g_dosa, 'Extra chutney', 10, 4, 'active');

    insert into public.customization_groups (outlet_id, name, display_name, selection_type, is_required, sort_order, status)
    values (v_outlet, 'spice-level', 'Spice level', 'single', true, 2, 'active') returning id into g_spice;
    insert into public.customization_options (group_id, name, price, sort_order, status) values
      (g_spice, 'Medium', 0, 1, 'active'),
      (g_spice, 'Mild', 0, 2, 'active'),
      (g_spice, 'Andhra spicy', 0, 3, 'active');

    insert into public.customization_groups (outlet_id, name, display_name, selection_type, is_required, sort_order, status)
    values (v_outlet, 'meal-addons', 'Meal add-ons', 'multi', false, 3, 'active') returning id into g_meal;
    insert into public.customization_options (group_id, name, price, sort_order, status) values
      (g_meal, 'Extra rice', 30, 1, 'active'),
      (g_meal, 'Curd', 25, 2, 'active'),
      (g_meal, 'Ghee', 20, 3, 'active'),
      (g_meal, 'Papad', 15, 4, 'active');

    insert into public.customization_groups (outlet_id, name, display_name, selection_type, is_required, sort_order, status)
    values (v_outlet, 'coffee-size', 'Size', 'single', true, 4, 'active') returning id into g_coffee;
    insert into public.customization_options (group_id, name, price, sort_order, status) values
      (g_coffee, 'Regular', 0, 1, 'active'),
      (g_coffee, 'Large', 20, 2, 'active');

    for p in
      select * from (values
        ('Idli (2 pc)',              'Tiffins',   40,  'Veg',     'Steamed rice cakes with sambar and two chutneys.',                 null),
        ('Medu Vada (2 pc)',         'Tiffins',   50,  'Veg',     'Crisp urad dal fritters, soft inside, with sambar.',               null),
        ('Plain Dosa',               'Tiffins',   70,  'Veg',     'Thin, crisp rice-and-lentil crepe.',                               'dosa'),
        ('Masala Dosa',              'Tiffins',   90,  'Veg',     'Crisp dosa filled with spiced potato masala.',                     'dosa'),
        ('Ghee Karam Dosa',          'Tiffins',   110, 'Veg',     'Dosa smeared with red chilli karam and roasted in ghee.',          'dosa'),
        ('Pesarattu',                'Tiffins',   90,  'Veg',     'Green gram crepe with ginger, onion and green chilli.',            'dosa'),
        ('Upma',                     'Tiffins',   60,  'Veg',     'Semolina cooked with curry leaves, mustard and cashew.',           null),
        ('Poori Kurma (3 pc)',       'Tiffins',   80,  'Veg',     'Puffed pooris with a mild potato-and-pea kurma.',                  null),
        ('Veg Meals',                'Meals',     140, 'Veg',     'Rice, pappu, two curries, sambar, rasam, curd and pickle.',        'meal'),
        ('Special Thali',            'Meals',     220, 'Veg',     'The full spread: meals plus a fry, a sweet, papad and ghee.',      'meal'),
        ('Pulihora',                 'Meals',     90,  'Veg',     'Tamarind rice tempered with peanuts and curry leaves.',            null),
        ('Curd Rice',                'Meals',     80,  'Veg',     'Rice in fresh curd, tempered and served chilled.',                 null),
        ('Gutti Vankaya',            'Curries',   160, 'Veg',     'Baby brinjals stuffed with peanut-sesame masala.',                 'curry'),
        ('Pappu (Dal)',              'Curries',   120, 'Veg',     'Toor dal with tomato, garlic and a ghee tempering.',               'curry'),
        ('Bendakaya Fry',            'Curries',   130, 'Veg',     'Okra stir-fried crisp with peanuts and chilli.',                   'curry'),
        ('Kodi Kura (Chicken)',      'Curries',   220, 'Non-Veg', 'Country-style chicken curry, slow-cooked on the bone.',            'curry'),
        ('Royyala Iguru (Prawn)',    'Curries',   280, 'Non-Veg', 'Prawns cooked dry in onion-tomato masala.',                        'curry'),
        ('Bobbatlu (2 pc)',          'Sweets',    70,  'Veg',     'Flatbread stuffed with jaggery and chana dal, with ghee.',         null),
        ('Pootharekulu (2 pc)',      'Sweets',    90,  'Veg',     'Paper-thin rice sheets layered with jaggery and ghee.',            null),
        ('Double Ka Meetha',         'Sweets',    100, 'Veg',     'Hyderabadi bread pudding with saffron and nuts.',                  null),
        ('Filter Coffee',            'Beverages', 40,  'Veg',     'Fresh decoction with hot frothed milk.',                           'coffee'),
        ('Masala Chai',              'Beverages', 30,  'Veg',     'Strong tea with ginger and cardamom.',                             null),
        ('Buttermilk',               'Beverages', 30,  'Veg',     'Spiced majjiga with ginger and curry leaves.',                     null),
        ('Badam Milk',               'Beverages', 60,  'Veg',     'Warm almond milk with saffron.',                                   null)
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

        if p.mods is not null then
          insert into public.product_customizations (product_id, group_id, sort_order)
          values (v_product,
                  case p.mods when 'dosa' then g_dosa when 'curry' then g_spice
                              when 'meal' then g_meal else g_coffee end,
                  1);
        end if;
      end;
    end loop;
  else
    raise notice 'Manaruchulu already has a menu, leaving it as it is';
  end if;

  -- -------------------------------------------------------------------------
  -- Orders — skipped if this outlet already has sample orders
  -- -------------------------------------------------------------------------
  if exists (select 1 from public.orders where outlet_id = v_outlet and unique_order_id like 'DEMO-MR-%') then
    raise notice 'Manaruchulu sample orders already present, skipping';
    return;
  end if;
  if not exists (select 1 from public.products where outlet_id = v_outlet and status = 'active') then
    raise notice 'Manaruchulu has no active products to build orders from, skipping orders';
    return;
  end if;

  perform setseed(0.37);

  -- Channel stores and menu mappings ------------------------------------------
  insert into public.channel_outlets (outlet_id, channel, external_store_id, is_online, prep_time_minutes, last_synced_at)
  values (v_outlet, 'swiggy', 'SWG-DEMO-615204', true, 12, v_now),
         (v_outlet, 'zomato', 'ZOM-DEMO-275318', true, 15, v_now)
  on conflict do nothing;

  insert into public.channel_item_mappings (outlet_id, channel, external_item_id, product_id, price_override, is_available, last_synced_at)
  select v_outlet, c.channel,
         c.prefix || '-DEMO-MR-ITM-' || (1000 + row_number() over (partition by c.channel order by prod.name)),
         prod.id, ceil(prod.price * 1.10 / 5) * 5, true, v_now
  from public.products prod
  cross join (values ('swiggy', 'SWG'), ('zomato', 'ZOM')) as c(channel, prefix)
  where prod.outlet_id = v_outlet
  on conflict do nothing;

  insert into public.channel_option_mappings (outlet_id, channel, external_option_id, option_id, price_override, is_available, last_synced_at)
  select v_outlet, c.channel,
         c.prefix || '-DEMO-MR-OPT-' || (5000 + row_number() over (partition by c.channel order by cg.sort_order, co.sort_order)),
         co.id,
         case when co.price > 0 then ceil(co.price * 1.10 / 5) * 5 else 0 end,
         true, v_now
  from public.customization_options co
  join public.customization_groups cg on cg.id = co.group_id
  cross join (values ('swiggy', 'SWG'), ('zomato', 'ZOM')) as c(channel, prefix)
  where cg.outlet_id = v_outlet
  on conflict do nothing;

  -- Today's orders are spaced so they all fall after midnight IST where there
  -- is room, so "today" on the overview isn't split across two dates.
  v_mins_today := (extract(epoch from (v_now at time zone 'Asia/Kolkata')::time) / 60)::int;
  v_gap := greatest(2, least(9, (v_mins_today - 3) / array_length(today_srcs, 1)));

  -- 29 days of history (oldest first), then today ------------------------------
  for d in reverse 29..0 loop
    if d = 0 then
      n_orders := array_length(today_srcs, 1);
    else
      n_orders := 4 + floor(random() * 6)::int
        + case when extract(isodow from v_today - d) in (6, 7) then 4 else 0 end;
    end if;
    v_slot := 930 / n_orders;  -- spread across 06:30–22:00 IST

    for k in 1..n_orders loop
      v_seq := v_seq + 1;

      -- When ------------------------------------------------------------------
      if d = 0 then
        v_placed := v_now - make_interval(mins => (n_orders - k) * v_gap + 2);
      else
        v_placed := ((v_today - d)::timestamp + interval '6 hours 30 minutes'
                     + make_interval(mins => ((k - 1) * v_slot + floor(random() * v_slot))::int))
                    at time zone 'Asia/Kolkata';
      end if;

      -- Channel ---------------------------------------------------------------
      if d = 0 then
        v_src := today_srcs[k];
      else
        v_src := case
          when random() < 0.45 then 'pos'
          when random() < 0.35 then 'web'
          when random() < 0.55 then 'swiggy'
          else 'zomato'
        end;
      end if;
      v_agg := v_src in ('swiggy', 'zomato');

      -- Status (today's newest orders are still in the kitchen) ---------------
      if d = 0 then
        v_status := case
          when n_orders - k < 2 then 'pending'
          when n_orders - k < 4 then 'confirmed'
          when n_orders - k < 7 then 'preparing'
          when n_orders - k < 9 then 'ready'
          when k = 3 then 'cancelled'
          else 'completed'
        end;
      else
        v_status := case when random() < 0.05 then 'cancelled' else 'completed' end;
      end if;
      v_ext_status := case v_status
        when 'pending'   then 'placed'
        when 'confirmed' then 'accepted'
        when 'preparing' then 'food_preparing'
        when 'ready'     then 'food_ready'
        when 'completed' then 'delivered'
        else 'cancelled'
      end;

      -- Customer and type -----------------------------------------------------
      v_phone := null;
      v_ext_id := null;
      v_store := null;
      if v_src = 'pos' then
        v_type  := case when random() < 0.65 then 'dine-in' else 'takeaway' end;
        v_name  := case when random() < 0.6 then 'Counter' else 'Table ' || (1 + floor(random() * 10)::int) end;
        v_email := 'pos+' || pos_modes[1 + floor(random() * 3)::int] || '@billjot.local';
      elsif v_src = 'web' then
        v_type  := case when random() < 0.7 then 'takeaway' else 'dine-in' end;
        v_name  := web_names[1 + floor(random() * array_length(web_names, 1))::int];
        v_email := lower(replace(v_name, ' ', '.')) || '@example.com';
      else
        v_type   := 'delivery';
        v_name   := agg_names[1 + floor(random() * array_length(agg_names, 1))::int];
        v_ext_id := case v_src when 'swiggy' then (2207400000 + v_seq * 7)::text
                                             else 'ZM' || (6630000 + v_seq * 13) end;
        v_store  := case v_src when 'swiggy' then 'SWG-DEMO-615204' else 'ZOM-DEMO-275318' end;
        v_email  := 'guest+' || v_src || '-' || lower(v_ext_id) || '@billjot.local';
        v_phone  := '+91 ******' || lpad((floor(random() * 10000))::int::text, 4, '0');
      end if;

      insert into public.orders (
        outlet_id, source, customer_name, customer_email, customer_phone, order_type,
        status, external_status, unique_order_id, external_order_id, token_number,
        daily_order_number, total_amount, placed_at, created_at, updated_at
      ) values (
        v_outlet, v_src, v_name, v_email, v_phone, v_type,
        v_status, case when v_agg then v_ext_status end,
        'DEMO-MR-' || to_char(v_placed at time zone 'Asia/Kolkata', 'YYMMDD') || '-' || lpad(k::text, 3, '0'),
        v_ext_id, k, k, 0, v_placed, v_placed, v_placed
      )
      returning id into v_order;

      -- Items -----------------------------------------------------------------
      v_total := 0;
      v_gst := 0;
      v_ext_items := '[]'::jsonb;
      v_lines := 1 + floor(random() * 3)::int + case when random() < 0.35 then 1 else 0 end;

      for r_prod in
        select id, name, price, gst_rate, hsn_code
        from public.products
        where outlet_id = v_outlet and status = 'active'
        order by random()
        limit v_lines
      loop
        v_qty  := case when random() < 0.65 then 1 else 2 end;
        v_base := case when v_agg then ceil(r_prod.price * 1.10 / 5) * 5 else r_prod.price end;
        v_unit := v_base;
        v_opts := '[]'::jsonb;

        for r_grp in
          select cg.id, cg.display_name, cg.is_required
          from public.product_customizations pc
          join public.customization_groups cg on cg.id = pc.group_id
          where pc.product_id = r_prod.id
          order by pc.sort_order
        loop
          if r_grp.is_required or random() < 0.35 then
            select co.id, co.name,
                   case when v_agg and co.price > 0 then ceil(co.price * 1.10 / 5) * 5 else co.price end as price
              into r_opt
            from public.customization_options co
            where co.group_id = r_grp.id and co.status = 'active'
            order by random()
            limit 1;
            if found then
              v_unit := v_unit + r_opt.price;
              v_opts := v_opts || jsonb_build_object(
                'group_id', r_grp.id, 'group_name', r_grp.display_name,
                'option_id', r_opt.id, 'option_name', r_opt.name, 'price', r_opt.price);
            end if;
          end if;
        end loop;

        v_line  := v_unit * v_qty;
        v_total := v_total + v_line;
        if not v_agg then
          v_gst := v_gst + (v_line - v_line / (1 + coalesce(r_prod.gst_rate, 5) / 100));
        end if;

        v_ext_item_id := null;
        if v_agg then
          select external_item_id into v_ext_item_id
          from public.channel_item_mappings
          where outlet_id = v_outlet and channel = v_src and product_id = r_prod.id;
          v_ext_items := v_ext_items || jsonb_build_object(
            'item_id', v_ext_item_id, 'name', r_prod.name, 'quantity', v_qty, 'price', v_unit);
        end if;

        insert into public.order_items (order_id, product_config, quantity, unit_price, total_price)
        values (
          v_order,
          jsonb_build_object(
            'product_id', r_prod.id, 'name', r_prod.name, 'base_price', v_base,
            'gst_rate', coalesce(r_prod.gst_rate, 5), 'hsn_code', r_prod.hsn_code,
            'selected_options', v_opts)
          || case when v_agg then jsonb_build_object('external_item_id', v_ext_item_id) else '{}'::jsonb end,
          v_qty, v_unit, v_line
        );
      end loop;

      -- Totals, settlement and the aggregator payload ---------------------------
      v_pack := case when v_agg then 15 else 0 end;
      if v_agg then
        v_deliv  := case when v_total >= 299 then 0 else 20 + 5 * floor(random() * 4) end;
        v_pdisc  := case when random() < 0.35 then round(v_total * (0.10 + random() * 0.10)) else 0 end;
        v_comm   := round((v_total + v_pack) * case v_src when 'swiggy' then 0.22 else 0.20 end, 2);
        v_payout := case when v_status = 'cancelled' then 0
                         else round(v_total + v_pack - v_comm - v_comm * 0.18, 2) end;
        v_rider  := case when v_status in ('confirmed', 'preparing', 'ready', 'completed') then
                      jsonb_build_object(
                        'name', rider_names[1 + floor(random() * array_length(rider_names, 1))::int],
                        'phone', '+91 ******' || lpad((floor(random() * 10000))::int::text, 4, '0'),
                        'eta_minutes', 8 + floor(random() * 15)::int)
                    end;
        v_payload := jsonb_build_object(
          'sample', true,
          'channel', v_src,
          'store_id', v_store,
          'order_id', v_ext_id,
          'status', v_ext_status,
          'customer', jsonb_build_object('name', v_name, 'phone', v_phone),
          'items', v_ext_items,
          'charges', jsonb_build_object(
            'packaging', v_pack,
            'delivery_fee', v_deliv,
            'platform_discount', v_pdisc,
            'gst_collected_by_platform', round((v_total + v_pack) * 0.05, 2)),
          'settlement', jsonb_build_object(
            'commission', v_comm,
            'gst_on_commission', round(v_comm * 0.18, 2),
            'net_payout', v_payout),
          'rider', v_rider);

        update public.orders set
          subtotal             = v_total,
          cgst_amount          = 0,
          sgst_amount          = 0,
          gst_paid_by_operator = true,
          takeaway_charges     = v_pack,
          delivery_charges     = v_deliv,
          platform_discount    = v_pdisc,
          commission_amount    = v_comm,
          net_payout           = v_payout,
          delivery_partner     = v_rider,
          total_amount         = v_total + v_pack,
          external_payload     = v_payload,
          updated_at           = v_placed + interval '20 minutes'
        where id = v_order;

        insert into public.external_order_events (outlet_id, order_id, channel, event_type, external_event_id, payload, signature_ok, received_at)
        values (v_outlet, v_order, v_src, 'order.placed', 'evt_demo_mr_' || v_src || '_' || v_ext_id || '_placed', v_payload, true, v_placed);
        if v_rider is not null then
          insert into public.external_order_events (outlet_id, order_id, channel, event_type, external_event_id, payload, signature_ok, received_at)
          values (v_outlet, v_order, v_src, 'rider.assigned', 'evt_demo_mr_' || v_src || '_' || v_ext_id || '_rider',
                  jsonb_build_object('sample', true, 'order_id', v_ext_id, 'rider', v_rider), true, v_placed + interval '4 minutes');
        end if;
        if v_status in ('completed', 'cancelled') then
          insert into public.external_order_events (outlet_id, order_id, channel, event_type, external_event_id, payload, signature_ok, received_at)
          values (v_outlet, v_order, v_src,
                  case v_status when 'completed' then 'order.delivered' else 'order.cancelled' end,
                  'evt_demo_mr_' || v_src || '_' || v_ext_id || '_' || v_status,
                  jsonb_build_object('sample', true, 'order_id', v_ext_id, 'status', v_ext_status),
                  true, v_placed + case v_status when 'completed' then interval '34 minutes' else interval '6 minutes' end);
        end if;
      else
        update public.orders set
          subtotal         = round(v_total - v_gst, 2),
          cgst_amount      = round(v_gst / 2, 2),
          sgst_amount      = round(v_gst / 2, 2),
          takeaway_charges = 0,
          total_amount     = round(v_total, 2),
          external_payload = jsonb_build_object('sample', true),
          updated_at       = v_placed + interval '12 minutes'
        where id = v_order;
      end if;
    end loop;
  end loop;

  -- -------------------------------------------------------------------------
  -- Why each cancelled sample order was cancelled
  -- -------------------------------------------------------------------------
  with c as (
    select o.id, o.placed_at,
           row_number() over (order by o.placed_at) as rn,
           (select (oi.product_config->>'product_id')::uuid
              from public.order_items oi
             where oi.order_id = o.id
             order by oi.id
             limit 1) as first_product
    from public.orders o
    where o.outlet_id = v_outlet
      and o.unique_order_id like 'DEMO-MR-%'
      and o.status = 'cancelled'
  )
  update public.orders o set
    cancel_reason = case c.rn % 5
      when 1 then 'item_out_of_stock'
      when 2 then 'customer_request'
      when 3 then 'kitchen_overloaded'
      when 4 then 'outlet_closed'
      else 'other' end,
    cancelled_by = case when c.rn % 5 = 2 then 'customer' else 'merchant' end,
    cancel_note = case c.rn % 5
      when 2 then 'Customer called to cancel'
      when 4 then 'Came in after last orders'
      when 0 then 'Gas cylinder ran out mid-service'
      end,
    cancel_product_ids = case
      when c.rn % 5 = 1 and c.first_product is not null then array[c.first_product]
      else '{}'::uuid[] end,
    cancelled_at = c.placed_at + interval '6 minutes'
  from c
  where o.id = c.id;
  get diagnostics n_cancel = row_count;

  -- -------------------------------------------------------------------------
  -- Customer instructions on some orders and items
  -- -------------------------------------------------------------------------
  with picked as (
    select o.id, row_number() over (order by o.placed_at desc) as rn
    from public.orders o
    where o.outlet_id = v_outlet
      and o.unique_order_id like 'DEMO-MR-%'
      and o.source <> 'pos'
  )
  update public.orders o set
    instructions = (array[
      'No cutlery please',
      'Pack the sambar and chutney separately',
      'Please don''t ring the bell — call instead',
      'Extra podi and chutney please',
      'Leave it with the security guard',
      'Call when you reach the gate'
    ])[1 + ((p2.rn / 3) % 6)::int]
  from picked p2
  where o.id = p2.id and p2.rn % 3 = 1;
  get diagnostics n_notes = row_count;

  with picked as (
    select oi.id, prod.category,
           row_number() over (order by o.placed_at desc, oi.id) as rn
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    left join public.products prod on prod.id = (oi.product_config->>'product_id')::uuid
    where o.outlet_id = v_outlet
      and o.unique_order_id like 'DEMO-MR-%'
  )
  update public.order_items oi set
    instructions = case
      when p2.category = 'Beverages'
        then (array['Less sugar', 'No sugar', 'Extra hot'])[1 + ((p2.rn / 7) % 3)::int]
      when p2.category = 'Tiffins'
        then (array['Crispy please', 'Extra chutney', 'Less oil'])[1 + ((p2.rn / 7) % 3)::int]
      when p2.category = 'Curries'
        then (array['Extra gravy', 'No coriander', 'Boneless if possible'])[1 + ((p2.rn / 7) % 3)::int]
      when p2.category = 'Sweets'
        then 'Pack separately'
      else (array['Extra rice', 'No papad', 'Less spicy'])[1 + ((p2.rn / 7) % 3)::int]
      end
  from picked p2
  where oi.id = p2.id and p2.rn % 7 = 3;
  get diagnostics n_item_notes = row_count;

  select count(*) into v_count
  from public.orders
  where outlet_id = v_outlet and unique_order_id like 'DEMO-MR-%';
  if v_count < 100 then
    raise exception 'Manaruchulu sample seed created only % orders, expected at least 100', v_count;
  end if;
  raise notice 'Manaruchulu samples: % orders, % cancellations explained, % order notes, % item notes',
    v_count, n_cancel, n_notes, n_item_notes;
end $$;
