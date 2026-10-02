import type { ProductionBatchStatus, ProductionPlanStatus } from '@rbp/types';
import { StatusBadge } from '@rbp/ui';
import { useTranslation } from 'react-i18next';
import { BATCH_TONE, PLAN_TONE } from '../lib/status';

export function PlanStatusBadge({
  status,
  size = 'sm',
}: {
  status: ProductionPlanStatus;
  size?: 'sm' | 'md';
}) {
  const { t } = useTranslation('production');
  return (
    <StatusBadge tone={PLAN_TONE[status]} size={size}>
      {t(`planStatus.${status}`)}
    </StatusBadge>
  );
}

export function BatchStatusBadge({
  status,
  size = 'sm',
}: {
  status: ProductionBatchStatus;
  size?: 'sm' | 'md';
}) {
  const { t } = useTranslation('production');
  return (
    <StatusBadge tone={BATCH_TONE[status]} size={size}>
      {t(`batchStatus.${status}`)}
    </StatusBadge>
  );
}
