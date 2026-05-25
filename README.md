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
