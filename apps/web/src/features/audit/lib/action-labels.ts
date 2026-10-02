import type { TFunction } from 'i18next';

/** Readable audit action label; falls back to the raw code for actions added later. */
export function auditActionLabel(t: TFunction, action: string): string {
  return t(`audit:actions.${action.replace(/\./g, '_')}`, { defaultValue: action });
}

export const AUDIT_GROUPS = [
  { key: 'all', prefix: null },
  { key: 'sales', prefix: 'pos.' },
  { key: 'catalog', prefix: 'catalog.' },
  { key: 'customers', prefix: 'customer.' },
  { key: 'inventory', prefix: 'inventory.' },
  { key: 'purchasing', prefix: 'purchasing.' },
  { key: 'kitchen', prefix: 'recipes.' },
  { key: 'production', prefix: 'production.' },
  { key: 'wholesale', prefix: 'wholesale.' },
  { key: 'delivery', prefix: 'delivery.' },
  { key: 'staff', prefix: 'staff.' },
] as const;
