/**
 * The interface picks up the artwork's colour.
 *
 * The chrome itself stays neutral — that is the design language, and a UI that
 * competes with the canvas is a UI nobody can judge colour in. What does move
 * is the accent: the rail indicator, slider fills, toggles, progress bars and
 * focus rings all take their colour from the current palette, so the app reads
 * as alive without ever becoming a coloured toy.
 *
 * The chosen stop is clamped into a band that stays legible behind dark text —
 * vivid enough to feel alive, never neon.
 */

const NEUTRAL = 'rgb(214 214 214)';
const NEUTRAL_GLOW = 'rgb(214 214 214 / 0.16)';

function parseHex(hex: string): [number, number, number] {
  const raw = hex.replace('#', '').trim();
  const full =
    raw.length === 3
      ? raw
          .split('')
          .map((c) => c + c)
          .join('')
      : raw;
  const n = Number.parseInt(full.slice(0, 6), 16);
  if (Number.isNaN(n)) return [214, 214, 214];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** h, s, l all in 0..1 */
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rr = r / 255;
  const gg = g / 255;
  const bb = b / 255;
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const l = (max + min) / 2;

  if (max === min) return [0, 0, l];

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

  let h: number;
  if (max === rr) h = ((gg - bb) / d + (gg < bb ? 6 : 0)) / 6;
  else if (max === gg) h = ((bb - rr) / d + 2) / 6;
  else h = ((rr - gg) / d + 4) / 6;

  return [h, s, l];
}

function hueToRgb(p: number, q: number, t: number): number {
  let tt = t;
  if (tt < 0) tt += 1;
  if (tt > 1) tt -= 1;
  if (tt < 1 / 6) return p + (q - p) * 6 * tt;
  if (tt < 1 / 2) return q;
  if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
  return p;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    Math.round(hueToRgb(p, q, h + 1 / 3) * 255),
    Math.round(hueToRgb(p, q, h) * 255),
    Math.round(hueToRgb(p, q, h - 1 / 3) * 255),
  ];
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/**
 * Picks the palette stop that reads as the artwork's identity, then clamps it
 * into a usable accent.
 *
 * Scoring by brightness alone fails: the most luminous stop is nearly always
 * the near-white highlight, which carries no hue and would make every look
 * produce the same washed-out accent. Scoring by saturation alone fails the
 * other way, choosing a dark saturated shadow. Scoring by both, peaking at
 * mid lightness, picks the colour a person would actually name.
 */
export function liveAccent(palette: readonly string[]): { live: string; glow: string } {
  if (!palette || palette.length === 0) {
    return { live: NEUTRAL, glow: NEUTRAL_GLOW };
  }

  let best: string | null = null;
  let bestScore = -1;

  for (const hex of palette) {
    const [r, g, b] = parseHex(hex);
    const [, s, l] = rgbToHsl(r, g, b);
    const score = s * (1 - Math.min(1, Math.abs(l - 0.6) * 1.3));
    if (score > bestScore) {
      bestScore = score;
      best = hex;
    }
  }

  if (!best) return { live: NEUTRAL, glow: NEUTRAL_GLOW };

  const [r, g, b] = parseHex(best);
  const [h, s, l] = rgbToHsl(r, g, b);

  // an achromatic winner means the palette has no identity colour to borrow
  if (s < 0.12) return { live: NEUTRAL, glow: NEUTRAL_GLOW };

  const [rr, gg, bb] = hslToRgb(h, clamp(s, 0.32, 0.62), clamp(l, 0.58, 0.74));

  return {
    live: `rgb(${rr} ${gg} ${bb})`,
    glow: `rgb(${rr} ${gg} ${bb} / 0.16)`,
  };
}

/**
 * Publishes the accent onto the document so plain CSS can use it.
 * Returns the resolved colour, which the self test prints.
 */
export function applyLiveAccent(palette: readonly string[]): string {
  const { live, glow } = liveAccent(palette);
  const root = document.documentElement.style;
  root.setProperty('--live', live);
  root.setProperty('--live-glow', glow);
  return live;
}
