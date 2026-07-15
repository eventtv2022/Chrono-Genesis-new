import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { CitizenProvider } from "./context/CitizenContext";
import { LanguageProvider } from "./context/LanguageContext";

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

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

function Router() {
  return (
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
      <Route component={NotFound} />
    </Switch>
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
