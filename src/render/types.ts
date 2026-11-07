/**
 * Shared parameter model — single source of truth for the UI, the WebGL
 * renderer, the code generator and the native export pipeline.
 *
 * The engine is built around two orthogonal ideas:
 *
 *  1. a **pattern archetype** — the structural language of the image
 *     (braid, threads, vortex, …), with a hybrid mode that blends any two;
 *  2. **canvas nodes** — independent field emitters the artist drops anywhere,
 *     each with its own behaviour, falloff and colour.
 *
 * Everything else (flow, structure, volume, palette, post) is a shared
 * parameter surface that every archetype reacts to.
 */

import type { IconName } from '../ui/Icon';

/* ========================================================================== */
/*  Patterns                                                                  */
/* ========================================================================== */

export type PatternId =
  | 'braid'
  | 'threads'
  | 'vortex'
  | 'lattice'
  | 'rift'
  | 'nebula'
  | 'storm'
  | 'shock'
  | 'crystal';

/** Array order is the shader's `uPattern` / `uMixPattern` integer. */
export const PATTERNS: {
  id: PatternId;
  index: number;
  label: string;
  icon: IconName;
  hint: string;
}[] = [
  { id: 'braid', index: 0, label: 'Braid', icon: 'braid', hint: 'Two masses weaving through each other' },
  { id: 'threads', index: 1, label: 'Threads', icon: 'threads', hint: 'Scattered fibre bundles and drifting strands' },
  { id: 'vortex', index: 2, label: 'Vortex', icon: 'vortex', hint: 'Spiral arms around a gravity well' },
  { id: 'lattice', index: 3, label: 'Lattice', icon: 'lattice', hint: 'Crossed waves, moiré and woven grids' },
  { id: 'rift', index: 4, label: 'Rift', icon: 'rift', hint: 'A torn seam leaking energy' },
  { id: 'nebula', index: 5, label: 'Nebula', icon: 'nebula', hint: 'Volumetric clouds colliding' },
  { id: 'storm', index: 6, label: 'Storm', icon: 'storm', hint: 'Discharges and branching arcs' },
  { id: 'shock', index: 7, label: 'Shockwave', icon: 'shock', hint: 'Radial shells and outward bursts' },
  { id: 'crystal', index: 8, label: 'Crystal', icon: 'crystal', hint: 'Hard-edged faceted cells' },
];

export const PATTERN_INDEX: Record<PatternId, number> = PATTERNS.reduce(
  (acc, p) => ({ ...acc, [p.id]: p.index }),
  {} as Record<PatternId, number>,
);

/* ========================================================================== */
/*  Canvas nodes                                                              */
/* ========================================================================== */

export type NodeKind =
  | 'attract'
  | 'repel'
  | 'vortex'
  | 'sink'
  | 'shear'
  | 'burst'
  | 'ripple'
  | 'magnet'
  | 'source';

export const NODE_KINDS: { id: NodeKind; label: string; icon: IconName; hint: string }[] = [
  { id: 'attract', label: 'Attract', icon: 'attract', hint: 'Pulls the flow inward' },
  { id: 'repel', label: 'Repel', icon: 'repel', hint: 'Pushes the flow outward' },
  { id: 'vortex', label: 'Vortex', icon: 'swirl', hint: 'Rotates the flow around the node' },
  { id: 'sink', label: 'Sink', icon: 'sink', hint: 'Drains and compresses the field' },
  { id: 'shear', label: 'Shear', icon: 'shear', hint: 'Cuts the flow along a direction' },
  { id: 'burst', label: 'Burst', icon: 'burst', hint: 'Shock front pushing outward' },
  { id: 'ripple', label: 'Ripple', icon: 'ripple', hint: 'Concentric rings disturbing the field' },
  { id: 'magnet', label: 'Magnet', icon: 'magnet', hint: 'Aligns the flow to a direction' },
  { id: 'source', label: 'Source', icon: 'source', hint: 'Emits matter from the point' },
];

/** Integer encoding for the shader (index into NODE_KINDS). */
export const NODE_KIND_INDEX: Record<NodeKind, number> = NODE_KINDS.reduce(
  (acc, k, i) => ({ ...acc, [k.id]: i }),
  {} as Record<NodeKind, number>,
);

export interface AuraNode {
  id: string;
  name: string;
  /** position in uv space ([-0.5..0.5] on the short axis) */
  x: number;
  y: number;
  kind: NodeKind;
  /** signed drive, -1..1 */
  strength: number;
  /** radius of influence, 0.04..0.9 */
  radius: number;
  /** falloff sharpness, 0.4 (soft) .. 6 (hard) */
  falloff: number;
  /** hex tint painted into the node's neighbourhood */
  color: string;
  /** how strongly the node paints its region, 0..1 */
  colorMix: number;
  enabled: boolean;
}

/* ========================================================================== */
/*  Palette                                                                   */
/* ========================================================================== */

export type PaletteMode = 'flow' | 'radial' | 'depth' | 'noise' | 'vertical';

export const PALETTE_MODES: { id: PaletteMode; label: string; hint: string }[] = [
  { id: 'flow', label: 'Along Flow', hint: 'Ramp follows the direction of the field' },
  { id: 'radial', label: 'Radial', hint: 'Ramp follows distance from centre' },
  { id: 'depth', label: 'Depth', hint: 'Ramp follows the volumetric depth' },
  { id: 'noise', label: 'Noise', hint: 'Ramp follows a low-frequency noise field' },
  { id: 'vertical', label: 'Vertical', hint: 'Ramp follows the screen Y axis' },
];

export const PALETTE_MODE_INDEX: Record<PaletteMode, number> = {
  flow: 0,
  radial: 1,
  depth: 2,
  noise: 3,
  vertical: 4,
};

/* ========================================================================== */
/*  Parameters                                                                */
/* ========================================================================== */

export interface AuraParams {
  /* --- pattern --- */
  pattern: PatternId;
  mixPattern: PatternId;
  mix: number;

  /* --- flow & chaos --- */
  turbulenceScale: number;
  curlIntensity: number;
  zigzag: number;
  compression: number;
  evolutionSpeed: number;
  warpIterations: number;
  shear: number;
  vorticity: number;
  direction: number;
  mirror: number;

  /* --- structure --- */
  threadCount: number;
  threadSpread: number;
  sharpness: number;
  bandFreq: number;
  twist: number;
  sparsity: number;

  /* --- volume & particles --- */
  smokeDensity: number;
  filamentSharp: number;
  glow: number;
  steps: number;
  scatter: number;
  sparkSize: number;
  trail: number;

  /* --- palette --- */
  palette: string[];
  paletteMode: PaletteMode;
  hueShift: number;
  colorCycle: number;
  saturation: number;
  exposure: number;
  bgDark: number;

  /* --- post --- */
  bloom: number;
  chroma: number;
  vignette: number;
  posterize: number;
  scanlines: number;
  grain: number;
  grainSize: number;

  /* --- seed / engine --- */
  seed: number;
  guard: boolean;
}

export const DEFAULT_PALETTE = ['#04120c', '#0f8f5f', '#3ef0a8', '#ff2f4e', '#ffd9c2'];

export const DEFAULT_PARAMS: AuraParams = {
  pattern: 'braid',
  mixPattern: 'threads',
  mix: 0,

  turbulenceScale: 1.7,
  curlIntensity: 0.35,
  zigzag: 1.15,
  compression: 0,
  evolutionSpeed: 0.85,
  warpIterations: 2,
  shear: 0,
  vorticity: 0,
  direction: 0,
  mirror: 0,

  threadCount: 14,
  threadSpread: 0.35,
  sharpness: 1,
  bandFreq: 6,
  twist: 0.5,
  sparsity: 0.45,

  smokeDensity: 1,
  filamentSharp: 2.4,
  glow: 1.15,
  steps: 28,
  scatter: 140,
  sparkSize: 1,
  trail: 0.3,

  palette: [...DEFAULT_PALETTE],
  paletteMode: 'flow',
  hueShift: 0,
  colorCycle: 0,
  saturation: 1,
  exposure: 1.25,
  bgDark: 0.94,

  bloom: 0.35,
  chroma: 0,
  vignette: 0.5,
  posterize: 0,
  scanlines: 0,
  grain: 0.35,
  grainSize: 1,

  seed: 1337,
  guard: false,
};

/* ══════════════════════ output formats & resolutions ══════════════════════
 * The shader derives uv from the render target as `(frag - 0.5*res) / res.y`,
 * so the VERTICAL framing is identical at every aspect and only the horizontal
 * field of view widens or narrows. Changing the format therefore reframes the
 * same composition rather than stretching it.
 * ══════════════════════════════════════════════════════════════════════════ */


export type AspectId = 'reels' | 'portrait' | 'square' | 'landscape' | 'photo' | 'cinema';
export type TierId = 'draft' | 'hd' | '2k' | '4k';

export interface AspectDef {
  id: AspectId;
  label: string;
  /** width / height */
  ratio: number;
  short: string;
  use: string;
  /** every size is even — h.264 refuses odd dimensions */
  sizes: Record<TierId, [number, number]>;
}

export const TIERS: { id: TierId; label: string; note: string }[] = [
  { id: 'draft', label: 'Draft', note: 'fast tests' },
  { id: 'hd', label: 'HD', note: '1080-class' },
  { id: '2k', label: '2K', note: '1440-class' },
  { id: '4k', label: '4K', note: 'for the edit' },
];

export const ASPECTS: AspectDef[] = [
  {
    id: 'reels',
    label: 'Reels',
    ratio: 9 / 16,
    short: '9:16',
    use: 'Reels · Stories · TikTok',
    sizes: {
      draft: [720, 1280],
      hd: [1080, 1920],
      '2k': [1440, 2560],
      '4k': [2160, 3840],
    },
  },
  {
    id: 'portrait',
    label: 'Portrait',
    ratio: 4 / 5,
    short: '4:5',
    use: 'Instagram feed',
    sizes: {
      draft: [720, 900],
      hd: [1080, 1350],
      '2k': [1440, 1800],
      '4k': [2160, 2700],
    },
  },
  {
    id: 'square',
    label: 'Square',
    ratio: 1,
    short: '1:1',
    use: 'Feed · album art',
    sizes: {
      draft: [720, 720],
      hd: [1080, 1080],
      '2k': [1440, 1440],
      '4k': [2160, 2160],
    },
  },
  {
    id: 'photo',
    label: 'Photo',
    ratio: 3 / 2,
    short: '3:2',
    use: 'Photography · print',
    sizes: {
      draft: [1200, 800],
      hd: [1800, 1200],
      '2k': [2400, 1600],
      '4k': [3600, 2400],
    },
  },
  {
    id: 'landscape',
    label: 'Landscape',
    ratio: 16 / 9,
    short: '16:9',
    use: 'YouTube · TV · desktop',
    sizes: {
      draft: [1280, 720],
      hd: [1920, 1080],
      '2k': [2560, 1440],
      '4k': [3840, 2160],
    },
  },
  {
    id: 'cinema',
    label: 'Cinema',
    ratio: 2.39,
    short: '2.39:1',
    use: 'Wide banner · title card',
    sizes: {
      draft: [1280, 536],
      hd: [1920, 804],
      '2k': [2560, 1072],
      '4k': [3840, 1608],
    },
  },
];

export const DEFAULT_ASPECT: AspectId = 'reels';
export const DEFAULT_TIER: TierId = 'hd';

export function aspectDef(id: AspectId): AspectDef {
  return ASPECTS.find((a) => a.id === id) ?? ASPECTS[0];
}

export function outputSize(aspect: AspectId, tier: TierId): [number, number] {
  return aspectDef(aspect).sizes[tier];
}

export const DEFAULT_NODES: AuraNode[] = [
  {
    id: 'n1',
    name: 'Anchor A',
    x: -0.21,
    y: 0.32,
    kind: 'attract',
    strength: 0.18,
    radius: 0.3,
    falloff: 1.6,
    color: '#3ef0a8',
    colorMix: 0.18,
    enabled: true,
  },
  {
    id: 'n2',
    name: 'Anchor B',
    x: 0.22,
    y: -0.34,
    kind: 'repel',
    strength: -0.14,
    radius: 0.26,
    falloff: 1.6,
    color: '#ff2f4e',
    colorMix: 0.18,
    enabled: true,
  },
];

export const MAX_NODES = 8;
export const MAX_PALETTE_STOPS = 5;

/* ========================================================================== */
/*  Built-in scenes                                                           */
/* ========================================================================== */

export interface Scene {
  name: string;
  blurb: string;
  params: Partial<AuraParams>;
  nodes?: AuraNode[];
}

function n(
  id: string,
  name: string,
  x: number,
  y: number,
  kind: NodeKind,
  strength: number,
  radius: number,
  falloff: number,
  color: string,
  colorMix: number,
): AuraNode {
  return { id, name, x, y, kind, strength, radius, falloff, color, colorMix, enabled: true };
}

export const SCENES: Scene[] = [
  {
    name: 'Emerald Collision',
    blurb: 'The default braided opposition.',
    params: {},
    nodes: DEFAULT_NODES.map((x) => ({ ...x })),
  },
  {
    name: 'Silk Drift',
    blurb: 'Thousands of fibres sliding past each other.',
    params: {
      pattern: 'threads',
      threadCount: 34,
      threadSpread: 0.62,
      sharpness: 1.8,
      smokeDensity: 0.6,
      glow: 1.5,
      turbulenceScale: 3.4,
      palette: ['#05070d', '#1b3fa0', '#63d6ff', '#c8a6ff', '#fff2d8'],
      bgDark: 0.96,
      grain: 0.4,
      bloom: 0.5,
    },
    nodes: [n('s1', 'Loom', -0.05, 0.1, 'shear', 0.5, 0.65, 2.2, '#63d6ff', 0.35)],
  },
  {
    name: 'Event Horizon',
    blurb: 'Spiral accretion with a real sink.',
    params: {
      pattern: 'vortex',
      twist: 1.15,
      bandFreq: 9,
      vorticity: 0.6,
      sparsity: 0.3,
      palette: ['#000000', '#3a1a5e', '#b14cff', '#ffd166', '#ffffff'],
      bgDark: 1,
      glow: 1.7,
      bloom: 0.7,
      chroma: 0.35,
      grain: 0.25,
    },
    nodes: [n('v1', 'Well', 0, 0, 'sink', -0.75, 0.55, 2.6, '#b14cff', 0.5)],
  },
  {
    name: 'Loom',
    blurb: 'Woven interference, near-monochrome.',
    params: {
      pattern: 'lattice',
      threadCount: 22,
      bandFreq: 14,
      sharpness: 3.2,
      sparsity: 0.55,
      palette: ['#0a0a0a', '#123b52', '#2ee6c8', '#e8fff6', '#ffffff'],
      paletteMode: 'vertical',
      bgDark: 0.98,
      glow: 1.1,
      bloom: 0.3,
      grain: 0.3,
    },
  },
  {
    name: 'Fracture',
    blurb: 'A torn seam with light bleeding through.',
    params: {
      pattern: 'rift',
      twist: 0.35,
      zigzag: 2.4,
      filamentSharp: 3.6,
      sharpness: 2.4,
      palette: ['#050505', '#5a0f1f', '#ff2f4e', '#ffb03a', '#fff6e0'],
      paletteMode: 'radial',
      bgDark: 0.99,
      glow: 2.0,
      bloom: 0.55,
      chroma: 0.5,
    },
    nodes: [n('f1', 'Tear', 0, 0, 'ripple', 0.4, 0.5, 3.0, '#ffb03a', 0.4)],
  },
  {
    name: 'Cold Nebula',
    blurb: 'Slow volumetric clouds, almost no filaments.',
    params: {
      pattern: 'nebula',
      turbulenceScale: 1.15,
      smokeDensity: 1.6,
      filamentSharp: 1.2,
      glow: 0.6,
      sharpness: 0.6,
      palette: ['#030509', '#123a6b', '#4f8fe0', '#c6e3ff', '#fff4ea'],
      paletteMode: 'noise',
      bgDark: 0.97,
      grain: 0.5,
      bloom: 0.45,
      evolutionSpeed: 0.4,
    },
  },
  {
    name: 'Discharge',
    blurb: 'Branching arcs and ash, no soft volume.',
    params: {
      pattern: 'storm',
      zigzag: 2.7,
      filamentSharp: 4.2,
      smokeDensity: 0.35,
      glow: 2.3,
      twist: 0.8,
      palette: ['#050505', '#1b2cff', '#63d6ff', '#e6f7ff', '#ffffff'],
      bgDark: 1,
      bloom: 0.8,
      grain: 0.3,
      scatter: 320,
    },
  },
  {
    name: 'Detonation',
    blurb: 'Outward shells from a single point.',
    params: {
      pattern: 'shock',
      bandFreq: 11,
      twist: 0.25,
      palette: ['#0a0000', '#7a1400', '#ff6a00', '#ffd166', '#fffdf5'],
      paletteMode: 'radial',
      bgDark: 1,
      glow: 1.9,
      bloom: 0.75,
      chroma: 0.28,
    },
    nodes: [n('d1', 'Core', 0, -0.05, 'burst', 0.8, 0.4, 3.4, '#ffd166', 0.45)],
  },
  {
    name: 'Prism',
    blurb: 'Hard faceted cells, gemstone palette.',
    params: {
      pattern: 'crystal',
      threadCount: 16,
      sharpness: 3.6,
      sparsity: 0.4,
      mirror: 0.55,
      palette: ['#04070a', '#0f4d5c', '#39e6d0', '#ff4fa3', '#fff0f6'],
      paletteMode: 'noise',
      bgDark: 0.98,
      glow: 1.3,
      bloom: 0.5,
      posterize: 6,
    },
  },
];

/* ------------------------------- helpers ------------------------------- */

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const int = Number.parseInt(full, 16);
  if (!Number.isFinite(int)) return [0, 0, 0];
  return [((int >> 16) & 255) / 255, ((int >> 8) & 255) / 255, (int & 255) / 255];
}

export function rgbToHex(rgb: [number, number, number]): string {
  const c = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v * 255)))
      .toString(16)
      .padStart(2, '0');
  return `#${c(rgb[0])}${c(rgb[1])}${c(rgb[2])}`;
}

/** Deterministic 32-bit PRNG so presets are reproducible across sessions. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Preset {
  name: string;
  version: 2;
  params: AuraParams;
  nodes: AuraNode[];
}
