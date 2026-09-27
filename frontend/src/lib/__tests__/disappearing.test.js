import { describe, expect, it } from "vitest";
import { DISAPPEARING_OPTIONS, formatDisappearingDuration } from "../disappearing.js";

describe("disappearing message labels", () => {
  it("offers off / 24h / 7d options", () => {
    expect(DISAPPEARING_OPTIONS.map((o) => o.value)).toEqual([0, 86400, 604800]);
    expect(DISAPPEARING_OPTIONS.every((o) => o.label && o.hint)).toBe(true);
  });

  it("formats durations for the UI", () => {
    expect(formatDisappearingDuration(0)).toBe("Off");
    expect(formatDisappearingDuration(86400)).toBe("24 hours");
    expect(formatDisappearingDuration(604800)).toBe("7 days");
    expect(formatDisappearingDuration(3600)).toBe("Off");
  });
});
