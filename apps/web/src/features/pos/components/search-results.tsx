import type { LocationProduct } from '@rbp/types';
import { EmptyState, ProductTile } from '@rbp/ui';
import { SearchXIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { localeFor } from '@/app/i18n';
import { QUICK_PAD_GRID } from '@/features/catalog/components/quick-pad-view';
import { useLocalizedName } from '@/features/catalog/lib/localized-name';
import { canSell, stockChip, unavailableLabel } from '@/features/catalog/lib/stock';

export interface SearchResultsProps {
  query: string;
  results: LocationProduct[];
  quantities: Record<string, number>;
  onAdd: (product: LocationProduct) => void;
}

/** Search matches shown in place of the category view while a query is typed. */
export function SearchResults({ query, results, quantities, onAdd }: SearchResultsProps) {
  const { t, i18n } = useTranslation('pos');
  const locale = localeFor(i18n.language);
  const nameOf = useLocalizedName();
  if (results.length === 0) {
    return <EmptyState icon={SearchXIcon} title={t('noMatches', { query })} />;
  }
  return (
    <section aria-label={t('results', { count: results.length })}>
      <p className="mb-2 text-sm text-muted-foreground" aria-live="polite">
        {t('results', { count: results.length })}
      </p>
      <div className={QUICK_PAD_GRID}>
        {results.map((p) => (
          <ProductTile
            key={p.productId}
            name={nameOf(p)}
            price={p.price}
            locale={locale}
            code={p.code}
            imageUrl={p.imageUrl}
            stockNote={stockChip(p, t)}
            unavailable={!canSell(p)}
            unavailableLabel={unavailableLabel(p, t)}
            quantityInCart={quantities[p.productId]}
            onClick={() => onAdd(p)}
          />
        ))}
      </div>
    </section>
  );
}
