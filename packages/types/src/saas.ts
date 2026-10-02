/** Tenant feature entitlements (what the tenant has bought/enabled). */
export const FEATURE_CODES = [
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
  'ADVANCED_REPORTING',
] as const;

export type FeatureCode = (typeof FEATURE_CODES)[number];

export type LimitCode = 'locations' | 'devices' | 'users';

/** User/role permissions (what a person may do). Kept separate from features. */
export const PERMISSIONS = [
  'dashboard.view',
  'pos.sale.create',
  'pos.discount.apply',
  'pos.charge.manage',
  'pos.price.override',
  'pos.item.cancel',
  'pos.order.void',
  'pos.refund',
  'pos.drawer.open',
  'restaurant.table.manage',
  'restaurant.table.transfer',
  'kot.view',
  'kot.manage',
  'catalog.view',
  'catalog.manage',
  'customer.view',
  'customer.manage',
  'inventory.view',
  'inventory.adjust',
  'inventory.transfer',
  'purchasing.manage',
  'production.manage',
  'wholesale.manage',
  'delivery.manage',
  /** DEL: a rider moves their own deliveries (out / delivered). */
  'delivery.deliver',
  'staff.view',
  'staff.manage',
  'report.sales.view',
  'report.audit.view',
  'settings.manage',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/** SET-004 permission grid: every permission in exactly one group. */
export const PERMISSION_GROUPS: { key: string; permissions: Permission[] }[] = [
  { key: 'dashboard', permissions: ['dashboard.view'] },
  {
    key: 'pos',
    permissions: [
      'pos.sale.create',
      'pos.discount.apply',
      'pos.charge.manage',
      'pos.price.override',
      'pos.item.cancel',
      'pos.order.void',
      'pos.refund',
      'pos.drawer.open',
    ],
  },
  {
    key: 'restaurant',
    permissions: ['restaurant.table.manage', 'restaurant.table.transfer', 'kot.view', 'kot.manage'],
  },
  { key: 'catalog', permissions: ['catalog.view', 'catalog.manage'] },
  { key: 'customers', permissions: ['customer.view', 'customer.manage'] },
  { key: 'inventory', permissions: ['inventory.view', 'inventory.adjust', 'inventory.transfer'] },
  {
    key: 'operations',
    permissions: ['purchasing.manage', 'production.manage', 'wholesale.manage'],
  },
  { key: 'delivery', permissions: ['delivery.manage', 'delivery.deliver'] },
  { key: 'staff', permissions: ['staff.view', 'staff.manage'] },
  { key: 'reports', permissions: ['report.sales.view', 'report.audit.view'] },
  { key: 'settings', permissions: ['settings.manage'] },
];

/** The module a permission's screens need, for the SET-004 "module off" hint. */
export const PERMISSION_FEATURE: Partial<Record<Permission, FeatureCode>> = {
  'restaurant.table.manage': 'TABLE_MANAGEMENT',
  'restaurant.table.transfer': 'TABLE_MANAGEMENT',
  'kot.view': 'KOT',
  'kot.manage': 'KOT',
  'inventory.view': 'INVENTORY',
  'inventory.adjust': 'INVENTORY',
  'inventory.transfer': 'INVENTORY',
  'purchasing.manage': 'PURCHASING',
  'production.manage': 'BAKERY_PRODUCTION',
  'wholesale.manage': 'WHOLESALE',
  'delivery.manage': 'DELIVERY',
  'delivery.deliver': 'DELIVERY',
  'staff.view': 'HR',
  'staff.manage': 'HR',
};
