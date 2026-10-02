# RBP Platform

Multi-tenant business platform (POS, restaurant, KOT, inventory, bakery, wholesale, staff).
Built prototype-first: this frontend runs against an MSW mock API today and switches to the
NestJS API later without component changes (ADR-002/003/004).

## Quick start

```bash
nvm use            # Node 24
pnpm install
pnpm dev           # http://localhost:5173  (mock mode)
```

Demo accounts (password `demo1234`) are listed on the login page. Employee PINs for the
verification dialog: `1111` owner, `2222` manager, `3333` cashier, `4444` waiter, `5555` chef
(Main Restaurant), `6666` (Bakery Outlet), `7777` field sales rep (Van 1, `rep@pilot.demo`), `8888` delivery rider (Main, `rider@pilot.demo`).

| Script                                         | What it does                                                                                  |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `pnpm dev`                                     | Vite dev server for `apps/web`                                                                |
| `pnpm build`                                   | Typecheck + production build (+ PWA service worker)                                           |
| `pnpm test`                                    | Vitest across all workspaces (MSW node server for integration tests)                          |
| `pnpm lint` / `pnpm typecheck` / `pnpm format` | Quality gates                                                                                 |
| `pnpm --filter @rbp/web guide:shots`           | Regenerate the user-guide screenshots (needs the app on :5175 in mock mode, dev tools off)    |
| `pnpm e2e:install` then `pnpm e2e`             | Playwright at 1366×768 / 1024×768 / 390×844: overflow, touch targets, axe (light+dark), shell |

## User guide

A public, step-by-step user guide with screenshots is served at **`/guide`**. No sign-in is needed, so you can send
clients the link. It is also linked from the login page and the account menu. Its structure is in
`apps/web/src/features/guide/content/*.ts`, the text is in `apps/web/src/locales/{en,ta,si}/guide.json`, and the
screenshots are in `apps/web/public/guide/shots/`. To refresh the screenshots after a UI change:

```bash
cd apps/web
VITE_ENABLE_DEVTOOLS=false pnpm exec vite --port 5175   # terminal 1
pnpm guide:shots                                        # terminal 2 (or: pnpm guide:shots pos restaurant)
```

## Layout

```
apps/web/                 React 19 + Vite SPA (admin shell, POS and kitchen layouts)
  src/app/                providers, router, query client, i18n, root layout
  src/features/<module>/  api/ components/ hooks/ pages/ schemas/ store/ (coding standards)
  src/layouts/            AppShell (sidebar/rail/drawer), PosLayout, KitchenLayout
  src/navigation/         nav-config.ts — IA tree, screen IDs, feature + permission gates
  src/mocks/              MSW handlers, seed data, mock auth context (mock mode only)
  src/locales/{en,ta,si}/ translations (TA/SI partial, fall back to EN)
packages/
  ui/          design tokens (Tailwind v4) + shadcn/Radix components + app primitives
  types/       shared domain types, feature codes, permissions, error codes
  validation/  shared Zod schemas (messages are i18n keys)
  api-client/  fetch client, typed endpoints, query-key factory, ApiError
  utils/       money (integer minor units), UTC dates, ULIDs, cn()
  config/      shared tsconfig + ESLint config
```

## Conventions

- **Data flow:** component → TanStack Query hook → `@rbp/api-client` → MSW (now) / NestJS (later).
  No mock arrays in components; seed data lives only in `src/mocks/db`.
- **Tenant context:** tenant and user come from the token; the client only sends
  `X-Location-Id` / `X-Device-Id`, which the API validates. Query keys include tenant/location.
- **Access:** `feature` (tenant entitlement) AND `permission` (role) — see `checkAccess`.
  Routes show a 403 state instead of silently hiding (SCN-006).
- **Money:** integer minor units only; format at the edge with `formatMoney`.
- **Screen IDs:** wrap pages in `<Screen id="CAT-003">`; toggle overlay in dev tools.
- **Adding a module (P1+):** build pages under `src/features/<module>` and export lazy routes
  keyed by nav item (see `features/catalog/routes.tsx`); register them in `PAGE_ROUTES` in
  `src/app/router.tsx`. Nav items without routes keep the `PlaceholderPage`.
- **Sensitive actions:** `useSensitiveAction()` runs employee PIN → reason and returns the
  `verification` the API requires; the server re-checks the employee's permission, consumes the
  verification and writes the audit log (FLOW-POS-002). Nothing is ever deleted.
- **Forms:** shared zod schemas from `@rbp/validation`; server `details.fieldErrors` land on
  fields via `applyServerErrors`. List pages keep filters in the URL (`useListParams`).
- **Assumptions:** gaps in the source docs are recorded in `docs/ASSUMPTIONS.md` for client review.

## Build status

| Phase                   | Screens                                   | Status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0 Foundation           | shell, auth, locations, UI kit, dev tools | Done                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| P1 Catalog              | CAT-001…007                               | Done                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| P2 Retail POS           | POS-001…012                               | POS-001…012 done (sale → payment → receipt, hold/resume, return, void/cancel); REP-006 audit log                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| P3 Restaurant / KOT     | REST-_, KOT-_                             | Done: order types on POS, tables (REST-001), send to kitchen, kitchen board (KOT-003/004), transfer, bill, delivery                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| P4 Customer / Inventory | CUS-_, INV-_                              | Done: CUS-001…005 customers (phones, balance + payments); INV-001…006 stock ledger, adjustments (PIN + reason), transfers, low stock, POS stock blocking                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| P5 Future modules       | PUR, REC, BAK, WHO, HR, DEL, REP          | PUR-001…004 suppliers, purchase orders, goods receiving (PURCHASE movements); REC-001…005 ingredients, recipes (made to order, portion deduction), portion planning, prepared-item queue; BAK-001…005 bakery production (plan → batch → raw materials used → output → wastage → finished goods); WHO-001…006 wholesale (shops, van sales on credit, collections, returns, routes, print/share); DEL-001…004 deliveries (board, rider assignment, status to the door, collect on delivery); HR-001…006 staff (employees, PIN clock-in, roster + cash-drawer shifts, staff meals on the ledger, food allowance); REP-001…006 reports (sales summary, product, location, stock, voids & discounts, audit — CSV + A4 print, 30 days of seeded history). |

## Environment

`apps/web/.env` — `VITE_API_MODE=mock|real`, `VITE_API_BASE_URL`, `VITE_ENABLE_DEVTOOLS`.
In mock mode the PWA service worker is not registered (avoids conflicts with MSW).

## Dev tools (mock mode)

Amber tab on the right edge: switch tenant, sign in as another role, change location/device,
pick a demo scenario (SCN-001…009: signs in as the role that shows it, tops up its data
and opens its screen — see `features/dev-tools/lib/scenarios.ts`), inject latency or failures, show screen IDs, open React
Query devtools, reset mock data.

## Design system

Tokens, components and usage rules: [`packages/ui/README.md`](packages/ui/README.md).
Live reference: sign in, open **Dev tools → Open UI Kit** (`/design-system`).
Responsive screenshots from `pnpm e2e` land in `apps/web/e2e/screenshots/<desktop|tablet|mobile>/`
(HTML report: `pnpm --filter @rbp/web e2e:report`).
