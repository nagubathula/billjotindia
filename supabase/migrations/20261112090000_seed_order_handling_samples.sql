-- Sample data for the order-handling features added in
-- 20261111090000_aggregator_order_handling, for the billjot-demo-cafe tenant
-- only. Builds on the sample orders from 20261104091000.
--
-- What it does:
--   • every cancelled sample order gets a reason, who cancelled it, when, a
--     note where one fits, and the out-of-stock product where that's the reason
--   • about a third of the non-POS sample orders get a customer instruction,
--     and about one item in seven gets an item note that suits its category
--   • seven fresh orders placed in the last hour, so the kitchen board has a
--     live queue again: three new (Zomato, Swiggy, web), one accepted, one
--     preparing, one ready, and one just rejected for an out-of-stock item
--   • opening hours for the demo outlet, including two late nights
--
-- The fresh orders follow the earlier seed's conventions (unique_order_id
-- 'DEMO-…', external_payload {"sample": true}, events 'evt_demo_…'), so its
-- clean-up statements remove them too. To undo the rest:
--   update public.orders set instructions = null, cancel_reason = null,
--     cancel_note = null, cancelled_by = null, cancelled_at = null,
--     cancel_product_ids = '{}' where unique_order_id like 'DEMO-%';
--   update public.order_items set instructions = null where order_id in
--     (select id from public.orders where unique_order_id like 'DEMO-%');
--   update public.outlets set opening_hours = null where id = <demo outlet>;
--
-- Skips itself if the demo outlet or its sample orders are missing, or if it
-- has already run.

do $$
declare
  v_outlet      uuid;
  v_now         timestamptz := now();
  k             int;
  v_src         text;
  v_status      text;
  v_ext_status  text;
  v_type        text;
  v_placed      timestamptz;
  v_order       uuid;
  v_ext_id      text;
  v_store       text;
  v_name        text;
  v_email       text;
  v_phone       text;
  v_qty         int;
  v_base        numeric;
  v_unit        numeric;
  v_line        numeric;
  v_total       numeric;
  v_gst         numeric;
  v_pack        numeric;
  v_deliv       numeric;
  v_comm        numeric;
  v_payout      numeric;
  v_opts        jsonb;
  v_ext_items   jsonb;
  v_payload     jsonb;
  v_rider       jsonb;
  v_ext_item_id text;
  v_item_note   text;
  v_first_prod  uuid;
  v_line_no     int;
  v_agg         boolean;
  n_cancel      int;
  n_notes       int;
  n_item_notes  int;
  r_prod        record;
  r_grp         record;
  r_opt         record;

  -- The fresh queue, newest first.
  live_src     text[] := array['zomato',  'swiggy',  'web',     'zomato',    'pos',       'swiggy', 'web'];
  live_status  text[] := array['pending', 'pending', 'pending', 'confirmed', 'preparing', 'ready',  'cancelled'];
  live_mins    int[]  := array[2,         4,         7,         12,          17,          26,       48];
  live_lines   int[]  := array[3,         2,         2,         2,           3,           1,        2];
  live_name    text[] := array['Ishita',  'Farhan',  'Kavya Iyer', 'Manoj',  'Table 4',   'Deepa',  'Rohan Mehta'];
  live_note    text[] := array[
    'No cutlery please. Call when you reach the gate.',
    null,
    'Picking up in 15 minutes — please keep it hot.',
    'Extra tissues please',
    null,
    null,
    null];
  -- Whether the first item on the order carries its own note.
  live_item_note boolean[] := array[true, true, false, false, true, false, false];
begin
  select o.id into v_outlet
  from public.outlets o
  join public.restaurants r on r.id = o.restaurant_id
  where r.slug = 'billjot-demo-cafe' and o.slug = 'main';

  if v_outlet is null then
    raise notice 'billjot-demo-cafe outlet not found, skipping order-handling samples';
    return;
  end if;
  if not exists (select 1 from public.orders where outlet_id = v_outlet and unique_order_id like 'DEMO-%') then
    raise notice 'no sample orders to build on, skipping order-handling samples';
    return;
  end if;
  if exists (
    select 1 from public.orders
    where outlet_id = v_outlet and unique_order_id like 'DEMO-%'
      and (cancel_reason is not null or instructions is not null)
  ) then
    raise notice 'order-handling samples already present, skipping';
    return;
  end if;

  -- -------------------------------------------------------------------------
  -- 1. Why each cancelled sample order was cancelled
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
      and o.unique_order_id like 'DEMO-%'
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
      when 0 then 'Power cut in the kitchen'
      end,
    cancel_product_ids = case
      when c.rn % 5 = 1 and c.first_product is not null then array[c.first_product]
      else '{}'::uuid[] end,
    cancelled_at = c.placed_at + interval '6 minutes'
  from c
  where o.id = c.id;
  get diagnostics n_cancel = row_count;

  -- -------------------------------------------------------------------------
  -- 2. Customer instructions on existing sample orders and items
  -- -------------------------------------------------------------------------
  with picked as (
    select o.id, row_number() over (order by o.placed_at desc) as rn
    from public.orders o
    where o.outlet_id = v_outlet
      and o.unique_order_id like 'DEMO-%'
      and o.source <> 'pos'
  )
  update public.orders o set
    instructions = (array[
      'No cutlery please',
      'Please ring the bell, don''t call',
      'Pack the sauces separately',
      'Extra tissues please',
      'Leave it with the security guard',
      'Birthday order — please pack neatly'
    ])[1 + ((p.rn / 3) % 6)::int]
  from picked p
  where o.id = p.id and p.rn % 3 = 1;
  get diagnostics n_notes = row_count;

  with picked as (
    select oi.id, prod.category,
           row_number() over (order by o.placed_at desc, oi.id) as rn
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    left join public.products prod on prod.id = (oi.product_config->>'product_id')::uuid
    where o.outlet_id = v_outlet
      and o.unique_order_id like 'DEMO-%'
  )
  update public.order_items oi set
    instructions = case
      when p.category in ('Coffee', 'Tea & Coolers')
        then (array['Less sugar', 'Extra hot', 'No sugar'])[1 + ((p.rn / 7) % 3)::int]
      when p.category = 'Pizza'
        then (array['Cut into 8 slices', 'Well done', 'No onion'])[1 + ((p.rn / 7) % 3)::int]
      when p.category = 'Cakes & Desserts'
        then (array['Pack separately', 'Add a candle'])[1 + ((p.rn / 7) % 2)::int]
      else (array['No onion', 'Less spicy'])[1 + ((p.rn / 7) % 2)::int]
      end
  from picked p
  where oi.id = p.id and p.rn % 7 = 3;
  get diagnostics n_item_notes = row_count;

  -- -------------------------------------------------------------------------
  -- 3. A fresh live queue
  -- -------------------------------------------------------------------------
  for k in 1..array_length(live_src, 1) loop
    v_src    := live_src[k];
    v_status := live_status[k];
    v_agg    := v_src in ('swiggy', 'zomato');
    v_placed := v_now - make_interval(mins => live_mins[k]);
    v_name   := live_name[k];
    v_ext_status := case v_status
      when 'pending'   then 'placed'
      when 'confirmed' then 'accepted'
      when 'preparing' then 'food_preparing'
      when 'ready'     then 'food_ready'
      else 'cancelled' end;

    v_phone := null;
    v_ext_id := null;
    v_store := null;
    if v_src = 'pos' then
      v_type  := 'dine-in';
      v_email := 'pos+upi@billjot.local';
    elsif v_src = 'web' then
      v_type  := 'takeaway';
      v_email := lower(replace(v_name, ' ', '.')) || '@example.com';
    else
      v_type   := 'delivery';
      v_ext_id := case v_src when 'swiggy' then (2108900000 + k)::text
                                           else 'ZM' || (5590000 + k) end;
      v_store  := case v_src when 'swiggy' then 'SWG-DEMO-482137' else 'ZOM-DEMO-190725' end;
      v_email  := 'guest+' || v_src || '-' || lower(v_ext_id) || '@billjot.local';
      v_phone  := '+91 ******' || lpad((4100 + k * 137)::text, 4, '0');
    end if;

    insert into public.orders (
      outlet_id, source, customer_name, customer_email, customer_phone, order_type,
      status, external_status, unique_order_id, external_order_id, token_number,
      daily_order_number, total_amount, instructions, placed_at, created_at, updated_at
    ) values (
      v_outlet, v_src, v_name, v_email, v_phone, v_type,
      v_status, case when v_agg then v_ext_status end,
      'DEMO-' || to_char(v_placed at time zone 'Asia/Kolkata', 'YYMMDD') || '-9' || lpad(k::text, 2, '0'),
      v_ext_id, 100 + k, 100 + k, 0, live_note[k], v_placed, v_placed, v_placed
    )
    returning id into v_order;

    -- Items -------------------------------------------------------------------
    v_total := 0;
    v_gst := 0;
    v_ext_items := '[]'::jsonb;
    v_first_prod := null;
    v_line_no := 0;

    for r_prod in
      select id, name, price, gst_rate, hsn_code, category
      from public.products
      where outlet_id = v_outlet and status = 'active'
      order by md5(id::text || k::text)   -- a different, repeatable pick per order
      limit live_lines[k]
    loop
      v_line_no := v_line_no + 1;
      if v_first_prod is null then v_first_prod := r_prod.id; end if;

      v_qty  := case when v_line_no = 1 and k % 2 = 1 then 2 else 1 end;
      v_base := case when v_agg then ceil(r_prod.price * 1.10 / 5) * 5 else r_prod.price end;
      v_unit := v_base;
      v_opts := '[]'::jsonb;

      -- Required groups always; on the first item, the optional ones too.
      for r_grp in
        select cg.id, cg.display_name, cg.is_required
        from public.product_customizations pc
        join public.customization_groups cg on cg.id = pc.group_id
        where pc.product_id = r_prod.id
        order by pc.sort_order
      loop
        if r_grp.is_required or v_line_no = 1 then
          select co.id, co.name,
                 case when v_agg and co.price > 0 then ceil(co.price * 1.10 / 5) * 5 else co.price end as price
            into r_opt
          from public.customization_options co
          where co.group_id = r_grp.id and co.status = 'active'
          order by co.sort_order
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

      v_item_note := null;
      if v_line_no = 1 and live_item_note[k] then
        v_item_note := case
          when r_prod.category in ('Coffee', 'Tea & Coolers') then 'Less sugar'
          when r_prod.category = 'Pizza' then 'Cut into 8 slices'
          when r_prod.category = 'Cakes & Desserts' then 'Pack separately'
          else 'No onion' end;
      end if;

      v_ext_item_id := null;
      if v_agg then
        select external_item_id into v_ext_item_id
        from public.channel_item_mappings
        where outlet_id = v_outlet and channel = v_src and product_id = r_prod.id;
        v_ext_items := v_ext_items || jsonb_build_object(
          'item_id', v_ext_item_id, 'name', r_prod.name, 'quantity', v_qty, 'price', v_unit);
      end if;

      insert into public.order_items (order_id, product_config, quantity, unit_price, total_price, instructions)
      values (
        v_order,
        jsonb_build_object(
          'product_id', r_prod.id, 'name', r_prod.name, 'base_price', v_base,
          'gst_rate', coalesce(r_prod.gst_rate, 5), 'hsn_code', r_prod.hsn_code,
          'selected_options', v_opts)
        || case when v_agg then jsonb_build_object('external_item_id', v_ext_item_id) else '{}'::jsonb end,
        v_qty, v_unit, v_line, v_item_note
      );
    end loop;

    -- Totals, settlement and the aggregator payload -----------------------------
    if v_agg then
      v_pack   := 20;
      v_deliv  := case when v_total >= 399 then 0 else 30 end;
      v_comm   := round((v_total + v_pack) * case v_src when 'swiggy' then 0.22 else 0.20 end, 2);
      v_payout := round(v_total + v_pack - v_comm - v_comm * 0.18, 2);
      v_rider  := case when v_status in ('confirmed', 'preparing', 'ready') then
                    jsonb_build_object(
                      'name', case v_src when 'swiggy' then 'Imran S' else 'Ravi K' end,
                      'phone', '+91 ******' || lpad((7300 + k * 211)::text, 4, '0'),
                      'eta_minutes', 6 + k * 2)
                  end;
      v_payload := jsonb_build_object(
        'sample', true,
        'channel', v_src,
        'store_id', v_store,
        'order_id', v_ext_id,
        'status', v_ext_status,
        'customer', jsonb_build_object('name', v_name, 'phone', v_phone),
        'instructions', live_note[k],
        'items', v_ext_items,
        'charges', jsonb_build_object(
          'packaging', v_pack,
          'delivery_fee', v_deliv,
          'platform_discount', 0,
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
        commission_amount    = v_comm,
        net_payout           = v_payout,
        delivery_partner     = v_rider,
        total_amount         = v_total + v_pack,
        external_payload     = v_payload
      where id = v_order;

      insert into public.external_order_events (outlet_id, order_id, channel, event_type, external_event_id, payload, signature_ok, received_at)
      values (v_outlet, v_order, v_src, 'order.placed', 'evt_demo_' || v_src || '_' || v_ext_id || '_placed', v_payload, true, v_placed);
      if v_rider is not null then
        insert into public.external_order_events (outlet_id, order_id, channel, event_type, external_event_id, payload, signature_ok, received_at)
        values (v_outlet, v_order, v_src, 'rider.assigned', 'evt_demo_' || v_src || '_' || v_ext_id || '_rider',
                jsonb_build_object('sample', true, 'order_id', v_ext_id, 'rider', v_rider), true, v_placed + interval '4 minutes');
      end if;
    else
      update public.orders set
        subtotal         = round(v_total - v_gst, 2),
        cgst_amount      = round(v_gst / 2, 2),
        sgst_amount      = round(v_gst / 2, 2),
        takeaway_charges = 0,
        total_amount     = round(v_total, 2),
        external_payload = jsonb_build_object('sample', true)
      where id = v_order;
    end if;

    -- The one that was just rejected: the first item had run out.
    if v_status = 'cancelled' then
      update public.orders set
        cancel_reason      = 'item_out_of_stock',
        cancelled_by       = 'merchant',
        cancelled_at       = v_placed + interval '3 minutes',
        cancel_product_ids = case when v_first_prod is null then '{}'::uuid[] else array[v_first_prod] end,
        updated_at         = v_placed + interval '3 minutes'
      where id = v_order;
    end if;
  end loop;

  -- -------------------------------------------------------------------------
  -- 4. Opening hours (Fri and Sat run past midnight)
  -- -------------------------------------------------------------------------
  update public.outlets set opening_hours = '{
    "mon": [{"open": "08:00", "close": "23:00"}],
    "tue": [{"open": "08:00", "close": "23:00"}],
    "wed": [{"open": "08:00", "close": "23:00"}],
    "thu": [{"open": "08:00", "close": "23:00"}],
    "fri": [{"open": "08:00", "close": "00:30"}],
    "sat": [{"open": "08:00", "close": "00:30"}],
    "sun": [{"open": "09:00", "close": "22:30"}]
  }'::jsonb
  where id = v_outlet and opening_hours is null;

  raise notice 'order-handling samples: % cancellations explained, % order notes, % item notes, % live orders',
    n_cancel, n_notes, n_item_notes, array_length(live_src, 1);
end $$;
