# Database Schema

This application runs on a **Supabase (PostgreSQL)** database. Access is strictly controlled via Row Level Security (RLS) policies.

## 1. Core Tables

### `brands`
Top-level entity for a company that can own multiple restaurant concepts.
- **Fields:** `id`, `name`, `status`, `created_at`, `updated_at`

### `restaurants`
A specific tenant or restaurant concept. Belongs to a brand.
- **Fields:** `id`, `brand_id`, `owner_user_id`, `slug`, `name`, `status`, `custom_domain`

### `outlets`
Physical store locations belonging to a `restaurant`. Orders, menu items, and POS settings are scoped to this ID.
- **Fields:** `id`, `restaurant_id`, `slug`, `name`, `address`, `city`, `state`, `state_code`, `pincode`, `phone`, `gstin`, `fssai_license`, `status`

### `user_roles`
Maps a Supabase Auth `user_id` to a specific `restaurant_id` with a specific role (`admin`, `manager`, `user`).
- **Fields:** `user_id`, `restaurant_id`, `role`

### `profiles`
Extended user metadata attached to a Supabase Auth user.
- **Fields:** `id` (matches auth.users), `display_name`, `avatar_url`

---

## 2. Menu Tables
*All menu tables are scoped to a specific `outlet_id` to allow per-outlet pricing and availability.*

### `categories`
Top-level menu sections (e.g., "Beverages", "Pizza").
- **Fields:** `id`, `outlet_id`, `name`, `emoji`, `sort_order`, `status`

### `products`
Individual items available for sale.
- **Fields:** `id`, `outlet_id`, `category`, `name`, `price`, `gst_rate`, `hsn_code`, `veg_status`, `is_kot_required`, `status`, `has_addons`

### `customization_groups`
Add-on groups for products (e.g., "Size", "Extra Toppings").
- **Fields:** `id`, `outlet_id`, `name`, `display_name`, `selection_type` (`single`|`multi`), `is_required`, `sort_order`

### `customization_options`
The specific choices inside a group (e.g., "Large" inside "Size").
- **Fields:** `id`, `group_id`, `name`, `price`, `sort_order`

### `product_customizations`
Junction table linking a `product` to a `customization_group`.
- **Fields:** `id`, `product_id`, `group_id`, `sort_order`

---

## 3. Orders & Kitchen

### `orders`
The top-level record of a transaction.
- **Fields:** `id`, `unique_order_id`, `outlet_id`, `source` (`pos`, `kiosk`, `web`, `zomato`, `swiggy`, `magicpin`, `dunzo`, `ondc`, `uber-eats`, `dotpe`, `other`), `customer_name`, `customer_email`, `customer_phone`, `order_type` (`dine-in`, `takeaway`, `delivery`), `subtotal`, `cgst_amount`, `sgst_amount`, `igst_amount`, `discount_amount`, `takeaway_charges` (packaging), `total_amount`, `status`, `token_number`, `placed_at`
- **Aggregator fields:** `external_order_id` (unique per outlet + source, so webhook retries can't duplicate), `external_payload` (raw platform payload), `external_status` (platform-side status), `gst_paid_by_operator`, `commission_amount`, `platform_discount`, `delivery_charges`, `net_payout`, `delivery_partner` (`{name, phone, eta_minutes}`)
- **GST:** Swiggy and Zomato orders have `gst_paid_by_operator = true` and zero CGST/SGST — the platform pays that 5% GST under Section 9(5) of the CGST Act. Reports exclude them from "GST collected".

### `order_items`
Line items for an order.
- **Fields:** `id`, `order_id`, `product_config` (JSON snapshot of product+options), `quantity`, `unit_price`, `total_price`

### `printers` & `kitchen_stations`
Configures kitchen display screens (KDS) or physical printers.
- **Fields (stations):** `id`, `outlet_id`, `name`
- **Fields (printers):** `id`, `outlet_id`, `name`, `ip_address`

### `kot_tickets` & `kot_ticket_items`
Kitchen Order Tickets sent to specific stations when an order is accepted.
- **Fields (ticket):** `id`, `order_id`, `station_id`, `status`
- **Fields (items):** `id`, `ticket_id`, `order_item_id`, `notes`

### Aggregator channels (Swiggy, Zomato, …)
How a platform order maps onto our data. An adapter for each platform only has to translate its payload into these:

| Table | Maps |
| --- | --- |
| `channel_outlets` | The platform's store id → our outlet, with `is_online` (busy switch) and `prep_time_minutes`. Unique per outlet + channel and per channel + store id. |
| `channel_item_mappings` | The platform's item id → our product, with `price_override` (platform price) and `is_available`. |
| `channel_option_mappings` | The platform's add-on/variant id → our `customization_options` row, same shape. |
| `external_order_events` | Every webhook received: `event_type` (`order.placed`, `rider.assigned`, `order.delivered`, `order.cancelled`, …), raw `payload`, `signature_ok`, and `external_event_id` (unique per channel, for de-duplication). |

All are admin/manager-only under RLS; webhook adapters write with the service role.

---

## 4. Database RPC Functions

Because RLS prevents anonymous users from reading sensitive table data, we use `SECURITY DEFINER` Remote Procedure Calls (RPCs) to expose *only exactly what is needed* to the client.

### `restaurant_slug_for_domain(host text)`
- **Purpose:** Used by the Next.js Middleware. Given a custom domain string (e.g., `order.cafemocha.com`), it securely looks up the corresponding `restaurant.slug` without exposing the whole restaurants table.

### `public_restaurant_by_slug(p_slug text)`
- **Purpose:** Allows the public storefront to fetch basic restaurant details (name, slug) using the URL slug, without leaking owner IDs, GSTINs, or statuses.

### `public_restaurant_by_id(p_restaurant_id uuid)`
- **Purpose:** Same public identity fields as the slug lookup, keyed by id.

### `public_outlets_for_restaurant(p_restaurant_id uuid)`
- **Purpose:** Returns the active outlets for a restaurant so a customer can pick where to order from.

### `get_my_orders(p_restaurant_id uuid)` — `authenticated` only
- **Purpose:** The signed-in customer's last 100 orders at this restaurant, matched on the **verified email in their JWT**, with items carrying enough to reorder (`product_id`, `name`, `base_price`, `gst_rate`).

### `get_my_order(p_order_id uuid)` — `authenticated` only
- **Purpose:** One order, with line items, modifiers, GST split and the outlet's name/phone, for the live order-tracking page. Same email match as `get_my_orders`, so a guessed id returns nothing.

### Access helpers used by RLS policies
- `user_has_restaurant_access(rid uuid)`, `user_has_restaurant_role(rid uuid, allowed text[])`, `outlet_restaurant_id(oid uuid)`.

---

## 5. POS

### `pos_tabs`
Open "bar tabs" shared across all POS terminals of an outlet, synced over Supabase Realtime.
- **Fields:** `id`, `outlet_id`, `name`, `lines` (jsonb cart lines), `created_at`, `updated_at`
- **Access:** RLS on, staff of the outlet's restaurant only. The POS tab server actions use the service-role client and gate on `requireRole`.

---

## 6. Identifiers

Every `id` and `*_id` column is a **uuid** since migration `20260719000000_uuid_refactor`. That migration truncated all tables and dropped `public_restaurant_by_slug` / `get_my_orders` without recreating them; `20261103090000_restore_storefront_rpcs_and_pos_tabs` restores both. Don't reuse `scripts/create-pos-tabs.sql` — it predates the uuid change.
