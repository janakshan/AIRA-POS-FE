import { describe, expect, it } from 'vitest';
import { diffFields, formatValue } from './diff';

describe('audit diff', () => {
  it('lists only changed fields, ignoring timestamps', () => {
    expect(
      diffFields(
        { name: 'Kottu', color: 'red', updatedAt: '1' },
        { name: 'Kottu Roti', color: 'red', updatedAt: '2' },
      ),
    ).toEqual([{ field: 'name', before: 'Kottu', after: 'Kottu Roti' }]);
  });

  it('shows every field for a created record and handles money snapshots', () => {
    expect(diffFields(null, { name: 'Rolls', code: 'ROLLS' }).map((r) => r.field)).toEqual([
      'name',
      'code',
    ]);
    const lkr = (amount: number) => ({ amount, currency: 'LKR' as const });
    expect(diffFields(lkr(8000), lkr(7000))).toEqual([
      { field: 'value', before: lkr(8000), after: lkr(7000) },
    ]);
    expect(formatValue(lkr(7000), 'en-LK')).toMatch(/70\.00/);
    expect(formatValue(null, 'en-LK')).toBe('—');
  });
});
