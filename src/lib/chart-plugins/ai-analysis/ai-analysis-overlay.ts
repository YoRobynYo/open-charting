import type { CanvasRenderingTarget2D } from "fancy-canvas";
import type {
  DataChangedScope,
  ISeriesPrimitivePaneRenderer,
  ISeriesPrimitivePaneView,
  Time,
} from "lightweight-charts";
import type { AiChartPoint } from "../../../services/ai-analysis.ts";
import { PluginBase } from "../plugin-base.ts";

interface PositionedAiPoint extends AiChartPoint {
  x: number;
  y: number;
}

const POINT_COLORS: Record<AiChartPoint["kind"], string> = {
  bullish: "#0ecb81",
  bearish: "#f6465d",
  level: "#60a5fa",
  caution: "#f5b942",
};

class AiAnalysisRenderer implements ISeriesPrimitivePaneRenderer {
  constructor(private readonly points: PositionedAiPoint[]) {}

  draw(target: CanvasRenderingTarget2D): void {
    target.useBitmapCoordinateSpace((scope) => {
      const ctx = scope.context;
      ctx.save();
      ctx.scale(scope.horizontalPixelRatio, scope.verticalPixelRatio);
      ctx.font = "10px 'JetBrains Mono', monospace";
      ctx.textBaseline = "middle";

      for (const point of this.points) {
        const color = POINT_COLORS[point.kind];
        ctx.strokeStyle = "rgba(9, 12, 18, 0.95)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(point.x, point.y, 5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = color;
        ctx.fill();

        const label = point.label.slice(0, 24);
        const labelWidth = ctx.measureText(label).width + 10;
        const labelX = point.x + 9;
        const labelY = point.y - 9;
        ctx.fillStyle = "rgba(9, 12, 18, 0.88)";
        ctx.fillRect(labelX, labelY - 8, labelWidth, 16);
        ctx.fillStyle = color;
        ctx.textAlign = "left";
        ctx.fillText(label, labelX + 5, labelY);
      }
      ctx.restore();
    });
  }
}

class AiAnalysisPaneView implements ISeriesPrimitivePaneView {
  private positioned: PositionedAiPoint[] = [];

  constructor(private readonly source: AiAnalysisOverlay) {}

  update(): void {
    const timeScale = this.source.chart.timeScale();
    const series = this.source.series;
    this.positioned = [];
    for (const point of this.source.points()) {
      const x = timeScale.timeToCoordinate(point.time as Time);
      const y = series.priceToCoordinate(point.price);
      if (x === null || y === null) continue;
      this.positioned.push({ ...point, x, y });
    }
  }

  renderer(): ISeriesPrimitivePaneRenderer {
    return new AiAnalysisRenderer(this.positioned);
  }

  zOrder(): "top" {
    return "top";
  }
}

/** A separate primitive whose points can be replaced without modifying candle data. */
export class AiAnalysisOverlay extends PluginBase {
  private readonly view: AiAnalysisPaneView;
  private chartPoints: AiChartPoint[];

  constructor(points: readonly AiChartPoint[] = []) {
    super();
    this.chartPoints = [...points];
    this.view = new AiAnalysisPaneView(this);
  }

  points(): readonly AiChartPoint[] {
    return this.chartPoints;
  }

  setPoints(points: readonly AiChartPoint[]): void {
    this.chartPoints = [...points];
    this.view.update();
    this.requestUpdate();
  }

  paneViews(): readonly ISeriesPrimitivePaneView[] {
    return [this.view];
  }

  updateAllViews(): void {
    this.view.update();
  }

  override attached(param: Parameters<PluginBase["attached"]>[0]): void {
    super.attached(param);
    this.view.update();
  }

  protected override dataUpdated(_scope: DataChangedScope): void {
    this.view.update();
    this.requestUpdate();
  }
}
