import type { MeResponse } from '@rbp/types';

/**
 * Restaurant POS (order types, tables, kitchen) runs at RESTAURANT and MIXED locations when the
 * tenant has POS_RESTAURANT; every other location sells on the Retail POS.
 */
export function isRestaurantPos(
  me: Pick<MeResponse, 'features' | 'currentLocation'> | undefined,
): boolean {
  const type = me?.currentLocation?.type;
  return !!me?.features.includes('POS_RESTAURANT') && (type === 'RESTAURANT' || type === 'MIXED');
}
