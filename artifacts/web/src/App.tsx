import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { CitizenProvider, useCitizen } from "./context/CitizenContext";
import { LanguageProvider } from "./context/LanguageContext";
import { useEffect, useRef } from "react";

// ── Detect whether app is running inside Telegram Mini App ───────────────────
function isTelegramWebApp(): boolean {
  try {
    const tg = (window as unknown as { Telegram?: { WebApp?: { initData?: string } } }).Telegram;
    return !!tg?.WebApp?.initData;
  } catch {
    return false;
  }
}
const IS_TELEGRAM = isTelegramWebApp();

// ── sessionStorage key: has the desktop user already passed the landing page? ─
const LANDING_SHOWN_KEY = "tn_landing_shown";

import { Home } from "./pages/Home";
import { Tv } from "./pages/Tv";
import { Citizens } from "./pages/Citizens";
import { Timeline } from "./pages/Timeline";
import { Shop } from "./pages/Shop";
import { Register } from "./pages/Register";
import { PassportLookup } from "./pages/PassportLookup";
import { LaborDashboard } from "./pages/LaborDashboard";
import { Time } from "./pages/Time";
import { Clock } from "./pages/Clock";
import { ResetPassword } from "./pages/ResetPassword";
import { Admin } from "./pages/Admin";
import { AdminRegistry } from "./pages/AdminRegistry";
import { GovBlockVotes } from "./pages/GovBlockVotes";
import { QrLogin } from "./pages/QrLogin";
import { Privacy } from "./pages/Privacy";
import { Welcome } from "./pages/Welcome";
import { Tos } from "./pages/Tos";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

// ── Telegram auto-login redirect guard ───────────────────────────────────────
// Desktop:  on first visit to "/" show the landing page (/welcome); afterwards
//           let the user navigate freely — sessionStorage prevents re-redirect.
// Telegram: auto-login flow — splash while validating, then redirect based on
//           emission status.
function TgGuard({ children }: { children: React.ReactNode }) {
  const { twaStatus, twaLoading } = useCitizen();
  const [location, navigate] = useLocation();
  // Guard fires only once per mount
  const desktopRedirectDone = useRef(false);

  useEffect(() => {
    // ── DESKTOP branch ────────────────────────────────────────────────────────
    if (!IS_TELEGRAM) {
      if (desktopRedirectDone.current) return;
      desktopRedirectDone.current = true;

      // Only intercept the root path; all other paths open as-is
      if (location === "/") {
        const alreadyShown = sessionStorage.getItem(LANDING_SHOWN_KEY);
        if (!alreadyShown) {
          sessionStorage.setItem(LANDING_SHOWN_KEY, "1");
          navigate("/welcome");
        }
      }
      return;
    }

    // ── TELEGRAM Mini App branch ──────────────────────────────────────────────
    if (twaLoading || twaStatus === null) return;

    if (twaStatus === "IN_EMISSION" || twaStatus === "APPLICATION_REJECTED") {
      if (location !== "/register") navigate("/register");
    } else if (twaStatus === "ACTIVE") {
      // Skip the landing page — go straight to dashboard
      if (location === "/welcome" || location === "/") navigate("/");
    }
  }, [twaStatus, twaLoading, location]); // eslint-disable-line react-hooks/exhaustive-deps

  // Splash screen — only shown inside Telegram while initData is being validated
  if (IS_TELEGRAM && twaLoading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "linear-gradient(180deg, #0f0f1a 0%, #12102a 100%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 20,
          fontFamily: "'Space Grotesk', sans-serif",
          color: "#e8e8f4",
        }}
      >
        <div style={{ fontSize: 48, lineHeight: 1 }}>🏛️</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: "#c9a84c", letterSpacing: "0.04em" }}>
          TimeNation
        </div>
        <div style={{ fontSize: 11, color: "#8080a0", textTransform: "uppercase", letterSpacing: "0.12em" }}>
          Цифровое государство
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          {[0, 1, 2].map(i => (
            <div
              key={i}
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "#c9a84c",
                opacity: 0.3,
                animation: `pulse 1.2s ease-in-out ${i * 0.4}s infinite`,
              }}
            />
          ))}
        </div>
        <style>{`
          @keyframes pulse {
            0%, 100% { opacity: 0.2; transform: scale(0.8); }
            50%       { opacity: 1;   transform: scale(1.1); }
          }
        `}</style>
      </div>
    );
  }

  return <>{children}</>;
}

function Router() {
  return (
    <TgGuard>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/tv" component={Tv} />
        <Route path="/citizens" component={Citizens} />
        <Route path="/timeline" component={Timeline} />
        <Route path="/shop" component={Shop} />
        <Route path="/register" component={Register} />
        <Route path="/passport-lookup" component={PassportLookup} />
        <Route path="/time" component={Time} />
        <Route path="/clock" component={Clock} />
        <Route path="/government/labor-dashboard" component={LaborDashboard} />
        <Route path="/reset-password" component={ResetPassword} />
        <Route path="/admin" component={Admin} />
        <Route path="/admin/registry" component={AdminRegistry} />
        <Route path="/gov/block-votes" component={GovBlockVotes} />
        <Route path="/qr-login" component={QrLogin} />
        <Route path="/privacy" component={Privacy} />
        <Route path="/tos" component={Tos} />
        <Route path="/welcome" component={Welcome} />
        <Route component={NotFound} />
      </Switch>
    </TgGuard>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <CitizenProvider>
          <TooltipProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <Router />
            </WouterRouter>
            <Toaster />
          </TooltipProvider>
        </CitizenProvider>
      </LanguageProvider>
    </QueryClientProvider>
  );
}

export default App;
