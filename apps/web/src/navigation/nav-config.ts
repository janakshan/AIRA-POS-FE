import type { FeatureCode, Permission } from '@rbp/types';
import {
  BarChart3Icon,
  BoxesIcon,
  CakeSliceIcon,
  LayoutDashboardIcon,
  type LucideIcon,
  SettingsIcon,
  ShoppingBagIcon,
  ShoppingCartIcon,
  TagsIcon,
  TruckIcon,
  UsersIcon,
  UsersRoundIcon,
} from 'lucide-react';

export type Phase = 'P1' | 'P2' | 'P3' | 'P4' | 'P5' | 'Later';

/** Tenant entitlement AND user permission — both must pass (ADR-011). */
export interface AccessRequirement {
  feature?: FeatureCode;
  permission?: Permission;
  /** Also allowed with any of these instead (e.g. riders on the delivery list). */
  orPermissions?: Permission[];
}

export interface NavItem extends AccessRequirement {
  /** Stable key, also the i18n key under nav:items. */
  key: string;
  path: string;
  /** Screen catalog ID (02_Prototype/03_SCREEN_CATALOG.md). Undefined = not yet assigned. */
  screenId?: string;
  phase: Phase;
  /** Opens a dedicated full-screen layout (POS, kitchen) instead of the admin shell. */
  fullscreen?: boolean;
}

export interface NavGroup {
  key: string;
  icon: LucideIcon;
  items: NavItem[];
}

export const DASHBOARD_ITEM: NavItem & { icon: LucideIcon } = {
  key: 'dashboard',
  path: '/',
  screenId: 'DASH-001',
  phase: 'P1',
  permission: 'dashboard.view',
  icon: LayoutDashboardIcon,
};

/** Information architecture (02_Prototype/02_INFORMATION_ARCHITECTURE.md). */
export const NAV_GROUPS: NavGroup[] = [
  {
    key: 'sales',
    icon: ShoppingCartIcon,
    items: [
      {
        key: 'retailPos',
        path: '/pos',
        screenId: 'POS-001',
        phase: 'P2',
        feature: 'POS_RETAIL',
        permission: 'pos.sale.create',
        fullscreen: true,
      },
      {
        key: 'restaurantPos',
        path: '/sales/restaurant',
        screenId: 'REST-002',
        phase: 'P3',
        feature: 'POS_RESTAURANT',
        permission: 'pos.sale.create',
      },
      { key: 'orders', path: '/sales/orders', phase: 'P2', permission: 'pos.sale.create' },
      {
        key: 'tables',
        path: '/sales/tables',
        screenId: 'REST-001',
        phase: 'P3',
        feature: 'TABLE_MANAGEMENT',
        permission: 'restaurant.table.manage',
      },
      {
        key: 'kitchen',
        path: '/kitchen',
        screenId: 'KOT-003',
        phase: 'P3',
        feature: 'KOT',
        permission: 'kot.view',
        fullscreen: true,
      },
      {
        key: 'deliveries',
        path: '/sales/deliveries',
        screenId: 'DEL-001',
        phase: 'P5',
        feature: 'DELIVERY',
        permission: 'delivery.manage',
        orPermissions: ['delivery.deliver'],
      },
    ],
  },
  {
    key: 'catalog',
    icon: TagsIcon,
    items: [
      {
        key: 'products',
        path: '/catalog/products',
        screenId: 'CAT-003',
        phase: 'P1',
        permission: 'catalog.view',
      },
      {
        key: 'categories',
        path: '/catalog/categories',
        screenId: 'CAT-001',
        phase: 'P1',
        permission: 'catalog.view',
      },
      {
        key: 'locationProducts',
        path: '/catalog/location-products',
        screenId: 'CAT-005',
        phase: 'P1',
        permission: 'catalog.manage',
      },
      {
        key: 'pricing',
        path: '/catalog/pricing',
        screenId: 'CAT-006',
        phase: 'P1',
        permission: 'catalog.manage',
      },
      {
        key: 'quickPad',
        path: '/catalog/quick-pad',
        screenId: 'CAT-007',
        phase: 'P1',
        permission: 'catalog.manage',
      },
    ],
  },
  {
    key: 'customers',
    icon: UsersIcon,
    items: [
      {
        key: 'customers',
        path: '/customers',
        screenId: 'CUS-001',
        phase: 'P4',
        permission: 'customer.view',
      },
      {
        key: 'externalShops',
        path: '/customers/external-shops',
        screenId: 'WHO-001',
        phase: 'P5',
        feature: 'WHOLESALE',
        permission: 'wholesale.manage',
      },
    ],
  },
  {
    key: 'inventory',
    icon: BoxesIcon,
    items: [
      {
        key: 'stock',
        path: '/inventory/stock',
        screenId: 'INV-001',
        phase: 'P4',
        feature: 'INVENTORY',
        permission: 'inventory.view',
      },
      {
        key: 'stockMovement',
        path: '/inventory/movements',
        screenId: 'INV-003',
        phase: 'P4',
        feature: 'INVENTORY',
        permission: 'inventory.view',
      },
      {
        key: 'transfers',
        path: '/inventory/transfers',
        screenId: 'INV-005',
        phase: 'P4',
        feature: 'INVENTORY',
        permission: 'inventory.transfer',
      },
      {
        key: 'adjustments',
        path: '/inventory/adjustments',
        screenId: 'INV-004',
        phase: 'P4',
        feature: 'INVENTORY',
        permission: 'inventory.adjust',
      },
      {
        key: 'lowStock',
        path: '/inventory/low-stock',
        screenId: 'INV-006',
        phase: 'P4',
        feature: 'INVENTORY',
        permission: 'inventory.view',
      },
    ],
  },
  {
    key: 'purchasing',
    icon: ShoppingBagIcon,
    items: [
      {
        key: 'suppliers',
        path: '/purchasing/suppliers',
        screenId: 'PUR-001',
        phase: 'P5',
        feature: 'PURCHASING',
        permission: 'purchasing.manage',
      },
      {
        key: 'purchaseOrders',
        path: '/purchasing/orders',
        screenId: 'PUR-003',
        phase: 'P5',
        feature: 'PURCHASING',
        permission: 'purchasing.manage',
      },
      {
        key: 'goodsReceiving',
        path: '/purchasing/receiving',
        screenId: 'PUR-004',
        phase: 'P5',
        feature: 'PURCHASING',
        permission: 'purchasing.manage',
      },
    ],
  },
  {
    key: 'production',
    icon: CakeSliceIcon,
    items: [
      {
        key: 'ingredients',
        path: '/production/ingredients',
        screenId: 'REC-001',
        phase: 'P5',
        feature: 'RECIPES',
        permission: 'production.manage',
      },
      {
        key: 'recipes',
        path: '/production/recipes',
        screenId: 'REC-002',
        phase: 'P5',
        feature: 'RECIPES',
        permission: 'production.manage',
      },
      {
        key: 'portions',
        path: '/production/portions',
        screenId: 'REC-004',
        phase: 'P5',
        feature: 'RECIPES',
        permission: 'production.manage',
      },
      {
        // The kitchen runs the prepared queue too.
        key: 'prepared',
        path: '/production/prepared',
        screenId: 'REC-005',
        phase: 'P5',
        feature: 'RECIPES',
        permission: 'kot.manage',
      },
      {
        key: 'bakeryProduction',
        path: '/production/bakery',
        screenId: 'BAK-001',
        phase: 'P5',
        feature: 'BAKERY_PRODUCTION',
        permission: 'production.manage',
      },
      {
        key: 'productionPlan',
        path: '/production/plan',
        screenId: 'BAK-002',
        phase: 'P5',
        feature: 'BAKERY_PRODUCTION',
        permission: 'production.manage',
      },
      {
        key: 'productionBatches',
        path: '/production/batches',
        screenId: 'BAK-003',
        phase: 'P5',
        feature: 'BAKERY_PRODUCTION',
        permission: 'production.manage',
      },
      {
        key: 'finishedGoods',
        path: '/production/finished-goods',
        screenId: 'BAK-004',
        phase: 'P5',
        feature: 'BAKERY_PRODUCTION',
        permission: 'production.manage',
      },
      {
        key: 'wastage',
        path: '/production/wastage',
        screenId: 'BAK-005',
        phase: 'P5',
        feature: 'BAKERY_PRODUCTION',
        permission: 'production.manage',
      },
    ],
  },
  {
    key: 'wholesale',
    icon: TruckIcon,
    items: [
      {
        key: 'fieldSales',
        path: '/wholesale/field-sales',
        screenId: 'WHO-003',
        phase: 'P5',
        feature: 'FIELD_SALES',
        permission: 'wholesale.manage',
      },
      {
        key: 'routes',
        path: '/wholesale/routes',
        screenId: 'WHO-006',
        phase: 'P5',
        feature: 'WHOLESALE',
        permission: 'wholesale.manage',
      },
      {
        key: 'collections',
        path: '/wholesale/collections',
        screenId: 'WHO-004',
        phase: 'P5',
        feature: 'WHOLESALE',
        permission: 'wholesale.manage',
      },
      {
        key: 'returns',
        path: '/wholesale/returns',
        screenId: 'WHO-005',
        phase: 'P5',
        feature: 'WHOLESALE',
        permission: 'wholesale.manage',
      },
    ],
  },
  {
    key: 'staff',
    icon: UsersRoundIcon,
    items: [
      {
        key: 'employees',
        path: '/staff/employees',
        screenId: 'HR-001',
        phase: 'P5',
        feature: 'HR',
        permission: 'staff.view',
      },
      {
        key: 'attendance',
        path: '/staff/attendance',
        screenId: 'HR-003',
        phase: 'P5',
        feature: 'ATTENDANCE',
        permission: 'staff.view',
      },
      {
        key: 'shifts',
        path: '/staff/shifts',
        screenId: 'HR-004',
        phase: 'P5',
        feature: 'ATTENDANCE',
        permission: 'staff.manage',
      },
      {
        key: 'staffMeals',
        path: '/staff/meals',
        screenId: 'HR-005',
        phase: 'P5',
        feature: 'HR',
        permission: 'staff.manage',
      },
      {
        key: 'foodAllowance',
        path: '/staff/allowance',
        screenId: 'HR-006',
        phase: 'P5',
        feature: 'HR',
        permission: 'staff.manage',
      },
    ],
  },
  {
    key: 'reports',
    icon: BarChart3Icon,
    items: [
      {
        key: 'salesReport',
        path: '/reports/sales',
        screenId: 'REP-001',
        phase: 'P5',
        permission: 'report.sales.view',
      },
      {
        key: 'productSales',
        path: '/reports/products',
        screenId: 'REP-002',
        phase: 'P5',
        permission: 'report.sales.view',
      },
      {
        key: 'locationSales',
        path: '/reports/locations',
        screenId: 'REP-003',
        phase: 'P5',
        permission: 'report.sales.view',
      },
      {
        key: 'inventoryReport',
        path: '/reports/inventory',
        screenId: 'REP-004',
        phase: 'P5',
        feature: 'INVENTORY',
        permission: 'report.sales.view',
      },
      {
        key: 'voidsReport',
        path: '/reports/voids',
        screenId: 'REP-005',
        phase: 'P5',
        permission: 'report.sales.view',
      },
      {
        key: 'staffReport',
        path: '/reports/staff',
        phase: 'P5',
        feature: 'HR',
        permission: 'staff.view',
      },
      {
        key: 'auditReport',
        path: '/reports/audit',
        screenId: 'REP-006',
        phase: 'P2',
        permission: 'report.audit.view',
      },
    ],
  },
  {
    key: 'settings',
    icon: SettingsIcon,
    items: [
      {
        key: 'business',
        path: '/settings/business',
        screenId: 'SET-001',
        phase: 'Later',
        permission: 'settings.manage',
      },
      {
        key: 'locations',
        path: '/settings/locations',
        screenId: 'SET-002',
        phase: 'Later',
        permission: 'settings.manage',
      },
      {
        key: 'users',
        path: '/settings/users',
        screenId: 'SET-003',
        phase: 'Later',
        permission: 'settings.manage',
      },
      {
        key: 'roles',
        path: '/settings/roles',
        screenId: 'SET-004',
        phase: 'Later',
        permission: 'settings.manage',
      },
      {
        key: 'devices',
        path: '/settings/devices',
        screenId: 'SET-005',
        phase: 'Later',
        permission: 'settings.manage',
      },
      {
        key: 'payments',
        path: '/settings/payments',
        screenId: 'SET-006',
        phase: 'Later',
        permission: 'settings.manage',
      },
      {
        key: 'charges',
        path: '/settings/charges',
        screenId: 'SET-007',
        phase: 'Later',
        permission: 'settings.manage',
      },
      {
        key: 'printers',
        path: '/settings/printers',
        screenId: 'SET-008',
        phase: 'Later',
        permission: 'settings.manage',
      },
      {
        key: 'languages',
        path: '/settings/languages',
        screenId: 'SET-009',
        phase: 'Later',
        permission: 'settings.manage',
      },
      {
        key: 'features',
        path: '/settings/features',
        screenId: 'SET-010',
        phase: 'Later',
        permission: 'settings.manage',
      },
    ],
  },
];

export const ALL_NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);
