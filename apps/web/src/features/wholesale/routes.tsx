import type { RouteObject } from 'react-router';

/** WHO-001…006 (lazy), keyed by nav item; each nav item's feature + permission guard wraps them. */
export const wholesaleRoutes: Record<string, RouteObject[]> = {
  externalShops: [
    {
      index: true,
      lazy: async () => ({ Component: (await import('./pages/shop-list-page')).ShopListPage }),
    },
    {
      path: ':id',
      lazy: async () => ({ Component: (await import('./pages/shop-detail-page')).ShopDetailPage }),
    },
  ],
  fieldSales: [
    {
      index: true,
      lazy: async () => ({ Component: (await import('./pages/field-sale-page')).FieldSalePage }),
    },
    {
      path: ':id',
      lazy: async () => ({ Component: (await import('./pages/invoice-page')).InvoicePage }),
    },
  ],
  collections: [
    {
      index: true,
      lazy: async () => ({ Component: (await import('./pages/collections-page')).CollectionsPage }),
    },
  ],
  returns: [
    {
      index: true,
      lazy: async () => ({ Component: (await import('./pages/returns-page')).ReturnsPage }),
    },
    {
      path: 'new',
      lazy: async () => ({ Component: (await import('./pages/return-form-page')).ReturnFormPage }),
    },
    {
      path: ':id',
      lazy: async () => ({
        Component: (await import('./pages/return-detail-page')).ReturnDetailPage,
      }),
    },
  ],
  routes: [
    {
      index: true,
      lazy: async () => ({
        Component: (await import('./pages/route-overview-page')).RouteOverviewPage,
      }),
    },
  ],
};
