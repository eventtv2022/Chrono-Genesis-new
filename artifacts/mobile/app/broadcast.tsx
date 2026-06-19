import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  View, Text, ScrollView, Pressable, StyleSheet,
  Platform, Animated, ActivityIndicator,
} from "react-native";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as WebBrowser from "expo-web-browser";
import { useQuery } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "";

function todayUTC(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

const SLOT_TYPE_LABELS: Record<string, string> = {
  citizen: "Гражданин",
  quarter: "Квартал",
  half: "Полчаса",
  apex: "Апекс",
};

const SLOT_TYPE_COLORS: Record<string, string> = {
  citizen: "#f59e0b",
  quarter: "#3b82f6",
  half: "#8b5cf6",
  apex: "#ef4444",
};

interface LiveSlotInfo {
  minuteIndex: number;
  videoUrl: string | null;
  hasContent: boolean;
  ownerName: string | null;
  slotType: string | null;
  slotId: number | null;
}

interface ScheduleEntry {
  slotId: number;
  minuteIndex: number;
  slotType: string;
  hourLabel: string;
  minLabel: string;
  ownerName: string | null;
  hasRenderedVideo: boolean;
  catcastUrl: string | null;
  mediaUrl: string | null;
  isRetro: boolean;
}

interface ScheduleResponse {
  date: string;
  totalSlots: number;
  bookedSlots: number;
  freeSlots: number;
  schedule: ScheduleEntry[];
}

export default function BroadcastScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top + 8;

  const [utcClock, setUtcClock] = useState("");
  const [currentMinute, setCurrentMinute] = useState(() => {
    const n = new Date();
    return n.getUTCHours() * 60 + n.getUTCMinutes();
  });
  const [currentSecond, setCurrentSecond] = useState(0);
  const [date, setDate] = useState(todayUTC);
  const prevMinuteRef = useRef(-1);
  const [liveSlot, setLiveSlot] = useState<LiveSlotInfo | null>(null);
  const [scheduleTab, setScheduleTab] = useState<"upcoming" | "past">("upcoming");

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.25, duration: 900, useNativeDriver: false }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: false }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [pulseAnim]);

  const fetchLiveSlot = useCallback(async (d: string, minute: number) => {
    try {
      const res = await fetch(`${BASE_URL}/api/tv/live-slot?date=${d}&minute=${minute}`);
      if (!res.ok) return;
      const data = await res.json() as LiveSlotInfo;
      setLiveSlot(data);
    } catch { /* network error — keep previous data */ }
  }, []);

  useEffect(() => {
    const d = todayUTC();
    const n = new Date();
    const m = n.getUTCHours() * 60 + n.getUTCMinutes();
    setDate(d);
    setCurrentMinute(m);
    setCurrentSecond(n.getUTCSeconds());
    void fetchLiveSlot(d, m);
  }, [fetchLiveSlot]);

  useEffect(() => {
    const timer = setInterval(() => {
      const n = new Date();
      const h = n.getUTCHours();
      const m = n.getUTCMinutes();
      const s = n.getUTCSeconds();
      const p = (x: number) => String(x).padStart(2, "0");
      setUtcClock(`${p(h)}:${p(m)}:${p(s)} UTC`);
      setCurrentSecond(s);
      Animated.timing(progressAnim, {
        toValue: s / 59,
        duration: 400,
        useNativeDriver: false,
      }).start();
      const minute = h * 60 + m;
      const d = todayUTC();
      if (minute !== prevMinuteRef.current) {
        prevMinuteRef.current = minute;
        setCurrentMinute(minute);
        setDate(d);
        progressAnim.setValue(0);
        void fetchLiveSlot(d, minute);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [fetchLiveSlot, progressAnim]);

  const { data: scheduleData, isLoading: scheduleLoading, refetch: refetchSchedule } =
    useQuery<ScheduleResponse>({
      queryKey: ["tvSchedule", date],
      queryFn: async () => {
        const res = await fetch(`${BASE_URL}/api/tv/schedule?date=${date}`);
        if (!res.ok) throw new Error("Ошибка загрузки расписания");
        return res.json() as Promise<ScheduleResponse>;
      },
      staleTime: 60_000,
      refetchInterval: 60_000,
    });

  const hourLabel = String(Math.floor(currentMinute / 60)).padStart(2, "0");
  const minLabel = String(currentMinute % 60).padStart(2, "0");

  const { upcoming, past } = useMemo(() => {
    const all = scheduleData?.schedule ?? [];
    const up = all
      .filter((s) => s.minuteIndex > currentMinute)
      .sort((a, b) => a.minuteIndex - b.minuteIndex);
    const pa = all
      .filter((s) => s.minuteIndex <= currentMinute)
      .sort((a, b) => b.minuteIndex - a.minuteIndex);
    return { upcoming: up, past: pa };
  }, [scheduleData, currentMinute]);

  const listData = scheduleTab === "upcoming" ? upcoming : past;

  const openVideo = async (entry: ScheduleEntry) => {
    const url = entry.catcastUrl ?? (entry.mediaUrl ? `${BASE_URL}${entry.mediaUrl}` : null);
    if (!url) return;
    await WebBrowser.openBrowserAsync(url, { toolbarColor: "#0D1B2A" });
  };

  const openLive = async () => {
    if (!liveSlot?.videoUrl) return;
    const url = liveSlot.videoUrl.startsWith("http")
      ? liveSlot.videoUrl
      : `${BASE_URL}${liveSlot.videoUrl}`;
    await WebBrowser.openBrowserAsync(url, { toolbarColor: "#0D1B2A" });
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: topPad }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
          <Animated.View style={[styles.liveDot, { opacity: pulseAnim }]} />
          <Text style={[styles.headerTitle, { color: "#f97316" }]}>ЭФИР</Text>
        </View>
        <Text style={[styles.clockSmall, { color: colors.mutedForeground }]}>{utcClock}</Text>
      </View>

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        {/* NOW LIVE hero card */}
        <View style={[styles.heroCard, { backgroundColor: colors.card, borderColor: "#f9731622" }]}>
          {/* Label row */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <Animated.View style={[styles.heroPulseDot, { opacity: pulseAnim }]} />
            <Text style={styles.heroLiveLabel}>В ЭФИРЕ СЕЙЧАС</Text>
            <View style={{ flex: 1 }} />
            <Text style={{ fontSize: 10, color: "#f97316aa", fontFamily: "Inter_400Regular" }}>UTC</Text>
          </View>

          {/* Big time */}
          <Text style={[styles.heroBigTime, { color: colors.foreground }]}>
            {hourLabel}:{minLabel}
          </Text>

          {/* Seconds progress bar */}
          <View style={[styles.progressTrack, { backgroundColor: colors.muted }]}>
            <Animated.View
              style={[styles.progressFill, {
                width: progressAnim.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }),
              }]}
            />
          </View>
          <Text style={[styles.progressLabel, { color: colors.mutedForeground }]}>
            {59 - currentSecond} с до смены слота
          </Text>

          {liveSlot?.hasContent ? (
            <View style={{ marginTop: 16, gap: 8 }}>
              <Text style={[styles.heroOwner, { color: colors.foreground }]} numberOfLines={1}>
                {liveSlot.ownerName ?? "Гражданин"}
              </Text>
              {liveSlot.slotType && (
                <View style={{ flexDirection: "row" }}>
                  <View style={[styles.typeBadge, {
                    backgroundColor: (SLOT_TYPE_COLORS[liveSlot.slotType] ?? "#f59e0b") + "22",
                    borderColor: (SLOT_TYPE_COLORS[liveSlot.slotType] ?? "#f59e0b") + "55",
                  }]}>
                    <Text style={[styles.typeBadgeText, {
                      color: SLOT_TYPE_COLORS[liveSlot.slotType] ?? "#f59e0b",
                    }]}>
                      {SLOT_TYPE_LABELS[liveSlot.slotType] ?? liveSlot.slotType}
                    </Text>
                  </View>
                </View>
              )}
              {liveSlot.videoUrl ? (
                <Pressable
                  style={({ pressed }) => [styles.watchBtn, {
                    backgroundColor: pressed ? "#f97316cc" : "#f97316",
                    marginTop: 4,
                  }]}
                  onPress={openLive}
                >
                  <Feather name="play" size={16} color="#fff" />
                  <Text style={styles.watchBtnText}>Смотреть видео</Text>
                </Pressable>
              ) : (
                <View style={[styles.noVideoHint, { borderColor: colors.border }]}>
                  <Feather name="film" size={14} color={colors.mutedForeground} />
                  <Text style={{ fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>
                    Видео ещё не отрендерено
                  </Text>
                </View>
              )}
            </View>
          ) : (
            <View style={{ marginTop: 16, alignItems: "center", gap: 6, paddingVertical: 8 }}>
              <Feather name="radio" size={28} color={colors.mutedForeground} />
              <Text style={{ fontSize: 14, color: colors.mutedForeground, fontFamily: "Inter_500Medium" }}>
                Сигнал TimeNation
              </Text>
              <Text style={{ fontSize: 11, color: colors.mutedForeground + "80", fontFamily: "Inter_400Regular" }}>
                Этот слот не занят — эфирная заставка
              </Text>
            </View>
          )}
        </View>

        {/* Stats row */}
        {scheduleData && (
          <View style={[styles.statsRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {[
              { label: "Занято", value: scheduleData.bookedSlots },
              { label: "Свободно", value: scheduleData.freeSlots },
              { label: "Всего", value: scheduleData.totalSlots },
            ].map(({ label, value }) => (
              <View key={label} style={styles.statItem}>
                <Text style={[styles.statValue, { color: colors.foreground }]}>{value}</Text>
                <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{label}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Schedule section */}
        <View style={{ paddingHorizontal: 16, marginTop: 20 }}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
              РАСПИСАНИЕ · {date}
            </Text>
            <Pressable onPress={() => void refetchSchedule()} style={{ padding: 4 }}>
              <Feather name="refresh-cw" size={14} color={colors.mutedForeground} />
            </Pressable>
          </View>

          {/* Tab toggle */}
          <View style={[styles.tabToggle, { backgroundColor: colors.muted }]}>
            {(["upcoming", "past"] as const).map((tab) => (
              <Pressable
                key={tab}
                style={[styles.tabBtn, scheduleTab === tab && { backgroundColor: colors.card }]}
                onPress={() => setScheduleTab(tab)}
              >
                <Text style={{
                  fontSize: 12, fontWeight: "600",
                  color: scheduleTab === tab ? colors.foreground : colors.mutedForeground,
                  fontFamily: "Inter_600SemiBold",
                }}>
                  {tab === "upcoming"
                    ? `Предстоящие (${upcoming.length})`
                    : `Прошедшие (${past.length})`}
                </Text>
              </Pressable>
            ))}
          </View>

          {scheduleLoading ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 32 }} />
          ) : listData.length === 0 ? (
            <View style={styles.emptyState}>
              <Feather name="calendar" size={36} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                {scheduleTab === "upcoming"
                  ? "Нет предстоящих трансляций на сегодня"
                  : "Нет прошедших трансляций"}
              </Text>
            </View>
          ) : (
            listData.map((item) => {
              const isLive = item.minuteIndex === currentMinute;
              const typeColor = SLOT_TYPE_COLORS[item.slotType] ?? "#f59e0b";
              const canWatch = item.hasRenderedVideo || !!item.catcastUrl;

              return (
                <Pressable
                  key={item.slotId}
                  style={({ pressed }) => [styles.scheduleItem, {
                    backgroundColor: isLive
                      ? "#f9731614"
                      : pressed && canWatch
                        ? colors.muted
                        : "transparent",
                    borderLeftColor: isLive ? "#f97316" : typeColor + "77",
                  }]}
                  onPress={() => canWatch ? void openVideo(item) : undefined}
                >
                  {/* Time */}
                  <View style={styles.scheduleLeft}>
                    {isLive && (
                      <Animated.View style={[styles.liveDotSmall, { opacity: pulseAnim }]} />
                    )}
                    <Text style={[styles.scheduleTime, {
                      color: isLive ? "#f97316" : colors.foreground,
                    }]}>
                      {item.hourLabel}:{item.minLabel}
                    </Text>
                  </View>

                  {/* Info */}
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={[styles.scheduleOwner, { color: colors.foreground }]} numberOfLines={1}>
                      {item.ownerName ?? "Гражданин"}
                    </Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <View style={[styles.typeBadge, {
                        backgroundColor: typeColor + "22",
                        borderColor: typeColor + "55",
                      }]}>
                        <Text style={[styles.typeBadgeText, { color: typeColor }]}>
                          {SLOT_TYPE_LABELS[item.slotType] ?? item.slotType}
                        </Text>
                      </View>
                      {item.isRetro && !canWatch && (
                        <Text style={{ fontSize: 9, color: colors.mutedForeground }}>
                          нет видео
                        </Text>
                      )}
                    </View>
                  </View>

                  {/* Watch button */}
                  {canWatch ? (
                    <View style={[styles.watchBadge, { borderColor: colors.primary + "55" }]}>
                      <Feather name="play" size={11} color={colors.primary} />
                      <Text style={[styles.watchBadgeText, { color: colors.primary }]}>
                        Смотреть
                      </Text>
                    </View>
                  ) : (
                    <Feather name="lock" size={14} color={colors.mutedForeground + "55"} />
                  )}
                </Pressable>
              );
            })
          )}
        </View>

        <View style={{ height: 48 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { padding: 4 },
  headerTitle: {
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 2.5,
    fontFamily: "Inter_700Bold",
  },
  clockSmall: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    fontVariant: ["tabular-nums" as const],
  },

  liveDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: "#f97316",
    shadowColor: "#f97316",
    shadowRadius: 5,
    shadowOpacity: 1,
    shadowOffset: { width: 0, height: 0 },
  },

  heroCard: {
    margin: 16,
    borderRadius: 20,
    padding: 22,
    borderWidth: 1,
  },
  heroPulseDot: {
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: "#f97316",
    shadowColor: "#f97316",
    shadowRadius: 8,
    shadowOpacity: 1,
    shadowOffset: { width: 0, height: 0 },
  },
  heroLiveLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: "#f97316",
    letterSpacing: 2,
    fontFamily: "Inter_700Bold",
  },
  heroBigTime: {
    fontSize: 72,
    fontWeight: "800",
    fontFamily: "Inter_700Bold",
    fontVariant: ["tabular-nums" as const],
    letterSpacing: -3,
    lineHeight: 76,
  },
  progressTrack: {
    height: 5,
    borderRadius: 3,
    marginTop: 10,
    overflow: "hidden",
  },
  progressFill: {
    height: 5,
    borderRadius: 3,
    backgroundColor: "#f97316",
  },
  progressLabel: {
    fontSize: 10,
    marginTop: 5,
    fontFamily: "Inter_400Regular",
  },
  heroOwner: {
    fontSize: 18,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
  },
  watchBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 46,
    borderRadius: 12,
  },
  watchBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  noVideoHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 4,
  },

  statsRow: {
    flexDirection: "row",
    marginHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
  },
  statItem: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
  },
  statValue: {
    fontSize: 20,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
  },
  statLabel: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.5,
    fontFamily: "Inter_700Bold",
  },

  tabToggle: {
    flexDirection: "row",
    borderRadius: 10,
    padding: 3,
    marginBottom: 10,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    borderRadius: 8,
  },

  emptyState: {
    alignItems: "center",
    paddingVertical: 36,
    gap: 10,
  },
  emptyText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },

  scheduleItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 13,
    marginBottom: 3,
    borderRadius: 10,
    gap: 10,
    borderLeftWidth: 3,
  },
  scheduleLeft: {
    width: 52,
    flexDirection: "row",
    alignItems: "center",
  },
  liveDotSmall: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#f97316",
    marginRight: 4,
  },
  scheduleTime: {
    fontSize: 14,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
    fontVariant: ["tabular-nums" as const],
  },
  scheduleOwner: {
    fontSize: 14,
    fontWeight: "600",
    fontFamily: "Inter_600SemiBold",
  },
  typeBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
  },
  watchBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
  },
  watchBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    fontFamily: "Inter_600SemiBold",
  },
});
