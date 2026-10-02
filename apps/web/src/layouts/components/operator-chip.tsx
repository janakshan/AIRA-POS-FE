import { UserCheckIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSessionStore } from '@/stores/session-store';

/** Shows the last PIN-verified employee on this shared device. */
export function OperatorChip() {
  const { t } = useTranslation();
  const verification = useSessionStore((s) => s.lastVerification);
  if (!verification) return null;
  return (
    <span
      title={t('shell.operator')}
      className="hidden items-center gap-1.5 rounded-full bg-status-success/12 px-2.5 py-1 text-xs font-medium text-status-success md:inline-flex"
    >
      <UserCheckIcon className="size-3.5" />
      {verification.employee.fullName}
    </span>
  );
}
