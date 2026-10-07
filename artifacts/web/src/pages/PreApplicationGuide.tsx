import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, ArrowRight, BookOpen, Check, ShieldCheck } from "lucide-react";
import { ONBOARDING_QUESTS } from "../../../../lib/onboarding-quests";

const GUIDE_KEY = "timenation_preapplication_guide_v1";
const ANSWERS_KEY = `${GUIDE_KEY}_answers`;
let completedInCurrentTab = false;

function readAnswers(): Record<number, number> {
  try {
    return JSON.parse(localStorage.getItem(ANSWERS_KEY) ?? "{}") as Record<number, number>;
  } catch {
    return {};
  }
}

function moduleName(index: number) {
  if (index < 10) return "Профиль · Искеле / Фамагуста · кошелёк";
  if (index < 25) return "P2P-переводы · QR-код";
  if (index < 40) return "Доска времени · предложения и запросы";
  if (index < 55) return "Эскроу · DarMin";
  return "Голосование · Родовая минута · декларация";
}

function isTelegramWebApp() {
  try {
    return !!(window as unknown as { Telegram?: { WebApp?: { initData?: string } } })
      .Telegram?.WebApp?.initData;
  } catch {
    return false;
  }
}

export function PreApplicationGuide() {
  const [, navigate] = useLocation();
  const [index, setIndex] = useState(() => {
    try {
      return Math.min(ONBOARDING_QUESTS.length - 1, Number(localStorage.getItem(`${GUIDE_KEY}_step`) ?? 0));
    } catch {
      return 0;
    }
  });
  const [answers, setAnswers] = useState<Record<number, number>>(readAnswers);
  const [done, setDone] = useState(false);
  const quest = ONBOARDING_QUESTS[index];
  const selected = answers[index];
  const progress = (Object.keys(answers).length / ONBOARDING_QUESTS.length) * 100;

  useEffect(() => {
    document.title = "Знакомство с TimeNation";
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(ANSWERS_KEY, JSON.stringify(answers));
      localStorage.setItem(`${GUIDE_KEY}_step`, String(index));
    } catch {
      // The guide can still be completed for this visit if storage is unavailable.
    }
  }, [answers, index]);

  function finish() {
    completedInCurrentTab = true;
    try {
      localStorage.setItem(GUIDE_KEY, "complete");
    } catch {
      // Keep the next action available for this visit.
    }
    setDone(true);
    if (isTelegramWebApp()) {
      window.setTimeout(() => window.location.reload(), 900);
    } else {
      window.setTimeout(() => navigate("/register"), 900);
    }
  }

  if (done) {
    return (
      <main className="min-h-screen bg-[#050713] px-6 text-white grid place-items-center">
        <section className="max-w-lg space-y-5 text-center">
          <ShieldCheck className="mx-auto h-14 w-14 text-primary" />
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-primary">TimeNation · знакомство завершено</p>
          <h1 className="text-3xl font-bold">Теперь можно подать заявление</h1>
          <p className="leading-7 text-muted-foreground">
            После отправки заявления начнётся симуляция. Её финал наступит за минуту до срока выдачи паспорта.
          </p>
          <p className="text-sm text-muted-foreground">Переходим к оформлению…</p>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#050713] px-4 py-8 text-white md:px-8">
      <div className="mx-auto max-w-3xl">
        <header className="mb-7">
          <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.22em] text-primary">
            <BookOpen className="h-4 w-4" />
            TimeNation · перед подачей заявления
          </div>
          <h1 className="mt-3 text-3xl font-bold md:text-4xl">Короткое интерактивное знакомство</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            Изучите основные разделы приложения. После этого можно подать заявление; часовое ожидание начнётся только после отправки.
          </p>
        </header>

        <section className="mb-5 rounded-xl border border-white/10 bg-white/[0.035] p-5">
          <div className="mb-3 flex justify-between gap-3 text-xs">
            <span className="font-mono uppercase tracking-wider text-white/75">Знакомство · {index + 1}/{ONBOARDING_QUESTS.length}</span>
            <span className="text-muted-foreground">{Math.floor(progress)}% изучено</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuenow={Math.floor(progress)} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-primary to-emerald-400 transition-[width] duration-500" style={{ width: `${progress}%` }} />
          </div>
        </section>

        <article className="rounded-xl border border-cyan-300/20 bg-gradient-to-br from-cyan-400/[0.07] via-white/[0.025] to-primary/[0.06] p-5 shadow-[0_16px_70px_rgba(0,0,0,.22)] md:p-7">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-cyan-200">{moduleName(index)}</p>
          <h2 className="mt-3 text-2xl font-bold">{quest.title}</h2>
          <p className="mt-3 text-base leading-7 text-white/75">{quest.prompt}</p>
          <div className="mt-6 grid gap-3">
            {quest.choices.map((option, choiceIndex) => (
              <button
                key={option}
                onClick={() => setAnswers((current) => ({ ...current, [index]: choiceIndex }))}
                aria-pressed={selected === choiceIndex}
                data-testid={`button-guide-choice-${choiceIndex}`}
                className={`group flex items-center justify-between rounded-lg border px-4 py-3 text-left text-sm transition ${
                  selected === choiceIndex
                    ? "border-primary/60 bg-primary/10 text-white"
                    : "border-white/10 bg-black/20 text-white/75 hover:border-cyan-300/40 hover:bg-cyan-300/[0.06]"
                }`}
              >
                <span>{option}</span>
                <ArrowRight className={`ml-3 h-4 w-4 shrink-0 ${selected === choiceIndex ? "text-primary" : "text-white/35"}`} />
              </button>
            ))}
          </div>
          {selected !== undefined && (
            <div className="mt-5 rounded-lg border border-emerald-400/20 bg-emerald-400/[0.06] p-4 text-sm leading-6 text-emerald-50/85">
              <span className="font-semibold text-emerald-200">Важно: </span>{quest.takeaway}
            </div>
          )}
          <div className="mt-6 flex justify-between gap-3">
            <button
              disabled={index === 0}
              onClick={() => setIndex((current) => Math.max(0, current - 1))}
              data-testid="button-guide-back"
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-4 py-3 text-sm text-white/70 disabled:opacity-35"
            >
              <ArrowLeft className="h-4 w-4" /> Назад
            </button>
            {index < ONBOARDING_QUESTS.length - 1 ? (
              <button
                disabled={selected === undefined}
                onClick={() => setIndex((current) => Math.min(ONBOARDING_QUESTS.length - 1, current + 1))}
                data-testid="button-guide-continue"
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-40"
              >
                Продолжить <ArrowRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                disabled={selected === undefined}
                onClick={finish}
                data-testid="button-guide-finish"
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-40"
              >
                <Check className="h-4 w-4" /> Перейти к заявлению
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
    return localStorage.getItem(GUIDE_KEY) === "complete";
  } catch {
    return false;
  }
};
