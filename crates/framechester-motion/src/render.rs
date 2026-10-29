//! Orchestrates a motion render: compose → frames → silent video → soundtrack mix →
//! mux → captions → contact sheet → manifest. Every step is timed and logged.
use crate::audio::{self, LoudnessTarget, MixPlan, Pcm};
use crate::captions;
use crate::compose::{self, Composed};
use crate::log::{Logger, Timing};
use crate::raster::{encode_frames, EncodeProfile, Rasterizer};
use crate::text::{bundled_fonts, Typesetter};
use framechester_core::error::{FramechesterError, Result};
use framechester_core::storyboard::Storyboard;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Debug, Clone)]
pub struct RenderRequest {
    /// Narration of the whole video, one WAV with the scenes already concatenated and
    /// aligned to the storyboard timing.
    pub voice: PathBuf,
    pub music: Option<PathBuf>,
    pub music_gain_db: f32,
    /// Procedural transition sounds at scene changes.
    pub sfx: bool,
    pub sfx_gain: f32,
    pub target: LoudnessTarget,
    pub encode: EncodeProfile,
    pub ffprobe: String,
    pub audio_bitrate_kbps: u32,
    pub output_dir: PathBuf,
    pub log: Option<PathBuf>,
}

#[derive(Debug, Clone, Serialize)]
pub struct RenderManifest {
    pub engine: String,
    pub engine_version: String,
    pub ffmpeg_version: String,
    pub format: String,
    pub width: u32,
    pub height: u32,
    pub fps: u32,
    pub frames: usize,
    pub duration_secs: f32,
    pub storyboard_sha256: String,
    pub fonts: Vec<(String, String)>,
    pub loudness_target: LoudnessTarget,
    pub loudness_measured: audio::LoudnessMeasurement,
    pub loudness_applied: audio::LoudnessMeasurement,
    pub music: Option<String>,
    pub sfx: bool,
    pub timings: Vec<Timing>,
    pub peak_memory_mb: Option<f32>,
    pub video_sha256: String,
}

#[derive(Debug, Clone)]
pub struct RenderArtifacts {
    pub video: PathBuf,
    pub silent_video: PathBuf,
    pub mix: PathBuf,
    pub srt: PathBuf,
    pub contact_sheet: PathBuf,
    pub manifest_path: PathBuf,
    pub manifest: RenderManifest,
    pub composed: Composed,
}

fn sha256_file(path: &Path) -> Result<String> {
    let bytes = std::fs::read(path)?;
    Ok(Sha256::digest(&bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect())
}

fn ffmpeg_version(ffmpeg: &str) -> String {
    Command::new(ffmpeg)
        .arg("-version")
        .output()
        .ok()
        .and_then(|output| String::from_utf8(output.stdout).ok())
        .and_then(|text| text.lines().next().map(str::to_string))
        .unwrap_or_else(|| "desconhecida".into())
}

fn require(output: std::process::Output, label: &str) -> Result<()> {
    if output.status.success() {
        Ok(())
    } else {
        Err(FramechesterError::External(format!(
            "{label}: {}",
            String::from_utf8_lossy(&output.stderr)
                .chars()
                .take(400)
                .collect::<String>()
        )))
    }
}

/// Contact sheet: one frame per scene at 40% of its duration, tiled with a time label.
fn contact_sheet(
    request: &RenderRequest,
    storyboard: &Storyboard,
    video: &Path,
    output: &Path,
) -> Result<()> {
    let columns = if storyboard.format == framechester_core::storyboard::VideoFormat::Vertical {
        4
    } else {
        3
    };
    let times: Vec<f32> = storyboard
        .scenes
        .iter()
        .map(|scene| scene.start_secs + scene.duration_secs * 0.4)
        .collect();
    let frames_dir = output.with_extension("frames");
    std::fs::create_dir_all(&frames_dir)?;
    for (index, time) in times.iter().enumerate() {
        let frame = frames_dir.join(format!("frame_{index:02}.png"));
        require(
            Command::new(&request.encode.ffmpeg)
                .args([
                    "-hide_banner",
                    "-loglevel",
                    "error",
                    "-y",
                    "-ss",
                    &format!("{time:.3}"),
                    "-i",
                ])
                .arg(video)
                .args(["-frames:v", "1", "-vf", "scale=480:-2"])
                .arg(&frame)
                .output()?,
            "frame do contact sheet",
        )?;
    }
    let rows = times.len().div_ceil(columns).max(1);
    require(
        Command::new(&request.encode.ffmpeg)
            .args([
                "-hide_banner",
                "-loglevel",
                "error",
                "-y",
                "-framerate",
                "1",
                "-i",
            ])
            .arg(frames_dir.join("frame_%02d.png"))
            .args([
                "-frames:v",
                "1",
                "-vf",
                &format!("tile={columns}x{rows}:padding=12:margin=12:color=0x0B0F17"),
            ])
            .arg(output)
            .output()?,
        "tile do contact sheet",
    )?;
    Ok(())
}

/// Renders the storyboard. `storyboard` must carry real timing (segments and durations).
pub fn render(storyboard: &Storyboard, request: &RenderRequest) -> Result<RenderArtifacts> {
    storyboard.validate()?;
    if storyboard
        .scenes
        .iter()
        .any(|scene| scene.duration_secs <= 0.0 || scene.segments.is_empty())
    {
        return Err(FramechesterError::InvalidInput(
            "storyboard sem timing: narre as cenas antes de renderizar".into(),
        ));
    }
    if !request.voice.is_file() {
        return Err(FramechesterError::InvalidInput(format!(
            "narracao ausente: {}",
            request.voice.display()
        )));
    }
    std::fs::create_dir_all(&request.output_dir)?;
    let mut logger = Logger::new(request.log.as_deref());
    let typesetter = Typesetter::new()?;
    let composed = logger.time("compose", || compose::compose(storyboard, &typesetter))?;
    let canvas = composed.canvas;
    let fps = request.encode.fps.max(1);
    let duration = storyboard.total_duration_secs();
    let frames = (duration * fps as f32).ceil() as usize;
    let silent_video = request.output_dir.join("video_silent.mp4");
    let rasterizer = Rasterizer::new(&typesetter, canvas.width, canvas.height);
    let written = logger.time("frames", || {
        encode_frames(
            &rasterizer,
            &request.encode,
            frames,
            &silent_video,
            &|index| {
                compose::frame_svg(
                    &composed,
                    index as f32 / fps as f32,
                    crate::tokens::FONT_SANS,
                )
            },
        )
    })?;
    logger.event(
        "frames",
        "info",
        serde_json::json!({ "frames": written, "fps": fps }),
    );

    // Soundtrack: narration plus optional transition sounds, then music and loudness.
    let voice_path = request.output_dir.join("voice_with_sfx.wav");
    logger.time("soundtrack", || -> Result<()> {
        let mut voice = Pcm::read(&request.voice)?;
        let total = (duration * voice.sample_rate as f32).round() as usize;
        if voice.samples.len() < total {
            voice.samples.resize(total, 0);
        }
        if request.sfx {
            let sfx = audio::transition_sfx(voice.sample_rate, 0.35, request.sfx_gain);
            for scene in storyboard.scenes.iter().skip(1) {
                voice.mix_at(&sfx, (scene.start_secs - 0.12).max(0.0), 1.0);
            }
        }
        voice.write(&voice_path)
    })?;
    let mix_path = request.output_dir.join("mix.wav");
    let (measured, applied) = logger.time("loudness", || {
        audio::mix(
            &MixPlan {
                voice: voice_path.clone(),
                music: request.music.clone(),
                music_gain_db: request.music_gain_db,
                target: request.target,
                ffmpeg: request.encode.ffmpeg.clone(),
            },
            &mix_path,
        )
    })?;
    let video = request.output_dir.join("final.mp4");
    logger.time("mux", || {
        require(
            Command::new(&request.encode.ffmpeg)
                .args(["-hide_banner", "-loglevel", "error", "-y", "-i"])
                .arg(&silent_video)
                .arg("-i")
                .arg(&mix_path)
                .args([
                    "-map",
                    "0:v:0",
                    "-map",
                    "1:a:0",
                    "-c:v",
                    "copy",
                    "-c:a",
                    "aac",
                    "-b:a",
                    &format!("{}k", request.audio_bitrate_kbps),
                    "-ar",
                    "48000",
                    "-ac",
                    "2",
                    "-shortest",
                    "-movflags",
                    "+faststart",
                ])
                .arg(&video)
                .output()?,
            "mux final",
        )
    })?;
    let srt = request.output_dir.join("captions.srt");
    std::fs::write(
        &srt,
        captions::build_srt(&storyboard.scenes, canvas.vertical),
    )?;
    let sheet = request.output_dir.join("contact_sheet.png");
    logger.time("contact_sheet", || {
        contact_sheet(request, storyboard, &video, &sheet)
    })?;
    let storyboard_json = serde_json::to_vec(storyboard)?;
    let manifest = RenderManifest {
        engine: "framechester-motion".into(),
        engine_version: env!("CARGO_PKG_VERSION").into(),
        ffmpeg_version: ffmpeg_version(&request.encode.ffmpeg),
        format: storyboard.format.slug().into(),
        width: canvas.width,
        height: canvas.height,
        fps,
        frames: written,
        duration_secs: duration,
        storyboard_sha256: Sha256::digest(&storyboard_json)
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect(),
        fonts: bundled_fonts()
            .into_iter()
            .map(|(name, hash)| (name.to_string(), hash))
            .collect(),
        loudness_target: request.target,
        loudness_measured: measured,
        loudness_applied: applied,
        music: request
            .music
            .as_ref()
            .map(|path| path.display().to_string()),
        sfx: request.sfx,
        timings: logger.timings.clone(),
        peak_memory_mb: crate::log::peak_memory_mb(),
        video_sha256: sha256_file(&video)?,
    };
    let manifest_path = request.output_dir.join("render_manifest.json");
    std::fs::write(&manifest_path, serde_json::to_string_pretty(&manifest)?)?;
    logger.event(
        "render",
        "done",
        serde_json::json!({ "seconds": logger.total_seconds(), "video": video }),
    );
    Ok(RenderArtifacts {
        video,
        silent_video,
        mix: mix_path,
        srt,
        contact_sheet: sheet,
        manifest_path,
        manifest,
        composed,
    })
}
