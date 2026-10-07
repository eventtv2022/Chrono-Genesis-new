import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserPlus, Clock, CheckCircle2, AlertCircle, Shield, Award, ExternalLink, Upload, Camera, Lock, BookOpen, PenLine } from "lucide-react";
import { SignaturePad } from "@/components/SignaturePad";
import { useLanguage } from "@/context/LanguageContext";
import { LegalModal, type LegalDocType } from "@/components/LegalModal";
import { useCitizen, type CitizenProfile } from "@/context/CitizenContext";
import { isPreApplicationGuideComplete } from "./PreApplicationGuide";

const BASE_WEB = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
const MANIFESTO_URL = "https://issuu.com/timenation2025/docs/_timenatio";

function pad2(n: number) { return String(n).padStart(2, "0"); }
function formatCountdown(s: number) {
  return `${pad2(Math.floor(s / 3600))}:${pad2(Math.floor((s % 3600) / 60))}:${pad2(s % 60)}`;
}

type Mode = "form" | "pending" | "issued";
interface PendingData { citizenNumber: string; availableAt: string; citizenId: number; citizenName: string; }

export function Register() {
  const { t } = useLanguage();
  const { citizen, twaStatus, setCitizen, setAuthToken } = useCitizen();
  const [, navigate] = useLocation();
  const [name, setName] = useState("");
  const [surname, setSurname] = useState("");
  const [givenNames, setGivenNames] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [signatureBase64, setSignatureBase64] = useState<string | null>(null);

  const [manifestoAccepted, setManifestoAccepted] = useState(false);
  const [tosAccepted, setTosAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [legalDoc, setLegalDoc] = useState<LegalDocType | null>(null);

  // ── Communication channels (≥2 required) ────────────────────────────────
  const [chEmail,    setChEmail]    = useState(false);
  const [chEmailVal, setChEmailVal] = useState("");
  const [chTelegram, setChTelegram] = useState(false);
  const [chTelegramVal, setChTelegramVal] = useState("");
  const [chWhatsapp, setChWhatsapp] = useState(false);
  const [chWhatsappVal, setChWhatsappVal] = useState("");
  const [chSms,      setChSms]      = useState(false);
  const [chSmsVal,   setChSmsVal]   = useState("");
  const [chPhone,    setChPhone]    = useState(false);
  const [chPhoneVal, setChPhoneVal] = useState("");
  const [channelTouched, setChannelTouched] = useState(false);

  const channelCount = [
    chEmail && chEmailVal.trim(),
    chTelegram && chTelegramVal.trim(),
    chWhatsapp && chWhatsappVal.trim(),
    chSms && chSmsVal.trim(),
    chPhone && chPhoneVal.trim(),
  ].filter(Boolean).length;
  const channelOk = channelCount >= 2;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [mode, setMode] = useState<Mode>("form");
  const [pendingData, setPendingData] = useState<PendingData | null>(null);
  const [countdown, setCountdown] = useState(3600);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { document.title = `${t.nav_become_citizen} | TimeNation`; }, [t]);

  useEffect(() => {
    if (!citizen && !isPreApplicationGuideComplete()) navigate("/onboarding");
  }, [citizen, navigate]);

  // ── Auto-jump to correct mode if citizen already exists (TWA flow) ──────────
  useEffect(() => {
    if (!citizen || mode !== "form") return;
    if (citizen.registrationStatus === "issued") {
      setMode("issued");
      setPendingData({
        citizenNumber: String(citizen.id).padStart(9, "0"),
        availableAt:   citizen.availableAt ?? new Date().toISOString(),
        citizenId:     citizen.id,
        citizenName:   citizen.name,
      });
    } else if (
      (citizen.registrationStatus === "pending" || twaStatus === "IN_EMISSION") &&
      citizen.availableAt
    ) {
      setMode("pending");
      setPendingData({
        citizenNumber: String(citizen.id).padStart(9, "0"),
        availableAt:   citizen.availableAt,
        citizenId:     citizen.id,
        citizenName:   citizen.name,
      });
    }
  }, [citizen, twaStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (mode !== "pending" || !pendingData) return;
    const computeLeft = () => Math.max(0, Math.ceil((new Date(pendingData.availableAt).getTime() - Date.now()) / 1000));
    setCountdown(computeLeft());
    const tick = setInterval(() => setCountdown(computeLeft()), 1000);
    const poll = async () => {
      try {
        const res = await fetch(`/api/citizens/number/${pendingData.citizenNumber}/status`);
        if (!res.ok) return;
        const data = await res.json() as { status: string };
        if (data.status === "issued") {
          clearInterval(tick);
          if (pollRef.current) clearInterval(pollRef.current);
          setMode("issued");
        }
      } catch { /* silent */ }
    };
    pollRef.current = setInterval(poll, 15_000);
    return () => { clearInterval(tick); if (pollRef.current) clearInterval(pollRef.current); };
  }, [mode, pendingData]);

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setPhoto(file);
    setPhotoPreview(file ? URL.createObjectURL(file) : null);
  }

  const canSubmit = tosAccepted && privacyAccepted && manifestoAccepted && !!signatureBase64 && channelOk;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setLoading(true);
    try {
      const n = name.trim() || `${surname.trim()} ${givenNames.trim()}`.trim();
      const formData = new FormData();
      formData.append("name", n);
      formData.append("phone", phone.trim());
      if (surname.trim()) formData.append("surname", surname.trim());
      if (givenNames.trim()) formData.append("givenNames", givenNames.trim());
      if (dateOfBirth.match(/^\d{4}-\d{2}-\d{2}$/)) formData.append("dateOfBirth", dateOfBirth);
      if (email.trim()) formData.append("email", email.trim());
      formData.append("privacyAgreementAccepted", "true");
      if (photo) formData.append("passport_photo", photo);
      if (signatureBase64) formData.append("signatureBase64", signatureBase64);

      // ── Communication channels ──────────────────────────────────────────
      const preferredCh: string[] = [];
      if (chEmail && chEmailVal.trim()) preferredCh.push("email");
      if (chTelegram && chTelegramVal.trim()) preferredCh.push("telegram");
      if (chWhatsapp && chWhatsappVal.trim()) { preferredCh.push("whatsapp"); formData.append("whatsappPhone", chWhatsappVal.trim()); }
      if (chSms && chSmsVal.trim()) preferredCh.push("sms");
      if (chPhone && chPhoneVal.trim()) preferredCh.push("phone");
      formData.append("preferredChannels", JSON.stringify(preferredCh));

      const res = await fetch("/api/citizens", { method: "POST", body: formData });
      const data = await res.json() as { id?: number; name?: string; citizenNumber?: string; availableAt?: string; authToken?: string; error?: string; } & Record<string, unknown>;
      if (!res.ok) { setError(data.error ?? t.reg_error); return; }
      if (data.citizenNumber && data.availableAt) {
        if (typeof data.authToken === "string" && typeof data.id === "number") {
          const { authToken: _authToken, ...profile } = data;
          setCitizen(profile as unknown as CitizenProfile);
          setAuthToken(data.authToken);
        }
        setPendingData({ citizenNumber: data.citizenNumber, availableAt: data.availableAt, citizenId: data.id!, citizenName: data.name! });
        navigate("/onboarding");
      }
    } catch {
      setError(t.connection_error);
    } finally {
      setLoading(false);
    }
  }

  /* ── Pending screen ─────────────────────────────────────────────────────── */
  if (mode === "pending" && pendingData) {
    return (
      <Layout>
        <div className="max-w-lg space-y-5">
          <div className="flex items-center gap-3 p-5 bg-primary/10 border border-primary/30 rounded-sm">
            <Shield className="w-8 h-8 text-primary shrink-0" />
            <div>
              <h2 className="font-bold text-xl">{t.reg_pending_title}</h2>
              <p className="text-muted-foreground font-mono text-sm mt-1">{t.reg_pending_desc}</p>
            </div>
          </div>
          <Card className="bg-card border-border text-center">
            <CardContent className="p-8 space-y-2">
              <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest">{t.reg_time_left}</p>
              <p className={`text-6xl font-mono font-bold tabular-nums tracking-widest ${countdown <= 0 ? "text-emerald-400" : "text-foreground"}`}>
                {formatCountdown(countdown)}
              </p>
              {countdown <= 0 && <p className="text-sm text-muted-foreground font-mono animate-pulse">{t.reg_getting_passport}</p>}
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-6 space-y-3">
              <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-1">{t.reg_citizen_number}</p>
              <p className="text-3xl font-mono font-bold text-primary tracking-widest">{pendingData.citizenNumber}</p>
              <p className="text-xs text-muted-foreground font-mono">{t.reg_save_number}</p>
              <div className="pt-3 border-t border-border space-y-2">
                <a
                  href="https://timenation.info"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 w-full px-4 py-3 rounded-sm border border-border bg-secondary/40 hover:bg-secondary/70 text-sm font-mono font-semibold transition-colors"
                >
                  <span className="text-lg">🌐</span>
                  <span>Официальный сайт</span>
                </a>
                <a
                  href="https://c683d011-eb44-4e71-bc0d-350ee613e0ca-00-1bn0o04nfdvrm.expo.pike.replit.dev/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 w-full px-4 py-3 rounded-sm border border-border bg-secondary/40 hover:bg-secondary/70 text-sm font-mono font-semibold transition-colors"
                >
                  <span className="text-lg">📱</span>
                  <span>Мобильное приложение (Mini App)</span>
                </a>
                <a
                  href="https://c683d011-eb44-4e71-bc0d-350ee613e0ca-00-1bn0o04nfdvrm.pike.replit.dev/web/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 w-full px-4 py-3 rounded-sm border border-border bg-secondary/40 hover:bg-secondary/70 text-sm font-mono font-semibold transition-colors"
                >
                  <span className="text-lg">🖥</span>
                  <span>Web-версия (Десктоп)</span>
                </a>
                <p className="text-xs text-muted-foreground font-mono leading-relaxed pt-1">
                  Пока идёт эмиссия Паспорта, вы можете исследовать экосистему на сайте, в приложении или на ПК.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  /* ── Issued screen ──────────────────────────────────────────────────────── */
  if (mode === "issued" && pendingData) {
    return (
      <Layout>
        <div className="max-w-lg space-y-5">
          <div className="flex items-center gap-3 p-5 bg-emerald-500/10 border border-emerald-500/30 rounded-sm">
            <Award className="w-8 h-8 text-emerald-400 shrink-0" />
            <div>
              <h2 className="font-bold text-xl">{t.reg_issued_title}</h2>
              <p className="text-muted-foreground font-mono text-sm mt-1">{t.reg_issued_desc}</p>
            </div>
          </div>
          <Card className="bg-card border-border">
            <CardContent className="p-6 space-y-4">
              <div>
                <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-1">{t.reg_citizen_number}</p>
                <p className="text-3xl font-mono font-bold text-primary tracking-widest">{pendingData.citizenNumber}</p>
                <p className="text-base font-medium mt-2">{pendingData.citizenName}</p>
              </div>
              <a
                href={`/api/citizens/number/${pendingData.citizenNumber}/id-card`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 w-full justify-center bg-emerald-500 hover:bg-emerald-600 text-white font-mono font-bold py-3 px-4 rounded-sm transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                {t.reg_open_id}
              </a>
              <a
                href={`/api/citizens/number/${pendingData.citizenNumber}/passport`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 w-full justify-center bg-muted/60 hover:bg-muted border border-border text-muted-foreground font-mono text-sm py-2.5 px-4 rounded-sm transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                {t.reg_open_passport}
              </a>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  /* ── Registration form ──────────────────────────────────────────────────── */
  return (
    <>
    <Layout>
      <div className="max-w-lg space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t.nav_become_citizen}</h1>
          <p className="text-muted-foreground font-mono text-sm mt-1">{t.reg_subtitle}</p>
        </div>

        {/* ── Manifesto read banner ──────────────────────────────────────── */}
        <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-sm space-y-3">
          <div className="flex items-start gap-3">
            <BookOpen className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-sm">{t.reg_manifesto_title}</p>
              <p className="text-xs text-muted-foreground font-mono mt-0.5">
                {t.reg_manifesto_desc}
              </p>
            </div>
          </div>
          <a
            href={MANIFESTO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 w-full justify-center bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 font-mono font-semibold text-sm py-2.5 px-4 rounded-sm transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            {t.reg_open_doc}
          </a>
        </div>

        <div className="flex items-start gap-3 p-4 bg-primary/5 border border-primary/20 rounded-sm">
          <Clock className="w-5 h-5 text-primary mt-0.5 shrink-0" />
          <div className="space-y-1 text-sm">
            <p className="font-medium">{t.reg_darmins_title}</p>
            <p className="text-muted-foreground font-mono text-xs">{t.reg_darmins_desc}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-base font-medium">{t.reg_passport_title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-mono text-muted-foreground uppercase tracking-wide">{t.reg_surname}</Label>
                  <Input value={surname} onChange={e => setSurname(e.target.value)} placeholder={t.reg_surname_ph} className="bg-secondary border-border font-mono" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-mono text-muted-foreground uppercase tracking-wide">{t.reg_given_names}</Label>
                  <Input value={givenNames} onChange={e => setGivenNames(e.target.value)} placeholder={t.reg_given_names_ph} className="bg-secondary border-border font-mono" />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-mono text-muted-foreground uppercase tracking-wide">{t.reg_nickname}</Label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder={t.reg_nickname_ph} className="bg-secondary border-border font-mono" />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-mono text-muted-foreground uppercase tracking-wide">{t.reg_dob}</Label>
                <Input value={dateOfBirth} onChange={e => setDateOfBirth(e.target.value)} placeholder={t.reg_dob_ph} className="bg-secondary border-border font-mono" />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-mono text-muted-foreground uppercase tracking-wide">{t.reg_phone}</Label>
                <Input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+7XXXXXXXXXX" required className="bg-secondary border-border font-mono" />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-mono text-muted-foreground uppercase tracking-wide">{t.reg_email}</Label>
                <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="example@timenation.com" className="bg-secondary border-border font-mono" />
              </div>

              {/* ── Communication channels ────────────────────────────────── */}
              <div className="space-y-3 p-3 rounded-sm border border-border/60 bg-muted/10">
                <div>
                  <Label className="text-xs font-mono text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5" />
                    Каналы связи — выберите не менее 2
                  </Label>
                  <p className="text-xs text-muted-foreground/60 font-mono mt-0.5">Для получения важных уведомлений от государства</p>
                </div>

                {/* E-mail */}
                <div className="space-y-1.5">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input type="checkbox" checked={chEmail} onChange={e => { setChEmail(e.target.checked); setChannelTouched(true); if (e.target.checked && !chEmailVal) setChEmailVal(email); }} className="accent-primary w-4 h-4" />
                    <span className="text-sm font-mono text-foreground">📧 E-mail (почта)</span>
                  </label>
                  {chEmail && <Input value={chEmailVal} onChange={e => { setChEmailVal(e.target.value); setChannelTouched(true); }} placeholder="example@mail.com" className="ml-6 h-8 text-xs bg-secondary border-border font-mono" />}
                </div>

                {/* Telegram */}
                <div className="space-y-1.5">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input type="checkbox" checked={chTelegram} onChange={e => { setChTelegram(e.target.checked); setChannelTouched(true); }} className="accent-primary w-4 h-4" />
                    <span className="text-sm font-mono text-foreground">✈️ Telegram</span>
                  </label>
                  {chTelegram && <Input value={chTelegramVal} onChange={e => { setChTelegramVal(e.target.value); setChannelTouched(true); }} placeholder="@username или числовой ID" className="ml-6 h-8 text-xs bg-secondary border-border font-mono" />}
                </div>

                {/* WhatsApp */}
                <div className="space-y-1.5">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input type="checkbox" checked={chWhatsapp} onChange={e => { setChWhatsapp(e.target.checked); setChannelTouched(true); if (e.target.checked && !chWhatsappVal) setChWhatsappVal(phone); }} className="accent-primary w-4 h-4" />
                    <span className="text-sm font-mono text-foreground">📱 WhatsApp</span>
                  </label>
                  {chWhatsapp && <Input value={chWhatsappVal} onChange={e => { setChWhatsappVal(e.target.value); setChannelTouched(true); }} placeholder="+7XXXXXXXXXX" className="ml-6 h-8 text-xs bg-secondary border-border font-mono" />}
                </div>

                {/* SMS */}
                <div className="space-y-1.5">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input type="checkbox" checked={chSms} onChange={e => { setChSms(e.target.checked); setChannelTouched(true); if (e.target.checked && !chSmsVal) setChSmsVal(phone); }} className="accent-primary w-4 h-4" />
                    <span className="text-sm font-mono text-foreground">💬 SMS</span>
                  </label>
                  {chSms && <Input value={chSmsVal} onChange={e => { setChSmsVal(e.target.value); setChannelTouched(true); }} placeholder="+7XXXXXXXXXX" className="ml-6 h-8 text-xs bg-secondary border-border font-mono" />}
                </div>

                {/* Phone calls */}
                <div className="space-y-1.5">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input type="checkbox" checked={chPhone} onChange={e => { setChPhone(e.target.checked); setChannelTouched(true); if (e.target.checked && !chPhoneVal) setChPhoneVal(phone); }} className="accent-primary w-4 h-4" />
                    <span className="text-sm font-mono text-foreground">📞 Телефонные звонки</span>
                  </label>
                  {chPhone && <Input value={chPhoneVal} onChange={e => { setChPhoneVal(e.target.value); setChannelTouched(true); }} placeholder="+7XXXXXXXXXX" className="ml-6 h-8 text-xs bg-secondary border-border font-mono" />}
                </div>

                {/* Validation feedback */}
                {channelTouched && !channelOk && (
                  <div className="flex items-start gap-1.5 text-xs text-destructive font-mono">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    Выберите и заполните не менее 2 способов связи для получения важных уведомлений
                  </div>
                )}
                {channelOk && (
                  <p className="text-xs text-green-500 font-mono flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {channelCount} из 5 каналов активно
                  </p>
                )}
              </div>

              {/* ── Photo upload ─────────────────────────────────────────── */}
              <div className="space-y-1.5">
                <Label className="text-xs font-mono text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                  <Camera className="w-3.5 h-3.5" />
                  {t.reg_photo}
                </Label>
                <label className="flex flex-col items-center justify-center w-full border-2 border-dashed border-border rounded-sm cursor-pointer bg-secondary hover:bg-secondary/80 transition-colors overflow-hidden">
                  {photoPreview ? (
                    <div className="relative w-full">
                      <img src={photoPreview} alt={t.reg_upload_photo} className="w-full h-48 object-cover" />
                      <div className="absolute bottom-2 right-2 bg-black/60 text-white text-xs font-mono px-2 py-1 rounded">{t.reg_click_replace}</div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-8 gap-2">
                      <Upload className="w-8 h-8 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground font-mono"><span className="font-semibold">{t.reg_upload_photo}</span></p>
                      <p className="text-xs text-muted-foreground font-mono">{t.reg_photo_hint}</p>
                    </div>
                  )}
                  <input id="passport_photo" name="passport_photo" type="file" className="hidden" accept="image/*" onChange={handlePhotoChange} />
                </label>
              </div>

              {/* ── Signature pad ────────────────────────────────────────── */}
              <div className="space-y-1.5">
                <Label className="text-xs font-mono text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                  <PenLine className="w-3.5 h-3.5" />
                  {t.reg_signature}
                </Label>
                <SignaturePad onChange={setSignatureBase64} />
              </div>

              {/* ── Three compliance checkboxes ───────────────────────────── */}
              <div className="space-y-3 pt-2 border-t border-border/50">

                {/* 1. Document read confirmation */}
                <div className="flex items-start gap-3 p-3 bg-amber-500/5 border border-amber-500/25 rounded-sm">
                  <BookOpen className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                  <div className="flex-1 flex items-start gap-2">
                    <input
                      type="checkbox"
                      id="manifesto"
                      checked={manifestoAccepted}
                      onChange={e => setManifestoAccepted(e.target.checked)}
                      className="mt-0.5 accent-primary"
                      required
                    />
                    <label htmlFor="manifesto" className="text-xs text-muted-foreground font-mono leading-relaxed">
                      {t.reg_check_manifesto_link.split("TimeNation")[0]}
                      <a href={MANIFESTO_URL} target="_blank" rel="noopener noreferrer" className="text-amber-400 underline">
                        {t.reg_check_manifesto_link}
                      </a>
                      {". "}{t.reg_check_manifesto}
                    </label>
                  </div>
                </div>

                {/* 2. TOS */}
                <div className="flex items-start gap-3">
                  <input type="checkbox" id="tos" checked={tosAccepted} onChange={e => setTosAccepted(e.target.checked)} className="mt-0.5 accent-primary" />
                  <label htmlFor="tos" className="text-xs text-muted-foreground font-mono leading-relaxed">
                    <button
                      type="button"
                      onClick={e => { e.preventDefault(); setLegalDoc("tos"); }}
                      className="text-primary underline hover:opacity-80 transition-opacity cursor-pointer"
                    >
                      {t.reg_check_tos_link}
                    </button>
                    {". "}{t.reg_check_tos}
                  </label>
                </div>

                {/* 3. Privacy / GDPR */}
                <div className="flex items-start gap-3 p-3 bg-muted/20 border border-border/40 rounded-sm">
                  <Lock className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div className="flex-1 flex items-start gap-2">
                    <input
                      type="checkbox"
                      id="privacy"
                      checked={privacyAccepted}
                      onChange={e => setPrivacyAccepted(e.target.checked)}
                      className="mt-0.5 accent-primary"
                      required
                    />
                    <label htmlFor="privacy" className="text-xs text-muted-foreground font-mono leading-relaxed">
                      {t.reg_check_privacy}{" "}
                      <button
                        type="button"
                        onClick={e => { e.preventDefault(); e.stopPropagation(); setLegalDoc("privacy"); }}
                        className="text-primary underline hover:opacity-80 transition-opacity cursor-pointer"
                      >
                        Политика конфиденциальности ↗
                      </button>
                    </label>
                  </div>
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/30 rounded-sm text-sm text-destructive font-mono">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {error}
                </div>
              )}

              <Button
                type="submit"
                disabled={loading || !canSubmit}
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-mono font-bold disabled:opacity-40"
              >
                {loading ? t.reg_submitting : (
                  <span className="flex items-center gap-2">
                    <UserPlus className="w-4 h-4" />
                    {t.reg_submit_btn}
                  </span>
                )}
              </Button>

              {!canSubmit && (
                <p className="text-center text-xs text-muted-foreground font-mono">
                  {!signatureBase64 ? t.reg_hint_sign : t.reg_hint_check}
                </p>
              )}

              <div className="flex items-center gap-2 p-3 bg-muted/30 rounded-sm">
                <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                <p className="text-xs text-muted-foreground font-mono">
                  {t.reg_passport_note}
                </p>
              </div>
            </CardContent>
          </Card>
        </form>
      </div>
    </Layout>

    {legalDoc && (
      <LegalModal doc={legalDoc} onClose={() => setLegalDoc(null)} />
    )}
    </>
  );
}
