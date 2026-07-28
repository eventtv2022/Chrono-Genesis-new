import { useState, useCallback, useEffect, useRef } from "react";
import { Layout } from "@/components/Layout";
import { useCitizen } from "@/context/CitizenContext";
import { useLocation } from "wouter";

// ── Types ────────────────────────────────────────────────────────────────────

interface CitizenRow {
  id: number;
  name: string;
  citizenNumber: string | null;
  rank: string | null;
  telegramId: string | null;
  telegramUsername: string | null;
  email: string | null;
  whatsappPhone: string | null;
  phone: string | null;
  registrationStatus: string | null;
  status: string | null;
  balanceMinutes: number;
  isAdmin: number;
  govRole: string | null;
  availableAt: string | null;
  createdAt: string | null;
  lastActivity: string | null;
  hasPhoto: boolean;
  hasSignature: boolean;
}

interface CitizenDetail extends CitizenRow {
  signatureBase64: string | null;
  meritScore: number | null;
  totalGiven: number | null;
  totalReceived: number | null;
}

type Phase = "gate_password" | "gate_otp" | "table";
type StatusFilter = "all" | "active" | "rejected" | "pending" | "banned";
type RegistryTab = "citizens" | "votes";

interface BlockVoteEntry {
  id: number;
  citizenId: number;
  citizenName: string;
  reason: string;
  createdAt: string;
  endsAt: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  yesCount: number;
  noCount: number;
  ballots: { voterName: string; vote: string }[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function passportStatusLabel(c: CitizenRow): { label: string; color: string } {
  if (c.status === "banned")            return { label: "⛔ Заблокирован",       color: "text-red-400 bg-red-900/30 border-red-700/40" };
  if (c.registrationStatus === "issued") return { label: "✅ Паспорт активен",   color: "text-emerald-400 bg-emerald-900/30 border-emerald-700/40" };
  if (c.registrationStatus === "rejected") return { label: "❌ Отклонён",        color: "text-red-400 bg-red-900/30 border-red-700/40" };
  if (c.registrationStatus === "pending")  return { label: "⏳ В эмиссии",       color: "text-yellow-400 bg-yellow-900/30 border-yellow-700/40" };
  return { label: "— Черновик",                                                    color: "text-zinc-400 bg-zinc-900/30 border-zinc-700/40" };
}

function fmtDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleString("ru-RU", { timeZone: "Europe/Moscow", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

// ── 2FA Gate ─────────────────────────────────────────────────────────────────

function TwoFAGate({
  authHeaders,
  onSuccess,
}: {
  authHeaders: Record<string, string>;
  onSuccess: (token: string) => void;
}) {
  const [phase, setPhase] = useState<"password" | "otp">("password");
  const [masterPassword, setMasterPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const otpRef = useRef<HTMLInputElement>(null);

  async function handleRequestOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/registry/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ masterPassword }),
      });
      const data = await res.json() as { ok?: boolean; error?: string; tgSent?: boolean; emailSent?: boolean };
      if (!res.ok) { setError(data.error ?? "Ошибка сервера"); setLoading(false); return; }
      const channels: string[] = [];
      if (data.tgSent)    channels.push("Telegram");
      if (data.emailSent) channels.push("support@timenation.info");
      setInfo(`Код отправлен${channels.length ? ` на: ${channels.join(", ")}` : " (проверьте логи сервера)"}`);
      setPhase("otp");
      setTimeout(() => otpRef.current?.focus(), 100);
    } catch { setError("Ошибка сети"); }
    setLoading(false);
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/registry/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ masterPassword, otp: otp.trim() }),
      });
      const data = await res.json() as { ok?: boolean; token?: string; error?: string };
      if (!res.ok) {
        const msg = data.error ?? "Ошибка верификации";
        // OTP expired or missing → auto-resend if we still have the master password
        const isExpired = msg.toLowerCase().includes("истёк") || msg.toLowerCase().includes("запрошен");
        if (isExpired && masterPassword) {
          setOtp("");
          setError("Код истёк. Автоматически запрашиваем новый…");
          setLoading(false);
          // small delay so user reads the message, then auto-request
          setTimeout(() => void resendOtp(), 1200);
        } else {
          setError(msg);
          setLoading(false);
        }
        return;
      }
      onSuccess(data.token!);
    } catch { setError("Ошибка сети"); }
    setLoading(false);
  }

  /** Resend OTP without leaving the OTP phase (master password already in state). */
  async function resendOtp() {
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/registry/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ masterPassword }),
      });
      const data = await res.json() as { ok?: boolean; error?: string; tgSent?: boolean; emailSent?: boolean };
      if (!res.ok) {
        setError(data.error ?? "Ошибка запроса кода");
        setLoading(false);
        return;
      }
      const channels: string[] = [];
      if (data.tgSent)    channels.push("Telegram");
      if (data.emailSent) channels.push("support@timenation.info");
      setInfo(`Новый код отправлен${channels.length ? ` на: ${channels.join(", ")}` : " (проверьте логи сервера)"}`);
      setTimeout(() => otpRef.current?.focus(), 100);
    } catch { setError("Ошибка сети"); }
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="text-5xl mb-4">🛡️</div>
          <h1 className="text-2xl font-bold text-foreground">Реестр Граждан</h1>
          <p className="text-sm text-muted-foreground mt-2">Двухфакторная аутентификация администратора</p>
        </div>

        <div className="bg-card border border-border rounded-2xl p-6 shadow-xl">
          {/* Step indicators */}
          <div className="flex gap-2 mb-6">
            {(["password", "otp"] as const).map((s, i) => (
              <div key={s} className="flex-1 flex items-center gap-2">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                  phase === s ? "bg-primary text-primary-foreground" :
                  (s === "password" && phase === "otp") ? "bg-emerald-600 text-white" :
                  "bg-muted text-muted-foreground"
                }`}>{s === "password" && phase === "otp" ? "✓" : i + 1}</div>
                <span className="text-xs text-muted-foreground">{s === "password" ? "Мастер-пароль" : "OTP-код"}</span>
                {i < 1 && <div className="flex-1 h-px bg-border" />}
              </div>
            ))}
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-900/30 border border-red-700/40 rounded-lg text-sm text-red-300">
              ❌ {error}
            </div>
          )}
          {info && (
            <div className="mb-4 p-3 bg-emerald-900/20 border border-emerald-700/30 rounded-lg text-sm text-emerald-300">
              ✅ {info}
            </div>
          )}

          {phase === "password" && (
            <form onSubmit={(e) => void handleRequestOtp(e)} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">Мастер-пароль администратора</label>
                <input
                  type="password"
                  value={masterPassword}
                  onChange={e => setMasterPassword(e.target.value)}
                  placeholder="Введите мастер-пароль…"
                  autoFocus
                  required
                  className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/60"
                />
              </div>
              <button
                type="submit"
                disabled={loading || !masterPassword}
                className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm disabled:opacity-40 transition-opacity"
              >
                {loading ? "⏳ Отправка…" : "📩 Запросить OTP (Telegram + Email)"}
              </button>
            </form>
          )}

          {phase === "otp" && (
            <form onSubmit={(e) => void handleVerify(e)} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">6-значный OTP-код</label>
                <input
                  ref={otpRef}
                  type="text"
                  value={otp}
                  onChange={e => { setOtp(e.target.value.replace(/\D/g, "").slice(0, 6)); setError(null); }}
                  placeholder="000000"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  required
                  className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-2xl font-mono text-center text-foreground tracking-[0.3em] placeholder:text-muted-foreground focus:outline-none focus:border-primary/60"
                />
                <p className="text-xs text-muted-foreground mt-1.5">Код действителен 5 минут</p>
              </div>
              <button
                type="submit"
                disabled={loading || otp.length < 6}
                className="w-full py-3 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-sm disabled:opacity-40 transition-colors"
              >
                {loading ? "⏳ Проверка…" : "🔓 Войти в реестр"}
              </button>
              {/* Resend without going back to password */}
              <button
                type="button"
                disabled={loading}
                onClick={() => { setOtp(""); setError(null); setInfo(null); void resendOtp(); }}
                className="w-full py-2.5 rounded-xl border border-border text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-primary/40 disabled:opacity-40 transition-colors"
              >
                🔄 Запросить новый код
              </button>
              <button
                type="button"
                onClick={() => { setPhase("password"); setOtp(""); setInfo(null); setError(null); }}
                className="w-full py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                ← Изменить мастер-пароль
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Profile Modal ─────────────────────────────────────────────────────────────

function ProfileModal({
  citizenId,
  registryToken,
  onClose,
  onAction,
}: {
  citizenId: number;
  registryToken: string;
  onClose: () => void;
  onAction: (id: number, action: string, extra?: { reason?: string }) => Promise<{ message?: string; error?: string }>;
}) {
  const [citizen, setCitizen] = useState<CitizenDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  // Block reason dialog state
  const [blockDialogOpen, setBlockDialogOpen] = useState(false);
  const [blockReason, setBlockReason] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(`/api/admin/registry/users/${citizenId}`, {
          headers: { "X-Registry-Token": registryToken },
        });
        if (res.ok) setCitizen(await res.json() as CitizenDetail);
      } finally { setLoading(false); }
    })();
  }, [citizenId, registryToken]);

  async function handleAction(action: string, extra?: { reason?: string }) {
    setActionLoading(action);
    setActionMsg(null);
    const result = await onAction(citizenId, action, extra);
    // Refresh detail
    const res = await fetch(`/api/admin/registry/users/${citizenId}`, {
      headers: { "X-Registry-Token": registryToken },
    });
    if (res.ok) setCitizen(await res.json() as CitizenDetail);
    setActionLoading(null);
    if (result.error) {
      setActionMsg(`⚠️ ${result.error}`);
    } else {
      setActionMsg(
        result.message ??
        (action === "block" ? "Голосование о блокировке инициировано" :
         action === "activate" ? "Паспорт активирован" : "Эмиссия перезапущена")
      );
    }
  }

  async function confirmBlock() {
    if (!blockReason.trim()) return;
    setBlockDialogOpen(false);
    await handleAction("block", { reason: blockReason.trim() });
    setBlockReason("");
  }

  const ps = citizen ? passportStatusLabel(citizen) : null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="w-full max-w-xl bg-card border border-border rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-bold text-foreground text-lg">👁 Профиль гражданина</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl transition-colors">✕</button>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <span className="animate-spin mr-2">⏳</span> Загрузка…
          </div>
        )}

        {!loading && citizen && (
          <div className="p-5 space-y-5">
            {/* Identity */}
            <div className="flex gap-4 items-start">
              {/* Photo */}
              <div className="w-16 h-16 rounded-full overflow-hidden flex-shrink-0 border-2 border-primary/30 bg-muted flex items-center justify-center">
                {citizen.hasPhoto ? (
                  <img
                    src={`/api/admin/registry/users/${citizen.id}/photo?token=${encodeURIComponent(registryToken)}`}
                    alt="Фото"
                    className="w-full h-full object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                ) : (
                  <span className="text-2xl text-muted-foreground">👤</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-foreground text-base">{citizen.name}</div>
                <div className="text-xs text-muted-foreground font-mono">#{citizen.id} · {citizen.citizenNumber ?? "—"}</div>
                <div className="text-xs text-muted-foreground">{citizen.rank ?? "—"}</div>
                {ps && (
                  <span className={`inline-block mt-1.5 text-xs px-2 py-0.5 rounded-full border ${ps.color}`}>{ps.label}</span>
                )}
              </div>
              <div className="text-right">
                <div className="text-lg font-bold text-primary font-mono">{citizen.balanceMinutes.toFixed(2)} Д</div>
                {citizen.isAdmin ? <div className="text-[10px] text-amber-400">👑 ADMIN</div> : null}
              </div>
            </div>

            {/* Contacts */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Telegram ID", value: citizen.telegramId },
                { label: "Username", value: citizen.telegramUsername ? `@${citizen.telegramUsername}` : null },
                { label: "Email", value: citizen.email },
                { label: "WhatsApp", value: citizen.whatsappPhone },
                { label: "Phone", value: citizen.phone },
                { label: "Gov Role", value: citizen.govRole },
              ].map(({ label, value }) => (
                <div key={label} className="bg-muted/30 rounded-lg px-3 py-2">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</div>
                  <div className="text-xs font-mono text-foreground truncate">{value ?? "—"}</div>
                </div>
              ))}
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Создан", value: fmtDate(citizen.createdAt) },
                { label: "Активен", value: fmtDate(citizen.lastActivity) },
                { label: "Дано Д", value: citizen.totalGiven?.toFixed(2) ?? "—" },
                { label: "Получено Д", value: citizen.totalReceived?.toFixed(2) ?? "—" },
              ].map(({ label, value }) => (
                <div key={label} className="bg-muted/30 rounded-lg px-3 py-2">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</div>
                  <div className="text-xs font-mono text-foreground">{value}</div>
                </div>
              ))}
            </div>

            {/* Documents: photo + signature */}
            {(citizen.hasPhoto || citizen.signatureBase64) && (
              <div>
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">📂 Документы</div>
                <div className="grid grid-cols-2 gap-3">
                  {/* Passport photo */}
                  <div className="flex flex-col gap-1.5">
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Паспортное фото</div>
                    {citizen.hasPhoto ? (
                      <div className="rounded-xl overflow-hidden border border-border bg-muted aspect-[3/4] flex items-center justify-center">
                        <img
                          src={`/api/admin/registry/users/${citizen.id}/photo?token=${encodeURIComponent(registryToken)}`}
                          alt="Фото"
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = "none";
                          }}
                        />
                      </div>
                    ) : (
                      <div className="rounded-xl border border-dashed border-border bg-muted/20 aspect-[3/4] flex flex-col items-center justify-center gap-1 text-muted-foreground">
                        <span className="text-2xl">📷</span>
                        <span className="text-[10px]">нет фото</span>
                      </div>
                    )}
                  </div>
                  {/* Signature */}
                  <div className="flex flex-col gap-1.5">
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Подпись</div>
                    {citizen.signatureBase64 ? (
                      <div className="rounded-xl overflow-hidden border border-border bg-white flex items-center justify-center p-2">
                        <img
                          src={citizen.signatureBase64}
                          alt="Подпись"
                          className="w-full"
                          style={{ imageRendering: "pixelated" }}
                        />
                      </div>
                    ) : (
                      <div className="rounded-xl border border-dashed border-border bg-muted/20 flex flex-col items-center justify-center gap-1 text-muted-foreground" style={{ minHeight: "80px" }}>
                        <span className="text-2xl">✍️</span>
                        <span className="text-[10px]">нет подписи</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Action message */}
            {actionMsg && (
              <div className={`p-3 rounded-lg text-sm text-center ${
                actionMsg.startsWith("⚠️")
                  ? "bg-red-900/20 border border-red-700/30 text-red-300"
                  : "bg-emerald-900/20 border border-emerald-700/30 text-emerald-300"
              }`}>
                {actionMsg.startsWith("⚠️") ? actionMsg : `✅ ${actionMsg}`}
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-col gap-2 pt-1">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Действия</div>
              <div className={`grid gap-2 ${citizen.id !== 1 ? "grid-cols-3" : "grid-cols-2"}`}>
                <button
                  onClick={() => void handleAction("restart_emission")}
                  disabled={!!actionLoading}
                  className="py-2.5 px-2 text-xs font-semibold rounded-xl bg-yellow-900/30 border border-yellow-700/40 text-yellow-300 hover:bg-yellow-900/50 disabled:opacity-40 transition-colors"
                >
                  {actionLoading === "restart_emission" ? "⏳" : "🔄"} Перезапустить эмиссию
                </button>
                <button
                  onClick={() => void handleAction("activate")}
                  disabled={!!actionLoading}
                  className="py-2.5 px-2 text-xs font-semibold rounded-xl bg-emerald-900/30 border border-emerald-700/40 text-emerald-300 hover:bg-emerald-900/50 disabled:opacity-40 transition-colors"
                >
                  {actionLoading === "activate" ? "⏳" : "✅"} Активировать вручную
                </button>
                {/* Block button — HIDDEN for citizen #1 (the protected administrator) */}
                {citizen.id !== 1 && (
                  <button
                    onClick={() => { setBlockReason(""); setBlockDialogOpen(true); }}
                    disabled={!!actionLoading}
                    className="py-2.5 px-2 text-xs font-semibold rounded-xl bg-red-900/30 border border-red-700/40 text-red-300 hover:bg-red-900/50 disabled:opacity-40 transition-colors"
                  >
                    {actionLoading === "block" ? "⏳" : "⛔"} Инициировать блокировку
                  </button>
                )}
              </div>

              {/* Citizen #1 protection note */}
              {citizen.id === 1 && (
                <div className="text-[10px] text-muted-foreground/60 text-center mt-1">
                  🛡 Блокировка администратора (гражданина №1) недоступна
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Block reason dialog ───────────────────────────────────────────── */}
      {blockDialogOpen && citizen && (
        <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4" onClick={() => setBlockDialogOpen(false)}>
          <div
            className="w-full max-w-sm bg-card border border-red-800/60 rounded-2xl shadow-2xl p-5"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="font-bold text-foreground text-base mb-1">⛔ Инициировать блокировку</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Голосование будет открыто для членов правительства и судей на <strong>24 часа</strong>.
              Гражданин будет заблокирован только при большинстве голосов «За».
            </p>

            {/* Citizen info */}
            <div className="bg-muted/30 rounded-xl px-3 py-2 mb-4">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Гражданин</div>
              <div className="text-sm font-semibold text-foreground">{citizen.name}</div>
              <div className="text-[10px] text-muted-foreground font-mono">ID #{citizen.id}</div>
            </div>

            {/* Reason input */}
            <label className="block mb-3">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
                Причина блокировки <span className="text-red-400">*</span>
              </span>
              <textarea
                value={blockReason}
                onChange={e => setBlockReason(e.target.value)}
                placeholder="Опишите причину блокировки подробно…"
                rows={4}
                className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-red-600/60 resize-none"
                maxLength={500}
                autoFocus
              />
              <div className="text-[10px] text-muted-foreground text-right mt-0.5">{blockReason.length}/500</div>
            </label>

            {/* Buttons */}
            <div className="flex gap-3">
              <button
                onClick={() => setBlockDialogOpen(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-muted text-muted-foreground hover:text-foreground transition-colors border border-border"
              >
                Отмена
              </button>
              <button
                onClick={() => void confirmBlock()}
                disabled={!blockReason.trim()}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-red-900/50 border border-red-700/60 text-red-200 hover:bg-red-800/60 disabled:opacity-40 transition-colors"
              >
                ⛔ Инициировать голосование
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Registry Page ────────────────────────────────────────────────────────

export function AdminRegistry() {
  const { citizen, authToken } = useCitizen();
  const [, setLocation] = useLocation();

  const authHeaders: Record<string, string> = authToken
    ? { Authorization: `Bearer ${authToken}` }
    : {};

  const [phase, setPhase] = useState<Phase>("gate_password");
  const [activeTab, setActiveTab] = useState<RegistryTab>("citizens");
  const [registryToken, setRegistryToken] = useState<string | null>(null);
  const [citizens, setCitizens] = useState<CitizenRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [profileId, setProfileId] = useState<number | null>(null);
  const [actionToast, setActionToast] = useState<string | null>(null);
  const [blockVotes, setBlockVotes] = useState<BlockVoteEntry[]>([]);
  const [votesLoading, setVotesLoading] = useState(false);

  // Redirect non-admins
  useEffect(() => {
    if (citizen && !citizen.isAdmin) setLocation("/");
  }, [citizen, setLocation]);

  const fetchCitizens = useCallback(async (token: string, q?: string, sf?: StatusFilter) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (q)  params.set("search", q);
      if (sf && sf !== "all") params.set("status", sf);
      const res = await fetch(`/api/admin/registry/users?${params}`, {
        headers: { "X-Registry-Token": token },
      });
      if (res.status === 403) {
        setRegistryToken(null);
        setPhase("gate_password");
        setError("Сессия истекла. Войдите снова.");
        return;
      }
      if (!res.ok) { setError("Ошибка загрузки данных"); return; }
      setCitizens(await res.json() as CitizenRow[]);
      setPhase("table");
    } catch { setError("Ошибка сети"); }
    setLoading(false);
  }, []);

  async function onGateSuccess(token: string) {
    setRegistryToken(token);
    await fetchCitizens(token, search, statusFilter);
  }

  // Debounced search
  useEffect(() => {
    if (!registryToken || phase !== "table") return;
    const t = setTimeout(() => void fetchCitizens(registryToken, search, statusFilter), 350);
    return () => clearTimeout(t);
  }, [search, statusFilter, registryToken, phase, fetchCitizens]);

  const fetchBlockVotes = useCallback(async (token: string) => {
    setVotesLoading(true);
    try {
      const res = await fetch("/api/admin/registry/block-votes", {
        headers: { "X-Registry-Token": token },
      });
      if (res.ok) setBlockVotes(await res.json() as BlockVoteEntry[]);
    } catch { /* silent */ }
    setVotesLoading(false);
  }, []);

  // Load votes when switching to the votes tab
  useEffect(() => {
    if (activeTab === "votes" && registryToken) void fetchBlockVotes(registryToken);
  }, [activeTab, registryToken, fetchBlockVotes]);

  async function handleAction(id: number, action: string, extra?: { reason?: string }): Promise<{ message?: string; error?: string }> {
    if (!registryToken) return {};
    try {
      const res = await fetch(`/api/admin/registry/users/${id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Registry-Token": registryToken },
        body: JSON.stringify({ action, ...extra }),
      });
      const data = await res.json() as { ok?: boolean; message?: string; error?: string };
      if (data.message) {
        setActionToast(data.message);
        setTimeout(() => setActionToast(null), 6000);
      }
      // Refresh list and votes
      await fetchCitizens(registryToken, search, statusFilter);
      if (action === "block" && registryToken) void fetchBlockVotes(registryToken);
      return data;
    } catch { return {}; }
  }

  // Not logged in or not admin
  if (!citizen || !citizen.isAdmin) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh] text-muted-foreground text-sm">
          🚫 Доступ запрещён
        </div>
      </Layout>
    );
  }

  const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
    { value: "all",      label: "Все" },
    { value: "active",   label: "✅ Активные" },
    { value: "pending",  label: "⏳ В эмиссии" },
    { value: "rejected", label: "❌ Отклонённые" },
    { value: "banned",   label: "⛔ Заблокированные" },
  ];

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 py-6">

        {/* Page header */}
        <div className="flex items-center gap-3 mb-6">
          <span className="text-3xl">🛡️</span>
          <div>
            <h1 className="text-xl font-bold text-foreground">База Данных Граждан</h1>
            <p className="text-xs text-muted-foreground">Реестр TimeNation · только для администраторов</p>
          </div>
          {phase === "table" && (
            <button
              onClick={() => { setRegistryToken(null); setPhase("gate_password"); setCitizens([]); }}
              className="ml-auto text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg px-3 py-1.5 transition-colors"
            >
              🔒 Выйти из реестра
            </button>
          )}
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-900/30 border border-red-700/40 rounded-xl text-sm text-red-300">
            ❌ {error}
          </div>
        )}

        {/* 2FA Gate */}
        {(phase === "gate_password" || phase === "gate_otp") && (
          <TwoFAGate authHeaders={authHeaders} onSuccess={(t) => void onGateSuccess(t)} />
        )}

        {/* Registry table */}
        {phase === "table" && (
          <>
            {/* Tabs */}
            <div className="flex gap-2 mb-5 border-b border-border">
              {([
                { key: "citizens", label: "👥 Граждане" },
                { key: "votes",    label: `🗳 Голосования${blockVotes.filter(v => v.status === "pending").length > 0 ? ` (${blockVotes.filter(v => v.status === "pending").length})` : ""}` },
              ] as { key: RegistryTab; label: string }[]).map(t => (
                <button
                  key={t.key}
                  onClick={() => setActiveTab(t.key)}
                  className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors -mb-px ${
                    activeTab === t.key
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* ── Citizens Tab ──────────────────────────────────────────────── */}
            {activeTab === "citizens" && <>
            {/* Search + filter bar */}
            <div className="flex flex-col sm:flex-row gap-3 mb-4">
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="🔍 Поиск по ID, имени, Telegram, Email…"
                className="flex-1 bg-background border border-border rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/60"
              />
              <div className="flex gap-1.5 flex-wrap">
                {STATUS_FILTERS.map(f => (
                  <button
                    key={f.value}
                    onClick={() => setStatusFilter(f.value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                      statusFilter === f.value
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Count */}
            <div className="text-xs text-muted-foreground mb-3 font-mono">
              Найдено: <span className="text-foreground font-bold">{citizens.length}</span> граждан
              {loading && <span className="ml-2 animate-spin">⏳</span>}
            </div>

            {/* Table (desktop) */}
            <div className="hidden md:block rounded-2xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b border-border">
                  <tr>
                    {["ID", "Гражданин", "Telegram / Email", "Статус паспорта", "Баланс Д", "Подпись", "Действия"].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {citizens.map(c => {
                    const ps = passportStatusLabel(c);
                    return (
                      <tr key={c.id} className="hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">#{c.id}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-sm flex-shrink-0">
                              {c.hasPhoto ? "📷" : "👤"}
                            </div>
                            <div>
                              <div className="font-semibold text-foreground text-xs">{c.name}</div>
                              <div className="text-[10px] text-muted-foreground font-mono">{c.citizenNumber ?? "—"}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          <div>{c.telegramId ? `tg:${c.telegramId}` : "—"}</div>
                          <div className="text-[10px]">{c.email ?? (c.whatsappPhone ?? "—")}</div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-block text-[10px] px-2 py-0.5 rounded-full border whitespace-nowrap ${ps.color}`}>
                            {ps.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-primary font-semibold">
                          {c.balanceMinutes.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-center text-base">
                          {c.hasSignature ? "✍️" : <span className="text-muted-foreground text-xs">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => setProfileId(c.id)}
                            className="text-xs px-3 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 transition-colors font-semibold"
                          >
                            👁 Просмотр
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {citizens.length === 0 && !loading && (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground text-sm">
                        Граждане не найдены
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile card list */}
            <div className="md:hidden space-y-3">
              {citizens.map(c => {
                const ps = passportStatusLabel(c);
                return (
                  <div key={c.id} className="bg-card border border-border rounded-xl p-4">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-lg flex-shrink-0">
                        {c.hasPhoto ? "📷" : "👤"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-foreground text-sm">{c.name}</div>
                        <div className="text-[10px] text-muted-foreground font-mono">#{c.id} · {c.citizenNumber ?? "—"}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-bold text-primary font-mono">{c.balanceMinutes.toFixed(2)} Д</div>
                        {c.hasSignature && <div className="text-[10px] text-muted-foreground">✍️ подписан</div>}
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border ${ps.color}`}>{ps.label}</span>
                      <button
                        onClick={() => setProfileId(c.id)}
                        className="text-xs px-3 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 transition-colors font-semibold"
                      >
                        👁 Просмотр
                      </button>
                    </div>
                  </div>
                );
              })}
              {citizens.length === 0 && !loading && (
                <div className="text-center py-10 text-muted-foreground text-sm">Граждане не найдены</div>
              )}
            </div>
            </> /* end citizens tab */}

            {/* ── Votes Tab ─────────────────────────────────────────────────── */}
            {activeTab === "votes" && (
              <div className="space-y-4 max-w-2xl">
                {votesLoading && (
                  <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
                    <span className="animate-spin mr-2">⏳</span> Загрузка голосований…
                  </div>
                )}

                {!votesLoading && blockVotes.length === 0 && (
                  <div className="text-center py-12 text-muted-foreground text-sm bg-muted/20 rounded-xl border border-border">
                    Нет голосований о блокировке
                  </div>
                )}

                {!votesLoading && blockVotes.map(v => {
                  const statusMap: Record<string, { label: string; cls: string }> = {
                    pending:   { label: "🗳 Идёт голосование",    cls: "text-yellow-300 bg-yellow-900/30 border-yellow-700/40" },
                    approved:  { label: "⛔ Блокировка одобрена",  cls: "text-red-300 bg-red-900/30 border-red-700/40" },
                    rejected:  { label: "✅ Блокировка отклонена", cls: "text-emerald-300 bg-emerald-900/30 border-emerald-700/40" },
                    cancelled: { label: "🚫 Отменено",             cls: "text-zinc-400 bg-zinc-900/30 border-zinc-700/40" },
                  };
                  const sb = statusMap[v.status] ?? statusMap["cancelled"]!;
                  const total = v.yesCount + v.noCount;
                  const endsAt = new Date(v.endsAt);
                  const now = Date.now();
                  const diffMs = endsAt.getTime() - now;
                  const timeLeft = diffMs > 0
                    ? `${Math.floor(diffMs / 3_600_000)}ч ${Math.floor((diffMs % 3_600_000) / 60_000)}м`
                    : "Истекло";

                  return (
                    <div key={v.id} className="bg-card border border-border rounded-2xl overflow-hidden">
                      <div className="px-4 py-3 border-b border-border flex items-start justify-between gap-3">
                        <div>
                          <div className="font-bold text-foreground">{v.citizenName}</div>
                          <div className="text-xs text-muted-foreground font-mono">ID {v.citizenId} · #{v.id}</div>
                        </div>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border whitespace-nowrap ${sb.cls}`}>
                          {sb.label}
                        </span>
                      </div>
                      <div className="px-4 py-3 space-y-2">
                        <div className="bg-red-950/20 border border-red-800/20 rounded-lg px-3 py-2">
                          <div className="text-[10px] text-red-400 uppercase tracking-wider font-semibold mb-0.5">Причина</div>
                          <div className="text-xs text-red-200">{v.reason}</div>
                        </div>
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          {v.status === "pending"
                            ? <span>⏰ Осталось: <strong className="text-foreground">{timeLeft}</strong></span>
                            : <span>Завершено: {new Date(v.endsAt).toLocaleDateString("ru-RU")}</span>
                          }
                          <span className="font-mono">✅ {v.yesCount} / ❌ {v.noCount} / Всего {total}</span>
                        </div>
                        {v.ballots.length > 0 && (
                          <div className="flex flex-wrap gap-1 pt-1">
                            {v.ballots.map((b, i) => (
                              <span key={i} className={`text-[10px] px-1.5 py-0.5 rounded border ${
                                b.vote === "yes" ? "text-emerald-400 bg-emerald-900/20 border-emerald-700/30" : "text-red-400 bg-red-900/20 border-red-700/30"
                              }`}>
                                {b.voterName} · {b.vote === "yes" ? "За" : "Против"}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* Profile modal */}
        {profileId !== null && registryToken && (
          <ProfileModal
            citizenId={profileId}
            registryToken={registryToken}
            onClose={() => setProfileId(null)}
            onAction={handleAction}
          />
        )}

        {/* Action toast */}
        {actionToast && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-emerald-800 text-white text-sm font-semibold px-5 py-3 rounded-xl shadow-xl z-50 animate-in fade-in slide-in-from-bottom-2">
            ✅ {actionToast}
          </div>
        )}
      </div>
    </Layout>
  );
}
