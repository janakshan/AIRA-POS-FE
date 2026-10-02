import type { RouteObject } from 'react-router';

/** PUR-001…004 (lazy), keyed by nav item; each nav item's PURCHASING + purchasing.manage guard wraps them. */
const supplierForm = {
  lazy: async () => ({
    Component: (await import('./pages/supplier-form-page')).SupplierFormPage,
  }),
};

const orderForm = {
  lazy: async () => ({
    Component: (await import('./pages/purchase-order-form-page')).PurchaseOrderFormPage,
  }),
};

export const purchasingRoutes: Record<string, RouteObject[]> = {
  suppliers: [
    {
      index: true,
      lazy: async () => ({
        Component: (await import('./pages/supplier-list-page')).SupplierListPage,
      }),
    },
    { path: 'new', ...supplierForm },
    { path: ':id/edit', ...supplierForm },
    {
      path: ':id',
      lazy: async () => ({
        Component: (await import('./pages/supplier-detail-page')).SupplierDetailPage,
      }),
    },
  ],
  purchaseOrders: [
    {
      index: true,
      lazy: async () => ({
        Component: (await import('./pages/purchase-order-list-page')).PurchaseOrderListPage,
      }),
    },
    { path: 'new', ...orderForm },
    { path: ':id/edit', ...orderForm },
    {
      path: ':id',
      lazy: async () => ({
        Component: (await import('./pages/purchase-order-detail-page')).PurchaseOrderDetailPage,
      }),
    },
  ],
  goodsReceiving: [
    {
      index: true,
      lazy: async () => ({
        Component: (await import('./pages/goods-receiving-page')).GoodsReceivingPage,
      }),
    },
    {
      path: 'new',
      lazy: async () => ({
        Component: (await import('./pages/receive-goods-page')).ReceiveGoodsPage,
      }),
    },
    {
      path: ':id',
      lazy: async () => ({
        Component: (await import('./pages/goods-receipt-page')).GoodsReceiptPage,
      }),
    },
  ],
};
