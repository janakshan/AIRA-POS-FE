import { ApiError } from '@rbp/api-client';
import {
  Button,
  Card,
  EmptyState,
  ForbiddenState,
  FormSkeleton,
  InlineError,
  LoadingState,
  TableSkeleton,
  toast,
} from '@rbp/ui';
import { PackagePlusIcon, PlusIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { QueryError } from '@/components/query-error';
import { DsSection, Example } from './section';

export function StatesSection() {
  const { t } = useTranslation('designSystem');
  const { t: tc } = useTranslation();
  return (
    <DsSection id="states" title={t('sections.states')}>
      <div className="grid gap-stack md:grid-cols-2 xl:grid-cols-4">
        <Card className="py-0">
          <EmptyState
            icon={PackagePlusIcon}
            title={t('states.emptyTitle')}
            description={t('states.emptyHint')}
            action={
              <Button>
                <PlusIcon /> {t('buttons.withIcon')}
              </Button>
            }
          />
        </Card>
        <Card className="py-0">
          <QueryError
            error={new ApiError('INTERNAL_ERROR', 'Server error', 500, { requestId: 'req_01DEMO' })}
            onRetry={() => undefined}
          />
        </Card>
        <Card className="py-0">
          <ForbiddenState title={t('states.forbidden')} description={t('states.forbiddenHint')} />
        </Card>
        <Card className="py-0">
          <LoadingState label={tc('states.loading')} className="h-full" />
        </Card>
      </div>
      <div className="grid gap-stack lg:grid-cols-2">
        <Example title={t('states.skeletons')} className="space-y-4">
          <TableSkeleton rows={3} columns={4} />
          <FormSkeleton fields={2} />
        </Example>
        <div className="flex flex-col gap-stack">
          <Example title={t('states.inline')}>
            <InlineError
              message={t('states.inlineMessage')}
              onRetry={() => undefined}
              retryLabel={tc('actions.retry')}
            />
          </Example>
          <Example title={t('states.toasts')} className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => toast.success(t('states.toastSuccessMsg'))}>
              {t('states.toastSuccess')}
            </Button>
            <Button variant="outline" onClick={() => toast.error(t('states.toastErrorMsg'))}>
              {t('states.toastError')}
            </Button>
            <Button variant="outline" onClick={() => toast.info(t('states.toastInfoMsg'))}>
              {t('states.toastInfo')}
            </Button>
          </Example>
        </div>
      </div>
    </DsSection>
  );
}
