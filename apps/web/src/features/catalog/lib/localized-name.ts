import type { NameTranslations } from '@rbp/types';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

export interface Named {
  name: string;
  nameTranslations?: NameTranslations;
}

/** Pick the name in the UI language (Tamil/Sinhala), falling back to English (REQ-861…883). */
export function localizedName(item: Named, language: string): string {
  const lang = language.split('-')[0] as keyof NameTranslations;
  return item.nameTranslations?.[lang]?.trim() || item.name;
}

export function useLocalizedName() {
  const { i18n } = useTranslation();
  const language = i18n.language;
  return useCallback((item: Named) => localizedName(item, language), [language]);
}
