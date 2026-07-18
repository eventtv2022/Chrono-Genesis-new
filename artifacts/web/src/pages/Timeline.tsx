import { useState, useCallback } from "react";
import { Layout } from "@/components/Layout";
import {
  useGetTimelineOccupied,
  getGetTimelineOccupiedQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft, ChevronRight, MapPin, X, Clock, CheckCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCitizen } from "@/context/CitizenContext";
import { useLanguage } from "@/context/LanguageContext";

const MONTHS_RU = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
];
const WEEKDAYS_RU = ["Пн","Вт","Ср","Чт","Пт","Сб","Вс"];

const currentYear = new Date().getFullYear();
const currentMonth = new Date().getMonth() + 1;

function pad2(n: number) { return String(n).padStart(2, "0"); }
function padYear(n: number) { return String(n).padStart(4, "0"); }

export function Timeline() {
  const { citizen, refreshCitizen } = useCitizen();
  const { t } = useLanguage();
  const queryClient = useQueryClient();

  const [year, setYear]   = useState(currentYear);
  const [month, setMonth] = useState(currentMonth);

  // Booking drill-down state
  const [selectedDay,  setSelectedDay]  = useState<number | null>(null);
  const [selectedHour, setSelectedHour] = useState<number | null>(null);
  const [confirmCoord, setConfirmCoord] = useState<string | null>(null);
  const [anchoring,    setAnchoring]    = useState(false);
  const [anchorResult, setAnchorResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const yearStr  = String(year);
  const monthStr = String(month);

  const { data: occupied, isLoading } = useGetTimelineOccupied(
    { year: yearStr, month: monthStr },
    { query: { queryKey: getGetTimelineOccupiedQueryKey({ year: yearStr, month: monthStr }) } }
  );

  const dayStr = selectedDay !== null ? pad2(selectedDay) : null;
  const { data: dayOccupied } = useGetTimelineOccupied(
    { year: yearStr, month: monthStr, day: dayStr ?? "" },
    { query: { queryKey: getGetTimelineOccupiedQueryKey({ year: yearStr, month: monthStr, day: dayStr ?? "" }), enabled: !!dayStr } }
  );

  const coords = occupied ?? [];

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
    if (m < 1)  { m = 12; y--; }
    setMonth(m); setYear(y);
    closePanel();
  }

  function closePanel() {
    setSelectedDay(null); setSelectedHour(null);
    setConfirmCoord(null); setAnchorResult(null);
  }

  function formatCoord(coord: string): string {
    return `${coord.slice(0, 4)}-${coord.slice(4, 6)}-${coord.slice(6, 8)} ${coord.slice(8, 10)}:${coord.slice(10, 12)}`;
  }

  const dayCoords = new Set((dayOccupied ?? []).map((e) => e.timelineCoord));
  void dayCoords;

  const ownerOf = useCallback((coord: string) => {
    return (dayOccupied ?? []).find((e) => e.timelineCoord === coord);
  }, [dayOccupied]);

  const doAnchor = async (coord: string) => {
    if (!citizen) return;
    setAnchoring(true);
    setAnchorResult(null);
    try {
      const res = await fetch("/api/timeline/anchor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ citizenId: citizen.id, timelineCoord: coord }),
      });
      const data = await res.json() as { error?: string; newBalance?: number };
      if (!res.ok) {
        setAnchorResult({ ok: false, msg: data.error ?? t.connection_error });
      } else {
        setAnchorResult({ ok: true, msg: `${t.tl_anchor_ok} ${data.newBalance} Д` });
        setConfirmCoord(null);
        void queryClient.invalidateQueries({ queryKey: getGetTimelineOccupiedQueryKey({ year: yearStr, month: monthStr }) });
        void queryClient.invalidateQueries({ queryKey: getGetTimelineOccupiedQueryKey({ year: yearStr, month: monthStr, day: dayStr ?? "" }) });
        void refreshCitizen();
      }
    } catch {
      setAnchorResult({ ok: false, msg: t.connection_error });
    } finally {
      setAnchoring(false);
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t.nav_timeline}</h1>
          <p className="text-muted-foreground font-mono text-sm mt-1">
            Захваченные временны́е координаты · 12-значный код
          </p>
        </div>

        {/* Month navigator */}
        <div className="flex items-center gap-4 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => { setYear((y) => y - 1); closePanel(); }} className="font-mono text-xs">
            {year - 1}
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => changeMonth(-1)}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="font-mono font-bold text-lg w-40 text-center">
              {MONTHS_RU[month - 1]} {year}
            </span>
            <Button variant="ghost" size="icon" onClick={() => changeMonth(1)}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
          <Button variant="outline" size="sm" onClick={() => { setYear((y) => y + 1); closePanel(); }} className="font-mono text-xs">
            {year + 1}
          </Button>
          <span className="text-xs text-muted-foreground font-mono ml-2">{coords.length} точек</span>
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 gap-1 text-xs font-mono">
          {WEEKDAYS_RU.map((d) => (
            <div key={d} className="text-center text-muted-foreground uppercase py-1">{d}</div>
          ))}
          {(() => {
            const firstDay = new Date(year, month - 1, 1).getDay();
            const offset = firstDay === 0 ? 6 : firstDay - 1;
            return Array.from({ length: offset }).map((_, i) => <div key={`off-${i}`} />);
          })()}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const dayPad = pad2(day);
            const entries = byDay[dayPad] ?? [];
            const hasCoords = entries.length > 0;
            const isMine = citizen && entries.some((coord) =>
              (occupied ?? []).find((e) => e.timelineCoord === coord && (e as { citizenId?: number }).citizenId === citizen.id)
            );
            const isSelected = selectedDay === day;
            return (
              <button
                key={day}
                onClick={() => { setSelectedDay(day); setSelectedHour(null); setConfirmCoord(null); setAnchorResult(null); }}
                className={`aspect-square flex flex-col items-center justify-center rounded-sm border transition-colors cursor-pointer hover:border-primary/70 ${
                  isSelected
                    ? "border-primary bg-primary/20 text-primary ring-1 ring-primary"
                    : isMine
                    ? "bg-primary/15 border-primary/50 text-primary"
                    : hasCoords
                    ? "bg-red-900/20 border-red-500/40 text-red-400"
                    : "bg-secondary/30 border-border/30 text-muted-foreground hover:bg-secondary/50"
                }`}
              >
                <span className="text-[11px] font-bold">{day}</span>
                {hasCoords && <span className="text-[8px] font-mono opacity-70">{entries.length}</span>}
              </button>
            );
          })}
        </div>

        {/* Day booking panel */}
        {selectedDay !== null && (
          <Card className="bg-card border-primary/30">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Clock className="w-4 h-4 text-primary" />
                  {pad2(selectedDay)}.{pad2(month)}.{year} — {t.tl_choose_hour}
                </CardTitle>
                <button onClick={closePanel} className="text-muted-foreground hover:text-foreground">
                  <X className="w-4 h-4" />
                </button>
              </div>
              {!citizen && (
                <p className="text-xs text-amber-400 mt-1">{t.tl_login_to_book_coord}</p>
              )}
            </CardHeader>
            <CardContent>
              {/* Hour grid */}
              {selectedHour === null ? (
                <div className="grid grid-cols-6 sm:grid-cols-8 gap-1">
                  {Array.from({ length: 24 }, (_, h) => {
                    const prefix = `${padYear(year)}${pad2(month)}${pad2(selectedDay)}${pad2(h)}`;
                    const occupied60 = (dayOccupied ?? []).filter((e) => e.timelineCoord.startsWith(prefix));
                    const isMineHour = citizen && occupied60.some((e) => (e as { citizenId?: number }).citizenId === citizen.id);
                    const fullyOcc = occupied60.length >= 60;
                    const partOcc = occupied60.length > 0 && !fullyOcc;
                    return (
                      <button
                        key={h}
                        onClick={() => { if (!fullyOcc) setSelectedHour(h); }}
                        disabled={fullyOcc}
                        className={`py-2 rounded text-xs font-mono border transition-colors ${
                          isMineHour
                            ? "bg-primary/30 border-primary text-primary"
                            : fullyOcc
                            ? "bg-red-900/30 border-red-500/30 text-red-400/50 cursor-not-allowed"
                            : partOcc
                            ? "bg-amber-900/20 border-amber-500/30 text-amber-300 hover:border-primary"
                            : "bg-secondary/30 border-border/30 text-muted-foreground hover:border-primary hover:text-foreground"
                        }`}
                      >
                        {pad2(h)}
                      </button>
                    );
                  })}
                </div>
              ) : (
                /* Minute grid */
                <div>
                  <button
                    className="flex items-center gap-1 text-xs text-muted-foreground mb-3 hover:text-foreground"
                    onClick={() => { setSelectedHour(null); setConfirmCoord(null); setAnchorResult(null); }}
                  >
                    <ChevronLeft className="w-3 h-3" /> {pad2(selectedHour)}:00 — {t.tl_choose_minute}
                  </button>
                  <div className="grid grid-cols-10 sm:grid-cols-12 gap-1">
                    {Array.from({ length: 60 }, (_, min) => {
                      const coord = `${padYear(year)}${pad2(month)}${pad2(selectedDay)}${pad2(selectedHour)}${pad2(min)}`;
                      const owner = ownerOf(coord);
                      const isMine = citizen && (owner as { citizenId?: number } | undefined)?.citizenId === citizen.id;
                      const isOcc = !!owner && !isMine;
                      const isPending = confirmCoord === coord;
                      return (
                        <button
                          key={min}
                          onClick={() => {
                            if (owner || !citizen) return;
                            setConfirmCoord(isPending ? null : coord);
                            setAnchorResult(null);
                          }}
                          disabled={!!owner || !citizen}
                          className={`py-1.5 rounded text-[11px] font-mono border transition-colors ${
                            isMine
                              ? "bg-primary/30 border-primary text-primary cursor-default"
                              : isOcc
                              ? "bg-red-900/30 border-red-500/30 text-red-400/50 cursor-not-allowed"
                              : isPending
                              ? "bg-primary/20 border-primary text-primary ring-1 ring-primary"
                              : !citizen
                              ? "bg-secondary/20 border-border/20 text-muted-foreground/40 cursor-not-allowed"
                              : "bg-secondary/30 border-border/30 text-muted-foreground hover:border-primary hover:text-foreground"
                          }`}
                          title={isMine ? t.tl_mine_coord : isOcc ? t.tl_occupied_coord : coord}
                        >
                          {pad2(min)}
                        </button>
                      );
                    })}
                  </div>

                  {/* Confirm panel */}
                  {confirmCoord && (
                    <div className="mt-4 p-3 rounded-lg border border-primary/40 bg-primary/5">
                      <p className="text-sm font-mono text-foreground mb-1">
                        {t.tl_confirm_coord}
                      </p>
                      <p className="text-xs text-muted-foreground font-mono mb-3">
                        {confirmCoord} · {t.tl_cost} <span className="text-primary font-bold">1 Д</span>
                      </p>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setConfirmCoord(null)}
                          disabled={anchoring}
                        >
                          {t.cancel}
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => doAnchor(confirmCoord)}
                          disabled={anchoring}
                          className="bg-primary hover:bg-primary/90 text-primary-foreground"
                        >
                          {anchoring ? t.tl_anchoring : t.tl_anchor_btn}
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Result */}
                  {anchorResult && (
                    <div className={`mt-3 flex items-center gap-2 p-3 rounded-lg border text-sm ${
                      anchorResult.ok
                        ? "border-green-500/40 bg-green-900/10 text-green-400"
                        : "border-red-500/40 bg-red-900/10 text-red-400"
                    }`}>
                      {anchorResult.ok
                        ? <CheckCircle className="w-4 h-4 shrink-0" />
                        : <XCircle className="w-4 h-4 shrink-0" />}
                      <span className="font-mono text-xs">{anchorResult.msg}</span>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

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
                Захваченные координаты — {MONTHS_RU[month - 1]} {year}
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

        {!isLoading && coords.length === 0 && !selectedDay && (
          <div className="text-center py-12 text-muted-foreground font-mono text-sm">
            В этом месяце нет захваченных координат
          </div>
        )}
      </div>
    </Layout>
  );
}
