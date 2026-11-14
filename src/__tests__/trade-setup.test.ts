import { describe, expect, it } from "vitest";
import type { Candle } from "../services/schemas.ts";
import {
  buildTradeSetup,
  type TradeSetup,
} from "../lib/chart-plugins/trade-setup/trade-setup.ts";
import type { LiquidityLevel } from "../lib/chart-plugins/liquidity-analysis/liquidity-analysis.ts";

function candle(time: number, open: number, high: number, low: number, close: number): Candle {
  return { time, open, high, low, close, volume: 1 };
}

function liquidity(side: "buy-side" | "sell-side", price: number, time: number, sweepTime?: number): LiquidityLevel {
  return {
    id: `${side}-${time}`,
    side,
    price,
    time,
    equal: false,
    swept: sweepTime !== undefined,
    sweepTime,
    reclaimed: sweepTime !== undefined,
  };
}

function setupFor(candles: Candle[], swept: LiquidityLevel, breakLevel: LiquidityLevel): TradeSetup {
  return buildTradeSetup(candles, swept, [swept, breakLevel], 8);
}

describe("buildTradeSetup", () => {
  it("waits for the opposing swing break after a liquidity sweep", () => {
    const swept = liquidity("sell-side", 90, 10, 20);
    const broken = liquidity("buy-side", 110, 15);
    const result = setupFor([
      candle(21, 95, 101, 93, 99),
      candle(22, 99, 103, 97, 102),
    ], swept, broken);

    expect(result).toMatchObject({ direction: "long", stage: "liquidity-swept" });
  });

  it("shows a candidate only after break and retest", () => {
    const swept = liquidity("sell-side", 90, 10, 20);
    const broken = liquidity("buy-side", 110, 15);
    const result = setupFor([
      candle(20, 92, 96, 87, 94),
      candle(21, 95, 101, 93, 99),
      candle(22, 99, 112, 98, 111),
      candle(23, 111, 112, 108, 110),
      candle(24, 110, 111, 109, 110),
    ], swept, broken);

    expect(result).toMatchObject({
      direction: "long",
      stage: "candidate",
      breakTime: 22,
      retestTime: 23,
      sweepPrice: 87,
      entry: 110,
      stop: 90,
    });
  });

  it("invalidates a broken setup when price closes back through swept liquidity", () => {
    const swept = liquidity("sell-side", 90, 10, 20);
    const broken = liquidity("buy-side", 110, 15);
    const result = setupFor([
      candle(21, 95, 101, 93, 99),
      candle(22, 99, 112, 98, 111),
      candle(23, 100, 101, 88, 89),
    ], swept, broken);

    expect(result).toMatchObject({ direction: "long", stage: "invalidated" });
  });
});
