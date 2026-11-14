import type { Candle } from "../services/schemas.ts";

export type CandlePattern =
  | "hammer"
  | "shooting-star"
  | "bullish-engulfing"
  | "bearish-engulfing"
  | "none";

export type CandleVisualState =
  | "normal"
  | "hammer-candidate"
  | "shooting-star-candidate"
  | "bullish-confirmed"
  | "bearish-confirmed";

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

/**
 * Detect rejection-candle candidates using explicit proportions.
 * This is intentionally a candidate detector; it does not claim a trade setup.
 */
export function detectRejectionCandle(candle: Candle): CandlePatternResult {
  const anatomy = getCandleAnatomy(candle);
  const hammer = anatomy.lowerWick >= Math.max(anatomy.body * 2, EPSILON) &&
    anatomy.upperWick <= Math.max(anatomy.body, EPSILON) &&
    anatomy.closePosition >= 0.65;
  const shootingStar = anatomy.upperWick >= Math.max(anatomy.body * 2, EPSILON) &&
    anatomy.lowerWick <= Math.max(anatomy.body, EPSILON) &&
    anatomy.closePosition <= 0.35;

  if (hammer) {
    return {
      pattern: "hammer",
      visualState: "hammer-candidate",
      anatomy,
      explanation: "Long lower wick, compact body, and a close in the upper part of the candle range.",
    };
  }
  if (shootingStar) {
    return {
      pattern: "shooting-star",
      visualState: "shooting-star-candidate",
      anatomy,
      explanation: "Long upper wick, compact body, and a close in the lower part of the candle range.",
    };
  }
  return {
    pattern: "none",
    visualState: "normal",
    anatomy,
    explanation: "No configured rejection-candle proportions were met.",
  };
}

/**
 * Detect a two-candle body engulfing pattern. Wicks are not used for the body
 * engulfing test, and the current candle must be closed before this is called.
 */
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
  return {
    pattern: "none",
    visualState: "normal",
    anatomy,
    explanation: "The current candle does not engulf the previous candle body.",
  };
}

export interface CandleSequenceResult {
  candidate: CandlePatternResult;
  confirmation: CandlePatternResult;
  confirmed: "long" | "short" | "none";
}

/**
 * Evaluate a rejection candidate followed by its next closed candle.
 */
export function analyzeCandleSequence(candidate: Candle, confirmation: Candle): CandleSequenceResult {
  const candidateResult = detectRejectionCandle(candidate);
  const confirmationResult = detectEngulfing(candidate, confirmation);
  const confirmed = candidateResult.pattern === "hammer" && confirmationResult.pattern === "bullish-engulfing"
    ? "long"
    : candidateResult.pattern === "shooting-star" && confirmationResult.pattern === "bearish-engulfing"
      ? "short"
      : "none";
  return { candidate: candidateResult, confirmation: confirmationResult, confirmed };
}
