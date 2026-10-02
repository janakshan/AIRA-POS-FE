import type { Order } from '@rbp/types';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  MoneyText,
  Skeleton,
  StatCard,
} from '@rbp/ui';
import { formatDate, formatMoney } from '@rbp/utils';
import { ReceiptTextIcon, WalletIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { localeFor } from '@/app/i18n';
import { Screen } from '@/components/screen';
import { EntityHistory } from '@/features/audit/components/entity-history';
import { useCustomerOrders } from '../api/queries';
import { OrderDetailDialog } from '../components/order-detail-dialog';
import { OrderRow } from '../components/order-row';
import { useCanReceivePayment } from '../lib/use-can-receive-payment';
import { ReceivePaymentDialog } from '../components/receive-payment-dialog';
import { useCustomerContext } from '../lib/customer-context';

/** CUS-003 Customer detail: what they buy, what they owe, recent orders. */
export function CustomerOverviewPage() {
  const { customer } = useCustomerContext();
  const { t, i18n } = useTranslation('customers');
  const locale = localeFor(i18n.language);
  const recent = useCustomerOrders(customer.id, { pageSize: 5 });
  const [open, setOpen] = useState<Order | null>(null);
  const [paying, setPaying] = useState(false);
  const canReceive = useCanReceivePayment();
  const { stats } = customer;
  const owes = customer.outstanding.amount > 0;

  return (
    <Screen id="CUS-003" title={customer.name} className="space-y-section">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t('detail.orders')} value={String(stats.orderCount)} />
        <StatCard
          label={t('detail.totalSpent')}
          value={<MoneyText value={stats.totalSpent} locale={locale} />}
          hint={
            stats.orderCount
              ? t('detail.average', { amount: formatMoney(stats.averageOrder, locale) })
              : undefined
          }
        />
        <StatCard
          label={t('detail.lastOrder')}
          value={stats.lastOrderAt ? formatDate(stats.lastOrderAt, { locale }) : t('list.never')}
        />
        <StatCard
          label={t('fields.outstanding')}
          icon={WalletIcon}
          value={
            <MoneyText
              value={customer.outstanding}
              locale={locale}
              className={owes ? 'text-status-warning-fg' : undefined}
            />
          }
          hint={
            owes && canReceive ? (
              <Button size="sm" variant="outline" className="mt-1" onClick={() => setPaying(true)}>
                {t('balance.receive')}
              </Button>
            ) : undefined
          }
        />
      </div>
      <div className="grid items-start gap-section xl:grid-cols-[minmax(0,1fr)_20rem]">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>{t('detail.recentOrders')}</CardTitle>
            {stats.orderCount > 5 && (
              <Button asChild variant="link" className="h-auto px-0">
                <Link to="orders">{t('detail.allOrders', { count: stats.orderCount })}</Link>
              </Button>
            )}
          </CardHeader>
          <CardContent className="px-0">
            {!recent.data ? (
              <Skeleton className="mx-4 h-32" />
            ) : !recent.data.items.length ? (
              <EmptyState icon={ReceiptTextIcon} title={t('orders.empty')} />
            ) : (
              <ul className="divide-y border-y">
                {recent.data.items.map((o) => (
                  <OrderRow key={o.id} order={o} onOpen={() => setOpen(o)} />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <EntityHistory entity="customer" entityId={customer.id} />
      </div>
      <OrderDetailDialog order={open} onOpenChange={(o) => !o && setOpen(null)} />
      <ReceivePaymentDialog customer={customer} open={paying} onOpenChange={setPaying} />
    </Screen>
  );
}
