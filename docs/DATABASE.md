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
- **Fields:** `id`, `unique_order_id`, `outlet_id`, `source` (`web`, `pos`, `aggregator`), `customer_name`, `customer_email`, `customer_phone`, `order_type`, `subtotal`, `cgst_amount`, `sgst_amount`, `takeaway_charges`, `total_amount`, `status`, `payment_status`, `payment_method`

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

---

## 4. Database RPC Functions

Because RLS prevents anonymous users from reading sensitive table data, we use `SECURITY DEFINER` Remote Procedure Calls (RPCs) to expose *only exactly what is needed* to the client.

### `restaurant_slug_for_domain(host text)`
- **Purpose:** Used by the Next.js Middleware. Given a custom domain string (e.g., `order.cafemocha.com`), it securely looks up the corresponding `restaurant.slug` without exposing the whole restaurants table.

### `public_restaurant_by_slug(p_slug text)`
- **Purpose:** Allows the public storefront to fetch basic restaurant details (name, slug) using the URL slug, without leaking owner IDs, GSTINs, or statuses.

### `public_outlets_for_restaurant(p_restaurant_id bigint)`
- **Purpose:** Returns the active outlets for a restaurant so a customer can pick where to order from.

### `get_my_orders(p_restaurant_id bigint)`
- **Purpose:** Securely fetches a customer's past orders. RLS blocks customers from seeing all orders in the system; this function securely filters by the authenticated user's ID/email.
