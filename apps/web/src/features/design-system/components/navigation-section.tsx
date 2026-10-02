import {
  Breadcrumbs,
  Button,
  PageHeader,
  Pagination,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@rbp/ui';
import { ArchiveIcon, DownloadIcon, PlusIcon, UploadIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DsSection, Example } from './section';

const SUB_TABS = ['overview', 'pricing', 'locations', 'stock', 'recipes', 'history'] as const;

export function NavigationSection() {
  const { t } = useTranslation('designSystem');
  const { t: tn } = useTranslation('nav');
  const [page, setPage] = useState(4);
  return (
    <DsSection id="navigation" title={t('sections.navigation')}>
      <p className="text-muted-foreground">{t('navigation.sidebarHint')}</p>
      <Example title={t('navigation.pageHeader')} hint={t('navigation.pageHeaderHint')}>
        <PageHeader
          eyebrow={
            <Breadcrumbs
              items={[
                { label: tn('groups.catalog'), href: '/catalog/products' },
                { label: tn('items.products') },
              ]}
            />
          }
          title={t('navigation.pageHeaderTitle')}
          actions={
            <Button>
              <PlusIcon /> {t('navigation.add')}
            </Button>
          }
          secondaryActions={[
            {
              id: 'import',
              label: t('navigation.import'),
              icon: <UploadIcon />,
              onSelect: () => undefined,
            },
            {
              id: 'export',
              label: t('navigation.export'),
              icon: <DownloadIcon />,
              onSelect: () => undefined,
            },
            {
              id: 'archive',
              label: t('navigation.archive'),
              icon: <ArchiveIcon />,
              onSelect: () => undefined,
              destructive: true,
            },
          ]}
        />
      </Example>
      <div className="grid gap-stack lg:grid-cols-2">
        <Example title={t('navigation.tabs')} className="space-y-4">
          <Tabs defaultValue="overview">
            <TabsList>
              {SUB_TABS.slice(0, 3).map((k) => (
                <TabsTrigger key={k} value={k}>
                  {t(`navigation.${k}`)}
                </TabsTrigger>
              ))}
            </TabsList>
            {SUB_TABS.slice(0, 3).map((k) => (
              <TabsContent key={k} value={k} className="text-muted-foreground">
                {t(`navigation.${k}`)}
              </TabsContent>
            ))}
          </Tabs>
          <Tabs defaultValue="overview">
            <TabsList variant="underline" scrollable aria-label={t('navigation.tabsUnderline')}>
              {SUB_TABS.map((k) => (
                <TabsTrigger key={k} value={k}>
                  {t(`navigation.${k}`)}
                </TabsTrigger>
              ))}
            </TabsList>
            {SUB_TABS.map((k) => (
              <TabsContent key={k} value={k} className="pt-2 text-muted-foreground">
                {t(`navigation.${k}`)}
              </TabsContent>
            ))}
          </Tabs>
        </Example>
        <Example title={t('navigation.pagination')}>
          <Pagination page={page} pageSize={10} total={120} onPageChange={setPage} />
        </Example>
      </div>
    </DsSection>
  );
}
