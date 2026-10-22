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

const CITIZEN_HEADERS = [
  "Дата выдачи", "Номер гражданина", "ID", "Имя", "Телефон",
  "Ранг", "Баланс (Д)", "Merit Score", "Статус",
] as const;
const CITIZEN_SOURCE_HEADER = "Источник";
const CITIZEN_SOURCE_PRODUCTION = "Production";
const CITIZEN_SOURCE_UNVERIFIED = "Не подтверждено (историческая строка)";
const CITIZEN_SOURCE_NOT_CURRENT = "Не найдено в текущем production";

export interface CitizenSheetRecord {
  citizenNumber: string;
  citizenId: number;
  name: string;
  phone: string;
  rank: string;
  balanceMinutes: number;
  meritScore: number;
  registrationStatus: string;
  issuedAt?: string;
}

export interface CitizenSheetSyncResult {
  ok: boolean;
  updated: number;
  appended: number;
  unverified: number;
  error?: string;
}

function failedCitizenSync(error: string): CitizenSheetSyncResult {
  return { ok: false, updated: 0, appended: 0, unverified: 0, error };
}

/**
 * Reconcile the citizens tab against the current database snapshot.
 * This function is production-only and never deletes sheet rows.
 */
export async function syncProductionCitizensToSheets(
  citizens: CitizenSheetRecord[],
  options: { completeSnapshot?: boolean } = {},
): Promise<CitizenSheetSyncResult> {
  if (process.env["NODE_ENV"] !== "production") {
    return failedCitizenSync("Синхронизация доступна только в production");
  }

  const spreadsheetId = process.env["GOOGLE_SHEETS_ID"];
  if (!spreadsheetId) return failedCitizenSync("GOOGLE_SHEETS_ID не настроен");

  const auth = getAuth();
  if (!auth) return failedCitizenSync("Google Sheets service account не настроен");

  const completeSnapshot = options.completeSnapshot ?? false;
  try {
    const sheets = google.sheets({ version: "v4", auth });
    await ensureSheet(sheets, spreadsheetId, "Граждане", [...CITIZEN_HEADERS, CITIZEN_SOURCE_HEADER]);

    const result = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "Граждане!A1:J",
    });
    const grid = (result.data.values ?? []) as (string | number)[][];
    const headers = grid[0] ?? [];
    const expectedHeadersMatch = CITIZEN_HEADERS.every((header, index) => headers[index] === header);
    if (!expectedHeadersMatch) {
      return failedCitizenSync("Заголовки вкладки «Граждане» отличаются от ожидаемых; данные не изменены");
    }
    if (headers[9] && headers[9] !== CITIZEN_SOURCE_HEADER) {
      return failedCitizenSync("Столбец J уже занят; данные не изменены");
    }
    if (!headers[9]) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: "Граждане!J1",
        valueInputOption: "RAW",
        requestBody: { values: [[CITIZEN_SOURCE_HEADER]] },
      });
    }

    const rows = grid.slice(1);
    const usedRows = new Set<number>();
    const updates: { range: string; values: (string | number)[][] }[] = [];
    const appends: (string | number)[][] = [];
    let updated = 0;
    let appended = 0;
    let unverified = 0;

    for (const citizen of citizens) {
      const candidates = rows
        .map((row, index) => ({ row, index }))
        .filter(({ row, index }) =>
          !usedRows.has(index) &&
          String(row[2] ?? "").trim() === String(citizen.citizenId) &&
          String(row[4] ?? "").trim() === citizen.phone.trim()
        );

      const exactNumberMatches = candidates.filter(
        ({ row }) => String(row[1] ?? "").trim() === citizen.citizenNumber,
      );
      const matched = exactNumberMatches.length === 1
        ? exactNumberMatches[0]
        : exactNumberMatches.length > 1
          ? null
          : candidates.length === 1
            ? candidates[0]
            : null;

      if (matched) {
        usedRows.add(matched.index);
        const rowNumber = matched.index + 2;
        const issueDate = matched.row[0] ?? citizen.issuedAt ?? "";
        updates.push({
          range: `Граждане!A${rowNumber}:J${rowNumber}`,
          values: [[
            issueDate,
            citizen.citizenNumber,
            citizen.citizenId,
            citizen.name,
            citizen.phone,
            citizen.rank,
            citizen.balanceMinutes,
            citizen.meritScore,
            citizen.registrationStatus,
            CITIZEN_SOURCE_PRODUCTION,
          ]],
        });
        updated++;
      } else if (candidates.length === 0) {
        appends.push([
          citizen.issuedAt ?? "",
          citizen.citizenNumber,
          citizen.citizenId,
          citizen.name,
          citizen.phone,
          citizen.rank,
          citizen.balanceMinutes,
          citizen.meritScore,
          citizen.registrationStatus,
          CITIZEN_SOURCE_PRODUCTION,
        ]);
        appended++;
      } else {
        // Multiple rows match the same internal ID and phone; leave them untouched for review.
        unverified++;
      }
    }

    if (completeSnapshot) {
      rows.forEach((row, index) => {
        if (usedRows.has(index)) return;
        const rowNumber = index + 2;
        const source = String(row[9] ?? "").trim();
        const nextSource = source === CITIZEN_SOURCE_PRODUCTION
          ? CITIZEN_SOURCE_NOT_CURRENT
          : source || CITIZEN_SOURCE_UNVERIFIED;
        if (source !== nextSource) {
          updates.push({
            range: `Граждане!J${rowNumber}`,
            values: [[nextSource]],
          });
          unverified++;
        }
      });
    }

    if (updates.length) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        requestBody: { valueInputOption: "RAW", data: updates },
      });
    }
    if (appends.length) {
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: "Граждане!A:J",
        valueInputOption: "USER_ENTERED",
        requestBody: { values: appends },
      });
    }

    logger.info(
      { updated, appended, unverified, completeSnapshot },
      "Production citizen register synchronized to Google Sheets",
    );
    return { ok: true, updated, appended, unverified };
  } catch (err) {
    logger.error({ err }, "Production citizen register Google Sheets sync failed");
    return failedCitizenSync("Не удалось обновить Google Sheets");
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

export async function logCitizenIssuedToSheets(data: {
  citizenNumber: string;
  citizenId: number;
  name: string;
  phone: string;
  rank: string;
  balanceMinutes: number;
  meritScore: number;
  registrationStatus: string;
  issuedAt: string;
}): Promise<boolean> {
  const result = await syncProductionCitizensToSheets([data]);
  return result.ok;
}
