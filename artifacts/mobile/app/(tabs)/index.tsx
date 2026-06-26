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
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useCitizen } from "@/context/CitizenContext";
import { useColors } from "@/hooks/useColors";
import { LogoBrand } from "@/components/LogoBrand";
import { AnimatedHourglass } from "@/components/AnimatedHourglass";
import { ContextualGuideModal } from "@/components/ContextualGuideModal";
import { useContextualGuide } from "@/hooks/useContextualGuide";
import { DiscussionModal } from "@/components/DiscussionModal";

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

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  open:           { label: "Открыта",                   color: "#4CAF50" },
  accepted:       { label: "Принята исполнителем",      color: "#2196F3" },
  proof_submitted:{ label: "Ожидает подписания Акта",   color: "#FF9800" },
  completed:      { label: "Завершена ✓",               color: "#C9A84C" },
  declined:       { label: "Доказательство отклонено",  color: "#F44336" },
  disputed:       { label: "В арбитраже Минтруда ⚖️",   color: "#9C27B0" },
  cancelled:      { label: "Отменена",                  color: "#607D8B" },
};

// ─── AI Rate Widget ───────────────────────────────────────────────────────────
function RateWidget({ recipient, colors }: { recipient: Citizen; colors: ReturnType<typeof useColors> }) {
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
        <Text style={[rateStyles.title, { color: colors.primary }]}>Проверка ИИ-Аудитора</Text>
        {rate.skillsAuditedAt && (
          <Text style={[rateStyles.badge, { color: colors.mutedForeground }]}>подтверждено</Text>
        )}
      </View>
      <View style={rateStyles.row}>
        <View style={rateStyles.stat}>
          <Text style={[rateStyles.statVal, { color: colors.primary }]}>{rate.calculatedMinuteRate.toFixed(2)} Д</Text>
          <Text style={[rateStyles.statLbl, { color: colors.mutedForeground }]}>за минуту</Text>
        </View>
        <View style={rateStyles.divider} />
        <View style={rateStyles.stat}>
          <Text style={[rateStyles.statVal, { color: colors.primary }]}>{rate.calculatedHourRate.toFixed(0)} Д</Text>
          <Text style={[rateStyles.statLbl, { color: colors.mutedForeground }]}>за час работы</Text>
        </View>
        <View style={rateStyles.divider} />
        <View style={rateStyles.stat}>
          <Text style={[rateStyles.statVal, { color: colors.primary }]}>{rate.reviewScoreCount}</Text>
          <Text style={[rateStyles.statLbl, { color: colors.mutedForeground }]}>отзывов</Text>
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
    if (!r.ok) throw new Error((data as { error?: string }).error ?? "Ошибка сервера");
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
      Alert.alert("Ошибка", "Опиши задачу подробнее (минимум 5 символов)");
      return;
    }
    setAuditing(true);
    try {
      const r = await fetch(`${BASE_URL}/api/deals/audit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: description.trim() }),
      });
      const data = await r.json() as { suggestedAmount?: number; summary?: string; breakdown?: string[]; error?: string };
      if (!r.ok) throw new Error(data.error ?? "Ошибка аудита");
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
      Alert.alert("ИИ-Аудитор", (e as Error).message);
    }
    setAuditing(false);
  };

  const handleCreate = async () => {
    if (!selRecipient) { setRecipientError(true); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); return; }
    const amt = parseInt(amount, 10);
    if (isNaN(amt) || amt < 1) { Alert.alert("Ошибка", "Укажи сумму в Дарминах (минимум 1)"); return; }
    if (description.trim().length < 5) { Alert.alert("Ошибка", "ТЗ должно быть не менее 5 символов"); return; }

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
          "Недостаточно Дарминов",
          `Недостаточно Дарминов на Вашем счету для совершения сделки.\n\nДоступно: ${available.toFixed(2)} Д\nНеобходимо: ${amt} Д`,
          [{ text: "Понятно" }]
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
      if (msg.toLowerCase().includes("недостаточно")) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert("Недостаточно Дарминов", "Недостаточно Дарминов на Вашем счету для совершения сделки.", [{ text: "Понятно" }]);
      } else {
        Alert.alert("Ошибка создания сделки", msg);
      }
    }
    setCreating(false);
  };

  const handleAccept = async (deal: Deal) => {
    try {
      await apiPost(`/api/deals/${deal.id}/accept-task`, { citizenId: citizen.id });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await loadDeals();
    } catch (e: unknown) { Alert.alert("Ошибка", (e as Error).message); }
  };

  const handleProofSubmit = async () => {
    if (!proofDeal) return;
    if (proofText.trim().length < 5) { Alert.alert("Ошибка", "Опиши выполненную работу (мин. 5 символов)"); return; }
    setSubmittingProof(true);
    try {
      await apiPost(`/api/deals/${proofDeal.id}/proof`, { receiverId: citizen.id, proofText: proofText.trim() });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setProofDeal(null);
      setProofText("");
      await loadDeals();
    } catch (e: unknown) { Alert.alert("Ошибка", (e as Error).message); }
    setSubmittingProof(false);
  };

  const handleComplete = async (deal: Deal) => {
    Alert.alert(
      "Подписать Акт выполненных работ",
      `Подтвердить получение ${deal.amount} Д от исполнителя? Дармины будут переведены исполнителю.`,
      [
        { text: "Отмена", style: "cancel" },
        {
          text: "Подписать ✓",
          onPress: async () => {
            try {
              await apiPost(`/api/deals/${deal.id}/complete`, { citizenId: citizen.id });
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              await loadDeals();
            } catch (e: unknown) { Alert.alert("Ошибка", (e as Error).message); }
          },
        },
      ]
    );
  };

  const handleDecline = async (deal: Deal) => {
    Alert.alert(
      "Отклонить доказательство",
      "Доказательство не принято. Эскроу остаётся заморожен. Далее — арбитраж или отмена.",
      [
        { text: "Отмена", style: "cancel" },
        {
          text: "Отклонить",
          style: "destructive",
          onPress: async () => {
            try {
              await apiPost(`/api/deals/${deal.id}/decline`, { citizenId: citizen.id });
              await loadDeals();
            } catch (e: unknown) { Alert.alert("Ошибка", (e as Error).message); }
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
    } catch (e: unknown) { Alert.alert("Ошибка", (e as Error).message); }
  };

  const handleDisputeSubmit = async () => {
    if (!disputeDeal) return;
    if (claimText.trim().length < 10) { Alert.alert("Ошибка", "Опишите суть претензии подробнее (мин. 10 символов)"); return; }
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
    } catch (e: unknown) { Alert.alert("Ошибка", (e as Error).message); }
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
          <Text style={s.dealId}>Сделка #{deal.id}</Text>
          <View style={[s.statusBadge, { backgroundColor: info.color + "22", borderColor: info.color }]}>
            <Text style={[s.statusText, { color: info.color }]}>{info.label}</Text>
          </View>
        </View>
        <Text style={s.dealRole}>{isSender ? "👤 Вы: Заказчик" : "🔧 Вы: Исполнитель"}</Text>
        <Text style={s.dealAmount}>💎 {deal.amount} Дарминов заморожено</Text>
        <Text style={s.dealDesc} numberOfLines={3}>{deal.description}</Text>

        {deal.proofText ? (
          <View style={s.proofBlock}>
            <Text style={s.proofLabel}>Доказательство исполнителя:</Text>
            <Text style={s.proofText}>{deal.proofText}</Text>
          </View>
        ) : null}

        {deal.aiVerdict ? (
          <TouchableOpacity style={s.verdictBtn} onPress={() => setVerdictDeal(deal)}>
            <Feather name="cpu" size={12} color={colors.primary} />
            <Text style={s.verdictBtnText}>Заключение ИИ-Арбитра</Text>
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
              <Text style={[s.actionBtnText, { color: colors.primary }]}>Обсудить{deal.totalTrackedMinutes > 0 ? ` · ${deal.totalTrackedMinutes} мин` : ""}</Text>
            </TouchableOpacity>
          )}
          {canAccept && (
            <TouchableOpacity style={[s.actionBtn, s.actionBtnBlue]} onPress={() => handleAccept(deal)}>
              <Text style={s.actionBtnText}>Принять задачу</Text>
            </TouchableOpacity>
          )}
          {canProof && (
            <TouchableOpacity style={[s.actionBtn, s.actionBtnBlue]} onPress={() => { setProofDeal(deal); setProofText(""); }}>
              <Text style={s.actionBtnText}>Сдать работу</Text>
            </TouchableOpacity>
          )}
          {canComplete && (
            <TouchableOpacity style={[s.actionBtn, s.actionBtnGreen]} onPress={() => handleComplete(deal)}>
              <Feather name="check-circle" size={13} color="#fff" />
              <Text style={s.actionBtnText}>Подписать Акт</Text>
            </TouchableOpacity>
          )}
          {canDecline && (
            <TouchableOpacity style={[s.actionBtn, s.actionBtnRed]} onPress={() => handleDecline(deal)}>
              <Text style={s.actionBtnText}>Отклонить</Text>
            </TouchableOpacity>
          )}
          {canDispute && (
            <TouchableOpacity style={[s.actionBtn, s.actionBtnPurple]} onPress={() => { setDisputeDeal(deal); setClaimText(""); }}>
              <Feather name="alert-triangle" size={12} color="#fff" />
              <Text style={s.actionBtnText}>Апелляция в Минтруд</Text>
            </TouchableOpacity>
          )}
          {canCancel && cancelConfirmId !== deal.id && (
            <TouchableOpacity style={[s.actionBtn, s.actionBtnGray]} onPress={() => setCancelConfirmId(deal.id)}>
              <Text style={s.actionBtnText}>Отменить сделку</Text>
            </TouchableOpacity>
          )}
          {canCancel && cancelConfirmId === deal.id && (
            <View style={{ width: "100%", backgroundColor: "#E0525222", borderRadius: 10, padding: 10, marginTop: 4, gap: 8 }}>
              <Text style={{ color: "#E05252", fontSize: 12, fontFamily: "Inter_600SemiBold", textAlign: "center" }}>
                {deal.status === "accepted"
                  ? `Исполнитель уже принял задачу. Отменить и вернуть ${deal.amount} Д?`
                  : `Вернуть ${deal.amount} Д на баланс и отменить сделку?`}
              </Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TouchableOpacity
                  style={[s.actionBtn, s.actionBtnGray, { flex: 1, marginTop: 0 }]}
                  onPress={() => setCancelConfirmId(null)}
                >
                  <Text style={s.actionBtnText}>Нет, оставить</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.actionBtn, s.actionBtnRed, { flex: 1, marginTop: 0 }]}
                  onPress={() => handleCancel(deal)}
                >
                  <Feather name="x-circle" size={13} color="#fff" />
                  <Text style={s.actionBtnText}>Да, отменить</Text>
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
        <Text style={s.escrowTitle}>Эскроу-сделки</Text>
        <TouchableOpacity style={s.createBtn} onPress={() => setShowCreate(true)} activeOpacity={0.8}>
          <Feather name="plus" size={14} color={colors.primaryForeground} />
          <Text style={s.createBtnText}>Создать сделку</Text>
        </TouchableOpacity>
      </View>
      <Text style={s.escrowSub}>Дармины замораживаются. Релиз — после подписания Акта.</Text>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} />
      ) : deals.length === 0 ? (
        <View style={s.empty}>
          <Feather name="lock" size={32} color={colors.mutedForeground} />
          <Text style={s.emptyText}>Нет активных сделок</Text>
          <Text style={s.emptySub}>Создай сделку — Дармины будут заморожены до подписания Акта</Text>
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
                  <Text style={[s.modalTitle, { color: colors.foreground }]}>Новая Эскроу-сделка</Text>
                  <Text style={{ fontSize: 11, color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginTop: 2 }}>Шаг 1 из 2 — Описание задачи</Text>
                </View>
                <TouchableOpacity onPress={resetCreateModal}>
                  <Feather name="x" size={22} color={colors.mutedForeground} />
                </TouchableOpacity>
              </View>

              <Text style={[s.label, { color: colors.mutedForeground }]}>ТЕХНИЧЕСКОЕ ЗАДАНИЕ</Text>
              <TextInput
                style={[s.input, s.inputMulti, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card }]}
                placeholder="Подробно опиши, что должен сделать исполнитель: что именно, в каком объёме, какой результат..."
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
                  <Text style={{ fontSize: 12, fontFamily: "Inter_700Bold", color: colors.primary }}>ИИ-Аудитор Минтруда</Text>
                </View>
                <Text style={{ fontSize: 11, color: colors.mutedForeground, fontFamily: "Inter_400Regular", lineHeight: 16 }}>
                  Аудитор оценит трудозатраты в Дарминах, разобьёт работу на этапы и предложит справедливую сумму.
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
                    <Text style={[s.submitBtnText, { color: colors.primaryForeground }]}>Аудитор анализирует...</Text>
                  </>
                ) : (
                  <>
                    <Feather name="cpu" size={16} color={colors.primaryForeground} />
                    <Text style={[s.submitBtnText, { color: colors.primaryForeground }]}>Оценить задачу</Text>
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
                  <Text style={[s.modalTitle, { color: colors.foreground }]}>Оценка ИИ-Аудитора</Text>
                  <Text style={{ fontSize: 11, color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginTop: 2 }}>Шаг 2 из 2 — Подтверждение сделки</Text>
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
                    <Text style={{ fontSize: 13, fontFamily: "Inter_700Bold", color: colors.primary }}>Заключение Минтруда</Text>
                  </View>
                  <Text style={{ fontSize: 12, color: colors.foreground, fontFamily: "Inter_400Regular", lineHeight: 18, marginBottom: 10 }}>
                    {auditResult.summary}
                  </Text>
                  <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold", color: colors.mutedForeground, marginBottom: 6, letterSpacing: 0.5 }}>РАЗБИВКА ПО ЭТАПАМ</Text>
                  {auditResult.breakdown.map((line, i) => (
                    <View key={i} style={{ flexDirection: "row", alignItems: "flex-start", gap: 6, marginBottom: 4 }}>
                      <Text style={{ color: colors.primary, fontSize: 11, fontFamily: "Inter_700Bold", marginTop: 1 }}>•</Text>
                      <Text style={{ fontSize: 11, color: colors.foreground, fontFamily: "Inter_400Regular", flex: 1, lineHeight: 16 }}>{line}</Text>
                    </View>
                  ))}
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.primary + "33" }}>
                    <Text style={{ fontSize: 12, fontFamily: "Inter_700Bold", color: colors.mutedForeground }}>Рекомендуемая сумма</Text>
                    <Text style={{ fontSize: 18, fontFamily: "Inter_700Bold", color: colors.primary }}>{auditResult.suggestedAmount} Д</Text>
                  </View>
                </View>
              )}

              {/* ТЗ summary (readonly) */}
              <View style={{ backgroundColor: colors.card, borderRadius: 8, padding: 10, marginBottom: 16, borderWidth: 1, borderColor: colors.border }}>
                <Text style={{ fontSize: 10, fontFamily: "Inter_700Bold", color: colors.mutedForeground, marginBottom: 4, letterSpacing: 0.5 }}>ТЕХНИЧЕСКОЕ ЗАДАНИЕ</Text>
                <Text style={{ fontSize: 12, color: colors.foreground, fontFamily: "Inter_400Regular", lineHeight: 17 }} numberOfLines={4}>{description}</Text>
                <TouchableOpacity onPress={() => setCreateStep("describe")} style={{ marginTop: 6 }}>
                  <Text style={{ fontSize: 11, color: colors.primary, fontFamily: "Inter_700Bold" }}>✎ Изменить задачу</Text>
                </TouchableOpacity>
              </View>

              {/* Recipient */}
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <Text style={[s.label, { color: recipientError && !selRecipient ? "#E05252" : colors.mutedForeground, marginBottom: 0 }]}>
                  ИСПОЛНИТЕЛЬ <Text style={{ color: "#E05252" }}>*</Text>
                </Text>
                {recipientError && !selRecipient && (
                  <Text style={{ fontSize: 11, color: "#E05252", fontFamily: "Inter_400Regular" }}>↑ Выбери исполнителя</Text>
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
                  <View style={[s.avatar, { backgroundColor: colors.surface }]}>
                    <Text style={[s.avatarText, { color: colors.primary }]}>{c.name.charAt(0).toUpperCase()}</Text>
                  </View>
                  <Text style={[s.selName, { color: colors.foreground }]}>{c.name}</Text>
                  <Text style={[s.selBalance, { color: colors.mutedForeground }]}>{c.balanceMinutes} Д</Text>
                  {selRecipient?.id === c.id && <Feather name="check-circle" size={18} color={colors.primary} />}
                </TouchableOpacity>
              ))}

              {/* Amount (pre-filled, editable) */}
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 16, marginBottom: 8 }}>
                <Text style={[s.label, { color: colors.mutedForeground, marginBottom: 0 }]}>СУММА (ДАРМИНЫ)</Text>
                <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>
                  Доступно: <Text style={{ color: colors.primary, fontFamily: "Inter_700Bold" }}>{Math.max(0, Number(citizen.balanceMinutes) - 1).toFixed(0)} Д</Text>
                </Text>
              </View>
              <TextInput
                style={[s.input, { borderColor: colors.primary + "88", color: colors.foreground, backgroundColor: colors.card, borderWidth: 1.5 }]}
                keyboardType="number-pad"
                placeholder="Количество Дарминов"
                placeholderTextColor={colors.mutedForeground}
                value={amount}
                onChangeText={setAmount}
              />
              {auditResult && parseInt(amount, 10) !== auditResult.suggestedAmount && (
                <TouchableOpacity onPress={() => setAmount(String(auditResult.suggestedAmount))} style={{ marginTop: -8, marginBottom: 8, alignSelf: "flex-end", paddingRight: 4 }}>
                  <Text style={{ fontSize: 11, color: colors.primary, fontFamily: "Inter_400Regular" }}>
                    ↩ Вернуть рекомендацию ({auditResult.suggestedAmount} Д)
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
                      {!selRecipient ? "Сначала выбери исполнителя ↑" : "Заморозить Дармины и создать сделку"}
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
            <Text style={[s.modalTitle, { color: colors.foreground }]}>Сдача работы</Text>
            <TouchableOpacity onPress={() => setProofDeal(null)}>
              <Feather name="x" size={22} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
          {proofDeal && <Text style={[s.proofDealDesc, { color: colors.mutedForeground }]}>ТЗ: {proofDeal.description}</Text>}
          <Text style={[s.label, { color: colors.mutedForeground }]}>ОПИСАНИЕ ВЫПОЛНЕННОЙ РАБОТЫ</Text>
          <TextInput
            style={[s.input, s.inputMulti, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card }]}
            placeholder="Опиши, что было сделано..."
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
                <Text style={[s.submitBtnText, { color: "#fff" }]}>Отправить доказательство</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </Modal>

      {/* ── Dispute Modal ─────────────────────────────────────────────────── */}
      <Modal visible={!!disputeDeal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setDisputeDeal(null)}>
        <View style={[s.modal, { backgroundColor: colors.background }]}>
          <View style={s.modalHeader}>
            <Text style={[s.modalTitle, { color: colors.foreground }]}>Апелляция в Минтруд</Text>
            <TouchableOpacity onPress={() => setDisputeDeal(null)}>
              <Feather name="x" size={22} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
          <Text style={[s.disputeInfo, { color: colors.mutedForeground }]}>
            ИИ-Арбитр Министерства Труда изучит ТЗ, доказательства и вашу претензию. Вердикт будет записан в дело.
          </Text>
          <Text style={[s.label, { color: colors.mutedForeground }]}>СУТЬ ПРЕТЕНЗИИ</Text>
          <TextInput
            style={[s.input, s.inputMulti, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card }]}
            placeholder="Подробно опиши, в чём нарушение со стороны другой стороны..."
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
                <Text style={[s.submitBtnText, { color: "#fff" }]}>ИИ-Арбитр анализирует…</Text>
              </>
            ) : (
              <>
                <Feather name="alert-triangle" size={16} color="#fff" />
                <Text style={[s.submitBtnText, { color: "#fff" }]}>Подать апелляцию</Text>
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
                <Text style={[s.modalTitle, { color: colors.primary }]}>Заключение ИИ-Арбитра</Text>
              </View>
              <TouchableOpacity onPress={() => setVerdictDeal(null)}>
                <Feather name="x" size={20} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
            <Text style={[s.disputeInfo, { color: colors.mutedForeground, marginBottom: 4 }]}>
              Министерство Труда · Сделка #{verdictDeal?.id}
            </Text>
            <ScrollView style={{ maxHeight: 340 }}>
              <Text style={[s.verdictText, { color: colors.foreground }]}>{verdictDeal?.aiVerdict}</Text>
            </ScrollView>
            <TouchableOpacity style={[s.submitBtn, { backgroundColor: colors.primary, marginTop: 16 }]} onPress={() => setVerdictDeal(null)}>
              <Text style={[s.submitBtnText, { color: colors.primaryForeground }]}>Принято к сведению</Text>
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
  const { citizen, refreshCitizen } = useCitizen();
  const router = useRouter();
  const queryClient = useQueryClient();
  const walletGuide = useContextualGuide("wallet");

  const [mode, setMode] = useState<"transfer" | "escrow">("transfer");
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
    const sheetsStatus = data.sheetsLogged ? "Записано в Казначейство" : "Ошибка записи";
    Alert.alert("Сессия завершена", `Передано: ${mins} Д\nДлительность: ${formatTime(secs)}\n${sheetsStatus}`);
  };

  const [sessionLoading, setSessionLoading] = useState(false);
  const handleStart = useCallback(async () => {
    if (!citizen) { router.push("/register"); return; }
    if (!selectedRecipient) { Alert.alert("Выбери получателя", "Нажми на гражданина ниже"); return; }
    setSessionLoading(true);
    try { await startSession(); } catch (e: unknown) { Alert.alert("Ошибка", (e as Error).message); }
    setSessionLoading(false);
  }, [citizen, selectedRecipient]);

  const handleStop = useCallback(async () => {
    if (!activeSession) return;
    setSessionLoading(true);
    try { await stopSession(); } catch (e: unknown) { Alert.alert("Ошибка", (e as Error).message); }
    setSessionLoading(false);
  }, [activeSession]);

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
              <Text style={styles.rankText}>{citizen.rank ?? "Странник"}</Text>
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
          <Text style={styles.meritText}>Отдано: {citizen.totalGiven.toFixed(2)} Д</Text>
        </View>
      )}

      {/* ── Passport card / Registration banner ────────────────────────────── */}
      {citizen ? (
        <View style={styles.passportCard}>
          <View style={styles.passportLeft}>
            <View style={styles.passportAvatar}>
              <Text style={styles.passportAvatarText}>{citizen.name.charAt(0).toUpperCase()}</Text>
            </View>
            <View>
              <Text style={styles.passportName}>{citizen.name}</Text>
              <Text style={styles.passportId}>ID #{citizen.id} · {citizen.phone}</Text>
            </View>
          </View>
          <View style={styles.passportRight}>
            <Text style={styles.passportRankLabel}>Ранг</Text>
            <Text style={styles.passportRank}>{citizen.rank ?? "Странник"}</Text>
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
            <Text style={styles.regBannerTitle}>Получить гражданство</Text>
            <Text style={styles.regBannerSub}>Зарегистрируйся и получи 60 Д</Text>
          </View>
          <Feather name="chevron-right" size={18} color={colors.primary} />
        </TouchableOpacity>
      )}

      {/* ── Mode toggle ────────────────────────────────────────────────────── */}
      <View style={styles.modeToggle}>
        <TouchableOpacity
          style={[styles.modeBtn, mode === "transfer" && styles.modeBtnActive]}
          onPress={() => setMode("transfer")}
          activeOpacity={0.8}
        >
          <Feather name="play-circle" size={13} color={mode === "transfer" ? colors.primaryForeground : colors.mutedForeground} />
          <Text style={[styles.modeBtnText, mode === "transfer" && styles.modeBtnTextActive]}>Перевод</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modeBtn, mode === "escrow" && styles.modeBtnActive]}
          onPress={() => setMode("escrow")}
          activeOpacity={0.8}
        >
          <Feather name="lock" size={13} color={mode === "escrow" ? colors.primaryForeground : colors.mutedForeground} />
          <Text style={[styles.modeBtnText, mode === "escrow" && styles.modeBtnTextActive]}>Эскроу</Text>
        </TouchableOpacity>
      </View>

      {/* ── Transfer mode ──────────────────────────────────────────────────── */}
      {mode === "transfer" && (
        <>
          <View style={styles.timerSection}>
            {activeSession ? (
              <>
                <AnimatedHourglass active={true} size={36} />
                <Text style={styles.timerLabel}>→ {recipientCitizen?.name ?? "..."}</Text>
                <Text style={styles.timerDisplay}>{formatTime(elapsed)}</Text>
                <Text style={styles.timerSub}>~{Math.max(1, Math.ceil(elapsed / 60))} Д будет передано</Text>
                <TouchableOpacity style={styles.stopBtn} onPress={handleStop} disabled={sessionLoading} activeOpacity={0.75}>
                  {sessionLoading ? (
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
                  disabled={sessionLoading || !selectedRecipient}
                  activeOpacity={0.75}
                >
                  {sessionLoading ? (
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

          {/* AI Auditor Rate Widget */}
          {selectedRecipient && !activeSession && (
            <RateWidget recipient={selectedRecipient} colors={colors} />
          )}

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
        </>
      )}

      {/* ── Escrow mode ────────────────────────────────────────────────────── */}
      {mode === "escrow" && citizen && (
        <EscrowModule citizen={citizen} citizens={others} colors={colors} refreshCitizen={refreshCitizen} />
      )}
      {mode === "escrow" && !citizen && (
        <View style={styles.emptyState}>
          <Feather name="lock" size={32} color={colors.mutedForeground} />
          <Text style={styles.emptyText}>Нужна регистрация</Text>
          <TouchableOpacity onPress={() => router.push("/register")} activeOpacity={0.8}>
            <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold", fontSize: 14, marginTop: 8 }}>
              Зарегистрироваться →
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <ContextualGuideModal
        visible={walletGuide.visible}
        onClose={walletGuide.close}
        onConfirm={walletGuide.confirm}
        icon="💰"
        title="Баланс Darmin / Кошелёк"
        explanation={"Darmin — государственная валюта. Она зарабатывается исключительно за полезные социальные и исторические действия (успешная модерация, создание ИИ-кино), а не покупается за фиат.\n\nМериты — это цифровой след репутации, который накапливается в паспорте гражданина и автоматически повышает ранг."}
        ctaLabel="Посмотри историю транзакций и начислений"
      />
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
    passportCard: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginHorizontal: 20, marginBottom: 10, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.primary + "55", borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10 },
    passportLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
    passportAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.primary + "22", borderWidth: 1, borderColor: colors.primary + "66", alignItems: "center", justifyContent: "center" },
    passportAvatarText: { fontSize: 16, fontFamily: "Inter_700Bold", color: colors.primary },
    passportName: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.foreground },
    passportId: { fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 1 },
    passportRight: { alignItems: "flex-end" },
    passportRankLabel: { fontSize: 10, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textTransform: "uppercase", letterSpacing: 0.5 },
    passportRank: { fontSize: 12, fontFamily: "Inter_700Bold", color: colors.primary },

    // Registration banner
    regBanner: { flexDirection: "row", alignItems: "center", gap: 12, marginHorizontal: 20, marginBottom: 10, backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.primary, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12 },
    regBannerIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
    regBannerTitle: { fontSize: 14, fontFamily: "Inter_700Bold", color: colors.foreground },
    regBannerSub: { fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 2 },

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
