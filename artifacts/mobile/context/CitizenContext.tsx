import { getBaseUrl } from "@/lib/api";
import React, { createContext, useContext, useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const BASE_URL = getBaseUrl();
const STORAGE_KEY = "@timenation/citizen";
const AUTH_TOKEN_KEY = "@timenation/auth_token";

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
  professionalSkills?: string | null;
  calculatedMinuteRate?: number;
  potentialLaborDepositedMinutes?: number;
  skillsAuditedAt?: string | null;
  reviewScoreCount?: number;
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
    Promise.all([
      AsyncStorage.getItem(STORAGE_KEY),
      AsyncStorage.getItem(AUTH_TOKEN_KEY),
    ]).then(([raw, token]) => {
      if (raw) {
        try {
          const stored = JSON.parse(raw) as CitizenProfile;
          setCitizenState(stored);
        } catch {}
      }
      if (token) setAuthTokenState(token);
      setIsLoading(false);
    });
  }, []);

  async function refreshCitizen() {
    if (!citizen) return;
    try {
      const res = await fetch(`${BASE_URL}/api/citizens/${citizen.id}`);
      if (res.ok) {
        const updated = (await res.json()) as CitizenProfile;
        setCitizenState(updated);
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      }
    } catch {}
  }

  function setCitizen(c: CitizenProfile | null) {
    setCitizenState(c);
    if (c) {
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(c));
    } else {
      AsyncStorage.removeItem(STORAGE_KEY);
      AsyncStorage.removeItem(AUTH_TOKEN_KEY);
      setAuthTokenState(null);
    }
  }

  function setAuthToken(token: string | null) {
    setAuthTokenState(token);
    if (token) {
      AsyncStorage.setItem(AUTH_TOKEN_KEY, token);
    } else {
      AsyncStorage.removeItem(AUTH_TOKEN_KEY);
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
