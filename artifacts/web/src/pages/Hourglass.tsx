import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Clock3, RotateCw, Sparkles, TimerReset, AlertTriangle, RefreshCw, Layers3 } from "lucide-react";
import { getGetHourglassStatusQueryKey, useGetHourglassStatus, useSpinHourglass } from "@workspace/api-client-react";
import { Layout } from "@/components/Layout";
import { useCitizen } from "@/context/CitizenContext";
import "./hourglass.css";

function formatCountdown(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return [Math.floor(total / 3600), Math.floor((total % 3600) / 60), total % 60]
    .map(value => String(value).padStart(2, "0")).join(":");
}

export function Hourglass() {
  const { authHeaders, citizen, authToken, refreshCitizen } = useCitizen();
  const queryClient = useQueryClient();
  const statusQuery = useGetHourglassStatus({ query: { enabled: !!citizen && !!authToken, queryKey: getGetHourglassStatusQueryKey(), refetchInterval: 60_000 }, request: { headers: authHeaders } });
  const spin = useSpinHourglass({ request: { headers: authHeaders } });
  const [now, setNow] = useState(Date.now());
  const [result, setResult] = useState<{ amount: number; balance: number } | null>(null);
  const [claimDate, setClaimDate] = useState<string | null>(null);
  const lock = useRef(false);
  useEffect(() => { document.title = "Hourglass — TimeNation"; }, []);
  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(id); }, []);
  const status = statusQuery.data;
  const countdown = useMemo(() => status ? formatCountdown(new Date(status.nextResetAt).getTime() - now) : "--:--:--", [status, now]);
  const canSpin = !!status?.enabled && !status.alreadySpun && claimDate !== status?.prizeDate && !lock.current && status.tiers.some(t => t.remainingQuantity > 0) && !spin.isPending;
  const onSpin = () => {
    if (lock.current || !canSpin) return;
    lock.current = true;
    setResult(null);
    spin.mutate(undefined, {
      onSuccess: (data) => {
        setResult({ amount: data.rewardAmount, balance: data.balanceMinutes });
        setClaimDate(data.status.prizeDate);
        void refreshCitizen();
        void queryClient.invalidateQueries({ queryKey: getGetHourglassStatusQueryKey() });
      },
      onError: () => { lock.current = false; },
      onSettled: () => { lock.current = false; },
    });
  };
  const tiers = status?.tiers ?? [];
  const totalRemaining = tiers.reduce((sum, tier) => sum + tier.remainingQuantity, 0);

  return <Layout><div className="hourglass-page" data-testid="page-hourglass">
    <header className="hg-header">
      <div><div className="hg-kicker"><span className="hg-live-dot" /> CITIZEN REWARD SYSTEM / 01</div><h1>Daily <em>Hourglass</em></h1><p>One turn. A shared pool. A little more time in your hands.</p></div>
      <div className="hg-reset" data-testid="status-reset-countdown"><Clock3 size={16}/><span><small>NEXT UTC RESET</small><strong>{countdown}</strong></span></div>
    </header>

    {(!citizen || !authToken) && <section className="hg-message" data-testid="status-auth-required"><AlertTriangle/><div><strong>Citizen session required</strong><p>Sign in to see today’s pool and claim your daily reward.</p></div></section>}
    {statusQuery.isLoading && citizen && authToken && <div className="hg-skeleton" data-testid="loading-hourglass"><i/><i/><i/></div>}
    {statusQuery.isError && <section className="hg-message hg-error" role="alert" data-testid="status-hourglass-error"><AlertTriangle/><div><strong>Hourglass unavailable</strong><p>We couldn’t reach the reward system. Try again in a moment.</p><button data-testid="button-retry-hourglass" onClick={() => void statusQuery.refetch()}><RefreshCw size={15}/> Retry</button></div></section>}
    {status && <>
      <div className="hg-main-grid">
        <section className={`hg-machine ${spin.isPending ? "is-spinning" : ""}`} aria-label="Daily reward hourglass">
          <div className="hg-machine-top"><span>POOL OPEN · {status.prizeDate}</span><span className="hg-machine-mark">TN / 24</span></div>
          <div className="hg-machine-art" data-testid="visual-hourglass">
            <div className="hg-orbit orbit-one"/><div className="hg-orbit orbit-two"/>
            <div className="hg-glass">
              <div className="hg-bulb hg-upper"><span className="hg-sand upper-sand"/></div>
              <div className="hg-neck"><span className="hg-stream"/></div>
              <div className="hg-bulb hg-lower"><span className="hg-sand lower-sand"/></div>
            </div>
            <div className="hg-frame-top"/><div className="hg-frame-bottom"/><div className="hg-particle p1"/><div className="hg-particle p2"/><div className="hg-particle p3"/>
          </div>
          <div className="hg-machine-status"><span className="status-led"/>{status.enabled ? (status.alreadySpun ? "CLAIM RECORDED FOR TODAY" : "READY FOR YOUR TURN") : "SYSTEM PAUSED"}</div>
          <button className="hg-spin-button" onClick={onSpin} disabled={!canSpin} data-testid="button-spin-hourglass">
            <RotateCw size={17} className={spin.isPending ? "spin-icon" : ""}/>{spin.isPending ? "TURNING THE GLASS…" : "FLIP & SPIN"}<span>↗</span>
          </button>
          <p className="hg-once-note">{status.alreadySpun ? "Your daily claim is complete. Return after the UTC reset." : !status.enabled ? "Daily rewards are temporarily paused." : totalRemaining === 0 ? "Today’s shared pool is empty." : "One claim per citizen, each UTC day."}</p>
        </section>

        <section className="hg-pool-panel">
          <div className="hg-section-label"><span>01 / LIVE DISTRIBUTION</span><span className="hg-pool-count"><Layers3 size={14}/> {totalRemaining} LEFT</span></div>
          <h2>Today’s shared pool</h2><p className="hg-panel-copy">Amounts are drawn from finite stock. When a tier is gone, it’s gone until replenished.</p>
          <div className="hg-tier-list" data-testid="list-prize-tiers">
            {[...tiers].sort((a,b) => a.rewardAmount-b.rewardAmount).map((tier, index) => <div className="hg-tier" key={tier.rewardAmount} data-testid={`tier-reward-${tier.rewardAmount}`}>
              <span className={`hg-tier-index tone-${index}`}>0{index+1}</span><strong>{tier.rewardAmount}<small> D</small></strong>
              <div className="hg-tier-stock"><span>{tier.remainingQuantity}<small> / {tier.dailyQuantity} remaining</small></span><div className="hg-stock-track"><i style={{ width: `${tier.dailyQuantity ? Math.max(0, Math.min(100, tier.remainingQuantity / tier.dailyQuantity * 100)) : 0}%` }}/></div></div>
              <span className="hg-probability">{tier.probabilityPercent}%<small>CHANCE</small></span>
            </div>)}
          </div>
          {tiers.length === 0 && <div className="hg-empty" data-testid="status-empty-pool"><Layers3/><strong>No reward tiers published</strong><span>The pool has no prizes available today.</span></div>}
          <div className="hg-balance"><div><span>YOUR TIME BALANCE</span><small>Citizen account</small></div><strong data-testid="text-hourglass-balance">{(result?.balance ?? status.balanceMinutes).toLocaleString(undefined, { maximumFractionDigits: 2 })}<small> D</small></strong></div>
        </section>
      </div>
      {status.tiers.every(t => t.remainingQuantity === 0) && <div className="hg-empty-banner" data-testid="status-pool-empty"><Layers3/><span><strong>Today’s pool has run dry.</strong> The shared reserve resets at 00:00 UTC.</span></div>}
    </>}

    {spin.isError && <div className="hg-toast hg-toast-error" role="alert" data-testid="status-spin-error"><AlertTriangle size={18}/><span><strong>Spin not completed</strong><small>{(spin.error as Error)?.message || "The claim could not be processed. Your daily turn is still available."}</small></span></div>}
    {result && <div className="hg-reward-reveal" role="status" data-testid="status-spin-result"><div className="hg-reward-icon"><Sparkles/></div><div><small>YOUR EXACT REWARD</small><strong>+{result.amount} <em>DarMin</em></strong><span>New balance: {result.balance.toLocaleString(undefined, { maximumFractionDigits: 2 })} D</span></div><button aria-label="Dismiss reward message" data-testid="button-dismiss-reward" onClick={() => setResult(null)}>×</button></div>}
    <footer className="hg-footer"><TimerReset size={14}/> Pool quantities are shared across all citizens. Resets daily at 00:00 UTC.</footer>
  </div></Layout>;
}
