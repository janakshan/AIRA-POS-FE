import type { RouteObject } from 'react-router';

/** BAK-001…006 (lazy), keyed by nav item; each nav item's BAKERY_PRODUCTION guard wraps them. */
const planForm = {
  lazy: async () => ({
    Component: (await import('./pages/plan-form-page')).PlanFormPage,
  }),
};

export const productionRoutes: Record<string, RouteObject[]> = {
  bakeryProduction: [
    {
      index: true,
      lazy: async () => ({
        Component: (await import('./pages/production-dashboard-page')).ProductionDashboardPage,
      }),
    },
  ],
  productionPlan: [
    {
      index: true,
      lazy: async () => ({
        Component: (await import('./pages/plan-list-page')).PlanListPage,
      }),
    },
    { path: 'new', ...planForm },
    {
      path: ':id',
      lazy: async () => ({
        Component: (await import('./pages/plan-detail-page')).PlanDetailPage,
      }),
    },
    { path: ':id/edit', ...planForm },
  ],
  productionBatches: [
    {
      index: true,
      lazy: async () => ({
        Component: (await import('./pages/batch-list-page')).BatchListPage,
      }),
    },
    {
      path: ':id',
      lazy: async () => ({
        Component: (await import('./pages/batch-detail-page')).BatchDetailPage,
      }),
    },
  ],
  finishedGoods: [
    {
      index: true,
      lazy: async () => ({
        Component: (await import('./pages/finished-goods-page')).FinishedGoodsPage,
      }),
    },
  ],
  wastage: [
    {
      index: true,
      lazy: async () => ({
        Component: (await import('./pages/wastage-page')).WastagePage,
      }),
    },
  ],
  productionFormulas: [
    {
      index: true,
      lazy: async () => ({
        Component: (await import('./pages/formula-list-page')).FormulaListPage,
      }),
    },
    {
      path: ':productId/edit',
      lazy: async () => ({
        Component: (await import('./pages/formula-form-page')).FormulaFormPage,
      }),
    },
  ],
};
