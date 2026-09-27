import { describe, expect, it } from "vitest";
import { gradeCallQuality } from "../callQuality.js";

describe("gradeCallQuality", () => {
  it("grades good connections", () => {
    expect(gradeCallQuality({ rtt: 0.08, lossRate: 0, jitter: 0.005 })).toBe("good");
    expect(gradeCallQuality({})).toBe("good"); // no stats yet
  });

  it("grades fair connections", () => {
    expect(gradeCallQuality({ rtt: 0.3, lossRate: 0, jitter: 0 })).toBe("fair");
    expect(gradeCallQuality({ rtt: 0, lossRate: 0.05, jitter: 0 })).toBe("fair");
    expect(gradeCallQuality({ rtt: 0, lossRate: 0, jitter: 0.04 })).toBe("fair");
  });

  it("grades poor connections", () => {
    expect(gradeCallQuality({ rtt: 0.6, lossRate: 0, jitter: 0 })).toBe("poor");
    expect(gradeCallQuality({ rtt: 0, lossRate: 0.2, jitter: 0 })).toBe("poor");
    expect(gradeCallQuality({ rtt: 0, lossRate: 0, jitter: 0.1 })).toBe("poor");
  });

  it("treats boundary values as good", () => {
    expect(gradeCallQuality({ rtt: 0.2, lossRate: 0.03, jitter: 0.03 })).toBe("good");
  });
});
