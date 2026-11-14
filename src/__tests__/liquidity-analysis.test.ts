import { describe, expect, it } from "vitest";
import type { Candle } from "../services/schemas.ts";
import { detectLiquidityLevels } from "../lib/chart-plugins/liquidity-analysis/liquidity-analysis.ts";

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

describe("detectLiquidityLevels", () => {
  it("maps major highs to buy-side and major lows to sell-side liquidity", () => {
    const levels = detectLiquidityLevels(makeWaveCandles([
      [0, 100], [6, 120], [12, 90], [18, 115], [24, 85], [30, 87],
    ], 31));

    expect(levels.map(({ side }) => side)).toEqual([
      "buy-side", "sell-side", "buy-side", "sell-side",
    ]);
    expect(levels.every((level) => level.swept === false)).toBe(true);
  });

  it("marks nearby highs as equal liquidity", () => {
    const levels = detectLiquidityLevels(makeWaveCandles([
      [0, 100], [6, 120], [12, 90], [18, 119], [24, 85], [30, 87],
    ], 31));

    expect(levels.filter((level) => level.side === "buy-side").every((level) => level.equal)).toBe(true);
  });

  it("marks a sell-side sweep only after price closes back above the level", () => {
    const candles = makeWaveCandles([
      [0, 100], [6, 120], [12, 90], [18, 115], [24, 85], [30, 87], [36, 87],
    ], 37);
    candles[31] = { ...candles[31]!, high: 88, low: 78, close: 86, open: 83 };

    const level = detectLiquidityLevels(candles).find(
      (candidate) => candidate.side === "sell-side" && candidate.time === 25,
    );

    expect(level).toMatchObject({ swept: true, reclaimed: true, sweepTime: 32 });
  });
});
