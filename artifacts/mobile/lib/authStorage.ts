import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

// SecureStore key (alphanumeric only — no slashes or @ signs)
const SS_KEY = "timenation_auth_token";
// Legacy AsyncStorage key — migrated on first read
const LEGACY_KEY = "@timenation/auth_token";

async function secureGet(key: string): Promise<string | null> {
  if (Platform.OS === "web") return AsyncStorage.getItem(key);
  const SS = (await import("expo-secure-store")).default;
  return SS.getItemAsync(key);
}

async function secureSet(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") { await AsyncStorage.setItem(key, value); return; }
  const SS = (await import("expo-secure-store")).default;
  await SS.setItemAsync(key, value);
}

async function secureDelete(key: string): Promise<void> {
  if (Platform.OS === "web") { await AsyncStorage.removeItem(key); return; }
  const SS = (await import("expo-secure-store")).default;
  await SS.deleteItemAsync(key);
}

async function resolveToken(): Promise<string | null> {
  // 1. Try new secure storage first
  const token = await secureGet(SS_KEY);
  if (token) return token;

  // 2. Migrate from legacy AsyncStorage key
  const legacy = await AsyncStorage.getItem(LEGACY_KEY);
  if (legacy) {
    await Promise.all([
      secureSet(SS_KEY, legacy),
      AsyncStorage.removeItem(LEGACY_KEY),
    ]);
    return legacy;
  }

  return null;
}

export async function getStoredToken(): Promise<string | null> {
  return resolveToken();
}

export async function getStoredAuthHeaders(): Promise<Record<string, string>> {
  const token = await resolveToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function setStoredToken(token: string): Promise<void> {
  await secureSet(SS_KEY, token);
  // Clean up legacy key if present
  AsyncStorage.removeItem(LEGACY_KEY).catch(() => {});
}

export async function deleteStoredToken(): Promise<void> {
  await Promise.all([
    secureDelete(SS_KEY),
    AsyncStorage.removeItem(LEGACY_KEY).catch(() => {}),
  ]);
}
