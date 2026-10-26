import { useCallback, useEffect, useMemo, useState } from "react";
import { Layout } from "@/components/Layout";
import { useCitizen } from "@/context/CitizenContext";
import {
  AlertCircle, ArrowUpRight, BadgeCheck, CalendarClock, Check, ChevronRight,
  CircleHelp, Clock3, Download, FileText, Fingerprint, LoaderCircle, LockKeyhole,
  Network, Shield, Sparkles, WalletCards,
} from "lucide-react";

type Config = {
  network: string;
  chainId: number;
  royaltyBps: number;
  royaltyRecipient: string;
  contractConfigured: boolean;
  legalTextStatus: string;
};

type License = {
  certificateId?: string | number;
  id?: string | number;
  minuteTimestamp?: string;
  timelineCoord?: string;
  ownerName?: string;
  customTitle?: string;
  customDescription?: string;
  status?: string;
  nftStatus?: string;
  transactionHash?: string | null;
  tokenId?: string | number | null;
  explorerUrl?: string | null;
  [key: string]: unknown;
};

type Availability = {
  timestamp: string;
  available: boolean;
  reserved: boolean;
  license?: License;
};

type ApiError = { error?: string; message?: string };
const TREASURY = "0x4a290953E0A4c9374901939D5612AFDAAf99312b";

async function readJson<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({})) as T & ApiError;
  if (!response.ok) throw new Error(payload.error || payload.message || `Request failed (${response.status})`);
  return payload;
}

function toMinuteValue(date: string, time: string) {
  return `${date} ${time}`;
}

function asCoordinate(date: string, time: string) {
  return `${date.replaceAll("-", "")}${time.replace(":", "")}`;
}

function prettyMinute(value?: string) {
  if (!value) return "Minute not supplied";
  if (/^\d{12}$/.test(value)) {
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)} ${value.slice(8, 10)}:${value.slice(10, 12)} UTC`;
  }
  const parsed = new Date(value.replace(" ", "T"));
  return Number.isNaN(parsed.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, {
        year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit",
      }).format(parsed);
}

function recordId(license: License) {
  return license.certificateId ?? license.id ?? "";
}

export function Timenaming() {
  const { citizen, authToken, refreshCitizen } = useCitizen();
  const [config, setConfig] = useState<Config | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [configError, setConfigError] = useState("");
  const [licenses, setLicenses] = useState<License[]>([]);
  const [mineLoading, setMineLoading] = useState(false);
  const [mineError, setMineError] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState("");
  const [ownerName, setOwnerName] = useState(citizen?.name ?? "");
  const [customTitle, setCustomTitle] = useState("");
  const [customDescription, setCustomDescription] = useState("");
  const [reserveError, setReserveError] = useState("");
  const [reserveSuccess, setReserveSuccess] = useState("");
  const [reserving, setReserving] = useState(false);
  const [working, setWorking] = useState<string | null>(null);

  const authHeaders = useMemo<Record<string, string>>(
    () => authToken ? { Authorization: `Bearer ${authToken}` } : {} as Record<string, string>,
    [authToken],
  );
  const minuteValue = date && time ? toMinuteValue(date, time) : "";
  const [walletAddress, setWalletAddress] = useState("");
  const [walletError, setWalletError] = useState("");
  const enoughBalance = (citizen?.balanceMinutes ?? 0) > 1;

  useEffect(() => {
    if (!walletAddress && citizen?.walletAddress && /^0x[a-fA-F0-9]{40}$/.test(citizen.walletAddress)) {
      setWalletAddress(citizen.walletAddress);
    }
  }, [citizen?.walletAddress, walletAddress]);

  async function connectEvmWallet() {
    setWalletError("");
    const ethereum = (window as Window & {
      ethereum?: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> };
    }).ethereum;
    if (!ethereum) {
      setWalletError("No EVM wallet was detected. Install MetaMask or enter a public address.");
      return;
    }
    try {
      const chainId = await ethereum.request({ method: "eth_chainId" });
      if (String(chainId).toLowerCase() !== "0xaa36a7") {
        await ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0xaa36a7" }] });
      }
      const accounts = await ethereum.request({ method: "eth_requestAccounts" });
      const address = Array.isArray(accounts) ? accounts[0] : null;
      if (typeof address !== "string" || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
        throw new Error("The connected wallet did not return a valid EVM address.");
      }
      setWalletAddress(address);
    } catch (error) {
      setWalletError(error instanceof Error ? error.message : "Wallet connection was declined.");
    }
  }

  const loadMine = useCallback(async () => {
    if (!authToken) {
      setLicenses([]);
      setMineError("");
      return;
    }
    setMineLoading(true);
    setMineError("");
    try {
      const result = await readJson<{ licenses: License[] }>(
        await fetch("/api/v1/timenaming/mine", { headers: authHeaders }),
      );
      setLicenses(Array.isArray(result.licenses) ? result.licenses : []);
    } catch (error) {
      setMineError(error instanceof Error ? error.message : "Could not load your placements.");
    } finally {
      setMineLoading(false);
    }
  }, [authHeaders, authToken]);

  useEffect(() => {
    let active = true;
    setConfigLoading(true);
    fetch("/api/v1/timenaming/config")
      .then(readJson<Config>)
      .then(value => { if (active) { setConfig(value); setConfigError(""); } })
      .catch(error => { if (active) setConfigError(error instanceof Error ? error.message : "Configuration could not be loaded."); })
      .finally(() => { if (active) setConfigLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => { void loadMine(); }, [loadMine]);
  useEffect(() => {
    if (citizen?.name) setOwnerName(citizen.name);
  }, [citizen?.name]);

  async function checkMinute(event: React.FormEvent) {
    event.preventDefault();
    setCheckError("");
    setAvailability(null);
    setReserveSuccess("");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
      setCheckError("Choose a valid date and minute before checking.");
      return;
    }
    setChecking(true);
    try {
      const coord = asCoordinate(date, time);
      const result = await readJson<Availability>(
        await fetch(`/api/v1/timenaming/check/${coord}`),
      );
      setAvailability(result);
    } catch (error) {
      setCheckError(error instanceof Error ? error.message : "Availability could not be checked.");
    } finally {
      setChecking(false);
    }
  }

  async function reserveMinute(event: React.FormEvent) {
    event.preventDefault();
    setReserveError("");
    setReserveSuccess("");
    if (!authToken || !citizen) {
      setReserveError("Sign in as a citizen to reserve a minute.");
      return;
    }
    if (!availability?.available || availability.reserved || !minuteValue) {
      setReserveError("Check an available minute before continuing.");
      return;
    }
    if (!walletAddress) {
      setReserveError("A wallet address is not connected to this citizen profile.");
      return;
    }
    setReserving(true);
    try {
      const result = await readJson<{ license: License; newBalance: number }>(
        await fetch("/api/v1/timenaming/reserve", {
          method: "POST",
          headers: { ...authHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({
            minuteTimestamp: minuteValue,
            ownerName: ownerName.trim(),
            customTitle: customTitle.trim(),
            customDescription: customDescription.trim(),
            walletAddress,
          }),
        }),
      );
      setAvailability({ timestamp: asCoordinate(date, time), available: false, reserved: true, license: result.license });
      setReserveSuccess(`Placement license issued. Balance: ${result.newBalance} Д.`);
      setCustomTitle("");
      setCustomDescription("");
      void refreshCitizen();
      void loadMine();
    } catch (error) {
      setReserveError(error instanceof Error ? error.message : "Reservation could not be completed.");
    } finally {
      setReserving(false);
    }
  }

  async function generateCertificate(license: License) {
    const id = recordId(license);
    if (!id || !authToken) return;
    setWorking(`certificate-${id}`);
    try {
      const result = await readJson<{ downloadUrl: string; certificateId: string | number }>(
        await fetch(`/api/v1/timenaming/${encodeURIComponent(String(id))}/generate-certificate`, {
          method: "POST", headers: authHeaders,
        }),
      );
      const response = await fetch(result.downloadUrl, { headers: authHeaders });
      if (!response.ok) throw new Error("Certificate download failed. Generate it again and retry.");
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `timenation-license-${result.certificateId}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
      setMineError("");
    } catch (error) {
      setMineError(error instanceof Error ? error.message : "Certificate could not be generated.");
    } finally {
      setWorking(null);
    }
  }

  async function mintNft(license: License) {
    const id = recordId(license);
    if (!id || !authToken) return;
    setWorking(`mint-${id}`);
    setMineError("");
    try {
      await readJson<{ status: string; transactionHash: string; tokenId: string | number; explorerUrl: string }>(
        await fetch(`/api/v1/timenaming/${encodeURIComponent(String(id))}/mint-nft`, {
          method: "POST", headers: authHeaders,
        }),
      );
      await loadMine();
    } catch (error) {
      setMineError(error instanceof Error ? error.message : "NFT minting is currently unavailable.");
    } finally {
      setWorking(null);
    }
  }

  return (
    <Layout>
      <div className="tn-page" data-testid="page-timenaming">
        <header className="tn-hero">
          <div className="tn-hero-copy">
            <div className="tn-kicker"><span className="tn-kicker-mark" /> CITIZEN RECORD · TIME NATION</div>
            <h1>Give one minute<br /><em>a place in history.</em></h1>
            <p>Reserve a historical minute, receive its documented placement license, and follow the separate path toward a Sepolia NFT.</p>
            <div className="tn-hero-note"><LockKeyhole size={15} /> A reservation is a citizen record. It is not an on-chain token.</div>
          </div>
          <div className="tn-dial" aria-label="A minute marked on a circular timeline" data-testid="visual-minute-dial">
            <div className="tn-dial-ring tn-ring-one" />
            <div className="tn-dial-ring tn-ring-two" />
            <div className="tn-dial-tick tn-tick-a" /><div className="tn-dial-tick tn-tick-b" />
            <div className="tn-dial-tick tn-tick-c" /><div className="tn-dial-tick tn-tick-d" />
            <div className="tn-dial-center"><span>ONE</span><strong>MINUTE</strong><small>IN TIME</small></div>
            <span className="tn-dial-label tn-label-top">00</span>
            <span className="tn-dial-label tn-label-right">15</span>
            <span className="tn-dial-label tn-label-bottom">30</span>
            <span className="tn-dial-label tn-label-left">45</span>
          </div>
          <div className="tn-hero-index"><span>01</span><span>THE RECORDING OF TIME</span></div>
        </header>

        <section className="tn-facts" aria-label="Reservation facts">
          <div className="tn-fact"><span className="tn-fact-label">RESERVATION COST</span><strong>1 <i>Д</i></strong><small>Transferable time currency</small></div>
          <div className="tn-fact"><span className="tn-fact-label">NETWORK</span><strong>{configLoading ? "…" : config?.network || "Sepolia"}</strong><small>{configLoading ? "Checking configuration" : `Chain ID ${config?.chainId ?? 11155111}`}</small></div>
          <div className="tn-fact"><span className="tn-fact-label">NFT ROYALTY</span><strong>2<span className="tn-percent">%</span></strong><small>Paid to the stated treasury</small></div>
          <div className="tn-fact tn-fact-status"><span className="tn-fact-label">PLACEMENT STATUS</span><strong><span className="tn-status-dot" /> {citizen ? "Citizen session" : "Sign-in required"}</strong><small>{citizen ? "Your record is private to your account" : "A profile is needed to reserve"}</small></div>
        </section>

        {configError && (
          <div className="tn-alert tn-alert-error" role="alert" data-testid="error-config">
            <AlertCircle size={17} /><span>{configError}</span>
            <button type="button" onClick={() => { setConfigError(""); setConfigLoading(true); fetch("/api/v1/timenaming/config").then(readJson<Config>).then(setConfig).catch(error => setConfigError(error instanceof Error ? error.message : "Configuration could not be loaded.")).finally(() => setConfigLoading(false)); }} data-testid="button-retry-config">Retry</button>
          </div>
        )}

        <div className="tn-main-grid">
          <section className="tn-reserve-panel" data-testid="section-reservation">
            <div className="tn-section-heading">
              <div><span className="tn-overline">THE MINUTE REGISTER</span><h2>Choose your minute</h2></div>
              <span className="tn-step-badge">01 / 03</span>
            </div>
            <p className="tn-section-intro">Check a date and minute first. Availability is verified before a placement can be submitted.</p>

            <form onSubmit={checkMinute} className="tn-check-form">
              <label className="tn-field">
                <span>Historical date</span>
                <input aria-label="Historical date" type="date" value={date} onChange={event => { setDate(event.target.value); setAvailability(null); setCheckError(""); setReserveSuccess(""); }} data-testid="input-minute-date" />
              </label>
              <label className="tn-field">
                <span>Minute · UTC</span>
                <input aria-label="Minute" type="time" step="60" value={time} onChange={event => { setTime(event.target.value); setAvailability(null); setCheckError(""); setReserveSuccess(""); }} data-testid="input-minute-time" />
              </label>
              <button className="tn-button tn-button-check" type="submit" disabled={checking || !date || !time} data-testid="button-check-minute">
                {checking ? <LoaderCircle size={16} className="tn-spin" /> : <CalendarClock size={16} />}
                {checking ? "Checking minute" : "Check minute"}
                {!checking && <ChevronRight size={16} />}
              </button>
            </form>

            {checking && <div className="tn-checking" role="status" data-testid="loading-minute-check"><span className="tn-skeleton-line" /><span>Checking the historical register…</span></div>}
            {checkError && <div className="tn-inline-message tn-inline-error" role="alert" data-testid="error-minute-check"><AlertCircle size={17} />{checkError}</div>}
            {availability && (
              <div className={`tn-availability ${availability.available && !availability.reserved ? "is-available" : "is-reserved"}`} role="status" data-testid="status-minute-availability">
                <div className="tn-availability-icon">{availability.available && !availability.reserved ? <Check size={20} /> : <LockKeyhole size={18} />}</div>
                <div><strong>{availability.available && !availability.reserved ? "This minute is available" : "This minute is already reserved"}</strong><span>{prettyMinute(minuteValue)}</span></div>
                <span className="tn-availability-tag">{availability.available && !availability.reserved ? "AVAILABLE" : "RESERVED"}</span>
              </div>
            )}
            {reserveSuccess && <div className="tn-inline-message tn-inline-success" role="status" data-testid="success-reservation"><BadgeCheck size={18} />{reserveSuccess}</div>}

            {availability?.available && !availability.reserved && (
              <form className="tn-license-form" onSubmit={reserveMinute} data-testid="form-reservation">
                <div className="tn-form-divider"><span>PLACEMENT LICENSE DETAILS</span><span>02 / 03</span></div>
                <label className="tn-field">
                  <span>Name on the record</span>
                  <input value={ownerName} onChange={event => setOwnerName(event.target.value)} required maxLength={120} data-testid="input-owner-name" />
                </label>
                <label className="tn-field">
                  <span>Minute title</span>
                  <input value={customTitle} onChange={event => setCustomTitle(event.target.value)} required maxLength={160} placeholder="Name this moment" data-testid="input-minute-title" />
                </label>
                <label className="tn-field">
                  <span>Historical note <small>Optional</small></span>
                  <textarea value={customDescription} onChange={event => setCustomDescription(event.target.value)} rows={3} maxLength={2000} placeholder="Add context that should accompany this placement." data-testid="input-minute-description" />
                </label>
                <div className="tn-wallet-line">
                  <WalletCards size={16} />
                  <div><span>Sepolia EVM wallet</span><strong>{walletAddress ? `${walletAddress.slice(0, 7)}…${walletAddress.slice(-5)}` : "Not connected"}</strong></div>
                  <button type="button" className="tn-outline-button" onClick={() => void connectEvmWallet()} data-testid="button-connect-evm-wallet">Connect MetaMask</button>
                </div>
                <label className="tn-field">
                  <span>Or enter a public EVM address</span>
                  <input value={walletAddress} onChange={event => setWalletAddress(event.target.value.trim())} placeholder="0x…" maxLength={42} data-testid="input-evm-wallet-address" />
                </label>
                {walletError && <div className="tn-inline-message tn-inline-error" role="alert" data-testid="error-wallet">{walletError}</div>}
                {!citizen && <p className="tn-form-hint">Sign in to reserve. No private key or secret is requested.</p>}
                {citizen && !walletAddress && <p className="tn-form-hint">Connect MetaMask on Sepolia or enter the public EVM address that should receive the NFT.</p>}
                {citizen && !enoughBalance && <p className="tn-form-hint">Your balance must be greater than 1 Д so the inherited minute stays protected.</p>}
                <div className="tn-cost-confirm"><span><strong>1 Д</strong> will be deducted from your transferable balance.</span><span>INHERITED MINUTES ARE PROTECTED</span></div>
                {reserveError && <div className="tn-inline-message tn-inline-error" role="alert" data-testid="error-reservation"><AlertCircle size={17} />{reserveError}</div>}
                <button className="tn-button tn-button-primary" type="submit" disabled={reserving || !citizen || !walletAddress || !enoughBalance} data-testid="button-reserve-minute">
                  {reserving ? <LoaderCircle size={16} className="tn-spin" /> : <Fingerprint size={17} />}
                  {reserving ? "Issuing placement license…" : "Reserve this minute"}
                  {!reserving && <ArrowUpRight size={16} />}
                </button>
                <p className="tn-draft-copy" data-testid="status-terms-draft"><CircleHelp size={14} /> Terms are a draft pending legal review. This reservation is not an NFT.</p>
              </form>
            )}
          </section>

          <aside className="tn-aside">
            <section className="tn-process-card">
              <span className="tn-overline">A CLEAR DISTINCTION</span>
              <h3>Record first.<br />Chain, if available.</h3>
              <div className="tn-process-step"><span className="tn-process-number">01</span><div><strong>Reserve</strong><p>Spend 1 transferable Д to request a historical minute.</p></div><span className="tn-process-state">CITIZEN RECORD</span></div>
              <div className="tn-process-step"><span className="tn-process-number">02</span><div><strong>Document</strong><p>Generate a placement license PDF for your record.</p></div><span className="tn-process-state">LICENSE</span></div>
              <div className="tn-process-step"><span className="tn-process-number">03</span><div><strong>Mint, if configured</strong><p>NFT issuance is a separate action on Sepolia, not part of reservation.</p></div><span className="tn-process-state tn-process-pending">SEPOLIA</span></div>
              <div className="tn-process-foot"><Shield size={16} /><span>One-minute placements are bound to a unique historical minute. Inherited minutes are protected.</span></div>
            </section>
            <section className="tn-network-card">
              <div className="tn-network-icon"><Network size={18} /></div>
              <div><span className="tn-overline">NETWORK DETAILS</span><strong>{configLoading ? "Loading configuration" : config?.network || "Sepolia"}</strong><small>Royalty · 2% <span>({config?.royaltyBps ?? 200} bps)</span></small></div>
              <span className={`tn-contract-dot ${config?.contractConfigured ? "configured" : ""}`} title={config?.contractConfigured ? "Contract configured" : "Contract not configured"} />
              <div className="tn-treasury"><span>ROYALTY TREASURY</span><code>{config?.royaltyRecipient || TREASURY}</code></div>
              {config && config.royaltyRecipient && config.royaltyRecipient.toLowerCase() !== TREASURY.toLowerCase() && <div className="tn-config-note">The configured royalty recipient differs from the published treasury reference.</div>}
            </section>
          </aside>
        </div>

        <section className="tn-records" data-testid="section-my-placements">
          <div className="tn-records-heading">
            <div><span className="tn-overline">YOUR CITIZEN RECORD</span><h2>My placements <span>{licenses.length}</span></h2></div>
            <button type="button" className="tn-refresh-button" onClick={() => void loadMine()} disabled={!authToken || mineLoading} data-testid="button-refresh-placements">
              {mineLoading ? <LoaderCircle size={15} className="tn-spin" /> : <Sparkles size={15} />} Refresh record
            </button>
          </div>
          {!authToken ? (
            <div className="tn-empty-state" data-testid="empty-placements"><div className="tn-empty-icon"><FileText size={21} /></div><div><strong>Your placements will appear here</strong><p>Sign in as a citizen to view issued placement licenses.</p></div></div>
          ) : mineLoading ? (
            <div className="tn-record-skeleton" data-testid="loading-placements"><span /><span /><span /></div>
          ) : mineError ? (
            <div className="tn-empty-state tn-error-state" role="alert" data-testid="error-placements"><AlertCircle size={20} /><div><strong>Record unavailable</strong><p>{mineError}</p></div><button onClick={() => void loadMine()} data-testid="button-retry-placements">Try again</button></div>
          ) : licenses.length === 0 ? (
            <div className="tn-empty-state" data-testid="empty-placements"><div className="tn-empty-icon"><Clock3 size={21} /></div><div><strong>No placements yet</strong><p>When you reserve a minute, its license and NFT status will be shown here.</p></div></div>
          ) : (
            <div className="tn-license-list">
              {licenses.map((license, index) => {
                const id = recordId(license) || `record-${index}`;
                const nftComplete = !!(license.transactionHash || license.tokenId || license.nftStatus === "minted");
                return (
                  <article className="tn-license-row" key={String(id)} data-testid={`card-placement-${id}`}>
                    <div className="tn-record-date"><span>HISTORICAL MINUTE</span><strong>{prettyMinute(license.minuteTimestamp ?? license.timelineCoord)}</strong></div>
                    <div className="tn-record-title"><strong>{license.customTitle || "Untitled placement"}</strong><span>{license.ownerName || "Citizen"} · License {String(id)}</span></div>
                    <div className="tn-record-badges"><span className="tn-license-badge"><BadgeCheck size={13} /> LICENSED</span><span className={nftComplete ? "tn-nft-badge minted" : "tn-nft-badge"}>{nftComplete ? "ON-CHAIN" : "DRAFT / NOT ON-CHAIN"}</span></div>
                    {license.transactionHash && <a href={typeof license.explorerUrl === "string" ? license.explorerUrl : `https://sepolia.etherscan.io/tx/${license.transactionHash}`} target="_blank" rel="noreferrer" className="tn-tx-link" data-testid={`link-transaction-${id}`}>Transaction <ArrowUpRight size={13} /></a>}
                    <div className="tn-record-actions">
                      <button className="tn-outline-button" type="button" onClick={() => void generateCertificate(license)} disabled={working !== null || !recordId(license)} data-testid={`button-certificate-${id}`}>
                        {working === `certificate-${id}` ? <LoaderCircle size={14} className="tn-spin" /> : <Download size={14} />} Certificate
                      </button>
                      {!nftComplete && (
                        <button className="tn-mint-button" type="button" onClick={() => void mintNft(license)} disabled={working !== null || !config?.contractConfigured || !recordId(license)} title={!config?.contractConfigured ? "The relayer is not configured." : "Attempt NFT minting on Sepolia"} data-testid={`button-mint-${id}`}>
                          {working === `mint-${id}` ? <LoaderCircle size={14} className="tn-spin" /> : <Sparkles size={14} />} Mint NFT
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
          {mineError && licenses.length > 0 && <div className="tn-inline-message tn-inline-error" role="alert" data-testid="error-record-action"><AlertCircle size={17} />{mineError}</div>}
          <p className="tn-record-footnote"><span className="tn-legend-dot" /> “On-chain” appears only after a mint response is reflected in the license record. A generated PDF documents the placement; it does not mint an NFT.</p>
        </section>

        <footer className="tn-foot">
          <span>TIMENAMING / PLACEMENT LICENSE</span><span><span className="tn-foot-dot" /> {config?.contractConfigured ? "RELAYER CONFIGURED" : "NFT RELAYER STATUS IS CONFIGURATION-DEPENDENT"}</span>
        </footer>
      </div>
      <style>{styles}</style>
    </Layout>
  );
}

const styles = `
.tn-page{--tn-ink:#101d34;--tn-ink-soft:#21324c;--tn-gold:#c6a55e;--tn-gold-pale:#f2e8d0;--tn-paper:#f5f3ed;--tn-white:#fffefa;--tn-muted:#748093;--tn-line:#dedbd2;--tn-green:#527a64;color:#16243a;font-family:var(--app-font-sans),sans-serif;max-width:1160px;margin:0 auto;padding-bottom:32px}
.tn-hero{min-height:280px;background:var(--tn-ink);color:#f4f1e9;position:relative;overflow:hidden;display:flex;align-items:center;padding:40px 52px;margin:0 0 1px}
.tn-hero:before{content:"";position:absolute;inset:0;background:radial-gradient(ellipse at 74% 52%,rgba(198,165,94,.14),transparent 40%),linear-gradient(115deg,transparent 54%,rgba(255,255,255,.025) 54.1%,transparent 54.4%);pointer-events:none}
.tn-hero-copy{position:relative;z-index:1;max-width:590px}
.tn-kicker,.tn-overline,.tn-fact-label{font-family:var(--app-font-mono),monospace;font-size:9px;letter-spacing:.16em;color:#aab3c1}
.tn-kicker{display:flex;align-items:center;gap:10px;color:#d3bc83}
.tn-kicker-mark{width:20px;height:1px;background:var(--tn-gold)}
.tn-hero h1{font-size:clamp(34px,5vw,57px);line-height:1.02;letter-spacing:-.045em;margin:18px 0 12px;font-weight:600}
.tn-hero h1 em{font-family:Georgia,serif;font-weight:400;color:#dbc58e}
.tn-hero-copy>p{font-size:14px;line-height:1.65;color:#c3cad4;max-width:480px;margin:0}
.tn-hero-note{display:flex;align-items:center;gap:9px;color:#e1d4b0;font-family:var(--app-font-mono),monospace;font-size:10px;margin-top:22px}
.tn-dial{position:absolute;width:238px;height:238px;right:10%;top:50%;transform:translateY(-50%);border-radius:50%;border:1px solid rgba(198,165,94,.45);opacity:.95}
.tn-dial:before,.tn-dial:after{content:"";position:absolute;border-radius:50%;inset:17px;border:1px dashed rgba(198,165,94,.32)}
.tn-dial:after{inset:45px;border-style:solid;border-color:rgba(255,255,255,.12)}
.tn-dial-ring{position:absolute;border-radius:50%;border:1px solid rgba(255,255,255,.07);inset:7px}
.tn-ring-two{inset:28px}
.tn-dial-center{position:absolute;inset:68px;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(255,255,255,.035);border:1px solid rgba(198,165,94,.2)}
.tn-dial-center span,.tn-dial-center small{font-family:var(--app-font-mono),monospace;font-size:8px;letter-spacing:.2em;color:#b5a475}
.tn-dial-center strong{font-family:Georgia,serif;font-size:21px;font-weight:400;letter-spacing:.02em;color:#f3eddf}
.tn-dial-center small{font-size:7px;margin-top:3px}
.tn-dial-tick{position:absolute;width:4px;height:4px;background:var(--tn-gold);border-radius:50%;top:calc(50% - 2px);left:calc(50% - 2px)}
.tn-tick-a{transform:rotate(0deg) translateY(-110px)}.tn-tick-b{transform:rotate(90deg) translateY(-110px)}.tn-tick-c{transform:rotate(180deg) translateY(-110px)}.tn-tick-d{transform:rotate(270deg) translateY(-110px)}
.tn-dial-label{position:absolute;font:9px var(--app-font-mono),monospace;color:#a9a18b}.tn-label-top{top:12px;left:calc(50% - 5px)}.tn-label-right{right:13px;top:calc(50% - 5px)}.tn-label-bottom{bottom:12px;left:calc(50% - 5px)}.tn-label-left{left:13px;top:calc(50% - 5px)}
.tn-hero-index{position:absolute;right:22px;bottom:19px;display:flex;gap:10px;align-items:center;font:8px var(--app-font-mono),monospace;letter-spacing:.12em;color:#8993a2}.tn-hero-index span:first-child{color:#d5bd83}
.tn-facts{display:grid;grid-template-columns:repeat(4,1fr);background:var(--tn-white);border:1px solid var(--tn-line);border-top:0}
.tn-fact{min-height:97px;padding:18px 22px;border-right:1px solid var(--tn-line);display:flex;flex-direction:column;gap:4px}.tn-fact:last-child{border:0}.tn-fact-label{color:#89909a;font-size:8px}
.tn-fact strong{font-size:20px;line-height:1.1;font-weight:600;color:var(--tn-ink)}.tn-fact strong i{font-style:normal;color:#a78845}.tn-fact small{font-size:10px;color:#828a96}
.tn-percent{font-size:14px;color:#a78845}.tn-fact-status strong{font-size:13px;display:flex;align-items:center;gap:7px;margin-top:3px}.tn-status-dot,.tn-foot-dot{width:7px;height:7px;border-radius:50%;background:#bc9d5b;display:inline-block}
.tn-alert{display:flex;align-items:center;gap:10px;padding:12px 15px;margin:18px 0 0;border:1px solid #dec5bd;background:#fbf1ed;color:#8b443c;font-size:12px}.tn-alert button{margin-left:auto;background:transparent;border:0;text-decoration:underline;cursor:pointer;color:inherit}
.tn-main-grid{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(280px,.85fr);gap:20px;margin-top:22px;align-items:start}
.tn-reserve-panel,.tn-process-card,.tn-network-card,.tn-records{background:var(--tn-white);border:1px solid var(--tn-line)}
.tn-reserve-panel{padding:27px 29px}.tn-section-heading,.tn-records-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}
.tn-section-heading h2,.tn-records-heading h2{margin:7px 0 0;font-size:24px;letter-spacing:-.035em;color:var(--tn-ink);font-weight:600}
.tn-overline{color:#9a824d;font-size:8px}
.tn-step-badge{font:9px var(--app-font-mono),monospace;color:#788293;border:1px solid var(--tn-line);padding:7px 9px}
.tn-section-intro{font-size:12px;line-height:1.55;color:#798393;margin:10px 0 22px;max-width:520px}
.tn-check-form{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.tn-field{display:flex;flex-direction:column;gap:7px;min-width:0}.tn-field>span{font:9px var(--app-font-mono),monospace;letter-spacing:.08em;text-transform:uppercase;color:#697588}.tn-field input,.tn-field textarea{font:12px var(--app-font-sans),sans-serif;color:#1b2a40;background:#fcfbf8;border:1px solid #d9d7d0;border-radius:2px;padding:11px 12px;outline:none;width:100%;transition:border-color .18s,background .18s}.tn-field input:focus,.tn-field textarea:focus{border-color:#b79a5a;background:#fff}.tn-field textarea{resize:vertical;min-height:84px;line-height:1.5}.tn-field input::placeholder,.tn-field textarea::placeholder{color:#a0a6ae}.tn-field small{font:9px var(--app-font-sans),sans-serif;text-transform:none;letter-spacing:0;color:#9aa1aa}
.tn-button{min-height:43px;border:0;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:9px;font:600 11px var(--app-font-sans),sans-serif;letter-spacing:.02em;transition:background .18s,transform .18s,color .18s}.tn-button:hover:not(:disabled){transform:translateY(-1px)}.tn-button:disabled{opacity:.48;cursor:not-allowed}
.tn-button-check{grid-column:1/-1;background:#e9e4d8;color:#203049;border:1px solid #d8cfba}.tn-button-check:hover:not(:disabled){background:#ded4bd}
.tn-checking{margin-top:14px;display:flex;align-items:center;gap:10px;font:10px var(--app-font-mono),monospace;color:#718094}.tn-skeleton-line{height:7px;width:40px;background:linear-gradient(90deg,#e5e1d7,#f4f1e9,#e5e1d7);background-size:180% 100%;animation:tnShimmer 1.3s infinite}
.tn-availability{display:flex;align-items:center;gap:12px;margin-top:16px;padding:13px;border:1px solid}.tn-availability.is-available{background:#f1f5ef;border-color:#d4e0d2}.tn-availability.is-reserved{background:#f7f0ec;border-color:#e9d7d0}.tn-availability-icon{display:grid;place-items:center;width:34px;height:34px;flex:none;border-radius:50%;background:#fffefa;color:#53785e}.is-reserved .tn-availability-icon{color:#925d4e}.tn-availability>div:nth-child(2){display:flex;flex-direction:column;gap:3px}.tn-availability strong{font-size:12px;color:#243448}.tn-availability>div span{font:10px var(--app-font-mono),monospace;color:#798394}.tn-availability-tag{margin-left:auto;font:8px var(--app-font-mono),monospace;letter-spacing:.1em;color:#52785d}.is-reserved .tn-availability-tag{color:#996253}
.tn-inline-message{display:flex;align-items:center;gap:9px;margin-top:12px;padding:11px 12px;font-size:11px;line-height:1.45}.tn-inline-error{background:#fbf0ed;border:1px solid #ead4cc;color:#8e493e}.tn-inline-success{background:#eff5ef;border:1px solid #d5e3d5;color:#466b52}.tn-license-form{margin-top:22px;display:flex;flex-direction:column;gap:14px;animation:tnReveal .28s ease-out}
.tn-form-divider{display:flex;justify-content:space-between;border-top:1px solid var(--tn-line);padding-top:17px;font:8px var(--app-font-mono),monospace;letter-spacing:.12em;color:#9a824d}.tn-form-divider span:last-child{color:#929aa5}
.tn-wallet-line{border:1px solid var(--tn-line);background:#f8f7f2;padding:11px;display:flex;align-items:center;gap:10px;color:#657286}.tn-wallet-line>div{display:flex;flex-direction:column;gap:3px;min-width:0}.tn-wallet-line>div span{font:8px var(--app-font-mono),monospace;text-transform:uppercase;letter-spacing:.08em;color:#8993a0}.tn-wallet-line strong{font:10px var(--app-font-mono),monospace;color:#25344a}.tn-linked,.tn-unlinked{margin-left:auto;font:8px var(--app-font-mono),monospace;letter-spacing:.08em;color:#557b5f}.tn-unlinked{color:#a56a53}.tn-form-hint{font-size:10px;line-height:1.4;color:#927051;margin:-6px 0 0}
.tn-cost-confirm{display:flex;justify-content:space-between;gap:12px;align-items:center;background:#f5f1e6;border-left:2px solid var(--tn-gold);padding:11px 12px;font-size:10px;color:#687487}.tn-cost-confirm strong{color:#967a3d;font-size:13px}.tn-cost-confirm span:last-child{font:8px var(--app-font-mono),monospace;letter-spacing:.06em;color:#627465;text-align:right}
.tn-button-primary{background:var(--tn-ink);color:#f3ead7}.tn-button-primary:hover:not(:disabled){background:#1d304e}.tn-draft-copy{font-size:10px;line-height:1.45;color:#94764a;display:flex;align-items:flex-start;gap:7px;margin:0}.tn-draft-copy svg{flex:none;margin-top:1px}
.tn-aside{display:flex;flex-direction:column;gap:14px}.tn-process-card{padding:23px 22px;background:#f0eee7}.tn-process-card h3{font:400 25px/1.15 Georgia,serif;color:#17263c;margin:10px 0 20px;letter-spacing:-.02em}
.tn-process-step{display:grid;grid-template-columns:26px 1fr auto;gap:10px;align-items:start;border-top:1px solid #dad8ce;padding:13px 0}.tn-process-number{font:9px var(--app-font-mono),monospace;color:#a78d53;padding-top:2px}.tn-process-step strong{font-size:12px;color:#203049}.tn-process-step p{font-size:10px;line-height:1.45;color:#778191;margin:4px 0 0;max-width:170px}.tn-process-state{font:7px var(--app-font-mono),monospace;letter-spacing:.07em;color:#6e7e6e;background:#e4ebe1;padding:5px 6px;white-space:nowrap}.tn-process-pending{color:#876f3b;background:#eee7d6}.tn-process-foot{border-top:1px solid #dad8ce;display:flex;gap:9px;padding-top:13px;color:#6c7890;font-size:9px;line-height:1.5}.tn-process-foot svg{flex:none;color:#a78d53}
.tn-network-card{padding:16px;display:grid;grid-template-columns:36px 1fr 8px;gap:0 10px;align-items:center}.tn-network-icon{width:34px;height:34px;display:grid;place-items:center;background:#f2eee2;color:#9d8144}.tn-network-card>div:nth-child(2){display:flex;flex-direction:column;gap:4px}.tn-network-card strong{font-size:13px;color:#1f3048}.tn-network-card small{font-size:9px;color:#798393}.tn-network-card small span{font-family:var(--app-font-mono),monospace}.tn-contract-dot{width:7px;height:7px;border-radius:50%;background:#c5bca5;align-self:start;margin-top:6px}.tn-contract-dot.configured{background:#6c9872}.tn-treasury{grid-column:1/-1;display:flex;flex-direction:column;gap:5px;border-top:1px solid var(--tn-line);margin-top:13px;padding-top:11px}.tn-treasury span{font:8px var(--app-font-mono),monospace;letter-spacing:.12em;color:#8992a0}.tn-treasury code{font:9px var(--app-font-mono),monospace;color:#516078;overflow-wrap:anywhere}.tn-config-note{grid-column:1/-1;color:#946f43;font-size:9px;margin-top:9px;line-height:1.4}
.tn-records{margin-top:22px;padding:25px 28px}.tn-records-heading{align-items:center;margin-bottom:17px}.tn-records-heading h2{font-size:22px}.tn-records-heading h2 span{font:10px var(--app-font-mono),monospace;color:#9a824d;border:1px solid var(--tn-line);padding:4px 7px;vertical-align:middle;margin-left:5px}
.tn-refresh-button,.tn-outline-button,.tn-mint-button{display:inline-flex;align-items:center;gap:7px;background:transparent;border:1px solid #d8d7d0;color:#526176;padding:8px 10px;font:9px var(--app-font-sans),sans-serif;cursor:pointer;transition:background .18s,border-color .18s,color .18s}.tn-refresh-button:hover:not(:disabled),.tn-outline-button:hover:not(:disabled){background:#f3f0e8;border-color:#c8b789}.tn-refresh-button:disabled,.tn-outline-button:disabled,.tn-mint-button:disabled{opacity:.5;cursor:not-allowed}
.tn-empty-state{display:flex;align-items:center;gap:13px;padding:20px 17px;background:#f7f6f1;border:1px dashed #d8d6cd}.tn-empty-icon{width:39px;height:39px;display:grid;place-items:center;background:#efede5;color:#a28a52;flex:none}.tn-empty-state strong{font-size:12px;color:#24344b}.tn-empty-state p{font-size:10px;color:#818a98;margin:4px 0 0;line-height:1.5}.tn-error-state{border-style:solid;border-color:#ead4cc;color:#9a5147}.tn-error-state button{margin-left:auto;border:1px solid #d9b8ae;background:transparent;color:#8c5046;font-size:10px;padding:7px 9px;cursor:pointer}
.tn-record-skeleton{display:flex;flex-direction:column;gap:8px}.tn-record-skeleton span{height:54px;background:linear-gradient(90deg,#f2f0ea,#faf9f5,#f2f0ea);background-size:180% 100%;animation:tnShimmer 1.3s infinite}
.tn-license-list{display:flex;flex-direction:column;border-top:1px solid var(--tn-line)}.tn-license-row{display:grid;grid-template-columns:minmax(150px,1fr) minmax(150px,1.2fr) auto auto;gap:12px;align-items:center;padding:14px 3px;border-bottom:1px solid var(--tn-line)}.tn-record-date,.tn-record-title{display:flex;flex-direction:column;gap:5px;min-width:0}.tn-record-date span{font:7px var(--app-font-mono),monospace;letter-spacing:.1em;color:#969eaa}.tn-record-date strong{font:10px var(--app-font-mono),monospace;color:#34445b}.tn-record-title strong{font-size:12px;color:#203049;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.tn-record-title span{font-size:9px;color:#89919d}.tn-record-badges{display:flex;flex-direction:column;gap:5px;align-items:flex-start}.tn-license-badge,.tn-nft-badge{display:inline-flex;align-items:center;gap:4px;font:7px var(--app-font-mono),monospace;letter-spacing:.06em;color:#57765d;background:#edf2ea;padding:4px 6px;white-space:nowrap}.tn-nft-badge{background:#f2eee3;color:#907541}.tn-nft-badge.minted{background:#e6efe7;color:#487253}.tn-record-actions{display:flex;gap:6px;justify-content:flex-end;grid-column:4}.tn-outline-button,.tn-mint-button{padding:7px 8px;white-space:nowrap;font-size:8px}.tn-mint-button{background:#243650;border-color:#243650;color:#f2eadb}.tn-mint-button:hover:not(:disabled){background:#344a68}.tn-tx-link{display:flex;align-items:center;gap:2px;color:#756445;font:8px var(--app-font-mono),monospace;text-decoration:none;grid-column:3 / 5;justify-self:end}.tn-tx-link:hover{text-decoration:underline}
.tn-record-footnote{display:flex;align-items:flex-start;gap:8px;color:#89919d;font-size:9px;line-height:1.5;margin:13px 0 0}.tn-legend-dot{width:6px;height:6px;border-radius:50%;background:#c3a253;flex:none;margin-top:4px}.tn-foot{display:flex;justify-content:space-between;gap:15px;padding:16px 2px 0;color:#8e96a1;font:8px var(--app-font-mono),monospace;letter-spacing:.08em}.tn-foot>span:last-child{display:flex;align-items:center;gap:7px;text-align:right}.tn-foot-dot{width:6px;height:6px;background:#ba9b59}
.tn-spin{animation:tnSpin 1s linear infinite}@keyframes tnSpin{to{transform:rotate(360deg)}}@keyframes tnShimmer{to{background-position:-180% 0}}@keyframes tnReveal{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}
@media(max-width:900px){.tn-dial{right:5%;width:194px;height:194px;opacity:.65}.tn-dial-center{inset:55px}.tn-tick-a{transform:rotate(0deg) translateY(-88px)}.tn-tick-b{transform:rotate(90deg) translateY(-88px)}.tn-tick-c{transform:rotate(180deg) translateY(-88px)}.tn-tick-d{transform:rotate(270deg) translateY(-88px)}.tn-main-grid{grid-template-columns:1fr}.tn-aside{display:grid;grid-template-columns:1.15fr .85fr}.tn-license-row{grid-template-columns:1fr 1fr auto}.tn-record-actions{grid-column:1/-1;justify-content:flex-start}.tn-tx-link{grid-column:3;grid-row:1}}
@media(max-width:640px){.tn-hero{min-height:330px;padding:36px 23px;align-items:flex-start}.tn-hero-copy{max-width:100%}.tn-hero h1{font-size:41px;max-width:360px}.tn-hero-copy>p{font-size:12px;max-width:340px}.tn-dial{right:-60px;top:55%;width:176px;height:176px;opacity:.27}.tn-dial-center{inset:50px}.tn-tick-a{transform:rotate(0deg) translateY(-80px)}.tn-tick-b{transform:rotate(90deg) translateY(-80px)}.tn-tick-c{transform:rotate(180deg) translateY(-80px)}.tn-tick-d{transform:rotate(270deg) translateY(-80px)}.tn-hero-index{right:14px;bottom:12px;font-size:7px}.tn-facts{grid-template-columns:1fr 1fr}.tn-fact{min-height:83px;padding:14px 15px;border-bottom:1px solid var(--tn-line)}.tn-fact:nth-child(2){border-right:0}.tn-fact:nth-child(3),.tn-fact:nth-child(4){border-bottom:0}.tn-main-grid{gap:13px;margin-top:15px}.tn-reserve-panel{padding:21px 16px}.tn-section-heading h2{font-size:21px}.tn-check-form{grid-template-columns:1fr}.tn-button-check{grid-column:auto}.tn-aside{grid-template-columns:1fr}.tn-process-card{padding:20px}.tn-records{padding:21px 16px;margin-top:15px}.tn-records-heading{align-items:flex-start}.tn-records-heading h2{font-size:19px}.tn-refresh-button{font-size:8px;padding:7px}.tn-license-row{grid-template-columns:1fr auto;gap:8px}.tn-record-title{grid-column:1}.tn-record-badges{grid-column:2;grid-row:1 / 3}.tn-record-actions{grid-column:1/-1}.tn-tx-link{grid-column:1/-1;grid-row:auto;justify-self:start}.tn-cost-confirm{align-items:flex-start;flex-direction:column}.tn-cost-confirm span:last-child{text-align:left}.tn-foot{font-size:7px;line-height:1.5}.tn-foot>span:last-child{max-width:190px;justify-content:flex-end}.tn-dial-label{font-size:8px}}
@media(prefers-reduced-motion:reduce){.tn-page *{animation-duration:.01ms!important;animation-iteration-count:1!important;scroll-behavior:auto!important;transition-duration:.01ms!important}}
`;
