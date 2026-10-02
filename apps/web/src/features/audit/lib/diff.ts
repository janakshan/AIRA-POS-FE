import type { Money } from '@rbp/types';
import { formatMoney } from '@rbp/utils';

/** Timestamps and ids change on every write; they aren't useful in a diff. */
const IGNORED = new Set(['updatedAt', 'createdAt', 'id', 'tenantId']);

const isMoney = (v: unknown): v is Money =>
  !!v && typeof v === 'object' && 'amount' in v && 'currency' in v;

export function formatValue(value: unknown, locale: string): string {
  if (value === null || value === undefined || value === '') return '—';
  if (isMoney(value)) return formatMoney(value, locale);
  if (typeof value === 'boolean') return value ? '✓' : '✗';
  if (Array.isArray(value))
    return value.length ? value.map((v) => formatValue(v, locale)).join(', ') : '—';
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).filter(
      ([, v]) => v !== undefined,
    );
    return entries.length
      ? entries.map(([k, v]) => `${k}: ${formatValue(v, locale)}`).join(' · ')
      : '—';
  }
  return String(value);
}

/** Fields that differ between two snapshots (or all fields of a created record). */
export function diffFields(before: unknown, after: unknown) {
  const b =
    before && typeof before === 'object' && !isMoney(before)
      ? (before as Record<string, unknown>)
      : null;
  const a =
    after && typeof after === 'object' && !isMoney(after)
      ? (after as Record<string, unknown>)
      : null;
  if (!b && !a) {
    return before === after ? [] : [{ field: 'value', before, after }];
  }
  const keys = [...new Set([...Object.keys(b ?? {}), ...Object.keys(a ?? {})])].filter(
    (k) => !IGNORED.has(k),
  );
  return keys
    .filter((k) => JSON.stringify(b?.[k]) !== JSON.stringify(a?.[k]))
    .map((k) => ({ field: k, before: b?.[k], after: a?.[k] }));
}
