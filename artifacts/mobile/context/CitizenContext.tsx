import { getBaseUrl } from "@/lib/api";
import { getStoredToken, getStoredAuthHeaders, setStoredToken, deleteStoredToken } from "@/lib/authStorage";
import { getOrCreateKeyPair } from "@/lib/e2ee";
import React, { createContext, useContext, useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const BASE_URL = getBaseUrl();
const STORAGE_KEY = "@timenation/citizen"; // non-sensitive profile, AsyncStorage ok

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
      getStoredToken(), // reads from SecureStore (with legacy AsyncStorage migration)
    ]).then(([raw, token]) => {
      let resolvedToken = token;

      if (raw) {
        try {
          const stored = JSON.parse(raw) as CitizenProfile & { authToken?: string };

          // MIGRATION: old code stored authToken inside the citizen JSON
          if (!resolvedToken && stored.authToken) {
            resolvedToken = stored.authToken;
            setStoredToken(stored.authToken).catch(() => {});
          }

          const { authToken: _drop, ...profile } = stored;
          setCitizenState(profile as CitizenProfile);
        } catch {}
      }

      if (resolvedToken) setAuthTokenState(resolvedToken);
      setIsLoading(false);
    });
  }, []);

  // Register E2EE public key on the server whenever citizen is authenticated
  useEffect(() => {
    if (!citizen) return;
    (async () => {
      try {
        const kp = await getOrCreateKeyPair();
        const checkRes = await fetch(`${BASE_URL}/api/chat/key/${citizen.id}`);
        if (checkRes.ok) {
          const existing = (await checkRes.json()) as { publicKey?: string };
          if (existing.publicKey === kp.publicKeyB64) return;
        }
        const hdrs = await getStoredAuthHeaders();
        if (!hdrs.Authorization) return;
        await fetch(`${BASE_URL}/api/chat/key`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...hdrs },
          body: JSON.stringify({ publicKey: kp.publicKeyB64 }),
        });
      } catch { /* non-critical */ }
    })();
  }, [citizen?.id]);

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
      deleteStoredToken().catch(() => {});
      setAuthTokenState(null);
    }
  }

  function setAuthToken(token: string | null) {
    setAuthTokenState(token);
    if (token) {
      setStoredToken(token).catch(() => {}); // fire-and-forget to SecureStore
    } else {
      deleteStoredToken().catch(() => {});
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
