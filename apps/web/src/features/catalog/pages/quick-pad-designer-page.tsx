import type {
  CategoryTreeNode,
  LocationProduct,
  QuickPadLayout,
  UpdateQuickPadLayoutRequest,
} from '@rbp/types';
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ColorSwatchPicker,
  MoneyText,
  PageHeader,
  ResponsiveDialog,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  toast,
} from '@rbp/ui';
import { cn, formatDateTime } from '@rbp/utils';
import { ChevronRightIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { localeFor } from '@/app/i18n';
import { QueryError } from '@/components/query-error';
import { Screen } from '@/components/screen';
import { useUnsavedChangesGuard } from '@/components/unsaved-changes-guard';
import { useErrorMessage } from '@/components/use-error-message';
import { useMe } from '@/features/auth/api/queries';
import { useListParams } from '@/lib/use-list-params';
import { PageBreadcrumbs } from '@/navigation/page-breadcrumbs';
import {
  useCategoryTree,
  useDevices,
  useLocationProducts,
  useQuickPadLayout,
  useResetDeviceLayout,
  useUpdateQuickPadLayout,
} from '../api/queries';
import { QuickPadView } from '../components/quick-pad-view';
import { SortableList } from '../components/sortable-list';
import { useLocalizedName } from '../lib/localized-name';
import { buildPadModel, type PadCategory, reorderWithin } from '../lib/quick-pad-model';

/** CAT-007 Quick Pad Designer: per-location button order and colours (REQ-110…149, REQ-177). */
export function QuickPadDesignerPage() {
  const { t } = useTranslation('catalog');
  const { data: me } = useMe();
  const list = useListParams({ filterKeys: ['location', 'device'] });
  const locationId = list.filters.location ?? me?.currentLocation?.id ?? '';
  const tree = useCategoryTree({ active: true });
  const products = useLocationProducts({ locationId });
  const devices = useDevices(locationId);
  const deviceId = list.filters.device ?? null;
  const device = devices.data?.find((d) => d.id === deviceId);
  const layout = useQuickPadLayout(locationId, deviceId);
  const error = tree.error ?? products.error ?? layout.error;

  return (
    <Screen id="CAT-007" title={t('nav:items.quickPad')} className="space-y-section">
      <PageHeader
        eyebrow={<PageBreadcrumbs />}
        title={t('nav:items.quickPad')}
        description={t('quickPad.hint')}
        actions={
          <div className="flex flex-wrap gap-2">
            {me && me.locations.length > 1 && (
              <Select
                value={locationId}
                onValueChange={(v) => {
                  list.setFilter('device', null);
                  list.setFilter('location', v);
                }}
              >
                <SelectTrigger className="w-56" aria-label={t('common.location')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {me.locations.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Select
              value={deviceId ?? 'all'}
              onValueChange={(v) => list.setFilter('device', v === 'all' ? null : v)}
            >
              <SelectTrigger className="w-64" aria-label={t('quickPad.appliesTo')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('quickPad.allDevices')}</SelectItem>
                {devices.data
                  ?.filter((d) => d.type === 'POS_TERMINAL' || d.type === 'TABLET')
                  .map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        }
      />
      {error ? (
        <QueryError
          error={error}
          onRetry={() => {
            void tree.refetch();
            void products.refetch();
            void layout.refetch();
          }}
        />
      ) : !tree.data || !products.data || !layout.data ? (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-section lg:grid-cols-[26rem_minmax(0,1fr)]">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      ) : (
        <Designer
          // Fresh draft per location and after every save.
          key={`${locationId}:${deviceId ?? '-'}:${layout.data.source}:${layout.data.updatedAt ?? 'default'}`}
          tree={tree.data}
          products={products.data}
          layout={layout.data}
          locationName={me?.locations.find((l) => l.id === locationId)?.name ?? ''}
          deviceName={device?.name ?? null}
        />
      )}
    </Screen>
  );
}

const draftOf = (layout: QuickPadLayout): UpdateQuickPadLayoutRequest => ({
  categoryOrder: layout.categoryOrder,
  categoryColors: layout.categoryColors,
  productOrder: layout.productOrder,
});

function Designer({
  tree,
  products,
  layout,
  locationName,
  deviceName,
}: {
  tree: CategoryTreeNode[];
  products: LocationProduct[];
  layout: QuickPadLayout;
  locationName: string;
  /** Editing one device's layout instead of the location's. */
  deviceName: string | null;
}) {
  const { t, i18n } = useTranslation('catalog');
  const locale = localeFor(i18n.language);
  const errorMessage = useErrorMessage();
  const save = useUpdateQuickPadLayout(layout.locationId, layout.deviceId);
  const resetDevice = useResetDeviceLayout(layout.locationId);
  const [draft, setDraft] = useState(() => draftOf(layout));
  const [level, setLevel] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [coloring, setColoring] = useState<PadCategory | null>(null);

  const localize = useLocalizedName();
  const model = useMemo(
    () => buildPadModel(tree, products, draft, localize),
    [tree, products, draft, localize],
  );
  const dirty = JSON.stringify(draft) !== JSON.stringify(draftOf(layout));
  const siblings = model.childrenOf(level);
  const levelNode = level ? model.byId.get(level) : undefined;
  const current =
    (selected ? model.byId.get(selected) : undefined) ??
    (levelNode?.products.length ? levelNode : undefined) ??
    siblings[0];

  // Level breadcrumb: Top level › Rice & Curry › …
  const trail: PadCategory[] = [];
  for (
    let node = levelNode;
    node;
    node = node.parentId ? model.byId.get(node.parentId) : undefined
  ) {
    trail.unshift(node);
  }

  const onSave = () =>
    save.mutate(draft, {
      onSuccess: () =>
        toast.success(
          t('quickPad.saved', {
            location: deviceName ? `${locationName} · ${deviceName}` : locationName,
          }),
        ),
      onError: (e) => toast.error(errorMessage(e)),
    });

  const guard = useUnsavedChangesGuard(dirty && !save.isPending);

  return (
    <>
      {guard.dialog}
      {layout.deviceId && deviceName && (
        <Alert
          tone={layout.source === 'device' ? 'info' : 'neutral'}
          action={
            layout.source === 'device' ? (
              <Button
                variant="outline"
                size="sm"
                loading={resetDevice.isPending}
                onClick={() =>
                  layout.deviceId &&
                  resetDevice.mutate(layout.deviceId, {
                    onSuccess: () => toast.success(t('quickPad.resetDone', { device: deviceName })),
                    onError: (e) => toast.error(errorMessage(e)),
                  })
                }
              >
                {t('quickPad.resetDevice')}
              </Button>
            ) : undefined
          }
        >
          {t(layout.source === 'device' ? 'quickPad.deviceCustom' : 'quickPad.deviceInherits', {
            device: deviceName,
          })}
        </Alert>
      )}
      <p className="text-sm text-muted-foreground">
        {layout.updatedAt
          ? t('quickPad.lastSaved', { when: formatDateTime(layout.updatedAt, { locale }) })
          : t('quickPad.neverSaved')}
      </p>
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-section lg:grid-cols-[26rem_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>{t('quickPad.categories')}</CardTitle>
            <nav
              aria-label={t('quickPad.categories')}
              className="flex flex-wrap items-center gap-1 text-sm"
            >
              <Button
                variant="link"
                className="h-auto p-0"
                disabled={!level}
                onClick={() => {
                  setLevel(null);
                  setSelected(null);
                }}
              >
                {t('quickPad.levelRoot')}
              </Button>
              {trail.map((node) => (
                <span key={node.id} className="flex items-center gap-1">
                  <ChevronRightIcon className="size-4 text-muted-foreground" aria-hidden />
                  <Button
                    variant="link"
                    className="h-auto p-0"
                    disabled={node.id === level}
                    onClick={() => {
                      setLevel(node.id);
                      setSelected(null);
                    }}
                  >
                    {node.name}
                  </Button>
                </span>
              ))}
            </nav>
          </CardHeader>
          <CardContent>
            <SortableList
              label={t('quickPad.categories')}
              items={siblings}
              getId={(c) => c.id}
              getLabel={(c) => c.name}
              onReorder={(ids) =>
                setDraft((d) => ({ ...d, categoryOrder: reorderWithin(d.categoryOrder, ids) }))
              }
              itemClassName={(c) => (c.id === current?.id ? 'ring-2 ring-primary' : undefined)}
              renderItem={(c) => (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setColoring(c)}
                    aria-label={t('quickPad.colorFor', { name: c.name })}
                    className="flex size-10 touch-safe shrink-0 items-center justify-center rounded-lg focus-ring hover:bg-accent"
                  >
                    <span className="size-5 rounded-full border" style={{ background: c.color }} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelected(c.id)}
                    aria-pressed={c.id === current?.id}
                    className="flex min-h-11 min-w-0 flex-1 items-center justify-between gap-2 rounded-lg px-2 text-left text-sm font-medium focus-ring hover:bg-accent"
                  >
                    <span className="line-clamp-2 min-w-0 break-words">{c.name}</span>
                    <span className="rounded-full bg-muted px-2 text-xs text-muted-foreground tabular">
                      {c.total}
                    </span>
                  </button>
                  {model.childrenOf(c.id).length > 0 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={t('quickPad.drill', { name: c.name })}
                      onClick={() => {
                        setLevel(c.id);
                        setSelected(null);
                      }}
                    >
                      <ChevronRightIcon />
                    </Button>
                  )}
                </div>
              )}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('quickPad.products', { category: current?.name ?? '' })}</CardTitle>
          </CardHeader>
          <CardContent>
            {!current || current.products.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('quickPad.noProducts')}</p>
            ) : (
              <SortableList
                layout="grid"
                label={t('quickPad.products', { category: current.name })}
                items={current.products}
                getId={(p) => p.productId}
                getLabel={(p) => p.name}
                onReorder={(ids) =>
                  setDraft((d) => ({
                    ...d,
                    productOrder: { ...d.productOrder, [current.id]: ids },
                  }))
                }
                renderItem={(p) => (
                  <div
                    className={cn('min-w-0 border-t-4 pt-1', !p.isAvailable && 'opacity-60')}
                    style={{ borderColor: current.color }}
                  >
                    <p className="line-clamp-2 text-sm font-semibold">{p.name}</p>
                    <MoneyText value={p.price} locale={locale} className="text-sm" />
                  </div>
                )}
              />
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('quickPad.preview')}</CardTitle>
          <CardDescription>{locationName}</CardDescription>
        </CardHeader>
        <CardContent>
          <QuickPadView model={model} panelId="quick-pad-preview" />
        </CardContent>
      </Card>

      {dirty && (
        <div
          role="region"
          aria-label={t('common.save')}
          className="sticky bottom-0 z-30 -mx-page flex flex-wrap items-center justify-end gap-2 border-t bg-background/95 px-page py-3 shadow-lg backdrop-blur"
        >
          <Button
            variant="outline"
            onClick={() => setDraft(draftOf(layout))}
            disabled={save.isPending}
          >
            {t('common.discard')}
          </Button>
          <Button onClick={onSave} loading={save.isPending}>
            {t('common.save')}
          </Button>
        </div>
      )}

      <ResponsiveDialog
        open={!!coloring}
        onOpenChange={(open) => !open && setColoring(null)}
        title={t('quickPad.colorFor', { name: coloring?.name ?? '' })}
        closeLabel={t('common.cancel')}
        footer={
          <Button
            variant="outline"
            onClick={() => {
              if (!coloring) return;
              setDraft((d) => {
                const { [coloring.id]: _removed, ...rest } = d.categoryColors;
                return { ...d, categoryColors: rest };
              });
              setColoring(null);
            }}
          >
            {t('quickPad.resetColor')}
          </Button>
        }
      >
        {coloring && (
          <ColorSwatchPicker
            label={t('common.color')}
            customLabel={t('common.customColor')}
            value={model.byId.get(coloring.id)?.color ?? coloring.color}
            onChange={(color) =>
              setDraft((d) => ({
                ...d,
                categoryColors: { ...d.categoryColors, [coloring.id]: color },
              }))
            }
          />
        )}
      </ResponsiveDialog>
    </>
  );
}
