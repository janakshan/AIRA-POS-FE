import type { GoodsReceipt, PurchaseOrder, PurchaseOrderStatus, StockMovement } from '@rbp/types';
import type { MockDb, SupplierRecord } from './seed';

/**
 * PUR-* demo data for the pilot tenant. The outlets buy finished short eats and bakery goods
 * from outside suppliers (ingredients arrive with RECIPES, A-244). One PO of each status:
 * - PO-000001 received in full at Central Store (GRN-000001)
 * - PO-000002 cancelled
 * - PO-000003 part-received at Main (GRN-000002), fish cutlets still to come
 * - PO-000004 ordered for Main, overdue — receiving it fixes the Egg Pastry / Roti low stock
 * - PO-000005 ordered for the Bakery, due tomorrow
 * - PO-000006 draft
 * Received goods are PURCHASE movements on the ledger like any other stock change.
 */

const T1 = 'ten_01PILOT';
const MAIN = 'loc_01MAIN';
const BAKERY = 'loc_01BAKERY';
const STORE = 'loc_01STORE';
const OWNER = 'Nirmala Rajan';
const MANAGER = 'Suresh Kumar';

const at = (days: number, hour = 9) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};

/** Local YYYY-MM-DD, `days` from today (negative = past). */
const dateIn = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const lkr = (rupees: number) => ({ amount: rupees * 100, currency: 'LKR' as const });

const supplier = (
  n: number,
  name: string,
  extra: Partial<SupplierRecord> & { paymentTermsDays: number },
): SupplierRecord => ({
  id: `sup_0${n}`,
  tenantId: T1,
  code: `SUP-${String(n).padStart(3, '0')}`,
  name,
  isActive: true,
  createdAt: at(90),
  updatedAt: at(90),
  ...extra,
});

export function seedPurchasing(db: MockDb) {
  db.suppliers.push(
    supplier(1, 'Perera & Sons Bakery Supplies', {
      contactName: 'Chaminda Perera',
      phone: '+94112734561',
      email: 'orders@pererasons.lk',
      address: 'No. 45, Galle Road, Dehiwala',
      paymentTermsDays: 14,
      note: 'Delivers before 7 am. Bread and cake slices.',
    }),
    supplier(2, 'Galle Road Short Eats (Pvt) Ltd', {
      contactName: 'Mohamed Nazeer',
      phone: '+94777123456',
      email: 'sales@grshorteats.lk',
      address: '212 Galle Road, Wellawatte',
      paymentTermsDays: 7,
    }),
    supplier(3, 'Lanka Fresh Poultry', {
      contactName: 'Ruwan Jayasinghe',
      phone: '+94712233445',
      paymentTermsDays: 0,
      note: 'Chicken and eggs. Cash on delivery.',
    }),
    supplier(4, 'Ceylon Tea Traders', {
      contactName: 'Kavitha Raj',
      phone: '+94812224466',
      email: 'kavitha@ceylontea.lk',
      address: 'Peradeniya Road, Kandy',
      paymentTermsDays: 30,
    }),
    supplier(5, 'Colombo Packaging Co.', {
      contactName: 'Asanka Silva',
      phone: '+94115556677',
      paymentTermsDays: 30,
      isActive: false,
      note: 'No longer used — boxes now come with the short eats.',
      updatedAt: at(20),
    }),
  );

  const supplierName = (id: string) => db.suppliers.find((s) => s.id === id)!.name;
  const line = (productId: string, quantity: number, cost: number, receivedQuantity = 0) => {
    const p = db.products.find((x) => x.id === productId)!;
    return {
      productId,
      productName: p.name,
      productCode: p.code,
      unit: p.stockUnit ?? 'pcs',
      quantity,
      receivedQuantity,
      unitCost: lkr(cost),
    };
  };
  const po = (
    n: number,
    supplierId: string,
    locationId: string,
    status: PurchaseOrderStatus,
    createdDaysAgo: number,
    lines: PurchaseOrder['lines'],
    extra: Partial<PurchaseOrder> = {},
  ): PurchaseOrder & { tenantId: string } => ({
    id: `po_seed_${n}`,
    tenantId: T1,
    number: `PO-${String(n).padStart(6, '0')}`,
    supplierId,
    supplierName: supplierName(supplierId),
    locationId: locationId as PurchaseOrder['locationId'],
    status,
    lines,
    total: {
      amount: lines.reduce((s, l) => s + l.quantity * l.unitCost.amount, 0),
      currency: 'LKR',
    },
    createdBy: OWNER,
    createdAt: at(createdDaysAgo, 10),
    ...(status === 'DRAFT' ? {} : { orderedAt: at(createdDaysAgo, 11) }),
    receiptIds: [],
    ...extra,
  });

  db.purchaseOrders.push(
    po(
      1,
      'sup_01',
      STORE,
      'RECEIVED',
      12,
      [line('prd_01B01', 24, 240, 24), line('prd_01B02', 36, 160, 36)],
      { expectedDate: dateIn(-9), receiptIds: ['grn_seed_1'] },
    ),
    po(2, 'sup_02', MAIN, 'CANCELLED', 7, [line('prd_01S01', 40, 75)], {
      expectedDate: dateIn(-5),
      cancelledBy: OWNER,
      cancelledAt: at(6, 15),
      cancelReason: 'Raised twice — the fish buns are on the standing order',
    }),
    po(
      3,
      'sup_02',
      MAIN,
      'PARTIALLY_RECEIVED',
      5,
      [line('prd_01S03', 60, 95, 60), line('prd_01S04', 50, 45, 20)],
      {
        expectedDate: dateIn(-3),
        note: 'Cutlets short — balance promised next delivery',
        createdBy: MANAGER,
        receiptIds: ['grn_seed_2'],
      },
    ),
    po(4, 'sup_02', MAIN, 'ORDERED', 3, [line('prd_01S05', 40, 80), line('prd_01S02', 50, 55)], {
      expectedDate: dateIn(-1),
      createdBy: MANAGER,
    }),
    po(5, 'sup_01', BAKERY, 'ORDERED', 1, [line('prd_01B03', 60, 150)], {
      expectedDate: dateIn(1),
      createdBy: MANAGER,
    }),
    po(6, 'sup_01', STORE, 'DRAFT', 0, [line('prd_01B03', 100, 150), line('prd_01B01', 20, 240)], {
      expectedDate: dateIn(4),
      note: 'Weekend stock for the outlets',
    }),
  );

  // Deliveries: PURCHASE movements plus the GRNs.
  let n = 0;
  const receipt = (
    grn: number,
    poId: string,
    receivedAt: string,
    receivedBy: string,
    received: Record<string, number>,
    extra: Partial<GoodsReceipt> = {},
  ) => {
    const order = db.purchaseOrders.find((p) => p.id === poId)!;
    const id = `grn_seed_${grn}`;
    const number = `GRN-${String(grn).padStart(6, '0')}`;
    const lines = order.lines
      .filter((l) => (received[l.productId] ?? 0) > 0)
      .map((l) => ({
        productId: l.productId,
        productName: l.productName,
        productCode: l.productCode,
        unit: l.unit,
        orderedQuantity: l.quantity,
        receivedQuantity: received[l.productId]!,
        unitCost: l.unitCost,
        balanceAfter: 0,
      }));
    for (const l of lines) {
      db.stockMovements.push({
        id: `stm_pur_${++n}`,
        tenantId: T1,
        productId: l.productId,
        productName: l.productName,
        productCode: l.productCode,
        unit: l.unit,
        locationId: order.locationId,
        type: 'PURCHASE',
        quantity: l.receivedQuantity,
        balanceAfter: 0,
        reference: { kind: 'GOODS_RECEIPT', id, number },
        note: `${order.number} · ${order.supplierName}`,
        createdBy: receivedBy,
        at: receivedAt,
      });
    }
    db.goodsReceipts.push({
      id,
      tenantId: T1,
      number,
      purchaseOrderId: order.id,
      purchaseOrderNumber: order.number,
      supplierId: order.supplierId,
      supplierName: order.supplierName,
      locationId: order.locationId,
      lines,
      total: {
        amount: lines.reduce((s, l) => s + l.receivedQuantity * l.unitCost.amount, 0),
        currency: 'LKR',
      },
      receivedBy,
      receivedAt,
      ...extra,
    });
  };
  receipt(
    1,
    'po_seed_1',
    at(9, 7),
    OWNER,
    { prd_01B01: 24, prd_01B02: 36 },
    {
      supplierInvoiceRef: 'PSB/INV/4471',
    },
  );
  receipt(
    2,
    'po_seed_3',
    at(3, 8),
    MANAGER,
    { prd_01S03: 60, prd_01S04: 20 },
    {
      supplierInvoiceRef: 'GRS-10982',
      note: '30 cutlets short',
    },
  );

  // Receipts landed mid-history: re-run the balances of the touched items in time order.
  db.stockMovements.sort((a, b) => a.at.localeCompare(b.at));
  const touched = new Set(
    db.stockMovements
      .filter((m) => m.type === 'PURCHASE')
      .map((m) => `${m.productId}:${m.locationId}`),
  );
  const balances = new Map<string, number>();
  const byRef = new Map<string, StockMovement>();
  for (const m of db.stockMovements) {
    const key = `${m.productId}:${m.locationId}`;
    if (m.tenantId !== T1 || !touched.has(key)) continue;
    m.balanceAfter = (balances.get(key) ?? 0) + m.quantity;
    balances.set(key, m.balanceAfter);
    if (m.type === 'PURCHASE') byRef.set(`${m.reference.id}:${m.productId}`, m);
  }
  for (const g of db.goodsReceipts) {
    for (const l of g.lines)
      l.balanceAfter = byRef.get(`${g.id}:${l.productId}`)?.balanceAfter ?? 0;
  }

  db.orderSequences[`PO:${T1}`] = 6;
  db.orderSequences[`GRN:${T1}`] = 2;
}
