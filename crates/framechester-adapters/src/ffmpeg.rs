use crate::local_assets::{local_media_demuxer, validate_local_asset};
use framechester_core::domain::{
    AssetManifest, QaCheck, QaReport, QaStatus, RenderOutput, RenderProfile, Script, Timeline,
};
use framechester_core::error::{FramechesterError, Result};
use framechester_core::ports::{AdapterInfo, QaGate, Renderer};
use framechester_core::qa;
use sha2::{Digest, Sha256};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::Command;

fn wrap_title(title: &str, width: usize, max_lines: usize) -> String {
    let mut lines = Vec::new();
    let mut current = String::new();
    for word in title.split_whitespace() {
        let projected = if current.is_empty() {
            word.chars().count()
        } else {
            current.chars().count() + 1 + word.chars().count()
        };
        if !current.is_empty() && projected > width {
            lines.push(std::mem::take(&mut current));
            if lines.len() == max_lines {
                break;
            }
        }
        if !current.is_empty() {
            current.push(' ');
        }
        current.push_str(word);
    }
    if !current.is_empty() && lines.len() < max_lines {
        lines.push(current);
    }
    lines.join("\n")
}

fn truncate(text: &str, limit: usize) -> String {
    text.chars().take(limit).collect()
}

fn run(program: &str, args: &[String], current_dir: Option<&Path>) -> Result<std::process::Output> {
    let mut command = Command::new(program);
    command.args(args);
    if let Some(directory) = current_dir {
        command.current_dir(directory);
    }
    command.output().map_err(|error| {
        FramechesterError::Unavailable(format!("falha ao executar {program}: {error}"))
    })
}

fn require_success(output: std::process::Output, label: &str) -> Result<std::process::Output> {
    if output.status.success() {
        Ok(output)
    } else {
        Err(FramechesterError::External(format!(
            "{label}: {}",
            truncate(&String::from_utf8_lossy(&output.stderr), 500)
        )))
    }
}

fn filter_escape(path: &Path) -> String {
    path.to_string_lossy()
        .replace('\\', "/")
        .replace(':', "\\:")
}

fn find_font() -> Option<PathBuf> {
    let mut candidates = Vec::new();
    if let Ok(value) = std::env::var("FRAMECHESTER_FONT") {
        if !value.trim().is_empty() {
            candidates.push(PathBuf::from(value));
        }
    }
    for path in [
        "C:/Windows/Fonts/arialbd.ttf",
        "C:/Windows/Fonts/arial.ttf",
        "C:/Windows/Fonts/segoeuib.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ] {
        candidates.push(PathBuf::from(path));
    }
    candidates.into_iter().find(|path| path.is_file())
}

#[derive(Debug, Clone)]
pub struct FfmpegRenderer {
    ffmpeg: String,
    ffprobe: String,
}

impl FfmpegRenderer {
    pub fn new(ffmpeg: &str, ffprobe: &str) -> Self {
        Self {
            ffmpeg: ffmpeg.to_string(),
            ffprobe: ffprobe.to_string(),
        }
    }

    pub fn thumbnail(
        &self,
        title: &str,
        output: &Path,
        profile: &RenderProfile,
    ) -> Result<Option<PathBuf>> {
        let Some(font) = find_font() else {
            return Ok(None);
        };
        let output_abs = if output.is_absolute() {
            output.to_path_buf()
        } else {
            std::env::current_dir()?.join(output)
        };
        let parent = output_abs
            .parent()
            .ok_or_else(|| FramechesterError::InvalidInput("thumbnail sem diretorio".into()))?;
        std::fs::create_dir_all(parent)?;
        let stem = output_abs
            .file_stem()
            .map(|value| value.to_string_lossy().to_string())
            .unwrap_or_else(|| "thumbnail".into());
        let text_name = format!("{stem}.txt");
        let text_path = parent.join(&text_name);
        let wrapped = wrap_title(title, 28, 3);
        std::fs::write(&text_path, &wrapped)?;
        let width = 1280u32;
        let height = 720u32;
        let font_size = 64u32;
        let filter = format!(
            "drawbox=x=0:y=0:w={width}:h=14:color=0x38BDF8:t=fill,\
             drawtext=fontfile='{}':textfile='{text_name}':fontcolor=white:fontsize={font_size}:\
             line_spacing=18:x=(w-text_w)/2:y=(h-text_h)/2:box=1:boxcolor=0x1E3A5F@0.88:\
             boxborderw=36",
            filter_escape(&font)
        );
        let args = vec![
            "-hide_banner".to_string(),
            "-loglevel".to_string(),
            "error".to_string(),
            "-y".to_string(),
            "-f".to_string(),
            "lavfi".to_string(),
            "-i".to_string(),
            format!("color=c=0x0B1220:s={width}x{height}:r=1"),
            "-frames:v".to_string(),
            "1".to_string(),
            "-vf".to_string(),
            filter,
            "-update".to_string(),
            "1".to_string(),
            output_abs.to_string_lossy().to_string(),
        ];
        let result = run(&self.ffmpeg, &args, Some(parent));
        let _ = std::fs::remove_file(&text_path);
        require_success(result?, "thumbnail")?;
        if !output_abs.is_file() {
            return Err(FramechesterError::External(
                "thumbnail nao foi criada".into(),
            ));
        }
        let _ = profile;
        Ok(Some(output_abs))
    }

    pub fn render(
        &self,
        timeline: &Timeline,
        assets: &[AssetManifest],
        profile: &RenderProfile,
        output: &Path,
    ) -> Result<RenderOutput> {
        if timeline.scenes.is_empty() {
            return Err(FramechesterError::InvalidInput(
                "timeline sem cenas para renderizar".into(),
            ));
        }
        if assets.len() != timeline.scenes.len() {
            return Err(FramechesterError::InvalidInput(
                "cada cena da timeline exige um asset correspondente".into(),
            ));
        }
        let mut scene_assets = Vec::with_capacity(timeline.scenes.len());
        let mut scene_ids = std::collections::HashSet::new();
        for scene in &timeline.scenes {
            if !scene_ids.insert(scene.scene_id)
                || !scene.duration_secs.is_finite()
                || scene.duration_secs <= 0.0
            {
                return Err(FramechesterError::InvalidInput(
                    "timeline exige IDs unicos e duracoes positivas finitas".into(),
                ));
            }
            let mut matches = assets
                .iter()
                .filter(|asset| asset.scene_id == scene.scene_id);
            let asset = matches.next().ok_or_else(|| {
                FramechesterError::InvalidInput(format!(
                    "asset ausente para cena {}",
                    scene.scene_id
                ))
            })?;
            if matches.next().is_some() {
                return Err(FramechesterError::InvalidInput(format!(
                    "asset duplicado para cena {}",
                    scene.scene_id
                )));
            }
            match asset.kind.as_str() {
                "image" | "video" => validate_local_asset(asset)?,
                "testsrc2" | "color" if asset.path.is_none() => {}
                _ => {
                    return Err(FramechesterError::InvalidInput(format!(
                        "tipo de asset nao suportado para cena {}",
                        scene.scene_id
                    )))
                }
            }
            scene_assets.push(asset);
        }
        let output_abs = if output.is_absolute() {
            output.to_path_buf()
        } else {
            std::env::current_dir()?.join(output)
        };
        if let Some(parent) = output_abs.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let scene_dir = output_abs
            .parent()
            .unwrap_or_else(|| Path::new("."))
            .join("scenes");
        std::fs::create_dir_all(&scene_dir)?;
        let scene_dir = scene_dir.canonicalize()?;
        for asset in &scene_assets {
            if let Some(path) = &asset.path {
                let path = path.canonicalize()?;
                if path.starts_with(&scene_dir)
                    || output_abs.canonicalize().is_ok_and(|output| output == path)
                {
                    return Err(FramechesterError::InvalidInput(
                        "asset de entrada conflita com arquivos de saida do render".into(),
                    ));
                }
            }
        }
        let font = find_font();
        let mut scene_files = Vec::new();
        for (index, (scene, asset)) in timeline.scenes.iter().zip(scene_assets).enumerate() {
            let stem = format!("scene_{index:03}");
            let text_path = scene_dir.join(format!("{stem}.txt"));
            let video_path = scene_dir.join(format!("{stem}.mp4"));
            std::fs::write(&text_path, &scene.heading)?;
            let duration = scene.duration_secs.max(0.5);
            let audio_path = if scene.audio_path.is_absolute() {
                scene.audio_path.clone()
            } else {
                std::env::current_dir()?.join(&scene.audio_path)
            };
            if !audio_path.is_file() {
                return Err(FramechesterError::InvalidInput(format!(
                    "audio ausente para cena {}: {}",
                    scene.scene_id,
                    audio_path.display()
                )));
            }
            let normalization = format!(
                "scale={}:{}:force_original_aspect_ratio=decrease:force_divisible_by=2,pad={}:{}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps={},format=yuv420p",
                profile.width, profile.height, profile.width, profile.height, profile.fps
            );
            let title_filter = font.as_ref().filter(|_| asset.path.is_none() && !scene.heading.trim().is_empty()).map(|font| {
                format!(
                    "drawtext=fontfile='{}':textfile='{stem}.txt':fontcolor=white:fontsize={}:x=(w-text_w)/2:y=(h-text_h)/2:box=1:boxcolor=0x000000AA:boxborderw=24",
                    filter_escape(font),
                    (profile.width / 26).max(24)
                )
            });
            let mut base = vec![
                "-hide_banner".to_string(),
                "-loglevel".to_string(),
                "error".to_string(),
                "-y".to_string(),
            ];
            if let Some(path) = &asset.path {
                base.extend(["-protocol_whitelist".into(), "file,pipe".into()]);
                if asset.kind == "image" {
                    base.extend([
                        "-loop".into(),
                        "1".into(),
                        "-framerate".into(),
                        profile.fps.to_string(),
                    ]);
                } else {
                    base.extend(["-stream_loop".into(), "-1".into()]);
                }
                base.extend([
                    "-f".into(),
                    local_media_demuxer(asset)?.into(),
                    "-i".into(),
                    path.to_string_lossy().to_string(),
                ]);
            } else {
                let background = if asset.kind == "color" {
                    format!(
                        "color=c=0x101820:size={}x{}:rate={}",
                        profile.width, profile.height, profile.fps
                    )
                } else {
                    format!(
                        "testsrc2=size={}x{}:rate={}",
                        profile.width, profile.height, profile.fps
                    )
                };
                base.extend(["-f".into(), "lavfi".into(), "-i".into(), background]);
            }
            base.extend([
                "-i".to_string(),
                audio_path.to_string_lossy().to_string(),
                "-map".into(),
                "0:v:0".into(),
                "-map".into(),
                "1:a:0".into(),
                "-t".to_string(),
                format!("{duration:.3}"),
                "-c:v".to_string(),
                profile.video_codec.clone(),
                "-preset".to_string(),
                profile.preset.clone(),
                "-crf".to_string(),
                profile.crf.to_string(),
                "-pix_fmt".to_string(),
                "yuv420p".to_string(),
                "-c:a".to_string(),
                "aac".to_string(),
                "-b:a".to_string(),
                format!("{}k", profile.audio_bitrate_kbps),
                "-ar".to_string(),
                "48000".to_string(),
                "-ac".to_string(),
                "2".to_string(),
                "-shortest".to_string(),
                format!("{stem}.mp4"),
            ]);
            let filter_index = base.len() - 1;
            let filter = title_filter
                .as_ref()
                .map(|title| format!("{normalization},{title}"))
                .unwrap_or_else(|| normalization.clone());
            base.insert(filter_index, "-vf".into());
            base.insert(filter_index + 1, filter);
            let mut output_result = run(&self.ffmpeg, &base, Some(&scene_dir));
            if output_result
                .as_ref()
                .map(|result| !result.status.success())
                .unwrap_or(true)
                && title_filter.is_some()
            {
                base[filter_index + 1] = normalization;
                output_result = run(&self.ffmpeg, &base, Some(&scene_dir));
            }
            require_success(output_result?, &format!("render cena {index}"))?;
            if !video_path.is_file() {
                return Err(FramechesterError::External(format!(
                    "cena {index} nao gerou arquivo"
                )));
            }
            scene_files.push(format!("{stem}.mp4"));
        }
        let concat_path = scene_dir.join("concat.txt");
        let list: String = scene_files
            .iter()
            .map(|name| format!("file '{name}'\n"))
            .collect();
        std::fs::write(&concat_path, list)?;
        if timeline.captions.is_none() {
            let copy_args = vec![
                "-hide_banner".to_string(),
                "-loglevel".to_string(),
                "error".to_string(),
                "-y".to_string(),
                "-f".to_string(),
                "concat".to_string(),
                "-safe".to_string(),
                "0".to_string(),
                "-i".to_string(),
                "concat.txt".to_string(),
                "-c".to_string(),
                "copy".to_string(),
                "-movflags".to_string(),
                "+faststart".to_string(),
                output_abs.to_string_lossy().to_string(),
            ];
            let copy_output = run(&self.ffmpeg, &copy_args, Some(&scene_dir));
            if copy_output
                .as_ref()
                .map(|result| result.status.success())
                .unwrap_or(false)
            {
                return self.describe(&output_abs, profile);
            }
        }
        let mut encode_args = vec![
            "-hide_banner".to_string(),
            "-loglevel".to_string(),
            "error".to_string(),
            "-y".to_string(),
            "-f".to_string(),
            "concat".to_string(),
            "-safe".to_string(),
            "0".to_string(),
            "-i".to_string(),
            "concat.txt".to_string(),
            "-c:v".to_string(),
            profile.video_codec.clone(),
            "-preset".to_string(),
            profile.preset.clone(),
            "-crf".to_string(),
            profile.crf.to_string(),
            "-pix_fmt".to_string(),
            "yuv420p".to_string(),
            "-c:a".to_string(),
            "aac".to_string(),
            "-b:a".to_string(),
            format!("{}k", profile.audio_bitrate_kbps),
            "-movflags".to_string(),
            "+faststart".to_string(),
            output_abs.to_string_lossy().to_string(),
        ];
        if let Some(captions) = &timeline.captions {
            let captions_abs = if captions.is_absolute() {
                captions.clone()
            } else {
                std::env::current_dir()?.join(captions)
            };
            if !captions_abs.is_file() {
                return Err(FramechesterError::InvalidInput(format!(
                    "legendas ausentes: {}",
                    captions_abs.display()
                )));
            }
            std::fs::copy(&captions_abs, scene_dir.join("captions.srt"))?;
            let filter = subtitle_filter(Path::new("captions.srt"), profile);
            encode_args.insert(10, "-vf".to_string());
            encode_args.insert(11, filter);
        }
        require_success(
            run(&self.ffmpeg, &encode_args, Some(&scene_dir))?,
            "concat final",
        )?;
        self.describe(&output_abs, profile)
    }

    fn describe(&self, output: &Path, profile: &RenderProfile) -> Result<RenderOutput> {
        inspect_output(&self.ffprobe, output, profile)
    }
}

fn subtitle_filter(captions: &Path, profile: &RenderProfile) -> String {
    let path = captions.to_string_lossy().replace('\\', "/");
    let font_size = if profile.height > profile.width {
        profile.width / 20
    } else {
        profile.height / 32
    }
    .clamp(14, 64);
    let margin_v = (profile.height * 3 / 40).max(16);
    let margin_h = (profile.width / 18).max(8);
    let style = format!(
        "PlayResX={},PlayResY={},FontName=Segoe UI,FontSize={font_size},PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=1,Shadow=0,Alignment=2,MarginL={margin_h},MarginR={margin_h},MarginV={margin_v}",
        profile.width, profile.height
    );
    format!("subtitles=filename='{path}':force_style='{style}'")
}

pub fn inspect_output(
    ffprobe: &str,
    output: &Path,
    profile: &RenderProfile,
) -> Result<RenderOutput> {
    let bytes = std::fs::metadata(output)?.len();
    if bytes == 0 {
        return Err(FramechesterError::External("video final vazio".into()));
    }
    let sha256 = sha256_file(output)?;
    let probe = probe_json(ffprobe, output)?;
    let duration = probe_duration(&probe).unwrap_or(0.0);
    let (width, height, fps) =
        probe_video(&probe).unwrap_or((profile.width, profile.height, profile.fps as f64));
    let video_codec = probe_codec(&probe).unwrap_or_else(|| profile.video_codec.clone());
    Ok(RenderOutput {
        path: output.to_path_buf(),
        duration_secs: duration,
        bytes,
        sha256,
        video_codec,
        width,
        height,
        fps: fps.round() as u32,
    })
}

impl Renderer for FfmpegRenderer {
    fn info(&self) -> AdapterInfo {
        AdapterInfo {
            name: "ffmpeg-renderer".into(),
            license: "FFmpeg build local (GPL/LGPL conforme build)".into(),
            network: false,
            unit_cost: "R$ 0,00 incremental".into(),
            secrets: Vec::new(),
            failure_modes: vec![
                "codec ausente".into(),
                "audio invalido".into(),
                "fonte ausente".into(),
                "disco cheio".into(),
            ],
        }
    }

    fn render(
        &self,
        timeline: &Timeline,
        assets: &[AssetManifest],
        profile: &RenderProfile,
        output: &Path,
    ) -> Result<RenderOutput> {
        Self::render(self, timeline, assets, profile, output)
    }

    fn thumbnail(
        &self,
        title: &str,
        output: &Path,
        profile: &RenderProfile,
    ) -> Result<Option<PathBuf>> {
        Self::thumbnail(self, title, output, profile)
    }
}

fn sha256_file(path: &Path) -> Result<String> {
    let mut file = std::fs::File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0u8; 1024 * 1024];
    loop {
        let read = file.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    let digest = hasher.finalize();
    Ok(digest.iter().map(|byte| format!("{byte:02x}")).collect())
}

pub fn probe_json(ffprobe: &str, path: &Path) -> Result<serde_json::Value> {
    let args = vec![
        "-v".to_string(),
        "error".to_string(),
        "-print_format".to_string(),
        "json".to_string(),
        "-show_format".to_string(),
        "-show_streams".to_string(),
        path.to_string_lossy().to_string(),
    ];
    let output = require_success(run(ffprobe, &args, None)?, "ffprobe")?;
    serde_json::from_slice(&output.stdout)
        .map_err(|error| FramechesterError::External(format!("ffprobe json invalido: {error}")))
}

pub fn probe_duration(probe: &serde_json::Value) -> Option<f32> {
    probe
        .get("format")
        .and_then(|format| format.get("duration"))
        .and_then(|value| value.as_str())
        .and_then(|value| value.parse::<f32>().ok())
}

pub fn probe_video(probe: &serde_json::Value) -> Option<(u32, u32, f64)> {
    let streams = probe.get("streams")?.as_array()?;
    let stream = streams.iter().find(|stream| {
        stream.get("codec_type").and_then(|value| value.as_str()) == Some("video")
    })?;
    let width = stream.get("width")?.as_u64()? as u32;
    let height = stream.get("height")?.as_u64()? as u32;
    let fps = stream
        .get("avg_frame_rate")
        .and_then(|value| value.as_str())
        .and_then(parse_rational)
        .unwrap_or(0.0);
    Some((width, height, fps))
}

pub fn probe_codec(probe: &serde_json::Value) -> Option<String> {
    probe_stream_codec(probe, "video").map(str::to_string)
}

fn probe_stream_codec<'a>(probe: &'a serde_json::Value, kind: &str) -> Option<&'a str> {
    let streams = probe.get("streams")?.as_array()?;
    streams
        .iter()
        .find(|stream| stream.get("codec_type").and_then(|value| value.as_str()) == Some(kind))
        .and_then(|stream| stream.get("codec_name"))
        .and_then(|value| value.as_str())
}

fn expected_video_codec(encoder: &str) -> &str {
    match encoder {
        "libx264" | "libx264rgb" => "h264",
        "libx265" => "hevc",
        "libvpx" => "vp8",
        "libvpx-vp9" => "vp9",
        "libaom-av1" | "librav1e" | "libsvtav1" => "av1",
        name if name.starts_with("h264_") => "h264",
        name if name.starts_with("hevc_") => "hevc",
        name if name.starts_with("av1_") => "av1",
        name => name,
    }
}

pub fn has_audio(probe: &serde_json::Value) -> bool {
    probe
        .get("streams")
        .and_then(|value| value.as_array())
        .map(|streams| {
            streams.iter().any(|stream| {
                stream.get("codec_type").and_then(|value| value.as_str()) == Some("audio")
            })
        })
        .unwrap_or(false)
}

pub fn parse_rational(value: &str) -> Option<f64> {
    let (numerator, denominator) = value.split_once('/')?;
    let numerator: f64 = numerator.parse().ok()?;
    let denominator: f64 = denominator.parse().ok()?;
    if denominator == 0.0 {
        None
    } else {
        Some(numerator / denominator)
    }
}

pub fn parse_volume_db(text: &str) -> Option<f32> {
    for line in text.lines() {
        if let Some(position) = line.find("max_volume:") {
            let value = line[position + "max_volume:".len()..].trim();
            let number = value.strip_suffix("dB").unwrap_or(value).trim();
            if number.starts_with("-inf") {
                return Some(f32::NEG_INFINITY);
            }
            if let Ok(parsed) = number.parse::<f32>() {
                return Some(parsed);
            }
        }
    }
    None
}

pub fn detect_black(text: &str) -> bool {
    text.lines().any(|line| line.contains("black_start:"))
}

pub fn detect_freeze(text: &str) -> bool {
    text.lines().any(|line| line.contains("freeze_start:"))
}

#[derive(Debug, Clone)]
pub struct AsrOptions {
    pub model: PathBuf,
    pub language: String,
    pub min_coverage: f32,
}

#[derive(Debug, Clone)]
pub struct FfmpegQa {
    ffmpeg: String,
    ffprobe: String,
    asr: Option<AsrOptions>,
}

fn deaccent(character: char) -> char {
    match character {
        'á' | 'à' | 'â' | 'ã' | 'ä' | 'Á' | 'À' | 'Â' | 'Ã' | 'Ä' => 'a',
        'é' | 'è' | 'ê' | 'ë' | 'É' | 'È' | 'Ê' | 'Ë' => 'e',
        'í' | 'ì' | 'î' | 'ï' | 'Í' | 'Ì' | 'Î' | 'Ï' => 'i',
        'ó' | 'ò' | 'ô' | 'õ' | 'ö' | 'Ó' | 'Ò' | 'Ô' | 'Õ' | 'Ö' => 'o',
        'ú' | 'ù' | 'û' | 'ü' | 'Ú' | 'Ù' | 'Û' | 'Ü' => 'u',
        'ç' | 'Ç' => 'c',
        other => other,
    }
}

fn normalize_words(text: &str) -> Vec<String> {
    text.split_whitespace()
        .map(|word| {
            word.chars()
                .map(deaccent)
                .filter(|character| character.is_alphanumeric())
                .collect::<String>()
                .to_lowercase()
        })
        .filter(|word| word.chars().count() >= 3)
        .collect()
}

fn word_coverage(expected: &[String], actual: &[String]) -> f32 {
    if expected.is_empty() {
        return 0.0;
    }
    let mut remaining = actual.to_vec();
    let mut matched = 0usize;
    for word in expected {
        if let Some(position) = remaining.iter().position(|candidate| candidate == word) {
            remaining.swap_remove(position);
            matched += 1;
        }
    }
    matched as f32 / expected.len() as f32
}

impl FfmpegQa {
    pub fn new(ffmpeg: &str, ffprobe: &str) -> Self {
        Self {
            ffmpeg: ffmpeg.to_string(),
            ffprobe: ffprobe.to_string(),
            asr: None,
        }
    }

    pub fn with_asr(mut self, options: AsrOptions) -> Self {
        self.asr = Some(options);
        self
    }

    fn check(id: &str, name: &str, status: QaStatus, detail: impl Into<String>) -> QaCheck {
        QaCheck {
            id: id.into(),
            name: name.into(),
            status,
            detail: detail.into(),
        }
    }

    fn scan(&self, path: &Path, filter: &str) -> Result<String> {
        let args = vec![
            "-hide_banner".to_string(),
            "-nostats".to_string(),
            "-i".to_string(),
            path.to_string_lossy().to_string(),
            "-vf".to_string(),
            filter.to_string(),
            "-an".to_string(),
            "-f".to_string(),
            "null".to_string(),
            "-".to_string(),
        ];
        let output = require_success(run(&self.ffmpeg, &args, None)?, &format!("scan {filter}"))?;
        Ok(String::from_utf8_lossy(&output.stderr).to_string())
    }

    pub fn technical(&self, output: &RenderOutput, profile: &RenderProfile) -> Result<QaReport> {
        let mut checks = Vec::new();
        let exists = output.path.is_file() && std::fs::metadata(&output.path)?.len() > 0;
        checks.push(Self::check(
            "file",
            "arquivo de video existe",
            if exists {
                QaStatus::Pass
            } else {
                QaStatus::Fail
            },
            output.path.display().to_string(),
        ));
        if !exists {
            return Ok(QaReport::new(checks));
        }
        let probe = probe_json(&self.ffprobe, &output.path)?;
        let duration = probe_duration(&probe).unwrap_or(0.0);
        checks.push(Self::check(
            "duration",
            "duracao valida",
            if duration > 0.5 {
                QaStatus::Pass
            } else {
                QaStatus::Fail
            },
            format!("{duration:.2}s"),
        ));
        let video = probe_video(&probe);
        let video_ok = video
            .map(|(width, height, _)| width == profile.width && height == profile.height)
            .unwrap_or(false);
        checks.push(Self::check(
            "resolution",
            "resolucao do perfil",
            if video_ok {
                QaStatus::Pass
            } else {
                QaStatus::Fail
            },
            video
                .map(|(width, height, _)| {
                    format!(
                        "{width}x{height}, esperado {}x{}",
                        profile.width, profile.height
                    )
                })
                .unwrap_or_else(|| "sem stream de video".into()),
        ));
        let fps_ok = video
            .map(|(_, _, fps)| (fps - profile.fps as f64).abs() < 0.6)
            .unwrap_or(false);
        checks.push(Self::check(
            "fps",
            "fps do perfil",
            if fps_ok {
                QaStatus::Pass
            } else {
                QaStatus::Fail
            },
            video
                .map(|(_, _, fps)| format!("{fps:.2}, esperado {}", profile.fps))
                .unwrap_or_else(|| "sem stream de video".into()),
        ));
        let codec = probe_codec(&probe).unwrap_or_default();
        let expected_codec = expected_video_codec(&profile.video_codec);
        checks.push(Self::check(
            "codec",
            "codec de video",
            if codec == expected_codec {
                QaStatus::Pass
            } else {
                QaStatus::Fail
            },
            format!("{codec}, esperado {expected_codec}"),
        ));
        let audio_codec = probe_stream_codec(&probe, "audio").unwrap_or_default();
        checks.push(Self::check(
            "audio_stream",
            "stream de audio presente",
            if audio_codec == "aac" {
                QaStatus::Pass
            } else {
                QaStatus::Fail
            },
            format!("{audio_codec}, esperado aac"),
        ));
        let decode_args = vec![
            "-hide_banner".to_string(),
            "-v".to_string(),
            "error".to_string(),
            "-i".to_string(),
            output.path.to_string_lossy().to_string(),
            "-f".to_string(),
            "null".to_string(),
            "-".to_string(),
        ];
        let decode = run(&self.ffmpeg, &decode_args, None)?;
        checks.push(Self::check(
            "decode",
            "decodificacao completa",
            if decode.status.success() {
                QaStatus::Pass
            } else {
                QaStatus::Fail
            },
            if decode.status.success() {
                "ok".to_string()
            } else {
                truncate(&String::from_utf8_lossy(&decode.stderr), 300)
            },
        ));
        let black = self.scan(&output.path, "blackdetect=d=2:pix_th=0.10")?;
        checks.push(Self::check(
            "black",
            "sem tela preta prolongada",
            if detect_black(&black) {
                QaStatus::Fail
            } else {
                QaStatus::Pass
            },
            if detect_black(&black) {
                "blackdetect encontrou trecho".to_string()
            } else {
                "ok".to_string()
            },
        ));
        let freeze = self.scan(&output.path, "freezedetect=n=0.001:d=2")?;
        checks.push(Self::check(
            "freeze",
            "sem congelamento prolongado",
            if detect_freeze(&freeze) {
                QaStatus::Fail
            } else {
                QaStatus::Pass
            },
            if detect_freeze(&freeze) {
                "freezedetect encontrou trecho".to_string()
            } else {
                "ok".to_string()
            },
        ));
        let volume_args = vec![
            "-hide_banner".to_string(),
            "-nostats".to_string(),
            "-i".to_string(),
            output.path.to_string_lossy().to_string(),
            "-af".to_string(),
            "volumedetect".to_string(),
            "-f".to_string(),
            "null".to_string(),
            "-".to_string(),
        ];
        let volume = require_success(run(&self.ffmpeg, &volume_args, None)?, "scan volumedetect")?;
        let volume_text = String::from_utf8_lossy(&volume.stderr).to_string();
        let max_volume = parse_volume_db(&volume_text);
        let audio_ok = max_volume.map(|value| value > -50.0).unwrap_or(false);
        checks.push(Self::check(
            "audio_level",
            "audio audivel",
            if audio_ok {
                QaStatus::Pass
            } else {
                QaStatus::Fail
            },
            max_volume
                .map(|value| format!("max_volume {value:.1} dB"))
                .unwrap_or_else(|| "volumedetect sem leitura".into()),
        ));
        Ok(QaReport::new(checks))
    }

    pub fn transcript(&self, output: &RenderOutput, script: &Script) -> Result<Option<QaReport>> {
        let Some(options) = &self.asr else {
            return Ok(None);
        };
        let mut checks = Vec::new();
        if !options.model.is_file() {
            checks.push(Self::check(
                "asr_model",
                "modelo ASR disponivel",
                QaStatus::Fail,
                format!("modelo ausente: {}", options.model.display()),
            ));
            return Ok(Some(QaReport::new(checks)));
        }
        let output_abs = if output.path.is_absolute() {
            output.path.clone()
        } else {
            std::env::current_dir()?.join(&output.path)
        };
        let parent = output_abs
            .parent()
            .ok_or_else(|| FramechesterError::InvalidInput("video sem diretorio".into()))?;
        let destination_name = "asr_transcript.json";
        let destination = parent.join(destination_name);
        let _ = std::fs::remove_file(&destination);
        let model = if options.model.is_absolute() {
            options.model.clone()
        } else {
            std::env::current_dir()?.join(&options.model)
        };
        let model = model
            .to_string_lossy()
            .replace('\\', "/")
            .replace(':', "\\\\:");
        let filter = format!(
            "whisper=model={model}:language={}:format=json:destination={destination_name}:use_gpu=false",
            options.language
        );
        let args = vec![
            "-hide_banner".to_string(),
            "-loglevel".to_string(),
            "error".to_string(),
            "-y".to_string(),
            "-i".to_string(),
            output_abs.to_string_lossy().to_string(),
            "-af".to_string(),
            filter,
            "-f".to_string(),
            "null".to_string(),
            "-".to_string(),
        ];
        let result = run(&self.ffmpeg, &args, Some(parent))?;
        if !result.status.success() {
            checks.push(Self::check(
                "asr_run",
                "transcricao ASR executou",
                QaStatus::Fail,
                truncate(&String::from_utf8_lossy(&result.stderr), 300),
            ));
            return Ok(Some(QaReport::new(checks)));
        }
        let raw = std::fs::read_to_string(&destination).unwrap_or_default();
        let transcript = parse_whisper_transcript(&raw);
        if transcript.trim().is_empty() {
            checks.push(Self::check(
                "asr_text",
                "transcricao ASR produziu texto",
                QaStatus::Fail,
                format!("arquivo vazio ou invalido: {}", destination.display()),
            ));
            return Ok(Some(QaReport::new(checks)));
        }
        let expected = script
            .scenes
            .iter()
            .flat_map(|scene| normalize_words(&scene.narration))
            .collect::<Vec<_>>();
        let actual = normalize_words(&transcript);
        let coverage = word_coverage(&expected, &actual);
        let status = if coverage >= options.min_coverage {
            QaStatus::Pass
        } else {
            QaStatus::NeedsHuman
        };
        checks.push(Self::check(
            "asr_coverage",
            "fala reconhecida cobre o roteiro",
            status,
            format!(
                "cobertura {:.0}% (minimo {:.0}%); ASR pode errar nomes e siglas; trecho: {}",
                coverage * 100.0,
                options.min_coverage * 100.0,
                truncate(&transcript, 160)
            ),
        ));
        checks.push(Self::check(
            "asr_artifact",
            "transcricao ASR preservada",
            QaStatus::Pass,
            destination.display().to_string(),
        ));
        Ok(Some(QaReport::new(checks)))
    }
}

fn parse_whisper_transcript(raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    if trimmed.starts_with('[') {
        if let Ok(values) = serde_json::from_str::<Vec<serde_json::Value>>(trimmed) {
            return values
                .iter()
                .filter_map(|value| value.get("text").and_then(|text| text.as_str()))
                .collect::<Vec<_>>()
                .join(" ");
        }
    }
    trimmed
        .lines()
        .filter_map(|line| serde_json::from_str::<serde_json::Value>(line).ok())
        .filter_map(|value| {
            value
                .get("text")
                .and_then(|text| text.as_str())
                .map(str::to_string)
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn contextualize_static_scenes(report: &mut QaReport, timeline: &Timeline) {
    // Only an entirely authored still-image timeline explains the freeze scan.
    // Mixed/video timelines keep the strict failure until interval-level QA exists.
    if !timeline.scenes.is_empty()
        && timeline
            .scenes
            .iter()
            .all(|scene| scene.background == "image")
    {
        for check in &mut report.checks {
            if check.id == "freeze" && check.status == QaStatus::Fail {
                check.status = QaStatus::NeedsHuman;
                check.detail = "Cenas compostas por imagens estaticas; revisar ritmo e adequacao visual. O detector encontrou frames parados previstos pela timeline.".into();
            }
        }
    }
}

impl QaGate for FfmpegQa {
    fn info(&self) -> AdapterInfo {
        AdapterInfo {
            name: "ffmpeg-qa".into(),
            license: "FFmpeg build local".into(),
            network: false,
            unit_cost: "R$ 0,00 incremental".into(),
            secrets: Vec::new(),
            failure_modes: vec![
                "falso positivo em conteudo escuro".into(),
                "falso positivo em cena estatica".into(),
            ],
        }
    }

    fn technical(&self, output: &RenderOutput, profile: &RenderProfile) -> Result<QaReport> {
        FfmpegQa::technical(self, output, profile)
    }

    fn technical_with_timeline(
        &self,
        output: &RenderOutput,
        profile: &RenderProfile,
        timeline: &Timeline,
    ) -> Result<QaReport> {
        let mut report = FfmpegQa::technical(self, output, profile)?;
        contextualize_static_scenes(&mut report, timeline);
        Ok(report)
    }

    fn editorial(
        &self,
        script: &Script,
        assets: &[AssetManifest],
        timeline: &Timeline,
    ) -> Result<QaReport> {
        Ok(qa::editorial(script, assets, timeline))
    }

    fn transcript(&self, output: &RenderOutput, script: &Script) -> Result<Option<QaReport>> {
        FfmpegQa::transcript(self, output, script)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn intentional_still_scenes_require_visual_review_without_hiding_video_freezes() {
        let timeline = Timeline {
            captions: None,
            scenes: vec![framechester_core::domain::TimelineScene {
                scene_id: 42,
                heading: "Explicação".into(),
                background: "image".into(),
                audio_path: "fixture.wav".into(),
                duration_secs: 10.0,
            }],
        };
        let report = QaReport::new(vec![
            FfmpegQa::check("freeze", "congelamento", QaStatus::Fail, "freeze_start: 0"),
            FfmpegQa::check(
                "decode",
                "decodificação",
                QaStatus::Fail,
                "arquivo inválido",
            ),
        ]);
        let mut still = report.clone();
        contextualize_static_scenes(&mut still, &timeline);
        assert_eq!(
            still.checks[0].status,
            QaStatus::NeedsHuman,
            "Still-image scenes need contextual review, not a false freeze failure"
        );
        assert_eq!(
            still.checks[1].status,
            QaStatus::Fail,
            "Decode failures must remain blocking"
        );
        let mut video_timeline = timeline;
        video_timeline.scenes[0].background = "video".into();
        let mut video = report;
        contextualize_static_scenes(&mut video, &video_timeline);
        assert_eq!(video.checks[0].status, QaStatus::Fail);
    }

    fn fake_qa(
        directory: &Path,
        failed_filter: Option<&str>,
        video_codec: &str,
        audio_codec: &str,
    ) -> (FfmpegQa, RenderOutput, RenderProfile) {
        let extension = if cfg!(windows) { "cmd" } else { "sh" };
        let ffmpeg = directory.join(format!("fake-ffmpeg.{extension}"));
        let ffprobe = directory.join(format!("fake-ffprobe.{extension}"));
        let marker = failed_filter.unwrap_or("NEVER_FAIL");
        let ffmpeg_script = if cfg!(windows) {
            format!("@echo off\r\necho max_volume: -3.0 dB 1>&2\r\necho %* | findstr /C:\"{marker}\" >nul\r\nif not errorlevel 1 exit /b 7\r\nexit /b 0\r\n")
        } else {
            format!("#!/bin/sh\necho 'max_volume: -3.0 dB' >&2\ncase \"$*\" in *{marker}*) exit 7;; esac\nexit 0\n")
        };
        let probe = serde_json::json!({
            "format": { "duration": "3.0" },
            "streams": [
                { "codec_type": "video", "codec_name": video_codec, "width": 160, "height": 90, "avg_frame_rate": "30/1" },
                { "codec_type": "audio", "codec_name": audio_codec }
            ]
        });
        let probe_script = if cfg!(windows) {
            format!("@echo off\r\necho {probe}\r\nexit /b 0\r\n")
        } else {
            format!("#!/bin/sh\nprintf '%s\\n' '{probe}'\n")
        };
        std::fs::write(&ffmpeg, ffmpeg_script).unwrap();
        std::fs::write(&ffprobe, probe_script).unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            for path in [&ffmpeg, &ffprobe] {
                std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o700)).unwrap();
            }
        }
        let path = directory.join("video.mp4");
        std::fs::write(&path, b"synthetic fixture").unwrap();
        let profile = RenderProfile {
            width: 160,
            height: 90,
            ..RenderProfile::default()
        };
        let output = RenderOutput {
            path,
            duration_secs: 3.0,
            bytes: 17,
            sha256: "synthetic".into(),
            video_codec: video_codec.into(),
            width: 160,
            height: 90,
            fps: 30,
        };
        (
            FfmpegQa::new(ffmpeg.to_str().unwrap(), ffprobe.to_str().unwrap()),
            output,
            profile,
        )
    }

    #[test]
    fn failed_video_scans_abort_technical_qa() {
        for filter in ["blackdetect", "freezedetect"] {
            let directory = tempfile::tempdir().unwrap();
            let (qa, output, profile) = fake_qa(directory.path(), Some(filter), "h264", "aac");
            let error = qa.technical(&output, &profile).unwrap_err();
            assert!(matches!(error, FramechesterError::External(_)));
            assert!(error.to_string().contains("scan"));
        }
    }

    #[test]
    fn failed_volume_scan_cannot_pass_from_partial_volume_output() {
        let directory = tempfile::tempdir().unwrap();
        let (qa, output, profile) = fake_qa(directory.path(), Some("volumedetect"), "h264", "aac");
        let error = qa.technical(&output, &profile).unwrap_err();
        assert!(matches!(error, FramechesterError::External(_)));
        assert!(error.to_string().contains("volume"));
    }

    #[test]
    fn unexpected_video_or_audio_codec_fails_the_requested_profile() {
        for (video, audio, expected_failed_check) in [
            ("vp9", "aac", "codec"),
            ("h264", "pcm_s16le", "audio_stream"),
        ] {
            let directory = tempfile::tempdir().unwrap();
            let (qa, output, profile) = fake_qa(directory.path(), None, video, audio);
            let report = qa.technical(&output, &profile).unwrap();
            assert!(report
                .checks
                .iter()
                .any(|check| check.id == expected_failed_check && check.status == QaStatus::Fail));
        }
    }

    #[test]
    fn encoder_aliases_match_their_probed_codec_names() {
        for (encoder, codec) in [
            ("libx264", "h264"),
            ("h264_amf", "h264"),
            ("libx265", "hevc"),
        ] {
            let directory = tempfile::tempdir().unwrap();
            let (qa, output, mut profile) = fake_qa(directory.path(), None, codec, "aac");
            profile.video_codec = encoder.into();
            let report = qa.technical(&output, &profile).unwrap();
            assert_eq!(report.overall(), QaStatus::Pass, "encoder {encoder}");
        }
    }

    #[test]
    fn normalizes_asr_words() {
        let words = normalize_words("Você já viu a GPU? Ação, coração e IA!");
        assert!(words.contains(&"voce".to_string()));
        assert!(words.contains(&"acao".to_string()));
        assert!(words.contains(&"coracao".to_string()));
        assert!(!words.contains(&"ia".to_string()));
    }

    #[test]
    fn computes_word_coverage() {
        let expected = vec!["alpha".to_string(), "beta".to_string(), "gamma".to_string()];
        let actual = vec!["beta".to_string(), "gamma".to_string(), "delta".to_string()];
        assert!((word_coverage(&expected, &actual) - 0.6666).abs() < 0.01);
        assert_eq!(word_coverage(&[], &actual), 0.0);
    }

    #[test]
    fn parses_whisper_json_lines_and_arrays() {
        let lines = "{\"text\":\"ola\"}\n{\"text\":\"mundo\"}\n";
        assert_eq!(parse_whisper_transcript(lines), "ola mundo");
        let array = "[{\"text\":\"ola\"},{\"text\":\"mundo\"}]";
        assert_eq!(parse_whisper_transcript(array), "ola mundo");
        assert_eq!(parse_whisper_transcript(""), "");
    }

    #[test]
    fn parses_rational() {
        assert!((parse_rational("30000/1001").unwrap() - 29.97).abs() < 0.01);
        assert_eq!(parse_rational("0/0"), None);
        assert_eq!(parse_rational("lixo"), None);
    }

    #[test]
    fn parses_volume() {
        assert_eq!(parse_volume_db("max_volume: -3.2 dB"), Some(-3.2));
        assert_eq!(
            parse_volume_db("max_volume: -inf dB"),
            Some(f32::NEG_INFINITY)
        );
        assert_eq!(parse_volume_db("nada"), None);
    }

    #[test]
    fn detects_black_and_freeze() {
        assert!(detect_black("black_start:0 black_end:3"));
        assert!(!detect_black("ok"));
        assert!(detect_freeze("freeze_start: 1.2"));
        assert!(!detect_freeze("ok"));
    }

    #[test]
    fn escapes_windows_font_path() {
        assert_eq!(
            filter_escape(Path::new("C:/Windows/Fonts/arial.ttf")),
            "C\\:/Windows/Fonts/arial.ttf"
        );
    }

    #[test]
    fn builds_escaped_subtitle_filter() {
        let filter = subtitle_filter(
            Path::new("C:/Users/dev/run/captions.srt"),
            &RenderProfile::default(),
        );
        assert!(filter.starts_with("subtitles=filename='C"));
        assert!(filter.contains("FontName=Segoe UI"));
        assert!(filter.contains("PlayResX=1920,PlayResY=1080"));
    }

    #[test]
    fn renderer_rejects_missing_scene_asset_before_invoking_ffmpeg() {
        let directory = tempfile::tempdir().unwrap();
        let audio = directory.path().join("audio.wav");
        std::fs::write(&audio, b"synthetic test input").unwrap();
        let timeline = Timeline {
            captions: None,
            scenes: vec![framechester_core::domain::TimelineScene {
                scene_id: 7,
                heading: "Cena".into(),
                background: "image".into(),
                audio_path: audio,
                duration_secs: 1.0,
            }],
        };
        let result = FfmpegRenderer::new("missing-ffmpeg-for-test", "missing-ffprobe-for-test")
            .render(
                &timeline,
                &[],
                &RenderProfile::default(),
                &directory.path().join("out.mp4"),
            );
        assert!(matches!(result, Err(FramechesterError::InvalidInput(_))));
    }

    #[test]
    #[ignore = "requires local FFmpeg and ffprobe; generates only synthetic media"]
    fn renders_local_image_and_video_instead_of_test_pattern() {
        let directory = tempfile::tempdir().unwrap();
        let image = directory.path().join("image.png");
        let clip = directory.path().join("clip.mp4");
        let audio = directory.path().join("audio.wav");
        for args in [
            vec![
                "-f",
                "lavfi",
                "-i",
                "color=c=0x124DBC:s=320x180:r=30",
                "-frames:v",
                "1",
                image.to_str().unwrap(),
            ],
            vec![
                "-f",
                "lavfi",
                "-i",
                "color=c=0xA43826:s=80x80:r=15",
                "-t",
                "0.3",
                "-pix_fmt",
                "yuv420p",
                clip.to_str().unwrap(),
            ],
            vec![
                "-f",
                "lavfi",
                "-i",
                "sine=frequency=440:sample_rate=48000",
                "-t",
                "1",
                audio.to_str().unwrap(),
            ],
        ] {
            let result = Command::new("ffmpeg")
                .args(["-hide_banner", "-loglevel", "error", "-y"])
                .args(args)
                .output()
                .unwrap();
            assert!(
                result.status.success(),
                "{}",
                String::from_utf8_lossy(&result.stderr)
            );
        }
        let assets: Vec<AssetManifest> = [(&image, "image"), (&clip, "video")]
            .into_iter()
            .enumerate()
            .map(|(id, (path, kind))| AssetManifest {
                scene_id: id as u32,
                kind: kind.into(),
                path: Some(path.canonicalize().unwrap()),
                license: "CC0-1.0".into(),
                provenance: "fixture sintetica gerada pelo proprio teste".into(),
                checksum: sha256_file(path).unwrap(),
                restrictions: "somente teste; sem conteudo de terceiros".into(),
            })
            .collect();
        let timeline = Timeline {
            captions: None,
            scenes: assets
                .iter()
                .map(|asset| framechester_core::domain::TimelineScene {
                    scene_id: asset.scene_id,
                    heading: String::new(),
                    background: asset.kind.clone(),
                    audio_path: audio.clone(),
                    duration_secs: 1.0,
                })
                .collect(),
        };
        let profile = RenderProfile {
            width: 160,
            height: 90,
            fps: 30,
            preset: "ultrafast".into(),
            ..RenderProfile::default()
        };
        let output = directory.path().join("render/final.mp4");
        let render = FfmpegRenderer::new("ffmpeg", "ffprobe")
            .render(&timeline, &assets, &profile, &output)
            .unwrap();
        assert_eq!((render.width, render.height, render.fps), (160, 90, 30));
        assert!((render.duration_secs - 2.0).abs() < 0.15);
        let probe = probe_json("ffprobe", &output).unwrap();
        assert!(has_audio(&probe));
        for (timestamp, pixel) in [("0.2", [18i16, 77, 188]), ("1.2", [164i16, 56, 38])] {
            let frame = Command::new("ffmpeg")
                .args(["-v", "error", "-ss", timestamp, "-i"])
                .arg(&output)
                .args([
                    "-frames:v",
                    "1",
                    "-vf",
                    "crop=2:2:80:44,scale=1:1",
                    "-pix_fmt",
                    "rgb24",
                    "-f",
                    "rawvideo",
                    "-",
                ])
                .output()
                .unwrap();
            assert!(frame.status.success());
            assert_eq!(frame.stdout.len(), 3);
            for (actual, expected) in frame.stdout.iter().zip(pixel) {
                assert!(
                    (*actual as i16 - expected).abs() < 25,
                    "source pixel mismatch: {:?}",
                    frame.stdout
                );
            }
        }
        let qa = FfmpegQa::new("ffmpeg", "ffprobe");
        assert_eq!(
            qa.technical(&render, &profile).unwrap().overall(),
            QaStatus::Pass
        );
        let black = directory.path().join("black.mp4");
        let generated = Command::new("ffmpeg")
            .args([
                "-hide_banner",
                "-loglevel",
                "error",
                "-y",
                "-f",
                "lavfi",
                "-i",
                "color=c=black:s=160x90:r=30",
                "-f",
                "lavfi",
                "-i",
                "sine=frequency=440:sample_rate=48000",
                "-t",
                "3",
                "-c:v",
                "libx264",
                "-preset",
                "ultrafast",
                "-c:a",
                "aac",
            ])
            .arg(&black)
            .output()
            .unwrap();
        assert!(generated.status.success());
        let black_output = inspect_output("ffprobe", &black, &profile).unwrap();
        let black_report = qa.technical(&black_output, &profile).unwrap();
        assert_eq!(black_report.overall(), QaStatus::Fail);
        assert!(black_report
            .checks
            .iter()
            .any(|check| check.id == "black" && check.status == QaStatus::Fail));
    }
}
