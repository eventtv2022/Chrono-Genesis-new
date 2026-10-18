const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");

const root = path.resolve(__dirname, "..");
const { transformSync } = createRequire(path.join(root, "artifacts/api-server/package.json"))("esbuild");
const mobile = fs.readFileSync(path.join(root, "artifacts/mobile/app/(tabs)/timeline.tsx"), "utf8");

function evaluate(source, expression, globals) {
  const { code } = transformSync(`${source}\n${expression}`, { loader: "ts", target: "es2022" });
  return vm.runInNewContext(code, globals);
}

function selectionFixture() {
  const state = {
    selectedCentury: null,
    selectedYear: null,
    selectedMonth: null,
    selectedDay: null,
    selectedHour: null,
    stoppedTimeCoord: null,
    confirmCoord: "stale-confirmation",
    anchorResult: { ok: false, msg: "stale result" },
    zoom: null,
    stopTimeNotice: "",
  };
  const reservationCalls = [];
  const networkCalls = [];
  const setters = [
    "selectedCentury",
    "selectedYear",
    "selectedMonth",
    "selectedDay",
    "selectedHour",
    "stoppedTimeCoord",
    "confirmCoord",
    "anchorResult",
    "zoom",
    "stopTimeNotice",
  ];
  const globals = {
    lang: "en",
    useCallback: (callback) => callback,
    doAnchor: (...args) => reservationCalls.push(args),
    fetch: (...args) => networkCalls.push(args),
    citizenBalance: 42.5,
  };
  for (const key of setters) globals[`set${key[0].toUpperCase()}${key.slice(1)}`] = (value) => { state[key] = value; };

  const helperStart = mobile.indexOf("function padYear(");
  const helperEnd = mobile.indexOf("function getMonthNames(", helperStart);
  const callbackStart = mobile.indexOf("  const selectTimelineTimestamp = useCallback(");
  const callbackEnd = mobile.indexOf("\n\n  const styles = getStyles(colors);", callbackStart);
  assert.notEqual(helperStart, -1, "timeline coordinate helpers exist");
  assert.notEqual(helperEnd, -1, "timeline coordinate helper section ends");
  assert.notEqual(callbackStart, -1, "Stop Time selection callback exists");
  assert.notEqual(callbackEnd, -1, "Stop Time callback section ends");

  const callbackSource = mobile.slice(callbackStart, callbackEnd);
  const selectTimelineTimestamp = evaluate(
    `${mobile.slice(helperStart, helperEnd)}\n${callbackSource}`,
    "selectTimelineTimestamp",
    globals,
  );
  return { state, globals, selectTimelineTimestamp, reservationCalls, networkCalls };
}

test("Stop Time selects every field from the current local minute", () => {
  const fixture = selectionFixture();
  const now = new Date(2026, 9, 18, 23, 57, 43, 812);

  fixture.selectTimelineTimestamp(now);

  assert.equal(fixture.state.selectedYear, now.getFullYear());
  assert.equal(fixture.state.selectedMonth, now.getMonth() + 1);
  assert.equal(fixture.state.selectedDay, now.getDate());
  assert.equal(fixture.state.selectedHour, now.getHours());
  assert.equal(fixture.state.stoppedTimeCoord, "202610182357");
  assert.equal(fixture.state.zoom, 5);
  assert.match(mobile, /testID="button-timeline-stop-time"[\s\S]*?onPress=\{\(\) => selectTimelineTimestamp\(new Date\(\)\)\}/);
});

test("the stopped minute is highlighted and scrolled into view at a narrow width", () => {
  assert.match(mobile, /const isStoppedTime = stoppedTimeCoord === coord;/);
  assert.match(mobile, /isStoppedTime && \{ borderColor: colors\.primary, borderWidth: 3 \}/);

  const effectStart = mobile.indexOf("  useEffect(() => {\n    if (zoom !== 5 || !stoppedTimeCoord) return;");
  const effectEnd = mobile.indexOf("\n  }, [zoom, stoppedTimeCoord, screenWidth]);", effectStart);
  assert.notEqual(effectStart, -1, "minute-scroll effect exists");
  assert.notEqual(effectEnd, -1, "minute-scroll effect dependencies exist");

  let scheduledFrame;
  let scrollRequest;
  let cleanup;
  const effectSource = mobile.slice(effectStart, effectEnd + "\n  }, [zoom, stoppedTimeCoord, screenWidth]);".length);
  evaluate(effectSource, "", {
    zoom: 5,
    stoppedTimeCoord: "202610182357",
    screenWidth: 320,
    minuteScrollRef: { current: { scrollTo: (request) => { scrollRequest = request; } } },
    requestAnimationFrame: (callback) => { scheduledFrame = callback; return 1; },
    cancelAnimationFrame: () => {},
    useEffect: (callback) => { cleanup = callback(); },
  });

  assert.equal(typeof scheduledFrame, "function");
  scheduledFrame();
  const cellSize = Math.max(40, (320 - 24) / 7);
  const selectedRow = Math.floor(57 / 7);
  const expectedScrollY = (selectedRow - 1) * cellSize;
  assert.equal(scrollRequest.y, expectedScrollY);
  assert.equal(scrollRequest.animated, true);
  const selectedRowTopAfterScroll = selectedRow * cellSize - scrollRequest.y;
  assert.ok(selectedRowTopAfterScroll >= 0 && selectedRowTopAfterScroll < cellSize);
  assert.ok(selectedRowTopAfterScroll + cellSize < 720);
  if (typeof cleanup === "function") cleanup();
});

test("Stop Time clears reservation confirmation without reserving or changing balance", () => {
  const fixture = selectionFixture();
  const balanceBefore = fixture.globals.citizenBalance;

  fixture.selectTimelineTimestamp(new Date(2026, 9, 18, 23, 57));

  assert.equal(fixture.state.confirmCoord, null);
  assert.equal(fixture.state.anchorResult, null);
  assert.deepEqual(fixture.reservationCalls, []);
  assert.deepEqual(fixture.networkCalls, []);
  assert.equal(fixture.globals.citizenBalance, balanceBefore);
  assert.match(mobile, /testID="button-timeline-stop-time"[\s\S]*?onPress=\{\(\) => selectTimelineTimestamp\(new Date\(\)\)\}/);
});
