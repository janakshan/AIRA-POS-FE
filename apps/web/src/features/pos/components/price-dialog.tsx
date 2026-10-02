import { Button, NumericKeypad, ResponsiveDialog, toast } from '@rbp/ui';
import { formatMoney, parseMoney } from '@rbp/utils';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { localeFor } from '@/app/i18n';
import { useErrorMessage } from '@/components/use-error-message';
import { useSensitiveAction } from '@/features/auth/hooks/use-sensitive-action';
import { useLocalizedName } from '@/features/catalog/lib/localized-name';
import { useCreateAdjustment } from '../api/queries';
import type { CartLineView, CartView } from '../hooks/use-cart';

/**
 * Change one item's selling price on this sale (REQ-224, `pos.price.override`).
 * Manager PIN + reason; the server records before → after in the audit log.
 */
export function PriceDialog({
  line,
  cart,
  onOpenChange,
}: {
  line: CartLineView | undefined;
  cart: CartView;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, i18n } = useTranslation('pos');
  const locale = localeFor(i18n.language);
  const nameOf = useLocalizedName();
  const errorMessage = useErrorMessage();
  const create = useCreateAdjustment();
  const confirmSensitive = useSensitiveAction();
  const [entry, setEntry] = useState('');
  const open = !!line;
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setEntry('');
  }

  const currency = line?.unitPrice.currency ?? 'LKR';
  const value = (() => {
    try {
      return entry ? parseMoney(entry, currency).amount : 0;
    } catch {
      return 0;
    }
  })();
  const name = line ? nameOf(line.product ?? line.snapshot) : '';
  const same = !!line && value === line.unitPrice.amount;

  const apply = async () => {
    if (!line || !value) return;
    const before = formatMoney(line.unitPrice, locale);
    const after = formatMoney({ amount: value, currency }, locale);
    const verification = await confirmSensitive('pos.price.override', {
      reasonTitle: t('price.reasonTitle'),
      reasonDescription: t('price.reasonDescription'),
      summary: `${name} ×${line.quantity}`,
      change: { before, after },
    });
    if (!verification) return;
    create.mutate(
      {
        kind: 'PRICE',
        scope: 'LINE',
        productId: line.productId,
        mode: 'FIXED',
        value,
        verification,
      },
      {
        onSuccess: (adjustment) => {
          // The latest change wins; removing it falls back to the previous one (both audited).
          cart.addAdjustment(adjustment);
          toast.success(
            t('price.approved', {
              name,
              price: after,
              approver: adjustment.approvedBy?.fullName ?? '',
            }),
          );
          onOpenChange(false);
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    );
  };

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('price.title')}
      description={
        line
          ? `${name} · ${t('price.current', { price: formatMoney(line.unitPrice, locale) })}`
          : undefined
      }
      closeLabel={t('closeSale')}
      footer={
        <Button
          size="pos"
          className="w-full sm:w-auto"
          disabled={!value || same || create.isPending}
          loading={create.isPending}
          onClick={() => void apply()}
        >
          {t('price.apply')}
        </Button>
      }
    >
      <div className="space-y-2">
        <NumericKeypad
          value={entry}
          onChange={setEntry}
          mode="decimal"
          maxLength={8}
          label={t('price.newPrice')}
          display={formatMoney({ amount: value, currency }, locale)}
        />
        {same && <p className="text-sm text-destructive">{t('price.same')}</p>}
      </div>
    </ResponsiveDialog>
  );
}
