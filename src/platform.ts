/**
 * Platform bridge. Everything here degrades to a no-op when the studio is
 * opened in a plain browser, so the same bundle runs in `npm run dev` and
 * inside the Tauri webview.
 */

const inTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export const IS_TAURI = inTauri;

type Invoke = <T>(cmd: string, args?: unknown) => Promise<T>;

async function core(): Promise<Invoke | null> {
  if (!inTauri) return null;
  const mod = await import('@tauri-apps/api/core');
  return mod.invoke as unknown as Invoke;
}

/** Forward render telemetry to the Rust side (debug builds print it). */
export async function reportStats(
  fps: number,
  frameMs: number,
  width: number,
  height: number,
  steps: number,
): Promise<void> {
  const invoke = await core();
  if (!invoke) return;
  try {
    await invoke('report_stats', { fps, frameMs, width, height, steps });
  } catch {
    /* telemetry must never break the studio */
  }
}

/** Console-free logging for the in-app self test (debug builds only). */
export async function devLog(message: string): Promise<void> {
  const invoke = await core();
  if (invoke) {
    try {
      await invoke('dev_log', { message });
      return;
    } catch {
      /* fall through to the console */
    }
  }
  // eslint-disable-next-line no-console
  console.log(`[auraforge] ${message}`);
}

/* ------------------------------ export API ------------------------------ */

export interface RenderConfig {
  width: number;
  height: number;
  fps: number;
  seconds: number;
  quality: 'draft' | 'stream' | 'high' | 'master' | 'lossless';
  name: string;
}

export interface RenderResult {
  path: string;
  frames: number;
  bytes: number;
  fps: number;
  elapsedMs: number;
}

export interface ImageResult {
  path: string;
  bytes: number;
  width: number;
  height: number;
  format: string;
}

export interface ExportRoots {
  images: string;
  videos: string;
}

export async function exportRoot(): Promise<ExportRoots | null> {
  const invoke = await core();
  if (!invoke) return null;
  try {
    return await invoke<ExportRoots>('export_root');
  } catch {
    return null;
  }
}

export async function ffmpegVersion(): Promise<string | null> {
  const invoke = await core();
  if (!invoke) return null;
  try {
    return await invoke<string>('ffmpeg_version');
  } catch {
    return null;
  }
}

export async function beginRender(cfg: RenderConfig): Promise<string> {
  const invoke = await core();
  if (!invoke) throw new Error('Video export requires the AuraForge desktop app.');
  return invoke<string>('begin_render', {
    width: cfg.width,
    height: cfg.height,
    fps: cfg.fps,
    quality: cfg.quality,
    name: cfg.name,
  });
}

/**
 * Ships one raw RGBA frame to ffmpeg's stdin. The frame travels as a raw IPC
 * body (no JSON, no base64) — 1080x1920 RGBA is 8.3 MB per frame and encoding
 * it as text would dominate the render time.
 */
export async function pushFrame(rgba: Uint8Array): Promise<number> {
  const invoke = await core();
  if (!invoke) throw new Error('Video export requires the AuraForge desktop app.');
  return invoke<number>('push_frame', rgba);
}

export async function endRender(): Promise<RenderResult> {
  const invoke = await core();
  if (!invoke) throw new Error('Video export requires the AuraForge desktop app.');
  return invoke<RenderResult>('end_render');
}

export async function cancelRender(): Promise<void> {
  const invoke = await core();
  if (!invoke) return;
  try {
    await invoke('cancel_render');
  } catch {
    /* already finished */
  }
}

export async function saveImage(
  dataBase64: string,
  name: string,
  format: string,
): Promise<ImageResult> {
  const invoke = await core();
  if (!invoke) throw new Error('Image export requires the AuraForge desktop app.');
  return invoke<ImageResult>('save_image', { data: dataBase64, name, format });
}

export async function revealInFinder(path: string): Promise<void> {
  const invoke = await core();
  if (!invoke) return;
  try {
    await invoke('reveal', { path });
  } catch {
    /* nothing to do */
  }
}

/* ------------------------------ JS helpers ------------------------------ */

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
