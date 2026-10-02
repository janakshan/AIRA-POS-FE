import type { ProductionBatch } from '@rbp/types';
import {
  Button,
  Input,
  NumberInput,
  ResponsiveDialog,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@rbp/ui';
import { PackageCheckIcon } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useErrorMessage } from '@/components/use-error-message';
import { useReasons } from '@/features/audit/api/queries';
import { useCompleteBatch } from '../api/queries';

/**
 * BAK-003 record output: everything that came out goes into stock (PRODUCTION_OUTPUT); the
 * rejects then go out as wastage with a reason — so finished goods rise by the good units.
 */
export function RecordOutputDialog({
  batch,
  onOpenChange,
}: {
  batch: ProductionBatch | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation('production');
  const errorMessage = useErrorMessage();
  const complete = useCompleteBatch();
  const reasons = useReasons('production.wastage');
  const ids = { good: useId(), rejected: useId(), reason: useId(), comment: useId() };
  const [good, setGood] = useState<number | null>(null);
  const [rejected, setRejected] = useState<number | null>(0);
  const [reasonCode, setReasonCode] = useState('');
  const [comment, setComment] = useState('');
  const [was, setWas] = useState(batch);
  if (batch !== was) {
    setWas(batch);
    setGood(batch?.expectedQuantity ?? null);
    setRejected(0);
    setReasonCode('');
    setComment('');
  }
  const reason = reasons.data?.find((r) => r.code === reasonCode);
  const total = (good ?? 0) + (rejected ?? 0);
  const valid =
    good !== null &&
    rejected !== null &&
    total > 0 &&
    (!rejected || (!!reason && (!reason.requiresComment || comment.trim().length >= 3)));

  const submit = () =>
    batch &&
    complete.mutate(
      {
        id: batch.id,
        body: {
          goodQuantity: good ?? 0,
          rejectedQuantity: rejected ?? 0,
          ...(rejected ? { rejectReasonCode: reasonCode } : {}),
          ...(rejected && comment.trim() ? { rejectComment: comment.trim() } : {}),
        },
      },
      {
        onSuccess: (b) => {
          toast.success(
            t('output.done', {
              number: b.number,
              count: b.goodQuantity ?? 0,
              name: b.productName,
            }),
          );
          onOpenChange(false);
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    );

  const unit = (n: number) => (batch ? t(`inventory:unit.${batch.unit}`, { count: n }) : '');

  return (
    <ResponsiveDialog
      open={!!batch}
      onOpenChange={(o) => !complete.isPending && onOpenChange(o)}
      title={t('output.title', { number: batch?.number ?? '', name: batch?.productName ?? '' })}
      description={t('output.hint', { expected: batch?.expectedQuantity ?? 0 })}
      closeLabel={t('close')}
      size="md"
      footer={
        <Button
          size="pos"
          className="w-full sm:w-auto"
          disabled={!valid}
          loading={complete.isPending}
          onClick={submit}
        >
          <PackageCheckIcon /> {t('output.confirm')}
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor={ids.good} className="text-sm font-medium">
              {t('output.good')}
            </label>
            <NumberInput
              id={ids.good}
              value={good}
              min={0}
              max={100000}
              onChange={setGood}
              decrementLabel={t('output.lessGood')}
              incrementLabel={t('output.moreGood')}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor={ids.rejected} className="text-sm font-medium">
              {t('output.rejected')}
            </label>
            <NumberInput
              id={ids.rejected}
              value={rejected}
              min={0}
              max={100000}
              onChange={setRejected}
              decrementLabel={t('output.lessRejected')}
              incrementLabel={t('output.moreRejected')}
            />
          </div>
        </div>
        {!!rejected && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor={ids.reason} className="text-sm font-medium">
                {t('output.reason')}
              </label>
              <Select value={reasonCode} onValueChange={setReasonCode}>
                <SelectTrigger id={ids.reason} className="w-full">
                  <SelectValue placeholder={t('output.reasonPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {reasons.data?.map((r) => (
                    <SelectItem key={r.code} value={r.code}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor={ids.comment} className="text-sm font-medium">
                {reason?.requiresComment ? t('output.commentRequired') : t('output.comment')}
              </label>
              <Input
                id={ids.comment}
                maxLength={200}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
            </div>
          </div>
        )}
        <p className="rounded-lg bg-muted/60 px-3 py-2 text-sm" aria-live="polite">
          {t('output.preview', {
            total,
            good: good ?? 0,
            goodUnit: unit(good ?? 0),
            rejected: rejected ?? 0,
          })}
        </p>
      </div>
    </ResponsiveDialog>
  );
}
