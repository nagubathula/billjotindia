# API Documentation

This document contains the private API specifications for the project. 
These APIs power the core ordering, pricing validation, and receipt generation functionality.

## Base URL
- **Local:** `http://localhost:3000/api`
- **Production:** `https://your-production-url.com/api`

---

## Restaurant API keys

A restaurant's own websites and apps authenticate with an API key. An admin creates keys in **Admin → Administration → API keys**; each key:

- belongs to one restaurant, and can be limited to one of its outlets;
- has one or both permissions: **Read menu** (`menu:read`) and **Place orders** (`orders:write`);
- is shown in full once, when created. Only a SHA-256 hash is stored, so a lost key can't be recovered: revoke it and create a new one;
- stops working the moment it is revoked.

Send the key on every request:

```
Authorization: Bearer bjk_…
```

`x-api-key: bjk_…` is accepted too. Keep keys on the frontend's server; anyone who has a key can use it until it is revoked.

| Status | Meaning |
| --- | --- |
| `401` | No key, an unknown key, or a revoked key |
| `403` | The key is valid but lacks the permission, or doesn't cover that outlet |

Keys live in `restaurant_api_keys` (migration `20261113170000_restaurant_api_keys.sql`).

---

## Read the menu
**Endpoint:** `GET /api/menu`

**Authentication:** an API key with **Read menu**.

**Query:** `outlet_id` (optional). Without it, the key's outlet is used if the key is limited to one, otherwise the restaurant's first active outlet. An outlet the key doesn't cover returns `404`.

Only active categories, products, add-on groups and options are returned. Responses may be cached for 30 seconds.

**Response (200 OK)**
```json
{
  "restaurant": { "id": "uuid", "name": "Billjot Demo Cafe", "slug": "billjot-demo-cafe" },
  "outlets": [
    { "id": "uuid", "name": "MG Road", "address": "…", "city": "Bengaluru", "state": "…", "pincode": "…",
      "phone": "…", "currency": "INR", "timezone": "Asia/Kolkata", "opening_hours": {} }
  ],
  "outlet_id": "uuid",            // the outlet this menu is for; null if the restaurant has none
  "categories": [{ "id": "uuid", "name": "Coffee", "emoji": "☕", "sort_order": 1 }],
  "products": [
    { "id": "uuid", "name": "Caffè Latte", "description": "…", "category": "Coffee", "price": 160,
      "gst_rate": 5, "veg_status": "Veg", "image_url": "https://…", "code": "CL01",
      "modifier_group_ids": ["uuid"] }
  ],
  "modifier_groups": [
    { "id": "uuid", "name": "Size", "selection": "single | multiple", "required": true,
      "options": [{ "id": "uuid", "name": "Large", "price": 40 }] }
  ]
}
```

To order a product, send its `id` as `product_config.product_id` and each chosen option as `{ "group_id", "option_id" }` in `selected_options` (see Create Order). Prices you send are ignored and recalculated.

---

## 1. Create Order
**Endpoint:** `POST /api/orders`

Handles order creation for both first-party callers (POS, Kiosks, Web) and third-party callers (external aggregators or decoupled storefronts).

**Authentication:** 
- A restaurant's own frontends send an API key with **Place orders** (see Restaurant API keys). A key can place `web` and `kiosk` orders only, and only for its restaurant's outlets (or the one outlet it is limited to). Other sources answer `403`. If `outlet_id` is left out, a key limited to one outlet orders from that outlet.
- Standalone external storefronts may instead pass an `x-storefront-token` header matching the `STOREFRONT_ORDER_TOKEN` environment variable. This older shared token isn't tied to a restaurant; prefer API keys.
- Same-origin callers (e.g., POS terminal) do not need this token.
- Delivery-platform adapters must pass an `x-channel-token` header matching the `CHANNEL_ORDER_TOKEN` environment variable. Without it — or while the variable is unset — any order whose `source` is not `web`, `pos` or `kiosk` is rejected with `401`.

**CORS Rules:**
Allowed origins are dictated by the `STOREFRONT_ALLOWED_ORIGINS` environment variable (comma-separated). If unset, the server reflects the caller's origin.

### Request Body
```json
{
  "customer_name": "string",
  "customer_email": "string",
  "order_type": "takeaway | dine-in | delivery",
  "subtotal": 0.0,
  "takeaway_charges": 0.0,
  "total_amount": 0.0,
  "source": "web | pos | kiosk | zomato | swiggy | …", // Defaults to "web". Anything else is a 400
  "outlet_id": "uuid",
  "external_order_id": "string", // Platform orders only: used for deduplication. Ignored on web / pos / kiosk
  "external_payload": {}, // Platform orders only: raw platform payload. Ignored on web / pos / kiosk
  "instructions": "string", // Optional. Cooking / packing note for the whole order (max 500 chars)
  "items": [
    {
      "instructions": "string", // Optional. Note for this item, e.g. "no onion" (max 200 chars)
      "quantity": 1,
      "unit_price": 0.0,
      "total_price": 0.0,
      "product_config": {
        "product_id": 1,
        "name": "Product Name",
        "selected_options": [
          {
            "group_id": 1,
            "group_name": "Size",
            "option_id": 2,
            "option_name": "Large",
            "price": 40.0
          }
        ]
      }
    }
  ]
}
```

### Business Logic & Validation
Which of the two paths an order takes depends on `source` alone. Sending an `external_order_id` does not change it.

1. **First-Party Validation (`source` is `web`, `pos` or `kiosk`):**
   - The server **does not trust** client-supplied prices.
   - It re-fetches products and customization options based on `outlet_id`.
   - It recalculates the `total_amount`, `subtotal`, and GST inclusive taxes based on active catalog prices.
   - Prevents cross-outlet spoofing or price tampering.
   - Add-ons are checked against the product: each option must be active and belong to a group linked to that product, may appear once per line, a pick-one group takes one option, and every required group needs a choice. A line that breaks a rule fails the whole order with a `400` naming the item.
   - Option names, group names and prices are stored from the catalog, not from the request.
2. **Platform Logic (any other `source`, with a valid `x-channel-token`):**
   - The server **trusts** the platform's subtotal and total to avoid mismatches.
   - It dynamically extracts GST out of the line item totals, except for Swiggy and Zomato orders, where the platform pays it.
   - Implements deduplication using `external_order_id` + `source` + `outlet_id`. A repeat delivery returns the first order with `"deduped": true`, including when two deliveries arrive at the same moment.

If the line items cannot be saved, the order row is removed again and the call returns `500`: the kitchen never sees an order with nothing on it.

**Response (200 OK)**
```json
{
  "order": {
    "id": "uuid",
    "unique_order_id": "BJ-1718919011230-K3F", // BJ-<ms timestamp>-<3 random characters>

    "status": "pending",
    // ...other order fields
  },
  "deduped": false // true if external_order_id already existed
}
```

---

## Order status
**Endpoint:** `GET /api/orders/{orderId}`

**Authentication:** an API key with **Place orders**. Orders of other restaurants, or of outlets the key doesn't cover, return `404`.

**Response (200 OK)**
```json
{
  "order": {
    "id": "uuid",
    "unique_order_id": "BJ-1718919011230-K3F",
    "token_number": 105,
    "status": "pending | confirmed | preparing | ready | completed | cancelled",
    "order_type": "takeaway",
    "source": "web",
    "customer_name": "Kavya",
    "subtotal": 571.43,
    "total_amount": 600,
    "placed_at": "2026-11-13T07:12:00Z",
    "updated_at": "2026-11-13T07:20:00Z",
    "outlet_id": "uuid",
    "items": [
      { "product_id": "uuid", "name": "Masala Dosa", "quantity": 2, "total_price": 240,
        "options": ["Extra crispy"], "instructions": null }
    ]
  }
}
```

---

## 2. Generate Print Receipt (ESC/POS)
**Endpoint:** `GET /api/print/[orderId]`

Generates a raw ESC/POS byte stream for printing a thermal receipt (80mm width). 

**Authentication:** a signed-in staff member (any role) of the restaurant the order belongs to. The POS opens this in the cashier's browser, which sends the session cookie. A print agent or cloud printer has no session and will need its own credential when one is built.

### Behavior
This endpoint queries the Order, Outlet, and Order Items from Supabase and formats them into raw control codes and text suitable for thermal receipt printers (Epson, Star, etc.).
It does not communicate directly with the printer. It returns the raw bytes.

### Consumers
- **Local Print Agent:** A Node.js daemon running on a local terminal fetching this endpoint and sending bytes over USB/Serial.
- **Web USB / Web Bluetooth:** Browser-based POS systems fetching this byte stream and piping it to a connected device.
- **Cloud Printers:** A cloud service queueing these bytes for pull-based printers.

**Response (200 OK)**
- **Content-Type:** `application/octet-stream`
- **X-Print-Width-Mm:** `80`
- **Body:** Binary Buffer containing ESC/POS commands (`ESC @`, `GS V 0`, etc.) and UTF-8 text.

**Errors:**
- `400 Bad Request`: Invalid `orderId`.
- `401 Unauthorized`: Not signed in.
- `404 Not Found`: Order does not exist, or belongs to a restaurant the caller is not staff of.
