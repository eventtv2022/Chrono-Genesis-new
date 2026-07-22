import { getBaseUrl } from "@/lib/api";
import { getStoredAuthHeaders } from "@/lib/authStorage";
import { getOrCreateKeyPair } from "@/lib/e2ee";
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
      let resolvedToken = token;

      if (raw) {
        try {
          const stored = JSON.parse(raw) as CitizenProfile & { authToken?: string };

          // ── MIGRATION: old code stored authToken inside the citizen JSON ──
          // If the separate auth_token key is missing, recover it from the profile.
          if (!resolvedToken && stored.authToken) {
            resolvedToken = stored.authToken;
            // Save under the correct key so future reads work
            AsyncStorage.setItem(AUTH_TOKEN_KEY, stored.authToken);
          }

          // Store citizen WITHOUT the authToken field (keep keys separate)
          const { authToken: _drop, ...profile } = stored;
          setCitizenState(profile as CitizenProfile);
        } catch {}
      }

      if (resolvedToken) setAuthTokenState(resolvedToken);
      setIsLoading(false);
    });
  }, []);

  // ── Register E2EE public key globally when citizen is authenticated ─────────
  // This runs whenever the citizen logs in or app restarts with a saved session.
  // Ensures every user's public key is on the server so anyone can message them
  // without the recipient having to open a specific chat first.
  useEffect(() => {
    if (!citizen) return;
    (async () => {
      try {
        const kp = await getOrCreateKeyPair();
        const checkRes = await fetch(`${BASE_URL}/api/chat/key/${citizen.id}`);
        if (checkRes.ok) {
          const existing = (await checkRes.json()) as { publicKey?: string };
          if (existing.publicKey === kp.publicKeyB64) return; // already registered
        }
        const hdrs = await getStoredAuthHeaders();
        if (!hdrs.Authorization) return; // no token yet — will retry on next citizen change
        await fetch(`${BASE_URL}/api/chat/key`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...hdrs },
          body: JSON.stringify({ publicKey: kp.publicKeyB64 }),
        });
      } catch { /* non-critical, silent */ }
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
