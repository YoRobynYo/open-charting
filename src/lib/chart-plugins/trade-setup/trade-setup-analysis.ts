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
  startX: number;
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

      for (const { event, startX, x, y } of this.breaks) {
        drawStructureBreakLine(
          ctx,
          startX,
          x,
          y,
          event.kind === "bos" ? "#22c55e" : "#f43f5e",
          event.kind === "bos" ? "BOS" : "CHoCH",
        );
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

        const markers: Array<{ x?: number; y?: number; color: string; label: string }> = [
          { x: setup.liquidityX, y: setup.liquidityY, color: "#a78bfa", label: "Liquidity" },
          { x: setup.sweepX, y: setup.sweepY, color: "#fb923c", label: "Sweep confirmed" },
          {
            x: setup.retestX,
            y: levelY,
            color: directionColor,
            label: setup.stage === "candidate" ? "Retest / paper candidate" : "Retest pending",
          },
        ];

        for (const marker of markers) {
          if (marker.x === undefined || marker.y === undefined) continue;
          ctx.fillStyle = marker.color;
          ctx.beginPath();
          ctx.arc(marker.x, marker.y, 3.5, 0, Math.PI * 2);
          ctx.fill();
          drawMarkerLabel(ctx, marker.x + 7, marker.y - 12, marker.label, marker.color, width);
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
        const startX = xFor(this.source, event.startTime);
        const x = xFor(this.source, event.time);
        const y = yFor(this.source, event.price);
        return startX === undefined || x === undefined || y === undefined
          ? undefined
          : { event, startX, x, y };
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

function drawStructureBreakLine(
  ctx: CanvasRenderingContext2D,
  startX: number,
  endX: number,
  y: number,
  color: string,
  label: string,
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 5]);
  ctx.beginPath();
  ctx.moveTo(startX, y);
  ctx.lineTo(endX, y);
  ctx.stroke();
  ctx.setLineDash([]);
  drawMarkerLabel(ctx, Math.min(startX, endX) + 5, y - 14, label, color, Math.max(startX, endX) + 80);
}

function drawMarkerLabel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  label: string,
  color: string,
  width: number,
): void {
  const textWidth = ctx.measureText(label).width + 8;
  const labelX = Math.min(Math.max(4, x), width - textWidth - 4);
  ctx.fillStyle = "rgba(9, 12, 18, 0.88)";
  ctx.fillRect(labelX, y - 8, textWidth, 16);
  ctx.fillStyle = color;
  ctx.textAlign = "left";
  ctx.fillText(label, labelX + 4, y);
}
