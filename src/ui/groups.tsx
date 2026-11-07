import { PALETTE_MODES, PatternId } from '../render/types';
import { useAuraStore } from '../state/store';
import { Slider } from './Slider';
import { Toggle } from './Toggle';

/* ══════════════════════════ FLOW ══════════════════════════ */

export function FlowGroup() {
  const p = useAuraStore((s) => s.params);
  const set = useAuraStore((s) => s.setParam);

  return (
    <>
      <Slider label="Turbulence Scale" value={p.turbulenceScale} min={0.5} max={9} onChange={(v) => set('turbulenceScale', v)} />
      <Slider label="Curl Intensity" value={p.curlIntensity} min={0} max={2} onChange={(v) => set('curlIntensity', v)} />
      <Slider
        label="Warp Passes"
        value={p.warpIterations}
        min={1}
        max={3}
        step={1}
        format={(v) => v.toFixed(0)}
        onChange={(v) => set('warpIterations', Math.round(v))}
      />
      <Slider label="Zigzag Jaggedness" value={p.zigzag} min={0} max={3} onChange={(v) => set('zigzag', v)} />
      <Slider label="Shear" value={p.shear} min={-1} max={1} onChange={(v) => set('shear', v)} />
      <Slider label="Vorticity" value={p.vorticity} min={-1} max={1} onChange={(v) => set('vorticity', v)} />
      <Slider
        label="Direction"
        value={p.direction}
        min={0}
        max={1}
        step={0.005}
        format={(v) => `${Math.round(v * 360)}°`}
        onChange={(v) => set('direction', v)}
      />
      <Slider label="Mirror / Kaleidoscope" value={p.mirror} min={0} max={1} onChange={(v) => set('mirror', v)} />
      <Slider label="H / V Compression" value={p.compression} min={-1} max={1} onChange={(v) => set('compression', v)} />
      <Slider label="Evolution Speed" value={p.evolutionSpeed} min={0} max={2} onChange={(v) => set('evolutionSpeed', v)} />
    </>
  );
}

/* ══════════════════════════ STRUCTURE ══════════════════════════ */

export function StructureGroup() {
  const p = useAuraStore((s) => s.params);
  const set = useAuraStore((s) => s.setParam);

  return (
    <>
      <Slider
        label="Thread / Cell Count"
        value={p.threadCount}
        min={1}
        max={48}
        step={1}
        format={(v) => v.toFixed(0)}
        onChange={(v) => set('threadCount', Math.round(v))}
      />
      <Slider label="Thread Scatter" value={p.threadSpread} min={0} max={1} onChange={(v) => set('threadSpread', v)} />
      <Slider label="Core Sharpness" value={p.sharpness} min={0.3} max={6} onChange={(v) => set('sharpness', v)} />
      <Slider label="Band / Ring Frequency" value={p.bandFreq} min={1} max={24} step={0.1} onChange={(v) => set('bandFreq', v)} />
      <Slider label="Twist / Spiral" value={p.twist} min={0} max={2} onChange={(v) => set('twist', v)} />
      <Slider label="Sparsity (empty space)" value={p.sparsity} min={0} max={0.95} onChange={(v) => set('sparsity', v)} />
      <p className="hint">
        These knobs reshape every archetype, not just one. <b>Thread Count</b> drives the
        lane density of Threads, the weave of Lattice and the cell size of Crystal.
      </p>
    </>
  );
}

/* ══════════════════════════ VOLUME ══════════════════════════ */

export function VolumeGroup() {
  const p = useAuraStore((s) => s.params);
  const set = useAuraStore((s) => s.setParam);

  return (
    <>
      <Slider label="Smoke Density" value={p.smokeDensity} min={0} max={2} onChange={(v) => set('smokeDensity', v)} />
      <Slider label="Filament Sharpness" value={p.filamentSharp} min={0.5} max={7} onChange={(v) => set('filamentSharp', v)} />
      <Slider label="Additive Glow" value={p.glow} min={0} max={3} onChange={(v) => set('glow', v)} />
      <Slider
        label="Ash / Spark Count"
        value={p.scatter}
        min={0}
        max={400}
        step={1}
        format={(v) => v.toFixed(0)}
        onChange={(v) => set('scatter', Math.round(v))}
      />
      <Slider label="Spark Size" value={p.sparkSize} min={0.2} max={3} onChange={(v) => set('sparkSize', v)} />
      <Slider label="Spark Trail" value={p.trail} min={0} max={1} onChange={(v) => set('trail', v)} />
      <Slider
        label="Volume Steps (quality)"
        value={p.steps}
        min={16}
        max={96}
        step={1}
        format={(v) => v.toFixed(0)}
        onChange={(v) => set('steps', Math.round(v))}
      />
    </>
  );
}

/* ══════════════════════════ POST ══════════════════════════ */

export function PostGroup() {
  const p = useAuraStore((s) => s.params);
  const set = useAuraStore((s) => s.setParam);

  return (
    <>
      <Slider label="Bloom" value={p.bloom} min={0} max={1.5} onChange={(v) => set('bloom', v)} />
      <Slider label="Chromatic Aberration" value={p.chroma} min={0} max={1} onChange={(v) => set('chroma', v)} />
      <Slider label="Vignette" value={p.vignette} min={0} max={1} onChange={(v) => set('vignette', v)} />
      <Slider
        label="Posterize"
        value={p.posterize}
        min={0}
        max={12}
        step={1}
        format={(v) => (v < 2 ? 'off' : v.toFixed(0))}
        onChange={(v) => set('posterize', Math.round(v))}
      />
      <Slider label="Scanlines" value={p.scanlines} min={0} max={1} onChange={(v) => set('scanlines', v)} />
      <Slider label="Film Grain" value={p.grain} min={0} max={1} onChange={(v) => set('grain', v)} />
      <Slider label="Grain Size" value={p.grainSize} min={0.25} max={4} step={0.05} onChange={(v) => set('grainSize', v)} />
    </>
  );
}

/* ══════════════════════════ LIGHT ══════════════════════════ */

export function LightGroup() {
  const p = useAuraStore((s) => s.params);
  const set = useAuraStore((s) => s.setParam);

  return (
    <>
      <Slider label="Core Exposure" value={p.exposure} min={0.1} max={3} onChange={(v) => set('exposure', v)} />
      <Slider label="Background Darkness" value={p.bgDark} min={0} max={1} onChange={(v) => set('bgDark', v)} />
    </>
  );
}

/* ══════════════════════════ ENGINE ══════════════════════════ */

export function EngineGroup() {
  const guard = useAuraStore((s) => s.params.guard);
  const toggleGuard = useAuraStore((s) => s.toggleGuard);
  const seed = useAuraStore((s) => s.params.seed);
  const randomize = useAuraStore((s) => s.randomizeSeed);
  const mutate = useAuraStore((s) => s.subtleMutate);
  const reset = useAuraStore((s) => s.resetAll);

  return (
    <>
      <div className="ctl__head">
        <span className="ctl__label">Seed</span>
        <span className="ctl__value">{seed}</span>
      </div>
      <div className="split">
        <button className="btn btn--primary" onClick={randomize}>
          ⟳ Randomize
        </button>
        <button className="btn" onClick={mutate}>
          ~ Mutate
        </button>
      </div>
      <button className="btn btn--wide" onClick={reset}>
        Reset everything
      </button>

      <Toggle
        checked={guard}
        onChange={toggleGuard}
        label="Performance Guard"
      />
      <p className="hint">
        Guard clamps Volume Steps so the preview holds 60 fps. Off means full freedom —
        extreme settings will drop frames.
      </p>
    </>
  );
}

/* ══════════════════════════ helpers used by the palette panel ══════════════════════════ */

export const PALETTE_MODE_OPTIONS = PALETTE_MODES.map((m) => ({
  id: m.id,
  label: m.label,
  hint: m.hint,
}));

export const PATTERN_IDS: PatternId[] = [
  'braid',
  'threads',
  'vortex',
  'lattice',
  'rift',
  'nebula',
  'storm',
  'shock',
  'crystal',
];
