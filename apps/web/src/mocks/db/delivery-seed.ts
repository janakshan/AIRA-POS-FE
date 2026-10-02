import type { DeliveryStatus, Order, OrderLine, SaleAdjustment, StockMovement } from '@rbp/types';
import { computeTotals } from '@rbp/utils';
import type { MockDb } from './seed';

/**
 * DEL-* demo (SCN-009): today's phone orders for delivery from Main, one at each stage, plus
 * two delivered earlier. They're numbered PH-MAIN-… (phone orders) so POS invoice numbers
 * still start at MAIN-000001.
 * - PH-MAIN-0001 NEW, unpaid · PH-MAIN-0002 CONFIRMED, unpaid
 * - PH-MAIN-0003 READY, paid by card, assigned to Sameera
 * - PH-MAIN-0004 OUT_FOR_DELIVERY with Sameera, cash on delivery
 * - PH-MAIN-0005/0006 DELIVERED this morning (stock posted; openings topped up to match)
 * Each carries the location's Rs 250 delivery charge.
 */

const T1 = 'ten_01PILOT';
const MAIN = 'loc_01MAIN';
const DISPATCH = 'Fathima Rizvi';
const RIDER = { id: 'emp_10', name: 'Sameera Bandara' };

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

interface DeliverySeed {
  customerId: string;
  address: string;
  instructions?: string;
  items: [string, number][];
  status: DeliveryStatus;
  /** Minutes ago the order was taken. */
  age: number;
  paid?: 'CARD' | 'CASH';
  rider?: boolean;
}

const SEEDS: DeliverySeed[] = [
  {
    customerId: 'cus_05',
    address: '18 Park Street, Colombo 02',
    instructions: 'Call on arrival — 3rd floor, no lift',
    items: [
      ['prd_01K01', 2],
      ['prd_01D03', 2],
    ],
    status: 'NEW',
    age: 4,
  },
  {
    customerId: 'cus_06',
    address: '7/2 Lotus Lane, Dehiwala',
    instructions: 'Less spicy, please',
    items: [
      ['prd_01K02', 1],
      ['prd_01S01', 4],
    ],
    status: 'CONFIRMED',
    age: 12,
  },
  {
    customerId: 'cus_07',
    address: '221 High Level Road, Nugegoda',
    items: [['prd_01K03', 3]],
    status: 'READY',
    age: 35,
    paid: 'CARD',
    rider: true,
  },
  {
    customerId: 'cus_08',
    address: 'Flat 4B, Marine Drive Apartments, Wellawatte',
    instructions: 'Gate code 2468',
    items: [
      ['prd_01K01', 1],
      ['prd_01S03', 2],
    ],
    status: 'OUT_FOR_DELIVERY',
    age: 50,
    rider: true,
  },
  {
    customerId: 'cus_10',
    address: '9 School Lane, Kotahena',
    items: [['prd_01K03', 2]],
    status: 'DELIVERED',
    age: 180,
    paid: 'CASH',
    rider: true,
  },
  {
    customerId: 'cus_03',
    address: '56 Canal Row, Colombo 01',
    items: [
      ['prd_01K02', 1],
      ['prd_01D03', 1],
    ],
    status: 'DELIVERED',
    age: 150,
    paid: 'CARD',
    rider: true,
  },
];

const FLOW: DeliveryStatus[] = [
  'NEW',
  'CONFIRMED',
  'PREPARING',
  'READY',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
];

export function seedDeliveries(db: MockDb) {
  const settings = db.posSettings.find((s) => s.locationId === MAIN)!;
  const charge = db.chargeTypes[MAIN]?.find((c) => c.code === 'DELIVERY');
  const sold = new Map<string, number>();
  let n = 0;
  SEEDS.forEach((seed, i) => {
    const no = i + 1;
    const orderId = `ord_del_${no}`;
    const customer = db.customers.find((c) => c.id === seed.customerId)!;
    const phone = customer.phones.find((p) => p.primary)!.number;
    const createdAt = minutesAgo(seed.age);
    const stepsDone = FLOW.indexOf(seed.status);
    const lines = seed.items.map(([productId, quantity]): OrderLine => {
      const product = db.products.find((p) => p.id === productId)!;
      const row = db.locationProducts.find(
        (r) => r.locationId === MAIN && r.productId === productId,
      );
      return {
        id: `oln_del_${++n}`,
        productId,
        code: product.code,
        name: product.name,
        nameTranslations: product.nameTranslations,
        quantity,
        cancelledQuantity: 0,
        returnedQuantity: 0,
        // Confirmed orders haven't gone to the kitchen yet.
        sentQuantity: stepsDone >= FLOW.indexOf('PREPARING') ? quantity : 0,
        unitPrice: row?.priceOverride ?? product.basePrice,
        taxMode: product.taxMode,
        serviceCharge: false,
      };
    });
    const adjustments: SaleAdjustment[] = charge
      ? [
          {
            id: `adj_del_${no}`,
            kind: 'CHARGE',
            scope: 'ORDER',
            mode: 'FIXED',
            value: charge.defaultValue ?? 25_000,
            chargeCode: 'DELIVERY',
            label: charge.name,
            status: 'ACTIVE',
            reason: null,
            approvedBy: null,
            createdBy: DISPATCH,
            createdAt,
            locationId: MAIN as SaleAdjustment['locationId'],
            deviceId: 'dev_01',
          },
        ]
      : [];
    const totals = computeTotals(
      lines.map((l) => ({
        productId: l.productId,
        unitPrice: l.unitPrice,
        quantity: l.quantity,
        taxMode: l.taxMode,
        serviceCharge: l.serviceCharge,
      })),
      { serviceChargeBps: 0, taxRateBps: settings.taxRateBps },
      'LKR',
      adjustments,
    );
    // Timeline: evenly spaced from taken to now-ish.
    const history = FLOW.slice(0, stepsDone + 1).map((status, k) => ({
      status,
      at: minutesAgo(seed.age - k * Math.max(1, Math.floor(seed.age / (stepsDone + 2)))),
      by:
        status === 'READY'
          ? 'Kitchen'
          : status === 'OUT_FOR_DELIVERY' || status === 'DELIVERED'
            ? RIDER.name
            : DISPATCH,
    }));
    const paidAt = seed.paid
      ? seed.status === 'DELIVERED' && seed.paid === 'CASH'
        ? history.at(-1)!.at
        : minutesAgo(seed.age - 1)
      : undefined;
    const order: Order & { tenantId: string } = {
      id: orderId,
      tenantId: T1,
      number: `PH-MAIN-${String(no).padStart(4, '0')}`,
      type: 'DELIVERY',
      status: seed.paid ? 'PAID' : 'OPEN',
      table: null,
      delivery: {
        address: seed.address,
        phone,
        ...(seed.instructions ? { instructions: seed.instructions } : {}),
        status: seed.status,
        ...(seed.rider
          ? {
              riderId: RIDER.id,
              riderName: RIDER.name,
              assignedAt: history.find((h) => h.status === 'READY')?.at ?? createdAt,
            }
          : {}),
        history,
      },
      locationId: MAIN as Order['locationId'],
      // Phone orders: not rung up on a till (the counter drawer never sees rider cash).
      deviceId: null,
      openedByDeviceId: null,
      customer: { id: customer.id, name: customer.name, phone },
      lines,
      adjustments,
      totals,
      payments: seed.paid
        ? [
            {
              id: `pay_del_${no}`,
              method: seed.paid,
              amount: totals.total,
              status: 'CAPTURED',
              kind: 'SALE',
              createdAt: paidAt!,
              createdBy: seed.paid === 'CASH' ? RIDER.name : DISPATCH,
              ...(seed.paid === 'CASH'
                ? { tendered: totals.total, change: { amount: 0, currency: 'LKR' as const } }
                : { reference: `AUTH-${400100 + no}` }),
            },
          ]
        : [],
      returns: [],
      createdBy: DISPATCH,
      createdAt,
      ...(paidAt ? { paidAt } : {}),
    };
    db.orders.push(order);
    for (const a of adjustments) db.adjustments.push({ ...a, tenantId: T1, orderId });
    customer.deliveryAddress ??= seed.address;

    // Paid orders left stock when paid.
    if (seed.paid) {
      for (const l of lines) {
        const product = db.products.find((p) => p.id === l.productId)!;
        sold.set(l.productId, (sold.get(l.productId) ?? 0) + l.quantity);
        db.stockMovements.push({
          id: `stm_del_${no}_${l.productId}`,
          tenantId: T1,
          productId: l.productId,
          productName: product.name,
          productCode: product.code,
          unit: product.stockUnit ?? 'pcs',
          locationId: MAIN as StockMovement['locationId'],
          type: 'SALE',
          quantity: -l.quantity,
          balanceAfter: 0,
          reference: { kind: 'ORDER', id: orderId, number: order.number },
          createdBy: DISPATCH,
          at: paidAt!,
        });
      }
    }
  });

  // Top the openings up by what these deliveries sold, so Main's stock stays where INV-* had it.
  for (const [productId, qty] of sold) {
    const open = db.stockMovements.find(
      (m) =>
        m.tenantId === T1 &&
        m.type === 'OPENING' &&
        m.productId === productId &&
        m.locationId === MAIN,
    );
    if (open) open.quantity += qty;
  }
  db.stockMovements.sort((a, b) => a.at.localeCompare(b.at));
  const balances = new Map<string, number>();
  for (const m of db.stockMovements) {
    if (m.tenantId !== T1 || m.locationId !== MAIN || !sold.has(m.productId)) continue;
    const b = (balances.get(m.productId) ?? 0) + m.quantity;
    balances.set(m.productId, b);
    m.balanceAfter = b;
  }
}
