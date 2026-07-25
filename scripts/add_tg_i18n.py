#!/usr/bin/env python3
"""Add Telegram notification i18n keys to all 27 language blocks in artifacts/mobile/lib/i18n.ts"""
import re, sys

TRANSLATIONS = {
    'ru':  ('Telegram Уведомления','Подключить Telegram','Подключено','Отключить','Не привязан','Настройки уведомлений','Личные сообщения','Капсулы и Хронопедия','Упоминания в группах (@me)','Указы и государственные новости','Все сообщения из групп'),
    'en':  ('Telegram Notifications','Connect Telegram','Connected','Disconnect','Not connected','Notification Settings','Private Messages','Capsules & Timeline','Group Mentions (@me)','State Announcements','All Group Messages'),
    'zh':  ('Telegram 通知','连接 Telegram','已连接','断开连接','未连接','通知设置','私信','时间胶囊 & 时间线','群组提及 (@me)','国家公告','所有群组消息'),
    'hi':  ('Telegram सूचनाएं','Telegram जोड़ें','जुड़ा हुआ','डिस्कनेक्ट करें','नहीं जुड़ा','सूचना सेटिंग','निजी संदेश','कैप्सूल और टाइमलाइन','समूह में उल्लेख (@me)','राज्य घोषणाएं','सभी समूह संदेश'),
    'es':  ('Notificaciones de Telegram','Conectar Telegram','Conectado','Desconectar','No conectado','Configuración de notificaciones','Mensajes privados','Cápsulas y cronología','Menciones en grupos (@me)','Anuncios estatales','Todos los mensajes de grupo'),
    'fr':  ('Notifications Telegram','Connecter Telegram','Connecté','Déconnecter','Non connecté','Paramètres de notification','Messages privés','Capsules & chronologie','Mentions de groupe (@me)','Annonces officielles','Tous les messages de groupe'),
    'ar':  ('إشعارات تيليغرام','ربط تيليغرام','متصل','قطع الاتصال','غير متصل','إعدادات الإشعارات','الرسائل الخاصة','الكبسولات والجدول الزمني','الإشارات في المجموعات (@me)','الإعلانات الرسمية','جميع رسائل المجموعة'),
    'bn':  ('টেলিগ্রাম বিজ্ঞপ্তি','টেলিগ্রাম সংযুক্ত করুন','সংযুক্ত','সংযোগ বিচ্ছিন্ন','সংযুক্ত নয়','বিজ্ঞপ্তি সেটিংস','ব্যক্তিগত বার্তা','ক্যাপসুল ও টাইমলাইন','গ্রুপ উল্লেখ (@me)','রাষ্ট্রীয় ঘোষণা','সমস্ত গ্রুপ বার্তা'),
    'pt':  ('Notificações do Telegram','Conectar Telegram','Conectado','Desconectar','Não conectado','Configurações de notificação','Mensagens privadas','Cápsulas e linha do tempo','Menções no grupo (@me)','Anúncios oficiais','Todas as mensagens do grupo'),
    'ur':  ('ٹیلیگرام نوٹیفیکیشنز','ٹیلیگرام جوڑیں','منسلک','منقطع کریں','منسلک نہیں','نوٹیفیکیشن سیٹنگز','ذاتی پیغامات','کیپسول اور ٹائم لائن','گروپ ذکر (@me)','سرکاری اعلانات','تمام گروپ پیغامات'),
    'id':  ('Notifikasi Telegram','Hubungkan Telegram','Terhubung','Putuskan','Tidak terhubung','Pengaturan notifikasi','Pesan pribadi','Kapsul & garis waktu','Sebutan grup (@me)','Pengumuman resmi','Semua pesan grup'),
    'de':  ('Telegram-Benachrichtigungen','Telegram verbinden','Verbunden','Trennen','Nicht verbunden','Benachrichtigungseinstellungen','Privatnachrichten','Kapseln & Zeitstrahl','Gruppenerwähnungen (@me)','Staatliche Bekanntmachungen','Alle Gruppennachrichten'),
    'ja':  ('Telegram 通知','Telegram を接続','接続済み','切断','未接続','通知設定','プライベートメッセージ','カプセルとタイムライン','グループメンション (@me)','公式アナウンス','全グループメッセージ'),
    'tr':  ('Telegram Bildirimleri','Telegram Bağla','Bağlandı','Bağlantıyı Kes','Bağlı değil','Bildirim Ayarları','Özel Mesajlar','Kapsüller & Zaman Çizelgesi','Grup Bahisleri (@me)','Resmi Duyurular','Tüm Grup Mesajları'),
    'vi':  ('Thông báo Telegram','Kết nối Telegram','Đã kết nối','Ngắt kết nối','Chưa kết nối','Cài đặt thông báo','Tin nhắn riêng','Viên nang & Dòng thời gian','Đề cập trong nhóm (@me)','Thông báo chính thức','Tất cả tin nhắn nhóm'),
    'he':  ('התראות טלגרם','חבר טלגרם','מחובר','נתק','לא מחובר','הגדרות התראות','הודעות פרטיות','כמוסות וציר זמן','אזכורים בקבוצה (@me)','הודעות רשמיות','כל הודעות הקבוצה'),
    'fa':  ('اعلان‌های تلگرام','اتصال تلگرام','متصل','قطع اتصال','متصل نیست','تنظیمات اعلان','پیام‌های خصوصی','کپسول‌ها و جدول زمانی','اشاره‌های گروه (@me)','اطلاعیه‌های دولتی','همه پیام‌های گروه'),
    'ko':  ('텔레그램 알림','텔레그램 연결','연결됨','연결 해제','연결 안 됨','알림 설정','개인 메시지','캡슐 & 타임라인','그룹 멘션 (@me)','공식 발표','모든 그룹 메시지'),
    'it':  ('Notifiche Telegram','Collega Telegram','Collegato','Disconnetti','Non collegato','Impostazioni notifiche','Messaggi privati','Capsule e cronologia','Menzioni nel gruppo (@me)','Annunci ufficiali','Tutti i messaggi di gruppo'),
    'pl':  ('Powiadomienia Telegram','Połącz Telegram','Połączono','Rozłącz','Nie połączono','Ustawienia powiadomień','Prywatne wiadomości','Kapsułki i oś czasu','Wzmianki w grupie (@me)','Oficjalne ogłoszenia','Wszystkie wiadomości grupowe'),
    'uk':  ('Сповіщення Telegram','Підключити Telegram','Підключено','Відключити','Не підключено','Налаштування сповіщень','Особисті повідомлення','Капсули і хронологія','Згадки в групах (@me)','Державні оголошення','Всі повідомлення груп'),
    'nl':  ('Telegram-meldingen','Telegram koppelen','Verbonden','Ontkoppelen','Niet verbonden','Meldingsinstellingen','Privéberichten','Capsules & tijdlijn','Groepsvermeldingen (@me)','Officiële aankondigingen','Alle groepsberichten'),
    'kk':  ('Telegram хабарландырулары','Telegram қосу','Қосылды','Ажырату','Қосылмаған','Хабарландыру параметрлері','Жеке хабарлар','Капсулалар мен хронология','Топтық атаулар (@me)','Мемлекеттік хабарландырулар','Барлық топтық хабарлар'),
    'uz':  ('Telegram bildirishnomalar','Telegram ulash','Ulangan','Uzish','Ulanmagan','Bildirishnoma sozlamalari','Shaxsiy xabarlar','Kapsulalar va vaqt chizig\'i','Guruhdagi eslatmalar (@me)','Rasmiy e\'lonlar','Barcha guruh xabarlari'),
    'el':  ('Ειδοποιήσεις Telegram','Σύνδεση Telegram','Συνδεδεμένο','Αποσύνδεση','Μη συνδεδεμένο','Ρυθμίσεις ειδοποιήσεων','Ιδιωτικά μηνύματα','Κάψουλες & χρονολόγιο','Αναφορές ομάδας (@me)','Επίσημες ανακοινώσεις','Όλα τα μηνύματα ομάδας'),
    'cs':  ('Telegram oznámení','Připojit Telegram','Připojeno','Odpojit','Nepřipojeno','Nastavení oznámení','Soukromé zprávy','Kapsule a časová osa','Zmínky ve skupině (@me)','Oficiální oznámení','Všechny zprávy skupiny'),
    'sv':  ('Telegram-aviseringar','Anslut Telegram','Ansluten','Koppla bort','Inte ansluten','Aviseringsinställningar','Privata meddelanden','Kapslar & tidslinje','Gruppnämnanden (@me)','Officiella meddelanden','Alla gruppmeddelanden'),
}

KEYS = [
    'tg_section_title', 'tg_connect', 'tg_connected', 'tg_disconnect', 'tg_not_linked',
    'tg_settings_title', 'tg_notify_dm', 'tg_notify_capsules', 'tg_notify_mentions',
    'tg_notify_state', 'tg_notify_all_groups',
]

path = 'artifacts/mobile/lib/i18n.ts'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add keys to UIStrings interface (after mod_delete_warning line)
interface_marker = '  mod_delete_warning: string;'
new_interface_keys = (
    '\n  // Telegram personal notifications\n' +
    '  tg_section_title: string; tg_connect: string; tg_connected: string;\n' +
    '  tg_disconnect: string; tg_not_linked: string; tg_settings_title: string;\n' +
    '  tg_notify_dm: string; tg_notify_capsules: string; tg_notify_mentions: string;\n' +
    '  tg_notify_state: string; tg_notify_all_groups: string;'
)
if interface_marker in content and 'tg_section_title' not in content:
    content = content.replace(interface_marker, interface_marker + new_interface_keys)

# 2. For each language block, add keys after mod_delete_warning value
for lang, vals in TRANSLATIONS.items():
    entries = ', '.join(f'{k}: "{v}"' for k, v in zip(KEYS, vals))
    new_line = f'\n    {entries},'
    # Find the mod_delete_warning line inside this language block
    # Pattern: find mod_delete_warning: "..." in the context of this lang block
    # We look for the pattern within the language block boundaries
    # The end of each lang block is marked by mod_delete_warning: "..." followed by \n  },
    pattern = r'(    mod_delete_warning: "[^"]*")(,\s*\n  \},)'
    
    # To be language-specific, we need to find the correct occurrence.
    # Since all lang blocks have mod_delete_warning, we'll replace sequentially.
    # Better: find the lang block header and then find mod_delete_warning within it.
    
    # Find the position of this language block start
    lang_block_start = content.find(f'\n  {lang}: {{')
    if lang_block_start == -1:
        print(f'WARNING: lang block not found for {lang}')
        continue
    
    # Find the next lang block start or end of UI object
    # Find the closing of this lang block: next `  xx: {` or `};`
    rest = content[lang_block_start + 1:]
    # Find next language block or end of UI object
    next_block = re.search(r'\n  [a-z]{2}: \{', rest)
    if next_block:
        lang_block_end = lang_block_start + 1 + next_block.start()
    else:
        lang_block_end = len(content)
    
    lang_block = content[lang_block_start:lang_block_end]
    
    if 'tg_section_title' in lang_block:
        print(f'SKIP {lang}: already has tg keys')
        continue
    
    # Find mod_delete_warning in this block
    mod_del_match = re.search(r'    mod_delete_warning: "[^"]*"', lang_block)
    if not mod_del_match:
        print(f'WARNING: mod_delete_warning not found in {lang} block')
        continue
    
    insert_pos_in_block = mod_del_match.end()
    new_lang_block = lang_block[:insert_pos_in_block] + new_line + lang_block[insert_pos_in_block:]
    content = content[:lang_block_start] + new_lang_block + content[lang_block_end:]

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print('Done!')
