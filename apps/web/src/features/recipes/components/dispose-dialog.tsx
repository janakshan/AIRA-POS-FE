import type { PreparedItem, PreparedOutcome } from '@rbp/types';
import { Button, RadioCard, RadioGroup, ResponsiveDialog, Textarea, toast } from '@rbp/ui';
import { CircleEllipsisIcon, Trash2Icon, TrashIcon, UtensilsIcon } from 'lucide-react';
import { type ReactNode, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useErrorMessage } from '@/components/use-error-message';
import { useDisposePreparedItem } from '../api/queries';

const OUTCOMES: { value: PreparedOutcome; icon: ReactNode }[] = [
  { value: 'WASTAGE', icon: <Trash2Icon /> },
  { value: 'STAFF_MEAL', icon: <UtensilsIcon /> },
  { value: 'DISPOSED', icon: <TrashIcon /> },
  { value: 'OTHER', icon: <CircleEllipsisIcon /> },
];

/** REC-005: prepared food that won't be resold — what happened to it, and why (audited). */
export function DisposeDialog({
  item,
  onOpenChange,
}: {
  item: PreparedItem | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation('recipes');
  const errorMessage = useErrorMessage();
  const dispose = useDisposePreparedItem();
  const reasonId = useId();
  const [outcome, setOutcome] = useState<PreparedOutcome | null>(null);
  const [reason, setReason] = useState('');
  const [was, setWas] = useState(item);
  if (item !== was) {
    setWas(item);
    setOutcome(item?.status === 'EXPIRED' ? 'WASTAGE' : null);
    setReason(item?.status === 'EXPIRED' ? t('dispose.expiredReason') : '');
  }
  const valid = !!outcome && reason.trim().length >= 3;

  const submit = () =>
    item &&
    outcome &&
    dispose.mutate(
      { id: item.id, body: { outcome, reason: reason.trim() } },
      {
        onSuccess: (p) => {
          toast.success(
            t('dispose.done', { name: p.productName, outcome: t(`outcome.${outcome}`) }),
          );
          onOpenChange(false);
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    );

  return (
    <ResponsiveDialog
      open={!!item}
      onOpenChange={(o) => !dispose.isPending && onOpenChange(o)}
      title={t('dispose.title', { name: item?.productName ?? '', count: item?.remaining ?? 0 })}
      description={t('dispose.hint')}
      closeLabel={t('close')}
      size="md"
      footer={
        <Button
          size="pos"
          className="w-full sm:w-auto"
          disabled={!valid}
          loading={dispose.isPending}
          onClick={submit}
        >
          {t('dispose.confirm')}
        </Button>
      }
    >
      <div className="space-y-4">
        <RadioGroup
          value={outcome ?? ''}
          onValueChange={(v) => setOutcome(v as PreparedOutcome)}
          aria-label={t('dispose.outcome')}
          className="grid gap-2 sm:grid-cols-2"
        >
          {OUTCOMES.map((o) => (
            <RadioCard
              key={o.value}
              value={o.value}
              icon={o.icon}
              title={t(`outcome.${o.value}`)}
              description={t(`outcome.${o.value}_hint`)}
            />
          ))}
        </RadioGroup>
        <div className="space-y-1.5">
          <label htmlFor={reasonId} className="text-sm font-medium">
            {t('dispose.reason')}
          </label>
          <Textarea
            id={reasonId}
            rows={2}
            maxLength={200}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t('dispose.reasonPlaceholder')}
          />
        </div>
      </div>
    </ResponsiveDialog>
  );
}
