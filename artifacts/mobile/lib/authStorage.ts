import AsyncStorage from "@react-native-async-storage/async-storage";

const AUTH_TOKEN_KEY = "@timenation/auth_token";

export async function getStoredToken(): Promise<string | null> {
  return AsyncStorage.getItem(AUTH_TOKEN_KEY);
}

export async function getStoredAuthHeaders(): Promise<Record<string, string>> {
  const token = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}
