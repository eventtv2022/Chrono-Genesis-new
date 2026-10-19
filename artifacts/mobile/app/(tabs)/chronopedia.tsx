import { getBaseUrl } from "@/lib/api";
import React, { useRef, useState, useCallback, useEffect } from "react";
import { ContextualGuideModal } from "@/components/ContextualGuideModal";
import { useContextualGuide } from "@/hooks/useContextualGuide";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  ActivityIndicator,
  Modal,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Pressable,
  Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import ChronopediaMap, { type ChronopediaMapHandle } from "@/components/ChronopediaMap";
import { useColors } from "@/hooks/useColors";
import { useCitizen } from "@/context/CitizenContext";
import { useLanguage } from "@/context/LanguageContext";
import { LogoBrand } from "@/components/LogoBrand";
// @ts-expect-error — no types for this package
import { OpenLocationCode } from "open-location-code";

const BASE_URL = getBaseUrl();

// ── Plus Code helpers ─────────────────────────────────────────────────────────
// Reference coordinates for Famagusta / Cyprus region
const CYPRUS_LAT = 35.1147;
const CYPRUS_LNG = 33.9531;

const olc = new OpenLocationCode();

/** Extracts a Plus Code token from free-text input (e.g. "4WHF+GW5 Фамагуста"). */
function extractPlusCode(text: string): string | null {
  // Match full codes (e.g. 8G7M4WHF+GW) or short codes (e.g. 4WHF+GW5)
  const match = text.match(/([A-Z0-9]{2,8}\+[A-Z0-9]{2,})/i);
  return match ? match[1].toUpperCase() : null;
}

/** Tries to decode text as a Plus Code. Returns { lat, lng, label } or null. */
function tryDecodePlusCode(text: string): { lat: number; lng: number; label: string } | null {
  try {
    const token = extractPlusCode(text);
    if (!token) return null;
    if (!olc.isValid(token)) return null;
    let fullCode = token;
    if (olc.isShort(token)) {
      fullCode = olc.recoverNearest(token, CYPRUS_LAT, CYPRUS_LNG);
    }
    const decoded = olc.decode(fullCode) as { latitudeCenter: number; longitudeCenter: number };
    return {
      lat: decoded.latitudeCenter,
      lng: decoded.longitudeCenter,
      label: token,
    };
  } catch {
    return null;
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface ChronopediaSlot {
  id: number;
  timeMarker: string;
  placeId: string;
  geoLat: number;
  geoLng: number;
  locationName: string;
  ownerCitizenId: number | null;
  isLocked: boolean;
  createdAt: string;
  eventCount: number;
  hasMyEvent: boolean;
  isOnAuction?: boolean; // derived on client: isLocked && owner === me
}

interface ChronopediaEvent {
  id: number;
  slotId: number;
  authorId: number;
  authorName: string | null;
  authorRank: string | null;
  title: string;
  description: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface FeedEvent extends ChronopediaEvent {
  locationName: string;
  timeMarker: string;
  geoLat: number;
  geoLng: number;
}

interface PlaceResult {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function EventCard({
  event,
  myId,
  onDelete,
  colors,
}: {
  event: ChronopediaEvent;
  myId: number | undefined;
  onDelete?: (id: number) => void;
  colors: ReturnType<typeof useColors>;
}) {
  const { t } = useLanguage();
  const st = getStyles(colors);
  const isOwn = event.authorId === myId;
  const statusColor = event.status === "disputed" ? "#f59e0b" : colors.mutedForeground;

  return (
    <View style={[st.eventCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={st.eventCardHeader}>
        <View style={st.authorRow}>
          <View style={[st.authorAvatar, { backgroundColor: isOwn ? colors.primary + "33" : colors.muted }]}>
            <Feather name="user" size={13} color={isOwn ? colors.primary : colors.mutedForeground} />
          </View>
          <View>
            <Text style={[st.authorName, { color: colors.foreground }]}>
              {event.authorName ?? t.login}
            </Text>
            <Text style={[st.authorRank, { color: colors.mutedForeground }]}>
              {event.authorRank ?? t.login}
            </Text>
          </View>
        </View>
        <View style={st.eventCardActions}>
          {event.status !== "approved" && (
            <Text style={[st.statusBadge, { color: statusColor }]}>{event.status}</Text>
          )}
          {isOwn && onDelete && (
            <TouchableOpacity onPress={() => onDelete(event.id)} hitSlop={8}>
              <Feather name="trash-2" size={15} color={colors.mutedForeground} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <Text style={[st.eventTitle, { color: colors.foreground }]}>{event.title}</Text>
      <Text style={[st.eventDesc, { color: colors.mutedForeground }]}>{event.description}</Text>
      <Text style={[st.eventDate, { color: colors.mutedForeground }]}>
        {new Date(event.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
      </Text>
    </View>
  );
}

function FeedEventCard({
  event,
  onPress,
  onAddOpinion,
  colors,
}: {
  event: FeedEvent;
  onPress: () => void;
  onAddOpinion?: (slotId: number) => void;
  colors: ReturnType<typeof useColors>;
}) {
  const { t } = useLanguage();
  const st = getStyles(colors);
  return (
    <TouchableOpacity
      style={[st.feedCard, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <View style={st.feedCardTop}>
        <View style={st.feedLocation}>
          <Feather name="map-pin" size={12} color={colors.primary} />
          <Text style={[st.feedLocationText, { color: colors.primary }]} numberOfLines={1}>
            {event.locationName}
          </Text>
          <Text style={[st.feedTime, { color: colors.mutedForeground }]}>· {event.timeMarker}</Text>
        </View>
        <Text style={[st.feedAuthorRank, { color: colors.mutedForeground }]}>
          {event.authorRank ?? t.login}
        </Text>
      </View>
      <Text style={[st.feedTitle, { color: colors.foreground }]} numberOfLines={1}>{event.title}</Text>
      <Text style={[st.feedDesc, { color: colors.mutedForeground }]} numberOfLines={2}>{event.description}</Text>
      {onAddOpinion && (
        <TouchableOpacity
          style={[st.feedAddBtn, { borderColor: colors.primary + "55" }]}
          onPress={(e) => { e.stopPropagation?.(); onAddOpinion(event.slotId); }}
          hitSlop={4}
        >
          <Feather name="plus" size={12} color={colors.primary} />
          <Text style={[st.feedAddBtnText, { color: colors.primary }]}>{t.chrono_add_opinion}</Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

// ── SlotAuctionModal ──────────────────────────────────────────────────────────

interface SlotAuctionModalProps {
  slot: ChronopediaSlot;
  visible: boolean;
  onClose: () => void;
  onSubmit: (data: { startingPrice: number; durationHours: number }) => void;
  submitting: boolean;
  colors: ReturnType<typeof useColors>;
}

function SlotAuctionModal({ slot, visible, onClose, onSubmit, submitting, colors }: SlotAuctionModalProps) {
  const [priceInput, setPriceInput] = useState("1");
  const [durationInput, setDurationInput] = useState("24");

  const handleConfirm = () => {
    const price = parseFloat(priceInput);
    const hours = parseInt(durationInput, 10);
    if (isNaN(price) || price <= 0) { Alert.alert("⚠️", "Укажите стартовую цену больше 0"); return; }
    if (isNaN(hours) || hours < 1 || hours > 168) { Alert.alert("⚠️", "Длительность: от 1 до 168 часов"); return; }
    onSubmit({ startingPrice: price, durationHours: hours });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" }}>
        <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 }}>
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: "#555", alignSelf: "center", marginBottom: 16 }} />
          <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground, marginBottom: 4 }}>🔥 Выставить на аукцион</Text>
          <Text style={{ fontSize: 13, color: colors.mutedForeground, marginBottom: 20, lineHeight: 18 }}>
            {slot.locationName} · {slot.timeMarker}
          </Text>

          <View style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, marginBottom: 20, flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Feather name="info" size={14} color={colors.primary} />
            <Text style={{ flex: 1, fontSize: 12, color: colors.mutedForeground, lineHeight: 17 }}>
              Слот будет заблокирован на время аукциона. Победитель становится новым владельцем. Налог Казначейства: 2%.
            </Text>
          </View>

          <Text style={{ fontSize: 11, fontWeight: "600", color: colors.mutedForeground, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Стартовая цена (Д)</Text>
          <TextInput
            style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, fontSize: 16, color: colors.foreground, backgroundColor: colors.card, marginBottom: 14 }}
            placeholder="1.00"
            placeholderTextColor={colors.mutedForeground}
            value={priceInput}
            onChangeText={setPriceInput}
            keyboardType="decimal-pad"
            autoFocus
          />

          <Text style={{ fontSize: 11, fontWeight: "600", color: colors.mutedForeground, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Длительность (часов)</Text>
          <TextInput
            style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, fontSize: 16, color: colors.foreground, backgroundColor: colors.card, marginBottom: 24 }}
            placeholder="24"
            placeholderTextColor={colors.mutedForeground}
            value={durationInput}
            onChangeText={setDurationInput}
            keyboardType="number-pad"
          />

          <TouchableOpacity
            onPress={handleConfirm}
            disabled={submitting}
            style={{ backgroundColor: "#f59e0b", borderRadius: 12, paddingVertical: 14, alignItems: "center", marginBottom: 10, opacity: submitting ? 0.6 : 1 }}
          >
            {submitting
              ? <ActivityIndicator color="#000" />
              : <Text style={{ fontSize: 16, fontWeight: "700", color: "#000" }}>Выставить на аукцион →</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={onClose} style={{ alignItems: "center", padding: 10 }}>
            <Text style={{ fontSize: 15, color: colors.mutedForeground }}>Отмена</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ── Add / Edit Modal ──────────────────────────────────────────────────────────

interface AddModalProps {
  visible: boolean;
  mode: "slot" | "event";
  slotInfo?: { locationName: string; timeMarker: string } | null;
  pendingLat?: number | null;
  pendingLng?: number | null;
  onClose: () => void;
  onSubmit: (data: {
    locationName?: string;
    timeMarker?: string;
    placeId?: string;
    lat?: number;
    lng?: number;
    title: string;
    description: string;
  }) => void;
  saving: boolean;
  colors: ReturnType<typeof useColors>;
  placeSearch: {
    query: string;
    setQuery: (q: string) => void;
    results: PlaceResult[];
    loading: boolean;
    selected: PlaceResult | null;
    setSelected: (p: PlaceResult | null) => void;
  };
}

function AddModal({
  visible, mode, slotInfo, pendingLat, pendingLng,
  onClose, onSubmit, saving, colors, placeSearch,
}: AddModalProps) {
  const { t } = useLanguage();
  const st = getStyles(colors);
  const [locationName, setLocationName] = useState("");
  const [timeMarker, setTimeMarker] = useState(
    () => new Date().toISOString().slice(0, 10)
  );
  const [manualLat, setManualLat] = useState("");
  const [manualLng, setManualLng] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const previousPlaceQuery = useRef(placeSearch.query);

  useEffect(() => {
    if (visible) {
      setTitle("");
      setDescription("");
      if (mode === "slot") {
        setLocationName(placeSearch.selected?.name ?? "");
        setTimeMarker(new Date().toISOString().slice(0, 10));
        setManualLat(
          placeSearch.selected?.lat != null
            ? String(placeSearch.selected.lat)
            : pendingLat != null ? String(pendingLat) : "",
        );
        setManualLng(
          placeSearch.selected?.lng != null
            ? String(placeSearch.selected.lng)
            : pendingLng != null ? String(pendingLng) : "",
        );
      }
    }
  }, [visible, mode]);

  useEffect(() => {
    if (placeSearch.selected) {
      setLocationName(placeSearch.selected.name);
      setManualLat(String(placeSearch.selected.lat));
      setManualLng(String(placeSearch.selected.lng));
    }
  }, [placeSearch.selected]);

  useEffect(() => {
    if (previousPlaceQuery.current !== placeSearch.query && !placeSearch.selected && mode === "slot") {
      setManualLat("");
      setManualLng("");
    }
    previousPlaceQuery.current = placeSearch.query;
  }, [mode, placeSearch.query, placeSearch.selected]);

  // Fill coordinates from the best search match even if the user does not tap
  // a suggestion. Suggestions stay visible so another result can still be chosen.
  useEffect(() => {
    if (mode !== "slot" || placeSearch.selected || placeSearch.results.length === 0) return;
    const bestMatch = placeSearch.results[0];
    if (Number.isFinite(bestMatch.lat) && Number.isFinite(bestMatch.lng)) {
      setManualLat(String(bestMatch.lat));
      setManualLng(String(bestMatch.lng));
    }
  }, [mode, placeSearch.results, placeSearch.selected]);

  // Auto-sync location name from search query when no place is selected
  useEffect(() => {
    if (!placeSearch.selected && mode === "slot") {
      setLocationName(placeSearch.query.trim());
    }
  }, [placeSearch.query, placeSearch.selected, mode]);

  // ── Plus Code auto-detection ────────────────────────────────────────────────
  // When user types a Plus Code (e.g. "4WHF+GW5 Фамагуста") in the search field,
  // automatically decode it and fill the coordinate fields.
  useEffect(() => {
    if (mode !== "slot" || placeSearch.selected) return;
    const q = placeSearch.query;
    if (!q.includes("+")) return;
    const decoded = tryDecodePlusCode(q);
    if (!decoded) return;
    setManualLat(String(decoded.lat.toFixed(6)));
    setManualLng(String(decoded.lng.toFixed(6)));
    // Auto-set location name if user hasn't typed one separately
    if (!locationName.trim() || locationName === q.trim()) {
      setLocationName(q.trim());
    }
  }, [placeSearch.query, placeSearch.selected, mode]);

  const handleSubmit = () => {
    if (mode === "event" && !title.trim()) { Alert.alert(t.error, t.tl_enter_coords); return; }
    if (!description.trim()) { Alert.alert(t.error, t.tl_enter_coords); return; }
    if (mode === "slot" && !locationName.trim()) { Alert.alert(t.error, t.chrono_search_place); return; }
    if (mode === "slot" && !timeMarker.trim()) { Alert.alert(t.error, t.tl_code_placeholder); return; }

    const lat = parseFloat(manualLat) || 0;
    const lng = parseFloat(manualLng) || 0;

    // Require real coordinates — from map tap, place search, Plus Code, or manual entry
    if (mode === "slot" && lat === 0 && lng === 0) {
      Alert.alert(t.error, t.tl_enter_coords);
      return;
    }

    onSubmit({
      locationName: mode === "slot" ? locationName.trim() : undefined,
      timeMarker: mode === "slot" ? timeMarker.trim() : undefined,
      placeId: placeSearch.selected?.placeId,
      lat: mode === "slot" ? lat : undefined,
      lng: mode === "slot" ? lng : undefined,
      // Creating a significant event uses its description as the required API title.
      title: mode === "slot" ? description.trim().slice(0, 200) : title.trim(),
      description: description.trim(),
    });
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={[st.modalOverlay]}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <TouchableOpacity style={st.modalBackdrop} activeOpacity={1} onPress={onClose} />
        <View style={[st.modalSheet, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <View style={st.modalHandle} />
          <View style={st.modalHeader}>
            <Text style={[st.modalTitle, { color: colors.foreground }]}>
              {mode === "slot" ? `📍 ${t.chrono_new_point}` : `💬 ${t.chrono_add_opinion}`}
            </Text>
            <TouchableOpacity onPress={onClose} hitSlop={8}>
              <Feather name="x" size={22} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {mode === "event" && slotInfo && (
              <View style={[st.slotInfoBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Feather name="map-pin" size={13} color={colors.primary} />
                <Text style={[st.slotInfoText, { color: colors.foreground }]}>
                  {slotInfo.locationName} · {slotInfo.timeMarker}
                </Text>
              </View>
            )}

            {mode === "slot" && (
              <>
                <Text style={[st.fieldLabel, { color: colors.mutedForeground }]}>{t.chrono_search_place}</Text>
                <View style={[st.searchRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Feather name="search" size={16} color={colors.mutedForeground} style={{ marginRight: 8 }} />
                  <TextInput
                    style={[st.searchInput, { color: colors.foreground }]}
                    placeholder={t.chrono_search_place}
                    placeholderTextColor={colors.mutedForeground}
                    value={placeSearch.query}
                    onChangeText={placeSearch.setQuery}
                    returnKeyType="search"
                  />
                  {placeSearch.loading && <ActivityIndicator size="small" color={colors.mutedForeground} />}
                </View>
                {placeSearch.results.length > 0 && !placeSearch.selected && (
                  <View style={[st.placeResultsList, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    {placeSearch.results.map((p) => (
                      <TouchableOpacity
                        key={p.placeId}
                        style={[st.placeResult, { borderBottomColor: colors.border }]}
                        onPress={() => {
                          placeSearch.setSelected(p);
                          placeSearch.setQuery(p.name);
                          setLocationName(p.name);
                        }}
                      >
                        <Text style={[st.placeResultName, { color: colors.foreground }]}>{p.name}</Text>
                        <Text style={[st.placeResultAddr, { color: colors.mutedForeground }]} numberOfLines={1}>
                          {p.address}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                <Text style={[st.fieldLabel, { color: colors.mutedForeground }]}>{t.chrono_search_place}</Text>
                <TextInput
                  style={[st.field, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border }]}
                  placeholder={t.chrono_search_place}
                  placeholderTextColor={colors.mutedForeground}
                  value={locationName}
                  onChangeText={setLocationName}
                />

                <Text style={[st.fieldLabel, { color: colors.mutedForeground }]}>{t.tl_enter_coords}</Text>
                {manualLat && manualLng && placeSearch.query.includes("+") && tryDecodePlusCode(placeSearch.query) && (
                  <View style={[st.plusCodeBadge, { backgroundColor: colors.primary + "22", borderColor: colors.primary + "55" }]}>
                    <Feather name="check-circle" size={13} color={colors.primary} />
                    <Text style={[st.plusCodeBadgeText, { color: colors.primary }]}>
                      Plus Code: {extractPlusCode(placeSearch.query)}
                    </Text>
                  </View>
                )}
                <View style={st.coordRow}>
                  <TextInput
                    style={[st.field, st.coordField, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border }]}
                    placeholder="55.7558"
                    placeholderTextColor={colors.mutedForeground}
                    value={manualLat}
                    onChangeText={setManualLat}
                    keyboardType="numeric"
                  />
                  <TextInput
                    style={[st.field, st.coordField, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border }]}
                    placeholder="37.6173"
                    placeholderTextColor={colors.mutedForeground}
                    value={manualLng}
                    onChangeText={setManualLng}
                    keyboardType="numeric"
                  />
                </View>

                <Text style={[st.fieldLabel, { color: colors.mutedForeground }]}>{t.tl_code_placeholder}</Text>
                <TextInput
                  style={[st.field, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border }]}
                  placeholder={t.tl_code_placeholder}
                  placeholderTextColor={colors.mutedForeground}
                  value={timeMarker}
                  onChangeText={setTimeMarker}
                />
              </>
            )}

            {mode === "event" && (
              <>
                <Text style={[st.fieldLabel, { color: colors.mutedForeground }]}>{t.chrono_add_opinion}</Text>
                <TextInput
                  style={[st.field, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border }]}
                  placeholder={t.chrono_add_opinion}
                  placeholderTextColor={colors.mutedForeground}
                  value={title}
                  onChangeText={setTitle}
                  maxLength={200}
                />
              </>
            )}

            <Text style={[st.fieldLabel, { color: colors.mutedForeground }]}>{t.chrono_opinion_body}</Text>
            <TextInput
              style={[st.field, st.fieldMulti, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border }]}
              placeholder={t.chrono_opinion_body}
              placeholderTextColor={colors.mutedForeground}
              value={description}
              onChangeText={setDescription}
              multiline
              maxLength={2000}
              textAlignVertical="top"
            />

            <TouchableOpacity
              style={[st.submitBtn, { backgroundColor: colors.primary, opacity: saving ? 0.6 : 1 }]}
              onPress={handleSubmit}
              disabled={saving}
            >
              {saving
                ? <ActivityIndicator color="#fff" />
                : <Text style={st.submitBtnText}>
                    {mode === "slot" ? t.chrono_create_point : t.chrono_add_opinion}
                  </Text>
              }
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function ChronopediaScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { citizen, authHeaders } = useCitizen();
  const { t, lang } = useLanguage();
  const qc = useQueryClient();
  const st = getStyles(colors);
  const chronoGuide = useContextualGuide("chronopedia");

  const mapRef = useRef<ChronopediaMapHandle>(null);
  const [mapReady, setMapReady] = useState(false);
  const [viewMode, setViewMode] = useState<"map" | "feed">("map");
  const [selectedSlotId, setSelectedSlotId] = useState<number | null>(null);
  const [pendingLat, setPendingLat] = useState<number | null>(null);
  const [pendingLng, setPendingLng] = useState<number | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addMode, setAddMode] = useState<"slot" | "event">("slot");
  const [showSlotAuction, setShowSlotAuction] = useState(false);
  const [feedSlotInfo, setFeedSlotInfo] = useState<{ locationName: string; timeMarker: string } | null>(null);

  const [placeQuery, setPlaceQuery] = useState("");
  const [placeResults, setPlaceResults] = useState<PlaceResult[]>([]);
  const [placeLoading, setPlaceLoading] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState<PlaceResult | null>(null);

  // Google Places search with debounce
  useEffect(() => {
    if (!placeQuery.trim() || selectedPlace) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      if (!cancelled) setPlaceLoading(true);
      try {
        const res = await fetch(`${BASE_URL}/api/chronopedia/places/search?q=${encodeURIComponent(placeQuery)}`);
        if (res.ok) {
          const data = await res.json() as { places: PlaceResult[] };
          if (!cancelled) setPlaceResults(data.places ?? []);
        } else if (!cancelled) {
          setPlaceResults([]);
        }
      } catch {
        if (!cancelled) setPlaceResults([]);
      } finally {
        if (!cancelled) setPlaceLoading(false);
      }
    }, 600);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [placeQuery, selectedPlace]);

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data: slotsData, isLoading: slotsLoading } = useQuery<{ slots: ChronopediaSlot[] }>({
    queryKey: ["chronopediaSlots", citizen?.id],
    queryFn: async () => {
      const res = await fetch(
        `${BASE_URL}/api/chronopedia/slots${citizen ? `?citizenId=${citizen.id}` : ""}`
      );
      if (!res.ok) throw new Error("Error loading slots");
      return res.json();
    },
    refetchInterval: 30000,
  });
  const slots = slotsData?.slots ?? [];

  const { data: slotDetail, isLoading: detailLoading } = useQuery<{
    slot: ChronopediaSlot;
    events: ChronopediaEvent[];
  }>({
    queryKey: ["chronopediaSlot", selectedSlotId],
    queryFn: async () => {
      const res = await fetch(`${BASE_URL}/api/chronopedia/slots/${selectedSlotId}`);
      if (!res.ok) throw new Error("Error loading slot");
      return res.json();
    },
    enabled: selectedSlotId !== null,
  });

  const { data: feedData, isLoading: feedLoading } = useQuery<{ events: FeedEvent[] }>({
    queryKey: ["chronopediaFeed"],
    queryFn: async () => {
      const res = await fetch(`${BASE_URL}/api/chronopedia/feed?limit=50`);
      if (!res.ok) throw new Error("Error loading feed");
      return res.json();
    },
    enabled: viewMode === "feed",
    refetchInterval: 30000,
  });

  // ── Mutations ──────────────────────────────────────────────────────────────

  const createSlotMutation = useMutation({
    mutationFn: async (data: {
      locationName: string;
      timeMarker: string;
      placeId?: string;
      lat?: number;
      lng?: number;
      title: string;
      description: string;
    }) => {
      const rawLat = data.lat ?? selectedPlace?.lat ?? pendingLat ?? 0;
      const rawLng = data.lng ?? selectedPlace?.lng ?? pendingLng ?? 0;
      const lat = Math.max(-90, Math.min(90, rawLat));
      const lng = (((rawLng % 360) + 540) % 360) - 180;
      const res = await fetch(`${BASE_URL}/api/chronopedia/slots`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          citizenId: citizen!.id,
          geoLat: lat,
          geoLng: lng,
          locationName: data.locationName,
          placeId: data.placeId,
          timeMarker: data.timeMarker,
          title: data.title,
          description: data.description,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? "Error");
      }
      return res.json() as Promise<{ ok: boolean; slotId: number; eventId: number }>;
    },
    onSuccess: (data) => {
      setShowAddModal(false);
      setSelectedSlotId(data.slotId);
      setPendingLat(null);
      setPendingLng(null);
      setSelectedPlace(null);
      setPlaceQuery("");
      setPlaceResults([]);
      qc.invalidateQueries({ queryKey: ["chronopediaSlots"] });
      qc.invalidateQueries({ queryKey: ["chronopediaFeed"] });
    },
    onError: (e: Error) => Alert.alert("Ошибка", e.message),
  });

  const addEventMutation = useMutation({
    mutationFn: async (data: { title: string; description: string }) => {
      const res = await fetch(`${BASE_URL}/api/chronopedia/slots/${selectedSlotId}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ citizenId: citizen!.id, ...data }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? "Error");
      }
      return res.json();
    },
    onSuccess: () => {
      setShowAddModal(false);
      qc.invalidateQueries({ queryKey: ["chronopediaSlot", selectedSlotId] });
      qc.invalidateQueries({ queryKey: ["chronopediaSlots"] });
      qc.invalidateQueries({ queryKey: ["chronopediaFeed"] });
    },
    onError: (e: Error) => Alert.alert("Ошибка", e.message),
  });

  const slotAuctionMutation = useMutation({
    mutationFn: async (data: { slotId: number; startingPrice: number; durationHours: number }) => {
      const res = await fetch(`${BASE_URL}/api/auctions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ assetType: "HISTORICAL_SLOT", slotId: data.slotId, startingPrice: data.startingPrice, durationHours: data.durationHours }),
      });
      const json = await res.json() as { error?: string; id?: number };
      if (!res.ok) throw new Error(json.error ?? "Ошибка при создании аукциона");
      return json;
    },
    onSuccess: () => {
      setShowSlotAuction(false);
      qc.invalidateQueries({ queryKey: ["chronopediaSlot", selectedSlotId] });
      qc.invalidateQueries({ queryKey: ["chronopediaSlots"] });
      qc.invalidateQueries({ queryKey: ["auctions"] });
      Alert.alert("✅", "Исторический слот выставлен на аукцион");
    },
    onError: (e: Error) => Alert.alert("Ошибка", e.message),
  });

  const deleteEventMutation = useMutation({
    mutationFn: async (eventId: number) => {
      const res = await fetch(`${BASE_URL}/api/chronopedia/events/${eventId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ citizenId: citizen!.id }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? "Error");
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chronopediaSlot", selectedSlotId] });
      qc.invalidateQueries({ queryKey: ["chronopediaSlots"] });
      qc.invalidateQueries({ queryKey: ["chronopediaFeed"] });
    },
    onError: (e: Error) => Alert.alert(t.error, e.message),
  });

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleAddOpinion = () => {
    if (!citizen) { Alert.alert(t.login, t.citizen_not_found); return; }
    setAddMode("event");
    setShowAddModal(true);
  };

  const handleNewSlot = () => {
    if (!citizen) { Alert.alert(t.login, t.citizen_not_found); return; }
    chronoGuide.trigger(() => {
      setAddMode("slot");
      setShowAddModal(true);
    });
  };

  const handleModalSubmit = (data: {
    locationName?: string;
    timeMarker?: string;
    placeId?: string;
    lat?: number;
    lng?: number;
    title: string;
    description: string;
  }) => {
    if (addMode === "event" && selectedSlotId) {
      addEventMutation.mutate({ title: data.title, description: data.description });
    } else if (addMode === "slot") {
      createSlotMutation.mutate({
        locationName: data.locationName!,
        timeMarker: data.timeMarker!,
        placeId: data.placeId,
        lat: data.lat,
        lng: data.lng,
        title: data.title,
        description: data.description,
      });
    }
  };

  const handleDeleteEvent = (eventId: number) => {
    Alert.alert(t.chrono_add_opinion, "", [
      { text: t.cancel, style: "cancel" },
      { text: t.close, style: "destructive", onPress: () => deleteEventMutation.mutate(eventId) },
    ]);
  };

  const handleFeedCardPress = (event: FeedEvent) => {
    setSelectedSlotId(event.slotId);
    setFeedSlotInfo({ locationName: event.locationName, timeMarker: event.timeMarker });
    setViewMode("map");
    if (mapReady) {
      mapRef.current?.centerOn(event.geoLat, event.geoLng, 13);
    }
  };

  const handleFeedAddOpinion = useCallback((slotId: number, locationName: string, timeMarker: string) => {
    if (!citizen) { Alert.alert(t.login, t.citizen_not_found); return; }
    setSelectedSlotId(slotId);
    setFeedSlotInfo({ locationName, timeMarker });
    setAddMode("event");
    setShowAddModal(true);
  }, [citizen]);

  const openInGoogleMaps = useCallback((slot: ChronopediaSlot) => {
    const isReal = slot.placeId && !slot.placeId.startsWith("syn_");
    const url = isReal
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(slot.locationName)}&query_place_id=${slot.placeId}`
      : `https://www.google.com/maps/search/?api=1&query=${slot.geoLat},${slot.geoLng}`;
    Linking.openURL(url).catch(() => Alert.alert(t.error, "Google Maps"));
  }, []);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const isSaving = createSlotMutation.isPending || addEventMutation.isPending;

  return (
    <View style={[st.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[st.header, { paddingTop: topPad + 8, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <LogoBrand size={20} />
        <Text style={[st.headerTitle, { color: colors.foreground }]}>{t.tab_chronopedia}</Text>
        <View style={{ width: 44 }} />
      </View>

      {/* View mode toggle */}
      <View style={[st.toggleRow, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {(["map", "feed"] as const).map((mode) => (
          <TouchableOpacity
            key={mode}
            style={[
              st.toggleBtn,
              viewMode === mode && { backgroundColor: colors.primary + "22", borderColor: colors.primary },
            ]}
            onPress={() => setViewMode(mode)}
          >
            <Feather
              name={mode === "map" ? "map" : "list"}
              size={15}
              color={viewMode === mode ? colors.primary : colors.mutedForeground}
            />
            <Text style={[st.toggleBtnText, { color: viewMode === mode ? colors.primary : colors.mutedForeground }]}>
              {mode === "map" ? t.tl_open_timeline : t.stats_recent_tx}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Main content */}
      {viewMode === "map" ? (
        <View style={st.mapContainer}>
          {/* Leaflet map */}
          <View style={st.mapWrapper}>
            <ChronopediaMap
              ref={mapRef}
              slots={slots}
              myId={citizen?.id}
              selectedSlotId={selectedSlotId}
              pendingLat={pendingLat}
              pendingLng={pendingLng}
              lang={lang}
              loadingText={t.loading}
              onReady={() => setMapReady(true)}
              onSlotClick={(slotId) => {
                setSelectedSlotId(slotId);
                setPendingLat(null);
                setPendingLng(null);
              }}
              onMapClick={(lat, lng) => {
                setSelectedSlotId(null);
                setPendingLat(lat);
                setPendingLng(lng);
              }}
              style={st.webView}
            />
            {slotsLoading && mapReady && (
              <View style={[st.mapLoadingOverlay]}>
                <ActivityIndicator color={colors.primary} size="small" />
              </View>
            )}
          </View>

          {/* Bottom panel */}
          <View style={[st.panel, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
            {selectedSlotId && slotDetail ? (
              <>
                <View style={st.panelHeader}>
                  <View style={st.panelTitleRow}>
                    <Feather name="map-pin" size={14} color={colors.primary} />
                    <Text style={[st.panelTitle, { color: colors.foreground }]} numberOfLines={1}>
                      {slotDetail.slot.locationName}
                    </Text>
                    {slotDetail.slot.isLocked && (
                      <View style={{ backgroundColor: "#f59e0b22", borderColor: "#f59e0b55", borderWidth: 1, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 }}>
                        <Text style={{ fontSize: 10, fontWeight: "700", color: "#f59e0b" }}>🔥 На аукционе</Text>
                      </View>
                    )}
                  </View>
                  <Text style={[st.panelTime, { color: colors.mutedForeground }]}>
                    {slotDetail.slot.timeMarker} · {slotDetail.events.length}
                  </Text>
                </View>

                {detailLoading ? (
                  <ActivityIndicator color={colors.primary} style={{ marginTop: 12 }} />
                ) : (
                  <FlatList
                    data={slotDetail.events}
                    keyExtractor={(e) => String(e.id)}
                    renderItem={({ item }) => (
                      <EventCard
                        event={item}
                        myId={citizen?.id}
                        onDelete={handleDeleteEvent}
                        colors={colors}
                      />
                    )}
                    contentContainerStyle={{ gap: 8 }}
                    showsVerticalScrollIndicator={false}
                    ListEmptyComponent={
                      <Text style={[st.emptyHint, { color: colors.mutedForeground }]}>
                        {t.emb_empty}
                      </Text>
                    }
                    style={st.eventsList}
                  />
                )}

                <View style={st.panelActions}>
                  <TouchableOpacity
                    style={[st.addOpinionBtn, { flex: 1, backgroundColor: colors.primary + "18", borderColor: colors.primary + "55" }]}
                    onPress={handleAddOpinion}
                  >
                    <Feather name="plus" size={15} color={colors.primary} />
                    <Text style={[st.addOpinionBtnText, { color: colors.primary }]}>{t.chrono_add_opinion}</Text>
                  </TouchableOpacity>
                  {/* Auction button — only for owner, only when not locked */}
                  {citizen && slotDetail.slot.ownerCitizenId === citizen.id && !slotDetail.slot.isLocked && (
                    <TouchableOpacity
                      style={[st.mapsBtn, { borderColor: "#f59e0b55", backgroundColor: "#f59e0b18" }]}
                      onPress={() => setShowSlotAuction(true)}
                    >
                      <Text style={{ fontSize: 14 }}>🔥</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={[st.mapsBtn, { borderColor: colors.border }]}
                    onPress={() => openInGoogleMaps(slotDetail.slot)}
                  >
                    <Feather name="map" size={15} color={colors.mutedForeground} />
                  </TouchableOpacity>
                </View>
              </>
            ) : selectedSlotId && detailLoading ? (
              <ActivityIndicator color={colors.primary} style={{ flex: 1, marginTop: 20 }} />
            ) : (
              <View style={st.mapHint}>
                {pendingLat !== null ? (
                  <>
                    <Feather name="crosshair" size={24} color={colors.primary} />
                    <Text style={[st.mapHintTitle, { color: colors.foreground }]}>{t.chrono_search_place}</Text>
                    <Text style={[st.mapHintSub, { color: colors.mutedForeground }]}>
                      {pendingLat.toFixed(4)}, {pendingLng?.toFixed(4)}
                    </Text>
                    <TouchableOpacity
                      style={[st.createBtn, { backgroundColor: colors.primary }]}
                      onPress={handleNewSlot}
                    >
                      <Feather name="plus" size={16} color="#fff" />
                      <Text style={st.createBtnText}>{t.chrono_create_point}</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <Text style={[st.mapHintIcon]}>🌍</Text>
                    <Text style={[st.mapHintTitle, { color: colors.foreground }]}>{t.tab_chronopedia}</Text>
                    <Text style={[st.mapHintSub, { color: colors.mutedForeground }]}>
                      {t.chrono_create_point}
                    </Text>
                  </>
                )}
              </View>
            )}
          </View>
        </View>
      ) : (
        /* Feed view */
        feedLoading ? (
          <ActivityIndicator color={colors.primary} style={{ flex: 1, marginTop: 40 }} />
        ) : (
          <FlatList
            data={feedData?.events ?? []}
            keyExtractor={(e) => String(e.id)}
            renderItem={({ item }) => (
              <FeedEventCard
                event={item}
                onPress={() => handleFeedCardPress(item)}
                onAddOpinion={(slotId) => handleFeedAddOpinion(slotId, item.locationName, item.timeMarker)}
                colors={colors}
              />
            )}
            contentContainerStyle={[st.feedList, { paddingBottom: insets.bottom + 80 }]}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={st.feedEmpty}>
                <Text style={[st.feedEmptyIcon]}>🌐</Text>
                <Text style={[st.feedEmptyText, { color: colors.mutedForeground }]}>
                  {t.emb_empty}
                </Text>
              </View>
            }
          />
        )
      )}

      {/* FAB */}
      {viewMode === "map" && (
        <TouchableOpacity
          style={[st.fab, { backgroundColor: colors.primary, bottom: insets.bottom + 90 }]}
          onPress={handleNewSlot}
        >
          <Feather name="plus" size={24} color="#fff" />
        </TouchableOpacity>
      )}

      {/* Slot auction modal */}
      {showSlotAuction && slotDetail?.slot && (
        <SlotAuctionModal
          slot={slotDetail.slot}
          visible={showSlotAuction}
          onClose={() => setShowSlotAuction(false)}
          onSubmit={(data) => slotAuctionMutation.mutate({ slotId: slotDetail.slot.id, ...data })}
          submitting={slotAuctionMutation.isPending}
          colors={colors}
        />
      )}

      {/* Add modal */}
      <AddModal
        visible={showAddModal}
        mode={addMode}
        slotInfo={
          addMode === "event"
            ? (slotDetail
                ? { locationName: slotDetail.slot.locationName, timeMarker: slotDetail.slot.timeMarker }
                : feedSlotInfo)
            : null
        }
        pendingLat={pendingLat}
        pendingLng={pendingLng}
        onClose={() => setShowAddModal(false)}
        onSubmit={handleModalSubmit}
        saving={isSaving}
        colors={colors}
        placeSearch={{
          query: placeQuery,
          setQuery: (q) => {
            setPlaceQuery(q);
            setPlaceLoading(false);
            if (!q || (selectedPlace && q.trim() !== selectedPlace.name)) {
              setSelectedPlace(null);
              setPlaceResults([]);
            }
          },
          results: placeResults,
          loading: placeLoading,
          selected: selectedPlace,
          setSelected: setSelectedPlace,
        }}
      />

      <ContextualGuideModal
        visible={chronoGuide.visible}
        onClose={chronoGuide.close}
        onConfirm={chronoGuide.confirm}
        icon="🗺️"
        title={t.chrono_create_point}
        explanation={t.chrono_new_point}
        ctaLabel={t.chrono_search_place}
      />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function getStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    root: { flex: 1 },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingBottom: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    headerTitle: { fontSize: 17, fontWeight: "700", letterSpacing: 0.3 },

    toggleRow: {
      flexDirection: "row",
      paddingHorizontal: 12,
      paddingVertical: 8,
      gap: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    toggleBtn: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingVertical: 8,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: "transparent",
    },
    toggleBtnText: { fontSize: 14, fontWeight: "600" },

    mapContainer: { flex: 1, flexDirection: "column" },
    mapWrapper: { flex: 3, position: "relative", minHeight: 200 },
    webView: { flex: 1, backgroundColor: "#0f172a" },
    mapLoading: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "#0f172a",
      alignItems: "center",
      justifyContent: "center",
      gap: 12,
    },
    mapLoadingText: { fontSize: 13 },
    mapLoadingOverlay: {
      position: "absolute",
      top: 12,
      right: 12,
      width: 36,
      height: 36,
      backgroundColor: "rgba(0,0,0,0.5)",
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
    },

    panel: {
      flex: 2,
      borderTopWidth: 1,
      paddingHorizontal: 14,
      paddingTop: 12,
      paddingBottom: 8,
      minHeight: 160,
    },
    panelHeader: { marginBottom: 8 },
    panelTitleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
    panelTitle: { fontSize: 15, fontWeight: "700", flex: 1 },
    panelTime: { fontSize: 12, marginTop: 2 },
    eventsList: { flex: 1, marginBottom: 8 },

    eventCard: {
      borderRadius: 10,
      borderWidth: 1,
      padding: 12,
    },
    eventCardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 },
    authorRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    authorAvatar: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
    authorName: { fontSize: 13, fontWeight: "600" },
    authorRank: { fontSize: 11, marginTop: 1 },
    eventCardActions: { flexDirection: "row", alignItems: "center", gap: 8 },
    statusBadge: { fontSize: 11 },
    eventTitle: { fontSize: 14, fontWeight: "600", marginBottom: 4 },
    eventDesc: { fontSize: 13, lineHeight: 19 },
    eventDate: { fontSize: 11, marginTop: 6 },

    panelActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginTop: 4,
    },
    addOpinionBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingVertical: 10,
      borderRadius: 10,
      borderWidth: 1,
    },
    addOpinionBtnText: { fontSize: 14, fontWeight: "600" },
    mapsBtn: {
      width: 42,
      height: 42,
      borderRadius: 10,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
    },

    mapHint: { flex: 1, alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 24 },
    mapHintIcon: { fontSize: 32, marginBottom: 4 },
    mapHintTitle: { fontSize: 16, fontWeight: "700", textAlign: "center" },
    mapHintSub: { fontSize: 13, textAlign: "center", lineHeight: 18 },
    createBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10, paddingHorizontal: 20, borderRadius: 10, marginTop: 8 },
    createBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },

    emptyHint: { fontSize: 13, textAlign: "center", marginTop: 16 },

    // Feed
    feedList: { paddingHorizontal: 14, paddingTop: 12, gap: 10 },
    feedCard: { borderRadius: 12, borderWidth: 1, padding: 14 },
    feedCardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
    feedLocation: { flexDirection: "row", alignItems: "center", gap: 5, flex: 1 },
    feedLocationText: { fontSize: 12, fontWeight: "600", flexShrink: 1 },
    feedTime: { fontSize: 12, flexShrink: 0 },
    feedAuthorRank: { fontSize: 11, marginLeft: 8, flexShrink: 0 },
    feedTitle: { fontSize: 14, fontWeight: "700", marginBottom: 3 },
    feedDesc: { fontSize: 13, lineHeight: 18 },
    feedEmpty: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 80, gap: 10 },
    feedEmptyIcon: { fontSize: 40 },
    feedEmptyText: { fontSize: 14, textAlign: "center", paddingHorizontal: 40, lineHeight: 20 },
    feedAddBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      marginTop: 10,
      paddingVertical: 7,
      paddingHorizontal: 12,
      borderRadius: 8,
      borderWidth: 1,
      alignSelf: "flex-start",
    },
    feedAddBtnText: { fontSize: 12, fontWeight: "600" },

    coordRow: { flexDirection: "row", gap: 10 },
    coordField: { flex: 1 },
    plusCodeBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
      borderWidth: 1,
      marginBottom: 8,
    },
    plusCodeBadgeText: { fontSize: 12, fontWeight: "600" },
    coordHint: { fontSize: 12, marginTop: 4 },

    // FAB
    fab: {
      position: "absolute",
      right: 16,
      width: 52,
      height: 52,
      borderRadius: 26,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.4,
      shadowRadius: 8,
      elevation: 8,
    },

    // Modal
    modalOverlay: { flex: 1, justifyContent: "flex-end" },
    modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.5)" },
    modalSheet: {
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      borderTopWidth: 1,
      borderLeftWidth: 1,
      borderRightWidth: 1,
      paddingHorizontal: 16,
      paddingBottom: 32,
      maxHeight: "92%",
    },
    modalHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: "#555", alignSelf: "center", marginTop: 10, marginBottom: 4 },
    modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 14 },
    modalTitle: { fontSize: 17, fontWeight: "700" },

    slotInfoBox: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 16 },
    slotInfoText: { fontSize: 13, fontWeight: "500", flex: 1 },

    fieldLabel: { fontSize: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6, marginTop: 14 },
    field: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 11, fontSize: 15 },
    fieldMulti: { height: 100, paddingTop: 11 },

    searchRow: { flexDirection: "row", alignItems: "center", borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10 },
    searchInput: { flex: 1, fontSize: 15 },

    placeResultsList: { borderRadius: 10, borderWidth: 1, overflow: "hidden", marginTop: 4 },
    placeResult: { padding: 12, borderBottomWidth: StyleSheet.hairlineWidth },
    placeResultName: { fontSize: 14, fontWeight: "600" },
    placeResultAddr: { fontSize: 12, marginTop: 2 },

    submitBtn: { paddingVertical: 14, borderRadius: 12, alignItems: "center", justifyContent: "center", marginTop: 20 },
    submitBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  });
}
