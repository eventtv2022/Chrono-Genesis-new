import { useEffect } from "react";
import { Layout } from "@/components/Layout";
import { useGetStats } from "@workspace/api-client-react";
import { useCitizen } from "@/context/CitizenContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, Clock, Users, Zap } from "lucide-react";
import { CitizenTimeRegistry } from "@/components/CitizenTimeRegistry";

export function Home() {
  const { data: stats, isLoading, isError } = useGetStats();
  const { citizen, authToken } = useCitizen();

  useEffect(() => {
    document.title = "Обзор TimeNation";
  }, []);

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Обзор TimeNation</h1>
          <p className="text-muted-foreground font-mono text-sm mt-2">
            Публичные агрегаты за всю историю системы
          </p>
        </div>

        {isError ? (
          <p className="rounded-md border border-border p-4 text-sm text-muted-foreground">
            Не удалось загрузить сводку. Попробуйте обновить страницу.
          </p>
        ) : isLoading || !stats ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-32 bg-secondary" />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <StatCard title="Всего граждан" value={stats.totalCitizens.toLocaleString()} icon={Users} />
            <StatCard title="Активные аккаунты" value={stats.activeCitizens.toLocaleString()} icon={Activity} />
            <StatCard title="Переводов за всё время" value={stats.totalTransactions.toLocaleString()} icon={Zap} />
            <StatCard
              title="Общий объём переводов"
              value={`${Number(stats.totalMinutesTransferred).toLocaleString(undefined, { maximumFractionDigits: 2 })} Д`}
              icon={Clock}
            />
          </div>
        )}

        {citizen && authToken && (
          <Card className="max-w-xl border-primary/30 bg-primary/5">
            <CardHeader>
              <CardTitle className="text-lg">Ваш личный баланс</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold font-mono text-primary">
                {Number(citizen.balanceMinutes).toLocaleString(undefined, { maximumFractionDigits: 2 })} Д
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Этот показатель виден только после входа в аккаунт.
              </p>
            </CardContent>
          </Card>
        )}

        <p className="text-xs text-muted-foreground">
          Общий объём — сумма всех завершённых переводов, а не текущий остаток минут в системе.
        </p>
        <div className="border-t border-border pt-8">
          <CitizenTimeRegistry />
        </div>
      </div>
    </Layout>
  );
}

function StatCard({ title, value, icon: Icon }: { title: string; value: string; icon: typeof Users }) {
  return (
    <Card className="bg-card border-border">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold font-mono text-primary">{value}</div>
      </CardContent>
    </Card>
  );
}
