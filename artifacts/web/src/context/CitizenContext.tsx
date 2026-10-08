import { createContext, useContext, useState, useEffect } from "react";
import { authenticateTelegramWebApp } from "@workspace/api-client-react";
import { ONBOARDING_PROGRESS_TOKEN_KEY } from "../../../../lib/onboarding-questions";

const STORAGE_KEY      = "timenation_citizen";
const AUTH_TOKEN_KEY   = "timenation_auth_token";
const TWA_STATUS_KEY   = "timenation_twa_status";

export type TwaStatus = "ACTIVE" | "IN_EMISSION" | "APPLICATION_REJECTED" | null;

export interface CitizenProfile {
  id: number;
  name: string;
  phone: string;
  balanceMinutes: number;
  totalGiven: number;
  totalReceived: number;
  status: string;
  registrationStatus: string | null;
  availableAt: string | null;
  onboardingCompleted?: boolean;
  meritScore: number;
  rank: string;
  lastActivity: string | null;
  createdAt: string;
  walletAddress: string | null;
  walletVerified: number;
  ageVerified: number;
  isAdmin?: number;
  govRole?: string | null;
}

interface CitizenContextType {
  citizen: CitizenProfile | null;
  setCitizen: (c: CitizenProfile | null) => void;
  authToken: string | null;
  setAuthToken: (token: string | null) => void;
  authHeaders: Record<string, string>;
  refreshCitizen: () => Promise<void>;
  isLoading: boolean;
  twaStatus: TwaStatus;
  twaLoading: boolean;
}

const CitizenContext = createContext<CitizenContextType>({
  citizen: null,
  setCitizen: () => {},
  authToken: null,
  setAuthToken: () => {},
  authHeaders: {},
  refreshCitizen: async () => {},
  isLoading: true,
  twaStatus: null,
  twaLoading: false,
});

// Safely read Telegram WebApp initData (only available inside Telegram Mini App)
function getTgInitData(): string | null {
  try {
    const tg = (window as unknown as { Telegram?: { WebApp?: { initData?: string } } }).Telegram;
    return tg?.WebApp?.initData ?? null;
  } catch {
    return null;
  }
}

export function CitizenProvider({ children }: { children: React.ReactNode }) {
  const [citizen, setCitizenState]     = useState<CitizenProfile | null>(null);
  const [authToken, setAuthTokenState] = useState<string | null>(null);
  const [isLoading, setIsLoading]      = useState(true);
  const [twaStatus, setTwaStatus]      = useState<TwaStatus>(null);
  const [twaLoading, setTwaLoading]    = useState(false);

  useEffect(() => {
    // ── 1. Restore from localStorage ──────────────────────────────────────────
    let storedToken: string | null = null;
    let storedCitizen: CitizenProfile | null = null;
    try {
      const raw   = localStorage.getItem(STORAGE_KEY);
      storedToken = localStorage.getItem(AUTH_TOKEN_KEY);
      if (raw)         storedCitizen = JSON.parse(raw) as CitizenProfile;
      if (storedToken) setAuthTokenState(storedToken);
      if (storedCitizen) setCitizenState(storedCitizen);
      const cachedTwaStatus = localStorage.getItem(TWA_STATUS_KEY) as TwaStatus;
      if (cachedTwaStatus) setTwaStatus(cachedTwaStatus);
    } catch { /* ignore corrupt storage */ }

    // ── 2. Telegram WebApp auto-login ─────────────────────────────────────────
    const initData = getTgInitData();

    if (!initData) {
      // Not inside Telegram Mini App — nothing to do
      setIsLoading(false);
      return;
    }

    // Inside Telegram Mini App: always re-validate initData to get fresh status
    setTwaLoading(true);

    const doTwaAuth = async () => {
      try {
        const authData = await authenticateTelegramWebApp({
            initData,
            preApplicationProgressToken: localStorage.getItem(ONBOARDING_PROGRESS_TOKEN_KEY) ?? undefined,
        });

        // Persist token immediately
        setAuthTokenState(authData.authToken);
        localStorage.setItem(AUTH_TOKEN_KEY, authData.authToken);
        localStorage.setItem(TWA_STATUS_KEY, authData.status);
        setTwaStatus(authData.status);

        // Fetch full citizen profile
        const profileRes = await fetch(`/api/citizens/${authData.citizenId}`, {
          headers: { Authorization: `Bearer ${authData.authToken}` },
        });

        if (profileRes.ok) {
          const profile = (await profileRes.json()) as CitizenProfile;
          setCitizenState(profile);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
        } else {
          // Store minimal profile so sidebar shows citizen name
          const minimal: CitizenProfile = {
            id: authData.citizenId,
            name: authData.name,
            phone: "",
            balanceMinutes: 0,
            totalGiven: 0,
            totalReceived: 0,
            status: "active",
            registrationStatus: authData.status === "IN_EMISSION" ? "pending" : "issued",
            availableAt: null,
            meritScore: 0,
            rank: "",
            lastActivity: null,
            createdAt: new Date().toISOString(),
            walletAddress: null,
            walletVerified: 0,
            ageVerified: 0,
          };
          setCitizenState(minimal);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(minimal));
        }
      } catch {
        /* network error — fall through with whatever was in localStorage */
      } finally {
        setIsLoading(false);
        setTwaLoading(false);
      }

    };

    void doTwaAuth();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function refreshCitizen() {
    if (!citizen) return;
    try {
      const headers: Record<string, string> = authToken
        ? { Authorization: `Bearer ${authToken}` }
        : {};
      const res = await fetch(`/api/citizens/${citizen.id}`, { headers });
      if (res.ok) {
        const updated = (await res.json()) as CitizenProfile;
        setCitizenState(updated);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      }
    } catch {}
  }

  function setCitizen(c: CitizenProfile | null) {
    setCitizenState(c);
    if (c) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
    } else {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(AUTH_TOKEN_KEY);
      localStorage.removeItem(TWA_STATUS_KEY);
      setAuthTokenState(null);
      setTwaStatus(null);
    }
  }

  function setAuthToken(token: string | null) {
    setAuthTokenState(token);
    if (token) {
      localStorage.setItem(AUTH_TOKEN_KEY, token);
    } else {
      localStorage.removeItem(AUTH_TOKEN_KEY);
    }
  }

  const authHeaders: Record<string, string> = authToken
    ? { Authorization: `Bearer ${authToken}` }
    : {};

  return (
    <CitizenContext.Provider value={{
      citizen, setCitizen,
      authToken, setAuthToken,
      authHeaders,
      refreshCitizen,
      isLoading,
      twaStatus, twaLoading,
    }}>
      {children}
    </CitizenContext.Provider>
  );
}

export function useCitizen() {
  return useContext(CitizenContext);
}
