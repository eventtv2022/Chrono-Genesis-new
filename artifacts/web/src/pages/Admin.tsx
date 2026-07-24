import { useEffect, useState, useCallback } from "react";
import { Layout } from "@/components/Layout";
import { useCitizen } from "@/context/CitizenContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useLocation } from "wouter";

interface AdminStats {
  citizens: { total: number; totalBalance: number };
  sessions: { total: number };
  transactions: { total: number; totalVolume: number };
  auctions: { total: number };
  emission: { emitted24h: number; remainingCap: number; dailyCap: number };
}

interface TreasuryStats {
  totalTaxCollected: number;
  todayTaxCollected: number;
  taxBySource: { sourceType: string; total: number }[];
  recentLogs: { id: number; sourceType: string; amount: number; fromCitizenId: number; referenceId: number; createdAt: string }[];
}

interface AdminCitizen {
  id: number;
  name: string;
  phone: string;
  rank: string;
  meritScore: number;
  balanceMinutes: number;
  status: string;
  isAdmin: number;
}

interface AdminTx {
  id: number;
  fromCitizenId: number;
  toCitizenId: number;
  fromCitizenName: string;
  toCitizenName: string;
  minutesTransferred: number;
  createdAt: string;
}

const STATUS_STYLES: Record<string, string> = {
  active:   "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  banned:   "bg-red-500/20 text-red-300 border-red-500/30",
  inactive: "bg-zinc-500/20 text-zinc-300 border-zinc-500/30",
};

// ── OTP Emit Modal ─────────────────────────────────────────────────────────────
interface OtpModalProps {
  onClose: () => void;
  onSuccess: (newBalance: number, amount: number) => void;
  authHeaders: Record<string, string>;
}
function OtpEmitModal({ onClose, onSuccess, authHeaders }: OtpModalProps) {
  const [step, setStep] = useState<"form" | "otp" | "success">("form");
  const [citizenId, setCitizenId] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailNote, setEmailNote] = useState<string | null>(null);
  const [successAmount, setSuccessAmount] = useState(0);

  async function handleRequestOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/emit/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({
          citizenId: parseInt(citizenId, 10),
          amount: parseFloat(amount),
          description: description || undefined,
        }),
      });
      const data = await res.json() as { ok?: boolean; error?: string; message?: string; recipient?: string; tgSent?: boolean; hasTelegram?: boolean };
      if (!res.ok) { setError(data.error ?? "Ошибка"); }
      else {
        setEmailNote(data.message ?? null);
        setStep("otp");
      }
    } catch { setError("Ошибка соединения"); }
    setLoading(false);
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/emit", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ otp: otp.trim() }),
      });
      const data = await res.json() as { ok?: boolean; error?: string; newBalance?: number; amount?: number };
      if (!res.ok) { setError(data.error ?? "Ошибка"); }
      else {
        setSuccessAmount(data.amount ?? 0);
        setStep("success");
        onSuccess(data.newBalance ?? 0, data.amount ?? 0);
      }
    } catch { setError("Ошибка соединения"); }
    setLoading(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-sm shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div>
            <h2 className="font-bold text-base font-mono">Эмиссия Дарминов</h2>
            <p className="text-xs text-muted-foreground font-mono mt-0.5">Создание новых Дарминов</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl leading-none">×</button>
        </div>

        {step === "success" ? (
          <div className="p-6 space-y-5 text-center">
            <div className="text-5xl">✅</div>
            <div>
              <div className="text-xl font-bold font-mono text-emerald-400">Эмиссия выполнена</div>
              <div className="text-sm font-mono text-muted-foreground mt-1">+ {successAmount} Д добавлено в оборот</div>
            </div>
            <p className="text-xs text-muted-foreground font-mono">Суточный лимит и Total Supply обновлены</p>
            <button onClick={onClose} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white rounded-sm py-2 text-sm font-mono font-bold transition-colors">
              Закрыть
            </button>
          </div>
        ) : step === "form" ? (
          <form onSubmit={(e) => void handleRequestOtp(e)} className="p-5 space-y-4">
            <div>
              <label className="text-xs font-mono text-muted-foreground uppercase tracking-widest block mb-1">ID гражданина-получателя</label>
              <Input value={citizenId} onChange={e => setCitizenId(e.target.value)} placeholder="4" className="font-mono bg-secondary border-border" required />
            </div>
            <div>
              <label className="text-xs font-mono text-muted-foreground uppercase tracking-widest block mb-1">Сумма (Д)</label>
              <Input value={amount} onChange={e => setAmount(e.target.value)} type="number" step="0.01" min="0.01" max="1440" placeholder="10" className="font-mono bg-secondary border-border" required />
            </div>
            <div>
              <label className="text-xs font-mono text-muted-foreground uppercase tracking-widest block mb-1">Описание (необязательно)</label>
              <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Причина эмиссии" className="font-mono bg-secondary border-border" />
            </div>
            {error && <p className="text-xs font-mono text-destructive">{error}</p>}
            <button type="submit" disabled={loading} className="w-full bg-amber-500/90 hover:bg-amber-500 text-black rounded-sm py-2 text-sm font-mono font-bold transition-colors disabled:opacity-50">
              {loading ? "Отправляю код…" : "Получить код подтверждения →"}
            </button>
            <p className="text-[10px] text-muted-foreground font-mono text-center">Код будет отправлен в Telegram</p>
          </form>
        ) : (
          <form onSubmit={(e) => void handleVerifyOtp(e)} className="p-5 space-y-4">
            {emailNote && (
              <div className={`p-3 rounded-sm text-xs font-mono border ${emailNote?.startsWith("Код отправлен") ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300" : "bg-amber-500/10 border-amber-500/30 text-amber-300"}`}>{emailNote}</div>
            )}
            <div>
              <label className="text-xs font-mono text-muted-foreground uppercase tracking-widest block mb-2">Введите 6-значный код из Telegram</label>
              <Input
                value={otp}
                onChange={e => setOtp(e.target.value)}
                placeholder="000000"
                maxLength={6}
                className="font-mono bg-secondary border-border text-center text-2xl tracking-[0.5em] h-14"
                autoFocus
                required
              />
            </div>
            {error && <p className="text-xs font-mono text-destructive">{error}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={() => { setStep("form"); setOtp(""); setError(null); }} className="flex-1 border border-border rounded-sm py-2 text-sm font-mono text-muted-foreground hover:text-foreground transition-colors">← Назад</button>
              <button type="submit" disabled={loading || otp.length !== 6} className="flex-1 bg-amber-500/90 hover:bg-amber-500 text-black rounded-sm py-2 text-sm font-mono font-bold transition-colors disabled:opacity-50">
                {loading ? "Выполняется…" : "Выполнить эмиссию"}
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground font-mono text-center">Код действует 5 минут</p>
          </form>
        )}
      </div>
    </div>
  );
}

// ── Direct Transfer Form ───────────────────────────────────────────────────────
interface TransferFormProps {
  authHeaders: Record<string, string>;
  adminBalance: number;
  onSuccess: (newBalance: number) => void;
}
function DirectTransferForm({ authHeaders, adminBalance, onSuccess }: TransferFormProps) {
  const [citizenId, setCitizenId] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setResult(null);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({
          citizenId: parseInt(citizenId, 10),
          amount: parseFloat(amount),
          description: description || undefined,
        }),
      });
      const data = await res.json() as { ok?: boolean; error?: string; newAdminBalance?: number };
      if (!res.ok) { setResult({ ok: false, msg: data.error ?? "Ошибка" }); }
      else {
        setResult({ ok: true, msg: `✓ Переведено ${amount} Д. Ваш баланс: ${(data.newAdminBalance ?? 0).toFixed(2)} Д` });
        onSuccess(data.newAdminBalance ?? 0);
        setCitizenId(""); setAmount(""); setDescription("");
      }
    } catch { setResult({ ok: false, msg: "Ошибка соединения" }); }
    setLoading(false);
  }

  return (
    <Card className="bg-card border-border max-w-md">
      <CardHeader>
        <CardTitle className="text-base font-mono">Личный перевод от Администратора</CardTitle>
        <p className="text-xs text-muted-foreground font-mono">Из вашего личного баланса · Доступно: {(adminBalance - 1).toFixed(2)} Д</p>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
          <div>
            <label className="text-xs font-mono text-muted-foreground uppercase tracking-widest block mb-1">ID гражданина</label>
            <Input value={citizenId} onChange={e => setCitizenId(e.target.value)} placeholder="4" className="font-mono bg-secondary border-border" required />
          </div>
          <div>
            <label className="text-xs font-mono text-muted-foreground uppercase tracking-widest block mb-1">Сумма (Д)</label>
            <Input value={amount} onChange={e => setAmount(e.target.value)} type="number" step="0.01" min="0.01" placeholder="10" className="font-mono bg-secondary border-border" required />
          </div>
          <div>
            <label className="text-xs font-mono text-muted-foreground uppercase tracking-widest block mb-1">Описание (необязательно)</label>
            <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Назначение перевода" className="font-mono bg-secondary border-border" />
          </div>
          <button type="submit" disabled={loading} className="w-full bg-primary/90 hover:bg-primary text-primary-foreground rounded-sm py-2 text-sm font-mono transition-colors disabled:opacity-50">
            {loading ? "Отправляю…" : "Перевести из моего баланса"}
          </button>
          {result && (
            <p className={`text-xs font-mono mt-1 ${result.ok ? "text-emerald-400" : "text-destructive"}`}>{result.msg}</p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}

// ── Main Admin Page ────────────────────────────────────────────────────────────
const SOURCE_LABELS: Record<string, string> = {
  PAID_SESSION_TAX: "Платные сессии",
  AUCTION_TAX:      "Аукционы",
  ESCROW_FEE:       "Escrow",
};

export function Admin() {
  const { citizen, authToken, refreshCitizen } = useCitizen();
  const [, navigate] = useLocation();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [treasury, setTreasury] = useState<TreasuryStats | null>(null);
  const [citizens, setCitizens] = useState<AdminCitizen[]>([]);
  const [transactions, setTransactions] = useState<AdminTx[]>([]);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"overview" | "citizens" | "transactions" | "emit" | "transfer" | "treasury">("overview");
  const [showEmitModal, setShowEmitModal] = useState(false);

  useEffect(() => { document.title = "Администратор | TimeNation"; }, []);

  useEffect(() => {
    if (citizen !== undefined && !(citizen as { isAdmin?: number } | null)?.isAdmin) {
      navigate("/");
    }
  }, [citizen, navigate]);

  const authHeaders: Record<string, string> = authToken
    ? { Authorization: `Bearer ${authToken}` }
    : {};

  const loadData = useCallback(() => {
    if (!authToken) return;
    void fetch("/api/admin/stats", { headers: authHeaders }).then(r => r.json()).then(setStats).catch(() => null);
    void fetch("/api/admin/treasury/stats", { headers: authHeaders }).then(r => r.json()).then(setTreasury).catch(() => null);
    void fetch("/api/admin/citizens", { headers: authHeaders }).then(r => r.json()).then(setCitizens).catch(() => null);
    void fetch("/api/admin/transactions?limit=50", { headers: authHeaders }).then(r => r.json()).then(setTransactions).catch(() => null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authToken]);

  useEffect(() => { loadData(); }, [loadData]);

  const filteredCitizens = citizens.filter(c =>
    !query || c.name.toLowerCase().includes(query.toLowerCase()) || c.phone.includes(query) || String(c.id).includes(query)
  );

  async function handleStatusToggle(c: AdminCitizen) {
    const newStatus = c.status === "active" ? "banned" : "active";
    await fetch(`/api/admin/citizens/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify({ status: newStatus }),
    });
    setCitizens(prev => prev.map(x => x.id === c.id ? { ...x, status: newStatus } : x));
  }

  if (!citizen || !(citizen as { isAdmin?: number }).isAdmin) return null;

  const adminBalance = Number((citizen as { balanceMinutes?: number }).balanceMinutes ?? 0);

  const TABS = [
    { id: "overview",      label: "Обзор" },
    { id: "treasury",      label: "🏦 Казначейство" },
    { id: "citizens",      label: "Граждане" },
    { id: "transactions",  label: "Транзакции" },
    { id: "emit",          label: "Эмиссия" },
    { id: "transfer",      label: "Перевод" },
  ] as const;

  return (
    <Layout>
      {showEmitModal && (
        <OtpEmitModal
          authHeaders={authHeaders}
          onClose={() => setShowEmitModal(false)}
          onSuccess={(_newBal, _amount) => {
            // modal shows success screen itself — just refresh data in background
            loadData();
            void refreshCitizen();
            // second refresh after short delay to ensure DB write is visible
            setTimeout(() => { loadData(); }, 800);
          }}
        />
      )}

      <div className="space-y-6">
        <div className="flex items-center gap-3 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Панель администратора</h1>
            <p className="text-muted-foreground font-mono text-sm mt-1">Системное управление · TimeNation</p>
          </div>
          <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30 font-mono ml-auto">
            ADMIN #{citizen.id}
          </Badge>
        </div>

        {/* Total Supply Banner */}
        {stats && (
          <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-sm flex flex-wrap items-center gap-4">
            <div>
              <div className="text-[10px] font-mono text-amber-300/70 uppercase tracking-widest">Общий объём валюты</div>
              <div className="text-2xl font-bold font-mono text-amber-300">
                {Number(stats.citizens.totalBalance).toFixed(2)} Д
              </div>
            </div>
            <div className="border-l border-amber-500/30 pl-4">
              <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">Эмиссия за 24ч</div>
              <div className="text-base font-mono text-foreground">
                {stats.emission.emitted24h.toFixed(2)} / {stats.emission.dailyCap} Д
              </div>
              <div className="text-[10px] font-mono text-muted-foreground">
                осталось: {stats.emission.remainingCap.toFixed(2)} Д
              </div>
            </div>
            <div className="ml-auto">
              <div className="w-40 h-2 bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-500 rounded-full transition-all"
                  style={{ width: `${Math.min(100, (stats.emission.emitted24h / stats.emission.dailyCap) * 100)}%` }}
                />
              </div>
              <div className="text-[10px] font-mono text-muted-foreground mt-1 text-right">
                {((stats.emission.emitted24h / stats.emission.dailyCap) * 100).toFixed(1)}% лимита
              </div>
            </div>
          </div>
        )}

        {/* Tab bar */}
        <div className="flex gap-1 border-b border-border overflow-x-auto">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm font-mono whitespace-nowrap transition-colors border-b-2 -mb-px ${
                tab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* OVERVIEW */}
        {tab === "overview" && stats && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "Граждан",         value: stats.citizens.total,                              unit: "" },
              { label: "В обороте",        value: Number(stats.citizens.totalBalance).toFixed(2),   unit: "Д" },
              { label: "Сессий TiMETR",   value: stats.sessions.total,                              unit: "" },
              { label: "Транзакций",      value: stats.transactions.total,                          unit: "" },
            ].map(item => (
              <Card key={item.label} className="bg-card border-border">
                <CardContent className="pt-6">
                  <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest">{item.label}</p>
                  <p className="text-3xl font-bold mt-1 font-mono text-primary">
                    {item.value}{item.unit && <span className="text-lg ml-1 text-muted-foreground">{item.unit}</span>}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* CITIZENS */}
        {tab === "citizens" && (
          <div className="space-y-4">
            <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Поиск по имени, телефону или ID..." className="max-w-sm bg-secondary border-border font-mono text-sm" />
            <Card className="bg-card border-border">
              <CardHeader className="pb-2">
                <div className="grid grid-cols-[2.5rem_1fr_5rem_4rem_5rem_5rem_5rem] gap-2 text-xs font-mono text-muted-foreground uppercase tracking-widest">
                  <span>#</span><span>Гражданин</span><span className="text-right">Ранг</span><span className="text-right">Merit</span><span className="text-right">Баланс</span><span className="text-right">Статус</span><span className="text-right">Действие</span>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-border/50">
                  {filteredCitizens.map(c => (
                    <div key={c.id} className="grid grid-cols-[2.5rem_1fr_5rem_4rem_5rem_5rem_5rem] gap-2 items-center px-6 py-2 hover:bg-secondary/30 transition-colors">
                      <span className="text-xs font-mono text-muted-foreground">#{c.id}</span>
                      <div className="min-w-0">
                        <div className="font-medium text-sm truncate flex items-center gap-1">
                          {c.name}
                          {c.isAdmin === 1 && <span className="text-[9px] font-mono bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded px-1">ADM</span>}
                        </div>
                        <div className="text-[10px] font-mono text-muted-foreground">{c.phone}</div>
                      </div>
                      <div className="text-right text-xs font-mono text-muted-foreground truncate">{c.rank}</div>
                      <div className="text-right font-mono text-sm text-primary">{c.meritScore ?? 0}</div>
                      <div className="text-right font-mono text-sm">{Number(c.balanceMinutes).toFixed(2)} Д</div>
                      <div className="text-right">
                        <Badge variant="outline" className={`text-[10px] font-mono ${STATUS_STYLES[c.status] ?? ""}`}>{c.status}</Badge>
                      </div>
                      <div className="text-right">
                        <button
                          onClick={() => void handleStatusToggle(c)}
                          className={`text-[10px] font-mono px-2 py-0.5 rounded border transition-colors ${c.status === "active" ? "border-red-500/30 text-red-300 hover:bg-red-500/10" : "border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10"}`}
                        >
                          {c.status === "active" ? "Бан" : "Разбан"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* TRANSACTIONS */}
        {tab === "transactions" && (
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-mono text-muted-foreground">Последние 50 транзакций</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-border/50">
                {transactions.map(tx => (
                  <div key={tx.id} className="flex items-center gap-4 px-6 py-2 hover:bg-secondary/30 text-sm">
                    <span className="text-xs font-mono text-muted-foreground w-8">#{tx.id}</span>
                    <span className="font-mono text-xs w-20 text-muted-foreground">{new Date(tx.createdAt).toLocaleDateString("ru")}</span>
                    <span className="font-mono text-xs text-muted-foreground truncate">{tx.fromCitizenName} → {tx.toCitizenName}</span>
                    <span className="font-mono text-sm text-primary ml-auto shrink-0">{Number(tx.minutesTransferred).toFixed(2)} Д</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* EMIT */}
        {tab === "emit" && (
          <div className="space-y-4 max-w-md">
            <div className="p-4 bg-card border border-border rounded-sm space-y-2">
              <div className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Суточный лимит эмиссии</div>
              {stats && (
                <>
                  <div className="flex justify-between font-mono text-sm">
                    <span>Выпущено сегодня:</span>
                    <span className="text-primary">{stats.emission.emitted24h.toFixed(2)} Д</span>
                  </div>
                  <div className="flex justify-between font-mono text-sm">
                    <span>Осталось:</span>
                    <span className="text-emerald-400">{stats.emission.remainingCap.toFixed(2)} Д</span>
                  </div>
                  <div className="flex justify-between font-mono text-sm text-muted-foreground">
                    <span>Макс / 24ч:</span>
                    <span>{stats.emission.dailyCap} Д</span>
                  </div>
                  <div className="w-full h-2 bg-secondary rounded-full overflow-hidden mt-2">
                    <div
                      className="h-full bg-amber-500 rounded-full transition-all"
                      style={{ width: `${Math.min(100, (stats.emission.emitted24h / stats.emission.dailyCap) * 100)}%` }}
                    />
                  </div>
                </>
              )}
            </div>
            <button
              onClick={() => setShowEmitModal(true)}
              className="w-full bg-amber-500/90 hover:bg-amber-500 text-black rounded-sm py-3 text-sm font-mono font-bold transition-colors"
            >
              Открыть форму эмиссии →
            </button>
            <p className="text-xs text-muted-foreground font-mono">Для подтверждения эмиссии потребуется код, отправленный в Telegram-бот</p>
          </div>
        )}

        {/* TREASURY */}
        {tab === "treasury" && (
          <div className="space-y-6">
            {/* KPI cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-amber-950/40 border border-amber-500/30 p-5 rounded-xl">
                <span className="text-amber-400 text-xs font-semibold uppercase tracking-wider font-mono">Государственный Налоговый Пул</span>
                <div className="text-3xl font-bold text-amber-200 mt-2 font-mono">
                  {treasury ? treasury.totalTaxCollected.toFixed(4) : "—"} Д
                </div>
                <span className="text-xs text-amber-500/80 mt-1 block font-mono">+2% со всех платных сессий и аукционов</span>
              </div>

              <div className="bg-card border border-border p-5 rounded-xl">
                <span className="text-muted-foreground text-xs font-semibold uppercase tracking-wider font-mono">Поступления за 24ч</span>
                <div className="text-2xl font-bold text-emerald-400 mt-2 font-mono">
                  +{treasury ? treasury.todayTaxCollected.toFixed(4) : "0.0000"} Д
                </div>
              </div>

              <div className="bg-card border border-border p-5 rounded-xl">
                <span className="text-muted-foreground text-xs font-semibold uppercase tracking-wider font-mono">Источники (все время)</span>
                <div className="mt-3 space-y-1.5">
                  {treasury?.taxBySource.map(s => (
                    <div key={s.sourceType} className="flex justify-between text-xs font-mono">
                      <span className="text-muted-foreground">{SOURCE_LABELS[s.sourceType] ?? s.sourceType}</span>
                      <span className="text-amber-300">{Number(s.total).toFixed(4)} Д</span>
                    </div>
                  )) ?? <span className="text-xs text-muted-foreground font-mono">Нет данных</span>}
                </div>
              </div>
            </div>

            {/* Recent tax log table */}
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-foreground font-mono">История пополнения Казначейства</h3>
                <button
                  onClick={() => void fetch("/api/admin/treasury/stats", { headers: authHeaders }).then(r => r.json()).then(setTreasury).catch(() => null)}
                  className="text-xs font-mono text-muted-foreground hover:text-foreground transition-colors"
                >
                  ↻ Обновить
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs font-mono">
                  <thead>
                    <tr className="text-muted-foreground uppercase tracking-wider border-b border-border">
                      <th className="text-left pb-2 pr-4">ID</th>
                      <th className="text-left pb-2 pr-4">Источник</th>
                      <th className="text-right pb-2 pr-4">Сумма</th>
                      <th className="text-right pb-2 pr-4">Гражданин</th>
                      <th className="text-right pb-2 pr-4">Ref ID</th>
                      <th className="text-right pb-2">Время</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {treasury?.recentLogs.length === 0 && (
                      <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">Налоговых поступлений ещё нет</td></tr>
                    )}
                    {treasury?.recentLogs.map(log => (
                      <tr key={log.id} className="hover:bg-secondary/20 transition-colors">
                        <td className="py-1.5 pr-4 text-muted-foreground">#{log.id}</td>
                        <td className="py-1.5 pr-4">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                            log.sourceType === "PAID_SESSION_TAX" ? "bg-amber-500/20 text-amber-300" :
                            log.sourceType === "AUCTION_TAX"      ? "bg-blue-500/20 text-blue-300"   :
                            "bg-zinc-500/20 text-zinc-300"
                          }`}>
                            {SOURCE_LABELS[log.sourceType] ?? log.sourceType}
                          </span>
                        </td>
                        <td className="py-1.5 pr-4 text-right text-emerald-400">+{Number(log.amount).toFixed(4)} Д</td>
                        <td className="py-1.5 pr-4 text-right text-muted-foreground">#{log.fromCitizenId}</td>
                        <td className="py-1.5 pr-4 text-right text-muted-foreground">#{log.referenceId}</td>
                        <td className="py-1.5 text-right text-muted-foreground">
                          {new Date(log.createdAt).toLocaleString("ru-RU", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* DIRECT TRANSFER */}
        {tab === "transfer" && (
          <DirectTransferForm
            authHeaders={authHeaders}
            adminBalance={adminBalance}
            onSuccess={() => {
              loadData();
              void refreshCitizen();
            }}
          />
        )}
      </div>
    </Layout>
  );
}
