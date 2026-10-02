import { EmptyState, Skeleton } from '@rbp/ui';
import { StoreIcon } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { QueryError } from '@/components/query-error';
import {
  useCategoryTree,
  useLocationProducts,
  useQuickPadLayout,
} from '@/features/catalog/api/queries';
import { QUICK_PAD_GRID, QuickPadView } from '@/features/catalog/components/quick-pad-view';
import { useLocalizedName } from '@/features/catalog/lib/localized-name';
import { buildPadModel } from '@/features/catalog/lib/quick-pad-model';
import { useMe } from '@/features/auth/api/queries';

const PANEL_ID = 'pos-quick-pad-products';

export interface QuickPadProps {
  cart: Record<string, number>;
  onAdd: (productId: string) => void;
}

/** POS-001 Quick Pad: the current location's categories, layout (CAT-007) and products. */
export function QuickPad({ cart, onAdd }: QuickPadProps) {
  const { t } = useTranslation();
  const tree = useCategoryTree({ active: true });
  const products = useLocationProducts();
  const { data: me } = useMe();
  // This terminal's own layout if one was saved, otherwise the location's (CAT-007).
  const layout = useQuickPadLayout(undefined, me?.device?.id ?? null);
  const localize = useLocalizedName();

  const model = useMemo(
    () =>
      tree.data && products.data
        ? buildPadModel(tree.data, products.data, layout.data, localize)
        : undefined,
    [tree.data, products.data, layout.data, localize],
  );

  if (tree.isPending || products.isPending || layout.isPending) {
    return (
      <div className="grid gap-3 md:grid-cols-[13rem_minmax(0,1fr)]" aria-busy="true">
        <div className="flex gap-2 md:flex-col">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-touch-pos w-32 shrink-0 rounded-xl md:w-full" />
          ))}
        </div>
        <div className={QUICK_PAD_GRID}>
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-26 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  const error = tree.error ?? products.error ?? layout.error;
  if (error) {
    return (
      <QueryError
        error={error}
        onRetry={() => {
          void tree.refetch();
          void products.refetch();
          void layout.refetch();
        }}
      />
    );
  }

  if (!model || model.childrenOf(null).length === 0) {
    return (
      <EmptyState
        icon={StoreIcon}
        title={t('pos.emptyCatalogTitle')}
        description={t('pos.emptyCatalogDescription')}
      />
    );
  }

  return <QuickPadView model={model} cart={cart} onAdd={onAdd} panelId={PANEL_ID} />;
}
