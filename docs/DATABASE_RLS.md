# Database Row Level Security (RLS)

This document details the exact Row Level Security (RLS) policies that govern data access in the Supabase database. These policies are critical for ensuring multi-tenant isolation.

## Core Concepts
All RLS policies rely on three helper functions defined in PostgreSQL:
1. `user_has_restaurant_access(rid bigint)`: Checks if the current authenticated user (`auth.uid()`) has *any* role for the given restaurant in the `user_roles` table.
2. `user_has_restaurant_role(rid bigint, allowed text[])`: Checks if the user has a specific role (e.g., `admin` or `manager`).
3. `outlet_restaurant_id(oid bigint)`: A lookup to map an `outlet_id` back to a `restaurant_id` (since many tables only store `outlet_id`).

---

## Policy Breakdown by Domain

### 1. Restaurant & User Management
- **`restaurants`**: 
  - `SELECT`: Only users with access to the restaurant can view it.
  - `UPDATE`: Only users with the `admin` role can update it.
- **`user_roles`**: 
  - `SELECT`: Users can see their own roles. Admins can see all roles for their restaurant.
  - `INSERT/UPDATE/DELETE`: Only Admins can manage roles for their restaurant.
- **`outlets`**: 
  - `SELECT`: Any member of the restaurant can read outlet details.
  - `UPDATE`: Only Admins and Managers can modify outlet settings.
- **`profiles`**:
  - `SELECT/UPDATE`: Users can read/update their own profile. Admins can read the profiles of anyone in their restaurant.

### 2. Menu (Categories, Products, Customizations)
*Because the menu needs to be visible to anonymous customers on the storefront, these tables have permissive reads for active items.*
- **`SELECT` (Public)**: Anyone (including anonymous users) can read rows where `status = 'active'`.
- **`INSERT/UPDATE/DELETE` (Staff)**: Any authenticated user with access to the parent outlet's restaurant can manage the menu.

### 3. Orders & Kitchen
- **`orders` & `order_items`**: 
  - `SELECT/UPDATE`: Only staff with access to the restaurant can read or update orders. 
  - *Note: Customer-facing inserts from the public storefront (`POST /api/orders`) bypass RLS by using the Supabase Service Role Key on the backend.*
- **`printers` & `kitchen_stations`**:
  - `SELECT/UPDATE`: Only Admins and Managers can configure hardware.
- **`kot_tickets` & `kot_ticket_items`**:
  - `SELECT/UPDATE`: Any staff member (cashier, kitchen) can manage tickets.

### 4. Integrations
- **`payment_settings` & `channel_item_mappings`**: 
  - `SELECT/UPDATE`: Strictly limited to Admins and Managers, as these contain sensitive API keys and third-party mappings.
