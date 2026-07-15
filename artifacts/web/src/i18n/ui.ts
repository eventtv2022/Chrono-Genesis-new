export type LangCode =
  | "ru" | "en" | "zh" | "hi" | "es" | "fr" | "ar" | "bn" | "pt" | "ur"
  | "id" | "de" | "ja" | "tr" | "vi" | "he" | "fa" | "ko" | "it" | "pl"
  | "uk" | "nl" | "kk" | "uz";

export interface UIStrings {
  // Sidebar nav
  nav_dashboard: string;
  nav_tv: string;
  nav_registry: string;
  nav_timeline: string;
  nav_treasury: string;
  nav_become_citizen: string;
  nav_passport: string;
  nav_time: string;
  nav_clock: string;
  // Auth widget
  digital_state: string;
  login_title: string;
  login_placeholder: string;
  login_btn: string;
  logout_btn: string;
  refresh: string;
  citizen_not_found: string;
  connection_error: string;
  // Common
  loading: string;
  cancel: string;
  back: string;
  search: string;
  save: string;
}

export const UI: Record<LangCode, UIStrings> = {
  ru: {
    nav_dashboard: "Дашборд", nav_tv: "TimeNation-TV", nav_registry: "Реестр",
    nav_timeline: "Таймлайн", nav_treasury: "Казначейство", nav_become_citizen: "Стать гражданином",
    nav_passport: "Мой паспорт", nav_time: "Время", nav_clock: "Циферблат народов",
    digital_state: "Цифровое государство", login_title: "Войти", login_placeholder: "ID или псевдоним",
    login_btn: "Войти", logout_btn: "Выйти", refresh: "Обновить",
    citizen_not_found: "Гражданин не найден", connection_error: "Ошибка соединения",
    loading: "Загрузка…", cancel: "Отмена", back: "Назад", search: "Поиск", save: "Сохранить",
  },
  en: {
    nav_dashboard: "Dashboard", nav_tv: "TimeNation-TV", nav_registry: "Registry",
    nav_timeline: "Timeline", nav_treasury: "Treasury", nav_become_citizen: "Become a citizen",
    nav_passport: "My passport", nav_time: "Time", nav_clock: "Clock of Nations",
    digital_state: "Digital State", login_title: "Login", login_placeholder: "ID or nickname",
    login_btn: "Login", logout_btn: "Logout", refresh: "Refresh",
    citizen_not_found: "Citizen not found", connection_error: "Connection error",
    loading: "Loading…", cancel: "Cancel", back: "Back", search: "Search", save: "Save",
  },
  zh: {
    nav_dashboard: "仪表板", nav_tv: "TimeNation-TV", nav_registry: "公民登记",
    nav_timeline: "时间线", nav_treasury: "国库", nav_become_citizen: "成为公民",
    nav_passport: "我的护照", nav_time: "时间", nav_clock: "民族钟",
    digital_state: "数字国家", login_title: "登录", login_placeholder: "ID或昵称",
    login_btn: "登录", logout_btn: "退出", refresh: "刷新",
    citizen_not_found: "未找到公民", connection_error: "连接错误",
    loading: "加载中…", cancel: "取消", back: "返回", search: "搜索", save: "保存",
  },
  hi: {
    nav_dashboard: "डैशबोर्ड", nav_tv: "TimeNation-TV", nav_registry: "रजिस्ट्री",
    nav_timeline: "टाइमलाइन", nav_treasury: "खजाना", nav_become_citizen: "नागरिक बनें",
    nav_passport: "मेरा पासपोर्ट", nav_time: "समय", nav_clock: "राष्ट्रों की घड़ी",
    digital_state: "डिजिटल राज्य", login_title: "लॉगिन", login_placeholder: "ID या उपनाम",
    login_btn: "लॉगिन", logout_btn: "लॉगआउट", refresh: "रिफ्रेश",
    citizen_not_found: "नागरिक नहीं मिला", connection_error: "कनेक्शन त्रुटि",
    loading: "लोड हो रहा है…", cancel: "रद्द", back: "वापस", search: "खोज", save: "सहेजें",
  },
  es: {
    nav_dashboard: "Panel", nav_tv: "TimeNation-TV", nav_registry: "Registro",
    nav_timeline: "Línea de tiempo", nav_treasury: "Tesoro", nav_become_citizen: "Ser ciudadano",
    nav_passport: "Mi pasaporte", nav_time: "Tiempo", nav_clock: "Reloj de naciones",
    digital_state: "Estado digital", login_title: "Entrar", login_placeholder: "ID o apodo",
    login_btn: "Entrar", logout_btn: "Salir", refresh: "Actualizar",
    citizen_not_found: "Ciudadano no encontrado", connection_error: "Error de conexión",
    loading: "Cargando…", cancel: "Cancelar", back: "Atrás", search: "Buscar", save: "Guardar",
  },
  fr: {
    nav_dashboard: "Tableau de bord", nav_tv: "TimeNation-TV", nav_registry: "Registre",
    nav_timeline: "Chronologie", nav_treasury: "Trésor", nav_become_citizen: "Devenir citoyen",
    nav_passport: "Mon passeport", nav_time: "Temps", nav_clock: "Horloge des nations",
    digital_state: "État numérique", login_title: "Connexion", login_placeholder: "ID ou pseudo",
    login_btn: "Connexion", logout_btn: "Déconnexion", refresh: "Actualiser",
    citizen_not_found: "Citoyen introuvable", connection_error: "Erreur de connexion",
    loading: "Chargement…", cancel: "Annuler", back: "Retour", search: "Rechercher", save: "Sauvegarder",
  },
  ar: {
    nav_dashboard: "لوحة التحكم", nav_tv: "TimeNation-TV", nav_registry: "السجل",
    nav_timeline: "الجدول الزمني", nav_treasury: "الخزينة", nav_become_citizen: "كن مواطناً",
    nav_passport: "جوازي", nav_time: "الوقت", nav_clock: "ساعة الأمم",
    digital_state: "الدولة الرقمية", login_title: "تسجيل الدخول", login_placeholder: "المعرف أو الاسم",
    login_btn: "دخول", logout_btn: "خروج", refresh: "تحديث",
    citizen_not_found: "المواطن غير موجود", connection_error: "خطأ في الاتصال",
    loading: "جارٍ التحميل…", cancel: "إلغاء", back: "رجوع", search: "بحث", save: "حفظ",
  },
  bn: {
    nav_dashboard: "ড্যাশবোর্ড", nav_tv: "TimeNation-TV", nav_registry: "রেজিস্ট্রি",
    nav_timeline: "টাইমলাইন", nav_treasury: "ট্রেজারি", nav_become_citizen: "নাগরিক হন",
    nav_passport: "আমার পাসপোর্ট", nav_time: "সময়", nav_clock: "জাতির ঘড়ি",
    digital_state: "ডিজিটাল রাষ্ট্র", login_title: "লগইন", login_placeholder: "ID বা ডাকনাম",
    login_btn: "লগইন", logout_btn: "লগআউট", refresh: "রিফ্রেশ",
    citizen_not_found: "নাগরিক পাওয়া যায়নি", connection_error: "সংযোগ ত্রুটি",
    loading: "লোড হচ্ছে…", cancel: "বাতিল", back: "পিছনে", search: "অনুসন্ধান", save: "সংরক্ষণ",
  },
  pt: {
    nav_dashboard: "Painel", nav_tv: "TimeNation-TV", nav_registry: "Registro",
    nav_timeline: "Linha do tempo", nav_treasury: "Tesouro", nav_become_citizen: "Tornar-se cidadão",
    nav_passport: "Meu passaporte", nav_time: "Tempo", nav_clock: "Relógio das nações",
    digital_state: "Estado digital", login_title: "Entrar", login_placeholder: "ID ou apelido",
    login_btn: "Entrar", logout_btn: "Sair", refresh: "Atualizar",
    citizen_not_found: "Cidadão não encontrado", connection_error: "Erro de conexão",
    loading: "Carregando…", cancel: "Cancelar", back: "Voltar", search: "Pesquisar", save: "Salvar",
  },
  ur: {
    nav_dashboard: "ڈیش بورڈ", nav_tv: "TimeNation-TV", nav_registry: "رجسٹری",
    nav_timeline: "ٹائم لائن", nav_treasury: "خزانہ", nav_become_citizen: "شہری بنیں",
    nav_passport: "میرا پاسپورٹ", nav_time: "وقت", nav_clock: "اقوام کی گھڑی",
    digital_state: "ڈیجیٹل ریاست", login_title: "لاگ ان", login_placeholder: "ID یا عرفی نام",
    login_btn: "لاگ ان", logout_btn: "لاگ آؤٹ", refresh: "تازہ کریں",
    citizen_not_found: "شہری نہیں ملا", connection_error: "کنکشن میں خرابی",
    loading: "لوڈ ہو رہا ہے…", cancel: "منسوخ", back: "واپس", search: "تلاش", save: "محفوظ",
  },
  id: {
    nav_dashboard: "Dasbor", nav_tv: "TimeNation-TV", nav_registry: "Registri",
    nav_timeline: "Linimasa", nav_treasury: "Perbendaharaan", nav_become_citizen: "Jadi warga",
    nav_passport: "Paspor saya", nav_time: "Waktu", nav_clock: "Jam bangsa-bangsa",
    digital_state: "Negara digital", login_title: "Masuk", login_placeholder: "ID atau nama panggilan",
    login_btn: "Masuk", logout_btn: "Keluar", refresh: "Segarkan",
    citizen_not_found: "Warga tidak ditemukan", connection_error: "Kesalahan koneksi",
    loading: "Memuat…", cancel: "Batal", back: "Kembali", search: "Cari", save: "Simpan",
  },
  de: {
    nav_dashboard: "Dashboard", nav_tv: "TimeNation-TV", nav_registry: "Register",
    nav_timeline: "Zeitleiste", nav_treasury: "Schatzkammer", nav_become_citizen: "Bürger werden",
    nav_passport: "Mein Pass", nav_time: "Zeit", nav_clock: "Uhr der Nationen",
    digital_state: "Digitaler Staat", login_title: "Anmelden", login_placeholder: "ID oder Spitzname",
    login_btn: "Anmelden", logout_btn: "Abmelden", refresh: "Aktualisieren",
    citizen_not_found: "Bürger nicht gefunden", connection_error: "Verbindungsfehler",
    loading: "Laden…", cancel: "Abbrechen", back: "Zurück", search: "Suchen", save: "Speichern",
  },
  ja: {
    nav_dashboard: "ダッシュボード", nav_tv: "TimeNation-TV", nav_registry: "市民登録",
    nav_timeline: "タイムライン", nav_treasury: "国庫", nav_become_citizen: "市民になる",
    nav_passport: "マイパスポート", nav_time: "時間", nav_clock: "国々の時計",
    digital_state: "デジタル国家", login_title: "ログイン", login_placeholder: "IDまたはニックネーム",
    login_btn: "ログイン", logout_btn: "ログアウト", refresh: "更新",
    citizen_not_found: "市民が見つかりません", connection_error: "接続エラー",
    loading: "読み込み中…", cancel: "キャンセル", back: "戻る", search: "検索", save: "保存",
  },
  tr: {
    nav_dashboard: "Gösterge paneli", nav_tv: "TimeNation-TV", nav_registry: "Kayıt",
    nav_timeline: "Zaman çizelgesi", nav_treasury: "Hazine", nav_become_citizen: "Vatandaş ol",
    nav_passport: "Pasaportum", nav_time: "Zaman", nav_clock: "Milletlerin saati",
    digital_state: "Dijital devlet", login_title: "Giriş", login_placeholder: "ID veya takma ad",
    login_btn: "Giriş", logout_btn: "Çıkış", refresh: "Yenile",
    citizen_not_found: "Vatandaş bulunamadı", connection_error: "Bağlantı hatası",
    loading: "Yükleniyor…", cancel: "İptal", back: "Geri", search: "Ara", save: "Kaydet",
  },
  vi: {
    nav_dashboard: "Bảng điều khiển", nav_tv: "TimeNation-TV", nav_registry: "Đăng ký",
    nav_timeline: "Dòng thời gian", nav_treasury: "Kho bạc", nav_become_citizen: "Trở thành công dân",
    nav_passport: "Hộ chiếu của tôi", nav_time: "Thời gian", nav_clock: "Đồng hồ các dân tộc",
    digital_state: "Nhà nước kỹ thuật số", login_title: "Đăng nhập", login_placeholder: "ID hoặc biệt danh",
    login_btn: "Đăng nhập", logout_btn: "Đăng xuất", refresh: "Làm mới",
    citizen_not_found: "Không tìm thấy công dân", connection_error: "Lỗi kết nối",
    loading: "Đang tải…", cancel: "Hủy", back: "Quay lại", search: "Tìm kiếm", save: "Lưu",
  },
  he: {
    nav_dashboard: "לוח בקרה", nav_tv: "TimeNation-TV", nav_registry: "רשם",
    nav_timeline: "ציר הזמן", nav_treasury: "אוצר", nav_become_citizen: "הפוך לאזרח",
    nav_passport: "הדרכון שלי", nav_time: "זמן", nav_clock: "שעון העמים",
    digital_state: "מדינה דיגיטלית", login_title: "כניסה", login_placeholder: "מזהה או כינוי",
    login_btn: "כניסה", logout_btn: "יציאה", refresh: "רענן",
    citizen_not_found: "אזרח לא נמצא", connection_error: "שגיאת חיבור",
    loading: "טוען…", cancel: "ביטול", back: "חזור", search: "חיפוש", save: "שמור",
  },
  fa: {
    nav_dashboard: "داشبورد", nav_tv: "TimeNation-TV", nav_registry: "ثبت‌نام",
    nav_timeline: "جدول زمانی", nav_treasury: "خزانه‌داری", nav_become_citizen: "شهروند شوید",
    nav_passport: "گذرنامه من", nav_time: "زمان", nav_clock: "ساعت ملت‌ها",
    digital_state: "دولت دیجیتال", login_title: "ورود", login_placeholder: "شناسه یا نام مستعار",
    login_btn: "ورود", logout_btn: "خروج", refresh: "بازخوانی",
    citizen_not_found: "شهروند یافت نشد", connection_error: "خطای اتصال",
    loading: "در حال بارگذاری…", cancel: "لغو", back: "بازگشت", search: "جستجو", save: "ذخیره",
  },
  ko: {
    nav_dashboard: "대시보드", nav_tv: "TimeNation-TV", nav_registry: "레지스트리",
    nav_timeline: "타임라인", nav_treasury: "재무부", nav_become_citizen: "시민 되기",
    nav_passport: "내 여권", nav_time: "시간", nav_clock: "민족의 시계",
    digital_state: "디지털 국가", login_title: "로그인", login_placeholder: "ID 또는 닉네임",
    login_btn: "로그인", logout_btn: "로그아웃", refresh: "새로고침",
    citizen_not_found: "시민을 찾을 수 없습니다", connection_error: "연결 오류",
    loading: "로딩 중…", cancel: "취소", back: "뒤로", search: "검색", save: "저장",
  },
  it: {
    nav_dashboard: "Cruscotto", nav_tv: "TimeNation-TV", nav_registry: "Registro",
    nav_timeline: "Linea del tempo", nav_treasury: "Tesoro", nav_become_citizen: "Diventa cittadino",
    nav_passport: "Il mio passaporto", nav_time: "Tempo", nav_clock: "Orologio delle nazioni",
    digital_state: "Stato digitale", login_title: "Accedi", login_placeholder: "ID o soprannome",
    login_btn: "Accedi", logout_btn: "Esci", refresh: "Aggiorna",
    citizen_not_found: "Cittadino non trovato", connection_error: "Errore di connessione",
    loading: "Caricamento…", cancel: "Annulla", back: "Indietro", search: "Cerca", save: "Salva",
  },
  pl: {
    nav_dashboard: "Panel", nav_tv: "TimeNation-TV", nav_registry: "Rejestr",
    nav_timeline: "Oś czasu", nav_treasury: "Skarbiec", nav_become_citizen: "Zostań obywatelem",
    nav_passport: "Mój paszport", nav_time: "Czas", nav_clock: "Zegar narodów",
    digital_state: "Państwo cyfrowe", login_title: "Zaloguj", login_placeholder: "ID lub pseudonim",
    login_btn: "Zaloguj", logout_btn: "Wyloguj", refresh: "Odśwież",
    citizen_not_found: "Obywatel nie znaleziony", connection_error: "Błąd połączenia",
    loading: "Ładowanie…", cancel: "Anuluj", back: "Wstecz", search: "Szukaj", save: "Zapisz",
  },
  uk: {
    nav_dashboard: "Дашборд", nav_tv: "TimeNation-TV", nav_registry: "Реєстр",
    nav_timeline: "Часова шкала", nav_treasury: "Скарбниця", nav_become_citizen: "Стати громадянином",
    nav_passport: "Мій паспорт", nav_time: "Час", nav_clock: "Циферблат народів",
    digital_state: "Цифрова держава", login_title: "Увійти", login_placeholder: "ID або псевдонім",
    login_btn: "Увійти", logout_btn: "Вийти", refresh: "Оновити",
    citizen_not_found: "Громадянина не знайдено", connection_error: "Помилка з'єднання",
    loading: "Завантаження…", cancel: "Скасувати", back: "Назад", search: "Пошук", save: "Зберегти",
  },
  nl: {
    nav_dashboard: "Dashboard", nav_tv: "TimeNation-TV", nav_registry: "Register",
    nav_timeline: "Tijdlijn", nav_treasury: "Schatkamer", nav_become_citizen: "Word burger",
    nav_passport: "Mijn paspoort", nav_time: "Tijd", nav_clock: "Klok der naties",
    digital_state: "Digitale staat", login_title: "Inloggen", login_placeholder: "ID of bijnaam",
    login_btn: "Inloggen", logout_btn: "Uitloggen", refresh: "Vernieuwen",
    citizen_not_found: "Burger niet gevonden", connection_error: "Verbindingsfout",
    loading: "Laden…", cancel: "Annuleren", back: "Terug", search: "Zoeken", save: "Opslaan",
  },
  kk: {
    nav_dashboard: "Бақылау тақтасы", nav_tv: "TimeNation-TV", nav_registry: "Тізілім",
    nav_timeline: "Уақыт шкаласы", nav_treasury: "Қазына", nav_become_citizen: "Азамат болу",
    nav_passport: "Менің паспортым", nav_time: "Уақыт", nav_clock: "Халықтар циферблаты",
    digital_state: "Цифрлық мемлекет", login_title: "Кіру", login_placeholder: "ID немесе лақап ат",
    login_btn: "Кіру", logout_btn: "Шығу", refresh: "Жаңарту",
    citizen_not_found: "Азамат табылмады", connection_error: "Қосылу қатесі",
    loading: "Жүктелуде…", cancel: "Бас тарту", back: "Артқа", search: "Іздеу", save: "Сақтау",
  },
  uz: {
    nav_dashboard: "Boshqaruv paneli", nav_tv: "TimeNation-TV", nav_registry: "Ro'yxat",
    nav_timeline: "Vaqt chizig'i", nav_treasury: "G'azna", nav_become_citizen: "Fuqaro bo'lish",
    nav_passport: "Mening pasportim", nav_time: "Vaqt", nav_clock: "Xalqlar soati",
    digital_state: "Raqamli davlat", login_title: "Kirish", login_placeholder: "ID yoki taxallus",
    login_btn: "Kirish", logout_btn: "Chiqish", refresh: "Yangilash",
    citizen_not_found: "Fuqaro topilmadi", connection_error: "Ulanish xatosi",
    loading: "Yuklanmoqda…", cancel: "Bekor qilish", back: "Orqaga", search: "Qidirish", save: "Saqlash",
  },
};

export const RTL_LANGS: LangCode[] = ["ar", "ur", "he", "fa"];

export function isRTL(code: LangCode): boolean {
  return RTL_LANGS.includes(code);
}
