import type { RouteObject } from 'react-router';
import { RequireAccess } from '@/features/auth/components/guards';

/** CUS-001…005 (lazy). The nav item's customer.view guard wraps these; the form needs customer.manage. */
const manage = (children: RouteObject['element']) => (
  <RequireAccess permission="customer.manage">{children}</RequireAccess>
);

const form = {
  lazy: async () => {
    const { CustomerFormPage } = await import('./pages/customer-form-page');
    return { element: manage(<CustomerFormPage />) };
  },
};

export const customerRoutes: Record<string, RouteObject[]> = {
  customers: [
    {
      index: true,
      lazy: async () => ({
        Component: (await import('./pages/customer-list-page')).CustomerListPage,
      }),
    },
    { path: 'new', ...form },
    { path: ':id/edit', ...form },
    {
      path: ':id',
      lazy: async () => ({
        Component: (await import('./pages/customer-detail-layout')).CustomerDetailLayout,
      }),
      children: [
        {
          index: true,
          lazy: async () => ({
            Component: (await import('./pages/customer-overview-page')).CustomerOverviewPage,
          }),
        },
        {
          path: 'orders',
          lazy: async () => ({
            Component: (await import('./pages/customer-orders-page')).CustomerOrdersPage,
          }),
        },
        {
          path: 'balance',
          lazy: async () => ({
            Component: (await import('./pages/customer-balance-page')).CustomerBalancePage,
          }),
        },
      ],
    },
  ],
};
