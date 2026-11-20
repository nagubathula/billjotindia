# Utilities, Types & Supabase Clients

This document maps the core helpers inside `lib/` and how database clients, types, and business rules are organized.

---

## 1. Supabase Client Strategy (`lib/supabase/`)

Never instantiate raw `@supabase/supabase-js` clients in application components; always use one of the SSR/server helpers:
- **`lib/supabase/server.ts`**: Server Components and Server Actions (uses cookies, subject to RLS).
- **`lib/supabase/client.ts`**: Client Components (`"use client"`, uses browser cookies, subject to RLS).
- **`lib/supabase/middleware.ts`**: Refreshes Supabase Auth sessions inside Next.js 16's `proxy.ts`.
- **`lib/supabase/admin.ts`**: Uses `SUPABASE_SERVICE_ROLE_KEY` exclusively on the server (webhooks, public booking/storefront writes, cross-outlet staff actions after `requireRole()`).

---

## 2. Types, Auth, Time & Multi-Outlet Context

- **`lib/database.types.ts`**: Generated directly from the live Supabase schema (`npx supabase gen types typescript --remote --schema public`). Do not hand-edit.
- **`lib/types.ts`**: Derived row aliases (`Order`, `Outlet`, `TableBooking`, etc.) and narrowed union types (`OrderStatus`, `OrderSource`, `OrderType`, `BookingStatus`, `DepositStatus`).
- **`lib/roles.ts`**: Role precedence and RBAC helpers across `admin`, `manager`, `user` (Cashier), and `captain`.
- **`lib/auth.ts`** & **`lib/pos-auth.ts`**: Current session, `requireRole()`, `resolveDefaultHome()`, `isSafeInternalNext()`, plus POS/billing permission guards.
- **`lib/outlet-context.ts`**: Multi-outlet selector state backed by cookies (`getOutletsForRestaurant`, `getSelectedOutlet`).
- **`lib/time.ts`** & **`lib/opening-hours.ts`**: Outlet-timezone date math (`DEFAULT_TIME_ZONE = "Asia/Kolkata"`, `resolveTimeZone`, `dayKey`, `startOfDay`) and `parseOpeningHours` / `isOutletOpen`.
- **`lib/utils.ts`**: Tailwind class merging (`cn`) and strict UUID validation (`isUuid`).

---

## 3. Domain Engines & Integrations (`lib/`)

- **Menu & Order Pricing:** `lib/customizations.ts` (Customization v2 validator, variant pricing, free-pick waivers, option quantities), `lib/order-pricing.ts` (server-side GST splits, table resolution), `lib/coupons.ts` (discount evaluation & redemption), `lib/running-orders.ts` (POS running KOT helpers), `lib/kitchen.ts`, `lib/order-cancel.ts`.
- **Floor, Bookings & Payments:** `lib/tables.ts` (table name parser `code · zone · seats`), `lib/bookings.ts` (slot generator, tightest-fit table + unassigned pool availability, 20-minute hold window, wait ETA, WhatsApp links), `lib/booking-payments.ts` (cover deposit session finalization), `lib/payments.ts` (Razorpay/Stripe gateway secrets & HMAC verification), `lib/qrcode-svg.ts` (table QR & UPI SVG generator).
- **Back-Office Operations:** `lib/hr.ts` (attendance, salary advances, payroll math), `lib/vendors.ts` (GSTIN checksum, POs, payable balances), `lib/inventory.ts` (weighted average material costs, recipe BOM margins, PO GRN restocking, order stock auto-deduction), `lib/register.ts` (split-tender validation, explicit payment mode resolution, Z-drawer variance reconciliation), `lib/accounts.ts` (Khata balance updates, B2B CGST+SGST vs IGST calculation, INR words converter).
- **Integrations, Webhooks & Security:** `lib/api-keys.ts`, `lib/api-cors.ts`, `lib/rate-limit.ts`, `lib/order-webhooks.ts`, `lib/storefront-customers.ts`, `lib/channels.ts`, `lib/channel-bridge.ts`, `lib/monitoring.ts`.
