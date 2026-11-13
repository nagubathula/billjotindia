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
| `NEXT_PUBLIC_DEFAULT_OUTLET_ID` | **UUID** of the outlet to use when a client doesn't specify one (`select id from outlets where slug = 'main'`). All ids are uuids since the `20260719000000_uuid_refactor` migration. |
| `STOREFRONT_ORDER_TOKEN` | Optional shared secret that standalone storefronts (e.g. `billjotdemocafe`) send when forwarding orders. |
| `STOREFRONT_ALLOWED_ORIGINS` | Optional comma-separated list of websites allowed to call the order API from a browser. |
| `CHANNEL_ORDER_TOKEN` | Optional secret for delivery-platform adapters. It is the only way to store an order at prices the server didn't compute; while unset, platform orders are refused. |

## Database migrations

Migrations live in `supabase/migrations/` and are applied with the Supabase CLI (v3+) against the linked project (`lyudibtywwsvzpqsfmjb`):

```bash
supabase migration list --remote        # what's applied vs. local
supabase db push --remote --dry-run     # preview
supabase db push --remote               # apply new migrations
```

After any schema change, regenerate the types the app compiles against:

```bash
supabase gen types typescript --remote --schema public > lib/database.types.ts
```

> On Windows, run that from Git Bash (or `| Out-File -Encoding utf8` in PowerShell) — a plain PowerShell `>` writes UTF-16, which is how a broken `types.ts` once ended up in the repo.

`lib/types.ts` derives every row type from `lib/database.types.ts` and adds the narrowed unions (`OrderStatus`, `OrderSource`, …) on top. Ids are **uuid strings** everywhere — validate route params with `isUuid()` from `lib/utils.ts`, never `Number()`.

See [`docs/CHANGELOG.md`](docs/CHANGELOG.md) for what each recent migration does.

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
  checkout/page.tsx           # sends the order to the order API
  orders/[id]/page.tsx        # confirmation
  admin/orders/page.tsx       # recent orders table
  api/orders/route.ts         # insert order + order_items
components/
  CartProvider.tsx            # cart context
  Navbar.tsx, ProductCard.tsx
lib/
  types.ts                    # Database type (matches the SQL schema)
  supabase/{client,server,middleware}.ts
proxy.ts                      # refreshes auth session (Next 16's renamed middleware)
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
6. **Aggregator integrations** — Zomato, Swiggy, Magicpin, ONDC. Each has its own webhook handler, writes to `orders` with `source='zomato'` etc., dedupes on `(outlet_id, source, external_order_id)`, and logs every callback to `external_order_events`. Zomato and Swiggy both require approved POS-partner status — apply early (partners@zomato.com, Swiggy POS team) since onboarding takes weeks.
