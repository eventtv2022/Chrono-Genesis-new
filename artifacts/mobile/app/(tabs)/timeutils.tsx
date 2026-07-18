import { getBaseUrl } from "@/lib/api";
import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Platform,
  Modal,
  TextInput,
  FlatList,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Notifications from "expo-notifications";
import { Audio } from "expo-av";
import { useColors } from "@/hooks/useColors";
import { useCitizen } from "@/context/CitizenContext";
import { useLanguage } from "@/context/LanguageContext";
import { LogoBrand } from "@/components/LogoBrand";

const BASE_URL = getBaseUrl();

// ── World clock zones — 24 UTC offsets ────────────────────────────────────────

/** City names translated into all 24 language-dial languages */
const CITY_NAMES: Record<string, Record<string, string>> = {
  pago_pago: {
    ru: "Паго-Паго",     en: "Pago Pago",          zh: "帕果帕果",      hi: "पागो पागो",
    es: "Pago Pago",     fr: "Pago Pago",           ar: "باغو باغو",    bn: "পাগো পাগো",
    pt: "Pago Pago",     ur: "پاگو پاگو",            id: "Pago Pago",    de: "Pago Pago",
    ja: "パゴパゴ",       tr: "Pago Pago",            vi: "Pago Pago",    he: "פאגו פאגו",
    fa: "پاگو پاگو",      ko: "파고파고",              it: "Pago Pago",    pl: "Pago Pago",
    uk: "Паго-Паго",     nl: "Pago Pago",            kk: "Паго-Паго",    uz: "Pago Pago",
  },
  honolulu: {
    ru: "Гонолулу",      en: "Honolulu",             zh: "火奴鲁鲁",      hi: "होनोलूलू",
    es: "Honolulú",      fr: "Honolulu",             ar: "هونولولو",     bn: "হনলুলু",
    pt: "Honolulu",      ur: "ہونولولو",              id: "Honolulu",     de: "Honolulu",
    ja: "ホノルル",       tr: "Honolulu",             vi: "Honolulu",     he: "הונולולו",
    fa: "هونولولو",       ko: "호놀룰루",              it: "Honolulu",     pl: "Honolulu",
    uk: "Гонолулу",      nl: "Honolulu",             kk: "Гонолулу",     uz: "Honolulu",
  },
  anchorage: {
    ru: "Анкоридж",      en: "Anchorage",            zh: "安克雷奇",      hi: "एंकरेज",
    es: "Anchorage",     fr: "Anchorage",            ar: "أنكوريج",      bn: "অ্যাংকরেজ",
    pt: "Anchorage",     ur: "انکریج",               id: "Anchorage",    de: "Anchorage",
    ja: "アンカレッジ",   tr: "Anchorage",            vi: "Anchorage",    he: "אנקורג׳",
    fa: "آنکوریج",        ko: "앵커리지",              it: "Anchorage",    pl: "Anchorage",
    uk: "Анкоридж",      nl: "Anchorage",            kk: "Анкоридж",     uz: "Anchorage",
  },
  los_angeles: {
    ru: "Лос-Анджелес",  en: "Los Angeles",          zh: "洛杉矶",        hi: "लॉस एंजिल्स",
    es: "Los Ángeles",   fr: "Los Angeles",          ar: "لوس أنجلوس",   bn: "লস অ্যাঞ্জেলেস",
    pt: "Los Angeles",   ur: "لاس اینجلیس",           id: "Los Angeles",  de: "Los Angeles",
    ja: "ロサンゼルス",   tr: "Los Angeles",          vi: "Los Angeles",  he: "לוס אנג'לס",
    fa: "لوس‌آنجلس",      ko: "로스앤젤레스",           it: "Los Angeles",  pl: "Los Angeles",
    uk: "Лос-Анджелес",  nl: "Los Angeles",          kk: "Лос-Анджелес", uz: "Los-Anjeles",
  },
  denver: {
    ru: "Денвер",        en: "Denver",               zh: "丹佛",          hi: "डेनवर",
    es: "Denver",        fr: "Denver",               ar: "دنفر",         bn: "ডেনভার",
    pt: "Denver",        ur: "ڈینور",                id: "Denver",       de: "Denver",
    ja: "デンバー",       tr: "Denver",               vi: "Denver",       he: "דנוור",
    fa: "دنور",           ko: "덴버",                  it: "Denver",       pl: "Denver",
    uk: "Денвер",        nl: "Denver",               kk: "Денвер",       uz: "Denver",
  },
  mexico_city: {
    ru: "Мехико",        en: "Mexico City",          zh: "墨西哥城",      hi: "मेक्सिको सिटी",
    es: "Ciudad de México", fr: "Mexico",            ar: "مكسيكو سيتي",  bn: "মেক্সিকো সিটি",
    pt: "Cidade do México", ur: "میکسیکو سٹی",       id: "Kota Meksiko", de: "Mexiko-Stadt",
    ja: "メキシコシティ", tr: "Meksiko Şehri",        vi: "Mexico City",  he: "מקסיקו סיטי",
    fa: "شهر مکزیک",     ko: "멕시코시티",             it: "Città del Messico", pl: "Meksyk",
    uk: "Мехіко",        nl: "Mexico-Stad",          kk: "Мехико",       uz: "Mexiko shahri",
  },
  new_york: {
    ru: "Нью-Йорк",      en: "New York",             zh: "纽约",          hi: "न्यूयॉर्क",
    es: "Nueva York",    fr: "New York",             ar: "نيويورك",      bn: "নিউ ইয়র্ক",
    pt: "Nova Iorque",   ur: "نیویارک",               id: "New York",     de: "New York",
    ja: "ニューヨーク",   tr: "New York",             vi: "New York",     he: "ניו יורק",
    fa: "نیویورک",        ko: "뉴욕",                  it: "New York",     pl: "Nowy Jork",
    uk: "Нью-Йорк",      nl: "New York",             kk: "Нью-Йорк",     uz: "Nyu-York",
  },
  santiago: {
    ru: "Сантьяго",      en: "Santiago",             zh: "圣地亚哥",      hi: "सैंटियागो",
    es: "Santiago",      fr: "Santiago",             ar: "سانتياغو",     bn: "সান্টিয়াগো",
    pt: "Santiago",      ur: "سینٹیاگو",              id: "Santiago",     de: "Santiago",
    ja: "サンティアゴ",   tr: "Santiago",             vi: "Santiago",     he: "סנטיאגו",
    fa: "سانتیاگو",       ko: "산티아고",              it: "Santiago",     pl: "Santiago",
    uk: "Сантьяго",      nl: "Santiago",             kk: "Сантьяго",     uz: "Santyago",
  },
  sao_paulo: {
    ru: "Сан-Паулу",     en: "São Paulo",            zh: "圣保罗",        hi: "साओ पाउलो",
    es: "São Paulo",     fr: "São Paulo",            ar: "ساو باولو",    bn: "সাও পাওলো",
    pt: "São Paulo",     ur: "ساؤ پاولو",             id: "São Paulo",    de: "São Paulo",
    ja: "サンパウロ",     tr: "São Paulo",            vi: "São Paulo",    he: "סאו פאולו",
    fa: "سائوپائولو",     ko: "상파울루",              it: "San Paolo",    pl: "São Paulo",
    uk: "Сан-Паулу",     nl: "São Paulo",            kk: "Сан-Паулу",    uz: "San-Paulo",
  },
  noronha: {
    ru: "Норонья",       en: "Noronha",              zh: "费尔南多群岛",   hi: "नोरोन्हा",
    es: "Noronha",       fr: "Noronha",              ar: "نورونيا",      bn: "নোরোনহা",
    pt: "Fernando de Noronha", ur: "نورونہا",         id: "Noronha",      de: "Noronha",
    ja: "ノローニャ",     tr: "Noronha",              vi: "Noronha",      he: "נורוניה",
    fa: "نورونها",        ko: "노로냐",                it: "Noronha",      pl: "Noronha",
    uk: "Норонья",       nl: "Noronha",              kk: "Норонья",      uz: "Noronha",
  },
  praia: {
    ru: "Прая",          en: "Praia",                zh: "普拉亚",        hi: "प्रaia",
    es: "Praia",         fr: "Praia",                ar: "براييا",       bn: "প্রাইয়া",
    pt: "Praia",         ur: "پرایا",                id: "Praia",        de: "Praia",
    ja: "プライア",       tr: "Praia",                vi: "Praia",        he: "פריאה",
    fa: "پرایا",          ko: "프라이아",              it: "Praia",        pl: "Praia",
    uk: "Прая",          nl: "Praia",                kk: "Прая",         uz: "Praia",
  },
  london: {
    ru: "Лондон",        en: "London",               zh: "伦敦",          hi: "लंदन",
    es: "Londres",       fr: "Londres",              ar: "لندن",         bn: "লন্ডন",
    pt: "Londres",       ur: "لندن",                 id: "London",       de: "London",
    ja: "ロンドン",       tr: "Londra",               vi: "Luân Đôn",     he: "לונדון",
    fa: "لندن",           ko: "런던",                  it: "Londra",       pl: "Londyn",
    uk: "Лондон",        nl: "Londen",               kk: "Лондон",       uz: "London",
  },
  paris: {
    ru: "Париж",         en: "Paris",                zh: "巴黎",          hi: "पेरिस",
    es: "París",         fr: "Paris",                ar: "باريس",        bn: "প্যারিস",
    pt: "Paris",         ur: "پیرس",                 id: "Paris",        de: "Paris",
    ja: "パリ",           tr: "Paris",                vi: "Pa-ri",        he: "פריז",
    fa: "پاریس",          ko: "파리",                  it: "Parigi",       pl: "Paryż",
    uk: "Париж",         nl: "Parijs",               kk: "Париж",        uz: "Paris",
  },
  cairo: {
    ru: "Каир",          en: "Cairo",                zh: "开罗",          hi: "काहिरा",
    es: "El Cairo",      fr: "Le Caire",             ar: "القاهرة",      bn: "কায়রো",
    pt: "Cairo",         ur: "قاہرہ",                id: "Kairo",        de: "Kairo",
    ja: "カイロ",         tr: "Kahire",               vi: "Cairo",        he: "קהיר",
    fa: "قاهره",          ko: "카이로",                it: "Il Cairo",     pl: "Kair",
    uk: "Каїр",          nl: "Caïro",                kk: "Каир",         uz: "Qohira",
  },
  moscow: {
    ru: "Москва",        en: "Moscow",               zh: "莫斯科",        hi: "मास्को",
    es: "Moscú",         fr: "Moscou",               ar: "موسكو",        bn: "মস্কো",
    pt: "Moscou",        ur: "ماسکو",                id: "Moskow",       de: "Moskau",
    ja: "モスクワ",       tr: "Moskova",              vi: "Mát-xcơ-va",   he: "מוסקבה",
    fa: "مسکو",           ko: "모스크바",              it: "Mosca",        pl: "Moskwa",
    uk: "Москва",        nl: "Moskou",               kk: "Мәскеу",       uz: "Moskva",
  },
  dubai: {
    ru: "Дубай",         en: "Dubai",                zh: "迪拜",          hi: "दुबई",
    es: "Dubái",         fr: "Dubaï",                ar: "دبي",          bn: "দুবাই",
    pt: "Dubai",         ur: "دبئی",                 id: "Dubai",        de: "Dubai",
    ja: "ドバイ",         tr: "Dubai",                vi: "Dubai",        he: "דובאי",
    fa: "دبی",            ko: "두바이",                it: "Dubai",        pl: "Dubaj",
    uk: "Дубай",         nl: "Dubai",                kk: "Дубай",        uz: "Dubay",
  },
  karachi: {
    ru: "Карачи",        en: "Karachi",              zh: "卡拉奇",        hi: "कराची",
    es: "Karachi",       fr: "Karachi",              ar: "كراتشي",       bn: "করাচি",
    pt: "Carachi",       ur: "کراچی",                id: "Karachi",      de: "Karachi",
    ja: "カラチ",         tr: "Karaçi",               vi: "Karachi",      he: "קראצ׳י",
    fa: "کراچی",          ko: "카라치",                it: "Karachi",      pl: "Karaczi",
    uk: "Карачі",        nl: "Karachi",              kk: "Карачи",       uz: "Karachi",
  },
  dhaka: {
    ru: "Дакка",         en: "Dhaka",                zh: "达卡",          hi: "ढाका",
    es: "Daca",          fr: "Dacca",                ar: "دكا",          bn: "ঢাকা",
    pt: "Dacca",         ur: "ڈھاکہ",                id: "Dhaka",        de: "Dhaka",
    ja: "ダッカ",         tr: "Dakka",                vi: "Dhaka",        he: "דאקה",
    fa: "داکا",           ko: "다카",                  it: "Dacca",        pl: "Dhaka",
    uk: "Дакка",         nl: "Dhaka",                kk: "Дакка",        uz: "Dhaka",
  },
  bangkok: {
    ru: "Бангкок",       en: "Bangkok",              zh: "曼谷",          hi: "बैंकॉक",
    es: "Bangkok",       fr: "Bangkok",              ar: "بانكوك",       bn: "ব্যাংকক",
    pt: "Banguecoque",   ur: "بینکاک",               id: "Bangkok",      de: "Bangkok",
    ja: "バンコク",       tr: "Bangkok",              vi: "Bangkok",      he: "בנגקוק",
    fa: "بانکوک",         ko: "방콕",                  it: "Bangkok",      pl: "Bangkok",
    uk: "Бангкок",       nl: "Bangkok",              kk: "Бангкок",      uz: "Bangkok",
  },
  beijing: {
    ru: "Пекин",         en: "Beijing",              zh: "北京",          hi: "बीजिंग",
    es: "Pekín",         fr: "Pékin",                ar: "بكين",         bn: "বেইজিং",
    pt: "Pequim",        ur: "بیجنگ",                id: "Beijing",      de: "Peking",
    ja: "北京",           tr: "Pekin",                vi: "Bắc Kinh",     he: "בייג'ינג",
    fa: "پکن",            ko: "베이징",                it: "Pechino",      pl: "Pekin",
    uk: "Пекін",         nl: "Peking",               kk: "Пекин",        uz: "Pekin",
  },
  tokyo: {
    ru: "Токио",         en: "Tokyo",                zh: "东京",          hi: "टोक्यो",
    es: "Tokio",         fr: "Tokyo",                ar: "طوكيو",        bn: "টোকিও",
    pt: "Tóquio",        ur: "ٹوکیو",                id: "Tokyo",        de: "Tokio",
    ja: "東京",           tr: "Tokyo",                vi: "Tokyo",        he: "טוקיו",
    fa: "توکیو",          ko: "도쿄",                  it: "Tokyo",        pl: "Tokio",
    uk: "Токіо",         nl: "Tokio",                kk: "Токио",        uz: "Tokio",
  },
  sydney: {
    ru: "Сидней",        en: "Sydney",               zh: "悉尼",          hi: "सिडनी",
    es: "Sídney",        fr: "Sydney",               ar: "سيدني",        bn: "সিডনি",
    pt: "Sydney",        ur: "سڈنی",                 id: "Sydney",       de: "Sydney",
    ja: "シドニー",       tr: "Sidney",               vi: "Sydney",       he: "סידני",
    fa: "سیدنی",          ko: "시드니",                it: "Sydney",       pl: "Sydney",
    uk: "Сідней",        nl: "Sydney",               kk: "Сидней",       uz: "Sidney",
  },
  noumea: {
    ru: "Нумеа",         en: "Noumea",               zh: "努美阿",        hi: "नूमिया",
    es: "Numea",         fr: "Nouméa",               ar: "نوميا",        bn: "নুমেয়া",
    pt: "Nouméa",        ur: "نومیا",                id: "Noumea",       de: "Nouméa",
    ja: "ヌメア",         tr: "Noumea",               vi: "Nouméa",       he: "נומאה",
    fa: "نومئا",          ko: "누메아",                it: "Nouméa",       pl: "Numea",
    uk: "Нумеа",         nl: "Nouméa",               kk: "Нумеа",        uz: "Numea",
  },
  auckland: {
    ru: "Окленд",        en: "Auckland",             zh: "奥克兰",        hi: "ऑकलैंड",
    es: "Auckland",      fr: "Auckland",             ar: "أوكلاند",      bn: "অকল্যান্ড",
    pt: "Auckland",      ur: "آکلینڈ",               id: "Auckland",     de: "Auckland",
    ja: "オークランド",   tr: "Auckland",             vi: "Auckland",     he: "אוקלנד",
    fa: "اوکلند",         ko: "오클랜드",              it: "Auckland",     pl: "Auckland",
    uk: "Окленд",        nl: "Auckland",             kk: "Окленд",       uz: "Oklend",
  },
};

const ZONES: Array<{ key: string; tz: string; flag: string }> = [
  { key: "pago_pago",   tz: "Pacific/Pago_Pago",    flag: "🇼🇸" }, // UTC-11
  { key: "honolulu",    tz: "Pacific/Honolulu",      flag: "🇺🇸" }, // UTC-10
  { key: "anchorage",   tz: "America/Anchorage",     flag: "🇺🇸" }, // UTC-9
  { key: "los_angeles", tz: "America/Los_Angeles",   flag: "🇺🇸" }, // UTC-8
  { key: "denver",      tz: "America/Denver",        flag: "🇺🇸" }, // UTC-7
  { key: "mexico_city", tz: "America/Mexico_City",   flag: "🇲🇽" }, // UTC-6
  { key: "new_york",    tz: "America/New_York",      flag: "🇺🇸" }, // UTC-5
  { key: "santiago",    tz: "America/Santiago",      flag: "🇨🇱" }, // UTC-4
  { key: "sao_paulo",   tz: "America/Sao_Paulo",     flag: "🇧🇷" }, // UTC-3
  { key: "noronha",     tz: "America/Noronha",       flag: "🇧🇷" }, // UTC-2
  { key: "praia",       tz: "Atlantic/Cape_Verde",   flag: "🇨🇻" }, // UTC-1
  { key: "london",      tz: "Europe/London",         flag: "🇬🇧" }, // UTC+0
  { key: "paris",       tz: "Europe/Paris",          flag: "🇫🇷" }, // UTC+1
  { key: "cairo",       tz: "Africa/Cairo",          flag: "🇪🇬" }, // UTC+2
  { key: "moscow",      tz: "Europe/Moscow",         flag: "🇷🇺" }, // UTC+3
  { key: "dubai",       tz: "Asia/Dubai",            flag: "🇦🇪" }, // UTC+4
  { key: "karachi",     tz: "Asia/Karachi",          flag: "🇵🇰" }, // UTC+5
  { key: "dhaka",       tz: "Asia/Dhaka",            flag: "🇧🇩" }, // UTC+6
  { key: "bangkok",     tz: "Asia/Bangkok",          flag: "🇹🇭" }, // UTC+7
  { key: "beijing",     tz: "Asia/Shanghai",         flag: "🇨🇳" }, // UTC+8
  { key: "tokyo",       tz: "Asia/Tokyo",            flag: "🇯🇵" }, // UTC+9
  { key: "sydney",      tz: "Australia/Sydney",      flag: "🇦🇺" }, // UTC+10
  { key: "noumea",      tz: "Pacific/Noumea",        flag: "🇳🇨" }, // UTC+11
  { key: "auckland",    tz: "Pacific/Auckland",      flag: "🇳🇿" }, // UTC+12
];

function getTimeInZone(tz: string, lang: string): { time: string; date: string; offset: string } {
  const now = new Date();
  const time = new Intl.DateTimeFormat(lang, {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(now);
  const date = new Intl.DateTimeFormat(lang, {
    timeZone: tz,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(now);
  const offsetMs = new Date(now.toLocaleString("en-US", { timeZone: tz })).getTime()
    - new Date(now.toLocaleString("en-US", { timeZone: "UTC" })).getTime();
  const offsetH = offsetMs / 3600000;
  const sign = offsetH >= 0 ? "+" : "";
  const offset = `UTC${sign}${offsetH % 1 === 0 ? offsetH : offsetH.toFixed(1)}`;
  return { time, date, offset };
}

// ── Pomodoro preset seconds (labels computed inside component) ────────────────

const PRESET_SECONDS_CONST = [12, 24, 25, 36, 48, 50, 60, 90];

// ── Alarm days (computed inside component via Intl) ───────────────────────────

function getDayNames(lang: string): string[] {
  // Build Sun→Sat short names using a known Sunday (2021-01-03)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(2021, 0, 3 + i); // 2021-01-03 is Sunday
    return new Intl.DateTimeFormat(lang, { weekday: "narrow" }).format(d);
  });
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function TimeUtilsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { citizen } = useCitizen();
  const { t, lang } = useLanguage();
  const st = styles(colors);
  const DAYS = getDayNames(lang);
  const PRESET_SECONDS = [12, 24, 25, 36, 48, 50, 60, 90].map((m) => ({ label: `${m}m`, seconds: m * 60 }));

  // ── Section toggle ──────────────────────────────────────────────────────────
  const [section, setSection] = useState<"clock" | "timer" | "alarm" | "social-alarm">("clock");

  // ── Social Alarm ─────────────────────────────────────────────────────────────
  const [saConsent, setSaConsent] = useState(false);
  const [saConsentSaving, setSaConsentSaving] = useState(false);
  const [saSubscribers, setSaSubscribers] = useState<Array<{id:number;pseudonym:string;rank:string}>>([]);
  const [saSearch, setSaSearch] = useState("");
  const [saSelectedTargets, setSaSelectedTargets] = useState<Set<number>>(new Set());
  const [saSending, setSaSending] = useState(false);
  const [saSentMsg, setSaSentMsg] = useState("");
  const [saAlarmTime, setSaAlarmTime] = useState("");
  const [saPurpose, setSaPurpose] = useState("");
  const [anthemModal, setAnthemModal] = useState(false);
  const [anthemSender, setAnthemSender] = useState("");
  const [anthemIsGlobal, setAnthemIsGlobal] = useState(false);
  const [anthemPlaying, setAnthemPlaying] = useState(false);
  const anthemSoundRef = useRef<Audio.Sound | null>(null);
  const saWsRef = useRef<WebSocket | null>(null);
  const saReconRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!citizen?.id) return;
    const cId = citizen.id;
    const connectWs = () => {
      const wsUrl = BASE_URL.replace(/^https?/, (m: string) => (m === "https" ? "wss" : "ws")) + "/api/ws";
      const ws = new WebSocket(wsUrl);
      saWsRef.current = ws;
      ws.onopen = () => ws.send(JSON.stringify({ type: "auth", citizenId: cId }));
      ws.onmessage = (evt: MessageEvent) => {
        try {
          const msg = JSON.parse(evt.data as string) as Record<string, unknown>;
          if (msg["type"] === "auth_ok") setSaConsent(msg["subscribed"] === true);
          if (msg["type"] === "consent_updated") setSaConsent(msg["subscribed"] === true);
          if (msg["type"] === "PLAY_ANTHEM") {
            setAnthemSender(String(msg["triggeredBy"] ?? "TimeNation"));
            setAnthemIsGlobal(msg["targetType"] === "all");
            setAnthemModal(true);
            setAnthemPlaying(false);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          }
        } catch { /* bad JSON */ }
      };
      ws.onclose = () => { saReconRef.current = setTimeout(connectWs, 5000); };
    };
    connectWs();
    return () => {
      if (saReconRef.current) clearTimeout(saReconRef.current);
      saWsRef.current?.close();
    };
  }, [citizen?.id]);

  const loadSaSubscribers = useCallback(async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/citizens/social-alarm-subscribers`);
      setSaSubscribers(await res.json() as Array<{id:number;pseudonym:string;rank:string}>);
    } catch { /* offline */ }
  }, []);

  useEffect(() => { if (section === "social-alarm") void loadSaSubscribers(); }, [section, loadSaSubscribers]);

  const toggleSaConsent = async () => {
    if (!citizen?.id) return;
    const next = !saConsent;
    setSaConsentSaving(true);
    try {
      await fetch(`${BASE_URL}/api/citizens/${citizen.id}/social-alarm-consent`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consent: next }),
      });
      setSaConsent(next);
      const ws = saWsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "update_consent", consent: next }));
    } catch { /* silent */ } finally { setSaConsentSaving(false); }
  };

  const sendSaSignal = async (global = false) => {
    if (!citizen?.id) return;
    setSaSending(true);
    try {
      const body = global
        ? { initiatedBy: citizen.id }
        : { initiatedBy: citizen.id, targetCitizenIds: [...saSelectedTargets] };
      const res = await fetch(`${BASE_URL}/api/system/trigger-alarm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setSaSentMsg(t.sa_sent);
        setSaSelectedTargets(new Set());
        setTimeout(() => setSaSentMsg(""), 3000);
      }
    } catch { /* silent */ } finally { setSaSending(false); }
  };

  const toggleSaTarget = (id: number) => {
    setSaSelectedTargets(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const playAnthem = async () => {
    try {
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
      const { sound } = await Audio.Sound.createAsync(
        require("../../assets/timenation_anthem.mp3"),
        { shouldPlay: true }
      );
      anthemSoundRef.current = sound;
      setAnthemPlaying(true);
    } catch { /* blocked */ }
  };

  const stopAnthem = () => {
    if (anthemSoundRef.current) {
      void anthemSoundRef.current.stopAsync();
      void anthemSoundRef.current.unloadAsync();
      anthemSoundRef.current = null;
    }
    setAnthemPlaying(false);
    setAnthemModal(false);
  };

  const saFiltered = saSubscribers.filter(s =>
    s.pseudonym.toLowerCase().includes(saSearch.toLowerCase()) && s.id !== citizen?.id
  );

  // ── World clock ─────────────────────────────────────────────────────────────
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // ── Pomodoro timer ──────────────────────────────────────────────────────────
  const [preset, setPreset] = useState(0);
  const [remaining, setRemaining] = useState(PRESET_SECONDS_CONST[0]! * 60);
  const [running, setRunning] = useState(false);
  const [completed, setCompleted] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionDurationRef = useRef(PRESET_SECONDS_CONST[0]! * 60);

  const stopInterval = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const handleTimerComplete = useCallback(async () => {
    stopInterval();
    setRunning(false);
    setCompleted(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    // Log focus session to backend
    if (citizen?.id) {
      try {
        await fetch(`${BASE_URL}/api/citizens/log-focus`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            citizenId: citizen.id,
            durationMinutes: Math.round(sessionDurationRef.current / 60),
          }),
        });
      } catch { /* silent — offline is fine */ }
    }
    Alert.alert(
      t.time_session_done,
      `${Math.round(sessionDurationRef.current / 60)} min · ${t.time_pomodoro}`,
      [{ text: "OK", onPress: () => setCompleted(false) }]
    );
  }, [citizen?.id, stopInterval]);

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setRemaining((r) => {
          if (r <= 1) {
            handleTimerComplete();
            return 0;
          }
          return r - 1;
        });
      }, 1000);
    } else {
      stopInterval();
    }
    return stopInterval;
  }, [running, handleTimerComplete, stopInterval]);

  const handlePreset = (i: number) => {
    stopInterval();
    setRunning(false);
    setCompleted(false);
    setPreset(i);
    setRemaining(PRESET_SECONDS_CONST[i]! * 60);
    sessionDurationRef.current = PRESET_SECONDS_CONST[i]! * 60;
  };

  const handleStartPause = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setRunning((r) => !r);
  };

  const handleReset = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    stopInterval();
    setRunning(false);
    setCompleted(false);
    setRemaining(PRESET_SECONDS_CONST[preset]! * 60);
  };

  const timerMinutes = Math.floor(remaining / 60);
  const timerSeconds = remaining % 60;
  const progress = remaining / (PRESET_SECONDS_CONST[preset]! * 60);

  // ── Alarm ───────────────────────────────────────────────────────────────────
  const [alarmHour, setAlarmHour] = useState(7);
  const [alarmMinute, setAlarmMinute] = useState(0);
  const [alarmDays, setAlarmDays] = useState<Set<number>>(new Set([0, 1, 2, 3, 4, 5, 6]));
  const [alarmActive, setAlarmActive] = useState(false);
  const [alarmFiring, setAlarmFiring] = useState(false);
  // Web-only fallback refs (native uses scheduled system notifications)
  const alarmRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastFiredKey = useRef<string>("");
  // expo-av Sound ref
  const soundRef = useRef<Audio.Sound | null>(null);

  // ── Load alarm sound once ──────────────────────────────────────────────────
  useEffect(() => {
    void Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
    });
  }, []);

  const playAlarmSound = useCallback(async () => {
    try {
      if (soundRef.current) {
        await soundRef.current.stopAsync().catch(() => {});
        await soundRef.current.unloadAsync().catch(() => {});
        soundRef.current = null;
      }
      const { sound } = await Audio.Sound.createAsync(
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require("../../assets/alarm.mp3"),
        { shouldPlay: true, isLooping: true, volume: 1.0 }
      );
      soundRef.current = sound;
    } catch { /* file might not exist on web fallback */ }
  }, []);

  const stopAlarmSound = useCallback(async () => {
    if (soundRef.current) {
      await soundRef.current.stopAsync().catch(() => {});
      await soundRef.current.unloadAsync().catch(() => {});
      soundRef.current = null;
    }
  }, []);

  const dismissAlarm = useCallback(() => {
    setAlarmFiring(false);
    void stopAlarmSound();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [stopAlarmSound]);

  const toggleDay = (d: number) => {
    setAlarmDays((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d); else next.add(d);
      return next;
    });
  };

  // ── Notification setup (native only) ────────────────────────────────────────
  useEffect(() => {
    if (Platform.OS === "web") return;

    // Show banner + play sound even when app is foregrounded
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });

    const setup = async () => {
      // Android: high-priority alarm channel with vibration
      if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync("tn-alarm", {
          name: "Суверенный Будильник",
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 300, 200, 300],
          lightColor: "#C9A84C",
          enableVibrate: true,
          showBadge: false,
        });
      }
      // Request permission — will prompt the user once
      const perms = await Notifications.requestPermissionsAsync();
      const permStatus = (perms as unknown as { status?: string }).status;
      if (permStatus !== "granted") {
        Alert.alert(
          `⛔ ${t.time_alarm_tab}`,
          t.time_alarm,
          [{ text: "OK" }]
        );
      }
    };
    void setup();
  }, []);

  // ── Schedule / cancel system notifications (native) ─────────────────────────
  const syncScheduledAlarms = useCallback(async () => {
    if (Platform.OS === "web") return;

    // Cancel all previously scheduled alarm notifications
    const existing = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      existing
        .filter((n) => n.identifier.startsWith("tn-alarm-"))
        .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier))
    );

    if (!alarmActive || alarmDays.size === 0) return;

    const HH = String(alarmHour).padStart(2, "0");
    const MM = String(alarmMinute).padStart(2, "0");

    // Schedule one weekly notification per selected day
    // JS getDay(): 0=Sun…6=Sat → Expo weekday: 1=Sun…7=Sat
    await Promise.all(
      Array.from(alarmDays).map((jsDay) =>
        Notifications.scheduleNotificationAsync({
          identifier: `tn-alarm-day-${jsDay}`,
          content: {
            title: `⏰ ${t.time_alarm}`,
            body: `${HH}:${MM} · ${citizen?.name ?? "TimeNation"}`,
            sound: true,
            data: { type: "tn-alarm" },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
            weekday: jsDay + 1,  // 0+1=1(Sun) … 6+1=7(Sat)
            hour: alarmHour,
            minute: alarmMinute,
            repeats: true,
          } as Notifications.WeeklyTriggerInput,
        })
      )
    );
  }, [alarmActive, alarmHour, alarmMinute, alarmDays, citizen?.name]);

  useEffect(() => {
    if (Platform.OS !== "web") {
      void syncScheduledAlarms();
      return;
    }

    // ── Web fallback: polling every 10 s ──────────────────────────────────────
    if (!alarmActive) return;

    /** Returns {h, m, weekday} in Asia/Nicosia — robust across all platforms. */
    const getNicosiaHMS = (): { h: number; m: number; weekday: number } => {
      const now = new Date();
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Nicosia",
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", hour12: false,
      }).formatToParts(now);
      const get = (t: string) => parseInt(parts.find((p) => p.type === t)?.value ?? "0", 10);
      let h = get("hour");
      if (h === 24) h = 0;
      const weekday = new Date(get("year"), get("month") - 1, get("day")).getDay();
      return { h, m: get("minute"), weekday };
    };

    const check = () => {
      const { h, m, weekday } = getNicosiaHMS();
      const fireKey = `${h}:${m}:${weekday}`;
      if (h === alarmHour && m === alarmMinute && alarmDays.has(weekday) && lastFiredKey.current !== fireKey) {
        lastFiredKey.current = fireKey;
        setAlarmFiring(true);
        void playAlarmSound();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }
    };
    check();
    alarmRef.current = setInterval(check, 5_000);
    return () => { if (alarmRef.current) clearInterval(alarmRef.current); };
  }, [alarmActive, alarmHour, alarmMinute, alarmDays, citizen?.name, syncScheduledAlarms, playAlarmSound]);

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[st.root, { paddingTop: topPad }]}>
      {/* Header */}
      <View style={st.header}>
        <LogoBrand size={28} />
        <Text style={st.headerTitle}>{t.tab_time}</Text>
        <View style={{ width: 28 }} />
      </View>

      {/* Social Alarm fullscreen Modal */}
      <Modal visible={anthemModal} animationType="fade" statusBarTranslucent transparent>
        <TouchableOpacity
          style={saSt.anthemOverlay}
          activeOpacity={1}
          onPress={!anthemPlaying ? () => { void playAnthem(); } : undefined}
        >
          <View style={saSt.anthemContent}>
            <View style={[saSt.anthemCircle, { borderColor: colors.primary, backgroundColor: colors.primary + "22" }]}>
              <Feather name="radio" size={52} color={colors.primary} />
            </View>
            <View style={{ gap: 8 }}>
              {anthemIsGlobal ? (
                <Text style={[saSt.anthemTitle, { color: colors.foreground }]}>{t.sa_overlay_admin}</Text>
              ) : (
                <Text style={[saSt.anthemTitle, { color: colors.foreground }]}>
                  <Text style={{ color: colors.primary }}>{anthemSender}</Text>{" "}{t.sa_overlay_user}
                </Text>
              )}
              {!anthemPlaying && (
                <Text style={[saSt.anthemSub, { color: colors.primary }]}>{t.sa_tap_to_play}</Text>
              )}
              {anthemPlaying && (
                <Text style={[saSt.anthemSub, { color: "#22c55e" }]}>♪ {t.sa_sent}</Text>
              )}
            </View>
            <TouchableOpacity
              style={[saSt.anthemDismiss, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={stopAnthem}
            >
              <Feather name="x" size={16} color={colors.foreground} />
              <Text style={[saSt.anthemDismissText, { color: colors.foreground }]}>{t.sa_dismiss}</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Section tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={st.sectionRow}
        style={{ flexGrow: 0 }}
      >
        {(["clock", "timer", "alarm", "social-alarm"] as const).map((s) => (
          <TouchableOpacity
            key={s}
            style={[st.sectionBtn, section === s && st.sectionBtnActive]}
            onPress={() => { Haptics.selectionAsync(); setSection(s); }}
          >
            <Feather
              name={s === "clock" ? "globe" : s === "timer" ? "clock" : s === "alarm" ? "bell" : "radio"}
              size={14}
              color={section === s ? colors.primaryForeground : colors.mutedForeground}
            />
            <Text style={[st.sectionBtnText, section === s && st.sectionBtnTextActive]}>
              {s === "clock" ? t.time_zones_tab : s === "timer" ? t.time_timer_tab : s === "alarm" ? t.time_alarm_tab : t.sa_tab}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={st.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* ── World Clock ── */}
        {section === "clock" && (
          <View style={st.section}>
            <Text style={st.sectionTitle}>{t.time_world_clock}</Text>
            <Text style={st.sectionSub}>TimeNation · Famagusta, Cyprus</Text>
            {ZONES.map((z) => {
              const { time, date, offset } = getTimeInZone(z.tz, lang);
              const cityName = (CITY_NAMES[z.key] as Record<string, string> | undefined)?.[lang]
                ?? (CITY_NAMES[z.key] as Record<string, string> | undefined)?.["en"]
                ?? z.key;
              return (
                <View key={z.key} style={st.clockCard}>
                  <View style={st.clockLeft}>
                    <Text style={st.clockFlag}>{z.flag}</Text>
                    <View>
                      <Text style={st.clockCity}>{cityName}</Text>
                      <Text style={st.clockOffset}>{offset}</Text>
                    </View>
                  </View>
                  <View style={st.clockRight}>
                    <Text style={st.clockTime}>{time}</Text>
                    <Text style={st.clockDate}>{date}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* ── Pomodoro Timer ── */}
        {section === "timer" && (
          <View style={st.section}>
            <Text style={st.sectionTitle}>{t.time_pomodoro}</Text>
            <Text style={st.sectionSub}>{t.timer_ai_checker}</Text>

            {/* Preset buttons */}
            <View style={st.presetRow}>
              {PRESET_SECONDS.map((p, i) => (
                <TouchableOpacity
                  key={i}
                  style={[st.presetBtn, preset === i && st.presetBtnActive]}
                  onPress={() => handlePreset(i)}
                >
                  <Text style={[st.presetBtnText, preset === i && st.presetBtnTextActive]}>
                    {p.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Circular-style timer display */}
            <View style={st.timerDisplay}>
              {/* Progress ring via border trick */}
              <View style={[st.timerRing, running && st.timerRingActive]}>
                <Text style={[st.timerDigits, completed && st.timerDigitsComplete]}>
                  {String(timerMinutes).padStart(2, "0")}:{String(timerSeconds).padStart(2, "0")}
                </Text>
                <Text style={st.timerLabel}>
                  {completed ? t.time_session_done : running ? t.time_focusing : t.time_ready}
                </Text>
              </View>

              {/* Progress bar */}
              <View style={st.progressBar}>
                <View style={[st.progressFill, { width: `${(1 - progress) * 100}%` as `${number}%` }]} />
              </View>
            </View>

            {/* Controls */}
            <View style={st.timerControls}>
              <TouchableOpacity style={st.controlBtnSecondary} onPress={handleReset}>
                <Feather name="rotate-ccw" size={20} color={colors.mutedForeground} />
                <Text style={st.controlBtnSecondaryText}>{t.time_reset_btn}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[st.controlBtnPrimary, running && st.controlBtnPause]}
                onPress={handleStartPause}
              >
                <Feather name={running ? "pause" : "play"} size={22} color={colors.primaryForeground} />
                <Text style={st.controlBtnPrimaryText}>{running ? t.time_pause_btn : t.time_start_btn}</Text>
              </TouchableOpacity>
            </View>

            {/* Info box */}
            <View style={st.infoBox}>
              <Feather name="info" size={14} color={colors.mutedForeground} />
              <Text style={st.infoText}>{t.timer_ai_checker}</Text>
            </View>
          </View>
        )}

        {/* ── Alarm ── */}
        {section === "alarm" && (
          <View style={st.section}>
            <Text style={st.sectionTitle}>{t.time_alarm}</Text>
            <Text style={st.sectionSub}>Asia/Nicosia</Text>

            {/* Time picker */}
            <View style={st.alarmTimeRow}>
              {/* Hour */}
              <View style={st.alarmSpinner}>
                <TouchableOpacity onPress={() => setAlarmHour((h) => (h + 1) % 24)} hitSlop={8}>
                  <Feather name="chevron-up" size={22} color={colors.primary} />
                </TouchableOpacity>
                <Text style={st.alarmTimeDigit}>{String(alarmHour).padStart(2, "0")}</Text>
                <TouchableOpacity onPress={() => setAlarmHour((h) => (h + 23) % 24)} hitSlop={8}>
                  <Feather name="chevron-down" size={22} color={colors.primary} />
                </TouchableOpacity>
              </View>
              <Text style={st.alarmSep}>:</Text>
              {/* Minute */}
              <View style={st.alarmSpinner}>
                <TouchableOpacity onPress={() => setAlarmMinute((m) => (m + 1) % 60)} hitSlop={8}>
                  <Feather name="chevron-up" size={22} color={colors.primary} />
                </TouchableOpacity>
                <Text style={st.alarmTimeDigit}>{String(alarmMinute).padStart(2, "0")}</Text>
                <TouchableOpacity onPress={() => setAlarmMinute((m) => (m + 59) % 60)} hitSlop={8}>
                  <Feather name="chevron-down" size={22} color={colors.primary} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Day toggles */}
            <Text style={[st.fieldLabel, { color: colors.mutedForeground, marginBottom: 8 }]}>
              {t.time_alarm_tab}
            </Text>
            <View style={st.daysRow}>
              {DAYS.map((d, i) => (
                <TouchableOpacity
                  key={i}
                  style={[st.dayBtn, alarmDays.has(i) && st.dayBtnActive]}
                  onPress={() => { Haptics.selectionAsync(); toggleDay(i); }}
                >
                  <Text style={[st.dayBtnText, alarmDays.has(i) && st.dayBtnTextActive]}>{d}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Firing banner */}
            {alarmFiring && (
              <View style={[st.firingBanner, { backgroundColor: colors.primary + "22", borderColor: colors.primary }]}>
                <Text style={st.firingEmoji}>⏰</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[st.firingTitle, { color: colors.primary }]}>{t.time_alarm}!</Text>
                  <Text style={[st.firingSub, { color: colors.primary + "bb" }]}>
                    {String(alarmHour).padStart(2,"0")}:{String(alarmMinute).padStart(2,"0")} · Famagusta
                  </Text>
                </View>
                <TouchableOpacity
                  style={[st.firingDismiss, { backgroundColor: colors.primary }]}
                  onPress={dismissAlarm}
                >
                  <Text style={[st.firingDismissText, { color: colors.primaryForeground }]}>{t.time_stop_alarm}</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Enable / disable */}
            <TouchableOpacity
              style={[st.alarmToggleBtn, alarmActive ? st.alarmToggleBtnActive : { backgroundColor: colors.primary }]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                if (alarmActive) {
                  void stopAlarmSound();
                  setAlarmFiring(false);
                  setAlarmActive(false);
                } else {
                  setAlarmActive(true);
                }
              }}
            >
              <Feather name={alarmActive ? "bell-off" : "bell"} size={18} color={colors.primaryForeground} />
              <Text style={[st.alarmToggleBtnText, st.alarmToggleBtnTextActive]}>
                {alarmActive ? t.time_stop_alarm : t.time_alarm_tab}
              </Text>
            </TouchableOpacity>

            {/* Test sound */}
            {!alarmActive && (
              <TouchableOpacity
                style={[st.testSoundBtn, { borderColor: colors.border, backgroundColor: colors.card }]}
                onPress={async () => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  await playAlarmSound();
                  setTimeout(() => void stopAlarmSound(), 3000);
                }}
              >
                <Feather name="volume-2" size={16} color={colors.mutedForeground} />
                <Text style={[st.testSoundText, { color: colors.mutedForeground }]}>{t.time_start_btn} · 3s</Text>
              </TouchableOpacity>
            )}

            {alarmActive && !alarmFiring && (
              <View style={[st.alarmActiveCard, { backgroundColor: colors.primary + "18", borderColor: colors.primary + "44" }]}>
                <Feather name="bell" size={16} color={colors.primary} />
                <Text style={[st.alarmActiveText, { color: colors.primary }]}>
                  {String(alarmHour).padStart(2, "0")}:{String(alarmMinute).padStart(2, "0")} · Famagusta
                  {alarmDays.size === 7 ? "" : ` · ${[...alarmDays].sort((a,b)=>a-b).map((d) => DAYS[d]).join(", ")}`}
                </Text>
              </View>
            )}

            <View style={st.infoBox}>
              <Feather name="info" size={14} color={colors.mutedForeground} />
              <Text style={st.infoText}>{t.time_alarm} · Asia/Nicosia</Text>
            </View>
          </View>
        )}

        {/* ── Social Alarm ── */}
        {section === "social-alarm" && (
          <View style={st.section}>
            {/* Title */}
            <View style={saSt.headerRow}>
              <View style={{ flex: 1 }}>
                <Text style={st.sectionTitle}>{t.sa_title}</Text>
                <Text style={st.sectionSub}>{t.sa_subtitle}</Text>
              </View>
            </View>

            {!citizen ? (
              <View style={[saSt.infoCard, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                <Feather name="radio" size={16} color={colors.mutedForeground} />
                <Text style={[saSt.infoCardText, { color: colors.mutedForeground }]}>{t.sa_login_required}</Text>
              </View>
            ) : (
              <>
                {/* Consent toggle */}
                <View style={[saSt.consentCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[saSt.consentLabel, { color: colors.foreground }]}>{t.sa_consent_label}</Text>
                    <Text style={[saSt.consentHint, { color: colors.mutedForeground }]}>{t.sa_consent_hint}</Text>
                  </View>
                  <TouchableOpacity
                    style={[saSt.toggle, { backgroundColor: saConsent ? colors.primary : colors.muted }]}
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); void toggleSaConsent(); }}
                    disabled={saConsentSaving}
                  >
                    <View style={[saSt.toggleThumb, { left: saConsent ? 22 : 2 }]} />
                  </TouchableOpacity>
                </View>
                {saConsent && (
                  <Text style={[saSt.savedText, { color: colors.primary }]}>✓ {t.sa_consent_saved}</Text>
                )}

                {/* Sync parameters */}
                <View style={[saSt.syncCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={saSt.syncCardHeader}>
                    <Feather name="clock" size={14} color={colors.primary} />
                    <Text style={[saSt.syncCardTitle, { color: colors.foreground }]}>{t.sa_sync_params}</Text>
                  </View>
                  <View style={saSt.syncField}>
                    <Text style={[saSt.syncLabel, { color: colors.mutedForeground }]}>{t.sa_alarm_time}</Text>
                    <View style={[saSt.syncInputRow, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
                      <Feather name="clock" size={13} color={colors.mutedForeground} />
                      <TextInput
                        value={saAlarmTime}
                        onChangeText={setSaAlarmTime}
                        placeholder={t.sa_time_ph}
                        placeholderTextColor={colors.mutedForeground}
                        keyboardType="numbers-and-punctuation"
                        maxLength={5}
                        style={[saSt.syncInput, { color: colors.foreground }]}
                      />
                    </View>
                  </View>
                  <View style={saSt.syncField}>
                    <Text style={[saSt.syncLabel, { color: colors.mutedForeground }]}>{t.sa_purpose_label}</Text>
                    <TextInput
                      value={saPurpose}
                      onChangeText={setSaPurpose}
                      placeholder={t.sa_purpose_ph}
                      placeholderTextColor={colors.mutedForeground}
                      multiline
                      numberOfLines={2}
                      style={[saSt.syncTextarea, { color: colors.foreground, backgroundColor: colors.secondary, borderColor: colors.border }]}
                    />
                  </View>
                </View>

                {/* Subscriber search */}
                <Text style={[saSt.pickerLabel, { color: colors.foreground }]}>{t.sa_select_targets}</Text>
                <View style={[saSt.searchRow, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
                  <Feather name="search" size={14} color={colors.mutedForeground} />
                  <TextInput
                    value={saSearch}
                    onChangeText={setSaSearch}
                    placeholder={t.sa_search_ph}
                    placeholderTextColor={colors.mutedForeground}
                    style={[saSt.searchInput, { color: colors.foreground }]}
                  />
                </View>

                {saFiltered.length === 0 ? (
                  <View style={[saSt.infoCard, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                    <Feather name="users" size={14} color={colors.mutedForeground} />
                    <Text style={[saSt.infoCardText, { color: colors.mutedForeground }]}>{t.sa_no_subscribers}</Text>
                  </View>
                ) : (
                  <FlatList
                    data={saFiltered}
                    keyExtractor={(item) => String(item.id)}
                    scrollEnabled={false}
                    renderItem={({ item }) => (
                      <TouchableOpacity
                        style={[
                          saSt.subscriberRow,
                          { borderColor: saSelectedTargets.has(item.id) ? colors.primary : colors.border,
                            backgroundColor: saSelectedTargets.has(item.id) ? colors.primary + "18" : colors.card }
                        ]}
                        onPress={() => { Haptics.selectionAsync(); toggleSaTarget(item.id); }}
                      >
                        <Text style={[saSt.subscriberName, { color: colors.foreground }]}>{item.pseudonym}</Text>
                        <Text style={[saSt.subscriberRank, { color: colors.mutedForeground }]}>{item.rank}</Text>
                      </TouchableOpacity>
                    )}
                  />
                )}

                {saSelectedTargets.size > 0 && (
                  <Text style={[saSt.selectedCount, { color: colors.primary }]}>
                    {saSelectedTargets.size} {t.sa_selected}
                  </Text>
                )}

                {/* Send signal */}
                {saSentMsg ? (
                  <View style={[saSt.sentBanner, { backgroundColor: "#22c55e18", borderColor: "#22c55e44" }]}>
                    <Feather name="volume-2" size={16} color="#22c55e" />
                    <Text style={{ color: "#22c55e", fontWeight: "700", fontSize: 14 }}>{saSentMsg}</Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={[saSt.sendBtn, { backgroundColor: saSelectedTargets.size === 0 ? colors.muted : colors.primary }, saSending && { opacity: 0.6 }]}
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); void sendSaSignal(false); }}
                    disabled={saSending || saSelectedTargets.size === 0}
                  >
                    <Feather name="radio" size={18} color={colors.primaryForeground} />
                    <Text style={[saSt.sendBtnText, { color: colors.primaryForeground }]}>
                      {saSending ? "…" : `${t.sa_send_signal}${saSelectedTargets.size > 0 ? ` (${saSelectedTargets.size})` : ""}`}
                    </Text>
                  </TouchableOpacity>
                )}

                <View style={st.infoBox}>
                  <Feather name="info" size={14} color={colors.mutedForeground} />
                  <Text style={st.infoText}>{t.sa_consent_hint}</Text>
                </View>
              </>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ── Social Alarm styles (static, doesn't depend on colors) ────────────────────
const saSt = StyleSheet.create({
  headerRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  consentCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
  },
  consentLabel: { fontSize: 14, fontWeight: "600" },
  consentHint: { fontSize: 12, marginTop: 2 },
  toggle: {
    width: 44,
    height: 24,
    borderRadius: 12,
    justifyContent: "center",
  },
  toggleThumb: {
    position: "absolute",
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#fff",
    top: 2,
  },
  savedText: { fontSize: 12, fontWeight: "600", fontFamily: "monospace" },
  pickerLabel: { fontSize: 14, fontWeight: "600", marginTop: 4 },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchInput: { flex: 1, fontSize: 14 },
  infoCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
  },
  infoCardText: { fontSize: 13, fontFamily: "monospace", flex: 1 },
  subscriberRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 6,
  },
  subscriberName: { fontSize: 14, fontFamily: "monospace" },
  subscriberRank: { fontSize: 12, fontFamily: "monospace" },
  selectedCount: { fontSize: 12, fontWeight: "700", fontFamily: "monospace", textAlign: "right" },
  sentBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    padding: 14,
  },
  sendBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 12,
    paddingVertical: 14,
  },
  sendBtnText: { fontSize: 15, fontWeight: "700" },
  // Sync parameters form
  syncCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 12,
  },
  syncCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  syncCardTitle: { fontSize: 13, fontWeight: "700" },
  syncField: { gap: 6 },
  syncLabel: { fontSize: 12, fontFamily: "monospace" },
  syncInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  syncInput: { flex: 1, fontSize: 14, fontFamily: "monospace" },
  syncTextarea: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 9,
    fontSize: 13,
    fontFamily: "monospace",
    minHeight: 60,
    textAlignVertical: "top",
  },
  // Anthem modal
  anthemOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
    alignItems: "center",
    justifyContent: "center",
  },
  anthemContent: {
    alignItems: "center",
    gap: 24,
    paddingHorizontal: 32,
    maxWidth: 360,
  },
  anthemCircle: {
    width: 112,
    height: 112,
    borderRadius: 56,
    borderWidth: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  anthemTitle: {
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
    lineHeight: 26,
  },
  anthemSub: {
    fontSize: 15,
    fontWeight: "600",
    textAlign: "center",
    fontFamily: "monospace",
  },
  anthemDismiss: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 24,
    marginTop: 8,
  },
  anthemDismissText: { fontSize: 15, fontWeight: "600" },
});

// ── Styles ────────────────────────────────────────────────────────────────────

function styles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingBottom: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    headerTitle: { fontSize: 17, fontWeight: "700", color: colors.foreground },

    sectionRow: {
      flexDirection: "row",
      paddingHorizontal: 12,
      paddingVertical: 10,
      gap: 8,
    },
    sectionBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 5,
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: 10,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
    },
    sectionBtnActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    sectionBtnText: { fontSize: 11, fontWeight: "600", color: colors.mutedForeground },
    sectionBtnTextActive: { color: colors.primaryForeground },

    scroll: { padding: 16, paddingBottom: 120 },
    section: { gap: 12 },
    sectionTitle: { fontSize: 18, fontWeight: "700", color: colors.foreground },
    sectionSub: { fontSize: 13, color: colors.mutedForeground, marginTop: -6 },

    // Clock
    clockCard: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      backgroundColor: colors.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    clockCardMain: {
      backgroundColor: colors.primary + "18",
      borderColor: colors.primary + "66",
    },
    clockLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
    clockFlag: { fontSize: 26 },
    clockCity: { fontSize: 15, fontWeight: "600", color: colors.foreground },
    clockCityMain: { color: colors.primary },
    clockOffset: { fontSize: 12, color: colors.mutedForeground, marginTop: 2 },
    clockRight: { alignItems: "flex-end" },
    clockTime: { fontSize: 22, fontWeight: "700", color: colors.foreground, fontVariant: ["tabular-nums"] },
    clockTimeMain: { color: colors.primary },
    clockDate: { fontSize: 12, color: colors.mutedForeground, marginTop: 2 },

    // Timer
    presetRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center" },
    presetBtn: {
      minWidth: 68,
      paddingHorizontal: 10,
      paddingVertical: 10,
      borderRadius: 10,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
    },
    presetBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    presetBtnText: { fontSize: 13, fontWeight: "600", color: colors.mutedForeground },
    presetBtnTextActive: { color: colors.primaryForeground },

    timerDisplay: { alignItems: "center", gap: 20, marginVertical: 8 },
    timerRing: {
      width: 200,
      height: 200,
      borderRadius: 100,
      backgroundColor: colors.card,
      borderWidth: 6,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
    },
    timerRingActive: { borderColor: colors.primary, shadowColor: colors.primary, shadowOpacity: 0.4, shadowRadius: 16, shadowOffset: { width: 0, height: 0 } },
    timerDigits: { fontSize: 44, fontWeight: "800", color: colors.foreground, fontVariant: ["tabular-nums"] },
    timerDigitsComplete: { color: colors.primary },
    timerLabel: { fontSize: 12, color: colors.mutedForeground, fontWeight: "500" },

    progressBar: {
      width: "100%",
      height: 4,
      backgroundColor: colors.border,
      borderRadius: 4,
      overflow: "hidden",
    },
    progressFill: {
      height: "100%",
      backgroundColor: colors.primary,
      borderRadius: 4,
    },

    timerControls: { flexDirection: "row", gap: 12, justifyContent: "center" },
    controlBtnSecondary: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 20,
      paddingVertical: 14,
      borderRadius: 14,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
    },
    controlBtnSecondaryText: { fontSize: 15, fontWeight: "600", color: colors.mutedForeground },
    controlBtnPrimary: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingVertical: 16,
      borderRadius: 14,
      backgroundColor: colors.primary,
    },
    controlBtnPause: { backgroundColor: colors.surface },
    controlBtnPrimaryText: { fontSize: 16, fontWeight: "700", color: colors.primaryForeground },

    infoBox: {
      flexDirection: "row",
      gap: 8,
      padding: 12,
      backgroundColor: colors.muted,
      borderRadius: 10,
      alignItems: "flex-start",
    },
    infoText: { flex: 1, fontSize: 12, color: colors.mutedForeground, lineHeight: 18 },

    // Alarm
    alarmTimeRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      marginVertical: 8,
    },
    alarmSpinner: {
      alignItems: "center",
      backgroundColor: colors.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: 12,
      paddingHorizontal: 24,
      gap: 8,
    },
    alarmTimeDigit: {
      fontSize: 48,
      fontWeight: "800",
      color: colors.primary,
      fontVariant: ["tabular-nums"],
    },
    alarmSep: { fontSize: 48, fontWeight: "800", color: colors.primary, marginBottom: 8 },
    fieldLabel: { fontSize: 13, fontWeight: "600" },

    daysRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
    dayBtn: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
    },
    dayBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    dayBtnText: { fontSize: 12, fontWeight: "600", color: colors.mutedForeground },
    dayBtnTextActive: { color: colors.primaryForeground },

    alarmToggleBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      paddingVertical: 16,
      borderRadius: 14,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
    },
    alarmToggleBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    alarmToggleBtnText: { fontSize: 15, fontWeight: "600", color: colors.mutedForeground },
    alarmToggleBtnTextActive: { color: colors.primaryForeground },

    alarmActiveCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      padding: 12,
      borderRadius: 10,
      borderWidth: 1,
    },
    alarmActiveText: { flex: 1, fontSize: 13, fontWeight: "600" },

    // Firing banner
    firingBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      padding: 14,
      borderRadius: 14,
      borderWidth: 2,
    },
    firingEmoji: { fontSize: 28 },
    firingTitle: { fontSize: 15, fontWeight: "700" },
    firingSub: { fontSize: 12, marginTop: 2 },
    firingDismiss: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 10,
    },
    firingDismissText: { fontSize: 13, fontWeight: "700" },

    // Test sound
    testSoundBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingVertical: 12,
      borderRadius: 12,
      borderWidth: 1,
    },
    testSoundText: { fontSize: 13, fontWeight: "600" },
  });
}
