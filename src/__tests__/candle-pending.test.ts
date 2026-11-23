import { describe, expect, it } from "vitest";
import { isPendingCandle } from "../lib/chart-plugins/character-candles/candle-pending";

const BAR = 300;

describe("isPendingCandle", () => {
  it("is pending on the break candle while the retest is waiting", () => {
    const setups = [{ direction: "short" as const, breakTime: 1000 }];
    expect(isPendingCandle(setups, 1000, "bearish", BAR, 1600)).toBe(true);
  });
  it("is not pending once the retest has happened", () => {
    const setups = [{ direction: "short" as const, breakTime: 1000, retestTime: 1600 }];
    expect(isPendingCandle(setups, 1000, "bearish", BAR, 1900)).toBe(false);
  });
  it("is not pending for the opposite direction", () => {
    const setups = [{ direction: "short" as const, breakTime: 1000 }];
    expect(isPendingCandle(setups, 1000, "bullish", BAR, 1600)).toBe(false);
  });
  it("is not pending when the break is stale", () => {
    const setups = [{ direction: "long" as const, breakTime: 1000 }];
    expect(isPendingCandle(setups, 1000, "bullish", BAR, 1000 + 25 * BAR)).toBe(false);
  });
  it("only the newest broken setup can be pending", () => {
    const setups = [
      { direction: "long" as const, breakTime: 1000 },
      { direction: "long" as const, breakTime: 2000, retestTime: 2300 },
    ];
    expect(isPendingCandle(setups, 1000, "bullish", BAR, 2600)).toBe(false);
  });
  it("is not pending on an unrelated candle", () => {
    const setups = [{ direction: "long" as const, breakTime: 1000 }];
    expect(isPendingCandle(setups, 3000, "bullish", BAR, 3100)).toBe(false);
  });
});
