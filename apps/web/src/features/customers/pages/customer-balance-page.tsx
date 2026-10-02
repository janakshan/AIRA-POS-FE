import type { CustomerLedgerEntry, CustomerLedgerKind } from '@rbp/types';
import {
  Button,
  Card,
  DataTable,
  type DataTableColumn,
  EmptyState,
  MoneyText,
  StatusBadge,
  type StatusTone,
} from '@rbp/ui';
import { formatDateTime } from '@rbp/utils';
import { HandCoinsIcon, WalletIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { localeFor } from '@/app/i18n';
import { QueryError } from '@/components/query-error';
import { Screen } from '@/components/screen';
import { useCustomerLedger } from '../api/queries';
import { ReceivePaymentDialog } from '../components/receive-payment-dialog';
import { useCanReceivePayment } from '../lib/use-can-receive-payment';
import { useLocationName } from '../lib/use-location-name';
import { useCustomerContext } from '../lib/customer-context';

const KIND_TONE: Record<CustomerLedgerKind, StatusTone> = {
  OPENING: 'neutral',
  CREDIT_SALE: 'warning',
  RETURN: 'info',
  VOID: 'danger',
  PAYMENT: 'success',
};

/** CUS-005 Outstanding balance: statement with running balance, receive a payment. */
export function CustomerBalancePage() {
  const { customer } = useCustomerContext();
  const { t, i18n } = useTranslation('customers');
  const locale = localeFor(i18n.language);
  const ledger = useCustomerLedger(customer.id);
  const locationName = useLocationName();
  const canReceive = useCanReceivePayment();
  const [paying, setPaying] = useState(false);
  const owes = customer.outstanding.amount > 0;
  // Newest first on screen; the running balance was computed oldest first.
  const rows = ledger.data ? [...ledger.data].reverse() : undefined;

  const columns: DataTableColumn<CustomerLedgerEntry>[] = [
    {
      id: 'date',
      header: t('balance.date'),
      width: 'w-44',
      cell: (e) => formatDateTime(e.at, { locale }),
    },
    {
      id: 'entry',
      header: t('balance.entry'),
      primary: true,
      cell: (e) => (
        <span className="flex flex-wrap items-center gap-2">
          <StatusBadge tone={KIND_TONE[e.kind]} size="sm" hideIcon>
            {t(`balance.kind.${e.kind}`)}
          </StatusBadge>
          <span className="font-medium">
            {e.kind === 'OPENING' ? t('balance.broughtForward') : e.reference}
          </span>
          {(e.locationId || e.by) && (
            <span className="text-xs text-muted-foreground">
              {[locationName(e.locationId), e.by].filter(Boolean).join(' · ')}
            </span>
          )}
        </span>
      ),
    },
    {
      id: 'amount',
      header: t('balance.amountCol'),
      align: 'right',
      width: 'w-36',
      cell: (e) => (
        <MoneyText
          value={e.amount}
          locale={locale}
          className={e.amount.amount < 0 ? 'text-status-success-fg' : undefined}
        />
      ),
    },
    {
      id: 'balance',
      header: t('balance.balanceCol'),
      align: 'right',
      width: 'w-36',
      cell: (e) => <MoneyText value={e.balance} locale={locale} className="font-semibold" />,
    },
  ];

  return (
    <Screen
      id="CUS-005"
      title={t('balance.title', { name: customer.name })}
      className="space-y-section"
    >
      <Card className="flex flex-wrap items-center gap-4 p-5">
        <WalletIcon className="size-8 text-muted-foreground" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-muted-foreground">{t('balance.current')}</p>
          <p
            className={
              owes
                ? 'text-3xl font-bold text-status-warning-fg tabular'
                : 'text-3xl font-bold tabular'
            }
          >
            <MoneyText value={customer.outstanding} locale={locale} />
          </p>
          {!owes && <p className="text-sm text-muted-foreground">{t('balance.settled')}</p>}
        </div>
        {owes && canReceive && (
          <Button size="pos" onClick={() => setPaying(true)}>
            <HandCoinsIcon /> {t('balance.receive')}
          </Button>
        )}
      </Card>
      <Card className="p-0">
        <DataTable
          caption={t('balance.caption')}
          columns={columns}
          rows={rows}
          getRowId={(e) => e.id}
          getRowLabel={(e) => `${t(`balance.kind.${e.kind}`)} ${e.reference}`}
          loading={ledger.isPending}
          error={
            ledger.isError ? (
              <QueryError error={ledger.error} onRetry={() => ledger.refetch()} />
            ) : undefined
          }
          empty={<EmptyState icon={WalletIcon} title={t('balance.empty')} />}
        />
      </Card>
      <ReceivePaymentDialog customer={customer} open={paying} onOpenChange={setPaying} />
    </Screen>
  );
}
