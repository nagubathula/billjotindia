-- Sample operating data for the billjot-demo-cafe tenant, so the admin
-- overview, orders, kitchen, reports and customers screens have something to
-- show, and so the aggregator structure can be seen end to end.
--
-- What it creates (deterministic via setseed):
--   • Swiggy and Zomato store mappings for the outlet, plus item and add-on
--     mappings with ~10% aggregator pricing
--   • ~30 days of completed orders (a few cancelled) across POS, web, Swiggy
--     and Zomato, priced from the real menu with real modifiers
--   • today's live queue: completed, ready, preparing, accepted and new orders
--   • for aggregator orders: masked customer phone, rider, commission, net
--     payout, GST flagged as paid by the operator, the raw payload, and the
--     webhook events (order.placed, rider.assigned, order.delivered, ...)
--
-- Every sample order has unique_order_id 'DEMO-…' and external_payload
-- {"sample": true}. Remove it all with:
--   delete from public.orders where unique_order_id like 'DEMO-%';
--   delete from public.external_order_events where external_event_id like 'evt_demo_%';
--   delete from public.channel_option_mappings where external_option_id like '%-DEMO-%';
--   delete from public.channel_item_mappings where external_item_id like '%-DEMO-%';
--   delete from public.channel_outlets where external_store_id like '%-DEMO-%';
--
-- Skips itself if the demo outlet is missing or sample orders already exist.

do $$
declare
  v_outlet      uuid;
  v_now         timestamptz := now();
  v_today       date := (now() at time zone 'Asia/Kolkata')::date;
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
  r_prod        record;
  r_grp         record;
  r_opt         record;
  web_names   text[] := array['Ananya Rao','Rohan Mehta','Priya Nair','Arjun Shetty','Kavya Iyer',
                              'Vikram Reddy','Sneha Kulkarni','Aditya Menon','Meera Pillai',
                              'Karthik Gowda','Divya Sharma','Nikhil Joshi'];
  agg_names   text[] := array['Rahul','Neha','Siddharth','Pooja','Aman','Shruti','Varun','Ishita',
                              'Manoj','Lakshmi','Farhan','Deepa'];
  rider_names text[] := array['Ravi K','Suresh M','Imran S','Mahesh P','Anil T','Venkat R'];
  pos_modes   text[] := array['cash','upi','card'];
  today_srcs  text[] := array['zomato','pos','swiggy','web','pos','swiggy','web','zomato',
                              'pos','swiggy','pos','web','zomato','swiggy'];
begin
  select o.id into v_outlet
  from public.outlets o
  join public.restaurants r on r.id = o.restaurant_id
  where r.slug = 'billjot-demo-cafe' and o.slug = 'main';

  if v_outlet is null then
    raise notice 'billjot-demo-cafe outlet not found, skipping sample data';
    return;
  end if;
  if exists (select 1 from public.orders where outlet_id = v_outlet and unique_order_id like 'DEMO-%') then
    raise notice 'sample orders already present, skipping';
    return;
  end if;

  perform setseed(0.42);

  -- -------------------------------------------------------------------------
  -- Channel stores and menu mappings
  -- -------------------------------------------------------------------------
  insert into public.channel_outlets (outlet_id, channel, external_store_id, is_online, prep_time_minutes, last_synced_at)
  values (v_outlet, 'swiggy', 'SWG-DEMO-482137', true, 15, v_now),
         (v_outlet, 'zomato', 'ZOM-DEMO-190725', true, 18, v_now)
  on conflict do nothing;

  insert into public.channel_item_mappings (outlet_id, channel, external_item_id, product_id, price_override, is_available, last_synced_at)
  select v_outlet, c.channel,
         c.prefix || '-DEMO-ITM-' || (1000 + row_number() over (partition by c.channel order by prod.name)),
         prod.id, ceil(prod.price * 1.10 / 5) * 5, true, v_now
  from public.products prod
  cross join (values ('swiggy', 'SWG'), ('zomato', 'ZOM')) as c(channel, prefix)
  where prod.outlet_id = v_outlet
  on conflict do nothing;

  insert into public.channel_option_mappings (outlet_id, channel, external_option_id, option_id, price_override, is_available, last_synced_at)
  select v_outlet, c.channel,
         c.prefix || '-DEMO-OPT-' || (5000 + row_number() over (partition by c.channel order by cg.sort_order, co.sort_order)),
         co.id,
         case when co.price > 0 then ceil(co.price * 1.10 / 5) * 5 else 0 end,
         true, v_now
  from public.customization_options co
  join public.customization_groups cg on cg.id = co.group_id
  cross join (values ('swiggy', 'SWG'), ('zomato', 'ZOM')) as c(channel, prefix)
  where cg.outlet_id = v_outlet
  on conflict do nothing;

  -- -------------------------------------------------------------------------
  -- Orders: 29 days of history (oldest first), then today
  -- -------------------------------------------------------------------------
  for d in reverse 29..0 loop
    if d = 0 then
      n_orders := array_length(today_srcs, 1);
    else
      n_orders := 3 + floor(random() * 5)::int
        + case when extract(isodow from v_today - d) in (6, 7) then 3 else 0 end;
    end if;
    v_slot := 840 / n_orders;  -- spread across 08:00–22:00 IST

    for k in 1..n_orders loop
      v_seq := v_seq + 1;

      -- When ------------------------------------------------------------------
      if d = 0 then
        v_placed := v_now - make_interval(mins => (n_orders - k) * 9 + 3);
      else
        v_placed := ((v_today - d)::timestamp + interval '8 hours'
                     + make_interval(mins => ((k - 1) * v_slot + floor(random() * v_slot))::int))
                    at time zone 'Asia/Kolkata';
      end if;

      -- Channel ---------------------------------------------------------------
      if d = 0 then
        v_src := today_srcs[k];
      else
        v_src := case
          when random() < 0.42 then 'pos'
          when random() < 0.40 then 'web'
          when random() < 0.60 then 'swiggy'
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
        v_type  := case when random() < 0.6 then 'dine-in' else 'takeaway' end;
        v_name  := case when random() < 0.7 then 'Counter' else 'Table ' || (1 + floor(random() * 12)::int) end;
        v_email := 'pos+' || pos_modes[1 + floor(random() * 3)::int] || '@billjot.local';
      elsif v_src = 'web' then
        v_type  := case when random() < 0.7 then 'takeaway' else 'dine-in' end;
        v_name  := web_names[1 + floor(random() * array_length(web_names, 1))::int];
        v_email := lower(replace(v_name, ' ', '.')) || '@example.com';
      else
        v_type   := 'delivery';
        v_name   := agg_names[1 + floor(random() * array_length(agg_names, 1))::int];
        v_ext_id := case v_src when 'swiggy' then (2108400000 + v_seq * 7)::text
                                             else 'ZM' || (5520000 + v_seq * 13) end;
        v_store  := case v_src when 'swiggy' then 'SWG-DEMO-482137' else 'ZOM-DEMO-190725' end;
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
        'DEMO-' || to_char(v_placed at time zone 'Asia/Kolkata', 'YYMMDD') || '-' || lpad(k::text, 3, '0'),
        v_ext_id, k, k, 0, v_placed, v_placed, v_placed
      )
      returning id into v_order;

      -- Items -----------------------------------------------------------------
      v_total := 0;
      v_gst := 0;
      v_ext_items := '[]'::jsonb;
      v_lines := 1 + floor(random() * 3)::int + case when v_agg and random() < 0.4 then 1 else 0 end;

      for r_prod in
        select id, name, price, gst_rate, hsn_code
        from public.products
        where outlet_id = v_outlet and status = 'active'
        order by random()
        limit v_lines
      loop
        v_qty  := case when random() < 0.75 then 1 else 2 end;
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
          if r_grp.is_required or random() < 0.3 then
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
      v_pack := case when v_agg then 20 else 0 end;
      if v_agg then
        v_deliv  := case when v_total >= 399 then 0 else 25 + 5 * floor(random() * 4) end;
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
        values (v_outlet, v_order, v_src, 'order.placed', 'evt_demo_' || v_src || '_' || v_ext_id || '_placed', v_payload, true, v_placed);
        if v_rider is not null then
          insert into public.external_order_events (outlet_id, order_id, channel, event_type, external_event_id, payload, signature_ok, received_at)
          values (v_outlet, v_order, v_src, 'rider.assigned', 'evt_demo_' || v_src || '_' || v_ext_id || '_rider',
                  jsonb_build_object('sample', true, 'order_id', v_ext_id, 'rider', v_rider), true, v_placed + interval '4 minutes');
        end if;
        if v_status in ('completed', 'cancelled') then
          insert into public.external_order_events (outlet_id, order_id, channel, event_type, external_event_id, payload, signature_ok, received_at)
          values (v_outlet, v_order, v_src,
                  case v_status when 'completed' then 'order.delivered' else 'order.cancelled' end,
                  'evt_demo_' || v_src || '_' || v_ext_id || '_' || v_status,
                  jsonb_build_object('sample', true, 'order_id', v_ext_id, 'status', v_ext_status),
                  true, v_placed + case v_status when 'completed' then interval '38 minutes' else interval '6 minutes' end);
        end if;
      else
        update public.orders set
          subtotal         = round(v_total - v_gst, 2),
          cgst_amount      = round(v_gst / 2, 2),
          sgst_amount      = round(v_gst / 2, 2),
          takeaway_charges = 0,
          total_amount     = round(v_total, 2),
          external_payload = jsonb_build_object('sample', true),
          updated_at       = v_placed + interval '15 minutes'
        where id = v_order;
      end if;
    end loop;
  end loop;

  select count(*) into v_count
  from public.orders
  where outlet_id = v_outlet and unique_order_id like 'DEMO-%';
  if v_count < 80 then
    raise exception 'sample seed created only % orders, expected at least 80', v_count;
  end if;
  raise notice 'seeded % sample orders for billjot-demo-cafe', v_count;
end $$;
