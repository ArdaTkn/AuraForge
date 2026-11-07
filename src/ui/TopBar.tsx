import { PATTERNS } from '../render/types';
import { useAuraStore } from '../state/store';
import { Icon } from './Icon';

interface TopBarProps {
  fps: number;
  frameMs: number;
  onOpenCode: () => void;
  onOpenPalette: () => void;
}

export function TopBar({ fps, frameMs, onOpenCode, onOpenPalette }: TopBarProps) {
  const playing = useAuraStore((s) => s.playing);
  const togglePlay = useAuraStore((s) => s.togglePlay);
  const resetClock = useAuraStore((s) => s.resetClock);
  const params = useAuraStore((s) => s.params);
  const nodes = useAuraStore((s) => s.nodes);
  const status = useAuraStore((s) => s.status);

  const pattern = PATTERNS.find((p) => p.id === params.pattern);
  const mixed = params.mix > 0.01;
  const active = nodes.filter((n) => n.enabled).length;

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand__mark">
          Aura<em>Forge</em>
        </span>
        <span className="brand__sub">parametric energy studio</span>
      </div>

      <button className="btn btn--ghost" onClick={onOpenPalette} title="Command palette">
        <Icon name="search" size={13} /> Search
        <kbd className="kbd">
          <Icon name="command" size={9} />K
        </kbd>
      </button>

      <div className="topbar__spacer" />

      <div className="stat stat--wide">
        <span>Pattern</span>
        <b>
          {pattern?.label ?? '—'}
          {mixed && <i> × {PATTERNS.find((p) => p.id === params.mixPattern)?.label}</i>}
        </b>
      </div>
      <div className="stat">
        <span>Nodes</span>
        <b>{active}</b>
      </div>
      <div className="stat">
        <span>FPS</span>
        <b className={fps >= 55 ? 'hot' : ''}>{fps > 0 ? fps.toFixed(0) : '—'}</b>
      </div>
      <div className="stat">
        <span>Frame</span>
        <b>{frameMs.toFixed(1)} ms</b>
      </div>
      <div className="stat">
        <span>Steps</span>
        <b>
          {params.steps}
          {params.guard && <Icon name="check" size={9} />}
        </b>
      </div>
      <div className="stat">
        <span>Seed</span>
        <b>{params.seed}</b>
      </div>

      <div className="topbar__spacer" />

      {status && <span className="topbar__status">{status}</span>}

      <button className="btn btn--icon" onClick={togglePlay} title="Play / pause (Space)">
        <Icon name={playing ? 'pause' : 'play'} size={13} />
      </button>
      <button className="btn btn--icon" onClick={resetClock} title="Restart the clock">
        <Icon name="restart" size={13} />
      </button>
      <button className="btn btn--primary" onClick={onOpenCode} title="Live p5.js / GLSL">
        <Icon name="code" size={13} /> Code
      </button>
    </header>
  );
}
