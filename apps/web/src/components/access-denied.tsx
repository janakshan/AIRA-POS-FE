import { Button, ForbiddenState } from '@rbp/ui';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { AccessResult } from '@/features/auth/access';

/**
 * The standard 403 state. Route guards pass the failed access check; pages whose API answered
 * FORBIDDEN for one record (e.g. another rider's delivery) pass their own `description`.
 */
export function AccessDenied({
  result,
  description: custom,
}:
  | { result: Exclude<AccessResult, { allowed: true }>; description?: never }
  | { result?: never; description: ReactNode }) {
  const { t } = useTranslation();
  const description = !result
    ? custom
    : result.reason === 'feature'
      ? t('access.featureDisabled', { feature: t(`features.${result.feature}`) })
      : t('access.missingPermission', { permission: result.permission });
  return (
    <ForbiddenState
      title={t('access.deniedTitle')}
      description={
        <>
          {description} {t('access.contactAdmin')}
        </>
      }
      action={
        <Button variant="outline" asChild>
          <Link to="/">{t('states.goHome')}</Link>
        </Button>
      }
    />
  );
}
