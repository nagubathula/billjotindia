# Changelog

---

## 2026-11-21 (Part 2) — Station KOT Routing, Silent Printing, CA GSTR-1/Tally Pack, POS Offline Mode & Phone Loyalty

### Migration (`20261121020000_stations_loyalty_offline_and_ca_pack`)
- Added `categories.station_id` and `printers.kick_cash_drawer`, plus staff `SELECT` RLS on `printers` and `kitchen_stations`.
- Added `orders.offline_id`, `orders.offline_synced_at`, `orders.loyalty_points_redeemed`, `orders.loyalty_discount_amount`, and `orders.loyalty_points_earned` (with unique index `(outlet_id, offline_id)` for idempotent offline sync).
- Added `public.loyalty_settings`, `public.loyalty_wallets`, and `public.loyalty_transactions` with idempotent order credit/redeem deduplication indexes and role-scoped RLS.

### What changed
- **Multi-Station KOT Routing & Silent WebUSB / LAN Thermal Printing (`lib/escpos.ts`, `lib/kot-routing.ts`, `lib/pos-printer-client.ts`):** Added Printers & Kitchen Stations setup in `/r/[slug]/admin/settings`, station assignment (`station_id`) and `is_kot_required` toggle in `/r/[slug]/admin/menu`, station-routed KOT ticket splitting across POS and online orders, `?mode=kot` browser/ESC-POS KOT slips, 1-tap station filter pills on KDS (`KitchenBoard`), and zero-dialog WebUSB/LAN receipt, KOT, and RJ11 cash drawer kick support (`PosPrinterDialog`).
- **CA Accounting Pack (`/r/[slug]/admin/reports`, `lib/ca-exports.ts`):** Added `This month` / `Last month` filters, Table 4A B2B Invoices, Table 7 B2CS slabs (deduplicated against Corporate B2B invoices), Table 12 HSN/SAC summary (`996331`), Table 13 document series, Sec 9(5) ECO separation, GSTR-1 CSV & Portal JSON exports, and zero-balanced Tally Prime Sales Voucher XML exports.
- **POS Offline Mode (`lib/pos-offline.ts`, `public/sw.js`, `PosOfflineOutboxDialog`):** Added POS navigation shell caching in the service worker, `IndexedDB` catalog snapshots and offline bill outbox, offline 80mm receipt printing, and idempotent auto-sync on reconnect.
- **Phone-Number Loyalty Points & Cashback (`lib/loyalty.ts`):** Added Loyalty Rules, Wallets, and Points Ledger tabs in `/r/[slug]/admin/customers`, 10-digit phone lookup & 1-tap point redemption in POS, and earn previews at Checkout (excluding WhatsApp integrations).
- **Seed & Tests:** Added `scripts/seed-petpooja-wave.mjs` and `tests/stations-loyalty-ca-offline.test.ts`.

---

## 2026-11-21 — DB Inventory & Recipe BOM, Register Shifts, POS Split-Bills & Repo Polish

### Migration (`20261121010000_inventory_shifts_and_split_payments`)
- Added `public.inventory_materials`, `public.product_recipes`, and `public.inventory_stock_movements` (with idempotent PO GRN and order consumption deduplication indexes).
- Added `public.register_shifts` (unique per `(outlet_id, shift_date)`) for opening floats, note denominations, variance notes, and Z-close audit tracking.
- Added `orders.payment_mode` (backfilled from legacy POS email conventions) and `public.order_payments` for multi-tender settlement tracking.

### What changed
- **DB-Backed Inventory & Recipe BOM (`/r/[slug]/admin/inventory`):** Replaced in-memory materials with live Postgres SKUs, low-stock par alerts, Stock Movement Ledger, Recipe BOM margin editor (`lib/inventory.ts`), automated Vendor PO GRN restocking (weighted average cost), and automated BOM stock deduction on order settlement/completion.
- **Persisted Register Shifts (`/r/[slug]/admin/register`):** Real opening float persistence, audited Z-Close confirmation (requiring variance explanation when |variance| ≥ ₹50), shift reopen support, split-tender register bucketing (`lib/register.ts`), and Shift Audit Log CSV export.
- **POS Multi-Tender Split Payments & Split-by-Item (`/r/[slug]/pos`):** Cash + UPI + Card split settlements (`settlePosSplitPaymentAction`), item-level bill splitting across new/existing tabs (`splitTabItemsAction`), table merging (`moveTabAction`), and split tender display on thermal/ESC-POS receipts & Reports.
- **Repo Hygiene & Docs:** Updated `supabase/config.toml` auth flags, refreshed `README.md` and `docs/`, resolved all 15 remaining ESLint warnings (0 errors, 0 warnings), and added `scripts/seed-inventory-and-shifts.mjs` + `tests/inventory-shifts-and-splits.test.ts`.

---

## 2026-11-20 — Table Bookings & Live Walk-in Waitlist

### Migration (`20261120010000_table_bookings_and_waitlist`)
- Added `public.table_bookings` (reservations, waitlist queue numbers, quoted wait ETAs, deposit tracking, RLS, and indexes).
- Added 7 per-outlet booking/deposit configuration columns on `outlets` (`bookings_enabled`, `booking_slot_minutes`, `booking_turn_minutes`, `booking_max_party_size`, `booking_advance_days`, `booking_deposit_per_guest`, `booking_deposit_min_party`).
- Expanded external integration permissions with booking read/write scopes.

### What changed
- **Admin Bookings Workbench (`/r/[slug]/admin/bookings`):** Dedicated Reservations timeline, Live Waitlist queue with 1-tap WhatsApp alerts, and per-outlet Policy & Cover Deposit settings (`lib/bookings.ts`).
- **Floor Board & POS Host Desk:** Added upcoming `Reserved` badges and reservation inspector on `/r/[slug]/admin/tables`, plus a POS Host Desk modal (`PosHostDeskDialog`) in `/r/[slug]/pos` with 1-tap `Seat & Open Table` applying paid cover deposits onto table bills.
- **Public Storefront Booking Portal (`/r/[slug]/book`):** Outlet slot availability, live walk-in waitlist join, booking code lookup/cancellation, and Razorpay/Stripe refundable cover deposit checkout (`lib/booking-payments.ts`) with webhook confirmation fallback.
- **Seed & Tests:** Added `scripts/seed-bookings.mjs` and `tests/bookings.test.ts`.

---

## 2026-11-19 — Menu Customization v2, Operations Suite, Brand Analytics & PWA

### Migrations
- `20261119010000_staff_hr_and_vendors`: `hr_employees`, `hr_attendance`, `hr_advances`, `hr_payroll_entries`, `vendors`, `vendor_purchase_orders`, `vendor_payments`.
- `20261119020000_tabs_invoices_coupons_expenses`: `coupons`, `customer_tabs`, `customer_tab_transactions`, `corporate_clients`, `corporate_invoices`, `outlet_expenses`.
- `20261119030000_menu_customization_enhancements`: Added `min_selections`, `max_selections`, `free_selections` (`customization_groups`), `veg_status`, `is_default`, `max_qty`, `variant_prices` (`customization_options`), and `is_required_override` (`product_customizations`).

### What changed
- **Customization Engine v2 (`lib/customizations.ts`):** Selection min/max bounds, free pick allowances, option quantities (`×2`/`×3`), variant pricing, Veg/Egg/Non-Veg badges per option, 1-tap option 86ing, cross-outlet group cloning, and shared 0ms `ModifierDialog` with kitchen prep tags + line re-customization.
- **Progressive Web App (PWA):** Added `app/manifest.ts`, raster/vector Emerald icons (`public/icons/*`), POS-safe Service Worker (`public/sw.js`) + `/offline` page, and client install prompt buttons.
- **Staff HR & Vendor Management:** Complete `/admin/hr` payroll workflow and `/admin/vendors` PO/GRN/payment ledger with GSTIN validation and CSV exports.
- **People's Tabs, Corporate GST Invoices, Coupons & Petty Cash:** Added `/admin/accounts` (Khata + B2B CGST/SGST/IGST Tax Invoices with A4 print + petty cash vouchers deducted on Day-End Register) and database-backed Coupons (`/admin/customers`) wired into POS and checkout.
- **Live Brand & Workspace Analytics:** Consolidated financial analytics (`Today / Yesterday / 7d / 30d`) added on `/dashboard` and `/brands/[slug]`.

---

## 2026-11-15 — Captain RBAC, Running Table KOTs, Online Payments & Error Monitoring

### Migrations
- `20261113150000_payment_gateways` — Gateway metadata on `orders`.
- `20261113170000_restaurant_api_keys` & `20261113180000_updated_at_everywhere` — API key management and consistent `updated_at` triggers.
- `20261114090000_captain_role` & `20261114091000_running_table_orders` — Added `captain` role and `pos_tabs.order_id` for multi-KOT running table orders.
- `20261115213000_rbac_api_tables_brands` & `20261115224000_api_webhooks_customers_monitoring` — Added `api_rate_limits`, `orders.table_id` & `voided_items`, `order_items.created_at`, `storefront_customers`, and `server_error_logs`.

### What changed
- **Captain Role & Mobile POS:** Captains can open floor tables and fire KOTs (plus access `/r/[slug]/kitchen`), while settlement, discounts, packing charges, and admin routes are enforced-blocked (`lib/roles.ts`, `lib/pos-auth.ts`).
- **Running Table KOTs:** Multiple KOTs append onto one open order per table with later-KOT highlighting, manager-only item voids, and table transfers (`lib/running-orders.ts`).
- **Next.js 16 & Production Hardening:** Upgraded middleware to `proxy.ts`, migrated form hooks to `useActionState`, and added server 5xx telemetry (`instrumentation.ts`, `lib/monitoring.ts`).

---

## 2026-11-12 — Order API and receipt hardening, India time

*(Earlier releases preserved below)*

- Storefront/POS pricing server verification (`lib/order-pricing.ts`), strict add-on checks, `CHANNEL_ORDER_TOKEN` isolation, staff-gated receipt printing, and outlet timezone awareness (`lib/time.ts`).

---

## 2026-11-11 — Order handling groundwork for delivery platforms

- Migrations `20261111090000_aggregator_order_handling` & `20261112090000_seed_order_handling_samples`: structured cancel reasons, order/item instructions, channel store busy switches, outlet `opening_hours`, and `purge_channel_data()`.

---

## 2026-11-04 & 2026-11-03 — Aggregator channels & UUID repair

- `20261104090000_aggregator_channels` (Section 9(5) GST handling, channel mappings) and `20261103090000`–`20261103092000` (UUID storefront RPCs, `pos_tabs`, `/admin` overview).
