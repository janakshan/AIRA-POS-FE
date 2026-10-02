import type { StockStatus } from '@rbp/types';
import { StatusBadge } from '@rbp/ui';
import { useTranslation } from 'react-i18next';
import { STOCK_TONE } from '../lib/stock';

export function StockStatusBadge({
  status,
  size = 'sm',
}: {
  status: StockStatus;
  size?: 'sm' | 'md';
}) {
  const { t } = useTranslation('inventory');
  return (
    <StatusBadge tone={STOCK_TONE[status]} size={size}>
      {t(`status.${status}`)}
    </StatusBadge>
  );
}
