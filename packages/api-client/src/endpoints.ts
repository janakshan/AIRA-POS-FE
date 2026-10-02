import type {
  LocationSalesReport,
  ProductSalesParams,
  ProductSalesReport,
  ReportParams,
  SalesSummaryReport,
  StockReport,
  StockReportParams,
  VoidsReport,
  AttendanceParams,
  AttendanceRecord,
  AttendanceRow,
  CashShift,
  CashShiftEventRequest,
  ClockRequest,
  ClockResponse,
  CloseCashShiftRequest,
  EmployeeListParams,
  EmployeeRequest,
  EmployeeView,
  FoodAllowanceResponse,
  OpenCashShiftRequest,
  RosterAssignRequest,
  RosterWeek,
  StaffMeal,
  StaffMealListParams,
  StaffMealRequest,
  DeliveryAssignRequest,
  DeliveryListParams,
  DeliveryRider,
  RouteOverview,
  ShareInvoiceRequest,
  ShopLedgerEntry,
  WholesaleCollection,
  WholesaleCollectionListParams,
  WholesaleCollectionRequest,
  WholesaleInvoice,
  WholesaleInvoiceListParams,
  WholesaleInvoiceRequest,
  WholesaleProduct,
  WholesaleReturn,
  WholesaleReturnDetail,
  WholesaleReturnListParams,
  WholesaleReturnRequest,
  WholesaleRoute,
  WholesaleShop,
  WholesaleShopListParams,
  WholesaleShopListResponse,
  WholesaleShopRequest,
  CancelProductionRequest,
  CompleteBatchRequest,
  CreateWastageRequest,
  FinishedGoodsItem,
  ProductionBatch,
  ProductionBatchDetail,
  ProductionBatchListParams,
  ProductionFormula,
  ProductionPlan,
  ProductionPlanListParams,
  ProductionPlanRequest,
  ProductionSummary,
  StartBatchRequest,
  WastageEntry,
  WastageListParams,
  WastageListResponse,
  CreatePreparedItemRequest,
  DisposePreparedItemRequest,
  Ingredient,
  IngredientListParams,
  IngredientRequest,
  PreparedItem,
  PreparedItemListParams,
  Recipe,
  RecipeListResponse,
  RecipePlanning,
  SaveRecipeRequest,
  CancelPurchaseOrderRequest,
  GoodsReceipt,
  GoodsReceiptListParams,
  PurchaseOrder,
  PurchaseOrderListParams,
  PurchaseOrderRequest,
  ReceiveGoodsRequest,
  Supplier,
  SupplierListParams,
  SupplierRequest,
  CreateStockAdjustmentRequest,
  CreateStockTransferRequest,
  InventoryItemDetail,
  InventoryListParams,
  InventoryListResponse,
  ReceiveStockTransferRequest,
  SetMinStockRequest,
  StockAdjustment,
  StockAdjustmentListParams,
  StockLevel,
  StockMovement,
  StockMovementListParams,
  StockTransfer,
  StockTransferListParams,
  AuditEvent,
  AuditListParams,
  Category,
  CategoryListParams,
  CategoryTreeNode,
  CategoryTreeParams,
  ChargeType,
  CancelItemRequest,
  CreateAdjustmentRequest,
  CreateCategoryRequest,
  CreateCustomerRequest,
  CreateOrderRequest,
  CreateProductRequest,
  CreateReturnRequest,
  Customer,
  CustomerDetail,
  CustomerLedgerEntry,
  CustomerListParams,
  CustomerListResponse,
  CustomerOrderListParams,
  ReceiveCustomerPaymentRequest,
  ReceiveCustomerPaymentResponse,
  DashboardSummary,
  DeliveryStatusRequest,
  DrawerEventRequest,
  Device,
  EmployeeVerification,
  EmployeeSummary,
  EmployeeVerificationRequest,
  KitchenStation,
  Kot,
  KotListParams,
  Location,
  LoginRequest,
  LocationProduct,
  LocationProductListParams,
  LoginResponse,
  MeResponse,
  Order,
  OrderApprovalRequest,
  CancelOrderRequest,
  OrderListParams,
  Paginated,
  PayOrderRequest,
  PosSettings,
  Promotion,
  SaleAdjustment,
  PriceMatrix,
  PriceMatrixParams,
  Product,
  ProductListParams,
  QuickPadLayout,
  Reason,
  Receipt,
  RestaurantTable,
  SendToKitchenResponse,
  TransferTableRequest,
  UpdateCategoryRequest,
  UpdateCustomerRequest,
  UpdateLocationProductRequest,
  UpdateOrderLinesRequest,
  UpdatePricesRequest,
  UpdatePricesResponse,
  UpdateProductRequest,
  UpdateQuickPadLayoutRequest,
  VoidAdjustmentRequest,
} from '@rbp/types';
import type { ApiClient } from './client';

export const API_PREFIX = '/api/v1';

/** Typed endpoint functions. Components use these via TanStack Query hooks, never fetch directly. */
export function createRbpApi(client: ApiClient) {
  return {
    auth: {
      login: (body: LoginRequest) => client.post<LoginResponse>(`${API_PREFIX}/auth/login`, body),
      logout: () => client.post<undefined>(`${API_PREFIX}/auth/logout`),
    },
    identity: {
      me: (signal?: AbortSignal) => client.get<MeResponse>(`${API_PREFIX}/me`, { signal }),
      locations: (signal?: AbortSignal) =>
        client.get<Location[]>(`${API_PREFIX}/locations`, { signal }),
      /** Devices at the allowed locations (optionally one location). */
      devices: (locationId?: string, signal?: AbortSignal) =>
        client.get<Device[]>(`${API_PREFIX}/devices`, { query: { locationId }, signal }),
      verifyEmployee: (body: EmployeeVerificationRequest) =>
        client.post<EmployeeVerification>(`${API_PREFIX}/employee-verifications`, body),
    },
    reasons: {
      /** Optionally only the reasons offered for one sensitive action. */
      list: (action?: string, signal?: AbortSignal) =>
        client.get<Reason[]>(`${API_PREFIX}/reasons`, { query: { action }, signal }),
    },
    employees: {
      list: (locationId?: string, signal?: AbortSignal) =>
        client.get<EmployeeSummary[]>(`${API_PREFIX}/employees`, { query: { locationId }, signal }),
    },
    audit: {
      list: (params: AuditListParams = {}, signal?: AbortSignal) =>
        client.get<Paginated<AuditEvent>>(`${API_PREFIX}/audit-events`, {
          query: { ...params },
          signal,
        }),
    },
    customers: {
      list: (params: CustomerListParams = {}, signal?: AbortSignal) =>
        client.get<CustomerListResponse>(`${API_PREFIX}/customers`, {
          query: { ...params },
          signal,
        }),
      get: (id: string, signal?: AbortSignal) =>
        client.get<CustomerDetail>(`${API_PREFIX}/customers/${encodeURIComponent(id)}`, {
          signal,
        }),
      /** CUS-004 orders at every location. */
      orders: (id: string, params: CustomerOrderListParams = {}, signal?: AbortSignal) =>
        client.get<Paginated<Order>>(`${API_PREFIX}/customers/${encodeURIComponent(id)}/orders`, {
          query: { ...params },
          signal,
        }),
      /** CUS-005 statement (running balance). */
      ledger: (id: string, signal?: AbortSignal) =>
        client.get<CustomerLedgerEntry[]>(
          `${API_PREFIX}/customers/${encodeURIComponent(id)}/ledger`,
          { signal },
        ),
      receivePayment: (id: string, body: ReceiveCustomerPaymentRequest) =>
        client.post<ReceiveCustomerPaymentResponse>(
          `${API_PREFIX}/customers/${encodeURIComponent(id)}/payments`,
          body,
        ),
      create: (body: CreateCustomerRequest) =>
        client.post<Customer>(`${API_PREFIX}/customers`, body),
      update: (id: string, body: UpdateCustomerRequest) =>
        client.patch<Customer>(`${API_PREFIX}/customers/${encodeURIComponent(id)}`, body),
    },
    /** Saved sales (POS-008…012). Scoped to the X-Location-Id location. */
    orders: {
      list: (params: OrderListParams = {}, signal?: AbortSignal) =>
        client.get<Paginated<Order>>(`${API_PREFIX}/orders`, { query: { ...params }, signal }),
      get: (id: string, signal?: AbortSignal) =>
        client.get<Order>(`${API_PREFIX}/orders/${encodeURIComponent(id)}`, { signal }),
      create: (body: CreateOrderRequest) => client.post<Order>(`${API_PREFIX}/orders`, body),
      updateLines: (id: string, body: UpdateOrderLinesRequest) =>
        client.put<Order>(`${API_PREFIX}/orders/${encodeURIComponent(id)}/lines`, body),
      resume: (id: string) =>
        client.post<Order>(`${API_PREFIX}/orders/${encodeURIComponent(id)}/resume`),
      pay: (id: string, body: PayOrderRequest) =>
        client.post<Order>(`${API_PREFIX}/orders/${encodeURIComponent(id)}/payments`, body),
      cancelItem: (id: string, lineId: string, body: CancelItemRequest) =>
        client.post<Order>(
          `${API_PREFIX}/orders/${encodeURIComponent(id)}/items/${encodeURIComponent(lineId)}/cancel`,
          body,
        ),
      cancel: (id: string, body: CancelOrderRequest) =>
        client.post<Order>(`${API_PREFIX}/orders/${encodeURIComponent(id)}/cancel`, body),
      void: (id: string, body: OrderApprovalRequest) =>
        client.post<Order>(`${API_PREFIX}/orders/${encodeURIComponent(id)}/void`, body),
      createReturn: (id: string, body: CreateReturnRequest) =>
        client.post<Order>(`${API_PREFIX}/orders/${encodeURIComponent(id)}/returns`, body),
      receipt: (id: string, signal?: AbortSignal) =>
        client.get<Receipt>(`${API_PREFIX}/orders/${encodeURIComponent(id)}/receipt`, { signal }),
      returnReceipt: (id: string, returnId: string, signal?: AbortSignal) =>
        client.get<Receipt>(
          `${API_PREFIX}/orders/${encodeURIComponent(id)}/returns/${encodeURIComponent(returnId)}/receipt`,
          { signal },
        ),
      /** Send unsent items to the kitchen: one KOT per station (REQ-379…395). */
      sendToKitchen: (id: string) =>
        client.post<SendToKitchenResponse>(
          `${API_PREFIX}/orders/${encodeURIComponent(id)}/send-kitchen`,
        ),
      /** Print the table's bill (pro-forma) before payment. */
      bill: (id: string) =>
        client.post<Order>(`${API_PREFIX}/orders/${encodeURIComponent(id)}/bill`),
      /** Leave the order open but free this terminal (waiter leaves the table). */
      release: (id: string) =>
        client.post<Order>(`${API_PREFIX}/orders/${encodeURIComponent(id)}/release`),
      deliveryStatus: (id: string, body: DeliveryStatusRequest) =>
        client.post<Order>(`${API_PREFIX}/orders/${encodeURIComponent(id)}/delivery-status`, body),
      /** DEL-003 assign / reassign a rider. */
      deliveryAssign: (id: string, body: DeliveryAssignRequest) =>
        client.post<Order>(`${API_PREFIX}/orders/${encodeURIComponent(id)}/delivery-assign`, body),
      /** Simulated receipt printer; audited as print or reprint. */
      print: (id: string, returnId?: string) =>
        client.post<{ printer: string; copy: 'ORIGINAL' | 'REPRINT' | 'BILL' }>(
          `${API_PREFIX}/orders/${encodeURIComponent(id)}/receipt/print`,
          returnId ? { returnId } : {},
        ),
    },
    /** REST-001 tables at the current location with live state. */
    tables: {
      list: (signal?: AbortSignal) =>
        client.get<RestaurantTable[]>(`${API_PREFIX}/tables`, { signal }),
      transfer: (id: string, body: TransferTableRequest) =>
        client.post<Order>(`${API_PREFIX}/tables/${encodeURIComponent(id)}/transfer`, body),
    },
    /** INV-001/002/006 stock levels (derived from the stock ledger). */
    inventory: {
      list: (params: InventoryListParams = {}, signal?: AbortSignal) =>
        client.get<InventoryListResponse>(`${API_PREFIX}/inventory`, {
          query: { ...params },
          signal,
        }),
      get: (productId: string, signal?: AbortSignal) =>
        client.get<InventoryItemDetail>(
          `${API_PREFIX}/inventory/${encodeURIComponent(productId)}`,
          {
            signal,
          },
        ),
      lowStock: (signal?: AbortSignal) =>
        client.get<StockLevel[]>(`${API_PREFIX}/inventory/low-stock`, { signal }),
      setMinStock: (productId: string, locationId: string, body: SetMinStockRequest) =>
        client.patch<StockLevel>(
          `${API_PREFIX}/inventory/${encodeURIComponent(productId)}/levels/${encodeURIComponent(locationId)}`,
          body,
        ),
    },
    /** INV-003 the stock ledger. */
    stockMovements: {
      list: (params: StockMovementListParams = {}, signal?: AbortSignal) =>
        client.get<Paginated<StockMovement>>(`${API_PREFIX}/stock-movements`, {
          query: { ...params },
          signal,
        }),
    },
    /** INV-004 adjustments (PIN + reason). */
    stockAdjustments: {
      list: (params: StockAdjustmentListParams = {}, signal?: AbortSignal) =>
        client.get<Paginated<StockAdjustment>>(`${API_PREFIX}/stock-adjustments`, {
          query: { ...params },
          signal,
        }),
      create: (body: CreateStockAdjustmentRequest) =>
        client.post<StockAdjustment>(`${API_PREFIX}/stock-adjustments`, body),
    },
    /** INV-005 transfers: dispatch → receive. */
    stockTransfers: {
      list: (params: StockTransferListParams = {}, signal?: AbortSignal) =>
        client.get<Paginated<StockTransfer>>(`${API_PREFIX}/stock-transfers`, {
          query: { ...params },
          signal,
        }),
      get: (id: string, signal?: AbortSignal) =>
        client.get<StockTransfer>(`${API_PREFIX}/stock-transfers/${encodeURIComponent(id)}`, {
          signal,
        }),
      create: (body: CreateStockTransferRequest) =>
        client.post<StockTransfer>(`${API_PREFIX}/stock-transfers`, body),
      receive: (id: string, body: ReceiveStockTransferRequest) =>
        client.post<StockTransfer>(
          `${API_PREFIX}/stock-transfers/${encodeURIComponent(id)}/receive`,
          body,
        ),
      cancel: (id: string) =>
        client.post<StockTransfer>(
          `${API_PREFIX}/stock-transfers/${encodeURIComponent(id)}/cancel`,
        ),
    },
    /** PUR-001/002 suppliers (tenant-wide). */
    suppliers: {
      list: (params: SupplierListParams = {}, signal?: AbortSignal) =>
        client.get<Paginated<Supplier>>(`${API_PREFIX}/suppliers`, {
          query: { ...params },
          signal,
        }),
      get: (id: string, signal?: AbortSignal) =>
        client.get<Supplier>(`${API_PREFIX}/suppliers/${encodeURIComponent(id)}`, { signal }),
      create: (body: SupplierRequest) => client.post<Supplier>(`${API_PREFIX}/suppliers`, body),
      update: (id: string, body: SupplierRequest) =>
        client.patch<Supplier>(`${API_PREFIX}/suppliers/${encodeURIComponent(id)}`, body),
      setActive: (id: string, isActive: boolean) =>
        client.post<Supplier>(
          `${API_PREFIX}/suppliers/${encodeURIComponent(id)}/${isActive ? 'activate' : 'deactivate'}`,
        ),
    },
    /** PUR-003 purchase orders: draft → ordered → (partially) received, or cancelled. */
    purchaseOrders: {
      list: (params: PurchaseOrderListParams = {}, signal?: AbortSignal) =>
        client.get<Paginated<PurchaseOrder>>(`${API_PREFIX}/purchase-orders`, {
          query: { ...params },
          signal,
        }),
      get: (id: string, signal?: AbortSignal) =>
        client.get<PurchaseOrder>(`${API_PREFIX}/purchase-orders/${encodeURIComponent(id)}`, {
          signal,
        }),
      create: (body: PurchaseOrderRequest) =>
        client.post<PurchaseOrder>(`${API_PREFIX}/purchase-orders`, body),
      update: (id: string, body: PurchaseOrderRequest) =>
        client.put<PurchaseOrder>(`${API_PREFIX}/purchase-orders/${encodeURIComponent(id)}`, body),
      place: (id: string) =>
        client.post<PurchaseOrder>(`${API_PREFIX}/purchase-orders/${encodeURIComponent(id)}/place`),
      cancel: (id: string, body: CancelPurchaseOrderRequest) =>
        client.post<PurchaseOrder>(
          `${API_PREFIX}/purchase-orders/${encodeURIComponent(id)}/cancel`,
          body,
        ),
      /** PUR-004 receive a delivery: posts PURCHASE stock movements. */
      receive: (id: string, body: ReceiveGoodsRequest) =>
        client.post<GoodsReceipt>(
          `${API_PREFIX}/purchase-orders/${encodeURIComponent(id)}/receipts`,
          body,
        ),
    },
    /** PUR-004 goods received notes. */
    goodsReceipts: {
      list: (params: GoodsReceiptListParams = {}, signal?: AbortSignal) =>
        client.get<Paginated<GoodsReceipt>>(`${API_PREFIX}/goods-receipts`, {
          query: { ...params },
          signal,
        }),
      get: (id: string, signal?: AbortSignal) =>
        client.get<GoodsReceipt>(`${API_PREFIX}/goods-receipts/${encodeURIComponent(id)}`, {
          signal,
        }),
    },
    /** REC-001/004 kitchen ingredients (stock-only products). */
    ingredients: {
      list: (params: IngredientListParams = {}, signal?: AbortSignal) =>
        client.get<Ingredient[]>(`${API_PREFIX}/ingredients`, { query: { ...params }, signal }),
      get: (id: string, locationId?: string, signal?: AbortSignal) =>
        client.get<Ingredient>(`${API_PREFIX}/ingredients/${encodeURIComponent(id)}`, {
          query: { locationId },
          signal,
        }),
      create: (body: IngredientRequest) =>
        client.post<Ingredient>(`${API_PREFIX}/ingredients`, body),
      update: (id: string, body: IngredientRequest) =>
        client.patch<Ingredient>(`${API_PREFIX}/ingredients/${encodeURIComponent(id)}`, body),
    },
    /** REC-002/003 one recipe per dish; REC-004 planning inputs. */
    recipes: {
      list: (locationId?: string, signal?: AbortSignal) =>
        client.get<RecipeListResponse>(`${API_PREFIX}/recipes`, { query: { locationId }, signal }),
      get: (productId: string, locationId?: string, signal?: AbortSignal) =>
        client.get<Recipe>(`${API_PREFIX}/recipes/${encodeURIComponent(productId)}`, {
          query: { locationId },
          signal,
        }),
      save: (productId: string, body: SaveRecipeRequest, locationId?: string) =>
        client.put<Recipe>(`${API_PREFIX}/recipes/${encodeURIComponent(productId)}`, body, {
          query: { locationId },
        }),
      planning: (locationId?: string, signal?: AbortSignal) =>
        client.get<RecipePlanning>(`${API_PREFIX}/recipe-planning`, {
          query: { locationId },
          signal,
        }),
    },
    /** REC-005 cooked food waiting to be resold. */
    preparedItems: {
      list: (params: PreparedItemListParams = {}, signal?: AbortSignal) =>
        client.get<PreparedItem[]>(`${API_PREFIX}/prepared-items`, {
          query: { ...params },
          signal,
        }),
      create: (body: CreatePreparedItemRequest) =>
        client.post<PreparedItem>(`${API_PREFIX}/prepared-items`, body),
      dispose: (id: string, body: DisposePreparedItemRequest) =>
        client.post<PreparedItem>(
          `${API_PREFIX}/prepared-items/${encodeURIComponent(id)}/dispose`,
          body,
        ),
    },
    /** BAK-001…005 bakery production (FLOW-BAK-001). */
    production: {
      summary: (locationId?: string, signal?: AbortSignal) =>
        client.get<ProductionSummary>(`${API_PREFIX}/production/summary`, {
          query: { locationId },
          signal,
        }),
      formulas: (locationId?: string, signal?: AbortSignal) =>
        client.get<ProductionFormula[]>(`${API_PREFIX}/production/formulas`, {
          query: { locationId },
          signal,
        }),
      plans: {
        list: (params: ProductionPlanListParams = {}, signal?: AbortSignal) =>
          client.get<ProductionPlan[]>(`${API_PREFIX}/production/plans`, {
            query: { ...params },
            signal,
          }),
        get: (id: string, signal?: AbortSignal) =>
          client.get<ProductionPlan>(`${API_PREFIX}/production/plans/${encodeURIComponent(id)}`, {
            signal,
          }),
        create: (body: ProductionPlanRequest) =>
          client.post<ProductionPlan>(`${API_PREFIX}/production/plans`, body),
        update: (id: string, body: ProductionPlanRequest) =>
          client.put<ProductionPlan>(
            `${API_PREFIX}/production/plans/${encodeURIComponent(id)}`,
            body,
          ),
        /** DRAFT → CONFIRMED: one PLANNED batch per line. */
        confirm: (id: string) =>
          client.post<ProductionPlan>(
            `${API_PREFIX}/production/plans/${encodeURIComponent(id)}/confirm`,
          ),
        cancel: (id: string, body: CancelProductionRequest) =>
          client.post<ProductionPlan>(
            `${API_PREFIX}/production/plans/${encodeURIComponent(id)}/cancel`,
            body,
          ),
      },
      batches: {
        list: (params: ProductionBatchListParams = {}, signal?: AbortSignal) =>
          client.get<ProductionBatch[]>(`${API_PREFIX}/production/batches`, {
            query: { ...params },
            signal,
          }),
        get: (id: string, signal?: AbortSignal) =>
          client.get<ProductionBatchDetail>(
            `${API_PREFIX}/production/batches/${encodeURIComponent(id)}`,
            { signal },
          ),
        /** PLANNED → IN_PROGRESS: posts PRODUCTION_CONSUMPTION for the raw materials. */
        start: (id: string, body: StartBatchRequest = {}) =>
          client.post<ProductionBatchDetail>(
            `${API_PREFIX}/production/batches/${encodeURIComponent(id)}/start`,
            body,
          ),
        /** IN_PROGRESS → COMPLETED: PRODUCTION_OUTPUT, then rejects as WASTAGE. */
        complete: (id: string, body: CompleteBatchRequest) =>
          client.post<ProductionBatchDetail>(
            `${API_PREFIX}/production/batches/${encodeURIComponent(id)}/complete`,
            body,
          ),
        cancel: (id: string, body: CancelProductionRequest) =>
          client.post<ProductionBatchDetail>(
            `${API_PREFIX}/production/batches/${encodeURIComponent(id)}/cancel`,
            body,
          ),
      },
      finishedGoods: (locationId?: string, signal?: AbortSignal) =>
        client.get<FinishedGoodsItem[]>(`${API_PREFIX}/production/finished-goods`, {
          query: { locationId },
          signal,
        }),
      wastage: {
        list: (params: WastageListParams = {}, signal?: AbortSignal) =>
          client.get<WastageListResponse>(`${API_PREFIX}/production/wastage`, {
            query: { ...params },
            signal,
          }),
        /** Write off finished goods (PIN + reason). */
        create: (body: CreateWastageRequest) =>
          client.post<WastageEntry>(`${API_PREFIX}/production/wastage`, body),
      },
    },
    /** REP-001…005 (REP-006 is `audit.list`). */
    reports: {
      sales: (params: ReportParams = {}, signal?: AbortSignal) =>
        client.get<SalesSummaryReport>(`${API_PREFIX}/reports/sales`, {
          query: { ...params },
          signal,
        }),
      products: (params: ProductSalesParams = {}, signal?: AbortSignal) =>
        client.get<ProductSalesReport>(`${API_PREFIX}/reports/products`, {
          query: { ...params },
          signal,
        }),
      locations: (params: ReportParams = {}, signal?: AbortSignal) =>
        client.get<LocationSalesReport>(`${API_PREFIX}/reports/locations`, {
          query: { ...params },
          signal,
        }),
      stock: (params: StockReportParams = {}, signal?: AbortSignal) =>
        client.get<StockReport>(`${API_PREFIX}/reports/stock`, { query: { ...params }, signal }),
      voids: (params: ReportParams = {}, signal?: AbortSignal) =>
        client.get<VoidsReport>(`${API_PREFIX}/reports/voids`, { query: { ...params }, signal }),
    },
    /** HR-001…006 staff. */
    staff: {
      employees: {
        list: (params: EmployeeListParams = {}, signal?: AbortSignal) =>
          client.get<EmployeeView[]>(`${API_PREFIX}/staff/employees`, {
            query: { ...params },
            signal,
          }),
        get: (id: string, signal?: AbortSignal) =>
          client.get<EmployeeView>(`${API_PREFIX}/staff/employees/${encodeURIComponent(id)}`, {
            signal,
          }),
        create: (body: EmployeeRequest) =>
          client.post<EmployeeView>(`${API_PREFIX}/staff/employees`, body),
        update: (id: string, body: EmployeeRequest) =>
          client.put<EmployeeView>(`${API_PREFIX}/staff/employees/${encodeURIComponent(id)}`, body),
      },
      attendance: {
        /** HR-003 day sheet (one row per employee at the location). */
        day: (params: AttendanceParams = {}, signal?: AbortSignal) =>
          client.get<AttendanceRow[]>(`${API_PREFIX}/staff/attendance`, {
            query: { ...params },
            signal,
          }),
        /** One employee's records, newest first. */
        history: (employeeId: string, signal?: AbortSignal) =>
          client.get<AttendanceRecord[]>(`${API_PREFIX}/staff/attendance/history`, {
            query: { employeeId },
            signal,
          }),
        /** Clock in or out with the employee's PIN (toggles). */
        clock: (body: ClockRequest) =>
          client.post<ClockResponse>(`${API_PREFIX}/staff/attendance/clock`, body),
      },
      roster: {
        get: (locationId: string, weekStart: string, signal?: AbortSignal) =>
          client.get<RosterWeek>(`${API_PREFIX}/staff/roster`, {
            query: { locationId, weekStart },
            signal,
          }),
        assign: (body: RosterAssignRequest) =>
          client.put<RosterWeek>(`${API_PREFIX}/staff/roster`, body),
      },
      cashShifts: {
        list: (locationId?: string, signal?: AbortSignal) =>
          client.get<CashShift[]>(`${API_PREFIX}/staff/cash-shifts`, {
            query: { locationId },
            signal,
          }),
        /** The open shift on this device (X-Device-Id), if any. */
        current: (signal?: AbortSignal) =>
          client.get<CashShift | null>(`${API_PREFIX}/staff/cash-shifts/current`, { signal }),
        open: (body: OpenCashShiftRequest) =>
          client.post<CashShift>(`${API_PREFIX}/staff/cash-shifts`, body),
        event: (id: string, body: CashShiftEventRequest) =>
          client.post<CashShift>(
            `${API_PREFIX}/staff/cash-shifts/${encodeURIComponent(id)}/events`,
            body,
          ),
        close: (id: string, body: CloseCashShiftRequest) =>
          client.post<CashShift>(
            `${API_PREFIX}/staff/cash-shifts/${encodeURIComponent(id)}/close`,
            body,
          ),
      },
      meals: {
        list: (params: StaffMealListParams = {}, signal?: AbortSignal) =>
          client.get<StaffMeal[]>(`${API_PREFIX}/staff/meals`, { query: { ...params }, signal }),
        /** No payment; stock moves as STAFF_MEAL (§22). */
        create: (body: StaffMealRequest) =>
          client.post<StaffMeal>(`${API_PREFIX}/staff/meals`, body),
      },
      /** HR-006 §23 for a month (YYYY-MM). */
      allowance: (month?: string, signal?: AbortSignal) =>
        client.get<FoodAllowanceResponse>(`${API_PREFIX}/staff/allowance`, {
          query: { month },
          signal,
        }),
    },
    /** DEL-001…004 delivery orders at the current location. */
    deliveries: {
      list: (params: DeliveryListParams = {}, signal?: AbortSignal) =>
        client.get<Order[]>(`${API_PREFIX}/deliveries`, { query: { ...params }, signal }),
      get: (id: string, signal?: AbortSignal) =>
        client.get<Order>(`${API_PREFIX}/deliveries/${encodeURIComponent(id)}`, { signal }),
      riders: (signal?: AbortSignal) =>
        client.get<DeliveryRider[]>(`${API_PREFIX}/delivery-riders`, { signal }),
    },
    /** WHO-001…006 wholesale / field sales (FLOW-WHO-001). */
    wholesale: {
      routes: {
        list: (signal?: AbortSignal) =>
          client.get<WholesaleRoute[]>(`${API_PREFIX}/wholesale/routes`, { signal }),
        /** WHO-006 one route on one day (YYYY-MM-DD, default today). */
        overview: (id: string, date?: string, signal?: AbortSignal) =>
          client.get<RouteOverview>(
            `${API_PREFIX}/wholesale/routes/${encodeURIComponent(id)}/overview`,
            { query: { date }, signal },
          ),
      },
      shops: {
        list: (params: WholesaleShopListParams = {}, signal?: AbortSignal) =>
          client.get<WholesaleShopListResponse>(`${API_PREFIX}/wholesale/shops`, {
            query: { ...params },
            signal,
          }),
        get: (id: string, signal?: AbortSignal) =>
          client.get<WholesaleShop>(`${API_PREFIX}/wholesale/shops/${encodeURIComponent(id)}`, {
            signal,
          }),
        create: (body: WholesaleShopRequest) =>
          client.post<WholesaleShop>(`${API_PREFIX}/wholesale/shops`, body),
        update: (id: string, body: WholesaleShopRequest) =>
          client.put<WholesaleShop>(
            `${API_PREFIX}/wholesale/shops/${encodeURIComponent(id)}`,
            body,
          ),
        /** WHO-002 statement. */
        ledger: (id: string, signal?: AbortSignal) =>
          client.get<ShopLedgerEntry[]>(
            `${API_PREFIX}/wholesale/shops/${encodeURIComponent(id)}/ledger`,
            { signal },
          ),
      },
      /** Wholesale prices with stock in a van. */
      products: (locationId?: string, signal?: AbortSignal) =>
        client.get<WholesaleProduct[]>(`${API_PREFIX}/wholesale/products`, {
          query: { locationId },
          signal,
        }),
      invoices: {
        list: (params: WholesaleInvoiceListParams = {}, signal?: AbortSignal) =>
          client.get<WholesaleInvoice[]>(`${API_PREFIX}/wholesale/invoices`, {
            query: { ...params },
            signal,
          }),
        get: (id: string, signal?: AbortSignal) =>
          client.get<WholesaleInvoice>(
            `${API_PREFIX}/wholesale/invoices/${encodeURIComponent(id)}`,
            { signal },
          ),
        /** Posts SALE from the van; the unpaid part goes on the shop's balance. */
        create: (body: WholesaleInvoiceRequest) =>
          client.post<WholesaleInvoice>(`${API_PREFIX}/wholesale/invoices`, body),
        share: (id: string, body: ShareInvoiceRequest) =>
          client.post<WholesaleInvoice>(
            `${API_PREFIX}/wholesale/invoices/${encodeURIComponent(id)}/share`,
            body,
          ),
        print: (id: string) =>
          client.post<WholesaleInvoice>(
            `${API_PREFIX}/wholesale/invoices/${encodeURIComponent(id)}/print`,
          ),
      },
      collections: {
        list: (params: WholesaleCollectionListParams = {}, signal?: AbortSignal) =>
          client.get<WholesaleCollection[]>(`${API_PREFIX}/wholesale/collections`, {
            query: { ...params },
            signal,
          }),
        create: (body: WholesaleCollectionRequest) =>
          client.post<WholesaleCollection>(`${API_PREFIX}/wholesale/collections`, body),
      },
      returns: {
        list: (params: WholesaleReturnListParams = {}, signal?: AbortSignal) =>
          client.get<WholesaleReturn[]>(`${API_PREFIX}/wholesale/returns`, {
            query: { ...params },
            signal,
          }),
        get: (id: string, signal?: AbortSignal) =>
          client.get<WholesaleReturnDetail>(
            `${API_PREFIX}/wholesale/returns/${encodeURIComponent(id)}`,
            { signal },
          ),
        /** PIN + reason; GOOD goes back into van stock, the rest RETURN then WASTAGE. */
        create: (body: WholesaleReturnRequest) =>
          client.post<WholesaleReturnDetail>(`${API_PREFIX}/wholesale/returns`, body),
      },
    },
    /** KOT-001…004 kitchen tickets at the current location. */
    kots: {
      list: (params: KotListParams = {}, signal?: AbortSignal) =>
        client.get<Kot[]>(`${API_PREFIX}/kots`, { query: { ...params }, signal }),
      get: (id: string, signal?: AbortSignal) =>
        client.get<Kot>(`${API_PREFIX}/kots/${encodeURIComponent(id)}`, { signal }),
      start: (id: string) => client.post<Kot>(`${API_PREFIX}/kots/${encodeURIComponent(id)}/start`),
      ready: (id: string) => client.post<Kot>(`${API_PREFIX}/kots/${encodeURIComponent(id)}/ready`),
      complete: (id: string) =>
        client.post<Kot>(`${API_PREFIX}/kots/${encodeURIComponent(id)}/complete`),
    },
    pos: {
      /** Tax/service settings for the current location (X-Location-Id). */
      settings: (signal?: AbortSignal) =>
        client.get<PosSettings>(`${API_PREFIX}/pos-settings`, { signal }),
      chargeTypes: (signal?: AbortSignal) =>
        client.get<ChargeType[]>(`${API_PREFIX}/charge-types`, { signal }),
      promotions: (signal?: AbortSignal) =>
        client.get<Promotion[]>(`${API_PREFIX}/promotions`, { signal }),
      /** Open the cash drawer outside a sale (PIN + reason, audited). */
      openDrawer: (body: DrawerEventRequest) =>
        client.post<{ id: string; openedAt: string }>(`${API_PREFIX}/pos/drawer-events`, body),
      adjustments: {
        /** Approve + audit a discount/charge before it affects the draft sale. */
        create: (body: CreateAdjustmentRequest) =>
          client.post<SaleAdjustment>(`${API_PREFIX}/pos/adjustments`, body),
        /** Remove = void (never deleted); audited. */
        void: (id: string, body: VoidAdjustmentRequest = {}) =>
          client.post<SaleAdjustment>(
            `${API_PREFIX}/pos/adjustments/${encodeURIComponent(id)}/void`,
            body,
          ),
      },
    },
    dashboard: {
      summary: (signal?: AbortSignal) =>
        client.get<DashboardSummary>(`${API_PREFIX}/dashboard/summary`, { signal }),
    },
    catalog: {
      categories: {
        list: (params: CategoryListParams = {}, signal?: AbortSignal) =>
          client.get<Paginated<Category>>(`${API_PREFIX}/categories`, {
            query: { ...params },
            signal,
          }),
        /** Every category in depth-first order with depth/path/counts (not paginated). */
        tree: (params: CategoryTreeParams = {}, signal?: AbortSignal) =>
          client.get<CategoryTreeNode[]>(`${API_PREFIX}/categories`, {
            query: { ...params, tree: true },
            signal,
          }),
        create: (body: CreateCategoryRequest) =>
          client.post<Category>(`${API_PREFIX}/categories`, body),
        update: (id: string, body: UpdateCategoryRequest) =>
          client.patch<Category>(`${API_PREFIX}/categories/${encodeURIComponent(id)}`, body),
      },
      products: {
        list: (params: ProductListParams = {}, signal?: AbortSignal) =>
          client.get<Paginated<Product>>(`${API_PREFIX}/products`, {
            query: { ...params },
            signal,
          }),
        get: (id: string, signal?: AbortSignal) =>
          client.get<Product>(`${API_PREFIX}/products/${encodeURIComponent(id)}`, { signal }),
        create: (body: CreateProductRequest) =>
          client.post<Product>(`${API_PREFIX}/products`, body),
        update: (id: string, body: UpdateProductRequest) =>
          client.patch<Product>(`${API_PREFIX}/products/${encodeURIComponent(id)}`, body),
      },
      /** Sellable items at the current location (X-Location-Id), for the POS Quick Pad. */
      locationProducts: {
        list: (params: LocationProductListParams = {}, signal?: AbortSignal) =>
          client.get<LocationProduct[]>(`${API_PREFIX}/location-products`, {
            query: { ...params },
            signal,
          }),
        /** Upsert: switching a product on for a location creates its row; off never deletes. */
        update: (productId: string, locationId: string, body: UpdateLocationProductRequest) =>
          client.put<LocationProduct>(
            `${API_PREFIX}/location-products/${encodeURIComponent(productId)}`,
            body,
            { query: { locationId } },
          ),
      },
      prices: {
        matrix: (params: PriceMatrixParams = {}, signal?: AbortSignal) =>
          client.get<PriceMatrix>(`${API_PREFIX}/price-matrix`, { query: { ...params }, signal }),
        update: (body: UpdatePricesRequest) =>
          client.put<UpdatePricesResponse>(`${API_PREFIX}/price-matrix`, body),
      },
      quickPad: {
        /** Resolved layout: device → location → default. */
        get: (locationId: string, deviceId?: string | null, signal?: AbortSignal) =>
          client.get<QuickPadLayout>(`${API_PREFIX}/quick-pad-layout`, {
            query: { locationId, deviceId },
            signal,
          }),
        update: (locationId: string, body: UpdateQuickPadLayoutRequest, deviceId?: string | null) =>
          client.put<QuickPadLayout>(`${API_PREFIX}/quick-pad-layout`, body, {
            query: { locationId, deviceId },
          }),
        /** Drop a device's own layout so it follows the location layout again. */
        resetDevice: (locationId: string, deviceId: string) =>
          client.delete<QuickPadLayout>(`${API_PREFIX}/quick-pad-layout`, {
            query: { locationId, deviceId },
          }),
      },
      kitchenStations: {
        list: (locationId: string, signal?: AbortSignal) =>
          client.get<KitchenStation[]>(`${API_PREFIX}/kitchen-stations`, {
            query: { locationId },
            signal,
          }),
      },
    },
  };
}

export type RbpApi = ReturnType<typeof createRbpApi>;
