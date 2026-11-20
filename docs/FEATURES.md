# Billjot India — Platform Features

Billjot India is a multi-tenant restaurant POS, Kitchen Display System (KDS), online storefront, table booking & waitlist host desk, and back-office operations suite built on Next.js App Router and Supabase.

---

## 1. Multi-Tenant Workspaces, Brands & Analytics

- **Workspaces (`/dashboard`):** Staff and owners see all restaurants they belong to, their effective RBAC role (`admin`, `manager`, `user`/Cashier, `captain`), and live consolidated **Portfolio Analytics** (`Today`, `Yesterday`, `7d`, `30d`) with revenue trends, restaurant share breakdowns, Khata/Corporate receivables, vendor payables, staff payroll, and petty cash summaries.
- **Franchise Brands (`/brands/new`, `/brands/[slug]`):** Group multiple restaurant concepts under one brand entity with consolidated brand-wide reporting accessible to brand owners and member restaurant admins.
- **Custom Domains:** Map custom domains to `/r/[slug]` storefronts transparently via `proxy.ts` and database domain lookups.

---

## 2. Role-Based Access Control (RBAC)

Roles are enforced on the UI, Server Actions, and Supabase RLS (`lib/roles.ts`, `lib/auth.ts`, `lib/pos-auth.ts`):

| Role | Label | Access |
| --- | --- | --- |
| `admin` | Admin | Full workspace, brand, settings, billing, user roles, API keys, HR, vendors, accounts, POS & KDS |
| `manager` | Manager | Outlet operations, menu, tables, bookings, voiding sent KOT items, HR, vendors, accounts, reports, POS & KDS |
| `user` | Cashier | Counter POS billing, settlements, refunds/discounts, table moves, Khata charging, and POS Kitchen board (`/r/[slug]/kitchen`) |
| `captain` | Captain (Waiter) | Mobile-optimized floor POS for taking table orders & sending KOTs plus POS Kitchen board; blocked from taking payments, discounts, walk-in tabs, or admin pages |

---

## 3. Menu Builder & Customization Engine v2 (`/r/[slug]/admin/menu`)

- Multi-outlet menu authoring for categories, products (HSN code, Veg/Egg/Non-Veg status, inclusive GST rate, KOT flag, item codes), and reusable add-on customization groups.
- **Customization v2 (`lib/customizations.ts`):**
  - Group bounds (`min_selections`, `max_selections`), free pick allowances (`free_selections`), and per-product required overrides (`is_required_override`).
  - Option-level Veg/Egg/Non-Veg indicators, pre-selected defaults (`is_default`), multi-unit option quantities (`max_qty` up to `20`, e.g. `×2`/`×3`), variant-dependent pricing (`variant_prices`), 1-tap option 86ing, and cross-outlet group cloning.
  - Shared `ModifierDialog` across storefront and POS with quick kitchen prep tags (`Less Spicy`, `Jain`, `No Onion/Garlic`, etc.) and cart/bill line re-customization.

---

## 4. Counter POS, Running Table KOTs & Printing (`/r/[slug]/pos`)

- **Keyboard-Fast Counter POS:** Category tabs, item search, variant/modifier picker, active coupon chips, packing charges, flat/percentage discounts, and multi-tender settlements (Cash, UPI QR, Card, Razorpay/Stripe online payment links, Customer Khata Tabs).
- **Running Table Orders (KOTs):** Cashiers and Captains send Kitchen Order Tickets per floor table (`pos_tabs.order_id`); subsequent KOTs append new items with timestamps, highlight late additions on the KDS, support manager-audited item voids, table transfers, and unified bill settlement.
- **Thermal & Browser Receipts:** Browser-printable GST receipts (`/r/[slug]/pos/receipt/[id]`) plus an authenticated 80mm ESC/POS byte generator for thermal printers.
- **Day-End Z-Register (`/r/[slug]/admin/register`):** Reconciles cash, UPI, card, online, and Customer Khata sales separately alongside unsettled open tables and deducted petty cash vouchers.

---

## 5. Floor Board, Table Bookings & Live Walk-in Waitlist

- **Tables & Floor (`/r/[slug]/admin/tables`, `/qr-sheet`):** Zone-grouped Spatial Floor board, Matrix, and List views, bulk table creation, capacity presets, open tab monitoring, live `Reserved` badges with upcoming reservation inspector, and printable table QR sheets.
- **Admin Bookings & Host Workbench (`/r/[slug]/admin/bookings`):**
  - **Reservations:** Filterable timeline by date/status, tightest-fit auto-assignment, zone/table assignment, unassigned capacity pool protection, status lifecycle (`pending_payment`, `confirmed`, `notified`, `seated`, `completed`, `cancelled`, `no_show`), and 1-click WhatsApp confirmation/reminder links.
  - **Live Waitlist:** Real-time walk-in queue with sequential daily tokens (`#1, #2, …`), live wait-time ETA estimation, 1-click WhatsApp "table ready" alerts, and host seating.
  - **Policy & Cover Deposits:** Per-outlet booking enable switch, slot intervals (`15`/`30`/`60` min), average dining turn duration, max party size, advance booking horizon, and optional per-guest refundable cover charge rules (`booking_deposit_per_guest`, `booking_deposit_min_party`).
- **POS Host Desk:** Accessible directly inside `/r/[slug]/pos` to view reservations/waitlist, register walk-ins, and 1-tap **Seat & Open Table**, automatically applying any paid cover deposit as a flat deduction on the table's POS bill.
- **Public Customer Booking Widget (`/r/[slug]/book`):** Outlet selector, live time-slot availability built from `opening_hours` and outlet timezone, walk-in waitlist join, booking lookup/self-cancel with code + phone last-4 verification, and Razorpay / Stripe cover deposit checkout (with a 20-minute payment hold).

---

## 6. Kitchen Display System (KDS)

- **Admin KDS (`/r/[slug]/admin/kitchen`) & Staff Kitchen Board (`/r/[slug]/kitchen`):**
  - Live status pipeline (`pending` → `confirmed` → `preparing` → `ready` → `completed`), new-order sound chime alerts, mandatory structured cancellation reasons (`lib/order-cancel.ts`) with instant out-of-stock item toggling, item instructions, and newly appended KOT highlighting.

---

## 7. Public Storefront, Coupons & Customer Accounts

- **Storefront (`/r/[slug]`):** Dish search, Veg-only toggle, category navigation, bestseller highlights, interactive cart (`/r/[slug]/cart`), dynamic UPI QR + Razorpay/Stripe checkout (`/r/[slug]/checkout`), live order tracking (`/r/[slug]/orders/[id]`), and customer order history & 1-click reorder (`/r/[slug]/me/orders`).
- **Coupons (`/r/[slug]/admin/customers`):** Percentage or flat discount codes with optional max discount cap, minimum bill requirement, expiry timestamp, usage limit, and channel targeting (`all`, `storefront`, `pos`, `dine_in`).

---

## 8. Back-Office Operations Suite

- **Staff HR & Payroll (`/r/[slug]/admin/hr`):** Employee directory, shifts, departments, daily/bulk attendance tracking with overtime hours, salary advances, automated monthly payroll computation with bonus/deduction adjustments, payout settlement, and CSV export.
- **Vendor Management & PO/GRN (`/r/[slug]/admin/vendors`):** Supplier registry with GSTIN validation and credit terms (`cod`, `net_7`, `net_15`, `net_30`), itemized GST purchase orders, goods receipt (GRN) with supplier invoice tracking, payment ledger, payable balances, and CSV export.
- **Inventory & Recipe BOM (`/r/[slug]/admin/inventory`):** Kitchen raw material tracking, par-level alerts, and 30-day dish velocity & food-cost margin analysis.
- **People's Tabs (Khata), Corporate B2B GST Invoices & Petty Cash (`/r/[slug]/admin/accounts`):**
  - **People's Tabs / Khata:** Regular customer running credit accounts with credit limits, POS tab charging, settlement entries, WhatsApp payment reminders, and CSV export.
  - **Corporate B2B GST Tax Invoices:** Corporate client registry with GSTIN & state code validation, intra-state CGST+SGST vs inter-state IGST calculation (`SAC 996331`), settled-order import, payment tracking, CSV export, and printable A4 Tax Invoices (`/r/[slug]/admin/accounts/invoices/[invoiceId]/print`).
  - **Petty Cash & Outlet Expenses:** Categorized daily operational vouchers synchronized with the Day-End Z-Register.

---

## 9. Delivery Channels, PWA & Monitoring

- **Delivery Channels (`/r/[slug]/admin/channels`):** Configure platform store IDs, item/option mappings, prep times, busy/offline pause reasons, and retention data scrubbing (`purge_channel_data`).
- **Progressive Web App (PWA):** Installable web app manifest (`app/manifest.ts`), high-resolution icons (`public/icons/*`), POS-safe Service Worker (`public/sw.js`) with `/offline` fallback, and install prompts across sign-in, workspace, admin, and POS views.
- **Error Telemetry (`instrumentation.ts`, `lib/monitoring.ts`):** Captures server 5xx exceptions into `server_error_logs`, emits structured `[BILLJOT_5XX]` logs, and dispatches optional webhook or Sentry alerts.
