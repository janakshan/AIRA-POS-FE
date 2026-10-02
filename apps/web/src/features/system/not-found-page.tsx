import { Button, EmptyState } from '@rbp/ui';
import { CompassIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Screen } from '@/components/screen';

export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <Screen title={t('states.notFoundTitle')}>
      <EmptyState
        icon={CompassIcon}
        title={t('states.notFoundTitle')}
        description={t('states.notFoundDescription')}
        action={
          <Button asChild>
            <Link to="/">{t('states.goHome')}</Link>
          </Button>
        }
      />
    </Screen>
  );
}
