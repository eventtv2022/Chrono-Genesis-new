import { createContext, useContext, useState, useEffect } from "react";

const STORAGE_KEY = "timenation_citizen";
const AUTH_TOKEN_KEY = "timenation_auth_token";

export interface CitizenProfile {
  id: number;
  name: string;
  phone: string;
  balanceMinutes: number;
  totalGiven: number;
  totalReceived: number;
  status: string;
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
}

const CitizenContext = createContext<CitizenContextType>({
  citizen: null,
  setCitizen: () => {},
  authToken: null,
  setAuthToken: () => {},
  authHeaders: {},
  refreshCitizen: async () => {},
  isLoading: true,
});

export function CitizenProvider({ children }: { children: React.ReactNode }) {
  const [citizen, setCitizenState] = useState<CitizenProfile | null>(null);
  const [authToken, setAuthTokenState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const stored = JSON.parse(raw) as CitizenProfile;
        setCitizenState(stored);
      }
      const token = localStorage.getItem(AUTH_TOKEN_KEY);
      if (token) setAuthTokenState(token);
    } catch {}
    setIsLoading(false);
  }, []);

  async function refreshCitizen() {
    if (!citizen) return;
    try {
      const res = await fetch(`/api/citizens/${citizen.id}`);
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
      setAuthTokenState(null);
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
    <CitizenContext.Provider value={{ citizen, setCitizen, authToken, setAuthToken, authHeaders, refreshCitizen, isLoading }}>
      {children}
    </CitizenContext.Provider>
  );
}

export function useCitizen() {
  return useContext(CitizenContext);
}
