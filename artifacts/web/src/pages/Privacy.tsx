import { useState, useEffect, useRef } from "react";
import { CookieConsent } from "@/components/CookieConsent";
import { AnthemButton } from "@/components/AnthemPlayer";

// ── Types ──────────────────────────────────────────────────────────────────────
export type PrivacyLangCode =
  | "en" | "ru" | "kk" | "tr" | "es" | "de" | "fr" | "it" | "pt" | "zh"
  | "ja" | "ko" | "ar" | "hi" | "nl" | "pl" | "sv" | "uk" | "cs" | "hu"
  | "ro" | "el" | "vi" | "id";

interface PolicySection {
  id: string;
  title: string;
  paragraphs: string[];
}

interface LocaleData {
  sections: PolicySection[];
}

// ── Language metadata ──────────────────────────────────────────────────────────
const LANG_NAMES: Record<PrivacyLangCode, string> = {
  en: "English", ru: "Русский", kk: "Қазақша", tr: "Türkçe", es: "Español",
  de: "Deutsch", fr: "Français", it: "Italiano", pt: "Português", zh: "中文",
  ja: "日本語", ko: "한국어", ar: "العربية", hi: "हिन्दी", nl: "Nederlands",
  pl: "Polski", sv: "Svenska", uk: "Українська", cs: "Čeština", hu: "Magyar",
  ro: "Română", el: "Ελληνικά", vi: "Tiếng Việt", id: "Bahasa Indonesia",
};

const RTL: PrivacyLangCode[] = ["ar"];

// ── UI chrome strings (24 languages) ──────────────────────────────────────────
const UI: Record<PrivacyLangCode, {
  page_title: string; page_subtitle: string; last_updated: string;
  lang_select: string; toc_title: string; back_to_top: string; loading: string;
  delete_title: string; delete_body: string; delete_email_label: string;
  delete_note: string; delete_btn: string; delete_mobile_note: string;
  cookie_title: string; cookie_body: string; cookie_accept: string;
  cookie_decline: string; cookie_settings: string; cookie_necessary: string;
  cookie_analytics: string; cookie_marketing: string; cookie_save: string;
}> = {
  en: {
    page_title: "Privacy Policy", page_subtitle: "TimeNation — Digital State",
    last_updated: "Last updated: July 26, 2026", lang_select: "Language",
    toc_title: "Table of Contents", back_to_top: "Back to top", loading: "Loading…",
    delete_title: "Account & Data Deletion",
    delete_body: "You may request full deletion of your account and all associated data at any time. After confirmation, your data will be deleted within 30 days.",
    delete_email_label: "Email us at:", delete_note: "Please include your username or email address, reason for deletion, and confirmation text (\"I request deletion of my account\").",
    delete_btn: "Send deletion request", delete_mobile_note: "In the mobile app: Settings → Account → Delete Account.",
    cookie_title: "We use cookies", cookie_body: "We use cookies to ensure our website works properly and to improve your experience. You can accept all, decline optional cookies, or configure them manually.",
    cookie_accept: "Accept all", cookie_decline: "Necessary only", cookie_settings: "Customize",
    cookie_necessary: "Necessary (always active)", cookie_analytics: "Analytics", cookie_marketing: "Marketing", cookie_save: "Save preferences",
  },
  ru: {
    page_title: "Политика конфиденциальности", page_subtitle: "TimeNation — цифровое государство",
    last_updated: "Последнее обновление: 26 июля 2026 г.", lang_select: "Язык",
    toc_title: "Содержание", back_to_top: "Наверх", loading: "Загрузка…",
    delete_title: "Удаление аккаунта и данных",
    delete_body: "Вы можете запросить полное удаление своего аккаунта и всех связанных данных в любое время. После подтверждения данные будут удалены в течение 30 дней.",
    delete_email_label: "Напишите нам:", delete_note: "Укажите в письме: ваш никнейм или e-mail, причину удаления и подтверждение («Прошу удалить мой аккаунт»).",
    delete_btn: "Написать запрос на удаление", delete_mobile_note: "В мобильном приложении: Настройки → Аккаунт → Удалить аккаунт.",
    cookie_title: "Мы используем файлы cookie", cookie_body: "Для корректной работы сайта и улучшения вашего опыта мы используем файлы cookie.",
    cookie_accept: "Принять все", cookie_decline: "Только необходимые", cookie_settings: "Настроить",
    cookie_necessary: "Необходимые (всегда активны)", cookie_analytics: "Аналитика", cookie_marketing: "Маркетинг", cookie_save: "Сохранить настройки",
  },
  kk: {
    page_title: "Құпиялылық саясаты", page_subtitle: "TimeNation — цифрлық мемлекет",
    last_updated: "Соңғы жаңарту: 2026 жылғы 26 шілде", lang_select: "Тіл",
    toc_title: "Мазмұны", back_to_top: "Жоғарыға", loading: "Жүктелуде…",
    delete_title: "Аккаунт пен деректерді жою",
    delete_body: "Кез келген уақытта аккаунтыңызды және барлық байланысты деректерді жоюды сұрауға болады.",
    delete_email_label: "Бізге жазыңыз:", delete_note: "Пайдаланушы атыңызды немесе email-іңізді, жою себебін және растау мәтінін көрсетіңіз.",
    delete_btn: "Жою сұрауын жіберу", delete_mobile_note: "Мобильді қосымшада: Параметрлер → Аккаунт → Аккаунтты жою.",
    cookie_title: "Біз cookie файлдарын пайдаланамыз", cookie_body: "Сайттың дұрыс жұмыс істеуін қамтамасыз ету үшін cookie файлдарын пайдаланамыз.",
    cookie_accept: "Барлығын қабылдау", cookie_decline: "Тек қажеттілер", cookie_settings: "Баптау",
    cookie_necessary: "Қажетті (әрқашан белсенді)", cookie_analytics: "Аналитика", cookie_marketing: "Маркетинг", cookie_save: "Параметрлерді сақтау",
  },
  tr: {
    page_title: "Gizlilik Politikası", page_subtitle: "TimeNation — Dijital Devlet",
    last_updated: "Son güncelleme: 26 Temmuz 2026", lang_select: "Dil",
    toc_title: "İçindekiler", back_to_top: "Yukarı dön", loading: "Yükleniyor…",
    delete_title: "Hesap ve Veri Silme", delete_body: "Hesabınızın ve tüm ilgili verilerin silinmesini istediğiniz zaman talep edebilirsiniz.",
    delete_email_label: "Bize e-posta gönderin:", delete_note: "Kullanıcı adınızı veya e-postanızı, silme nedeninizi ve onay metnini belirtin.",
    delete_btn: "Silme talebi gönder", delete_mobile_note: "Mobil uygulamada: Ayarlar → Hesap → Hesabı Sil.",
    cookie_title: "Çerez kullanıyoruz", cookie_body: "Web sitesinin düzgün çalışmasını sağlamak için çerezler kullanıyoruz.",
    cookie_accept: "Tümünü kabul et", cookie_decline: "Yalnızca zorunlu", cookie_settings: "Özelleştir",
    cookie_necessary: "Zorunlu (her zaman aktif)", cookie_analytics: "Analitik", cookie_marketing: "Pazarlama", cookie_save: "Tercihleri kaydet",
  },
  es: {
    page_title: "Política de Privacidad", page_subtitle: "TimeNation — Estado Digital",
    last_updated: "Última actualización: 26 de julio de 2026", lang_select: "Idioma",
    toc_title: "Tabla de contenidos", back_to_top: "Volver arriba", loading: "Cargando…",
    delete_title: "Eliminación de cuenta y datos", delete_body: "Puede solicitar la eliminación completa de su cuenta y todos los datos asociados en cualquier momento.",
    delete_email_label: "Escríbanos a:", delete_note: "Indique su nombre de usuario o email, motivo de eliminación y texto de confirmación.",
    delete_btn: "Enviar solicitud de eliminación", delete_mobile_note: "En la app móvil: Ajustes → Cuenta → Eliminar cuenta.",
    cookie_title: "Usamos cookies", cookie_body: "Utilizamos cookies para garantizar el correcto funcionamiento del sitio web.",
    cookie_accept: "Aceptar todas", cookie_decline: "Solo necesarias", cookie_settings: "Personalizar",
    cookie_necessary: "Necesarias (siempre activas)", cookie_analytics: "Analíticas", cookie_marketing: "Marketing", cookie_save: "Guardar preferencias",
  },
  de: {
    page_title: "Datenschutzerklärung", page_subtitle: "TimeNation — Digitaler Staat",
    last_updated: "Zuletzt aktualisiert: 26. Juli 2026", lang_select: "Sprache",
    toc_title: "Inhaltsverzeichnis", back_to_top: "Nach oben", loading: "Laden…",
    delete_title: "Konto und Daten löschen", delete_body: "Sie können jederzeit die vollständige Löschung Ihres Kontos und aller zugehörigen Daten beantragen.",
    delete_email_label: "Schreiben Sie uns:", delete_note: "Bitte geben Sie Ihren Benutzernamen oder Ihre E-Mail-Adresse, den Löschungsgrund und einen Bestätigungstext an.",
    delete_btn: "Löschungsantrag senden", delete_mobile_note: "In der mobilen App: Einstellungen → Konto → Konto löschen.",
    cookie_title: "Wir verwenden Cookies", cookie_body: "Wir verwenden Cookies, um den reibungslosen Betrieb der Website zu gewährleisten.",
    cookie_accept: "Alle akzeptieren", cookie_decline: "Nur notwendige", cookie_settings: "Anpassen",
    cookie_necessary: "Notwendig (immer aktiv)", cookie_analytics: "Analytisch", cookie_marketing: "Marketing", cookie_save: "Einstellungen speichern",
  },
  fr: {
    page_title: "Politique de confidentialité", page_subtitle: "TimeNation — État numérique",
    last_updated: "Dernière mise à jour : 26 juillet 2026", lang_select: "Langue",
    toc_title: "Table des matières", back_to_top: "Haut de page", loading: "Chargement…",
    delete_title: "Suppression du compte et des données", delete_body: "Vous pouvez demander la suppression complète de votre compte et de toutes les données associées à tout moment.",
    delete_email_label: "Écrivez-nous à :", delete_note: "Indiquez votre nom d'utilisateur ou e-mail, la raison de la suppression et un texte de confirmation.",
    delete_btn: "Envoyer une demande de suppression", delete_mobile_note: "Dans l'application mobile : Paramètres → Compte → Supprimer le compte.",
    cookie_title: "Nous utilisons des cookies", cookie_body: "Nous utilisons des cookies pour assurer le bon fonctionnement du site.",
    cookie_accept: "Tout accepter", cookie_decline: "Nécessaires uniquement", cookie_settings: "Personnaliser",
    cookie_necessary: "Nécessaires (toujours actifs)", cookie_analytics: "Analytiques", cookie_marketing: "Marketing", cookie_save: "Enregistrer les préférences",
  },
  it: {
    page_title: "Informativa sulla Privacy", page_subtitle: "TimeNation — Stato Digitale",
    last_updated: "Ultimo aggiornamento: 26 luglio 2026", lang_select: "Lingua",
    toc_title: "Indice", back_to_top: "Torna su", loading: "Caricamento…",
    delete_title: "Cancellazione account e dati", delete_body: "Puoi richiedere la cancellazione completa del tuo account e di tutti i dati associati in qualsiasi momento.",
    delete_email_label: "Scrivici a:", delete_note: "Indica il tuo nome utente o email, il motivo della cancellazione e un testo di conferma.",
    delete_btn: "Invia richiesta di cancellazione", delete_mobile_note: "Nell'app mobile: Impostazioni → Account → Elimina account.",
    cookie_title: "Utilizziamo i cookie", cookie_body: "Utilizziamo i cookie per garantire il corretto funzionamento del sito.",
    cookie_accept: "Accetta tutti", cookie_decline: "Solo necessari", cookie_settings: "Personalizza",
    cookie_necessary: "Necessari (sempre attivi)", cookie_analytics: "Analitici", cookie_marketing: "Marketing", cookie_save: "Salva preferenze",
  },
  pt: {
    page_title: "Política de Privacidade", page_subtitle: "TimeNation — Estado Digital",
    last_updated: "Última atualização: 26 de julho de 2026", lang_select: "Idioma",
    toc_title: "Índice", back_to_top: "Voltar ao topo", loading: "A carregar…",
    delete_title: "Eliminação de conta e dados", delete_body: "Pode solicitar a eliminação completa da sua conta e de todos os dados associados a qualquer momento.",
    delete_email_label: "Escreva-nos para:", delete_note: "Indique o seu nome de utilizador ou e-mail, motivo de eliminação e texto de confirmação.",
    delete_btn: "Enviar pedido de eliminação", delete_mobile_note: "Na app móvel: Definições → Conta → Eliminar conta.",
    cookie_title: "Utilizamos cookies", cookie_body: "Utilizamos cookies para garantir o correto funcionamento do site.",
    cookie_accept: "Aceitar todos", cookie_decline: "Apenas necessários", cookie_settings: "Personalizar",
    cookie_necessary: "Necessários (sempre ativos)", cookie_analytics: "Analíticos", cookie_marketing: "Marketing", cookie_save: "Guardar preferências",
  },
  zh: {
    page_title: "隐私政策", page_subtitle: "TimeNation — 数字国家",
    last_updated: "最后更新：2026年7月26日", lang_select: "语言",
    toc_title: "目录", back_to_top: "返回顶部", loading: "加载中…",
    delete_title: "账户与数据删除", delete_body: "您可随时请求删除您的账户及所有相关数据。确认后，数据将在30天内删除。",
    delete_email_label: "发送邮件至：", delete_note: "请在邮件中注明：您的用户名或邮箱、删除原因及确认语句。",
    delete_btn: "发送删除请求", delete_mobile_note: "在移动应用中：设置 → 账户 → 删除账户。",
    cookie_title: "我们使用Cookie", cookie_body: "我们使用Cookie确保网站正常运行并改善您的体验。",
    cookie_accept: "全部接受", cookie_decline: "仅必要", cookie_settings: "自定义",
    cookie_necessary: "必要（始终启用）", cookie_analytics: "分析", cookie_marketing: "营销", cookie_save: "保存设置",
  },
  ja: {
    page_title: "プライバシーポリシー", page_subtitle: "TimeNation — デジタル国家",
    last_updated: "最終更新: 2026年7月26日", lang_select: "言語",
    toc_title: "目次", back_to_top: "トップへ戻る", loading: "読み込み中…",
    delete_title: "アカウントとデータの削除", delete_body: "いつでもアカウントとすべての関連データの完全な削除をリクエストできます。",
    delete_email_label: "メールアドレス:", delete_note: "ユーザー名またはメールアドレス、削除の理由、確認テキストを記載してください。",
    delete_btn: "削除リクエストを送信", delete_mobile_note: "モバイルアプリ: 設定 → アカウント → アカウントを削除。",
    cookie_title: "Cookieを使用しています", cookie_body: "当サイトはCookieを使用してウェブサイトの正常な動作を確保します。",
    cookie_accept: "すべて受け入れる", cookie_decline: "必須のみ", cookie_settings: "カスタマイズ",
    cookie_necessary: "必須（常に有効）", cookie_analytics: "分析", cookie_marketing: "マーケティング", cookie_save: "設定を保存",
  },
  ko: {
    page_title: "개인정보 처리방침", page_subtitle: "TimeNation — 디지털 국가",
    last_updated: "최종 업데이트: 2026년 7월 26일", lang_select: "언어",
    toc_title: "목차", back_to_top: "맨 위로", loading: "로딩 중…",
    delete_title: "계정 및 데이터 삭제", delete_body: "언제든지 계정과 모든 관련 데이터의 완전한 삭제를 요청할 수 있습니다.",
    delete_email_label: "이메일 문의:", delete_note: "사용자 이름 또는 이메일, 삭제 이유 및 확인 텍스트를 포함해 주세요.",
    delete_btn: "삭제 요청 보내기", delete_mobile_note: "모바일 앱에서: 설정 → 계정 → 계정 삭제.",
    cookie_title: "쿠키를 사용합니다", cookie_body: "웹사이트가 올바르게 작동하고 귀하의 경험을 개선하기 위해 쿠키를 사용합니다.",
    cookie_accept: "모두 수락", cookie_decline: "필수만", cookie_settings: "사용자 지정",
    cookie_necessary: "필수 (항상 활성)", cookie_analytics: "분석", cookie_marketing: "마케팅", cookie_save: "기본 설정 저장",
  },
  ar: {
    page_title: "سياسة الخصوصية", page_subtitle: "TimeNation — الدولة الرقمية",
    last_updated: "آخر تحديث: 26 يوليو 2026", lang_select: "اللغة",
    toc_title: "جدول المحتويات", back_to_top: "العودة للأعلى", loading: "جارٍ التحميل…",
    delete_title: "حذف الحساب والبيانات", delete_body: "يمكنك طلب حذف حسابك وجميع البيانات المرتبطة به في أي وقت.",
    delete_email_label: "راسلنا على:", delete_note: "يرجى تضمين اسم المستخدم أو البريد الإلكتروني وسبب الحذف ونص التأكيد.",
    delete_btn: "إرسال طلب الحذف", delete_mobile_note: "في التطبيق: الإعدادات ← الحساب ← حذف الحساب.",
    cookie_title: "نستخدم ملفات تعريف الارتباط", cookie_body: "نستخدم ملفات تعريف الارتباط لضمان عمل الموقع بشكل صحيح.",
    cookie_accept: "قبول الكل", cookie_decline: "الضرورية فقط", cookie_settings: "تخصيص",
    cookie_necessary: "ضرورية (نشطة دائمًا)", cookie_analytics: "التحليلات", cookie_marketing: "التسويق", cookie_save: "حفظ التفضيلات",
  },
  hi: {
    page_title: "गोपनीयता नीति", page_subtitle: "TimeNation — डिजिटल राज्य",
    last_updated: "अंतिम अद्यतन: 26 जुलाई 2026", lang_select: "भाषा",
    toc_title: "विषय-सूची", back_to_top: "ऊपर जाएं", loading: "लोड हो रहा है…",
    delete_title: "खाता और डेटा हटाना", delete_body: "आप किसी भी समय अपना खाता और सभी संबंधित डेटा हटाने का अनुरोध कर सकते हैं।",
    delete_email_label: "हमें ईमेल करें:", delete_note: "कृपया अपना उपयोगकर्ता नाम या ईमेल, हटाने का कारण और पुष्टि पाठ शामिल करें।",
    delete_btn: "हटाने का अनुरोध भेजें", delete_mobile_note: "मोबाइल ऐप में: सेटिंग → खाता → खाता हटाएं।",
    cookie_title: "हम कुकी का उपयोग करते हैं", cookie_body: "वेबसाइट सुचारू रूप से चलाने के लिए हम कुकी का उपयोग करते हैं।",
    cookie_accept: "सब स्वीकार करें", cookie_decline: "केवल आवश्यक", cookie_settings: "कस्टमाइज़ करें",
    cookie_necessary: "आवश्यक (सर्वदा सक्रिय)", cookie_analytics: "विश्लेषण", cookie_marketing: "मार्केटिंग", cookie_save: "सेटिंग सहेजें",
  },
  nl: {
    page_title: "Privacybeleid", page_subtitle: "TimeNation — Digitale Staat",
    last_updated: "Laatste update: 26 juli 2026", lang_select: "Taal",
    toc_title: "Inhoudsopgave", back_to_top: "Terug naar boven", loading: "Laden…",
    delete_title: "Account en gegevens verwijderen", delete_body: "U kunt op elk moment verzoeken om volledige verwijdering van uw account en alle bijbehorende gegevens.",
    delete_email_label: "Stuur ons een e-mail:", delete_note: "Vermeld uw gebruikersnaam of e-mailadres, reden voor verwijdering en bevestigingstekst.",
    delete_btn: "Verwijderingsverzoek sturen", delete_mobile_note: "In de mobiele app: Instellingen → Account → Account verwijderen.",
    cookie_title: "Wij gebruiken cookies", cookie_body: "We gebruiken cookies om de goede werking van de website te garanderen.",
    cookie_accept: "Alles accepteren", cookie_decline: "Alleen noodzakelijke", cookie_settings: "Aanpassen",
    cookie_necessary: "Noodzakelijk (altijd actief)", cookie_analytics: "Analytisch", cookie_marketing: "Marketing", cookie_save: "Voorkeuren opslaan",
  },
  pl: {
    page_title: "Polityka Prywatności", page_subtitle: "TimeNation — Państwo Cyfrowe",
    last_updated: "Ostatnia aktualizacja: 26 lipca 2026", lang_select: "Język",
    toc_title: "Spis treści", back_to_top: "Na górę", loading: "Ładowanie…",
    delete_title: "Usunięcie konta i danych", delete_body: "Możesz w każdej chwili poprosić o całkowite usunięcie swojego konta i wszystkich powiązanych danych.",
    delete_email_label: "Napisz do nas:", delete_note: "Podaj swoją nazwę użytkownika lub adres e-mail, powód usunięcia i tekst potwierdzający.",
    delete_btn: "Wyślij prośbę o usunięcie", delete_mobile_note: "W aplikacji mobilnej: Ustawienia → Konto → Usuń konto.",
    cookie_title: "Używamy plików cookie", cookie_body: "Używamy plików cookie, aby zapewnić prawidłowe działanie strony.",
    cookie_accept: "Akceptuj wszystkie", cookie_decline: "Tylko niezbędne", cookie_settings: "Dostosuj",
    cookie_necessary: "Niezbędne (zawsze aktywne)", cookie_analytics: "Analityczne", cookie_marketing: "Marketingowe", cookie_save: "Zapisz preferencje",
  },
  sv: {
    page_title: "Integritetspolicy", page_subtitle: "TimeNation — Digitalt tillstånd",
    last_updated: "Senast uppdaterad: 26 juli 2026", lang_select: "Språk",
    toc_title: "Innehållsförteckning", back_to_top: "Tillbaka till toppen", loading: "Laddar…",
    delete_title: "Radering av konto och data", delete_body: "Du kan när som helst begära fullständig radering av ditt konto och alla tillhörande uppgifter.",
    delete_email_label: "Mejla oss:", delete_note: "Ange ditt användarnamn eller e-post, anledning till radering och bekräftelsetext.",
    delete_btn: "Skicka raderingsbegäran", delete_mobile_note: "I mobilappen: Inställningar → Konto → Ta bort konto.",
    cookie_title: "Vi använder kakor", cookie_body: "Vi använder kakor för att säkerställa att webbplatsen fungerar korrekt.",
    cookie_accept: "Acceptera alla", cookie_decline: "Endast nödvändiga", cookie_settings: "Anpassa",
    cookie_necessary: "Nödvändiga (alltid aktiva)", cookie_analytics: "Analytiska", cookie_marketing: "Marknadsföring", cookie_save: "Spara inställningar",
  },
  uk: {
    page_title: "Політика конфіденційності", page_subtitle: "TimeNation — Цифрова держава",
    last_updated: "Останнє оновлення: 26 липня 2026 р.", lang_select: "Мова",
    toc_title: "Зміст", back_to_top: "Нагору", loading: "Завантаження…",
    delete_title: "Видалення акаунта та даних", delete_body: "Ви можете в будь-який момент запросити повне видалення свого акаунта та всіх пов'язаних даних.",
    delete_email_label: "Напишіть нам:", delete_note: "Вкажіть у листі: ваш нікнейм або e-mail, причину видалення та підтвердження.",
    delete_btn: "Надіслати запит на видалення", delete_mobile_note: "У мобільному застосунку: Налаштування → Акаунт → Видалити акаунт.",
    cookie_title: "Ми використовуємо файли cookie", cookie_body: "Для коректної роботи сайту ми використовуємо файли cookie.",
    cookie_accept: "Прийняти всі", cookie_decline: "Лише необхідні", cookie_settings: "Налаштувати",
    cookie_necessary: "Необхідні (завжди активні)", cookie_analytics: "Аналітика", cookie_marketing: "Маркетинг", cookie_save: "Зберегти налаштування",
  },
  cs: {
    page_title: "Zásady ochrany osobních údajů", page_subtitle: "TimeNation — Digitální stát",
    last_updated: "Poslední aktualizace: 26. července 2026", lang_select: "Jazyk",
    toc_title: "Obsah", back_to_top: "Nahoru", loading: "Načítání…",
    delete_title: "Smazání účtu a dat", delete_body: "Kdykoli můžete požádat o úplné smazání svého účtu a všech přidružených dat.",
    delete_email_label: "Napište nám:", delete_note: "Uveďte své uživatelské jméno nebo e-mail, důvod smazání a potvrzující text.",
    delete_btn: "Odeslat žádost o smazání", delete_mobile_note: "V mobilní aplikaci: Nastavení → Účet → Smazat účet.",
    cookie_title: "Používáme soubory cookie", cookie_body: "Soubory cookie používáme k zajištění správného fungování webu.",
    cookie_accept: "Přijmout vše", cookie_decline: "Pouze nezbytné", cookie_settings: "Přizpůsobit",
    cookie_necessary: "Nezbytné (vždy aktivní)", cookie_analytics: "Analytické", cookie_marketing: "Marketingové", cookie_save: "Uložit předvolby",
  },
  hu: {
    page_title: "Adatvédelmi szabályzat", page_subtitle: "TimeNation — Digitális állam",
    last_updated: "Utolsó frissítés: 2026. július 26.", lang_select: "Nyelv",
    toc_title: "Tartalomjegyzék", back_to_top: "Vissza a tetejére", loading: "Betöltés…",
    delete_title: "Fiók és adatok törlése", delete_body: "Bármikor kérheti fiókja és az összes kapcsolódó adat teljes törlését.",
    delete_email_label: "Írjon nekünk:", delete_note: "Adja meg felhasználónevét vagy e-mail-címét, a törlés okát és a megerősítő szöveget.",
    delete_btn: "Törlési kérelem küldése", delete_mobile_note: "A mobilalkalmazásban: Beállítások → Fiók → Fiók törlése.",
    cookie_title: "Sütiket használunk", cookie_body: "Sütiket használunk a weboldal megfelelő működésének biztosításához.",
    cookie_accept: "Összes elfogadása", cookie_decline: "Csak szükségesek", cookie_settings: "Testreszabás",
    cookie_necessary: "Szükséges (mindig aktív)", cookie_analytics: "Analitikai", cookie_marketing: "Marketing", cookie_save: "Beállítások mentése",
  },
  ro: {
    page_title: "Politică de confidențialitate", page_subtitle: "TimeNation — Stat Digital",
    last_updated: "Ultima actualizare: 26 iulie 2026", lang_select: "Limbă",
    toc_title: "Cuprins", back_to_top: "Înapoi sus", loading: "Se încarcă…",
    delete_title: "Ștergerea contului și datelor", delete_body: "Puteți solicita ștergerea completă a contului și a tuturor datelor asociate oricând.",
    delete_email_label: "Trimiteți-ne un e-mail:", delete_note: "Indicați numele de utilizator sau e-mailul, motivul ștergerii și textul de confirmare.",
    delete_btn: "Trimiteți solicitarea de ștergere", delete_mobile_note: "În aplicația mobilă: Setări → Cont → Șterge contul.",
    cookie_title: "Folosim cookie-uri", cookie_body: "Folosim cookie-uri pentru a asigura funcționarea corectă a site-ului.",
    cookie_accept: "Acceptați toate", cookie_decline: "Doar necesare", cookie_settings: "Personalizați",
    cookie_necessary: "Necesare (întotdeauna active)", cookie_analytics: "Analitice", cookie_marketing: "Marketing", cookie_save: "Salvați preferințele",
  },
  el: {
    page_title: "Πολιτική Απορρήτου", page_subtitle: "TimeNation — Ψηφιακό Κράτος",
    last_updated: "Τελευταία ενημέρωση: 26 Ιουλίου 2026", lang_select: "Γλώσσα",
    toc_title: "Πίνακας Περιεχομένων", back_to_top: "Πίσω στην κορυφή", loading: "Φόρτωση…",
    delete_title: "Διαγραφή λογαριασμού και δεδομένων", delete_body: "Μπορείτε να ζητήσετε πλήρη διαγραφή του λογαριασμού και όλων των σχετικών δεδομένων ανά πάσα στιγμή.",
    delete_email_label: "Στείλτε μας email:", delete_note: "Αναφέρετε το όνομα χρήστη ή email, τον λόγο διαγραφής και κείμενο επιβεβαίωσης.",
    delete_btn: "Αποστολή αιτήματος διαγραφής", delete_mobile_note: "Στην εφαρμογή για κινητά: Ρυθμίσεις → Λογαριασμός → Διαγραφή λογαριασμού.",
    cookie_title: "Χρησιμοποιούμε cookies", cookie_body: "Χρησιμοποιούμε cookies για τη σωστή λειτουργία της ιστοσελίδας.",
    cookie_accept: "Αποδοχή όλων", cookie_decline: "Μόνο απαραίτητα", cookie_settings: "Προσαρμογή",
    cookie_necessary: "Απαραίτητα (πάντα ενεργά)", cookie_analytics: "Αναλυτικά", cookie_marketing: "Μάρκετινγκ", cookie_save: "Αποθήκευση προτιμήσεων",
  },
  vi: {
    page_title: "Chính sách Bảo mật", page_subtitle: "TimeNation — Nhà nước Kỹ thuật số",
    last_updated: "Cập nhật lần cuối: 26 tháng 7, 2026", lang_select: "Ngôn ngữ",
    toc_title: "Mục lục", back_to_top: "Lên đầu trang", loading: "Đang tải…",
    delete_title: "Xóa tài khoản và dữ liệu", delete_body: "Bạn có thể yêu cầu xóa hoàn toàn tài khoản và tất cả dữ liệu liên quan bất kỳ lúc nào.",
    delete_email_label: "Gửi email cho chúng tôi:", delete_note: "Vui lòng ghi rõ tên người dùng hoặc email, lý do xóa và văn bản xác nhận.",
    delete_btn: "Gửi yêu cầu xóa", delete_mobile_note: "Trong ứng dụng di động: Cài đặt → Tài khoản → Xóa tài khoản.",
    cookie_title: "Chúng tôi sử dụng cookie", cookie_body: "Chúng tôi sử dụng cookie để đảm bảo trang web hoạt động bình thường.",
    cookie_accept: "Chấp nhận tất cả", cookie_decline: "Chỉ cần thiết", cookie_settings: "Tùy chỉnh",
    cookie_necessary: "Cần thiết (luôn hoạt động)", cookie_analytics: "Phân tích", cookie_marketing: "Tiếp thị", cookie_save: "Lưu tùy chọn",
  },
  id: {
    page_title: "Kebijakan Privasi", page_subtitle: "TimeNation — Negara Digital",
    last_updated: "Terakhir diperbarui: 26 Juli 2026", lang_select: "Bahasa",
    toc_title: "Daftar Isi", back_to_top: "Kembali ke atas", loading: "Memuat…",
    delete_title: "Penghapusan Akun dan Data", delete_body: "Anda dapat meminta penghapusan lengkap akun dan semua data terkait kapan saja.",
    delete_email_label: "Email kami di:", delete_note: "Sertakan nama pengguna atau email, alasan penghapusan, dan teks konfirmasi.",
    delete_btn: "Kirim permintaan penghapusan", delete_mobile_note: "Di aplikasi seluler: Pengaturan → Akun → Hapus Akun.",
    cookie_title: "Kami menggunakan cookie", cookie_body: "Kami menggunakan cookie untuk memastikan situs web berfungsi dengan baik.",
    cookie_accept: "Terima semua", cookie_decline: "Hanya yang diperlukan", cookie_settings: "Sesuaikan",
    cookie_necessary: "Diperlukan (selalu aktif)", cookie_analytics: "Analitik", cookie_marketing: "Pemasaran", cookie_save: "Simpan preferensi",
  },
};

const SECTION_IDS = ["general","controller","data","purposes","legal","retention","sharing","rights","security","cookies","contact"];

// ── Detect browser language ────────────────────────────────────────────────────
function detectLang(): PrivacyLangCode {
  const nav = (navigator.language || "en").split("-")[0] as PrivacyLangCode;
  return nav in UI ? nav : "en";
}

// ── Component ──────────────────────────────────────────────────────────────────
export function Privacy() {
  const [lang, setLang] = useState<PrivacyLangCode>(detectLang);
  const [dark, setDark] = useState(true);
  const [content, setContent] = useState<PolicySection[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState("general");
  const topRef = useRef<HTMLDivElement>(null);

  const s = UI[lang];
  const isRtl = RTL.includes(lang);

  // ── Load locale JSON on language change ──────────────────────────────────────
  useEffect(() => {
    setLoading(true);
    fetch(`${import.meta.env.BASE_URL}locales/${lang}/privacy.json`)
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then((data: LocaleData) => { setContent(data.sections); setLoading(false); })
      .catch(() => {
        // fallback to English
        fetch(`${import.meta.env.BASE_URL}locales/en/privacy.json`)
          .then(r => r.json())
          .then((data: LocaleData) => { setContent(data.sections); setLoading(false); })
          .catch(() => setLoading(false));
      });
  }, [lang]);

  // ── Intersection observer for active TOC item ─────────────────────────────
  useEffect(() => {
    const els = SECTION_IDS.map(id => document.getElementById(id)).filter(Boolean);
    const obs = new IntersectionObserver(
      entries => { const v = entries.filter(e => e.isIntersecting); if (v.length) setActiveId(v[0].target.id); },
      { rootMargin: "-20% 0px -70% 0px" }
    );
    els.forEach(el => obs.observe(el!));
    return () => obs.disconnect();
  }, [content]);

  const bg    = dark ? "#0f0f1a" : "#f4f4f8";
  const fg    = dark ? "#e8e8f4" : "#1a1a2e";
  const card  = dark ? "#1a1a2e" : "#ffffff";
  const bdr   = dark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.08)";
  const muted = dark ? "#8080a0" : "#606080";
  const accent = "#6c63ff";

  return (
    <div dir={isRtl ? "rtl" : "ltr"} style={{ minHeight: "100vh", background: bg, color: fg, fontFamily: "'Inter', system-ui, sans-serif", transition: "background .3s,color .3s" }}>
      <div ref={topRef} />

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header style={{ borderBottom: `1px solid ${bdr}`, background: dark ? "rgba(15,15,26,.95)" : "rgba(255,255,255,.95)", backdropFilter: "blur(12px)", position: "sticky", top: 0, zIndex: 100, padding: "0 24px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", height: 60, gap: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <a href="/" style={{ color: accent, fontWeight: 800, fontSize: 18, textDecoration: "none" }}>TimeNation</a>
            <span style={{ color: muted, fontSize: 14 }}>/ {s.page_title}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 12, color: muted }}>{s.lang_select}:</span>
            <select value={lang} onChange={e => setLang(e.target.value as PrivacyLangCode)}
              style={{ background: dark ? "rgba(255,255,255,.08)" : "#f0f0f8", color: fg, border: `1px solid ${bdr}`, borderRadius: 6, padding: "4px 8px", fontSize: 13, cursor: "pointer" }}>
              {(Object.keys(LANG_NAMES) as PrivacyLangCode[]).map(code => (
                <option key={code} value={code}>{LANG_NAMES[code]}</option>
              ))}
            </select>
            <button onClick={() => setDark(d => !d)} title={dark ? "Light mode" : "Dark mode"}
              style={{ background: dark ? "rgba(255,255,255,.08)" : "#e8e8f4", border: "none", borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontSize: 16, color: fg }}>
              {dark ? "☀️" : "🌙"}
            </button>
          </div>
        </div>
      </header>

      {/* ── Hero ────────────────────────────────────────────────────────────── */}
      <div style={{ background: dark ? "linear-gradient(135deg,#0f0f1a,#1a1040 50%,#0f1a2e)" : "linear-gradient(135deg,#f0f0ff,#e8e0ff 50%,#f0f8ff)", padding: "60px 24px 40px", textAlign: "center", borderBottom: `1px solid ${bdr}` }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🔒</div>
        <h1 style={{ margin: "0 0 8px", fontSize: "clamp(24px,4vw,42px)", fontWeight: 800, letterSpacing: "-1px" }}>{s.page_title}</h1>
        <p style={{ margin: "0 0 8px", color: muted, fontSize: 16 }}>{s.page_subtitle}</p>
        <p style={{ margin: 0, color: muted, fontSize: 13 }}>{s.last_updated}</p>
          <div style={{ display: "flex", justifyContent: "center", marginTop: 16 }}>
            <AnthemButton />
          </div>
      </div>

      {/* ── Body ────────────────────────────────────────────────────────────── */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 24px 120px", display: "flex", gap: 40, alignItems: "flex-start" }}>

        {/* Sidebar TOC */}
        <aside className="privacy-toc" style={{ width: 220, flexShrink: 0, position: "sticky", top: 80, display: "none" }}>
          <div style={{ background: card, border: `1px solid ${bdr}`, borderRadius: 12, padding: "16px 0" }}>
            <div style={{ padding: "0 16px 12px", fontWeight: 700, fontSize: 12, color: muted, textTransform: "uppercase", letterSpacing: ".08em" }}>{s.toc_title}</div>
            {content.map((sec, i) => (
              <a key={sec.id} href={`#${SECTION_IDS[i]}`}
                style={{ display: "block", padding: "7px 16px", fontSize: 13, color: activeId === SECTION_IDS[i] ? accent : muted, textDecoration: "none", fontWeight: activeId === SECTION_IDS[i] ? 600 : 400, borderLeft: isRtl ? "none" : `3px solid ${activeId === SECTION_IDS[i] ? accent : "transparent"}`, borderRight: isRtl ? `3px solid ${activeId === SECTION_IDS[i] ? accent : "transparent"}` : "none", transition: "color .2s" }}>
                {sec.title}
              </a>
            ))}
          </div>
        </aside>

        {/* Content */}
        <main style={{ flex: 1, minWidth: 0 }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: "80px 0", color: muted, fontSize: 18 }}>
              <div style={{ fontSize: 40, marginBottom: 16 }}>⏳</div>
              {s.loading}
            </div>
          ) : (
            <>
              {content.map((sec, i) => (
                <section key={sec.id} id={SECTION_IDS[i]}
                  style={{ marginBottom: 36, background: card, border: `1px solid ${bdr}`, borderRadius: 14, padding: "28px 32px", scrollMarginTop: 80 }}>
                  <h2 style={{ margin: "0 0 16px", fontSize: 20, fontWeight: 700, borderBottom: `1px solid ${bdr}`, paddingBottom: 12 }}>{sec.title}</h2>
                  {sec.paragraphs.map((p, j) => (
                    <p key={j} style={{ margin: j === 0 ? 0 : "10px 0 0", lineHeight: 1.75, fontSize: 15, color: j === 0 ? fg : dark ? "#c0c0d8" : "#444466" }}>{p}</p>
                  ))}
                </section>
              ))}

              {/* Deletion card */}
              <section id="deletion" style={{ background: dark ? "rgba(220,80,80,.07)" : "rgba(220,80,80,.04)", border: `1px solid ${dark ? "rgba(220,80,80,.25)" : "rgba(220,80,80,.15)"}`, borderRadius: 14, padding: "28px 32px", marginBottom: 36, scrollMarginTop: 80 }}>
                <h2 style={{ margin: "0 0 12px", fontSize: 20, fontWeight: 700, color: dark ? "#ff8080" : "#cc2020" }}>🗑️ {s.delete_title}</h2>
                <p style={{ margin: "0 0 14px", lineHeight: 1.75, fontSize: 15 }}>{s.delete_body}</p>
                <p style={{ margin: "0 0 8px", fontSize: 14, color: muted }}>{s.delete_note}</p>
                <div style={{ margin: "16px 0 10px", display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 14, color: muted }}>{s.delete_email_label}</span>
                  <a href="mailto:privacy@timenation.info?subject=Account%20deletion%20request" style={{ color: accent, fontWeight: 600, fontSize: 14 }}>privacy@timenation.info</a>
                </div>
                <a href="mailto:privacy@timenation.info?subject=Account%20deletion%20request"
                  style={{ display: "inline-block", marginTop: 8, background: dark ? "rgba(220,80,80,.2)" : "rgba(220,80,80,.1)", color: dark ? "#ff8080" : "#cc2020", border: `1px solid ${dark ? "rgba(220,80,80,.4)" : "rgba(220,80,80,.3)"}`, borderRadius: 8, padding: "10px 20px", fontSize: 14, fontWeight: 600, textDecoration: "none" }}>
                  {s.delete_btn}
                </a>
                <p style={{ margin: "14px 0 0", fontSize: 13, color: muted, fontStyle: "italic" }}>{s.delete_mobile_note}</p>
              </section>

              <div style={{ textAlign: "center" }}>
                <button onClick={() => topRef.current?.scrollIntoView({ behavior: "smooth" })}
                  style={{ background: "transparent", color: accent, border: `1px solid ${accent}`, borderRadius: 8, padding: "10px 24px", fontSize: 14, cursor: "pointer", fontWeight: 600 }}>
                  ↑ {s.back_to_top}
                </button>
              </div>
            </>
          )}
        </main>
      </div>

      <CookieConsent isRtl={isRtl} strings={s} />

      <style>{`@media(min-width:768px){.privacy-toc{display:block!important}}`}</style>
    </div>
  );
}
