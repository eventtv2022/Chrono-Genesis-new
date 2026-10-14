const test = require("node:test");
const assert = require("node:assert/strict");

const today = new Date("2026-10-14T12:00:00.000Z");

test("age tier respects the 13- and 18-year boundaries", async () => {
  const {
    deriveAgeTier,
    canUseAdultKycFeature,
    canPublishUnmoderatedContent,
  } = await import("../artifacts/api-server/src/services/ageGateService.ts");

  assert.equal(deriveAgeTier("2013-10-15", today), "UNDER_13");
  assert.equal(deriveAgeTier("2013-10-14", today), "TEEN");
  assert.equal(deriveAgeTier("2008-10-15", today), "TEEN");
  assert.equal(deriveAgeTier("2008-10-14", today), "ADULT");

  assert.equal(canUseAdultKycFeature("2008-10-14", true, today), true);
  assert.equal(canUseAdultKycFeature("2008-10-14", false, today), false);
  assert.equal(canUseAdultKycFeature("2013-10-14", true, today), false);
  assert.equal(canPublishUnmoderatedContent("2013-10-14", today), false);
  assert.equal(canPublishUnmoderatedContent("2008-10-14", today), true);
});

test("invalid and future dates fail closed", async () => {
  const {
    deriveAgeTier,
    canUseAdultKycFeature,
    canPublishUnmoderatedContent,
  } = await import("../artifacts/api-server/src/services/ageGateService.ts");

  assert.equal(deriveAgeTier("2026-02-30", today), null);
  assert.equal(deriveAgeTier("2027-01-01", today), null);
  assert.equal(deriveAgeTier("", today), null);
  assert.equal(canUseAdultKycFeature("not-a-date", true, today), false);
  assert.equal(canPublishUnmoderatedContent(undefined, today), false);
});
