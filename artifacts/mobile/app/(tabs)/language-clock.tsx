import React, { useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { LogoBrand } from "@/components/LogoBrand";
import { useLanguage } from "@/context/LanguageContext";
import type { LangCode } from "@/lib/i18n";

// ─── Data ────────────────────────────────────────────────────────────────────

const LANGUAGES_24 = [
  { hour: 1,  code: "ru", label: "Русский",      rtl: false, flag: "🇷🇺", iso: "RU" },
  { hour: 2,  code: "en", label: "English",      rtl: false, flag: "🇬🇧", iso: "EN" },
  { hour: 3,  code: "zh", label: "中文",          rtl: false, flag: "🇨🇳", iso: "ZH" },
  { hour: 4,  code: "hi", label: "हिन्दी",        rtl: false, flag: "🇮🇳", iso: "HI" },
  { hour: 5,  code: "es", label: "Español",      rtl: false, flag: "🇪🇸", iso: "ES" },
  { hour: 6,  code: "fr", label: "Français",     rtl: false, flag: "🇫🇷", iso: "FR" },
  { hour: 7,  code: "ar", label: "العربية",      rtl: true,  flag: "🇸🇦", iso: "AR" },
  { hour: 8,  code: "bn", label: "বাংলা",         rtl: false, flag: "🇧🇩", iso: "BN" },
  { hour: 9,  code: "pt", label: "Português",    rtl: false, flag: "🇵🇹", iso: "PT" },
  { hour: 10, code: "ur", label: "اردو",          rtl: true,  flag: "🇵🇰", iso: "UR" },
  { hour: 11, code: "id", label: "Indonesia",    rtl: false, flag: "🇮🇩", iso: "ID" },
  { hour: 12, code: "de", label: "Deutsch",      rtl: false, flag: "🇩🇪", iso: "DE" },
  { hour: 13, code: "ja", label: "日本語",         rtl: false, flag: "🇯🇵", iso: "JA" },
  { hour: 14, code: "tr", label: "Türkçe",       rtl: false, flag: "🇹🇷", iso: "TR" },
  { hour: 15, code: "vi", label: "Tiếng Việt",   rtl: false, flag: "🇻🇳", iso: "VI" },
  { hour: 16, code: "he", label: "עברית",         rtl: true,  flag: "🇮🇱", iso: "HE" },
  { hour: 17, code: "fa", label: "فارسی",         rtl: true,  flag: "🇮🇷", iso: "FA" },
  { hour: 18, code: "ko", label: "한국어",         rtl: false, flag: "🇰🇷", iso: "KO" },
  { hour: 19, code: "it", label: "Italiano",     rtl: false, flag: "🇮🇹", iso: "IT" },
  { hour: 20, code: "pl", label: "Polski",       rtl: false, flag: "🇵🇱", iso: "PL" },
  { hour: 21, code: "uk", label: "Українська",   rtl: false, flag: "🇺🇦", iso: "UK" },
  { hour: 22, code: "nl", label: "Nederlands",   rtl: false, flag: "🇳🇱", iso: "NL" },
  { hour: 23, code: "kk", label: "Қазақша",      rtl: false, flag: "🇰🇿", iso: "KK" },
  { hour: 24, code: "uz", label: "O'zbek",       rtl: false, flag: "🇺🇿", iso: "UZ" },
] as const;

const TRANSLATIONS: Record<LangCode, { welcome: string; select_hour: string; btn_publish: string; status: string }> = {
  ru: { welcome: "Добро пожаловать в TimeNation", select_hour: "Выберите ваш час",          btn_publish: "Опубликовать видео", status: "Время — это общий язык, который объединяет все нации мира." },
  en: { welcome: "Welcome to TimeNation",         select_hour: "Choose your hour",           btn_publish: "Publish video",      status: "Time is a common language that unites all nations of the world." },
  zh: { welcome: "欢迎来到 TimeNation",             select_hour: "选择你的时间",                btn_publish: "发布视频",            status: "时间是连接世界上所有国家的通用语言。" },
  hi: { welcome: "TimeNation में आपका स्वागत",     select_hour: "अपना घंटा चुनें",            btn_publish: "वीडियो प्रकाशित करें", status: "समय एक साझा भाषा है जो दुनिया के सभी देशों को जोड़ती है।" },
  es: { welcome: "Bienvenido a TimeNation",        select_hour: "Elige tu hora",              btn_publish: "Publicar video",     status: "El tiempo es un idioma común que une a todas las naciones." },
  fr: { welcome: "Bienvenue à TimeNation",         select_hour: "Choisissez votre heure",     btn_publish: "Publier la vidéo",   status: "Le temps est une langue commune qui unit toutes les nations." },
  ar: { welcome: "مرحباً بكم في TimeNation",       select_hour: "اختر ساعتك",                btn_publish: "نشر الفيديو",        status: "الوقت لغة مشتركة توحد جميع أمم العالم على قرص واحد." },
  bn: { welcome: "TimeNation-এ স্বাগতম",           select_hour: "আপনার ঘন্টা চয়ন করুন",     btn_publish: "ভিডিও প্রকাশ করুন", status: "সময় একটি সাধারণ ভাষা যা বিশ্বের সমস্ত জাতিকে একত্রিত করে।" },
  pt: { welcome: "Bem-vindo ao TimeNation",         select_hour: "Escolha sua hora",           btn_publish: "Publicar vídeo",     status: "O tempo é uma linguagem comum que une todas as nações do mundo." },
  ur: { welcome: "TimeNation میں خوش آمدید",        select_hour: "اپنا گھنٹہ منتخب کریں",     btn_publish: "ویڈیو شائع کریں",   status: "وقت ایک ایسی عام زبان ہے جو دنیا کی تمام قوموں کو متحد کرتی ہے۔" },
  id: { welcome: "Selamat Datang di TimeNation",   select_hour: "Pilih jam Anda",             btn_publish: "Publikasikan video", status: "Waktu adalah bahasa universal yang menyatukan semua bangsa." },
  de: { welcome: "Willkommen bei TimeNation",      select_hour: "Wählen Sie Ihre Stunde",     btn_publish: "Video veröffentlichen", status: "Zeit ist eine gemeinsame Sprache, die alle Nationen vereint." },
  ja: { welcome: "TimeNationへようこそ",             select_hour: "あなたの時間を選択してください", btn_publish: "動画を公開する",      status: "時間は、世界中のすべての国を結びつける共通の言語です。" },
  tr: { welcome: "TimeNation'a Hoş Geldiniz",      select_hour: "Saatinizi seçin",            btn_publish: "Videoyu yayınla",    status: "Zaman, dünyadaki tüm ulusları birleştiren ortak bir dildir." },
  vi: { welcome: "Chào mừng đến với TimeNation",   select_hour: "Chọn giờ của bạn",           btn_publish: "Xuất bản video",     status: "Thời gian là ngôn ngữ chung gắn kết tất cả các quốc gia." },
  he: { welcome: "ברוכים הבאים ל-TimeNation",      select_hour: "בחר את השעה שלך",            btn_publish: "פרסם סרטון",         status: "הזמן הוא שפה משותפת המאחדת את כל אומות העולם." },
  fa: { welcome: "به TimeNation خوش آمدید",         select_hour: "ساعت خود را انتخاب کنید",   btn_publish: "انتشار ویدیو",       status: "زمان زبان مشترکی است که همه ملت‌های جهان را متحد می‌کند." },
  ko: { welcome: "TimeNation에 오신 것을 환영합니다", select_hour: "시간을 선택하세요",           btn_publish: "동영상 게시",         status: "시간은 세계의 모든 국가를 하나의 다이얼로 연결하는 언어입니다." },
  it: { welcome: "Benvenuto in TimeNation",         select_hour: "Scegli la tua ora",          btn_publish: "Pubblica video",     status: "Il tempo è una lingua comune che unisce tutte le nazioni del mondo." },
  pl: { welcome: "Witaj w TimeNation",              select_hour: "Wybierz swoją godzinę",      btn_publish: "Opublikuj wideo",    status: "Czas to wspólny język, który jednoczy wszystkie narody świata." },
  uk: { welcome: "Ласкаво просимо до TimeNation",   select_hour: "Оберіть вашу годину",        btn_publish: "Опублікувати відео", status: "Час — це спільна мова, яка об'єднує всі нації світу." },
  nl: { welcome: "Welkom bij TimeNation",           select_hour: "Kies uw uur",                btn_publish: "Video publiceren",   status: "Tijd is een gemeenschappelijke taal die alle naties van de wereld verenigt." },
  kk: { welcome: "TimeNation-қа қош келдіңіз",      select_hour: "Сағатыңызды таңдаңыз",      btn_publish: "Бейнені жариялау",   status: "Уақыт — бүкіл әлем халықтарын бір циферблатта біріктіретін ортақ тіл." },
  uz: { welcome: "TimeNation-ga xush kelibsiz",     select_hour: "Soatingizni tanlang",        btn_publish: "Videoni nashr qilish", status: "Vaqt — dunyodagi barcha millatlarni birlashtiradigan umumiy tildir." },
  el: { welcome: "Καλώς ήρθατε στο TimeNation",    select_hour: "Επιλέξτε την ώρα σας",       btn_publish: "Δημοσίευση βίντεο",  status: "Ο χρόνος είναι η κοινή γλώσσα που ενώνει όλα τα έθνη του κόσμου." },
  cs: { welcome: "Vítejte v TimeNation",            select_hour: "Vyberte svou hodinu",        btn_publish: "Zveřejnit video",    status: "Čas je společný jazyk, který spojuje všechny národy světa." },
  sv: { welcome: "Välkommen till TimeNation",       select_hour: "Välj din timme",             btn_publish: "Publicera video",    status: "Tid är ett gemensamt språk som förenar alla nationer i världen." },
};

const COLS = 4;

// ─── Component ────────────────────────────────────────────────────────────────

export default function LanguageClockScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  const { lang, setLang } = useLanguage();

  const [activeHour, setActiveHour] = useState<number>(() => {
    const found = LANGUAGES_24.find((l) => l.code === lang);
    return found ? found.hour : 1;
  });
  const handAnim = useRef(new Animated.Value((LANGUAGES_24.find((l) => l.code === lang)?.hour ?? 1) * 15)).current;

  const active = LANGUAGES_24.find((l) => l.hour === activeHour) ?? LANGUAGES_24[0];
  const t = TRANSLATIONS[active.code];

  // Compact clock: takes ~28% of usable height, min 160, max 240
  const usableH = height - insets.top - insets.bottom - 50;
  const CLOCK_SIZE = Math.min(Math.max(usableH * 0.27, 160), 240);
  const RADIUS = CLOCK_SIZE / 2 - 18;
  const HAND_H = CLOCK_SIZE / 2 - 14;

  function selectHour(hour: number, code: LangCode) {
    Animated.spring(handAnim, {
      toValue: hour * 15,
      tension: 60,
      friction: 8,
      useNativeDriver: true,
    }).start();
    setActiveHour(hour);
    setLang(code);
  }

  const handRotate = handAnim.interpolate({
    inputRange: [0, 360],
    outputRange: ["0deg", "360deg"],
  });

  // Item width for 4-column grid with gaps
  const PAD = 12;
  const GAP = 5;
  const itemW = (width - PAD * 2 - GAP * (COLS - 1)) / COLS;

  const styles = makeStyles(colors, CLOCK_SIZE, insets, itemW);

  return (
    <View style={styles.screen}>
      {/* Header */}
      <View style={styles.header}>
        <LogoBrand size={24} />
        <Text style={styles.headerTitle}>Циферблат народов</Text>
      </View>

      {/* Top section: clock + status side by side */}
      <View style={styles.topRow}>
        {/* Clock */}
        <View style={[styles.clockWrap, { width: CLOCK_SIZE, height: CLOCK_SIZE }]}>
          <View style={styles.centerDot} />
          <Animated.View
            style={[
              styles.clockHand,
              {
                height: HAND_H,
                width: 3,
                bottom: "50%",
                left: CLOCK_SIZE / 2 - 1.5,
                transform: [{ rotate: handRotate }],
              },
            ]}
          />
          {LANGUAGES_24.map((item) => {
            const angleRad = (item.hour * 15 - 90) * (Math.PI / 180);
            const bx = CLOCK_SIZE / 2 + RADIUS * Math.cos(angleRad) - 13;
            const by = CLOCK_SIZE / 2 + RADIUS * Math.sin(angleRad) - 13;
            const isActive = item.hour === activeHour;
            return (
              <TouchableOpacity
                key={item.hour}
                onPress={() => selectHour(item.hour, item.code as LangCode)}
                style={[styles.hourBtn, { left: bx, top: by }, isActive && styles.hourBtnActive]}
                hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
              >
                <Text style={styles.hourFlag}>{item.flag}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Right panel: active info + publish */}
        <View style={styles.rightPanel}>
          <Text style={styles.activeFlag}>{active.flag}</Text>
          <Text style={styles.activeIso}>{active.iso} · {activeHour}:00</Text>
          <Text style={styles.activeLabel} numberOfLines={1}>{active.label}</Text>
          <Text style={styles.statusText} numberOfLines={3} key={active.code}>
            {t.status}
          </Text>
          <TouchableOpacity
            style={styles.publishBtn}
            onPress={() => router.push("/(tabs)/tv")}
            activeOpacity={0.8}
          >
            <Feather name="video" size={12} color="#000" />
            <Text style={styles.publishBtnText}>{t.btn_publish}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Grid label */}
      <Text style={styles.gridLabel}>24 языка · 24 часа</Text>

      {/* 4-column flag grid */}
      <View style={styles.langGrid}>
        {LANGUAGES_24.map((item) => {
          const isActive = item.hour === activeHour;
          return (
            <TouchableOpacity
              key={item.hour}
              onPress={() => selectHour(item.hour, item.code as LangCode)}
              style={[styles.langItem, isActive && styles.langItemActive]}
              activeOpacity={0.7}
            >
              <Text style={styles.langFlag}>{item.flag}</Text>
              <Text style={[styles.langIso, isActive && styles.langIsoActive]}>{item.iso}</Text>
              <Text style={[styles.langLabel, isActive && styles.langLabelActive]} numberOfLines={1}>
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

function makeStyles(
  colors: ReturnType<typeof useColors>,
  clockSize: number,
  insets: { top: number; bottom: number; left: number; right: number },
  itemW: number,
) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.background,
      paddingTop: insets.top,
      paddingBottom: insets.bottom + 4,
      paddingHorizontal: 12,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      marginBottom: 10,
    },
    headerTitle: {
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
    },
    // ── Top row ──
    topRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      marginBottom: 10,
    },
    // Clock
    clockWrap: {
      borderRadius: clockSize / 2,
      borderWidth: 3,
      borderColor: "#f59e0b",
      backgroundColor: "#18181b",
      position: "relative",
      flexShrink: 0,
      shadowColor: "#f59e0b",
      shadowOpacity: 0.25,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 0 },
      elevation: 6,
    },
    centerDot: {
      position: "absolute",
      top: clockSize / 2 - 5,
      left: clockSize / 2 - 5,
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: "#f59e0b",
      zIndex: 10,
    },
    clockHand: {
      position: "absolute",
      backgroundColor: "#ef4444",
      borderRadius: 2,
      transformOrigin: "bottom center",
      zIndex: 5,
    },
    hourBtn: {
      position: "absolute",
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: "#27272a",
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: "#52525b",
    },
    hourBtnActive: {
      backgroundColor: "#f59e0b22",
      borderColor: "#f59e0b",
      elevation: 4,
    },
    hourFlag: {
      fontSize: 11,
    },
    // ── Right panel ──
    rightPanel: {
      flex: 1,
      gap: 3,
    },
    activeFlag: {
      fontSize: 28,
    },
    activeIso: {
      fontSize: 13,
      fontFamily: "Inter_700Bold",
      color: "#f59e0b",
    },
    activeLabel: {
      fontSize: 12,
      fontFamily: "Inter_500Medium",
      color: colors.foreground,
    },
    statusText: {
      fontSize: 10,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      lineHeight: 15,
      marginTop: 2,
      marginBottom: 6,
    },
    publishBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      backgroundColor: "#f59e0b",
      borderRadius: 8,
      paddingVertical: 7,
      paddingHorizontal: 10,
      alignSelf: "flex-start",
    },
    publishBtnText: {
      fontSize: 11,
      fontFamily: "Inter_700Bold",
      color: "#000",
    },
    // ── Grid ──
    gridLabel: {
      fontSize: 10,
      fontFamily: "Inter_600SemiBold",
      color: colors.mutedForeground,
      textTransform: "uppercase",
      letterSpacing: 1.2,
      marginBottom: 6,
    },
    langGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 5,
    },
    langItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
      width: itemW,
      paddingHorizontal: 5,
      paddingVertical: 5,
      borderRadius: 7,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    langItemActive: {
      borderColor: "#f59e0b88",
      backgroundColor: "#f59e0b18",
    },
    langFlag: {
      fontSize: 13,
    },
    langIso: {
      fontSize: 8,
      fontFamily: "Inter_600SemiBold",
      color: colors.mutedForeground,
      width: 16,
    },
    langIsoActive: {
      color: "#f59e0b",
    },
    langLabel: {
      fontSize: 9,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      flex: 1,
    },
    langLabelActive: {
      fontFamily: "Inter_600SemiBold",
      color: "#f59e0b",
    },
  });
}
