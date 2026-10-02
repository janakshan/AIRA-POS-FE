import { useMe } from '@/features/auth/api/queries';

/**
 * WHO-003: sales come out of a van's stock, so selling needs access to a van location (the
 * route's van when known). Managers at a shop see shops and collections but can't sell; the
 * server refuses with FORBIDDEN, so sell entry points hide and the sale page explains instead.
 */
export function useCanSell() {
  const { data: me } = useMe();
  const vans = me?.locations.filter((l) => l.type === 'VAN') ?? [];
  return {
    /** Loaded /me — until then, don't flash the explanation. */
    known: !!me,
    any: vans.length > 0,
    from: (vanId: string | null | undefined) =>
      vanId ? vans.some((v) => v.id === vanId) : vans.length > 0,
  };
}
