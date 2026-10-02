import type {
  AuditEvent,
  ChargeType,
  Customer,
  CustomerPayment,
  StockAdjustment,
  StockMovement,
  StockTransfer,
  GoodsReceipt,
  PurchaseOrder,
  Supplier,
  PreparedItem,
  AttendanceRecord,
  CashShift,
  ShiftTemplate,
  StaffMeal,
  WholesaleCollection,
  WholesaleInvoice,
  WholesaleReturn,
  WholesaleRoute,
  WholesaleShop,
  ProductionBatch,
  ProductionFormulaLine,
  ProductionPlan,
  RecipeLine,
  Kot,
  Order,
  Device,
  Employee,
  FeatureCode,
  LimitCode,
  Location,
  Permission,
  PaymentMethodSetting,
  PosSettings,
  Promotion,
  Reason,
  SensitiveActionCode,
  SaleAdjustment,
  Role,
  Tenant,
  TenantUser,
  User,
} from '@rbp/types';
import { PERMISSIONS } from '@rbp/types';
import { type CatalogSeed, createCatalogSeed } from './catalog-seed';
import { seedCustomerHistory } from './customer-history-seed';
import { seedInventory } from './inventory-seed';
import { seedPurchasing } from './purchasing-seed';
import { seedProduction, seedProductionMaterials } from './production-seed';
import { seedDeliveries } from './delivery-seed';
import { seedReportHistory } from './report-history-seed';
import { seedStaff } from './staff-seed';
import { seedWholesale } from './wholesale-seed';
import { seedPreparedItems, seedRecipes } from './recipe-seed';
import { createCustomerSeed } from './customer-seed';

/**
 * Deterministic seed for the prototype. IDs are fixed so links, screenshots and
 * demo scripts stay stable across resets. MOCK ONLY — real credentials are never stored like this.
 */

export interface MockUserRecord extends User {
  /** Demo-only plaintext password. */
  password: string;
}

export interface MockEmployeeRecord extends Employee {
  /** Demo-only plaintext PIN. */
  pin: string;
}

export interface MockDb extends CatalogSeed {
  version: number;
  tenants: Tenant[];
  features: Record<string, FeatureCode[]>;
  limits: Record<string, Partial<Record<LimitCode, number>>>;
  locations: Location[];
  users: MockUserRecord[];
  roles: Role[];
  tenantUsers: TenantUser[];
  employees: MockEmployeeRecord[];
  devices: Device[];
  /** Failed PIN attempts per employee (lockout demo). */
  pinFailures: Record<string, number>;
  /** Lockout expiry (ISO) per tenant:device once the attempts run out. Optional: older saved demos lack it. */
  pinLocks?: Record<string, string>;
  /** Tenant-configured reasons (REQ-268…287). */
  reasons: Record<string, Reason[]>;
  /** Issued employee verifications; sensitive writes must present a live, unused one. */
  verifications: MockVerificationRecord[];
  /** Append-only audit trail. */
  auditLog: AuditEvent[];
  /** Tax / service charge per location. */
  posSettings: PosSettings[];
  customers: Customer[];
  /** POS-005 charge types per location. */
  chargeTypes: Record<string, ChargeType[]>;
  /** SET-006 payment methods per tenant (business-wide). */
  paymentMethods: Record<string, PaymentMethodSetting[]>;
  /** SET-005 simulated pairing: activation code per device, and whether it has been used. */
  deviceActivation: Record<string, { code: string; paired: boolean }>;
  /** POS-004 promotions per tenant. */
  promotions: Record<string, Promotion[]>;
  /** Approved discounts/charges (never deleted; voided instead). */
  adjustments: (SaleAdjustment & { tenantId: string; orderId?: string })[];
  /** Saved sales (POS-008…012). */
  orders: (Order & { tenantId: string })[];
  /** INV-* stock ledger: on hand = Σ movements per (product, location). */
  stockMovements: (StockMovement & { tenantId: string })[];
  /** Minimum stock per `${productId}:${locationId}` (low-stock alerts). */
  stockSettings: Record<string, { minStock: number }>;
  stockAdjustments: (StockAdjustment & { tenantId: string })[];
  stockTransfers: (StockTransfer & { tenantId: string })[];
  /** PUR-* (supplier summary fields are derived, not stored). */
  suppliers: SupplierRecord[];
  purchaseOrders: (PurchaseOrder & { tenantId: string })[];
  goodsReceipts: (GoodsReceipt & { tenantId: string })[];
  /** REC-002/003, one per dish (prototype shape). */
  recipes: RecipeRecord[];
  /** REC-005; EXPIRED is derived from `expiresAt`. */
  preparedItems: PreparedRecord[];
  /** BAK: what one batch run of a bakery product uses and yields (seeded). */
  productionFormulas: ProductionFormulaRecord[];
  /** BAK-002 (progress is derived from the batches). */
  productionPlans: ProductionPlanRecord[];
  /** BAK-003 (on hand in the consumption lines is derived). */
  productionBatches: ProductionBatchRecord[];
  /** WHO-006 routes (shop counts are derived). */
  wholesaleRoutes: (Omit<WholesaleRoute, 'shopCount'> & { tenantId: string })[];
  /** WHO-001/002 (balances are derived from the documents below). */
  wholesaleShops: WholesaleShopRecord[];
  /** WHO-003 (balance/status are derived from allocations). */
  wholesaleInvoices: WholesaleInvoiceRecord[];
  wholesaleCollections: (WholesaleCollection & { tenantId: string })[];
  wholesaleReturns: (WholesaleReturn & { tenantId: string })[];
  /** Wholesale price (minor units, VAT inclusive) per tenant → product. */
  wholesalePrices: Record<string, Record<string, number>>;
  /** HR-004 work shifts (Morning, Evening…). */
  shiftTemplates: (ShiftTemplate & { tenantId: string })[];
  /** HR-004 roster: who works which shift where on which day. */
  rosterAssignments: {
    id: string;
    tenantId: string;
    locationId: string;
    employeeId: string;
    date: string;
    templateId: string;
  }[];
  /** HR-003 clock-ins (minutes and names are derived). */
  attendance: (Omit<AttendanceRecord, 'minutes' | 'employeeName' | 'locationName'> & {
    tenantId: string;
  })[];
  /** HR-004 cash-drawer shifts (cash totals are derived from the till). */
  cashShifts: CashShiftRecord[];
  /** HR-005 §22 */
  staffMeals: (StaffMeal & { tenantId: string })[];
  /** CUS-005 money received against customer accounts. */
  customerPayments: (CustomerPayment & { tenantId: string })[];
  /** CUS-005 balance brought forward from the previous system, per customer. */
  customerOpeningBalances: Record<string, { amount: number; at: string }>;
  /** Next invoice / return number per location, e.g. { 'loc_01MAIN': 12 }. */
  orderSequences: Record<string, number>;
  /** REST-001 tables (state is derived from open orders). */
  restaurantTables: {
    id: string;
    tenantId: string;
    locationId: string;
    name: string;
    area: string;
    seats: number;
  }[];
  /** KOT-001…004 kitchen tickets. */
  kots: (Kot & { tenantId: string })[];
}

export type SupplierRecord = Omit<Supplier, 'openOrders' | 'lastOrderAt' | 'totalReceived'> & {
  tenantId: string;
};

export interface RecipeRecord {
  tenantId: string;
  productId: string;
  lines: RecipeLine[];
  isActive: boolean;
  note?: string;
  updatedAt: string;
  updatedBy: string;
}

export type CashShiftRecord = Omit<
  CashShift,
  'cashSales' | 'cashRefunds' | 'expectedCash' | 'variance'
> & { tenantId: string };

export type WholesaleShopRecord = Omit<
  WholesaleShop,
  'outstanding' | 'overdue' | 'overLimit' | 'lastVisitAt'
> & {
  tenantId: string;
  /** Owed before the system started (minor units). */
  openingBalance: number;
  openingAt: string;
};

export type WholesaleInvoiceRecord = Omit<WholesaleInvoice, 'balance' | 'status'> & {
  tenantId: string;
};

export interface ProductionFormulaRecord {
  tenantId: string;
  productId: string;
  yieldQuantity: number;
  lines: ProductionFormulaLine[];
}

export type ProductionPlanRecord = Omit<ProductionPlan, 'progress'> & { tenantId: string };

export type ProductionBatchRecord = Omit<ProductionBatch, 'consumption'> & {
  tenantId: string;
  consumption: { ingredientId: string; plannedQuantity: number; actualQuantity: number | null }[];
};

export type PreparedRecord = Omit<PreparedItem, 'status'> & {
  tenantId: string;
  status: 'AVAILABLE' | 'USED' | 'DISPOSED';
};

export interface MockVerificationRecord {
  id: string;
  tenantId: Tenant['id'];
  employeeId: Employee['id'];
  action: SensitiveActionCode;
  expiresAt: string;
  usedAt: string | null;
}

/** Reason groups by sensitive action (REQ-268…287). Empty = offered for every action. */
const ITEM = ['pos.item.quantity.decrease', 'pos.item.remove', 'pos.order.cancel'];
const RETURN = ['pos.return', 'pos.refund'];
const VOID = ['pos.invoice.void'];
/** BAK: batch rejects and finished goods written off. */
const BAKE = ['production.wastage'];
/** WHO: goods a shop gives back. */
const WHO = ['wholesale.return'];

/** Default reasons from REQ-275…285 (+ drawer and discount reasons); tenants can configure their own. */
const DEFAULT_REASONS: Reason[] = (
  [
    ['CUSTOMER_CHANGED', 'Customer changed order', [...ITEM, ...RETURN, ...VOID]],
    ['CUSTOMER_RETURNED', 'Customer returned item', RETURN],
    ['WRONG_ITEM_SOLD', 'Wrong item sold', [...RETURN, ...VOID]],
    ['PAYMENT_ERROR', 'Payment error', [...VOID, 'pos.refund']],
    ['DUPLICATE_SALE', 'Duplicate sale', [...VOID, 'pos.order.cancel']],
    ['CUSTOMER_REQUEST', 'Customer request', ['restaurant.table.transfer']],
    ['CUSTOMER_CANCELLED', 'Customer cancelled item', ITEM],
    ['WRONG_ITEM', 'Wrong item entered', [...ITEM, ...RETURN]],
    ['WRONG_QTY', 'Wrong quantity entered', ITEM],
    ['KITCHEN_MISTAKE', 'Kitchen mistake', [...ITEM, 'pos.discount.apply']],
    ['UNAVAILABLE', 'Product unavailable', ITEM],
    [
      'DAMAGED',
      'Damaged item',
      [...RETURN, 'inventory.adjust', 'pos.discount.apply', ...BAKE, ...WHO],
    ],
    ['STOCK_COUNT', 'Stock count difference', ['inventory.adjust']],
    ['EXPIRED', 'Expired', ['inventory.adjust', ...BAKE, ...WHO]],
    ['SPOILED', 'Spoiled / not fit to sell', ['inventory.adjust', ...BAKE, ...WHO]],
    ['UNSOLD', 'Unsold, taken back', WHO],
    ['BURNT', 'Burnt / over-baked', BAKE],
    ['UNDERBAKED', 'Under-baked', BAKE],
    ['MISSHAPEN', 'Misshapen / not fit to sell', BAKE],
    ['FOUND', 'Found in store / miscount', ['inventory.adjust']],
    ['STAFF_MEAL', 'Staff meal', ['inventory.adjust', 'staff.meal']],
    ['MEAL_BREAK', 'Meal on shift', ['staff.meal']],
    ['COMPLAINT', 'Customer complaint', ['pos.discount.apply', 'pos.charge.manage', ...RETURN]],
    ['LOYAL_CUSTOMER', 'Loyal customer', ['pos.discount.apply']],
    [
      'PRICE_CORRECTION',
      'Price correction',
      ['pos.price.override', 'pos.charge.manage', 'pos.discount.apply'],
    ],
    ['DUPLICATE', 'Duplicate entry', [...ITEM, 'pos.charge.manage']],
    ['CHANGE_FOR_CUSTOMER', 'Change for customer', ['pos.drawer.open']],
    ['CASH_PICKUP', 'Cash pickup', ['pos.drawer.open']],
    ['SHIFT_COUNT', 'Shift count', ['pos.drawer.open']],
    ['MANAGER_INSTRUCTION', 'Manager instruction', []],
    ['OTHER', 'Other', []],
  ] as [string, string, string[]][]
).map(([code, label, appliesTo]) => ({
  code,
  label,
  requiresComment: code === 'OTHER',
  ...(appliesTo.length ? { appliesTo } : {}),
}));

/** Bump whenever the seed shape changes so persisted demo databases reseed. */
export const DB_VERSION = 25;
export const DEMO_PASSWORD = 'demo1234';

const id = <T extends string>(value: string) => value as T;

const T1 = id<Tenant['id']>('ten_01PILOT');
const T2 = id<Tenant['id']>('ten_02GROCERY');

const L = {
  main: id<Location['id']>('loc_01MAIN'),
  bakery: id<Location['id']>('loc_01BAKERY'),
  store: id<Location['id']>('loc_01STORE'),
  van: id<Location['id']>('loc_01VAN1'),
  grocery: id<Location['id']>('loc_02TOWN'),
};

const ALL: Permission[] = [...PERMISSIONS];

const MANAGER: Permission[] = ALL.filter((p) => p !== 'settings.manage');

const CASHIER: Permission[] = [
  'dashboard.view',
  'pos.sale.create',
  'pos.drawer.open',
  // DEL: the counter dispatches deliveries.
  'delivery.manage',
  'catalog.view',
  'customer.view',
  'customer.manage',
  'inventory.view',
];

const WAITER: Permission[] = [
  'dashboard.view',
  'pos.sale.create',
  'restaurant.table.manage',
  'kot.view',
  'catalog.view',
  'customer.view',
];

const KITCHEN: Permission[] = ['kot.view', 'kot.manage', 'inventory.view'];

/** DEL: takes assigned deliveries out and hands them over (collects payment at the door). */
const DELIVERY_RIDER: Permission[] = ['dashboard.view', 'delivery.deliver'];

/** WHO: sells from the van to external shops. */
const FIELD_SALES: Permission[] = [
  'dashboard.view',
  'wholesale.manage',
  'inventory.view',
  'inventory.transfer',
];

function roles(
  tenantId: Tenant['id'],
  prefix: string,
  defs: [string, string, Permission[]][],
): Role[] {
  return defs.map(([code, name, permissions]) => ({
    id: id<Role['id']>(`rol_${prefix}_${code}`),
    tenantId,
    code,
    name,
    permissions,
    ...(code === 'OWNER' ? { locked: true } : {}),
  }));
}

export function createSeed(): MockDb {
  const tenants: Tenant[] = [
    {
      id: T1,
      code: 'T001',
      name: 'Pilot Foods & Bakery',
      status: 'ACTIVE',
      currency: 'LKR',
      defaultLanguage: 'en',
      timezone: 'Asia/Colombo',
      branding: { logoText: 'PF' },
      phone: '+94 11 234 5678',
      languages: ['en', 'ta', 'si'],
    },
    {
      id: T2,
      code: 'T002',
      name: 'Demo Grocery',
      status: 'TRIAL',
      currency: 'LKR',
      defaultLanguage: 'en',
      timezone: 'Asia/Colombo',
      branding: { logoText: 'DG', primaryColor: 'oklch(0.56 0.15 155)' },
      languages: ['en', 'si'],
    },
  ];

  const locations: Location[] = [
    {
      id: L.main,
      tenantId: T1,
      code: 'MAIN',
      name: 'Main Restaurant',
      type: 'RESTAURANT',
      address: '42 Hospital Road',
      isActive: true,
    },
    {
      id: L.bakery,
      tenantId: T1,
      code: 'BAK',
      name: 'Bakery Outlet',
      type: 'BAKERY',
      address: '7 Market Street',
      isActive: true,
    },
    {
      id: L.store,
      tenantId: T1,
      code: 'CST',
      name: 'Central Store',
      type: 'WAREHOUSE',
      address: '15 Industrial Lane',
      isActive: true,
    },
    {
      id: L.van,
      tenantId: T1,
      code: 'VAN1',
      name: 'Van 1',
      type: 'VAN',
      address: 'Field sales vehicle (WP CAB-1234)',
      isActive: true,
    },
    {
      id: L.grocery,
      tenantId: T2,
      code: 'TWN',
      name: 'Town Branch',
      type: 'RETAIL',
      address: '3 Station Road',
      isActive: true,
    },
  ];

  const allRoles: Role[] = [
    ...roles(T1, 'T1', [
      ['OWNER', 'Owner / Admin', ALL],
      ['MANAGER', 'Manager', MANAGER],
      ['CASHIER', 'Cashier', CASHIER],
      ['WAITER', 'Waiter', WAITER],
      ['KITCHEN', 'Kitchen', KITCHEN],
      ['FIELD_SALES', 'Field Sales Rep', FIELD_SALES],
      ['DELIVERY_RIDER', 'Delivery Rider', DELIVERY_RIDER],
    ]),
    ...roles(T2, 'T2', [
      ['OWNER', 'Owner / Admin', ALL],
      ['CASHIER', 'Cashier', CASHIER],
    ]),
  ];

  const users: MockUserRecord[] = [
    ['usr_01', 'owner@pilot.demo', 'Nirmala Rajan'],
    ['usr_02', 'manager@pilot.demo', 'Suresh Kumar'],
    ['usr_03', 'cashier@pilot.demo', 'Fathima Rizvi'],
    ['usr_04', 'waiter@pilot.demo', 'Kasun Perera'],
    ['usr_05', 'kitchen@pilot.demo', 'Arun Selvam'],
    ['usr_06', 'owner@grocery.demo', 'Dilani Fernando'],
    ['usr_07', 'cashier@grocery.demo', 'Ravi Shankar'],
    ['usr_08', 'rep@pilot.demo', 'Dinesh Kumar'],
    ['usr_09', 'rider@pilot.demo', 'Sameera Bandara'],
  ].map(([uid, email, displayName]) => ({
    id: id<User['id']>(uid!),
    email: email!,
    displayName: displayName!,
    password: DEMO_PASSWORD,
  }));

  const emp = (
    tenantId: Tenant['id'],
    eid: string,
    code: string,
    fullName: string,
    jobTitle: string,
    pin: string,
    locationIds: Location['id'][],
  ): MockEmployeeRecord => ({
    id: id<Employee['id']>(eid),
    tenantId,
    code,
    fullName,
    jobTitle,
    pin,
    locationIds,
    isActive: true,
  });

  const employees: MockEmployeeRecord[] = [
    emp(T1, 'emp_01', 'E001', 'Nirmala Rajan', 'Owner', '1111', [L.main, L.bakery, L.store]),
    emp(T1, 'emp_02', 'E002', 'Suresh Kumar', 'Manager', '2222', [L.main, L.bakery]),
    emp(T1, 'emp_03', 'E003', 'Fathima Rizvi', 'Cashier', '3333', [L.main]),
    emp(T1, 'emp_04', 'E004', 'Kasun Perera', 'Waiter', '4444', [L.main]),
    emp(T1, 'emp_05', 'E005', 'Arun Selvam', 'Head Chef', '5555', [L.main]),
    emp(T1, 'emp_06', 'E006', 'Priya Nathan', 'Cashier', '6666', [L.bakery]),
    emp(T2, 'emp_07', 'E001', 'Dilani Fernando', 'Owner', '1111', [L.grocery]),
    emp(T2, 'emp_08', 'E002', 'Ravi Shankar', 'Cashier', '2222', [L.grocery]),
    emp(T1, 'emp_09', 'E007', 'Dinesh Kumar', 'Field Sales Rep', '7777', [L.van]),
    emp(T1, 'emp_10', 'E008', 'Sameera Bandara', 'Delivery Rider', '8888', [L.main]),
  ];

  const tu = (
    tuid: string,
    tenantId: Tenant['id'],
    userId: string,
    roleId: string,
    locationIds: Location['id'][],
    employeeId: string,
  ): TenantUser => ({
    id: id<TenantUser['id']>(tuid),
    tenantId,
    userId: id<User['id']>(userId),
    roleIds: [id<Role['id']>(roleId)],
    locationIds,
    employeeId: id<Employee['id']>(employeeId),
    status: 'ACTIVE',
  });

  const tenantUsers: TenantUser[] = [
    tu('tu_01', T1, 'usr_01', 'rol_T1_OWNER', [], 'emp_01'),
    tu('tu_02', T1, 'usr_02', 'rol_T1_MANAGER', [L.main, L.bakery], 'emp_02'),
    tu('tu_03', T1, 'usr_03', 'rol_T1_CASHIER', [L.main], 'emp_03'),
    tu('tu_04', T1, 'usr_04', 'rol_T1_WAITER', [L.main], 'emp_04'),
    tu('tu_05', T1, 'usr_05', 'rol_T1_KITCHEN', [L.main], 'emp_05'),
    tu('tu_06', T2, 'usr_06', 'rol_T2_OWNER', [], 'emp_07'),
    tu('tu_07', T2, 'usr_07', 'rol_T2_CASHIER', [L.grocery], 'emp_08'),
    tu('tu_08', T1, 'usr_08', 'rol_T1_FIELD_SALES', [L.van], 'emp_09'),
    tu('tu_09', T1, 'usr_09', 'rol_T1_DELIVERY_RIDER', [L.main], 'emp_10'),
  ];

  const dev = (
    did: string,
    tenantId: Tenant['id'],
    locationId: Location['id'],
    name: string,
    type: Device['type'],
  ): Device => ({
    id: id<Device['id']>(did),
    tenantId,
    locationId,
    name,
    type,
    isActive: true,
  });

  const devices: Device[] = [
    dev('dev_01', T1, L.main, 'Counter POS 1', 'POS_TERMINAL'),
    dev('dev_02', T1, L.main, 'Waiter Tablet 1', 'TABLET'),
    dev('dev_03', T1, L.main, 'Kitchen Display', 'KITCHEN_DISPLAY'),
    dev('dev_04', T1, L.bakery, 'Bakery POS', 'POS_TERMINAL'),
    dev('dev_05', T1, L.store, 'Store Back Office', 'BACK_OFFICE'),
    dev('dev_06', T2, L.grocery, 'Grocery POS 1', 'POS_TERMINAL'),
    dev('dev_07', T1, L.van, 'Van Tablet', 'TABLET'),
  ];

  const db: MockDb = {
    version: DB_VERSION,
    tenants,
    features: {
      [T1]: [
        'POS_RETAIL',
        'POS_RESTAURANT',
        'KOT',
        'TABLE_MANAGEMENT',
        'DELIVERY',
        'INVENTORY',
        'PURCHASING',
        'RECIPES',
        'BAKERY_PRODUCTION',
        'WHOLESALE',
        'FIELD_SALES',
        'HR',
        'ATTENDANCE',
      ],
      [T2]: ['POS_RETAIL', 'INVENTORY'],
    },
    limits: {
      [T1]: { locations: 10, devices: 30, users: 50 },
      [T2]: { locations: 1, devices: 2, users: 5 },
    },
    locations,
    users,
    roles: allRoles,
    tenantUsers,
    employees,
    devices,
    pinFailures: {},
    reasons: { [T1]: DEFAULT_REASONS, [T2]: DEFAULT_REASONS },
    verifications: [],
    auditLog: [],
    posSettings: [
      // Restaurant adds 10% service; everyone charges 18% VAT on tax-exclusive items.
      {
        locationId: L.main,
        serviceChargeBps: 1000,
        taxRateBps: 1800,
        taxLabel: 'VAT',
        maxDiscountBps: 5000,
        returnWindowDays: 30,
        receiptFooter: 'Thank you! Come again.',
        receiptPrinter: 'Receipt Printer',
      },
      {
        locationId: L.bakery,
        serviceChargeBps: 0,
        taxRateBps: 1800,
        taxLabel: 'VAT',
        maxDiscountBps: 5000,
        returnWindowDays: 30,
        receiptFooter: 'Thank you! Come again.',
        receiptPrinter: 'Counter Receipt',
      },
      {
        locationId: L.store,
        serviceChargeBps: 0,
        taxRateBps: 1800,
        taxLabel: 'VAT',
        maxDiscountBps: 5000,
        returnWindowDays: 30,
        receiptFooter: 'Thank you! Come again.',
        receiptPrinter: 'Receipt Printer',
      },
      {
        locationId: L.van,
        serviceChargeBps: 0,
        taxRateBps: 1800,
        taxLabel: 'VAT',
        maxDiscountBps: 0,
        returnWindowDays: 30,
        receiptFooter: 'Thank you for your business.',
        receiptPrinter: 'Receipt Printer',
      },
      {
        locationId: L.grocery,
        serviceChargeBps: 0,
        taxRateBps: 1800,
        taxLabel: 'VAT',
        maxDiscountBps: 5000,
        returnWindowDays: 30,
        receiptFooter: 'Thank you! Come again.',
        receiptPrinter: 'Receipt Printer',
      },
    ],
    customers: createCustomerSeed(),
    paymentMethods: Object.fromEntries(
      [T1, T2].map((t) => [
        t,
        (['CASH', 'CARD', 'BANK_TRANSFER', 'CREDIT'] as const).map((method) => ({
          method,
          enabled: true,
        })),
      ]),
    ),
    // Seeded devices are already paired; their codes only matter if re-issued.
    deviceActivation: Object.fromEntries(
      devices.map((d, i) => [d.id, { code: String(482913 + i * 7919).slice(-6), paired: true }]),
    ),
    chargeTypes: {
      [L.main]: [
        {
          code: 'SERVICE',
          name: 'Service charge',
          mode: 'PERCENT',
          defaultValue: 1000,
          automatic: true,
        },
        {
          code: 'DELIVERY',
          name: 'Delivery',
          mode: 'FIXED',
          defaultValue: 25000,
          automatic: false,
        },
        {
          code: 'PACKAGING',
          name: 'Packaging',
          mode: 'FIXED',
          defaultValue: 5000,
          automatic: false,
        },
        {
          code: 'OTHER',
          name: 'Other charge',
          mode: 'FIXED',
          defaultValue: null,
          automatic: false,
        },
      ],
      [L.bakery]: [
        {
          code: 'PACKAGING',
          name: 'Packaging',
          mode: 'FIXED',
          defaultValue: 3000,
          automatic: false,
        },
        {
          code: 'OTHER',
          name: 'Other charge',
          mode: 'FIXED',
          defaultValue: null,
          automatic: false,
        },
      ],
      [L.store]: [
        {
          code: 'OTHER',
          name: 'Other charge',
          mode: 'FIXED',
          defaultValue: null,
          automatic: false,
        },
      ],
      [L.grocery]: [
        {
          code: 'DELIVERY',
          name: 'Delivery',
          mode: 'FIXED',
          defaultValue: 30000,
          automatic: false,
        },
        {
          code: 'OTHER',
          name: 'Other charge',
          mode: 'FIXED',
          defaultValue: null,
          automatic: false,
        },
      ],
    },
    promotions: {
      [T1]: [
        {
          code: 'LOYALTY100',
          name: 'Loyalty Rs 100 off',
          mode: 'FIXED',
          value: 10000,
          scope: 'ORDER',
        },
        { code: 'HAPPYHOUR', name: 'Happy hour 15%', mode: 'PERCENT', value: 1500, scope: 'ORDER' },
        { code: 'STAFF20', name: 'Staff 20%', mode: 'PERCENT', value: 2000, scope: 'LINE' },
      ],
      [T2]: [{ code: 'BULK5', name: 'Bulk 5%', mode: 'PERCENT', value: 500, scope: 'ORDER' }],
    },
    adjustments: [],
    orders: [],
    customerPayments: [],
    stockMovements: [],
    stockSettings: {},
    stockAdjustments: [],
    stockTransfers: [],
    suppliers: [],
    purchaseOrders: [],
    goodsReceipts: [],
    recipes: [],
    preparedItems: [],
    productionFormulas: [],
    productionPlans: [],
    productionBatches: [],
    wholesaleRoutes: [],
    wholesaleShops: [],
    wholesaleInvoices: [],
    wholesaleCollections: [],
    wholesaleReturns: [],
    wholesalePrices: {},
    shiftTemplates: [],
    rosterAssignments: [],
    attendance: [],
    cashShifts: [],
    staffMeals: [],
    customerOpeningBalances: {},
    orderSequences: {},
    restaurantTables: [
      ...['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8'].map((name, i) => ({
        id: `tbl_${name}`,
        tenantId: T1,
        locationId: L.main,
        name,
        area: 'Indoor',
        seats: i < 4 ? 2 : 4,
      })),
      ...['O1', 'O2', 'O3', 'O4'].map((name) => ({
        id: `tbl_${name}`,
        tenantId: T1,
        locationId: L.main,
        name,
        area: 'Outdoor',
        seats: 4,
      })),
      ...['B1', 'B2', 'B3'].map((name) => ({
        id: `tbl_${name}`,
        tenantId: T1,
        locationId: L.main,
        name,
        area: 'Bar',
        seats: 2,
      })),
    ],
    kots: [],
    ...createCatalogSeed(),
  };
  seedCustomerHistory(db);
  seedRecipes(db);
  seedProductionMaterials(db);
  seedReportHistory(db);
  seedInventory(db);
  seedPurchasing(db);
  seedPreparedItems(db);
  seedProduction(db);
  seedWholesale(db);
  seedDeliveries(db);
  seedStaff(db);
  return db;
}
