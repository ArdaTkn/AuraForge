import { SECTIONS, useAuraStore } from '../state/store';
import { Icon, IconName } from './Icon';

interface RailProps {
  onOpenPalette: () => void;
  onOpenCode: () => void;
}

interface RailButtonProps {
  icon: IconName;
  tip: string;
  active?: boolean;
  onClick: () => void;
}

function RailButton({ icon, tip, active, onClick }: RailButtonProps) {
  return (
    <button
      className={`rail__btn${active ? ' is-active' : ''}`}
      onClick={onClick}
      aria-label={tip}
    >
      <Icon name={icon} size={17} />
      <span className="rail__tip">{tip}</span>
    </button>
  );
}

/**
 * The whole navigation. Nine subjects plus the three global actions, so the
 * studio never needs a tab bar and never needs a second scroll column.
 */
export function Rail({ onOpenPalette, onOpenCode }: RailProps) {
  const section = useAuraStore((s) => s.section);
  const panelOpen = useAuraStore((s) => s.panelOpen);
  const setSection = useAuraStore((s) => s.setSection);
  const togglePanel = useAuraStore((s) => s.togglePanel);

  return (
    <nav className="rail">
      {SECTIONS.map((s, i) => (
        <RailButton
          key={s.id}
          icon={s.icon}
          tip={`${String(i + 1).padStart(2, '0')} · ${s.label}`}
          active={section === s.id && panelOpen}
          onClick={() => {
            if (section === s.id && panelOpen) togglePanel();
            else setSection(s.id);
          }}
        />
      ))}

      <span className="rail__spacer" />
      <span className="rail__sep" />

      <RailButton icon="search" tip="Command palette · Cmd K" onClick={onOpenPalette} />
      <RailButton icon="code" tip="Live code · Cmd C" onClick={onOpenCode} />
      <RailButton
        icon="panel"
        tip={panelOpen ? 'Full-bleed canvas · Cmd .' : 'Show panel · Cmd .'}
        onClick={togglePanel}
      />
    </nav>
  );
}
