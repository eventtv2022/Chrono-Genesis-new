import { useEffect, useState, useCallback } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Layout } from "@/components/Layout";
import { useCitizen } from "@/context/CitizenContext";
import { useWsSync } from "@/hooks/useWsSync";
import { useLocation } from "wouter";

type Phase = "loading" | "ready" | "scanned" | "success" | "expired" | "error";

export function QrLogin() {
  const { citizen, setAuthToken, refreshCitizen } = useCitizen();
  const [, navigate] = useLocation();
  const [token, setToken] = useState<string | null>(null);
  const [botUsername, setBotUsername] = useState<string>("TimeNation_app_bot");
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number>(0);
  const [secondsLeft, setSecondsLeft] = useState(120);

  // Redirect if already logged in
  useEffect(() => {
    if (citizen) navigate("/");
  }, [citizen, navigate]);

  const fetchToken = useCallback(async () => {
    setPhase("loading");
    setError(null);
    try {
      const res = await fetch("/api/auth/qr-token");
      const data = await res.json() as { token?: string; expiresIn?: number; botUsername?: string };
      if (!data.token) throw new Error("No token");
      setToken(data.token);
      if (data.botUsername) setBotUsername(data.botUsername);
      setExpiresAt(Date.now() + (data.expiresIn ?? 120) * 1000);
      setSecondsLeft(data.expiresIn ?? 120);
      setPhase("ready");
    } catch {
      setPhase("error");
      setError("Не удалось получить QR-код. Проверьте соединение.");
    }
  }, []);

  useEffect(() => { void fetchToken(); }, [fetchToken]);

  // Countdown timer
  useEffect(() => {
    if (phase !== "ready") return;
    const id = setInterval(() => {
      const left = Math.max(0, Math.round((expiresAt - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left === 0) { setPhase("expired"); clearInterval(id); }
    }, 1000);
    return () => clearInterval(id);
  }, [phase, expiresAt]);

  // WS: wait for QR login event (anonymous — no citizenId)
  useWsSync({
    qrWaitToken: token,
    onQrLogin: (payload) => {
      setPhase("success");
      // Set auth token, then refresh full citizen profile from server
      setAuthToken(payload.authToken);
      void refreshCitizen();
      setTimeout(() => navigate("/"), 1500);
    },
  });

  // Encode a Telegram deep-link so any smartphone camera can open it directly.
  // When scanned, Telegram opens @botUsername and sends /start qr_<token>.
  const qrContent = token
    ? `https://t.me/${botUsername}?start=qr_${token}`
    : "";

  return (
    <Layout>
      <div className="min-h-[60vh] flex flex-col items-center justify-center py-12">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight">Вход через QR</h1>
            <p className="text-muted-foreground font-mono text-sm mt-2">
              Отсканируйте QR-код камерой смартфона или через Telegram, чтобы войти в аккаунт.
            </p>
          </div>

          {/* QR Card */}
          <div className="bg-card border border-border rounded-sm p-6 flex flex-col items-center gap-4">
            {phase === "loading" && (
              <div className="w-48 h-48 flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            )}

            {(phase === "ready") && token && (
              <>
                <div className="p-3 bg-white rounded-sm">
                  <QRCodeSVG
                    value={qrContent}
                    size={192}
                    bgColor="#ffffff"
                    fgColor="#0a0a0a"
                    level="M"
                  />
                </div>
                <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
                  <div className={`w-2 h-2 rounded-full ${secondsLeft > 30 ? "bg-emerald-500" : secondsLeft > 10 ? "bg-amber-500" : "bg-red-500"} animate-pulse`} />
                  Истекает через {secondsLeft}с
                </div>
              </>
            )}

            {phase === "scanned" && (
              <div className="w-48 h-48 flex flex-col items-center justify-center gap-3">
                <div className="text-4xl">📱</div>
                <div className="text-sm font-mono text-muted-foreground text-center">Сканирование обнаружено…</div>
              </div>
            )}

            {phase === "success" && (
              <div className="w-48 h-48 flex flex-col items-center justify-center gap-3">
                <div className="text-5xl">✅</div>
                <div className="text-base font-mono text-emerald-400 font-bold">Выполнен вход!</div>
                <div className="text-xs font-mono text-muted-foreground">Перенаправление…</div>
              </div>
            )}

            {phase === "expired" && (
              <div className="w-48 h-48 flex flex-col items-center justify-center gap-3">
                <div className="text-4xl">⏰</div>
                <div className="text-sm font-mono text-muted-foreground text-center">QR-код истёк</div>
              </div>
            )}

            {phase === "error" && (
              <div className="w-48 h-48 flex flex-col items-center justify-center gap-3">
                <div className="text-4xl">⚠️</div>
                <div className="text-xs font-mono text-destructive text-center">{error}</div>
              </div>
            )}
          </div>

          {/* Instructions */}
          {(phase === "ready") && (
            <ol className="text-xs font-mono text-muted-foreground space-y-1 list-decimal list-inside">
              <li>Наведите камеру смартфона на QR-код</li>
              <li>Telegram откроется автоматически — нажмите «Запустить»</li>
              <li>Вход выполнится мгновенно</li>
            </ol>
          )}

          {(phase === "expired" || phase === "error") && (
            <button
              onClick={() => void fetchToken()}
              className="w-full border border-border rounded-sm py-2 text-sm font-mono text-muted-foreground hover:text-foreground hover:border-primary transition-colors"
            >
              Обновить QR-код
            </button>
          )}
        </div>
      </div>
    </Layout>
  );
}
