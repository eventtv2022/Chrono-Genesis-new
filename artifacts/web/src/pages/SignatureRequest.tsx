import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useCitizen } from "@/context/CitizenContext";
import { SignaturePad } from "@/components/SignaturePad";
import { AnthemButton } from "@/components/AnthemPlayer";

export function SignatureRequest() {
  const { citizen, authToken, setCitizen, refreshCitizen } = useCitizen();
  const [, navigate] = useLocation();
  const [signatureBase64, setSignatureBase64] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function saveSignature() {
    if (!signatureBase64 || !authToken || !citizen || saving) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/citizens/me/signature", {
        method: "POST",
        headers: { Authorization: `Bearer ${authToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ signatureBase64 }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Не удалось сохранить подпись");
      setCitizen({ ...citizen, hasSignature: true });
      await refreshCitizen();
      setSignatureBase64(null);
      setSaved(true);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Ошибка сети при сохранении подписи");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#050713] px-4 py-10 text-white">
      <section className="mx-auto w-full max-w-xl space-y-5 rounded-2xl border border-white/10 bg-white/[0.035] p-6 shadow-2xl">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">TimeNation · Реестр граждан</p>
        <AnthemButton />
        <h1 className="text-2xl font-bold">Подпись гражданина</h1>
        {!citizen ? (
          <>
            <p className="text-sm leading-6 text-muted-foreground">Войдите в аккаунт гражданина, чтобы поставить подпись в своём паспорте. Подпись будет сохранена в реестре.</p>
            <Link href="/login?returnTo=%2Fsignature-request" className="block rounded-lg bg-primary px-5 py-3 text-center text-sm font-semibold text-primary-foreground">
              Войти и продолжить
            </Link>
          </>
        ) : saved || (citizen.hasSignature && !signatureBase64) ? (
          <div role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm leading-6 text-emerald-200">
            {saved ? "Подпись сохранена в вашем паспорте и реестре граждан." : "В реестре уже есть ваша подпись."}
            {citizen.registrationStatus === "pending" && <p className="mt-2">Оформление паспорта продолжится автоматически.</p>}
          </div>
        ) : (
          <>
            <p className="text-sm leading-6 text-muted-foreground">
              Распишитесь в поле ниже. После отправки подпись будет добавлена в ваш паспорт TimeNation и запись реестра.
            </p>
            <SignaturePad onChange={setSignatureBase64} />
            {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
            <button
              type="button"
              disabled={!signatureBase64 || saving}
              onClick={() => void saveSignature()}
              className="w-full rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40"
              data-testid="button-submit-signature-request"
            >
              {saving ? "Сохраняем…" : "Отправить подпись в реестр"}
            </button>
          </>
        )}
        <button type="button" onClick={() => navigate("/")} className="w-full py-2 text-sm text-muted-foreground hover:text-white">
          Вернуться в TimeNation
        </button>
      </section>
    </main>
  );
}
