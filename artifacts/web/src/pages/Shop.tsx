import { Layout } from "@/components/Layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertCircle, ShoppingBag, Tag, Zap, Copy, CheckCircle, CreditCard, Bitcoin } from "lucide-react";
import { useCitizen } from "@/context/CitizenContext";
import { lazy, Suspense, useState, useMemo, useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";

const TRC20_WALLET      = "TDLRNKKjNJ5RNuit6Hr7nVta5syzEEwr2q";
const SYSTEM_FEE        = 0.05;
const WalletConnectCheckout = lazy(() =>
  import("./WalletConnectCheckout").then(module => ({ default: module.WalletConnectCheckout })),
);

function calcUsdtLocal(darmins: number): number {
  let disc = 0;
  if (darmins > 10000) disc = 10;
  else if (darmins >= 5000) disc = 8;
  else if (darmins >= 1000) disc = 7;
  else if (darmins >= 500)  disc = 6;
  else if (darmins >= 100)  disc = 5;
  return parseFloat((darmins * (1 - disc / 100) * (1 + SYSTEM_FEE)).toFixed(4));
}

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

interface SupplyData {
  totalSupply: number;
  emitted24h: number;
  remainingCap: number;
  dailyCap: number;
}

export function Shop() {
  const { citizen, authToken } = useCitizen();
  const { toast } = useToast();
  const [amountStr, setAmountStr] = useState("100");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [supply, setSupply] = useState<SupplyData | null>(null);

  useEffect(() => {
    void fetch("/api/supply").then(r => r.json()).then(setSupply).catch(() => null);
  }, []);

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
        headers: { "Content-Type": "application/json", ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) },
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

  // ── TRC20 state ──────────────────────────────────────────────────────────────
  const [payMethod,     setPayMethod]     = useState<"stripe" | "trc20" | "walletconnect">("stripe");
  const [trc20ReqId,    setTrc20ReqId]    = useState<number | null>(null);
  const [trc20Amount,   setTrc20Amount]   = useState<number | null>(null);
  const [trc20TxId,     setTrc20TxId]     = useState("");
  const [trc20Copied,   setTrc20Copied]   = useState(false);
  const [trc20Loading,  setTrc20Loading]  = useState(false);
  const [trc20Error,    setTrc20Error]    = useState<string | null>(null);
  const [trc20Done,     setTrc20Done]     = useState(false);

  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(TRC20_WALLET)}&bgcolor=ffffff&color=000000&margin=10`;

  async function handleTrc20Request() {
    if (!citizen) { setTrc20Error("Войдите в аккаунт"); return; }
    if (amount < 1) { setTrc20Error("Введите количество Дарминов"); return; }
    setTrc20Error(null);
    setTrc20Loading(true);
    try {
      const res = await fetch("/api/payments/trc20/request", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) },
        body: JSON.stringify({ citizenId: citizen.id, darmins: amount, purpose: "darmins" }),
      });
      const data = await res.json() as { requestId?: number; totalUsdt?: number; error?: string };
      if (!res.ok) { setTrc20Error(data.error ?? "Ошибка сервера"); return; }
      setTrc20ReqId(data.requestId ?? null);
      setTrc20Amount(data.totalUsdt ?? calcUsdtLocal(amount));
    } catch {
      setTrc20Amount(calcUsdtLocal(amount));
    } finally {
      setTrc20Loading(false);
    }
  }

  async function handleTrc20Submit() {
    if (!citizen || !trc20TxId.trim()) return;
    setTrc20Loading(true);
    setTrc20Error(null);
    try {
      const res = await fetch("/api/payments/trc20/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) },
        body: JSON.stringify({
          requestId:  trc20ReqId,
          citizenId:  citizen.id,
          txId:       trc20TxId.trim(),
          amountUsdt: trc20Amount ?? calcUsdtLocal(amount),
          darmins:    amount,
          purpose:    "darmins",
        }),
      });
      const data = await res.json() as { success?: boolean; error?: string };
      if (!res.ok) { setTrc20Error(data.error ?? "Ошибка сервера"); return; }
      setTrc20Done(true);
      toast({ title: "✅ Транзакция принята!", description: "Дармины будут зачислены после проверки в блокчейне." });
    } catch {
      setTrc20Error("Ошибка соединения");
    } finally {
      setTrc20Loading(false);
    }
  }

  function copyTrc20() {
    void navigator.clipboard.writeText(TRC20_WALLET).then(() => {
      setTrc20Copied(true);
      setTimeout(() => setTrc20Copied(false), 2500);
    });
  }

  // Reset TRC20 state when amount or payMethod changes
  const prevAmount = useRef(amount);
  useEffect(() => {
    if (prevAmount.current !== amount) {
      prevAmount.current = amount;
      setTrc20ReqId(null);
      setTrc20Amount(null);
      setTrc20TxId("");
      setTrc20Error(null);
      setTrc20Done(false);
    }
  }, [amount]);

  return (
    <Layout>
      <div className="space-y-6 max-w-xl">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Казначейство</h1>
          <p className="text-muted-foreground font-mono text-sm mt-1">
            Пополнение баланса Дарминов · 1 Д = 1 € / 1 USDT базовая цена
          </p>
        </div>

        {/* Total Supply */}
        {supply && (
          <div className="flex flex-wrap gap-4 p-4 bg-amber-500/10 border border-amber-500/30 rounded-sm">
            <div>
              <div className="text-[10px] font-mono text-amber-300/70 uppercase tracking-widest">Общий объём валюты (Total Supply)</div>
              <div className="text-2xl font-bold font-mono text-amber-300">
                {supply.totalSupply.toFixed(2)} Д
              </div>
            </div>
            <div className="border-l border-amber-500/30 pl-4">
              <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">Эмиссия за 24ч</div>
              <div className="text-sm font-mono">{supply.emitted24h.toFixed(2)} / {supply.dailyCap} Д</div>
              <div className="text-[10px] font-mono text-muted-foreground">лимит: 1440 Д/сутки</div>
            </div>
          </div>
        )}

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

            {/* Payment method selector */}
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => setPayMethod("stripe")}
                className={`flex flex-col items-center gap-1 p-3 rounded-sm border text-xs font-mono transition-colors ${payMethod === "stripe" ? "border-emerald-400/60 bg-emerald-500/10 text-emerald-400" : "border-border text-muted-foreground hover:border-border/80"}`}
              >
                <CreditCard className="w-4 h-4" />
                <span className="font-bold">Stripe EUR</span>
                <span className="text-[10px] opacity-70">Банковская карта</span>
              </button>
              <button
                onClick={() => setPayMethod("trc20")}
                className={`flex flex-col items-center gap-1 p-3 rounded-sm border text-xs font-mono transition-colors ${payMethod === "trc20" ? "border-sky-400/60 bg-sky-500/10 text-sky-400" : "border-border text-muted-foreground hover:border-border/80"}`}
              >
                <Bitcoin className="w-4 h-4" />
                <span className="font-bold">USDT TRC20</span>
                <span className="text-[10px] opacity-70">Tron Network</span>
              </button>
              <button
                onClick={() => setPayMethod("walletconnect")}
                className={`flex flex-col items-center gap-1 p-3 rounded-sm border text-xs font-mono transition-colors ${payMethod === "walletconnect" ? "border-violet-400/60 bg-violet-500/10 text-violet-300" : "border-border text-muted-foreground hover:border-border/80"}`}
                data-testid="button-walletconnect-payment"
              >
                <Bitcoin className="w-4 h-4" />
                <span className="font-bold">WalletConnect</span>
                <span className="text-[10px] opacity-70">USDT · TRON</span>
              </button>
            </div>

            {/* Price breakdown */}
            {price && amount > 0 ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-secondary/50 rounded-sm border border-border space-y-1">
                    <div className="text-xs text-muted-foreground font-mono">Базовая цена</div>
                    <div className="text-lg font-bold font-mono">
                      {payMethod === "stripe" ? `${price.baseEur.toFixed(2)} €` : `${amount} USDT`}
                    </div>
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

                {payMethod === "stripe" ? (
                  <>
                    <div className="p-4 bg-primary/10 border border-primary/30 rounded-sm flex items-center justify-between">
                      <div>
                        <div className="text-xs text-muted-foreground font-mono mb-1">Итого к оплате</div>
                        <div className="text-2xl font-bold font-mono text-primary">{price.totalEur.toFixed(2)} €</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-muted-foreground font-mono mb-1">Цена за 1 Д</div>
                        <div className="text-base font-bold font-mono text-muted-foreground">{price.eurPerDarmin.toFixed(2)} €/Д</div>
                      </div>
                    </div>
                    <Button
                      onClick={() => void handleBuy()}
                      disabled={loading || !citizen || amount < 1}
                      className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-mono text-base py-5"
                    >
                      {loading ? <span className="flex items-center gap-2"><span className="animate-spin">⟳</span> Переход к оплате...</span>
                        : <span className="flex items-center gap-2"><ShoppingBag className="w-5 h-5" />Купить {amount} Д за {price.totalEur.toFixed(2)} €</span>}
                    </Button>
                  </>
                ) : payMethod === "trc20" ? (
                  /* ── TRC20 payment flow ── */
                  <div className="space-y-3">
                    {/* Step 1: amount card */}
                    <div className="p-4 bg-sky-900/20 border border-sky-700/40 rounded-sm flex items-center justify-between">
                      <div>
                        <div className="text-xs text-muted-foreground font-mono mb-1">Итого к оплате (USDT TRC20)</div>
                        <div className="text-2xl font-bold font-mono text-sky-400">
                          {trc20Amount !== null ? `${trc20Amount.toFixed(4)} USDT` : `≈${calcUsdtLocal(amount).toFixed(2)} USDT`}
                        </div>
                      </div>
                      <div className="text-right text-xs font-mono text-muted-foreground">
                        <div>{amount} Дарминов</div>
                        <div className="text-[10px] mt-1">вкл. комиссию 5%</div>
                      </div>
                    </div>

                    {/* Step 2: address + QR */}
                    {!trc20Done && (
                      <>
                        <div className="space-y-2">
                          <div className="text-xs text-muted-foreground font-mono font-semibold">Адрес казначейства (USDT TRC20)</div>
                          <div className="flex items-center gap-2 p-2.5 bg-secondary/50 rounded-sm border border-border">
                            <code className="flex-1 text-xs text-sky-400 font-mono break-all">{TRC20_WALLET}</code>
                            <button
                              onClick={copyTrc20}
                              className="shrink-0 flex items-center gap-1 px-2 py-1 rounded border border-sky-700/50 bg-sky-900/20 text-sky-400 text-xs font-mono hover:bg-sky-900/40 transition-colors"
                            >
                              {trc20Copied ? <CheckCircle className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                              {trc20Copied ? "Скопировано" : "Копировать"}
                            </button>
                          </div>
                        </div>

                        {/* QR code */}
                        <div className="flex justify-center">
                          <div className="p-3 bg-white rounded-sm border border-border">
                            <img src={qrUrl} alt="TRC20 QR" width={180} height={180} />
                          </div>
                        </div>

                        {/* Step 3: generate request (to get exact amount) */}
                        {!trc20ReqId && (
                          <Button
                            onClick={() => void handleTrc20Request()}
                            disabled={trc20Loading || !citizen || amount < 1}
                            variant="outline"
                            className="w-full border-sky-700/50 text-sky-400 hover:bg-sky-900/20 font-mono text-sm"
                          >
                            {trc20Loading ? <span className="flex items-center gap-2"><span className="animate-spin">⟳</span> Расчёт суммы...</span>
                              : "📐 Получить точную сумму к переводу"}
                          </Button>
                        )}

                        {/* Step 4: txid input */}
                        {(trc20ReqId || trc20Amount !== null) && (
                          <>
                            <div className="space-y-1">
                              <div className="text-xs text-muted-foreground font-mono font-semibold">TxID транзакции (после перевода)</div>
                              <Input
                                value={trc20TxId}
                                onChange={e => setTrc20TxId(e.target.value)}
                                placeholder="Вставьте хэш транзакции из Tron-кошелька..."
                                className="font-mono text-xs bg-background border-border focus:border-sky-500/50"
                              />
                            </div>
                            {trc20Error && (
                              <div className="flex items-center gap-1.5 p-2 bg-destructive/10 border border-destructive/30 rounded-sm text-xs text-destructive font-mono">
                                <AlertCircle className="w-3 h-3 shrink-0" />{trc20Error}
                              </div>
                            )}
                            <Button
                              onClick={() => void handleTrc20Submit()}
                              disabled={trc20Loading || trc20TxId.trim().length < 10}
                              className="w-full bg-sky-600 hover:bg-sky-500 text-white font-mono text-sm"
                            >
                              {trc20Loading ? <span className="flex items-center gap-2"><span className="animate-spin">⟳</span> Отправка...</span>
                                : "✅ Подтвердить оплату"}
                            </Button>
                          </>
                        )}
                      </>
                    )}

                    {/* Success */}
                    {trc20Done && (
                      <div className="p-4 bg-emerald-900/20 border border-emerald-700/40 rounded-sm text-center space-y-2">
                        <CheckCircle className="w-8 h-8 text-emerald-400 mx-auto" />
                        <div className="text-sm font-bold font-mono text-emerald-400">Транзакция принята на проверку!</div>
                        <div className="text-xs text-muted-foreground font-mono">
                          Дармины будут зачислены после подтверждения в блокчейне Tron.<br />
                          Администратор проверяет транзакции в течение нескольких часов.
                        </div>
                      </div>
                    )}

                    <p className="text-[10px] text-muted-foreground font-mono leading-relaxed text-center">
                      Переведите точную сумму USDT (TRC20 / Tron) на адрес казначейства,<br />
                      затем вставьте TxID и нажмите «Подтвердить». Ручная проверка: ~24 ч.
                    </p>
                  </div>
                ) : (
                  <Suspense fallback={<div className="rounded-sm border border-border p-4 text-center text-xs text-muted-foreground">Загрузка WalletConnect…</div>}>
                    <WalletConnectCheckout
                      citizenId={citizen?.id}
                      authToken={authToken}
                      amount={amount}
                    />
                  </Suspense>
                )}
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
