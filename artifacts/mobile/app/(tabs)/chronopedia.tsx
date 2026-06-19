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
import { LogoBrand } from "@/components/LogoBrand";

const BASE_URL = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;

// ── Types ─────────────────────────────────────────────────────────────────────

interface ChronopediaSlot {
  id: number;
  timeMarker: string;
  placeId: string;
  geoLat: number;
  geoLng: number;
  locationName: string;
  createdAt: string;
  eventCount: number;
  hasMyEvent: boolean;
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
              {event.authorName ?? "Гражданин"}
            </Text>
            <Text style={[st.authorRank, { color: colors.mutedForeground }]}>
              {event.authorRank ?? "Гражданин"}
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
        {new Date(event.createdAt).toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" })}
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
          {event.authorRank ?? "Гражданин"}
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
          <Text style={[st.feedAddBtnText, { color: colors.primary }]}>Добавить мнение</Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
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
  const st = getStyles(colors);
  const [locationName, setLocationName] = useState("");
  const [timeMarker, setTimeMarker] = useState(
    () => new Date().toISOString().slice(0, 10)
  );
  const [manualLat, setManualLat] = useState("");
  const [manualLng, setManualLng] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (visible) {
      setTitle("");
      setDescription("");
      if (mode === "slot") {
        setLocationName(placeSearch.selected?.name ?? "");
        setTimeMarker(new Date().toISOString().slice(0, 10));
        setManualLat(pendingLat != null ? String(pendingLat) : "");
        setManualLng(pendingLng != null ? String(pendingLng) : "");
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

  // Auto-sync location name from search query when no place is selected
  useEffect(() => {
    if (!placeSearch.selected && mode === "slot") {
      setLocationName(placeSearch.query.trim());
    }
  }, [placeSearch.query, placeSearch.selected, mode]);

  const handleSubmit = () => {
    if (!title.trim()) { Alert.alert("Ошибка", "Введите заголовок"); return; }
    if (!description.trim()) { Alert.alert("Ошибка", "Введите описание"); return; }
    if (mode === "slot" && !locationName.trim()) { Alert.alert("Ошибка", "Введите название места"); return; }
    if (mode === "slot" && !timeMarker.trim()) { Alert.alert("Ошибка", "Введите дату/время"); return; }

    // Use entered coordinates or fall back to 0,0 (point will appear at map origin)
    const lat = parseFloat(manualLat) || 0;
    const lng = parseFloat(manualLng) || 0;

    onSubmit({
      locationName: mode === "slot" ? locationName.trim() : undefined,
      timeMarker: mode === "slot" ? timeMarker.trim() : undefined,
      placeId: placeSearch.selected?.placeId,
      lat: mode === "slot" ? lat : undefined,
      lng: mode === "slot" ? lng : undefined,
      title: title.trim(),
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
              {mode === "slot" ? "📍 Новая точка" : "💬 Добавить мнение"}
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
                <Text style={[st.fieldLabel, { color: colors.mutedForeground }]}>Поиск места</Text>
                <View style={[st.searchRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Feather name="search" size={16} color={colors.mutedForeground} style={{ marginRight: 8 }} />
                  <TextInput
                    style={[st.searchInput, { color: colors.foreground }]}
                    placeholder="Поиск по Google Places…"
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

                <Text style={[st.fieldLabel, { color: colors.mutedForeground }]}>Название места</Text>
                <TextInput
                  style={[st.field, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border }]}
                  placeholder="Москва, Красная площадь…"
                  placeholderTextColor={colors.mutedForeground}
                  value={locationName}
                  onChangeText={setLocationName}
                />

                <Text style={[st.fieldLabel, { color: colors.mutedForeground }]}>Координаты (широта, долгота)</Text>
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

                <Text style={[st.fieldLabel, { color: colors.mutedForeground }]}>Дата / время события</Text>
                <TextInput
                  style={[st.field, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border }]}
                  placeholder="2026-06-14 или «22 июня 1941»"
                  placeholderTextColor={colors.mutedForeground}
                  value={timeMarker}
                  onChangeText={setTimeMarker}
                />
              </>
            )}

            <Text style={[st.fieldLabel, { color: colors.mutedForeground }]}>Заголовок мнения</Text>
            <TextInput
              style={[st.field, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border }]}
              placeholder="Кратко — в чём суть?"
              placeholderTextColor={colors.mutedForeground}
              value={title}
              onChangeText={setTitle}
              maxLength={200}
            />

            <Text style={[st.fieldLabel, { color: colors.mutedForeground }]}>Ваше мнение / описание</Text>
            <TextInput
              style={[st.field, st.fieldMulti, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border }]}
              placeholder="Что произошло по вашему мнению?"
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
                    {mode === "slot" ? "Создать точку" : "Добавить мнение"}
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
  const { citizen } = useCitizen();
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
  const [feedSlotInfo, setFeedSlotInfo] = useState<{ locationName: string; timeMarker: string } | null>(null);

  const [placeQuery, setPlaceQuery] = useState("");
  const [placeResults, setPlaceResults] = useState<PlaceResult[]>([]);
  const [placeLoading, setPlaceLoading] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState<PlaceResult | null>(null);

  // Google Places search with debounce
  useEffect(() => {
    if (!placeQuery.trim() || selectedPlace) return;
    const t = setTimeout(async () => {
      setPlaceLoading(true);
      try {
        const res = await fetch(`${BASE_URL}/api/chronopedia/places/search?q=${encodeURIComponent(placeQuery)}`);
        if (res.ok) {
          const data = await res.json() as { places: PlaceResult[] };
          setPlaceResults(data.places);
        }
      } finally {
        setPlaceLoading(false);
      }
    }, 600);
    return () => clearTimeout(t);
  }, [placeQuery, selectedPlace]);

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data: slotsData, isLoading: slotsLoading } = useQuery<{ slots: ChronopediaSlot[] }>({
    queryKey: ["chronopediaSlots", citizen?.id],
    queryFn: async () => {
      const res = await fetch(
        `${BASE_URL}/api/chronopedia/slots${citizen ? `?citizenId=${citizen.id}` : ""}`
      );
      if (!res.ok) throw new Error("Ошибка загрузки точек");
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
      if (!res.ok) throw new Error("Ошибка загрузки слота");
      return res.json();
    },
    enabled: selectedSlotId !== null,
  });

  const { data: feedData, isLoading: feedLoading } = useQuery<{ events: FeedEvent[] }>({
    queryKey: ["chronopediaFeed"],
    queryFn: async () => {
      const res = await fetch(`${BASE_URL}/api/chronopedia/feed?limit=50`);
      if (!res.ok) throw new Error("Ошибка ленты");
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
      const lat = data.lat ?? selectedPlace?.lat ?? pendingLat ?? 0;
      const lng = data.lng ?? selectedPlace?.lng ?? pendingLng ?? 0;
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
        throw new Error(err.error ?? "Ошибка создания");
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
        throw new Error(err.error ?? "Ошибка добавления");
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

  const deleteEventMutation = useMutation({
    mutationFn: async (eventId: number) => {
      const res = await fetch(`${BASE_URL}/api/chronopedia/events/${eventId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ citizenId: citizen!.id }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? "Ошибка удаления");
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chronopediaSlot", selectedSlotId] });
      qc.invalidateQueries({ queryKey: ["chronopediaSlots"] });
      qc.invalidateQueries({ queryKey: ["chronopediaFeed"] });
    },
    onError: (e: Error) => Alert.alert("Ошибка", e.message),
  });

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleAddOpinion = () => {
    if (!citizen) { Alert.alert("Войдите", "Необходим аккаунт гражданина"); return; }
    setAddMode("event");
    setShowAddModal(true);
  };

  const handleNewSlot = () => {
    if (!citizen) { Alert.alert("Войдите", "Необходим аккаунт гражданина"); return; }
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
    Alert.alert("Удалить мнение?", "Это действие необратимо.", [
      { text: "Отмена", style: "cancel" },
      { text: "Удалить", style: "destructive", onPress: () => deleteEventMutation.mutate(eventId) },
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
    if (!citizen) { Alert.alert("Войдите", "Необходим аккаунт гражданина"); return; }
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
    Linking.openURL(url).catch(() => Alert.alert("Ошибка", "Не удалось открыть Google Maps"));
  }, []);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const isSaving = createSlotMutation.isPending || addEventMutation.isPending;

  return (
    <View style={[st.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[st.header, { paddingTop: topPad + 8, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <LogoBrand size={20} />
        <Text style={[st.headerTitle, { color: colors.foreground }]}>Хронопедия</Text>
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
              {mode === "map" ? "Карта" : "Лента"}
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
                  </View>
                  <Text style={[st.panelTime, { color: colors.mutedForeground }]}>
                    {slotDetail.slot.timeMarker} · {slotDetail.events.length} мнений
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
                        Нет мнений. Будьте первым!
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
                    <Text style={[st.addOpinionBtnText, { color: colors.primary }]}>Добавить мнение</Text>
                  </TouchableOpacity>
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
                    <Text style={[st.mapHintTitle, { color: colors.foreground }]}>Точка выбрана</Text>
                    <Text style={[st.mapHintSub, { color: colors.mutedForeground }]}>
                      {pendingLat.toFixed(4)}, {pendingLng?.toFixed(4)}
                    </Text>
                    <TouchableOpacity
                      style={[st.createBtn, { backgroundColor: colors.primary }]}
                      onPress={handleNewSlot}
                    >
                      <Feather name="plus" size={16} color="#fff" />
                      <Text style={st.createBtnText}>Создать точку здесь</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <Text style={[st.mapHintIcon]}>🌍</Text>
                    <Text style={[st.mapHintTitle, { color: colors.foreground }]}>Хронопедия</Text>
                    <Text style={[st.mapHintSub, { color: colors.mutedForeground }]}>
                      Нажмите маркер, чтобы прочитать мнения.{"\n"}Нажмите пустое место на карте, чтобы создать точку.
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
                  Нет записей. Откройте карту и добавьте первую точку!
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
          setQuery: (q) => { setPlaceQuery(q); if (!q) { setSelectedPlace(null); setPlaceResults([]); } },
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
        title="Добавить веху в Chronopedia"
        explanation={"Добавление смыслов и привязка к карте — всегда бесплатны. Вектор истории модерируется экспертами и ИИ по принципу Википедии.\n\nЗа подтверждённый факт ты заработаешь Darmin, а в твоём паспорте накопится Мерит, приближающий тебя к новому рангу. Спам и дезинформация блокируют накопление Меритов."}
        ctaLabel="Выбрать геолокацию и зафиксировать время"
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
