# Project Setup & Configuration

This document outlines how the project is configured, seeded, and run locally.

## Environment Variables
The application requires the following environment variables (defined in `.env.local`). A template is provided in `.env.example`.

### Supabase Keys
- `NEXT_PUBLIC_SUPABASE_URL`: The URL of your Supabase project (used by both client and server).
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: The public key for anonymous/authenticated access (governed by RLS).
- `SUPABASE_SERVICE_ROLE_KEY`: The secret admin key used **only** on the server to bypass RLS (e.g., for processing external webhooks or critical DB migrations).

### Routing
- `NEXT_PUBLIC_ROOT_DOMAIN`: The apex domain for per-store subdomain routing (e.g., `billjot.app`). 
  - If set, stores live at `[slug].billjot.app`.
  - If unset (default for local dev), stores live at `/r/[slug]`.
  - For local subdomain testing, set to `lvh.me` and visit `http://[slug].lvh.me:3000`.

### Security
- `STOREFRONT_ORDER_TOKEN`: A shared secret. If set, any external storefront client posting to `/api/orders` must include this in the `x-storefront-token` header. Prevents spam if the API is exposed.

---

## Database Management & Scripts

The `scripts/` folder contains Node.js scripts for managing the database state. Since they use the `@supabase/supabase-js` client, they bypass the local Supabase CLI and operate directly against the database URL.

- `clear-all.mjs`: Completely wipes all data from the database. It deletes from `user_roles`, `restaurants`, `brands`, and `profiles`, which cascades down and deletes all menus and orders. Useful for resetting staging environments.
- `seed-demo.mjs`: Populates the database with dummy data (e.g., a sample brand, a few restaurants/outlets, categories, and products) so you can test the POS and storefront immediately after a fresh install.

**To run a script:**
```bash
node scripts/seed-demo.mjs
```
*(Ensure your `.env.local` is present in the root directory, as the scripts load `dotenv` to authenticate).*

---

## Troubleshooting

### `AuthApiError: Invalid Refresh Token` in console
During development, if a user's browser has a stale or invalid session cookie, you might have previously seen `[AuthApiError: Invalid Refresh Token: Refresh Token Not Found]` logged multiple times on the server.

This happens due to how Next.js propagates modified cookies from Middleware to Server Components in a single request lifecycle:
1. The middleware detects an invalid session via `@supabase/ssr` and triggers a cookie clear (`maxAge: 0`).
2. If the middleware simply sets the request cookie to an empty string (`request.cookies.set(name, '')`), Next.js Server Components will still read that empty string via `cookies().getAll()`.
3. The Server Component then calls `supabase.auth.getUser()`, which blindly attempts a second redundant refresh using the empty token, triggering the `AuthApiError` log inside the Supabase client.

**Resolution:** In `lib/supabase/middleware.ts`, we explicitly use `request.cookies.delete(name)` when the `setAll` callback attempts to clear a cookie (when `value === ""`). This prevents the Server Components from seeing the stale token in the same request, eliminating the duplicate authentication attempts and the console spam.
