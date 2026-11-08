import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, RefreshCw, Save, ShieldCheck, RotateCw, Layers3, Activity } from "lucide-react";
import { getGetAdminHourglassQueryKey, getGetHourglassStatusQueryKey, useGetAdminHourglass, useRefillAdminHourglass, useUpdateAdminHourglass } from "@workspace/api-client-react";
import type { HourglassConfigInput } from "@workspace/api-client-react";
import { Layout } from "@/components/Layout";
import { useCitizen } from "@/context/CitizenContext";
import "./hourglass.css";

const REWARD_AMOUNTS = [1, 3, 5, 10, 60] as const;

type TierInput = HourglassConfigInput["tiers"][number];
function errorText(error: unknown) { return (error as Error)?.message || "The request could not be completed. Try again."; }

export function AdminHourglass() {
  const { authHeaders } = useCitizen();
  const queryClient = useQueryClient();
  const adminQuery = useGetAdminHourglass({ query: { queryKey: getGetAdminHourglassQueryKey() }, request: { headers: authHeaders } });
  const save = useUpdateAdminHourglass({ request: { headers: authHeaders } });
  const refill = useRefillAdminHourglass({ request: { headers: authHeaders } });
  const [enabled, setEnabled] = useState(true);
  const [quantities, setQuantities] = useState<Record<number, number>>({ 1: 0, 3: 0, 5: 0, 10: 0, 60: 0 });
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  useEffect(() => { document.title = "Hourglass control — TimeNation"; }, []);
  useEffect(() => {
    if (!adminQuery.data || ready) return;
    setEnabled(adminQuery.data.enabled);
    setQuantities(Object.fromEntries(REWARD_AMOUNTS.map(amount => [amount, adminQuery.data.tiers.find(t => t.rewardAmount === amount)?.dailyQuantity ?? 0])));
    setReady(true);
  }, [adminQuery.data, ready]);
  const updateQuantity = (amount: number, value: string) => {
    const next = Number(value);
    setQuantities(current => ({ ...current, [amount]: Number.isFinite(next) ? Math.max(0, Math.min(10000, Math.floor(next))) : 0 }));
    setNotice(null);
  };
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: getGetAdminHourglassQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getGetHourglassStatusQueryKey() });
  };
  const saveSettings = () => {
    const payload: HourglassConfigInput = { enabled, tiers: REWARD_AMOUNTS.map(rewardAmount => ({ rewardAmount, dailyQuantity: quantities[rewardAmount] ?? 0 } as TierInput)) };
    setNotice(null);
    save.mutate({ data: payload }, { onSuccess: () => { invalidate(); setNotice({ kind: "success", text: "Configuration saved. New quantities apply to future daily pools." }); }, onError: error => setNotice({ kind: "error", text: errorText(error) }) });
  };
  const refillToday = () => {
    if (!window.confirm("Refill today's pool from the saved quantities? This replaces all remaining prizes for today.")) return;
    setNotice(null);
    refill.mutate(undefined, { onSuccess: () => { invalidate(); setNotice({ kind: "success", text: "Today’s pool has been refilled from the saved quantities." }); }, onError: error => setNotice({ kind: "error", text: errorText(error) }) });
  };
  const data = adminQuery.data;
  const configuredTotal = REWARD_AMOUNTS.reduce((sum, amount) => sum + (quantities[amount] ?? 0), 0);
  const cards = data ? [
    { label: "SPINS TODAY", value: data.totalSpinsToday.toLocaleString(), unit: "citizen turns", icon: Activity },
    { label: "DARMIN DISTRIBUTED", value: data.totalDarminsDistributed.toLocaleString(), unit: "today’s total", icon: Check },
    { label: "PRIZES REMAINING", value: data.remainingPrizes.toLocaleString(), unit: "in shared pool", icon: Layers3 },
  ] : [];

  return <Layout><div className="hourglass-page admin-hourglass" data-testid="page-admin-hourglass">
    <header className="hg-header"><div><div className="hg-kicker"><span className="hg-live-dot"/> OPERATIONS / REWARD CONTROL</div><h1>Hourglass <em>control</em></h1><p>Shape the daily reserve. Monitor the citizen draw in real time.</p></div><div className="hg-admin-badge"><ShieldCheck size={16}/> ADMIN CONSOLE</div></header>
    {adminQuery.isLoading && <div className="hg-skeleton" data-testid="loading-admin-hourglass"><i/><i/><i/></div>}
    {adminQuery.isError && <section className="hg-message hg-error" role="alert" data-testid="status-admin-error"><AlertTriangle/><div><strong>Control data unavailable</strong><p>Admin access or the service may be unavailable. The server controls authorization.</p><button data-testid="button-retry-admin-hourglass" onClick={() => void adminQuery.refetch()}><RefreshCw size={15}/> Retry</button></div></section>}
    {data && <>
      <section className="hg-admin-stats" aria-label="Today's Hourglass statistics">{cards.map(({ label, value, unit, icon: Icon }) => <article className="hg-stat-card" key={label} data-testid={`stat-${label.toLowerCase().replaceAll(" ", "-")}`}><span className="hg-stat-icon"><Icon size={17}/></span><span className="hg-stat-label">{label}</span><strong>{value}</strong><small>{unit}</small></article>)}</section>
      <div className="hg-admin-grid">
        <section className="hg-admin-config">
          <div className="hg-section-label"><span>01 / CONFIGURATION</span><span className="hg-config-date">POOL DATE · {data.prizeDate}</span></div>
          <h2>Prize architecture</h2><p className="hg-panel-copy">Set the target stock issued when a new daily pool is created.</p>
          <label className="hg-toggle-row" htmlFor="hg-enabled"><span><strong>Daily Hourglass</strong><small>Citizens can make one claim per UTC day</small></span><input id="hg-enabled" type="checkbox" checked={enabled} onChange={event => { setEnabled(event.target.checked); setNotice(null); }} data-testid="input-hourglass-enabled"/><span className="hg-toggle" aria-hidden="true"/></label>
          <div className="hg-config-table"><div className="hg-table-head"><span>REWARD TIER</span><span>DAILY QUANTITY</span><span>TODAY LEFT</span></div>
            {REWARD_AMOUNTS.map((amount, index) => { const tier = data.tiers.find(item => item.rewardAmount === amount); const chance = configuredTotal ? ((quantities[amount] ?? 0) / configuredTotal * 100).toFixed(2) : "0.00"; return <div className="hg-config-row" key={amount} data-testid={`row-admin-tier-${amount}`}><div className="hg-config-tier"><span className={`hg-tier-index tone-${index}`}>0{index + 1}</span><strong>{amount}<small> D</small></strong></div><label className="hg-quantity-wrap"><span className="sr-only">Daily quantity for {amount} DarMin rewards</span><input type="number" min="0" max="10000" step="1" value={quantities[amount] ?? 0} onChange={event => updateQuantity(amount, event.target.value)} data-testid={`input-quantity-${amount}`}/><span className="hg-quantity-meta"><span>prizes / day</span><span data-testid={`text-probability-${amount}`}>{chance}% probability</span></span></label><span className="hg-current-stock" data-testid={`text-remaining-${amount}`}>{tier?.remainingQuantity ?? 0}<small> in pool</small></span></div>; })}
          </div>
          <div className="hg-config-actions"><button className="hg-save-button" onClick={saveSettings} disabled={save.isPending} data-testid="button-save-hourglass"><Save size={16}/>{save.isPending ? "SAVING…" : "SAVE CONFIGURATION"}</button></div>
          <div className="hg-info-note" data-testid="notice-future-quantities"><AlertTriangle size={17}/><p><strong>Changes are staged for future pools.</strong> Quantity edits will not change today’s remaining stock. To update the live pool, save first, then use the refill control.</p></div>
        </section>
        <aside className="hg-refill-panel"><div className="hg-refill-orbit"><div className="hg-refill-symbol"><RotateCw size={28}/></div></div><div className="hg-section-label"><span>02 / LIVE POOL</span></div><h2>Refill today</h2><p>Rebuild today’s shared stock using the quantities currently saved in configuration.</p><div className="hg-refill-total"><span>REMAINING RIGHT NOW</span><strong>{data.remainingPrizes}<small> prizes</small></strong></div><button className="hg-refill-button" onClick={refillToday} disabled={refill.isPending} data-testid="button-refill-today"><RefreshCw size={16} className={refill.isPending ? "spin-icon" : ""}/>{refill.isPending ? "REFILLING…" : "REFILL TODAY’S POOL"}</button><small className="hg-refill-warning">Manual refill replaces the live stock for today.</small></aside>
      </div>
    </>}
    {notice && <div className={`hg-toast ${notice.kind === "error" ? "hg-toast-error" : "hg-toast-success"}`} role={notice.kind === "error" ? "alert" : "status"} data-testid={`status-admin-${notice.kind}`}><span className="hg-toast-mark">{notice.kind === "error" ? <AlertTriangle size={18}/> : <Check size={18}/>}</span><span><strong>{notice.kind === "error" ? "Action not completed" : "Updated"}</strong><small>{notice.text}</small></span><button onClick={() => setNotice(null)} aria-label="Dismiss notice" data-testid="button-dismiss-admin-notice">×</button></div>}
    <footer className="hg-footer"><ShieldCheck size={14}/> Administrative actions are logged and enforced by the server.</footer>
  </div></Layout>;
}
