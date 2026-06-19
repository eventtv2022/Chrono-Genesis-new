import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  Linking,
} from "react-native";
import SignatureCanvas from "react-native-signature-canvas";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useCitizen, CitizenProfile } from "@/context/CitizenContext";
import { useColors } from "@/hooks/useColors";
import { LogoBrand } from "@/components/LogoBrand";

const BASE_URL = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;

type Mode = "choose" | "register" | "login" | "pending" | "issued";

interface PendingData {
  citizenNumber: string;
  availableAt: string; // ISO
  citizenId: number;
  citizenName: string;
}

function pad2(n: number) { return String(n).padStart(2, "0"); }

function formatCountdown(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
}

export default function RegisterScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { setCitizen } = useCitizen();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [mode, setMode] = useState<Mode>("choose");

  // Registration form
  const [name, setName] = useState("");
  const [surname, setSurname] = useState("");
  const [givenNames, setGivenNames] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState(""); // YYYY-MM-DD
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [signatureBase64, setSignatureBase64] = useState<string | null>(null);

  // Login
  const [loginPhone, setLoginPhone] = useState("");

  // Pending / issued
  const [pendingData, setPendingData] = useState<PendingData | null>(null);
  const [countdown, setCountdown] = useState(3600);
  const [issuedPassportUrl, setIssuedPassportUrl] = useState<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const styles = getStyles(colors);

  // ── Countdown + auto-poll ─────────────────────────────────────────────────
  useEffect(() => {
    if (mode !== "pending" || !pendingData) return;

    const computeLeft = () => {
      const left = Math.max(0, Math.ceil((new Date(pendingData.availableAt).getTime() - Date.now()) / 1000));
      setCountdown(left);
      return left;
    };

    computeLeft();
    const tick = setInterval(computeLeft, 1000);

    const poll = async () => {
      if (!pendingData) return;
      try {
        const res = await fetch(`${BASE_URL}/api/citizens/number/${pendingData.citizenNumber}/status`);
        if (!res.ok) return;
        const data = await res.json() as { status: string; idCardUrl?: string };
        if (data.status === "issued") {
          clearInterval(tick);
          if (pollTimerRef.current) clearInterval(pollTimerRef.current);
          setIssuedPassportUrl(data.idCardUrl ?? null);
          setMode("issued");
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      } catch {}
    };

    // Poll every 15s
    pollTimerRef.current = setInterval(poll, 15_000);

    return () => {
      clearInterval(tick);
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [mode, pendingData]);

  // ── Register ──────────────────────────────────────────────────────────────
  async function handleRegister() {
    const n = name.trim() || `${surname.trim()} ${givenNames.trim()}`.trim();
    if (!n || !phone.trim()) {
      Alert.alert("Заполни обязательные поля", "Имя и номер телефона обязательны.");
      return;
    }
    setLoading(true);
    try {
      const body: Record<string, string> = {
        name: n,
        phone: phone.trim(),
      };
      if (surname.trim()) body["surname"] = surname.trim();
      if (givenNames.trim()) body["givenNames"] = givenNames.trim();
      if (dateOfBirth.trim().match(/^\d{4}-\d{2}-\d{2}$/)) body["dateOfBirth"] = dateOfBirth.trim();
      if (signatureBase64) body["signatureBase64"] = signatureBase64;

      const res = await fetch(`${BASE_URL}/api/citizens`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json() as (CitizenProfile & {
        citizenNumber?: string;
        availableAt?: string;
        registrationStatus?: string;
      }) | { error: string };

      if (!res.ok) {
        Alert.alert("Ошибка", (data as { error: string }).error);
        return;
      }

      const cd = data as CitizenProfile & {
        citizenNumber?: string;
        availableAt?: string;
        registrationStatus?: string;
      };

      // Store citizen in context so they can use the app during pending period
      setCitizen(cd as CitizenProfile);
      queryClient.invalidateQueries({ queryKey: ["citizens"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      if (cd.citizenNumber && cd.availableAt) {
        setPendingData({
          citizenNumber: cd.citizenNumber,
          availableAt: cd.availableAt,
          citizenId: cd.id,
          citizenName: cd.name,
        });
        setMode("pending");
      } else {
        router.back();
      }
    } catch {
      Alert.alert("Ошибка соединения");
    } finally {
      setLoading(false);
    }
  }

  // ── Login ─────────────────────────────────────────────────────────────────
  async function handleLogin() {
    if (!loginPhone.trim()) { Alert.alert("Введи номер телефона"); return; }
    setLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/api/citizens/by-phone/${encodeURIComponent(loginPhone.trim())}`);
      const data = await res.json() as CitizenProfile | { error: string };
      if (!res.ok) { Alert.alert("Гражданин не найден", "Проверь номер или зарегистрируйся"); return; }
      setCitizen(data as CitizenProfile);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } finally { setLoading(false); }
  }

  // ── Open passport ─────────────────────────────────────────────────────────
  function openPassport() {
    if (!pendingData && !issuedPassportUrl) return;
    const num = pendingData?.citizenNumber;
    const url = issuedPassportUrl
      ? `${BASE_URL}${issuedPassportUrl}`
      : `${BASE_URL}/api/citizens/number/${num}/passport`;
    void Linking.openURL(url);
  }

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <ScrollView
      style={[styles.scroll, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.container, { paddingTop: topPad }]}
      keyboardShouldPersistTaps="handled"
    >
      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.75}>
        <Feather name="arrow-left" size={22} color={colors.foreground} />
      </TouchableOpacity>

      <View style={styles.logoSection}>
        <LogoBrand size={72} />
        <Text style={[styles.title, { color: colors.foreground }]}>TimeNation</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Цифровое государство</Text>
      </View>

      {/* ── CHOOSE ── */}
      {mode === "choose" && (
        <View style={styles.section}>
          <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: colors.primary }]} onPress={() => setMode("register")} activeOpacity={0.8}>
            <Feather name="user-plus" size={18} color={colors.primaryForeground} />
            <Text style={[styles.primaryBtnText, { color: colors.primaryForeground }]}>Стать гражданином</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.secondaryBtn, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => setMode("login")} activeOpacity={0.8}>
            <Feather name="log-in" size={18} color={colors.foreground} />
            <Text style={[styles.secondaryBtnText, { color: colors.foreground }]}>Войти по телефону</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.secondaryBtn, { backgroundColor: "transparent", borderColor: colors.border }]}
            onPress={() => router.push("/passport-lookup")}
            activeOpacity={0.8}
          >
            <Feather name="file-text" size={18} color={colors.mutedForeground} />
            <Text style={[styles.secondaryBtnText, { color: colors.mutedForeground }]}>Найти мой паспорт</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── REGISTER ── */}
      {mode === "register" && (
        <View style={styles.section}>
          <Text style={[styles.formTitle, { color: colors.foreground }]}>Регистрация</Text>

          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>ФАМИЛИЯ</Text>
          <TextInput style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
            value={surname} onChangeText={setSurname} placeholder="Иванов" placeholderTextColor={colors.mutedForeground} autoFocus />

          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>ИМЯ И ОТЧЕСТВО</Text>
          <TextInput style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
            value={givenNames} onChangeText={setGivenNames} placeholder="Иван Иванович" placeholderTextColor={colors.mutedForeground} />

          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>ПСЕВДОНИМ (если нет ФИО)</Text>
          <TextInput style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
            value={name} onChangeText={setName} placeholder="Отображаемое имя" placeholderTextColor={colors.mutedForeground} />

          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>ДАТА РОЖДЕНИЯ</Text>
          <TextInput style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
            value={dateOfBirth} onChangeText={setDateOfBirth} placeholder="ГГГГ-ММ-ДД" placeholderTextColor={colors.mutedForeground} />

          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>ТЕЛЕФОН *</Text>
          <TextInput style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
            value={phone} onChangeText={setPhone} placeholder="+7..." placeholderTextColor={colors.mutedForeground} keyboardType="phone-pad" />

          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>ПОДПИСЬ *</Text>
          <View style={[styles.signatureContainer, { borderColor: colors.border }]}>
            <SignatureCanvas
              onOK={(sig: string) => setSignatureBase64(sig)}
              onEmpty={() => setSignatureBase64(null)}
              penColor="rgb(10, 30, 80)"
              backgroundColor="rgba(255,255,255,0.04)"
              descriptionText=""
              clearText="Очистить"
              confirmText="Сохранить"
              webStyle={`.m-signature-pad{box-shadow:none;border:none;height:100%}.m-signature-pad--body{border:none;background:transparent}.m-signature-pad--footer{background:#111;padding:4px}.m-signature-pad--footer .button{background:#222;border:1px solid #333;color:#aaa;font-size:13px;border-radius:6px;padding:4px 12px}`}
              style={{ height: 150 }}
            />
          </View>
          {signatureBase64 && (
            <Text style={[styles.signatureStatus, { color: "#22c55e" }]}>✓ Подпись сохранена</Text>
          )}

          <View style={[styles.infoBox, { backgroundColor: colors.primary + "15", borderColor: colors.primary + "40" }]}>
            <Feather name="clock" size={14} color={colors.primary} />
            <Text style={[styles.infoText, { color: colors.mutedForeground }]}>
              После регистрации данные проходят 60-минутную верификацию. Вы сразу получите доступ к системе, а цифровой паспорт будет выдан после проверки.
            </Text>
          </View>

          <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: colors.primary, opacity: loading ? 0.6 : 1 }]} onPress={handleRegister} disabled={loading} activeOpacity={0.8}>
            {loading ? <ActivityIndicator color={colors.primaryForeground} /> : (
              <>
                <Feather name="user-check" size={18} color={colors.primaryForeground} />
                <Text style={[styles.primaryBtnText, { color: colors.primaryForeground }]}>Зарегистрироваться</Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelBtn} onPress={() => setMode("choose")} activeOpacity={0.8}>
            <Text style={[styles.cancelBtnText, { color: colors.mutedForeground }]}>Назад</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── LOGIN ── */}
      {mode === "login" && (
        <View style={styles.section}>
          <Text style={[styles.formTitle, { color: colors.foreground }]}>Вход</Text>
          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>ТЕЛЕФОН</Text>
          <TextInput style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
            value={loginPhone} onChangeText={setLoginPhone} placeholder="+7..." placeholderTextColor={colors.mutedForeground} keyboardType="phone-pad" autoFocus />
          <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: colors.primary, opacity: loading ? 0.6 : 1 }]} onPress={handleLogin} disabled={loading} activeOpacity={0.8}>
            {loading ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={[styles.primaryBtnText, { color: colors.primaryForeground }]}>Войти</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelBtn} onPress={() => setMode("choose")} activeOpacity={0.8}>
            <Text style={[styles.cancelBtnText, { color: colors.mutedForeground }]}>Назад</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── PENDING ── */}
      {mode === "pending" && pendingData && (
        <View style={styles.section}>
          <View style={[styles.pendingHeader, { backgroundColor: colors.primary + "15", borderColor: colors.primary + "40" }]}>
            <Feather name="shield" size={32} color={colors.primary} />
            <Text style={[styles.pendingTitle, { color: colors.foreground }]}>Верификация данных</Text>
            <Text style={[styles.pendingSubtitle, { color: colors.mutedForeground }]}>
              Ваши данные приняты и отправлены на проверку. Инспекция займёт ровно 60 минут.
            </Text>
          </View>

          <View style={[styles.countdownBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.countdownLabel, { color: colors.mutedForeground }]}>ОСТАЛОСЬ</Text>
            <Text style={[styles.countdownValue, { color: countdown > 0 ? colors.foreground : "#22c55e" }]}>
              {countdown > 0 ? formatCountdown(countdown) : "00:00:00"}
            </Text>
            {countdown <= 0 && (
              <View style={styles.checkingRow}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={[styles.checkingText, { color: colors.mutedForeground }]}>Получаем паспорт…</Text>
              </View>
            )}
          </View>

          <View style={[styles.idBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.idLabel, { color: colors.mutedForeground }]}>НОМЕР ГРАЖДАНИНА</Text>
            <Text style={[styles.idValue, { color: colors.primary }]}>{pendingData.citizenNumber}</Text>
            <Text style={[styles.idNote, { color: colors.mutedForeground }]}>Сохраните этот номер — он ваш идентификатор в TimeNation</Text>
          </View>

          <TouchableOpacity style={[styles.secondaryBtn, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => router.back()}>
            <Feather name="home" size={16} color={colors.foreground} />
            <Text style={[styles.secondaryBtnText, { color: colors.foreground }]}>Перейти в приложение</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── ISSUED ── */}
      {mode === "issued" && pendingData && (
        <View style={styles.section}>
          <View style={[styles.issuedHeader, { backgroundColor: "#22c55e15", borderColor: "#22c55e40" }]}>
            <Feather name="award" size={36} color="#22c55e" />
            <Text style={[styles.pendingTitle, { color: colors.foreground }]}>Паспорт выдан!</Text>
            <Text style={[styles.pendingSubtitle, { color: colors.mutedForeground }]}>
              Верификация завершена. Вы — полноправный Гражданин TimeNation.
            </Text>
          </View>

          <View style={[styles.idBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.idLabel, { color: colors.mutedForeground }]}>НОМЕР ГРАЖДАНИНА</Text>
            <Text style={[styles.idValue, { color: colors.primary }]}>{pendingData.citizenNumber}</Text>
            <Text style={[styles.idName, { color: colors.foreground }]}>{pendingData.citizenName}</Text>
          </View>

          <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: "#22c55e" }]} onPress={openPassport} activeOpacity={0.8}>
            <Feather name="credit-card" size={18} color="#fff" />
            <Text style={[styles.primaryBtnText, { color: "#fff" }]}>Открыть цифровой паспорт</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.secondaryBtn, { backgroundColor: colors.card, borderColor: colors.border, marginTop: 8 }]} onPress={() => router.back()}>
            <Feather name="home" size={16} color={colors.foreground} />
            <Text style={[styles.secondaryBtnText, { color: colors.foreground }]}>На главную</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

function getStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    scroll: { flex: 1 },
    container: { paddingHorizontal: 24, paddingBottom: 48 },
    backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center", marginBottom: 4 },
    logoSection: { alignItems: "center", paddingVertical: 32, gap: 10 },
    title: { fontSize: 26, fontFamily: "Inter_700Bold", letterSpacing: 1 },
    subtitle: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
    section: { gap: 4 },
    formTitle: { fontSize: 22, fontFamily: "Inter_700Bold", marginBottom: 12 },
    fieldLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 1.2, marginBottom: 5, marginTop: 10 },
    input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 13, fontSize: 15, fontFamily: "Inter_400Regular" },
    infoBox: { flexDirection: "row", gap: 10, borderWidth: 1, borderRadius: 10, padding: 12, marginTop: 12, marginBottom: 4, alignItems: "flex-start" },
    infoText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 18 },
    primaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, borderRadius: 14, padding: 16, marginTop: 12 },
    primaryBtnText: { fontSize: 16, fontFamily: "Inter_700Bold" },
    secondaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, borderRadius: 14, padding: 16, borderWidth: 1, marginTop: 4 },
    secondaryBtnText: { fontSize: 15, fontFamily: "Inter_500Medium" },
    cancelBtn: { padding: 14, alignItems: "center", marginTop: 4 },
    cancelBtnText: { fontSize: 15, fontFamily: "Inter_500Medium" },
    // Pending
    pendingHeader: { alignItems: "center", gap: 12, borderWidth: 1, borderRadius: 16, padding: 24, marginBottom: 16 },
    pendingTitle: { fontSize: 22, fontFamily: "Inter_700Bold", textAlign: "center" },
    pendingSubtitle: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
    countdownBox: { alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 16, padding: 24 },
    countdownLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 2 },
    countdownValue: { fontSize: 52, fontFamily: "Inter_700Bold", fontVariant: ["tabular-nums"], letterSpacing: 4 },
    checkingRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    checkingText: { fontSize: 13, fontFamily: "Inter_400Regular" },
    idBox: { borderWidth: 1, borderRadius: 16, padding: 20, gap: 6 },
    idLabel: { fontSize: 10, fontFamily: "Inter_600SemiBold", letterSpacing: 1.5 },
    idValue: { fontSize: 28, fontFamily: "Inter_700Bold", letterSpacing: 4, fontVariant: ["tabular-nums"] },
    idName: { fontSize: 16, fontFamily: "Inter_500Medium" },
    idNote: { fontSize: 11, fontFamily: "Inter_400Regular", lineHeight: 16 },
    issuedHeader: { alignItems: "center", gap: 12, borderWidth: 1, borderRadius: 16, padding: 24, marginBottom: 16 },
    signatureContainer: { borderWidth: 1, borderRadius: 12, overflow: "hidden", height: 150, marginTop: 4 },
    signatureStatus: { fontSize: 12, fontFamily: "Inter_500Medium", marginTop: 4 },
  });
}
