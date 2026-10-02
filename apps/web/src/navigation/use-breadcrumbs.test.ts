import { describe, expect, it } from 'vitest';
import { findNavMatch } from './use-breadcrumbs';

describe('findNavMatch', () => {
  it('prefers the longest matching nav path', () => {
    expect(findNavMatch('/customers/external-shops')?.item.path).toBe('/customers/external-shops');
    expect(findNavMatch('/customers/external-shops/shp_1')?.item.path).toBe(
      '/customers/external-shops',
    );
  });

  it('still matches the parent item for its own records', () => {
    expect(findNavMatch('/customers')?.item.path).toBe('/customers');
    expect(findNavMatch('/customers/cus_1')?.item.path).toBe('/customers');
  });

  it('returns nothing for paths outside the nav', () => {
    expect(findNavMatch('/nope')).toBeUndefined();
  });
});
