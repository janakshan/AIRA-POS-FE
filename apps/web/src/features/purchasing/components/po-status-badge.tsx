import type { PurchaseOrder } from '@rbp/types';
import { StatusBadge } from '@rbp/ui';
import { useTranslation } from 'react-i18next';
import { isOverdue, PO_TONE } from '../lib/status';

/** PO status, plus an "Overdue" marker when an open order is past its expected date. */
export function PoStatusBadge({
  order,
  size = 'sm',
}: {
  order: PurchaseOrder;
  size?: 'sm' | 'md';
}) {
  const { t } = useTranslation('purchasing');
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <StatusBadge tone={PO_TONE[order.status]} size={size}>
        {t(`status.${order.status}`)}
      </StatusBadge>
      {isOverdue(order) && (
        <StatusBadge tone="danger" size={size}>
          {t('orders.overdue')}
        </StatusBadge>
      )}
    </span>
  );
}
