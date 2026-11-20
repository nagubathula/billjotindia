# Project Setup, Seeding & Commands

## Prerequisites & Local Startup

```powershell
npm install
Copy-Item .env.example .env.local
# Populate .env.local with Supabase credentials and optional gateway/webhook env vars
npm run dev
```

App runs at `http://localhost:3000`.

### Required Environment Variables (`.env.local`)
- `NEXT_PUBLIC_SUPABASE_URL` — Supabase Project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase anonymous key
- `SUPABASE_SERVICE_ROLE_KEY` — Server-only service role key (never expose to browsers)
- `NEXT_PUBLIC_DEFAULT_OUTLET_ID` — Optional default outlet UUID fallback
- `STOREFRONT_ALLOWED_ORIGINS` — Optional fallback comma-separated browser origins
- `CHANNEL_ORDER_TOKEN` / `CHANNEL_BRIDGE_WEBHOOK_URL` — Optional delivery-platform channel bridge configuration
- `ERROR_ALERT_WEBHOOK_URL` / `SENTRY_DSN` — Optional server 5xx telemetry alerts

---

## Database Migrations & Types (Supabase CLI v3+)

Supabase CLI v3 targets a local instance by default; pass `--remote` when inspecting or pushing to the linked hosted database:

```bash
npx supabase migration list --remote
npx supabase db push --remote --dry-run
npx supabase db push --remote --yes
npx supabase gen types typescript --remote --schema public > lib/database.types.ts
```

> On Windows PowerShell, avoid raw `>` redirection for UTF-8 TypeScript files (PowerShell writes UTF-16LE by default); use Git Bash or write UTF-8 explicitly.

---

## Seeding & Maintenance Scripts (`scripts/`)

All seed scripts are idempotent and read Supabase credentials from environment / `.env.local`:
- **`scripts/seed-demo.mjs`** / **`scripts/seed-manaruchulu.mjs`** — Baseline brands, outlets, floor tables, menus, and sample orders (`node --env-file=.env.local scripts/seed-demo.mjs`)
- **`scripts/seed-ops-data.mjs`** — Vendors, Purchase Orders, Vendor Payments, Staff HR (employees, 7-day attendance, advances, payroll), Coupons, People's Tabs, Corporate Clients/GST Invoices, and Petty Cash Expenses (`node --env-file=.env.local scripts/seed-ops-data.mjs`)
- **`scripts/seed-bookings.mjs`** — Upcoming table reservations (including paid cover deposits) and active walk-in waitlist queues across outlets (`node scripts/seed-bookings.mjs`)
- **`scripts/create-user.mjs`** / **`scripts/delete-user.mjs`** / **`scripts/attach-brand.mjs`** — Staff user & brand management helpers
- **`scripts/generate-pwa-icons.mjs`** — Generates raster/vector PWA icons under `public/icons/`
- **`scripts/clear-all.mjs`** — Resets restaurant/brand data cleanly (use only in non-production/reset scenarios)

---

## Quality Checks & Build

```powershell
npx tsc --noEmit
npm run lint
npm test
npm run build
```

- `npm test` runs Node's built-in test runner (`node --no-warnings --experimental-strip-types --import ./scripts/test-loader.mjs --test tests/*.test.ts`) across all unit test suites under `tests/`.
- `npm run lint` runs ESLint directly (`eslint`) compatible with Next.js 16.
