import type { OrderType } from '@rbp/types';
import { Button } from '@rbp/ui';
import { cn } from '@rbp/utils';
import {
  ArmchairIcon,
  BikeIcon,
  PencilIcon,
  ShoppingBagIcon,
  ArrowRightLeftIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useAccess } from '@/features/auth/hooks/use-access';
import type { CartView } from '../hooks/use-cart';

const ICONS: Record<Exclude<OrderType, 'RETAIL'>, ReactNode> = {
  DINE_IN: <ArmchairIcon />,
  TAKEAWAY: <ShoppingBagIcon />,
  DELIVERY: <BikeIcon />,
};

/**
 * REST-002/005/006 order type on the same sale screen. The type is fixed once the order is
 * saved; after that a dine-in order changes table only by transfer (PIN + reason).
 */
export function OrderTypeBar({
  cart,
  onChooseTable,
  onTransfer,
  onEditDelivery,
}: {
  cart: CartView;
  onChooseTable: () => void;
  onTransfer: () => void;
  onEditDelivery: () => void;
}) {
  const { t } = useTranslation('pos');
  const { hasFeature } = useAccess();
  const types = (['DINE_IN', 'TAKEAWAY', 'DELIVERY'] as const).filter(
    (type) =>
      (type !== 'DINE_IN' || hasFeature('TABLE_MANAGEMENT')) &&
      (type !== 'DELIVERY' || hasFeature('DELIVERY')),
  );
  const locked = !!cart.order;

  const choose = (type: (typeof types)[number]) => {
    if (type === cart.orderType) return;
    cart.setOrderType(type);
    if (type === 'DINE_IN' && !cart.table) onChooseTable();
    if (type === 'DELIVERY' && !cart.delivery) onEditDelivery();
  };

  return (
    <div className="space-y-2">
      <div
        role="radiogroup"
        aria-label={t('orderType.label')}
        className="grid gap-1 rounded-xl bg-muted p-1"
        style={{ gridTemplateColumns: `repeat(${types.length}, minmax(0, 1fr))` }}
      >
        {types.map((type) => {
          const checked = cart.orderType === type;
          return (
            <button
              key={type}
              type="button"
              role="radio"
              aria-checked={checked}
              data-touch="pos"
              disabled={locked && !checked}
              onClick={() => choose(type)}
              className={cn(
                'flex min-h-touch-pos items-center justify-center gap-1.5 rounded-lg px-2 text-sm font-medium focus-ring transition-colors [&_svg]:size-4',
                checked
                  ? 'bg-card text-foreground shadow-sm ring-1 ring-border'
                  : 'text-muted-foreground hover:text-foreground',
                'disabled:cursor-not-allowed disabled:opacity-40',
              )}
            >
              {ICONS[type]} {t(`orderType.${type}`)}
            </button>
          );
        })}
      </div>
      {cart.orderType === 'DINE_IN' &&
        (cart.table ? (
          <div className="flex items-center gap-2">
            <span className="flex min-h-11 flex-1 items-center gap-2 rounded-lg border border-primary/40 bg-primary/5 px-3 font-semibold">
              <ArmchairIcon className="size-4 text-primary" aria-hidden />
              {t('tables.table', { name: cart.table.name })}
            </span>
            <Button
              variant="outline"
              className="min-h-11"
              onClick={locked ? onTransfer : onChooseTable}
            >
              {locked ? <ArrowRightLeftIcon /> : <PencilIcon />}
              {locked ? t('tables.transfer') : t('tables.change')}
            </Button>
          </div>
        ) : (
          <Button
            variant="outline"
            className="min-h-11 w-full border-dashed"
            onClick={onChooseTable}
          >
            <ArmchairIcon /> {t('tables.choose')}
          </Button>
        ))}
      {cart.orderType === 'DELIVERY' && (
        <button
          type="button"
          onClick={onEditDelivery}
          className={cn(
            'flex min-h-11 w-full items-center gap-2 rounded-lg border px-3 py-1.5 text-left text-sm focus-ring',
            cart.delivery ? 'border-primary/40 bg-primary/5' : 'border-dashed',
          )}
        >
          <BikeIcon className="size-4 shrink-0 text-primary" aria-hidden />
          <span className="min-w-0 flex-1">
            {cart.delivery ? (
              <>
                <span className="block truncate font-medium">{cart.delivery.address}</span>
                <span className="block text-xs text-muted-foreground tabular">
                  {cart.delivery.phone}
                </span>
              </>
            ) : (
              t('delivery.add')
            )}
          </span>
          <PencilIcon className="size-4 text-muted-foreground" aria-hidden />
          <span className="sr-only">{t('delivery.edit')}</span>
        </button>
      )}
    </div>
  );
}
