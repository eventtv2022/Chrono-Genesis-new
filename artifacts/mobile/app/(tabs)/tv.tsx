import { getBaseUrl } from "@/lib/api";
import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
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
  useWindowDimensions,
} from "react-native";
import * as WebBrowser from "expo-web-browser";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCitizen } from "@/context/CitizenContext";
import { useColors } from "@/hooks/useColors";
import { useLanguage } from "@/context/LanguageContext";
import type { UIStrings } from "@/lib/i18n";
import { LogoBrand } from "@/components/LogoBrand";
import { ContextualGuideModal } from "@/components/ContextualGuideModal";
import { useContextualGuide } from "@/hooks/useContextualGuide";

const BASE_URL = getBaseUrl();

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

function getRenderProgressLabels(t: UIStrings): Record<string, string> {
  return {
    generating_prompt: t.tv_render_prompt,
    generating_tts:    t.tv_render_tts,
    generating_scenes: t.tv_render_scenes,
    fetching_scenes:   t.tv_render_fetching_scenes,
    compositing:       t.tv_render_compositing,
    fetching_video:    t.tv_render_fetching_video,
    encoding:          t.tv_render_encoding,
    done:              t.tv_render_done,
  };
}

const RENDER_PROGRESS_STAGES = [
  "generating_prompt",
  "generating_tts",
  "generating_scenes",
  "fetching_scenes",
  "compositing",
  "fetching_video",
  "encoding",
  "done",
] as const;

const PROGRESS_PCT: Record<string, number> = {
  generating_prompt: 10,
  generating_tts: 30,
  generating_scenes: 45,
  fetching_scenes: 60,
  compositing: 75,
  fetching_video: 68,
  encoding: 88,
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

function getVisualStyles(t: UIStrings): { value: VisualStyle; label: string; desc: string; preview: string }[] {
  return [
    { value: "space",     label: t.tv_style_space,     desc: t.tv_style_space_desc,     preview: "#0D1B2A" },
    { value: "cyberpunk", label: t.tv_style_cyberpunk,  desc: t.tv_style_cyberpunk_desc,  preview: "#0A0014" },
    { value: "abstract",  label: t.tv_style_abstract,   desc: t.tv_style_abstract_desc,   preview: "#1A0A2E" },
    { value: "nature",    label: t.tv_style_nature,     desc: t.tv_style_nature_desc,     preview: "#0F1B0F" },
    { value: "minimal",   label: t.tv_style_minimal,    desc: t.tv_style_minimal_desc,    preview: "#111111" },
  ];
}

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

function getMonthYearLabel(lang: string, year: number, month: number): string {
  return new Intl.DateTimeFormat(lang, { month: "long", year: "numeric" }).format(new Date(year, month - 1, 1));
}

function getDowLabels(lang: string): string[] {
  // Jan 6–12 2025 is Mon–Sun
  return Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(lang, { weekday: "short" }).format(new Date(2025, 0, 6 + i))
  );
}

// ── DatePickerModal ───────────────────────────────────────────────────────────

interface DatePickerModalProps {
  current: string;
  onSelect: (iso: string) => void;
  onClose: () => void;
  colors: ReturnType<typeof useColors>;
}

function DatePickerModal({ current, onSelect, onClose, colors }: DatePickerModalProps) {
  const { t, lang } = useLanguage();
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
                {getMonthYearLabel(lang, viewYear, viewMonth)}
              </Text>
              <TouchableOpacity onPress={nextMonth} style={dpStyles.arrow}>
                <Feather name="chevron-right" size={20} color={colors.foreground} />
              </TouchableOpacity>
            </View>

            {/* Day-of-week row */}
            <View style={dpStyles.dowRow}>
              {getDowLabels(lang).map(d => (
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
                <Text style={[dpStyles.todayText, { color: colors.primary }]}>{t.today}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={onClose} style={[dpStyles.cancelBtn, { borderColor: colors.border }]}>
                <Text style={[dpStyles.cancelText, { color: colors.mutedForeground }]}>{t.close}</Text>
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

function getSlotTypeLabels(t: UIStrings): Record<string, string> {
  return {
    citizen: t.tv_slot_citizen,
    quarter: t.tv_slot_quarter,
    half:    t.tv_slot_half,
    apex:    t.tv_slot_apex,
  };
}

function getBroadcastLabels(t: UIStrings): Record<string, string> {
  return {
    echo:    t.tv_broadcast_echo,
    noise:   t.tv_broadcast_noise,
    private: t.tv_broadcast_private,
  };
}

// ── AgeGateModal ─────────────────────────────────────────────────────────────

interface AgeGateModalProps {
  citizenId: number;
  onVerified: () => void;
  onCancel: () => void;
  colors: ReturnType<typeof useColors>;
}

function AgeGateModal({ citizenId, onVerified, onCancel, colors }: AgeGateModalProps) {
  const { t } = useLanguage();
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
        Alert.alert(t.error, t.tv_age_gate_body);
      }
    } catch {
      Alert.alert(t.error, t.no_internet);
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
            {t.tv_age_gate_title}
          </Text>
          <Text style={[ageGateStyles.body, { color: colors.mutedForeground }]}>
            {t.tv_age_gate_body}
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
              {t.tv_age_confirm}
            </Text>
          </TouchableOpacity>
          <View style={ageGateStyles.btnRow}>
            <TouchableOpacity
              style={[ageGateStyles.cancelBtn, { borderColor: colors.border }]}
              onPress={onCancel}
            >
              <Text style={{ color: colors.mutedForeground, fontSize: 14 }}>{t.cancel}</Text>
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
                : <Text style={{ color: "#fff", fontWeight: "600", fontSize: 14 }}>{t.confirm}</Text>
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
  const { t } = useLanguage();
  const renderProgressLabels = getRenderProgressLabels(t);
  const visualStyles = getVisualStyles(t);
  const slotTypeLabels = getSlotTypeLabels(t);
  const broadcastLabels = getBroadcastLabels(t);
  const qc = useQueryClient();
  const { citizen, authHeaders } = useCitizen();
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
  const [renderStartedAt, setRenderStartedAt] = useState<number | null>(null);
  const [countdownSec, setCountdownSec] = useState<number | null>(null);
  const [renderTimedOut, setRenderTimedOut] = useState(false);
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
      if (!res.ok) throw new Error("Capsule load error");
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

  // Live countdown: tick every second while render is pending
  useEffect(() => {
    if (!renderStartedAt || !renderTimeoutMs) return;
    const tick = () => {
      const elapsed = Date.now() - renderStartedAt;
      const remaining = Math.ceil((renderTimeoutMs - elapsed) / 1000);
      if (remaining <= 0) {
        setCountdownSec(0);
        setRenderTimedOut(true);
      } else {
        setCountdownSec(remaining);
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [renderStartedAt, renderTimeoutMs]);

  // When capsule transitions out of pending_render → stop polling, show result
  useEffect(() => {
    const prev = prevStatusRef.current;
    const current = capsule?.status ?? null;
    prevStatusRef.current = current;

    if (isPolling && current && current !== "pending_render" && prev === "pending_render") {
      setIsPolling(false);
      setRenderStartedAt(null);
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
        throw new Error(err.error ?? "Create error");
      }
      return res.json() as Promise<TvCapsule>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tvCapsule", slot.id] });
    },
    onError: (e: Error) => Alert.alert(t.error, e.message),
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
        throw new Error(err.error ?? "Update error");
      }
      return res.json() as Promise<TvCapsule>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tvCapsule", slot.id] });
    },
    onError: (e: Error) => Alert.alert(t.error, e.message),
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
        throw new Error(err.error ?? "Broadcast error");
      }
      return res.json() as Promise<{ ok: boolean; mediaUrl: string }>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tvSlots"] });
      qc.invalidateQueries({ queryKey: ["tvCapsule", slot.id] });
    },
    onError: (e: Error) => Alert.alert(t.error, e.message),
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
        throw new Error(err.error ?? "Render error");
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
      // Start countdown from this moment
      setRenderStartedAt(Date.now());
      setRenderTimedOut(false);
      setCountdownSec(data.timeoutMs ? Math.ceil(data.timeoutMs / 1000) : null);
      // Render is running in background — start polling capsule for progress
      setIsPolling(true);
      prevStatusRef.current = "pending_render";
      qc.invalidateQueries({ queryKey: ["tvCapsule", slot.id] });
    },
    onError: (e: Error) => {
      if (e.message !== "age_gate") Alert.alert(t.error, e.message);
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
    renderMutation.mutate();
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
              {slotLabel(slot)} — {slotTypeLabels[slot.slotType] ?? slot.slotType}
            </Text>
            <Text style={styles.modalSubtitle}>{slot.date}{slot.isRetro ? ` · ${t.tv_retro_slot}` : ""}</Text>
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
                    {capsule.mediaUrl ? t.tv_create_capsule : t.tv_ai_preview}
                  </Text>
                </View>
              )}

              {/* ── Seed text ── */}
              <Text style={styles.sectionLabel}>{t.tv_manifesto_label}</Text>
              <TextInput
                style={[styles.textInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
                value={seedText}
                onChangeText={setSeedText}
                placeholder={t.tv_vision_ph}
                placeholderTextColor={colors.mutedForeground}
                multiline
                numberOfLines={4}
                maxLength={500}
                textAlignVertical="top"
              />
              <Text style={styles.charCount}>{seedText.length}/500</Text>

              {/* ── Broadcast policy ── */}
              <Text style={styles.sectionLabel}>{t.tv_policy_label}</Text>
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
                      {p === "echo" ? t.tv_booked_slot : p === "noise" ? t.tv_free_slot : t.tv_retro_slot}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.hintText}>{broadcastLabels[broadcastPolicy]}</Text>

              {/* ── Visual style (Shariah/anti-Gharar: choose BEFORE paying/rendering) ── */}
              <Text style={styles.sectionLabel}>{t.tv_style_label}</Text>
              <Text style={[styles.hintText, { marginBottom: 8 }]}>
                {t.tv_ai_preview}
              </Text>
              <View style={styles.styleGrid}>
                {visualStyles.map((s) => (
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
                <Text style={[styles.toggleHint, { color: colors.mutedForeground }]}>{t.tl_open_timeline}</Text>
              </TouchableOpacity>

              {/* ── Save button ── */}
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: colors.primary, opacity: isSaving ? 0.6 : 1 }]}
                onPress={handleSave}
                disabled={isSaving}
              >
                {isSaving
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.primaryBtnText}>{hasCapsule ? t.save : t.tv_create_capsule}</Text>
                }
              </TouchableOpacity>

              {/* ── Render section ── */}
              {hasCapsule && (
                <>
                  <View style={[styles.divider, { backgroundColor: colors.border }]} />
                  <Text style={styles.sectionLabel}>{t.tv_ai_preview}</Text>

                  {!citizenAgeVerified && (
                    <TouchableOpacity
                      style={[styles.ageGateWarning, { backgroundColor: colors.card, borderColor: colors.primary + "44" }]}
                      onPress={onNeedAgeVerify}
                    >
                      <Feather name="alert-circle" size={15} color={colors.primary} />
                      <Text style={[styles.ageGateText, { color: colors.primary }]}>
                        {t.tv_age_gate_title}
                      </Text>
                    </TouchableOpacity>
                  )}

                  <Text style={[styles.hintText, { marginBottom: 12 }]}>
                    {t.tv_manifesto_label}
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
                      {t.tos_title}{" "}
                      <Text style={{ color: colors.primary, textDecorationLine: "underline" }}>{t.tos_short}</Text>
                      {". "}
                      {t.tv_age_confirm}
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
                        <Text style={[styles.renderBtnText, { color: colors.primary }]}>{t.loading}</Text>
                      </View>
                    ) : (
                      <View style={styles.renderBtnInner}>
                        <Feather name="film" size={16} color={colors.primary} />
                        <Text style={[styles.renderBtnText, { color: colors.primary }]}>
                          {activeRenderResult ? t.tv_ai_preview : t.tv_create_capsule}
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
                            ? t.loading
                            : capsule?.renderProgress
                              ? (renderProgressLabels[capsule.renderProgress] ?? t.loading)
                              : t.loading}
                        </Text>
                      </View>

                      {/* Queue position badge */}
                      {jobStatusData?.status === "queued" && queueStats && (
                        <View style={[styles.queueBadge, { backgroundColor: colors.muted }]}>
                          <Feather name="clock" size={12} color={colors.mutedForeground} />
                          <Text style={[styles.queueBadgeText, { color: colors.mutedForeground }]}>
                            {`${t.loading} · ${queueStats.queued}`}
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
                                {renderProgressLabels[step]?.replace("…", "") ?? step}
                              </Text>
                            </View>
                          );
                        })}
                      </View>

                      {renderTimedOut ? (
                        <View style={[styles.timedOutBadge, { backgroundColor: colors.muted }]}>
                          <Feather name="alert-circle" size={13} color={colors.mutedForeground} />
                          <Text style={[styles.timedOutText, { color: colors.mutedForeground }]}>
                            {t.loading}
                          </Text>
                        </View>
                      ) : countdownSec !== null ? (
                        <View style={styles.countdownRow}>
                          <Feather name="clock" size={13} color={colors.primary} />
                          <Text style={[styles.countdownText, { color: colors.primary }]}>
                            {`${Math.floor(countdownSec / 60)}:${String(countdownSec % 60).padStart(2, "0")}`}
                          </Text>
                        </View>
                      ) : (
                        <Text style={[styles.renderProgressHint, { color: colors.mutedForeground }]}>
                          {`${t.tv_ai_preview} · ${renderTimeoutMs ? Math.round(renderTimeoutMs / 60_000) : 2} min`}
                        </Text>
                      )}
                    </View>
                  )}

                  {/* ── Result ── */}
                  {activeRenderResult && (
                    <View style={[styles.resultCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                      <View style={styles.resultHeader}>
                        <Feather name="check-circle" size={16} color={colors.primary} />
                        <Text style={[styles.resultTitle, { color: colors.foreground }]}>{t.confirm}</Text>
                        {renderResult && renderResult.manifestoWords > 0 && (
                          <Text style={[styles.resultMeta, { color: colors.mutedForeground }]}>
                            {renderResult.manifestoWords}
                          </Text>
                        )}
                      </View>

                      <TouchableOpacity
                        style={[styles.mediaBtn, { backgroundColor: colors.primary }]}
                        onPress={openVideo}
                      >
                        <Feather name="play-circle" size={16} color="#fff" />
                        <Text style={styles.mediaBtnText}>{t.tv_ai_preview} MP4</Text>
                      </TouchableOpacity>

                      {activeRenderResult.catcastUrl ? (
                        <TouchableOpacity
                          style={[styles.catcastBtn, { borderColor: "#00AAFF" }]}
                          onPress={() => openCatcast(activeRenderResult.catcastUrl!)}
                        >
                          <Feather name="tv" size={14} color="#00AAFF" />
                          <Text style={[styles.catcastBtnText, { color: "#00AAFF" }]}>Catcast.tv</Text>
                        </TouchableOpacity>
                      ) : (
                        <View style={[styles.catcastBtnDisabled, { borderColor: colors.border }]}>
                          <Feather name="tv" size={14} color={colors.mutedForeground} />
                          <Text style={[styles.catcastBtnText, { color: colors.mutedForeground }]}>
                            Catcast.tv
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
                            {slot.isRetro ? `${t.tv_retro_slot}` : t.tv_create_capsule}
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

// ── BookSlotModal ─────────────────────────────────────────────────────────────

interface BookSlotModalProps {
  visible: boolean;
  onClose: () => void;
  slots: TvSlot[];
  citizen: { id: number; balanceMinutes: number; name: string };
  date: string;
  colors: ReturnType<typeof useColors>;
  onBooked: () => void;
}

const SLOT_TYPE_KEYS = ["all", "citizen", "quarter", "half", "apex"] as const;
type SlotTypeFilter = typeof SLOT_TYPE_KEYS[number];

function getFilterLabels(t: UIStrings): Record<SlotTypeFilter, string> {
  return {
    all:     t.tv_filter_all,
    citizen: "1 Д",
    quarter: "10 Д",
    half:    "25 Д",
    apex:    "50 Д",
  };
}

const FIAT_PRICES: Record<string, string> = {
  citizen: "1.99€",
  quarter: "4.99€",
  half: "9.99€",
  apex: "24.99€",
};

function BookSlotModal({ visible, onClose, slots, citizen, date, colors, onBooked }: BookSlotModalProps) {
  const { t } = useLanguage();
  const { authHeaders } = useCitizen();
  const slotTypeLabels = getSlotTypeLabels(t);
  const filterLabels = getFilterLabels(t);
  const qc = useQueryClient();
  const [selectedSlotId, setSelectedSlotId] = useState<number | null>(null);
  const [typeFilter, setTypeFilter] = useState<SlotTypeFilter>("all");
  const [paymentType, setPaymentType] = useState<"timeltr" | "fiat">("timeltr");

  const allFreeSlots = slots.filter((s) => s.status === "free" && !s.isRetro);

  const countByType = (type: SlotTypeFilter) =>
    type === "all" ? allFreeSlots.length : allFreeSlots.filter((s) => s.slotType === type).length;

  const freeSlots =
    typeFilter === "all"
      ? allFreeSlots.slice(0, 120) // первые 2 часа для "Все"
      : allFreeSlots.filter((s) => s.slotType === typeFilter);

  const selected = allFreeSlots.find((s) => s.id === selectedSlotId) ?? null;
  const totalCost = selected ? (selected.timeltrBurnCost + selected.timeltrBurnCost * 0.02) : 0;
  const transferable = citizen.balanceMinutes - 1;
  const canAfford = transferable >= totalCost;

  const bookMutation = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("No slot selected");
      const res = await fetch(`${BASE_URL}/api/tv/slots/book`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({
          slotId: selected.id,
          paymentType,
          successUrl: `${BASE_URL}/tv?booked=1`,
          cancelUrl: `${BASE_URL}/tv`,
        }),
      });
      const json = await res.json() as { error?: string; ok?: boolean; url?: string };
      if (!res.ok) throw new Error(json.error ?? "Booking error");
      return json;
    },
    onSuccess: async (data) => {
      void qc.invalidateQueries({ queryKey: ["tvSlots"] });
      if (paymentType === "fiat" && data.url) {
        await WebBrowser.openBrowserAsync(data.url, { toolbarColor: "#0D1B2A" });
        setSelectedSlotId(null);
        onBooked();
        onClose();
        return;
      }
      Alert.alert("✅", t.tv_booked_slot);
      setSelectedSlotId(null);
      onBooked();
      onClose();
    },
    onError: (e: Error) => Alert.alert(t.error, e.message),
  });

  const renderSlotItem = ({ item: s }: { item: TvSlot }) => {
    const isSelected = s.id === selectedSlotId;
    const cost = s.timeltrBurnCost + s.timeltrBurnCost * 0.02;
    const affordable = transferable >= cost;
    return (
      <Pressable
        onPress={() => affordable && setSelectedSlotId(isSelected ? null : s.id)}
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 14,
          paddingVertical: 11,
          borderRadius: 10,
          borderWidth: isSelected ? 1.5 : StyleSheet.hairlineWidth,
          borderColor: isSelected ? colors.primary : colors.border,
          backgroundColor: pressed
            ? colors.primary + "30"
            : isSelected
            ? colors.primary + "18"
            : colors.card,
          opacity: affordable ? 1 : 0.4,
          marginHorizontal: 12,
          marginBottom: 6,
        })}
      >
        <View>
          <Text style={{ fontSize: 15, fontWeight: "700", color: isSelected ? colors.primary : colors.foreground, fontVariant: ["tabular-nums"] }}>
            {s.hourLabel}:{s.minLabel}
          </Text>
          <Text style={{ fontSize: 11, color: colors.mutedForeground, marginTop: 1 }}>
            {typeFilter === "all" ? (slotTypeLabels[s.slotType] ?? s.slotType) : "UTC"}
          </Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={{ fontSize: 13, fontWeight: "600", color: isSelected ? colors.primary : colors.foreground }}>
            {cost} Д
          </Text>
          {!affordable && (
            <Text style={{ fontSize: 10, color: colors.destructive, marginTop: 2 }}>{t.insufficient_funds}</Text>
          )}
        </View>
      </Pressable>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: "#00000088", justifyContent: "flex-end" }} onPress={onClose}>
        <Pressable style={{ backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "85%" }} onPress={(e) => e.stopPropagation?.()}>

          {/* Header */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
            <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground }}>{t.tv_free_slot} · {date}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Feather name="x" size={22} color={colors.foreground} />
            </TouchableOpacity>
          </View>

          {/* Balance row */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 8, backgroundColor: colors.muted }}>
            <Text style={{ fontSize: 12, color: colors.mutedForeground }}>{t.eco_balance}:</Text>
            <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground }}>{transferable} Д</Text>
          </View>

          {/* Type filter tabs */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}
            contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 8, gap: 6 }}
          >
            {SLOT_TYPE_KEYS.map((key) => {
              const cnt = countByType(key);
              const active = typeFilter === key;
              return (
                <Pressable
                  key={key}
                  onPress={() => { setTypeFilter(key); setSelectedSlotId(null); }}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 20,
                    backgroundColor: active ? colors.primary : colors.muted,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: "700", color: active ? "#fff" : colors.foreground }}>
                    {filterLabels[key]}
                  </Text>
                  <Text style={{ fontSize: 10, color: active ? "#ffffffaa" : colors.mutedForeground }}>
                    {cnt}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {freeSlots.length === 0 ? (
            <View style={{ padding: 40, alignItems: "center" }}>
              <Feather name="tv" size={40} color={colors.mutedForeground} />
              <Text style={{ color: colors.mutedForeground, marginTop: 12, textAlign: "center" }}>
                {allFreeSlots.length === 0
                  ? `${t.emb_empty} ${date}`
                  : t.emb_empty}
              </Text>
            </View>
          ) : (
            <FlatList
              data={freeSlots}
              keyExtractor={(s) => String(s.id)}
              renderItem={renderSlotItem}
              style={{ maxHeight: 340 }}
              contentContainerStyle={{ paddingTop: 8, paddingBottom: 8 }}
              showsVerticalScrollIndicator={true}
              ListFooterComponent={
                typeFilter === "all" && allFreeSlots.length > 120 ? (
                  <Text style={{ textAlign: "center", fontSize: 11, color: colors.mutedForeground, paddingVertical: 8 }}>
                    {t.tv_free_slot}
                  </Text>
                ) : null
              }
            />
          )}

          {/* Footer */}
          <View style={{ padding: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, gap: 8 }}>

            {/* Payment selector */}
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Pressable
                onPress={() => setPaymentType("timeltr")}
                style={({ pressed }) => ({
                  flex: 1, padding: 10, borderRadius: 10, borderWidth: 1.5,
                  borderColor: paymentType === "timeltr" ? colors.primary : colors.border,
                  backgroundColor: pressed ? colors.primary + "22" : paymentType === "timeltr" ? colors.primary + "18" : colors.card,
                  alignItems: "center", gap: 2,
                })}
              >
                <Feather name="clock" size={15} color={paymentType === "timeltr" ? colors.primary : colors.mutedForeground} />
                <Text style={{ fontSize: 11, fontWeight: "700", color: paymentType === "timeltr" ? colors.primary : colors.mutedForeground }}>TiMETR</Text>
                {selected && <Text style={{ fontSize: 10, color: paymentType === "timeltr" ? colors.primary : colors.mutedForeground }}>{totalCost} Д</Text>}
              </Pressable>
              <Pressable
                onPress={() => setPaymentType("fiat")}
                style={({ pressed }) => ({
                  flex: 1, padding: 10, borderRadius: 10, borderWidth: 1.5,
                  borderColor: paymentType === "fiat" ? "#22c55e" : colors.border,
                  backgroundColor: pressed ? "#22c55e22" : paymentType === "fiat" ? "#22c55e18" : colors.card,
                  alignItems: "center", gap: 2,
                })}
              >
                <Feather name="credit-card" size={15} color={paymentType === "fiat" ? "#22c55e" : colors.mutedForeground} />
                <Text style={{ fontSize: 11, fontWeight: "700", color: paymentType === "fiat" ? "#22c55e" : colors.mutedForeground }}>FIAT</Text>
                {selected && <Text style={{ fontSize: 10, color: paymentType === "fiat" ? "#22c55e" : colors.mutedForeground }}>{FIAT_PRICES[selected.slotType] ?? "?"}</Text>}
              </Pressable>
            </View>

            {selected && (
              <View style={{ flexDirection: "row", justifyContent: "space-between", paddingTop: 4 }}>
                <Text style={{ fontSize: 13, color: colors.mutedForeground }}>
                  {selected.hourLabel}:{selected.minLabel} · {slotTypeLabels[selected.slotType]}
                </Text>
                {paymentType === "timeltr" ? (
                  <Text style={{ fontSize: 13, fontWeight: "700", color: canAfford ? colors.foreground : colors.destructive }}>
                    −{totalCost} Д
                  </Text>
                ) : (
                  <Text style={{ fontSize: 13, fontWeight: "700", color: "#22c55e" }}>
                    {FIAT_PRICES[selected.slotType] ?? "?"}
                  </Text>
                )}
              </View>
            )}

            <Pressable
              style={({ pressed }) => {
                const active = selected && (paymentType === "fiat" || canAfford);
                return {
                  backgroundColor: active ? (pressed ? colors.primary + "cc" : colors.primary) : colors.muted,
                  height: 48,
                  borderRadius: 12,
                  alignItems: "center",
                  justifyContent: "center",
                };
              }}
              onPress={() => bookMutation.mutate()}
              disabled={!selected || (paymentType === "timeltr" && !canAfford) || bookMutation.isPending}
            >
              {bookMutation.isPending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={{ color: selected ? "#fff" : colors.mutedForeground, fontWeight: "700", fontSize: 15 }}>
                  {!selected
                    ? t.tv_free_slot
                    : paymentType === "fiat"
                    ? `${FIAT_PRICES[selected.slotType] ?? ""} Stripe`
                    : canAfford
                    ? `${t.tv_booked_slot} ${totalCost} Д`
                    : t.insufficient_funds
                  }
                </Text>
              )}
            </Pressable>
            <Text style={{ fontSize: 10, color: colors.mutedForeground, textAlign: "center" }}>
              {paymentType === "timeltr"
                ? t.tx_desc_placeholder
                : "Stripe"}
            </Text>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── ChronosGrid ───────────────────────────────────────────────────────────────

function ChronosGrid({
  slots,
  citizenId,
  date,
  colors,
  selectedSlotId,
  onTapSlot,
}: {
  slots: TvSlot[];
  citizenId: number | null;
  date: string;
  colors: ReturnType<typeof useColors>;
  selectedSlotId?: number | null;
  onTapSlot: (slot: TvSlot | null, minuteIndex: number) => void;
}) {
  const { t } = useLanguage();
  const { width: sw } = useWindowDimensions();
  const LABEL_W = 28;
  const CELL_W = Math.max(4, Math.floor((sw - LABEL_W - 36) / 60));
  const CELL_H = 13;
  const today = todayISO();
  const isToday = date === today;
  const [curMin, setCurMin] = useState(() => {
    const n = new Date();
    return n.getUTCHours() * 60 + n.getUTCMinutes();
  });
  const prevMinRef = useRef(-1);
  useEffect(() => {
    const t = setInterval(() => {
      const n = new Date();
      const m = n.getUTCHours() * 60 + n.getUTCMinutes();
      if (m !== prevMinRef.current) { prevMinRef.current = m; setCurMin(m); }
    }, 4000);
    return () => clearInterval(t);
  }, []);

  const cellMap = useMemo(() => {
    const m: Record<number, TvSlot> = {};
    for (const s of slots) m[s.minuteIndex] = s;
    return m;
  }, [slots]);

  const cellBg = (s: TvSlot | undefined, idx: number): string => {
    // Priority: current-minute(white) > selected(green) > broadcast(orange) > mine(yellow) > booked-others(dim) > free(dark)
    if (isToday && idx === curMin) return "#ffffff";
    if (!s) return colors.border + "70";
    if (selectedSlotId != null && s.id === selectedSlotId) return "#22c55e";
    if (s.status === "broadcast") return s.isRetro ? "#f9731699" : "#f97316";
    if (s.ownerId != null && s.ownerId === citizenId) return s.isRetro ? "#EAB30880" : "#EAB308";
    if (s.status === "booked") return colors.mutedForeground + "40";
    return s.isRetro ? colors.muted + "50" : colors.border + "70";
  };

  return (
    <ScrollView
      style={{ flex: 1 }}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24 }}
    >
      {/* Legend */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 8 }}>
        {([
          ["#ffffff", t.tv_today],
          ["#22c55e", t.tv_selected],
          ["#EAB308", t.tab_timer],
          ["#f97316", t.tv_live],
          [colors.mutedForeground + "40", t.tv_booked_slot],
          [colors.border + "70", t.tv_free_slot],
        ] as [string, string][]).map(([col, lbl]) => (
          <View key={lbl} style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
            <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: col }} />
            <Text style={{ fontSize: 9, color: colors.mutedForeground }}>{lbl}</Text>
          </View>
        ))}
      </View>

      {/* Rows */}
      {Array.from({ length: 24 }, (_, hour) => (
        <View key={hour} style={{ flexDirection: "row", alignItems: "center", marginBottom: 2 }}>
          <Text style={{
            width: LABEL_W, fontSize: 9, color: colors.mutedForeground,
            textAlign: "right", paddingRight: 5, fontVariant: ["tabular-nums"],
          }}>
            {String(hour).padStart(2, "0")}
          </Text>
          <View style={{ flexDirection: "row" }}>
            {Array.from({ length: 60 }, (_, min) => {
              const idx = hour * 60 + min;
              const s = cellMap[idx];
              const isCur = isToday && idx === curMin;
              return (
                <Pressable
                  key={min}
                  style={({ pressed }) => ({
                    width: CELL_W,
                    height: CELL_H,
                    backgroundColor: pressed ? colors.primary + "cc" : cellBg(s, idx),
                    borderWidth: isCur ? 1 : 0,
                    borderColor: "#fff",
                  })}
                  onPress={() => onTapSlot(s ?? null, idx)}
                />
              );
            })}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

// ── CalendarBookingSheet ──────────────────────────────────────────────────────

interface CalendarBookingSheetProps {
  visible: boolean;
  onClose: () => void;
  citizen: { id: number; balanceMinutes: number };
  initialDate: string;
  initialSlot?: TvSlot | null;
  colors: ReturnType<typeof useColors>;
  onBooked: (bookedDate: string) => void;
}

type BookStep = "date" | "grid";

function CalendarBookingSheet({ visible, onClose, citizen, initialDate, initialSlot, colors, onBooked }: CalendarBookingSheetProps) {
  const { t, lang } = useLanguage();
  const slotTypeLabels = getSlotTypeLabels(t);
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  // If we have a pre-selected slot, start on "grid"; otherwise start on "date"
  const [step, setStep] = useState<BookStep>(initialSlot ? "grid" : "date");
  const [bookDate, setBookDate] = useState(initialSlot?.date ?? initialDate);
  const [viewYear, setViewYear] = useState(() => isoToYM(initialSlot?.date ?? initialDate).year);
  const [viewMonth, setViewMonth] = useState(() => isoToYM(initialSlot?.date ?? initialDate).month);
  const [selectedSlot, setSelectedSlot] = useState<TvSlot | null>(initialSlot ?? null);
  const [paymentType, setPaymentType] = useState<"timeltr" | "fiat">("timeltr");
  const [bookError, setBookError] = useState<string | null>(null);
  const today = todayISO();

  useEffect(() => {
    if (visible) {
      const slotDate = initialSlot?.date ?? initialDate;
      setStep(initialSlot ? "grid" : "date");
      setBookDate(slotDate);
      const ym = isoToYM(slotDate);
      setViewYear(ym.year);
      setViewMonth(ym.month);
      setSelectedSlot(initialSlot ?? null);
      setPaymentType("timeltr");
      setBookError(null);
    }
  }, [visible, initialDate, initialSlot]);

  const { data: slotsData, isLoading: slotsLoading } = useQuery<{ slots: TvSlot[] }>({
    queryKey: ["tvSlots", bookDate],
    queryFn: async () => {
      const res = await fetch(`${BASE_URL}/api/tv/slots?date=${bookDate}`);
      if (!res.ok) throw new Error("Load error");
      return res.json();
    },
    enabled: step === "grid",
    staleTime: 30_000,
  });

  const slots = slotsData?.slots ?? [];
  const freeSlots = slots.filter((s) => s.status === "free" && !s.isRetro);
  const totalCost = selectedSlot
    ? selectedSlot.timeltrBurnCost + selectedSlot.timeltrBurnCost * 0.02
    : 0;
  const canAfford = citizen.balanceMinutes - 1 >= totalCost;

  const bookMutation = useMutation({
    mutationFn: async () => {
      if (!selectedSlot) throw new Error("No slot selected");
      const res = await fetch(`${BASE_URL}/api/tv/slots/book`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slotId: selectedSlot.id,
          citizenId: citizen.id,
          paymentType,
          successUrl: `${BASE_URL}/tv?booked=1`,
          cancelUrl: `${BASE_URL}/tv`,
        }),
      });
      const json = await res.json() as { error?: string; ok?: boolean; url?: string };
      if (!res.ok) throw new Error(json.error ?? "Error");
      return json;
    },
    onSuccess: async (data) => {
      if (paymentType === "fiat" && data.url) {
        await WebBrowser.openBrowserAsync(data.url, { toolbarColor: "#0D1B2A" });
      }
      void qc.invalidateQueries({ queryKey: ["tvSlots"] });
      onBooked(bookDate);
      onClose();
    },
    onError: (e: Error) => setBookError(e.message),
  });

  // Calendar data
  const totalDays = daysInMonth(viewYear, viewMonth);
  const firstOffset = firstDayOfMonth(viewYear, viewMonth);
  const calCells: (number | null)[] = [
    ...Array(firstOffset).fill(null),
    ...Array.from({ length: totalDays }, (_, i) => i + 1),
  ];
  while (calCells.length % 7 !== 0) calCells.push(null);

  const prevMonth = () => {
    if (viewMonth === 1) { setViewYear(y => y - 1); setViewMonth(12); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 12) { setViewYear(y => y + 1); setViewMonth(1); }
    else setViewMonth(m => m + 1);
  };

  const pickDate = (day: number) => {
    const iso = `${viewYear}-${String(viewMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    setBookDate(iso);
    setSelectedSlot(null);
    setStep("grid");
  };

  const handleTapSlot = (slot: TvSlot | null, _minuteIndex: number) => {
    if (!slot || slot.status !== "free" || slot.isRetro) return;
    setSelectedSlot(s => (s?.id === slot.id ? null : slot));
    setBookError(null);
  };

  const topPad = Platform.OS === "web" ? 67 : insets.top + 8;

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: topPad }}>

        {/* Header */}
        <View style={{
          flexDirection: "row", alignItems: "center",
          paddingHorizontal: 12, paddingVertical: 12,
          borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
        }}>
          <Pressable
            onPress={step === "grid" ? () => { setStep("date"); setSelectedSlot(null); } : onClose}
            style={{ padding: 8, marginRight: 6 }}
          >
            <Feather name={step === "grid" ? "arrow-left" : "x"} size={20} color={colors.foreground} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground, fontFamily: "Inter_700Bold" }}>
              {step === "date" ? `${t.tab_tv} · ${t.tv_free_slot}` : `${t.tab_tv} · ${bookDate}`}
            </Text>
            {step === "grid" && (
              <Text style={{ fontSize: 11, color: colors.mutedForeground, marginTop: 1 }}>
                {slotsLoading ? t.loading : `${freeSlots.length} / 1440`}
              </Text>
            )}
          </View>
          {step === "grid" && (
            <Pressable onPress={() => { setStep("date"); setSelectedSlot(null); }} style={{ padding: 8 }}>
              <Feather name="calendar" size={18} color={colors.primary} />
            </Pressable>
          )}
        </View>

        {/* ── Step: pick date ── */}
        {step === "date" && (
          <ScrollView contentContainerStyle={{ padding: 16 }}>
            {/* Month nav */}
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <TouchableOpacity onPress={prevMonth} style={{ padding: 8 }}>
                <Feather name="chevron-left" size={22} color={colors.foreground} />
              </TouchableOpacity>
              <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground, fontFamily: "Inter_700Bold" }}>
                {getMonthYearLabel(lang, viewYear, viewMonth)}
              </Text>
              <TouchableOpacity onPress={nextMonth} style={{ padding: 8 }}>
                <Feather name="chevron-right" size={22} color={colors.foreground} />
              </TouchableOpacity>
            </View>
            {/* DOW row */}
            <View style={{ flexDirection: "row", marginBottom: 6 }}>
              {getDowLabels(lang).map(d => (
                <Text key={d} style={{ flex: 1, textAlign: "center", fontSize: 12, fontWeight: "600", color: colors.mutedForeground }}>
                  {d}
                </Text>
              ))}
            </View>
            {/* Days */}
            <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
              {calCells.map((day, idx) => {
                if (day === null) return <View key={`e-${idx}`} style={{ width: "14.28%", height: 46 }} />;
                const iso = `${viewYear}-${String(viewMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                const isSel = iso === bookDate;
                const isToday2 = iso === today;
                const isPast = iso < today;
                return (
                  <TouchableOpacity
                    key={iso}
                    style={{ width: "14.28%", height: 46, alignItems: "center", justifyContent: "center" }}
                    onPress={() => !isPast && pickDate(day)}
                    activeOpacity={isPast ? 1 : 0.7}
                  >
                    <View style={{
                      width: 38, height: 38, borderRadius: 19,
                      alignItems: "center", justifyContent: "center",
                      backgroundColor: isSel ? colors.primary : "transparent",
                      borderWidth: isToday2 && !isSel ? 1.5 : 0,
                      borderColor: colors.primary,
                    }}>
                      <Text style={{
                        fontSize: 15, fontWeight: isSel || isToday2 ? "700" : "400",
                        color: isSel ? "#fff" : isPast ? colors.mutedForeground + "55" : isToday2 ? colors.primary : colors.foreground,
                      }}>
                        {day}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
            {/* Hint */}
            <View style={{ marginTop: 20, padding: 14, backgroundColor: colors.card, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }}>
              <Text style={{ fontSize: 12, color: colors.mutedForeground, lineHeight: 18 }}>
                {t.tv_free_slot} · 1440
              </Text>
            </View>
          </ScrollView>
        )}

        {/* ── Step: grid ── */}
        {step === "grid" && (
          <>
            {slotsLoading ? (
              <View style={{ flex: 1, justifyContent: "center", alignItems: "center", gap: 12 }}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>{t.loading}</Text>
              </View>
            ) : (
              <ChronosGrid
                slots={slots}
                citizenId={citizen.id}
                date={bookDate}
                colors={colors}
                selectedSlotId={selectedSlot?.id ?? null}
                onTapSlot={handleTapSlot}
              />
            )}

            {/* Booking confirmation bar */}
            {selectedSlot && (
              <View style={{
                borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border,
                backgroundColor: colors.card, padding: 14, gap: 10,
              }}>
                {/* Slot info row */}
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <View>
                    <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground, fontFamily: "Inter_700Bold" }}>
                      {selectedSlot.hourLabel}:{selectedSlot.minLabel} · {bookDate}
                    </Text>
                    <Text style={{ fontSize: 12, color: colors.mutedForeground }}>
                      {slotTypeLabels[selectedSlot.slotType]}
                    </Text>
                  </View>
                  <Pressable onPress={() => setSelectedSlot(null)} style={{ padding: 8 }}>
                    <Feather name="x" size={18} color={colors.mutedForeground} />
                  </Pressable>
                </View>

                {/* Payment toggle */}
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Pressable
                    onPress={() => setPaymentType("timeltr")}
                    style={({ pressed }) => ({
                      flex: 1, padding: 10, borderRadius: 10, borderWidth: 1.5,
                      borderColor: paymentType === "timeltr" ? colors.primary : colors.border,
                      backgroundColor: pressed ? colors.primary + "22" : paymentType === "timeltr" ? colors.primary + "18" : colors.background,
                      alignItems: "center", gap: 2,
                    })}
                  >
                    <Feather name="clock" size={14} color={paymentType === "timeltr" ? colors.primary : colors.mutedForeground} />
                    <Text style={{ fontSize: 11, fontWeight: "700", color: paymentType === "timeltr" ? colors.primary : colors.mutedForeground }}>TiMETR</Text>
                    <Text style={{ fontSize: 10, color: paymentType === "timeltr" ? colors.primary : colors.mutedForeground }}>{totalCost} Д</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setPaymentType("fiat")}
                    style={({ pressed }) => ({
                      flex: 1, padding: 10, borderRadius: 10, borderWidth: 1.5,
                      borderColor: paymentType === "fiat" ? "#22c55e" : colors.border,
                      backgroundColor: pressed ? "#22c55e22" : paymentType === "fiat" ? "#22c55e18" : colors.background,
                      alignItems: "center", gap: 2,
                    })}
                  >
                    <Feather name="credit-card" size={14} color={paymentType === "fiat" ? "#22c55e" : colors.mutedForeground} />
                    <Text style={{ fontSize: 11, fontWeight: "700", color: paymentType === "fiat" ? "#22c55e" : colors.mutedForeground }}>FIAT</Text>
                    <Text style={{ fontSize: 10, color: paymentType === "fiat" ? "#22c55e" : colors.mutedForeground }}>{FIAT_PRICES[selectedSlot.slotType] ?? "?"}</Text>
                  </Pressable>
                </View>

                {/* Book button */}
                <Pressable
                  style={({ pressed }) => {
                    const active = paymentType === "fiat" || canAfford;
                    return {
                      backgroundColor: active ? (pressed ? colors.primary + "cc" : colors.primary) : colors.muted,
                      height: 48, borderRadius: 12, alignItems: "center", justifyContent: "center",
                    };
                  }}
                  onPress={() => { setBookError(null); bookMutation.mutate(); }}
                  disabled={bookMutation.isPending || (paymentType === "timeltr" && !canAfford)}
                >
                  {bookMutation.isPending ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15, fontFamily: "Inter_700Bold" }}>
                      {paymentType === "fiat"
                        ? `${FIAT_PRICES[selectedSlot.slotType] ?? ""} Stripe`
                        : canAfford
                        ? `${t.tv_booked_slot} ${totalCost} Д`
                        : t.insufficient_funds}
                    </Text>
                  )}
                </Pressable>

                {/* Inline error — visible on all platforms (replaces Alert.alert) */}
                {bookError && (
                  <View style={{ backgroundColor: "#7f1d1d22", borderWidth: 1, borderColor: "#ef444455", borderRadius: 8, padding: 10 }}>
                    <Text style={{ color: "#ef4444", fontSize: 12, textAlign: "center" }}>{bookError}</Text>
                  </View>
                )}
              </View>
            )}
          </>
        )}
      </View>
    </Modal>
  );
}

// ── ChronosLivePulse ─────────────────────────────────────────────────────────

interface LiveSlotInfo {
  minuteIndex: number;
  videoUrl: string | null;
  hasContent: boolean;
  ownerName: string | null;
  slotType: string | null;
  slotId: number | null;
}

function ChronosLivePulse({ date, colors }: { date: string; colors: ReturnType<typeof useColors> }) {
  const { t } = useLanguage();
  const slotTypeLabels = getSlotTypeLabels(t);
  const [currentMinute, setCurrentMinute] = useState(() => {
    const n = new Date();
    return n.getUTCHours() * 60 + n.getUTCMinutes();
  });
  const [utcClock, setUtcClock] = useState("");
  const [slot, setSlot] = useState<LiveSlotInfo | null>(null);
  const prevMinute = useRef(-1);
  const prefetchRef = useRef<{ minute: number; data: LiveSlotInfo | null } | null>(null);

  const fetchSlot = useCallback(async (minute: number) => {
    try {
      const res = await fetch(`${BASE_URL}/api/tv/live-slot?date=${date}&minute=${minute}`);
      if (!res.ok) return null;
      return (await res.json()) as LiveSlotInfo;
    } catch { return null; }
  }, [date]);

  useEffect(() => {
    const n = new Date();
    const m = n.getUTCHours() * 60 + n.getUTCMinutes();
    setCurrentMinute(m);
    void fetchSlot(m).then((d) => { if (d) setSlot(d); });
  }, [fetchSlot]);

  useEffect(() => {
    const timer = setInterval(() => {
      const n = new Date();
      const h = n.getUTCHours(), m = n.getUTCMinutes(), s = n.getUTCSeconds();
      const minute = h * 60 + m;
      const p = (x: number) => String(x).padStart(2, "0");
      setUtcClock(`${p(h)}:${p(m)}:${p(s)} UTC`);
      if (s >= 55) {
        const next = (minute + 1) % 1440;
        if (!prefetchRef.current || prefetchRef.current.minute !== next) {
          void fetchSlot(next).then((d) => { prefetchRef.current = { minute: next, data: d }; });
        }
      }
      if (minute !== prevMinute.current) {
        prevMinute.current = minute;
        setCurrentMinute(minute);
        if (prefetchRef.current?.minute === minute) {
          const d = prefetchRef.current.data;
          prefetchRef.current = null;
          if (d) setSlot(d);
        } else {
          void fetchSlot(minute).then((d) => { if (d) setSlot(d); });
        }
      }
    }, 500);
    return () => clearInterval(timer);
  }, [fetchSlot]);

  const hh = String(Math.floor(currentMinute / 60)).padStart(2, "0");
  const mm2 = String(currentMinute % 60).padStart(2, "0");

  const openLive = async () => {
    if (!slot?.videoUrl) return;
    const url = slot.videoUrl.startsWith("http") ? slot.videoUrl : `${BASE_URL}${slot.videoUrl}`;
    await WebBrowser.openBrowserAsync(url, { toolbarColor: "#0D1B2A" });
  };

  return (
    <View style={{
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 14,
      paddingVertical: 9,
      backgroundColor: colors.card,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      gap: 8,
    }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
        <View style={{
          width: 7, height: 7, borderRadius: 4,
          backgroundColor: "#f97316",
          shadowColor: "#f97316",
          shadowRadius: 4,
          shadowOpacity: 0.8,
          shadowOffset: { width: 0, height: 0 },
        }} />
        <Text style={{ fontSize: 10, fontFamily: "Inter_700Bold", color: "#f97316", letterSpacing: 1.5 }}>{t.tv_live}</Text>
      </View>
      <Text style={{ fontSize: 13, fontFamily: "Inter_700Bold", color: colors.primary, fontVariant: ["tabular-nums"] }}>
        {hh}:{mm2}
      </Text>
      <View style={{ flex: 1 }}>
        {slot?.hasContent ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            {slot.slotType && (
              <View style={{ backgroundColor: colors.primary + "22", borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1 }}>
                <Text style={{ fontSize: 9, fontFamily: "Inter_600SemiBold", color: colors.primary }}>{slotTypeLabels[slot.slotType] ?? slot.slotType}</Text>
              </View>
            )}
            <Text style={{ fontSize: 12, color: colors.foreground, fontFamily: "Inter_500Medium" }} numberOfLines={1}>
              {slot.ownerName}
            </Text>
          </View>
        ) : (
          <Text style={{ fontSize: 11, color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>
            {t.tv_awaiting} · {hh}:{mm2}
          </Text>
        )}
      </View>
      <TouchableOpacity
        onPress={() => router.push("/broadcast")}
        style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#f97316", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 }}
        activeOpacity={0.8}
      >
        <Feather name="radio" size={11} color="#fff" />
        <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold", color: "#fff" }}>{t.tab_tv}</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function TvScreen() {
  const { t } = useLanguage();
  const slotTypeLabels = getSlotTypeLabels(t);
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { citizen } = useCitizen();
  const [date, setDate] = useState(todayISO());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<TvSlot | null>(null);
  const [showAgeGate, setShowAgeGate] = useState(false);
  const [showBookModal, setShowBookModal] = useState(false);
  const [showCalBooking, setShowCalBooking] = useState(false);
  const [gridTappedSlot, setGridTappedSlot] = useState<TvSlot | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
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
      if (!res.ok) throw new Error("Slots load error");
      return res.json();
    },
    enabled: !!citizen,
  });

  const mySlots = (data?.slots ?? []).filter((s) => s.ownerId === citizen?.id);
  const freeCount = (data?.slots ?? []).filter((s) => s.status === "free").length;

  // Авто-скролл к последнему слоту когда список обновляется
  useEffect(() => {
    if (mySlots.length > 0 && viewMode === "list") {
      setTimeout(() => {
        slotListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [mySlots.length, viewMode]);

  const handlePrevDay = useCallback(() => setDate((d) => stepDate(d, -1)), []);
  const handleNextDay = useCallback(() => setDate((d) => stepDate(d, 1)), []);

  // ── Dual clock (Local + UTC) ─────────────────────────────────────────────
  const [localTime, setLocalTime] = useState("--:--:--");
  const [utcTime, setUtcTime] = useState("--:--:--");
  const [clockSynced, setClockSynced] = useState(false);
  const clockOffset = useRef(0);
  const slotListRef = useRef<FlatList<TvSlot>>(null);

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

  const renderSlotCard = ({ item }: { item: TvSlot }) => {
    const isBroadcast = item.status === "broadcast";
    const isBooked = item.status === "booked";
    const badgeBg = isBroadcast
      ? colors.primary + "33"
      : isBooked
      ? "#F59E0B22"
      : colors.primary + "22";
    const badgeColor = isBroadcast ? colors.primary : isBooked ? "#F59E0B" : colors.primary;
    const badgeIcon = isBroadcast ? "film" : isBooked ? "edit-2" : "clock";
    const badgeText = isBroadcast
      ? t.tv_booked_slot
      : isBooked
      ? t.tv_create_capsule
      : t.tv_free_slot;

    return (
      <TouchableOpacity
        style={[styles.slotCard, {
          backgroundColor: colors.card,
          borderColor: isBooked ? "#F59E0B55" : colors.border,
          borderWidth: isBooked ? 1.5 : StyleSheet.hairlineWidth,
        }]}
        onPress={() => setSelectedSlot(item)}
        activeOpacity={0.75}
      >
        <View style={styles.slotCardLeft}>
          <Text style={[styles.slotTime, { color: colors.foreground }]}>{slotLabel(item)}</Text>
          <Text style={[styles.slotType, { color: colors.mutedForeground }]}>
            {slotTypeLabels[item.slotType] ?? item.slotType}
            {item.isRetro ? ` · ${t.tv_retro_slot}` : ""}
          </Text>
        </View>
        <View style={styles.slotCardRight}>
          <View style={[styles.slotBadge, { backgroundColor: badgeBg }]}>
            <Feather name={badgeIcon} size={12} color={badgeColor} />
            <Text style={[styles.slotBadgeText, { color: badgeColor, fontWeight: isBooked ? "700" : "500" }]}>
              {badgeText}
            </Text>
          </View>
          <Feather name="chevron-right" size={16} color={isBooked ? "#F59E0B" : colors.mutedForeground} style={{ marginLeft: 8 }} />
        </View>
      </TouchableOpacity>
    );
  };

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

      {/* ── Chronos Live Pulse ─────────────────────────────────────────────── */}
      <ChronosLivePulse date={date} colors={colors} />

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
          {/* View toggle: LIST | GRID */}
          <View style={{ flexDirection: "row", gap: 4 }}>
            <TouchableOpacity
              style={{
                paddingHorizontal: 10, paddingVertical: 4, borderRadius: 7,
                backgroundColor: viewMode === "list" ? colors.primary + "22" : "transparent",
                borderWidth: 1, borderColor: viewMode === "list" ? colors.primary + "66" : colors.border,
              }}
              onPress={() => setViewMode("list")}
            >
              <Text style={{ fontSize: 11, fontWeight: "600", color: viewMode === "list" ? colors.primary : colors.mutedForeground }}>
                {t.timeline_list}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{
                paddingHorizontal: 10, paddingVertical: 4, borderRadius: 7,
                backgroundColor: viewMode === "grid" ? colors.primary + "22" : "transparent",
                borderWidth: 1, borderColor: viewMode === "grid" ? colors.primary + "66" : colors.border,
              }}
              onPress={() => setViewMode("grid")}
            >
              <Text style={{ fontSize: 11, fontWeight: "600", color: viewMode === "grid" ? colors.primary : colors.mutedForeground }}>
                {t.tv_schedule}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.summaryActions}>
            <TouchableOpacity
              style={[styles.bookSlotBtn, { backgroundColor: colors.primary + "22", borderColor: colors.primary + "55" }]}
              onPress={() => { setGridTappedSlot(null); tvGuide.trigger(() => { setShowCalBooking(true); }); }}
              activeOpacity={0.75}
            >
              <Feather name="calendar" size={12} color={colors.primary} />
              <Text style={[styles.bookSlotBtnText, { color: colors.primary }]}>{t.tv_book_slot}</Text>
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
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>{t.pls_login}</Text>
        </View>
      )}

      {/* Loading */}
      {isLoading && (
        <View style={styles.emptyState}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>{t.loading}</Text>
        </View>
      )}

      {/* List mode: my booked slots */}
      {!isLoading && viewMode === "list" && citizen && mySlots.length === 0 && (
        <View style={styles.emptyState}>
          <Feather name="tv" size={44} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>{t.tv_free_slot}</Text>
          <TouchableOpacity
            onPress={() => tvGuide.trigger(() => { setShowCalBooking(true); })}
            style={{ marginTop: 8, backgroundColor: colors.primary + "22", borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10, borderWidth: 1, borderColor: colors.primary + "55" }}
          >
            <Text style={{ color: colors.primary, fontWeight: "600", textAlign: "center" }}>
              {t.tv_book_slot}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {!isLoading && viewMode === "list" && mySlots.length > 0 && (
        <FlatList
          ref={slotListRef}
          data={mySlots}
          keyExtractor={(s) => String(s.id)}
          renderItem={renderSlotCard}
          style={{ flex: 1 }}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 80 }]}
          showsVerticalScrollIndicator={true}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          ListHeaderComponent={
            <Text style={[styles.listHeader, { color: colors.mutedForeground }]}>
              {t.tv_capsule_title}
            </Text>
          }
        />
      )}

      {/* Grid mode: ChronosGrid — all 1440 slots */}
      {!isLoading && viewMode === "grid" && citizen && (
        <ChronosGrid
          slots={data?.slots ?? []}
          citizenId={citizen.id}
          date={date}
          colors={colors}
          selectedSlotId={gridTappedSlot?.id ?? null}
          onTapSlot={(slot) => {
            if (slot && slot.status === "free" && !slot.isRetro) {
              setGridTappedSlot(slot);
              tvGuide.trigger(() => { setShowCalBooking(true); });
            } else if (slot && slot.ownerId === citizen.id) {
              setSelectedSlot(slot);
            }
          }}
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

      {/* Book slot modal (legacy, kept for direct access) */}
      {showBookModal && citizen && (
        <BookSlotModal
          visible={showBookModal}
          onClose={() => setShowBookModal(false)}
          slots={data?.slots ?? []}
          citizen={citizen}
          date={date}
          colors={colors}
          onBooked={() => { void refetch(); }}
        />
      )}

      {/* Calendar booking sheet */}
      {showCalBooking && citizen && (
        <CalendarBookingSheet
          visible={showCalBooking}
          onClose={() => { setShowCalBooking(false); setGridTappedSlot(null); }}
          citizen={citizen}
          initialDate={gridTappedSlot?.date ?? date}
          initialSlot={gridTappedSlot}
          colors={colors}
          onBooked={(bookedDate) => { setGridTappedSlot(null); setDate(bookedDate); void refetch(); }}
        />
      )}

      <ContextualGuideModal
        visible={tvGuide.visible}
        onClose={tvGuide.close}
        onConfirm={tvGuide.confirm}
        icon="📺"
        title={t.tv_book_slot}
        explanation={t.tv_guide_text}
        ctaLabel={t.tv_create_capsule}
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
    countdownRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      marginTop: 2,
    },
    countdownText: {
      fontSize: 13,
      fontWeight: "600",
    },
    timedOutBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      borderRadius: 6,
      paddingHorizontal: 8,
      paddingVertical: 5,
      marginTop: 2,
    },
    timedOutText: {
      fontSize: 11,
      lineHeight: 16,
      flex: 1,
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
