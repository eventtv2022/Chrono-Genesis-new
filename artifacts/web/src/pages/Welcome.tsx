import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { useGetStats } from "@workspace/api-client-react";

/* ─────────────────────── helpers ─────────────────────── */
function pad2(n: number) { return String(n).padStart(2, "0"); }

const FONT_ORBITRON = "'Orbitron', 'Space Mono', monospace";
const FONT_EXO      = "'Exo 2', 'Space Grotesk', sans-serif";

/* ═══════════════════════════════════════════════════════════════════
   HYPERSPACE CANVAS — converging neon threads + star-dust
═══════════════════════════════════════════════════════════════════ */
function HyperspaceCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let W = 0, H = 0, cx = 0, cy = 0, raf = 0;

    // Neon thread colors
    const COLORS = [
      "rgba(0,212,255,",   // cyan
      "rgba(120,80,255,",  // violet
      "rgba(201,168,76,",  // gold
      "rgba(0,255,136,",   // green
      "rgba(255,80,180,",  // pink
    ];

    interface Thread {
      angle: number; speed: number; len: number;
      dist: number; color: string; width: number;
    }
    const N_THREADS = 220;
    let threads: Thread[] = [];

    const mkThread = (): Thread => ({
      angle: Math.random() * Math.PI * 2,
      speed: 0.4 + Math.random() * 2.2,
      len:   40 + Math.random() * 180,
      dist:  Math.random() * Math.min(W, H) * 0.52,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      width: 0.4 + Math.random() * 1.4,
    });

    // Star dust
    interface Dust { x: number; y: number; r: number; a: number; va: number; }
    const N_DUST = 160;
    let dust: Dust[] = [];

    const resize = () => {
      W = canvas.width  = window.innerWidth;
      H = canvas.height = window.innerHeight;
      cx = W / 2; cy = H / 2;
      threads = Array.from({ length: N_THREADS }, mkThread);
      dust = Array.from({ length: N_DUST }, () => ({
        x: Math.random() * W, y: Math.random() * H,
        r: 0.3 + Math.random() * 1.2,
        a: Math.random(), va: (Math.random() - 0.5) * 0.009,
      }));
    };

    const draw = () => {
      // Fade trail
      ctx.fillStyle = "rgba(4,4,20,0.18)";
      ctx.fillRect(0, 0, W, H);

      // ── Hyperspace threads ──
      for (const t of threads) {
        t.dist += t.speed;
        if (t.dist > Math.max(W, H) * 0.72) {
          t.dist  = 2;
          t.angle = Math.random() * Math.PI * 2;
          t.speed = 0.4 + Math.random() * 2.2;
          t.len   = 40 + Math.random() * 180;
          t.color = COLORS[Math.floor(Math.random() * COLORS.length)];
          t.width = 0.4 + Math.random() * 1.4;
        }
        const progress = t.dist / (Math.max(W, H) * 0.72);
        const alpha    = Math.min(1, progress * 3) * (1 - progress * 0.6);
        const x1 = cx + Math.cos(t.angle) * t.dist;
        const y1 = cy + Math.sin(t.angle) * t.dist;
        const x2 = cx + Math.cos(t.angle) * (t.dist + t.len * progress);
        const y2 = cy + Math.sin(t.angle) * (t.dist + t.len * progress);

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = `${t.color}${(alpha * 0.9).toFixed(2)})`;
        ctx.lineWidth   = t.width * (0.3 + progress * 1.2);
        ctx.stroke();
      }

      // ── Star dust ──
      for (const d of dust) {
        d.a = Math.max(0.04, Math.min(0.85, d.a + d.va));
        if (d.a <= 0.05 || d.a >= 0.84) d.va *= -1;
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(180,200,255,${(d.a * 0.65).toFixed(2)})`;
        ctx.fill();
      }

      // ── Central nebula core (radial glow) ──
      const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.min(W, H) * 0.35);
      rg.addColorStop(0,    "rgba(60,30,140,0.22)");
      rg.addColorStop(0.5,  "rgba(0,80,180,0.10)");
      rg.addColorStop(1,    "rgba(0,0,0,0)");
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, W, H);

      raf = requestAnimationFrame(draw);
    };

    resize();
    draw();
    window.addEventListener("resize", resize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);

  return (
    <canvas
      ref={ref}
      style={{
        position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none",
        background: "linear-gradient(160deg,#02020f 0%,#05041a 45%,#03051e 100%)",
      }}
    />
  );
}

/* ═══════════════════════════════════════════════════════════════════
   EMBLEM — official image with pulsing glow rings
═══════════════════════════════════════════════════════════════════ */
function Emblem({ size = 240 }: { size?: number }) {
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      {/* Outer animated rings */}
      {[1.55, 1.35, 1.18].map((scale, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            top: "50%", left: "50%",
            transform: "translate(-50%,-50%)",
            width: size * scale, height: size * scale,
            borderRadius: "50%",
            border: `1px solid rgba(${i === 0 ? "0,212,255" : i === 1 ? "201,168,76" : "120,80,255"},0.25)`,
            animation: `ring-spin-${i} ${14 + i * 6}s linear infinite`,
          }}
        />
      ))}
      {/* Gold glow halo */}
      <div
        style={{
          position: "absolute", top: "50%", left: "50%",
          transform: "translate(-50%,-50%)",
          width: size * 1.1, height: size * 1.1,
          borderRadius: "50%",
          background: "radial-gradient(circle,rgba(201,168,76,0.22) 0%,rgba(0,212,255,0.10) 50%,transparent 75%)",
          animation: "emblem-halo 3s ease-in-out infinite",
        }}
      />
      {/* Actual emblem image */}
      <div
        style={{
          width: size, height: size, borderRadius: "50%", overflow: "hidden",
          boxShadow: "0 0 40px rgba(0,212,255,0.55), 0 0 80px rgba(201,168,76,0.35), 0 0 120px rgba(120,80,255,0.2)",
          animation: "emblem-pulse 3s ease-in-out infinite",
        }}
      >
        <img
          src="/web/emblem.jpg"
          alt="TimeNation Emblem"
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          draggable={false}
        />
      </div>

      <style>{`
        @keyframes emblem-pulse {
          0%,100% { box-shadow:0 0 30px rgba(0,212,255,.45),0 0 60px rgba(201,168,76,.28),0 0 100px rgba(120,80,255,.15); }
          50%      { box-shadow:0 0 60px rgba(0,212,255,.85),0 0 110px rgba(201,168,76,.55),0 0 160px rgba(120,80,255,.35); }
        }
        @keyframes emblem-halo {
          0%,100% { opacity:.6; transform:translate(-50%,-50%) scale(1); }
          50%      { opacity:1;  transform:translate(-50%,-50%) scale(1.08); }
        }
        @keyframes ring-spin-0 { from{transform:translate(-50%,-50%) rotate(0deg)}  to{transform:translate(-50%,-50%) rotate(360deg)} }
        @keyframes ring-spin-1 { from{transform:translate(-50%,-50%) rotate(0deg)}  to{transform:translate(-50%,-50%) rotate(-360deg)} }
        @keyframes ring-spin-2 { from{transform:translate(-50%,-50%) rotate(45deg)} to{transform:translate(-50%,-50%) rotate(405deg)} }
      `}</style>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   NEON CLOCK — bottom-left floating widget
═══════════════════════════════════════════════════════════════════ */
function NeonClock() {
  const [time, setTime] = useState({ h: "00", m: "00", s: "00" });
  const [tilt, setTilt] = useState(0);

  useEffect(() => {
    const tick = () => {
      const n = new Date();
      setTime({ h: pad2(n.getHours()), m: pad2(n.getMinutes()), s: pad2(n.getSeconds()) });
      setTilt(Math.sin(Date.now() / 3000) * 6);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      style={{
        display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
        transform: `perspective(400px) rotateY(${tilt}deg) rotateX(${tilt * 0.4}deg)`,
        transition: "transform 1s ease-in-out",
      }}
    >
      <div style={{ fontSize: 9, letterSpacing: "0.2em", color: "#00d4ff", fontFamily: FONT_ORBITRON, opacity: 0.7, textTransform: "uppercase" }}>
        Chronosphere Time
      </div>
      <div
        style={{
          fontFamily: FONT_ORBITRON,
          fontSize: 28,
          fontWeight: 700,
          letterSpacing: "0.12em",
          color: "#00d4ff",
          textShadow: "0 0 14px rgba(0,212,255,0.9), 0 0 30px rgba(0,212,255,0.5), 0 0 50px rgba(0,212,255,0.25)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {time.h}<span style={{ opacity: 0.5, animation: "colon-blink 1s step-end infinite" }}>:</span>
        {time.m}<span style={{ opacity: 0.5, animation: "colon-blink 1s step-end infinite" }}>:</span>
        {time.s}
      </div>
      <div style={{ fontSize: 8, color: "#8080a0", letterSpacing: "0.15em", textTransform: "uppercase" }}>
        UTC+0 · Live
      </div>
      <style>{`
        @keyframes colon-blink { 0%,49%{opacity:.5} 50%,100%{opacity:.1} }
      `}</style>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   GLOBAL ACTIVITY WIDGET — bottom-right
═══════════════════════════════════════════════════════════════════ */
function ActivityWidget({ stats }: { stats: { activeCitizens: number; totalMinutesCirculated: number | string; totalTransactions: number } | undefined }) {
  const rows = [
    { icon: "⚡", label: "Citizens Active",         value: stats ? stats.activeCitizens.toLocaleString()                              : "—", color: "#00ff88" },
    { icon: "⏳", label: "Darmīn in Circulation",   value: stats ? Number(stats.totalMinutesCirculated).toFixed(0)                    : "—", color: "#c9a84c" },
    { icon: "🔄", label: "Transactions",             value: stats ? stats.totalTransactions.toLocaleString()                          : "—", color: "#00d4ff" },
  ];

  return (
    <div
      style={{
        background: "rgba(4,8,30,0.78)",
        border: "1px solid rgba(0,212,255,0.22)",
        borderRadius: 16,
        padding: "16px 20px",
        backdropFilter: "blur(16px)",
        boxShadow: "0 0 30px rgba(0,212,255,0.08), inset 0 0 20px rgba(0,212,255,0.03)",
        minWidth: 230,
      }}
    >
      <div style={{ fontSize: 10, letterSpacing: "0.18em", color: "#00d4ff", fontFamily: FONT_ORBITRON, marginBottom: 12, textTransform: "uppercase", opacity: 0.8 }}>
        ◉ Global Activity
      </div>
      {rows.map(r => (
        <div key={r.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 9 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12 }}>{r.icon}</span>
            <span style={{ fontSize: 11, color: "#8080a0", fontFamily: FONT_EXO }}>{r.label}</span>
          </div>
          <span style={{ fontSize: 13, fontWeight: 700, color: r.color, fontFamily: FONT_ORBITRON, textShadow: `0 0 10px ${r.color}80` }}>
            {r.value}
          </span>
        </div>
      ))}
      {/* Pulse bar */}
      <div style={{ marginTop: 10, height: 2, background: "rgba(0,212,255,0.12)", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ height: "100%", background: "linear-gradient(90deg,#00d4ff,#7850ff)", borderRadius: 2, animation: "scan-bar 2.4s ease-in-out infinite" }} />
      </div>
      <style>{`
        @keyframes scan-bar {
          0%   { width:0%;   margin-left:0 }
          50%  { width:100%; margin-left:0 }
          100% { width:0%;   margin-left:100% }
        }
      `}</style>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   NEON CTA BUTTON
═══════════════════════════════════════════════════════════════════ */
function NeonButton({
  children, onClick, primary = false, color = "#00d4ff",
}: {
  children: React.ReactNode; onClick: () => void; primary?: boolean; color?: string;
}) {
  const [hov, setHov] = useState(false);

  const rgb = primary ? "201,168,76" : color === "#00ff88" ? "0,255,136" : color === "#7850ff" ? "120,80,255" : "0,212,255";

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        padding: "13px 28px",
        borderRadius: 10,
        border: `1px solid rgba(${rgb},${hov ? 0.9 : 0.45})`,
        background: hov
          ? `rgba(${rgb},0.18)`
          : `rgba(${rgb},0.07)`,
        color: primary ? `rgba(${rgb},1)` : `rgba(${rgb},${hov ? 1 : 0.8})`,
        fontSize: 12,
        fontWeight: 700,
        fontFamily: FONT_ORBITRON,
        letterSpacing: "0.12em",
        cursor: "pointer",
        textTransform: "uppercase" as const,
        backdropFilter: "blur(8px)",
        transition: "all .18s",
        boxShadow: hov
          ? `0 0 20px rgba(${rgb},0.55), 0 0 40px rgba(${rgb},0.2), inset 0 0 16px rgba(${rgb},0.08)`
          : `0 0 8px rgba(${rgb},0.2)`,
        transform: hov ? "translateY(-2px)" : "none",
        whiteSpace: "nowrap" as const,
      }}
    >
      {children}
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   DESKTOP AAA HERO  — split layout: Flag ← | → Headline + CTAs
═══════════════════════════════════════════════════════════════════ */
function DesktopHero() {
  const [, navigate] = useLocation();
  const { data: stats } = useGetStats();
  const [mouse, setMouse] = useState({ x: 0, y: 0 });
  const heroRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const rect = heroRef.current?.getBoundingClientRect();
    if (!rect) return;
    setMouse({
      x: ((e.clientX - rect.left)  / rect.width  - 0.5) * 2,
      y: ((e.clientY - rect.top)   / rect.height - 0.5) * 2,
    });
  }, []);

  const px = (f: number) => `${mouse.x * f}px`;
  const py = (f: number) => `${mouse.y * f}px`;

  return (
    <div
      ref={heroRef}
      onMouseMove={handleMouseMove}
      style={{ minHeight: "100vh", display: "flex", flexDirection: "column", position: "relative", zIndex: 1 }}
    >
      {/* ── TOP BAR ─────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "20px 48px",
          background: "linear-gradient(180deg,rgba(2,2,20,0.85) 0%,transparent 100%)",
          borderBottom: "1px solid rgba(0,212,255,0.08)",
          backdropFilter: "blur(8px)",
          position: "relative", zIndex: 10,
        }}
      >
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 32, height: 32, borderRadius: "50%", overflow: "hidden", boxShadow: "0 0 12px rgba(0,212,255,0.5)" }}>
            <img src="/web/emblem.jpg" alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} draggable={false} />
          </div>
          <span style={{ fontFamily: FONT_ORBITRON, fontSize: 16, fontWeight: 700, color: "#00d4ff", letterSpacing: "0.08em", textShadow: "0 0 12px rgba(0,212,255,0.6)" }}>
            TIMENATION
          </span>
        </div>

        {/* Status center */}
        <div style={{ display: "flex", alignItems: "center", gap: 20, fontFamily: FONT_EXO, fontSize: 12 }}>
          <StatusPill label="SERVER STATUS" value="ONLINE" color="#00ff88" />
          <StatusPill label="EMISSION" value="LIVE" color="#c9a84c" />
        </div>

        {/* Auth buttons */}
        <div style={{ display: "flex", gap: 12 }}>
          <NeonButton onClick={() => navigate("/")} color="#00d4ff">Log In</NeonButton>
          <NeonButton onClick={() => navigate("/register")} primary color="#c9a84c">Join DAO</NeonButton>
        </div>
      </div>

      {/* ── MAIN STAGE — two-column split ───────────────────────── */}
      <div
        style={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          alignItems: "center",
          padding: "0 64px 96px",
          gap: 48,
          position: "relative",
        }}
      >
        {/* ══════════════════════════════════════════════════
            LEFT COLUMN — Waving flag + caption
        ══════════════════════════════════════════════════ */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 24,
            transform: `translate(${px(-10)},${py(-6)}) perspective(900px) rotateX(${mouse.y * 3}deg) rotateY(${mouse.x * 3}deg)`,
            transition: "transform .18s ease-out",
          }}
        >
          {/* Decorative arch label */}
          <div
            style={{
              fontFamily: FONT_ORBITRON, fontSize: 9, fontWeight: 600,
              color: "#c9a84c", letterSpacing: "0.22em", textTransform: "uppercase",
              textShadow: "0 0 12px rgba(201,168,76,0.6)",
              opacity: 0.85,
            }}
          >
            ✦ &nbsp;OFFICIAL STANDARD &nbsp; ✦
          </div>

          {/* ── Video flag ──────────────────────────────────────── */}
          <div style={{ position: "relative" }}>
            {/* Ambient glow behind the video */}
            <div style={{
              position: "absolute",
              inset: "-28px -36px",
              background: "radial-gradient(ellipse at center, rgba(43,168,216,0.20) 0%, rgba(201,168,76,0.09) 50%, transparent 75%)",
              pointerEvents: "none",
              borderRadius: "50%",
              animation: "flag-glow-pulse 3.5s ease-in-out infinite",
            }} />
            {/* Neon frame wrapper */}
            <div
              style={{
                position: "relative",
                borderRadius: 18,
                padding: 3,
                background: "linear-gradient(135deg, rgba(43,168,216,0.55) 0%, rgba(201,168,76,0.45) 50%, rgba(120,80,255,0.45) 100%)",
                boxShadow: [
                  "0 0 24px rgba(43,168,216,0.45)",
                  "0 0 50px rgba(43,168,216,0.18)",
                  "0 0 80px rgba(201,168,76,0.14)",
                  "inset 0 0 20px rgba(43,168,216,0.08)",
                ].join(", "),
                animation: "flag-border-pulse 3.2s ease-in-out infinite",
              }}
            >
              {/* Inner dark mat */}
              <div style={{ borderRadius: 15, overflow: "hidden", background: "#02020f" }}>
                <video
                  src="/web/timenation-flag.mp4"
                  autoPlay
                  loop
                  muted
                  playsInline
                  style={{
                    display: "block",
                    width: "100%",
                    maxWidth: 460,
                    height: "auto",
                    objectFit: "cover",
                    borderRadius: 14,
                  }}
                />
              </div>
            </div>
          </div>

          {/* Flag caption */}
          <div style={{
            textAlign: "center",
            fontFamily: FONT_EXO,
            fontSize: 11,
            color: "#8080a0",
            letterSpacing: "0.15em",
            textTransform: "uppercase",
          }}>
            <span style={{ color: "#c9a84c", textShadow: "0 0 8px rgba(201,168,76,0.5)" }}>TimeNation</span>
            &nbsp;·&nbsp; Государство Хронократии
          </div>
        </div>

        {/* ══════════════════════════════════════════════════
            RIGHT COLUMN — Emblem + Headlines + CTAs
        ══════════════════════════════════════════════════ */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            gap: 0,
          }}
        >
          {/* Emblem */}
          <div
            style={{
              transform: `translate(${px(-5)},${py(-4)}) perspective(900px) rotateX(${mouse.y * 4}deg) rotateY(${mouse.x * 4}deg)`,
              transition: "transform .16s ease-out",
              marginBottom: 28,
            }}
          >
            <Emblem size={140} />
          </div>

          {/* Headline */}
          <div
            style={{
              transform: `translate(${px(-8)},${py(-5)})`,
              transition: "transform .13s ease-out",
              marginBottom: 10,
            }}
          >
            <h1
              style={{
                margin: 0,
                fontFamily: FONT_ORBITRON,
                fontSize: "clamp(26px, 2.8vw, 50px)",
                fontWeight: 900,
                lineHeight: 1.12,
                background: "linear-gradient(135deg,#ffffff 0%,#00d4ff 40%,#a0e8ff 70%,#ffffff 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                filter: "drop-shadow(0 0 16px rgba(0,212,255,0.5))",
                letterSpacing: "0.04em",
              }}
            >
              WELCOME,<br />TEMPORAL CITIZEN!
            </h1>
          </div>

          <div
            style={{
              transform: `translate(${px(-6)},${py(-3)})`,
              transition: "transform .15s ease-out",
              marginBottom: 6,
            }}
          >
            <div style={{ fontFamily: FONT_EXO, fontSize: "clamp(12px,1.2vw,17px)", fontWeight: 300, color: "#7abfff", letterSpacing: "0.18em", textTransform: "uppercase", textShadow: "0 0 14px rgba(122,191,255,0.5)" }}>
              EMBRACE THE CHRONOSPHERE
            </div>
          </div>

          <div
            style={{
              transform: `translate(${px(-4)},${py(-2)})`,
              transition: "transform .16s ease-out",
              marginBottom: 36,
            }}
          >
            <div style={{ fontFamily: FONT_EXO, fontSize: "clamp(11px,1.1vw,16px)", fontWeight: 700, color: "#c9a84c", letterSpacing: "0.14em", textTransform: "uppercase", textShadow: "0 0 18px rgba(201,168,76,0.6)" }}>
              YOUR TIME.&nbsp;&nbsp;YOUR EMPIRE.
            </div>
          </div>

          {/* CTA column */}
          <div
            style={{
              display: "flex", flexDirection: "column", gap: 12,
              transform: `translate(${px(-5)},${py(-2)})`,
              transition: "transform .18s ease-out",
              width: "100%", maxWidth: 360,
            }}
          >
            <NeonButton onClick={() => navigate("/register")} primary color="#c9a84c">
              ⚡&nbsp; Register Your Passport
            </NeonButton>
            <div style={{ display: "flex", gap: 10 }}>
              <NeonButton onClick={() => navigate("/timeline")} color="#00d4ff">
                🔭&nbsp; Chronopedia
              </NeonButton>
              <NeonButton onClick={() => navigate("/")} color="#00ff88">
                👑&nbsp; Dashboard
              </NeonButton>
            </div>
          </div>
        </div>
      </div>

      {/* ── BOTTOM BAR — Clock left, Activity right ─────────────── */}
      <div
        style={{
          position: "absolute", bottom: 32, left: 0, right: 0,
          display: "flex", justifyContent: "space-between", alignItems: "flex-end",
          padding: "0 52px", pointerEvents: "none",
        }}
      >
        {/* Neon clock */}
        <div style={{ pointerEvents: "auto", transform: `translate(${px(6)},${py(4)})`, transition: "transform .2s ease-out" }}>
          <NeonClock />
        </div>

        {/* Activity widget */}
        <div style={{ pointerEvents: "auto", transform: `translate(${px(-6)},${py(4)})`, transition: "transform .2s ease-out" }}>
          <ActivityWidget stats={stats} />
        </div>
      </div>

      {/* Global animation keyframes */}
      <style>{`
        @keyframes tn-blink { 0%,100%{opacity:1} 50%{opacity:.3} }
        @keyframes led-glow {
          0%,100% { box-shadow:0 0 4px currentColor; }
          50%      { box-shadow:0 0 10px currentColor, 0 0 20px currentColor; }
        }
        @keyframes flag-glow-pulse {
          0%,100% { opacity:.6; transform:scale(1); }
          50%      { opacity:1;  transform:scale(1.06); }
        }
        @keyframes flag-border-pulse {
          0%,100% {
            box-shadow:0 0 24px rgba(43,168,216,0.45),0 0 50px rgba(43,168,216,0.18),0 0 80px rgba(201,168,76,0.14),inset 0 0 20px rgba(43,168,216,0.08);
          }
          50% {
            box-shadow:0 0 38px rgba(43,168,216,0.75),0 0 70px rgba(43,168,216,0.32),0 0 110px rgba(201,168,76,0.28),inset 0 0 28px rgba(43,168,216,0.14);
          }
        }
      `}</style>
    </div>
  );
}

/* ── tiny status pill ── */
function StatusPill({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
      <div style={{ width: 7, height: 7, borderRadius: "50%", background: color, boxShadow: `0 0 8px ${color}`, animation: "tn-blink 2s infinite", color }} />
      <span style={{ color: "#8080a0", fontSize: 10, letterSpacing: "0.1em", fontFamily: FONT_EXO }}>{label}:&nbsp;</span>
      <span style={{ color, fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textShadow: `0 0 8px ${color}` }}>{value}</span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   MOBILE HERO (compact — unchanged from before)
═══════════════════════════════════════════════════════════════════ */
/* ═══════════════════════════════════════════════════════════════════
   MOBILE HYPERSPACE — lightweight canvas for mobile performance
═══════════════════════════════════════════════════════════════════ */
function MobileCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let W = 0, H = 0, cx = 0, cy = 0, raf = 0;
    const COLORS = ["rgba(0,212,255,","rgba(120,80,255,","rgba(201,168,76,","rgba(0,255,136,"];
    interface T { angle:number; speed:number; len:number; dist:number; color:string; }
    let threads: T[] = [];
    const mk = (): T => ({
      angle: Math.random() * Math.PI * 2,
      speed: 0.5 + Math.random() * 1.8,
      len:   30 + Math.random() * 120,
      dist:  Math.random() * 200,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
    });
    const resize = () => {
      W = canvas.width  = window.innerWidth;
      H = canvas.height = window.innerHeight;
      cx = W / 2; cy = H / 2;
      threads = Array.from({ length: 100 }, mk);
    };
    const draw = () => {
      ctx.fillStyle = "rgba(2,2,16,0.22)";
      ctx.fillRect(0, 0, W, H);
      for (const t of threads) {
        t.dist += t.speed;
        if (t.dist > Math.max(W, H) * 0.75) { Object.assign(t, mk()); t.dist = 2; }
        const prog = t.dist / (Math.max(W, H) * 0.75);
        const alpha = Math.min(1, prog * 2.5) * (1 - prog * 0.5);
        const x1 = cx + Math.cos(t.angle) * t.dist;
        const y1 = cy + Math.sin(t.angle) * t.dist;
        const x2 = cx + Math.cos(t.angle) * (t.dist + t.len * prog);
        const y2 = cy + Math.sin(t.angle) * (t.dist + t.len * prog);
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
        ctx.strokeStyle = `${t.color}${(alpha * 0.85).toFixed(2)})`;
        ctx.lineWidth = 0.6 + prog * 1.2;
        ctx.stroke();
      }
      raf = requestAnimationFrame(draw);
    };
    resize(); draw();
    window.addEventListener("resize", resize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);
  return (
    <canvas
      ref={ref}
      style={{
        position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none",
        background: "linear-gradient(160deg,#02020f 0%,#060420 50%,#02020f 100%)",
      }}
    />
  );
}

/* ═══════════════════════════════════════════════════════════════════
   MOBILE HERO — AAA Sci-Fi redesign
═══════════════════════════════════════════════════════════════════ */
function MobileHero() {
  const [, navigate]        = useLocation();
  const { data: stats }     = useGetStats();
  const [clock, setClock]   = useState({ h: "00", m: "00", s: "00" });
  const [expanded, setExpanded] = useState<number | null>(null);
  const [tilt, setTilt]     = useState({ x: 0, y: 0 });
  const [clockTilt, setClockTilt] = useState(0);

  // Live clock
  useEffect(() => {
    const tick = () => {
      const n = new Date();
      setClock({ h: pad2(n.getHours()), m: pad2(n.getMinutes()), s: pad2(n.getSeconds()) });
      setClockTilt(Math.sin(Date.now() / 3200) * 5);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // Parallax — touch move
  useEffect(() => {
    const onTouch = (e: TouchEvent) => {
      const t = e.touches[0];
      const x = (t.clientX / window.innerWidth  - 0.5) * 2;
      const y = (t.clientY / window.innerHeight - 0.5) * 2;
      setTilt({ x, y });
    };
    // deviceorientation for real mobile parallax
    const onOrient = (e: DeviceOrientationEvent) => {
      const x = Math.min(1, Math.max(-1, (e.gamma ?? 0) / 20));
      const y = Math.min(1, Math.max(-1, ((e.beta  ?? 0) - 45) / 30));
      setTilt({ x, y });
    };
    window.addEventListener("touchmove", onTouch, { passive: true });
    window.addEventListener("deviceorientation", onOrient);
    return () => {
      window.removeEventListener("touchmove", onTouch);
      window.removeEventListener("deviceorientation", onOrient);
    };
  }, []);

  const px = (f: number) => `${tilt.x * f}px`;
  const py = (f: number) => `${tilt.y * f}px`;

  const CARDS = [
    { icon: "🛑", title: "Борьба с «цифровым мусором»",  body: "В твоём телефоне лежат тысячи случайных скриншотов, которые умрут на жёстком диске. В TimeNation ты создаёшь цифровой капитал смыслов.\n\nЗафиксировать 1 минуту в Хронопедии — поставить несгораемую точку." },
    { icon: "🗺", title: "Топография жизни",               body: "Хронопедия даёт 3D-картину твоей судьбы. Через 5–10 лет ты увидишь точную карту вех: какие решения и смыслы происходили с тобой в конкретных точках планеты." },
    { icon: "🌉", title: "Межпоколенческий мост",          body: "TimeNation гарантирует, что твоя личная история не растворится в цифровом шуме, а останется живым наследием для будущих поколений." },
  ] as const;

  const MOMENTS = [
    "💡 Зафиксировать решение, которое изменило мой день",
    "⏳ Записать мысль или эмоцию себе в будущее",
    "✨ Запечатлеть знание этого момента",
  ] as const;

  return (
    <div style={{ minHeight: "100vh", color: "#e8e8f4", fontFamily: FONT_EXO, overflowX: "hidden", background: "#02020f", position: "relative" }}>
      <MobileCanvas />

      <div style={{ position: "relative", zIndex: 1, maxWidth: 500, margin: "0 auto", padding: "0 18px 80px" }}>

        {/* ── TOP BAR ──────────────────────────────────────────── */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 0 12px",
          borderBottom: "1px solid rgba(0,212,255,0.10)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 26, height: 26, borderRadius: "50%", overflow: "hidden", boxShadow: "0 0 8px rgba(0,212,255,0.5)" }}>
              <img src="/web/emblem.jpg" alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} draggable={false} />
            </div>
            <span style={{ fontFamily: FONT_ORBITRON, fontSize: 13, fontWeight: 700, color: "#00d4ff", letterSpacing: "0.06em", textShadow: "0 0 10px rgba(0,212,255,0.55)" }}>
              TIMENATION
            </span>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <MiniStatusPill label="SERVER" value="ONLINE" color="#00ff88" />
            <MiniStatusPill label="EMISSION" value="LIVE" color="#c9a84c" />
          </div>
        </div>

        {/* ── FLAG VIDEO ───────────────────────────────────────── */}
        <div style={{
          display: "flex", justifyContent: "center", paddingTop: 24,
          transform: `translate(${px(-5)},${py(-3)})`,
          transition: "transform .2s ease-out",
        }}>
          <div style={{
            position: "relative",
            borderRadius: 16,
            padding: 2,
            background: "linear-gradient(135deg, rgba(43,168,216,0.55) 0%, rgba(201,168,76,0.45) 50%, rgba(120,80,255,0.45) 100%)",
            boxShadow: "0 0 20px rgba(43,168,216,0.40), 0 0 44px rgba(43,168,216,0.14), 0 0 70px rgba(201,168,76,0.12)",
            animation: "flag-border-pulse 3.2s ease-in-out infinite",
            maxWidth: 320,
            width: "100%",
          }}>
            <div style={{ borderRadius: 14, overflow: "hidden", background: "#02020f" }}>
              <video
                src="/web/timenation-flag.mp4"
                autoPlay
                loop
                muted
                playsInline
                preload="auto"
                style={{ display: "block", width: "100%", height: "auto", objectFit: "cover" }}
              />
            </div>
          </div>
        </div>

        {/* ── EMBLEM ───────────────────────────────────────────── */}
        <div style={{
          display: "flex", justifyContent: "center", paddingTop: 20,
          transform: `translate(${px(-6)},${py(-4)})`,
          transition: "transform .2s ease-out",
        }}>
          <Emblem size={130} />
        </div>

        {/* ── CLOCK + TAGLINE ──────────────────────────────────── */}
        <div style={{
          textAlign: "center", marginTop: 24,
          transform: `translate(${px(-4)},${py(-3)})`,
          transition: "transform .22s ease-out",
        }}>
          <div style={{
            fontFamily: FONT_ORBITRON,
            fontSize: "clamp(38px,11vw,54px)",
            fontWeight: 700,
            letterSpacing: "0.1em",
            fontVariantNumeric: "tabular-nums",
            lineHeight: 1,
            background: "linear-gradient(90deg,#00d4ff,#a78bfa,#00d4ff)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            filter: "drop-shadow(0 0 16px rgba(0,212,255,0.6))",
          }}>
            {clock.h}<span style={{ opacity: 0.4, animation: "m-colon 1s step-end infinite" }}>:</span>
            {clock.m}<span style={{ opacity: 0.4, animation: "m-colon 1s step-end infinite" }}>:</span>
            {clock.s}
          </div>
          <div style={{
            fontSize: 11, textTransform: "uppercase", letterSpacing: "0.18em",
            color: "#7abfff", marginTop: 8,
            textShadow: "0 0 12px rgba(122,191,255,0.5)",
          }}>
            Время — твой главный актив
          </div>
        </div>

        {/* ── STATS GRID ───────────────────────────────────────── */}
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginTop: 22,
          transform: `translate(${px(-3)},${py(-2)})`,
          transition: "transform .25s ease-out",
        }}>
          {[
            { icon: "👥", label: "Граждан",  value: stats?.activeCitizens ?? "—",  color: "0,212,255" },
            { icon: "⏳", label: "Дарминов", value: stats ? Number(stats.totalMinutesCirculated).toFixed(0) : "—", color: "201,168,76" },
            { icon: "⚡", label: "Статус",   value: "LIVE", color: "0,255,136"  },
          ].map(s => (
            <div key={s.label} style={{
              background: `rgba(${s.color},0.07)`,
              border: `1px solid rgba(${s.color},0.28)`,
              borderRadius: 14, padding: "12px 8px", textAlign: "center",
              backdropFilter: "blur(8px)",
              boxShadow: `0 0 14px rgba(${s.color},0.12)`,
            }}>
              <div style={{ fontSize: 18, marginBottom: 4 }}>{s.icon}</div>
              <div style={{ fontSize: 17, fontWeight: 800, color: `rgb(${s.color})`, fontFamily: FONT_ORBITRON, textShadow: `0 0 12px rgba(${s.color},0.7)` }}>{s.value}</div>
              <div style={{ fontSize: 9, color: "#8080a0", letterSpacing: "0.06em", textTransform: "uppercase", marginTop: 3 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* ── HEADLINE ─────────────────────────────────────────── */}
        <div style={{
          textAlign: "center", padding: "28px 4px 4px",
          transform: `translate(${px(-5)},${py(-3)})`,
          transition: "transform .2s ease-out",
        }}>
          <h1 style={{ fontSize: "clamp(22px,6.5vw,34px)", fontWeight: 900, lineHeight: 1.18, margin: 0, fontFamily: FONT_ORBITRON }}>
            <span style={{ color: "#e8e8f4" }}>Создай </span>
            <span style={{
              background: "linear-gradient(135deg,#00d4ff,#a78bfa)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              filter: "drop-shadow(0 0 12px rgba(0,212,255,0.5))",
            }}>
              Капитал Смыслов
            </span>
          </h1>
          <p style={{
            color: "#c9a84c", fontFamily: FONT_EXO, fontSize: 12,
            letterSpacing: "0.16em", textTransform: "uppercase", marginTop: 10,
            textShadow: "0 0 14px rgba(201,168,76,0.5)",
          }}>
            ✦ &nbsp;Your Time. Your Empire.&nbsp; ✦
          </p>
        </div>

        {/* ── STORY CARDS (glassmorphism) ───────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 24 }}>
          {CARDS.map((card, i) => (
            <div
              key={i}
              onClick={() => setExpanded(p => p === i ? null : i)}
              style={{
                background: expanded === i ? "rgba(0,212,255,0.09)" : "rgba(4,8,30,0.65)",
                border: expanded === i ? "1px solid rgba(0,212,255,0.45)" : "1px solid rgba(255,255,255,0.08)",
                borderRadius: 16, padding: "16px 18px",
                cursor: "pointer", userSelect: "none",
                backdropFilter: "blur(16px)",
                transition: "all .22s",
                boxShadow: expanded === i ? "0 0 24px rgba(0,212,255,0.12),inset 0 0 16px rgba(0,212,255,0.04)" : "none",
                position: "relative", overflow: "hidden",
              }}
            >
              {expanded === i && (
                <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 2, background: "linear-gradient(180deg,#00d4ff,#7850ff,transparent)", borderRadius: "16px 0 0 16px" }} />
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: expanded === i ? 10 : 0 }}>
                <span style={{ fontSize: 22 }}>{card.icon}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#00d4ff", textShadow: "0 0 10px rgba(0,212,255,0.4)", flex: 1 }}>{card.title}</span>
                <span style={{ fontSize: 11, color: "#7850ff" }}>{expanded === i ? "↑" : "↓"}</span>
              </div>
              <div style={{
                fontSize: 13, color: "#8080a0", lineHeight: 1.65,
                overflow: "hidden",
                maxHeight: expanded === i ? "300px" : "0px",
                transition: "max-height .35s ease",
                whiteSpace: "pre-line",
              }}>
                {card.body}
              </div>
            </div>
          ))}
        </div>

        {/* ── QUICK MOMENTS ────────────────────────────────────── */}
        <div style={{
          background: "rgba(201,168,76,0.06)",
          border: "1px solid rgba(201,168,76,0.22)",
          borderRadius: 16, padding: "16px 18px", marginTop: 18,
          backdropFilter: "blur(12px)",
          boxShadow: "0 0 20px rgba(201,168,76,0.08)",
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#c9a84c", textAlign: "center", marginBottom: 12, letterSpacing: "0.12em", textTransform: "uppercase", textShadow: "0 0 12px rgba(201,168,76,0.5)" }}>
            ✦ &nbsp;Зафиксируй момент прямо сейчас
          </div>
          {MOMENTS.map((label, i) => (
            <MomentBtn key={i} label={label} onClick={() => navigate("/register")} />
          ))}
        </div>

        {/* ── CTA BUTTONS ──────────────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 22 }}>
          {/* Gold — passport */}
          <GlassBtn
            onClick={() => navigate("/register")}
            borderColor="rgba(201,168,76,0.7)"
            bgColor="rgba(201,168,76,0.10)"
            textColor="#f5cc6a"
            glow="rgba(201,168,76,0.45)"
            hoverGlow="rgba(201,168,76,0.8)"
          >
            ⚡&nbsp; ОФОРМИТЬ ПАСПОРТ
          </GlassBtn>

          {/* Blue — dashboard */}
          <GlassBtn
            onClick={() => navigate("/")}
            borderColor="rgba(0,212,255,0.5)"
            bgColor="rgba(0,212,255,0.07)"
            textColor="#00d4ff"
            glow="rgba(0,212,255,0.3)"
            hoverGlow="rgba(0,212,255,0.65)"
          >
            👑&nbsp; ВОЙТИ В КАБИНЕТ
          </GlassBtn>
        </div>

        {/* ── BOTTOM ROW: clock + activity ─────────────────────── */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: 32, gap: 12 }}>
          {/* Floating neon clock */}
          <div style={{ transform: `perspective(300px) rotateY(${clockTilt}deg) rotateX(${clockTilt * 0.3}deg)`, transition: "transform 1.2s ease-in-out" }}>
            <div style={{ fontSize: 8, letterSpacing: "0.18em", color: "#00d4ff", fontFamily: FONT_ORBITRON, opacity: 0.7, textTransform: "uppercase", marginBottom: 4 }}>Chronosphere</div>
            <div style={{ fontFamily: FONT_ORBITRON, fontSize: 22, fontWeight: 700, color: "#00d4ff", textShadow: "0 0 12px rgba(0,212,255,0.8),0 0 24px rgba(0,212,255,0.4)", letterSpacing: "0.1em", fontVariantNumeric: "tabular-nums" }}>
              {clock.h}:{clock.m}:{clock.s}
            </div>
            <div style={{ fontSize: 8, color: "#8080a0", letterSpacing: "0.12em", marginTop: 2 }}>UTC+0 · Live</div>
          </div>

          {/* Mini activity widget */}
          <div style={{
            background: "rgba(4,8,30,0.78)",
            border: "1px solid rgba(0,212,255,0.18)",
            borderRadius: 14, padding: "12px 14px",
            backdropFilter: "blur(16px)",
            boxShadow: "0 0 20px rgba(0,212,255,0.06)",
            minWidth: 150,
          }}>
            <div style={{ fontSize: 8, letterSpacing: "0.16em", color: "#00d4ff", fontFamily: FONT_ORBITRON, marginBottom: 8, textTransform: "uppercase", opacity: 0.8 }}>◉ Activity</div>
            {[
              { label: "Citizens",   value: stats?.activeCitizens ?? "—",                                             color: "#00ff88" },
              { label: "Darmīn",    value: stats ? Number(stats.totalMinutesCirculated).toFixed(0) : "—",             color: "#c9a84c" },
              { label: "Txns",      value: (stats as { totalTransactions?: number } | undefined)?.totalTransactions ?? "—", color: "#00d4ff" },
            ].map(r => (
              <div key={r.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                <span style={{ fontSize: 9, color: "#8080a0", fontFamily: FONT_EXO }}>{r.label}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: r.color, fontFamily: FONT_ORBITRON, textShadow: `0 0 8px ${r.color}80` }}>{String(r.value)}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ textAlign: "center", marginTop: 28, fontSize: 10, color: "#8080a0", letterSpacing: "0.06em" }}>
          © {new Date().getFullYear()} TimeNation · Цифровое государство будущего
        </div>
      </div>

      <style>{`
        @keyframes m-colon { 0%,49%{opacity:.4} 50%,100%{opacity:.08} }
        @keyframes m-led   { 0%,100%{opacity:1;box-shadow:0 0 4px currentColor} 50%{opacity:.3;box-shadow:none} }
        @keyframes m-pulse-gold { 0%,100%{box-shadow:0 0 18px rgba(201,168,76,.45)} 50%{box-shadow:0 0 36px rgba(201,168,76,.85),0 0 60px rgba(201,168,76,.3)} }
        @keyframes m-pulse-blue { 0%,100%{box-shadow:0 0 14px rgba(0,212,255,.35)} 50%{box-shadow:0 0 30px rgba(0,212,255,.75),0 0 50px rgba(0,212,255,.25)} }
        @keyframes flag-border-pulse {
          0%,100% { box-shadow:0 0 20px rgba(43,168,216,.40),0 0 44px rgba(43,168,216,.14),0 0 70px rgba(201,168,76,.12); }
          50%      { box-shadow:0 0 32px rgba(43,168,216,.70),0 0 60px rgba(43,168,216,.26),0 0 90px rgba(201,168,76,.24); }
        }
      `}</style>
    </div>
  );
}

/* ── tiny helpers used only in MobileHero ── */
function MiniStatusPill({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <div style={{ width: 5, height: 5, borderRadius: "50%", background: color, color, animation: "m-led 2s infinite" }} />
      <span style={{ fontSize: 9, color: "#8080a0", fontFamily: FONT_EXO, letterSpacing: "0.08em", textTransform: "uppercase" }}>{label}:&nbsp;</span>
      <span style={{ fontSize: 9, color, fontWeight: 700, letterSpacing: "0.08em", textShadow: `0 0 6px ${color}` }}>{value}</span>
    </div>
  );
}

function MomentBtn({ label, onClick }: { label: string; onClick: () => void }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      onTouchStart={() => setHov(true)} onTouchEnd={() => setHov(false)}
      style={{
        background: hov ? "rgba(0,212,255,0.12)" : "rgba(0,212,255,0.05)",
        border: `1px solid rgba(0,212,255,${hov ? 0.45 : 0.18})`,
        borderRadius: 10, padding: "10px 14px", fontSize: 12,
        color: "#e8e8f4", cursor: "pointer", textAlign: "left",
        width: "100%", fontFamily: FONT_EXO, display: "block",
        marginBottom: 7, backdropFilter: "blur(8px)",
        transition: "all .15s",
        boxShadow: hov ? "0 0 12px rgba(0,212,255,0.2)" : "none",
      }}
    >
      {label}
    </button>
  );
}

function GlassBtn({
  children, onClick, borderColor, bgColor, textColor, glow, hoverGlow,
}: {
  children: React.ReactNode; onClick: () => void;
  borderColor: string; bgColor: string; textColor: string; glow: string; hoverGlow: string;
}) {
  const [hov, setHov] = useState(false);
  const isGold = textColor === "#f5cc6a";
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      onTouchStart={() => setHov(true)} onTouchEnd={() => { setHov(false); onClick(); }}
      style={{
        width: "100%", padding: "15px 20px",
        borderRadius: 14,
        border: `1px solid ${borderColor}`,
        background: hov ? (isGold ? "rgba(201,168,76,0.18)" : "rgba(0,212,255,0.13)") : bgColor,
        color: textColor,
        fontSize: 13, fontWeight: 700,
        cursor: "pointer", fontFamily: FONT_ORBITRON,
        letterSpacing: "0.10em", textTransform: "uppercase",
        backdropFilter: "blur(12px)",
        transition: "all .18s",
        boxShadow: hov ? `0 0 30px ${hoverGlow},inset 0 0 20px rgba(255,255,255,0.03)` : `0 0 14px ${glow}`,
        animation: isGold ? "m-pulse-gold 2.8s ease-in-out infinite" : "m-pulse-blue 2.8s ease-in-out infinite",
        transform: hov ? "translateY(-1px)" : "none",
      }}
    >
      {children}
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   ROOT EXPORT
═══════════════════════════════════════════════════════════════════ */
export function Welcome() {
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    document.title = "TimeNation — Chronosphere";
    const mq = window.matchMedia("(min-width: 1024px)");
    setIsDesktop(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  if (!isDesktop) return <MobileHero />;

  return (
    <div style={{ minHeight: "100vh", background: "#02020f", color: "#e8e8f4", fontFamily: FONT_EXO, overflowX: "hidden" }}>
      <HyperspaceCanvas />
      <DesktopHero />
    </div>
  );
}
