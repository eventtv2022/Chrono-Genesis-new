import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { KeyRound, CheckCircle2, AlertCircle, Eye, EyeOff, ShieldAlert } from "lucide-react";

export function ResetPassword() {
  const [, navigate] = useLocation();

  const token = new URLSearchParams(window.location.search).get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => { document.title = "Сброс пароля | TimeNation"; }, []);

  const mismatch = confirm.length > 0 && password !== confirm;
  const canSubmit = token.length > 0 && password.length >= 6 && password === confirm;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: password }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Ошибка сброса пароля");
        return;
      }
      setDone(true);
    } catch {
      setError("Ошибка соединения с сервером");
    } finally {
      setLoading(false);
    }
  }

  /* ── No token in URL ──────────────────────────────────────────────────── */
  if (!token) {
    return (
      <Layout>
        <div className="max-w-md space-y-5">
          <div className="flex items-center gap-3 p-5 bg-destructive/10 border border-destructive/30 rounded-sm">
            <ShieldAlert className="w-8 h-8 text-destructive shrink-0" />
            <div>
              <h2 className="font-bold text-xl">Токен не найден</h2>
              <p className="text-muted-foreground font-mono text-sm mt-1">
                Ссылка недействительна или срок действия токена истёк.
              </p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground font-mono">
            Запросите новую ссылку — обратитесь к администратору TimeNation или
            воспользуйтесь формой восстановления по номеру телефона.
          </p>
          <Button
            variant="outline"
            className="font-mono"
            onClick={() => navigate("/")}
          >
            На главную
          </Button>
        </div>
      </Layout>
    );
  }

  /* ── Success screen ───────────────────────────────────────────────────── */
  if (done) {
    return (
      <Layout>
        <div className="max-w-md space-y-5">
          <div className="flex items-center gap-3 p-5 bg-emerald-500/10 border border-emerald-500/30 rounded-sm">
            <CheckCircle2 className="w-8 h-8 text-emerald-400 shrink-0" />
            <div>
              <h2 className="font-bold text-xl">Пароль установлен</h2>
              <p className="text-muted-foreground font-mono text-sm mt-1">
                Теперь вы можете войти в систему с новым паролем.
              </p>
            </div>
          </div>
          <Button
            className="w-full font-mono font-bold bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={() => navigate("/")}
          >
            На главную
          </Button>
        </div>
      </Layout>
    );
  }

  /* ── Form ─────────────────────────────────────────────────────────────── */
  return (
    <Layout>
      <div className="max-w-md space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Сброс пароля</h1>
          <p className="text-muted-foreground font-mono text-sm mt-1">
            Введите новый пароль для вашего аккаунта TimeNation
          </p>
        </div>

        <div className="flex items-start gap-3 p-4 bg-primary/5 border border-primary/20 rounded-sm">
          <KeyRound className="w-5 h-5 text-primary mt-0.5 shrink-0" />
          <p className="text-xs text-muted-foreground font-mono leading-relaxed">
            Токен одноразовый — после успешного сброса ссылка станет
            недействительной. Минимальная длина пароля — 6 символов.
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-base font-medium">Новый пароль</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">

              <div className="space-y-1.5">
                <Label className="text-xs font-mono text-muted-foreground uppercase tracking-wide">
                  Пароль
                </Label>
                <div className="relative">
                  <Input
                    type={showPass ? "text" : "password"}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Минимум 6 символов"
                    autoComplete="new-password"
                    className="bg-secondary border-border font-mono pr-10"
                    required
                    minLength={6}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    tabIndex={-1}
                  >
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {password.length > 0 && password.length < 6 && (
                  <p className="text-xs text-destructive font-mono">Минимум 6 символов</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-mono text-muted-foreground uppercase tracking-wide">
                  Повторите пароль
                </Label>
                <div className="relative">
                  <Input
                    type={showConfirm ? "text" : "password"}
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    placeholder="Повторите пароль"
                    autoComplete="new-password"
                    className={`bg-secondary border-border font-mono pr-10 ${mismatch ? "border-destructive" : ""}`}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    tabIndex={-1}
                  >
                    {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {mismatch && (
                  <p className="text-xs text-destructive font-mono">Пароли не совпадают</p>
                )}
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
                {loading ? "Сохранение…" : (
                  <span className="flex items-center gap-2">
                    <KeyRound className="w-4 h-4" />
                    Установить пароль
                  </span>
                )}
              </Button>

            </CardContent>
          </Card>
        </form>
      </div>
    </Layout>
  );
}
