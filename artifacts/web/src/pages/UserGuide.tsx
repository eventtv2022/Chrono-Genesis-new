import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Bot, LoaderCircle, MessageCircle, Search, Send, X } from "lucide-react";
import guideMarkdown from "../../../mobile/USER_GUIDE_RU.md?raw";
import { Layout } from "@/components/Layout";
import { useCitizen } from "@/context/CitizenContext";
import { useLanguage } from "@/context/LanguageContext";
import { Link } from "wouter";

type ChatMessage = { role: "user" | "assistant"; content: string };

function renderInline(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, index) =>
    part.startsWith("**") && part.endsWith("**")
      ? <strong key={index}>{part.slice(2, -2)}</strong>
      : part,
  );
}

function GuideText({ markdown }: { markdown: string }) {
  return (
    <div className="prose prose-invert max-w-none prose-headings:scroll-mt-6 prose-a:text-primary prose-strong:text-foreground">
      {markdown.split(/\r?\n/).map((rawLine, index) => {
        const line = rawLine.trim();
        if (!line) return <div key={index} className="h-3" />;
        const heading = /^(#{1,4})\s+(.+)$/.exec(line);
        if (heading) {
          const level = heading[1].length;
          const title = heading[2];
          if (level === 1) return <h1 key={index}>{renderInline(title)}</h1>;
          if (level === 2) return <h2 key={index}>{renderInline(title)}</h2>;
          if (level === 3) return <h3 key={index}>{renderInline(title)}</h3>;
          return <h4 key={index}>{renderInline(title)}</h4>;
        }
        const ordered = /^\d+\.\s+(.+)$/.exec(line);
        if (ordered) return <p key={index} className="my-1 pl-4">{renderInline(line)}</p>;
        const bullet = /^[-*]\s+(.+)$/.exec(line);
        if (bullet) return <p key={index} className="my-1 pl-4 before:mr-2 before:content-['•']">{renderInline(bullet[1])}</p>;
        return <p key={index}>{renderInline(line)}</p>;
      })}
    </div>
  );
}

function AssistantPanel({ onClose }: { onClose: () => void }) {
  const { lang } = useLanguage();
  const { authToken } = useCitizen();
  const isRu = lang === "ru";
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading]);

  async function sendMessage(event: React.FormEvent) {
    event.preventDefault();
    const question = draft.trim();
    if (!question || loading || !authToken) return;
    const nextMessages = [...messages, { role: "user" as const, content: question }];
    setMessages(nextMessages);
    setDraft("");
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/guide/assistant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ messages: nextMessages.slice(-8) }),
      });
      const result = await response.json() as { answer?: string; error?: string };
      if (!response.ok) throw new Error(result.error || (isRu ? "Не удалось получить ответ." : "Could not get an answer."));
      if (!result.answer) throw new Error(isRu ? "Сервер не вернул ответ." : "The server returned no answer.");
      setMessages([...nextMessages, { role: "assistant", content: result.answer }]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (isRu ? "Проверьте соединение и попробуйте ещё раз." : "Check your connection and try again."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="flex min-h-[460px] flex-col overflow-hidden rounded-xl border border-border bg-card lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)]" aria-label={isRu ? "Чат с техническим специалистом" : "Technical support chat"}>
      <header className="flex items-center gap-3 border-b border-border p-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/15 text-primary"><Bot className="h-5 w-5" /></div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold">{isRu ? "ЗаБОТливый технический специалист" : "TimeNation technical specialist"}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{isRu ? "Отвечает по руководству пользователя" : "Answers based on the user guide"}</p>
        </div>
        <button type="button" onClick={onClose} className="rounded-md p-2 text-muted-foreground hover:bg-secondary hover:text-foreground" aria-label={isRu ? "Закрыть чат" : "Close chat"}><X className="h-4 w-4" /></button>
      </header>
      {!authToken ? (
        <div className="m-auto max-w-xs p-6 text-center">
          <p className="text-sm text-muted-foreground">{isRu ? "Чтобы задать вопрос помощнику, войдите в аккаунт гражданина." : "Sign in to your citizen account to ask the assistant a question."}</p>
          <Link href="/login?returnTo=%2Fguide" className="mt-4 inline-flex rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">{isRu ? "Войти" : "Sign in"}</Link>
        </div>
      ) : (
        <>
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.length === 0 && (
              <div className="rounded-lg border border-border bg-background p-4">
                <p className="text-sm font-semibold">{isRu ? "Помогу разобраться в TimeNation" : "How can I help with TimeNation?"}</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{isRu ? "Спросите, как пользоваться разделом или функцией. Ответы основаны на руководстве." : "Ask how to use a section or feature. Answers are based on the guide."}</p>
                <p className="mt-3 text-sm text-primary">{isRu ? "Например: «Как распределить задачи по Матрице времени?»" : "For example: “How do I use the Time Matrix?”"}</p>
              </div>
            )}
            {messages.map((message, index) => (
              <div key={`${message.role}-${index}`} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[90%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-6 ${message.role === "user" ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm border border-border bg-background text-foreground"}`}>
                  {message.content}
                </div>
              </div>
            ))}
            {loading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="h-4 w-4 animate-spin" />{isRu ? "Готовлю ответ…" : "Preparing an answer…"}</div>}
            <div ref={bottomRef} />
          </div>
          {error && <p role="alert" className="px-4 pb-2 text-sm text-destructive">{error}</p>}
          <form onSubmit={(event) => void sendMessage(event)} className="flex items-end gap-2 border-t border-border p-3">
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder={isRu ? "Задайте вопрос о TimeNation" : "Ask about TimeNation"}
              aria-label={isRu ? "Ваш вопрос" : "Your question"}
              maxLength={1200}
              rows={2}
              className="min-h-11 max-h-32 flex-1 resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <button type="submit" disabled={!draft.trim() || loading} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40" aria-label={isRu ? "Отправить вопрос" : "Send question"}>
              <Send className="h-4 w-4" />
            </button>
          </form>
        </>
      )}
    </section>
  );
}

export function UserGuide() {
  const { lang } = useLanguage();
  const isRu = lang === "ru";
  const [search, setSearch] = useState("");
  const [assistantOpen, setAssistantOpen] = useState(false);
  const visibleMarkdown = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    if (!term) return guideMarkdown;
    const lines = guideMarkdown.split(/\r?\n/);
    const matches: string[] = [];
    let headings: Array<{ level: number; line: string }> = [];
    let previousHeading = "";
    for (const line of lines) {
      const heading = /^(#{1,4})\s+/.exec(line.trim());
      if (heading) {
        const level = heading[1].length;
        headings = headings.filter((item) => item.level < level);
        headings.push({ level, line: line.trim() });
        previousHeading = "";
      }
      if (!line.toLocaleLowerCase().includes(term)) continue;
      const chain = headings.map((item) => item.line).join("\n");
      if (chain && chain !== previousHeading) {
        matches.push(chain);
        previousHeading = chain;
      }
      matches.push(line);
    }
    return matches.length ? matches.join("\n\n") : "";
  }, [search]);

  return (
    <Layout>
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-primary">TIMENATION</p>
            <h1 className="text-3xl font-bold tracking-tight">{isRu ? "Руководство пользователя" : "User guide"}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{isRu ? "Инструкция по разделам и возможностям TimeNation." : "A guide to TimeNation sections and features."}</p>
          </div>
          <button type="button" onClick={() => setAssistantOpen((open) => !open)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
            <MessageCircle className="h-4 w-4" />{assistantOpen ? (isRu ? "Скрыть помощника" : "Hide assistant") : (isRu ? "Спросить помощника" : "Ask the assistant")}
          </button>
        </div>

        {!isRu && <p className="mb-5 rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">Полная версия руководства пока доступна на русском языке.</p>}
        <div className={`grid items-start gap-6 ${assistantOpen ? "lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]" : ""}`}>
          <section className="min-w-0 rounded-xl border border-border bg-card p-5 sm:p-7">
            <label className="mb-6 flex min-h-11 items-center gap-3 rounded-lg border border-border bg-background px-3">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={isRu ? "Поиск по ключевому слову" : "Search by keyword"} aria-label={isRu ? "Поиск по руководству" : "Search the guide"} className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground" />
              {search && <button type="button" onClick={() => setSearch("")} className="rounded p-1 text-muted-foreground hover:text-foreground" aria-label={isRu ? "Очистить поиск" : "Clear search"}><X className="h-4 w-4" /></button>}
            </label>
            {search && !visibleMarkdown && <p className="py-8 text-center text-sm text-muted-foreground">{isRu ? "По этому слову ничего не найдено." : "No matches found."}</p>}
            {!!visibleMarkdown && <GuideText markdown={visibleMarkdown} />}
          </section>
          {assistantOpen && <AssistantPanel onClose={() => setAssistantOpen(false)} />}
        </div>
      </div>
    </Layout>
  );
}
