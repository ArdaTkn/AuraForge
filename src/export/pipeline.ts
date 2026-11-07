import {
  ImageResult,
  RenderConfig,
  RenderResult,
  beginRender,
  bytesToBase64,
  cancelRender,
  endRender,
  pushFrame,
  saveImage,
} from '../platform';
import { getClock, getRenderer } from '../render/runtime';
import { AuraNode, AuraParams } from '../render/types';
import { StillDef } from '../state/store';

export interface Progress {
  phase: 'idle' | 'rendering' | 'encoding' | 'done' | 'error' | 'cancelled';
  frame: number;
  total: number;
  message?: string;
}

export type ProgressFn = (p: Progress) => void;

let cancelRequested = false;

export function requestCancel() {
  cancelRequested = true;
}

/** True when this webview's canvas can actually encode the given format.
 * WKWebView (macOS) has no WebP encoder: `toBlob('image/webp')` silently hands
 * back a PNG instead of failing, so the only reliable test is to ask for one
 * and look at what comes back. */
export function supportsStillFormat(format: StillDef): boolean {
  if (!format.lossy) return true;
  try {
    const c = document.createElement('canvas');
    c.width = 1;
    c.height = 1;
    return c.toDataURL(format.mime).startsWith(`data:${format.mime}`);
  } catch {
    return false;
  }
}

/** Draws an RGBA buffer into a 2D canvas and encodes it as PNG / JPEG / WebP. */
async function encodeStill(
  rgba: Uint8Array,
  width: number,
  height: number,
  format: StillDef,
  quality: number,
): Promise<Uint8Array> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not create a 2D staging context for image encoding.');

  // renderToPixels may hand back a padded buffer; copy exactly w*h*4 bytes.
  ctx.putImageData(
    new ImageData(new Uint8ClampedArray(rgba.subarray(0, width * height * 4)), width, height),
    0,
    0,
  );

  const blob = await new Promise<Blob | null>((resolve) =>
    format.lossy
      ? canvas.toBlob((b) => resolve(b), format.mime, quality)
      : canvas.toBlob((b) => resolve(b), format.mime),
  );
  if (!blob) throw new Error(`${format.label} encoding failed.`);

  // The browser falls back to PNG instead of refusing an encoder it lacks, so
  // verify what actually came back rather than trusting the mime we asked for.
  if (blob.type !== format.mime) {
    throw new Error(
      `This webview cannot encode ${format.label} (it produced ${blob.type || 'an unknown type'}).`,
    );
  }
  return new Uint8Array(await blob.arrayBuffer());
}

export interface StillOptions {
  width: number;
  height: number;
  format: StillDef;
  /** 0..1, ignored by lossless formats */
  quality: number;
  name: string;
}

/**
 * Renders one frame at the requested output size, at the preview's current
 * time, and writes it to ~/Pictures/AuraForge.
 */
export async function renderStill(
  params: AuraParams,
  nodes: AuraNode[],
  opts: StillOptions,
): Promise<ImageResult> {
  const renderer = getRenderer();
  if (!renderer) throw new Error('Renderer is not ready yet.');

  const t = getClock();
  renderer.setParams(params, nodes);
  const rgba = renderer.renderToPixels(opts.width, opts.height, t, params);
  const bytes = await encodeStill(rgba, opts.width, opts.height, opts.format, opts.quality);

  return saveImage(bytesToBase64(bytes), opts.name, opts.format.id);
}

export interface VideoOptions {
  width: number;
  height: number;
  fps: number;
  seconds: number;
  quality: RenderConfig['quality'];
  name: string;
}

/**
 * Renders `fps * seconds` deterministic frames at the requested output size and
 * streams them into ffmpeg. Frame N is drawn at `t = N / fps`, so the same seed
 * always produces the same clip regardless of how fast the machine is.
 */
export async function renderVideo(
  params: AuraParams,
  nodes: AuraNode[],
  cfg: VideoOptions,
  onProgress: ProgressFn,
): Promise<RenderResult> {
  const renderer = getRenderer();
  if (!renderer) throw new Error('Renderer is not ready yet.');

  cancelRequested = false;

  const { width, height } = cfg;
  const total = Math.max(1, Math.round(cfg.fps * cfg.seconds));

  const path = await beginRender({
    width,
    height,
    fps: cfg.fps,
    seconds: cfg.seconds,
    quality: cfg.quality,
    name: cfg.name,
  });

  onProgress({ phase: 'rendering', frame: 0, total, message: path });

  try {
    for (let f = 0; f < total; f++) {
      if (cancelRequested) {
        await cancelRender();
        onProgress({ phase: 'cancelled', frame: f, total });
        throw new Error('Render cancelled.');
      }

      // setParams + renderToPixels run back-to-back with no await between
      // them, so the preview's animation frame can never interleave and
      // corrupt the exported frame.
      renderer.setParams(params, nodes);
      const rgba = renderer.renderToPixels(width, height, f / cfg.fps, params);
      await pushFrame(rgba);

      onProgress({ phase: 'rendering', frame: f + 1, total });
      // yield so the progress UI can repaint
      if (f % 3 === 2) await new Promise((r) => setTimeout(r, 0));
    }

    onProgress({ phase: 'encoding', frame: total, total, message: 'finalising with ffmpeg' });
    const result = await endRender();
    onProgress({ phase: 'done', frame: total, total, message: result.path });
    return result;
  } catch (err) {
    if (!cancelRequested) {
      await cancelRender().catch(() => undefined);
      onProgress({
        phase: 'error',
        frame: 0,
        total,
        message: err instanceof Error ? err.message : String(err),
      });
    }
    throw err;
  }
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}
