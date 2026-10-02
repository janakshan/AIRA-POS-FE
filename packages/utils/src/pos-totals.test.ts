import { describe, expect, it } from 'vitest';
import { allocate, computeTotals, type TotalsAdjustment } from './pos-totals';

const lkr = (amount: number) => ({ amount, currency: 'LKR' as const });

describe('computeTotals', () => {
  it('is all zero for an empty sale', () => {
    expect(computeTotals([], { serviceChargeBps: 1000, taxRateBps: 1800 }, 'LKR')).toMatchObject({
      subtotal: lkr(0),
      discountTotal: lkr(0),
      serviceCharge: lkr(0),
      tax: lkr(0),
      total: lkr(0),
      itemCount: 0,
    });
  });

  it('adds service charge only on flagged lines and tax only on exclusive lines', () => {
    const totals = computeTotals(
      [
        // Rs 800 × 2, inclusive, service charge
        { unitPrice: lkr(80000), quantity: 2, taxMode: 'INCLUSIVE', serviceCharge: true },
        // Rs 120 × 3, inclusive, no service charge (counter item)
        { unitPrice: lkr(12000), quantity: 3, taxMode: 'INCLUSIVE', serviceCharge: false },
        // Rs 480 × 1, exclusive
        { unitPrice: lkr(48000), quantity: 1, taxMode: 'EXCLUSIVE', serviceCharge: false },
      ],
      { serviceChargeBps: 1000, taxRateBps: 1800 },
      'LKR',
    );
    expect(totals.subtotal).toEqual(lkr(160000 + 36000 + 48000));
    expect(totals.serviceCharge).toEqual(lkr(16000));
    expect(totals.tax).toEqual(lkr(8640));
    expect(totals.total).toEqual(lkr(244000 + 16000 + 8640));
    expect(totals.itemCount).toBe(6);
  });

  it('rounds half-up once on the total, not per line', () => {
    // 3 × Rs 0.15 exclusive at 10% → base 45 minor → 4.5 → 5 (per-line rounding would give 6).
    const totals = computeTotals(
      [{ unitPrice: lkr(15), quantity: 3, taxMode: 'EXCLUSIVE', serviceCharge: false }],
      { serviceChargeBps: 0, taxRateBps: 1000 },
      'LKR',
    );
    expect(totals.tax).toEqual(lkr(5));
  });

  it('skips charges when the location rates are zero', () => {
    const totals = computeTotals(
      [{ unitPrice: lkr(35000), quantity: 1, taxMode: 'INCLUSIVE', serviceCharge: true }],
      { serviceChargeBps: 0, taxRateBps: 1800 },
      'LKR',
    );
    expect(totals.total).toEqual(lkr(35000));
  });
});

const settings = { serviceChargeBps: 1000, taxRateBps: 1800 };
const kottu = {
  productId: 'K',
  unitPrice: lkr(100000),
  quantity: 1,
  taxMode: 'INCLUSIVE' as const,
  serviceCharge: true,
};
const buns = {
  productId: 'B',
  unitPrice: lkr(12000),
  quantity: 5,
  taxMode: 'INCLUSIVE' as const,
  serviceCharge: false,
};
const milk = {
  productId: 'M',
  unitPrice: lkr(48000),
  quantity: 1,
  taxMode: 'EXCLUSIVE' as const,
  serviceCharge: false,
};
const adj = (
  a: Partial<TotalsAdjustment> & Pick<TotalsAdjustment, 'kind' | 'mode' | 'value'>,
): TotalsAdjustment => ({
  id: `${a.kind}-${a.value}`,
  scope: 'ORDER',
  label: 'x',
  ...a,
});

describe('computeTotals with adjustments', () => {
  it('applies item discounts in order and caps fixed ones at the line', () => {
    const t = computeTotals([kottu, buns], settings, 'LKR', [
      adj({ kind: 'DISCOUNT', scope: 'LINE', productId: 'K', mode: 'PERCENT', value: 1000 }),
      adj({ kind: 'DISCOUNT', scope: 'LINE', productId: 'K', mode: 'FIXED', value: 5000 }),
      adj({ kind: 'DISCOUNT', scope: 'LINE', productId: 'B', mode: 'FIXED', value: 999999 }),
    ]);
    // Kottu 1000 − 10% (100) − 50 = 850; buns fully discounted (600 capped).
    expect(t.lines.map((l) => l.net.amount)).toEqual([85000, 0]);
    expect(t.lineDiscounts).toEqual(lkr(15000 + 60000));
    // Service charge only on the kottu's net.
    expect(t.serviceCharge).toEqual(lkr(8500));
    expect(t.total).toEqual(lkr(85000 + 8500));
  });

  it('stacks bill discounts and spreads them across lines to the cent', () => {
    const t = computeTotals([kottu, buns, milk], settings, 'LKR', [
      adj({ kind: 'DISCOUNT', mode: 'PERCENT', value: 1000, label: 'Happy hour' }),
      adj({ kind: 'DISCOUNT', mode: 'FIXED', value: 10000, label: 'Loyalty' }),
    ]);
    // Net 2,080 → −208 → 1,872 → −100 → 1,772
    expect(t.billDiscounts.map((d) => [d.label, d.amount.amount])).toEqual([
      ['Happy hour', 20800],
      ['Loyalty', 10000],
    ]);
    expect(t.discountTotal).toEqual(lkr(30800));
    expect(t.lines.reduce((s, l) => s + l.net.amount, 0)).toBe(177200);
    const [k, , mk] = t.lines;
    // Service on the kottu's share, tax on the milk's share.
    expect(t.serviceCharge.amount).toBe(Math.floor((k!.net.amount * 1000 + 5000) / 10000));
    expect(t.tax.amount).toBe(Math.floor((mk!.net.amount * 1800 + 5000) / 10000));
    expect(t.total.amount).toBe(177200 + t.serviceCharge.amount + t.tax.amount);
  });

  it('lets staff waive or change the service charge', () => {
    const waived = computeTotals([kottu], settings, 'LKR', [
      adj({ kind: 'CHARGE', chargeCode: 'SERVICE', mode: 'PERCENT', value: 0 }),
    ]);
    expect(waived).toMatchObject({
      serviceCharge: lkr(0),
      serviceOverridden: true,
      total: lkr(100000),
    });
    const five = computeTotals([kottu], settings, 'LKR', [
      adj({ kind: 'CHARGE', chargeCode: 'SERVICE', mode: 'PERCENT', value: 500 }),
    ]);
    expect(five).toMatchObject({ serviceCharge: lkr(5000), serviceChargeBps: 500 });
  });

  it('adds fixed and percentage charges without tax', () => {
    const t = computeTotals([milk], settings, 'LKR', [
      adj({
        kind: 'CHARGE',
        chargeCode: 'DELIVERY',
        mode: 'FIXED',
        value: 25000,
        label: 'Delivery',
      }),
      adj({
        kind: 'CHARGE',
        chargeCode: 'PACKAGING',
        mode: 'PERCENT',
        value: 500,
        label: 'Packaging',
      }),
    ]);
    expect(t.charges.map((c) => [c.code, c.amount.amount])).toEqual([
      ['DELIVERY', 25000],
      ['PACKAGING', 2400],
    ]);
    expect(t.tax).toEqual(lkr(8640));
    expect(t.total).toEqual(lkr(48000 + 25000 + 2400 + 8640));
  });
});

describe('allocate', () => {
  it('splits exactly by largest remainder', () => {
    expect(allocate(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(allocate(10, [0, 5, 0])).toEqual([0, 10, 0]);
    expect(allocate(0, [3, 4])).toEqual([0, 0]);
    const parts = allocate(20800, [100000, 60000, 48000]);
    expect(parts.reduce((s, p) => s + p, 0)).toBe(20800);
  });
});

describe('POS price change', () => {
  it('replaces the unit price before discounts and tax', () => {
    const t = computeTotals([{ ...milk, quantity: 2 }], settings, 'LKR', [
      adj({ kind: 'PRICE', scope: 'LINE', productId: 'M', mode: 'FIXED', value: 40000 }),
      adj({ kind: 'DISCOUNT', scope: 'LINE', productId: 'M', mode: 'PERCENT', value: 1000 }),
    ]);
    // 2 × 400 = 800 − 10% = 720 + 18% VAT 129.60
    expect(t.lines[0]).toMatchObject({ unitPrice: lkr(40000), gross: lkr(80000), net: lkr(72000) });
    expect(t.subtotal).toEqual(lkr(80000));
    expect(t.tax).toEqual(lkr(12960));
    expect(t.total).toEqual(lkr(72000 + 12960));
  });
});
