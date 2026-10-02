import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router';
import { useBreadcrumbStore } from './breadcrumb-store';
import { NAV_GROUPS, type NavGroup, type NavItem } from './nav-config';

/**
 * Nav item that owns a path. The longest matching path wins, so /customers/external-shops/x
 * belongs to External shops rather than its /customers sibling.
 */
export function findNavMatch(pathname: string): { group: NavGroup; item: NavItem } | undefined {
  let match: { group: NavGroup; item: NavItem } | undefined;
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      const hit = pathname === item.path || pathname.startsWith(`${item.path}/`);
      if (hit && (!match || item.path.length > match.item.path.length)) match = { group, item };
    }
  }
  return match;
}

/** Breadcrumb trail (Group › Item › Record) derived from nav-config for the current path. */
export function useBreadcrumbItems() {
  const { t } = useTranslation('nav');
  const { pathname } = useLocation();
  const detail = useBreadcrumbStore((s) => s.detail);
  const match = findNavMatch(pathname);
  if (!match) return [];
  const { group, item } = match;
  const onDetail = pathname !== item.path && !!detail;
  return [
    { label: t(`groups.${group.key}`), href: group.items[0]?.path },
    { label: t(`items.${item.key}`), ...(onDetail ? { href: item.path } : {}) },
    ...(onDetail ? [{ label: detail }] : []),
  ];
}
