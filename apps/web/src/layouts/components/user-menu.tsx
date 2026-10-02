import {
  Avatar,
  AvatarFallback,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@rbp/ui';
import { BookOpenIcon, LanguagesIcon, LogOutIcon, PaletteIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useLogout, useMe } from '@/features/auth/api/queries';
import { initials } from '@/lib/format';
import { useIsMobile } from '@/lib/use-media-query';
import { LanguageRadioItems } from './language-menu';
import { ThemeRadioItems } from './theme-menu';

export function UserMenu() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: me } = useMe();
  const logout = useLogout();
  // Phones have no room beside the menu for a sub-menu (it opened off-screen): list inline.
  const inline = useIsMobile();
  if (!me) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full"
          aria-label={t('shell.account')}
        >
          <Avatar className="size-9">
            <AvatarFallback>{initials(me.user.displayName)}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <span className="block text-sm font-medium text-foreground">{me.user.displayName}</span>
          <span className="block truncate text-xs">{me.user.email}</span>
          <span className="mt-1 block text-xs">{me.roles.map((r) => r.name).join(', ')}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {inline ? (
          <>
            <DropdownMenuLabel className="flex items-center gap-2 text-xs">
              <LanguagesIcon className="size-4" /> {t('shell.language')}
            </DropdownMenuLabel>
            <LanguageRadioItems />
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="flex items-center gap-2 text-xs">
              <PaletteIcon className="size-4" /> {t('shell.theme')}
            </DropdownMenuLabel>
            <ThemeRadioItems />
          </>
        ) : (
          <>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <LanguagesIcon /> {t('shell.language')}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent collisionPadding={8}>
                <LanguageRadioItems />
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <PaletteIcon /> {t('shell.theme')}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent collisionPadding={8}>
                <ThemeRadioItems />
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate('/guide')}>
          <BookOpenIcon /> {t('shell.userGuide')}
        </DropdownMenuItem>
        <DropdownMenuItem
          variant="destructive"
          onSelect={() =>
            logout.mutate(undefined, { onSettled: () => navigate('/login', { replace: true }) })
          }
        >
          <LogOutIcon /> {t('actions.signOut')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
