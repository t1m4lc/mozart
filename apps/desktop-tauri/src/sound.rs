//! End-of-turn chime, played through the platform's own audio stack.
//!
//! The old in-webview HTML `<audio>` chime decoded through WebKitGTK →
//! GStreamer and silently failed on Linux desktops missing the base/good
//! plugins. We instead write the bundled WAV to a temp file once and hand
//! it to the OS player, so the cue is reliable on Linux/macOS/Windows with
//! no extra runtime decoder. Repointing this at a user-chosen file later is
//! a one-line change.

use crate::error::AppError;
use std::path::{Path, PathBuf};
use std::process::Command;

const CHIME_WAV: &[u8] =
    include_bytes!("../../../libs/mozart-assets/src/desktop/sounds/message-done.wav");

/// Play the chime without blocking the caller. Playback runs on a detached
/// thread so the Tauri command returns immediately; that thread waits on
/// the player process, which reaps it (no zombies).
pub fn play() -> Result<(), AppError> {
    let path = ensure_chime_on_disk()?;
    std::thread::spawn(move || play_file(&path));
    Ok(())
}

/// Materialize the embedded WAV in the OS temp dir once. Stable name so
/// repeated turns reuse the same file; re-written only if missing or the
/// size drifts (e.g. the bundled asset changed across an update).
fn ensure_chime_on_disk() -> Result<PathBuf, AppError> {
    let path = crate::paths::chime_path()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| AppError::Io(format!("create cache dir: {e}")))?;
    }
    let stale = match std::fs::metadata(&path) {
        Ok(m) => m.len() != CHIME_WAV.len() as u64,
        Err(_) => true,
    };
    if stale {
        std::fs::write(&path, CHIME_WAV)
            .map_err(|e| AppError::Io(format!("write chime: {e}")))?;
    }
    Ok(path)
}

/// Spawn the first platform player that plays the file successfully. A
/// missing player or a silent desktop is not worth surfacing mid-turn, so
/// failures are only logged.
fn play_file(path: &Path) {
    let file = path.to_string_lossy().to_string();

    #[cfg(target_os = "macos")]
    let attempts: Vec<(&str, Vec<String>)> = vec![("afplay", vec![file.clone()])];

    #[cfg(target_os = "windows")]
    let attempts: Vec<(&str, Vec<String>)> = vec![(
        "powershell",
        vec![
            "-NoProfile".into(),
            "-Command".into(),
            format!("(New-Object Media.SoundPlayer '{file}').PlaySync();"),
        ],
    )];

    #[cfg(all(unix, not(target_os = "macos")))]
    let attempts: Vec<(&str, Vec<String>)> = vec![
        ("pw-play", vec![file.clone()]),
        ("paplay", vec![file.clone()]),
        ("canberra-gtk-play", vec!["-f".into(), file.clone()]),
        ("aplay", vec!["-q".into(), file.clone()]),
    ];

    for (bin, args) in &attempts {
        if let Ok(status) = Command::new(bin).args(args).status() {
            if status.success() {
                return;
            }
        }
    }
    eprintln!("[chime] no usable audio player found for {file}");
}
