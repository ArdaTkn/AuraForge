interface ColorFieldProps {
  name: string;
  value: string;
  onChange: (hex: string) => void;
}

export function ColorField({ name, value, onChange }: ColorFieldProps) {
  return (
    <div className="color-row">
      <div className="swatch" style={{ background: value }}>
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={name}
        />
      </div>
      <div className="swatch__label">
        <span className="swatch__name">{name}</span>
        <span className="swatch__hex">{value.replace('#', '# ')}</span>
      </div>
    </div>
  );
}
