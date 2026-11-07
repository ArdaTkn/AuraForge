interface Option<T extends string | number> {
  id: T;
  label: string;
  hint?: string;
}

interface SegmentedProps<T extends string | number> {
  options: Option<T>[];
  value: T;
  onChange: (v: T) => void;
  compact?: boolean;
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  compact,
}: SegmentedProps<T>) {
  return (
    <div className={`seg${compact ? ' seg--compact' : ''}`}>
      {options.map((o) => (
        <button
          key={String(o.id)}
          className={`seg__btn${o.id === value ? ' is-active' : ''}`}
          onClick={() => onChange(o.id)}
          title={o.hint}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
