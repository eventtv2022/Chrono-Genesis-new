const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");

const root = path.resolve(__dirname, "..");
const { transformSync } = createRequire(path.join(root, "artifacts/api-server/package.json"))("esbuild");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const issuanceSource = read("artifacts/api-server/src/services/passportIssuanceService.ts");
const telegramSource = read("artifacts/api-server/src/services/telegramService.ts");

function evaluate(source, expression, globals = {}) {
  const { code } = transformSync(source, { loader: "ts", format: "cjs", target: "es2022" });
  return vm.runInNewContext(`${code}\n${expression}`, { exports: {}, module: { exports: {} }, ...globals });
}

function sourceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(start, -1, `Missing source marker: ${startMarker}`);
  assert.notEqual(end, -1, `Missing source marker: ${endMarker}`);
  return source.slice(start, end);
}

test("passport issuance commits the ready alert to the outbox and does not change its result", async () => {
  const citizen = {
    id: 21,
    citizenNumber: "000000021",
    registrationStatus: "pending",
    availableAt: new Date("2026-10-18T12:00:00.000Z"),
    balanceMinutes: 0,
    ancestralMinuteGranted: false,
    status: "pending",
    onboardingCompleted: false,
    name: "Test Citizen",
    rank: "Citizen",
    email: "citizen@example.test",
    meritScore: 0,
    phone: "+10000000000",
    signatureBase64: "test-signature",
    telegramId: "12345",
    tgNotifyState: 1,
  };
  const outbox = [];
  const emailOutbox = [];
  const ledger = [];
  const citizensTable = {
    id: "id",
    citizenNumber: "citizenNumber",
    registrationStatus: "registrationStatus",
    availableAt: "availableAt",
    signatureBase64: "signatureBase64",
  };
  const outboxTable = { id: "notificationId" };
  const emailOutboxTable = { id: "emailNotificationId" };

  const tx = {
    select: () => ({
      from: () => ({
        where: () => ({ limit: async () => [{ citizenNumber: citizen.citizenNumber }] }),
      }),
    }),
    update: () => ({
      set: (updates) => ({
        where: () => ({
          returning: async () => {
            if (updates.balanceMinutes) {
              Object.assign(citizen, updates, {
                balanceMinutes: citizen.balanceMinutes + 1,
              });
            } else {
              Object.assign(citizen, updates);
            }
            return [{ ...citizen }];
          },
        }),
      }),
    }),
    insert: (table) => ({
      values: async (entry) => {
        if (table === outboxTable) outbox.push(entry);
        else if (table === emailOutboxTable) emailOutbox.push(entry);
        else ledger.push(entry);
      },
    }),
  };
  const db = { transaction: async (callback) => callback(tx) };
  let retryKicks = 0;
  let emailRetryKicks = 0;
  const issueEligiblePassport = evaluate(
    sourceBetween(
      issuanceSource,
      "export async function issueEligiblePassport(",
      "/**\n * Deliver due passport-ready outbox rows.",
    ).replace("export async function", "async function"),
    "issueEligiblePassport",
    {
      db,
      citizensTable,
      passportReadyNotificationsTable: outboxTable,
      passportEmailNotificationsTable: emailOutboxTable,
      timeBankLedgerTable: {},
      and: (...conditions) => conditions,
      eq: (...values) => values,
      lte: (...values) => values,
      sql: () => ({ increment: true }),
      logger: { info() {}, warn() {} },
      retryPendingPassportReadyNotifications: async () => { retryKicks += 1; },
      retryPendingPassportEmails: async () => { emailRetryKicks += 1; },
      notifyAdminPassportLifecycle: async () => {},
      logCitizenIssuedToSheets: async () => {},
      sendPassportEmail: async () => {},
      decrypt: (value) => value,
    },
  );

  const result = await issueEligiblePassport(citizen.id, citizen.availableAt);
  assert.equal(result.ancestralMinuteGranted, true);
  assert.equal("notificationId" in result, false);
  assert.equal(outbox.length, 1);
  assert.equal(outbox[0].citizenId, citizen.id);
  assert.equal(outbox[0].status, "pending");
  assert.match(outbox[0].message, /паспорт гражданина TimeNation готов/);
  assert.equal(emailOutbox.length, 1);
  assert.equal(emailOutbox[0].citizenId, citizen.id);
  assert.equal(emailOutbox[0].status, "pending");
  assert.equal(ledger.length, 1);
  assert.equal(retryKicks, 1);
  assert.equal(emailRetryKicks, 1);
});

function loadPassportReadyDelivery(sendMessage, citizen = { telegramId: "12345", tgNotifyState: 1 }) {
  const deliverySource = sourceBetween(
    telegramSource,
    "export type PassportReadyDeliveryResult",
    "// ─── State Treasury tax-pool notification",
  );
  return evaluate(deliverySource, "deliverPassportReadyNotification", {
    bot: { telegram: { sendMessage } },
    db: {
      select: () => ({
        from: () => ({
          where: () => ({ limit: async () => [citizen] }),
        }),
      }),
    },
    citizensTable: { id: "id", telegramId: "telegramId", tgNotifyState: "tgNotifyState" },
    eq: (...values) => values,
  });
}

test("passport-ready Telegram delivery treats blocked recipients as permanent", async () => {
  const deliver = loadPassportReadyDelivery(async () => {
    throw { response: { error_code: 403, description: "bot was blocked by the user" } };
  });
  const result = await deliver(7, "ready");
  assert.equal(result.status, "permanent");
  assert.equal(result.error, "bot was blocked by the user");
  assert.equal(result.errorCode, 403);
});

test("passport-ready Telegram delivery retries rate limits, server errors, and network failures", async () => {
  for (const failure of [
    { response: { error_code: 429, description: "Too Many Requests" } },
    { response: { error_code: 503, description: "Telegram unavailable" } },
    Object.assign(new Error("connection reset"), { code: "ECONNRESET" }),
  ]) {
    const deliver = loadPassportReadyDelivery(async () => { throw failure; });
    assert.equal((await deliver(7, "ready")).status, "retryable");
  }
});

test("successful passport-ready delivery is reported as delivered", async () => {
  const deliver = loadPassportReadyDelivery(async () => ({ message_id: 42 }));
  assert.equal((await deliver(7, "ready")).status, "delivered");
});

function loadNotificationWorker(row, deliveryResult) {
  const table = {
    id: "id",
    citizenId: "citizenId",
    message: "message",
    status: "status",
    attemptCount: "attemptCount",
    nextAttemptAt: "nextAttemptAt",
    updatedAt: "updatedAt",
    lastError: "lastError",
    lastErrorCode: "lastErrorCode",
  };
  let deleted = false;
  const db = {
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({ limit: async () => deleted ? [] : [{ id: row.id, citizenId: row.citizenId }] }),
        }),
      }),
    }),
    update: () => ({
      set: (updates) => ({
        where: () => {
          const query = {
            returning: async () => {
              if (updates.status === "processing") {
                if (row.status !== "pending") return [];
                Object.assign(row, updates);
                return [{ ...row }];
              }
              Object.assign(row, updates);
              return [];
            },
          };
          query.then = (resolve, reject) =>
            Promise.resolve().then(() => {
              Object.assign(row, updates);
            }).then(resolve, reject);
          return query;
        },
      }),
    }),
    delete: () => ({
      where: async () => { deleted = true; },
    }),
  };
  const workerSource = `
    const PASSPORT_NOTIFICATION_RETRY_BASE_MS = 30000;
    const PASSPORT_NOTIFICATION_RETRY_MAX_MS = 6 * 60 * 60 * 1000;
    const PASSPORT_NOTIFICATION_PROCESSING_LEASE_MS = 5 * 60 * 1000;
    let passportNotificationWorkerRunning = false;
    ${sourceBetween(
      issuanceSource,
      "export async function retryPendingPassportReadyNotifications(",
      "/** Best-effort worker;",
    )}
  `;
  const worker = evaluate(workerSource, "retryPendingPassportReadyNotifications", {
    db,
    passportReadyNotificationsTable: table,
    and: (...conditions) => conditions,
    asc: (value) => value,
    eq: (...values) => values,
    lte: (...values) => values,
    or: (...conditions) => conditions,
    deliverPassportReadyNotification: async () => deliveryResult,
    logger: { warn() {} },
  });
  return { worker, row, wasDeleted: () => deleted };
}

test("successful retry removes its pending outbox row", async () => {
  const fixture = loadNotificationWorker(
    {
      id: 4,
      citizenId: 9,
      message: "ready",
      status: "pending",
      attemptCount: 0,
      nextAttemptAt: new Date(Date.now() - 1000),
      updatedAt: new Date(),
    },
    { status: "delivered" },
  );
  assert.equal(await fixture.worker(), 1);
  assert.equal(fixture.wasDeleted(), true);
});

test("temporary retry failure remains pending and schedules a later attempt", async () => {
  const fixture = loadNotificationWorker(
    {
      id: 5,
      citizenId: 10,
      message: "ready",
      status: "pending",
      attemptCount: 0,
      nextAttemptAt: new Date(Date.now() - 1000),
      updatedAt: new Date(),
    },
    { status: "retryable", error: "Telegram unavailable", errorCode: 503 },
  );
  assert.equal(await fixture.worker(), 0);
  assert.equal(fixture.row.status, "pending");
  assert.equal(fixture.row.attemptCount, 1);
  assert.equal(fixture.row.lastErrorCode, 503);
  assert.ok(fixture.row.nextAttemptAt > new Date());
  assert.equal(fixture.wasDeleted(), false);
});
