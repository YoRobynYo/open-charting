/**
 * The "story" of a pattern candle, told with candles only (no other ICT layer):
 *
 *   waiting   - the pattern formed and the next few candles have not decided yet
 *   confirmed - a later candle closed beyond the pattern candle in its direction
 *   failed    - a later candle closed beyond the pattern candle the other way
 *   expired   - the window passed and neither happened
 */
export type CandleBias = "bullish" | "bearish";
export type CandleStoryStage = "waiting" | "confirmed" | "failed" | "expired";

interface StoryCandle {
  high: number;
  low: number;
  close: number;
}

/** How many candles after the pattern candle are allowed to decide the story. */
export const DEFAULT_CONFIRM_WINDOW = 3;

export function evaluateCandleStory(
  candles: readonly StoryCandle[],
  index: number,
  bias: CandleBias,
  windowBars = DEFAULT_CONFIRM_WINDOW,
): CandleStoryStage {
  const signal = candles[index];
  if (!signal) return "waiting";

  const last = Math.min(candles.length - 1, index + windowBars);
  for (let j = index + 1; j <= last; j += 1) {
    const next = candles[j]!;
    const confirms = bias === "bullish" ? next.close > signal.high : next.close < signal.low;
    const fails = bias === "bullish" ? next.close < signal.low : next.close > signal.high;
    if (confirms) return "confirmed";
    if (fails) return "failed";
  }
  // Nothing decided yet: still waiting while the window is open, otherwise expired.
  return candles.length - 1 < index + windowBars ? "waiting" : "expired";
}
