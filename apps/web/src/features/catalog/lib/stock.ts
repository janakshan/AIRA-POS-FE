import type { LocationProduct } from '@rbp/types';
import type { TFunction } from 'i18next';

/** INV: at 0 on hand an item can't be sold (no override). */
export const isOutOfStock = (p: Pick<LocationProduct, 'stock'>) => !!p.stock && p.stock.onHand <= 0;

export const canSell = (p: Pick<LocationProduct, 'isAvailable' | 'stock'>) =>
  p.isAvailable && !isOutOfStock(p);

/** Units that can still be sold (Infinity when not tracked). */
export const sellableQty = (p: Pick<LocationProduct, 'stock'> | undefined) =>
  p?.stock ? Math.max(0, p.stock.onHand) : Number.POSITIVE_INFINITY;

/** Tile chip: "1 ready" (REC-005 prepared plates), "3 left" when low, else the stock note. */
export function stockChip(p: Pick<LocationProduct, 'stock' | 'stockNote'>, t: TFunction) {
  if (p.stock?.prepared) return t('common:pos.ready', { count: p.stock.prepared });
  if (p.stock?.status === 'LOW') return t('common:pos.left', { count: p.stock.onHand });
  return p.stockNote;
}

export function unavailableLabel(p: Pick<LocationProduct, 'isAvailable' | 'stock'>, t: TFunction) {
  return p.isAvailable && isOutOfStock(p)
    ? t('common:pos.outOfStock')
    : t('common:pos.unavailable');
}
