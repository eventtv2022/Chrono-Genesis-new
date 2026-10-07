import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Platform, ScrollView, Text, TouchableOpacity, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import {
  getGetOnboardingStatusQueryKey,
  useCompleteOnboarding,
  useGetOnboardingStatus,
  useStartOnboarding,
} from "@workspace/api-client-react";
import { useCitizen } from "@/context/CitizenContext";
import { useColors } from "@/hooks/useColors";
import { ONBOARDING_QUESTS } from "../../../lib/onboarding-quests";

function formatClock(totalSeconds: number) {
  const seconds = Math.max(0, totalSeconds);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

function moduleName(index: number) {
  if (index < 10) return "Профиль · Искеле / Фамагуста · кошелёк";
  if (index < 25) return "P2P-переводы · QR-код";
  if (index < 40) return "Доска времени · предложения и запросы";
  if (index < 55) return "Эскроу · DarMin";
  return "Голосование · Родовая минута · декларация";
}

export default function OnboardingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { citizen, authToken, setCitizen } = useCitizen();
  const authHeaders: Record<string, string> = authToken ? { Authorization: `Bearer ${authToken}` } : {};
  const queryKey = useMemo(
    () => [...getGetOnboardingStatusQueryKey(), citizen?.id],
    [citizen?.id],
  );
  const status = useGetOnboardingStatus({
    query: { enabled: !!citizen && !!authToken, queryKey, refetchInterval: 30_000 },
    request: { headers: authHeaders },
  });
  const start = useStartOnboarding({ request: { headers: authHeaders } });
  const complete = useCompleteOnboarding({ request: { headers: authHeaders } });
  const [now, setNow] = useState(Date.now());
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [answersLoaded, setAnswersLoaded] = useState(false);
  const [completionError, setCompletionError] = useState<string | null>(null);
  const [completionAttempt, setCompletionAttempt] = useState(0);
  const [celebrating, setCelebrating] = useState(false);
  const completing = useRef(false);
  const storageKey = `timenation_onboarding_answers_${citizen?.id ?? "guest"}`;

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(storageKey)
      .then((value) => {
        if (active && value) setAnswers(JSON.parse(value) as Record<number, number>);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setAnswersLoaded(true);
      });
    return () => { active = false; };
  }, [storageKey]);

  useEffect(() => {
    if (answersLoaded) AsyncStorage.setItem(storageKey, JSON.stringify(answers)).catch(() => {});
  }, [answersLoaded, answers, storageKey]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!status.data || status.data.completed || status.data.startedAt || start.isPending || start.isSuccess) return;
    start.mutate(undefined, {
      onSuccess: (result) => queryClient.setQueryData(queryKey, result),
    });
  }, [status.data, start.isPending, start.isSuccess, start.mutate, queryClient, queryKey]);

  useEffect(() => {
    if (!status.data?.completed || celebrating) return;
    if (citizen?.onboardingCompleted === false) {
      setCitizen({ ...citizen, onboardingCompleted: true });
    }
    router.replace("/");
  }, [status.data?.completed, celebrating, citizen, setCitizen, router]);

  const remainingSeconds = status.data
    ? Math.max(0, status.data.secondsRemaining - Math.floor((now - status.dataUpdatedAt) / 1000))
    : 3600;
  const elapsedSeconds = Math.max(0, 3600 - remainingSeconds);
  const questIndex = Math.min(59, Math.floor(elapsedSeconds / 60));
  const quest = ONBOARDING_QUESTS[questIndex];
  const progress = Math.min(100, (elapsedSeconds / 3600) * 100);
  const selected = answers[questIndex];
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  useEffect(() => {
    if (remainingSeconds !== 0 || completing.current || status.data?.completed || !citizen) return;
    completing.current = true;
    setCompletionError(null);
    complete.mutate(undefined, {
      onSuccess: () => {
        setCelebrating(true);
        setCitizen({ ...citizen, onboardingCompleted: true });
        queryClient.setQueryData(queryKey, (previous: typeof status.data) =>
          previous ? { ...previous, completed: true, secondsRemaining: 0 } : previous,
        );
        setTimeout(() => router.replace("/"), 4200);
      },
      onError: () => {
        completing.current = false;
        setCompletionError("Не удалось сохранить завершение. Проверьте соединение и повторите попытку.");
      },
    });
  }, [remainingSeconds, status.data?.completed, completionAttempt, citizen, complete.mutate, queryClient, queryKey, setCitizen, router]);

  if (!citizen) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center", padding: 26 }}>
        <Feather name="lock" size={30} color={colors.primary} />
        <Text style={{ color: colors.foreground, fontFamily: "Inter_700Bold", fontSize: 22, textAlign: "center", marginTop: 15 }}>
          Войдите, чтобы продолжить обучение
        </Text>
        <TouchableOpacity onPress={() => router.replace("/login")} style={{ marginTop: 22, backgroundColor: colors.primary, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 14 }} testID="button-onboarding-login">
          <Text style={{ color: colors.primaryForeground, fontFamily: "Inter_700Bold" }}>Перейти ко входу</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (celebrating || status.data?.completed) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center", paddingHorizontal: 28, paddingTop: topInset, paddingBottom: bottomInset }}>
        <View style={{ width: 88, height: 88, borderRadius: 44, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.goldGlow, alignItems: "center", justifyContent: "center" }}>
          <Feather name="check" size={40} color={colors.primary} />
        </View>
        <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold", fontSize: 12, letterSpacing: 2, marginTop: 25 }}>TIMENATION · ОБУЧЕНИЕ</Text>
        <Text style={{ color: colors.foreground, fontFamily: "Inter_700Bold", fontSize: 30, textAlign: "center", marginTop: 13 }}>Учебный этап завершён</Text>
        <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 15, lineHeight: 23, textAlign: "center", marginTop: 13 }}>
          Это завершение симуляции, а не вручение паспорта. Паспортный статус и баланс DarMin не менялись; действующий процесс оформления остаётся прежним.
        </Text>
      </View>
    );
  }

  if (status.isLoading || !status.data || !status.data.startedAt) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center", padding: 28 }}>
        <ActivityIndicator color={colors.primary} />
        <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginTop: 14, textAlign: "center" }}>
          {status.isError || start.isError ? "Не удалось загрузить обучение. Проверьте соединение." : "Подключаем учебный таймер…"}
        </Text>
      </View>
    );
  }

  const secondsToNextStep = 60 - (elapsedSeconds % 60);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingTop: topInset + 12, paddingBottom: bottomInset + 28, paddingHorizontal: 20 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={{ maxWidth: 620, width: "100%", alignSelf: "center" }}>
        <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold", fontSize: 11, letterSpacing: 2 }}>TIMENATION · ОБУЧЕНИЕ</Text>
        <Text style={{ color: colors.foreground, fontFamily: "Inter_700Bold", fontSize: 27, marginTop: 7 }}>60 минут знакомства с приложением</Text>
        <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 14, lineHeight: 21, marginTop: 8 }}>
          60 коротких выборов о реальных функциях. Никакие ответы не создают сделки, не выдают паспорт и не меняют баланс.
        </Text>

        <View style={{ borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, borderRadius: 16, padding: 17, marginTop: 21 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_600SemiBold", fontSize: 11 }}>ОСТАЛОСЬ</Text>
            <Text style={{ color: colors.primary, fontFamily: "Inter_700Bold", fontSize: 25, fontVariant: ["tabular-nums"] }}>{formatClock(remainingSeconds)}</Text>
          </View>
          <View style={{ height: 6, backgroundColor: colors.surface, borderRadius: 6, overflow: "hidden", marginTop: 14 }}>
            <View style={{ width: `${progress}%`, height: 6, backgroundColor: colors.primary, borderRadius: 6 }} />
          </View>
          <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 11, marginTop: 9 }}>
            Учебный прогресс · {Math.floor(elapsedSeconds / 60)}/60 минут · не является индикатором выдачи паспорта
          </Text>
        </View>

        <View style={{ borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, borderRadius: 16, padding: 18, marginTop: 14 }}>
          <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold", fontSize: 11, letterSpacing: 1.1 }}>КВЕСТ {questIndex + 1} / 60</Text>
          <Text style={{ color: colors.foreground, fontFamily: "Inter_700Bold", fontSize: 14, marginTop: 11 }}>{moduleName(questIndex)}</Text>
          <Text style={{ color: colors.foreground, fontFamily: "Inter_700Bold", fontSize: 21, marginTop: 17 }}>{quest.title}</Text>
          <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 15, lineHeight: 22, marginTop: 8 }}>{quest.prompt}</Text>

          <View style={{ gap: 9, marginTop: 18 }}>
            {quest.choices.map((option, index) => (
              <TouchableOpacity
                key={option}
                onPress={() => setAnswers((current) => ({ ...current, [questIndex]: index }))}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityState={{ selected: selected === index }}
                testID={`button-onboarding-choice-${index}`}
                style={{
                  minHeight: 48,
                  borderRadius: 11,
                  borderWidth: 1,
                  borderColor: selected === index ? colors.primary : colors.border,
                  backgroundColor: selected === index ? colors.goldGlow : colors.surface,
                  paddingHorizontal: 13,
                  paddingVertical: 12,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <Text style={{ flex: 1, color: colors.foreground, fontFamily: "Inter_500Medium", fontSize: 13, lineHeight: 19 }}>{option}</Text>
                {selected === index && <Feather name="check" size={17} color={colors.primary} style={{ marginLeft: 9 }} />}
              </TouchableOpacity>
            ))}
          </View>

          {selected !== undefined && (
            <View style={{ marginTop: 14, padding: 13, borderRadius: 10, backgroundColor: colors.success + "18" }}>
              <Text style={{ color: colors.success, fontFamily: "Inter_600SemiBold", fontSize: 12 }}>Что запомнить</Text>
              <Text style={{ color: colors.foreground, fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 20, marginTop: 4 }}>{quest.takeaway}</Text>
            </View>
          )}
        </View>

        <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14, marginTop: 14 }}>
          <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 18 }}>
            $1 DarMin = 1 минута. Следующий учебный выбор через {formatClock(secondsToNextStep)}. Серверный таймер продолжится, даже если закрыть приложение.
          </Text>
        </View>

        {completionError && (
          <View style={{ marginTop: 14, borderWidth: 1, borderColor: colors.destructive, borderRadius: 12, padding: 14 }}>
            <Text style={{ color: colors.destructive, fontFamily: "Inter_500Medium", fontSize: 13 }}>{completionError}</Text>
            <TouchableOpacity onPress={() => { completing.current = false; setCompletionAttempt((attempt) => attempt + 1); }} style={{ marginTop: 10 }} testID="button-onboarding-retry">
              <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold" }}>Повторить</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </ScrollView>
  );
}
