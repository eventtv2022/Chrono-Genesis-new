import { useState } from "react";
import { Layout } from "@/components/Layout";
import { useCreateCitizen } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserPlus, Clock, CheckCircle2, AlertCircle } from "lucide-react";

export function Register() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [tosAccepted, setTosAccepted] = useState(false);
  const [done, setDone] = useState<{ id: number; name: string; balance: number } | null>(null);

  const create = useCreateCitizen({
    mutation: {
      onSuccess(citizen) {
        setDone({
          id: citizen.id,
          name: citizen.name,
          balance: citizen.balanceMinutes,
        });
      },
    },
  });

  const error =
    create.error != null
      ? ((create.error as { message?: string })?.message ?? "Ошибка регистрации")
      : null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!tosAccepted) return;
    create.mutate({ data: { name: name.trim(), phone: phone.trim() } });
  }

  if (done) {
    return (
      <Layout>
        <div className="max-w-lg space-y-6">
          <div className="flex items-center gap-3 p-6 bg-emerald-500/10 border border-emerald-500/30 rounded-sm">
            <CheckCircle2 className="w-8 h-8 text-emerald-400 shrink-0" />
            <div>
              <h2 className="font-bold text-xl">Добро пожаловать, {done.name}</h2>
              <p className="text-muted-foreground font-mono text-sm mt-1">
                Регистрация завершена
              </p>
            </div>
          </div>
          <Card className="bg-card border-border">
            <CardContent className="p-6 space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground font-mono text-sm">ID гражданина</span>
                <span className="font-mono font-bold text-primary text-lg">{done.id}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground font-mono text-sm">Начальный баланс</span>
                <span className="font-mono font-bold text-primary text-lg">{done.balance} Д</span>
              </div>
            </CardContent>
          </Card>
          <p className="text-xs text-muted-foreground font-mono">
            Сохраните ваш ID — он потребуется для входа в мобильном приложении и для пополнения
            баланса в Казначействе.
          </p>
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

        {/* Starting balance info */}
        <div className="flex items-start gap-3 p-4 bg-primary/5 border border-primary/20 rounded-sm">
          <Clock className="w-5 h-5 text-primary mt-0.5 shrink-0" />
          <div className="space-y-1 text-sm">
            <p className="font-medium">60 Дарминов = 1 час реального времени</p>
            <p className="text-muted-foreground font-mono text-xs">
              1 Дармин = 1 минута · Родовая минута (1 Д) защищена от передачи
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-base font-medium">Данные гражданина</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-sm font-mono text-muted-foreground uppercase tracking-wide text-xs">
                  Имя
                </Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Полное имя или псевдоним"
                  required
                  className="bg-secondary border-border font-mono"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone" className="text-sm font-mono text-muted-foreground uppercase tracking-wide text-xs">
                  Номер телефона
                </Label>
                <Input
                  id="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+7XXXXXXXXXX"
                  required
                  className="bg-secondary border-border font-mono"
                />
                <p className="text-xs text-muted-foreground font-mono">
                  Используется для привязки Telegram-бота
                </p>
              </div>

              <div className="flex items-start gap-3 pt-1">
                <input
                  type="checkbox"
                  id="tos"
                  checked={tosAccepted}
                  onChange={(e) => setTosAccepted(e.target.checked)}
                  className="mt-0.5 accent-primary"
                />
                <label htmlFor="tos" className="text-xs text-muted-foreground font-mono leading-relaxed">
                  Я ознакомлен с Условиями использования. Дармины — внутриигровые баллы,
                  не являются денежными средствами и не могут быть конвертированы в реальные деньги.
                </label>
              </div>

              {error && (
                <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/30 rounded-sm text-sm text-destructive font-mono">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {error}
                </div>
              )}

              <Button
                type="submit"
                disabled={create.isPending || !tosAccepted}
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-mono font-bold"
              >
                {create.isPending ? (
                  "Регистрация..."
                ) : (
                  <span className="flex items-center gap-2">
                    <UserPlus className="w-4 h-4" />
                    Стать гражданином
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
