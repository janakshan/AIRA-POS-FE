import type { Money, WholesaleInvoice } from '@rbp/types';
import { formatDateTime, formatMoney, formatPhone } from '@rbp/utils';
import { formatPlainDate } from '@/features/purchasing/lib/status';

const pad = (n: number) => String(n).padStart(2, '0');

/** Local YYYY-MM-DD. */
export function localDay(days = 0) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local YYYY-MM-DD of an ISO time. */
export function dayOf(at: string) {
  const d = new Date(at);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Share of the credit limit used (0–100+), or null without a limit. */
export const creditUsed = (outstanding: Money, limit: Money) =>
  limit.amount > 0 ? Math.round((Math.max(0, outstanding.amount) / limit.amount) * 100) : null;

/**
 * Plain-text invoice for the share sheet / WhatsApp (A-273). The receipt layout itself is
 * printed; text travels well on any phone.
 */
export function invoiceText(
  invoice: WholesaleInvoice,
  business: string,
  locale: string,
  labels: {
    title: string;
    total: string;
    paid: string;
    credit: string;
    balance: string;
    due: string;
    vat: string;
  },
) {
  const m = (v: Money) => formatMoney(v, locale);
  return [
    `${business} — ${labels.title} ${invoice.number}`,
    `${invoice.shopName}${invoice.shopPhone ? ` (${formatPhone(invoice.shopPhone)})` : ''}`,
    // Same date formats as the printed invoice (InvoiceView), not the browser's defaults.
    formatDateTime(invoice.at, { locale }),
    '',
    ...invoice.lines.map(
      (l) => `${l.name} × ${l.quantity} @ ${m(l.unitPrice)} = ${m(l.lineTotal)}`,
    ),
    '',
    `${labels.total}: ${m(invoice.total)} (${labels.vat} ${m(invoice.tax)})`,
    ...(invoice.paidNow ? [`${labels.paid}: ${m(invoice.paidNow.amount)}`] : []),
    ...(invoice.credit.amount
      ? [
          `${labels.credit}: ${m(invoice.credit)} · ${labels.due} ${formatPlainDate(invoice.dueDate, locale)}`,
        ]
      : []),
    `${labels.balance}: ${m(invoice.balanceAfter)}`,
  ].join('\n');
}

/** wa.me link: digits only, no "+". */
export const whatsappHref = (phone: string | null, text: string) =>
  `https://wa.me/${(phone ?? '').replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;
