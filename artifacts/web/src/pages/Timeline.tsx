import { useState, useEffect } from "react";
import { Layout } from "@/components/Layout";
import {
  useGetTimelineOccupied,
  getGetTimelineOccupiedQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";

const MONTHS = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
];

const currentYear = new Date().getFullYear();
const currentMonth = new Date().getMonth() + 1;

export function Timeline() {
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState(currentMonth);

  useEffect(() => {
    document.title = "Таймлайн | TimeNation";
  }, []);

  const yearStr = String(year);
  const monthStr = String(month);

  const { data: occupied, isLoading } = useGetTimelineOccupied(
    { year: yearStr, month: monthStr },
    { query: { queryKey: getGetTimelineOccupiedQueryKey({ year: yearStr, month: monthStr }) } }
  );

  const coords = occupied ?? [];

  // Group by day within the month
  const byDay: Record<string, string[]> = {};
  for (const entry of coords) {
    const coord = entry.timelineCoord;
    const day = coord.slice(6, 8);
    if (!byDay[day]) byDay[day] = [];
    byDay[day].push(coord);
  }

  const daysInMonth = new Date(year, month, 0).getDate();

  function changeMonth(delta: number) {
    let m = month + delta;
    let y = year;
    if (m > 12) { m = 1; y++; }
    if (m < 1) { m = 12; y--; }
    setMonth(m);
    setYear(y);
  }

  function formatCoord(coord: string): string {
    // YYYYMMDDHHmm → YYYY-MM-DD HH:mm
    return `${coord.slice(0, 4)}-${coord.slice(4, 6)}-${coord.slice(6, 8)} ${coord.slice(8, 10)}:${coord.slice(10, 12)}`;
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Таймлайн</h1>
          <p className="text-muted-foreground font-mono text-sm mt-1">
            Захваченные временны́е координаты · 12-значный код
          </p>
        </div>

        {/* Month navigator */}
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setYear((y) => y - 1)}
            className="font-mono text-xs"
          >
            {year - 1}
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => changeMonth(-1)}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="font-mono font-bold text-lg w-40 text-center">
              {MONTHS[month - 1]} {year}
            </span>
            <Button variant="ghost" size="icon" onClick={() => changeMonth(1)}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setYear((y) => y + 1)}
            className="font-mono text-xs"
          >
            {year + 1}
          </Button>
          <span className="text-xs text-muted-foreground font-mono ml-2">
            {coords.length} точек
          </span>
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 gap-1 text-xs font-mono">
          {["Пн","Вт","Ср","Чт","Пт","Сб","Вс"].map((d) => (
            <div key={d} className="text-center text-muted-foreground uppercase py-1">{d}</div>
          ))}
          {/* Offset for first day of month */}
          {(() => {
            const firstDay = new Date(year, month - 1, 1).getDay();
            const offset = firstDay === 0 ? 6 : firstDay - 1;
            return Array.from({ length: offset }).map((_, i) => (
              <div key={`off-${i}`} />
            ));
          })()}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = String(i + 1).padStart(2, "0");
            const entries = byDay[day] ?? [];
            const hasCoords = entries.length > 0;
            return (
              <div
                key={day}
                className={`aspect-square flex flex-col items-center justify-center rounded-sm border transition-colors ${
                  hasCoords
                    ? "bg-primary/15 border-primary/50 text-primary"
                    : "bg-secondary/30 border-border/30 text-muted-foreground"
                }`}
                title={hasCoords ? entries.map(formatCoord).join("\n") : ""}
              >
                <span className="text-[11px] font-bold">{i + 1}</span>
                {hasCoords && (
                  <span className="text-[8px] font-mono text-primary/80">{entries.length}</span>
                )}
              </div>
            );
          })}
        </div>

        {/* Coordinate list */}
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 bg-secondary" />
            ))}
          </div>
        ) : coords.length > 0 && (
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <MapPin className="w-4 h-4 text-primary" />
                Захваченные координаты — {MONTHS[month - 1]} {year}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                {coords.map((entry) => (
                  <div
                    key={entry.timelineCoord}
                    className="p-2 bg-secondary/50 border border-border/50 rounded-sm text-xs font-mono"
                  >
                    <div className="text-primary font-bold">{entry.timelineCoord}</div>
                    <div className="text-muted-foreground text-[10px] mt-0.5">
                      {formatCoord(entry.timelineCoord)}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {!isLoading && coords.length === 0 && (
          <div className="text-center py-12 text-muted-foreground font-mono text-sm">
            В этом месяце нет захваченных координат
          </div>
        )}
      </div>
    </Layout>
  );
}
