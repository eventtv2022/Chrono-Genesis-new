import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetOnboardingStatusQueryKey,
  useUpdateCitizenOnboardingProgress,
  useGetOnboardingStatus,
} from "@workspace/api-client-react";
import { ArrowRight, Check, Clock3, Eye, ShieldCheck } from "lucide-react";
import { useCitizen } from "@/context/CitizenContext";
import { SignaturePad } from "@/components/SignaturePad";
import { AnthemButton } from "@/components/AnthemPlayer";
import { PASSPORT_SIMULATOR_QUESTIONS, onboardingBlockTitle } from "../../../../lib/onboarding-questions";
import { PreApplicationGuide } from "./PreApplicationGuide";

function formatClock(totalSeconds: number) {
  const seconds = Math.max(0, totalSeconds);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

export function OnboardingGame() {
  const { citizen, authToken, setCitizen, refreshCitizen } = useCitizen();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const queryKey = useMemo(
    () => [...getGetOnboardingStatusQueryKey(), citizen?.id],
    [citizen?.id],
  );
  const authHeaders: Record<string, string> = authToken ? { Authorization: `Bearer ${authToken}` } : {};
  const updateProgress = useUpdateCitizenOnboardingProgress({ request: { headers: authHeaders } });
  const [progressError, setProgressError] = useState("");
  const [signatureBase64, setSignatureBase64] = useState<string | null>(null);
  const [signatureSaving, setSignatureSaving] = useState(false);
  const [signatureError, setSignatureError] = useState("");
  const status = useGetOnboardingStatus({
    query: { enabled: !!citizen && !!authToken, queryKey, refetchInterval: 5_000 },
    request: { headers: authHeaders },
  });
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    document.title = "Учебный этап | TimeNation";
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

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
  const progress = Math.min(100, (elapsedSeconds / durationSeconds) * 100);
  const questionId = status.data?.simulatorCurrentQuestionId ?? 31;
  const question = PASSPORT_SIMULATOR_QUESTIONS[questionId - 31]!;
  const revealed = status.data?.simulatorRevealedQuestionIds.includes(questionId) ?? false;
  const simulatorCompleted = status.data?.simulatorCompleted ?? false;
  const secondsUntilEligibility = status.data
    ? Math.max(0, status.data.secondsUntilEligibility - Math.floor((now - status.dataUpdatedAt) / 1000))
    : 0;

  async function performProgressAction(action: "reveal" | "continue" | "back") {
    if (!status.data || !citizen || updateProgress.isPending) return;
    setProgressError("");
    try {
      const updated = await updateProgress.mutateAsync({
        data: { phase: "simulator", action, questionId },
      });
      queryClient.setQueryData(queryKey, (current: typeof status.data | undefined) =>
        current ? {
          ...current,
          simulatorCurrentQuestionId: updated.simulatorCurrentQuestionId,
          simulatorRevealedQuestionIds: updated.simulatorRevealedQuestionIds,
          simulatorCompleted: updated.simulatorCompleted,
        } : current,
      );
    } catch {
      setProgressError("Не удалось сохранить прогресс. Проверьте соединение и повторите попытку.");
      await status.refetch();
    }
  }

  async function saveSignature() {
    if (!signatureBase64 || !authToken || signatureSaving) return;
    setSignatureSaving(true);
    setSignatureError("");
    try {
      const response = await fetch("/api/citizens/me/signature", {
        method: "POST",
        headers: { Authorization: `Bearer ${authToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ signatureBase64 }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Не удалось сохранить подпись");
      setCitizen({ ...citizen!, hasSignature: true });
      setSignatureBase64(null);
      await refreshCitizen();
      await status.refetch();
    } catch (error) {
      setSignatureError(error instanceof Error ? error.message : "Не удалось сохранить подпись");
    } finally {
      setSignatureSaving(false);
    }
  }

  if (!citizen) {
    return <PreApplicationGuide />;
  }

  if (status.data?.registrationStatus === "rejected") {
    return (
      <main className="min-h-screen bg-[#050713] text-white grid place-items-center px-6">
        <div className="w-full max-w-xl"><AnthemButton /></div>
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

  if (citizen && citizen.registrationStatus === "pending" && !citizen.hasSignature) {
    return (
      <main className="min-h-screen bg-[#050713] text-white grid place-items-center px-4 py-8">
        <section className="w-full max-w-xl space-y-5 rounded-2xl border border-white/10 bg-white/[0.035] p-6">
          <AnthemButton />
          <ShieldCheck className="h-10 w-10 text-primary" />
          <h1 className="text-2xl font-bold">Добавьте подпись для выдачи паспорта</h1>
          <p className="text-sm leading-6 text-muted-foreground">
            Паспорт останется в эмиссии, пока подпись не сохранена. После этого выдача продолжится автоматически по установленному сроку.
          </p>
          <SignaturePad onChange={setSignatureBase64} />
          {signatureError && <p role="alert" className="text-sm text-rose-300">{signatureError}</p>}
          <button
            type="button"
            disabled={!signatureBase64 || signatureSaving}
            onClick={() => void saveSignature()}
            className="w-full rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-40"
            data-testid="button-save-passport-signature"
          >
            {signatureSaving ? "Сохраняем…" : "Сохранить подпись"}
          </button>
        </section>
      </main>
    );
  }

  if (status.isLoading || !status.data || !status.data.startedAt) {
    return (
      <main className="min-h-screen bg-[#050713] text-white grid place-items-center px-6">
        <div className="w-full max-w-xl"><AnthemButton /></div>
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
          <AnthemButton />
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

  if (simulatorCompleted) {
    return (
      <main className="min-h-screen bg-[#050713] text-white grid place-items-center px-6">
        <section className="max-w-xl space-y-5 text-center">
          <AnthemButton />
          <Check className="mx-auto h-12 w-12 text-emerald-300" />
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-primary">TimeNation · вопросы завершены</p>
          <h1 className="text-3xl font-bold">Симуляция продолжается</h1>
          <p className="leading-7 text-muted-foreground">
            Все 30 вопросов сохранены. Финал наступит за минуту до срока выдачи паспорта.
          </p>
          <div className="rounded-xl border border-primary/25 bg-primary/5 p-5">
            <p className="font-mono text-xs uppercase tracking-widest text-primary/80">До финала</p>
            <p className="mt-2 font-mono text-3xl tabular-nums" data-testid="text-onboarding-timer">{formatClock(remainingSeconds)}</p>
          </div>
          <p className="text-xs text-muted-foreground">Отсчёт продолжается по сроку, записанному сервером при подаче заявления.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#050713] px-4 py-8 text-white md:px-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="mb-3 max-w-xs"><AnthemButton /></div>
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
            <h2 className="mt-3 text-lg font-semibold">{onboardingBlockTitle(questionId)}</h2>
            <div className="mt-5 flex items-start gap-3 text-sm leading-6 text-muted-foreground">
              <Clock3 className="mt-1 h-4 w-4 shrink-0 text-cyan-300" />
              <p>Изучайте вопросы в удобном темпе. Если приложение закроется, прогресс и отсчёт сохранятся на сервере.</p>
            </div>
            <div className="mt-5 rounded-lg border border-white/10 bg-black/20 p-4 text-xs leading-5 text-white/65">
              $1 DarMin = 1 минута. Ответы здесь не создают сделки и не меняют баланс.
            </div>
          </aside>

          <article className="rounded-xl border border-cyan-300/20 bg-gradient-to-br from-cyan-400/[0.07] via-white/[0.025] to-primary/[0.06] p-5 shadow-[0_16px_70px_rgba(0,0,0,.22)] md:p-7">
            <div className="flex items-center justify-between gap-3">
              <span className="font-mono text-xs uppercase tracking-[0.2em] text-cyan-200">Вопрос {questionId} / 60</span>
              {revealed && <span className="inline-flex items-center gap-1 text-xs text-emerald-300"><Check className="h-4 w-4" /> Ответ сохранён</span>}
            </div>
            <h2 className="mt-5 text-2xl font-bold">{question.question}</h2>
            {revealed ? (
              <div className="mt-5 rounded-lg border border-emerald-400/20 bg-emerald-400/[0.06] p-4 text-sm leading-6 text-emerald-50/85" data-testid="text-onboarding-answer">
                <span className="font-semibold text-emerald-200">Ответ: </span>{question.answer}
              </div>
            ) : (
              <p className="mt-3 text-sm text-white/60">Нажмите, чтобы открыть ответ.</p>
            )}
            {progressError && <p role="alert" className="mt-4 text-sm text-rose-300">{progressError}</p>}
            <div className="mt-6 flex justify-between gap-3">
              <button
                disabled={questionId === 31 || updateProgress.isPending}
                onClick={() => void performProgressAction("back")}
                data-testid="button-onboarding-back"
                className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-4 py-3 text-sm text-white/70 disabled:opacity-35"
              >
                Назад
              </button>
              {!revealed ? (
                <button
                  disabled={updateProgress.isPending}
                  onClick={() => void performProgressAction("reveal")}
                  data-testid="button-onboarding-reveal"
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-40"
                >
                  <Eye className="h-4 w-4" /> Показать ответ
                </button>
              ) : (
                <button
                  disabled={updateProgress.isPending}
                  onClick={() => void performProgressAction("continue")}
                  data-testid="button-onboarding-continue"
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-40"
                >
                  Продолжить <ArrowRight className="h-4 w-4" />
                </button>
              )}
            </div>
          </article>
        </section>

      </div>
    </main>
  );
}
