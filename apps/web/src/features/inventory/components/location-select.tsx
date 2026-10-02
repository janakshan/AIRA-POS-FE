import type { LocationType } from '@rbp/types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@rbp/ui';
import { useTranslation } from 'react-i18next';
import { useMyLocations } from '../lib/use-locations';

/** A location the user can access; optionally "All locations" (value 'all'). */
export function LocationSelect({
  value,
  onChange,
  allowAll = false,
  exclude,
  types,
  label,
  className = 'w-full sm:w-56',
  id,
}: {
  value: string;
  onChange: (value: string) => void;
  allowAll?: boolean;
  exclude?: string;
  /** Only these location types (e.g. BAKERY for production). */
  types?: LocationType[];
  label: string;
  className?: string;
  id?: string;
}) {
  const { t } = useTranslation('inventory');
  const { locations } = useMyLocations();
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className={className} aria-label={label}>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        {allowAll && <SelectItem value="all">{t('allLocations')}</SelectItem>}
        {locations
          .filter((l) => l.id !== exclude && (!types || types.includes(l.type)))
          .map((l) => (
            <SelectItem key={l.id} value={l.id}>
              {l.name}
            </SelectItem>
          ))}
      </SelectContent>
    </Select>
  );
}
