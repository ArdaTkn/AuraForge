//! AuraForge native shell.
//!
//! The webview renders; Rust owns file I/O and the ffmpeg encode. Export
//! commands live in [`export`].

mod export;

use export::ExportState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(ExportState::default())
        .invoke_handler(tauri::generate_handler![
            health,
            report_stats,
            dev_log,
            export::export_root,
            export::ffmpeg_version,
            export::save_image,
            export::begin_render,
            export::push_frame,
            export::end_render,
            export::cancel_render,
            export::reveal,
        ])
        .run(tauri::generate_context!())
        .expect("error while running AuraForge");
}

/// Lightweight liveness probe — also proves the IPC bridge is wired up.
#[tauri::command]
fn health() -> serde_json::Value {
    serde_json::json!({
        "app": "AuraForge",
        "version": env!("CARGO_PKG_VERSION"),
        "renderer": "webgl2",
        "export": "png+ffmpeg"
    })
}

/// Dev-only render telemetry. The webview cannot write to the terminal, so the
/// frontend forwards its frame stats here and a debug build prints them; that
/// makes the real WebGL2 throughput observable from the shell that launched
/// the app. Release builds drop the payload on the floor.
#[tauri::command]
fn report_stats(fps: f64, frame_ms: f64, width: u32, height: u32, steps: f64) {
    #[cfg(debug_assertions)]
    println!(
        "[auraforge] fps={fps:.1} frame_ms={frame_ms:.2} buffer={width}x{height} steps={steps:.0}"
    );

    #[cfg(not(debug_assertions))]
    {
        let _ = (fps, frame_ms, width, height, steps);
    }
}

/// Same channel as [`report_stats`], for the in-app self test's free-form
/// lines. Debug builds only.
#[tauri::command]
fn dev_log(message: String) {
    #[cfg(debug_assertions)]
    println!("[auraforge] {message}");

    #[cfg(not(debug_assertions))]
    {
        let _ = message;
    }
}
