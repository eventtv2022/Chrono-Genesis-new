const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");

const root = path.resolve(__dirname, "..");
const { transformSync } = createRequire(path.join(root, "artifacts/api-server/package.json"))("esbuild");
const timeline = fs.readFileSync(path.join(root, "artifacts/web/src/pages/Timeline.tsx"), "utf8");

function evaluate(source, expression, globals = {}) {
  const { code } = transformSync(`${source}\n${expression}`, { loader: "ts", target: "es2022" });
  return vm.runInNewContext(code, globals);
}

function selectionFixture() {
  const state = {
    year: null,
    month: null,
    selectedDay: null,
    selectedHour: null,
    stoppedCoord: null,
    confirmCoord: "stale-confirmation",
    anchorResult: { ok: false, msg: "stale result" },
    stopTimeNotice: "",
  };
  const reservationCalls = [];
  const networkCalls = [];
  const citizenRefreshes = [];
  const globals = {
    lang: "en",
    useCallback: (callback) => callback,
    doAnchor: (...args) => reservationCalls.push(args),
    fetch: (...args) => networkCalls.push(args),
    refreshCitizen: () => citizenRefreshes.push("refresh"),
    citizenBalance: 42.5,
  };
  for (const key of Object.keys(state)) {
    globals[`set${key[0].toUpperCase()}${key.slice(1)}`] = (value) => { state[key] = value; };
  }

  const callbackStart = timeline.indexOf("  const selectTimelineTimestamp = useCallback(");
  const callbackEnd = timeline.indexOf("\n\n  useEffect(() => {", callbackStart);
  assert.notEqual(callbackStart, -1, "Stop Time selection callback exists");
  assert.notEqual(callbackEnd, -1, "Stop Time selection callback section ends");

  const helperSource = timeline.match(/function pad2\(n: number\)[\s\S]*?function padYear\(n: number\) \{[^\n]*\}/)?.[0];
  assert.ok(helperSource, "timeline coordinate formatting helpers exist");
  const callbackSource = timeline.slice(callbackStart, callbackEnd);
  const selectTimelineTimestamp = evaluate(
    `${helperSource}\n${callbackSource}`,
    "selectTimelineTimestamp",
    globals,
  );
  return { state, globals, selectTimelineTimestamp, reservationCalls, networkCalls, citizenRefreshes };
}

test("web Stop Time selects the current local date, hour, and minute", () => {
  const fixture = selectionFixture();
  const now = new Date(2026, 9, 18, 23, 57, 43, 812);

  fixture.selectTimelineTimestamp(now);

  assert.equal(fixture.state.year, now.getFullYear());
  assert.equal(fixture.state.month, now.getMonth() + 1);
  assert.equal(fixture.state.selectedDay, now.getDate());
  assert.equal(fixture.state.selectedHour, now.getHours());
  assert.equal(fixture.state.stoppedCoord, "202610182357");
  assert.match(timeline, /onClick=\{\(\) => selectTimelineTimestamp\(new Date\(\)\)\}[\s\S]*?data-testid="button-timeline-stop-time"/);
  assert.match(timeline, /const isStoppedTime = stoppedCoord === coord;/);
  assert.match(timeline, /\$\{isStoppedTime \? "ring-2 ring-cyan-300 border-cyan-300" : ""\}/);
});

test("the selected current minute's panel scrolls into view", () => {
  const effectStart = timeline.indexOf("  useEffect(() => {\n    if (!stoppedCoord) return;");
  const dependencyText = "\n  }, [stoppedCoord]);";
  const effectEnd = timeline.indexOf(dependencyText, effectStart);
  assert.notEqual(effectStart, -1, "selected-minute scroll effect exists");
  assert.notEqual(effectEnd, -1, "selected-minute scroll effect has stoppedCoord dependency");

  let scheduledFrame;
  let scrollRequest;
  let cleanup;
  const effectSource = timeline.slice(effectStart, effectEnd + dependencyText.length);
  evaluate(effectSource, "", {
    stoppedCoord: "202610182357",
    stoppedPanelRef: {
      current: {
        scrollIntoView: (options) => { scrollRequest = options; },
      },
    },
    window: {
      requestAnimationFrame: (callback) => { scheduledFrame = callback; return 1; },
      cancelAnimationFrame: () => {},
    },
    useEffect: (callback) => { cleanup = callback(); },
  });

  assert.equal(typeof scheduledFrame, "function");
  scheduledFrame();
  assert.deepEqual(JSON.parse(JSON.stringify(scrollRequest)), { behavior: "smooth", block: "center" });
  assert.match(timeline, /<div ref=\{stoppedPanelRef\}>/);
  if (typeof cleanup === "function") cleanup();
});

test("Stop Time does not reserve a minute; a separate available-minute choice and confirmation are required", () => {
  const fixture = selectionFixture();
  const balanceBefore = fixture.globals.citizenBalance;
  const coord = "202610182357";

  fixture.selectTimelineTimestamp(new Date(2026, 9, 18, 23, 57));

  assert.equal(fixture.state.confirmCoord, null);
  assert.equal(fixture.state.anchorResult, null);
  assert.deepEqual(fixture.reservationCalls, []);
  assert.deepEqual(fixture.networkCalls, []);
  assert.deepEqual(fixture.citizenRefreshes, []);
  assert.equal(fixture.globals.citizenBalance, balanceBefore);

  const minuteHandlerMatch = timeline.match(
    /onClick=\{\(\) => \{\s*if \(owner \|\| !citizen\) return;\s*setConfirmCoord\(isPending \? null : coord\);\s*setAnchorResult\(null\);\s*\}\}/,
  );
  assert.ok(minuteHandlerMatch, "minute selection remains separate from booking");
  const minuteHandlerBody = minuteHandlerMatch[0]
    .replace(/^onClick=\{\(\) => \{/, "")
    .replace(/\}\}$/, "");
  const chooseAvailableMinute = evaluate(
    `const chooseAvailableMinute = () => {${minuteHandlerBody}}`,
    "chooseAvailableMinute",
    {
      owner: undefined,
      citizen: { id: 7 },
      isPending: false,
      coord,
      setConfirmCoord: (value) => { fixture.state.confirmCoord = value; },
      setAnchorResult: (value) => { fixture.state.anchorResult = value; },
    },
  );
  chooseAvailableMinute();
  assert.equal(fixture.state.confirmCoord, coord);
  assert.deepEqual(fixture.reservationCalls, []);
  assert.deepEqual(fixture.networkCalls, []);
  assert.equal(fixture.globals.citizenBalance, balanceBefore);

  assert.match(timeline, /onClick=\{\(\) => doAnchor\(confirmCoord\)\}/);
  const confirmReservation = evaluate(
    "const confirmReservation = () => doAnchor(confirmCoord); confirmReservation",
    "",
    { doAnchor: (...args) => fixture.reservationCalls.push(args), confirmCoord: fixture.state.confirmCoord },
  );
  confirmReservation();
  assert.deepEqual(fixture.reservationCalls, [[coord]]);
  assert.equal(fixture.globals.citizenBalance, balanceBefore);
});
