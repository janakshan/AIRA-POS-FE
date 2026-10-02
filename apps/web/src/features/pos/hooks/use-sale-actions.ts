import type { Order } from '@rbp/types';
import { formatMoney } from '@rbp/utils';
import { toast } from '@rbp/ui';
import { useTranslation } from 'react-i18next';
import { localeFor } from '@/app/i18n';
import { useErrorMessage } from '@/components/use-error-message';
import { useSensitiveAction } from '@/features/auth/hooks/use-sensitive-action';
import { useLocalizedName } from '@/features/catalog/lib/localized-name';
import {
  usePrintBill,
  useReleaseOrder,
  useSendToKitchen,
  useTransferTable,
} from '@/features/restaurant/api/queries';
import { useDispositionPromptStore } from '../store/disposition-prompt-store';
import type { DraftTable } from '../store/cart-store';
import { useVoidAdjustment } from '../api/queries';
import { useCancelItem, useCancelOrder, useCreateOrder, useUpdateOrderLines } from '../api/orders';
import type { CartView } from './use-cart';

/**
 * Sale-level actions that reach the server: saving the draft as an order (Hold / before Pay),
 * PIN-guarded reductions on saved lines (REQ-217…232), and cancelling or discarding the sale.
 * Items not yet saved stay free to change (A-202).
 */
export function useSaleActions(cart: CartView) {
  const { t, i18n } = useTranslation('pos');
  const nameOf = useLocalizedName();
  const errorMessage = useErrorMessage();
  const confirmSensitive = useSensitiveAction();
  const createOrder = useCreateOrder();
  const updateLines = useUpdateOrderLines();
  const cancelItem = useCancelItem();
  const cancelOrder = useCancelOrder();
  const voidAdjustment = useVoidAdjustment();
  const sendKitchen = useSendToKitchen();
  const printBill = usePrintBill();
  const release = useReleaseOrder();
  const transfer = useTransferTable();
  const askDisposition = useDispositionPromptStore((s) => s.ask);

  /** Create or sync the order for this draft. */
  const saveOrder = async (status: 'OPEN' | 'HELD', holdLabel?: string): Promise<Order> => {
    const lines = cart.lines
      .filter((l) => l.product)
      .map((l) => ({
        productId: l.productId,
        quantity: l.quantity,
        ...(l.note ? { note: l.note } : {}),
      }));
    const body = {
      lines,
      customerId: cart.customer?.id ?? null,
      adjustmentIds: cart.adjustments.map((a) => a.id),
      status,
      ...(holdLabel ? { holdLabel } : {}),
      ...(cart.delivery ? { delivery: cart.delivery } : {}),
    };
    // Type and table are fixed once saved; the table moves only by transfer.
    const order = cart.order
      ? await updateLines.mutateAsync({ id: cart.order.id, body })
      : await createOrder.mutateAsync({
          ...body,
          ...(cart.orderType !== 'RETAIL' ? { type: cart.orderType } : {}),
          ...(cart.table ? { tableId: cart.table.id } : {}),
        });
    cart.linkOrder(order);
    return order;
  };

  /**
   * Take `quantity` units off a saved line with manager PIN + reason. Resolves false if the
   * employee cancels or the server refuses.
   */
  const cancelSaved = async (lineId: string, targetQuantity: number): Promise<boolean> => {
    const line = cart.lines.find((l) => l.lineId === lineId);
    const saved = line && cart.order?.saved[line.productId];
    if (!line || !saved || !cart.order) return true;
    const cancelQty = saved.quantity - Math.max(targetQuantity, 0);
    if (cancelQty <= 0) return true;
    const removing = targetQuantity <= 0;
    const name = nameOf(line.product ?? line.snapshot);
    // Unsent units go first; anything beyond them is food the kitchen already has
    // (only items with a kitchen station ever reach it).
    const sentCancelled = line.routed
      ? Math.max(0, cancelQty - (saved.quantity - (saved.sent ?? 0)))
      : 0;
    const disposition = sentCancelled > 0 ? await askDisposition(name, sentCancelled) : undefined;
    if (disposition === null) return false;
    const verification = await confirmSensitive(
      removing ? 'pos.item.remove' : 'pos.item.quantity.decrease',
      {
        reasonTitle: t(removing ? 'hold.removeTitle' : 'hold.reduceTitle', { name }),
        reasonDescription: t('hold.reduceDescription'),
        summary: `${cart.order.number} · ${name}`,
        change: { before: `×${saved.quantity}`, after: `×${Math.max(targetQuantity, 0)}` },
      },
    );
    if (!verification) return false;
    try {
      const order = await cancelItem.mutateAsync({
        id: cart.order.id,
        lineId: saved.lineId,
        body: { quantity: cancelQty, verification, ...(disposition ? { disposition } : {}) },
      });
      cart.linkOrder(order);
      return true;
    } catch (e) {
      toast.error(errorMessage(e));
      return false;
    }
  };

  const setQuantity = async (lineId: string, quantity: number) => {
    const line = cart.lines.find((l) => l.lineId === lineId);
    // INV: can't go above what's in stock.
    if (line && quantity > line.quantity && quantity > line.available) {
      const name = nameOf(line.product ?? line.snapshot);
      toast.warning(t('stock.only', { count: line.available, name }));
      if (line.quantity >= line.available) return;
      quantity = line.available;
    }
    if (await cancelSaved(lineId, quantity)) cart.setQuantity(lineId, quantity);
  };

  const remove = async (lineId: string) => {
    if (await cancelSaved(lineId, 0)) cart.remove(lineId);
  };

  /** Void draft-only adjustments (audited "Sale cleared"); attached ones go with the order. */
  const voidDraftAdjustments = async () => {
    await Promise.allSettled(
      cart.adjustments.map((a) =>
        voidAdjustment.mutateAsync({ id: a.id, body: { system: 'SALE_CLEARED' } }),
      ),
    );
  };

  /** Clear an unsaved draft, or cancel a saved order (PIN + reason). */
  const cancelSale = async (): Promise<boolean> => {
    if (!cart.order) {
      await voidDraftAdjustments();
      cart.clear();
      return true;
    }
    const number = cart.order.number;
    // A-230: food the kitchen already has needs a disposition first, as for a single item.
    const inKitchen = cart.lines.reduce((s, l) => s + (l.routed ? l.sent : 0), 0);
    const disposition =
      inKitchen > 0 ? await askDisposition(number, inKitchen, 'order') : undefined;
    if (disposition === null) return false;
    const verification = await confirmSensitive('pos.order.cancel', {
      reasonTitle: t('cancelSale.title', { number }),
      reasonDescription: t('cancelSale.description'),
      summary: t('orderNumber', { number }),
    });
    if (!verification) return false;
    try {
      await cancelOrder.mutateAsync({
        id: cart.order.id,
        body: { verification, ...(disposition ? { disposition } : {}) },
      });
      // Adjustments added after resume weren't attached yet.
      await voidDraftAdjustments();
      cart.clear();
      toast.success(t('cancelSale.done', { number }));
      return true;
    } catch (e) {
      toast.error(errorMessage(e));
      return false;
    }
  };

  /** Save the order and send what's new to the kitchen: one KOT per station (REQ-379…395). */
  const sendToKitchen = async (): Promise<boolean> => {
    try {
      const order = await saveOrder('OPEN');
      const { order: sent, kots } = await sendKitchen.mutateAsync(order.id);
      cart.linkOrder(sent);
      const items = cart.unsent;
      toast.success(
        kots.length
          ? t('kitchen.sent', {
              count: items,
              tickets: kots.map((k) => `${k.number} · ${k.stationName}`).join(', '),
            })
          : t('kitchen.sentNoTicket', { count: items }),
      );
      return true;
    } catch (e) {
      toast.error(errorMessage(e));
      return false;
    }
  };

  /** REST-007 table bill before payment; resolves the order to preview. */
  const bill = async (): Promise<Order | null> => {
    try {
      const order = await saveOrder('OPEN');
      const billed = await printBill.mutateAsync(order.id);
      toast.success(
        t('kitchen.billPrinted', {
          table: billed.table?.name ?? billed.number,
          amount: formatMoney(billed.totals.total, localeFor(i18n.language)),
        }),
      );
      return billed;
    } catch (e) {
      toast.error(errorMessage(e));
      return null;
    }
  };

  /** The waiter moves on: the order stays open on the table, this terminal is free. */
  const leaveTable = async (): Promise<boolean> => {
    try {
      const order = await saveOrder('OPEN');
      await release.mutateAsync(order.id);
      cart.clear();
      toast.success(t('tables.left', { table: order.table?.name ?? order.number }));
      return true;
    } catch (e) {
      toast.error(errorMessage(e));
      return false;
    }
  };

  /** REST-004: move the saved order to another free table (PIN + reason). */
  const transferTable = async (to: DraftTable): Promise<boolean> => {
    if (!cart.order || !cart.table) {
      cart.setTable(to);
      return true;
    }
    const from = cart.table;
    const verification = await confirmSensitive('restaurant.table.transfer', {
      reasonTitle: t('tables.transferTitle', { from: from.name, to: to.name }),
      reasonDescription: t('tables.transferDescription'),
      summary: `${cart.order.number} · ${from.name} → ${to.name}`,
      change: { before: from.name, after: to.name },
    });
    if (!verification) return false;
    try {
      await saveOrder('OPEN');
      await transfer.mutateAsync({
        tableId: from.id,
        body: { toTableId: to.id, verification },
      });
      cart.setTable(to);
      toast.success(t('tables.transferred', { from: from.name, to: to.name }));
      return true;
    } catch (e) {
      toast.error(errorMessage(e));
      return false;
    }
  };

  return {
    saveOrder,
    sendToKitchen,
    bill,
    leaveTable,
    transferTable,
    setQuantity,
    remove,
    cancelSale,
    saving: createOrder.isPending || updateLines.isPending,
    restaurantBusy:
      sendKitchen.isPending || printBill.isPending || release.isPending || transfer.isPending,
  };
}
