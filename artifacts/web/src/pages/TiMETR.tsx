import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowRight, CheckCircle2, Clock3, LoaderCircle, Play, Search, Square, Users } from "lucide-react";
import { Layout } from "@/components/Layout";
import { useCitizen } from "@/context/CitizenContext";
import { useLanguage } from "@/context/LanguageContext";
import { getListCitizensQueryKey, useListCitizens } from "@workspace/api-client-react";

type CitizenOption = {
  id: number;
  name: string;
  balanceMinutes: number;
  rank?: string;
};

type ActiveSession = {
  id: number;
  toCitizenId: number;
  startedAt: string;
};

type CompletedSession = {
  transaction: {
    minutesTransferred: number;
    durationSeconds: number;
  };
};

function formatElapsed(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return [hours, minutes, remainder].map(value => String(value).padStart(2, "0")).join(":");
}

export function TiMETR() {
  const { citizen, authToken, authHeaders, refreshCitizen } = useCitizen();
  const { lang } = useLanguage();
  const isRu = lang === "ru";
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<CompletedSession | null>(null);

  const { data: citizens = [], isLoading, isError, refetch } = useListCitizens({
    query: { queryKey: getListCitizensQueryKey(), enabled: !!citizen },
  });

  useEffect(() => {
    document.title = "TiMETR | TimeNation";
  }, []);

  useEffect(() => {
    if (!activeSession) return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [activeSession]);

  const recipients = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    return (citizens as CitizenOption[])
      .filter(person => person.id !== citizen?.id)
      .filter(person => !needle || person.name.toLocaleLowerCase().includes(needle) || String(person.id).includes(needle))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [citizens, citizen?.id, search]);
  const selectedRecipient = recipients.find(person => person.id === selectedId)
    ?? (citizens as CitizenOption[]).find(person => person.id === selectedId);
  const elapsed = activeSession
    ? Math.max(0, Math.floor((now - new Date(activeSession.startedAt).getTime()) / 1000))
    : 0;

  async function startSession() {
    if (!citizen || !authToken || !selectedRecipient) return;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const response = await fetch("/api/sessions", {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ fromCitizenId: citizen.id, toCitizenId: selectedRecipient.id }),
      });
      const body = await response.json() as ActiveSession & { error?: string };
      if (!response.ok) throw new Error(body.error || (isRu ? "Не удалось начать сессию." : "Could not start the session."));
      setActiveSession(body);
      setNow(Date.now());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (isRu ? "Ошибка соединения." : "Connection error."));
    } finally {
      setBusy(false);
    }
  }

  async function stopSession() {
    if (!activeSession || !authToken) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/sessions/${activeSession.id}/stop`, {
        method: "POST",
        headers: authHeaders,
      });
      const body = await response.json() as CompletedSession & { error?: string };
      if (!response.ok) throw new Error(body.error || (isRu ? "Не удалось завершить сессию." : "Could not complete the session."));
      setResult(body);
      setActiveSession(null);
      await refreshCitizen();
      await queryClient.invalidateQueries({ queryKey: getListCitizensQueryKey() });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (isRu ? "Ошибка соединения." : "Connection error."));
    } finally {
      setBusy(false);
    }
  }

  const copy = isRu ? {
    title: "TiMETR", subtitle: "Передавайте время через реальные сессии взаимодействия.",
    balance: "Ваш баланс", recipient: "Кому передать время", search: "Имя или ID гражданина",
    choose: "Выберите гражданина", start: "Начать сессию", stop: "Завершить сессию",
    active: "Сессия идёт", estimated: "Будет передано примерно", noRecipients: "Другие граждане не найдены.",
    loading: "Загружаем список граждан…", retry: "Повторить", login: "Войдите в аккаунт гражданина, чтобы начать TiMETR.",
    loginAction: "Войти", success: "Сессия завершена", transferred: "Передано минут", duration: "Длительность",
    reserve: "Одна родовая минута остаётся непередаваемой.", error: "Не удалось выполнить действие.",
  } : {
    title: "TiMETR", subtitle: "Transfer time through real interaction sessions.",
    balance: "Your balance", recipient: "Transfer time to", search: "Citizen name or ID",
    choose: "Choose a citizen", start: "Start session", stop: "End session",
    active: "Session in progress", estimated: "Estimated transfer",
    noRecipients: "No other citizens found.", loading: "Loading citizens…", retry: "Retry",
    login: "Sign in to your citizen account to start TiMETR.", loginAction: "Sign in",
    success: "Session completed", transferred: "Minutes transferred", duration: "Duration",
    reserve: "One ancestral minute is non-transferable.", error: "Could not complete the action.",
  };

  return (
    <Layout>
      <main className="mx-auto w-full max-w-5xl space-y-6 pb-10">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2 text-primary">
              <Clock3 className="h-5 w-5" />
              <span className="font-mono text-xs font-semibold uppercase tracking-[0.22em]">TimeNation</span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight">{copy.title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{copy.subtitle}</p>
          </div>
          {citizen && (
            <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
              <p className="text-xs text-muted-foreground">{copy.balance}</p>
              <p className="font-mono text-xl font-semibold text-primary">{Number(citizen.balanceMinutes).toFixed(2)} Д</p>
            </div>
          )}
        </header>

        {!citizen || !authToken ? (
          <section className="rounded-2xl border border-border bg-card p-6 sm:p-8">
            <p className="text-muted-foreground">{copy.login}</p>
            <Link href="/login" className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground">
              {copy.loginAction}<ArrowRight className="h-4 w-4" />
            </Link>
          </section>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.72fr)]">
            <section className={`rounded-2xl border bg-card p-6 sm:p-8 ${activeSession ? "border-primary/40 shadow-lg shadow-primary/5" : "border-border"}`}>
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <span className={`h-2 w-2 rounded-full ${activeSession ? "animate-pulse bg-emerald-400" : "bg-muted-foreground/40"}`} />
                {activeSession ? copy.active : copy.title}
              </div>
              <div className="py-8 text-center">
                <div className={`font-mono text-[clamp(3rem,10vw,5.5rem)] font-light leading-none tracking-tight tabular-nums ${activeSession ? "text-primary" : "text-foreground"}`} aria-live="off">
                  {formatElapsed(elapsed)}
                </div>
                {activeSession ? (
                  <div className="mt-5 space-y-1 text-sm text-muted-foreground">
                    <p>{copy.recipient}: <span className="font-semibold text-foreground">{selectedRecipient?.name ?? (citizens as CitizenOption[]).find(person => person.id === activeSession.toCitizenId)?.name}</span></p>
                    <p>{copy.estimated}: <span className="font-mono text-primary">~{Math.max(1, Math.ceil(elapsed / 60))} Д</span></p>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">{copy.reserve}</p>
                )}
              </div>

              {activeSession ? (
                <button type="button" onClick={() => void stopSession()} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-destructive px-5 py-3.5 font-semibold text-destructive-foreground transition hover:opacity-90 disabled:opacity-60">
                  {busy ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Square className="h-4 w-4" />}
                  {copy.stop}
                </button>
              ) : (
                <button type="button" onClick={() => void startSession()} disabled={busy || !selectedRecipient} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3.5 font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">
                  {busy ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Play className="h-4 w-4 fill-current" />}
                  {copy.start}
                </button>
              )}
              {error && <p role="alert" className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
            </section>

            <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
              <div className="mb-4 flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                <h2 className="font-semibold">{copy.recipient}</h2>
              </div>
              {!activeSession && (
                <label className="relative mb-3 block">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input value={search} onChange={event => setSearch(event.target.value)} placeholder={copy.search} className="w-full rounded-lg border border-border bg-background py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-primary" />
                </label>
              )}
              {isLoading ? <p className="py-6 text-center text-sm text-muted-foreground">{copy.loading}</p>
                : isError ? <div className="py-5 text-center text-sm text-muted-foreground">
                  <p>{copy.error}</p><button type="button" onClick={() => void refetch()} className="mt-2 text-primary underline">{copy.retry}</button>
                </div>
                : recipients.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">{copy.noRecipients}</p>
                : <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
                  {recipients.map(person => {
                    const isSelected = (activeSession?.toCitizenId ?? selectedId) === person.id;
                    return (
                      <button key={person.id} type="button" onClick={() => !activeSession && setSelectedId(person.id)} disabled={!!activeSession} className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${isSelected ? "border-primary/50 bg-primary/10" : "border-border bg-background/50 hover:border-primary/30 hover:bg-secondary/50"} disabled:cursor-default`}>
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 font-semibold text-primary">{person.name.slice(0, 1).toLocaleUpperCase()}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{person.name}</span>
                          <span className="block truncate text-xs text-muted-foreground">#{person.id}{person.rank ? ` · ${person.rank}` : ""}</span>
                        </span>
                        <span className="whitespace-nowrap font-mono text-xs text-muted-foreground">{Number(person.balanceMinutes).toFixed(2)} Д</span>
                        {isSelected && <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />}
                      </button>
                    );
                  })}
                </div>
              }
            </section>
          </div>
        )}

        {result && (
          <section role="status" className="flex flex-wrap items-center gap-x-8 gap-y-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5">
            <CheckCircle2 className="h-6 w-6 text-emerald-400" />
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold text-emerald-300">{copy.success}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{copy.transferred}: <span className="font-mono text-foreground">{Number(result.transaction.minutesTransferred).toFixed(2)} Д</span></p>
            </div>
            <div className="text-sm text-muted-foreground">{copy.duration}: <span className="font-mono text-foreground">{formatElapsed(result.transaction.durationSeconds)}</span></div>
          </section>
        )}
      </main>
    </Layout>
  );
}
