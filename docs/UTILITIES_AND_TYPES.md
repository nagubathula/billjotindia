# Utilities, Types & Supabase Clients

For an AI model (or new developer) generating code for this application, understanding **which** utility or client to import is the most common point of failure. This document maps out the core utilities.

## 1. Supabase Client Strategy (`lib/supabase/`)
This application uses the `@supabase/ssr` package. You must **never** instantiate `createClient` directly from `@supabase/supabase-js`. Always import one of the following wrappers depending on the environment:

- **`lib/supabase/server.ts`**: Use this in **Server Components** and **Server Actions**. It uses the user's cookies to authenticate. *Subject to RLS.*
- **`lib/supabase/client.ts`**: Use this in **Client Components** (React files with `"use client"`). It uses the browser's cookies. *Subject to RLS.*
- **`lib/supabase/middleware.ts`**: Used *only* inside `middleware.ts` to refresh sessions securely on the edge.
- **`lib/supabase/admin.ts`**: Use this **only** in secure Server Actions or API routes when you explicitly need to bypass Row Level Security (RLS). It uses the `SUPABASE_SERVICE_ROLE_KEY`. (Example usage: processing external webhooks, or inserting orders from an anonymous storefront user).

## 2. Type Definitions (`lib/`)
Strict TypeScript typing is enforced.

- **`lib/database.types.ts`**: Automatically generated types directly from the Supabase PostgreSQL schema. Do not edit this manually.
- **`lib/types.ts`**: Application-specific composite types (e.g., `ProductWithCustomizations`, `CartItem`). If you need a type for a React component prop that combines multiple database tables, define it here.

## 3. Core Application Contexts (`lib/`)

- **`lib/auth.ts`**: Contains helper functions to extract the current user's session and role. Use this in Server Actions to verify a user has the `admin` role before performing a mutation.
- **`lib/outlet-context.ts`**: Since the application is multi-tenant and multi-outlet, almost all database queries require an `outlet_id`. This utility/context helps extract the current `outlet_id` from the URL slugs (e.g., `/r/[slug]`) so components know which data to fetch.
