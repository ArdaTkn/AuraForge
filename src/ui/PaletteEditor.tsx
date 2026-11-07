import { MAX_PALETTE_STOPS, PALETTE_MODES, PALETTE_MODES as MODES } from '../render/types';
import { useAuraStore } from '../state/store';
import { Slider } from './Slider';
import { Segmented } from './Segmented';

/**
 * A ramp, not a pair of colours. Five stops, five mapping modes, plus a hue
 * shift and a time-driven cycle so the palette itself can evolve with the flow
 * instead of sitting on top of it.
 */
export function PaletteEditor() {
  const params = useAuraStore((s) => s.params);
  const setPaletteStop = useAuraStore((s) => s.setPaletteStop);
  const addPaletteStop = useAuraStore((s) => s.addPaletteStop);
  const removePaletteStop = useAuraStore((s) => s.removePaletteStop);
  const setPaletteMode = useAuraStore((s) => s.setPaletteMode);
  const rotatePalette = useAuraStore((s) => s.rotatePalette);
  const setParam = useAuraStore((s) => s.setParam);

  const ramp = `linear-gradient(90deg, ${params.palette.join(', ')})`;

  return (
    <>
      <div className="ramp" style={{ background: ramp }} />

      <div className="stops">
        {params.palette.map((hex, i) => (
          <div className="stop" key={`${i}-${hex}`}>
            <div className="stop__swatch" style={{ background: hex }}>
              <input
                type="color"
                value={hex}
                onChange={(e) => setPaletteStop(i, e.target.value)}
                aria-label={`Stop ${i + 1}`}
              />
            </div>
            <span className="stop__i">{i + 1}</span>
            <button
              className="stop__x"
              onClick={() => removePaletteStop(i)}
              disabled={params.palette.length <= 2}
              title="Remove stop"
            >
              ✕
            </button>
          </div>
        ))}
        <button
          className="stop stop--add"
          onClick={addPaletteStop}
          disabled={params.palette.length >= MAX_PALETTE_STOPS}
          title="Add a stop"
        >
          +
        </button>
      </div>

      <div className="split">
        <button className="btn" onClick={() => rotatePalette(1)} title="Rotate the ramp left">
          ↺ Shift
        </button>
        <button className="btn" onClick={() => rotatePalette(-1)} title="Rotate the ramp right">
          ↻ Shift
        </button>
      </div>

      <div className="row">
        <div className="row__top">
          <span className="row__label">Mapping</span>
          <span className="row__value">
            {MODES.find((m) => m.id === params.paletteMode)?.label}
          </span>
        </div>
        <Segmented
          options={PALETTE_MODES.map((m) => ({ id: m.id, label: m.label, hint: m.hint }))}
          value={params.paletteMode}
          onChange={setPaletteMode}
          compact
        />
        <span className="hint">
          {MODES.find((m) => m.id === params.paletteMode)?.hint}
        </span>
      </div>

      <Slider
        label="Hue Shift"
        value={params.hueShift}
        min={0}
        max={1}
        step={0.01}
        onChange={(v) => setParam('hueShift', v)}
      />
      <Slider
        label="Colour Cycle (speed)"
        value={params.colorCycle}
        min={0}
        max={2}
        step={0.01}
        onChange={(v) => setParam('colorCycle', v)}
      />
      <Slider
        label="Saturation"
        value={params.saturation}
        min={0}
        max={1.6}
        step={0.01}
        onChange={(v) => setParam('saturation', v)}
      />
    </>
  );
}
