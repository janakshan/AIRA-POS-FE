import type { RouteObject } from 'react-router';

/** REP-001…005 and REP-007 (lazy), keyed by nav item (REP-006 lives in features/audit). */
export const reportRoutes: Record<string, RouteObject[]> = {
  salesReport: [
    {
      index: true,
      lazy: async () => ({
        Component: (await import('./pages/sales-summary-page')).SalesSummaryPage,
      }),
    },
  ],
  productSales: [
    {
      index: true,
      lazy: async () => ({
        Component: (await import('./pages/product-sales-page')).ProductSalesPage,
      }),
    },
  ],
  locationSales: [
    {
      index: true,
      lazy: async () => ({
        Component: (await import('./pages/location-sales-page')).LocationSalesPage,
      }),
    },
  ],
  inventoryReport: [
    {
      index: true,
      lazy: async () => ({
        Component: (await import('./pages/stock-report-page')).StockReportPage,
      }),
    },
  ],
  voidsReport: [
    {
      index: true,
      lazy: async () => ({
        Component: (await import('./pages/voids-report-page')).VoidsReportPage,
      }),
    },
  ],
  staffReport: [
    {
      index: true,
      lazy: async () => ({
        Component: (await import('./pages/staff-report-page')).StaffReportPage,
      }),
    },
  ],
};
