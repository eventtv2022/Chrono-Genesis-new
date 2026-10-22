import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import {
  AlertCircle,
  ArrowRight,
  Check,
  Clock3,
  Copy,
  Gift,
  Link2,
  RefreshCw,
  Send,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useCitizen } from "@/context/CitizenContext";
import { useLanguage } from "@/context/LanguageContext";
import { Layout } from "@/components/Layout";

interface Referral {
  id: number;
  name: string;
  status: "pending" | "rewarded";
  rewardedAt: string | null;
  bonusMinutes: number;
}

interface ReferralProfile {
  referralUrl: string;
  referralCount: number;
  earnedBonusMinutes: number;
  bonusBalanceMinutes: number;
  referrals: Referral[];
}

export function Referrals() {
  const { authToken } = useCitizen();
  const { lang } = useLanguage();
  const isRu = lang === "ru";
  const [profile, setProfile] = useState<ReferralProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const text = isRu
    ? {
        eyebrow: "ПРИГЛАШЕНИЯ",
        title: "Реферальная программа",
        intro: "Приглашайте людей в TimeNation и следите за статусом приглашений.",
        invite: "Пригласить в TimeNation",
        link: "Ваша персональная ссылка",
        copy: "Скопировать ссылку",
        copied: "Ссылка скопирована",
        total: "Приглашено",
        earned: "Всего начислено",
        balance: "Доступный бонусный баланс",
        minutes: "мин",
        history: "История приглашений",
        pending: "Ожидает выдачи паспорта",
        rewarded: "Бонус начислен",
        emptyTitle: "Пока нет приглашений",
        emptyBody: "Поделитесь ссылкой — приглашённые появятся здесь.",
        loading: "Загружаем реферальные данные…",
        loadError: "Не удалось загрузить реферальные данные.",
        retry: "Повторить",
        signIn: "Войдите в аккаунт гражданина, чтобы открыть реферальную программу.",
        signInButton: "Войти",
        bonusNote: "15 Дармин начисляются после выдачи паспорта приглашённому. Бонусы доступны только внутри TimeNation и не являются денежным балансом.",
        shareText: "Присоединяйся к TimeNation — экономике взаимного времени.",
      }
    : {
        eyebrow: "INVITATIONS",
        title: "Referral program",
        intro: "Invite people to TimeNation and track the status of your invitations.",
        invite: "Invite to TimeNation",
        link: "Your personal link",
        copy: "Copy link",
        copied: "Link copied",
        total: "Invited",
        earned: "Total earned",
        balance: "Available bonus balance",
        minutes: "min",
        history: "Invitation history",
        pending: "Waiting for passport issuance",
        rewarded: "Bonus awarded",
        emptyTitle: "No invitations yet",
        emptyBody: "Share your link and invited citizens will appear here.",
        loading: "Loading referral details…",
        loadError: "Could not load referral details.",
        retry: "Try again",
        signIn: "Sign in to your citizen account to open the referral program.",
        signInButton: "Sign in",
        bonusNote: "15 DarMin is awarded after the invited person receives a passport. Bonuses are for use inside TimeNation and are not a cash balance.",
        shareText: "Join me in TimeNation, an economy built on exchanging time.",
      };

  const loadProfile = useCallback(async (signal?: AbortSignal) => {
    if (!authToken) {
      setProfile(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/referrals/me", {
        headers: { Authorization: `Bearer ${authToken}` },
        signal,
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error || text.loadError);
      }
      setProfile(await response.json() as ReferralProfile);
    } catch (cause) {
      if (signal?.aborted) return;
      setError(cause instanceof Error ? cause.message : text.loadError);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [authToken, text.loadError]);

  useEffect(() => {
    const controller = new AbortController();
    void loadProfile(controller.signal);
    return () => controller.abort();
  }, [loadProfile]);

  const copyLink = async () => {
    if (!profile?.referralUrl) return;
    try {
      await navigator.clipboard.writeText(profile.referralUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      setError(isRu ? "Не удалось скопировать ссылку. Выделите её и скопируйте вручную." : "Could not copy the link. Select and copy it manually.");
    }
  };

  const shareInvite = () => {
    if (!profile?.referralUrl) return;
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(profile.referralUrl)}&text=${encodeURIComponent(text.shareText)}`;
    window.open(shareUrl, "_blank", "noopener,noreferrer");
  };

  const formatDate = (value: string | null) => {
    if (!value) return "";
    return new Intl.DateTimeFormat(isRu ? "ru-RU" : "en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(value));
  };
  const numberFormat = new Intl.NumberFormat(isRu ? "ru-RU" : "en-GB", { maximumFractionDigits: 2 });

  return (
    <Layout>
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="space-y-2">
          <p className="font-mono text-xs uppercase tracking-[0.22em] text-primary">{text.eyebrow}</p>
          <h1 className="text-3xl font-bold tracking-tight">{text.title}</h1>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">{text.intro}</p>
        </header>

        {!authToken ? (
          <section className="rounded-xl border border-border bg-card p-6">
            <p className="text-sm text-muted-foreground">{text.signIn}</p>
            <Link href="/login?returnTo=%2Freferrals" className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
              {text.signInButton}<ArrowRight className="h-4 w-4" />
            </Link>
          </section>
        ) : loading && !profile ? (
          <div role="status" className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            <RefreshCw className="mx-auto mb-3 h-5 w-5 animate-spin text-primary" />
            {text.loading}
          </div>
        ) : error && !profile ? (
          <section className="rounded-xl border border-destructive/30 bg-card p-6 text-center">
            <AlertCircle className="mx-auto mb-3 h-6 w-6 text-destructive" />
            <p role="alert" className="text-sm text-muted-foreground">{error || text.loadError}</p>
            <button type="button" onClick={() => void loadProfile()} className="mt-4 rounded-md border border-border px-4 py-2 text-sm hover:bg-secondary">
              {text.retry}
            </button>
          </section>
        ) : profile ? (
          <>
            <section className="grid gap-5 rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/[0.10] via-card to-card p-5 md:grid-cols-[1fr_auto] md:items-center md:p-7">
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-primary"><Users className="h-5 w-5" /><span className="font-mono text-xs uppercase tracking-widest">{text.eyebrow}</span></div>
                <h2 className="text-2xl font-bold">{text.invite}</h2>
                <p className="max-w-xl text-sm leading-6 text-muted-foreground">{text.bonusNote}</p>
              </div>
              <button type="button" onClick={shareInvite} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition hover:brightness-110">
                <Send className="h-4 w-4" />{text.invite}
              </button>
            </section>

            <section className="rounded-xl border border-border bg-card p-5 md:p-6">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><Link2 className="h-4 w-4 text-primary" />{text.link}</div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <input readOnly value={profile.referralUrl} aria-label={text.link} onFocus={(event) => event.currentTarget.select()} className="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-2.5 text-sm text-foreground" />
                <button type="button" onClick={() => void copyLink()} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-primary/40 px-4 py-2 text-sm font-semibold text-primary hover:bg-primary/10">
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied ? text.copied : text.copy}
                </button>
              </div>
            </section>

            <section className="grid gap-4 sm:grid-cols-3">
              <Metric icon={<Users className="h-4 w-4" />} label={text.total} value={numberFormat.format(profile.referralCount)} />
              <Metric icon={<Gift className="h-4 w-4" />} label={text.earned} value={`${numberFormat.format(profile.earnedBonusMinutes)} ${text.minutes}`} />
              <Metric icon={<ShieldCheck className="h-4 w-4" />} label={text.balance} value={`${numberFormat.format(profile.bonusBalanceMinutes)} ${text.minutes}`} />
            </section>

            <section className="overflow-hidden rounded-xl border border-border bg-card">
              <div className="flex items-center justify-between border-b border-border px-5 py-4">
                <h2 className="font-semibold">{text.history}</h2>
                <span className="font-mono text-sm text-primary">{String(profile.referrals.length).padStart(2, "0")}</span>
              </div>
              {profile.referrals.length === 0 ? (
                <div className="px-5 py-10 text-center">
                  <Users className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
                  <h3 className="font-semibold">{text.emptyTitle}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{text.emptyBody}</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {profile.referrals.map((referral) => {
                    const rewarded = referral.status === "rewarded";
                    return (
                      <div key={referral.id} className="flex items-center gap-3 px-5 py-4">
                        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-primary/20 bg-primary/10 font-semibold text-primary">
                          {(referral.name.trim()[0] || "?").toLocaleUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{referral.name}</p>
                          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                            {rewarded ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Clock3 className="h-3.5 w-3.5 text-primary" />}
                            {rewarded ? `${text.rewarded}${referral.rewardedAt ? ` · ${formatDate(referral.rewardedAt)}` : ""}` : text.pending}
                          </p>
                        </div>
                        <span className={`shrink-0 text-sm font-bold ${rewarded ? "text-primary" : "text-muted-foreground"}`}>
                          {rewarded ? `+${numberFormat.format(referral.bonusMinutes)}` : "—"} {rewarded ? text.minutes : ""}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
              {error && <p role="status" className="border-t border-border px-5 py-3 text-xs text-destructive">{error}</p>}
            </section>
          </>
        ) : null}
      </div>
    </Layout>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}{label}</div>
      <p className="mt-3 text-2xl font-bold tabular-nums">{value}</p>
    </div>
  );
}
