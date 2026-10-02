import type { RouteObject } from 'react-router';

/** INV-001…006 (lazy), keyed by nav item; each nav item's feature + permission guard wraps them. */
export const inventoryRoutes: Record<string, RouteObject[]> = {
  stock: [
    {
      index: true,
      lazy: async () => ({
        Component: (await import('./pages/stock-overview-page')).StockOverviewPage,
      }),
    },
    {
      path: ':productId',
      lazy: async () => ({ Component: (await import('./pages/stock-item-page')).StockItemPage }),
    },
  ],
  stockMovement: [
    {
      index: true,
      lazy: async () => ({
        Component: (await import('./pages/stock-movements-page')).StockMovementsPage,
      }),
    },
  ],
  adjustments: [
    {
      index: true,
      lazy: async () => ({ Component: (await import('./pages/adjustments-page')).AdjustmentsPage }),
    },
  ],
  transfers: [
    {
      index: true,
      lazy: async () => ({ Component: (await import('./pages/transfers-page')).TransfersPage }),
    },
  ],
  lowStock: [
    {
      index: true,
      lazy: async () => ({ Component: (await import('./pages/low-stock-page')).LowStockPage }),
    },
  ],
};
