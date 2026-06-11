import { createContext, useContext, useState, useEffect } from "react";

const STORAGE_KEY = "timenation_citizen";

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
}

interface CitizenContextType {
  citizen: CitizenProfile | null;
  setCitizen: (c: CitizenProfile | null) => void;
  refreshCitizen: () => Promise<void>;
  isLoading: boolean;
}

const CitizenContext = createContext<CitizenContextType>({
  citizen: null,
  setCitizen: () => {},
  refreshCitizen: async () => {},
  isLoading: true,
});

export function CitizenProvider({ children }: { children: React.ReactNode }) {
  const [citizen, setCitizenState] = useState<CitizenProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const stored = JSON.parse(raw) as CitizenProfile;
        setCitizenState(stored);
      }
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
    }
  }

  return (
    <CitizenContext.Provider value={{ citizen, setCitizen, refreshCitizen, isLoading }}>
      {children}
    </CitizenContext.Provider>
  );
}

export function useCitizen() {
  return useContext(CitizenContext);
}
