import { PATTERNS } from '../render/types';
import { useAuraStore } from '../state/store';
import { Icon } from './Icon';
import { Slider } from './Slider';

/**
 * The structural language switch. Nine archetypes, plus a hybrid lane that
 * crossfades the active one with any other — that is what makes the engine a
 * continuum instead of a single recipe.
 */
export function PatternPicker() {
  const pattern = useAuraStore((s) => s.params.pattern);
  const mixPattern = useAuraStore((s) => s.params.mixPattern);
  const mix = useAuraStore((s) => s.params.mix);
  const setPattern = useAuraStore((s) => s.setPattern);
  const setMixPattern = useAuraStore((s) => s.setMixPattern);
  const setMix = useAuraStore((s) => s.setMix);
  const randomize = useAuraStore((s) => s.randomizeSeed);

  const active = PATTERNS.find((p) => p.id === pattern);

  return (
    <>
      <div className="pattern-grid">
        {PATTERNS.map((p) => (
          <button
            key={p.id}
            className={`pattern${p.id === pattern ? ' is-active' : ''}`}
            onClick={() => setPattern(p.id)}
            title={p.hint}
          >
            <span className="pattern__glyph">
              <Icon name={p.icon} size={17} />
            </span>
            <span className="pattern__label">{p.label}</span>
          </button>
        ))}
      </div>

      <p className="hint">{active?.hint}</p>

      <div className="hybrid">
        <div className="hybrid__head">
          <span className="hybrid__title">Hybrid</span>
          <span className="hybrid__value">
            {mix < 0.01 ? 'off' : `${Math.round(mix * 100)}%`}
          </span>
        </div>

        <div className="pattern-grid pattern-grid--mini">
          {PATTERNS.map((p) => (
            <button
              key={p.id}
              className={`pattern-mini${p.id === mixPattern ? ' is-active' : ''}`}
              onClick={() => setMixPattern(p.id)}
              title={`Blend towards ${p.label}`}
            >
              <Icon name={p.icon} size={13} />
            </button>
          ))}
        </div>

        <Slider
          label={`Mix · ${PATTERNS.find((p) => p.id === mixPattern)?.label ?? ''}`}
          value={mix}
          min={0}
          max={1}
          step={0.01}
          onChange={setMix}
        />

        <button className="btn" onClick={randomize} title="Roll a completely new look">
          <Icon name="dice" size={13} /> Surprise me
        </button>
      </div>
    </>
  );
}
