import type { Money } from '@rbp/types';
import { cn, formatMoney } from '@rbp/utils';
import { useTranslation } from 'react-i18next';
import { localeFor } from '@/app/i18n';
import { creditUsed } from '../lib/format';

/** Outstanding against the credit limit (WHO-001/002/003). */
export function CreditBar({
  outstanding,
  limit,
  className,
}: {
  outstanding: Money;
  limit: Money;
  className?: string;
}) {
  const { t, i18n } = useTranslation('wholesale');
  const locale = localeFor(i18n.language);
  const used = creditUsed(outstanding, limit);
  if (used === null) {
    return <p className={cn('text-xs text-muted-foreground', className)}>{t('credit.noLimit')}</p>;
  }
  const tone =
    used > 100 ? 'bg-status-danger' : used >= 80 ? 'bg-status-warning' : 'bg-status-success';
  return (
    <div className={cn('space-y-1', className)}>
      <div
        role="meter"
        aria-label={t('credit.used')}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(used, 100)}
        aria-valuetext={t('credit.usedText', { percent: used })}
        className="h-2 overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn('h-full rounded-full', tone)}
          style={{ width: `${Math.min(used, 100)}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {t('credit.ofLimit', {
          outstanding: formatMoney(outstanding, locale),
          limit: formatMoney(limit, locale),
          percent: used,
        })}
      </p>
    </div>
  );
}
