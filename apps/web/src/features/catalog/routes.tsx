import type * as React from 'react';
import type { RouteObject } from 'react-router';
import { RequireAccess } from '@/features/auth/components/guards';

/**
 * P1 Catalog pages, lazy-loaded, keyed by nav item. The nav item's own guard
 * (catalog.view / catalog.manage) wraps these; editors additionally need catalog.manage.
 */
const manage = (children: RouteObject['element']) => (
  <RequireAccess permission="catalog.manage">{children}</RequireAccess>
);

const lazyPage = (load: () => Promise<{ default: React.ComponentType }>, guard = false) => ({
  lazy: async () => {
    const { default: Page } = await load();
    return guard ? { element: manage(<Page />) } : { Component: Page };
  },
});

export const catalogRoutes: Record<string, RouteObject[]> = {
  locationProducts: [
    {
      index: true,
      ...lazyPage(() =>
        import('./pages/location-products-page').then((m) => ({ default: m.LocationProductsPage })),
      ),
    },
  ],
  pricing: [
    {
      index: true,
      ...lazyPage(() => import('./pages/pricing-page').then((m) => ({ default: m.PricingPage }))),
    },
  ],
  quickPad: [
    {
      index: true,
      ...lazyPage(() =>
        import('./pages/quick-pad-designer-page').then((m) => ({
          default: m.QuickPadDesignerPage,
        })),
      ),
    },
  ],
  products: [
    {
      index: true,
      ...lazyPage(() =>
        import('./pages/product-list-page').then((m) => ({ default: m.ProductListPage })),
      ),
    },
    {
      path: 'new',
      ...lazyPage(
        () => import('./pages/product-form-page').then((m) => ({ default: m.ProductFormPage })),
        true,
      ),
    },
    {
      path: ':id',
      ...lazyPage(
        () => import('./pages/product-form-page').then((m) => ({ default: m.ProductFormPage })),
        true,
      ),
    },
  ],
  categories: [
    {
      index: true,
      lazy: async () => ({
        Component: (await import('./pages/category-list-page')).CategoryListPage,
      }),
    },
    {
      path: 'new',
      lazy: async () => {
        const { CategoryFormPage } = await import('./pages/category-form-page');
        return { element: manage(<CategoryFormPage />) };
      },
    },
    {
      path: ':id',
      lazy: async () => {
        const { CategoryFormPage } = await import('./pages/category-form-page');
        return { element: manage(<CategoryFormPage />) };
      },
    },
  ],
};
