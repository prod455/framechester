use framechester_core::domain::TtsAudio;
use framechester_core::error::{FramechesterError, Result};
use framechester_core::ports::{AdapterInfo, TtsEngine, TtsRequest};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

#[derive(Debug, Clone)]
pub struct PiperTts {
    piper: PathBuf,
    model: PathBuf,
    voice_name: String,
    ffprobe: String,
}

impl PiperTts {
    pub fn new(
        piper_path: &str,
        voice_model: &str,
        voice_name: &str,
        ffprobe_path: &str,
    ) -> Result<Self> {
        let piper = resolve_piper(piper_path)?;
        let model = resolve_model(voice_model)?;
        Ok(Self {
            piper,
            model,
            voice_name: voice_name.to_string(),
            ffprobe: ffprobe_path.to_string(),
        })
    }

    pub fn available(piper_path: &str) -> bool {
        resolve_piper(piper_path).is_ok()
    }

    pub fn model_path(&self) -> &Path {
        &self.model
    }

    pub fn piper_path(&self) -> &Path {
        &self.piper
    }

    pub fn probe_duration(&self, path: &Path) -> f32 {
        if let Some((_, duration)) = probe_wav(path) {
            return duration;
        }
        if let Ok(output) = Command::new(&self.ffprobe)
            .args([
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=nw=1:nk=1",
            ])
            .arg(path)
            .output()
        {
            if output.status.success() {
                if let Ok(text) = String::from_utf8(output.stdout) {
                    if let Ok(value) = text.trim().parse::<f32>() {
                        return value;
                    }
                }
            }
        }
        0.0
    }
}

fn resolve_piper(configured: &str) -> Result<PathBuf> {
    let candidates: Vec<PathBuf> = if configured.trim().is_empty() || configured == "piper" {
        vec![PathBuf::from("C:/piper/piper.exe"), PathBuf::from("piper")]
    } else {
        vec![PathBuf::from(configured)]
    };
    for candidate in candidates {
        if candidate.components().count() > 1 {
            if candidate.is_file() {
                return Ok(candidate);
            }
        } else if Command::new(&candidate)
            .arg("--help")
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .map(|status| status.success())
            .unwrap_or(false)
        {
            return Ok(candidate);
        }
    }
    Err(FramechesterError::Unavailable(
        "piper nao encontrado; ajuste tts.piper_path".into(),
    ))
}

fn resolve_model(configured: &str) -> Result<PathBuf> {
    let mut candidates = Vec::new();
    if !configured.trim().is_empty() {
        candidates.push(PathBuf::from(configured));
    }
    if let Ok(from_env) = std::env::var("FRAMECHESTER_PIPER_VOICE") {
        if !from_env.trim().is_empty() {
            candidates.push(PathBuf::from(from_env));
        }
    }
    candidates.push(PathBuf::from("C:/piper/pt_BR-faber-medium.onnx"));
    for candidate in candidates {
        if candidate.is_file() {
            return Ok(candidate);
        }
    }
    Err(FramechesterError::Unavailable(
        "modelo de voz PT-BR nao encontrado; ajuste tts.voice_model".into(),
    ))
}

pub fn wav_metadata(bytes: &[u8]) -> Option<(u32, f32)> {
    if bytes.len() < 12 || &bytes[0..4] != b"RIFF" || &bytes[8..12] != b"WAVE" {
        return None;
    }
    let mut offset = 12usize;
    let mut sample_rate = 0u32;
    let mut channels = 0u16;
    let mut bits = 0u16;
    let mut data_size = 0u32;
    while offset + 8 <= bytes.len() {
        let id = &bytes[offset..offset + 4];
        let size = u32::from_le_bytes([
            bytes[offset + 4],
            bytes[offset + 5],
            bytes[offset + 6],
            bytes[offset + 7],
        ]) as usize;
        let payload = offset + 8;
        if payload + size > bytes.len() {
            break;
        }
        if id == b"fmt " && size >= 16 {
            channels = u16::from_le_bytes([bytes[payload + 2], bytes[payload + 3]]);
            sample_rate = u32::from_le_bytes([
                bytes[payload + 4],
                bytes[payload + 5],
                bytes[payload + 6],
                bytes[payload + 7],
            ]);
            bits = u16::from_le_bytes([bytes[payload + 14], bytes[payload + 15]]);
        } else if id == b"data" {
            data_size = size as u32;
            break;
        }
        offset = payload + size + (size % 2);
    }
    if sample_rate == 0 || channels == 0 || bits == 0 || data_size == 0 {
        return None;
    }
    let bytes_per_second = sample_rate as f32 * channels as f32 * (bits as f32 / 8.0);
    if bytes_per_second <= 0.0 {
        return None;
    }
    Some((sample_rate, data_size as f32 / bytes_per_second))
}

pub fn probe_wav(path: &Path) -> Option<(u32, f32)> {
    let bytes = std::fs::read(path).ok()?;
    wav_metadata(&bytes)
}

impl TtsEngine for PiperTts {
    fn info(&self) -> AdapterInfo {
        AdapterInfo {
            name: "piper-tts".into(),
            license: "Piper MIT; voz faber dataset CC0".into(),
            network: false,
            unit_cost: "R$ 0,00".into(),
            secrets: Vec::new(),
            failure_modes: vec![
                "modelo de voz ausente".into(),
                "texto vazio".into(),
                "falha do binario piper".into(),
            ],
        }
    }

    fn synthesize(&self, request: &TtsRequest) -> Result<TtsAudio> {
        let text = request.text.trim();
        if text.is_empty() {
            return Err(FramechesterError::InvalidInput(
                "texto de narracao vazio".into(),
            ));
        }
        if let Some(parent) = request.output.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let mut child = Command::new(&self.piper)
            .arg("-m")
            .arg(&self.model)
            .arg("-f")
            .arg(&request.output)
            .arg("--sentence_silence")
            .arg("0.25")
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|error| {
                FramechesterError::Unavailable(format!("falha ao executar piper: {error}"))
            })?;
        if let Some(stdin) = child.stdin.as_mut() {
            stdin
                .write_all(text.as_bytes())
                .and_then(|_| stdin.write_all(b"\n"))
                .map_err(|error| {
                    FramechesterError::External(format!("falha ao enviar texto ao piper: {error}"))
                })?;
        }
        let output = child.wait_with_output()?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(FramechesterError::External(format!(
                "piper falhou: {}",
                stderr.chars().take(300).collect::<String>()
            )));
        }
        let (sample_rate, duration) = probe_wav(&request.output).unwrap_or((22_050, 0.0));
        if duration <= 0.0 {
            return Err(FramechesterError::External(
                "piper gerou audio sem duracao valida".into(),
            ));
        }
        Ok(TtsAudio {
            scene_id: request.scene_id,
            path: request.output.clone(),
            duration_secs: duration,
            sample_rate,
            voice: self.voice_name.clone(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tiny_wav(sample_rate: u32, channels: u16, bits: u16, frames: u32) -> Vec<u8> {
        let data_size = frames * channels as u32 * (bits as u32 / 8);
        let mut bytes = Vec::new();
        bytes.extend_from_slice(b"RIFF");
        bytes.extend_from_slice(&(36 + data_size).to_le_bytes());
        bytes.extend_from_slice(b"WAVE");
        bytes.extend_from_slice(b"fmt ");
        bytes.extend_from_slice(&16u32.to_le_bytes());
        bytes.extend_from_slice(&1u16.to_le_bytes());
        bytes.extend_from_slice(&channels.to_le_bytes());
        bytes.extend_from_slice(&sample_rate.to_le_bytes());
        bytes.extend_from_slice(&(sample_rate * channels as u32 * (bits as u32 / 8)).to_le_bytes());
        bytes.extend_from_slice(&(channels * (bits / 8)).to_le_bytes());
        bytes.extend_from_slice(&bits.to_le_bytes());
        bytes.extend_from_slice(b"data");
        bytes.extend_from_slice(&data_size.to_le_bytes());
        bytes.resize(bytes.len() + data_size as usize, 0);
        bytes
    }

    #[test]
    fn parses_wav_metadata() {
        let bytes = tiny_wav(22_050, 1, 16, 22_050);
        let (rate, duration) = wav_metadata(&bytes).unwrap();
        assert_eq!(rate, 22_050);
        assert!((duration - 1.0).abs() < 0.001);
    }

    #[test]
    fn rejects_non_wav() {
        assert!(wav_metadata(b"not a wav").is_none());
    }

    #[test]
    fn resolves_default_model_when_present() {
        if Path::new("C:/piper/pt_BR-faber-medium.onnx").is_file() {
            assert!(resolve_model("").is_ok());
        }
    }
}
