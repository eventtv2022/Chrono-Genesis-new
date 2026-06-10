import { Link, useLocation } from "wouter";
import { Activity, Tv, Users, History, ShoppingCart, UserPlus } from "lucide-react";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  const navItems = [
    { href: "/", label: "Дашборд", icon: Activity },
    { href: "/tv", label: "TimeNation-TV", icon: Tv },
    { href: "/citizens", label: "Реестр", icon: Users },
    { href: "/timeline", label: "Таймлайн", icon: History },
    { href: "/shop", label: "Казначейство", icon: ShoppingCart },
    { href: "/register", label: "Стать гражданином", icon: UserPlus },
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
        <div className="p-4 border-t border-border mt-auto">
          <div className="text-[10px] font-mono text-muted-foreground flex justify-between items-center">
            <span>SYS: ONLINE</span>
            <span className="text-primary font-bold">OK</span>
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
