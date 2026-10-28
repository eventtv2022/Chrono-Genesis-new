import { useMemo, useState } from "react";
import { Layout } from "@/components/Layout";
import { ShoppingBag, Clock3, CreditCard, Coins, Bitcoin, Plus, Minus, ShieldCheck, ArrowRight, Check, Info } from "lucide-react";

type Payment = "darmin" | "crypto" | "fiat";
type Product = { id: string; name: string; description: string; priceDarmins: number; priceEur: number; stock: number; visualVariant: string; edition: string };

const products: Product[] = [
  { id: "meridian", name: "Meridian 24", description: "Лаконичный циферблат для тех, кто ценит общее время.", priceDarmins: 840, priceEur: 28, stock: 12, visualVariant: "meridian", edition: "Серия Field · 01" },
  { id: "civic", name: "Civic Hour", description: "Повседневная модель с точным архитектурным циферблатом.", priceDarmins: 1260, priceEur: 42, stock: 7, visualVariant: "civic", edition: "Серия Civic · 02" },
  { id: "orbit", name: "Orbit 60", description: "Концепт о ритме одной планеты и общем времени.", priceDarmins: 1710, priceEur: 57, stock: 4, visualVariant: "orbit", edition: "Концепт · 03" },
];

const paymentOptions: { id: Payment; label: string; detail: string; icon: typeof Coins }[] = [
  { id: "darmin", label: "Дармин", detail: "Пример баланса · без списания", icon: Coins },
  { id: "crypto", label: "Криптовалюта", detail: "Только макет · без кошелька", icon: Bitcoin },
  { id: "fiat", label: "Фиат", detail: "Пример суммы · без оплаты картой", icon: CreditCard },
];

function WatchIllustration({ variant }: { variant: string }) {
  return (
    <div className={`watch-art watch-art-${variant}`} aria-hidden="true" data-testid={`visual-watch-${variant}`}>
      <div className="watch-strap watch-strap-top" />
      <div className="watch-case">
        <div className="watch-face">
          <span className="dial-mark dial-12" /><span className="dial-mark dial-3" /><span className="dial-mark dial-6" /><span className="dial-mark dial-9" />
          <span className="dial-center" /><span className="dial-hand dial-hour" /><span className="dial-hand dial-minute" />
          <span className="dial-brand">TN</span>
        </div>
      </div>
      <div className="watch-strap watch-strap-bottom" />
    </div>
  );
}

export function WatchShop() {
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [payment, setPayment] = useState<Payment>("darmin");
  const [feedback, setFeedback] = useState(false);
  const lines = useMemo(() => products.filter((product) => (quantities[product.id] ?? 0) > 0), [quantities]);
  const itemCount = lines.reduce((sum, product) => sum + quantities[product.id], 0);
  const totalDarmins = lines.reduce((sum, product) => sum + quantities[product.id] * product.priceDarmins, 0);
  const totalEur = lines.reduce((sum, product) => sum + quantities[product.id] * product.priceEur, 0);
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
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-primary" data-testid="text-collection-label">Общее время · Модели 001—003</p>
            <h1 className="text-4xl font-semibold leading-[1.04] tracking-tight sm:text-6xl" data-testid="text-page-title">Небольшая коллекция.<br /><span className="text-muted-foreground">Общее время.</span></h1>
            <p className="max-w-xl text-sm leading-6 text-muted-foreground sm:text-base" data-testid="text-page-intro">Концептуальные часы TimeNation, созданные вокруг идеи, что время принадлежит всем.</p>
          </header>
          <div className="flex items-center gap-3 self-end rounded-lg border border-border bg-card px-4 py-3" data-testid="summary-cart-count">
            <ShoppingBag className="h-4 w-4 text-primary" /><span className="font-mono text-sm">{String(itemCount).padStart(2, "0")}</span><span className="text-xs text-muted-foreground">в корзине</span>
          </div>
        </section>

        <aside className="flex items-start gap-3 rounded-lg border border-primary/25 bg-primary/[0.07] p-4 sm:items-center" role="note" data-testid="notice-demo-mode">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary sm:mt-0" />
          <p className="text-xs leading-5 text-muted-foreground"><strong className="font-semibold text-foreground">Только демонстрация.</strong> Модели и цены приведены для примера. Здесь нельзя купить товар: оформление не создаёт заказ и не списывает средства.</p>
        </aside>

        <div className="grid gap-8 lg:grid-cols-[1fr_350px] lg:items-start">
          <section className="space-y-4" aria-label="Демонстрационные модели часов">
            <div className="flex items-end justify-between border-b border-border/70 pb-3">
              <div><p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Каталог</p><h2 className="mt-1 text-xl font-semibold">Демонстрационные модели</h2></div>
              <span className="font-mono text-[10px] text-muted-foreground" data-testid="text-model-count">3 модели</span>
            </div>
            {products.map((product, index) => {
              const quantity = quantities[product.id] ?? 0;
              return (
                <article key={product.id} className="group grid overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-primary/30 sm:grid-cols-[220px_1fr]" data-testid={`card-product-${product.id}`}>
                  <div className={`relative flex min-h-[230px] items-center justify-center overflow-hidden border-b border-border/70 sm:border-b-0 sm:border-r sm:border-border/70 watch-stage watch-stage-${product.visualVariant}`} data-testid={`visual-stage-${product.id}`}>
                    <span className="absolute left-4 top-4 font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">{product.edition}</span>
                    <span className="absolute right-4 top-4 font-mono text-[9px] text-muted-foreground">0{index + 1}</span>
                    <WatchIllustration variant={product.visualVariant} />
                  </div>
                  <div className="flex flex-col justify-between gap-5 p-5 sm:p-6">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <h3 className="text-xl font-semibold tracking-tight" data-testid={`text-product-name-${product.id}`}>{product.name}</h3>
                        <span className="font-mono text-sm text-primary" data-testid={`text-product-price-${product.id}`}>{product.priceDarmins.toLocaleString()} Д <span className="text-muted-foreground">/ €{product.priceEur}</span></span>
                      </div>
                      <p className="max-w-lg text-sm leading-6 text-muted-foreground" data-testid={`text-product-description-${product.id}`}>{product.description}</p>
                      <p className="font-mono text-[10px] uppercase tracking-[0.13em] text-muted-foreground" data-testid={`text-product-stock-${product.id}`}>Условная доступность · {product.stock} шт.</p>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-4">
                       <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Примерная цена</span>
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
                    <div><p className="text-sm font-medium" data-testid={`text-cart-name-${product.id}`}>{product.name}</p><p className="mt-1 font-mono text-[10px] text-muted-foreground" data-testid={`text-cart-quantity-${product.id}`}>{quantities[product.id]} × {product.priceDarmins.toLocaleString()} Д</p></div>
                    <div className="text-right"><p className="font-mono text-xs" data-testid={`text-cart-line-total-${product.id}`}>{(quantities[product.id] * product.priceDarmins).toLocaleString()} Д</p><button type="button" onClick={() => changeQuantity(product.id, -quantities[product.id])} className="mt-1 text-[10px] text-muted-foreground underline underline-offset-2 hover:text-foreground" data-testid={`button-remove-${product.id}`}>Убрать</button></div>
                  </div>
                 )) : <div className="rounded-md border border-dashed border-border px-4 py-5 text-center" data-testid="empty-cart"><ShoppingBag className="mx-auto h-5 w-5 text-muted-foreground" /><p className="mt-2 text-xs text-muted-foreground">Добавьте демонстрационную модель.</p></div>}

                <div className="space-y-2 border-t border-border/70 pt-4" data-testid="summary-totals">
                  <div className="flex justify-between text-xs text-muted-foreground"><span>Примерная сумма</span><span className="font-mono" data-testid="text-total-darmins">{totalDarmins.toLocaleString()} Д</span></div>
                  <div className="flex justify-between text-xs text-muted-foreground"><span>Ориентир в евро</span><span className="font-mono" data-testid="text-total-eur">€{totalEur.toLocaleString()}</span></div>
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
             <p className="px-1 text-center text-[10px] leading-4 text-muted-foreground" data-testid="text-shop-footnote">Модели, остатки и цены приведены только для примера. Данные покупателя и доставки не запрашиваются.</p>
          </aside>
        </div>
      </main>
      <style>{`
        .watch-stage { background-image: radial-gradient(ellipse at 50% 42%, hsl(var(--primary) / .08), transparent 62%); }
        .watch-stage-civic { background-color: hsl(var(--secondary) / .34); }
        .watch-stage-orbit { background-image: radial-gradient(ellipse at 50% 42%, hsl(var(--primary) / .14), transparent 62%); }
        .watch-art { position: relative; display: flex; width: 118px; height: 204px; flex-direction: column; align-items: center; justify-content: space-between; filter: drop-shadow(0 12px 14px hsl(0 0% 0% / .22)); transform: rotate(-9deg); transition: transform 300ms ease; }
        article:hover .watch-art { transform: rotate(-5deg) translateY(-2px); }
        .watch-strap { z-index: 0; width: 43px; height: 64px; border: 1px solid hsl(var(--foreground) / .18); background: linear-gradient(90deg, hsl(var(--muted-foreground) / .35), hsl(var(--foreground) / .18) 48%, hsl(var(--muted-foreground) / .28)); }
        .watch-strap-top { border-radius: 13px 13px 5px 5px; }
        .watch-strap-bottom { border-radius: 5px 5px 13px 13px; }
        .watch-case { z-index: 2; display: grid; width: 108px; height: 108px; place-items: center; border: 7px solid hsl(var(--primary) / .75); border-radius: 50%; background: linear-gradient(145deg, hsl(var(--foreground) / .2), hsl(var(--muted) / .95)); box-shadow: inset 0 0 0 2px hsl(var(--foreground) / .13), 0 0 0 2px hsl(var(--background) / .7); }
        .watch-face { position: relative; width: 84px; height: 84px; border: 1px solid hsl(var(--foreground) / .25); border-radius: 50%; background: radial-gradient(circle at 35% 25%, hsl(var(--foreground) / .11), transparent 55%), hsl(var(--background)); }
        .watch-art-civic .watch-case { border-color: hsl(var(--foreground) / .45); border-radius: 27px; }
        .watch-art-civic .watch-face { border-radius: 20px; }
        .watch-art-orbit .watch-case { border-color: hsl(var(--primary) / .95); }
        .watch-art-orbit .watch-face { background: radial-gradient(circle at center, hsl(var(--primary) / .12), hsl(var(--background)) 70%); }
        .dial-mark { position: absolute; z-index: 2; display: block; background: hsl(var(--primary)); }
        .dial-12, .dial-6 { left: 50%; width: 2px; height: 5px; transform: translateX(-50%); }
        .dial-12 { top: 5px; }.dial-6 { bottom: 5px; }
        .dial-3, .dial-9 { top: 50%; width: 5px; height: 2px; transform: translateY(-50%); }
        .dial-3 { right: 5px; }.dial-9 { left: 5px; }
        .dial-center { position: absolute; left: 50%; top: 50%; z-index: 4; width: 5px; height: 5px; border-radius: 50%; background: hsl(var(--primary)); transform: translate(-50%, -50%); }
        .dial-hand { position: absolute; left: 50%; bottom: 50%; z-index: 3; display: block; width: 1px; border-radius: 2px; background: hsl(var(--foreground) / .8); transform-origin: bottom; }
        .dial-hour { height: 20px; transform: translateX(-50%) rotate(38deg); }.dial-minute { height: 29px; transform: translateX(-50%) rotate(142deg); }
        .dial-brand { position: absolute; left: 50%; top: 62%; color: hsl(var(--muted-foreground)); font: 7px 'Space Mono', monospace; letter-spacing: .12em; transform: translateX(-50%); }
        @media (prefers-reduced-motion: reduce) { .watch-art { transition: none; } }
      `}</style>
    </Layout>
  );
}
