# Changelog

## 2026-11-11 — Order handling groundwork for delivery platforms

Nothing here talks to a platform yet. It is the part of a POS integration that doesn't depend on any platform's API: the screens and columns an adapter will read and write.

### New migrations (applied to production 2026-11-12)

| Migration | What it does |
| --- | --- |
| `20261111090000_aggregator_order_handling` | `orders`: `instructions`, `cancel_reason`, `cancel_note`, `cancelled_by`, `cancelled_at`, `cancel_product_ids`. `order_items`: `instructions`. `channel_outlets`: `offline_reason`, `offline_since`. `outlets`: `opening_hours`. Adds `purge_channel_data()`. Additive only. |
| `20261112090000_seed_order_handling_samples` | Sample data for `billjot-demo-cafe` only (see below). Skips itself if the demo outlet or its sample orders are missing, or if it has already run. |

Any other environment needs it before this code runs there: cancelling an order, switching a channel off and saving an outlet all write the new columns. `lib/database.types.ts` was regenerated after the push (which also picked up `public_bestsellers`, missing since `20261104100000`).

### What changed in the app

- **Reject / cancel with a reason.** Cancelling from the order page or the kitchen board now opens a dialog that needs a reason. "Item out of stock" asks which item and can take it off the menu in the same step. The reason shows on the order page.
- **Order bell.** The kitchen board has a sound switch. Every new order chimes once; an order that didn't come from the POS keeps chiming until it is accepted or rejected. Browsers need one tap on the page before they allow sound.
- **Kitchen board stays live when empty.** It used to unmount with no tickets, which also stopped it polling, so the first order of a quiet spell never appeared without a manual reload.
- **Accept step for platform orders.** A pending Zomato/Swiggy ticket shows "Accept order" before "Start cooking". Own orders are unchanged.
- **Instructions.** `POST /api/orders` accepts `instructions` on the order and on each item; they show on the kitchen board, the order page and the receipt. The storefront and POS don't collect them yet.
- **Add-ons on the order page.** Selected options now show under each item there, as they already did on the kitchen board.
- **Admin → Channels.** Link an outlet to its store id per platform, set prep time, and mark it online/offline with a reason. Saved in billjot only until an adapter exists — the page says so.
- **Opening hours** per outlet under Admin → Settings, with split shifts.
- **Customers list** now only counts storefront and kiosk orders. Delivery-platform customers are the platform's and are no longer profiled there; their orders still count in Orders and Reports.

### Sample data for the new features (demo cafe)

On production this explained 10 cancelled sample orders (reason, who, when, out-of-stock product), added a customer note to 37 sample orders and 55 items, set the demo outlet's opening hours, and added a fresh live queue of 7 orders: three new (Zomato, Swiggy, web), one accepted, one preparing, one ready and one just rejected for an out-of-stock item.

The 7 new orders use the earlier seed's markers (`DEMO-…`, `{"sample": true}`, `evt_demo_…`), so the clean-up statements under 2026-11-04 remove them too. The header of the migration has the statements that undo the rest.

### Keeping less platform data

`purge_channel_data(channel, older_than)` strips the customer's name, phone, rider details and the raw payload from a channel's old orders and deletes its old webhook events. It is **not** scheduled automatically because it is irreversible: pick a retention period, then run `scripts/schedule-aggregator-purge.sql` once.

## 2026-11-04 — Aggregator-ready schema and sample data

### New migrations (applied to production)

| Migration | What it does |
| --- | --- |
| `20261104090000_aggregator_channels` | Adds `channel_outlets` (platform store id ↔ outlet, online/busy switch, prep time) and `channel_option_mappings` (platform add-on id ↔ customization option). Adds to `orders`: `gst_paid_by_operator`, `commission_amount`, `platform_discount`, `delivery_charges`, `net_payout`, `customer_phone`, `delivery_partner`. Additive only. |
| `20261104091000_seed_sample_orders` | Sample data for `billjot-demo-cafe` (see below). Runs only if the demo outlet exists and has no sample orders yet. |

### GST on Swiggy / Zomato orders

Under Section 9(5) of the CGST Act, food aggregators pay the 5% GST on restaurant orders placed through them. `/api/orders` now records Swiggy and Zomato orders with zero CGST/SGST and `gst_paid_by_operator = true`, and Reports leaves them out of "GST collected". Confirm the treatment with your accountant.

### Sample data

Seeded into the live database for `billjot-demo-cafe` (estimated row counts after the push):

- **185 orders** over the last 30 days — POS (cash/UPI/card), web, Swiggy and Zomato — priced from the real menu with real add-ons; about 5% cancelled.
- **Today's live queue:** new, accepted, preparing, ready, completed and one cancelled order across all four channels, so the admin overview and kitchen board have something to show.
- **Swiggy/Zomato details:** store mappings (`SWG-DEMO-482137`, `ZOM-DEMO-190725`), item and add-on mappings with ~10% platform pricing, masked customer phones, riders, commission (22% / 20%), net payout, the raw platform payload and 193 webhook events.

All of it is tagged. To remove it:

```sql
delete from public.orders where unique_order_id like 'DEMO-%';
delete from public.external_order_events where external_event_id like 'evt_demo_%';
delete from public.channel_option_mappings where external_option_id like '%-DEMO-%';
delete from public.channel_item_mappings where external_item_id like '%-DEMO-%';
delete from public.channel_outlets where external_store_id like '%-DEMO-%';
```

### Still to do for a live integration

- Webhook routes per platform (`app/api/webhooks/{swiggy,zomato}`) that verify signatures, log to `external_order_events` and translate payloads via the mapping tables.
- Pushing status changes (accept / ready / handover) and menu/stock changes back to each platform, with retries.
- Partner credentials: Swiggy and Zomato need approved POS-partner status, or a middleware such as UrbanPiper.

## 2026-11-03 — UUID repair, demo tenant, overview dashboard, order tracking

Covers `billjotindia` and the `billjotdemocafe` storefront template, which share
the Supabase project `lyudibtywwsvzpqsfmjb`.

### Fixed: the app against the UUID schema

The July `uuid_refactor` migration converted every id to `uuid` and truncated
all data, but the app and two RPCs were never updated:

| Symptom | Cause | Fix |
| --- | --- | --- |
| Every slug-resolved storefront and `/me/orders` failed | `public_restaurant_by_slug` and `get_my_orders` were dropped with `CASCADE` and never recreated | Migration `20261103090000` recreates both with uuid ids |
| Order, receipt and ESC/POS print pages 404'd | `Number(params.id)` turned uuids into `NaN` | Ids are strings; route params are checked with `isUuid()` |
| Menu, brand and user actions wrote `NaN` ids | `Number(formData.get("…_id"))` | Read as strings |
| `/api/orders` fell back to outlet `NaN` | `Number(NEXT_PUBLIC_DEFAULT_OUTLET_ID)` | Used as a string |
| POS tabs failed | `pos_tabs` only existed as an unapplied bigint script | Created in migration `20261103090000` |
| Storefront checkout always said "not accepting orders" | Outlet guard compared a uuid to `-1` | Checks for a missing id instead |

`lib/database.types.ts` is regenerated from the live schema; the stray UTF-16
`types.ts` at the repo root is removed. `supabase/config.toml` now uses
`[local_smtp]` (CLI v3 rejects `[inbucket]`).

### New migrations (applied to production)

| Migration | What it does |
| --- | --- |
| `20261103090000_restore_storefront_rpcs_and_pos_tabs` | Recreates `public_restaurant_by_slug(text)` and `get_my_orders(uuid)`; creates `pos_tabs` with staff-only RLS and Realtime |
| `20261103091000_seed_billjot_demo_cafe` | Recreates the `billjot-demo-cafe` tenant: one outlet, 5 categories, 18 dishes, coffee/pizza modifier groups. Only runs if the slug is missing. No auth users. |
| `20261103092000_get_my_order_tracking` | `get_my_order(uuid)`: one order with items, modifiers, GST split and outlet contact, for the customer who placed it |

### New: admin overview — `/r/[slug]/admin`

The admin home used to 404. It now shows:

- Sales, orders and average order value today, each compared with **the same time yesterday**.
- The live queue: counts per status (New / Accepted / Preparing / Ready), with the oldest open orders first and links to each.
- Today's top five sellers by quantity, with revenue.
- Menu health: live vs hidden/sold-out items.

It's linked from the sidebar ("Overview"), the mobile header and the restaurant dashboard.

### New in the demo cafe storefront

- **Menu redesign** — gradient hero with tap-to-call; instant search across names and descriptions; a "Veg only" switch; sticky category chips with counts that follow the section on screen; horizontal dish cards with an image or emoji tile.
- **Live order tracking** — `/orders/[id]`: a Placed → Accepted → Preparing → Ready → Collected stepper, items with modifiers, GST and total, call-the-cafe button. Polls every 8 s until the order completes or is cancelled. Linked from checkout success and from each order in `/account`.

### Still to do

- **Update `SUPABASE_SERVICE_ROLE_KEY`** in `billjotindia/.env.local` and in production. The old key was rotated and is now rejected (`401 Unregistered API key`), so server actions and `/api/orders` fail until the new key is set.
- Demo staff logins: run `node --env-file=.env.local scripts/create-user.mjs` once the key is set (the seed migration deliberately creates no auth users).
- The demo cafe adds dishes at base price; it doesn't yet show the modifier picker (size, milk, toppings) that the main app's storefront has. Required groups aren't enforced server-side either.
