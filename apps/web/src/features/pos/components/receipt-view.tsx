import type { Receipt } from '@rbp/types';
import { cn, formatDateTime, formatMoney, formatPhone } from '@rbp/utils';
import { useTranslation } from 'react-i18next';
import { localeFor } from '@/app/i18n';

/** 80mm thermal-paper style receipt (POS-009). Also what `window.print()` prints. */
export function ReceiptView({ receipt }: { receipt: Receipt }) {
  const { t, i18n } = useTranslation('pos');
  const locale = localeFor(i18n.language);
  const m = (v: Receipt['total']) => formatMoney(v, locale);
  const pct = (bps = 0) => `${bps / 100}%`;
  // Fixed rows and payment methods come with codes so they print in the cashier's language;
  // discount / charge names are the ones the business typed, so they print as given.
  const rowLabel = (r: Receipt['rows'][number]) => {
    switch (r.code) {
      case 'SUBTOTAL':
        return t('subtotal');
      case 'ITEM_DISCOUNTS':
        return t('discount.itemDiscounts');
      case 'SERVICE':
        return t('serviceCharge', { rate: pct(r.rateBps) });
      case 'TAX':
        return t('tax', { label: r.label, rate: pct(r.rateBps) });
      default:
        return r.label;
    }
  };
  const paymentLabel = (p: Receipt['payments'][number]) => {
    if (!p.method) return p.label;
    const method = t(`payment.${p.method}`);
    if (p.refund) return t('receipt.refundVia', { method });
    return p.tendered ? t('payment.tendered') : method;
  };
  const stamp =
    receipt.status === 'VOIDED'
      ? t('receipt.void')
      : receipt.status === 'CANCELLED'
        ? t('receipt.cancelled')
        : receipt.copy === 'REPRINT'
          ? t('receipt.reprint')
          : null;
  return (
    <article
      data-print-root
      aria-label={receipt.number}
      className="relative mx-auto w-full max-w-[22rem] overflow-hidden rounded-md border bg-white px-5 py-6 font-mono text-[13px] leading-snug text-neutral-900 shadow-sm"
    >
      {stamp && (
        <span
          aria-hidden
          className="pointer-events-none absolute top-1/3 left-1/2 -translate-x-1/2 -rotate-12 rounded border-4 border-red-500/40 px-3 py-1 text-3xl font-black tracking-widest text-red-500/40"
        >
          {stamp}
        </span>
      )}
      <header className="text-center">
        <p className="text-base font-bold">{receipt.business.name}</p>
        <p>{receipt.location.name}</p>
        <p className="text-xs">{receipt.location.address}</p>
        {receipt.copy === 'BILL' && (
          <p className="mt-2 border-y border-dashed border-neutral-400 py-1 font-bold tracking-wide">
            {t('receipt.bill')}
          </p>
        )}
      </header>
      <hr className="my-3 border-dashed border-neutral-400" />
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 text-xs">
        <dt>{receipt.kind === 'RETURN' ? t('receipt.refund') : '#'}</dt>
        <dd className="text-right font-bold">{receipt.number}</dd>
        {receipt.originalNumber && (
          <>
            <dt>{t('receipt.original')}</dt>
            <dd className="text-right">{receipt.originalNumber}</dd>
          </>
        )}
        <dt>{formatDateTime(receipt.at, { locale })}</dt>
        <dd className="text-right">{receipt.device}</dd>
        {receipt.orderType !== 'RETAIL' && (
          <>
            <dt>{t(`orderType.${receipt.orderType}`)}</dt>
            <dd className="text-right font-bold">{receipt.table ?? ''}</dd>
          </>
        )}
        <dt>{t('receipt.cashier')}</dt>
        <dd className="text-right">{receipt.cashier}</dd>
        {receipt.customer && (
          <>
            <dt>{t('receipt.customer')}</dt>
            <dd className="text-right">
              {receipt.customer.name}
              {receipt.customer.phone && (
                <span className="block">{formatPhone(receipt.customer.phone)}</span>
              )}
            </dd>
          </>
        )}
      </dl>
      <hr className="my-3 border-dashed border-neutral-400" />
      <ul className="space-y-1.5">
        {receipt.lines.map((l, i) => (
          <li key={i}>
            <div className="flex justify-between gap-2">
              <span>{l.name}</span>
              <span className="tabular">{m(l.total)}</span>
            </div>
            <div className="text-xs text-neutral-600">
              {l.quantity} × {m(l.unitPrice)}
              {l.note && <span className="block italic">{l.note}</span>}
            </div>
          </li>
        ))}
      </ul>
      <hr className="my-3 border-dashed border-neutral-400" />
      <dl className="space-y-0.5">
        {receipt.rows.map((r, i) => (
          <div key={i} className="flex justify-between gap-2">
            <dt>{rowLabel(r)}</dt>
            <dd className="tabular">
              {r.kind === 'discount' ? '−' : ''}
              {m(r.amount)}
            </dd>
          </div>
        ))}
        <div className="flex justify-between gap-2 pt-1 text-base font-bold">
          <dt>{receipt.kind === 'RETURN' ? t('receipt.refund') : t('total')}</dt>
          <dd className="tabular">{m(receipt.total)}</dd>
        </div>
      </dl>
      <hr className="my-3 border-dashed border-neutral-400" />
      <dl className="space-y-0.5 text-xs">
        {receipt.payments.map((p, i) => (
          <div key={i} className="flex justify-between gap-2">
            <dt>
              {paymentLabel(p)}
              {p.reference && <span className="block">{p.reference}</span>}
            </dt>
            <dd className="tabular">{m(p.amount)}</dd>
          </div>
        ))}
        {receipt.change && (
          <div className={cn('flex justify-between gap-2 text-sm font-bold')}>
            <dt>{t('receipt.changeDue')}</dt>
            <dd className="tabular">{m(receipt.change)}</dd>
          </div>
        )}
      </dl>
      <p className="mt-4 text-center text-xs">{receipt.footer}</p>
    </article>
  );
}
