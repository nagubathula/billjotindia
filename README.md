# Billjot India

Next.js 14 (App Router) + TypeScript + Tailwind + Supabase storefront for the schema in your Supabase project.

## Setup

```powershell
npm install
Copy-Item .env.example .env.local
# edit .env.local with your Supabase project URL + keys
npm run dev
```

Then open http://localhost:3000.

## Environment variables

| Key | Where to find |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API → `anon` public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Same screen, `service_role` key. Server-only — never expose to the browser. |
| `NEXT_PUBLIC_DEFAULT_OUTLET_ID` | Numeric id of the outlet row to use when a client doesn't specify one. After running `0001_multi_outlet_aggregator_ready.sql` this is the id of the seeded `default` outlet — usually `1`. |

## Database migrations

There is no migration runner. SQL files in `supabase/migrations/` are applied **manually**, in numeric order, via the Supabase SQL editor.

1. Open Supabase → SQL editor → New query.
2. Paste the contents of the next unapplied file (start with `0001_multi_outlet_aggregator_ready.sql`).
3. Run it. Each migration is wrapped in a transaction and uses `IF NOT EXISTS` where it can, so it's safe to re-run.
4. After `0001`, look up the seeded outlet id (`select id from outlets where slug = 'default'`) and set `NEXT_PUBLIC_DEFAULT_OUTLET_ID` in `.env.local`.

Keep `lib/types.ts` in sync with every migration — those types are how the app sees the schema.

## Supabase row-level security

The schema you ran does not enable RLS. For the public storefront pages to read from `products`, `categories`, and `promotional_banners`, either:

1. Leave RLS off for those tables (fine for a demo), or
2. Enable RLS and add a `SELECT` policy:

```sql
alter table public.products enable row level security;
create policy "Public can read active products" on public.products
  for select using (status = 'active');
```

Repeat for `categories` and `promotional_banners`. For `orders` / `order_items`, allow inserts from anon if you want guest checkout, or call the route handler with a service-role client.

## Project layout

```
app/
  page.tsx                    # menu (server component, reads from Supabase)
  cart/page.tsx               # client cart, localStorage-backed
  checkout/page.tsx           # POSTs to /api/orders
  orders/[id]/page.tsx        # confirmation
  admin/orders/page.tsx       # recent orders table
  api/orders/route.ts         # insert order + order_items
components/
  CartProvider.tsx            # cart context
  Navbar.tsx, ProductCard.tsx
lib/
  types.ts                    # Database type (matches the SQL schema)
  supabase/{client,server,middleware}.ts
middleware.ts                 # refreshes auth session
```

## Next steps you'll likely want

- Sign-in flow (`@supabase/ssr` makes this easy)
- Guard `/admin/*` by checking `user_roles.role = 'admin'`
- Wire customizations (`customization_groups` / `customization_options`) into the product modal
- Razorpay integration on the checkout step (you already have `razorpay_order_id` in the schema)

## Roadmap (where this is heading)

The goal is a Petpooja-class POS + kiosk for Indian F&B. Phase order:

1. **Foundation (this migration)** — multi-outlet, GST fields, KOT tables, aggregator-ready order schema. No visible UI change.
2. **Counter POS** — fast keyboard billing, modifiers, tender (cash/UPI/card), GST invoice print, day-end Z-report.
3. **KOT / KDS** — thermal printer (ESC/POS) for kitchen tickets; KDS screen for stations.
4. **Inventory + recipes** — raw materials, recipe ingredients, stock deduction on order.
5. **Multi-outlet + captain app** — central menu, consolidated reports, tablet ordering.
6. **Aggregator integrations** — Zomato, Swiggy, Magicpin, ONDC. Each lives under `app/api/webhooks/{channel}/route.ts`, writes to `orders` with `source='zomato'` etc., dedupes on `(outlet_id, source, external_order_id)`, and logs every callback to `external_order_events`. Zomato and Swiggy both require approved POS-partner status — apply early (partners@zomato.com, Swiggy POS team) since onboarding takes weeks.
