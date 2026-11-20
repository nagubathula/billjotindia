# Database Row Level Security (RLS)

All tables enforce PostgreSQL Row Level Security using tenant-scoped helper functions (`user_has_restaurant_access(rid)`, `user_has_restaurant_role(rid, allowed)`, `outlet_restaurant_id(oid)`, and `user_is_brand_restaurant_admin`). Public/anonymous or multi-outlet backend routes use the service-role client (`lib/supabase/admin.ts`) strictly after verifying caller credentials/tokens.

---

## 1. Core Tenant, Brand & Role Tables

- **`brands`**: Owners (`owner_user_id = auth.uid()`) and admins of restaurants attached to the brand (`user_is_brand_restaurant_admin`) can view consolidated brand reports.
- **`restaurants`**: Viewable by assigned staff (`user_has_restaurant_access`); updates restricted to `admin`.
- **`outlets`**: Readable by restaurant staff; settings updates (hours, domains, booking policies) restricted to `admin` and `manager`.
- **`user_roles`**: Users see their own assignments; `admin` manages staff roles (`admin`, `manager`, `user`, `captain`). Note: `captain` inherits floor POS/kitchen read policies (`user_has_restaurant_access`) but is excluded from admin/manager-only tables and billing settlement.
- **`profiles`**: Self-read/update plus restaurant admin visibility.

---

## 2. Public Menu & Customizations

- **`categories`, `products`, `customization_groups`, `customization_options`, `product_customizations`, `promotional_banners`**:
  - Anonymous storefront reads allowed for active items where applicable.
  - Writes restricted to `admin` / `manager`.

---

## 3. Orders, Floor Tabs, KDS & Bookings

- **`orders` & `order_items`**: Staff read/update within their restaurant (`user_has_restaurant_access`); storefront/API/webhook inserts run server-side via service-role (`lib/supabase/admin.ts`) after server-side price recalculation.
- **`pos_tabs`**: Staff read within restaurant; tab mutations and `order_id` KOT linkage execute through role-checked server actions (`tab-actions.ts`).
- **`kitchen_stations`, `printers`, `kot_tickets`, `kot_ticket_items`**: Hardware/station setup limited to `admin`/`manager`; all restaurant staff (including `user` and `captain`) can read `kitchen_stations` and manage KOT workflows on KDS.
- **`table_bookings`**: All staff roles (`admin`, `manager`, `user`, `captain`) can manage bookings/waitlist inside their restaurant (`user_has_restaurant_role(..., array['admin', 'manager', 'user', 'captain'])`). Public storefront bookings and deposit callbacks execute via backend service-role handlers with rate limits & phone/code checks.

---

## 4. Operations Suite (HR, Vendors, Accounts & Expenses)

- **HR & Vendors (`hr_employees`, `hr_attendance`, `hr_advances`, `hr_payroll_entries`, `vendors`, `vendor_purchase_orders`, `vendor_payments`)**: Strict `admin` and `manager` access only (`user_has_restaurant_role(restaurant_id, array['admin', 'manager'])`).
- **Coupons & People's Tabs (`coupons`, `customer_tabs`)**: Managed by `admin` and `manager`; readable (`SELECT`) by `user` (Cashier) for POS discount chips and Khata settlement.
- **Khata Ledger, Corporate B2B & Expenses (`customer_tab_transactions`, `corporate_clients`, `corporate_invoices`, `outlet_expenses`)**: Managed by `admin` and `manager`; POS Khata charges verify cashier/manager/admin role via server action before writing service-role ledger entries.

---

## 5. Security, Channels & Service-Role-Only Tables

RLS is enabled with zero direct client policies (backend `service_role` access only) for:
- **`payment_settings` & `payment_sessions`** (also `admin`/`manager` gated where appropriate; gateway secrets never exposed to clients)
- **`restaurant_api_keys`**, **`api_rate_limits`**, **`storefront_customers`**, and **`server_error_logs`**
- **`channel_outlets`, `channel_item_mappings`, `channel_option_mappings`, `external_order_events`** (`admin`/`manager` UI config + service-role webhook/bridge processing)
