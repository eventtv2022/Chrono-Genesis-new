const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");

const root = path.resolve(__dirname, "..");
const { transformSync } = createRequire(path.join(root, "artifacts/api-server/package.json"))("esbuild");
const source = fs.readFileSync(
  path.join(root, "artifacts/api-server/src/services/freeVideoApiService.ts"), "utf8",
);
const { code } = transformSync(source, { loader: "ts", format: "cjs", target: "es2022" });

function controlledTimers() {
  let nextId = 0;
  const active = new Map();
  const clearedDelays = [];

  return {
    setTimeout(callback, delay) {
      const id = ++nextId;
      active.set(id, { callback, delay });
      return id;
    },
    clearTimeout(id) {
      const timer = active.get(id);
      if (timer) {
        active.delete(id);
        clearedDelays.push(timer.delay);
      }
    },
    fire(id) {
      const timer = active.get(id);
      assert.ok(timer, `expected active timer ${id}`);
      active.delete(id);
      timer.callback();
    },
    active,
    activeCount() {
      return active.size;
    },
    clearedDelays,
  };
}

function loadService(fetch, timers) {
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module, exports: module.exports,
    require: (name) => name === "../lib/logger"
      ? { logger: { info() {}, warn() {} } }
      : name === "child_process"
        ? { spawn() { assert.fail("These tests should never launch FFmpeg"); } }
        : require(name),
    process: { env: {} }, Buffer, AbortController, AbortSignal,
    setTimeout: timers?.setTimeout ?? setTimeout,
    clearTimeout: timers?.clearTimeout ?? clearTimeout,
    fetch,
  });
  return module.exports.generateAIBackground;
}

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tn-hf-abort-test-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test("render cancellation aborts the pending HuggingFace fetch and settles generation", { timeout: 2000 }, async (t) => {
  const dir = fixture(t);
  const controller = new AbortController();
  let requestSignal;
  let aborted = false;
  const generate = loadService((url, init) => {
    assert.match(url, /huggingface/);
    requestSignal = init.signal;
    return new Promise((_, reject) => {
      init.signal.addEventListener("abort", () => {
        aborted = true;
        reject(init.signal.reason);
      }, { once: true });
    });
  });
  const pending = generate("test prompt", dir, controller.signal);
  assert.ok(requestSignal instanceof AbortSignal);
  assert.equal(requestSignal.aborted, false);
  controller.abort();
  const result = await pending;
  assert.equal(aborted, true);
  assert.equal(requestSignal.aborted, true);
  assert.equal(result.videoPath, null);
  assert.equal(result.tmpDir, dir);
  assert.deepEqual(fs.readdirSync(dir), []);
});

test("an already-cancelled render reaches HuggingFace with an aborted signal", { timeout: 2000 }, async (t) => {
  const dir = fixture(t);
  const controller = new AbortController();
  controller.abort();
  let calls = 0;
  const generate = loadService(async (url, init) => {
    calls++;
    assert.match(url, /huggingface/);
    assert.equal(init.signal.aborted, true);
    throw init.signal.reason;
  });
  assert.equal((await generate("test prompt", dir, controller.signal)).videoPath, null);
  assert.equal(calls, 1);
});

test("the HuggingFace provider timeout aborts its request and allows fallback", { timeout: 2000 }, async (t) => {
  const dir = fixture(t);
  const timers = controlledTimers();
  let requestSignal;
  let aborted = false;
  const urls = [];
  const generate = loadService((url, init) => {
    urls.push(url);
    if (url.includes("huggingface")) {
      requestSignal = init.signal;
      return new Promise((_, reject) => {
        init.signal.addEventListener("abort", () => {
          aborted = true;
          reject(init.signal.reason);
        }, { once: true });
      });
    }
    return Promise.resolve(new Response("fallback unavailable", { status: 503 }));
  }, timers);

  const pending = generate("test prompt", dir);
  assert.ok(requestSignal instanceof AbortSignal);
  assert.equal(requestSignal.aborted, false);
  assert.deepEqual([...timers.active.values()].map(({ delay }) => delay), [45_000]);

  timers.fire(1);
  const result = await pending;

  assert.equal(aborted, true);
  assert.equal(requestSignal.aborted, true);
  assert.equal(result.videoPath, null);
  assert.ok(urls.some((url) => url.includes("pollinations")), "Pollinations should be tried after the timeout");
  assert.ok(urls.some((url) => url.includes("picsum")), "Picsum should be tried after Pollinations fails");
  assert.equal(timers.activeCount(), 0);
});

for (const withSignal of [false, true]) {
  test(`HuggingFace generation still saves video ${withSignal ? "with" : "without"} a caller signal`, async (t) => {
    const dir = fixture(t);
    const timers = controlledTimers();
    const video = Buffer.alloc(2048, 7);
    let calls = 0;
    const generate = loadService(async (url, init) => {
      calls++;
      assert.match(url, /huggingface/);
      assert.equal(init.method, "POST");
      assert.equal(JSON.parse(init.body).inputs, "test prompt");
      assert.equal(init.signal.aborted, false);
      return new Response(video, { headers: { "content-type": "video/mp4" } });
    }, timers);
    const result = await generate("test prompt", dir, withSignal ? new AbortController().signal : undefined);
    assert.equal(result.videoPath, path.join(dir, "hf_video.mp4"));
    assert.equal(result.ownsTmpDir, false);
    assert.deepEqual(fs.readFileSync(result.videoPath), video);
    assert.equal(calls, 1);
    assert.equal(timers.activeCount(), 0);
    assert.deepEqual(timers.clearedDelays, [45_000]);
  });
}

test("the HuggingFace timeout is cleared when its request fails", async (t) => {
  const dir = fixture(t);
  const timers = controlledTimers();
  const generate = loadService(async () => {
    throw new Error("connection reset");
  }, timers);

  const result = await generate("test prompt", dir);

  assert.equal(result.videoPath, null);
  assert.equal(timers.activeCount(), 0);
  assert.equal(timers.clearedDelays[0], 45_000);
  assert.ok(timers.clearedDelays.includes(20_000), "fallback request timers should also be cleared");
});
