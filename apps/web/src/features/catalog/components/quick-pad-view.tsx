import { CategoryRail, ProductTile } from '@rbp/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { localeFor } from '@/app/i18n';
import { useLocalizedName } from '../lib/localized-name';
import type { PadCategory, PadModel } from '../lib/quick-pad-model';
import { canSell, stockChip, unavailableLabel } from '../lib/stock';

export const QUICK_PAD_GRID =
  'grid auto-rows-min content-start gap-3 grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))]';

export interface QuickPadViewProps {
  model: PadModel;
  cart?: Record<string, number>;
  onAdd?: (productId: string) => void;
  /** Unique per page: links the rail tabs to the product grid. */
  panelId: string;
}

/**
 * The Quick Pad as cashiers see it (POS-001), also used as the live preview in CAT-007.
 * Categories with subcategories drill in; a back chip returns to the parent level.
 */
export function QuickPadView({ model, cart = {}, onAdd, panelId }: QuickPadViewProps) {
  const { t, i18n } = useTranslation();
  const locale = localeFor(i18n.language);
  const nameOf = useLocalizedName();
  const [level, setLevel] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const drillable = (id: string) => model.childrenOf(id).length > 0;
  // A level can disappear (location switch, layout change): fall back to the top level.
  const levelNode = level ? model.byId.get(level) : undefined;
  const effectiveLevel =
    levelNode && (levelNode.products.length > 0 || drillable(levelNode.id)) ? levelNode : undefined;

  const railNodes: PadCategory[] = [
    ...(effectiveLevel && effectiveLevel.products.length > 0 ? [effectiveLevel] : []),
    ...model.childrenOf(effectiveLevel?.id ?? null),
  ];
  const activeId = railNodes.some((c) => c.id === selected) ? selected : (railNodes[0]?.id ?? null);
  const active = activeId ? model.byId.get(activeId) : undefined;

  const choose = (id: string) => {
    const node = model.byId.get(id);
    if (!node) return;
    if (id !== effectiveLevel?.id && drillable(id)) {
      setLevel(id);
      setSelected(node.products.length > 0 ? id : (model.childrenOf(id)[0]?.id ?? id));
    } else {
      setSelected(id);
    }
  };

  if (!active) return null;

  return (
    <div className="grid gap-3 md:grid-cols-[13rem_minmax(0,1fr)]">
      <CategoryRail
        label={t('pos.categories')}
        categories={railNodes.map((c) => ({
          id: c.id,
          label: c.name,
          color: c.color,
          imageUrl: c.imageUrl,
          count: c.id === effectiveLevel?.id ? c.products.length : c.total,
          hasChildren: c.id !== effectiveLevel?.id && drillable(c.id),
        }))}
        value={active.id}
        onChange={choose}
        panelId={panelId}
        {...(effectiveLevel
          ? {
              back: {
                label: effectiveLevel.name,
                onBack: () => {
                  setSelected(effectiveLevel.id);
                  setLevel(effectiveLevel.parentId);
                },
              },
            }
          : {})}
      />
      <div id={panelId} role="tabpanel" aria-label={active.name} className={QUICK_PAD_GRID}>
        {active.products.map((p) => (
          <ProductTile
            key={p.productId}
            name={nameOf(p)}
            imageUrl={p.imageUrl}
            price={p.price}
            locale={locale}
            code={p.code}
            color={active.color}
            stockNote={stockChip(p, t)}
            unavailable={!canSell(p)}
            unavailableLabel={unavailableLabel(p, t)}
            quantityInCart={cart[p.productId]}
            {...(onAdd ? { onClick: () => onAdd(p.productId) } : {})}
          />
        ))}
      </div>
    </div>
  );
}
