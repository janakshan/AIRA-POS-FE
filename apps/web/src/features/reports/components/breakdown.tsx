import { Card, CardContent, CardHeader, CardTitle } from '@rbp/ui';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

/** A small titled table; the last column is the amount. */
export function Breakdown({
  title,
  headers,
  rows,
}: {
  title: string;
  headers: string[];
  rows: { key: string; cells: ReactNode[] }[];
}) {
  const { t } = useTranslation('reports');
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {!rows.length ? (
          <p className="text-sm text-muted-foreground">{t('empty')}</p>
        ) : (
          <table className="w-full text-sm">
            <caption className="sr-only">{title}</caption>
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground uppercase">
                {headers.map((h, i) => (
                  <th
                    key={h}
                    scope="col"
                    className={i ? 'py-2 text-right font-medium' : 'py-2 font-medium'}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-b last:border-0">
                  {r.cells.map((c, i) =>
                    i === 0 ? (
                      <th key={i} scope="row" className="py-2 text-left font-medium">
                        {c}
                      </th>
                    ) : (
                      <td
                        key={i}
                        className={
                          i === r.cells.length - 1
                            ? 'py-2 text-right font-semibold tabular'
                            : 'py-2 text-right tabular'
                        }
                      >
                        {c}
                      </td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
