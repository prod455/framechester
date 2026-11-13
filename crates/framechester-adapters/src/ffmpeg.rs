use framechester_core::domain::{QaCheck, QaReport, QaStatus, RenderOutput, RenderProfile, Script};
use framechester_core::error::{FramechesterError, Result};
use sha2::{Digest, Sha256};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::Command;

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

/// Frozen stretches reported by `freezedetect`, in seconds. A freeze still open at the end
/// of the file has no `freeze_end` and is reported up to `f64::INFINITY`.
pub fn freeze_spans(text: &str) -> Vec<(f64, f64)> {
    let value = |line: &str, key: &str| -> Option<f64> {
        line.split(key)
            .nth(1)?
            .split_whitespace()
            .next()?
            .parse()
            .ok()
    };
    let mut spans = Vec::new();
    let mut open: Option<f64> = None;
    for line in text.lines() {
        if let Some(start) = value(line, "freeze_start:") {
            open = Some(start);
        } else if let Some(end) = value(line, "freeze_end:") {
            if let Some(start) = open.take() {
                spans.push((start, end));
            }
        }
    }
    if let Some(start) = open {
        spans.push((start, f64::INFINITY));
    }
    spans
}

fn describe_freeze(spans: &[(f64, f64)]) -> String {
    let parts: Vec<String> = spans
        .iter()
        .map(|(start, end)| {
            if end.is_finite() {
                format!("{start:.1}–{end:.1}s")
            } else {
                format!("{start:.1}s até o fim")
            }
        })
        .collect();
    format!("tela parada em {}", parts.join(", "))
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
                describe_freeze(&freeze_spans(&freeze))
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

#[cfg(test)]
mod tests {
    use super::*;

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
    fn freeze_detail_says_where_the_screen_stood_still() {
        let log = "[freezedetect @ 0x1] lavfi.freezedetect.freeze_start: 47.8667\n\
                   [freezedetect @ 0x1] lavfi.freezedetect.freeze_duration: 2.1\n\
                   [freezedetect @ 0x1] lavfi.freezedetect.freeze_end: 49.9667\n\
                   [freezedetect @ 0x1] lavfi.freezedetect.freeze_start: 54.1\n";
        let spans = freeze_spans(log);
        assert_eq!(spans.len(), 2);
        assert_eq!(spans[0], (47.8667, 49.9667));
        assert!(spans[1].1.is_infinite());
        assert_eq!(
            describe_freeze(&spans),
            "tela parada em 47.9–50.0s, 54.1s até o fim"
        );
    }
}
