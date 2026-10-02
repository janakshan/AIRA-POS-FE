import type { DeliveryStatus } from '@rbp/types';
import { StatusBadge } from '@rbp/ui';
import { useTranslation } from 'react-i18next';
import { TONE } from '../lib/status';

export function DeliveryStatusBadge({
  status,
  size = 'sm',
}: {
  status: DeliveryStatus;
  size?: 'sm' | 'md';
}) {
  const { t } = useTranslation('delivery');
  return (
    <StatusBadge tone={TONE[status]} size={size}>
      {t(`status.${status}`)}
    </StatusBadge>
  );
}
