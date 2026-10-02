import type {
  ReportParams,
  AttendanceParams,
  EmployeeListParams,
  StaffMealListParams,
  DeliveryListParams,
  WholesaleCollectionListParams,
  WholesaleInvoiceListParams,
  WholesaleReturnListParams,
  WholesaleShopListParams,
  ProductionBatchListParams,
  ProductionPlanListParams,
  WastageListParams,
  IngredientListParams,
  PreparedItemListParams,
  GoodsReceiptListParams,
  PurchaseOrderListParams,
  SupplierListParams,
  InventoryListParams,
  StockAdjustmentListParams,
  StockMovementListParams,
  StockTransferListParams,
  AuditListParams,
  KotListParams,
  OrderListParams,
  CustomerListParams,
  CustomerOrderListParams,
  CategoryListParams,
  CategoryTreeParams,
  LocationProductListParams,
  PriceMatrixParams,
  ProductListParams,
} from '@rbp/types';

/**
 * Query key factory. Tenant-scoped data is always keyed by tenant (and location where
 * relevant) so switching context can never show another tenant's cached data.
 */
export interface QueryScope {
  tenantId: string | null | undefined;
  locationId?: string | null | undefined;
}

const scoped = (scope: QueryScope) =>
  ['t', scope.tenantId ?? '-', scope.locationId ?? '-'] as const;

export const queryKeys = {
  /** /me depends on the token (tenant + user) and the selected location header. */
  me: (token: string | null | undefined, locationId: string | null | undefined) =>
    ['me', token ?? '-', locationId ?? '-'] as const,
  locations: (scope: QueryScope) => [...scoped({ tenantId: scope.tenantId }), 'locations'] as const,
  devices: (scope: QueryScope, locationId: string | null | undefined) =>
    [...scoped({ tenantId: scope.tenantId }), 'devices', locationId ?? '-'] as const,
  dashboard: {
    summary: (scope: QueryScope) => [...scoped(scope), 'dashboard', 'summary'] as const,
  },
  catalog: {
    /** Prefix for invalidating every catalog query of a tenant (all locations). */
    all: (scope: QueryScope) => [...scoped({ tenantId: scope.tenantId }), 'catalog'] as const,
    categories: (scope: QueryScope, params: CategoryListParams = {}) =>
      [...queryKeys.catalog.all(scope), 'categories', params] as const,
    categoryTree: (scope: QueryScope, params: CategoryTreeParams = {}) =>
      [...queryKeys.catalog.all(scope), 'category-tree', params] as const,
    products: (scope: QueryScope, params: ProductListParams = {}) =>
      [...queryKeys.catalog.all(scope), 'products', params] as const,
    product: (scope: QueryScope, id: string) =>
      [...queryKeys.catalog.all(scope), 'product', id] as const,
    /** Location-specific: price and availability differ per location. */
    locationProducts: (scope: QueryScope, params: LocationProductListParams = {}) =>
      [
        ...queryKeys.catalog.all(scope),
        'location-products',
        params.locationId ?? scope.locationId ?? '-',
        { all: !!params.all },
      ] as const,
    priceMatrix: (scope: QueryScope, params: PriceMatrixParams = {}) =>
      [...queryKeys.catalog.all(scope), 'price-matrix', params] as const,
    quickPadLayout: (
      scope: QueryScope,
      locationId: string | null | undefined,
      deviceId?: string | null,
    ) =>
      [
        ...queryKeys.catalog.all(scope),
        'quick-pad-layout',
        locationId ?? '-',
        deviceId ?? '-',
      ] as const,
    kitchenStations: (scope: QueryScope, locationId: string | null | undefined) =>
      [...queryKeys.catalog.all(scope), 'kitchen-stations', locationId ?? '-'] as const,
  },
  customers: {
    all: (scope: QueryScope) => [...scoped({ tenantId: scope.tenantId }), 'customers'] as const,
    list: (scope: QueryScope, params: CustomerListParams) =>
      [...queryKeys.customers.all(scope), 'list', params] as const,
    detail: (scope: QueryScope, id: string) =>
      [...queryKeys.customers.all(scope), 'detail', id] as const,
    /** CUS-004 (all locations, so tenant-scoped like the customer). */
    orders: (scope: QueryScope, id: string, params: CustomerOrderListParams) =>
      [...queryKeys.customers.all(scope), 'orders', id, params] as const,
    ledger: (scope: QueryScope, id: string) =>
      [...queryKeys.customers.all(scope), 'ledger', id] as const,
  },
  orders: {
    /** Prefix for everything order-related at a location. */
    all: (scope: QueryScope) => [...scoped(scope), 'orders'] as const,
    list: (scope: QueryScope, params: OrderListParams) =>
      [...queryKeys.orders.all(scope), 'list', params] as const,
    detail: (scope: QueryScope, id: string) =>
      [...queryKeys.orders.all(scope), 'detail', id] as const,
    receipt: (scope: QueryScope, id: string, returnId?: string) =>
      [...queryKeys.orders.all(scope), 'receipt', id, returnId ?? '-'] as const,
  },
  tables: (scope: QueryScope) => [...scoped(scope), 'tables'] as const,
  /** INV-*: every read under one prefix so any stock change refreshes them all. */
  inventory: {
    all: (scope: QueryScope) => [...scoped(scope), 'inventory'] as const,
    list: (scope: QueryScope, params: InventoryListParams) =>
      [...queryKeys.inventory.all(scope), 'list', params] as const,
    detail: (scope: QueryScope, productId: string) =>
      [...queryKeys.inventory.all(scope), 'detail', productId] as const,
    lowStock: (scope: QueryScope) => [...queryKeys.inventory.all(scope), 'low-stock'] as const,
    movements: (scope: QueryScope, params: StockMovementListParams) =>
      [...queryKeys.inventory.all(scope), 'movements', params] as const,
    adjustments: (scope: QueryScope, params: StockAdjustmentListParams) =>
      [...queryKeys.inventory.all(scope), 'adjustments', params] as const,
    transfers: (scope: QueryScope, params: StockTransferListParams) =>
      [...queryKeys.inventory.all(scope), 'transfers', params] as const,
  },
  /** PUR-*: tenant-wide; receiving also invalidates inventory. */
  purchasing: {
    all: (scope: QueryScope) => [...scoped({ tenantId: scope.tenantId }), 'purchasing'] as const,
    suppliers: (scope: QueryScope, params: SupplierListParams) =>
      [...queryKeys.purchasing.all(scope), 'suppliers', params] as const,
    supplier: (scope: QueryScope, id: string) =>
      [...queryKeys.purchasing.all(scope), 'supplier', id] as const,
    orders: (scope: QueryScope, params: PurchaseOrderListParams) =>
      [...queryKeys.purchasing.all(scope), 'orders', params] as const,
    order: (scope: QueryScope, id: string) =>
      [...queryKeys.purchasing.all(scope), 'order', id] as const,
    receipts: (scope: QueryScope, params: GoodsReceiptListParams) =>
      [...queryKeys.purchasing.all(scope), 'receipts', params] as const,
    receipt: (scope: QueryScope, id: string) =>
      [...queryKeys.purchasing.all(scope), 'receipt', id] as const,
  },
  /** REC-*: location-dependent (on hand, can make) — refreshed with stock changes too. */
  recipes: {
    all: (scope: QueryScope) => [...scoped({ tenantId: scope.tenantId }), 'recipes'] as const,
    ingredients: (scope: QueryScope, params: IngredientListParams) =>
      [...queryKeys.recipes.all(scope), 'ingredients', scope.locationId ?? '-', params] as const,
    list: (scope: QueryScope, locationId: string) =>
      [...queryKeys.recipes.all(scope), 'list', locationId] as const,
    detail: (scope: QueryScope, productId: string, locationId: string) =>
      [...queryKeys.recipes.all(scope), 'detail', productId, locationId] as const,
    planning: (scope: QueryScope, locationId: string) =>
      [...queryKeys.recipes.all(scope), 'planning', locationId] as const,
    prepared: (scope: QueryScope, params: PreparedItemListParams) =>
      [...queryKeys.recipes.all(scope), 'prepared', params] as const,
  },
  /** BAK-*: tenant-wide prefix; every stock change refreshes it too. */
  production: {
    all: (scope: QueryScope) => [...scoped({ tenantId: scope.tenantId }), 'production'] as const,
    summary: (scope: QueryScope, locationId: string) =>
      [...queryKeys.production.all(scope), 'summary', locationId] as const,
    formulas: (scope: QueryScope, locationId: string) =>
      [...queryKeys.production.all(scope), 'formulas', locationId] as const,
    plans: (scope: QueryScope, params: ProductionPlanListParams) =>
      [...queryKeys.production.all(scope), 'plans', params] as const,
    plan: (scope: QueryScope, id: string) =>
      [...queryKeys.production.all(scope), 'plan', id] as const,
    batches: (scope: QueryScope, params: ProductionBatchListParams) =>
      [...queryKeys.production.all(scope), 'batches', params] as const,
    batch: (scope: QueryScope, id: string) =>
      [...queryKeys.production.all(scope), 'batch', id] as const,
    finishedGoods: (scope: QueryScope, locationId: string) =>
      [...queryKeys.production.all(scope), 'finished-goods', locationId] as const,
    wastage: (scope: QueryScope, params: WastageListParams) =>
      [...queryKeys.production.all(scope), 'wastage', params] as const,
  },
  /** REP-*: tenant-wide (location is a parameter); any stock or sale change refreshes them. */
  reports: {
    all: (scope: QueryScope) => [...scoped({ tenantId: scope.tenantId }), 'reports'] as const,
    of: (scope: QueryScope, report: string, params: ReportParams) =>
      [...queryKeys.reports.all(scope), report, params] as const,
  },
  /** HR-*: tenant-wide (staff work across locations). */
  staff: {
    all: (scope: QueryScope) => [...scoped({ tenantId: scope.tenantId }), 'staff'] as const,
    employees: (scope: QueryScope, params: EmployeeListParams) =>
      [...queryKeys.staff.all(scope), 'employees', params] as const,
    employee: (scope: QueryScope, id: string) =>
      [...queryKeys.staff.all(scope), 'employee', id] as const,
    attendance: (scope: QueryScope, params: AttendanceParams) =>
      [...queryKeys.staff.all(scope), 'attendance', params] as const,
    history: (scope: QueryScope, employeeId: string) =>
      [...queryKeys.staff.all(scope), 'history', employeeId] as const,
    roster: (scope: QueryScope, locationId: string, weekStart: string) =>
      [...queryKeys.staff.all(scope), 'roster', locationId, weekStart] as const,
    cashShifts: (scope: QueryScope, locationId: string) =>
      [...queryKeys.staff.all(scope), 'cash-shifts', locationId] as const,
    currentShift: (scope: QueryScope, deviceId: string | null | undefined) =>
      [...queryKeys.staff.all(scope), 'current-shift', deviceId ?? '-'] as const,
    meals: (scope: QueryScope, params: StaffMealListParams) =>
      [...queryKeys.staff.all(scope), 'meals', params] as const,
    allowance: (scope: QueryScope, month: string) =>
      [...queryKeys.staff.all(scope), 'allowance', month] as const,
  },
  /** DEL-*: location-scoped; order changes refresh them too. */
  deliveries: {
    all: (scope: QueryScope) => [...scoped(scope), 'deliveries'] as const,
    list: (scope: QueryScope, params: DeliveryListParams) =>
      [...queryKeys.deliveries.all(scope), 'list', params] as const,
    riders: (scope: QueryScope) => [...queryKeys.deliveries.all(scope), 'riders'] as const,
    detail: (scope: QueryScope, id: string) =>
      [...queryKeys.deliveries.all(scope), 'detail', id] as const,
  },
  /** WHO-*: tenant-wide; invoices and returns move van stock, so stock changes refresh it. */
  wholesale: {
    all: (scope: QueryScope) => [...scoped({ tenantId: scope.tenantId }), 'wholesale'] as const,
    routes: (scope: QueryScope) => [...queryKeys.wholesale.all(scope), 'routes'] as const,
    overview: (scope: QueryScope, routeId: string, date: string) =>
      [...queryKeys.wholesale.all(scope), 'overview', routeId, date] as const,
    shops: (scope: QueryScope, params: WholesaleShopListParams) =>
      [...queryKeys.wholesale.all(scope), 'shops', params] as const,
    shop: (scope: QueryScope, id: string) =>
      [...queryKeys.wholesale.all(scope), 'shop', id] as const,
    ledger: (scope: QueryScope, id: string) =>
      [...queryKeys.wholesale.all(scope), 'ledger', id] as const,
    products: (scope: QueryScope, locationId: string) =>
      [...queryKeys.wholesale.all(scope), 'products', locationId] as const,
    invoices: (scope: QueryScope, params: WholesaleInvoiceListParams) =>
      [...queryKeys.wholesale.all(scope), 'invoices', params] as const,
    invoice: (scope: QueryScope, id: string) =>
      [...queryKeys.wholesale.all(scope), 'invoice', id] as const,
    collections: (scope: QueryScope, params: WholesaleCollectionListParams) =>
      [...queryKeys.wholesale.all(scope), 'collections', params] as const,
    returns: (scope: QueryScope, params: WholesaleReturnListParams) =>
      [...queryKeys.wholesale.all(scope), 'returns', params] as const,
    return: (scope: QueryScope, id: string) =>
      [...queryKeys.wholesale.all(scope), 'return', id] as const,
  },
  kots: {
    all: (scope: QueryScope) => [...scoped(scope), 'kots'] as const,
    list: (scope: QueryScope, params: KotListParams) =>
      [...queryKeys.kots.all(scope), params] as const,
  },
  pos: {
    settings: (scope: QueryScope) => [...scoped(scope), 'pos', 'settings'] as const,
    chargeTypes: (scope: QueryScope) => [...scoped(scope), 'pos', 'charge-types'] as const,
    promotions: (scope: QueryScope) =>
      [...scoped({ tenantId: scope.tenantId }), 'pos', 'promotions'] as const,
  },
  reasons: (scope: QueryScope, action?: string) =>
    [...scoped({ tenantId: scope.tenantId }), 'reasons', action ?? '*'] as const,
  employees: (scope: QueryScope, locationId?: string | null) =>
    [...scoped({ tenantId: scope.tenantId }), 'employees', locationId ?? '*'] as const,
  audit: {
    all: (scope: QueryScope) => [...scoped({ tenantId: scope.tenantId }), 'audit'] as const,
    list: (scope: QueryScope, params: AuditListParams = {}) =>
      [...queryKeys.audit.all(scope), params] as const,
  },
  /** Mock-only dev/support endpoints. */
  dev: {
    demoAccounts: () => ['dev', 'demo-accounts'] as const,
    tenants: () => ['dev', 'tenants'] as const,
    members: (tenantId: string | undefined) => ['dev', 'members', tenantId ?? '-'] as const,
    devices: (tenantId: string | undefined) => ['dev', 'devices', tenantId ?? '-'] as const,
  },
};
