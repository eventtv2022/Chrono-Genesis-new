import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Clock3, RotateCw, Sparkles, TimerReset, AlertTriangle, RefreshCw, Layers3 } from "lucide-react";
import { getGetHourglassStatusQueryKey, useGetHourglassStatus, useSpinHourglass } from "@workspace/api-client-react";
import { Layout } from "@/components/Layout";
import { useCitizen } from "@/context/CitizenContext";
import { useLanguage } from "@/context/LanguageContext";
import { HOURGLASS_COPY } from "@/i18n/hourglassCopy";
import { RTL_LANGS } from "@/i18n/ui";
import "./hourglass.css";

function interpolate(template: string, values: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""));
}

function formatCountdown(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return [Math.floor(total / 3600), Math.floor((total % 3600) / 60), total % 60]
    .map(value => String(value).padStart(2, "0")).join(":");
}

export function Hourglass() {
  const { authHeaders, citizen, authToken, refreshCitizen } = useCitizen();
  const { lang } = useLanguage();
  const copy = HOURGLASS_COPY[lang];
  const queryClient = useQueryClient();
  const statusQuery = useGetHourglassStatus({ query: { enabled: !!citizen && !!authToken, queryKey: getGetHourglassStatusQueryKey(), refetchInterval: 15_000, refetchOnMount: "always", refetchOnWindowFocus: true }, request: { headers: authHeaders } });
  const spin = useSpinHourglass({ request: { headers: authHeaders } });
  const [now, setNow] = useState(Date.now());
  const [result, setResult] = useState<{ amount: number; balance: number } | null>(null);
  const [claimDate, setClaimDate] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isSpinning, setIsSpinning] = useState(false);
  const lock = useRef(false);
  useEffect(() => { document.title = `${copy.title} — TimeNation`; }, [copy.title]);
  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(id); }, []);
  const status = statusQuery.data;
  const countdown = useMemo(() => status ? formatCountdown(new Date(status.nextResetAt).getTime() - now) : "--:--:--", [status, now]);
  const canOpenDialog = !!status?.enabled && !status.alreadySpun && claimDate !== status?.prizeDate && status.tiers.some(t => t.remainingQuantity > 0) && !spin.isPending && !isSpinning;
  const onSpin = () => {
    if (lock.current || !canOpenDialog || !status?.hasActivityToday) return;
    lock.current = true;
    setResult(null);
    setDialogOpen(false);
    setIsSpinning(true);
    const startedAt = Date.now();
    spin.mutate(undefined, {
      onSuccess: (data) => {
        const waitMs = Math.max(0, 6000 - (Date.now() - startedAt));
        window.setTimeout(() => {
          setIsSpinning(false);
          setResult({ amount: data.rewardAmount, balance: data.balanceMinutes });
          setClaimDate(data.status.prizeDate);
          lock.current = false;
          void refreshCitizen();
          void queryClient.invalidateQueries({ queryKey: getGetHourglassStatusQueryKey() });
        }, waitMs);
      },
      onError: () => { setIsSpinning(false); lock.current = false; },
    });
  };
  const tiers = status?.tiers ?? [];
  const totalRemaining = tiers.reduce((sum, tier) => sum + tier.remainingQuantity, 0);

  return <Layout><div className="hourglass-page" dir={RTL_LANGS.includes(lang) ? "rtl" : "ltr"} data-testid="page-hourglass">
    <header className="hg-header">
      <div><div className="hg-kicker"><span className="hg-live-dot" /> {copy.kicker}</div><h1>{copy.daily} <em>{copy.title}</em></h1><p>{copy.tagline}</p></div>
      <div className="hg-reset" data-testid="status-reset-countdown"><Clock3 size={16}/><span><small>{copy.nextReset}</small><strong>{countdown}</strong></span></div>
    </header>

    {(!citizen || !authToken) && <section className="hg-message" data-testid="status-auth-required"><AlertTriangle/><div><strong>{copy.authTitle}</strong><p>{copy.authBody}</p></div></section>}
    {statusQuery.isLoading && citizen && authToken && <div className="hg-skeleton" data-testid="loading-hourglass"><i/><i/><i/></div>}
    {statusQuery.isError && <section className="hg-message hg-error" role="alert" data-testid="status-hourglass-error"><AlertTriangle/><div><strong>{copy.unavailableTitle}</strong><p>{copy.unavailableBody}</p><button data-testid="button-retry-hourglass" onClick={() => void statusQuery.refetch()}><RefreshCw size={15}/> {copy.retry}</button></div></section>}
    {status && <>
      <div className="hg-main-grid">
        <section className={`hg-machine ${isSpinning ? "is-spinning" : ""}`} aria-label={copy.title}>
          <div className="hg-machine-top"><span>{interpolate(copy.poolOpen, { date: status.prizeDate })}</span><span className="hg-machine-mark">TN / 24</span></div>
          <div className="hg-machine-art" data-testid="visual-hourglass">
            <div className="hg-orbit orbit-one"/><div className="hg-orbit orbit-two"/>
            <div className="hg-glass">
              <div className="hg-bulb hg-upper"><span className="hg-sand upper-sand"/></div>
              <div className="hg-neck"><span className="hg-stream"/></div>
              <div className="hg-bulb hg-lower"><span className="hg-sand lower-sand"/></div>
            </div>
            <div className="hg-frame-top"/><div className="hg-frame-bottom"/><div className="hg-particle p1"/><div className="hg-particle p2"/><div className="hg-particle p3"/>
          </div>
          <div className="hg-machine-status"><span className="status-led"/>{status.enabled ? (status.alreadySpun ? copy.claimed : copy.ready) : copy.paused}</div>
          <button className="hg-spin-button" onClick={() => setDialogOpen(true)} disabled={!canOpenDialog} data-testid="button-spin-hourglass">
            <RotateCw size={17} className={isSpinning || spin.isPending ? "spin-icon" : ""}/>{isSpinning || spin.isPending ? copy.spinning : copy.spin}<span>↗</span>
          </button>
          <p className="hg-once-note">{status.alreadySpun ? copy.noteClaimed : !status.enabled ? copy.notePaused : totalRemaining === 0 ? copy.noteEmpty : copy.noteOnce}</p>
        </section>

        <section className="hg-pool-panel">
          <div className="hg-section-label"><span>{copy.distribution}</span><span className="hg-pool-count"><Layers3 size={14}/> {interpolate(copy.left, { count: totalRemaining })}</span></div>
          <h2>{copy.poolTitle}</h2><p className="hg-panel-copy">{copy.poolBody}</p>
          <div className="hg-tier-list" data-testid="list-prize-tiers">
            {[...tiers].sort((a,b) => a.rewardAmount-b.rewardAmount).map((tier, index) => <div className="hg-tier" key={tier.rewardAmount} data-testid={`tier-reward-${tier.rewardAmount}`}>
              <span className={`hg-tier-index tone-${index}`}>0{index+1}</span><strong>{tier.rewardAmount}<small> D</small></strong>
              <div className="hg-tier-stock"><span>{interpolate(copy.stock, { remaining: tier.remainingQuantity, total: tier.dailyQuantity })}</span><div className="hg-stock-track"><i style={{ width: `${tier.dailyQuantity ? Math.max(0, Math.min(100, tier.remainingQuantity / tier.dailyQuantity * 100)) : 0}%` }}/></div></div>
              <span className="hg-probability">{interpolate(copy.chance, { chance: tier.probabilityPercent })}</span>
            </div>)}
          </div>
          {tiers.length === 0 && <div className="hg-empty" data-testid="status-empty-pool"><Layers3/><strong>{copy.emptyTiersTitle}</strong><span>{copy.emptyTiersBody}</span></div>}
          <div className="hg-balance"><div><span>{copy.balance}</span><small>{copy.citizenAccount}</small></div><strong data-testid="text-hourglass-balance">{(result?.balance ?? status.balanceMinutes).toLocaleString(undefined, { maximumFractionDigits: 2 })}<small> D</small></strong></div>
        </section>
      </div>
      {status.tiers.every(t => t.remainingQuantity === 0) && <div className="hg-empty-banner" data-testid="status-pool-empty"><Layers3/><span><strong>{copy.emptyBannerTitle}</strong> {copy.emptyBannerBody}</span></div>}
    </>}

    {spin.isError && <div className="hg-toast hg-toast-error" role="alert" data-testid="status-spin-error"><AlertTriangle size={18}/><span><strong>{copy.spinErrorTitle}</strong><small>{copy.spinErrorBody}</small></span></div>}
    {result && <div className="hg-reward-reveal" role="status" data-testid="status-spin-result"><div className="hg-reward-icon"><Sparkles/></div><div><small>{copy.rewardLabel}</small><strong>+{result.amount} <em>DarMin</em></strong><span>{interpolate(copy.newBalance, { balance: result.balance.toLocaleString(undefined, { maximumFractionDigits: 2 }) })}</span></div><button aria-label={copy.dismiss} data-testid="button-dismiss-reward" onClick={() => setResult(null)}>×</button></div>}
    {dialogOpen && status && <div className="hg-modal-backdrop" role="presentation" data-testid="dialog-hourglass-backdrop">
      <section className="hg-activity-dialog" role="dialog" aria-modal="true" aria-labelledby="hourglass-dialog-title" data-testid="dialog-hourglass">
        <span className="hg-dialog-icon"><HourglassDialogIcon /></span>
        <h2 id="hourglass-dialog-title">{status.hasActivityToday ? copy.unlockedTitle : copy.needActivityTitle}</h2>
        <p>{status.hasActivityToday ? copy.unlockedBody : copy.needActivityBody}</p>
        <div className="hg-dialog-actions">
          <button type="button" className="hg-dialog-secondary" onClick={() => setDialogOpen(false)} data-testid="button-close-hourglass-dialog">{copy.close}</button>
          {status.hasActivityToday && <button type="button" className="hg-dialog-primary" onClick={onSpin} data-testid="button-confirm-hourglass-spin"><RotateCw size={16}/>{copy.startSpin}</button>}
        </div>
      </section>
    </div>}
    <footer className="hg-footer"><TimerReset size={14}/> {copy.footer}</footer>
  </div></Layout>;
}

function HourglassDialogIcon() {
  return <RotateCw size={22} aria-hidden="true" />;
}
