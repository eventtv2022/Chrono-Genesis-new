import React, { useState } from "react";
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

interface Embassy {
  id: number;
  citizenId: number;
  citizenName: string | null;
  gpsLat: number;
  gpsLng: number;
  address: string | null;
  nodeActive: boolean;
  uptimeScore: number;
  status: string;
  nftMetadata: string | null;
  createdAt: string;
}

export default function EmbassiesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { citizen } = useCitizen();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [address, setAddress] = useState("");
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const styles = getStyles(colors);

  const { data: embassies = [], isLoading } = useQuery<Embassy[]>({
    queryKey: ["embassies"],
    queryFn: async () => {
      const res = await fetch(`${BASE_URL}/api/embassies`);
      return res.json() as Promise<Embassy[]>;
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE_URL}/api/embassies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          citizenId: citizen!.id,
          gpsLat: parseFloat(lat),
          gpsLng: parseFloat(lng),
          address: address.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error((data as { error: string }).error);
      return data as Embassy;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["embassies"] });
      setShowForm(false);
      setLat(""); setLng(""); setAddress("");
      Alert.alert("🏛 Посольство зарегистрировано", "Статус «Посол» активирован. NFT-сертификат выпущен.");
    },
    onError: (err: Error) => Alert.alert("Ошибка", err.message),
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
                <Text style={styles.avatarText}>{(item.citizenName ?? "?").charAt(0)}</Text>
              </View>
              <View style={styles.cardInfo}>
                <Text style={styles.cardName}>{item.citizenName ?? "Неизвестный"}</Text>
                <Text style={styles.cardAddr}>{item.address ?? `${item.gpsLat.toFixed(4)}, ${item.gpsLng.toFixed(4)}`}</Text>
              </View>
              <View style={[styles.nodeBadge, item.nodeActive && styles.nodeBadgeActive]}>
                <View style={[styles.nodeDot, item.nodeActive && styles.nodeDotActive]} />
                <Text style={[styles.nodeText, item.nodeActive && styles.nodeTextActive]}>
                  {item.nodeActive ? "ONLINE" : "OFFLINE"}
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

      <Modal visible={showForm} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <ScrollView style={styles.modalSheet} contentContainerStyle={{ padding: 24 }}>
            <Text style={styles.modalTitle}>🏛 Зарегистрировать посольство</Text>
            <Text style={styles.modalSub}>Укажи координаты GPS площадки под ноду</Text>
            <TextInput
              style={styles.input}
              placeholder="Широта (например: 55.7558)"
              placeholderTextColor={colors.mutedForeground}
              value={lat}
              onChangeText={setLat}
              keyboardType="decimal-pad"
            />
            <TextInput
              style={styles.input}
              placeholder="Долгота (например: 37.6176)"
              placeholderTextColor={colors.mutedForeground}
              value={lng}
              onChangeText={setLng}
              keyboardType="decimal-pad"
            />
            <TextInput
              style={styles.input}
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
              style={[styles.submitBtn, createMutation.isPending && { opacity: 0.6 }]}
              onPress={() => createMutation.mutate()}
              disabled={createMutation.isPending || !lat || !lng}
              activeOpacity={0.8}
            >
              {createMutation.isPending
                ? <ActivityIndicator color={colors.primaryForeground} />
                : <Text style={styles.submitBtnText}>Зарегистрировать</Text>
              }
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowForm(false)} activeOpacity={0.8}>
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
    container: { flex: 1, backgroundColor: colors.background },
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingVertical: 12 },
    headerBrand: { flexDirection: "row", alignItems: "center", gap: 8 },
    headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: colors.primary, letterSpacing: 2 },
    addBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
    infoCard: { flexDirection: "row", alignItems: "flex-start", gap: 10, margin: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14 },
    infoText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, lineHeight: 18 },
    empty: { alignItems: "center", paddingTop: 60, gap: 10 },
    emptyText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground },
    emptySub: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
    card: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 16, marginBottom: 10 },
    cardHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
    avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
    avatarText: { fontSize: 16, fontFamily: "Inter_700Bold", color: colors.primary },
    cardInfo: { flex: 1 },
    cardName: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.foreground },
    cardAddr: { fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 2 },
    nodeBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.surface, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 4 },
    nodeBadgeActive: { backgroundColor: "rgba(34,197,94,0.1)" },
    nodeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.mutedForeground },
    nodeDotActive: { backgroundColor: "#22c55e" },
    nodeText: { fontSize: 10, fontFamily: "Inter_700Bold", color: colors.mutedForeground, letterSpacing: 0.5 },
    nodeTextActive: { color: "#22c55e" },
    cardFooter: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border },
    cardNft: { fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
    modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
    modalSheet: { backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "85%" },
    modalTitle: { fontSize: 20, fontFamily: "Inter_700Bold", color: colors.foreground, marginBottom: 6 },
    modalSub: { fontSize: 14, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginBottom: 20 },
    input: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 14, fontSize: 15, fontFamily: "Inter_400Regular", color: colors.foreground, backgroundColor: colors.card, marginBottom: 12 },
    nftNote: { flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: colors.goldGlow, borderWidth: 1, borderColor: colors.primary, borderRadius: 10, padding: 12, marginBottom: 20 },
    nftNoteText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", color: colors.primary, lineHeight: 18 },
    submitBtn: { backgroundColor: colors.primary, borderRadius: 12, padding: 16, alignItems: "center", marginBottom: 10 },
    submitBtnText: { fontSize: 16, fontFamily: "Inter_700Bold", color: colors.primaryForeground },
    cancelBtn: { alignItems: "center", padding: 12 },
    cancelBtnText: { fontSize: 15, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
  });
}
