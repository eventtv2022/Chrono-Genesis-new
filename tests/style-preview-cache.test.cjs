const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const vm = require("node:vm");
const { createRequire } = require("node:module");

const root = path.resolve(__dirname, "..");
const { transformSync } = createRequire(path.join(root, "artifacts/api-server/package.json"))("esbuild");
const source = fs.readFileSync(path.join(root, "artifacts/api-server/src/routes/tv.ts"), "utf8");
const block = source.slice(source.indexOf("// ─── Style preview cache"), source.indexOf("// ─── Validation schemas"));
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
const ttl = 24 * 60 * 60 * 1000;

function loadHandler(directory, fetch, filesystem = fs) {
  let handler;
  const { code } = transformSync(block.replace('"/tmp/tn-style-previews"', JSON.stringify(directory)), {
    loader: "ts", target: "es2022",
  });
  vm.runInNewContext(code, {
    fs: filesystem, path, Buffer, Date, fetch,
    createHash: crypto.createHash, randomUUID: crypto.randomUUID,
    AbortController, setTimeout, clearTimeout,
    VISUAL_STYLES: ["space", "cyberpunk", "abstract", "nature", "minimal"],
    router: { get: (_, callback) => { handler = callback; } },
  });
  return handler;
}

async function request(handler, seed = "test", style = "space") {
  const result = { headers: {}, warnings: [] };
  const res = {
    setHeader: (key, value) => { result.headers[key] = value; },
    send: (body) => { result.body = body; },
    status: (status) => { result.status = status; return res; },
    json: (body) => { result.body = body; },
  };
  await handler({ query: { style, seed }, log: { warn: (...args) => result.warnings.push(args) } }, res);
  return result;
}

async function fixture(t) {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "tn-preview-test-"));
  t.after(() => fs.promises.rm(directory, { recursive: true, force: true }));
  return directory;
}

test("preview writes a hashed JPEG and a fresh handler reads it without Pollinations", async (t) => {
  const directory = await fixture(t);
  let calls = 0;
  const fetch = async () => { calls++; return new Response(jpeg); };
  const handler = loadHandler(directory, fetch);
  const seed = "../../unsafe/seed";
  assert.deepEqual((await request(handler, seed)).body, jpeg);
  const filename = `space-${crypto.createHash("sha256").update(`space:${seed}`).digest("hex")}.jpg`;
  assert.deepEqual(await fs.promises.readdir(directory), [filename]);
  assert.deepEqual(await fs.promises.readFile(path.join(directory, filename)), jpeg);
  // Same process: memory hit. New handler: empty Map, just like a restart.
  await request(handler, seed);
  const restored = await request(loadHandler(directory, fetch), seed);
  assert.deepEqual(restored.body, jpeg);
  assert.equal(restored.headers["Content-Type"], "image/jpeg");
  assert.equal(restored.headers["Cache-Control"], "public, max-age=86400");
  assert.equal(calls, 1);
});

test("disk mtime enforces TTL and warming memory does not extend it", async (t) => {
  const directory = await fixture(t);
  let calls = 0;
  const fetch = async () => { calls++; return new Response(jpeg); };
  await request(loadHandler(directory, fetch));
  const [filename] = await fs.promises.readdir(directory);
  const file = path.join(directory, filename);
  const now = Date.now();
  const almostExpired = new Date(now - ttl + 1000);
  await fs.promises.utimes(file, almostExpired, almostExpired);
  const handler = loadHandler(directory, fetch);
  await request(handler);
  assert.equal(calls, 1);
  // Advance only the cache clock; no sleep or external API is required.
  const originalNow = Date.now;
  Date.now = () => now + 2000;
  try {
    await request(handler);
    assert.equal(calls, 2);
  } finally {
    Date.now = originalNow;
  }
});

test("different seeds and styles use distinct disk entries", async (t) => {
  const directory = await fixture(t);
  let calls = 0;
  const handler = loadHandler(directory, async () => { calls++; return new Response(jpeg); });
  await request(handler, "first");
  await request(handler, "second");
  await request(handler, "first", "nature");
  assert.equal(calls, 3);
  assert.equal((await fs.promises.readdir(directory)).length, 3);
});

test("disk errors are logged but a generated preview still works", async (t) => {
  const directory = await fixture(t);
  const error = Object.assign(new Error("access denied"), { code: "EACCES" });
  const filesystem = { promises: {
    stat: async () => { throw error; },
    mkdir: async () => { throw error; },
    unlink: async () => { throw Object.assign(new Error("missing"), { code: "ENOENT" }); },
  } };
  const result = await request(loadHandler(directory, async () => new Response(jpeg), filesystem));
  assert.deepEqual(result.body, jpeg);
  assert.equal(result.warnings.length, 2);
});

test("upstream failures are not saved to disk", async (t) => {
  const directory = await fixture(t);
  const result = await request(loadHandler(directory, async () => new Response("unavailable", { status: 503 })));
  assert.equal(result.status, 502);
  assert.deepEqual(await fs.promises.readdir(directory), []);
});
