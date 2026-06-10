import { useState } from "react";
import { Layout } from "@/components/Layout";
import {
  useGetMinutePackages,
  getGetMinutePackagesQueryKey,
  useCreateCheckoutSession,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ShoppingBag, Clock, AlertCircle } from "lucide-react";

export function Shop() {
  const [citizenId, setCitizenId] = useState("");
  const [loadingPkg, setLoadingPkg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: packages, isLoading } = useGetMinutePackages({
    query: { queryKey: getGetMinutePackagesQueryKey() },
  });

  const checkout = useCreateCheckoutSession({
    mutation: {
      onSuccess(data) {
        if (data.url) {
          window.location.href = data.url;
        } else {
          setError("Не удалось получить ссылку на оплату");
        }
        setLoadingPkg(null);
      },
      onError(err: unknown) {
        const msg = (err as { message?: string })?.message ?? "Ошибка";
        setError(msg);
        setLoadingPkg(null);
      },
    },
  });

  function handleBuy(packageId: string) {
    const id = parseInt(citizenId, 10);
    if (!citizenId || isNaN(id)) {
      setError("Введите корректный ID гражданина");
      return;
    }
    setError(null);
    setLoadingPkg(packageId);
    const base = window.location.origin + "/web/shop";
    checkout.mutate({
      data: {
        citizenId: id,
        packageId,
        successUrl: base + "?status=success",
        cancelUrl: base + "?status=cancel",
      },
    });
  }

  const urlParams = new URLSearchParams(window.location.search);
  const status = urlParams.get("status");

  return (
    <Layout>
      <div className="space-y-6 max-w-2xl">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Казначейство</h1>
          <p className="text-muted-foreground font-mono text-sm mt-1">
            Пополнение баланса Дарминов через Stripe
          </p>
        </div>

        {status === "success" && (
          <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-sm text-emerald-300 text-sm font-mono">
            Оплата прошла успешно. Дармины будут зачислены в течение нескольких секунд.
          </div>
        )}
        {status === "cancel" && (
          <div className="p-4 bg-secondary border border-border rounded-sm text-muted-foreground text-sm font-mono">
            Оплата отменена. Вы можете попробовать снова.
          </div>
        )}

        {/* Citizen ID */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-widest font-mono">
              Идентификатор гражданина
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Input
              type="number"
              value={citizenId}
              onChange={(e) => { setCitizenId(e.target.value); setError(null); }}
              placeholder="Введите ваш ID (числовой)"
              className="bg-secondary border-border font-mono max-w-xs"
            />
            <p className="text-xs text-muted-foreground mt-2 font-mono">
              ID отображается в мобильном приложении на вкладке профиля
            </p>
          </CardContent>
        </Card>

        {error && (
          <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/30 rounded-sm text-sm text-destructive font-mono">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Packages */}
        <div className="space-y-3">
          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-24 bg-secondary" />
            ))
          ) : (packages ?? []).map((pkg) => (
            <Card
              key={pkg.id}
              className="bg-card border-border hover:border-primary/50 transition-colors"
            >
              <CardContent className="flex items-center justify-between p-5">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-sm bg-primary/10 border border-primary/30 flex items-center justify-center">
                    <Clock className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <div className="font-bold text-lg font-mono text-primary">
                      {pkg.minutes} Д
                    </div>
                    <div className="text-xs text-muted-foreground font-mono mt-0.5">
                      {pkg.label}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="font-bold font-mono text-lg">
                      {pkg.price} {pkg.currency}
                    </div>
                    <div className="text-xs text-muted-foreground font-mono">
                      {(pkg.price / pkg.minutes).toFixed(2)} {pkg.currency}/Д
                    </div>
                  </div>
                  <Button
                    onClick={() => handleBuy(pkg.id)}
                    disabled={loadingPkg !== null}
                    className="bg-primary text-primary-foreground hover:bg-primary/90 font-mono"
                  >
                    {loadingPkg === pkg.id ? (
                      <span className="flex items-center gap-2">
                        <span className="animate-spin text-xs">⟳</span> Переход...
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <ShoppingBag className="w-4 h-4" />
                        Купить
                      </span>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <p className="text-xs text-muted-foreground font-mono leading-relaxed">
          Дармины — внутренняя игровая валюта TimeNation. Не являются денежными средствами
          в юридическом смысле. Оплата обрабатывается через Stripe.
        </p>
      </div>
    </Layout>
  );
}
