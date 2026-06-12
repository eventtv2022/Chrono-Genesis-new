import { useState } from "react";
import { Layout } from "@/components/Layout";
import { Card, CardContent } from "@/components/ui/card";
import { Search, FileText, CreditCard, Clock, AlertCircle, ExternalLink, Shield } from "lucide-react";

interface LookupResult {
  status: "issued" | "pending";
  citizenNumber: string;
  name?: string;
  rank?: string;
  idCardUrl?: string;
  passportUrl?: string;
  message?: string;
}

export function PassportLookup() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<LookupResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    const raw = input.trim().replace(/\D/g, "");
    if (!raw) return;

    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const res = await fetch(`/api/citizens/lookup/${raw}`);
      const data = await res.json() as LookupResult & { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Гражданин не найден в реестре");
        return;
      }
      setResult(data);
    } catch {
      setError("Ошибка соединения с реестром. Проверьте подключение.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Layout>
      <div className="max-w-lg space-y-6">

        <div className="flex items-center gap-3">
          <Shield className="w-7 h-7 text-primary shrink-0" />
          <div>
            <h1 className="text-2xl font-mono font-bold text-foreground tracking-widest uppercase">
              Реестр граждан
            </h1>
            <p className="text-sm text-muted-foreground font-mono mt-0.5">
              Восстановление доступа к документам
            </p>
          </div>
        </div>

        <Card className="bg-card border-border">
          <CardContent className="p-6">
            <form onSubmit={handleLookup} className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-mono text-muted-foreground uppercase tracking-widest">
                  Номер гражданина (9 цифр)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={input}
                    onChange={e => {
                      const v = e.target.value.replace(/\D/g, "").slice(0, 9);
                      setInput(v);
                    }}
                    placeholder="000000000"
                    maxLength={9}
                    className="w-full bg-background border border-border rounded-sm px-4 py-3 font-mono text-xl tracking-[0.3em] text-center text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary transition-colors"
                  />
                </div>
                <p className="text-xs text-muted-foreground font-mono text-center">
                  Номер выдан при регистрации. Только цифры.
                </p>
              </div>

              <button
                type="submit"
                disabled={loading || input.replace(/\D/g, "").length === 0}
                className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 disabled:opacity-40 text-primary-foreground font-mono font-bold py-3 px-4 rounded-sm transition-colors"
              >
                {loading ? (
                  <span className="animate-pulse">Поиск в реестре…</span>
                ) : (
                  <>
                    <Search className="w-4 h-4" />
                    ПОЛУЧИТЬ ДОКУМЕНТЫ
                  </>
                )}
              </button>
            </form>
          </CardContent>
        </Card>

        {error && (
          <Card className="bg-destructive/10 border-destructive/30">
            <CardContent className="p-5 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
              <div>
                <p className="font-mono font-semibold text-destructive text-sm">Гражданин не найден</p>
                <p className="text-muted-foreground text-xs font-mono mt-1">{error}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {result?.status === "pending" && (
          <Card className="bg-yellow-500/10 border-yellow-500/30">
            <CardContent className="p-5 flex items-start gap-3">
              <Clock className="w-5 h-5 text-yellow-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-mono font-semibold text-yellow-400 text-sm uppercase tracking-wide">
                  Верификация в процессе
                </p>
                <p className="text-muted-foreground text-xs font-mono mt-1">
                  {result.message}
                </p>
                <p className="text-muted-foreground text-xs font-mono mt-2">
                  Номер гражданина:{" "}
                  <span className="text-foreground font-bold tracking-widest">{result.citizenNumber}</span>
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {result?.status === "issued" && (
          <Card className="bg-card border-border">
            <CardContent className="p-6 space-y-5">
              <div className="pb-4 border-b border-border space-y-1">
                <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest">
                  Гражданин подтверждён
                </p>
                <p className="text-2xl font-mono font-bold text-primary tracking-widest">
                  {result.citizenNumber}
                </p>
                <p className="text-base font-semibold text-foreground">{result.name}</p>
                {result.rank && (
                  <p className="text-xs font-mono text-muted-foreground">{result.rank}</p>
                )}
              </div>

              <div className="space-y-3">
                <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest">
                  Документы
                </p>
                <a
                  href={result.idCardUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 w-full bg-primary/10 hover:bg-primary/20 border border-primary/40 text-primary font-mono font-bold py-4 px-5 rounded-sm transition-colors"
                >
                  <CreditCard className="w-5 h-5 shrink-0" />
                  <span className="flex-1 uppercase tracking-wide text-sm">ID-карта TimeNation</span>
                  <ExternalLink className="w-4 h-4 opacity-60" />
                </a>
                <a
                  href={result.passportUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 w-full bg-muted/40 hover:bg-muted/70 border border-border text-muted-foreground hover:text-foreground font-mono py-4 px-5 rounded-sm transition-colors"
                >
                  <FileText className="w-5 h-5 shrink-0" />
                  <span className="flex-1 uppercase tracking-wide text-sm">Паспорт (классический)</span>
                  <ExternalLink className="w-4 h-4 opacity-60" />
                </a>
              </div>

              <p className="text-xs text-muted-foreground font-mono text-center pt-1">
                Откройте ссылку и сохраните файл через «Сохранить как» в браузере
              </p>
            </CardContent>
          </Card>
        )}

      </div>
    </Layout>
  );
}
