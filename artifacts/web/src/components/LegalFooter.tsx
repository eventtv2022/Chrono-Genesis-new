import { Link } from "wouter";

export function LegalFooter({ lang = "en" }: { lang?: "ru" | "en" }) {
  const ru = lang === "ru";
  return (
    <footer className="mt-10 border-t border-border px-4 py-6 text-xs text-muted-foreground sm:px-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <nav aria-label={ru ? "Юридическая информация" : "Legal information"} className="flex flex-wrap gap-x-5 gap-y-2">
          <Link href="/terms" className="hover:text-foreground">{ru ? "Условия использования" : "Terms"}</Link>
          <Link href="/privacy" className="hover:text-foreground">{ru ? "Конфиденциальность" : "Privacy"}</Link>
          <Link href="/refund" className="hover:text-foreground">{ru ? "Возврат средств" : "Refunds"}</Link>
          <a href="mailto:support@timenation.info" className="hover:text-foreground">support@timenation.info</a>
        </nav>
        <span>© {new Date().getFullYear()} TimeNation</span>
      </div>
    </footer>
  );
}
