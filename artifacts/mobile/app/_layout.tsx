import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { setAuthTokenGetter, setBaseUrl } from "@workspace/api-client-react";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { CitizenProvider, useCitizen } from "@/context/CitizenContext";
import { LanguageProvider } from "@/context/LanguageContext";
import { getStoredToken } from "@/lib/authStorage";

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

const apiDomain = process.env.EXPO_PUBLIC_DOMAIN;
if (apiDomain && apiDomain !== "undefined") {
  setBaseUrl(`https://${apiDomain}`);
}
setAuthTokenGetter(getStoredToken);

function RootLayoutNav() {
  const { citizen, isLoading } = useCitizen();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (isLoading) return;
    const route = segments[0];
    if (citizen?.onboardingCompleted === false) {
      if (route !== "onboarding") router.replace("/onboarding");
      return;
    }
    if (!citizen && route === "(tabs)" && segments.length > 1) {
      router.replace("/");
    }
  }, [citizen?.id, citizen?.onboardingCompleted, isLoading, router, segments]);

  return (
    <Stack screenOptions={{ headerBackTitle: "Back" }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="register" options={{ headerShown: false, presentation: "modal" }} />
      <Stack.Screen name="login" options={{ headerShown: false, presentation: "modal" }} />
      <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false }} />
      <Stack.Screen name="wallet" options={{ headerShown: false, presentation: "modal" }} />
      <Stack.Screen name="shop" options={{ headerShown: false, presentation: "modal" }} />
      <Stack.Screen name="citizens" options={{ headerShown: false }} />
      <Stack.Screen name="passport-lookup" options={{ headerShown: false }} />
      <Stack.Screen name="broadcast" options={{ headerShown: false }} />
      <Stack.Screen name="chat" options={{ headerShown: false }} />
      <Stack.Screen name="chat/[citizenId]" options={{ headerShown: false }} />
      <Stack.Screen name="chat/group/[groupId]" options={{ headerShown: false }} />
      <Stack.Screen name="chat/new-group" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <LanguageProvider>
          <CitizenProvider>
            <GestureHandlerRootView>
              <KeyboardProvider>
                <RootLayoutNav />
              </KeyboardProvider>
            </GestureHandlerRootView>
          </CitizenProvider>
          </LanguageProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
