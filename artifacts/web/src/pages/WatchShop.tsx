import { Layout } from "@/components/Layout";
import { ShoppingBag, Clock3, CreditCard, Coins, Bitcoin } from "lucide-react";

export function WatchShop() {
  return (
    <Layout>
      <div className="mx-auto max-w-5xl space-y-8">
        <header className="space-y-2">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-primary">TimeNation · Store</p>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Интернет-магазин часов</h1>
          <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">
            Каталог, сведения о наличии и оформление покупок будут доступны после подключения реальных товаров и платёжных сценариев.
          </p>
        </header>

        <section className="grid gap-4 sm:grid-cols-3" aria-label="Планируемые способы оплаты">
          {[
            { icon: Coins, label: "Дармин", detail: "Списание только после серверной проверки баланса" },
            { icon: Bitcoin, label: "Криптовалюта", detail: "Подтверждение транзакции до обработки заказа" },
            { icon: CreditCard, label: "Фиат", detail: "Защищённая платёжная сессия" },
          ].map(({ icon: Icon, label, detail }) => (
            <div key={label} className="rounded-xl border border-border bg-card p-4">
              <Icon className="mb-3 h-5 w-5 text-primary" />
              <h2 className="font-semibold">{label}</h2>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{detail}</p>
            </div>
          ))}
        </section>

        <section className="rounded-xl border border-dashed border-border bg-card/60 px-6 py-12 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-muted-foreground">
            <Clock3 className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-semibold">Каталог пока не настроен</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
            Здесь будут отображаться только товары с заданными ценами и подтверждённым наличием. Сейчас оформление покупок отключено.
          </p>
          <div className="mt-5 inline-flex items-center gap-2 text-xs text-muted-foreground">
            <ShoppingBag className="h-4 w-4" />
            Безопасная оплата появится после настройки каталога
          </div>
        </section>
      </div>
    </Layout>
  );
}
