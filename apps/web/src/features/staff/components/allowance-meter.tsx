import type { Money } from '@rbp/types';
import { Card } from '@rbp/ui';
import { cn, formatMoney } from '@rbp/utils';
import { useTranslation } from 'react-i18next';
import { localeFor } from '@/app/i18n';

/** §23 this month: eaten vs allowance; anything over is for salary deduction. */
export function AllowanceMeter({ used, allowance }: { used: Money; allowance: Money }) {
  const { t, i18n } = useTranslation('staff');
  const locale = localeFor(i18n.language);
  const pct = allowance.amount > 0 ? Math.round((used.amount / allowance.amount) * 100) : 0;
  const excess = Math.max(0, used.amount - allowance.amount);
  const fmt = (amount: number) => formatMoney({ amount, currency: used.currency }, locale);
  return (
    <Card className="gap-2 p-4">
      <p className="text-sm font-medium">{t('allowanceCard.title')}</p>
      <p className="text-2xl font-semibold tabular">
        {fmt(used.amount)}{' '}
        <span className="text-sm font-normal text-muted-foreground">
          {t('allowanceCard.of', { amount: fmt(allowance.amount) })}
        </span>
      </p>
      <div
        role="meter"
        aria-label={t('allowanceCard.title')}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(pct, 100)}
        className="h-2 overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn(
            'h-full rounded-full',
            pct > 100 ? 'bg-status-danger' : pct >= 80 ? 'bg-status-warning' : 'bg-status-success',
          )}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <p
        className={cn(
          'text-sm',
          excess ? 'font-semibold text-status-danger-fg' : 'text-muted-foreground',
        )}
      >
        {excess
          ? t('allowanceCard.excess', { amount: fmt(excess) })
          : t('allowanceCard.remaining', { amount: fmt(allowance.amount - used.amount) })}
      </p>
    </Card>
  );
}
