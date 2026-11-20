# Frontend Architecture

This document describes the structure and tooling of the Next.js frontend and how Route Groups isolate the storefront, POS, back-office admin, and auth flows.

## Tooling
- **Framework:** Next.js 16.4.6 (App Router + Turbopack)
- **UI & Styling:** React 19, Tailwind CSS v4, `@base-ui/react` / Shadcn UI primitives (`components/ui/*`), `lucide-react`, `sonner`
- **State & Data:** React Context (`CartProvider`), Server Components & Server Actions (`actions.ts`), URL/cookie outlet context (`lib/outlet-context.ts`)
- **PWA:** `app/manifest.ts`, `public/sw.js`, `app/offline/page.tsx`, `components/PwaProvider.tsx`, `components/PwaInstallButton.tsx`

---

## Route Groups & Surfaces

### 1. Auth (`app/(auth)`)
- `/login` (`app/(auth)/login/page.tsx`) — Email/password sign-in returning to `next` or `resolveDefaultHome()`
- `/signup` (`app/(auth)/signup/page.tsx`) — Account registration + initial restaurant setup
- `/callback` (`app/(auth)/callback/route.ts`) & `/logout` (`app/(auth)/logout/route.ts`) — Supabase Auth session handlers

### 2. Workspace Dashboard & Brands (`app/(storefront)`)
- `/dashboard` (`app/(storefront)/dashboard/page.tsx`) — Multi-restaurant workspace overview with live Portfolio Analytics (`Today`, `Yesterday`, `7d`, `30d`)
- `/brands/new` & `/brands/[slug]` (`app/(storefront)/brands/`) — Franchise brand creation and cross-restaurant financial roll-ups

### 3. Public Customer Storefront (`app/r/[slug]/(customer)`)
Wrapped by a shared storefront navbar (`StorefrontNavbar.tsx`) and Cart Context:
- `/r/[slug]` — Public menu with outlet switcher, category chips, Veg-only filter, bestsellers, search, and `ModifierDialog`
- `/r/[slug]/book` — Table Reservations, Live Walk-in Waitlist, Booking Lookup/Cancel & Online Cover Deposit Checkout
- `/r/[slug]/cart` — Cart review and item re-customization
- `/r/[slug]/checkout` & `/r/[slug]/checkout/stripe-return` — Coupon application, dynamic UPI QR, and Razorpay/Stripe checkout
- `/r/[slug]/orders/[id]` — Live customer order status tracker
- `/r/[slug]/me/orders` — Signed-in customer order history & 1-click reorder

### 4. Point of Sale & Staff Kitchen (`app/(pos)/r/[slug]`)
Requires staff authentication (`checkPosAccess` / `lib/pos-auth.ts`):
- `/r/[slug]/pos` — Billing register, running table KOTs, `PosHostDeskDialog` (reservations/waitlist & 1-tap `Seat & Open Table` with deposit credit), promo coupon chips, Khata charging, and online payment links
- `/r/[slug]/pos/receipt/[id]` — Printable GST thermal/A4 receipt view
- `/r/[slug]/kitchen` — Floor/Cashier/Captain Kitchen Display Board

### 5. Restaurant Back-Office Admin (`app/r/[slug]/admin`)
Guarded by `requireRole(["admin", "manager"])` and `proxy.ts`:
- `/admin` — Sales Overview, live order queue, top sellers, menu health
- `/admin/orders` & `/admin/orders/[id]` — Order pipeline, fulfillment & structured cancellation
- `/admin/kitchen` — Manager Kitchen Display System
- `/admin/menu` — Categories, Dishes & Customization Engine v2 manager + outlet cloning
- `/admin/tables` & `/admin/tables/qr-sheet` — Spatial Floor Board, Matrix & List views with `Reserved` badges + printable QR sheets
- `/admin/bookings` — Host Desk Workbench (`Reservations`, `Live Waitlist`, and `Policy & Deposits` settings)
- `/admin/inventory` — Inventory & Recipe BOM food-cost tracking
- `/admin/vendors` — Vendors, GST Purchase Orders, GRNs & Vendor Payments
- `/admin/hr` — Staff Directory, Daily Attendance, Salary Advances & Monthly Payroll
- `/admin/accounts` & `/admin/accounts/invoices/[invoiceId]/print` — People's Tabs (Khata), Corporate B2B GST Tax Invoices & Petty Cash Expenses
- `/admin/customers` — Customer directory & promo Coupons
- `/admin/register` — Day-End Z-Report, tender breakdown & cash drawer reconciliation
- `/admin/reports` — Sales, GST & item performance reports
- `/admin/channels` — Aggregator channel links, prep time & busy switches
- `/admin/users` — Staff onboarding & RBAC roles (`admin`, `manager`, `user`, `captain`)
- `/admin/api-keys` — API keys, permission scopes, allowed origins & outgoing webhooks
- `/admin/settings` — Outlet configuration, opening hours, custom domain & payment gateways
