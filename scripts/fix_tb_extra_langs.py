#!/usr/bin/env python3
"""Add tb_ keys to he, fa, uz language blocks that were missed in the first pass."""
import re

EXTRA = {
    "he": dict(
        tb_title="בנק הזמן", tb_credit_status="מצב אשראי",
        tb_trust_limit="מגבלת אמון", tb_limit="מגבלה", tb_active_debt="חוב פעיל",
        tb_available="זמין", tb_debt="חוב", tb_min="דקות", tb_of_limit="מהמגבלה",
        tb_ceiling="תקרה", tb_current_limit="מגבלה נוכחית", tb_next_level="רמה הבאה",
        tb_worked="עבד", tb_completed_services="שירותים שהושלמו",
        tb_trust_ladder="סולם האמון", tb_novice="מתחיל",
        tb_starting_limit="מגבלת התחלה", tb_first_contract="חוזה ראשון",
        tb_progression="התקדמות", tb_borrow="ללוות", tb_repay_loan="לפרוע הלוואה",
        tb_take="קח", tb_repay_btn="פרע", tb_repay_full="פרע הכל",
        tb_history="היסטוריית עסקאות", tb_no_auth="נדרש חשבון אזרח",
        tb_cap_notice="הגעת למגבלת האמון המרבית של בנק הזמן (8 שעות). שלם את החוב.",
        tb_borrow_success="הלוואה ניתנה — דארמינים נזקפו ליתרה",
        tb_repay_success="החוב נפרע — תודה על עמידה בהתחייבויות",
        tb_auto_note="בהרוויחך דקות ב-TiMETR, המערכת מפנה אותן אוטומטית לפירעון החוב.",
        tb_balance="יתרה", tb_current_badge="נוכחי", tb_borrow_amount="כמות ב-Д",
        tb_invalid_amount="הזן סכום תקין", tb_invalid_repay="הזן סכום פירעון תקין",
        tb_debt_remaining="חוב שנותר", tb_taken="נלקח",
        tb_loan_issued="הלוואה ניתנה", tb_manual_repay="פירעון ידני",
        tb_auto_repay="פירעון אוטומטי", tb_collateral="בטוחה שוחררה",
        tb_1_service="שירות", tb_hours_worked_req="שעות עבודה",
    ),
    "fa": dict(
        tb_title="بانک زمان", tb_credit_status="وضعیت اعتبار",
        tb_trust_limit="محدودیت اعتماد", tb_limit="محدودیت", tb_active_debt="بدهی فعال",
        tb_available="موجود", tb_debt="بدهی", tb_min="دقیقه", tb_of_limit="از محدودیت",
        tb_ceiling="سقف", tb_current_limit="محدودیت فعلی", tb_next_level="سطح بعدی",
        tb_worked="کار شده", tb_completed_services="خدمات انجام شده",
        tb_trust_ladder="نردبان اعتماد", tb_novice="تازه‌کار",
        tb_starting_limit="محدودیت ابتدایی", tb_first_contract="اولین قرارداد",
        tb_progression="پیشرفت", tb_borrow="وام گرفتن", tb_repay_loan="بازپرداخت وام",
        tb_take="بگیر", tb_repay_btn="بازپرداخت", tb_repay_full="بازپرداخت کامل",
        tb_history="تاریخچه تراکنش‌ها", tb_no_auth="حساب شهروند لازم است",
        tb_cap_notice="به حداکثر محدودیت اعتماد بانک زمان رسیدید (۸ ساعت). بدهی را بپردازید.",
        tb_borrow_success="وام صادر شد — دارمین‌ها به موجودی اضافه شدند",
        tb_repay_success="بدهی پرداخت شد — ممنون از پایبندی به تعهدات",
        tb_auto_note="با کسب دقیقه در TiMETR، سیستم به‌طور خودکار آن‌ها را به سمت بازپرداخت بدهی هدایت می‌کند.",
        tb_balance="موجودی", tb_current_badge="فعلی", tb_borrow_amount="مقدار Д",
        tb_invalid_amount="مبلغ معتبر وارد کنید", tb_invalid_repay="مبلغ بازپرداخت معتبر وارد کنید",
        tb_debt_remaining="بدهی باقی‌مانده", tb_taken="گرفته شده",
        tb_loan_issued="وام صادر شد", tb_manual_repay="بازپرداخت دستی",
        tb_auto_repay="بازپرداخت خودکار", tb_collateral="وثیقه آزاد شد",
        tb_1_service="خدمت", tb_hours_worked_req="ساعت کار",
    ),
    "uz": dict(
        tb_title="Vaqt Banki", tb_credit_status="Kredit Holati",
        tb_trust_limit="Ishonch Limiti", tb_limit="Limit", tb_active_debt="Faol Qarz",
        tb_available="Mavjud", tb_debt="Qarz", tb_min="daq", tb_of_limit="limitdan",
        tb_ceiling="Shiftgacha", tb_current_limit="Joriy limit", tb_next_level="Keyingi Daraja",
        tb_worked="Ishlandi", tb_completed_services="Bajarilgan Xizmatlar",
        tb_trust_ladder="Ishonch Narvoni", tb_novice="Yangi boshlovchi",
        tb_starting_limit="Boshlang'ich limit", tb_first_contract="Birinchi Shartnoma",
        tb_progression="Taraqqiyot", tb_borrow="Qarz olish", tb_repay_loan="Qarzni to'lash",
        tb_take="Olish", tb_repay_btn="To'lash", tb_repay_full="To'liq to'lash",
        tb_history="Operatsiyalar tarixi", tb_no_auth="Fuqaro hisobi talab etiladi",
        tb_cap_notice="Vaqt Bankining maksimal ishonch limitiga yetildi (8 soat). Qarzni to'lang.",
        tb_borrow_success="Kredit berildi — Darminlar balansga qo'shildi",
        tb_repay_success="Qarz to'landi — majburiyatlarni bajarganingiz uchun rahmat",
        tb_auto_note="TiMETR'da daqiqalar topganda, tizim ularni avtomatik ravishda qarz to'lashga yo'naltiradi.",
        tb_balance="balans", tb_current_badge="JORIY", tb_borrow_amount="Д miqdori",
        tb_invalid_amount="To'g'ri miqdor kiriting", tb_invalid_repay="To'g'ri to'lov miqdori kiriting",
        tb_debt_remaining="qolgan qarz", tb_taken="olingan",
        tb_loan_issued="Kredit Berildi", tb_manual_repay="Qo'lda To'lash",
        tb_auto_repay="Avtomatik To'lash", tb_collateral="Kafolat Bo'shatildi",
        tb_1_service="xizmat", tb_hours_worked_req="soat ishlandi",
    ),
}

path = "artifacts/mobile/lib/i18n.ts"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

import re

count = 0
for lang, d in EXTRA.items():
    parts = [f'{k}: "{v}"' for k, v in d.items()]
    entries = ", ".join(parts)
    new_block = f"\n    // TimeBank\n    {entries},"

    pattern = rf'(  {lang}: \{{[^}}]*?tg_notify_all_groups: "[^"]*",)'
    def replacer(m, nb=new_block):
        return m.group(0) + nb
    new_content, n = re.subn(pattern, replacer, content, count=1, flags=re.DOTALL)
    if n:
        content = new_content
        count += 1
    else:
        print(f"WARNING: pattern not found for lang={lang}")

with open(path, "w", encoding="utf-8") as f:
    f.write(content)

print(f"Inserted tb_ keys into {count}/3 extra language blocks (he, fa, uz)")
