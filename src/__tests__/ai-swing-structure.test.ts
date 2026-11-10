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

function makeWaveCandles(turningPoints: Array<[number, number]>, length: number): Candle[] {
  const levels = Array.from({ length }, () => 100);
  for (let segment = 0; segment < turningPoints.length - 1; segment += 1) {
    const [startIndex, startLevel] = turningPoints[segment]!;
    const [endIndex, endLevel] = turningPoints[segment + 1]!;
    for (let index = startIndex; index <= endIndex; index += 1) {
      const progress = (index - startIndex) / (endIndex - startIndex);
      levels[index] = Math.round(startLevel + (endLevel - startLevel) * progress);
    }
  }
  return makeCandles(levels.map((level, index) => [index + 1, level + 1, level - 1]));
}

describe("detectAiSwingStructure", () => {
  it("labels confirmed highs/lows relative to the previous pivot of the same type", () => {
    const candles = makeWaveCandles([
      [0, 100], [6, 120], [12, 90], [18, 115], [24, 85], [30, 87],
    ], 31);

    const points = detectAiSwingStructure(candles);

    expect(points.map(({ time, label }) => [time, label])).toEqual([
      [7, "SH"], [13, "SL"], [19, "LH"], [25, "LL"],
    ]);
    expect(points.every((point) => point.major === true)).toBe(true);
    expect(points.map(({ time }) => time)).not.toContain(2);
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

  it("caps displayed structure labels at the latest four pivots", () => {
    const candles = makeWaveCandles([
      [0, 100], [6, 120], [12, 90], [18, 115], [24, 85], [30, 110],
      [36, 80], [42, 105], [48, 75], [53, 78],
    ], 54);

    expect(detectAiSwingStructure(candles)).toHaveLength(4);
  });

  it("filters out pivots that do not clear the major ATR movement threshold", () => {
    const candles = makeWaveCandles([
      [0, 100], [6, 120], [12, 90], [18, 115], [24, 85], [30, 87],
    ], 31);
    const points = detectAiSwingStructure(candles);

    expect(points.every((point) => point.major === true)).toBe(true);
    expect(points.map(({ time }) => time)).toEqual([7, 13, 19, 25]);
  });
});
