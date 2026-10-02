import { describe, expect, it } from 'vitest';
import { localDay, periodError } from './period';

describe('periodError', () => {
  it('accepts From ≤ To up to today', () => {
    expect(periodError(localDay(-6), localDay())).toBeNull();
    expect(periodError(localDay(), localDay())).toBeNull();
  });

  it('refuses an inverted range and one that ends in the future', () => {
    expect(periodError('2026-09-28', '2026-09-20')).toBe('fromAfterTo');
    expect(periodError(localDay(), localDay(1))).toBe('future');
  });
});
