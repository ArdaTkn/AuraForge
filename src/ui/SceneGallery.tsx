import { useEffect, useState } from 'react';
import { DEFAULT_NODES, SCENES, Scene, aspectDef } from '../render/types';
import { mergeParams, useAuraStore } from '../state/store';
import { getRenderer } from '../render/runtime';

const THUMB_H = 192;
/** a moment into the animation, so thumbnails look established */
const THUMB_T = 2.4;

/* Scene recipes never change, so the thumbnails are built once per aspect and
 * shared. A module-level promise (rather than a ref) is what makes that safe
 * under React StrictMode, which deliberately runs effects twice: both mounts
 * await the same build instead of the second one being cancelled by the first. */
const cache = new Map<string, Record<string, string>>();
const inflight = new Map<string, Promise<Record<string, string>>>();

type ThumbState = Record<string, string>;

function toDataUrl(rgba: Uint8Array, w: number, h: number): string {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  // renderToPixels hands back a shared buffer — copy before it is reused
  ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba), w, h), 0, 0);
  return canvas.toDataURL('image/jpeg', 0.72);
}

async function buildThumbs(
  key: string,
  width: number,
  height: number,
  onPartial: (t: ThumbState) => void,
  setThumbnailPass: (on: boolean) => void,
): Promise<ThumbState> {
  const renderer = getRenderer();
  if (!renderer) throw new Error('the renderer is not ready yet');

  // pause the live preview so the two passes cannot fight over the cache
  setThumbnailPass(true);
  await new Promise((r) => window.setTimeout(r, 80));

  const next: ThumbState = {};
  try {
    for (const scene of SCENES) {
      const params = mergeParams(scene.params);
      const nodes = scene.nodes ?? DEFAULT_NODES;
      renderer.setParams(params, nodes);
      const rgba = renderer.renderToPixels(width, height, THUMB_T, params);
      next[scene.name] = toDataUrl(rgba, width, height);
      if (Object.keys(next).length % 3 === 0) {
        onPartial({ ...next });
        await new Promise((r) => window.setTimeout(r, 0));
      }
    }
  } finally {
    setThumbnailPass(false);
  }
  void key;
  return next;
}

/**
 * A gallery of complete looks. Each thumbnail is the scene rendered for real by
 * the studio's own renderer at a small size, so what you see is what you get —
 * there are no hand-authored preview images to drift out of date.
 */
export function SceneGallery() {
  const applyScene = useAuraStore((s) => s.applyScene);
  const status = useAuraStore((s) => s.status);
  const setThumbnailPass = useAuraStore((s) => s.setThumbnailPass);
  const aspect = useAuraStore((s) => s.aspect);
  const ratio = aspectDef(aspect).ratio;
  const thumbW = Math.max(48, Math.round(THUMB_H * ratio));
  const key = `${thumbW}x${THUMB_H}`;

  const [thumbs, setThumbs] = useState<ThumbState>(() => cache.get(key) ?? {});
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    const run = async () => {
      const hit = cache.get(key);
      if (hit) {
        setThumbs(hit);
        return;
      }
      setThumbs({});
      try {
        let pending = inflight.get(key);
        if (!pending) {
          pending = buildThumbs(
            key,
            thumbW,
            THUMB_H,
            (partial) => {
              if (alive) setThumbs(partial);
            },
            setThumbnailPass,
          ).then((result) => {
            cache.set(key, result);
            return result;
          });
          inflight.set(key, pending);
          // a failed build must not poison the cache for a retry
          pending.catch(() => {
            inflight.delete(key);
          });
        }
        const result = await pending;
        if (alive) setThumbs(result);
      } catch (err) {
        if (alive) setFailure(err instanceof Error ? err.message : String(err));
      }
    };

    void run();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (
    <>
      {failure && <p className="alert">Thumbnails unavailable: {failure}</p>}

      <div className="scenes">
        {SCENES.map((scene: Scene) => {
          const thumb = thumbs[scene.name];
          return (
            <button
              key={scene.name}
              className={`scene${status === `Scene · ${scene.name}` ? ' is-active' : ''}`}
              onClick={() => applyScene(scene)}
              title={scene.blurb}
            >
              {thumb ? (
                <img className="scene__thumb" src={thumb} alt={scene.name} draggable={false} />
              ) : (
                <span
                  className="scene__thumb scene__thumb--empty"
                  style={{ aspectRatio: `${ratio}` }}
                >
                  render…
                </span>
              )}
              <span className="scene__meta">
                <span className="scene__name">{scene.name}</span>
                <span className="scene__blurb">{scene.blurb}</span>
              </span>
            </button>
          );
        })}
      </div>

      <p className="hint">
        Each thumbnail is the scene rendered by the studio’s own engine at the current{' '}
        {aspectDef(aspect).short} format. Loading a scene replaces the palette, structure and
        nodes together.
      </p>
    </>
  );
}
