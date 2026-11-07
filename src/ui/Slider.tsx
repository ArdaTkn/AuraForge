import { useCallback, useEffect, useRef, useState } from 'react';
import { PARAM_KEY_BY_LABEL } from './params';

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  /** overrides the printed readout */
  format?: (v: number) => string;
  disabled?: boolean;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * A single parameter. Three ways in, because an artist needs all three:
 * drag the track, scrub the readout, or double click it and type an exact
 * number. Arrow keys nudge once the track has focus.
 */
export function Slider({
  label,
  value,
  min,
  max,
  step = 0.01,
  onChange,
  format,
  disabled,
}: SliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const precision = step >= 1 ? 0 : step >= 0.1 ? 1 : step >= 0.01 ? 2 : 3;
  const shown = format ? format(value) : value.toFixed(precision);
  const t = (value - min) / (max - min || 1);

  const quantise = useCallback(
    (raw: number) => {
      const snapped = Math.round(raw / step) * step;
      return clamp(Number(snapped.toFixed(6)), min, max);
    },
    [min, max, step],
  );

  const valueFromX = useCallback(
    (clientX: number) => {
      const el = trackRef.current;
      if (!el) return value;
      const r = el.getBoundingClientRect();
      const ratio = clamp((clientX - r.left) / r.width, 0, 1);
      return quantise(min + ratio * (max - min));
    },
    [min, max, quantise, value],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (disabled) return;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      setDragging(true);
      onChange(valueFromX(e.clientX));
    },
    [disabled, onChange, valueFromX],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging) return;
      onChange(valueFromX(e.clientX));
    },
    [dragging, onChange, valueFromX],
  );

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    setDragging(false);
  }, []);

  /** horizontal scrub on the readout — finer than dragging the track */
  const scrubRef = useRef<{ x: number; v: number } | null>(null);

  const onValuePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (disabled || editing) return;
      e.stopPropagation();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      scrubRef.current = { x: e.clientX, v: value };
      setDragging(true);
    },
    [disabled, editing, value],
  );

  const onValuePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const s = scrubRef.current;
      if (!s) return;
      const range = max - min;
      const next = quantise(s.v + ((e.clientX - s.x) / 160) * range);
      onChange(next);
    },
    [max, min, onChange, quantise],
  );

  const onValuePointerUp = useCallback((e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    scrubRef.current = null;
    setDragging(false);
  }, []);

  useEffect(() => {
    if (!editing) return;
    const commit = () => {
      const parsed = Number.parseFloat(draft.replace(',', '.'));
      if (Number.isFinite(parsed)) onChange(quantise(parsed));
      setEditing(false);
    };
    return () => commit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  return (
    <div
      className={`ctl${dragging ? ' is-dragging' : ''}`}
      data-param={PARAM_KEY_BY_LABEL[label]}
    >
      <div className="ctl__head">
        <span className="ctl__label" title={label}>
          {label}
        </span>
        {editing ? (
          <input
            className="ctl__number"
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') {
                setDraft(shown);
                setEditing(false);
              }
            }}
            onBlur={() => setEditing(false)}
          />
        ) : (
          <span
            className="ctl__value"
            title="Drag to scrub · double click to type"
            onPointerDown={onValuePointerDown}
            onPointerMove={onValuePointerMove}
            onPointerUp={onValuePointerUp}
            onPointerCancel={onValuePointerUp}
            onDoubleClick={() => {
              setDraft(shown);
              setEditing(true);
            }}
          >
            {shown}
          </span>
        )}
      </div>

      <div
        className="ctl__track"
        ref={trackRef}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={(e) => {
          if (disabled) return;
          const big = e.shiftKey ? 10 : 1;
          if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
            e.preventDefault();
            onChange(quantise(value - step * big));
          } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
            e.preventDefault();
            onChange(quantise(value + step * big));
          }
        }}
      >
        <span className="ctl__rail" />
        <span className="ctl__fill" style={{ width: `${t * 100}%` }} />
        <span className="ctl__knob" style={{ left: `${t * 100}%` }} />
      </div>
    </div>
  );
}
