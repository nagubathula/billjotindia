# Changelog

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
