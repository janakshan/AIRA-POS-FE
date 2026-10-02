import { FormControl, FormField, FormItem, FormLabel, FormMessage, Input } from '@rbp/ui';
import type { Control, FieldValues, Path } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

/** Tamil / Sinhala names (REQ-861…883). Blank = English name is shown. */
export function TranslationFields<T extends FieldValues>({ control }: { control: Control<T> }) {
  const { t } = useTranslation('catalog');
  return (
    <>
      {(
        [
          ['ta', 'common.nameTa', 'ta'],
          ['si', 'common.nameSi', 'si'],
        ] as const
      ).map(([lang, labelKey, htmlLang]) => (
        <FormField
          key={lang}
          control={control}
          name={`nameTranslations.${lang}` as Path<T>}
          render={({ field }) => (
            <FormItem>
              <FormLabel optionalLabel={t('common.optional')}>{t(labelKey)}</FormLabel>
              <FormControl>
                <Input
                  lang={htmlLang}
                  autoComplete="off"
                  {...field}
                  value={(field.value as string | undefined) ?? ''}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      ))}
    </>
  );
}
