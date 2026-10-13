const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");

const root = path.resolve(__dirname, "..");
const { transformSync } = createRequire(path.join(root, "artifacts/api-server/package.json"))("esbuild");
const source = fs.readFileSync(path.join(root, "artifacts/api-server/src/services/renderQueue.ts"), "utf8");
const code = transformSync(source, { loader: "ts", format: "cjs" }).code;

function fixture(render, fallbackError) {
  const updates = [];
  const fallbackCalls = [];
  const logs = [];
  const timers = [];
  const capsules = { slotId: "slotId" };
  const slots = { id: "id" };
  const logger = Object.fromEntries(["info", "warn", "error"].map(level => [
    level, (...args) => logs.push({ level, args }),
  ]));
  logger.child = () => logger;
  const dependencies = {
    crypto: { randomUUID: () => "unused" },
    "@workspace/db": {
      tvCapsulesTable: capsules,
      tvSlotsTable: slots,
      citizensTable: {},
      db: {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: async () => [{ seedText: "Manifesto", visualStyle: "blue" }],
            }),
          }),
        }),
        update: table => ({
          set: values => ({
            where: async condition => { updates.push({ table, values, condition }); },
          }),
        }),
      },
    },
    "drizzle-orm": { eq: (column, value) => ({ column, value }) },
    "./renderService": {
      renderCapsule: render,
      renderLightVideo: async (...args) => {
        fallbackCalls.push(args);
        if (fallbackError) throw fallbackError;
        return "/fallback.mp4";
      },
    },
    "./telegramService": { sendTransactionNotification: async () => {} },
    "./tvPublishService": {},
    "../lib/logger": { logger },
  };
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module, exports: module.exports,
    require: name => {
      assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
    process: { env: { MAX_CONCURRENT_RENDERS: "1" } },
    AbortController,
    setTimeout: (callback, ms) => {
      const timer = { callback, ms, cleared: false };
      timers.push(timer);
      return timer;
    },
    clearTimeout: timer => { if (timer) timer.cleared = true; },
  });
  const api = module.exports;
  const enqueue = id => api.enqueueRender({
    jobId: `job-${id}`, slotId: id, citizenId: 10,
    capsuleSeedText: null, timeoutMs: 100,
  });
  return { api, enqueue, updates, fallbackCalls, logs, timers, capsules, slots };
}

async function settle() {
  await new Promise(resolve => setImmediate(resolve));
}

for (const error of [
  Object.assign(new Error("cancelled"), { name: "AbortError" }),
  { name: "AbortError", message: "cancelled" },
]) {
  test(`AbortError (${error instanceof Error ? "Error" : "plain object"}) fills the slot and drains the queue`, async () => {
    const f = fixture(async () => { throw error; });
    f.enqueue(1);
    f.enqueue(2);
    assert.equal(f.api.getRenderQueueStats().queued, 1);
    await settle();
    assert.equal(f.fallbackCalls.length, 2);
    assert.deepEqual(f.fallbackCalls[0], [null, "Manifesto", 1, "blue"]);
    for (const id of [1, 2]) {
      assert.equal(f.api.getRenderJobStatus(`job-${id}`).status, "done");
      assert.ok(f.updates.some(u => u.table === f.slots && u.condition.value === id && u.values.status === "broadcast"));
      assert.ok(f.updates.some(u => u.table === f.capsules && u.condition.value === id && u.values.status === "rendered"));
    }
    assert.ok(!f.updates.some(u => u.values.status === "draft"));
    assert.ok(f.logs.some(l => l.level === "warn" && l.args[1].includes("deadline race won by AbortError")));
    assert.ok(f.logs.filter(l => l.level === "warn").every(l => Number.isFinite(l.args[0].elapsed)));
    assert.equal(f.api.getRenderQueueStats().active, 0);
    assert.equal(f.api.getRenderQueueStats().queued, 0);
    assert.ok(f.timers.filter(t => t.ms === 100).every(t => t.cleared));
  });
}

test("deadline rejection still uses the solid-color fallback", async () => {
  let signal;
  const f = fixture((_id, s) => { signal = s; return new Promise(() => {}); });
  f.enqueue(1);
  f.timers.find(t => t.ms === 100).callback();
  await settle();
  assert.equal(signal.aborted, true);
  assert.equal(f.fallbackCalls.length, 1);
  assert.equal(f.api.getRenderJobStatus("job-1").status, "done");
  assert.ok(f.logs.some(l => l.args[1]?.includes("exceeded wall-clock timeout")));
  assert.equal(f.api.getRenderQueueStats().active, 0);
});

test("ordinary errors do not use the fallback", async () => {
  const f = fixture(async () => { throw new Error("provider failed"); });
  f.enqueue(1);
  await settle();
  assert.equal(f.fallbackCalls.length, 0);
  assert.equal(f.api.getRenderJobStatus("job-1").status, "failed");
  assert.ok(f.updates.some(u => u.values.status === "draft"));
  assert.ok(f.logs.some(l => l.level === "error" && l.args[1] === "Render job failed"));
  assert.equal(f.api.getRenderQueueStats().active, 0);
});

test("a failed cancellation fallback releases capacity for the next job", async () => {
  const f = fixture(
    async () => { throw { name: "AbortError" }; },
    new Error("fallback failed"),
  );
  f.enqueue(1);
  f.enqueue(2);
  await settle();
  assert.equal(f.fallbackCalls.length, 2);
  assert.equal(f.api.getRenderJobStatus("job-1").status, "failed");
  assert.equal(f.api.getRenderJobStatus("job-2").status, "failed");
  assert.equal(f.updates.filter(u => u.values.status === "draft").length, 2);
  assert.equal(f.api.getRenderQueueStats().active, 0);
  assert.equal(f.api.getRenderQueueStats().queued, 0);
});
