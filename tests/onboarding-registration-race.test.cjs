const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");

const root = path.resolve(__dirname, "..");
const apiRequire = createRequire(path.join(root, "artifacts/api-server/package.json"));
const { transformSync } = apiRequire("esbuild");
const z = apiRequire("zod");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

function extractHandler(source, routeMarker) {
  const routeStart = source.indexOf(routeMarker);
  assert.notEqual(routeStart, -1, `Missing route: ${routeMarker}`);
  const handlerStart = source.indexOf("async (req, res): Promise<void> => {", routeStart);
  assert.notEqual(handlerStart, -1, `Missing async handler for ${routeMarker}`);
  const handlerEnd = source.indexOf("\n});", handlerStart);
  assert.notEqual(handlerEnd, -1, `Missing end of handler for ${routeMarker}`);
  return source.slice(handlerStart, handlerEnd + 2);
}

function evaluateHandler(source, globals) {
  const { code } = transformSync(`${source}\nglobalThis.__testHandler = handler;`, {
    loader: "ts",
    format: "cjs",
    target: "es2022",
  });
  const context = {
    exports: {},
    module: { exports: {} },
    ...globals,
  };
  vm.runInNewContext(code, context);
  return context.__testHandler;
}

function makeRaceDatabase(citizensTable, onboardingProgressTable, progressToken) {
  const progress = {
    progressToken,
    guideCompleted: true,
    citizenId: null,
  };
  const citizens = [];
  let claimedCount = 0;
  let lockedReadCount = 0;
  let preflightReadCount = 0;
  let releasePreflight;
  const preflightBarrier = new Promise((resolve) => {
    releasePreflight = resolve;
  });
  let preflightSnapshot;

  let lockQueue = Promise.resolve();
  async function acquireProgressLock() {
    const previousLock = lockQueue;
    let release;
    lockQueue = new Promise((resolve) => {
      release = resolve;
    });
    await previousLock;
    return release;
  }

  function selectQuery(isTransaction) {
    let table;
    let wantsRowLock = false;
    const result = {
      from(value) {
        table = value;
        return result;
      },
      where() {
        return result;
      },
      for(mode) {
        wantsRowLock = mode === "update";
        return result;
      },
      async limit() {
        if (isTransaction) {
          if (table === onboardingProgressTable && wantsRowLock) {
            const release = await acquireProgressLock();
            this.transactionReleases.push(release);
            lockedReadCount += 1;
          }
          if (table === onboardingProgressTable) return [{ ...progress }];
          if (table === citizensTable) return [];
          return [];
        }

        if (table === onboardingProgressTable) {
          preflightReadCount += 1;
          if (preflightReadCount === 2) {
            preflightSnapshot = { ...progress };
            releasePreflight();
          }
          await preflightBarrier;
          return [{ ...preflightSnapshot }];
        }
        return [];
      },
      then(resolve, reject) {
        return Promise.resolve(table === citizensTable ? [] : []).then(resolve, reject);
      },
      transactionReleases: null,
    };
    return result;
  }

  const db = {
    select() {
      return selectQuery(false);
    },
    transaction(callback) {
      const releases = [];
      const tx = {
        select() {
          const query = selectQuery(true);
          query.transactionReleases = releases;
          return query;
        },
        insert(table) {
          assert.equal(table, citizensTable);
          return {
            values(values) {
              return {
                async returning() {
                  const citizen = {
                    ...values,
                    id: citizens.length + 1,
                    createdAt: new Date(),
                  };
                  citizens.push(citizen);
                  return [citizen];
                },
              };
            },
          };
        },
        update(table) {
          assert.equal(table, onboardingProgressTable);
          return {
            set(values) {
              return {
                async where() {
                  Object.assign(progress, values);
                  claimedCount += 1;
                },
              };
            },
          };
        },
      };

      return Promise.resolve()
        .then(() => callback(tx))
        .finally(() => {
          for (const release of releases.reverse()) release();
        });
    },
  };

  return {
    db,
    progress,
    citizens,
    get claimedCount() {
      return claimedCount;
    },
    get lockedReadCount() {
      return lockedReadCount;
    },
  };
}

function makeResponse() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

function assertSingleWinner(race, responses) {
  assert.deepEqual(
    responses.map(({ statusCode }) => statusCode).sort(),
    [201, 409],
  );
  assert.equal(race.citizens.length, 1, "only one citizen should be inserted");
  assert.equal(race.claimedCount, 1, "the guide progress row should be claimed once");
  assert.equal(race.progress.citizenId, race.citizens[0].id);
  assert.equal(race.lockedReadCount, 2, "both registration transactions should lock the guide row");
}

test("concurrent citizen registrations with one completed guide create and claim once", async () => {
  const progressToken = "a".repeat(64);
  const citizensTable = {};
  const onboardingProgressTable = {};
  const race = makeRaceDatabase(citizensTable, onboardingProgressTable, progressToken);
  const source = read("artifacts/api-server/src/routes/citizens.ts");
  const schemaStart = source.indexOf("const RegisterCitizenBody = z.object({");
  const routeStart = source.indexOf('router.post("/citizens"');
  assert.notEqual(schemaStart, -1);
  assert.notEqual(routeStart, -1);

  const schema = source.slice(schemaStart, routeStart);
  const handler = extractHandler(source, 'router.post("/citizens"');
  const register = evaluateHandler(`${schema}\nconst handler = ${handler};`, {
    z,
    crypto: require("node:crypto"),
    db: race.db,
    citizensTable,
    onboardingProgressTable,
    eq: (column, value) => ({ column, value }),
    generateNextCitizenNumber: async () => "000000001",
    deriveAgeTier: () => "ADULT",
    encryptNullable: (value) => value,
    cropSignature: async (signature) => signature,
    formatCitizenRow: (citizen) => citizen,
    notifyPassportEmissionStarted: () => Promise.resolve(),
    tryDecrypt: (value) => value,
    sendAdminTelegramNotify: async () => undefined,
    sendDirectMessage: async () => undefined,
  });

  const request = (phone) => ({
    body: {
      name: "Race Test",
      phone,
      dateOfBirth: "1990-01-01",
      signatureBase64: "data:image/png;base64,c2lnbmF0dXJl",
      preApplicationProgressToken: progressToken,
    },
    log: { info() {}, warn() {} },
  });
  const responses = [makeResponse(), makeResponse()];
  await Promise.all([
    register(request("race-phone-1"), responses[0]),
    register(request("race-phone-2"), responses[1]),
  ]);

  assertSingleWinner(race, responses);
});

test("concurrent Telegram registrations with one completed guide create and claim once", async () => {
  const progressToken = "b".repeat(64);
  const citizensTable = {};
  const onboardingProgressTable = {};
  const race = makeRaceDatabase(citizensTable, onboardingProgressTable, progressToken);
  const source = read("artifacts/api-server/src/routes/twa.ts");
  const handler = extractHandler(source, 'router.post("/auth/telegram-webapp"');
  const authenticate = evaluateHandler(`const handler = ${handler};`, {
    crypto: require("node:crypto"),
    URLSearchParams,
    process: { env: {} },
    db: race.db,
    citizensTable,
    onboardingProgressTable,
    eq: (column, value) => ({ column, value }),
    resolvedBotToken: () => "test-bot-token",
    validateInitData: () => true,
    deriveAgeTier: () => "ADULT",
    emissionState: () => ({ status: "IN_EMISSION", secondsLeft: 3600 }),
    notifyPassportEmissionStarted: () => Promise.resolve(),
    logger: { error() {} },
  });

  const initData = `user=${encodeURIComponent(JSON.stringify({ id: 123456, first_name: "Race" }))}&hash=test`;
  const request = () => ({
    body: {
      initData,
      dateOfBirth: "1990-01-01",
      preApplicationProgressToken: progressToken,
    },
    log: { info() {}, warn() {} },
  });
  const responses = [makeResponse(), makeResponse()];
  await Promise.all([
    authenticate(request(), responses[0]),
    authenticate(request(), responses[1]),
  ]);

  assertSingleWinner(race, responses);
});
