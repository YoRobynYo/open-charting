import {
  detectIctEvents,
  filterRecentIctEvents,
  type IctCandle,
} from "../ict-analysis/ict-analysis.ts";

/** A candle that is one step of a break: the retest, the hold or the trade. */
export interface StructureStep {
  time: number;
}

/** One break of structure, ready to draw: a level, the swing it came from and the candle that closed through it. */
export interface StructureBreak {
  /** BOS continues the trend. CHoCH is the first break against it. */
  kind: "BOS" | "CHoCH";
  direction: "bullish" | "bearish";
  /** The candle that closed through the level. */
  time: number;
  /** The swing candle the level came from. */
  startTime: number;
  price: number;
  /** The candle that came back to the level and closed on the right side of it. */
  retest?: StructureStep;
  /** The next candle, when it closed on the right side of the level too. */
  hold?: StructureStep;
  /** The candle after the hold, where the trade would be taken on its open. */
  trade?: StructureStep;
}

export interface StructureBreakOptions {
  /** Candles either side of a swing before it counts. Bigger means fewer, stronger breaks. */
  strength?: number;
  /** Only keep breaks this far back from the latest candle. */
  lookbackSeconds?: number;
  /** How many candles after a break price has to come back and hold. */
  retestBars?: number;
}

export const DEFAULT_STRUCTURE_STRENGTH = 5;
export const DEFAULT_STRUCTURE_LOOKBACK_SECONDS = 30 * 24 * 60 * 60;
/** Same window the ICT Structure 4 trade setup uses for its retest. */
export const DEFAULT_STRUCTURE_RETEST_BARS = 8;

const rightSide = (candle: IctCandle, direction: StructureBreak["direction"], price: number) =>
  direction === "bullish" ? candle.close >= price : candle.close <= price;

const touches = (candle: IctCandle, direction: StructureBreak["direction"], price: number) =>
  direction === "bullish" ? candle.low <= price : candle.high >= price;

/**
 * What happens after a break, one candle each:
 * - retest: the first candle within `maxBars` that reaches back to the level
 *   and still closes on the right side of it (a bullish break needs a low at or
 *   below the level and a close at or above it, a bearish break the reverse);
 * - hold: the very next candle, if it closes on the right side as well;
 * - trade: the candle after that, which may still be forming.
 * Only closed candles can retest or hold, so those words never flicker.
 */
function findSteps(
  candles: readonly IctCandle[],
  breakIndex: number,
  direction: StructureBreak["direction"],
  price: number,
  maxBars: number,
): Pick<StructureBreak, "retest" | "hold" | "trade"> {
  const closedCount = candles.length - 1;
  const end = Math.min(closedCount, breakIndex + 1 + maxBars);
  let retestIndex = -1;
  for (let i = breakIndex + 1; i < end; i += 1) {
    const candle = candles[i]!;
    if (touches(candle, direction, price) && rightSide(candle, direction, price)) {
      retestIndex = i;
      break;
    }
  }
  if (retestIndex < 0) return {};

  const steps: Pick<StructureBreak, "retest" | "hold" | "trade"> = {
    retest: { time: candles[retestIndex]!.time },
  };
  const holdIndex = retestIndex + 1;
  if (holdIndex < closedCount && rightSide(candles[holdIndex]!, direction, price)) {
    steps.hold = { time: candles[holdIndex]!.time };
    const tradeIndex = holdIndex + 1;
    if (tradeIndex < candles.length) steps.trade = { time: candles[tradeIndex]!.time };
  }
  return steps;
}

/**
 * BOS and CHoCH read from closed candles only, so a label never appears and
 * vanishes while the latest candle is still forming.
 */
export function detectStructureBreaks(
  candles: readonly IctCandle[],
  options: StructureBreakOptions = {},
): StructureBreak[] {
  const latest = candles.at(-1)?.time;
  if (latest === undefined) return [];
  const closed = candles.slice(0, -1);
  const indexByTime = new Map(closed.map((candle, index) => [candle.time, index]));
  const retestBars = Math.max(1, Math.floor(options.retestBars ?? DEFAULT_STRUCTURE_RETEST_BARS));
  const events = detectIctEvents(
    closed,
    options.strength ?? DEFAULT_STRUCTURE_STRENGTH,
  );
  return filterRecentIctEvents(
    events,
    latest,
    options.lookbackSeconds ?? DEFAULT_STRUCTURE_LOOKBACK_SECONDS,
  ).flatMap((event): StructureBreak[] => {
    if ((event.kind !== "bos" && event.kind !== "choch") ||
        event.price === undefined || event.startTime === undefined) return [];
    const breakIndex = indexByTime.get(event.time);
    const steps = breakIndex === undefined
      ? {}
      : findSteps(candles, breakIndex, event.direction, event.price, retestBars);
    return [{
      kind: event.kind === "bos" ? "BOS" : "CHoCH",
      direction: event.direction,
      time: event.time,
      startTime: event.startTime,
      price: event.price,
      ...steps,
    }];
  });
}

/** One word to show under a candle: Retest, Hold, or Trade with an arrow. */
export interface StepWord {
  kind: "retest" | "hold" | "trade";
  text: string;
  direction: StructureBreak["direction"];
}

/**
 * Groups the retest, hold and trade steps of every break by candle time, in
 * the order they happen, so each candle can show them under its name.
 */
export function stepWordsByTime(breaks: readonly StructureBreak[]): Map<number, StepWord[]> {
  const words = new Map<number, StepWord[]>();
  const add = (time: number, word: StepWord) => {
    const list = words.get(time) ?? [];
    if (!list.some((w) => w.text === word.text)) list.push(word);
    words.set(time, list);
  };
  for (const b of breaks) {
    if (b.retest) add(b.retest.time, { kind: "retest", text: "Retest", direction: b.direction });
    if (b.hold) add(b.hold.time, { kind: "hold", text: "Hold", direction: b.direction });
    if (b.trade) {
      add(b.trade.time, {
        kind: "trade",
        text: b.direction === "bullish" ? "Trade \u25B2" : "Trade \u25BC",
        direction: b.direction,
      });
    }
  }
  return words;
}
