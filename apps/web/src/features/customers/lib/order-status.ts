import type { OrderStatus } from '@rbp/types';
import type { StatusTone } from '@rbp/ui';

export const ORDER_TONE: Record<OrderStatus, StatusTone> = {
  PAID: 'success',
  HELD: 'info',
  OPEN: 'progress',
  CANCELLED: 'neutral',
  VOIDED: 'danger',
};
