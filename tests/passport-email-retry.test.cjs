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
const emailSource = read("artifacts/api-server/src/services/emailService.ts");

function sourceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(start, -1, `Missing source marker: ${startMarker}`);
  assert.notEqual(end, -1, `Missing source marker: ${endMarker}`);
  return source.slice(start, end);
}

function loadEmailSender(responses, calls = []) {
  const strippedImports = emailSource.replace(/^import .*;\s*$/gm, "");
  const { code } = transformSync(strippedImports, {
    loader: "ts",
    format: "cjs",
    target: "es2022",
  });
  class ReplitConnectors {
    async proxy(provider, requestPath, init) {
      calls.push({ provider, requestPath, init });
      const response = responses.shift();
      if (response instanceof Error) throw response;
      return response;
    }
  }
  const exports = {};
  const sender = vm.runInNewContext(`${code}\nsendPassportEmail`, {
    exports,
    module: { exports },
    Buffer,
    process: { env: {} },
    logger: { info() {}, warn() {}, error() {} },
    ReplitConnectors,
    nodemailer: { createTransport: () => ({ sendMail: async () => ({}) }) },
  });
  return { sender, calls };
}

function gmailResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

const citizenEmail = {
  name: "Test Citizen",
  citizenNumber: "000000021",
  rank: "Citizen",
  email: "citizen@example.test",
};

test("Gmail Sent lookup prevents a retry from resending an accepted message", async () => {
  const calls = [];
  const { sender } = loadEmailSender([
    gmailResponse(200, { messages: [{ id: "accepted-message" }] }),
  ], calls);

  const result = await sender(citizenEmail, 12);

  assert.equal(result.status, "already_sent");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.method, "GET");
  assert.match(calls[0].requestPath, /rfc822msgid%3Apassport-12%40timenation\.app/);
});

test("Gmail accepted a passport email with the stable Message-ID", async () => {
  const calls = [];
  const { sender } = loadEmailSender([
    gmailResponse(200, {}),
    gmailResponse(200, { emailAddress: "sender@example.test" }),
    gmailResponse(200, { id: "accepted-message" }),
  ], calls);

  const result = await sender(citizenEmail, 17);

  assert.equal(result.status, "delivered");
  assert.equal(calls.length, 3);
  const body = JSON.parse(calls[2].init.body);
  const raw = Buffer.from(body.raw, "base64url").toString("utf8");
  assert.match(raw, /Message-ID: <passport-17@timenation\.app>/);
});

test("temporary Gmail errors are retryable and auth errors are permanent", async () => {
  const temporary = loadEmailSender([
    gmailResponse(200, {}),
    gmailResponse(200, { emailAddress: "sender@example.test" }),
    gmailResponse(503, { error: { message: "Gmail temporarily unavailable" } }),
  ]);
  assert.equal((await temporary.sender(citizenEmail, 18)).status, "retryable");

  const permanent = loadEmailSender([
    gmailResponse(200, {}),
    gmailResponse(401, { error: { message: "Invalid credentials" } }),
  ]);
  const result = await permanent.sender(citizenEmail, 19);
  assert.equal(result.status, "permanent");
  assert.equal(result.errorCode, 401);
});

test("a rejected recipient is permanent and a network failure is retryable", async () => {
  const rejectedRecipient = loadEmailSender([
    gmailResponse(200, {}),
    gmailResponse(200, { emailAddress: "sender@example.test" }),
    gmailResponse(400, { error: { message: "Invalid recipient" } }),
  ]);
  const rejected = await rejectedRecipient.sender(citizenEmail, 20);
  assert.equal(rejected.status, "permanent");
  assert.equal(rejected.errorCode, 400);

  const networkFailure = loadEmailSender([new Error("connection reset")]);
  assert.equal((await networkFailure.sender(citizenEmail, 21)).status, "retryable");
});

function loadEmailWorker(row, citizen, deliveryResult) {
  const notificationTable = {
    id: "id",
    citizenId: "citizenId",
    status: "status",
    attemptCount: "attemptCount",
    nextAttemptAt: "nextAttemptAt",
    updatedAt: "updatedAt",
    lastError: "lastError",
    lastErrorCode: "lastErrorCode",
  };
  const citizensTable = { id: "citizenId", name: "name", citizenNumber: "citizenNumber", rank: "rank", email: "email" };
  const db = {
    select: () => ({
      from: (table) => ({
        where: () => ({
          orderBy: () => ({
            limit: async () => table === notificationTable
              ? row.status === "pending" ? [{ id: row.id, citizenId: row.citizenId }] : []
              : [],
          }),
          limit: async () => table === citizensTable && citizen ? [citizen] : [],
        }),
      }),
    }),
    update: () => ({
      set: (updates) => ({
        where: () => {
          const apply = () => Object.assign(row, updates);
          const query = {
            returning: async () => {
              if (updates.status === "processing") {
                if (row.status !== "pending") return [];
                apply();
                return [{ ...row }];
              }
              apply();
              return [];
            },
            then: (resolve, reject) => Promise.resolve().then(apply).then(resolve, reject),
          };
          return query;
        },
      }),
    }),
  };
  const workerSource = `
    const PASSPORT_EMAIL_RETRY_BASE_MS = 30000;
    const PASSPORT_EMAIL_RETRY_MAX_MS = 6 * 60 * 60 * 1000;
    const PASSPORT_EMAIL_MAX_ATTEMPTS = 10;
    const PASSPORT_EMAIL_PROCESSING_LEASE_MS = 5 * 60 * 1000;
    let passportEmailWorkerRunning = false;
    ${sourceBetween(
      issuanceSource,
      "export async function retryPendingPassportEmails(",
      "/** Best-effort worker;",
    )}
  `;
  const worker = vm.runInNewContext(`${transformSync(workerSource, {
    loader: "ts",
    format: "cjs",
    target: "es2022",
  }).code}\nretryPendingPassportEmails`, {
    exports: {},
    module: { exports: {} },
    db,
    citizensTable,
    passportEmailNotificationsTable: notificationTable,
    and: (...conditions) => conditions,
    asc: (value) => value,
    eq: (...values) => values,
    lte: (...values) => values,
    or: (...conditions) => conditions,
    decrypt: (value) => value,
    sendPassportEmail: async () => deliveryResult,
    logger: { warn() {}, error() {} },
  });
  return { worker, row };
}

function newPendingRow(overrides = {}) {
  return {
    id: 4,
    citizenId: 21,
    status: "pending",
    attemptCount: 0,
    nextAttemptAt: new Date(Date.now() - 1000),
    updatedAt: new Date(),
    ...overrides,
  };
}

test("transient delivery failures are persisted with a bounded retry delay", async () => {
  const row = newPendingRow();
  const fixture = loadEmailWorker(row, citizenEmail, {
    status: "retryable",
    error: "Gmail unavailable",
    errorCode: 503,
  });

  assert.equal(await fixture.worker(), 0);
  assert.equal(row.status, "pending");
  assert.equal(row.attemptCount, 1);
  assert.equal(row.lastErrorCode, 503);
  assert.ok(row.nextAttemptAt > new Date());
  assert.ok(row.nextAttemptAt <= new Date(Date.now() + 30_000));
});

test("a delivered email is marked without increasing its retry count", async () => {
  const row = newPendingRow({ id: 7 });
  const fixture = loadEmailWorker(row, citizenEmail, { status: "delivered" });

  assert.equal(await fixture.worker(), 1);
  assert.equal(row.status, "delivered");
  assert.equal(row.attemptCount, 0);
});

test("permanent delivery failures and exhausted retries are retained for review", async () => {
  const permanentRow = newPendingRow({ id: 5 });
  const permanentFixture = loadEmailWorker(permanentRow, citizenEmail, {
    status: "permanent",
    error: "Invalid recipient",
    errorCode: 400,
  });
  await permanentFixture.worker();
  assert.equal(permanentRow.status, "permanent_failure");
  assert.equal(permanentRow.lastError, "Invalid recipient");

  const exhaustedRow = newPendingRow({ id: 6, attemptCount: 9 });
  const exhaustedFixture = loadEmailWorker(exhaustedRow, citizenEmail, {
    status: "retryable",
    error: "Still unavailable",
    errorCode: 503,
  });
  await exhaustedFixture.worker();
  assert.equal(exhaustedRow.status, "retry_exhausted");
  assert.equal(exhaustedRow.attemptCount, 10);
  assert.ok(exhaustedRow.nextAttemptAt <= new Date(Date.now() + 6 * 60 * 60 * 1000));
});
