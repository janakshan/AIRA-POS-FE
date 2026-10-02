import { ReasonDialog } from '@rbp/ui';
import { ArrowRightIcon, ShieldCheckIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useReasons } from '@/features/audit/api/queries';
import { useReasonPromptStore } from '../store/reason-prompt-store';

/**
 * POS-007 Reason. Mounted once; driven by useSensitiveAction(). Offers only the reasons
 * configured for the action and shows who approved it and what is changing.
 */
export function ReasonPromptDialog() {
  const { t } = useTranslation();
  const prompt = useReasonPromptStore((s) => s.prompt);
  const close = useReasonPromptStore((s) => s.close);
  const reasons = useReasons(prompt?.action);

  const finish = (result: Parameters<NonNullable<typeof prompt>['resolve']>[0]) => {
    prompt?.resolve(result);
    close();
  };

  const description = prompt && (
    <span className="block space-y-1.5">
      {prompt.description && <span className="block">{prompt.description}</span>}
      {(prompt.summary || prompt.change) && (
        <span className="block rounded-md bg-muted px-2.5 py-1.5 text-foreground">
          {prompt.summary && <span className="block font-medium">{prompt.summary}</span>}
          {prompt.change && (
            <span className="flex items-center gap-1.5 tabular">
              <s className="text-muted-foreground">{prompt.change.before}</s>
              <ArrowRightIcon className="size-3.5" aria-label="→" />
              <span className="font-semibold">{prompt.change.after}</span>
            </span>
          )}
        </span>
      )}
      {prompt.approvedBy && (
        <span className="flex items-center gap-1.5 text-status-success-fg">
          <ShieldCheckIcon className="size-4" aria-hidden />
          {t('reason.approvedBy', { name: prompt.approvedBy })}
        </span>
      )}
    </span>
  );

  return (
    <ReasonDialog
      open={!!prompt}
      onOpenChange={(open) => !open && finish(null)}
      title={prompt?.title ?? ''}
      description={description}
      reasons={reasons.data ?? []}
      onSubmit={finish}
      submitLabel={t('actions.confirm')}
      cancelLabel={t('actions.cancel')}
      commentLabel={t('reason.comment')}
      translate={(key) => t(key)}
      loading={reasons.isPending}
    />
  );
}
