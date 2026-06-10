import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useCitizen } from "@/context/CitizenContext";
import { useColors } from "@/hooks/useColors";
import { LogoBrand } from "@/components/LogoBrand";
import { AnimatedHourglass } from "@/components/AnimatedHourglass";

const BASE_URL = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;

interface Citizen {
  id: number;
  name: string;
  phone: string;
  balanceMinutes: number;
  totalGiven: number;
  totalReceived: number;
  status: string;
  meritScore: number;
  rank: string;
  lastActivity: string | null;
  createdAt: string;
}

interface Session {
  id: number;
  fromCitizenId: number;
  toCitizenId: number;
  startedAt: string;
  stoppedAt: string | null;
  durationSeconds: number | null;
  minutesTransferred: number | null;
  status: string;
}

interface SessionResult {
  session: Session;
  transaction: {
    id: number;
    minutesTransferred: number;
    durationSeconds: number;
  };
  sheetsLogged: boolean;
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function TimerScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { citizen, refreshCitizen } = useCitizen();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [selectedRecipient, setSelectedRecipient] = useState<Citizen | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: citizens = [], isLoading: loadingCitizens } = useQuery<Citizen[]>({
    queryKey: ["citizens"],
    queryFn: async () => {
      const res = await fetch(`${BASE_URL}/api/citizens`);
      return res.json() as Promise<Citizen[]>;
    },
    enabled: !!citizen,
  });

  const startMutation = useMutation<Session, Error, { fromCitizenId: number; toCitizenId: number }>({
    mutationFn: async (body) => {
      const res = await fetch(`${BASE_URL}/api/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error((data as { error: string }).error);
      return data as Session;
    },
    onSuccess: (session) => {
      setActiveSession(session);
      setElapsed(0);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    },
    onError: (err) => Alert.alert("Ошибка", err.message),
  });

  const stopMutation = useMutation<SessionResult, Error, number>({
    mutationFn: async (id) => {
      const res = await fetch(`${BASE_URL}/api/sessions/${id}/stop`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error((data as { error: string }).error);
      return data as SessionResult;
    },
    onSuccess: (result) => {
      setActiveSession(null);
      setElapsed(0);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["citizens"] });
      refreshCitizen();
      const mins = result.transaction.minutesTransferred;
      const secs = result.transaction.durationSeconds;
      const sheetsStatus = result.sheetsLogged ? "Записано в Казначейство" : "Ошибка записи в таблицу";
      Alert.alert("Сессия завершена", `Передано: ${mins} Д\nДлительность: ${formatTime(secs)}\n${sheetsStatus}`);
    },
    onError: (err) => Alert.alert("Ошибка", err.message),
  });

  useEffect(() => {
    if (activeSession) {
      intervalRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [activeSession]);

  const handleStart = useCallback(() => {
    if (!citizen) { router.push("/register"); return; }
    if (!selectedRecipient) {
      Alert.alert("Выбери получателя", "Нажми на гражданина ниже, чтобы начать передачу времени");
      return;
    }
    startMutation.mutate({ fromCitizenId: citizen.id, toCitizenId: selectedRecipient.id });
  }, [citizen, selectedRecipient, startMutation, router]);

  const handleStop = useCallback(() => {
    if (!activeSession) return;
    stopMutation.mutate(activeSession.id);
  }, [activeSession, stopMutation]);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const botPad = Platform.OS === "web" ? 34 : 0;
  const others = citizens.filter((c) => c.id !== citizen?.id);
  const recipientCitizen = citizens.find((c) => c.id === activeSession?.toCitizenId);
  const styles = getStyles(colors);

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <View style={styles.header}>
        <View style={styles.headerBrand}>
          <LogoBrand size={30} />
          <Text style={styles.headerTitle}>TiMETR</Text>
        </View>
        {citizen && (
          <View style={styles.headerRight}>
            <View style={styles.rankPill}>
              <Text style={styles.rankText}>{citizen.rank ?? "Странник"}</Text>
            </View>
            <View style={styles.balancePill}>
              <Feather name="clock" size={12} color={colors.primary} />
              <Text style={styles.balanceText}>{citizen.balanceMinutes} Д</Text>
            </View>
            <TouchableOpacity
              style={styles.shopBtn}
              onPress={() => router.push("/shop")}
              activeOpacity={0.75}
            >
              <Feather name="plus-circle" size={13} color={colors.primaryForeground} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.walletBtn, citizen.walletVerified === 1 && styles.walletBtnVerified]}
              onPress={() => router.push("/wallet")}
              activeOpacity={0.75}
            >
              {citizen.walletVerified === 1 ? (
                <>
                  <Feather name="shield" size={11} color={colors.primaryForeground} />
                  <Text style={[styles.walletBtnText, { color: colors.primaryForeground }]}>
                    {citizen.walletAddress
                      ? citizen.walletAddress.slice(0, 4) + "…" + citizen.walletAddress.slice(-3)
                      : "W3"}
                  </Text>
                </>
              ) : (
                <>
                  <Feather name="link" size={11} color={colors.primary} />
                  <Text style={styles.walletBtnText}>Кошелёк</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>
      {citizen && (
        <View style={styles.meritBar}>
          <Feather name="star" size={11} color={colors.primary} />
          <Text style={styles.meritText}>Merit: {(citizen.meritScore ?? 0).toFixed(2)}</Text>
          <Text style={styles.meritSep}>·</Text>
          <Text style={styles.meritText}>Отдано: {citizen.totalGiven} Д</Text>
        </View>
      )}

      <View style={styles.timerSection}>
        {activeSession ? (
          <>
            <AnimatedHourglass active={true} size={36} />
            <Text style={styles.timerLabel}>→ {recipientCitizen?.name ?? "..."}</Text>
            <Text style={styles.timerDisplay}>{formatTime(elapsed)}</Text>
            <Text style={styles.timerSub}>~{Math.max(1, Math.ceil(elapsed / 60))} Д будет передано</Text>
            <TouchableOpacity style={styles.stopBtn} onPress={handleStop} disabled={stopMutation.isPending} activeOpacity={0.75}>
              {stopMutation.isPending ? (
                <ActivityIndicator color={colors.destructiveForeground} />
              ) : (
                <>
                  <Feather name="square" size={20} color={colors.destructiveForeground} />
                  <Text style={styles.stopBtnText}>СТОП</Text>
                </>
              )}
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.timerDisplay}>00:00</Text>
            <Text style={styles.timerSub}>{selectedRecipient ? `→ ${selectedRecipient.name}` : "Выбери получателя"}</Text>
            <TouchableOpacity
              style={[styles.startBtn, !selectedRecipient && styles.startBtnDisabled]}
              onPress={handleStart}
              disabled={startMutation.isPending || !selectedRecipient}
              activeOpacity={0.75}
            >
              {startMutation.isPending ? (
                <ActivityIndicator color={colors.primaryForeground} />
              ) : (
                <>
                  <Feather name="play" size={20} color={colors.primaryForeground} />
                  <Text style={styles.startBtnText}>СТАРТ</Text>
                </>
              )}
            </TouchableOpacity>
          </>
        )}
      </View>

      <View style={styles.listSection}>
        <Text style={styles.listTitle}>{activeSession ? "Идёт передача" : "Выбери получателя"}</Text>
        {!citizen && (
          <TouchableOpacity style={styles.registerPrompt} onPress={() => router.push("/register")} activeOpacity={0.8}>
            <Feather name="user-plus" size={20} color={colors.primary} />
            <Text style={styles.registerPromptText}>Зарегистрируйся как гражданин</Text>
            <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
          </TouchableOpacity>
        )}
        {loadingCitizens && citizen && <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />}
        {!loadingCitizens && others.length === 0 && citizen && (
          <View style={styles.emptyState}>
            <Feather name="users" size={32} color={colors.mutedForeground} />
            <Text style={styles.emptyText}>Нет других граждан</Text>
            <Text style={styles.emptySubtext}>Пригласи участников в TimeNation</Text>
          </View>
        )}
        <FlatList
          data={others}
          keyExtractor={(item) => String(item.id)}
          scrollEnabled={!!others.length}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const isSelected = selectedRecipient?.id === item.id;
            const isActive = activeSession?.toCitizenId === item.id;
            return (
              <TouchableOpacity
                style={[
                  styles.citizenRow,
                  isSelected && styles.citizenRowSelected,
                  isActive && styles.citizenRowActive,
                  !!activeSession && !isActive && styles.citizenRowDimmed,
                ]}
                onPress={() => {
                  if (activeSession) return;
                  setSelectedRecipient(isSelected ? null : item);
                  Haptics.selectionAsync();
                }}
                activeOpacity={0.75}
                disabled={!!activeSession}
              >
                <View style={styles.citizenAvatar}>
                  <Text style={styles.citizenAvatarText}>{item.name.charAt(0).toUpperCase()}</Text>
                </View>
                <View style={styles.citizenInfo}>
                  <Text style={styles.citizenName}>{item.name}</Text>
                  <Text style={styles.citizenBalance}>{item.balanceMinutes} Д</Text>
                </View>
                {isActive && (
                  <View style={styles.activeIndicator}>
                    <View style={styles.activeDot} />
                    <Text style={styles.activeText}>LIVE</Text>
                  </View>
                )}
                {isSelected && !activeSession && <Feather name="check-circle" size={20} color={colors.primary} />}
              </TouchableOpacity>
            );
          }}
          contentContainerStyle={{ paddingBottom: botPad + 90 }}
        />
      </View>
    </View>
  );
}

function getStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingVertical: 12 },
    headerBrand: { flexDirection: "row", alignItems: "center", gap: 8 },
    headerTitle: { fontSize: 22, fontFamily: "Inter_700Bold", color: colors.primary, letterSpacing: 2 },
    headerRight: { flexDirection: "row", alignItems: "center", gap: 8 },
    rankPill: { backgroundColor: "rgba(201,168,76,0.15)", borderWidth: 1, borderColor: "rgba(201,168,76,0.4)", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
    rankText: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: colors.primary, letterSpacing: 0.5 },
    balancePill: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.goldGlow, borderWidth: 1, borderColor: colors.primary, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 },
    balanceText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.primary },
    shopBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
    walletBtn: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderColor: colors.primary, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 20, backgroundColor: "transparent" },
    walletBtnVerified: { backgroundColor: colors.primary },
    walletBtnText: { fontSize: 10, fontFamily: "Inter_600SemiBold", color: colors.primary, letterSpacing: 0.3 },
    meritBar: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 20, paddingBottom: 8 },
    meritText: { fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
    meritSep: { fontSize: 11, color: colors.mutedForeground },
    timerSection: { alignItems: "center", paddingVertical: 28, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: colors.border },
    timerLabel: { fontSize: 14, fontFamily: "Inter_500Medium", color: colors.mutedForeground, marginBottom: 8, letterSpacing: 1 },
    timerDisplay: { fontSize: 60, fontFamily: "Inter_700Bold", color: colors.foreground, letterSpacing: -2 },
    timerSub: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 4, marginBottom: 20 },
    startBtn: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.primary, paddingHorizontal: 40, paddingVertical: 14, borderRadius: 40 },
    startBtnDisabled: { opacity: 0.4 },
    startBtnText: { fontSize: 16, fontFamily: "Inter_700Bold", color: colors.primaryForeground, letterSpacing: 2 },
    stopBtn: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.destructive, paddingHorizontal: 40, paddingVertical: 14, borderRadius: 40 },
    stopBtnText: { fontSize: 16, fontFamily: "Inter_700Bold", color: colors.destructiveForeground, letterSpacing: 2 },
    listSection: { flex: 1, paddingHorizontal: 20, paddingTop: 16 },
    listTitle: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 12 },
    registerPrompt: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.primary, borderRadius: 12, padding: 16, marginBottom: 16 },
    registerPromptText: { flex: 1, fontSize: 15, fontFamily: "Inter_500Medium", color: colors.foreground },
    emptyState: { alignItems: "center", paddingTop: 40, gap: 8 },
    emptyText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground },
    emptySubtext: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
    citizenRow: { flexDirection: "row", alignItems: "center", backgroundColor: colors.card, borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: colors.border, gap: 12 },
    citizenRowSelected: { borderColor: colors.primary, backgroundColor: colors.goldGlow },
    citizenRowActive: { borderColor: colors.primary, backgroundColor: colors.goldGlow },
    citizenRowDimmed: { opacity: 0.4 },
    citizenAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
    citizenAvatarText: { fontSize: 16, fontFamily: "Inter_700Bold", color: colors.primary },
    citizenInfo: { flex: 1 },
    citizenName: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.foreground },
    citizenBalance: { fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 2 },
    activeIndicator: { flexDirection: "row", alignItems: "center", gap: 4 },
    activeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.success },
    activeText: { fontSize: 10, fontFamily: "Inter_700Bold", color: colors.success, letterSpacing: 1 },
  });
}
