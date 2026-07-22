import nodemailer from "nodemailer";
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
                        <td style="font-size:14px;color:#E8EDF2;">60 Д (минут)</td>
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

export async function sendPassportEmail(params: NewCitizenNotifyParams): Promise<void> {
  if (!params.email) return;

  const transport = createTransport();
  if (!transport) {
    logger.warn("SMTP not configured — skipping passport email (set SMTP_HOST, SMTP_USER, SMTP_PASS)");
    return;
  }

  const appDomain = getAppDomain();
  const idCardUrl = `${appDomain}/api/citizens/number/${params.citizenNumber}/id-card`;

  const html = buildPassportHtml({
    name: params.name,
    citizenNumber: params.citizenNumber,
    rank: params.rank,
    idCardUrl,
    appDomain,
  });

  try {
    await transport.sendMail({
      from: FROM,
      to: params.email,
      subject: `🏛️ Ваш паспорт гражданина TimeNation #${params.citizenNumber}`,
      html,
      text:
        `Поздравляем, ${params.name}!\n\n` +
        `Вы стали гражданином TimeNation.\n` +
        `Номер паспорта: ${params.citizenNumber}\n` +
        `Ранг: ${params.rank}\n\n` +
        `Открыть паспорт: ${idCardUrl}\n\n` +
        `TimeNation — цифровое государство, где время является валютой.`,
    });
    logger.info({ citizenNumber: params.citizenNumber }, "Passport email sent");
  } catch (err) {
    logger.error({ err, citizenNumber: params.citizenNumber }, "Failed to send passport email");
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
