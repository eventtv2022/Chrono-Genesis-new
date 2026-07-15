import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Activity, Tv, Users, History, ShoppingCart, UserPlus, LogOut, RefreshCw, Search, Clock, Globe } from "lucide-react";
import { SystemClock } from "./SystemClock";
import { useCitizen } from "@/context/CitizenContext";

function CitizenWidget() {
  const { citizen, setCitizen, refreshCitizen } = useCitizen();
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    const val = input.trim();
    if (!val) return;
    setLoading(true);
    setError(null);
    try {
      const byId = /^\d+$/.test(val);
      const url = byId
        ? `/api/citizens/${val}`
        : `/api/citizens/by-phone/${encodeURIComponent(val)}`;
      const res = await fetch(url);
      if (!res.ok) { setError("Гражданин не найден"); setLoading(false); return; }
      const citizenData = await res.json() as Record<string, unknown>;
      if (!citizenData || !citizenData["id"]) { setError("Гражданин не найден"); setLoading(false); return; }
      setCitizen(citizenData as unknown as Parameters<typeof setCitizen>[0]);
      setInput("");
    } catch {
      setError("Ошибка соединения");
    }
    setLoading(false);
  }

  if (citizen) {
    return (
      <div className="px-3 py-3 border-t border-border space-y-2">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-xs font-bold text-foreground truncate">{citizen.name}</p>
            <p className="text-[10px] text-primary font-mono">{(citizen.balanceMinutes as number).toFixed(2)} Д · #{citizen.id}</p>
          </div>
          <div className="flex gap-1 shrink-0">
            <button
              onClick={() => void refreshCitizen()}
              className="text-muted-foreground hover:text-foreground p-1.5 rounded transition-colors"
              title="Обновить данные"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={() => setCitizen(null)}
              className="flex items-center gap-1 px-2 py-1 rounded bg-destructive/10 hover:bg-destructive/20 text-destructive text-[11px] font-mono font-semibold transition-colors border border-destructive/20"
              title="Выйти из аккаунта"
            >
              <LogOut className="w-3 h-3" />
              Выйти
            </button>
          </div>
        </div>
        <div className="text-[9px] text-muted-foreground font-mono truncate">{citizen.rank}</div>
      </div>
    );
  }

  return (
    <div className="px-3 py-3 border-t border-border">
      <p className="text-[10px] text-muted-foreground font-mono mb-1.5 uppercase tracking-wider">Войти</p>
      <form onSubmit={(e) => void handleLogin(e)} className="space-y-1.5">
        <input
          value={input}
          onChange={e => { setInput(e.target.value); setError(null); }}
          placeholder="ID или телефон"
          className="w-full bg-background border border-border rounded-sm px-2 py-1 text-xs font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/60"
        />
        {error && <p className="text-[10px] text-destructive font-mono">{error}</p>}
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="w-full bg-primary/90 hover:bg-primary text-primary-foreground rounded-sm py-1 text-xs font-mono transition-colors disabled:opacity-50"
        >
          {loading ? "…" : "Войти"}
        </button>
      </form>
    </div>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  const navItems = [
    { href: "/", label: "Дашборд", icon: Activity },
    { href: "/tv", label: "TimeNation-TV", icon: Tv },
    { href: "/citizens", label: "Реестр", icon: Users },
    { href: "/timeline", label: "Таймлайн", icon: History },
    { href: "/shop", label: "Казначейство", icon: ShoppingCart },
    { href: "/register", label: "Стать гражданином", icon: UserPlus },
    { href: "/passport-lookup", label: "Мой паспорт", icon: Search },
    { href: "/time", label: "Время", icon: Clock },
    { href: "/clock", label: "Циферблат народов", icon: Globe },
  ];

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden dark text-foreground font-sans">
      {/* Sidebar */}
      <aside className="w-60 border-r border-border bg-card flex flex-col h-full shrink-0">
        <div className="p-5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-primary text-primary-foreground flex items-center justify-center font-bold text-base uppercase tracking-tighter rounded-sm">
              TN
            </div>
            <div>
              <h1 className="font-bold text-base tracking-tight leading-none">TimeNation</h1>
              <p className="text-[9px] text-muted-foreground uppercase tracking-widest font-mono mt-1">
                Цифровое государство
              </p>
            </div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => {
            const active = location === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2 rounded-sm text-sm transition-colors ${
                  active
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
              >
                <item.icon className="w-4 h-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto">
          <SystemClock />
          <CitizenWidget />
          <div className="px-4 pb-3 pt-2">
            <div className="text-[10px] font-mono text-muted-foreground flex justify-between items-center">
              <span>SYS: ONLINE</span>
              <span className="text-primary font-bold">OK</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 h-full overflow-y-auto relative">
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.015]"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E\")",
          }}
        />
        <div className="p-8 max-w-7xl mx-auto min-h-full">
          {children}
        </div>
      </main>
    </div>
  );
}
