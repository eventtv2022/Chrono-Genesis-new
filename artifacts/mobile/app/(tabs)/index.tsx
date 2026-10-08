import { getBaseUrl } from "@/lib/api";
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
  TextInput,
  ScrollView,
  Modal,
  Switch,
  Linking,
} from "react-native";
import { getStoredAuthHeaders } from "@/lib/authStorage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useCitizen } from "@/context/CitizenContext";
import { useLanguage } from "@/context/LanguageContext";
import { UI } from "@/lib/i18n";
import { useColors } from "@/hooks/useColors";
import { LogoBrand } from "@/components/LogoBrand";
import { AnimatedHourglass } from "@/components/AnimatedHourglass";
import { CitizenAvatar } from "@/components/CitizenAvatar";
import { ContextualGuideModal } from "@/components/ContextualGuideModal";
import { useContextualGuide } from "@/hooks/useContextualGuide";
import { DiscussionModal } from "@/components/DiscussionModal";
import { ResizeMode, Video } from "expo-av";

const BASE_URL = getBaseUrl();

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

interface RateInfo {
  id: number;
  name: string;
  calculatedMinuteRate: number;
  calculatedHourRate: number;
  professionalSkills: string | null;
  reviewScoreCount: number;
  meritScore: number;
  rank: string;
  skillsAuditedAt: string | null;
}

interface Deal {
  id: number;
  senderId: number;
  receiverId: number | null;
  amount: number;
  description: string;
  status: string;
  proofUrl: string | null;
  proofText: string | null;
  disputeClaimText: string | null;
  aiVerdict: string | null;
  timerStatus: string;
  totalTrackedMinutes: number;
  timerStartedAt: string | null;
  createdAt: string;
  updatedAt: string;
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
  transaction: { id: number; minutesTransferred: number; durationSeconds: number };
  sheetsLogged: boolean;
}

function MobileWelcome() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { lang } = useLanguage();
  const isRu = lang !== "en";
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: topInset }}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 12, paddingBottom: bottomInset + 26, alignItems: "center" }}
        showsVerticalScrollIndicator={false}
      >
        <Video
          source={require("@/assets/videos/timenation-flag.mp4")}
          usePoster
          posterSource={require("@/assets/videos/timenation-flag-poster.jpg")}
          style={{ width: "100%", maxWidth: 520, aspectRatio: 16 / 9, borderRadius: 16, backgroundColor: colors.card, overflow: "hidden" }}
          resizeMode={ResizeMode.CONTAIN}
          shouldPlay
          isLooping
          isMuted
          useNativeControls={false}
          testID="video-welcome-flag"
        />
        <View style={{ width: "100%", maxWidth: 520, alignItems: "center", marginTop: 25 }}>
          <LogoBrand size={54} />
          <Text style={{ color: colors.primary, fontFamily: "Inter_700Bold", fontSize: 12, letterSpacing: 3, marginTop: 14 }}>
            TIMENATION
          </Text>
          <Text style={{ color: colors.foreground, fontFamily: "Inter_700Bold", fontSize: 29, textAlign: "center", lineHeight: 36, marginTop: 12 }}>
            {isRu ? "Ваше время. Ваше государство." : "Your time. Your nation."}
          </Text>
          <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 15, textAlign: "center", lineHeight: 23, marginTop: 12, maxWidth: 420 }}>
            {isRu
              ? "Познакомьтесь с кошельком DarMin, обменом временем и инструментами сообщества."
              : "Explore the DarMin wallet, time exchange, and community tools."}
          </Text>
        </View>
        <View style={{ width: "100%", maxWidth: 520, gap: 11, marginTop: 26 }}>
          <TouchableOpacity
            onPress={() => router.push("/onboarding")}
            activeOpacity={0.82}
            testID="button-welcome-register"
            style={{ minHeight: 54, borderRadius: 12, paddingHorizontal: 18, backgroundColor: colors.primary, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 }}
          >
            <Feather name="user-plus" size={18} color={colors.primaryForeground} />
            <Text style={{ color: colors.primaryForeground, fontFamily: "Inter_700Bold", fontSize: 15 }}>
              {isRu ? "Оформить паспорт" : "Register for a passport"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.push("/login")}
            activeOpacity={0.82}
            testID="button-welcome-login"
            style={{ minHeight: 54, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 18, backgroundColor: colors.card, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 }}
          >
            <Feather name="log-in" size={18} color={colors.foreground} />
            <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold", fontSize: 15 }}>
              {isRu ? "Войти в кабинет" : "Log in"}
            </Text>
          </TouchableOpacity>
        </View>
        <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 11, textAlign: "center", marginTop: 18 }}>
          {isRu ? "$1 DarMin = 1 минута" : "$1 DarMin = 1 minute"}
        </Text>
      </ScrollView>
    </View>
  );
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

const STATUS_COLORS: Record<string, string> = {
  open: "#4CAF50",
  accepted: "#2196F3",
  proof_submitted: "#FF9800",
  completed: "#C9A84C",
  declined: "#F44336",
  disputed: "#9C27B0",
  cancelled: "#607D8B",
};

// ─── Telegram Notifications Section ──────────────────────────────────────────
interface TgStatus {
  linked: boolean;
  username: string | null;
  settings: {
    dm: boolean;
    capsules: boolean;
    mentions: boolean;
    state: boolean;
    all_groups: boolean;
  };
}

function TelegramSection({
  colors,
  ui,
}: {
  colors: ReturnType<typeof useColors>;
  ui: import("@/lib/i18n").UIStrings;
}) {
  const [status, setStatus] = useState<TgStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const hdrs = await getStoredAuthHeaders();
      const res = await fetch(`${BASE_URL}/api/telegram/status`, { headers: hdrs });
      if (res.ok) setStatus(await res.json() as TgStatus);
    } catch (_) { /* silent */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { void fetchStatus(); }, [fetchStatus]);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const hdrs = await getStoredAuthHeaders();
      const res = await fetch(`${BASE_URL}/api/telegram/bind-token`, {
        method: "POST",
        headers: hdrs,
      });
      if (!res.ok) { Alert.alert(ui.error, (await res.json() as { error?: string }).error ?? ui.error); return; }
      const { deepLink } = await res.json() as { deepLink: string };
      await Linking.openURL(deepLink);
      // Poll for success after returning from Telegram
      setTimeout(() => { void fetchStatus(); }, 3000);
      setTimeout(() => { void fetchStatus(); }, 8000);
    } catch (e) {
      Alert.alert(ui.error, String(e));
    } finally { setConnecting(false); }
  };

  const handleDisconnect = () => {
    Alert.alert(ui.tg_section_title, ui.tg_disconnect + "?", [
      { text: ui.cancel, style: "cancel" },
      {
        text: ui.tg_disconnect, style: "destructive",
        onPress: async () => {
          setDisconnecting(true);
          try {
            const hdrs = await getStoredAuthHeaders();
            await fetch(`${BASE_URL}/api/telegram/unbind`, { method: "DELETE", headers: hdrs });
            await fetchStatus();
          } catch (_) { /* silent */ } finally { setDisconnecting(false); }
        },
      },
    ]);
  };

  const toggleSetting = async (key: keyof TgStatus["settings"], value: boolean) => {
    if (!status) return;
    setStatus(prev => prev ? { ...prev, settings: { ...prev.settings, [key]: value } } : prev);
    try {
      const hdrs = await getStoredAuthHeaders();
      await fetch(`${BASE_URL}/api/telegram/settings`, {
        method: "PATCH",
        headers: { ...hdrs, "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: value }),
      });
    } catch (_) { void fetchStatus(); }
  };

  const C = colors;
  const gold = C.primary;
  const goldAlpha = (a: number) => `rgba(201,168,76,${a})`;

  if (loading) return null;

  return (
    <View style={{ marginHorizontal: 20, marginBottom: 12, borderWidth: 1, borderColor: goldAlpha(0.3), borderRadius: 14, backgroundColor: C.surface, overflow: "hidden" }}>
      {/* Header row */}
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingTop: 12, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: goldAlpha(0.15) }}>
        <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: goldAlpha(0.12), borderWidth: 1, borderColor: goldAlpha(0.35), alignItems: "center", justifyContent: "center", marginRight: 10 }}>
          <Feather name="send" size={14} color={gold} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: C.foreground }}>{ui.tg_section_title}</Text>
          <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: C.mutedForeground, marginTop: 1 }}>
            {status?.linked ? (status.username ?? ui.tg_connected) : ui.tg_not_linked}
          </Text>
        </View>
        {status?.linked ? (
          <TouchableOpacity
            style={{ borderWidth: 1, borderColor: "#ef444455", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: "#ef444410" }}
            onPress={handleDisconnect}
            disabled={disconnecting}
            activeOpacity={0.75}
          >
            {disconnecting
              ? <ActivityIndicator size={12} color="#ef4444" />
              : <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#ef4444" }}>{ui.tg_disconnect}</Text>}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={{ borderWidth: 1, borderColor: goldAlpha(0.5), borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: goldAlpha(0.1) }}
            onPress={handleConnect}
            disabled={connecting}
            activeOpacity={0.75}
          >
            {connecting
              ? <ActivityIndicator size={12} color={gold} />
              : <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: gold }}>{ui.tg_connect}</Text>}
          </TouchableOpacity>
        )}
      </View>

      {/* Notification toggles — always visible so the user can configure before linking too */}
      {status && (
        <View style={{ paddingHorizontal: 14, paddingVertical: 10, gap: 0 }}>
          <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold", color: C.mutedForeground, letterSpacing: 0.5, marginBottom: 8, textTransform: "uppercase" }}>
            {ui.tg_settings_title}
          </Text>
          {(
            [
              ["dm",         ui.tg_notify_dm],
              ["capsules",   ui.tg_notify_capsules],
              ["mentions",   ui.tg_notify_mentions],
              ["state",      ui.tg_notify_state],
              ["all_groups", ui.tg_notify_all_groups],
            ] as [keyof TgStatus["settings"], string][]
          ).map(([key, label]) => (
            <View key={key} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 7, borderBottomWidth: key === "all_groups" ? 0 : 0.5, borderBottomColor: goldAlpha(0.1) }}>
              <Text style={{ flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", color: C.foreground }}>{label}</Text>
              <Switch
                value={!!status.settings[key]}
                onValueChange={(v) => void toggleSetting(key, v)}
                trackColor={{ false: C.border, true: goldAlpha(0.5) }}
                thumbColor={status.settings[key] ? gold : C.mutedForeground}
                ios_backgroundColor={C.border}
              />
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// ─── AI Rate Widget ───────────────────────────────────────────────────────────
function RateWidget({ recipient, colors }: { recipient: Citizen; colors: ReturnType<typeof useColors> }) {
  const { t } = useLanguage();
  const [rate, setRate] = useState<RateInfo | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setRate(null);
    setLoading(true);
    fetch(`${BASE_URL}/api/citizens/${recipient.id}/rate`)
      .then((r) => r.json())
      .then((data: RateInfo) => setRate(data))
      .catch(() => {/* silently ignore */})
      .finally(() => setLoading(false));
  }, [recipient.id]);

  if (loading) {
    return (
      <View style={[rateStyles.container, { borderColor: colors.border }]}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  }
  if (!rate) return null;

  return (
    <View style={[rateStyles.container, { borderColor: colors.primary, backgroundColor: "rgba(201,168,76,0.07)" }]}>
      <View style={rateStyles.header}>
        <Feather name="shield" size={14} color={colors.primary} />
        <Text style={[rateStyles.title, { color: colors.primary }]}>{t.timer_ai_checker}</Text>
        {rate.skillsAuditedAt && (
          <Text style={[rateStyles.badge, { color: colors.mutedForeground }]}>{t.timer_confirmed}</Text>
        )}
      </View>
      <View style={rateStyles.row}>
        <View style={rateStyles.stat}>
          <Text style={[rateStyles.statVal, { color: colors.primary }]}>{rate.calculatedMinuteRate.toFixed(2)} Д</Text>
          <Text style={[rateStyles.statLbl, { color: colors.mutedForeground }]}>{t.timer_per_minute}</Text>
        </View>
        <View style={rateStyles.divider} />
        <View style={rateStyles.stat}>
          <Text style={[rateStyles.statVal, { color: colors.primary }]}>{rate.calculatedHourRate.toFixed(0)} Д</Text>
          <Text style={[rateStyles.statLbl, { color: colors.mutedForeground }]}>{t.timer_per_hour}</Text>
        </View>
        <View style={rateStyles.divider} />
        <View style={rateStyles.stat}>
          <Text style={[rateStyles.statVal, { color: colors.primary }]}>{rate.reviewScoreCount}</Text>
          <Text style={[rateStyles.statLbl, { color: colors.mutedForeground }]}>{t.timer_reviews}</Text>
        </View>
      </View>
      {rate.professionalSkills ? (
        <Text style={[rateStyles.skills, { color: colors.foreground }]} numberOfLines={2}>
          🛠 {rate.professionalSkills}
        </Text>
      ) : null}
    </View>
  );
}

const rateStyles = StyleSheet.create({
  container: { marginHorizontal: 20, marginBottom: 10, borderWidth: 1, borderRadius: 12, padding: 12 },
  header: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 },
  title: { fontSize: 12, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8, flex: 1 },
  badge: { fontSize: 10, fontFamily: "Inter_400Regular" },
  row: { flexDirection: "row", justifyContent: "space-around", alignItems: "center" },
  stat: { alignItems: "center", flex: 1 },
  statVal: { fontSize: 16, fontFamily: "Inter_700Bold" },
  statLbl: { fontSize: 10, fontFamily: "Inter_400Regular", marginTop: 2 },
  divider: { width: 1, height: 32, backgroundColor: "rgba(201,168,76,0.3)" },
  skills: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 8, lineHeight: 16 },
});

// ─── Escrow Module ────────────────────────────────────────────────────────────
function EscrowModule({ citizen, citizens, colors, refreshCitizen }: {
  citizen: NonNullable<ReturnType<typeof useCitizen>["citizen"]>;
  citizens: Citizen[];
  colors: ReturnType<typeof useColors>;
  refreshCitizen: () => Promise<void>;
}) {
  const { t, lang } = useLanguage();
  const STATUS_LABELS: Record<string, { label: string; color: string }> = {
    open:            { label: t.deal_status_open,      color: STATUS_COLORS.open },
    accepted:        { label: t.deal_status_accepted,  color: STATUS_COLORS.accepted },
    proof_submitted: { label: t.deal_status_proof,     color: STATUS_COLORS.proof_submitted },
    completed:       { label: t.deal_status_done,      color: STATUS_COLORS.completed },
    declined:        { label: t.deal_status_declined,  color: STATUS_COLORS.declined },
    disputed:        { label: t.deal_status_disputed,  color: STATUS_COLORS.disputed },
    cancelled:       { label: t.deal_status_cancelled, color: STATUS_COLORS.cancelled },
  };
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(false);

  // Refresh citizen balance when module is opened so escrow guard has fresh data
  useEffect(() => { void refreshCitizen(); }, []);

  // Create deal modal — two-step flow
  const [showCreate, setShowCreate] = useState(false);
  const [createStep, setCreateStep] = useState<"describe" | "audit">("describe");
  const [selRecipient, setSelRecipient] = useState<Citizen | null>(null);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [auditing, setAuditing] = useState(false);
  const [auditResult, setAuditResult] = useState<{
    suggestedAmount: number;
    summary: string;
    breakdown: string[];
  } | null>(null);
  const [creating, setCreating] = useState(false);
  const [recipientError, setRecipientError] = useState(false);
  const [cancelConfirmId, setCancelConfirmId] = useState<number | null>(null);
  const [chatDeal, setChatDeal] = useState<Deal | null>(null);

  // Proof modal
  const [proofDeal, setProofDeal] = useState<Deal | null>(null);
  const [proofText, setProofText] = useState("");
  const [submittingProof, setSubmittingProof] = useState(false);

  // Dispute modal
  const [disputeDeal, setDisputeDeal] = useState<Deal | null>(null);
  const [claimText, setClaimText] = useState("");
  const [disputing, setDisputing] = useState(false);

  // Verdict modal
  const [verdictDeal, setVerdictDeal] = useState<Deal | null>(null);

  const loadDeals = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${BASE_URL}/api/deals?citizenId=${citizen.id}`);
      const data = await r.json() as { deals: Deal[] };
      setDeals(data.deals ?? []);
    } catch { /* ignore */ }
    setLoading(false);
  }, [citizen.id]);

  useEffect(() => { void loadDeals(); }, [loadDeals]);

  const apiPost = async (path: string, body: Record<string, unknown>) => {
    const r = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    if (!r.ok) throw new Error((data as { error?: string }).error ?? "Error");
    return data as Deal;
  };

  const resetCreateModal = () => {
    setShowCreate(false);
    setCreateStep("describe");
    setSelRecipient(null);
    setAmount("");
    setDescription("");
    setAuditResult(null);
    setAuditing(false);
    setRecipientError(false);
  };

  const handleAudit = async () => {
    if (description.trim().length < 5) {
      Alert.alert(t.error, t.deal_task_label);
      return;
    }
    setAuditing(true);
    try {
      const r = await fetch(`${BASE_URL}/api/deals/audit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: description.trim(), lang }),
      });
      const data = await r.json() as { suggestedAmount?: number; summary?: string; breakdown?: string[]; error?: string };
      if (!r.ok) throw new Error(data.error ?? t.error);
      setAuditResult({
        suggestedAmount: data.suggestedAmount ?? 1,
        summary: data.summary ?? "",
        breakdown: data.breakdown ?? [],
      });
      setAmount(String(data.suggestedAmount ?? ""));
      // Refresh citizen balance so step 2 shows the real available amount
      void refreshCitizen();
      setCreateStep("audit");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: unknown) {
      Alert.alert(t.timer_ai_checker, (e as Error).message);
    }
    setAuditing(false);
  };

  const handleCreate = async () => {
    if (!selRecipient) { setRecipientError(true); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); return; }
    const amt = parseInt(amount, 10);
    if (isNaN(amt) || amt < 1) { Alert.alert(t.error, t.deal_amount_label); return; }
    if (description.trim().length < 5) { Alert.alert(t.error, t.deal_task_label); return; }

    setCreating(true);
    try {
      // Fetch FRESH balance from server — context cache may be stale after TimeBank/other operations
      let freshBalance = Number(citizen.balanceMinutes);
      try {
        const r = await fetch(`${BASE_URL}/api/citizens/${citizen.id}`);
        if (r.ok) {
          const data = await r.json() as { balanceMinutes?: number };
          if (typeof data.balanceMinutes === "number") freshBalance = data.balanceMinutes;
        }
      } catch { /* fallback to cached value */ }

      const available = freshBalance - 1; // founding minute cannot be transferred
      if (available < amt) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert(
          t.insufficient_funds,
          `${available.toFixed(2)} Д < ${amt} Д`,
          [{ text: "OK" }]
        );
        setCreating(false);
        return;
      }

      await apiPost("/api/deals", { senderId: citizen.id, receiverId: selRecipient.id, amount: amt, description: description.trim() });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      resetCreateModal();
      await Promise.all([loadDeals(), refreshCitizen()]);
    } catch (e: unknown) {
      const msg = (e as Error).message;
      if (msg.toLowerCase().includes("недостаточно") || msg.toLowerCase().includes("insufficient")) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert(t.insufficient_funds, msg, [{ text: "OK" }]);
      } else {
        Alert.alert(t.error, msg);
      }
    }
    setCreating(false);
  };

  const handleAccept = async (deal: Deal) => {
    try {
      await apiPost(`/api/deals/${deal.id}/accept-task`, { citizenId: citizen.id });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await loadDeals();
    } catch (e: unknown) { Alert.alert(t.error, (e as Error).message); }
  };

  const handleProofSubmit = async () => {
    if (!proofDeal) return;
    if (proofText.trim().length < 5) { Alert.alert(t.error, t.deal_proof_label); return; }
    setSubmittingProof(true);
    try {
      await apiPost(`/api/deals/${proofDeal.id}/proof`, { receiverId: citizen.id, proofText: proofText.trim() });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setProofDeal(null);
      setProofText("");
      await loadDeals();
    } catch (e: unknown) { Alert.alert(t.error, (e as Error).message); }
    setSubmittingProof(false);
  };

  const handleComplete = async (deal: Deal) => {
    Alert.alert(
      t.deal_complete,
      `${deal.amount} Д?`,
      [
        { text: t.cancel, style: "cancel" },
        {
          text: t.confirm,
          onPress: async () => {
            try {
              await apiPost(`/api/deals/${deal.id}/complete`, { citizenId: citizen.id });
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              await loadDeals();
            } catch (e: unknown) { Alert.alert(t.error, (e as Error).message); }
          },
        },
      ]
    );
  };

  const handleDecline = async (deal: Deal) => {
    Alert.alert(
      t.deal_decline,
      `${deal.id}`,
      [
        { text: t.cancel, style: "cancel" },
        {
          text: t.deal_decline,
          style: "destructive",
          onPress: async () => {
            try {
              await apiPost(`/api/deals/${deal.id}/decline`, { citizenId: citizen.id });
              await loadDeals();
            } catch (e: unknown) { Alert.alert(t.error, (e as Error).message); }
          },
        },
      ]
    );
  };

  const handleCancel = async (deal: Deal) => {
    try {
      await apiPost(`/api/deals/${deal.id}/cancel`, { citizenId: citizen.id });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setCancelConfirmId(null);
      await loadDeals();
      void refreshCitizen();
    } catch (e: unknown) { Alert.alert(t.error, (e as Error).message); }
  };

  const handleDisputeSubmit = async () => {
    if (!disputeDeal) return;
    if (claimText.trim().length < 10) { Alert.alert(t.error, t.deal_claim_label); return; }
    setDisputing(true);
    try {
      const updated = await apiPost(`/api/deals/${disputeDeal.id}/dispute`, { citizenId: citizen.id, claimText: claimText.trim() });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      setDisputeDeal(null);
      setClaimText("");
      await loadDeals();
      if (updated.aiVerdict) {
        setTimeout(() => setVerdictDeal(updated), 300);
      }
    } catch (e: unknown) { Alert.alert(t.error, (e as Error).message); }
    setDisputing(false);
  };

  const others = citizens.filter((c) => c.id !== citizen.id);
  const s = escrowStyles(colors);

  const renderDeal = ({ item: deal }: { item: Deal }) => {
    const isSender = deal.senderId === citizen.id;
    const info = STATUS_LABELS[deal.status] ?? { label: deal.status, color: "#888" };
    const canAccept = !isSender && deal.status === "open" && deal.receiverId === null;
    const canProof = !isSender && deal.status === "accepted" && deal.receiverId === citizen.id;
    const canComplete = isSender && deal.status === "proof_submitted";
    const canDecline = isSender && deal.status === "proof_submitted";
    const canCancel = isSender && ["open", "accepted", "declined"].includes(deal.status);
    const canDispute = ["accepted", "proof_submitted", "declined"].includes(deal.status) &&
      (deal.senderId === citizen.id || deal.receiverId === citizen.id) &&
      deal.status !== "disputed";

    return (
      <View style={s.dealCard}>
        <View style={s.dealHeader}>
          <Text style={s.dealId}>#{deal.id}</Text>
          <View style={[s.statusBadge, { backgroundColor: info.color + "22", borderColor: info.color }]}>
            <Text style={[s.statusText, { color: info.color }]}>{info.label}</Text>
          </View>
        </View>
        <Text style={s.dealRole}>{isSender ? `👤 ${t.deal_customer}` : `🔧 ${t.deal_executor}`}</Text>
        <Text style={s.dealAmount}>💎 {deal.amount} {t.deal_frozen}</Text>
        <Text style={s.dealDesc} numberOfLines={3}>{deal.description}</Text>

        {deal.proofText ? (
          <View style={s.proofBlock}>
            <Text style={s.proofLabel}>{t.deal_proof_label}:</Text>
            <Text style={s.proofText}>{deal.proofText}</Text>
          </View>
        ) : null}

        {deal.aiVerdict ? (
          <TouchableOpacity style={s.verdictBtn} onPress={() => setVerdictDeal(deal)}>
            <Feather name="cpu" size={12} color={colors.primary} />
            <Text style={s.verdictBtnText}>{t.deal_verdict}</Text>
          </TouchableOpacity>
        ) : null}

        <View style={s.dealActions}>
          {(isSender || deal.receiverId === citizen.id) && !["cancelled", "completed"].includes(deal.status) && (
            <TouchableOpacity
              style={[s.actionBtn, { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.primary + "66", marginBottom: 4 }]}
              onPress={() => setChatDeal(deal)}
              activeOpacity={0.8}
            >
              <Feather name="message-circle" size={13} color={colors.primary} />
              <Text style={[s.actionBtnText, { color: colors.primary }]}>{t.deal_discuss}{deal.totalTrackedMinutes > 0 ? ` · ${deal.totalTrackedMinutes}m` : ""}</Text>
            </TouchableOpacity>
          )}
          {canAccept && (
            <TouchableOpacity style={[s.actionBtn, s.actionBtnBlue]} onPress={() => handleAccept(deal)}>
              <Text style={s.actionBtnText}>{t.deal_accept}</Text>
            </TouchableOpacity>
          )}
          {canProof && (
            <TouchableOpacity style={[s.actionBtn, s.actionBtnBlue]} onPress={() => { setProofDeal(deal); setProofText(""); }}>
              <Text style={s.actionBtnText}>{t.deal_proof}</Text>
            </TouchableOpacity>
          )}
          {canComplete && (
            <TouchableOpacity style={[s.actionBtn, s.actionBtnGreen]} onPress={() => handleComplete(deal)}>
              <Feather name="check-circle" size={13} color="#fff" />
              <Text style={s.actionBtnText}>{t.deal_complete}</Text>
            </TouchableOpacity>
          )}
          {canDecline && (
            <TouchableOpacity style={[s.actionBtn, s.actionBtnRed]} onPress={() => handleDecline(deal)}>
              <Text style={s.actionBtnText}>{t.deal_decline}</Text>
            </TouchableOpacity>
          )}
          {canDispute && (
            <TouchableOpacity style={[s.actionBtn, s.actionBtnPurple]} onPress={() => { setDisputeDeal(deal); setClaimText(""); }}>
              <Feather name="alert-triangle" size={12} color="#fff" />
              <Text style={s.actionBtnText}>{t.deal_dispute}</Text>
            </TouchableOpacity>
          )}
          {canCancel && cancelConfirmId !== deal.id && (
            <TouchableOpacity style={[s.actionBtn, s.actionBtnGray]} onPress={() => setCancelConfirmId(deal.id)}>
              <Text style={s.actionBtnText}>{t.deal_cancel_deal}</Text>
            </TouchableOpacity>
          )}
          {canCancel && cancelConfirmId === deal.id && (
            <View style={{ width: "100%", backgroundColor: "#E0525222", borderRadius: 10, padding: 10, marginTop: 4, gap: 8 }}>
              <Text style={{ color: "#E05252", fontSize: 12, fontFamily: "Inter_600SemiBold", textAlign: "center" }}>
                {deal.amount} Д?
              </Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TouchableOpacity
                  style={[s.actionBtn, s.actionBtnGray, { flex: 1, marginTop: 0 }]}
                  onPress={() => setCancelConfirmId(null)}
                >
                  <Text style={s.actionBtnText}>{t.cancel}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.actionBtn, s.actionBtnRed, { flex: 1, marginTop: 0 }]}
                  onPress={() => handleCancel(deal)}
                >
                  <Feather name="x-circle" size={13} color="#fff" />
                  <Text style={s.actionBtnText}>{t.deal_cancel_deal}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={{ flex: 1 }}>
      {/* Header */}
      <View style={s.escrowHeader}>
        <Text style={s.escrowTitle}>{t.escrow_title}</Text>
        <TouchableOpacity style={s.createBtn} onPress={() => setShowCreate(true)} activeOpacity={0.8}>
          <Feather name="plus" size={14} color={colors.primaryForeground} />
          <Text style={s.createBtnText}>{t.escrow_new_deal}</Text>
        </TouchableOpacity>
      </View>
      <Text style={s.escrowSub}>{t.deal_no_deals_sub}</Text>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} />
      ) : deals.length === 0 ? (
        <View style={s.empty}>
          <Feather name="lock" size={32} color={colors.mutedForeground} />
          <Text style={s.emptyText}>{t.deal_no_deals}</Text>
          <Text style={s.emptySub}>{t.deal_no_deals_sub}</Text>
        </View>
      ) : (
        <FlatList
          data={deals}
          keyExtractor={(d) => String(d.id)}
          renderItem={renderDeal}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          onRefresh={loadDeals}
          refreshing={loading}
        />
      )}

      {/* ── Discussion / Chat Modal ──────────────────────────────────────── */}
      {chatDeal && (
        <DiscussionModal
          visible={chatDeal !== null}
          deal={chatDeal}
          citizenId={citizen.id}
          citizenName={citizen.name}
          colors={colors}
          onClose={() => setChatDeal(null)}
          onDealUpdate={(updated) => {
            setDeals((prev) => prev.map((d) => d.id === updated.id ? { ...d, ...updated } : d));
            setChatDeal((prev) => prev && prev.id === updated.id ? { ...prev, ...updated } : prev);
          }}
        />
      )}

      {/* ── Create Deal Modal — single modal, two steps ──────────────────── */}
      <Modal visible={showCreate} animationType="slide" presentationStyle="pageSheet" onRequestClose={resetCreateModal}>
        <ScrollView
          style={[s.modal, { backgroundColor: colors.background }]}
          contentContainerStyle={{ paddingBottom: 60 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── STEP 1: describe ─────────────────────────────────────── */}
          {createStep === "describe" && (
            <>
              <View style={s.modalHeader}>
                <View>
                  <Text style={[s.modalTitle, { color: colors.foreground }]}>{t.escrow_new_deal}</Text>
                  <Text style={{ fontSize: 11, color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginTop: 2 }}>{t.deal_step1}</Text>
                </View>
                <TouchableOpacity onPress={resetCreateModal}>
                  <Feather name="x" size={22} color={colors.mutedForeground} />
                </TouchableOpacity>
              </View>

              <Text style={[s.label, { color: colors.mutedForeground }]}>{t.deal_task_label}</Text>
              <TextInput
                style={[s.input, s.inputMulti, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card }]}
                placeholder={t.deal_task_label}
                placeholderTextColor={colors.mutedForeground}
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={6}
                textAlignVertical="top"
                autoFocus
              />

              <View style={{ backgroundColor: colors.card, borderRadius: 10, padding: 12, marginBottom: 20, borderWidth: 1, borderColor: colors.border }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <Feather name="cpu" size={14} color={colors.primary} />
                  <Text style={{ fontSize: 12, fontFamily: "Inter_700Bold", color: colors.primary }}>{t.deal_ai_name}</Text>
                </View>
                <Text style={{ fontSize: 11, color: colors.mutedForeground, fontFamily: "Inter_400Regular", lineHeight: 16 }}>
                  {t.deal_ai_desc}
                </Text>
              </View>

              <TouchableOpacity
                style={[s.submitBtn, { backgroundColor: colors.primary, opacity: auditing ? 0.7 : 1 }]}
                onPress={handleAudit}
                disabled={auditing}
                activeOpacity={0.8}
              >
                {auditing ? (
                  <>
                    <ActivityIndicator color={colors.primaryForeground} size="small" />
                    <Text style={[s.submitBtnText, { color: colors.primaryForeground }]}>{t.loading}</Text>
                  </>
                ) : (
                  <>
                    <Feather name="cpu" size={16} color={colors.primaryForeground} />
                    <Text style={[s.submitBtnText, { color: colors.primaryForeground }]}>{t.deal_audit_btn}</Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          )}

          {/* ── STEP 2: audit result + confirm ───────────────────────── */}
          {createStep === "audit" && (
            <>
              <View style={s.modalHeader}>
                <View>
                  <Text style={[s.modalTitle, { color: colors.foreground }]}>{t.timer_ai_checker}</Text>
                  <Text style={{ fontSize: 11, color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginTop: 2 }}>{t.deal_step2}</Text>
                </View>
                <TouchableOpacity onPress={resetCreateModal}>
                  <Feather name="x" size={22} color={colors.mutedForeground} />
                </TouchableOpacity>
              </View>

              {/* AI audit card */}
              {auditResult && (
                <View style={{ backgroundColor: colors.primary + "18", borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: colors.primary + "44" }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 }}>
                    <Feather name="cpu" size={15} color={colors.primary} />
                    <Text style={{ fontSize: 13, fontFamily: "Inter_700Bold", color: colors.primary }}>{t.deal_ai_verdict}</Text>
                  </View>
                  <Text style={{ fontSize: 12, color: colors.foreground, fontFamily: "Inter_400Regular", lineHeight: 18, marginBottom: 10 }}>
                    {auditResult.summary}
                  </Text>
                  <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold", color: colors.mutedForeground, marginBottom: 6, letterSpacing: 0.5 }}>{t.deal_breakdown}</Text>
                  {auditResult.breakdown.map((line, i) => (
                    <View key={i} style={{ flexDirection: "row", alignItems: "flex-start", gap: 6, marginBottom: 4 }}>
                      <Text style={{ color: colors.primary, fontSize: 11, fontFamily: "Inter_700Bold", marginTop: 1 }}>•</Text>
                      <Text style={{ fontSize: 11, color: colors.foreground, fontFamily: "Inter_400Regular", flex: 1, lineHeight: 16 }}>{line}</Text>
                    </View>
                  ))}
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.primary + "33" }}>
                    <Text style={{ fontSize: 12, fontFamily: "Inter_700Bold", color: colors.mutedForeground }}>{t.deal_recommended}</Text>
                    <Text style={{ fontSize: 18, fontFamily: "Inter_700Bold", color: colors.primary }}>{auditResult.suggestedAmount} Д</Text>
                  </View>
                </View>
              )}

              {/* ТЗ summary (readonly) */}
              <View style={{ backgroundColor: colors.card, borderRadius: 8, padding: 10, marginBottom: 16, borderWidth: 1, borderColor: colors.border }}>
                <Text style={{ fontSize: 10, fontFamily: "Inter_700Bold", color: colors.mutedForeground, marginBottom: 4, letterSpacing: 0.5 }}>{t.deal_task_label}</Text>
                <Text style={{ fontSize: 12, color: colors.foreground, fontFamily: "Inter_400Regular", lineHeight: 17 }} numberOfLines={4}>{description}</Text>
                <TouchableOpacity onPress={() => setCreateStep("describe")} style={{ marginTop: 6 }}>
                  <Text style={{ fontSize: 11, color: colors.primary, fontFamily: "Inter_700Bold" }}>{t.deal_change_task}</Text>
                </TouchableOpacity>
              </View>

              {/* Recipient */}
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <Text style={[s.label, { color: recipientError && !selRecipient ? "#E05252" : colors.mutedForeground, marginBottom: 0 }]}>
                  {t.deal_executor_label} <Text style={{ color: "#E05252" }}>*</Text>
                </Text>
                {recipientError && !selRecipient && (
                  <Text style={{ fontSize: 11, color: "#E05252", fontFamily: "Inter_400Regular" }}>↑</Text>
                )}
              </View>
              {others.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  style={[s.selRow, selRecipient?.id === c.id && s.selRowActive, {
                    borderColor: selRecipient?.id === c.id
                      ? colors.primary
                      : recipientError && !selRecipient
                        ? "#E05252" + "66"
                        : colors.border
                  }]}
                  onPress={() => { setSelRecipient(c); setRecipientError(false); }}
                  activeOpacity={0.8}
                >
                  <CitizenAvatar
                    citizenId={c.id}
                    name={c.name}
                    hasPhoto={!!(c as { photoUrl?: string | null }).photoUrl}
                    size={36}
                  />
                  <Text style={[s.selName, { color: colors.foreground }]}>{c.name}</Text>
                  <Text style={[s.selBalance, { color: colors.mutedForeground }]}>{c.balanceMinutes} Д</Text>
                  {selRecipient?.id === c.id && <Feather name="check-circle" size={18} color={colors.primary} />}
                </TouchableOpacity>
              ))}

              {/* Amount (pre-filled, editable) */}
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 16, marginBottom: 8 }}>
                <Text style={[s.label, { color: colors.mutedForeground, marginBottom: 0 }]}>{t.deal_amount_label}</Text>
                <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>
                  <Text style={{ color: colors.primary, fontFamily: "Inter_700Bold" }}>{Math.max(0, Number(citizen.balanceMinutes) - 1).toFixed(0)} Д</Text>
                </Text>
              </View>
              <TextInput
                style={[s.input, { borderColor: colors.primary + "88", color: colors.foreground, backgroundColor: colors.card, borderWidth: 1.5 }]}
                keyboardType="number-pad"
                placeholder={t.deal_amount_label}
                placeholderTextColor={colors.mutedForeground}
                value={amount}
                onChangeText={setAmount}
              />
              {auditResult && parseInt(amount, 10) !== auditResult.suggestedAmount && (
                <TouchableOpacity onPress={() => setAmount(String(auditResult.suggestedAmount))} style={{ marginTop: -8, marginBottom: 8, alignSelf: "flex-end", paddingRight: 4 }}>
                  <Text style={{ fontSize: 11, color: colors.primary, fontFamily: "Inter_400Regular" }}>
                    {t.deal_restore_rec} ({auditResult.suggestedAmount} Д)
                  </Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[s.submitBtn, {
                  backgroundColor: !selRecipient ? colors.surface : colors.primary,
                  opacity: creating ? 0.6 : 1,
                  marginTop: 8,
                  borderWidth: !selRecipient ? 1.5 : 0,
                  borderColor: recipientError && !selRecipient ? "#E05252" : colors.border,
                }]}
                onPress={handleCreate}
                disabled={creating}
                activeOpacity={0.8}
              >
                {creating ? <ActivityIndicator color={colors.primaryForeground} /> : (
                  <>
                    <Feather name={!selRecipient ? "user" : "lock"} size={16} color={!selRecipient ? colors.mutedForeground : colors.primaryForeground} />
                    <Text style={[s.submitBtnText, { color: !selRecipient ? colors.mutedForeground : colors.primaryForeground }]}>
                      {!selRecipient ? `${t.deal_executor_label} ↑` : t.deal_create_btn}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </Modal>

      {/* ── Proof Modal ───────────────────────────────────────────────────── */}
      <Modal visible={!!proofDeal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setProofDeal(null)}>
        <View style={[s.modal, { backgroundColor: colors.background }]}>
          <View style={s.modalHeader}>
            <Text style={[s.modalTitle, { color: colors.foreground }]}>{t.deal_proof}</Text>
            <TouchableOpacity onPress={() => setProofDeal(null)}>
              <Feather name="x" size={22} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
          {proofDeal && <Text style={[s.proofDealDesc, { color: colors.mutedForeground }]}>{proofDeal.description}</Text>}
          <Text style={[s.label, { color: colors.mutedForeground }]}>{t.deal_proof_label}</Text>
          <TextInput
            style={[s.input, s.inputMulti, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card }]}
            placeholder={t.deal_proof_label}
            placeholderTextColor={colors.mutedForeground}
            value={proofText}
            onChangeText={setProofText}
            multiline
            numberOfLines={5}
            textAlignVertical="top"
          />
          <TouchableOpacity
            style={[s.submitBtn, { backgroundColor: "#2196F3", opacity: submittingProof ? 0.6 : 1 }]}
            onPress={handleProofSubmit}
            disabled={submittingProof}
            activeOpacity={0.8}
          >
            {submittingProof ? <ActivityIndicator color="#fff" /> : (
              <>
                <Feather name="send" size={16} color="#fff" />
                <Text style={[s.submitBtnText, { color: "#fff" }]}>{t.deal_send_proof}</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </Modal>

      {/* ── Dispute Modal ─────────────────────────────────────────────────── */}
      <Modal visible={!!disputeDeal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setDisputeDeal(null)}>
        <View style={[s.modal, { backgroundColor: colors.background }]}>
          <View style={s.modalHeader}>
            <Text style={[s.modalTitle, { color: colors.foreground }]}>{t.deal_dispute}</Text>
            <TouchableOpacity onPress={() => setDisputeDeal(null)}>
              <Feather name="x" size={22} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
          <Text style={[s.disputeInfo, { color: colors.mutedForeground }]}>
            {t.timer_ai_checker}
          </Text>
          <Text style={[s.label, { color: colors.mutedForeground }]}>{t.deal_claim_label}</Text>
          <TextInput
            style={[s.input, s.inputMulti, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card }]}
            placeholder={t.deal_claim_label}
            placeholderTextColor={colors.mutedForeground}
            value={claimText}
            onChangeText={setClaimText}
            multiline
            numberOfLines={5}
            textAlignVertical="top"
          />
          <TouchableOpacity
            style={[s.submitBtn, { backgroundColor: "#9C27B0", opacity: disputing ? 0.6 : 1 }]}
            onPress={handleDisputeSubmit}
            disabled={disputing}
            activeOpacity={0.8}
          >
            {disputing ? (
              <>
                <ActivityIndicator color="#fff" />
                <Text style={[s.submitBtnText, { color: "#fff" }]}>{t.loading}</Text>
              </>
            ) : (
              <>
                <Feather name="alert-triangle" size={16} color="#fff" />
                <Text style={[s.submitBtnText, { color: "#fff" }]}>{t.deal_send_claim}</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </Modal>

      {/* ── AI Verdict Modal ──────────────────────────────────────────────── */}
      <Modal visible={!!verdictDeal} animationType="fade" transparent onRequestClose={() => setVerdictDeal(null)}>
        <View style={s.verdictOverlay}>
          <View style={[s.verdictCard, { backgroundColor: colors.card, borderColor: colors.primary }]}>
            <View style={s.modalHeader}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Feather name="cpu" size={18} color={colors.primary} />
                <Text style={[s.modalTitle, { color: colors.primary }]}>{t.deal_ai_verdict}</Text>
              </View>
              <TouchableOpacity onPress={() => setVerdictDeal(null)}>
                <Feather name="x" size={20} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
            <Text style={[s.disputeInfo, { color: colors.mutedForeground, marginBottom: 4 }]}>
              #{verdictDeal?.id}
            </Text>
            <ScrollView style={{ maxHeight: 340 }}>
              <Text style={[s.verdictText, { color: colors.foreground }]}>{verdictDeal?.aiVerdict}</Text>
            </ScrollView>
            <TouchableOpacity style={[s.submitBtn, { backgroundColor: colors.primary, marginTop: 16 }]} onPress={() => setVerdictDeal(null)}>
              <Text style={[s.submitBtnText, { color: colors.primaryForeground }]}>{t.confirm}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function escrowStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    escrowHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12 },
    escrowTitle: { fontSize: 16, fontFamily: "Inter_700Bold", color: colors.foreground },
    escrowSub: { fontSize: 11, color: colors.mutedForeground, paddingHorizontal: 16, marginBottom: 12, fontFamily: "Inter_400Regular" },
    createBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.primary, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
    createBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.primaryForeground },
    empty: { alignItems: "center", paddingTop: 50, paddingHorizontal: 32, gap: 10 },
    emptyText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground },
    emptySub: { fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "center", lineHeight: 18 },
    dealCard: { backgroundColor: colors.card, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: colors.border },
    dealHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
    dealId: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground },
    statusBadge: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
    statusText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
    dealRole: { fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginBottom: 2 },
    dealAmount: { fontSize: 15, fontFamily: "Inter_700Bold", color: colors.primary, marginBottom: 6 },
    dealDesc: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.foreground, lineHeight: 18, marginBottom: 8 },
    proofBlock: { backgroundColor: colors.surface, borderRadius: 8, padding: 10, marginBottom: 8 },
    proofLabel: { fontSize: 10, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground, marginBottom: 4 },
    proofText: { fontSize: 12, fontFamily: "Inter_400Regular", color: colors.foreground, lineHeight: 17 },
    verdictBtn: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
    verdictBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.primary },
    dealActions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    actionBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
    actionBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#fff" },
    actionBtnGreen: { backgroundColor: "#388E3C" },
    actionBtnRed: { backgroundColor: "#C62828" },
    actionBtnBlue: { backgroundColor: "#1565C0" },
    actionBtnPurple: { backgroundColor: "#6A1B9A" },
    actionBtnGray: { backgroundColor: "#546E7A" },
    modal: { flex: 1, padding: 20 },
    modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
    modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
    label: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 1, marginBottom: 8 },
    input: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 15, fontFamily: "Inter_400Regular", marginBottom: 16 },
    inputMulti: { height: 120 },
    selRow: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 8 },
    selRowActive: {},
    avatar: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
    avatarText: { fontSize: 15, fontFamily: "Inter_700Bold" },
    selName: { flex: 1, fontSize: 14, fontFamily: "Inter_500Medium" },
    selBalance: { fontSize: 12, fontFamily: "Inter_400Regular" },
    submitBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 16, borderRadius: 12, marginTop: 8 },
    submitBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
    proofDealDesc: { fontSize: 12, fontFamily: "Inter_400Regular", marginBottom: 16, lineHeight: 18 },
    disputeInfo: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18, marginBottom: 16 },
    verdictOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", alignItems: "center", padding: 20 },
    verdictCard: { width: "100%", borderRadius: 16, borderWidth: 1, padding: 20 },
    verdictText: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 20 },
  });
}

// ─── Main TiMETR Screen ───────────────────────────────────────────────────────
export default function TimerScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { citizen, isLoading: citizenLoading, refreshCitizen, setCitizen } = useCitizen();
  const { t: ui, lang, setLang } = useLanguage();
  const loginLang: "ru" | "en" = lang === "ru" ? "ru" : "en";
  const loginUi = UI[loginLang];
  const router = useRouter();
  const queryClient = useQueryClient();
  const walletGuide = useContextualGuide("wallet");

  const [mode, setMode] = useState<"transfer" | "escrow">("transfer");
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [selectedRecipient, setSelectedRecipient] = useState<Citizen | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Login form state ────────────────────────────────────────────────────────
  const [loginPhone, setLoginPhone] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // ── Logout (single-tap, optimistic, blocks repeat clicks) ──────────────────
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  // Reset spinner when a citizen appears/changes (login or account switch)
  useEffect(() => {
    if (citizen?.id) setIsLoggingOut(false);
  }, [citizen?.id]);

  const handleLogoutPress = useCallback(() => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    // 1. Optimistically clear all cached data immediately
    queryClient.clear();
    // 2. Clear citizen state + wipe stored token from SecureStore / AsyncStorage
    setCitizen(null);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [isLoggingOut, setCitizen, queryClient]);

  const handleDeleteAccount = useCallback(() => {
    Alert.alert(
      ui.mod_delete_account,
      `${ui.mod_delete_warning}\n\n${ui.mod_delete_confirm}`,
      [
        { text: ui.cancel, style: "cancel" },
        {
          text: ui.mod_delete_account,
          style: "destructive",
          onPress: async () => {
            setIsDeletingAccount(true);
            try {
              const res = await fetch(`${BASE_URL}/api/moderation/account`, { method: "DELETE" });
              if (!res.ok) throw new Error("server error");
              queryClient.clear();
              setCitizen(null);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } catch {
              setIsDeletingAccount(false);
              Alert.alert("Error", "Could not delete account. Please try again.");
            }
          },
        },
      ]
    );
  }, [ui, queryClient, setCitizen]);

  const { data: citizens = [], isLoading: loadingCitizens } = useQuery<Citizen[]>({
    queryKey: ["citizens"],
    queryFn: async () => {
      const res = await fetch(`${BASE_URL}/api/citizens`);
      return res.json() as Promise<Citizen[]>;
    },
    enabled: !!citizen,
  });

  const startSession = async () => {
    if (!citizen || !selectedRecipient) return;
    const res = await fetch(`${BASE_URL}/api/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromCitizenId: citizen.id, toCitizenId: selectedRecipient.id }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error((data as { error: string }).error);
    setActiveSession(data as Session);
    setElapsed(0);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  };

  const stopSession = async () => {
    if (!activeSession) return;
    const res = await fetch(`${BASE_URL}/api/sessions/${activeSession.id}/stop`, { method: "POST" });
    const data = await res.json() as SessionResult;
    if (!res.ok) throw new Error((data as unknown as { error: string }).error);
    setActiveSession(null);
    setElapsed(0);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    queryClient.invalidateQueries({ queryKey: ["citizens"] });
    refreshCitizen();
    const mins = data.transaction.minutesTransferred;
    const secs = data.transaction.durationSeconds;
    Alert.alert(ui.timer_session_active, `${mins} Д · ${formatTime(secs)}`);
  };

  const [sessionLoading, setSessionLoading] = useState(false);
  const handleStart = useCallback(async () => {
    if (!citizen) { router.push("/register"); return; }
    if (!selectedRecipient) { Alert.alert(ui.timer_pick_recipient, ""); return; }
    setSessionLoading(true);
    try { await startSession(); } catch (e: unknown) { Alert.alert(ui.error, (e as Error).message); }
    setSessionLoading(false);
  }, [citizen, selectedRecipient]);

  const handleStop = useCallback(async () => {
    if (!activeSession) return;
    setSessionLoading(true);
    try { await stopSession(); } catch (e: unknown) { Alert.alert(ui.error, (e as Error).message); }
    setSessionLoading(false);
  }, [activeSession]);

  const handleLoginSubmit = useCallback(async () => {
    const phone = loginPhone.trim();
    if (!phone) return;
    setLoginLoading(true);
    setLoginError(null);
    try {
      const res = await fetch(`${BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, ...(loginPassword ? { password: loginPassword } : {}) }),
      });
      const data = await res.json() as Record<string, unknown>;
      if (!res.ok) {
        setLoginError((data["error"] as string) ?? ui.citizen_not_found);
        setLoginLoading(false);
        return;
      }
      setCitizen(data as unknown as Parameters<typeof setCitizen>[0]);
      setLoginPhone("");
      setLoginPassword("");
      setLoginError(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      setLoginError(ui.connection_error);
    }
    setLoginLoading(false);
  }, [loginPhone, loginPassword, ui]);

  useEffect(() => {
    if (activeSession) {
      intervalRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [activeSession]);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const botPad = Platform.OS === "web" ? 34 : 0;
  const others = citizens.filter((c) => c.id !== citizen?.id);
  const recipientCitizen = citizens.find((c) => c.id === activeSession?.toCitizenId);
  const styles = getStyles(colors);

  if (citizenLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!citizen) return <MobileWelcome />;

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <View style={styles.headerBrand}>
          <LogoBrand size={30} />
          <Text style={styles.headerTitle}>TiMETR</Text>
        </View>
        {citizen && (
          <View style={styles.headerRight}>
            <View style={styles.rankPill}>
              <Text style={styles.rankText}>{citizen.rank ?? ui.login}</Text>
            </View>
            <View style={styles.balancePill}>
              <Feather name="clock" size={12} color={colors.primary} />
              <Text style={styles.balanceText}>{citizen.balanceMinutes} Д</Text>
            </View>
            <TouchableOpacity style={styles.shopBtn} onPress={() => router.push("/shop")} activeOpacity={0.75}>
              <Feather name="plus-circle" size={13} color={colors.primaryForeground} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.walletBtn, citizen.walletVerified === 1 && styles.walletBtnVerified]}
              onPress={() => walletGuide.trigger(() => router.push("/wallet"))}
              activeOpacity={0.75}
            >
              {citizen.walletVerified === 1 ? (
                <Feather name="shield" size={13} color={colors.primaryForeground} />
              ) : (
                <Feather name="link" size={13} color={colors.primary} />
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.chatBtn}
              onPress={() => router.push("/chat")}
              activeOpacity={0.75}
            >
              <Feather name="message-square" size={13} color={colors.primary} />
            </TouchableOpacity>
          </View>
        )}
      </View>

      {citizen && (
        <View style={styles.meritBar}>
          <Feather name="star" size={11} color={colors.primary} />
          <Text style={styles.meritText}>Merit: {(citizen.meritScore ?? 0).toFixed(2)}</Text>
          <Text style={styles.meritSep}>·</Text>
          <Text style={styles.meritText}>{citizen.totalGiven.toFixed(2)} Д</Text>
        </View>
      )}

      {/* ── Passport card / Registration banner ────────────────────────────── */}
      {citizen ? (
        <View style={styles.passportCard}>
          <View style={styles.passportLeft}>
            <CitizenAvatar
              citizenId={citizen.id}
              name={citizen.name}
              hasPhoto={!!citizen.photoUrl}
              size={38}
              editable={true}
              onPhotoUpdated={() => void refreshCitizen()}
            />
            <View style={{ flex: 1, flexShrink: 1, minWidth: 0 }}>
              <Text style={styles.passportName} numberOfLines={1}>{citizen.name}</Text>
              <Text style={styles.passportId}>ID #{citizen.id}</Text>
              <Text style={[styles.passportRank, { marginTop: 2 }]}>{citizen.rank ?? ui.login}</Text>
            </View>
          </View>
          <View style={styles.passportActions}>
            <TouchableOpacity
              style={styles.passportRefresh}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); void refreshCitizen(); }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Feather name="refresh-cw" size={15} color={colors.mutedForeground} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.passportLogout,
                { borderColor: colors.destructive + "55", backgroundColor: colors.destructive + "15" },
                isLoggingOut && { opacity: 0.5 },
              ]}
              onPress={handleLogoutPress}
              disabled={isLoggingOut}
              hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
            >
              {isLoggingOut
                ? <ActivityIndicator size={13} color={colors.destructive} />
                : <Feather name="log-out" size={13} color={colors.destructive} />}
              <Text style={[styles.passportLogoutText, { color: colors.destructive }]}>
                {ui.logout}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.passportLogout,
                { borderColor: "#ef444455", backgroundColor: "#ef444410" },
                isDeletingAccount && { opacity: 0.5 },
              ]}
              onPress={handleDeleteAccount}
              disabled={isDeletingAccount}
              hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
            >
              {isDeletingAccount
                ? <ActivityIndicator size={13} color="#ef4444" />
                : <Feather name="trash-2" size={13} color="#ef4444" />}
              <Text style={[styles.passportLogoutText, { color: "#ef4444" }]}>
                {ui.mod_delete_account}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.passportLogout, { borderColor: colors.border, backgroundColor: "transparent" }]}
              onPress={() => Linking.openURL("https://timenation.info/privacy")}
              hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
            >
              <Feather name="shield" size={13} color={colors.mutedForeground} />
              <Text style={[styles.passportLogoutText, { color: colors.mutedForeground }]}>
                Конфиденциальность
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity
          style={styles.regBanner}
          onPress={() => router.push("/register")}
          activeOpacity={0.8}
        >
          <View style={styles.regBannerIcon}>
            <Feather name="user-plus" size={22} color={colors.primaryForeground} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.regBannerTitle}>{ui.timer_get_citizenship}</Text>
            <Text style={styles.regBannerSub}>{ui.timer_get_60d}</Text>
          </View>
          <Feather name="chevron-right" size={18} color={colors.primary} />
        </TouchableOpacity>
      )}

      {/* ── Telegram Notifications ─────────────────────────────────────────── */}
      {citizen && (
        <TelegramSection colors={colors} ui={ui} />
      )}

      {/* ── Guest: login form instead of timer ─────────────────────────────── */}
      {!citizen && (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: botPad + 32 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.loginCard}>
            {/* Title row + RU|EN toggle */}
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <Text style={styles.loginCardTitle}>{loginUi.login}</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
                <TouchableOpacity
                  onPress={() => setLang("ru")}
                  style={[styles.langToggleBtn, loginLang === "ru" && styles.langToggleBtnActive]}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 4 }}
                >
                  <Text style={[styles.langToggleText, loginLang === "ru" && styles.langToggleTextActive]}>RU</Text>
                </TouchableOpacity>
                <Text style={styles.langToggleSep}>|</Text>
                <TouchableOpacity
                  onPress={() => setLang("en")}
                  style={[styles.langToggleBtn, loginLang === "en" && styles.langToggleBtnActive]}
                  hitSlop={{ top: 6, bottom: 6, left: 4, right: 6 }}
                >
                  <Text style={[styles.langToggleText, loginLang === "en" && styles.langToggleTextActive]}>EN</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.loginInputWrap}>
              <Feather name="phone" size={13} color={colors.mutedForeground} style={styles.loginInputIcon} />
              <TextInput
                style={styles.loginInput}
                value={loginPhone}
                onChangeText={v => { setLoginPhone(v); setLoginError(null); }}
                placeholder={loginUi.login_placeholder}
                placeholderTextColor={colors.mutedForeground}
                keyboardType="phone-pad"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <View style={styles.loginInputWrap}>
              <Feather name="lock" size={13} color={colors.mutedForeground} style={styles.loginInputIcon} />
              <TextInput
                style={[styles.loginInput, { flex: 1 }]}
                value={loginPassword}
                onChangeText={v => { setLoginPassword(v); setLoginError(null); }}
                placeholder={loginUi.login_password}
                placeholderTextColor={colors.mutedForeground}
                secureTextEntry={!showLoginPassword}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity onPress={() => setShowLoginPassword(v => !v)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Feather name={showLoginPassword ? "eye-off" : "eye"} size={14} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            {loginError && <Text style={styles.loginError}>{loginError}</Text>}

            <TouchableOpacity
              style={[styles.loginBtn, (!loginPhone.trim() || loginLoading) && styles.loginBtnDisabled]}
              onPress={() => void handleLoginSubmit()}
              disabled={!loginPhone.trim() || loginLoading}
              activeOpacity={0.8}
            >
              {loginLoading
                ? <ActivityIndicator size="small" color={colors.primaryForeground} />
                : <Text style={styles.loginBtnText}>{loginUi.login}</Text>
              }
            </TouchableOpacity>

            <View style={styles.loginDivider}>
              <View style={styles.loginDividerLine} />
              <Text style={styles.loginDividerText}>{loginLang === "ru" ? "или" : "or"}</Text>
              <View style={styles.loginDividerLine} />
            </View>
            <TouchableOpacity style={styles.registerPrompt} onPress={() => router.push("/register")} activeOpacity={0.8}>
              <Feather name="user-plus" size={16} color={colors.primary} />
              <Text style={styles.registerPromptText}>{loginUi.timer_get_citizenship}</Text>
              <Feather name="chevron-right" size={14} color={colors.mutedForeground} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.privacyLink}
              onPress={() => Linking.openURL("https://timenation.info/privacy")}
              activeOpacity={0.7}
            >
              <Feather name="shield" size={12} color={colors.mutedForeground} />
              <Text style={styles.privacyLinkText}>
                {loginLang === "ru" ? "Политика конфиденциальности" : "Privacy Policy"}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}

      {/* ── Mode toggle ────────────────────────────────────────────────────── */}
      {citizen && <View style={styles.modeToggle}>
        <TouchableOpacity
          style={[styles.modeBtn, mode === "transfer" && styles.modeBtnActive]}
          onPress={() => setMode("transfer")}
          activeOpacity={0.8}
        >
          <Feather name="play-circle" size={13} color={mode === "transfer" ? colors.primaryForeground : colors.mutedForeground} />
          <Text style={[styles.modeBtnText, mode === "transfer" && styles.modeBtnTextActive]}>{ui.timer_transfer}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modeBtn, mode === "escrow" && styles.modeBtnActive]}
          onPress={() => setMode("escrow")}
          activeOpacity={0.8}
        >
          <Feather name="lock" size={13} color={mode === "escrow" ? colors.primaryForeground : colors.mutedForeground} />
          <Text style={[styles.modeBtnText, mode === "escrow" && styles.modeBtnTextActive]}>{ui.timer_escrow_tab}</Text>
        </TouchableOpacity>
      </View>}

      {/* ── Transfer mode ──────────────────────────────────────────────────── */}
      {citizen && mode === "transfer" && (
        <>
          <View style={styles.timerSection}>
            {activeSession ? (
              <>
                <AnimatedHourglass active={true} size={36} />
                <Text style={styles.timerLabel}>→ {recipientCitizen?.name ?? "..."}</Text>
                <Text style={styles.timerDisplay}>{formatTime(elapsed)}</Text>
                <Text style={styles.timerSub}>~{Math.max(1, Math.ceil(elapsed / 60))} Д</Text>
                <TouchableOpacity style={styles.stopBtn} onPress={handleStop} disabled={sessionLoading} activeOpacity={0.75}>
                  {sessionLoading ? (
                    <ActivityIndicator color={colors.destructiveForeground} />
                  ) : (
                    <>
                      <Feather name="square" size={20} color={colors.destructiveForeground} />
                      <Text style={styles.stopBtnText}>{ui.timer_stop}</Text>
                    </>
                  )}
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.timerDisplay}>00:00</Text>
                <Text style={styles.timerSub}>{selectedRecipient ? `→ ${selectedRecipient.name}` : ui.timer_pick_recipient}</Text>
                <TouchableOpacity
                  style={[styles.startBtn, !selectedRecipient && styles.startBtnDisabled]}
                  onPress={handleStart}
                  disabled={sessionLoading || !selectedRecipient}
                  activeOpacity={0.75}
                >
                  {sessionLoading ? (
                    <ActivityIndicator color={colors.primaryForeground} />
                  ) : (
                    <>
                      <Feather name="play" size={20} color={colors.primaryForeground} />
                      <Text style={styles.startBtnText}>{ui.timer_start}</Text>
                    </>
                  )}
                </TouchableOpacity>
              </>
            )}
          </View>

          {/* AI Auditor Rate Widget */}
          {selectedRecipient && !activeSession && (
            <RateWidget recipient={selectedRecipient} colors={colors} />
          )}

          <View style={styles.listSection}>
            <Text style={styles.listTitle}>{activeSession ? ui.timer_session_active : ui.timer_pick_recipient}</Text>
            {loadingCitizens && citizen && <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />}
            {!loadingCitizens && others.length === 0 && citizen && (
              <View style={styles.emptyState}>
                <Feather name="users" size={32} color={colors.mutedForeground} />
                <Text style={styles.emptyText}>{ui.timer_no_citizens}</Text>
                <Text style={styles.emptySubtext}>{ui.timer_invite_hint}</Text>
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
        </>
      )}

      {/* ── Escrow mode ────────────────────────────────────────────────────── */}
      {mode === "escrow" && citizen && (
        <EscrowModule citizen={citizen} citizens={others} colors={colors} refreshCitizen={refreshCitizen} />
      )}
      {mode === "escrow" && !citizen && (
        <View style={styles.emptyState}>
          <Feather name="lock" size={32} color={colors.mutedForeground} />
          <Text style={styles.emptyText}>{ui.timer_get_citizenship}</Text>
          <TouchableOpacity onPress={() => router.push("/register")} activeOpacity={0.8}>
            <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold", fontSize: 14, marginTop: 8 }}>
              {ui.timer_get_citizenship} →
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <ContextualGuideModal
        visible={walletGuide.visible}
        onClose={walletGuide.close}
        onConfirm={walletGuide.confirm}
        icon="💰"
        title={ui.timer_wallet}
        explanation={ui.timer_wallet}
        ctaLabel={ui.stats_recent_tx}
      />
    </View>
  );
}

function getStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingLeft: 16, paddingRight: 10, paddingVertical: 10 },
    headerBrand: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 0 },
    headerTitle: { fontSize: 19, fontFamily: "Inter_700Bold", color: colors.primary, letterSpacing: 1 },
    headerRight: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 4, flexShrink: 1, paddingRight: 8, minWidth: 0 },
    rankPill: { backgroundColor: "rgba(201,168,76,0.15)", borderWidth: 1, borderColor: "rgba(201,168,76,0.4)", paddingHorizontal: 5, paddingVertical: 2, borderRadius: 20 },
    rankText: { fontSize: 10, fontFamily: "Inter_600SemiBold", color: colors.primary, letterSpacing: 0 },
    balancePill: { flexDirection: "row", alignItems: "center", gap: 2, backgroundColor: colors.goldGlow, borderWidth: 1, borderColor: colors.primary, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 20 },
    balanceText: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: colors.primary },
    shopBtn: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
    walletBtn: { width: 26, height: 26, borderRadius: 13, borderWidth: 1, borderColor: colors.primary, alignItems: "center", justifyContent: "center", backgroundColor: "transparent" },
    walletBtnVerified: { backgroundColor: colors.primary, borderColor: colors.primary },
    walletBtnText: { fontSize: 9, fontFamily: "Inter_600SemiBold", color: colors.primary, letterSpacing: 0.3 },
    chatBtn: { width: 26, height: 26, borderRadius: 13, borderWidth: 1, borderColor: colors.primary, alignItems: "center", justifyContent: "center", backgroundColor: "transparent" },
    meritBar: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 20, paddingBottom: 8 },
    meritText: { fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
    meritSep: { fontSize: 11, color: colors.mutedForeground },
    modeToggle: { flexDirection: "row", marginHorizontal: 20, marginBottom: 12, backgroundColor: colors.surface, borderRadius: 12, padding: 3, gap: 2 },
    modeBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 9, borderRadius: 10 },
    modeBtnActive: { backgroundColor: colors.primary },
    modeBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground },
    modeBtnTextActive: { color: colors.primaryForeground },
    timerSection: { alignItems: "center", paddingVertical: 24, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: colors.border },
    timerLabel: { fontSize: 14, fontFamily: "Inter_500Medium", color: colors.mutedForeground, marginBottom: 8, letterSpacing: 1 },
    timerDisplay: { fontSize: 60, fontFamily: "Inter_700Bold", color: colors.foreground, letterSpacing: -2 },
    timerSub: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 4, marginBottom: 20 },
    startBtn: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.primary, paddingHorizontal: 40, paddingVertical: 14, borderRadius: 40 },
    startBtnDisabled: { opacity: 0.4 },
    startBtnText: { fontSize: 16, fontFamily: "Inter_700Bold", color: colors.primaryForeground, letterSpacing: 2 },
    stopBtn: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.destructive, paddingHorizontal: 40, paddingVertical: 14, borderRadius: 40 },
    stopBtnText: { fontSize: 16, fontFamily: "Inter_700Bold", color: colors.destructiveForeground, letterSpacing: 2 },
    listSection: { flex: 1, paddingHorizontal: 20, paddingTop: 14 },
    listTitle: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 12 },
    // Passport card
    passportCard: { flexDirection: "column", alignItems: "stretch", marginHorizontal: 20, marginBottom: 10, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.primary + "55", borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, gap: 0 },
    passportLeft: { flexDirection: "row", alignItems: "center", gap: 10, minWidth: 0 },
    passportAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.primary + "22", borderWidth: 1, borderColor: colors.primary + "66", alignItems: "center", justifyContent: "center", flexShrink: 0 },
    passportAvatarText: { fontSize: 16, fontFamily: "Inter_700Bold", color: colors.primary },
    passportName: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.foreground },
    passportId: { fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 1 },
    passportRankLabel: { fontSize: 10, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textTransform: "uppercase", letterSpacing: 0.5 },
    passportRank: { fontSize: 11, fontFamily: "Inter_700Bold", color: colors.primary },
    passportActions: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 12 },
    passportRefresh: { padding: 6, borderRadius: 8 },
    passportLogout: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
    passportLogoutText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
    passportRight: { alignItems: "flex-end" },

    // Registration banner
    regBanner: { flexDirection: "row", alignItems: "center", gap: 12, marginHorizontal: 20, marginBottom: 10, backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.primary, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12 },
    regBannerIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
    regBannerTitle: { fontSize: 14, fontFamily: "Inter_700Bold", color: colors.foreground },
    regBannerSub: { fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 2 },

    loginCard: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 20, marginBottom: 16, gap: 10 },
    loginCardTitle: { fontSize: 16, fontFamily: "Inter_700Bold", color: colors.foreground },
    langToggleBtn: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 5, borderWidth: 1, borderColor: colors.border },
    langToggleBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    langToggleText: { fontSize: 10, fontFamily: "Inter_700Bold", color: colors.mutedForeground, letterSpacing: 0.5 },
    langToggleTextActive: { color: colors.primaryForeground },
    langToggleSep: { fontSize: 10, color: colors.mutedForeground + "55", marginHorizontal: 1 },
    loginInputWrap: { flexDirection: "row", alignItems: "center", backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
    loginInputIcon: { flexShrink: 0 },
    loginInput: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", color: colors.foreground },
    loginError: { fontSize: 12, fontFamily: "Inter_400Regular", color: colors.destructive },
    loginBtn: { backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 12, alignItems: "center", justifyContent: "center" },
    loginBtnDisabled: { opacity: 0.4 },
    loginBtnText: { fontSize: 14, fontFamily: "Inter_700Bold", color: colors.primaryForeground, letterSpacing: 1 },
    loginDivider: { flexDirection: "row", alignItems: "center", gap: 8, marginVertical: 2 },
    loginDividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
    loginDividerText: { fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
    registerPrompt: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, marginBottom: 0 },
    privacyLink: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, opacity: 0.7 },
    privacyLinkText: { fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textDecorationLine: "underline" },
    registerPromptText: { flex: 1, fontSize: 14, fontFamily: "Inter_500Medium", color: colors.foreground },
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
