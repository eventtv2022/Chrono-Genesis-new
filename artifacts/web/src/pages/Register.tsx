import { useState, useEffect, useRef } from "react";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserPlus, Clock, CheckCircle2, AlertCircle, Shield, Award, ExternalLink } from "lucide-react";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

function pad2(n: number) { return String(n).padStart(2, "0"); }
function formatCountdown(s: number) {
  return `${pad2(Math.floor(s / 3600))}:${pad2(Math.floor((s % 3600) / 60))}:${pad2(s % 60)}`;
}

type Mode = "form" | "pending" | "issued";

interface PendingData { citizenNumber: string; availableAt: string; citizenId: number; citizenName: string; }

export function Register() {
  const [name, setName] = useState("");
  const [surname, setSurname] = useState("");
  const [givenNames, setGivenNames] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");

  useEffect(() => {
    document.title = "Стать гражданином | TimeNation";
  }, []);
  const [phone, setPhone] = useState("");
  const [tosAccepted, setTosAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [mode, setMode] = useState<Mode>("form");
  const [pendingData, setPendingData] = useState<PendingData | null>(null);
  const [countdown, setCountdown] = useState(3600);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Countdown + poll
  useEffect(() => {
    if (mode !== "pending" || !pendingData) return;
    const computeLeft = () => Math.max(0, Math.ceil((new Date(pendingData.availableAt).getTime() - Date.now()) / 1000));
    setCountdown(computeLeft());
    const tick = setInterval(() => setCountdown(computeLeft()), 1000);

    const poll = async () => {
      if (!pendingData) return;
      try {
        const res = await fetch(`${BASE}/api/citizens/number/${pendingData.citizenNumber}/status`);
        if (!res.ok) return;
        const data = await res.json() as { status: string };
        if (data.status === "issued") {
          clearInterval(tick);
          if (pollRef.current) clearInterval(pollRef.current);
          setMode("issued");
        }
      } catch {}
    };
    pollRef.current = setInterval(poll, 15_000);

    return () => { clearInterval(tick); if (pollRef.current) clearInterval(pollRef.current); };
  }, [mode, pendingData]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!tosAccepted) return;
    setError(null);
    setLoading(true);
    try {
      const n = name.trim() || `${surname.trim()} ${givenNames.trim()}`.trim();
      const body: Record<string, string> = { name: n, phone: phone.trim() };
      if (surname.trim()) body["surname"] = surname.trim();
      if (givenNames.trim()) body["givenNames"] = givenNames.trim();
      if (dateOfBirth.match(/^\d{4}-\d{2}-\d{2}$/)) body["dateOfBirth"] = dateOfBirth;

      const res = await fetch(`${BASE}/api/citizens`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json() as {
        id?: number; name?: string; citizenNumber?: string; availableAt?: string; error?: string;
      };
      if (!res.ok) { setError(data.error ?? "Ошибка регистрации"); return; }
      if (data.citizenNumber && data.availableAt) {
        setPendingData({ citizenNumber: data.citizenNumber, availableAt: data.availableAt, citizenId: data.id!, citizenName: data.name! });
        setMode("pending");
      }
    } catch { setError("Ошибка соединения с сервером"); }
    finally { setLoading(false); }
  }

  if (mode === "pending" && pendingData) {
    return (
      <Layout>
        <div className="max-w-lg space-y-5">
          <div className="flex items-center gap-3 p-5 bg-primary/10 border border-primary/30 rounded-sm">
            <Shield className="w-8 h-8 text-primary shrink-0" />
            <div>
              <h2 className="font-bold text-xl">Верификация данных</h2>
              <p className="text-muted-foreground font-mono text-sm mt-1">
                Ваши данные приняты и отправлены на проверку. Инспекция займёт ровно 60 минут.
              </p>
            </div>
          </div>

          <Card className="bg-card border-border text-center">
            <CardContent className="p-8 space-y-2">
              <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest">ОСТАЛОСЬ</p>
              <p className={`text-6xl font-mono font-bold tabular-nums tracking-widest ${countdown <= 0 ? "text-emerald-400" : "text-foreground"}`}>
                {formatCountdown(countdown)}
              </p>
              {countdown <= 0 && (
                <p className="text-sm text-muted-foreground font-mono animate-pulse">Получаем паспорт…</p>
              )}
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardContent className="p-6 space-y-3">
              <div>
                <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-1">НОМЕР ГРАЖДАНИНА</p>
                <p className="text-3xl font-mono font-bold text-primary tracking-widest">{pendingData.citizenNumber}</p>
              </div>
              <p className="text-xs text-muted-foreground font-mono">
                Сохраните этот номер — он ваш идентификатор в TimeNation
              </p>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  if (mode === "issued" && pendingData) {
    return (
      <Layout>
        <div className="max-w-lg space-y-5">
          <div className="flex items-center gap-3 p-5 bg-emerald-500/10 border border-emerald-500/30 rounded-sm">
            <Award className="w-8 h-8 text-emerald-400 shrink-0" />
            <div>
              <h2 className="font-bold text-xl">Паспорт выдан!</h2>
              <p className="text-muted-foreground font-mono text-sm mt-1">Верификация завершена. Добро пожаловать в TimeNation.</p>
            </div>
          </div>
          <Card className="bg-card border-border">
            <CardContent className="p-6 space-y-4">
              <div>
                <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-1">НОМЕР ГРАЖДАНИНА</p>
                <p className="text-3xl font-mono font-bold text-primary tracking-widest">{pendingData.citizenNumber}</p>
                <p className="text-base font-medium mt-2">{pendingData.citizenName}</p>
              </div>
              <a
                href={`${BASE}/api/citizens/number/${pendingData.citizenNumber}/passport`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 w-full justify-center bg-emerald-500 hover:bg-emerald-600 text-white font-mono font-bold py-3 px-4 rounded-sm transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                Открыть цифровой паспорт (SVG)
              </a>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-lg space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Стать гражданином</h1>
          <p className="text-muted-foreground font-mono text-sm mt-1">
            Каждый гражданин получает 60 Дарминов при регистрации
          </p>
        </div>

        <div className="flex items-start gap-3 p-4 bg-primary/5 border border-primary/20 rounded-sm">
          <Clock className="w-5 h-5 text-primary mt-0.5 shrink-0" />
          <div className="space-y-1 text-sm">
            <p className="font-medium">60 Дарминов = 1 час реального времени</p>
            <p className="text-muted-foreground font-mono text-xs">
              1 Дармин = 1 минута · Верификация занимает 60 минут · Паспорт выдаётся автоматически
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-base font-medium">Данные для паспорта ICAO Doc 9303</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-mono text-muted-foreground uppercase tracking-wide">Фамилия</Label>
                  <Input value={surname} onChange={e => setSurname(e.target.value)} placeholder="Иванов" className="bg-secondary border-border font-mono" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-mono text-muted-foreground uppercase tracking-wide">Имя и отчество</Label>
                  <Input value={givenNames} onChange={e => setGivenNames(e.target.value)} placeholder="Иван Иванович" className="bg-secondary border-border font-mono" />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-mono text-muted-foreground uppercase tracking-wide">Псевдоним / отображаемое имя</Label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="Если нет ФИО — укажите псевдоним" className="bg-secondary border-border font-mono" />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-mono text-muted-foreground uppercase tracking-wide">Дата рождения</Label>
                <Input value={dateOfBirth} onChange={e => setDateOfBirth(e.target.value)} placeholder="ГГГГ-ММ-ДД" className="bg-secondary border-border font-mono" />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-mono text-muted-foreground uppercase tracking-wide">Номер телефона *</Label>
                <Input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+7XXXXXXXXXX" required className="bg-secondary border-border font-mono" />
              </div>

              <div className="flex items-start gap-3 pt-1">
                <input type="checkbox" id="tos" checked={tosAccepted} onChange={e => setTosAccepted(e.target.checked)} className="mt-0.5 accent-primary" />
                <label htmlFor="tos" className="text-xs text-muted-foreground font-mono leading-relaxed">
                  Я ознакомлен с Условиями использования. Дармины — внутриигровые баллы, не являются денежными средствами.
                </label>
              </div>

              {error && (
                <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/30 rounded-sm text-sm text-destructive font-mono">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {error}
                </div>
              )}

              <Button type="submit" disabled={loading || !tosAccepted} className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-mono font-bold">
                {loading ? "Регистрация…" : (
                  <span className="flex items-center gap-2">
                    <UserPlus className="w-4 h-4" />
                    Зарегистрироваться
                  </span>
                )}
              </Button>

              <div className="flex items-center gap-2 p-3 bg-muted/30 rounded-sm">
                <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                <p className="text-xs text-muted-foreground font-mono">
                  Паспорт будет выдан через 60 минут. Доступ к системе — немедленно.
                </p>
              </div>
            </CardContent>
          </Card>
        </form>
      </div>
    </Layout>
  );
}
