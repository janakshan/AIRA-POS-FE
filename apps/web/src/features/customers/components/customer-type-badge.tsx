import type { CustomerType } from '@rbp/types';
import { StatusBadge, type StatusTone } from '@rbp/ui';
import { useTranslation } from 'react-i18next';

const TONE: Record<CustomerType, StatusTone> = {
  RETAIL: 'neutral',
  REGULAR: 'info',
  CORPORATE: 'progress',
};

export function CustomerTypeBadge({ type }: { type: CustomerType }) {
  const { t } = useTranslation('customers');
  return (
    <StatusBadge tone={TONE[type]} size="sm" hideIcon>
      {t(`type.${type}`)}
    </StatusBadge>
  );
}
