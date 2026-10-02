import type { AdjustmentMode, CreateAdjustmentRequest } from '@rbp/types';
import {
  Button,
  ButtonGroup,
  FilterChip,
  NumericKeypad,
  RadioGroup,
  RadioGroupItem,
  ResponsiveDialog,
  toast,
} from '@rbp/ui';
import { formatMoney, parseMoney } from '@rbp/utils';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { localeFor } from '@/app/i18n';
import { useErrorMessage } from '@/components/use-error-message';
import { useSensitiveAction } from '@/features/auth/hooks/use-sensitive-action';
import { useLocalizedName } from '@/features/catalog/lib/localized-name';
import { useCreateAdjustment, usePosSettings, usePromotions } from '../api/queries';
import type { CartView } from '../hooks/use-cart';

type Tab = 'PERCENT' | 'FIXED' | 'PROMOTION';

export interface DiscountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cart: CartView;
  /** Item the dialog was opened from (item-level); null = whole bill. */
  productId: string | null;
}

const PERCENT_PRESETS = [5, 10, 15, 20];

/**
 * POS-004 Discount (REQ-485…491): percentage / fixed amount / promotion, on the whole bill or one
 * item. A manager PIN + reason is required; the server approves and audits it before it applies.
 */
export function DiscountDialog({ open, onOpenChange, cart, productId }: DiscountDialogProps) {
  const { t, i18n } = useTranslation('pos');
  const locale = localeFor(i18n.language);
  const nameOf = useLocalizedName();
  const errorMessage = useErrorMessage();
  const settings = usePosSettings();
  const promotions = usePromotions();
  const create = useCreateAdjustment();
  const confirmSensitive = useSensitiveAction();
  const [tab, setTab] = useState<Tab>('PERCENT');
  const [entry, setEntry] = useState('');
  const [promotionCode, setPromotionCode] = useState<string | null>(null);
  const [target, setTarget] = useState<string>('ORDER');

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setTab('PERCENT');
      setEntry('');
      setPromotionCode(null);
      setTarget(productId ?? 'ORDER');
    }
  }

  const currency = cart.totals?.total.currency ?? 'LKR';
  const scope = target === 'ORDER' ? 'ORDER' : 'LINE';
  const line = scope === 'LINE' ? cart.lines.find((l) => l.productId === target) : undefined;
  const maxBps = settings.data?.maxDiscountBps ?? 5000;
  const promotion = promotions.data?.find((p) => p.code === promotionCode && p.scope === scope);

  // Mode + value of what would be applied.
  let mode: AdjustmentMode | null = null;
  let value = 0;
  if (tab === 'PROMOTION') {
    if (promotion) ({ mode, value } = promotion);
  } else if (entry) {
    mode = tab;
    value =
      tab === 'PERCENT'
        ? Math.round(Number(entry) * 100)
        : (() => {
            try {
              return parseMoney(entry, currency).amount;
            } catch {
              return 0;
            }
          })();
  }

  const preview =
    mode && value > 0
      ? cart.preview({
          id: 'preview',
          kind: 'DISCOUNT',
          scope,
          ...(line ? { productId: line.productId } : {}),
          mode,
          value,
          label: 'preview',
        })
      : null;
  const discountNow =
    (preview?.discountTotal.amount ?? 0) - (cart.totals?.discountTotal.amount ?? 0);
  const targetNet =
    scope === 'LINE'
      ? (line?.netTotal.amount ?? 0)
      : (cart.totals?.lines.reduce((s, l) => s + l.net.amount, 0) ?? 0);

  let error: string | null = null;
  if (mode === 'PERCENT' && tab !== 'PROMOTION' && value > maxBps) {
    error = t('discount.tooHigh', { max: `${maxBps / 100}%` });
  } else if (mode === 'FIXED' && value > targetNet) {
    error = t('discount.tooMuch', {
      target: scope === 'LINE' ? t('discount.scopeLINE') : t('discount.scopeORDER'),
    });
  }
  const canApply = !!preview && discountNow > 0 && !error && !create.isPending;

  const apply = async () => {
    if (!mode) return;
    const target = line
      ? t('discount.item', { name: nameOf(line.product ?? line.snapshot), quantity: line.quantity })
      : t('discount.wholeBill');
    const verification = await confirmSensitive('pos.discount.apply', {
      reasonTitle: t('discount.reasonTitle'),
      reasonDescription: t('discount.reasonDescription'),
      summary: `${target} · −${formatMoney({ amount: discountNow, currency }, locale)}`,
    });
    if (!verification) return;
    const body: CreateAdjustmentRequest = {
      kind: 'DISCOUNT',
      scope,
      ...(line ? { productId: line.productId } : {}),
      ...(tab === 'PROMOTION' && promotion ? { promotionCode: promotion.code } : { mode, value }),
      verification,
    };
    create.mutate(body, {
      onSuccess: (adjustment) => {
        cart.addAdjustment(adjustment);
        toast.success(
          t('discount.approved', {
            label: adjustment.label,
            name: adjustment.approvedBy?.fullName ?? '',
          }),
        );
        onOpenChange(false);
      },
      onError: (e) => toast.error(errorMessage(e)),
    });
  };

  const scopePromotions = promotions.data?.filter((p) => p.scope === scope) ?? [];

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('discount.title')}
      closeLabel={t('closeSale')}
      size="lg"
      footer={
        <Button
          size="pos"
          className="w-full sm:w-auto"
          disabled={!canApply}
          loading={create.isPending}
          onClick={() => void apply()}
        >
          {t('discount.apply')}
        </Button>
      }
    >
      <div data-screen-id="POS-004" className="grid gap-5 md:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="space-y-4">
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{t('discount.target')}</legend>
            <RadioGroup
              value={target}
              onValueChange={(v) => {
                setTarget(v);
                setPromotionCode(null);
              }}
              className="grid gap-2"
            >
              {[
                { id: 'ORDER', label: t('discount.wholeBill') },
                ...cart.lines
                  .filter((l) => l.product)
                  .map((l) => ({
                    id: l.productId,
                    label: t('discount.item', {
                      name: nameOf(l.product ?? l.snapshot),
                      quantity: l.quantity,
                    }),
                  })),
              ].map((o) => (
                <label
                  key={o.id}
                  className="flex min-h-touch cursor-pointer items-center gap-3 rounded-lg border px-3 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
                >
                  <RadioGroupItem value={o.id} />
                  <span className="text-sm font-medium">{o.label}</span>
                </label>
              ))}
            </RadioGroup>
          </fieldset>

          <ButtonGroup aria-label={t('discount.title')} className="w-full [&>*]:flex-1">
            {(['PERCENT', 'FIXED', 'PROMOTION'] as const).map((k) => (
              <Button
                key={k}
                variant={tab === k ? 'default' : 'outline'}
                aria-pressed={tab === k}
                onClick={() => {
                  setTab(k);
                  setEntry('');
                }}
              >
                {t(
                  k === 'PERCENT'
                    ? 'discount.percent'
                    : k === 'FIXED'
                      ? 'discount.amount'
                      : 'discount.promotion',
                )}
              </Button>
            ))}
          </ButtonGroup>

          {tab === 'PROMOTION' ? (
            scopePromotions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t('discount.noPromotions', { scope: t(`discount.scope${scope}`) })}
              </p>
            ) : (
              <RadioGroup
                value={promotionCode ?? ''}
                onValueChange={setPromotionCode}
                className="grid gap-2"
              >
                {scopePromotions.map((p) => (
                  <label
                    key={p.code}
                    className="flex min-h-touch-pos cursor-pointer items-center gap-3 rounded-lg border px-3 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
                  >
                    <RadioGroupItem value={p.code} />
                    <span className="flex-1 font-medium">{p.name}</span>
                    <span className="text-sm text-muted-foreground tabular">
                      {p.mode === 'PERCENT'
                        ? `${p.value / 100}%`
                        : formatMoney({ amount: p.value, currency }, locale)}
                    </span>
                  </label>
                ))}
              </RadioGroup>
            )
          ) : tab === 'PERCENT' ? (
            <div className="flex flex-wrap gap-2">
              {PERCENT_PRESETS.map((p) => (
                <FilterChip
                  key={p}
                  active={entry === String(p)}
                  onClick={() => setEntry(String(p))}
                >
                  {p}%
                </FilterChip>
              ))}
            </div>
          ) : null}

          <div aria-live="polite" className="min-h-12 rounded-lg bg-muted/50 px-3 py-2 text-sm">
            {error ? (
              <p className="font-medium text-destructive">{error}</p>
            ) : preview && discountNow > 0 ? (
              <p className="font-medium">
                {scope === 'LINE'
                  ? t('discount.previewItem', {
                      discount: formatMoney({ amount: discountNow, currency }, locale),
                      net: formatMoney(
                        preview.lines.find((l) => l.productId === line?.productId)?.net ?? {
                          amount: 0,
                          currency,
                        },
                        locale,
                      ),
                    })
                  : t('discount.preview', {
                      discount: formatMoney({ amount: discountNow, currency }, locale),
                      total: formatMoney(preview.total, locale),
                    })}
              </p>
            ) : null}
          </div>
        </div>

        {tab !== 'PROMOTION' && (
          <NumericKeypad
            value={entry}
            onChange={setEntry}
            mode={tab === 'PERCENT' ? 'integer' : 'decimal'}
            maxLength={tab === 'PERCENT' ? 3 : 8}
            label={t(tab === 'PERCENT' ? 'discount.percentLabel' : 'discount.amountLabel')}
            display={
              tab === 'PERCENT'
                ? `${entry || '0'}%`
                : formatMoney({ amount: value, currency }, locale)
            }
          />
        )}
      </div>
    </ResponsiveDialog>
  );
}
