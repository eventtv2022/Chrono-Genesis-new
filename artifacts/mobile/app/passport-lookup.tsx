import { getBaseUrl } from "@/lib/api";
import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Platform,
  Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { useRouter } from "expo-router";
import { useColors } from "@/hooks/useColors";
import { useLanguage } from "@/context/LanguageContext";

const BASE_URL = getBaseUrl();

interface LookupResult {
  status: "issued" | "pending";
  citizenNumber: string;
  name?: string;
  rank?: string;
  idCardUrl?: string;
  passportUrl?: string;
  message?: string;
}

export default function PassportLookupScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { lang, setLang } = useLanguage();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const loginLang: "ru" | "en" = lang === "ru" ? "ru" : "en";
  const t = (ru: string, en: string) => loginLang === "ru" ? ru : en;

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<LookupResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const styles = getStyles(colors);

  async function handleLookup() {
    const raw = input.trim().replace(/\D/g, "");
    if (!raw) return;
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const res = await fetch(`${BASE_URL}/api/citizens/lookup/${raw}`);
      const data = await res.json() as LookupResult & { error?: string };
      if (!res.ok) {
        setError(data.error ?? t("Гражданин не найден в реестре", "Citizen not found in registry"));
        return;
      }
      setResult(data);
    } catch {
      setError(t("Ошибка соединения с реестром", "Registry connection error"));
    } finally {
      setLoading(false);
    }
  }

  async function openDoc(url: string) {
    const fullUrl = url.startsWith("http") ? url : `${BASE_URL}${url}`;
    if (Platform.OS === "web") {
      Linking.openURL(fullUrl);
    } else {
      await WebBrowser.openBrowserAsync(fullUrl, { toolbarColor: "#0D1B2A" });
    }
  }

  return (
    <ScrollView
      style={[styles.container, { paddingTop: topPad }]}
      contentContainerStyle={{ paddingBottom: 60 }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <View style={{ marginLeft: 12, flex: 1 }}>
          <Text style={styles.title}>{t("МОЙ ПАСПОРТ", "MY PASSPORT")}</Text>
          <Text style={styles.subtitle}>{t("Восстановление доступа к документам", "Document access recovery")}</Text>
        </View>
        {/* RU | EN toggle */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
          <TouchableOpacity
            onPress={() => setLang("ru")}
            style={[styles.langBtn, loginLang === "ru" && styles.langBtnActive]}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 4 }}
          >
            <Text style={[styles.langBtnText, loginLang === "ru" && styles.langBtnTextActive]}>RU</Text>
          </TouchableOpacity>
          <Text style={styles.langSep}>|</Text>
          <TouchableOpacity
            onPress={() => setLang("en")}
            style={[styles.langBtn, loginLang === "en" && styles.langBtnActive]}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
          >
            <Text style={[styles.langBtnText, loginLang === "en" && styles.langBtnTextActive]}>EN</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.fieldLabel}>{t("НОМЕР ГРАЖДАНИНА (9 ЦИФР)", "CITIZEN NUMBER (9 DIGITS)")}</Text>
        <TextInput
          style={styles.numberInput}
          value={input}
          onChangeText={(v) => setInput(v.replace(/\D/g, "").slice(0, 9))}
          placeholder="000000000"
          placeholderTextColor={colors.mutedForeground + "66"}
          keyboardType="number-pad"
          maxLength={9}
          autoFocus
        />
        <Text style={styles.hint}>{t("Номер выдан при регистрации · только цифры", "Number issued at registration · digits only")}</Text>

        <TouchableOpacity
          style={[styles.searchBtn, { opacity: loading || input.replace(/\D/g, "").length === 0 ? 0.4 : 1 }]}
          onPress={handleLookup}
          disabled={loading || input.replace(/\D/g, "").length === 0}
          activeOpacity={0.8}
        >
          {loading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Feather name="search" size={16} color="#fff" />
              <Text style={styles.searchBtnText}>{t("ПОЛУЧИТЬ ДОКУМЕНТЫ", "GET DOCUMENTS")}</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {error && (
        <View style={[styles.alertBox, { backgroundColor: colors.destructive + "18", borderColor: colors.destructive + "44" }]}>
          <Feather name="alert-circle" size={18} color={colors.destructive} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.alertTitle, { color: colors.destructive }]}>{t("Гражданин не найден", "Citizen not found")}</Text>
            <Text style={[styles.alertBody, { color: colors.mutedForeground }]}>{error}</Text>
          </View>
        </View>
      )}

      {result?.status === "pending" && (
        <View style={[styles.alertBox, { backgroundColor: "#f59e0b18", borderColor: "#f59e0b44" }]}>
          <Feather name="clock" size={18} color="#f59e0b" />
          <View style={{ flex: 1 }}>
            <Text style={[styles.alertTitle, { color: "#f59e0b" }]}>{t("ВЕРИФИКАЦИЯ В ПРОЦЕССЕ", "VERIFICATION IN PROGRESS")}</Text>
            <Text style={[styles.alertBody, { color: colors.mutedForeground }]}>{result.message}</Text>
            <Text style={[styles.alertBody, { color: colors.mutedForeground, marginTop: 4 }]}>
              {t("Номер гражданина:", "Citizen number:")}{" "}
              <Text style={{ color: colors.foreground, fontFamily: "Inter_700Bold", letterSpacing: 2 }}>
                {result.citizenNumber}
              </Text>
            </Text>
          </View>
        </View>
      )}

      {result?.status === "issued" && (
        <View style={styles.resultCard}>
          <View style={styles.resultHeader}>
            <Text style={styles.resultLabel}>{t("ГРАЖДАНИН ПОДТВЕРЖДЁН", "CITIZEN VERIFIED")}</Text>
            <Text style={[styles.resultNumber, { color: colors.primary }]}>{result.citizenNumber}</Text>
            <Text style={styles.resultName}>{result.name}</Text>
            {result.rank && <Text style={styles.resultRank}>{result.rank}</Text>}
          </View>

          <Text style={[styles.fieldLabel, { marginBottom: 10 }]}>{t("ДОКУМЕНТЫ", "DOCUMENTS")}</Text>

          {result.idCardUrl && (
            <TouchableOpacity
              style={[styles.docBtn, { backgroundColor: colors.primary + "18", borderColor: colors.primary + "55" }]}
              onPress={() => openDoc(result.idCardUrl!)}
              activeOpacity={0.8}
            >
              <Feather name="credit-card" size={20} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.docBtnTitle, { color: colors.primary }]}>{t("ID-КАРТА TIMENATION", "TIMENATION ID CARD")}</Text>
              </View>
              <Feather name="external-link" size={15} color={colors.primary + "88"} />
            </TouchableOpacity>
          )}

          {result.passportUrl && (
            <TouchableOpacity
              style={[styles.docBtn, { backgroundColor: colors.muted, borderColor: colors.border }]}
              onPress={() => openDoc(result.passportUrl!)}
              activeOpacity={0.8}
            >
              <Feather name="file-text" size={20} color={colors.mutedForeground} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.docBtnTitle, { color: colors.foreground }]}>{t("ПАСПОРТ (КЛАССИЧЕСКИЙ)", "PASSPORT (CLASSIC)")}</Text>
              </View>
              <Feather name="external-link" size={15} color={colors.mutedForeground} />
            </TouchableOpacity>
          )}

          <Text style={[styles.hint, { textAlign: "center", marginTop: 12 }]}>
            {t("Откройте ссылку и сохраните файл через «Сохранить как»", "Open the link and save the file via \"Save as\"")}
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

function getStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
    title: { fontSize: 16, fontFamily: "Inter_700Bold", color: colors.foreground, letterSpacing: 2 },
    subtitle: { fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 1 },
    langBtn: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 5, borderWidth: 1, borderColor: colors.border },
    langBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    langBtnText: { fontSize: 10, fontFamily: "Inter_700Bold", color: colors.mutedForeground, letterSpacing: 0.5 },
    langBtnTextActive: { color: colors.primaryForeground },
    langSep: { fontSize: 10, color: colors.mutedForeground + "55", marginHorizontal: 1 },
    card: { margin: 16, padding: 20, backgroundColor: colors.card, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
    fieldLabel: { fontSize: 10, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground, letterSpacing: 1.5, marginBottom: 8 },
    numberInput: {
      height: 56,
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      paddingHorizontal: 16,
      fontSize: 24,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
      textAlign: "center",
      letterSpacing: 8,
    },
    hint: { fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 6, marginBottom: 16 },
    searchBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      backgroundColor: colors.primary,
      height: 50,
      borderRadius: 12,
    },
    searchBtnText: { fontSize: 14, fontFamily: "Inter_700Bold", color: "#fff", letterSpacing: 0.5 },
    alertBox: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginHorizontal: 16, marginBottom: 12, padding: 16, borderRadius: 12, borderWidth: 1 },
    alertTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold", letterSpacing: 0.5 },
    alertBody: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
    resultCard: { margin: 16, padding: 20, backgroundColor: colors.card, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
    resultHeader: { paddingBottom: 16, marginBottom: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, gap: 3 },
    resultLabel: { fontSize: 10, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground, letterSpacing: 1.5 },
    resultNumber: { fontSize: 26, fontFamily: "Inter_700Bold", letterSpacing: 4, marginTop: 2 },
    resultName: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: colors.foreground },
    resultRank: { fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
    docBtn: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderRadius: 10, borderWidth: 1, marginBottom: 8 },
    docBtnTitle: { fontSize: 13, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  });
}
