//! `qa`: technical checks on an existing video.
use crate::cli::{load_config, FormatArg};
use crate::commands::report::print_qa;
use anyhow::bail;
use framechester_adapters::ffmpeg::{inspect_output, FfmpegQa};
use framechester_core::domain::QaStatus;
use std::path::{Path, PathBuf};

pub(crate) fn qa_video(
    path: &Option<PathBuf>,
    video: &Path,
    format: Option<FormatArg>,
    json: bool,
) -> anyhow::Result<i32> {
    let config = load_config(path)?;
    if !video.is_file() {
        bail!("video inexistente: {}", video.display());
    }
    let profile = format
        .map(|format| config.render_profile_for(format.into()))
        .unwrap_or_else(|| config.render_profile());
    let output = inspect_output(&config.render.ffprobe_path, video, &profile)?;
    let qa = FfmpegQa::new(&config.render.ffmpeg_path, &config.render.ffprobe_path);
    let report = qa.technical(&output, &profile)?;
    if json {
        println!(
            "{}",
            serde_json::to_string_pretty(&serde_json::json!({
                "video": video,
                "output": output,
                "technical_qa": report,
            }))?
        );
    } else {
        println!(
            "video: {} | {:.1}s | {}x{}",
            video.display(),
            output.duration_secs,
            output.width,
            output.height
        );
        print_qa(&report);
    }
    Ok(match report.overall() {
        QaStatus::Fail => 2,
        QaStatus::NeedsHuman => 1,
        _ => 0,
    })
}
