interface ToggleProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  title?: string;
}

export function Toggle({ checked, onChange, label, title }: ToggleProps) {
  return (
    <button
      className={`toggle${checked ? ' is-on' : ''}`}
      onClick={() => onChange(!checked)}
      title={title}
      aria-pressed={checked}
    >
      <span className="toggle__track">
        <span className="toggle__knob" />
      </span>
      {label && <span className="toggle__label">{label}</span>}
    </button>
  );
}
