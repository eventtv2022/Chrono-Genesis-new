const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("citizen registry is on the dashboard, not a primary navigation item", () => {
  const layout = read("artifacts/web/src/components/Layout.tsx");
  const home = read("artifacts/web/src/pages/Home.tsx");
  const app = read("artifacts/web/src/App.tsx");
  assert.doesNotMatch(layout, /href:\s*"\/citizens"/);
  assert.match(home, /<CitizenTimeRegistry\s*\/>/);
  assert.match(app, /<Route path="\/citizens" component=\{Home\}\s*\/>/);
});

test("passport numbers open a time profile without exposing a citizen balance", () => {
  const component = read("artifacts/web/src/components/CitizenTimeRegistry.tsx");
  const routes = read("artifacts/api-server/src/routes/citizens.ts");
  assert.match(component, /\/time-profile/);
  assert.match(component, /TimeNation tenure|Стаж в TimeNation/);
  assert.match(component, /Next anniversary|До годовщины/);

  const start = routes.indexOf('router.get("/citizens/number/:num/time-profile"');
  assert.notEqual(start, -1);
  const end = routes.indexOf("\n});", start);
  const handler = routes.slice(start, end);
  assert.match(handler, /createdAt:\s*citizensTable\.createdAt/);
  assert.match(handler, /availableAt:\s*citizensTable\.availableAt/);
  assert.match(handler, /rank:\s*citizensTable\.rank/);
  assert.match(handler, /meritScore:\s*citizensTable\.meritScore/);
  assert.match(handler, /eq\(auctionsTable\.assetType,\s*"DARMIN_CURRENCY"\)/);
  assert.match(handler, /eq\(auctionsTable\.status,\s*"active"\)/);
  assert.match(handler, /ne\(chronopediaEventsTable\.status,\s*"deleted"\)/);
  assert.match(handler, /activeDarminAuctions/);
  assert.match(handler, /chronopediaDiscussions/);
  assert.doesNotMatch(handler, /balanceMinutes|citizensTable\.name|citizensTable\.phone/);

  assert.match(component, /Уровень мерита/);
  assert.match(component, /Открытые аукционы Дармин/);
  assert.match(component, /Обсуждения в Хронопедии/);
});
