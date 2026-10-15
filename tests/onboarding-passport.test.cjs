const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");

const root = path.resolve(__dirname, "..");
const { transformSync } = createRequire(path.join(root, "artifacts/api-server/package.json"))("esbuild");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

function evaluate(source, expression, globals = {}) {
  const { code } = transformSync(source, { loader: "ts", format: "cjs", target: "es2022" });
  return vm.runInNewContext(`${code}\n${expression}`, { exports: {}, ...globals });
}

function sourceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(start, -1, `Missing source marker: ${startMarker}`);
  assert.notEqual(end, -1, `Missing source marker: ${endMarker}`);
  return source.slice(start, end);
}

const webRegister = read("artifacts/web/src/pages/Register.tsx");
const webGuide = read("artifacts/web/src/pages/PreApplicationGuide.tsx");
const mobileRegister = read("artifacts/mobile/app/register.tsx");
const onboardingRoute = read("artifacts/api-server/src/routes/onboarding.ts");
const citizenRoute = read("artifacts/api-server/src/routes/citizens.ts");
const issuanceService = read("artifacts/api-server/src/services/passportIssuanceService.ts");
const onboardingQuestions = read("lib/onboarding-questions.ts");
const storageKey = (name) => {
  const value = onboardingQuestions.match(new RegExp(`export const ${name} = "([^"]+)"`))?.[1];
  assert.ok(value, `Missing onboarding storage key: ${name}`);
  return value;
};
const guideCompleteKey = storageKey("PRE_APPLICATION_GUIDE_COMPLETE_KEY");
const progressTokenKey = storageKey("ONBOARDING_PROGRESS_TOKEN_KEY");

test("web application route sends visitors without a completed guide back to onboarding", () => {
  const helperSource = sourceBetween(
    webGuide,
    "export const isPreApplicationGuideComplete",
    "export function getPreApplicationProgressToken",
  ).replace("export const", "const");
  const stored = {
    [guideCompleteKey]: "complete",
    [progressTokenKey]: "a".repeat(64),
  };
  const guideComplete = evaluate(
    `let completedInCurrentTab = false;\n${helperSource}`,
    "isPreApplicationGuideComplete",
    {
      localStorage: {
        getItem: (key) => stored[key] ?? null,
      },
      PRE_APPLICATION_GUIDE_COMPLETE_KEY: guideCompleteKey,
      ONBOARDING_PROGRESS_TOKEN_KEY: progressTokenKey,
    },
  );

  const guard = sourceBetween(
    webRegister,
    "if (!citizen && !isPreApplicationGuideComplete())",
    "\n  }, [citizen, navigate]);",
  );
  const runGuard = (citizen) => {
    const destinations = [];
    evaluate(guard, "", {
      citizen,
      isPreApplicationGuideComplete: guideComplete,
      navigate: (path) => destinations.push(path),
    });
    return destinations;
  };

  stored[guideCompleteKey] = null;
  assert.deepEqual(runGuard(null), ["/onboarding"]);
  stored[guideCompleteKey] = "complete";
  stored[progressTokenKey] = null;
  assert.deepEqual(runGuard(null), ["/onboarding"]);
  stored[progressTokenKey] = "a".repeat(64);
  assert.deepEqual(runGuard(null), []);
  assert.deepEqual(runGuard({ id: 1 }), []);
  assert.equal(guideComplete(), true);
});

test("mobile application route redirects incomplete or unreadable guide state to onboarding", async () => {
  const guard = sourceBetween(
    mobileRegister,
    "    if (citizen) return;\n    let active = true;",
    "    return () => { active = false; };",
  );

  async function runGuard({ citizen = null, storedValue, readError } = {}) {
    const destinations = [];
    let reads = 0;
    const AsyncStorage = {
      getItem: () => {
        reads += 1;
        return readError ? Promise.reject(readError) : Promise.resolve(storedValue);
      },
    };
    const effect = evaluate(
      `(() => { ${guard} })()`,
      "",
      {
        citizen,
        AsyncStorage,
        PRE_APPLICATION_GUIDE_COMPLETE_KEY: guideCompleteKey,
        router: { replace: (path) => destinations.push(path) },
      },
    );
    await new Promise((resolve) => setImmediate(resolve));
    return { destinations, reads, cleanup: effect };
  }

  assert.deepEqual((await runGuard({ storedValue: null })).destinations, ["/onboarding"]);
  assert.deepEqual((await runGuard({ storedValue: "incomplete" })).destinations, ["/onboarding"]);
  assert.deepEqual((await runGuard({ storedValue: "complete" })).destinations, []);
  assert.deepEqual((await runGuard({ readError: new Error("storage unavailable") })).destinations, ["/onboarding"]);
  const signedIn = await runGuard({ citizen: { id: 1 } });
  assert.equal(signedIn.reads, 0);
  assert.deepEqual(signedIn.destinations, []);
});

test("server only marks the pre-application guide complete after all 30 answers are revealed and continued", async () => {
  const fake = makeProgressDb();
  const updateProgress = evaluate(
    sourceBetween(
      onboardingRoute,
      "async function updateProgress(",
      "async function loadStatus(",
    ),
    "updateProgress",
    fake.dependencies,
  );

  for (let questionId = 1; questionId <= 30; questionId += 1) {
    assert.equal(
      (await updateProgress("token", null, { phase: "guide", action: "continue", questionId })),
      null,
      `Question ${questionId} cannot be continued before its answer is revealed`,
    );
    const revealed = await updateProgress("token", null, { phase: "guide", action: "reveal", questionId });
    assert.ok(revealed);
    const continued = await updateProgress("token", null, { phase: "guide", action: "continue", questionId });
    assert.ok(continued);
    if (questionId < 30) assert.equal(continued.guideCompleted, false);
    else assert.equal(continued.guideCompleted, true);
  }

  assert.equal(fake.progress.guideCurrentQuestionId, 30);
  assert.equal(fake.progress.guideCompleted, true);
});

test("citizen registration rejects missing, incomplete, or already-used guide progress", async () => {
  const preflight = sourceBetween(
    citizenRoute,
    "  const [preflightProgress] = await db",
    "  // ── 1. Normalise passport photo",
  );
  const state = {
    currentProgress: null,
    res: {
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; },
    },
  };
  const checkPreflight = evaluate(
    `async function checkPreflight() {\n${preflight}\nreturn true;\n}`,
    "checkPreflight",
    {
      db: {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: async () => state.currentProgress ? [state.currentProgress] : [],
            }),
          }),
        }),
      },
      onboardingProgressTable: {},
      eq: () => ({}),
      preApplicationProgressToken: "a".repeat(64),
      res: state.res,
      state,
    },
  );

  const rejected = async (progress) => {
    state.currentProgress = progress;
    delete state.res.statusCode;
    delete state.res.body;
    assert.equal(await checkPreflight(), undefined);
    assert.equal(state.res.statusCode, 409);
    assert.match(state.res.body.error, /завершите 30 вопросов/i);
  };

  await rejected(null);
  await rejected({ guideCompleted: false, citizenId: null });
  await rejected({ guideCompleted: true, citizenId: 4 });

  state.currentProgress = { guideCompleted: true, citizenId: null };
  assert.equal(await checkPreflight(), true);
});

function makeProgressDb() {
  const progress = {
    progressToken: "token",
    citizenId: null,
    guideCurrentQuestionId: 1,
    guideRevealedQuestionIds: [],
    guideCompleted: false,
    simulatorCurrentQuestionId: 31,
    simulatorRevealedQuestionIds: [],
    simulatorCompleted: false,
  };
  const table = {};
  const db = {
    transaction: (callback) => callback({
      select: () => ({
        from: () => ({
          where: (condition) => ({
            for() { return this; },
            limit: async () => condition.value === progress.progressToken ? [progress] : [],
          }),
        }),
      }),
      update: () => ({
        set: (updates) => ({
          where: () => ({
            returning: async () => {
              Object.assign(progress, updates);
              return [progress];
            },
          }),
        }),
      }),
    }),
  };
  return {
    progress,
    dependencies: {
      db,
      onboardingProgressTable: table,
      eq: (column, value) => ({ column, value }),
    },
  };
}

test("passport simulator finale begins exactly one minute before eligibility", async () => {
  const fake = makeStatusDependencies();
  const loadStatus = evaluate(
    sourceBetween(onboardingRoute, "async function loadStatus(", 'router.post("/onboarding/progress/sessions"'),
    "loadStatus",
    fake.dependencies,
  );
  const availableAt = Date.UTC(2026, 0, 1, 1);

  const beforeFinale = await loadStatusAt(loadStatus, fake, availableAt - 60_001);
  assert.equal(beforeFinale.completed, false);
  assert.equal(beforeFinale.secondsRemaining, 1);
  assert.equal(beforeFinale.secondsUntilEligibility, 61);
  assert.equal(beforeFinale.durationSeconds, 3540);
  assert.equal(beforeFinale.startedAt, new Date(availableAt - 60 * 60_000).toISOString());

  const finaleStart = await loadStatusAt(loadStatus, fake, availableAt - 60_000);
  assert.equal(finaleStart.completed, true);
  assert.equal(finaleStart.secondsRemaining, 0);
  assert.equal(finaleStart.secondsUntilEligibility, 60);

  const beforeIssuance = await loadStatusAt(loadStatus, fake, availableAt - 1);
  assert.equal(beforeIssuance.registrationStatus, "pending");
  assert.equal(beforeIssuance.secondsUntilEligibility, 1);
  assert.equal(beforeIssuance.issueCalls, 0);

  const atEligibility = await loadStatusAt(loadStatus, fake, availableAt);
  assert.equal(atEligibility.issueCalls, 1);
  assert.equal(atEligibility.secondsUntilEligibility, 0);
});

function makeStatusDependencies() {
  const clock = { now: 0 };
  const citizen = {
    id: 12,
    registrationStatus: "pending",
    availableAt: new Date(Date.UTC(2026, 0, 1, 1)),
    citizenNumber: "000000012",
    balanceMinutes: 0,
  };
  let issueCalls = 0;
  const db = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [citizen],
        }),
      }),
    }),
  };
  return {
    clock,
    dependencies: {
      db,
      citizensTable: {},
      eq: () => ({}),
      FINAL_MINUTE_MS: 60_000,
      SIMULATOR_DURATION_MS: 59 * 60_000,
      ensureCitizenProgress: async () => ({
        simulatorCurrentQuestionId: 31,
        simulatorRevealedQuestionIds: [],
        simulatorCompleted: false,
      }),
      issueEligiblePassport: async () => {
        issueCalls += 1;
        return null;
      },
      Date: class FixedDate extends Date {
        constructor(value) {
          super(value === undefined ? clock.now : value);
        }
      },
    },
    get issueCalls() { return issueCalls; },
  };
}

async function loadStatusAt(loadStatus, fake, now) {
  fake.clock.now = now;
  const result = await loadStatus.call(null, 12);
  return { ...result, issueCalls: fake.issueCalls };
}

test("passport issuance waits until availableAt and credits a new applicant exactly once under concurrency", async () => {
  const deadline = new Date();
  const fake = makeIssuanceDb({
    id: 21,
    citizenNumber: "000000021",
    registrationStatus: "pending",
    availableAt: deadline,
    balanceMinutes: 0,
    ancestralMinuteGranted: false,
    status: "pending",
    onboardingCompleted: false,
    name: "Test Citizen",
    rank: "Citizen",
    meritScore: 0,
    phone: null,
    signatureBase64: "test-signature",
  });
  const serviceSource =
    sourceBetween(
      issuanceService,
      "export async function issueEligiblePassport(",
      "/** Best-effort worker; request-driven issuance remains the fallback on wake-up. */",
    ) + issuanceService.slice(issuanceService.indexOf("export async function issueDuePassports("));
  const issue = evaluate(
    serviceSource.replaceAll("export async function", "async function"),
    "({ issueEligiblePassport, issueDuePassports })",
    fake.dependencies,
  );

  assert.equal(await issue.issueEligiblePassport(21, new Date(deadline.getTime() - 1)), null);
  assert.equal(fake.state.registrationStatus, "pending");
  assert.equal(fake.ledger.length, 0);

  const [requestResult, scheduledCount] = await Promise.all([
    issue.issueEligiblePassport(21, deadline),
    issue.issueDuePassports(),
  ]);
  assert.equal((requestResult ? 1 : 0) + scheduledCount, 1);
  assert.equal(fake.state.registrationStatus, "issued");
  assert.equal(fake.state.balanceMinutes, 1);
  assert.equal(fake.state.ancestralMinuteGranted, true);
  assert.equal(fake.ledger.length, 1);
  assert.equal(fake.ledger[0].type, "ancestral_minute_granted");
  assert.equal(fake.ledger[0].amount, 1);
});

test("passport issuance does not credit or ledger an ancestral minute twice for an existing grant", async () => {
  const fake = makeIssuanceDb({
    id: 22,
    citizenNumber: "000000022",
    registrationStatus: "pending",
    availableAt: new Date(Date.UTC(2026, 0, 1, 1)),
    balanceMinutes: 9,
    ancestralMinuteGranted: true,
    status: "pending",
    onboardingCompleted: false,
    name: "Existing Citizen",
    rank: "Citizen",
    meritScore: 0,
    phone: null,
    signatureBase64: "test-signature",
  });
  const issue = evaluate(
    sourceBetween(issuanceService, "export async function issueEligiblePassport(", "export async function issueDuePassports(")
      .replace("export async function", "async function"),
    "issueEligiblePassport",
    fake.dependencies,
  );

  const result = await issue(22, fake.state.availableAt);
  assert.equal(result.ancestralMinuteGranted, false);
  assert.equal(fake.state.registrationStatus, "issued");
  assert.equal(fake.state.balanceMinutes, 9);
  assert.equal(fake.ledger.length, 0);
});

function makeIssuanceDb(initialCitizen) {
  const citizensTable = {
    id: "id",
    citizenNumber: "citizenNumber",
    registrationStatus: "registrationStatus",
    availableAt: "availableAt",
  };
  const state = { ...initialCitizen };
  const ledger = [];
  let transactionQueue = Promise.resolve();

  function matches(condition) {
    if (!condition) return true;
    if (condition.type === "and") return condition.conditions.every(matches);
    if (condition.type === "eq") return state[condition.column] === condition.value;
    if (condition.type === "lte") return state[condition.column] <= condition.value;
    if (condition.type === "sql") return Boolean(state.signatureBase64?.trim());
    return false;
  }

  const db = {
    select: () => ({
      from: () => ({
        where: (condition) => ({
          limit: async () => (matches(condition) ? [{ id: state.id }] : []),
        }),
      }),
    }),
    transaction: (callback) => {
      const result = transactionQueue.then(() => callback({
      select: () => ({
        from: () => ({
          where: (condition) => ({
            limit: async () => (matches(condition) ? [{ citizenNumber: state.citizenNumber }] : []),
          }),
        }),
      }),
      update: () => ({
        set: (updates) => ({
          where: (condition) => ({
            returning: async () => {
              if (!matches(condition)) return [];
              if (updates.balanceMinutes?.increment === 1) {
                Object.assign(state, updates, { balanceMinutes: state.balanceMinutes + 1 });
              } else {
                Object.assign(state, updates);
              }
              return [{ ...state }];
            },
          }),
        }),
      }),
      insert: () => ({
        values: async (entry) => { ledger.push(entry); },
      }),
      }));
      transactionQueue = result.catch(() => {});
      return result;
    },
  };

  return {
    state,
    ledger,
    dependencies: {
      db,
      citizensTable,
      timeBankLedgerTable: {},
      and: (...conditions) => ({ type: "and", conditions }),
      eq: (column, value) => ({ type: "eq", column, value }),
      lte: (column, value) => ({ type: "lte", column, value }),
      sql: () => ({ type: "sql", increment: 1 }),
      logger: { info() {}, warn() {} },
      notifyUserConditional: async () => {},
      notifyAdminPassportLifecycle: async () => {},
      logCitizenIssuedToSheets: async () => {},
      sendPassportEmail: async () => {},
    },
  };
}
