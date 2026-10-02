import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@rbp/ui';
import { cn } from '@rbp/utils';
import { ChevronDownIcon, Maximize2Icon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, useLocation } from 'react-router';
import { useAccess } from '@/features/auth/hooks/use-access';
import { DASHBOARD_ITEM, type NavGroup } from '@/navigation/nav-config';
import { useVisibleNav } from './use-visible-nav';

const linkBase =
  'flex min-h-10 items-center gap-3 rounded-md px-3 text-sm text-sidebar-foreground/85 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground';
const linkActive = 'bg-sidebar-accent font-medium text-sidebar-accent-foreground';

function isInGroup(group: NavGroup, pathname: string) {
  return group.items.some((i) => pathname === i.path || pathname.startsWith(`${i.path}/`));
}

export function SidebarNav({
  collapsed,
  onNavigate,
}: {
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const { t } = useTranslation('nav');
  const { pathname } = useLocation();
  const groups = useVisibleNav();
  const { check } = useAccess();
  const showDashboard = check(DASHBOARD_ITEM).allowed;
  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(groups.map((g) => [g.key, isInGroup(g, pathname)])),
  );

  if (collapsed) {
    return (
      <nav className="flex flex-col items-center gap-1 py-2">
        {showDashboard && (
          <Tooltip>
            <TooltipTrigger asChild>
              <NavLink
                to="/"
                end
                aria-label={t('dashboard')}
                // String className: Radix Slot (TooltipTrigger asChild) can't merge NavLink's
                // function form, which silently dropped the rail link's size and active state.
                className={cn(
                  linkBase,
                  'size-11 justify-center px-0',
                  pathname === '/' && linkActive,
                )}
              >
                <DASHBOARD_ITEM.icon className="size-5" />
              </NavLink>
            </TooltipTrigger>
            <TooltipContent side="right">{t('dashboard')}</TooltipContent>
          </Tooltip>
        )}
        {groups.map((g) => (
          <DropdownMenu key={g.key}>
            <DropdownMenuTrigger
              aria-label={t(`groups.${g.key}`)}
              className={cn(
                linkBase,
                'size-11 justify-center px-0',
                isInGroup(g, pathname) && linkActive,
              )}
            >
              <g.icon className="size-5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="start" className="w-56">
              <DropdownMenuLabel>{t(`groups.${g.key}`)}</DropdownMenuLabel>
              {g.items.map((item) => (
                <DropdownMenuItem key={item.key} asChild>
                  <Link to={item.path} onClick={onNavigate}>
                    {t(`items.${item.key}`)}
                    {item.fullscreen && <Maximize2Icon className="ml-auto size-3.5 opacity-50" />}
                  </Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ))}
      </nav>
    );
  }

  return (
    <nav className="flex flex-col gap-0.5 p-3">
      {showDashboard && (
        <NavLink
          to="/"
          end
          onClick={onNavigate}
          className={({ isActive }) => cn(linkBase, isActive && linkActive)}
        >
          <DASHBOARD_ITEM.icon className="size-5 shrink-0" />
          {t('dashboard')}
        </NavLink>
      )}
      {groups.map((g) => {
        const expanded = open[g.key] ?? false;
        return (
          <div key={g.key} className="mt-1">
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => setOpen((s) => ({ ...s, [g.key]: !expanded }))}
              className={cn(
                linkBase,
                'w-full',
                isInGroup(g, pathname) && 'text-sidebar-accent-foreground',
              )}
            >
              <g.icon className="size-5 shrink-0" />
              <span className="flex-1 text-left">{t(`groups.${g.key}`)}</span>
              <ChevronDownIcon
                className={cn('size-4 opacity-60 transition-transform', !expanded && '-rotate-90')}
              />
            </button>
            {expanded && (
              <div className="mt-0.5 ml-5 flex flex-col gap-0.5 border-l border-sidebar-border pl-3">
                {g.items.map((item) => (
                  <NavLink
                    key={item.key}
                    to={item.path}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      cn(linkBase, 'min-h-9 px-2', isActive && linkActive)
                    }
                  >
                    <span className="flex-1 truncate">{t(`items.${item.key}`)}</span>
                    {item.fullscreen && <Maximize2Icon className="size-3.5 opacity-50" />}
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}
