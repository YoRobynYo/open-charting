/**
 * Stateless animations for the star and firework characters. Everything is a
 * pure function of time `t` (seconds) and the candle index, so there is no
 * per-candle state to manage and replay just works.
 */

export interface Motion {
  /** Vertical offset as a fraction of sprite width (positive = down). */
  dy: number;
  /** Horizontal width multiplier (1 = normal). */
  scaleW: number;
  /** Sprite opacity 0 to 1. */
  alpha: number;
  /** Optional glow colour drawn behind the sprite. */
  glow?: string;
  /** Glow strength 0 to 1. */
  glowAmount?: number;
}

export interface Emitter {
  color: string;
  /** Particles alive at once. */
  count: number;
  /** Where they spawn relative to the sprite. */
  origin: "top" | "bottom" | "center";
  /** Travel direction: up, down or radial (burst outward). */
  dir: "up" | "down" | "radial";
  /** Cycles per second. */
  speed: number;
  /** Travel distance as a multiple of sprite width. */
  reach: number;
  /** Particle radius as a fraction of sprite width. */
  size: number;
}

export interface CharacterAnimation {
  motion: (t: number, seed: number) => Motion;
  emitter?: Emitter;
}

const wave = (t: number, hz: number, seed = 0) => Math.sin((t * hz + seed * 0.37) * Math.PI * 2);
const flicker = (t: number, seed: number) =>
  0.5 + 0.5 * Math.sin(t * 23 + seed) * Math.sin(t * 37 + seed * 2.1);

export const CHARACTER_ANIMATIONS: Record<string, CharacterAnimation> = {
  skyrocket: {
    motion: (t, s) => ({ dy: -0.03 * wave(t, 6, s), scaleW: 1, alpha: 1 }),
    emitter: { color: "#ffb347", count: 8, origin: "bottom", dir: "down", speed: 1.6, reach: 1.2, size: 0.07 },
  },
  meteor: {
    motion: (t, s) => ({ dy: 0.02 * wave(t, 8, s), scaleW: 1, alpha: 1, glow: "#ff5a36", glowAmount: 0.5 + 0.4 * flicker(t, s) }),
    emitter: { color: "#ff7a45", count: 8, origin: "top", dir: "up", speed: 1.4, reach: 1.3, size: 0.07 },
  },
  "grand-finale": {
    motion: (t, s) => ({ dy: 0, scaleW: 1 + 0.06 * Math.max(0, wave(t, 1.2, s)), alpha: 1, glow: "#ffd54a", glowAmount: 0.35 }),
    emitter: { color: "#ffd54a", count: 14, origin: "center", dir: "radial", speed: 0.9, reach: 1.1, size: 0.06 },
  },
  "snuffed-out": {
    motion: (t, s) => ({ dy: 0.025 * wave(t, 0.8, s), scaleW: 1, alpha: 0.85 + 0.15 * flicker(t, s) }),
    emitter: { color: "#9aa0a6", count: 6, origin: "top", dir: "up", speed: 0.5, reach: 1.0, size: 0.09 },
  },
  sparkler: {
    motion: (t, s) => ({ dy: -0.02 * wave(t, 3, s), scaleW: 1, alpha: 1 }),
    emitter: { color: "#fff3b0", count: 12, origin: "top", dir: "radial", speed: 2.2, reach: 0.8, size: 0.045 },
  },
  "roman-candle": {
    motion: (t, s) => ({ dy: 0, scaleW: 1, alpha: 1, glow: "#ff6bd6", glowAmount: 0.2 + 0.3 * Math.max(0, wave(t, 0.9, s)) }),
    emitter: { color: "#ff6bd6", count: 3, origin: "top", dir: "up", speed: 0.9, reach: 1.6, size: 0.1 },
  },
  comet: {
    motion: (t, s) => ({ dy: 0.03 * wave(t, 2, s), scaleW: 1, alpha: 1, glow: "#8ecbff", glowAmount: 0.5 }),
    emitter: { color: "#bfe3ff", count: 9, origin: "top", dir: "up", speed: 1.0, reach: 1.5, size: 0.06 },
  },
  "falling-ember": {
    motion: (t, s) => ({ dy: 0.04 * wave(t, 1, s), scaleW: 1, alpha: 0.7 + 0.3 * flicker(t, s), glow: "#ff8a3d", glowAmount: 0.25 * flicker(t, s) }),
    emitter: { color: "#ff9a4d", count: 5, origin: "bottom", dir: "down", speed: 0.6, reach: 1.1, size: 0.05 },
  },
  "dawn-star": {
    motion: (t, s) => ({ dy: -0.02 * wave(t, 1, s), scaleW: 1, alpha: 1, glow: "#ffe08a", glowAmount: 0.3 + 0.3 * (0.5 + 0.5 * wave(t, 0.6, s)) }),
    emitter: { color: "#fff0b8", count: 6, origin: "center", dir: "radial", speed: 0.5, reach: 0.9, size: 0.04 },
  },
  "dusk-star": {
    motion: (t, s) => ({ dy: 0.02 * wave(t, 0.8, s), scaleW: 1, alpha: 0.6 + 0.4 * (0.5 + 0.5 * wave(t, 0.5, s)), glow: "#9b7bff", glowAmount: 0.3 }),
    emitter: { color: "#b9a6ff", count: 5, origin: "center", dir: "radial", speed: 0.4, reach: 0.8, size: 0.04 },
  },
};

/** Cheap deterministic hash in [0, 1). */
export function hash01(a: number, b: number): number {
  const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export interface Particle {
  x: number;
  y: number;
  alpha: number;
  radius: number;
}

/** Position of particle `k` for a sprite whose top-left is (x0, y0). */
export function particleAt(
  e: Emitter,
  k: number,
  seed: number,
  t: number,
  x0: number,
  y0: number,
  w: number,
  h: number,
): Particle {
  const phase = (t * e.speed + hash01(seed, k)) % 1;
  const jitter = hash01(k, seed + 3) - 0.5;
  const cx = x0 + w / 2;
  const oy = e.origin === "top" ? y0 : e.origin === "bottom" ? y0 + h : y0 + h / 2;
  let x = cx + jitter * w * 0.6;
  let y = oy;
  if (e.dir === "up") y -= phase * e.reach * w;
  else if (e.dir === "down") y += phase * e.reach * w;
  else {
    const angle = hash01(k, seed + 7) * Math.PI * 2;
    x = cx + Math.cos(angle) * phase * e.reach * w;
    y = oy + Math.sin(angle) * phase * e.reach * w;
  }
  return { x, y, alpha: 1 - phase, radius: e.size * w * (1 - phase * 0.5) };
}
