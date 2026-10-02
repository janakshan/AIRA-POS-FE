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
