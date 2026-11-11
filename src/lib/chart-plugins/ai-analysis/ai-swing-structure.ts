import type { Candle } from "../../../services/schemas.ts";
import type { AiChartPoint } from "../../../services/ai-analysis.ts";
import { detectIctEvents } from "../ict-analysis/ict-analysis.ts";

export const AI_SWING_STRENGTH = 5;
const MAX_CANDLES = 120;
const MAX_STRUCTURE_POINTS = 4;
const ATR_PERIOD = 14;
export const AI_MAJOR_MOVE_ATR_MULTIPLIER = 1.25;

type SwingPivot = {
  time: number;
  kind: "swing-high" | "swing-low";
  price: number;
};

function averageTrueRange(candles: readonly Candle[]): number {
  if (candles.length < 2) return 0;
  const ranges: number[] = [];
  for (let index = 1; index < candles.length; index += 1) {
    const current = candles[index]!;
    const previous = candles[index - 1]!;
    ranges.push(Math.max(
      current.high - current.low,
      Math.abs(current.high - previous.close),
      Math.abs(current.low - previous.close),
    ));
  }
  const recent = ranges.slice(-ATR_PERIOD);
  return recent.reduce((sum, range) => sum + range, 0) / recent.length;
}

/** Collapse consecutive same-side pivots so one impulse has one structural anchor. */
function consolidatePivots(pivots: readonly SwingPivot[]): SwingPivot[] {
  const consolidated: SwingPivot[] = [];
  for (const pivot of pivots) {
    const previous = consolidated.at(-1);
    if (!previous || previous.kind !== pivot.kind) {
      consolidated.push(pivot);
      continue;
    }
    const isMoreExtreme = pivot.kind === "swing-high"
      ? pivot.price >= previous.price
      : pivot.price <= previous.price;
    if (isMoreExtreme) consolidated[consolidated.length - 1] = pivot;
  }
  return consolidated;
}

function majorPivotIds(pivots: readonly SwingPivot[], atr: number): Set<string> {
  const major = new Set<string>();
  if (pivots.length === 0) return major;
  major.add(`${pivots[0]!.kind}-${pivots[0]!.time}`);
  let lastMajor = pivots[0]!;
  const minimumMove = atr * AI_MAJOR_MOVE_ATR_MULTIPLIER;
  for (const pivot of pivots.slice(1)) {
    if (pivot.kind !== lastMajor.kind &&
        Math.abs(pivot.price - lastMajor.price) >= minimumMove) {
      major.add(`${pivot.kind}-${pivot.time}`);
      lastMajor = pivot;
    }
  }
  return major;
}

/**
 * Return confirmed local swing pivots for the AI layer, labelled by their
 * relationship to the prior pivot of the same type. These are candle-derived
 * structure labels, not AI predictions; the last (still-forming) candle is
 * excluded so the labels do not repaint on every tick.
 */
export function detectAiSwingStructure(candles: readonly Candle[]): AiChartPoint[] {
  const closedCandles = candles.slice(-MAX_CANDLES, -1);
  if (closedCandles.length < AI_SWING_STRENGTH * 2 + 1) return [];

  const rawPivots: SwingPivot[] = detectIctEvents(closedCandles, AI_SWING_STRENGTH)
    .filter((event) => event.kind === "swing-high" || event.kind === "swing-low")
    .map((event) => ({ time: event.time, kind: event.kind as SwingPivot["kind"], price: event.price! }))
    .sort((a, b) => a.time - b.time);
  const pivots = consolidatePivots(rawPivots);
  const majorIds = majorPivotIds(pivots, averageTrueRange(closedCandles));

  let previousHigh: number | undefined;
  let previousLow: number | undefined;
  const points: AiChartPoint[] = [];

  for (const pivot of pivots) {
    if (pivot.price === undefined) continue;
    const isHigh = pivot.kind === "swing-high";
    const previous = isHigh ? previousHigh : previousLow;
    const label = previous === undefined
      ? isHigh ? "SH" : "SL"
      : isHigh
        ? pivot.price > previous ? "HH" : pivot.price < previous ? "LH" : "EQH"
        : pivot.price > previous ? "HL" : pivot.price < previous ? "LL" : "EQL";

    if (!majorIds.has(`${pivot.kind}-${pivot.time}`)) continue;

    points.push({
      time: pivot.time,
      price: pivot.price,
      kind: isHigh ? "structure-high" : "structure-low",
      label,
      major: true,
      explanation: isHigh
        ? `Confirmed swing high; ${label} compares it with the previous swing high.`
        : `Confirmed swing low; ${label} compares it with the previous swing low.`,
    });

    if (isHigh) previousHigh = pivot.price;
    else previousLow = pivot.price;
  }

  return points.slice(-MAX_STRUCTURE_POINTS);
}
