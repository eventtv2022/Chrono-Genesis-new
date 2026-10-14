import { createContext, useContext, useState, useEffect } from "react";
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
  hasSignature?: boolean;
  ageProfileRequired?: boolean;
  authToken?: string;
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
  const [twaAgeGateRequired, setTwaAgeGateRequired] = useState(false);
  const [ageGateDob, setAgeGateDob] = useState("");
  const [ageGateError, setAgeGateError] = useState("");
  const [ageGateSubmitting, setAgeGateSubmitting] = useState(false);
  const [legacyAgeGateRequired, setLegacyAgeGateRequired] = useState(false);
  const [legacyDob, setLegacyDob] = useState("");
  const [legacyAgeError, setLegacyAgeError] = useState("");
  const [legacyAgeSubmitting, setLegacyAgeSubmitting] = useState(false);

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
        await authenticateTwa(initData);
      } catch {
        /* network error — fall through with whatever was in localStorage */
      } finally {
        setIsLoading(false);
        setTwaLoading(false);
      }

    };

    void doTwaAuth();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function authenticateTwa(initData: string, dateOfBirth?: string) {
    const response = await fetch("/api/auth/telegram-webapp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        initData,
        dateOfBirth,
        preApplicationProgressToken: localStorage.getItem(ONBOARDING_PROGRESS_TOKEN_KEY) ?? undefined,
      }),
    });
    const data = await response.json() as {
      authToken?: string; citizenId?: number; name?: string; status?: TwaStatus;
      error?: string; code?: string;
    };
    if (!response.ok) {
      if (data.code === "DATE_OF_BIRTH_REQUIRED") setTwaAgeGateRequired(true);
      setAgeGateError(data.code === "MINIMUM_AGE_NOT_MET"
        ? "Registration is only available from age 13. No account was created."
        : data.error ?? "Could not verify age. Please try again.");
      return;
    }
    if (!data.authToken || !data.citizenId || !data.status || !data.name) {
      setAgeGateError("The server returned an incomplete sign-in response.");
      return;
    }
    setTwaAgeGateRequired(false);
    setAgeGateError("");
    setAuthTokenState(data.authToken);
    localStorage.setItem(AUTH_TOKEN_KEY, data.authToken);
    localStorage.setItem(TWA_STATUS_KEY, data.status);
    setTwaStatus(data.status);
    const profileRes = await fetch(`/api/citizens/${data.citizenId}`, {
      headers: { Authorization: `Bearer ${data.authToken}` },
    });
    if (profileRes.ok) {
      const profile = await profileRes.json() as CitizenProfile;
      setCitizenState(profile);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    }
  }

  async function submitTwaAgeGate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ageGateDob)) {
      setAgeGateError("Enter a valid date of birth.");
      return;
    }
    const initData = getTgInitData();
    if (!initData) return;
    setAgeGateSubmitting(true);
    setAgeGateError("");
    try {
      await authenticateTwa(initData, ageGateDob);
    } catch {
      setAgeGateError("Network error. Please try again.");
    } finally {
      setAgeGateSubmitting(false);
    }
  }

  async function submitLegacyAgeGate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(legacyDob)) {
      setLegacyAgeError("Enter a valid date of birth.");
      return;
    }
    setLegacyAgeSubmitting(true);
    setLegacyAgeError("");
    try {
      const response = await fetch("/api/auth/complete-age", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ dateOfBirth: legacyDob }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) {
        setLegacyAgeError(data.error ?? "Could not save date of birth.");
        return;
      }
      setLegacyAgeGateRequired(false);
      setLegacyDob("");
      await refreshCitizen();
    } catch {
      setLegacyAgeError("Network error. Please try again.");
    } finally {
      setLegacyAgeSubmitting(false);
    }
  }

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
    const loginData = c as (CitizenProfile & { ageProfileRequired?: boolean }) | null;
    setLegacyAgeGateRequired(!!loginData?.ageProfileRequired);
    setLegacyAgeError("");
    const profile = loginData
      ? (({ ageProfileRequired: _required, authToken: token, ...rest }) => {
          if (token) setAuthToken(token);
          return rest;
        })(loginData)
      : null;
    setCitizenState(profile as CitizenProfile | null);
    if (profile) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
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
    <>
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
    {twaAgeGateRequired && (
      <div role="dialog" aria-modal="true" aria-labelledby="twa-age-title" className="fixed inset-0 z-[10000] grid place-items-center bg-black/70 p-4">
        <form onSubmit={submitTwaAgeGate} className="w-full max-w-md space-y-4 rounded-xl bg-background p-6 text-foreground shadow-xl">
          <h2 id="twa-age-title" className="text-lg font-semibold">Age check / Проверка возраста</h2>
          <p className="text-sm text-muted-foreground">Date of birth is required. Registration is available from age 13. Your date is not saved if you are under 13.</p>
          <label className="block text-sm" htmlFor="twa-date-of-birth">Date of birth / Дата рождения</label>
          <input id="twa-date-of-birth" type="date" required value={ageGateDob} onChange={e => setAgeGateDob(e.target.value)} className="w-full rounded-md border bg-background p-2" />
          {ageGateError && <p role="alert" className="text-sm text-red-600">{ageGateError}</p>}
          <button type="submit" disabled={ageGateSubmitting} className="w-full rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50">
            {ageGateSubmitting ? "Checking…" : "Continue"}
          </button>
        </form>
      </div>
    )}
    {legacyAgeGateRequired && (
      <div role="dialog" aria-modal="true" aria-labelledby="legacy-age-title" className="fixed inset-0 z-[10001] grid place-items-center bg-black/70 p-4">
        <form onSubmit={submitLegacyAgeGate} className="w-full max-w-md space-y-4 rounded-xl bg-background p-6 text-foreground shadow-xl">
          <h2 id="legacy-age-title" className="text-lg font-semibold">Complete your age profile / Укажите дату рождения</h2>
          <p className="text-sm text-muted-foreground">Your account needs a date of birth before age-restricted features can be checked. If you are under 13, the date will not be saved.</p>
          <label className="block text-sm" htmlFor="legacy-date-of-birth">Date of birth / Дата рождения</label>
          <input id="legacy-date-of-birth" type="date" required value={legacyDob} onChange={e => setLegacyDob(e.target.value)} className="w-full rounded-md border bg-background p-2" />
          {legacyAgeError && <p role="alert" className="text-sm text-red-600">{legacyAgeError}</p>}
          <button type="submit" disabled={legacyAgeSubmitting} className="w-full rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50">
            {legacyAgeSubmitting ? "Saving…" : "Continue"}
          </button>
        </form>
      </div>
    )}
    </>
  );
}

export function useCitizen() {
  return useContext(CitizenContext);
}
