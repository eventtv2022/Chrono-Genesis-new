import { useState, useEffect, useRef, useCallback } from "react";
import { Layout } from "@/components/Layout";
import { Globe, Clock, Bell, Play, Pause, RotateCcw, ChevronUp, ChevronDown, Info } from "lucide-react";
import { useCitizen } from "@/context/CitizenContext";

// ── World clock zones ─────────────────────────────────────────────────────────

const ZONES = [
  { label: "TimeNation", city: "Фамагуста", tz: "Asia/Nicosia", flag: "🇨🇾" },
  { label: "Moscow", city: "Москва", tz: "Europe/Moscow", flag: "🇷🇺" },
  { label: "Dubai", city: "Дубай", tz: "Asia/Dubai", flag: "🇦🇪" },
  { label: "Tokyo", city: "Токио", tz: "Asia/Tokyo", flag: "🇯🇵" },
  { label: "New York", city: "Нью-Йорк", tz: "America/New_York", flag: "🇺🇸" },
] as const;

function getTimeInZone(tz: string): { time: string; date: string; offset: string } {
  const now = new Date();
  const time = new Intl.DateTimeFormat("ru-RU", {
    timeZone: tz, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).format(now);
  const date = new Intl.DateTimeFormat("ru-RU", {
    timeZone: tz, weekday: "short", day: "numeric", month: "short",
  }).format(now);
  const offsetMs =
    new Date(now.toLocaleString("en-US", { timeZone: tz })).getTime() -
    new Date(now.toLocaleString("en-US", { timeZone: "UTC" })).getTime();
  const offsetH = offsetMs / 3600000;
  const sign = offsetH >= 0 ? "+" : "";
  const offset = `UTC${sign}${offsetH % 1 === 0 ? offsetH : offsetH.toFixed(1)}`;
  return { time, date, offset };
}

// ── Pomodoro presets ──────────────────────────────────────────────────────────

const PRESETS = [
  { label: "12 мин", seconds: 12 * 60 },
  { label: "24 мин", seconds: 24 * 60 },
  { label: "25 мин", seconds: 25 * 60 },
  { label: "36 мин", seconds: 36 * 60 },
  { label: "48 мин", seconds: 48 * 60 },
  { label: "50 мин", seconds: 50 * 60 },
  { label: "60 мин", seconds: 60 * 60 },
  { label: "90 мин", seconds: 90 * 60 },
];

// ── Alarm days ────────────────────────────────────────────────────────────────

const DAYS = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

// ── Main page ────────────────────────────────────────────────────────────────

export function Time() {
  const { citizen } = useCitizen();
  const [section, setSection] = useState<"clock" | "timer" | "alarm">("clock");

  // ── World clock tick ───────────────────────────────────────────────────────
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
  void tick;

  // ── Pomodoro timer ─────────────────────────────────────────────────────────
  const [preset, setPreset] = useState(0);
  const [remaining, setRemaining] = useState(PRESETS[0]!.seconds);
  const [running, setRunning] = useState(false);
  const [completed, setCompleted] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionDurationRef = useRef(PRESETS[0]!.seconds);

  const stopInterval = useCallback(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
  }, []);

  const handleTimerComplete = useCallback(async () => {
    stopInterval();
    setRunning(false);
    setCompleted(true);
    if (citizen?.id) {
      try {
        await fetch(`/api/citizens/log-focus`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ citizenId: citizen.id, durationMinutes: Math.round(sessionDurationRef.current / 60) }),
        });
      } catch { /* offline is fine */ }
    }
  }, [citizen?.id, stopInterval]);

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setRemaining(r => {
          if (r <= 1) { void handleTimerComplete(); return 0; }
          return r - 1;
        });
      }, 1000);
    } else {
      stopInterval();
    }
    return stopInterval;
  }, [running, handleTimerComplete, stopInterval]);

  const handlePreset = (i: number) => {
    stopInterval(); setRunning(false); setCompleted(false);
    setPreset(i); setRemaining(PRESETS[i]!.seconds);
    sessionDurationRef.current = PRESETS[i]!.seconds;
  };

  const timerMinutes = Math.floor(remaining / 60);
  const timerSeconds = remaining % 60;
  const progress = remaining / PRESETS[preset]!.seconds;

  // ── Alarm ──────────────────────────────────────────────────────────────────
  const [alarmHour, setAlarmHour] = useState(7);
  const [alarmMinute, setAlarmMinute] = useState(0);
  const [alarmDays, setAlarmDays] = useState<Set<number>>(new Set([1, 2, 3, 4, 5]));
  const [alarmActive, setAlarmActive] = useState(false);
  const [alarmFiring, setAlarmFiring] = useState(false);
  const [notifGranted, setNotifGranted] = useState(false);
  const alarmRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioUnlocked = useRef(false);
  const alarmSoundRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);
  const lastFiredKey = useRef("");

  // Request notification permission on mount
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "granted") setNotifGranted(true);
  }, []);

  const requestNotifPermission = async () => {
    if (!("Notification" in window)) return;
    const perm = await Notification.requestPermission();
    setNotifGranted(perm === "granted");
  };

  // ── Unlock AudioContext in a user-gesture handler (critical for mobile) ──
  const unlockAudio = useCallback(async () => {
    const AudioCtxClass = window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtxClass) return;
    if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
      audioCtxRef.current = new AudioCtxClass();
    }
    if (audioCtxRef.current.state === "suspended") {
      await audioCtxRef.current.resume();
    }
    // Play a silent buffer — unlocks audio on iOS and Android Chrome
    const buf = audioCtxRef.current.createBuffer(1, 1, 22050);
    const src = audioCtxRef.current.createBufferSource();
    src.buffer = buf;
    src.connect(audioCtxRef.current.destination);
    src.start(0);
    audioUnlocked.current = true;
  }, []);

  // ── Acquire Screen Wake Lock (keeps screen on while alarm is armed) ───────
  const acquireWakeLock = useCallback(async () => {
    if (!("wakeLock" in navigator)) return;
    try {
      wakeLockRef.current = await (navigator as unknown as { wakeLock: { request: (t: string) => Promise<{ release: () => Promise<void> }> } }).wakeLock.request("screen");
    } catch { /* not available */ }
  }, []);

  const releaseWakeLock = useCallback(() => {
    void wakeLockRef.current?.release().catch(() => {});
    wakeLockRef.current = null;
  }, []);

  // ── Play repeating alarm beep ─────────────────────────────────────────────
  const playAlarmSound = useCallback(() => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    if (ctx.state === "suspended") { void ctx.resume(); }

    // Vibrate pattern on mobile
    if ("vibrate" in navigator) navigator.vibrate([500, 200, 500, 200, 500, 200, 500]);

    let beat = 0;
    const playBeat = () => {
      if (!audioCtxRef.current || audioCtxRef.current.state === "closed") return;
      if (audioCtxRef.current.state === "suspended") { void audioCtxRef.current.resume(); }
      const freq = beat % 2 === 0 ? 880 : 660;
      const osc = audioCtxRef.current.createOscillator();
      const gain = audioCtxRef.current.createGain();
      osc.connect(gain);
      gain.connect(audioCtxRef.current.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, audioCtxRef.current.currentTime);
      gain.gain.setValueAtTime(0.6, audioCtxRef.current.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtxRef.current.currentTime + 0.4);
      osc.start(audioCtxRef.current.currentTime);
      osc.stop(audioCtxRef.current.currentTime + 0.45);
      beat++;
    };
    playBeat();
    alarmSoundRef.current = setInterval(playBeat, 700);
  }, []);

  const stopAlarmSound = useCallback(() => {
    if (alarmSoundRef.current) { clearInterval(alarmSoundRef.current); alarmSoundRef.current = null; }
    if ("vibrate" in navigator) navigator.vibrate(0);
  }, []);

  const dismissAlarm = useCallback(() => {
    setAlarmFiring(false);
    stopAlarmSound();
  }, [stopAlarmSound]);

  const getNicosiaHMS = (): { h: number; m: number; weekday: number } => {
    const now = new Date();
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Nicosia", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false,
    }).formatToParts(now);
    const get = (t: string) => parseInt(parts.find(p => p.type === t)?.value ?? "0", 10);
    let h = get("hour"); if (h === 24) h = 0;
    const weekday = new Date(get("year"), get("month") - 1, get("day")).getDay();
    return { h, m: get("minute"), weekday };
  };

  // ── Fire alarm ────────────────────────────────────────────────────────────
  const fireAlarm = useCallback(() => {
    setAlarmFiring(true);
    playAlarmSound();
    if (notifGranted && "Notification" in window && Notification.permission === "granted") {
      new Notification("⏰ Суверенный Будильник — TimeNation", {
        body: `Доброе утро, ${citizen?.name ?? "Гражданин"}! ${String(alarmHour).padStart(2,"0")}:${String(alarmMinute).padStart(2,"0")} по Фамагусте.`,
        icon: "/favicon.ico",
        requireInteraction: true,
      });
    }
  }, [playAlarmSound, notifGranted, citizen?.name, alarmHour, alarmMinute]);

  // ── Interval check ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!alarmActive) {
      if (alarmRef.current) { clearInterval(alarmRef.current); alarmRef.current = null; }
      releaseWakeLock();
      return;
    }
    const check = () => {
      const { h, m, weekday } = getNicosiaHMS();
      const fireKey = `${h}:${m}:${weekday}`;
      if (h === alarmHour && m === alarmMinute && alarmDays.has(weekday) && lastFiredKey.current !== fireKey) {
        lastFiredKey.current = fireKey;
        fireAlarm();
      }
    };
    check();
    alarmRef.current = setInterval(check, 5_000);
    return () => { if (alarmRef.current) { clearInterval(alarmRef.current); alarmRef.current = null; } };
  }, [alarmActive, alarmHour, alarmMinute, alarmDays, fireAlarm, releaseWakeLock]);

  // ── Re-check when tab becomes visible again (catches throttled interval) ──
  useEffect(() => {
    if (!alarmActive) return;
    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      const { h, m, weekday } = getNicosiaHMS();
      const fireKey = `${h}:${m}:${weekday}`;
      if (h === alarmHour && m === alarmMinute && alarmDays.has(weekday) && lastFiredKey.current !== fireKey) {
        lastFiredKey.current = fireKey;
        fireAlarm();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [alarmActive, alarmHour, alarmMinute, alarmDays, fireAlarm]);

  const toggleDay = (d: number) => {
    setAlarmDays(prev => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d); else next.add(d);
      return next;
    });
  };

  return (
    <Layout>
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Время</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Мировые часы · Таймер фокусировки · Суверенный будильник
          </p>
        </div>

        {/* Section tabs */}
        <div className="flex gap-2">
          {(["clock", "timer", "alarm"] as const).map(s => (
            <button
              key={s}
              onClick={() => setSection(s)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium border transition-colors ${
                section === s
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-muted-foreground border-border hover:text-foreground hover:bg-secondary"
              }`}
            >
              {s === "clock" ? <Globe className="w-4 h-4" /> : s === "timer" ? <Clock className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
              {s === "clock" ? "Часовые пояса" : s === "timer" ? "Таймер" : "Будильник"}
            </button>
          ))}
        </div>

        {/* ── World Clock ── */}
        {section === "clock" && (
          <div className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold">🌍 Мировые часы</h2>
              <p className="text-xs text-muted-foreground">Суверенное время TimeNation — Фамагуста, Кипр</p>
            </div>
            {ZONES.map(z => {
              const { time, date, offset } = getTimeInZone(z.tz);
              const isMain = z.label === "TimeNation";
              return (
                <div
                  key={z.label}
                  className={`flex items-center justify-between rounded-lg border px-5 py-4 ${
                    isMain
                      ? "bg-primary/10 border-primary/40"
                      : "bg-card border-border"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{z.flag}</span>
                    <div>
                      <div className={`text-sm font-semibold ${isMain ? "text-primary" : "text-foreground"}`}>
                        {z.city}
                      </div>
                      <div className="text-xs text-muted-foreground">{offset}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-2xl font-bold tabular-nums ${isMain ? "text-primary" : "text-foreground"}`}>
                      {time}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">{date}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Focus Timer ── */}
        {section === "timer" && (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold">⏱ Таймер фокусировки</h2>
              <p className="text-xs text-muted-foreground">Завершённая сессия засчитывается ИИ-Аудитором</p>
            </div>

            {/* Presets */}
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p, i) => (
                <button
                  key={i}
                  onClick={() => handlePreset(i)}
                  className={`px-3 py-2 rounded-md text-sm font-semibold border transition-colors ${
                    preset === i
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card text-muted-foreground border-border hover:text-foreground"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Timer display */}
            <div className="flex flex-col items-center gap-5 py-4">
              <div
                className={`w-48 h-48 rounded-full border-8 flex flex-col items-center justify-center gap-1 transition-all ${
                  running
                    ? "border-primary shadow-[0_0_32px_rgba(0,0,0,0.3)]"
                    : "border-border"
                } bg-card`}
                style={running ? { boxShadow: "0 0 32px var(--primary, #C9A84C)44" } : {}}
              >
                <span className={`text-5xl font-extrabold tabular-nums ${completed ? "text-primary" : "text-foreground"}`}>
                  {String(timerMinutes).padStart(2, "0")}:{String(timerSeconds).padStart(2, "0")}
                </span>
                <span className="text-xs text-muted-foreground">
                  {completed ? "Сессия завершена!" : running ? "Фокусируйся…" : "Готов к старту"}
                </span>
              </div>

              {/* Progress bar */}
              <div className="w-full h-1.5 bg-border rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all"
                  style={{ width: `${(1 - progress) * 100}%` }}
                />
              </div>
            </div>

            {/* Controls */}
            <div className="flex gap-3">
              <button
                onClick={() => { stopInterval(); setRunning(false); setCompleted(false); setRemaining(PRESETS[preset]!.seconds); }}
                className="flex items-center gap-2 px-5 py-3 rounded-lg bg-card border border-border text-muted-foreground hover:text-foreground font-semibold transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
                Сброс
              </button>
              <button
                onClick={() => setRunning(r => !r)}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg font-bold text-base transition-colors ${
                  running
                    ? "bg-secondary text-foreground border border-border"
                    : "bg-primary text-primary-foreground"
                }`}
              >
                {running ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                {running ? "Пауза" : "Старт"}
              </button>
            </div>

            {completed && (
              <div className="flex items-center gap-3 p-4 rounded-lg bg-primary/10 border border-primary/40">
                <span className="text-xl">🎉</span>
                <p className="text-sm text-foreground">
                  Ты инвестировал <strong>{Math.round(sessionDurationRef.current / 60)} минут</strong> концентрации. ИИ-Аудитор зачислит их в профиль активности.
                </p>
                <button onClick={() => setCompleted(false)} className="text-xs text-muted-foreground hover:text-foreground shrink-0">✕</button>
              </div>
            )}

            <div className="flex items-start gap-2 p-3 rounded-lg bg-muted text-xs text-muted-foreground">
              <Info className="w-4 h-4 shrink-0 mt-0.5" />
              При завершении таймер отправит отчёт в профиль — ИИ-Аудитор учтёт минуты концентрации при оценке производительности.
            </div>
          </div>
        )}

        {/* ── Alarm ── */}
        {section === "alarm" && (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold">⏰ Суверенный будильник</h2>
              <p className="text-xs text-muted-foreground">Работает по времени Фамагусты (Asia/Nicosia)</p>
            </div>

            {/* Time picker */}
            <div className="flex items-center justify-center gap-4">
              {/* Hour */}
              <div className="flex flex-col items-center bg-card border border-border rounded-xl px-8 py-4 gap-3">
                <button onClick={() => setAlarmHour(h => (h + 1) % 24)} className="text-primary hover:opacity-70 transition-opacity">
                  <ChevronUp className="w-6 h-6" />
                </button>
                <span className="text-5xl font-extrabold text-primary tabular-nums">{String(alarmHour).padStart(2, "0")}</span>
                <button onClick={() => setAlarmHour(h => (h + 23) % 24)} className="text-primary hover:opacity-70 transition-opacity">
                  <ChevronDown className="w-6 h-6" />
                </button>
              </div>
              <span className="text-5xl font-extrabold text-primary mb-2">:</span>
              {/* Minute */}
              <div className="flex flex-col items-center bg-card border border-border rounded-xl px-8 py-4 gap-3">
                <button onClick={() => setAlarmMinute(m => (m + 1) % 60)} className="text-primary hover:opacity-70 transition-opacity">
                  <ChevronUp className="w-6 h-6" />
                </button>
                <span className="text-5xl font-extrabold text-primary tabular-nums">{String(alarmMinute).padStart(2, "0")}</span>
                <button onClick={() => setAlarmMinute(m => (m + 59) % 60)} className="text-primary hover:opacity-70 transition-opacity">
                  <ChevronDown className="w-6 h-6" />
                </button>
              </div>
            </div>

            {/* Day toggles */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Дни недели</p>
              <div className="flex gap-2 flex-wrap">
                {DAYS.map((d, i) => (
                  <button
                    key={i}
                    onClick={() => toggleDay(i)}
                    className={`w-10 h-10 rounded-full text-xs font-semibold border transition-colors ${
                      alarmDays.has(i)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-card text-muted-foreground border-border hover:text-foreground"
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>

            {/* Notification permission request */}
            {"Notification" in window && Notification.permission === "default" && (
              <button
                onClick={() => void requestNotifPermission()}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
              >
                <Bell className="w-4 h-4" />
                Разрешить уведомления (для фоновой работы)
              </button>
            )}

            {/* Activate */}
            <button
              onClick={() => {
                const next = !alarmActive;
                if (next) {
                  // MUST unlock audio inside a user-gesture handler on mobile
                  void unlockAudio();
                  void acquireWakeLock();
                } else {
                  stopAlarmSound();
                  setAlarmFiring(false);
                  releaseWakeLock();
                }
                setAlarmActive(next);
              }}
              className={`w-full flex items-center justify-center gap-2 py-3 rounded-lg font-semibold border transition-colors ${
                alarmActive
                  ? "bg-primary/10 border-primary/40 text-primary hover:bg-primary/20"
                  : "bg-card border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              <Bell className="w-4 h-4" />
              {alarmActive ? "Будильник активен — выключить" : "Включить будильник"}
            </button>

            {alarmActive && !alarmFiring && (
              <div className="flex items-center gap-3 p-3 rounded-lg border bg-primary/10 border-primary/40">
                <Bell className="w-4 h-4 text-primary shrink-0" />
                <p className="text-sm text-primary">
                  Сработает в {String(alarmHour).padStart(2, "0")}:{String(alarmMinute).padStart(2, "0")} по Фамагусте
                  {alarmDays.size < 7
                    ? ` · ${[...alarmDays].sort().map(d => DAYS[d]).join(", ")}`
                    : " · каждый день"}
                </p>
              </div>
            )}

            {/* Firing banner */}
            {alarmFiring && (
              <div className="flex items-center justify-between gap-3 p-4 rounded-lg border-2 border-primary bg-primary/10 animate-pulse">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">⏰</span>
                  <div>
                    <p className="font-bold text-primary">Суверенный Будильник!</p>
                    <p className="text-sm text-primary/80">
                      {String(alarmHour).padStart(2,"0")}:{String(alarmMinute).padStart(2,"0")} · Фамагуста
                    </p>
                  </div>
                </div>
                <button
                  onClick={dismissAlarm}
                  className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/80 transition-colors"
                >
                  Выключить
                </button>
              </div>
            )}

            <div className="flex items-start gap-2 p-3 rounded-lg bg-muted text-xs text-muted-foreground">
              <Info className="w-4 h-4 shrink-0 mt-0.5" />
              Будильник воспроизводит звуковой сигнал и показывает баннер. Разреши уведомления — тогда сработает даже если вкладка свёрнута. Страница должна быть открыта.
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
