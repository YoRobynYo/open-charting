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
import {
  DEFAULT_CONFIRM_WINDOW,
  evaluateCandleStory,
  type CandleBias,
  type CandleStoryStage,
} from "./candle-story";
import { actionForCandle, type CandleAction } from "./candle-action";
import { detectTradeSetups, type TradeSetup } from "../trade-setup/trade-setup";

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

/** Real pattern names shown on the chart labels (never the character names). Direction is shown by the tag colour. */
export const PATTERN_LABEL: Partial<Record<CandlePattern, string>> = {
  hammer: "Hammer",
  "inverted-hammer": "Inverted Hammer",
  "shooting-star": "Shooting Star",
  "hanging-man": "Hanging Man",
  "bullish-engulfing": "Engulfing",
  "bearish-engulfing": "Engulfing",
  "morning-star": "Morning Star",
  "evening-star": "Evening Star",
  "bullish-marubozu": "Marubozu",
  "bearish-marubozu": "Marubozu",
};

/** Text colour of the action word under a pattern name. */
const ACTION_COLOR: Record<CandleAction, string> = {
  Sweep: "#c084fc",
  Break: "#93c5fd",
  Hold: "#fbbf24",
};

/** Which way each pattern points, used to decide if the next candles confirm or fail it. */
export const PATTERN_BIAS: Partial<Record<CandlePattern, CandleBias>> = {
  hammer: "bullish",
  "inverted-hammer": "bullish",
  "bullish-engulfing": "bullish",
  "morning-star": "bullish",
  "bullish-marubozu": "bullish",
  "shooting-star": "bearish",
  "hanging-man": "bearish",
  "bearish-engulfing": "bearish",
  "evening-star": "bearish",
  "bearish-marubozu": "bearish",
};

/** Label colours, from the original ICT candle-pattern colour table. */
export const PATTERN_COLOR: Partial<Record<CandlePattern, string>> = {
  hammer: "#22d3ee",
  "inverted-hammer": "#67e8f9",
  "shooting-star": "#f59e0b",
  "hanging-man": "#fbbf24",
  "bullish-engulfing": "#39ff14",
  "bearish-engulfing": "#ff3b5c",
  "morning-star": "#4ade80",
  "evening-star": "#fb7185",
  "bullish-marubozu": "#16a34a",
  "bearish-marubozu": "#dc2626",
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
  /**
   * Tallest a character may be, as a multiple of its width. On bigger candles
   * the character stays this tall and is centred on the body instead of being
   * stretched into a thin pill.
   */
  maxAspect: number;
  /** Do not draw sprites when bars are thinner than this (zoomed far out). */
  minBarSpacingPx: number;
  /** Fractions of the image kept as fixed head and feet. Middle stretches. */
  headSlice: number;
  feetSlice: number;
  /** Play motion and particles. Respects the OS reduced-motion setting. */
  animate: boolean;
  /** Only the newest N visible characters animate, to keep the chart fast. */
  maxAnimated: number;
  /** Draw a short leader line and the real pattern name above each character. */
  showLabels: boolean;
  /** Candles after a pattern that may confirm it (close beyond its high/low). */
  confirmWindow: number;
  /** Keep a faded name tag on failed or expired patterns. Off keeps the chart clean. */
  labelFailed: boolean;
  /** Add Sweep, Break or Hold under a pattern name when it lines up with an ICT Structure 4 step. */
  actionWords: boolean;
  /** How many recent trade setups to look through for those action words. */
  maxSetups: number;
  /** Label text size in CSS pixels. */
  labelFontPx: number;
  /** Length of the leader line between the wick and the label, in CSS pixels. */
  labelLeadPx: number;
}

const DEFAULTS: CharacterCandlesOptions = {
  basePath: "/characters",
  widthRatio: 0.9,
  minHeightPx: 18,
  maxWidthPx: 64,
  maxAspect: 3,
  minBarSpacingPx: 8,
  headSlice: 0.28,
  feetSlice: 0.2,
  animate: true,
  maxAnimated: 40,
  showLabels: true,
  confirmWindow: DEFAULT_CONFIRM_WINDOW,
  labelFailed: false,
  actionWords: true,
  maxSetups: 6,
  labelFontPx: 11,
  labelLeadPx: 10,
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
    const barSeconds = candles.length > 1
      ? Math.abs(candles[candles.length - 1]!.time - candles[candles.length - 2]!.time)
      : 0;

    const animating = this.source.isAnimating();
    const t = performance.now() / 1000;

    target.useBitmapCoordinateSpace(({ context: ctx, horizontalPixelRatio: hpr, verticalPixelRatio: vpr, bitmapSize }) => {
      // Collect first so only the newest characters animate.
      const items: Array<{
        i: number;
        name: string;
        pattern: CandlePattern;
        sprite: HTMLImageElement;
        stage: CandleStoryStage;
      }> = [];
      for (let i = from; i <= to; i++) {
        const pattern = detectCandlePatternAt(candles, i).pattern;
        const name = PATTERN_TO_CHARACTER[pattern];
        if (!name) continue;
        const sprite = this.source.sprites.get(name);
        const bias = PATTERN_BIAS[pattern];
        if (!sprite || !bias) continue;
        items.push({ i, name, pattern, sprite, stage: evaluateCandleStory(candles, i, bias, options.confirmWindow) });
      }
      const firstAnimated = items.length - options.maxAnimated;

      items.forEach(({ i, name, pattern, sprite, stage }, n) => {
        const bar = data[i];
        if (!bar) return;
        const x = chart.timeScale().logicalToCoordinate(i as never);
        const yOpen = series.priceToCoordinate(bar.open);
        const yClose = series.priceToCoordinate(bar.close);
        if (x === null || yOpen === null || yClose === null) return;

        const top = Math.min(yOpen, yClose);
        const bodyH = Math.max(Math.abs(yClose - yOpen), options.minHeightPx);
        const baseW = Math.min(barSpacing * options.widthRatio, options.maxWidthPx);
        const spriteH = Math.min(bodyH, Math.max(options.minHeightPx, baseW * options.maxAspect));

        const anim = animating && n >= firstAnimated ? CHARACTER_ANIMATIONS[name] : undefined;
        const m = anim?.motion(t, i);
        const w = baseW * (m?.scaleW ?? 1);
        const left = x - w / 2;
        const y = top + (bodyH - spriteH) / 2 + (m ? m.dy * baseW : 0);

        ctx.save();
        if (m?.glow && m.glowAmount) {
          ctx.shadowColor = m.glow;
          ctx.shadowBlur = 14 * m.glowAmount * hpr;
        }
        // The story shows on the character: confirmed glows, failed or expired fades.
        const faded = stage === "failed" || stage === "expired";
        ctx.globalAlpha = (m?.alpha ?? 1) * (faded ? 0.4 : 1);
        if (stage === "confirmed" && !(m?.glow && m.glowAmount)) {
          ctx.shadowColor = PATTERN_COLOR[pattern] ?? "#ffffff";
          ctx.shadowBlur = 16 * hpr;
        }
        drawThreeSlice(ctx, sprite, left * hpr, y * vpr, w * hpr, spriteH * vpr, options.headSlice, options.feetSlice);
        ctx.restore();

        const e = anim?.emitter;
        if (e && !faded) {
          ctx.save();
          ctx.fillStyle = e.color;
          for (let k = 0; k < e.count; k++) {
            const p = particleAt(e, k, i, t, left, y, w, spriteH);
            ctx.globalAlpha = Math.max(0, p.alpha);
            ctx.beginPath();
            ctx.arc(p.x * hpr, p.y * vpr, Math.max(0.6, p.radius) * hpr, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        }
      });

      if (options.showLabels) {
        const labels: LabelInput[] = [];
        for (const { i, pattern, stage } of items) {
          const lost = stage === "failed" || stage === "expired";
          if (lost && !options.labelFailed) continue;
          const bar = data[i];
          const text = PATTERN_LABEL[pattern];
          if (!bar || !text) continue;
          const bias = PATTERN_BIAS[pattern];
          const action = options.actionWords && bias
            ? actionForCandle(this.source.setups, candles[i]!.time, bias, barSeconds)
            : undefined;
          const x = chart.timeScale().logicalToCoordinate(i as never);
          const yHigh = series.priceToCoordinate(bar.high);
          const yLow = series.priceToCoordinate(bar.low);
          if (x === null || yHigh === null || yLow === null) continue;
          labels.push({
            x,
            yHigh,
            yLow,
            text,
            color: PATTERN_COLOR[pattern] ?? "#e5e7eb",
            action,
            alpha: lost ? 0.45 : 1,
          });
        }
        drawLabels(ctx, labels, {
          hpr,
          vpr,
          width: bitmapSize.width,
          height: bitmapSize.height,
          fontPx: options.labelFontPx,
          leadPx: options.labelLeadPx,
        });
      }
    });
  }
}

interface LabelInput {
  x: number;
  yHigh: number;
  yLow: number;
  text: string;
  color: string;
  /** Sweep, Break or Hold, shown as a last line under the name. */
  action?: CandleAction;
  alpha?: number;
}

/**
 * Pattern-name tags: a short leader line from the wick to a small tag showing
 * the real pattern name. Tags sit above the candle, stack upward when a
 * neighbour would overlap, and flip below the candle if there is no room above.
 */
function drawLabels(
  ctx: CanvasRenderingContext2D,
  labels: LabelInput[],
  v: { hpr: number; vpr: number; width: number; height: number; fontPx: number; leadPx: number },
) {
  const { hpr, vpr } = v;
  const fontPx = v.fontPx * vpr;
  const padX = 5 * hpr;
  const padY = 3 * vpr;
  const margin = 2 * vpr;
  const lead = v.leadPx * vpr;
  const lineH = fontPx * 1.15;
  const radius = 4 * hpr;
  const placed: Array<{ x1: number; x2: number; y1: number; y2: number }> = [];

  ctx.save();
  ctx.font = `600 ${fontPx}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = Math.max(1, hpr);

  for (const l of labels) {
    const cx = l.x * hpr;
    // Multi-word names wrap one word per line; an action word goes last.
    const lines: Array<{ text: string; color: string }> = l.text
      .split(" ")
      .map((w) => ({ text: w, color: "#f3f4f6" }));
    if (l.action) lines.push({ text: l.action, color: ACTION_COLOR[l.action] });
    const textW = Math.max(...lines.map((w) => ctx.measureText(w.text).width));
    const boxW = textW + padX * 2;
    const boxH = lineH * lines.length + padY * 2;
    const x1 = Math.min(Math.max(cx - boxW / 2, 2 * hpr), Math.max(2 * hpr, v.width - boxW - 2 * hpr));
    const x2 = x1 + boxW;

    // Candidate positions: above first (stepping higher), then below.
    const candidates: Array<{ y1: number; fromY: number; toY: number }> = [];
    for (const above of [true, false]) {
      for (let level = 0; level < 4; level++) {
        const step = level * (boxH + margin);
        if (above) {
          const fromY = l.yHigh * vpr - 3 * vpr;
          const bottom = fromY - lead - step;
          candidates.push({ y1: bottom - boxH, fromY, toY: bottom });
        } else {
          const fromY = l.yLow * vpr + 3 * vpr;
          const top = fromY + lead + step;
          candidates.push({ y1: top, fromY, toY: top });
        }
      }
    }
    const spot = candidates.find((c) => {
      if (c.y1 < 0 || c.y1 + boxH > v.height) return false;
      return !placed.some(
        (p) => x1 < p.x2 + margin && x2 > p.x1 - margin && c.y1 < p.y2 + margin && c.y1 + boxH > p.y1 - margin,
      );
    });
    if (!spot) continue;
    placed.push({ x1, x2, y1: spot.y1, y2: spot.y1 + boxH });

    ctx.globalAlpha = l.alpha ?? 1;

    // Leader line from the wick to the tag.
    const lineX = Math.min(Math.max(cx, x1 + radius), x2 - radius);
    ctx.strokeStyle = l.color;
    ctx.beginPath();
    ctx.moveTo(cx, spot.fromY);
    ctx.lineTo(lineX, spot.toY);
    ctx.stroke();

    // Tag.
    const y1 = spot.y1;
    const y2 = y1 + boxH;
    ctx.beginPath();
    ctx.moveTo(x1 + radius, y1);
    ctx.arcTo(x2, y1, x2, y2, radius);
    ctx.arcTo(x2, y2, x1, y2, radius);
    ctx.arcTo(x1, y2, x1, y1, radius);
    ctx.arcTo(x1, y1, x2, y1, radius);
    ctx.closePath();
    ctx.fillStyle = "rgba(15, 17, 23, 0.9)";
    ctx.fill();
    ctx.strokeStyle = l.color;
    ctx.stroke();
    lines.forEach((line, k) => {
      ctx.fillStyle = line.color;
      ctx.fillText(line.text, x1 + boxW / 2, y1 + padY + lineH * (k + 0.5) + vpr * 0.5);
    });
    ctx.globalAlpha = 1;
  }
  ctx.restore();
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
  /** Recent Structure 4 trade setups, used for the Sweep / Break / Hold words. */
  public setups: TradeSetup[] = [];
  private _setupKey = "";

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
    this.recomputeSetups();
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

  private recomputeSetups() {
    if (!this._options.actionWords) {
      this.setups = [];
      return;
    }
    const candles = this.series.data() as unknown as Candle[];
    // Once per candle is enough: the steps are read from closed candles.
    const key = `${candles.length}:${candles.at(-1)?.time ?? 0}`;
    if (key === this._setupKey) return;
    this._setupKey = key;
    this.setups = detectTradeSetups(candles, { maxSetups: this._options.maxSetups });
  }

  protected dataUpdated() {
    this.recomputeSetups();
    this.requestUpdate();
  }

  paneViews() {
    return this._views;
  }
}
