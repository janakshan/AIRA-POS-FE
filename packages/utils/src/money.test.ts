import { describe, expect, it } from 'vitest';
import { addMoney, formatMoney, money, multiplyMoney, parseMoney, percentOf } from './money';

describe('money', () => {
  it('parses decimal strings into minor units without float error', () => {
    expect(parseMoney('1,250.50', 'LKR').amount).toBe(125050);
    expect(parseMoney('0.1', 'LKR').amount).toBe(10);
    expect(parseMoney('-5', 'LKR').amount).toBe(-500);
  });

  it('rejects invalid input', () => {
    expect(() => parseMoney('12.345', 'LKR')).toThrow();
    expect(() => parseMoney('abc', 'LKR')).toThrow();
  });

  it('adds 0.1 + 0.2 exactly', () => {
    const total = addMoney(parseMoney('0.1', 'LKR'), parseMoney('0.2', 'LKR'));
    expect(total.amount).toBe(30);
  });

  it('multiplies by integer quantity and rejects fractional', () => {
    expect(multiplyMoney(money(80000, 'LKR'), 3).amount).toBe(240000);
    expect(() => multiplyMoney(money(80000, 'LKR'), 1.5)).toThrow();
  });

  it('computes percentages in basis points with half-up rounding', () => {
    expect(percentOf(money(100000, 'LKR'), 1000).amount).toBe(10000);
    expect(percentOf(money(333, 'LKR'), 1000).amount).toBe(33);
    expect(percentOf(money(335, 'LKR'), 1000).amount).toBe(34);
  });

  it('refuses mixed currencies', () => {
    expect(() => addMoney(money(1, 'LKR'), money(1, 'USD'))).toThrow();
  });

  it('formats for display', () => {
    expect(formatMoney(money(125050, 'LKR'))).toMatch(/1,250\.50/);
  });

  it('shows the LKR code in every UI language', () => {
    for (const locale of ['en-LK', 'ta-LK', 'si-LK']) {
      expect(formatMoney(money(4295200, 'LKR'), locale)).toMatch(/^LKR\s42,952\.00$/);
    }
  });
});
