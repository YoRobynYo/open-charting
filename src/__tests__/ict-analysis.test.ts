import { describe, expect, it } from "vitest";
import {
  detectIctEvents,
  selectRecentSwingLabelIds,
  type IctCandle,
  type IctEvent,
} from "../lib/chart-plugins/ict-analysis/ict-analysis.ts";

function candles(rows: Array<[number, number, number, number, number]>): IctCandle[] {
  return rows.map(([time, open, high, low, close]) => ({ time, open, high, low, close }));
}

describe("detectIctEvents", () => {
  it("marks two-bar-confirmed swing highs and lows", () => {
    const data = candles([
      [1, 5, 6, 4, 5],
      [2, 6, 8, 5, 7],
      [3, 7, 10, 6, 8],
      [4, 7, 8, 5, 6],
      [5, 6, 7, 4, 5],
      [6, 5, 6, 2, 4],
      [7, 4, 7, 3, 5],
      [8, 5, 8, 4, 6],
    ]);

    const events = detectIctEvents(data);
    expect(events).toContainEqual(expect.objectContaining({ kind: "swing-high", time: 3, price: 10 }));
    expect(events).toContainEqual(expect.objectContaining({ kind: "swing-low", time: 6, price: 2 }));
  });

  it("keeps only the latest swing high and low labels in the visible range", () => {
    const swing = (id: string, time: number, kind: "swing-high" | "swing-low"): IctEvent => ({
      id,
      time,
      kind,
      direction: kind === "swing-high" ? "bearish" : "bullish",
      price: time,
    });
    const events = [
      swing("high-4", 4, "swing-high"),
      swing("low-7", 7, "swing-low"),
      swing("high-1", 1, "swing-high"),
      swing("low-2", 2, "swing-low"),
      swing("high-3", 3, "swing-high"),
      swing("low-4", 4, "swing-low"),
      swing("high-8", 8, "swing-high"),
    ];

    expect([...selectRecentSwingLabelIds(events, 2, 7)]).toEqual([
      "high-4",
      "low-7",
    ]);
  });

  it("uses candle closes to identify a break of structure", () => {
    const data = candles([
      [1, 3, 4, 2, 3],
      [2, 4, 6, 3, 5],
      [3, 6, 10, 5, 8],
      [4, 7, 8, 4, 7],
      [5, 7, 9, 6, 9],
      [6, 9, 12, 8, 11],
      [7, 10, 11, 9, 10],
    ]);

    expect(detectIctEvents(data)).toContainEqual(
      expect.objectContaining({ kind: "bos", direction: "bullish", time: 6, price: 10, startTime: 3 }),
    );
  });

  it("marks a reversal break as a change of character", () => {
    const data = candles([
      [1, 3, 4, 2, 3],
      [2, 4, 6, 3, 5],
      [3, 6, 10, 5, 8],
      [4, 7, 8, 4, 7],
      [5, 7, 9, 6, 9],
      [6, 9, 12, 7, 11],
      [7, 10, 11, 6, 8],
      [8, 7, 9, 3, 4],
      [9, 5, 8, 4, 5],
      [10, 7, 9, 5, 8],
      [11, 8, 9, 2, 2],
    ]);

    expect(detectIctEvents(data)).toContainEqual(
      expect.objectContaining({ kind: "choch", direction: "bearish", time: 11, price: 3 }),
    );
  });

  it("finds a three-candle bullish FVG and its inversion", () => {
    const data = candles([
      [1, 9, 10, 8, 9],
      [2, 11, 13, 10, 12],
      [3, 13, 14, 12, 13],
      [4, 12, 13, 11, 12],
      [5, 10, 11, 9, 9],
    ]);

    const event = detectIctEvents(data).find((candidate) => candidate.kind === "ifvg");
    expect(event).toMatchObject({
      kind: "ifvg",
      direction: "bearish",
      time: 3,
      zoneLow: 10,
      zoneHigh: 12,
    });
  });

  it("stops extending a non-inverted FVG after full wick mitigation", () => {
    const data = candles([
      [1, 9, 10, 8, 9],
      [2, 11, 13, 10, 12],
      [3, 13, 14, 12, 13],
      [4, 12, 13, 10, 12],
      [5, 11, 12, 9, 11],
    ]);

    expect(detectIctEvents(data)).toContainEqual(
      expect.objectContaining({ kind: "fvg", endTime: 4, zoneLow: 10, zoneHigh: 12 }),
    );
  });
});
