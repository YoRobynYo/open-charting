import { describe, expect, it } from "vitest";
import type { IctCandle } from "../lib/chart-plugins/ict-analysis/ict-analysis.ts";
import { detectStructureBreaks, stepWordsByTime, type StructureBreak } from "../lib/chart-plugins/character-candles/structure-breaks.ts";
import { drawLabels, drawStructureBreaks, resolveIct6Visibility, structureStepColor } from "../lib/chart-plugins/character-candles/character-candles.ts";

describe("ICT 6 zoom visibility", () => {
  it("hides tiny sprites while keeping names and BOS/CHoCH visible", () => {
    expect(resolveIct6Visibility(5, { minBarSpacingPx: 8, showLabels: true, showStructure: true }))
      .toEqual({ characters: false, labels: true, structure: true });
  });
});

describe("ICT 6 trade-step colors", () => {
  it("uses green for bullish Trade and red for bearish Trade, without changing Retest/Hold colors", () => {
    expect(structureStepColor({ kind: "trade", direction: "bullish", text: "Trade ▲" })).toBe("#22c55e");
    expect(structureStepColor({ kind: "trade", direction: "bearish", text: "Trade ▼" })).toBe("#f43f5e");
    expect(structureStepColor({ kind: "retest", direction: "bullish", text: "Retest" })).toBe("#38bdf8");
    expect(structureStepColor({ kind: "hold", direction: "bearish", text: "Hold" })).toBe("#fbbf24");
  });
});

/** Straight-line waves between turning points, one candle per step, one second apart. */
function waveCandles(turningPoints: Array<[number, number]>, length: number, step = 1): IctCandle[] {
  const levels = Array.from({ length }, () => 100);
  for (let segment = 0; segment < turningPoints.length - 1; segment += 1) {
    const [startIndex, startLevel] = turningPoints[segment]!;
    const [endIndex, endLevel] = turningPoints[segment + 1]!;
    for (let index = startIndex; index <= endIndex; index += 1) {
      const progress = (index - startIndex) / (endIndex - startIndex);
      levels[index] = startLevel + (endLevel - startLevel) * progress;
    }
  }
  return levels.map((level, index) => ({
    time: (index + 1) * step,
    open: level,
    high: level + 1,
    low: level - 1,
    close: level,
  }));
}

const WAVE: Array<[number, number]> = [[0, 100], [6, 120], [12, 100], [18, 130], [24, 90], [30, 95]];

describe("detectStructureBreaks", () => {
  it("calls a break with the trend BOS and the first break against it CHoCH", () => {
    const breaks = detectStructureBreaks(waveCandles(WAVE, 31), { strength: 3 });

    expect(breaks.length).toBeGreaterThanOrEqual(2);
    const first = breaks[0]!;
    expect(first.kind).toBe("BOS");
    expect(first.direction).toBe("bullish");
    const reversal = breaks.find((b) => b.direction === "bearish");
    expect(reversal?.kind).toBe("CHoCH");
  });

  it("anchors each break to its swing and to the candle that closed through it", () => {
    const breaks = detectStructureBreaks(waveCandles(WAVE, 31), { strength: 3 });

    for (const b of breaks) {
      expect(b.startTime).toBeLessThan(b.time);
      expect(Number.isFinite(b.price)).toBe(true);
    }
  });

  it("ignores the candle that is still forming", () => {
    const candles = waveCandles(WAVE, 31);
    const firstTime = detectStructureBreaks(candles, { strength: 3 })[0]!.time;
    const index = candles.findIndex((c) => c.time === firstTime);

    const whileForming = detectStructureBreaks(candles.slice(0, index + 1), { strength: 3 });
    const afterClose = detectStructureBreaks(candles.slice(0, index + 2), { strength: 3 });

    expect(whileForming.some((b) => b.time === firstTime)).toBe(false);
    expect(afterClose.some((b) => b.time === firstTime)).toBe(true);
  });

  it("drops breaks older than the lookback", () => {
    const candles = waveCandles(WAVE, 31);
    const all = detectStructureBreaks(candles, { strength: 3 });
    const recent = detectStructureBreaks(candles, { strength: 3, lookbackSeconds: 8 });

    expect(recent.length).toBeLessThan(all.length);
    expect(recent.every((b) => b.startTime >= 31 - 8)).toBe(true);
  });

  it("returns nothing for an empty or tiny series", () => {
    expect(detectStructureBreaks([])).toEqual([]);
    expect(detectStructureBreaks(waveCandles([[0, 100], [2, 101]], 3))).toEqual([]);
  });
});

describe("retest, hold and trade", () => {
  const candle = (time: number, open: number, high: number, low: number, close: number): IctCandle =>
    ({ time, open, high, low, close });
  const away = (time: number) => candle(time, 126, 128, 125, 127);
  const retest = (time: number) => candle(time, 127, 127, 120, 123);
  const holding = (time: number) => candle(time, 123, 125, 122, 124);
  /** Everything up to and including the bullish BOS at time 18, then the given candles and one still forming. */
  const bullishAfterBreak = (tail: IctCandle[]) => [
    ...waveCandles(WAVE, 31).slice(0, 18),
    ...tail,
    candle(18 + tail.length + 1, 126, 127, 125, 126),
  ];
  const mirror = (candles: IctCandle[]): IctCandle[] => candles.map((c) => ({
    time: c.time,
    open: 200 - c.open,
    high: 200 - c.low,
    low: 200 - c.high,
    close: 200 - c.close,
  }));
  const bosAt18 = (candles: IctCandle[], direction: "bullish" | "bearish") =>
    detectStructureBreaks(candles, { strength: 3 }).find((b) => b.time === 18 && b.direction === direction);

  it("walks through retest, hold and trade on consecutive candles", () => {
    const b = bosAt18(bullishAfterBreak([away(19), retest(20), holding(21), away(22)]), "bullish");

    expect(b?.price).toBe(121);
    expect(b?.retest).toEqual({ time: 20 });
    expect(b?.hold).toEqual({ time: 21 });
    expect(b?.trade).toEqual({ time: 22 });
  });

  it("has nothing while price stays away from the level", () => {
    const b = bosAt18(bullishAfterBreak([away(19), away(20)]), "bullish");

    expect(b).toBeDefined();
    expect(b?.retest).toBeUndefined();
    expect(b?.hold).toBeUndefined();
    expect(b?.trade).toBeUndefined();
  });

  it("does not count a touch that closes back through the level", () => {
    const b = bosAt18(bullishAfterBreak([away(19), candle(20, 127, 127, 118, 119)]), "bullish");

    expect(b?.retest).toBeUndefined();
  });

  it("waits for the next candle before calling it a hold", () => {
    const b = bosAt18(bullishAfterBreak([away(19), retest(20)]), "bullish");

    expect(b?.retest).toEqual({ time: 20 });
    expect(b?.hold).toBeUndefined();
    expect(b?.trade).toBeUndefined();
  });

  it("drops the hold and the trade when the next candle closes through the level", () => {
    const b = bosAt18(bullishAfterBreak([away(19), retest(20), candle(21, 123, 123, 117, 118), away(22)]), "bullish");

    expect(b?.retest).toEqual({ time: 20 });
    expect(b?.hold).toBeUndefined();
    expect(b?.trade).toBeUndefined();
  });

  it("puts the trade on the candle that is still forming", () => {
    const b = bosAt18(bullishAfterBreak([away(19), retest(20), holding(21)]), "bullish");

    expect(b?.hold).toEqual({ time: 21 });
    expect(b?.trade).toEqual({ time: 22 });
  });

  it("only looks eight candles past the break for the retest", () => {
    const seven = Array.from({ length: 7 }, (_, i) => away(19 + i));

    expect(bosAt18(bullishAfterBreak([...seven, retest(26), holding(27)]), "bullish")?.retest?.time).toBe(26);
    expect(bosAt18(bullishAfterBreak([...seven, away(26), retest(27), holding(28)]), "bullish")?.retest).toBeUndefined();
  });

  it("works the same way down for a bearish break", () => {
    const b = bosAt18(mirror(bullishAfterBreak([away(19), retest(20), holding(21), away(22)])), "bearish");

    expect(b?.price).toBe(79);
    expect(b?.retest).toEqual({ time: 20 });
    expect(b?.hold).toEqual({ time: 21 });
    expect(b?.trade).toEqual({ time: 22 });
  });
});

describe("stepWordsByTime", () => {
  const base: StructureBreak = { kind: "BOS", direction: "bullish", time: 10, startTime: 5, price: 100 };

  it("lists each step under its own candle, with an arrow on the trade", () => {
    const words = stepWordsByTime([{ ...base, retest: { time: 11 }, hold: { time: 12 }, trade: { time: 13 } }]);

    expect(words.get(11)?.map((w) => w.text)).toEqual(["Retest"]);
    expect(words.get(12)?.map((w) => w.text)).toEqual(["Hold"]);
    expect(words.get(13)?.map((w) => w.text)).toEqual(["Trade \u25B2"]);
  });

  it("points the trade down for a bearish break", () => {
    const words = stepWordsByTime([{ ...base, direction: "bearish", trade: { time: 13 } }]);

    expect(words.get(13)?.[0]?.text).toBe("Trade \u25BC");
  });

  it("stacks steps that land on the same candle in the order they happen", () => {
    const words = stepWordsByTime([
      { ...base, hold: { time: 12 } },
      { ...base, time: 8, retest: { time: 12 } },
    ]);

    expect(words.get(12)?.map((w) => w.kind).sort()).toEqual(["hold", "retest"]);
  });

  it("does not repeat a word on one candle", () => {
    const words = stepWordsByTime([
      { ...base, retest: { time: 11 } },
      { ...base, time: 9, retest: { time: 11 } },
    ]);

    expect(words.get(11)).toHaveLength(1);
  });

  it("returns nothing when no break has a step", () => {
    expect(stepWordsByTime([base]).size).toBe(0);
  });
});

describe("drawStructureBreaks", () => {
  /** A canvas context that records what is drawn instead of drawing it. */
  function recorder() {
    const calls: string[] = [];
    const sets: Record<string, unknown> = {};
    const ctx = new Proxy({} as Record<string, unknown>, {
      get(_target, key: string) {
        if (key === "measureText") return () => ({ width: 20 });
        return (...args: unknown[]) => { calls.push(`${key}:${JSON.stringify(args)}`); };
      },
      set(_target, key: string, value) {
        sets[key] = value;
        return true;
      },
    }) as unknown as CanvasRenderingContext2D;
    return { ctx, calls, sets };
  }

  const chart = {
    timeScale: () => ({ timeToCoordinate: (t: number) => (t === 999 ? null : t * 10) }),
  };
  const series = { priceToCoordinate: (p: number) => 500 - p };
  const view = (width = 1000, height = 600) => ({
    chart: chart as never,
    series: series as never,
    hpr: 1,
    vpr: 1,
    width,
    height,
    fontPx: 11,
  });
  const bos: StructureBreak = { kind: "BOS", direction: "bullish", time: 20, startTime: 10, price: 120 };
  const choch: StructureBreak = { kind: "CHoCH", direction: "bearish", time: 40, startTime: 30, price: 90 };

  it("draws a line, two dots and a word for each visible break", () => {
    const { ctx, calls } = recorder();
    drawStructureBreaks(ctx, [bos, choch], view());

    expect(calls.filter((c) => c.startsWith("stroke:"))).toHaveLength(2);
    expect(calls.filter((c) => c.startsWith("arc:"))).toHaveLength(4);
    expect(calls.filter((c) => c.startsWith("fillText:")).map((c) => JSON.parse(c.slice(9))[0]))
      .toEqual(["BOS", "CHoCH"]);
  });

  it("dashes a CHoCH and keeps a BOS solid", () => {
    const { ctx, calls } = recorder();
    drawStructureBreaks(ctx, [bos, choch], view());

    // Each break sets its pattern and then clears it, so only the CHoCH leaves a real dash.
    const patterns = calls.filter((c) => c.startsWith("setLineDash:") && c !== "setLineDash:[[]]");
    expect(patterns).toEqual(["setLineDash:[[4,3]]"]);
  });

  it("colours bullish green and bearish red", () => {
    const green = recorder();
    drawStructureBreaks(green.ctx, [bos], view());
    const red = recorder();
    drawStructureBreaks(red.ctx, [choch], view());

    expect(green.sets.strokeStyle).toBe("#22c55e");
    expect(red.sets.strokeStyle).toBe("#f43f5e");
  });

  it("skips breaks that are off screen or have no position", () => {
    const { ctx, calls } = recorder();
    const unknownTime: StructureBreak = { ...bos, time: 999 };
    const offScreen: StructureBreak = { ...bos, startTime: 500, time: 600 };
    drawStructureBreaks(ctx, [unknownTime, offScreen], view(1000));

    expect(calls.filter((c) => c.startsWith("stroke:"))).toHaveLength(0);
  });

  it("draws nothing when there are no breaks", () => {
    const { ctx, calls } = recorder();
    drawStructureBreaks(ctx, [], view());

    expect(calls).toEqual([]);
  });

  it("stacks overlapping BOS/CHoCH tags instead of drawing them on top of each other", () => {
    const { ctx } = recorder();
    const sameLevelChoch: StructureBreak = { ...bos, kind: "CHoCH" };
    const boxes = drawStructureBreaks(ctx, [bos, sameLevelChoch], view());

    expect(boxes).toHaveLength(2);
    const [a, b] = boxes as [typeof boxes[number], typeof boxes[number]];
    const overlaps = a.left < b.right + 2 && a.right > b.left - 2 && a.top < b.bottom + 2 && a.bottom > b.top - 2;
    expect(overlaps).toBe(false);
  });

  const withRetest = (b: StructureBreak, time = 30): StructureBreak => ({ ...b, retest: { time } });

  it("rings the retest candle and carries the level on to it", () => {
    const plain = recorder();
    drawStructureBreaks(plain.ctx, [bos], view());
    const rung = recorder();
    drawStructureBreaks(rung.ctx, [withRetest(bos)], view());

    const count = (calls: string[], name: string) => calls.filter((c) => c.startsWith(`${name}:`)).length;
    expect(count(rung.calls, "arc")).toBe(count(plain.calls, "arc") + 1);
    expect(count(rung.calls, "stroke")).toBe(count(plain.calls, "stroke") + 2);
  });

  it("leaves the words to the candle tags", () => {
    const { ctx, calls } = recorder();
    drawStructureBreaks(ctx, [{ ...withRetest(bos), hold: { time: 40 }, trade: { time: 50 } }], view());

    expect(calls.filter((c) => c.startsWith("fillText:")).map((c) => JSON.parse(c.slice(9))[0])).toEqual(["BOS"]);
  });

  it("skips the ring when the retest candle has no position", () => {
    const plain = recorder();
    drawStructureBreaks(plain.ctx, [bos], view());
    const { ctx, calls } = recorder();
    drawStructureBreaks(ctx, [withRetest(bos, 999)], view());

    expect(calls).toEqual(plain.calls);
  });
});

describe("candle tags with steps", () => {
  function recordText(labels: Parameters<typeof drawLabels>[1]) {
    const texts: string[] = [];
    const yPositions: number[] = [];
    const ctx = new Proxy({} as Record<string, unknown>, {
      get(_t, key: string) {
        if (key === "measureText") return () => ({ width: 30 });
        if (key === "fillText") return (text: string, _x: number, y: number) => { texts.push(text); yPositions.push(y); };
        return () => undefined;
      },
      set: () => true,
    }) as unknown as CanvasRenderingContext2D;
    drawLabels(ctx, labels, { hpr: 1, vpr: 1, width: 800, height: 600, fontPx: 11, leadPx: 10 });
    return { texts, yPositions };
  }
  const spot = { x: 400, yHigh: 300, yLow: 320, color: "#fff" };

  it("lists the steps under the pattern name", () => {
    const { texts } = recordText([{
      ...spot,
      text: "Engulfing",
      steps: [{ text: "Retest", color: "#38bdf8" }, { text: "Hold", color: "#fbbf24" }],
    }]);

    expect(texts).toEqual(["Engulfing", "Retest", "Hold"]);
  });

  it("leaves a small gap between the candle name and attached structure steps", () => {
    const { yPositions } = recordText([{
      ...spot,
      text: "Shooting Star",
      steps: [{ text: "Retest", color: "#38bdf8" }],
    }]);

    expect(yPositions[1]! - yPositions[0]!).toBeCloseTo(11 * 1.15);
    expect(yPositions[2]! - yPositions[1]!).toBeCloseTo(11 * 1.15 + 3);
  });

  it("makes a small tag from the steps alone when the candle has no name", () => {
    const { texts } = recordText([{ ...spot, text: "", steps: [{ text: "Hold", color: "#fbbf24" }] }]);

    expect(texts).toEqual(["Hold"]);
  });

  it("wraps a two-word name one word per line above its steps", () => {
    const { texts } = recordText([{ ...spot, text: "Shooting Star", steps: [{ text: "Hold", color: "#fbbf24" }] }]);

    expect(texts).toEqual(["Shooting", "Star", "Hold"]);
  });

  it("moves a candle tag away from an actual BOS tag box", () => {
    const ctx = new Proxy({} as Record<string, unknown>, {
      get(_t, key: string) {
        if (key === "measureText") return () => ({ width: 30 });
        return () => undefined;
      },
      set: () => true,
    }) as unknown as CanvasRenderingContext2D;
    const view = { hpr: 1, vpr: 1, width: 800, height: 600, fontPx: 11, leadPx: 10 };
    const structureBoxes = drawStructureBreaks(ctx, [
      { kind: "BOS", direction: "bullish", time: 20, startTime: 10, price: 120 },
    ], {
      chart: { timeScale: () => ({ timeToCoordinate: (time: number) => time * 10 }) } as never,
      series: { priceToCoordinate: (price: number) => 500 - price } as never,
      hpr: 1,
      vpr: 1,
      width: 800,
      height: 600,
      fontPx: 11,
    });
    const label = [{ ...spot, x: 150, yHigh: 394, yLow: 420, text: "Hammer" }];
    const moved = drawLabels(ctx, label, view, structureBoxes);

    expect(structureBoxes).toHaveLength(1);
    expect(moved).toHaveLength(1);
    const a = structureBoxes[0]!;
    const b = moved[0]!;
    const overlaps = a.left < b.right + 2 && a.right > b.left - 2 && a.top < b.bottom + 2 && a.bottom > b.top - 2;
    expect(overlaps).toBe(false);
  });
});
