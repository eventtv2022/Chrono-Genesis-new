import { getBaseUrl } from "@/lib/api";
import { getStoredToken, getStoredAuthHeaders, setStoredToken, deleteStoredToken } from "@/lib/authStorage";
import { getOrCreateKeyPair } from "@/lib/e2ee";
import React, { createContext, useContext, useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Modal, Pressable, Text, TextInput, View } from "react-native";
import { useColors } from "@/hooks/useColors";
import { useCompleteCitizenAgeProfile } from "@workspace/api-client-react";

const BASE_URL = getBaseUrl();
const STORAGE_KEY = "@timenation/citizen"; // non-sensitive profile, AsyncStorage ok

export interface CitizenProfile {
  id: number;
  name: string;
  phone: string;
  balanceMinutes: number;
  timeXp: number;
  streakDays: number;
  totalGiven: number;
  totalReceived: number;
  status: string;
  registrationStatus?: string | null;
  availableAt?: string | null;
  onboardingCompleted?: boolean;
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
  photoUrl?: string | null;
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
  const colors = useColors();
  const [citizen, setCitizenState] = useState<CitizenProfile | null>(null);
  const [authToken, setAuthTokenState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [ageGateVisible, setAgeGateVisible] = useState(false);
  const [ageGateDob, setAgeGateDob] = useState("");
  const [ageGateError, setAgeGateError] = useState("");
  const [ageGateSaving, setAgeGateSaving] = useState(false);
  const authHeaders: Record<string, string> = authToken
    ? { Authorization: `Bearer ${authToken}` }
    : {};
  const completeAgeProfile = useCompleteCitizenAgeProfile({
    request: { headers: authHeaders },
  });

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(STORAGE_KEY),
      getStoredToken(), // reads from SecureStore (with legacy AsyncStorage migration)
    ]).then(async ([raw, token]) => {
      let resolvedToken = token;
      let restoredCitizen: CitizenProfile | null = null;

      if (raw) {
        try {
          const stored = JSON.parse(raw) as CitizenProfile & { authToken?: string };

          // MIGRATION: old code stored authToken inside the citizen JSON
          if (!resolvedToken && stored.authToken) {
            resolvedToken = stored.authToken;
            setStoredToken(stored.authToken).catch(() => {});
          }

          const { authToken: _drop, ...profile } = stored;
          restoredCitizen = profile as CitizenProfile;
          setCitizenState(restoredCitizen);
          setAgeGateVisible(restoredCitizen.ageProfileRequired !== false);
        } catch {}
      }

      if (resolvedToken) setAuthTokenState(resolvedToken);
      if (restoredCitizen && resolvedToken) {
        try {
          const response = await fetch(`${BASE_URL}/api/citizens/${restoredCitizen.id}`, {
            headers: { Authorization: `Bearer ${resolvedToken}` },
          });
          if (response.ok) {
            const profile = await response.json() as CitizenProfile;
            setCitizenState(profile);
            setAgeGateVisible(!!profile.ageProfileRequired);
            await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
          }
        } catch {
          // Keep the cached session available while offline.
        }
      }
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
      const res = await fetch(`${BASE_URL}/api/citizens/${citizen.id}`, { headers: authHeaders });
      if (res.ok) {
        const updated = (await res.json()) as CitizenProfile;
        setCitizenState(updated);
        setAgeGateVisible(!!updated.ageProfileRequired);
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      }
    } catch {}
  }

  function setCitizen(c: CitizenProfile | null) {
    if (c) {
      const { authToken: token, ageProfileRequired, ...profile } = c;
      setCitizenState(profile);
      setAgeGateVisible(!!ageProfileRequired);
      setAgeGateError("");
      if (token) setAuthToken(token);
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    } else {
      setCitizenState(null);
      setAgeGateVisible(false);
      setAgeGateDob("");
      setAgeGateError("");
      AsyncStorage.removeItem(STORAGE_KEY);
      deleteStoredToken().catch(() => {});
      setAuthTokenState(null);
    }
  }

  async function submitLegacyAge() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ageGateDob)) {
      setAgeGateError("Введите дату в формате ГГГГ-ММ-ДД.");
      return;
    }
    if (!authToken) {
      setAgeGateError("Сессия не найдена. Войдите снова.");
      return;
    }
    setAgeGateSaving(true);
    setAgeGateError("");
    try {
      await completeAgeProfile.mutateAsync({ data: { dateOfBirth: ageGateDob } });
      setAgeGateVisible(false);
      setAgeGateDob("");
      await refreshCitizen();
    } catch (error) {
      const apiError = error as Error & { data?: { error?: string } };
      setAgeGateError(apiError.data?.error ?? "Не удалось сохранить дату рождения. Попробуйте ещё раз.");
    } finally {
      setAgeGateSaving(false);
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

  return (
    <>
    <CitizenContext.Provider value={{ citizen, setCitizen, authToken, setAuthToken, authHeaders, refreshCitizen, isLoading }}>
      {children}
    </CitizenContext.Provider>
    <Modal visible={ageGateVisible} transparent animationType="fade" onRequestClose={() => {}}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.72)", justifyContent: "center", padding: 24 }}>
        <View style={{ borderRadius: colors.radius, padding: 22, backgroundColor: colors.card, gap: 14 }}>
          <Text style={{ color: colors.foreground, fontSize: 19, fontWeight: "700" }}>Укажите дату рождения</Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 14 }}>Она нужна для возрастных ограничений. Если вам меньше 13 лет, дата не будет сохранена.</Text>
          <TextInput
            value={ageGateDob}
            onChangeText={setAgeGateDob}
            placeholder="ГГГГ-ММ-ДД"
            placeholderTextColor={colors.mutedForeground}
            keyboardType="numbers-and-punctuation"
            accessibilityLabel="Дата рождения в формате ГГГГ-ММ-ДД"
            style={{ color: colors.foreground, borderColor: colors.border, borderWidth: 1, borderRadius: colors.radius, padding: 12 }}
          />
          {!!ageGateError && <Text accessibilityRole="alert" style={{ color: colors.destructive }}>{ageGateError}</Text>}
          <Pressable disabled={ageGateSaving} onPress={() => void submitLegacyAge()} style={{ borderRadius: colors.radius, padding: 13, backgroundColor: colors.primary, alignItems: "center", opacity: ageGateSaving ? 0.6 : 1 }}>
            <Text style={{ color: colors.primaryForeground, fontWeight: "700" }}>{ageGateSaving ? "Сохранение…" : "Продолжить"}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
    </>
  );
}

export function useCitizen() {
  return useContext(CitizenContext);
}
