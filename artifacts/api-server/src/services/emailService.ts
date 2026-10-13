import nodemailer from "nodemailer";
import { ReplitConnectors } from "@replit/connectors-sdk";
import { logger } from "../lib/logger";

// ── SMTP configuration ────────────────────────────────────────────────────────
// Set these in Replit Secrets:
//   SMTP_HOST   — e.g. smtp.gmail.com / smtp.mail.ru
//   SMTP_PORT   — 465 (SSL) or 587 (STARTTLS). Default: 465
//   SMTP_USER   — login (e.g. your@gmail.com)
//   SMTP_PASS   — password or app-password
//   SMTP_FROM   — display address, e.g. "TimeNation <noreply@timenation.app>"
// ─────────────────────────────────────────────────────────────────────────────

function createTransport() {
  const host = process.env["SMTP_HOST"];
  const port = parseInt(process.env["SMTP_PORT"] ?? "465", 10);
  const user = process.env["SMTP_USER"];
  const pass = process.env["SMTP_PASS"];

  if (!host || !user || !pass) return null;

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

const FROM =
  process.env["SMTP_FROM"] ??
  `TimeNation <${process.env["SMTP_USER"] ?? "noreply@timenation.app"}>`;

// ── App domain helper ─────────────────────────────────────────────────────────
function getAppDomain(): string {
  const domains = process.env["REPLIT_DOMAINS"] ?? "";
  const first = domains.split(",")[0]?.trim();
  return first ? `https://${first}` : "https://timenation.app";
}

// ── HTML email template ───────────────────────────────────────────────────────
function buildPassportHtml(opts: {
  name: string;
  citizenNumber: string;
  rank: string;
  idCardUrl: string;
  appDomain: string;
}): string {
  const { name, citizenNumber, rank, idCardUrl, appDomain } = opts;
  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Паспорт гражданина TimeNation</title>
</head>
<body style="margin:0;padding:0;background:#0D0D14;font-family:'Segoe UI',Arial,sans-serif;color:#E8EDF2;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0D0D14;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#13131F;border:1px solid rgba(201,168,76,0.25);border-radius:16px;overflow:hidden;max-width:560px;">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%);padding:32px 40px;text-align:center;border-bottom:1px solid rgba(201,168,76,0.2);">
              <div style="font-size:36px;margin-bottom:8px;">🏛️</div>
              <div style="font-size:11px;letter-spacing:4px;color:#C9A84C;text-transform:uppercase;margin-bottom:4px;">Цифровое государство</div>
              <div style="font-size:26px;font-weight:700;color:#C9A84C;letter-spacing:2px;">TimeNation</div>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 40px;">
              <p style="margin:0 0 8px;font-size:14px;color:#9a9ab0;letter-spacing:1px;text-transform:uppercase;">Поздравляем!</p>
              <h1 style="margin:0 0 20px;font-size:24px;font-weight:700;color:#E8EDF2;">
                Вы стали гражданином,<br/><span style="color:#C9A84C;">${name}</span>
              </h1>

              <p style="margin:0 0 24px;font-size:15px;color:#9a9ab0;line-height:1.7;">
                Ваш паспорт TimeNation выдан. Добро пожаловать в цифровое государство, где <strong style="color:#C9A84C;">каждая минута имеет ценность</strong>.
              </p>

              <!-- Passport data block -->
              <table width="100%" cellpadding="0" cellspacing="0"
                     style="background:rgba(201,168,76,0.06);border:1px solid rgba(201,168,76,0.2);border-radius:10px;margin-bottom:28px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <table width="100%" cellpadding="4" cellspacing="0">
                      <tr>
                        <td style="font-size:12px;color:#9a9ab0;width:40%;">Гражданин</td>
                        <td style="font-size:14px;font-weight:600;color:#E8EDF2;">${name}</td>
                      </tr>
                      <tr>
                        <td style="font-size:12px;color:#9a9ab0;">Номер паспорта</td>
                        <td style="font-size:14px;font-weight:600;color:#C9A84C;letter-spacing:1px;">${citizenNumber}</td>
                      </tr>
                      <tr>
                        <td style="font-size:12px;color:#9a9ab0;">Ранг</td>
                        <td style="font-size:14px;color:#E8EDF2;">${rank}</td>
                      </tr>
                      <tr>
                        <td style="font-size:12px;color:#9a9ab0;">Стартовый баланс</td>
                        <td style="font-size:14px;color:#E8EDF2;">1 Д</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- CTA button -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                <tr>
                  <td align="center">
                    <a href="${idCardUrl}"
                       style="display:inline-block;background:linear-gradient(135deg,#C9A84C,#a8892e);color:#0D0D14;text-decoration:none;font-size:15px;font-weight:700;padding:14px 36px;border-radius:10px;letter-spacing:0.5px;">
                      📄 Открыть паспорт / ID-карту
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 6px;font-size:13px;color:#9a9ab0;text-align:center;">
                Или скопируй ссылку:
              </p>
              <p style="margin:0;font-size:12px;color:#C9A84C;text-align:center;word-break:break-all;">
                <a href="${idCardUrl}" style="color:#C9A84C;">${idCardUrl}</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#0D0D14;padding:20px 40px;text-align:center;border-top:1px solid rgba(255,255,255,0.06);">
              <p style="margin:0;font-size:12px;color:#4a4a6a;">
                TimeNation · Цифровое государство · Время — валюта<br/>
                <a href="${appDomain}" style="color:#C9A84C;text-decoration:none;">${appDomain}</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface NewCitizenNotifyParams {
  name: string;
  citizenNumber: string;
  rank: string;
  email: string | null;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[char]!);
}

function wrapBase64(value: string): string {
  return value.match(/.{1,76}/g)?.join("\r\n") ?? "";
}

export async function sendPassportEmail(params: NewCitizenNotifyParams): Promise<void> {
  if (!params.email) return;
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(params.email)) {
    logger.warn({ citizenNumber: params.citizenNumber }, "Invalid citizen email; passport email not sent");
    return;
  }

  const appDomain = getAppDomain();
  const idCardUrl = `${appDomain}/api/citizens/number/${params.citizenNumber}/id-card`;
  const subject = `🏛️ Ваш паспорт гражданина TimeNation #${params.citizenNumber}`;
  const safeName = escapeHtml(params.name);
  const safeRank = escapeHtml(params.rank);
  const safeCitizenNumber = escapeHtml(params.citizenNumber);

  const html = buildPassportHtml({
    name: safeName,
    citizenNumber: safeCitizenNumber,
    rank: safeRank,
    idCardUrl,
    appDomain,
  });
  const text =
    `Поздравляем, ${params.name}!\n\n` +
    `Вы стали гражданином TimeNation.\n` +
    `Номер паспорта: ${params.citizenNumber}\n` +
    `Ранг: ${params.rank}\n\n` +
    `Открыть паспорт: ${idCardUrl}\n\n` +
    `TimeNation — цифровое государство, где время является валютой.`;

  try {
    const connectors = new ReplitConnectors();
    const profileResponse = await connectors.proxy(
      "google-mail",
      "/gmail/v1/users/me/profile",
      { method: "GET" },
    );
    if (!profileResponse.ok) {
      throw new Error(`Gmail profile request failed (${profileResponse.status})`);
    }
    const profile = await profileResponse.json() as { emailAddress?: string };
    if (!profile.emailAddress || /[\r\n<>]/.test(profile.emailAddress)) {
      throw new Error("Gmail profile did not return a usable sender address");
    }

    const boundary = `timenation-${params.citizenNumber}-${Date.now()}`;
    const mime = [
      `From: TimeNation <${profile.emailAddress}>`,
      `To: ${params.email}`,
      `Subject: =?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`,
      "MIME-Version: 1.0",
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      "",
      `--${boundary}`,
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: base64",
      "",
      wrapBase64(Buffer.from(text, "utf8").toString("base64")),
      `--${boundary}`,
      "Content-Type: text/html; charset=UTF-8",
      "Content-Transfer-Encoding: base64",
      "",
      wrapBase64(Buffer.from(html, "utf8").toString("base64")),
      `--${boundary}--`,
      "",
    ].join("\r\n");

    const sendResponse = await connectors.proxy(
      "google-mail",
      "/gmail/v1/users/me/messages/send",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw: Buffer.from(mime, "utf8").toString("base64url") }),
      },
    );
    if (!sendResponse.ok) {
      throw new Error(`Gmail send request failed (${sendResponse.status})`);
    }
    await sendResponse.json();
    logger.info({ citizenNumber: params.citizenNumber }, "Passport email sent through Gmail");
  } catch (err) {
    logger.error({ err, citizenNumber: params.citizenNumber }, "Failed to send passport email");
  }
}

/** Send admin registry 2FA OTP to a fixed admin email address. */
export async function sendRegistryOtpEmail(otp: string): Promise<boolean> {
  const adminEmail = "support@timenation.info";
  const transport = createTransport();
  if (!transport) {
    logger.warn("SMTP not configured — skipping registry OTP email");
    return false;
  }
  try {
    await transport.sendMail({
      from: FROM,
      to: adminEmail,
      subject: "🔐 TimeNation — Код доступа к Реестру Граждан",
      html: `
        <div style="font-family:'Segoe UI',Arial,sans-serif;background:#0D0D14;padding:40px;color:#E8EDF2;border-radius:12px;max-width:480px;margin:auto">
          <div style="text-align:center;margin-bottom:24px">
            <div style="font-size:32px">🛡️</div>
            <div style="font-size:20px;font-weight:700;color:#C9A84C;margin-top:8px">Реестр Граждан TimeNation</div>
            <div style="font-size:12px;color:#9a9ab0;margin-top:4px">Запрос двухфакторной авторизации</div>
          </div>
          <div style="background:rgba(201,168,76,0.08);border:1px solid rgba(201,168,76,0.25);border-radius:10px;padding:24px;text-align:center;margin-bottom:20px">
            <div style="font-size:12px;color:#9a9ab0;margin-bottom:10px;text-transform:uppercase;letter-spacing:2px">Ваш OTP-код</div>
            <div style="font-size:42px;font-weight:900;letter-spacing:8px;color:#C9A84C;font-family:monospace">${otp}</div>
            <div style="font-size:12px;color:#9a9ab0;margin-top:10px">Действителен 5 минут</div>
          </div>
          <div style="font-size:12px;color:#4a4a6a;text-align:center">
            Если вы не запрашивали код — проигнорируйте это письмо.<br/>
            TimeNation · support@timenation.info
          </div>
        </div>`,
      text: `TimeNation — Код доступа к Реестру Граждан\n\nВаш OTP-код: ${otp}\n\nДействителен 5 минут.\n\nЕсли вы не запрашивали код — проигнорируйте это письмо.`,
    });
    logger.info("Registry OTP email sent to admin");
    return true;
  } catch (err) {
    logger.error({ err }, "Failed to send registry OTP email");
    return false;
  }
}

export async function sendAdminTelegramNotify(opts: {
  sendDirectMessage: (id: string, msg: string) => Promise<boolean>;
  name: string;
  email: string | null;
  citizenNumber: string;
  citizenId: number;
  createdAt: Date;
}): Promise<void> {
  const adminId = process.env["ADMIN_TELEGRAM_ID"];
  if (!adminId) return;

  const appDomain = getAppDomain();
  const idCardUrl = `${appDomain}/api/citizens/number/${opts.citizenNumber}/id-card`;
  const date = opts.createdAt.toLocaleString("ru-RU", { timeZone: "Europe/Moscow" });

  const msg =
    `🆔 *Создан новый паспорт гражданина!*\n\n` +
    `👤 ФИО/псевдоним: *${opts.name}*\n` +
    `📧 Email: ${opts.email ?? "—"}\n` +
    `🔢 Номер паспорта: \`${opts.citizenNumber}\`\n` +
    `🆔 ID: ${opts.citizenId}\n` +
    `📅 Дата создания: ${date}\n\n` +
    `📄 [Открыть ID-карту](${idCardUrl})`;

  const sent = await opts.sendDirectMessage(adminId, msg);
  if (!sent) {
    logger.warn({ adminId }, "Admin Telegram notify: sendDirectMessage returned false");
  }
}
