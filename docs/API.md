# API Documentation

This document contains the private API specifications for the project. 
These APIs power the core ordering, pricing validation, and receipt generation functionality.

## Base URL
- **Local:** `http://localhost:3000/api`
- **Production:** `https://your-production-url.com/api`

---

## 1. Create Order
**Endpoint:** `POST /api/orders`

Handles order creation for both first-party callers (POS, Kiosks, Web) and third-party callers (external aggregators or decoupled storefronts).

**Authentication:** 
- Standalone external storefronts must pass an `x-storefront-token` header matching the `STOREFRONT_ORDER_TOKEN` environment variable.
- Same-origin callers (e.g., POS terminal) do not need this token.

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
  "source": "web | pos | kiosk | aggregator", 
  "outlet_id": 1,
  "external_order_id": "string", // Used for deduplication
  "external_payload": {}, // Raw aggregator payload
  "items": [
    {
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
1. **First-Party Validation (`external_order_id` is missing):**
   - The server **does not trust** client-supplied prices.
   - It re-fetches products and customization options based on `outlet_id`.
   - It recalculates the `total_amount`, `subtotal`, and GST inclusive taxes based on active catalog prices.
   - Prevents cross-outlet spoofing or price tampering.
2. **Aggregator/External Logic:**
   - The server **trusts** the aggregator's subtotal and total to avoid mismatches.
   - It dynamically extracts GST out of the line item totals.
   - Implements deduplication using `external_order_id` + `source` + `outlet_id`.

**Response (200 OK)**
```json
{
  "order": {
    "id": 123,
    "unique_order_id": "BJ-171891901123",
    "status": "pending",
    // ...other order fields
  },
  "deduped": false // true if external_order_id already existed
}
```

---

## 2. Generate Print Receipt (ESC/POS)
**Endpoint:** `GET /api/print/[orderId]`

Generates a raw ESC/POS byte stream for printing a thermal receipt (80mm width). 

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
- `404 Not Found`: Order does not exist.
