const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");

const root = path.resolve(__dirname, "..");
const apiRequire = createRequire(path.join(root, "artifacts/api-server/package.json"));
const { transformSync } = apiRequire("esbuild");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

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
    email: "citizen@example.test",
    rank: "Citizen",
    meritScore: 0,
    phone: null,
    signatureBase64: validSignature,
  });
  const serviceSource = [
    sourceBetween(
      issuanceService,
      "export async function issueEligiblePassport(",
      "/**\n * Deliver due passport-ready outbox rows.",
    ),
    sourceBetween(
      issuanceService,
      "export async function issueDuePassports(",
      "/**\n * Emit a rate-limited aggregate warning",
    ),
  ].join("\n");
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
  assert.equal(fake.emailNotifications.length, 1);
  assert.equal(fake.emailNotificationAttempts, 1);
});

test("missing, blank, and malformed signatures cannot issue an eligible pending citizen", async () => {
  for (const [label, signatureBase64] of [
    ["missing", null],
    ["blank", "   "],
    ["malformed", "not-a-signature"],
    ["invalid image data", "data:image/png;base64,AAAA"],
    ["invalid base64", "data:image/png;base64,iVBORw0KGgo%%%"],
  ]) {
    const fake = makeIssuanceDb({
      id: 28,
      citizenNumber: "000000028",
      registrationStatus: "pending",
      availableAt: new Date(Date.now() - 1000),
      balanceMinutes: 0,
      ancestralMinuteGranted: false,
      status: "pending",
      onboardingCompleted: false,
      name: "Unsigned Citizen",
      email: "citizen@example.test",
      rank: "Citizen",
      meritScore: 0,
      phone: null,
      signatureBase64,
    });
    const issue = loadIssuanceFunction(fake);

    assert.equal(await issue(28), null, `${label} signature must be rejected`);
    assert.equal(fake.state.registrationStatus, "pending");
    assert.equal(fake.state.status, "pending");
    assert.equal(fake.state.balanceMinutes, 0);
    assert.equal(fake.ledger.length, 0);
    assert.equal(fake.emailNotifications.length, 0);
    assert.equal(fake.emailNotificationAttempts, 0);
  }
});

test("a valid saved signature issues after eligibility and queues email only after the transition", async () => {
  const availableAt = new Date(Date.now() - 1000);
  const fake = makeIssuanceDb({
    id: 29,
    citizenNumber: "000000029",
    registrationStatus: "pending",
    availableAt,
    balanceMinutes: 0,
    ancestralMinuteGranted: false,
    status: "pending",
    onboardingCompleted: false,
    name: "Signed Citizen",
    email: "citizen@example.test",
    rank: "Citizen",
    meritScore: 0,
    phone: null,
    signatureBase64: validSignature,
  });
  const issue = loadIssuanceFunction(fake);

  assert.equal(await issue(29, new Date(availableAt.getTime() - 1)), null);
  assert.equal(fake.emailNotifications.length, 0);
  assert.equal(fake.emailNotificationAttempts, 0);

  const result = await issue(29, availableAt);
  assert.equal(result.citizen.registrationStatus, "issued");
  assert.equal(result.citizen.status, "active");
  assert.equal(result.ancestralMinuteGranted, true);
  assert.equal(fake.state.balanceMinutes, 1);
  assert.equal(fake.emailNotifications.length, 1);
  assert.equal(fake.emailNotificationAttempts, 1);
  assert.equal(fake.emailNotificationAttemptsAfterTransition, 1);
});

test("concurrent eligible issuance attempts grant one minute and attempt one notification", async () => {
  const availableAt = new Date(Date.now() - 1000);
  const fake = makeIssuanceDb({
    id: 30,
    citizenNumber: "000000030",
    registrationStatus: "pending",
    availableAt,
    balanceMinutes: 0,
    ancestralMinuteGranted: false,
    status: "pending",
    onboardingCompleted: false,
    name: "Concurrent Citizen",
    email: "citizen@example.test",
    rank: "Citizen",
    meritScore: 0,
    phone: null,
    signatureBase64: validSignature,
  });
  const issue = loadIssuanceFunction(fake);

  const results = await Promise.all([issue(30, availableAt), issue(30, availableAt)]);

  assert.equal(results.filter(Boolean).length, 1);
  assert.equal(fake.state.registrationStatus, "issued");
  assert.equal(fake.state.balanceMinutes, 1);
  assert.equal(fake.ledger.length, 1);
  assert.equal(fake.emailNotifications.length, 1);
  assert.equal(fake.emailNotificationAttempts, 1);
  assert.equal(fake.emailNotificationAttemptsAfterTransition, 1);
});

test("signature upload rejects missing, blank, malformed, and uncroppable signatures", async () => {
  const source = read("artifacts/api-server/src/routes/citizens.ts");
  const route = sourceBetween(
    source,
    'router.post("/citizens/me/signature"',
    '\n});',
  );
  const handlerSource = route.slice(route.indexOf("async (req, res): Promise<void> => {"));
  const handler = evaluate(
    `const handler = ${handlerSource}}; globalThis.__handler = handler;`,
    "__handler",
    {
      z: apiRequire("zod"),
      cropSignature: async () => null,
      db: { update: () => { throw new Error("invalid signature must not be saved"); } },
      citizensTable: {},
      eq: () => ({}),
      issueEligiblePassport: async () => { throw new Error("invalid signature must not trigger issuance"); },
    },
  );

  for (const body of [
    {},
    { signatureBase64: "" },
    { signatureBase64: "not-an-image" },
    { signatureBase64: "data:image/png;base64,AAAA" },
  ]) {
    const res = {
      statusCode: 200,
      body: undefined,
      status(code) { this.statusCode = code; return this; },
      json(value) { this.body = value; return this; },
    };
    await handler({ body, citizen: { id: 31, registrationStatus: "pending" } }, res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.success, undefined);
  }
});

test("one passport issuance failure does not stop the batch and remains eligible for retry", async () => {
  const dueCitizens = [{ id: 31 }, { id: 32 }, { id: 33 }];
  const attempts = [];
  const errors = [];
  let shouldFailFirstAttempt = true;
  const issueDuePassports = evaluate(
    issuanceService
      .slice(issuanceService.indexOf("export async function issueDuePassports("))
      .replace("export async function", "async function"),
    "issueDuePassports",
    {
      db: {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: async () => dueCitizens,
            }),
          }),
        }),
      },
      citizensTable: { id: "id", registrationStatus: "registrationStatus", availableAt: "availableAt" },
      and: (...conditions) => conditions,
      eq: (...values) => values,
      lte: (...values) => values,
      issueEligiblePassport: async (citizenId) => {
        attempts.push(citizenId);
        if (citizenId === 31 && shouldFailFirstAttempt) {
          shouldFailFirstAttempt = false;
          throw new Error("temporary issuance failure");
        }
        return { citizen: { id: citizenId } };
      },
      logger: { error: (...values) => errors.push(values) },
    },
  );

  assert.equal(await issueDuePassports(), 2);
  assert.deepEqual(attempts, [31, 32, 33]);
  assert.equal(errors.length, 1);
  assert.equal(errors[0][0].citizenId, 31);
  assert.match(errors[0][1], /continuing with remaining eligible citizens/);

  // The still-pending record is selected and successfully retried by the next run.
  assert.equal(await issueDuePassports(), 3);
  assert.deepEqual(attempts, [31, 32, 33, 31, 32, 33]);
});

test("passport backlog warning reports aggregate age and count without applicant data", async () => {
  const fixedNow = new Date(Date.UTC(2026, 9, 17, 12));
  const warnings = [];
  let backlog = {
    pendingEligibleCount: 8,
    oldestAvailableAt: new Date(fixedNow.getTime() - 6 * 60_000),
  };
  const serviceSource = issuanceService
    .slice(issuanceService.indexOf("export const PASSPORT_BACKLOG_WARNING_AGE_MS"))
    .replaceAll("export const", "const")
    .replaceAll("export async function", "async function");
  const monitor = evaluate(
    serviceSource,
    "({ warnIfEligiblePassportBacklog, PASSPORT_BACKLOG_WARNING_AGE_MS })",
    {
      Date,
      db: {
        select: () => ({
          from: () => ({
            where: async () => [backlog],
          }),
        }),
      },
      citizensTable: {
        registrationStatus: "registrationStatus",
        availableAt: "availableAt",
        signatureBase64: "signatureBase64",
      },
      and: (...conditions) => conditions,
      eq: (...values) => values,
      lte: (...values) => values,
      sql: (...parts) => parts,
      logger: { warn: (...args) => warnings.push(args) },
    },
  );

  assert.equal(monitor.PASSPORT_BACKLOG_WARNING_AGE_MS, 5 * 60_000);
  await monitor.warnIfEligiblePassportBacklog(fixedNow);
  assert.equal(warnings.length, 1);
  assert.deepEqual(
    JSON.parse(JSON.stringify(warnings[0][0])),
    {
      pendingEligibleCount: 8,
      oldestPendingAgeMs: 6 * 60_000,
      warningAgeThresholdMs: 5 * 60_000,
    },
  );
  assert.match(warnings[0][1], /Eligible passport issuance backlog exceeded age threshold/);

  await monitor.warnIfEligiblePassportBacklog(new Date(fixedNow.getTime() + 30_000));
  assert.equal(warnings.length, 1, "warning is rate-limited while the backlog persists");

  backlog = {
    pendingEligibleCount: 1,
    oldestAvailableAt: new Date(fixedNow.getTime() - 4 * 60_000),
  };
  await monitor.warnIfEligiblePassportBacklog(new Date(fixedNow.getTime() + 60_000));
  assert.equal(warnings.length, 1, "no warning is emitted below the age threshold");
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
    signatureBase64: validSignature,
  });
  const issue = evaluate(
    sourceBetween(
      issuanceService,
      "export async function issueEligiblePassport(",
      "/**\n * Deliver due passport-ready outbox rows.",
    )
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

const validSignature =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/jZkAAAAASUVORK5CYII=";

function loadIssuanceFunction(fake) {
  const issue = evaluate(
    sourceBetween(
      issuanceService,
      "export async function issueEligiblePassport(",
      "/**\n * Deliver due passport-ready outbox rows.",
    ).replace("export async function", "async function"),
    "issueEligiblePassport",
    fake.dependencies,
  );
  return issue;
}

function makeIssuanceDb(initialCitizen) {
  const timeBankLedgerTable = {};
  const passportEmailNotificationsTable = {};
  const citizensTable = {
    id: "id",
    citizenNumber: "citizenNumber",
    registrationStatus: "registrationStatus",
    availableAt: "availableAt",
    signatureBase64: "signatureBase64",
  };
  const state = { signatureBase64: "signed-signature", ...initialCitizen };
  const ledger = [];
  const emailNotifications = [];
  let emailNotificationAttempts = 0;
  let emailNotificationAttemptsAfterTransition = 0;
  let transactionQueue = Promise.resolve();

  function matches(condition) {
    if (!condition) return true;
    if (condition.type === "and") return condition.conditions.every(matches);
    if (condition.type === "eq") return state[condition.column] === condition.value;
    if (condition.type === "lte") return state[condition.column] <= condition.value;
    if (condition.type === "signature-valid") return isValidSavedSignature(state.signatureBase64);
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
      insert: (table) => ({
        values: async (entry) => {
          if (table === timeBankLedgerTable) ledger.push(entry);
          else if (table === passportEmailNotificationsTable) emailNotifications.push(entry);
        },
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
      timeBankLedgerTable,
      passportEmailNotificationsTable,
      and: (...conditions) => ({ type: "and", conditions }),
      eq: (column, value) => ({ type: "eq", column, value }),
      lte: (column, value) => ({ type: "lte", column, value }),
      sql: (strings) => {
        const expression = strings.join("?");
        if (expression.includes("base64")) return { type: "signature-valid" };
        return { type: "sql", increment: 1 };
      },
      logger: { info() {}, warn() {} },
      notifyUserConditional: async () => {},
      notifyAdminPassportLifecycle: async () => {},
      logCitizenIssuedToSheets: async () => {},
      sendPassportEmail: async () => {},
      retryPendingPassportEmails: async () => {
        emailNotificationAttempts += 1;
        if (state.registrationStatus === "issued") emailNotificationAttemptsAfterTransition += 1;
      },
    },
    emailNotifications,
    get emailNotificationAttempts() { return emailNotificationAttempts; },
    get emailNotificationAttemptsAfterTransition() { return emailNotificationAttemptsAfterTransition; },
  };
}

function isValidSavedSignature(value) {
  return typeof value === "string" &&
    /^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/]+={0,2}$/.test(value);
}
