import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuraStore } from '../state/store';
import { CodeTarget, generate } from '../codegen';
import { aspectDef, outputSize } from '../render/types';
import { Icon } from './Icon';

interface CodeDrawerProps {
  open: boolean;
  onClose: () => void;
}

const TABS: { id: CodeTarget; label: string; note: string }[] = [
  {
    id: 'p5',
    label: 'p5.js',
    note: 'Complete sketch — drop it into the p5 editor and run. The fragment shader below is the studio\u2019s own, frozen at your current values.',
  },
  {
    id: 'glsl',
    label: 'GLSL',
    note: 'Raw WebGL2 fragment shader. Every art parameter is baked in as a const; the host only supplies uResolution and uTime.',
  },
];

/**
 * Live generator. It recomputes on every parameter change, so what is on
 * screen is always the code for the sliders in front of you.
 */
export function CodeDrawer({ open, onClose }: CodeDrawerProps) {
  const params = useAuraStore((s) => s.params);
  const nodes = useAuraStore((s) => s.nodes);
  const aspect = useAuraStore((s) => s.aspect);
  const tier = useAuraStore((s) => s.tier);
  const [tab, setTab] = useState<CodeTarget>('p5');
  const [copied, setCopied] = useState(false);
  const codeRef = useRef<HTMLPreElement>(null);

  const [outW, outH] = outputSize(aspect, tier);
  const code = useMemo(
    () => generate(tab, params, nodes, [outW, outH]),
    [tab, params, nodes, outW, outH],
  );
  const lines = useMemo(() => code.split('\n').length, [code]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      // clipboard API can be unavailable in a webview — fall back to a select
      const el = codeRef.current;
      if (el) {
        const range = document.createRange();
        range.selectNodeContents(el);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
      return;
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }, [code]);

  const download = useCallback(() => {
    const ext = tab === 'p5' ? 'js' : 'frag';
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `auraforge-${params.seed}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  }, [code, tab, params.seed]);

  if (!open) return null;

  const active = TABS.find((t) => t.id === tab)!;

  return (
    <div className="drawer">
      <div className="drawer__head">
        <span className="drawer__title">Live Code</span>
        <div className="drawer__tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`tab${t.id === tab ? ' is-active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <span className="drawer__meta">
          seed {params.seed} · {nodes.length} nodes · {lines} lines · {outW}×{outH} ·{' '}
          {aspectDef(aspect).short}
        </span>
        <div className="topbar__spacer" />
        <button className="btn" onClick={download}>
          <Icon name="save" size={12} /> Save
        </button>
        <button className="btn btn--primary" onClick={copy}>
          <Icon name={copied ? 'check' : 'copy'} size={12} /> {copied ? 'Copied' : 'Copy'}
        </button>
        <button className="btn btn--icon" onClick={onClose} title="Close (Esc)">
          <Icon name="close" size={12} />
        </button>
      </div>

      <p className="drawer__note">{active.note}</p>

      <pre className="drawer__code" ref={codeRef}>
        <code>{code}</code>
      </pre>
    </div>
  );
}
