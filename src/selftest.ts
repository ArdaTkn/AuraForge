/**
 * End-to-end self test.
 *
 * The native window cannot be driven from outside the app (macOS blocks
 * synthetic input for the agent's terminal), so the export path is exercised
 * from the inside instead. Run the studio with
 *
 *   VITE_AURAFORGE_SELFTEST=1 npm run app:dev
 *
 * and this module pushes one render through EVERY output path — three still
 * formats at three different aspect ratios and two videos at two ratios and
 * two quality tiers — and reports each outcome to the Rust side, which prints
 * it to stdout. A format is only considered working when the native writer
 * sniffed the bytes back and agreed on the dimensions.
 */

import { devLog } from './platform';
import { useAuraStore } from './state/store';
import { renderStill, renderVideo, supportsStillFormat } from './export/pipeline';
import { generate } from './codegen';
import { STILL_FORMATS } from './state/store';
import { TierId, outputSize } from './render/types';

function enabled(): boolean {
  return import.meta.env.VITE_AURAFORGE_SELFTEST === '1';
}

async function waitForRenderer(timeoutMs = 15000): Promise<boolean> {
  const started = Date.now();
  const { getRenderer } = await import('./render/runtime');
  while (Date.now() - started < timeoutMs) {
    if (getRenderer()) return true;
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

let failures = 0;

async function attempt(label: string, fn: () => Promise<string>): Promise<void> {
  try {
    const detail = await fn();
    await devLog(`SELFTEST ok   ${label} ${detail}`);
  } catch (e) {
    failures += 1;
    await devLog(`SELFTEST FAIL ${label}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export async function runSelfTest(): Promise<void> {
  if (!enabled()) return;

  await devLog('SELFTEST start');
  if (!(await waitForRenderer())) {
    await devLog('SELFTEST FAIL renderer never became ready');
    return;
  }

  const { params, nodes } = useAuraStore.getState();
  const seed = params.seed;

  /* 1 — code generation, at the current output size */
  await attempt('codegen', async () => {
    const size = outputSize('reels', 'hd');
    const p5 = generate('p5', params, nodes, size);
    const glsl = generate('glsl', params, nodes);
    const consts = (glsl.match(/^const /gm) || []).length;
    if (!glsl.includes('#version 300 es')) throw new Error('GLSL lost its #version line');
    if (!p5.includes(`${size[0]}x${size[1]}`)) throw new Error('p5 canvas size is wrong');
    return `p5=${p5.length}b glsl=${glsl.length}b consts=${consts}`;
  });

  /* 2 — every still format, at a different aspect ratio each */
  const stillCases: { aspect: 'reels' | 'landscape' | 'square'; format: number }[] = [
    { aspect: 'reels', format: 0 }, // PNG   9:16  1080x1920
    { aspect: 'landscape', format: 1 }, // JPEG  16:9  1920x1080
    { aspect: 'square', format: 2 }, // WebP  1:1   1080x1080
  ];

  for (const c of stillCases) {
    const fmt = STILL_FORMATS[c.format];
    const [w, h] = outputSize(c.aspect, 'hd');

    // A format the webview cannot encode is reported as skipped, never as
    // passed — the browser hands back a PNG instead of failing, so an
    // unguarded test would happily "pass" while producing the wrong file.
    if (!supportsStillFormat(fmt)) {
      await devLog(`SELFTEST skip still ${fmt.label} — this webview has no ${fmt.label} encoder`);
      continue;
    }

    await attempt(`still ${fmt.label} ${w}x${h}`, async () => {
      const r = await renderStill(params, nodes, {
        width: w,
        height: h,
        format: fmt,
        quality: 0.92,
        name: `selftest-${seed}-${c.aspect}`,
      });
      if (r.format !== fmt.id) throw new Error(`writer reported ${r.format}, wanted ${fmt.id}`);
      if (r.width !== w || r.height !== h) {
        throw new Error(`writer read back ${r.width}x${r.height}, wanted ${w}x${h}`);
      }
      return `${r.path} ${r.width}x${r.height} ${r.bytes}B`;
    });
  }

  /* 3 — video at two ratios and two quality tiers */
  const videoCases: {
    aspect: 'reels' | 'landscape';
    tier: TierId;
    quality: 'draft' | 'high';
    fps: number;
    seconds: number;
  }[] = [
    { aspect: 'reels', tier: 'hd', quality: 'high', fps: 60, seconds: 2 },
    { aspect: 'landscape', tier: 'draft', quality: 'draft', fps: 30, seconds: 1 },
  ];

  for (const c of videoCases) {
    const [w, h] = outputSize(c.aspect, c.tier);
    await attempt(`mp4 ${c.aspect} ${w}x${h} ${c.quality}`, async () => {
      const r = await renderVideo(
        params,
        nodes,
        {
          width: w,
          height: h,
          fps: c.fps,
          seconds: c.seconds,
          quality: c.quality,
          name: `selftest-${seed}-${c.aspect}-${c.quality}`,
        },
        () => undefined,
      );
      const want = Math.max(1, Math.round(c.fps * c.seconds));
      if (r.frames !== want) throw new Error(`encoded ${r.frames} frames, wanted ${want}`);
      if (r.bytes === 0) throw new Error('ffmpeg produced an empty file');
      return `${r.path} frames=${r.frames} fps=${r.fps} ${r.bytes}B ${r.elapsedMs}ms`;
    });
  }

  await devLog(failures === 0 ? 'SELFTEST done · all paths passed' : `SELFTEST done · ${failures} FAILED`);
}
