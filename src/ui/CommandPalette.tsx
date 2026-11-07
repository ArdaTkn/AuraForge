import { useEffect, useMemo, useRef, useState } from 'react';
import { PATTERNS, NODE_KINDS, SCENES } from '../render/types';
import { SECTIONS, useAuraStore } from '../state/store';
import { Icon, IconName } from './Icon';
import { PARAMS } from './params';

interface Command {
  id: string;
  group: string;
  icon: IconName;
  label: string;
  sub?: string;
  run: () => void;
}

/* Params surfaced in the palette come from the shared registry in params.ts. */

function score(query: string, text: string): number {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (!q) return 1;
  if (t.startsWith(q)) return 1000 - t.length;
  const direct = t.indexOf(q);
  if (direct >= 0) return 500 - direct;
  let qi = 0;
  let s = 0;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) {
      s += 12 - Math.min(i, 10) * 0.5;
      qi++;
    }
  }
  return qi === q.length ? s : -1;
}

interface PaletteProps {
  open: boolean;
  onClose: () => void;
}

/**
 * ⌘K. Everything the studio can do, in one searchable list — including a jump
 * to any parameter, which is how a 60-control tool stays navigable.
 */
export function CommandPalette({ open, onClose }: PaletteProps) {
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const commands = useMemo<Command[]>(() => {
    const s = useAuraStore.getState();
    const list: Command[] = [];

    list.push({
      id: 'act-randomize',
      group: 'Act',
      icon: 'dice',
      label: 'Randomize everything',
      sub: 'R',
      run: () => s.randomizeSeed(),
    });
    list.push({
      id: 'act-mutate',
      group: 'Act',
      icon: 'flow',
      label: 'Subtle mutate',
      sub: 'M',
      run: () => s.subtleMutate(),
    });
    list.push({
      id: 'act-play',
      group: 'Act',
      icon: s.playing ? 'pause' : 'play',
      label: 'Play / pause',
      sub: 'Space',
      run: () => s.togglePlay(),
    });
    list.push({
      id: 'act-restart',
      group: 'Act',
      icon: 'restart',
      label: 'Restart the clock',
      run: () => s.resetClock(),
    });
    list.push({
      id: 'act-reset',
      group: 'Act',
      icon: 'trash',
      label: 'Reset everything',
      run: () => s.resetAll(),
    });
    list.push({
      id: 'act-guard',
      group: 'Act',
      icon: 'check',
      label: `${s.params.guard ? 'Disable' : 'Enable'} Performance Guard`,
      run: () => s.toggleGuard(),
    });
    list.push({
      id: 'act-panel',
      group: 'Act',
      icon: 'panel',
      label: s.panelOpen ? 'Full-bleed canvas' : 'Show the panel',
      sub: 'Cmd .',
      run: () => s.togglePanel(),
    });
    list.push({
      id: 'act-node',
      group: 'Act',
      icon: 'plus',
      label: 'Add a node at the centre',
      run: () => s.addNode(0, 0, s.brush),
    });

    for (const sc of SCENES) {
      list.push({
        id: `scene-${sc.name}`,
        group: 'Scene',
        icon: 'scenes',
        label: sc.name,
        sub: sc.blurb,
        run: () => s.applyScene(sc),
      });
    }

    for (const p of PATTERNS) {
      list.push({
        id: `pattern-${p.id}`,
        group: 'Pattern',
        icon: p.icon,
        label: p.label,
        sub: p.hint,
        run: () => {
          s.setPattern(p.id);
          s.setSection('pattern');
        },
      });
    }

    for (const [i, sec] of SECTIONS.entries()) {
      list.push({
        id: `section-${sec.id}`,
        group: 'Go to',
        icon: sec.icon,
        label: sec.label,
        sub: `${String(i + 1).padStart(2, '0')} · ${sec.hint}`,
        run: () => s.setSection(sec.id),
      });
    }

    for (const prm of PARAMS) {
      list.push({
        id: `param-${prm.key}`,
        group: 'Parameter',
        icon: 'slider',
        label: prm.label,
        sub: prm.section,
        run: () => {
          s.setSection(prm.section);
          window.setTimeout(() => {
            const el = document.querySelector(`[data-param="${prm.key}"]`);
            if (el) {
              el.scrollIntoView({ block: 'center', behavior: 'smooth' });
              el.classList.add('is-flash');
              window.setTimeout(() => el.classList.remove('is-flash'), 900);
            }
          }, 60);
        },
      });
    }

    for (const k of NODE_KINDS) {
      list.push({
        id: `brush-${k.id}`,
        group: 'Node brush',
        icon: k.icon,
        label: k.label,
        sub: k.hint,
        run: () => s.setBrush(k.id),
      });
    }

    return list;
  }, [open]);

  const results = useMemo(() => {
    if (!query.trim()) return commands.slice(0, 40);
    return commands
      .map((c) => ({ c, s: Math.max(score(query, c.label), score(query, c.group) - 40) }))
      .filter((r) => r.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 40)
      .map((r) => r.c);
  }, [commands, query]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setCursor(0);
    }
  }, [open]);

  useEffect(() => {
    setCursor(0);
  }, [query]);

  useEffect(() => {
    const el = listRef.current?.querySelector('.cmdk__item.is-active');
    el?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  if (!open) return null;

  const commit = (c: Command | undefined) => {
    if (!c) return;
    onClose();
    // let the palette unmount before the command mutates the tree
    window.setTimeout(() => c.run(), 0);
  };

  let lastGroup = '';

  return (
    <div className="cmdk" onPointerDown={onClose}>
      <div className="cmdk__panel" onPointerDown={(e) => e.stopPropagation()}>
        <input
          className="cmdk__input"
          autoFocus
          value={query}
          placeholder="Search patterns, scenes, parameters, actions…"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setCursor((c) => Math.min(c + 1, results.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setCursor((c) => Math.max(c - 1, 0));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              commit(results[cursor]);
            } else if (e.key === 'Escape') {
              e.preventDefault();
              onClose();
            }
          }}
        />
        <div className="cmdk__list" ref={listRef}>
          {results.length === 0 && <div className="cmdk__empty">Nothing matches that.</div>}
          {results.map((c, i) => {
            const header = c.group !== lastGroup ? c.group : null;
            lastGroup = c.group;
            return (
              <div key={c.id}>
                {header && <div className="cmdk__group">{header}</div>}
                <button
                  className={`cmdk__item${i === cursor ? ' is-active' : ''}`}
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => commit(c)}
                >
                  <span className="cmdk__glyph">
                    <Icon name={c.icon} size={14} />
                  </span>
                  <span className="cmdk__label">{c.label}</span>
                  {c.sub && <span className="cmdk__sub">{c.sub}</span>}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
