import { useEffect } from "react";
import { Layout } from "@/components/Layout";
import { useGetStats } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, Clock, Users, Zap } from "lucide-react";

export function Home() {
  const { data: stats, isLoading } = useGetStats();

  useEffect(() => {
    document.title = "Хронос-Консоль | TimeNation";
  }, []);

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Хронос-Консоль</h1>
          <p className="text-muted-foreground font-mono text-sm mt-2">Пульс экономики в реальном времени</p>
        </div>

        {isLoading || !stats ? (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[1,2,3,4].map(i => <Skeleton key={i} className="h-32 bg-secondary" />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <StatCard title="Всего граждан" value={stats.totalCitizens} icon={Users} />
            <StatCard title="Активных граждан" value={stats.activeCitizens} icon={Activity} />
            <StatCard title="Циркулирует (Д)" value={stats.totalMinutesCirculated} icon={Clock} />
            <StatCard title="Транзакций" value={stats.totalTransactions} icon={Zap} />
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-lg font-medium flex items-center gap-2">
                <Clock className="w-5 h-5 text-primary" />
                Последние транзакции
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading || !stats ? (
                <div className="space-y-4">
                  {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-12 bg-secondary" />)}
                </div>
              ) : (
                <div className="space-y-4">
                  {stats.recentTransactions.map(tx => (
                    <div key={tx.id} className="flex justify-between items-center p-3 bg-secondary/50 border border-border/50 rounded-sm">
                      <div>
                        <div className="text-sm font-medium">{tx.fromCitizenName} → {tx.toCitizenName}</div>
                        <div className="text-xs text-muted-foreground font-mono mt-1">{new Date(tx.createdAt).toLocaleString()}</div>
                      </div>
                      <div className="text-primary font-mono font-bold">+{tx.minutesTransferred} Д</div>
                    </div>
                  ))}
                  {stats.recentTransactions.length === 0 && (
                    <div className="text-muted-foreground text-sm py-4 text-center">Транзакций пока нет</div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
          
          <div className="space-y-6">
             <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-lg font-medium">Топ — Отдают</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading || !stats ? <Skeleton className="h-32 bg-secondary" /> : (
                  <div className="space-y-3">
                    {stats.topGivers.slice(0, 3).map((citizen, i) => (
                      <div key={citizen.id} className="flex justify-between items-center">
                        <div className="flex items-center gap-3">
                          <span className="text-muted-foreground font-mono text-xs w-4">{i + 1}.</span>
                          <span className="font-medium">{citizen.name}</span>
                        </div>
                        <span className="text-sm font-mono text-muted-foreground">{citizen.totalGiven} Д</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-lg font-medium">Топ — Принимают</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading || !stats ? <Skeleton className="h-32 bg-secondary" /> : (
                  <div className="space-y-3">
                    {stats.topReceivers.slice(0, 3).map((citizen, i) => (
                      <div key={citizen.id} className="flex justify-between items-center">
                        <div className="flex items-center gap-3">
                          <span className="text-muted-foreground font-mono text-xs w-4">{i + 1}.</span>
                          <span className="font-medium">{citizen.name}</span>
                        </div>
                        <span className="text-sm font-mono text-muted-foreground">{citizen.totalReceived} Д</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </Layout>
  );
}

function StatCard({ title, value, icon: Icon }: { title: string, value: string | number, icon: any }) {
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
