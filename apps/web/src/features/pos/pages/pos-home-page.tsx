import type { LocationProduct, RestaurantTable } from '@rbp/types';
import { useSearchParams } from 'react-router';
import { TablesDialog } from '@/features/restaurant/components/tables-dialog';
import { useResumeOrder } from '../api/orders';
import { useChargeTypes, useCreateAdjustment } from '../api/queries';
import { DeliveryDialog } from '../components/delivery-dialog';
import { DispositionDialog } from '../components/disposition-dialog';
import { NoteDialog } from '../components/note-dialog';
import { Button, Sheet, SheetContent, SheetTitle, toast } from '@rbp/ui';
import { HistoryIcon, PauseCircleIcon } from 'lucide-react';
import { useErrorMessage } from '@/components/use-error-message';
import { useOrders } from '../api/orders';
import { HeldSalesDialog } from '../components/held-sales-dialog';
import { HoldDialog } from '../components/hold-dialog';
import { PaymentDialog } from '../components/payment-dialog';
import { ReceiptDialog, type ReceiptTarget } from '../components/receipt-dialog';
import { ReturnDialog } from '../components/return-dialog';
import { SalesHistoryDialog } from '../components/sales-history-dialog';
import { useSaleActions } from '../hooks/use-sale-actions';
import { formatMoney } from '@rbp/utils';
import { localeFor } from '@/app/i18n';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Screen } from '@/components/screen';
import { useLocationProducts } from '@/features/catalog/api/queries';
import { sellableQty } from '@/features/catalog/lib/stock';
import { useLocalizedName } from '@/features/catalog/lib/localized-name';
import { useMediaQuery } from '@/lib/use-media-query';
import { CartBar } from '../components/cart-bar';
import { CartPanel } from '../components/cart-panel';
import { ProductSearch } from '../components/product-search';
import { ChargeDialog } from '../components/charge-dialog';
import { CustomerSelectorDialog } from '../components/customer-selector-dialog';
import { DiscountDialog } from '../components/discount-dialog';
import { ProductSearchDialog } from '../components/product-search-dialog';
import { PriceDialog } from '../components/price-dialog';
import { QuantityDialog } from '../components/quantity-dialog';
import { QuickPad } from '../components/quick-pad';
import { SearchResults } from '../components/search-results';
import { useBarcodeScanner } from '../hooks/use-barcode-scanner';
import { useCart } from '../hooks/use-cart';
import { useMe } from '@/features/auth/api/queries';
import { useAccess } from '@/features/auth/hooks/use-access';
import { StaffMealDialog } from '@/features/staff/components/staff-meal-dialog';
import { findByCode, matchProducts, parseQuantityPrefix } from '../lib/match-products';

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  !!target.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]');

/**
 * POS-001 Retail POS / REST-002 Restaurant POS (mode follows the location, see isRestaurantPos):
 * Quick Pad / search / scan → cart with persistent totals.
 */
export function PosHomePage() {
  const { t, i18n } = useTranslation('pos');
  const nameOf = useLocalizedName();
  const cart = useCart();
  const products = useLocationProducts();
  const wide = useMediaQuery('(min-width: 1024px)');
  const [query, setQuery] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchSeed, setSearchSeed] = useState('');
  const [customerOpen, setCustomerOpen] = useState(false);
  /** undefined = closed, null = whole bill, string = that item. */
  const [discountTarget, setDiscountTarget] = useState<string | null | undefined>(undefined);
  const [chargesOpen, setChargesOpen] = useState(false);
  const [priceLineId, setPriceLineId] = useState<string | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [holdOpen, setHoldOpen] = useState(false);
  const [mealOpen, setMealOpen] = useState(false);
  const { data: me } = useMe();
  const { hasFeature } = useAccess();
  const [heldOpen, setHeldOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [receipt, setReceipt] = useState<(ReceiptTarget & { afterSale?: boolean }) | null>(null);
  const [returnOrderId, setReturnOrderId] = useState<string | null>(null);
  const sale = useSaleActions(cart);
  const errorMessage = useErrorMessage();
  const chargeTypes = useChargeTypes();
  const createCharge = useCreateAdjustment();
  /** A-278: a delivery carries the location's default delivery charge (no PIN, like tapping it in Charges). */
  const addDeliveryCharge = () => {
    const type = chargeTypes.data?.find((c) => c.code === 'DELIVERY');
    if (!type || type.defaultValue === null) return;
    if (cart.adjustments.some((a) => a.kind === 'CHARGE' && a.chargeCode === 'DELIVERY')) return;
    createCharge.mutate(
      {
        kind: 'CHARGE',
        scope: 'ORDER',
        chargeCode: type.code,
        mode: type.mode,
        value: type.defaultValue,
      },
      {
        onSuccess: (adjustment) => {
          cart.addAdjustment(adjustment);
          toast.success(t('charge.added', { label: adjustment.label }));
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    );
  };
  const heldCount = useOrders({ status: 'HELD', pageSize: 1 }).data?.total ?? 0;
  const [tablesMode, setTablesMode] = useState<'choose' | 'transfer' | null>(null);
  const [deliveryOpen, setDeliveryOpen] = useState(false);
  const [noteLineId, setNoteLineId] = useState<string | null>(null);
  const resume = useResumeOrder();
  const draftBusy = cart.lines.length > 0 || !!cart.order;

  /** Continue a table's open order on this terminal (REST-001 → REST-002). */
  const openTableOrder = (orderId: string) =>
    resume.mutate(orderId, {
      onSuccess: (order) => {
        cart.loadOrder(order);
        setTablesMode(null);
        toast.success(t('tables.opened', { table: order.table?.name ?? order.number }));
      },
      onError: (e) => toast.error(errorMessage(e)),
    });

  const pickTable = async (table: RestaurantTable) => {
    const target = { id: table.id, name: table.name };
    if (tablesMode === 'transfer') {
      if (await sale.transferTable(target)) setTablesMode(null);
      return;
    }
    cart.setOrderType('DINE_IN', target);
    setTablesMode(null);
  };

  // Arriving from the Tables page: /pos?table=<free table> or /pos?order=<table's order>.
  const [params, setParams] = useSearchParams();
  const tableParam = params.get('table');
  const orderParam = params.get('order');
  useEffect(() => {
    if (!cart.key || (!tableParam && !orderParam)) return;
    setParams({}, { replace: true });
    if (draftBusy) {
      toast.warning(t('tables.draftBusy'));
    } else if (orderParam) {
      openTableOrder(orderParam);
    } else if (tableParam) {
      cart.setOrderType('DINE_IN', {
        id: tableParam,
        name: params.get('name') ?? tableParam,
      });
    }
    // Run once per arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart.key, tableParam, orderParam]);

  const hold = async (label: string) => {
    try {
      const order = await sale.saveOrder('HELD', label || undefined);
      cart.clear();
      setHoldOpen(false);
      toast.success(t('hold.held', { number: order.number }));
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  const [announcement, setAnnouncement] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  const add = (
    product: LocationProduct,
    source: 'tap' | 'scan' | 'search' = 'tap',
    quantity = 1,
  ): boolean => {
    const name = nameOf(product);
    if (!product.isAvailable) {
      toast.warning(t('itemUnavailable', { name }));
      return false;
    }
    // INV: never more than is in stock (at 0 it can't be sold).
    const available = sellableQty(product);
    const inCart = cart.quantities[product.productId] ?? 0;
    if (inCart + quantity > available) {
      toast.warning(
        available <= 0 ? t('stock.out', { name }) : t('stock.only', { count: available, name }),
      );
      if (inCart >= available) return false;
      quantity = available - inCart;
    }
    cart.add(product, quantity);
    setAnnouncement(t('added', { name }));
    if (source === 'scan') toast.success(t('added', { name }), { duration: 1500 });
    return true;
  };

  const openSearch = (seed = '') => {
    setSearchSeed(seed);
    setSearchOpen(true);
  };

  // Inline search: names (English + translated), codes and barcodes of what's sold here.
  const { quantity: inlineQuantity, term } = parseQuantityPrefix(query);
  const results = useMemo(
    () => (term ? matchProducts(products.data ?? [], term, i18n.language) : null),
    [term, products.data, i18n.language],
  );

  // Enter: exact code/barcode or the only match is added; otherwise open POS-002 with the query.
  const submitSearch = () => {
    if (!term) return;
    const match =
      findByCode(products.data ?? [], term) ?? (results?.length === 1 ? results[0] : undefined);
    if (match) {
      add(match, 'search', inlineQuantity);
      setQuery('');
    } else if (results && results.length > 1) {
      openSearch(query);
      setQuery('');
    }
  };

  const editing = cart.lines.find((l) => l.lineId === editingLineId);
  const dialogOpen =
    !!editing ||
    payOpen ||
    holdOpen ||
    heldOpen ||
    historyOpen ||
    !!receipt ||
    !!returnOrderId ||
    searchOpen ||
    customerOpen ||
    discountTarget !== undefined ||
    chargesOpen ||
    !!priceLineId ||
    !!tablesMode ||
    deliveryOpen ||
    !!noteLineId;

  useBarcodeScanner((code) => {
    const product = findByCode(products.data ?? [], code);
    if (product) add(product, 'scan');
    else toast.error(t('barcodeNotFound', { code }));
  }, !dialogOpen);

  // Keyboard: F2 → POS-002, / → inline search; + / − / Delete / ↑ ↓ act on the selected line.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (dialogOpen) return;
      if (e.key === 'F2') {
        e.preventDefault();
        openSearch(query);
        setQuery('');
        return;
      }
      if (e.key === '/' && !isTyping(e.target)) {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (isTyping(e.target)) return;
      const index = cart.lines.findIndex((l) => l.lineId === cart.selectedId);
      const selected = cart.lines[index];
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (!cart.lines.length) return;
        e.preventDefault();
        const next =
          index < 0
            ? e.key === 'ArrowDown'
              ? 0
              : cart.lines.length - 1
            : Math.max(
                0,
                Math.min(cart.lines.length - 1, index + (e.key === 'ArrowDown' ? 1 : -1)),
              );
        cart.select(cart.lines[next]?.lineId ?? null);
        return;
      }
      if (!selected) return;
      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        void sale.setQuantity(selected.lineId, selected.quantity + 1);
      } else if (e.key === '-') {
        e.preventDefault();
        if (selected.quantity > 1) void sale.setQuantity(selected.lineId, selected.quantity - 1);
      } else if (e.key === 'Delete') {
        e.preventDefault();
        void sale.remove(selected.lineId);
        setAnnouncement(t('removed', { name: nameOf(selected.product ?? selected.snapshot) }));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const panel = (headingId: string, inSheet = false) => (
    <CartPanel
      cart={cart}
      headingId={headingId}
      inSheet={inSheet}
      onEditQuantity={setEditingLineId}
      onOpenCustomer={() => setCustomerOpen(true)}
      onOpenDiscount={setDiscountTarget}
      onOpenCharges={() => setChargesOpen(true)}
      onChangePrice={setPriceLineId}
      sale={sale}
      onPay={() => setPayOpen(true)}
      onHold={() => setHoldOpen(true)}
      onStaffMeal={() => setMealOpen(true)}
      onChooseTable={() => setTablesMode('choose')}
      onTransfer={() => setTablesMode('transfer')}
      onEditDelivery={() => setDeliveryOpen(true)}
      onEditNote={setNoteLineId}
      onBill={() => void sale.bill().then((order) => order && setReceipt({ orderId: order.id }))}
    />
  );
  const noteLine = cart.lines.find((l) => l.lineId === noteLineId);
  const title = t(cart.restaurant ? 'nav:items.restaurantPos' : 'nav:items.retailPos');

  return (
    <Screen
      id={cart.restaurant ? 'REST-002' : 'POS-001'}
      title={title}
      className="flex h-full flex-col lg:flex-row"
    >
      <h1 className="sr-only">{title}</h1>
      <section aria-label={title} className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-3">
        <ProductSearch
          value={query}
          onChange={setQuery}
          onSubmit={submitSearch}
          inputRef={searchRef}
          onOpenFull={() => {
            openSearch(query);
            setQuery('');
          }}
          actions={
            <>
              <Button
                variant="outline"
                size="pos"
                className="relative shrink-0"
                onClick={() => setHeldOpen(true)}
                aria-label={`${t('hold.heldTitle')} (${heldCount})`}
              >
                <PauseCircleIcon />
                <span className="hidden xl:inline">{t('hold.heldSales')}</span>
                {heldCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 flex min-w-5 items-center justify-center rounded-full bg-primary px-1 text-xs font-bold text-primary-foreground tabular">
                    {heldCount}
                  </span>
                )}
              </Button>
              <Button
                variant="outline"
                size="pos"
                className="shrink-0"
                onClick={() => setHistoryOpen(true)}
                aria-label={t('history.title')}
              >
                <HistoryIcon />
                <span className="hidden xl:inline">{t('history.button')}</span>
              </Button>
            </>
          }
        />
        {results && (
          <SearchResults
            query={term}
            results={results}
            quantities={cart.quantities}
            onAdd={(p) => {
              if (add(p, 'search', inlineQuantity)) setQuery('');
            }}
          />
        )}
        {/* Stay mounted while searching so the category the cashier was in is kept. */}
        <div hidden={!!results}>
          <QuickPad
            cart={cart.quantities}
            onAdd={(productId) => {
              const product = products.data?.find((p) => p.productId === productId);
              if (product) add(product);
            }}
          />
        </div>
      </section>

      {wide ? (
        <aside
          aria-labelledby="pos-sale-heading"
          className="flex min-h-0 w-96 shrink-0 flex-col border-l bg-card"
        >
          {panel('pos-sale-heading')}
        </aside>
      ) : (
        <>
          <CartBar cart={cart} onOpen={() => setSheetOpen(true)} />
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetContent
              side="bottom"
              closeLabel={t('closeSale')}
              className="flex h-[88dvh] flex-col gap-0 p-0"
              aria-describedby={undefined}
            >
              <SheetTitle className="sr-only">{t('sale')}</SheetTitle>
              {panel('pos-sale-sheet-heading', true)}
            </SheetContent>
          </Sheet>
        </>
      )}

      <ProductSearchDialog
        open={searchOpen}
        onOpenChange={setSearchOpen}
        initialQuery={searchSeed}
        quantities={cart.quantities}
        onAdd={(product, quantity) => add(product, 'search', quantity)}
        saleSummary={
          cart.totals
            ? `${t('items', { count: cart.totals.itemCount })} · ${formatMoney(cart.totals.total, localeFor(i18n.language))}`
            : ''
        }
      />
      <CustomerSelectorDialog
        open={customerOpen}
        onOpenChange={setCustomerOpen}
        onSelect={cart.setCustomer}
      />
      <DiscountDialog
        open={discountTarget !== undefined}
        onOpenChange={(open) => !open && setDiscountTarget(undefined)}
        cart={cart}
        productId={discountTarget ?? null}
      />
      <ChargeDialog open={chargesOpen} onOpenChange={setChargesOpen} cart={cart} />
      <PriceDialog
        line={cart.lines.find((l) => l.lineId === priceLineId)}
        cart={cart}
        onOpenChange={(open) => !open && setPriceLineId(null)}
      />
      <PaymentDialog
        open={payOpen}
        onOpenChange={setPayOpen}
        cart={cart}
        sale={sale}
        onPaid={(order) => {
          setPayOpen(false);
          cart.clear();
          setSheetOpen(false);
          setReceipt({ orderId: order.id, afterSale: true });
        }}
      />
      <ReceiptDialog
        target={receipt}
        onOpenChange={(open) => !open && setReceipt(null)}
        {...(receipt?.afterSale
          ? {
              onNewSale: () => {
                setReceipt(null);
                searchRef.current?.focus();
              },
            }
          : {})}
      />
      {hasFeature('HR') && (
        <StaffMealDialog
          open={mealOpen}
          onOpenChange={setMealOpen}
          locationId={me?.currentLocation?.id ?? ''}
          source="POS"
          lines={cart.lines.map((l) => ({
            productId: l.productId,
            name: l.product?.name ?? l.snapshot.name,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
          }))}
          onDone={() => cart.clear()}
        />
      )}
      <HoldDialog
        open={holdOpen}
        onOpenChange={setHoldOpen}
        defaultLabel={cart.customer?.name ?? ''}
        onHold={(label) => void hold(label)}
        busy={sale.saving}
      />
      <HeldSalesDialog
        open={heldOpen}
        onOpenChange={setHeldOpen}
        draftEmpty={cart.lines.length === 0 && !cart.order}
        onResumed={(order) => cart.loadOrder(order)}
      />
      <SalesHistoryDialog
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        onReceipt={(orderId) => setReceipt({ orderId })}
        onReturn={(orderId) => {
          setHistoryOpen(false);
          setReturnOrderId(orderId);
        }}
      />
      <ReturnDialog
        orderId={returnOrderId}
        onOpenChange={(open) => !open && setReturnOrderId(null)}
        onDone={(order, returnId) => {
          setReturnOrderId(null);
          setReceipt({ orderId: order.id, returnId });
        }}
      />
      <QuantityDialog
        open={!!editing}
        onOpenChange={(open) => !open && setEditingLineId(null)}
        name={editing ? nameOf(editing.product ?? editing.snapshot) : ''}
        quantity={editing?.quantity ?? 1}
        onConfirm={(q) => editing && void sale.setQuantity(editing.lineId, q)}
      />
      {cart.restaurant && (
        <>
          <TablesDialog
            open={!!tablesMode}
            onOpenChange={(open) => !open && setTablesMode(null)}
            mode={tablesMode ?? 'choose'}
            currentTableId={cart.table?.id ?? null}
            draftBusy={draftBusy}
            onPickFree={(table) => void pickTable(table)}
            onOpenOrder={(table) => table.order && openTableOrder(table.order.id)}
          />
          <DeliveryDialog
            open={deliveryOpen}
            onOpenChange={setDeliveryOpen}
            initial={cart.delivery ?? (cart.customer?.phone ? { phone: cart.customer.phone } : {})}
            onSave={(delivery, customer) => {
              cart.setDelivery(delivery);
              addDeliveryCharge();
              // Found by phone: the delivery is for them (keeps a customer already chosen).
              if (customer && cart.customer?.id !== customer.id) cart.setCustomer(customer);
              setDeliveryOpen(false);
            }}
          />
          <NoteDialog
            open={!!noteLine}
            onOpenChange={(open) => !open && setNoteLineId(null)}
            name={noteLine ? nameOf(noteLine.product ?? noteLine.snapshot) : ''}
            note={noteLine?.note ?? ''}
            onSave={(note) => {
              if (noteLine) cart.setNote(noteLine.lineId, note);
              setNoteLineId(null);
            }}
          />
          <DispositionDialog />
        </>
      )}
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
    </Screen>
  );
}
