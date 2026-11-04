import { describe, expect, it } from "vitest";
import { layoutAnnotationLabels } from "../lib/chart-plugins/annotation-label-layout.ts";

describe("layoutAnnotationLabels", () => {
  it("moves labels away from overlapping annotations without changing their anchor coordinates", () => {
    const labels = [
      { x: 100, y: 80, width: 30 },
      { x: 104, y: 81, width: 34 },
      { x: 101, y: 82, width: 28 },
    ];

    const placed = layoutAnnotationLabels(labels, { width: 300, height: 200 });

    expect(placed.map(({ x, y }) => [x, y])).toEqual(labels.map(({ x, y }) => [x, y]));
    expect(new Set(placed.map(({ labelY }) => labelY)).size).toBe(labels.length);
    expect(placed.every(({ labelY }) => labelY >= 8 && labelY <= 192)).toBe(true);
  });

  it("keeps horizontally separated labels on their original row", () => {
    const placed = layoutAnnotationLabels([
      { x: 30, y: 50, width: 25 },
      { x: 250, y: 50, width: 25 },
    ], { width: 300, height: 200 });

    expect(placed.map(({ labelY }) => labelY)).toEqual([50, 50]);
  });
});
