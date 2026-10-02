import type { RestaurantTable } from '@rbp/types';
import { EmptyState, ResponsiveDialog, Skeleton } from '@rbp/ui';
import { ArmchairIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { QueryError } from '@/components/query-error';
import { useTables } from '../api/queries';
import { TableGrid } from './table-grid';

export interface TablesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * choose: pick a free table for this sale, or open a table's order.
   * transfer: move the saved order to a free table (REST-004).
   */
  mode: 'choose' | 'transfer';
  currentTableId: string | null;
  /** The current sale has items that aren't on a table yet (can't open another order). */
  draftBusy: boolean;
  onPickFree: (table: RestaurantTable) => void;
  onOpenOrder: (table: RestaurantTable) => void;
}

/** REST-001 inside the POS: the same floor grid as /sales/tables. */
export function TablesDialog({
  open,
  onOpenChange,
  mode,
  currentTableId,
  draftBusy,
  onPickFree,
  onOpenOrder,
}: TablesDialogProps) {
  const { t } = useTranslation('pos');
  const tables = useTables(open);

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={
        mode === 'transfer'
          ? t('tables.transferPick', {
              name: tables.data?.find((tb) => tb.id === currentTableId)?.name ?? '',
            })
          : t('tables.title')
      }
      description={mode === 'transfer' ? t('tables.transferHint') : t('tables.chooseHint')}
      closeLabel={t('closeSale')}
      size="xl"
    >
      <div data-screen-id="REST-001" className="max-h-[65dvh] overflow-y-auto">
        {tables.isError ? (
          <QueryError error={tables.error} onRetry={() => tables.refetch()} />
        ) : !tables.data ? (
          <Skeleton className="h-48" />
        ) : !tables.data.length ? (
          <EmptyState icon={ArmchairIcon} title={t('tables.none')} />
        ) : (
          <TableGrid
            tables={tables.data}
            currentTableId={currentTableId}
            isDisabled={(tb) =>
              tb.id !== currentTableId &&
              (mode === 'transfer' ? tb.status !== 'FREE' : tb.status !== 'FREE' && draftBusy)
            }
            onSelect={(tb) => {
              if (tb.id === currentTableId) onOpenChange(false);
              else if (tb.status === 'FREE') onPickFree(tb);
              else onOpenOrder(tb);
            }}
          />
        )}
        {mode === 'choose' && draftBusy && (
          <p role="status" className="mt-3 text-sm text-muted-foreground">
            {t('tables.draftBusy')}
          </p>
        )}
      </div>
    </ResponsiveDialog>
  );
}
