import type { PreparedDisposition } from '@rbp/types';
import { Button, RadioCard, RadioGroup, ResponsiveDialog } from '@rbp/ui';
import { ChefHatIcon, RecycleIcon, Trash2Icon, UtensilsIcon } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispositionPromptStore } from '../store/disposition-prompt-store';

const OPTIONS: { value: PreparedDisposition; icon: ReactNode }[] = [
  { value: 'NOT_PREPARED', icon: <ChefHatIcon /> },
  { value: 'RESALE', icon: <RecycleIcon /> },
  { value: 'WASTAGE', icon: <Trash2Icon /> },
  { value: 'STAFF_MEAL', icon: <UtensilsIcon /> },
];

/**
 * SCN-004 cancelled food the kitchen already has: say what happens to it before the
 * manager's PIN. The answer goes on the CANCEL ticket and the audit record.
 */
export function DispositionDialog() {
  const { t } = useTranslation('pos');
  const prompt = useDispositionPromptStore((s) => s.prompt);
  const settle = useDispositionPromptStore((s) => s.settle);
  const [value, setValue] = useState<PreparedDisposition | null>(null);
  const [wasOpen, setWasOpen] = useState(prompt);
  if (prompt !== wasOpen) {
    setWasOpen(prompt);
    setValue(null);
  }

  return (
    <ResponsiveDialog
      open={!!prompt}
      onOpenChange={(open) => !open && settle(null)}
      title={t(prompt?.scope === 'order' ? 'disposition.orderTitle' : 'disposition.title', {
        name: prompt?.name ?? '',
        count: prompt?.quantity ?? 0,
      })}
      description={t('disposition.description')}
      closeLabel={t('common:actions.cancel')}
      size="md"
      footer={
        <Button
          size="pos"
          className="w-full sm:w-auto"
          disabled={!value}
          onClick={() => value && settle(value)}
        >
          {t('disposition.continue')}
        </Button>
      }
    >
      <RadioGroup
        value={value ?? ''}
        onValueChange={(v) => setValue(v as PreparedDisposition)}
        aria-label={t('disposition.label')}
        className="grid gap-2 sm:grid-cols-2"
      >
        {OPTIONS.map((o) => (
          <RadioCard
            key={o.value}
            value={o.value}
            icon={o.icon}
            title={t(`disposition.${o.value}`)}
            description={t(`disposition.${o.value}_hint`)}
          />
        ))}
      </RadioGroup>
    </ResponsiveDialog>
  );
}
