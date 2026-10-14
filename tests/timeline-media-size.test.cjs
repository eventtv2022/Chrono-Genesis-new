const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");
const { Readable } = require("node:stream");

const root = path.resolve(__dirname, "..");
const requireApi = createRequire(path.join(root, "artifacts/api-server/package.json"));
const { transformSync } = requireApi("esbuild");
const multer = requireApi("multer");
const server = fs.readFileSync(path.join(root, "artifacts/api-server/src/routes/timeline.ts"), "utf8");
const mobile = fs.readFileSync(path.join(root, "artifacts/mobile/app/(tabs)/timeline.tsx"), "utf8");
const translations = fs.readFileSync(path.join(root, "artifacts/mobile/lib/i18n.ts"), "utf8");
const limit = 10 * 1024 * 1024;

function evaluate(source, expression, globals) {
  const { code } = transformSync(source, { loader: "ts", target: "es2022" });
  return vm.runInNewContext(`${code}\n${expression}`, globals);
}

const pickerStart = mobile.indexOf("  const pickFile = async");
const pickerSource = mobile.slice(pickerStart, mobile.indexOf("  const uploadCapsuleMedia", pickerStart));
const uploadStart = server.indexOf("const capsuleUpload = multer");
const uploadSource = server.slice(uploadStart, server.indexOf("\nconst router", uploadStart));
// Keep the real multer config and parser, but use memory storage to avoid disk IO.
const upload = evaluate(uploadSource, "capsuleUpload.single('file')", {
  multer: Object.assign((options) => multer(options), {
    diskStorage: () => multer.memoryStorage(),
  }),
});

async function parseUpload(size, parser = upload) {
  const boundary = "size-test";
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="file.txt"\r\nContent-Type: text/plain\r\n\r\n`),
    Buffer.alloc(size),
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const req = Readable.from(body);
  req.headers = {
    "content-type": `multipart/form-data; boundary=${boundary}`,
    "content-length": String(body.length),
  };
  const error = await new Promise((resolve) => parser(req, {}, resolve));
  return { error, file: req.file };
}

for (const size of [limit - 1, limit, limit + 1, 11 * 1024 * 1024, 12 * 1024 * 1024]) {
  test(`client and real multer agree for ${size} bytes`, async () => {
    const chosen = [];
    const alerts = [];
    const loading = [];
    const picker = evaluate(pickerSource, "pickFile", {
      console: { log() {}, error() {} },
      DocumentPicker: { getDocumentAsync: async () => ({
        canceled: false, assets: [{ uri: "file:///media", name: "file.txt", mimeType: "text/plain", size }],
      }) },
      setIsPickingMedia: (value) => loading.push(value),
      setCapsuleMedia: (value) => chosen.push(value),
      Alert: { alert: (...args) => alerts.push(args) },
      t: { file_limit_title: "File Limit", file_limit_size: "File exceeds the 10 MB limit." },
    });
    await picker();
    const parsed = await parseUpload(size);
    const rejected = size > limit;
    assert.equal(Boolean(parsed.error), rejected, "server boundary");
    assert.equal(chosen.length, rejected ? 0 : 1, "picker boundary");
    assert.deepEqual(loading, [true, false]);
    assert.deepEqual(alerts, rejected ? [["File Limit", "File exceeds the 10 MB limit."]] : []);
    if (rejected) assert.equal(parsed.error.code, "LIMIT_FILE_SIZE");
    else assert.equal(parsed.file.size, size);
  });
}

test("all localized size hints and errors say 10 MB, not 12 MB", () => {
  for (const key of ["file_limit_size", "file_limit_both", "tl_media_limit"]) {
    const values = [...translations.matchAll(new RegExp(`${key}: "([^"]+)"`, "g"))];
    assert.equal(values.length, 27, key);
    for (const [, value] of values) {
      assert.match(value, /10|۱۰|১০/, `${key}: ${value}`);
      assert.doesNotMatch(value, /12|۱۲|১২/, `${key}: ${value}`);
    }
  }
  assert.match(server, /максимум 10 МБ/);
});

test("picker reports both limits before attaching an oversized long video", async () => {
  const alerts = [];
  const picker = evaluate(pickerSource, "pickFile", {
    console: { log() {}, error() {} },
    DocumentPicker: { getDocumentAsync: async () => ({
      canceled: false, assets: [{ uri: "file:///video", name: "video.mp4", mimeType: "video/mp4", size: limit + 1 }],
    }) },
    getMediaDurationSeconds: async () => 61,
    setIsPickingMedia() {},
    setCapsuleMedia() { assert.fail("Invalid attachment must not enter the editor"); },
    Alert: { alert: (...args) => alerts.push(args) },
    t: { file_limit_title: "Limit", file_limit_both: "Max 10 MB and 1 minute" },
  });
  await picker();
  assert.deepEqual(alerts, [["Limit", "Max 10 MB and 1 minute"]]);
});

test("oversized uploads return a clear 413 response with the same limit", () => {
  const start = server.indexOf('router.use("/timeline/capsule/upload"');
  let handler;
  evaluate(server.slice(start, server.indexOf("\nexport default", start)), "undefined", {
    router: { use(_path, callback) { handler = callback; } },
  });
  let status;
  let body;
  handler({ code: "LIMIT_FILE_SIZE" }, {}, {
    status(value) { status = value; return this; },
    json(value) { body = value; },
  }, () => assert.fail("Size error should be handled"));
  assert.equal(status, 413);
  assert.equal(body.error, "Файл слишком большой — максимум 10 МБ");
});

const chatServer = fs.readFileSync(path.join(root, "artifacts/api-server/src/routes/chat.ts"), "utf8");
const chatUploadStart = chatServer.indexOf("const chatUpload = multer");
const chatUpload = evaluate(
  chatServer.slice(chatUploadStart, chatServer.indexOf("\nexport type", chatUploadStart)),
  "chatUpload.single('file')",
  { multer, chatUploadStorage: multer.memoryStorage() },
);

for (const screen of ["app/chat/[citizenId].tsx", "app/chat/group/[groupId].tsx"]) {
  const source = fs.readFileSync(path.join(root, "artifacts/mobile", screen), "utf8");
  const start = source.indexOf("  async function pickAttachment()");
  const pickerSource = source.slice(start, source.indexOf("  // ── Upload files", start))
    // Replace only the native module import; run the actual picker logic.
    .replace('const DocumentPicker = await import("expo-document-picker");', "");
  for (const size of [limit - 1, limit, limit + 1, 11 * 1024 * 1024, 12 * 1024 * 1024]) {
    test(`${screen} and chat multer agree for ${size} bytes`, async () => {
      const alerts = [];
      let chosen = [];
      const picker = evaluate(pickerSource, "pickAttachment", {
        pendingFiles: [],
        DocumentPicker: { getDocumentAsync: async () => ({
          canceled: false, assets: [{ uri: "file:///media", name: "file.txt", mimeType: "text/plain", size }],
        }) },
        setPendingFiles: (update) => { chosen = update(chosen); },
        Alert: { alert: (...args) => alerts.push(args) },
        t: { file_limit_title: "File Limit", file_limit_size: "File exceeds the 10 MB limit." },
      });
      await picker();
      const parsed = await parseUpload(size, chatUpload);
      const rejected = size > limit;
      assert.equal(Boolean(parsed.error), rejected);
      assert.equal(chosen.length, rejected ? 0 : 1);
      assert.deepEqual(alerts, rejected ? [["File Limit", "File exceeds the 10 MB limit."]] : []);
      if (rejected) assert.equal(parsed.error.code, "LIMIT_FILE_SIZE");
      else assert.equal(parsed.file.size, size);
    });
  }
}
