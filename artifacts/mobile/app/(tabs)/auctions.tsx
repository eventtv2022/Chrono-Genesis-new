import { getBaseUrl } from "@/lib/api";
import React, { useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  ActivityIndicator, Alert, TextInput, Platform, Modal, ScrollView, Image,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCitizen } from "@/context/CitizenContext";
import { useColors } from "@/hooks/useColors";
import { LogoBrand } from "@/components/LogoBrand";
import { CapsuleMediaPlayer } from "@/components/CapsuleMediaPlayer";
import { useLanguage } from "@/context/LanguageContext";

const BASE_URL = getBaseUrl();

interface Auction {
  id: number;
  sellerId: number;
  sellerName: string | null;
  assetType: "DARMIN_CURRENCY" | "HISTORICAL_SLOT" | "TIME_ANCHOR";
  amountDarmins: number;
  slotId: number | null;
  slotLocation: string | null;
  slotTimeMarker: string | null;
  timelineCoord: string | null;
  capsuleText: string | null;
  mediaUrl: string | null;
  mediaType: string | null;
  startingPrice: number;
  currentBid: number | null;
  buyerId: number | null;
  status: string;
  endsAt: string;
  createdAt: string;
}

function timeLeft(endsAt: string, finished: string): string {
  const diff = new Date(endsAt).getTime() - Date.now();
  if (diff <= 0) return finished;
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function AuctionsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { citizen, authHeaders, isLoading: citizenLoading } = useCitizen();
  const { t } = useLanguage();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [bidModal, setBidModal] = useState<Auction | null>(null);
  const [capsuleModal, setCapsuleModal] = useState<Auction | null>(null);
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
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({
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
      Alert.alert("✅", t.auc_submit);
    },
    onError: (err: Error) => Alert.alert("Error", err.message),
  });

  const bidMutation = useMutation({
    mutationFn: async ({ auctionId, bid }: { auctionId: number; bid: number }) => {
      const res = await fetch(`${BASE_URL}/api/auctions/${auctionId}/bid`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ bid }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error((data as { error: string }).error);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["auctions"] });
      setBidModal(null);
      setBidAmount("");
      Alert.alert("✅", t.auc_bid_confirm);
    },
    onError: (err: Error) => Alert.alert("Error", err.message),
  });

  if (citizenLoading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ color: colors.mutedForeground, marginTop: 10, fontFamily: "Inter_400Regular" }}>
          {t.loading}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <View style={styles.header}>
        <View style={styles.headerBrand}>
          <LogoBrand size={28} />
          <Text style={styles.headerTitle}>{t.tab_auction.toUpperCase()}</Text>
        </View>
        {citizen && (
          <TouchableOpacity style={styles.addBtn} onPress={() => setShowCreate(true)} activeOpacity={0.8}>
            <Feather name="plus" size={18} color={colors.primaryForeground} />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.infoCard}>
        <Feather name="tag" size={16} color={colors.primary} />
        <Text style={styles.infoText}>{t.auc_info}</Text>
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
              <Text style={styles.emptyText}>{t.auc_empty}</Text>
              <Text style={styles.emptySub}>{t.auc_empty_sub}</Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => {
          const isOwn = item.sellerId === citizen?.id;
          const currentPrice = item.currentBid ?? item.startingPrice;
          const isSlot   = item.assetType === "HISTORICAL_SLOT";
          const isAnchor = item.assetType === "TIME_ANCHOR";
          const fmtCoord = (c: string | null) => {
            if (!c || c.length !== 12) return c ?? "—";
            return `${c.slice(6,8)}.${c.slice(4,6)}.${parseInt(c.slice(0,4),10)} ${c.slice(8,10)}:${c.slice(10,12)}`;
          };
          return (
            <View style={[styles.card, isOwn && styles.cardOwn, isSlot && styles.cardSlot, isAnchor && styles.cardAnchor]}>
              {isSlot && (
                <View style={styles.slotBadge}>
                  <Text style={styles.slotBadgeText}>📍 Исторический слот</Text>
                </View>
              )}
              {isAnchor && (
                <View style={[styles.slotBadge, { backgroundColor: "#7c3aed18", borderColor: "#7c3aed44" }]}>
                  <Text style={[styles.slotBadgeText, { color: "#7c3aed" }]}>⏱ Точка на таймлайне истории</Text>
                </View>
              )}
              <View style={styles.cardTop}>
                <View style={styles.lotInfo}>
                  {isSlot ? (
                    <>
                      <Text style={styles.lotAmount} numberOfLines={1}>{item.slotLocation ?? "Слот"}</Text>
                      <Text style={styles.lotSeller}>{item.slotTimeMarker ?? ""} · {item.sellerName ?? "—"}{isOwn ? ` (${t.auc_own})` : ""}</Text>
                    </>
                  ) : isAnchor ? (
                    <>
                      <Text style={styles.lotAmount} numberOfLines={1}>{fmtCoord(item.timelineCoord)}</Text>
                      <Text style={styles.lotSeller}>{item.sellerName ?? "—"}{isOwn ? ` (${t.auc_own})` : ""}</Text>
                    </>
                  ) : (
                    <>
                      <Text style={styles.lotAmount}>{item.amountDarmins} Д</Text>
                      <Text style={styles.lotSeller}>{item.sellerName ?? "—"}{isOwn ? ` (${t.auc_own})` : ""}</Text>
                    </>
                  )}
                </View>
                <View style={styles.priceBlock}>
                  <Text style={styles.priceLabel}>{t.auc_bid_label}</Text>
                  <Text style={styles.priceValue}>{currentPrice.toFixed(2)} Д</Text>
                </View>
              </View>
              {/* Capsule preview strip — only for TIME_ANCHOR with a capsule */}
              {isAnchor && item.capsuleText && (
                <TouchableOpacity
                  style={styles.capsuleStrip}
                  onPress={() => setCapsuleModal(item)}
                  activeOpacity={0.75}
                >
                  <Text style={styles.capsuleStripIcon}>📜</Text>
                  <Text style={styles.capsuleStripText} numberOfLines={2}>{item.capsuleText}</Text>
                  <Feather name="chevron-right" size={14} color="#7c3aed" />
                </TouchableOpacity>
              )}
              <View style={styles.cardBottom}>
                <View style={styles.timerRow}>
                  <Feather name="clock" size={12} color={colors.mutedForeground} />
                  <Text style={styles.timerText}>{timeLeft(item.endsAt, t.auc_finished)}</Text>
                </View>
                {!isOwn && citizen && (
                  <TouchableOpacity
                    style={styles.bidBtn}
                    onPress={() => { setBidModal(item); setBidAmount(String(currentPrice + 1)); }}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.bidBtnText}>{t.auc_bid_btn}</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        }}
      />

      {/* Create lot modal */}
      <Modal visible={showCreate} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <ScrollView style={styles.modalSheet} contentContainerStyle={{ padding: 24 }}>
            <Text style={styles.modalTitle}>💰 {t.auc_new_lot}</Text>
            <Text style={styles.modalSub}>{t.auc_lot_sub}</Text>
            <TextInput style={styles.input} placeholder={t.auc_amount_ph} placeholderTextColor={colors.mutedForeground}
              value={amount} onChangeText={setAmount} keyboardType="number-pad" />
            <TextInput style={styles.input} placeholder={t.auc_price_ph} placeholderTextColor={colors.mutedForeground}
              value={price} onChangeText={setPrice} keyboardType="decimal-pad" />
            <TextInput style={styles.input} placeholder={t.auc_duration_ph} placeholderTextColor={colors.mutedForeground}
              value={hours} onChangeText={setHours} keyboardType="number-pad" />
            <View style={styles.feeNote}>
              <Feather name="percent" size={13} color={colors.primary} />
              <Text style={styles.feeNoteText}>{t.auc_fee_note}</Text>
            </View>
            <TouchableOpacity
              style={[styles.submitBtn, createMutation.isPending && { opacity: 0.6 }]}
              onPress={() => createMutation.mutate()}
              disabled={createMutation.isPending || !amount || !price}
              activeOpacity={0.8}
            >
              {createMutation.isPending
                ? <ActivityIndicator color={colors.primaryForeground} />
                : <Text style={styles.submitBtnText}>{t.auc_submit}</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowCreate(false)} activeOpacity={0.8}>
              <Text style={styles.cancelBtnText}>{t.cancel}</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      {/* 📜 Capsule preview modal */}
      <Modal visible={!!capsuleModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { padding: 24, maxHeight: "80%" as never }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <Text style={{ fontSize: 24 }}>📜</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.modalTitle, { marginBottom: 0 }]}>Капсула Времени</Text>
                {capsuleModal?.timelineCoord && (() => {
                  const c = capsuleModal.timelineCoord!;
                  const label = `${c.slice(6,8)}.${c.slice(4,6)}.${parseInt(c.slice(0,4),10)} ${c.slice(8,10)}:${c.slice(10,12)}`;
                  return <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 2 }}>{label} · {c}</Text>;
                })()}
              </View>
            </View>
            <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false}>
              {/* Медиавложение */}
              {capsuleModal?.mediaUrl && (
                <View style={{ marginBottom: 12 }}>
                  {capsuleModal.mediaType === "image" ? (
                    <Image
                      source={{ uri: `${BASE_URL}${capsuleModal.mediaUrl!.startsWith("/uploads/") ? `/api${capsuleModal.mediaUrl}` : capsuleModal.mediaUrl}` }}
                      style={{ width: "100%", height: 180, borderRadius: 12 }}
                      resizeMode="cover"
                    />
                  ) : (
                    <CapsuleMediaPlayer
                      mediaUrl={capsuleModal.mediaUrl!}
                      mediaType={capsuleModal.mediaType as "audio" | "video"}
                      baseUrl={BASE_URL}
                      colors={colors}
                    />
                  )}
                </View>
              )}
              <View style={{ backgroundColor: "#7c3aed11", borderWidth: 1, borderColor: "#7c3aed33", borderRadius: 14, padding: 16, marginBottom: 8 }}>
                <Text style={{ fontSize: 15, lineHeight: 24, color: colors.foreground }}>
                  {capsuleModal?.capsuleText ?? ""}
                </Text>
              </View>
            </ScrollView>
            <Text style={{ fontSize: 12, color: colors.mutedForeground, textAlign: "center", marginTop: 8, marginBottom: 16 }}>
              Послание владельца этой минуты таймлайна истории
            </Text>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setCapsuleModal(null)} activeOpacity={0.8}>
              <Text style={styles.cancelBtnText}>Закрыть</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Bid modal */}
      <Modal visible={!!bidModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { padding: 24 }]}>
            <Text style={styles.modalTitle}>🎯 {t.auc_bid_title}</Text>
            <Text style={styles.modalSub}>{bidModal?.amountDarmins} Д · {bidModal?.sellerName}</Text>
            <Text style={styles.bidCurrentLabel}>{t.auc_current_bid}: {(bidModal?.currentBid ?? bidModal?.startingPrice ?? 0).toFixed(2)} Д</Text>
            <TextInput style={styles.input} placeholder={t.auc_bid_ph} placeholderTextColor={colors.mutedForeground}
              value={bidAmount} onChangeText={setBidAmount} keyboardType="decimal-pad" autoFocus />
            <TouchableOpacity
              style={[styles.submitBtn, bidMutation.isPending && { opacity: 0.6 }]}
              onPress={() => {
                if (!bidModal) return;
                const numericBid = parseFloat(bidAmount);
                const minBid = bidModal.currentBid ?? bidModal.startingPrice;
                if (isNaN(numericBid) || numericBid <= 0) {
                  Alert.alert("⚠️", "Введите корректную сумму ставки");
                  return;
                }
                if (numericBid <= minBid) {
                  Alert.alert("⚠️", `Ставка должна быть больше текущей (${minBid.toFixed(2)} Д)`);
                  return;
                }
                const balance = citizen?.balanceMinutes ?? 0;
                if (balance - numericBid < 1) {
                  Alert.alert("⚠️", `Недостаточно средств. Доступно: ${Math.max(0, balance - 1).toFixed(2)} Д`);
                  return;
                }
                bidMutation.mutate({ auctionId: bidModal.id, bid: numericBid });
              }}
              disabled={bidMutation.isPending || !bidAmount.trim()}
              activeOpacity={0.8}
            >
              {bidMutation.isPending
                ? <ActivityIndicator color={colors.primaryForeground} />
                : <Text style={styles.submitBtnText}>{t.auc_bid_confirm}</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => { setBidModal(null); setBidAmount(""); }} activeOpacity={0.8}>
              <Text style={styles.cancelBtnText}>{t.cancel}</Text>
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
    cardSlot:   { borderColor: "#f59e0b55", backgroundColor: colors.card },
    cardAnchor: { borderColor: "#7c3aed55", backgroundColor: colors.card },
    slotBadge: { backgroundColor: "#f59e0b18", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, alignSelf: "flex-start", marginBottom: 10, borderWidth: 1, borderColor: "#f59e0b33" },
    slotBadgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#f59e0b" },
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
    capsuleStrip: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#7c3aed11", borderWidth: 1, borderColor: "#7c3aed33", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 10 },
    capsuleStripIcon: { fontSize: 16 },
    capsuleStripText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", color: colors.foreground, lineHeight: 17 },
  });
}
