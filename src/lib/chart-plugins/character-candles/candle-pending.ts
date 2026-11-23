import type { CandleBias } from "./candle-story";

/** The parts of an ICT Structure 4 setup that Pending needs. */
export interface PendingSetup {
  direction: "long" | "short";
  breakTime?: number;
  retestTime?: number;
}

/** A waiting retest older than this many candles is treated as stale, not pending. */
export const PENDING_MAX_BARS = 24;

/**
 * True when this pattern candle sits on the break of the one live setup that is
 * still waiting for its retest. Only the newest broken setup can be pending, so
 * at most one candle on the chart shows it. Never claims a trade is confirmed.
 */
export function isPendingCandle(
  setups: readonly PendingSetup[],
  time: number,
  bias: CandleBias,
  barSeconds: number,
  lastCandleTime: number,
  maxBars: number = PENDING_MAX_BARS,
): boolean {
  let latest: PendingSetup | undefined;
  for (const s of setups) {
    if (s.breakTime === undefined) continue;
    if (!latest || s.breakTime > (latest.breakTime as number)) latest = s;
  }
  if (!latest || latest.breakTime === undefined) return false;
  if (latest.retestTime !== undefined) return false;
  if (latest.direction !== (bias === "bullish" ? "long" : "short")) return false;
  if (lastCandleTime - latest.breakTime > maxBars * barSeconds) return false;
  return Math.abs(latest.breakTime - time) <= barSeconds;
}
