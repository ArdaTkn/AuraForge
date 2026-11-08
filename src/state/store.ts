import { create } from 'zustand';
import type { IconName } from '../ui/Icon';
import {
  AspectId,
  AuraNode,
  AuraParams,
  DEFAULT_ASPECT,
  DEFAULT_NODES,
  DEFAULT_PARAMS,
  DEFAULT_PALETTE,
  DEFAULT_TIER,
  MAX_NODES,
  MAX_PALETTE_STOPS,
  NODE_KINDS,
  NodeKind,
  PATTERNS,
  PaletteMode,
  PatternId,
  Preset,
  Scene,
  TierId,
  mulberry32,
  rgbToHex,
} from '../render/types';

const PRESET_KEY = 'auraforge.presets.v2';
const HISTORY_LIMIT = 80;
/** Rapid changes (a slider drag) collapse into one undo step. */
const HISTORY_COALESCE_MS = 420;

/** Every parameter that is a plain number (everything except the enums/arrays). */
export type NumericParamKey = Exclude<
  keyof AuraParams,
  'palette' | 'paletteMode' | 'pattern' | 'mixPattern' | 'guard'
>;

export type SectionId =
  | 'scenes'
  | 'pattern'
  | 'flow'
  | 'structure'
  | 'volume'
  | 'palette'
  | 'post'
  | 'nodes'
  | 'export';

/* -------------------------- export quality ladder --------------------------
 * CRF is x264's constant-rate-factor scale: lower is better and bigger.
 *   CRF 0  = mathematically lossless (still compresses, but decodes identical)
 *   CRF 12 = visually indistinguishable from the master at normal viewing
 *   CRF 18 = the practical sweet spot for social video
 *   CRF 28 = small and quick, visible blocking in gradients
 * `pix_fmt` matters as much as CRF: 4:2:0 throws away three quarters of the
 * colour resolution, which is exactly what Instagram and TikTok expect, while
 * 4:4:4 keeps it and is rejected by some players and most social platforms.
 * ------------------------------------------------------------------------- */

export type QualityId = 'draft' | 'stream' | 'high' | 'master' | 'lossless';

export interface QualityDef {
  id: QualityId;
  label: string;
  /** one-line plain-language meaning */
  summary: string;
  /** the technical reality behind it */
  detail: string;
  crf: number;
  preset: string;
  pixFmt: string;
  /** rough multiple of the "high" file size, for the size hint */
  weight: number;
  /** false when the platform route is likely to reject it */
  socialSafe: boolean;
}

export const QUALITIES: QualityDef[] = [
  {
    id: 'draft',
    label: 'Draft',
    summary: 'Fast and small — for checking motion, not for posting.',
    detail: 'CRF 28 · veryfast · 4:2:0',
    crf: 28,
    preset: 'veryfast',
    pixFmt: 'yuv420p',
    weight: 0.3,
    socialSafe: true,
  },
  {
    id: 'stream',
    label: 'Stream',
    summary: 'Light file for web and quick uploads. Some softness in gradients.',
    detail: 'CRF 23 · fast · 4:2:0',
    crf: 23,
    preset: 'fast',
    pixFmt: 'yuv420p',
    weight: 0.6,
    socialSafe: true,
  },
  {
    id: 'high',
    label: 'High',
    summary: 'The default for Reels, TikTok and YouTube. Clean at normal viewing.',
    detail: 'CRF 18 · medium · 4:2:0',
    crf: 18,
    preset: 'medium',
    pixFmt: 'yuv420p',
    weight: 1,
    socialSafe: true,
  },
  {
    id: 'master',
    label: 'Master',
    summary: 'Visually lossless. For archiving or re-editing later.',
    detail: 'CRF 12 · slow · 4:2:0',
    crf: 12,
    preset: 'slow',
    pixFmt: 'yuv420p',
    weight: 2.4,
    socialSafe: true,
  },
  {
    id: 'lossless',
    label: 'Lossless',
    summary: 'Pixel for pixel identical. Huge, and some players and platforms refuse it.',
    detail: 'CRF 0 · medium · 4:4:4',
    crf: 0,
    preset: 'medium',
    pixFmt: 'yuv444p',
    weight: 6,
    socialSafe: false,
  },
];

export function qualityDef(id: QualityId): QualityDef {
  return QUALITIES.find((q) => q.id === id) ?? QUALITIES[2];
}

/* ------------------------------- still images ------------------------------ */

export type StillFormat = 'png' | 'jpeg' | 'webp';

export interface StillDef {
  id: StillFormat;
  label: string;
  mime: string;
  ext: string;
  lossy: boolean;
  summary: string;
}

export const STILL_FORMATS: StillDef[] = [
  {
    id: 'png',
    label: 'PNG',
    mime: 'image/png',
    ext: 'png',
    lossy: false,
    summary: 'Lossless, every pixel exact. Largest file.',
  },
  {
    id: 'jpeg',
    label: 'JPEG',
    mime: 'image/jpeg',
    ext: 'jpg',
    lossy: true,
    summary: 'Small and universal. Slight softness in dark gradients.',
  },
  {
    id: 'webp',
    label: 'WebP',
    mime: 'image/webp',
    ext: 'webp',
    lossy: true,
    summary: 'Smallest for the web, good quality per byte.',
  },
];

export const SECTIONS: { id: SectionId; label: string; icon: IconName; hint: string }[] = [
  { id: 'scenes', label: 'Scenes', icon: 'scenes', hint: 'Nine complete built-in looks' },
  { id: 'pattern', label: 'Pattern', icon: 'pattern', hint: 'Structural archetype and hybrid blend' },
  { id: 'flow', label: 'Flow', icon: 'flow', hint: 'Turbulence, warping and direction' },
  { id: 'structure', label: 'Structure', icon: 'structure', hint: 'Threads, sharpness, bands, twist' },
  { id: 'volume', label: 'Volume', icon: 'volume', hint: 'Density, filaments, particles, quality' },
  { id: 'palette', label: 'Colour', icon: 'colour', hint: 'Gradient ramp and mapping' },
  { id: 'post', label: 'Post', icon: 'post', hint: 'Bloom, vignette, grain and grade' },
  { id: 'nodes', label: 'Nodes', icon: 'nodes', hint: 'Independent field emitters' },
  { id: 'export', label: 'Export', icon: 'export', hint: 'Format, resolution, stills, video' },
];

interface Snapshot {
  params: AuraParams;
  nodes: AuraNode[];
}

interface AuraState extends Snapshot {
  selectedNode: string | null;
  /** behaviour applied to the next node dropped on the canvas */
  brush: NodeKind;
  /** which contextual panel is showing */
  section: SectionId;
  /** false = full-bleed canvas */
  panelOpen: boolean;
  /** output framing — drives the canvas shape and every export */
  aspect: AspectId;
  tier: TierId;
  playing: boolean;
  exporting: boolean;
  /** true while the scene gallery renders its thumbnails */
  thumbnailPass: boolean;
  epoch: number;
  savedPresets: Preset[];
  status: string | null;
  history: Snapshot[];
  future: Snapshot[];

  setParam: (key: NumericParamKey, value: number) => void;
  setPattern: (id: PatternId) => void;
  setMixPattern: (id: PatternId) => void;
  setMix: (v: number) => void;
  setPaletteStop: (index: number, hex: string) => void;
  addPaletteStop: () => void;
  removePaletteStop: (index: number) => void;
  setPaletteMode: (mode: PaletteMode) => void;
  rotatePalette: (direction: number) => void;
  toggleGuard: () => void;

  addNode: (x: number, y: number, kind?: NodeKind) => void;
  duplicateNode: (id: string) => void;
  updateNode: (id: string, patch: Partial<AuraNode>, silent?: boolean) => void;
  removeNode: (id: string) => void;
  selectNode: (id: string | null) => void;
  clearNodes: () => void;
  setBrush: (kind: NodeKind) => void;
  randomizeNode: (id: string) => void;

  randomizeSeed: () => void;
  subtleMutate: () => void;
  resetAll: () => void;
  applyScene: (scene: Scene) => void;
  setStatus: (s: string | null) => void;

  setSection: (id: SectionId) => void;
  togglePanel: () => void;
  setThumbnailPass: (on: boolean) => void;

  setAspect: (a: AspectId) => void;
  setTier: (t: TierId) => void;

  togglePlay: () => void;
  resetClock: () => void;
  setExporting: (on: boolean) => void;

  undo: () => void;
  redo: () => void;

  savePreset: (name: string) => void;
  loadPreset: (preset: Preset) => void;
  deletePreset: (name: string) => void;
  importPreset: (json: string) => boolean;
}

/* ------------------------------- storage ------------------------------- */

function readPresets(): Preset[] {
  try {
    const raw = localStorage.getItem(PRESET_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Preset[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writePresets(presets: Preset[]) {
  try {
    localStorage.setItem(PRESET_KEY, JSON.stringify(presets));
  } catch {
    /* storage unavailable — presets stay in memory for this session */
  }
}

/* ------------------------------- helpers ------------------------------- */

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}

function hslToHex(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l);
  const f = (nn: number) => {
    const k = (nn + h / 30) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
  };
  return rgbToHex([f(0), f(8), f(4)]);
}

/** Builds a 5-stop ramp from a base hue with a controlled excursion. */
function randomPalette(seed: number): string[] {
  const rnd = mulberry32(seed);
  const h = rnd() * 360;
  const spread = 40 + rnd() * 200;
  const reverse = rnd() > 0.5;
  const stops: string[] = [];
  for (let i = 0; i < MAX_PALETTE_STOPS; i++) {
    const t = i / (MAX_PALETTE_STOPS - 1);
    const l = 0.03 + t * 0.82;
    const s = 0.35 + 0.6 * Math.sin(t * Math.PI);
    const hh = h + (reverse ? 1 - t : t) * spread;
    stops.push(hslToHex(((hh % 360) + 360) % 360, clamp(s, 0, 1), clamp(l, 0, 1)));
  }
  return stops;
}

function randomKind(): NodeKind {
  return NODE_KINDS[Math.floor(Math.random() * NODE_KINDS.length)].id;
}

/** Merges a partial parameter set over the defaults, keeping the palette sane. */
export function mergeParams(partial: Partial<AuraParams>): AuraParams {
  const merged: AuraParams = { ...DEFAULT_PARAMS, ...partial };
  merged.palette =
    partial.palette && partial.palette.length >= 2
      ? partial.palette.slice(0, MAX_PALETTE_STOPS)
      : [...DEFAULT_PALETTE];
  merged.steps = Math.round(merged.steps);
  merged.threadCount = Math.round(merged.threadCount);
  merged.warpIterations = Math.round(merged.warpIterations);
  return merged;
}

let nodeSeq = 100;

function makeNode(x: number, y: number, kind: NodeKind, rnd: () => number): AuraNode {
  return {
    id: `n${nodeSeq++}`,
    name: `Node ${nodeSeq - 100}`,
    x,
    y,
    kind,
    strength: (rnd() > 0.5 ? 1 : -1) * (0.2 + rnd() * 0.7),
    radius: 0.25 + rnd() * 0.4,
    falloff: 1.0 + rnd() * 2.4,
    color: hslToHex(rnd() * 360, 0.75, 0.55),
    colorMix: 0.15 + rnd() * 0.5,
    enabled: true,
  };
}

/* -------------------------------- store -------------------------------- */

export const useAuraStore = create<AuraState>((set, get) => {
  let lastPush = 0;

  /** Records the current state so the next mutation can be undone. */
  const push = () => {
    const now = Date.now();
    if (now - lastPush < HISTORY_COALESCE_MS && get().history.length > 0) {
      lastPush = now;
      return;
    }
    lastPush = now;
    const { params, nodes, history } = get();
    set({
      history: [...history, { params, nodes }].slice(-HISTORY_LIMIT),
      future: [],
    });
  };

  return {
    params: { ...DEFAULT_PARAMS, palette: [...DEFAULT_PALETTE] },
    nodes: DEFAULT_NODES.map((n) => ({ ...n })),
    selectedNode: null,
    brush: 'attract',
    section: 'pattern',
    panelOpen: true,
    aspect: DEFAULT_ASPECT,
    tier: DEFAULT_TIER,
    playing: true,
    exporting: false,
    thumbnailPass: false,
    epoch: 0,
    savedPresets: readPresets(),
    status: null,
    history: [],
    future: [],

    setParam: (key, value) => {
      push();
      set((s) => ({ params: { ...s.params, [key]: value } }));
    },

    setPattern: (id) => {
      push();
      set((s) => ({ params: { ...s.params, pattern: id }, status: null }));
    },
    setMixPattern: (id) => {
      push();
      set((s) => ({ params: { ...s.params, mixPattern: id }, status: null }));
    },
    setMix: (v) => {
      push();
      set((s) => ({ params: { ...s.params, mix: clamp(v, 0, 1) } }));
    },

    setPaletteStop: (index, hex) => {
      push();
      set((s) => ({
        params: { ...s.params, palette: s.params.palette.map((c, i) => (i === index ? hex : c)) },
      }));
    },

    addPaletteStop: () => {
      if (get().params.palette.length >= MAX_PALETTE_STOPS) return;
      push();
      set((s) => ({
        params: {
          ...s.params,
          palette: [...s.params.palette, s.params.palette[s.params.palette.length - 1]],
        },
      }));
    },

    removePaletteStop: (index) => {
      if (get().params.palette.length <= 2) return;
      push();
      set((s) => ({
        params: { ...s.params, palette: s.params.palette.filter((_, i) => i !== index) },
      }));
    },

    setPaletteMode: (mode) => {
      push();
      set((s) => ({ params: { ...s.params, paletteMode: mode } }));
    },

    rotatePalette: (direction) => {
      push();
      set((s) => {
        const p = s.params.palette;
        if (p.length < 2) return s;
        const n = p.length;
        const shift = ((direction % n) + n) % n;
        return {
          params: { ...s.params, palette: p.map((_, i) => p[(i + shift) % n]) },
        };
      });
    },

    toggleGuard: () => {
      push();
      set((s) => ({
        params: { ...s.params, guard: !s.params.guard },
        status: s.params.guard ? 'Performance Guard off' : 'Performance Guard on',
      }));
    },

    addNode: (x, y, kind) => {
      if (get().nodes.length >= MAX_NODES) {
        set({ status: `Node limit reached (${MAX_NODES})` });
        return;
      }
      push();
      const rnd = mulberry32(Math.floor(Math.random() * 1e9));
      const node = makeNode(x, y, kind ?? get().brush, rnd);
      set((s) => ({
        nodes: [...s.nodes, node],
        selectedNode: node.id,
        section: 'nodes',
        panelOpen: true,
        status: null,
      }));
    },

    duplicateNode: (id) => {
      if (get().nodes.length >= MAX_NODES) {
        set({ status: `Node limit reached (${MAX_NODES})` });
        return;
      }
      push();
      set((s) => {
        const src = s.nodes.find((n) => n.id === id);
        if (!src) return s;
        const copy: AuraNode = {
          ...src,
          id: `n${nodeSeq++}`,
          name: `${src.name} copy`,
          x: clamp(src.x + 0.06, -0.6, 0.6),
          y: clamp(src.y - 0.06, -0.5, 0.5),
        };
        return { nodes: [...s.nodes, copy], selectedNode: copy.id, status: null };
      });
    },

    updateNode: (id, patch, silent) => {
      if (!silent) push();
      set((s) => ({ nodes: s.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) }));
    },

    removeNode: (id) => {
      push();
      set((s) => ({
        nodes: s.nodes.filter((n) => n.id !== id),
        selectedNode: s.selectedNode === id ? null : s.selectedNode,
      }));
    },

    // Clicking an anchor on the canvas opens its editor in the panel. The
    // canvas is for placing anchors; the panel is for editing them, so there
    // is exactly one place any property can be changed.
    selectNode: (id) =>
      set((s) => ({ selectedNode: id, section: id ? 'nodes' : s.section })),

    clearNodes: () => {
      push();
      set({ nodes: [], selectedNode: null });
    },

    setBrush: (kind) => set({ brush: kind }),

    randomizeNode: (id) => {
      push();
      set((s) => {
        const rnd = mulberry32(Math.floor(Math.random() * 1e9));
        return {
          nodes: s.nodes.map((n) =>
            n.id === id
              ? {
                  ...n,
                  kind: randomKind(),
                  strength: (rnd() > 0.5 ? 1 : -1) * (0.2 + rnd() * 0.7),
                  radius: 0.25 + rnd() * 0.4,
                  falloff: 1.0 + rnd() * 2.4,
                  color: hslToHex(rnd() * 360, 0.75, 0.55),
                  colorMix: 0.15 + rnd() * 0.5,
                }
              : n,
          ),
          status: 'Node rerolled',
        };
      });
    },

    randomizeSeed: () => {
      push();
      const seed = Math.floor(Math.random() * 1_000_000);
      const rnd = mulberry32(seed);
      const pattern = PATTERNS[Math.floor(rnd() * PATTERNS.length)].id;
      const mixPattern = PATTERNS[Math.floor(rnd() * PATTERNS.length)].id;
      const mix = rnd() > 0.55 ? rnd() * 0.7 : 0;

      set((s) => ({
        params: {
          ...s.params,
          seed,
          pattern,
          mixPattern,
          mix,
          palette: randomPalette(seed),
          paletteMode: (['flow', 'radial', 'depth', 'noise', 'vertical'] as PaletteMode[])[
            Math.floor(rnd() * 5)
          ],
          turbulenceScale: 0.8 + rnd() * 5.5,
          curlIntensity: 0.15 + rnd() * 1.2,
          zigzag: 0.2 + rnd() * 2.4,
          shear: (rnd() - 0.5) * 1.2,
          vorticity: (rnd() - 0.5) * 1.2,
          direction: rnd(),
          mirror: rnd() > 0.75 ? rnd() : 0,
          compression: (rnd() - 0.5) * 1.2,
          warpIterations: 1 + Math.floor(rnd() * 3),
          threadCount: 4 + Math.floor(rnd() * 40),
          threadSpread: rnd(),
          sharpness: 0.5 + rnd() * 3.5,
          bandFreq: 2 + rnd() * 16,
          twist: rnd() * 1.5,
          sparsity: rnd() * 0.7,
          smokeDensity: 0.4 + rnd() * 1.4,
          filamentSharp: 1.2 + rnd() * 4.5,
          glow: 0.5 + rnd() * 2.0,
          scatter: Math.round(rnd() * 320),
          sparkSize: 0.5 + rnd() * 2,
          trail: rnd(),
          bloom: rnd() * 0.9,
          chroma: rnd() > 0.6 ? rnd() * 0.6 : 0,
          vignette: rnd() * 0.9,
          posterize: rnd() > 0.85 ? 4 + Math.floor(rnd() * 6) : 0,
          scanlines: rnd() > 0.8 ? rnd() * 0.7 : 0,
          grain: 0.15 + rnd() * 0.5,
          grainSize: 0.6 + rnd() * 2.2,
          evolutionSpeed: 0.3 + rnd() * 1.3,
          exposure: 0.9 + rnd() * 0.8,
          bgDark: 0.9 + rnd() * 0.1,
        },
        epoch: s.epoch + 1,
        status: `Randomised · ${pattern}${mix > 0 ? ` × ${mixPattern}` : ''}`,
      }));
    },

    subtleMutate: () => {
      push();
      const seed = (get().params.seed + 1 + Math.floor(Math.random() * 97)) % 1_000_000;
      const rnd = mulberry32(seed);
      const jitter = (v: number, amount: number, lo: number, hi: number) =>
        clamp(v + (rnd() - 0.5) * amount, lo, hi);

      set((s) => ({
        params: {
          ...s.params,
          seed,
          turbulenceScale: jitter(s.params.turbulenceScale, 0.7, 0.5, 9),
          curlIntensity: jitter(s.params.curlIntensity, 0.35, 0, 2),
          zigzag: jitter(s.params.zigzag, 0.4, 0, 3),
          shear: jitter(s.params.shear, 0.3, -1, 1),
          vorticity: jitter(s.params.vorticity, 0.3, -1, 1),
          threadCount: Math.round(jitter(s.params.threadCount, 8, 1, 48)),
          threadSpread: jitter(s.params.threadSpread, 0.25, 0, 1),
          sharpness: jitter(s.params.sharpness, 0.6, 0.3, 6),
          bandFreq: jitter(s.params.bandFreq, 3, 1, 24),
          twist: jitter(s.params.twist, 0.35, 0, 2),
          sparsity: jitter(s.params.sparsity, 0.2, 0, 0.95),
          exposure: jitter(s.params.exposure, 0.25, 0.3, 3),
          glow: jitter(s.params.glow, 0.4, 0, 3),
        },
        epoch: s.epoch + 1,
        status: 'Mutated',
      }));
    },

    resetAll: () => {
      push();
      set((s) => ({
        params: { ...DEFAULT_PARAMS, palette: [...DEFAULT_PALETTE] },
        nodes: DEFAULT_NODES.map((n) => ({ ...n })),
        selectedNode: null,
        epoch: s.epoch + 1,
        status: 'Reset',
      }));
    },

    applyScene: (scene) => {
      push();
      set((s) => ({
        params: mergeParams(scene.params),
        nodes: (scene.nodes ?? DEFAULT_NODES).map((n) => ({ ...n })),
        selectedNode: null,
        epoch: s.epoch + 1,
        status: `Scene · ${scene.name}`,
      }));
    },

    setStatus: (s) => set({ status: s }),

    setSection: (id) => set({ section: id, panelOpen: true }),
    togglePanel: () => set((s) => ({ panelOpen: !s.panelOpen })),
    setThumbnailPass: (on) => set({ thumbnailPass: on }),

    setAspect: (a) => set({ aspect: a, status: `Format · ${a}` }),
    setTier: (t) => set({ tier: t }),

    togglePlay: () => set((s) => ({ playing: !s.playing })),
    resetClock: () => set((s) => ({ epoch: s.epoch + 1 })),
    setExporting: (on) => set({ exporting: on }),

    undo: () =>
      set((s) => {
        if (s.history.length === 0) return s;
        const prev = s.history[s.history.length - 1];
        return {
          history: s.history.slice(0, -1),
          future: [{ params: s.params, nodes: s.nodes }, ...s.future].slice(0, HISTORY_LIMIT),
          params: prev.params,
          nodes: prev.nodes,
          selectedNode: null,
          status: 'Undo',
        };
      }),

    redo: () =>
      set((s) => {
        if (s.future.length === 0) return s;
        const next = s.future[0];
        return {
          future: s.future.slice(1),
          history: [...s.history, { params: s.params, nodes: s.nodes }].slice(-HISTORY_LIMIT),
          params: next.params,
          nodes: next.nodes,
          selectedNode: null,
          status: 'Redo',
        };
      }),

    savePreset: (name) => {
      const { params, nodes, savedPresets } = get();
      const preset: Preset = {
        name,
        version: 2,
        params: { ...params, palette: [...params.palette] },
        nodes: nodes.map((n) => ({ ...n })),
      };
      const next = [preset, ...savedPresets.filter((p) => p.name !== name)];
      writePresets(next);
      set({ savedPresets: next, status: `Saved preset · ${name}` });
    },

    loadPreset: (preset) => {
      push();
      set((s) => ({
        params: mergeParams(preset.params),
        nodes: (preset.nodes ?? []).map((n) => ({ ...n })),
        epoch: s.epoch + 1,
        selectedNode: null,
        status: `Loaded preset · ${preset.name}`,
      }));
    },

    deletePreset: (name) => {
      const next = get().savedPresets.filter((p) => p.name !== name);
      writePresets(next);
      set({ savedPresets: next });
    },

    importPreset: (json) => {
      try {
        const parsed = JSON.parse(json) as Partial<Preset>;
        if (!parsed || typeof parsed !== 'object' || !parsed.params) return false;
        push();
        const params = mergeParams(parsed.params as Partial<AuraParams>);
        const nodes: AuraNode[] = Array.isArray(parsed.nodes)
          ? (parsed.nodes as AuraNode[]).slice(0, MAX_NODES)
          : [];
        set((s) => ({
          params,
          nodes,
          epoch: s.epoch + 1,
          selectedNode: null,
          status: `Imported · ${parsed.name ?? 'scene'}`,
        }));
        return true;
      } catch {
        return false;
      }
    },
  };
});
