import { Button, Card, CardContent, CardHeader, CardTitle, Skeleton } from '@rbp/ui';
import { formatDateTime } from '@rbp/utils';
import { ShieldCheckIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { localeFor } from '@/app/i18n';
import { useAccess } from '@/features/auth/hooks/use-access';
import { useAuditEvents } from '../api/queries';
import { auditActionLabel } from '../lib/action-labels';

/** Last few audit events for one record, with a link to the full REP-006 log. */
export function EntityHistory({ entity, entityId }: { entity: string; entityId: string }) {
  const { t, i18n } = useTranslation('audit');
  const locale = localeFor(i18n.language);
  const { can } = useAccess();
  const allowed = can('report.audit.view');
  const events = useAuditEvents({ entity, entityId, pageSize: 5 }, allowed);
  if (!allowed) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('history.title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {events.isPending ? (
          <Skeleton className="h-16" />
        ) : !events.data?.items.length ? (
          <p className="text-sm text-muted-foreground">{t('history.empty')}</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {events.data.items.map((e) => (
              <li key={e.id}>
                <p className="flex items-center gap-1.5 font-medium">
                  {e.employee && (
                    <ShieldCheckIcon className="size-4 text-status-success" aria-hidden />
                  )}
                  {auditActionLabel(t, e.action)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDateTime(e.at, { locale })} · {e.userName}
                  {e.reason && ` · ${e.reason.label}`}
                </p>
              </li>
            ))}
          </ul>
        )}
        <Button asChild variant="outline" size="sm">
          <Link to={`/reports/audit?q=${encodeURIComponent(entityId)}`}>
            {t('history.viewAll')}
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
