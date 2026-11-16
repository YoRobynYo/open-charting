import type { CanvasRenderingTarget2D } from "fancy-canvas";
import type {
  DataChangedScope,
  ISeriesPrimitivePaneRenderer,
  ISeriesPrimitivePaneView,
  Time,
} from "lightweight-charts";
import type { Candle } from "../../../services/schemas.ts";
import { detectIctEvents, type IctEvent } from "../ict-analysis/ict-analysis.ts";
import { PluginBase } from "../plugin-base.ts";
import {
  detectTradeSetups,
  type TradeSetup,
} from "./trade-setup.ts";

interface PositionedSetup extends TradeSetup {
  liquidityX?: number;
  sweepX?: number;
  sweepY?: number;
  breakX?: number;
  retestX?: number;
  liquidityY?: number;
  levelY?: number;
  entryY?: number;
  stopY?: number;
  targetY?: number;
}

interface PositionedBreak {
  event: IctEvent;
  x: number;
  y: number;
}

function xFor(source: TradeSetupAnalysis, time: number | undefined): number | undefined {
  if (time === undefined) return undefined;
  return source.chart.timeScale().timeToCoordinate(time as Time) ?? undefined;
}

function yFor(source: TradeSetupAnalysis, price: number | undefined): number | undefined {
  if (price === undefined) return undefined;
  return source.series.priceToCoordinate(price) ?? undefined;
}

class TradeSetupRenderer implements ISeriesPrimitivePaneRenderer {
  constructor(
    private readonly setups: PositionedSetup[],
    private readonly breaks: PositionedBreak[],
  ) {}

  draw(target: CanvasRenderingTarget2D): void {
    target.useBitmapCoordinateSpace((scope) => {
      const ctx = scope.context;
      ctx.save();
      ctx.scale(scope.horizontalPixelRatio, scope.verticalPixelRatio);
      ctx.font = "10px 'JetBrains Mono', monospace";
      ctx.textBaseline = "middle";
      const width = scope.bitmapSize.width / scope.horizontalPixelRatio;

      for (const { event, x, y } of this.breaks) {
        drawInvertedTriangle(ctx, x, y, event.kind === "bos" ? "#38bdf8" : "#d946ef");
      }

      for (const setup of this.setups) {
        const directionColor = setup.direction === "long" ? "#22c55e" : "#f43f5e";
        const levelY = setup.levelY;
        if (levelY !== undefined) {
          ctx.strokeStyle = "rgba(167, 139, 250, 0.7)";
          ctx.lineWidth = 1.5;
          ctx.setLineDash([5, 4]);
          ctx.beginPath();
          ctx.moveTo(Math.max(0, setup.breakX ?? setup.sweepX ?? setup.liquidityX ?? 0), levelY);
          ctx.lineTo(width - 4, levelY);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        const markers: Array<{ x?: number; y?: number; color: string }> = [
          { x: setup.liquidityX, y: setup.liquidityY, color: "#a78bfa" },
          { x: setup.sweepX, y: setup.sweepY, color: "#fb923c" },
          { x: setup.retestX, y: levelY, color: directionColor },
        ];

        for (const marker of markers) {
          if (marker.x === undefined || marker.y === undefined) continue;
          ctx.fillStyle = marker.color;
          ctx.beginPath();
          ctx.arc(marker.x, marker.y, 3.5, 0, Math.PI * 2);
          ctx.fill();
        }

        const planY = setup.entryY ?? levelY;
        if (planY !== undefined && setup.stage === "candidate") {
          drawPlanLine(ctx, setup.stopY, "SL", "#f43f5e", width);
          drawPlanLine(ctx, setup.targetY, "TP / opposing liquidity", "#22c55e", width);
          drawPlanLine(ctx, planY, "Paper entry", directionColor, width);
        }

      }
      ctx.restore();
    });
  }
}

function drawPlanLine(
  ctx: CanvasRenderingContext2D,
  y: number | undefined,
  label: string,
  color: string,
  width: number,
): void {
  if (y === undefined) return;
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.55;
  ctx.setLineDash([2, 4]);
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(width - 4, y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
  ctx.fillStyle = color;
  ctx.textAlign = "right";
  ctx.fillText(label, width - 8, y - 8);
}

class TradeSetupPaneView implements ISeriesPrimitivePaneView {
  private positioned: PositionedSetup[] = [];
  private positionedBreaks: PositionedBreak[] = [];

  constructor(private readonly source: TradeSetupAnalysis) {}

  update(): void {
    this.positioned = this.source.setups().map((setup) => ({
      ...setup,
      liquidityX: xFor(this.source, setup.liquidity.time),
      sweepX: xFor(this.source, setup.sweepTime),
      sweepY: yFor(this.source, setup.sweepPrice),
      breakX: xFor(this.source, setup.breakTime),
      retestX: xFor(this.source, setup.retestTime),
      liquidityY: yFor(this.source, setup.liquidity.price),
      levelY: yFor(this.source, setup.breakLevel?.price),
      entryY: yFor(this.source, setup.entry),
      stopY: yFor(this.source, setup.stop),
      targetY: yFor(this.source, setup.target?.price),
    }));
    this.positionedBreaks = this.source.structureEvents()
      .map((event) => {
        const x = xFor(this.source, event.time);
        const y = yFor(this.source, event.price);
        return x === undefined || y === undefined ? undefined : { event, x, y };
      })
      .filter((item): item is PositionedBreak => item !== undefined);
  }

  renderer(): ISeriesPrimitivePaneRenderer {
    return new TradeSetupRenderer(this.positioned, this.positionedBreaks);
  }

  zOrder(): "top" {
    return "top";
  }
}

export class TradeSetupAnalysis extends PluginBase {
  private readonly view: TradeSetupPaneView;
  private detected: TradeSetup[] = [];
  private detectedStructureEvents: IctEvent[] = [];

  constructor() {
    super();
    this.view = new TradeSetupPaneView(this);
  }

  setups(): readonly TradeSetup[] {
    return this.detected;
  }

  structureEvents(): readonly IctEvent[] {
    return this.detectedStructureEvents;
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
    this.detected = detectTradeSetups(candles);
    this.detectedStructureEvents = detectIctEvents(candles).filter(
      (event) => event.kind === "bos" || event.kind === "choch",
    );
  }
}

function drawInvertedTriangle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
): void {
  const size = 6;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x - size, y - size);
  ctx.lineTo(x + size, y - size);
  ctx.lineTo(x, y + size);
  ctx.closePath();
  ctx.fill();
}
