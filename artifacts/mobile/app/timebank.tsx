import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
  Platform,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useCitizen } from "@/context/CitizenContext";
import { useColors } from "@/hooks/useColors";

const BASE_URL = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;

interface Loan {
  id: number;
  citizenId: number;
  amount: number;
  remainingDebt: number;
  status: string;
  createdAt: string;
  repaidAt: string | null;
}

interface NextLevel {
  label: string;
  currentMinutes: number;
  targetMinutes: number;
}

interface TimeBankStatus {
  citizenId: number;
  creditLimit: number;
  activeDebt: number;
  availableCredit: number;
  maxDebtCap: number;
  atCap: boolean;
  completedServicesCount: number;
  totalMinutesWorked: number;
  nextLevel: NextLevel | null;
  statusLabel: string;
  loans: Loan[];
}

export default function TimeBankScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { citizen, refreshCitizen } = useCitizen();
  const queryClient = useQueryClient();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const [borrowAmount, setBorrowAmount] = useState("");
  const [repayAmount, setRepayAmount] = useState("");
  const [selectedLoan, setSelectedLoan] = useState<number | null>(null);

  const st = getStyles(colors, topPad);

  const { data, isLoading, refetch, isRefetching } = useQuery<TimeBankStatus>({
    queryKey: ["timebank", citizen?.id],
    queryFn: async () => {
      if (!citizen?.id) throw new Error("Не авторизован");
      const res = await fetch(`${BASE_URL}/api/timebank/status?citizenId=${citizen.id}`);
      if (!res.ok) throw new Error("Ошибка загрузки");
      return res.json() as Promise<TimeBankStatus>;
    },
    enabled: !!citizen?.id,
    refetchInterval: 15000,
  });

  const borrowMutation = useMutation({
    mutationFn: async ({ amount }: { amount: number }) => {
      const res = await fetch(`${BASE_URL}/api/timebank/borrow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ citizenId: citizen!.id, amount }),
      });
      const json = await res.json() as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Ошибка");
      return json;
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setBorrowAmount("");
      queryClient.invalidateQueries({ queryKey: ["timebank"] });
      refreshCitizen();
      Alert.alert("✅ Кредит выдан", "Дармины зачислены на баланс");
    },
    onError: (e: Error) => Alert.alert("Отказ", e.message),
  });

  const repayMutation = useMutation({
    mutationFn: async ({ loanId, amount }: { loanId: number; amount: number }) => {
      const res = await fetch(`${BASE_URL}/api/timebank/repay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ citizenId: citizen!.id, loanId, amount }),
      });
      const json = await res.json() as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Ошибка");
      return json;
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setRepayAmount("");
      setSelectedLoan(null);
      queryClient.invalidateQueries({ queryKey: ["timebank"] });
      refreshCitizen();
      Alert.alert("✅ Долг погашен", "Спасибо за исполнение обязательств");
    },
    onError: (e: Error) => Alert.alert("Отказ", e.message),
  });

  function handleBorrow() {
    const amt = parseInt(borrowAmount, 10);
    if (isNaN(amt) || amt <= 0) {
      Alert.alert("Ошибка", "Введите корректную сумму");
      return;
    }
    borrowMutation.mutate({ amount: amt });
  }

  function handleRepay(loanId: number) {
    const amt = parseInt(repayAmount, 10);
    if (isNaN(amt) || amt <= 0) {
      Alert.alert("Ошибка", "Введите корректную сумму погашения");
      return;
    }
    repayMutation.mutate({ loanId, amount: amt });
  }

  const activeLoan = data?.loans.find((l) => l.status === "active") ?? null;

  return (
    <View style={[st.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[st.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={st.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[st.title, { color: colors.foreground }]}>Банк Времени</Text>
        <View style={{ width: 38 }} />
      </View>

      {!citizen ? (
        <View style={st.center}>
          <Feather name="lock" size={40} color={colors.mutedForeground} />
          <Text style={[st.emptyText, { color: colors.mutedForeground }]}>
            Необходим аккаунт гражданина
          </Text>
        </View>
      ) : isLoading ? (
        <View style={st.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={st.scroll}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={colors.primary}
            />
          }
        >
          {/* Status card */}
          <View style={[st.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={st.cardHeader}>
              <Feather name="clock" size={20} color={colors.primary} />
              <Text style={[st.cardTitle, { color: colors.foreground }]}>
                Кредитный статус
              </Text>
            </View>
            <Text
              style={[
                st.statusLabel,
                { color: data?.atCap ? colors.destructive : colors.primary },
              ]}
            >
              {data?.statusLabel}
            </Text>

            <View style={st.metaRow}>
              <MetaItem
                label="Лимит"
                value={`${data?.creditLimit ?? 0} мин`}
                colors={colors}
              />
              <MetaItem
                label="Активный долг"
                value={`${data?.activeDebt ?? 0} мин`}
                colors={colors}
                highlight={Boolean((data?.activeDebt ?? 0) > 0)}
              />
              <MetaItem
                label="Доступно"
                value={`${data?.availableCredit ?? 0} мин`}
                colors={colors}
              />
            </View>

            {/* Credit limit progress bar */}
            <CreditBar
              creditLimit={data?.creditLimit ?? 60}
              maxCap={data?.maxDebtCap ?? 480}
              colors={colors}
            />
          </View>

          {/* Progress to next level */}
          {data?.nextLevel && (
            <View style={[st.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={st.cardHeader}>
                <Feather name="trending-up" size={18} color={colors.primary} />
                <Text style={[st.cardTitle, { color: colors.foreground }]}>
                  Следующий уровень
                </Text>
              </View>

              {data.nextLevel.targetMinutes > 0 ? (
                <>
                  <Text style={[st.nextLabel, { color: colors.mutedForeground }]}>
                    Отработано: {data.nextLevel.currentMinutes} / {data.nextLevel.targetMinutes} мин
                  </Text>
                  <View style={[st.barBg, { backgroundColor: colors.muted }]}>
                    <View
                      style={[
                        st.barFill,
                        {
                          backgroundColor: colors.primary,
                          width: `${Math.min(
                            100,
                            Math.round(
                              (data.nextLevel.currentMinutes / data.nextLevel.targetMinutes) * 100
                            )
                          )}%`,
                        },
                      ]}
                    />
                  </View>
                  <Text style={[st.nextHint, { color: colors.mutedForeground }]}>
                    {data.nextLevel.label}
                  </Text>
                </>
              ) : (
                <Text style={[st.nextHint, { color: colors.mutedForeground }]}>
                  {data.nextLevel.label}
                </Text>
              )}

              <View
                style={[st.servicesBadge, { backgroundColor: colors.muted }]}
              >
                <Feather name="check-circle" size={14} color={colors.primary} />
                <Text style={[st.servicesText, { color: colors.foreground }]}>
                  Выполнено услуг: {data.completedServicesCount}
                </Text>
              </View>
            </View>
          )}

          {/* Ladder reference */}
          <LadderCard colors={colors} current={data?.creditLimit ?? 60} />

          {/* Borrow section */}
          {!activeLoan && (data?.availableCredit ?? 0) > 0 && (
            <View style={[st.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={st.cardHeader}>
                <Feather name="download" size={18} color={colors.primary} />
                <Text style={[st.cardTitle, { color: colors.foreground }]}>
                  Взять кредит
                </Text>
              </View>
              <Text style={[st.hint, { color: colors.mutedForeground }]}>
                Доступно: {data?.availableCredit} мин · Лимит: {data?.creditLimit} мин
              </Text>
              <View style={st.inputRow}>
                <TextInput
                  style={[
                    st.input,
                    { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.muted },
                  ]}
                  placeholder="Количество Д"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="numeric"
                  value={borrowAmount}
                  onChangeText={setBorrowAmount}
                />
                <TouchableOpacity
                  style={[st.actionBtn, { backgroundColor: colors.primary }]}
                  onPress={handleBorrow}
                  disabled={borrowMutation.isPending}
                >
                  {borrowMutation.isPending ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={st.actionBtnText}>Взять</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Repay section */}
          {activeLoan && (
            <View style={[st.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={st.cardHeader}>
                <Feather name="upload" size={18} color="#f59e0b" />
                <Text style={[st.cardTitle, { color: colors.foreground }]}>
                  Погасить долг
                </Text>
              </View>
              <View style={[st.loanRow, { borderColor: colors.border }]}>
                <Text style={[st.loanMeta, { color: colors.mutedForeground }]}>
                  Взято: {activeLoan.amount} Д · Остаток: {activeLoan.remainingDebt} Д
                </Text>
                <Text style={[st.loanDate, { color: colors.mutedForeground }]}>
                  {new Date(activeLoan.createdAt).toLocaleDateString("ru-RU")}
                </Text>
              </View>
              <View style={st.inputRow}>
                <TextInput
                  style={[
                    st.input,
                    { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.muted },
                  ]}
                  placeholder={`До ${activeLoan.remainingDebt} Д`}
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="numeric"
                  value={repayAmount}
                  onChangeText={setRepayAmount}
                />
                <TouchableOpacity
                  style={[st.actionBtn, { backgroundColor: "#f59e0b" }]}
                  onPress={() => handleRepay(activeLoan.id)}
                  disabled={repayMutation.isPending}
                >
                  {repayMutation.isPending ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={st.actionBtnText}>Погасить</Text>
                  )}
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                onPress={() => {
                  setRepayAmount(String(activeLoan.remainingDebt));
                }}
              >
                <Text style={[st.fullRepay, { color: colors.primary }]}>
                  Погасить полностью ({activeLoan.remainingDebt} Д)
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Cap notice */}
          {data?.atCap && (
            <View style={[st.capNotice, { backgroundColor: colors.destructive + "22", borderColor: colors.destructive }]}>
              <Feather name="alert-triangle" size={16} color={colors.destructive} />
              <Text style={[st.capText, { color: colors.destructive }]}>
                Достигнут максимальный предел доверия Банка Времени (8 часов).
                Погасите долг для дальнейшего кредитования.
              </Text>
            </View>
          )}

          {/* History */}
          {(data?.loans.filter((l) => l.status === "repaid") ?? []).length > 0 && (
            <View style={[st.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={st.cardHeader}>
                <Feather name="list" size={16} color={colors.mutedForeground} />
                <Text style={[st.cardTitle, { color: colors.foreground }]}>
                  История погашений
                </Text>
              </View>
              {data!.loans
                .filter((l) => l.status === "repaid")
                .slice(0, 5)
                .map((l) => (
                  <View
                    key={l.id}
                    style={[st.historyRow, { borderBottomColor: colors.border }]}
                  >
                    <Text style={[st.historyAmt, { color: colors.foreground }]}>
                      +{l.amount} Д погашено
                    </Text>
                    <Text style={[st.historyDate, { color: colors.mutedForeground }]}>
                      {new Date(l.repaidAt ?? l.createdAt).toLocaleDateString("ru-RU")}
                    </Text>
                  </View>
                ))}
            </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </View>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function MetaItem({
  label,
  value,
  colors,
  highlight = false,
}: {
  label: string;
  value: string;
  colors: ReturnType<typeof useColors>;
  highlight?: boolean;
}) {
  return (
    <View style={{ alignItems: "center", flex: 1 }}>
      <Text style={{ fontSize: 18, fontWeight: "700", color: highlight ? "#f59e0b" : colors.foreground }}>
        {value}
      </Text>
      <Text style={{ fontSize: 11, color: colors.mutedForeground, marginTop: 2 }}>{label}</Text>
    </View>
  );
}

function CreditBar({
  creditLimit,
  maxCap,
  colors,
}: {
  creditLimit: number;
  maxCap: number;
  colors: ReturnType<typeof useColors>;
}) {
  const pct = Math.round((creditLimit / maxCap) * 100);
  return (
    <View style={{ marginTop: 14 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
        <Text style={{ fontSize: 11, color: colors.mutedForeground }}>60 мин</Text>
        <Text style={{ fontSize: 11, color: colors.mutedForeground }}>480 мин (потолок)</Text>
      </View>
      <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.muted, overflow: "hidden" }}>
        <View
          style={{
            height: "100%",
            borderRadius: 4,
            backgroundColor: colors.primary,
            width: `${pct}%`,
          }}
        />
      </View>
      <Text style={{ fontSize: 11, color: colors.mutedForeground, textAlign: "center", marginTop: 4 }}>
        Текущий лимит: {creditLimit} мин ({pct}% от потолка)
      </Text>
    </View>
  );
}

const LADDER = [
  { step: 1, label: "Новичок", limit: 60, req: "Начальный лимит" },
  { step: 2, label: "Первый контракт", limit: 120, req: "1 услуга" },
  { step: 3, label: "Прогрессия", limit: 180, req: "2 ч отработано" },
  { step: 4, label: "", limit: 240, req: "3 ч отработано" },
  { step: 5, label: "", limit: 300, req: "4 ч отработано" },
  { step: 6, label: "", limit: 360, req: "5 ч отработано" },
  { step: 7, label: "", limit: 420, req: "6 ч отработано" },
  { step: 8, label: "Потолок", limit: 480, req: "7 ч отработано" },
];

function LadderCard({
  colors,
  current,
}: {
  colors: ReturnType<typeof useColors>;
  current: number;
}) {
  return (
    <View style={[{ backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 12, padding: 16, marginBottom: 12 }]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <Feather name="layers" size={16} color={colors.primary} />
        <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>
          Лестница доверия
        </Text>
      </View>
      {LADDER.map((rung) => {
        const active = current === rung.limit;
        const passed = current > rung.limit;
        return (
          <View
            key={rung.step}
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingVertical: 6,
              opacity: passed ? 0.4 : 1,
            }}
          >
            <View
              style={{
                width: 28,
                height: 28,
                borderRadius: 14,
                backgroundColor: active
                  ? colors.primary
                  : passed
                  ? colors.muted
                  : colors.muted,
                alignItems: "center",
                justifyContent: "center",
                marginRight: 10,
              }}
            >
              {passed ? (
                <Feather name="check" size={14} color={colors.primary} />
              ) : (
                <Text style={{ fontSize: 11, fontWeight: "700", color: active ? "#fff" : colors.mutedForeground }}>
                  {rung.step}
                </Text>
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: active ? "700" : "400", color: colors.foreground }}>
                {rung.limit} мин{rung.label ? ` — ${rung.label}` : ""}
              </Text>
              <Text style={{ fontSize: 11, color: colors.mutedForeground }}>{rung.req}</Text>
            </View>
            {active && (
              <View style={{ backgroundColor: colors.primary + "22", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 }}>
                <Text style={{ fontSize: 10, color: colors.primary, fontWeight: "700" }}>
                  ТЕКУЩИЙ
                </Text>
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

function getStyles(colors: ReturnType<typeof useColors>, topPad: number) {
  return StyleSheet.create({
    root: { flex: 1 },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingTop: topPad,
      paddingHorizontal: 16,
      paddingBottom: 12,
      borderBottomWidth: 1,
    },
    backBtn: { padding: 8 },
    title: { fontSize: 17, fontWeight: "700" },
    scroll: { padding: 16 },
    center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
    emptyText: { fontSize: 14 },
    card: {
      borderWidth: 1,
      borderRadius: 12,
      padding: 16,
      marginBottom: 12,
    },
    cardHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
    cardTitle: { fontSize: 14, fontWeight: "600" },
    statusLabel: { fontSize: 13, fontWeight: "600", marginBottom: 12 },
    metaRow: { flexDirection: "row", justifyContent: "space-between" },
    barBg: { height: 6, borderRadius: 3, overflow: "hidden", marginVertical: 8 },
    barFill: { height: "100%", borderRadius: 3 },
    nextLabel: { fontSize: 12, marginBottom: 6 },
    nextHint: { fontSize: 12, marginTop: 6 },
    servicesBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 8,
      alignSelf: "flex-start",
      marginTop: 10,
    },
    servicesText: { fontSize: 12, fontWeight: "600" },
    hint: { fontSize: 12, marginBottom: 10 },
    inputRow: { flexDirection: "row", gap: 8 },
    input: {
      flex: 1,
      height: 42,
      borderWidth: 1,
      borderRadius: 8,
      paddingHorizontal: 12,
      fontSize: 15,
    },
    actionBtn: {
      height: 42,
      paddingHorizontal: 18,
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
    },
    actionBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
    fullRepay: { textAlign: "center", fontSize: 13, marginTop: 10, textDecorationLine: "underline" },
    loanRow: { paddingVertical: 8, borderBottomWidth: 1, marginBottom: 10 },
    loanMeta: { fontSize: 13 },
    loanDate: { fontSize: 11, marginTop: 2 },
    capNotice: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
      padding: 14,
      borderRadius: 10,
      borderWidth: 1,
      marginBottom: 12,
    },
    capText: { fontSize: 13, flex: 1, lineHeight: 18 },
    historyRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingVertical: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    historyAmt: { fontSize: 13, fontWeight: "600" },
    historyDate: { fontSize: 12 },
  });
}
