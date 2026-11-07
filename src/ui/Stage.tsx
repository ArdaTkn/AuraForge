import { useCallback, useEffect, useRef, useState } from 'react';
import { AuraRenderer } from '../render/engine';
import { setClock, setRenderer } from '../render/runtime';
import { reportStats } from '../platform';
import { useAuraStore } from '../state/store';
import { NodeHud } from './NodeHud';
import { Icon, IconName } from './Icon';
import { AuraNode, AuraParams, NODE_KINDS, aspectDef, outputSize } from '../render/types';

interface StageProps {
  onStats?: (fps: number, frameMs: number) => void;
  onError?: (message: string | null) => void;
}

/** Volume-step ceiling the Performance Guard clamps preview rendering to. */
const GUARD_STEPS = 24;

const KIND_ICON: Record<string, IconName> = NODE_KINDS.reduce(
  (acc, k) => ({ ...acc, [k.id]: k.icon }),
  {},
);

/** uv space: 1 unit == stage height; x is centred, y runs bottom-up. */
function pxToUv(px: number, py: number, w: number, h: number): [number, number] {
  const a = w / h;
  return [(px / w) * a - a / 2, 0.5 - py / h];
}

function uvToPx(x: number, y: number, w: number, h: number): [number, number] {
  const a = w / h;
  return [(x / a + 0.5) * w, (0.5 - y) * h];
}

export function Stage({ onStats, onError }: StageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<AuraRenderer | null>(null);
  const clockRef = useRef(0);
  const epochRef = useRef(-1);
  const statsRef = useRef(0);
  const dragRef = useRef<{ id: string; dx: number; dy: number } | null>(null);

  const [size, setSize] = useState({ w: 0, h: 0 });
  const [error, setError] = useState<string | null>(null);
  const [hoverNode, setHoverNode] = useState<string | null>(null);

  const nodes = useAuraStore((s) => s.nodes);
  const brush = useAuraStore((s) => s.brush);
  const selectedNode = useAuraStore((s) => s.selectedNode);
  const selectNode = useAuraStore((s) => s.selectNode);
  const updateNode = useAuraStore((s) => s.updateNode);
  const removeNode = useAuraStore((s) => s.removeNode);
  const addNode = useAuraStore((s) => s.addNode);
  const aspect = useAuraStore((s) => s.aspect);
  const tier = useAuraStore((s) => s.tier);
  const ratio = aspectDef(aspect).ratio;
  const [outW, outH] = outputSize(aspect, tier);

  /* ------------------------- renderer bootstrap ------------------------- */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let renderer: AuraRenderer;
    try {
      renderer = new AuraRenderer(canvas);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      onError?.(msg);
      return;
    }
    rendererRef.current = renderer;
    setRenderer(renderer);
    onError?.(null);

    let raf = 0;
    let prev = performance.now();
    let fpsEma = 0;

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min((now - prev) / 1000, 0.1);
      if (dt > 1e-4) fpsEma = fpsEma * 0.9 + (1 / dt) * 0.1;
      prev = now;

      const state = useAuraStore.getState();
      const { params, nodes: ns, playing, epoch, exporting, thumbnailPass } = state;

      if (epoch !== epochRef.current) {
        epochRef.current = epoch;
        clockRef.current = 0;
      }

      // While an export — or the scene gallery's thumbnail pass — owns the GPU
      // the preview stops drawing and the clock freezes: they drive the
      // renderer frame by frame and a moving preview would both steal GPU time
      // and make the snapshot time ambiguous.
      if (exporting || thumbnailPass) {
        setClock(clockRef.current);
        return;
      }

      if (playing) clockRef.current += dt;
      setClock(clockRef.current);

      let preview: AuraParams = params;
      if (params.guard && params.steps > GUARD_STEPS) {
        preview = { ...params, steps: GUARD_STEPS };
      }

      renderer.setParams(preview, ns);
      const frameMs = renderer.render(clockRef.current, preview);

      // push stats to React at most ~4x/second
      if (now - statsRef.current > 250) {
        statsRef.current = now;
        onStats?.(fpsEma, frameMs);
        void reportStats(
          fpsEma,
          frameMs,
          renderer.canvas.width,
          renderer.canvas.height,
          preview.steps,
        );
      }
    };

    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      renderer.dispose();
      rendererRef.current = null;
      setRenderer(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------------------- stage sizing ----------------------------
   * The stage is fitted to the largest exact box of the chosen output format
   * inside the workspace. Doing it here (instead of with `aspect-ratio` +
   * `max-width`) is what keeps the canvas aspect mathematically exact, which
   * the shader relies on: uv is derived from the resolution and any drift
   * would skew the whole flow field.
   */
  useEffect(() => {
    const el = stageRef.current;
    const wrap = el?.parentElement;
    if (!el || !wrap) return;

    const fit = () => {
      const cs = getComputedStyle(wrap);
      const availW =
        wrap.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const availH =
        wrap.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      if (availW <= 0 || availH <= 0) return;
      const h = Math.min(availH, availW / ratio);
      setSize({ w: h * ratio, h });
      rendererRef.current?.resizeToDisplay();
    };

    const ro = new ResizeObserver(fit);
    ro.observe(wrap);
    fit();
    return () => ro.disconnect();
  }, [ratio]);

  /* --------------------------- node dragging ---------------------------- */
  const onNodePointerDown = useCallback(
    (e: React.PointerEvent, node: AuraNode) => {
      e.stopPropagation();
      const el = stageRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const [ux, uy] = pxToUv(
        e.clientX - rect.left,
        e.clientY - rect.top,
        rect.width,
        rect.height,
      );
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      dragRef.current = { id: node.id, dx: node.x - ux, dy: node.y - uy };
      selectNode(node.id);
    },
    [selectNode],
  );

  const onNodePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragRef.current;
      const el = stageRef.current;
      if (!drag || !el) return;
      const rect = el.getBoundingClientRect();
      const [ux, uy] = pxToUv(
        e.clientX - rect.left,
        e.clientY - rect.top,
        rect.width,
        rect.height,
      );
      const a = rect.width / rect.height;
      updateNode(drag.id, {
        x: Math.max(-a / 2, Math.min(a / 2, ux + drag.dx)),
        y: Math.max(-0.5, Math.min(0.5, uy + drag.dy)),
      });
    },
    [updateNode],
  );

  const onNodePointerUp = useCallback((e: React.PointerEvent) => {
    if (dragRef.current) {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      dragRef.current = null;
    }
  }, []);

  const onStageDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      const el = stageRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const [ux, uy] = pxToUv(
        e.clientX - rect.left,
        e.clientY - rect.top,
        rect.width,
        rect.height,
      );
      addNode(ux, uy, brush);
    },
    [addNode, brush],
  );

  const selectedNodeData = nodes.find((n) => n.id === selectedNode) ?? null;

  return (
    <div
      className="stage"
      ref={stageRef}
      style={size.w > 0 ? { width: size.w, height: size.h } : undefined}
    >
      <canvas className="stage__canvas" ref={canvasRef} />

      {!error && size.h > 1 && (
        <div
          className="stage__overlay"
          onPointerDown={() => selectNode(null)}
          onDoubleClick={onStageDoubleClick}
        >
          {nodes.map((n) => {
            const [px, py] = uvToPx(n.x, n.y, size.w, size.h);
            const ring = Math.max(16, n.radius * 2 * size.h);
            return (
              <div key={n.id}>
                <div
                  className="node__halo"
                  style={{
                    left: px,
                    top: py,
                    width: ring,
                    height: ring,
                    borderColor: n.color,
                    opacity:
                      !n.enabled ? 0.08 : hoverNode === n.id || selectedNode === n.id ? 0.55 : 0.16,
                  }}
                />
                <div
                  className={`node${selectedNode === n.id ? ' is-selected' : ''}${
                    n.enabled ? '' : ' is-off'
                  }`}
                  style={{ left: px, top: py, color: n.color, borderColor: n.color }}
                  title={`${NODE_KINDS.find((k) => k.id === n.kind)?.label ?? n.kind} · drag to move · right click to delete`}
                  onPointerDown={(e) => onNodePointerDown(e, n)}
                  onPointerMove={onNodePointerMove}
                  onPointerUp={onNodePointerUp}
                  onPointerCancel={onNodePointerUp}
                  onPointerEnter={() => setHoverNode(n.id)}
                  onPointerLeave={() => setHoverNode(null)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    removeNode(n.id);
                  }}
                >
                  <span className="node__glyph">
                    <Icon name={KIND_ICON[n.kind] ?? 'nodes'} size={12} />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="stage__hud">
        <span>
          {outW} × {outH} · {aspectDef(aspect).short}
        </span>
        <span>
          {nodes.length} node{nodes.length === 1 ? '' : 's'} · brush{' '}
          {NODE_KINDS.find((k) => k.id === brush)?.label.toLowerCase()}
        </span>
      </div>

      {selectedNodeData && size.h > 1 && (
        <NodeHud
          node={selectedNodeData}
          px={uvToPx(selectedNodeData.x, selectedNodeData.y, size.w, size.h)[0]}
          py={uvToPx(selectedNodeData.x, selectedNodeData.y, size.w, size.h)[1]}
          width={size.w}
          height={size.h}
        />
      )}

      {error && <div className="stage__err">RENDERER ERROR{'\n\n'}{error}</div>}
    </div>
  );
}
