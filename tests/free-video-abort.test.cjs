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

function loadService(fetch) {
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module, exports: module.exports,
    require: (name) => name === "../lib/logger"
      ? { logger: { info() {}, warn() {} } }
      : name === "child_process"
        ? { spawn() { assert.fail("These tests should never launch FFmpeg"); } }
        : require(name),
    process: { env: {} }, Buffer, AbortController, AbortSignal,
    setTimeout, clearTimeout, fetch,
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

for (const withSignal of [false, true]) {
  test(`HuggingFace generation still saves video ${withSignal ? "with" : "without"} a caller signal`, async (t) => {
    const dir = fixture(t);
    const video = Buffer.alloc(2048, 7);
    let calls = 0;
    const generate = loadService(async (url, init) => {
      calls++;
      assert.match(url, /huggingface/);
      assert.equal(init.method, "POST");
      assert.equal(JSON.parse(init.body).inputs, "test prompt");
      assert.equal(init.signal.aborted, false);
      return new Response(video, { headers: { "content-type": "video/mp4" } });
    });
    const result = await generate("test prompt", dir, withSignal ? new AbortController().signal : undefined);
    assert.equal(result.videoPath, path.join(dir, "hf_video.mp4"));
    assert.equal(result.ownsTmpDir, false);
    assert.deepEqual(fs.readFileSync(result.videoPath), video);
    assert.equal(calls, 1);
  });
}
