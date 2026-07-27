import { useState, useEffect } from "react";
import { useLocation } from "wouter";

const CARDS = [
  {
    icon: "🛑",
    title: "Борьба с «цифровым мусором»",
    body: "В твоём телефоне лежат тысячи случайных скриншотов и расфокусированных видео, которые умрут на жёстком диске. В TimeNation ты не сливаешь контент, а создаёшь цифровой капитал смыслов.\n\nЗафиксировать 1 минуту в Хронопедии — это как поставить несгораемую точку: «Вот здесь произошёл момент, который сформировал меня». Здесь ценность определяется не лайками, а значимостью.",
  },
  {
    icon: "🗺",
    title: "Топография жизни (Время + Место + Значимое)",
    body: "Обычные соцсети дают плоскую ленту: пролистал и забыл. Хронопедия даёт 3D-картину твоей судьбы.\n\nЧерез 5 или 10 лет ты увидишь не просто «какие-то фото за 2026 год», а точную карту вех: какие решения, эмоции и смыслы происходили с тобой и твоей семьёй в конкретных точках планеты.",
  },
  {
    icon: "🌉",
    title: "Межпоколенческий мост (Наследие)",
    body: "Представь, если бы ты мог открыть Хронопедию и услышать живой голос, мысли и эмоции своего прадеда, зафиксированные им в том же возрасте, что и ты сейчас.\n\nTimeNation гарантирует, что твоя личная история не растворится в цифровом шуме, а останется живым наследием для будущих поколений.",
  },
] as const;

const QUICK_MOMENTS = [
  "💡 Зафиксировать решение, которое изменило мой день",
  "⏳ Записать мысль или эмоцию себе в будущее",
  "✨ Запечатлеть знание этого момента",
] as const;

export function Welcome() {
  const [, navigate] = useLocation();
  const [clock, setClock] = useState("00:00:00");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [hoveredMoment, setHoveredMoment] = useState<number | null>(null);

  useEffect(() => {
    document.title = "TimeNation — Капитал Смыслов";
    const tick = () => {
      const n = new Date();
      setClock(
        `${String(n.getHours()).padStart(2, "0")}:${String(n.getMinutes()).padStart(2, "0")}:${String(n.getSeconds()).padStart(2, "0")}`,
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const toggleCard = (i: number) => setExpanded(prev => (prev === i ? null : i));

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(180deg, #0f0f1a 0%, #12102a 50%, #0f0f1a 100%)",
        color: "#e8e8f4",
        fontFamily: "'Space Grotesk', 'Segoe UI', sans-serif",
        overflowX: "hidden",
      }}
    >
      {/* Ambient glow */}
      <div
        aria-hidden
        style={{
          position: "fixed",
          top: -200,
          left: "50%",
          transform: "translateX(-50%)",
          width: 600,
          height: 400,
          borderRadius: "50%",
          background: "radial-gradient(ellipse, rgba(201,168,76,0.08) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />

      <div style={{ maxWidth: 680, margin: "0 auto", padding: "0 20px 60px" }}>

        {/* ── Header / Clock ── */}
        <div style={{ textAlign: "center", paddingTop: 48, paddingBottom: 8 }}>
          {/* Brand */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 28 }}>
            <span style={{ fontSize: 20, fontWeight: 800, color: "#c9a84c", letterSpacing: "0.03em" }}>
              TimeNation
            </span>
            <span
              style={{
                fontSize: 11,
                color: "#8080a0",
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 6,
                padding: "2px 8px",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}
            >
              Цифровое государство
            </span>
          </div>

          {/* Live clock */}
          <div
            style={{
              fontSize: "clamp(40px, 10vw, 64px)",
              fontWeight: 700,
              letterSpacing: "0.1em",
              fontVariantNumeric: "tabular-nums",
              fontFamily: "'Space Mono', 'Courier New', monospace",
              color: "#c9a84c",
              textShadow: "0 0 40px rgba(201,168,76,0.55), 0 0 80px rgba(201,168,76,0.2)",
              lineHeight: 1,
            }}
          >
            {clock}
          </div>
          <div
            style={{
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: "0.14em",
              color: "#8080a0",
              marginTop: 10,
            }}
          >
            Время — твой главный актив
          </div>
        </div>

        {/* ── Headline ── */}
        <div style={{ textAlign: "center", padding: "40px 8px 8px" }}>
          <h1
            style={{
              fontSize: "clamp(22px, 5vw, 36px)",
              fontWeight: 800,
              lineHeight: 1.2,
              margin: 0,
            }}
          >
            Перестань сливать время{" "}
            <span style={{ color: "#8080a0", textDecoration: "line-through", textDecorationColor: "rgba(239,68,68,0.5)" }}>
              в цифровой шум
            </span>
            .{" "}
            <span
              style={{
                color: "#c9a84c",
                textShadow: "0 0 30px rgba(201,168,76,0.4)",
              }}
            >
              Начни создавать Капитал Смыслов.
            </span>
          </h1>
        </div>

        {/* ── Story cards ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 36 }}>
          {CARDS.map((card, i) => (
            <div
              key={i}
              onClick={() => toggleCard(i)}
              style={{
                background: "#1a1a2e",
                border: expanded === i
                  ? "1px solid rgba(201,168,76,0.5)"
                  : "1px solid rgba(255,255,255,0.07)",
                borderRadius: 18,
                padding: "18px 20px",
                cursor: "pointer",
                userSelect: "none",
                transition: "border-color .2s, box-shadow .2s, transform .15s",
                boxShadow: expanded === i ? "0 0 30px rgba(201,168,76,0.1)" : "none",
                transform: expanded === i ? "scale(1.005)" : "scale(1)",
                position: "relative",
                overflow: "hidden",
              }}
            >
              {/* Gold accent bar */}
              {expanded === i && (
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: 3,
                    background: "linear-gradient(180deg, #c9a84c, transparent)",
                    borderRadius: "18px 0 0 18px",
                  }}
                />
              )}
              <div style={{ fontSize: 26, marginBottom: 8 }}>{card.icon}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#c9a84c", marginBottom: 8 }}>
                {card.title}
              </div>
              <div
                style={{
                  fontSize: 14,
                  color: "#8080a0",
                  lineHeight: 1.65,
                  overflow: "hidden",
                  maxHeight: expanded === i ? "500px" : "48px",
                  transition: "max-height .35s ease",
                  whiteSpace: "pre-line",
                }}
              >
                {card.body}
              </div>
              <div style={{ fontSize: 12, color: "#6c63ff", marginTop: 8 }}>
                {expanded === i ? "Свернуть ↑" : "Читать далее ↓"}
              </div>
            </div>
          ))}
        </div>

        {/* ── Quick moment block ── */}
        <div
          style={{
            background: "#1a1a2e",
            border: "1px solid rgba(201,168,76,0.22)",
            borderRadius: 18,
            padding: 20,
            marginTop: 28,
          }}
        >
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: "#c9a84c",
              textAlign: "center",
              marginBottom: 14,
              letterSpacing: "0.02em",
            }}
          >
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
                  transition: "background .15s, border-color .15s",
                  width: "100%",
                  fontFamily: "inherit",
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* ── CTAs ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 32 }}>
          <button
            onClick={() => navigate("/register")}
            style={{
              width: "100%",
              padding: "16px 24px",
              borderRadius: 18,
              border: "none",
              background: "linear-gradient(135deg, #c9a84c 0%, #e8c870 60%, #c9a84c 100%)",
              color: "#0f0f1a",
              fontSize: 15,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "inherit",
              letterSpacing: "0.01em",
              boxShadow: "0 4px 24px rgba(201,168,76,0.4), 0 0 40px rgba(201,168,76,0.15)",
              transition: "box-shadow .2s, transform .15s",
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-1px)";
              (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 8px 32px rgba(201,168,76,0.5), 0 0 60px rgba(201,168,76,0.2)";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)";
              (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 4px 24px rgba(201,168,76,0.4), 0 0 40px rgba(201,168,76,0.15)";
            }}
          >
            ⏳ Оформить Паспорт Гражданина (Эмиссия)
          </button>

          <button
            onClick={() => navigate("/timeline")}
            style={{
              width: "100%",
              padding: "14px 24px",
              borderRadius: 18,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.11)",
              color: "#e8e8f4",
              fontSize: 14,
              fontWeight: 500,
              cursor: "pointer",
              fontFamily: "inherit",
              transition: "background .15s, border-color .15s",
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.07)";
              (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.2)";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.04)";
              (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.11)";
            }}
          >
            👁 Войти как Гость и исследовать Хронопедию
          </button>
        </div>

        {/* ── Footer ── */}
        <div
          style={{
            textAlign: "center",
            marginTop: 40,
            fontSize: 12,
            color: "#8080a0",
            letterSpacing: "0.04em",
          }}
        >
          © {new Date().getFullYear()} TimeNation · Цифровое государство будущего
        </div>

      </div>
    </div>
  );
}
