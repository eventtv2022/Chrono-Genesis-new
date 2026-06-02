import { logger } from "./logger";

export async function logTransactionToSheets(_data: {
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
  logger.info({ _data }, "Google Sheets integration not configured");
  return false;
}

export async function logTimelineAnchorToSheets(_data: {
  timelineCoord: string;
  citizenId: number;
  citizenName: string;
  createdAt: string;
}): Promise<boolean> {
  if (!process.env["GOOGLE_SHEETS_ID"]) {
    return false;
  }
  logger.info({ _data }, "Google Sheets integration not configured");
  return false;
}
