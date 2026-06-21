import { getBaseUrl } from "@/lib/api";
import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useCitizen } from "@/context/CitizenContext";
import { LogoBrand } from "@/components/LogoBrand";

const BASE_URL = getBaseUrl();

// ── World clock zones ─────────────────────────────────────────────────────────

const ZONES = [
  { label: "TimeNation", city: "Фамагуста", tz: "Asia/Nicosia", flag: "🇨🇾" },
  { label: "Moscow", city: "Москва", tz: "Europe/Moscow", flag: "🇷🇺" },
  { label: "Dubai", city: "Дубай", tz: "Asia/Dubai", flag: "🇦🇪" },
  { label: "Tokyo", city: "Токио", tz: "Asia/Tokyo", flag: "🇯🇵" },
  { label: "New York", city: "Нью-Йорк", tz: "America/New_York", flag: "🇺🇸" },
] as const;

function getTimeInZone(tz: string): { time: string; date: string; offset: string } {
  const now = new Date();
  const time = new Intl.DateTimeFormat("ru-RU", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(now);
  const date = new Intl.DateTimeFormat("ru-RU", {
    timeZone: tz,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(now);
  // Offset label
  const offsetMs = new Date(now.toLocaleString("en-US", { timeZone: tz })).getTime()
    - new Date(now.toLocaleString("en-US", { timeZone: "UTC" })).getTime();
  const offsetH = offsetMs / 3600000;
  const sign = offsetH >= 0 ? "+" : "";
  const offset = `UTC${sign}${offsetH % 1 === 0 ? offsetH : offsetH.toFixed(1)}`;
  return { time, date, offset };
}

// ── Pomodoro presets ──────────────────────────────────────────────────────────

const PRESETS = [
  { label: "25 мин", seconds: 25 * 60 },
  { label: "50 мин", seconds: 50 * 60 },
  { label: "90 мин", seconds: 90 * 60 },
];

// ── Alarm days ────────────────────────────────────────────────────────────────

const DAYS = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

// ── Main screen ───────────────────────────────────────────────────────────────

export default function TimeUtilsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { citizen } = useCitizen();
  const st = styles(colors);

  // ── Section toggle ──────────────────────────────────────────────────────────
  const [section, setSection] = useState<"clock" | "timer" | "alarm">("clock");

  // ── World clock ─────────────────────────────────────────────────────────────
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // ── Pomodoro timer ──────────────────────────────────────────────────────────
  const [preset, setPreset] = useState(0);
  const [remaining, setRemaining] = useState(PRESETS[0]!.seconds);
  const [running, setRunning] = useState(false);
  const [completed, setCompleted] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionDurationRef = useRef(PRESETS[0]!.seconds);

  const stopInterval = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const handleTimerComplete = useCallback(async () => {
    stopInterval();
    setRunning(false);
    setCompleted(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    // Log focus session to backend
    if (citizen?.id) {
      try {
        await fetch(`${BASE_URL}/api/citizens/log-focus`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            citizenId: citizen.id,
            durationMinutes: Math.round(sessionDurationRef.current / 60),
          }),
        });
      } catch { /* silent — offline is fine */ }
    }
    Alert.alert(
      "⏱ Фокус-сессия завершена!",
      `Ты инвестировал ${Math.round(sessionDurationRef.current / 60)} минут концентрации. ИИ-Аудитор зачислит их в профиль активности.`,
      [{ text: "Отлично!", onPress: () => setCompleted(false) }]
    );
  }, [citizen?.id, stopInterval]);

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setRemaining((r) => {
          if (r <= 1) {
            handleTimerComplete();
            return 0;
          }
          return r - 1;
        });
      }, 1000);
    } else {
      stopInterval();
    }
    return stopInterval;
  }, [running, handleTimerComplete, stopInterval]);

  const handlePreset = (i: number) => {
    stopInterval();
    setRunning(false);
    setCompleted(false);
    setPreset(i);
    setRemaining(PRESETS[i]!.seconds);
    sessionDurationRef.current = PRESETS[i]!.seconds;
  };

  const handleStartPause = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setRunning((r) => !r);
  };

  const handleReset = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    stopInterval();
    setRunning(false);
    setCompleted(false);
    setRemaining(PRESETS[preset]!.seconds);
  };

  const timerMinutes = Math.floor(remaining / 60);
  const timerSeconds = remaining % 60;
  const progress = remaining / PRESETS[preset]!.seconds;

  // ── Alarm ───────────────────────────────────────────────────────────────────
  const [alarmHour, setAlarmHour] = useState(7);
  const [alarmMinute, setAlarmMinute] = useState(0);
  const [alarmDays, setAlarmDays] = useState<Set<number>>(new Set([1, 2, 3, 4, 5]));
  const [alarmActive, setAlarmActive] = useState(false);
  const alarmRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const toggleDay = (d: number) => {
    setAlarmDays((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d); else next.add(d);
      return next;
    });
  };

  // Check alarm every 30s
  useEffect(() => {
    if (!alarmActive) return;
    const check = () => {
      const now = new Date();
      const nowInNicosia = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Nicosia",
        hour: "numeric", minute: "numeric", weekday: "short", hour12: false,
      }).formatToParts(now);
      const h = parseInt(nowInNicosia.find((p) => p.type === "hour")?.value ?? "0", 10);
      const m = parseInt(nowInNicosia.find((p) => p.type === "minute")?.value ?? "0", 10);
      const dayStr = nowInNicosia.find((p) => p.type === "weekday")?.value ?? "";
      const dayIdx = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(dayStr);
      if (h === alarmHour && m === alarmMinute && alarmDays.has(dayIdx)) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        Alert.alert(
          "⏰ Суверенный Будильник",
          `Доброе утро, ${citizen?.name ?? "Гражданин"}! Время ${String(alarmHour).padStart(2, "0")}:${String(alarmMinute).padStart(2, "0")} по TimeNation (Фамагуста).`,
          [{ text: "Проснуться в TimeNation 🌅" }]
        );
      }
    };
    alarmRef.current = setInterval(check, 30000);
    return () => { if (alarmRef.current) clearInterval(alarmRef.current); };
  }, [alarmActive, alarmHour, alarmMinute, alarmDays, citizen?.name]);

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[st.root, { paddingTop: topPad }]}>
      {/* Header */}
      <View style={st.header}>
        <LogoBrand size={28} />
        <Text style={st.headerTitle}>Время</Text>
        <View style={{ width: 28 }} />
      </View>

      {/* Section tabs */}
      <View style={st.sectionRow}>
        {(["clock", "timer", "alarm"] as const).map((s) => (
          <TouchableOpacity
            key={s}
            style={[st.sectionBtn, section === s && st.sectionBtnActive]}
            onPress={() => { Haptics.selectionAsync(); setSection(s); }}
          >
            <Feather
              name={s === "clock" ? "globe" : s === "timer" ? "clock" : "bell"}
              size={14}
              color={section === s ? colors.primaryForeground : colors.mutedForeground}
            />
            <Text style={[st.sectionBtnText, section === s && st.sectionBtnTextActive]}>
              {s === "clock" ? "Часовые пояса" : s === "timer" ? "Таймер" : "Будильник"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={st.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* ── World Clock ── */}
        {section === "clock" && (
          <View style={st.section}>
            <Text style={st.sectionTitle}>🌍 Мировые часы</Text>
            <Text style={st.sectionSub}>Суверенное время TimeNation — Фамагуста, Кипр</Text>
            {ZONES.map((z) => {
              const { time, date, offset } = getTimeInZone(z.tz);
              const isMain = z.label === "TimeNation";
              return (
                <View key={z.label} style={[st.clockCard, isMain && st.clockCardMain]}>
                  <View style={st.clockLeft}>
                    <Text style={st.clockFlag}>{z.flag}</Text>
                    <View>
                      <Text style={[st.clockCity, isMain && st.clockCityMain]}>{z.city}</Text>
                      <Text style={st.clockOffset}>{offset}</Text>
                    </View>
                  </View>
                  <View style={st.clockRight}>
                    <Text style={[st.clockTime, isMain && st.clockTimeMain]}>{time}</Text>
                    <Text style={st.clockDate}>{date}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* ── Pomodoro Timer ── */}
        {section === "timer" && (
          <View style={st.section}>
            <Text style={st.sectionTitle}>⏱ Таймер фокусировки</Text>
            <Text style={st.sectionSub}>Завершённая сессия засчитывается ИИ-Аудитором</Text>

            {/* Preset buttons */}
            <View style={st.presetRow}>
              {PRESETS.map((p, i) => (
                <TouchableOpacity
                  key={i}
                  style={[st.presetBtn, preset === i && st.presetBtnActive]}
                  onPress={() => handlePreset(i)}
                >
                  <Text style={[st.presetBtnText, preset === i && st.presetBtnTextActive]}>
                    {p.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Circular-style timer display */}
            <View style={st.timerDisplay}>
              {/* Progress ring via border trick */}
              <View style={[st.timerRing, running && st.timerRingActive]}>
                <Text style={[st.timerDigits, completed && st.timerDigitsComplete]}>
                  {String(timerMinutes).padStart(2, "0")}:{String(timerSeconds).padStart(2, "0")}
                </Text>
                <Text style={st.timerLabel}>
                  {completed ? "Сессия завершена!" : running ? "Фокусируйся…" : "Готов к старту"}
                </Text>
              </View>

              {/* Progress bar */}
              <View style={st.progressBar}>
                <View style={[st.progressFill, { width: `${(1 - progress) * 100}%` as `${number}%` }]} />
              </View>
            </View>

            {/* Controls */}
            <View style={st.timerControls}>
              <TouchableOpacity style={st.controlBtnSecondary} onPress={handleReset}>
                <Feather name="rotate-ccw" size={20} color={colors.mutedForeground} />
                <Text style={st.controlBtnSecondaryText}>Сброс</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[st.controlBtnPrimary, running && st.controlBtnPause]}
                onPress={handleStartPause}
              >
                <Feather name={running ? "pause" : "play"} size={22} color={colors.primaryForeground} />
                <Text style={st.controlBtnPrimaryText}>{running ? "Пауза" : "Старт"}</Text>
              </TouchableOpacity>
            </View>

            {/* Info box */}
            <View style={st.infoBox}>
              <Feather name="info" size={14} color={colors.mutedForeground} />
              <Text style={st.infoText}>
                При завершении таймер отправит отчёт в профиль — ИИ-Аудитор учтёт минуты концентрации при оценке производительности.
              </Text>
            </View>
          </View>
        )}

        {/* ── Alarm ── */}
        {section === "alarm" && (
          <View style={st.section}>
            <Text style={st.sectionTitle}>⏰ Суверенный будильник</Text>
            <Text style={st.sectionSub}>Работает по времени Фамагусты (Asia/Nicosia)</Text>

            {/* Time picker */}
            <View style={st.alarmTimeRow}>
              {/* Hour */}
              <View style={st.alarmSpinner}>
                <TouchableOpacity onPress={() => setAlarmHour((h) => (h + 1) % 24)} hitSlop={8}>
                  <Feather name="chevron-up" size={22} color={colors.primary} />
                </TouchableOpacity>
                <Text style={st.alarmTimeDigit}>{String(alarmHour).padStart(2, "0")}</Text>
                <TouchableOpacity onPress={() => setAlarmHour((h) => (h + 23) % 24)} hitSlop={8}>
                  <Feather name="chevron-down" size={22} color={colors.primary} />
                </TouchableOpacity>
              </View>
              <Text style={st.alarmSep}>:</Text>
              {/* Minute */}
              <View style={st.alarmSpinner}>
                <TouchableOpacity onPress={() => setAlarmMinute((m) => (m + 1) % 60)} hitSlop={8}>
                  <Feather name="chevron-up" size={22} color={colors.primary} />
                </TouchableOpacity>
                <Text style={st.alarmTimeDigit}>{String(alarmMinute).padStart(2, "0")}</Text>
                <TouchableOpacity onPress={() => setAlarmMinute((m) => (m + 59) % 60)} hitSlop={8}>
                  <Feather name="chevron-down" size={22} color={colors.primary} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Day toggles */}
            <Text style={[st.fieldLabel, { color: colors.mutedForeground, marginBottom: 8 }]}>
              Дни недели
            </Text>
            <View style={st.daysRow}>
              {DAYS.map((d, i) => (
                <TouchableOpacity
                  key={i}
                  style={[st.dayBtn, alarmDays.has(i) && st.dayBtnActive]}
                  onPress={() => { Haptics.selectionAsync(); toggleDay(i); }}
                >
                  <Text style={[st.dayBtnText, alarmDays.has(i) && st.dayBtnTextActive]}>{d}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Activate */}
            <TouchableOpacity
              style={[st.alarmToggleBtn, alarmActive && st.alarmToggleBtnActive]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                setAlarmActive((a) => {
                  if (!a) {
                    Alert.alert(
                      "Будильник активирован",
                      `Сработает в ${String(alarmHour).padStart(2, "0")}:${String(alarmMinute).padStart(2, "0")} по времени Фамагусты. Приложение должно оставаться открытым.`
                    );
                  }
                  return !a;
                });
              }}
            >
              <Feather name={alarmActive ? "bell-off" : "bell"} size={18} color={alarmActive ? colors.primaryForeground : colors.mutedForeground} />
              <Text style={[st.alarmToggleBtnText, alarmActive && st.alarmToggleBtnTextActive]}>
                {alarmActive ? "Будильник активен — выключить" : "Включить будильник"}
              </Text>
            </TouchableOpacity>

            {alarmActive && (
              <View style={[st.alarmActiveCard, { backgroundColor: colors.primary + "18", borderColor: colors.primary + "44" }]}>
                <Feather name="bell" size={16} color={colors.primary} />
                <Text style={[st.alarmActiveText, { color: colors.primary }]}>
                  Сработает в {String(alarmHour).padStart(2, "0")}:{String(alarmMinute).padStart(2, "0")} по Фамагусте
                  {alarmDays.size < 7 ? ` · ${[...alarmDays].sort().map((d) => DAYS[d]).join(", ")}` : " · каждый день"}
                </Text>
              </View>
            )}

            <View style={st.infoBox}>
              <Feather name="info" size={14} color={colors.mutedForeground} />
              <Text style={st.infoText}>
                Будильник работает пока приложение открыто. При срабатывании — вибрация и уведомление на экране.
              </Text>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function styles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingBottom: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    headerTitle: { fontSize: 17, fontWeight: "700", color: colors.foreground },

    sectionRow: {
      flexDirection: "row",
      paddingHorizontal: 12,
      paddingVertical: 10,
      gap: 8,
    },
    sectionBtn: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 5,
      paddingVertical: 8,
      borderRadius: 10,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
    },
    sectionBtnActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    sectionBtnText: { fontSize: 11, fontWeight: "600", color: colors.mutedForeground },
    sectionBtnTextActive: { color: colors.primaryForeground },

    scroll: { padding: 16, paddingBottom: 120 },
    section: { gap: 12 },
    sectionTitle: { fontSize: 18, fontWeight: "700", color: colors.foreground },
    sectionSub: { fontSize: 13, color: colors.mutedForeground, marginTop: -6 },

    // Clock
    clockCard: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      backgroundColor: colors.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    clockCardMain: {
      backgroundColor: colors.primary + "18",
      borderColor: colors.primary + "66",
    },
    clockLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
    clockFlag: { fontSize: 26 },
    clockCity: { fontSize: 15, fontWeight: "600", color: colors.foreground },
    clockCityMain: { color: colors.primary },
    clockOffset: { fontSize: 12, color: colors.mutedForeground, marginTop: 2 },
    clockRight: { alignItems: "flex-end" },
    clockTime: { fontSize: 22, fontWeight: "700", color: colors.foreground, fontVariant: ["tabular-nums"] },
    clockTimeMain: { color: colors.primary },
    clockDate: { fontSize: 12, color: colors.mutedForeground, marginTop: 2 },

    // Timer
    presetRow: { flexDirection: "row", gap: 8 },
    presetBtn: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 10,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
    },
    presetBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    presetBtnText: { fontSize: 13, fontWeight: "600", color: colors.mutedForeground },
    presetBtnTextActive: { color: colors.primaryForeground },

    timerDisplay: { alignItems: "center", gap: 20, marginVertical: 8 },
    timerRing: {
      width: 200,
      height: 200,
      borderRadius: 100,
      backgroundColor: colors.card,
      borderWidth: 6,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
    },
    timerRingActive: { borderColor: colors.primary, shadowColor: colors.primary, shadowOpacity: 0.4, shadowRadius: 16, shadowOffset: { width: 0, height: 0 } },
    timerDigits: { fontSize: 44, fontWeight: "800", color: colors.foreground, fontVariant: ["tabular-nums"] },
    timerDigitsComplete: { color: colors.primary },
    timerLabel: { fontSize: 12, color: colors.mutedForeground, fontWeight: "500" },

    progressBar: {
      width: "100%",
      height: 4,
      backgroundColor: colors.border,
      borderRadius: 4,
      overflow: "hidden",
    },
    progressFill: {
      height: "100%",
      backgroundColor: colors.primary,
      borderRadius: 4,
    },

    timerControls: { flexDirection: "row", gap: 12, justifyContent: "center" },
    controlBtnSecondary: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 20,
      paddingVertical: 14,
      borderRadius: 14,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
    },
    controlBtnSecondaryText: { fontSize: 15, fontWeight: "600", color: colors.mutedForeground },
    controlBtnPrimary: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingVertical: 16,
      borderRadius: 14,
      backgroundColor: colors.primary,
    },
    controlBtnPause: { backgroundColor: colors.surface },
    controlBtnPrimaryText: { fontSize: 16, fontWeight: "700", color: colors.primaryForeground },

    infoBox: {
      flexDirection: "row",
      gap: 8,
      padding: 12,
      backgroundColor: colors.muted,
      borderRadius: 10,
      alignItems: "flex-start",
    },
    infoText: { flex: 1, fontSize: 12, color: colors.mutedForeground, lineHeight: 18 },

    // Alarm
    alarmTimeRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      marginVertical: 8,
    },
    alarmSpinner: {
      alignItems: "center",
      backgroundColor: colors.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: 12,
      paddingHorizontal: 24,
      gap: 8,
    },
    alarmTimeDigit: {
      fontSize: 48,
      fontWeight: "800",
      color: colors.primary,
      fontVariant: ["tabular-nums"],
    },
    alarmSep: { fontSize: 48, fontWeight: "800", color: colors.primary, marginBottom: 8 },
    fieldLabel: { fontSize: 13, fontWeight: "600" },

    daysRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
    dayBtn: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
    },
    dayBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    dayBtnText: { fontSize: 12, fontWeight: "600", color: colors.mutedForeground },
    dayBtnTextActive: { color: colors.primaryForeground },

    alarmToggleBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      paddingVertical: 16,
      borderRadius: 14,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
    },
    alarmToggleBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    alarmToggleBtnText: { fontSize: 15, fontWeight: "600", color: colors.mutedForeground },
    alarmToggleBtnTextActive: { color: colors.primaryForeground },

    alarmActiveCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      padding: 12,
      borderRadius: 10,
      borderWidth: 1,
    },
    alarmActiveText: { flex: 1, fontSize: 13, fontWeight: "600" },
  });
}
