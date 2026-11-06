import type { DrawingLine } from "../../../pages/trading/constants.ts";

export const MANUAL_TRENDLINE_LOOKBACK_SECONDS = 7 * 24 * 60 * 60;

/**
 * Keep manually drawn trendlines visible for up to one week from the chart's
 * latest candle. This only filters the chart view; the original drawing stays
 * saved and unchanged. Other drawing types are unaffected.
 */
export function isManualTrendlineInHistory(
  drawing: DrawingLine,
  latestCandleTime: number | null,
  lookbackSeconds = MANUAL_TRENDLINE_LOOKBACK_SECONDS,
): boolean {
  if (drawing.type !== "trendline" || latestCandleTime === null || !Number.isFinite(latestCandleTime)) {
    return true;
  }

  const anchorTimes = [drawing.time, drawing.time2]
    .filter((time): time is number => typeof time === "number" && Number.isFinite(time));
  if (anchorTimes.length === 0) return true;

  const mostRecentAnchor = Math.max(...anchorTimes);
  return mostRecentAnchor >= latestCandleTime - lookbackSeconds;
}
