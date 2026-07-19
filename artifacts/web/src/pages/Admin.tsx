import { useEffect, useState } from "react";
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
}

interface AdminCitizen {
  id: number;
  name: string;
  phone: string;
  rank: string;
  meritScore: number;
  balanceMinutes: number;
  totalGiven: number;
  totalReceived: number;
  status: string;
  govRole: string;
  isAdmin: number;
  registrationStatus: string | null;
  createdAt: string;
  lastActivity: string | null;
  telegramId: string | null;
  citizenNumber: string | null;
}

interface AdminTx {
  id: number;
  fromCitizenId: number;
  toCitizenId: number;
  amount: number;
  type: string;
  description: string | null;
  createdAt: string;
}

const STATUS_STYLES: Record<string, string> = {
  active:   "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  banned:   "bg-red-500/20 text-red-300 border-red-500/30",
  inactive: "bg-zinc-500/20 text-zinc-300 border-zinc-500/30",
};

export function Admin() {
  const { citizen, authToken } = useCitizen();
  const [, navigate] = useLocation();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [citizens, setCitizens] = useState<AdminCitizen[]>([]);
  const [transactions, setTransactions] = useState<AdminTx[]>([]);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"overview" | "citizens" | "transactions" | "emit">("overview");
  const [emitCitizenId, setEmitCitizenId] = useState("");
  const [emitAmount, setEmitAmount] = useState("");
  const [emitDesc, setEmitDesc] = useState("");
  const [emitResult, setEmitResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    document.title = "Администратор | TimeNation";
  }, []);

  // Redirect non-admins
  useEffect(() => {
    if (citizen !== undefined && !(citizen as { isAdmin?: number } | null)?.isAdmin) {
      navigate("/");
    }
  }, [citizen, navigate]);

  const headers = authToken ? { Authorization: `Bearer ${authToken}` } : undefined;

  useEffect(() => {
    if (!authToken) return;
    void fetch("/api/admin/stats", { headers })
      .then(r => r.json())
      .then(setStats)
      .catch(() => null);
    void fetch("/api/admin/citizens", { headers })
      .then(r => r.json())
      .then(setCitizens)
      .catch(() => null);
    void fetch("/api/admin/transactions?limit=50", { headers })
      .then(r => r.json())
      .then(setTransactions)
      .catch(() => null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authToken]);

  const filteredCitizens = citizens.filter(c =>
    !query ||
    c.name.toLowerCase().includes(query.toLowerCase()) ||
    c.phone.includes(query) ||
    String(c.id).includes(query)
  );

  async function handleStatusToggle(c: AdminCitizen) {
    const newStatus = c.status === "active" ? "banned" : "active";
    await fetch(`/api/admin/citizens/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ status: newStatus }),
    });
    setCitizens(prev => prev.map(x => x.id === c.id ? { ...x, status: newStatus } : x));
  }

  async function handleEmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setEmitResult(null);
    try {
      const res = await fetch("/api/admin/emit", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({
          citizenId: parseInt(emitCitizenId, 10),
          amount: parseFloat(emitAmount),
          description: emitDesc || undefined,
        }),
      });
      const data = await res.json() as { ok?: boolean; newBalance?: number; error?: string };
      if (data.ok) {
        setEmitResult(`✓ Готово. Новый баланс: ${(data.newBalance ?? 0).toFixed(2)} Д`);
        setEmitCitizenId("");
        setEmitAmount("");
        setEmitDesc("");
      } else {
        setEmitResult(`Ошибка: ${data.error ?? "неизвестная"}`);
      }
    } catch {
      setEmitResult("Ошибка соединения");
    }
    setLoading(false);
  }

  if (!citizen || !(citizen as { isAdmin?: number }).isAdmin) {
    return null;
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Панель администратора</h1>
            <p className="text-muted-foreground font-mono text-sm mt-1">
              Системное управление · TimeNation
            </p>
          </div>
          <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30 font-mono ml-auto">
            ADMIN #{citizen.id}
          </Badge>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 border-b border-border">
          {(["overview", "citizens", "transactions", "emit"] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-mono transition-colors border-b-2 -mb-px ${
                tab === t
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {{ overview: "Обзор", citizens: "Граждане", transactions: "Транзакции", emit: "Эмиссия" }[t]}
            </button>
          ))}
        </div>

        {/* OVERVIEW */}
        {tab === "overview" && stats && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "Граждан",       value: stats.citizens.total,                             unit: "" },
              { label: "Дарминов в обороте", value: Number(stats.citizens.totalBalance).toFixed(2), unit: "Д" },
              { label: "Сессий",        value: stats.sessions.total,                             unit: "" },
              { label: "Транзакций",    value: stats.transactions.total,                         unit: "" },
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
            <Input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Поиск по имени, телефону или ID..."
              className="max-w-sm bg-secondary border-border font-mono text-sm"
            />
            <Card className="bg-card border-border">
              <CardHeader className="pb-2">
                <div className="grid grid-cols-[2rem_1fr_6rem_5rem_5rem_6rem_6rem] gap-2 text-xs font-mono text-muted-foreground uppercase tracking-widest">
                  <span>#</span>
                  <span>Гражданин</span>
                  <span className="text-right">Ранг</span>
                  <span className="text-right">Merit</span>
                  <span className="text-right">Баланс</span>
                  <span className="text-right">Статус</span>
                  <span className="text-right">Действие</span>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-border/50">
                  {filteredCitizens.map(c => (
                    <div key={c.id} className="grid grid-cols-[2rem_1fr_6rem_5rem_5rem_6rem_6rem] gap-2 items-center px-6 py-2 hover:bg-secondary/30 transition-colors">
                      <span className="text-xs font-mono text-muted-foreground">#{c.id}</span>
                      <div className="min-w-0">
                        <div className="font-medium text-sm truncate flex items-center gap-1">
                          {c.name}
                          {c.isAdmin === 1 && (
                            <span className="text-[9px] font-mono bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded px-1">ADM</span>
                          )}
                        </div>
                        <div className="text-[10px] font-mono text-muted-foreground">{c.phone}</div>
                      </div>
                      <div className="text-right text-xs font-mono text-muted-foreground truncate">{c.rank}</div>
                      <div className="text-right font-mono text-sm text-primary">{c.meritScore ?? 0}</div>
                      <div className="text-right font-mono text-sm">{Number(c.balanceMinutes).toFixed(2)} Д</div>
                      <div className="text-right">
                        <Badge
                          variant="outline"
                          className={`text-[10px] font-mono ${STATUS_STYLES[c.status] ?? ""}`}
                        >
                          {c.status}
                        </Badge>
                      </div>
                      <div className="text-right">
                        <button
                          onClick={() => void handleStatusToggle(c)}
                          className={`text-[10px] font-mono px-2 py-0.5 rounded border transition-colors ${
                            c.status === "active"
                              ? "border-red-500/30 text-red-300 hover:bg-red-500/10"
                              : "border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10"
                          }`}
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
                    <span className="font-mono text-muted-foreground text-xs w-16">
                      {new Date(tx.createdAt).toLocaleDateString("ru")}
                    </span>
                    <span className="font-mono text-xs w-24 truncate text-muted-foreground">
                      #{tx.fromCitizenId} → #{tx.toCitizenId}
                    </span>
                    <span className="font-mono text-sm text-primary w-20 text-right">
                      {Number(tx.amount).toFixed(2)} Д
                    </span>
                    <span className="font-mono text-xs text-muted-foreground truncate flex-1">
                      {tx.type}{tx.description ? ` · ${tx.description}` : ""}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* EMIT */}
        {tab === "emit" && (
          <Card className="bg-card border-border max-w-md">
            <CardHeader>
              <CardTitle className="text-base font-mono">Ручная эмиссия Дарминов</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={(e) => void handleEmit(e)} className="space-y-3">
                <div>
                  <label className="text-xs font-mono text-muted-foreground uppercase tracking-widest block mb-1">ID гражданина</label>
                  <Input
                    value={emitCitizenId}
                    onChange={e => setEmitCitizenId(e.target.value)}
                    placeholder="1"
                    className="font-mono bg-secondary border-border"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-mono text-muted-foreground uppercase tracking-widest block mb-1">Сумма (Д)</label>
                  <Input
                    value={emitAmount}
                    onChange={e => setEmitAmount(e.target.value)}
                    placeholder="10"
                    type="number"
                    step="0.01"
                    min="0.01"
                    className="font-mono bg-secondary border-border"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-mono text-muted-foreground uppercase tracking-widest block mb-1">Описание (необязательно)</label>
                  <Input
                    value={emitDesc}
                    onChange={e => setEmitDesc(e.target.value)}
                    placeholder="Причина эмиссии"
                    className="font-mono bg-secondary border-border"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-primary/90 hover:bg-primary text-primary-foreground rounded-sm py-2 text-sm font-mono transition-colors disabled:opacity-50"
                >
                  {loading ? "Выполняется…" : "Выполнить эмиссию"}
                </button>
                {emitResult && (
                  <p className={`text-xs font-mono mt-2 ${emitResult.startsWith("✓") ? "text-emerald-400" : "text-destructive"}`}>
                    {emitResult}
                  </p>
                )}
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}
