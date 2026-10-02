import { Button, Input, ResponsiveDialog } from '@rbp/ui';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

/** POS-010: optional label, then park the sale as a HELD order. */
export function HoldDialog({
  open,
  onOpenChange,
  defaultLabel,
  onHold,
  busy,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultLabel: string;
  onHold: (label: string) => void;
  busy: boolean;
}) {
  const { t } = useTranslation('pos');
  const id = useId();
  const [label, setLabel] = useState(defaultLabel);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setLabel(defaultLabel);
  }
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('hold.title')}
      closeLabel={t('closeSale')}
      size="sm"
      footer={
        <Button
          size="pos"
          className="w-full sm:w-auto"
          loading={busy}
          onClick={() => onHold(label.trim())}
        >
          {t('hold.confirm')}
        </Button>
      }
    >
      <form
        data-screen-id="POS-010"
        className="space-y-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          onHold(label.trim());
        }}
      >
        <label htmlFor={id} className="text-sm font-medium">
          {t('hold.label')}
        </label>
        <Input
          id={id}
          value={label}
          maxLength={40}
          autoFocus
          onChange={(e) => setLabel(e.target.value)}
          placeholder={t('hold.labelPlaceholder')}
        />
      </form>
    </ResponsiveDialog>
  );
}
