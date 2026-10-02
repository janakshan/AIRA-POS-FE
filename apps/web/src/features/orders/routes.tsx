import type { RouteObject } from 'react-router';

/** SAL-001 Orders (lazy); the nav item's pos.sale.create guard wraps them. */
export const orderRoutes: Record<string, RouteObject[]> = {
  orders: [
    {
      index: true,
      lazy: async () => ({
        Component: (await import('./pages/order-list-page')).OrderListPage,
      }),
    },
    {
      path: ':id',
      lazy: async () => ({
        Component: (await import('./pages/order-detail-page')).OrderDetailPage,
      }),
    },
  ],
};
