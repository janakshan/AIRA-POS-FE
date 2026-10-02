import { Card, EmptyState, PageHeader, StatusBadge } from '@rbp/ui';
import { HammerIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Screen } from '@/components/screen';
import type { NavItem } from '@/navigation/nav-config';
import { PageBreadcrumbs } from '@/navigation/page-breadcrumbs';

/** Stand-in for IA routes whose screens are built in later milestones. */
export function PlaceholderPage({ item }: { item: NavItem }) {
  const { t } = useTranslation();
  const title = t(`nav:items.${item.key}`);
  const phase = t(`phases.${item.phase}`);
  return (
    <Screen id={item.screenId} title={title} className="space-y-section">
      <PageHeader
        eyebrow={<PageBreadcrumbs />}
        title={title}
        actions={<StatusBadge tone="info">{phase}</StatusBadge>}
        description={
          item.screenId
            ? `${t('placeholder.screenId')} ${item.screenId}`
            : t('placeholder.screenIdPending')
        }
      />
      <Card>
        <EmptyState
          icon={HammerIcon}
          title={t('placeholder.title', {
            phase: item.phase === 'Later' ? t('placeholder.later') : phase,
          })}
          description={t('placeholder.description', { phase })}
        />
      </Card>
    </Screen>
  );
}
