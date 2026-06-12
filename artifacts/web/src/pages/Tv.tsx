import { useState, useRef, useEffect, useCallback } from "react";
import { Layout } from "@/components/Layout";
import {
  useGetTvSlots,
  useGetTvSchedule,
  getGetTvSlotsQueryKey,
  getGetTvScheduleQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  ExternalLink,
  Video,
  Clock,
  Terminal,
  Zap,
  Shield,
  CreditCard,
  Wallet,
  ChevronRight,
  Bitcoin,
  Radio,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useCitizen } from "@/context/CitizenContext";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SlotLike {
  id: number;
  slotType: string;
  status: string;
  minuteIndex: number;
  hourLabel: string;
  minLabel: string;
  ownerName?: string | null;
  isRetro: boolean;
  timeltrBurnCost: number;
}

interface BookingResult {
  checkoutUrl?: string;
  slot?: { id: number; status: string };
  message?: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SLOT_TYPE_COLORS: Record<string, string> = {
  citizen: "bg-primary/30 border-primary/50",
  quarter: "bg-blue-500/30 border-blue-400/50",
  half: "bg-purple-500/30 border-purple-400/50",
  apex: "bg-rose-500/30 border-rose-400/50",
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

const RENDER_PATH_BY_SLOT: Record<string, "light" | "heavy"> = {
  citizen: "light",
  quarter: "heavy",
  half: "heavy",
  apex: "heavy",
};

// ── Chronos Live Player ────────────────────────────────────────────────────────

interface LiveSlotInfo {
  minuteIndex: number;
  videoUrl: string | null;
  hasContent: boolean;
  ownerName: string | null;
  slotType: string | null;
  slotId: number | null;
}

function ChronosLivePlayer({ date }: { date: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  const [currentMinute, setCurrentMinute] = useState<number>(() => {
    const now = new Date();
    return now.getUTCHours() * 60 + now.getUTCMinutes();
  });
  const [utcClock, setUtcClock] = useState("");
  const [slot, setSlot] = useState<LiveSlotInfo | null>(null);
  const prefetch = useRef<{ minute: number; data: LiveSlotInfo | null } | null>(null);

  const fetchSlot = useCallback(async (minute: number): Promise<LiveSlotInfo | null> => {
    try {
      const res = await fetch(`/api/tv/live-slot?date=${date}&minute=${minute}`);
      if (!res.ok) return null;
      return (await res.json()) as LiveSlotInfo;
    } catch {
      return null;
    }
  }, [date]);

  // Switch the player to a new slot info
  const applySlot = useCallback((info: LiveSlotInfo | null) => {
    setSlot(info);
    const v = videoRef.current;
    if (!v) return;
    if (info?.videoUrl) {
      if (v.src !== info.videoUrl) {
        v.src = info.videoUrl;
        v.load();
      }
      void v.play().catch(() => {/* autoplay blocked — user must click */});
    } else {
      v.pause();
      v.removeAttribute("src");
      v.load();
    }
  }, []);

  // Initial load
  useEffect(() => {
    const now = new Date();
    const m = now.getUTCHours() * 60 + now.getUTCMinutes();
    setCurrentMinute(m);
    void fetchSlot(m).then(applySlot);
  }, [fetchSlot, applySlot]);

  // 500ms ticker: clock + minute-change engine + prefetch
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      const h = now.getUTCHours();
      const m = now.getUTCMinutes();
      const s = now.getUTCSeconds();
      const minute = h * 60 + m;

      setUtcClock(
        `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")} UTC`
      );

      // Prefetch next minute at second 55+
      if (s >= 55) {
        const next = (minute + 1) % 1440;
        if (!prefetch.current || prefetch.current.minute !== next) {
          void fetchSlot(next).then(data => {
            prefetch.current = { minute: next, data };
          });
        }
      }

      // On minute change: apply prefetched or fetch fresh
      if (minute !== currentMinute) {
        setCurrentMinute(minute);
        if (prefetch.current?.minute === minute) {
          applySlot(prefetch.current.data);
          prefetch.current = null;
        } else {
          void fetchSlot(minute).then(applySlot);
        }
      }
    }, 500);

    return () => clearInterval(timer);
  }, [currentMinute, fetchSlot, applySlot]);

  const hh = String(Math.floor(currentMinute / 60)).padStart(2, "0");
  const mm = String(currentMinute % 60).padStart(2, "0");

  return (
    <Card className="bg-card border-border overflow-hidden">
      {/* Status bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/50 bg-black/30">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="flex items-center gap-1.5 text-orange-400 font-mono text-xs font-bold uppercase tracking-widest">
            <span className="w-2 h-2 rounded-full bg-orange-400 animate-pulse shrink-0" />
            В ЭФИРЕ
          </span>
          <span className="font-mono text-sm font-bold text-primary tabular-nums">
            {hh}:{mm}
          </span>
          {slot?.hasContent ? (
            <>
              <span className="text-border/60 select-none">|</span>
              {slot.slotType && (
                <Badge
                  variant="outline"
                  className={`text-[10px] font-mono ${SLOT_TYPE_BADGE[slot.slotType] ?? ""}`}
                >
                  {TYPE_LABELS[slot.slotType] ?? slot.slotType}
                </Badge>
              )}
              <span className="text-sm text-foreground/80 truncate max-w-[200px]">
                {slot.ownerName}
              </span>
            </>
          ) : (
            <span className="text-xs text-muted-foreground font-mono">
              Слот пуст — ожидание эфира
            </span>
          )}
        </div>
        <span className="text-[10px] font-mono text-muted-foreground/60 tabular-nums shrink-0">
          {utcClock}
        </span>
      </div>

      {/* Screen */}
      <div className="relative bg-black" style={{ aspectRatio: "16/9" }}>
        {/* Idle overlay */}
        {!slot?.hasContent && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gradient-to-br from-[#0D1B2A] via-[#05000F] to-[#0D1B2A]">
            <Radio className="w-10 h-10 text-primary/30" />
            <div className="text-center">
              <div className="font-mono text-xl font-bold text-primary/40 tracking-[0.3em] uppercase">
                TN·TV
              </div>
              <div className="font-mono text-[11px] text-muted-foreground/50 uppercase tracking-widest mt-1 animate-pulse">
                Эфир ожидает · слот {hh}:{mm}
              </div>
            </div>
          </div>
        )}
        {/* Single persistent video element */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          controls
          loop
          className={`w-full h-full ${slot?.hasContent ? "block" : "hidden"}`}
        />
      </div>
    </Card>
  );
}

const BURN_COST: Record<string, number> = {
  citizen: 1,
  quarter: 10,
  half: 25,
  apex: 50,
};

const VISUAL_STYLES = [
  { value: "space",     label: "Космос",    color: "#0D1B2A" },
  { value: "cyberpunk", label: "Киберпанк", color: "#0A0014" },
  { value: "abstract",  label: "Абстракт",  color: "#1A0A2E" },
  { value: "nature",    label: "Природа",   color: "#0F1B0F" },
  { value: "minimal",   label: "Минимал",   color: "#111111" },
] as const;

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── Main component ────────────────────────────────────────────────────────────

export function Tv() {
  const [date] = useState(todayDate);
  const qc = useQueryClient();

  // ── Grid / schedule queries
  const { data: slotsData, isLoading: slotsLoading } = useGetTvSlots(
    { date },
    { query: { queryKey: getGetTvSlotsQueryKey({ date }) } }
  );
  const { data: scheduleData, isLoading: scheduleLoading } = useGetTvSchedule(
    { date },
    { query: { queryKey: getGetTvScheduleQueryKey({ date }) } }
  );

  const slots = (slotsData?.slots ?? []) as SlotLike[];
  const schedule = scheduleData?.schedule ?? [];

  const { citizen, refreshCitizen } = useCitizen();

  // ── Terminal form state
  const [selectedSlot, setSelectedSlot] = useState<SlotLike | null>(null);
  const [seedText, setSeedText] = useState("");
  const [mode, setMode] = useState<"a" | "b">("a");
  const [visualStyle, setVisualStyle] = useState("space");
  const [paymentType, setPaymentType] = useState<"fiat" | "timeltr" | "crypto">("timeltr");
  const [booking, setBooking] = useState(false);
  const [bookingResult, setBookingResult] = useState<BookingResult | null>(null);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [bookedSlotId, setBookedSlotId] = useState<number | null>(null);
  const [rendering, setRendering] = useState(false);
  const [renderResult, setRenderResult] = useState<{ mediaUrl: string; catcastUrl: string | null; manifestoWords: number } | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);

  // Build 24×60 matrix
  const grid: (SlotLike | null)[][] = Array.from({ length: 24 }, (_, h) =>
    Array.from({ length: 60 }, (_, m) => slots[h * 60 + m] ?? null)
  );

  // ── Click slot in grid → populate terminal
  function handleSlotClick(slot: SlotLike) {
    if (slot.status !== "free") return;
    setSelectedSlot(slot);
    setBookingResult(null);
    setBookingError(null);
    setBookedSlotId(null);
    setRenderResult(null);
    setRenderError(null);
  }

  // ── Render capsule
  async function handleRender() {
    if (!bookedSlotId || !citizen) return;
    setRendering(true);
    setRenderError(null);
    try {
      const res = await fetch(`/api/tv/capsule/${bookedSlotId}/render`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ citizenId: citizen.id }),
      });
      const data = (await res.json()) as { ok?: boolean; status?: string; mediaUrl?: string; catcastUrl?: string | null; manifestoWords?: number; error?: string };
      if (!res.ok) {
        setRenderError(data.error ?? "Ошибка рендера");
        return;
      }
      setRenderResult({
        mediaUrl: data.mediaUrl ?? "",
        catcastUrl: data.catcastUrl ?? null,
        manifestoWords: data.manifestoWords ?? 0,
      });
      // Refresh grid + schedule so broadcast slot appears immediately
      await qc.invalidateQueries({ queryKey: getGetTvSlotsQueryKey({ date }) });
      await qc.invalidateQueries({ queryKey: getGetTvScheduleQueryKey({ date }) });
      void refreshCitizen();
    } catch {
      setRenderError("Ошибка соединения с сервером");
    } finally {
      setRendering(false);
    }
  }

  // ── Book
  async function handleBook() {
    if (!selectedSlot || !citizen) return;
    setBooking(true);
    setBookingError(null);
    setBookingResult(null);

    try {
      const origin = window.location.origin;

      // ── Pathway B: Crypto (Cryptomus USDT/USDC) ──────────────────────────
      if (paymentType === "crypto") {
        const res = await fetch("/api/tv/slots/book-crypto", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            slotId: selectedSlot.id,
            citizenId: citizen!.id,
            successUrl: `${origin}/tv?booked=1`,
          }),
        });
        const data = (await res.json()) as { paymentUrl?: string; amountUsd?: string; error?: string };
        if (!res.ok) {
          setBookingError(data.error ?? "Ошибка крипто-шлюза");
          return;
        }
        if (data.paymentUrl) {
          window.location.href = data.paymentUrl;
        }
        return;
      }

      // ── Pathway A: FIAT (Stripe) or TiMETR ───────────────────────────────
      const res = await fetch("/api/tv/slots/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slotId: selectedSlot.id,
          citizenId: citizen!.id,
          paymentType,
          successUrl: `${origin}/tv?booked=1`,
          cancelUrl: `${origin}/tv`,
        }),
      });

      const data = (await res.json()) as BookingResult & { error?: string };
      if (!res.ok) {
        setBookingError(data.error ?? "Ошибка бронирования");
        return;
      }

      if (paymentType === "fiat" && data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
        return;
      }

      // TiMETR path — slot booked, now create capsule immediately
      const capsuleRes = await fetch(`/api/tv/capsule/${selectedSlot.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          citizenId: citizen!.id,
          seedText: seedText.trim() || undefined,
          mode,
          renderPath: RENDER_PATH_BY_SLOT[selectedSlot.slotType] ?? "light",
          broadcastPolicy: "noise",
          contentState: seedText.trim() ? "filled" : "empty",
          hasSovereignLink: false,
          visualStyle,
        }),
      });

      const slotIdForRender = selectedSlot.id;

      if (capsuleRes.ok) {
        setBookedSlotId(slotIdForRender);
        setRenderResult(null);
        setRenderError(null);
        setBookingResult({ message: "Слот забронирован и капсула создана." });
      } else {
        setBookingResult({ message: "Слот забронирован. Создайте капсулу позже." });
      }

      // Invalidate grid + schedule
      await qc.invalidateQueries({ queryKey: getGetTvSlotsQueryKey({ date }) });
      await qc.invalidateQueries({ queryKey: getGetTvScheduleQueryKey({ date }) });
      setSelectedSlot(null);
      setSeedText("");
    } catch {
      setBookingError("Ошибка соединения с сервером");
    } finally {
      setBooking(false);
    }
  }

  const canBook = !!selectedSlot && !!citizen && !booking;

  return (
    <Layout>
      <div className="space-y-6">

        {/* Header */}
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

        {/* ── Chronos Live Player ──────────────────────────────────────────── */}
        <ChronosLivePlayer date={date} />

        {/* Legend */}
        <div className="flex flex-wrap gap-4 text-xs font-mono text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-secondary/80 border border-border inline-block" />
            Свободно
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-primary/30 border border-primary/50 inline-block" />
            Гражданин ·{" "}
            <Zap className="w-3 h-3 inline text-primary" /> 1 Д / 4.99 €
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-blue-500/30 border border-blue-400/50 inline-block" />
            Квартал · 10 Д / 9.99 €
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-purple-500/30 border border-purple-400/50 inline-block" />
            Половина · 25 Д / 24.99 €
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-rose-500/30 border border-rose-400/50 inline-block" />
            Апекс · 50 Д / 49.99 €
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-orange-500 border border-orange-400 inline-block" />
            В эфире
          </div>
          <span className="text-muted-foreground/60">← кликните свободный слот</span>
        </div>

        {/* Two-column layout: Grid + Terminal */}
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6 items-start">

          {/* ── 24×60 Chronos Grid ─────────────────────────────────────── */}
          <Card className="bg-card border-border overflow-hidden">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-mono text-muted-foreground uppercase tracking-widest">
                Сетка эфира (Chronos Grid)
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
                  <div className="p-3 space-y-[3px] min-w-[600px]">
                    {grid.map((row, hour) => (
                      <div key={hour} className="flex items-center gap-1">
                        <span className="text-[10px] font-mono text-muted-foreground w-7 shrink-0 text-right select-none">
                          {String(hour).padStart(2, "0")}
                        </span>
                        {/* flex-1 basis-0 distributes width evenly while respecting gap */}
                        <div className="flex gap-[2px] flex-1">
                          {row.map((slot, min) => {
                            if (!slot) return (
                              <div
                                key={min}
                                className="flex-1 basis-0 min-w-0 h-4 bg-white/5 border border-white/8 rounded-[2px]"
                              />
                            );
                            const isSel = selectedSlot?.id === slot.id;
                            const isFree = slot.status === "free";
                            const isBroadcast = slot.status === "broadcast";
                            const color = isSel
                              ? "bg-yellow-400 border-yellow-300 ring-1 ring-yellow-200"
                              : isBroadcast
                                ? "bg-orange-500 border-orange-400 opacity-100"
                                : isFree
                                  ? "bg-white/8 border-white/12 hover:bg-primary/30 hover:border-primary/50"
                                  : (SLOT_TYPE_COLORS[slot.slotType] ?? "bg-primary/30 border-primary/50");
                            const statusLabel = isFree
                              ? "Свободно"
                              : isBroadcast
                                ? `${slot.ownerName ?? "Занято"} · В ЭФИРЕ`
                                : (slot.ownerName ?? "Занято");
                            return (
                              <div
                                key={min}
                                title={`${slot.hourLabel}:${slot.minLabel} — ${TYPE_LABELS[slot.slotType] ?? slot.slotType} · ${statusLabel}`}
                                onClick={() => isFree && handleSlotClick(slot)}
                                className={[
                                  "flex-1 basis-0 min-w-0 h-4 border rounded-[2px] transition-colors",
                                  color,
                                  isFree ? "cursor-pointer" : "cursor-default opacity-70",
                                ].join(" ")}
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

          {/* ── Input Terminal ────────────────────────────────────────── */}
          <div className="space-y-4">
            <Card className="bg-card border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-mono text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                  <Terminal className="w-3.5 h-3.5" />
                  Input Terminal
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">

                {/* Selected slot indicator */}
                {selectedSlot ? (
                  <div className="flex items-center justify-between p-2.5 bg-yellow-400/10 border border-yellow-400/30 rounded-sm">
                    <div>
                      <span className="font-mono text-yellow-300 font-bold text-sm">
                        {selectedSlot.hourLabel}:{selectedSlot.minLabel}
                      </span>
                      <Badge
                        variant="outline"
                        className={`ml-2 text-[10px] font-mono ${SLOT_TYPE_BADGE[selectedSlot.slotType] ?? ""}`}
                      >
                        {TYPE_LABELS[selectedSlot.slotType] ?? selectedSlot.slotType}
                        {RENDER_PATH_BY_SLOT[selectedSlot.slotType] === "heavy" && (
                          <span className="ml-1 text-rose-400">⚡ HEAVY</span>
                        )}
                      </Badge>
                    </div>
                    <button
                      onClick={() => setSelectedSlot(null)}
                      className="text-muted-foreground hover:text-foreground text-xs font-mono"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <div className="p-2.5 border border-dashed border-border/60 rounded-sm text-center">
                    <p className="text-muted-foreground text-xs font-mono">
                      Кликните свободный слот на сетке
                    </p>
                  </div>
                )}

                {/* No citizen logged in */}
                {!citizen && (
                  <div className="p-2.5 bg-yellow-400/10 border border-yellow-400/30 rounded-sm">
                    <p className="text-xs text-yellow-300 font-mono">Войдите в аккаунт в боковом меню, чтобы забронировать слот</p>
                  </div>
                )}
                {citizen && (
                  <div className="flex items-center gap-2 p-2 bg-primary/10 border border-primary/20 rounded-sm">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                    <p className="text-xs text-primary font-mono truncate">{citizen.name} · {citizen.balanceMinutes} Д</p>
                  </div>
                )}

                {/* Seed of Thought */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
                    Зерно мысли
                  </Label>
                  <Textarea
                    placeholder="Идея, тезис или манифест для AI-обработки…"
                    value={seedText}
                    onChange={e => setSeedText(e.target.value)}
                    maxLength={500}
                    rows={3}
                    className="font-mono text-sm bg-background border-border resize-none"
                  />
                  <p className="text-[10px] text-muted-foreground text-right font-mono">
                    {seedText.length}/500
                  </p>
                </div>

                {/* Mode A / B toggle */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
                    Режим обработки
                  </Label>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      onClick={() => setMode("a")}
                      className={[
                        "flex items-center gap-1.5 p-2 rounded-sm border text-xs font-mono transition-colors",
                        mode === "a"
                          ? "border-primary/60 bg-primary/15 text-primary"
                          : "border-border text-muted-foreground hover:border-border/80",
                      ].join(" ")}
                    >
                      <Zap className="w-3 h-3 shrink-0" />
                      <span>
                        <span className="font-bold">A</span> AI-упаковка
                      </span>
                    </button>
                    <button
                      onClick={() => setMode("b")}
                      className={[
                        "flex items-center gap-1.5 p-2 rounded-sm border text-xs font-mono transition-colors",
                        mode === "b"
                          ? "border-emerald-400/60 bg-emerald-500/10 text-emerald-400"
                          : "border-border text-muted-foreground hover:border-border/80",
                      ].join(" ")}
                    >
                      <Shield className="w-3 h-3 shrink-0" />
                      <span>
                        <span className="font-bold">B</span> Дословно
                      </span>
                    </button>
                  </div>
                  <p className="text-[10px] text-muted-foreground font-mono">
                    {mode === "a"
                      ? "LLM расширит зерно до 60-секундного кинематического манифеста"
                      : "Текст передаётся без изменений, символ за символом"}
                  </p>
                </div>

                {/* Visual style */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
                    Визуальный стиль
                  </Label>
                  <div className="flex flex-wrap gap-1.5">
                    {VISUAL_STYLES.map(s => (
                      <button
                        key={s.value}
                        onClick={() => setVisualStyle(s.value)}
                        className={[
                          "flex items-center gap-1.5 px-2.5 py-1 rounded-sm border text-[11px] font-mono transition-colors",
                          visualStyle === s.value
                            ? "border-primary/70 bg-primary/15 text-primary"
                            : "border-border text-muted-foreground hover:border-border/80",
                        ].join(" ")}
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-[2px] shrink-0 border border-white/10 inline-block"
                          style={{ background: s.color }}
                        />
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Payment type */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
                    Оплата
                  </Label>
                  <div className="grid grid-cols-3 gap-1.5">
                    <button
                      onClick={() => setPaymentType("timeltr")}
                      className={[
                        "flex flex-col items-start gap-0.5 p-2 rounded-sm border text-xs font-mono transition-colors",
                        paymentType === "timeltr"
                          ? "border-primary/60 bg-primary/15 text-primary"
                          : "border-border text-muted-foreground hover:border-border/80",
                      ].join(" ")}
                    >
                      <div className="flex items-center gap-1">
                        <Wallet className="w-3 h-3 shrink-0" />
                        <span>TiMETR</span>
                      </div>
                      {selectedSlot && (
                        <span className="text-[10px] opacity-70">
                          {BURN_COST[selectedSlot.slotType] ?? "?"} Д
                        </span>
                      )}
                    </button>
                    <button
                      onClick={() => setPaymentType("fiat")}
                      className={[
                        "flex flex-col items-start gap-0.5 p-2 rounded-sm border text-xs font-mono transition-colors",
                        paymentType === "fiat"
                          ? "border-emerald-400/60 bg-emerald-500/10 text-emerald-400"
                          : "border-border text-muted-foreground hover:border-border/80",
                      ].join(" ")}
                    >
                      <div className="flex items-center gap-1">
                        <CreditCard className="w-3 h-3 shrink-0" />
                        <span>FIAT</span>
                      </div>
                      <span className="text-[10px] opacity-70">Stripe</span>
                    </button>
                    <button
                      onClick={() => setPaymentType("crypto")}
                      className={[
                        "flex flex-col items-start gap-0.5 p-2 rounded-sm border text-xs font-mono transition-colors",
                        paymentType === "crypto"
                          ? "border-orange-400/60 bg-orange-500/10 text-orange-400"
                          : "border-border text-muted-foreground hover:border-border/80",
                      ].join(" ")}
                    >
                      <div className="flex items-center gap-1">
                        <Bitcoin className="w-3 h-3 shrink-0" />
                        <span>Crypto</span>
                      </div>
                      <span className="text-[10px] opacity-70">USDT/USDC</span>
                    </button>
                  </div>
                </div>

                {/* Error */}
                {bookingError && (
                  <div className="p-2.5 bg-destructive/15 border border-destructive/40 rounded-sm">
                    <p className="text-xs text-destructive font-mono">{bookingError}</p>
                  </div>
                )}

                {/* Success + Render */}
                {bookingResult?.message && (
                  <div className="space-y-2">
                    <div className="p-2.5 bg-primary/10 border border-primary/30 rounded-sm">
                      <p className="text-xs text-primary font-mono">{bookingResult.message}</p>
                    </div>

                    {bookedSlotId && !renderResult && (
                      <>
                        {renderError && (
                          <div className="p-2 bg-destructive/10 border border-destructive/30 rounded-sm">
                            <p className="text-xs text-destructive font-mono">{renderError}</p>
                          </div>
                        )}
                        <Button
                          onClick={handleRender}
                          disabled={rendering}
                          variant="outline"
                          className="w-full font-mono text-sm gap-2 border-primary text-primary hover:bg-primary/10"
                        >
                          <Video className="w-4 h-4" />
                          {rendering ? "Рендер… ~30–60 сек" : "Запустить рендер"}
                        </Button>
                      </>
                    )}

                    {renderResult && (
                      <div className="p-3 bg-primary/10 border border-primary/40 rounded-sm space-y-2">
                        <div className="flex items-center gap-2 text-xs text-primary font-mono">
                          <Video className="w-3.5 h-3.5" />
                          <span>Готово{renderResult.manifestoWords > 0 ? ` · ${renderResult.manifestoWords} слов` : ""}</span>
                        </div>
                        {renderResult.mediaUrl && (
                          <a
                            href={renderResult.mediaUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 text-xs text-primary underline font-mono hover:opacity-80"
                          >
                            <ExternalLink className="w-3 h-3" />
                            Открыть MP4
                          </a>
                        )}
                        {renderResult.catcastUrl && (
                          <a
                            href={renderResult.catcastUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 text-xs text-blue-400 underline font-mono hover:opacity-80"
                          >
                            <ExternalLink className="w-3 h-3" />
                            Открыть на Catcast.tv
                          </a>
                        )}
                        <Button
                          onClick={handleRender}
                          disabled={rendering}
                          variant="ghost"
                          size="sm"
                          className="w-full font-mono text-xs text-muted-foreground gap-1.5 h-7"
                        >
                          <Video className="w-3 h-3" />
                          {rendering ? "Рендер…" : "Перерендерить"}
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {/* Book button */}
                <Button
                  onClick={handleBook}
                  disabled={!canBook}
                  className="w-full font-mono text-sm gap-2"
                >
                  {booking ? (
                    "Бронирование…"
                  ) : (
                    <>
                      Забронировать слот
                      <ChevronRight className="w-4 h-4" />
                    </>
                  )}
                </Button>

                {paymentType === "fiat" && selectedSlot && (
                  <p className="text-[10px] text-muted-foreground font-mono text-center">
                    Редирект на Stripe — карта, Apple Pay, Google Pay
                  </p>
                )}
                {paymentType === "crypto" && selectedSlot && (
                  <p className="text-[10px] text-muted-foreground font-mono text-center">
                    Редирект на Cryptomus — USDT/USDC (Polygon / Solana / Arbitrum)
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

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
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-14 bg-secondary" />)}
              </div>
            ) : schedule.length === 0 ? (
              <p className="text-muted-foreground text-sm py-4 text-center font-mono">
                На сегодня нет забронированных слотов
              </p>
            ) : (
              <div className="space-y-3">
                {schedule.map(entry => {
                  const mp4Url = entry.hasRenderedVideo && entry.mediaUrl
                    ? `/api/tv/media/${entry.mediaUrl.split("/").pop()}`
                    : null;
                  return (
                    <div
                      key={entry.slotId}
                      className="flex items-center justify-between px-3 py-2.5 border border-border/50 rounded-sm bg-secondary/40"
                    >
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="font-mono text-primary text-sm font-bold tabular-nums">
                          {entry.hourLabel}:{entry.minLabel}
                        </span>
                        <Badge
                          variant="outline"
                          className={`text-[10px] font-mono ${SLOT_TYPE_BADGE[entry.slotType] ?? ""}`}
                        >
                          {TYPE_LABELS[entry.slotType] ?? entry.slotType}
                        </Badge>
                        <span className="text-sm text-foreground/80">{entry.ownerName ?? "—"}</span>
                        {entry.isRetro && (
                          <span className="text-[10px] font-mono text-muted-foreground uppercase">РЕТРО</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {mp4Url && (
                          <span className="flex items-center gap-1 text-[10px] text-orange-400 font-mono uppercase font-bold">
                            <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse inline-block" />
                            В ЭФИРЕ
                          </span>
                        )}
                        {mp4Url && (
                          <a
                            href={mp4Url}
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
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
