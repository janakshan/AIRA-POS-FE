import type { Kot } from '@rbp/types';
import { Button, ResponsiveDialog, toast } from '@rbp/ui';
import { formatDateTime } from '@rbp/utils';
import { PrinterIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { localeFor } from '@/app/i18n';
import { kotHeadline } from '../lib/kot';

/** KOT-004 print preview on the station's (simulated) kitchen printer. */
export function KotPrintDialog({
  kot,
  printerName,
  onOpenChange,
}: {
  kot: Kot | null;
  printerName: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, i18n } = useTranslation('pos');
  const locale = localeFor(i18n.language);
  return (
    <ResponsiveDialog
      open={!!kot}
      onOpenChange={onOpenChange}
      title={t('kot.previewTitle')}
      description={printerName ?? undefined}
      closeLabel={t('closeSale')}
      size="sm"
      footer={
        <Button
          size="pos"
          className="w-full sm:w-auto"
          onClick={() => {
            toast.success(
              t('kot.printed', { number: kot?.number ?? '', printer: printerName ?? '' }),
            );
            onOpenChange(false);
          }}
        >
          <PrinterIcon /> {t('kot.printAgain')}
        </Button>
      }
    >
      {kot && (
        <div
          data-screen-id="KOT-004"
          className="mx-auto w-full max-w-72 space-y-2 rounded-md border bg-white p-4 font-mono text-sm text-black shadow-inner"
        >
          <p className="text-center font-bold">{kot.stationName.toUpperCase()}</p>
          {kot.kind === 'CANCEL' && (
            <p className="border-2 border-black text-center text-lg font-bold">
              *** {t('kot.cancelTicket').toUpperCase()} ***
            </p>
          )}
          <p className="text-center text-lg font-bold">{kotHeadline(kot, t).toUpperCase()}</p>
          <p className="flex justify-between border-b border-dashed border-black pb-1">
            <span>{kot.number}</span>
            <span>{kot.orderNumber}</span>
          </p>
          <ul className="space-y-1">
            {kot.items.map((i) => (
              <li key={i.lineId}>
                <span className="font-bold">
                  {i.quantity} x {i.name}
                </span>
                {i.note && <span className="block pl-4">&gt; {i.note}</span>}
                {i.disposition && (
                  <span className="block pl-4">[{t(`disposition.${i.disposition}`)}]</span>
                )}
              </li>
            ))}
          </ul>
          <p className="border-t border-dashed border-black pt-1 text-xs">
            {formatDateTime(kot.createdAt, { locale })} · {kot.createdBy}
          </p>
        </div>
      )}
    </ResponsiveDialog>
  );
}
