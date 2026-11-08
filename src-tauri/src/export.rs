//! Native export pipeline.
//!
//! The webview owns the pixels; Rust owns the filesystem and ffmpeg.
//!
//! * PNG   — the frontend renders one 1080x1920 frame, hands over the encoded
//!           bytes, and this module validates the PNG header before writing it.
//! * Video — the frontend starts a session, then streams one raw RGBA frame at
//!           a time straight into `ffmpeg`'s stdin. Frames are never buffered:
//!           1080x1920 RGBA is 8.3 MB per frame, so a 10 s / 60 fps clip would
//!           otherwise need 5 GB of RAM before encoding.
//!
//! Frame N always corresponds to `t = N / fps`, which is what makes the render
//! reproducible: the shader is a pure function of (uniforms, time).

use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::Mutex;
use std::time::Instant;

use serde::Serialize;
use tauri::ipc::InvokeBody;

/* ------------------------------- state ------------------------------- */

pub(crate) struct RenderSession {
    child: Child,
    stdin: ChildStdin,
    out_path: PathBuf,
    log_path: PathBuf,
    frames: u32,
    started: Instant,
    fps: u32,
}

#[derive(Default)]
pub struct ExportState(pub Mutex<Option<RenderSession>>);

#[derive(Serialize)]
pub struct ExportRoots {
    images: String,
    videos: String,
}

#[derive(Serialize)]
pub struct ImageResult {
    path: String,
    bytes: u64,
    width: u32,
    height: u32,
    format: String,
}

#[derive(Serialize)]
pub struct RenderResult {
    path: String,
    frames: u32,
    bytes: u64,
    fps: u32,
    #[serde(rename = "elapsedMs")]
    elapsed_ms: u64,
}

/* ------------------------------ helpers ------------------------------ */

fn home() -> Result<PathBuf, String> {
    std::env::var_os("HOME")
        .map(PathBuf::from)
        .ok_or_else(|| "could not resolve $HOME".to_string())
}

fn images_dir() -> Result<PathBuf, String> {
    Ok(home()?.join("Pictures").join("AuraForge"))
}

fn videos_dir() -> Result<PathBuf, String> {
    Ok(home()?.join("Movies").join("AuraForge"))
}

fn ensure_dir(dir: &Path) -> Result<(), String> {
    fs::create_dir_all(dir).map_err(|e| format!("could not create {}: {e}", dir.display()))
}

/// `name.png`, `name-2.png`, `name-3.png` … never silently overwrites a render.
fn unique_path(dir: &Path, stem: &str, ext: &str) -> PathBuf {
    let clean: String = stem
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '-' })
        .collect();
    let clean = if clean.is_empty() { "auraforge".to_string() } else { clean };

    let mut candidate = dir.join(format!("{clean}.{ext}"));
    let mut n = 2;
    while candidate.exists() {
        candidate = dir.join(format!("{clean}-{n}.{ext}"));
        n += 1;
    }
    candidate
}

fn tail_of(path: &Path, max: usize) -> String {
    let text = fs::read_to_string(path).unwrap_or_default();
    let text = text.trim();
    if text.len() <= max {
        text.to_string()
    } else {
        text[text.len() - max..].to_string()
    }
}

/// Reads real dimensions out of the encoded bytes for each container we write.
/// This is an integrity check as much as a convenience: a truncated or corrupt
/// buffer fails to parse here instead of silently landing on disk.
mod sniff {
    pub fn be16(b: &[u8], i: usize) -> u32 {
        ((b[i] as u32) << 8) | b[i + 1] as u32
    }

    fn le16(b: &[u8], i: usize) -> u32 {
        (b[i] as u32) | ((b[i + 1] as u32) << 8)
    }

    fn le24(b: &[u8], i: usize) -> u32 {
        (b[i] as u32) | ((b[i + 1] as u32) << 8) | ((b[i + 2] as u32) << 16)
    }

    pub fn png(b: &[u8]) -> Option<(u32, u32)> {
        const SIG: [u8; 8] = [0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a];
        if b.len() < 24 || b[..8] != SIG || &b[12..16] != b"IHDR" {
            return None;
        }
        let w = u32::from_be_bytes([b[16], b[17], b[18], b[19]]);
        let h = u32::from_be_bytes([b[20], b[21], b[22], b[23]]);
        Some((w, h))
    }

    /// Walks the JPEG segment chain until it hits a start-of-frame, which is
    /// the only place the real dimensions live (the JFIF header may omit them).
    pub fn jpeg(b: &[u8]) -> Option<(u32, u32)> {
        if b.len() < 4 || b[0] != 0xFF || b[1] != 0xD8 {
            return None;
        }
        let mut i = 2usize;
        while i + 9 < b.len() {
            if b[i] != 0xFF {
                i += 1;
                continue;
            }
            let marker = b[i + 1];
            if marker == 0xFF {
                i += 1;
                continue;
            }
            if (0xD0..=0xD9).contains(&marker) || marker == 0x01 {
                i += 2;
                continue;
            }
            let len = be16(b, i + 2) as usize;
            if len < 2 || i + 2 + len > b.len() {
                return None;
            }
            // SOF0..SOF15, but DHT (C4), JPG (C8) and DAC (CC) are not frames
            if (0xC0..=0xCF).contains(&marker) && marker != 0xC4 && marker != 0xC8 && marker != 0xCC
            {
                return Some((be16(b, i + 7), be16(b, i + 5)));
            }
            i += 2 + len;
        }
        None
    }

    pub fn webp(b: &[u8]) -> Option<(u32, u32)> {
        if b.len() < 30 || &b[0..4] != b"RIFF" || &b[8..12] != b"WEBP" {
            return None;
        }
        match &b[12..16] {
            b"VP8X" => Some((le24(b, 24) + 1, le24(b, 27) + 1)),
            b"VP8 " => {
                if b[23] != 0x9D || b[24] != 0x01 || b[25] != 0x2A {
                    return None;
                }
                Some((le16(b, 26) & 0x3FFF, le16(b, 28) & 0x3FFF))
            }
            b"VP8L" => {
                if b[20] != 0x2F {
                    return None;
                }
                let (b0, b1) = (b[21] as u32, b[22] as u32);
                let (b2, b3) = (b[23] as u32, b[24] as u32);
                let w = (b0 | ((b1 & 0x3F) << 8)) + 1;
                let h = ((b1 >> 6) | (b2 << 2) | ((b3 & 0x0F) << 10)) + 1;
                Some((w, h))
            }
            _ => None,
        }
    }
}

/// Detects the container from its magic bytes and returns dimensions plus the
/// canonical extension. The requested format is cross-checked against this, so
/// a mismatched payload is rejected rather than written with a wrong suffix.
fn detect(bytes: &[u8], requested: &str) -> Result<(u32, u32, &'static str), String> {
    let (kind, dims): (&'static str, Option<(u32, u32)>) =
        if bytes.starts_with(&[0x89, b'P', b'N', b'G']) {
            ("png", sniff::png(bytes))
        } else if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
            ("jpeg", sniff::jpeg(bytes))
        } else if bytes.len() > 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
            ("webp", sniff::webp(bytes))
        } else {
            return Err("the payload is not a PNG, JPEG or WebP image".into());
        };

    if kind != requested {
        return Err(format!("requested {requested} but the payload is {kind}"));
    }

    let (w, h) = dims.ok_or_else(|| format!("{kind} payload is truncated or malformed"))?;
    if w == 0 || h == 0 {
        return Err(format!("{kind} payload reports a zero dimension"));
    }
    Ok((w, h, kind))
}

fn ext_for(kind: &str) -> &'static str {
    match kind {
        "jpeg" => "jpg",
        other => match other {
            "webp" => "webp",
            _ => "png",
        },
    }
}

/* ------------------------------ commands ------------------------------ */

#[tauri::command]
pub fn export_root() -> Result<ExportRoots, String> {
    let images = images_dir()?;
    let videos = videos_dir()?;
    ensure_dir(&images)?;
    ensure_dir(&videos)?;
    Ok(ExportRoots {
        images: images.to_string_lossy().to_string(),
        videos: videos.to_string_lossy().to_string(),
    })
}

/// Where ffmpeg actually is.
///
/// A GUI app launched from Finder or the Dock does not inherit the shell's
/// PATH — macOS hands it `/usr/gnu/bin:/usr/local/bin:/bin:/usr/bin:.` — so
/// `Command::new("ffmpeg")` works when the app is started from a terminal and
/// fails with ENOENT (os error 2) when it is launched from /Applications.
/// Check the places Homebrew and MacPorts really install, then fall back to
/// PATH, and let `AURAFORGE_FFMPEG` override everything.
fn ffmpeg_bin() -> std::ffi::OsString {
    if let Some(explicit) = std::env::var_os("AURAFORGE_FFMPEG") {
        return explicit;
    }

    const CANDIDATES: [&str; 5] = [
        "/opt/homebrew/bin/ffmpeg", // Homebrew on Apple silicon
        "/usr/local/bin/ffmpeg",    // Homebrew on Intel
        "/opt/local/bin/ffmpeg",    // MacPorts
        "/usr/bin/ffmpeg",
        "/snap/bin/ffmpeg",
    ];

    for candidate in CANDIDATES {
        if std::path::Path::new(candidate).is_file() {
            return candidate.into();
        }
    }

    "ffmpeg".into()
}

/// Shown when ffmpeg cannot be started at all. The raw os error is an ENOENT
/// that tells the artist nothing, so it says what was searched and what to do.
fn ffmpeg_missing(e: &std::io::Error) -> String {
    format!(
        "ffmpeg could not be started ({e}).\n\n\
         AuraForge looked in /opt/homebrew/bin, /usr/local/bin, /opt/local/bin, \
         /usr/bin and /snap/bin, then on PATH. Install it with \
         `brew install ffmpeg`, or set AURAFORGE_FFMPEG to the full path of the \
         binary and relaunch."
    )
}

#[tauri::command]
pub async fn ffmpeg_version() -> Result<String, String> {
    let out = Command::new(ffmpeg_bin())
        .arg("-version")
        .output()
        .map_err(|e| ffmpeg_missing(&e))?;
    if !out.status.success() {
        return Err("ffmpeg -version reported a failure".into());
    }
    let text = String::from_utf8_lossy(&out.stdout);
    Ok(text.lines().next().unwrap_or("ffmpeg (unknown version)").to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The whole reason `ffmpeg_bin` exists: a GUI app's PATH does not contain
    /// Homebrew, so resolution must not depend on PATH. If ffmpeg is installed
    /// where this machine puts it, the returned path must be that absolute file
    /// rather than a bare name that only a shell could resolve.
    #[test]
    fn ffmpeg_resolves_without_a_shell_path() {
        let installed = ["/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg"]
            .iter()
            .any(|p| std::path::Path::new(p).is_file());

        if !installed {
            eprintln!("skipped: no ffmpeg in the usual Homebrew locations");
            return;
        }

        let resolved = ffmpeg_bin();
        let path = std::path::Path::new(&resolved);

        assert!(
            path.is_absolute(),
            "expected an absolute path, got {resolved:?} — a bare name would \
             fail again from /Applications"
        );
        assert!(path.is_file(), "resolved {resolved:?} is not a file");
    }
}

#[tauri::command]
pub async fn save_image(data: String, name: String, format: String) -> Result<ImageResult, String> {
    use base64::Engine as _;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data.as_bytes())
        .map_err(|e| format!("image payload is not valid base64: {e}"))?;

    let (width, height, kind) = detect(&bytes, format.as_str())?;

    let dir = images_dir()?;
    ensure_dir(&dir)?;
    let path = unique_path(&dir, &name, ext_for(kind));

    fs::write(&path, &bytes).map_err(|e| format!("could not write {}: {e}", path.display()))?;

    Ok(ImageResult {
        path: path.to_string_lossy().to_string(),
        bytes: bytes.len() as u64,
        width,
        height,
        format: kind.to_string(),
    })
}

#[tauri::command]
pub async fn begin_render(
    width: u32,
    height: u32,
    fps: u32,
    quality: String,
    name: String,
    state: tauri::State<'_, ExportState>,
) -> Result<String, String> {
    if width == 0 || height == 0 {
        return Err("render size must be non-zero".into());
    }
    if width % 2 != 0 || height % 2 != 0 {
        return Err("h.264 needs even dimensions".into());
    }
    if !(1..=240).contains(&fps) {
        return Err("fps must be between 1 and 240".into());
    }

    let mut guard = state.0.lock().map_err(|_| "export state poisoned".to_string())?;

    // A webview reload (or a crash) can leave an orphaned ffmpeg behind. A new
    // render always wins: retire the stale session instead of refusing to
    // start, otherwise the app stays wedged until it is restarted.
    if let Some(stale) = guard.take() {
        let RenderSession { mut child, out_path, log_path, .. } = stale;
        let _ = child.kill();
        let _ = child.wait();
        let _ = fs::remove_file(&out_path);
        let _ = fs::remove_file(&log_path);
    }

    let dir = videos_dir()?;
    ensure_dir(&dir)?;
    let out_path = unique_path(&dir, &name, "mp4");
    let log_path = dir.join(format!("{}.ffmpeg.log", out_path.file_stem().unwrap_or_default().to_string_lossy()));

    // quality ladder — "lossless" keeps 4:4:4 chroma, the rest target 4:2:0,
    // which is what social platforms and hardware decoders expect.
    let (crf, preset, pix_fmt) = match quality.as_str() {
        "lossless" => ("0", "medium", "yuv444p"),
        "master" => ("12", "slow", "yuv420p"),
        "stream" => ("23", "fast", "yuv420p"),
        "draft" => ("28", "veryfast", "yuv420p"),
        _ => ("18", "medium", "yuv420p"),
    };

    let log = File::create(&log_path).map_err(|e| format!("could not create log: {e}"))?;

    let child = Command::new(ffmpeg_bin())
        .args([
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-f",
            "rawvideo",
            "-pixel_format",
            "rgba",
            "-video_size",
            &format!("{width}x{height}"),
            "-framerate",
            &fps.to_string(),
            "-i",
            "-",
            "-an",
            "-c:v",
            "libx264",
            "-preset",
            preset,
            "-crf",
            crf,
            "-pix_fmt",
            pix_fmt,
            "-movflags",
            "+faststart",
            &out_path.to_string_lossy(),
        ])
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::from(log))
        .spawn()
        .map_err(|e| ffmpeg_missing(&e))?;

    let mut child = child;
    let stdin = child.stdin.take().ok_or("could not open ffmpeg stdin")?;

    *guard = Some(RenderSession {
        child,
        stdin,
        out_path: out_path.clone(),
        log_path,
        frames: 0,
        started: Instant::now(),
        fps,
    });

    Ok(out_path.to_string_lossy().to_string())
}

/// Receives one raw RGBA frame as the request body and writes it into ffmpeg.
/// Returns the number of frames accepted so far.
#[tauri::command]
pub async fn push_frame(
    request: tauri::ipc::Request<'_>,
    state: tauri::State<'_, ExportState>,
) -> Result<u32, String> {
    let bytes: &[u8] = match request.body() {
        InvokeBody::Raw(data) => data.as_slice(),
        _ => return Err("push_frame expects a raw binary body".into()),
    };

    let mut guard = state.0.lock().map_err(|_| "export state poisoned".to_string())?;
    let session = guard.as_mut().ok_or("no render session is running")?;

    session
        .stdin
        .write_all(bytes)
        .map_err(|e| format!("ffmpeg stopped accepting frames: {e}"))?;
    session
        .stdin
        .flush()
        .map_err(|e| format!("could not flush frame to ffmpeg: {e}"))?;
    session.frames += 1;
    Ok(session.frames)
}

#[tauri::command]
pub async fn end_render(state: tauri::State<'_, ExportState>) -> Result<RenderResult, String> {
    let session = {
        let mut guard = state.0.lock().map_err(|_| "export state poisoned".to_string())?;
        guard.take().ok_or("no render session is running")?
    };

    let RenderSession {
        mut child,
        stdin,
        out_path,
        log_path,
        frames,
        started,
        fps,
    } = session;

    // closing stdin tells ffmpeg the stream is complete
    drop(stdin);

    let status = child
        .wait()
        .map_err(|e| format!("could not wait for ffmpeg: {e}"))?;

    if !status.success() {
        let detail = tail_of(&log_path, 1200);
        let _ = fs::remove_file(&out_path);
        let _ = fs::remove_file(&log_path);
        return Err(format!(
            "ffmpeg exited with {status}{}",
            if detail.is_empty() { String::new() } else { format!("\n{detail}") }
        ));
    }

    let bytes = fs::metadata(&out_path).map(|m| m.len()).unwrap_or(0);
    let _ = fs::remove_file(&log_path);

    Ok(RenderResult {
        path: out_path.to_string_lossy().to_string(),
        frames,
        bytes,
        fps,
        elapsed_ms: started.elapsed().as_millis() as u64,
    })
}

#[tauri::command]
pub async fn cancel_render(state: tauri::State<'_, ExportState>) -> Result<(), String> {
    let session = {
        let mut guard = state.0.lock().map_err(|_| "export state poisoned".to_string())?;
        guard.take()
    };

    if let Some(RenderSession { mut child, out_path, log_path, .. }) = session {
        let _ = child.kill();
        let _ = child.wait();
        let _ = fs::remove_file(&out_path);
        let _ = fs::remove_file(&log_path);
    }
    Ok(())
}

#[tauri::command]
pub async fn reveal(path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg("-R")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("could not reveal {path}: {e}"))?;
        Ok(())
    }

    #[cfg(not(target_os = "macos"))]
    {
        let parent = Path::new(&path)
            .parent()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or(path);
        let opener = if cfg!(target_os = "windows") { "explorer" } else { "xdg-open" };
        Command::new(opener)
            .arg(&parent)
            .spawn()
            .map_err(|e| format!("could not open {parent}: {e}"))?;
        Ok(())
    }
}
