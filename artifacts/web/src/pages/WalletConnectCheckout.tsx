import { useEffect, useState } from "react";
import { useAppKit, useAppKitAccount, useAppKitProvider, useDisconnect } from "@reown/appkit/react";
import type { TronConnector } from "@reown/appkit-adapter-tron";
import { TronWeb } from "tronweb";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import "../lib/walletConnect";

const TRC20_WALLET = "TDLRNKKjNJ5RNuit6Hr7nVta5syzEEwr2q";
const USDT_TRC20_CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
const SYSTEM_FEE = 0.05;

function calcUsdtLocal(darmins: number): number {
  let discount = 0;
  if (darmins > 10000) discount = 10;
  else if (darmins >= 5000) discount = 8;
  else if (darmins >= 1000) discount = 7;
  else if (darmins >= 500) discount = 6;
  else if (darmins >= 100) discount = 5;
  return Number((darmins * (1 - discount / 100) * (1 + SYSTEM_FEE)).toFixed(4));
}

interface WalletQuote {
  requestId: number | null;
  totalUsdt: number;
  address: string;
  darmins: number;
}

interface Props {
  citizenId?: number;
  authToken: string | null;
  amount: number;
}

export function WalletConnectCheckout({ citizenId, authToken, amount }: Props) {
  const { open } = useAppKit();
  const { address: walletAddress, isConnected } = useAppKitAccount({ namespace: "tron" });
  const { walletProvider, walletProviderType } = useAppKitProvider<TronConnector>("tron");
  const { disconnect } = useDisconnect();
  const { toast } = useToast();
  const [quote, setQuote] = useState<WalletQuote | null>(null);
  const [txId, setTxId] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (quote && quote.darmins !== amount && !txId) {
      setQuote(null);
      setSubmitted(false);
      setError(null);
    }
  }, [amount, quote, txId]);

  async function createQuote() {
    if (!citizenId || amount < 1) throw new Error("Войдите в аккаунт и укажите количество Дарминов");
    const response = await fetch("/api/payments/trc20/request", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) },
      body: JSON.stringify({ citizenId, darmins: amount, purpose: "darmins" }),
    });
    const data = await response.json() as { requestId?: number | null; totalUsdt?: number; address?: string; error?: string };
    if (!response.ok || typeof data.totalUsdt !== "number" || !data.address) {
      throw new Error(data.error ?? "Не удалось рассчитать сумму USDT");
    }
    if (data.address !== TRC20_WALLET) {
      throw new Error("Адрес казначейства не совпадает с заданным адресом TRON. Оплата остановлена.");
    }
    setQuote({
      requestId: data.requestId ?? null,
      totalUsdt: data.totalUsdt,
      address: data.address,
      darmins: amount,
    });
    setTxId("");
    setSubmitted(false);
    return {
      requestId: data.requestId ?? null,
      totalUsdt: data.totalUsdt,
      address: data.address,
      darmins: amount,
    };
  }

  async function submitTxId(currentTxId: string, currentQuote: WalletQuote) {
    if (!citizenId) throw new Error("Требуется вход в аккаунт гражданина");
    const response = await fetch("/api/payments/trc20/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) },
      body: JSON.stringify({
        requestId: currentQuote.requestId ?? undefined,
        citizenId,
        txId: currentTxId,
        amountUsdt: currentQuote.totalUsdt,
        darmins: currentQuote.darmins,
        purpose: "darmins",
      }),
    });
    const data = await response.json() as { success?: boolean; error?: string };
    if (!response.ok || !data.success) throw new Error(data.error ?? "TxID не удалось отправить на проверку");
    setSubmitted(true);
    toast({ title: "Перевод отправлен", description: "Дармины будут начислены после проверки транзакции администратором." });
  }

  async function handleQuote() {
    setError(null);
    setLoading(true);
    try {
      await createQuote();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Ошибка создания платежа");
    } finally {
      setLoading(false);
    }
  }

  async function handlePay() {
    if (!walletAddress || !quote || quote.darmins !== amount) return;
    setError(null);
    setLoading(true);
    try {
      if (walletProviderType !== "WALLET_CONNECT" || !walletProvider || typeof walletProvider.request !== "function") {
        throw new Error("Не удалось получить подключение к кошельку. Отключите и подключите его снова.");
      }
      const tronWeb = new TronWeb({ fullHost: "https://api.trongrid.io" });
      const rawAmount = Math.round(quote.totalUsdt * 1_000_000);
      const built = await tronWeb.transactionBuilder.triggerSmartContract(
        USDT_TRC20_CONTRACT,
        "transfer(address,uint256)",
        { feeLimit: 100_000_000 },
        [
          { type: "address", value: quote.address },
          { type: "uint256", value: String(rawAmount) },
        ],
        walletAddress,
      );
      if (!built.result?.result || !built.transaction) {
        throw new Error("Не удалось подготовить USDT-транзакцию в сети TRON");
      }

      const wcProvider = walletProvider as TronConnector & {
        provider?: { session?: { sessionProperties?: Record<string, string> } };
      };
      const useLegacyTransactionFormat =
        wcProvider.provider?.session?.sessionProperties?.tron_method_version === "v1";
      const signed = await walletProvider.request<{
        txID?: string;
        signature?: string[];
        raw_data?: Record<string, unknown>;
        raw_data_hex?: string;
        visible?: boolean;
      }>({
        method: "tron_signTransaction",
        params: {
          address: walletAddress,
          transaction: useLegacyTransactionFormat ? built.transaction : { transaction: built.transaction },
        },
      });
      if (!signed?.signature?.length) throw new Error("Кошелёк не подписал транзакцию");
      if (signed.txID) setTxId(signed.txID);

      const broadcast = await tronWeb.trx.sendRawTransaction(
        signed as Parameters<typeof tronWeb.trx.sendRawTransaction>[0],
      );
      if (!broadcast.result) throw new Error("Сеть TRON не подтвердила отправку. Сохраните TxID и проверьте его статус.");
      const confirmedTxId = signed.txID ?? broadcast.txid;
      if (!confirmedTxId) throw new Error("Сеть не вернула TxID транзакции");
      setTxId(confirmedTxId);
      await submitTxId(confirmedTxId, quote);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось отправить USDT");
    } finally {
      setLoading(false);
    }
  }

  const currentQuote = quote?.darmins === amount ? quote : null;
  const displayQuote = txId ? quote : currentQuote;
  const displayDarmins = txId && quote ? quote.darmins : amount;

  return (
    <div className="space-y-3 rounded-sm border border-violet-700/40 bg-violet-950/20 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-mono text-muted-foreground">Оплата через WalletConnect</div>
          <div className="mt-1 text-xl font-bold font-mono text-violet-300">
            {displayQuote ? `${displayQuote.totalUsdt.toFixed(4)} USDT` : `≈${calcUsdtLocal(amount).toFixed(2)} USDT`}
          </div>
        </div>
        <div className="text-right text-xs font-mono text-muted-foreground">
          <div>{displayDarmins} Дарминов</div>
          <div>USDT · TRON</div>
        </div>
      </div>

      {isConnected && walletAddress ? (
        <div className="flex items-center justify-between gap-2 rounded-sm border border-border bg-background/40 p-2">
          <code className="min-w-0 truncate text-xs text-violet-200">{walletAddress}</code>
          <button type="button" onClick={() => void disconnect()} className="shrink-0 text-xs text-muted-foreground hover:text-white">
            Отключить
          </button>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          onClick={() => void open({ view: "Connect", namespace: "tron" })}
          className="w-full border-violet-700/50 text-violet-300 hover:bg-violet-900/20"
          data-testid="button-connect-walletconnect"
        >
          Подключить Trust Wallet через WalletConnect
        </Button>
      )}

      {isConnected && walletAddress && !currentQuote && !txId && (
        <Button
          type="button"
          variant="outline"
          disabled={loading || !citizenId || amount < 1}
          onClick={() => void handleQuote()}
          className="w-full border-violet-700/50 text-violet-300 hover:bg-violet-900/20"
          data-testid="button-walletconnect-quote"
        >
          {loading ? "Рассчитываем сумму…" : "Рассчитать сумму оплаты"}
        </Button>
      )}

      {currentQuote && !submitted && !txId && (
        <Button
          type="button"
          disabled={loading}
          onClick={() => void handlePay()}
          className="w-full bg-violet-600 text-white hover:bg-violet-500"
          data-testid="button-walletconnect-pay"
        >
          {loading ? "Ожидаем подтверждение…" : "Подтвердить перевод в кошельке"}
        </Button>
      )}

      {txId && (
        <div className="space-y-2 rounded-sm border border-border p-3">
          <div className="text-xs font-mono text-muted-foreground">TxID перевода</div>
          <a
            href={`https://tronscan.org/#/transaction/${txId}`}
            target="_blank"
            rel="noreferrer"
            className="break-all text-xs font-mono text-violet-300 underline"
          >
            {txId}
          </a>
          {!submitted && quote && (
            <Button
              type="button"
              variant="outline"
              disabled={loading}
              onClick={() => {
                setLoading(true);
                void submitTxId(txId, quote)
                  .catch(cause => setError(cause instanceof Error ? cause.message : "Не удалось отправить TxID"))
                  .finally(() => setLoading(false));
              }}
              className="w-full border-violet-700/50 text-violet-300"
            >
              Повторить отправку TxID на проверку
            </Button>
          )}
        </div>
      )}

      {submitted && (
        <div className="rounded-sm border border-emerald-700/40 bg-emerald-900/20 p-3 text-center text-sm text-emerald-300">
          Перевод отправлен на проверку. Дармины будут начислены после подтверждения.
        </div>
      )}

      {error && (
        <div role="alert" className="rounded-sm border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
          {error}
        </div>
      )}

      <p className="text-center text-[10px] leading-relaxed text-muted-foreground">
        Перед подтверждением проверьте в кошельке сеть TRON, сумму и адрес получателя. Комиссию сети оплачивает отправитель.
      </p>
    </div>
  );
}
