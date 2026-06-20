import { Layout } from "@/components/Layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertCircle, ShoppingBag, Tag, Zap } from "lucide-react";
import { useCitizen } from "@/context/CitizenContext";
import { useState, useMemo } from "react";
import { useToast } from "@/hooks/use-toast";

// ── Discount tiers (mirrors server-side logic) ─────────────────────────────────

function calcDarminDiscount(amount: number): number {
  if (amount > 10000) return 10;
  if (amount >= 5000)  return 8;
  if (amount >= 1000)  return 7;
  if (amount >= 500)   return 6;
  if (amount >= 100)   return 5;
  return 0;
}

interface PriceCalc {
  discountPct: number;
  baseEur: number;
  totalEur: number;
  eurPerDarmin: number;
}

function calcPrice(amount: number): PriceCalc {
  const discountPct = calcDarminDiscount(amount);
  const baseEur = amount;
  const totalEur = parseFloat((amount * (1 - discountPct / 100)).toFixed(2));
  const eurPerDarmin = parseFloat((totalEur / amount).toFixed(4));
  return { discountPct, baseEur, totalEur, eurPerDarmin };
}

// ── Tier hints ─────────────────────────────────────────────────────────────────

const TIERS = [
  { label: "1–99 Д",        from: 1,     discount: 0  },
  { label: "100–499 Д",     from: 100,   discount: 5  },
  { label: "500–999 Д",     from: 500,   discount: 6  },
  { label: "1 000–4 999 Д", from: 1000,  discount: 7  },
  { label: "5 000–10 000 Д",from: 5000,  discount: 8  },
  { label: "свыше 10 000 Д",from: 10001, discount: 10 },
];

export function Shop() {
  const { citizen } = useCitizen();
  const { toast } = useToast();
  const [amountStr, setAmountStr] = useState("100");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amount = useMemo(() => {
    const n = parseInt(amountStr, 10);
    return isNaN(n) || n < 1 ? 0 : n;
  }, [amountStr]);

  const price = useMemo(() => (amount > 0 ? calcPrice(amount) : null), [amount]);

  const urlParams = new URLSearchParams(window.location.search);
  const status = urlParams.get("status");

  async function handleBuy() {
    if (!citizen) { setError("Войдите в аккаунт в боковом меню"); return; }
    if (amount < 1) { setError("Введите количество Дарминов (минимум 1)"); return; }
    setError(null);
    setLoading(true);
    try {
      const base = window.location.origin + "/web/shop";
      const res = await fetch("/api/payments/checkout-custom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          citizenId:  citizen.id,
          amount,
          successUrl: base + "?status=success",
          cancelUrl:  base + "?status=cancel",
        }),
      });
      const data = await res.json() as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setError(data.error ?? "Ошибка создания платёжной сессии");
      } else {
        window.location.href = data.url;
      }
    } catch {
      setError("Ошибка соединения с сервером");
    } finally {
      setLoading(false);
    }
  }

  const activeTierIdx = TIERS.findLastIndex(t => amount >= t.from);

  return (
    <Layout>
      <div className="space-y-6 max-w-xl">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Казначейство</h1>
          <p className="text-muted-foreground font-mono text-sm mt-1">
            Пополнение баланса Дарминов · 1 Д = 1 € базовая цена
          </p>
        </div>

        {status === "success" && (
          <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-sm text-emerald-300 text-sm font-mono">
            Оплата прошла успешно. Дармины будут зачислены в течение нескольких секунд.
          </div>
        )}
        {status === "cancel" && (
          <div className="p-4 bg-secondary border border-border rounded-sm text-muted-foreground text-sm font-mono">
            Оплата отменена. Вы можете попробовать снова.
          </div>
        )}

        {citizen ? (
          <div className="flex items-center gap-3 p-3 bg-primary/10 border border-primary/30 rounded-sm">
            <div className="w-2 h-2 rounded-full bg-primary shrink-0" />
            <span className="text-sm font-mono text-primary font-bold">{citizen.name}</span>
            <span className="text-xs text-muted-foreground font-mono ml-auto">
              Баланс: {(citizen.balanceMinutes as number).toFixed(2)} Д
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 p-3 bg-yellow-400/10 border border-yellow-400/30 rounded-sm text-yellow-300 text-sm font-mono">
            <AlertCircle className="w-4 h-4 shrink-0" />
            Войдите в аккаунт в боковом меню, чтобы купить Дармины
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/30 rounded-sm text-sm text-destructive font-mono">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {/* ── Calculator ── */}
        <Card className="bg-card border-border">
          <CardContent className="p-5 space-y-5">
            <div className="space-y-2">
              <label className="text-sm font-mono text-muted-foreground">
                Количество Дарминов
              </label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  min={1}
                  step={1}
                  value={amountStr}
                  onChange={e => setAmountStr(e.target.value)}
                  className="font-mono text-lg bg-background border-border focus:border-primary"
                  placeholder="Например: 250"
                />
                <div className="flex gap-1">
                  {[100, 500, 1000].map(n => (
                    <Button
                      key={n}
                      variant="outline"
                      size="sm"
                      onClick={() => setAmountStr(String(n))}
                      className="font-mono text-xs px-2 border-border hover:border-primary/50"
                    >
                      {n}
                    </Button>
                  ))}
                </div>
              </div>
            </div>

            {/* Price breakdown */}
            {price && amount > 0 ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-secondary/50 rounded-sm border border-border space-y-1">
                    <div className="text-xs text-muted-foreground font-mono">Базовая цена</div>
                    <div className="text-lg font-bold font-mono">{price.baseEur.toFixed(2)} €</div>
                  </div>
                  <div className={`p-3 rounded-sm border space-y-1 ${price.discountPct > 0 ? "bg-emerald-900/20 border-emerald-700/40" : "bg-secondary/50 border-border"}`}>
                    <div className="text-xs text-muted-foreground font-mono flex items-center gap-1">
                      <Tag className="w-3 h-3" /> Скидка
                    </div>
                    <div className={`text-lg font-bold font-mono ${price.discountPct > 0 ? "text-emerald-400" : "text-muted-foreground"}`}>
                      {price.discountPct > 0 ? `−${price.discountPct}%` : "нет"}
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-primary/10 border border-primary/30 rounded-sm flex items-center justify-between">
                  <div>
                    <div className="text-xs text-muted-foreground font-mono mb-1">Итого к оплате</div>
                    <div className="text-2xl font-bold font-mono text-primary">
                      {price.totalEur.toFixed(2)} €
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground font-mono mb-1">Цена за 1 Д</div>
                    <div className="text-base font-bold font-mono text-muted-foreground">
                      {price.eurPerDarmin.toFixed(2)} €/Д
                    </div>
                  </div>
                </div>

                <Button
                  onClick={() => void handleBuy()}
                  disabled={loading || !citizen || amount < 1}
                  className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-mono text-base py-5"
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <span className="animate-spin">⟳</span> Переход к оплате...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <ShoppingBag className="w-5 h-5" />
                      Купить {amount} Д за {price.totalEur.toFixed(2)} €
                    </span>
                  )}
                </Button>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground font-mono p-3 bg-secondary/30 rounded-sm">
                Введите количество Дарминов (минимум 1)
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Discount tiers ── */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
            <Zap className="w-3 h-3" /> Прогрессивные скидки
          </div>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {TIERS.map((tier, i) => (
              <div
                key={tier.from}
                className={`p-2 rounded-sm border text-xs font-mono transition-colors ${
                  i === activeTierIdx
                    ? "bg-primary/15 border-primary/50 text-primary"
                    : "bg-secondary/30 border-border text-muted-foreground"
                }`}
              >
                <div className="font-bold">{tier.label}</div>
                <div className={tier.discount > 0 ? "text-emerald-400" : ""}>
                  {tier.discount > 0 ? `скидка ${tier.discount}%` : "без скидки"}
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="text-xs text-muted-foreground font-mono leading-relaxed">
          Дармины — внутренняя игровая валюта TimeNation. Не являются денежными средствами
          в юридическом смысле. Оплата обрабатывается через Stripe (EUR).
        </p>
      </div>
    </Layout>
  );
}
