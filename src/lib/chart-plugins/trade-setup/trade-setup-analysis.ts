import type { CanvasRenderingTarget2D } from "fancy-canvas";
import type {
  DataChangedScope,
  ISeriesPrimitivePaneRenderer,
  ISeriesPrimitivePaneView,
  Time,
} from "lightweight-charts";
import type { Candle } from "../../../services/schemas.ts";
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

function xFor(source: TradeSetupAnalysis, time: number | undefined): number | undefined {
  if (time === undefined) return undefined;
  return source.chart.timeScale().timeToCoordinate(time as Time) ?? undefined;
}

function yFor(source: TradeSetupAnalysis, price: number | undefined): number | undefined {
  if (price === undefined) return undefined;
  return source.series.priceToCoordinate(price) ?? undefined;
}

class TradeSetupRenderer implements ISeriesPrimitivePaneRenderer {
  constructor(private readonly setups: PositionedSetup[]) {}

  draw(target: CanvasRenderingTarget2D): void {
    target.useBitmapCoordinateSpace((scope) => {
      const ctx = scope.context;
      ctx.save();
      ctx.scale(scope.horizontalPixelRatio, scope.verticalPixelRatio);
      ctx.font = "10px 'JetBrains Mono', monospace";
      ctx.textBaseline = "middle";
      const width = scope.bitmapSize.width / scope.horizontalPixelRatio;

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

        const markers: Array<{ x?: number; y?: number; label: string; color: string; offset?: number }> = [
          { x: setup.liquidityX, y: setup.liquidityY, label: "1 Liquidity", color: "#a78bfa", offset: -22 },
          { x: setup.sweepX, y: setup.sweepY, label: "Sweep confirmed", color: "#fb923c", offset: 22 },
          { x: setup.breakX, y: levelY, label: "2 Break", color: "#38bdf8", offset: -22 },
          { x: setup.retestX, y: levelY, label: setup.stage === "candidate" ? "3 Retest / paper candidate" : "3 Retest pending", color: directionColor, offset: 22 },
        ];

        for (const marker of markers) {
          if (marker.x === undefined || marker.y === undefined) continue;
          ctx.fillStyle = marker.color;
          ctx.beginPath();
          ctx.arc(marker.x, marker.y, 3.5, 0, Math.PI * 2);
          ctx.fill();
          const textWidth = ctx.measureText(marker.label).width + 10;
          const labelX = Math.min(Math.max(4, marker.x + 6), width - textWidth - 4);
          const labelY = marker.y + (marker.offset ?? 0);
          ctx.fillStyle = "rgba(9, 12, 18, 0.9)";
          ctx.fillRect(labelX, labelY - 9, textWidth, 18);
          ctx.fillStyle = marker.color;
          ctx.textAlign = "left";
          ctx.fillText(marker.label, labelX + 5, labelY);
        }

        const planY = setup.entryY ?? levelY;
        if (planY !== undefined && setup.stage === "candidate") {
          drawPlanLine(ctx, setup.stopY, "SL", "#f43f5e", width);
          drawPlanLine(ctx, setup.targetY, "TP / opposing liquidity", "#22c55e", width);
          drawPlanLine(ctx, planY, "Paper entry", directionColor, width);
        }

        if (setup.stage === "invalidated" && levelY !== undefined) {
          ctx.fillStyle = "#f43f5e";
          ctx.textAlign = "right";
          ctx.fillText("Setup invalidated", width - 8, levelY - 13);
        }
        if (setup.stage === "liquidity-swept" && setup.liquidityY !== undefined) {
          drawStatus(ctx, setup.sweepX ?? setup.liquidityX ?? 0, setup.liquidityY, "Waiting for 2 Break", "#38bdf8", width);
        } else if (setup.stage === "retest-pending" && levelY !== undefined) {
          drawStatus(ctx, setup.breakX ?? 0, levelY, "Waiting for 3 Retest", directionColor, width);
        }
      }
      ctx.restore();
    });
  }
}

function drawStatus(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  label: string,
  color: string,
  width: number,
): void {
  const textWidth = ctx.measureText(label).width + 10;
  const labelX = Math.min(Math.max(4, x + 8), width - textWidth - 4);
  ctx.fillStyle = "rgba(9, 12, 18, 0.88)";
  ctx.fillRect(labelX, y + 34, textWidth, 18);
  ctx.fillStyle = color;
  ctx.textAlign = "left";
  ctx.fillText(label, labelX + 5, y + 43);
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
  }

  renderer(): ISeriesPrimitivePaneRenderer {
    return new TradeSetupRenderer(this.positioned);
  }

  zOrder(): "top" {
    return "top";
  }
}

export class TradeSetupAnalysis extends PluginBase {
  private readonly view: TradeSetupPaneView;
  private detected: TradeSetup[] = [];

  constructor() {
    super();
    this.view = new TradeSetupPaneView(this);
  }

  setups(): readonly TradeSetup[] {
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
    this.detected = detectTradeSetups(candles);
  }
}
