import type { Kot } from '@rbp/types';

/** Tickets waiting longer than this are flagged late (REQ-356). */
export const LATE_MINUTES = 15;

/** "DINE-IN · T4", "TAKEAWAY", "DELIVERY". */
export function kotHeadline(kot: Pick<Kot, 'orderType' | 'table'>, t: (key: string) => string) {
  const type = t(`kot.type.${kot.orderType}`);
  return kot.table ? `${type} · ${kot.table}` : type;
}
