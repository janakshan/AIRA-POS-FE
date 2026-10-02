import type { LocationProduct } from '@rbp/types';
import { Button, FilterChip, ResponsiveDialog, SearchInput, StatusBadge } from '@rbp/ui';
import { cn, formatMoney } from '@rbp/utils';
import { type KeyboardEvent, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { localeFor } from '@/app/i18n';
import { useCategoryTree, useLocationProducts } from '@/features/catalog/api/queries';
import { useLocalizedName } from '@/features/catalog/lib/localized-name';
import { findByCode, matchProducts, parseQuantityPrefix } from '../lib/match-products';
import { canSell, stockChip } from '@/features/catalog/lib/stock';

export interface ProductSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Query carried over from the inline search bar. */
  initialQuery: string;
  quantities: Record<string, number>;
  /** Returns false if the product couldn't be added (e.g. unavailable). */
  onAdd: (product: LocationProduct, quantity: number) => boolean;
  /** e.g. "10 items · LKR 3,894.00" for the header. */
  saleSummary: string;
}

/**
 * POS-002 Product Search: keyboard-first list with category filter and a quantity prefix
 * ("3*S01"). Stays open so several items can be added in a row.
 */
export function ProductSearchDialog({
  open,
  onOpenChange,
  initialQuery,
  quantities,
  onAdd,
  saleSummary,
}: ProductSearchDialogProps) {
  const { t, i18n } = useTranslation('pos');
  const locale = localeFor(i18n.language);
  const nameOf = useLocalizedName();
  const products = useLocationProducts();
  const tree = useCategoryTree({ active: true });
  const [query, setQuery] = useState(initialQuery);
  const [category, setCategory] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const [confirmation, setConfirmation] = useState('');

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setQuery(initialQuery);
      setCategory(null);
      setActive(0);
      setConfirmation('');
    }
  }

  const topLevel = (tree.data ?? []).filter((c) => c.depth === 0);
  const categoryPath = useMemo(
    () => new Map((tree.data ?? []).map((c) => [c.id as string, [...c.path, c.name].join(' › ')])),
    [tree.data],
  );
  const inCategory = useMemo(() => {
    if (!category || !tree.data) return null;
    const ids = new Set([category]);
    for (const c of tree.data) if (c.parentId && ids.has(c.parentId)) ids.add(c.id);
    return ids;
  }, [category, tree.data]);

  const { quantity, term } = parseQuantityPrefix(query);
  const results = useMemo(
    () =>
      matchProducts(
        (products.data ?? []).filter((p) => !inCategory || inCategory.has(p.categoryId)),
        term,
        i18n.language,
      ),
    [products.data, inCategory, term, i18n.language],
  );
  const activeIndex = Math.min(active, Math.max(results.length - 1, 0));

  const add = (product: LocationProduct) => {
    if (!canSell(product)) return;
    if (onAdd(product, quantity)) {
      setConfirmation(t('productSearch.added', { name: nameOf(product), quantity }));
      setQuery('');
      setActive(0);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const delta = e.key === 'ArrowDown' ? 1 : -1;
      setActive(Math.max(0, Math.min(results.length - 1, activeIndex + delta)));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = findByCode(products.data ?? [], term) ?? results[activeIndex];
      if (target) add(target);
    }
  };

  const optionId = (p: LocationProduct) => `pos-search-option-${p.productId}`;
  const activeProduct = results[activeIndex];

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('productSearch.title')}
      description={saleSummary}
      closeLabel={t('productSearch.done')}
      size="lg"
      footer={
        <Button size="pos" className="w-full sm:w-auto" onClick={() => onOpenChange(false)}>
          {t('productSearch.done')}
        </Button>
      }
    >
      <div data-screen-id="POS-002" className="flex min-h-0 flex-col gap-3">
        <SearchInput
          value={query}
          onValueChange={(v) => {
            setQuery(v);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          autoFocus
          role="combobox"
          aria-label={t('productSearch.title')}
          aria-expanded
          aria-controls="pos-search-results"
          aria-activedescendant={activeProduct ? optionId(activeProduct) : undefined}
          aria-autocomplete="list"
          placeholder={t('productSearch.placeholder')}
          clearLabel={t('clear')}
          className="[&_input]:h-touch-pos [&_input]:text-base"
        />
        <div className="-mx-1 scrollbar-none flex gap-2 overflow-x-auto px-1">
          <FilterChip active={!category} onClick={() => setCategory(null)}>
            {t('productSearch.allCategories')}
          </FilterChip>
          {topLevel.map((c) => (
            <FilterChip key={c.id} active={category === c.id} onClick={() => setCategory(c.id)}>
              {nameOf(c)}
            </FilterChip>
          ))}
        </div>
        <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
          <span>{t('productSearch.results', { count: results.length })}</span>
          <span className="hidden sm:inline">{t('productSearch.keysHint')}</span>
        </div>
        <p
          role="status"
          aria-live="polite"
          className="min-h-5 text-sm font-medium text-status-success-fg"
        >
          {confirmation}
        </p>
        {results.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">
            {t('productSearch.empty', { query: term })}
          </p>
        ) : (
          <ul
            id="pos-search-results"
            role="listbox"
            aria-label={t('productSearch.results', { count: results.length })}
            className="max-h-[50dvh] divide-y overflow-y-auto rounded-xl border"
          >
            {results.map((p, index) => {
              const inCart = quantities[p.productId];
              return (
                <li
                  key={p.productId}
                  id={optionId(p)}
                  role="option"
                  aria-selected={index === activeIndex}
                  aria-disabled={!canSell(p) || undefined}
                  onClick={() => add(p)}
                  onMouseMove={() => index !== activeIndex && setActive(index)}
                  className={cn(
                    'flex min-h-touch-pos cursor-pointer items-center gap-3 px-3 py-2',
                    index === activeIndex && 'bg-primary/10',
                    !canSell(p) && 'cursor-not-allowed opacity-55',
                  )}
                >
                  {p.imageUrl && (
                    <img
                      src={p.imageUrl}
                      alt=""
                      className="size-10 shrink-0 rounded-md object-cover"
                    />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{nameOf(p)}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      <span className="font-mono">{p.code}</span> · {categoryPath.get(p.categoryId)}
                    </span>
                  </span>
                  {!canSell(p) ? (
                    <StatusBadge tone={p.isAvailable ? 'danger' : 'neutral'} size="sm">
                      {p.isAvailable ? t('common:pos.outOfStock') : t('productSearch.unavailable')}
                    </StatusBadge>
                  ) : stockChip(p, t) ? (
                    <StatusBadge tone="warning" size="sm" hideIcon>
                      {stockChip(p, t)}
                    </StatusBadge>
                  ) : null}
                  {inCart && (
                    <StatusBadge tone="info" size="sm" hideIcon>
                      {t('productSearch.inCart', { count: inCart })}
                    </StatusBadge>
                  )}
                  <span className="w-28 text-right font-semibold tabular">
                    {formatMoney(p.price, locale)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </ResponsiveDialog>
  );
}
