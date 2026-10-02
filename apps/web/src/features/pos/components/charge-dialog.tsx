import type { ChargeType, CreateAdjustmentRequest } from '@rbp/types';
import {
  Button,
  Input,
  NumericKeypad,
  ResponsiveDialog,
  Skeleton,
  StatusBadge,
  toast,
} from '@rbp/ui';
import { cn, formatMoney, parseMoney } from '@rbp/utils';
import { XIcon } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { localeFor } from '@/app/i18n';
import { useErrorMessage } from '@/components/use-error-message';
import { useSensitiveAction } from '@/features/auth/hooks/use-sensitive-action';
import { useChargeTypes, useCreateAdjustment } from '../api/queries';
import type { CartView } from '../hooks/use-cart';
import { useRemoveAdjustment } from '../hooks/use-remove-adjustment';

export interface ChargeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cart: CartView;
}

/** What the keypad is being used for. */
type Editing = { type: ChargeType; kind: 'amount' | 'rate' } | null;

const pct = (bps: number) => `${bps / 100}%`;

/** A service charge can't be more than the bill itself. */
const MAX_RATE_BPS = 10000;

/**
 * POS-005 Charges (REQ-463…483): service, delivery, packaging and other charges configured per
 * location. Defaults add instantly; custom amounts, service-charge changes and removals need a
 * manager PIN. Every change is approved and audited by the server.
 */
export function ChargeDialog({ open, onOpenChange, cart }: ChargeDialogProps) {
  const { t, i18n } = useTranslation('pos');
  const locale = localeFor(i18n.language);
  const errorMessage = useErrorMessage();
  const types = useChargeTypes();
  const create = useCreateAdjustment();
  const confirmSensitive = useSensitiveAction();
  const { remove, pending: removing } = useRemoveAdjustment(cart);
  const [editing, setEditing] = useState<Editing>(null);
  const [entry, setEntry] = useState('');
  const [otherLabel, setOtherLabel] = useState('');
  const labelId = useId();

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setEditing(null);
      setEntry('');
      setOtherLabel('');
    }
  }

  const currency = cart.totals?.total.currency ?? 'LKR';
  const money = (amount: number) => formatMoney({ amount, currency }, locale);
  const serviceOverride = cart.adjustments.find((a) => a.chargeCode === 'SERVICE');
  const applied = cart.adjustments.filter((a) => a.kind === 'CHARGE' && a.chargeCode !== 'SERVICE');

  const submit = async (
    body: Omit<CreateAdjustmentRequest, 'kind' | 'scope'>,
    needsPin: boolean,
  ) => {
    let verification;
    if (needsPin) {
      const name = types.data?.find((c) => c.code === body.chargeCode)?.name ?? '';
      const amount = body.mode === 'PERCENT' ? pct(body.value ?? 0) : money(body.value ?? 0);
      verification = await confirmSensitive('pos.charge.manage', {
        reasonTitle: t('charge.reasonTitle'),
        reasonDescription: t('charge.reasonDescription'),
        summary: `${body.label ?? name} · ${amount}`,
      });
      if (!verification) return;
    }
    create.mutate(
      { kind: 'CHARGE', scope: 'ORDER', ...body, ...(verification ? { verification } : {}) },
      {
        onSuccess: (adjustment) => {
          cart.addAdjustment(adjustment);
          toast.success(t('charge.added', { label: adjustment.label }));
          setEditing(null);
          setEntry('');
          setOtherLabel('');
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    );
  };

  const entryValue = (() => {
    if (!entry || !editing) return null;
    if (editing.kind === 'rate') return Math.round(Number(entry) * 100);
    try {
      return parseMoney(entry, currency).amount;
    } catch {
      return null;
    }
  })();
  const needsLabel = editing?.type.code === 'OTHER' && !otherLabel.trim();
  // Say why the button is off instead of silently disabling it (like the discount limit).
  const rateTooHigh = editing?.kind === 'rate' && entryValue !== null && entryValue > MAX_RATE_BPS;
  const canSubmitEntry =
    entryValue !== null &&
    (editing?.kind === 'rate' ? !rateTooHigh : entryValue > 0) &&
    !needsLabel;

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('charge.title')}
      description={t('charge.description')}
      closeLabel={t('closeSale')}
      size="lg"
    >
      <div
        data-screen-id="POS-005"
        className={cn('grid gap-5', editing && 'md:grid-cols-[minmax(0,1fr)_18rem]')}
      >
        <div className="space-y-3">
          {types.isPending ? (
            <Skeleton className="h-40" />
          ) : (
            <ul className="space-y-2">
              {types.data?.map((type) => (
                <li key={type.code} className="space-y-2 rounded-xl border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold">{type.name}</span>
                    {type.code === 'SERVICE' ? (
                      <StatusBadge
                        tone={serviceOverride ? 'warning' : 'neutral'}
                        size="sm"
                        hideIcon
                      >
                        {serviceOverride
                          ? serviceOverride.value === 0
                            ? t('charge.waived')
                            : t('charge.rate', { rate: pct(serviceOverride.value) })
                          : t('charge.automatic', { rate: pct(type.defaultValue ?? 0) })}
                      </StatusBadge>
                    ) : type.defaultValue !== null ? (
                      <span className="text-sm text-muted-foreground tabular">
                        {type.mode === 'PERCENT'
                          ? pct(type.defaultValue)
                          : money(type.defaultValue)}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {type.code === 'SERVICE' ? (
                      <>
                        {(!serviceOverride || serviceOverride.value !== 0) && (
                          <Button
                            variant="outline"
                            size="pos"
                            disabled={create.isPending}
                            onClick={() =>
                              void submit(
                                { chargeCode: 'SERVICE', mode: 'PERCENT', value: 0 },
                                true,
                              )
                            }
                          >
                            {t('charge.waive')}
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="pos"
                          onClick={() => {
                            setEditing({ type, kind: 'rate' });
                            setEntry('');
                          }}
                        >
                          {t('charge.changeRate')}
                        </Button>
                        {serviceOverride && (
                          <Button
                            variant="ghost"
                            size="pos"
                            disabled={removing}
                            onClick={() => void remove(serviceOverride)}
                          >
                            {t('charge.restore', { rate: pct(type.defaultValue ?? 0) })}
                          </Button>
                        )}
                      </>
                    ) : (
                      <>
                        {type.defaultValue !== null && (
                          <Button
                            size="pos"
                            disabled={create.isPending}
                            onClick={() =>
                              void submit(
                                {
                                  chargeCode: type.code,
                                  mode: type.mode,
                                  value: type.defaultValue ?? 0,
                                },
                                false,
                              )
                            }
                          >
                            {t('charge.add', {
                              amount:
                                type.mode === 'PERCENT'
                                  ? pct(type.defaultValue)
                                  : money(type.defaultValue),
                            })}
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="pos"
                          onClick={() => {
                            setEditing({ type, kind: 'amount' });
                            setEntry('');
                          }}
                        >
                          {t('charge.custom')}
                        </Button>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          <section aria-labelledby="charges-applied" className="space-y-2">
            <h3 id="charges-applied" className="text-sm font-semibold text-muted-foreground">
              {t('charge.applied')}
            </h3>
            {applied.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('charge.none')}</p>
            ) : (
              <ul className="divide-y rounded-xl border">
                {applied.map((a) => {
                  const amount = cart.totals?.charges.find((c) => c.id === a.id)?.amount;
                  return (
                    <li key={a.id} className="flex items-center gap-2 px-3 py-1.5">
                      <span className="flex-1 text-sm font-medium">{a.label}</span>
                      <span className="text-sm tabular">
                        {amount ? formatMoney(amount, locale) : ''}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={removing}
                        onClick={() => void remove(a)}
                        aria-label={t('charge.remove', { label: a.label })}
                      >
                        <XIcon />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        {editing && (
          <div className="space-y-3">
            <p className="font-semibold">{editing.type.name}</p>
            {editing.type.code === 'OTHER' && (
              <div className="space-y-1.5">
                <label htmlFor={labelId} className="text-sm font-medium">
                  {t('charge.otherLabel')}
                </label>
                <Input
                  id={labelId}
                  value={otherLabel}
                  maxLength={40}
                  onChange={(e) => setOtherLabel(e.target.value)}
                  placeholder={t('charge.otherPlaceholder')}
                />
              </div>
            )}
            <NumericKeypad
              value={entry}
              onChange={setEntry}
              mode={editing.kind === 'rate' ? 'integer' : 'decimal'}
              maxLength={editing.kind === 'rate' ? 3 : 8}
              label={t(editing.kind === 'rate' ? 'charge.ratePercent' : 'charge.amount')}
              display={editing.kind === 'rate' ? `${entry || '0'}%` : money(entryValue ?? 0)}
            />
            {rateTooHigh && (
              <p role="alert" className="text-sm font-medium text-destructive">
                {t('charge.rateTooHigh', { max: pct(MAX_RATE_BPS) })}
              </p>
            )}
            <Button
              size="pos"
              className="w-full"
              disabled={!canSubmitEntry || create.isPending}
              loading={create.isPending}
              onClick={() =>
                entryValue !== null &&
                void submit(
                  {
                    chargeCode: editing.type.code,
                    mode: editing.kind === 'rate' ? 'PERCENT' : 'FIXED',
                    value: entryValue,
                    ...(editing.type.code === 'OTHER' ? { label: otherLabel.trim() } : {}),
                  },
                  true,
                )
              }
            >
              {t(editing.kind === 'rate' ? 'charge.setRate' : 'charge.addCustom')}
            </Button>
          </div>
        )}
      </div>
    </ResponsiveDialog>
  );
}
