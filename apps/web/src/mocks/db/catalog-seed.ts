import type {
  Category,
  KitchenStation,
  Location,
  Money,
  NameTranslations,
  Product,
  QuickPadLayout,
  TaxMode,
  Tenant,
} from '@rbp/types';

/**
 * Catalog seed (CAT-001…006). Stored as a real backend would: tenant-wide categories/products,
 * plus per-location rows for availability, price overrides and Quick Pad order.
 * The API joins these into `LocationProduct` for the POS.
 */
export interface MockLocationProductRecord {
  tenantId: Tenant['id'];
  locationId: Location['id'];
  productId: Product['id'];
  isAvailable: boolean;
  priceOverride: Money | null;
  stockNote?: string;
  quickPadOrder: number;
  /** Switched off rows are kept (never deleted) so history and prices survive. */
  enabled: boolean;
  stationId: string | null;
  serviceCharge: boolean;
}

export interface MockKitchenStationRecord extends KitchenStation {
  tenantId: Tenant['id'];
}

export interface MockQuickPadLayoutRecord extends Pick<
  QuickPadLayout,
  'categoryOrder' | 'categoryColors' | 'productOrder' | 'updatedAt'
> {
  tenantId: Tenant['id'];
  locationId: Location['id'];
  /** null = the location layout; otherwise this device's own layout. */
  deviceId: string | null;
}

export interface CatalogSeed {
  categories: Category[];
  products: Product[];
  locationProducts: MockLocationProductRecord[];
  /** Saved CAT-007 layouts; locations without one use the default order. */
  quickPadLayouts: MockQuickPadLayoutRecord[];
  kitchenStations: MockKitchenStationRecord[];
}

const T1 = 'ten_01PILOT' as Tenant['id'];
const T2 = 'ten_02GROCERY' as Tenant['id'];
const MAIN = 'loc_01MAIN' as Location['id'];
const BAKERY = 'loc_01BAKERY' as Location['id'];
const GROCERY = 'loc_02TOWN' as Location['id'];

/** Demo translations (TODO(P6): native-speaker review). Keyed by category/product code. */
const TRANSLATIONS: Record<string, NameTranslations> = {
  RICE: { ta: 'சோறும் கறியும்', si: 'බත් සහ කරි' },
  FRIED: { ta: 'பொரித்த சோறு', si: 'ෆ්‍රයිඩ් රයිස්' },
  BIRIYANI: { ta: 'பிரியாணி', si: 'බුරියානි' },
  KOTTU: { ta: 'கொத்து', si: 'කොත්තු' },
  SHORT: { ta: 'சிற்றுண்டிகள்', si: 'කෙටි කෑම' },
  BAKERY: { ta: 'பேக்கரி', si: 'බේකරි' },
  DRINKS: { ta: 'பானங்கள்', si: 'බීම' },
  HOT: { ta: 'சூடான பானங்கள்', si: 'උණු බීම' },
  COLD: { ta: 'குளிர் பானங்கள்', si: 'සිසිල් බීම' },
  HOPPERS: { ta: 'அப்பம்', si: 'ආප්ප' },
  NOODLES: { ta: 'நூடில்ஸ்', si: 'නූඩ්ල්ස්' },
  SOUPS: { ta: 'சூப்', si: 'සුප්' },
  DEVILLED: { ta: 'டெவில் & கிரில்', si: 'ඩෙවල් සහ ග්‍රිල්' },
  DESSERTS: { ta: 'இனிப்புகள்', si: 'අතුරුපස' },
  H01: { ta: 'வெற்று அப்பம்', si: 'හුදු ආප්ප' },
  H02: { ta: 'முட்டை அப்பம்', si: 'බිත්තර ආප්ප' },
  H04: { ta: 'இடியப்பம் (10)', si: 'ඉඳිආප්ප (10)' },
  H05: { ta: 'பிட்டு', si: 'පිට්ටු' },
  E01: { ta: 'வட்டிலப்பம்', si: 'වටලප්පන්' },
  E02: { ta: 'தயிரும் பாணியும்', si: 'කිරි පැණි' },
  K01: { ta: 'கோழி கொத்து', si: 'චිකන් කොත්තු' },
  S01: { ta: 'மீன் பன்', si: 'මාළු පාන්' },
  D01: { ta: 'வெறும் தேநீர்', si: 'කහට' },
  D02: { ta: 'பால் தேநீர்', si: 'කිරි තේ' },
  R07: { ta: 'முட்டை சோறும் கறியும்', si: 'බිත්තර බත් සහ කරි' },
  R08: { ta: 'இறால் சோறும் கறியும்', si: 'ඉස්සෝ බත් සහ කරි' },
  R11: { ta: 'கோழி பொரித்த சோறு', si: 'චිකන් ෆ්‍රයිඩ් රයිස්' },
  R14: { ta: 'கோழி பிரியாணி', si: 'චිකන් බුරියානි' },
  K04: { ta: 'மரக்கறி கொத்து', si: 'එළවළු කොත්තු' },
  K05: { ta: 'கடலுணவு கொத்து', si: 'මුහුදු ආහාර කොත්තු' },
  K08: { ta: 'இடியப்ப கொத்து', si: 'ඉඳිආප්ප කොත්තු' },
  S06: { ta: 'வடை', si: 'වඩේ' },
  S07: { ta: 'சமோசா', si: 'සමෝසා' },
  S08: { ta: 'முட்டை ரொட்டி', si: 'බිත්තර රොටී' },
  B07: { ta: 'டோனட்', si: 'ඩෝනට්' },
  B08: { ta: 'கிரீம் பன்', si: 'ක්‍රීම් බනිස්' },
  D05: { ta: 'கோப்பி', si: 'කෝපි' },
  D06: { ta: 'இஞ்சி தேநீர்', si: 'ඉඟුරු තේ' },
  D09: { ta: 'தேசிக்காய் சாறு', si: 'දෙහි යුෂ' },
  D10: { ta: 'மாம்பழச் சாறு', si: 'අඹ යුෂ' },
  D11: { ta: 'விளாம்பழச் சாறு', si: 'දිවුල් යුෂ' },
  D13: { ta: 'செவ்விளநீர்', si: 'තැඹිලි' },
};

const SEEDED_AT = '2026-09-01T00:00:00.000Z';
const lkr = (rupees: number): Money => ({ amount: rupees * 100, currency: 'LKR' });

function category(
  tenantId: Tenant['id'],
  id: string,
  code: string,
  name: string,
  color: string,
  sortOrder: number,
  parentId: string | null = null,
): Category {
  return {
    id: id as Category['id'],
    tenantId,
    parentId: parentId as Category['parentId'],
    code,
    name,
    nameTranslations: TRANSLATIONS[code] ?? {},
    color,
    imageUrl: null,
    sortOrder,
    isActive: true,
    createdAt: SEEDED_AT,
    updatedAt: SEEDED_AT,
  };
}

function product(
  tenantId: Tenant['id'],
  id: string,
  categoryId: string,
  code: string,
  name: string,
  price: number,
  extra: { taxMode?: TaxMode; barcodes?: string[]; isActive?: boolean } = {},
): Product {
  return {
    id: id as Product['id'],
    tenantId,
    categoryId: categoryId as Category['id'],
    code,
    name,
    nameTranslations: TRANSLATIONS[code] ?? {},
    imageUrl: null,
    basePrice: lkr(price),
    taxMode: extra.taxMode ?? 'INCLUSIVE',
    barcodes: extra.barcodes ?? [],
    isActive: extra.isActive ?? true,
    showOnQuickPad: true,
    createdAt: SEEDED_AT,
    updatedAt: SEEDED_AT,
  };
}

export function createCatalogSeed(): CatalogSeed {
  const categories: Category[] = [
    category(T1, 'cat_01RICE', 'RICE', 'Rice & Curry', 'oklch(0.7 0.15 60)', 1),
    category(T1, 'cat_01KOTTU', 'KOTTU', 'Kottu', 'oklch(0.62 0.17 30)', 2),
    category(T1, 'cat_01SHORT', 'SHORT', 'Short Eats', 'oklch(0.72 0.14 100)', 3),
    category(T1, 'cat_01BAKERY', 'BAKERY', 'Bakery', 'oklch(0.6 0.12 330)', 4),
    category(T1, 'cat_01DRINKS', 'DRINKS', 'Drinks', 'oklch(0.6 0.13 230)', 5),
    category(T1, 'cat_01HOPPERS', 'HOPPERS', 'Hoppers', 'oklch(0.74 0.12 85)', 6),
    category(T1, 'cat_01NOODLES', 'NOODLES', 'Noodles', 'oklch(0.7 0.14 40)', 7),
    category(T1, 'cat_01SOUPS', 'SOUPS', 'Soups', 'oklch(0.66 0.1 150)', 8),
    category(T1, 'cat_01DEVILLED', 'DEVILLED', 'Devilled & Grills', 'oklch(0.58 0.18 25)', 9),
    category(T1, 'cat_01DESSERTS', 'DESSERTS', 'Desserts', 'oklch(0.7 0.12 350)', 10),
    // Sub-levels (REQ-118…127): Rice & Curry → Fried Rice / Biriyani, Drinks → Hot / Cold.
    category(T1, 'cat_01FRIED', 'FRIED', 'Fried Rice', 'oklch(0.72 0.15 75)', 1, 'cat_01RICE'),
    category(T1, 'cat_01BIRIYANI', 'BIRIYANI', 'Biriyani', 'oklch(0.66 0.15 50)', 2, 'cat_01RICE'),
    category(T1, 'cat_01HOT', 'HOT', 'Hot Drinks', 'oklch(0.58 0.14 30)', 1, 'cat_01DRINKS'),
    category(T1, 'cat_01COLD', 'COLD', 'Cold Drinks', 'oklch(0.65 0.12 210)', 2, 'cat_01DRINKS'),
    category(T2, 'cat_02DAIRY', 'DAIRY', 'Dairy', 'oklch(0.7 0.1 230)', 1),
    category(T2, 'cat_02DRY', 'DRY', 'Dry Goods', 'oklch(0.68 0.12 70)', 2),
  ];

  const products: Product[] = [
    product(T1, 'prd_01R01', 'cat_01RICE', 'R01', 'Chicken Rice & Curry', 800),
    product(T1, 'prd_01R02', 'cat_01RICE', 'R02', 'Vegetable Rice & Curry', 550),
    product(T1, 'prd_01R03', 'cat_01RICE', 'R03', 'Fish Rice & Curry', 750),
    product(T1, 'prd_01R04', 'cat_01FRIED', 'R04', 'Egg Fried Rice', 650),
    product(T1, 'prd_01R05', 'cat_01FRIED', 'R05', 'Seafood Fried Rice (Large, extra spicy)', 1450),
    product(T1, 'prd_01R06', 'cat_01BIRIYANI', 'R06', 'Mutton Biriyani', 1250),
    product(T1, 'prd_01K01', 'cat_01KOTTU', 'K01', 'Chicken Kottu', 900),
    product(T1, 'prd_01K02', 'cat_01KOTTU', 'K02', 'Cheese Kottu', 1100),
    product(T1, 'prd_01K03', 'cat_01KOTTU', 'K03', 'Egg Kottu', 750),
    product(T1, 'prd_01S01', 'cat_01SHORT', 'S01', 'Fish Bun', 120),
    product(T1, 'prd_01S02', 'cat_01SHORT', 'S02', 'Vegetable Roti', 90),
    product(T1, 'prd_01S03', 'cat_01SHORT', 'S03', 'Chicken Roll', 150),
    product(T1, 'prd_01S04', 'cat_01SHORT', 'S04', 'Fish Cutlet', 80),
    product(T1, 'prd_01S05', 'cat_01SHORT', 'S05', 'Egg Pastry', 130),
    product(T1, 'prd_01B01', 'cat_01BAKERY', 'B01', 'Chocolate Cake Slice', 350),
    product(T1, 'prd_01B02', 'cat_01BAKERY', 'B02', 'Butter Cake Slice', 250),
    product(T1, 'prd_01B03', 'cat_01BAKERY', 'B03', 'Sandwich Bread (450g)', 220, {
      barcodes: ['4790001000123'],
    }),
    product(T1, 'prd_01D01', 'cat_01HOT', 'D01', 'Plain Tea', 80),
    product(T1, 'prd_01D02', 'cat_01HOT', 'D02', 'Milk Tea', 120),
    product(T1, 'prd_01D03', 'cat_01COLD', 'D03', 'Iced Coffee', 450),
    // Discontinued: kept for history, never sold.
    product(T1, 'prd_01D04', 'cat_01COLD', 'D04', 'Faluda (old recipe)', 400, {
      isActive: false,
    }),
    // Fuller menu for demos. Appended so existing Quick Pad order and IDs don't move.
    product(T1, 'prd_01R07', 'cat_01RICE', 'R07', 'Egg Rice & Curry', 600),
    product(T1, 'prd_01R08', 'cat_01RICE', 'R08', 'Prawn Rice & Curry', 1100),
    product(T1, 'prd_01R09', 'cat_01RICE', 'R09', 'Mutton Rice & Curry', 1200),
    product(T1, 'prd_01R10', 'cat_01RICE', 'R10', 'Lamprais', 1350),
    product(T1, 'prd_01R11', 'cat_01FRIED', 'R11', 'Chicken Fried Rice', 900),
    product(T1, 'prd_01R12', 'cat_01FRIED', 'R12', 'Vegetable Fried Rice', 600),
    product(T1, 'prd_01R13', 'cat_01FRIED', 'R13', 'Nasi Goreng', 1150),
    product(T1, 'prd_01R14', 'cat_01BIRIYANI', 'R14', 'Chicken Biriyani', 1100),
    product(T1, 'prd_01R15', 'cat_01BIRIYANI', 'R15', 'Vegetable Biriyani', 750),
    product(T1, 'prd_01R16', 'cat_01BIRIYANI', 'R16', 'Egg Biriyani', 850),
    product(T1, 'prd_01K04', 'cat_01KOTTU', 'K04', 'Vegetable Kottu', 650),
    product(T1, 'prd_01K05', 'cat_01KOTTU', 'K05', 'Seafood Kottu', 1400),
    product(T1, 'prd_01K06', 'cat_01KOTTU', 'K06', 'Mutton Kottu', 1300),
    product(T1, 'prd_01K07', 'cat_01KOTTU', 'K07', 'Prawn Kottu', 1250),
    product(T1, 'prd_01K08', 'cat_01KOTTU', 'K08', 'String Hopper Kottu', 850),
    product(T1, 'prd_01K09', 'cat_01KOTTU', 'K09', 'Dolphin Kottu', 1000),
    product(T1, 'prd_01S06', 'cat_01SHORT', 'S06', 'Vadai', 60),
    product(T1, 'prd_01S07', 'cat_01SHORT', 'S07', 'Samosa', 80),
    product(T1, 'prd_01S08', 'cat_01SHORT', 'S08', 'Egg Roti', 140),
    product(T1, 'prd_01S09', 'cat_01SHORT', 'S09', 'Chicken Pastry', 150),
    product(T1, 'prd_01S10', 'cat_01SHORT', 'S10', 'Sausage Bun', 140),
    product(T1, 'prd_01S11', 'cat_01SHORT', 'S11', 'Seeni Sambol Bun', 100),
    product(T1, 'prd_01S12', 'cat_01SHORT', 'S12', 'Fish Patty', 90),
    product(T1, 'prd_01B04', 'cat_01BAKERY', 'B04', 'Ribbon Cake Slice', 280),
    product(T1, 'prd_01B05', 'cat_01BAKERY', 'B05', 'Swiss Roll Slice', 200),
    product(T1, 'prd_01B06', 'cat_01BAKERY', 'B06', 'Chocolate Eclair', 180),
    product(T1, 'prd_01B07', 'cat_01BAKERY', 'B07', 'Doughnut', 120),
    product(T1, 'prd_01B08', 'cat_01BAKERY', 'B08', 'Cream Bun', 110),
    product(T1, 'prd_01B09', 'cat_01BAKERY', 'B09', 'Banana Muffin', 180),
    product(T1, 'prd_01B10', 'cat_01BAKERY', 'B10', 'Butter Cake (1kg)', 2400, {
      barcodes: ['4790001000246'],
    }),
    product(T1, 'prd_01D05', 'cat_01HOT', 'D05', 'Coffee', 200),
    product(T1, 'prd_01D06', 'cat_01HOT', 'D06', 'Ginger Tea', 100),
    product(T1, 'prd_01D07', 'cat_01HOT', 'D07', 'Nescafe', 250),
    product(T1, 'prd_01D08', 'cat_01HOT', 'D08', 'Hot Chocolate', 400),
    product(T1, 'prd_01D09', 'cat_01COLD', 'D09', 'Fresh Lime Juice', 350),
    product(T1, 'prd_01D10', 'cat_01COLD', 'D10', 'Mango Juice', 450),
    product(T1, 'prd_01D11', 'cat_01COLD', 'D11', 'Woodapple Juice', 400),
    product(T1, 'prd_01D12', 'cat_01COLD', 'D12', 'Faluda', 550),
    product(T1, 'prd_01D13', 'cat_01COLD', 'D13', 'King Coconut', 250),
    product(T1, 'prd_01D14', 'cat_01COLD', 'D14', 'Bottled Water (500ml)', 100, {
      barcodes: ['4790001000512'],
    }),
    product(T1, 'prd_01H01', 'cat_01HOPPERS', 'H01', 'Plain Hopper', 50),
    product(T1, 'prd_01H02', 'cat_01HOPPERS', 'H02', 'Egg Hopper', 120),
    product(T1, 'prd_01H03', 'cat_01HOPPERS', 'H03', 'Milk Hopper', 80),
    product(T1, 'prd_01H04', 'cat_01HOPPERS', 'H04', 'String Hoppers (10)', 250),
    product(T1, 'prd_01H05', 'cat_01HOPPERS', 'H05', 'Pittu with Curry', 300),
    product(T1, 'prd_01N01', 'cat_01NOODLES', 'N01', 'Chicken Noodles', 950),
    product(T1, 'prd_01N02', 'cat_01NOODLES', 'N02', 'Vegetable Noodles', 650),
    product(T1, 'prd_01N03', 'cat_01NOODLES', 'N03', 'Seafood Noodles', 1300),
    product(T1, 'prd_01N04', 'cat_01NOODLES', 'N04', 'Egg Noodles', 750),
    product(T1, 'prd_01U01', 'cat_01SOUPS', 'U01', 'Chicken Soup', 450),
    product(T1, 'prd_01U02', 'cat_01SOUPS', 'U02', 'Sweet Corn Soup', 400),
    product(T1, 'prd_01U03', 'cat_01SOUPS', 'U03', 'Hot & Sour Soup', 500),
    product(T1, 'prd_01V01', 'cat_01DEVILLED', 'V01', 'Devilled Chicken', 1400),
    product(T1, 'prd_01V02', 'cat_01DEVILLED', 'V02', 'Devilled Prawns', 1800),
    product(T1, 'prd_01V03', 'cat_01DEVILLED', 'V03', 'Grilled Fish', 1600),
    product(T1, 'prd_01V04', 'cat_01DEVILLED', 'V04', 'Chicken Wings (6)', 1100),
    product(T1, 'prd_01E01', 'cat_01DESSERTS', 'E01', 'Watalappan', 350),
    product(T1, 'prd_01E02', 'cat_01DESSERTS', 'E02', 'Curd & Treacle', 400),
    product(T1, 'prd_01E03', 'cat_01DESSERTS', 'E03', 'Ice Cream (2 scoops)', 250),
    product(T1, 'prd_01E04', 'cat_01DESSERTS', 'E04', 'Fruit Salad', 450),
    product(T1, 'prd_01E05', 'cat_01DESSERTS', 'E05', 'Caramel Pudding', 300),

    product(T2, 'prd_02M01', 'cat_02DAIRY', 'M01', 'Fresh Milk 1L', 480, {
      taxMode: 'EXCLUSIVE',
      barcodes: ['4792222000017'],
    }),
    product(T2, 'prd_02M02', 'cat_02DAIRY', 'M02', 'Curd 1kg', 950, { taxMode: 'EXCLUSIVE' }),
    product(T2, 'prd_02G01', 'cat_02DRY', 'G01', 'Red Rice 5kg', 1650, { taxMode: 'EXCLUSIVE' }),
    product(T2, 'prd_02G02', 'cat_02DRY', 'G02', 'Dhal 1kg', 420, { taxMode: 'EXCLUSIVE' }),
  ];

  const at = (
    tenantId: Tenant['id'],
    locationId: Location['id'],
    productIds: string[],
    tweaks: Record<
      string,
      Partial<Pick<MockLocationProductRecord, 'isAvailable' | 'priceOverride' | 'stockNote'>>
    > = {},
  ): MockLocationProductRecord[] =>
    productIds.map((productId, i) => ({
      tenantId,
      locationId,
      productId: productId as Product['id'],
      isAvailable: true,
      priceOverride: null,
      quickPadOrder: i + 1,
      enabled: true,
      stationId: stationFor(locationId, productId),
      // The restaurant adds service charge; the bakery counter and grocery don't.
      serviceCharge: locationId === MAIN,
      ...tweaks[productId],
    }));

  // Main restaurant routes hot food to the kitchen and drinks to the bar; ready items need no KOT.
  const kitchenStations: MockKitchenStationRecord[] = [
    {
      tenantId: T1,
      id: 'st_01KITCHEN',
      locationId: MAIN,
      code: 'KIT',
      name: 'Main Kitchen',
      printerName: 'Kitchen Printer 1',
    },
    {
      tenantId: T1,
      id: 'st_01BAR',
      locationId: MAIN,
      code: 'BAR',
      name: 'Beverage Bar',
      printerName: 'Bar Printer',
    },
    {
      tenantId: T1,
      id: 'st_01BAKCOUNTER',
      locationId: BAKERY,
      code: 'CTR',
      name: 'Bakery Counter',
      printerName: 'Counter Printer',
    },
  ];
  function stationFor(locationId: string, productId: string): string | null {
    const categoryId = products.find((p) => p.id === productId)?.categoryId;
    if (locationId !== MAIN) return null;
    if (categoryId === 'cat_01HOT' || categoryId === 'cat_01COLD') return 'st_01BAR';
    if (categoryId === 'cat_01BAKERY' || categoryId === 'cat_01SHORT') return null;
    return 'st_01KITCHEN';
  }

  const t1Active = products.filter((p) => p.tenantId === T1).map((p) => p.id);
  const locationProducts: MockLocationProductRecord[] = [
    // Main restaurant sells everything (the inactive product is filtered by the API).
    ...at(T1, MAIN, t1Active, {
      prd_01R03: { stockNote: '3 left' },
      prd_01R06: { isAvailable: false },
      prd_01S05: { stockNote: '2 left' },
      prd_01D03: { priceOverride: lkr(400) },
      prd_01R10: { stockNote: 'Lunch only' },
      prd_01K05: { isAvailable: false },
      prd_01S09: { stockNote: '4 left' },
      prd_01D11: { stockNote: 'Seasonal' },
      prd_01H01: { stockNote: 'Evenings only' },
      prd_01V02: { isAvailable: false },
    }),
    // Bakery outlet: bakery + drinks only, tea is cheaper here.
    ...at(
      T1,
      BAKERY,
      [
        'prd_01B01',
        'prd_01B02',
        'prd_01B03',
        'prd_01D01',
        'prd_01D02',
        'prd_01B04',
        'prd_01B05',
        'prd_01B06',
        'prd_01B07',
        'prd_01B08',
        'prd_01B09',
        'prd_01B10',
        'prd_01S01',
        'prd_01S07',
        'prd_01S10',
        'prd_01S11',
        'prd_01D05',
        'prd_01D06',
        'prd_01D10',
        'prd_01D14',
      ],
      {
        prd_01D01: { priceOverride: lkr(70) },
        prd_01D06: { priceOverride: lkr(90) },
      },
    ),
    ...at(T2, GROCERY, ['prd_02M01', 'prd_02M02', 'prd_02G01', 'prd_02G02']),
  ];

  return { categories, products, locationProducts, quickPadLayouts: [], kitchenStations };
}
