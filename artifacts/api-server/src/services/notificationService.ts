/**
 * notificationService — multi-channel citizen notification dispatcher.
 *
 * Currently active:
 *  • email    → emailService (SMTP)
 *  • telegram → telegramService (Telegraf bot)
 *
 * Stubs (ready for integration):
 *  • whatsapp → WhatsApp Business API / Twilio Messaging (see env vars below)
 *  • sms      → Twilio / any SMS provider
 *  • phone    → Twilio Voice / any calling provider
 *
 * WhatsApp setup:
 *   Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM
 *   and install `twilio` package. Then replace the stub below.
 */

import { logger } from "../lib/logger";

export type NotifChannel = "email" | "telegram" | "whatsapp" | "sms" | "phone";

export const ALL_CHANNELS: NotifChannel[] = ["email", "telegram", "whatsapp", "sms", "phone"];

export interface ChannelMessage {
  citizenId:   number;
  channel:     NotifChannel;
  to:          string;   // email address | @username or telegramId | phone number
  subject?:    string;   // email only
  body:        string;
}

/**
 * Dispatch a notification on the given channel.
 * Real email and Telegram are handled by their own services; call those directly.
 * This function covers the remaining channels and provides stubs.
 */
export async function sendChannelNotification(msg: ChannelMessage): Promise<void> {
  switch (msg.channel) {
    case "whatsapp": {
      // ── WhatsApp Business API stub ────────────────────────────────────────
      // Uncomment and configure when Twilio or Meta WABA credentials are ready:
      //
      // const twilio = require("twilio")(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
      // await twilio.messages.create({
      //   from: `whatsapp:${process.env.TWILIO_WHATSAPP_FROM}`,
      //   to:   `whatsapp:${msg.to}`,
      //   body: msg.body,
      // });
      logger.info(
        { citizenId: msg.citizenId, channel: "whatsapp", to: msg.to },
        "[WhatsApp stub] Message queued — set TWILIO_* env vars to enable delivery",
      );
      break;
    }

    case "sms": {
      // ── SMS stub ──────────────────────────────────────────────────────────
      // Uncomment and configure when Twilio or SMS.ru credentials are ready:
      //
      // const twilio = require("twilio")(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
      // await twilio.messages.create({ from: process.env.TWILIO_SMS_FROM, to: msg.to, body: msg.body });
      logger.info(
        { citizenId: msg.citizenId, channel: "sms", to: msg.to },
        "[SMS stub] Message queued — configure SMS provider to enable delivery",
      );
      break;
    }

    case "phone": {
      // ── Voice call stub ───────────────────────────────────────────────────
      // Uncomment and configure when Twilio Voice credentials are ready:
      //
      // const twilio = require("twilio")(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
      // await twilio.calls.create({ from: process.env.TWILIO_PHONE_FROM, to: msg.to, twiml: `<Response><Say>${msg.body}</Say></Response>` });
      logger.info(
        { citizenId: msg.citizenId, channel: "phone", to: msg.to },
        "[Phone stub] Call queued — configure Twilio Voice to enable delivery",
      );
      break;
    }

    case "email":
    case "telegram":
      // Handled by emailService / telegramService respectively — call those directly.
      logger.warn(
        { citizenId: msg.citizenId, channel: msg.channel },
        "sendChannelNotification: email/telegram should be sent via their own services",
      );
      break;

    default:
      logger.warn({ channel: msg.channel }, "sendChannelNotification: unknown channel");
  }
}

/**
 * Parse preferredChannels from DB (stored as JSON text) into a typed array.
 * Returns an empty array on parse errors.
 */
export function parsePreferredChannels(raw: string | null | undefined): NotifChannel[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return (parsed as string[]).filter((v): v is NotifChannel => ALL_CHANNELS.includes(v as NotifChannel));
  } catch {
    return [];
  }
}
