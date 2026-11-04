import type { CanvasRenderingTarget2D } from "fancy-canvas";
import type {
  DataChangedScope,
  ISeriesPrimitivePaneRenderer,
  ISeriesPrimitivePaneView,
  ITimeScaleApi,
  Range,
  Time,
} from "lightweight-charts";
import { PluginBase } from "../plugin-base";
import { layoutAnnotationLabels } from "../annotation-label-layout.ts";

export interface IctCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export type IctEventKind = "swing-high" | "swing-low" | "bos" | "choch" | "fvg" | "ifvg";
export type IctDirection = "bullish" | "bearish";

export interface IctEvent {
  id: string;
  kind: IctEventKind;
  direction: IctDirection;
  time: number;
  startTime?: number;
  endTime?: number;
  price?: number;
  zoneLow?: number;
  zoneHigh?: number;
}

export interface IctAnalysisOptions {
  swingStrength?: number;
  excludeLastBar?: boolean;
}

const DEFAULT_SWING_STRENGTH = 2;
const MAX_RENDERED_EVENTS = 700;

/**
 * Detects confirmed two-sided pivots, close-confirmed structure breaks, and
 * three-candle fair-value gaps. An FVG flips to an iFVG when a candle closes
 * through its far boundary; a fully filled, non-inverted gap stops extending.
 */
export function detectIctEvents(
  candles: readonly IctCandle[],
  swingStrength = DEFAULT_SWING_STRENGTH,
): IctEvent[] {
  if (candles.length < swingStrength * 2 + 1) return [];
  const events: IctEvent[] = [];
  const pivots: Array<{ index: number; kind: "swing-high" | "swing-low"; price: number }> = [];

  for (let i = swingStrength; i < candles.length - swingStrength; i += 1) {
    const current = candles[i]!;
    let isHigh = true;
    let isLow = true;
    for (let offset = 1; offset <= swingStrength; offset += 1) {
      const left = candles[i - offset]!;
      const right = candles[i + offset]!;
      // Ties resolve to the earliest bar in a plateau; one strict side avoids
      // drawing duplicate swing labels for equal adjacent highs/lows.
      if (current.high <= left.high || current.high < right.high) isHigh = false;
      if (current.low >= left.low || current.low > right.low) isLow = false;
    }
    if (isHigh) {
      pivots.push({ index: i, kind: "swing-high", price: current.high });
      events.push({
        id: `swing-high-${current.time}`,
        kind: "swing-high",
        direction: "bearish",
        time: current.time,
        price: current.high,
      });
    }
    if (isLow) {
      pivots.push({ index: i, kind: "swing-low", price: current.low });
      events.push({
        id: `swing-low-${current.time}`,
        kind: "swing-low",
        direction: "bullish",
        time: current.time,
        price: current.low,
      });
    }
  }

  let bias: IctDirection | null = null;
  let activeHigh: (typeof pivots)[number] | undefined;
  let activeLow: (typeof pivots)[number] | undefined;
  let brokenHighIndex = -1;
  let brokenLowIndex = -1;
  let pivotCursor = 0;

  for (let i = 1; i < candles.length; i += 1) {
    while (pivotCursor < pivots.length && pivots[pivotCursor]!.index < i) {
      const pivot = pivots[pivotCursor]!;
      if (pivot.kind === "swing-high") activeHigh = pivot;
      else activeLow = pivot;
      pivotCursor += 1;
    }
    const previous = candles[i - 1]!;
    const current = candles[i]!;
    if (activeHigh && activeHigh.index !== brokenHighIndex &&
        previous.close <= activeHigh.price && current.close > activeHigh.price) {
      const kind = bias === "bearish" ? "choch" : "bos";
      events.push({
        id: `${kind}-bullish-${current.time}`,
        kind,
        direction: "bullish",
        time: current.time,
        startTime: candles[activeHigh.index]!.time,
        price: activeHigh.price,
      });
      bias = "bullish";
      brokenHighIndex = activeHigh.index;
    }
    if (activeLow && activeLow.index !== brokenLowIndex &&
        previous.close >= activeLow.price && current.close < activeLow.price) {
      const kind = bias === "bullish" ? "choch" : "bos";
      events.push({
        id: `${kind}-bearish-${current.time}`,
        kind,
        direction: "bearish",
        time: current.time,
        startTime: candles[activeLow.index]!.time,
        price: activeLow.price,
      });
      bias = "bearish";
      brokenLowIndex = activeLow.index;
    }
  }

  for (let i = 0; i < candles.length - 2; i += 1) {
    const first = candles[i]!;
    const third = candles[i + 2]!;
    const bullishGap = third.low > first.high;
    const bearishGap = third.high < first.low;
    if (!bullishGap && !bearishGap) continue;

    const originalDirection: IctDirection = bullishGap ? "bullish" : "bearish";
    const zoneLow = bullishGap ? first.high : third.high;
    const zoneHigh = bullishGap ? third.low : first.low;
    let kind: "fvg" | "ifvg" = "fvg";
    let direction = originalDirection;
    let endTime: number | undefined;

    for (let j = i + 3; j < candles.length; j += 1) {
      const later = candles[j]!;
      const invalidated = originalDirection === "bullish"
        ? later.close < zoneLow
        : later.close > zoneHigh;
      if (invalidated) {
        kind = "ifvg";
        direction = originalDirection === "bullish" ? "bearish" : "bullish";
      }
      const fullyFilled = originalDirection === "bullish"
        ? later.low <= zoneLow
        : later.high >= zoneHigh;
      if (fullyFilled && !invalidated) {
        endTime = later.time;
        break;
      }
      if (kind === "ifvg") {
        const reclaimed = direction === "bearish"
          ? later.close > zoneHigh
          : later.close < zoneLow;
        if (reclaimed) {
          endTime = later.time;
          break;
        }
      }
    }

    events.push({
      id: `${kind}-${originalDirection}-${third.time}`,
      kind,
      direction,
      time: third.time,
      startTime: third.time,
      endTime: endTime ?? candles[candles.length - 1]!.time,
      zoneLow,
      zoneHigh,
    });
  }

  return events.sort((a, b) => a.time - b.time || a.id.localeCompare(b.id));
}

interface RenderEvent {
  kind: IctEventKind;
  direction: IctDirection;
  x: number;
  x2: number;
  labelX?: number;
  y: number;
  y2: number;
  label: string;
}

class IctPaneRenderer implements ISeriesPrimitivePaneRenderer {
  constructor(private readonly events: RenderEvent[]) {}

  draw(target: CanvasRenderingTarget2D): void {
    target.useBitmapCoordinateSpace((scope) => {
      const ctx = scope.context;
      ctx.save();
      ctx.scale(scope.horizontalPixelRatio, scope.verticalPixelRatio);
      ctx.font = "10px 'JetBrains Mono', monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const labelEvents = this.events.filter((event) =>
        event.kind === "swing-high" || event.kind === "swing-low");
      const labelPositions = layoutAnnotationLabels(
        labelEvents.map((event) => ({
          x: event.labelX ?? event.x,
          y: event.y,
          width: ctx.measureText(event.label).width + 10,
        })),
        {
          width: scope.bitmapSize.width / scope.horizontalPixelRatio,
          height: scope.bitmapSize.height / scope.verticalPixelRatio,
        },
      );
      const labelYByEvent = new Map(labelEvents.map((event, index) => [event, labelPositions[index]!.labelY]));

      for (const event of this.events) {
        const bullish = event.direction === "bullish";
        const color = bullish ? "#0ecb81" : "#f6465d";
        if (event.kind === "fvg" || event.kind === "ifvg") {
          const left = Math.min(event.x, event.x2);
          const right = Math.max(event.x, event.x2);
          const top = Math.min(event.y, event.y2);
          const bottom = Math.max(event.y, event.y2);
          ctx.fillStyle = bullish ? "rgba(14,203,129,0.10)" : "rgba(246,70,93,0.10)";
          ctx.strokeStyle = bullish ? "rgba(14,203,129,0.7)" : "rgba(246,70,93,0.7)";
          ctx.lineWidth = 1;
          ctx.setLineDash(event.kind === "ifvg" ? [4, 3] : []);
          ctx.fillRect(left, top, Math.max(1, right - left), Math.max(1, bottom - top));
          ctx.strokeRect(left, top, Math.max(1, right - left), Math.max(1, bottom - top));
          ctx.setLineDash([]);
          ctx.fillStyle = color;
          ctx.textAlign = "left";
          ctx.fillText(event.kind === "ifvg" ? "iFVG" : "FVG", left + 4, top + 8);
          ctx.textAlign = "center";
          continue;
        }

        if (event.kind === "bos" || event.kind === "choch") {
          ctx.strokeStyle = color;
          ctx.lineWidth = 1;
          ctx.setLineDash(event.kind === "choch" ? [4, 3] : []);
          ctx.beginPath();
          ctx.moveTo(event.x, event.y);
          ctx.lineTo(event.x2, event.y2);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = color;
          for (const endpointX of [event.x, event.x2]) {
            ctx.beginPath();
            ctx.arc(endpointX, event.y, 2.5, 0, Math.PI * 2);
            ctx.fill();
          }
          const label = event.kind.toUpperCase();
          const labelX = event.labelX ?? (event.x + event.x2) / 2;
          const labelY = (event.y + event.y2) / 2;
          const width = ctx.measureText(label).width + 8;
          ctx.fillStyle = "rgba(10,10,10,0.78)";
          ctx.fillRect(labelX - width / 2, labelY - 8, width, 16);
          ctx.fillStyle = color;
          ctx.fillText(label, labelX, labelY);
          continue;
        }

        ctx.fillStyle = color;
        const labelY = labelYByEvent.get(event) ?? event.y;
        ctx.fillText(event.label, event.x, labelY);
      }
      ctx.restore();
    });
  }
}

class IctPaneView implements ISeriesPrimitivePaneView {
  private rendered: RenderEvent[] = [];

  constructor(private readonly source: IctAnalysis) {}

  update(): void {
    const timeScale = this.source.chart.timeScale();
    const series = this.source.series;
    const width = timeScale.width();
    const visibleRange = timeScale.getVisibleRange();
    const events = this.source.events().slice(-MAX_RENDERED_EVENTS);
    this.rendered = [];

    for (const event of events) {
      if (event.kind === "swing-high" || event.kind === "swing-low") {
        if (event.price === undefined) continue;
        const x = timeScale.timeToCoordinate(event.time as Time);
        const priceY = series.priceToCoordinate(event.price);
        if (x === null || priceY === null) continue;
        this.rendered.push({
          kind: event.kind,
          direction: event.direction,
          x,
          x2: x,
          y: priceY + (event.kind === "swing-high" ? -11 : 11),
          y2: priceY,
          label: event.kind === "swing-high" ? "SH" : "SL",
        });
        continue;
      }

      if ((event.kind === "bos" || event.kind === "choch") && event.price !== undefined) {
        const start = event.startTime ?? event.time;
        const x1 = coordinateOrEdge(timeScale, start, visibleRange, width, "left");
        const x2 = coordinateOrEdge(timeScale, event.time, visibleRange, width, "right");
        const y = series.priceToCoordinate(event.price);
        if (x1 === null || x2 === null || y === null) continue;
        const labelX = (x1 + x2) / 2;
        this.rendered.push({
          kind: event.kind,
          direction: event.direction,
          x: x1,
          x2,
          labelX,
          y,
          y2: y,
          label: event.kind.toUpperCase(),
        });
        continue;
      }

      if (event.zoneLow === undefined || event.zoneHigh === undefined) continue;
      const end = event.endTime ?? event.time;
      const x1 = coordinateOrEdge(timeScale, event.startTime ?? event.time, visibleRange, width, "left");
      const x2 = coordinateOrEdge(timeScale, end, visibleRange, width, "right");
      const y1 = series.priceToCoordinate(event.zoneHigh);
      const y2 = series.priceToCoordinate(event.zoneLow);
      if (x1 === null || x2 === null || y1 === null || y2 === null) continue;
      this.rendered.push({
        kind: event.kind,
        direction: event.direction,
        x: x1,
        x2,
        labelX: x1,
        y: y1,
        y2,
        label: event.kind.toUpperCase(),
      });
    }
  }

  renderer(): ISeriesPrimitivePaneRenderer {
    return new IctPaneRenderer(this.rendered);
  }

  zOrder(): "top" {
    return "top";
  }
}

function coordinateOrEdge(
  timeScale: ITimeScaleApi<Time>,
  time: number,
  visibleRange: Range<Time> | null,
  width: number,
  edge: "left" | "right",
): number | null {
  const coordinate = timeScale.timeToCoordinate(time as Time);
  if (coordinate !== null) return coordinate;
  if (!visibleRange) return null;
  const from = visibleRange.from as number;
  const to = visibleRange.to as number;
  if (time < from) return 0;
  if (time > to) return width;
  return edge === "left" ? 0 : width;
}

export class IctAnalysis extends PluginBase {
  private readonly paneView: IctPaneView;
  private detected: IctEvent[] = [];
  private readonly swingStrength: number;
  private readonly excludeLastBar: boolean;

  constructor(options: IctAnalysisOptions = {}) {
    super();
    this.swingStrength = options.swingStrength ?? DEFAULT_SWING_STRENGTH;
    this.excludeLastBar = options.excludeLastBar ?? true;
    this.paneView = new IctPaneView(this);
  }

  events(): readonly IctEvent[] {
    return this.detected;
  }

  paneViews(): readonly ISeriesPrimitivePaneView[] {
    return [this.paneView];
  }

  updateAllViews(): void {
    this.paneView.update();
  }

  override attached(param: Parameters<PluginBase["attached"]>[0]): void {
    super.attached(param);
    this.recompute();
  }

  protected override dataUpdated(_scope: DataChangedScope): void {
    this.recompute();
    this.requestUpdate();
  }

  private recompute(): void {
    const candles = this.series.data() as unknown as IctCandle[];
    this.detected = detectIctEvents(
      this.excludeLastBar ? candles.slice(0, -1) : candles,
      this.swingStrength,
    );
  }
}
