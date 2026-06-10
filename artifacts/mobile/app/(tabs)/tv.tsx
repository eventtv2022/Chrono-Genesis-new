import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
  TextInput,
  Platform,
  Modal,
  ScrollView,
  Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCitizen } from "@/context/CitizenContext";
import { useColors } from "@/hooks/useColors";
import { LogoBrand } from "@/components/LogoBrand";

const BASE_URL = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;

// ── Types ────────────────────────────────────────────────────────────────────

interface TvSlot {
  id: number;
  date: string;
  minuteIndex: number;
  slotType: "citizen" | "quarter" | "half" | "apex";
  status: "free" | "booked" | "aired";
  ownerId: number | null;
  timeltrBurnCost: number;
  isRetro: boolean;
  hourLabel: string;
  minLabel: string;
}

interface TvCapsule {
  id: number;
  slotId: number;
  citizenId: number;
  seedText: string | null;
  mode: "a" | "b";
  broadcastPolicy: "echo" | "noise" | "private";
  contentState: "filled" | "empty";
  hasSovereignLink: boolean;
  renderStatus: string | null;
  renderedAt: string | null;
  mediaFilename: string | null;
  catcastUrl: string | null;
  isReported: boolean;
}

interface RenderResult {
  ok: boolean;
  status: string;
  mediaUrl: string;
  catcastUrl: string | null;
  manifestoWords: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function stepDate(base: string, delta: number): string {
  const d = new Date(base);
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
}

function slotLabel(s: TvSlot): string {
  return `${s.hourLabel}:${s.minLabel}`;
}

const SLOT_TYPE_LABELS: Record<string, string> = {
  citizen: "Гражданин · 1 Д",
  quarter: "Четверть · 10 Д",
  half: "Полчаса · 25 Д",
  apex: "Апекс · 50 Д",
};

const BROADCAST_LABELS: Record<string, string> = {
  echo: "Эхо (публичный)",
  noise: "Шум (полупубличный)",
  private: "Приватный",
};

// ── CapsuleModal ─────────────────────────────────────────────────────────────

interface CapsuleModalProps {
  slot: TvSlot;
  onClose: () => void;
  colors: ReturnType<typeof useColors>;
}

function CapsuleModal({ slot, onClose, colors }: CapsuleModalProps) {
  const qc = useQueryClient();
  const { citizen } = useCitizen();
  const styles = getStyles(colors);

  const [seedText, setSeedText] = useState("");
  const [broadcastPolicy, setBroadcastPolicy] = useState<"echo" | "noise" | "private">("noise");
  const [hasSovereignLink, setHasSovereignLink] = useState(false);
  const [renderResult, setRenderResult] = useState<RenderResult | null>(null);

  // Load existing capsule
  const { data: capsule, isLoading: capsuleLoading } = useQuery<TvCapsule>({
    queryKey: ["tvCapsule", slot.id],
    queryFn: async () => {
      const res = await fetch(`${BASE_URL}/api/tv/capsule/${slot.id}`);
      if (res.status === 404) return null as unknown as TvCapsule;
      if (!res.ok) throw new Error("Ошибка загрузки капсулы");
      const data = await res.json() as TvCapsule;
      setSeedText(data.seedText ?? "");
      setBroadcastPolicy(data.broadcastPolicy);
      setHasSovereignLink(data.hasSovereignLink);
      return data;
    },
    retry: false,
  });

  // Create capsule
  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE_URL}/api/tv/capsule/${slot.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          citizenId: citizen!.id,
          seedText: seedText.trim() || undefined,
          broadcastPolicy,
          hasSovereignLink,
          mode: "a",
          renderPath: "light",
          contentState: "filled",
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? "Ошибка создания капсулы");
      }
      return res.json() as Promise<TvCapsule>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tvCapsule", slot.id] });
    },
    onError: (e: Error) => Alert.alert("Ошибка", e.message),
  });

  // Update capsule
  const updateMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE_URL}/api/tv/capsule/${slot.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seedText: seedText.trim() || undefined,
          broadcastPolicy,
          hasSovereignLink,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? "Ошибка обновления капсулы");
      }
      return res.json() as Promise<TvCapsule>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tvCapsule", slot.id] });
    },
    onError: (e: Error) => Alert.alert("Ошибка", e.message),
  });

  // Render capsule
  const renderMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE_URL}/api/tv/capsule/${slot.id}/render`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ citizenId: citizen!.id }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? "Ошибка рендера");
      }
      return res.json() as Promise<RenderResult>;
    },
    onSuccess: (data) => {
      setRenderResult(data);
      qc.invalidateQueries({ queryKey: ["tvCapsule", slot.id] });
    },
    onError: (e: Error) => Alert.alert("Ошибка рендера", e.message),
  });

  const hasCapsule = !!capsule;
  const isSaving = createMutation.isPending || updateMutation.isPending;
  const isRendering = renderMutation.isPending;

  const handleSave = () => {
    if (hasCapsule) {
      updateMutation.mutate();
    } else {
      createMutation.mutate();
    }
  };

  const handleRender = () => {
    Alert.alert(
      "Рендер капсулы",
      "Запустить генерацию AI-манифеста + озвучку + видео? Займёт ~30–60 секунд.",
      [
        { text: "Отмена", style: "cancel" },
        { text: "Рендерить", onPress: () => renderMutation.mutate() },
      ]
    );
  };

  const openVideo = () => {
    const url = renderResult?.mediaUrl
      ? `${BASE_URL}${renderResult.mediaUrl}`
      : capsule?.mediaFilename
        ? `${BASE_URL}/api/tv/media/${capsule.mediaFilename}`
        : null;
    if (url) Linking.openURL(url);
  };

  const openCatcast = (url: string) => {
    Linking.openURL(url);
  };

  const activeRenderResult = renderResult ?? (
    capsule?.mediaFilename
      ? { ok: true, status: "rendered", mediaUrl: `/api/tv/media/${capsule.mediaFilename}`, catcastUrl: capsule.catcastUrl, manifestoWords: 0 }
      : null
  );

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
        {/* Header */}
        <View style={styles.modalHeader}>
          <View>
            <Text style={styles.modalTitle}>
              🕐 {slotLabel(slot)} — {SLOT_TYPE_LABELS[slot.slotType] ?? slot.slotType}
            </Text>
            <Text style={styles.modalSubtitle}>{slot.date}{slot.isRetro ? " · Ретро" : ""}</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Feather name="x" size={22} color={colors.foreground} />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.modalScroll} contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>

          {capsuleLoading ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: 32 }} />
          ) : (
            <>
              {/* Status badge */}
              {hasCapsule && (
                <View style={[styles.statusBadge, { backgroundColor: capsule.mediaFilename ? colors.primary + "22" : colors.muted }]}>
                  <Feather
                    name={capsule.mediaFilename ? "film" : "edit-3"}
                    size={14}
                    color={capsule.mediaFilename ? colors.primary : colors.mutedForeground}
                  />
                  <Text style={[styles.statusBadgeText, { color: capsule.mediaFilename ? colors.primary : colors.mutedForeground }]}>
                    {capsule.mediaFilename ? "Отрендерено" : "Капсула создана"}
                  </Text>
                </View>
              )}

              {/* ── Seed text ── */}
              <Text style={styles.sectionLabel}>Seed-текст (необязательно)</Text>
              <TextInput
                style={[styles.textInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
                value={seedText}
                onChangeText={setSeedText}
                placeholder="Идея, тема или текст для AI-манифеста…"
                placeholderTextColor={colors.mutedForeground}
                multiline
                numberOfLines={4}
                maxLength={500}
                textAlignVertical="top"
              />
              <Text style={styles.charCount}>{seedText.length}/500</Text>

              {/* ── Broadcast policy ── */}
              <Text style={styles.sectionLabel}>Режим вещания</Text>
              <View style={styles.segmentRow}>
                {(["echo", "noise", "private"] as const).map((p) => (
                  <TouchableOpacity
                    key={p}
                    style={[
                      styles.segmentBtn,
                      { borderColor: colors.border, backgroundColor: broadcastPolicy === p ? colors.primary : colors.card },
                    ]}
                    onPress={() => setBroadcastPolicy(p)}
                  >
                    <Text style={[styles.segmentText, { color: broadcastPolicy === p ? "#fff" : colors.foreground }]}>
                      {p === "echo" ? "Эхо" : p === "noise" ? "Шум" : "Приват"}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.hintText}>{BROADCAST_LABELS[broadcastPolicy]}</Text>

              {/* ── Sovereign link ── */}
              <TouchableOpacity
                style={styles.toggleRow}
                onPress={() => setHasSovereignLink((v) => !v)}
              >
                <View style={[styles.checkbox, { borderColor: colors.border, backgroundColor: hasSovereignLink ? colors.primary : "transparent" }]}>
                  {hasSovereignLink && <Feather name="check" size={12} color="#fff" />}
                </View>
                <Text style={[styles.toggleLabel, { color: colors.foreground }]}>Sovereign Link</Text>
                <Text style={[styles.toggleHint, { color: colors.mutedForeground }]}>  уникальный URL в Таймлайне</Text>
              </TouchableOpacity>

              {/* ── Save button ── */}
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: colors.primary, opacity: isSaving ? 0.6 : 1 }]}
                onPress={handleSave}
                disabled={isSaving}
              >
                {isSaving
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.primaryBtnText}>{hasCapsule ? "Сохранить изменения" : "Создать капсулу"}</Text>
                }
              </TouchableOpacity>

              {/* ── Render section ── */}
              {hasCapsule && (
                <>
                  <View style={[styles.divider, { backgroundColor: colors.border }]} />
                  <Text style={styles.sectionLabel}>AI-рендер</Text>
                  <Text style={[styles.hintText, { marginBottom: 12 }]}>
                    LLM генерирует манифест → ElevenLabs озвучивает → FFmpeg собирает MP4 с водяным знаком TimeNation AI
                  </Text>

                  <TouchableOpacity
                    style={[styles.renderBtn, { borderColor: colors.primary, opacity: isRendering ? 0.6 : 1 }]}
                    onPress={handleRender}
                    disabled={isRendering}
                  >
                    {isRendering ? (
                      <View style={styles.renderBtnInner}>
                        <ActivityIndicator color={colors.primary} size="small" />
                        <Text style={[styles.renderBtnText, { color: colors.primary }]}>Рендер… ~30–60 сек</Text>
                      </View>
                    ) : (
                      <View style={styles.renderBtnInner}>
                        <Feather name="film" size={16} color={colors.primary} />
                        <Text style={[styles.renderBtnText, { color: colors.primary }]}>
                          {activeRenderResult ? "Перерендерить" : "Запустить рендер"}
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>

                  {/* ── Result ── */}
                  {activeRenderResult && (
                    <View style={[styles.resultCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                      <View style={styles.resultHeader}>
                        <Feather name="check-circle" size={16} color={colors.primary} />
                        <Text style={[styles.resultTitle, { color: colors.foreground }]}>Готово</Text>
                        {renderResult && renderResult.manifestoWords > 0 && (
                          <Text style={[styles.resultMeta, { color: colors.mutedForeground }]}>
                            {renderResult.manifestoWords} слов
                          </Text>
                        )}
                      </View>

                      <TouchableOpacity
                        style={[styles.mediaBtn, { backgroundColor: colors.primary }]}
                        onPress={openVideo}
                      >
                        <Feather name="play-circle" size={16} color="#fff" />
                        <Text style={styles.mediaBtnText}>Открыть MP4</Text>
                      </TouchableOpacity>

                      {activeRenderResult.catcastUrl ? (
                        <TouchableOpacity
                          style={[styles.catcastBtn, { borderColor: "#00AAFF" }]}
                          onPress={() => openCatcast(activeRenderResult.catcastUrl!)}
                        >
                          <Feather name="tv" size={14} color="#00AAFF" />
                          <Text style={[styles.catcastBtnText, { color: "#00AAFF" }]}>Открыть на Catcast.tv</Text>
                        </TouchableOpacity>
                      ) : (
                        <View style={[styles.catcastBtnDisabled, { borderColor: colors.border }]}>
                          <Feather name="tv" size={14} color={colors.mutedForeground} />
                          <Text style={[styles.catcastBtnText, { color: colors.mutedForeground }]}>
                            Catcast недоступен (требуется self-hosted)
                          </Text>
                        </View>
                      )}
                    </View>
                  )}
                </>
              )}
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function TvScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { citizen } = useCitizen();
  const [date, setDate] = useState(todayISO());
  const [selectedSlot, setSelectedSlot] = useState<TvSlot | null>(null);
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const styles = getStyles(colors);

  const { data, isLoading, refetch, isRefetching } = useQuery<{ date: string; count: number; slots: TvSlot[] }>({
    queryKey: ["tvSlots", date],
    queryFn: async () => {
      const res = await fetch(`${BASE_URL}/api/tv/slots?date=${date}`);
      if (!res.ok) throw new Error("Ошибка загрузки слотов");
      return res.json();
    },
    enabled: !!citizen,
  });

  const mySlots = (data?.slots ?? []).filter((s) => s.ownerId === citizen?.id);
  const freeCount = (data?.slots ?? []).filter((s) => s.status === "free").length;

  const handlePrevDay = useCallback(() => setDate((d) => stepDate(d, -1)), []);
  const handleNextDay = useCallback(() => setDate((d) => stepDate(d, 1)), []);

  const renderSlotCard = ({ item }: { item: TvSlot }) => (
    <TouchableOpacity
      style={[styles.slotCard, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={() => setSelectedSlot(item)}
      activeOpacity={0.75}
    >
      <View style={styles.slotCardLeft}>
        <Text style={[styles.slotTime, { color: colors.foreground }]}>{slotLabel(item)}</Text>
        <Text style={[styles.slotType, { color: colors.mutedForeground }]}>
          {SLOT_TYPE_LABELS[item.slotType] ?? item.slotType}
          {item.isRetro ? " · Ретро" : ""}
        </Text>
      </View>
      <View style={styles.slotCardRight}>
        <View style={[styles.slotBadge, {
          backgroundColor: item.status === "aired"
            ? colors.primary + "33"
            : colors.primary + "22",
        }]}>
          <Feather
            name={item.status === "aired" ? "film" : "clock"}
            size={12}
            color={colors.primary}
          />
          <Text style={[styles.slotBadgeText, { color: colors.primary }]}>
            {item.status === "aired" ? "Вышел в эфир" : "Мой слот"}
          </Text>
        </View>
        <Feather name="chevron-right" size={16} color={colors.mutedForeground} style={{ marginLeft: 8 }} />
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { paddingTop: topPad, backgroundColor: colors.background }]}>
      <LogoBrand />

      {/* Date nav */}
      <View style={[styles.dateNav, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={handlePrevDay} style={styles.dateArrow}>
          <Feather name="chevron-left" size={20} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.dateLabel, { color: colors.foreground }]}>{date}</Text>
        <TouchableOpacity onPress={handleNextDay} style={styles.dateArrow}>
          <Feather name="chevron-right" size={20} color={colors.foreground} />
        </TouchableOpacity>
      </View>

      {/* Summary row */}
      {data && (
        <View style={[styles.summaryRow, { borderBottomColor: colors.border }]}>
          <Text style={[styles.summaryText, { color: colors.mutedForeground }]}>
            <Text style={{ color: colors.foreground, fontWeight: "600" }}>{mySlots.length}</Text> мои ·{" "}
            <Text style={{ color: colors.foreground, fontWeight: "600" }}>{freeCount}</Text> свободных из 1440
          </Text>
          <TouchableOpacity onPress={() => refetch()} disabled={isRefetching}>
            <Feather
              name="refresh-cw"
              size={15}
              color={isRefetching ? colors.mutedForeground : colors.primary}
            />
          </TouchableOpacity>
        </View>
      )}

      {/* No citizen */}
      {!citizen && (
        <View style={styles.emptyState}>
          <Feather name="user-x" size={40} color={colors.mutedForeground} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Войдите в аккаунт для доступа к TV</Text>
        </View>
      )}

      {/* Loading */}
      {isLoading && (
        <View style={styles.emptyState}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Загрузка слотов…</Text>
        </View>
      )}

      {/* Empty — no booked slots */}
      {!isLoading && citizen && mySlots.length === 0 && (
        <View style={styles.emptyState}>
          <Feather name="tv" size={44} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Нет забронированных слотов</Text>
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            Забронируйте слоты через веб-интерфейс TimeNation-TV, чтобы управлять капсулами здесь
          </Text>
        </View>
      )}

      {/* Slot list */}
      {!isLoading && mySlots.length > 0 && (
        <FlatList
          data={mySlots}
          keyExtractor={(s) => String(s.id)}
          renderItem={renderSlotCard}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          ListHeaderComponent={
            <Text style={[styles.listHeader, { color: colors.mutedForeground }]}>
              Нажмите на слот чтобы управлять капсулой
            </Text>
          }
        />
      )}

      {/* Capsule modal */}
      {selectedSlot && (
        <CapsuleModal
          slot={selectedSlot}
          onClose={() => setSelectedSlot(null)}
          colors={colors}
        />
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function getStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    container: { flex: 1 },

    // Date navigation
    dateNav: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderBottomWidth: 1,
    },
    dateArrow: { padding: 8 },
    dateLabel: { fontSize: 16, fontWeight: "600", letterSpacing: 0.5 },

    // Summary
    summaryRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    summaryText: { fontSize: 13 },

    // List
    listContent: { padding: 16 },
    listHeader: { fontSize: 12, marginBottom: 12, textAlign: "center" },

    // Slot card
    slotCard: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      padding: 14,
      borderRadius: 12,
      borderWidth: 1,
    },
    slotCardLeft: { flex: 1 },
    slotCardRight: { flexDirection: "row", alignItems: "center" },
    slotTime: { fontSize: 20, fontWeight: "700", fontVariant: ["tabular-nums"] },
    slotType: { fontSize: 12, marginTop: 2 },
    slotBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 20,
    },
    slotBadgeText: { fontSize: 11, fontWeight: "600" },

    // Empty state
    emptyState: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: 40,
      gap: 12,
    },
    emptyTitle: { fontSize: 17, fontWeight: "600", textAlign: "center" },
    emptyText: { fontSize: 14, textAlign: "center", lineHeight: 20 },

    // ── Modal ──
    modalContainer: { flex: 1 },
    modalHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      padding: 20,
      paddingTop: 24,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    modalTitle: { fontSize: 17, fontWeight: "700", color: colors.foreground },
    modalSubtitle: { fontSize: 12, color: colors.mutedForeground, marginTop: 2 },
    closeBtn: { padding: 4 },
    modalScroll: { flex: 1, paddingHorizontal: 20, paddingTop: 16 },

    // Status badge
    statusBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      alignSelf: "flex-start",
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 20,
      marginBottom: 16,
    },
    statusBadgeText: { fontSize: 12, fontWeight: "600" },

    // Form
    sectionLabel: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.mutedForeground,
      textTransform: "uppercase",
      letterSpacing: 0.8,
      marginBottom: 8,
      marginTop: 16,
    },
    textInput: {
      borderWidth: 1,
      borderRadius: 10,
      padding: 12,
      fontSize: 15,
      minHeight: 100,
    },
    charCount: {
      fontSize: 11,
      color: colors.mutedForeground,
      textAlign: "right",
      marginTop: 4,
    },
    segmentRow: { flexDirection: "row", gap: 8 },
    segmentBtn: {
      flex: 1,
      paddingVertical: 9,
      borderRadius: 8,
      borderWidth: 1,
      alignItems: "center",
    },
    segmentText: { fontSize: 13, fontWeight: "600" },
    hintText: { fontSize: 12, color: colors.mutedForeground, marginTop: 4 },

    // Toggle row
    toggleRow: {
      flexDirection: "row",
      alignItems: "center",
      marginTop: 16,
      gap: 8,
    },
    checkbox: {
      width: 20,
      height: 20,
      borderRadius: 4,
      borderWidth: 1.5,
      alignItems: "center",
      justifyContent: "center",
    },
    toggleLabel: { fontSize: 14, fontWeight: "600" },
    toggleHint: { fontSize: 12 },

    // Buttons
    primaryBtn: {
      marginTop: 20,
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: "center",
    },
    primaryBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },

    divider: { height: StyleSheet.hairlineWidth, marginVertical: 20 },

    renderBtn: {
      paddingVertical: 14,
      borderRadius: 12,
      borderWidth: 1.5,
      alignItems: "center",
    },
    renderBtnInner: { flexDirection: "row", alignItems: "center", gap: 8 },
    renderBtnText: { fontSize: 15, fontWeight: "600" },

    // Result card
    resultCard: {
      marginTop: 16,
      padding: 16,
      borderRadius: 12,
      borderWidth: 1,
      gap: 10,
    },
    resultHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
    resultTitle: { fontSize: 15, fontWeight: "700", flex: 1 },
    resultMeta: { fontSize: 12 },

    mediaBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingVertical: 12,
      borderRadius: 10,
    },
    mediaBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },

    catcastBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingVertical: 11,
      borderRadius: 10,
      borderWidth: 1.5,
    },
    catcastBtnDisabled: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingVertical: 11,
      borderRadius: 10,
      borderWidth: 1,
      opacity: 0.5,
    },
    catcastBtnText: { fontSize: 13, fontWeight: "600" },
  });
}
