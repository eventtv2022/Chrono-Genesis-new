import { useState, useEffect } from "react";
import { Layout } from "@/components/Layout";
import { useListCitizens, getListCitizensQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

const RANK_STYLES: Record<string, string> = {
  "Гражданин":              "bg-zinc-500/20 text-zinc-300 border-zinc-500/30",
  "Оператор времени":       "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  "Хранитель времени":      "bg-violet-500/20 text-violet-300 border-violet-500/30",
  "Архитектор потока":      "bg-blue-500/20 text-blue-300 border-blue-500/30",
  "Мастер хронологии":      "bg-amber-500/20 text-amber-300 border-amber-500/30",
  "Синхронизатор вечности": "bg-rose-500/20 text-rose-300 border-rose-500/30",
  // Посол — особый статус (Земельный Фонд), не входит в шкалу merit
  "Посол": "bg-blue-500/20 text-blue-300 border-blue-500/30",
};

export function Citizens() {
  const [query, setQuery] = useState("");

  useEffect(() => {
    document.title = "Реестр граждан | TimeNation";
  }, []);
  const { data: citizens, isLoading } = useListCitizens({
    query: { queryKey: getListCitizensQueryKey() },
  });

  const filtered = (citizens ?? []).filter(
    (c) =>
      !query ||
      c.name.toLowerCase().includes(query.toLowerCase())
  );

  const sorted = [...filtered].sort((a, b) => (b.meritScore ?? 0) - (a.meritScore ?? 0));

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Реестр граждан</h1>
          <p className="text-muted-foreground font-mono text-sm mt-1">
            Рейтинг по Merit Score · {citizens?.length ?? "..."} граждан
          </p>
        </div>

        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по псевдониму..."
            className="pl-9 bg-secondary border-border font-mono text-sm"
          />
        </div>

        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between text-xs font-mono text-muted-foreground uppercase tracking-widest">
              <span className="w-8">#</span>
              <span className="flex-1">Гражданин</span>
              <span className="w-24 text-right">Ранг</span>
              <span className="w-20 text-right">Merit</span>
              <span className="w-24 text-right">Баланс</span>
              <span className="w-20 text-right">Отдал</span>
              <span className="w-20 text-right">Принял</span>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 bg-secondary" />
                ))}
              </div>
            ) : sorted.length === 0 ? (
              <p className="text-muted-foreground text-sm py-8 text-center font-mono">
                Граждан не найдено
              </p>
            ) : (
              <div className="divide-y divide-border/50">
                {sorted.map((citizen, idx) => (
                  <div
                    key={citizen.id}
                    className="flex items-center px-6 py-3 hover:bg-secondary/30 transition-colors"
                  >
                    <span className="w-8 text-xs font-mono text-muted-foreground">#{citizen.id}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{citizen.name}</div>
                    </div>
                    <div className="w-24 text-right">
                      <Badge
                        variant="outline"
                        className={`text-[10px] font-mono truncate max-w-full ${RANK_STYLES[citizen.rank] ?? ""}`}
                      >
                        {citizen.rank}
                      </Badge>
                    </div>
                    <div className="w-20 text-right font-mono text-sm text-primary">
                      {citizen.meritScore ?? 0}
                    </div>
                    <div className="w-24 text-right font-mono text-sm">
                      {(citizen.balanceMinutes as number).toFixed(2)} Д
                    </div>
                    <div className="w-20 text-right font-mono text-xs text-muted-foreground">
                      {(citizen.totalGiven as number).toFixed(2)} Д
                    </div>
                    <div className="w-20 text-right font-mono text-xs text-muted-foreground">
                      {(citizen.totalReceived as number).toFixed(2)} Д
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
