import { useCallback, useEffect, useState } from 'react';
import { TopBar } from './ui/TopBar';
import { Rail } from './ui/Rail';
import { Panel } from './ui/Panel';
import { Stage } from './ui/Stage';
import { CodeDrawer } from './ui/CodeDrawer';
import { CommandPalette } from './ui/CommandPalette';
import { SECTIONS, useAuraStore } from './state/store';
import { useUpdater } from './update';

export default function App() {
  const [fps, setFps] = useState(0);
  const [frameMs, setFrameMs] = useState(0);
  const [codeOpen, setCodeOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const panelOpen = useAuraStore((s) => s.panelOpen);

  const onStats = useCallback((f: number, ms: number) => {
    setFps(f);
    setFrameMs(ms);
  }, []);

  const closeCode = useCallback(() => setCodeOpen(false), []);
  const closePalette = useCallback(() => setPaletteOpen(false), []);

  /* Read the running version and check for an update once the studio has
     settled — a slow network must never delay the first frame. */
  useEffect(() => {
    useUpdater.getState().boot();
  }, []);

  /* ------------------------------- shortcuts ------------------------------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target && (target.tagName === 'INPUT' || target.isContentEditable);

      const mod = e.metaKey || e.ctrlKey;

      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
        return;
      }
      if (mod && e.key === '.') {
        e.preventDefault();
        useAuraStore.getState().togglePanel();
        return;
      }
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        const s = useAuraStore.getState();
        if (e.shiftKey) s.redo();
        else s.undo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'c' && !typing) {
        e.preventDefault();
        setCodeOpen((o) => !o);
        return;
      }
      if (typing) return;

      const s = useAuraStore.getState();

      if (e.key === 'Escape') {
        if (paletteOpen) setPaletteOpen(false);
        else if (codeOpen) setCodeOpen(false);
        else s.selectNode(null);
        return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        s.togglePlay();
      } else if (e.key === 'r' || e.key === 'R') {
        s.randomizeSeed();
      } else if (e.key === 'm' || e.key === 'M') {
        s.subtleMutate();
      } else if (e.key === 'f' || e.key === 'F') {
        s.togglePanel();
      } else if (/^[1-9]$/.test(e.key)) {
        const sec = SECTIONS[Number(e.key) - 1];
        if (sec) s.setSection(sec.id);
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [codeOpen, paletteOpen]);

  return (
    <div className="app">
      <TopBar
        fps={fps}
        frameMs={frameMs}
        onOpenCode={() => setCodeOpen(true)}
        onOpenPalette={() => setPaletteOpen(true)}
      />

      <div className={`workspace${panelOpen ? ' with-panel' : ''}`}>
        <Rail onOpenPalette={() => setPaletteOpen(true)} onOpenCode={() => setCodeOpen(true)} />
        <main className="stage-wrap">
          <Stage onStats={onStats} onError={setError} />
        </main>
        <Panel />
      </div>

      <CommandPalette open={paletteOpen} onClose={closePalette} />
      <CodeDrawer open={codeOpen} onClose={closeCode} />

      {error && (
        <div className="boot boot--error">
          <span className="boot__mark">Renderer unavailable</span>
          <p className="boot__err">{error}</p>
          <p className="boot__msg">WebGL2 is required</p>
        </div>
      )}
    </div>
  );
}
