import { describe, expect, it } from "vitest";
import { evaluateCandleStory } from "../lib/chart-plugins/character-candles/candle-story.ts";

const c = (high: number, low: number, close: number) => ({ high, low, close });

describe("evaluateCandleStory", () => {
  const signal = c(110, 100, 105);

  it("confirms a bullish pattern when a later candle closes above its high", () => {
    expect(evaluateCandleStory([signal, c(108, 104, 107), c(114, 107, 112)], 0, "bullish")).toBe("confirmed");
  });

  it("confirms a bearish pattern when a later candle closes below its low", () => {
    expect(evaluateCandleStory([signal, c(106, 96, 98)], 0, "bearish")).toBe("confirmed");
  });

  it("fails a bullish pattern when a later candle closes below its low", () => {
    expect(evaluateCandleStory([signal, c(104, 95, 97)], 0, "bullish")).toBe("failed");
  });

  it("fails a bearish pattern when a later candle closes above its high", () => {
    expect(evaluateCandleStory([signal, c(114, 106, 112)], 0, "bearish")).toBe("failed");
  });

  it("keeps waiting while the window is still open", () => {
    expect(evaluateCandleStory([signal, c(108, 102, 106)], 0, "bullish", 3)).toBe("waiting");
  });

  it("expires when the window passes with no decision", () => {
    const quiet = c(108, 102, 106);
    expect(evaluateCandleStory([signal, quiet, quiet, quiet, quiet], 0, "bullish", 3)).toBe("expired");
  });

  it("only looks inside the window", () => {
    const quiet = c(108, 102, 106);
    expect(evaluateCandleStory([signal, quiet, quiet, quiet, c(120, 110, 118)], 0, "bullish", 3)).toBe("expired");
  });

  it("waits when the pattern is the newest candle", () => {
    expect(evaluateCandleStory([signal], 0, "bearish")).toBe("waiting");
  });
});
