import {
  Alert,
  Button,
  Card,
  ConfirmDialog,
  PageHeader,
  PageSkeleton,
  Textarea,
  toast,
} from '@rbp/ui';
import { cn, formatDateTime } from '@rbp/utils';
import { ArrowRightIcon, PackageCheckIcon, PlayIcon, XCircleIcon } from 'lucide-react';
import { type ReactNode, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { localeFor } from '@/app/i18n';
import { QueryError } from '@/components/query-error';
import { Screen } from '@/components/screen';
import { useErrorMessage } from '@/components/use-error-message';
import { EntityHistory } from '@/features/audit/components/entity-history';
import { MovementTable } from '@/features/inventory/components/movement-table';
import { useMyLocations } from '@/features/inventory/lib/use-locations';
import { formatPlainDate } from '@/features/purchasing/lib/status';
import { useBreadcrumbTitle } from '@/navigation/breadcrumb-store';
import { PageBreadcrumbs } from '@/navigation/page-breadcrumbs';
import { useCancelBatch, useProductionBatch } from '../api/queries';
import { RecordOutputDialog } from '../components/record-output-dialog';
import { StartBatchDialog } from '../components/start-batch-dialog';
import { BatchStatusBadge } from '../components/status-badges';

const STEPS = ['PLANNED', 'IN_PROGRESS', 'COMPLETED'] as const;

/**
 * BAK-003 batch: planned → started (raw materials used) → output recorded (goods in,
 * rejects out as wastage), with every ledger movement it posted.
 */
export function BatchDetailPage() {
  const { id } = useParams();
  const { t, i18n } = useTranslation('production');
  const locale = localeFor(i18n.language);
  const errorMessage = useErrorMessage();
  const { nameOf } = useMyLocations();
  const batch = useProductionBatch(id);
  const cancel = useCancelBatch();
  const reasonId = useId();
  const [starting, setStarting] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');
  // The confirm button can't be disabled, so a short reason turns the hint into an error.
  const [reasonTried, setReasonTried] = useState(false);
  useBreadcrumbTitle(batch.data?.number);

  if (batch.isError) return <QueryError error={batch.error} onRetry={() => batch.refetch()} />;
  if (!batch.data) return <PageSkeleton />;
  const b = batch.data;
  const step = STEPS.indexOf(b.status as (typeof STEPS)[number]);
  const unit = (n: number) => t(`inventory:unit.${b.unit}`, { count: n });

  const doCancel = () =>
    cancel.mutate(
      { id: b.id, body: { reason: reason.trim() } },
      {
        onSuccess: (x) => {
          setCancelling(false);
          toast.success(t('batch.cancelledToast', { number: x.number }));
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    );

  return (
    <Screen id="BAK-003" title={b.number} className="space-y-section">
      <PageHeader
        eyebrow={<PageBreadcrumbs />}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {b.number}
            <span className="text-sm font-normal">
              <BatchStatusBadge status={b.status} size="md" />
            </span>
          </span>
        }
        description={t('batch.subtitle', {
          name: b.productName,
          count: b.runs,
          expected: b.expectedQuantity,
          location: nameOf(b.locationId),
        })}
        actions={
          b.status === 'PLANNED' ? (
            <Button onClick={() => setStarting(true)}>
              <PlayIcon /> {t('batches.start')}
            </Button>
          ) : b.status === 'IN_PROGRESS' ? (
            <Button onClick={() => setCompleting(true)}>
              <PackageCheckIcon /> {t('batches.recordOutput')}
            </Button>
          ) : null
        }
        secondaryActions={
          b.status === 'PLANNED'
            ? [
                {
                  id: 'cancel',
                  label: t('batch.cancel'),
                  icon: <XCircleIcon />,
                  destructive: true,
                  onSelect: () => {
                    setReason('');
                    setReasonTried(false);
                    setCancelling(true);
                  },
                },
              ]
            : []
        }
        moreLabel={t('more')}
      />

      {b.status === 'CANCELLED' ? (
        <Alert tone="danger" title={t('batch.cancelledTitle')}>
          {t('batch.cancelledBy', {
            name: b.cancelledBy ?? '',
            at: b.cancelledAt ? formatDateTime(b.cancelledAt, { locale }) : '',
          })}
          {b.cancelReason && ` — ${b.cancelReason}`}
        </Alert>
      ) : (
        <Card className="p-4">
          <ol className="grid gap-3 sm:grid-cols-3" aria-label={t('batch.progress')}>
            {STEPS.map((s, i) => (
              <li
                key={s}
                aria-current={i === step ? 'step' : undefined}
                className={cn(
                  'rounded-lg border px-3 py-2 text-sm',
                  i <= step ? 'border-primary/40 bg-primary/5' : 'text-muted-foreground',
                )}
              >
                <p className="font-medium">{t(`batch.step.${s}`)}</p>
                <p className="text-xs text-muted-foreground">
                  {s === 'IN_PROGRESS' && b.startedAt
                    ? `${formatDateTime(b.startedAt, { locale })} · ${b.startedBy ?? ''}`
                    : s === 'COMPLETED' && b.completedAt
                      ? `${formatDateTime(b.completedAt, { locale })} · ${b.completedBy ?? ''}`
                      : t(`batch.stepHint.${s}`)}
                </p>
              </li>
            ))}
          </ol>
        </Card>
      )}

      <Card className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Fact label={t('fields.plan')}>
          <Link
            to={`/production/plan/${b.planId}`}
            className="inline-flex items-center font-medium underline-offset-2 hover:underline pointer-coarse:min-h-11"
          >
            {b.planNumber} · {formatPlainDate(b.planDate, locale)}
          </Link>
        </Fact>
        <Fact label={t('fields.expected')}>
          <span className="tabular">
            {b.expectedQuantity} {unit(b.expectedQuantity)}
          </span>
        </Fact>
        <Fact label={t('batch.good')}>
          {b.goodQuantity === null ? (
            '—'
          ) : (
            <span className="font-semibold tabular">
              {b.goodQuantity} {unit(b.goodQuantity)}
            </span>
          )}
        </Fact>
        <Fact label={t('batch.rejected')}>
          {b.rejectedQuantity === null ? (
            '—'
          ) : (
            <span className="tabular">
              {b.rejectedQuantity}
              {b.rejectReason && (
                <span className="block text-xs text-muted-foreground">
                  {[b.rejectReason.label, b.rejectReason.comment].filter(Boolean).join(' · ')}
                </span>
              )}
            </span>
          )}
        </Fact>
      </Card>

      <Card className="p-0">
        <table className="w-full text-sm">
          <caption className="px-4 pt-4 text-left font-semibold">{t('batch.materials')}</caption>
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground uppercase">
              <th scope="col" className="px-4 py-2 font-medium">
                {t('fields.material')}
              </th>
              <th scope="col" className="px-4 py-2 text-right font-medium">
                {t('fields.formula')}
              </th>
              <th scope="col" className="px-4 py-2 text-right font-medium">
                {t('fields.used')}
              </th>
              <th scope="col" className="px-4 py-2 text-right font-medium">
                {t('fields.onHand')}
              </th>
            </tr>
          </thead>
          <tbody>
            {b.consumption.map((c) => (
              <tr key={c.ingredientId} className="border-b last:border-0">
                <th scope="row" className="px-4 py-2 text-left font-medium">
                  {c.name}
                  <span className="block text-xs font-normal text-muted-foreground">
                    {t(`inventory:unit.${c.unit}`, { count: 2 })}
                  </span>
                </th>
                <td className="px-4 py-2 text-right tabular">{c.plannedQuantity}</td>
                <td
                  className={cn(
                    'px-4 py-2 text-right tabular',
                    c.actualQuantity !== null &&
                      c.actualQuantity !== c.plannedQuantity &&
                      'font-semibold text-status-warning-fg',
                  )}
                >
                  {c.actualQuantity ?? '—'}
                </td>
                <td className="px-4 py-2 text-right tabular">{c.onHand}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <section className="space-y-3" aria-labelledby="batch-ledger">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 id="batch-ledger" className="text-lg font-semibold">
            {t('batch.movements')}
          </h2>
          <Button asChild variant="ghost" size="sm">
            <Link
              to={`/production/finished-goods?${new URLSearchParams({ location: b.locationId })}`}
            >
              {t('batch.toFinishedGoods')} <ArrowRightIcon />
            </Link>
          </Button>
        </div>
        <Card className="p-0">
          <MovementTable caption={t('batch.movements')} rows={b.movements} />
        </Card>
      </section>

      <EntityHistory entity="production-batch" entityId={b.id} />

      <StartBatchDialog batch={starting ? b : null} onOpenChange={setStarting} />
      <RecordOutputDialog batch={completing ? b : null} onOpenChange={setCompleting} />
      <ConfirmDialog
        open={cancelling}
        onOpenChange={setCancelling}
        title={t('batch.cancelTitle', { number: b.number })}
        description={t('batch.cancelHint')}
        confirmLabel={t('batch.cancel')}
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
