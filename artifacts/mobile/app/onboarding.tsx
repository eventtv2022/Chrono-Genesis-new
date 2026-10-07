import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Platform, ScrollView, Text, TouchableOpacity, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import {
  getGetOnboardingStatusQueryKey,
  useGetOnboardingStatus,
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

const GUIDE_KEY = "timenation_preapplication_guide_v1";

function PreApplicationGuide() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [loaded, setLoaded] = useState(false);
  const quest = ONBOARDING_QUESTS[index];
  const selected = answers[index];
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  useEffect(() => {
    let active = true;
    AsyncStorage.multiGet([`${GUIDE_KEY}_answers`, `${GUIDE_KEY}_step`])
      .then((entries) => {
        if (!active) return;
        const savedAnswers = entries[0]?.[1];
        const savedStep = entries[1]?.[1];
        if (savedAnswers) {
          try { setAnswers(JSON.parse(savedAnswers) as Record<number, number>); } catch {}
        }
        if (savedStep) {
          const numericStep = Number(savedStep);
          if (Number.isFinite(numericStep)) setIndex(Math.min(ONBOARDING_QUESTS.length - 1, Math.max(0, numericStep)));
        }
      })
      .catch(() => {})
      .finally(() => { if (active) setLoaded(true); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.multiSet([
      [`${GUIDE_KEY}_answers`, JSON.stringify(answers)],
      [`${GUIDE_KEY}_step`, String(index)],
    ]).catch(() => {});
  }, [answers, index, loaded]);

  function finishGuide() {
    AsyncStorage.setItem(GUIDE_KEY, "complete")
      .then(() => router.replace("/register"))
      .catch(() => Alert.alert(
        "Не удалось сохранить прогресс",
        "Включите хранилище приложения и повторите попытку.",
      ));
  }

  if (!loaded) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingTop: topInset + 12, paddingBottom: bottomInset + 28, paddingHorizontal: 20 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={{ maxWidth: 620, width: "100%", alignSelf: "center" }}>
        <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold", fontSize: 11, letterSpacing: 2 }}>TIMENATION · ПЕРЕД ЗАЯВЛЕНИЕМ</Text>
        <Text style={{ color: colors.foreground, fontFamily: "Inter_700Bold", fontSize: 28, marginTop: 10 }}>Короткое интерактивное знакомство</Text>
        <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 14, lineHeight: 21, marginTop: 8 }}>
          Изучите основные разделы приложения. Часовой срок начнётся только после отправки заявления.
        </Text>

        <View style={{ borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, borderRadius: 16, padding: 17, marginTop: 21 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
            <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_600SemiBold", fontSize: 11 }}>ЗНАКОМСТВО · {index + 1}/{ONBOARDING_QUESTS.length}</Text>
            <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold", fontSize: 11 }}>{Math.floor(Object.keys(answers).length / ONBOARDING_QUESTS.length * 100)}%</Text>
          </View>
          <View style={{ height: 6, backgroundColor: colors.surface, borderRadius: 6, overflow: "hidden", marginTop: 12 }}>
            <View style={{ width: `${Object.keys(answers).length / ONBOARDING_QUESTS.length * 100}%`, height: 6, backgroundColor: colors.primary }} />
          </View>
        </View>

        <View style={{ borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, borderRadius: 16, padding: 18, marginTop: 14 }}>
          <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold", fontSize: 11, letterSpacing: 1.1 }}>{moduleName(index).toUpperCase()}</Text>
          <Text style={{ color: colors.foreground, fontFamily: "Inter_700Bold", fontSize: 23, marginTop: 12 }}>{quest.title}</Text>
          <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 15, lineHeight: 22, marginTop: 9 }}>{quest.prompt}</Text>
          <View style={{ gap: 9, marginTop: 18 }}>
            {quest.choices.map((option, choiceIndex) => (
              <TouchableOpacity
                key={option}
                onPress={() => setAnswers((current) => ({ ...current, [index]: choiceIndex }))}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityState={{ selected: selected === choiceIndex }}
                testID={`button-guide-choice-${choiceIndex}`}
                style={{
                  minHeight: 48, borderRadius: 11, borderWidth: 1,
                  borderColor: selected === choiceIndex ? colors.primary : colors.border,
                  backgroundColor: selected === choiceIndex ? colors.goldGlow : colors.surface,
                  paddingHorizontal: 13, paddingVertical: 12,
                  flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                }}
              >
                <Text style={{ flex: 1, color: colors.foreground, fontFamily: "Inter_500Medium", fontSize: 13, lineHeight: 19 }}>{option}</Text>
                {selected === choiceIndex && <Feather name="check" size={17} color={colors.primary} style={{ marginLeft: 9 }} />}
              </TouchableOpacity>
            ))}
          </View>
          {selected !== undefined && (
            <View style={{ marginTop: 14, padding: 13, borderRadius: 10, backgroundColor: colors.success + "18" }}>
              <Text style={{ color: colors.success, fontFamily: "Inter_600SemiBold", fontSize: 12 }}>Важно</Text>
              <Text style={{ color: colors.foreground, fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 20, marginTop: 4 }}>{quest.takeaway}</Text>
            </View>
          )}
          <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10, marginTop: 19 }}>
            <TouchableOpacity
              disabled={index === 0}
              onPress={() => setIndex((current) => Math.max(0, current - 1))}
              style={{ minHeight: 46, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 13, opacity: index === 0 ? 0.35 : 1 }}
            >
              <Feather name="arrow-left" size={17} color={colors.foreground} />
              <Text style={{ color: colors.foreground, fontFamily: "Inter_500Medium" }}>Назад</Text>
            </TouchableOpacity>
            <TouchableOpacity
              disabled={selected === undefined}
              onPress={() => index < ONBOARDING_QUESTS.length - 1
                ? setIndex((current) => current + 1)
                : finishGuide()}
              style={{ minHeight: 46, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 11, backgroundColor: colors.primary, paddingHorizontal: 16, opacity: selected === undefined ? 0.45 : 1 }}
              testID="button-guide-continue"
            >
              <Text style={{ color: colors.primaryForeground, fontFamily: "Inter_700Bold", fontSize: 13 }}>
                {index < ONBOARDING_QUESTS.length - 1 ? "Продолжить" : "Перейти к заявлению"}
              </Text>
              <Feather name="arrow-right" size={16} color={colors.primaryForeground} />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </ScrollView>
  );
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
    query: { enabled: !!citizen && !!authToken, queryKey, refetchInterval: 5_000 },
    request: { headers: authHeaders },
  });
  const [now, setNow] = useState(Date.now());
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [answersLoaded, setAnswersLoaded] = useState(false);
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
    if (status.data?.registrationStatus !== "issued" || !citizen) return;
    setCitizen({
      ...citizen,
      registrationStatus: "issued",
      status: "active",
      balanceMinutes: status.data.balanceMinutes,
      onboardingCompleted: true,
    });
    void queryClient.invalidateQueries({ queryKey: ["citizens"] });
    router.replace("/");
  }, [status.data?.registrationStatus, status.data?.balanceMinutes, citizen, setCitizen, queryClient, router]);

  const remainingSeconds = status.data
    ? Math.max(0, status.data.secondsRemaining - Math.floor((now - status.dataUpdatedAt) / 1000))
    : 3540;
  const durationSeconds = status.data?.durationSeconds ?? 3540;
  const elapsedSeconds = Math.max(0, durationSeconds - remainingSeconds);
  const stepDuration = durationSeconds / ONBOARDING_QUESTS.length;
  const questIndex = Math.min(ONBOARDING_QUESTS.length - 1, Math.floor(elapsedSeconds / stepDuration));
  const quest = ONBOARDING_QUESTS[questIndex];
  const progress = Math.min(100, (elapsedSeconds / durationSeconds) * 100);
  const selected = answers[questIndex];
  const secondsUntilEligibility = status.data
    ? Math.max(0, status.data.secondsUntilEligibility - Math.floor((now - status.dataUpdatedAt) / 1000))
    : 0;
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  if (!citizen) {
    return <PreApplicationGuide />;
  }

  if (status.data?.registrationStatus === "rejected") {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center", padding: 28 }}>
        <Feather name="alert-circle" size={34} color={colors.destructive} />
        <Text style={{ color: colors.foreground, fontFamily: "Inter_700Bold", fontSize: 26, textAlign: "center", marginTop: 18 }}>Заявление требует исправлений</Text>
        <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 14, lineHeight: 21, textAlign: "center", marginTop: 10 }}>Проверьте данные и подайте заявление повторно.</Text>
        <TouchableOpacity onPress={() => router.replace("/register")} style={{ marginTop: 22, backgroundColor: colors.primary, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 14 }}>
          <Text style={{ color: colors.primaryForeground, fontFamily: "Inter_700Bold" }}>Открыть заявление</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (status.data?.completed && status.data.registrationStatus === "pending") {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center", paddingHorizontal: 28, paddingTop: topInset, paddingBottom: bottomInset }}>
        <View style={{ width: 88, height: 88, borderRadius: 44, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.goldGlow, alignItems: "center", justifyContent: "center" }}>
          <Feather name="check" size={40} color={colors.primary} />
        </View>
        <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold", fontSize: 12, letterSpacing: 2, marginTop: 25 }}>TIMENATION · ФИНАЛ СИМУЛЯЦИИ</Text>
        <Text style={{ color: colors.foreground, fontFamily: "Inter_700Bold", fontSize: 29, textAlign: "center", marginTop: 13 }}>Симуляция завершена</Text>
        <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 15, lineHeight: 23, textAlign: "center", marginTop: 13 }}>
          Заявление ожидает установленного срока. Паспорт и родовая минута будут выданы, когда наступит eligibility.
        </Text>
        <View style={{ borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, borderRadius: 16, padding: 18, alignItems: "center", marginTop: 22 }}>
          <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_600SemiBold", fontSize: 11 }}>ДО ПРАВА НА ВЫДАЧУ</Text>
          <Text testID="text-eligibility-countdown" style={{ color: colors.primary, fontFamily: "Inter_700Bold", fontSize: 30, marginTop: 8, fontVariant: ["tabular-nums"] }}>{formatClock(secondsUntilEligibility)}</Text>
        </View>
        <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 12, textAlign: "center", marginTop: 15 }}>Статус проверяется автоматически. Эта страница обновится при выдаче паспорта.</Text>
      </View>
    );
  }

  if (status.isLoading || !status.data || !status.data.startedAt) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center", padding: 28 }}>
        <ActivityIndicator color={colors.primary} />
        <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginTop: 14, textAlign: "center" }}>
          {status.isError ? "Не удалось загрузить симуляцию. Проверьте соединение." : "Подключаем симуляцию…"}
        </Text>
      </View>
    );
  }

  const secondsToNextStep = Math.ceil(stepDuration - (elapsedSeconds % stepDuration));

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingTop: topInset + 12, paddingBottom: bottomInset + 28, paddingHorizontal: 20 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={{ maxWidth: 620, width: "100%", alignSelf: "center" }}>
        <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold", fontSize: 11, letterSpacing: 2 }}>TIMENATION · СИМУЛЯЦИЯ ЗАЯВЛЕНИЯ</Text>
        <Text style={{ color: colors.foreground, fontFamily: "Inter_700Bold", fontSize: 27, marginTop: 7 }}>Финал за минуту до выдачи паспорта</Text>
        <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 14, lineHeight: 21, marginTop: 8 }}>
          Отсчёт привязан к сроку eligibility, записанному при подаче заявления.
        </Text>

        <View style={{ borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, borderRadius: 16, padding: 17, marginTop: 21 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_600SemiBold", fontSize: 11 }}>ДО ФИНАЛА</Text>
            <Text style={{ color: colors.primary, fontFamily: "Inter_700Bold", fontSize: 25, fontVariant: ["tabular-nums"] }}>{formatClock(remainingSeconds)}</Text>
          </View>
          <View style={{ height: 6, backgroundColor: colors.surface, borderRadius: 6, overflow: "hidden", marginTop: 14 }}>
            <View style={{ width: `${progress}%`, height: 6, backgroundColor: colors.primary, borderRadius: 6 }} />
          </View>
          <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 11, marginTop: 9 }}>
            Симуляция · {Math.floor(progress)}% · выдача в срок из заявления
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
            $1 DarMin = 1 минута. Следующий этап через {formatClock(secondsToNextStep)}. Отсчёт продолжится, даже если закрыть приложение.
          </Text>
        </View>

      </View>
    </ScrollView>
  );
}
