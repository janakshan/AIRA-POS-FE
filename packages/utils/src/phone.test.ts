import { describe, expect, it } from 'vitest';
import { formatPhone, normalizePhone } from './phone';

describe('normalizePhone', () => {
  it.each([
    '0771234567',
    '077 123 4567',
    '077-123-4567',
    '771234567',
    '+94 77 123 4567',
    '94771234567',
    '0094771234567',
  ])('normalizes %s to E.164', (input) => {
    expect(normalizePhone(input)).toBe('+94771234567');
  });

  it('keeps other countries when given with +', () => {
    expect(normalizePhone('+44 20 7946 0958')).toBe('+442079460958');
  });

  it.each(['', '12345', '077123456', '+94 77 123 45678', 'abc'])('rejects %s', (input) => {
    expect(normalizePhone(input)).toBeNull();
  });
});

describe('formatPhone', () => {
  it('shows Sri Lankan numbers in local form', () => {
    expect(formatPhone('+94771234567')).toBe('077 123 4567');
    expect(formatPhone('+442079460958')).toBe('+442079460958');
  });
});
