import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@rbp/ui';
import { cn } from '@rbp/utils';
import { ChevronsUpDownIcon, MapPinIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useMe, useSwitchLocation } from '@/features/auth/api/queries';

export function LocationSwitcher({
  className,
  variant = 'default',
}: {
  className?: string;
  variant?: 'default' | 'dark';
}) {
  const { t } = useTranslation();
  const { data: me } = useMe();
  const switchLocation = useSwitchLocation();
  const current = me?.currentLocation;
  if (!me) return null;

  const multiple = me.locations.length > 1;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={!multiple}>
        <Button
          variant="ghost"
          aria-label={t('shell.switchLocation')}
          className={cn(
            'h-10 max-w-[14rem] justify-start gap-2 px-2 disabled:opacity-100',
            variant === 'dark' && 'text-white hover:bg-white/10 hover:text-white',
            className,
          )}
        >
          <MapPinIcon className="text-primary" />
          <span className="min-w-0 text-left">
            <span className="block truncate text-sm leading-tight font-medium">
              {current?.name ?? '—'}
            </span>
            <span className="block truncate text-[11px] leading-tight font-normal opacity-60">
              {me.tenant.name}
            </span>
          </span>
          {multiple && <ChevronsUpDownIcon className="ml-auto opacity-50" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>{t('shell.switchLocation')}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={current?.id ?? ''} onValueChange={switchLocation}>
          {me.locations.map((l) => (
            <DropdownMenuRadioItem key={l.id} value={l.id}>
              <span className="min-w-0">
                <span className="block truncate">{l.name}</span>
                <span className="block text-xs text-muted-foreground">{l.code}</span>
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
