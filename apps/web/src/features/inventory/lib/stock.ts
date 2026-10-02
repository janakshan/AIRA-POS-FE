import type {
  StockAdjustmentKind,
  StockMovementType,
  StockStatus,
  StockTransferStatus,
} from '@rbp/types';
import type { StatusTone } from '@rbp/ui';

export const STOCK_TONE: Record<StockStatus, StatusTone> = {
  OK: 'success',
  LOW: 'warning',
  OUT: 'danger',
};

export const MOVEMENT_TONE: Record<StockMovementType, StatusTone> = {
  OPENING: 'neutral',
  SALE: 'info',
  RETURN: 'progress',
  TRANSFER_OUT: 'neutral',
  TRANSFER_IN: 'success',
  WASTAGE: 'danger',
  STAFF_MEAL: 'warning',
  ADJUSTMENT: 'warning',
  PURCHASE: 'success',
  PRODUCTION_CONSUMPTION: 'neutral',
  PRODUCTION_OUTPUT: 'success',
};

/** Signed quantity for display, e.g. "+20" / "−3". */
export const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0');

/** What the stock will be after an adjustment. */
export const resultOf = (kind: StockAdjustmentKind, onHand: number, qty: number) =>
  kind === 'COUNT' ? qty : kind === 'ADD' ? onHand + qty : onHand - qty;

export const TRANSFER_TONE: Record<StockTransferStatus, StatusTone> = {
  IN_TRANSIT: 'progress',
  RECEIVED: 'success',
  CANCELLED: 'neutral',
};
