import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@rbp/ui';
import type { LanguageCode } from '@rbp/types';
import { LanguagesIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LANGUAGES } from '@/app/i18n';
import { useMe } from '@/features/auth/api/queries';
import { useUiStore } from '@/stores/ui-store';

export function LanguageRadioItems() {
  const { i18n } = useTranslation();
  const setLanguage = useUiStore((s) => s.setLanguage);
  // SET-009: only the business's languages once signed in (all of them on the login page).
  const enabled = useMe().data?.tenant.languages;
  return (
    <DropdownMenuRadioGroup
      value={i18n.language}
      onValueChange={(v) => setLanguage(v as LanguageCode)}
    >
      {LANGUAGES.filter((l) => !enabled || enabled.includes(l.code)).map((l) => (
        <DropdownMenuRadioItem key={l.code} value={l.code}>
          {l.label}
        </DropdownMenuRadioItem>
      ))}
    </DropdownMenuRadioGroup>
  );
}

export function LanguageMenu() {
  const { t } = useTranslation();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t('shell.language')}>
          <LanguagesIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{t('shell.language')}</DropdownMenuLabel>
        <LanguageRadioItems />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
