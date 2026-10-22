import { useEffect } from "react";
import { Layout } from "@/components/Layout";
import { useLanguage } from "@/context/LanguageContext";
import type { LangCode } from "@/i18n/ui";

const LANGUAGES_24: {
  hour: number;
  label: string;
  native: string;
  code: string;
  rtl: boolean;
  flag: string;
  iso: string;
}[] = [
  { hour: 1,  label: "Русский",      native: "Русский",      code: "ru", rtl: false, flag: "🇷🇺", iso: "RU" },
  { hour: 2,  label: "English",      native: "English",      code: "en", rtl: false, flag: "🇬🇧", iso: "EN" },
  { hour: 3,  label: "中文",          native: "中文",          code: "zh", rtl: false, flag: "🇨🇳", iso: "ZH" },
  { hour: 4,  label: "हिन्दी",        native: "हिन्दी",        code: "hi", rtl: false, flag: "🇮🇳", iso: "HI" },
  { hour: 5,  label: "Español",      native: "Español",      code: "es", rtl: false, flag: "🇪🇸", iso: "ES" },
  { hour: 6,  label: "Français",     native: "Français",     code: "fr", rtl: false, flag: "🇫🇷", iso: "FR" },
  { hour: 7,  label: "العربية",      native: "العربية",      code: "ar", rtl: true,  flag: "🇸🇦", iso: "AR" },
  { hour: 8,  label: "বাংলা",         native: "বাংলা",         code: "bn", rtl: false, flag: "🇧🇩", iso: "BN" },
  { hour: 9,  label: "Português",    native: "Português",    code: "pt", rtl: false, flag: "🇵🇹", iso: "PT" },
  { hour: 10, label: "اردو",          native: "اردو",          code: "ur", rtl: true,  flag: "🇵🇰", iso: "UR" },
  { hour: 11, label: "Indonesia",    native: "Indonesia",    code: "id", rtl: false, flag: "🇮🇩", iso: "ID" },
  { hour: 12, label: "Deutsch",      native: "Deutsch",      code: "de", rtl: false, flag: "🇩🇪", iso: "DE" },
  { hour: 13, label: "日本語",         native: "日本語",         code: "ja", rtl: false, flag: "🇯🇵", iso: "JA" },
  { hour: 14, label: "Türkçe",       native: "Türkçe",       code: "tr", rtl: false, flag: "🇹🇷", iso: "TR" },
  { hour: 15, label: "Tiếng Việt",   native: "Tiếng Việt",   code: "vi", rtl: false, flag: "🇻🇳", iso: "VI" },
  { hour: 16, label: "עברית",         native: "עברית",         code: "he", rtl: true,  flag: "🇮🇱", iso: "HE" },
  { hour: 17, label: "فارسی",         native: "فارسی",         code: "fa", rtl: true,  flag: "🇮🇷", iso: "FA" },
  { hour: 18, label: "한국어",         native: "한국어",         code: "ko", rtl: false, flag: "🇰🇷", iso: "KO" },
  { hour: 19, label: "Italiano",     native: "Italiano",     code: "it", rtl: false, flag: "🇮🇹", iso: "IT" },
  { hour: 20, label: "Polski",       native: "Polski",       code: "pl", rtl: false, flag: "🇵🇱", iso: "PL" },
  { hour: 21, label: "Українська",   native: "Українська",   code: "uk", rtl: false, flag: "🇺🇦", iso: "UK" },
  { hour: 22, label: "Nederlands",   native: "Nederlands",   code: "nl", rtl: false, flag: "🇳🇱", iso: "NL" },
  { hour: 23, label: "Қазақша",      native: "Қазақша",      code: "kk", rtl: false, flag: "🇰🇿", iso: "KK" },
  { hour: 24, label: "O'zbek",       native: "O'zbek",       code: "uz", rtl: false, flag: "🇺🇿", iso: "UZ" },
];

const TRANSLATIONS: Record<string, { welcome: string; select: string; status: string }> = {
  ru: { welcome: "Добро пожаловать в TimeNation",        select: "Выберите ваш час",          status: "Время — это общий язык, который объединяет все нации мира на одном циферблате." },
  en: { welcome: "Welcome to TimeNation",                select: "Choose your hour",           status: "Time is a common language that unites all nations of the world on one dial." },
  zh: { welcome: "欢迎来到 TimeNation",                   select: "选择你的时间",                status: "时间是连接世界上所有国家的通用语言。" },
  hi: { welcome: "TimeNation में आपका स्वागत है",        select: "अपना घंटा चुनें",            status: "समय एक साझा भाषा है जो दुनिया के सभी देशों को एक डायल पर जोड़ती है।" },
  es: { welcome: "Bienvenido a TimeNation",              select: "Elige tu hora",              status: "El tiempo es un idioma común que une a todas las naciones del mundo en un solo cuadrante." },
  fr: { welcome: "Bienvenue à TimeNation",               select: "Choisissez votre heure",     status: "Le temps est une langue commune qui unit toutes les nations du monde sur un seul cadran." },
  ar: { welcome: "مرحباً بكم في TimeNation",             select: "اختر ساعتك",                status: "الوقت لغة مشتركة توحد جميع أمم العالم على قرص واحد." },
  bn: { welcome: "TimeNation-এ স্বাগতম",                 select: "আপনার ঘন্টা চয়ন করুন",     status: "সময় একটি সাধারণ ভাষা যা বিশ্বের সমস্ত জাতিকে একটি ডায়ালে একত্রিত করে।" },
  pt: { welcome: "Bem-vindo ao TimeNation",              select: "Escolha sua hora",           status: "O tempo é uma linguagem comum que une todas as nações do mundo num único mostrador." },
  ur: { welcome: "TimeNation میں خوش آمدید",             select: "اپنا گھنٹہ منتخب کریں",     status: "وقت ایک ایسی عام زبان ہے جو دنیا کی تمام قوموں کو ایک ڈائل پر متحد کرتی ہے۔" },
  id: { welcome: "Selamat Datang di TimeNation",         select: "Pilih jam Anda",             status: "Waktu adalah bahasa universal yang menyatukan semua bangsa di dunia dalam satu dial." },
  de: { welcome: "Willkommen bei TimeNation",            select: "Wählen Sie Ihre Stunde",     status: "Zeit ist eine gemeinsame Sprache, die alle Nationen der Welt auf einem Zifferblatt vereint." },
  ja: { welcome: "TimeNationへようこそ",                   select: "あなたの時間を選択してください", status: "時間は、世界中のすべての国を1つの文字盤で結びつける共通の言語です。" },
  tr: { welcome: "TimeNation'a Hoş Geldiniz",            select: "Saatinizi seçin",            status: "Zaman, dünyadaki tüm ulusları tek bir kadranda birleştiren ortak bir dildir." },
  vi: { welcome: "Chào mừng đến với TimeNation",         select: "Chọn giờ của bạn",           status: "Thời gian là ngôn ngữ chung gắn kết tất cả các quốc gia trên thế giới trên một mặt số." },
  he: { welcome: "ברוכים הבאים ל-TimeNation",            select: "בחר את השעה שלך",            status: "הזמן הוא שפה משותפת המאחדת את כל אומות העולם על חוגה אחת." },
  fa: { welcome: "به TimeNation خوش آمدید",              select: "ساعت خود را انتخاب کنید",   status: "زمان زبان مشترکی است که همه ملت‌های جهان را روی یک صفحه ساعت متحد می‌کند." },
  ko: { welcome: "TimeNation에 오신 것을 환영합니다",      select: "시간을 선택하세요",           status: "시간은 세계의 모든 국가를 하나의 다이얼로 연결하는 공통 언어입니다." },
  it: { welcome: "Benvenuto in TimeNation",              select: "Scegli la tua ora",          status: "Il tempo è una lingua comune che unisce tutte le nazioni del mondo su un unico quadrante." },
  pl: { welcome: "Witaj w TimeNation",                   select: "Wybierz swoją godzinę",      status: "Czas to wspólny język, który jednoczy wszystkie narody świata na jednej tarczy." },
  uk: { welcome: "Ласкаво просимо до TimeNation",        select: "Оберіть вашу годину",        status: "Час — це спільна мова, яка об'єднує всі нації світу на одному циферблаті." },
  nl: { welcome: "Welkom bij TimeNation",                select: "Kies uw uur",                status: "Tijd is een gemeenschappelijke taal die alle naties van de wereld op één wijzerplaat verenigt." },
  kk: { welcome: "TimeNation-қа қош келдіңіз",           select: "Сағатыңызды таңдаңыз",      status: "Уақыт — бүкіл әлем халықтарын бір циферблатта біріктіретін ортақ тіл." },
  uz: { welcome: "TimeNation-ga xush kelibsiz",          select: "Soatingizni tanlang",        status: "Vaqt — dunyodagi barcha millatlarni bir siferblatda birlashtiradigan umumiy tildir." },
};

const DIAL = 340;
const RADIUS = 130;
const HAND_LENGTH = 105;

export function PeopleClockDial({ size = DIAL }: { size?: number }) {
  const { lang, setLang } = useLanguage();
  const active = LANGUAGES_24.find((item) => item.code === lang) ?? LANGUAGES_24[0]!;
  const scale = size / DIAL;
  const center = size / 2;
  const radius = RADIUS * scale;
  const markerSize = Math.max(22, 32 * scale);

  return (
    <div
      role="group"
      aria-label={TRANSLATIONS[lang]?.select ?? TRANSLATIONS.en!.select}
      className="relative flex shrink-0 items-center justify-center rounded-full"
      style={{
        width: size,
        height: size,
        background: "radial-gradient(circle, #18181b 0%, #09090b 100%)",
        border: `${Math.max(3, 6 * scale)}px double #f59e0b`,
        boxShadow: "0 0 30px rgba(245,158,11,0.22)",
      }}
    >
      {LANGUAGES_24.map((item) => {
        const angleRad = (item.hour * 15 - 90) * (Math.PI / 180);
        const x = center + radius * Math.cos(angleRad);
        const y = center + radius * Math.sin(angleRad);
        const isActive = item.code === lang;
        return (
          <button
            key={item.code}
            type="button"
            onClick={() => setLang(item.code as LangCode)}
            title={`${item.native} · ${item.hour}:00`}
            aria-label={`${item.native} · ${item.hour}:00`}
            aria-pressed={isActive}
            className="absolute flex items-center justify-center rounded-full transition-all duration-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300"
            style={{
              width: markerSize,
              height: markerSize,
              left: x - markerSize / 2,
              top: y - markerSize / 2,
              fontSize: Math.max(13, 18 * scale),
              lineHeight: 1,
              background: isActive ? "#f59e0b22" : "transparent",
              border: `${isActive ? 2 : 1}px solid ${isActive ? "#f59e0b" : "#3f3f46"}`,
              boxShadow: isActive ? "0 0 10px #f59e0b" : undefined,
              zIndex: 2,
            }}
          >
            {item.flag}
          </button>
        );
      })}
      <div
        aria-hidden="true"
        className="absolute z-[1] rounded-full bg-red-500 pointer-events-none"
        style={{
          width: Math.max(3, 4 * scale),
          height: HAND_LENGTH * scale,
          bottom: "50%",
          left: `calc(50% - ${Math.max(1.5, 2 * scale)}px)`,
          transformOrigin: "bottom center",
          transform: `rotate(${active.hour * 15}deg)`,
          transition: "transform 0.55s cubic-bezier(0.34,1.56,0.64,1)",
          boxShadow: "0 0 6px rgba(239,68,68,0.6)",
        }}
      />
      <div
        aria-hidden="true"
        className="absolute z-10 rounded-full bg-amber-400"
        style={{
          width: Math.max(10, 14 * scale),
          height: Math.max(10, 14 * scale),
          left: `calc(50% - ${Math.max(5, 7 * scale)}px)`,
          top: `calc(50% - ${Math.max(5, 7 * scale)}px)`,
          boxShadow: "0 0 8px #f59e0b",
        }}
      />
    </div>
  );
}

export function Clock() {
  const { lang, setLang } = useLanguage();
  const active = LANGUAGES_24.find((l) => l.code === lang) ?? LANGUAGES_24[0]!;
  const activeHour = active.hour;
  const t = TRANSLATIONS[active.code] ?? TRANSLATIONS["ru"]!;

  // degrees: each hour = +15°, hour=24 at top (0°=up in CSS rotate)
  useEffect(() => {
    document.title = `${t.welcome} | TimeNation`;
  }, [t.welcome]);

  return (
    <Layout>
      <div
        className="flex flex-col items-center justify-center min-h-[calc(100vh-8rem)] py-8 px-4"
        style={{ background: "transparent" }}
        dir={active.rtl ? "rtl" : "ltr"}
      >
        {/* Header */}
        <h1
          className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-amber-500 mb-2 text-center transition-all duration-500"
          key={active.code + "-welcome"}
        >
          {t.welcome}
        </h1>
        <p className="text-zinc-400 text-sm mb-8 text-center">
          {t.select}:{" "}
          <span className="text-amber-500 font-bold">{active.flag} {activeHour}:00 · {active.iso} · {active.native}</span>
        </p>

        {/* Two-column layout on large screens */}
        <div className="flex flex-col lg:flex-row gap-10 items-center lg:items-start w-full max-w-4xl">

          {/* ── Clock face ── */}
          <div className="flex flex-col items-center gap-5 shrink-0">
            <PeopleClockDial size={DIAL} />

            {/* Status quote */}
            <div
              className="w-full max-w-xs px-5 py-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 text-center"
              dir={active.rtl ? "rtl" : "ltr"}
              key={active.code + "-status"}
            >
              <p className="text-zinc-300 text-sm leading-relaxed">{t.status}</p>
            </div>
          </div>

          {/* ── Language grid ── */}
          <div className="flex-1 w-full min-w-0">
            <p className="text-[11px] font-mono text-zinc-500 uppercase tracking-widest mb-3 text-center lg:text-left">
              24 языка · 24 часа
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {LANGUAGES_24.map((item) => {
                const isActive = item.hour === activeHour;
                return (
                  <button
                    key={item.hour}
                    onClick={() => setLang(item.code as LangCode)}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-left text-xs transition-all duration-200 border ${
                      isActive
                        ? "bg-amber-500/15 border-amber-500/50 text-amber-400 font-semibold"
                        : "bg-zinc-900/40 border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
                    }`}
                  >
                    <span className="text-base leading-none shrink-0">{item.flag}</span>
                    <span className="font-mono text-[10px] text-zinc-500 shrink-0">{item.iso}</span>
                    <span className="truncate">{item.label}</span>
                    {item.rtl && (
                      <span className="ml-auto text-[9px] text-zinc-600 shrink-0">RTL</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
