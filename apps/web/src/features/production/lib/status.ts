import type { ProductionBatchStatus, ProductionPlanStatus } from '@rbp/types';
import type { StatusTone } from '@rbp/ui';

export const PLAN_STATUSES: ProductionPlanStatus[] = [
  'DRAFT',
  'CONFIRMED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
];

export const PLAN_TONE: Record<ProductionPlanStatus, StatusTone> = {
  DRAFT: 'neutral',
  CONFIRMED: 'info',
  IN_PROGRESS: 'progress',
  COMPLETED: 'success',
  CANCELLED: 'danger',
};

export const BATCH_STATUSES: ProductionBatchStatus[] = [
  'PLANNED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
];

export const BATCH_TONE: Record<ProductionBatchStatus, StatusTone> = {
  PLANNED: 'info',
  IN_PROGRESS: 'progress',
  COMPLETED: 'success',
  CANCELLED: 'danger',
};

const pad = (n: number) => String(n).padStart(2, '0');

/** Local YYYY-MM-DD, `days` from today. */
export function localDay(days = 0) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Wastage as a percentage, from basis points. */
export const percent = (bps: number) => `${(bps / 100).toFixed(1)}%`;
