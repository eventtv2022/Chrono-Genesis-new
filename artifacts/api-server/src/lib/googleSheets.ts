import { logger } from "./logger";
import { google } from "googleapis";

function getAuth() {
  const raw = process.env["GOOGLE_SERVICE_ACCOUNT_JSON"];
  if (!raw) return null;
  try {
    const key = JSON.parse(raw);
    return new google.auth.GoogleAuth({
      credentials: key,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
  } catch (err) {
    logger.error({ err }, "Failed to parse GOOGLE_SERVICE_ACCOUNT_JSON");
    return null;
  }
}

async function appendRow(sheetName: string, values: (string | number)[]): Promise<boolean> {
  const sheetsId = process.env["GOOGLE_SHEETS_ID"];
  if (!sheetsId) return false;

  const auth = getAuth();
  if (!auth) return false;

  try {
    const sheets = google.sheets({ version: "v4", auth });
    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetsId,
      range: `${sheetName}!A1`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [values] },
    });
    return true;
  } catch (err) {
    logger.error({ err, sheetName }, "Google Sheets append failed");
    return false;
  }
}

export async function logTransactionToSheets(data: {
  sessionId: number;
  fromCitizenId: number;
  toCitizenId: number;
  fromCitizenName: string;
  toCitizenName: string;
  minutesTransferred: number;
  durationSeconds: number;
  createdAt: string;
}): Promise<boolean> {
  if (!process.env["GOOGLE_SHEETS_ID"]) {
    logger.info("GOOGLE_SHEETS_ID not set — skipping Sheets log");
    return false;
  }

  const row = [
    data.createdAt,
    data.sessionId,
    data.fromCitizenId,
    data.fromCitizenName,
    data.toCitizenId,
    data.toCitizenName,
    data.minutesTransferred,
    data.durationSeconds,
  ];

  const ok = await appendRow("Транзакции", row);
  if (ok) {
    logger.info({ sessionId: data.sessionId }, "Transaction logged to Google Sheets");
  }
  return ok;
}

export async function logTimelineAnchorToSheets(data: {
  timelineCoord: string;
  citizenId: number;
  citizenName: string;
  createdAt: string;
}): Promise<boolean> {
  if (!process.env["GOOGLE_SHEETS_ID"]) {
    return false;
  }

  const row = [
    data.createdAt,
    data.timelineCoord,
    data.citizenId,
    data.citizenName,
  ];

  const ok = await appendRow("Таймлайн", row);
  if (ok) {
    logger.info({ timelineCoord: data.timelineCoord }, "Timeline anchor logged to Google Sheets");
  }
  return ok;
}
