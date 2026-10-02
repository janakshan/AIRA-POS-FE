import { Button, Card, PageHeader, PageSkeleton } from '@rbp/ui';
import { cn, formatPhone } from '@rbp/utils';
import { MapPinIcon, PencilIcon, PhoneIcon, StickyNoteIcon, TruckIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, Outlet, useParams } from 'react-router';
import { QueryError } from '@/components/query-error';
import { useAccess } from '@/features/auth/hooks/use-access';
import { useBreadcrumbTitle } from '@/navigation/breadcrumb-store';
import { PageBreadcrumbs } from '@/navigation/page-breadcrumbs';
import { useCustomer } from '../api/queries';
import { CustomerTypeBadge } from '../components/customer-type-badge';
import type { CustomerOutletContext } from '../lib/customer-context';

/** CUS-003/004/005 share this header (contact details) and tabs. */
export function CustomerDetailLayout() {
  const { id } = useParams();
  const { t } = useTranslation('customers');
  const { can } = useAccess();
  const customer = useCustomer(id);
  useBreadcrumbTitle(customer.data?.name);

  if (customer.isError) {
    return <QueryError error={customer.error} onRetry={() => customer.refetch()} />;
  }
  if (!customer.data) return <PageSkeleton />;
  const c = customer.data;
  const tabs = [
    { to: '', label: t('detail.tabs.overview'), end: true },
    { to: 'orders', label: t('detail.tabs.orders') },
    { to: 'balance', label: t('detail.tabs.balance') },
  ];

  return (
    <div className="space-y-section">
      <PageHeader
        eyebrow={<PageBreadcrumbs />}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {c.name} <CustomerTypeBadge type={c.type} />
          </span>
        }
        actions={
          can('customer.manage') && (
            <Button asChild variant="outline">
              <Link to="edit">
                <PencilIcon /> {t('detail.edit')}
              </Link>
            </Button>
          )
        }
      />
      <Card className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Contact icon={PhoneIcon} label={t('fields.phones')}>
          <ul className="space-y-0.5">
            {c.phones.map((p) => (
              <li key={p.number}>
                <a
                  href={`tel:${p.number}`}
                  className="inline-flex items-center font-medium tabular hover:underline pointer-coarse:min-h-11"
                >
                  {formatPhone(p.number)}
                </a>
                <span className="ml-1.5 text-xs text-muted-foreground">
                  {[p.label, p.primary ? t('form.primary') : null].filter(Boolean).join(' · ')}
                </span>
              </li>
            ))}
          </ul>
        </Contact>
        <Contact icon={MapPinIcon} label={t('fields.address')}>
          {c.address ?? <span className="text-muted-foreground">{t('detail.none')}</span>}
        </Contact>
        <Contact icon={TruckIcon} label={t('fields.deliveryAddress')}>
          {c.deliveryAddress ??
            (c.address ? (
              <span className="text-muted-foreground">{t('detail.sameAsAddress')}</span>
            ) : (
              <span className="text-muted-foreground">{t('detail.none')}</span>
            ))}
        </Contact>
        <Contact icon={StickyNoteIcon} label={t('fields.notes')}>
          {c.notes ?? <span className="text-muted-foreground">{t('detail.none')}</span>}
        </Contact>
      </Card>
      <nav aria-label={t('detail.sections')} className="flex gap-1 border-b">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) =>
              cn(
                '-mb-px flex min-h-touch items-center border-b-2 px-4 text-sm font-medium focus-ring',
                isActive
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>
      <Outlet context={{ customer: c } satisfies CustomerOutletContext} />
    </div>
  );
}

function Contact({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof PhoneIcon;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 gap-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 text-sm">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <div className="break-words">{children}</div>
      </div>
    </div>
  );
}
