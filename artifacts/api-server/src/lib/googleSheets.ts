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

async function ensureSheet(
  sheets: ReturnType<typeof google.sheets>,
  spreadsheetId: string,
  sheetName: string,
  headers: string[]
): Promise<void> {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const exists = meta.data.sheets?.some(
    (s) => s.properties?.title === sheetName
  );

  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: sheetName } } }],
      },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A1`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [headers] },
    });
    logger.info({ sheetName }, "Google Sheets: created new sheet with headers");
  }
}

async function appendRow(
  sheetName: string,
  headers: string[],
  values: (string | number)[]
): Promise<boolean> {
  const sheetsId = process.env["GOOGLE_SHEETS_ID"];
  if (!sheetsId) return false;

  const auth = getAuth();
  if (!auth) return false;

  try {
    const sheets = google.sheets({ version: "v4", auth });
    await ensureSheet(sheets, sheetsId, sheetName, headers);
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

  const headers = [
    "Дата", "ID сессии", "ID отправителя", "Отправитель",
    "ID получателя", "Получатель", "Минут передано", "Длительность (сек)",
  ];
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

  const ok = await appendRow("Транзакции", headers, row);
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

  const headers = ["Дата", "Координата таймлайна", "ID гражданина", "Гражданин"];
  const row = [
    data.createdAt,
    data.timelineCoord,
    data.citizenId,
    data.citizenName,
  ];

  const ok = await appendRow("Таймлайн", headers, row);
  if (ok) {
    logger.info({ timelineCoord: data.timelineCoord }, "Timeline anchor logged to Google Sheets");
  }
  return ok;
}
