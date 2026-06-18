import React, { useState, useCallback, useEffect, useRef } from "react";
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
  Image,
  Animated,
} from "react-native";
import * as WebBrowser from "expo-web-browser";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCitizen } from "@/context/CitizenContext";
import { useColors } from "@/hooks/useColors";
import { LogoBrand } from "@/components/LogoBrand";
import { ContextualGuideModal } from "@/components/ContextualGuideModal";
import { useContextualGuide } from "@/hooks/useContextualGuide";

const BASE_URL = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;

// ── Types ────────────────────────────────────────────────────────────────────

interface TvSlot {
  id: number;
  date: string;
  minuteIndex: number;
  slotType: "citizen" | "quarter" | "half" | "apex";
  status: "free" | "booked" | "broadcast";
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
  visualStyle: string | null;
  status: string | null;
  renderProgress: string | null;
  mediaUrl: string | null;
  catcastUrl: string | null;
  isReported: boolean;
}

const RENDER_PROGRESS_LABELS: Record<string, string> = {
  generating_prompt: "Создание манифеста…",
  generating_tts: "Генерация озвучки…",
  fetching_video: "Загрузка AI-фона…",
  encoding: "Сборка MP4…",
  done: "Готово!",
};

const RENDER_PROGRESS_STAGES = [
  "generating_prompt",
  "generating_tts",
  "fetching_video",
  "encoding",
  "done",
] as const;

const PROGRESS_PCT: Record<string, number> = {
  generating_prompt: 15,
  generating_tts: 40,
  fetching_video: 65,
  encoding: 85,
  done: 100,
};

interface RenderResult {
  ok: boolean;
  status: string;
  mediaUrl: string;
  catcastUrl: string | null;
  manifestoWords: number;
}

type VisualStyle = "space" | "cyberpunk" | "abstract" | "nature" | "minimal";

const VISUAL_STYLES: { value: VisualStyle; label: string; desc: string; preview: string }[] = [
  { value: "space",     label: "Космос",    desc: "Тёмно-синий, янтарь",    preview: "#0D1B2A" },
  { value: "cyberpunk", label: "Киберпанк", desc: "Чёрный, неон",           preview: "#0A0014" },
  { value: "abstract",  label: "Абстракт",  desc: "Фиолетовый, золото",     preview: "#1A0A2E" },
  { value: "nature",    label: "Природа",   desc: "Тёмно-зелёный, мята",    preview: "#0F1B0F" },
  { value: "minimal",   label: "Минимал",   desc: "Чёрный, белый",          preview: "#111111" },
];

// ── StylePreviewImage ─────────────────────────────────────────────────────────
// Fetches an AI-generated thumbnail from GET /api/tv/styles/preview.
// Falls back to the solid fallback color while loading or on error.

interface StylePreviewImageProps {
  styleValue: VisualStyle;
  seed: string;
  fallbackColor: string;
  tileStyle: object;
}

function StylePreviewImage({ styleValue, seed, fallbackColor, tileStyle }: StylePreviewImageProps) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  const uri =
    `${BASE_URL}/api/tv/styles/preview` +
    `?style=${styleValue}&seed=${encodeURIComponent(seed.slice(0, 100))}`;

  // Reset load state when the URI changes (seed or style changed)
  const prevUri = useRef(uri);
  if (prevUri.current !== uri) {
    prevUri.current = uri;
    // Synchronously reset so the new image starts fresh
  }

  return (
    <View style={[tileStyle, { overflow: "hidden", backgroundColor: fallbackColor }]}>
      {!errored && (
        <Image
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          onLoad={() => { setLoaded(true); setErrored(false); }}
          onError={() => setErrored(true)}
          key={uri}
        />
      )}
      {!loaded && !errored && (
        <View style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }]}>
          <ActivityIndicator size="small" color="rgba(255,255,255,0.4)" />
        </View>
      )}
    </View>
  );
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

function isoToYM(iso: string): { year: number; month: number } {
  const [y, m] = iso.split("-").map(Number);
  return { year: y, month: m };
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function firstDayOfMonth(year: number, month: number): number {
  const d = new Date(year, month - 1, 1).getDay();
  return d === 0 ? 6 : d - 1; // Monday-first (0=Mon … 6=Sun)
}

const RU_MONTHS = [
  "Январь","Февраль","Март","Апрель","Май","Июнь",
  "Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь",
];
const RU_DOW = ["Пн","Вт","Ср","Чт","Пт","Сб","Вс"];

// ── DatePickerModal ───────────────────────────────────────────────────────────

interface DatePickerModalProps {
  current: string;
  onSelect: (iso: string) => void;
  onClose: () => void;
  colors: ReturnType<typeof useColors>;
}

function DatePickerModal({ current, onSelect, onClose, colors }: DatePickerModalProps) {
  const init = isoToYM(current);
  const [viewYear, setViewYear] = useState(init.year);
  const [viewMonth, setViewMonth] = useState(init.month);

  const today = todayISO();
  const totalDays = daysInMonth(viewYear, viewMonth);
  const firstOffset = firstDayOfMonth(viewYear, viewMonth);

  const cells: (number | null)[] = [
    ...Array(firstOffset).fill(null),
    ...Array.from({ length: totalDays }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const prevMonth = () => {
    if (viewMonth === 1) { setViewYear(y => y - 1); setViewMonth(12); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 12) { setViewYear(y => y + 1); setViewMonth(1); }
    else setViewMonth(m => m + 1);
  };

  const pick = (day: number) => {
    const iso = `${viewYear}-${String(viewMonth).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
    onSelect(iso);
    onClose();
  };

  const todayBtn = () => { onSelect(today); onClose(); };

  return (
    <Modal visible animationType="fade" transparent onRequestClose={onClose}>
      <TouchableOpacity
        style={dpStyles.overlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity activeOpacity={1} onPress={() => {}}>
          <View style={[dpStyles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {/* Month nav */}
            <View style={dpStyles.header}>
              <TouchableOpacity onPress={prevMonth} style={dpStyles.arrow}>
                <Feather name="chevron-left" size={20} color={colors.foreground} />
              </TouchableOpacity>
              <Text style={[dpStyles.monthLabel, { color: colors.foreground }]}>
                {RU_MONTHS[viewMonth - 1]} {viewYear}
              </Text>
              <TouchableOpacity onPress={nextMonth} style={dpStyles.arrow}>
                <Feather name="chevron-right" size={20} color={colors.foreground} />
              </TouchableOpacity>
            </View>

            {/* Day-of-week row */}
            <View style={dpStyles.dowRow}>
              {RU_DOW.map(d => (
                <Text key={d} style={[dpStyles.dowCell, { color: colors.mutedForeground }]}>{d}</Text>
              ))}
            </View>

            {/* Days grid */}
            <View style={dpStyles.grid}>
              {cells.map((day, idx) => {
                if (day === null) return <View key={`e-${idx}`} style={dpStyles.cell} />;
                const iso = `${viewYear}-${String(viewMonth).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
                const isSelected = iso === current;
                const isToday = iso === today;
                return (
                  <TouchableOpacity
                    key={iso}
                    style={[
                      dpStyles.cell,
                      isSelected && { backgroundColor: colors.primary, borderRadius: 8 },
                      !isSelected && isToday && { borderWidth: 1, borderRadius: 8, borderColor: colors.primary },
                    ]}
                    onPress={() => pick(day)}
                    activeOpacity={0.7}
                  >
                    <Text style={[
                      dpStyles.dayText,
                      { color: isSelected ? "#fff" : isToday ? colors.primary : colors.foreground },
                    ]}>
                      {day}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Footer */}
            <View style={dpStyles.footer}>
              <TouchableOpacity onPress={todayBtn} style={[dpStyles.todayBtn, { borderColor: colors.border }]}>
                <Text style={[dpStyles.todayText, { color: colors.primary }]}>Сегодня</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={onClose} style={[dpStyles.cancelBtn, { borderColor: colors.border }]}>
                <Text style={[dpStyles.cancelText, { color: colors.mutedForeground }]}>Закрыть</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const dpStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", alignItems: "center", padding: 24 },
  card: { width: 300, borderRadius: 14, borderWidth: 1, padding: 16 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  arrow: { padding: 6 },
  monthLabel: { fontSize: 16, fontWeight: "700" },
  dowRow: { flexDirection: "row", marginBottom: 4 },
  dowCell: { width: 38, textAlign: "center", fontSize: 11, fontWeight: "600" },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: { width: 38, height: 36, alignItems: "center", justifyContent: "center" },
  dayText: { fontSize: 14 },
  footer: { flexDirection: "row", gap: 8, marginTop: 12 },
  todayBtn: { flex: 1, height: 36, borderRadius: 8, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  todayText: { fontSize: 14, fontWeight: "600" },
  cancelBtn: { flex: 1, height: 36, borderRadius: 8, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  cancelText: { fontSize: 14 },
});

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

// ── AgeGateModal ─────────────────────────────────────────────────────────────

interface AgeGateModalProps {
  citizenId: number;
  onVerified: () => void;
  onCancel: () => void;
  colors: ReturnType<typeof useColors>;
}

function AgeGateModal({ citizenId, onVerified, onCancel, colors }: AgeGateModalProps) {
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    if (!confirmed) return;
    setLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/api/citizens/${citizenId}/age-verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        onVerified();
      } else {
        Alert.alert("Ошибка", "Не удалось подтвердить возраст");
      }
    } catch {
      Alert.alert("Ошибка", "Нет соединения с сервером");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible animationType="fade" transparent onRequestClose={onCancel}>
      <View style={[ageGateStyles.overlay]}>
        <View style={[ageGateStyles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[ageGateStyles.icon]}>🔞</Text>
          <Text style={[ageGateStyles.title, { color: colors.foreground }]}>
            Подтверждение возраста
          </Text>
          <Text style={[ageGateStyles.body, { color: colors.mutedForeground }]}>
            Функция AI-генерации видео доступна только для пользователей 18 лет и старше (COPPA / EU DSA).
          </Text>
          <TouchableOpacity
            style={ageGateStyles.checkRow}
            onPress={() => setConfirmed(v => !v)}
          >
            <View style={[ageGateStyles.checkbox, {
              borderColor: colors.border,
              backgroundColor: confirmed ? colors.primary : "transparent",
            }]}>
              {confirmed && <Feather name="check" size={11} color="#fff" />}
            </View>
            <Text style={[ageGateStyles.checkLabel, { color: colors.foreground }]}>
              Мне исполнилось 18 лет
            </Text>
          </TouchableOpacity>
          <View style={ageGateStyles.btnRow}>
            <TouchableOpacity
              style={[ageGateStyles.cancelBtn, { borderColor: colors.border }]}
              onPress={onCancel}
            >
              <Text style={{ color: colors.mutedForeground, fontSize: 14 }}>Отмена</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[ageGateStyles.confirmBtn, {
                backgroundColor: confirmed ? colors.primary : colors.muted,
                opacity: !confirmed || loading ? 0.6 : 1,
              }]}
              onPress={handleConfirm}
              disabled={!confirmed || loading}
            >
              {loading
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={{ color: "#fff", fontWeight: "600", fontSize: 14 }}>Подтвердить</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const ageGateStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.75)", justifyContent: "center", alignItems: "center", padding: 24 },
  card: { width: "100%", maxWidth: 360, borderRadius: 12, borderWidth: 1, padding: 24 },
  icon: { fontSize: 36, textAlign: "center", marginBottom: 8 },
  title: { fontSize: 18, fontWeight: "700", textAlign: "center", marginBottom: 10 },
  body: { fontSize: 13, textAlign: "center", lineHeight: 20, marginBottom: 20 },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 24 },
  checkbox: { width: 18, height: 18, borderWidth: 1.5, borderRadius: 3, alignItems: "center", justifyContent: "center" },
  checkLabel: { fontSize: 14, flex: 1 },
  btnRow: { flexDirection: "row", gap: 10 },
  cancelBtn: { flex: 1, height: 42, borderWidth: 1, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  confirmBtn: { flex: 1, height: 42, borderRadius: 8, alignItems: "center", justifyContent: "center" },
});

// ── CapsuleModal ─────────────────────────────────────────────────────────────

interface CapsuleModalProps {
  slot: TvSlot;
  onClose: () => void;
  colors: ReturnType<typeof useColors>;
  citizenAgeVerified: boolean;
  onNeedAgeVerify: () => void;
}

function CapsuleModal({ slot, onClose, colors, citizenAgeVerified, onNeedAgeVerify }: CapsuleModalProps) {
  const qc = useQueryClient();
  const { citizen } = useCitizen();
  const styles = getStyles(colors);

  const [seedText, setSeedText] = useState("");
  const [debouncedSeed, setDebouncedSeed] = useState("");
  const [broadcastPolicy, setBroadcastPolicy] = useState<"echo" | "noise" | "private">("noise");
  const [hasSovereignLink, setHasSovereignLink] = useState(false);
  const [visualStyle, setVisualStyle] = useState<VisualStyle>("space");
  const [renderResult, setRenderResult] = useState<RenderResult | null>(null);
  const [legalConsent, setLegalConsent] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [renderTimeoutMs, setRenderTimeoutMs] = useState<number | null>(null);
  const prevStatusRef = useRef<string | null>(null);
  const progressAnim = useRef(new Animated.Value(0)).current;

  // Debounce seedText so preview images only refresh 600ms after the user stops typing
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSeed(seedText), 600);
    return () => clearTimeout(t);
  }, [seedText]);

  // Load existing capsule — auto-polls every 3s while render is in progress
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
      if (data.visualStyle) setVisualStyle(data.visualStyle as VisualStyle);
      return data;
    },
    retry: false,
    refetchInterval: (query) => {
      const data = query.state.data as TvCapsule | null | undefined;
      return (isPolling || data?.status === "pending_render") ? 3000 : false;
    },
  });

  // Poll queue stats while rendering
  const { data: queueStats } = useQuery<{ active: number; queued: number; maxConcurrent: number }>({
    queryKey: ["tvRenderQueue"],
    queryFn: async () => {
      const res = await fetch(`${BASE_URL}/api/tv/render/queue`);
      if (!res.ok) throw new Error("queue error");
      return res.json() as Promise<{ active: number; queued: number; maxConcurrent: number }>;
    },
    enabled: isPolling,
    refetchInterval: isPolling ? 5000 : false,
  });

  // Poll job status by jobId (queued vs running)
  const { data: jobStatusData } = useQuery<{ jobId: string; slotId: number; status: "queued" | "running" | "done" | "failed" } | null>({
    queryKey: ["tvRenderJob", jobId],
    queryFn: async () => {
      if (!jobId) return null;
      const res = await fetch(`${BASE_URL}/api/tv/render/jobs/${jobId}`);
      if (res.status === 404) return null;
      if (!res.ok) return null;
      return res.json() as Promise<{ jobId: string; slotId: number; status: "queued" | "running" | "done" | "failed" }>;
    },
    enabled: !!jobId && isPolling,
    refetchInterval: !!jobId && isPolling ? 3000 : false,
  });

  // Animate progress bar
  useEffect(() => {
    const isQueued = jobStatusData?.status === "queued";
    const stage = capsule?.renderProgress;
    const target = isQueued ? 0 : (stage ? (PROGRESS_PCT[stage] ?? 5) : 5);
    Animated.timing(progressAnim, {
      toValue: target,
      duration: 700,
      useNativeDriver: false,
    }).start();
  }, [capsule?.renderProgress, jobStatusData?.status, progressAnim]);

  // When capsule transitions out of pending_render → stop polling, show result
  useEffect(() => {
    const prev = prevStatusRef.current;
    const current = capsule?.status ?? null;
    prevStatusRef.current = current;

    if (isPolling && current && current !== "pending_render" && prev === "pending_render") {
      setIsPolling(false);
      if (capsule?.mediaUrl) {
        setRenderResult({
          ok: true,
          status: current,
          mediaUrl: capsule.mediaUrl,
          catcastUrl: capsule.catcastUrl ?? null,
          manifestoWords: 0,
        });
      }
    }
  }, [capsule?.status, isPolling, capsule?.mediaUrl, capsule?.catcastUrl]);

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
          visualStyle,
          mode: "a",
          renderPath: slot.slotType === "citizen" ? "light" : "heavy",
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
          visualStyle,
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

  // Air capsule manually (for retro slots)
  const airMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE_URL}/api/tv/slots/${slot.id}/air`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ citizenId: citizen!.id }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? "Ошибка выхода в эфир");
      }
      return res.json() as Promise<{ ok: boolean; mediaUrl: string }>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tvSlots"] });
      qc.invalidateQueries({ queryKey: ["tvCapsule", slot.id] });
    },
    onError: (e: Error) => Alert.alert("Ошибка", e.message),
  });

  // Render capsule — returns 202 immediately; poll capsule status for progress
  const renderMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE_URL}/api/tv/capsule/${slot.id}/render`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ citizenId: citizen!.id }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string; code?: string };
        if (err.code === "AGE_VERIFICATION_REQUIRED") {
          onNeedAgeVerify();
          throw new Error("age_gate");
        }
        throw new Error(err.error ?? "Ошибка рендера");
      }
      return res.json() as Promise<{ ok: boolean; status: string; slotId: number; jobId?: string; timeoutMs?: number }>;
    },
    onSuccess: (data) => {
      // Store jobId for queue position polling
      if (data.jobId) setJobId(data.jobId);
      // Store the timeout budget so the progress hint is accurate
      if (data.timeoutMs) setRenderTimeoutMs(data.timeoutMs);
      // Reset progress bar to 0 for fresh start
      progressAnim.setValue(0);
      // Render is running in background — start polling capsule for progress
      setIsPolling(true);
      prevStatusRef.current = "pending_render";
      qc.invalidateQueries({ queryKey: ["tvCapsule", slot.id] });
    },
    onError: (e: Error) => {
      if (e.message !== "age_gate") Alert.alert("Ошибка рендера", e.message);
    },
  });

  const hasCapsule = !!capsule;
  const isSaving = createMutation.isPending || updateMutation.isPending;
  const isPendingRender = isPolling || capsule?.status === "pending_render";
  const isRendering = renderMutation.isPending || isPendingRender;

  const handleSave = () => {
    if (hasCapsule) {
      updateMutation.mutate();
    } else {
      createMutation.mutate();
    }
  };

  const handleRender = () => {
    if (!citizenAgeVerified) {
      onNeedAgeVerify();
      return;
    }
    const isHeavySlot = slot.slotType !== "citizen";
    const estimatedTime = isHeavySlot ? "до 5 минут" : "до 2 минут";
    Alert.alert(
      "Рендер капсулы",
      `Тема: ${VISUAL_STYLES.find(s => s.value === visualStyle)?.label ?? visualStyle}\n\nЗапустить AI-рендер? Прогресс будет показан прямо здесь (${estimatedTime}). Вы получите уведомление в Telegram когда видео будет готово.`,
      [
        { text: "Отмена", style: "cancel" },
        { text: "Рендерить", onPress: () => renderMutation.mutate() },
      ]
    );
  };

  const openVideo = () => {
    const url = renderResult?.mediaUrl
      ? `${BASE_URL}${renderResult.mediaUrl}`
      : capsule?.mediaUrl
        ? `${BASE_URL}${capsule.mediaUrl}`
        : null;
    if (url) Linking.openURL(url);
  };

  const openCatcast = async (url: string) => {
    await WebBrowser.openBrowserAsync(url, {
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
      toolbarColor: "#0D1B2A",
    });
  };

  const activeRenderResult = renderResult ?? (
    capsule?.mediaUrl
      ? { ok: true, status: "rendered", mediaUrl: capsule.mediaUrl, catcastUrl: capsule.catcastUrl ?? null, manifestoWords: 0 }
      : null
  );

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
        {/* Header */}
        <View style={styles.modalHeader}>
          <View>
            <Text style={styles.modalTitle}>
              {slotLabel(slot)} — {SLOT_TYPE_LABELS[slot.slotType] ?? slot.slotType}
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
                <View style={[styles.statusBadge, { backgroundColor: capsule.mediaUrl ? colors.primary + "22" : colors.muted }]}>
                  <Feather
                    name={capsule.mediaUrl ? "film" : "edit-3"}
                    size={14}
                    color={capsule.mediaUrl ? colors.primary : colors.mutedForeground}
                  />
                  <Text style={[styles.statusBadgeText, { color: capsule.mediaUrl ? colors.primary : colors.mutedForeground }]}>
                    {capsule.mediaUrl ? "Отрендерено" : "Капсула создана"}
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

              {/* ── Visual style (Shariah/anti-Gharar: choose BEFORE paying/rendering) ── */}
              <Text style={styles.sectionLabel}>Визуальный стиль</Text>
              <Text style={[styles.hintText, { marginBottom: 8 }]}>
                Выберите тему до рендера — итоговый результат будет именно таким
              </Text>
              <View style={styles.styleGrid}>
                {VISUAL_STYLES.map((s) => (
                  <TouchableOpacity
                    key={s.value}
                    style={[
                      styles.styleCard,
                      {
                        borderColor: visualStyle === s.value ? colors.primary : colors.border,
                        backgroundColor: colors.card,
                      },
                    ]}
                    onPress={() => setVisualStyle(s.value)}
                    activeOpacity={0.75}
                  >
                    <StylePreviewImage
                      styleValue={s.value}
                      seed={debouncedSeed}
                      fallbackColor={s.preview}
                      tileStyle={styles.stylePreview}
                    />
                    <Text style={[styles.styleLabel, { color: visualStyle === s.value ? colors.primary : colors.foreground }]}>
                      {s.label}
                    </Text>
                    <Text style={[styles.styleDesc, { color: colors.mutedForeground }]}>
                      {s.desc}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

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

                  {!citizenAgeVerified && (
                    <TouchableOpacity
                      style={[styles.ageGateWarning, { backgroundColor: colors.card, borderColor: colors.primary + "44" }]}
                      onPress={onNeedAgeVerify}
                    >
                      <Feather name="alert-circle" size={15} color={colors.primary} />
                      <Text style={[styles.ageGateText, { color: colors.primary }]}>
                        Требуется подтверждение возраста 18+
                      </Text>
                    </TouchableOpacity>
                  )}

                  <Text style={[styles.hintText, { marginBottom: 12 }]}>
                    LLM генерирует манифест → ElevenLabs озвучивает → FFmpeg собирает MP4 с водяным знаком TimeNation AI
                  </Text>

                  {/* ── Global User Contract Gate ── */}
                  <TouchableOpacity
                    style={[styles.legalRow, { backgroundColor: colors.card, borderColor: legalConsent ? colors.primary + "55" : colors.border }]}
                    onPress={() => setLegalConsent(v => !v)}
                    activeOpacity={0.8}
                  >
                    <View style={[styles.legalCheckbox, {
                      borderColor: legalConsent ? colors.primary : colors.border,
                      backgroundColor: legalConsent ? colors.primary : "transparent",
                    }]}>
                      {legalConsent && <Feather name="check" size={10} color="#fff" />}
                    </View>
                    <Text style={[styles.legalText, { color: colors.mutedForeground }]}>
                      Я соглашаюсь с{" "}
                      <Text style={{ color: colors.primary, textDecorationLine: "underline" }}>Условиями использования</Text>
                      {". "}
                      Подтверждаю, что мне исполнилось 18 лет; данная транзакция является покупкой технической вычислительной услуги; я несу единоличную правовую ответственность за текст и результирующее AI-видео согласно US Section 230, законодательству ЕС, ФЗ-152 РФ и местным законам. TimeNation действует исключительно как поставщик вычислительной инфраструктуры. Коммерческая реклама, нацеленная на конкретные юрисдикции без соответствующей регистрации, запрещена. Трансграничная передача данных инициируется пользователем самостоятельно.
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.renderBtn, { borderColor: colors.primary, opacity: (isRendering || !legalConsent) ? 0.4 : 1 }]}
                    onPress={handleRender}
                    disabled={isRendering || !legalConsent}
                  >
                    {renderMutation.isPending ? (
                      <View style={styles.renderBtnInner}>
                        <ActivityIndicator color={colors.primary} size="small" />
                        <Text style={[styles.renderBtnText, { color: colors.primary }]}>Запуск…</Text>
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

                  {/* ── Render progress indicator ── */}
                  {isPendingRender && (
                    <View style={[styles.renderProgressCard, { backgroundColor: colors.card, borderColor: colors.primary + "44" }]}>
                      {/* Header row: spinner + label */}
                      <View style={styles.renderProgressRow}>
                        <ActivityIndicator color={colors.primary} size="small" />
                        <Text style={[styles.renderProgressText, { color: colors.primary }]}>
                          {jobStatusData?.status === "queued"
                            ? "Ожидание в очереди…"
                            : capsule?.renderProgress
                              ? (RENDER_PROGRESS_LABELS[capsule.renderProgress] ?? "Рендер…")
                              : "Инициализация рендера…"}
                        </Text>
                      </View>

                      {/* Queue position badge */}
                      {jobStatusData?.status === "queued" && queueStats && (
                        <View style={[styles.queueBadge, { backgroundColor: colors.muted }]}>
                          <Feather name="clock" size={12} color={colors.mutedForeground} />
                          <Text style={[styles.queueBadgeText, { color: colors.mutedForeground }]}>
                            {`Ваш рендер в очереди · ожидает ${queueStats.queued} ${queueStats.queued === 1 ? "задание" : "заданий"} перед ним`}
                          </Text>
                        </View>
                      )}

                      {/* Animated progress bar */}
                      <View style={[styles.progressTrack, { backgroundColor: colors.muted }]}>
                        <Animated.View
                          style={[
                            styles.progressFill,
                            {
                              backgroundColor: colors.primary,
                              width: progressAnim.interpolate({
                                inputRange: [0, 100],
                                outputRange: ["0%", "100%"],
                                extrapolate: "clamp",
                              }),
                            },
                          ]}
                        />
                      </View>

                      {/* Stage steps */}
                      <View style={styles.renderProgressSteps}>
                        {RENDER_PROGRESS_STAGES.slice(0, -1).map((step) => {
                          const currentIdx = RENDER_PROGRESS_STAGES.indexOf(
                            (capsule?.renderProgress ?? "") as typeof RENDER_PROGRESS_STAGES[number]
                          );
                          const stepIdx = RENDER_PROGRESS_STAGES.indexOf(step);
                          const isDone = jobStatusData?.status !== "queued" && currentIdx > stepIdx;
                          const isCurrent = jobStatusData?.status !== "queued" && currentIdx === stepIdx;
                          return (
                            <View key={step} style={styles.renderProgressStep}>
                              <View style={[
                                styles.renderProgressDot,
                                {
                                  backgroundColor: isDone
                                    ? colors.primary
                                    : isCurrent
                                      ? colors.primary + "88"
                                      : colors.muted,
                                },
                              ]} />
                              <Text style={[
                                styles.renderProgressStepLabel,
                                { color: isDone || isCurrent ? colors.foreground : colors.mutedForeground },
                              ]}>
                                {RENDER_PROGRESS_LABELS[step]?.replace("…", "") ?? step}
                              </Text>
                            </View>
                          );
                        })}
                      </View>

                      <Text style={[styles.renderProgressHint, { color: colors.mutedForeground }]}>
                        {renderTimeoutMs && renderTimeoutMs >= 300_000
                          ? `До ${Math.round(renderTimeoutMs / 60_000)} минут для вашего премиум-слота. Не закрывайте экран.`
                          : `AI-рендер занимает до ${renderTimeoutMs ? Math.round(renderTimeoutMs / 60_000) : 2} мин. Не закрывайте экран.`}
                      </Text>
                    </View>
                  )}

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

                      {/* Manual air button — for retro slots or missed cron */}
                      {slot.status === "booked" && (
                        <TouchableOpacity
                          style={[styles.airBtn, {
                            borderColor: "#F59E0B",
                            opacity: airMutation.isPending ? 0.5 : 1,
                          }]}
                          onPress={() => airMutation.mutate()}
                          disabled={airMutation.isPending}
                        >
                          {airMutation.isPending ? (
                            <ActivityIndicator size="small" color="#F59E0B" />
                          ) : (
                            <Feather name="radio" size={14} color="#F59E0B" />
                          )}
                          <Text style={[styles.catcastBtnText, { color: "#F59E0B" }]}>
                            {slot.isRetro ? "Выйти в эфир (ретро)" : "Выйти в эфир сейчас"}
                          </Text>
                        </TouchableOpacity>
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
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<TvSlot | null>(null);
  const [showAgeGate, setShowAgeGate] = useState(false);
  const [citizenAgeVerified, setCitizenAgeVerified] = useState(
    () => !!(citizen?.ageVerified ?? 0)
  );
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const styles = getStyles(colors);
  const tvGuide = useContextualGuide("tv");

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

  // ── Dual clock (Local + UTC) ─────────────────────────────────────────────
  const [localTime, setLocalTime] = useState("--:--:--");
  const [utcTime, setUtcTime] = useState("--:--:--");
  const [clockSynced, setClockSynced] = useState(false);
  const clockOffset = useRef(0);

  useEffect(() => {
    const sync = async () => {
      try {
        const before = Date.now();
        const res = await fetch(`${BASE_URL}/api/system/time`);
        const after = Date.now();
        if (res.ok) {
          const d = (await res.json()) as { ts: number };
          clockOffset.current = d.ts - after + (after - before) / 2;
          setClockSynced(true);
        }
      } catch { setClockSynced(false); }
    };
    void sync();
    const syncTimer = setInterval(sync, 60_000);
    const tick = setInterval(() => {
      const nowLocal = new Date();
      const nowServer = new Date(Date.now() + clockOffset.current);
      const p = (n: number) => String(n).padStart(2, "0");
      setLocalTime(`${p(nowLocal.getHours())}:${p(nowLocal.getMinutes())}:${p(nowLocal.getSeconds())}`);
      setUtcTime(nowServer.toISOString().slice(11, 19));
    }, 1000);
    return () => { clearInterval(tick); clearInterval(syncTimer); };
  }, []);

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
          backgroundColor: item.status === "broadcast"
            ? colors.primary + "33"
            : colors.primary + "22",
        }]}>
          <Feather
            name={item.status === "broadcast" ? "film" : "clock"}
            size={12}
            color={colors.primary}
          />
          <Text style={[styles.slotBadgeText, { color: colors.primary }]}>
            {item.status === "broadcast" ? "Вышел в эфир" : "Мой слот"}
          </Text>
        </View>
        <Feather name="chevron-right" size={16} color={colors.mutedForeground} style={{ marginLeft: 8 }} />
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { paddingTop: topPad, backgroundColor: colors.background }]}>
      <LogoBrand />

      {/* ── Dual clock ─────────────────────────────────────────────────────── */}
      <View style={[styles.clockBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {/* Local time — primary */}
        <View style={styles.clockBlock}>
          <Text style={[styles.clockLabel, { color: colors.mutedForeground }]}>LOCAL</Text>
          <Text style={[styles.clockValueLarge, { color: colors.foreground }]}>{localTime}</Text>
        </View>

        {/* Sync dot */}
        <View style={styles.clockSyncDot}>
          <View style={[styles.syncDot, { backgroundColor: clockSynced ? "#22c55e" : "#f59e0b" }]} />
          <Text style={[styles.syncLabel, { color: colors.mutedForeground }]}>{clockSynced ? "SYNC" : "..."}</Text>
        </View>

        {/* UTC time — secondary */}
        <View style={[styles.clockBlock, { alignItems: "flex-end" }]}>
          <Text style={[styles.clockLabel, { color: colors.mutedForeground }]}>UTC</Text>
          <Text style={[styles.clockValueSmall, { color: colors.mutedForeground }]}>{utcTime}</Text>
        </View>
      </View>

      {/* Date nav */}
      <View style={[styles.dateNav, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={handlePrevDay} style={styles.dateArrow}>
          <Feather name="chevron-left" size={20} color={colors.foreground} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setShowDatePicker(true)}
          style={styles.dateLabelBtn}
          activeOpacity={0.7}
        >
          <Feather name="calendar" size={14} color={colors.primary} style={{ marginRight: 6 }} />
          <Text style={[styles.dateLabel, { color: colors.foreground }]}>{date}</Text>
        </TouchableOpacity>
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
          <View style={styles.summaryActions}>
            <TouchableOpacity
              style={[styles.bookSlotBtn, { backgroundColor: colors.primary + "22", borderColor: colors.primary + "55" }]}
              onPress={() => tvGuide.trigger(() => {
                Linking.openURL(`${BASE_URL}/tv`).catch(() => {});
              })}
              activeOpacity={0.75}
            >
              <Feather name="tv" size={12} color={colors.primary} />
              <Text style={[styles.bookSlotBtnText, { color: colors.primary }]}>Забронировать</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => refetch()} disabled={isRefetching}>
              <Feather
                name="refresh-cw"
                size={15}
                color={isRefetching ? colors.mutedForeground : colors.primary}
              />
            </TouchableOpacity>
          </View>
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
          citizenAgeVerified={citizenAgeVerified}
          onNeedAgeVerify={() => setShowAgeGate(true)}
        />
      )}

      {/* Age gate modal */}
      {showAgeGate && citizen && (
        <AgeGateModal
          citizenId={citizen.id}
          onVerified={() => {
            setCitizenAgeVerified(true);
            setShowAgeGate(false);
          }}
          onCancel={() => setShowAgeGate(false)}
          colors={colors}
        />
      )}

      {/* Date picker */}
      {showDatePicker && (
        <DatePickerModal
          current={date}
          onSelect={setDate}
          onClose={() => setShowDatePicker(false)}
          colors={colors}
        />
      )}

      <ContextualGuideModal
        visible={tvGuide.visible}
        onClose={tvGuide.close}
        onConfirm={tvGuide.confirm}
        icon="📺"
        title="Забронировать TV-слот"
        explanation={"Ты покупаешь эфирное время TimeNation TV. Система возьмёт твой текст, Gemini превратит его в кино-промт, а бесплатный ИИ-генератор создаст полноценное видео под выбранный стиль.\n\nДоступны слоты :00, :15, :30, :45 каждого часа."}
        ctaLabel="Написать смысл и запустить трансляцию"
      />
    </View>
  );
}

function getStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    container: { flex: 1 },
    dateNav: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    dateArrow: { padding: 6 },
    dateLabelBtn: { flexDirection: "row", alignItems: "center", paddingVertical: 4, paddingHorizontal: 8, borderRadius: 8 },
    dateLabel: { fontSize: 15, fontWeight: "600", fontVariant: ["tabular-nums"] },
    summaryRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    summaryText: { fontSize: 13, flex: 1 },
    summaryActions: { flexDirection: "row", alignItems: "center", gap: 10 },
    bookSlotBtn: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 5 },
    bookSlotBtnText: { fontSize: 12, fontWeight: "600" },
    listContent: { paddingHorizontal: 16, paddingTop: 12 },
    listHeader: { fontSize: 12, marginBottom: 10 },
    slotCard: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      padding: 14,
      borderRadius: 10,
      borderWidth: StyleSheet.hairlineWidth,
    },
    slotCardLeft: { flex: 1 },
    slotCardRight: { flexDirection: "row", alignItems: "center" },
    slotTime: { fontSize: 16, fontWeight: "700", fontVariant: ["tabular-nums"] },
    slotType: { fontSize: 12, marginTop: 2 },
    slotBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
    },
    slotBadgeText: { fontSize: 11, fontWeight: "500" },
    emptyState: { flex: 1, justifyContent: "center", alignItems: "center", padding: 40, gap: 12 },
    emptyTitle: { fontSize: 16, fontWeight: "600", textAlign: "center" },
    emptyText: { fontSize: 13, textAlign: "center", lineHeight: 20 },

    // Modal styles
    modalContainer: { flex: 1 },
    modalHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      padding: 20,
      paddingBottom: 12,
    },
    modalTitle: { fontSize: 16, fontWeight: "700", color: colors.foreground },
    modalSubtitle: { fontSize: 12, color: colors.mutedForeground, marginTop: 2 },
    closeBtn: { padding: 4 },
    modalScroll: { flex: 1, paddingHorizontal: 20 },
    statusBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 6,
      marginBottom: 16,
      alignSelf: "flex-start",
    },
    statusBadgeText: { fontSize: 12, fontWeight: "500" },
    sectionLabel: {
      fontSize: 12,
      fontWeight: "600",
      textTransform: "uppercase",
      letterSpacing: 0.5,
      color: colors.mutedForeground,
      marginBottom: 8,
      marginTop: 16,
    },
    textInput: {
      borderWidth: 1,
      borderRadius: 8,
      padding: 12,
      fontSize: 14,
      minHeight: 88,
    },
    charCount: { fontSize: 11, color: colors.mutedForeground, textAlign: "right", marginTop: 4 },
    segmentRow: { flexDirection: "row", gap: 8 },
    segmentBtn: {
      flex: 1,
      paddingVertical: 8,
      borderWidth: 1,
      borderRadius: 6,
      alignItems: "center",
    },
    segmentText: { fontSize: 13, fontWeight: "500" },
    hintText: { fontSize: 12, color: colors.mutedForeground, marginTop: 4 },
    styleGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
    styleCard: {
      width: "30%",
      flexGrow: 1,
      borderWidth: 1.5,
      borderRadius: 8,
      padding: 8,
      alignItems: "center",
    },
    stylePreview: {
      width: "100%",
      height: 32,
      borderRadius: 4,
      marginBottom: 6,
    },
    styleLabel: { fontSize: 12, fontWeight: "600", textAlign: "center" },
    styleDesc: { fontSize: 10, textAlign: "center", marginTop: 2, lineHeight: 13 },
    toggleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginTop: 16,
      marginBottom: 4,
    },
    checkbox: {
      width: 20,
      height: 20,
      borderWidth: 1.5,
      borderRadius: 4,
      alignItems: "center",
      justifyContent: "center",
    },
    toggleLabel: { fontSize: 14, fontWeight: "500" },
    toggleHint: { fontSize: 12 },
    primaryBtn: {
      paddingVertical: 14,
      borderRadius: 10,
      alignItems: "center",
      marginTop: 20,
    },
    primaryBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
    divider: { height: StyleSheet.hairlineWidth, marginVertical: 20 },
    ageGateWarning: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      padding: 10,
      borderRadius: 8,
      borderWidth: 1,
      marginBottom: 10,
    },
    ageGateText: { fontSize: 13, fontWeight: "500", flex: 1 },
    renderBtn: {
      borderWidth: 1.5,
      borderRadius: 10,
      paddingVertical: 14,
      alignItems: "center",
    },
    renderBtnInner: { flexDirection: "row", alignItems: "center", gap: 8 },
    renderBtnText: { fontWeight: "600", fontSize: 15 },
    resultCard: {
      borderWidth: 1,
      borderRadius: 10,
      padding: 14,
      marginTop: 16,
      gap: 10,
    },
    resultHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
    resultTitle: { fontWeight: "600", fontSize: 14, flex: 1 },
    resultMeta: { fontSize: 12 },
    mediaBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 8,
      justifyContent: "center",
    },
    mediaBtnText: { color: "#fff", fontWeight: "600", fontSize: 14 },
    catcastBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 8,
      borderWidth: 1.5,
      justifyContent: "center",
    },
    catcastBtnDisabled: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 8,
      borderWidth: 1,
      justifyContent: "center",
    },
    catcastBtnText: { fontWeight: "500", fontSize: 13 },
    airBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1, marginTop: 8 },
    renderProgressCard: {
      borderWidth: 1,
      borderRadius: 10,
      padding: 14,
      marginTop: 12,
      gap: 10,
    },
    renderProgressRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    renderProgressText: {
      fontSize: 14,
      fontWeight: "600",
      flex: 1,
    },
    progressTrack: {
      height: 6,
      borderRadius: 3,
      overflow: "hidden",
    },
    progressFill: {
      height: "100%",
      borderRadius: 3,
    },
    queueBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 6,
    },
    queueBadgeText: {
      fontSize: 12,
      flex: 1,
    },
    renderProgressSteps: {
      gap: 6,
    },
    renderProgressStep: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    renderProgressDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    renderProgressStepLabel: {
      fontSize: 12,
    },
    renderProgressHint: {
      fontSize: 11,
      lineHeight: 16,
    },
    legalRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
      padding: 12,
      borderWidth: 1,
      borderRadius: 8,
      marginBottom: 14,
    },
    legalCheckbox: {
      width: 18,
      height: 18,
      borderWidth: 1.5,
      borderRadius: 3,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 1,
      flexShrink: 0,
    },
    legalText: { fontSize: 11, lineHeight: 17, flex: 1 },
    // Dual clock bar
    clockBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
    clockBlock: { alignItems: "flex-start", minWidth: 80 },
    clockLabel: { fontSize: 9, fontWeight: "700", letterSpacing: 1.5, fontFamily: "Inter_700Bold" },
    clockValueLarge: { fontSize: 20, fontWeight: "700", fontFamily: "Inter_700Bold", fontVariant: ["tabular-nums"] },
    clockValueSmall: { fontSize: 14, fontFamily: "Inter_400Regular", fontVariant: ["tabular-nums"] },
    clockSyncDot: { alignItems: "center", gap: 4 },
    syncDot: { width: 8, height: 8, borderRadius: 4 },
    syncLabel: { fontSize: 8, fontWeight: "700", letterSpacing: 1 },
  });
}
