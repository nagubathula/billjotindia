# API & Feature Documentation

The external REST API reference (`API_REFERENCE.md`, `openapi.json`), internal HTTP handler reference (`INTERNAL_API.md`), and channel bridge specification (`CHANNEL_BRIDGE.md`) are kept out of this repository on purpose. Ask the Billjot team for access.

Maintainers keep those specifications alongside the internal feature index (`FEATURES.md`) inside `private-docs/` in their local checkout. That folder is git-ignored: don't commit it, publish it, or copy endpoint details into tracked files.

For non-sensitive application architecture, screens, database schema, server actions, and product workflows, see:
- [`docs/FEATURES.md`](FEATURES.md) — Complete platform feature overview
- [`docs/FRONTEND.md`](FRONTEND.md) — Route groups, app surfaces & UI stack
- [`docs/SERVER_ACTIONS.md`](SERVER_ACTIONS.md) — Next.js Server Action modules
- [`docs/DATABASE.md`](DATABASE.md) & [`docs/DATABASE_RLS.md`](DATABASE_RLS.md) — PostgreSQL schema, RPCs & RLS policies
- [`docs/WORKFLOWS.md`](WORKFLOWS.md) — End-to-end operational workflows
