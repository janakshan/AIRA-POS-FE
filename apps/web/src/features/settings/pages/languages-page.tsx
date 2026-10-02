import type { LanguageCode, LanguageSettings } from '@rbp/types';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  PageHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  toast,
} from '@rbp/ui';
import { languageSettingsSchema, toFieldErrors } from '@rbp/validation';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { LANGUAGES } from '@/app/i18n';
import { QueryError } from '@/components/query-error';
import { Screen } from '@/components/screen';
import { useErrorMessage } from '@/components/use-error-message';
import { PageBreadcrumbs } from '@/navigation/page-breadcrumbs';
import { useLanguageSettings, useSaveLanguages } from '../api/queries';
import { Meter } from '../components/meter';

const labelOf = (code: LanguageCode) => LANGUAGES.find((l) => l.code === code)?.label ?? code;

/** SET-009 Languages: which languages staff may pick and the default one (§29). */
export function LanguagesPage() {
  const { t } = useTranslation('settings');
  const settings = useLanguageSettings();
  return (
    <Screen id="SET-009" title={t('languages.title')} className="mx-auto max-w-3xl space-y-section">
      <PageHeader
        eyebrow={<PageBreadcrumbs />}
        title={t('languages.title')}
        description={t('languages.hint')}
      />
      {settings.isError ? (
        <Card>
          <QueryError error={settings.error} onRetry={() => void settings.refetch()} />
        </Card>
      ) : !settings.data ? (
        <Skeleton className="h-72 rounded-xl" />
      ) : (
        <LanguagesForm
          key={`${settings.data.defaultLanguage}:${settings.data.languages.join()}`}
          initial={settings.data}
        />
      )}
    </Screen>
  );
}

function LanguagesForm({ initial }: { initial: LanguageSettings }) {
  const { t } = useTranslation('settings');
  const errorMessage = useErrorMessage();
  const save = useSaveLanguages();
  const defaultId = useId();
  const [languages, setLanguages] = useState<LanguageCode[]>(initial.languages);
  const [defaultLanguage, setDefaultLanguage] = useState(initial.defaultLanguage);
  const [error, setError] = useState<string | null>(null);
  const dirty =
    defaultLanguage !== initial.defaultLanguage ||
    languages.slice().sort().join() !== initial.languages.slice().sort().join();

  const submit = () => {
    const parsed = languageSettingsSchema.safeParse({ defaultLanguage, languages });
    if (!parsed.success) {
      setError(toFieldErrors(parsed.error).defaultLanguage ?? 'validation.required');
      return;
    }
    setError(null);
    save.mutate(parsed.data, {
      onSuccess: () => toast.success(t('languages.saved')),
      onError: (e) => toast.error(errorMessage(e)),
    });
  };

  return (
    <>
      <Card>
        <CardContent className="space-y-5">
          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">{t('languages.available')}</legend>
            {LANGUAGES.map((l) => (
              <label
                key={l.code}
                className="flex items-center gap-3 text-sm pointer-coarse:min-h-11"
              >
                <Checkbox
                  checked={languages.includes(l.code)}
                  disabled={l.code === 'en'}
                  onCheckedChange={(v) => {
                    const next =
                      v === true ? [...languages, l.code] : languages.filter((x) => x !== l.code);
                    setLanguages(next);
                    // Turning off the default moves the default back to English.
                    if (!next.includes(defaultLanguage)) setDefaultLanguage('en');
                  }}
                />
                <span lang={l.code} className="font-medium">
                  {l.label}
                </span>
                {l.code === 'en' && (
                  <span className="text-muted-foreground">{t('languages.englishAlways')}</span>
                )}
              </label>
            ))}
          </fieldset>
          <div className="space-y-1.5">
            <label htmlFor={defaultId} className="text-sm font-medium">
              {t('languages.default')}
            </label>
            <Select
              value={defaultLanguage}
              onValueChange={(v) => setDefaultLanguage(v as LanguageCode)}
            >
              <SelectTrigger id={defaultId} className="w-full sm:w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {languages.map((code) => (
                  <SelectItem key={code} value={code}>
                    {labelOf(code)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {error ? (
              <p className="text-xs text-status-danger-fg" role="alert">
                {t(`common:${error}`)}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">{t('languages.defaultHint')}</p>
            )}
          </div>
          <div className="flex justify-end">
            <Button size="pos" loading={save.isPending} disabled={!dirty} onClick={submit}>
              {t('save')}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('languages.coverage')}</CardTitle>
          <CardDescription>{t('languages.coverageHint')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {initial.coverage.map((c) => (
            <section key={c.language} aria-label={labelOf(c.language)} className="space-y-2">
              <p className="font-medium" lang={c.language}>
                {labelOf(c.language)}
              </p>
              <Meter
                label={t('languages.products', { done: c.productsTranslated, total: c.products })}
                value={c.productsTranslated}
                max={c.products}
              />
              <Meter
                label={t('languages.categories', {
                  done: c.categoriesTranslated,
                  total: c.categories,
                })}
                value={c.categoriesTranslated}
                max={c.categories}
              />
            </section>
          ))}
          <Button variant="outline" asChild>
            <Link to="/catalog/products">{t('languages.openCatalog')}</Link>
          </Button>
        </CardContent>
      </Card>
    </>
  );
}
