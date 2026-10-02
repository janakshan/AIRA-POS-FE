import type { RouteObject } from 'react-router';

/** DEL-001…004 (lazy), keyed by nav item; DELIVERY + delivery.manage/deliver guard wraps them. */
export const deliveryRoutes: Record<string, RouteObject[]> = {
  deliveries: [
    {
      index: true,
      lazy: async () => ({
        Component: (await import('./pages/delivery-board-page')).DeliveryBoardPage,
      }),
    },
    {
      path: ':id',
      lazy: async () => ({
        Component: (await import('./pages/delivery-detail-page')).DeliveryDetailPage,
      }),
    },
  ],
};
