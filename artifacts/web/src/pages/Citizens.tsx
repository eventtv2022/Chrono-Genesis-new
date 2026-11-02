import { useState, useEffect } from "react";
import { Layout } from "@/components/Layout";
import { useListCitizens, getListCitizensQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

export function Citizens() {
  const [query, setQuery] = useState("");

  useEffect(() => {
    document.title = "Реестр граждан | TimeNation";
  }, []);
  const { data: citizens, isLoading } = useListCitizens({
    query: { queryKey: getListCitizensQueryKey() },
  });
  const filtered = (citizens ?? []).filter(({ citizenNumber }) =>
    citizenNumber.includes(query.trim()),
  );

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Реестр граждан</h1>
          <p className="text-muted-foreground font-mono text-sm mt-1">
            Только номера паспортов · {citizens?.length ?? "..."} граждан
          </p>
        </div>
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по номеру паспорта..."
            className="pl-9 bg-secondary border-border font-mono text-sm"
          />
        </div>
        <Card className="bg-card border-border">
          <CardHeader className="pb-3 text-xs font-mono text-muted-foreground uppercase tracking-widest">
            Номера паспортов
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10 bg-secondary" />)}
              </div>
            ) : filtered.length === 0 ? (
              <p className="text-muted-foreground text-sm py-8 text-center font-mono">Номера не найдены</p>
            ) : (
              <div className="divide-y divide-border/50">
                {filtered.map(({ citizenNumber }, index) => (
                  <div key={citizenNumber} className="flex items-center gap-4 px-6 py-3 hover:bg-secondary/30 transition-colors">
                    <span className="w-8 text-xs font-mono text-muted-foreground">{index + 1}</span>
                    <span className="font-mono font-medium">№{citizenNumber}</span>
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
