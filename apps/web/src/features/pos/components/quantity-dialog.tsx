import { Button, NumericKeypad, ResponsiveDialog } from '@rbp/ui';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MAX_QUANTITY } from '../store/cart-store';

export interface QuantityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  quantity: number;
  onConfirm: (quantity: number) => void;
}

/** Type a quantity on a touch keypad (e.g. 12 buns) instead of tapping + twelve times. */
export function QuantityDialog({
  open,
  onOpenChange,
  name,
  quantity,
  onConfirm,
}: QuantityDialogProps) {
  const { t } = useTranslation('pos');
  const [value, setValue] = useState('');
  // Start from an empty entry each time so typing replaces the old quantity.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setValue('');
  }
  const parsed = Number(value);
  const valid = value !== '' && parsed >= 1 && parsed <= MAX_QUANTITY;

  const confirm = () => {
    if (!valid) return;
    onConfirm(parsed);
    onOpenChange(false);
  };

  // Enter confirms (the keypad already listens for digits and Backspace).
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        confirm();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('quantityFor', { name })}
      closeLabel={t('closeSale')}
      footer={
        <Button size="pos" className="w-full sm:w-auto" disabled={!valid} onClick={confirm}>
          {t('setQuantity')}
        </Button>
      }
    >
      <NumericKeypad
        value={value}
        onChange={setValue}
        mode="integer"
        maxLength={3}
        label={t('quantity')}
        display={value || String(quantity)}
      />
    </ResponsiveDialog>
  );
}
