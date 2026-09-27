import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ALLOWED_DISAPPEARING_DURATIONS,
  expiryDateFor,
  isValidDisappearingDuration,
  notExpiredFilter,
} from "../src/lib/disappearing.js";
import { dmSettingKey } from "../src/lib/disappearing.js";

describe("disappearing message helpers", () => {
  it("allows only off / 24h / 7d durations", () => {
    assert.deepEqual(ALLOWED_DISAPPEARING_DURATIONS, [0, 86400, 604800]);
    assert.equal(isValidDisappearingDuration(0), true);
    assert.equal(isValidDisappearingDuration(86400), true);
    assert.equal(isValidDisappearingDuration(604800), true);
    assert.equal(isValidDisappearingDuration(3600), false);
    assert.equal(isValidDisappearingDuration(-1), false);
    assert.equal(isValidDisappearingDuration("banana"), false);
  });

  it("expiryDateFor returns null when the timer is off", () => {
    assert.equal(expiryDateFor(0), null);
    assert.equal(expiryDateFor(null), null);
    assert.equal(expiryDateFor(undefined), null);
  });

  it("expiryDateFor returns a future date offset by the duration", () => {
    const before = Date.now();
    const expiry = expiryDateFor(86400);
    assert.ok(expiry instanceof Date);
    const delta = expiry.getTime() - before;
    // 24h in ms, with a small tolerance for execution time.
    assert.ok(delta > 86400 * 1000 - 1000 && delta <= 86400 * 1000 + 1000);
  });

  it("notExpiredFilter matches non-expired docs and excludes expired ones", () => {
    const now = new Date("2026-09-27T12:00:00Z");
    const filter = notExpiredFilter(now);
    assert.deepEqual(filter, {
      $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
    });
    // Simulate Mongo's matching for the three document shapes.
    const matches = (doc) =>
      filter.$or.some((clause) =>
        Object.entries(clause).every(([key, cond]) => {
          if (cond === null) return doc[key] === null || doc[key] === undefined;
          return doc[key] > cond.$gt;
        })
      );
    assert.equal(matches({ expiresAt: null }), true);
    assert.equal(matches({ expiresAt: new Date("2026-09-28T12:00:00Z") }), true);
    assert.equal(matches({ expiresAt: new Date("2026-09-26T12:00:00Z") }), false);
  });

  it("dmSettingKey is canonical regardless of user order", () => {
    const a = "68d8aaaabbbbccccddddeeee";
    const b = "68d8aaaabbbbccccddddffff";
    assert.equal(dmSettingKey(a, b), dmSettingKey(b, a));
    assert.ok(dmSettingKey(a, b).includes(a));
    assert.ok(dmSettingKey(a, b).includes(b));
  });
});
