import { getBaseUrl } from "@/lib/api";
import React, { useState, useEffect, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
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
  Image,
} from "react-native";
import SignatureCanvas from "react-native-signature-canvas";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useCitizen, CitizenProfile } from "@/context/CitizenContext";
import { useLanguage } from "@/context/LanguageContext";
import { UI } from "@/lib/i18n";
import { useColors } from "@/hooks/useColors";
import { LogoBrand } from "@/components/LogoBrand";

// ── Web-only canvas signature pad ────────────────────────────────────────────
function WebSignaturePad({
  onOK, onEmpty, clearRef,
}: { onOK: (sig: string) => void; onEmpty: () => void; clearRef: React.MutableRefObject<(() => void) | null> }) {
  const containerRef = useRef<any>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawing = useRef(false);
  const onOKRef = useRef(onOK);
  useEffect(() => { onOKRef.current = onOK; }, [onOK]);

  useEffect(() => {
    const el = containerRef.current as HTMLElement | null;
    if (!el) return;
    const canvas = document.createElement("canvas");
    canvas.width = el.offsetWidth || 320;
    canvas.height = 150;
    canvas.style.cssText = "width:100%;height:150px;touch-action:none;cursor:crosshair;background:rgba(255,255,255,0.04);border-radius:8px;display:block";
    el.appendChild(canvas);
    canvasRef.current = canvas;
    const ctx = canvas.getContext("2d")!;
    ctx.strokeStyle = "#c9a84c"; ctx.lineWidth = 2.5; ctx.lineCap = "round"; ctx.lineJoin = "round";

    const xy = (e: MouseEvent | TouchEvent) => {
      const r = canvas.getBoundingClientRect();
      const src = "touches" in e ? e.touches[0] : (e as MouseEvent);
      return [src.clientX - r.left, src.clientY - r.top] as const;
    };
    const autoConfirm = () => {
      isDrawing.current = false;
      onOKRef.current(canvas.toDataURL("image/png"));
    };
    const down = (e: MouseEvent | TouchEvent) => { e.preventDefault(); isDrawing.current = true; const [x,y] = xy(e); ctx.beginPath(); ctx.moveTo(x,y); };
    const move = (e: MouseEvent | TouchEvent) => { if (!isDrawing.current) return; e.preventDefault(); const [x,y] = xy(e); ctx.lineTo(x,y); ctx.stroke(); };

    canvas.addEventListener("mousedown", down); canvas.addEventListener("mousemove", move); canvas.addEventListener("mouseup", autoConfirm);
    canvas.addEventListener("touchstart", down, { passive: false }); canvas.addEventListener("touchmove", move, { passive: false }); canvas.addEventListener("touchend", autoConfirm);
    return () => { try { el.removeChild(canvas); } catch {} };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Expose clear() so parent can call it from the status-row button
  useEffect(() => {
    clearRef.current = () => {
      const c = canvasRef.current;
      if (c) { const ctx = c.getContext("2d"); ctx?.clearRect(0, 0, c.width, c.height); }
      onEmpty();
    };
    return () => { clearRef.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View ref={containerRef} style={{ height: 150, borderRadius: 8, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.04)" }} />
  );
}


const MANIFESTO_URL = "https://issuu.com/timenation2025/docs/_timenatio";

const BASE_URL = getBaseUrl();

type Mode = "choose" | "register" | "login" | "forgot" | "pending" | "issued";

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

export default function RegisterScreen({ initialMode }: { initialMode?: Mode } = {}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { citizen, setCitizen, setAuthToken } = useCitizen();
  const { lang, setLang } = useLanguage();
  const router = useRouter();
  const queryClient = useQueryClient();
  const loginLang: "ru" | "en" = lang === "ru" ? "ru" : "en";
  const L = UI[loginLang];
  const t = (ru: string, en: string) => loginLang === "ru" ? ru : en;

  const [mode, setMode] = useState<Mode>(initialMode ?? "choose");

  // Registration form
  const [name, setName] = useState("");
  const [surname, setSurname] = useState("");
  const [givenNames, setGivenNames] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState(""); // YYYY-MM-DD
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [signatureBase64, setSignatureBase64] = useState<string | null>(null);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);

  // Refs for clearing signature from the status-row button
  const webClearRef = useRef<(() => void) | null>(null);      // web canvas
  const nativeSigRef = useRef<any>(null);                      // react-native-signature-canvas

  function handleClearSignature() {
    if (Platform.OS === "web") {
      webClearRef.current?.();
    } else {
      nativeSigRef.current?.clearSignature();
      setSignatureBase64(null);
    }
  }

  // Compliance
  const [manifestoAccepted, setManifestoAccepted] = useState(false);
  const [tosAccepted, setTosAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);

  // ── Communication channels (≥2 required) ─────────────────────────────────
  const [chEmail,       setChEmail]       = useState(false);
  const [chEmailVal,    setChEmailVal]    = useState("");
  const [chTelegram,    setChTelegram]    = useState(false);
  const [chTelegramVal, setChTelegramVal] = useState("");
  const [chWhatsapp,    setChWhatsapp]    = useState(false);
  const [chWhatsappVal, setChWhatsappVal] = useState("");
  const [chSms,         setChSms]         = useState(false);
  const [chSmsVal,      setChSmsVal]      = useState("");
  const [chPhone,       setChPhone]       = useState(false);
  const [chPhoneVal,    setChPhoneVal]    = useState("");

  const channelCount = [
    chEmail && chEmailVal.trim(),
    chTelegram && chTelegramVal.trim(),
    chWhatsapp && chWhatsappVal.trim(),
    chSms && chSmsVal.trim(),
    chPhone && chPhoneVal.trim(),
  ].filter(Boolean).length;

  const canSubmit = manifestoAccepted && tosAccepted && privacyAccepted && !!signatureBase64 && channelCount >= 2;

  // Login
  const [loginPhone, setLoginPhone] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  // Forgot password
  const [forgotPhone, setForgotPhone] = useState("");
  const [forgotSent, setForgotSent] = useState(false);

  // Pending / issued
  const [pendingData, setPendingData] = useState<PendingData | null>(null);
  const [countdown, setCountdown] = useState(3600);
  const [issuedPassportUrl, setIssuedPassportUrl] = useState<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const styles = getStyles(colors);

  useEffect(() => {
    if (citizen) return;
    let active = true;
    AsyncStorage.getItem("timenation_preapplication_guide_v1")
      .then((value) => {
        if (active && value !== "complete") router.replace("/onboarding");
      })
      .catch(() => {
        if (active) router.replace("/onboarding");
      });
    return () => { active = false; };
  }, [citizen, router]);

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

  // ── Photo picker ───────────────────────────────────────────────────────────
  async function handlePickPhoto() {
    if (Platform.OS === "web") {
      // Web: use a hidden <input type="file"> — Alert.alert buttons don't resolve on web
      await new Promise<void>((resolve) => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "image/*";
        input.onchange = () => {
          const file = input.files?.[0];
          if (!file) { resolve(); return; }
          const reader = new FileReader();
          reader.onload = (e) => {
            const dataUrl = e.target?.result as string;
            setPhotoUri(dataUrl);
            setPhotoBase64(dataUrl);
            resolve();
          };
          reader.readAsDataURL(file);
        };
        input.oncancel = () => resolve();
        input.click();
      });
      return;
    }

    // Native: show camera / gallery choice
    const choice = await new Promise<"camera" | "gallery" | null>(resolve => {
      Alert.alert("Фото для паспорта", "Выбери источник", [
        { text: "Камера", onPress: () => resolve("camera") },
        { text: "Галерея", onPress: () => resolve("gallery") },
        { text: "Отмена", style: "cancel", onPress: () => resolve(null) },
      ]);
    });
    if (!choice) return;

    const permResult = choice === "camera"
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permResult.granted) {
      Alert.alert("Нет доступа", "Разреши доступ в настройках устройства.");
      return;
    }

    const result = choice === "camera"
      ? await ImagePicker.launchCameraAsync({ base64: true, quality: 0.7, allowsEditing: true, aspect: [3, 4] })
      : await ImagePicker.launchImageLibraryAsync({ base64: true, quality: 0.7, allowsEditing: true, aspect: [3, 4], mediaTypes: ["images"] });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setPhotoUri(asset.uri);
      if (asset.base64) {
        const mime = asset.mimeType ?? "image/jpeg";
        setPhotoBase64(`data:${mime};base64,${asset.base64}`);
      }
    }
  }

  // ── Register ──────────────────────────────────────────────────────────────
  async function handleRegister() {
    const n = name.trim() || `${surname.trim()} ${givenNames.trim()}`.trim();
    if (!n || !phone.trim()) {
      Alert.alert("Заполни обязательные поля", "Имя и номер телефона обязательны.");
      return;
    }
    if (!password.trim() || password.length < 6) {
      Alert.alert("Пароль слишком короткий", "Минимум 6 символов.");
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert("Пароли не совпадают", "Проверь введённый пароль.");
      return;
    }
    if (!canSubmit) {
      if (channelCount < 2) {
        Alert.alert(
          t("Каналы связи", "Communication channels"),
          t("Выберите и заполните не менее 2 способов связи для получения важных уведомлений.", "Select and fill at least 2 communication channels for important notifications.")
        );
      } else {
        Alert.alert(
          t("Подтвердите согласия", "Confirm agreements"),
          t("Поставьте подпись и отметьте все три пункта.", "Sign and check all three boxes.")
        );
      }
      return;
    }
    setLoading(true);
    try {
      const body: Record<string, string | boolean> = {
        name: n,
        phone: phone.trim(),
        password: password.trim(),
        privacyAgreementAccepted: true,
        tosAcceptedAt: new Date().toISOString(),
      };
      if (surname.trim()) body["surname"] = surname.trim();
      if (givenNames.trim()) body["givenNames"] = givenNames.trim();
      if (dateOfBirth.trim().match(/^\d{4}-\d{2}-\d{2}$/)) body["dateOfBirth"] = dateOfBirth.trim();
      if (email.trim()) body["email"] = email.trim();
      if (photoBase64) body["photoBase64"] = photoBase64;

      // ── Communication channels ──────────────────────────────────────────
      const preferredCh: string[] = [];
      if (chEmail && chEmailVal.trim()) preferredCh.push("email");
      if (chTelegram && chTelegramVal.trim()) preferredCh.push("telegram");
      if (chWhatsapp && chWhatsappVal.trim()) { preferredCh.push("whatsapp"); body["whatsappPhone"] = chWhatsappVal.trim(); }
      if (chSms && chSmsVal.trim()) preferredCh.push("sms");
      if (chPhone && chPhoneVal.trim()) preferredCh.push("phone");
      body["preferredChannels"] = JSON.stringify(preferredCh);

      const res = await fetch(`${BASE_URL}/api/auth/register`, {
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

      setCitizen(cd as CitizenProfile);
      const regToken = (cd as CitizenProfile & { authToken?: string }).authToken;
      if (regToken) setAuthToken(regToken);
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
        router.replace("/onboarding");
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
      const res = await fetch(`${BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: loginPhone.trim(),
          password: loginPassword.trim() || undefined,
        }),
      });
      const data = await res.json() as CitizenProfile | { error: string };
      if (!res.ok) {
        Alert.alert("Ошибка входа", (data as { error: string }).error);
        return;
      }
      setCitizen(data as CitizenProfile);
      const loginToken = (data as CitizenProfile & { authToken?: string }).authToken;
      if (loginToken) setAuthToken(loginToken);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch {
      Alert.alert("Ошибка соединения");
    } finally {
      setLoading(false);
    }
  }

  // ── Forgot password ────────────────────────────────────────────────────────
  async function handleForgotPassword() {
    if (!forgotPhone.trim()) { Alert.alert("Введи номер телефона"); return; }
    setLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: forgotPhone.trim() }),
      });
      if (res.ok) {
        setForgotSent(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        const d = await res.json() as { error: string };
        Alert.alert("Ошибка", d.error);
      }
    } catch {
      Alert.alert("Ошибка соединения");
    } finally {
      setLoading(false);
    }
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
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>{L.digital_state}</Text>
        {/* RU | EN toggle — visible only on entry modes */}
        {(mode === "choose" || mode === "login" || mode === "forgot") && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 2, marginTop: 10 }}>
            <TouchableOpacity
              onPress={() => setLang("ru")}
              style={[styles.langBtn, loginLang === "ru" && styles.langBtnActive]}
            >
              <Text style={[styles.langBtnText, loginLang === "ru" && styles.langBtnTextActive]}>RU</Text>
            </TouchableOpacity>
            <Text style={styles.langSep}>|</Text>
            <TouchableOpacity
              onPress={() => setLang("en")}
              style={[styles.langBtn, loginLang === "en" && styles.langBtnActive]}
            >
              <Text style={[styles.langBtnText, loginLang === "en" && styles.langBtnTextActive]}>EN</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* ── CHOOSE ── */}
      {mode === "choose" && (
        <View style={styles.section}>
          <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: colors.primary }]} onPress={() => setMode("register")} activeOpacity={0.8}>
            <Feather name="user-plus" size={18} color={colors.primaryForeground} />
            <Text style={[styles.primaryBtnText, { color: colors.primaryForeground }]}>{t("Стать гражданином", "Become a Citizen")}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.secondaryBtn, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => setMode("login")} activeOpacity={0.8}>
            <Feather name="log-in" size={18} color={colors.foreground} />
            <Text style={[styles.secondaryBtnText, { color: colors.foreground }]}>{t("Войти по телефону", "Login by phone")}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.secondaryBtn, { backgroundColor: "transparent", borderColor: colors.border }]}
            onPress={() => router.push("/passport-lookup")}
            activeOpacity={0.8}
          >
            <Feather name="file-text" size={18} color={colors.mutedForeground} />
            <Text style={[styles.secondaryBtnText, { color: colors.mutedForeground }]}>{t("Найти мой паспорт", "Find my passport")}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── REGISTER ── */}
      {mode === "register" && (
        <View style={styles.section}>
          {/* RU | EN toggle in register mode too */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
            <Text style={[styles.formTitle, { color: colors.foreground, marginBottom: 0 }]}>{t("Регистрация", "Registration")}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
              <TouchableOpacity onPress={() => setLang("ru")} style={[styles.langBtn, loginLang === "ru" && styles.langBtnActive]}>
                <Text style={[styles.langBtnText, loginLang === "ru" && styles.langBtnTextActive]}>RU</Text>
              </TouchableOpacity>
              <Text style={styles.langSep}>|</Text>
              <TouchableOpacity onPress={() => setLang("en")} style={[styles.langBtn, loginLang === "en" && styles.langBtnActive]}>
                <Text style={[styles.langBtnText, loginLang === "en" && styles.langBtnTextActive]}>EN</Text>
              </TouchableOpacity>
            </View>
          </View>

          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{t("ФАМИЛИЯ", "LAST NAME")}</Text>
          <TextInput style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
            value={surname} onChangeText={setSurname} placeholder={t("Иванов", "Smith")} placeholderTextColor={colors.mutedForeground} autoFocus />

          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{t("ИМЯ И ОТЧЕСТВО", "FIRST & MIDDLE NAME")}</Text>
          <TextInput style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
            value={givenNames} onChangeText={setGivenNames} placeholder={t("Иван Иванович", "John Michael")} placeholderTextColor={colors.mutedForeground} />

          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{t("ПСЕВДОНИМ (если нет ФИО)", "NICKNAME (if no full name)")}</Text>
          <TextInput style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
            value={name} onChangeText={setName} placeholder={t("Отображаемое имя", "Display name")} placeholderTextColor={colors.mutedForeground} />

          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{t("ДАТА РОЖДЕНИЯ", "DATE OF BIRTH")}</Text>
          <TextInput style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
            value={dateOfBirth} onChangeText={setDateOfBirth} placeholder={t("ГГГГ-ММ-ДД", "YYYY-MM-DD")} placeholderTextColor={colors.mutedForeground} />
          <Text style={{ fontSize: 11, color: colors.mutedForeground, marginTop: -8, marginBottom: 8 }}>{t("Формат: 2000-12-31", "Format: 2000-12-31")}</Text>

          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{t("ТЕЛЕФОН *", "PHONE *")}</Text>
          <TextInput style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
            value={phone} onChangeText={setPhone} placeholder="+7..." placeholderTextColor={colors.mutedForeground} keyboardType="phone-pad" />

          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{t("E-MAIL (для получения паспорта)", "E-MAIL (for passport delivery)")}</Text>
          <TextInput style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
            value={email} onChangeText={setEmail} placeholder="example@timenation.com" placeholderTextColor={colors.mutedForeground} keyboardType="email-address" autoCapitalize="none" />

          {/* ── Communication Channels ─────────────────────────────────── */}
          <View style={{ marginTop: 16, marginBottom: 4, padding: 12, backgroundColor: (colors.card ?? "#fff") + "80", borderRadius: 10, borderWidth: 1, borderColor: colors.border }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <Feather name="bell" size={13} color={colors.mutedForeground} />
              <Text style={{ fontSize: 10, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground, letterSpacing: 0.8, textTransform: "uppercase" }}>
                {t("Каналы связи — не менее 2", "Communication Channels — min. 2")}
              </Text>
            </View>
            <Text style={{ fontSize: 11, color: colors.mutedForeground, opacity: 0.7, marginBottom: 10 }}>
              {t("Для получения важных уведомлений от государства", "For important state notifications")}
            </Text>

            {/* E-mail */}
            <TouchableOpacity style={styles.checkRowInner} onPress={() => {
              setChEmail(v => { const next = !v; if (next && !chEmailVal && email) setChEmailVal(email); return next; });
            }}>
              <View style={[styles.checkbox, { borderColor: colors.border, backgroundColor: chEmail ? colors.primary : "transparent" }]}>
                {chEmail && <Feather name="check" size={12} color={colors.primaryForeground} />}
              </View>
              <Text style={[styles.checkLabel, { color: colors.foreground }]}>📧 {t("E-mail (почта)", "E-mail")}</Text>
            </TouchableOpacity>
            {chEmail && (
              <TextInput style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground, marginLeft: 28, marginTop: 4 }]}
                value={chEmailVal} onChangeText={setChEmailVal} placeholder="example@mail.com"
                placeholderTextColor={colors.mutedForeground} keyboardType="email-address" autoCapitalize="none" />
            )}

            {/* Telegram */}
            <TouchableOpacity style={[styles.checkRowInner, { marginTop: 8 }]} onPress={() => setChTelegram(v => !v)}>
              <View style={[styles.checkbox, { borderColor: colors.border, backgroundColor: chTelegram ? colors.primary : "transparent" }]}>
                {chTelegram && <Feather name="check" size={12} color={colors.primaryForeground} />}
              </View>
              <Text style={[styles.checkLabel, { color: colors.foreground }]}>✈️ Telegram</Text>
            </TouchableOpacity>
            {chTelegram && (
              <TextInput style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground, marginLeft: 28, marginTop: 4 }]}
                value={chTelegramVal} onChangeText={setChTelegramVal} placeholder="@username"
                placeholderTextColor={colors.mutedForeground} autoCapitalize="none" />
            )}

            {/* WhatsApp */}
            <TouchableOpacity style={[styles.checkRowInner, { marginTop: 8 }]} onPress={() => {
              setChWhatsapp(v => { const next = !v; if (next && !chWhatsappVal && phone) setChWhatsappVal(phone); return next; });
            }}>
              <View style={[styles.checkbox, { borderColor: colors.border, backgroundColor: chWhatsapp ? colors.primary : "transparent" }]}>
                {chWhatsapp && <Feather name="check" size={12} color={colors.primaryForeground} />}
              </View>
              <Text style={[styles.checkLabel, { color: colors.foreground }]}>📱 WhatsApp</Text>
            </TouchableOpacity>
            {chWhatsapp && (
              <TextInput style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground, marginLeft: 28, marginTop: 4 }]}
                value={chWhatsappVal} onChangeText={setChWhatsappVal} placeholder="+7XXXXXXXXXX"
                placeholderTextColor={colors.mutedForeground} keyboardType="phone-pad" />
            )}

            {/* SMS */}
            <TouchableOpacity style={[styles.checkRowInner, { marginTop: 8 }]} onPress={() => {
              setChSms(v => { const next = !v; if (next && !chSmsVal && phone) setChSmsVal(phone); return next; });
            }}>
              <View style={[styles.checkbox, { borderColor: colors.border, backgroundColor: chSms ? colors.primary : "transparent" }]}>
                {chSms && <Feather name="check" size={12} color={colors.primaryForeground} />}
              </View>
              <Text style={[styles.checkLabel, { color: colors.foreground }]}>💬 SMS</Text>
            </TouchableOpacity>
            {chSms && (
              <TextInput style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground, marginLeft: 28, marginTop: 4 }]}
                value={chSmsVal} onChangeText={setChSmsVal} placeholder="+7XXXXXXXXXX"
                placeholderTextColor={colors.mutedForeground} keyboardType="phone-pad" />
            )}

            {/* Phone calls */}
            <TouchableOpacity style={[styles.checkRowInner, { marginTop: 8 }]} onPress={() => {
              setChPhone(v => { const next = !v; if (next && !chPhoneVal && phone) setChPhoneVal(phone); return next; });
            }}>
              <View style={[styles.checkbox, { borderColor: colors.border, backgroundColor: chPhone ? colors.primary : "transparent" }]}>
                {chPhone && <Feather name="check" size={12} color={colors.primaryForeground} />}
              </View>
              <Text style={[styles.checkLabel, { color: colors.foreground }]}>📞 {t("Телефонные звонки", "Phone calls")}</Text>
            </TouchableOpacity>
            {chPhone && (
              <TextInput style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground, marginLeft: 28, marginTop: 4 }]}
                value={chPhoneVal} onChangeText={setChPhoneVal} placeholder="+7XXXXXXXXXX"
                placeholderTextColor={colors.mutedForeground} keyboardType="phone-pad" />
            )}

            {/* Validation feedback */}
            {channelCount > 0 && channelCount < 2 && (
              <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 6, marginTop: 10, padding: 8, backgroundColor: "#ff444420", borderRadius: 8, borderWidth: 1, borderColor: "#ff444440" }}>
                <Feather name="alert-circle" size={12} color="#ff4444" style={{ marginTop: 1 }} />
                <Text style={{ fontSize: 11, color: "#ff4444", flex: 1, fontFamily: "Inter_400Regular" }}>
                  {t("Выберите и заполните не менее 2 способов связи", "Select and fill at least 2 communication channels")}
                </Text>
              </View>
            )}
            {channelCount >= 2 && (
              <Text style={{ fontSize: 11, color: "#22c55e", marginTop: 8, fontFamily: "Inter_400Regular" }}>
                ✓ {channelCount} {t("из 5 каналов активно", "of 5 channels active")}
              </Text>
            )}
          </View>

          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{t("ПАРОЛЬ * (мин. 6 символов)", "PASSWORD * (min. 6 characters)")}</Text>
          <TextInput style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
            value={password} onChangeText={setPassword} placeholder="••••••••" placeholderTextColor={colors.mutedForeground} secureTextEntry />

          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{t("ПОВТОРИТЕ ПАРОЛЬ *", "REPEAT PASSWORD *")}</Text>
          <TextInput style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
            value={confirmPassword} onChangeText={setConfirmPassword} placeholder="••••••••" placeholderTextColor={colors.mutedForeground} secureTextEntry />

          {/* ── Photo picker ── */}
          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{t("ФОТОГРАФИЯ (для паспорта)", "PHOTO (for passport)")}</Text>
          <TouchableOpacity
            style={[styles.photoPicker, { borderColor: colors.border, backgroundColor: colors.card }]}
            onPress={() => void handlePickPhoto()}
            activeOpacity={0.8}
          >
            {photoUri ? (
              <Image source={{ uri: photoUri }} style={styles.photoPreview} resizeMode="cover" />
            ) : (
              <View style={styles.photoPlaceholder}>
                <Feather name="camera" size={28} color={colors.mutedForeground} />
                <Text style={[styles.photoPlaceholderText, { color: colors.mutedForeground }]}>{t("Загрузить фото анфас", "Upload front-facing photo")}</Text>
                <Text style={[styles.photoPlaceholderSub, { color: colors.mutedForeground }]}>{t("Светлый фон · JPG, PNG", "Light background · JPG, PNG")}</Text>
              </View>
            )}
          </TouchableOpacity>
          {photoUri && (
            <TouchableOpacity onPress={() => void handlePickPhoto()} style={{ alignSelf: "flex-end", marginTop: 4 }}>
              <Text style={{ fontSize: 12, color: colors.primary }}>{t("Заменить фото", "Replace photo")}</Text>
            </TouchableOpacity>
          )}

          {/* ── Signature ── */}
          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{t("ПОДПИСЬ *", "SIGNATURE *")}</Text>
          <View style={[styles.signatureContainer, { borderColor: colors.border }]}>
            {Platform.OS === "web" ? (
              <WebSignaturePad
                onOK={(sig) => setSignatureBase64(sig)}
                onEmpty={() => setSignatureBase64(null)}
                clearRef={webClearRef}
              />
            ) : (
              <SignatureCanvas
                ref={nativeSigRef}
                onOK={(sig: string) => setSignatureBase64(sig)}
                onEmpty={() => setSignatureBase64(null)}
                penColor="rgb(10, 30, 80)"
                backgroundColor="rgba(255,255,255,0.04)"
                descriptionText=""
                clearText={t("Очистить", "Clear")}
                confirmText={t("Сохранить", "Save")}
                webStyle={`.m-signature-pad{box-shadow:none;border:none;height:100%}.m-signature-pad--body{border:none;background:transparent}.m-signature-pad--footer{background:#111;padding:4px}.m-signature-pad--footer .button{background:#222;border:1px solid #333;color:#aaa;font-size:13px;border-radius:6px;padding:4px 12px}`}
                style={{ height: 150 }}
              />
            )}
          </View>

          {/* Status row — outside signatureContainer so it isn't clipped by overflow:hidden */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4, minHeight: 22 }}>
            {signatureBase64 ? (
              <Text style={[styles.signatureStatus, { color: "#22c55e" }]}>
                {t("✓ Подпись сохранена", "✓ Signature saved")}
              </Text>
            ) : (
              <Text style={[styles.signatureStatus, { color: colors.mutedForeground }]}>
                {t("Нарисуйте подпись", "Draw your signature")}
              </Text>
            )}
            {signatureBase64 && (
              <TouchableOpacity
                onPress={handleClearSignature}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 4,
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                  backgroundColor: "rgba(255,255,255,0.05)",
                  borderRadius: 6,
                  borderWidth: 1,
                  borderColor: "#333",
                }}
              >
                <Feather name="x" size={11} color="#aaa" />
                <Text style={{ color: "#aaa", fontSize: 12, fontFamily: "Inter_400Regular" }}>
                  {t("Очистить", "Clear")}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* ── Compliance checkboxes ── */}
          <View style={[styles.complianceBlock, { borderTopColor: colors.border }]}>

            {/* 1. Manifesto */}
            <View style={[styles.checkRow, { backgroundColor: "#f59e0b10", borderColor: "#f59e0b40", borderWidth: 1, borderRadius: 10, padding: 12 }]}>
              <TouchableOpacity
                onPress={() => Linking.openURL(MANIFESTO_URL)}
                style={[styles.manifestoBtn, { backgroundColor: "#f59e0b20", borderColor: "#f59e0b50" }]}
              >
                <Feather name="book-open" size={14} color="#f59e0b" />
                <Text style={[styles.manifestoBtnText, { color: "#f59e0b" }]}>{t("Открыть документ TimeNation", "Open TimeNation Document")}</Text>
                <Feather name="external-link" size={12} color="#f59e0b" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.checkRowInner} onPress={() => setManifestoAccepted(v => !v)}>
                <View style={[styles.checkbox, { borderColor: colors.border, backgroundColor: manifestoAccepted ? colors.primary : "transparent" }]}>
                  {manifestoAccepted && <Feather name="check" size={12} color={colors.primaryForeground} />}
                </View>
                <Text style={[styles.checkLabel, { color: colors.mutedForeground }]}>
                  {t(
                    "Я ознакомлен с основополагающим документом TimeNation и понимаю принципы цифрового государства.",
                    "I have read the founding document of TimeNation and understand the principles of the digital state."
                  )}
                </Text>
              </TouchableOpacity>
            </View>

            {/* 2. TOS */}
            <TouchableOpacity style={styles.checkRowInner} onPress={() => setTosAccepted(v => !v)}>
              <View style={[styles.checkbox, { borderColor: colors.border, backgroundColor: tosAccepted ? colors.primary : "transparent" }]}>
                {tosAccepted && <Feather name="check" size={12} color={colors.primaryForeground} />}
              </View>
              <Text style={[styles.checkLabel, { color: colors.mutedForeground }]}>
                {t("Я ознакомлен с ", "I agree to the ")}<Text style={{ color: colors.primary }} onPress={() => Linking.openURL(`${BASE_URL}/tos`)}>{t("Условиями использования", "Terms of Use")}</Text>{t(". Дармины — внутриигровые баллы, не являются денежными средствами.", ". Darmins are in-game points, not monetary funds.")}
              </Text>
            </TouchableOpacity>

            {/* 3. Privacy / GDPR */}
            <View style={[styles.checkRow, { backgroundColor: colors.muted + "20", borderColor: colors.border, borderWidth: 1, borderRadius: 10, padding: 12 }]}>
              <Feather name="lock" size={14} color={colors.mutedForeground} style={{ marginBottom: 6 }} />
              <TouchableOpacity style={styles.checkRowInner} onPress={() => setPrivacyAccepted(v => !v)}>
                <View style={[styles.checkbox, { borderColor: colors.border, backgroundColor: privacyAccepted ? colors.primary : "transparent" }]}>
                  {privacyAccepted && <Feather name="check" size={12} color={colors.primaryForeground} />}
                </View>
                <Text style={[styles.checkLabel, { color: colors.mutedForeground }]}>
                  {t(
                    "Я даю согласие на обработку персональных данных (ФИО, email, фото) для выпуска цифрового удостоверения TimeNation. Данные хранятся в защищённой базе (GDPR / 152-ФЗ). ",
                    "I consent to the processing of personal data (name, email, photo) for the issuance of a TimeNation digital ID. Data is stored in a secured database (GDPR compliant). "
                  )}
                  <Text
                    style={{ color: colors.primary, textDecorationLine: "underline" }}
                    onPress={() => Linking.openURL("https://timenation.info/privacy")}
                  >
                    {t("Политика конфиденциальности", "Privacy Policy")}
                  </Text>
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={[styles.infoBox, { backgroundColor: colors.primary + "15", borderColor: colors.primary + "40" }]}>
            <Feather name="clock" size={14} color={colors.primary} />
            <Text style={[styles.infoText, { color: colors.mutedForeground }]}>
              {t(
                "После регистрации данные проходят 60-минутную верификацию. Вы сразу получите доступ к системе, а цифровой паспорт будет выдан после проверки.",
                "After registration, your data goes through a 60-minute verification. You will immediately gain access to the system, and your digital passport will be issued after review."
              )}
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: colors.primary, opacity: (loading || !canSubmit) ? 0.5 : 1 }]}
            onPress={handleRegister}
            disabled={loading || !canSubmit}
            activeOpacity={0.8}
          >
            {loading ? <ActivityIndicator color={colors.primaryForeground} /> : (
              <>
                <Feather name="user-check" size={18} color={colors.primaryForeground} />
                <Text style={[styles.primaryBtnText, { color: colors.primaryForeground }]}>{t("Подать заявку на гражданство", "Apply for Citizenship")}</Text>
              </>
            )}
          </TouchableOpacity>
          {!canSubmit && (
            <Text style={[styles.cancelBtnText, { color: colors.mutedForeground, textAlign: "center", fontSize: 12, marginTop: 4 }]}>
              {!signatureBase64
                ? t("Поставьте подпись и отметьте все три пункта", "Sign and check all three boxes")
                : t("Отметьте все три пункта, чтобы продолжить", "Check all three boxes to continue")}
            </Text>
          )}
          <TouchableOpacity style={styles.cancelBtn} onPress={() => setMode("choose")} activeOpacity={0.8}>
            <Text style={[styles.cancelBtnText, { color: colors.mutedForeground }]}>{t("Назад", "Back")}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── LOGIN ── */}
      {mode === "login" && (
        <View style={styles.section}>
          <Text style={[styles.formTitle, { color: colors.foreground }]}>{L.login}</Text>

          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{t("ТЕЛЕФОН", "PHONE")}</Text>
          <TextInput style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
            value={loginPhone} onChangeText={setLoginPhone} placeholder={L.login_placeholder} placeholderTextColor={colors.mutedForeground} keyboardType="phone-pad" autoFocus />

          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{t("ПАРОЛЬ", "PASSWORD")}</Text>
          <View style={{ position: "relative" }}>
            <TextInput style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground, paddingRight: 44 }]}
              value={loginPassword} onChangeText={setLoginPassword} placeholder="••••••••" placeholderTextColor={colors.mutedForeground}
              secureTextEntry={!showLoginPassword} />
            <TouchableOpacity
              onPress={() => setShowLoginPassword(v => !v)}
              style={{ position: "absolute", right: 12, top: 0, bottom: 0, justifyContent: "center" }}
            >
              <Feather name={showLoginPassword ? "eye-off" : "eye"} size={18} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity onPress={() => { setForgotPhone(loginPhone); setForgotSent(false); setMode("forgot"); }} style={{ marginBottom: 12, alignSelf: "flex-end" }}>
            <Text style={{ fontSize: 13, color: colors.primary }}>{t("Забыли пароль?", "Forgot password?")}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: colors.primary, opacity: loading ? 0.6 : 1 }]} onPress={handleLogin} disabled={loading} activeOpacity={0.8}>
            {loading ? <ActivityIndicator color={colors.primaryForeground} /> : (
              <>
                <Feather name="log-in" size={18} color={colors.primaryForeground} />
                <Text style={[styles.primaryBtnText, { color: colors.primaryForeground }]}>{L.login}</Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelBtn} onPress={() => setMode("choose")} activeOpacity={0.8}>
            <Text style={[styles.cancelBtnText, { color: colors.mutedForeground }]}>{L.back}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── FORGOT PASSWORD ── */}
      {mode === "forgot" && (
        <View style={styles.section}>
          <Text style={[styles.formTitle, { color: colors.foreground }]}>{t("Восстановление пароля", "Password Recovery")}</Text>

          {forgotSent ? (
            <View style={[styles.infoBox, { backgroundColor: "#22c55e20", borderColor: "#22c55e60" }]}>
              <Feather name="check-circle" size={18} color="#22c55e" />
              <Text style={[styles.infoText, { color: colors.foreground }]}>
                {t("Токен восстановления выдан. Администратор вышлет ссылку для сброса пароля.", "Recovery token issued. An administrator will send a password reset link.")}
              </Text>
            </View>
          ) : (
            <>
              <Text style={[styles.infoText, { color: colors.mutedForeground, marginBottom: 12 }]}>
                {t("Введите телефон, привязанный к аккаунту. Токен для сброса будет выдан администратором.", "Enter the phone number linked to your account. A reset token will be issued by an administrator.")}
              </Text>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{t("ТЕЛЕФОН", "PHONE")}</Text>
              <TextInput style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                value={forgotPhone} onChangeText={setForgotPhone} placeholder={L.login_placeholder} placeholderTextColor={colors.mutedForeground} keyboardType="phone-pad" autoFocus />
              <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: colors.primary, opacity: loading ? 0.6 : 1 }]} onPress={handleForgotPassword} disabled={loading} activeOpacity={0.8}>
                {loading ? <ActivityIndicator color={colors.primaryForeground} /> : (
                  <>
                    <Feather name="send" size={18} color={colors.primaryForeground} />
                    <Text style={[styles.primaryBtnText, { color: colors.primaryForeground }]}>{t("Запросить сброс", "Request Reset")}</Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          )}

          <TouchableOpacity style={styles.cancelBtn} onPress={() => setMode("login")} activeOpacity={0.8}>
            <Text style={[styles.cancelBtnText, { color: colors.mutedForeground }]}>{t("Назад ко входу", "Back to Login")}</Text>
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
    langBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: colors.border },
    langBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    langBtnText: { fontSize: 11, fontFamily: "Inter_700Bold", color: colors.mutedForeground, letterSpacing: 0.5 },
    langBtnTextActive: { color: colors.primaryForeground },
    langSep: { fontSize: 11, color: colors.mutedForeground + "55", marginHorizontal: 2 },
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
    // Photo picker
    photoPicker: { borderWidth: 2, borderStyle: "dashed", borderRadius: 12, overflow: "hidden", marginTop: 4, minHeight: 140 },
    photoPlaceholder: { alignItems: "center", justifyContent: "center", paddingVertical: 28, gap: 6 },
    photoPlaceholderText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
    photoPlaceholderSub: { fontSize: 11, fontFamily: "Inter_400Regular" },
    photoPreview: { width: "100%", height: 180 },
    // Compliance
    complianceBlock: { borderTopWidth: 1, paddingTop: 16, gap: 12, marginTop: 8 },
    checkRow: { gap: 8 },
    checkRowInner: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
    checkbox: { width: 20, height: 20, borderWidth: 2, borderRadius: 4, alignItems: "center", justifyContent: "center", marginTop: 1, flexShrink: 0 },
    checkLabel: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 18 },
    manifestoBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, marginBottom: 8 },
    manifestoBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  });
}
