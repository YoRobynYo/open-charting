import type { CanvasRenderingTarget2D } from "fancy-canvas";
import type {
  DataChangedScope,
  ISeriesPrimitivePaneRenderer,
  ISeriesPrimitivePaneView,
  ITimeScaleApi,
  Range,
  Time,
} from "lightweight-charts";
import type { Candle } from "../../../services/schemas.ts";
import { detectAiSwingStructure } from "../ai-analysis/ai-swing-structure.ts";
import { PluginBase } from "../plugin-base.ts";

export type LiquiditySide = "buy-side" | "sell-side";

export interface LiquidityLevel {
  id: string;
  side: LiquiditySide;
  price: number;
  time: number;
  equal: boolean;
  swept: boolean;
  sweepTime?: number;
  reclaimed: boolean;
}

export interface LiquidityAnalysisOptions {
  maxLevels?: number;
}

const MAX_LEVELS = 8;
const EQUAL_LEVEL_ATR_RATIO = 0.35;
const EQUAL_LEVEL_PRICE_RATIO = 0.0015;
const BUY_SIDE_COLOR = "#f5b942";
const SELL_SIDE_COLOR = "#38bdf8";
const SWEEP_COLOR = "#fb923c";
const RECLAIM_COLOR = "#22c55e";

function averageTrueRange(candles: readonly Candle[]): number {
  if (candles.length < 2) return 0;
  const ranges: number[] = [];
  for (let index = 1; index < candles.length; index += 1) {
    const current = candles[index]!;
    const previous = candles[index - 1]!;
    ranges.push(Math.max(
      current.high - current.low,
      Math.abs(current.high - previous.close),
      Math.abs(current.low - previous.close),
    ));
  }
  const recent = ranges.slice(-14);
  return recent.reduce((sum, range) => sum + range, 0) / recent.length;
}

function equalTolerance(price: number, atr: number): number {
  return Math.max(atr * EQUAL_LEVEL_ATR_RATIO, price * EQUAL_LEVEL_PRICE_RATIO);
}

function firstSweep(
  candles: readonly Candle[],
  level: Pick<LiquidityLevel, "side" | "price" | "time">,
): { time: number; reclaimed: boolean } | undefined {
  for (const candle of candles) {
    if (candle.time <= level.time) continue;
    const swept = level.side === "buy-side"
      ? candle.high > level.price && candle.close < level.price
      : candle.low < level.price && candle.close > level.price;
    if (swept) return { time: candle.time, reclaimed: true };
  }
  return undefined;
}

/**
 * Maps confirmed major swing points to educational buy-side/sell-side liquidity.
 * A sweep requires price to trade through the level and close back across it;
 * merely touching or breaking and holding beyond a level is not marked a sweep.
 */
export function detectLiquidityLevels(
  candles: readonly Candle[],
  options: LiquidityAnalysisOptions = {},
): LiquidityLevel[] {
  const closedCandles = candles.slice(-120, -1);
  if (closedCandles.length < 11) return [];

  const pivots = detectAiSwingStructure(candles)
    .filter((point) => point.kind === "structure-high" || point.kind === "structure-low")
    .map((point) => ({
      side: point.kind === "structure-high" ? "buy-side" as const : "sell-side" as const,
      price: point.price,
      time: point.time,
    }));
  if (pivots.length === 0) return [];

  const atr = averageTrueRange(closedCandles);
  const levels: LiquidityLevel[] = pivots.map((pivot) => ({
    id: `${pivot.side}-${pivot.time}`,
    ...pivot,
    equal: false,
    swept: false,
    reclaimed: false,
  }));

  for (let left = 0; left < levels.length; left += 1) {
    for (let right = left + 1; right < levels.length; right += 1) {
      const first = levels[left]!;
      const second = levels[right]!;
      if (first.side !== second.side) continue;
      if (Math.abs(first.price - second.price) <= equalTolerance(first.price, atr)) {
        first.equal = true;
        second.equal = true;
      }
    }
  }

  for (const level of levels) {
    const sweep = firstSweep(closedCandles, level);
    if (!sweep) continue;
    level.swept = true;
    level.sweepTime = sweep.time;
    level.reclaimed = sweep.reclaimed;
  }

  const maxLevels = Math.max(2, Math.floor(options.maxLevels ?? MAX_LEVELS));
  return levels.slice(-maxLevels);
}

interface PositionedLiquidity extends LiquidityLevel {
  x: number;
  sweepX?: number;
  y: number;
}

class LiquidityRenderer implements ISeriesPrimitivePaneRenderer {
  constructor(private readonly levels: PositionedLiquidity[]) {}

  draw(target: CanvasRenderingTarget2D): void {
    target.useBitmapCoordinateSpace((scope) => {
      const ctx = scope.context;
      ctx.save();
      ctx.scale(scope.horizontalPixelRatio, scope.verticalPixelRatio);
      ctx.font = "10px 'JetBrains Mono', monospace";
      ctx.textBaseline = "middle";

      for (const level of this.levels) {
        const baseColor = level.side === "buy-side" ? BUY_SIDE_COLOR : SELL_SIDE_COLOR;
        const color = level.reclaimed ? RECLAIM_COLOR : level.swept ? SWEEP_COLOR : baseColor;
        const label = level.side === "buy-side" ? "BSL" : "SSL";
        const labelText = level.swept ? `${label} swept` : level.equal ? `${label} equal` : label;
        const lineEnd = scope.bitmapSize.width / scope.horizontalPixelRatio - 4;

        ctx.strokeStyle = color;
        ctx.globalAlpha = level.swept ? 0.8 : 0.62;
        ctx.lineWidth = level.equal ? 2 : 1.25;
        ctx.setLineDash(level.swept ? [3, 3] : [7, 5]);
        ctx.beginPath();
        ctx.moveTo(Math.max(0, level.x), level.y);
        ctx.lineTo(lineEnd, level.y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;

        const labelX = Math.max(4, level.x + 5);
        const labelWidth = ctx.measureText(labelText).width + 8;
        ctx.fillStyle = "rgba(9, 12, 18, 0.88)";
        ctx.fillRect(labelX, level.y - 8, labelWidth, 16);
        ctx.fillStyle = color;
        ctx.textAlign = "left";
        ctx.fillText(labelText, labelX + 4, level.y);

        if (level.sweepX !== undefined) {
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(level.sweepX, level.y - 8);
          ctx.lineTo(level.sweepX, level.y + 8);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(level.sweepX, level.y, 4, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.fill();
        }
      }
      ctx.restore();
    });
  }
}

class LiquidityPaneView implements ISeriesPrimitivePaneView {
  private positioned: PositionedLiquidity[] = [];

  constructor(private readonly source: LiquidityAnalysis) {}

  update(): void {
    const timeScale = this.source.chart.timeScale();
    const series = this.source.series;
    this.positioned = [];
    for (const level of this.source.levels()) {
      const x = timeScale.timeToCoordinate(level.time as Time);
      const y = series.priceToCoordinate(level.price);
      if (x === null || y === null) continue;
      const sweepX = level.sweepTime === undefined
        ? undefined
        : timeScale.timeToCoordinate(level.sweepTime as Time) ?? undefined;
      this.positioned.push({ ...level, x, y, sweepX });
    }
  }

  renderer(): ISeriesPrimitivePaneRenderer {
    return new LiquidityRenderer(this.positioned);
  }

  zOrder(): "top" {
    return "top";
  }
}

export class LiquidityAnalysis extends PluginBase {
  private readonly view: LiquidityPaneView;
  private readonly maxLevels: number;
  private detected: LiquidityLevel[] = [];

  constructor(options: LiquidityAnalysisOptions = {}) {
    super();
    this.maxLevels = options.maxLevels ?? MAX_LEVELS;
    this.view = new LiquidityPaneView(this);
  }

  levels(): readonly LiquidityLevel[] {
    return this.detected;
  }

  paneViews(): readonly ISeriesPrimitivePaneView[] {
    return [this.view];
  }

  updateAllViews(): void {
    this.view.update();
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
    const candles = this.series.data() as unknown as Candle[];
    this.detected = detectLiquidityLevels(candles, { maxLevels: this.maxLevels });
  }
}

export function liquidityColor(side: LiquiditySide): string {
  return side === "buy-side" ? BUY_SIDE_COLOR : SELL_SIDE_COLOR;
}

export function liquidityCoordinateOrEdge(
  timeScale: ITimeScaleApi<Time>,
  time: number,
  visibleRange: Range<Time> | null,
  width: number,
): number | null {
  const coordinate = timeScale.timeToCoordinate(time as Time);
  if (coordinate !== null) return coordinate;
  if (!visibleRange) return null;
  if (time < (visibleRange.from as number)) return 0;
  if (time > (visibleRange.to as number)) return width;
  return null;
}
