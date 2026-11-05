import type { Candle } from "../../../services/schemas.ts";
import type { AiChartPoint } from "../../../services/ai-analysis.ts";
import { detectIctEvents } from "../ict-analysis/ict-analysis.ts";

const SWING_STRENGTH = 2;
const MAX_CANDLES = 120;
const MAX_STRUCTURE_POINTS = 8;

/**
 * Return confirmed local swing pivots for the AI layer, labelled by their
 * relationship to the prior pivot of the same type. These are candle-derived
 * structure labels, not AI predictions; the last (still-forming) candle is
 * excluded so the labels do not repaint on every tick.
 */
export function detectAiSwingStructure(candles: readonly Candle[]): AiChartPoint[] {
  const closedCandles = candles.slice(-MAX_CANDLES, -1);
  if (closedCandles.length < SWING_STRENGTH * 2 + 1) return [];

  const pivots = detectIctEvents(closedCandles, SWING_STRENGTH)
    .filter((event) => event.kind === "swing-high" || event.kind === "swing-low")
    .sort((a, b) => a.time - b.time);

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

    points.push({
      time: pivot.time,
      price: pivot.price,
      kind: isHigh ? "structure-high" : "structure-low",
      label,
      explanation: isHigh
        ? `Confirmed swing high; ${label} compares it with the previous swing high.`
        : `Confirmed swing low; ${label} compares it with the previous swing low.`,
    });

    if (isHigh) previousHigh = pivot.price;
    else previousLow = pivot.price;
  }

  return points.slice(-MAX_STRUCTURE_POINTS);
}
