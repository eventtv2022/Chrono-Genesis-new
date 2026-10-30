/**
 * Cryptomus payment gateway integration
 * Docs: https://doc.cryptomus.com/payments/creating-static
 *
 * Required secrets (set in Replit Secrets):
 *   CRYPTOMUS_MERCHANT_ID  — UUID from Cryptomus merchant dashboard
 *   CRYPTOMUS_API_KEY      — Payment API key (not payout key)
 */
import crypto from "crypto";
import { logger } from "../lib/logger";

const MERCHANT_ID = process.env["CRYPTOMUS_MERCHANT_ID"];
const API_KEY = process.env["CRYPTOMUS_API_KEY"];
const BASE_URL = "https://api.cryptomus.com/v1";

export function isCryptomusConfigured(): boolean {
  return !!(MERCHANT_ID && API_KEY);
}

// ── Signature: md5( base64(JSON) + api_key ) ─────────────────────────────────
function sign(body: Record<string, unknown>): string {
  const json = JSON.stringify(body);
  const b64 = Buffer.from(json).toString("base64");
  return crypto.createHash("md5").update(b64 + API_KEY).digest("hex");
}

async function request<T>(
  endpoint: string,
  body: Record<string, unknown>
): Promise<T> {
  const signature = sign(body);
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      merchant: MERCHANT_ID!,
      sign: signature,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Cryptomus ${endpoint} → HTTP ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

// ── Create payment ────────────────────────────────────────────────────────────

export interface CryptomusPayment {
  uuid: string;
  url: string;
  amount: string;
  currency: string;
  status: string;
}

interface CreatePaymentResponse {
  state: number;
  result: CryptomusPayment;
}

export async function createCryptoPayment(opts: {
  orderId: string;           // e.g. "slot_123"
  amountUsd: string;         // e.g. "4.99"
  billingDescriptor: string; // shown to buyer
  callbackUrl: string;       // webhook URL
  successUrl: string;
}): Promise<CryptomusPayment> {
  if (!isCryptomusConfigured()) {
    throw new Error("Cryptomus не настроен: установите CRYPTOMUS_MERCHANT_ID и CRYPTOMUS_API_KEY");
  }

  const body: Record<string, unknown> = {
    amount: opts.amountUsd,
    currency: "USD",
    order_id: opts.orderId,
    url_callback: opts.callbackUrl,
    url_return: opts.successUrl,
    is_payment_multiple: false,
    lifetime: 3600,           // 1 hour to pay
    to_currency: "USDT",      // preferred stablecoin
    additional_data: opts.billingDescriptor,
  };

  const data = await request<CreatePaymentResponse>("/payment", body);
  logger.info({ orderId: opts.orderId, uuid: data.result.uuid }, "Cryptomus payment created");
  return data.result;
}

// ── Verify webhook signature ──────────────────────────────────────────────────
// Cryptomus sends: body JSON + sign header (md5 of base64(body_without_sign) + api_key)
export function verifyCryptomusWebhook(
  rawBody: Record<string, unknown>,
  incomingSign: string
): boolean {
  if (typeof incomingSign !== "string" || !/^[a-f0-9]{32}$/i.test(incomingSign)) {
    return false;
  }

  const { sign: _s, ...bodyWithoutSign } = rawBody;
  const expected = sign(bodyWithoutSign);
  return crypto.timingSafeEqual(
    Buffer.from(expected, "hex"),
    Buffer.from(incomingSign, "hex")
  );
}

// ── Payment status ────────────────────────────────────────────────────────────
export interface PaymentStatus {
  uuid: string;
  order_id: string;
  status: string;   // paid | wait | cancel | process | ...
  is_final: boolean;
}

interface StatusResponse {
  state: number;
  result: PaymentStatus;
}

export async function getPaymentStatus(uuid: string): Promise<PaymentStatus> {
  const data = await request<StatusResponse>("/payment/info", { uuid });
  return data.result;
}
