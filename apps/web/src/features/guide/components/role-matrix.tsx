import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@rbp/ui';
import { cn } from '@rbp/utils';
import { CheckIcon, CircleDotIcon, MinusIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { type AccessLevel, ROLE_MATRIX } from '../content/roles';
import { GUIDE_ROLES } from '../guide-types';

const ICONS: Record<AccessLevel, typeof CheckIcon> = {
  full: CheckIcon,
  limited: CircleDotIcon,
  none: MinusIcon,
};
const TONES: Record<AccessLevel, string> = {
  full: 'text-status-success-fg',
  limited: 'text-status-warning-fg',
  none: 'text-muted-foreground/60',
};

/** "Who can do what": areas × demo roles. */
export function RoleMatrix() {
  const { t } = useTranslation('guide');
  return (
    <section id="roles" aria-labelledby="roles-title" className="scroll-mt-28 space-y-4">
      <h2 id="roles-title" className="text-2xl font-semibold tracking-tight">
        {t('roles.title')}
      </h2>
      <p className="max-w-3xl text-muted-foreground">{t('roles.intro')}</p>
      {/* Focusable so keyboard users can scroll the table on narrow screens. */}
      <div
        tabIndex={0}
        role="region"
        aria-labelledby="roles-title"
        className="overflow-x-auto rounded-xl border bg-card focus-ring"
      >
        {/* Plain <table>: the kit's Table adds its own scroll container, which can't take focus. */}
        <table className="w-full caption-bottom text-sm">
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-40">{t('roles.area')}</TableHead>
              {GUIDE_ROLES.map((r) => (
                <TableHead key={r} className="text-center whitespace-nowrap">
                  {t(`roles.names.${r}`)}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {ROLE_MATRIX.map((row) => (
              <TableRow key={row.area}>
                <TableCell className="font-medium">{t(`roles.areas.${row.area}`)}</TableCell>
                {GUIDE_ROLES.map((r) => {
                  const level = row.access[r];
                  const Icon = ICONS[level];
                  return (
                    <TableCell key={r} className="text-center">
                      <Icon
                        className={cn('mx-auto size-4', TONES[level])}
                        aria-label={t(`roles.levels.${level}`)}
                      />
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </table>
      </div>
      <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
        {(['full', 'limited', 'none'] as const).map((l) => {
          const Icon = ICONS[l];
          return (
            <li key={l} className="flex items-center gap-1.5">
              <Icon aria-hidden className={cn('size-4', TONES[l])} /> {t(`roles.levels.${l}`)}
            </li>
          );
        })}
      </ul>
      <p className="text-sm text-muted-foreground">{t('roles.pinNote')}</p>
    </section>
  );
}
