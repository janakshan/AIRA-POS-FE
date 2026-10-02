import { useTranslation } from 'react-i18next';
import { localeFor } from '@/app/i18n';
import { diffFields, formatValue } from '../lib/diff';

/** Before → after table for one audit event. */
export function AuditDiff({ before, after }: { before: unknown; after: unknown }) {
  const { t, i18n } = useTranslation('audit');
  const locale = localeFor(i18n.language);
  const rows = diffFields(before, after);
  if (rows.length === 0)
    return <p className="text-sm text-muted-foreground">{t('detail.noDiff')}</p>;
  const created = before === null;
  return (
    <table className="w-full text-sm">
      <caption className="sr-only">{t('detail.title')}</caption>
      <thead>
        <tr className="border-b text-left text-muted-foreground">
          <th scope="col" className="py-1.5 pr-3 font-medium">
            {t('detail.field')}
          </th>
          {!created && (
            <th scope="col" className="py-1.5 pr-3 font-medium">
              {t('detail.before')}
            </th>
          )}
          <th scope="col" className="py-1.5 font-medium">
            {created ? t('detail.created') : t('detail.after')}
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.field} className="border-b align-top last:border-0">
            <th scope="row" className="py-1.5 pr-3 font-mono text-xs font-normal">
              {r.field}
            </th>
            {!created && (
              <td className="py-1.5 pr-3 text-muted-foreground line-through decoration-muted-foreground/50">
                {formatValue(r.before, locale)}
              </td>
            )}
            <td className="py-1.5 font-medium">{formatValue(r.after, locale)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
