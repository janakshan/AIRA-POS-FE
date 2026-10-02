import { Button } from '@rbp/ui';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { localeFor } from '@/app/i18n';
import { monthLabel, shiftMonth, thisMonth } from '../lib/dates';

/** Previous / next month (HR-005, HR-006); no future months. */
export function MonthPicker({
  month,
  onChange,
}: {
  month: string;
  onChange: (month: string) => void;
}) {
  const { t, i18n } = useTranslation('staff');
  const locale = localeFor(i18n.language);
  return (
    <div className="flex items-center gap-1">
      <Button
        variant="outline"
        size="icon"
        onClick={() => onChange(shiftMonth(month, -1))}
        aria-label={t('month.prev')}
      >
        <ChevronLeftIcon />
      </Button>
      <span className="min-w-36 text-center text-sm font-medium">{monthLabel(month, locale)}</span>
      <Button
        variant="outline"
        size="icon"
        disabled={month >= thisMonth()}
        onClick={() => onChange(shiftMonth(month, 1))}
        aria-label={t('month.next')}
      >
        <ChevronRightIcon />
      </Button>
    </div>
  );
}
