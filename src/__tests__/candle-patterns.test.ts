import { describe, expect, it } from "vitest";
import type { Candle } from "../services/schemas.ts";
import {
  analyzeCandleSequence,
  detectEngulfing,
  detectRejectionCandle,
  getCandleAnatomy,
} from "../lib/candle-patterns.ts";

function candle(time: number, open: number, high: number, low: number, close: number): Candle {
  return { time, open, high, low, close, volume: 1 };
}

describe("candle pattern engine", () => {
  it("measures body and wick anatomy", () => {
    const anatomy = getCandleAnatomy(candle(1, 100, 105, 90, 104));
    expect(anatomy.body).toBe(4);
    expect(anatomy.upperWick).toBe(1);
    expect(anatomy.lowerWick).toBe(10);
    expect(anatomy.closePosition).toBeCloseTo(14 / 15);
    expect(anatomy.bullish).toBe(true);
  });

  it("detects a hammer candidate without calling it a trade", () => {
    const result = detectRejectionCandle(candle(1, 100, 101, 90, 100.5));
    expect(result.pattern).toBe("hammer");
    expect(result.visualState).toBe("hammer-candidate");
  });

  it("detects a shooting-star candidate", () => {
    const result = detectRejectionCandle(candle(1, 100, 110, 99.5, 100.5));
    expect(result.pattern).toBe("shooting-star");
    expect(result.visualState).toBe("shooting-star-candidate");
  });

  it("does not label a small wick as a hammer", () => {
    const result = detectRejectionCandle(candle(1, 100, 103, 98, 102));
    expect(result.pattern).toBe("none");
  });

  it("detects bullish and bearish body engulfing", () => {
    const bullish = detectEngulfing(
      candle(1, 105, 106, 99, 100),
      candle(2, 99, 108, 98, 107),
    );
    expect(bullish.pattern).toBe("bullish-engulfing");

    const bearish = detectEngulfing(
      candle(3, 100, 106, 99, 105),
      candle(4, 106, 107, 97, 98),
    );
    expect(bearish.pattern).toBe("bearish-engulfing");
  });

  it("confirms a hammer only when the next candle engulfs it", () => {
    const sequence = analyzeCandleSequence(
      candle(1, 101, 101, 90, 100.5),
      candle(2, 100.4, 104, 99, 103),
    );
    expect(sequence.confirmed).toBe("long");
  });

  it("keeps an unconfirmed rejection candle out of the trade state", () => {
    const sequence = analyzeCandleSequence(
      candle(1, 100, 101, 90, 100.5),
      candle(2, 100.5, 102, 99, 100),
    );
    expect(sequence.candidate.pattern).toBe("hammer");
    expect(sequence.confirmed).toBe("none");
  });
});
