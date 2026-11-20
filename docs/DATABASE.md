# Database Schema

This application runs on **Supabase (PostgreSQL)** with **53 public tables**, strict multi-tenant scoping (`restaurant_id` / `outlet_id`), UUID identifiers (`isUuid()`), and Row Level Security (RLS).

---

## 1. Multi-Tenancy, Auth & Workspaces

- **`brands`**: Top-level franchise brand entities (`id`, `owner_user_id`, `slug`, `name`, `status`).
- **`restaurants`**: Tenant concepts optionally linked to a brand (`id`, `brand_id`, `owner_user_id`, `slug`, `name`, `status`, `custom_domain`).
- **`outlets`**: Store locations with tax/contact info, timezone, opening hours (`opening_hours` jsonb parsed by `lib/opening-hours.ts`), and booking policies (`bookings_enabled`, `booking_slot_minutes`, `booking_turn_minutes`, `booking_max_party_size`, `booking_advance_days`, `booking_deposit_per_guest`, `booking_deposit_min_party`).
- **`user_roles`**: Maps `user_id` to `restaurant_id` with `app_role` enum (`admin`, `manager`, `user`, `captain`).
- **`profiles`**: Extended user metadata (`id`, `display_name`, `avatar_url`).

---

## 2. Menu & Customization Engine v2

All menu catalogs are scoped per `outlet_id`:
- **`categories`**, **`category_submenus`**, **`submenu_items`**: Top-level menu sections (with optional default `station_id` for KOT routing) and optional submenu groupings.
- **`products`**: Menu items (`price`, `gst_rate`, `hsn_code`, `veg_status`, `station_id`, `is_kot_required`, `code`, `status`, `has_addons`).
- **`customization_groups`**: Modifier groups (`selection_type`, `is_required`, `min_selections`, `max_selections`, `free_selections`, `sort_order`, `status`).
- **`customization_options`**: Choices (`price`, `veg_status`, `is_default`, `max_qty`, `variant_prices` jsonb, `sort_order`, `status`).
- **`product_customizations`**: Product-to-group join (`product_id`, `group_id`, `sort_order`, `is_required_override`).
- **`promotional_banners`**: Storefront promotional banner metadata.

---

## 3. Orders, POS, KDS & Floor Management

- **`pos_tabs`**: Open dine-in floor tables and walk-in tabs synced over Supabase Realtime (`id`, `outlet_id`, `name`, `lines` jsonb, `order_id` FK to running order).
- **`orders`**: Unified ledger across `pos`, `kiosk`, `web`, and aggregator channels (`unique_order_id`, `offline_id` & `offline_synced_at` for idempotent offline sync, `order_type` in `dine-in | takeaway | delivery`, `table_id`, `customer_account_id`, explicit `payment_mode`, `loyalty_points_redeemed`, `loyalty_discount_amount`, `loyalty_points_earned`, GST breakdown `cgst_amount`/`sgst_amount`/`igst_amount`, `gst_paid_by_operator`, `voided_items` jsonb, `cancel_reason`, `payment_status`, `payment_provider`, `razorpay_order_id`, `stripe_session_id`, `external_order_id`, `external_payload`).
- **`order_payments`**: Multi-tender settlement legs (`order_id`, `payment_mode` in `cash | upi | card | razorpay | stripe | tab | online`, `amount`, `reference_no`).
- **`register_shifts`**: Persisted Day-End Z-Report shifts per `(outlet_id, shift_date)` (`status`, `opening_float`, `expected_cash`, `counted_cash`, `variance`, `denominations` jsonb, tender totals, `variance_note`, `opened_by`, `closed_by`, `closed_at`).
- **`order_items`**: Line snapshots (`product_config` jsonb, `quantity`, `unit_price`, `total_price`, `instructions`, `created_at`).
- **`printers`**, **`kitchen_stations`**, **`kot_tickets`**, **`kot_ticket_items`**: Hardware printer endpoints (`interface`, `paper_width`, `kick_cash_drawer`), active prep stations, and station-routed KOT tickets per round.
- **`table_bookings`**: Scheduled table reservations & walk-in waitlist entries (`booking_code`, `booking_type` in `reservation | waitlist`, `source`, `status` across `pending_payment | pending | confirmed | waitlisted | notified | seated | completed | cancelled | no_show`, `table_id`, `party_size`, `preferred_zone`, `occasion`, `reserved_for`, `duration_minutes`, `quoted_wait_minutes`, `queue_number`, `deposit_amount`, `deposit_status`, `payment_provider`, `payment_reference`).

---

## 4. Payments, Storefront Auth, Webhooks & Security

- **`payment_settings`** & **`payment_sessions`**: Per-outlet gateway settings and temporary payment/checkout session state (for online food orders as well as `table_booking_deposit` sessions).
- **`storefront_customers`**: Per-restaurant customer accounts (`(restaurant_id, lower(email))`, `password_hash`, `phone`).
- **`restaurant_api_keys`**: Hashed API keys (`key_hash`), scopes (`menu:read`, `orders:write`, `bookings:read`, `bookings:write`), `allowed_origins`, and `webhook_url` / `webhook_secret`.
- **`api_rate_limits`**: Backing store for Postgres fixed-window API throttling.
- **`push_subscriptions`** & **`server_error_logs`**: Notification subscriptions and persisted server-side 5xx telemetry.

---

## 5. Back-Office Operations (HR, Vendors, Accounts & Channels)

- **Staff HR:** `hr_employees`, `hr_attendance`, `hr_advances`, `hr_payroll_entries`.
- **Vendors & Purchasing:** `vendors`, `vendor_purchase_orders`, `vendor_payments`.
- **Inventory & Recipe BOM:** `inventory_materials`, `product_recipes`, `inventory_stock_movements` (idempotent GRN restocking and order BOM deductions).
- **Promos, Loyalty, Khata, Corporate B2B & Cash:** `coupons`, `loyalty_settings`, `loyalty_wallets`, `loyalty_transactions` (phone-normalized balances & idempotent earn/redeem ledger), `customer_tabs`, `customer_tab_transactions`, `corporate_clients`, `corporate_invoices`, `outlet_expenses`.
- **Delivery Aggregators:** `channel_outlets`, `channel_item_mappings`, `channel_option_mappings`, `external_order_events`.

---

## 6. Database RPC Functions

- `restaurant_slug_for_domain(host text)` — Resolves white-label domain hostnames to restaurant slugs.
- `public_restaurant_by_slug(p_slug text)` & `public_restaurant_by_id(p_restaurant_id uuid)` — Safe anonymous storefront identity lookups.
- `public_outlets_for_restaurant(p_restaurant_id uuid)` & `public_bestsellers(...)` — Safe anonymous outlet and top-dish lookups.
- `get_my_orders(p_restaurant_id uuid)` & `get_my_order(p_order_id uuid)` — Authenticated customer order history and live tracking scoped to JWT email.
- `consume_rate_limit(p_bucket text, p_window_seconds integer)` — Service-role fixed-window rate-limit incrementer.
- `purge_channel_data(p_channel text, p_older_than interval)` — Service-role PII scrubber for old aggregator orders and webhook logs.
- `user_has_restaurant_role(rid uuid, allowed text[])` & `user_is_brand_restaurant_admin(...)` — RLS access helpers (`user_has_restaurant_access`, `outlet_restaurant_id` are also used across core tables).
