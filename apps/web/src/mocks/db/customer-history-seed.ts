import type { Order, OrderLine, OrderType, PaymentMethod } from '@rbp/types';
import { computeTotals } from '@rbp/utils';
import type { MockDb } from './seed';

/**
 * Past sales for a few demo customers (CUS-003/004) and balances brought forward from the
 * previous system (CUS-005). Numbered `OLD-…` and dated before today, so today's sales
 * history and new invoice numbers are unaffected.
 */

const T1 = 'ten_01PILOT';
const MAIN = 'loc_01MAIN';
const BAKERY = 'loc_01BAKERY';

const daysAgo = (days: number, hour = 12) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, 15, 0, 0);
  return d.toISOString();
};

interface HistorySale {
  customerId: string;
  locationId: string;
  days: number;
  method: PaymentMethod;
  type?: OrderType;
  items: [productId: string, quantity: number][];
  delivery?: string;
}

const SALES: HistorySale[] = [
  {
    customerId: 'cus_01',
    locationId: MAIN,
    days: 22,
    method: 'CASH',
    items: [
      ['prd_01K01', 2],
      ['prd_01D02', 2],
    ],
  },
  {
    customerId: 'cus_01',
    locationId: BAKERY,
    days: 14,
    method: 'CARD',
    items: [
      ['prd_01B01', 4],
      ['prd_01D01', 2],
    ],
  },
  {
    customerId: 'cus_01',
    locationId: MAIN,
    days: 7,
    method: 'CASH',
    type: 'TAKEAWAY',
    items: [['prd_01R01', 3]],
  },
  {
    customerId: 'cus_02',
    locationId: MAIN,
    days: 17,
    method: 'CARD',
    type: 'DINE_IN',
    items: [
      ['prd_01R01', 2],
      ['prd_01K02', 1],
    ],
  },
  {
    customerId: 'cus_02',
    locationId: MAIN,
    days: 3,
    method: 'CARD',
    type: 'DELIVERY',
    delivery: '45 Temple Road, Jaffna',
    items: [
      ['prd_01K01', 2],
      ['prd_01D03', 2],
    ],
  },
  {
    customerId: 'cus_09',
    locationId: MAIN,
    days: 12,
    method: 'CREDIT',
    items: [
      ['prd_01S01', 30],
      ['prd_01D01', 30],
    ],
  },
  { customerId: 'cus_09', locationId: MAIN, days: 5, method: 'CREDIT', items: [['prd_01K01', 5]] },
];

/** Balances owed before these credit sales (seeded outstanding − history credit). */
const BROUGHT_FORWARD_DAYS = 30;

export function seedCustomerHistory(db: MockDb) {
  let n = 0;
  const credit: Record<string, number> = {};
  for (const sale of SALES) {
    const customer = db.customers.find((c) => c.id === sale.customerId)!;
    const settings = db.posSettings.find((s) => s.locationId === sale.locationId)!;
    const at = daysAgo(sale.days);
    const lines = sale.items.map(([productId, quantity]): OrderLine => {
      const product = db.products.find((p) => p.id === productId)!;
      const row = db.locationProducts.find(
        (r) => r.locationId === sale.locationId && r.productId === productId,
      );
      return {
        id: `oln_old_${++n}`,
        productId,
        code: product.code,
        name: product.name,
        nameTranslations: product.nameTranslations,
        quantity,
        cancelledQuantity: 0,
        returnedQuantity: 0,
        sentQuantity: quantity,
        unitPrice: row?.priceOverride ?? product.basePrice,
        taxMode: product.taxMode,
        serviceCharge: row?.serviceCharge ?? false,
      };
    });
    const totals = computeTotals(
      lines.map((l) => ({
        productId: l.productId,
        unitPrice: l.unitPrice,
        quantity: l.quantity,
        taxMode: l.taxMode,
        serviceCharge: l.serviceCharge,
      })),
      settings,
      'LKR',
    );
    const index = db.orders.length + 1;
    const order: Order & { tenantId: string } = {
      id: `ord_old_${index}`,
      tenantId: T1,
      number: `OLD-${sale.locationId === MAIN ? 'MAIN' : 'BAK'}-${String(index).padStart(4, '0')}`,
      type: sale.type ?? (sale.locationId === MAIN ? 'TAKEAWAY' : 'RETAIL'),
      status: 'PAID',
      table: sale.type === 'DINE_IN' ? { id: 'tbl_T2', name: 'T2' } : null,
      delivery: sale.delivery
        ? { address: sale.delivery, phone: customer.phones[0]!.number, status: 'DELIVERED' }
        : null,
      locationId: sale.locationId as Order['locationId'],
      deviceId: null,
      openedByDeviceId: null,
      customer: {
        id: customer.id,
        name: customer.name,
        phone: customer.phones.find((p) => p.primary)?.number ?? null,
      },
      lines,
      adjustments: [],
      totals,
      payments: [
        {
          id: `pay_old_${index}`,
          method: sale.method,
          amount: totals.total,
          status: 'CAPTURED',
          kind: 'SALE',
          createdAt: at,
          createdBy: 'Fathima Rizvi',
        },
      ],
      returns: [],
      createdBy: 'Fathima Rizvi',
      createdAt: at,
      paidAt: at,
    };
    db.orders.push(order);
    if (sale.method === 'CREDIT') {
      credit[customer.id] = (credit[customer.id] ?? 0) + totals.total.amount;
    }
    if (!customer.lastOrderAt || customer.lastOrderAt < at) customer.lastOrderAt = at;
    if (sale.delivery) customer.deliveryAddress = sale.delivery;
  }

  // Whatever the seeded balance doesn't explain by credit sales was owed before go-live.
  for (const c of db.customers) {
    const history = credit[c.id] ?? 0;
    if (c.outstanding.amount < history) c.outstanding = { ...c.outstanding, amount: history };
    const opening = c.outstanding.amount - history;
    if (opening > 0) {
      db.customerOpeningBalances[c.id] = { amount: opening, at: daysAgo(BROUGHT_FORWARD_DAYS, 8) };
    }
  }
}
