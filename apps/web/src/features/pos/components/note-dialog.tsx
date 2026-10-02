import { Button, FilterChip, ResponsiveDialog, Textarea } from '@rbp/ui';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

const MAX = 120;
const QUICK = ['lessSpicy', 'extraSpicy', 'noOnion', 'noSugar', 'parcel'] as const;

/** Special instructions for one item (REQ-343); printed on the KOT. */
export function NoteDialog({
  open,
  onOpenChange,
  name,
  note,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  note: string;
  onSave: (note: string) => void;
}) {
  const { t } = useTranslation('pos');
  const id = useId();
  const [value, setValue] = useState(note);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setValue(note);
  }
  const addQuick = (text: string) =>
    setValue((v) =>
      (v.includes(text) ? v : [v.trim(), text].filter(Boolean).join(', ')).slice(0, MAX),
    );

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('note.title', { name })}
      closeLabel={t('closeSale')}
      size="sm"
      footer={
        <>
          {note && (
            <Button variant="ghost" size="pos" onClick={() => onSave('')}>
              {t('note.clear')}
            </Button>
          )}
          <Button size="pos" className="w-full sm:w-auto" onClick={() => onSave(value)}>
            {t('note.save')}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {QUICK.map((q) => (
            <FilterChip
              key={q}
              active={value.includes(t(`note.quick.${q}`))}
              onClick={() => addQuick(t(`note.quick.${q}`))}
            >
              {t(`note.quick.${q}`)}
            </FilterChip>
          ))}
        </div>
        <label htmlFor={id} className="sr-only">
          {t('note.label')}
        </label>
        <Textarea
          id={id}
          rows={3}
          maxLength={MAX}
          value={value}
          placeholder={t('note.placeholder')}
          onChange={(e) => setValue(e.target.value)}
        />
        <p className="text-right text-xs text-muted-foreground tabular">
          {value.length}/{MAX}
        </p>
      </div>
    </ResponsiveDialog>
  );
}
