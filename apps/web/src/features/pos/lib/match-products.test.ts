import type { LocationProduct } from '@rbp/types';
import { describe, expect, it } from 'vitest';
import { findByCode, matchProducts, parseQuantityPrefix } from './match-products';

const product = (code: string, name: string, extra: Partial<LocationProduct> = {}) =>
  ({
    productId: code,
    code,
    name,
    nameTranslations: {},
    barcodes: [],
    ...extra,
  }) as LocationProduct;

const products = [
  product('K01', 'Chicken Kottu', { nameTranslations: { ta: 'கோழி கொத்து' } }),
  product('K03', 'Egg Kottu'),
  product('B03', 'Sandwich Bread', { barcodes: ['4790001000123'] }),
  product('KOT', 'Plain Tea'),
];

describe('parseQuantityPrefix', () => {
  it.each([
    ['3*s01', 3, 's01'],
    ['3 x kottu', 3, 'kottu'],
    ['12×milk tea', 12, 'milk tea'],
    ['kottu', 1, 'kottu'],
    ['0*s01', 1, '0*s01'],
  ])('%s → %i × %s', (input, quantity, term) => {
    expect(parseQuantityPrefix(input)).toEqual({ quantity, term });
  });
});

describe('matchProducts', () => {
  it('ranks exact codes, then name prefixes, then other matches', () => {
    expect(matchProducts(products, 'kot', 'en').map((p) => p.code)).toEqual(['KOT', 'K01', 'K03']);
    expect(matchProducts(products, 'egg', 'en').map((p) => p.code)).toEqual(['K03']);
  });

  it('matches translated names and barcodes', () => {
    expect(matchProducts(products, 'கோழி', 'ta').map((p) => p.code)).toEqual(['K01']);
    expect(matchProducts(products, '47900010', 'en').map((p) => p.code)).toEqual(['B03']);
    expect(findByCode(products, '4790001000123')?.code).toBe('B03');
    expect(findByCode(products, 'k03')?.code).toBe('K03');
  });
});
