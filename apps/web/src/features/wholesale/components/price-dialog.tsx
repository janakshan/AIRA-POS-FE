import { zodResolver } from '@hookform/resolvers/zod';
import type { WholesalePriceRow } from '@rbp/types';
import {
  Button,
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  MoneyInput,
  ResponsiveDialog,
  toast,
} from '@rbp/ui';
import { formatMoney } from '@rbp/utils';
import { type WholesalePriceInput, wholesalePriceSchema } from '@rbp/validation';
import { useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { localeFor } from '@/app/i18n';
import { useErrorMessage } from '@/components/use-error-message';
import { applyServerErrors } from '@/lib/form-errors';
import { useUpdateWholesalePrice } from '../api/queries';

/**
 * A-310 change one product's wholesale price (VAT inclusive, above zero). Invoices already made
 * keep their prices; the next invoice uses the new one. Audited old → new.
 */
export function PriceDialog({
  row,
  onOpenChange,
}: {
  row: WholesalePriceRow | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, i18n } = useTranslation('wholesale');
  const locale = localeFor(i18n.language);
  const errorMessage = useErrorMessage();
  const update = useUpdateWholesalePrice();
  const form = useForm<WholesalePriceInput>({
    resolver: zodResolver(wholesalePriceSchema),
    defaultValues: { price: row?.price?.amount ?? 0 },
  });
  useEffect(() => {
    if (row) form.reset({ price: row.price?.amount ?? 0 });
  }, [row, form]);
  const currency = row?.retailPrice.currency ?? 'LKR';
  const price = useWatch({ control: form.control, name: 'price' });
  const share =
    row && price > 0 && row.retailPrice.amount > 0
      ? Math.round((price / row.retailPrice.amount) * 100)
      : null;

  const onSubmit = form.handleSubmit((values) => {
    if (!row) return;
    update.mutate(
      { productId: row.productId, body: { price: values.price } },
      {
        onSuccess: (r) => {
          toast.success(
            t('prices.saved', {
              name: r.name,
              price: r.price ? formatMoney(r.price, locale) : '',
            }),
          );
          onOpenChange(false);
        },
        onError: (e) => {
          if (!applyServerErrors(form, e)) toast.error(errorMessage(e));
        },
      },
    );
  });

  return (
    <ResponsiveDialog
      open={!!row}
      onOpenChange={(o) => !update.isPending && onOpenChange(o)}
      title={t('prices.editTitle', { name: row?.name ?? '' })}
      description={t('prices.editHint')}
      closeLabel={t('close')}
      size="sm"
      footer={
        <Button
          type="submit"
          form="wholesale-price-form"
          size="pos"
          className="w-full sm:w-auto"
          loading={update.isPending}
        >
          {t('prices.save')}
        </Button>
      }
    >
      <Form {...form}>
        <form id="wholesale-price-form" onSubmit={onSubmit} noValidate className="space-y-4">
          {row && (
            <dl className="grid grid-cols-2 gap-3 rounded-lg bg-muted/60 px-3 py-2 text-sm">
              <div>
                <dt className="text-muted-foreground">{t('prices.retail')}</dt>
                <dd className="font-medium tabular-nums">{formatMoney(row.retailPrice, locale)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t('prices.current')}</dt>
                <dd className="font-medium tabular-nums">
                  {row.price ? formatMoney(row.price, locale) : t('prices.notSold')}
                </dd>
              </div>
            </dl>
          )}
          <FormField
            control={form.control}
            name="price"
            render={({ field }) => (
              <FormItem>
                <FormLabel required>{t('prices.wholesale')}</FormLabel>
                <FormControl>
                  <MoneyInput
                    currency={currency}
                    symbol="Rs"
                    value={field.value > 0 ? { amount: field.value, currency } : null}
                    onChange={(m) => field.onChange(m?.amount ?? 0)}
                    onBlur={field.onBlur}
                    name={field.name}
                    ref={field.ref}
                    autoFocus
                  />
                </FormControl>
                <FormDescription>
                  {share !== null ? t('prices.ofRetail', { percent: share }) : t('prices.vatIncl')}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <p className="text-xs text-muted-foreground">{t('prices.issuedKeep')}</p>
        </form>
      </Form>
    </ResponsiveDialog>
  );
}
