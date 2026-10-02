import type { PaymentMethodSetting } from '@rbp/types';
import { Alert, Button, Card, CardContent, PageHeader, Skeleton, Switch, toast } from '@rbp/ui';
import { BanknoteIcon, CreditCardIcon, HandCoinsIcon, LandmarkIcon } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { QueryError } from '@/components/query-error';
import { Screen } from '@/components/screen';
import { useErrorMessage } from '@/components/use-error-message';
import { PageBreadcrumbs } from '@/navigation/page-breadcrumbs';
import { usePaymentSettings, useSavePayments } from '../api/queries';

const ICONS: Record<PaymentMethodSetting['method'], ReactNode> = {
  CASH: <BanknoteIcon className="size-5" />,
  CARD: <CreditCardIcon className="size-5" />,
  BANK_TRANSFER: <LandmarkIcon className="size-5" />,
  CREDIT: <HandCoinsIcon className="size-5" />,
};

/** SET-006 Payment methods: business-wide; cash is always on. */
export function PaymentsPage() {
  const { t } = useTranslation('settings');
  const settings = usePaymentSettings();
  const save = useSavePayments();
  const errorMessage = useErrorMessage();
  const [draft, setDraft] = useState<PaymentMethodSetting[] | null>(null);
  const methods = draft ?? settings.data;
  const dirty = !!draft && JSON.stringify(draft) !== JSON.stringify(settings.data);

  const submit = () =>
    draft &&
    save.mutate(
      { methods: draft },
      {
        onSuccess: () => {
          setDraft(null);
          toast.success(t('payments.saved'));
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    );

  return (
    <Screen id="SET-006" title={t('payments.title')} className="mx-auto max-w-3xl space-y-section">
      <PageHeader
        eyebrow={<PageBreadcrumbs />}
        title={t('payments.title')}
        description={t('payments.hint')}
      />
      {settings.isError ? (
        <Card>
          <QueryError error={settings.error} onRetry={() => void settings.refetch()} />
        </Card>
      ) : !methods ? (
        <Skeleton className="h-72 rounded-xl" />
      ) : (
        <>
          <Card>
            <CardContent className="divide-y">
              {methods.map((m) => {
                const label = t(`payments.methods.${m.method}`);
                return (
                  <label
                    key={m.method}
                    className="flex items-center gap-4 py-4 first:pt-0 last:pb-0"
                  >
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted">
                      {ICONS[m.method]}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{label}</span>
                      <span className="block text-sm text-muted-foreground">
                        {t(`payments.notes.${m.method}`)}
                      </span>
                    </span>
                    <Switch
                      checked={m.enabled}
                      disabled={m.method === 'CASH'}
                      aria-label={label}
                      onCheckedChange={(enabled) =>
                        setDraft(
                          methods.map((x) => (x.method === m.method ? { ...x, enabled } : x)),
                        )
                      }
                    />
                  </label>
                );
              })}
            </CardContent>
          </Card>
          <Alert tone="info" title={t('payments.refunds')} />
          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={!dirty} onClick={() => setDraft(null)}>
              {t('cancel')}
            </Button>
            <Button size="pos" loading={save.isPending} disabled={!dirty} onClick={submit}>
              {t('save')}
            </Button>
          </div>
        </>
      )}
    </Screen>
  );
}
