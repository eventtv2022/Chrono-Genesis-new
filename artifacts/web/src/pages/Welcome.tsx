import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { useGetStats } from "@workspace/api-client-react";

/* ─────────────────────── helpers ─────────────────────── */
function pad2(n: number) { return String(n).padStart(2, "0"); }

/* ─────────────────────── Emblem image ─────────────────────── */
function Emblem({ size = 220, pulse = true }: { size?: number; pulse?: boolean }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        overflow: "hidden",
        flexShrink: 0,
        animation: pulse ? "tn-emblem-pulse 2.8s ease-in-out infinite" : undefined,
        filter: "drop-shadow(0 0 18px rgba(201,168,76,0.6)) drop-shadow(0 0 44px rgba(74,160,255,0.35))",
      }}
    >
      <img
        src="/web/emblem.jpg"
        alt="TimeNation Emblem"
        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        draggable={false}
      />
      <style>{`
        @keyframes tn-emblem-pulse {
          0%,100% { filter: drop-shadow(0 0 14px rgba(201,168,76,.5)) drop-shadow(0 0 30px rgba(74,160,255,.3)); }
          50%      { filter: drop-shadow(0 0 28px rgba(201,168,76,.95)) drop-shadow(0 0 56px rgba(74,160,255,.55)); }
        }
      `}</style>
    </div>
  );
}

/* ─────────────────────── Flag ─────────────────────── */
function Flag({ width = 280 }: { width?: number }) {
  const h = Math.round(width * 0.665);
  return (
    <div
      style={{
        width,
        height: h,
        borderRadius: 8,
        overflow: "hidden",
        boxShadow:
          "0 8px 48px rgba(0,0,0,0.65), 0 0 0 1.5px rgba(255,255,255,0.10), 0 0 40px rgba(74,160,255,0.15)",
        animation: "flag-wave 3.8s ease-in-out infinite",
        transformOrigin: "center center",
        flexShrink: 0,
      }}
    >
      <img
        src="/web/flag-flat.jpg"
        alt="TimeNation Flag"
        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        draggable={false}
      />
      <style>{`
        @keyframes flag-wave {
          0%,100% { transform: perspective(600px) rotateY(0deg)    skewY(0deg); }
          25%      { transform: perspective(600px) rotateY(1.5deg)  skewY(.5deg); }
          50%      { transform: perspective(600px) rotateY(-1deg)   skewY(-.4deg); }
          75%      { transform: perspective(600px) rotateY(.8deg)   skewY(.3deg); }
        }
      `}</style>
    </div>
  );
}

/* ─────────────────────── Particle canvas ─────────────────────── */
function StarField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let W = 0, H = 0;

    interface Particle { x: number; y: number; r: number; vx: number; vy: number; a: number; va: number; }
    let particles: Particle[] = [];

    const resize = () => {
      W = canvas.width  = window.innerWidth;
      H = canvas.height = window.innerHeight;
      particles = Array.from({ length: 140 }, () => ({
        x:  Math.random() * W,
        y:  Math.random() * H,
        r:  Math.random() * 1.4 + 0.3,
        vx: (Math.random() - 0.5) * 0.18,
        vy: (Math.random() - 0.5) * 0.18,
        a:  Math.random(),
        va: (Math.random() - 0.5) * 0.008,
      }));
    };

    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      for (const p of particles) {
        p.x  = (p.x + p.vx + W) % W;
        p.y  = (p.y + p.vy + H) % H;
        p.a  = Math.max(0.05, Math.min(1, p.a + p.va));
        if (p.a <= 0.06 || p.a >= 0.99) p.va *= -1;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(200,190,255,${p.a * 0.75})`;
        ctx.fill();
      }

      // Subtle nebula blobs
      const nb = [
        { x: W * 0.15, y: H * 0.3,  c: "58,120,220", r: W * 0.22 },
        { x: W * 0.82, y: H * 0.65, c: "201,168,76",  r: W * 0.18 },
        { x: W * 0.5,  y: H * 0.1,  c: "100,60,180",  r: W * 0.28 },
      ];
      for (const n of nb) {
        const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r);
        g.addColorStop(0,   `rgba(${n.c},0.06)`);
        g.addColorStop(1,   `rgba(${n.c},0)`);
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fillStyle = g;
        ctx.fill();
      }

      animId = requestAnimationFrame(draw);
    };

    resize();
    draw();
    window.addEventListener("resize", resize);
    return () => { cancelAnimationFrame(animId); window.removeEventListener("resize", resize); };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" }}
    />
  );
}

/* ─────────────────────── Stat card ─────────────────────── */
function StatCard({ icon, label, value, sub }: { icon: string; label: string; value: string | number; sub?: string }) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: hov ? "rgba(30,30,60,0.85)" : "rgba(18,16,42,0.75)",
        border: hov ? "1px solid rgba(201,168,76,0.55)" : "1px solid rgba(255,255,255,0.09)",
        borderRadius: 18,
        padding: "22px 26px",
        transition: "all .22s",
        backdropFilter: "blur(12px)",
        boxShadow: hov ? "0 0 28px rgba(201,168,76,0.18), inset 0 0 20px rgba(201,168,76,0.04)" : "0 4px 24px rgba(0,0,0,0.3)",
        cursor: "default",
        minWidth: 160,
        flex: 1,
      }}
    >
      <div style={{ fontSize: 26, marginBottom: 6 }}>{icon}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: "#c9a84c", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
        {value}
      </div>
      <div style={{ fontSize: 12, color: "#8080a0", marginTop: 5, letterSpacing: "0.04em", textTransform: "uppercase" }}>
        {label}
      </div>
      {sub && (
        <div style={{ fontSize: 11, color: "#4ec94e", marginTop: 4, fontWeight: 600 }}>{sub}</div>
      )}
    </div>
  );
}

/* ─────────────────────── CTA button ─────────────────────── */
function CtaButton({
  children,
  onClick,
  primary = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  primary?: boolean;
}) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        padding: "14px 28px",
        borderRadius: 14,
        fontSize: 14,
        fontWeight: 700,
        fontFamily: "inherit",
        cursor: "pointer",
        transition: "all .18s",
        letterSpacing: "0.01em",
        ...(primary
          ? {
              background: hov
                ? "linear-gradient(135deg,#ffe082 0%,#c9a84c 60%,#f5cc6a 100%)"
                : "linear-gradient(135deg,#c9a84c 0%,#e8c870 60%,#c9a84c 100%)",
              border: "none",
              color: "#0f0f1a",
              boxShadow: hov
                ? "0 6px 36px rgba(201,168,76,0.65), 0 0 60px rgba(201,168,76,0.25)"
                : "0 4px 20px rgba(201,168,76,0.4)",
              transform: hov ? "translateY(-2px)" : "none",
            }
          : {
              background: hov ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.04)",
              border: hov ? "1px solid rgba(255,255,255,0.28)" : "1px solid rgba(255,255,255,0.12)",
              color: "#e8e8f4",
              transform: hov ? "translateY(-1px)" : "none",
            }),
      }}
    >
      {children}
    </button>
  );
}

/* ─────────────────────── DESKTOP HERO ─────────────────────── */
function DesktopHero() {
  const [, navigate] = useLocation();
  const { data: stats } = useGetStats();
  const [clock, setClock] = useState("00:00:00");
  const [mouse, setMouse] = useState({ x: 0, y: 0 });
  const heroRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const tick = () => {
      const n = new Date();
      setClock(`${pad2(n.getHours())}:${pad2(n.getMinutes())}:${pad2(n.getSeconds())}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const rect = heroRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = ((e.clientX - rect.left) / rect.width  - 0.5) * 2;
    const y = ((e.clientY - rect.top)  / rect.height - 0.5) * 2;
    setMouse({ x, y });
  }, []);

  const px = (factor: number) => `${mouse.x * factor}px`;
  const py = (factor: number) => `${mouse.y * factor}px`;

  return (
    <div
      ref={heroRef}
      onMouseMove={handleMouseMove}
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 60px",
        position: "relative",
        zIndex: 1,
        gap: 0,
      }}
    >
      {/* ── Top bar ── */}
      <div
        style={{
          position: "absolute",
          top: 28,
          left: 0,
          right: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 60px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: "#c9a84c", letterSpacing: "0.05em" }}>TIMENATION</span>
          <span
            style={{
              fontSize: 10,
              color: "#8080a0",
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.09)",
              borderRadius: 5,
              padding: "2px 8px",
              letterSpacing: "0.10em",
              textTransform: "uppercase",
            }}
          >
            Digital State
          </span>
        </div>
        <div
          style={{
            fontFamily: "'Space Mono', monospace",
            fontSize: 18,
            fontWeight: 700,
            color: "#c9a84c",
            textShadow: "0 0 20px rgba(201,168,76,0.6)",
            letterSpacing: "0.08em",
          }}
        >
          {clock}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#4ec94e", boxShadow: "0 0 8px #4ec94e", animation: "tn-blink 2s infinite" }} />
          <span style={{ fontSize: 11, color: "#4ec94e", letterSpacing: "0.08em", fontWeight: 600, textTransform: "uppercase" }}>Chronosphere Online</span>
        </div>
      </div>

      {/* ── Main content grid ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto 1fr",
          gap: 60,
          alignItems: "center",
          width: "100%",
          maxWidth: 1280,
          paddingTop: 20,
        }}
      >
        {/* LEFT — headline + stats + CTAs */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 32,
            transform: `translate(${px(-8)}, ${py(-5)})`,
            transition: "transform .12s ease-out",
          }}
        >
          {/* Headline */}
          <div>
            <div
              style={{
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: "0.16em",
                color: "#6c63ff",
                fontWeight: 600,
                marginBottom: 14,
              }}
            >
              ✦ Добро пожаловать в Цифровое Государство
            </div>
            <h1
              style={{
                margin: 0,
                fontSize: "clamp(32px, 3.2vw, 52px)",
                fontWeight: 900,
                lineHeight: 1.12,
                background: "linear-gradient(135deg, #ffffff 0%, #c9a84c 55%, #ffe082 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              WELCOME,<br />TEMPORAL CITIZEN
            </h1>
            <div
              style={{
                marginTop: 16,
                fontSize: "clamp(14px, 1.2vw, 17px)",
                color: "#a0a0c4",
                lineHeight: 1.65,
                maxWidth: 440,
              }}
            >
              Цифровое Государство Времени.<br />
              <span style={{ color: "#c9a84c", fontWeight: 600 }}>Твоё Время. Твоя Империя.</span>
            </div>
          </div>

          {/* Stats */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
            <StatCard
              icon="👥"
              label="Active Citizens"
              value={stats?.activeCitizens ?? "—"}
            />
            <StatCard
              icon="⏳"
              label="Darmīn in Circulation"
              value={stats ? Number(stats.totalMinutesCirculated).toFixed(0) : "—"}
            />
            <StatCard
              icon="⚡"
              label="Chronosphere"
              value="LIVE"
              sub="● ONLINE"
            />
          </div>

          {/* CTA buttons */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <CtaButton primary onClick={() => navigate("/")}>
              👑 Личный кабинет / Паспорт
            </CtaButton>
            <CtaButton onClick={() => window.open("https://issuu.com/timenation2025/docs/_timenatio", "_blank")}>
              📜 Конституция
            </CtaButton>
            <CtaButton onClick={() => navigate("/register")}>
              🚀 Присоединиться к DAO
            </CtaButton>
          </div>
        </div>

        {/* CENTER — Emblem */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 24,
            transform: `translate(${px(-4)}, ${py(-3)})`,
            transition: "transform .16s ease-out",
          }}
        >
          {/* Outer glow rings */}
          <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div
              style={{
                position: "absolute",
                width: 300,
                height: 300,
                borderRadius: "50%",
                background: "radial-gradient(circle, rgba(201,168,76,0.12) 0%, transparent 70%)",
                animation: "tn-glow-ring 4s ease-in-out infinite",
              }}
            />
            <div
              style={{
                position: "absolute",
                width: 260,
                height: 260,
                borderRadius: "50%",
                border: "1px solid rgba(201,168,76,0.15)",
                animation: "tn-spin-slow 24s linear infinite",
              }}
            />
            <Emblem size={220} pulse />
          </div>

          {/* Tagline below emblem */}
          <div
            style={{
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: "0.18em",
              color: "#8080a0",
              textAlign: "center",
            }}
          >
            Tempus · Aeternitas · Dignitas
          </div>
        </div>

        {/* RIGHT — Flag + description */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            gap: 28,
            transform: `translate(${px(8)}, ${py(-5)})`,
            transition: "transform .12s ease-out",
          }}
        >
          {/* Flag */}
          <div
            style={{
              transform: `perspective(800px) rotateY(${mouse.x * -6}deg) rotateX(${mouse.y * 3}deg)`,
              transition: "transform .15s ease-out",
            }}
          >
            <Flag width={260} />
          </div>

          {/* Description bullets */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {[
              { icon: "🕰", title: "Хронос-Консоль", text: "Пульс экономики в реальном времени" },
              { icon: "🪙", title: "Дармин (Д)", text: "Валюта нации — каждый дармин стоит минуты" },
              { icon: "📜", title: "Паспорт Гражданина", text: "Эмиссия открыта — оформи свой документ" },
              { icon: "🗳", title: "DAO & Голосование", text: "Участвуй в управлении государством" },
            ].map(item => (
              <div key={item.title} style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                <div style={{ fontSize: 20, lineHeight: 1.3 }}>{item.icon}</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#e8e8f4" }}>{item.title}</div>
                  <div style={{ fontSize: 12, color: "#8080a0", marginTop: 2 }}>{item.text}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Bottom scroll hint ── */}
      <div
        style={{
          position: "absolute",
          bottom: 28,
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 6,
          opacity: 0.45,
        }}
      >
        <div style={{ fontSize: 11, letterSpacing: "0.10em", color: "#8080a0", textTransform: "uppercase" }}>
          Scroll to explore
        </div>
        <div style={{ width: 1, height: 28, background: "linear-gradient(to bottom, #8080a0, transparent)", animation: "tn-scroll-arrow 1.8s ease-in-out infinite" }} />
      </div>

      {/* ── Global keyframes ── */}
      <style>{`
        @keyframes tn-blink {
          0%,100% { opacity:1; } 50% { opacity:.35; }
        }
        @keyframes tn-glow-ring {
          0%,100% { transform:scale(1);   opacity:.7; }
          50%      { transform:scale(1.08); opacity:1; }
        }
        @keyframes tn-spin-slow {
          from { transform:rotate(0deg); }
          to   { transform:rotate(360deg); }
        }
        @keyframes tn-scroll-arrow {
          0%,100% { transform:scaleY(1) translateY(0); opacity:.45; }
          50%      { transform:scaleY(1.3) translateY(4px); opacity:.8; }
        }
      `}</style>
    </div>
  );
}

/* ─────────────────────── MOBILE HERO (compact) ─────────────────────── */
function MobileHero() {
  const [, navigate] = useLocation();
  const { data: stats } = useGetStats();
  const [clock, setClock] = useState("00:00:00");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [hoveredMoment, setHoveredMoment] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => {
      const n = new Date();
      setClock(`${pad2(n.getHours())}:${pad2(n.getMinutes())}:${pad2(n.getSeconds())}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const CARDS = [
    {
      icon: "🛑",
      title: "Борьба с «цифровым мусором»",
      body: "В твоём телефоне лежат тысячи случайных скриншотов и расфокусированных видео, которые умрут на жёстком диске. В TimeNation ты не сливаешь контент, а создаёшь цифровой капитал смыслов.\n\nЗафиксировать 1 минуту в Хронопедии — это как поставить несгораемую точку: «Вот здесь произошёл момент, который сформировал меня».",
    },
    {
      icon: "🗺",
      title: "Топография жизни (Время + Место + Значимое)",
      body: "Обычные соцсети дают плоскую ленту: пролистал и забыл. Хронопедия даёт 3D-картину твоей судьбы.\n\nЧерез 5 или 10 лет ты увидишь не просто «какие-то фото за 2026 год», а точную карту вех: какие решения, эмоции и смыслы происходили с тобой и твоей семьёй в конкретных точках планеты.",
    },
    {
      icon: "🌉",
      title: "Межпоколенческий мост (Наследие)",
      body: "Представь, если бы ты мог открыть Хронопедию и услышать живой голос, мысли и эмоции своего прадеда.\n\nTimeNation гарантирует, что твоя личная история не растворится в цифровом шуме, а останется живым наследием для будущих поколений.",
    },
  ] as const;

  const QUICK_MOMENTS = [
    "💡 Зафиксировать решение, которое изменило мой день",
    "⏳ Записать мысль или эмоцию себе в будущее",
    "✨ Запечатлеть знание этого момента",
  ] as const;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(180deg,#0f0f1a 0%,#12102a 50%,#0f0f1a 100%)",
        color: "#e8e8f4",
        fontFamily: "'Space Grotesk','Segoe UI',sans-serif",
        overflowX: "hidden",
      }}
    >
      <div style={{ maxWidth: 680, margin: "0 auto", padding: "0 20px 60px" }}>
        {/* Header */}
        <div style={{ textAlign: "center", paddingTop: 48, paddingBottom: 8 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 24 }}>
            <span style={{ fontSize: 20, fontWeight: 800, color: "#c9a84c", letterSpacing: "0.03em" }}>TimeNation</span>
            <span style={{ fontSize: 11, color: "#8080a0", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6, padding: "2px 8px", letterSpacing: "0.06em", textTransform: "uppercase" }}>
              Цифровое государство
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
            <Emblem size={120} />
          </div>
          <div style={{ fontSize: "clamp(36px,10vw,56px)", fontWeight: 700, letterSpacing: "0.1em", fontVariantNumeric: "tabular-nums", fontFamily: "'Space Mono','Courier New',monospace", color: "#c9a84c", textShadow: "0 0 40px rgba(201,168,76,.55)", lineHeight: 1 }}>
            {clock}
          </div>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.14em", color: "#8080a0", marginTop: 10 }}>
            Время — твой главный актив
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: "flex", gap: 10, marginTop: 28, flexWrap: "wrap" }}>
          <StatCard icon="👥" label="Граждан" value={stats?.activeCitizens ?? "—"} />
          <StatCard icon="⏳" label="Дарминов" value={stats ? Number(stats.totalMinutesCirculated).toFixed(0) : "—"} />
          <StatCard icon="⚡" label="Статус" value="LIVE" sub="● ONLINE" />
        </div>

        {/* Headline */}
        <div style={{ textAlign: "center", padding: "36px 8px 8px" }}>
          <h1 style={{ fontSize: "clamp(20px,5vw,32px)", fontWeight: 800, lineHeight: 1.2, margin: 0 }}>
            Перестань сливать время{" "}
            <span style={{ color: "#8080a0", textDecoration: "line-through", textDecorationColor: "rgba(239,68,68,0.5)" }}>в цифровой шум</span>.{" "}
            <span style={{ color: "#c9a84c", textShadow: "0 0 30px rgba(201,168,76,0.4)" }}>Начни создавать Капитал Смыслов.</span>
          </h1>
        </div>

        {/* Story cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 32 }}>
          {CARDS.map((card, i) => (
            <div
              key={i}
              onClick={() => setExpanded(p => p === i ? null : i)}
              style={{
                background: "#1a1a2e",
                border: expanded === i ? "1px solid rgba(201,168,76,0.5)" : "1px solid rgba(255,255,255,0.07)",
                borderRadius: 18,
                padding: "18px 20px",
                cursor: "pointer",
                userSelect: "none",
                transition: "border-color .2s,box-shadow .2s,transform .15s",
                boxShadow: expanded === i ? "0 0 30px rgba(201,168,76,0.1)" : "none",
                transform: expanded === i ? "scale(1.005)" : "scale(1)",
                position: "relative",
                overflow: "hidden",
              }}
            >
              {expanded === i && (
                <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: "linear-gradient(180deg,#c9a84c,transparent)", borderRadius: "18px 0 0 18px" }} />
              )}
              <div style={{ fontSize: 26, marginBottom: 8 }}>{card.icon}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#c9a84c", marginBottom: 8 }}>{card.title}</div>
              <div style={{ fontSize: 14, color: "#8080a0", lineHeight: 1.65, overflow: "hidden", maxHeight: expanded === i ? "500px" : "48px", transition: "max-height .35s ease", whiteSpace: "pre-line" }}>
                {card.body}
              </div>
              <div style={{ fontSize: 12, color: "#6c63ff", marginTop: 8 }}>{expanded === i ? "Свернуть ↑" : "Читать далее ↓"}</div>
            </div>
          ))}
        </div>

        {/* Quick moments */}
        <div style={{ background: "#1a1a2e", border: "1px solid rgba(201,168,76,0.22)", borderRadius: 18, padding: 20, marginTop: 28 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#c9a84c", textAlign: "center", marginBottom: 14, letterSpacing: "0.02em" }}>
            ✨ Зафиксируй момент прямо сейчас
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {QUICK_MOMENTS.map((label, i) => (
              <button
                key={i}
                onClick={() => navigate("/register")}
                onMouseEnter={() => setHoveredMoment(i)}
                onMouseLeave={() => setHoveredMoment(null)}
                style={{
                  background: hoveredMoment === i ? "rgba(108,99,255,0.18)" : "rgba(108,99,255,0.08)",
                  border: hoveredMoment === i ? "1px solid #6c63ff" : "1px solid rgba(108,99,255,0.18)",
                  borderRadius: 12,
                  padding: "11px 16px",
                  fontSize: 13,
                  color: "#e8e8f4",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "background .15s,border-color .15s",
                  width: "100%",
                  fontFamily: "inherit",
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* CTAs */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 32 }}>
          <button
            onClick={() => navigate("/register")}
            style={{
              width: "100%", padding: "16px 24px", borderRadius: 18, border: "none",
              background: "linear-gradient(135deg,#c9a84c 0%,#e8c870 60%,#c9a84c 100%)",
              color: "#0f0f1a", fontSize: 15, fontWeight: 700, cursor: "pointer",
              fontFamily: "inherit", letterSpacing: "0.01em",
              boxShadow: "0 4px 24px rgba(201,168,76,0.4),0 0 40px rgba(201,168,76,0.15)",
            }}
          >
            ⏳ Оформить Паспорт Гражданина
          </button>
          <button
            onClick={() => navigate("/timeline")}
            style={{
              width: "100%", padding: "14px 24px", borderRadius: 18,
              background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.11)",
              color: "#e8e8f4", fontSize: 14, fontWeight: 500, cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            👁 Войти как Гость и исследовать Хронопедию
          </button>
        </div>

        <div style={{ textAlign: "center", marginTop: 40, fontSize: 12, color: "#8080a0", letterSpacing: "0.04em" }}>
          © {new Date().getFullYear()} TimeNation · Цифровое государство будущего
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────── ROOT ─────────────────────── */
export function Welcome() {
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    document.title = "TimeNation — Цифровое Государство";
    const mq = window.matchMedia("(min-width: 1024px)");
    setIsDesktop(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  if (!isDesktop) return <MobileHero />;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(160deg, #06081a 0%, #0e1030 40%, #0a0c22 70%, #060818 100%)",
        color: "#e8e8f4",
        fontFamily: "'Space Grotesk','Segoe UI',sans-serif",
        overflowX: "hidden",
      }}
    >
      <StarField />
      <DesktopHero />
    </div>
  );
}
