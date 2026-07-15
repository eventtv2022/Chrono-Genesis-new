import { useEffect, useRef, useState } from "react";
import { Layout } from "@/components/Layout";

const LANGUAGES_24 = [
  { hour: 24, label: "O'zbek", native: "O'zbek (Узбекский)", code: "uz", rtl: false },
  { hour: 1,  label: "Русский", native: "Русский", code: "ru", rtl: false },
  { hour: 2,  label: "English", native: "English (Английский)", code: "en", rtl: false },
  { hour: 3,  label: "中文", native: "中文 (Китайский)", code: "zh", rtl: false },
  { hour: 4,  label: "हिन्दी", native: "हिन्दी (Хинди)", code: "hi", rtl: false },
  { hour: 5,  label: "Español", native: "Español (Испанский)", code: "es", rtl: false },
  { hour: 6,  label: "Français", native: "Français (Французский)", code: "fr", rtl: false },
  { hour: 7,  label: "العربية", native: "العربية (Арабский)", code: "ar", rtl: true },
  { hour: 8,  label: "বাংলা", native: "বাংলা (Бенгальский)", code: "bn", rtl: false },
  { hour: 9,  label: "Português", native: "Português (Португальский)", code: "pt", rtl: false },
  { hour: 10, label: "اردو", native: "اردو (Урду)", code: "ur", rtl: true },
  { hour: 11, label: "Indonesia", native: "Indonesian (Индонезийский)", code: "id", rtl: false },
  { hour: 12, label: "Deutsch", native: "Deutsch (Немецкий)", code: "de", rtl: false },
  { hour: 13, label: "日本語", native: "日本語 (Японский)", code: "ja", rtl: false },
  { hour: 14, label: "Türkçe", native: "Türkçe (Турецкий)", code: "tr", rtl: false },
  { hour: 15, label: "Tiếng Việt", native: "Tiếng Việt (Вьетнамский)", code: "vi", rtl: false },
  { hour: 16, label: "עברית", native: "עברית (Иврит)", code: "he", rtl: true },
  { hour: 17, label: "فارسی", native: "Farsi (Персидский)", code: "fa", rtl: true },
  { hour: 18, label: "한국어", native: "한국어 (Корейский)", code: "ko", rtl: false },
  { hour: 19, label: "Italiano", native: "Italiano (Итальянский)", code: "it", rtl: false },
  { hour: 20, label: "Polski", native: "Polski (Польский)", code: "pl", rtl: false },
  { hour: 21, label: "Українська", native: "Українська (Украинский)", code: "uk", rtl: false },
  { hour: 22, label: "Nederlands", native: "Nederlands (Нидерландский)", code: "nl", rtl: false },
  { hour: 23, label: "Қазақша", native: "Қазақша (Казахский)", code: "kk", rtl: false },
];

const TRANSLATIONS: Record<string, { welcome: string; select: string; status: string }> = {
  ru: { welcome: "Добро пожаловать в TimeNation", select: "Выберите ваш час", status: "Время — это общий язык, который объединяет все нации мира на одном циферблате." },
  en: { welcome: "Welcome to TimeNation", select: "Choose your hour", status: "Time is a common language that unites all nations of the world on one dial." },
  zh: { welcome: "欢迎来到 TimeNation", select: "选择你的时间", status: "时间是连接世界上所有国家的通用语言。" },
  hi: { welcome: "TimeNation में आपका स्वागत है", select: "अपना घंटा चुनें", status: "समय एक साझा भाषा है जो दुनिया के सभी देशों को एक डायल पर जोड़ती है।" },
  es: { welcome: "Bienvenido a TimeNation", select: "Elige tu hora", status: "El tiempo es un idioma común que une a todas las naciones del mundo en un solo cuadrante." },
  fr: { welcome: "Bienvenue à TimeNation", select: "Choisissez votre heure", status: "Le temps est une langue commune qui unit toutes les nations du monde sur un seul cadran." },
  ar: { welcome: "مرحباً بكم في TimeNation", select: "اختر ساعتك", status: "الوقت لغة مشتركة توحد جميع أمم العالم على قرص واحد." },
  bn: { welcome: "TimeNation-এ স্বাগতম", select: "আপনার ঘন্টা চয়ন করুন", status: "সময় একটি সাধারণ ভাষা যা বিশ্বের সমস্ত জাতিকে একটি ডায়ালে একত্রিত করে।" },
  pt: { welcome: "Bem-vindo ao TimeNation", select: "Escolha sua hora", status: "O tempo é uma linguagem comum que une todas as nações do mundo num único mostrador." },
  ur: { welcome: "TimeNation میں خوش آمدید", select: "اپنا گھنٹہ منتخب کریں", status: "وقت ایک ایسی عام زبان ہے جو دنیا کی تمام قوموں کو ایک ڈائل پر متحد کرتی ہے۔" },
  id: { welcome: "Selamat Datang di TimeNation", select: "Pilih jam Anda", status: "Waktu adalah bahasa universal yang menyatukan semua bangsa di dunia dalam satu dial." },
  de: { welcome: "Willkommen bei TimeNation", select: "Wählen Sie Ihre Stunde", status: "Zeit ist eine gemeinsame Sprache, die alle Nationen der Welt auf einem Zifferblatt vereint." },
  ja: { welcome: "TimeNationへようこそ", select: "あなたの時間を選択してください", status: "時間は、世界中のすべての国を1つの文字盤で結びつける共通の言語です。" },
  tr: { welcome: "TimeNation'a Hoş Geldiniz", select: "Saatinizi seçin", status: "Zaman, dünyadaki tüm ulusları tek bir kadranda birleştiren ortak bir dildir." },
  vi: { welcome: "Chào mừng đến với TimeNation", select: "Chọn giờ của bạn", status: "Thời gian là ngôn ngữ chung gắn kết tất cả các quốc gia trên thế giới trên một mặt số." },
  he: { welcome: "ברוכים הבאים ל-TimeNation", select: "בחר את השעה שלך", status: "הזמן הוא שפה משותפת המאחדת את כל אומות העולם על חוגה אחת." },
  fa: { welcome: "به TimeNation خوش آمدید", select: "ساعت خود را انتخاب کنید", status: "زمان زبان مشترکی است که همه ملت‌های جهان را روی یک صفحه ساعت متحد می‌کند." },
  ko: { welcome: "TimeNation에 오신 것을 환영합니다", select: "시간을 선택하세요", status: "시간은 세계의 모든 국가를 하나의 다이얼로 연결하는 공통 언어입니다." },
  it: { welcome: "Benvenuto in TimeNation", select: "Scegli la tua ora", status: "Il tempo è una lingua comune che unisce tutte le nazioni del mondo su un unico quadrante." },
  pl: { welcome: "Witaj w TimeNation", select: "Wybierz swoją godzinę", status: "Czas to wspólny język, który jednoczy wszystkie narody świata na jednej tarczy." },
  uk: { welcome: "Ласкаво просимо до TimeNation", select: "Оберіть вашу годину", status: "Час — це спільна мова, яка об'єднує всі нації світу на одному циферблаті." },
  nl: { welcome: "Welkom bij TimeNation", select: "Kies uw uur", status: "Tijd is een gemeenschappelijke taal die alle naties van de wereld op één wijzerplaat verenigt." },
  kk: { welcome: "TimeNation-қа қош келдіңіз", select: "Сағатыңызды таңдаңыз", status: "Уақыт — бүкіл әлем халықтарын бір циферблатта біріктіретін ортақ тіл." },
  uz: { welcome: "TimeNation-ga xush kelibsiz", select: "Soatingizni tanlang", status: "Vaqt — dunyodagi barcha millatlarni bir siferblatda birlashtiradigan umumiy tildir." },
};

const SIZE = 340;
const CX = SIZE / 2;
const CY = SIZE / 2;
const RADIUS = 130;

export function Clock() {
  const [activeHour, setActiveHour] = useState(1);
  const svgRef = useRef<SVGSVGElement>(null);

  const active = LANGUAGES_24.find((l) => l.hour === activeHour) ?? LANGUAGES_24[1]!;
  const t = TRANSLATIONS[active.code] ?? TRANSLATIONS["ru"]!;
  const handAngle = activeHour * 15;

  useEffect(() => {
    document.title = "Мультиязычный Циферблат | TimeNation";
  }, []);

  return (
    <Layout>
      <div
        className="space-y-6"
        dir={active.rtl ? "rtl" : "ltr"}
      >
        <div className={active.rtl ? "text-right" : ""}>
          <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-amber-400 to-yellow-500 bg-clip-text text-transparent transition-all duration-500">
            {t.welcome}
          </h1>
          <p className="text-muted-foreground text-sm mt-1 font-mono">
            {t.select}:{" "}
            <span className="text-amber-500 font-bold">{active.native} ({active.hour}:00)</span>
          </p>
        </div>

        <div className="flex flex-col lg:flex-row gap-8 items-center lg:items-start">
          {/* Clock face */}
          <div className="shrink-0 flex flex-col items-center gap-4">
            <div
              className="relative rounded-full"
              style={{
                width: SIZE,
                height: SIZE,
                background: "radial-gradient(circle, #1a1a1a 0%, #0a0a0a 100%)",
                border: "6px double #f39c12",
                boxShadow: "0 0 35px rgba(243,156,18,0.35)",
              }}
            >
              <svg
                ref={svgRef}
                width={SIZE}
                height={SIZE}
                className="absolute inset-0"
                style={{ borderRadius: "50%" }}
              >
                {/* Hour dots */}
                {LANGUAGES_24.map((item) => {
                  const angle = (item.hour * 15 * Math.PI) / 180 - Math.PI / 2;
                  const x = CX + RADIUS * Math.cos(angle);
                  const y = CY + RADIUS * Math.sin(angle);
                  const isActive = item.hour === activeHour;
                  return (
                    <g
                      key={item.hour}
                      onClick={() => setActiveHour(item.hour)}
                      style={{ cursor: "pointer" }}
                    >
                      <circle
                        cx={x}
                        cy={y}
                        r={13}
                        fill={isActive ? "#f39c12" : "#27272a"}
                        stroke={isActive ? "#fff" : "#52525b"}
                        strokeWidth={isActive ? 2 : 1}
                        style={{
                          filter: isActive ? "drop-shadow(0 0 6px #f39c12)" : undefined,
                          transition: "all 0.3s",
                        }}
                      />
                      <text
                        x={x}
                        y={y + 4}
                        textAnchor="middle"
                        fontSize="9"
                        fontWeight="bold"
                        fill={isActive ? "#000" : "#a1a1aa"}
                        style={{ transition: "fill 0.3s", pointerEvents: "none", userSelect: "none" }}
                      >
                        {item.hour}
                      </text>
                    </g>
                  );
                })}

                {/* Center dot */}
                <circle cx={CX} cy={CY} r={7} fill="#f39c12" style={{ filter: "drop-shadow(0 0 5px #f39c12)" }} />

                {/* Clock hand */}
                <line
                  x1={CX}
                  y1={CY}
                  x2={CX + (RADIUS - 28) * Math.cos((handAngle * Math.PI) / 180 - Math.PI / 2)}
                  y2={CY + (RADIUS - 28) * Math.sin((handAngle * Math.PI) / 180 - Math.PI / 2)}
                  stroke="#ef4444"
                  strokeWidth={3}
                  strokeLinecap="round"
                  style={{ transition: "x2 0.6s cubic-bezier(0.175,0.885,0.32,1.275), y2 0.6s cubic-bezier(0.175,0.885,0.32,1.275)" }}
                />
              </svg>
            </div>

            {/* Status card */}
            <div
              className="w-full max-w-xs p-4 rounded-xl border border-zinc-800 bg-zinc-900/60 text-center"
              dir={active.rtl ? "rtl" : "ltr"}
            >
              <p className="text-zinc-300 text-sm leading-relaxed transition-all duration-300">{t.status}</p>
            </div>
          </div>

          {/* Language list */}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-3">
              24 языка · 24 часа
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {LANGUAGES_24.map((item) => {
                const isActive = item.hour === activeHour;
                return (
                  <button
                    key={item.hour}
                    onClick={() => setActiveHour(item.hour)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-md text-left text-xs transition-all duration-200 border ${
                      isActive
                        ? "bg-amber-500/15 border-amber-500/50 text-amber-400 font-semibold"
                        : "bg-zinc-900/40 border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
                    }`}
                  >
                    <span className="font-mono text-[10px] text-muted-foreground w-5 shrink-0">{item.hour}</span>
                    <span className="truncate">{item.label}</span>
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
