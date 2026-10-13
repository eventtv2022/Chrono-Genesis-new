const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");

const root = path.resolve(__dirname, "..");
const { transformSync } = createRequire(path.join(root, "artifacts/api-server/package.json"))("esbuild");
const source = fs.readFileSync(path.join(root, "artifacts/mobile/app/(tabs)/tv.tsx"), "utf8");
const handlers = source.slice(source.indexOf("  const handleRender ="), source.indexOf("  const openVideo ="));

function fixture(overrides = {}) {
  const calls = [];
  const state = {
    renderConfirmation: null,
    isRendering: false,
    isSaving: false,
    legalConsent: true,
    citizenAgeVerified: true,
    visualStyle: "nature",
    debouncedSeed: "A new world",
    seedText: "A new world",
    broadcastPolicy: "noise",
    hasSovereignLink: false,
    capsule: { visualStyle: "nature", seedText: "A new world", broadcastPolicy: "noise", hasSovereignLink: false },
    renderSubmissionRef: { current: false },
    setRenderConfirmation: value => { state.renderConfirmation = value; },
    onNeedAgeVerify: () => calls.push("age"),
    updateMutation: { mutateAsync: async () => calls.push("save") },
    renderMutation: { mutateAsync: async () => calls.push("render") },
    ...overrides,
  };
  const { code } = transformSync(`${handlers}\n globalThis.actions = { handleRender, confirmRender };`, { loader: "ts" });
  vm.runInNewContext(code, state);
  return { state, calls, ...state.actions };
}

test("opening confirmation snapshots the style and the same seed as the tile without rendering", () => {
  const f = fixture();
  f.handleRender();
  assert.equal(f.state.renderConfirmation.style, "nature");
  assert.equal(f.state.renderConfirmation.seed, f.state.debouncedSeed);
  assert.deepEqual(f.calls, []);
  f.state.setRenderConfirmation(null);
  assert.equal(f.state.renderConfirmation, null);
  assert.deepEqual(f.calls, []);
});

test("age, consent, saving and active-render gates prevent opening confirmation", () => {
  for (const overrides of [{ legalConsent: false }, { isRendering: true }, { isSaving: true }]) {
    const f = fixture(overrides);
    f.handleRender();
    assert.equal(f.state.renderConfirmation, null);
    assert.deepEqual(f.calls, []);
  }
  const f = fixture({ citizenAgeVerified: false });
  f.handleRender();
  assert.deepEqual(f.calls, ["age"]);
});

test("confirm starts exactly one render and closes the confirmation", async () => {
  const f = fixture();
  f.handleRender();
  await Promise.all([f.confirmRender(), f.confirmRender()]);
  assert.deepEqual(f.calls, ["render"]);
  assert.equal(f.state.renderConfirmation, null);
  assert.equal(f.state.renderSubmissionRef.current, false);
});

test("unsaved style is saved before rendering so it matches the preview", async () => {
  const f = fixture({ visualStyle: "cyberpunk" });
  f.handleRender();
  await f.confirmRender();
  assert.deepEqual(f.calls, ["save", "render"]);
});

test("a failed save never starts rendering and releases the submission lock", async () => {
  const f = fixture({
    visualStyle: "cyberpunk",
    updateMutation: { mutateAsync: async () => { throw new Error("save failed"); } },
  });
  f.handleRender();
  await f.confirmRender();
  assert.deepEqual(f.calls, []);
  assert.equal(f.state.renderSubmissionRef.current, false);
});

test("confirmation rechecks age verification and consent before committing", async () => {
  const f = fixture();
  f.handleRender();
  f.state.citizenAgeVerified = false;
  await f.confirmRender();
  assert.deepEqual(f.calls, ["age"]);
  const g = fixture();
  g.handleRender();
  g.state.legalConsent = false;
  await g.confirmRender();
  assert.deepEqual(g.calls, []);
});
