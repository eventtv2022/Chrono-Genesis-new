import { getBaseUrl } from "@/lib/api";
import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Platform,
  TouchableOpacity,
  TextInput,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useColors } from "@/hooks/useColors";
import { useCitizen } from "@/context/CitizenContext";
import { LogoBrand } from "@/components/LogoBrand";
import { useLanguage } from "@/context/LanguageContext";

const BASE_URL = getBaseUrl();

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
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function timeAgo(iso: string, lang: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  try {
    const rtf = new Intl.RelativeTimeFormat(lang, { numeric: "auto" });
    if (mins < 1) return rtf.format(0, "minutes");
    if (mins < 60) return rtf.format(-mins, "minutes");
    const hours = Math.floor(mins / 60);
    if (hours < 24) return rtf.format(-hours, "hours");
    return rtf.format(-Math.floor(hours / 24), "days");
  } catch {
    if (mins < 1) return "now";
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
  }
}

// ── Discount calculator (same tiers as shop.tsx) ─────────────────────────────

const RATE_EUR = 1; // 1 Д = 1 €

const TIERS = [
  { label: "1–99 Д",          discount: 0,  from: 1     },
  { label: "100–499 Д",       discount: 5,  from: 100   },
  { label: "500–999 Д",       discount: 6,  from: 500   },
  { label: "1 000–4 999 Д",   discount: 7,  from: 1000  },
  { label: "5 000–10 000 Д",  discount: 8,  from: 5000  },
  { label: "> 10 000 Д",      discount: 10, from: 10001 },
];

function calcDiscount(amt: number): number {
  const tier = [...TIERS].reverse().find(tr => amt >= tr.from);
  return tier?.discount ?? 0;
}

function CalcWidget({ colors }: { colors: ReturnType<typeof useColors> }) {
  const { t } = useLanguage();
  const [input, setInput]       = useState("100");
  const [expanded, setExpanded] = useState(false);
  const amount  = Math.max(0, parseInt(input.replace(/\D/g, ""), 10) || 0);
  const disc    = calcDiscount(amount);
  const total   = parseFloat((amount * RATE_EUR * (1 - disc / 100)).toFixed(2));
  const saved   = parseFloat((amount * RATE_EUR - total).toFixed(2));

  return (
    <View style={{ marginHorizontal: 20, marginTop: 20, backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, overflow: "hidden" }}>
      <TouchableOpacity
        style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14 }}
        onPress={() => setExpanded(v => !v)}
        activeOpacity={0.8}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Feather name="shopping-cart" size={16} color={colors.primary} />
          <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.foreground, letterSpacing: 0.5 }}>
            {t.stats_calc_title}
          </Text>
        </View>
        <Feather name={expanded ? "chevron-up" : "chevron-down"} size={16} color={colors.mutedForeground} />
      </TouchableOpacity>

      {expanded && (
        <View style={{ paddingHorizontal: 14, paddingBottom: 16, gap: 12 }}>
          {/* Quick amounts */}
          <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
            {[100, 500, 1000, 5000].map(v => (
              <TouchableOpacity
                key={v}
                style={{ paddingHorizontal: 12, paddingVertical: 6, backgroundColor: amount === v ? colors.primary : colors.muted, borderRadius: 20 }}
                onPress={() => setInput(String(v))}
                activeOpacity={0.8}
              >
                <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: amount === v ? colors.primaryForeground : colors.foreground }}>
                  {v.toLocaleString()} Д
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Input */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <TextInput
              style={{ flex: 1, borderWidth: 1.5, borderColor: colors.border, borderRadius: 10, padding: 12, fontSize: 18, fontFamily: "Inter_700Bold", color: colors.foreground, backgroundColor: colors.background, textAlign: "center" }}
              value={input}
              onChangeText={v => setInput(v.replace(/\D/g, ""))}
              keyboardType="numeric"
              placeholder={t.stats_darmin_amount}
              placeholderTextColor={colors.mutedForeground}
            />
            <Text style={{ fontSize: 14, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>Д</Text>
          </View>

          {/* Result */}
          <View style={{ backgroundColor: colors.background, borderRadius: 10, padding: 14, gap: 8 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>{t.stats_base_price}</Text>
              <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.foreground }}>{(amount * RATE_EUR).toFixed(2)} €</Text>
            </View>
            {disc > 0 && (
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: "#4ade80" }}>−{disc}%</Text>
                <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#4ade80" }}>−{saved.toFixed(2)} €</Text>
              </View>
            )}
            <View style={{ flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8 }}>
              <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: colors.foreground }}>{t.stats_total}</Text>
              <Text style={{ fontSize: 20, fontFamily: "Inter_700Bold", color: colors.primary }}>{total.toFixed(2)} €</Text>
            </View>
          </View>

          {/* Tier table */}
          <View style={{ gap: 4 }}>
            <Text style={{ fontSize: 10, fontFamily: "Inter_500Medium", color: colors.mutedForeground, letterSpacing: 1, marginBottom: 4 }}>{t.stats_discount_table}</Text>
            {TIERS.map((tier, i) => {
              const active = calcDiscount(amount) === tier.discount && amount >= tier.from;
              return (
                <View key={i} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 4, paddingHorizontal: 8, backgroundColor: active ? colors.goldGlow : "transparent", borderRadius: 6 }}>
                  <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: active ? colors.primary : colors.mutedForeground }}>{tier.label}</Text>
                  <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: tier.discount > 0 ? (active ? colors.primary : "#4ade80") : colors.mutedForeground }}>
                    {tier.discount > 0 ? `−${tier.discount}%` : t.stats_no_discount}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      )}
    </View>
  );
}

export default function StatsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { citizen } = useCitizen();
  const { t, lang } = useLanguage();
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
          <Text style={styles.headerTitle}>{t.tab_economy.toUpperCase()}</Text>
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TouchableOpacity
            style={[styles.topupBtn, { backgroundColor: colors.muted }]}
            onPress={() => router.push("/citizens")}
            activeOpacity={0.8}
          >
            <Feather name="users" size={13} color={colors.foreground} />
            <Text style={[styles.topupBtnText, { color: colors.foreground }]}>{t.stats_registry}</Text>
          </TouchableOpacity>
          {citizen && (
            <TouchableOpacity
              style={styles.timeBankBtn}
              onPress={() => router.push("/timebank")}
              activeOpacity={0.75}
            >
              <Feather name="clock" size={14} color="#FFD700" />
              <Text style={styles.timeBankBtnText}>{t.stats_bank}</Text>
            </TouchableOpacity>
          )}
          {citizen && (
            <TouchableOpacity
              style={styles.topupBtn}
              onPress={() => router.push("/shop")}
              activeOpacity={0.8}
            >
              <Feather name="plus" size={13} color={colors.primaryForeground} />
              <Text style={styles.topupBtnText}>{t.stats_topup}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.topupBtn, { backgroundColor: colors.muted }]}
            onPress={() => router.push("/time-audit")}
            activeOpacity={0.8}
          >
            <Feather name="cpu" size={13} color={colors.primary} />
            <Text style={[styles.topupBtnText, { color: colors.primary }]}>{t.stats_audit}</Text>
          </TouchableOpacity>
          {citizen && (
            <TouchableOpacity
              style={[styles.topupBtn, { backgroundColor: colors.muted }]}
              onPress={() => router.push("/labor-profile")}
              activeOpacity={0.8}
            >
              <Feather name="briefcase" size={13} color={colors.primary} />
              <Text style={[styles.topupBtnText, { color: colors.primary }]}>{t.stats_deposit}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={styles.metricsGrid}>
        {[
          { icon: "users",    num: data?.totalCitizens ?? 0,          label: t.stats_citizens,       color: colors.primary  },
          { icon: "activity", num: data?.activeCitizens ?? 0,         label: t.stats_active,         color: colors.success  },
          { icon: "repeat",   num: data?.totalTransactions ?? 0,      label: t.stats_transactions,   color: colors.primary  },
          { icon: "clock",    num: data?.totalMinutesCirculated ?? 0, label: t.stats_in_circulation, color: colors.primary  },
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
          <Text style={styles.sectionTitle}>{t.stats_top_givers.toUpperCase()}</Text>
          {data!.topGivers.map((c, i) => (
            <View key={c.id} style={styles.rankRow}>
              <Text style={styles.rankNum}>#{i + 1}</Text>
              <View style={styles.rankAvatar}><Text style={styles.rankAvatarText}>{c.name.charAt(0)}</Text></View>
              <Text style={styles.rankName}>{c.name}</Text>
              <View style={styles.rankBadge}><Text style={styles.rankBadgeText}>+{c.totalGiven.toFixed(2)} Д</Text></View>
            </View>
          ))}
        </View>
      )}

      {(data?.recentTransactions.length ?? 0) > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t.stats_recent_tx.toUpperCase()}</Text>
          {data!.recentTransactions.map((tx) => (
            <View key={tx.id} style={styles.txRow}>
              <View style={styles.txLeft}>
                <Text style={styles.txNames}>{tx.fromCitizenName} → {tx.toCitizenName}</Text>
                <Text style={styles.txTime}>{formatDuration(tx.durationSeconds)} · {timeAgo(tx.createdAt, lang)}</Text>
              </View>
              <View style={styles.txAmount}>
                <Text style={styles.txAmountText}>+{tx.minutesTransferred.toFixed(2)}</Text>
                <Text style={styles.txAmountUnit}>Д</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {data?.totalTransactions === 0 && (
        <View style={styles.emptyState}>
          <Feather name="bar-chart-2" size={40} color={colors.mutedForeground} />
          <Text style={styles.emptyText}>{t.stats_no_tx}</Text>
          <Text style={styles.emptySubtext}>{t.stats_start_hint}</Text>
        </View>
      )}

      <CalcWidget colors={colors} />
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
    timeBankBtn: {
      flexDirection: "row", alignItems: "center", gap: 5,
      backgroundColor: "rgba(212, 175, 55, 0.15)",
      borderWidth: 1, borderColor: "#D4AF37",
      paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16,
    },
    timeBankBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#FFD700" },
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
