import type { CurrencyCode, Money, OrderTotals, SaleAdjustment, TaxMode } from '@rbp/types';
import { money, multiplyMoney, percentOf } from './money';

export interface TotalsLine {
  /** Needed to match item-level discounts. */
  productId?: string;
  unitPrice: Money;
  quantity: number;
  taxMode: TaxMode;
  /** Service charge applies to this line at this location (CAT-005). */
  serviceCharge: boolean;
}

export interface TotalsSettings {
  serviceChargeBps: number;
  taxRateBps: number;
}

/** The parts of an approved adjustment the maths needs (ACTIVE ones only). */
export type TotalsAdjustment = Pick<
  SaleAdjustment,
  'id' | 'kind' | 'scope' | 'productId' | 'mode' | 'value' | 'chargeCode' | 'label'
>;

export interface TotalsRowAmount {
  id: string;
  label: string;
  amount: Money;
}

/** Same shape the API returns on an order (`Order.totals`). */
export type SaleTotals = OrderTotals;

/**
 * Sale totals in integer minor units, shared by the POS cart and the (mock) Orders API so they
 * never disagree. Half-up rounding via `percentOf`. Order of operations:
 *
 *  0. A POS price change replaces the item's unit price.
 *  1. Item discounts, applied in order to what's left of each line (fixed amounts are capped).
 *  2. Bill discounts, applied in order to what's left of the sale, then spread across lines in
 *     proportion to their net (largest remainder, exact to the cent) so tax and service stay right.
 *  3. Service charge = rate × net of service-charge lines (a SERVICE charge adjustment overrides
 *     the location rate; 0 waives it).
 *  4. Other charges: fixed, or a percentage of the net after discounts. No tax on charges.
 *  5. Tax = rate × net of tax-EXCLUSIVE lines (INCLUSIVE prices already contain it).
 */
export function computeTotals(
  lines: TotalsLine[],
  settings: TotalsSettings,
  currency: CurrencyCode,
  adjustments: TotalsAdjustment[] = [],
): SaleTotals {
  const pct = (amount: number, bps: number) =>
    bps > 0 ? percentOf(money(amount, currency), bps).amount : 0;
  const m = (amount: number) => money(amount, currency);

  // 0. POS price changes (last one per item wins) replace the unit price.
  const unitPrices = lines.map((l) => {
    const override = adjustments
      .filter((a) => a.kind === 'PRICE' && a.productId === l.productId)
      .at(-1);
    return override ? m(override.value) : l.unitPrice;
  });

  // 1. Item discounts.
  const gross = lines.map((l, i) => multiplyMoney(unitPrices[i] ?? l.unitPrice, l.quantity).amount);
  const itemDiscount = lines.map((line, i) => {
    let remaining = gross[i] ?? 0;
    let discount = 0;
    for (const a of adjustments) {
      if (a.kind !== 'DISCOUNT' || a.scope !== 'LINE' || a.productId !== line.productId) continue;
      const amount = Math.min(remaining, a.mode === 'PERCENT' ? pct(remaining, a.value) : a.value);
      remaining -= amount;
      discount += amount;
    }
    return discount;
  });
  const net = gross.map((g, i) => g - (itemDiscount[i] ?? 0));
  const netTotal = net.reduce((s, n) => s + n, 0);

  // 2. Bill discounts, sequential and capped.
  let remaining = netTotal;
  const billDiscounts: TotalsRowAmount[] = [];
  for (const a of adjustments) {
    if (a.kind !== 'DISCOUNT' || a.scope !== 'ORDER') continue;
    const amount = Math.min(remaining, a.mode === 'PERCENT' ? pct(remaining, a.value) : a.value);
    remaining -= amount;
    billDiscounts.push({ id: a.id, label: a.label, amount: m(amount) });
  }
  const billTotal = netTotal - remaining;
  const share = allocate(billTotal, net);
  const final = net.map((n, i) => n - (share[i] ?? 0));
  const finalTotal = final.reduce((s, n) => s + n, 0);

  // 3. Service charge (last override wins).
  const override = adjustments
    .filter((a) => a.kind === 'CHARGE' && a.chargeCode === 'SERVICE')
    .at(-1);
  const serviceChargeBps = override ? override.value : settings.serviceChargeBps;
  const serviceBase = final.reduce((s, n, i) => s + (lines[i]?.serviceCharge ? n : 0), 0);
  const serviceCharge = pct(serviceBase, serviceChargeBps);

  // 4. Other charges.
  const charges = adjustments
    .filter((a) => a.kind === 'CHARGE' && a.chargeCode !== 'SERVICE')
    .map((a) => ({
      id: a.id,
      code: a.chargeCode ?? 'OTHER',
      label: a.label,
      amount: m(a.mode === 'PERCENT' ? pct(finalTotal, a.value) : a.value),
    }));
  const chargesTotal = charges.reduce((s, c) => s + c.amount.amount, 0);

  // 5. Tax on tax-exclusive lines.
  const taxBase = final.reduce((s, n, i) => s + (lines[i]?.taxMode === 'EXCLUSIVE' ? n : 0), 0);
  const tax = pct(taxBase, settings.taxRateBps);

  const lineDiscounts = itemDiscount.reduce((s, d) => s + d, 0);
  return {
    subtotal: m(gross.reduce((s, g) => s + g, 0)),
    lineDiscounts: m(lineDiscounts),
    billDiscounts,
    discountTotal: m(lineDiscounts + billTotal),
    serviceCharge: m(serviceCharge),
    serviceChargeBps,
    serviceOverridden: !!override,
    charges,
    tax: m(tax),
    total: m(finalTotal + serviceCharge + chargesTotal + tax),
    itemCount: lines.reduce((n, l) => n + l.quantity, 0),
    lines: lines.map((l, i) => ({
      productId: l.productId,
      unitPrice: unitPrices[i] ?? l.unitPrice,
      gross: m(gross[i] ?? 0),
      discount: m((itemDiscount[i] ?? 0) + (share[i] ?? 0)),
      net: m(final[i] ?? 0),
    })),
  };
}

/**
 * Split `total` across `weights` proportionally in whole minor units (largest remainder),
 * so the parts always add up exactly to `total`.
 */
export function allocate(total: number, weights: number[]): number[] {
  const sum = weights.reduce((s, w) => s + w, 0);
  if (total === 0 || sum === 0) return weights.map(() => 0);
  const exact = weights.map((w) => (total * w) / sum);
  const parts = exact.map(Math.floor);
  let left = total - parts.reduce((s, p) => s + p, 0);
  const order = exact
    .map((e, i) => ({ i, frac: e - Math.floor(e) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    parts[i] = (parts[i] ?? 0) + 1;
    left -= 1;
  }
  return parts;
}
