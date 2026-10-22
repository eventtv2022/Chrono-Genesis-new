import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetOnboardingProgressSessionQueryKey,
  useCreateOnboardingProgressSession,
  useGetOnboardingProgressSession,
  useUpdateOnboardingProgressSession,
} from "@workspace/api-client-react";
import { ArrowLeft, ArrowRight, BookOpen, Check, Eye, ShieldCheck } from "lucide-react";
import { AnthemButton } from "@/components/AnthemPlayer";
import {
  ONBOARDING_PROGRESS_TOKEN_KEY,
  PRE_APPLICATION_GUIDE_COMPLETE_KEY,
  PRE_APPLICATION_QUESTIONS,
  onboardingBlockTitle,
} from "../../../../lib/onboarding-questions";

let completedInCurrentTab = false;

function isTelegramWebApp() {
  try {
    return !!(window as unknown as { Telegram?: { WebApp?: { initData?: string } } })
      .Telegram?.WebApp?.initData;
  } catch {
    return false;
  }
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : "Не удалось сохранить прогресс. Проверьте соединение и повторите попытку.";
}

export function PreApplicationGuide() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [progressToken, setProgressToken] = useState(() => {
    try {
      return localStorage.getItem(ONBOARDING_PROGRESS_TOKEN_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const createStarted = useRef(false);
  const createSession = useCreateOnboardingProgressSession();
  const progressQuery = useGetOnboardingProgressSession(progressToken, {
    query: {
      queryKey: getGetOnboardingProgressSessionQueryKey(progressToken),
      enabled: !!progressToken,
      retry: false,
    },
  });
  const updateProgress = useUpdateOnboardingProgressSession();
  const session = progressQuery.data;
  const questionId = session?.guideCurrentQuestionId ?? 1;
  const question = PRE_APPLICATION_QUESTIONS[questionId - 1]!;
  const revealed = session?.guideRevealedQuestionIds.includes(questionId) ?? false;
  const progressPercent = Math.floor(((session?.guideRevealedQuestionIds.length ?? 0) / 30) * 100);
  const busy = updateProgress.isPending || createSession.isPending;

  useEffect(() => {
    document.title = "Знакомство с TimeNation";
  }, []);

  useEffect(() => {
    if (progressToken || createStarted.current) return;
    createStarted.current = true;
    createSession.mutate(undefined, {
      onSuccess: (created) => {
        try {
          localStorage.setItem(ONBOARDING_PROGRESS_TOKEN_KEY, created.progressToken);
        } catch {
          setError("Не удалось сохранить идентификатор прогресса в этом браузере.");
          return;
        }
        setProgressToken(created.progressToken);
      },
      onError: (cause) => setError(errorText(cause)),
    });
  }, [progressToken, createSession]);

  useEffect(() => {
    if (progressQuery.isError) setError(errorText(progressQuery.error));
  }, [progressQuery.isError, progressQuery.error]);

  async function performAction(action: "reveal" | "continue" | "back") {
    if (!session || !progressToken || busy) return;
    setError("");
    try {
      const updated = await updateProgress.mutateAsync({
        progressToken,
        data: { phase: "guide", action, questionId },
      });
      queryClient.setQueryData(
        getGetOnboardingProgressSessionQueryKey(progressToken),
        updated,
      );
      if (updated.guideCompleted) {
        completedInCurrentTab = true;
        try {
          localStorage.setItem(PRE_APPLICATION_GUIDE_COMPLETE_KEY, "complete");
        } catch {
          setError("Прогресс сохранён на сервере, но браузер не смог сохранить отметку завершения.");
          return;
        }
        setDone(true);
        if (isTelegramWebApp()) {
          window.setTimeout(() => window.location.reload(), 900);
        } else {
          window.setTimeout(() => navigate("/register"), 900);
        }
      }
    } catch (cause) {
      setError(errorText(cause));
      await progressQuery.refetch();
    }
  }

  if (done || session?.guideCompleted) {
    return (
      <main className="min-h-screen bg-[#050713] px-6 text-white grid place-items-center">
        <div className="w-full max-w-lg"><AnthemButton /></div>
        <section className="max-w-lg space-y-5 text-center">
          <ShieldCheck className="mx-auto h-14 w-14 text-primary" />
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-primary">TimeNation · знакомство завершено</p>
          <h1 className="text-3xl font-bold">Подача заявления на гражданство TimeNation</h1>
          <p className="leading-7 text-muted-foreground">
            После отправки заявления начнется обратный отсчёт времени до вступления в гражданство. Ваш Паспорт гражданина TimeNation будет официально выдан ровно через 60 минут.
          </p>
          {done ? (
            <p className="text-sm text-muted-foreground">Переходим к оформлению…</p>
          ) : (
            <button
              className="rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground"
              data-testid="button-guide-complete-continue"
              onClick={() => {
                if (isTelegramWebApp()) window.location.reload();
                else navigate("/register");
              }}
            >
              {isTelegramWebApp() ? "Продолжить в Telegram" : "Подать заявление на гражданство"}
            </button>
          )}
        </section>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="min-h-screen bg-[#050713] px-6 text-white grid place-items-center">
        <div className="w-full max-w-lg"><AnthemButton /></div>
        <section className="max-w-lg space-y-4 text-center">
          <BookOpen className="mx-auto h-10 w-10 text-primary" />
          <h1 className="text-xl font-semibold">Подключаем знакомство</h1>
          <p className="text-sm text-muted-foreground">
            {error || (progressQuery.isError ? "Не удалось загрузить сохранённый прогресс." : "Сохраняем ответы в TimeNation…")}
          </p>
          {error && (
            <button className="rounded-lg border border-white/15 px-4 py-2 text-sm" onClick={() => window.location.reload()}>
              Повторить
            </button>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#050713] px-4 py-8 text-white md:px-8">
      <div className="mx-auto max-w-3xl">
        <header className="mb-7">
          <div className="mb-4 max-w-xs"><AnthemButton /></div>
          <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.22em] text-primary">
            <BookOpen className="h-4 w-4" />
            TimeNation · перед подачей заявления
          </div>
          <h1 className="mt-3 text-3xl font-bold md:text-4xl">Короткое интерактивное знакомство</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            Прочитайте 30 вопросов и ответов. Часовое ожидание начнётся только после отправки заявления.
          </p>
        </header>

        <section className="mb-5 rounded-xl border border-white/10 bg-white/[0.035] p-5">
          <div className="mb-3 flex justify-between gap-3 text-xs">
            <span className="font-mono uppercase tracking-wider text-white/75">Знакомство · {questionId}/30</span>
            <span className="text-muted-foreground">{progressPercent}% изучено</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuenow={progressPercent} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-primary to-emerald-400 transition-[width] duration-500" style={{ width: `${progressPercent}%` }} />
          </div>
        </section>

        <article className="rounded-xl border border-cyan-300/20 bg-gradient-to-br from-cyan-400/[0.07] via-white/[0.025] to-primary/[0.06] p-5 shadow-[0_16px_70px_rgba(0,0,0,.22)] md:p-7">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-cyan-200">{onboardingBlockTitle(question.id)}</p>
          <h2 className="mt-3 text-2xl font-bold">{question.question}</h2>
          {revealed ? (
            <div className="mt-5 rounded-lg border border-emerald-400/20 bg-emerald-400/[0.06] p-4 text-sm leading-6 text-emerald-50/90" data-testid="text-guide-answer">
              <span className="font-semibold text-emerald-200">Ответ: </span>{question.answer}
            </div>
          ) : (
            <p className="mt-3 text-sm leading-6 text-white/60">Ответ откроется по нажатию кнопки.</p>
          )}
          {error && <p role="alert" className="mt-4 text-sm text-rose-300">{error}</p>}
          <div className="mt-6 flex justify-between gap-3">
            <button
              disabled={questionId === 1 || busy}
              onClick={() => void performAction("back")}
              data-testid="button-guide-back"
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-4 py-3 text-sm text-white/70 disabled:opacity-35"
            >
              <ArrowLeft className="h-4 w-4" /> Назад
            </button>
            {!revealed ? (
              <button
                disabled={busy}
                onClick={() => void performAction("reveal")}
                data-testid="button-guide-reveal"
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-40"
              >
                <Eye className="h-4 w-4" /> Показать ответ
              </button>
            ) : (
              <button
                disabled={busy}
                onClick={() => void performAction("continue")}
                data-testid={questionId === 30 ? "button-guide-finish" : "button-guide-continue"}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-40"
              >
                {questionId === 30 ? <Check className="h-4 w-4" /> : null}
                {questionId === 30 ? "Перейти к заявлению" : "Продолжить"}
                {questionId < 30 ? <ArrowRight className="h-4 w-4" /> : null}
              </button>
            )}
          </div>
        </article>
      </div>
    </main>
  );
}

export const isPreApplicationGuideComplete = () => {
  if (completedInCurrentTab) return true;
  try {
    return (
      localStorage.getItem(PRE_APPLICATION_GUIDE_COMPLETE_KEY) === "complete" &&
      !!localStorage.getItem(ONBOARDING_PROGRESS_TOKEN_KEY)
    );
  } catch {
    return false;
  }
};

export function getPreApplicationProgressToken(): string | null {
  try {
    return localStorage.getItem(ONBOARDING_PROGRESS_TOKEN_KEY);
  } catch {
    return null;
  }
}
