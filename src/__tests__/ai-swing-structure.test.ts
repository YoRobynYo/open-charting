import { describe, expect, it } from "vitest";
import type { Candle } from "../services/schemas.ts";
import { detectAiSwingStructure } from "../lib/chart-plugins/ai-analysis/ai-swing-structure.ts";

function makeCandles(rows: Array<[number, number, number]>): Candle[] {
  return rows.map(([time, high, low]) => ({
    time,
    open: (high + low) / 2,
    high,
    low,
    close: (high + low) / 2,
    volume: 1,
  }));
}

describe("detectAiSwingStructure", () => {
  it("labels confirmed highs/lows relative to the previous pivot of the same type", () => {
    const candles = makeCandles([
      [1, 12, 9],
      [2, 13, 10],
      [3, 16, 11],
      [4, 14, 10],
      [5, 12, 7],
      [6, 14, 8],
      [7, 15, 9],
      [8, 13, 9],
      [9, 12, 8],
      [10, 14, 10],
      [11, 13, 9],
      [12, 12, 8],
    ]);

    const points = detectAiSwingStructure(candles);

    expect(points.map(({ time, label }) => [time, label])).toContainEqual([3, "SH"]);
    expect(points.map(({ time, label }) => [time, label])).toContainEqual([5, "SL"]);
    expect(points.map(({ time, label }) => [time, label])).toContainEqual([7, "LH"]);
    expect(points.map(({ time, label }) => [time, label])).toContainEqual([9, "HL"]);
    expect(points.map(({ time }) => time)).not.toContain(12);
  });

  it("waits until there are enough closed candles to confirm a pivot", () => {
    expect(detectAiSwingStructure(makeCandles([
      [1, 2, 1],
      [2, 3, 1],
      [3, 4, 2],
      [4, 3, 1],
      [5, 2, 1],
    ]))).toEqual([]);
  });
});
