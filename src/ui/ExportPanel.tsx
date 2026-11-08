import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ASPECTS,
  AspectDef,
  TIERS,
  aspectDef,
  outputSize,
} from '../render/types';
import { QUALITIES, STILL_FORMATS, StillDef, qualityDef, useAuraStore } from '../state/store';
import {
  IS_TAURI,
  ImageResult,
  RenderResult,
  exportRoot,
  ffmpegVersion,
  revealInFinder,
} from '../platform';
import {
  Progress,
  formatBytes,
  formatDuration,
  renderStill,
  renderVideo,
  requestCancel,
  supportsStillFormat,
} from '../export/pipeline';
import { Icon } from './Icon';

/* Rough bytes per pixel-second by quality, measured on the reference render at
 * 1080x1920. Only ever used to set expectations before a render, never as a
 * promise — the real number depends entirely on the motion in the frame. */
const BASE_BYTES_PER_PIXEL_SECOND = 0.0072;

/** Why a format can be missing, so the UI can say something true instead of
 * quietly offering a button that produces the wrong file. */
const UNAVAILABLE: Record<string, string> = {
  webp: 'the macOS webview has no WebP encoder, and the ffmpeg on this machine was built without libwebp',
};

function estimateBytes(w: number, h: number, seconds: number, weight: number): number {
  return w * h * seconds * BASE_BYTES_PER_PIXEL_SECOND * weight;
}

function visibleFrames(fps: number, seconds: number): number {
  return Math.max(1, Math.round(fps * seconds));
}

/** A proportional swatch showing what each format actually looks like. */
function AspectChip({ def, active }: { def: AspectDef; active: boolean }) {
  const longest = Math.max(def.ratio, 1);
  const w = def.ratio >= 1 ? 22 : 22 * def.ratio;
  const h = def.ratio >= 1 ? 22 / def.ratio : 22;
  void longest;
  return (
    <span className="aspect__chip" aria-hidden>
      <span
        className={`aspect__box${active ? ' is-active' : ''}`}
        style={{ width: w, height: h }}
      />
    </span>
  );
}

export function ExportPanel() {
  const params = useAuraStore((s) => s.params);
  const nodes = useAuraStore((s) => s.nodes);
  const aspect = useAuraStore((s) => s.aspect);
  const tier = useAuraStore((s) => s.tier);
  const setAspect = useAuraStore((s) => s.setAspect);
  const setTier = useAuraStore((s) => s.setTier);
  const setExporting = useAuraStore((s) => s.setExporting);

  const [fps, setFps] = useState(60);
  const [seconds, setSeconds] = useState(6);
  const [quality, setQuality] = useState(QUALITIES[2].id);
  const [stillFormat, setStillFormat] = useState<StillDef>(STILL_FORMATS[0]);
  const [stillQuality, setStillQuality] = useState(0.92);

  // asked once — the answer cannot change while the app is running
  const stillSupported = useMemo(
    () => Object.fromEntries(STILL_FORMATS.map((f) => [f.id, supportsStillFormat(f)])),
    [],
  );

  const [progress, setProgress] = useState<Progress>({ phase: 'idle', frame: 0, total: 0 });
  const [busy, setBusy] = useState(false);
  const [image, setImage] = useState<ImageResult | null>(null);
  const [video, setVideo] = useState<RenderResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [roots, setRoots] = useState<{ images: string; videos: string } | null>(null);
  const [ffmpeg, setFfmpeg] = useState<string | null>(null);

  useEffect(() => {
    if (!IS_TAURI) return;
    void exportRoot().then((r) => {
      if (r) setRoots(r);
    });
    void ffmpegVersion().then(setFfmpeg);
  }, []);

  const [width, height] = outputSize(aspect, tier);
  const activeAspect = aspectDef(aspect);
  const q = qualityDef(quality);

  const name = useMemo(
    () => `auraforge-${params.seed}-${width}x${height}`,
    [params.seed, width, height],
  );

  const frames = visibleFrames(fps, seconds);
  const stillEstimate = width * height * (stillFormat.lossy ? 0.28 : 1.9);

  const doStill = useCallback(async () => {
    setError(null);
    setBusy(true);
    setExporting(true);
    try {
      setImage(
        await renderStill(params, nodes, {
          width,
          height,
          format: stillFormat,
          quality: stillQuality,
          name,
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setExporting(false);
    }
  }, [params, nodes, width, height, stillFormat, stillQuality, name, setExporting]);

  const doVideo = useCallback(async () => {
    setError(null);
    setVideo(null);
    setBusy(true);
    setExporting(true);
    try {
      setVideo(
        await renderVideo(params, nodes, { width, height, fps, seconds, quality, name }, setProgress),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setExporting(false);
    }
  }, [params, nodes, width, height, fps, seconds, quality, name, setExporting]);

  const pct = progress.total > 0 ? (progress.frame / progress.total) * 100 : 0;
  const rendering = progress.phase === 'rendering' || progress.phase === 'encoding';

  return (
    <>
      {!IS_TAURI && (
        <p className="alert alert--warn">
          Running in a plain browser: the controls below are live, but writing files needs the
          desktop app. Launch with <b>npm run app:dev</b> (and have ffmpeg on the PATH for
          video).
        </p>
      )}
      {/* ─────────────────────────── format ─────────────────────────── */}
      <div className="ctl">
        <div className="ctl__head">
          <span className="ctl__label">Format</span>
          <span className="ctl__value">
            {activeAspect.short} · {activeAspect.label}
          </span>
        </div>
        <div className="aspect-grid">
          {ASPECTS.map((a) => (
            <button
              key={a.id}
              className={`aspect${a.id === aspect ? ' is-active' : ''}`}
              onClick={() => setAspect(a.id)}
              title={a.use}
            >
              <AspectChip def={a} active={a.id === aspect} />
              <span className="aspect__label">{a.label}</span>
              <span className="aspect__ratio">{a.short}</span>
            </button>
          ))}
        </div>
        <p className="hint">
          {activeAspect.use} — the frame holds the same vertical composition; only the
          horizontal field of view changes, so the artwork reframes instead of stretching.
        </p>
      </div>

      {/* ───────────────────────── resolution ───────────────────────── */}
      <div className="ctl">
        <div className="ctl__head">
          <span className="ctl__label">Resolution</span>
          <span className="ctl__value">
            {width} × {height}
          </span>
        </div>
        <div className="seg">
          {TIERS.map((t) => (
            <button
              key={t.id}
              className={`seg__btn${t.id === tier ? ' is-active' : ''}`}
              onClick={() => setTier(t.id)}
              title={`${t.note} · ${outputSize(aspect, t.id).join(' × ')}`}
            >
              {outputSize(aspect, t.id)[0]}p
            </button>
          ))}
        </div>
        <p className="hint">
          {TIERS.find((t) => t.id === tier)?.note}. Cost scales with pixel count — 4K takes
          roughly four times as long as HD.
        </p>
      </div>

      {/* ─────────────────────────── still ─────────────────────────── */}
      <div className="ctl">
        <div className="ctl__head">
          <span className="ctl__label">Still image</span>
          <span className="ctl__value">
            {stillFormat.label} · {width}×{height}
          </span>
        </div>
        <div className="seg">
          {STILL_FORMATS.map((f) => {
            const ok = stillSupported[f.id];
            return (
              <button
                key={f.id}
                className={`seg__btn${f.id === stillFormat.id ? ' is-active' : ''}`}
                disabled={!ok}
                onClick={() => ok && setStillFormat(f)}
                title={ok ? f.summary : `${f.label} is not available — ${UNAVAILABLE[f.id]}`}
              >
                {f.label}
              </button>
            );
          })}
        </div>
        <p className="hint">
          {stillSupported[stillFormat.id]
            ? stillFormat.summary
            : `Unavailable in this build — ${UNAVAILABLE[stillFormat.id]}`}
        </p>
        {stillFormat.lossy && (
          <div className="ctl">
            <div className="ctl__head">
              <span className="ctl__label">Image quality</span>
              <span className="ctl__value">{Math.round(stillQuality * 100)}%</span>
            </div>
            <input
              className="range"
              type="range"
              min={0.5}
              max={1}
              step={0.01}
              value={stillQuality}
              onChange={(e) => setStillQuality(Number.parseFloat(e.target.value))}
            />
          </div>
        )}
        <button className="btn btn--wide" disabled={busy} onClick={() => void doStill()}>
          <Icon name="image" size={12} /> Save still · ~{formatBytes(stillEstimate)}
        </button>
      </div>

      {/* ─────────────────────────── video ─────────────────────────── */}
      <div className="ctl">
        <div className="ctl__head">
          <span className="ctl__label">Video length</span>
          <span className="ctl__value">{seconds.toFixed(1)} s</span>
        </div>
        <input
          className="range"
          type="range"
          min={1}
          max={30}
          step={0.5}
          value={seconds}
          onChange={(e) => setSeconds(Number.parseFloat(e.target.value))}
        />
        <div className="ctl__head" style={{ marginTop: 4 }}>
          <span className="ctl__label">Frame rate</span>
          <span className="ctl__value">
            {fps} fps · {frames} frames
          </span>
        </div>
        <div className="seg">
          {[24, 30, 60].map((v) => (
            <button
              key={v}
              className={`seg__btn${fps === v ? ' is-active' : ''}`}
              onClick={() => setFps(v)}
              title={
                v === 24
                  ? 'Cinematic cadence'
                  : v === 30
                    ? 'Standard social video'
                    : 'Smooth — what motion designers expect'
              }
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* ────────────────────────── quality ────────────────────────── */}
      <div className="ctl">
        <div className="ctl__head">
          <span className="ctl__label">Video quality</span>
          <span className="ctl__value">{q.detail}</span>
        </div>
        <div className="qrows">
          {QUALITIES.map((item) => (
            <button
              key={item.id}
              className={`qrow${item.id === quality ? ' is-active' : ''}`}
              onClick={() => setQuality(item.id)}
            >
              <span className="qrow__dot" />
              <span className="qrow__name">{item.label}</span>
              <span className="qrow__size">
                ~{formatBytes(estimateBytes(width, height, seconds, item.weight))}
              </span>
            </button>
          ))}
        </div>
        <p className="hint">
          <b>{q.label}.</b> {q.summary}
        </p>
        {!q.socialSafe && (
          <p className="alert alert--warn">
            Lossless is pixel-identical to what is on screen, but at 4:4:4 colour it makes a
            very large file that Instagram, TikTok and some hardware players reject. Use{' '}
            <b>Master</b> for social; keep Lossless for handing to an editor.
          </p>
        )}
      </div>

      <button className="btn btn--render" disabled={busy} onClick={() => void doVideo()}>
        <span className="btn__mark">
          <Icon name="export" size={16} />
        </span>
        <span className="btn__stack">
          <span className="btn__label">Render MP4</span>
          <span className="btn__meta">
            {width}×{height} · {frames} frames · {fps} fps · ~
            {formatBytes(estimateBytes(width, height, seconds, q.weight))}
          </span>
        </span>
      </button>

      {(rendering || progress.phase === 'done') && (
        <div className="progress">
          <div className="progress__bar">
            <span style={{ width: `${progress.phase === 'done' ? 100 : pct}%` }} />
          </div>
          <div className="progress__meta">
            <span>
              {progress.phase === 'encoding'
                ? 'encoding with ffmpeg…'
                : `${progress.frame} / ${progress.total} frames · ${width}×${height}`}
            </span>
            <span>{pct.toFixed(0)}%</span>
          </div>
        </div>
      )}

      {rendering && (
        <button className="btn btn--danger" onClick={requestCancel}>
          <Icon name="close" size={12} /> Cancel render
        </button>
      )}

      {error && <p className="alert">{error}</p>}

      {image && (
        <div className="result">
          <span className="result__tag">{image.format.toUpperCase()}</span>
          <span className="result__path" title={image.path}>
            {image.path}
          </span>
          <span className="result__meta">
            {image.width}×{image.height} · {formatBytes(image.bytes)}
          </span>
          <button className="btn btn--icon" onClick={() => void revealInFinder(image.path)}>
            <Icon name="external" size={12} />
          </button>
        </div>
      )}

      {video && (
        <div className="result">
          <span className="result__tag">MP4</span>
          <span className="result__path" title={video.path}>
            {video.path}
          </span>
          <span className="result__meta">
            {video.frames}f · {video.fps}fps · {formatBytes(video.bytes)} ·{' '}
            {formatDuration(video.elapsedMs)}
          </span>
          <button className="btn btn--icon" onClick={() => void revealInFinder(video.path)}>
            <Icon name="external" size={12} />
          </button>
        </div>
      )}

      <p className="hint">
        {ffmpeg ? ffmpeg.split(' Copyright')[0] : '⚠ ffmpeg not found on PATH'}
        <br />
        Stills → {roots?.images ?? '~/Pictures/AuraForge'}
        <br />
        Video → {roots?.videos ?? '~/Movies/AuraForge'}
      </p>
    </>
  );
}
