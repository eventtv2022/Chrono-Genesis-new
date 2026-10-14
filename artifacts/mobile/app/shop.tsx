import { getBaseUrl } from "@/lib/api";
import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
  TextInput,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as WebBrowser from "expo-web-browser";
import { useRouter } from "expo-router";
import { useCitizen } from "@/context/CitizenContext";
import { useColors } from "@/hooks/useColors";
import { useLanguage } from "@/context/LanguageContext";
import { LogoBrand } from "@/components/LogoBrand";
import type { UIStrings } from "@/lib/i18n";

const BASE_URL = getBaseUrl();

// ── Discount engine (mirrors server + web) ─────────────────────────────────────

function calcDarminDiscount(amount: number): number {
  if (amount > 10000) return 10;
  if (amount >= 5000)  return 8;
  if (amount >= 1000)  return 7;
  if (amount >= 500)   return 6;
  if (amount >= 100)   return 5;
  return 0;
}

function calcPrice(amount: number) {
  const discountPct  = calcDarminDiscount(amount);
  const baseEur      = amount;
  const totalEur     = parseFloat((amount * (1 - discountPct / 100)).toFixed(2));
  const eurPerDarmin = parseFloat((totalEur / amount).toFixed(4));
  return { discountPct, baseEur, totalEur, eurPerDarmin };
}

const QUICK_AMOUNTS = [100, 500, 1000, 5000] as const;

function getTiers(t: UIStrings) {
  return [
    { label: "1–99 Д",                             discount: 0,  from: 1     },
    { label: "100–499 Д",                           discount: 5,  from: 100   },
    { label: "500–999 Д",                           discount: 6,  from: 500   },
    { label: "1 000–4 999 Д",                       discount: 7,  from: 1000  },
    { label: "5 000–10 000 Д",                      discount: 8,  from: 5000  },
    { label: `${t.shop_tier_above} 10 000 Д`,       discount: 10, from: 10001 },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────

export default function ShopScreen() {
  const colors  = useColors();
  const insets  = useSafeAreaInsets();
  const { citizen, refreshCitizen, authHeaders } = useCitizen();
  const router  = useRouter();
  const { t }   = useLanguage();

  const [amountStr, setAmountStr] = useState("100");
  const [loading,   setLoading]   = useState(false);
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const TIERS = useMemo(() => getTiers(t), [t]);

  const amount = useMemo(() => {
    const n = parseInt(amountStr, 10);
    return isNaN(n) || n < 1 ? 0 : n;
  }, [amountStr]);

  const price = useMemo(() => (amount > 0 ? calcPrice(amount) : null), [amount]);

  const activeTierIdx = TIERS.findLastIndex(tier => amount >= tier.from);

  const styles = getStyles(colors);

  async function handleBuy() {
    if (!citizen) {
      Alert.alert(t.shop_need_auth, t.shop_register_cta);
      return;
    }
    if (amount < 1) {
      Alert.alert(t.error, t.shop_enter_min_error);
      return;
    }
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const domain     = process.env.EXPO_PUBLIC_DOMAIN ?? "";
      const successUrl = `https://${domain}/api/payments/success`;
      const cancelUrl  = `https://${domain}/api/payments/cancel`;

      const res = await fetch(`${BASE_URL}/api/payments/checkout-custom`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ citizenId: citizen.id, amount, successUrl, cancelUrl }),
      });

      const data = await res.json() as { url?: string; error?: string };

      if (!res.ok || !data.url) {
        Alert.alert(t.error, data.error ?? t.shop_payment_error);
        return;
      }

      const result = await WebBrowser.openBrowserAsync(data.url, {
        dismissButtonStyle: "close",
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
        toolbarColor: "#0D1B2A",
      });

      if (result.type === "dismiss" || result.type === "cancel") {
        await refreshCitizen();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch {
      Alert.alert(t.connection_error, t.no_internet);
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={[styles.container, { paddingTop: topPad }]}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.75}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>

        {/* Header */}
        <View style={styles.headerSection}>
          <LogoBrand size={64} />
          <Text style={styles.title}>{t.shop_title}</Text>
          <Text style={styles.subtitle}>{t.shop_subtitle}</Text>
          {citizen && (
            <View style={styles.balanceBadge}>
              <Feather name="clock" size={14} color={colors.primary} />
              <Text style={styles.balanceBadgeText}>{t.eco_balance}: {citizen.balanceMinutes} Д</Text>
            </View>
          )}
        </View>

        {!citizen && (
          <View style={styles.authWarn}>
            <Feather name="alert-circle" size={18} color={colors.primary} />
            <Text style={styles.authWarnText}>{t.shop_register_hint}</Text>
          </View>
        )}

        {/* Calculator card */}
        <View style={styles.calcCard}>
          {/* Input label */}
          <Text style={styles.inputLabel}>{t.shop_amount_label}</Text>

          {/* Text input */}
          <TextInput
            style={[styles.amountInput, { color: colors.foreground, borderColor: colors.border }]}
            value={amountStr}
            onChangeText={setAmountStr}
            keyboardType="number-pad"
            placeholder={t.shop_amount_placeholder}
            placeholderTextColor={colors.mutedForeground}
            selectTextOnFocus
          />

          {/* Quick-pick buttons */}
          <View style={styles.quickRow}>
            {QUICK_AMOUNTS.map(n => (
              <TouchableOpacity
                key={n}
                style={[
                  styles.quickBtn,
                  amount === n && { borderColor: colors.primary, backgroundColor: colors.goldGlow },
                ]}
                onPress={() => {
                  setAmountStr(String(n));
                  Haptics.selectionAsync();
                }}
                activeOpacity={0.7}
              >
                <Text style={[styles.quickBtnText, amount === n && { color: colors.primary }]}>
                  {n >= 1000 ? `${n / 1000}k` : n}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Price breakdown */}
          {price && amount > 0 ? (
            <>
              <View style={styles.priceRow}>
                <View style={[styles.priceBox, { borderColor: colors.border }]}>
                  <Text style={styles.priceBoxLabel}>{t.stats_base_price}</Text>
                  <Text style={[styles.priceBoxValue, { color: colors.foreground }]}>
                    {price.baseEur.toFixed(2)} €
                  </Text>
                </View>
                <View style={[
                  styles.priceBox,
                  price.discountPct > 0
                    ? { borderColor: "#22c55e55", backgroundColor: "#052e1680" }
                    : { borderColor: colors.border },
                ]}>
                  <Text style={styles.priceBoxLabel}>{t.shop_discount_label}</Text>
                  <Text style={[
                    styles.priceBoxValue,
                    { color: price.discountPct > 0 ? "#4ade80" : colors.mutedForeground },
                  ]}>
                    {price.discountPct > 0 ? `−${price.discountPct}%` : t.shop_no_discount_val}
                  </Text>
                </View>
              </View>

              <View style={[styles.totalBox, { borderColor: colors.primary + "55", backgroundColor: colors.goldGlow }]}>
                <View>
                  <Text style={styles.totalLabel}>{t.shop_total_label}</Text>
                  <Text style={[styles.totalValue, { color: colors.primary }]}>
                    {price.totalEur.toFixed(2)} €
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={styles.totalLabel}>{t.shop_per_darmin_label}</Text>
                  <Text style={[styles.perDarminValue, { color: colors.mutedForeground }]}>
                    {price.eurPerDarmin.toFixed(2)} €/Д
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                style={[styles.buyBtn, (!citizen || loading) && styles.buyBtnDisabled]}
                onPress={() => void handleBuy()}
                disabled={loading || !citizen}
                activeOpacity={0.85}
              >
                {loading ? (
                  <ActivityIndicator color={colors.primaryForeground} />
                ) : (
                  <>
                    <Feather name="credit-card" size={18} color={colors.primaryForeground} />
                    <Text style={[styles.buyBtnText, { color: colors.primaryForeground }]}>
                      {amount} Д — {price.totalEur.toFixed(2)} €
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          ) : (
            <View style={[styles.emptyHint, { borderColor: colors.border }]}>
              <Text style={[styles.emptyHintText, { color: colors.mutedForeground }]}>
                {t.shop_empty_hint}
              </Text>
            </View>
          )}
        </View>

        {/* Discount tiers */}
        <View style={styles.tiersSection}>
          <View style={styles.tiersHeader}>
            <Feather name="zap" size={13} color={colors.mutedForeground} />
            <Text style={[styles.tiersTitle, { color: colors.mutedForeground }]}>
              {t.shop_progressive_discounts}
            </Text>
          </View>
          <View style={styles.tiersGrid}>
            {TIERS.map((tier, i) => {
              const active = i === activeTierIdx;
              return (
                <View
                  key={tier.from}
                  style={[
                    styles.tierBox,
                    { borderColor: active ? colors.primary : colors.border },
                    active && { backgroundColor: colors.goldGlow },
                  ]}
                >
                  <Text style={[styles.tierLabel, active && { color: colors.primary }]}>
                    {tier.label}
                  </Text>
                  <Text style={[
                    styles.tierDiscount,
                    { color: tier.discount > 0 ? (active ? colors.primary : "#4ade80") : colors.mutedForeground },
                  ]}>
                    {tier.discount > 0
                      ? `${t.shop_tier_discount_prefix} ${tier.discount}%`
                      : t.shop_tier_no_discount}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* Legal */}
        <View style={styles.legalSection}>
          <Feather name="shield" size={13} color={colors.mutedForeground} />
          <Text style={[styles.legalText, { color: colors.mutedForeground }]}>
            {t.shop_legal}
          </Text>
        </View>
        <View style={styles.webhookNote}>
          <Feather name="info" size={13} color={colors.mutedForeground} />
          <Text style={[styles.legalText, { color: colors.mutedForeground }]}>
            {t.shop_webhook_note}
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function getStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    container:        { flex: 1, backgroundColor: colors.background, paddingHorizontal: 20 },
    backBtn:          { width: 40, height: 40, alignItems: "center", justifyContent: "center", marginBottom: 4 },
    headerSection:    { alignItems: "center", paddingVertical: 16, gap: 8 },
    title:            { fontSize: 26, fontFamily: "Inter_700Bold", color: colors.foreground, letterSpacing: 0.5 },
    subtitle:         { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "center" },
    balanceBadge:     { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.goldGlow, borderWidth: 1, borderColor: colors.primary, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, marginTop: 4 },
    balanceBadgeText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.primary },
    authWarn:         { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.primary, marginBottom: 12 },
    authWarnText:     { fontSize: 14, fontFamily: "Inter_500Medium", color: colors.foreground, flex: 1 },
    calcCard:         { backgroundColor: colors.card, borderRadius: 16, padding: 18, borderWidth: 1, borderColor: colors.border, gap: 14, marginBottom: 16 },
    inputLabel:       { fontSize: 12, fontFamily: "Inter_500Medium", color: colors.mutedForeground, letterSpacing: 0.5 },
    amountInput:      { fontSize: 24, fontFamily: "Inter_700Bold", borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: colors.background },
    quickRow:         { flexDirection: "row", gap: 8 },
    quickBtn:         { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingVertical: 8, alignItems: "center" },
    quickBtnText:     { fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground },
    priceRow:         { flexDirection: "row", gap: 10 },
    priceBox:         { flex: 1, borderWidth: 1, borderRadius: 10, padding: 12, gap: 4 },
    priceBoxLabel:    { fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
    priceBoxValue:    { fontSize: 20, fontFamily: "Inter_700Bold" },
    totalBox:         { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14 },
    totalLabel:       { fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginBottom: 2 },
    totalValue:       { fontSize: 28, fontFamily: "Inter_700Bold" },
    perDarminValue:   { fontSize: 16, fontFamily: "Inter_600SemiBold" },
    buyBtn:           { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 16 },
    buyBtnDisabled:   { opacity: 0.45 },
    buyBtnText:       { fontSize: 16, fontFamily: "Inter_700Bold" },
    emptyHint:        { borderWidth: 1, borderRadius: 8, padding: 12, alignItems: "center" },
    emptyHintText:    { fontSize: 13, fontFamily: "Inter_400Regular" },
    tiersSection:     { marginBottom: 16, gap: 10 },
    tiersHeader:      { flexDirection: "row", alignItems: "center", gap: 6 },
    tiersTitle:       { fontSize: 12, fontFamily: "Inter_500Medium", letterSpacing: 0.5 },
    tiersGrid:        { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    tierBox:          { borderWidth: 1, borderRadius: 8, padding: 10, minWidth: "45%", flex: 1 },
    tierLabel:        { fontSize: 11, fontFamily: "Inter_600SemiBold", color: colors.foreground, marginBottom: 2 },
    tierDiscount:     { fontSize: 12, fontFamily: "Inter_700Bold" },
    legalSection:     { flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: colors.card, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: colors.border, marginBottom: 8 },
    webhookNote:      { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 12 },
    legalText:        { flex: 1, fontSize: 11, fontFamily: "Inter_400Regular", lineHeight: 17 },
  });
}
