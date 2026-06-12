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

interface Auction {
  id: number;
  sellerId: number;
  sellerName: string | null;
  amountDarmins: number;
  startingPrice: number;
  currentBid: number | null;
  buyerId: number | null;
  status: string;
  endsAt: string;
  createdAt: string;
}

function timeLeft(endsAt: string): string {
  const diff = new Date(endsAt).getTime() - Date.now();
  if (diff <= 0) return "Завершён";
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  return h > 0 ? `${h}ч ${m}м` : `${m}м`;
}

export default function AuctionsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { citizen, isLoading: citizenLoading } = useCitizen();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [bidModal, setBidModal] = useState<Auction | null>(null);
  const [amount, setAmount] = useState("");
  const [price, setPrice] = useState("");
  const [hours, setHours] = useState("24");
  const [bidAmount, setBidAmount] = useState("");
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const styles = getStyles(colors);

  const { data: auctions = [], isLoading } = useQuery<Auction[]>({
    queryKey: ["auctions"],
    queryFn: async () => {
      const res = await fetch(`${BASE_URL}/api/auctions`);
      return res.json() as Promise<Auction[]>;
    },
    refetchInterval: 30000,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE_URL}/api/auctions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sellerId: citizen?.id,
          amountDarmins: parseInt(amount, 10),
          startingPrice: parseFloat(price),
          durationHours: parseInt(hours, 10),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error((data as { error: string }).error);
      return data as Auction;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["auctions"] });
      setShowCreate(false);
      setAmount(""); setPrice(""); setHours("24");
      Alert.alert("✅ Лот создан", "Дармины заблокированы. Аукцион активен.");
    },
    onError: (err: Error) => Alert.alert("Ошибка", err.message),
  });

  const bidMutation = useMutation({
    mutationFn: async ({ auctionId, bid }: { auctionId: number; bid: number }) => {
      const res = await fetch(`${BASE_URL}/api/auctions/${auctionId}/bid`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ buyerId: citizen?.id, bid }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error((data as { error: string }).error);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["auctions"] });
      setBidModal(null);
      setBidAmount("");
      Alert.alert("✅ Ставка принята");
    },
    onError: (err: Error) => Alert.alert("Ошибка", err.message),
  });

  if (citizenLoading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ color: colors.mutedForeground, marginTop: 10, fontFamily: "Inter_400Regular" }}>
          Загрузка реестра аукционов...
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <View style={styles.header}>
        <View style={styles.headerBrand}>
          <LogoBrand size={28} />
          <Text style={styles.headerTitle}>АУКЦИОН</Text>
        </View>
        {citizen && (
          <TouchableOpacity style={styles.addBtn} onPress={() => setShowCreate(true)} activeOpacity={0.8}>
            <Feather name="plus" size={18} color={colors.primaryForeground} />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.infoCard}>
        <Feather name="tag" size={16} color={colors.primary} />
        <Text style={styles.infoText}>
          P2P-рынок Дарминов. Платформа берёт 2% комиссии с завершённых сделок. Фиатные деньги в систему не входят.
        </Text>
      </View>

      {isLoading && <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />}

      <FlatList
        data={auctions}
        keyExtractor={(a) => String(a.id)}
        contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.empty}>
              <Feather name="tag" size={40} color={colors.mutedForeground} />
              <Text style={styles.emptyText}>Нет активных лотов</Text>
              <Text style={styles.emptySub}>Выставь Дармины на продажу</Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => {
          const isOwn = item.sellerId === citizen?.id;
          const currentPrice = item.currentBid ?? item.startingPrice;
          return (
            <View style={[styles.card, isOwn && styles.cardOwn]}>
              <View style={styles.cardTop}>
                <View style={styles.lotInfo}>
                  <Text style={styles.lotAmount}>{item.amountDarmins} Д</Text>
                  <Text style={styles.lotSeller}>{item.sellerName ?? "Аноним"}{isOwn ? " (мой)" : ""}</Text>
                </View>
                <View style={styles.priceBlock}>
                  <Text style={styles.priceLabel}>Ставка</Text>
                  <Text style={styles.priceValue}>{currentPrice.toFixed(2)} Д</Text>
                </View>
              </View>
              <View style={styles.cardBottom}>
                <View style={styles.timerRow}>
                  <Feather name="clock" size={12} color={colors.mutedForeground} />
                  <Text style={styles.timerText}>{timeLeft(item.endsAt)}</Text>
                </View>
                {!isOwn && citizen && (
                  <TouchableOpacity
                    style={styles.bidBtn}
                    onPress={() => { setBidModal(item); setBidAmount(String(currentPrice + 1)); }}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.bidBtnText}>Сделать ставку</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        }}
      />

      {/* Создать лот */}
      <Modal visible={showCreate} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <ScrollView style={styles.modalSheet} contentContainerStyle={{ padding: 24 }}>
            <Text style={styles.modalTitle}>💰 Новый лот</Text>
            <Text style={styles.modalSub}>Заблокированные Дармины будут переданы победителю аукциона</Text>
            <TextInput style={styles.input} placeholder="Количество Дарминов" placeholderTextColor={colors.mutedForeground}
              value={amount} onChangeText={setAmount} keyboardType="number-pad" />
            <TextInput style={styles.input} placeholder="Начальная ставка (в Дарминах)" placeholderTextColor={colors.mutedForeground}
              value={price} onChangeText={setPrice} keyboardType="decimal-pad" />
            <TextInput style={styles.input} placeholder="Длительность (часы, 1–168)" placeholderTextColor={colors.mutedForeground}
              value={hours} onChangeText={setHours} keyboardType="number-pad" />
            <View style={styles.feeNote}>
              <Feather name="percent" size={13} color={colors.primary} />
              <Text style={styles.feeNoteText}>Комиссия платформы: 2% от финальной цены (округление вверх)</Text>
            </View>
            <TouchableOpacity
              style={[styles.submitBtn, createMutation.isPending && { opacity: 0.6 }]}
              onPress={() => createMutation.mutate()}
              disabled={createMutation.isPending || !amount || !price}
              activeOpacity={0.8}
            >
              {createMutation.isPending
                ? <ActivityIndicator color={colors.primaryForeground} />
                : <Text style={styles.submitBtnText}>Выставить на аукцион</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowCreate(false)} activeOpacity={0.8}>
              <Text style={styles.cancelBtnText}>Отмена</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      {/* Ставка */}
      <Modal visible={!!bidModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { padding: 24 }]}>
            <Text style={styles.modalTitle}>🎯 Ставка</Text>
            <Text style={styles.modalSub}>{bidModal?.amountDarmins} Д от {bidModal?.sellerName}</Text>
            <Text style={styles.bidCurrentLabel}>Текущая ставка: {(bidModal?.currentBid ?? bidModal?.startingPrice ?? 0).toFixed(2)} Д</Text>
            <TextInput style={styles.input} placeholder="Ваша ставка" placeholderTextColor={colors.mutedForeground}
              value={bidAmount} onChangeText={setBidAmount} keyboardType="decimal-pad" />
            <TouchableOpacity
              style={[styles.submitBtn, bidMutation.isPending && { opacity: 0.6 }]}
              onPress={() => bidModal && bidMutation.mutate({ auctionId: bidModal.id, bid: parseFloat(bidAmount) })}
              disabled={bidMutation.isPending || !bidAmount}
              activeOpacity={0.8}
            >
              {bidMutation.isPending
                ? <ActivityIndicator color={colors.primaryForeground} />
                : <Text style={styles.submitBtnText}>Подтвердить ставку</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setBidModal(null)} activeOpacity={0.8}>
              <Text style={styles.cancelBtnText}>Отмена</Text>
            </TouchableOpacity>
          </View>
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
    cardOwn: { borderColor: colors.primary },
    cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 },
    lotInfo: { flex: 1 },
    lotAmount: { fontSize: 22, fontFamily: "Inter_700Bold", color: colors.foreground },
    lotSeller: { fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 2 },
    priceBlock: { alignItems: "flex-end" },
    priceLabel: { fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
    priceValue: { fontSize: 18, fontFamily: "Inter_700Bold", color: colors.primary },
    cardBottom: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    timerRow: { flexDirection: "row", alignItems: "center", gap: 4 },
    timerText: { fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
    bidBtn: { backgroundColor: colors.primary, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
    bidBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.primaryForeground },
    modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
    modalSheet: { backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
    modalTitle: { fontSize: 20, fontFamily: "Inter_700Bold", color: colors.foreground, marginBottom: 6 },
    modalSub: { fontSize: 14, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginBottom: 20 },
    input: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 14, fontSize: 15, fontFamily: "Inter_400Regular", color: colors.foreground, backgroundColor: colors.card, marginBottom: 12 },
    feeNote: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.goldGlow, borderWidth: 1, borderColor: colors.primary, borderRadius: 10, padding: 12, marginBottom: 20 },
    feeNoteText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", color: colors.primary },
    bidCurrentLabel: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.foreground, marginBottom: 12 },
    submitBtn: { backgroundColor: colors.primary, borderRadius: 12, padding: 16, alignItems: "center", marginBottom: 10 },
    submitBtnText: { fontSize: 16, fontFamily: "Inter_700Bold", color: colors.primaryForeground },
    cancelBtn: { alignItems: "center", padding: 12 },
    cancelBtnText: { fontSize: 15, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
  });
}
