import { getBaseUrl } from "@/lib/api";
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
import { useLanguage } from "@/context/LanguageContext";
import type { UIStrings } from "@/lib/i18n";

const BASE_URL = getBaseUrl();

interface Loan {
  id: number;
  citizenId: number;
  amount: number;
  remainingDebt: number;
  status: string;
  createdAt: string;
  repaidAt: string | null;
}

interface LedgerEntry {
  id: number;
  citizenId: number;
  loanId: number | null;
  type: "loan_issued" | "manual_repayment" | "auto_repayment" | "collateral_released";
  amount: number;
  note: string | null;
  createdAt: string;
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
  ledger: LedgerEntry[];
}

interface TimeBankDisclosure {
  version: string;
  accepted: boolean;
}

function getLedgerMeta(t: UIStrings): Record<string, { icon: string; color: string; label: string }> {
  return {
    loan_issued:         { icon: "download",   color: "#3b82f6", label: t.tb_loan_issued },
    manual_repayment:    { icon: "upload",     color: "#10b981", label: t.tb_manual_repay },
    auto_repayment:      { icon: "zap",        color: "#8b5cf6", label: t.tb_auto_repay },
    collateral_released: { icon: "unlock",     color: "#f59e0b", label: t.tb_collateral },
  };
}

function getLadder(t: UIStrings) {
  return [
    { step: 1, label: t.tb_novice,         limit: 60,  req: t.tb_starting_limit },
    { step: 2, label: t.tb_first_contract, limit: 120, req: `1 ${t.tb_1_service}` },
    { step: 3, label: t.tb_progression,    limit: 180, req: `2 ${t.tb_hours_worked_req}` },
    { step: 4, label: "",                  limit: 240, req: `3 ${t.tb_hours_worked_req}` },
    { step: 5, label: "",                  limit: 300, req: `4 ${t.tb_hours_worked_req}` },
    { step: 6, label: "",                  limit: 360, req: `5 ${t.tb_hours_worked_req}` },
    { step: 7, label: "",                  limit: 420, req: `6 ${t.tb_hours_worked_req}` },
    { step: 8, label: t.tb_ceiling,        limit: 480, req: `7 ${t.tb_hours_worked_req}` },
  ];
}

export default function TimeBankScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { citizen, authToken, authHeaders, refreshCitizen } = useCitizen();
  const queryClient = useQueryClient();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const { t, lang } = useLanguage();
  const isRu = lang === "ru";

  const [borrowAmount, setBorrowAmount] = useState("");
  const [repayAmount, setRepayAmount] = useState("");
  const [borrowError, setBorrowError] = useState<string | null>(null);
  const [borrowSuccess, setBorrowSuccess] = useState(false);
  const [repayError, setRepayError] = useState<string | null>(null);
  const [repaySuccess, setRepaySuccess] = useState(false);
  const [disclosureChecked, setDisclosureChecked] = useState(false);

  const st = getStyles(colors, topPad);

  const disclosureQuery = useQuery<TimeBankDisclosure>({
    queryKey: ["timebank-disclosure", citizen?.id],
    queryFn: async () => {
      if (!authToken) throw new Error(t.tb_no_auth);
      const res = await fetch(`${BASE_URL}/api/timebank/disclosure`, { headers: authHeaders });
      if (!res.ok) throw new Error(t.error);
      return res.json() as Promise<TimeBankDisclosure>;
    },
    enabled: !!citizen?.id && !!authToken,
    retry: false,
  });

  const acceptDisclosureMutation = useMutation({
    mutationFn: async () => {
      const version = disclosureQuery.data?.version;
      if (!version || !authToken) throw new Error(t.tb_no_auth);
      const res = await fetch(`${BASE_URL}/api/timebank/disclosure/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ version, language: isRu ? "ru" : "en" }),
      });
      const json = await res.json() as { error?: string; accepted?: boolean; version?: string };
      if (!res.ok || !json.accepted) throw new Error(json.error ?? t.error);
      return json as TimeBankDisclosure;
    },
    onSuccess: (data) => {
      setDisclosureChecked(false);
      queryClient.setQueryData(["timebank-disclosure", citizen?.id], data);
      queryClient.invalidateQueries({ queryKey: ["timebank", citizen?.id] });
    },
  });

  const { data, isLoading, refetch, isRefetching } = useQuery<TimeBankStatus>({
    queryKey: ["timebank", citizen?.id],
    queryFn: async () => {
      if (!citizen?.id || !authToken) throw new Error(t.tb_no_auth);
      const res = await fetch(`${BASE_URL}/api/timebank/status`, { headers: authHeaders });
      if (!res.ok) throw new Error(t.error);
      return res.json() as Promise<TimeBankStatus>;
    },
    enabled: !!citizen?.id && !!authToken && disclosureQuery.data?.accepted === true,
    refetchInterval: 15000,
  });

  const borrowMutation = useMutation({
    mutationFn: async ({ amount }: { amount: number }) => {
      const res = await fetch(`${BASE_URL}/api/timebank/borrow`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ amount }),
      });
      const json = await res.json() as { error?: string };
      if (!res.ok) throw new Error(json.error ?? t.error);
      return json;
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setBorrowAmount("");
      setBorrowError(null);
      setBorrowSuccess(true);
      setTimeout(() => setBorrowSuccess(false), 3000);
      queryClient.invalidateQueries({ queryKey: ["timebank"] });
      refreshCitizen();
    },
    onError: (e: Error) => {
      setBorrowSuccess(false);
      setBorrowError(e.message);
    },
  });

  const repayMutation = useMutation({
    mutationFn: async ({ amount }: { amount: number }) => {
      const res = await fetch(`${BASE_URL}/api/timebank/repay`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ amount }),
      });
      const json = await res.json() as { error?: string };
      if (!res.ok) throw new Error(json.error ?? t.error);
      return json;
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setRepayAmount("");
      setRepayError(null);
      setRepaySuccess(true);
      setTimeout(() => setRepaySuccess(false), 3000);
      queryClient.invalidateQueries({ queryKey: ["timebank"] });
      refreshCitizen();
    },
    onError: (e: Error) => {
      setRepaySuccess(false);
      setRepayError(e.message);
    },
  });

  function handleBorrow() {
    const amt = parseInt(borrowAmount, 10);
    if (isNaN(amt) || amt <= 0) {
      setBorrowError(t.tb_invalid_amount);
      return;
    }
    setBorrowError(null);
    borrowMutation.mutate({ amount: amt });
  }

  function handleRepay() {
    const amt = parseInt(repayAmount, 10);
    if (isNaN(amt) || amt <= 0) {
      setRepayError(t.tb_invalid_repay);
      return;
    }
    setRepayError(null);
    repayMutation.mutate({ amount: amt });
  }

  const activeLoan = data?.loans.find((l) => l.status === "active") ?? null;
  const ledgerMeta = getLedgerMeta(t);

  return (
    <View style={[st.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[st.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={st.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[st.title, { color: colors.foreground }]}>{t.tb_title}</Text>
        <View style={{ width: 38 }} />
      </View>

      {!citizen ? (
        <View style={st.center}>
          <Feather name="lock" size={40} color={colors.mutedForeground} />
          <Text style={[st.emptyText, { color: colors.mutedForeground }]}>
            {t.tb_no_auth}
          </Text>
        </View>
      ) : !authToken ? (
        <View style={st.center}>
          <Feather name="lock" size={40} color={colors.mutedForeground} />
          <Text style={[st.emptyText, { color: colors.mutedForeground }]}>
            {t.tb_no_auth}
          </Text>
        </View>
      ) : disclosureQuery.isLoading ? (
        <View style={st.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : disclosureQuery.isError || !disclosureQuery.data ? (
        <View style={st.center}>
          <Text style={[st.emptyText, { color: colors.mutedForeground }]}>
            {isRu ? "Не удалось проверить подтверждение юридической информации." : "Could not check the legal information acknowledgement."}
          </Text>
          <TouchableOpacity
            style={[st.actionBtn, { backgroundColor: colors.primary }]}
            onPress={() => void disclosureQuery.refetch()}
          >
            <Text style={st.actionBtnText}>{isRu ? "Повторить" : "Retry"}</Text>
          </TouchableOpacity>
        </View>
      ) : !disclosureQuery.data.accepted ? (
        <ScrollView contentContainerStyle={st.disclosureScroll}>
          <View style={[st.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={st.cardHeader}>
              <Feather name="shield" size={20} color={colors.primary} />
              <Text style={[st.cardTitle, { color: colors.foreground }]}>
                {isRu ? "Перед использованием Банка времени" : "Before using the Time Bank"}
              </Text>
            </View>
            <Text style={[st.disclosureHeading, { color: colors.foreground }]}>
              {isRu ? "Пожалуйста, ознакомьтесь с условиями" : "Please review this information"}
            </Text>
            <Text style={[st.disclosureText, { color: colors.foreground }]}>
              {isRu
                ? "Банк времени предоставляет кредит в минутах (Д). Взятая сумма поступает на баланс и учитывается как задолженность. Берите только ту сумму, которую готовы погасить."
                : "The Time Bank provides credit in minutes (Д). The amount you borrow is added to your balance and recorded as debt. Borrow only an amount you are prepared to repay."}
            </Text>
            <Text style={[st.disclosureText, { color: colors.foreground }]}>
              {isRu
                ? "Доступная сумма зависит от вашего лимита доверия и активного долга. Лимит может повышаться по мере выполнения услуг и получения минут; конкретные значения и прогресс показываются на экране."
                : "The available amount depends on your trust limit and active debt. The limit may increase as you complete services and receive minutes; the current values and progress appear on screen."}
            </Text>
            <Text style={[st.disclosureText, { color: colors.foreground }]}>
              {isRu
                ? "Погасить долг можно вручную с баланса, сохраняя одну непередаваемую родовую минуту. При наличии долга заработанные минуты TiMETR автоматически направляются на погашение."
                : "You can repay debt manually from your balance while keeping one non-transferable ancestral minute. When you have debt, minutes earned through TiMETR are automatically applied to repayment."}
            </Text>
            <Text style={[st.disclosureText, { color: colors.foreground }]}>
              {isRu
                ? "Это описание не является юридическим заключением и не подтверждает соответствие Банка времени законам какой-либо страны. Правовой статус зависит от местного законодательства и особенностей продукта; для оценки соответствия требуется заключение квалифицированного юриста в вашей стране."
                : "This information is not a legal opinion and does not certify that the Time Bank complies with the laws of any country. Its legal status depends on local law and product details; a qualified lawyer in your country must assess compliance."}
            </Text>
            <TouchableOpacity
              style={st.disclosureCheckRow}
              onPress={() => setDisclosureChecked((checked) => !checked)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: disclosureChecked }}
              testID="timebank-disclosure-checkbox"
            >
              <View style={[
                st.checkbox,
                { borderColor: disclosureChecked ? colors.primary : colors.border },
                disclosureChecked && { backgroundColor: colors.primary },
              ]}>
                {disclosureChecked && <Feather name="check" size={15} color={colors.primaryForeground} />}
              </View>
              <Text style={[st.disclosureCheckText, { color: colors.foreground }]}>
                {isRu
                  ? "Я ознакомился(ась) с этой информацией и принимаю условия использования Банка времени."
                  : "I have read this information and accept the Time Bank terms."}
              </Text>
            </TouchableOpacity>
            {acceptDisclosureMutation.isError && (
              <Text style={[st.disclosureError, { color: colors.destructive }]}>
                {acceptDisclosureMutation.error instanceof Error ? acceptDisclosureMutation.error.message : t.error}
              </Text>
            )}
            <TouchableOpacity
              style={[st.disclosureAcceptBtn, { backgroundColor: colors.primary, opacity: disclosureChecked && !acceptDisclosureMutation.isPending ? 1 : 0.5 }]}
              onPress={() => acceptDisclosureMutation.mutate()}
              disabled={!disclosureChecked || acceptDisclosureMutation.isPending}
              accessibilityRole="button"
              testID="timebank-disclosure-accept"
            >
              {acceptDisclosureMutation.isPending
                ? <ActivityIndicator color={colors.primaryForeground} />
                : <Text style={[st.disclosureAcceptText, { color: colors.primaryForeground }]}>
                    {isRu ? "Подтвердить и продолжить" : "Accept and continue"}
                  </Text>}
            </TouchableOpacity>
          </View>
        </ScrollView>
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
                {t.tb_credit_status}
              </Text>
            </View>
            <Text style={[st.statusLabel, { color: data?.atCap ? colors.destructive : colors.primary }]}>
              {data?.statusLabel}
            </Text>

            <View style={st.metaRow}>
              <MetaItem
                label={t.tb_limit}
                value={`${data?.creditLimit ?? 0} ${t.tb_min}`}
                colors={colors}
              />
              <MetaItem
                label={t.tb_active_debt}
                value={`${data?.activeDebt ?? 0} ${t.tb_min}`}
                colors={colors}
                highlight={Boolean((data?.activeDebt ?? 0) > 0)}
              />
              <MetaItem
                label={t.tb_available}
                value={`${data?.availableCredit ?? 0} ${t.tb_min}`}
                colors={colors}
              />
            </View>

            {/* Debt progress bar */}
            {(data?.activeDebt ?? 0) > 0 && (
              <DebtBar
                activeDebt={data!.activeDebt}
                creditLimit={data!.creditLimit}
                colors={colors}
                t={t}
              />
            )}

            {/* Credit limit progress bar */}
            <CreditBar
              creditLimit={data?.creditLimit ?? 60}
              maxCap={data?.maxDebtCap ?? 480}
              colors={colors}
              t={t}
            />
          </View>

          {/* Progress to next level */}
          {data?.nextLevel && (
            <View style={[st.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={st.cardHeader}>
                <Feather name="trending-up" size={18} color={colors.primary} />
                <Text style={[st.cardTitle, { color: colors.foreground }]}>{t.tb_next_level}</Text>
              </View>

              {data.nextLevel.targetMinutes > 0 ? (
                <>
                  <Text style={[st.nextLabel, { color: colors.mutedForeground }]}>
                    {t.tb_worked}: {data.nextLevel.currentMinutes} / {data.nextLevel.targetMinutes} {t.tb_min}
                  </Text>
                  <View style={[st.barBg, { backgroundColor: colors.muted }]}>
                    <View
                      style={[
                        st.barFill,
                        {
                          backgroundColor: colors.primary,
                          width: `${Math.min(100, Math.round((data.nextLevel.currentMinutes / data.nextLevel.targetMinutes) * 100))}%`,
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

              <View style={[st.servicesBadge, { backgroundColor: colors.muted }]}>
                <Feather name="check-circle" size={14} color={colors.primary} />
                <Text style={[st.servicesText, { color: colors.foreground }]}>
                  {t.tb_completed_services}: {data.completedServicesCount}
                </Text>
              </View>
            </View>
          )}

          {/* Ladder reference */}
          <LadderCard colors={colors} current={data?.creditLimit ?? 60} t={t} />

          {/* Borrow section */}
          {(data?.availableCredit ?? 0) > 0 && (
            <View style={[st.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={st.cardHeader}>
                <Feather name="download" size={18} color={colors.primary} />
                <Text style={[st.cardTitle, { color: colors.foreground }]}>{t.tb_borrow}</Text>
              </View>
              <Text style={[st.hint, { color: colors.mutedForeground }]}>
                {t.tb_available}: {data?.availableCredit} {t.tb_min} · {t.tb_limit}: {data?.creditLimit} {t.tb_min}
              </Text>
              <View style={st.inputRow}>
                <TextInput
                  style={[st.input, { color: colors.foreground, borderColor: borrowError ? colors.destructive : colors.border, backgroundColor: colors.muted }]}
                  placeholder={t.tb_borrow_amount}
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="numeric"
                  value={borrowAmount}
                  onChangeText={(v) => { setBorrowAmount(v); setBorrowError(null); }}
                />
                <TouchableOpacity
                  style={[st.actionBtn, { backgroundColor: colors.primary }]}
                  onPress={handleBorrow}
                  disabled={borrowMutation.isPending}
                >
                  {borrowMutation.isPending ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={st.actionBtnText}>{t.tb_take}</Text>
                  )}
                </TouchableOpacity>
              </View>
              {borrowError && (
                <View style={[st.inlineBanner, { backgroundColor: colors.destructive + "18", borderColor: colors.destructive + "55" }]}>
                  <Feather name="alert-circle" size={13} color={colors.destructive} />
                  <Text style={[st.inlineBannerText, { color: colors.destructive }]}>{borrowError}</Text>
                </View>
              )}
              {borrowSuccess && (
                <View style={[st.inlineBanner, { backgroundColor: "#10b98118", borderColor: "#10b98155" }]}>
                  <Feather name="check-circle" size={13} color="#10b981" />
                  <Text style={[st.inlineBannerText, { color: "#10b981" }]}>{t.tb_borrow_success}</Text>
                </View>
              )}
            </View>
          )}

          {/* Repay section */}
          {activeLoan && (
            <View style={[st.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={st.cardHeader}>
                <Feather name="upload" size={18} color="#f59e0b" />
                <Text style={[st.cardTitle, { color: colors.foreground }]}>{t.tb_repay_loan}</Text>
              </View>

              {/* Debt summary */}
              <View style={[st.debtSummary, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 22, fontWeight: "800", color: "#f59e0b" }}>
                    {activeLoan.remainingDebt} Д
                  </Text>
                  <Text style={{ fontSize: 11, color: colors.mutedForeground, marginTop: 2 }}>
                    {t.tb_debt_remaining} · {t.tb_taken} {activeLoan.amount} Д · {new Date(activeLoan.createdAt).toLocaleDateString()}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={{ fontSize: 11, color: colors.mutedForeground }}>{t.tb_balance}</Text>
                  <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground }}>
                    {(citizen.balanceMinutes - 1).toFixed(2)} Д
                  </Text>
                </View>
              </View>

              <View style={{ marginVertical: 10 }}>
                <View style={[st.barBg, { backgroundColor: colors.muted }]}>
                  <View
                    style={[
                      st.barFill,
                      {
                        backgroundColor: "#f59e0b",
                        width: `${Math.round((activeLoan.remainingDebt / activeLoan.amount) * 100)}%`,
                      },
                    ]}
                  />
                </View>
                <Text style={{ fontSize: 10, color: colors.mutedForeground, textAlign: "center", marginTop: 4 }}>
                  {activeLoan.amount - activeLoan.remainingDebt} / {activeLoan.amount} Д
                </Text>
              </View>

              <Text style={[st.hint, { color: colors.mutedForeground, marginBottom: 4 }]}>
                💡 {t.tb_auto_note}
              </Text>

              <View style={st.inputRow}>
                <TextInput
                  style={[st.input, { color: colors.foreground, borderColor: repayError ? colors.destructive : colors.border, backgroundColor: colors.muted }]}
                  placeholder={`${t.tb_limit} ${activeLoan.remainingDebt} Д`}
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="numeric"
                  value={repayAmount}
                  onChangeText={(v) => { setRepayAmount(v); setRepayError(null); }}
                />
                <TouchableOpacity
                  style={[st.actionBtn, { backgroundColor: "#f59e0b" }]}
                  onPress={handleRepay}
                  disabled={repayMutation.isPending}
                >
                  {repayMutation.isPending ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={st.actionBtnText}>{t.tb_repay_btn}</Text>
                  )}
                </TouchableOpacity>
              </View>
              <TouchableOpacity onPress={() => setRepayAmount(String(activeLoan.remainingDebt))}>
                <Text style={[st.fullRepay, { color: colors.primary }]}>
                  {t.tb_repay_full} ({activeLoan.remainingDebt} Д) →
                </Text>
              </TouchableOpacity>
              {repayError && (
                <View style={[st.inlineBanner, { backgroundColor: colors.destructive + "18", borderColor: colors.destructive + "55" }]}>
                  <Feather name="alert-circle" size={13} color={colors.destructive} />
                  <Text style={[st.inlineBannerText, { color: colors.destructive }]}>{repayError}</Text>
                </View>
              )}
              {repaySuccess && (
                <View style={[st.inlineBanner, { backgroundColor: "#10b98118", borderColor: "#10b98155" }]}>
                  <Feather name="check-circle" size={13} color="#10b981" />
                  <Text style={[st.inlineBannerText, { color: "#10b981" }]}>{t.tb_repay_success}</Text>
                </View>
              )}
            </View>
          )}

          {/* Cap notice */}
          {data?.atCap && (
            <View style={[st.capNotice, { backgroundColor: colors.destructive + "22", borderColor: colors.destructive }]}>
              <Feather name="alert-triangle" size={16} color={colors.destructive} />
              <Text style={[st.capText, { color: colors.destructive }]}>
                {t.tb_cap_notice}
              </Text>
            </View>
          )}

          {/* Ledger history */}
          {(data?.ledger?.length ?? 0) > 0 && (
            <View style={[st.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={st.cardHeader}>
                <Feather name="list" size={16} color={colors.mutedForeground} />
                <Text style={[st.cardTitle, { color: colors.foreground }]}>{t.tb_history}</Text>
              </View>
              {[...(data!.ledger)].reverse().slice(0, 20).map((entry) => {
                const meta = ledgerMeta[entry.type] ?? { icon: "circle", color: colors.mutedForeground, label: entry.type };
                const sign = entry.type === "loan_issued" ? "+" : entry.type === "collateral_released" ? "🔓" : "−";
                return (
                  <View key={entry.id} style={[st.historyRow, { borderBottomColor: colors.border }]}>
                    <View style={[st.historyIcon, { backgroundColor: meta.color + "22" }]}>
                      <Feather name={meta.icon as never} size={14} color={meta.color} />
                    </View>
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground }}>
                        {meta.label}
                      </Text>
                      {entry.note && (
                        <Text style={{ fontSize: 11, color: colors.mutedForeground, marginTop: 1 }}>
                          {entry.note}
                        </Text>
                      )}
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={{ fontSize: 14, fontWeight: "700", color: meta.color }}>
                        {typeof sign === "string" && sign !== "🔓" ? `${sign}${entry.amount}` : `${sign} ${entry.amount}`} Д
                      </Text>
                      <Text style={{ fontSize: 10, color: colors.mutedForeground, marginTop: 2 }}>
                        {new Date(entry.createdAt).toLocaleDateString()}
                      </Text>
                    </View>
                  </View>
                );
              })}
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

function DebtBar({
  activeDebt,
  creditLimit,
  colors,
  t,
}: {
  activeDebt: number;
  creditLimit: number;
  colors: ReturnType<typeof useColors>;
  t: UIStrings;
}) {
  const pct = Math.min(100, Math.round((activeDebt / creditLimit) * 100));
  return (
    <View style={{ marginTop: 12, marginBottom: 4 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 3 }}>
        <Text style={{ fontSize: 11, color: "#f59e0b", fontWeight: "600" }}>{t.tb_debt}: {activeDebt} Д</Text>
        <Text style={{ fontSize: 11, color: colors.mutedForeground }}>{pct}% {t.tb_of_limit}</Text>
      </View>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.muted, overflow: "hidden" }}>
        <View style={{ height: "100%", borderRadius: 3, backgroundColor: "#f59e0b", width: `${pct}%` }} />
      </View>
    </View>
  );
}

function CreditBar({
  creditLimit,
  maxCap,
  colors,
  t,
}: {
  creditLimit: number;
  maxCap: number;
  colors: ReturnType<typeof useColors>;
  t: UIStrings;
}) {
  const pct = Math.round((creditLimit / maxCap) * 100);
  return (
    <View style={{ marginTop: 14 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
        <Text style={{ fontSize: 11, color: colors.mutedForeground }}>60 {t.tb_min}</Text>
        <Text style={{ fontSize: 11, color: colors.mutedForeground }}>480 {t.tb_min} ({t.tb_ceiling})</Text>
      </View>
      <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.muted, overflow: "hidden" }}>
        <View style={{ height: "100%", borderRadius: 4, backgroundColor: colors.primary, width: `${pct}%` }} />
      </View>
      <Text style={{ fontSize: 11, color: colors.mutedForeground, textAlign: "center", marginTop: 4 }}>
        {t.tb_current_limit}: {creditLimit} {t.tb_min} ({pct}% {t.tb_of_limit})
      </Text>
    </View>
  );
}

function LadderCard({ colors, current, t }: { colors: ReturnType<typeof useColors>; current: number; t: UIStrings }) {
  const ladder = getLadder(t);
  return (
    <View style={[{ backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 12, padding: 16, marginBottom: 12 }]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <Feather name="layers" size={16} color={colors.primary} />
        <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>{t.tb_trust_ladder}</Text>
      </View>
      {ladder.map((rung) => {
        const active = current === rung.limit;
        const passed = current > rung.limit;
        return (
          <View key={rung.step} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 6, opacity: passed ? 0.4 : 1 }}>
            <View style={{
              width: 28, height: 28, borderRadius: 14,
              backgroundColor: active ? colors.primary : colors.muted,
              alignItems: "center", justifyContent: "center", marginRight: 10,
            }}>
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
                {rung.limit} {t.tb_min}{rung.label ? ` — ${rung.label}` : ""}
              </Text>
              <Text style={{ fontSize: 11, color: colors.mutedForeground }}>{rung.req}</Text>
            </View>
            {active && (
              <View style={{ backgroundColor: colors.primary + "22", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 }}>
                <Text style={{ fontSize: 10, color: colors.primary, fontWeight: "700" }}>{t.tb_current_badge}</Text>
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
      flexDirection: "row", alignItems: "center", justifyContent: "space-between",
      paddingTop: topPad, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1,
    },
    backBtn: { padding: 8 },
    title: { fontSize: 17, fontWeight: "700" },
    scroll: { padding: 16 },
    disclosureScroll: { padding: 16, paddingBottom: 32 },
    disclosureHeading: { fontSize: 15, fontWeight: "700", marginBottom: 10 },
    disclosureText: { fontSize: 13, lineHeight: 20, marginBottom: 12 },
    disclosureCheckRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginTop: 4, marginBottom: 12 },
    checkbox: { width: 22, height: 22, borderWidth: 1.5, borderRadius: 5, alignItems: "center", justifyContent: "center" },
    disclosureCheckText: { flex: 1, fontSize: 13, lineHeight: 19 },
    disclosureError: { fontSize: 12, lineHeight: 18, marginBottom: 8 },
    disclosureAcceptBtn: { minHeight: 48, borderRadius: 10, alignItems: "center", justifyContent: "center", paddingHorizontal: 14 },
    disclosureAcceptText: { fontSize: 14, fontWeight: "700" },
    center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
    emptyText: { fontSize: 14 },
    card: { borderWidth: 1, borderRadius: 12, padding: 16, marginBottom: 12 },
    cardHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
    cardTitle: { fontSize: 14, fontWeight: "600" },
    statusLabel: { fontSize: 13, fontWeight: "600", marginBottom: 12 },
    metaRow: { flexDirection: "row", justifyContent: "space-between" },
    barBg: { height: 6, borderRadius: 3, overflow: "hidden", marginVertical: 8 },
    barFill: { height: "100%", borderRadius: 3 },
    nextLabel: { fontSize: 12, marginBottom: 6 },
    nextHint: { fontSize: 12, marginTop: 6 },
    servicesBadge: {
      flexDirection: "row", alignItems: "center", gap: 6,
      paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
      alignSelf: "flex-start", marginTop: 10,
    },
    servicesText: { fontSize: 12, fontWeight: "600" },
    hint: { fontSize: 12, marginBottom: 10 },
    inputRow: { flexDirection: "row", gap: 8 },
    input: { flex: 1, height: 42, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, fontSize: 15 },
    actionBtn: { height: 42, paddingHorizontal: 18, borderRadius: 8, alignItems: "center", justifyContent: "center" },
    actionBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
    fullRepay: { fontSize: 13, marginTop: 10, textAlign: "center" },
    capNotice: {
      flexDirection: "row", alignItems: "flex-start", gap: 8,
      borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 12,
    },
    capText: { flex: 1, fontSize: 12, lineHeight: 18 },
    historyRow: {
      flexDirection: "row", alignItems: "center",
      paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth,
    },
    historyIcon: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
    debtSummary: {
      flexDirection: "row", alignItems: "center",
      borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 10,
    },
    inlineBanner: {
      flexDirection: "row", alignItems: "center", gap: 7,
      borderWidth: 1, borderRadius: 8, padding: 10, marginTop: 8,
    },
    inlineBannerText: { flex: 1, fontSize: 12, lineHeight: 17 },
  });
}
