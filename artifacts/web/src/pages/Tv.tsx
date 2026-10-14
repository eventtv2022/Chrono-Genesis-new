import { useState, useRef, useEffect, useCallback } from "react";
import { Layout } from "@/components/Layout";
import { useLanguage } from "@/context/LanguageContext";
import type { UIStrings } from "@/i18n/ui";
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
  ChevronLeft,
  Bitcoin,
  Radio,
  Calendar,
  CheckCircle,
  AlertCircle,
  Loader,
  Copy,
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
  ownerId?: number | null;
  isRetro: boolean;
  timeltrBurnCost: number;
  date?: string;
}

interface BookingResult {
  checkoutUrl?: string;
  slot?: { id: number; status: string };
  message?: string;
}

interface TvCapsule {
  id: number;
  slotId: number;
  status: string | null;
  renderProgress: string | null;
  mediaUrl: string | null;
  catcastUrl: string | null;
  seedText: string | null;
  broadcastPolicy: string;
  hasSovereignLink: boolean;
  visualStyle: string | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SLOT_TYPE_COLORS: Record<string, string> = {
  citizen: "bg-primary/30 border-primary/50",
  quarter: "bg-blue-500/30 border-blue-400/50",
  half: "bg-purple-500/30 border-purple-400/50",
  apex: "bg-rose-500/30 border-rose-400/50",
};

function getTypeLabel(t: UIStrings, slotType: string): string {
  const map: Record<string, string> = {
    citizen: t.tv_type_citizen,
    quarter: t.tv_type_quarter,
    half: t.tv_type_half,
    apex: t.tv_type_apex,
  };
  return map[slotType] ?? slotType;
}

function getRenderStageLabel(t: UIStrings, stage: string): string {
  const map: Record<string, string> = {
    generating_prompt:  t.tv_render_prompt,
    generating_tts:     t.tv_render_tts,
    generating_scenes:  t.tv_render_scenes,
    fetching_scenes:    t.tv_render_fetching,
    compositing:        t.tv_render_compositing,
    fetching_video:     t.tv_render_video,
    encoding:           t.tv_render_encoding,
    done:               t.tv_render_done,
  };
  return map[stage] ?? stage;
}

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

const BURN_COST: Record<string, number> = {
  citizen: 1,
  quarter: 5,
  half: 10,
  apex: 25,
};

const FIAT_PRICES: Record<string, string> = {
  citizen: "1.99€",
  quarter: "4.99€",
  half: "9.99€",
  apex: "24.99€",
};

// USDT prices for TV slots (≈ EUR, flat for simplicity)
const TRC20_SLOT_PRICES: Record<string, number> = {
  citizen: 2.09,  // 1.99 + 5%
  quarter: 5.24,
  half:    10.49,
  apex:    26.24,
};
const TV_TRC20_WALLET = "TJZZWWKU1L2v4EetVmMPKKfK396sZn82XC";

const VISUAL_STYLE_DEFS = [
  { value: "space",     labelKey: "tv_style_space" as const,     descKey: "tv_style_space_desc" as const,     color: "#0D1B2A" },
  { value: "cyberpunk", labelKey: "tv_style_cyberpunk" as const, descKey: "tv_style_cyberpunk_desc" as const, color: "#0A0014" },
  { value: "abstract",  labelKey: "tv_style_abstract" as const,  descKey: "tv_style_abstract_desc" as const,  color: "#1A0A2E" },
  { value: "nature",    labelKey: "tv_style_nature" as const,    descKey: "tv_style_nature_desc" as const,    color: "#0F1B0F" },
  { value: "minimal",   labelKey: "tv_style_minimal" as const,   descKey: "tv_style_minimal_desc" as const,   color: "#111111" },
] as const;

const RENDER_STAGES = [
  "generating_prompt",
  "generating_tts",
  "generating_scenes",
  "fetching_scenes",
  "compositing",
  "fetching_video",
  "encoding",
  "done",
] as const;

const PROGRESS_PCT: Record<string, number> = {
  generating_prompt: 10,
  generating_tts: 30,
  generating_scenes: 45,
  fetching_scenes: 60,
  compositing: 75,
  fetching_video: 68,
  encoding: 88,
  done: 100,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function stepDate(base: string, delta: number): string {
  const d = new Date(base);
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
}

// ── Style Preview Image ───────────────────────────────────────────────────────

function StylePreview({ styleValue, seed, color }: { styleValue: string; seed: string; color: string }) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  const uri = `/api/tv/styles/preview?style=${styleValue}&seed=${encodeURIComponent(seed.slice(0, 100))}`;

  return (
    <div
      className="w-full h-8 rounded-sm overflow-hidden relative shrink-0"
      style={{ background: color }}
    >
      {!errored && seed && (
        <img
          key={uri}
          src={uri}
          alt={styleValue}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
          onLoad={() => setLoaded(true)}
          onError={() => setErrored(true)}
        />
      )}
    </div>
  );
}

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
  const { t } = useLanguage();
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
    } catch { return null; }
  }, [date]);

  const applySlot = useCallback((info: LiveSlotInfo | null) => {
    setSlot(info);
    const v = videoRef.current;
    if (!v) return;
    if (info?.videoUrl) {
      if (v.src !== info.videoUrl) { v.src = info.videoUrl; v.load(); }
      void v.play().catch(() => {});
    } else {
      v.pause(); v.removeAttribute("src"); v.load();
    }
  }, []);

  useEffect(() => {
    const now = new Date();
    const m = now.getUTCHours() * 60 + now.getUTCMinutes();
    setCurrentMinute(m);
    void fetchSlot(m).then(applySlot);
  }, [fetchSlot, applySlot]);

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      const h = now.getUTCHours(), m = now.getUTCMinutes(), s = now.getUTCSeconds();
      const minute = h * 60 + m;
      setUtcClock(`${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")} UTC`);
      if (s >= 55) {
        const next = (minute + 1) % 1440;
        if (!prefetch.current || prefetch.current.minute !== next) {
          void fetchSlot(next).then(data => { prefetch.current = { minute: next, data }; });
        }
      }
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
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/50 bg-black/30">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="flex items-center gap-1.5 text-orange-400 font-mono text-xs font-bold uppercase tracking-widest">
            <span className="w-2 h-2 rounded-full bg-orange-400 animate-pulse shrink-0" />
            {t.tv_live}
          </span>
          <span className="font-mono text-sm font-bold text-primary tabular-nums">{hh}:{mm}</span>
          {slot?.hasContent ? (
            <>
              <span className="text-border/60 select-none">|</span>
              {slot.slotType && (
                <Badge variant="outline" className={`text-[10px] font-mono ${SLOT_TYPE_BADGE[slot.slotType] ?? ""}`}>
                  {getTypeLabel(t, slot.slotType)}
                </Badge>
              )}
              <span className="text-sm text-foreground/80 truncate max-w-[200px]">{slot.ownerName}</span>
            </>
          ) : (
            <span className="text-xs text-muted-foreground font-mono">{t.tv_slot_empty}</span>
          )}
        </div>
        <span className="text-[10px] font-mono text-muted-foreground/60 tabular-nums shrink-0">{utcClock}</span>
      </div>
      <div className="relative bg-black" style={{ aspectRatio: "16/9" }}>
        {!slot?.hasContent && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gradient-to-br from-[#0D1B2A] via-[#05000F] to-[#0D1B2A]">
            <Radio className="w-10 h-10 text-primary/30" />
            <div className="text-center">
              <div className="font-mono text-xl font-bold text-primary/40 tracking-[0.3em] uppercase">TN·TV</div>
              <div className="font-mono text-[11px] text-muted-foreground/50 uppercase tracking-widest mt-1 animate-pulse">
                {t.tv_slot_empty} · {hh}:{mm}
              </div>
            </div>
          </div>
        )}
        <video
          ref={videoRef}
          autoPlay playsInline controls loop
          className={`w-full h-full ${slot?.hasContent ? "block" : "hidden"}`}
        />
      </div>
    </Card>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function Tv() {
  const [date, setDate] = useState(todayDate);
  const qc = useQueryClient();

  useEffect(() => { document.title = "TimeNation-TV | TimeNation"; }, []);

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

  const { citizen, authHeaders, refreshCitizen } = useCitizen();
  const { t } = useLanguage();

  // ── Terminal form state
  const [selectedSlot, setSelectedSlot] = useState<SlotLike | null>(null);
  const [seedText, setSeedText] = useState("");
  const [debouncedSeed, setDebouncedSeed] = useState("");
  const [mode, setMode] = useState<"a" | "b">("a");
  const [visualStyle, setVisualStyle] = useState("space");
  const [paymentType, setPaymentType] = useState<"fiat" | "timeltr" | "crypto" | "trc20">("timeltr");
  const [trc20TxId,   setTrc20TxId]   = useState("");
  const [trc20ReqId,  setTrc20ReqId]  = useState<number | null>(null);
  const [trc20Amount, setTrc20Amount] = useState<number | null>(null);
  const [trc20Copied, setTrc20Copied] = useState(false);
  const [trc20Submitted, setTrc20Submitted] = useState(false);
  const [trc20Submitting, setTrc20Submitting] = useState(false);
  const [booking, setBooking] = useState(false);
  const [bookingResult, setBookingResult] = useState<BookingResult | null>(null);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [bookedSlotId, setBookedSlotId] = useState<number | null>(null);

  // ── Render progress state (mirrors mobile)
  const [rendering, setRendering] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [renderResult, setRenderResult] = useState<{ mediaUrl: string; catcastUrl: string | null; manifestoWords: number } | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [renderProgress, setRenderProgress] = useState<string | null>(null);
  const [renderJobId, setRenderJobId] = useState<string | null>(null);
  const [renderStartedAt, setRenderStartedAt] = useState<number | null>(null);
  const [renderTimeoutMs, setRenderTimeoutMs] = useState<number | null>(null);
  const [countdownSec, setCountdownSec] = useState<number | null>(null);
  const [renderTimedOut, setRenderTimedOut] = useState(false);
  const prevCapsuleStatus = useRef<string | null>(null);

  // ── Air mutation (retro slots)
  const [airing, setAiring] = useState(false);

  // Debounce seedText for preview
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSeed(seedText), 600);
    return () => clearTimeout(timer);
  }, [seedText]);

  // Build 24×60 matrix
  const grid: (SlotLike | null)[][] = Array.from({ length: 24 }, (_, h) =>
    Array.from({ length: 60 }, (_, m) => slots[h * 60 + m] ?? null)
  );

  // My slots (I own)
  const mySlots = slots.filter(s => citizen && s.ownerId === citizen.id);

  // Current UTC minute for "white" indicator
  const [curMin, setCurMin] = useState(() => {
    const n = new Date();
    return n.getUTCHours() * 60 + n.getUTCMinutes();
  });
  const isToday = date === todayDate();
  useEffect(() => {
    const t = setInterval(() => {
      const n = new Date();
      const m = n.getUTCHours() * 60 + n.getUTCMinutes();
      setCurMin(m);
    }, 4000);
    return () => clearInterval(t);
  }, []);

  // ── Capsule polling effect
  useEffect(() => {
    if (!isPolling || !bookedSlotId) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/tv/capsule/${bookedSlotId}`);
        if (res.status === 404) return;
        if (!res.ok) return;
        const data = (await res.json()) as TvCapsule;
        const prev = prevCapsuleStatus.current;
        const current = data.status;
        prevCapsuleStatus.current = current;
        setRenderProgress(data.renderProgress);

        if (isPolling && current && current !== "pending_render" && prev === "pending_render") {
          setIsPolling(false);
          setRendering(false);
          setRenderStartedAt(null);
          if (data.mediaUrl) {
            setRenderResult({ mediaUrl: data.mediaUrl, catcastUrl: data.catcastUrl ?? null, manifestoWords: 0 });
          } else if (current === "failed") {
            setRenderError(t.tv_err_render);
          }
          await qc.invalidateQueries({ queryKey: getGetTvSlotsQueryKey({ date }) });
          await qc.invalidateQueries({ queryKey: getGetTvScheduleQueryKey({ date }) });
          void refreshCitizen();
        }
      } catch { /* offline */ }
    }, 3000);
    return () => clearInterval(interval);
  }, [isPolling, bookedSlotId, date, qc, refreshCitizen]);

  // ── Job status polling
  useEffect(() => {
    if (!isPolling || !renderJobId) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/tv/render/jobs/${renderJobId}`);
        if (!res.ok) return;
        const data = (await res.json()) as { status: string };
        if (data.status === "done" || data.status === "failed") {
          setRenderJobId(null);
        }
      } catch { /* offline */ }
    }, 3000);
    return () => clearInterval(interval);
  }, [isPolling, renderJobId]);

  // ── Countdown ticker
  useEffect(() => {
    if (!renderStartedAt || !renderTimeoutMs) return;
    const tick = () => {
      const elapsed = Date.now() - renderStartedAt;
      const remaining = Math.ceil((renderTimeoutMs - elapsed) / 1000);
      if (remaining <= 0) { setCountdownSec(0); setRenderTimedOut(true); }
      else setCountdownSec(remaining);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [renderStartedAt, renderTimeoutMs]);

  // ── Click slot in grid → populate terminal
  function handleSlotClick(slot: SlotLike) {
    if (slot.status !== "free") return;
    setSelectedSlot(slot);
    setBookingResult(null);
    setBookingError(null);
    setBookedSlotId(null);
    setRenderResult(null);
    setRenderError(null);
    setRenderProgress(null);
    setIsPolling(false);
    setRenderTimedOut(false);
    setCountdownSec(null);
  }

  // ── Render capsule
  async function handleRender() {
    if (!bookedSlotId || !citizen) return;
    setRendering(true);
    setRenderError(null);
    setRenderProgress("generating_prompt");
    setRenderTimedOut(false);
    setCountdownSec(null);
    prevCapsuleStatus.current = "pending_render";

    try {
      const res = await fetch(`/api/tv/capsule/${bookedSlotId}/render`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ citizenId: citizen.id }),
      });
      const data = (await res.json()) as {
        ok?: boolean; status?: string; mediaUrl?: string; catcastUrl?: string | null;
        manifestoWords?: number; error?: string; jobId?: string; timeoutMs?: number;
      };
      if (!res.ok) {
        setRenderError(data.error ?? t.tv_err_render_generic);
        setRendering(false);
        return;
      }

      // If render completed synchronously
      if (data.status === "done" && data.mediaUrl) {
        setRenderResult({ mediaUrl: data.mediaUrl, catcastUrl: data.catcastUrl ?? null, manifestoWords: data.manifestoWords ?? 0 });
        setRendering(false);
        await qc.invalidateQueries({ queryKey: getGetTvSlotsQueryKey({ date }) });
        await qc.invalidateQueries({ queryKey: getGetTvScheduleQueryKey({ date }) });
        void refreshCitizen();
        return;
      }

      // Async render — start polling
      if (data.jobId) setRenderJobId(data.jobId);
      if (data.timeoutMs) setRenderTimeoutMs(data.timeoutMs);
      setRenderStartedAt(Date.now());
      setIsPolling(true);
    } catch {
      setRenderError(t.tv_err_connection);
      setRendering(false);
    }
  }

  // ── Air (manual broadcast) for retro/booked slots
  async function handleAir(slotId: number) {
    if (!citizen) return;
    setAiring(true);
    try {
      await fetch(`/api/tv/slots/${slotId}/air`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ citizenId: citizen.id }),
      });
      await qc.invalidateQueries({ queryKey: getGetTvSlotsQueryKey({ date }) });
      await qc.invalidateQueries({ queryKey: getGetTvScheduleQueryKey({ date }) });
    } catch { /* ignore */ } finally {
      setAiring(false);
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

      if (paymentType === "crypto") {
        const res = await fetch("/api/tv/slots/book-crypto", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders },
          body: JSON.stringify({ slotId: selectedSlot.id, citizenId: citizen.id, successUrl: `${origin}/tv?booked=1` }),
        });
        const data = (await res.json()) as { paymentUrl?: string; error?: string };
        if (!res.ok) { setBookingError(data.error ?? t.tv_err_crypto); return; }
        if (data.paymentUrl) window.location.href = data.paymentUrl;
        return;
      }

      // TRC20: submit payment proof — admin verifies and activates slot
      if (paymentType === "trc20") {
        if (!trc20TxId.trim()) { setBookingError("Вставьте TxID транзакции USDT TRC20"); return; }
        setTrc20Submitting(true);
        const slotUsdtPrice = TRC20_SLOT_PRICES[selectedSlot.slotType] ?? 2.09;

        // First request a payment record
        let reqId: number | null = trc20ReqId;
        if (!reqId) {
          try {
            const r = await fetch("/api/payments/trc20/request", {
              method: "POST",
              headers: { "Content-Type": "application/json", ...authHeaders },
              body: JSON.stringify({ citizenId: citizen.id, darmins: Math.round(slotUsdtPrice * 100), purpose: "tv_slot", referenceId: selectedSlot.id }),
            });
            const d = await r.json() as { requestId?: number };
            reqId = d.requestId ?? null;
          } catch { /* non-fatal */ }
        }

        const confirmRes = await fetch("/api/payments/trc20/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders },
          body: JSON.stringify({
            requestId:  reqId,
            citizenId:  citizen.id,
            txId:       trc20TxId.trim(),
            amountUsdt: slotUsdtPrice,
            darmins:    Math.round(slotUsdtPrice * 100),
            purpose:    "tv_slot",
          }),
        });
        const confirmData = await confirmRes.json() as { success?: boolean; error?: string };
        if (!confirmRes.ok) { setBookingError(confirmData.error ?? "Ошибка подтверждения платежа"); setTrc20Submitting(false); return; }
        setTrc20Submitted(true);
        setBookingResult({ message: "✅ Оплата принята на проверку! Слот будет активирован после подтверждения администратором." });
        setTrc20Submitting(false);
        return;
      }

      const res = await fetch("/api/tv/slots/book", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({
          slotId: selectedSlot.id, paymentType,
          successUrl: `${origin}/tv?booked=1`, cancelUrl: `${origin}/tv`,
        }),
      });
      const data = (await res.json()) as BookingResult & { error?: string };
      if (!res.ok) { setBookingError(data.error ?? t.tv_err_booking); return; }
      if (paymentType === "fiat" && data.checkoutUrl) { window.location.href = data.checkoutUrl; return; }

      // TiMETR — create capsule immediately
      const capsuleRes = await fetch(`/api/tv/capsule/${selectedSlot.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          citizenId: citizen.id,
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
        setBookingResult({ message: t.tv_booked_capsule });
      } else {
        setBookingResult({ message: t.tv_booked_later });
      }

      await qc.invalidateQueries({ queryKey: getGetTvSlotsQueryKey({ date }) });
      await qc.invalidateQueries({ queryKey: getGetTvScheduleQueryKey({ date }) });
      setSelectedSlot(null);
      setSeedText("");
    } catch {
      setBookingError(t.tv_err_connection);
    } finally {
      setBooking(false);
    }
  }

  const canBook = !!selectedSlot && !!citizen && !booking;
  const progressPct = renderProgress ? (PROGRESS_PCT[renderProgress] ?? 5) : 5;

  return (
    <Layout>
      <div className="space-y-6">

        {/* Header with date navigation */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">TimeNation-TV</h1>
            <p className="text-muted-foreground font-mono text-sm mt-1">
              {t.tv_subtitle}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            {/* Date navigation */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setDate(d => stepDate(d, -1))}
                className="p-1.5 rounded-md border border-border hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setDate(todayDate())}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border bg-card hover:bg-secondary font-mono text-sm tabular-nums transition-colors"
              >
                <Calendar className="w-3.5 h-3.5 text-primary" />
                <span className={date === todayDate() ? "text-primary font-semibold" : "text-foreground"}>{date}</span>
              </button>
              <button
                onClick={() => setDate(d => stepDate(d, 1))}
                className="p-1.5 rounded-md border border-border hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            {scheduleData && (
              <div className="flex gap-3 text-xs font-mono">
                <span className="text-muted-foreground">
                  {t.tv_free_label} <span className="text-foreground">{scheduleData.freeSlots}</span>
                </span>
                <span className="text-muted-foreground">
                  {t.tv_taken_label} <span className="text-primary">{scheduleData.bookedSlots}</span>
                </span>
              </div>
            )}
          </div>
        </div>

        {/* ── Chronos Live Player ── */}
        <ChronosLivePlayer date={date} />

        {/* Legend — цвета состояний */}
        <div className="flex flex-wrap gap-4 text-xs font-mono text-muted-foreground">
          <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-white/10 border border-white/15 inline-block" />{t.tv_free_slot}</div>
          <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-white border border-white inline-block" />{t.tv_legend_current}</div>
          <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-green-500 border border-green-400 inline-block" />{t.tv_legend_selected}</div>
          <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-yellow-400 border border-yellow-300 inline-block" />{t.tv_booked_slot}</div>
          <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-orange-500 border border-orange-400 inline-block" />{t.tv_legend_on_air}</div>
          <span className="text-muted-foreground/60 border-l border-border/40 pl-4">
            {t.tv_type_quarter} (:15/:45) 5 Д / 4.99 € · {t.tv_type_half} (:30) 10 Д / 9.99 € · {t.tv_type_apex} (:00) 25 Д / 24.99 €
          </span>
        </div>

        {/* Two-column layout: Grid + Terminal */}
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6 items-start">

          {/* ── 24×60 Chronos Grid ── */}
          <Card className="bg-card border-border overflow-hidden">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-mono text-muted-foreground uppercase tracking-widest">
                {t.tv_grid_title}
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
                        <div className="flex gap-[2px] flex-1">
                          {row.map((slot, min) => {
                            if (!slot) return (
                              <div key={min} className="flex-1 basis-0 min-w-0 h-4 bg-white/5 border border-white/8 rounded-[2px]" />
                            );
                            const idx = hour * 60 + min;
                            const isCurMin = isToday && idx === curMin;
                            const isSel = selectedSlot?.id === slot.id;
                            const isFree = slot.status === "free";
                            const isBroadcast = slot.status === "broadcast";
                            const isMine = !!(citizen && slot.ownerId === citizen.id);
                            // Color priority: current > selected > broadcast > mine > others-booked > free
                            const color = isCurMin
                              ? "bg-white border-white shadow-[0_0_4px_rgba(255,255,255,0.6)]"
                              : isSel
                                ? "bg-green-500 border-green-400 ring-1 ring-green-300"
                                : isBroadcast
                                  ? slot.isRetro ? "bg-orange-500/60 border-orange-400/60" : "bg-orange-500 border-orange-400"
                                  : isMine && !isFree
                                    ? "bg-yellow-400 border-yellow-300"
                                    : isFree
                                      ? "bg-white/6 border-white/10 hover:bg-green-500/20 hover:border-green-500/40"
                                      : "bg-white/12 border-white/15";
                            const statusLabel = isCurMin
                              ? t.tv_legend_current
                              : isFree
                                ? t.tv_free_slot
                                : isBroadcast
                                  ? `${slot.ownerName ?? t.tv_booked_slot} · ${t.tv_live}`
                                  : (slot.ownerName ?? t.tv_booked_slot);
                            return (
                              <div
                                key={min}
                                title={`${slot.hourLabel}:${slot.minLabel} — ${getTypeLabel(t, slot.slotType)} · ${statusLabel}`}
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

          {/* ── Input Terminal ── */}
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
                      <Badge variant="outline" className={`ml-2 text-[10px] font-mono ${SLOT_TYPE_BADGE[selectedSlot.slotType] ?? ""}`}>
                        {getTypeLabel(t, selectedSlot.slotType)}
                        {RENDER_PATH_BY_SLOT[selectedSlot.slotType] === "heavy" && (
                          <span className="ml-1 text-rose-400">⚡ HEAVY</span>
                        )}
                      </Badge>
                    </div>
                    <button onClick={() => setSelectedSlot(null)} className="text-muted-foreground hover:text-foreground text-xs font-mono">✕</button>
                  </div>
                ) : (
                  <div className="p-2.5 border border-dashed border-border/60 rounded-sm text-center">
                    <p className="text-muted-foreground text-xs font-mono">{t.tv_click_free}</p>
                  </div>
                )}

                {/* Citizen status */}
                {!citizen && (
                  <div className="p-2.5 bg-yellow-400/10 border border-yellow-400/30 rounded-sm">
                    <p className="text-xs text-yellow-300 font-mono">{t.tv_login_to_book}</p>
                  </div>
                )}
                {citizen && (
                  <div className="flex items-center gap-2 p-2 bg-primary/10 border border-primary/20 rounded-sm">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                    <p className="text-xs text-primary font-mono truncate">{citizen.name} · {(citizen.balanceMinutes as number).toFixed(2)} Д</p>
                  </div>
                )}

                {/* Seed of Thought */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">{t.tv_seed_label}</Label>
                  <Textarea
                    placeholder={t.tv_seed_ph}
                    value={seedText}
                    onChange={e => setSeedText(e.target.value)}
                    maxLength={500}
                    rows={3}
                    className="font-mono text-sm bg-background border-border resize-none"
                  />
                  <p className="text-[10px] text-muted-foreground text-right font-mono">{seedText.length}/500</p>
                </div>

                {/* Mode A / B */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">{t.tv_mode_label}</Label>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      onClick={() => setMode("a")}
                      className={`flex items-center gap-1.5 p-2 rounded-sm border text-xs font-mono transition-colors ${mode === "a" ? "border-primary/60 bg-primary/15 text-primary" : "border-border text-muted-foreground hover:border-border/80"}`}
                    >
                      <Zap className="w-3 h-3 shrink-0" />
                      <span><span className="font-bold">A</span> {t.tv_mode_a}</span>
                    </button>
                    <button
                      onClick={() => setMode("b")}
                      className={`flex items-center gap-1.5 p-2 rounded-sm border text-xs font-mono transition-colors ${mode === "b" ? "border-emerald-400/60 bg-emerald-500/10 text-emerald-400" : "border-border text-muted-foreground hover:border-border/80"}`}
                    >
                      <Shield className="w-3 h-3 shrink-0" />
                      <span><span className="font-bold">B</span> {t.tv_mode_b}</span>
                    </button>
                  </div>
                  <p className="text-[10px] text-muted-foreground font-mono">
                    {mode === "a" ? t.tv_mode_a_desc : t.tv_mode_b_desc}
                  </p>
                </div>

                {/* Visual style with AI previews */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">{t.tv_style_label ?? "Style"}</Label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                    {VISUAL_STYLE_DEFS.map(s => (
                      <button
                        key={s.value}
                        onClick={() => setVisualStyle(s.value)}
                        className={`flex flex-col gap-1.5 p-2 rounded-sm border text-left transition-colors ${visualStyle === s.value ? "border-primary/70 bg-primary/15" : "border-border hover:border-border/80"}`}
                      >
                        <StylePreview styleValue={s.value} seed={debouncedSeed} color={s.color} />
                        <span className={`text-[11px] font-mono font-semibold leading-tight ${visualStyle === s.value ? "text-primary" : "text-muted-foreground"}`}>{t[s.labelKey]}</span>
                        <span className="text-[9px] text-muted-foreground/60 leading-tight hidden sm:block">{t[s.descKey]}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Payment type */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">{t.tv_payment_label}</Label>
                  <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                    <button
                      onClick={() => setPaymentType("timeltr")}
                      className={`flex flex-col items-start gap-0.5 p-2 rounded-sm border text-xs font-mono transition-colors ${paymentType === "timeltr" ? "border-primary/60 bg-primary/15 text-primary" : "border-border text-muted-foreground hover:border-border/80"}`}
                    >
                      <div className="flex items-center gap-1"><Wallet className="w-3 h-3 shrink-0" /><span>TiMETR</span></div>
                      {selectedSlot && <span className="text-[10px] opacity-70">{BURN_COST[selectedSlot.slotType] ?? "?"} Д</span>}
                    </button>
                    <button
                      onClick={() => setPaymentType("fiat")}
                      className={`flex flex-col items-start gap-0.5 p-2 rounded-sm border text-xs font-mono transition-colors ${paymentType === "fiat" ? "border-emerald-400/60 bg-emerald-500/10 text-emerald-400" : "border-border text-muted-foreground hover:border-border/80"}`}
                    >
                      <div className="flex items-center gap-1"><CreditCard className="w-3 h-3 shrink-0" /><span>FIAT</span></div>
                      {selectedSlot && <span className="text-[10px] opacity-70">{FIAT_PRICES[selectedSlot.slotType] ?? "?"}</span>}
                    </button>
                    <button
                      onClick={() => setPaymentType("crypto")}
                      className={`flex flex-col items-start gap-0.5 p-2 rounded-sm border text-xs font-mono transition-colors ${paymentType === "crypto" ? "border-orange-400/60 bg-orange-500/10 text-orange-400" : "border-border text-muted-foreground hover:border-border/80"}`}
                    >
                      <div className="flex items-center gap-1"><Bitcoin className="w-3 h-3 shrink-0" /><span>Crypto</span></div>
                      <span className="text-[10px] opacity-70">USDT/USDC</span>
                    </button>
                    <button
                      onClick={() => {
                        setPaymentType("trc20");
                        setTrc20TxId(""); setTrc20Submitted(false); setTrc20ReqId(null); setTrc20Amount(null);
                      }}
                      className={`flex flex-col items-start gap-0.5 p-2 rounded-sm border text-xs font-mono transition-colors ${paymentType === "trc20" ? "border-sky-400/60 bg-sky-500/10 text-sky-400" : "border-border text-muted-foreground hover:border-border/80"}`}
                    >
                      <div className="flex items-center gap-1"><Bitcoin className="w-3 h-3 shrink-0" /><span>TRC20</span></div>
                      {selectedSlot && <span className="text-[10px] opacity-70">{TRC20_SLOT_PRICES[selectedSlot.slotType]?.toFixed(2) ?? "?"} USDT</span>}
                    </button>
                  </div>
                </div>

                {/* TRC20 payment panel */}
                {paymentType === "trc20" && selectedSlot && !trc20Submitted && (
                  <div className="space-y-2.5 p-3 rounded-sm border border-sky-700/40 bg-sky-950/30">
                    <div className="text-xs font-mono text-sky-400 font-semibold flex items-center gap-1.5">
                      <Bitcoin className="w-3.5 h-3.5" /> Оплата USDT TRC20 (Tron Network)
                    </div>

                    {/* Amount */}
                    <div className="flex items-center justify-between p-2 bg-sky-900/20 rounded-sm border border-sky-800/40">
                      <span className="text-xs font-mono text-muted-foreground">Сумма к переводу</span>
                      <span className="text-sm font-bold font-mono text-sky-400">
                        {TRC20_SLOT_PRICES[selectedSlot.slotType]?.toFixed(2) ?? "?"} USDT
                      </span>
                    </div>

                    {/* Address + copy */}
                    <div className="space-y-1">
                      <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Адрес казначейства (TRC20)</div>
                      <div className="flex items-center gap-1.5 p-2 bg-secondary/50 rounded-sm border border-border">
                        <code className="flex-1 text-[10px] text-sky-400 font-mono break-all">{TV_TRC20_WALLET}</code>
                        <button
                          onClick={() => {
                            void navigator.clipboard.writeText(TV_TRC20_WALLET).then(() => {
                              setTrc20Copied(true);
                              setTimeout(() => setTrc20Copied(false), 2500);
                            });
                          }}
                          className="shrink-0 flex items-center gap-1 px-1.5 py-1 rounded border border-sky-700/40 bg-sky-900/20 text-sky-400 text-[10px] hover:bg-sky-900/40 transition-colors"
                        >
                          {trc20Copied ? <CheckCircle className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                        </button>
                      </div>
                    </div>

                    {/* QR code */}
                    <div className="flex justify-center">
                      <div className="p-2 bg-white rounded-sm border border-border">
                        <img
                          src={`https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(TV_TRC20_WALLET)}&margin=8`}
                          alt="TRC20 QR"
                          width={140}
                          height={140}
                        />
                      </div>
                    </div>

                    {/* TxID input */}
                    <div className="space-y-1">
                      <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">TxID транзакции (после перевода)</div>
                      <input
                        type="text"
                        value={trc20TxId}
                        onChange={e => setTrc20TxId(e.target.value)}
                        placeholder="Вставьте хэш транзакции из кошелька..."
                        className="w-full px-2.5 py-1.5 text-xs font-mono rounded-sm border border-border bg-background text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-sky-500/50"
                      />
                    </div>

                    <p className="text-[9px] text-muted-foreground font-mono leading-relaxed">
                      Переведите точную сумму USDT (TRC20/Tron) на адрес казначейства, затем вставьте TxID и нажмите «Забронировать». Слот активируется после подтверждения администратором.
                    </p>
                  </div>
                )}

                {/* TRC20 success */}
                {paymentType === "trc20" && trc20Submitted && (
                  <div className="flex items-center gap-2 p-2.5 bg-emerald-900/20 border border-emerald-700/40 rounded-sm text-xs font-mono text-emerald-400">
                    <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                    Оплата принята на проверку · слот будет активирован после подтверждения
                  </div>
                )}

                {/* Error */}
                {bookingError && (
                  <div className="p-2.5 bg-destructive/15 border border-destructive/40 rounded-sm">
                    <p className="text-xs text-destructive font-mono">{bookingError}</p>
                  </div>
                )}

                {/* Success + Render progress */}
                {bookingResult?.message && (
                  <div className="space-y-3">
                    <div className="p-2.5 bg-primary/10 border border-primary/30 rounded-sm">
                      <p className="text-xs text-primary font-mono">{bookingResult.message}</p>
                    </div>

                    {bookedSlotId && !renderResult && (
                      <>
                        {/* Render progress bar */}
                        {(rendering || isPolling) && renderProgress && (
                          <div className="space-y-2 p-3 border border-border/60 rounded-sm bg-secondary/20">
                            <div className="flex items-center gap-2">
                              <Loader className="w-3.5 h-3.5 text-primary animate-spin shrink-0" />
                              <span className="text-xs font-mono text-primary font-semibold flex-1">
                                {getRenderStageLabel(t, renderProgress)}
                              </span>
                              {countdownSec !== null && !renderTimedOut && (
                                <span className="text-[10px] font-mono text-muted-foreground tabular-nums">
                                  {Math.floor(countdownSec / 60)}:{String(countdownSec % 60).padStart(2, "0")}
                                </span>
                              )}
                            </div>

                            {/* Progress bar */}
                            <div className="h-1.5 bg-border rounded-full overflow-hidden">
                              <div
                                className="h-full bg-primary rounded-full transition-all duration-700"
                                style={{ width: `${progressPct}%` }}
                              />
                            </div>

                            {/* Stages list */}
                            <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-1">
                              {RENDER_STAGES.map(stage => {
                                const stageIdx = RENDER_STAGES.indexOf(stage as typeof RENDER_STAGES[number]);
                                const curIdx = renderProgress ? RENDER_STAGES.indexOf(renderProgress as typeof RENDER_STAGES[number]) : -1;
                                const isDone = stageIdx < curIdx || renderProgress === "done";
                                const isCur = stageIdx === curIdx && renderProgress !== "done";
                                return (
                                  <div key={stage} className="flex items-center gap-1.5">
                                    <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${isDone ? "bg-primary" : isCur ? "bg-primary/50 animate-pulse" : "bg-border"}`} />
                                    <span className={`text-[9px] font-mono ${isDone || isCur ? "text-foreground/80" : "text-muted-foreground/50"}`}>
                                      {getRenderStageLabel(t, stage)}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>

                            {renderTimedOut && (
                              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-mono">
                                <AlertCircle className="w-3 h-3" />
                                {t.tv_render_bg}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Render button (before polling starts) */}
                        {!rendering && !isPolling && (
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
                              {t.tv_start_render}
                            </Button>
                          </>
                        )}
                      </>
                    )}

                    {/* Render result */}
                    {renderResult && (
                      <div className="p-3 bg-primary/10 border border-primary/40 rounded-sm space-y-2">
                        <div className="flex items-center gap-2 text-xs text-primary font-mono">
                          <CheckCircle className="w-3.5 h-3.5" />
                          <span>{t.tv_render_done}{renderResult.manifestoWords > 0 ? ` · ${renderResult.manifestoWords}` : ""}</span>
                        </div>
                        {renderResult.mediaUrl && (
                          <a href={renderResult.mediaUrl} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1.5 text-xs text-primary underline font-mono hover:opacity-80"
                          >
                            <ExternalLink className="w-3 h-3" />{t.tv_open_mp4}
                          </a>
                        )}
                        {renderResult.catcastUrl && (
                          <a href={renderResult.catcastUrl} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1.5 text-xs text-blue-400 underline font-mono hover:opacity-80"
                          >
                            <ExternalLink className="w-3 h-3" />{t.tv_open_catcast}
                          </a>
                        )}
                        <Button onClick={handleRender} disabled={rendering} variant="ghost" size="sm"
                          className="w-full font-mono text-xs text-muted-foreground gap-1.5 h-7"
                        >
                          <Video className="w-3 h-3" />
                          {rendering ? t.tv_rendering : t.tv_rerender}
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {/* Book button — hidden for TRC20 after submission */}
                {!(paymentType === "trc20" && trc20Submitted) && (
                  <Button
                    onClick={handleBook}
                    disabled={!canBook || (paymentType === "trc20" && trc20TxId.trim().length < 10)}
                    className={`w-full font-mono text-sm gap-2 ${paymentType === "trc20" ? "bg-sky-600 hover:bg-sky-500 text-white" : ""}`}
                  >
                    {(booking || trc20Submitting)
                      ? t.tv_booking
                      : paymentType === "trc20"
                        ? (<>✅ Подтвердить TRC20 оплату<ChevronRight className="w-4 h-4" /></>)
                        : (<>{t.tv_book_cta}<ChevronRight className="w-4 h-4" /></>)}
                  </Button>
                )}

                {paymentType === "fiat" && selectedSlot && (
                  <p className="text-[10px] text-muted-foreground font-mono text-center">{t.tv_stripe_note}</p>
                )}
                {paymentType === "crypto" && selectedSlot && (
                  <p className="text-[10px] text-muted-foreground font-mono text-center">{t.tv_crypto_note}</p>
                )}
              </CardContent>
            </Card>

            {/* ── My slots panel ── */}
            {mySlots.length > 0 && (
              <Card className="bg-card border-border">
                <CardHeader className="pb-2 pt-4">
                  <CardTitle className="text-sm font-mono text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5 text-primary" />
                    {t.tv_my_slots} · {date}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 pb-4">
                  {mySlots.map(slot => {
                    const isBroadcast = slot.status === "broadcast";
                    const isBooked = slot.status === "booked";
                    return (
                      <div
                        key={slot.id}
                        className={`flex items-center justify-between px-3 py-2.5 rounded-md border text-xs ${
                          isBroadcast
                            ? "border-orange-400/50 bg-orange-500/10"
                            : isBooked
                              ? "border-yellow-500/40 bg-yellow-500/8"
                              : "border-border bg-secondary/30"
                        }`}
                      >
                        <div>
                          <span className="font-mono font-bold text-sm text-foreground tabular-nums">
                            {slot.hourLabel}:{slot.minLabel}
                          </span>
                          <span className={`ml-2 font-mono text-[10px] ${SLOT_TYPE_BADGE[slot.slotType] ?? ""} px-1.5 py-0.5 rounded border`}>
                            {getTypeLabel(t, slot.slotType)}
                          </span>
                          {slot.isRetro && <span className="ml-1 text-[10px] text-muted-foreground font-mono">{t.tv_retro}</span>}
                        </div>
                        <div className="flex items-center gap-2">
                          {isBroadcast && (
                            <span className="flex items-center gap-1 text-[10px] text-orange-400 font-mono uppercase font-bold">
                              <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse inline-block" />{t.tv_live}
                            </span>
                          )}
                          {isBooked && (
                            <button
                              onClick={() => void handleAir(slot.id)}
                              disabled={airing}
                              className="flex items-center gap-1 text-[10px] font-mono text-yellow-400 border border-yellow-400/40 rounded px-2 py-0.5 hover:bg-yellow-400/10 transition-colors disabled:opacity-50"
                            >
                              <Radio className="w-3 h-3" />
                              {slot.isRetro ? t.tv_retro_air : t.tv_on_air_btn}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Booked schedule */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-lg font-medium flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary" />
              {t.tv_schedule_title} · {date}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {scheduleLoading ? (
              <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-14 bg-secondary" />)}</div>
            ) : schedule.length === 0 ? (
              <p className="text-muted-foreground text-sm py-4 text-center font-mono">
                {t.tv_no_schedule.replace("{date}", date)}
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
                        <Badge variant="outline" className={`text-[10px] font-mono ${SLOT_TYPE_BADGE[entry.slotType] ?? ""}`}>
                          {getTypeLabel(t, entry.slotType)}
                        </Badge>
                        <span className="text-sm text-foreground/80">{entry.ownerName ?? "—"}</span>
                        {entry.isRetro && <span className="text-[10px] font-mono text-muted-foreground uppercase">{t.tv_retro}</span>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {mp4Url && (
                          <span className="flex items-center gap-1 text-[10px] text-orange-400 font-mono uppercase font-bold">
                            <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse inline-block" />
                            {t.tv_live}
                          </span>
                        )}
                        {mp4Url && (
                          <a href={mp4Url} target="_blank" rel="noreferrer"
                            className="flex items-center gap-1 text-xs text-primary hover:underline font-mono"
                          >
                            <Video className="w-3 h-3" />MP4
                          </a>
                        )}
                        {entry.catcastUrl && (
                          <a href={entry.catcastUrl} target="_blank" rel="noreferrer"
                            className="flex items-center gap-1 text-xs text-blue-400 hover:underline font-mono"
                          >
                            <ExternalLink className="w-3 h-3" />Catcast
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
