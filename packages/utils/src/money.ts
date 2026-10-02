import type { CurrencyCode, Money } from '@rbp/types';

/**
 * Money helpers. All business arithmetic uses integer minor units — never floats.
 * Rs. 1,250.50 is represented as { amount: 125050, currency: 'LKR' }.
 */

const MINOR_UNITS: Record<CurrencyCode, number> = { LKR: 2, USD: 2, INR: 2 };

function assertInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${label} must be a safe integer (minor units), got ${value}`);
  }
}

export function money(amount: number, currency: CurrencyCode): Money {
  assertInteger(amount, 'amount');
  return { amount, currency };
}

export function zero(currency: CurrencyCode): Money {
  return { amount: 0, currency };
}

/** Parse a decimal string ("1250.5", "1,250.50") into minor units without float math. */
export function parseMoney(input: string, currency: CurrencyCode): Money {
  const digits = MINOR_UNITS[currency];
  const cleaned = input.replace(/[,\s]/g, '');
  const match = /^(-)?(\d*)(?:\.(\d*))?$/.exec(cleaned);
  if (!match || (!match[2] && !match[3])) {
    throw new Error(`Invalid money value: "${input}"`);
  }
  const [, sign, whole = '', fraction = ''] = match;
  if (fraction.length > digits) {
    throw new Error(`Too many decimal places for ${currency}: "${input}"`);
  }
  const minor = Number(`${whole || '0'}${fraction.padEnd(digits, '0')}`);
  return money(sign ? -minor : minor, currency);
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new Error(`Currency mismatch: ${a.currency} vs ${b.currency}`);
  }
}

export function addMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.amount + b.amount, a.currency);
}

export function subtractMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.amount - b.amount, a.currency);
}

export function sumMoney(values: Money[], currency: CurrencyCode): Money {
  return values.reduce((acc, v) => addMoney(acc, v), zero(currency));
}

/** Multiply by an integer quantity. */
export function multiplyMoney(value: Money, quantity: number): Money {
  assertInteger(quantity, 'quantity');
  return money(value.amount * quantity, value.currency);
}

/**
 * Percentage in basis points (1% = 100 bps) with half-up rounding on integers.
 * e.g. 10% service charge on Rs. 1,000.00 => percentOf(100000 minor, 1000 bps) = 10000.
 */
export function percentOf(value: Money, basisPoints: number): Money {
  assertInteger(basisPoints, 'basisPoints');
  const product = value.amount * basisPoints;
  const sign = product < 0 ? -1 : 1;
  const rounded = sign * Math.floor((Math.abs(product) + 5000) / 10000);
  return money(rounded, value.currency);
}

const formatterCache = new Map<string, Intl.NumberFormat>();

export function formatMoney(value: Money, locale = 'en-LK'): string {
  const key = `${locale}|${value.currency}`;
  let formatter = formatterCache.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: value.currency,
      // ISO code, not the locale symbol: ta-LK/si-LK render "Rs." / "රු." while en-LK
      // renders "LKR" — receipts and screens must read the same in every language.
      currencyDisplay: 'code',
    });
    formatterCache.set(key, formatter);
  }
  const digits = MINOR_UNITS[value.currency];
  // Division only happens at the presentation boundary.
  return formatter.format(value.amount / 10 ** digits);
}
