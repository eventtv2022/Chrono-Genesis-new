import { useMemo, useState } from "react";
import { Layout } from "@/components/Layout";
import { ShoppingBag, Clock3, CreditCard, Coins, Bitcoin, Plus, Minus, ShieldCheck, ArrowRight, Check, Info } from "lucide-react";

type Payment = "darmin" | "crypto" | "fiat";
type Product = { id: string; name: string; duration: string; description: string; image: string; stock: number; edition: string };

const products: Product[] = [
  { id: "30s-black", name: "30 секунд · чёрная", duration: "30 секунд", description: "Чёрная рамка и белый песок.", image: "30s-black.jpg", stock: 12, edition: "Модель · 01" },
  { id: "1m-blue", name: "1 минута · синяя", duration: "1 минута", description: "Синяя рамка и голубой песок.", image: "1m-blue.jpg", stock: 12, edition: "Модель · 02" },
  { id: "2m-pink", name: "2 минуты · розовая", duration: "2 минуты", description: "Розовая рамка и розовый песок.", image: "2m-pink.jpg", stock: 12, edition: "Модель · 03" },
  { id: "3m-yellow", name: "3 минуты · жёлтая", duration: "3 минуты", description: "Жёлтая рамка и золотистый песок.", image: "3m-yellow.jpg", stock: 12, edition: "Модель · 04" },
  { id: "3m-green", name: "3 минуты · зелёная", duration: "3 минуты", description: "Зелёная рамка и жёлтый песок.", image: "3m-green.jpg", stock: 12, edition: "Модель · 05" },
  { id: "5m-green-light", name: "5 минут · зелёная 1", duration: "5 минут", description: "Зелёная рамка и светло-зелёный песок.", image: "5m-green-light.jpg", stock: 12, edition: "Модель · 06" },
  { id: "5m-green-dark", name: "5 минут · зелёная 2", duration: "5 минут", description: "Зелёная рамка и насыщенно-зелёный песок.", image: "5m-green-dark.jpg", stock: 12, edition: "Модель · 07" },
  { id: "10m-red", name: "10 минут · красная", duration: "10 минут", description: "Красная рамка и красный песок.", image: "10m-red.jpg", stock: 12, edition: "Модель · 08" },
];

const UNIT_PRICE_DARMINS = 5;
const TAX_RATE = 0.02;
const formatDarmins = (amount: number) => `${amount.toFixed(2).replace(".", ",")} Д`;

const paymentOptions: { id: Payment; label: string; detail: string; icon: typeof Coins }[] = [
  { id: "darmin", label: "Дармин", detail: "Пример баланса · без списания", icon: Coins },
  { id: "crypto", label: "Криптовалюта", detail: "Только макет · без кошелька", icon: Bitcoin },
  { id: "fiat", label: "Фиат", detail: "Пример суммы · без оплаты картой", icon: CreditCard },
];

export function WatchShop() {
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [payment, setPayment] = useState<Payment>("darmin");
  const [feedback, setFeedback] = useState(false);
  const lines = useMemo(() => products.filter((product) => (quantities[product.id] ?? 0) > 0), [quantities]);
  const itemCount = lines.reduce((sum, product) => sum + quantities[product.id], 0);
  const subtotalDarmins = itemCount * UNIT_PRICE_DARMINS;
  const taxDarmins = Number((subtotalDarmins * TAX_RATE).toFixed(2));
  const totalDarmins = subtotalDarmins + taxDarmins;
  const changeQuantity = (id: string, delta: number) => {
    setFeedback(false);
    setQuantities((current) => {
      const product = products.find((item) => item.id === id);
      const next = Math.max(0, Math.min(product?.stock ?? 99, (current[id] ?? 0) + delta));
      return { ...current, [id]: next };
    });
  };

  return (
    <Layout>
      <main className="mx-auto max-w-6xl space-y-8 pb-12" data-testid="watch-shop-page">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 pb-4">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.19em] text-muted-foreground" data-testid="text-shop-context">
            <Clock3 className="h-4 w-4 text-primary" /> TimeNation <span className="text-border">/</span> Часы
          </div>
          <span className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-primary" data-testid="status-demo-top">Демо-каталог</span>
        </div>

        <section className="grid items-end gap-6 lg:grid-cols-[1fr_auto]">
          <header className="max-w-3xl space-y-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-primary" data-testid="text-collection-label">Песочные часы · Модели 001—008</p>
            <h1 className="text-4xl font-semibold leading-[1.04] tracking-tight sm:text-6xl" data-testid="text-page-title">Время в движении.<br /><span className="text-muted-foreground">Выберите свой ритм.</span></h1>
            <p className="max-w-xl text-sm leading-6 text-muted-foreground sm:text-base" data-testid="text-page-intro">Восемь цветных моделей песочных часов с разной продолжительностью отсчёта.</p>
          </header>
          <div className="flex items-center gap-3 self-end rounded-lg border border-border bg-card px-4 py-3" data-testid="summary-cart-count">
            <ShoppingBag className="h-4 w-4 text-primary" /><span className="font-mono text-sm">{String(itemCount).padStart(2, "0")}</span><span className="text-xs text-muted-foreground">в корзине</span>
          </div>
        </section>

        <aside className="flex items-start gap-3 rounded-lg border border-primary/25 bg-primary/[0.07] p-4 sm:items-center" role="note" data-testid="notice-demo-mode">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary sm:mt-0" />
          <p className="text-xs leading-5 text-muted-foreground"><strong className="font-semibold text-foreground">Только демонстрация.</strong> Каталог и цены показаны для ознакомления. Заказ не создаётся, деньги и Дармины не списываются.</p>
        </aside>

        <div className="grid gap-8 lg:grid-cols-[1fr_350px] lg:items-start">
          <section className="grid gap-4 sm:grid-cols-2" aria-label="Демонстрационные модели песочных часов">
            <div className="col-span-full flex items-end justify-between border-b border-border/70 pb-3">
              <div><p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Каталог</p><h2 className="mt-1 text-xl font-semibold">Демонстрационные модели</h2></div>
              <span className="font-mono text-[10px] text-muted-foreground" data-testid="text-model-count">{products.length} моделей</span>
            </div>
            {products.map((product, index) => {
              const quantity = quantities[product.id] ?? 0;
              return (
                <article key={product.id} className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-primary/30" data-testid={`card-product-${product.id}`}>
                  <div className="relative flex aspect-square max-h-[280px] items-center justify-center overflow-hidden border-b border-border/70 bg-white" data-testid={`visual-stage-${product.id}`}>
                    <span className="absolute left-4 top-4 font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">{product.edition}</span>
                    <img src={`${import.meta.env.BASE_URL}watches/${product.image}`} alt={`Песочные часы ${product.duration}, ${product.name}`} className="h-full w-full object-contain" loading="lazy" data-testid={`image-product-${product.id}`} />
                  </div>
                  <div className="flex flex-1 flex-col justify-between gap-5 p-5">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div><h3 className="text-lg font-semibold tracking-tight" data-testid={`text-product-name-${product.id}`}>{product.name}</h3><p className="mt-1 text-xs text-muted-foreground">{product.duration}</p></div>
                        <span className="font-mono text-sm text-primary" data-testid={`text-product-price-${product.id}`}>{UNIT_PRICE_DARMINS} Д <span className="text-muted-foreground">+ 2%</span></span>
                      </div>
                      <p className="max-w-lg text-sm leading-6 text-muted-foreground" data-testid={`text-product-description-${product.id}`}>{product.description}</p>
                      <p className="font-mono text-xs text-muted-foreground">С налогом: {formatDarmins(UNIT_PRICE_DARMINS * (1 + TAX_RATE))} / шт.</p>
                      <p className="font-mono text-[10px] uppercase tracking-[0.13em] text-muted-foreground" data-testid={`text-product-stock-${product.id}`}>Условная доступность · {product.stock} шт.</p>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-4">
                        <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Демо-цена · 5 Д + налог</span>
                      {quantity === 0 ? (
                        <button type="button" onClick={() => changeQuantity(product.id, 1)} className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90" data-testid={`button-add-${product.id}`}>
                          <Plus className="h-3.5 w-3.5" /> В демо-корзину
                        </button>
                      ) : (
                        <div className="flex items-center gap-1 rounded-md border border-border bg-background p-1" data-testid={`control-quantity-${product.id}`}>
                          <button type="button" aria-label={`Remove one ${product.name}`} onClick={() => changeQuantity(product.id, -1)} className="flex h-8 w-8 items-center justify-center rounded hover:bg-secondary" data-testid={`button-decrease-${product.id}`}><Minus className="h-3.5 w-3.5" /></button>
                          <span className="min-w-8 text-center font-mono text-xs" data-testid={`text-quantity-${product.id}`}>{quantity}</span>
                          <button type="button" aria-label={`Add one ${product.name}`} disabled={quantity >= product.stock} onClick={() => changeQuantity(product.id, 1)} className="flex h-8 w-8 items-center justify-center rounded hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40" data-testid={`button-increase-${product.id}`}><Plus className="h-3.5 w-3.5" /></button>
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </section>

           <aside className="space-y-4 lg:sticky lg:top-6" aria-label="Демо-оформление">
            <section className="overflow-hidden rounded-xl border border-border bg-card" data-testid="panel-checkout">
              <div className="border-b border-border/70 px-5 py-4">
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary">Демо-оформление</p>
                <h2 className="mt-1 text-lg font-semibold">Ваша корзина</h2>
              </div>
              <div className="space-y-4 p-5">
                {lines.length ? lines.map((product) => (
                  <div key={product.id} className="flex items-start justify-between gap-3" data-testid={`row-cart-${product.id}`}>
                    <div><p className="text-sm font-medium" data-testid={`text-cart-name-${product.id}`}>{product.name}</p><p className="mt-1 font-mono text-[10px] text-muted-foreground" data-testid={`text-cart-quantity-${product.id}`}>{quantities[product.id]} × {UNIT_PRICE_DARMINS} Д + налог 2%</p></div>
                    <div className="text-right"><p className="font-mono text-xs" data-testid={`text-cart-line-total-${product.id}`}>{formatDarmins(quantities[product.id] * UNIT_PRICE_DARMINS * (1 + TAX_RATE))}</p><button type="button" onClick={() => changeQuantity(product.id, -quantities[product.id])} className="mt-1 text-[10px] text-muted-foreground underline underline-offset-2 hover:text-foreground" data-testid={`button-remove-${product.id}`}>Убрать</button></div>
                  </div>
                 )) : <div className="rounded-md border border-dashed border-border px-4 py-5 text-center" data-testid="empty-cart"><ShoppingBag className="mx-auto h-5 w-5 text-muted-foreground" /><p className="mt-2 text-xs text-muted-foreground">Добавьте демонстрационную модель.</p></div>}

                <div className="space-y-2 border-t border-border/70 pt-4" data-testid="summary-totals">
                  <div className="flex justify-between text-xs text-muted-foreground"><span>Товары · 5 Д/шт.</span><span className="font-mono" data-testid="text-subtotal-darmins">{formatDarmins(subtotalDarmins)}</span></div>
                  <div className="flex justify-between text-xs text-muted-foreground"><span>Налог · 2%</span><span className="font-mono" data-testid="text-tax-darmins">{formatDarmins(taxDarmins)}</span></div>
                  <div className="flex justify-between border-t border-border/70 pt-2 text-sm font-semibold"><span>Итого</span><span className="font-mono text-primary" data-testid="text-total-darmins">{formatDarmins(totalDarmins)}</span></div>
                </div>

                <fieldset className="space-y-2" data-testid="fieldset-payment">
                  <legend className="pb-1 text-xs font-semibold">Демонстрационный способ оплаты</legend>
                  <div className="grid grid-cols-3 gap-2">
                    {paymentOptions.map(({ id, label, detail, icon: Icon }) => {
                      const selected = payment === id;
                      return <button key={id} type="button" aria-pressed={selected} onClick={() => { setPayment(id); setFeedback(false); }} className={`relative flex min-h-[82px] flex-col items-start rounded-md border p-2.5 text-left transition-colors ${selected ? "border-primary bg-primary/[0.08]" : "border-border hover:border-primary/40"}`} data-testid={`button-payment-${id}`}>
                        <Icon className={`mb-2 h-4 w-4 ${selected ? "text-primary" : "text-muted-foreground"}`} />
                        <span className="text-[11px] font-semibold">{label}</span><span className="mt-1 text-[9px] leading-3 text-muted-foreground">{detail}</span>
                        {selected && <Check className="absolute right-2 top-2 h-3 w-3 text-primary" />}
                      </button>;
                    })}
                  </div>
                   <p className="text-[10px] leading-4 text-muted-foreground" data-testid="text-payment-disclaimer">Выбор показан только для демонстрации. Кошелёк, карта или баланс не подключены.</p>
                </fieldset>

                <div className="rounded-md border border-primary/25 bg-primary/[0.06] p-3" role="note" data-testid="notice-demo-checkout">
                  <p className="text-[11px] font-semibold text-foreground">Демо-режим — без транзакции</p>
                  <p className="mt-1 text-[10px] leading-4 text-muted-foreground">Предпросмотр не создаёт заказ и не списывает деньги.</p>
                </div>
                <button type="button" disabled={!itemCount} onClick={() => setFeedback(true)} className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40" data-testid="button-preview-checkout">
                  Проверить демо-корзину <ArrowRight className="h-4 w-4" />
                </button>
                 {feedback && <div className="flex gap-2 rounded-md border border-border bg-secondary/60 p-3" role="status" data-testid="status-demo-feedback"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><p className="text-xs leading-5"><strong>Предпросмотр завершён.</strong> Заказ не создан, средства не списаны.</p></div>}
              </div>
            </section>
              <p className="px-1 text-center text-[10px] leading-4 text-muted-foreground" data-testid="text-shop-footnote">Карточки и наличие приведены для демонстрации. Оплата и доставка не оформляются.</p>
          </aside>
        </div>
      </main>
    </Layout>
  );
}
