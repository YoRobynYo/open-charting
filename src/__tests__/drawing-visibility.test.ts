import { describe, expect, it } from "vitest";
import type { DrawingLine } from "../pages/trading/constants.ts";
import { isManualTrendlineInHistory } from "../lib/chart-plugins/drawing-tools/visibility.ts";

const day = 24 * 60 * 60;
const latestCandleTime = 10 * day;

function trendline(time: number, time2: number): DrawingLine {
  return {
    id: "manual-trendline",
    type: "trendline",
    price: 100,
    price2: 110,
    time,
    time2,
    color: "#ffffff",
  };
}

describe("isManualTrendlineInHistory", () => {
  it("keeps trendlines anchored within the latest seven days, including the exact cutoff", () => {
    expect(isManualTrendlineInHistory(trendline(latestCandleTime - 7 * day, latestCandleTime - 6 * day), latestCandleTime)).toBe(true);
    expect(isManualTrendlineInHistory(trendline(latestCandleTime - 8 * day, latestCandleTime - 7 * day - 1), latestCandleTime)).toBe(false);
  });

  it("does not age-filter other drawing types or change a drawing when checking it", () => {
    const oldHorizontal: DrawingLine = {
      id: "old-level",
      type: "horizontal",
      price: 100,
      time: latestCandleTime - 30 * day,
      color: "#ffffff",
    };
    const line = trendline(latestCandleTime - 9 * day, latestCandleTime - 1 * day);
    const before = { ...line };

    expect(isManualTrendlineInHistory(oldHorizontal, latestCandleTime)).toBe(true);
    expect(isManualTrendlineInHistory(line, latestCandleTime)).toBe(true);
    expect(line).toEqual(before);
  });

  it("leaves trendlines visible before candle data is available", () => {
    expect(isManualTrendlineInHistory(trendline(1, 2), null)).toBe(true);
  });
});
