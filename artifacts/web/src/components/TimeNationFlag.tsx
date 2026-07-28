/**
 * TimeNation 3D Waving Flag — Canvas cloth simulation
 *
 * Renders the official tricolor flag (white / cyan / navy) with a
 * canvas-based sinusoidal cloth wave using vertical-column drawImage
 * slices.  The emblem (indigo circle, 12 gold stars, ∞) is baked into
 * the offscreen texture so it waves naturally with the fabric.
 *
 * Key rendering fixes:
 *  – Each destination slice is (SLICE_W+1)px wide to eliminate sub-pixel
 *    gaps between columns.
 *  – Canvas receives a base-fill on every frame so transparent edges
 *    never bleed through when the wave shifts slices vertically.
 *  – A mild shading pass (lighten / darken alternate crests) gives the
 *    impression of 3-D folds without an expensive per-pixel loop.
 */
import { useRef, useEffect } from "react";

interface Props {
  width?: number;   // display width  (default 420)
  height?: number;  // display height (default 280)
  showPole?: boolean;
  className?: string;
}

export function TimeNationFlag({
  width = 420,
  height = 280,
  showPole = true,
  className,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width  = width  * dpr;
    canvas.height = height * dpr;
    canvas.style.width  = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    /* ─── Layout constants ──────────────────────────────────── */
    const FW   = width;
    const FH   = height;
    const SH   = FH / 3;          // single stripe height
    const ER   = FH * 0.195;      // emblem radius
    const EX   = FW * 0.5;
    const EY   = FH * 0.5;

    /* ─── Wave parameters ───────────────────────────────────── */
    const AMP   = FH * 0.042;   // max vertical displacement at free edge
    const FREQ  = 2.6;          // wave crests across the flag width
    const SPEED = 0.50;         // cycles per second
    const SW    = 2;            // column slice width (destination px)

    /* ─── Offscreen: static flag texture ─────────────────────
       Extra vertical padding = AMP*2 so slices never crop when
       shifted down by the wave.                               */
    const PAD = Math.ceil(AMP) + 2;
    const offH = FH + PAD * 2;
    const off  = document.createElement("canvas");
    off.width  = Math.ceil(FW  * dpr);
    off.height = Math.ceil(offH * dpr);
    const oc = off.getContext("2d")!;
    oc.scale(dpr, dpr);

    const DY = PAD; // vertical offset: "real" flag top is at DY in offscreen

    /* ── Stripe colours ── */
    const stripes = [
      { color: "#edf2ff", y: DY },
      { color: "#2ba8d8", y: DY + SH },
      { color: "#0c1b44", y: DY + SH * 2 },
    ];
    stripes.forEach(({ color, y }) => {
      oc.fillStyle = color;
      oc.fillRect(0, y, FW, SH + 0.5); // +0.5 prevents hairline between stripes
    });

    /* ── Fabric shading (top-light gradient) ── */
    const shade = oc.createLinearGradient(0, DY, 0, DY + FH);
    shade.addColorStop(0,   "rgba(255,255,255,0.10)");
    shade.addColorStop(0.4, "rgba(255,255,255,0.03)");
    shade.addColorStop(1,   "rgba(0,0,0,0.14)");
    oc.fillStyle = shade;
    oc.fillRect(0, DY, FW, FH);

    /* ── Left-edge fade (attached to pole → no wave at x=0) ── */
    const edgeFade = oc.createLinearGradient(0, 0, FW * 0.12, 0);
    edgeFade.addColorStop(0, "rgba(0,0,0,0.08)");
    edgeFade.addColorStop(1, "rgba(0,0,0,0)");
    oc.fillStyle = edgeFade;
    oc.fillRect(0, DY, FW * 0.14, FH);

    /* ── Emblem: indigo circle ── */
    oc.save();
    oc.shadowBlur  = 20;
    oc.shadowColor = "rgba(90,60,220,0.65)";
    oc.beginPath();
    oc.arc(EX, DY + EY, ER, 0, Math.PI * 2);
    oc.fillStyle = "#2a1a96";
    oc.fill();
    oc.strokeStyle = "#c9a84c";
    oc.lineWidth   = 2.4;
    oc.stroke();
    oc.restore();

    /* ── Inner concentric ring ── */
    oc.beginPath();
    oc.arc(EX, DY + EY, ER * 0.80, 0, Math.PI * 2);
    oc.strokeStyle = "rgba(201,168,76,0.35)";
    oc.lineWidth   = 1;
    oc.stroke();

    /* ── 12 gold stars ── */
    const STAR_RING = ER * 0.70;
    const STAR_SZ   = ER * 0.112;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
      drawStar(oc, EX + Math.cos(a) * STAR_RING, DY + EY + Math.sin(a) * STAR_RING, STAR_SZ, 5, 0.44);
    }

    /* ── Infinity ∞ ── */
    const fs = ER * 0.70;
    oc.save();
    oc.font          = `900 ${fs}px "Orbitron","Space Mono",monospace`;
    oc.textAlign     = "center";
    oc.textBaseline  = "middle";
    oc.shadowBlur    = 12;
    oc.shadowColor   = "rgba(245,204,90,0.9)";
    oc.fillStyle     = "#f5cc5a";
    oc.fillText("∞", EX, DY + EY + fs * 0.07);
    oc.restore();

    /* ── Emblem outer glow (stroke-only trick) ── */
    oc.save();
    oc.beginPath();
    oc.arc(EX, DY + EY, ER + 2, 0, Math.PI * 2);
    oc.strokeStyle = "rgba(201,168,76,0.0)";
    oc.lineWidth   = 1;
    oc.shadowBlur  = 26;
    oc.shadowColor = "rgba(201,168,76,0.65)";
    oc.stroke();
    oc.restore();

    /* ─── Animation loop ────────────────────────────────────── */
    let raf = 0;
    let t0  = -1;

    const draw = (ts: number) => {
      if (t0 < 0) t0 = ts;
      const t = (ts - t0) / 1000;

      /* Base fill — covers canvas when slices don't reach top/bottom */
      ctx.fillStyle = "#0c1b44";  // bottom stripe colour (least jarring)
      ctx.fillRect(0, 0, FW, FH);

      /* Column-slice wave pass */
      for (let x = 0; x < FW; x += SW) {
        const prog  = x / FW;                                           // 0 at pole, 1 at free end
        const phase = prog * FREQ * Math.PI * 2 - t * SPEED * Math.PI * 2;
        const yOff  = Math.sin(phase) * AMP * prog;

        /* Fold shading: cosine determines crest vs trough brightness */
        const brightness = Math.cos(phase) * 0.12 * prog;

        ctx.save();

        /* Draw slice from offscreen → on-screen, shifted by yOff */
        ctx.drawImage(
          off,
          /* src  */ Math.floor(x * dpr), 0,  (SW + 1) * dpr, offH * dpr,
          /* dest */ x,                   yOff - DY,  SW + 1,  offH,
        );

        /* Additive/subtractive brightness overlay for 3-D fold effect */
        if (Math.abs(brightness) > 0.012) {
          ctx.globalCompositeOperation = brightness > 0 ? "lighter" : "source-atop";
          ctx.globalAlpha = Math.abs(brightness) * 0.45;
          ctx.fillStyle   = brightness > 0 ? "rgba(180,220,255,1)" : "rgba(0,0,40,1)";
          ctx.fillRect(x, yOff - DY, SW + 1, offH);
        }

        ctx.restore();
      }

      /* Subtle neon border */
      ctx.save();
      ctx.strokeStyle = "rgba(43,168,216,0.30)";
      ctx.lineWidth   = 1;
      ctx.shadowBlur  = 8;
      ctx.shadowColor = "rgba(43,168,216,0.55)";
      ctx.strokeRect(0.5, 0.5, FW - 1, FH - 1);
      ctx.restore();

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [width, height]);

  /* ─── Pole geometry ──────────────────────────────────────── */
  const poleW    = 6;
  const poleH    = height * 1.18;
  const ballR    = 10;
  const POLE_UP  = poleH - height;

  return (
    <div
      className={className}
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "flex-start",
        filter: [
          "drop-shadow(0 0 18px rgba(43,168,216,0.32))",
          "drop-shadow(0 0 40px rgba(201,168,76,0.16))",
        ].join(" "),
      }}
    >
      {showPole && (
        <div style={{ position: "relative", flexShrink: 0, marginTop: -POLE_UP, display: "flex", flexDirection: "column", alignItems: "center" }}>
          {/* Finial ball */}
          <div style={{
            width: ballR * 2, height: ballR * 2, borderRadius: "50%",
            background: "radial-gradient(circle at 36% 34%, #ffe680, #c9a84c 58%, #7a5c10 100%)",
            boxShadow: "0 0 10px rgba(201,168,76,0.9), 0 0 22px rgba(201,168,76,0.4)",
            marginBottom: 2, flexShrink: 0,
          }} />
          {/* Shaft */}
          <div style={{
            width: poleW,
            height: poleH - ballR * 2 - 2,
            background: "linear-gradient(90deg,#7a5c10 0%,#e0b84a 32%,#fff7a0 52%,#c9a84c 72%,#7a5c10 100%)",
            borderRadius: 3,
            boxShadow: "0 0 8px rgba(201,168,76,0.55), 0 0 20px rgba(201,168,76,0.2)",
            flexShrink: 0,
          }} />
        </div>
      )}

      <canvas
        ref={canvasRef}
        style={{ display: "block", borderRadius: 1 }}
      />
    </div>
  );
}

/* ─── Star helper ─────────────────────────────────────────── */
function drawStar(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  outerR: number,
  points: number,
  innerRatio: number,
) {
  ctx.save();
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 === 0 ? outerR : outerR * innerRatio;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle   = "#f5cc5a";
  ctx.shadowBlur  = 7;
  ctx.shadowColor = "rgba(245,204,90,0.9)";
  ctx.fill();
  ctx.restore();
}
