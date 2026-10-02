import { expect, type Page, test as base } from '@playwright/test';

export const LOCATIONS = { main: 'loc_01MAIN' } as const;

export interface ScreenDef {
  name: string;
  path: string;
  screenId?: string;
  /** Demo account to sign in as; omit for signed-out screens. */
  as?: string;
  /** Pre-select a location (skips AUTH-003). */
  location?: string | null;
  /** Visible text proving the screen rendered. */
  ready?: string | RegExp;
  /** Extra localStorage entries seeded before the app boots (e.g. a POS cart). */
  storage?: Record<string, string>;
  /** Interaction after load (e.g. open a dialog), then wait for `after` text. */
  action?: (page: Page) => Promise<void>;
  after?: string | RegExp;
}

const lkr = (rupees: number) => ({ amount: rupees * 100, currency: 'LKR' });
const cartLine = (
  productId: string,
  name: string,
  code: string,
  rupees: number,
  quantity: number,
) => ({
  lineId: `ln_${code}`,
  productId,
  quantity,
  addedAt: 0,
  snapshot: { name, nameTranslations: {}, code, price: lkr(rupees) },
});
/** A mid-sale cart at Main Restaurant on no specific device. */
const SEEDED_CART = JSON.stringify({
  state: {
    carts: {
      'ten_01PILOT:loc_01MAIN:-': {
        lines: [
          cartLine('prd_01R01', 'Chicken Rice & Curry', 'R01', 800, 2),
          cartLine('prd_01K02', 'Cheese Kottu', 'K02', 1100, 1),
          cartLine('prd_01S01', 'Fish Bun', 'S01', 120, 4),
          cartLine('prd_01D02', 'Milk Tea', 'D02', 120, 3),
        ],
        selectedId: 'ln_S01',
        lastTouchedId: null,
      },
    },
  },
  version: 0,
});

/** The same sale as a dine-in order on table T4 (P3). */
const DINE_IN_CART = JSON.stringify({
  state: {
    carts: {
      'ten_01PILOT:loc_01MAIN:-': {
        ...JSON.parse(SEEDED_CART).state.carts['ten_01PILOT:loc_01MAIN:-'],
        orderType: 'DINE_IN',
        table: { id: 'tbl_T4', name: 'T4' },
      },
    },
  },
  version: 0,
});

/** POS: open the sale on phones (sheet), then send the dine-in order to the kitchen. */
async function sendToKitchen(page: Page) {
  const bar = page.getByRole('button', { name: /View sale/ });
  if (await bar.isVisible()) await bar.click();
  await page.getByRole('button', { name: /^Send \d+ to kitchen/ }).click();
  await expect(page.getByRole('button', { name: 'All sent' })).toBeVisible();
}

/** POS: open the sale on phones (sheet), then the Payment dialog. */
async function openPayment(page: Page) {
  const bar = page.getByRole('button', { name: /View sale/ });
  if (await bar.isVisible()) await bar.click();
  await page.getByRole('button', { name: /^Pay ·/ }).click();
}

/** POS: pay the seeded sale with exact cash → receipt preview. */
async function payExact(page: Page) {
  await openPayment(page);
  await page.getByRole('button', { name: 'Exact' }).click();
  await page.getByRole('button', { name: /^Take / }).click();
  await expect(page.getByRole('dialog', { name: /Receipt MAIN-/ })).toBeVisible();
}

/** Screens validated at every viewport. */
export const SCREENS: ScreenDef[] = [
  { name: 'login', path: '/login', screenId: 'AUTH-001' },
  // Public user guide (no sign-in).
  {
    name: 'guide',
    path: '/guide',
    screenId: 'HELP-001',
    ready: 'Everything RBP Platform can do today',
  },
  {
    name: 'select-location',
    path: '/select-location',
    screenId: 'AUTH-003',
    as: 'owner@pilot.demo',
    location: null,
  },
  {
    name: 'dashboard',
    path: '/',
    screenId: 'DASH-001',
    as: 'owner@pilot.demo',
    ready: 'Sales today',
  },
  { name: 'placeholder', path: '/customers', screenId: 'CUS-001', as: 'owner@pilot.demo' },
  // P1 Catalog
  {
    name: 'catalog-categories',
    path: '/catalog/categories',
    screenId: 'CAT-001',
    as: 'owner@pilot.demo',
    ready: 'Fried Rice',
  },
  {
    name: 'catalog-category-form',
    path: '/catalog/categories/cat_01FRIED',
    screenId: 'CAT-002',
    as: 'owner@pilot.demo',
    ready: 'Parent category',
  },
  {
    name: 'catalog-products',
    path: '/catalog/products',
    screenId: 'CAT-003',
    as: 'owner@pilot.demo',
    ready: 'Chicken Rice & Curry',
  },
  {
    name: 'catalog-product-form',
    path: '/catalog/products/prd_01D01',
    screenId: 'CAT-004',
    as: 'owner@pilot.demo',
    ready: 'Bakery Outlet',
  },
  {
    name: 'catalog-location-products',
    path: '/catalog/location-products',
    screenId: 'CAT-005',
    as: 'owner@pilot.demo',
    ready: 'Chicken Kottu',
  },
  {
    name: 'catalog-pricing',
    path: '/catalog/pricing',
    screenId: 'CAT-006',
    as: 'owner@pilot.demo',
    ready: 'Chicken Rice & Curry',
  },
  {
    name: 'catalog-quick-pad',
    path: '/catalog/quick-pad',
    screenId: 'CAT-007',
    as: 'owner@pilot.demo',
    ready: 'Live preview',
  },
  { name: 'forbidden', path: '/settings/users', as: 'cashier@pilot.demo', ready: 'Access denied' },
  { name: 'pos', path: '/pos', screenId: 'POS-001', as: 'owner@pilot.demo' },
  {
    name: 'pos-search',
    path: '/pos',
    screenId: 'POS-001',
    as: 'owner@pilot.demo',
    ready: /3,894\.00/,
    storage: { 'rbp.pos.carts': SEEDED_CART },
    action: async (page) => {
      await page.keyboard.press('F2');
      await page.getByRole('combobox', { name: 'Product search' }).fill('kottu');
    },
    after: 'Cheese Kottu',
  },
  {
    name: 'pos-customer',
    path: '/pos',
    screenId: 'POS-001',
    as: 'owner@pilot.demo',
    ready: /3,894\.00/,
    storage: { 'rbp.pos.carts': SEEDED_CART },
    action: async (page) => {
      // Phones show the sale in a sheet; open it first when the bar is there.
      const bar = page.getByRole('button', { name: /View sale/ });
      if (await bar.isVisible()) await bar.click();
      await page.getByRole('button', { name: /Walk-in customer/ }).click();
      await page.getByLabel('Phone number').fill('0785551234');
    },
    after: 'Create customer',
  },
  {
    name: 'pos-discount',
    path: '/pos',
    screenId: 'POS-001',
    as: 'owner@pilot.demo',
    ready: /3,894\.00/,
    storage: { 'rbp.pos.carts': SEEDED_CART },
    action: async (page) => {
      const bar = page.getByRole('button', { name: /View sale/ });
      if (await bar.isVisible()) await bar.click();
      await page.getByRole('button', { name: /^Discount\s*\(?Needs/ }).click();
      await page.getByRole('button', { name: '10%' }).click();
    },
    after: /New total/,
  },
  {
    name: 'pos-charges',
    path: '/pos',
    screenId: 'POS-001',
    as: 'owner@pilot.demo',
    ready: /3,894\.00/,
    storage: { 'rbp.pos.carts': SEEDED_CART },
    action: async (page) => {
      const bar = page.getByRole('button', { name: /View sale/ });
      if (await bar.isVisible()) await bar.click();
      await page.getByRole('button', { name: /^Charges\s*\(?Needs/ }).click();
    },
    after: 'On this sale',
  },
  {
    name: 'pos-price',
    path: '/pos',
    screenId: 'POS-001',
    as: 'owner@pilot.demo',
    ready: /3,894\.00/,
    storage: { 'rbp.pos.carts': SEEDED_CART },
    action: async (page) => {
      const bar = page.getByRole('button', { name: /View sale/ });
      if (await bar.isVisible()) await bar.click();
      await page.getByRole('button', { name: 'Change price of Fish Bun' }).click();
    },
    after: 'New unit price',
  },
  {
    name: 'audit-log',
    path: '/reports/audit',
    screenId: 'REP-006',
    as: 'owner@pilot.demo',
    ready: 'PIN-approved only',
  },
  {
    name: 'pos-payment',
    path: '/pos',
    screenId: 'POS-001',
    as: 'owner@pilot.demo',
    ready: /3,894\.00/,
    storage: { 'rbp.pos.carts': SEEDED_CART },
    action: openPayment,
    after: 'Change due',
  },
  {
    name: 'pos-receipt',
    path: '/pos',
    screenId: 'POS-001',
    as: 'owner@pilot.demo',
    ready: /3,894\.00/,
    storage: { 'rbp.pos.carts': SEEDED_CART },
    action: payExact,
    after: 'Thank you! Come again.',
  },
  {
    name: 'pos-history',
    path: '/pos',
    screenId: 'POS-001',
    as: 'owner@pilot.demo',
    ready: /3,894\.00/,
    storage: { 'rbp.pos.carts': SEEDED_CART },
    action: async (page) => {
      await payExact(page);
      await page.getByRole('button', { name: 'New sale' }).click();
      await page.getByRole('button', { name: 'Sales history' }).click();
    },
    after: 'MAIN-000001',
  },
  {
    name: 'pos-return',
    path: '/pos',
    screenId: 'POS-001',
    as: 'owner@pilot.demo',
    ready: /3,894\.00/,
    storage: { 'rbp.pos.carts': SEEDED_CART },
    action: async (page) => {
      await payExact(page);
      await page.getByRole('button', { name: 'New sale' }).click();
      await page.getByRole('button', { name: 'Sales history' }).click();
      await page.getByRole('button', { name: 'Return MAIN-000001' }).click();
    },
    after: 'Refund to',
  },
  {
    name: 'pos-sale',
    path: '/pos',
    screenId: 'POS-001',
    as: 'owner@pilot.demo',
    // 2×800 + 1100 + 4×120 + 3×120 = 3,540 + 10% service = 3,894 — shown on every viewport.
    ready: /3,894\.00/,
    storage: { 'rbp.pos.carts': SEEDED_CART },
  },
  { name: 'kitchen', path: '/kitchen', screenId: 'KOT-003', as: 'kitchen@pilot.demo' },
  {
    name: 'pos-dine-in',
    path: '/pos',
    screenId: 'POS-001',
    as: 'owner@pilot.demo',
    ready: /3,894\.00/,
    storage: { 'rbp.pos.carts': DINE_IN_CART },
    action: sendToKitchen,
    after: 'All sent',
  },
  {
    name: 'pos-delivery',
    path: '/pos',
    screenId: 'POS-001',
    as: 'owner@pilot.demo',
    ready: /3,894\.00/,
    storage: { 'rbp.pos.carts': SEEDED_CART },
    action: async (page) => {
      const bar = page.getByRole('button', { name: /View sale/ });
      if (await bar.isVisible()) await bar.click();
      await page.getByRole('radio', { name: 'Delivery' }).click();
      await page.getByLabel('Phone').fill('0771234567');
    },
    after: 'Nimal Perera',
  },
  {
    name: 'restaurant-tables',
    path: '/pos',
    screenId: 'POS-001',
    as: 'owner@pilot.demo',
    ready: /3,894\.00/,
    storage: { 'rbp.pos.carts': DINE_IN_CART },
    action: async (page) => {
      await sendToKitchen(page);
      await page.getByRole('button', { name: 'Leave table' }).click();
      await expect(page.getByText(/T4 saved/)).toBeVisible();
      await page.goto('/sales/tables');
    },
    after: 'Bill printed',
  },
  {
    name: 'kitchen-tickets',
    path: '/pos',
    screenId: 'POS-001',
    as: 'owner@pilot.demo',
    ready: /3,894\.00/,
    storage: { 'rbp.pos.carts': DINE_IN_CART },
    action: async (page) => {
      await sendToKitchen(page);
      await page.goto('/kitchen');
    },
    after: 'DINE-IN · T4',
  },
  {
    name: 'customers',
    path: '/customers',
    screenId: 'CUS-001',
    as: 'manager@pilot.demo',
    ready: 'Colombo Tech Park Canteen',
  },
  {
    name: 'customer-form',
    path: '/customers/cus_02/edit',
    screenId: 'CUS-002',
    as: 'manager@pilot.demo',
    ready: 'Add another number',
  },
  {
    name: 'customer-detail',
    path: '/customers/cus_01',
    screenId: 'CUS-003',
    as: 'manager@pilot.demo',
    ready: 'Recent orders',
  },
  {
    name: 'customer-orders',
    path: '/customers/cus_01/orders',
    screenId: 'CUS-004',
    as: 'manager@pilot.demo',
    ready: /OLD-MAIN/,
  },
  {
    name: 'customer-balance',
    path: '/customers/cus_09/balance',
    screenId: 'CUS-005',
    as: 'manager@pilot.demo',
    ready: 'Brought forward (previous system)',
    action: async (page) => {
      await page.getByRole('button', { name: 'Receive payment' }).click();
    },
    after: 'Balance after payment',
  },
  {
    name: 'stock',
    path: '/inventory/stock',
    screenId: 'INV-001',
    as: 'manager@pilot.demo',
    ready: 'Vegetable Roti',
  },
  {
    name: 'stock-item',
    path: '/inventory/stock/prd_01B03?location=loc_01BAKERY',
    screenId: 'INV-002',
    as: 'owner@pilot.demo',
    ready: 'Central Store',
  },
  {
    name: 'stock-movements',
    // Filtered: a week of bakery production (BAK seed) is newer than the seeded transfer.
    path: '/inventory/movements?type=TRANSFER_IN',
    screenId: 'INV-003',
    as: 'owner@pilot.demo',
    ready: 'TRF-000001',
  },
  {
    name: 'stock-adjust',
    path: '/inventory/adjustments',
    screenId: 'INV-004',
    as: 'manager@pilot.demo',
    ready: 'ADJ-000001',
    action: async (page) => {
      await page.getByRole('button', { name: 'Adjust stock' }).click();
      await page.getByRole('searchbox', { name: /Search items/ }).fill('fish bun');
      await page.getByRole('button', { name: /^Fish Bun, / }).click();
      await page.getByRole('radio', { name: /Wastage/ }).click();
      await page.getByRole('button', { name: 'Next' }).click();
    },
    after: 'Stock after',
  },
  {
    name: 'transfers',
    path: '/inventory/transfers',
    screenId: 'INV-005',
    as: 'owner@pilot.demo',
    ready: 'TRF-000001',
  },
  {
    name: 'transfer-new',
    path: '/inventory/transfers',
    screenId: 'INV-005',
    as: 'owner@pilot.demo',
    ready: 'TRF-000001',
    action: async (page) => {
      await page.getByRole('button', { name: 'New transfer' }).click();
      await page.getByRole('searchbox', { name: /Search items/ }).fill('bread');
      await page.getByRole('button', { name: /^Sandwich Bread/ }).click();
    },
    after: /Dispatch 1 item/,
  },
  {
    name: 'low-stock',
    path: '/inventory/low-stock',
    screenId: 'INV-006',
    as: 'owner@pilot.demo',
    ready: 'Vegetable Roti',
  },
  {
    name: 'suppliers',
    path: '/purchasing/suppliers',
    screenId: 'PUR-001',
    as: 'owner@pilot.demo',
    ready: 'Perera & Sons Bakery Supplies',
  },
  {
    name: 'supplier-detail',
    path: '/purchasing/suppliers/sup_02',
    screenId: 'PUR-002',
    as: 'owner@pilot.demo',
    ready: 'GRN-000002',
  },
  {
    name: 'purchase-orders',
    path: '/purchasing/orders',
    screenId: 'PUR-003',
    as: 'owner@pilot.demo',
    ready: 'PO-000006',
  },
  {
    name: 'purchase-order-new',
    path: '/purchasing/orders/new?supplierId=sup_01',
    screenId: 'PUR-003',
    as: 'owner@pilot.demo',
    ready: 'Order summary',
    action: async (page) => {
      await page.getByRole('searchbox', { name: /Search items/ }).fill('bread');
      await page.getByRole('button', { name: /^Sandwich Bread/ }).click();
    },
    after: 'Sandwich Bread (450g)',
  },
  {
    name: 'purchase-order-detail',
    path: '/purchasing/orders/po_seed_3',
    screenId: 'PUR-003',
    as: 'owner@pilot.demo',
    ready: 'GRN-000002',
  },
  {
    name: 'goods-receiving',
    path: '/purchasing/receiving',
    screenId: 'PUR-004',
    as: 'owner@pilot.demo',
    ready: 'PO-000004',
  },
  {
    name: 'receive-goods',
    path: '/purchasing/receiving/new?po=po_seed_4',
    screenId: 'PUR-004',
    as: 'owner@pilot.demo',
    ready: /Receive 90 units/,
  },
  {
    name: 'goods-receipt',
    path: '/purchasing/receiving/grn_seed_2',
    screenId: 'PUR-004',
    as: 'owner@pilot.demo',
    ready: 'Stock received',
  },
  {
    name: 'ingredients',
    path: '/production/ingredients',
    screenId: 'REC-001',
    as: 'owner@pilot.demo',
    ready: 'Vegetables',
  },
  {
    name: 'recipes',
    path: '/production/recipes',
    screenId: 'REC-002',
    as: 'owner@pilot.demo',
    ready: 'limited by Chicken',
  },
  {
    name: 'recipe-form',
    path: '/production/recipes/prd_01R01',
    screenId: 'REC-003',
    as: 'owner@pilot.demo',
    ready: 'Selling one takes:',
  },
  {
    name: 'portions',
    path: '/production/portions',
    screenId: 'REC-004',
    as: 'owner@pilot.demo',
    ready: 'Ingredients needed',
  },
  {
    name: 'prepared-items',
    path: '/production/prepared',
    screenId: 'REC-005',
    as: 'owner@pilot.demo',
    ready: 'Cancelled from Table T4',
  },
  {
    name: 'bakery-dashboard',
    path: '/production/bakery',
    screenId: 'BAK-001',
    as: 'owner@pilot.demo',
    location: 'loc_01BAKERY',
    ready: /raw material is short/,
  },
  {
    name: 'production-plans',
    path: '/production/plan',
    screenId: 'BAK-002',
    as: 'owner@pilot.demo',
    location: 'loc_01BAKERY',
    ready: 'PLN-000007',
  },
  {
    name: 'production-plan-form',
    path: '/production/plan/new',
    screenId: 'BAK-002',
    as: 'owner@pilot.demo',
    location: 'loc_01BAKERY',
    ready: 'Raw materials needed',
  },
  {
    name: 'production-batch',
    path: '/production/batches/bat_seed_0_B01',
    screenId: 'BAK-003',
    as: 'owner@pilot.demo',
    location: 'loc_01BAKERY',
    ready: 'Stock movements',
    action: async (page) => {
      await page.getByRole('button', { name: 'Record output' }).first().click();
    },
    after: /out of the oven/,
  },
  {
    name: 'production-batches',
    path: '/production/batches',
    screenId: 'BAK-003',
    as: 'owner@pilot.demo',
    location: 'loc_01BAKERY',
    ready: 'Sandwich Bread (450g)',
  },
  {
    name: 'finished-goods',
    path: '/production/finished-goods',
    screenId: 'BAK-004',
    as: 'owner@pilot.demo',
    location: 'loc_01BAKERY',
    ready: 'Butter Cake Slice',
  },
  {
    name: 'wastage',
    path: '/production/wastage',
    screenId: 'BAK-005',
    as: 'owner@pilot.demo',
    location: 'loc_01BAKERY',
    ready: 'Burnt / over-baked',
  },
  {
    name: 'external-shops',
    path: '/customers/external-shops',
    screenId: 'WHO-001',
    as: 'rep@pilot.demo',
    location: 'loc_01VAN1',
    ready: 'Lakshmi Stores',
  },
  {
    name: 'shop-detail',
    path: '/customers/external-shops/shp_001',
    screenId: 'WHO-002',
    as: 'rep@pilot.demo',
    location: 'loc_01VAN1',
    ready: 'Statement',
  },
  {
    name: 'field-sale',
    path: '/wholesale/field-sales',
    screenId: 'WHO-003',
    as: 'rep@pilot.demo',
    location: 'loc_01VAN1',
    ready: "Today's route",
  },
  {
    name: 'field-sale-items',
    path: '/wholesale/field-sales?shop=shp_001',
    screenId: 'WHO-003',
    as: 'rep@pilot.demo',
    location: 'loc_01VAN1',
    ready: 'Goods from the van',
  },
  {
    name: 'wholesale-invoice',
    path: '/wholesale/field-sales/win_seed_1',
    screenId: 'WHO-003',
    as: 'rep@pilot.demo',
    location: 'loc_01VAN1',
    ready: 'Give the shop a copy',
  },
  {
    name: 'collections',
    path: '/wholesale/collections?range=month',
    screenId: 'WHO-004',
    as: 'rep@pilot.demo',
    location: 'loc_01VAN1',
    ready: 'COL-000001',
  },
  {
    name: 'wholesale-returns',
    path: '/wholesale/returns',
    screenId: 'WHO-005',
    as: 'rep@pilot.demo',
    location: 'loc_01VAN1',
    ready: 'WRN-000001',
  },
  {
    name: 'wholesale-return-form',
    path: '/wholesale/returns/new?shop=shp_001&invoice=win_seed_1',
    screenId: 'WHO-005',
    as: 'rep@pilot.demo',
    location: 'loc_01VAN1',
    ready: 'Items returned',
  },
  {
    name: 'route-overview',
    path: '/wholesale/routes',
    screenId: 'WHO-006',
    as: 'rep@pilot.demo',
    location: 'loc_01VAN1',
    ready: 'On Van 1',
  },
  {
    name: 'deliveries',
    path: '/sales/deliveries',
    screenId: 'DEL-001',
    as: 'cashier@pilot.demo',
    location: 'loc_01MAIN',
    ready: 'PH-MAIN-0001',
  },
  {
    name: 'delivery-detail',
    path: '/sales/deliveries/ord_del_4',
    screenId: 'DEL-002',
    as: 'cashier@pilot.demo',
    location: 'loc_01MAIN',
    ready: 'Gate code 2468',
  },
  {
    name: 'delivery-assign',
    path: '/sales/deliveries/ord_del_1',
    screenId: 'DEL-002',
    as: 'cashier@pilot.demo',
    location: 'loc_01MAIN',
    ready: 'Progress',
    action: async (page) => {
      await page
        .getByRole('button', { name: /Assign a rider/ })
        .first()
        .click();
    },
    after: 'Rider for PH-MAIN-0001',
  },
  {
    name: 'rider-deliveries',
    path: '/sales/deliveries',
    screenId: 'DEL-001',
    as: 'rider@pilot.demo',
    location: 'loc_01MAIN',
    ready: 'My deliveries',
  },
  {
    name: 'employees',
    path: '/staff/employees',
    screenId: 'HR-001',
    as: 'manager@pilot.demo',
    location: 'loc_01MAIN',
    ready: 'Kasun Perera',
  },
  {
    name: 'employee-detail',
    path: '/staff/employees/emp_04',
    screenId: 'HR-002',
    as: 'manager@pilot.demo',
    location: 'loc_01MAIN',
    ready: 'Food allowance this month',
  },
  {
    name: 'attendance',
    path: '/staff/attendance',
    screenId: 'HR-003',
    as: 'manager@pilot.demo',
    location: 'loc_01MAIN',
    ready: 'Clock in / out',
  },
  {
    name: 'shifts-roster',
    path: '/staff/shifts',
    screenId: 'HR-004',
    as: 'manager@pilot.demo',
    location: 'loc_01MAIN',
    ready: 'Fathima Rizvi',
  },
  {
    name: 'staff-meals',
    path: '/staff/meals',
    screenId: 'HR-005',
    as: 'manager@pilot.demo',
    location: 'loc_01MAIN',
    ready: 'SML-000001',
    action: async (page) => {
      await page.getByRole('button', { name: /Record staff meal/ }).click();
    },
    after: 'Who ate what',
  },
  {
    name: 'food-allowance',
    path: '/staff/allowance',
    screenId: 'HR-006',
    as: 'manager@pilot.demo',
    location: 'loc_01MAIN',
    ready: 'Deduct from salary',
  },
  {
    name: 'report-sales',
    path: '/reports/sales',
    screenId: 'REP-001',
    as: 'owner@pilot.demo',
    location: 'loc_01MAIN',
    ready: 'How net sales add up',
  },
  {
    name: 'report-products',
    path: '/reports/products',
    screenId: 'REP-002',
    as: 'owner@pilot.demo',
    location: 'loc_01MAIN',
    ready: 'Top 10 by net sales',
  },
  {
    name: 'report-locations',
    path: '/reports/locations',
    screenId: 'REP-003',
    as: 'owner@pilot.demo',
    location: 'loc_01MAIN',
    ready: 'Main Restaurant by day',
  },
  {
    name: 'report-stock',
    path: '/reports/inventory',
    screenId: 'REP-004',
    as: 'owner@pilot.demo',
    location: 'loc_01MAIN',
    ready: 'Chicken Kottu',
  },
  {
    name: 'report-voids',
    path: '/reports/voids',
    screenId: 'REP-005',
    as: 'owner@pilot.demo',
    location: 'loc_01MAIN',
    ready: 'By approving employee',
  },
  {
    name: 'ui-kit',
    path: '/design-system',
    screenId: 'DS-001',
    as: 'owner@pilot.demo',
    ready: 'Colour tokens',
  },
];

const persisted = (state: unknown) => JSON.stringify({ state, version: 0 });

/**
 * Prepare storage before the app boots: no mock latency, chosen theme, and (optionally)
 * a signed-in session obtained from the mock API — the same path the login page uses.
 */
export async function openScreen(
  page: Page,
  screen: ScreenDef,
  opts: { theme?: 'light' | 'dark' } = {},
) {
  await page.addInitScript(
    ([config, ui, extra]) => {
      localStorage.setItem('rbp.mock.config', config);
      localStorage.setItem('rbp.ui', ui);
      for (const [key, value] of Object.entries(JSON.parse(extra) as Record<string, string>)) {
        localStorage.setItem(key, value);
      }
    },
    [
      persisted({ latencyMs: 0, failure: 'none', scenario: 'SCN-001' }),
      persisted({
        sidebarCollapsed: false,
        theme: opts.theme ?? 'light',
        language: null,
        showScreenIds: false,
        showQueryDevtools: false,
      }),
      JSON.stringify(screen.storage ?? {}),
    ] as const,
  );

  if (screen.as) {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    const token = await page.evaluate(async (email) => {
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: 'demo1234' }),
      });
      return ((await res.json()) as { accessToken: string }).accessToken;
    }, screen.as);
    const locationId = screen.location === undefined ? LOCATIONS.main : screen.location;
    await page.evaluate(
      (session) => localStorage.setItem('rbp.session', session),
      persisted({ accessToken: token, locationId, deviceId: null }),
    );
  }

  await page.goto(screen.path);
  if (screen.screenId)
    await expect(page.locator(`[data-screen-id="${screen.screenId}"]`)).toBeVisible();
  if (screen.ready) await expect(page.getByText(screen.ready).first()).toBeVisible();
  if (screen.action) {
    await screen.action(page);
    if (screen.after) await expect(page.getByText(screen.after).first()).toBeVisible();
  }
  // Let fonts and late layout settle.
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(150);
}

export const test = base;
export { expect };
