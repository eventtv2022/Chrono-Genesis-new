import { useCallback, useEffect, useState } from "react";
import { Layout } from "@/components/Layout";
import { useCitizen } from "@/context/CitizenContext";

interface GovernmentPoll {
  id: number;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  yesCount: number;
  noCount: number;
  myVote: "yes" | "no" | null;
  ballots: { voterName: string; vote: string }[];
}

function remainingTime(endsAt: string, now: number): string {
  const remaining = new Date(endsAt).getTime() - now;
  if (remaining <= 0) return "Завершается";
  const hours = Math.floor(remaining / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);
  return `${hours} ч ${minutes} мин`;
}

export function GovPolls() {
  const { authToken } = useCitizen();
  const [polls, setPolls] = useState<GovernmentPoll[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const fetchPolls = useCallback(async () => {
    if (!authToken) {
      setLoading(false);
      setError("Войдите в аккаунт, чтобы открыть голосования.");
      return;
    }
    try {
      const response = await fetch("/api/gov/polls", {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { error?: string };
        setError(data.error ?? "Не удалось загрузить голосования.");
        setPolls([]);
        return;
      }
      setError(null);
      setPolls(await response.json() as GovernmentPoll[]);
    } catch {
      setError("Ошибка сети при загрузке голосований.");
    } finally {
      setLoading(false);
    }
  }, [authToken]);

  useEffect(() => {
    void fetchPolls();
    const refresh = window.setInterval(() => void fetchPolls(), 15_000);
    const clock = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      window.clearInterval(refresh);
      window.clearInterval(clock);
    };
  }, [fetchPolls]);

  async function castVote(pollId: number, vote: "yes" | "no") {
    if (!authToken) return;
    setBusyId(pollId);
    setError(null);
    try {
      const response = await fetch(`/api/gov/polls/${pollId}/cast`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ vote }),
      });
      const data = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Не удалось записать голос.");
      } else {
        await fetchPolls();
      }
    } catch {
      setError("Ошибка сети при отправке голоса.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Layout>
      <main className="max-w-3xl mx-auto px-4 py-6">
        <header className="mb-6">
          <div className="text-3xl mb-2" aria-hidden="true">🗳️</div>
          <h1 className="text-xl font-bold text-foreground">Общие голосования</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Здесь появляются голосования, открытые для вашей роли. Результаты и список голосов видны участникам.
          </p>
        </header>

        {error && (
          <div role="alert" className="mb-4 rounded-xl border border-red-700/40 bg-red-900/20 p-3 text-sm text-red-200">
            {error}
          </div>
        )}

        {loading && (
          <div className="py-12 text-center text-sm text-muted-foreground">Загрузка голосований…</div>
        )}

        {!loading && !error && polls.length === 0 && (
          <div className="rounded-2xl border border-border bg-muted/20 py-10 px-5 text-center">
            <div className="text-3xl mb-3" aria-hidden="true">⏳</div>
            <p className="font-semibold text-foreground">Сейчас нет открытых для вас голосований</p>
            <p className="text-sm text-muted-foreground mt-1">Запланированное голосование появится здесь в назначенное время.</p>
          </div>
        )}

        <div className="space-y-4">
          {polls.map((poll) => {
            const total = poll.yesCount + poll.noCount;
            const yesPercent = total ? Math.round(poll.yesCount / total * 100) : 0;
            const noPercent = total ? 100 - yesPercent : 0;
            const busy = busyId === poll.id;
            return (
              <article key={poll.id} className="overflow-hidden rounded-2xl border border-border bg-card">
                <div className="border-b border-border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="text-base font-bold text-foreground">{poll.title}</h2>
                    <span className="shrink-0 rounded-full border border-emerald-700/40 bg-emerald-900/20 px-2 py-1 text-[10px] font-semibold text-emerald-300">
                      Голосование идёт
                    </span>
                  </div>
                  {poll.description && <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">{poll.description}</p>}
                  <div className="mt-3 flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
                    <span>Осталось: <strong className="text-foreground">{remainingTime(poll.endsAt, now)}</strong></span>
                    <span>{total} {total === 1 ? "голос" : "голосов"}</span>
                  </div>
                </div>

                <div className="space-y-3 p-4">
                  <div className="space-y-2" aria-label="Текущее распределение голосов">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="w-20 text-emerald-300">За: {poll.yesCount}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                        <div className="h-full bg-emerald-500 transition-all" style={{ width: `${yesPercent}%` }} />
                      </div>
                      <span className="w-10 text-right text-muted-foreground">{yesPercent}%</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="w-20 text-red-300">Против: {poll.noCount}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                        <div className="h-full bg-red-500 transition-all" style={{ width: `${noPercent}%` }} />
                      </div>
                      <span className="w-10 text-right text-muted-foreground">{noPercent}%</span>
                    </div>
                  </div>

                  {poll.myVote && (
                    <p className="rounded-lg bg-muted/30 px-3 py-2 text-center text-xs text-muted-foreground">
                      Ваш текущий голос: <strong className={poll.myVote === "yes" ? "text-emerald-300" : "text-red-300"}>
                        {poll.myVote === "yes" ? "За" : "Против"}
                      </strong>. Его можно изменить до окончания голосования.
                    </p>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void castVote(poll.id, "yes")}
                      className={`rounded-xl border px-3 py-2.5 text-sm font-bold transition-colors disabled:opacity-50 ${
                        poll.myVote === "yes"
                          ? "border-emerald-400 bg-emerald-700 text-white"
                          : "border-emerald-700/50 bg-emerald-900/20 text-emerald-200 hover:bg-emerald-900/40"
                      }`}
                    >
                      {busy ? "Сохраняем…" : "✅ За"}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void castVote(poll.id, "no")}
                      className={`rounded-xl border px-3 py-2.5 text-sm font-bold transition-colors disabled:opacity-50 ${
                        poll.myVote === "no"
                          ? "border-red-400 bg-red-700 text-white"
                          : "border-red-700/50 bg-red-900/20 text-red-200 hover:bg-red-900/40"
                      }`}
                    >
                      {busy ? "Сохраняем…" : "❌ Против"}
                    </button>
                  </div>

                  {poll.ballots.length > 0 && (
                    <>
                      <button
                        type="button"
                        onClick={() => setExpandedId(expandedId === poll.id ? null : poll.id)}
                        className="w-full py-1 text-xs text-muted-foreground hover:text-foreground"
                        aria-expanded={expandedId === poll.id}
                      >
                        {expandedId === poll.id ? "Скрыть голоса" : `Показать участников (${poll.ballots.length})`}
                      </button>
                      {expandedId === poll.id && (
                        <ul className="max-h-36 space-y-1 overflow-y-auto">
                          {poll.ballots.map((ballot, index) => (
                            <li key={`${ballot.voterName}-${index}`} className="flex justify-between rounded-lg bg-muted/20 px-2 py-1 text-xs">
                              <span>{ballot.voterName}</span>
                              <span className={ballot.vote === "yes" ? "text-emerald-300" : "text-red-300"}>
                                {ballot.vote === "yes" ? "За" : "Против"}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </main>
    </Layout>
  );
}
