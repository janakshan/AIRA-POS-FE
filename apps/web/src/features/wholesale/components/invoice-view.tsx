import type { WholesaleInvoice } from '@rbp/types';
import { formatDateTime, formatMoney, formatPhone } from '@rbp/utils';
import { useTranslation } from 'react-i18next';
import { localeFor } from '@/app/i18n';
import { formatPlainDate } from '@/features/purchasing/lib/status';

/** 80mm invoice (WHO-003), same paper style as the POS receipt; what `window.print()` prints. */
export function InvoiceView({
  invoice,
  business,
  van,
}: {
  invoice: WholesaleInvoice;
  business: string;
  van: string;
}) {
  const { t, i18n } = useTranslation('wholesale');
  const locale = localeFor(i18n.language);
  const m = (v: WholesaleInvoice['total']) => formatMoney(v, locale);
  return (
    <article
      data-print-root
      aria-label={invoice.number}
      className="relative mx-auto w-full max-w-[22rem] overflow-hidden rounded-md border bg-white px-5 py-6 font-mono text-[13px] leading-snug text-neutral-900 shadow-sm"
    >
      {invoice.voided && (
        <p
          role="status"
          className="absolute top-16 right-3 rotate-12 rounded border-2 border-red-700 px-2 py-0.5 text-lg font-bold tracking-widest text-red-700 uppercase"
        >
          {t('void.stamp')}
        </p>
      )}
      <header className="text-center">
        <p className="text-base font-bold">{business}</p>
        <p>{t('invoice.paperTitle')}</p>
        <p className="text-xs">{van}</p>
      </header>
      <hr className="my-3 border-dashed border-neutral-400" />
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 text-xs">
        <dt>#</dt>
        <dd className="text-right font-bold">{invoice.number}</dd>
        <dt>{formatDateTime(invoice.at, { locale })}</dt>
        <dd className="text-right">{invoice.createdBy}</dd>
        <dt>{t('invoice.shop')}</dt>
        <dd className="text-right">
          {invoice.shopName}
          {invoice.shopPhone && <span className="block">{formatPhone(invoice.shopPhone)}</span>}
        </dd>
      </dl>
      <hr className="my-3 border-dashed border-neutral-400" />
      <ul className="space-y-1.5">
        {invoice.lines.map((l) => (
          <li key={l.productId}>
            <div className="flex justify-between gap-2">
              <span>{l.name}</span>
              <span className="tabular-nums">{m(l.lineTotal)}</span>
            </div>
            <div className="text-xs text-neutral-600">
              {l.quantity} × {m(l.unitPrice)}
              {l.returnedQuantity > 0 &&
                ` · ${t('invoice.returned', { count: l.returnedQuantity })}`}
            </div>
          </li>
        ))}
      </ul>
      <hr className="my-3 border-dashed border-neutral-400" />
      <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5">
        <dt className="font-bold">{t('invoice.total')}</dt>
        <dd className="text-right font-bold tabular-nums">{m(invoice.total)}</dd>
        <dt className="text-xs">
          {t('invoice.vatIncluded', { label: invoice.taxLabel, rate: invoice.taxRateBps / 100 })}
        </dt>
        <dd className="text-right text-xs tabular-nums">{m(invoice.tax)}</dd>
        {invoice.paidNow && (
          <>
            <dt>{t('invoice.paidNow', { method: t(`method.${invoice.paidNow.method}`) })}</dt>
            <dd className="text-right tabular-nums">{m(invoice.paidNow.amount)}</dd>
          </>
        )}
        <dt>{t('invoice.onCredit')}</dt>
        <dd className="text-right tabular-nums">{m(invoice.credit)}</dd>
        {invoice.credit.amount > 0 && (
          <>
            <dt className="text-xs">{t('invoice.due')}</dt>
            <dd className="text-right text-xs">{formatPlainDate(invoice.dueDate, locale)}</dd>
          </>
        )}
      </dl>
      <hr className="my-3 border-dashed border-neutral-400" />
      <dl className="grid grid-cols-[1fr_auto] gap-x-3 text-xs">
        <dt>{t('invoice.balanceBefore')}</dt>
        <dd className="text-right tabular-nums">{m(invoice.balanceBefore)}</dd>
        <dt className="font-bold">{t('invoice.balanceAfter')}</dt>
        <dd className="text-right font-bold tabular-nums">{m(invoice.balanceAfter)}</dd>
      </dl>
      <p className="mt-4 text-center text-xs">{t('invoice.thanks')}</p>
    </article>
  );
}
