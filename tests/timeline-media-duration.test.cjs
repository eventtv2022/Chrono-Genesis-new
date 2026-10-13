const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { pathToFileURL } = require("node:url");
const os = require("node:os");

const root = path.resolve(__dirname, "..");
const { transformSync } = createRequire(path.join(root, "artifacts/api-server/package.json"))("esbuild");
const server = fs.readFileSync(path.join(root, "artifacts/api-server/src/routes/timeline.ts"), "utf8");
const mobile = fs.readFileSync(path.join(root, "artifacts/mobile/app/(tabs)/timeline.tsx"), "utf8");

// Execute the actual helper and handlers with controlled IO; no database or secrets needed.
function evaluate(source, expression, globals = {}) {
  const { code } = transformSync(source, { loader: "ts", target: "es2022" });
  return vm.runInNewContext(`${code}\n${expression}`, globals);
}

const probeSource = server.slice(server.indexOf("async function getFileMediaInfo"), server.indexOf('import { db }'));
const handlerStart = server.indexOf("async (req, res): Promise<void> => {", server.indexOf('"/timeline/capsule/upload"'));
const handlerSource = `const handler = ${server.slice(handlerStart, server.indexOf("\n);", handlerStart)).trim().replace(/,$/, "")};`;
const pickerStart = mobile.indexOf("  const pickFile = async");
const pickerSource = mobile.slice(pickerStart, mobile.indexOf("  const uploadCapsuleMedia", pickerStart));

async function uploadWithInspection(inspect, filePath, mime) {
  const removed = [];
  const query = {
    select() { return this; }, from() { return this; }, where() { return this; },
    limit() { return Promise.resolve([{ id: 1 }]); },
  };
  const handler = evaluate(handlerSource, "handler", {
    db: query, timelineAnchorsTable: {}, eq: () => null, and: () => null,
    fs: { unlinkSync: (file) => removed.push(file) },
    MAX_MEDIA_DURATION_SEC: 60, getFileMediaInfo: inspect,
  });
  let status;
  let body;
  await handler({
    file: { path: filePath, filename: "test", mimetype: mime },
    body: { timelineCoord: "202601010000" }, citizen: { id: 1 },
  }, {
    status(code) { status = code; return this; },
    json(data) { body = data; return this; },
  });
  return { status, body, removed };
}

for (const value of ["30", "60", "60.1", undefined, "N/A", "NaN", "Infinity", "-1", "0"]) {
  test(`ffprobe duration ${value}`, async () => {
    const probe = evaluate(probeSource, "getFileMediaInfo", {
      fileTypeFromFile: async () => ({ mime: "audio/mpeg" }),
      execFileAsync: async (command, args, options) => {
        assert.equal(command, "ffprobe");
        assert.equal(args.at(-1), "/tmp/media");
        assert.equal(options.timeout, 10_000);
        return { stdout: JSON.stringify({ format: { duration: value } }) };
      },
    });
    const expected = Number(value);
    const result = await probe("/tmp/media", "application/octet-stream");
    assert.equal(result.mediaType, "audio");
    assert.equal(result.duration, Number.isFinite(expected) && expected > 0 ? expected : null);
  });
}

for (const failure of ["invalid JSON", "process error"]) {
  test(`ffprobe ${failure} returns null`, async () => {
    const probe = evaluate(probeSource, "getFileMediaInfo", {
      fileTypeFromFile: async () => ({ mime: "video/mp4" }),
      execFileAsync: async () => {
        if (failure === "process error") throw new Error("ffprobe unavailable or timed out");
        return { stdout: "not json" };
      },
    });
    const result = await probe("/tmp/media", "application/octet-stream");
    assert.equal(result.mediaType, "video");
    assert.equal(result.duration, null);
  });
}

test("stream inspection recognizes media without a known signature and ignores album artwork", async () => {
  for (const [streams, expected] of [
    [[{ codec_type: "audio" }], "audio"],
    [[{ codec_type: "video" }], "video"],
    [[{ codec_type: "video", disposition: { attached_pic: 1 } }, { codec_type: "audio" }], "audio"],
  ]) {
    const probe = evaluate(probeSource, "getFileMediaInfo", {
      fileTypeFromFile: async () => undefined,
      execFileAsync: async () => ({ stdout: JSON.stringify({ streams, format: { duration: "61" } }) }),
    });
    const result = await uploadWithInspection(probe, "/tmp/media", "application/octet-stream");
    assert.equal(result.status, 400);
    assert.deepEqual(result.removed, ["/tmp/media"]);
    assert.equal((await probe("/tmp/media", "image/png")).mediaType, expected);
  }
});

test("recognized media fails closed when ffprobe fails despite a document MIME", async () => {
  for (const mime of ["audio/mpeg", "video/mp4"]) {
    const probe = evaluate(probeSource, "getFileMediaInfo", {
      fileTypeFromFile: async () => ({ mime }),
      execFileAsync: async () => { throw new Error("Probe timed out"); },
    });
    const result = await uploadWithInspection(probe, "/tmp/media", "application/pdf");
    assert.equal(result.status, 400);
    assert.equal(result.body.code, "MEDIA_DURATION_UNDETECTABLE");
    assert.deepEqual(result.removed, ["/tmp/media"]);
  }
});

test("signature inspection failures reject and clean up the upload", async () => {
  const probe = evaluate(probeSource, "getFileMediaInfo", {
    fileTypeFromFile: async () => { throw new Error("Truncated or unreadable file"); },
  });
  const result = await uploadWithInspection(probe, "/tmp/media", "application/octet-stream");
  assert.equal(result.status, 400);
  assert.equal(result.body.code, "MEDIA_TYPE_UNDETECTABLE");
  assert.deepEqual(result.removed, ["/tmp/media"]);
});

test("real bytes and ffprobe enforce the limit with spoofed MIME and no file extension", async () => {
  const requireFromApi = createRequire(path.join(root, "artifacts/api-server/package.json"));
  const { fileTypeFromFile } = await import(pathToFileURL(requireFromApi.resolve("file-type")).href);
  const execFileAsync = promisify(execFile);
  const probe = evaluate(probeSource, "getFileMediaInfo", { fileTypeFromFile, execFileAsync });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "capsule-content-test-"));
  try {
    for (const kind of ["audio", "video"]) {
      for (const seconds of [60, 61]) {
        const file = path.join(dir, `${kind}-${seconds}`);
        const args = kind === "audio"
          ? ["-f", "lavfi", "-i", "anullsrc=r=8000:cl=mono", "-c:a", "pcm_s16le", "-f", "wav"]
          : ["-f", "lavfi", "-i", "color=s=16x16:r=1", "-c:v", "mpeg4", "-f", "mp4"];
        await execFileAsync("ffmpeg", ["-v", "error", ...args, "-t", String(seconds), file], { timeout: 10_000 });
        for (const mime of ["application/octet-stream", "application/pdf", "image/png"]) {
          const result = await uploadWithInspection(probe, file, mime);
          assert.equal(result.status, seconds > 60 ? 400 : 201, `${kind} ${seconds}s declared ${mime}`);
          assert.deepEqual(result.removed, seconds > 60 ? [file] : []);
          if (seconds <= 60) assert.equal(result.body.mediaType, kind);
        }
      }
    }
    const image = path.join(dir, "image");
    await execFileAsync("ffmpeg", [
      "-v", "error", "-f", "lavfi", "-i", "color=s=16x16", "-frames:v", "1",
      "-c:v", "png", "-f", "image2", image,
    ], { timeout: 10_000 });
    const pdf = path.join(dir, "pdf");
    fs.writeFileSync(pdf, "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n");
    const text = path.join(dir, "text");
    fs.writeFileSync(text, "A genuine plain text document.");
    for (const [file, expected] of [[image, "image"], [pdf, "document"], [text, "document"]]) {
      for (const mime of ["application/octet-stream", "image/png"]) {
        const result = await uploadWithInspection(probe, file, mime);
        assert.equal(result.status, 201);
        assert.equal(result.body.mediaType, expected);
        assert.deepEqual(result.removed, []);
      }
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

for (const mime of ["audio/mpeg", "video/mp4", "image/png", "application/pdf"]) {
  for (const clientMime of new Set([mime, "application/octet-stream", "application/pdf", "image/png"])) {
    for (const duration of [null, 30, 60, 61]) {
      test(`upload actual ${mime}, declared ${clientMime}, duration ${duration}`, async () => {
        let probes = 0;
        const inspect = evaluate(probeSource, "getFileMediaInfo", {
          fileTypeFromFile: async () => ({ mime }),
          execFileAsync: async () => {
            probes++;
            if (mime === "application/pdf") throw new Error("Not a media file");
            return { stdout: JSON.stringify({
              format: { duration },
              streams: [{ codec_type: mime.startsWith("audio/") ? "audio" : "video" }],
            }) };
          },
        });
        const { status, body, removed } = await uploadWithInspection(inspect, "/tmp/upload", clientMime);
        const timedMedia = mime.startsWith("audio/") || mime.startsWith("video/");
        const rejected = timedMedia && (duration === null || duration > 60);
        assert.equal(status, rejected ? 400 : 201);
        assert.equal(probes, mime.startsWith("image/") ? 0 : 1);
        assert.deepEqual(removed, rejected ? ["/tmp/upload"] : []);
        if (rejected) {
          assert.ok(body.error);
          assert.equal(body.url, undefined);
          if (duration === null) assert.equal(body.code, "MEDIA_DURATION_UNDETECTABLE");
        } else {
          assert.equal(body.url, "/api/uploads/capsules/test");
          assert.equal(body.mediaType, mime === "application/pdf" ? "document" : mime.split("/")[0]);
        }
      });
    }
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
