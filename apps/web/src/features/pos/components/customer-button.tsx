import { Button, StatusBadge } from '@rbp/ui';
import { formatMoney, formatPhone } from '@rbp/utils';
import { UserRoundIcon, UserRoundPlusIcon, WalletIcon, XIcon } from 'lucide-react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { localeFor } from '@/app/i18n';
import { useCustomer } from '@/features/customers/api/queries';
import type { DraftCustomer } from '../store/cart-store';

/** Cart header: walk-in by default; tap to attach a customer (POS-003). */
export function CustomerButton({
  customer,
  onOpen,
  onRemove,
}: {
  customer: DraftCustomer | null;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const { t, i18n } = useTranslation('pos');
  const locale = localeFor(i18n.language);
  // Live balance: it may have changed since the customer was attached.
  const live = useCustomer(customer?.id);
  const owes = live.data && live.data.outstanding.amount > 0 ? live.data.outstanding : null;

  if (!customer) {
    return (
      <Button variant="outline" size="pos" className="w-full justify-start gap-3" onClick={onOpen}>
        <UserRoundPlusIcon />
        <span className="flex flex-1 items-center justify-between gap-2">
          <span className="text-muted-foreground">{t('customer.walkIn')}</span>
          <span className="text-primary">{t('customer.add')}</span>
        </span>
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        data-touch="pos"
        onClick={onOpen}
        aria-label={`${t('customer.change')}: ${customer.name}`}
        className="flex min-h-touch-pos min-w-0 flex-1 items-center gap-3 rounded-lg border border-primary/40 bg-primary/5 px-3 py-1.5 text-left focus-ring hover:bg-primary/10"
      >
        <UserRoundIcon className="size-5 shrink-0 text-primary" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{customer.name}</span>
          <span className="block text-xs text-muted-foreground tabular">
            {customer.phone ? formatPhone(customer.phone) : ''}
          </span>
        </span>
        {owes && (
          <StatusBadge tone="warning" size="sm">
            {t('customer.owes', { amount: formatMoney(owes, locale) })}
          </StatusBadge>
        )}
      </button>
      {owes && (
        <Button variant="ghost" size="icon" className="size-touch-pos" asChild>
          <Link
            to={`/customers/${customer.id}/balance`}
            aria-label={t('customer.viewBalance', { name: customer.name })}
          >
            <WalletIcon />
          </Link>
        </Button>
      )}
      <Button
        variant="ghost"
        size="icon"
        className="size-touch-pos"
        onClick={onRemove}
        aria-label={t('customer.remove', { name: customer.name })}
      >
        <XIcon />
      </Button>
    </div>
  );
}
