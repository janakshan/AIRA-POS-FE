import { Button } from '@rbp/ui';
import { formatMoney } from '@rbp/utils';
import { ShoppingCartIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { localeFor } from '@/app/i18n';
import type { CartView } from '../hooks/use-cart';

/** Phones / portrait tablets: the running total stays visible and opens the sale. */
export function CartBar({ cart, onOpen }: { cart: CartView; onOpen: () => void }) {
  const { t, i18n } = useTranslation('pos');
  const locale = localeFor(i18n.language);
  const totals = cart.totals;
  return (
    <div className="shrink-0 border-t bg-card p-2 shadow-[0_-4px_12px_rgb(0_0_0/0.06)]">
      <Button size="pos-lg" className="w-full justify-between" onClick={onOpen}>
        <span className="flex items-center gap-2">
          <ShoppingCartIcon />
          {t('items', { count: totals?.itemCount ?? 0 })}
        </span>
        <span className="tabular">{totals ? formatMoney(totals.total, locale) : ''}</span>
        <span className="text-sm font-medium opacity-90">{t('viewSale')}</span>
      </Button>
    </div>
  );
}
