import {
  Button,
  CartLine,
  CategoryRail,
  NumericKeypad,
  PaymentMethodButton,
  PosActionBar,
  ProductTile,
  QuantityStepper,
  TotalsPanel,
  toast,
} from '@rbp/ui';
import {
  addMoney,
  formatMoney,
  multiplyMoney,
  parseMoney,
  percentOf,
  subtractMoney,
  sumMoney,
} from '@rbp/utils';
import {
  BanknoteIcon,
  CreditCardIcon,
  HandCoinsIcon,
  LockKeyholeIcon,
  PauseIcon,
  PercentIcon,
  QrCodeIcon,
  StickyNoteIcon,
  UserRoundIcon,
  XCircleIcon,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { localeFor } from '@/app/i18n';
import { useEmployeeVerification } from '@/features/auth/hooks/use-employee-verification';
import { DS_CATEGORIES, DS_CATEGORIES_WITH_COUNT, DS_PRODUCTS } from '../fixtures';
import { DsSection, Example } from './section';

type Method = 'cash' | 'card' | 'qr' | 'credit';

export function PosSection() {
  const { t, i18n } = useTranslation('designSystem');
  const locale = localeFor(i18n.language);
  const verify = useEmployeeVerification();
  const [category, setCategory] = useState(DS_CATEGORIES[0]?.id ?? '');
  const [cart, setCart] = useState<Record<string, number>>({ p1: 2, p9: 3 });
  const [selectedLine, setSelectedLine] = useState<string | null>(null);
  const [tendered, setTendered] = useState('');
  const [method, setMethod] = useState<Method>('cash');

  const lines = Object.entries(cart).flatMap(([id, qty]) => {
    const product = DS_PRODUCTS.find((p) => p.id === id);
    return product && qty > 0 ? [{ product, qty, total: multiplyMoney(product.price, qty) }] : [];
  });

  const totals = useMemo(() => {
    const subtotal = sumMoney(
      lines.map((l) => l.total),
      'LKR',
    );
    const discount = percentOf(subtotal, 1000);
    const afterDiscount = subtractMoney(subtotal, discount);
    const service = percentOf(afterDiscount, 1000);
    return { subtotal, discount, service, total: addMoney(afterDiscount, service) };
  }, [lines]);

  const itemCount = lines.reduce((n, l) => n + l.qty, 0);
  const setQty = (id: string, qty: number) => setCart((c) => ({ ...c, [id]: qty }));

  const tenderedMoney = (() => {
    try {
      return tendered ? parseMoney(tendered, 'LKR') : null;
    } catch {
      return null;
    }
  })();

  return (
    <DsSection id="pos" title={t('sections.pos')}>
      <p className="text-muted-foreground">{t('pos.hint')}</p>
      <div className="grid gap-stack xl:grid-cols-[minmax(0,1fr)_24rem]">
        <Example
          title={t('pos.categories')}
          className="grid gap-3 md:grid-cols-[13rem_minmax(0,1fr)]"
        >
          <CategoryRail
            label={t('pos.categories')}
            categories={DS_CATEGORIES_WITH_COUNT}
            value={category}
            onChange={setCategory}
            panelId="ds-pos-products"
          />
          <div
            id="ds-pos-products"
            role="tabpanel"
            aria-label={DS_CATEGORIES.find((c) => c.id === category)?.label}
            className="grid auto-rows-min grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] content-start gap-3"
          >
            {DS_PRODUCTS.filter((p) => p.categoryId === category).map((p) => (
              <ProductTile
                key={p.id}
                name={p.name}
                price={p.price}
                locale={locale}
                code={p.code}
                color={DS_CATEGORIES.find((c) => c.id === p.categoryId)?.color}
                stockNote={p.stockNote}
                unavailable={p.unavailable}
                unavailableLabel={t('pos.unavailable')}
                quantityInCart={cart[p.id]}
                onClick={() => setQty(p.id, (cart[p.id] ?? 0) + 1)}
                onLongPress={() => toast.info(t('pos.options', { name: p.name }))}
              />
            ))}
          </div>
        </Example>

        <Example title={t('pos.cart')} className="flex flex-col gap-3">
          {lines.length === 0 ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">
              {t('pos.emptyCart')}
            </p>
          ) : (
            <ul className="-mx-4 border-y sm:-mx-5">
              {lines.map(({ product, qty, total }) => (
                <CartLine
                  key={product.id}
                  name={product.name}
                  quantity={qty}
                  unitPrice={product.price}
                  lineTotal={total}
                  locale={locale}
                  selected={selectedLine === product.id}
                  onSelect={() => setSelectedLine((s) => (s === product.id ? null : product.id))}
                  actions={
                    <QuantityStepper
                      value={qty}
                      label={product.name}
                      onChange={(q) => setQty(product.id, q)}
                      onRemove={() => {
                        setQty(product.id, 0);
                        setSelectedLine(null);
                      }}
                      decrementLabel={t('pos.decrease')}
                      incrementLabel={t('pos.increase')}
                      removeLabel={t('pos.remove')}
                    />
                  }
                />
              ))}
            </ul>
          )}
          <TotalsPanel
            locale={locale}
            rows={[
              { id: 'subtotal', label: t('pos.subtotal'), amount: totals.subtotal },
              {
                id: 'discount',
                label: t('pos.discount'),
                amount: totals.discount,
                kind: 'discount',
              },
              { id: 'service', label: t('pos.service'), amount: totals.service, kind: 'charge' },
            ]}
            totalLabel={t('pos.total')}
            total={totals.total}
            meta={t('pos.items', { count: itemCount })}
          />
          <Button size="pos-lg" block disabled={lines.length === 0}>
            {t('pos.pay')} · {formatMoney(totals.total, locale)}
          </Button>
        </Example>
      </div>

      <div className="grid gap-stack lg:grid-cols-2">
        <Example title={t('pos.tendered')} className="space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <PaymentMethodButton
              icon={<BanknoteIcon />}
              label={t('pos.cash')}
              selected={method === 'cash'}
              onClick={() => setMethod('cash')}
            />
            <PaymentMethodButton
              icon={<CreditCardIcon />}
              label={t('pos.card')}
              selected={method === 'card'}
              onClick={() => setMethod('card')}
            />
            <PaymentMethodButton
              icon={<QrCodeIcon />}
              label={t('pos.qr')}
              selected={method === 'qr'}
              onClick={() => setMethod('qr')}
            />
            <PaymentMethodButton
              icon={<HandCoinsIcon />}
              label={t('pos.credit')}
              selected={method === 'credit'}
              onClick={() => setMethod('credit')}
            />
          </div>
          <NumericKeypad
            mode="decimal"
            value={tendered}
            onChange={setTendered}
            label={t('pos.tendered')}
            display={
              tenderedMoney
                ? formatMoney(tenderedMoney, locale)
                : formatMoney({ amount: 0, currency: 'LKR' }, locale)
            }
            presets={
              <>
                <Button
                  variant="secondary"
                  size="pos"
                  onClick={() => setTendered(String(totals.total.amount / 100))}
                >
                  {t('pos.exact')}
                </Button>
                <Button variant="secondary" size="pos" onClick={() => setTendered('1000')}>
                  1,000
                </Button>
                <Button variant="secondary" size="pos" onClick={() => setTendered('5000')}>
                  5,000
                </Button>
              </>
            }
          />
        </Example>
        <Example title={t('sections.pos')}>
          <PosActionBar
            protectedLabel={t('pos.requiresPin')}
            actions={[
              { id: 'hold', label: t('pos.hold'), icon: <PauseIcon />, onClick: () => undefined },
              {
                id: 'customer',
                label: t('pos.customer'),
                icon: <UserRoundIcon />,
                onClick: () => undefined,
              },
              {
                id: 'discount',
                label: t('pos.discountAction'),
                icon: <PercentIcon />,
                protected: true,
                onClick: () => void verify('pos.discount.apply'),
              },
              {
                id: 'note',
                label: t('pos.note'),
                icon: <StickyNoteIcon />,
                onClick: () => undefined,
              },
              {
                id: 'drawer',
                label: t('pos.drawer'),
                icon: <LockKeyholeIcon />,
                protected: true,
                onClick: () => void verify('pos.drawer.open'),
              },
              {
                id: 'void',
                label: t('pos.voidAction'),
                icon: <XCircleIcon />,
                protected: true,
                tone: 'danger',
                onClick: () => void verify('pos.order.cancel'),
              },
            ]}
          />
        </Example>
      </div>
    </DsSection>
  );
}
