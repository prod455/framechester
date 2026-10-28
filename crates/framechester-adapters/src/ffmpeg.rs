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
        _assets: &[AssetManifest],
        profile: &RenderProfile,
        output: &Path,
    ) -> Result<RenderOutput> {
        if timeline.scenes.is_empty() {
            return Err(FramechesterError::InvalidInput(
                "timeline sem cenas para renderizar".into(),
            ));
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
        if scene_dir.exists() {
            std::fs::remove_dir_all(&scene_dir)?;
        }
        std::fs::create_dir_all(&scene_dir)?;
        let font = find_font();
        let mut scene_files = Vec::new();
        for (index, scene) in timeline.scenes.iter().enumerate() {
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
            let background = match scene.background.as_str() {
                "color" => format!(
                    "color=c=0x101820:size={}x{}:rate={}",
                    profile.width, profile.height, profile.fps
                ),
                _ => format!(
                    "testsrc2=size={}x{}:rate={}",
                    profile.width, profile.height, profile.fps
                ),
            };
            let filter = font.as_ref().map(|font| {
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
                "-f".to_string(),
                "lavfi".to_string(),
                "-i".to_string(),
                background,
                "-i".to_string(),
                audio_path.to_string_lossy().to_string(),
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
            ];
            if let Some(filter) = &filter {
                let insert_at = 10;
                base.insert(insert_at, "-vf".to_string());
                base.insert(insert_at + 1, filter.clone());
            }
            let mut output_result = run(&self.ffmpeg, &base, Some(&scene_dir));
            if output_result
                .as_ref()
                .map(|result| !result.status.success())
                .unwrap_or(true)
                && filter.is_some()
            {
                base.drain(10..12);
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
    let font_size = (profile.height / 32).max(20);
    let style = format!(
        "FontName=Segoe UI,FontSize={font_size},PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=2,Shadow=0,Alignment=2,MarginV=48"
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
    let streams = probe.get("streams")?.as_array()?;
    streams
        .iter()
        .find(|stream| stream.get("codec_type").and_then(|value| value.as_str()) == Some("video"))
        .and_then(|stream| stream.get("codec_name"))
        .and_then(|value| value.as_str())
        .map(str::to_string)
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
        let output = run(&self.ffmpeg, &args, None)?;
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
        checks.push(Self::check(
            "codec",
            "codec de video",
            if !codec.is_empty() {
                QaStatus::Pass
            } else {
                QaStatus::Fail
            },
            codec,
        ));
        checks.push(Self::check(
            "audio_stream",
            "stream de audio presente",
            if has_audio(&probe) {
                QaStatus::Pass
            } else {
                QaStatus::Fail
            },
            "aac esperado".to_string(),
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
        let volume = run(&self.ffmpeg, &volume_args, None)?;
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
        assert!(filter.ends_with("MarginV=48'"));
    }
}
