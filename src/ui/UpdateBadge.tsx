import { useUpdater } from '../update';
import { Icon } from './Icon';

/**
 * The update affordance. It renders nothing at all until there is something to
 * say, so a studio that is up to date looks exactly the same as one that has
 * never checked — no permanent "no updates available" noise.
 */
export function UpdateBadge() {
  const phase = useUpdater((s) => s.phase);
  const info = useUpdater((s) => s.info);
  const progress = useUpdater((s) => s.progress);
  const error = useUpdater((s) => s.error);
  const install = useUpdater((s) => s.install);
  const dismiss = useUpdater((s) => s.dismiss);

  if (phase === 'available' && info) {
    return (
      <button
        className="update-pill"
        onClick={() => void install()}
        title={`Install AuraForge ${info.version} and restart${info.notes ? `\n\n${info.notes}` : ''}`}
      >
        <Icon name="download" size={12} /> {info.version}
      </button>
    );
  }

  if (phase === 'downloading' || phase === 'installing') {
    const pct = progress < 0 ? null : Math.round(progress * 100);
    return (
      <span className="update-pill is-busy" title="Downloading the update">
        <span className="update-pill__bar">
          <span style={pct === null ? undefined : { width: `${pct}%` }} />
        </span>
        {phase === 'installing' ? 'installing' : pct === null ? 'downloading' : `${pct}%`}
      </span>
    );
  }

  if (phase === 'error' && error) {
    return (
      <button className="update-pill is-error" onClick={dismiss} title={error}>
        <Icon name="warning" size={12} /> update failed
      </button>
    );
  }

  return null;
}
