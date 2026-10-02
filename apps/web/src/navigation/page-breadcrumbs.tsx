import { Breadcrumbs } from '@rbp/ui';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useBreadcrumbItems } from './use-breadcrumbs';

export function PageBreadcrumbs() {
  const { t } = useTranslation();
  const items = useBreadcrumbItems();
  return (
    <Breadcrumbs
      items={items}
      label={t('shell.breadcrumb')}
      renderLink={(href, children) => (
        <Link
          to={href}
          className="inline-flex items-center justify-center rounded-sm focus-ring pointer-coarse:min-h-11 pointer-coarse:min-w-11"
        >
          {children}
        </Link>
      )}
    />
  );
}
