import { type ReasonSelection, reasonSelectionSchema } from '@rbp/validation';
import { cn } from '@rbp/utils';
import * as React from 'react';
import { Button } from '../components/button';
import { Label } from '../components/label';
import { Textarea } from '../components/textarea';
import { ResponsiveDialog } from './responsive-dialog';

export interface ReasonOption {
  code: string;
  label: string;
}

export interface ReasonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Tenant-configured reasons. Include { code: 'OTHER' } to allow free text. */
  reasons: ReasonOption[];
  onSubmit: (value: ReasonSelection) => void;
  submitLabel: React.ReactNode;
  cancelLabel: React.ReactNode;
  commentLabel: React.ReactNode;
  /** Translates validation message keys. */
  translate?: (key: string) => string;
  loading?: boolean;
}

/**
 * POS-007 mandatory reason. Large touch options; "Other" requires a comment.
 * Validation uses the shared `reasonSelectionSchema` from @rbp/validation.
 */
export function ReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  reasons,
  onSubmit,
  submitLabel,
  cancelLabel,
  commentLabel,
  translate = (k) => k,
  loading,
}: ReasonDialogProps) {
  const [reasonCode, setReasonCode] = React.useState('');
  const [comment, setComment] = React.useState('');
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const commentId = React.useId();

  // Start fresh every time the dialog opens (adjusting state during render, not in an effect).
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setReasonCode('');
      setComment('');
      setErrors({});
    }
  }

  const submit = () => {
    const parsed = reasonSelectionSchema.safeParse({ reasonCode, comment: comment || undefined });
    if (!parsed.success) {
      setErrors(
        Object.fromEntries(
          parsed.error.issues.map((i) => [String(i.path[0]), translate(i.message)]),
        ),
      );
      return;
    }
    onSubmit(parsed.data);
  };

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      footer={
        <>
          <Button
            variant="outline"
            size="lg"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            {cancelLabel}
          </Button>
          <Button size="lg" onClick={submit} loading={loading}>
            {submitLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div
          role="radiogroup"
          aria-invalid={!!errors.reasonCode}
          className="grid gap-2 sm:grid-cols-2"
        >
          {reasons.map((r) => {
            const selected = r.code === reasonCode;
            return (
              <button
                key={r.code}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => {
                  setReasonCode(r.code);
                  setErrors({});
                }}
                className={cn(
                  'min-h-touch-pos rounded-lg border bg-card px-4 text-left font-medium focus-ring transition-colors hover:bg-accent/60 active:scale-[0.99]',
                  selected && 'border-primary bg-primary/8 ring-2 ring-primary/30',
                )}
              >
                {r.label}
              </button>
            );
          })}
        </div>
        {errors.reasonCode && (
          <p role="alert" className="text-sm text-destructive">
            {errors.reasonCode}
          </p>
        )}
        <div className="grid gap-2">
          <Label htmlFor={commentId}>{commentLabel}</Label>
          <Textarea
            id={commentId}
            value={comment}
            aria-invalid={!!errors.comment}
            onChange={(e) => {
              setComment(e.target.value);
              if (errors.comment) setErrors((x) => ({ ...x, comment: '' }));
            }}
          />
          {errors.comment && (
            <p role="alert" className="text-sm text-destructive">
              {errors.comment}
            </p>
          )}
        </div>
      </div>
    </ResponsiveDialog>
  );
}
