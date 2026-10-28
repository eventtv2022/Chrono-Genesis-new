import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, CircleDollarSign, LoaderCircle, LockKeyhole, Plus, RefreshCw, Send, X } from "lucide-react";
import { MessageCircle } from "lucide-react";
import { useCitizen } from "@/context/CitizenContext";
import { useLanguage } from "@/context/LanguageContext";
import { getListCitizensQueryKey, useListCitizens } from "@workspace/api-client-react";
import { TiMETREscrowDiscussion } from "@/components/TiMETREscrowDiscussion";

export type Deal = {
  id: number;
  senderId: number;
  receiverId: number | null;
  amount: number;
  description: string;
  status: "open" | "accepted" | "proof_submitted" | "completed" | "declined" | "disputed" | "cancelled" | string;
  proofText?: string | null;
  proofUrl?: string | null;
  disputeClaimText?: string | null;
  aiVerdict?: string | null;
  createdAt?: string;
  timerStatus: "stopped" | "running" | "paused" | "completed" | string;
  totalTrackedMinutes: number;
  timerStartedAt?: string | null;
};

type Person = { id: number; name: string };
type AuditResult = { suggestedAmount: number; summary: string; breakdown: string[] };

function asMessage(value: unknown, fallback: string) {
  return value && typeof value === "object" && "error" in value && typeof value.error === "string"
    ? value.error
    : fallback;
}

export function TiMETREscrow() {
  const { citizen, authHeaders, refreshCitizen } = useCitizen();
  const { lang } = useLanguage();
  const isRu = lang === "ru";
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [description, setDescription] = useState("");
  const [receiverId, setReceiverId] = useState("");
  const [amount, setAmount] = useState("");
  const [audit, setAudit] = useState<AuditResult | null>(null);
  const [proofTarget, setProofTarget] = useState<number | null>(null);
  const [proofText, setProofText] = useState("");
  const [proofUrl, setProofUrl] = useState("");
  const [disputeTarget, setDisputeTarget] = useState<number | null>(null);
  const [claimText, setClaimText] = useState("");
  const [discussionDealId, setDiscussionDealId] = useState<number | null>(null);
  const [notice, setNotice] = useState("");
  const [failure, setFailure] = useState("");

  const { data: citizens = [] } = useListCitizens({
    query: { queryKey: getListCitizensQueryKey(), enabled: !!citizen },
  });
  const people = citizens as Person[];
  const { data: deals = [], isPending, isError, refetch } = useQuery<Deal[]>({
    queryKey: ["timetR-escrow-deals", citizen?.id],
    enabled: !!citizen,
    queryFn: async () => {
      const response = await fetch(`/api/deals?citizenId=${citizen!.id}`, { headers: authHeaders });
      const body = await response.json() as { deals?: Deal[]; error?: string };
      if (!response.ok) throw new Error(body.error ?? "Could not load escrow deals.");
      return body.deals ?? [];
    },
    staleTime: 10_000,
    refetchOnWindowFocus: true,
  });

  const mutate = useMutation({
    mutationFn: async ({ path, body }: { path: string; body: Record<string, unknown> }) => {
      const response = await fetch(path, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json() as Deal & { error?: string };
      if (!response.ok) throw new Error(asMessage(data, isRu ? "Не удалось выполнить действие." : "Action failed."));
      return data;
    },
    onSuccess: async () => {
      setFailure("");
      setNotice(isRu ? "Сделка обновлена." : "Deal updated.");
      await queryClient.invalidateQueries({ queryKey: ["timetR-escrow-deals", citizen?.id] });
      await refreshCitizen();
    },
    onError: error => {
      setNotice("");
      setFailure(error instanceof Error ? error.message : (isRu ? "Ошибка соединения." : "Connection error."));
    },
  });

  const auditMutation = useMutation({
    mutationFn: async () => {
      if (!description.trim() || !receiverId) throw new Error(isRu ? "Укажите задачу и выберите исполнителя." : "Describe the task and choose an executor.");
      const response = await fetch("/api/deals/audit", {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ description: description.trim(), lang, executorId: Number(receiverId) }),
      });
      const data = await response.json() as AuditResult & { error?: string };
      if (!response.ok) throw new Error(data.error ?? (isRu ? "Аудит не выполнен." : "Audit failed."));
      return data;
    },
    onSuccess: result => {
      setAudit(result);
      setAmount(String(result.suggestedAmount));
      setFailure("");
    },
    onError: error => setFailure(error instanceof Error ? error.message : (isRu ? "Ошибка аудита." : "Audit error.")),
  });

  const copy = isRu ? {
    title: "Эскроу-сделки", subtitle: "Минуты резервируются до подтверждения выполненной задачи.",
    create: "Новая сделка", loading: "Загружаем сделки…", empty: "Пока нет сделок.",
    retry: "Повторить", amount: "Сумма в Д", task: "Описание задачи", executor: "Исполнитель",
    audit: "Оценить задачу ИИ-аудитором", auditSummary: "Результат аудита", createAction: "Создать и зарезервировать",
    cancel: "Отмена", accept: "Принять задачу", sendProof: "Отправить доказательство",
    proof: "Описание выполненной работы", proofUrl: "Ссылка на доказательство (необязательно)",
    submit: "Отправить", approve: "Подтвердить выполнение", decline: "Отклонить доказательство",
    dispute: "Открыть спор", claim: "Опишите суть спора (не менее 10 символов)",
    cancelDeal: "Отменить сделку и вернуть минуты", sender: "Заказчик", receiver: "Исполнитель",
    frozen: "зарезервировано", confirmCancel: "Точно отменить сделку и вернуть сумму?",
    status: { open: "Открыта", accepted: "Принята исполнителем", proof_submitted: "Ожидает подтверждения", completed: "Завершена", declined: "Доказательство отклонено", disputed: "Спор открыт", cancelled: "Отменена" } as Record<string, string>,
    proofLabel: "Доказательство", claimLabel: "Претензия", verdict: "Заключение ИИ-арбитра",
  } : {
    title: "Escrow deals", subtitle: "Minutes stay locked until the completed task is approved.",
    create: "New deal", loading: "Loading deals…", empty: "No deals yet.",
    retry: "Retry", amount: "Amount in Д", task: "Task description", executor: "Executor",
    audit: "Review task with AI auditor", auditSummary: "Audit result", createAction: "Create and reserve",
    cancel: "Cancel", accept: "Accept task", sendProof: "Submit proof",
    proof: "Work completed description", proofUrl: "Evidence link (optional)",
    submit: "Submit", approve: "Approve completion", decline: "Decline proof",
    dispute: "Open a dispute", claim: "Describe the dispute (at least 10 characters)",
    cancelDeal: "Cancel deal and return minutes", sender: "Customer", receiver: "Executor",
    frozen: "reserved", confirmCancel: "Cancel this deal and return the reserved amount?",
    status: { open: "Open", accepted: "Accepted", proof_submitted: "Awaiting approval", completed: "Completed", declined: "Proof declined", disputed: "Disputed", cancelled: "Cancelled" } as Record<string, string>,
    proofLabel: "Proof", claimLabel: "Claim", verdict: "AI arbitrator decision",
  };

  const inputClass = "w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary";
  const buttonClass = "inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";

  function run(path: string, body: Record<string, unknown>, onSuccess?: () => void) {
    setFailure("");
    setNotice("");
    mutate.mutate({ path, body }, { onSuccess });
  }

  async function createDeal(event: React.FormEvent) {
    event.preventDefault();
    if (!citizen || !audit) {
      setFailure(isRu ? "Сначала запустите аудит задачи." : "Run the task audit before creating a deal.");
      return;
    }
    const value = Number(amount);
    if (!Number.isInteger(value) || value < 1 || value > 10000) {
      setFailure(isRu ? "Введите целое число минут от 1 до 10000." : "Enter a whole number from 1 to 10,000 minutes.");
      return;
    }
    setFailure("");
    setNotice("");
    mutate.mutate({
      path: "/api/deals",
      body: { senderId: citizen.id, receiverId: Number(receiverId), amount: value, description: description.trim() },
    }, {
      onSuccess: async () => {
        setShowCreate(false);
        setDescription("");
        setReceiverId("");
        setAmount("");
        setAudit(null);
        setNotice(isRu ? "Сделка создана, минуты зарезервированы." : "Deal created and minutes reserved.");
        await queryClient.invalidateQueries({ queryKey: ["timetR-escrow-deals", citizen.id] });
        await refreshCitizen();
      },
    });
  }

  function statusColor(status: string) {
    if (status === "completed") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-300";
    if (status === "disputed" || status === "declined") return "border-rose-500/40 bg-rose-500/10 text-rose-300";
    if (status === "cancelled") return "border-border bg-secondary text-muted-foreground";
    if (status === "open") return "border-sky-500/40 bg-sky-500/10 text-sky-300";
    return "border-amber-500/40 bg-amber-500/10 text-amber-300";
  }

  return (
    <section className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">{copy.title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{copy.subtitle}</p>
        </div>
        <button type="button" onClick={() => { setShowCreate(true); setFailure(""); }} className={`${buttonClass} bg-primary text-primary-foreground hover:opacity-90`}>
          <Plus className="h-4 w-4" />{copy.create}
        </button>
      </header>

      {notice && <p role="status" className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">{notice}</p>}
      {failure && !showCreate && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{failure}</p>}

      {isPending ? <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">{copy.loading}</div>
        : isError ? <div className="rounded-xl border border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">{isRu ? "Не удалось загрузить сделки." : "Could not load deals."}</p>
          <button type="button" onClick={() => void refetch()} className={`${buttonClass} mt-3 border border-border`}><RefreshCw className="h-4 w-4" />{copy.retry}</button>
        </div>
        : deals.length === 0 ? <div className="rounded-xl border border-dashed border-border bg-card/50 p-10 text-center">
          <LockKeyhole className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">{copy.empty}</p>
        </div>
        : <div className="grid gap-4 xl:grid-cols-2">
          {deals.map(deal => {
            const isSender = deal.senderId === citizen?.id;
            const canAccept = !isSender && deal.status === "open" && deal.receiverId === null;
            const canProof = !isSender && deal.status === "accepted" && deal.receiverId === citizen?.id;
            const canApprove = isSender && deal.status === "proof_submitted";
            const canDispute = ["accepted", "proof_submitted", "declined"].includes(deal.status);
            const canCancel = isSender && ["open", "accepted", "declined"].includes(deal.status);
            const canDiscuss = (isSender || deal.receiverId === citizen?.id) && !["cancelled", "completed"].includes(deal.status);
            const sender = people.find(person => person.id === deal.senderId)?.name ?? `#${deal.senderId}`;
            const receiver = deal.receiverId ? people.find(person => person.id === deal.receiverId)?.name ?? `#${deal.receiverId}` : (isRu ? "Открытый заказ" : "Open task");
            return (
              <article key={deal.id} className="space-y-4 rounded-xl border border-border bg-card p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-xs text-muted-foreground">#{deal.id} · {isSender ? copy.sender : copy.receiver}</span>
                  <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${statusColor(deal.status)}`}>{copy.status[deal.status] ?? deal.status}</span>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">{deal.description}</p>
                  <span className="shrink-0 rounded-lg bg-primary/10 px-2.5 py-1.5 font-mono text-sm font-semibold text-primary"><CircleDollarSign className="mr-1 inline h-4 w-4" />{deal.amount} Д</span>
                </div>
                <div className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                  <p>{copy.sender}: {sender}</p><p>{copy.receiver}: {receiver}</p>
                </div>
                {deal.totalTrackedMinutes > 0 && <p className="text-xs text-muted-foreground">{isRu ? "Учтено времени" : "Time tracked"}: <span className="font-mono text-foreground">{deal.totalTrackedMinutes} {isRu ? "мин" : "min"}</span></p>}
                {(deal.proofText || deal.proofUrl) && (
                  <div className="rounded-lg border border-border bg-background/60 p-3 text-sm">
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{copy.proofLabel}</p>
                    {deal.proofText && <p className="whitespace-pre-wrap">{deal.proofText}</p>}
                    {deal.proofUrl && <a href={deal.proofUrl} target="_blank" rel="noreferrer" className="mt-1 block break-all text-primary underline">{deal.proofUrl}</a>}
                  </div>
                )}
                {deal.disputeClaimText && <p className="rounded-lg bg-rose-500/10 p-3 text-sm"><strong>{copy.claimLabel}:</strong> {deal.disputeClaimText}</p>}
                {deal.aiVerdict && <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm"><p className="mb-1 font-semibold text-primary">{copy.verdict}</p><p className="whitespace-pre-wrap">{deal.aiVerdict}</p></div>}
                <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                  {canDiscuss && <button type="button" onClick={() => setDiscussionDealId(deal.id)} className={`${buttonClass} border border-primary/40 text-primary`}><MessageCircle className="h-4 w-4" />{isRu ? "Обсуждение" : "Discussion"}</button>}
                  {canAccept && <button type="button" disabled={mutate.isPending} onClick={() => run(`/api/deals/${deal.id}/accept-task`, { citizenId: citizen!.id })} className={`${buttonClass} bg-primary text-primary-foreground`}>{copy.accept}</button>}
                  {canProof && <button type="button" onClick={() => { setProofTarget(deal.id); setProofText(""); setProofUrl(""); }} className={`${buttonClass} bg-primary text-primary-foreground`}><Send className="h-4 w-4" />{copy.sendProof}</button>}
                  {canApprove && <>
                    <button type="button" disabled={mutate.isPending} onClick={() => run(`/api/deals/${deal.id}/complete`, { citizenId: citizen!.id })} className={`${buttonClass} bg-emerald-600 text-white`}><CheckCircle2 className="h-4 w-4" />{copy.approve}</button>
                    <button type="button" disabled={mutate.isPending} onClick={() => run(`/api/deals/${deal.id}/decline`, { citizenId: citizen!.id })} className={`${buttonClass} bg-rose-600 text-white`}>{copy.decline}</button>
                  </>}
                  {canDispute && <button type="button" onClick={() => { setDisputeTarget(deal.id); setClaimText(""); }} className={`${buttonClass} bg-amber-600 text-white`}><AlertTriangle className="h-4 w-4" />{copy.dispute}</button>}
                  {canCancel && <button type="button" disabled={mutate.isPending} onClick={() => { if (window.confirm(copy.confirmCancel)) run(`/api/deals/${deal.id}/cancel`, { citizenId: citizen!.id }); }} className={`${buttonClass} border border-border text-muted-foreground hover:text-destructive`}><X className="h-4 w-4" />{copy.cancelDeal}</button>}
                </div>
              </article>
            );
          })}
        </div>
      }

      {showCreate && (
        <div role="dialog" aria-modal="true" aria-labelledby="escrow-create-title" className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-black/70 p-4">
          <form onSubmit={event => void createDeal(event)} className="my-auto max-h-[90vh] w-full max-w-2xl space-y-4 overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-2xl sm:p-7">
            <header className="flex items-center justify-between gap-3">
              <div><h2 id="escrow-create-title" className="text-xl font-semibold">{copy.create}</h2><p className="mt-1 text-sm text-muted-foreground">{isRu ? "После создания минуты будут зарезервированы до решения по сделке." : "Minutes will be reserved until the deal is resolved."}</p></div>
              <button type="button" onClick={() => setShowCreate(false)} aria-label={copy.cancel} className="rounded-lg p-2 text-muted-foreground hover:bg-secondary"><X className="h-5 w-5" /></button>
            </header>
            <label className="block space-y-1.5 text-sm font-medium">{copy.task}
              <textarea required minLength={5} maxLength={1000} rows={4} value={description} onChange={event => { setDescription(event.target.value); setAudit(null); }} className={inputClass} />
            </label>
            <label className="block space-y-1.5 text-sm font-medium">{copy.executor}
              <select required value={receiverId} onChange={event => { setReceiverId(event.target.value); setAudit(null); }} className={inputClass}>
                <option value="">{isRu ? "Выберите гражданина" : "Select a citizen"}</option>
                {people.filter(person => person.id !== citizen?.id).map(person => <option key={person.id} value={person.id}>{person.name} · #{person.id}</option>)}
              </select>
            </label>
            <button type="button" disabled={auditMutation.isPending || !description.trim() || !receiverId} onClick={() => auditMutation.mutate()} className={`${buttonClass} border border-primary/40 text-primary`}>
              {auditMutation.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}{copy.audit}
            </button>
            {audit && <div className="space-y-2 rounded-xl border border-primary/25 bg-primary/5 p-4">
              <h3 className="font-semibold text-primary">{copy.auditSummary}</h3>
              <p className="text-sm leading-relaxed">{audit.summary}</p>
              {audit.breakdown?.length > 0 && <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">{audit.breakdown.map((line, index) => <li key={index}>{line}</li>)}</ul>}
            </div>}
            <label className="block space-y-1.5 text-sm font-medium">{copy.amount}
              <input required type="number" min="1" max="10000" step="1" value={amount} onChange={event => setAmount(event.target.value)} className={inputClass} />
            </label>
            {failure && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{failure}</p>}
            <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
              <button type="button" onClick={() => setShowCreate(false)} className={`${buttonClass} border border-border`}>{copy.cancel}</button>
              <button type="submit" disabled={mutate.isPending || !audit} className={`${buttonClass} bg-primary text-primary-foreground`}><LockKeyhole className="h-4 w-4" />{mutate.isPending ? (isRu ? "Создаём…" : "Creating…") : copy.createAction}</button>
            </div>
          </form>
        </div>
      )}

      {proofTarget !== null && <div role="dialog" aria-modal="true" className="fixed inset-0 z-[100] grid place-items-center bg-black/70 p-4">
        <form onSubmit={event => { event.preventDefault(); run(`/api/deals/${proofTarget}/proof`, { receiverId: citizen!.id, proofText: proofText.trim() || undefined, proofUrl: proofUrl.trim() || undefined }, () => setProofTarget(null)); }} className="w-full max-w-lg space-y-4 rounded-2xl border border-border bg-card p-5 sm:p-6">
          <h2 className="text-lg font-semibold">{copy.sendProof}</h2>
          <label className="block space-y-1.5 text-sm">{copy.proof}<textarea value={proofText} onChange={event => setProofText(event.target.value)} minLength={5} maxLength={2000} rows={4} className={inputClass} /></label>
          <label className="block space-y-1.5 text-sm">{copy.proofUrl}<input type="url" value={proofUrl} onChange={event => setProofUrl(event.target.value)} className={inputClass} /></label>
          {failure && <p role="alert" className="text-sm text-destructive">{failure}</p>}
          <div className="flex justify-end gap-2"><button type="button" onClick={() => setProofTarget(null)} className={`${buttonClass} border border-border`}>{copy.cancel}</button><button type="submit" disabled={mutate.isPending || (!proofText.trim() && !proofUrl.trim())} className={`${buttonClass} bg-primary text-primary-foreground`}>{copy.submit}</button></div>
        </form>
      </div>}

      {disputeTarget !== null && <div role="dialog" aria-modal="true" className="fixed inset-0 z-[100] grid place-items-center bg-black/70 p-4">
        <form onSubmit={event => { event.preventDefault(); run(`/api/deals/${disputeTarget}/dispute`, { citizenId: citizen!.id, claimText: claimText.trim() }, () => setDisputeTarget(null)); }} className="w-full max-w-lg space-y-4 rounded-2xl border border-border bg-card p-5 sm:p-6">
          <h2 className="text-lg font-semibold">{copy.dispute}</h2>
          <label className="block space-y-1.5 text-sm">{copy.claim}<textarea required minLength={10} maxLength={2000} value={claimText} onChange={event => setClaimText(event.target.value)} rows={5} className={inputClass} /></label>
          {failure && <p role="alert" className="text-sm text-destructive">{failure}</p>}
          <div className="flex justify-end gap-2"><button type="button" onClick={() => setDisputeTarget(null)} className={`${buttonClass} border border-border`}>{copy.cancel}</button><button type="submit" disabled={mutate.isPending || claimText.trim().length < 10} className={`${buttonClass} bg-amber-600 text-white`}>{copy.submit}</button></div>
        </form>
      </div>}
      {discussionDealId !== null && (() => {
        const deal = deals.find(item => item.id === discussionDealId);
        return deal ? <TiMETREscrowDiscussion deal={deal} citizenId={citizen!.id} authHeaders={authHeaders} isRu={isRu} onClose={() => setDiscussionDealId(null)} /> : null;
      })()}
    </section>
  );
}
