import { useEffect, useRef, useState } from "react";
import SignaturePadLib from "signature_pad";

interface SignaturePadProps {
  onChange: (dataUrl: string | null) => void;
}

export function SignaturePad({ onChange }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePadLib | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [hasSignature, setHasSignature] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    canvas.width = canvas.offsetWidth * ratio;
    canvas.height = canvas.offsetHeight * ratio;
    canvas.getContext("2d")?.scale(ratio, ratio);

    const pad = new SignaturePadLib(canvas, {
      penColor: "rgb(10, 30, 80)",
      minWidth: 1,
      maxWidth: 3,
      backgroundColor: "rgba(0,0,0,0)",
    });
    padRef.current = pad;

    const onEnd = () => {
      const empty = pad.isEmpty();
      setHasSignature(!empty);
      onChangeRef.current(empty ? null : pad.toDataURL("image/png"));
    };
    pad.addEventListener("endStroke", onEnd);

    return () => {
      pad.removeEventListener("endStroke", onEnd);
      pad.off();
    };
  }, []);

  function handleClear() {
    padRef.current?.clear();
    setHasSignature(false);
    onChangeRef.current(null);
  }

  return (
    <div className="relative border-2 border-border rounded-sm overflow-hidden bg-zinc-950" style={{ height: 140 }}>
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: "100%", cursor: "crosshair", touchAction: "none", display: "block" }}
      />
      {!hasSignature && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="text-muted-foreground/50 font-mono text-sm italic select-none">Распишитесь здесь…</span>
        </div>
      )}
      {hasSignature && (
        <button
          type="button"
          onClick={handleClear}
          className="absolute bottom-2 right-2 bg-secondary/80 text-muted-foreground hover:text-foreground px-2 py-1 text-xs rounded border border-border transition-colors"
        >
          Очистить
        </button>
      )}
    </div>
  );
}
