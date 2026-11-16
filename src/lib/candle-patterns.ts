import type { Candle } from "../services/schemas.ts";

export type CandlePattern =
  | "hammer"
  | "inverted-hammer"
  | "shooting-star"
  | "hanging-man"
  | "bullish-engulfing"
  | "bearish-engulfing"
  | "morning-star"
  | "evening-star"
  | "bullish-marubozu"
  | "bearish-marubozu"
  | "none";

export type CandleVisualState =
  | "normal"
  | "hammer-candidate"
  | "inverted-hammer-candidate"
  | "shooting-star-candidate"
  | "hanging-man-candidate"
  | "bullish-confirmed"
  | "bearish-confirmed"
  | "morning-star-confirmed"
  | "evening-star-confirmed"
  | "bullish-displacement"
  | "bearish-displacement";

export interface CandleAnatomy {
  body: number;
  range: number;
  upperWick: number;
  lowerWick: number;
  bodyRatio: number;
  closePosition: number;
  bullish: boolean;
  bearish: boolean;
}

export interface CandlePatternResult {
  pattern: CandlePattern;
  visualState: CandleVisualState;
  anatomy: CandleAnatomy;
  explanation: string;
}

const EPSILON = 1e-12;
const MARUBOZU_MAX_WICK_RATIO = 0.1;
const STAR_MAX_MIDDLE_BODY_RATIO = 0.35;

function noPattern(anatomy: CandleAnatomy, explanation: string): CandlePatternResult {
  return {
    pattern: "none",
    visualState: "normal",
    anatomy,
    explanation,
  };
}

export function getCandleAnatomy(candle: Candle): CandleAnatomy {
  const body = Math.abs(candle.close - candle.open);
  const range = Math.max(candle.high - candle.low, EPSILON);
  const upperWick = Math.max(0, candle.high - Math.max(candle.open, candle.close));
  const lowerWick = Math.max(0, Math.min(candle.open, candle.close) - candle.low);
  return {
    body,
    range,
    upperWick,
    lowerWick,
    bodyRatio: body / range,
    closePosition: (candle.close - candle.low) / range,
    bullish: candle.close > candle.open,
    bearish: candle.close < candle.open,
  };
}

function isMarubozu(anatomy: CandleAnatomy): boolean {
  return anatomy.bodyRatio >= 0.8 &&
    anatomy.upperWick / anatomy.range <= MARUBOZU_MAX_WICK_RATIO &&
    anatomy.lowerWick / anatomy.range <= MARUBOZU_MAX_WICK_RATIO;
}

/**
 * Detect one-candle formations using explicit proportions. Context such as a
 * trend, zone, or swing location is deliberately evaluated by the indicator,
 * not fabricated inside this pure candle detector.
 */
export function detectRejectionCandle(candle: Candle): CandlePatternResult {
  const anatomy = getCandleAnatomy(candle);

  if (isMarubozu(anatomy)) {
    return anatomy.bullish
      ? {
        pattern: "bullish-marubozu",
        visualState: "bullish-displacement",
        anatomy,
        explanation: "Large bullish body with minimal upper and lower wicks.",
      }
      : anatomy.bearish
        ? {
          pattern: "bearish-marubozu",
          visualState: "bearish-displacement",
          anatomy,
          explanation: "Large bearish body with minimal upper and lower wicks.",
        }
        : noPattern(anatomy, "A doji-like candle is not a directional marubozu.");
  }

  const hammerShape = anatomy.lowerWick >= Math.max(anatomy.body * 2, EPSILON) &&
    anatomy.upperWick <= Math.max(anatomy.body, EPSILON) &&
    anatomy.closePosition >= 0.65;
  if (hammerShape) {
    return anatomy.bearish
      ? {
        pattern: "hanging-man",
        visualState: "hanging-man-candidate",
        anatomy,
        explanation: "Long lower wick, compact body, and a close in the upper part of the range; bearish body is classified as a hanging-man candidate.",
      }
      : {
        pattern: "hammer",
        visualState: "hammer-candidate",
        anatomy,
        explanation: "Long lower wick, compact body, and a close in the upper part of the candle range.",
      };
  }

  const upperWickShape = anatomy.upperWick >= Math.max(anatomy.body * 2, EPSILON) &&
    anatomy.lowerWick <= Math.max(anatomy.body, EPSILON);
  if (upperWickShape && anatomy.closePosition <= 0.35) {
    return {
      pattern: "shooting-star",
      visualState: "shooting-star-candidate",
      anatomy,
      explanation: "Long upper wick, compact body, and a close in the lower part of the candle range.",
    };
  }
  if (upperWickShape && anatomy.closePosition >= 0.35) {
    return {
      pattern: "inverted-hammer",
      visualState: "inverted-hammer-candidate",
      anatomy,
      explanation: "Long upper wick, compact body, and a close in the upper half of the candle range.",
    };
  }

  return noPattern(anatomy, "No configured one-candle proportions were met.");
}

/** Detect a two-candle body engulfing pattern. */
export function detectEngulfing(previous: Candle, current: Candle): CandlePatternResult {
  const anatomy = getCandleAnatomy(current);
  const previousAnatomy = getCandleAnatomy(previous);
  const bullish = previousAnatomy.bearish && anatomy.bullish &&
    current.open <= previous.close && current.close >= previous.open;
  const bearish = previousAnatomy.bullish && anatomy.bearish &&
    current.open >= previous.close && current.close <= previous.open;

  if (bullish) {
    return {
      pattern: "bullish-engulfing",
      visualState: "bullish-confirmed",
      anatomy,
      explanation: "The bullish body covers the previous bearish candle body.",
    };
  }
  if (bearish) {
    return {
      pattern: "bearish-engulfing",
      visualState: "bearish-confirmed",
      anatomy,
      explanation: "The bearish body covers the previous bullish candle body.",
    };
  }
  return noPattern(anatomy, "The current candle does not engulf the previous candle body.");
}

/**
 * Detect the three-candle morning-star or evening-star sequence. Crypto often
 * has no traditional overnight gap, so the middle candle is defined by its
 * compact body rather than a required gap.
 */
export function detectStarPattern(
  first: Candle,
  middle: Candle,
  third: Candle,
): CandlePatternResult {
  const firstAnatomy = getCandleAnatomy(first);
  const middleAnatomy = getCandleAnatomy(middle);
  const thirdAnatomy = getCandleAnatomy(third);
  const middleIsSmall = middleAnatomy.bodyRatio <= STAR_MAX_MIDDLE_BODY_RATIO;
  const firstBodyMidpoint = (first.open + first.close) / 2;
  const morningStar = firstAnatomy.bearish && middleIsSmall && thirdAnatomy.bullish &&
    third.close > firstBodyMidpoint;
  const eveningStar = firstAnatomy.bullish && middleIsSmall && thirdAnatomy.bearish &&
    third.close < firstBodyMidpoint;

  if (morningStar) {
    return {
      pattern: "morning-star",
      visualState: "morning-star-confirmed",
      anatomy: thirdAnatomy,
      explanation: "Bearish pressure, a compact middle candle, and a bullish close above the first candle's body midpoint.",
    };
  }
  if (eveningStar) {
    return {
      pattern: "evening-star",
      visualState: "evening-star-confirmed",
      anatomy: thirdAnatomy,
      explanation: "Bullish pressure, a compact middle candle, and a bearish close below the first candle's body midpoint.",
    };
  }
  return noPattern(thirdAnatomy, "The three-candle sequence does not meet the configured morning-star or evening-star proportions.");
}

/** Classify the pattern confirmed on a candle using the available prior context. */
export function detectCandlePatternAt(
  candles: readonly Candle[],
  index: number,
): CandlePatternResult {
  const current = candles[index];
  if (!current) {
    return noPattern(getCandleAnatomy(candles[0] ?? {
      time: 0,
      open: 0,
      high: 0,
      low: 0,
      close: 0,
      volume: 0,
    }), "No candle is available at this index.");
  }

  if (index >= 2) {
    const star = detectStarPattern(candles[index - 2]!, candles[index - 1]!, current);
    if (star.pattern !== "none") return star;
  }
  if (index > 0) {
    const engulfing = detectEngulfing(candles[index - 1]!, current);
    if (engulfing.pattern !== "none") return engulfing;
  }
  return detectRejectionCandle(current);
}

export interface CandleSequenceResult {
  candidate: CandlePatternResult;
  confirmation: CandlePatternResult;
  confirmed: "long" | "short" | "none";
}

/** Evaluate a rejection candidate followed by its next closed candle. */
export function analyzeCandleSequence(candidate: Candle, confirmation: Candle): CandleSequenceResult {
  const candidateResult = detectRejectionCandle(candidate);
  const confirmationResult = detectEngulfing(candidate, confirmation);
  const confirmed = (candidateResult.pattern === "hammer" || candidateResult.pattern === "hanging-man") && confirmationResult.pattern === "bullish-engulfing"
    ? "long"
    : candidateResult.pattern === "shooting-star" && confirmationResult.pattern === "bearish-engulfing"
      ? "short"
      : "none";
  return { candidate: candidateResult, confirmation: confirmationResult, confirmed };
}
