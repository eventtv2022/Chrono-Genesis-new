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
import * as Notifications from "expo-notifications";
import { Audio } from "expo-av";
import { useColors } from "@/hooks/useColors";
import { useCitizen } from "@/context/CitizenContext";
import { useLanguage } from "@/context/LanguageContext";
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

function getTimeInZone(tz: string, lang: string): { time: string; date: string; offset: string } {
  const now = new Date();
  const time = new Intl.DateTimeFormat(lang, {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(now);
  const date = new Intl.DateTimeFormat(lang, {
    timeZone: tz,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(now);
  const offsetMs = new Date(now.toLocaleString("en-US", { timeZone: tz })).getTime()
    - new Date(now.toLocaleString("en-US", { timeZone: "UTC" })).getTime();
  const offsetH = offsetMs / 3600000;
  const sign = offsetH >= 0 ? "+" : "";
  const offset = `UTC${sign}${offsetH % 1 === 0 ? offsetH : offsetH.toFixed(1)}`;
  return { time, date, offset };
}

// ── Pomodoro preset seconds (labels computed inside component) ────────────────

const PRESET_SECONDS_CONST = [12, 24, 25, 36, 48, 50, 60, 90];

// ── Alarm days (computed inside component via Intl) ───────────────────────────

function getDayNames(lang: string): string[] {
  // Build Sun→Sat short names using a known Sunday (2021-01-03)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(2021, 0, 3 + i); // 2021-01-03 is Sunday
    return new Intl.DateTimeFormat(lang, { weekday: "narrow" }).format(d);
  });
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function TimeUtilsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { citizen } = useCitizen();
  const { t, lang } = useLanguage();
  const st = styles(colors);
  const DAYS = getDayNames(lang);
  const PRESET_SECONDS = [12, 24, 25, 36, 48, 50, 60, 90].map((m) => ({ label: `${m}m`, seconds: m * 60 }));

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
  const [remaining, setRemaining] = useState(PRESET_SECONDS_CONST[0]! * 60);
  const [running, setRunning] = useState(false);
  const [completed, setCompleted] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionDurationRef = useRef(PRESET_SECONDS_CONST[0]! * 60);

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
      t.time_session_done,
      `${Math.round(sessionDurationRef.current / 60)} min · ${t.time_pomodoro}`,
      [{ text: "OK", onPress: () => setCompleted(false) }]
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
    setRemaining(PRESET_SECONDS_CONST[i]! * 60);
    sessionDurationRef.current = PRESET_SECONDS_CONST[i]! * 60;
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
    setRemaining(PRESET_SECONDS_CONST[preset]! * 60);
  };

  const timerMinutes = Math.floor(remaining / 60);
  const timerSeconds = remaining % 60;
  const progress = remaining / (PRESET_SECONDS_CONST[preset]! * 60);

  // ── Alarm ───────────────────────────────────────────────────────────────────
  const [alarmHour, setAlarmHour] = useState(7);
  const [alarmMinute, setAlarmMinute] = useState(0);
  const [alarmDays, setAlarmDays] = useState<Set<number>>(new Set([0, 1, 2, 3, 4, 5, 6]));
  const [alarmActive, setAlarmActive] = useState(false);
  const [alarmFiring, setAlarmFiring] = useState(false);
  // Web-only fallback refs (native uses scheduled system notifications)
  const alarmRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastFiredKey = useRef<string>("");
  // expo-av Sound ref
  const soundRef = useRef<Audio.Sound | null>(null);

  // ── Load alarm sound once ──────────────────────────────────────────────────
  useEffect(() => {
    void Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
    });
  }, []);

  const playAlarmSound = useCallback(async () => {
    try {
      if (soundRef.current) {
        await soundRef.current.stopAsync().catch(() => {});
        await soundRef.current.unloadAsync().catch(() => {});
        soundRef.current = null;
      }
      const { sound } = await Audio.Sound.createAsync(
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require("../../assets/alarm.mp3"),
        { shouldPlay: true, isLooping: true, volume: 1.0 }
      );
      soundRef.current = sound;
    } catch { /* file might not exist on web fallback */ }
  }, []);

  const stopAlarmSound = useCallback(async () => {
    if (soundRef.current) {
      await soundRef.current.stopAsync().catch(() => {});
      await soundRef.current.unloadAsync().catch(() => {});
      soundRef.current = null;
    }
  }, []);

  const dismissAlarm = useCallback(() => {
    setAlarmFiring(false);
    void stopAlarmSound();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [stopAlarmSound]);

  const toggleDay = (d: number) => {
    setAlarmDays((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d); else next.add(d);
      return next;
    });
  };

  // ── Notification setup (native only) ────────────────────────────────────────
  useEffect(() => {
    if (Platform.OS === "web") return;

    // Show banner + play sound even when app is foregrounded
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });

    const setup = async () => {
      // Android: high-priority alarm channel with vibration
      if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync("tn-alarm", {
          name: "Суверенный Будильник",
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 300, 200, 300],
          lightColor: "#C9A84C",
          enableVibrate: true,
          showBadge: false,
        });
      }
      // Request permission — will prompt the user once
      const perms = await Notifications.requestPermissionsAsync();
      const permStatus = (perms as unknown as { status?: string }).status;
      if (permStatus !== "granted") {
        Alert.alert(
          `⛔ ${t.time_alarm_tab}`,
          t.time_alarm,
          [{ text: "OK" }]
        );
      }
    };
    void setup();
  }, []);

  // ── Schedule / cancel system notifications (native) ─────────────────────────
  const syncScheduledAlarms = useCallback(async () => {
    if (Platform.OS === "web") return;

    // Cancel all previously scheduled alarm notifications
    const existing = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      existing
        .filter((n) => n.identifier.startsWith("tn-alarm-"))
        .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier))
    );

    if (!alarmActive || alarmDays.size === 0) return;

    const HH = String(alarmHour).padStart(2, "0");
    const MM = String(alarmMinute).padStart(2, "0");

    // Schedule one weekly notification per selected day
    // JS getDay(): 0=Sun…6=Sat → Expo weekday: 1=Sun…7=Sat
    await Promise.all(
      Array.from(alarmDays).map((jsDay) =>
        Notifications.scheduleNotificationAsync({
          identifier: `tn-alarm-day-${jsDay}`,
          content: {
            title: `⏰ ${t.time_alarm}`,
            body: `${HH}:${MM} · ${citizen?.name ?? "TimeNation"}`,
            sound: true,
            data: { type: "tn-alarm" },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
            weekday: jsDay + 1,  // 0+1=1(Sun) … 6+1=7(Sat)
            hour: alarmHour,
            minute: alarmMinute,
            repeats: true,
          } as Notifications.WeeklyTriggerInput,
        })
      )
    );
  }, [alarmActive, alarmHour, alarmMinute, alarmDays, citizen?.name]);

  useEffect(() => {
    if (Platform.OS !== "web") {
      void syncScheduledAlarms();
      return;
    }

    // ── Web fallback: polling every 10 s ──────────────────────────────────────
    if (!alarmActive) return;

    /** Returns {h, m, weekday} in Asia/Nicosia — robust across all platforms. */
    const getNicosiaHMS = (): { h: number; m: number; weekday: number } => {
      const now = new Date();
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Nicosia",
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", hour12: false,
      }).formatToParts(now);
      const get = (t: string) => parseInt(parts.find((p) => p.type === t)?.value ?? "0", 10);
      let h = get("hour");
      if (h === 24) h = 0;
      const weekday = new Date(get("year"), get("month") - 1, get("day")).getDay();
      return { h, m: get("minute"), weekday };
    };

    const check = () => {
      const { h, m, weekday } = getNicosiaHMS();
      const fireKey = `${h}:${m}:${weekday}`;
      if (h === alarmHour && m === alarmMinute && alarmDays.has(weekday) && lastFiredKey.current !== fireKey) {
        lastFiredKey.current = fireKey;
        setAlarmFiring(true);
        void playAlarmSound();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }
    };
    check();
    alarmRef.current = setInterval(check, 5_000);
    return () => { if (alarmRef.current) clearInterval(alarmRef.current); };
  }, [alarmActive, alarmHour, alarmMinute, alarmDays, citizen?.name, syncScheduledAlarms, playAlarmSound]);

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[st.root, { paddingTop: topPad }]}>
      {/* Header */}
      <View style={st.header}>
        <LogoBrand size={28} />
        <Text style={st.headerTitle}>{t.tab_time}</Text>
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
              {s === "clock" ? t.time_zones_tab : s === "timer" ? t.time_timer_tab : t.time_alarm_tab}
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
            <Text style={st.sectionTitle}>{t.time_world_clock}</Text>
            <Text style={st.sectionSub}>TimeNation · Famagusta, Cyprus</Text>
            {ZONES.map((z) => {
              const { time, date, offset } = getTimeInZone(z.tz, lang);
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
            <Text style={st.sectionTitle}>{t.time_pomodoro}</Text>
            <Text style={st.sectionSub}>{t.timer_ai_checker}</Text>

            {/* Preset buttons */}
            <View style={st.presetRow}>
              {PRESET_SECONDS.map((p, i) => (
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
                  {completed ? t.time_session_done : running ? t.time_focusing : t.time_ready}
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
                <Text style={st.controlBtnSecondaryText}>{t.time_reset_btn}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[st.controlBtnPrimary, running && st.controlBtnPause]}
                onPress={handleStartPause}
              >
                <Feather name={running ? "pause" : "play"} size={22} color={colors.primaryForeground} />
                <Text style={st.controlBtnPrimaryText}>{running ? t.time_pause_btn : t.time_start_btn}</Text>
              </TouchableOpacity>
            </View>

            {/* Info box */}
            <View style={st.infoBox}>
              <Feather name="info" size={14} color={colors.mutedForeground} />
              <Text style={st.infoText}>{t.timer_ai_checker}</Text>
            </View>
          </View>
        )}

        {/* ── Alarm ── */}
        {section === "alarm" && (
          <View style={st.section}>
            <Text style={st.sectionTitle}>{t.time_alarm}</Text>
            <Text style={st.sectionSub}>Asia/Nicosia</Text>

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
              {t.time_alarm_tab}
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

            {/* Firing banner */}
            {alarmFiring && (
              <View style={[st.firingBanner, { backgroundColor: colors.primary + "22", borderColor: colors.primary }]}>
                <Text style={st.firingEmoji}>⏰</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[st.firingTitle, { color: colors.primary }]}>{t.time_alarm}!</Text>
                  <Text style={[st.firingSub, { color: colors.primary + "bb" }]}>
                    {String(alarmHour).padStart(2,"0")}:{String(alarmMinute).padStart(2,"0")} · Famagusta
                  </Text>
                </View>
                <TouchableOpacity
                  style={[st.firingDismiss, { backgroundColor: colors.primary }]}
                  onPress={dismissAlarm}
                >
                  <Text style={[st.firingDismissText, { color: colors.primaryForeground }]}>{t.time_stop_alarm}</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Enable / disable */}
            <TouchableOpacity
              style={[st.alarmToggleBtn, alarmActive ? st.alarmToggleBtnActive : { backgroundColor: colors.primary }]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                if (alarmActive) {
                  void stopAlarmSound();
                  setAlarmFiring(false);
                  setAlarmActive(false);
                } else {
                  setAlarmActive(true);
                }
              }}
            >
              <Feather name={alarmActive ? "bell-off" : "bell"} size={18} color={colors.primaryForeground} />
              <Text style={[st.alarmToggleBtnText, st.alarmToggleBtnTextActive]}>
                {alarmActive ? t.time_stop_alarm : t.time_alarm_tab}
              </Text>
            </TouchableOpacity>

            {/* Test sound */}
            {!alarmActive && (
              <TouchableOpacity
                style={[st.testSoundBtn, { borderColor: colors.border, backgroundColor: colors.card }]}
                onPress={async () => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  await playAlarmSound();
                  setTimeout(() => void stopAlarmSound(), 3000);
                }}
              >
                <Feather name="volume-2" size={16} color={colors.mutedForeground} />
                <Text style={[st.testSoundText, { color: colors.mutedForeground }]}>{t.time_start_btn} · 3s</Text>
              </TouchableOpacity>
            )}

            {alarmActive && !alarmFiring && (
              <View style={[st.alarmActiveCard, { backgroundColor: colors.primary + "18", borderColor: colors.primary + "44" }]}>
                <Feather name="bell" size={16} color={colors.primary} />
                <Text style={[st.alarmActiveText, { color: colors.primary }]}>
                  {String(alarmHour).padStart(2, "0")}:{String(alarmMinute).padStart(2, "0")} · Famagusta
                  {alarmDays.size === 7 ? "" : ` · ${[...alarmDays].sort((a,b)=>a-b).map((d) => DAYS[d]).join(", ")}`}
                </Text>
              </View>
            )}

            <View style={st.infoBox}>
              <Feather name="info" size={14} color={colors.mutedForeground} />
              <Text style={st.infoText}>{t.time_alarm} · Asia/Nicosia</Text>
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
    presetRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center" },
    presetBtn: {
      minWidth: 68,
      paddingHorizontal: 10,
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

    // Firing banner
    firingBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      padding: 14,
      borderRadius: 14,
      borderWidth: 2,
    },
    firingEmoji: { fontSize: 28 },
    firingTitle: { fontSize: 15, fontWeight: "700" },
    firingSub: { fontSize: 12, marginTop: 2 },
    firingDismiss: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 10,
    },
    firingDismissText: { fontSize: 13, fontWeight: "700" },

    // Test sound
    testSoundBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingVertical: 12,
      borderRadius: 12,
      borderWidth: 1,
    },
    testSoundText: { fontSize: 13, fontWeight: "600" },
  });
}
