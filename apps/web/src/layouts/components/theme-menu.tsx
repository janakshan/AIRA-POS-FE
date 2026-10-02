import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@rbp/ui';
import { MonitorIcon, MoonIcon, SunIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { type ThemeMode, useUiStore } from '@/stores/ui-store';

export function ThemeRadioItems() {
  const { t } = useTranslation();
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);
  return (
    <DropdownMenuRadioGroup value={theme} onValueChange={(v) => setTheme(v as ThemeMode)}>
      <DropdownMenuRadioItem value="light">
        <SunIcon /> {t('shell.themeLight')}
      </DropdownMenuRadioItem>
      <DropdownMenuRadioItem value="dark">
        <MoonIcon /> {t('shell.themeDark')}
      </DropdownMenuRadioItem>
      <DropdownMenuRadioItem value="system">
        <MonitorIcon /> {t('shell.themeSystem')}
      </DropdownMenuRadioItem>
    </DropdownMenuRadioGroup>
  );
}

export function ThemeMenu() {
  const { t } = useTranslation();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t('shell.theme')}>
          <SunIcon className="dark:hidden" />
          <MoonIcon className="hidden dark:block" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{t('shell.theme')}</DropdownMenuLabel>
        <ThemeRadioItems />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
