import { useState, useEffect, useRef, useCallback } from "react";
import { Layout } from "@/components/Layout";
import { Globe, Clock, Bell, Play, Pause, RotateCcw, ChevronUp, ChevronDown, Info, Radio, X, Volume2, Search, Users, Zap } from "lucide-react";
import { useCitizen } from "@/context/CitizenContext";
import { useLanguage } from "@/context/LanguageContext";
import { useSocialAlarmWs } from "@/hooks/useSocialAlarmWs";

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
  { key: "pago_pago",   tz: "Pacific/Pago_Pago",    flag: "🇼🇸" },
  { key: "honolulu",    tz: "Pacific/Honolulu",      flag: "🇺🇸" },
  { key: "anchorage",   tz: "America/Anchorage",     flag: "🇺🇸" },
  { key: "los_angeles", tz: "America/Los_Angeles",   flag: "🇺🇸" },
  { key: "denver",      tz: "America/Denver",        flag: "🇺🇸" },
  { key: "mexico_city", tz: "America/Mexico_City",   flag: "🇲🇽" },
  { key: "new_york",    tz: "America/New_York",      flag: "🇺🇸" },
  { key: "santiago",    tz: "America/Santiago",      flag: "🇨🇱" },
  { key: "sao_paulo",   tz: "America/Sao_Paulo",     flag: "🇧🇷" },
  { key: "noronha",     tz: "America/Noronha",       flag: "🇧🇷" },
  { key: "praia",       tz: "Atlantic/Cape_Verde",   flag: "🇨🇻" },
  { key: "london",      tz: "Europe/London",         flag: "🇬🇧" },
  { key: "paris",       tz: "Europe/Paris",          flag: "🇫🇷" },
  { key: "cairo",       tz: "Africa/Cairo",          flag: "🇪🇬" },
  { key: "moscow",      tz: "Europe/Moscow",         flag: "🇷🇺" },
  { key: "dubai",       tz: "Asia/Dubai",            flag: "🇦🇪" },
  { key: "karachi",     tz: "Asia/Karachi",          flag: "🇵🇰" },
  { key: "dhaka",       tz: "Asia/Dhaka",            flag: "🇧🇩" },
  { key: "bangkok",     tz: "Asia/Bangkok",          flag: "🇹🇭" },
  { key: "beijing",     tz: "Asia/Shanghai",         flag: "🇨🇳" },
  { key: "tokyo",       tz: "Asia/Tokyo",            flag: "🇯🇵" },
  { key: "sydney",      tz: "Australia/Sydney",      flag: "🇦🇺" },
  { key: "noumea",      tz: "Pacific/Noumea",        flag: "🇳🇨" },
  { key: "auckland",    tz: "Pacific/Auckland",      flag: "🇳🇿" },
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

const PRESETS = [
  { label: "1 мин", seconds: 60 },
  { label: "12 мин", seconds: 12 * 60 },
  { label: "24 мин", seconds: 24 * 60 },
  { label: "25 мин", seconds: 25 * 60 },
  { label: "36 мин", seconds: 36 * 60 },
  { label: "48 мин", seconds: 48 * 60 },
  { label: "50 мин", seconds: 50 * 60 },
  { label: "60 мин", seconds: 60 * 60 },
  { label: "90 мин", seconds: 90 * 60 },
];

const DAYS = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

interface Subscriber { id: number; pseudonym: string; rank: string; }

function MinuteHourglass({ elapsedSeconds, running }: { elapsedSeconds: number; running: boolean }) {
  const minuteIndex = Math.floor(elapsedSeconds / 60);
  const minuteProgress = (elapsedSeconds % 60) / 60;
  const flipped = minuteIndex % 2 === 1;
  const topSand = flipped ? minuteProgress : 1 - minuteProgress;
  const bottomSand = flipped ? 1 - minuteProgress : minuteProgress;
  const clipId = `minute-hourglass-${flipped ? "flipped" : "upright"}`;

  return (
    <div
      className="h-[6.9rem] w-[4.6rem] shrink-0"
      style={{
        transform: flipped ? "rotate(180deg)" : "rotate(0deg)",
        transition: "transform 700ms ease-in-out",
      }}
    >
      <svg
        viewBox="0 0 48 64"
        className={`h-full w-full ${running ? "text-primary" : "text-muted-foreground"}`}
        role="img"
        aria-label="Песочные часы переворачиваются каждую минуту"
      >
        <defs>
          <clipPath id={`${clipId}-top`}><path d="M14 9H34L25 31H23Z" /></clipPath>
          <clipPath id={`${clipId}-bottom`}><path d="M23 33H25L34 55H14Z" /></clipPath>
        </defs>
        <rect x="10" y={31 - 22 * topSand} width="28" height={22 * topSand} fill="hsl(var(--primary))" clipPath={`url(#${clipId}-top)`} />
        <rect
          x="10"
          y={flipped ? 33 : 55 - 22 * bottomSand}
          width="28"
          height={22 * bottomSand}
          fill="hsl(var(--primary))"
          clipPath={`url(#${clipId}-bottom)`}
        />
        {running && (
          <path d={flipped ? "M24 35v-6" : "M24 29v6"} stroke="hsl(var(--primary))" strokeWidth="1.5" strokeDasharray="1 1">
            <animate attributeName="stroke-dashoffset" from="0" to="2" dur=".25s" repeatCount="indefinite" />
          </path>
        )}
        <path d="M12 7h24M12 57h24M14 9c0 9 8 14 10 22-2 8-10 15-10 24M34 9c0 9-8 14-10 22 2 8 10 15 10 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" opacity=".8" />
      </svg>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export function Time() {
  const { citizen, authToken, refreshCitizen } = useCitizen();
  const authHeaders: Record<string, string> = authToken ? { Authorization: `Bearer ${authToken}` } : {};
  const { lang, t } = useLanguage();
  const [section, setSection] = useState<"clock" | "timer" | "alarm" | "social-alarm">("clock");

  // ── World clock tick ───────────────────────────────────────────────────────
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(tick => tick + 1), 1000);
    return () => clearInterval(id);
  }, []);
  void tick;

  // ── Pomodoro timer ─────────────────────────────────────────────────────────
  const [preset, setPreset] = useState(1);
  const [remaining, setRemaining] = useState(PRESETS[1]!.seconds);
  const [running, setRunning] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [focusText, setFocusText] = useState("");
  const [focusResult, setFocusResult] = useState<{ rewardDarmins: number; textCharacters: number } | null>(null);
  const [focusError, setFocusError] = useState("");
  const focusSessionId = useRef<number | null>(null);
  const [quizAttempt, setQuizAttempt] = useState<{ id: string; question: string } | null>(null);
  const [quizAnswer, setQuizAnswer] = useState("");
  const [quizResult, setQuizResult] = useState<{ correct: boolean; totalCorrect: number; awardedDarmins: number } | null>(null);
  const [quizError, setQuizError] = useState("");
  const [quizBusy, setQuizBusy] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionDurationRef = useRef(PRESETS[1]!.seconds);

  const stopInterval = useCallback(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
  }, []);

  const handleTimerComplete = useCallback(async () => {
    stopInterval();
    setRunning(false);
    setCompleted(true);
    setFocusError("");
    if (citizen?.id && focusSessionId.current) {
      try {
        const response = await fetch(`/api/citizens/focus/${focusSessionId.current}/complete`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders },
          body: JSON.stringify({ text: focusText }),
        });
        const data = await response.json() as { rewardDarmins?: number; textCharacters?: number; error?: string };
        if (!response.ok) throw new Error(data.error || "Не удалось сохранить сеанс");
        setFocusResult({ rewardDarmins: data.rewardDarmins ?? 0, textCharacters: data.textCharacters ?? 0 });
        focusSessionId.current = null;
        setFocusText("");
        if ((data.rewardDarmins ?? 0) > 0) await refreshCitizen();
      } catch (error) {
        setFocusError(error instanceof Error ? error.message : "Не удалось сохранить сеанс");
      }
    }
  }, [authToken, citizen?.id, focusText, refreshCitizen, stopInterval]);

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
    focusSessionId.current = null;
    setFocusResult(null); setFocusError("");
    setPreset(i); setRemaining(PRESETS[i]!.seconds);
    sessionDurationRef.current = PRESETS[i]!.seconds;
  };

  const toggleFocusTimer = async () => {
    setFocusError("");
    if (running) {
      if (focusSessionId.current) {
        const response = await fetch(`/api/citizens/focus/${focusSessionId.current}/pause`, { method: "POST", headers: authHeaders });
        if (!response.ok) { setFocusError("Не удалось приостановить сеанс. Проверьте соединение."); return; }
      }
      setRunning(false);
      return;
    }
    if (completed || remaining === 0) {
      setRemaining(PRESETS[preset]!.seconds);
      setCompleted(false);
      setFocusResult(null);
      setFocusText("");
    }
    if (citizen?.id) {
      try {
        const url = focusSessionId.current
          ? `/api/citizens/focus/${focusSessionId.current}/resume`
          : "/api/citizens/focus/start";
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders },
          ...(focusSessionId.current ? {} : { body: JSON.stringify({ plannedSeconds: PRESETS[preset]!.seconds }) }),
        });
        const data = await response.json() as { sessionId?: number; error?: string };
        if (!response.ok) throw new Error(data.error || "Не удалось начать сеанс");
        if (data.sessionId) focusSessionId.current = data.sessionId;
      } catch (error) {
        setFocusError(error instanceof Error ? error.message : "Не удалось начать сеанс");
        return;
      }
    }
    setRunning(true);
  };

  const loadQuizQuestion = useCallback(async () => {
    if (!citizen?.id) return;
    setQuizError("");
    try {
      const response = await fetch("/api/citizens/focus/quiz/question", { headers: authHeaders });
      const data = await response.json() as { attemptId?: string; question?: string; error?: string };
      if (!response.ok || !data.attemptId || !data.question) throw new Error(data.error || "Не удалось загрузить вопрос");
      setQuizAttempt({ id: data.attemptId, question: data.question });
      setQuizAnswer("");
    } catch (error) {
      setQuizError(error instanceof Error ? error.message : "Не удалось загрузить вопрос");
    }
  }, [authToken, citizen?.id]);

  const submitQuizAnswer = async () => {
    if (!quizAttempt || !quizAnswer.trim() || quizBusy) return;
    setQuizBusy(true); setQuizError("");
    try {
      const response = await fetch("/api/citizens/focus/quiz/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ attemptId: quizAttempt.id, answer: quizAnswer }),
      });
      const data = await response.json() as { correct?: boolean; totalCorrect?: number; awardedDarmins?: number; error?: string };
      if (!response.ok) throw new Error(data.error || "Не удалось проверить ответ");
      setQuizResult({ correct: !!data.correct, totalCorrect: data.totalCorrect ?? 0, awardedDarmins: data.awardedDarmins ?? 0 });
      setQuizAttempt(null);
      setQuizAnswer("");
      if ((data.awardedDarmins ?? 0) > 0) await refreshCitizen();
    } catch (error) {
      setQuizError(error instanceof Error ? error.message : "Не удалось проверить ответ");
    } finally {
      setQuizBusy(false);
    }
  };

  useEffect(() => {
    if (section === "timer" && citizen?.id && !quizAttempt) void loadQuizQuestion();
  }, [citizen?.id, loadQuizQuestion, quizAttempt, section]);

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

  const getNicosiaHMS = (): { h: number; m: number; weekday: number } => {
    const now = new Date();
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Nicosia",
      hour: "2-digit", minute: "2-digit", weekday: "short", hour12: false,
    }).formatToParts(now);
    const get = (t: string) => parts.find(p => p.type === t)?.value ?? "";
    let h = parseInt(get("hour"), 10); if (h === 24) h = 0;
    const m = parseInt(get("minute"), 10);
    const weekdayStr = get("weekday");
    const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const weekday = weekdayMap[weekdayStr] ?? 0;
    return { h, m, weekday };
  };

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

  const unlockAndPrepareAudio = useCallback(async () => {
    const a = getAudioEl();
    try {
      await a.play();
      a.pause();
      a.currentTime = 0;
    } catch { /* already unlocked */ }
    setAudioReady(true);
  }, [getAudioEl]);

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

  const playAlarmSound = useCallback(() => {
    if ("vibrate" in navigator) navigator.vibrate([500, 200, 500, 200, 500, 200, 500]);
    const a = getAudioEl();
    a.loop = true;
    a.currentTime = 0;
    void a.play().catch(() => {});
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
          .catch(() => {});
      }
    }
  }, [playAlarmSound, notifGranted]);

  useEffect(() => {
    const tick = setInterval(() => {
      if (!alarmActiveRef.current) return;
      const { h, m, weekday } = getNicosiaHMS();
      const fireKey = `${h}:${m}:${weekday}`;
      if (h === alarmHourRef.current && m === alarmMinuteRef.current && alarmDaysRef.current.has(weekday) && lastFiredKey.current !== fireKey) {
        lastFiredKey.current = fireKey;
        fireAlarm();
      }
    }, 5_000);
    return () => clearInterval(tick);
  }, [fireAlarm]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible" || !alarmActiveRef.current) return;
      const { h, m, weekday } = getNicosiaHMS();
      const fireKey = `${h}:${m}:${weekday}`;
      if (h === alarmHourRef.current && m === alarmMinuteRef.current && alarmDaysRef.current.has(weekday) && lastFiredKey.current !== fireKey) {
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

  // ── Social Alarm ───────────────────────────────────────────────────────────
  const { connected: wsConnected, subscribed: wsSubscribed, playAnthemEvent, clearAnthemEvent, updateConsent } = useSocialAlarmWs(citizen?.id);
  const [saConsent, setSaConsent] = useState(false);
  const [saConsentSaving, setSaConsentSaving] = useState(false);
  const [saAlarmTime, setSaAlarmTime] = useState("");
  const [saPurpose, setSaPurpose] = useState("");
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [saSearch, setSaSearch] = useState("");
  const [selectedTargets, setSelectedTargets] = useState<Set<number>>(new Set());
  const [saSending, setSaSending] = useState(false);
  const [saSentMsg, setSaSentMsg] = useState("");
  // Anthem overlay
  const [anthemOverlay, setAnthemOverlay] = useState(false);
  const [anthemSender, setAnthemSender] = useState("");
  const [anthemIsGlobal, setAnthemIsGlobal] = useState(false);
  const [anthemPlaying, setAnthemPlaying] = useState(false);
  const anthemAudioRef = useRef<HTMLAudioElement | null>(null);

  // Sync consent from ws (after auth_ok)
  useEffect(() => {
    setSaConsent(wsSubscribed);
  }, [wsSubscribed]);

  // Load subscribers when section opens
  useEffect(() => {
    if (section !== "social-alarm") return;
    fetch("/api/citizens/social-alarm-subscribers")
      .then(r => r.json() as Promise<Subscriber[]>)
      .then(data => setSubscribers(data))
      .catch(() => {});
  }, [section]);

  // React to PLAY_ANTHEM event
  useEffect(() => {
    if (!playAnthemEvent) return;
    setAnthemSender(playAnthemEvent.triggeredBy);
    setAnthemIsGlobal(playAnthemEvent.targetType === "all");
    setAnthemOverlay(true);
    setAnthemPlaying(false);
    clearAnthemEvent();
  }, [playAnthemEvent, clearAnthemEvent]);

  const playAnthem = useCallback(async () => {
    if (!anthemAudioRef.current) {
      anthemAudioRef.current = new window.Audio(`${import.meta.env.BASE_URL}audio/timenation_anthem.mp3`);
      anthemAudioRef.current.loop = false;
    }
    try {
      await anthemAudioRef.current.play();
      setAnthemPlaying(true);
    } catch { /* blocked */ }
  }, []);

  const stopAnthem = useCallback(() => {
    if (anthemAudioRef.current) {
      anthemAudioRef.current.pause();
      anthemAudioRef.current.currentTime = 0;
    }
    setAnthemPlaying(false);
    setAnthemOverlay(false);
  }, []);

  const toggleSaConsent = async () => {
    if (!citizen?.id) return;
    const next = !saConsent;
    setSaConsentSaving(true);
    try {
      await fetch(`/api/citizens/${citizen.id}/social-alarm-consent`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consent: next }),
      });
      setSaConsent(next);
      updateConsent(next);
    } catch { /* silent */ } finally {
      setSaConsentSaving(false);
    }
  };

  const sendSignal = async (global = false) => {
    if (!citizen?.id) return;
    setSaSending(true);
    try {
      const body = global
        ? { initiatedBy: citizen.id, purpose: saPurpose || undefined, scheduledFor: saAlarmTime || undefined }
        : { initiatedBy: citizen.id, targetCitizenIds: [...selectedTargets], purpose: saPurpose || undefined, scheduledFor: saAlarmTime || undefined };
      const res = await fetch("/api/system/trigger-alarm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setSaSentMsg(t.sa_sent);
        setSelectedTargets(new Set());
        setTimeout(() => setSaSentMsg(""), 3000);
      }
    } catch { /* silent */ } finally {
      setSaSending(false);
    }
  };

  const filteredSubscribers = subscribers.filter(s =>
    s.pseudonym.toLowerCase().includes(saSearch.toLowerCase()) && s.id !== citizen?.id
  );

  const toggleTarget = (id: number) => {
    setSelectedTargets(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const isAdmin = (citizen as (typeof citizen & { govRole?: string }) | null)?.govRole === "admin";

  return (
    <Layout>
      {/* ── Social Alarm fullscreen overlay ── */}
      {anthemOverlay && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/95 cursor-pointer"
          onClick={!anthemPlaying ? playAnthem : undefined}
        >
          <div className="text-center space-y-6 px-8 max-w-lg">
            <div className="w-24 h-24 mx-auto rounded-full bg-primary/20 border-4 border-primary animate-pulse flex items-center justify-center">
              <Radio className="w-12 h-12 text-primary" />
            </div>
            <div className="space-y-3">
              {anthemIsGlobal ? (
                <p className="text-xl font-bold text-white">{t.sa_overlay_admin}</p>
              ) : (
                <p className="text-xl font-bold text-white">
                  <span className="text-primary">{anthemSender}</span>{" "}{t.sa_overlay_user}
                </p>
              )}
              {!anthemPlaying && (
                <p className="text-base text-primary font-mono animate-bounce">{t.sa_tap_to_play}</p>
              )}
              {anthemPlaying && (
                <p className="text-base text-green-400 font-mono">♪ {t.sa_sent}</p>
              )}
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); stopAnthem(); }}
              className="flex items-center gap-2 mx-auto px-6 py-3 rounded-xl bg-white/10 hover:bg-white/20 border border-white/30 text-white font-semibold transition-colors"
            >
              <X className="w-4 h-4" />
              {t.sa_dismiss}
            </button>
          </div>
        </div>
      )}

      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Время</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Мировые часы · Таймер фокусировки · Суверенный будильник · Синхро-сигнал
          </p>
        </div>

        {/* Section tabs — compact scrollable */}
        <div className="overflow-x-auto" style={{ scrollbarWidth: "none" }}>
          <div className="flex gap-1.5 flex-nowrap min-w-max">
            {(["clock", "timer", "alarm", "social-alarm"] as const).map(s => (
              <button
                key={s}
                onClick={() => setSection(s)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium border transition-colors whitespace-nowrap shrink-0 ${
                  section === s
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card text-muted-foreground border-border hover:text-foreground hover:bg-secondary"
                }`}
                style={{ fontSize: "12px" }}
              >
                {s === "clock" ? <Globe className="w-3.5 h-3.5 shrink-0" /> : s === "timer" ? <Clock className="w-3.5 h-3.5 shrink-0" /> : s === "alarm" ? <Bell className="w-3.5 h-3.5 shrink-0" /> : <Radio className="w-3.5 h-3.5 shrink-0" />}
                {s === "clock" ? "Часовые пояса" : s === "timer" ? "Таймер" : s === "alarm" ? "Будильник" : "Синхро-сигнал"}
              </button>
            ))}
          </div>
        </div>

        {/* ── World Clock ── */}
        {section === "clock" && (
          <div className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold">🌍 Мировые часы</h2>
              <p className="text-xs text-muted-foreground">Суверенное время TimeNation — Фамагуста, Кипр · 24 часовых пояса</p>
            </div>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {ZONES.map(z => {
                const { time, date, offset } = getTimeInZone(z.tz, lang);
                const cityName = CITY_NAMES[z.key]?.[lang] ?? CITY_NAMES[z.key]?.["en"] ?? z.key;
                return (
                  <div key={z.key} className="flex items-center justify-between rounded-lg border px-4 py-3 bg-card border-border">
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
            <div className="flex flex-wrap gap-2">
            {PRESETS.map((p, i) => (
                <button
                  key={i}
                  onClick={() => handlePreset(i)}
                disabled={running || focusSessionId.current !== null}
                  className={`px-3 py-2 rounded-md text-sm font-semibold border transition-colors ${
                  preset === i ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground border-border hover:text-foreground"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="flex flex-col items-center gap-5 py-4">
              <div className="flex w-full items-center justify-center gap-4">
              <div
                className={`w-48 h-48 rounded-full border-8 flex flex-col items-center justify-center gap-1 transition-all ${running ? "border-primary" : "border-border"} bg-card`}
                style={running ? { boxShadow: "0 0 32px var(--primary, #C9A84C)44" } : {}}
              >
                <span className={`text-5xl font-extrabold tabular-nums ${completed ? "text-primary" : "text-foreground"}`}>
                  {String(timerMinutes).padStart(2, "0")}:{String(timerSeconds).padStart(2, "0")}
                </span>
                <span className="text-xs text-muted-foreground">
                  {completed ? "Сессия завершена!" : running ? "Фокусируйся…" : "Готов к старту"}
                </span>
              </div>
                <MinuteHourglass
                  elapsedSeconds={Math.max(0, sessionDurationRef.current - remaining)}
                  running={running}
                />
              </div>
              <div className="w-full h-1.5 bg-border rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${(1 - progress) * 100}%` }} />
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={async () => {
                  stopInterval();
                  if (focusSessionId.current) {
                    await fetch(`/api/citizens/focus/${focusSessionId.current}/pause`, { method: "POST", headers: authHeaders });
                    focusSessionId.current = null;
                  }
                  setRunning(false); setCompleted(false); setFocusResult(null); setFocusText(""); setRemaining(PRESETS[preset]!.seconds);
                }}
                className="flex items-center gap-2 px-5 py-3 rounded-lg bg-card border border-border text-muted-foreground hover:text-foreground font-semibold transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
                Сброс
              </button>
              <button
                onClick={() => void toggleFocusTimer()}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg font-bold text-base transition-colors ${running ? "bg-secondary text-foreground border border-border" : "bg-primary text-primary-foreground"}`}
              >
                {running ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                {running ? "Пауза" : "Старт"}
              </button>
            </div>
            <label className="block space-y-2">
              <span className="text-sm font-semibold">Запишите мысли во время фокусировки</span>
              <textarea
                value={focusText}
                onChange={event => setFocusText(event.target.value)}
                maxLength={100000}
                rows={6}
                placeholder="Пишите свободно. Текст не сохраняется — для расчёта награды учитывается только его объём."
                className="w-full resize-y rounded-lg border border-border bg-card p-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <span className="text-xs text-muted-foreground">{Array.from(focusText).length.toLocaleString()} символов · 1 страница ≈ 1 800 символов</span>
            </label>
            {completed && (
              <div className="flex items-center gap-3 p-4 rounded-lg bg-primary/10 border border-primary/40">
                <span className="text-xl">🎉</span>
                <p className="text-sm text-foreground">
                  Сеанс завершён: <strong>{Math.round(sessionDurationRef.current / 60)} минут</strong> концентрации.
                  {focusResult && <> Учтено {focusResult.textCharacters} символов, начислено {focusResult.rewardDarmins} Д.</>}
                </p>
                <button onClick={() => setCompleted(false)} className="text-xs text-muted-foreground hover:text-foreground shrink-0">✕</button>
              </div>
            )}
            {focusError && <p role="alert" className="text-sm text-destructive">{focusError}</p>}
            <div className="flex items-start gap-2 p-3 rounded-lg bg-muted text-xs text-muted-foreground">
              <Info className="w-4 h-4 shrink-0 mt-0.5" />
              За завершённый сеанс от 12 минут начисляется 1 Д за каждые 1 800 символов. Текст не хранится.
            </div>
            {citizen?.id && (
              <div className="space-y-3 rounded-lg border border-border bg-card p-4">
                <div>
                  <h3 className="font-semibold">Вопрос о TimeNation</h3>
                  <p className="text-xs text-muted-foreground">За каждые 12 правильных ответов начисляется 1 Дармин.</p>
                </div>
                {quizAttempt ? (
                  <>
                    <p className="text-sm">{quizAttempt.question}</p>
                    <div className="flex gap-2">
                      <input value={quizAnswer} onChange={event => setQuizAnswer(event.target.value)} onKeyDown={event => { if (event.key === "Enter") void submitQuizAnswer(); }} placeholder="Введите ответ" className="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm" />
                      <button disabled={!quizAnswer.trim() || quizBusy} onClick={() => void submitQuizAnswer()} className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">Ответить</button>
                    </div>
                  </>
                ) : (
                  <button onClick={() => void loadQuizQuestion()} className="rounded-md border border-border px-4 py-2 text-sm font-semibold hover:bg-muted">Получить вопрос</button>
                )}
                {quizResult && <p className="text-sm">{quizResult.correct ? "Верно" : "Неверно"} · Правильных ответов всего: {quizResult.totalCorrect}{quizResult.awardedDarmins ? " · Начислен 1 Д!" : ` · До награды: ${12 - (quizResult.totalCorrect % 12)}`}</p>}
                {quizError && <p role="alert" className="text-sm text-destructive">{quizError}</p>}
              </div>
            )}
          </div>
        )}

        {/* ── Alarm ── */}
        {section === "alarm" && (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold">⏰ Суверенный будильник</h2>
              <p className="text-xs text-muted-foreground">Работает по времени Фамагусты (Asia/Nicosia)</p>
            </div>
            <div className="flex items-center justify-center gap-4">
              <div className="flex flex-col items-center bg-card border border-border rounded-xl px-8 py-4 gap-3">
                <button onClick={() => setAlarmHour(h => (h + 1) % 24)} className="text-primary hover:opacity-70 transition-opacity"><ChevronUp className="w-6 h-6" /></button>
                <span className="text-5xl font-extrabold text-primary tabular-nums">{String(alarmHour).padStart(2, "0")}</span>
                <button onClick={() => setAlarmHour(h => (h + 23) % 24)} className="text-primary hover:opacity-70 transition-opacity"><ChevronDown className="w-6 h-6" /></button>
              </div>
              <span className="text-5xl font-extrabold text-primary mb-2">:</span>
              <div className="flex flex-col items-center bg-card border border-border rounded-xl px-8 py-4 gap-3">
                <button onClick={() => setAlarmMinute(m => (m + 1) % 60)} className="text-primary hover:opacity-70 transition-opacity"><ChevronUp className="w-6 h-6" /></button>
                <span className="text-5xl font-extrabold text-primary tabular-nums">{String(alarmMinute).padStart(2, "0")}</span>
                <button onClick={() => setAlarmMinute(m => (m + 59) % 60)} className="text-primary hover:opacity-70 transition-opacity"><ChevronDown className="w-6 h-6" /></button>
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Дни недели</p>
              <div className="flex gap-2 flex-wrap">
                {DAYS.map((d, i) => (
                  <button
                    key={i}
                    onClick={() => toggleDay(i)}
                    className={`w-10 h-10 rounded-full text-xs font-semibold border transition-colors ${alarmDays.has(i) ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground border-border hover:text-foreground"}`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
            {"Notification" in window && Notification.permission === "default" && (
              <button
                onClick={() => void requestNotifPermission()}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm border border-dashed border-border text-muted-foreground hover:text-foreground transition-colors"
              >
                <Bell className="w-4 h-4" />
                Разрешить уведомления
              </button>
            )}
            {alarmFiring && (
              <div className="flex items-center justify-between gap-3 p-4 rounded-xl border-2 border-primary bg-primary/10 animate-pulse">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">⏰</span>
                  <div>
                    <p className="font-bold text-primary text-base">Суверенный Будильник!</p>
                    <p className="text-sm text-primary/80">{String(alarmHour).padStart(2,"0")}:{String(alarmMinute).padStart(2,"0")} · Фамагуста</p>
                  </div>
                </div>
                <button onClick={dismissAlarm} className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:bg-primary/80 transition-colors">Выключить</button>
              </div>
            )}
            <button
              onClick={async () => {
                const next = !alarmActive;
                if (next) {
                  await unlockAndPrepareAudio();
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
              className={`w-full flex items-center justify-center gap-2 py-3 rounded-lg font-semibold border transition-colors ${alarmActive ? "bg-primary/10 border-primary/40 text-primary hover:bg-primary/20" : "bg-primary text-primary-foreground hover:bg-primary/90"}`}
            >
              <Bell className="w-4 h-4" />
              {alarmActive ? "Будильник активен — выключить" : "Включить будильник"}
            </button>
            {!alarmActive && (
              <button
                onClick={async () => {
                  const a = getAudioEl();
                  a.loop = false; a.currentTime = 0;
                  try { await a.play(); } catch { /* blocked */ }
                  setTimeout(() => { a.pause(); a.currentTime = 0; a.loop = true; }, 3000);
                  setAudioReady(true);
                }}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm border border-border text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              >
                <Bell className="w-4 h-4" />
                Проверить звук (3 сек)
              </button>
            )}
            {audioReady && !alarmActive && <p className="text-center text-xs text-green-500">✓ Звук разблокирован</p>}
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
              Страница должна быть открыта. Звук работает только если нажал «Включить» или «Проверить звук».
            </div>
          </div>
        )}

        {/* ── Social Alarm ── */}
        {section === "social-alarm" && (
          <div className="space-y-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <Radio className="w-5 h-5 text-primary" />
                  {t.sa_title}
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">{t.sa_subtitle}</p>
              </div>
              {wsConnected && (
                <span className="flex items-center gap-1 text-xs text-green-500 font-mono shrink-0 mt-1">
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse inline-block" />
                  LIVE
                </span>
              )}
            </div>

            {!citizen ? (
              <div className="flex items-center gap-3 p-4 bg-muted/40 border border-border rounded-lg">
                <Radio className="w-5 h-5 text-muted-foreground" />
                <p className="text-sm text-muted-foreground font-mono">{t.sa_login_required}</p>
              </div>
            ) : (
              <>
                {/* Consent toggle */}
                <div className="p-4 bg-card border border-border rounded-lg space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1">
                      <p className="text-sm font-medium">{t.sa_consent_label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{t.sa_consent_hint}</p>
                    </div>
                    <button
                      onClick={toggleSaConsent}
                      disabled={saConsentSaving}
                      className={`relative w-12 h-6 rounded-full transition-colors shrink-0 ${saConsent ? "bg-primary" : "bg-muted border border-border"} ${saConsentSaving ? "opacity-60" : ""}`}
                    >
                      <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${saConsent ? "left-6" : "left-0.5"}`} />
                    </button>
                  </div>
                  {saConsent && (
                    <p className="text-xs text-primary font-mono">✓ {t.sa_consent_saved}</p>
                  )}
                </div>

                {/* Admin global alarm */}
                {isAdmin && (
                  <div className="p-4 bg-destructive/10 border border-destructive/30 rounded-lg space-y-3">
                    <div className="flex items-center gap-2">
                      <Zap className="w-4 h-4 text-destructive" />
                      <p className="text-sm font-semibold text-destructive">{t.sa_global_alarm}</p>
                    </div>
                    <button
                      onClick={() => void sendSignal(true)}
                      disabled={saSending}
                      className="w-full py-2.5 rounded-lg bg-destructive text-white font-semibold text-sm hover:bg-destructive/90 transition-colors disabled:opacity-60"
                    >
                      {saSending ? "…" : t.sa_trigger_global}
                    </button>
                  </div>
                )}

                {/* Sync parameters */}
                <div className="p-4 bg-card border border-border rounded-lg space-y-3">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <Clock className="w-4 h-4 text-primary" />
                    Параметры синхронизации
                  </h3>
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground font-mono">Время срабатывания</label>
                    <div className="relative">
                      <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                      <input
                        type="time"
                        value={saAlarmTime}
                        onChange={e => setSaAlarmTime(e.target.value)}
                        className="w-full pl-9 pr-4 py-2.5 text-sm bg-secondary border border-border rounded-lg font-mono focus:outline-none focus:border-primary [color-scheme:dark]"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground font-mono">Смысл уведомления</label>
                    <textarea
                      value={saPurpose}
                      onChange={e => setSaPurpose(e.target.value)}
                      placeholder="Укажите причину отправки сигнала (например: Общий сбор / Парад планет)..."
                      rows={2}
                      className="w-full px-3 py-2.5 text-sm bg-secondary border border-border rounded-lg font-mono focus:outline-none focus:border-primary resize-none"
                    />
                  </div>
                </div>

                {/* Subscriber picker */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">{t.sa_select_targets}</p>
                    {selectedTargets.size > 0 && (
                      <span className="text-xs font-mono text-primary">{selectedTargets.size} {t.sa_selected}</span>
                    )}
                  </div>

                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type="text"
                      value={saSearch}
                      onChange={e => setSaSearch(e.target.value)}
                      placeholder={t.sa_search_ph}
                      className="w-full pl-9 pr-4 py-2.5 text-sm bg-secondary border border-border rounded-lg font-mono focus:outline-none focus:border-primary"
                    />
                  </div>

                  {filteredSubscribers.length === 0 ? (
                    <div className="flex items-center gap-2 p-3 bg-muted/40 rounded-lg">
                      <Users className="w-4 h-4 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground font-mono">{t.sa_no_subscribers}</p>
                    </div>
                  ) : (
                    <div className="space-y-1.5 max-h-64 overflow-y-auto">
                      {filteredSubscribers.map(s => (
                        <button
                          key={s.id}
                          onClick={() => toggleTarget(s.id)}
                          className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg border text-left transition-colors ${
                            selectedTargets.has(s.id)
                              ? "bg-primary/15 border-primary/50 text-foreground"
                              : "bg-card border-border text-muted-foreground hover:text-foreground hover:bg-secondary"
                          }`}
                        >
                          <span className="font-mono text-sm">{s.pseudonym}</span>
                          <span className="text-xs font-mono opacity-60">{s.rank}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Send signal */}
                {saSentMsg ? (
                  <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
                    <Volume2 className="w-4 h-4 text-green-500" />
                    <p className="text-sm text-green-500 font-mono font-semibold">{saSentMsg}</p>
                  </div>
                ) : (
                  <button
                    onClick={() => void sendSignal(false)}
                    disabled={saSending || selectedTargets.size === 0}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-primary text-primary-foreground font-bold hover:bg-primary/90 transition-colors disabled:opacity-40"
                  >
                    <Radio className="w-4 h-4" />
                    {saSending ? "…" : "Запустить Гимн выбранным"}
                    {selectedTargets.size > 0 && ` (${selectedTargets.size})`}
                  </button>
                )}

                <div className="flex items-start gap-2 p-3 rounded-lg bg-muted text-xs text-muted-foreground">
                  <Info className="w-4 h-4 shrink-0 mt-0.5" />
                  {t.sa_consent_hint}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
