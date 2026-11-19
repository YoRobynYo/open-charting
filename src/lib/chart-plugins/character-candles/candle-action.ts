import type { CandleBias } from "./candle-story";

/** The step of an ICT Structure 4 trade setup that a pattern candle lines up with. */
export type CandleAction = "Sweep" | "Break" | "Hold";

interface SetupSteps {
  direction: "long" | "short";
  sweepTime?: number;
  breakTime?: number;
  retestTime?: number;
}

const STEPS: Array<[keyof Omit<SetupSteps, "direction">, CandleAction]> = [
  ["retestTime", "Hold"],
  ["breakTime", "Break"],
  ["sweepTime", "Sweep"],
];

/**
 * Says what a pattern candle is doing in a trade setup going the same way:
 * Hold (a retest held), Break (a swing level broke) or Sweep (liquidity was
 * taken). A candle counts as lined up if it is within `toleranceSeconds` of the
 * step, which is one candle either side when given the candle length. Later
 * steps win. Returns undefined when the candle is not part of any setup.
 */
export function actionForCandle(
  setups: readonly SetupSteps[],
  time: number,
  bias: CandleBias,
  toleranceSeconds: number,
): CandleAction | undefined {
  const wanted = bias === "bullish" ? "long" : "short";
  for (const [key, action] of STEPS) {
    const lined = setups.some((setup) => {
      const at = setup[key];
      return setup.direction === wanted && at !== undefined && Math.abs(at - time) <= toleranceSeconds;
    });
    if (lined) return action;
  }
  return undefined;
}
