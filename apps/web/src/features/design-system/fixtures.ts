import type { Money } from '@rbp/types';

/**
 * Demo data for the UI Kit only (DS-001). Real screens get data from the API client —
 * never from arrays inside components.
 */
const lkr = (rupees: number): Money => ({ amount: rupees * 100, currency: 'LKR' });

export const DS_CATEGORIES = [
  { id: 'rice', label: 'Rice & Curry', color: 'oklch(0.7 0.15 60)' },
  { id: 'kottu', label: 'Kottu', color: 'oklch(0.62 0.17 30)' },
  { id: 'short-eats', label: 'Short Eats', color: 'oklch(0.72 0.14 100)' },
  { id: 'bakery', label: 'Bakery', color: 'oklch(0.6 0.12 330)' },
  { id: 'drinks', label: 'Drinks', color: 'oklch(0.6 0.13 230)' },
];

export interface DsProduct {
  id: string;
  categoryId: string;
  name: string;
  code: string;
  price: Money;
  stockNote?: string;
  unavailable?: boolean;
}

export const DS_PRODUCTS: DsProduct[] = [
  { id: 'p1', categoryId: 'rice', name: 'Chicken Rice & Curry', code: 'R01', price: lkr(800) },
  { id: 'p2', categoryId: 'rice', name: 'Vegetable Rice & Curry', code: 'R02', price: lkr(550) },
  {
    id: 'p3',
    categoryId: 'rice',
    name: 'Fish Rice & Curry',
    code: 'R03',
    price: lkr(750),
    stockNote: '3 left',
  },
  { id: 'p4', categoryId: 'rice', name: 'Egg Fried Rice', code: 'R04', price: lkr(650) },
  {
    id: 'p5',
    categoryId: 'rice',
    name: 'Seafood Fried Rice (Large, extra spicy)',
    code: 'R05',
    price: lkr(1450),
  },
  {
    id: 'p6',
    categoryId: 'rice',
    name: 'Mutton Biriyani',
    code: 'R06',
    price: lkr(1250),
    unavailable: true,
  },
  { id: 'p7', categoryId: 'kottu', name: 'Chicken Kottu', code: 'K01', price: lkr(900) },
  { id: 'p8', categoryId: 'kottu', name: 'Cheese Kottu', code: 'K02', price: lkr(1100) },
  { id: 'p13', categoryId: 'kottu', name: 'Egg Kottu', code: 'K03', price: lkr(750) },
  { id: 'p9', categoryId: 'short-eats', name: 'Fish Bun', code: 'S01', price: lkr(120) },
  { id: 'p10', categoryId: 'short-eats', name: 'Vegetable Roti', code: 'S02', price: lkr(90) },
  { id: 'p14', categoryId: 'short-eats', name: 'Chicken Roll', code: 'S03', price: lkr(150) },
  { id: 'p15', categoryId: 'short-eats', name: 'Fish Cutlet', code: 'S04', price: lkr(80) },
  {
    id: 'p16',
    categoryId: 'short-eats',
    name: 'Egg Pastry',
    code: 'S05',
    price: lkr(130),
    stockNote: '2 left',
  },
  { id: 'p11', categoryId: 'bakery', name: 'Chocolate Cake Slice', code: 'B01', price: lkr(350) },
  { id: 'p17', categoryId: 'bakery', name: 'Butter Cake Slice', code: 'B02', price: lkr(250) },
  { id: 'p12', categoryId: 'drinks', name: 'Plain Tea', code: 'D01', price: lkr(80) },
  { id: 'p18', categoryId: 'drinks', name: 'Milk Tea', code: 'D02', price: lkr(120) },
  { id: 'p19', categoryId: 'drinks', name: 'Iced Coffee', code: 'D03', price: lkr(450) },
];

/** Categories with live product counts, so the rail never disagrees with the grid. */
export const DS_CATEGORIES_WITH_COUNT = DS_CATEGORIES.map((c) => ({
  ...c,
  count: DS_PRODUCTS.filter((p) => p.categoryId === c.id).length,
}));

export const DS_ORDER_STATUSES = [
  'DRAFT',
  'PENDING',
  'PREPARING',
  'READY',
  'COMPLETED',
  'CANCELLED',
] as const;

export interface DsOrder {
  id: string;
  number: string;
  customer: string;
  type: 'Dine-in' | 'Takeaway' | 'Delivery' | 'Retail';
  items: number;
  total: Money;
  status: (typeof DS_ORDER_STATUSES)[number];
  placedAt: string;
}

const CUSTOMERS = [
  'Walk-in',
  'Kavitha S.',
  'Mohamed R.',
  'Nuwan P.',
  'Table 4',
  'Table 7',
  'Anjali K.',
  'Walk-in',
];
const TYPES: DsOrder['type'][] = ['Dine-in', 'Takeaway', 'Delivery', 'Retail'];

/** 42 deterministic orders for paging/sorting demos. */
const pick = <T>(list: readonly T[], n: number, fallback: T): T =>
  list[n % list.length] ?? fallback;

export const DS_ORDERS: DsOrder[] = Array.from({ length: 42 }, (_, i) => {
  const n = i + 1;
  return {
    id: `o${n}`,
    number: `ORD-${String(1040 + n).padStart(5, '0')}`,
    customer: pick(CUSTOMERS, n, 'Walk-in'),
    type: pick(TYPES, n, 'Retail'),
    items: 1 + ((n * 7) % 9),
    total: lkr(350 + ((n * 977) % 8200)),
    status: pick(DS_ORDER_STATUSES, n, 'DRAFT'),
    placedAt: new Date(Date.UTC(2026, 8, 26, 2 + Math.floor(n / 4), (n * 13) % 60)).toISOString(),
  };
});

export const DS_REASONS = [
  { code: 'CUSTOMER_CHANGED', label: 'Customer changed order' },
  { code: 'WRONG_ITEM', label: 'Wrong item entered' },
  { code: 'WRONG_QTY', label: 'Wrong quantity entered' },
  { code: 'KITCHEN_MISTAKE', label: 'Kitchen mistake' },
  { code: 'UNAVAILABLE', label: 'Product unavailable' },
  { code: 'OTHER', label: 'Other' },
];
