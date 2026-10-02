import type { Money } from '@rbp/types';
import { cn, formatMoney } from '@rbp/utils';

export function MoneyText({
  value,
  locale,
  className,
}: {
  value: Money;
  locale?: string;
  className?: string;
}) {
  return (
    <span className={cn('tabular-nums', value.amount < 0 && 'text-destructive', className)}>
      {formatMoney(value, locale)}
    </span>
  );
}
