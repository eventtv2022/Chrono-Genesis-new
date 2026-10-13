import { getBaseUrl } from "@/lib/api";
import { CapsuleMediaPlayer } from "@/components/CapsuleMediaPlayer";
import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  FlatList,
  TextInput,
  ActivityIndicator,
  ScrollView,
  Platform,
  Modal,
  Alert,
  KeyboardAvoidingView,
  Image,
  Animated,
  Easing,
  useWindowDimensions,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { Audio } from "expo-av";
import { Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useColors } from "@/hooks/useColors";
import { useCitizen } from "@/context/CitizenContext";
import { useLanguage } from "@/context/LanguageContext";
import { FOCUS_PROMPTS_I18N } from "@/lib/i18n";
import { MEDIA_DURATION_WARNING } from "@/lib/mediaDurationWarning";
import { LogoBrand } from "@/components/LogoBrand";

// ── Century boundary guard (client-side mirror of backend centuryGuard.ts) ─────
function isCenturyBoundaryCoord(coord: string): boolean {
  if (!coord || coord.length !== 12) return false;
  const year   = parseInt(coord.slice(0, 4), 10);
  const month  = parseInt(coord.slice(4, 6), 10);
  const day    = parseInt(coord.slice(6, 8), 10);
  const hour   = parseInt(coord.slice(8, 10), 10);
  const minute = parseInt(coord.slice(10, 12), 10);
  const isFirst = year % 100 === 1 && month === 1  && day === 1  && hour === 0  && minute === 0;
  const isLast  = year % 100 === 0 && year > 0     && month === 12 && day === 31 && hour === 23 && minute === 59;
  return isFirst || isLast;
}

// ── StatePropertyModal ─────────────────────────────────────────────────────────
function StatePropertyModal({ visible, onClose, colors }: { visible: boolean; onClose: () => void; colors: ReturnType<typeof useColors> }) {
  const { t } = useLanguage();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", alignItems: "center", padding: 24 }}>
        <View style={{ backgroundColor: colors.background, borderWidth: 2, borderColor: "#f59e0b99", borderRadius: 20, padding: 28, width: "100%", alignItems: "center" }}>
          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: "#f59e0b18", borderWidth: 1, borderColor: "#f59e0b55", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
            <Text style={{ fontSize: 30 }}>🏛️</Text>
          </View>
          <Text style={{ fontSize: 15, fontWeight: "800", color: "#f59e0b", textAlign: "center", marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>
            {t.cp_state_title}
          </Text>
          <Text style={{ fontSize: 13, color: colors.mutedForeground, textAlign: "center", lineHeight: 20, marginBottom: 24 }}>
            {t.cp_state_body}{" "}
            <Text style={{ color: colors.foreground, fontWeight: "600" }}>{t.cp_state_fund}</Text>.
            {"\n"}{t.cp_state_note}
          </Text>
          <Pressable
            onPress={onClose}
            style={({ pressed }) => ({ width: "100%", backgroundColor: "#f59e0b", borderRadius: 12, paddingVertical: 14, alignItems: "center", opacity: pressed ? 0.8 : 1, cursor: "pointer" as never })}
          >
            <Text style={{ fontSize: 15, fontWeight: "700", color: "#000" }}>{t.cp_state_ok}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

// ── TimeAnchorAuctionModal ─────────────────────────────────────────────────────
interface AnchorAuctionModalProps {
  anchor: { timelineCoord: string } | null;
  visible: boolean;
  onClose: () => void;
  onSubmit: (data: { startingPrice: number; durationHours: number }) => void;
  submitting: boolean;
  colors: ReturnType<typeof useColors>;
}

function TimeAnchorAuctionModal({ anchor, visible, onClose, onSubmit, submitting, colors }: AnchorAuctionModalProps) {
  const { t } = useLanguage();
  const [priceInput, setPriceInput]       = useState("1");
  const [durationInput, setDurationInput] = useState("24");

  const c = anchor?.timelineCoord ?? "";
  const label = c.length === 12
    ? `${c.slice(6,8)}.${c.slice(4,6)}.${parseInt(c.slice(0,4),10)} ${c.slice(8,10)}:${c.slice(10,12)}`
    : c;

  const handleConfirm = () => {
    const price = parseFloat(priceInput);
    const hours = parseInt(durationInput, 10);
    if (isNaN(price) || price <= 0)     { Alert.alert("⚠️", t.auc_price_err); return; }
    if (isNaN(hours) || hours < 1 || hours > 168) { Alert.alert("⚠️", t.auc_duration_err); return; }
    onSubmit({ startingPrice: price, durationHours: hours });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" }}>
        <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 }}>
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: "#555", alignSelf: "center", marginBottom: 16 }} />
          <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground, marginBottom: 4 }}>{t.auc_anchor_title}</Text>
          <Text style={{ fontSize: 13, color: colors.mutedForeground, marginBottom: 20 }}>{label}</Text>

          <View style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, marginBottom: 20, flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Feather name="info" size={14} color={colors.primary} />
            <Text style={{ flex: 1, fontSize: 12, color: colors.mutedForeground, lineHeight: 17 }}>
              {t.auc_anchor_info}
            </Text>
          </View>

          <Text style={{ fontSize: 11, fontWeight: "600", color: colors.mutedForeground, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>{t.auc_price_label}</Text>
          <TextInput
            style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, fontSize: 16, color: colors.foreground, backgroundColor: colors.card, marginBottom: 14 }}
            placeholder="1.00" placeholderTextColor={colors.mutedForeground}
            value={priceInput} onChangeText={setPriceInput} keyboardType="decimal-pad" autoFocus
          />

          <Text style={{ fontSize: 11, fontWeight: "600", color: colors.mutedForeground, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>{t.auc_dur_hours_label}</Text>
          <TextInput
            style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, fontSize: 16, color: colors.foreground, backgroundColor: colors.card, marginBottom: 24 }}
            placeholder="24" placeholderTextColor={colors.mutedForeground}
            value={durationInput} onChangeText={setDurationInput} keyboardType="number-pad"
          />

          <Pressable
            onPress={handleConfirm} disabled={submitting}
            style={({ pressed }) => ({ backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 14, alignItems: "center", marginBottom: 10, opacity: submitting ? 0.6 : pressed ? 0.8 : 1, cursor: "pointer" as never })}
          >
            {submitting
              ? <ActivityIndicator color={colors.primaryForeground} />
              : <Text style={{ fontSize: 16, fontWeight: "700", color: colors.primaryForeground }}>{t.auc_anchor_btn}</Text>}
          </Pressable>
          <Pressable onPress={onClose} style={{ alignItems: "center", padding: 10, cursor: "pointer" as never }}>
            <Text style={{ fontSize: 15, color: colors.mutedForeground }}>{t.cancel}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const BASE_URL = getBaseUrl();

function formatMediaDuration(seconds: number): string {
  const totalSeconds = Math.round(seconds);
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

// ── MyOwnedSlot interface (chronopedia slots owned by citizen) ─────────────────
interface MyOwnedSlot {
  id: number;
  timeMarker: string;
  placeId: string;
  geoLat: number;
  geoLng: number;
  locationName: string;
  ownerCitizenId: number | null;
  isLocked: boolean;
  capsuleTitle: string | null;
  capsuleContent: string | null;
  capsuleMediaUrl: string | null;
  isCapsuleSealed: boolean;
  createdAt: string;
  eventCount: number;
}

// ── SlotActionModal — 3-button action menu for owned chronopedia slots ─────────
interface SlotActionModalProps {
  slot: MyOwnedSlot | null;
  visible: boolean;
  onClose: () => void;
  onCapsule: () => void;
  onAuction: () => void;
  onTimeline: () => void;
  colors: ReturnType<typeof useColors>;
}

function SlotActionModal({ slot, visible, onClose, onCapsule, onAuction, onTimeline, colors }: SlotActionModalProps) {
  const { t } = useLanguage();
  if (!slot) return null;
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" }} onPress={onClose}>
        <Pressable style={{ backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 36 }} onPress={() => {}}>
          {/* Handle bar */}
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: "center", marginBottom: 16 }} />

          {/* Slot info */}
          <View style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, marginBottom: 20 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <Feather name="map-pin" size={14} color={colors.primary} />
              <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, flex: 1 }} numberOfLines={1}>
                {slot.locationName}
              </Text>
              {slot.isCapsuleSealed && (
                <View style={{ backgroundColor: "#7c3aed22", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                  <Text style={{ fontSize: 10, fontWeight: "700", color: "#7c3aed" }}>📜 {t.tl_badge_capsule}</Text>
                </View>
              )}
              {slot.isLocked && (
                <View style={{ backgroundColor: "#f59e0b22", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                  <Text style={{ fontSize: 10, fontWeight: "700", color: "#f59e0b" }}>🔥 {t.tl_badge_auction}</Text>
                </View>
              )}
            </View>
            <Text style={{ fontSize: 12, color: colors.mutedForeground, fontFamily: "monospace" }}>{slot.timeMarker}</Text>
          </View>

          {/* Action: Capsule */}
          <Pressable
            style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 14, padding: 16, backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, marginBottom: 10, opacity: pressed ? 0.7 : 1, cursor: "pointer" as never })}
            onPress={() => { onClose(); setTimeout(onCapsule, 350); }}
          >
            <View style={{ width: 42, height: 42, borderRadius: 11, backgroundColor: "#7c3aed22", alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontSize: 20 }}>📜</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground }}>{t.tl_action_capsule}</Text>
              <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 1 }}>
                {slot.isCapsuleSealed ? t.tl_action_capsule_edit : t.tl_action_capsule_new}
              </Text>
            </View>
            <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
          </Pressable>

          {/* Action: Auction */}
          <Pressable
            style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 14, padding: 16, backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: slot.isLocked ? "#f59e0b55" : colors.border, marginBottom: 10, opacity: slot.isLocked ? 0.6 : pressed ? 0.7 : 1, cursor: "pointer" as never })}
            onPress={() => { if (slot.isLocked) { Alert.alert("🔥", t.tl_already_auction); return; } onClose(); setTimeout(onAuction, 350); }}
          >
            <View style={{ width: 42, height: 42, borderRadius: 11, backgroundColor: "#f59e0b22", alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontSize: 20 }}>🔨</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground }}>{t.tl_action_auction}</Text>
              <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 1 }}>
                {slot.isLocked ? t.tl_action_on_auction : t.tl_action_sell}
              </Text>
            </View>
            {!slot.isLocked && <Feather name="chevron-right" size={16} color={colors.mutedForeground} />}
          </Pressable>

          {/* Action: Go to Timeline */}
          <Pressable
            style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 14, padding: 16, backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, marginBottom: 16, opacity: pressed ? 0.7 : 1, cursor: "pointer" as never })}
            onPress={() => { onClose(); setTimeout(onTimeline, 350); }}
          >
            <View style={{ width: 42, height: 42, borderRadius: 11, backgroundColor: colors.primary + "22", alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontSize: 20 }}>📍</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground }}>{t.tl_go_timeline}</Text>
              <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 1 }}>{t.tl_go_timeline_sub}</Text>
            </View>
            <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
          </Pressable>

          <Pressable style={{ alignItems: "center", paddingVertical: 10, cursor: "pointer" as never }} onPress={onClose}>
            <Text style={{ fontSize: 15, color: colors.mutedForeground }}>{t.cancel}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── AttachCapsuleModal — rich Capsule of Meaning form for chronopedia slots ────
interface AttachCapsuleModalProps {
  slot: MyOwnedSlot | null;
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  citizenId: number;
  colors: ReturnType<typeof useColors>;
}

function AttachCapsuleModal({ slot, visible, onClose, onSuccess, citizenId, colors }: AttachCapsuleModalProps) {
  const { t } = useLanguage();
  const [title, setTitle]     = useState(slot?.capsuleTitle ?? "");
  const [content, setContent] = useState(slot?.capsuleContent ?? "");
  const [mediaUrl, setMediaUrl] = useState(slot?.capsuleMediaUrl ?? "");
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [saving, setSaving]   = useState(false);

  // Reset when slot changes
  useEffect(() => {
    setTitle(slot?.capsuleTitle ?? "");
    setContent(slot?.capsuleContent ?? "");
    setMediaUrl(slot?.capsuleMediaUrl ?? "");
  }, [slot?.id]);

  const handleSave = async () => {
    if (!slot) return;
    if (!title.trim()) { Alert.alert("⚠️", t.tl_cap_err_title); return; }
    if (!content.trim()) { Alert.alert("⚠️", t.tl_cap_err_content); return; }
    setSaving(true);
    try {
      const res = await fetch(`${BASE_URL}/api/chronopedia/slots/${slot.id}/capsule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ citizenId, title: title.trim(), content: content.trim(), mediaUrl: mediaUrl.trim() || undefined, visibility }),
      });
      if (res.ok) {
        onSuccess();
        onClose();
        Alert.alert("📜", t.tl_cap_sealed);
      } else {
        const d = await res.json() as { error?: string };
        Alert.alert(t.error, d.error ?? t.tl_cap_err_save);
      }
    } catch {
      Alert.alert(t.error, t.connection_error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: 20, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
          {/* Header */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 4, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <Text style={{ fontSize: 20 }}>📜</Text>
            <Text style={{ fontSize: 17, fontWeight: "800", color: colors.foreground, flex: 1 }}>{t.tl_cap_meaning}</Text>
            <Pressable onPress={onClose} hitSlop={8} style={{ cursor: "pointer" as never }}>
              <Feather name="x" size={22} color={colors.foreground} />
            </Pressable>
          </View>

          {/* Slot info badge */}
          {slot && (
            <View style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 10, marginTop: 14, marginBottom: 20, flexDirection: "row", gap: 8, alignItems: "center" }}>
              <Feather name="map-pin" size={12} color={colors.primary} />
              <Text style={{ fontSize: 12, color: colors.mutedForeground, flex: 1 }} numberOfLines={1}>
                {slot.locationName} · {slot.timeMarker}
              </Text>
            </View>
          )}

          {/* Title */}
          <Text style={{ fontSize: 11, fontWeight: "700", color: colors.mutedForeground, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>{t.tl_cap_title_label}</Text>
          <TextInput
            style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, fontSize: 15, color: colors.foreground, backgroundColor: colors.card, marginBottom: 16 }}
            placeholder={t.tl_cap_title_ph}
            placeholderTextColor={colors.mutedForeground}
            value={title}
            onChangeText={setTitle}
            maxLength={200}
          />

          {/* Content */}
          <Text style={{ fontSize: 11, fontWeight: "700", color: colors.mutedForeground, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>{t.tl_cap_content_label}</Text>
          <TextInput
            style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, fontSize: 14, color: colors.foreground, backgroundColor: colors.card, marginBottom: 6, minHeight: 120, textAlignVertical: "top" }}
            placeholder={t.tl_cap_content_ph}
            placeholderTextColor={colors.mutedForeground}
            value={content}
            onChangeText={setContent}
            multiline
            maxLength={5000}
          />
          <Text style={{ fontSize: 11, color: colors.mutedForeground, textAlign: "right", marginBottom: 16 }}>{content.length}/5000</Text>

          {/* Media URL */}
          <Text style={{ fontSize: 11, fontWeight: "700", color: colors.mutedForeground, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>{t.tl_cap_media_label}</Text>
          <TextInput
            style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, fontSize: 13, color: colors.foreground, backgroundColor: colors.card, marginBottom: 16 }}
            placeholder="https://..."
            placeholderTextColor={colors.mutedForeground}
            value={mediaUrl}
            onChangeText={setMediaUrl}
            keyboardType="url"
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={500}
          />

          {/* Visibility */}
          <Text style={{ fontSize: 11, fontWeight: "700", color: colors.mutedForeground, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>{t.tl_cap_visibility}</Text>
          <View style={{ flexDirection: "row", gap: 10, marginBottom: 24 }}>
            {(["public", "private"] as const).map(v => (
              <Pressable
                key={v}
                style={({ pressed }) => ({ flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: visibility === v ? colors.primary : colors.border, backgroundColor: visibility === v ? colors.primary + "18" : colors.card, alignItems: "center", opacity: pressed ? 0.7 : 1, cursor: "pointer" as never })}
                onPress={() => setVisibility(v)}
              >
                <Text style={{ fontSize: 14, fontWeight: "700", color: visibility === v ? colors.primary : colors.mutedForeground }}>
                  {v === "public" ? `🌐 ${t.tl_cap_public}` : `🔒 ${t.tl_cap_private}`}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Save button */}
          <Pressable
            style={({ pressed }) => ({ backgroundColor: "#7c3aed", borderRadius: 14, paddingVertical: 15, alignItems: "center", opacity: saving ? 0.6 : pressed ? 0.8 : 1, cursor: "pointer" as never })}
            disabled={saving}
            onPress={() => void handleSave()}
          >
            {saving
              ? <ActivityIndicator color="#fff" />
              : <Text style={{ fontSize: 16, fontWeight: "800", color: "#fff" }}>📜 {t.tl_cap_seal}</Text>}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── CreateSlotAuctionModal — put a chronopedia slot on auction ─────────────────
interface CreateSlotAuctionModalProps {
  slot: MyOwnedSlot | null;
  visible: boolean;
  onClose: () => void;
  onSubmit: (data: { startingPrice: number; durationHours: number }) => void;
  submitting: boolean;
  colors: ReturnType<typeof useColors>;
}

function CreateSlotAuctionModal({ slot, visible, onClose, onSubmit, submitting, colors }: CreateSlotAuctionModalProps) {
  const { t } = useLanguage();
  const [priceInput, setPriceInput]       = useState("10");
  const [durationInput, setDurationInput] = useState("24");
  const DURATIONS = [
    { label: t.auc_dur_12h, value: "12"  },
    { label: t.auc_dur_24h, value: "24"  },
    { label: t.auc_dur_48h, value: "48"  },
    { label: t.auc_dur_7d,  value: "168" },
  ];

  const handleConfirm = () => {
    const price = parseFloat(priceInput);
    const hours = parseInt(durationInput, 10);
    if (isNaN(price) || price <= 0) { Alert.alert("⚠️", t.auc_price_err); return; }
    onSubmit({ startingPrice: price, durationHours: hours });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" }}>
        <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 }}>
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: "#555", alignSelf: "center", marginBottom: 16 }} />
          <Text style={{ fontSize: 18, fontWeight: "800", color: colors.foreground, marginBottom: 4 }}>{t.auc_slot_title}</Text>
          {slot && <Text style={{ fontSize: 13, color: colors.mutedForeground, marginBottom: 16, lineHeight: 18 }}>{slot.locationName} · {slot.timeMarker}</Text>}

          <View style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, marginBottom: 20, flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Feather name="info" size={14} color={colors.primary} />
            <Text style={{ flex: 1, fontSize: 12, color: colors.mutedForeground, lineHeight: 17 }}>
              {t.auc_slot_info}
            </Text>
          </View>

          <Text style={{ fontSize: 11, fontWeight: "600", color: colors.mutedForeground, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>{t.auc_price_label}</Text>
          <TextInput
            style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, fontSize: 16, color: colors.foreground, backgroundColor: colors.card, marginBottom: 16 }}
            placeholder="10.00"
            placeholderTextColor={colors.mutedForeground}
            value={priceInput}
            onChangeText={setPriceInput}
            keyboardType="decimal-pad"
            autoFocus
          />

          <Text style={{ fontSize: 11, fontWeight: "600", color: colors.mutedForeground, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>{t.auc_duration_label}</Text>
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 24 }}>
            {DURATIONS.map(d => (
              <Pressable
                key={d.value}
                style={({ pressed }) => ({ flex: 1, paddingVertical: 9, borderRadius: 10, borderWidth: 1.5, borderColor: durationInput === d.value ? "#f59e0b" : colors.border, backgroundColor: durationInput === d.value ? "#f59e0b18" : colors.card, alignItems: "center", opacity: pressed ? 0.7 : 1, cursor: "pointer" as never })}
                onPress={() => setDurationInput(d.value)}
              >
                <Text style={{ fontSize: 13, fontWeight: "700", color: durationInput === d.value ? "#f59e0b" : colors.mutedForeground }}>{d.label}</Text>
              </Pressable>
            ))}
          </View>

          <Pressable
            onPress={handleConfirm}
            disabled={submitting}
            style={({ pressed }) => ({ backgroundColor: "#f59e0b", borderRadius: 12, paddingVertical: 14, alignItems: "center", marginBottom: 10, opacity: submitting ? 0.6 : pressed ? 0.8 : 1, cursor: "pointer" as never })}
          >
            {submitting
              ? <ActivityIndicator color="#000" />
              : <Text style={{ fontSize: 16, fontWeight: "700", color: "#000" }}>{t.auc_slot_btn}</Text>}
          </Pressable>
          <Pressable onPress={onClose} style={{ alignItems: "center", padding: 10, cursor: "pointer" as never }}>
            <Text style={{ fontSize: 15, color: colors.mutedForeground }}>{t.cancel}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

/**
 * Классический новостной тикер: одна фраза из FOCUS_PROMPTS_I18N[lang] едет справа
 * налево, полностью уходит за левый край, затем появляется следующая — и так по кругу.
 * Язык подхватывается автоматически из контекста. Чисто визуальный компонент.
 */
function FocusTicker({ accentColor }: { accentColor: string }) {
  const { lang }               = useLanguage();
  const prompts                = FOCUS_PROMPTS_I18N[lang] ?? FOCUS_PROMPTS_I18N["ru"];
  const { width: screenWidth } = useWindowDimensions();
  const [index, setIndex]      = useState(0);
  const indexRef               = useRef(0);
  const translateX             = useRef(new Animated.Value(screenWidth)).current;
  const activeAnim             = useRef<Animated.CompositeAnimation | null>(null);

  const runTicker = useCallback(() => {
    translateX.setValue(screenWidth);
    const anim = Animated.timing(translateX, {
      toValue:         -screenWidth,
      duration:        9000,
      easing:          Easing.linear,
      useNativeDriver: true,
    });
    activeAnim.current = anim;
    anim.start(({ finished }) => {
      if (!finished) return;
      indexRef.current = (indexRef.current + 1) % prompts.length;
      setIndex(indexRef.current);
    });
  }, [screenWidth, translateX, prompts.length]);

  useEffect(() => {
    runTicker();
    return () => { activeAnim.current?.stop(); };
  }, [index, runTicker]);

  return (
    <View
      style={{ marginBottom: 10, height: 36, overflow: "hidden", borderRadius: 10,
               backgroundColor: accentColor + "14", borderWidth: 1,
               borderColor: accentColor + "28", justifyContent: "center" }}
      pointerEvents="none"
    >
      <Animated.Text
        style={{
          fontSize: 13, color: accentColor, fontWeight: "500",
          paddingHorizontal: 12, transform: [{ translateX }],
        }}
      >
        {prompts[index]}
      </Animated.Text>
    </View>
  );
}

type ZoomLevel = 1 | 2 | 3 | 4 | 5;

interface OccupiedEntry {
  timelineCoord: string;
  citizenId: number;
}

function padYear(y: number) { return String(y).padStart(4, "0"); }
function pad2(n: number) { return String(n).padStart(2, "0"); }
function makeCoord(year: number, month: number, day: number, hour: number, minute: number) {
  return `${padYear(year)}${pad2(month)}${pad2(day)}${pad2(hour)}${pad2(minute)}`;
}
function daysInMonth(year: number, month: number) { return new Date(year, month, 0).getDate(); }

function getMonthNames(lang: string): string[] {
  try {
    return Array.from({ length: 12 }, (_, i) =>
      new Intl.DateTimeFormat(lang, { month: "short" }).format(new Date(2000, i, 1))
    );
  } catch {
    return ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  }
}

export default function TimelineScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const { citizen, authHeaders } = useCitizen();
  const { t, lang } = useLanguage();
  const qc = useQueryClient();

  const MONTH_NAMES = getMonthNames(lang);

  const [zoom, setZoom] = useState<ZoomLevel>(1);
  const [selectedCentury, setSelectedCentury] = useState<number>(21);
  const [selectedYear, setSelectedYear] = useState<number>(2026);
  const [selectedMonth, setSelectedMonth] = useState<number>(1);
  const [selectedDay, setSelectedDay] = useState<number>(1);
  const [selectedHour, setSelectedHour] = useState<number>(0);
  const [stoppedTimeCoord, setStoppedTimeCoord] = useState<string | null>(null);
  const [stopTimeNotice, setStopTimeNotice] = useState("");
  const minuteScrollRef = useRef<ScrollView>(null);
  const [occupied, setOccupied] = useState<OccupiedEntry[]>([]);
  const [loadingOccupied, setLoadingOccupied] = useState(false);
  const [anchoring, setAnchoring] = useState<string | null>(null);
  const [confirmCoord, setConfirmCoord] = useState<string | null>(null);
  const [anchorResult, setAnchorResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [jumpYear, setJumpYear] = useState("");
  const [jumpMonth, setJumpMonth] = useState("");
  const [jumpDay, setJumpDay] = useState("");
  const [showMyAnchors, setShowMyAnchors] = useState(false);
  const [selectedAnchor, setSelectedAnchor] = useState<{ timelineCoord: string; status: string; createdAt: string; capsuleText: string | null; mediaUrl: string | null; mediaType: string | null } | null>(null);
  const [showAnchorActions, setShowAnchorActions] = useState(false);
  const [showCapsule, setShowCapsule] = useState(false);
  const [showCapsuleView, setShowCapsuleView] = useState(false);
  const [capsuleText, setCapsuleText] = useState("");
  const [capsuleSaving, setCapsuleSaving] = useState(false);
  // ── Capsule media state ───────────────────────────────────────────────────────
  const [capsuleMedia, setCapsuleMedia] = useState<{
    uri: string;       // local file URI (new) or full server URL (existing)
    relPath: string | null; // server relative path; null = needs upload
    type: "image" | "audio" | "video" | "document";
    name: string;
    mimeType?: string; // actual MIME from picker
    durationSeconds?: number | null;
    durationUnverified?: boolean;
  } | null>(null);
  const [capsuleMediaUploading, setCapsuleMediaUploading] = useState(false);
  const [isPickingMedia, setIsPickingMedia] = useState(false);
  const [showStateProperty, setShowStateProperty] = useState(false);
  const [showAnchorAuction, setShowAnchorAuction] = useState(false);

  // ── Slot (Chronopedia) state ──────────────────────────────────────────────────
  const [myTimeTab, setMyTimeTab]             = useState<"anchors" | "slots">("anchors");
  const [selectedSlot, setSelectedSlot]       = useState<MyOwnedSlot | null>(null);
  const [showSlotActions, setShowSlotActions]  = useState(false);
  const [showAttachCapsule, setShowAttachCapsule] = useState(false);
  const [showSlotAuction, setShowSlotAuction] = useState(false);

  const router = useRouter();

  // ── Anchor auction mutation ──────────────────────────────────────────────────
  // ── Capsule media helpers ─────────────────────────────────────────────────────

  /** Returns duration in seconds, or null if it can't be determined. */
  const getMediaDurationSeconds = async (uri: string, type: "audio" | "video"): Promise<number | null> => {
    if (Platform.OS === "web") {
      // onloadedmetadata may never fire for unsupported codecs — race with a 5 s timeout
      // so the spinner doesn't hang forever and finally{} always runs.
      const detect = new Promise<number | null>((resolve) => {
        const el: HTMLMediaElement = type === "audio"
          ? new window.Audio()
          : document.createElement("video");
        el.preload = "metadata";
        el.onloadedmetadata = () => resolve(Number.isFinite(el.duration) && el.duration > 0 ? el.duration : null);
        el.onerror = () => resolve(null);
        el.src = uri;
      });
      const timeout = new Promise<number | null>((resolve) =>
        setTimeout(() => resolve(null), 5000),
      );
      return Promise.race([detect, timeout]);
    } else {
      try {
        const { sound, status } = await Audio.Sound.createAsync(
          { uri },
          { shouldPlay: false }
        );
        await sound.unloadAsync();
        if (status.isLoaded && typeof status.durationMillis === "number" && Number.isFinite(status.durationMillis) && status.durationMillis > 0) {
          return status.durationMillis / 1000;
        }
        return null;
      } catch {
        return null;
      }
    }
  };

  /** Universal file picker — like Telegram/WhatsApp attach button.
   *  Opens system file browser; detects type from MIME automatically. */
  const pickFile = async () => {
    console.log("[Picker Start] universal");
    setIsPickingMedia(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        copyToCacheDirectory: true,
      });
      console.log("[Picker Result]:", result.canceled ? "canceled" : "selected");
      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        const mime = asset.mimeType ?? "application/octet-stream";
        console.log("[Picker Success]:", asset.name, mime, asset.size);

        const sizeOver = !!(asset.size && asset.size > 12 * 1024 * 1024);

        // Detect media category from MIME
        let mediaType: "image" | "audio" | "video" | "document" = "document";
        if (mime.startsWith("image/")) mediaType = "image";
        else if (mime.startsWith("audio/")) mediaType = "audio";
        else if (mime.startsWith("video/")) mediaType = "video";

        // Duration guard for audio/video (≤60 s)
        let durationOver = false;
        let durationUnverified = false;
        let durationSeconds: number | null = null;
        if (mediaType === "audio" || mediaType === "video") {
          const dur = await getMediaDurationSeconds(asset.uri, mediaType);
          durationSeconds = dur;
          console.log("[Picker Duration]:", dur);
          durationUnverified = dur === null;
          if (dur !== null && dur > 60) durationOver = true;
        }

        if (sizeOver || durationOver) {
          const msg = sizeOver && durationOver
            ? t.file_limit_both
            : sizeOver
              ? t.file_limit_size
              : t.file_limit_duration;
          Alert.alert(t.file_limit_title, msg);
          return;
        }

        setCapsuleMedia({ uri: asset.uri, relPath: null, type: mediaType, name: asset.name, mimeType: mime, durationSeconds, durationUnverified });
      } else {
        console.log("[Picker] Canceled or no asset returned");
      }
    } catch (err) {
      console.error("[Picker Error]:", err);
      Alert.alert(t.tl_picker_err, err instanceof Error ? err.message : JSON.stringify(err));
    } finally {
      setIsPickingMedia(false);
    }
  };

  const uploadCapsuleMedia = async (
    media: { uri: string; type: "image" | "audio" | "video" | "document"; name: string; mimeType?: string },
    timelineCoord: string,
  ): Promise<{ url: string; mediaType: "image" | "audio" | "video" | "document" }> => {
    const formData = new FormData();
    if (Platform.OS === "web") {
      const blobRes = await fetch(media.uri);
      const blob = await blobRes.blob();
      formData.append("file", blob, media.name);
    } else {
      // Use actual MIME from picker; fall back per type so the server sees a useful Content-Type
      const fallbackMime =
        media.type === "image" ? "image/jpeg" :
        media.type === "audio" ? "audio/mpeg" :
        media.type === "video" ? "video/mp4" :
        "application/octet-stream";
      const mime = media.mimeType ?? fallbackMime;
      formData.append("file", { uri: media.uri, type: mime, name: media.name } as unknown as Blob);
    }
    // timelineCoord lets the server verify anchor ownership before accepting the file
    formData.append("timelineCoord", timelineCoord);
    const res = await fetch(`${BASE_URL}/api/timeline/capsule/upload`, {
      method: "POST",
      headers: { ...authHeaders }, // Bearer token for requireAuth
      body: formData,
    });
    const data = await res.json() as { url?: string; mediaType?: "image" | "audio" | "video" | "document"; error?: string };
    if (!res.ok) throw new Error(data.error ?? "Ошибка загрузки файла");
    return { url: data.url!, mediaType: data.mediaType! };
  };

  const anchorAuctionMutation = useMutation({
    mutationFn: async (data: { startingPrice: number; durationHours: number }) => {
      if (!selectedAnchor) throw new Error("Нет выбранной координаты");
      const res = await fetch(`${BASE_URL}/api/auctions/anchor`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ timelineCoord: selectedAnchor.timelineCoord, startingPrice: data.startingPrice, durationHours: data.durationHours }),
      });
      const json = await res.json() as { error?: string; code?: string; id?: number };
      if (!res.ok) {
        if (json.code === "CENTURY_STATE_PROPERTY") {
          setShowAnchorAuction(false);
          setShowAnchorActions(false);
          setTimeout(() => setShowStateProperty(true), 350);
          throw new Error(json.error ?? "Государственная собственность");
        }
        throw new Error(json.error ?? "Ошибка при создании аукциона");
      }
      return json;
    },
    onSuccess: () => {
      setShowAnchorAuction(false);
      setShowAnchorActions(false);
      qc.invalidateQueries({ queryKey: ["myAnchors", citizen?.id] });
      qc.invalidateQueries({ queryKey: ["auctions"] });
      void refetchMyAnchors();
      Alert.alert("✅", t.auc_anchor_ok);
    },
    onError: (e: Error) => {
      if (!e.message.includes("Государственная собственность")) {
        Alert.alert(t.error, e.message);
      }
    },
  });

  const { data: myAnchors = [], refetch: refetchMyAnchors } = useQuery<
    { timelineCoord: string; status: string; createdAt: string; capsuleText: string | null; mediaUrl: string | null; mediaType: string | null }[]
  >({
    queryKey: ["myAnchors", citizen?.id],
    queryFn: async () => {
      if (!citizen) return [];
      const res = await fetch(`${BASE_URL}/api/timeline/my-anchors`, { headers: { ...authHeaders } });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!citizen,
  });

  // ── My chronopedia slots query ────────────────────────────────────────────────
  const { data: mySlotsData, refetch: refetchMySlots } = useQuery<{ slots: MyOwnedSlot[] }>({
    queryKey: ["mySlots", citizen?.id],
    queryFn: async () => {
      if (!citizen) return { slots: [] };
      const res = await fetch(`${BASE_URL}/api/chronopedia/my-slots?citizenId=${citizen.id}`);
      if (!res.ok) return { slots: [] };
      return res.json() as Promise<{ slots: MyOwnedSlot[] }>;
    },
    enabled: !!citizen,
  });
  const mySlots = mySlotsData?.slots ?? [];

  // ── Slot auction mutation (HISTORICAL_SLOT) ────────────────────────────────────
  const slotAuctionMutation = useMutation({
    mutationFn: async (data: { startingPrice: number; durationHours: number }) => {
      if (!selectedSlot || !citizen) throw new Error("Нет выбранного События");
      const res = await fetch(`${BASE_URL}/api/auctions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({
          assetType: "HISTORICAL_SLOT",
          slotId: selectedSlot.id,
          startingPrice: data.startingPrice,
          durationHours: data.durationHours,
        }),
      });
      const json = await res.json() as { error?: string; id?: number };
      if (!res.ok) throw new Error(json.error ?? "Ошибка при создании аукциона");
      return json;
    },
    onSuccess: () => {
      setShowSlotAuction(false);
      setShowSlotActions(false);
      qc.invalidateQueries({ queryKey: ["mySlots", citizen?.id] });
      qc.invalidateQueries({ queryKey: ["auctions"] });
      void refetchMySlots();
      Alert.alert("🔥", t.auc_slot_ok);
    },
    onError: (e: Error) => Alert.alert(t.error, e.message),
  });

  const fetchOccupied = useCallback(async (year: number, month?: number, day?: number) => {
    setLoadingOccupied(true);
    try {
      let url = `${BASE_URL}/api/timeline/occupied?year=${padYear(year)}`;
      if (month) url += `&month=${pad2(month)}`;
      if (day) url += `&day=${pad2(day)}`;
      const res = await fetch(url);
      if (res.ok) setOccupied((await res.json()) as OccupiedEntry[]);
    } catch {} finally { setLoadingOccupied(false); }
  }, []);

  useEffect(() => {
    if (zoom === 3) fetchOccupied(selectedYear, selectedMonth);
    if (zoom === 4) fetchOccupied(selectedYear, selectedMonth, selectedDay);
    if (zoom === 5) fetchOccupied(selectedYear, selectedMonth, selectedDay);
  }, [zoom, selectedYear, selectedMonth, selectedDay, fetchOccupied]);

  useEffect(() => {
    if (!stopTimeNotice) return;
    const timeout = setTimeout(() => setStopTimeNotice(""), 3000);
    return () => clearTimeout(timeout);
  }, [stopTimeNotice]);

  useEffect(() => {
    if (zoom !== 5 || !stoppedTimeCoord) return;
    const minute = Number(stoppedTimeCoord.slice(10, 12));
    const row = Math.floor(minute / 7);
    const cellSize = Math.max(40, (screenWidth - 24) / 7);
    const scrollY = Math.max(0, (row - 1) * cellSize);
    const frame = requestAnimationFrame(() => {
      minuteScrollRef.current?.scrollTo({ y: scrollY, animated: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [zoom, stoppedTimeCoord, screenWidth]);

  const doAnchor = useCallback(async (coord: string) => {
    if (!citizen) { setAnchorResult({ ok: false, msg: t.citizen_not_found }); return; }
    setConfirmCoord(null);
    setAnchoring(coord);
    setAnchorResult(null);
    try {
      const res = await fetch(`${BASE_URL}/api/timeline/anchor`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ citizenId: citizen.id, timelineCoord: coord }),
      });
      const data = await res.json() as { error?: string; newBalance?: number };
      if (!res.ok) {
        setAnchorResult({ ok: false, msg: data.error ?? t.connection_error });
      } else {
        setAnchorResult({ ok: true, msg: `✓ ${data.newBalance} Д` });
        await fetchOccupied(selectedYear, selectedMonth, selectedDay);
        void refetchMyAnchors();
      }
    } catch {
      setAnchorResult({ ok: false, msg: t.connection_error });
    } finally {
      setAnchoring(null);
    }
  }, [citizen, selectedYear, selectedMonth, selectedDay, fetchOccupied, t]);

  const jumpToDate = useCallback(() => {
    const y = parseInt(jumpYear, 10);
    const m = parseInt(jumpMonth || "1", 10);
    const hasDay = jumpDay.trim().length > 0;
    const d = parseInt(jumpDay || "1", 10);
    if (!y || y < 1 || y > 9999) { setAnchorResult({ ok: false, msg: "1–9999" }); return; }
    setSelectedCentury(Math.ceil(y / 100));
    setSelectedYear(y);
    setSelectedMonth(Math.min(Math.max(m, 1), 12));
    setSelectedDay(Math.min(Math.max(d, 1), daysInMonth(y, m)));
    setZoom(hasDay ? 4 : 3);
  }, [jumpYear, jumpMonth, jumpDay]);

  const selectTimelineTimestamp = useCallback((timestamp: Date) => {
    const minuteTimestamp = new Date(
      timestamp.getFullYear(),
      timestamp.getMonth(),
      timestamp.getDate(),
      timestamp.getHours(),
      timestamp.getMinutes(),
    );
    const coord = makeCoord(
      minuteTimestamp.getFullYear(),
      minuteTimestamp.getMonth() + 1,
      minuteTimestamp.getDate(),
      minuteTimestamp.getHours(),
      minuteTimestamp.getMinutes(),
    );
    setSelectedCentury(Math.ceil(minuteTimestamp.getFullYear() / 100));
    setSelectedYear(minuteTimestamp.getFullYear());
    setSelectedMonth(minuteTimestamp.getMonth() + 1);
    setSelectedDay(minuteTimestamp.getDate());
    setSelectedHour(minuteTimestamp.getHours());
    setStoppedTimeCoord(coord);
    setConfirmCoord(null);
    setAnchorResult(null);
    setZoom(5);
    const formatted = `${pad2(minuteTimestamp.getDate())}.${pad2(minuteTimestamp.getMonth() + 1)}.${minuteTimestamp.getFullYear()} ${pad2(minuteTimestamp.getHours())}:${pad2(minuteTimestamp.getMinutes())}`;
    setStopTimeNotice(lang === "ru" ? `Мгновение зафиксировано: ${formatted}` : `Time selected: ${formatted}`);
  }, [lang]);

  const styles = getStyles(colors);
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const getBreadcrumb = () => {
    if (zoom === 1) return t.tab_timeline;
    if (zoom === 2) return `${selectedCentury}`;
    if (zoom === 3) return `${selectedYear} — ${MONTH_NAMES[selectedMonth - 1]}`;
    if (zoom === 4) return `${pad2(selectedDay)}.${pad2(selectedMonth)}.${selectedYear}`;
    return `${pad2(selectedDay)}.${pad2(selectedMonth)}.${selectedYear} ${pad2(selectedHour)}:__`;
  };

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          {zoom > 1 && (
            <TouchableOpacity style={styles.backBtn} onPress={() => setZoom((z) => (z - 1) as ZoomLevel)}>
              <Feather name="arrow-left" size={18} color={colors.primary} />
            </TouchableOpacity>
          )}
          <LogoBrand size={24} />
          <Text style={styles.headerTitle}>{t.tab_timeline.toUpperCase()}</Text>
          <Text style={styles.breadcrumb}>{getBreadcrumb()}</Text>
          {citizen && (
            <TouchableOpacity
              style={[styles.myAnchorsBtn, { borderColor: colors.primary + "55", backgroundColor: colors.card }]}
              onPress={() => setShowMyAnchors(true)}
            >
              <Feather name="map-pin" size={13} color={colors.primary} />
              {myAnchors.length > 0 && (
                <Text style={[styles.myAnchorsBadge, { color: colors.primary }]}>{myAnchors.length}</Text>
              )}
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.jumpRow}>
          <TextInput testID="input-timeline-jump-year" style={styles.jumpInput} placeholder={t.tl_year_ph} placeholderTextColor={colors.mutedForeground} keyboardType="numeric" value={jumpYear} onChangeText={setJumpYear} maxLength={4} />
          <TextInput testID="input-timeline-jump-month" style={styles.jumpInput} placeholder={t.tl_month_ph} placeholderTextColor={colors.mutedForeground} keyboardType="numeric" value={jumpMonth} onChangeText={setJumpMonth} maxLength={2} />
          <TextInput testID="input-timeline-jump-day" style={styles.jumpInput} placeholder={t.tl_day_ph} placeholderTextColor={colors.mutedForeground} keyboardType="numeric" value={jumpDay} onChangeText={setJumpDay} maxLength={2} />
          <TouchableOpacity testID="button-timeline-jump" style={styles.jumpBtn} onPress={jumpToDate}>
            <Feather name="navigation" size={14} color={colors.background} />
            <Text style={styles.jumpBtnText}>{t.tl_jump}</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.timelineActionsRow}>
          <TouchableOpacity
            testID="button-timeline-stop-time"
            accessibilityRole="button"
            accessibilityLabel={lang === "ru" ? "Остановись мгновение" : "Stop Time"}
            style={styles.stopTimeButton}
            onPress={() => selectTimelineTimestamp(new Date())}
          >
            <Feather name="clock" size={15} color={colors.background} />
            <Text style={styles.stopTimeButtonText}>{lang === "ru" ? "Остановись мгновение" : "Stop Time"}</Text>
          </TouchableOpacity>
          {stopTimeNotice ? <Text accessibilityRole="alert" style={styles.stopTimeNotice}>{stopTimeNotice}</Text> : null}
        </View>
      </View>

      {loadingOccupied && (
        <View style={styles.loadingBar}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={styles.loadingText}>{t.loading}</Text>
        </View>
      )}

      {zoom === 1 && (
        <FlatList
          data={Array.from({ length: 100 }, (_, i) => i + 1)}
          keyExtractor={(c) => String(c)}
          numColumns={5}
          contentContainerStyle={styles.gridContainer}
          renderItem={({ item: c }) => (
            <TouchableOpacity style={[styles.gridCell, styles.centuryCell]} onPress={() => { setSelectedCentury(c); setZoom(2); }}>
              <Text style={styles.centuryCellText}>{c}</Text>
              <Text style={styles.centuryYearHint}>{(c - 1) * 100 + 1}–{c * 100}</Text>
            </TouchableOpacity>
          )}
        />
      )}
      {zoom === 2 && (
        <FlatList
          data={Array.from({ length: 100 }, (_, i) => (selectedCentury - 1) * 100 + 1 + i).filter((y) => y <= 9999)}
          keyExtractor={(y) => String(y)}
          numColumns={5}
          contentContainerStyle={styles.gridContainer}
          renderItem={({ item: y }) => (
            <TouchableOpacity style={[styles.gridCell, styles.yearCell]} onPress={() => { setSelectedYear(y); setZoom(3); }}>
              <Text style={styles.yearCellText}>{y}</Text>
            </TouchableOpacity>
          )}
        />
      )}
      {zoom === 3 && (
        <ScrollView contentContainerStyle={styles.calendarContainer}>
          <View style={styles.monthRow}>
            {MONTH_NAMES.map((name, i) => (
              <TouchableOpacity key={i} style={[styles.monthChip, selectedMonth === i + 1 && styles.monthChipActive]} onPress={() => setSelectedMonth(i + 1)}>
                <Text style={[styles.monthChipText, selectedMonth === i + 1 && styles.monthChipTextActive]}>{name}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.daysGrid}>
            {Array.from({ length: daysInMonth(selectedYear, selectedMonth) }, (_, i) => i + 1).map((d) => {
              const prefix = `${padYear(selectedYear)}${pad2(selectedMonth)}${pad2(d)}`;
              const mine = occupied.some((o) => o.timelineCoord.startsWith(prefix) && o.citizenId === citizen?.id);
              const occ = !mine && occupied.some((o) => o.timelineCoord.startsWith(prefix));
              return (
                <TouchableOpacity key={d} style={[styles.dayCell, mine && { backgroundColor: colors.primary }, occ && { backgroundColor: "#e63946" }]} onPress={() => { setSelectedDay(d); setZoom(4); }}>
                  <Text style={[styles.dayCellText, (mine || occ) && { color: "#fff" }]}>{d}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      )}
      {zoom === 4 && (
        <ScrollView contentContainerStyle={styles.hoursContainer}>
          <Text style={styles.minuteTitle}>{pad2(selectedDay)}.{pad2(selectedMonth)}.{selectedYear} — {t.tl_choose_hour}</Text>
          <View style={styles.hoursGrid}>
            {Array.from({ length: 24 }, (_, h) => h).map((h) => {
              const prefix = `${padYear(selectedYear)}${pad2(selectedMonth)}${pad2(selectedDay)}${pad2(h)}`;
              const mine = occupied.some((o) => o.timelineCoord.startsWith(prefix) && o.citizenId === citizen?.id);
              const occ = !mine && occupied.some((o) => o.timelineCoord.startsWith(prefix));
              return (
                <TouchableOpacity
                  key={h}
                  style={[styles.hourCell, mine && { backgroundColor: colors.primary, borderColor: colors.primary }, occ && { backgroundColor: "#e63946", borderColor: "#e63946" }]}
                  onPress={() => { setSelectedHour(h); setZoom(5); }}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.hourCellText, (mine || occ) && { color: "#fff" }]}>{pad2(h)}</Text>
                  <Text style={[styles.hourCellSub, (mine || occ) && { color: "rgba(255,255,255,0.7)" }]}>:00</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      )}
      {zoom === 5 && (
        <ScrollView ref={minuteScrollRef} contentContainerStyle={styles.minuteContainer}>
          <Text style={styles.minuteTitle}>
            {pad2(selectedDay)}.{pad2(selectedMonth)}.{selectedYear} {pad2(selectedHour)}:00 — {pad2(selectedHour)}:59 — {t.tl_choose_minute}
          </Text>
          <View style={styles.minuteGrid}>
            {Array.from({ length: 60 }, (_, min) => {
              const coord = makeCoord(selectedYear, selectedMonth, selectedDay, selectedHour, min);
              const ownerId = occupied.find((o) => o.timelineCoord === coord)?.citizenId;
              const isMine = ownerId === citizen?.id;
              const isOccupied = !!ownerId && !isMine;
              const isAnchoring = anchoring === coord;
              const isPending = confirmCoord === coord;
              const isStoppedTime = stoppedTimeCoord === coord;
              return (
                <Pressable
                  key={min}
                  style={({ pressed }) => [
                    styles.minuteCell,
                    isMine && { backgroundColor: colors.primary, borderColor: colors.primary },
                    isOccupied && { backgroundColor: "#e63946", borderColor: "#e63946" },
                    isPending && { backgroundColor: colors.primary + "66", borderColor: colors.primary },
                    isStoppedTime && { borderColor: colors.primary, borderWidth: 3 },
                    pressed && !ownerId && { opacity: 0.6 },
                  ]}
                  onPress={() => {
                    if (ownerId) return;
                    // 🏛️ Block century boundary minutes
                    if (isCenturyBoundaryCoord(coord)) {
                      setShowStateProperty(true);
                      return;
                    }
                    setAnchorResult(null);
                    setConfirmCoord(coord);
                  }}
                  disabled={!!ownerId || !!anchoring}
                >
                  {isAnchoring ? (
                    <ActivityIndicator size={10} color="#fff" />
                  ) : (
                    <Text style={[styles.minuteText, (isMine || isOccupied || isPending) && { color: "#fff" }]}>
                      {pad2(min)}
                    </Text>
                  )}
                </Pressable>
              );
            })}
          </View>

          {confirmCoord && (
            <View style={styles.confirmPanel}>
              <Text style={styles.confirmTitle}>{t.tl_anchor_title}</Text>
              <Text style={styles.confirmMsg}>
                {`${confirmCoord.slice(6,8)}.${confirmCoord.slice(4,6)}.${parseInt(confirmCoord.slice(0,4),10)} ${confirmCoord.slice(8,10)}:${confirmCoord.slice(10,12)}`}
                {"\n"}{t.tl_anchor_cost}
              </Text>
              <View style={styles.confirmBtns}>
                <Pressable style={[styles.confirmBtn, styles.confirmBtnCancel]} onPress={() => setConfirmCoord(null)}>
                  <Text style={styles.confirmBtnCancelText}>{t.cancel}</Text>
                </Pressable>
                <Pressable style={[styles.confirmBtn, styles.confirmBtnOk]} onPress={() => doAnchor(confirmCoord)}>
                  <Text style={styles.confirmBtnOkText}>{t.tl_anchor_btn}</Text>
                </Pressable>
              </View>
            </View>
          )}

          {anchorResult && (
            <Pressable onPress={() => setAnchorResult(null)}>
              <View style={[styles.resultPanel, anchorResult.ok ? styles.resultOk : styles.resultErr]}>
                <Text style={styles.resultText}>{anchorResult.ok ? "✅ " : "❌ "}{anchorResult.msg}</Text>
              </View>
            </Pressable>
          )}
        </ScrollView>
      )}

      {/* My TIME Modal — tabbed: ⏱ Анкоры / 📍 Слоты */}
      <Modal visible={showMyAnchors} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowMyAnchors(false)}>
        <View style={[styles.maModal, { backgroundColor: colors.background }]}>
          {/* Header */}
          <View style={[styles.maHeader, { borderBottomColor: colors.border }]}>
            <View style={styles.maHeaderLeft}>
              <Feather name="map-pin" size={18} color={colors.primary} />
              <Text style={[styles.maHeaderTitle, { color: colors.foreground }]}>My TIME</Text>
            </View>
            <Pressable onPress={() => setShowMyAnchors(false)} style={[styles.maClose, { cursor: "pointer" as never }]}>
              <Feather name="x" size={22} color={colors.foreground} />
            </Pressable>
          </View>

          {/* Tab switcher */}
          <View style={{ flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            {([
              { key: "anchors", label: `⏱ ${t.tl_anchor_badge}`, count: myAnchors.length },
              { key: "slots",   label: `📍 ${t.tl_slot_badge}`,   count: mySlots.length   },
            ] as const).map(tab => (
              <Pressable
                key={tab.key}
                onPress={() => setMyTimeTab(tab.key)}
                style={({ pressed }) => ({ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5,
                  borderColor: myTimeTab === tab.key ? colors.primary : colors.border,
                  backgroundColor: myTimeTab === tab.key ? colors.primary + "18" : colors.card,
                  opacity: pressed ? 0.75 : 1, cursor: "pointer" as never })}
              >
                <Text style={{ fontSize: 13, fontWeight: "700", color: myTimeTab === tab.key ? colors.primary : colors.mutedForeground }}>{tab.label}</Text>
                {tab.count > 0 && (
                  <View style={{ minWidth: 18, height: 18, borderRadius: 9, backgroundColor: myTimeTab === tab.key ? colors.primary : colors.border, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 }}>
                    <Text style={{ fontSize: 10, fontWeight: "800", color: myTimeTab === tab.key ? colors.primaryForeground : colors.mutedForeground }}>{tab.count}</Text>
                  </View>
                )}
              </Pressable>
            ))}
          </View>

          {/* ── Tab: Anchors ── */}
          {myTimeTab === "anchors" && (
            myAnchors.length === 0 ? (
              <View style={styles.maEmpty}>
                <Feather name="clock" size={40} color={colors.mutedForeground} />
                <Text style={[styles.maEmptyTitle, { color: colors.foreground }]}>{t.tl_anchor_title}</Text>
                <Text style={[styles.maEmptyText, { color: colors.mutedForeground }]}>{t.tl_anchor_cost}</Text>
              </View>
            ) : (
              <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.maList} showsVerticalScrollIndicator={false}>
                {myAnchors.map((a) => {
                  const c = a.timelineCoord;
                  const label = `${c.slice(6,8)}.${c.slice(4,6)}.${parseInt(c.slice(0,4),10)}  ${c.slice(8,10)}:${c.slice(10,12)}`;
                  return (
                    <Pressable
                      key={c}
                      style={({ pressed }) => [styles.maRow, {
                        backgroundColor: colors.card,
                        borderColor: a.status === "on_auction" ? "#e6952255" : colors.border,
                        opacity: pressed ? 0.72 : 1,
                        cursor: "pointer" as never,
                      }]}
                      onPress={() => {
                        setSelectedAnchor(a);
                        if (a.capsuleText) {
                          setShowCapsuleView(true);
                        } else {
                          setShowAnchorActions(true);
                        }
                      }}
                    >
                      <View style={styles.maRowLeft}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                          <Text style={[styles.maCoordLabel, { color: colors.foreground }]}>{label}</Text>
                          {a.status === "on_auction" && (
                            <View style={{ backgroundColor: "#e6952222", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                              <Text style={{ fontSize: 10, fontWeight: "700", color: "#e69522" }}>🏷️ {t.tl_badge_on_auction}</Text>
                            </View>
                          )}
                          {isCenturyBoundaryCoord(c) && (
                            <View style={{ backgroundColor: "#f59e0b22", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                              <Text style={{ fontSize: 10, fontWeight: "700", color: "#f59e0b" }}>🏛️ {t.tl_badge_fund}</Text>
                            </View>
                          )}
                          {a.capsuleText && (
                            <View style={{ backgroundColor: "#7c3aed22", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                              <Text style={{ fontSize: 10, fontWeight: "700", color: "#7c3aed" }}>📜 {t.tl_badge_capsule}</Text>
                            </View>
                          )}
                        </View>
                        <Text style={[styles.maCoordRaw, { color: colors.mutedForeground }]}>{c}</Text>
                      </View>
                      <Feather name="chevron-right" size={20} color={colors.primary} style={{ marginLeft: 8 }} />
                    </Pressable>
                  );
                })}
              </ScrollView>
            )
          )}

          {/* ── Tab: Chronopedia Slots ── */}
          {myTimeTab === "slots" && (
            mySlots.length === 0 ? (
              <View style={styles.maEmpty}>
                <Text style={{ fontSize: 36, marginBottom: 8 }}>📍</Text>
                <Text style={[styles.maEmptyTitle, { color: colors.foreground }]}>{t.tl_slots_empty}</Text>
                <Text style={[styles.maEmptyText, { color: colors.mutedForeground }]}>{t.tl_slots_empty_sub}</Text>
              </View>
            ) : (
              <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.maList} showsVerticalScrollIndicator={false}>
                {mySlots.map((s) => (
                  <Pressable
                    key={String(s.id)}
                    style={({ pressed }) => [styles.maRow, {
                      backgroundColor: colors.card,
                      borderColor: s.isLocked ? "#f59e0b55" : s.isCapsuleSealed ? "#7c3aed55" : colors.border,
                      opacity: pressed ? 0.72 : 1,
                      cursor: "pointer" as never,
                    }]}
                    onPress={() => { setSelectedSlot(s); setShowSlotActions(true); }}
                  >
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 2 }}>
                        <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, flexShrink: 1 }} numberOfLines={1}>{s.locationName}</Text>
                        {s.isCapsuleSealed && (
                          <View style={{ backgroundColor: "#7c3aed22", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                            <Text style={{ fontSize: 10, fontWeight: "700", color: "#7c3aed" }}>{`📜 ${t.tl_badge_capsule}`}</Text>
                          </View>
                        )}
                        {s.isLocked && (
                          <View style={{ backgroundColor: "#f59e0b22", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                            <Text style={{ fontSize: 10, fontWeight: "700", color: "#f59e0b" }}>{`🔥 ${t.tl_badge_auction}`}</Text>
                          </View>
                        )}
                      </View>
                      <Text style={{ fontSize: 12, color: colors.mutedForeground }}>{s.timeMarker}</Text>
                      {s.isCapsuleSealed && s.capsuleTitle && (
                        <Text style={{ fontSize: 11, color: "#7c3aed", marginTop: 2 }} numberOfLines={1}>📜 {s.capsuleTitle}</Text>
                      )}
                      <Text style={{ fontSize: 10, color: colors.mutedForeground, marginTop: 2 }}>{s.eventCount} {t.tl_events_count}</Text>
                    </View>
                    <Feather name="chevron-right" size={20} color={colors.primary} style={{ marginLeft: 8 }} />
                  </Pressable>
                ))}
              </ScrollView>
            )
          )}
        </View>
      </Modal>

      {/* ── Anchor Action Sheet — рендерится ПОСЛЕ My TIME чтобы быть поверх него на Web ── */}
      <Modal visible={showAnchorActions} transparent animationType="slide" onRequestClose={() => setShowAnchorActions(false)}>
        <View style={styles.asOverlay}>
          {/* Фон-закрывашка — отдельный Pressable, не оборачивает sheet */}
          <Pressable style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} onPress={() => setShowAnchorActions(false)} />
          {/* Sheet — простой View, без Pressable-обёртки чтобы не поглощать клики */}
          <View style={[styles.asSheet, { backgroundColor: colors.card }]}>
            <View style={[styles.asHandle, { backgroundColor: colors.border }]} />

            {selectedAnchor && (() => {
              const c = selectedAnchor.timelineCoord;
              const label = `${c.slice(6,8)}.${c.slice(4,6)}.${parseInt(c.slice(0,4),10)}  ${c.slice(8,10)}:${c.slice(10,12)}`;
              return (
                <View style={[styles.asCoordBox, { borderColor: colors.border }]}>
                  <Feather name="map-pin" size={14} color={colors.primary} />
                  <Text style={[styles.asCoordText, { color: colors.foreground }]}>{label}</Text>
                  <Text style={[styles.asCoordRaw, { color: colors.mutedForeground }]}>{c}</Text>
                </View>
              );
            })()}

            <Pressable style={({ pressed }) => [styles.asRow, { borderBottomColor: colors.border, opacity: pressed ? 0.7 : 1, cursor: "pointer" as never }]} onPress={() => {
              if (!selectedAnchor) return;
              const c = selectedAnchor.timelineCoord;
              setSelectedYear(parseInt(c.slice(0,4),10));
              setSelectedCentury(Math.ceil(parseInt(c.slice(0,4),10)/100));
              setSelectedMonth(parseInt(c.slice(4,6),10));
              setSelectedDay(parseInt(c.slice(6,8),10));
              setSelectedHour(parseInt(c.slice(8,10),10));
              setZoom(5);
              setShowAnchorActions(false);
              setShowMyAnchors(false);
            }}>
              <View style={[styles.asIconBox, { backgroundColor: colors.primary + "22" }]}>
                <Feather name="navigation" size={18} color={colors.primary} />
              </View>
              <View style={styles.asRowText}>
                <Text style={[styles.asRowTitle, { color: colors.foreground }]}>{t.tl_go_to_minute}</Text>
                <Text style={[styles.asRowSub, { color: colors.mutedForeground }]}>{t.tl_open_timeline}</Text>
              </View>
            </Pressable>

            <Pressable style={({ pressed }) => [styles.asRow, { borderBottomColor: colors.border, opacity: pressed ? 0.7 : 1, cursor: "pointer" as never }]} onPress={() => {
              setShowAnchorActions(false);
              setTimeout(() => {
                setCapsuleText(selectedAnchor?.capsuleText ?? "");
                setCapsuleMedia(selectedAnchor?.mediaUrl ? {
                  uri: `${BASE_URL}${selectedAnchor.mediaUrl}`,
                  relPath: selectedAnchor.mediaUrl,
                  type: (selectedAnchor.mediaType as "image" | "audio" | "video" | "document") ?? "image",
                  name: selectedAnchor.mediaUrl.split("/").pop() ?? "media",
                } : null);
                setShowCapsule(true);
              }, 350);
            }}>
              <View style={[styles.asIconBox, { backgroundColor: "#7c3aed22" }]}>
                <Feather name="box" size={18} color="#7c3aed" />
              </View>
              <View style={styles.asRowText}>
                <Text style={[styles.asRowTitle, { color: colors.foreground }]}>{t.tl_create_capsule}</Text>
                <Text style={[styles.asRowSub, { color: colors.mutedForeground }]}>{t.tl_capsule_sub}</Text>
              </View>
            </Pressable>

            <Pressable style={({ pressed }) => [styles.asRow, { borderBottomColor: colors.border, opacity: pressed ? 0.7 : 1, cursor: "pointer" as never }]} onPress={() => {
              if (!selectedAnchor) return;
              if (isCenturyBoundaryCoord(selectedAnchor.timelineCoord)) {
                setShowAnchorActions(false);
                setTimeout(() => setShowStateProperty(true), 350);
                return;
              }
              if (selectedAnchor.status === "on_auction") {
                Alert.alert("🏷️", t.tl_on_auction_alert);
                return;
              }
              setShowAnchorActions(false);
              setTimeout(() => setShowAnchorAuction(true), 350);
            }}>
              <View style={[styles.asIconBox, { backgroundColor: "#e6952222" }]}>
                <Feather name="tag" size={18} color="#e69522" />
              </View>
              <View style={styles.asRowText}>
                <Text style={[styles.asRowTitle, { color: colors.foreground }]}>{t.tl_to_auction}</Text>
                <Text style={[styles.asRowSub, { color: colors.mutedForeground }]}>{t.tl_to_auction_sub}</Text>
              </View>
              {selectedAnchor?.status === "on_auction" && (
                <View style={[styles.asSoon, { backgroundColor: "#e6952222" }]}>
                  <Text style={[styles.asSoonText, { color: "#e69522" }]}>{t.tl_badge_on_auction}</Text>
                </View>
              )}
            </Pressable>

            <Pressable style={({ pressed }) => [styles.asRow, { borderBottomColor: colors.border, opacity: pressed ? 0.7 : 1, cursor: "pointer" as never }]} onPress={() => Alert.alert(t.soon, t.tl_swap_free_sub)}>
              <View style={[styles.asIconBox, { backgroundColor: "#0ea5e922" }]}>
                <Feather name="refresh-cw" size={18} color="#0ea5e9" />
              </View>
              <View style={styles.asRowText}>
                <Text style={[styles.asRowTitle, { color: colors.foreground }]}>{t.tl_swap_free}</Text>
                <Text style={[styles.asRowSub, { color: colors.mutedForeground }]}>{t.tl_swap_free_sub}</Text>
              </View>
              <View style={styles.asSoon}><Text style={styles.asSoonText}>{t.soon}</Text></View>
            </Pressable>

            <Pressable style={({ pressed }) => [styles.asRow, { borderBottomColor: colors.border, opacity: pressed ? 0.7 : 1, cursor: "pointer" as never }]} onPress={() => Alert.alert(t.soon, t.tl_swap_occ_sub)}>
              <View style={[styles.asIconBox, { backgroundColor: "#e6394622" }]}>
                <Feather name="users" size={18} color="#e63946" />
              </View>
              <View style={styles.asRowText}>
                <Text style={[styles.asRowTitle, { color: colors.foreground }]}>{t.tl_swap_occ}</Text>
                <Text style={[styles.asRowSub, { color: colors.mutedForeground }]}>{t.tl_swap_occ_sub}</Text>
              </View>
              <View style={styles.asSoon}><Text style={styles.asSoonText}>{t.soon}</Text></View>
            </Pressable>

            {/* ── Moderation: Report Content / Block User ─────────────────── */}
            <View style={{ height: 1, backgroundColor: colors.border, marginHorizontal: 16, marginVertical: 4 }} />

            <Pressable
              style={({ pressed }) => [styles.asRow, { borderBottomColor: colors.border, opacity: pressed ? 0.7 : 1, cursor: "pointer" as never }]}
              onPress={() => {
                if (!selectedAnchor) return;
                const coord = selectedAnchor.timelineCoord;
                setShowAnchorActions(false);
                const sendReport = (reason: "spam" | "abuse" | "inappropriate") => {
                  fetch(`${BASE_URL}/api/moderation/report`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", ...authHeaders },
                    body: JSON.stringify({ coord, reason }),
                  }).catch(() => {});
                  Alert.alert(t.mod_report_sent, t.mod_report_thanks);
                };
                setTimeout(() => {
                  Alert.alert(t.mod_report_content, t.mod_report_reason, [
                    { text: t.mod_spam,          onPress: () => sendReport("spam") },
                    { text: t.mod_abuse,         onPress: () => sendReport("abuse") },
                    { text: t.mod_inappropriate, onPress: () => sendReport("inappropriate") },
                    { text: t.cancel, style: "cancel" },
                  ]);
                }, 350);
              }}
            >
              <View style={[styles.asIconBox, { backgroundColor: "#ef444418" }]}>
                <Feather name="flag" size={18} color="#ef4444" />
              </View>
              <View style={styles.asRowText}>
                <Text style={[styles.asRowTitle, { color: "#ef4444" }]}>{t.mod_report_content}</Text>
              </View>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.asRow, { borderBottomColor: colors.border, opacity: pressed ? 0.7 : 1, cursor: "pointer" as never }]}
              onPress={() => {
                if (!selectedAnchor) return;
                const coord = selectedAnchor.timelineCoord;
                setShowAnchorActions(false);
                setTimeout(() => {
                  Alert.alert(t.mod_block_user, t.mod_block_confirm, [
                    { text: t.cancel, style: "cancel" },
                    {
                      text: t.mod_block_user,
                      style: "destructive",
                      onPress: () => {
                        fetch(`${BASE_URL}/api/moderation/block`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json", ...authHeaders },
                          body: JSON.stringify({ coord }),
                        }).catch(() => {});
                        Alert.alert("✓", t.mod_block_done);
                      },
                    },
                  ]);
                }, 350);
              }}
            >
              <View style={[styles.asIconBox, { backgroundColor: "#ef444418" }]}>
                <Feather name="user-x" size={18} color="#ef4444" />
              </View>
              <View style={styles.asRowText}>
                <Text style={[styles.asRowTitle, { color: "#ef4444" }]}>{t.mod_block_user}</Text>
              </View>
            </Pressable>

            <Pressable style={({ pressed }) => [styles.asCancel, { opacity: pressed ? 0.7 : 1, cursor: "pointer" as never }]} onPress={() => setShowAnchorActions(false)}>
              <Text style={[styles.asCancelText, { color: colors.mutedForeground }]}>{t.cancel}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* ── Capsule Creation Modal — рендерится после My TIME и AnchorActionsSheet ── */}
      <Modal visible={showCapsule} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowCapsule(false)}>
        <View style={[styles.capModal, { backgroundColor: colors.background }]}>
          <View style={[styles.capHeader, { borderBottomColor: colors.border }]}>
            <View style={styles.capHeaderLeft}>
              <Feather name="box" size={18} color="#7c3aed" />
              <Text style={[styles.capHeaderTitle, { color: colors.foreground }]}>{t.tl_capsule_modal_title}</Text>
            </View>
            <Pressable onPress={() => setShowCapsule(false)} style={[styles.maClose, { cursor: "pointer" as never }]}>
              <Feather name="x" size={22} color={colors.foreground} />
            </Pressable>
          </View>

          {selectedAnchor && (() => {
            const c = selectedAnchor.timelineCoord;
            const label = `${c.slice(6,8)}.${c.slice(4,6)}.${parseInt(c.slice(0,4),10)}  ${c.slice(8,10)}:${c.slice(10,12)}`;
            return (
              <View style={[styles.capCoordBadge, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Feather name="map-pin" size={12} color={colors.primary} />
                <Text style={[styles.capCoordBadgeText, { color: colors.mutedForeground }]}>{label} · {c}</Text>
              </View>
            );
          })()}

          <Text style={[styles.capLabel, { color: colors.foreground }]}>{t.tl_capsule_sub}</Text>

          {/* ── Бегущая строка смысловых фокусов — чисто визуальная ── */}
          <FocusTicker accentColor="#7c3aed" />

          <TextInput
            style={[styles.capInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
            multiline
            numberOfLines={6}
            placeholder={t.tl_capsule_sub}
            placeholderTextColor={colors.mutedForeground}
            value={capsuleText}
            onChangeText={setCapsuleText}
            maxLength={1000}
            textAlignVertical="top"
          />
          <Text style={[styles.capCount, { color: colors.mutedForeground }]}>{capsuleText.length}/1000</Text>

          {/* ── Media picker ── */}
          <View style={{ marginBottom: 16 }}>
            {capsuleMedia ? (
              <View style={{ borderRadius: 12, overflow: "hidden", borderWidth: 1, borderColor: "#7c3aed44" }}>
                {capsuleMedia.type === "image" ? (
                  <Image source={{ uri: capsuleMedia.uri }} style={{ width: "100%", height: 160, backgroundColor: colors.card }} resizeMode="cover" />
                ) : (
                  <View style={{ backgroundColor: "#7c3aed11", padding: 14, flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <Text style={{ fontSize: 24 }}>
                      {capsuleMedia.type === "audio" ? "🎤" : capsuleMedia.type === "video" ? "🎬" : "📄"}
                    </Text>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <Text style={{ flex: 1, fontSize: 13, fontWeight: "600", color: colors.foreground }} numberOfLines={1}>{capsuleMedia.name}</Text>
                        {(capsuleMedia.type === "audio" || capsuleMedia.type === "video") && capsuleMedia.durationSeconds != null && (
                          <Text style={{ flexShrink: 0, fontSize: 13, color: colors.mutedForeground }}>
                            {formatMediaDuration(capsuleMedia.durationSeconds)}
                          </Text>
                        )}
                      </View>
                      <Text style={{ fontSize: 11, color: colors.mutedForeground }}>
                        {capsuleMedia.type === "audio" ? t.tl_media_audio : capsuleMedia.type === "video" ? t.tl_media_video : t.tl_media_doc} · {t.tl_media_attached}
                      </Text>
                    </View>
                  </View>
                )}
                {capsuleMedia.durationUnverified && (
                  <View accessibilityRole="alert" style={{ padding: 12, backgroundColor: colors.card, flexDirection: "row", gap: 8 }}>
                    <Feather name="alert-triangle" size={18} color={colors.foreground} />
                    <Text style={{ flex: 1, fontSize: 13, lineHeight: 19, color: colors.foreground }}>
                      {MEDIA_DURATION_WARNING[lang]}
                    </Text>
                  </View>
                )}
                <Pressable
                  onPress={() => setCapsuleMedia(null)}
                  style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, padding: 10, backgroundColor: "#dc262611", cursor: "pointer" as never }}
                >
                  <Feather name="trash-2" size={14} color="#dc2626" />
                  <Text style={{ fontSize: 13, color: "#dc2626", fontWeight: "600" }}>{t.tl_media_remove}</Text>
                </Pressable>
              </View>
            ) : (
              <View>
                <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground, marginBottom: 8 }}>📎 {t.tl_media_label} <Text style={{ fontWeight: "400", color: colors.mutedForeground }}>{t.tl_media_limit}</Text></Text>
                <Pressable
                  onPress={pickFile}
                  disabled={isPickingMedia}
                  style={({ pressed }) => ({
                    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
                    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
                    borderRadius: 10, padding: 12,
                    opacity: (isPickingMedia || pressed) ? 0.5 : 1, cursor: "pointer" as never,
                  })}
                >
                  {isPickingMedia
                    ? <ActivityIndicator size="small" color={colors.primary} />
                    : <Text style={{ fontSize: 20 }}>📎</Text>}
                  <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground }}>
                    {isPickingMedia ? t.tl_media_picking : t.tl_media_attach}
                  </Text>
                </Pressable>
              </View>
            )}
          </View>

          <Pressable
            style={({ pressed }) => [styles.capSaveBtn, { backgroundColor: capsuleText.trim() ? "#7c3aed" : colors.border, opacity: (capsuleSaving || capsuleMediaUploading || isPickingMedia || !capsuleText.trim()) ? 0.6 : pressed ? 0.8 : 1, cursor: "pointer" as never }]}
            disabled={!capsuleText.trim() || capsuleSaving || capsuleMediaUploading || isPickingMedia}
            onPress={async () => {
              if (!citizen || !selectedAnchor || !capsuleText.trim() || isPickingMedia) return;
              setCapsuleSaving(true);
              try {
                let finalMediaUrl: string | null = null;
                let finalMediaType: string | null = null;
                if (capsuleMedia) {
                  if (capsuleMedia.relPath === null) {
                    // New file — upload first
                    setCapsuleMediaUploading(true);
                    const uploaded = await uploadCapsuleMedia(capsuleMedia, selectedAnchor.timelineCoord);
                    setCapsuleMediaUploading(false);
                    finalMediaUrl = uploaded.url;
                    finalMediaType = uploaded.mediaType;
                  } else {
                    // Existing media — keep as-is
                    finalMediaUrl = capsuleMedia.relPath;
                    finalMediaType = capsuleMedia.type;
                  }
                }
                const res = await fetch(`${BASE_URL}/api/timeline/capsule`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json", ...authHeaders },
                  body: JSON.stringify({ timelineCoord: selectedAnchor.timelineCoord, text: capsuleText.trim(), mediaUrl: finalMediaUrl, mediaType: finalMediaType }),
                });
                if (res.ok) {
                  // Update selectedAnchor immediately so CapsuleViewModal reflects the new media
                  // without waiting for refetchMyAnchors to complete (avoids stale-data race)
                  setSelectedAnchor(prev => prev ? {
                    ...prev,
                    capsuleText: capsuleText.trim(),
                    mediaUrl: finalMediaUrl,
                    mediaType: finalMediaType,
                  } : prev);
                  void refetchMyAnchors();
                  setShowCapsule(false);
                  // Re-open the view modal so the user immediately sees the saved capsule with media
                  setShowCapsuleView(true);
                  Alert.alert("✓", t.save);
                } else {
                  const d = await res.json() as { error?: string };
                  Alert.alert(t.error, d.error ?? t.connection_error);
                }
              } catch (err) {
                Alert.alert("Error", err instanceof Error ? err.message : t.connection_error);
              } finally {
                setCapsuleSaving(false);
                setCapsuleMediaUploading(false);
              }
            }}
          >
            {(capsuleSaving || capsuleMediaUploading)
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.capSaveBtnText}>{t.save}</Text>}
          </Pressable>
        </View>
      </Modal>

      {/* ── 📜 Capsule View Modal — просмотр содержимого капсулы ── */}
      <Modal visible={showCapsuleView} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowCapsuleView(false)}>
        <View style={[styles.capModal, { backgroundColor: colors.background }]}>
          {/* Шапка */}
          <View style={[styles.capHeader, { borderBottomColor: colors.border }]}>
            <View style={styles.capHeaderLeft}>
              <Text style={{ fontSize: 20 }}>📜</Text>
              <View>
                <Text style={[styles.capHeaderTitle, { color: colors.foreground }]}>{t.tl_capsule_title}</Text>
                {selectedAnchor && (() => {
                  const c = selectedAnchor.timelineCoord;
                  const label = `${c.slice(6,8)}.${c.slice(4,6)}.${parseInt(c.slice(0,4),10)} ${c.slice(8,10)}:${c.slice(10,12)}`;
                  return <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 1 }}>{label}</Text>;
                })()}
              </View>
            </View>
            <Pressable onPress={() => setShowCapsuleView(false)} style={[styles.maClose, { cursor: "pointer" as never }]}>
              <Feather name="x" size={22} color={colors.foreground} />
            </Pressable>
          </View>

          {/* Координата-бейдж */}
          {selectedAnchor && (() => {
            const c = selectedAnchor.timelineCoord;
            return (
              <View style={[styles.capCoordBadge, { backgroundColor: colors.card, borderColor: "#7c3aed44" }]}>
                <Feather name="map-pin" size={12} color="#7c3aed" />
                <Text style={[styles.capCoordBadgeText, { color: colors.mutedForeground }]}>{c}</Text>
                {selectedAnchor.status === "on_auction" && (
                  <View style={{ marginLeft: "auto" as never, backgroundColor: "#e6952222", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                    <Text style={{ fontSize: 10, fontWeight: "700", color: "#e69522" }}>🏷️ {t.tl_badge_on_auction}</Text>
                  </View>
                )}
              </View>
            );
          })()}

          {/* Тело капсулы */}
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 4, paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
            {/* ── Медиавложение ── */}
            {selectedAnchor?.mediaUrl && (
              <View style={{ marginBottom: 16 }}>
                {selectedAnchor.mediaType === "image" ? (
                  <Image
                    source={{ uri: `${BASE_URL}${selectedAnchor.mediaUrl!.startsWith("/uploads/") ? `/api${selectedAnchor.mediaUrl}` : selectedAnchor.mediaUrl}` }}
                    style={{ width: "100%", height: 200, borderRadius: 14 }}
                    resizeMode="cover"
                  />
                ) : selectedAnchor.mediaType === "document" ? (
                  <Pressable
                    onPress={() => {
                      const raw = selectedAnchor.mediaUrl!;
                      const url = `${BASE_URL}${raw.startsWith("/uploads/") ? `/api${raw}` : raw}`;
                      void Linking.openURL(url);
                    }}
                    style={({ pressed }) => ({
                      flexDirection: "row", alignItems: "center", gap: 12,
                      backgroundColor: "#7c3aed11", borderWidth: 1, borderColor: "#7c3aed33",
                      borderRadius: 14, padding: 16, opacity: pressed ? 0.7 : 1, cursor: "pointer" as never,
                    })}
                  >
                    <Text style={{ fontSize: 32 }}>📄</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground }} numberOfLines={2}>
                        {selectedAnchor.mediaUrl!.split("/").pop() ?? t.tl_media_doc}
                      </Text>
                      <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 2 }}>{t.tl_capsule_tap_open}</Text>
                    </View>
                    <Feather name="external-link" size={20} color="#7c3aed" />
                  </Pressable>
                ) : (
                  <CapsuleMediaPlayer
                    mediaUrl={selectedAnchor.mediaUrl!}
                    mediaType={selectedAnchor.mediaType as "audio" | "video"}
                    baseUrl={BASE_URL}
                    colors={colors}
                  />
                )}
              </View>
            )}

            <View style={{ backgroundColor: "#7c3aed11", borderWidth: 1, borderColor: "#7c3aed33", borderRadius: 14, padding: 18, marginBottom: 20 }}>
              <Text style={{ fontSize: 15, lineHeight: 24, color: colors.foreground }}>
                {selectedAnchor?.capsuleText ?? ""}
              </Text>
            </View>

            {/* Кнопки действий */}
            <Pressable
              style={({ pressed }) => ({
                flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
                backgroundColor: "#7c3aed", borderRadius: 12, padding: 14, marginBottom: 10,
                opacity: pressed ? 0.8 : 1, cursor: "pointer" as never,
              })}
              onPress={() => {
                setShowCapsuleView(false);
                setTimeout(() => {
                  setCapsuleText(selectedAnchor?.capsuleText ?? "");
                  setCapsuleMedia(selectedAnchor?.mediaUrl ? {
                    uri: `${BASE_URL}${selectedAnchor.mediaUrl}`,
                    relPath: selectedAnchor.mediaUrl,
                    type: (selectedAnchor.mediaType as "image" | "audio" | "video" | "document") ?? "image",
                    name: selectedAnchor.mediaUrl.split("/").pop() ?? "media",
                  } : null);
                  setShowCapsule(true);
                }, 350);
              }}
            >
              <Feather name="edit-2" size={16} color="#fff" />
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>{t.tl_capsule_edit}</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => ({
                flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
                backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
                borderRadius: 12, padding: 14, marginBottom: 10,
                opacity: pressed ? 0.7 : 1, cursor: "pointer" as never,
              })}
              onPress={() => {
                setShowCapsuleView(false);
                setTimeout(() => setShowAnchorActions(true), 350);
              }}
            >
              <Feather name="more-horizontal" size={16} color={colors.foreground} />
              <Text style={{ color: colors.foreground, fontWeight: "600", fontSize: 15 }}>{t.tl_capsule_other}</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => ({
                alignItems: "center", padding: 14,
                opacity: pressed ? 0.6 : 1, cursor: "pointer" as never,
              })}
              onPress={() => setShowCapsuleView(false)}
            >
              <Text style={{ color: colors.mutedForeground, fontSize: 15 }}>{t.cancel}</Text>
            </Pressable>
          </ScrollView>
        </View>
      </Modal>

      {/* 🏛️ State Property Modal */}
      <StatePropertyModal
        visible={showStateProperty}
        onClose={() => setShowStateProperty(false)}
        colors={colors}
      />

      {/* 🏷️ Time Anchor Auction Modal */}
      <TimeAnchorAuctionModal
        anchor={selectedAnchor}
        visible={showAnchorAuction}
        onClose={() => setShowAnchorAuction(false)}
        onSubmit={(data) => anchorAuctionMutation.mutate(data)}
        submitting={anchorAuctionMutation.isPending}
        colors={colors}
      />

      {/* 📍 Slot Action Modal */}
      <SlotActionModal
        slot={selectedSlot}
        visible={showSlotActions}
        onClose={() => setShowSlotActions(false)}
        onCapsule={() => setShowAttachCapsule(true)}
        onAuction={() => setShowSlotAuction(true)}
        onTimeline={() => {
          if (!selectedSlot) return;
          // Navigate to the slot's chronopedia page
          setShowMyAnchors(false);
          router.push("/(tabs)/chronopedia");
        }}
        colors={colors}
      />

      {/* 📜 Attach Capsule of Meaning Modal */}
      <AttachCapsuleModal
        slot={selectedSlot}
        visible={showAttachCapsule}
        onClose={() => setShowAttachCapsule(false)}
        onSuccess={() => { void refetchMySlots(); }}
        citizenId={citizen?.id ?? 0}
        colors={colors}
      />

      {/* 🔨 Create Slot Auction Modal */}
      <CreateSlotAuctionModal
        slot={selectedSlot}
        visible={showSlotAuction}
        onClose={() => setShowSlotAuction(false)}
        onSubmit={(data) => slotAuctionMutation.mutate(data)}
        submitting={slotAuctionMutation.isPending}
        colors={colors}
      />

      <View style={[styles.legend, { paddingBottom: insets.bottom + 80 }]}>
        {[
          { color: colors.primary, label: t.tl_anchor_btn },
          { color: "#e63946",      label: t.tl_swap_occ  },
          { color: colors.card,    label: t.tl_swap_free },
        ].map((item) => (
          <View key={item.label} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: item.color }]} />
            <Text style={styles.legendText}>{item.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function getStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { width: "100%", paddingHorizontal: 16, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
    headerRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8 },
    backBtn: { padding: 4 },
    headerTitle: { fontSize: 18, fontWeight: "700", color: colors.primary },
    breadcrumb: { fontSize: 13, color: colors.mutedForeground, marginLeft: "auto" },
    myAnchorsBtn: { borderWidth: 1, borderRadius: 16, padding: 6, flexDirection: "row", alignItems: "center", gap: 4 },
    myAnchorsBadge: { fontSize: 12, fontWeight: "700" },
    jumpRow: { width: "100%", flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6, paddingBottom: 6 },
    jumpInput: { flexGrow: 1, flexShrink: 1, flexBasis: 70, minWidth: 70, height: 34, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, color: colors.foreground, paddingHorizontal: 8, fontSize: 13, textAlign: "center" },
    jumpBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, flexShrink: 0, minWidth: 74, backgroundColor: colors.primary, paddingHorizontal: 10, borderRadius: 8, height: 34 },
    jumpBtnText: { color: colors.background, fontSize: 12, fontWeight: "600" },
    timelineActionsRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, paddingTop: 2 },
    stopTimeButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, backgroundColor: colors.primary, borderRadius: 8, minHeight: 36, paddingHorizontal: 12 },
    stopTimeButtonText: { color: colors.background, fontSize: 12, fontWeight: "700" },
    stopTimeNotice: { color: colors.primary, fontSize: 11, flexShrink: 1 },
    loadingBar: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 6 },
    loadingText: { color: colors.mutedForeground, fontSize: 12 },
    gridContainer: { padding: 12, gap: 6 },
    gridCell: { flex: 1, margin: 3, borderRadius: 8, alignItems: "center", justifyContent: "center", padding: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
    centuryCell: { minHeight: 56 },
    centuryCellText: { color: colors.foreground, fontSize: 13, fontWeight: "600" },
    centuryYearHint: { color: colors.mutedForeground, fontSize: 9, marginTop: 2 },
    yearCell: { minHeight: 44 },
    yearCellText: { color: colors.foreground, fontSize: 13, fontWeight: "500" },
    calendarContainer: { padding: 12 },
    monthRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 14 },
    monthChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
    monthChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    monthChipText: { color: colors.foreground, fontSize: 12 },
    monthChipTextActive: { color: colors.background, fontWeight: "700" },
    daysGrid: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
    dayCell: { width: 40, height: 40, borderRadius: 8, backgroundColor: colors.card, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
    dayCellText: { color: colors.foreground, fontSize: 14, fontWeight: "500" },
    minuteContainer: { paddingHorizontal: 12, paddingBottom: 16 },
    minuteTitle: { color: colors.mutedForeground, fontSize: 11, textAlign: "center", paddingVertical: 8 },
    hoursContainer: { padding: 12 },
    hoursGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    hourCell: { width: "21%", aspectRatio: 1.6, borderRadius: 10, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, alignItems: "center" as const, justifyContent: "center" as const, flexDirection: "row" as const, gap: 1 },
    hourCellText: { fontSize: 18, fontFamily: "Inter_700Bold", color: colors.foreground },
    hourCellSub: { fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 4 },
    minuteGrid: { flexDirection: "row" as const, flexWrap: "wrap" as const },
    minuteCell: { width: "14.28%", aspectRatio: 1, borderWidth: 1, borderColor: colors.border, alignItems: "center" as const, justifyContent: "center" as const, backgroundColor: colors.card },
    minuteText: { fontSize: 11, color: colors.foreground, fontWeight: "500" },
    confirmPanel: { margin: 12, backgroundColor: colors.card, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: colors.primary + "66" },
    confirmTitle: { fontSize: 15, fontWeight: "700", color: colors.foreground, marginBottom: 6 },
    confirmMsg: { fontSize: 13, color: colors.mutedForeground, marginBottom: 14, lineHeight: 19 },
    confirmBtns: { flexDirection: "row", gap: 10 },
    confirmBtn: { flex: 1, borderRadius: 10, padding: 12, alignItems: "center" },
    confirmBtnCancel: { backgroundColor: colors.muted },
    confirmBtnOk: { backgroundColor: colors.primary },
    confirmBtnCancelText: { color: colors.foreground, fontWeight: "600" },
    confirmBtnOkText: { color: colors.primaryForeground, fontWeight: "700" },
    resultPanel: { margin: 12, borderRadius: 10, padding: 14 },
    resultOk: { backgroundColor: "#dcfce7" },
    resultErr: { backgroundColor: "#fee2e2" },
    resultText: { fontSize: 13, fontWeight: "600", color: "#111" },
    asOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
    asSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 32 },
    asHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: "center", marginVertical: 12 },
    asCoordBox: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 16, marginBottom: 8, padding: 12, borderRadius: 10, borderWidth: 1 },
    asCoordText: { fontSize: 14, fontWeight: "600" },
    asCoordRaw: { fontSize: 11, marginLeft: "auto" },
    asRow: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
    asIconBox: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
    asRowText: { flex: 1 },
    asRowTitle: { fontSize: 15, fontWeight: "600" },
    asRowSub: { fontSize: 12, marginTop: 2 },
    asSoon: { backgroundColor: "#f1f5f9", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
    asSoonText: { fontSize: 10, fontWeight: "700", color: "#64748b" },
    asCancel: { alignItems: "center", padding: 16 },
    asCancelText: { fontSize: 16 },
    capModal: { flex: 1, padding: 20 },
    capHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingBottom: 16, borderBottomWidth: 1, marginBottom: 16 },
    capHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
    capHeaderTitle: { fontSize: 18, fontWeight: "700" },
    capCoordBadge: { flexDirection: "row", alignItems: "center", gap: 6, padding: 10, borderRadius: 10, borderWidth: 1, marginBottom: 16 },
    capCoordBadgeText: { fontSize: 12 },
    capLabel: { fontSize: 14, fontWeight: "600", marginBottom: 8 },
    capInput: { borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 15, minHeight: 120, marginBottom: 6 },
    capCount: { fontSize: 11, textAlign: "right", marginBottom: 16 },
    capSaveBtn: { borderRadius: 12, padding: 16, alignItems: "center" },
    capSaveBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
    maModal: { flex: 1 },
    maHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 20, borderBottomWidth: 1 },
    maHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
    maHeaderTitle: { fontSize: 18, fontWeight: "700" },
    maCount: { borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2 },
    maCountText: { color: "#fff", fontSize: 12, fontWeight: "700" },
    maClose: { padding: 4 },
    maEmpty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 40 },
    maEmptyTitle: { fontSize: 18, fontWeight: "600", textAlign: "center" },
    maEmptyText: { fontSize: 13, textAlign: "center", lineHeight: 19 },
    maList: { padding: 16, gap: 8 },
    maRow: { flexDirection: "row", alignItems: "center", borderRadius: 12, padding: 14, borderWidth: 1 },
    maRowLeft: { flex: 1 },
    maCoordLabel: { fontSize: 15, fontWeight: "600" },
    maCoordRaw: { fontSize: 11, marginTop: 2 },
    legend: { flexDirection: "row", justifyContent: "center", gap: 20, paddingTop: 8, paddingHorizontal: 16 },
    legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
    legendDot: { width: 10, height: 10, borderRadius: 5 },
    legendText: { fontSize: 11, color: colors.mutedForeground },
  });
}
