import { useState, useEffect, useRef, useCallback } from "react";
import { Layout } from "@/components/Layout";
import { Globe, Clock, Bell, Play, Pause, RotateCcw, ChevronUp, ChevronDown, Info } from "lucide-react";
import { useCitizen } from "@/context/CitizenContext";
import { useLanguage } from "@/context/LanguageContext";

// ── World clock zones — 24 UTC offsets ────────────────────────────────────────

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
    ru: "Прая",          en: "Praia",                zh: "普拉亚",        hi: "प्राया",
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

function getTimeInZone(tz: string, lang = "ru"): { time: string; date: string; offset: string } {
  const now = new Date();
  const locale = lang === "zh" ? "zh-CN" : lang === "ar" ? "ar-SA" : lang === "he" ? "he-IL"
    : lang === "fa" ? "fa-IR" : lang === "ko" ? "ko-KR" : lang === "ja" ? "ja-JP"
    : lang === "hi" ? "hi-IN" : lang === "bn" ? "bn-BD" : lang === "ur" ? "ur-PK"
    : lang === "uk" ? "uk-UA" : lang === "kk" ? "kk-KZ" : lang === "uz" ? "uz-UZ"
    : `${lang}-${lang.toUpperCase()}`;
  const time = new Intl.DateTimeFormat(locale, {
    timeZone: tz, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).format(now);
  const date = new Intl.DateTimeFormat(locale, {
    timeZone: tz, weekday: "short", day: "numeric", month: "short",
  }).format(now);
  const offsetMs =
    new Date(now.toLocaleString("en-US", { timeZone: tz })).getTime() -
    new Date(now.toLocaleString("en-US", { timeZone: "UTC" })).getTime();
  const offsetH = offsetMs / 3600000;
  const sign = offsetH >= 0 ? "+" : "";
  const offset = `UTC${sign}${offsetH % 1 === 0 ? offsetH : offsetH.toFixed(1)}`;
  return { time, date, offset };
}

// ── Pomodoro presets ──────────────────────────────────────────────────────────

const PRESETS = [
  { label: "12 мин", seconds: 12 * 60 },
  { label: "24 мин", seconds: 24 * 60 },
  { label: "25 мин", seconds: 25 * 60 },
  { label: "36 мин", seconds: 36 * 60 },
  { label: "48 мин", seconds: 48 * 60 },
  { label: "50 мин", seconds: 50 * 60 },
  { label: "60 мин", seconds: 60 * 60 },
  { label: "90 мин", seconds: 90 * 60 },
];

// ── Alarm days ────────────────────────────────────────────────────────────────

const DAYS = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

// ── Main page ────────────────────────────────────────────────────────────────

export function Time() {
  const { citizen } = useCitizen();
  const { lang } = useLanguage();
  const [section, setSection] = useState<"clock" | "timer" | "alarm">("clock");

  // ── World clock tick ───────────────────────────────────────────────────────
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
  void tick;

  // ── Pomodoro timer ─────────────────────────────────────────────────────────
  const [preset, setPreset] = useState(0);
  const [remaining, setRemaining] = useState(PRESETS[0]!.seconds);
  const [running, setRunning] = useState(false);
  const [completed, setCompleted] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionDurationRef = useRef(PRESETS[0]!.seconds);

  const stopInterval = useCallback(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
  }, []);

  const handleTimerComplete = useCallback(async () => {
    stopInterval();
    setRunning(false);
    setCompleted(true);
    if (citizen?.id) {
      try {
        await fetch(`/api/citizens/log-focus`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ citizenId: citizen.id, durationMinutes: Math.round(sessionDurationRef.current / 60) }),
        });
      } catch { /* offline is fine */ }
    }
  }, [citizen?.id, stopInterval]);

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setRemaining(r => {
          if (r <= 1) { void handleTimerComplete(); return 0; }
          return r - 1;
        });
      }, 1000);
    } else {
      stopInterval();
    }
    return stopInterval;
  }, [running, handleTimerComplete, stopInterval]);

  const handlePreset = (i: number) => {
    stopInterval(); setRunning(false); setCompleted(false);
    setPreset(i); setRemaining(PRESETS[i]!.seconds);
    sessionDurationRef.current = PRESETS[i]!.seconds;
  };

  const timerMinutes = Math.floor(remaining / 60);
  const timerSeconds = remaining % 60;
  const progress = remaining / PRESETS[preset]!.seconds;

  // ── Alarm ──────────────────────────────────────────────────────────────────
  const [alarmHour, setAlarmHour] = useState(7);
  const [alarmMinute, setAlarmMinute] = useState(0);
  const [alarmDays, setAlarmDays] = useState<Set<number>>(new Set([0, 1, 2, 3, 4, 5, 6]));
  const [alarmActive, setAlarmActive] = useState(false);
  const [alarmFiring, setAlarmFiring] = useState(false);
  const [audioReady, setAudioReady] = useState(false);
  const [notifGranted, setNotifGranted] = useState(false);
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);
  const lastFiredKey = useRef("");
  // Refs that shadow state — avoids stale closures inside setInterval
  const alarmHourRef = useRef(alarmHour);
  const alarmMinuteRef = useRef(alarmMinute);
  const alarmDaysRef = useRef(alarmDays);
  const alarmActiveRef = useRef(false);
  alarmHourRef.current = alarmHour;
  alarmMinuteRef.current = alarmMinute;
  alarmDaysRef.current = alarmDays;

  useEffect(() => {
    if ("Notification" in window && Notification.permission === "granted") setNotifGranted(true);
  }, []);

  const requestNotifPermission = async () => {
    if (!("Notification" in window)) return;
    const perm = await Notification.requestPermission();
    setNotifGranted(perm === "granted");
  };

  // ── Get Nicosia time — BUG FIX: weekday via Intl, not local Date ──────────
  const getNicosiaHMS = (): { h: number; m: number; weekday: number } => {
    const now = new Date();
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Nicosia",
      hour: "2-digit", minute: "2-digit", weekday: "short", hour12: false,
    }).formatToParts(now);
    const get = (t: string) => parts.find(p => p.type === t)?.value ?? "";
    let h = parseInt(get("hour"), 10); if (h === 24) h = 0;
    const m = parseInt(get("minute"), 10);
    // weekday from Intl — always in Nicosia timezone
    const weekdayStr = get("weekday"); // "Sun","Mon","Tue",...
    const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const weekday = weekdayMap[weekdayStr] ?? 0;
    return { h, m, weekday };
  };

  // ── HTML Audio element (MP3) — created once, reused ──────────────────────
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const getAudioEl = useCallback((): HTMLAudioElement => {
    if (!audioElRef.current) {
      const a = new window.Audio(`${import.meta.env.BASE_URL}alarm.mp3`);
      a.loop = true;
      a.preload = "auto";
      audioElRef.current = a;
    }
    return audioElRef.current;
  }, []);

  // ── Unlock audio on user gesture (mobile browsers require this) ───────────
  const unlockAndPrepareAudio = useCallback(async () => {
    const a = getAudioEl();
    // Play then immediately pause — this "unlocks" the audio element on mobile
    try {
      await a.play();
      a.pause();
      a.currentTime = 0;
    } catch { /* already unlocked or not needed */ }
    setAudioReady(true);
  }, [getAudioEl]);

  // ── Wake Lock ─────────────────────────────────────────────────────────────
  const acquireWakeLock = useCallback(async () => {
    if (!("wakeLock" in navigator)) return;
    try {
      wakeLockRef.current = await (navigator as unknown as {
        wakeLock: { request: (t: string) => Promise<{ release: () => Promise<void> }> }
      }).wakeLock.request("screen");
    } catch { /* unavailable */ }
  }, []);

  const releaseWakeLock = useCallback(() => {
    void wakeLockRef.current?.release().catch(() => {});
    wakeLockRef.current = null;
  }, []);

  // ── Play / stop alarm sound via HTML Audio ────────────────────────────────
  const playAlarmSound = useCallback(() => {
    if ("vibrate" in navigator) navigator.vibrate([500, 200, 500, 200, 500, 200, 500]);
    const a = getAudioEl();
    a.loop = true;
    a.currentTime = 0;
    void a.play().catch(() => { /* blocked if user hasn't interacted — handled by unlockAndPrepareAudio */ });
  }, [getAudioEl]);

  const stopAlarmSound = useCallback(() => {
    const a = audioElRef.current;
    if (a) { a.pause(); a.currentTime = 0; }
    if ("vibrate" in navigator) navigator.vibrate(0);
  }, []);

  const dismissAlarm = useCallback(() => {
    setAlarmFiring(false);
    stopAlarmSound();
  }, [stopAlarmSound]);

  // ── Fire alarm ────────────────────────────────────────────────────────────
  const fireAlarm = useCallback(() => {
    setAlarmFiring(true);
    playAlarmSound();
    const h = alarmHourRef.current;
    const m = alarmMinuteRef.current;
    if (notifGranted && "Notification" in window && Notification.permission === "granted") {
      const opts: NotificationOptions = {
        body: `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")} по Фамагусте`,
        icon: "/favicon.ico",
        requireInteraction: true,
      };
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.ready
          .then((reg) => reg.showNotification("⏰ Суверенный Будильник — TimeNation", opts))
          .catch(() => { /* sw not available */ });
      }
    }
  }, [playAlarmSound, notifGranted]);

  // ── Single persistent interval — reads from refs, no stale closure ────────
  useEffect(() => {
    const tick = setInterval(() => {
      if (!alarmActiveRef.current) return;
      const { h, m, weekday } = getNicosiaHMS();
      const fireKey = `${h}:${m}:${weekday}`;
      if (
        h === alarmHourRef.current &&
        m === alarmMinuteRef.current &&
        alarmDaysRef.current.has(weekday) &&
        lastFiredKey.current !== fireKey
      ) {
        lastFiredKey.current = fireKey;
        fireAlarm();
      }
    }, 5_000);
    return () => clearInterval(tick);
  }, [fireAlarm]); // stable — fireAlarm only changes when notifGranted changes

  // ── Visibility change — re-check on tab focus (catches throttled interval) ─
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible" || !alarmActiveRef.current) return;
      const { h, m, weekday } = getNicosiaHMS();
      const fireKey = `${h}:${m}:${weekday}`;
      if (
        h === alarmHourRef.current &&
        m === alarmMinuteRef.current &&
        alarmDaysRef.current.has(weekday) &&
        lastFiredKey.current !== fireKey
      ) {
        lastFiredKey.current = fireKey;
        fireAlarm();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [fireAlarm]);

  const toggleDay = (d: number) => {
    setAlarmDays(prev => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d); else next.add(d);
      return next;
    });
  };

  return (
    <Layout>
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Время</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Мировые часы · Таймер фокусировки · Суверенный будильник
          </p>
        </div>

        {/* Section tabs */}
        <div className="flex gap-2">
          {(["clock", "timer", "alarm"] as const).map(s => (
            <button
              key={s}
              onClick={() => setSection(s)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium border transition-colors ${
                section === s
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-muted-foreground border-border hover:text-foreground hover:bg-secondary"
              }`}
            >
              {s === "clock" ? <Globe className="w-4 h-4" /> : s === "timer" ? <Clock className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
              {s === "clock" ? "Часовые пояса" : s === "timer" ? "Таймер" : "Будильник"}
            </button>
          ))}
        </div>

        {/* ── World Clock ── */}
        {section === "clock" && (
          <div className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold">🌍 Мировые часы</h2>
              <p className="text-xs text-muted-foreground">Суверенное время TimeNation — Фамагуста, Кипр · 24 часовых пояса</p>
            </div>

            {/* TimeNation sovereign time — always first */}
            {(() => {
              const { time, date, offset } = getTimeInZone("Asia/Nicosia", lang);
              return (
                <div className="flex items-center justify-between rounded-lg border px-5 py-4 bg-primary/10 border-primary/40">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">🇨🇾</span>
                    <div>
                      <div className="text-sm font-semibold text-primary">Фамагуста</div>
                      <div className="text-xs text-muted-foreground">{offset} · TimeNation</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold tabular-nums text-primary">{time}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{date}</div>
                  </div>
                </div>
              );
            })()}

            {/* 24 world zones */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {ZONES.map(z => {
                const { time, date, offset } = getTimeInZone(z.tz, lang);
                const cityName = CITY_NAMES[z.key]?.[lang] ?? CITY_NAMES[z.key]?.["en"] ?? z.key;
                return (
                  <div
                    key={z.key}
                    className="flex items-center justify-between rounded-lg border px-4 py-3 bg-card border-border"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{z.flag}</span>
                      <div>
                        <div className="text-sm font-semibold text-foreground leading-tight">{cityName}</div>
                        <div className="text-xs text-muted-foreground">{offset}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold tabular-nums text-foreground">{time}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{date}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Focus Timer ── */}
        {section === "timer" && (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold">⏱ Таймер фокусировки</h2>
              <p className="text-xs text-muted-foreground">Завершённая сессия засчитывается ИИ-Аудитором</p>
            </div>

            {/* Presets */}
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p, i) => (
                <button
                  key={i}
                  onClick={() => handlePreset(i)}
                  className={`px-3 py-2 rounded-md text-sm font-semibold border transition-colors ${
                    preset === i
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card text-muted-foreground border-border hover:text-foreground"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Timer display */}
            <div className="flex flex-col items-center gap-5 py-4">
              <div
                className={`w-48 h-48 rounded-full border-8 flex flex-col items-center justify-center gap-1 transition-all ${
                  running
                    ? "border-primary shadow-[0_0_32px_rgba(0,0,0,0.3)]"
                    : "border-border"
                } bg-card`}
                style={running ? { boxShadow: "0 0 32px var(--primary, #C9A84C)44" } : {}}
              >
                <span className={`text-5xl font-extrabold tabular-nums ${completed ? "text-primary" : "text-foreground"}`}>
                  {String(timerMinutes).padStart(2, "0")}:{String(timerSeconds).padStart(2, "0")}
                </span>
                <span className="text-xs text-muted-foreground">
                  {completed ? "Сессия завершена!" : running ? "Фокусируйся…" : "Готов к старту"}
                </span>
              </div>

              {/* Progress bar */}
              <div className="w-full h-1.5 bg-border rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all"
                  style={{ width: `${(1 - progress) * 100}%` }}
                />
              </div>
            </div>

            {/* Controls */}
            <div className="flex gap-3">
              <button
                onClick={() => { stopInterval(); setRunning(false); setCompleted(false); setRemaining(PRESETS[preset]!.seconds); }}
                className="flex items-center gap-2 px-5 py-3 rounded-lg bg-card border border-border text-muted-foreground hover:text-foreground font-semibold transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
                Сброс
              </button>
              <button
                onClick={() => setRunning(r => !r)}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg font-bold text-base transition-colors ${
                  running
                    ? "bg-secondary text-foreground border border-border"
                    : "bg-primary text-primary-foreground"
                }`}
              >
                {running ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                {running ? "Пауза" : "Старт"}
              </button>
            </div>

            {completed && (
              <div className="flex items-center gap-3 p-4 rounded-lg bg-primary/10 border border-primary/40">
                <span className="text-xl">🎉</span>
                <p className="text-sm text-foreground">
                  Ты инвестировал <strong>{Math.round(sessionDurationRef.current / 60)} минут</strong> концентрации. ИИ-Аудитор зачислит их в профиль активности.
                </p>
                <button onClick={() => setCompleted(false)} className="text-xs text-muted-foreground hover:text-foreground shrink-0">✕</button>
              </div>
            )}

            <div className="flex items-start gap-2 p-3 rounded-lg bg-muted text-xs text-muted-foreground">
              <Info className="w-4 h-4 shrink-0 mt-0.5" />
              При завершении таймер отправит отчёт в профиль — ИИ-Аудитор учтёт минуты концентрации при оценке производительности.
            </div>
          </div>
        )}

        {/* ── Alarm ── */}
        {section === "alarm" && (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold">⏰ Суверенный будильник</h2>
              <p className="text-xs text-muted-foreground">Работает по времени Фамагусты (Asia/Nicosia)</p>
            </div>

            {/* Time picker */}
            <div className="flex items-center justify-center gap-4">
              {/* Hour */}
              <div className="flex flex-col items-center bg-card border border-border rounded-xl px-8 py-4 gap-3">
                <button onClick={() => setAlarmHour(h => (h + 1) % 24)} className="text-primary hover:opacity-70 transition-opacity">
                  <ChevronUp className="w-6 h-6" />
                </button>
                <span className="text-5xl font-extrabold text-primary tabular-nums">{String(alarmHour).padStart(2, "0")}</span>
                <button onClick={() => setAlarmHour(h => (h + 23) % 24)} className="text-primary hover:opacity-70 transition-opacity">
                  <ChevronDown className="w-6 h-6" />
                </button>
              </div>
              <span className="text-5xl font-extrabold text-primary mb-2">:</span>
              {/* Minute */}
              <div className="flex flex-col items-center bg-card border border-border rounded-xl px-8 py-4 gap-3">
                <button onClick={() => setAlarmMinute(m => (m + 1) % 60)} className="text-primary hover:opacity-70 transition-opacity">
                  <ChevronUp className="w-6 h-6" />
                </button>
                <span className="text-5xl font-extrabold text-primary tabular-nums">{String(alarmMinute).padStart(2, "0")}</span>
                <button onClick={() => setAlarmMinute(m => (m + 59) % 60)} className="text-primary hover:opacity-70 transition-opacity">
                  <ChevronDown className="w-6 h-6" />
                </button>
              </div>
            </div>

            {/* Day toggles */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Дни недели</p>
              <div className="flex gap-2 flex-wrap">
                {DAYS.map((d, i) => (
                  <button
                    key={i}
                    onClick={() => toggleDay(i)}
                    className={`w-10 h-10 rounded-full text-xs font-semibold border transition-colors ${
                      alarmDays.has(i)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-card text-muted-foreground border-border hover:text-foreground"
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>

            {/* Notification permission */}
            {"Notification" in window && Notification.permission === "default" && (
              <button
                onClick={() => void requestNotifPermission()}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm border border-dashed border-border text-muted-foreground hover:text-foreground transition-colors"
              >
                <Bell className="w-4 h-4" />
                Разрешить уведомления (для фоновой работы)
              </button>
            )}

            {/* Firing banner — shown ABOVE the button so it's always visible */}
            {alarmFiring && (
              <div className="flex items-center justify-between gap-3 p-4 rounded-xl border-2 border-primary bg-primary/10 animate-pulse">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">⏰</span>
                  <div>
                    <p className="font-bold text-primary text-base">Суверенный Будильник!</p>
                    <p className="text-sm text-primary/80">
                      {String(alarmHour).padStart(2,"0")}:{String(alarmMinute).padStart(2,"0")} · Фамагуста
                    </p>
                  </div>
                </div>
                <button
                  onClick={dismissAlarm}
                  className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:bg-primary/80 transition-colors"
                >
                  Выключить
                </button>
              </div>
            )}

            {/* Enable / disable — onClick is async: awaits audio unlock BEFORE setting state */}
            <button
              onClick={async () => {
                const next = !alarmActive;
                if (next) {
                  await unlockAndPrepareAudio(); // ← fix: await, not void
                  await acquireWakeLock();
                  alarmActiveRef.current = true;
                } else {
                  alarmActiveRef.current = false;
                  stopAlarmSound();
                  setAlarmFiring(false);
                  releaseWakeLock();
                }
                setAlarmActive(next);
              }}
              className={`w-full flex items-center justify-center gap-2 py-3 rounded-lg font-semibold border transition-colors ${
                alarmActive
                  ? "bg-primary/10 border-primary/40 text-primary hover:bg-primary/20"
                  : "bg-primary text-primary-foreground hover:bg-primary/90"
              }`}
            >
              <Bell className="w-4 h-4" />
              {alarmActive ? "Будильник активен — выключить" : "Включить будильник"}
            </button>

            {/* Test sound button */}
            {!alarmActive && (
              <button
                onClick={async () => {
                  const a = getAudioEl();
                  a.loop = false;
                  a.currentTime = 0;
                  try { await a.play(); } catch { /* blocked */ }
                  // stop after 3 s using the same element reference
                  setTimeout(() => { a.pause(); a.currentTime = 0; a.loop = true; }, 3000);
                  setAudioReady(true);
                }}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm border border-border text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              >
                <Bell className="w-4 h-4" />
                Проверить звук (3 сек)
              </button>
            )}

            {/* Audio ready indicator */}
            {audioReady && !alarmActive && (
              <p className="text-center text-xs text-green-500">✓ Звук разблокирован</p>
            )}

            {alarmActive && !alarmFiring && (
              <div className="flex items-center gap-3 p-3 rounded-lg border bg-primary/10 border-primary/40">
                <Bell className="w-4 h-4 text-primary shrink-0 animate-pulse" />
                <div>
                  <p className="text-sm font-semibold text-primary">
                    Сработает в {String(alarmHour).padStart(2, "0")}:{String(alarmMinute).padStart(2, "0")} по Фамагусте
                  </p>
                  <p className="text-xs text-primary/70 mt-0.5">
                    {alarmDays.size === 7 ? "Каждый день" : [...alarmDays].sort((a,b)=>a-b).map(d => DAYS[d]).join(", ")}
                    {audioReady ? " · 🔊 звук готов" : " · ⚠️ нажми «Проверить звук»"}
                  </p>
                </div>
              </div>
            )}

            <div className="flex items-start gap-2 p-3 rounded-lg bg-muted text-xs text-muted-foreground">
              <Info className="w-4 h-4 shrink-0 mt-0.5" />
              Страница должна быть открыта. Звук работает только если ты нажал «Включить» или «Проверить звук» — браузеры требуют нажатия перед воспроизведением.
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
