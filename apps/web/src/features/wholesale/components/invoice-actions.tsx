import type { WholesaleInvoice } from '@rbp/types';
import { Button, toast } from '@rbp/ui';
import { CopyIcon, MessageCircleIcon, PrinterIcon, Share2Icon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { localeFor } from '@/app/i18n';
import { useErrorMessage } from '@/components/use-error-message';
import { useMe } from '@/features/auth/api/queries';
import { usePrintInvoice, useShareInvoice } from '../api/queries';
import { invoiceText, whatsappHref } from '../lib/format';

/**
 * WHO-003 print / share (A-273): print is the 80mm paper; share sends the invoice as text
 * through the phone's share sheet, WhatsApp to the shop's number, or the clipboard.
 * Every share and print is recorded on the invoice and in the audit log.
 */
export function InvoiceActions({ invoice }: { invoice: WholesaleInvoice }) {
  const { t, i18n } = useTranslation('wholesale');
  const locale = localeFor(i18n.language);
  const errorMessage = useErrorMessage();
  const { data: me } = useMe();
  const share = useShareInvoice();
  const print = usePrintInvoice();
  const business = me?.tenant.name ?? '';
  const text = invoiceText(invoice, business, locale, {
    title: t('invoice.paperTitle'),
    total: t('invoice.total'),
    paid: t('invoice.paidNowShort'),
    credit: t('invoice.onCredit'),
    balance: t('invoice.balanceAfter'),
    due: t('invoice.due'),
    vat: invoice.taxLabel,
  });
  const record = (channel: 'SHARE' | 'WHATSAPP' | 'COPY') =>
    share.mutate(
      { id: invoice.id, body: { channel } },
      { onError: (e) => toast.error(errorMessage(e)) },
    );
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const doPrint = () =>
    print.mutate(invoice.id, {
      onSuccess: () => {
        // jsdom (tests) has no print dialog.
        if (!navigator.userAgent.includes('jsdom')) window.print();
      },
      onError: (e) => toast.error(errorMessage(e)),
    });

  const doShare = async () => {
    try {
      await navigator.share({ title: `${business} ${invoice.number}`, text });
      record('SHARE');
    } catch {
      /* cancelled */
    }
  };

  const doCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      record('COPY');
      toast.success(t('invoice.copied'));
    } catch {
      toast.error(t('invoice.copyFailed'));
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      <Button onClick={doPrint} loading={print.isPending}>
        <PrinterIcon /> {invoice.prints.length ? t('invoice.reprint') : t('invoice.print')}
      </Button>
      {canShare && (
        <Button variant="outline" onClick={() => void doShare()}>
          <Share2Icon /> {t('invoice.share')}
        </Button>
      )}
      <Button variant="outline" asChild>
        <a
          href={whatsappHref(invoice.shopPhone, text)}
          target="_blank"
          rel="noreferrer"
          onClick={() => record('WHATSAPP')}
        >
          <MessageCircleIcon /> {t('invoice.whatsapp')}
        </a>
      </Button>
      <Button variant="ghost" onClick={() => void doCopy()}>
        <CopyIcon /> {t('invoice.copy')}
      </Button>
    </div>
  );
}
