import type {
  AuditEvent,
  EmployeeId,
  Order,
  OrderApproval,
  OrderLine,
  OrderType,
  Payment,
  PaymentMethod,
  SaleAdjustment,
} from '@rbp/types';
import { computeTotals, formatMoney } from '@rbp/utils';
import type { MockDb } from './seed';

/** Audit summaries show money with its currency, like the live events. */
const lkr = (amount: number) => formatMoney({ amount, currency: 'LKR' });

/**
 * REP-* history (A-290): 30 days of POS sales before today at Main and the Bakery, with the
 * exceptions REP-005 is about — manager-approved discounts and price changes, removed items,
 * cancelled orders, same-day voids and returns — each with its audit event.
 *
 * Numbered HX-MAIN-… / HX-BAK-…, no customer, no device, never DELIVERY or CREDIT, so today's
 * POS, invoice numbers, cash shifts, customer history and the delivery board are unaffected.
 * Runs before seedInventory: openings absorb what was sold, so on-hand figures don't move.
 * Returns here aren't restocked (the goods were disposed of).
 */

const T1 = 'ten_01PILOT';
const MAIN = { id: 'loc_01MAIN', code: 'MAIN', name: 'Main Restaurant' };
const BAKERY = { id: 'loc_01BAKERY', code: 'BAK', name: 'Bakery Outlet' };
const MANAGER = { id: 'emp_02' as EmployeeId, code: 'E002', fullName: 'Suresh Kumar' };
const OWNER = { id: 'emp_01' as EmployeeId, code: 'E001', fullName: 'Nirmala Rajan' };
const DAYS = 30;
const USER_IDS: Record<string, string> = {
  'Fathima Rizvi': 'usr_03',
  'Kasun Perera': 'usr_04',
  'Priya Nathan': 'usr_02',
};

/** Deterministic PRNG so the demo (and screenshots) are stable. */
function prng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const REASONS = {
  loyal: { code: 'LOYAL_CUSTOMER', label: 'Loyal customer' },
  complaint: { code: 'COMPLAINT', label: 'Customer complaint' },
  priceFix: { code: 'PRICE_CORRECTION', label: 'Price correction' },
  changed: { code: 'CUSTOMER_CHANGED', label: 'Customer changed order' },
  wrongItem: { code: 'WRONG_ITEM', label: 'Wrong item entered' },
  duplicate: { code: 'DUPLICATE_SALE', label: 'Duplicate sale' },
  returned: { code: 'CUSTOMER_RETURNED', label: 'Customer returned item' },
  damaged: { code: 'DAMAGED', label: 'Damaged item' },
};

interface Where {
  id: string;
  code: string;
  name: string;
  perDay: [number, number];
  types: OrderType[];
  cashiers: string[];
}

const PLACES: Where[] = [
  {
    ...MAIN,
    perDay: [10, 14],
    types: ['TAKEAWAY', 'TAKEAWAY', 'DINE_IN', 'DINE_IN', 'RETAIL'],
    cashiers: ['Fathima Rizvi', 'Fathima Rizvi', 'Kasun Perera'],
  },
  { ...BAKERY, perDay: [8, 10], types: ['RETAIL'], cashiers: ['Priya Nathan'] },
];

export function seedReportHistory(db: MockDb) {
  const rand = prng(20260901);
  const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)]!;
  const between = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1));
  const audit: AuditEvent[] = [];
  let auditNo = 0;
  const addAudit = (
    at: string,
    where: Where,
    userName: string,
    action: string,
    order: { id: string; number: string },
    label: string,
    reason: AuditEvent['reason'],
    employee = MANAGER,
  ) =>
    audit.push({
      id: `aud_hx_${++auditNo}`,
      tenantId: T1,
      locationId: where.id,
      deviceId: null,
      userId: USER_IDS[userName] ?? 'usr_02',
      userName,
      employee,
      permission: null,
      action,
      entity: 'order',
      entityId: order.id,
      entityLabel: `${order.number} · ${label}`,
      before: null,
      after: null,
      reason,
      locationName: where.name,
      deviceName: null,
      at,
    });

  for (const where of PLACES) {
    const settings = db.posSettings.find((s) => s.locationId === where.id)!;
    const menu = db.locationProducts
      .filter((r) => r.locationId === where.id && r.enabled)
      .map((r) => ({ row: r, product: db.products.find((p) => p.id === r.productId)! }))
      .filter((x) => x.product && x.product.kind !== 'INGREDIENT' && x.product.isActive)
      // Sandwich bread stays the INV-* low-stock / transfer demo (its short history is the story).
      .filter((x) => x.product.id !== 'prd_01B03');
    let seq = 0;
    let rtn = 0;
    for (let daysAgo = DAYS; daysAgo >= 1; daysAgo--) {
      const count =
        between(...where.perDay) +
        (new Date(Date.now() - daysAgo * 86_400_000).getDay() % 6 === 5 ? 3 : 0);
      for (let k = 0; k < count; k++) {
        const created = new Date();
        created.setDate(created.getDate() - daysAgo);
        // Lunch and dinner peaks.
        const hour =
          rand() < 0.45 ? between(11, 14) : rand() < 0.6 ? between(18, 21) : between(8, 17);
        created.setHours(hour, between(0, 59), between(0, 59), 0);
        const createdAt = created.toISOString();
        const number = `HX-${where.code}-${String(++seq).padStart(6, '0')}`;
        const id = `ord_hx_${where.code}_${seq}`;
        const cashier = pick(where.cashiers);
        const type = pick(where.types);
        const chosen = new Set<string>();
        const lines: OrderLine[] = [];
        for (let n = between(1, 4); n > 0; n--) {
          const item = pick(menu);
          if (chosen.has(item.product.id)) continue;
          chosen.add(item.product.id);
          const quantity = rand() < 0.7 ? 1 : between(2, 4);
          lines.push({
            id: `oln_hx_${where.code}_${seq}_${lines.length}`,
            productId: item.product.id,
            code: item.product.code,
            name: item.product.name,
            nameTranslations: item.product.nameTranslations,
            quantity,
            cancelledQuantity: 0,
            returnedQuantity: 0,
            sentQuantity: type === 'RETAIL' ? 0 : quantity,
            unitPrice: item.row.priceOverride ?? item.product.basePrice,
            taxMode: item.product.taxMode,
            serviceCharge: type === 'DINE_IN' && item.row.serviceCharge,
          });
        }
        const roll = rand();
        const outcome: 'PAID' | 'CANCELLED' | 'VOIDED' | 'RETURN' =
          roll < 0.03 ? 'CANCELLED' : roll < 0.04 ? 'VOIDED' : roll < 0.06 ? 'RETURN' : 'PAID';
        const adjustments: SaleAdjustment[] = [];
        const adjAt = new Date(created.getTime() + 60_000).toISOString();
        // ~8% discounted (manager PIN), ~2% price changed.
        const adj = rand();
        if (adj < 0.08 && outcome !== 'CANCELLED') {
          const promo = pick([
            {
              code: 'LOYALTY100',
              label: 'Loyalty Rs 100 off',
              mode: 'FIXED' as const,
              value: 10_000,
              reason: REASONS.loyal,
            },
            {
              code: 'HAPPYHOUR',
              label: 'Happy hour 15%',
              mode: 'PERCENT' as const,
              value: 1_500,
              reason: REASONS.loyal,
            },
            {
              code: '',
              label: '10% discount',
              mode: 'PERCENT' as const,
              value: 1_000,
              reason: REASONS.complaint,
            },
          ]);
          adjustments.push({
            id: `adj_hx_${where.code}_${seq}`,
            kind: 'DISCOUNT',
            scope: 'ORDER',
            mode: promo.mode,
            value: promo.value,
            ...(promo.code ? { promotionCode: promo.code } : {}),
            label: promo.label,
            status: 'ACTIVE',
            reason: promo.reason,
            approvedBy: { id: MANAGER.id, fullName: MANAGER.fullName },
            createdBy: cashier,
            createdAt: adjAt,
            locationId: where.id as SaleAdjustment['locationId'],
            deviceId: null,
          });
          addAudit(
            adjAt,
            where,
            cashier,
            'pos.discount.apply',
            { id, number },
            promo.label,
            promo.reason,
          );
        } else if (adj < 0.1 && lines[0] && outcome !== 'CANCELLED') {
          const l = lines[0];
          const newPrice = Math.round((l.unitPrice.amount * 0.9) / 1000) * 1000;
          adjustments.push({
            id: `adj_hx_${where.code}_${seq}`,
            kind: 'PRICE',
            scope: 'LINE',
            productId: l.productId,
            mode: 'FIXED',
            value: newPrice,
            previousValue: l.unitPrice.amount,
            label: `${l.name} price`,
            status: 'ACTIVE',
            reason: REASONS.priceFix,
            approvedBy: { id: MANAGER.id, fullName: MANAGER.fullName },
            createdBy: cashier,
            createdAt: adjAt,
            locationId: where.id as SaleAdjustment['locationId'],
            deviceId: null,
          });
          addAudit(
            adjAt,
            where,
            cashier,
            'pos.price.override',
            { id, number },
            `${l.name}: Price ${lkr(l.unitPrice.amount)} → ${lkr(newPrice)}`,
            REASONS.priceFix,
          );
        }
        // ~3% had an item taken off before paying (manager PIN).
        if (rand() < 0.03 && lines.length > 1 && outcome !== 'CANCELLED') {
          const l = lines[lines.length - 1]!;
          const removed = l.quantity;
          l.cancelledQuantity = removed;
          l.quantity = 0;
          addAudit(
            adjAt,
            where,
            cashier,
            'pos.item.remove',
            { id, number },
            `${l.name} ×${removed} removed`,
            pick([REASONS.changed, REASONS.wrongItem]),
          );
        }
        const live = lines.filter((l) => l.quantity > 0);
        if (!live.length) continue;
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
          adjustments,
        );
        const paidAt = new Date(created.getTime() + between(2, 40) * 60_000).toISOString();
        const method: PaymentMethod =
          rand() < 0.55 ? 'CASH' : rand() < 0.9 ? 'CARD' : 'BANK_TRANSFER';
        const payments: Payment[] = [];
        const returns: Order['returns'] = [];
        let status: Order['status'] = 'PAID';
        let cancellation: OrderApproval | undefined;
        if (outcome === 'CANCELLED') {
          status = 'CANCELLED';
          const at = new Date(created.getTime() + 10 * 60_000).toISOString();
          const reason = pick([REASONS.changed, REASONS.duplicate]);
          cancellation = { reason, approvedBy: { id: MANAGER.id, fullName: MANAGER.fullName }, at };
          addAudit(
            at,
            where,
            cashier,
            'pos.order.cancel',
            { id, number },
            `cancelled · ${lkr(totals.total.amount)}`,
            reason,
          );
        } else {
          payments.push({
            id: `pay_hx_${where.code}_${seq}`,
            method,
            amount: totals.total,
            status: outcome === 'VOIDED' ? 'REFUNDED' : 'CAPTURED',
            kind: 'SALE',
            createdAt: paidAt,
            createdBy: cashier,
            ...(method === 'CARD' ? { reference: `AUTH-${300000 + seq}` } : {}),
            ...(method === 'BANK_TRANSFER' ? { reference: `BT-${9000 + seq}` } : {}),
          });
          if (outcome === 'VOIDED') {
            status = 'VOIDED';
            const at = new Date(new Date(paidAt).getTime() + 25 * 60_000).toISOString();
            const reason = pick([REASONS.duplicate, REASONS.changed]);
            cancellation = { reason, approvedBy: { id: OWNER.id, fullName: OWNER.fullName }, at };
            payments.push({
              id: `pay_hx_${where.code}_${seq}_v`,
              method,
              amount: totals.total,
              status: 'CAPTURED',
              kind: 'REFUND',
              createdAt: at,
              createdBy: cashier,
            });
            addAudit(
              at,
              where,
              cashier,
              'pos.invoice.void',
              { id, number },
              `voided · ${lkr(totals.total.amount)} refunded`,
              reason,
              OWNER,
            );
          } else if (outcome === 'RETURN') {
            const idx = totals.lines.findIndex(
              (l, i) => (lines[i]?.quantity ?? 0) > 0 && l.net.amount > 0,
            );
            const line = lines[idx];
            const net = totals.lines[idx];
            if (line && net) {
              const quantity = 1;
              line.returnedQuantity = quantity;
              // Share of the line's net plus tax/service in proportion (approx. pro rata).
              const share = Math.round(
                (net.net.amount / line.quantity) *
                  (totals.total.amount /
                    Math.max(
                      1,
                      totals.lines.reduce((s, x) => s + x.net.amount, 0),
                    )),
              );
              const amount = {
                amount: Math.min(share, totals.total.amount),
                currency: 'LKR' as const,
              };
              const at = new Date(new Date(paidAt).getTime() + between(1, 48) * 3_600_000);
              if (at.getTime() > Date.now()) at.setTime(Date.now() - 3_600_000);
              const reason = pick([REASONS.returned, REASONS.damaged]);
              const approval = {
                reason,
                approvedBy: { id: MANAGER.id, fullName: MANAGER.fullName },
                at: at.toISOString(),
              };
              returns.push({
                id: `rtn_hx_${where.code}_${seq}`,
                number: `RTN-${where.code}-H${String(++rtn).padStart(5, '0')}`,
                lines: [
                  { lineId: line.id, productId: line.productId, name: line.name, quantity, amount },
                ],
                amount,
                refundMethod: method,
                approval,
                createdAt: at.toISOString(),
                createdBy: cashier,
              });
              payments.push({
                id: `pay_hx_${where.code}_${seq}_r`,
                method,
                amount,
                status: 'CAPTURED',
                kind: 'REFUND',
                createdAt: at.toISOString(),
                createdBy: cashier,
              });
              addAudit(
                at.toISOString(),
                where,
                cashier,
                'pos.return',
                { id, number },
                `${line.name} ×${quantity} returned · ${lkr(amount.amount)}`,
                reason,
              );
            }
          }
        }
        db.orders.push({
          id,
          tenantId: T1,
          number,
          type,
          status,
          table:
            type === 'DINE_IN' ? { id: `tbl_T${between(1, 8)}`, name: `T${between(1, 8)}` } : null,
          delivery: null,
          locationId: where.id as Order['locationId'],
          deviceId: null,
          openedByDeviceId: null,
          customer: null,
          lines,
          adjustments,
          totals,
          payments,
          returns,
          createdBy: cashier,
          createdAt,
          ...(status === 'CANCELLED' ? {} : { paidAt }),
          ...(cancellation ? { cancellation } : {}),
        });
        for (const a of adjustments) db.adjustments.push({ ...a, tenantId: T1, orderId: id });
      }
    }
  }
  db.auditLog.push(...audit);
  // Newest first, like recordAudit's unshift.
  db.auditLog.sort((a, b) => b.at.localeCompare(a.at));
}
