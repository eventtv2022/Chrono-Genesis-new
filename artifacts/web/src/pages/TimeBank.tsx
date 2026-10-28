import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowDownToLine, ArrowUpFromLine, BadgeCheck, Banknote, Clock3, History, LockKeyhole, ShieldCheck, TrendingUp } from "lucide-react";
import { Layout } from "@/components/Layout";
import { useCitizen } from "@/context/CitizenContext";
import { useLanguage } from "@/context/LanguageContext";

interface Loan {
  id: number;
  citizenId: number;
  amount: number;
  remainingDebt: number;
  status: string;
  createdAt: string;
  repaidAt: string | null;
}

interface LedgerEntry {
  id: number;
  citizenId: number;
  loanId: number | null;
  type: "loan_issued" | "manual_repayment" | "auto_repayment" | "collateral_released";
  amount: number;
  note: string | null;
  createdAt: string;
}

interface TimeBankStatus {
  citizenId: number;
  creditLimit: number;
  activeDebt: number;
  availableCredit: number;
  maxDebtCap: number;
  atCap: boolean;
  completedServicesCount: number;
  totalMinutesWorked: number;
  nextLevel: { label: string; currentMinutes: number; targetMinutes: number } | null;
  statusLabel: string;
  loans: Loan[];
  ledger: LedgerEntry[];
}

interface Disclosure {
  version: string;
  accepted: boolean;
}

function apiError(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && "error" in body && typeof body.error === "string") return body.error;
  return fallback;
}

function formatDate(value: string, lang: string) {
  return new Intl.DateTimeFormat(lang === "ru" ? "ru-RU" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function TimeBank() {
  const { citizen, authToken, authHeaders, refreshCitizen } = useCitizen();
  const { lang } = useLanguage();
  const isRu = lang === "ru";
  const queryClient = useQueryClient();
  const statusKey = ["timebank-status", citizen?.id] as const;
  const disclosureKey = ["timebank-disclosure", citizen?.id] as const;
  const [checked, setChecked] = useState(false);
  const [borrowAmount, setBorrowAmount] = useState("");
  const [repayAmount, setRepayAmount] = useState("");
  const [borrowError, setBorrowError] = useState("");
  const [repayError, setRepayError] = useState("");
  const [borrowed, setBorrowed] = useState(false);
  const [repaid, setRepaid] = useState(false);

  const copy = isRu ? {
    title: "Банк времени", subtitle: "Кредитная линия гражданина",
    intro: "Прозрачный учёт минут, лимита и обязательств.",
    signIn: "Войдите в аккаунт гражданина, чтобы открыть Банк времени.", login: "Войти",
    disclosureTitle: "Перед использованием Банка времени",
    disclosureHeading: "Пожалуйста, ознакомьтесь с условиями",
    disclosure: [
      "Банк времени предоставляет кредит в минутах (Д). Взятая сумма поступает на баланс и учитывается как задолженность. Берите только ту сумму, которую готовы погасить.",
      "Доступная сумма зависит от вашего лимита доверия и активного долга. Лимит может повышаться по мере выполнения услуг и получения минут; текущие значения и прогресс показаны на этой странице.",
      "Погасить долг вручную можно с баланса, сохраняя одну непередаваемую родовую минуту. Заработанные минуты TiMETR автоматически направляются на погашение долга.",
      "Правовой статус Банка времени зависит от законодательства вашей юрисдикции. Это описание не является юридическим заключением и не подтверждает законность продукта в какой-либо стране. Для оценки обратитесь к квалифицированному местному юристу. Дармин (Д) не является финансовым инструментом — это только игровая единица системы.",
    ],
    agreement: "Я ознакомился(ась) с этой информацией и принимаю условия использования Банка времени.",
    accept: "Подтвердить и продолжить", accepting: "Сохраняем подтверждение…",
    disclosureError: "Не удалось проверить подтверждение юридической информации.",
    retry: "Повторить", loading: "Загружаем данные Банка времени…",
    status: "Состояние кредитной линии", limit: "Лимит доверия", debt: "Активный долг",
    available: "Доступно", cap: "Предельный долг", capNotice: "Достигнут предельный размер долга. Новые займы недоступны.",
    borrow: "Получить минуты", borrowHint: "Сумма будет добавлена к балансу и станет долгом.",
    amount: "Количество минут", borrowAction: "Запросить кредит", repay: "Погасить долг",
    repayHint: "Погашение списывается с баланса; одна родовая минута сохраняется.",
    repayAction: "Погасить", fillAll: "Весь долг", balance: "Баланс после сохранения родовой минуты",
    history: "Операции", loans: "Займы", noLoans: "Займов пока нет.",
    noHistory: "Операций пока нет.", nextLevel: "Следующий уровень доверия",
    worked: "Отработано минут", services: "Завершено услуг", empty: "Нет данных для отображения.",
    error: "Не удалось загрузить данные.", borrowed: "Минуты зачислены. Баланс обновлён.",
    repaid: "Погашение учтено. Баланс обновлён.", issued: "Кредит выдан", manual: "Ручное погашение",
    automatic: "Автоматическое погашение", released: "Возврат обеспечения",
    loanActive: "Активный", loanRepaid: "Погашен", issuedUnit: "выдано",
    invalid: "Введите положительное количество минут.", noAuth: "Для этой страницы требуется авторизация гражданина.",
    min: "мин", statusTag: "ЗАЩИЩЁННЫЙ РАЗДЕЛ",
  } : {
    title: "Time Bank", subtitle: "Citizen credit line",
    intro: "A clear record of minutes, credit limits, and repayment.",
    signIn: "Sign in to your citizen account to open the Time Bank.", login: "Sign in",
    disclosureTitle: "Before using the Time Bank",
    disclosureHeading: "Please review this information",
    disclosure: [
      "The Time Bank provides credit in minutes (Д). The amount you borrow is added to your balance and recorded as debt. Borrow only an amount you are prepared to repay.",
      "The available amount depends on your trust limit and active debt. Your limit may rise as you complete services and receive minutes; current values and progress are shown on this page.",
      "You may repay manually from your balance while preserving one non-transferable ancestral minute. Minutes earned through TiMETR are automatically applied to debt.",
      "The Time Bank’s legal status depends on the laws in your jurisdiction. This information is not a legal opinion and makes no claim of legality in any country. Consult a qualified local lawyer for an assessment. Darmin (Д) is not a financial instrument; it is only a game unit within the system.",
    ],
    agreement: "I have read this information and accept the Time Bank terms.",
    accept: "Accept and continue", accepting: "Saving acknowledgement…",
    disclosureError: "Could not check the legal information acknowledgement.",
    retry: "Retry", loading: "Loading Time Bank information…",
    status: "Credit line status", limit: "Trust limit", debt: "Active debt",
    available: "Available", cap: "Maximum debt", capNotice: "The maximum debt cap has been reached. New borrowing is unavailable.",
    borrow: "Borrow minutes", borrowHint: "Borrowed minutes are added to your balance and become debt.",
    amount: "Minutes", borrowAction: "Request credit", repay: "Repay debt",
    repayHint: "Repayment is taken from your balance while one ancestral minute is preserved.",
    repayAction: "Repay", fillAll: "Full amount", balance: "Balance after preserving ancestral minute",
    history: "Activity", loans: "Loans", noLoans: "No loans yet.",
    noHistory: "No activity yet.", nextLevel: "Next trust level",
    worked: "Minutes worked", services: "Services completed", empty: "Nothing to display yet.",
    error: "Could not load Time Bank information.", borrowed: "Minutes issued. Balance updated.",
    repaid: "Repayment recorded. Balance updated.", issued: "Credit issued", manual: "Manual repayment",
    automatic: "Automatic repayment", released: "Collateral released",
    loanActive: "Active", loanRepaid: "Repaid", issuedUnit: "issued",
    invalid: "Enter a positive number of minutes.", noAuth: "Citizen authentication is required for this page.",
    min: "min", statusTag: "SECURE CITIZEN AREA",
  };

  const disclosureQuery = useQuery<Disclosure>({
    queryKey: disclosureKey,
    enabled: Boolean(citizen && authToken),
    retry: false,
    queryFn: async () => {
      const response = await fetch("/api/timebank/disclosure", { headers: authHeaders });
      const json = await response.json();
      if (!response.ok) throw new Error(apiError(json, copy.disclosureError));
      return json as Disclosure;
    },
  });

  const statusQuery = useQuery<TimeBankStatus>({
    queryKey: statusKey,
    enabled: Boolean(citizen && authToken && disclosureQuery.data?.accepted),
    refetchInterval: 15_000,
    queryFn: async () => {
      const response = await fetch("/api/timebank/status", { headers: authHeaders });
      const json = await response.json();
      if (!response.ok) throw new Error(apiError(json, copy.error));
      return json as TimeBankStatus;
    },
  });

  const acceptMutation = useMutation({
    mutationFn: async () => {
      const version = disclosureQuery.data?.version;
      if (!version) throw new Error(copy.disclosureError);
      const response = await fetch("/api/timebank/disclosure/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ version, language: isRu ? "ru" : "en" }),
      });
      const json = await response.json();
      if (!response.ok || json.accepted !== true) throw new Error(apiError(json, copy.disclosureError));
      return json as Disclosure;
    },
    onSuccess: (data) => {
      setChecked(false);
      queryClient.setQueryData(disclosureKey, data);
      void queryClient.invalidateQueries({ queryKey: statusKey });
    },
  });

  const mutationOptions = (kind: "borrow" | "repay") => ({
    mutationFn: async (amount: number) => {
      const response = await fetch(`/api/timebank/${kind}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ amount }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(apiError(json, copy.error));
      return json as { ok: true } & TimeBankStatus;
    },
    onSuccess: async (data: { ok: true } & TimeBankStatus) => {
      queryClient.setQueryData(statusKey, data);
      if (kind === "borrow") {
        setBorrowAmount("");
        setBorrowError("");
        setBorrowed(true);
        setRepaid(false);
      } else {
        setRepayAmount("");
        setRepayError("");
        setRepaid(true);
        setBorrowed(false);
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: statusKey }),
        refreshCitizen(),
      ]);
    },
  });

  const borrowMutation = useMutation(mutationOptions("borrow"));
  const repayMutation = useMutation(mutationOptions("repay"));

  const submitAmount = (kind: "borrow" | "repay") => (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const raw = kind === "borrow" ? borrowAmount : repayAmount;
    const value = Number(raw);
    const errorSetter = kind === "borrow" ? setBorrowError : setRepayError;
    if (!Number.isFinite(value) || value <= 0) {
      errorSetter(copy.invalid);
      return;
    }
    errorSetter("");
    if (kind === "borrow") borrowMutation.mutate(value);
    else repayMutation.mutate(value);
  };

  const data = statusQuery.data;
  const activeLoans = data?.loans.filter(loan => loan.status === "active") ?? [];
  const ledgerLabel = (type: LedgerEntry["type"]) => ({
    loan_issued: copy.issued,
    manual_repayment: copy.manual,
    auto_repayment: copy.automatic,
    collateral_released: copy.released,
  }[type]);

  return (
    <Layout>
      <div className="mx-auto max-w-5xl space-y-7 pb-10" data-testid="page-timebank">
        <header className="relative overflow-hidden rounded-xl border border-border bg-card px-6 py-7 md:px-9 md:py-9">
          <div className="absolute -right-10 -top-16 h-56 w-56 rounded-full border border-primary/10" />
          <div className="absolute -right-2 -top-8 h-40 w-40 rounded-full border border-primary/10" />
          <div className="relative flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="mb-3 flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.2em] text-primary">
                <ShieldCheck className="h-4 w-4" /> {copy.statusTag}
              </div>
              <h1 className="text-3xl font-semibold tracking-tight md:text-4xl" data-testid="text-timebank-title">{copy.title}</h1>
              <p className="mt-2 text-sm text-muted-foreground">{copy.intro}</p>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="grid h-10 w-10 place-items-center rounded-full border border-primary/20 bg-primary/5 text-primary">
                <Clock3 className="h-5 w-5" />
              </span>
              <span><span className="block font-medium text-foreground">{copy.subtitle}</span>{citizen?.name ?? copy.noAuth}</span>
            </div>
          </div>
        </header>

        {!citizen || !authToken ? (
          <section className="rounded-xl border border-border bg-card p-7" data-testid="status-timebank-auth-required">
            <div className="flex items-start gap-4">
              <LockKeyhole className="mt-1 h-5 w-5 text-primary" />
              <div className="space-y-3">
                <h2 className="text-lg font-semibold">{copy.noAuth}</h2>
                <p className="text-sm text-muted-foreground">{copy.signIn}</p>
                <Link href="/login?returnTo=%2Ftimebank" className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90" data-testid="link-timebank-login">
                  {copy.login}
                </Link>
              </div>
            </div>
          </section>
        ) : disclosureQuery.isLoading ? (
          <div className="space-y-4" aria-label={copy.loading} data-testid="status-timebank-disclosure-loading">
            {[0, 1].map(i => <div key={i} className="h-24 animate-pulse rounded-xl border border-border bg-card" />)}
          </div>
        ) : disclosureQuery.isError || !disclosureQuery.data ? (
          <section className="rounded-xl border border-destructive/30 bg-card p-7" role="alert" data-testid="status-timebank-disclosure-error">
            <p className="text-sm text-destructive">{disclosureQuery.error instanceof Error ? disclosureQuery.error.message : copy.disclosureError}</p>
            <button type="button" onClick={() => void disclosureQuery.refetch()} className="mt-4 rounded-md border border-border px-4 py-2 text-sm hover:bg-secondary" data-testid="button-timebank-disclosure-retry">{copy.retry}</button>
          </section>
        ) : !disclosureQuery.data.accepted ? (
          <section className="rounded-xl border border-primary/20 bg-card p-6 md:p-8" data-testid="panel-timebank-disclosure">
            <div className="mb-6 flex items-start gap-4">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"><ShieldCheck className="h-5 w-5" /></span>
              <div><p className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary">{copy.disclosureTitle}</p><h2 className="mt-1 text-xl font-semibold">{copy.disclosureHeading}</h2></div>
            </div>
            <div className="space-y-4 border-l border-primary/20 pl-4 text-sm leading-6 text-muted-foreground">
              {copy.disclosure.map((paragraph, index) => <p key={index} data-testid={`text-timebank-disclosure-${index + 1}`}>{paragraph}</p>)}
            </div>
            <label className="mt-7 flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-background/50 p-4 text-sm leading-6">
              <input type="checkbox" checked={checked} onChange={event => setChecked(event.target.checked)} className="mt-1 h-4 w-4 accent-[hsl(var(--primary))]" data-testid="checkbox-timebank-disclosure" />
              <span>{copy.agreement}</span>
            </label>
            {acceptMutation.isError && <p className="mt-3 text-sm text-destructive" role="alert" data-testid="status-timebank-accept-error">{acceptMutation.error instanceof Error ? acceptMutation.error.message : copy.error}</p>}
            <button type="button" disabled={!checked || acceptMutation.isPending} onClick={() => acceptMutation.mutate()} className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45" data-testid="button-timebank-disclosure-accept">
              {acceptMutation.isPending ? <span className="h-4 w-4 animate-pulse rounded-full bg-current/50" /> : <BadgeCheck className="h-4 w-4" />}
              {acceptMutation.isPending ? copy.accepting : copy.accept}
            </button>
          </section>
        ) : statusQuery.isLoading ? (
          <section className="space-y-4" aria-label={copy.loading} data-testid="status-timebank-loading">
            <div className="h-56 animate-pulse rounded-xl border border-border bg-card" />
            <div className="h-32 animate-pulse rounded-xl border border-border bg-card" />
          </section>
        ) : statusQuery.isError || !data ? (
          <section className="rounded-xl border border-destructive/30 bg-card p-7" role="alert" data-testid="status-timebank-error">
            <p className="text-sm text-destructive">{statusQuery.error instanceof Error ? statusQuery.error.message : copy.error}</p>
            <button type="button" onClick={() => void statusQuery.refetch()} className="mt-4 rounded-md border border-border px-4 py-2 text-sm hover:bg-secondary" data-testid="button-timebank-retry">{copy.retry}</button>
          </section>
        ) : (
          <>
            <section className="rounded-xl border border-border bg-card p-6 md:p-8" data-testid="card-timebank-status">
              <div className="flex flex-col justify-between gap-5 border-b border-border pb-5 sm:flex-row sm:items-start">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{copy.status}</p>
                  <h2 className="mt-2 text-2xl font-semibold" data-testid="status-timebank-label">{data.statusLabel}</h2>
                </div>
                <span className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${data.atCap ? "border-destructive/30 bg-destructive/10 text-destructive" : "border-primary/20 bg-primary/5 text-primary"}`} data-testid="status-timebank-cap">
                  <span className={`h-1.5 w-1.5 rounded-full ${data.atCap ? "bg-destructive" : "bg-primary"}`} />
                  {data.atCap ? copy.capNotice : `${copy.cap}: ${data.maxDebtCap} ${copy.min}`}
                </span>
              </div>
              <div className="grid gap-3 pt-5 sm:grid-cols-3">
                {[
                  { label: copy.limit, value: data.creditLimit, tone: "text-foreground" },
                  { label: copy.debt, value: data.activeDebt, tone: data.activeDebt > 0 ? "text-amber-400" : "text-foreground" },
                  { label: copy.available, value: data.availableCredit, tone: "text-primary" },
                ].map(item => (
                  <div className="rounded-lg border border-border bg-background/50 p-4" key={item.label}>
                    <p className="text-xs text-muted-foreground">{item.label}</p>
                    <p className={`mt-2 font-mono text-2xl font-semibold ${item.tone}`} data-testid={`value-timebank-${item.label === copy.limit ? "limit" : item.label === copy.debt ? "debt" : "available"}`}>{item.value}<span className="ml-1 text-xs font-normal text-muted-foreground">{copy.min}</span></p>
                  </div>
                ))}
              </div>
              <div className="mt-5">
                <div className="mb-2 flex justify-between text-xs text-muted-foreground"><span>{copy.debt}</span><span>{data.activeDebt} / {data.creditLimit} {copy.min}</span></div>
                <div className="h-2 overflow-hidden rounded-full bg-secondary"><div className={`h-full rounded-full transition-all ${data.atCap ? "bg-destructive" : "bg-primary"}`} style={{ width: `${Math.min(100, data.creditLimit > 0 ? data.activeDebt / data.creditLimit * 100 : 0)}%` }} /></div>
              </div>
            </section>

            {data.nextLevel && (
              <section className="grid gap-5 rounded-xl border border-border bg-card p-6 md:grid-cols-[1fr_auto] md:items-center" data-testid="card-timebank-next-level">
                <div>
                  <div className="flex items-center gap-2 text-sm font-semibold"><TrendingUp className="h-4 w-4 text-primary" />{copy.nextLevel}</div>
                  <p className="mt-2 text-sm text-muted-foreground">{data.nextLevel.label}</p>
                  {data.nextLevel.targetMinutes > 0 && <>
                    <div className="mt-4 flex justify-between font-mono text-xs text-muted-foreground"><span>{copy.worked}</span><span>{data.nextLevel.currentMinutes} / {data.nextLevel.targetMinutes} {copy.min}</span></div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary"><div className="h-full bg-primary" style={{ width: `${Math.min(100, data.nextLevel.currentMinutes / data.nextLevel.targetMinutes * 100)}%` }} /></div>
                  </>}
                </div>
                <div className="flex gap-6 border-t border-border pt-4 md:border-l md:border-t-0 md:pl-6 md:pt-0">
                  <div><p className="font-mono text-xl font-semibold" data-testid="value-timebank-worked">{data.totalMinutesWorked}</p><p className="text-[11px] text-muted-foreground">{copy.worked}</p></div>
                  <div><p className="font-mono text-xl font-semibold" data-testid="value-timebank-services">{data.completedServicesCount}</p><p className="text-[11px] text-muted-foreground">{copy.services}</p></div>
                </div>
              </section>
            )}

            <div className="grid gap-5 lg:grid-cols-2">
              {data.availableCredit > 0 && (
                <section className="rounded-xl border border-border bg-card p-6" data-testid="panel-timebank-borrow">
                  <div className="mb-2 flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-full bg-primary/10 text-primary"><ArrowDownToLine className="h-4 w-4" /></span><h2 className="text-lg font-semibold">{copy.borrow}</h2></div>
                  <p className="mb-5 text-sm text-muted-foreground">{copy.borrowHint}</p>
                  <form onSubmit={submitAmount("borrow")} className="space-y-3">
                    <label className="block text-xs text-muted-foreground" htmlFor="timebank-borrow-amount">{copy.amount}</label>
                    <div className="flex gap-2">
                      <input id="timebank-borrow-amount" type="number" min="0.01" step="any" max={data.availableCredit} value={borrowAmount} onChange={event => { setBorrowAmount(event.target.value); setBorrowError(""); setBorrowed(false); }} className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2.5 font-mono text-sm outline-none transition focus:border-primary" placeholder={`≤ ${data.availableCredit}`} data-testid="input-timebank-borrow-amount" />
                      <button type="submit" disabled={borrowMutation.isPending} className="inline-flex min-w-28 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50" data-testid="button-timebank-borrow">
                        {borrowMutation.isPending ? <span className="h-4 w-4 animate-pulse rounded-full bg-current/50" /> : <Banknote className="h-4 w-4" />}{copy.borrowAction}
                      </button>
                    </div>
                    {borrowError && <p className="text-xs text-destructive" role="alert" data-testid="status-timebank-borrow-error">{borrowError}</p>}
                    {borrowMutation.isError && <p className="text-xs text-destructive" role="alert" data-testid="status-timebank-borrow-api-error">{borrowMutation.error.message}</p>}
                    {borrowed && <p className="text-xs text-primary" role="status" data-testid="status-timebank-borrow-success">{copy.borrowed}</p>}
                  </form>
                </section>
              )}

              {activeLoans.length > 0 && (
                <section className="rounded-xl border border-border bg-card p-6" data-testid="panel-timebank-repay">
                  <div className="mb-2 flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-full bg-amber-400/10 text-amber-400"><ArrowUpFromLine className="h-4 w-4" /></span><h2 className="text-lg font-semibold">{copy.repay}</h2></div>
                  <p className="mb-5 text-sm text-muted-foreground">{copy.repayHint}</p>
                  <div className="mb-4 rounded-lg border border-border bg-background/50 p-4">
                    <div className="flex items-end justify-between gap-3"><div><p className="font-mono text-2xl font-semibold text-amber-400" data-testid="value-timebank-repay-debt">{data.activeDebt} Д</p><p className="mt-1 text-xs text-muted-foreground">{copy.debt}</p></div><div className="text-right"><p className="text-[10px] text-muted-foreground">{copy.balance}</p><p className="font-mono text-sm">{Math.max(0, citizen.balanceMinutes - 1).toFixed(2)} Д</p></div></div>
                    <button type="button" onClick={() => { setRepayAmount(String(data.activeDebt)); setRepayError(""); }} className="mt-3 text-xs font-medium text-primary hover:underline" data-testid="button-timebank-repay-fill">{copy.fillAll} · {data.activeDebt} Д</button>
                  </div>
                  <form onSubmit={submitAmount("repay")} className="space-y-3">
                    <label className="block text-xs text-muted-foreground" htmlFor="timebank-repay-amount">{copy.amount}</label>
                    <div className="flex gap-2">
                      <input id="timebank-repay-amount" type="number" min="0.01" step="any" max={data.activeDebt} value={repayAmount} onChange={event => { setRepayAmount(event.target.value); setRepayError(""); setRepaid(false); }} className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2.5 font-mono text-sm outline-none transition focus:border-primary" placeholder={`≤ ${data.activeDebt}`} data-testid="input-timebank-repay-amount" />
                      <button type="submit" disabled={repayMutation.isPending} className="inline-flex min-w-24 items-center justify-center gap-2 rounded-md border border-amber-400/30 bg-amber-400/10 px-4 text-sm font-semibold text-amber-300 disabled:opacity-50" data-testid="button-timebank-repay">
                        {repayMutation.isPending ? <span className="h-4 w-4 animate-pulse rounded-full bg-current/50" /> : <ArrowUpFromLine className="h-4 w-4" />}{copy.repayAction}
                      </button>
                    </div>
                    {repayError && <p className="text-xs text-destructive" role="alert" data-testid="status-timebank-repay-error">{repayError}</p>}
                    {repayMutation.isError && <p className="text-xs text-destructive" role="alert" data-testid="status-timebank-repay-api-error">{repayMutation.error.message}</p>}
                    {repaid && <p className="text-xs text-primary" role="status" data-testid="status-timebank-repay-success">{copy.repaid}</p>}
                  </form>
                </section>
              )}
            </div>

            <section className="rounded-xl border border-border bg-card p-6 md:p-7" data-testid="section-timebank-loans">
              <div className="mb-5 flex items-center gap-3"><History className="h-4 w-4 text-primary" /><h2 className="text-lg font-semibold">{copy.loans}</h2><span className="ml-auto rounded-full bg-secondary px-2.5 py-1 font-mono text-[10px] text-muted-foreground">{data.loans.length}</span></div>
              {data.loans.length === 0 ? <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground" data-testid="empty-timebank-loans">{copy.noLoans}</p> : (
                <div className="divide-y divide-border">
                  {[...data.loans].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map(loan => (
                    <article key={loan.id} className="grid gap-3 py-4 first:pt-0 sm:grid-cols-[1fr_auto_auto] sm:items-center" data-testid={`row-timebank-loan-${loan.id}`}>
                      <div><p className="font-medium">{loan.status === "active" ? copy.loanActive : copy.loanRepaid}</p><p className="mt-1 text-xs text-muted-foreground">{formatDate(loan.createdAt, lang)}</p></div>
                      <p className="font-mono text-sm">{loan.amount} Д <span className="text-xs text-muted-foreground">{copy.issuedUnit}</span></p>
                      <p className="font-mono text-sm text-amber-300">{loan.remainingDebt} Д <span className="text-xs text-muted-foreground">{copy.debt.toLowerCase()}</span></p>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-xl border border-border bg-card p-6 md:p-7" data-testid="section-timebank-ledger">
              <div className="mb-5 flex items-center gap-3"><History className="h-4 w-4 text-muted-foreground" /><h2 className="text-lg font-semibold">{copy.history}</h2></div>
              {data.ledger.length === 0 ? <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground" data-testid="empty-timebank-ledger">{copy.noHistory}</p> : (
                <div className="divide-y divide-border">
                  {[...data.ledger].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map(entry => {
                    const positive = entry.type === "loan_issued" || entry.type === "collateral_released";
                    return <article key={entry.id} className="flex items-center gap-3 py-3 first:pt-0" data-testid={`row-timebank-ledger-${entry.id}`}>
                      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${positive ? "bg-primary/10 text-primary" : "bg-amber-400/10 text-amber-300"}`}><Clock3 className="h-4 w-4" /></span>
                      <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{ledgerLabel(entry.type)}</p><p className="mt-1 truncate text-xs text-muted-foreground">{entry.note || formatDate(entry.createdAt, lang)}</p></div>
                      <p className={`shrink-0 font-mono text-sm font-semibold ${positive ? "text-primary" : "text-amber-300"}`}>{positive ? "+" : "−"}{entry.amount} Д</p>
                    </article>;
                  })}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </Layout>
  );
}
