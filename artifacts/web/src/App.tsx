import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { getGetStatsQueryKey } from "@workspace/api-client-react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { CitizenProvider, useCitizen } from "./context/CitizenContext";
import { LanguageProvider } from "./context/LanguageContext";
import { useEffect } from "react";

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

import { Home } from "./pages/Home";
import { Tv } from "./pages/Tv";
import { Citizens } from "./pages/Citizens";
import { Timeline } from "./pages/Timeline";
import { Shop } from "./pages/Shop";
import { Register } from "./pages/Register";
import { PassportLookup } from "./pages/PassportLookup";
import { LaborDashboard } from "./pages/LaborDashboard";
import { Time } from "./pages/Time";
import { WatchShop } from "./pages/WatchShop";
import { Clock } from "./pages/Clock";
import { ResetPassword } from "./pages/ResetPassword";
import { Admin } from "./pages/Admin";
import { AdminRegistry } from "./pages/AdminRegistry";
import { SouvenirDarmin } from "./pages/SouvenirDarmin";
import { AdminSouvenirDarmins } from "./pages/AdminSouvenirDarmins";
import { GovBlockVotes } from "./pages/GovBlockVotes";
import { GovPolls } from "./pages/GovPolls";
import { QrLogin } from "./pages/QrLogin";
import { Privacy } from "./pages/Privacy";
import { Welcome } from "./pages/Welcome";
import { Login } from "./pages/Login";
import { OnboardingGame } from "./pages/OnboardingGame";
import { SignatureRequest } from "./pages/SignatureRequest";
import { Referrals } from "./pages/Referrals";
import { Profile } from "./pages/Profile";
import { AnthemPlayer } from "./components/AnthemPlayer";
import { Timenaming } from "./pages/Timenaming";
import { TimeBank } from "./pages/TimeBank";
import { TiMETR } from "./pages/TiMETR";
import { Refund, Terms } from "./pages/LegalPages";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

// ── Telegram auto-login redirect guard ───────────────────────────────────────
// Desktop:  applicants remain in the simulator until their passport is issued.
// Telegram: auto-login flow — splash while validating, then redirect based on
//           application status. New visitors complete the guide before TWA registration.
function TgGuard({ children }: { children: React.ReactNode }) {
  const { citizen, isLoading, twaStatus, twaLoading } = useCitizen();
  const [location, navigate] = useLocation();

  useEffect(() => {
    // ── DESKTOP branch ────────────────────────────────────────────────────────
    if (!IS_TELEGRAM) {
      if (isLoading) return;

      if (location === "/signature-request") return;
      if (["/privacy", "/tos", "/terms", "/refund"].includes(location)) return;

      if (citizen?.registrationStatus === "pending") {
        if (location !== "/onboarding") navigate("/onboarding");
        return;
      }

      if (citizen?.registrationStatus === "rejected") {
        if (location !== "/register") navigate("/register");
        return;
      }

      if (!citizen) {
        const guestRoutes = ["/", "/welcome", "/onboarding", "/register", "/login", "/passport-lookup", "/privacy", "/tos", "/terms", "/refund", "/reset-password", "/qr-login", "/signature-request", "/referrals", "/profile", "/timenaming", "/timebank", "/timetr", "/watch-shop"];
        if (!guestRoutes.includes(location)) navigate("/welcome");
        else if (location === "/") navigate("/welcome");
      }
      return;
    }

    // ── TELEGRAM Mini App branch ──────────────────────────────────────────────
    if (twaLoading) return;

    if (location === "/signature-request") return;
    if (["/privacy", "/tos", "/terms", "/refund"].includes(location)) return;

    if (!citizen) {
      if (location !== "/onboarding") navigate("/onboarding");
      return;
    }

    if (twaStatus === null) return;

    if (citizen.registrationStatus === "pending" || twaStatus === "IN_EMISSION") {
      if (location !== "/onboarding") navigate("/onboarding");
    } else if (citizen.registrationStatus === "rejected" || twaStatus === "APPLICATION_REJECTED") {
      if (location !== "/register") navigate("/register");
    } else if (twaStatus === "ACTIVE") {
      // Skip the landing page — go straight to dashboard
      if (location === "/welcome" || location === "/") navigate("/");
    }
  }, [citizen, isLoading, twaStatus, twaLoading, location]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const [location] = useLocation();
  const { citizen, isLoading } = useCitizen();
  const isGate = location === "/welcome" || (location === "/" && !citizen);

  return (
    <TgGuard>
      <>
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/tv" component={Tv} />
          <Route path="/citizens" component={Citizens} />
          <Route path="/timeline" component={Timeline} />
          <Route path="/timenaming" component={Timenaming} />
          <Route path="/timebank" component={TimeBank} />
          <Route path="/timetr" component={TiMETR} />
          <Route path="/shop" component={Shop} />
          <Route path="/souvenir-darmin" component={SouvenirDarmin} />
          <Route path="/admin/souvenir-darmins" component={AdminSouvenirDarmins} />
          <Route path="/referrals" component={Referrals} />
          <Route path="/profile" component={Profile} />
          <Route path="/register" component={Register} />
          <Route path="/login" component={Login} />
          <Route path="/onboarding" component={OnboardingGame} />
          <Route path="/signature-request" component={SignatureRequest} />
          <Route path="/passport-lookup" component={PassportLookup} />
          <Route path="/time" component={Time} />
          <Route path="/watch-shop" component={WatchShop} />
          <Route path="/clock" component={Clock} />
          <Route path="/government/labor-dashboard" component={LaborDashboard} />
          <Route path="/reset-password" component={ResetPassword} />
          <Route path="/admin" component={Admin} />
          <Route path="/admin/registry" component={AdminRegistry} />
          <Route path="/gov/block-votes" component={GovBlockVotes} />
          <Route path="/gov/polls" component={GovPolls} />
          <Route path="/qr-login" component={QrLogin} />
          <Route path="/privacy" component={Privacy} />
          <Route path="/terms" component={Terms} />
          <Route path="/refund" component={Refund} />
          <Route path="/tos" component={Terms} />
          <Route path="/welcome" component={Welcome} />
          <Route component={NotFound} />
        </Switch>
        <AnthemPlayer active={!isLoading && !isGate} />
      </>
    </TgGuard>
  );
}

const SITE_VISITOR_ID_KEY = "timenation_site_visitor_id";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function SiteVisitorTracker() {
  const queryClient = useQueryClient();

  useEffect(() => {
    try {
      let visitorId = localStorage.getItem(SITE_VISITOR_ID_KEY);
      if (!visitorId || !UUID_PATTERN.test(visitorId)) {
        visitorId = window.crypto.randomUUID();
        localStorage.setItem(SITE_VISITOR_ID_KEY, visitorId);
      }

      void fetch("/api/stats/visitors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visitorId }),
      }).then(response => {
        if (response.ok) {
          void queryClient.invalidateQueries({ queryKey: getGetStatsQueryKey() });
        }
      }).catch(() => {
        // Visitor counting must never prevent the site from loading.
      });
    } catch {
      // Browsers with blocked local storage or crypto are not counted.
    }
  }, [queryClient]);

  return null;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <CitizenProvider>
          <TooltipProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <SiteVisitorTracker />
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
