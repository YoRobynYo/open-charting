import type {
  CandlestickData,
  ISeriesPrimitivePaneRenderer,
  ISeriesPrimitivePaneView,
  Time,
} from "lightweight-charts";
import type { CanvasRenderingTarget2D } from "fancy-canvas";
import { PluginBase } from "../plugin-base";
import { detectCandlePatternAt, type CandlePattern } from "../../candle-patterns";
import type { Candle } from "../../../services/schemas";
import { CHARACTER_ANIMATIONS, particleAt } from "./animations";

/** Which character sprite each detected pattern uses. Add more as you create art. */
export const PATTERN_TO_CHARACTER: Partial<Record<CandlePattern, string>> = {
  "bullish-marubozu": "skyrocket",
  "bearish-marubozu": "meteor",
  "bullish-engulfing": "grand-finale",
  "bearish-engulfing": "snuffed-out",
  hammer: "sparkler",
  "inverted-hammer": "roman-candle",
  "shooting-star": "comet",
  "hanging-man": "falling-ember",
  "morning-star": "dawn-star",
  "evening-star": "dusk-star",
};

export interface CharacterCandlesOptions {
  /** Folder under /public that holds the PNGs, e.g. /characters/blaze.png */
  basePath: string;
  /** Fraction of the bar width the sprite fills. */
  widthRatio: number;
  /** Sprite never gets shorter than this, so tiny bodies stay readable. */
  minHeightPx: number;
  /** Sprite never gets wider than this. */
  maxWidthPx: number;
  /** Do not draw sprites when bars are thinner than this (zoomed far out). */
  minBarSpacingPx: number;
  /** Fractions of the image kept as fixed head and feet. Middle stretches. */
  headSlice: number;
  feetSlice: number;
  /** Play motion and particles. Respects the OS reduced-motion setting. */
  animate: boolean;
  /** Only the newest N visible characters animate, to keep the chart fast. */
  maxAnimated: number;
}

const DEFAULTS: CharacterCandlesOptions = {
  basePath: "/characters",
  widthRatio: 0.9,
  minHeightPx: 18,
  maxWidthPx: 64,
  minBarSpacingPx: 8,
  headSlice: 0.28,
  feetSlice: 0.2,
  animate: true,
  maxAnimated: 40,
};

class SpriteCache {
  private images = new Map<string, HTMLImageElement | "failed">();
  constructor(private basePath: string, private onLoad: () => void) {}

  get(name: string): HTMLImageElement | null {
    const hit = this.images.get(name);
    if (hit === "failed") return null;
    if (hit) return hit.complete && hit.naturalWidth > 0 ? hit : null;
    const img = new Image();
    img.onload = () => this.onLoad();
    img.onerror = () => this.images.set(name, "failed");
    img.src = `${this.basePath}/${name}.png`;
    this.images.set(name, img);
    return null;
  }
}

class CharacterRenderer implements ISeriesPrimitivePaneRenderer {
  constructor(private source: CharacterCandles) {}

  draw(target: CanvasRenderingTarget2D) {
    const { chart, series, options } = this.source.context();
    const range = chart.timeScale().getVisibleLogicalRange();
    const data = series.data() as CandlestickData<Time>[];
    if (!range || data.length === 0) return;

    const barSpacing = chart.timeScale().options().barSpacing;
    if (barSpacing < options.minBarSpacingPx) return;

    const from = Math.max(0, Math.floor(range.from) - 1);
    const to = Math.min(data.length - 1, Math.ceil(range.to) + 1);
    const candles = data as unknown as Candle[];

    const animating = this.source.isAnimating();
    const t = performance.now() / 1000;

    target.useBitmapCoordinateSpace(({ context: ctx, horizontalPixelRatio: hpr, verticalPixelRatio: vpr }) => {
      // Collect first so only the newest characters animate.
      const items: Array<{ i: number; name: string; sprite: HTMLImageElement }> = [];
      for (let i = from; i <= to; i++) {
        const name = PATTERN_TO_CHARACTER[detectCandlePatternAt(candles, i).pattern];
        if (!name) continue;
        const sprite = this.source.sprites.get(name);
        if (sprite) items.push({ i, name, sprite });
      }
      const firstAnimated = items.length - options.maxAnimated;

      items.forEach(({ i, name, sprite }, n) => {
        const bar = data[i];
        if (!bar) return;
        const x = chart.timeScale().logicalToCoordinate(i as never);
        const yOpen = series.priceToCoordinate(bar.open);
        const yClose = series.priceToCoordinate(bar.close);
        if (x === null || yOpen === null || yClose === null) return;

        const top = Math.min(yOpen, yClose);
        const bodyH = Math.max(Math.abs(yClose - yOpen), options.minHeightPx);
        const baseW = Math.min(barSpacing * options.widthRatio, options.maxWidthPx);

        const anim = animating && n >= firstAnimated ? CHARACTER_ANIMATIONS[name] : undefined;
        const m = anim?.motion(t, i);
        const w = baseW * (m?.scaleW ?? 1);
        const left = x - w / 2;
        const y = top + (m ? m.dy * baseW : 0);

        ctx.save();
        if (m?.glow && m.glowAmount) {
          ctx.shadowColor = m.glow;
          ctx.shadowBlur = 14 * m.glowAmount * hpr;
        }
        ctx.globalAlpha = m?.alpha ?? 1;
        drawThreeSlice(ctx, sprite, left * hpr, y * vpr, w * hpr, bodyH * vpr, options.headSlice, options.feetSlice);
        ctx.restore();

        const e = anim?.emitter;
        if (e) {
          ctx.save();
          ctx.fillStyle = e.color;
          for (let k = 0; k < e.count; k++) {
            const p = particleAt(e, k, i, t, left, y, w, bodyH);
            ctx.globalAlpha = Math.max(0, p.alpha);
            ctx.beginPath();
            ctx.arc(p.x * hpr, p.y * vpr, Math.max(0.6, p.radius) * hpr, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        }
      });
    });
  }
}

/**
 * Head and feet keep their proportions; only the middle stretches, so faces
 * do not distort when a candle is tall.
 */
function drawThreeSlice(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
  headFrac: number,
  feetFrac: number,
) {
  const sw = img.naturalWidth;
  const sh = img.naturalHeight;
  const headSrc = sh * headFrac;
  const feetSrc = sh * feetFrac;
  const midSrc = sh - headSrc - feetSrc;

  const scale = dw / sw;
  let headDst = headSrc * scale;
  let feetDst = feetSrc * scale;
  const fixed = headDst + feetDst;
  if (fixed > dh) {
    // Candle shorter than head+feet: shrink both evenly, no middle.
    const k = dh / fixed;
    headDst *= k;
    feetDst *= k;
  }
  const midDst = Math.max(0, dh - headDst - feetDst);

  ctx.drawImage(img, 0, 0, sw, headSrc, dx, dy, dw, headDst);
  if (midDst > 0) ctx.drawImage(img, 0, headSrc, sw, midSrc, dx, dy + headDst, dw, midDst);
  ctx.drawImage(img, 0, headSrc + midSrc, sw, feetSrc, dx, dy + headDst + midDst, dw, feetDst);
}

class CharacterPaneView implements ISeriesPrimitivePaneView {
  private _renderer: CharacterRenderer;
  constructor(source: CharacterCandles) {
    this._renderer = new CharacterRenderer(source);
  }
  zOrder() {
    return "top" as const;
  }
  renderer() {
    return this._renderer;
  }
}

export class CharacterCandles extends PluginBase {
  private _options: CharacterCandlesOptions;
  private _views: CharacterPaneView[];
  public sprites: SpriteCache;

  constructor(options: Partial<CharacterCandlesOptions> = {}) {
    super();
    this._options = { ...DEFAULTS, ...options };
    this.sprites = new SpriteCache(this._options.basePath, () => this.requestUpdate());
    this._views = [new CharacterPaneView(this)];
  }

  private _raf: number | null = null;
  private _reduceMotion =
    typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  /** True when motion is on and the tab is visible. */
  isAnimating(): boolean {
    return this._options.animate && !this._reduceMotion && !document.hidden;
  }

  public override attached(param: Parameters<PluginBase["attached"]>[0]) {
    super.attached(param);
    if (!this._options.animate || this._reduceMotion) return;
    const tick = () => {
      this.requestUpdate();
      this._raf = requestAnimationFrame(tick);
    };
    this._raf = requestAnimationFrame(tick);
  }

  public override detached() {
    if (this._raf !== null) cancelAnimationFrame(this._raf);
    this._raf = null;
    super.detached();
  }

  context() {
    return { chart: this.chart, series: this.series, options: this._options };
  }

  protected dataUpdated() {
    this.requestUpdate();
  }

  paneViews() {
    return this._views;
  }
}
