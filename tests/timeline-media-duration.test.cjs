const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");

const root = path.resolve(__dirname, "..");
const { transformSync } = createRequire(path.join(root, "artifacts/api-server/package.json"))("esbuild");
const server = fs.readFileSync(path.join(root, "artifacts/api-server/src/routes/timeline.ts"), "utf8");
const mobile = fs.readFileSync(path.join(root, "artifacts/mobile/app/(tabs)/timeline.tsx"), "utf8");

// Execute the actual helper and handlers with controlled IO; no database or secrets needed.
function evaluate(source, expression, globals = {}) {
  const { code } = transformSync(source, { loader: "ts", target: "es2022" });
  return vm.runInNewContext(`${code}\n${expression}`, globals);
}

const probeSource = server.slice(server.indexOf("async function getFileDurationSeconds"), server.indexOf('import { db }'));
const handlerStart = server.indexOf("async (req, res): Promise<void> => {", server.indexOf('"/timeline/capsule/upload"'));
const handlerSource = `const handler = ${server.slice(handlerStart, server.indexOf("\n);", handlerStart)).trim().replace(/,$/, "")};`;
const pickerStart = mobile.indexOf("  const pickFile = async");
const pickerSource = mobile.slice(pickerStart, mobile.indexOf("  const uploadCapsuleMedia", pickerStart));

for (const value of ["30", "60", "60.1", undefined, "N/A", "NaN", "Infinity", "-1", "0"]) {
  test(`ffprobe duration ${value}`, async () => {
    const probe = evaluate(probeSource, "getFileDurationSeconds", {
      execFileAsync: async (command, args, options) => {
        assert.equal(command, "ffprobe");
        assert.equal(args.at(-1), "/tmp/media");
        assert.equal(options.timeout, 10_000);
        return { stdout: JSON.stringify({ format: { duration: value } }) };
      },
    });
    const expected = Number(value);
    assert.equal(await probe("/tmp/media"), Number.isFinite(expected) && expected > 0 ? expected : null);
  });
}

for (const failure of ["invalid JSON", "process error"]) {
  test(`ffprobe ${failure} returns null`, async () => {
    const probe = evaluate(probeSource, "getFileDurationSeconds", {
      execFileAsync: async () => {
        if (failure === "process error") throw new Error("ffprobe unavailable or timed out");
        return { stdout: "not json" };
      },
    });
    assert.equal(await probe("/tmp/media"), null);
  });
}

for (const mime of ["audio/mpeg", "video/mp4", "image/png", "application/pdf"]) {
  for (const duration of [null, 30, 60, 61]) {
    test(`upload ${mime}, duration ${duration}`, async () => {
      let probes = 0;
      const removed = [];
      const query = {
        select() { return this; }, from() { return this; }, where() { return this; },
        limit() { return Promise.resolve([{ id: 1 }]); },
      };
      const handler = evaluate(handlerSource, "handler", {
        db: query, timelineAnchorsTable: {}, eq: () => null, and: () => null,
        fs: { unlinkSync: (file) => removed.push(file) },
        MAX_MEDIA_DURATION_SEC: 60,
        getFileDurationSeconds: async () => { probes++; return duration; },
      });
      let status;
      let body;
      const res = {
        status(code) { status = code; return this; },
        json(data) { body = data; return this; },
      };
      await handler({
        file: { path: "/tmp/upload", filename: "test", mimetype: mime },
        body: { timelineCoord: "202601010000" }, citizen: { id: 1 },
      }, res);
      const timedMedia = mime.startsWith("audio/") || mime.startsWith("video/");
      const rejected = timedMedia && (duration === null || duration > 60);
      assert.equal(status, rejected ? 400 : 201);
      assert.equal(probes, timedMedia ? 1 : 0);
      assert.deepEqual(removed, rejected ? ["/tmp/upload"] : []);
      if (rejected) {
        assert.ok(body.error);
        assert.equal(body.url, undefined);
        if (duration === null) assert.equal(body.code, "MEDIA_DURATION_UNDETECTABLE");
      } else {
        assert.equal(body.url, "/api/uploads/capsules/test");
      }
    });
  }
}

for (const mime of ["audio/mpeg", "video/mp4", "image/png", "application/pdf"]) {
  for (const duration of [null, 30, 60, 61]) {
    test(`picker ${mime}, duration ${duration}`, async () => {
      const chosen = [];
      const alerts = [];
      const loading = [];
      let probes = 0;
      const picker = evaluate(pickerSource, "pickFile", {
        console: { log() {}, error() {} },
        DocumentPicker: { getDocumentAsync: async () => ({
          canceled: false, assets: [{ uri: "file:///media", name: "media", mimeType: mime, size: 100 }],
        }) },
        setIsPickingMedia: (state) => loading.push(state),
        setCapsuleMedia: (media) => chosen.push(media),
        getMediaDurationSeconds: async () => { probes++; return duration; },
        Alert: { alert: (...args) => alerts.push(args) },
        t: { file_limit_title: "Limit", file_limit_duration: "Too long" },
      });
      await picker();
      const timedMedia = mime.startsWith("audio/") || mime.startsWith("video/");
      const rejected = timedMedia && duration > 60;
      assert.deepEqual(loading, [true, false]);
      assert.equal(probes, timedMedia ? 1 : 0);
      assert.equal(chosen.length, rejected ? 0 : 1);
      assert.equal(alerts.length, rejected ? 1 : 0);
      if (!rejected) assert.equal(chosen[0].durationUnverified, timedMedia && duration === null);
    });
  }
}

test("the warning is rendered with the selected attachment and includes the requested Russian text", () => {
  assert.match(mobile, /capsuleMedia\.durationUnverified && \(/);
  assert.match(mobile, /\{MEDIA_DURATION_WARNING\[lang\]\}/);
  const translations = fs.readFileSync(path.join(root, "artifacts/mobile/lib/mediaDurationWarning.ts"), "utf8");
  assert.ok(translations.includes("Не удалось проверить длительность — файл будет отклонён сервером, если он длиннее 60 секунд"));
});
