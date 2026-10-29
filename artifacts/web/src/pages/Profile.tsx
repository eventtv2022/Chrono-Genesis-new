import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import {
  AlertCircle, Check, Copy, Eye, EyeOff, FileText,
  Gift, Link2, LoaderCircle, Send, ShieldCheck, Trash2, Upload, Users,
} from "lucide-react";
import { useCitizen } from "@/context/CitizenContext";
import { useLanguage } from "@/context/LanguageContext";
import { Layout } from "@/components/Layout";
import { getListMyTimelineAnchorsQueryKey, getListMyTvCatalogQueryKey, useListMyTimelineAnchors, useListMyTvCatalog } from "@workspace/api-client-react";

interface ProfessionalDocuments {
  resume: { fileName: string; uploadedAt: string | null; visible: boolean } | null;
  portfolio: { fileName: string; uploadedAt: string | null; visible: boolean } | null;
  aiConsent: boolean;
}
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

function formatCapturedMinute(coord: string) {
  if (!/^\d{12}$/.test(coord)) return coord;
  return `${coord.slice(0, 4)}-${coord.slice(4, 6)}-${coord.slice(6, 8)} ${coord.slice(8, 10)}:${coord.slice(10, 12)} UTC`;
}

function tvPlayerUrl(mediaUrl: string | null, catcastUrl: string | null) {
  if (catcastUrl) return catcastUrl;
  const filename = mediaUrl?.split("/").filter(Boolean).pop();
  return filename ? `/api/tv/media/${encodeURIComponent(filename)}` : null;
}

export function Profile() {
  const { citizen, authToken, refreshCitizen } = useCitizen();
  const { lang } = useLanguage();
  const isRu = lang === "ru";
  const anchorsQuery = useListMyTimelineAnchors({
    query: {
      enabled: Boolean(authToken),
      queryKey: [...getListMyTimelineAnchorsQueryKey(), citizen?.id ?? "anonymous"],
    },
    request: { headers: authToken ? { Authorization: `Bearer ${authToken}` } : {} },
  });
  const tvCatalogQuery = useListMyTvCatalog({
    query: {
      enabled: Boolean(authToken),
      queryKey: [...getListMyTvCatalogQueryKey(), citizen?.id ?? "anonymous"],
      retry: false,
    },
    request: { headers: authToken ? { Authorization: `Bearer ${authToken}` } : {} },
  });
  const [documents, setDocuments] = useState<ProfessionalDocuments | null>(null);
  const [referrals, setReferrals] = useState<ReferralProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [passportPhotoUrl, setPassportPhotoUrl] = useState<string | null>(null);
  const fileInputs = useRef<Record<"resume" | "portfolio", HTMLInputElement | null>>({ resume: null, portfolio: null });
  useEffect(() => {
    if (authToken && citizen?.id) void refreshCitizen();
  }, [authToken, citizen?.id]);
  const t = isRu ? {
    eyebrow: "ЛИЧНЫЙ КАБИНЕТ", title: "Профиль", docs: "Резюме и портфолио",
    docsInfo: "PDF-файлы до 3 МБ скрыты по умолчанию. Вы можете разрешить просмотр каждому авторизованному гражданину TimeNation. ИИ использует документы только после вашего согласия.",
    consent: "Согласен на приватное хранение и анализ моих файлов ИИ-аудитором",
    noFile: "Файл не загружен", upload: "Загрузить", replace: "Заменить",
    visible: "Виден гражданам", hidden: "Скрыт",
    referral: "ПРИГЛАШЕНИЯ", invite: "Пригласить друзей",
    inviteInfo: "Приглашайте людей в TimeNation и следите за статусом приглашений.",
    link: "Ваша персональная ссылка", copy: "Скопировать ссылку", copied: "Ссылка скопирована",
    share: "Поделиться в Telegram", invited: "Приглашено", earned: "Всего начислено",
    balance: "Доступный бонусный баланс", min: "мин", history: "История приглашений",
    pending: "Ожидает выдачи паспорта", rewarded: "Бонус начислен",
    empty: "Пока нет приглашений", emptyBody: "Поделитесь ссылкой — приглашённые появятся здесь.",
    signIn: "Войдите в аккаунт гражданина, чтобы открыть личный кабинет.",
    signInButton: "Войти", loading: "Загружаем профиль…", retry: "Повторить",
    uploadError: "Не удалось загрузить файл.", fileError: "Выберите PDF-файл размером не более 3 МБ.",
    captured: "Захваченные минуты", capturedInfo: "Минуты, закреплённые за вашим гражданским профилем.",
    noCaptured: "Пока нет захваченных минут.", capturedError: "Не удалось загрузить захваченные минуты.",
    active: "Захвачена", minted: "NFT выпущен", refreshMinutes: "Обновить",
    videoCatalog: "Видеослоты и капсулы времени", videoCatalogInfo: "Созданные вами видеослоты и капсулы с датой и временем создания.",
    slotCreated: "Слот создан", capsuleCreated: "Капсула создана", capsuleMissing: "Капсула времени ещё не создана",
    slotTimeUnavailable: "Время бронирования недоступно для старой записи", player: "Открыть плеер", playerPending: "Видео ещё не готово", videoCatalogError: "Не удалось загрузить каталог видео.",
  } : {
    eyebrow: "CITIZEN CONTROL ROOM", title: "Profile", docs: "Resume & portfolio",
    docsInfo: "PDF files up to 3 MB are hidden by default. You can allow any signed-in TimeNation citizen to view each file. AI uses documents only with your consent.",
    consent: "I agree to private storage and AI-auditor analysis of my files",
    noFile: "No file uploaded", upload: "Upload", replace: "Replace",
    visible: "Visible to citizens", hidden: "Hidden",
    referral: "INVITATIONS", invite: "Invite friends",
    inviteInfo: "Invite people to TimeNation and track the status of your invitations.",
    link: "Your personal link", copy: "Copy link", copied: "Link copied",
    share: "Share on Telegram", invited: "Invited", earned: "Total earned",
    balance: "Available bonus balance", min: "min", history: "Invitation history",
    pending: "Waiting for passport issuance", rewarded: "Bonus awarded",
    empty: "No invitations yet", emptyBody: "Share your link and invited citizens will appear here.",
    signIn: "Sign in to your citizen account to open your profile.",
    signInButton: "Sign in", loading: "Loading your profile…", retry: "Try again",
    uploadError: "Could not upload the file.", fileError: "Choose a PDF file no larger than 3 MB.",
    captured: "Captured minutes", capturedInfo: "Minutes linked to your citizen profile.",
    noCaptured: "No captured minutes yet.", capturedError: "Could not load captured minutes.",
    active: "Captured", minted: "NFT minted", refreshMinutes: "Refresh",
    videoCatalog: "Video slots & time capsules", videoCatalogInfo: "Videos and capsules you created, with their creation times.",
    slotCreated: "Slot created", capsuleCreated: "Capsule created", capsuleMissing: "No time capsule yet",
    slotTimeUnavailable: "Booking time unavailable for this older record", player: "Open player", playerPending: "Video not ready", videoCatalogError: "Could not load your video catalog.",
  };
  const loadProfileData = useCallback(async (signal?: AbortSignal) => {
    if (!authToken) { setDocuments(null); setReferrals(null); setLoading(false); return; }
    setLoading(true);
    setError("");
    try {
      const headers = { Authorization: `Bearer ${authToken}` };
      const [docsResponse, referralsResponse] = await Promise.all([
        fetch("/api/citizens/me/professional-documents", { headers, signal }),
        fetch("/api/referrals/me", { headers, signal }),
      ]);
      if (!docsResponse.ok) throw new Error(isRu ? "Не удалось загрузить документы профиля." : "Could not load profile documents.");
      if (!referralsResponse.ok) throw new Error(isRu ? "Не удалось загрузить данные приглашений." : "Could not load invitation details.");
      const [docsData, referralData] = await Promise.all([docsResponse.json(), referralsResponse.json()]);
      if (!signal?.aborted) {
        setDocuments(docsData as ProfessionalDocuments);
        setReferrals(referralData as ReferralProfile);
      }
    } catch (cause) {
      if (!signal?.aborted) setError(cause instanceof Error ? cause.message : t.uploadError);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [authToken, isRu, t.uploadError]);

  useEffect(() => {
    const controller = new AbortController();
    void loadProfileData(controller.signal);
    return () => controller.abort();
  }, [loadProfileData]);

  useEffect(() => {
    if (!citizen?.id || !citizen.photoUrl || !authToken) {
      setPassportPhotoUrl(null);
      return;
    }

    const controller = new AbortController();
    let objectUrl: string | null = null;
    setPassportPhotoUrl(null);

    void fetch(`/api/citizens/${citizen.id}/photo`, {
      headers: { Authorization: `Bearer ${authToken}` },
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error("Passport photo unavailable");
        return response.blob();
      })
      .then((photo) => {
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(photo);
        setPassportPhotoUrl(objectUrl);
      })
      .catch(() => {
        if (!controller.signal.aborted) setPassportPhotoUrl(null);
      });

    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [citizen?.id, citizen?.photoUrl, authToken]);

  const mutateDocument = async (request: () => Promise<Response>) => {
    setBusy(true); setError("");
    try {
      const response = await request();
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error || t.uploadError);
      await loadProfileData();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.uploadError);
    } finally { setBusy(false); }
  };
  const upload = (kind: "resume" | "portfolio", file?: File) => {
    if (!file) return;
    if (file.type !== "application/pdf" || file.size > 3 * 1024 * 1024) { setError(t.fileError); return; }
    if (!consent || !authToken) return;
    const form = new FormData();
    form.append("file", file, file.name);
    form.append("aiConsent", "true");
    void mutateDocument(() => fetch(`/api/citizens/me/professional-documents/${kind}`, {
      method: "POST", headers: { Authorization: `Bearer ${authToken}` }, body: form,
    }));
  };
  const setVisibility = (kind: "resume" | "portfolio", visible: boolean) => {
    if (!documents || !authToken) return;
    void mutateDocument(() => fetch("/api/citizens/me/professional-documents/privacy", {
      method: "PATCH",
      headers: { Authorization: `Bearer ${authToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        resumeVisible: kind === "resume" ? visible : !!documents.resume?.visible,
        portfolioVisible: kind === "portfolio" ? visible : !!documents.portfolio?.visible,
      }),
    }));
  };
  const copyLink = async () => {
    if (!referrals?.referralUrl) return;
    try {
      await navigator.clipboard.writeText(referrals.referralUrl);
      setCopied(true); window.setTimeout(() => setCopied(false), 2200);
    } catch { setError(isRu ? "Не удалось скопировать ссылку." : "Could not copy the link."); }
  };
  const shareInvite = () => {
    if (!referrals?.referralUrl) return;
    const message = isRu ? "Присоединяйся к TimeNation — экономике взаимного времени." : "Join me in TimeNation, an economy built on exchanging time.";
    window.open(`https://t.me/share/url?url=${encodeURIComponent(referrals.referralUrl)}&text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
  };
  const formatNumber = new Intl.NumberFormat(isRu ? "ru-RU" : "en-GB", { maximumFractionDigits: 2 });
  const formatDate = (value: string) => new Intl.DateTimeFormat(isRu ? "ru-RU" : "en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
  const formatCreatedAt = (value: string) => new Intl.DateTimeFormat(isRu ? "ru-RU" : "en-GB", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC", timeZoneName: "short",
  }).format(new Date(value));

  return <Layout>
    <main className="mx-auto w-full max-w-5xl space-y-6">
      <header className="flex items-center justify-between">
        <div><p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">{t.eyebrow}</p><h1 className="mt-1 text-3xl font-bold tracking-tight">{t.title}</h1></div>
        <div className="grid h-14 w-14 place-items-center overflow-hidden rounded-full border border-primary/30 bg-primary/10 text-xl font-bold text-primary" aria-label={isRu ? "Аватар гражданина" : "Citizen avatar"}>
          {passportPhotoUrl ? <img src={passportPhotoUrl} alt="" className="h-full w-full object-cover" /> : citizen?.name?.trim().charAt(0).toLocaleUpperCase() || "?"}
        </div>
      </header>
      {!authToken ? <section className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">{t.signIn}<Link className="ml-3 font-semibold text-primary hover:underline" href="/login?returnTo=%2Fprofile">{t.signInButton}</Link></section> : <>
        <section className="grid grid-cols-2 gap-3" aria-label={isRu ? "Прогресс Time Matrix" : "Time Matrix progress"} data-testid="section-time-matrix-progress">
          <div className="rounded-xl border border-border bg-card p-4"><p className="text-xs text-muted-foreground">{isRu ? "Опыт Time Matrix" : "Time Matrix XP"}</p><p className="mt-1 text-2xl font-bold text-primary" data-testid="text-time-matrix-xp">{new Intl.NumberFormat(isRu ? "ru-RU" : "en-GB").format(citizen?.timeXp ?? 0)} XP</p></div>
          <div className="rounded-xl border border-border bg-card p-4"><p className="text-xs text-muted-foreground">{isRu ? "Текущая серия" : "Current streak"}</p><p className="mt-1 text-2xl font-bold text-primary" data-testid="text-time-matrix-streak">{citizen?.streakDays ?? 0} {isRu ? "дн." : "days"}</p></div>
        </section>
        <section className="rounded-2xl border border-border bg-card p-5 md:p-6">
          <h2 className="text-lg font-bold">{t.docs}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{t.docsInfo}</p>
          <label className="mt-4 flex cursor-pointer items-start gap-3 text-sm leading-5">
            <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-1 accent-primary" />
            <span>{t.consent}</span>
          </label>
          <div className="mt-4 space-y-3">
            {(["resume", "portfolio"] as const).map((kind) => {
              const doc = documents?.[kind];
              const label = kind === "resume" ? (isRu ? "Резюме" : "Resume") : (isRu ? "Портфолио" : "Portfolio");
              return <div key={kind} className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-background/50 p-3">
                <FileText className="h-5 w-5 shrink-0 text-primary" />
                <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{label}</p><p className="truncate text-xs text-muted-foreground">{doc?.fileName ?? t.noFile}</p></div>
                {doc && <button type="button" disabled={busy} onClick={() => setVisibility(kind, !doc.visible)} className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-2 text-xs hover:bg-secondary disabled:opacity-50" aria-label={`${doc.visible ? "Hide" : "Show"} ${label}`}>
                  {doc.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}{doc.visible ? t.visible : t.hidden}
                </button>}
                {doc && <button type="button" disabled={busy} onClick={() => void mutateDocument(() => fetch(`/api/citizens/me/professional-documents/${kind}`, { method: "DELETE", headers: { Authorization: `Bearer ${authToken}` } }))} className="rounded-md p-2 text-destructive hover:bg-destructive/10 disabled:opacity-50" aria-label={isRu ? "Удалить файл" : "Remove file"}><Trash2 className="h-4 w-4" /></button>}
                <button type="button" disabled={busy || !consent} onClick={() => fileInputs.current[kind]?.click()} className="inline-flex min-h-9 items-center gap-2 rounded-md border border-primary/40 px-3 text-xs font-semibold text-primary hover:bg-primary/10 disabled:opacity-40">
                  {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}{doc ? t.replace : t.upload}
                </button>
                <input ref={(element) => { fileInputs.current[kind] = element; }} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(event) => { upload(kind, event.currentTarget.files?.[0]); event.currentTarget.value = ""; }} />
              </div>;
            })}
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-border bg-card" data-testid="section-captured-minutes">
          <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
            <div><h2 className="text-lg font-bold">{t.captured}</h2><p className="mt-1 text-sm text-muted-foreground">{t.capturedInfo}</p></div>
            <button type="button" onClick={() => void anchorsQuery.refetch()} disabled={anchorsQuery.isFetching} className="inline-flex min-h-9 items-center gap-2 rounded-md border border-border px-3 text-xs font-semibold hover:bg-secondary disabled:opacity-50" data-testid="button-refresh-captured-minutes">
              {anchorsQuery.isFetching ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{t.refreshMinutes}
            </button>
          </div>
          {!authToken ? <p className="px-5 py-6 text-sm text-muted-foreground">{t.signIn}</p>
            : anchorsQuery.isLoading ? <div role="status" className="px-5 py-8 text-center text-sm text-muted-foreground"><LoaderCircle className="mx-auto mb-2 h-5 w-5 animate-spin text-primary" />{t.loading}</div>
            : anchorsQuery.isError ? <div role="alert" className="px-5 py-6 text-sm text-destructive">{t.capturedError}</div>
            : !anchorsQuery.data?.length ? <p className="px-5 py-8 text-center text-sm text-muted-foreground" data-testid="empty-captured-minutes">{t.noCaptured}</p>
            : <div className="divide-y divide-border">{anchorsQuery.data.map((anchor) => (
              <article key={anchor.timelineCoord} className="flex flex-wrap items-center gap-3 px-5 py-4" data-testid={`card-captured-minute-${anchor.timelineCoord}`}>
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-primary/20 bg-primary/10 text-primary"><FileText className="h-4 w-4" /></div>
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-sm font-semibold">{formatCapturedMinute(anchor.timelineCoord)}</p>
                  {anchor.capsuleText && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{anchor.capsuleText}</p>}
                </div>
                <span className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">{anchor.status === "MINTED" ? t.minted : t.active}</span>
              </article>
            ))}</div>}
        </section>

        <section className="overflow-hidden rounded-2xl border border-border bg-card" data-testid="section-tv-catalog">
          <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
            <div><h2 className="text-lg font-bold">{t.videoCatalog}</h2><p className="mt-1 text-sm text-muted-foreground">{t.videoCatalogInfo}</p></div>
            <button type="button" onClick={() => void tvCatalogQuery.refetch()} disabled={tvCatalogQuery.isFetching} className="inline-flex min-h-9 items-center gap-2 rounded-md border border-border px-3 text-xs font-semibold hover:bg-secondary disabled:opacity-50" data-testid="button-refresh-tv-catalog">
              {tvCatalogQuery.isFetching ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{t.refreshMinutes}
            </button>
          </div>
          {!authToken ? <p className="px-5 py-6 text-sm text-muted-foreground">{t.signIn}</p>
            : tvCatalogQuery.isLoading ? <div role="status" className="px-5 py-8 text-center text-sm text-muted-foreground"><LoaderCircle className="mx-auto mb-2 h-5 w-5 animate-spin text-primary" />{t.loading}</div>
            : tvCatalogQuery.isError ? <div role="alert" className="px-5 py-6 text-sm text-destructive">{t.videoCatalogError}</div>
            : !tvCatalogQuery.data?.items.length ? <p className="px-5 py-8 text-center text-sm text-muted-foreground" data-testid="empty-tv-catalog">{isRu ? "Пока нет созданных видеослотов." : "No video slots created yet."}</p>
            : <div className="divide-y divide-border">{tvCatalogQuery.data.items.map((item) => {
              const playerUrl = tvPlayerUrl(item.mediaUrl, item.catcastUrl);
              const slotTime = `${String(Math.floor(item.minuteIndex / 60)).padStart(2, "0")}:${String(item.minuteIndex % 60).padStart(2, "0")}`;
              return <article key={item.slotId} className="flex flex-wrap items-center gap-3 px-5 py-4" data-testid={`card-tv-catalog-${item.slotId}`}>
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-primary/20 bg-primary/10 text-primary"><FileText className="h-4 w-4" /></div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{item.seedText?.trim() || (isRu ? "Капсула времени" : "Time capsule")} · {item.slotDate} {slotTime} UTC</p>
                  <p className="mt-1 text-xs text-muted-foreground">{t.slotCreated}: {item.slotCreatedAt ? formatCreatedAt(item.slotCreatedAt) : t.slotTimeUnavailable}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{item.capsuleCreatedAt ? `${t.capsuleCreated}: ${formatCreatedAt(item.capsuleCreatedAt)}` : t.capsuleMissing}</p>
                </div>
                {playerUrl ? <a href={playerUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center gap-2 rounded-md border border-primary/40 px-3 text-xs font-semibold text-primary hover:bg-primary/10" data-testid={`link-tv-player-${item.slotId}`}>
                  <Link2 className="h-4 w-4" />{t.player}
                </a> : <span className="text-xs text-muted-foreground">{t.playerPending}</span>}
              </article>;
            })}</div>}
        </section>

        {loading ? <div role="status" className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground"><LoaderCircle className="mx-auto mb-3 h-5 w-5 animate-spin text-primary" />{t.loading}</div> : referrals && <>
          <section className="grid gap-4 rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/[0.10] via-card to-card p-5 md:grid-cols-[1fr_auto] md:items-center md:p-7">
            <div><p className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-primary"><Gift className="h-4 w-4" />{t.referral}</p><h2 className="mt-2 text-2xl font-bold">{t.invite}</h2><p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{t.inviteInfo}</p></div>
            <button type="button" onClick={shareInvite} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground"><Send className="h-4 w-4" />{t.invite}</button>
          </section>
          <section className="rounded-xl border border-border bg-card p-5">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Link2 className="h-4 w-4 text-primary" />{t.link}</h3>
            <div className="flex flex-col gap-3 sm:flex-row"><input readOnly value={referrals.referralUrl} onFocus={(event) => event.currentTarget.select()} className="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-2.5 text-sm" aria-label={t.link} />
              <button type="button" onClick={() => void copyLink()} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-primary/40 px-4 text-sm font-semibold text-primary hover:bg-primary/10">{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied ? t.copied : t.copy}</button>
              <button type="button" onClick={shareInvite} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-border px-4 text-sm hover:bg-secondary"><Send className="h-4 w-4" />{t.share}</button>
            </div>
          </section>
          <section className="grid gap-3 sm:grid-cols-3">
            {[
              [<Users className="h-4 w-4" />, t.invited, formatNumber.format(referrals.referralCount)],
              [<Gift className="h-4 w-4" />, t.earned, `${formatNumber.format(referrals.earnedBonusMinutes)} ${t.min}`],
              [<ShieldCheck className="h-4 w-4" />, t.balance, `${formatNumber.format(referrals.bonusBalanceMinutes)} ${t.min}`],
            ].map(([icon, label, value], index) => <div key={index} className="rounded-xl border border-border bg-card p-4"><div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}{label}</div><p className="mt-3 text-2xl font-bold tabular-nums">{value}</p></div>)}
          </section>
          <section className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-5 py-4"><h2 className="font-semibold">{t.history}</h2><span className="font-mono text-sm text-primary">{String(referrals.referrals.length).padStart(2, "0")}</span></div>
            {referrals.referrals.length === 0 ? <div className="px-5 py-10 text-center"><Users className="mx-auto mb-3 h-8 w-8 text-muted-foreground" /><h3 className="font-semibold">{t.empty}</h3><p className="mt-1 text-sm text-muted-foreground">{t.emptyBody}</p></div> :
              <div className="divide-y divide-border">{referrals.referrals.map((item) => {
                const rewarded = item.status === "rewarded";
                return <div key={item.id} className="flex items-center gap-3 px-5 py-4">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-primary/20 bg-primary/10 font-semibold text-primary">{item.name.trim()[0]?.toLocaleUpperCase() || "?"}</div>
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{item.name}</p><p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">{rewarded ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <LoaderCircle className="h-3.5 w-3.5 text-primary" />}{rewarded ? `${t.rewarded}${item.rewardedAt ? ` · ${formatDate(item.rewardedAt)}` : ""}` : t.pending}</p></div>
                  <span className={`shrink-0 text-sm font-bold ${rewarded ? "text-primary" : "text-muted-foreground"}`}>{rewarded ? `+${formatNumber.format(item.bonusMinutes)} ${t.min}` : "—"}</span>
                </div>;
              })}</div>}
          </section>
        </>}
        {!!error && <div role="alert" className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"><AlertCircle className="h-4 w-4 shrink-0" />{error}<button onClick={() => void loadProfileData()} className="ml-auto underline">{t.retry}</button></div>}
      </>}
    </main>
  </Layout>;
}
