import { Navigate, type RouteObject } from 'react-router';

/** P3 restaurant pages. Restaurant ordering happens on the POS screen with an order type. */
export const restaurantRoutes: Record<string, RouteObject[]> = {
  restaurantPos: [{ index: true, element: <Navigate to="/pos" replace /> }],
  tables: [
    {
      index: true,
      lazy: async () => ({
        Component: (await import('./pages/tables-page')).TablesPage,
      }),
    },
  ],
};
