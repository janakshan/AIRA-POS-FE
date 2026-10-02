import { describe, expect, it } from 'vitest';
import { applyKey } from './numeric-keypad';

describe('applyKey', () => {
  it('builds integers and ignores decimal point in integer mode', () => {
    expect(applyKey('12', '3')).toBe('123');
    expect(applyKey('12', '.')).toBe('12');
    expect(applyKey('0', '5')).toBe('5');
    expect(applyKey('', '00')).toBe('0');
    expect(applyKey('5', '00')).toBe('500');
  });

  it('limits decimal places', () => {
    const opts = { mode: 'decimal' as const, decimals: 2 };
    expect(applyKey('', '.', opts)).toBe('0.');
    expect(applyKey('12.5', '0', opts)).toBe('12.50');
    expect(applyKey('12.50', '1', opts)).toBe('12.50');
    expect(applyKey('12.5', '.', opts)).toBe('12.5');
  });

  it('respects max length and backspace', () => {
    expect(applyKey('1234', '5', { maxLength: 4 })).toBe('1234');
    expect(applyKey('123', 'back')).toBe('12');
  });
});
