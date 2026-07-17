# Frontend Architecture

This document describes the structure and tooling of the Next.js frontend, specifically how Route Groups isolate different parts of the application.

## Tooling
- **Framework**: Next.js 14+ (App Router)
- **Styling**: Tailwind CSS
- **Component Library**: [shadcn/ui](https://ui.shadcn.com/) (using components like Avatar, Button, Dialog, Sheet, Table, etc.)
- **Icons**: `lucide-react`
- **State Management**: React Context (`CartProvider`), Server Actions, and URL state.

---

## Route Groups

The application uses Next.js [Route Groups](https://nextjs.org/docs/app/building-your-application/routing/route-groups) (folders in parentheses like `(auth)`) to organize the app into distinct logical sections without affecting the URL path.

### 1. `app/(storefront)`
**Purpose**: The public-facing customer experience (menus, ordering, brand landing pages).
- **Key Routes**:
  - `/` (Home page)
  - `/brands/[slug]` (Brand page)
  - `/r/[slug]` (Restaurant menu)
  - `/r/[slug]/checkout` (Customer checkout)
- **Characteristics**: Extremely read-heavy. Uses Supabase's `anon` key to fetch public active menus.

### 2. `app/(pos)`
**Purpose**: The Point-of-Sale interface used by cashiers and staff inside the physical restaurant.
- **Key Routes**:
  - `/r/[slug]/pos` (Main register)
  - `/r/[slug]/pos/receipt/[id]` (Receipt printing page)
- **Characteristics**: Requires authentication. Highly interactive (managing open tabs, triggering KOTs, quick checkouts).

### 3. `app/r/[slug]/admin`
**Purpose**: The back-office dashboard for restaurant managers and admins.
- **Key Routes**:
  - `/admin/menu` (Menu builder)
  - `/admin/orders` (Order management Pipeline)
  - `/admin/kitchen` (Kitchen Display Screen / KDS)
  - `/admin/users` (Staff management)
- **Characteristics**: Heavily reliant on RLS. Users must have the `admin` or `manager` role in `user_roles` to access these pages. Protected by `middleware.ts`.

### 4. `app/(auth)`
**Purpose**: Authentication flows.
- **Key Routes**:
  - `/login`, `/signup`, `/forgot-password`
- **Characteristics**: Handles Supabase Auth session creation and cookie setting.
