import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  getGetOnboardingProgressSessionQueryKey,
  getGetOnboardingStatusQueryKey,
  useCreateOnboardingProgressSession,
  useGetOnboardingProgressSession,
  useGetOnboardingStatus,
  useUpdateCitizenOnboardingProgress,
  useUpdateOnboardingProgressSession,
} from "@workspace/api-client-react";
import {
  ONBOARDING_PROGRESS_TOKEN_KEY,
  PASSPORT_SIMULATOR_QUESTIONS,
  PRE_APPLICATION_GUIDE_COMPLETE_KEY,
  PRE_APPLICATION_QUESTIONS,
  onboardingBlockTitle,
} from "../../../lib/onboarding-questions";
import { useCitizen } from "@/context/CitizenContext";
import { useColors } from "@/hooks/useColors";

function formatClock(totalSeconds: number) {
  const seconds = Math.max(0, totalSeconds);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

function ScreenFrame({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{
        flexGrow: 1,
        paddingHorizontal: 20,
        paddingTop: Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top + 18,
        paddingBottom: Platform.OS === "web" ? Math.max(insets.bottom, 34) + 28 : insets.bottom + 28,
      }}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

function ActionButton({
  title,
  onPress,
  disabled,
  secondary,
  testID,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
  testID?: string;
}) {
  const colors = useColors();
  return (
    <TouchableOpacity
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={{
        minHeight: 50,
        paddingHorizontal: 18,
        borderRadius: 13,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: secondary ? "transparent" : colors.primary,
        borderWidth: secondary ? 1 : 0,
        borderColor: colors.border,
        opacity: disabled ? 0.45 : 1,
      }}
    >
      <Text style={{ color: secondary ? colors.foreground : colors.primaryForeground, fontWeight: "700", fontSize: 15 }}>
        {title}
      </Text>
    </TouchableOpacity>
  );
}

function PreApplicationGuide() {
  const queryClient = useQueryClient();
  const colors = useColors();
  const [progressToken, setProgressToken] = useState("");
  const [storageReady, setStorageReady] = useState(false);
  const [error, setError] = useState("");
  const createStarted = useRef(false);
  const createSession = useCreateOnboardingProgressSession();
  const updateProgress = useUpdateOnboardingProgressSession();

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(ONBOARDING_PROGRESS_TOKEN_KEY)
      .then((stored) => {
        if (!active) return;
        setProgressToken(stored ?? "");
        setStorageReady(true);
      })
      .catch(() => {
        if (active) {
          setError("Не удалось открыть сохранённый прогресс.");
          setStorageReady(true);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!storageReady || progressToken || error || createStarted.current) return;
    createStarted.current = true;
    createSession.mutate(undefined, {
      onSuccess: async (created) => {
        try {
          await AsyncStorage.setItem(ONBOARDING_PROGRESS_TOKEN_KEY, created.progressToken);
          setProgressToken(created.progressToken);
        } catch {
          setError("Не удалось сохранить идентификатор прогресса на устройстве.");
        }
      },
      onError: () => setError("Не удалось создать знакомство. Проверьте соединение и повторите попытку."),
    });
  }, [storageReady, progressToken, error, createSession]);

  const progressQuery = useGetOnboardingProgressSession(progressToken, {
    query: {
      queryKey: getGetOnboardingProgressSessionQueryKey(progressToken),
      enabled: !!progressToken,
      retry: false,
    },
  });
  const session = progressQuery.data;
  const questionId = session?.guideCurrentQuestionId ?? 1;
  const question = PRE_APPLICATION_QUESTIONS[questionId - 1]!;
  const revealed = session?.guideRevealedQuestionIds.includes(questionId) ?? false;
  const percent = Math.floor(((session?.guideRevealedQuestionIds.length ?? 0) / 30) * 100);

  useEffect(() => {
    if (progressQuery.isError) setError("Не удалось загрузить сохранённый прогресс.");
  }, [progressQuery.isError]);

  async function act(action: "reveal" | "continue" | "back") {
    if (!session || updateProgress.isPending) return;
    setError("");
    try {
      const updated = await updateProgress.mutateAsync({
        progressToken,
        data: { phase: "guide", action, questionId },
      });
      queryClient.setQueryData(getGetOnboardingProgressSessionQueryKey(progressToken), updated);
      if (updated.guideCompleted) {
        await AsyncStorage.setItem(PRE_APPLICATION_GUIDE_COMPLETE_KEY, "complete");
        routerReplaceToRegister();
      }
    } catch {
      setError("Не удалось сохранить прогресс. Проверьте соединение и повторите попытку.");
      await progressQuery.refetch();
    }
  }

  function routerReplaceToRegister() {
    // The enclosing Expo router is available from the module-level hook below.
    router.replace("/register");
  }

  const router = useRouter();
  if (session?.guideCompleted) {
    return (
      <ScreenFrame>
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", gap: 16 }}>
          <Text style={{ color: colors.success, fontSize: 12, fontWeight: "700", letterSpacing: 1.4 }}>
            ЗНАКОМСТВО ЗАВЕРШЕНО
          </Text>
          <Text style={{ color: colors.foreground, fontSize: 27, fontWeight: "800", textAlign: "center" }}>
            Теперь можно подать заявление
          </Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 15, lineHeight: 23, textAlign: "center" }}>
            Часовой срок начнётся после отправки заявления. Финал симуляции будет за минуту до выдачи паспорта.
          </Text>
          <ActionButton
            testID="button-guide-complete-continue"
            title="Перейти к заявлению"
            onPress={() => router.replace("/register")}
          />
        </View>
      </ScreenFrame>
    );
  }
  if (!session) {
    return (
      <ScreenFrame>
        <View style={{ flex: 1, justifyContent: "center", gap: 14 }}>
          <Text style={{ color: colors.foreground, fontSize: 23, fontWeight: "700", textAlign: "center" }}>
            Подключаем знакомство
          </Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 15, lineHeight: 23, textAlign: "center" }}>
            {error || "Сохраняем ответы в TimeNation…"}
          </Text>
          {error ? <ActionButton title="Повторить" onPress={() => router.replace("/onboarding")} secondary /> : null}
        </View>
      </ScreenFrame>
    );
  }

  return (
    <ScreenFrame>
      <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "700", letterSpacing: 1.5 }}>
        TIMENATION · ПЕРЕД ПОДАЧЕЙ ЗАЯВЛЕНИЯ
      </Text>
      <Text style={{ color: colors.foreground, fontSize: 29, fontWeight: "800", marginTop: 12 }}>
        Знакомство с TimeNation
      </Text>
      <Text style={{ color: colors.mutedForeground, fontSize: 15, lineHeight: 23, marginTop: 10, marginBottom: 22 }}>
        Прочитайте 30 вопросов и ответов. Часовое ожидание начнётся только после отправки заявления.
      </Text>

      <View style={{ backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: colors.radius, padding: 16, marginBottom: 14 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 11 }}>
          <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "700" }}>ВОПРОС {questionId} / 30</Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>{percent}%</Text>
        </View>
        <View style={{ height: 7, backgroundColor: colors.muted, borderRadius: 8, overflow: "hidden" }}>
          <View style={{ width: `${percent}%`, height: "100%", backgroundColor: colors.primary }} />
        </View>
      </View>

      <View style={{ backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: colors.radius, padding: 20 }}>
        <Text style={{ color: colors.primary, fontSize: 11, fontWeight: "700", letterSpacing: 1.2 }}>
          {onboardingBlockTitle(question.id).toUpperCase()}
        </Text>
        <Text style={{ color: colors.foreground, fontSize: 22, fontWeight: "700", lineHeight: 30, marginTop: 11 }}>
          {question.question}
        </Text>
        {revealed ? (
          <View style={{ borderColor: colors.success, borderWidth: 1, backgroundColor: colors.card, borderRadius: colors.radius, padding: 15, marginTop: 18 }}>
            <Text style={{ color: colors.success, fontSize: 14, fontWeight: "700", marginBottom: 5 }}>ОТВЕТ</Text>
            <Text style={{ color: colors.cardForeground, fontSize: 15, lineHeight: 23 }}>{question.answer}</Text>
          </View>
        ) : (
          <Text style={{ color: colors.mutedForeground, fontSize: 14, marginTop: 14 }}>Нажмите, чтобы открыть ответ.</Text>
        )}
        {error ? <Text accessibilityRole="alert" style={{ color: colors.destructive, fontSize: 13, lineHeight: 20, marginTop: 13 }}>{error}</Text> : null}
        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10, marginTop: 22 }}>
          <View style={{ flex: 1 }}>
            <ActionButton testID="button-guide-back" title="Назад" secondary disabled={questionId === 1 || updateProgress.isPending} onPress={() => void act("back")} />
          </View>
          <View style={{ flex: 1.5 }}>
            <ActionButton
              title={revealed ? (questionId === 30 ? "Перейти к заявлению" : "Продолжить") : "Показать ответ"}
              testID={revealed ? (questionId === 30 ? "button-guide-finish" : "button-guide-continue") : "button-guide-reveal"}
              disabled={updateProgress.isPending}
              onPress={() => void act(revealed ? "continue" : "reveal")}
            />
          </View>
        </View>
      </View>
    </ScreenFrame>
  );
}

function OnboardingScreen() {
  const { citizen, authToken, setCitizen } = useCitizen();
  const router = useRouter();
  const queryClient = useQueryClient();
  const colors = useColors();
  const [remaining, setRemaining] = useState(3540);
  const [progressError, setProgressError] = useState("");
  const didNavigateToTabs = useRef(false);
  const authHeaders: Record<string, string> = authToken ? { Authorization: `Bearer ${authToken}` } : {};
  const queryKey = useMemo(
    () => [...getGetOnboardingStatusQueryKey(), citizen?.id],
    [citizen?.id],
  );
  const status = useGetOnboardingStatus({
    request: { headers: authHeaders },
    query: {
      queryKey,
      enabled: !!citizen,
      refetchInterval: 5000,
      refetchIntervalInBackground: true,
    },
  });
  const updateProgress = useUpdateCitizenOnboardingProgress({
    request: { headers: authHeaders },
  });
  const questionId = status.data?.simulatorCurrentQuestionId ?? 31;
  const question = PASSPORT_SIMULATOR_QUESTIONS[questionId - 31]!;
  const revealed = status.data?.simulatorRevealedQuestionIds.includes(questionId) ?? false;

  useEffect(() => {
    if (status.data?.registrationStatus === "issued" && !didNavigateToTabs.current) {
      didNavigateToTabs.current = true;
      if (citizen) setCitizen({ ...citizen, registrationStatus: "issued" });
      router.replace("/(tabs)");
      return;
    }
    const next = status.data?.secondsRemaining;
    if (typeof next === "number") setRemaining(next);
  }, [citizen?.id, router, status.data?.registrationStatus, status.data?.secondsRemaining]);

  useEffect(() => {
    const timer = setInterval(() => setRemaining((current) => Math.max(0, current - 1)), 1000);
    return () => clearInterval(timer);
  }, []);

  async function act(action: "reveal" | "continue" | "back") {
    if (!status.data || updateProgress.isPending) return;
    setProgressError("");
    try {
      const updated = await updateProgress.mutateAsync({
        data: { phase: "simulator", action, questionId },
      });
      queryClient.setQueryData(queryKey, (current: typeof status.data | undefined) =>
        current ? {
          ...current,
          simulatorCurrentQuestionId: updated.simulatorCurrentQuestionId,
          simulatorRevealedQuestionIds: updated.simulatorRevealedQuestionIds,
          simulatorCompleted: updated.simulatorCompleted,
        } : current,
      );
    } catch {
      setProgressError("Не удалось сохранить прогресс. Проверьте соединение и повторите попытку.");
      await status.refetch();
    }
  }

  if (!citizen) return <PreApplicationGuide />;

  if (status.data?.registrationStatus === "rejected") {
    return (
      <ScreenFrame>
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", gap: 15 }}>
          <Text style={{ color: colors.foreground, fontSize: 28, fontWeight: "800", textAlign: "center" }}>Заявление отклонено</Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 15, lineHeight: 23, textAlign: "center" }}>
            Проверьте данные заявления или обратитесь в поддержку TimeNation.
          </Text>
        </View>
      </ScreenFrame>
    );
  }

  if (status.isLoading || !status.data) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} />
        <Text style={{ color: colors.mutedForeground, marginTop: 12 }}>Загружаем симуляцию паспорта…</Text>
      </View>
    );
  }

  if (status.data.completed && status.data.registrationStatus === "pending") {
    return (
      <ScreenFrame>
        <View style={{ flex: 1, justifyContent: "center", gap: 18 }}>
          <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "700", letterSpacing: 1.4, textAlign: "center" }}>
            TIMENATION · ФИНАЛЬНАЯ МИНУТА
          </Text>
          <Text style={{ color: colors.foreground, fontSize: 30, fontWeight: "800", textAlign: "center" }}>
            Симуляция завершена
          </Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 15, lineHeight: 24, textAlign: "center" }}>
            Вы завершили знакомство с системой. Паспорт будет выдан по серверному сроку, установленному при подаче заявления.
          </Text>
          <View style={{ backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: colors.radius, padding: 20, alignItems: "center" }}>
            <Text style={{ color: colors.mutedForeground, fontSize: 12, letterSpacing: 1 }}>ДО ВЫДАЧИ ПАСПОРТА</Text>
            <Text style={{ color: colors.primary, fontSize: 38, fontVariant: ["tabular-nums"], fontWeight: "700", marginTop: 8 }}>
              {formatClock(status.data.secondsUntilEligibility)}
            </Text>
          </View>
        </View>
      </ScreenFrame>
    );
  }

  if (status.data.simulatorCompleted) {
    return (
      <ScreenFrame>
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", gap: 17 }}>
          <Text style={{ color: colors.success, fontSize: 12, fontWeight: "700", letterSpacing: 1.4 }}>ВОПРОСЫ ЗАВЕРШЕНЫ</Text>
          <Text style={{ color: colors.foreground, fontSize: 29, fontWeight: "800", textAlign: "center" }}>Симуляция продолжается</Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 15, lineHeight: 23, textAlign: "center" }}>
            Все ответы сохранены. Финал наступит за минуту до срока выдачи паспорта.
          </Text>
          <Text style={{ color: colors.primary, fontSize: 35, fontVariant: ["tabular-nums"], fontWeight: "700" }}>
            {formatClock(remaining)}
          </Text>
        </View>
      </ScreenFrame>
    );
  }

  const percent = Math.min(100, Math.floor(((3540 - remaining) / 3540) * 100));
  return (
    <ScreenFrame>
      <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "700", letterSpacing: 1.4 }}>
        TIMENATION · СИМУЛЯЦИЯ ПАСПОРТА
      </Text>
      <Text style={{ color: colors.foreground, fontSize: 28, fontWeight: "800", marginTop: 12 }}>Ваш путь к гражданству</Text>
      <Text style={{ color: colors.mutedForeground, fontSize: 15, lineHeight: 23, marginTop: 9, marginBottom: 18 }}>
        Отвечайте в удобном темпе. Прогресс и срок подачи заявления сохраняются на сервере.
      </Text>

      <View style={{ backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: colors.radius, padding: 17, marginBottom: 15 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ color: colors.mutedForeground, fontSize: 12, fontWeight: "700", letterSpacing: 1 }}>ДО ФИНАЛА</Text>
          <Text style={{ color: colors.primary, fontSize: 17, fontVariant: ["tabular-nums"], fontWeight: "700" }}>{formatClock(remaining)}</Text>
        </View>
        <View style={{ height: 6, backgroundColor: colors.muted, borderRadius: 8, overflow: "hidden", marginTop: 12 }}>
          <View style={{ width: `${percent}%`, height: "100%", backgroundColor: colors.primary }} />
        </View>
        <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 10 }}>
          Срок выдачи: {status.data.availableAt ? new Date(status.data.availableAt).toLocaleString() : "ожидается"}
        </Text>
      </View>

      <View style={{ backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: colors.radius, padding: 20 }}>
        <Text style={{ color: colors.primary, fontSize: 11, fontWeight: "700", letterSpacing: 1.1 }}>
          {onboardingBlockTitle(question.id).toUpperCase()}
        </Text>
        <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700", marginTop: 12 }}>ВОПРОС {questionId} / 60</Text>
        <Text style={{ color: colors.foreground, fontSize: 22, fontWeight: "700", lineHeight: 30, marginTop: 8 }}>
          {question.question}
        </Text>
        {revealed ? (
          <View style={{ borderColor: colors.success, borderWidth: 1, backgroundColor: colors.card, borderRadius: colors.radius, padding: 15, marginTop: 18 }}>
            <Text style={{ color: colors.success, fontSize: 14, fontWeight: "700", marginBottom: 5 }}>ОТВЕТ</Text>
            <Text style={{ color: colors.cardForeground, fontSize: 15, lineHeight: 23 }}>{question.answer}</Text>
          </View>
        ) : (
          <Text style={{ color: colors.mutedForeground, fontSize: 14, marginTop: 14 }}>Нажмите, чтобы открыть ответ.</Text>
        )}
        {progressError ? <Text accessibilityRole="alert" style={{ color: colors.destructive, fontSize: 13, lineHeight: 20, marginTop: 13 }}>{progressError}</Text> : null}
        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10, marginTop: 22 }}>
          <View style={{ flex: 1 }}>
            <ActionButton testID="button-onboarding-back" title="Назад" secondary disabled={questionId === 31 || updateProgress.isPending} onPress={() => void act("back")} />
          </View>
          <View style={{ flex: 1.5 }}>
            <ActionButton
              title={revealed ? "Продолжить" : "Показать ответ"}
              testID={revealed ? "button-onboarding-continue" : "button-onboarding-reveal"}
              disabled={updateProgress.isPending}
              onPress={() => void act(revealed ? "continue" : "reveal")}
            />
          </View>
        </View>
      </View>
      <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 18, textAlign: "center", marginTop: 16 }}>
        Ответы на вопросы не создают сделки и не изменяют баланс.
      </Text>
    </ScreenFrame>
  );
}

export default function Onboarding() {
  return <OnboardingScreen />;
}
