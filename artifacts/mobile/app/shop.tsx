import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as WebBrowser from "expo-web-browser";
import { useRouter } from "expo-router";
import { useCitizen } from "@/context/CitizenContext";
import { useColors } from "@/hooks/useColors";
import { LogoBrand } from "@/components/LogoBrand";

const BASE_URL = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;

interface Package {
  id: string;
  minutes: number;
  price: number;
  currency: string;
  label: string;
}

const PACKAGES: Package[] = [
  { id: "pack_100", minutes: 100, price: 99, currency: "RUB", label: "Стартовый" },
  { id: "pack_500", minutes: 500, price: 449, currency: "RUB", label: "Стандарт" },
  { id: "pack_1000", minutes: 1000, price: 799, currency: "RUB", label: "Элита" },
];

const PACKAGE_ICONS = ["⚡", "🕐", "👑"] as const;
const PACKAGE_PERKS = [
  ["Базовый запас", "Для начинающих граждан"],
  ["Лучшее соотношение", "Популярный выбор"],
  ["Максимальный пакет", "Для активных граждан", "Бонус к Merit Score"],
] as const;

export default function ShopScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { citizen, refreshCitizen } = useCitizen();
  const router = useRouter();

  const [purchasing, setPurchasing] = useState<string | null>(null);
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const styles = getStyles(colors);

  async function handleBuy(pkg: Package) {
    if (!citizen) {
      Alert.alert("Нужна авторизация", "Зарегистрируйся как гражданин");
      return;
    }
    setPurchasing(pkg.id);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const domain = process.env.EXPO_PUBLIC_DOMAIN ?? "";
      const successUrl = `https://${domain}/api/payments/success`;
      const cancelUrl = `https://${domain}/api/payments/cancel`;

      const res = await fetch(`${BASE_URL}/api/payments/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          citizenId: citizen.id,
          packageId: pkg.id,
          successUrl,
          cancelUrl,
        }),
      });

      const data = await res.json() as { url?: string; sessionId?: string; error?: string };

      if (!res.ok || !data.url) {
        Alert.alert("Ошибка", data.error ?? "Не удалось создать сессию оплаты");
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
    } catch (err) {
      Alert.alert("Ошибка соединения", "Проверь интернет и попробуй снова");
    } finally {
      setPurchasing(null);
    }
  }

  return (
    <ScrollView
      style={[styles.container, { paddingTop: topPad }]}
      contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
      showsVerticalScrollIndicator={false}
    >
      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.75}>
        <Feather name="arrow-left" size={22} color={colors.foreground} />
      </TouchableOpacity>

      <View style={styles.headerSection}>
        <LogoBrand size={72} />
        <Text style={styles.title}>Казначейство</Text>
        <Text style={styles.subtitle}>Пополни баланс Минут Валюты через безопасный платёжный шлюз</Text>
        {citizen && (
          <View style={styles.balanceBadge}>
            <Feather name="clock" size={14} color={colors.primary} />
            <Text style={styles.balanceBadgeText}>Текущий баланс: {citizen.balanceMinutes} мин</Text>
          </View>
        )}
      </View>

      {!citizen && (
        <View style={styles.authWarn}>
          <Feather name="alert-circle" size={18} color={colors.primary} />
          <Text style={styles.authWarnText}>Зарегистрируйся, чтобы купить минуты</Text>
        </View>
      )}

      <View style={styles.packagesSection}>
        {PACKAGES.map((pkg, i) => {
          const isLoading = purchasing === pkg.id;
          const isPopular = i === 1;
          const perMinute = (pkg.price / pkg.minutes).toFixed(2);

          return (
            <View key={pkg.id} style={[styles.packageCard, isPopular && styles.packageCardPopular]}>
              {isPopular && (
                <View style={styles.popularBadge}>
                  <Text style={styles.popularBadgeText}>✦ ПОПУЛЯРНЫЙ</Text>
                </View>
              )}

              <View style={styles.packageHeader}>
                <Text style={styles.packageIcon}>{PACKAGE_ICONS[i]}</Text>
                <View style={styles.packageMeta}>
                  <Text style={styles.packageLabel}>{pkg.label}</Text>
                  <Text style={styles.packageMinutes}>{pkg.minutes.toLocaleString()} Минут</Text>
                </View>
                <View style={styles.packagePricing}>
                  <Text style={[styles.packagePrice, isPopular && { color: colors.primary }]}>
                    {pkg.price} ₽
                  </Text>
                  <Text style={styles.packagePpm}>{perMinute} ₽/мин</Text>
                </View>
              </View>

              <View style={styles.packagePerks}>
                {(PACKAGE_PERKS[i] as readonly string[]).map((perk, pi) => (
                  <View key={pi} style={styles.perkRow}>
                    <Feather name="check" size={12} color={isPopular ? colors.primary : colors.success} />
                    <Text style={styles.perkText}>{perk}</Text>
                  </View>
                ))}
              </View>

              <TouchableOpacity
                style={[styles.buyBtn, isPopular && styles.buyBtnPopular, !citizen && styles.buyBtnDisabled]}
                onPress={() => handleBuy(pkg)}
                disabled={isLoading || !citizen || !!purchasing}
                activeOpacity={0.8}
              >
                {isLoading ? (
                  <ActivityIndicator color={isPopular ? colors.primaryForeground : colors.primary} />
                ) : (
                  <>
                    <Feather
                      name="credit-card"
                      size={16}
                      color={isPopular ? colors.primaryForeground : colors.primary}
                    />
                    <Text style={[styles.buyBtnText, isPopular && styles.buyBtnTextPopular]}>
                      Купить за {pkg.price} ₽
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          );
        })}
      </View>

      <View style={styles.legalSection}>
        <Feather name="shield" size={14} color={colors.mutedForeground} />
        <Text style={styles.legalText}>
          Оплата через Stripe. Минуты Валюты — неисключительная лицензия на использование в платформе TimeNation. Не являются электронными деньгами.
        </Text>
      </View>

      <View style={styles.webhookNote}>
        <Feather name="info" size={13} color={colors.mutedForeground} />
        <Text style={styles.webhookNoteText}>
          После оплаты баланс обновится автоматически через Stripe Webhook. Если минуты не зачислились — закрой и снова открой приложение.
        </Text>
      </View>
    </ScrollView>
  );
}

function getStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: 20 },
    backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center", marginBottom: 4 },
    headerSection: { alignItems: "center", paddingVertical: 20, gap: 8 },
    iconRing: {
      width: 72, height: 72, borderRadius: 36,
      backgroundColor: colors.goldGlow, borderWidth: 2, borderColor: colors.primary,
      alignItems: "center", justifyContent: "center",
    },
    title: { fontSize: 26, fontFamily: "Inter_700Bold", color: colors.foreground, letterSpacing: 0.5 },
    subtitle: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "center", lineHeight: 20 },
    balanceBadge: {
      flexDirection: "row", alignItems: "center", gap: 6,
      backgroundColor: colors.goldGlow, borderWidth: 1, borderColor: colors.primary,
      paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, marginTop: 4,
    },
    balanceBadgeText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.primary },
    authWarn: {
      flexDirection: "row", alignItems: "center", gap: 10,
      backgroundColor: colors.card, borderRadius: 12, padding: 14,
      borderWidth: 1, borderColor: colors.primary, marginBottom: 16,
    },
    authWarnText: { fontSize: 14, fontFamily: "Inter_500Medium", color: colors.foreground },
    packagesSection: { gap: 14, marginTop: 8 },
    packageCard: {
      backgroundColor: colors.card, borderRadius: 16, padding: 18,
      borderWidth: 1, borderColor: colors.border, gap: 14,
    },
    packageCardPopular: { borderColor: colors.primary, borderWidth: 2 },
    popularBadge: {
      backgroundColor: colors.primary, alignSelf: "flex-start",
      paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20,
    },
    popularBadgeText: { fontSize: 10, fontFamily: "Inter_700Bold", color: colors.primaryForeground, letterSpacing: 1.5 },
    packageHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
    packageIcon: { fontSize: 32 },
    packageMeta: { flex: 1, gap: 2 },
    packageLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground, textTransform: "uppercase", letterSpacing: 1 },
    packageMinutes: { fontSize: 20, fontFamily: "Inter_700Bold", color: colors.foreground },
    packagePricing: { alignItems: "flex-end", gap: 2 },
    packagePrice: { fontSize: 22, fontFamily: "Inter_700Bold", color: colors.foreground },
    packagePpm: { fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
    packagePerks: { gap: 6 },
    perkRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    perkText: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
    buyBtn: {
      flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
      borderWidth: 1.5, borderColor: colors.primary,
      borderRadius: 12, padding: 14,
    },
    buyBtnPopular: { backgroundColor: colors.primary, borderColor: colors.primary },
    buyBtnDisabled: { opacity: 0.4 },
    buyBtnText: { fontSize: 15, fontFamily: "Inter_700Bold", color: colors.primary },
    buyBtnTextPopular: { color: colors.primaryForeground },
    legalSection: {
      flexDirection: "row", alignItems: "flex-start", gap: 8,
      marginTop: 20, backgroundColor: colors.card,
      borderRadius: 10, padding: 12, borderWidth: 1, borderColor: colors.border,
    },
    legalText: { flex: 1, fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground, lineHeight: 17 },
    webhookNote: {
      flexDirection: "row", alignItems: "flex-start", gap: 8,
      marginTop: 10, padding: 12,
    },
    webhookNoteText: { flex: 1, fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground, lineHeight: 17 },
  });
}
