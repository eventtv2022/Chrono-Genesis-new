import { useEffect } from "react";
import { X } from "lucide-react";

// ── Document content ──────────────────────────────────────────────────────────

const TOS_SECTIONS = [
  {
    title: "1. Общие положения",
    items: [
      "1.1. Настоящее Соглашение определяет условия использования экосистемы, цифровой платформы и веб-приложения TimeNation (далее — «Платформа»).",
      "1.2. TimeNation является экстерриториальной децентрализованной цифровой экосистемой (DAO). Статус «Гражданин TimeNation» и «Цифровой Паспорт» являются исключительно внутренними идентификаторами участника платформы и не являются государственным гражданством или официальным удостоверением личности в понимании международного права.",
    ],
  },
  {
    title: "2. Статус активов и «Дарминов» (Darmīn)",
    items: [
      "2.1. Внутренний учетный элемент «Дармин» (Darmīn) представляет собой утилитарные цифровые баллы активности / единицы ценности времени внутри экосистемы.",
      "2.2. Дармины не являются государственными денежными средствами, ценными бумагами, платежной валютой или финансовым инструментом.",
      "2.3. Пользователь осознает, что любые P2P-операции, Escrow-сделки и операции с токенами осуществляются им добровольно под собственную ответственность.",
    ],
  },
  {
    title: "3. Волеизъявление и Canvas-подпись",
    items: [
      "3.1. Оставляя графическую подпись (Canvas-росчерк) при заполнении анкеты Паспорта, Пользователь выражает своё прямое волеизъявление, подтверждает принятие настоящих Условий и Конституции TimeNation.",
      "3.2. Canvas-подпись признаётся Простой Электронной Подписью (ПЭП) Пользователя внутри платформы.",
    ],
  },
  {
    title: "4. Права и обязанности Пользователя",
    items: [
      "4.1. Пользователь обязуется указывать достоверные данные для связи (минимум 2 верифицированные координаты: Telegram ID + Email/Телефон).",
      "4.2. Запрещается использование Платформы для спама, мошенничества, распространения вредоносного контента и системных злоупотреблений.",
    ],
  },
  {
    title: "5. Ограничение ответственности",
    items: [
      "5.1. Администрация Платформы предоставляет функционал по принципу «как есть» (As Is).",
      "5.2. Платформа не несёт ответственности за технические сбои в сторонних блокчейн-сетях (TON/TRON) или мессенджере Telegram.",
    ],
  },
];

const PRIVACY_SECTIONS = [
  {
    title: "1. Контролёр данных",
    items: [
      "Оператором персональных данных является администрация платформы TimeNation (далее — «Оператор»).",
    ],
  },
  {
    title: "2. Какие данные мы собираем",
    items: [
      "ФИО, псевдоним, дата рождения — для формирования Цифрового Паспорта (ICAO Doc 9303).",
      "Фотография гражданина — для персонализации паспорта и Реестра.",
      "Telegram ID, номер телефона, e-mail — для верификации личности и связи.",
      "Canvas-подпись — как электронное подтверждение принятия Конституции.",
    ],
  },
  {
    title: "3. Цели обработки",
    items: [
      "Выпуск и хранение Цифрового Паспорта гражданина TimeNation.",
      "Обеспечение функционирования P2P-экономики, аукционов и сделок внутри платформы.",
      "Уведомления и служебная коммуникация через Telegram и e-mail.",
    ],
  },
  {
    title: "4. Правовое основание",
    items: [
      "Обработка осуществляется на основании добровольного согласия Пользователя (ст. 6(1)(a) GDPR, ст. 9 Федерального закона № 152-ФЗ).",
    ],
  },
  {
    title: "5. Хранение и защита",
    items: [
      "Фотографии хранятся в защищённом хранилище (Secure Vault), недоступном напрямую из интернета.",
      "Персональные данные (e-mail, ФИО) хранятся в зашифрованном виде.",
      "Платформа не передаёт данные третьим лицам без явного согласия Пользователя.",
    ],
  },
  {
    title: "6. Права Пользователя (GDPR / 152-ФЗ)",
    items: [
      "Право на доступ, исправление и удаление своих данных.",
      "Право на отзыв согласия в любой момент — направьте запрос через Telegram-бот платформы.",
      "Право на перенос данных (data portability).",
    ],
  },
  {
    title: "7. Cookies",
    items: [
      "Платформа использует только технически необходимые cookies (сессия, аутентификация). Аналитические или рекламные cookies не применяются.",
    ],
  },
];

// ── Types ─────────────────────────────────────────────────────────────────────

export type LegalDocType = "tos" | "privacy";

interface Section { title: string; items: string[]; }

interface LegalModalProps {
  doc: LegalDocType;
  onClose: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function LegalModal({ doc, onClose }: LegalModalProps) {
  const isTos = doc === "tos";
  const title = isTos
    ? "📜 Условия использования TimeNation"
    : "🔒 Политика конфиденциальности и обработка персональных данных";
  const subtitle = isTos
    ? "Terms of Service — версия 1.0, 2025"
    : "Privacy Policy · GDPR / 152-ФЗ — версия 1.0, 2025";
  const sections: Section[] = isTos ? TOS_SECTIONS : PRIVACY_SECTIONS;

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-2xl bg-card border border-border rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-5 pb-3 border-b border-border flex-shrink-0">
          <div>
            <h2 className="font-bold text-foreground text-base leading-tight">{title}</h2>
            <p className="text-[11px] text-muted-foreground font-mono mt-0.5">{subtitle}</p>
          </div>
          <button
            onClick={onClose}
            className="ml-3 mt-0.5 text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
            aria-label="Закрыть"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">
          {sections.map(section => (
            <div key={section.title}>
              <h3 className="text-xs font-bold text-primary uppercase tracking-wide mb-2">
                {section.title}
              </h3>
              <ul className="space-y-1.5">
                {section.items.map((item, i) => (
                  <li key={i} className="text-xs text-muted-foreground font-mono leading-relaxed">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-border flex-shrink-0">
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-colors"
          >
            Понятно, закрыть
          </button>
        </div>
      </div>
    </div>
  );
}
