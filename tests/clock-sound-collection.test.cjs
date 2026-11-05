const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const clockPage = fs.readFileSync(path.join(root, "artifacts/web/src/pages/Clock.tsx"), "utf8");

test("all clock sound collection tracks have a matching public audio file", () => {
  const files = [...clockPage.matchAll(/file:\s*"([^"]+\.mp3)"/g)].map((match) => match[1]);
  assert.equal(files.length, 17);
  assert.equal(new Set(files).size, files.length);
  for (const file of files) {
    const audioPath = path.join(root, "artifacts/web/public/audio/clock-collection", file);
    assert.ok(fs.existsSync(audioPath), `Missing clock collection track: ${file}`);
    assert.ok(fs.statSync(audioPath).size > 0, `Empty clock collection track: ${file}`);
  }
  assert.match(clockPage, /Коллекция звуков/);
  assert.match(clockPage, /controls/);
});
