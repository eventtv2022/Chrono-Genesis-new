import type { LangCode } from "./i18n";
type MatrixLangCode = LangCode | "el" | "cs" | "sv";

type MatrixCopy = {
  tab: string;
  intro: string;
  balance: string;
  today: string;
  placeholder: string;
  add: string;
  signIn: string;
  quadrants: [string, string, string, string];
  empty: string;
  urgentHint: string;
  checklistHint: string;
  retry: string;
  loadError: string;
};

export const TIME_MATRIX_I18N: Record<MatrixLangCode, MatrixCopy> = {
  ru: { tab: "Матрица", intro: "Задачи сохраняются в вашем профиле.", balance: "Баланс", today: "Выполнено сегодня", placeholder: "Конкретное действие", add: "Добавить задачу", signIn: "Войдите, чтобы сохранять задачи.", quadrants: ["Сделать сначала", "Запланировать", "Сократить", "Отложить"], empty: "Пока нет задач.", urgentHint: "В квадранте B важные задачи, которые не требуют немедленного выполнения.", checklistHint: "Быстрый чек-лист до 60 секунд не приносит Дармин.", retry: "Повторить", loadError: "Не удалось загрузить задачи.", },
  en: { tab: "Matrix", intro: "Tasks are saved to your profile.", balance: "Balance", today: "Completed today", placeholder: "Describe a specific task", add: "Add task", signIn: "Sign in to save your tasks.", quadrants: ["Do first", "Schedule", "Keep brief", "Let go"], empty: "No tasks yet.", urgentHint: "Quadrant B is for important tasks that are not urgent.", checklistHint: "Quick checklists under 60 seconds do not earn Darmins.", retry: "Retry", loadError: "Tasks could not be loaded.", },
  zh: { tab: "时间矩阵", intro: "任务会保存到您的个人资料。", balance: "余额", today: "今日完成", placeholder: "描述一项具体任务", add: "添加任务", signIn: "登录后即可保存任务。", quadrants: ["优先处理", "安排计划", "简化处理", "暂时搁置"], empty: "暂无任务。", urgentHint: "B象限用于重要但不紧急的任务。", checklistHint: "60秒以内的快速清单不奖励达明。", retry: "重试", loadError: "无法加载任务。", },
  hi: { tab: "टाइम मैट्रिक्स", intro: "कार्य आपकी प्रोफ़ाइल में सहेजे जाते हैं।", balance: "शेष", today: "आज पूरे हुए", placeholder: "एक स्पष्ट कार्य लिखें", add: "कार्य जोड़ें", signIn: "कार्य सहेजने के लिए साइन इन करें।", quadrants: ["पहले करें", "योजना बनाएं", "संक्षिप्त रखें", "छोड़ दें"], empty: "अभी कोई कार्य नहीं।", urgentHint: "चतुर्थांश B महत्वपूर्ण, लेकिन गैर-जरूरी कार्यों के लिए है।", checklistHint: "60 सेकंड से कम की त्वरित सूची पर डार्मिन नहीं मिलता।", retry: "फिर कोशिश करें", loadError: "कार्य लोड नहीं हो सके।", },
  es: { tab: "Matriz del tiempo", intro: "Las tareas se guardan en tu perfil.", balance: "Saldo", today: "Completadas hoy", placeholder: "Describe una tarea concreta", add: "Añadir tarea", signIn: "Inicia sesión para guardar tareas.", quadrants: ["Hacer primero", "Programar", "Reducir", "Posponer"], empty: "Aún no hay tareas.", urgentHint: "El cuadrante B reúne tareas importantes, pero no urgentes.", checklistHint: "Las listas rápidas de menos de 60 segundos no generan Darmins.", retry: "Reintentar", loadError: "No se pudieron cargar las tareas.", },
  fr: { tab: "Matrice du temps", intro: "Les tâches sont enregistrées dans votre profil.", balance: "Solde", today: "Terminées aujourd’hui", placeholder: "Décrivez une tâche précise", add: "Ajouter une tâche", signIn: "Connectez-vous pour enregistrer vos tâches.", quadrants: ["À faire d’abord", "Planifier", "Réduire", "Reporter"], empty: "Aucune tâche pour le moment.", urgentHint: "Le quadrant B regroupe les tâches importantes, mais non urgentes.", checklistHint: "Les listes rapides de moins de 60 secondes ne rapportent pas de Darmins.", retry: "Réessayer", loadError: "Impossible de charger les tâches.", },
  ar: { tab: "مصفوفة الوقت", intro: "تُحفظ المهام في ملفك الشخصي.", balance: "الرصيد", today: "أُنجزت اليوم", placeholder: "اكتب مهمة محددة", add: "إضافة مهمة", signIn: "سجّل الدخول لحفظ مهامك.", quadrants: ["ابدأ بها", "خطّط لها", "اختصرها", "اتركها"], empty: "لا توجد مهام بعد.", urgentHint: "المربع B للمهام المهمة وغير العاجلة.", checklistHint: "القوائم السريعة الأقل من 60 ثانية لا تمنح دارمين.", retry: "إعادة المحاولة", loadError: "تعذّر تحميل المهام.", },
  bn: { tab: "টাইম ম্যাট্রিক্স", intro: "কাজগুলো আপনার প্রোফাইলে সংরক্ষিত হয়।", balance: "ব্যালেন্স", today: "আজ সম্পন্ন", placeholder: "একটি নির্দিষ্ট কাজ লিখুন", add: "কাজ যোগ করুন", signIn: "কাজ সংরক্ষণ করতে সাইন ইন করুন।", quadrants: ["আগে করুন", "সময় নির্ধারণ", "সংক্ষিপ্ত রাখুন", "বাদ দিন"], empty: "এখনও কোনো কাজ নেই।", urgentHint: "B কোয়াড্রান্ট গুরুত্বপূর্ণ, তবে জরুরি নয়—এমন কাজের জন্য।", checklistHint: "৬০ সেকেন্ডের কমের দ্রুত তালিকায় দার্মিন মেলে না।", retry: "আবার চেষ্টা করুন", loadError: "কাজ লোড করা যায়নি।", },
  pt: { tab: "Matriz do tempo", intro: "As tarefas ficam salvas no seu perfil.", balance: "Saldo", today: "Concluídas hoje", placeholder: "Descreva uma tarefa específica", add: "Adicionar tarefa", signIn: "Entre para salvar suas tarefas.", quadrants: ["Fazer primeiro", "Agendar", "Simplificar", "Deixar de lado"], empty: "Ainda não há tarefas.", urgentHint: "O quadrante B reúne tarefas importantes, mas não urgentes.", checklistHint: "Listas rápidas com menos de 60 segundos não rendem Darmins.", retry: "Tentar novamente", loadError: "Não foi possível carregar as tarefas.", },
  ur: { tab: "ٹائم میٹرکس", intro: "کام آپ کے پروفائل میں محفوظ ہوتے ہیں۔", balance: "بیلنس", today: "آج مکمل", placeholder: "ایک واضح کام لکھیں", add: "کام شامل کریں", signIn: "کام محفوظ کرنے کے لیے سائن اِن کریں۔", quadrants: ["پہلے کریں", "منصوبہ بنائیں", "مختصر رکھیں", "چھوڑ دیں"], empty: "ابھی کوئی کام نہیں۔", urgentHint: "کواڈرینٹ B اہم مگر غیر فوری کاموں کے لیے ہے۔", checklistHint: "60 سیکنڈ سے کم کی فہرست پر ڈارمن نہیں ملتا۔", retry: "دوبارہ کوشش", loadError: "کام لوڈ نہیں ہو سکے۔", },
  id: { tab: "Matriks Waktu", intro: "Tugas disimpan di profil Anda.", balance: "Saldo", today: "Selesai hari ini", placeholder: "Jelaskan tugas yang spesifik", add: "Tambah tugas", signIn: "Masuk untuk menyimpan tugas.", quadrants: ["Kerjakan dahulu", "Jadwalkan", "Persingkat", "Abaikan"], empty: "Belum ada tugas.", urgentHint: "Kuadran B berisi tugas penting yang tidak mendesak.", checklistHint: "Daftar cepat di bawah 60 detik tidak mendapat Darmin.", retry: "Coba lagi", loadError: "Tugas tidak dapat dimuat.", },
  de: { tab: "Zeitmatrix", intro: "Aufgaben werden in deinem Profil gespeichert.", balance: "Guthaben", today: "Heute erledigt", placeholder: "Beschreibe eine konkrete Aufgabe", add: "Aufgabe hinzufügen", signIn: "Melde dich an, um Aufgaben zu speichern.", quadrants: ["Zuerst erledigen", "Einplanen", "Kurz halten", "Weglassen"], empty: "Noch keine Aufgaben.", urgentHint: "Quadrant B enthält wichtige, aber nicht dringende Aufgaben.", checklistHint: "Schnelle Checklisten unter 60 Sekunden bringen keine Darmins.", retry: "Erneut versuchen", loadError: "Aufgaben konnten nicht geladen werden.", },
  ja: { tab: "タイムマトリックス", intro: "タスクはプロフィールに保存されます。", balance: "残高", today: "今日の完了", placeholder: "具体的なタスクを入力", add: "タスクを追加", signIn: "ログインしてタスクを保存してください。", quadrants: ["最優先", "予定する", "簡潔にする", "手放す"], empty: "タスクはまだありません。", urgentHint: "B象限は重要だが緊急ではないタスク用です。", checklistHint: "60秒未満のクイックリストはダーミン対象外です。", retry: "再試行", loadError: "タスクを読み込めませんでした。", },
  tr: { tab: "Zaman Matrisi", intro: "Görevler profilinize kaydedilir.", balance: "Bakiye", today: "Bugün tamamlanan", placeholder: "Belirli bir görevi açıklayın", add: "Görev ekle", signIn: "Görevleri kaydetmek için giriş yapın.", quadrants: ["Önce yap", "Planla", "Kısa tut", "Vazgeç"], empty: "Henüz görev yok.", urgentHint: "B bölümü önemli ama acil olmayan görevler içindir.", checklistHint: "60 saniyeden kısa hızlı listeler Darmin kazandırmaz.", retry: "Tekrar dene", loadError: "Görevler yüklenemedi.", },
  vi: { tab: "Ma trận thời gian", intro: "Nhiệm vụ được lưu trong hồ sơ của bạn.", balance: "Số dư", today: "Hoàn thành hôm nay", placeholder: "Mô tả một nhiệm vụ cụ thể", add: "Thêm nhiệm vụ", signIn: "Đăng nhập để lưu nhiệm vụ.", quadrants: ["Làm trước", "Lên lịch", "Rút gọn", "Bỏ qua"], empty: "Chưa có nhiệm vụ.", urgentHint: "Ô B dành cho việc quan trọng nhưng chưa cấp bách.", checklistHint: "Danh sách nhanh dưới 60 giây không nhận Darmin.", retry: "Thử lại", loadError: "Không thể tải nhiệm vụ.", },
  he: { tab: "מטריצת זמן", intro: "המשימות נשמרות בפרופיל שלך.", balance: "יתרה", today: "הושלמו היום", placeholder: "תארו משימה ממוקדת", add: "הוספת משימה", signIn: "התחברו כדי לשמור משימות.", quadrants: ["לבצע קודם", "לתזמן", "לקצר", "לוותר"], empty: "אין עדיין משימות.", urgentHint: "רבע B מיועד למשימות חשובות אך לא דחופות.", checklistHint: "רשימות מהירות של פחות מ־60 שניות אינן מזכות בדרמין.", retry: "ניסיון חוזר", loadError: "לא ניתן לטעון את המשימות.", },
  fa: { tab: "ماتریس زمان", intro: "کارها در نمایه شما ذخیره می‌شوند.", balance: "موجودی", today: "انجام‌شده امروز", placeholder: "یک کار مشخص بنویسید", add: "افزودن کار", signIn: "برای ذخیره کارها وارد شوید.", quadrants: ["اول انجام دهید", "برنامه‌ریزی کنید", "کوتاه کنید", "رها کنید"], empty: "هنوز کاری ندارید.", urgentHint: "بخش B برای کارهای مهم اما غیرفوری است.", checklistHint: "فهرست سریع زیر ۶۰ ثانیه دارمین ندارد.", retry: "تلاش دوباره", loadError: "بارگذاری کارها ناموفق بود.", },
  ko: { tab: "시간 매트릭스", intro: "작업은 프로필에 저장됩니다.", balance: "잔액", today: "오늘 완료", placeholder: "구체적인 작업을 입력하세요", add: "작업 추가", signIn: "작업을 저장하려면 로그인하세요.", quadrants: ["먼저 하기", "일정 잡기", "간단히 하기", "놓아주기"], empty: "아직 작업이 없습니다.", urgentHint: "B 사분면은 중요하지만 긴급하지 않은 작업입니다.", checklistHint: "60초 미만의 빠른 체크리스트는 다르민을 지급하지 않습니다.", retry: "다시 시도", loadError: "작업을 불러오지 못했습니다.", },
  it: { tab: "Matrice del tempo", intro: "Le attività vengono salvate nel tuo profilo.", balance: "Saldo", today: "Completate oggi", placeholder: "Descrivi un’attività specifica", add: "Aggiungi attività", signIn: "Accedi per salvare le attività.", quadrants: ["Da fare subito", "Programmare", "Ridurre", "Lasciar perdere"], empty: "Nessuna attività per ora.", urgentHint: "Il quadrante B raccoglie attività importanti ma non urgenti.", checklistHint: "Le liste rapide sotto i 60 secondi non danno Darmin.", retry: "Riprova", loadError: "Impossibile caricare le attività.", },
  pl: { tab: "Macierz czasu", intro: "Zadania są zapisywane w Twoim profilu.", balance: "Saldo", today: "Ukończone dziś", placeholder: "Opisz konkretne zadanie", add: "Dodaj zadanie", signIn: "Zaloguj się, aby zapisywać zadania.", quadrants: ["Zrób najpierw", "Zaplanuj", "Ogranicz", "Odpuść"], empty: "Nie ma jeszcze zadań.", urgentHint: "Kwadrant B obejmuje ważne, ale niepilne zadania.", checklistHint: "Szybkie listy poniżej 60 sekund nie dają Darminów.", retry: "Spróbuj ponownie", loadError: "Nie udało się wczytać zadań.", },
  uk: { tab: "Матриця часу", intro: "Завдання зберігаються у вашому профілі.", balance: "Баланс", today: "Виконано сьогодні", placeholder: "Опишіть конкретне завдання", add: "Додати завдання", signIn: "Увійдіть, щоб зберігати завдання.", quadrants: ["Зробити спочатку", "Запланувати", "Скоротити", "Відкласти"], empty: "Поки що завдань немає.", urgentHint: "Квадрант B — для важливих, але не термінових завдань.", checklistHint: "Швидкі списки до 60 секунд не дають Дармінів.", retry: "Спробувати ще", loadError: "Не вдалося завантажити завдання.", },
  nl: { tab: "Tijdmatrix", intro: "Taken worden opgeslagen in je profiel.", balance: "Saldo", today: "Vandaag voltooid", placeholder: "Beschrijf een concrete taak", add: "Taak toevoegen", signIn: "Log in om taken op te slaan.", quadrants: ["Eerst doen", "Inplannen", "Beperken", "Loslaten"], empty: "Nog geen taken.", urgentHint: "Kwadrant B bevat belangrijke, niet-dringende taken.", checklistHint: "Snelle checklists korter dan 60 seconden leveren geen Darmins op.", retry: "Opnieuw proberen", loadError: "Taken konden niet worden geladen.", },
  kk: { tab: "Уақыт матрицасы", intro: "Тапсырмалар профиліңізде сақталады.", balance: "Баланс", today: "Бүгін орындалды", placeholder: "Нақты тапсырманы сипаттаңыз", add: "Тапсырма қосу", signIn: "Тапсырмаларды сақтау үшін кіріңіз.", quadrants: ["Алдымен орындау", "Жоспарлау", "Қысқарту", "Қою"], empty: "Әзірге тапсырма жоқ.", urgentHint: "B квадранты маңызды, бірақ шұғыл емес істерге арналған.", checklistHint: "60 секундтан қысқа тізімдер Дармин бермейді.", retry: "Қайталау", loadError: "Тапсырмалар жүктелмеді.", },
  uz: { tab: "Vaqt matritsasi", intro: "Vazifalar profilingizda saqlanadi.", balance: "Balans", today: "Bugun bajarildi", placeholder: "Aniq vazifani tasvirlang", add: "Vazifa qo‘shish", signIn: "Vazifalarni saqlash uchun tizimga kiring.", quadrants: ["Avval bajarish", "Rejalashtirish", "Qisqartirish", "Voz kechish"], empty: "Hozircha vazifalar yo‘q.", urgentHint: "B kvadranti muhim, ammo shoshilinch bo‘lmagan vazifalar uchun.", checklistHint: "60 soniyadan qisqa ro‘yxatlar Darmin bermaydi.", retry: "Qayta urinish", loadError: "Vazifalarni yuklab bo‘lmadi.", },
  el: { tab: "Μήτρα χρόνου", intro: "Οι εργασίες αποθηκεύονται στο προφίλ σας.", balance: "Υπόλοιπο", today: "Ολοκληρώθηκαν σήμερα", placeholder: "Περιγράψτε μια συγκεκριμένη εργασία", add: "Προσθήκη εργασίας", signIn: "Συνδεθείτε για να αποθηκεύσετε εργασίες.", quadrants: ["Πρώτα αυτά", "Προγραμματισμός", "Συντομία", "Αφήστε τα"], empty: "Δεν υπάρχουν ακόμη εργασίες.", urgentHint: "Το τεταρτημόριο B αφορά σημαντικές, μη επείγουσες εργασίες.", checklistHint: "Οι γρήγορες λίστες κάτω των 60 δευτερολέπτων δεν δίνουν Darmin.", retry: "Δοκιμάστε ξανά", loadError: "Δεν ήταν δυνατή η φόρτωση εργασιών.", },
  cs: { tab: "Časová matice", intro: "Úkoly se ukládají do vašeho profilu.", balance: "Zůstatek", today: "Dnes dokončeno", placeholder: "Popište konkrétní úkol", add: "Přidat úkol", signIn: "Přihlaste se pro ukládání úkolů.", quadrants: ["Udělat nejdřív", "Naplánovat", "Zkrátit", "Pustit"], empty: "Zatím tu nejsou žádné úkoly.", urgentHint: "Kvadrant B je pro důležité, ale neurgentní úkoly.", checklistHint: "Rychlé seznamy do 60 sekund nepřinášejí Darminy.", retry: "Zkusit znovu", loadError: "Úkoly se nepodařilo načíst.", },
  sv: { tab: "Tidsmatris", intro: "Uppgifter sparas i din profil.", balance: "Saldo", today: "Slutförda idag", placeholder: "Beskriv en konkret uppgift", add: "Lägg till uppgift", signIn: "Logga in för att spara uppgifter.", quadrants: ["Gör först", "Planera", "Håll kort", "Släpp"], empty: "Inga uppgifter ännu.", urgentHint: "Kvadrant B är för viktiga men inte brådskande uppgifter.", checklistHint: "Snabba checklistor under 60 sekunder ger inga Darmins.", retry: "Försök igen", loadError: "Uppgifterna kunde inte läsas in.", },
};

export function getTimeMatrixErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === "object" && "data" in error) {
    const data = (error as { data?: unknown }).data;
    if (data && typeof data === "object" && "error" in data) {
      const message = (data as { error?: unknown }).error;
      if (typeof message === "string" && message.trim()) return message;
    }
  }
  return fallback;
}

export const TIME_MATRIX_DELETE: Record<MatrixLangCode, string> = {
  ru: "Удалить", en: "Delete", zh: "删除", hi: "हटाएं", es: "Eliminar", fr: "Supprimer",
  ar: "حذف", bn: "মুছুন", pt: "Excluir", ur: "حذف کریں", id: "Hapus", de: "Löschen",
  ja: "削除", tr: "Sil", vi: "Xóa", he: "מחיקה", fa: "حذف", ko: "삭제", it: "Elimina",
  pl: "Usuń", uk: "Видалити", nl: "Verwijderen", kk: "Жою", uz: "O‘chirish",
  el: "Διαγραφή", cs: "Smazat", sv: "Ta bort",
};

export const TIME_MATRIX_ACTIONS: Record<MatrixLangCode, { open: string; done: string; start: string; complete: string; edit: string; deletePrompt: string }> = {
  ru: { open: "Открыто", done: "Готово", start: "Начать", complete: "Завершить", edit: "Изменить", deletePrompt: "Удалить эту задачу? Это действие нельзя отменить." },
  en: { open: "Open", done: "Done", start: "Start", complete: "Complete", edit: "Edit", deletePrompt: "Delete this task? This cannot be undone." },
  zh: { open: "进行中", done: "完成", start: "开始", complete: "完成任务", edit: "编辑", deletePrompt: "删除此任务？此操作无法撤销。" },
  hi: { open: "खुला", done: "पूरा", start: "शुरू करें", complete: "पूरा करें", edit: "बदलें", deletePrompt: "यह कार्य हटाएं? इसे वापस नहीं किया जा सकता।" },
  es: { open: "Abierta", done: "Hecha", start: "Empezar", complete: "Completar", edit: "Editar", deletePrompt: "¿Eliminar esta tarea? No se puede deshacer." },
  fr: { open: "Ouverte", done: "Terminée", start: "Démarrer", complete: "Terminer", edit: "Modifier", deletePrompt: "Supprimer cette tâche ? Cette action est irréversible." },
  ar: { open: "مفتوحة", done: "منجزة", start: "ابدأ", complete: "أكمل", edit: "تعديل", deletePrompt: "هل تريد حذف هذه المهمة؟ لا يمكن التراجع عن ذلك." },
  bn: { open: "খোলা", done: "সম্পন্ন", start: "শুরু", complete: "সম্পন্ন করুন", edit: "সম্পাদনা", deletePrompt: "এই কাজটি মুছবেন? এটি ফিরিয়ে আনা যাবে না।" },
  pt: { open: "Aberta", done: "Concluída", start: "Iniciar", complete: "Concluir", edit: "Editar", deletePrompt: "Excluir esta tarefa? Não é possível desfazer." },
  ur: { open: "کھلا", done: "مکمل", start: "شروع کریں", complete: "مکمل کریں", edit: "ترمیم", deletePrompt: "یہ کام حذف کریں؟ اسے واپس نہیں کیا جا سکتا۔" },
  id: { open: "Terbuka", done: "Selesai", start: "Mulai", complete: "Selesaikan", edit: "Ubah", deletePrompt: "Hapus tugas ini? Tindakan ini tidak dapat dibatalkan." },
  de: { open: "Offen", done: "Erledigt", start: "Starten", complete: "Abschließen", edit: "Bearbeiten", deletePrompt: "Diese Aufgabe löschen? Das lässt sich nicht rückgängig machen." },
  ja: { open: "未完了", done: "完了", start: "開始", complete: "完了にする", edit: "編集", deletePrompt: "このタスクを削除しますか？元に戻せません。" },
  tr: { open: "Açık", done: "Tamamlandı", start: "Başlat", complete: "Tamamla", edit: "Düzenle", deletePrompt: "Bu görev silinsin mi? Bu işlem geri alınamaz." },
  vi: { open: "Đang mở", done: "Xong", start: "Bắt đầu", complete: "Hoàn thành", edit: "Sửa", deletePrompt: "Xóa nhiệm vụ này? Không thể hoàn tác." },
  he: { open: "פתוחה", done: "הושלמה", start: "התחלה", complete: "השלמה", edit: "עריכה", deletePrompt: "למחוק את המשימה? אי אפשר לבטל פעולה זו." },
  fa: { open: "باز", done: "انجام‌شده", start: "شروع", complete: "تکمیل", edit: "ویرایش", deletePrompt: "این کار حذف شود؟ این کار قابل بازگشت نیست." },
  ko: { open: "진행 중", done: "완료", start: "시작", complete: "완료하기", edit: "수정", deletePrompt: "이 작업을 삭제할까요? 되돌릴 수 없습니다." },
  it: { open: "Aperta", done: "Completata", start: "Avvia", complete: "Completa", edit: "Modifica", deletePrompt: "Eliminare questa attività? Non si può annullare." },
  pl: { open: "Otwarte", done: "Gotowe", start: "Rozpocznij", complete: "Ukończ", edit: "Edytuj", deletePrompt: "Usunąć to zadanie? Tej czynności nie można cofnąć." },
  uk: { open: "Відкрите", done: "Готово", start: "Почати", complete: "Завершити", edit: "Змінити", deletePrompt: "Видалити це завдання? Дію неможливо скасувати." },
  nl: { open: "Open", done: "Klaar", start: "Start", complete: "Voltooien", edit: "Bewerken", deletePrompt: "Deze taak verwijderen? Dit kan niet ongedaan worden gemaakt." },
  kk: { open: "Ашық", done: "Дайын", start: "Бастау", complete: "Аяқтау", edit: "Өзгерту", deletePrompt: "Бұл тапсырма жойылсын ба? Әрекетті қайтару мүмкін емес." },
  uz: { open: "Ochiq", done: "Tayyor", start: "Boshlash", complete: "Yakunlash", edit: "Tahrirlash", deletePrompt: "Bu vazifa o‘chirilsinmi? Buni ortga qaytarib bo‘lmaydi." },
  el: { open: "Ανοιχτή", done: "Έγινε", start: "Έναρξη", complete: "Ολοκλήρωση", edit: "Επεξεργασία", deletePrompt: "Να διαγραφεί αυτή η εργασία; Δεν γίνεται αναίρεση." },
  cs: { open: "Otevřený", done: "Hotovo", start: "Začít", complete: "Dokončit", edit: "Upravit", deletePrompt: "Smazat tento úkol? Tuto akci nelze vrátit." },
  sv: { open: "Öppen", done: "Klar", start: "Starta", complete: "Slutför", edit: "Redigera", deletePrompt: "Ta bort uppgiften? Åtgärden kan inte ångras." },
};

export const TIME_MATRIX_ERRORS: Record<MatrixLangCode, { titleTooShort: string; saveFailed: string }> = {
  ru: { titleTooShort: "Название должно содержать не менее 3 символов.", saveFailed: "Не удалось сохранить задачу. Попробуйте ещё раз." },
  en: { titleTooShort: "Use at least 3 characters for the task title.", saveFailed: "Could not save the task. Please try again." },
  zh: { titleTooShort: "任务名称至少需要3个字符。", saveFailed: "无法保存任务，请重试。" },
  hi: { titleTooShort: "कार्य का नाम कम से कम 3 अक्षरों का होना चाहिए।", saveFailed: "कार्य सहेजा नहीं जा सका। फिर कोशिश करें।" },
  es: { titleTooShort: "El título debe tener al menos 3 caracteres.", saveFailed: "No se pudo guardar la tarea. Inténtalo de nuevo." },
  fr: { titleTooShort: "Le titre doit contenir au moins 3 caractères.", saveFailed: "Impossible d’enregistrer la tâche. Réessayez." },
  ar: { titleTooShort: "يجب أن يتكون العنوان من 3 أحرف على الأقل.", saveFailed: "تعذّر حفظ المهمة. حاول مرة أخرى." },
  bn: { titleTooShort: "কাজের নাম কমপক্ষে ৩ অক্ষরের হতে হবে।", saveFailed: "কাজ সংরক্ষণ করা যায়নি। আবার চেষ্টা করুন।" },
  pt: { titleTooShort: "O título deve ter pelo menos 3 caracteres.", saveFailed: "Não foi possível salvar a tarefa. Tente novamente." },
  ur: { titleTooShort: "عنوان کم از کم 3 حروف کا ہونا چاہیے۔", saveFailed: "کام محفوظ نہیں ہو سکا۔ دوبارہ کوشش کریں۔" },
  id: { titleTooShort: "Judul tugas harus berisi minimal 3 karakter.", saveFailed: "Tugas tidak dapat disimpan. Coba lagi." },
  de: { titleTooShort: "Der Titel muss mindestens 3 Zeichen lang sein.", saveFailed: "Aufgabe konnte nicht gespeichert werden. Bitte erneut versuchen." },
  ja: { titleTooShort: "タスク名は3文字以上で入力してください。", saveFailed: "タスクを保存できませんでした。もう一度お試しください。" },
  tr: { titleTooShort: "Görev başlığı en az 3 karakter olmalıdır.", saveFailed: "Görev kaydedilemedi. Lütfen tekrar deneyin." },
  vi: { titleTooShort: "Tiêu đề nhiệm vụ cần ít nhất 3 ký tự.", saveFailed: "Không thể lưu nhiệm vụ. Vui lòng thử lại." },
  he: { titleTooShort: "הכותרת צריכה להכיל לפחות 3 תווים.", saveFailed: "לא ניתן לשמור את המשימה. נסו שוב." },
  fa: { titleTooShort: "عنوان باید حداقل ۳ نویسه داشته باشد.", saveFailed: "ذخیره کار ناموفق بود. دوباره تلاش کنید." },
  ko: { titleTooShort: "작업 제목은 3자 이상이어야 합니다.", saveFailed: "작업을 저장하지 못했습니다. 다시 시도하세요." },
  it: { titleTooShort: "Il titolo deve contenere almeno 3 caratteri.", saveFailed: "Impossibile salvare l’attività. Riprova." },
  pl: { titleTooShort: "Tytuł musi mieć co najmniej 3 znaki.", saveFailed: "Nie udało się zapisać zadania. Spróbuj ponownie." },
  uk: { titleTooShort: "Назва має містити щонайменше 3 символи.", saveFailed: "Не вдалося зберегти завдання. Спробуйте ще раз." },
  nl: { titleTooShort: "De titel moet minimaal 3 tekens bevatten.", saveFailed: "Taak opslaan is mislukt. Probeer het opnieuw." },
  kk: { titleTooShort: "Тапсырма атауы кемінде 3 таңбадан тұруы керек.", saveFailed: "Тапсырма сақталмады. Қайталап көріңіз." },
  uz: { titleTooShort: "Vazifa sarlavhasi kamida 3 ta belgidan iborat bo‘lishi kerak.", saveFailed: "Vazifani saqlab bo‘lmadi. Qayta urinib ko‘ring." },
  el: { titleTooShort: "Ο τίτλος πρέπει να έχει τουλάχιστον 3 χαρακτήρες.", saveFailed: "Δεν ήταν δυνατή η αποθήκευση. Δοκιμάστε ξανά." },
  cs: { titleTooShort: "Název musí mít alespoň 3 znaky.", saveFailed: "Úkol se nepodařilo uložit. Zkuste to znovu." },
  sv: { titleTooShort: "Titeln måste innehålla minst 3 tecken.", saveFailed: "Uppgiften kunde inte sparas. Försök igen." },
};
