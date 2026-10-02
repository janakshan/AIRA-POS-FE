import type { StockMovement, WholesalePaymentMethod, WholesaleReturn } from '@rbp/types';
import { addDays, allocate, includedTax, openItems, outstandingOf } from '../wholesale';
import type { MockDb, WholesaleInvoiceRecord, WholesaleShopRecord } from './seed';

/**
 * WHO-* demo data (SCN-008 Wholesale Credit). Dinesh (rep@pilot.demo) drives Van 1 on two
 * routes; eight shops, two weeks of invoices, collections and one expired-goods return.
 * - Lakshmi Stores is just under its Rs 25,000 limit, so the next credit sale warns.
 * - Sea View Stores and Station Canteen have overdue invoices (7-day terms).
 * - Nimal Traders is new (no history). Today always has a route (Route A takes Sundays).
 * The van's opening stock covers the history and leaves a day's load on board.
 */

const T1 = 'ten_01PILOT';
const VAN = 'loc_01VAN1';
const REP = 'Dinesh Kumar';
const LKR = 'LKR' as const;
const lkr = (rupees: number) => ({ amount: Math.round(rupees * 100), currency: LKR });

/** Wholesale price per product (rupees, VAT inclusive). */
const PRICES: Record<string, number> = {
  prd_01B01: 290,
  prd_01B02: 200,
  prd_01B03: 180,
  prd_01S01: 95,
  prd_01S03: 120,
};

/** On the van at the end of the seed (a day's load). */
const VAN_TARGET: Record<string, number> = {
  prd_01B01: 24,
  prd_01B02: 24,
  prd_01B03: 40,
  prd_01S01: 80,
  prd_01S03: 50,
};

const B = {
  choc: 'prd_01B01',
  butter: 'prd_01B02',
  bread: 'prd_01B03',
  bun: 'prd_01S01',
  roll: 'prd_01S03',
};

const dayAt = (daysAgo: number, hour: number, minute = 0) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
};

interface ShopSeed {
  code: string;
  name: string;
  ownerName: string;
  phone: string;
  address: string;
  area: string;
  route: 'A' | 'B';
  limit: number;
  terms: number;
  opening?: { rupees: number; daysAgo: number };
  notes?: string;
}

const SHOPS: ShopSeed[] = [
  {
    code: 'SHP-001',
    name: 'Lakshmi Stores',
    ownerName: 'Lakshmi Devi',
    phone: '+94771100101',
    address: '12 Temple Road',
    area: 'Town',
    route: 'A',
    limit: 25_000,
    terms: 14,
    notes: 'Takes bread daily; pays on Fridays.',
  },
  {
    code: 'SHP-002',
    name: 'Perera Grocery',
    ownerName: 'Sunil Perera',
    phone: '+94771100102',
    address: '88 Main Street',
    area: 'Town',
    route: 'A',
    limit: 30_000,
    terms: 14,
  },
  {
    code: 'SHP-003',
    name: 'Hill Street Mini Mart',
    ownerName: 'Anton Fernando',
    phone: '+94771100103',
    address: '4 Hill Street',
    area: 'Town',
    route: 'A',
    limit: 15_000,
    terms: 14,
    opening: { rupees: 4_000, daysAgo: 20 },
  },
  {
    code: 'SHP-004',
    name: 'Fathima Tea Kade',
    ownerName: 'Fathima Nazeer',
    phone: '+94771100104',
    address: 'Bus stand, Market Road',
    area: 'Market',
    route: 'A',
    limit: 10_000,
    terms: 7,
  },
  {
    code: 'SHP-005',
    name: 'Coast Bakery Corner',
    ownerName: 'Ruwan Silva',
    phone: '+94771100105',
    address: '3 Beach Road',
    area: 'Coast',
    route: 'B',
    limit: 25_000,
    terms: 14,
  },
  {
    code: 'SHP-006',
    name: 'Sea View Stores',
    ownerName: 'Mohamed Rizan',
    phone: '+94771100106',
    address: '21 Harbour Lane',
    area: 'Coast',
    route: 'B',
    limit: 20_000,
    terms: 7,
    notes: 'Overdue — collect before selling more on credit.',
  },
  {
    code: 'SHP-007',
    name: 'Nimal Traders',
    ownerName: 'Nimal Jayasinghe',
    phone: '+94771100107',
    address: '67 Station Road',
    area: 'Coast',
    route: 'B',
    limit: 15_000,
    terms: 14,
  },
  {
    code: 'SHP-008',
    name: 'Station Canteen',
    ownerName: 'Kamala Wijesinghe',
    phone: '+94771100108',
    address: 'Railway station, Platform 1',
    area: 'Coast',
    route: 'B',
    limit: 12_000,
    terms: 7,
  },
];

type Event =
  | {
      kind: 'INVOICE';
      shop: string;
      daysAgo: number;
      lines: [string, number][];
      paid?: number;
      method?: WholesalePaymentMethod;
    }
  | {
      kind: 'COLLECTION';
      shop: string;
      daysAgo: number;
      rupees: number;
      method: WholesalePaymentMethod;
    }
  | {
      kind: 'RETURN';
      shop: string;
      daysAgo: number;
      invoiceOf: number;
      lines: [string, number, 'GOOD' | 'EXPIRED' | 'DAMAGED' | 'WASTAGE'][];
    };

const EVENTS: Event[] = [
  // Lakshmi Stores: 8,350 + 10,000 − 8,000 + 15,260 − 950 = 24,660 of 25,000.
  {
    kind: 'INVOICE',
    shop: 'SHP-001',
    daysAgo: 12,
    lines: [
      [B.bread, 20],
      [B.bun, 50],
    ],
  },
  {
    kind: 'INVOICE',
    shop: 'SHP-001',
    daysAgo: 9,
    lines: [
      [B.bread, 20],
      [B.butter, 24],
      [B.roll, 30],
    ],
    paid: 2_000,
    method: 'CASH',
  },
  { kind: 'COLLECTION', shop: 'SHP-001', daysAgo: 7, rupees: 8_000, method: 'CASH' },
  {
    kind: 'INVOICE',
    shop: 'SHP-001',
    daysAgo: 5,
    lines: [
      [B.bread, 25],
      [B.choc, 24],
      [B.bun, 40],
    ],
  },
  { kind: 'RETURN', shop: 'SHP-001', daysAgo: 5, invoiceOf: 12, lines: [[B.bun, 10, 'EXPIRED']] },
  // Perera Grocery: paid in full, then 6,000-ish on credit.
  {
    kind: 'INVOICE',
    shop: 'SHP-002',
    daysAgo: 7,
    lines: [
      [B.bread, 30],
      [B.choc, 12],
      [B.roll, 20],
    ],
    paid: 11_280,
    method: 'CASH',
  },
  {
    kind: 'INVOICE',
    shop: 'SHP-002',
    daysAgo: 2,
    lines: [
      [B.bread, 20],
      [B.bun, 25],
    ],
  },
  // Hill Street: opening 4,000 collected; a cash sale.
  { kind: 'COLLECTION', shop: 'SHP-003', daysAgo: 3, rupees: 4_000, method: 'BANK_TRANSFER' },
  {
    kind: 'INVOICE',
    shop: 'SHP-003',
    daysAgo: 3,
    lines: [
      [B.bread, 15],
      [B.butter, 12],
    ],
    paid: 5_100,
    method: 'CASH',
  },
  // Fathima Tea Kade: small credit.
  {
    kind: 'INVOICE',
    shop: 'SHP-004',
    daysAgo: 5,
    lines: [
      [B.bun, 20],
      [B.roll, 10],
    ],
  },
  // Coast Bakery Corner: part paid, then cleared.
  {
    kind: 'INVOICE',
    shop: 'SHP-005',
    daysAgo: 6,
    lines: [
      [B.bread, 20],
      [B.choc, 12],
      [B.butter, 12],
    ],
    paid: 3_000,
    method: 'CASH',
  },
  { kind: 'COLLECTION', shop: 'SHP-005', daysAgo: 1, rupees: 6_480, method: 'CASH' },
  // Sea View Stores: overdue.
  {
    kind: 'INVOICE',
    shop: 'SHP-006',
    daysAgo: 13,
    lines: [
      [B.bread, 30],
      [B.bun, 40],
    ],
  },
  {
    kind: 'INVOICE',
    shop: 'SHP-006',
    daysAgo: 11,
    lines: [
      [B.bread, 20],
      [B.roll, 20],
    ],
    paid: 1_000,
    method: 'CASH',
  },
  { kind: 'COLLECTION', shop: 'SHP-006', daysAgo: 4, rupees: 3_000, method: 'CASH' },
  // Station Canteen: overdue.
  {
    kind: 'INVOICE',
    shop: 'SHP-008',
    daysAgo: 10,
    lines: [
      [B.bun, 30],
      [B.roll, 15],
    ],
  },
];

export function seedWholesale(db: MockDb) {
  const product = (id: string) => db.products.find((p) => p.id === id)!;
  db.wholesalePrices[T1] = Object.fromEntries(
    Object.entries(PRICES).map(([id, rupees]) => [id, rupees * 100]),
  );

  // Today always has a route: Route A also runs on Sundays.
  const routeA = [1, 3, 5, 0];
  const routeB = [2, 4, 6];
  db.wholesaleRoutes.push(
    {
      id: 'rte_A',
      tenantId: T1,
      code: 'RT-A',
      name: 'Route A — Town & Market',
      days: routeA,
      vanLocationId: VAN as never,
      repName: REP,
    },
    {
      id: 'rte_B',
      tenantId: T1,
      code: 'RT-B',
      name: 'Route B — Coast',
      days: routeB,
      vanLocationId: VAN as never,
      repName: REP,
    },
  );

  const shopId = (code: string) => `shp_${code.slice(4)}`;
  const stops = { A: 0, B: 0 };
  for (const s of SHOPS) {
    const record: WholesaleShopRecord = {
      id: shopId(s.code),
      tenantId: T1,
      code: s.code,
      name: s.name,
      ownerName: s.ownerName,
      phones: [{ number: s.phone, primary: true }],
      address: s.address,
      area: s.area,
      routeId: `rte_${s.route}`,
      stopOrder: ++stops[s.route],
      creditLimit: lkr(s.limit),
      paymentTermsDays: s.terms,
      ...(s.notes ? { notes: s.notes } : {}),
      isActive: true,
      createdAt: dayAt(30, 9),
      openingBalance: s.opening ? s.opening.rupees * 100 : 0,
      openingAt: s.opening ? dayAt(s.opening.daysAgo, 9) : dayAt(30, 9),
    };
    db.wholesaleShops.push(record);
  }
  const shopByCode = (code: string) => db.wholesaleShops.find((s) => s.id === shopId(code))!;

  const movements: (StockMovement & { tenantId: string })[] = [];
  let mv = 0;
  const move = (
    productId: string,
    type: StockMovement['type'],
    quantity: number,
    at: string,
    reference: StockMovement['reference'],
    extra: Partial<StockMovement> = {},
  ) => {
    const p = product(productId);
    movements.push({
      id: `stm_who_${++mv}`,
      tenantId: T1,
      productId,
      productName: p.name,
      productCode: p.code,
      unit: p.stockUnit ?? 'pcs',
      locationId: VAN as StockMovement['locationId'],
      type,
      quantity,
      balanceAfter: 0,
      reference,
      createdBy: REP,
      at,
      ...extra,
    });
  };

  let inv = 0;
  let col = 0;
  let ret = 0;
  const invoicesByDay = new Map<string, WholesaleInvoiceRecord>();
  const ordered = [...EVENTS].sort(
    (a, b) => b.daysAgo - a.daysAgo || order(a.kind) - order(b.kind),
  );
  for (const e of ordered) {
    const shop = shopByCode(e.shop);
    if (e.kind === 'INVOICE') {
      const at = dayAt(e.daysAgo, 9 + shop.stopOrder, 15);
      const lines = e.lines.map(([productId, quantity]) => {
        const p = product(productId);
        const unitPrice = PRICES[productId]! * 100;
        return {
          productId,
          code: p.code,
          name: p.name,
          unit: p.stockUnit ?? ('pcs' as const),
          quantity,
          unitPrice: { amount: unitPrice, currency: LKR },
          lineTotal: { amount: unitPrice * quantity, currency: LKR },
          returnedQuantity: 0,
        };
      });
      const total = lines.reduce((s, l) => s + l.lineTotal.amount, 0);
      const paid = Math.min(total, (e.paid ?? 0) * 100);
      const before = outstandingOf(db, shop);
      const id = `win_seed_${inv + 1}`;
      const number = `WIN-${String(++inv).padStart(6, '0')}`;
      const record: WholesaleInvoiceRecord = {
        id,
        tenantId: T1,
        number,
        shopId: shop.id,
        shopName: shop.name,
        shopPhone: shop.phones[0]?.number ?? null,
        routeId: shop.routeId,
        locationId: VAN as never,
        lines,
        total: { amount: total, currency: LKR },
        tax: { amount: includedTax(total, 1800), currency: LKR },
        taxLabel: 'VAT',
        taxRateBps: 1800,
        paidNow: paid
          ? { method: e.method ?? 'CASH', amount: { amount: paid, currency: LKR } }
          : null,
        credit: { amount: total - paid, currency: LKR },
        dueDate: addDays(at, shop.paymentTermsDays),
        creditWarning: false,
        balanceBefore: { amount: before, currency: LKR },
        balanceAfter: { amount: before + total - paid, currency: LKR },
        shares: [],
        prints: [{ at, by: REP }],
        createdBy: REP,
        at,
      };
      db.wholesaleInvoices.push(record);
      invoicesByDay.set(`${e.shop}:${e.daysAgo}`, record);
      const ref = { kind: 'WHOLESALE_INVOICE' as const, id, number };
      for (const l of lines) move(l.productId, 'SALE', -l.quantity, at, ref, { note: shop.name });
    } else if (e.kind === 'COLLECTION') {
      const at = dayAt(e.daysAgo, 9 + shop.stopOrder, 30);
      const amount = e.rupees * 100;
      const allocations = allocate(openItems(db, shop), amount, LKR);
      db.wholesaleCollections.push({
        id: `col_seed_${col + 1}`,
        tenantId: T1,
        number: `COL-${String(++col).padStart(6, '0')}`,
        shopId: shop.id,
        shopName: shop.name,
        routeId: shop.routeId,
        amount: { amount, currency: LKR },
        method: e.method,
        allocations,
        balanceAfter: { amount: outstandingOf(db, shop) - amount, currency: LKR },
        receivedBy: REP,
        at,
      });
    } else {
      const at = dayAt(e.daysAgo, 9 + shop.stopOrder, 45);
      const invoice = invoicesByDay.get(`${e.shop}:${e.invoiceOf}`)!;
      const id = `wrn_seed_${ret + 1}`;
      const number = `WRN-${String(++ret).padStart(6, '0')}`;
      const lines = e.lines.map(([productId, quantity, condition]) => {
        const line = invoice.lines.find((l) => l.productId === productId)!;
        line.returnedQuantity += quantity;
        return {
          productId,
          code: line.code,
          name: line.name,
          unit: line.unit,
          quantity,
          condition,
          unitCredit: line.unitPrice,
          lineCredit: { amount: line.unitPrice.amount * quantity, currency: LKR },
        };
      });
      const credit = lines.reduce((s, l) => s + l.lineCredit.amount, 0);
      const reason = { code: 'EXPIRED', label: 'Expired' };
      const record: WholesaleReturn & { tenantId: string } = {
        id,
        tenantId: T1,
        number,
        shopId: shop.id,
        shopName: shop.name,
        routeId: shop.routeId,
        invoiceId: invoice.id,
        invoiceNumber: invoice.number,
        locationId: VAN as never,
        lines,
        credit: { amount: credit, currency: LKR },
        allocations: allocate(openItems(db, shop), credit, LKR, invoice.id),
        balanceAfter: { amount: outstandingOf(db, shop) - credit, currency: LKR },
        reason,
        approvedBy: REP,
        recordedBy: REP,
        at,
      };
      db.wholesaleReturns.push(record);
      const ref = { kind: 'WHOLESALE_RETURN' as const, id, number };
      for (const l of lines) {
        move(l.productId, 'RETURN', l.quantity, at, ref, { note: `${shop.name} · ${l.condition}` });
        if (l.condition !== 'GOOD') {
          move(l.productId, 'WASTAGE', -l.quantity, at, ref, { reason, approvedBy: REP });
        }
      }
    }
  }

  // Van opening stock: today's load plus everything the history sold (net of returns).
  const net = new Map<string, number>();
  for (const x of movements) net.set(x.productId, (net.get(x.productId) ?? 0) + x.quantity);
  const opening = dayAt(15, 6);
  for (const [productId, target] of Object.entries(VAN_TARGET)) {
    move(
      productId,
      'OPENING',
      target - (net.get(productId) ?? 0),
      opening,
      {
        kind: 'OPENING',
        id: null,
        number: 'Opening stock',
      },
      { createdBy: 'Nirmala Rajan' },
    );
  }
  movements.sort((a, b) => a.at.localeCompare(b.at));
  const balances = new Map<string, number>();
  for (const x of movements) {
    const b = (balances.get(x.productId) ?? 0) + x.quantity;
    balances.set(x.productId, b);
    x.balanceAfter = b;
  }
  db.stockMovements.push(...movements);
  db.stockMovements.sort((a, b) => a.at.localeCompare(b.at));

  db.orderSequences[`WIN:${T1}`] = inv;
  db.orderSequences[`COL:${T1}`] = col;
  db.orderSequences[`WRN:${T1}`] = ret;
}

/** Same day: sell, then collect, then take returns. */
const order = (kind: Event['kind']) => (kind === 'INVOICE' ? 0 : kind === 'COLLECTION' ? 1 : 2);
