import { SectionId } from '../state/store';

/**
 * Registry of the numeric parameters, used by the command palette to jump
 * straight to a control and by the Slider itself to tag its DOM node with a
 * stable `data-param` hook. Labels are unique across the studio, which is what
 * lets the two stay in sync without threading ids through every call site.
 */
export interface ParamRef {
  key: string;
  label: string;
  section: SectionId;
}

export const PARAMS: ParamRef[] = [
  { key: 'turbulenceScale', label: 'Turbulence Scale', section: 'flow' },
  { key: 'curlIntensity', label: 'Curl Intensity', section: 'flow' },
  { key: 'warpIterations', label: 'Warp Passes', section: 'flow' },
  { key: 'zigzag', label: 'Zigzag Jaggedness', section: 'flow' },
  { key: 'shear', label: 'Shear', section: 'flow' },
  { key: 'vorticity', label: 'Vorticity', section: 'flow' },
  { key: 'direction', label: 'Direction', section: 'flow' },
  { key: 'mirror', label: 'Mirror / Kaleidoscope', section: 'flow' },
  { key: 'compression', label: 'H / V Compression', section: 'flow' },
  { key: 'evolutionSpeed', label: 'Evolution Speed', section: 'flow' },

  { key: 'threadCount', label: 'Thread / Cell Count', section: 'structure' },
  { key: 'threadSpread', label: 'Thread Scatter', section: 'structure' },
  { key: 'sharpness', label: 'Core Sharpness', section: 'structure' },
  { key: 'bandFreq', label: 'Band / Ring Frequency', section: 'structure' },
  { key: 'twist', label: 'Twist / Spiral', section: 'structure' },
  { key: 'sparsity', label: 'Sparsity (empty space)', section: 'structure' },

  { key: 'smokeDensity', label: 'Smoke Density', section: 'volume' },
  { key: 'filamentSharp', label: 'Filament Sharpness', section: 'volume' },
  { key: 'glow', label: 'Additive Glow', section: 'volume' },
  { key: 'scatter', label: 'Ash / Spark Count', section: 'volume' },
  { key: 'sparkSize', label: 'Spark Size', section: 'volume' },
  { key: 'trail', label: 'Spark Trail', section: 'volume' },
  { key: 'steps', label: 'Volume Steps (quality)', section: 'volume' },

  { key: 'hueShift', label: 'Hue Shift', section: 'palette' },
  { key: 'colorCycle', label: 'Colour Cycle (speed)', section: 'palette' },
  { key: 'saturation', label: 'Saturation', section: 'palette' },

  { key: 'bloom', label: 'Bloom', section: 'post' },
  { key: 'chroma', label: 'Chromatic Aberration', section: 'post' },
  { key: 'vignette', label: 'Vignette', section: 'post' },
  { key: 'posterize', label: 'Posterize', section: 'post' },
  { key: 'scanlines', label: 'Scanlines', section: 'post' },
  { key: 'grain', label: 'Film Grain', section: 'post' },
  { key: 'grainSize', label: 'Grain Size', section: 'post' },
  { key: 'exposure', label: 'Core Exposure', section: 'post' },
  { key: 'bgDark', label: 'Background Darkness', section: 'post' },
];

export const PARAM_KEY_BY_LABEL: Record<string, string> = PARAMS.reduce(
  (acc, p) => ({ ...acc, [p.label]: p.key }),
  {},
);
