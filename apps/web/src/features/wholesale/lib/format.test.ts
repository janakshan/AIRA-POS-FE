import type { WholesaleInvoice } from '@rbp/types';
import { formatDateTime } from '@rbp/utils';
import { describe, expect, it } from 'vitest';
import { formatPlainDate } from '@/features/purchasing/lib/status';
import { invoiceText } from './format';

const lkr = (amount: number) => ({ amount, currency: 'LKR' as const });
const labels = {
  title: 'Invoice',
  total: 'Total',
  paid: 'Paid',
  credit: 'On credit',
  balance: 'Balance',
  due: 'Due',
  vat: 'incl. VAT',
};

describe('invoiceText', () => {
  it('uses the app date formats, not browser defaults or raw ISO', () => {
    const invoice = {
      number: 'WIN-000001',
      shopName: 'Lakshmi Stores',
      shopPhone: null,
      lines: [],
      total: lkr(10_000),
      tax: lkr(0),
      paidNow: null,
      credit: lkr(10_000),
      balanceAfter: lkr(10_000),
      dueDate: '2026-09-23',
      at: '2026-09-16T05:45:00.000Z',
    } as unknown as WholesaleInvoice;
    const text = invoiceText(invoice, 'Pilot', 'en-LK', labels);
    expect(text).toContain(formatDateTime(invoice.at, { locale: 'en-LK' }));
    expect(text).toContain(`Due ${formatPlainDate('2026-09-23', 'en-LK')}`);
    expect(text).not.toContain('2026-09-23');
  });
});
