import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Activity, Tv, Users, History, ShoppingCart, UserPlus, LogOut, RefreshCw, Search, Clock, Globe, Eye, EyeOff, Menu, X, ShieldCheck } from "lucide-react";
import { SystemClock } from "./SystemClock";
import { useCitizen } from "@/context/CitizenContext";
import { useLanguage } from "@/context/LanguageContext";

function CitizenWidget() {
  const { citizen, setCitizen, setAuthToken, refreshCitizen } = useCitizen();
  const { t, lang, setLang } = useLanguage();
  const loginLang: "ru" | "en" = lang === "ru" ? "ru" : "en";
  const [input, setInput] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isPhone = input.trim().length > 0 && !/^\d+$/.test(input.trim());

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    const val = input.trim();
    if (!val) return;
    setLoading(true);
    setError(null);
    try {
      const byId = /^\d+$/.test(val);
      if (byId) {
        // Числовой ID — публичный поиск без пароля
        const res = await fetch(`/api/citizens/${val}`);
        if (!res.ok) { setError(t.citizen_not_found); setLoading(false); return; }
        const data = await res.json() as Record<string, unknown>;
        if (!data?.["id"]) { setError(t.citizen_not_found); setLoading(false); return; }
        setCitizen(data as unknown as Parameters<typeof setCitizen>[0]);
        setInput(""); setPassword("");
      } else {
        // Номер телефона — авторизация через auth/login (возвращает authToken)
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone: val, ...(password ? { password } : {}) }),
        });
        const data = await res.json() as Record<string, unknown>;
        if (!res.ok) { setError((data["error"] as string) ?? t.citizen_not_found); setLoading(false); return; }
        if (!data?.["id"]) { setError(t.citizen_not_found); setLoading(false); return; }
        setCitizen(data as unknown as Parameters<typeof setCitizen>[0]);
        const tok = data["authToken"] as string | undefined;
        if (tok) setAuthToken(tok);
        setInput(""); setPassword("");
      }
    } catch {
      setError(t.connection_error);
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
              title={t.refresh}
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={() => setCitizen(null)}
              className="flex items-center gap-1 px-2 py-1 rounded bg-destructive/10 hover:bg-destructive/20 text-destructive text-[11px] font-mono font-semibold transition-colors border border-destructive/20"
              title={t.logout_btn}
            >
              <LogOut className="w-3 h-3" />
              {t.logout_btn}
            </button>
          </div>
        </div>
        <div className="text-[9px] text-muted-foreground font-mono truncate">{citizen.rank}</div>
      </div>
    );
  }

  return (
    <div className="px-3 py-3 border-t border-border">
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider">{t.login_title}</p>
        <div className="flex items-center gap-0.5 text-[10px] font-mono">
          <button
            type="button"
            onClick={() => setLang("ru")}
            className={`px-1.5 py-0.5 rounded transition-colors ${loginLang === "ru" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >RU</button>
          <span className="text-muted-foreground/40">|</span>
          <button
            type="button"
            onClick={() => setLang("en")}
            className={`px-1.5 py-0.5 rounded transition-colors ${loginLang === "en" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >EN</button>
        </div>
      </div>
      <form onSubmit={(e) => void handleLogin(e)} className="space-y-1.5">
        <input
          value={input}
          onChange={e => { setInput(e.target.value); setError(null); }}
          placeholder={t.login_placeholder}
          autoComplete="username"
          className="w-full bg-background border border-border rounded-sm px-2 py-1 text-xs font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/60"
        />
        {isPhone && (
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={e => { setPassword(e.target.value); setError(null); }}
              placeholder={t.login_password}
              autoComplete="current-password"
              className="w-full bg-background border border-border rounded-sm px-2 py-1 pr-6 text-xs font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/60"
            />
            <button
              type="button"
              onClick={() => setShowPassword(v => !v)}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              tabIndex={-1}
            >
              {showPassword ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            </button>
          </div>
        )}
        {error && <p className="text-[10px] text-destructive font-mono">{error}</p>}
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="w-full bg-primary/90 hover:bg-primary text-primary-foreground rounded-sm py-1 text-xs font-mono transition-colors disabled:opacity-50"
        >
          {loading ? "…" : t.login_btn}
        </button>
      </form>
    </div>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { t } = useLanguage();
  const { citizen } = useCitizen();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const navItems = [
    { href: "/",          label: t.nav_dashboard,       icon: Activity  },
    { href: "/tv",        label: t.nav_tv,              icon: Tv        },
    { href: "/citizens",  label: t.nav_registry,        icon: Users     },
    { href: "/timeline",  label: t.nav_timeline,        icon: History   },
    { href: "/shop",      label: t.nav_treasury,        icon: ShoppingCart },
    { href: "/register",  label: t.nav_become_citizen,  icon: UserPlus  },
    { href: "/passport-lookup", label: t.nav_passport,  icon: Search    },
    { href: "/time",      label: t.nav_time,            icon: Clock     },
    { href: "/clock",     label: t.nav_clock,           icon: Globe     },
    ...(citizen && (citizen as { isAdmin?: number }).isAdmin === 1
      ? [{ href: "/admin", label: "Администратор", icon: ShieldCheck }]
      : []),
  ];

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden dark text-foreground font-sans">

      {/* ── Mobile backdrop ──────────────────────────────────────────────────── */}
      {sidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 z-30 bg-black/50 backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Hamburger button (mobile only) ───────────────────────────────────── */}
      <button
        className="lg:hidden fixed top-3 left-3 z-50 p-2 rounded-md bg-card border border-border text-foreground shadow-md transition-colors hover:bg-secondary"
        onClick={() => setSidebarOpen(v => !v)}
        aria-label="Toggle menu"
      >
        {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      {/* ── Sidebar ──────────────────────────────────────────────────────────── */}
      <aside
        className={`
          fixed lg:static inset-y-0 left-0 z-40
          w-60 border-r border-border bg-card
          flex flex-col h-full shrink-0
          transition-transform duration-300 ease-in-out
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
          lg:translate-x-0
        `}
      >
        <div className="p-5 border-b border-border">
          <div className="flex items-center gap-3">
            <img
              src={`${import.meta.env.BASE_URL}logo.jpg`}
              alt="TimeNation"
              className="w-8 h-8 rounded-sm object-cover shrink-0"
            />
            <div>
              <h1 className="font-bold text-base tracking-tight leading-none">TimeNation</h1>
              <p className="text-[9px] text-muted-foreground uppercase tracking-widest font-mono mt-1">
                {t.digital_state}
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
                onClick={() => setSidebarOpen(false)}
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

      {/* ── Main Content ─────────────────────────────────────────────────────── */}
      <main className="flex-1 h-full overflow-y-auto relative">
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.015]"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E\")",
          }}
        />
        <div className="pl-14 pr-4 pt-4 pb-4 lg:p-8 max-w-7xl mx-auto min-h-full">
          {children}
        </div>
      </main>
    </div>
  );
}
