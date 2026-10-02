import type { ProductionBatch } from '@rbp/types';
import {
  Alert,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  PageHeader,
  PageSkeleton,
  Textarea,
  toast,
} from '@rbp/ui';
import { formatDateTime } from '@rbp/utils';
import { CheckCircle2Icon, ClipboardListIcon, PencilIcon, XCircleIcon } from 'lucide-react';
import { type ReactNode, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { localeFor } from '@/app/i18n';
import { QueryError } from '@/components/query-error';
import { Screen } from '@/components/screen';
import { useErrorMessage } from '@/components/use-error-message';
import { EntityHistory } from '@/features/audit/components/entity-history';
import { useMyLocations } from '@/features/inventory/lib/use-locations';
import { formatPlainDate } from '@/features/purchasing/lib/status';
import { useBreadcrumbTitle } from '@/navigation/breadcrumb-store';
import { PageBreadcrumbs } from '@/navigation/page-breadcrumbs';
import {
  useCancelProductionPlan,
  useConfirmProductionPlan,
  useProductionBatches,
  useProductionPlan,
} from '../api/queries';
import { BatchTable } from '../components/batch-table';
import { RecordOutputDialog } from '../components/record-output-dialog';
import { StartBatchDialog } from '../components/start-batch-dialog';
import { PlanStatusBadge } from '../components/status-badges';

/** BAK-002 plan: its lines, confirm (→ batches) or cancel, and the batches' progress. */
export function PlanDetailPage() {
  const { id } = useParams();
  const { t, i18n } = useTranslation('production');
  const locale = localeFor(i18n.language);
  const navigate = useNavigate();
  const errorMessage = useErrorMessage();
  const { nameOf } = useMyLocations();
  const plan = useProductionPlan(id);
  const batches = useProductionBatches(
    { locationId: plan.data?.locationId ?? '', planId: id ?? '' },
    !!plan.data && plan.data.status !== 'DRAFT',
  );
  const confirm = useConfirmProductionPlan();
  const cancel = useCancelProductionPlan();
  const reasonId = useId();
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');
  // The confirm button can't be disabled, so a short reason turns the hint into an error.
  const [reasonTried, setReasonTried] = useState(false);
  const [starting, setStarting] = useState<ProductionBatch | null>(null);
  const [completing, setCompleting] = useState<ProductionBatch | null>(null);
  useBreadcrumbTitle(plan.data?.number);

  if (plan.isError) return <QueryError error={plan.error} onRetry={() => plan.refetch()} />;
  if (!plan.data) return <PageSkeleton />;
  const p = plan.data;
  const canCancel = p.status === 'DRAFT' || p.status === 'CONFIRMED';

  const doConfirm = () =>
    confirm.mutate(p.id, {
      onSuccess: (x) =>
        toast.success(t('plan.confirmedToast', { number: x.number, count: x.lines.length })),
      onError: (e) => toast.error(errorMessage(e)),
    });
  const doCancel = () =>
    cancel.mutate(
      { id: p.id, body: { reason: reason.trim() } },
      {
        onSuccess: (x) => {
          setCancelling(false);
          toast.success(t('plan.cancelledToast', { number: x.number }));
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    );

  return (
    <Screen id="BAK-002" title={p.number} className="space-y-section">
      <PageHeader
        eyebrow={<PageBreadcrumbs />}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {p.number}
            <span className="text-sm font-normal">
              <PlanStatusBadge status={p.status} size="md" />
            </span>
          </span>
        }
        description={t('plan.subtitle', {
          date: formatPlainDate(p.planDate, locale),
          location: nameOf(p.locationId),
        })}
        actions={
          p.status === 'DRAFT' ? (
            <Button onClick={doConfirm} loading={confirm.isPending}>
              <CheckCircle2Icon /> {t('plan.confirm')}
            </Button>
          ) : null
        }
        secondaryActions={[
          ...(p.status === 'DRAFT'
            ? [
                {
                  id: 'edit',
                  label: t('plan.edit'),
                  icon: <PencilIcon />,
                  onSelect: () => navigate('edit'),
                },
              ]
            : []),
          ...(canCancel
            ? [
                {
                  id: 'cancel',
                  label: t('plan.cancel'),
                  icon: <XCircleIcon />,
                  destructive: true,
                  onSelect: () => {
                    setReason('');
                    setReasonTried(false);
                    setCancelling(true);
                  },
                },
              ]
            : []),
        ]}
        moreLabel={t('more')}
      />

      {p.status === 'DRAFT' && (
        <Alert tone="info" title={t('plan.draftTitle')}>
          {t('plan.draftHint')}
        </Alert>
      )}
      {p.status === 'CANCELLED' && (
        <Alert tone="danger" title={t('plan.cancelledTitle')}>
          {t('plan.cancelledBy', {
            name: p.cancelledBy ?? '',
            at: p.cancelledAt ? formatDateTime(p.cancelledAt, { locale }) : '',
          })}
          {p.cancelReason && ` — ${p.cancelReason}`}
        </Alert>
      )}

      <Card className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Fact label={t('fields.planDate')}>{formatPlainDate(p.planDate, locale)}</Fact>
        <Fact label={t('fields.location')}>{nameOf(p.locationId)}</Fact>
        <Fact label={t('fields.produced')}>
          <span className="font-semibold tabular">
            {p.progress.produced} / {p.lines.reduce((s, l) => s + l.plannedQuantity, 0)}
          </span>
          {p.progress.rejected > 0 && (
            <span className="block text-xs text-status-danger-fg">
              {t('batches.rejected', { count: p.progress.rejected })}
            </span>
          )}
        </Fact>
        <Fact label={t('plan.created')}>
          {formatDateTime(p.createdAt, { locale })}
          <span className="block text-xs text-muted-foreground">{p.createdBy}</span>
        </Fact>
        {p.note && (
          <div className="sm:col-span-2">
            <Fact label={t('fields.note')}>{p.note}</Fact>
          </div>
        )}
      </Card>

      <Card className="p-0">
        <table className="w-full text-sm">
          <caption className="px-4 pt-4 text-left font-semibold">{t('plan.lines')}</caption>
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground uppercase">
              <th scope="col" className="px-4 py-2 font-medium">
                {t('fields.product')}
              </th>
              <th scope="col" className="px-4 py-2 text-right font-medium">
                {t('fields.planned')}
              </th>
              <th scope="col" className="px-4 py-2 text-right font-medium">
                {t('fields.runs')}
              </th>
              <th scope="col" className="px-4 py-2 text-right font-medium">
                {t('fields.expected')}
              </th>
            </tr>
          </thead>
          <tbody>
            {p.lines.map((l) => (
              <tr key={l.productId} className="border-b last:border-0">
                <th scope="row" className="px-4 py-2 text-left font-medium">
                  {l.productName}
                  <span className="block font-mono text-xs font-normal text-muted-foreground">
                    {l.productCode}
                  </span>
                </th>
                <td className="px-4 py-2 text-right tabular">{l.plannedQuantity}</td>
                <td className="px-4 py-2 text-right tabular">{l.runs}</td>
                <td className="px-4 py-2 text-right tabular">{l.expectedQuantity}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {p.status !== 'DRAFT' && (
        <section className="space-y-3" aria-labelledby="plan-batches">
          <h2 id="plan-batches" className="text-lg font-semibold">
            {t('plan.batches')}
          </h2>
          <Card className="p-0">
            <BatchTable
              caption={t('plan.batches')}
              rows={batches.data}
              loading={batches.isPending}
              hide={['date']}
              error={
                batches.isError ? (
                  <QueryError error={batches.error} onRetry={() => batches.refetch()} />
                ) : undefined
              }
              empty={<EmptyState icon={ClipboardListIcon} title={t('plan.noBatches')} />}
              onStart={setStarting}
              onComplete={setCompleting}
            />
          </Card>
        </section>
      )}

      <EntityHistory entity="production-plan" entityId={p.id} />

      <StartBatchDialog batch={starting} onOpenChange={(o) => !o && setStarting(null)} />
      <RecordOutputDialog batch={completing} onOpenChange={(o) => !o && setCompleting(null)} />
      <ConfirmDialog
        open={cancelling}
        onOpenChange={setCancelling}
        title={t('plan.cancelTitle', { number: p.number })}
        description={t('plan.cancelHint')}
        confirmLabel={t('plan.cancel')}
        cancelLabel={t('plan.keep')}
        destructive
        loading={cancel.isPending}
        onConfirm={() => (reason.trim().length >= 3 ? doCancel() : setReasonTried(true))}
      >
        <div className="space-y-1.5">
          <label htmlFor={reasonId} className="text-sm font-medium">
            {t('plan.cancelReason')}
          </label>
          <Textarea
            id={reasonId}
            rows={2}
            maxLength={200}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            aria-invalid={reasonTried && reason.trim().length < 3}
            aria-describedby={reason.trim().length < 3 ? `${reasonId}-hint` : undefined}
          />
          {reason.trim().length < 3 && (
            <p
              id={`${reasonId}-hint`}
              role={reasonTried ? 'alert' : undefined}
              className={reasonTried ? 'text-sm text-destructive' : 'text-xs text-muted-foreground'}
            >
              {t('common:validation.productionCancelReasonRequired')}
            </p>
          )}
        </div>
      </ConfirmDialog>
    </Screen>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 text-sm">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="break-words">{children}</div>
    </div>
  );
}
