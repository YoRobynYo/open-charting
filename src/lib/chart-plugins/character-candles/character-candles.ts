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
import type { IctCandle } from "../ict-analysis/ict-analysis";
import {
  DEFAULT_STRUCTURE_LOOKBACK_SECONDS,
  DEFAULT_STRUCTURE_STRENGTH,
  detectStructureBreaks,
  stepWordsByTime,
  type StepWord,
  type StructureBreak,
} from "./structure-breaks";

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

/** Colour of a Retest, Hold or Trade word under a candle. */
export function structureStepColor(word: StepWord): string {
  if (word.kind === "retest") return "#38bdf8";
  if (word.kind === "hold") return "#fbbf24";
  return word.direction === "bullish" ? "#22c55e" : "#f43f5e";
}

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
  /** Keep a faded name tag on failed or expired patterns. */
  labelFailed: boolean;
  /** Draw BOS and CHoCH as a labelled line with a dot at each end. */
  showStructure: boolean;
  /** Candles either side of a swing before it counts for BOS / CHoCH. Bigger means fewer breaks. */
  structureStrength: number;
  /** How many days back BOS / CHoCH are drawn from the latest candle. */
  structureDays: number;
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
  showStructure: true,
  structureStrength: DEFAULT_STRUCTURE_STRENGTH,
  structureDays: DEFAULT_STRUCTURE_LOOKBACK_SECONDS / 86400,
  showLabels: true,
  confirmWindow: DEFAULT_CONFIRM_WINDOW,
  labelFailed: true,
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

export function resolveIct6Visibility(
  barSpacing: number,
  options: Pick<CharacterCandlesOptions, "minBarSpacingPx" | "showLabels" | "showStructure">,
) {
  return {
    characters: barSpacing >= options.minBarSpacingPx,
    labels: options.showLabels,
    structure: options.showStructure,
  };
}

class CharacterRenderer implements ISeriesPrimitivePaneRenderer {
  constructor(private source: CharacterCandles) {}

  draw(target: CanvasRenderingTarget2D) {
    const { chart, series, options } = this.source.context();
    const range = chart.timeScale().getVisibleLogicalRange();
    const data = series.data() as CandlestickData<Time>[];
    if (!range || data.length === 0) return;

    const barSpacing = chart.timeScale().options().barSpacing;
    // Only sprites disappear when they become too small; text and structure
    // visibility remain governed by their own ICT 6 options.
    const visibleLayers = resolveIct6Visibility(barSpacing, options);

    const from = Math.max(0, Math.floor(range.from) - 1);
    const to = Math.min(data.length - 1, Math.ceil(range.to) + 1);
    const candles = data as unknown as Candle[];

    const animating = this.source.isAnimating();
    const t = performance.now() / 1000;

    target.useBitmapCoordinateSpace(({ context: ctx, horizontalPixelRatio: hpr, verticalPixelRatio: vpr, bitmapSize }) => {
      const structureLabelBoxes = visibleLayers.structure
        ? drawStructureBreaks(ctx, this.source.structure, {
          chart,
          series,
          hpr,
          vpr,
          width: bitmapSize.width,
          height: bitmapSize.height,
          fontPx: options.labelFontPx,
        })
        : [];

      // Collect patterns even when sprites are hidden so names and structure
      // steps remain readable when zoomed out or while sprite assets load.
      const items: Array<{
        i: number;
        name: string;
        pattern: CandlePattern;
        sprite: HTMLImageElement | null;
        stage: CandleStoryStage;
      }> = [];
      for (let i = from; i <= to; i++) {
        const pattern = detectCandlePatternAt(candles, i).pattern;
        const name = PATTERN_TO_CHARACTER[pattern];
        if (!name) continue;
        const sprite = this.source.sprites.get(name);
        const bias = PATTERN_BIAS[pattern];
        if (!bias) continue;
        items.push({ i, name, pattern, sprite, stage: evaluateCandleStory(candles, i, bias, options.confirmWindow) });
      }
      const firstAnimated = items.length - options.maxAnimated;

      if (visibleLayers.characters) items.forEach(({ i, name, pattern, sprite, stage }, n) => {
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

        const anim = animating && sprite && n >= firstAnimated ? CHARACTER_ANIMATIONS[name] : undefined;
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
        if (sprite) drawThreeSlice(ctx, sprite, left * hpr, y * vpr, w * hpr, spriteH * vpr, options.headSlice, options.feetSlice);
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

      if (visibleLayers.labels) {
        const labels: LabelInput[] = [];
        const stepTimes = new Set<number>();
        for (const { i, pattern, stage } of items) {
          const lost = stage === "failed" || stage === "expired";
          if (lost && !options.labelFailed) continue;
          const bar = data[i];
          const text = PATTERN_LABEL[pattern];
          if (!bar || !text) continue;
          const stepWords = visibleLayers.structure ? this.source.steps.get(candles[i]!.time) : undefined;
          if (stepWords) stepTimes.add(candles[i]!.time);
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
            steps: stepWords?.map((w) => ({ text: w.text, color: structureStepColor(w) })),
            alpha: lost ? 0.45 : 1,
          });
        }
        // Candles with no pattern name still get a small tag for their step.
        if (visibleLayers.structure) {
          for (let i = from; i <= to; i++) {
            const time = candles[i]!.time;
            const words = this.source.steps.get(time);
            const bar = data[i];
            if (!words || !bar || stepTimes.has(time)) continue;
            const x = chart.timeScale().logicalToCoordinate(i as never);
            const yHigh = series.priceToCoordinate(bar.high);
            const yLow = series.priceToCoordinate(bar.low);
            if (x === null || yHigh === null || yLow === null) continue;
            labels.push({
              x,
              yHigh,
              yLow,
              text: "",
              color: structureStepColor(words[0]!),
              steps: words.map((w) => ({ text: w.text, color: structureStepColor(w) })),
            });
          }
        }
        drawLabels(ctx, labels, {
          hpr,
          vpr,
          width: bitmapSize.width,
          height: bitmapSize.height,
          fontPx: options.labelFontPx,
          leadPx: options.labelLeadPx,
        }, structureLabelBoxes);
      }
    });
  }
}

/**
 * BOS and CHoCH: a line at the broken level from its swing to the candle that
 * closed through it, a dot at each end, and the word in a small tag. Bullish
 * breaks are green with the tag above the line, bearish are red with the tag
 * below. CHoCH (a break against the trend) is dashed; BOS is solid.
 */
export function drawStructureBreaks(
  ctx: CanvasRenderingContext2D,
  breaks: readonly StructureBreak[],
  v: {
    chart: ReturnType<CharacterCandles["context"]>["chart"];
    series: ReturnType<CharacterCandles["context"]>["series"];
    hpr: number;
    vpr: number;
    width: number;
    height: number;
    fontPx: number;
  },
): LabelRect[] {
  if (breaks.length === 0) return [];
  const { chart, series, hpr, vpr } = v;
  const tagBoxes: LabelRect[] = [];
  ctx.save();
  ctx.font = `700 ${v.fontPx * vpr}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = Math.max(1, hpr);
  const tagH = (v.fontPx + 5) * vpr;

  for (const b of breaks) {
    const x1 = chart.timeScale().timeToCoordinate(b.startTime as Time);
    const x2 = chart.timeScale().timeToCoordinate(b.time as Time);
    const y = series.priceToCoordinate(b.price);
    if (x1 === null || x2 === null || y === null) continue;
    if (x2 * hpr < 0 || x1 * hpr > v.width) continue;

    const color = b.direction === "bullish" ? "#22c55e" : "#f43f5e";
    const yPx = y * vpr;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.setLineDash(b.kind === "CHoCH" ? [4 * hpr, 3 * hpr] : []);
    ctx.beginPath();
    ctx.moveTo(x1 * hpr, yPx);
    ctx.lineTo(x2 * hpr, yPx);
    ctx.stroke();
    ctx.setLineDash([]);
    for (const px of [x1, x2]) {
      ctx.beginPath();
      ctx.arc(px * hpr, yPx, 2.5 * hpr, 0, Math.PI * 2);
      ctx.fill();
    }

    if (b.retest) {
      // Carry the level on to the candle that came back to it and ring that candle.
      const xr = chart.timeScale().timeToCoordinate(b.retest.time as Time);
      if (xr !== null) {
        ctx.save();
        ctx.globalAlpha = 0.55;
        ctx.beginPath();
        ctx.moveTo(x2 * hpr, yPx);
        ctx.lineTo(xr * hpr, yPx);
        ctx.stroke();
        ctx.restore();
        ctx.fillStyle = "rgba(15, 23, 42, 0.95)";
        ctx.beginPath();
        ctx.arc(xr * hpr, yPx, 3.5 * hpr, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }

    // Keep the tag on screen when the swing is scrolled off to the left.
    const visibleLeft = Math.max(x1 * hpr, 0);
    const tagW = ctx.measureText(b.kind).width + 10 * hpr;
    const cx = Math.min(Math.max((visibleLeft + x2 * hpr) / 2, tagW / 2), v.width - tagW / 2);
    const preferredY = yPx + (b.direction === "bullish" ? -1 : 1) * (tagH / 2 + 2 * vpr);
    const candidates = [preferredY];
    for (let level = 1; level <= 5; level += 1) {
      candidates.push(preferredY - level * (tagH + 2 * vpr));
      candidates.push(preferredY + level * (tagH + 2 * vpr));
    }
    const cy = candidates.find((candidateY) => {
      const box = { left: cx - tagW / 2, right: cx + tagW / 2, top: candidateY - tagH / 2, bottom: candidateY + tagH / 2 };
      return box.top >= 0 && box.bottom <= v.height && !tagBoxes.some((placed) => rectanglesOverlap(box, placed, 2 * vpr));
    });
    if (cy === undefined) continue;
    tagBoxes.push({ left: cx - tagW / 2, right: cx + tagW / 2, top: cy - tagH / 2, bottom: cy + tagH / 2 });
    ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
    ctx.fillRect(cx - tagW / 2, cy - tagH / 2, tagW, tagH);
    ctx.fillStyle = color;
    ctx.fillText(b.kind, cx, cy);
  }
  ctx.restore();
  return tagBoxes;
}

export interface LabelRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

function rectanglesOverlap(a: LabelRect, b: LabelRect, margin = 0): boolean {
  return a.left < b.right + margin && a.right > b.left - margin &&
    a.top < b.bottom + margin && a.bottom > b.top - margin;
}

interface LabelInput {
  x: number;
  yHigh: number;
  yLow: number;
  text: string;
  color: string;
  /** Retest, Hold and Trade words from a BOS / CHoCH, shown under the name. */
  steps?: Array<{ text: string; color: string }>;
  alpha?: number;
}

/**
 * Pattern-name tags: a short leader line from the wick to a small tag showing
 * the real pattern name. Tags sit above the candle, stack upward when a
 * neighbour would overlap, and flip below the candle if there is no room above.
 */
export function drawLabels(
  ctx: CanvasRenderingContext2D,
  labels: LabelInput[],
  v: { hpr: number; vpr: number; width: number; height: number; fontPx: number; leadPx: number },
  reservedBoxes: readonly LabelRect[] = [],
): LabelRect[] {
  const { hpr, vpr } = v;
  const fontPx = v.fontPx * vpr;
  const padX = 5 * hpr;
  const padY = 3 * vpr;
  const margin = 2 * vpr;
  const lead = v.leadPx * vpr;
  const lineH = fontPx * 1.15;
  const radius = 4 * hpr;
  const placed: LabelRect[] = [];

  ctx.save();
  ctx.font = `600 ${fontPx}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = Math.max(1, hpr);

  for (const l of labels) {
    const cx = l.x * hpr;
    // Keep the real candle name distinct from ICT 6 structure-step words.
    const nameLines: Array<{ text: string; color: string }> = l.text
      .split(" ")
      .filter(Boolean)
      .map((w) => ({ text: w, color: "#f3f4f6" }));
    const stepLines = l.steps ?? [];
    const lines = [...nameLines, ...stepLines];
    if (lines.length === 0) continue;
    const nameStepGap = nameLines.length > 0 && stepLines.length > 0 ? 3 * vpr : 0;
    const textW = Math.max(...lines.map((w) => ctx.measureText(w.text).width));
    const boxW = textW + padX * 2;
    const boxH = lineH * lines.length + nameStepGap + padY * 2;
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
      const box = { left: x1, right: x2, top: c.y1, bottom: c.y1 + boxH };
      return ![...reservedBoxes, ...placed].some((p) => rectanglesOverlap(box, p, margin));
    });
    if (!spot) continue;
    placed.push({ left: x1, right: x2, top: spot.y1, bottom: spot.y1 + boxH });

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
    let textY = spot.y1 + padY + lineH * 0.5 + vpr * 0.5;
    nameLines.forEach((line) => {
      ctx.fillStyle = line.color;
      ctx.fillText(line.text, x1 + boxW / 2, textY);
      textY += lineH;
    });
    textY += nameStepGap;
    stepLines.forEach((line) => {
      ctx.fillStyle = line.color;
      ctx.fillText(line.text, x1 + boxW / 2, textY);
      textY += lineH;
    });
    ctx.globalAlpha = 1;
  }
  ctx.restore();
  return placed;
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
  /** BOS and CHoCH drawn on the chart. */
  public structure: StructureBreak[] = [];
  /** The Retest, Hold and Trade words of those breaks, by candle time. */
  public steps = new Map<number, StepWord[]>();
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
    this.recomputeStructure();
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

  private recomputeStructure() {
    const candles = this.series.data() as unknown as Candle[];
    // Structure and steps depend on closed candles; recompute once per new bar.
    const key = `${candles.length}:${candles.at(-1)?.time ?? 0}`;
    if (key === this._setupKey) return;
    this._setupKey = key;
    this.structure = this._options.showStructure
      ? detectStructureBreaks(candles as unknown as IctCandle[], {
        strength: this._options.structureStrength,
        lookbackSeconds: this._options.structureDays * 86400,
      })
      : [];
    this.steps = stepWordsByTime(this.structure);
  }

  protected dataUpdated() {
    this.recomputeStructure();
    this.requestUpdate();
  }

  paneViews() {
    return this._views;
  }
}
