import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Platform,
  TouchableOpacity,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useColors } from "@/hooks/useColors";
import { useCitizen } from "@/context/CitizenContext";
import { LogoBrand } from "@/components/LogoBrand";

const BASE_URL = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;

interface Transaction {
  id: number;
  sessionId: number;
  fromCitizenId: number;
  toCitizenId: number;
  fromCitizenName: string;
  toCitizenName: string;
  minutesTransferred: number;
  durationSeconds: number;
  createdAt: string;
}

interface Citizen {
  id: number;
  name: string;
  balanceMinutes: number;
  totalGiven: number;
  totalReceived: number;
  status: string;
  createdAt: string;
}

interface Stats {
  totalCitizens: number;
  activeCitizens: number;
  totalTransactions: number;
  totalMinutesCirculated: number;
  topGivers: Citizen[];
  topReceivers: Citizen[];
  recentTransactions: Transaction[];
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}м ${s}с` : `${s}с`;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "только что";
  if (mins < 60) return `${mins}м назад`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}ч назад`;
  return `${Math.floor(hours / 24)}д назад`;
}

export default function StatsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { citizen } = useCitizen();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const botPad = Platform.OS === "web" ? 34 : 0;

  const { data, isLoading, refetch, isRefetching } = useQuery<Stats>({
    queryKey: ["stats"],
    queryFn: async () => {
      const res = await fetch(`${BASE_URL}/api/stats`);
      return res.json() as Promise<Stats>;
    },
    refetchInterval: 30000,
  });

  const styles = getStyles(colors);

  if (isLoading) {
    return (
      <View style={[styles.container, styles.center, { paddingTop: topPad }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { paddingTop: topPad }]}
      contentContainerStyle={{ paddingBottom: botPad + 90 }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />}
    >
      <View style={styles.header}>
        <View style={styles.headerBrand}>
          <LogoBrand size={28} />
          <Text style={styles.headerTitle}>КАЗНАЧЕЙСТВО</Text>
        </View>
        {citizen && (
          <TouchableOpacity
            style={styles.topupBtn}
            onPress={() => router.push("/shop")}
            activeOpacity={0.8}
          >
            <Feather name="plus" size={13} color={colors.primaryForeground} />
            <Text style={styles.topupBtnText}>Пополнить</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.metricsGrid}>
        {[
          { icon: "users", num: data?.totalCitizens ?? 0, label: "граждан", color: colors.primary },
          { icon: "activity", num: data?.activeCitizens ?? 0, label: "активных", color: colors.success },
          { icon: "repeat", num: data?.totalTransactions ?? 0, label: "транзакций", color: colors.primary },
          { icon: "clock", num: data?.totalMinutesCirculated ?? 0, label: "Д в обороте", color: colors.primary },
        ].map((m) => (
          <View key={m.label} style={styles.metricCard}>
            <Feather name={m.icon as keyof typeof Feather.glyphMap} size={18} color={m.color} />
            <Text style={[styles.metricNum, { color: m.color }]}>{m.num}</Text>
            <Text style={styles.metricLabel}>{m.label}</Text>
          </View>
        ))}
      </View>

      {(data?.topGivers.length ?? 0) > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ТОП ДАРИТЕЛЕЙ</Text>
          {data!.topGivers.map((c, i) => (
            <View key={c.id} style={styles.rankRow}>
              <Text style={styles.rankNum}>#{i + 1}</Text>
              <View style={styles.rankAvatar}><Text style={styles.rankAvatarText}>{c.name.charAt(0)}</Text></View>
              <Text style={styles.rankName}>{c.name}</Text>
              <View style={styles.rankBadge}><Text style={styles.rankBadgeText}>+{c.totalGiven} Д</Text></View>
            </View>
          ))}
        </View>
      )}

      {(data?.recentTransactions.length ?? 0) > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ПОСЛЕДНИЕ ТРАНЗАКЦИИ</Text>
          {data!.recentTransactions.map((t) => (
            <View key={t.id} style={styles.txRow}>
              <View style={styles.txLeft}>
                <Text style={styles.txNames}>{t.fromCitizenName} → {t.toCitizenName}</Text>
                <Text style={styles.txTime}>{formatDuration(t.durationSeconds)} · {timeAgo(t.createdAt)}</Text>
              </View>
              <View style={styles.txAmount}>
                <Text style={styles.txAmountText}>+{t.minutesTransferred}</Text>
                <Text style={styles.txAmountUnit}>Д</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {data?.totalTransactions === 0 && (
        <View style={styles.emptyState}>
          <Feather name="bar-chart-2" size={40} color={colors.mutedForeground} />
          <Text style={styles.emptyText}>Нет транзакций</Text>
          <Text style={styles.emptySubtext}>Начни первую TiMETR сессию</Text>
        </View>
      )}
    </ScrollView>
  );
}

function getStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    center: { alignItems: "center", justifyContent: "center" },
    header: { paddingHorizontal: 20, paddingVertical: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    headerBrand: { flexDirection: "row", alignItems: "center", gap: 8 },
    headerTitle: { fontSize: 22, fontFamily: "Inter_700Bold", color: colors.foreground, letterSpacing: 2 },
    topupBtn: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: colors.primary, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20 },
    topupBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.primaryForeground },
    metricsGrid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 12, gap: 8, marginBottom: 8 },
    metricCard: { flex: 1, minWidth: "45%", backgroundColor: colors.card, borderRadius: 12, padding: 16, alignItems: "center", gap: 4, borderWidth: 1, borderColor: colors.border, marginHorizontal: 4 },
    metricNum: { fontSize: 28, fontFamily: "Inter_700Bold", color: colors.primary },
    metricLabel: { fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
    section: { marginHorizontal: 20, marginTop: 16 },
    sectionTitle: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground, letterSpacing: 1.5, marginBottom: 10 },
    rankRow: { flexDirection: "row", alignItems: "center", backgroundColor: colors.card, borderRadius: 10, padding: 12, marginBottom: 6, borderWidth: 1, borderColor: colors.border, gap: 10 },
    rankNum: { fontSize: 13, fontFamily: "Inter_700Bold", color: colors.mutedForeground, width: 24 },
    rankAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.goldGlow, borderWidth: 1, borderColor: colors.primary, alignItems: "center", justifyContent: "center" },
    rankAvatarText: { fontSize: 13, fontFamily: "Inter_700Bold", color: colors.primary },
    rankName: { flex: 1, fontSize: 14, fontFamily: "Inter_500Medium", color: colors.foreground },
    rankBadge: { backgroundColor: colors.goldGlow, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
    rankBadgeText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.primary },
    txRow: { flexDirection: "row", alignItems: "center", backgroundColor: colors.card, borderRadius: 10, padding: 12, marginBottom: 6, borderWidth: 1, borderColor: colors.border },
    txLeft: { flex: 1, gap: 2 },
    txNames: { fontSize: 13, fontFamily: "Inter_500Medium", color: colors.foreground },
    txTime: { fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
    txAmount: { alignItems: "flex-end" },
    txAmountText: { fontSize: 18, fontFamily: "Inter_700Bold", color: colors.primary },
    txAmountUnit: { fontSize: 10, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
    emptyState: { alignItems: "center", paddingTop: 60, gap: 8 },
    emptyText: { fontSize: 18, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground },
    emptySubtext: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
  });
}
