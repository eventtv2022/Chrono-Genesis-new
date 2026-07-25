#!/usr/bin/env python3
"""
Patch artifacts/mobile/lib/i18n.ts:
  1. Add "el" | "cs" | "sv" to LangCode
  2. Add 6 new UIStrings keys
  3. Add those 6 translations to all 24 existing language blocks
  4. Append complete el / cs / sv dictionaries
  5. Append FOCUS_PROMPTS_I18N export
"""
import re, sys

FILE = "artifacts/mobile/lib/i18n.ts"

with open(FILE, "r", encoding="utf-8") as f:
    content = f.read()

# ── 1. LangCode type ──────────────────────────────────────────────────────────
content = content.replace(
    '  | "uk" | "nl" | "kk" | "uz";',
    '  | "uk" | "nl" | "kk" | "uz"\n  | "el" | "cs" | "sv";',
)

# ── 2. UIStrings interface — append 6 new keys before closing } ───────────────
content = content.replace(
    "  sa_time_ph: string;\n}",
    (
        "  sa_time_ph: string;\n"
        "  // Timeline badge labels\n"
        "  tl_anchor_badge: string;\n"
        "  tl_slot_badge: string;\n"
        "  // File / media limit alerts\n"
        "  file_limit_title: string;\n"
        "  file_limit_size: string;\n"
        "  file_limit_duration: string;\n"
        "  file_limit_both: string;\n"
        "}"
    ),
)

# ── 3. Translations for the 6 new keys in every existing language block ────────
# Format: lang_code → tail string to append (will be inserted before closing },)
NEW_KEYS: dict[str, str] = {
    "ru": (
        '    tl_anchor_badge: "Значимое", tl_slot_badge: "События",\n'
        '    file_limit_title: "Лимит файла",'
        ' file_limit_size: "Файл превышает лимит 12 МБ.",'
        ' file_limit_duration: "Длительность не должна превышать 1 минуту.",'
        ' file_limit_both: "Файл превышает лимит размера (макс. 12 МБ) и длительности (макс. 1 мин).",'
    ),
    "en": (
        '    tl_anchor_badge: "Significant", tl_slot_badge: "Events",\n'
        '    file_limit_title: "File Limit",'
        ' file_limit_size: "File exceeds the 12 MB limit.",'
        ' file_limit_duration: "Duration must not exceed 1 minute.",'
        ' file_limit_both: "File exceeds size (max 12 MB) and duration (max 1 min) limits.",'
    ),
    "zh": (
        '    tl_anchor_badge: "重要", tl_slot_badge: "事件",\n'
        '    file_limit_title: "文件限制",'
        ' file_limit_size: "文件超过12 MB限制。",'
        ' file_limit_duration: "时长不得超过1分钟。",'
        ' file_limit_both: "文件超过大小（最大12 MB）和时长（最大1分钟）限制。",'
    ),
    "hi": (
        '    tl_anchor_badge: "महत्वपूर्ण", tl_slot_badge: "घटनाएँ",\n'
        '    file_limit_title: "फ़ाइल सीमा",'
        ' file_limit_size: "फ़ाइल 12 MB सीमा से अधिक है।",'
        ' file_limit_duration: "अवधि 1 मिनट से अधिक नहीं होनी चाहिए।",'
        ' file_limit_both: "फ़ाइल आकार (अधिकतम 12 MB) और अवधि (अधिकतम 1 मिनट) सीमा से अधिक है।",'
    ),
    "es": (
        '    tl_anchor_badge: "Significativo", tl_slot_badge: "Eventos",\n'
        '    file_limit_title: "Límite de archivo",'
        ' file_limit_size: "El archivo supera el límite de 12 MB.",'
        ' file_limit_duration: "La duración no debe superar 1 minuto.",'
        ' file_limit_both: "El archivo supera los límites de tamaño (máx. 12 MB) y duración (máx. 1 min).",'
    ),
    "fr": (
        '    tl_anchor_badge: "Significatif", tl_slot_badge: "Événements",\n'
        '    file_limit_title: "Limite de fichier",'
        ' file_limit_size: "Le fichier dépasse la limite de 12 Mo.",'
        ' file_limit_duration: "La durée ne doit pas dépasser 1 minute.",'
        ' file_limit_both: "Le fichier dépasse les limites de taille (max. 12 Mo) et de durée (max. 1 min).",'
    ),
    "ar": (
        '    tl_anchor_badge: "الجوهري", tl_slot_badge: "الأحداث",\n'
        '    file_limit_title: "حد الملف",'
        ' file_limit_size: "الملف يتجاوز حد 12 MB.",'
        ' file_limit_duration: "يجب ألا تتجاوز المدة دقيقة واحدة.",'
        ' file_limit_both: "الملف يتجاوز حدود الحجم (الحد الأقصى 12 MB) والمدة (الحد الأقصى 1 دقيقة).",'
    ),
    "bn": (
        '    tl_anchor_badge: "গুরুত্বপূর্ণ", tl_slot_badge: "ঘটনা",\n'
        '    file_limit_title: "ফাইল সীমা",'
        ' file_limit_size: "ফাইল ১২ MB সীমা অতিক্রম করেছে।",'
        ' file_limit_duration: "সময়কাল ১ মিনিটের বেশি হওয়া উচিত নয়।",'
        ' file_limit_both: "ফাইল আকার (সর্বোচ্চ ১২ MB) ও সময়কাল (সর্বোচ্চ ১ মিনিট) সীমা অতিক্রম করেছে।",'
    ),
    "pt": (
        '    tl_anchor_badge: "Significativo", tl_slot_badge: "Eventos",\n'
        '    file_limit_title: "Limite de arquivo",'
        ' file_limit_size: "O arquivo excede o limite de 12 MB.",'
        ' file_limit_duration: "A duração não deve ultrapassar 1 minuto.",'
        ' file_limit_both: "O arquivo excede os limites de tamanho (máx. 12 MB) e duração (máx. 1 min).",'
    ),
    "ur": (
        '    tl_anchor_badge: "اہم", tl_slot_badge: "واقعات",\n'
        '    file_limit_title: "فائل کی حد",'
        ' file_limit_size: "فائل 12 MB کی حد سے تجاوز کر گئی ہے۔",'
        ' file_limit_duration: "مدت 1 منٹ سے زیادہ نہیں ہونی چاہیے۔",'
        ' file_limit_both: "فائل سائز (زیادہ سے زیادہ 12 MB) اور مدت (زیادہ سے زیادہ 1 منٹ) کی حدود سے تجاوز کر گئی ہے۔",'
    ),
    "id": (
        '    tl_anchor_badge: "Bermakna", tl_slot_badge: "Acara",\n'
        '    file_limit_title: "Batas File",'
        ' file_limit_size: "File melebihi batas 12 MB.",'
        ' file_limit_duration: "Durasi tidak boleh melebihi 1 menit.",'
        ' file_limit_both: "File melebihi batas ukuran (maks. 12 MB) dan durasi (maks. 1 menit).",'
    ),
    "de": (
        '    tl_anchor_badge: "Bedeutsam", tl_slot_badge: "Ereignisse",\n'
        '    file_limit_title: "Dateilimit",'
        ' file_limit_size: "Die Datei überschreitet das 12-MB-Limit.",'
        ' file_limit_duration: "Die Dauer darf 1 Minute nicht überschreiten.",'
        ' file_limit_both: "Die Datei überschreitet Größen- (max. 12 MB) und Dauerlimits (max. 1 Min.).",'
    ),
    "ja": (
        '    tl_anchor_badge: "重要", tl_slot_badge: "イベント",\n'
        '    file_limit_title: "ファイル制限",'
        ' file_limit_size: "ファイルが12 MBの制限を超えています。",'
        ' file_limit_duration: "時間は1分を超えられません。",'
        ' file_limit_both: "ファイルがサイズ（最大12 MB）と時間（最大1分）の制限を超えています。",'
    ),
    "tr": (
        '    tl_anchor_badge: "Önemli", tl_slot_badge: "Olaylar",\n'
        '    file_limit_title: "Dosya Limiti",'
        ' file_limit_size: "Dosya 12 MB limitini aşıyor.",'
        ' file_limit_duration: "Süre 1 dakikayı geçmemelidir.",'
        ' file_limit_both: "Dosya boyut (maks. 12 MB) ve süre (maks. 1 dak.) limitlerini aşıyor.",'
    ),
    "vi": (
        '    tl_anchor_badge: "Quan trọng", tl_slot_badge: "Sự kiện",\n'
        '    file_limit_title: "Giới hạn tệp",'
        ' file_limit_size: "Tệp vượt quá giới hạn 12 MB.",'
        ' file_limit_duration: "Thời lượng không được vượt quá 1 phút.",'
        ' file_limit_both: "Tệp vượt quá giới hạn kích thước (tối đa 12 MB) và thời lượng (tối đa 1 phút).",'
    ),
    "he": (
        '    tl_anchor_badge: "משמעותי", tl_slot_badge: "אירועים",\n'
        '    file_limit_title: "מגבלת קובץ",'
        ' file_limit_size: "הקובץ חורג ממגבלת 12 MB.",'
        ' file_limit_duration: "משך הזמן לא יעלה על דקה אחת.",'
        ' file_limit_both: "הקובץ חורג ממגבלות הגודל (מקס׳ 12 MB) והמשך (מקס׳ 1 דקה).",'
    ),
    "fa": (
        '    tl_anchor_badge: "مهم", tl_slot_badge: "رویدادها",\n'
        '    file_limit_title: "محدودیت فایل",'
        ' file_limit_size: "فایل از حد ۱۲ مگابایت تجاوز می‌کند.",'
        ' file_limit_duration: "مدت زمان نباید از ۱ دقیقه تجاوز کند.",'
        ' file_limit_both: "فایل از محدودیت‌های اندازه (حداکثر ۱۲ MB) و مدت (حداکثر ۱ دقیقه) تجاوز می‌کند.",'
    ),
    "ko": (
        '    tl_anchor_badge: "중요", tl_slot_badge: "이벤트",\n'
        '    file_limit_title: "파일 제한",'
        ' file_limit_size: "파일이 12 MB 제한을 초과합니다.",'
        ' file_limit_duration: "재생 시간은 1분을 초과할 수 없습니다.",'
        ' file_limit_both: "파일이 크기(최대 12 MB) 및 재생 시간(최대 1분) 제한을 초과합니다.",'
    ),
    "it": (
        '    tl_anchor_badge: "Significativo", tl_slot_badge: "Eventi",\n'
        '    file_limit_title: "Limite file",'
        ' file_limit_size: "Il file supera il limite di 12 MB.",'
        ' file_limit_duration: "La durata non deve superare 1 minuto.",'
        ' file_limit_both: "Il file supera i limiti di dimensione (max. 12 MB) e durata (max. 1 min).",'
    ),
    "pl": (
        '    tl_anchor_badge: "Znaczące", tl_slot_badge: "Zdarzenia",\n'
        '    file_limit_title: "Limit pliku",'
        ' file_limit_size: "Plik przekracza limit 12 MB.",'
        ' file_limit_duration: "Czas trwania nie może przekroczyć 1 minuty.",'
        ' file_limit_both: "Plik przekracza limity rozmiaru (maks. 12 MB) i czasu trwania (maks. 1 min).",'
    ),
    "uk": (
        '    tl_anchor_badge: "Значуще", tl_slot_badge: "Події",\n'
        '    file_limit_title: "Ліміт файлу",'
        ' file_limit_size: "Файл перевищує ліміт 12 МБ.",'
        ' file_limit_duration: "Тривалість не повинна перевищувати 1 хвилину.",'
        ' file_limit_both: "Файл перевищує ліміти розміру (макс. 12 МБ) і тривалості (макс. 1 хв).",'
    ),
    "nl": (
        '    tl_anchor_badge: "Significant", tl_slot_badge: "Evenementen",\n'
        '    file_limit_title: "Bestandslimiet",'
        ' file_limit_size: "Bestand overschrijdt de limiet van 12 MB.",'
        ' file_limit_duration: "Duur mag niet meer dan 1 minuut zijn.",'
        ' file_limit_both: "Bestand overschrijdt limieten voor grootte (max. 12 MB) en duur (max. 1 min).",'
    ),
    "kk": (
        '    tl_anchor_badge: "Маңызды", tl_slot_badge: "Оқиғалар",\n'
        '    file_limit_title: "Файл шегі",'
        ' file_limit_size: "Файл 12 МБ шегінен асады.",'
        ' file_limit_duration: "Ұзақтығы 1 минуттан аспауы керек.",'
        ' file_limit_both: "Файл өлшем (макс. 12 МБ) және ұзақтық (макс. 1 мин) шектерінен асады.",'
    ),
    "uz": (
        '    tl_anchor_badge: "Muhim", tl_slot_badge: "Voqealar",\n'
        '    file_limit_title: "Fayl chegarasi",'
        ' file_limit_size: "Fayl 12 MB chegarasidan oshib ketdi.",'
        ' file_limit_duration: "Davomiylik 1 daqiqadan oshmasligi kerak.",'
        ' file_limit_both: "Fayl hajm (maks. 12 MB) va davomiylik (maks. 1 daqiqa) chegaralaridan oshib ketdi.",'
    ),
}

for lang, new_lines in NEW_KEYS.items():
    # Match the specific language block and insert new keys before closing },
    pattern = rf"(  {lang}: {{.*?sa_time_ph: \"[^\"]*\",)\n  }},"
    replacement = rf"\1\n{new_lines}\n  }},"
    new_content = re.sub(pattern, replacement, content, count=1, flags=re.DOTALL)
    if new_content == content:
        print(f"WARNING: no match for lang={lang}", file=sys.stderr)
    content = new_content

# ── 4. Append el / cs / sv complete dictionaries ─────────────────────────────
EL_BLOCK = '''  el: {
    tab_timer: "TiMETR", tab_timeline: "Χρονολόγιο", tab_economy: "Οικονομία",
    tab_embassies: "Πρεσβείες", tab_auction: "Δημοπρασία", tab_tv: "TV",
    tab_chronopedia: "Χρονοπαιδεία", tab_time: "Χρόνος", tab_clock: "Ρολόι",
    login: "Σύνδεση", logout: "Αποσύνδεση", refresh: "Ανανέωση",
    cancel: "Ακύρωση", back: "Πίσω", save: "Αποθήκευση", search: "Αναζήτηση",
    loading: "Φόρτωση…", confirm: "Επιβεβαίωση", close: "Κλείσιμο", submit: "Υποβολή", soon: "Σύντομα",
    login_placeholder: "ID ή ψευδώνυμο", login_password: "Κωδικός",
    citizen_not_found: "Ο πολίτης δεν βρέθηκε", connection_error: "Σφάλμα σύνδεσης", error: "Σφάλμα", insufficient_funds: "Ανεπαρκή Darmins",
    digital_state: "Ψηφιακό κράτος",
    logout_confirm_title: "Αποσύνδεση", logout_confirm_msg: "Τα δεδομένα πολίτη θα αφαιρεθούν από αυτή τη συσκευή.", logout_confirm_yes: "Αποσύνδεση",
    stats_registry: "Μητρώο", stats_bank: "Τράπεζα", stats_topup: "Ανατροφοδότηση",
    stats_audit: "Έλεγχος", stats_deposit: "Κατάθεση",
    stats_citizens: "πολίτες", stats_active: "ενεργοί",
    stats_transactions: "συναλλαγές", stats_in_circulation: "D σε κυκλοφορία",
    stats_top_givers: "ΚΟΡΥΦΑΙΟΙ ΔΩΡΗΤΕΣ", stats_recent_tx: "ΤΕΛΕΥΤΑΙΕΣ ΣΥΝΑΛΛΑΓΕΣ",
    stats_no_tx: "Δεν υπάρχουν συναλλαγές", stats_start_hint: "Ξεκινήστε την πρώτη σας συνεδρία TiMETR",
    stats_calc_title: "ΥΠΟΛΟΓΙΣΤΗΣ DARMIN", stats_darmin_amount: "Darmins",
    stats_base_price: "Βασική τιμή", stats_total: "Σύνολο",
    stats_discount_table: "ΠΙΝΑΚΑΣ ΕΚΠΤΩΣΕΩΝ", stats_no_discount: "χωρίς έκπτωση",
    emb_info: "Παρέχετε 1 m² για κόμβο — κερδίστε Darmins για uptime.",
    emb_empty: "Δεν υπάρχουν καταχωρημένες πρεσβείες", emb_empty_sub: "Γίνετε ο πρώτος Πρέσβης του TimeNation",
    emb_reg_title: "Εγγραφή πρεσβείας", emb_reg_sub: "Εισάγετε συντεταγμένες ή Google Plus Code",
    emb_loc_label: "Τοποθεσία / Plus Code", emb_addr_ph: "Διεύθυνση (προαιρετικό)",
    emb_nft_note: "Το NFT πιστοποιητικό «Πρέσβης TimeNation» εκδίδεται αυτόματα.",
    emb_submit: "Εγγραφή", emb_scan_qr: "Σάρωση QR κόμβου (κάμερα)",
    emb_verify_gps: "Επαλήθευση μέσω GPS (χωρίς κάμερα)",
    emb_pol_sub: "Σταθείτε εντός 1 μέτρου από τον κόμβο και πατήστε το κουμπί.",
    emb_verify_presence: "Επαλήθευση της παρουσίας μου", emb_verified: "ΕΠΑΛΗΘΕΥΜΕΝΟ",
    auc_info: "P2P αγορά Darmin. Η πλατφόρμα χρεώνει 2% επί ολοκληρωμένων συναλλαγών.",
    auc_empty: "Δεν υπάρχουν ενεργά lotes", auc_empty_sub: "Βγάλτε τα Darmins σας σε πώληση",
    auc_new_lot: "Νέο lote", auc_lot_sub: "Τα κλειδωμένα Darmins θα μεταφερθούν στον νικητή",
    auc_amount_ph: "Ποσό Darmins", auc_price_ph: "Αρχική προσφορά (Darmins)",
    auc_duration_ph: "Διάρκεια (ώρες, 1–168)",
    auc_fee_note: "Χρέωση πλατφόρμας: 2% της τελικής τιμής",
    auc_submit: "Καταχώρηση σε δημοπρασία", auc_bid_btn: "Υποβολή προσφοράς",
    auc_bid_title: "Προσφορά", auc_current_bid: "Τρέχουσα προσφορά:", auc_bid_ph: "Η προσφορά σας",
    auc_bid_confirm: "Επιβεβαίωση προσφοράς", auc_own: "(δικό μου)", auc_finished: "Ολοκληρώθηκε", auc_bid_label: "Προσφορά",
    tl_jump: "Μετάβαση", tl_year_ph: "Έτος", tl_month_ph: "Μήνας", tl_day_ph: "Ημέρα",
    tl_choose_hour: "— επιλέξτε ώρα", tl_choose_minute: "— επιλέξτε λεπτό",
    tl_anchor_title: "⏳ Αγκύρωση συντεταγμένης", tl_anchor_cost: "Για πάντα στη γενεαλογία σας · Κόστος: 1 Darmin",
    tl_anchor_btn: "Αγκύρωση", tl_go_to_minute: "Μετάβαση στο λεπτό",
    tl_open_timeline: "Άνοιγμα σε χρονολόγιο", tl_create_capsule: "Δημιουργία κάψουλας νοήματος",
    tl_capsule_sub: "Ενσωμάτωση κειμένου σε χρονική συντεταγμένη",
    tl_to_auction: "Καταχώρηση σε δημοπρασία", tl_to_auction_sub: "Πώληση λεπτού στην αγορά P2P",
    tl_swap_free: "Ανταλλαγή με ελεύθερο λεπτό", tl_swap_free_sub: "Μετακίνηση άγκυρας σε κενή συντεταγμένη",
    tl_swap_occ: "Ανταλλαγή με κατειλημμένο λεπτό", tl_swap_occ_sub: "Συμφωνηθείσα ανταλλαγή με άλλον πολίτη",
    tl_capsule_modal_title: "Κάψουλα νοήματος",
    timer_transfer: "Μεταφορά", timer_wallet: "Πορτοφόλι", timer_escrow_tab: "Escrow",
    timer_session_active: "Μεταφορά σε εξέλιξη", timer_pick_recipient: "Επιλέξτε παραλήπτη",
    timer_no_citizens: "Δεν υπάρχουν άλλοι πολίτες", timer_invite_hint: "Προσκαλέστε μέλη στο TimeNation",
    timer_get_citizenship: "Απόκτηση ιθαγένειας", timer_get_60d: "Εγγραφή και 1 Darmin δώρο",
    timer_start: "ΕΝΑΡΞΗ", timer_stop: "ΔΙΑΚΟΠΗ",
    timer_per_minute: "ανά λεπτό", timer_per_hour: "ανά ώρα", timer_reviews: "κριτικές",
    timer_confirmed: "επιβεβαιωμένο", timer_ai_checker: "Έλεγχος AI Ελεγκτή",
    escrow_title: "Συμφωνίες Escrow", escrow_new_deal: "Δημιουργία συμφωνίας",
    deal_accept: "Αποδοχή εργασίας", deal_proof: "Υποβολή έργου", deal_complete: "Υπογραφή Πράξης",
    deal_decline: "Απόρριψη", deal_dispute: "Έφεση στο Υπουργείο",
    deal_cancel_deal: "Ακύρωση συμφωνίας", deal_discuss: "Συζήτηση",
    deal_customer: "Εσείς: Πελάτης", deal_executor: "Εσείς: Εκτελεστής",
    deal_verdict: "Απόφαση AI Διαιτητή",
    deal_step1: "Βήμα 1 από 2 — Περιγραφή εργασίας", deal_step2: "Βήμα 2 από 2 — Επιβεβαίωση συμφωνίας",
    deal_task_label: "ΠΕΡΙΓΡΑΦΗ ΕΡΓΑΣΙΑΣ", deal_executor_label: "ΕΚΤΕΛΕΣΤΗΣ",
    deal_amount_label: "ΠΟΣΟ (DARMINS)", deal_proof_label: "ΠΕΡΙΓΡΑΦΗ ΕΚΤΕΛΕΣΜΕΝΗΣ ΕΡΓΑΣΙΑΣ",
    deal_claim_label: "ΛΕΠΤΟΜΕΡΕΙΕΣ ΑΞΙΩΣΗΣ",
    deal_no_deals: "Δεν υπάρχουν ενεργές συμφωνίες",
    deal_no_deals_sub: "Δημιουργήστε συμφωνία — Darmins κλειδώνουν μέχρι την Πράξη",
    deal_frozen: "Darmins κλειδωμένα",
    deal_status_open: "Ανοιχτή", deal_status_accepted: "Αποδεκτή", deal_status_proof: "Αναμονή Πράξης",
    deal_status_done: "Ολοκληρώθηκε ✓", deal_status_declined: "Απορρίφθηκε",
    deal_status_disputed: "Σε διαιτησία ⚖️", deal_status_cancelled: "Ακυρώθηκε",
    deal_audit_btn: "Αξιολόγηση εργασίας", deal_create_btn: "Κλείδωμα Darmins και δημιουργία συμφωνίας",
    deal_send_proof: "Αποστολή απόδειξης", deal_send_claim: "Υποβολή έφεσης",
    deal_ai_verdict: "Απόφαση Υπουργείου", deal_breakdown: "ΑΝΑΛΥΣΗ ΑΝΑ ΣΤΑΔΙΟ",
    deal_ai_name: "AI Εργατικός Ελεγκτής", deal_ai_desc: "Ο ελεγκτής θα εκτιμήσει τον κόπο σε Darmins και θα προτείνει δίκαιο ποσό.",
    deal_recommended: "Προτεινόμενο ποσό", deal_change_task: "✎ Επεξεργασία εργασίας", deal_restore_rec: "↩ Επαναφορά σύστασης",
    tv_today: "Σήμερα", tv_confirm_age: "Επιβεβαίωση ηλικίας",
    tv_manifesto_label: "Μανιφέστο (κείμενο για AI)", tv_style_label: "Στυλ βίντεο",
    tv_policy_label: "Πολιτική μετάδοσης",
    tv_vision_ph: "Περιγράψτε το όραμά σας ή αφήστε κενό για αυτόματη δημιουργία…",
    tv_create_capsule: "Δημιουργία AI κάψουλας", tv_ai_preview: "Προεπισκόπηση AI",
    tv_free_slot: "Ελεύθερο", tv_booked_slot: "Κλειστό", tv_retro_slot: "Ρετρό",
    tv_book_slot: "Κράτηση slot", tv_schedule: "Πρόγραμμα", tv_capsule_title: "Πατήστε slot για διαχείριση κάψουλας",
    tv_guide_text: "Κρατήστε χρόνο εκπομπής. Το κείμενό σας γίνεται prompt, το AI αποδίδει βίντεο.",
    tv_live: "ΣΤΟ ΑΙΘΕΡΑ", tv_awaiting: "Αναμονή εκπομπής", tv_selected: "Επιλεγμένο",
    tv_age_gate_title: "Επιβεβαίωση ηλικίας", tv_age_gate_body: "Περιεχόμενο μόνο για ενήλικες (18+).",
    tv_age_confirm: "Επιβεβαιώνω ότι είμαι 18+", no_internet: "Δεν υπάρχει σύνδεση internet",
    tos_title: "Αποδέχομαι", tos_short: "Όροι Χρήσης",
    tl_enter_coords: "Συμπληρώστε τα υποχρεωτικά πεδία", tl_code_placeholder: "Εισάγετε χρονικό δείκτη",
    timeline_list: "Λίστα", pls_login: "Συνδεθείτε για πρόσβαση",
    eco_balance: "Υπόλοιπο", tx_desc_placeholder: "Περιλαμβάνει κρατικό τέλος 2%",
    chrono_add_opinion: "Προσθήκη γνώμης", chrono_create_point: "Δημιουργία σημείου",
    chrono_new_point: "Νέο σημείο", chrono_search_place: "Αναζήτηση τοποθεσίας",
    chrono_loc_name: "Όνομα τοποθεσίας", chrono_coords: "Συντεταγμένες (γεωγρ. πλάτος, μήκος)",
    chrono_event_date: "Ημερομηνία/ώρα γεγονότος",
    chrono_opinion_title: "Τίτλος γνώμης", chrono_opinion_body: "Η γνώμη/περιγραφή σας",
    chrono_addr_ph: "Διεύθυνση ή Plus Code…", chrono_loc_ph: "Αθήνα, Ακρόπολη…",
    chrono_title_ph: "Σύντομα — ποιο είναι το νόημα;", chrono_body_ph: "Τι συνέβη κατά τη γνώμη σας;",
    time_zones_tab: "Ζώνες ώρας", time_timer_tab: "Χρονόμετρο", time_alarm_tab: "Ξυπνητήρι",
    time_world_clock: "🌍 Παγκόσμιο ρολόι", time_pomodoro: "⏱ Χρονόμετρο εστίασης",
    time_alarm: "⏰ Κυρίαρχο ξυπνητήρι",
    time_start_btn: "Έναρξη", time_pause_btn: "Παύση", time_reset_btn: "Επαναφορά",
    time_stop_alarm: "Διακοπή", time_session_done: "Συνεδρία ολοκληρώθηκε!",
    time_ready: "Έτοιμο για εκκίνηση", time_focusing: "Εστίαση…",
    today: "Σήμερα", tv_filter_all: "Όλα",
    tv_slot_citizen: "Πολίτης · 1 D", tv_slot_quarter: "Τέταρτο · 5 D", tv_slot_half: "Μισό · 10 D", tv_slot_apex: "Κορυφή · 25 D",
    tv_broadcast_echo: "Ηχώ (δημόσιο)", tv_broadcast_noise: "Θόρυβος (ημι-δημόσιο)", tv_broadcast_private: "Ιδιωτικό",
    tv_render_prompt: "Δημιουργία μανιφέστου…", tv_render_tts: "Δημιουργία φωνής…", tv_render_scenes: "Δημιουργία 3 σκηνών Prime…",
    tv_render_fetching_scenes: "Λήψη AI φόντων (3 σκηνές)…", tv_render_compositing: "Σύνθεση σκηνών…",
    tv_render_fetching_video: "Λήψη AI φόντου…", tv_render_encoding: "Κωδικοποίηση MP4…", tv_render_done: "Έτοιμο!",
    tv_style_space: "Διάστημα", tv_style_space_desc: "Σκούρο μπλε, κεχριμπάρι",
    tv_style_cyberpunk: "Κυβερνοπάνκ", tv_style_cyberpunk_desc: "Μαύρο, νέον",
    tv_style_abstract: "Αφηρημένο", tv_style_abstract_desc: "Μωβ, χρυσό",
    tv_style_nature: "Φύση", tv_style_nature_desc: "Σκούρο πράσινο, μέντα",
    tv_style_minimal: "Minimal", tv_style_minimal_desc: "Μαύρο, λευκό",
    shop_title: "Ταμείο", shop_subtitle: "1 Darmin = 1 € · προοδευτικές εκπτώσεις",
    shop_register_hint: "Εγγραφή ως πολίτης για αγορά Darmins",
    shop_amount_label: "Αριθμός Darmins", shop_amount_placeholder: "π.χ. 250",
    shop_discount_label: "Έκπτωση", shop_no_discount_val: "καμία",
    shop_total_label: "Σύνολο πληρωμής", shop_per_darmin_label: "Τιμή ανά 1 D",
    shop_empty_hint: "Εισάγετε αριθμό Darmins (ελάχιστο 1)",
    shop_progressive_discounts: "Προοδευτικές εκπτώσεις", shop_tier_discount_prefix: "έκπτωση",
    shop_tier_no_discount: "χωρίς έκπτωση", shop_tier_above: "πάνω από",
    shop_legal: "Πληρωμή μέσω Stripe (EUR). Τα Darmins είναι credits εντός παιχνιδιού. Δεν είναι ηλεκτρονικό χρήμα.",
    shop_webhook_note: "Το υπόλοιπο ενημερώνεται αυτόματα μέσω Stripe Webhook. Αν τα Darmins δεν πιστωθούν, ανοίξτε ξανά την εφαρμογή.",
    shop_need_auth: "Απαιτείται εξουσιοδότηση", shop_register_cta: "Εγγραφή ως πολίτης",
    shop_enter_min_error: "Εισάγετε αριθμό Darmins (ελάχιστο 1)", shop_payment_error: "Δεν ήταν δυνατή η δημιουργία συνεδρίας πληρωμής",
    sa_title: "Κοινωνικό Σήμα", sa_subtitle: "Συγχρονισμένη ενεργοποίηση Ύμνου TimeNation",
    sa_consent_label: "Να επιτρέπεται σε άλλους να με ξυπνούν με τον Ύμνο TimeNation",
    sa_consent_hint: "Άλλοι πολίτες θα μπορούν να σας στείλουν σήμα",
    sa_send_signal: "Αναπαραγωγή Ύμνου για επιλεγμένους",
    sa_search_ph: "Αναζήτηση πολιτών...", sa_global_alarm: "Παγκόσμιο Σήμα (Διαχ.)",
    sa_trigger_global: "Ενεργοποίηση για όλους τους συνδρομητές",
    sa_overlay_admin: "Προσοχή! Παγκόσμιο Κοινωνικό Σήμα ενεργοποιήθηκε από την Κυβέρνηση TimeNation",
    sa_overlay_user: "σας προσκαλεί στο Κοινωνικό Σήμα!",
    sa_tap_to_play: "Πατήστε οπουδήποτε στην οθόνη για αναπαραγωγή Ύμνου!",
    sa_dismiss: "Κλείσιμο", sa_sent: "Σήμα εστάλη!", sa_no_subscribers: "Δεν υπάρχουν πολίτες με ενεργή συγκατάθεση",
    sa_login_required: "Συνδεθείτε για χρήση Κοινωνικού Σήματος",
    sa_select_targets: "Επιλογή παραληπτών", sa_selected: "επιλεγμένο", sa_consent_saved: "Ρυθμίσεις αποθηκεύτηκαν",
    sa_tab: "Σήμα-Συγχρ.", sa_sync_params: "Παράμετροι συγχρονισμού", sa_alarm_time: "Χρόνος ενεργοποίησης",
    sa_purpose_label: "Σκοπός ειδοποίησης", sa_purpose_ph: "Ορίστε στόχο (π.χ. Γενική Σύνοδος / Παρέλαση Πλανητών)", sa_time_ph: "ΩΩ:ΛΛ",
    tl_anchor_badge: "Σημαντικό", tl_slot_badge: "Γεγονότα",
    file_limit_title: "Όριο αρχείου", file_limit_size: "Το αρχείο υπερβαίνει το όριο 12 MB.", file_limit_duration: "Η διάρκεια δεν πρέπει να υπερβαίνει 1 λεπτό.", file_limit_both: "Το αρχείο υπερβαίνει τα όρια μεγέθους (μέγ. 12 MB) και διάρκειας (μέγ. 1 λεπτό).",
  },'''

CS_BLOCK = '''  cs: {
    tab_timer: "TiMETR", tab_timeline: "Časová osa", tab_economy: "Ekonomika",
    tab_embassies: "Velvyslanectví", tab_auction: "Aukce", tab_tv: "TV",
    tab_chronopedia: "Chronopedie", tab_time: "Čas", tab_clock: "Hodiny",
    login: "Přihlásit", logout: "Odhlásit", refresh: "Obnovit",
    cancel: "Zrušit", back: "Zpět", save: "Uložit", search: "Hledat",
    loading: "Načítání…", confirm: "Potvrdit", close: "Zavřít", submit: "Odeslat", soon: "Brzy",
    login_placeholder: "ID nebo přezdívka", login_password: "Heslo",
    citizen_not_found: "Občan nenalezen", connection_error: "Chyba připojení", error: "Chyba", insufficient_funds: "Nedostatek Darminů",
    digital_state: "Digitální stát",
    logout_confirm_title: "Odhlásit", logout_confirm_msg: "Data občana budou odstraněna z tohoto zařízení.", logout_confirm_yes: "Odhlásit",
    stats_registry: "Registr", stats_bank: "Banka", stats_topup: "Doplnit",
    stats_audit: "Audit", stats_deposit: "Vklad",
    stats_citizens: "občanů", stats_active: "aktivních",
    stats_transactions: "transakcí", stats_in_circulation: "D v oběhu",
    stats_top_givers: "TOP DÁRCI", stats_recent_tx: "POSLEDNÍ TRANSAKCE",
    stats_no_tx: "Žádné transakce", stats_start_hint: "Spusťte první TiMETR relaci",
    stats_calc_title: "KALKULÁTOR DARMINŮ", stats_darmin_amount: "Darminů",
    stats_base_price: "Základní cena", stats_total: "Celkem",
    stats_discount_table: "TABULKA SLEV", stats_no_discount: "žádná sleva",
    emb_info: "Poskytněte 1 m² pro uzel — vydělávejte Darminy za dostupnost.",
    emb_empty: "Žádná registrovaná velvyslanectví", emb_empty_sub: "Buďte prvním Velvyslancem TimeNation",
    emb_reg_title: "Registrace velvyslanectví", emb_reg_sub: "Zadejte souřadnice nebo Google Plus Code",
    emb_loc_label: "Poloha / Plus Code", emb_addr_ph: "Adresa (volitelné)",
    emb_nft_note: "NFT certifikát «Velvyslanec TimeNation» se vydá automaticky.",
    emb_submit: "Registrovat", emb_scan_qr: "Skenovat QR uzlu (kamera)",
    emb_verify_gps: "Ověřit přes GPS (bez kamery)",
    emb_pol_sub: "Postavte se do 1 metru od uzlového zařízení a stiskněte tlačítko.",
    emb_verify_presence: "Ověřit mou přítomnost", emb_verified: "OVĚŘENO",
    auc_info: "P2P trh Darminů. Platforma účtuje 2 % z uzavřených obchodů.",
    auc_empty: "Žádné aktivní šarže", auc_empty_sub: "Dejte Darminy na prodej",
    auc_new_lot: "Nová šarže", auc_lot_sub: "Zamčené Darminy budou předány vítězi aukce",
    auc_amount_ph: "Počet Darminů", auc_price_ph: "Počáteční nabídka (Darminy)",
    auc_duration_ph: "Trvání (hodiny, 1–168)",
    auc_fee_note: "Poplatek platformy: 2 % z konečné ceny",
    auc_submit: "Zařadit do aukce", auc_bid_btn: "Přihodit",
    auc_bid_title: "Nabídka", auc_current_bid: "Aktuální nabídka:", auc_bid_ph: "Vaše nabídka",
    auc_bid_confirm: "Potvrdit nabídku", auc_own: "(moje)", auc_finished: "Ukončeno", auc_bid_label: "Nabídka",
    tl_jump: "Přejít", tl_year_ph: "Rok", tl_month_ph: "Měsíc", tl_day_ph: "Den",
    tl_choose_hour: "— vyberte hodinu", tl_choose_minute: "— vyberte minutu",
    tl_anchor_title: "⏳ Ukotvit souřadnici", tl_anchor_cost: "Navždy ve vašem rodu · Cena: 1 Darmin",
    tl_anchor_btn: "Ukotvit", tl_go_to_minute: "Přejít na minutu",
    tl_open_timeline: "Otevřít v časové ose", tl_create_capsule: "Vytvořit smyslovou kapsuli",
    tl_capsule_sub: "Vložit text do časové souřadnice",
    tl_to_auction: "Zařadit do aukce", tl_to_auction_sub: "Prodat minutu na P2P trhu za Darminy",
    tl_swap_free: "Vyměnit za volnou minutu", tl_swap_free_sub: "Přesunout kotvu na volnou souřadnici",
    tl_swap_occ: "Vyměnit za obsazenou minutu", tl_swap_occ_sub: "Dohodnutá výměna s jiným občanem",
    tl_capsule_modal_title: "Smyslová kapsule",
    timer_transfer: "Převod", timer_wallet: "Peněženka", timer_escrow_tab: "Escrow",
    timer_session_active: "Probíhá přenos", timer_pick_recipient: "Vyberte příjemce",
    timer_no_citizens: "Žádní další občané", timer_invite_hint: "Pozvěte členy do TimeNation",
    timer_get_citizenship: "Získat občanství", timer_get_60d: "Registrujte se a získejte 1 Darmin",
    timer_start: "START", timer_stop: "STOP",
    timer_per_minute: "za minutu", timer_per_hour: "za hodinu", timer_reviews: "recenzí",
    timer_confirmed: "potvrzeno", timer_ai_checker: "Kontrola AI auditorem",
    escrow_title: "Escrow dohody", escrow_new_deal: "Vytvořit dohodu",
    deal_accept: "Přijmout úkol", deal_proof: "Odevzdat práci", deal_complete: "Podepsat protokol",
    deal_decline: "Odmítnout", deal_dispute: "Odvolání na ministerstvo",
    deal_cancel_deal: "Zrušit dohodu", deal_discuss: "Diskutovat",
    deal_customer: "Vy: Klient", deal_executor: "Vy: Dodavatel",
    deal_verdict: "Rozhodnutí AI arbitra",
    deal_step1: "Krok 1 ze 2 — Popis úkolu", deal_step2: "Krok 2 ze 2 — Potvrzení dohody",
    deal_task_label: "ZADÁNÍ ÚKOLU", deal_executor_label: "DODAVATEL",
    deal_amount_label: "ČÁSTKA (DARMINY)", deal_proof_label: "POPIS ODVEDENÉ PRÁCE",
    deal_claim_label: "PODROBNOSTI REKLAMACE",
    deal_no_deals: "Žádné aktivní dohody",
    deal_no_deals_sub: "Vytvořte dohodu — Darminy budou zamčeny do podpisu protokolu",
    deal_frozen: "Darminy zamčeny",
    deal_status_open: "Otevřená", deal_status_accepted: "Přijatá dodavatelem",
    deal_status_proof: "Čeká na podpis", deal_status_done: "Dokončeno ✓",
    deal_status_declined: "Důkaz odmítnut",
    deal_status_disputed: "V arbitráži ⚖️", deal_status_cancelled: "Zrušeno",
    deal_audit_btn: "Zhodnotit úkol", deal_create_btn: "Zamknout Darminy a vytvořit dohodu",
    deal_send_proof: "Odeslat důkaz", deal_send_claim: "Podat odvolání",
    deal_ai_verdict: "Rozhodnutí ministerstva", deal_breakdown: "ROZDĚLENÍ PO ETAPÁCH",
    deal_ai_name: "AI pracovní auditor", deal_ai_desc: "Auditor odhadne pracnost v Darminech a navrhne spravedlivou částku.",
    deal_recommended: "Doporučená částka", deal_change_task: "✎ Upravit úkol", deal_restore_rec: "↩ Obnovit doporučení",
    tv_today: "Dnes", tv_confirm_age: "Potvrzení věku",
    tv_manifesto_label: "Manifest (text pro AI)", tv_style_label: "Styl videa",
    tv_policy_label: "Vysílací politika",
    tv_vision_ph: "Popište svou vizi nebo nechte prázdné pro automatické generování…",
    tv_create_capsule: "Vytvořit AI kapsuli", tv_ai_preview: "Náhled AI",
    tv_free_slot: "Volné", tv_booked_slot: "Obsazeno", tv_retro_slot: "Retro",
    tv_book_slot: "Rezervovat slot", tv_schedule: "Program", tv_capsule_title: "Klepněte na slot pro správu kapsule",
    tv_guide_text: "Rezervujte vysílací čas. Váš text se stane promptem, AI vyrenderuje video.",
    tv_live: "V ÉTERU", tv_awaiting: "Čeká na vysílání", tv_selected: "Vybráno",
    tv_age_gate_title: "Potvrzení věku", tv_age_gate_body: "Obsah pouze pro dospělé (18+).",
    tv_age_confirm: "Potvrzuji, že mi je 18+", no_internet: "Žádné připojení k internetu",
    tos_title: "Přijímám", tos_short: "Podmínky použití",
    tl_enter_coords: "Vyplňte povinná pole", tl_code_placeholder: "Zadejte časový marker",
    timeline_list: "Seznam", pls_login: "Přihlaste se pro přístup",
    eco_balance: "Zůstatek", tx_desc_placeholder: "Zahrnuje 2% státní poplatek",
    chrono_add_opinion: "Přidat názor", chrono_create_point: "Vytvořit bod",
    chrono_new_point: "Nový bod", chrono_search_place: "Hledat místo",
    chrono_loc_name: "Název místa", chrono_coords: "Souřadnice (zeměp. šířka, délka)",
    chrono_event_date: "Datum/čas události",
    chrono_opinion_title: "Název názoru", chrono_opinion_body: "Váš názor / popis",
    chrono_addr_ph: "Adresa nebo Plus Code…", chrono_loc_ph: "Praha, Staroměstské náměstí…",
    chrono_title_ph: "Stručně — o co jde?", chrono_body_ph: "Co se podle vás stalo?",
    time_zones_tab: "Časová pásma", time_timer_tab: "Časovač", time_alarm_tab: "Budík",
    time_world_clock: "🌍 Světové hodiny", time_pomodoro: "⏱ Časovač soustředění",
    time_alarm: "⏰ Svrchovaný budík",
    time_start_btn: "Spustit", time_pause_btn: "Pozastavit", time_reset_btn: "Resetovat",
    time_stop_alarm: "Zastavit", time_session_done: "Relace skončila!",
    time_ready: "Připraveno ke spuštění", time_focusing: "Soustředění…",
    today: "Dnes", tv_filter_all: "Vše",
    tv_slot_citizen: "Občan · 1 D", tv_slot_quarter: "Čtvrt · 5 D", tv_slot_half: "Půl · 10 D", tv_slot_apex: "Vrchol · 25 D",
    tv_broadcast_echo: "Ozvěna (veřejné)", tv_broadcast_noise: "Šum (polosoukromé)", tv_broadcast_private: "Soukromé",
    tv_render_prompt: "Generuji manifest…", tv_render_tts: "Generuji hlas…", tv_render_scenes: "Generuji 3 Prime scény…",
    tv_render_fetching_scenes: "Stahuji AI pozadí (3 scény)…", tv_render_compositing: "Skládám scény…",
    tv_render_fetching_video: "Stahuji AI pozadí…", tv_render_encoding: "Kóduji MP4…", tv_render_done: "Hotovo!",
    tv_style_space: "Vesmír", tv_style_space_desc: "Tmavě modrá, jantar",
    tv_style_cyberpunk: "Cyberpunk", tv_style_cyberpunk_desc: "Černá, neon",
    tv_style_abstract: "Abstraktní", tv_style_abstract_desc: "Fialová, zlatá",
    tv_style_nature: "Příroda", tv_style_nature_desc: "Tmavě zelená, máta",
    tv_style_minimal: "Minimální", tv_style_minimal_desc: "Černá, bílá",
    shop_title: "Pokladna", shop_subtitle: "1 Darmin = 1 € · progresivní slevy",
    shop_register_hint: "Zaregistrujte se jako občan pro nákup Darminů",
    shop_amount_label: "Počet Darminů", shop_amount_placeholder: "např. 250",
    shop_discount_label: "Sleva", shop_no_discount_val: "žádná",
    shop_total_label: "Celkem k platbě", shop_per_darmin_label: "Cena za 1 D",
    shop_empty_hint: "Zadejte počet Darminů (minimum 1)",
    shop_progressive_discounts: "Progresivní slevy", shop_tier_discount_prefix: "sleva",
    shop_tier_no_discount: "bez slevy", shop_tier_above: "více než",
    shop_legal: "Platba přes Stripe (EUR). Darminy jsou herní kredity. Nejsou elektronickými penězi.",
    shop_webhook_note: "Zůstatek se aktualizuje automaticky přes Stripe Webhook. Pokud Darminy nebyly připsány, restartujte aplikaci.",
    shop_need_auth: "Vyžaduje se autorizace", shop_register_cta: "Registrovat se jako občan",
    shop_enter_min_error: "Zadejte počet Darminů (minimum 1)", shop_payment_error: "Platební relaci se nepodařilo vytvořit",
    sa_title: "Sociální signál", sa_subtitle: "Synchronizovaná aktivace Hymny TimeNation",
    sa_consent_label: "Povolit ostatním probudit mě Hymnou TimeNation",
    sa_consent_hint: "Ostatní občané vám budou moci poslat signál",
    sa_send_signal: "Přehrát Hymnu pro vybrané",
    sa_search_ph: "Hledat občany...", sa_global_alarm: "Globální signál (Admin)",
    sa_trigger_global: "Aktivovat pro všechny předplatitele",
    sa_overlay_admin: "Pozor! Globální sociální signál aktivován Vládou TimeNation",
    sa_overlay_user: "vás zve k sociálnímu signálu!",
    sa_tap_to_play: "Klepněte kamkoli na obrazovku pro přehrání Hymny!",
    sa_dismiss: "Zavřít", sa_sent: "Signál odeslán!", sa_no_subscribers: "Žádní občané s aktivním souhlasem",
    sa_login_required: "Přihlaste se pro použití sociálního signálu",
    sa_select_targets: "Vybrat příjemce", sa_selected: "vybráno", sa_consent_saved: "Nastavení uloženo",
    sa_tab: "Synchro-signál", sa_sync_params: "Parametry synchronizace", sa_alarm_time: "Čas aktivace",
    sa_purpose_label: "Účel oznámení", sa_purpose_ph: "Nastavte cíl (např. Obecné shromáždění / Planetární přehlídka)", sa_time_ph: "HH:MM",
    tl_anchor_badge: "Významné", tl_slot_badge: "Události",
    file_limit_title: "Limit souboru", file_limit_size: "Soubor překračuje limit 12 MB.", file_limit_duration: "Délka nesmí překročit 1 minutu.", file_limit_both: "Soubor překračuje limity velikosti (max. 12 MB) a délky (max. 1 min).",
  },'''

SV_BLOCK = '''  sv: {
    tab_timer: "TiMETR", tab_timeline: "Tidslinje", tab_economy: "Ekonomi",
    tab_embassies: "Ambassader", tab_auction: "Auktion", tab_tv: "TV",
    tab_chronopedia: "Kronopedia", tab_time: "Tid", tab_clock: "Klocka",
    login: "Logga in", logout: "Logga ut", refresh: "Uppdatera",
    cancel: "Avbryt", back: "Tillbaka", save: "Spara", search: "Sök",
    loading: "Laddar…", confirm: "Bekräfta", close: "Stäng", submit: "Skicka", soon: "Snart",
    login_placeholder: "ID eller smeknamn", login_password: "Lösenord",
    citizen_not_found: "Medborgare hittades inte", connection_error: "Anslutningsfel", error: "Fel", insufficient_funds: "Otillräckliga Darmins",
    digital_state: "Digital stat",
    logout_confirm_title: "Logga ut", logout_confirm_msg: "Medborgardata tas bort från enheten.", logout_confirm_yes: "Logga ut",
    stats_registry: "Register", stats_bank: "Bank", stats_topup: "Fyll på",
    stats_audit: "Revision", stats_deposit: "Insättning",
    stats_citizens: "medborgare", stats_active: "aktiva",
    stats_transactions: "transaktioner", stats_in_circulation: "D i omlopp",
    stats_top_givers: "TOPPGIVARE", stats_recent_tx: "SENASTE TRANSAKTIONER",
    stats_no_tx: "Inga transaktioner", stats_start_hint: "Starta din första TiMETR-session",
    stats_calc_title: "DARMIN-KALKYLATOR", stats_darmin_amount: "Darmins",
    stats_base_price: "Grundpris", stats_total: "Totalt",
    stats_discount_table: "RABATTTABELL", stats_no_discount: "ingen rabatt",
    emb_info: "Tillhandahåll 1 m² för en nod — tjäna Darmins för drifttid.",
    emb_empty: "Inga registrerade ambassader", emb_empty_sub: "Bli TimeNations första Ambassadör",
    emb_reg_title: "Registrera ambassad", emb_reg_sub: "Ange koordinater eller Google Plus Code",
    emb_loc_label: "Plats / Plus Code", emb_addr_ph: "Adress (valfritt)",
    emb_nft_note: "NFT-certifikatet «TimeNation Ambassadör» utfärdas automatiskt.",
    emb_submit: "Registrera", emb_scan_qr: "Skanna nod-QR (kamera)",
    emb_verify_gps: "Verifiera via GPS (utan kamera)",
    emb_pol_sub: "Stå inom 1 meter från nodutrustningen och tryck på knappen.",
    emb_verify_presence: "Verifiera min närvaro", emb_verified: "VERIFIERAD",
    auc_info: "P2P Darmin-marknad. Plattformen tar 2 % på avslutade affärer.",
    auc_empty: "Inga aktiva lots", auc_empty_sub: "Lägg ut dina Darmins till försäljning",
    auc_new_lot: "Nytt lot", auc_lot_sub: "Låsta Darmins överförs till auktionsvinnaren",
    auc_amount_ph: "Antal Darmins", auc_price_ph: "Startbud (Darmins)",
    auc_duration_ph: "Varaktighet (timmar, 1–168)",
    auc_fee_note: "Plattformsavgift: 2 % av slutpriset",
    auc_submit: "Lista på auktion", auc_bid_btn: "Lägg bud",
    auc_bid_title: "Bud", auc_current_bid: "Aktuellt bud:", auc_bid_ph: "Ditt bud",
    auc_bid_confirm: "Bekräfta bud", auc_own: "(mitt)", auc_finished: "Avslutad", auc_bid_label: "Bud",
    tl_jump: "Gå", tl_year_ph: "År", tl_month_ph: "Mån", tl_day_ph: "Dag",
    tl_choose_hour: "— välj timme", tl_choose_minute: "— välj minut",
    tl_anchor_title: "⏳ Ankra koordinat", tl_anchor_cost: "För alltid i din släkt · Kostnad: 1 Darmin",
    tl_anchor_btn: "Ankra", tl_go_to_minute: "Gå till minut",
    tl_open_timeline: "Öppna i tidslinje", tl_create_capsule: "Skapa meningsfull kapsel",
    tl_capsule_sub: "Bädda in text i en tidskoordinat",
    tl_to_auction: "Lista på auktion", tl_to_auction_sub: "Sälj minuten på P2P-marknaden för Darmins",
    tl_swap_free: "Byt mot ledig minut", tl_swap_free_sub: "Flytta ankaret till en ledig koordinat",
    tl_swap_occ: "Byt mot upptagen minut", tl_swap_occ_sub: "Förhandlat byte med en annan medborgare",
    tl_capsule_modal_title: "Meningsfull kapsel",
    timer_transfer: "Överföring", timer_wallet: "Plånbok", timer_escrow_tab: "Escrow",
    timer_session_active: "Överföring pågår", timer_pick_recipient: "Välj mottagare",
    timer_no_citizens: "Inga andra medborgare", timer_invite_hint: "Bjud in medlemmar till TimeNation",
    timer_get_citizenship: "Skaffa medborgarskap", timer_get_60d: "Registrera dig och få 1 Darmin",
    timer_start: "START", timer_stop: "STOPP",
    timer_per_minute: "per minut", timer_per_hour: "per timme", timer_reviews: "recensioner",
    timer_confirmed: "bekräftad", timer_ai_checker: "AI-revisorkontroll",
    escrow_title: "Escrow-avtal", escrow_new_deal: "Skapa avtal",
    deal_accept: "Acceptera uppdrag", deal_proof: "Lämna in arbete", deal_complete: "Signera protokoll",
    deal_decline: "Avvisa", deal_dispute: "Överklaga till ministeriet",
    deal_cancel_deal: "Avbryt avtal", deal_discuss: "Diskutera",
    deal_customer: "Du: Kund", deal_executor: "Du: Utförare",
    deal_verdict: "AI-skiljedomares beslut",
    deal_step1: "Steg 1 av 2 — Uppgiftsbeskrivning", deal_step2: "Steg 2 av 2 — Avtalsbekräftelse",
    deal_task_label: "UPPDRAGSBESKRIVNING", deal_executor_label: "UTFÖRARE",
    deal_amount_label: "BELOPP (DARMINS)", deal_proof_label: "BESKRIVNING AV UTFÖRT ARBETE",
    deal_claim_label: "KRAVDETALJER",
    deal_no_deals: "Inga aktiva avtal",
    deal_no_deals_sub: "Skapa avtal — Darmins låses tills protokollet signeras",
    deal_frozen: "Darmins låsta",
    deal_status_open: "Öppen", deal_status_accepted: "Accepterad av utförare",
    deal_status_proof: "Väntar på signering", deal_status_done: "Slutförd ✓",
    deal_status_declined: "Bevis avvisat",
    deal_status_disputed: "I skiljedomsförfarande ⚖️", deal_status_cancelled: "Annullerad",
    deal_audit_btn: "Utvärdera uppdrag", deal_create_btn: "Lås Darmins och skapa avtal",
    deal_send_proof: "Skicka bevis", deal_send_claim: "Lämna in överklagan",
    deal_ai_verdict: "Ministeriebeslut", deal_breakdown: "UPPDELNING PER ETAPP",
    deal_ai_name: "AI-arbetsrevisor", deal_ai_desc: "Revisorn uppskattar arbetsinsatsen i Darmins och föreslår ett rättvist belopp.",
    deal_recommended: "Rekommenderat belopp", deal_change_task: "✎ Redigera uppdrag", deal_restore_rec: "↩ Återställ rekommendation",
    tv_today: "Idag", tv_confirm_age: "Åldersbekräftelse",
    tv_manifesto_label: "Manifest (text för AI)", tv_style_label: "Videostil",
    tv_policy_label: "Sändningspolicy",
    tv_vision_ph: "Beskriv din vision eller lämna tomt för autogenerering…",
    tv_create_capsule: "Skapa AI-kapsel", tv_ai_preview: "AI-förhandsgranskning",
    tv_free_slot: "Ledig", tv_booked_slot: "Bokad", tv_retro_slot: "Retro",
    tv_book_slot: "Boka slot", tv_schedule: "Schema", tv_capsule_title: "Tryck på slot för att hantera kapsel",
    tv_guide_text: "Boka sändningstid. Din text blir en prompt, AI renderar unikt video.",
    tv_live: "PÅ SÄNDNING", tv_awaiting: "Väntar på sändning", tv_selected: "Valt",
    tv_age_gate_title: "Åldersbekräftelse", tv_age_gate_body: "Innehåll endast för vuxna (18+).",
    tv_age_confirm: "Jag bekräftar att jag är 18+", no_internet: "Ingen internetanslutning",
    tos_title: "Jag accepterar", tos_short: "Användarvillkor",
    tl_enter_coords: "Fyll i obligatoriska fält", tl_code_placeholder: "Ange tidsmarkör",
    timeline_list: "Lista", pls_login: "Logga in för åtkomst",
    eco_balance: "Saldo", tx_desc_placeholder: "Inkluderar 2 % statlig avgift",
    chrono_add_opinion: "Lägg till åsikt", chrono_create_point: "Skapa punkt",
    chrono_new_point: "Ny punkt", chrono_search_place: "Sök plats",
    chrono_loc_name: "Platsnamn", chrono_coords: "Koordinater (lat, lng)",
    chrono_event_date: "Händelsedatum / tid",
    chrono_opinion_title: "Åsiktstitel", chrono_opinion_body: "Din åsikt / beskrivning",
    chrono_addr_ph: "Adress eller Plus Code…", chrono_loc_ph: "Stockholm, Gamla stan…",
    chrono_title_ph: "Kortfattat — vad är poängen?", chrono_body_ph: "Vad hände enligt dig?",
    time_zones_tab: "Tidszoner", time_timer_tab: "Timer", time_alarm_tab: "Väckarklocka",
    time_world_clock: "🌍 Världsklocka", time_pomodoro: "⏱ Fokustimer",
    time_alarm: "⏰ Suverän väckarklocka",
    time_start_btn: "Starta", time_pause_btn: "Pausa", time_reset_btn: "Återställ",
    time_stop_alarm: "Stoppa", time_session_done: "Sessionen klar!",
    time_ready: "Redo att starta", time_focusing: "Fokuserar…",
    today: "Idag", tv_filter_all: "Alla",
    tv_slot_citizen: "Medborgare · 1 D", tv_slot_quarter: "Kvart · 5 D", tv_slot_half: "Halv · 10 D", tv_slot_apex: "Topp · 25 D",
    tv_broadcast_echo: "Eko (offentligt)", tv_broadcast_noise: "Brus (halvprivat)", tv_broadcast_private: "Privat",
    tv_render_prompt: "Genererar manifest…", tv_render_tts: "Genererar röst…", tv_render_scenes: "Genererar 3 Prime-scener…",
    tv_render_fetching_scenes: "Hämtar AI-bakgrunder (3 scener)…", tv_render_compositing: "Komponerar scener…",
    tv_render_fetching_video: "Hämtar AI-bakgrund…", tv_render_encoding: "Kodar MP4…", tv_render_done: "Klart!",
    tv_style_space: "Rymden", tv_style_space_desc: "Mörkblå, bärnsten",
    tv_style_cyberpunk: "Cyberpunk", tv_style_cyberpunk_desc: "Svart, neon",
    tv_style_abstract: "Abstrakt", tv_style_abstract_desc: "Lila, guld",
    tv_style_nature: "Natur", tv_style_nature_desc: "Mörkgrön, mint",
    tv_style_minimal: "Minimal", tv_style_minimal_desc: "Svart, vit",
    shop_title: "Skattkammaren", shop_subtitle: "1 Darmin = 1 € · progressiva rabatter",
    shop_register_hint: "Registrera dig som medborgare för att köpa Darmins",
    shop_amount_label: "Antal Darmins", shop_amount_placeholder: "t.ex. 250",
    shop_discount_label: "Rabatt", shop_no_discount_val: "ingen",
    shop_total_label: "Totalt att betala", shop_per_darmin_label: "Pris per 1 D",
    shop_empty_hint: "Ange antal Darmins (minimum 1)",
    shop_progressive_discounts: "Progressiva rabatter", shop_tier_discount_prefix: "rabatt",
    shop_tier_no_discount: "ingen rabatt", shop_tier_above: "över",
    shop_legal: "Betalning via Stripe (EUR). Darmins är spelkrediter. Inga elektroniska pengar.",
    shop_webhook_note: "Saldot uppdateras automatiskt via Stripe Webhook. Om Darmins inte krediterats — öppna appen igen.",
    shop_need_auth: "Autentisering krävs", shop_register_cta: "Registrera dig som medborgare",
    shop_enter_min_error: "Ange antal Darmins (minimum 1)", shop_payment_error: "Kunde inte skapa betalningssession",
    sa_title: "Socialt alarm", sa_subtitle: "Synkroniserad aktivering av TimeNation-hymnen",
    sa_consent_label: "Tillåt andra att väcka mig med TimeNation-hymnen",
    sa_consent_hint: "Andra medborgare kan skicka dig en signal",
    sa_send_signal: "Spela hymnen för valda",
    sa_search_ph: "Sök medborgare...", sa_global_alarm: "Globalt alarm (Admin)",
    sa_trigger_global: "Aktivera för alla prenumeranter",
    sa_overlay_admin: "Obs! Globalt socialt alarm aktiverat av TimeNation-regeringen",
    sa_overlay_user: "bjuder in dig till det sociala alarmet!",
    sa_tap_to_play: "Tryck var som helst på skärmen för att spela hymnen!",
    sa_dismiss: "Stäng", sa_sent: "Signal skickad!", sa_no_subscribers: "Inga medborgare med aktivt samtycke",
    sa_login_required: "Logga in för att använda socialt alarm",
    sa_select_targets: "Välj mottagare", sa_selected: "vald", sa_consent_saved: "Inställningar sparade",
    sa_tab: "Synkro-signal", sa_sync_params: "Synkroniseringsparametrar", sa_alarm_time: "Aktiveringstid",
    sa_purpose_label: "Aviseringssyfte", sa_purpose_ph: "Ange mål (t.ex. Allmänt möte / Planetparad)", sa_time_ph: "HH:MM",
    tl_anchor_badge: "Viktigt", tl_slot_badge: "Händelser",
    file_limit_title: "Filgräns", file_limit_size: "Filen överstiger gränsen på 12 MB.", file_limit_duration: "Varaktigheten får inte överstiga 1 minut.", file_limit_both: "Filen överstiger gränserna för storlek (max. 12 MB) och varaktighet (max. 1 min).",
  },'''

# Insert el, cs, sv before the closing `};`
content = content.replace(
    "\n};\n\nexport const RTL_LANGS",
    f"\n{EL_BLOCK}\n{CS_BLOCK}\n{SV_BLOCK}\n}};\n\nexport const RTL_LANGS",
)

# ── 5. Append FOCUS_PROMPTS_I18N export ──────────────────────────────────────
FOCUS_EXPORT = '''
// ── Ticker focus prompts per language ──────────────────────────────────────────
export const FOCUS_PROMPTS_I18N: Record<LangCode, string[]> = {
  ru: [
    "💡 Зафиксируй решение, которое изменило твой день",
    "💡 Запиши мысль или эмоцию для себя в будущее",
    "💡 Запечатлей знание, ценность или красоту этого момента",
    "💡 Что из происходящего прямо сейчас стоит сохранить в Хронопедии?",
    "💡 Оставь отпечаток момента, который формирует твою историю",
    "💡 Передай главное — у тебя есть 1 минута, чтобы зафиксировать Значимое",
  ],
  en: [
    "💡 Capture the decision that changed your day",
    "💡 Write a thought or emotion for your future self",
    "💡 Immortalise the knowledge, value or beauty of this moment",
    "💡 What's happening right now that's worth saving in the Chronopedia?",
    "💡 Leave a mark of the moment that shapes your story",
    "💡 Share what matters most — you have 1 minute to record the Significant",
  ],
  tr: [
    "💡 Gününü değiştiren kararı kaydet",
    "💡 Geleceğindeki kendin için bir düşünce veya duygu yaz",
    "💡 Bu anın bilgisini, değerini veya güzelliğini ölümsüzleştir",
    "💡 Şu an yaşananlardan Kronopedi'de saklamaya değer ne var?",
    "💡 Hikâyeni şekillendiren anın izini bırak",
    "💡 En önemlisini aktar — Önemli'yi kaydetmek için 1 dakikan var",
  ],
  es: [
    "💡 Captura la decisión que cambió tu día",
    "💡 Escribe un pensamiento o emoción para tu yo futuro",
    "💡 Inmortaliza el conocimiento, valor o belleza de este momento",
    "💡 ¿Qué está pasando ahora que vale la pena guardar en la Cronopedia?",
    "💡 Deja una huella del momento que forma tu historia",
    "💡 Comparte lo más importante — tienes 1 minuto para registrar lo Significativo",
  ],
  fr: [
    "💡 Capturez la décision qui a changé votre journée",
    "💡 Écrivez une pensée ou une émotion pour votre futur vous",
    "💡 Immortalisez la connaissance, la valeur ou la beauté de ce moment",
    "💡 Que se passe-t-il maintenant qui vaut la peine d'être sauvé dans la Chronopédie ?",
    "💡 Laissez une trace du moment qui façonne votre histoire",
    "💡 Partagez l'essentiel — vous avez 1 minute pour enregistrer le Significatif",
  ],
  de: [
    "💡 Halte die Entscheidung fest, die deinen Tag verändert hat",
    "💡 Schreibe einen Gedanken oder eine Emotion für dein zukünftiges Ich",
    "💡 Verewige das Wissen, den Wert oder die Schönheit dieses Augenblicks",
    "💡 Was passiert gerade, das es wert ist, in der Chronopädie zu speichern?",
    "💡 Hinterlasse einen Abdruck des Moments, der deine Geschichte formt",
    "💡 Teile das Wichtigste — du hast 1 Minute, um das Bedeutsame festzuhalten",
  ],
  it: [
    "💡 Cattura la decisione che ha cambiato la tua giornata",
    "💡 Scrivi un pensiero o un'emozione per il tuo io futuro",
    "💡 Immortala la conoscenza, il valore o la bellezza di questo momento",
    "💡 Cosa sta succedendo ora che vale la pena salvare nella Cronopedia?",
    "💡 Lascia un'impronta del momento che forma la tua storia",
    "💡 Condividi ciò che conta di più — hai 1 minuto per registrare il Significativo",
  ],
  pt: [
    "💡 Capture a decisão que mudou o seu dia",
    "💡 Escreva um pensamento ou emoção para o seu eu futuro",
    "💡 Imoralize o conhecimento, o valor ou a beleza deste momento",
    "💡 O que está acontecendo agora que vale a pena salvar na Cronopédia?",
    "💡 Deixe uma marca do momento que forma a sua história",
    "💡 Compartilhe o que é mais importante — você tem 1 minuto para registrar o Significativo",
  ],
  ar: [
    "💡 سجّل القرار الذي غيّر يومك",
    "💡 اكتب فكرة أو مشاعر لنفسك في المستقبل",
    "💡 خلّد المعرفة أو القيمة أو جمال هذه اللحظة",
    "💡 ما الذي يحدث الآن ويستحق الحفظ في الكرونوبيديا؟",
    "💡 اترك أثراً للحظة التي تشكّل قصتك",
    "💡 شارك الأهم — لديك دقيقة واحدة لتسجيل المهم",
  ],
  zh: [
    "💡 记录改变了你这一天的决定",
    "💡 为未来的自己写下一个想法或情感",
    "💡 将这一时刻的知识、价值或美丽永久保存",
    "💡 现在发生的什么值得保存在时间百科中？",
    "💡 留下塑造你故事的那一刻的印记",
    "💡 分享最重要的事——你有1分钟来记录重要的时刻",
  ],
  ja: [
    "💡 今日を変えた決断を記録しよう",
    "💡 未来の自分に思いや感情を書き残そう",
    "💡 この瞬間の知識・価値・美しさを永遠に残そう",
    "💡 今起きていることで、クロノペディアに保存する価値があるものは？",
    "💡 あなたの物語を形作る瞬間の足跡を残そう",
    "💡 最も重要なことを伝えよう——重要なことを記録する時間は1分",
  ],
  ko: [
    "💡 오늘을 바꾼 결정을 기록하세요",
    "💡 미래의 나를 위해 생각이나 감정을 적어보세요",
    "💡 이 순간의 지식, 가치, 아름다움을 영원히 남기세요",
    "💡 지금 일어나고 있는 일 중 크로노피디아에 저장할 가치 있는 건 무엇인가요?",
    "💡 당신의 이야기를 만들어가는 이 순간의 흔적을 남기세요",
    "💡 가장 중요한 것을 전하세요 — 중요한 것을 기록할 시간은 1분입니다",
  ],
  hi: [
    "💡 उस फैसले को दर्ज करें जिसने आपका दिन बदला",
    "💡 भविष्य के खुद के लिए एक विचार या भावना लिखें",
    "💡 इस क्षण का ज्ञान, मूल्य या सुंदरता को अमर बनाएं",
    "💡 अभी जो हो रहा है उसमें क्रोनोपीडिया में सहेजने योग्य क्या है?",
    "💡 उस पल का निशान छोड़ें जो आपकी कहानी बना रहा है",
    "💡 सबसे महत्वपूर्ण बात साझा करें — महत्वपूर्ण को दर्ज करने के लिए 1 मिनट है",
  ],
  bn: [
    "💡 যে সিদ্ধান্তটি আপনার দিন বদলে দিয়েছে তা লিখুন",
    "💡 ভবিষ্যতের নিজের জন্য একটি চিন্তা বা আবেগ লিখুন",
    "💡 এই মুহূর্তের জ্ঞান, মূল্য বা সৌন্দর্যকে অমর করুন",
    "💡 এখন যা ঘটছে তার মধ্যে ক্রোনোপিডিয়ায় সংরক্ষণযোগ্য কী আছে?",
    "💡 আপনার গল্প গড়ে তোলা মুহূর্তের ছাপ রেখে যান",
    "💡 সবচেয়ে গুরুত্বপূর্ণটি ভাগ করুন — গুরুত্বপূর্ণ নথিভুক্ত করতে ১ মিনিট আছে",
  ],
  ur: [
    "💡 اس فیصلے کو ریکارڈ کریں جس نے آپ کا دن بدل دیا",
    "💡 اپنے مستقبل کے لیے ایک خیال یا جذبہ لکھیں",
    "💡 اس لمحے کے علم، قدر یا خوبصورتی کو لافانی بنائیں",
    "💡 ابھی جو ہو رہا ہے اس میں کرونوپیڈیا میں محفوظ کرنے کے قابل کیا ہے؟",
    "💡 اپنی کہانی بنانے والے لمحے کا نشان چھوڑیں",
    "💡 سب سے اہم بات شیئر کریں — اہم چیز ریکارڈ کرنے کے لیے 1 منٹ ہے",
  ],
  id: [
    "💡 Catat keputusan yang mengubah harimu",
    "💡 Tuliskan pikiran atau emosi untuk dirimu di masa depan",
    "💡 Abadikan pengetahuan, nilai, atau keindahan momen ini",
    "💡 Apa yang terjadi sekarang yang layak disimpan di Kronopedia?",
    "💡 Tinggalkan jejak momen yang membentuk ceritamu",
    "💡 Bagikan yang terpenting — kamu punya 1 menit untuk mencatat yang Bermakna",
  ],
  vi: [
    "💡 Ghi lại quyết định đã thay đổi ngày của bạn",
    "💡 Viết một suy nghĩ hoặc cảm xúc cho bản thân trong tương lai",
    "💡 Lưu giữ kiến thức, giá trị hoặc vẻ đẹp của khoảnh khắc này",
    "💡 Điều gì đang xảy ra ngay lúc này đáng được lưu vào Chronopedia?",
    "💡 Để lại dấu ấn của khoảnh khắc định hình câu chuyện của bạn",
    "💡 Chia sẻ điều quan trọng nhất — bạn có 1 phút để ghi lại Điều Có Ý Nghĩa",
  ],
  pl: [
    "💡 Zapisz decyzję, która zmieniła twój dzień",
    "💡 Napisz myśl lub emocję dla siebie w przyszłości",
    "💡 Uwiecznij wiedzę, wartość lub piękno tej chwili",
    "💡 Co dzieje się teraz, co warto zachować w Chronopedii?",
    "💡 Zostaw ślad chwili, która kształtuje twoją historię",
    "💡 Przekaż to, co najważniejsze — masz 1 minutę, by zapisać Znaczące",
  ],
  uk: [
    "💡 Зафіксуй рішення, яке змінило твій день",
    "💡 Запиши думку або емоцію для себе в майбутньому",
    "💡 Увічни знання, цінність або красу цього моменту",
    "💡 Що із того, що відбувається зараз, варто зберегти у Хронопедії?",
    "💡 Залиш відбиток моменту, що формує твою історію",
    "💡 Передай головне — у тебе є 1 хвилина, щоб зафіксувати Значуще",
  ],
  kk: [
    "💡 Күніңді өзгерткен шешімді тіркеп қой",
    "💡 Болашақтағы өзің үшін ой немесе сезімді жаз",
    "💡 Осы сәттің білімін, құндылығын немесе сұлулығын мәңгілікке қалдыр",
    "💡 Қазір болып жатқанның Хронопедияда сақтауға тұрарлығы не?",
    "💡 Тарихыңды қалыптастырған сәттің ізін қалдыр",
    "💡 Ең бастысын жеткіз — Маңыздыны тіркеуге 1 минутың бар",
  ],
  nl: [
    "💡 Leg de beslissing vast die je dag veranderde",
    "💡 Schrijf een gedachte of emotie voor je toekomstige zelf",
    "💡 Vereeuwige de kennis, waarde of schoonheid van dit moment",
    "💡 Wat gebeurt er nu dat het waard is te bewaren in de Chronopedia?",
    "💡 Laat een spoor achter van het moment dat je verhaal vormt",
    "💡 Deel wat het meest telt — je hebt 1 minuut om het Significante vast te leggen",
  ],
  he: [
    "💡 תעד את ההחלטה שהשנתה את יומך",
    "💡 כתוב מחשבה או רגש לעצמך בעתיד",
    "💡 הנציח את הידע, הערך או היופי של הרגע הזה",
    "💡 מה קורה עכשיו שראוי לשמור בכרונופדיה?",
    "💡 השאר עקבות של הרגע שמעצב את סיפורך",
    "💡 שתף את הדבר החשוב ביותר — יש לך דקה אחת לתעד את המשמעותי",
  ],
  fa: [
    "💡 تصمیمی را که روزت را تغییر داد ثبت کن",
    "💡 یک فکر یا احساس برای خودت در آینده بنویس",
    "💡 دانش، ارزش یا زیبایی این لحظه را جاودانه کن",
    "💡 از آنچه الان اتفاق می‌افتد، چه چیزی ارزش ذخیره در کرونوپدیا را دارد؟",
    "💡 ردپایی از لحظه‌ای که داستانت را شکل می‌دهد بگذار",
    "💡 مهم‌ترین چیز را به اشتراک بگذار — ۱ دقیقه برای ثبت مهم داری",
  ],
  ko: [
    "💡 오늘을 바꾼 결정을 기록하세요",
    "💡 미래의 나를 위해 생각이나 감정을 적어보세요",
    "💡 이 순간의 지식, 가치, 아름다움을 영원히 남기세요",
    "💡 지금 일어나고 있는 일 중 크로노피디아에 저장할 가치 있는 건 무엇인가요?",
    "💡 당신의 이야기를 만들어가는 이 순간의 흔적을 남기세요",
    "💡 가장 중요한 것을 전하세요 — 중요한 것을 기록할 시간은 1분입니다",
  ],
  uz: [
    "💡 Kuningizni o'zgartirgan qarorni qayd eting",
    "💡 Kelajakdagi o'zingiz uchun fikr yoki his-tuyg'u yozing",
    "💡 Bu lahzaning bilimlari, qadriyatlari yoki go'zalligini abadiylashtiring",
    "💡 Hozir sodir bo'layotganlardan Xronopediyada saqlab qo'yishga arziydigan nima bor?",
    "💡 Tarixingizni shakllantirgan lahzaning izini qoldiring",
    "💡 Eng muhimini yetkazing — Muhimni qayd etish uchun 1 daqiqangiz bor",
  ],
  el: [
    "💡 Κατέγραψε την απόφαση που άλλαξε την ημέρα σου",
    "💡 Γράψε μια σκέψη ή συναίσθημα για τον μελλοντικό εαυτό σου",
    "💡 Αθανάτισε τη γνώση, την αξία ή την ομορφιά αυτής της στιγμής",
    "💡 Τι συμβαίνει τώρα και αξίζει να αποθηκευτεί στη Χρονοπαιδεία;",
    "💡 Άφησε ίχνος της στιγμής που διαμορφώνει την ιστορία σου",
    "💡 Μοιράσου το πιο σημαντικό — έχεις 1 λεπτό να καταγράψεις το Σημαντικό",
  ],
  cs: [
    "💡 Zaznamenej rozhodnutí, které změnilo tvůj den",
    "💡 Napiš myšlenku nebo emoci pro sebe v budoucnosti",
    "💡 Zvěčni znalost, hodnotu nebo krásu tohoto okamžiku",
    "💡 Co se teď děje a stojí za uložení do Chronopedie?",
    "💡 Zanech stopu okamžiku, který formuje tvůj příběh",
    "💡 Předej to nejdůležitější — máš 1 minutu na zachycení Významného",
  ],
  sv: [
    "💡 Fånga beslutet som förändrade din dag",
    "💡 Skriv en tanke eller känsla till ditt framtida jag",
    "💡 Föreviga kunskapen, värdet eller skönheten i detta ögonblick",
    "💡 Vad händer just nu som är värt att spara i Kronopedia?",
    "💡 Lämna ett spår av det ögonblick som formar din historia",
    "💡 Dela det viktigaste — du har 1 minut på dig att fånga det Viktiga",
  ],
};
'''

content += FOCUS_EXPORT

with open(FILE, "w", encoding="utf-8") as f:
    f.write(content)

print("Done. Lines:", content.count("\n"))
