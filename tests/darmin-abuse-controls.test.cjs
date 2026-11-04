const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("Darmin reward and task mutation routes have per-citizen shared throttles", () => {
  const routes = read("artifacts/api-server/src/routes/citizens.ts");
  for (const route of [
    '"/citizens/focus/start"',
    '"/citizens/focus/:id/pause"',
    '"/citizens/focus/:id/resume"',
    '"/citizens/focus/:id/complete"',
    '"/citizens/focus/quiz/question"',
    '"/citizens/focus/quiz/answer"',
    '"/citizens/time-matrix/tasks"',
  ]) {
    const declaration = routes.slice(routes.indexOf(`router.${route.includes("question") ? "get" : "post"}(${route}`));
    assert.notEqual(declaration, routes, `Missing route ${route}`);
    assert.match(declaration.slice(0, 250), /requireAuth,\s*rateLimit\(/, `${route} must authenticate and throttle`);
    assert.match(declaration.slice(0, 250), /request\.citizen!\.id/, `${route} must key its limit to the authenticated citizen`);
  }
});

test("ordinary reward caps and cooldowns do not permanently flag citizens", () => {
  const routes = read("artifacts/api-server/src/routes/citizens.ts");
  const focus = routes.slice(routes.indexOf('router.post("/citizens/focus/:id/complete"'), routes.indexOf('router.get("/citizens/focus/history"'));
  const quiz = routes.slice(routes.indexOf('router.post("/citizens/focus/quiz/answer"'), routes.indexOf('router.get("/citizens/time-matrix/tasks"'));
  assert.doesNotMatch(focus, /suspiciousActivity:\s*true/);
  assert.doesNotMatch(quiz, /suspiciousActivity:\s*true/);
  assert.match(focus, /rewardBlockedReason = "daily_cap"/);
  assert.match(quiz, /rewardBlockedReason = "cooldown"/);
});

test("TWA account throttling uses only Telegram identity after signature validation", () => {
  const twa = read("artifacts/api-server/src/routes/twa.ts");
  const signatureCheck = twa.indexOf("if (!validateInitData(initData, botToken))");
  const identityParse = twa.indexOf("const telegramId = String(tgUser.id)");
  const limiter = twa.indexOf('action: "telegram_webapp_auth"');
  assert.ok(signatureCheck >= 0 && identityParse > signatureCheck && limiter > identityParse);
  assert.match(twa.slice(limiter, limiter + 400), /subject:\s*telegramId/);
});

test("Telegram admin review callbacks resolve pending security events", () => {
  const telegram = read("artifacts/api-server/src/services/telegramService.ts");
  assert.match(telegram, /tm_clear:[\s\S]{0,900}darminSecurityEventsTable/);
  assert.match(telegram, /tm_block:[\s\S]{0,900}darminSecurityEventsTable/);
  assert.match(telegram, /reviewedBy:\s*String\(ctx\.from\.id\)/);
});
