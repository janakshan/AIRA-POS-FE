import type { ProductionPlan } from '@rbp/types';
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  FormSkeleton,
  Input,
  NumberInput,
  PageHeader,
  Skeleton,
  toast,
} from '@rbp/ui';
import { cn } from '@rbp/utils';
import { CakeSliceIcon, SaveIcon, ShoppingBagIcon } from 'lucide-react';
import { type ReactNode, useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { QueryError } from '@/components/query-error';
import { Screen } from '@/components/screen';
import { useUnsavedChangesGuard } from '@/components/unsaved-changes-guard';
import { useErrorMessage } from '@/components/use-error-message';
import { useAccess } from '@/features/auth/hooks/use-access';
import { LocationSelect } from '@/features/inventory/components/location-select';
import { useMyLocations } from '@/features/inventory/lib/use-locations';
import { useBreadcrumbTitle } from '@/navigation/breadcrumb-store';
import { PageBreadcrumbs } from '@/navigation/page-breadcrumbs';
import { useProductionFormulas, useProductionPlan, useSaveProductionPlan } from '../api/queries';
import { localDay } from '../lib/status';

/** BAK-002 new / edit (draft) plan: how many of each product → runs → raw materials needed. */
export function PlanFormPage() {
  const { id } = useParams();
  const { t } = useTranslation('production');
  const plan = useProductionPlan(id);
  if (id && (plan.isPending || plan.error)) {
    return (
      <Shell title={t('planForm.editTitle')}>
        {plan.error ? (
          <QueryError error={plan.error} onRetry={() => plan.refetch()} />
        ) : (
          <Card className="p-6">
            <FormSkeleton fields={4} />
          </Card>
        )}
      </Shell>
    );
  }
  if (plan.data && plan.data.status !== 'DRAFT') {
    return (
      <Shell title={plan.data.number}>
        <Alert tone="info" title={t('planForm.notDraft', { number: plan.data.number })}>
          <Link
            to={`/production/plan/${plan.data.id}`}
            className="inline-flex items-center font-medium underline pointer-coarse:min-h-11"
          >
            {t('planForm.openPlan')}
          </Link>
        </Alert>
      </Shell>
    );
  }
  return <PlanForm key={id ?? 'new'} plan={plan.data} />;
}

function Shell({ title, children }: { title: string; children: ReactNode }) {
  useBreadcrumbTitle(title);
  return (
    <Screen id="BAK-002" title={title} className="space-y-section">
      <PageHeader eyebrow={<PageBreadcrumbs />} title={title} />
      {children}
    </Screen>
  );
}

function PlanForm({ plan }: { plan: ProductionPlan | undefined }) {
  const { t } = useTranslation('production');
  const navigate = useNavigate();
  const errorMessage = useErrorMessage();
  const { can, hasFeature } = useAccess();
  const [params] = useSearchParams();
  const { locations, current } = useMyLocations();
  const save = useSaveProductionPlan();
  const ids = { location: useId(), date: useId(), note: useId() };
  const fallback =
    current?.type === 'BAKERY'
      ? current.id
      : (locations.find((l) => l.type === 'BAKERY')?.id ?? '');
  const [locationId, setLocationId] = useState(
    plan?.locationId ?? params.get('location') ?? fallback,
  );
  const [planDate, setPlanDate] = useState(plan?.planDate ?? params.get('date') ?? localDay(1));
  const [note, setNote] = useState(plan?.note ?? '');
  const [planned, setPlanned] = useState<Record<string, number | null>>(() =>
    Object.fromEntries((plan?.lines ?? []).map((l) => [l.productId, l.plannedQuantity])),
  );
  const [dirty, setDirty] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const guard = useUnsavedChangesGuard(dirty && !save.isPending);
  const formulas = useProductionFormulas(locationId);
  const title = plan ? t('planForm.editFor', { number: plan.number }) : t('planForm.newTitle');
  useBreadcrumbTitle(plan ? plan.number : t('planForm.newTitle'));

  const rows = useMemo(
    () =>
      (formulas.data ?? []).map((f) => {
        const qty = planned[f.productId] ?? 0;
        const runs = qty > 0 ? Math.ceil(qty / f.yieldQuantity) : 0;
        return { formula: f, qty, runs, expected: runs * f.yieldQuantity };
      }),
    [formulas.data, planned],
  );

  const requirement = useMemo(() => {
    const need = new Map<string, { name: string; unit: string; onHand: number; needed: number }>();
    for (const r of rows) {
      for (const l of r.formula.lines) {
        const x = need.get(l.ingredientId) ?? {
          name: l.name,
          unit: l.unit,
          onHand: l.onHand,
          needed: 0,
        };
        x.needed += l.quantity * r.runs;
        need.set(l.ingredientId, x);
      }
    }
    return [...need.entries()]
      .map(([ingredientId, x]) => ({
        ingredientId,
        ...x,
        short: Math.max(0, x.needed - Math.max(0, x.onHand)),
      }))
      .filter((x) => x.needed > 0)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);
  const short = requirement.filter((r) => r.short > 0);
  const lines = rows.filter((r) => r.qty > 0);
  const canOrder = hasFeature('PURCHASING') && can('purchasing.manage');
  const orderHref = `/purchasing/orders/new?${new URLSearchParams({
    location: locationId,
    lines: short.map((r) => `${r.ingredientId}:${r.short}`).join(','),
  })}`;

  const submit = () => {
    setSubmitted(true);
    if (!locationId || !planDate || !lines.length) return;
    save.mutate(
      {
        ...(plan ? { id: plan.id } : {}),
        body: {
          locationId,
          planDate,
          ...(note.trim() ? { note: note.trim() } : {}),
          lines: lines.map((r) => ({ productId: r.formula.productId, plannedQuantity: r.qty })),
        },
      },
      {
        onSuccess: (p) => {
          guard.bypass();
          toast.success(t('planForm.saved', { number: p.number }));
          navigate(`/production/plan/${p.id}`);
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    );
  };

  return (
    <Screen id="BAK-002" title={title} className="space-y-section">
      <PageHeader
        eyebrow={<PageBreadcrumbs />}
        title={title}
        description={t('planForm.hint')}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to={plan ? `/production/plan/${plan.id}` : '/production/plan'}>
                {t('planForm.cancel')}
              </Link>
            </Button>
            <Button onClick={submit} loading={save.isPending}>
              <SaveIcon /> {t('planForm.save')}
            </Button>
          </>
        }
      />

      <Card>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <label htmlFor={ids.location} className="text-sm font-medium">
              {t('fields.location')}
            </label>
            <LocationSelect
              id={ids.location}
              value={locationId}
              onChange={(v) => {
                setDirty(true);
                setLocationId(v);
              }}
              types={['BAKERY']}
              label={t('fields.location')}
              className="w-full"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor={ids.date} className="text-sm font-medium">
              {t('fields.planDate')}
            </label>
            <Input
              id={ids.date}
              type="date"
              value={planDate}
              aria-invalid={submitted && !planDate}
              onChange={(e) => {
                setDirty(true);
                setPlanDate(e.target.value);
              }}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor={ids.note} className="text-sm font-medium">
              {t('fields.note')}
            </label>
            <Input
              id={ids.note}
              maxLength={200}
              value={note}
              placeholder={t('planForm.notePlaceholder')}
              onChange={(e) => {
                setDirty(true);
                setNote(e.target.value);
              }}
            />
          </div>
        </CardContent>
      </Card>

      {formulas.isError ? (
        <QueryError error={formulas.error} onRetry={() => formulas.refetch()} />
      ) : !formulas.data ? (
        <Skeleton className="h-48" />
      ) : !formulas.data.length ? (
        <EmptyState icon={CakeSliceIcon} title={t('planForm.noFormulas')} />
      ) : (
        <div className="grid items-start gap-section lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>{t('planForm.products')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <ul className="divide-y rounded-xl border" aria-label={t('planForm.products')}>
                {rows.map((r) => (
                  <li
                    key={r.formula.productId}
                    className="grid items-center gap-2 px-3 py-2 sm:grid-cols-[minmax(0,1fr)_9rem]"
                  >
                    <div className="min-w-0">
                      <p className="font-medium">{r.formula.productName}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.runs
                          ? t('planForm.runs', { count: r.runs, expected: r.expected })
                          : t('planForm.yield', { count: r.formula.yieldQuantity })}
                      </p>
                    </div>
                    <NumberInput
                      value={planned[r.formula.productId] ?? null}
                      min={0}
                      max={10000}
                      placeholder="0"
                      onChange={(v) => {
                        setDirty(true);
                        setPlanned((p) => ({ ...p, [r.formula.productId]: v }));
                      }}
                      aria-label={t('planForm.plannedFor', { name: r.formula.productName })}
                      decrementLabel={t('planForm.lessOf', { name: r.formula.productName })}
                      incrementLabel={t('planForm.moreOf', { name: r.formula.productName })}
                    />
                  </li>
                ))}
              </ul>
              {submitted && !lines.length && (
                <p className="text-sm text-status-danger-fg" role="alert">
                  {t('common:validation.planEmpty')}
                </p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t('planForm.materials')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {!requirement.length ? (
                <p className="text-sm text-muted-foreground">{t('planForm.nothingYet')}</p>
              ) : (
                <table className="w-full text-sm">
                  <caption className="sr-only">{t('planForm.materials')}</caption>
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground uppercase">
                      <th scope="col" className="py-2 font-medium">
                        {t('fields.material')}
                      </th>
                      <th scope="col" className="py-2 text-right font-medium">
                        {t('planForm.need')}
                      </th>
                      <th scope="col" className="py-2 text-right font-medium">
                        {t('fields.onHand')}
                      </th>
                      <th scope="col" className="py-2 text-right font-medium">
                        {t('planForm.short')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {requirement.map((r) => (
                      <tr key={r.ingredientId} className="border-b last:border-0">
                        <th scope="row" className="py-2 text-left font-medium">
                          {r.name}
                          <span className="block text-xs font-normal text-muted-foreground">
                            {t(`inventory:unit.${r.unit}`, { count: 2 })}
                          </span>
                        </th>
                        <td className="py-2 text-right tabular">{r.needed}</td>
                        <td className="py-2 text-right tabular">{r.onHand}</td>
                        <td
                          className={cn(
                            'py-2 text-right font-semibold tabular',
                            r.short ? 'text-status-warning-fg' : 'text-muted-foreground',
                          )}
                        >
                          {r.short || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <p className="text-sm" aria-live="polite">
                {short.length
                  ? t('planForm.shortSummary', {
                      items: short.map((r) => `${r.name} ${r.short}`).join(', '),
                    })
                  : requirement.length
                    ? t('planForm.enough')
                    : ''}
              </p>
              {canOrder && short.length > 0 && (
                <Button asChild variant="outline">
                  <Link to={orderHref}>
                    <ShoppingBagIcon /> {t('planForm.createPo')}
                  </Link>
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      )}
      {guard.dialog}
    </Screen>
  );
}
