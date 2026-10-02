import { Button, SearchInput } from '@rbp/ui';
import { ListIcon } from 'lucide-react';
import type { ReactNode, Ref } from 'react';
import { useTranslation } from 'react-i18next';

export interface ProductSearchProps {
  value: string;
  onChange: (value: string) => void;
  /** Enter: add the exact code/barcode match (or the only match). */
  onSubmit: () => void;
  inputRef?: Ref<HTMLInputElement>;
  /** Opens POS-002 full search. */
  onOpenFull: () => void;
  /** More toolbar buttons (Held, History). */
  actions?: ReactNode;
}

/** POS-002 search box above the Quick Pad; also accepts typed codes and barcodes. */
export function ProductSearch({
  value,
  onChange,
  onSubmit,
  inputRef,
  onOpenFull,
  actions,
}: ProductSearchProps) {
  const { t } = useTranslation('pos');
  return (
    <div className="flex items-center gap-3">
      <SearchInput
        ref={inputRef}
        value={value}
        onValueChange={onChange}
        placeholder={t('search')}
        aria-label={t('searchLabel')}
        aria-keyshortcuts="/"
        clearLabel={t('clear')}
        enterKeyHint="search"
        className="[&_input]:h-touch-pos [&_input]:text-base"
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onSubmit();
          } else if (e.key === 'Escape' && value) {
            e.preventDefault();
            onChange('');
          }
        }}
      />
      <Button
        variant="outline"
        size="pos"
        className="shrink-0"
        onClick={onOpenFull}
        aria-label={t('productSearch.title')}
        aria-keyshortcuts="F2"
      >
        <ListIcon /> <span className="hidden xl:inline">{t('productSearch.open')}</span>
      </Button>
      {actions}
      <span className="hidden shrink-0 text-xs text-muted-foreground 2xl:inline">
        {t('searchHint')}
      </span>
    </div>
  );
}
