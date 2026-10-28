import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle, MessageCircle, Pause, Play, Send, Timer, X } from "lucide-react";
import type { Deal } from "./TiMETREscrow";

type ChatMessage = {
  id: number;
  senderId: number;
  senderName: string | null;
  messageText: string | null;
  imageUrl: string | null;
  createdAt: string;
};

type Props = {
  deal: Deal;
  citizenId: number;
  authHeaders: Record<string, string>;
  isRu: boolean;
  onClose: () => void;
};

function formatElapsed(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map(value => String(value).padStart(2, "0")).join(":");
}

export function TiMETREscrowDiscussion({ deal, citizenId, authHeaders, isRu, onClose }: Props) {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const [now, setNow] = useState(Date.now());
  const isReceiver = deal.receiverId === citizenId;
  const timerCanRun = isReceiver && deal.status === "accepted";
  const startedAt = deal.timerStartedAt ? new Date(deal.timerStartedAt).getTime() : 0;
  const trackedSeconds = (deal.totalTrackedMinutes ?? 0) * 60
    + (deal.timerStatus === "running" && startedAt ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const chatKey = ["timetR-deal-chat", deal.id] as const;
  const { data: messages = [], isPending, isError } = useQuery<ChatMessage[]>({
    queryKey: chatKey,
    queryFn: async () => {
      const response = await fetch(`/api/deals/${deal.id}/chat`, { headers: authHeaders });
      const body = await response.json() as { messages?: ChatMessage[]; error?: string };
      if (!response.ok) throw new Error(body.error ?? "Could not load messages.");
      return body.messages ?? [];
    },
    refetchInterval: 5_000,
  });

  const sendMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/deals/${deal.id}/chat`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ senderId: citizenId, messageText: message.trim() }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? (isRu ? "Не удалось отправить сообщение." : "Message could not be sent."));
    },
    onSuccess: async () => {
      setMessage("");
      await queryClient.invalidateQueries({ queryKey: chatKey });
    },
  });

  const timerMutation = useMutation({
    mutationFn: async (action: "start" | "pause" | "complete") => {
      const response = await fetch(`/api/deals/${deal.id}/timer/${action}`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ citizenId }),
      });
      const body = await response.json() as { deal?: Deal; error?: string };
      if (!response.ok) throw new Error(body.error ?? (isRu ? "Ошибка рабочего таймера." : "Work timer error."));
      return body.deal ?? body as Deal;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["timetR-escrow-deals"] });
    },
  });

  const copy = isRu ? {
    title: `Обсуждение сделки #${deal.id}`, send: "Отправить", placeholder: "Сообщение…",
    noMessages: "Начните обсуждение сделки.", loading: "Загружаем сообщения…",
    timer: "Рабочее время", run: "Работаю", pause: "На паузе", done: "Работа сдана",
    start: "Начать", stop: "Пауза", finish: "Завершить", error: "Не удалось выполнить действие.",
  } : {
    title: `Deal #${deal.id} discussion`, send: "Send", placeholder: "Message…",
    noMessages: "Start the deal discussion.", loading: "Loading messages…",
    timer: "Work time", run: "Working", pause: "Paused", done: "Work submitted",
    start: "Start", stop: "Pause", finish: "Finish", error: "Could not complete the action.",
  };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="escrow-discussion-title" className="fixed inset-0 z-[110] grid place-items-center bg-black/70 p-3 sm:p-6">
      <section className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-border p-4 sm:p-5">
          <div className="min-w-0">
            <h2 id="escrow-discussion-title" className="font-semibold">{copy.title}</h2>
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{deal.description}</p>
          </div>
          <button type="button" aria-label={isRu ? "Закрыть" : "Close"} onClick={onClose} className="rounded-lg p-2 text-muted-foreground hover:bg-secondary"><X className="h-5 w-5" /></button>
        </header>

        {timerCanRun && <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border bg-background/50 px-4 py-3 sm:px-5">
          <div className="flex items-center gap-3">
            <Timer className="h-5 w-5 text-primary" />
            <div>
              <p className="font-mono text-lg tabular-nums">{formatElapsed(trackedSeconds)}</p>
              <p className="text-xs text-muted-foreground">{copy.timer} · {deal.timerStatus === "completed" ? copy.done : deal.timerStatus === "running" ? copy.run : copy.pause}</p>
            </div>
          </div>
          {deal.timerStatus === "completed" ? <span className="text-sm text-primary">{copy.done}</span>
            : <div className="flex flex-wrap gap-2">
              <button type="button" disabled={timerMutation.isPending} onClick={() => timerMutation.mutate(deal.timerStatus === "running" ? "pause" : "start")} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-secondary disabled:opacity-50">
                {timerMutation.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : deal.timerStatus === "running" ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                {deal.timerStatus === "running" ? copy.stop : copy.start}
              </button>
              {(deal.totalTrackedMinutes > 0 || deal.timerStatus === "running") && <button type="button" disabled={timerMutation.isPending} onClick={() => timerMutation.mutate("complete")} className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">{copy.finish}</button>}
            </div>}
        </div>}

        {(sendMutation.error || timerMutation.error) && <p role="alert" className="border-b border-destructive/20 bg-destructive/10 px-4 py-2 text-sm text-destructive">{(sendMutation.error ?? timerMutation.error)?.message ?? copy.error}</p>}

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 sm:p-5">
          {isPending ? <p className="py-8 text-center text-sm text-muted-foreground">{copy.loading}</p>
            : isError ? <p role="alert" className="py-8 text-center text-sm text-destructive">{copy.error}</p>
            : messages.length === 0 ? <div className="py-12 text-center text-sm text-muted-foreground"><MessageCircle className="mx-auto mb-3 h-8 w-8 opacity-60" />{copy.noMessages}</div>
            : messages.map(item => {
              const mine = item.senderId === citizenId;
              return <div key={item.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 ${mine ? "bg-primary text-primary-foreground" : "bg-background"}`}>
                  <p className={`mb-1 text-[11px] font-semibold ${mine ? "text-primary-foreground/75" : "text-primary"}`}>{mine ? (isRu ? "Вы" : "You") : item.senderName ?? (isRu ? "Участник" : "Participant")}</p>
                  {item.messageText && <p className="whitespace-pre-wrap break-words text-sm">{item.messageText}</p>}
                  {item.imageUrl && <a href={item.imageUrl} target="_blank" rel="noreferrer" className="text-sm underline">{isRu ? "Открыть вложение" : "Open attachment"}</a>}
                  <time className={`mt-1 block text-right text-[10px] ${mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>{new Date(item.createdAt).toLocaleTimeString(isRu ? "ru-RU" : "en-GB", { hour: "2-digit", minute: "2-digit" })}</time>
                </div>
              </div>;
            })}
        </div>

        <form onSubmit={event => { event.preventDefault(); if (message.trim()) sendMutation.mutate(); }} className="flex items-center gap-2 border-t border-border p-3 sm:p-4">
          <input value={message} onChange={event => setMessage(event.target.value)} maxLength={2000} placeholder={copy.placeholder} className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary" />
          <button type="submit" disabled={sendMutation.isPending || !message.trim()} aria-label={copy.send} className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">
            {sendMutation.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}<span className="hidden sm:inline">{copy.send}</span>
          </button>
        </form>
      </section>
    </div>
  );
}
