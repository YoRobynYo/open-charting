import { describe, expect, it } from "vitest";
import { actionForCandle } from "../lib/chart-plugins/character-candles/candle-action.ts";

const BAR = 300;
const long = { direction: "long" as const, sweepTime: 1000, breakTime: 2000, retestTime: 3000 };

describe("actionForCandle", () => {
  it("says Hold on the retest candle of a same-direction setup", () => {
    expect(actionForCandle([long], 3000, "bullish", BAR)).toBe("Hold");
  });

  it("says Break and Sweep on their own candles", () => {
    expect(actionForCandle([long], 2000, "bullish", BAR)).toBe("Break");
    expect(actionForCandle([long], 1000, "bullish", BAR)).toBe("Sweep");
  });

  it("allows one candle either side but no more", () => {
    expect(actionForCandle([long], 3000 + BAR, "bullish", BAR)).toBe("Hold");
    expect(actionForCandle([long], 3000 - BAR, "bullish", BAR)).toBe("Hold");
    expect(actionForCandle([long], 3000 + BAR * 2, "bullish", BAR)).toBeUndefined();
  });

  it("ignores setups going the other way", () => {
    expect(actionForCandle([long], 3000, "bearish", BAR)).toBeUndefined();
    expect(actionForCandle([{ ...long, direction: "short" }], 3000, "bullish", BAR)).toBeUndefined();
  });

  it("prefers the later step when two are close together", () => {
    const tight = { direction: "short" as const, breakTime: 2000, retestTime: 2000 + BAR };
    expect(actionForCandle([tight], 2000 + BAR, "bearish", BAR)).toBe("Hold");
  });

  it("returns nothing when there are no setups", () => {
    expect(actionForCandle([], 3000, "bullish", BAR)).toBeUndefined();
  });
});
