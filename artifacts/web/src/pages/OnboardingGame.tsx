import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetOnboardingStatusQueryKey,
  useGetOnboardingStatus,
} from "@workspace/api-client-react";
import { ArrowRight, Check, Clock3, ShieldCheck } from "lucide-react";
import { useCitizen } from "@/context/CitizenContext";
import { ONBOARDING_QUESTS } from "../../../../lib/onboarding-quests";
import { PreApplicationGuide } from "./PreApplicationGuide";

function formatClock(totalSeconds: number) {
  const seconds = Math.max(0, totalSeconds);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

const sectionName = (index: number) => {
  if (index < 10) return "Профиль · Искеле / Фамагуста · кошелёк";
  if (index < 25) return "P2P-переводы · QR-код";
  if (index < 40) return "Доска времени · предложения и запросы";
  if (index < 55) return "Эскроу · DarMin";
  return "Голосование · Родовая минута · декларация";
};

export function OnboardingGame() {
  const { citizen, authToken, setCitizen } = useCitizen();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const queryKey = useMemo(
    () => [...getGetOnboardingStatusQueryKey(), citizen?.id],
    [citizen?.id],
  );
  const authHeaders: Record<string, string> = authToken ? { Authorization: `Bearer ${authToken}` } : {};
  const status = useGetOnboardingStatus({
    query: { enabled: !!citizen && !!authToken, queryKey, refetchInterval: 5_000 },
    request: { headers: authHeaders },
  });
  const [now, setNow] = useState(Date.now());
  const answerStorageKey = `timenation_onboarding_answers_${citizen?.id ?? "guest"}`;
  const [answers, setAnswers] = useState<Record<number, number>>(() => {
    try {
      return JSON.parse(localStorage.getItem(answerStorageKey) ?? "{}") as Record<number, number>;
    } catch {
      return {};
    }
  });

  useEffect(() => {
    document.title = "Учебный этап | TimeNation";
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(answerStorageKey, JSON.stringify(answers));
    } catch {
      // Server timer remains authoritative if local answer storage is unavailable.
    }
  }, [answerStorageKey, answers]);

  useEffect(() => {
    if (status.data?.registrationStatus !== "issued" || !citizen) return;
    setCitizen({
      ...citizen,
      registrationStatus: "issued",
      status: "active",
      balanceMinutes: status.data.balanceMinutes,
      onboardingCompleted: true,
    });
    void queryClient.invalidateQueries({ queryKey: ["citizens"] });
    navigate("/");
  }, [status.data?.registrationStatus, status.data?.balanceMinutes, citizen, setCitizen, queryClient, navigate]);

  const remainingSeconds = status.data
    ? Math.max(0, status.data.secondsRemaining - Math.floor((now - status.dataUpdatedAt) / 1000))
    : 3540;
  const durationSeconds = status.data?.durationSeconds ?? 3540;
  const elapsedSeconds = Math.max(0, durationSeconds - remainingSeconds);
  const stepDuration = durationSeconds / ONBOARDING_QUESTS.length;
  const questIndex = Math.min(ONBOARDING_QUESTS.length - 1, Math.floor(elapsedSeconds / stepDuration));
  const quest = ONBOARDING_QUESTS[questIndex];
  const progress = Math.min(100, (elapsedSeconds / durationSeconds) * 100);
  const choice = answers[questIndex];
  const secondsUntilEligibility = status.data
    ? Math.max(0, status.data.secondsUntilEligibility - Math.floor((now - status.dataUpdatedAt) / 1000))
    : 0;

  function choose(index: number) {
    setAnswers((current) => ({ ...current, [questIndex]: index }));
  }

  if (!citizen) {
    return <PreApplicationGuide />;
  }

  if (status.data?.registrationStatus === "rejected") {
    return (
      <main className="min-h-screen bg-[#050713] text-white grid place-items-center px-6">
        <section className="max-w-xl space-y-5 text-center">
          <ShieldCheck className="mx-auto h-12 w-12 text-amber-400" />
          <h1 className="text-3xl font-bold">Заявление требует исправлений</h1>
          <p className="text-muted-foreground">Обратитесь к форме заявления, чтобы проверить данные и подать его повторно.</p>
          <button className="rounded-md bg-primary px-5 py-3 font-semibold text-primary-foreground" onClick={() => navigate("/register")}>
            Открыть заявление
          </button>
        </section>
      </main>
    );
  }

  if (status.isLoading || !status.data || !status.data.startedAt) {
    return (
      <main className="min-h-screen bg-[#050713] text-white grid place-items-center px-6">
        <div className="flex items-center gap-3 text-muted-foreground" role="status" data-testid="status-onboarding-loading">
          <Clock3 className="h-5 w-5 animate-pulse text-primary" />
          {status.isError ? "Не удалось загрузить симуляцию. Проверьте соединение." : "Подключаем симуляцию…"}
        </div>
      </main>
    );
  }

  if (status.data.completed && status.data.registrationStatus === "pending") {
    return (
      <main className="min-h-screen bg-[#050713] text-white grid place-items-center px-6">
        <section className="max-w-xl space-y-5 text-center">
          <div className="mx-auto grid h-24 w-24 place-items-center rounded-full border border-primary/50 bg-primary/10 shadow-[0_0_70px_rgba(201,168,76,.25)]">
            <ShieldCheck className="h-12 w-12 text-primary" />
          </div>
          <p className="font-mono text-xs uppercase tracking-[0.28em] text-primary">TimeNation · финал симуляции</p>
          <h1 className="text-3xl font-bold md:text-5xl">Симуляция завершена</h1>
          <p className="text-muted-foreground leading-7">
            Заявление остаётся на проверке до установленного срока. Паспорт и родовая минута будут выданы при наступлении этого срока.
          </p>
          <div className="rounded-xl border border-primary/25 bg-primary/5 p-5">
            <p className="font-mono text-xs uppercase tracking-widest text-primary/80">До права на выдачу</p>
            <p className="mt-2 font-mono text-3xl tabular-nums" data-testid="text-eligibility-countdown">{formatClock(secondsUntilEligibility)}</p>
          </div>
          <p className="text-xs text-muted-foreground">Статус проверяется автоматически. Эта страница обновится при выдаче паспорта.</p>
        </section>
      </main>
    );
  }

  const secondsToNextStep = Math.ceil(stepDuration - (elapsedSeconds % stepDuration));

  return (
    <main className="min-h-screen bg-[#050713] px-4 py-8 text-white md:px-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.24em] text-primary">TimeNation · симуляция заявления</p>
            <h1 className="mt-2 text-2xl font-bold md:text-3xl">Симуляция до финала за минуту до выдачи</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Отсчёт привязан к сроку eligibility, записанному при подаче заявления.</p>
          </div>
          <div className="min-w-48 rounded-xl border border-primary/25 bg-primary/5 px-4 py-3 text-right">
            <p className="font-mono text-[10px] uppercase tracking-widest text-primary/80">До финала</p>
            <p className="mt-1 font-mono text-2xl tabular-nums" data-testid="text-onboarding-timer">{formatClock(remainingSeconds)}</p>
          </div>
        </header>

        <section className="mb-6 rounded-xl border border-white/10 bg-white/[0.035] p-5 md:p-6">
          <div className="mb-3 flex items-center justify-between gap-3 text-xs">
            <span className="font-mono uppercase tracking-wider text-white/75">Симуляция · {Math.floor(progress)}%</span>
            <span className="text-muted-foreground">Выдача — в срок из заявления</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuenow={Math.floor(progress)} aria-valuemin={0} aria-valuemax={100} data-testid="progress-onboarding">
            <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-primary to-emerald-400 transition-[width] duration-700" style={{ width: `${progress}%` }} />
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[0.7fr_1.3fr]">
          <aside className="rounded-xl border border-white/10 bg-white/[0.035] p-5">
            <p className="font-mono text-xs uppercase tracking-wider text-primary">Текущий модуль</p>
            <h2 className="mt-3 text-lg font-semibold">{sectionName(questIndex)}</h2>
            <div className="mt-5 flex items-start gap-3 text-sm leading-6 text-muted-foreground">
              <Clock3 className="mt-1 h-4 w-4 shrink-0 text-cyan-300" />
              <p>Следующий этап через {formatClock(secondsToNextStep)}. Если приложение закроется, отсчёт продолжится по сроку в базе.</p>
            </div>
            <div className="mt-5 rounded-lg border border-white/10 bg-black/20 p-4 text-xs leading-5 text-white/65">
              $1 DarMin = 1 минута. Выборы здесь не создают сделки и не меняют баланс.
            </div>
          </aside>

          <article className="rounded-xl border border-cyan-300/20 bg-gradient-to-br from-cyan-400/[0.07] via-white/[0.025] to-primary/[0.06] p-5 shadow-[0_16px_70px_rgba(0,0,0,.22)] md:p-7">
            <div className="flex items-center justify-between gap-3">
              <span className="font-mono text-xs uppercase tracking-[0.2em] text-cyan-200">Квест {questIndex + 1} / 60</span>
              {choice !== undefined && <span className="inline-flex items-center gap-1 text-xs text-emerald-300"><Check className="h-4 w-4" /> Выбор сохранён</span>}
            </div>
            <h2 className="mt-5 text-2xl font-bold">{quest.title}</h2>
            <p className="mt-3 text-base leading-7 text-white/75">{quest.prompt}</p>
            <div className="mt-6 grid gap-3">
              {quest.choices.map((option, index) => (
                <button
                  key={option}
                  onClick={() => choose(index)}
                  aria-pressed={choice === index}
                  data-testid={`button-onboarding-choice-${index}`}
                  className={`group flex items-center justify-between rounded-lg border px-4 py-3 text-left text-sm transition ${
                    choice === index
                      ? "border-primary/60 bg-primary/10 text-white"
                      : "border-white/10 bg-black/20 text-white/75 hover:border-cyan-300/40 hover:bg-cyan-300/[0.06]"
                  }`}
                >
                  <span>{option}</span>
                  <ArrowRight className={`ml-3 h-4 w-4 shrink-0 transition ${choice === index ? "text-primary" : "text-white/35 group-hover:text-cyan-200"}`} />
                </button>
              ))}
            </div>
            {choice !== undefined && (
              <div className="mt-5 rounded-lg border border-emerald-400/20 bg-emerald-400/[0.06] p-4 text-sm leading-6 text-emerald-50/85" data-testid="text-onboarding-takeaway">
                <span className="font-semibold text-emerald-200">Что запомнить: </span>{quest.takeaway}
              </div>
            )}
          </article>
        </section>

      </div>
    </main>
  );
}
