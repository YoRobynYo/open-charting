import type { Candle } from "../../../services/schemas.ts";
import {
  detectLiquidityLevels,
  type LiquidityLevel,
} from "../liquidity-analysis/liquidity-analysis.ts";

export type TradeSetupDirection = "long" | "short";
export type TradeSetupStage =
  | "incomplete"
  | "liquidity-swept"
  | "break-confirmed"
  | "retest-pending"
  | "candidate"
  | "invalidated";

export interface TradeSetup {
  id: string;
  direction: TradeSetupDirection;
  stage: TradeSetupStage;
  liquidity: LiquidityLevel;
  breakLevel?: LiquidityLevel;
  target?: LiquidityLevel;
  sweepTime?: number;
  sweepPrice?: number;
  breakTime?: number;
  retestTime?: number;
  entry?: number;
  stop?: number;
  explanation: string;
}

export interface TradeSetupOptions {
  maxSetups?: number;
  retestBars?: number;
}

const MAX_SETUPS = 2;
const DEFAULT_RETEST_BARS = 8;

function closedCandles(candles: readonly Candle[]): Candle[] {
  return candles.length > 1 ? candles.slice(0, -1) : [];
}

function candlesAfter(candles: readonly Candle[], time: number): Candle[] {
  return candles.filter((candle) => candle.time > time);
}

function candleAt(candles: readonly Candle[], time: number | undefined): Candle | undefined {
  return time === undefined ? undefined : candles.find((candle) => candle.time === time);
}

function findBreak(
  candles: readonly Candle[],
  direction: TradeSetupDirection,
  level: LiquidityLevel,
): Candle | undefined {
  return candlesAfter(candles, level.sweepTime ?? level.time).find((candle) =>
    direction === "long" ? candle.close > level.price : candle.close < level.price,
  );
}

function findRetest(
  candles: readonly Candle[],
  direction: TradeSetupDirection,
  breakCandle: Candle,
  level: LiquidityLevel,
  maxBars: number,
): Candle | undefined {
  const afterBreak = candlesAfter(candles, breakCandle.time).slice(0, maxBars);
  return afterBreak.find((candle) => direction === "long"
    ? candle.low <= level.price && candle.close >= level.price
    : candle.high >= level.price && candle.close <= level.price);
}

function firstTarget(
  levels: readonly LiquidityLevel[],
  direction: TradeSetupDirection,
  breakLevel: LiquidityLevel,
): LiquidityLevel | undefined {
  const candidates = levels.filter((level) =>
    level.side === (direction === "long" ? "buy-side" : "sell-side") &&
    (direction === "long" ? level.price > breakLevel.price : level.price < breakLevel.price),
  );
  return direction === "long"
    ? candidates.sort((a, b) => a.price - b.price)[0]
    : candidates.sort((a, b) => b.price - a.price)[0];
}

export function buildTradeSetup(
  candles: readonly Candle[],
  liquidity: LiquidityLevel,
  levels: readonly LiquidityLevel[],
  retestBars: number,
): TradeSetup {
  const direction: TradeSetupDirection = liquidity.side === "sell-side" ? "long" : "short";
  const id = `${direction}-${liquidity.id}`;
  if (!liquidity.swept || liquidity.sweepTime === undefined) {
    return {
      id,
      direction,
      stage: "incomplete",
      liquidity,
      explanation: `${direction === "long" ? "Sell-side" : "Buy-side"} liquidity is mapped, but it has not been swept and reclaimed.`,
    };
  }

  const sweepCandle = candleAt(candles, liquidity.sweepTime);
  const sweepPrice = sweepCandle === undefined
    ? liquidity.price
    : direction === "long" ? sweepCandle.low : sweepCandle.high;

  const breakLevel = levels
    .filter((level) => level.side === (direction === "long" ? "buy-side" : "sell-side") && level.time > liquidity.time)
    .sort((a, b) => a.time - b.time)[0];
  if (!breakLevel) {
    return {
      id,
      direction,
      stage: "liquidity-swept",
      liquidity,
      sweepTime: liquidity.sweepTime,
      sweepPrice,
      explanation: "Liquidity was swept and reclaimed. No opposing swing level is available to confirm a break yet.",
    };
  }

  const breakCandle = findBreak(candles, direction, breakLevel);
  if (!breakCandle) {
    return {
      id,
      direction,
      stage: "liquidity-swept",
      liquidity,
      breakLevel,
      sweepTime: liquidity.sweepTime,
      sweepPrice,
      explanation: `Liquidity was swept. Waiting for a close ${direction === "long" ? "above" : "below"} the opposing swing level.`,
    };
  }

  const target = firstTarget(levels, direction, breakLevel);
  const retest = findRetest(candles, direction, breakCandle, breakLevel, retestBars);
  if (!retest) {
    const latest = candles.at(-1);
    const invalidated = latest !== undefined && (direction === "long"
      ? latest.close < liquidity.price
      : latest.close > liquidity.price);
    return {
      id,
      direction,
      stage: invalidated ? "invalidated" : "retest-pending",
      liquidity,
      breakLevel,
      target,
      sweepTime: liquidity.sweepTime,
      sweepPrice,
      breakTime: breakCandle.time,
      explanation: invalidated
        ? "The price closed back through the swept liquidity level; the setup is invalidated."
        : "The opposing swing level broke. Wait for a retest before considering a paper candidate.",
    };
  }

  const entry = retest.close;
  const stop = direction === "long"
    ? Math.min(liquidity.price, retest.low)
    : Math.max(liquidity.price, retest.high);
  return {
    id,
    direction,
    stage: "candidate",
    liquidity,
    breakLevel,
    target,
    sweepTime: liquidity.sweepTime,
    sweepPrice,
    breakTime: breakCandle.time,
    retestTime: retest.time,
    entry,
    stop,
    explanation: `Liquidity swept, opposing swing broken, and level retested. This is a paper ${direction} candidate only.`,
  };
}

/**
 * Builds an educational setup state from confirmed swings and liquidity.
 * It never places orders and never treats an unconfirmed map as a signal.
 */
export function detectTradeSetups(
  candles: readonly Candle[],
  options: TradeSetupOptions = {},
): TradeSetup[] {
  const closed = closedCandles(candles);
  if (closed.length < 11) return [];
  const levels = detectLiquidityLevels(candles);
  const maxSetups = Math.max(1, Math.floor(options.maxSetups ?? MAX_SETUPS));
  return levels
    .slice(-maxSetups * 2)
    .map((level) => buildTradeSetup(closed, level, levels, options.retestBars ?? DEFAULT_RETEST_BARS))
    .filter((setup) => setup.stage !== "incomplete")
    .slice(-maxSetups);
}
