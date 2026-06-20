import React, { useState, useMemo } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  ActivityIndicator, Alert, TextInput, Platform, Modal, ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCitizen } from "@/context/CitizenContext";
import { useColors } from "@/hooks/useColors";
import { LogoBrand } from "@/components/LogoBrand";

const BASE_URL = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;

// ── Inline Open Location Code (OLC) engine ────────────────────────────────────
// Spec: https://github.com/google/open-location-code
// Base-20 alphabet and pair-resolution steps

const OLC_ALPHA = '23456789CFGHJMPQRVWX';
const OLC_STEPS: number[] = [20.0, 1.0, 0.05, 0.0025, 0.000125];

function olcIsValid(code: string): boolean {
  if (!code || code.length < 4) return false;
  const c = code.toUpperCase();
  const si = c.indexOf('+');
  if (si < 2 || si > 8 || si % 2 !== 0) return false;
  for (let i = 0; i < c.length; i++) {
    if (c[i] !== '+' && OLC_ALPHA.indexOf(c[i]) === -1) return false;
  }
  return true;
}

function olcIsFull(code: string): boolean {
  return code.toUpperCase().indexOf('+') === 8;
}

/** Decode a full OLC code (separator at position 8) → {lat, lng} */
function olcDecode(code: string): { lat: number; lng: number } {
  const clean = code.toUpperCase().replace('+', '').replace(/0+$/, '');
  let lat = -90.0, lng = -180.0;
  let lastStep = OLC_STEPS[0];
  for (let i = 0; i < Math.min(clean.length, 10); i += 2) {
    const step = OLC_STEPS[i / 2];
    lastStep = step;
    lat += OLC_ALPHA.indexOf(clean[i])     * step;
    lng += OLC_ALPHA.indexOf(clean[i + 1]) * step;
  }
  return { lat: lat + lastStep / 2, lng: lng + lastStep / 2 };
}

/** Encode normalized (lat+90, lng+180) coords as a prefix of `numPairs` pairs */
function olcEncodePrefix(latNorm: number, lngNorm: number, numPairs: number): string {
  let la = latNorm, ln = lngNorm;
  let prefix = '';
  for (let p = 0; p < numPairs; p++) {
    const step = OLC_STEPS[p];
    const li = Math.floor(la / step);
    const ni = Math.floor(ln / step);
    prefix += OLC_ALPHA[li] + OLC_ALPHA[ni];
    la -= li * step;
    ln -= ni * step;
  }
  return prefix;
}

/** Recover a short code to a full code using reference coordinates */
function olcRecover(shortCode: string, refLat: number, refLng: number): string | null {
  const sc     = shortCode.toUpperCase();
  const si     = sc.indexOf('+');
  if (si < 2 || si > 7 || si % 2 !== 0) return null;
  const missingPairs = (8 - si) / 2;
  const prefix = olcEncodePrefix(refLat + 90, ((refLng + 180) % 360), missingPairs);
  const shortDigits = sc.replace('+', '');
  const fullDigits  = prefix + shortDigits;
  return fullDigits.slice(0, 8) + '+' + fullDigits.slice(8);
}

// ── City reference table for short-code recovery ──────────────────────────────

type LatLng = [number, number];
const CITY_REFS: Record<string, LatLng> = {
  фамагуста:          [35.1211, 33.9363],
  famagusta:          [35.1211, 33.9363],
  никосия:            [35.1856, 33.3823],
  nicosia:            [35.1856, 33.3823],
  лимасол:            [34.6786, 33.0413],
  limassol:           [34.6786, 33.0413],
  ларнака:            [34.9009, 33.6344],
  larnaca:            [34.9009, 33.6344],
  москва:             [55.7558, 37.6176],
  moscow:             [55.7558, 37.6176],
  питер:              [59.9343, 30.3351],
  'санкт-петербург':  [59.9343, 30.3351],
  'saint-petersburg': [59.9343, 30.3351],
  стамбул:            [41.0082, 28.9784],
  istanbul:           [41.0082, 28.9784],
  берлин:             [52.5200, 13.4050],
  berlin:             [52.5200, 13.4050],
  париж:              [48.8566,  2.3522],
  paris:              [48.8566,  2.3522],
  лондон:             [51.5074, -0.1278],
  london:             [51.5074, -0.1278],
  дубай:              [25.2048, 55.2708],
  dubai:              [25.2048, 55.2708],
  токио:              [35.6762, 139.6503],
  tokyo:              [35.6762, 139.6503],
};
const DEFAULT_REF: LatLng = [35.1211, 33.9363]; // Cyprus fallback

// ── Smart location resolver ───────────────────────────────────────────────────

interface Coords { lat: number; lng: number }

function resolveLocation(input: string): Coords | null {
  const str = input.trim();
  if (!str) return null;

  // ── Plus Code branch ───────────────────────────────────────────────────────
  if (str.includes('+')) {
    const parts = str.split(/\s+/);
    const codeRaw = parts[0].toUpperCase();

    if (!olcIsValid(codeRaw)) return null;

    if (olcIsFull(codeRaw)) {
      return olcDecode(codeRaw);
    }

    // Short code — recover using city reference
    const cityStr = parts.slice(1).join(' ').toLowerCase();
    let ref: LatLng = DEFAULT_REF;
    for (const [city, coords] of Object.entries(CITY_REFS)) {
      if (cityStr.includes(city)) { ref = coords; break; }
    }

    const fullCode = olcRecover(codeRaw, ref[0], ref[1]);
    if (!fullCode) return null;
    return olcDecode(fullCode);
  }

  // ── lat, lng branch ────────────────────────────────────────────────────────
  const match = str.match(/^(-?\d{1,3}(?:\.\d+)?)[,\s]+(-?\d{1,3}(?:\.\d+)?)$/);
  if (match) {
    const lat = parseFloat(match[1]);
    const lng = parseFloat(match[2]);
    if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { lat, lng };
    }
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────

interface Embassy {
  id: number; citizenId: number; citizenName: string | null;
  gpsLat: number; gpsLng: number; address: string | null;
  nodeActive: boolean; uptimeScore: number; status: string;
  nftMetadata: string | null; createdAt: string;
}

export default function EmbassiesScreen() {
  const colors  = useColors();
  const insets  = useSafeAreaInsets();
  const { citizen } = useCitizen();
  const qc      = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [location, setLocation] = useState('');
  const [address,  setAddress]  = useState('');
  const topPad  = Platform.OS === 'web' ? 67 : insets.top;
  const styles  = getStyles(colors);

  const coords   = useMemo(() => resolveLocation(location), [location]);
  const hasInput = location.trim().length > 0;

  const { data: embassies = [], isLoading } = useQuery<Embassy[]>({
    queryKey: ['embassies'],
    queryFn: async () => {
      const res = await fetch(`${BASE_URL}/api/embassies`);
      return res.json() as Promise<Embassy[]>;
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!coords) throw new Error('Не удалось распознать координаты');
      const res = await fetch(`${BASE_URL}/api/embassies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          citizenId: citizen!.id,
          gpsLat:    coords.lat,
          gpsLng:    coords.lng,
          address:   address.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error((data as { error: string }).error);
      return data as Embassy;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['embassies'] });
      setShowForm(false);
      setLocation(''); setAddress('');
      Alert.alert('🏛 Посольство зарегистрировано', 'Статус «Посол» активирован. NFT-сертификат выпущен.');
    },
    onError: (err: Error) => Alert.alert('Ошибка', err.message),
  });

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <View style={styles.header}>
        <View style={styles.headerBrand}>
          <LogoBrand size={28} />
          <Text style={styles.headerTitle}>ПОСОЛЬСТВА</Text>
        </View>
        {citizen && (
          <TouchableOpacity style={styles.addBtn} onPress={() => setShowForm(true)} activeOpacity={0.8}>
            <Feather name="plus" size={18} color={colors.primaryForeground} />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.infoCard}>
        <Feather name="map-pin" size={16} color={colors.primary} />
        <Text style={styles.infoText}>
          Предоставь 1 м² под ноду распределённой сети — получай Дармины за аптайм. Статус: Посол + NFT-сертификат.
        </Text>
      </View>

      {isLoading && <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />}

      <FlatList
        data={embassies}
        keyExtractor={(e) => String(e.id)}
        contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.empty}>
              <Feather name="globe" size={40} color={colors.mutedForeground} />
              <Text style={styles.emptyText}>Нет зарегистрированных посольств</Text>
              <Text style={styles.emptySub}>Стань первым Послом TimeNation</Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{(item.citizenName ?? '?').charAt(0)}</Text>
              </View>
              <View style={styles.cardInfo}>
                <Text style={styles.cardName}>{item.citizenName ?? 'Неизвестный'}</Text>
                <Text style={styles.cardAddr}>
                  {item.address ?? `${item.gpsLat.toFixed(4)}, ${item.gpsLng.toFixed(4)}`}
                </Text>
              </View>
              <View style={[styles.nodeBadge, item.nodeActive && styles.nodeBadgeActive]}>
                <View style={[styles.nodeDot, item.nodeActive && styles.nodeDotActive]} />
                <Text style={[styles.nodeText, item.nodeActive && styles.nodeTextActive]}>
                  {item.nodeActive ? 'ONLINE' : 'OFFLINE'}
                </Text>
              </View>
            </View>
            <View style={styles.cardFooter}>
              <Feather name="award" size={12} color={colors.primary} />
              <Text style={styles.cardNft}>NFT Посол · Аптайм: {item.uptimeScore.toFixed(1)}%</Text>
            </View>
          </View>
        )}
      />

      {/* ── Registration Modal ──────────────────────────────────────────────── */}
      <Modal visible={showForm} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <ScrollView
            style={styles.modalSheet}
            contentContainerStyle={{ padding: 24 }}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.modalTitle}>🏛 Зарегистрировать посольство</Text>
            <Text style={styles.modalSub}>Введи координаты или Google Plus Code площадки под ноду</Text>

            {/* Smart location input */}
            <Text style={styles.inputLabel}>Местоположение / Plus Code</Text>
            <TextInput
              style={[
                styles.input,
                hasInput && !coords && { borderColor: '#ef4444' },
                coords             && { borderColor: '#22c55e' },
              ]}
              placeholder={'4WHF+GW5 Фамагуста  или  35.1211, 33.9363'}
              placeholderTextColor={colors.mutedForeground}
              value={location}
              onChangeText={setLocation}
              autoCapitalize="characters"
              autoCorrect={false}
            />

            {/* Decoded coordinates feedback */}
            {coords ? (
              <View style={styles.coordPreview}>
                <Feather name="check-circle" size={14} color="#22c55e" />
                <Text style={styles.coordPreviewText}>
                  {coords.lat.toFixed(6)},  {coords.lng.toFixed(6)}
                </Text>
              </View>
            ) : hasInput ? (
              <View style={styles.coordError}>
                <Feather name="alert-circle" size={14} color="#ef4444" />
                <Text style={styles.coordErrorText}>
                  Не удалось распознать. Попробуй полный код (8G8H4WHF+GW5) или формат «35.12, 33.93»
                </Text>
              </View>
            ) : (
              <View style={styles.coordHint}>
                <Feather name="info" size={13} color={colors.mutedForeground} />
                <Text style={styles.coordHintText}>
                  Поддерживается Google Plus Code (короткий или полный) и формат «широта, долгота»
                </Text>
              </View>
            )}

            <TextInput
              style={[styles.input, { marginTop: 4 }]}
              placeholder="Адрес (необязательно)"
              placeholderTextColor={colors.mutedForeground}
              value={address}
              onChangeText={setAddress}
            />

            <View style={styles.nftNote}>
              <Feather name="award" size={14} color={colors.primary} />
              <Text style={styles.nftNoteText}>
                После регистрации автоматически выпускается NFT-сертификат «Посол TimeNation» и присваивается ранг.
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.submitBtn, (createMutation.isPending || !coords) && { opacity: 0.5 }]}
              onPress={() => createMutation.mutate()}
              disabled={createMutation.isPending || !coords}
              activeOpacity={0.8}
            >
              {createMutation.isPending
                ? <ActivityIndicator color={colors.primaryForeground} />
                : <Text style={styles.submitBtnText}>Зарегистрировать</Text>
              }
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => { setShowForm(false); setLocation(''); setAddress(''); }}
              activeOpacity={0.8}
            >
              <Text style={styles.cancelBtnText}>Отмена</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

function getStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    container:        { flex: 1, backgroundColor: colors.background },
    header:           { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12 },
    headerBrand:      { flexDirection: 'row', alignItems: 'center', gap: 8 },
    headerTitle:      { fontSize: 18, fontFamily: 'Inter_700Bold', color: colors.primary, letterSpacing: 2 },
    addBtn:           { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
    infoCard:         { flexDirection: 'row', alignItems: 'flex-start', gap: 10, margin: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14 },
    infoText:         { flex: 1, fontSize: 13, fontFamily: 'Inter_400Regular', color: colors.mutedForeground, lineHeight: 18 },
    empty:            { alignItems: 'center', paddingTop: 60, gap: 10 },
    emptyText:        { fontSize: 16, fontFamily: 'Inter_600SemiBold', color: colors.mutedForeground },
    emptySub:         { fontSize: 13, fontFamily: 'Inter_400Regular', color: colors.mutedForeground },
    card:             { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 16, marginBottom: 10 },
    cardHeader:       { flexDirection: 'row', alignItems: 'center', gap: 12 },
    avatar:           { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
    avatarText:       { fontSize: 16, fontFamily: 'Inter_700Bold', color: colors.primary },
    cardInfo:         { flex: 1 },
    cardName:         { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: colors.foreground },
    cardAddr:         { fontSize: 12, fontFamily: 'Inter_400Regular', color: colors.mutedForeground, marginTop: 2 },
    nodeBadge:        { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.surface, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 4 },
    nodeBadgeActive:  { backgroundColor: 'rgba(34,197,94,0.1)' },
    nodeDot:          { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.mutedForeground },
    nodeDotActive:    { backgroundColor: '#22c55e' },
    nodeText:         { fontSize: 10, fontFamily: 'Inter_700Bold', color: colors.mutedForeground, letterSpacing: 0.5 },
    nodeTextActive:   { color: '#22c55e' },
    cardFooter:       { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border },
    cardNft:          { fontSize: 12, fontFamily: 'Inter_400Regular', color: colors.mutedForeground },
    modalOverlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
    modalSheet:       { backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '90%' },
    modalTitle:       { fontSize: 20, fontFamily: 'Inter_700Bold', color: colors.foreground, marginBottom: 6 },
    modalSub:         { fontSize: 14, fontFamily: 'Inter_400Regular', color: colors.mutedForeground, marginBottom: 20 },
    inputLabel:       { fontSize: 12, fontFamily: 'Inter_500Medium', color: colors.mutedForeground, marginBottom: 6, letterSpacing: 0.4 },
    input:            { borderWidth: 1.5, borderColor: colors.border, borderRadius: 10, padding: 14, fontSize: 15, fontFamily: 'Inter_400Regular', color: colors.foreground, backgroundColor: colors.card, marginBottom: 8 },
    coordPreview:     { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, backgroundColor: 'rgba(34,197,94,0.08)', borderRadius: 8, borderWidth: 1, borderColor: 'rgba(34,197,94,0.3)', marginBottom: 12 },
    coordPreviewText: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: '#4ade80' },
    coordError:       { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 10, backgroundColor: 'rgba(239,68,68,0.08)', borderRadius: 8, borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)', marginBottom: 12 },
    coordErrorText:   { flex: 1, fontSize: 12, fontFamily: 'Inter_400Regular', color: '#f87171', lineHeight: 17 },
    coordHint:        { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 10, marginBottom: 12 },
    coordHintText:    { flex: 1, fontSize: 12, fontFamily: 'Inter_400Regular', color: colors.mutedForeground, lineHeight: 17 },
    nftNote:          { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: colors.goldGlow, borderWidth: 1, borderColor: colors.primary, borderRadius: 10, padding: 12, marginBottom: 20 },
    nftNoteText:      { flex: 1, fontSize: 13, fontFamily: 'Inter_400Regular', color: colors.primary, lineHeight: 18 },
    submitBtn:        { backgroundColor: colors.primary, borderRadius: 12, padding: 16, alignItems: 'center', marginBottom: 10 },
    submitBtnText:    { fontSize: 16, fontFamily: 'Inter_700Bold', color: colors.primaryForeground },
    cancelBtn:        { alignItems: 'center', padding: 12 },
    cancelBtnText:    { fontSize: 15, fontFamily: 'Inter_400Regular', color: colors.mutedForeground },
  });
}
