import { getBaseUrl } from "@/lib/api";
import React, { useState, useMemo, useCallback } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  ActivityIndicator, Alert, TextInput, Platform, Modal, ScrollView, Image,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Location from "expo-location";
import { useCitizen } from "@/context/CitizenContext";
import { useColors } from "@/hooks/useColors";
import { LogoBrand } from "@/components/LogoBrand";
import { useLanguage } from "@/context/LanguageContext";

const BASE_URL = getBaseUrl();

// ── Inline OLC (Open Location Code) engine ───────────────────────────────────

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
function olcIsFull(code: string): boolean { return code.toUpperCase().indexOf('+') === 8; }
function olcDecode(code: string): { lat: number; lng: number } {
  const clean = code.toUpperCase().replace('+', '').replace(/0+$/, '');
  let lat = -90.0, lng = -180.0, lastStep = OLC_STEPS[0];
  for (let i = 0; i < Math.min(clean.length, 10); i += 2) {
    const step = OLC_STEPS[i / 2]; lastStep = step;
    lat += OLC_ALPHA.indexOf(clean[i]) * step;
    lng += OLC_ALPHA.indexOf(clean[i + 1]) * step;
  }
  return { lat: lat + lastStep / 2, lng: lng + lastStep / 2 };
}
function olcEncodePrefix(latN: number, lngN: number, numPairs: number): string {
  let la = latN, ln = lngN, prefix = '';
  for (let p = 0; p < numPairs; p++) {
    const step = OLC_STEPS[p];
    const li = Math.floor(la / step); const ni = Math.floor(ln / step);
    prefix += OLC_ALPHA[li] + OLC_ALPHA[ni]; la -= li * step; ln -= ni * step;
  }
  return prefix;
}
function olcRecover(shortCode: string, refLat: number, refLng: number): string | null {
  const sc = shortCode.toUpperCase(); const si = sc.indexOf('+');
  if (si < 2 || si > 7 || si % 2 !== 0) return null;
  const prefix = olcEncodePrefix(refLat + 90, ((refLng + 180) % 360), (8 - si) / 2);
  const fullDigits = prefix + sc.replace('+', '');
  return fullDigits.slice(0, 8) + '+' + fullDigits.slice(8);
}
type LatLng = [number, number];
const CITY_REFS: Record<string, LatLng> = {
  фамагуста:[35.1211,33.9363], famagusta:[35.1211,33.9363],
  никосия:[35.1856,33.3823], nicosia:[35.1856,33.3823],
  лимасол:[34.6786,33.0413], limassol:[34.6786,33.0413],
  москва:[55.7558,37.6176], moscow:[55.7558,37.6176],
  лондон:[51.5074,-0.1278], london:[51.5074,-0.1278],
  дубай:[25.2048,55.2708], dubai:[25.2048,55.2708],
};
const DEFAULT_REF: LatLng = [35.1211, 33.9363];
interface Coords { lat: number; lng: number }
function resolveLocation(input: string): Coords | null {
  const str = input.trim(); if (!str) return null;
  if (str.includes('+')) {
    const parts = str.split(/\s+/); const codeRaw = parts[0].toUpperCase();
    if (!olcIsValid(codeRaw)) return null;
    if (olcIsFull(codeRaw)) return olcDecode(codeRaw);
    const cityStr = parts.slice(1).join(' ').toLowerCase();
    let ref: LatLng = DEFAULT_REF;
    for (const [city, coords] of Object.entries(CITY_REFS)) { if (cityStr.includes(city)) { ref = coords; break; } }
    const fullCode = olcRecover(codeRaw, ref[0], ref[1]); if (!fullCode) return null;
    return olcDecode(fullCode);
  }
  const match = str.match(/^(-?\d{1,3}(?:\.\d+)?)[,\s]+(-?\d{1,3}(?:\.\d+)?)$/);
  if (match) {
    const lat = parseFloat(match[1]), lng = parseFloat(match[2]);
    if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) return { lat, lng };
  }
  return null;
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface Embassy {
  id: number; citizenId: number; citizenName: string | null;
  gpsLat: number; gpsLng: number; address: string | null;
  nodeActive: boolean; uptimeScore: number; status: string;
  nodeStatus: string; lastPingMs: number | null; isHardwareVerified: boolean;
  nftMetadata: string | null; createdAt: string;
}
interface NodeToken { token: string; qrPayload: string; expiresAt: string; embassyId: number }

// ── Node status badge ─────────────────────────────────────────────────────────

function nodeStatusColor(s: string) {
  if (s === 'online') return '#22c55e';
  if (s === 'pending_verification') return '#f59e0b';
  return '#6b7280';
}
function nodeStatusLabel(s: string) {
  if (s === 'online')                return 'ONLINE';
  if (s === 'pending_verification')  return 'PENDING';
  return 'OFFLINE';
}

// ─────────────────────────────────────────────────────────────────────────────

export default function EmbassiesScreen() {
  const colors  = useColors();
  const insets  = useSafeAreaInsets();
  const { citizen } = useCitizen();
  const { t } = useLanguage();
  const qc      = useQueryClient();
  const [showForm,   setShowForm]   = useState(false);
  const [showVerify, setShowVerify] = useState<Embassy | null>(null);
  const [location,   setLocation]   = useState('');
  const [address,    setAddress]    = useState('');
  const [verifying,  setVerifying]  = useState(false);
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
    refetchInterval: 30_000,
  });

  const myEmbassy = citizen ? embassies.find(e => e.citizenId === citizen.id) : null;

  const { data: nodeToken, isLoading: tokenLoading, refetch: refetchToken } = useQuery<NodeToken>({
    queryKey: ['node-token', showVerify?.id],
    queryFn: async () => {
      const res = await fetch(`${BASE_URL}/api/embassies/${showVerify!.id}/node-token`);
      const d = await res.json() as NodeToken & { error?: string };
      if (!res.ok) throw new Error(d.error ?? 'Error');
      return d;
    },
    enabled: !!showVerify,
    staleTime: 0,
    gcTime: 0,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!coords) throw new Error('Cannot resolve coordinates');
      const res = await fetch(`${BASE_URL}/api/embassies`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ citizenId: citizen!.id, gpsLat: coords.lat, gpsLng: coords.lng, address: address.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error((data as { error: string }).error);
      return data as Embassy;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['embassies'] });
      setShowForm(false); setLocation(''); setAddress('');
      Alert.alert('🏛', t.emb_submit);
    },
    onError: (err: Error) => Alert.alert('Error', err.message),
  });

  const handleVerifyLocation = useCallback(async () => {
    if (!nodeToken || !showVerify) return;
    setVerifying(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('GPS', t.emb_verify_gps);
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.BestForNavigation });
      const { latitude: phoneLat, longitude: phoneLng } = pos.coords;

      const res = await fetch(`${BASE_URL}/api/embassies/verify-location`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: nodeToken.token, phoneLat, phoneLng }),
      });
      const data = await res.json() as { success?: boolean; message?: string; error?: string; distanceM?: number };

      if (!res.ok) {
        Alert.alert('Error', data.error ?? 'Error');
        return;
      }

      qc.invalidateQueries({ queryKey: ['embassies'] });
      setShowVerify(null);
      Alert.alert('✅', data.message ?? t.emb_verified);
    } catch {
      Alert.alert('Error', t.connection_error);
    } finally {
      setVerifying(false);
    }
  }, [nodeToken, showVerify, qc, t]);

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <View style={styles.header}>
        <View style={styles.headerBrand}>
          <LogoBrand size={28} />
          <Text style={styles.headerTitle}>{t.tab_embassies.toUpperCase()}</Text>
        </View>
        {citizen && (
          <TouchableOpacity style={styles.addBtn} onPress={() => setShowForm(true)} activeOpacity={0.8}>
            <Feather name="plus" size={18} color={colors.primaryForeground} />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.infoCard}>
        <Feather name="map-pin" size={16} color={colors.primary} />
        <Text style={styles.infoText}>{t.emb_info}</Text>
      </View>

      {myEmbassy && (
        <View style={[styles.myNodePanel, { borderColor: nodeStatusColor(myEmbassy.nodeStatus) + '66' }]}>
          <View style={styles.myNodeRow}>
            <View style={[styles.nodeStatusDot, { backgroundColor: nodeStatusColor(myEmbassy.nodeStatus) }]} />
            <Text style={[styles.myNodeStatus, { color: nodeStatusColor(myEmbassy.nodeStatus) }]}>
              {nodeStatusLabel(myEmbassy.nodeStatus)}
            </Text>
            {myEmbassy.isHardwareVerified && (
              <View style={styles.verifiedBadge}>
                <Feather name="shield" size={11} color="#22c55e" />
                <Text style={styles.verifiedText}>{t.emb_verified.toUpperCase()}</Text>
              </View>
            )}
          </View>
          {!myEmbassy.isHardwareVerified && (
            <View style={{ gap: 8 }}>
              <TouchableOpacity
                style={styles.verifyBtn}
                onPress={() => router.push('/embassy/verify')}
                activeOpacity={0.8}
              >
                <Feather name="camera" size={14} color={colors.primaryForeground} />
                <Text style={styles.verifyBtnText}>{t.emb_scan_qr}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.verifyBtn, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]}
                onPress={() => setShowVerify(myEmbassy)}
                activeOpacity={0.8}
              >
                <Feather name="navigation" size={14} color={colors.primary} />
                <Text style={[styles.verifyBtnText, { color: colors.primary }]}>{t.emb_verify_gps}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {isLoading && <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />}

      <FlatList
        data={embassies}
        keyExtractor={(e) => String(e.id)}
        contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.empty}>
              <Feather name="globe" size={40} color={colors.mutedForeground} />
              <Text style={styles.emptyText}>{t.emb_empty}</Text>
              <Text style={styles.emptySub}>{t.emb_empty_sub}</Text>
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
                <Text style={styles.cardName}>{item.citizenName ?? '—'}</Text>
                <Text style={styles.cardAddr}>
                  {item.address ?? `${item.gpsLat.toFixed(4)}, ${item.gpsLng.toFixed(4)}`}
                </Text>
              </View>
              <View style={[styles.nodeBadge, { backgroundColor: nodeStatusColor(item.nodeStatus) + '22' }]}>
                <View style={[styles.nodeDot, { backgroundColor: nodeStatusColor(item.nodeStatus) }]} />
                <Text style={[styles.nodeText, { color: nodeStatusColor(item.nodeStatus) }]}>
                  {nodeStatusLabel(item.nodeStatus)}
                </Text>
              </View>
            </View>
            <View style={styles.cardFooter}>
              <Feather name="award" size={12} color={colors.primary} />
              <Text style={styles.cardNft}>
                NFT · {item.uptimeScore.toFixed(1)}%
                {item.lastPingMs ? `  · ${item.lastPingMs}ms` : ''}
                {item.isHardwareVerified ? '  · ✓ PoL' : ''}
              </Text>
            </View>
          </View>
        )}
      />

      {/* Registration Modal */}
      <Modal visible={showForm} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <ScrollView style={styles.modalSheet} contentContainerStyle={{ padding: 24 }} keyboardShouldPersistTaps="handled">
            <Text style={styles.modalTitle}>🏛 {t.emb_reg_title}</Text>
            <Text style={styles.modalSub}>{t.emb_reg_sub}</Text>
            <Text style={styles.inputLabel}>{t.emb_loc_label}</Text>
            <TextInput
              style={[styles.input, hasInput && !coords && { borderColor: '#ef4444' }, coords && { borderColor: '#22c55e' }]}
              placeholder="4WHF+GW5 Famagusta  or  35.1211, 33.9363"
              placeholderTextColor={colors.mutedForeground}
              value={location} onChangeText={setLocation} autoCapitalize="characters" autoCorrect={false}
            />
            {coords ? (
              <View style={styles.coordPreview}>
                <Feather name="check-circle" size={14} color="#22c55e" />
                <Text style={styles.coordPreviewText}>{coords.lat.toFixed(6)},  {coords.lng.toFixed(6)}</Text>
              </View>
            ) : hasInput ? (
              <View style={styles.coordError}>
                <Feather name="alert-circle" size={14} color="#ef4444" />
                <Text style={styles.coordErrorText}>{t.connection_error}</Text>
              </View>
            ) : (
              <View style={styles.coordHint}>
                <Feather name="info" size={13} color={colors.mutedForeground} />
                <Text style={styles.coordHintText}>Google Plus Code or «lat, lng»</Text>
              </View>
            )}
            <TextInput
              style={[styles.input, { marginTop: 4 }]} placeholder={t.emb_addr_ph}
              placeholderTextColor={colors.mutedForeground} value={address} onChangeText={setAddress}
            />
            <View style={styles.nftNote}>
              <Feather name="award" size={14} color={colors.primary} />
              <Text style={styles.nftNoteText}>{t.emb_nft_note}</Text>
            </View>
            <TouchableOpacity
              style={[styles.submitBtn, (createMutation.isPending || !coords) && { opacity: 0.5 }]}
              onPress={() => createMutation.mutate()} disabled={createMutation.isPending || !coords} activeOpacity={0.8}
            >
              {createMutation.isPending ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={styles.submitBtnText}>{t.emb_submit}</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => { setShowForm(false); setLocation(''); setAddress(''); }} activeOpacity={0.8}>
              <Text style={styles.cancelBtnText}>{t.cancel}</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      {/* Proof-of-Location Modal */}
      <Modal visible={!!showVerify} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <ScrollView style={styles.modalSheet} contentContainerStyle={{ padding: 24 }} keyboardShouldPersistTaps="handled">
            <Text style={styles.modalTitle}>📡 Proof of Location</Text>
            <Text style={styles.modalSub}>{t.emb_pol_sub}</Text>

            {tokenLoading ? (
              <ActivityIndicator color={colors.primary} style={{ marginVertical: 24 }} />
            ) : nodeToken ? (
              <View style={styles.qrSection}>
                <Image
                  source={{ uri: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=8&data=${encodeURIComponent(nodeToken.qrPayload)}` }}
                  style={styles.qrImage}
                  resizeMode="contain"
                />
                <Text style={styles.qrCaption}>QR</Text>
                <View style={styles.tokenBox}>
                  <Text style={styles.tokenExpiry}>
                    {new Date(nodeToken.expiresAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
              </View>
            ) : null}

            <View style={styles.polSteps}>
              {[
                { icon: 'map-pin', text: t.emb_pol_sub },
                { icon: 'wifi',    text: 'GPS' },
                { icon: 'shield',  text: t.emb_verify_gps },
              ].map((step, i) => (
                <View key={i} style={styles.polStep}>
                  <View style={styles.polStepIcon}><Feather name={step.icon as 'map-pin'} size={14} color={colors.primary} /></View>
                  <Text style={styles.polStepText}>{step.text}</Text>
                </View>
              ))}
            </View>

            <TouchableOpacity
              style={[styles.submitBtn, verifying && { opacity: 0.6 }]}
              onPress={() => void handleVerifyLocation()}
              disabled={verifying || !nodeToken}
              activeOpacity={0.8}
            >
              {verifying ? (
                <ActivityIndicator color={colors.primaryForeground} />
              ) : (
                <>
                  <Feather name="navigation" size={16} color={colors.primaryForeground} />
                  <Text style={styles.submitBtnText}>  {t.emb_verify_presence}</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.cancelBtn} onPress={() => { setShowVerify(null); refetchToken(); }} activeOpacity={0.8}>
              <Text style={styles.cancelBtnText}>{t.close}</Text>
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
    myNodePanel:      { marginHorizontal: 16, marginBottom: 8, backgroundColor: colors.card, borderWidth: 1, borderRadius: 12, padding: 14, gap: 10 },
    myNodeRow:        { flexDirection: 'row', alignItems: 'center', gap: 8 },
    nodeStatusDot:    { width: 8, height: 8, borderRadius: 4 },
    myNodeStatus:     { fontSize: 13, fontFamily: 'Inter_700Bold', letterSpacing: 1 },
    verifiedBadge:    { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(34,197,94,0.1)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, marginLeft: 'auto' },
    verifiedText:     { fontSize: 9, fontFamily: 'Inter_700Bold', color: '#22c55e', letterSpacing: 1 },
    verifyBtn:        { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.primary, borderRadius: 10, padding: 12, justifyContent: 'center' },
    verifyBtnText:    { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: colors.primaryForeground },
    empty:            { alignItems: 'center', paddingTop: 60, gap: 10 },
    emptyText:        { fontSize: 16, fontFamily: 'Inter_600SemiBold', color: colors.mutedForeground },
    emptySub:         { fontSize: 13, fontFamily: 'Inter_400Regular', color: colors.mutedForeground },
    card:             { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 16, marginBottom: 10 },
    cardHeader:       { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
    avatar:           { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.goldGlow, borderWidth: 1, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
    avatarText:       { fontSize: 16, fontFamily: 'Inter_700Bold', color: colors.primary },
    cardInfo:         { flex: 1 },
    cardName:         { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: colors.foreground },
    cardAddr:         { fontSize: 12, fontFamily: 'Inter_400Regular', color: colors.mutedForeground, marginTop: 2 },
    nodeBadge:        { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 },
    nodeDot:          { width: 6, height: 6, borderRadius: 3 },
    nodeText:         { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 0.5 },
    cardFooter:       { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border },
    cardNft:          { fontSize: 12, fontFamily: 'Inter_400Regular', color: colors.mutedForeground },
    modalOverlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
    modalSheet:       { backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
    modalTitle:       { fontSize: 20, fontFamily: 'Inter_700Bold', color: colors.foreground, marginBottom: 6 },
    modalSub:         { fontSize: 14, fontFamily: 'Inter_400Regular', color: colors.mutedForeground, marginBottom: 20 },
    inputLabel:       { fontSize: 12, fontFamily: 'Inter_500Medium', color: colors.mutedForeground, marginBottom: 6 },
    input:            { borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 14, fontSize: 15, fontFamily: 'Inter_400Regular', color: colors.foreground, backgroundColor: colors.card, marginBottom: 8 },
    coordPreview:     { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
    coordPreviewText: { fontSize: 13, fontFamily: 'Inter_500Medium', color: '#22c55e' },
    coordError:       { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
    coordErrorText:   { fontSize: 13, fontFamily: 'Inter_400Regular', color: '#ef4444' },
    coordHint:        { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
    coordHintText:    { fontSize: 12, fontFamily: 'Inter_400Regular', color: colors.mutedForeground },
    nftNote:          { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: colors.goldGlow, borderWidth: 1, borderColor: colors.primary, borderRadius: 10, padding: 12, marginBottom: 20, marginTop: 4 },
    nftNoteText:      { flex: 1, fontSize: 13, fontFamily: 'Inter_400Regular', color: colors.primary, lineHeight: 18 },
    submitBtn:        { flexDirection: 'row', backgroundColor: colors.primary, borderRadius: 12, padding: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
    submitBtnText:    { fontSize: 16, fontFamily: 'Inter_700Bold', color: colors.primaryForeground },
    cancelBtn:        { alignItems: 'center', padding: 12 },
    cancelBtnText:    { fontSize: 15, fontFamily: 'Inter_400Regular', color: colors.mutedForeground },
    qrSection:        { alignItems: 'center', marginVertical: 16, gap: 8 },
    qrImage:          { width: 200, height: 200, borderRadius: 12 },
    qrCaption:        { fontSize: 12, fontFamily: 'Inter_400Regular', color: colors.mutedForeground },
    tokenBox:         { backgroundColor: colors.card, borderRadius: 8, padding: 10 },
    tokenExpiry:      { fontSize: 12, fontFamily: 'Inter_500Medium', color: colors.mutedForeground },
    polSteps:         { gap: 10, marginBottom: 20 },
    polStep:          { flexDirection: 'row', alignItems: 'center', gap: 10 },
    polStepIcon:      { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.goldGlow, alignItems: 'center', justifyContent: 'center' },
    polStepText:      { flex: 1, fontSize: 13, fontFamily: 'Inter_400Regular', color: colors.foreground },
    surface:          { backgroundColor: colors.background },
  });
}
