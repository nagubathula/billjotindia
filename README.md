# Billjot India

Multi-tenant F&B **POS, Kitchen Display System (KDS), Table Bookings & Waitlist Host Desk, Storefront Ordering, and Back-Office Operations** suite built on **Next.js 16 (App Router + Turbopack)**, **React 19**, **Tailwind CSS v4**, **@base-ui/react / Shadcn UI**, and **Supabase (PostgreSQL + Realtime + Auth)**.

---

## Core Capabilities

- **Multi-Tenant Workspaces & Franchise Brands:** Role-scoped restaurant switcher (`/dashboard`), multi-restaurant brand analytics (`/brands/[slug]`), custom domain routing (`proxy.ts`), and 4-tier RBAC (`admin`, `manager`, `user`/Cashier, `captain`/Waiter).
- **Counter POS & Running Table KOTs (`/r/[slug]/pos`):** Keyboard-fast billing, mobile Captain mode, Customization v2 `ModifierDialog` (`min/max` rules, free allowances, `max_qty`, variant prices, quick kitchen tags), multi-KOT running table orders, item splitting & table merging, manager-audited item voids, Customer Khata tabs, **multi-tender Split Payments (Cash + UPI + Card)**, **POS Offline Mode** (`IndexedDB` catalog + offline bill queue & idempotent sync), **phone-number Loyalty Points & Cashback**, and **silent WebUSB / LAN thermal ESC/POS printing + RJ11 cash drawer kick**.
- **Kitchen Display System & Multi-Station KOT Routing (`/r/[slug]/kitchen` & `/r/[slug]/admin/kitchen`):** Real-time ticket board with **1-tap Kitchen Station filter pills** (`Main Kitchen`, `Tandoor & Grill`, `Beverage & Bar`, `Desserts`), price-free station KOT slips, chime alerts, later-KOT item highlighting, and mandatory cancellation reasons with 1-click out-of-stock menu toggling.
- **Floor Board, Table Bookings & Live Waitlist (`/r/[slug]/admin/tables`, `/r/[slug]/admin/bookings`, `/r/[slug]/book`):** Spatial floor board, QR sheet generator, scheduled table reservations (`opening_hours` + tightest-fit table + unassigned capacity pool), live walk-in queue with ETA tokens, POS Host Desk 1-tap seating with deposit credit, and Razorpay/Stripe refundable cover deposits.
- **DB-Backed Inventory & Recipe BOM (`/r/[slug]/admin/inventory`):** Raw material SKUs, par-level low-stock alerts, dish recipe BOM food-cost & margin computation, Vendor PO GRN auto-restocking (with weighted average cost), and automatic BOM stock deduction when orders complete.
- **Back-Office Operations & CA Accounting Pack:** Staff HR & Monthly Payroll (`/admin/hr`), Vendors, GST POs & Payables (`/admin/vendors`), People's Khata Credit Tabs, Corporate B2B CGST/SGST/IGST Tax Invoices & Petty Cash Vouchers (`/admin/accounts`), **Phone Loyalty Wallets & Promo Coupons** (`/admin/customers`), **Persisted Day-End Cash Drawer & Audited Z-Register Shifts** (`/admin/register`), and **CA Accounting Pack** (`GSTR-1 B2B/B2CS/HSN/Docs CSV & JSON + balanced Tally Prime XML` exports in `/admin/reports`).
- **Progressive Web App (PWA):** Installable web app manifest (`app/manifest.ts`), high-resolution icons (`public/icons/*`), POS-safe Service Worker (`public/sw.js`) with POS navigation shell caching & `/offline` fallback, and install prompts across sign-in, workspace, admin, and POS headers.

---

## Local Setup

```powershell
npm install
Copy-Item .env.example .env.local
# Add Supabase credentials and optional gateway/webhook env vars in .env.local
npm run dev
```

App runs at `http://localhost:3000`.

### Environment Variables

| Key | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase `anon` public key (governed by RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only service role key (never expose to browsers) |
| `NEXT_PUBLIC_DEFAULT_OUTLET_ID` | Optional fallback outlet UUID |
| `STOREFRONT_ALLOWED_ORIGINS` | Optional fallback comma-separated allowed browser origins |
| `CHANNEL_ORDER_TOKEN` / `CHANNEL_BRIDGE_WEBHOOK_URL` | Optional delivery-platform channel bridge configuration |
| `ERROR_ALERT_WEBHOOK_URL` / `SENTRY_DSN` | Optional 5xx server error alert webhook / Sentry DSN |

---

## Database Migrations & Types

Migrations live in `supabase/migrations/` and target the linked Supabase project using CLI v3+:

```bash
npx supabase migration list --remote
npx supabase db push --remote --yes
npx supabase gen types typescript --linked --schema public
```

See [docs/](docs/) for architecture, schema, RLS, server actions, workflows, and release notes (`docs/API.md` explains why external REST specs remain local in git-ignored `private-docs/`).

---

## Quality Checks & Build

```powershell
npx tsc --noEmit
npm run lint
npm test
npm run build
```
