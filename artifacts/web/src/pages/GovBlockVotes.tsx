import { useState, useEffect, useCallback } from "react";
import { Layout } from "@/components/Layout";
import { useCitizen } from "@/context/CitizenContext";
import { useLocation } from "wouter";

// ── Types ────────────────────────────────────────────────────────────────────

interface BlockVote {
  id: number;
  citizenId: number;
  citizenName: string;
  reason: string;
  initiatedById: number;
  createdAt: string;
  endsAt: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  yesCount: number;
  noCount: number;
  myVote: "yes" | "no" | null;
  ballots: { voterName: string; vote: string }[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeLeft(endsAt: string): string {
  const diff = new Date(endsAt).getTime() - Date.now();
  if (diff <= 0) return "Истекло";
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  return `${h}ч ${m}м`;
}

function statusBadge(status: BlockVote["status"]): { label: string; cls: string } {
  switch (status) {
    case "pending":   return { label: "🗳 Идёт голосование",   cls: "text-yellow-300 bg-yellow-900/30 border-yellow-700/40" };
    case "approved":  return { label: "⛔ Блокировка одобрена", cls: "text-red-300 bg-red-900/30 border-red-700/40" };
    case "rejected":  return { label: "✅ Блокировка отклонена", cls: "text-emerald-300 bg-emerald-900/30 border-emerald-700/40" };
    case "cancelled": return { label: "🚫 Отменено",            cls: "text-zinc-400 bg-zinc-900/30 border-zinc-700/40" };
  }
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function GovBlockVotes() {
  const { citizen, authToken } = useCitizen();
  const [, setLocation] = useLocation();
  const [votes, setVotes] = useState<BlockVote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [votingId, setVotingId] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);

  const isEligible =
    citizen && (citizen.isAdmin === 1 || (citizen.govRole && citizen.govRole !== "citizen"));

  // Redirect if not eligible
  useEffect(() => {
    if (citizen && !isEligible) setLocation("/");
  }, [citizen, isEligible, setLocation]);

  const fetchVotes = useCallback(async () => {
    if (!authToken) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/gov/block-votes", {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (!res.ok) { setError("Ошибка загрузки голосований"); return; }
      setVotes(await res.json() as BlockVote[]);
    } catch { setError("Ошибка сети"); }
    setLoading(false);
  }, [authToken]);

  useEffect(() => { void fetchVotes(); }, [fetchVotes]);

  async function castVote(id: number, vote: "yes" | "no") {
    if (!authToken) return;
    setVotingId(id);
    try {
      await fetch(`/api/gov/block-votes/${id}/cast`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ vote }),
      });
      await fetchVotes();
    } catch { /* silent */ }
    setVotingId(null);
  }

  if (!citizen || !isEligible) return null;

  const pending  = votes.filter(v => v.status === "pending");
  const finished = votes.filter(v => v.status !== "pending");

  return (
    <Layout>
      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <span className="text-3xl">🗳️</span>
          <div>
            <h1 className="text-xl font-bold text-foreground">Голосования о блокировке</h1>
            <p className="text-xs text-muted-foreground">Правительство и Верховная судейская коллегия TimeNation</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-900/30 border border-red-700/40 rounded-xl text-sm text-red-300">
            ❌ {error}
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
            <span className="animate-spin mr-2">⏳</span> Загрузка…
          </div>
        )}

        {!loading && (
          <>
            {/* Active votes */}
            <section className="mb-8">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                ⏳ Активные голосования ({pending.length})
              </h2>

              {pending.length === 0 && (
                <div className="text-center py-8 text-muted-foreground text-sm bg-muted/20 rounded-xl border border-border">
                  Нет активных голосований
                </div>
              )}

              <div className="space-y-4">
                {pending.map(v => {
                  const sb = statusBadge(v.status);
                  const total = v.yesCount + v.noCount;
                  const yesPct = total > 0 ? Math.round((v.yesCount / total) * 100) : 0;
                  const noPct  = total > 0 ? Math.round((v.noCount  / total) * 100) : 0;
                  const isVoting = votingId === v.id;

                  return (
                    <div key={v.id} className="bg-card border border-border rounded-2xl overflow-hidden">
                      {/* Card header */}
                      <div className="p-4 border-b border-border">
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div>
                            <div className="font-bold text-foreground">{v.citizenName}</div>
                            <div className="text-xs text-muted-foreground font-mono">ID {v.citizenId}</div>
                          </div>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full border whitespace-nowrap ${sb.cls}`}>
                            {sb.label}
                          </span>
                        </div>

                        {/* Reason */}
                        <div className="bg-red-950/30 border border-red-800/30 rounded-xl px-3 py-2 mb-3">
                          <div className="text-[10px] text-red-400 uppercase tracking-wider font-semibold mb-0.5">Причина блокировки</div>
                          <div className="text-sm text-red-200">{v.reason}</div>
                        </div>

                        {/* Timer */}
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>⏰ Осталось: <span className="text-foreground font-mono font-semibold">{timeLeft(v.endsAt)}</span></span>
                          <span className="font-mono">{total} голосов</span>
                        </div>
                      </div>

                      {/* Progress bars */}
                      <div className="px-4 py-3 space-y-2">
                        {/* YES bar */}
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-emerald-400 font-semibold w-16">✅ За {v.yesCount}</span>
                          <div className="flex-1 h-2.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                              style={{ width: `${yesPct}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground w-8 text-right">{yesPct}%</span>
                        </div>
                        {/* NO bar */}
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-red-400 font-semibold w-16">❌ Против {v.noCount}</span>
                          <div className="flex-1 h-2.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-red-500 rounded-full transition-all duration-500"
                              style={{ width: `${noPct}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground w-8 text-right">{noPct}%</span>
                        </div>
                      </div>

                      {/* Vote buttons */}
                      <div className="px-4 pb-4">
                        {v.myVote ? (
                          <div className="text-center text-xs text-muted-foreground bg-muted/30 rounded-xl py-3 border border-border">
                            Вы проголосовали: <span className={v.myVote === "yes" ? "text-emerald-400 font-bold" : "text-red-400 font-bold"}>
                              {v.myVote === "yes" ? "✅ За блокировку" : "❌ Против блокировки"}
                            </span>
                            <div className="text-[10px] mt-1 text-muted-foreground/60">Вы можете изменить голос до окончания голосования</div>
                          </div>
                        ) : null}

                        <div className={`grid grid-cols-2 gap-3 ${v.myVote ? "mt-2" : ""}`}>
                          <button
                            onClick={() => void castVote(v.id, "yes")}
                            disabled={isVoting}
                            className={`py-2.5 rounded-xl text-sm font-bold transition-all ${
                              v.myVote === "yes"
                                ? "bg-emerald-600 text-white border-2 border-emerald-400"
                                : "bg-emerald-900/30 border border-emerald-700/40 text-emerald-300 hover:bg-emerald-900/60"
                            } disabled:opacity-40`}
                          >
                            {isVoting ? "⏳" : "✅"} За блокировку
                          </button>
                          <button
                            onClick={() => void castVote(v.id, "no")}
                            disabled={isVoting}
                            className={`py-2.5 rounded-xl text-sm font-bold transition-all ${
                              v.myVote === "no"
                                ? "bg-red-600 text-white border-2 border-red-400"
                                : "bg-red-900/30 border border-red-700/40 text-red-300 hover:bg-red-900/60"
                            } disabled:opacity-40`}
                          >
                            {isVoting ? "⏳" : "❌"} Против
                          </button>
                        </div>

                        {/* Voter list toggle */}
                        {v.ballots.length > 0 && (
                          <button
                            onClick={() => setExpanded(expanded === v.id ? null : v.id)}
                            className="w-full mt-2 text-xs text-muted-foreground hover:text-foreground py-1 transition-colors"
                          >
                            {expanded === v.id ? "▲ Скрыть голоса" : `▼ Показать голоса (${v.ballots.length})`}
                          </button>
                        )}

                        {expanded === v.id && (
                          <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
                            {v.ballots.map((b, i) => (
                              <div key={i} className="flex items-center justify-between text-xs px-2 py-1 bg-muted/20 rounded-lg">
                                <span className="text-foreground">{b.voterName}</span>
                                <span className={b.vote === "yes" ? "text-emerald-400" : "text-red-400"}>
                                  {b.vote === "yes" ? "✅ За" : "❌ Против"}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Finished votes */}
            {finished.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  📋 Завершённые ({finished.length})
                </h2>
                <div className="space-y-3">
                  {finished.map(v => {
                    const sb = statusBadge(v.status);
                    return (
                      <div key={v.id} className="bg-card/50 border border-border rounded-xl px-4 py-3 flex items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold text-foreground text-sm">{v.citizenName}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">{v.reason}</div>
                          <div className="text-[10px] text-muted-foreground mt-1 font-mono">
                            ✅ {v.yesCount} · ❌ {v.noCount}
                          </div>
                        </div>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border whitespace-nowrap flex-shrink-0 ${sb.cls}`}>
                          {sb.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
