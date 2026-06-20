import { Platform } from "react-native";

/**
 * Returns the API base URL robustly across all environments:
 * - Native (Expo Go): uses EXPO_PUBLIC_DOMAIN env var
 * - Web (Chrome on expo.pike.replit.dev): derives API domain from window.location
 * - Fallback: same-origin (relative)
 */
export function getBaseUrl(): string {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;

  // Native platform always uses the env var
  if (Platform.OS !== "web") {
    return domain ? `https://${domain}` : "";
  }

  // Web: env var is valid and not literally "undefined"
  if (domain && domain !== "undefined") {
    return `https://${domain}`;
  }

  // Web fallback: derive from window.location.hostname
  // expo.pike.replit.dev → pike.replit.dev (strip "expo." prefix)
  if (typeof window !== "undefined") {
    const h = window.location.hostname;
    // Pattern: {repl-id}.expo.{cluster}.replit.dev
    const match = h.match(/^([^.]+)\.expo\.(.+)$/);
    if (match) return `https://${match[1]}.${match[2]}`;
    // Same-origin fallback (e.g. local dev)
    return window.location.origin;
  }

  return "";
}
