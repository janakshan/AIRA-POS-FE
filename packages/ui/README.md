# @rbp/ui — RBP design system

Tailwind v4 tokens + shadcn/Radix components + RBP-specific primitives. See every component
live at **`/design-system`** (UI Kit, screen DS-001; mock/dev builds, linked from dev tools).

Validated at **desktop 1366×768, tablet 1024×768, mobile 390×844** by `pnpm e2e`.

## Foundations (`src/styles/tokens.css`)

| Area      | Tokens / utilities                                                                                                                                                                                                             |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Colour    | Semantic only: `bg-primary`, `text-muted-foreground`, `bg-success`, `bg-warning`, `bg-destructive`, `bg-sidebar`… Light + dark sets; tenant branding overrides `--primary`.                                                    |
| Status    | `status-{neutral,info,warning,progress,success,danger}` (marks/tints) + `status-*-fg` (text on tint, ≥4.5:1).                                                                                                                  |
| Type      | `text-display` 30/36 · `text-title` 24/32 · `text-heading` 18/28 · `text-body` 14/20 · `text-caption` 12/16 · `text-overline` · `text-pos-total` 36/40 · `text-pos-tile`. Tamil/Sinhala get taller line-heights via `:lang()`. |
| Spacing   | 4px scale; semantic `p-page`, `gap-section`, `space-y-stack` (grow at 768px).                                                                                                                                                  |
| Touch     | `h-touch` 44 · `h-touch-pos` 56 · `h-touch-pos-lg` 80; `touch-safe` utility enforces 44px on `pointer: coarse`.                                                                                                                |
| Layers    | `z-sticky` < `z-header` < `z-floating` < `z-overlay` < `z-toast`.                                                                                                                                                              |
| Utilities | `focus-ring`, `tabular`, `scrollbar-none`. Motion respects `prefers-reduced-motion`.                                                                                                                                           |

Breakpoints (`useIsMobile`, `useIsDesktop`): mobile < 768 ≤ tablet < 1280 ≤ desktop.

## Inventory

- **Actions:** `Button` (variants default/secondary/outline/ghost/link/success/warning/destructive; sizes sm/default/lg/pos/pos-lg/icon*; `loading`, `block`), `ButtonGroup`.
- **Forms:** `Form*` (RHF bindings, `required` / `optionalLabel`, `FormErrorSummary`), `Input`, `Textarea`, `Select`, `Checkbox`, `Switch`, `RadioGroup` / `RadioCard`, `NumberInput`, `MoneyInput`, `SearchInput`, `FormSection`, `FormActions`.
- **Data:** `DataTable` (sort, selection, loading/empty/error slots, sticky header, cards < 768px), `Pagination`, `FilterBar`, `FilterChip`, `Table` primitives.
- **Dialogs:** `ResponsiveDialog` (dialog ≥ 768, bottom sheet on phones), `ConfirmDialog` (alert dialog, destructive + loading), `ReasonDialog` (POS-007, shared Zod schema), `Dialog`, `Sheet`, `DropdownMenu`, `Tooltip`, `Toaster`/`toast`.
- **Status & states:** `StatusBadge` (tone + icon + label, sm/md/lg), `StatusDot`, `Alert`, `EmptyState`, `ErrorState`, `ForbiddenState`, `LoadingState`, `TableSkeleton`, `FormSkeleton`, `PageSkeleton`, `InlineError`, `OfflineBanner`.
- **Navigation:** `PageHeader` (breadcrumb eyebrow, `secondaryActions` → ⋮ menu < 640px), `Breadcrumbs`, `Tabs` (pill / underline, `scrollable`).
- **POS (`src/pos`):** `ProductTile`, `CategoryRail`, `QuantityStepper`, `CartLine`, `TotalsPanel`, `PaymentMethodButton`, `PosActionBar`, `NumericKeypad`, `PinKeypad`, `KeyGrid`.

## Rules

1. **POS controls ≥ 56px** (tiles/keys 80px), tagged `data-touch="pos"`; no hover-only affordances.
2. **Money** is integer minor units: display with `MoneyText`/`formatMoney`, enter with `MoneyInput`/`NumericKeypad` + `parseMoney`. Never floats.
3. **Status** always uses `StatusBadge`/`StatusDot` + text — never colour alone; status colours are not used for anything else.
4. **Anything that can open on a phone** uses `ResponsiveDialog`, not `Dialog`.
5. **Lists** use `DataTable`; give it `caption`, `getRowLabel`, and either `primary` columns or a `mobileCard`. Mark wide, low-value columns `hideOnTablet`.
6. **Every async view** has loading (skeleton matching the layout), error (`QueryError`/`ErrorState` with retry), and empty (`EmptyState` with next action) — the app's `QueryBoundary` wires this up.
7. **Labels are props** (English defaults) so the app passes translated strings; validation messages are i18n keys.
