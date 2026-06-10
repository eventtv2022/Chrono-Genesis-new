import { useState } from "react";
import { Layout } from "@/components/Layout";
import { useGetTvSlots, useGetTvSchedule, getGetTvSlotsQueryKey, getGetTvScheduleQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, Video, Clock } from "lucide-react";

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

const SLOT_TYPE_COLORS: Record<string, string> = {
  citizen: "bg-primary/30 border-primary/50",
  quarter: "bg-blue-500/30 border-blue-400/50",
  half: "bg-purple-500/30 border-purple-400/50",
  apex: "bg-rose-500/30 border-rose-400/50",
};

const STATUS_COLORS: Record<string, string> = {
  free: "bg-secondary/40",
  booked: "bg-primary/25",
  aired: "bg-muted/60",
};

const TYPE_LABELS: Record<string, string> = {
  citizen: "Гражданин",
  quarter: "Квартал",
  half: "Половина",
  apex: "Апекс",
};

const SLOT_TYPE_BADGE: Record<string, string> = {
  citizen: "bg-primary/20 text-primary border-primary/40",
  quarter: "bg-blue-500/20 text-blue-300 border-blue-400/40",
  half: "bg-purple-500/20 text-purple-300 border-purple-400/40",
  apex: "bg-rose-500/20 text-rose-300 border-rose-400/40",
};

export function Tv() {
  const [date] = useState(todayDate);

  const { data: slotsData, isLoading: slotsLoading } = useGetTvSlots(
    { date },
    { query: { queryKey: getGetTvSlotsQueryKey({ date }) } }
  );

  const { data: scheduleData, isLoading: scheduleLoading } = useGetTvSchedule(
    { date },
    { query: { queryKey: getGetTvScheduleQueryKey({ date }) } }
  );

  const slots = slotsData?.slots ?? [];
  const schedule = scheduleData?.schedule ?? [];

  // Build a 24×60 matrix from flat slots array
  const grid: (typeof slots[0] | null)[][] = Array.from({ length: 24 }, (_, h) =>
    Array.from({ length: 60 }, (_, m) => slots[h * 60 + m] ?? null)
  );

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">TimeNation-TV</h1>
            <p className="text-muted-foreground font-mono text-sm mt-1">
              1440 слотов · {date}
            </p>
          </div>
          <div className="flex gap-3 text-xs font-mono">
            {scheduleData && (
              <>
                <span className="text-muted-foreground">
                  Свободно: <span className="text-foreground">{scheduleData.freeSlots}</span>
                </span>
                <span className="text-muted-foreground">
                  Занято: <span className="text-primary">{scheduleData.bookedSlots}</span>
                </span>
              </>
            )}
          </div>
        </div>

        {/* Slot legend */}
        <div className="flex flex-wrap gap-4 text-xs font-mono text-muted-foreground">
          <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-secondary/80 border border-border inline-block" />Свободно</div>
          <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-primary/30 border border-primary/50 inline-block" />Гражданин</div>
          <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-blue-500/30 border border-blue-400/50 inline-block" />Квартал</div>
          <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-purple-500/30 border border-purple-400/50 inline-block" />Половина</div>
          <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-rose-500/30 border border-rose-400/50 inline-block" />Апекс</div>
        </div>

        {/* 24×60 grid */}
        <Card className="bg-card border-border overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-mono text-muted-foreground uppercase tracking-widest">
              Сетка эфира
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {slotsLoading ? (
              <div className="p-6 space-y-1">
                {Array.from({ length: 24 }).map((_, i) => (
                  <Skeleton key={i} className="h-4 w-full bg-secondary/50" />
                ))}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <div className="p-4 space-y-0.5 min-w-[720px]">
                  {grid.map((row, hour) => (
                    <div key={hour} className="flex items-center gap-1">
                      <span className="text-[10px] font-mono text-muted-foreground w-7 shrink-0 text-right">
                        {String(hour).padStart(2, "0")}
                      </span>
                      <div className="flex gap-[1px] flex-1">
                        {row.map((slot, min) => {
                          if (!slot) return (
                            <div
                              key={min}
                              className="w-[calc(100%/60)] h-3 bg-secondary/40 border border-border/20 rounded-[1px]"
                            />
                          );
                          const color =
                            slot.status === "free"
                              ? "bg-secondary/40 border-border/20"
                              : SLOT_TYPE_COLORS[slot.slotType] ?? "bg-primary/30";
                          return (
                            <div
                              key={min}
                              title={`${slot.hourLabel}:${slot.minLabel} — ${TYPE_LABELS[slot.slotType] ?? slot.slotType} · ${slot.status === "free" ? "Свободно" : (slot.ownerName ?? "Занято")}`}
                              className={`w-[calc(100%/60)] h-3 border rounded-[1px] cursor-default transition-opacity hover:opacity-80 ${color}`}
                            />
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Booked schedule */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-lg font-medium flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary" />
              Расписание эфира
            </CardTitle>
          </CardHeader>
          <CardContent>
            {scheduleLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 bg-secondary" />)}
              </div>
            ) : schedule.length === 0 ? (
              <p className="text-muted-foreground text-sm py-4 text-center font-mono">
                На сегодня нет забронированных слотов
              </p>
            ) : (
              <div className="space-y-2">
                {schedule.map((entry) => (
                  <div
                    key={entry.slotId}
                    className="flex items-center justify-between p-3 bg-secondary/40 border border-border/50 rounded-sm"
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-primary text-sm font-bold tabular-nums">
                        {entry.hourLabel}:{entry.minLabel}
                      </span>
                      <Badge
                        variant="outline"
                        className={`text-[10px] font-mono ${SLOT_TYPE_BADGE[entry.slotType] ?? ""}`}
                      >
                        {TYPE_LABELS[entry.slotType] ?? entry.slotType}
                      </Badge>
                      <span className="text-sm">{entry.ownerName ?? "—"}</span>
                      {entry.isRetro && (
                        <span className="text-[10px] font-mono text-muted-foreground uppercase">РЕТРО</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {entry.hasRenderedVideo && entry.mediaUrl && (
                        <a
                          href={`/api/tv/media/${entry.mediaUrl.split("/").pop()}`}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1 text-xs text-primary hover:underline font-mono"
                        >
                          <Video className="w-3 h-3" />
                          MP4
                        </a>
                      )}
                      {entry.catcastUrl && (
                        <a
                          href={entry.catcastUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1 text-xs text-blue-400 hover:underline font-mono"
                        >
                          <ExternalLink className="w-3 h-3" />
                          Catcast
                        </a>
                      )}
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
