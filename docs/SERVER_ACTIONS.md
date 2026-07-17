# Server Actions (Internal API)

Because Billjot is built on the Next.js App Router, the majority of the backend logic is handled via **Server Actions** rather than traditional `/api/` REST routes. 

These actions are simple async functions that execute securely on the server and are callable directly from React Client Components.

---

## 1. Authentication & Users
**File:** `app/(auth)/signup/actions.ts`
- `signUpAction(formData)`: Registers a new user via Supabase Auth, triggers the email verification, and handles onboarding state.

**File:** `app/r/[slug]/admin/users/actions.ts`
- `inviteUser(email, role)`: Sends an invitation to a new staff member to join a specific restaurant's dashboard.
- `updateUserRole(userId, newRole)`: Changes a staff member's role (`admin`, `manager`, `user`).
- `removeUser(userId)`: Revokes access for a user to this restaurant.

---

## 2. Menu Management
**File:** `app/r/[slug]/admin/menu/actions.ts`
This file handles all CRUD (Create, Read, Update, Delete) operations for the menu builder.

- **Categories**: `createCategory`, `updateCategory`, `deleteCategory`, `reorderCategories`
- **Products**: `createProduct`, `updateProduct`, `deleteProduct`
- **Customizations**: `createCustomizationGroup`, `updateGroup`, `addOptionToGroup`, `removeOptionFromGroup`, `linkGroupToProduct`, `unlinkGroupFromProduct`

*(All of these actions ensure the user is an `admin` or `manager` for the current restaurant before performing the DB mutation).*

---

## 3. Order Management & Fulfillment
**File:** `app/r/[slug]/admin/orders/[id]/actions.ts`
- `updateOrderStatus(orderId, status)`: Transitions an order between `pending`, `preparing`, `ready`, `completed`, or `cancelled`.
- `updatePaymentStatus(orderId, status)`: Transitions payment between `unpaid`, `paid`, or `refunded`.

---

## 4. Point of Sale (POS) Operations
**File:** `app/(pos)/r/[slug]/pos/actions.ts`
- `placePosOrder(cart)`: A specialized wrapper around the order creation logic for walk-in customers. It handles instant payment verification and print-triggering for physical hardware.

**File:** `app/(pos)/r/[slug]/pos/tab-actions.ts`
- `openTab(customerDetails)`: Opens a running bill for a dine-in table or bar customer.
- `addItemToTab(tabId, item)`: Appends an item to an existing, unpaid open tab.
- `closeTab(tabId)`: Finalizes the bill, generates the final total (triggering the `POST /api/orders` flow), and marks it for payment.

---

## 5. Storefront & Public Data
**File:** `app/actions/modifiers.ts`
- `getProductModifiers(productId)`: Fetches the hierarchical tree of Customization Groups and Options for a specific product. This is used by the public storefront to render the "Add to Cart" modal with all the radio buttons and checkboxes.

**File:** `app/(storefront)/brands/actions.ts`
- `getBrandOutlets(brandId)`: Fetches all public outlets under a specific brand umbrella to populate the location picker on the homepage.
