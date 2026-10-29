use crate::piper::probe_wav;
use framechester_core::config::TtsConfig;
use framechester_core::domain::TtsAudio;
use framechester_core::error::{FramechesterError, Result};
use framechester_core::ports::{AdapterInfo, TtsEngine, TtsRequest};
use std::io::Write;
use std::process::{Command, Stdio};

const HELPER: &str = include_str!("../../../scripts/kokoro_tts.py");
pub const COMMERCIAL_VOICES: [&str; 3] = ["pf_dora", "pm_alex", "pm_santa"];

pub struct KokoroTts {
    config: TtsConfig,
}

impl KokoroTts {
    pub fn new(config: &TtsConfig) -> Result<Self> {
        if config.engine != "kokoro" || !COMMERCIAL_VOICES.contains(&config.voice_name.as_str()) {
            return Err(FramechesterError::InvalidInput(
                "voz sem aprovacao comercial: escolha Dora, Alex ou Santa (Kokoro) nas configuracoes; Piper legado esta bloqueado".into(),
            ));
        }
        let instance = Self {
            config: config.clone(),
        };
        let result = instance
            .command()
            .arg("--check")
            .output()
            .map_err(|error| {
                FramechesterError::Unavailable(format!(
                    "Python do Kokoro indisponivel ({error}); execute npm run voices:setup"
                ))
            })?;
        if !result.status.success() {
            return Err(FramechesterError::InvalidInput(
                String::from_utf8_lossy(&result.stderr)
                    .chars()
                    .take(600)
                    .collect(),
            ));
        }
        Ok(instance)
    }

    fn command(&self) -> Command {
        let mut command = Command::new(&self.config.python_path);
        command.args([
            "-c",
            HELPER,
            "--model",
            &self.config.voice_model,
            "--voices",
            &self.config.voice_styles,
            "--voice",
            &self.config.voice_name,
        ]);
        command
    }
}

impl TtsEngine for KokoroTts {
    fn info(&self) -> AdapterInfo {
        AdapterInfo::local("kokoro-onnx-pt-br", "Kokoro-82M v1.0 model/voices Apache-2.0; kokoro-onnx MIT; phonemizer/eSpeak GPL-3.0-or-later")
    }

    fn synthesize(&self, request: &TtsRequest) -> Result<TtsAudio> {
        if request.voice != self.config.voice_name || request.text.trim().is_empty() {
            return Err(FramechesterError::InvalidInput(
                "voz diferente da configuracao aprovada ou narracao vazia".into(),
            ));
        }
        let mut child = self
            .command()
            .arg("--output")
            .arg(&request.output)
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            .spawn()?;
        let mut input = child.stdin.take().ok_or_else(|| {
            FramechesterError::External("entrada do narrador indisponivel".into())
        })?;
        input.write_all(request.text.as_bytes())?;
        drop(input);
        let result = child.wait_with_output()?;
        if !result.status.success() {
            return Err(FramechesterError::External(format!(
                "narracao comercial bloqueada: {}",
                String::from_utf8_lossy(&result.stderr)
                    .chars()
                    .take(600)
                    .collect::<String>()
            )));
        }
        let (sample_rate, duration_secs) = probe_wav(&request.output).ok_or_else(|| {
            FramechesterError::External("narrador nao produziu WAV valido".into())
        })?;
        Ok(TtsAudio {
            scene_id: request.scene_id,
            path: request.output.clone(),
            duration_secs,
            sample_rate,
            voice: self.config.voice_name.clone(),
        })
    }

    fn synthesize_batch(&self, requests: &[TtsRequest]) -> Result<Vec<TtsAudio>> {
        if requests.is_empty() {
            return Ok(Vec::new());
        }
        if requests.iter().any(|request| {
            request.voice != self.config.voice_name || request.text.trim().is_empty()
        }) {
            return Err(FramechesterError::InvalidInput(
                "voz diferente da configuracao aprovada ou narracao vazia no lote".into(),
            ));
        }
        let payload = serde_json::to_vec(
            &requests
                .iter()
                .map(
                    |request| serde_json::json!({ "text": request.text, "output": request.output }),
                )
                .collect::<Vec<_>>(),
        )?;
        let mut child = self
            .command()
            .arg("--batch")
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            .spawn()?;
        let mut input = child.stdin.take().ok_or_else(|| {
            FramechesterError::External("entrada do narrador indisponivel".into())
        })?;
        input.write_all(&payload)?;
        drop(input);
        let result = child.wait_with_output()?;
        if !result.status.success() {
            return Err(FramechesterError::External(format!(
                "narracao em lote falhou: {}",
                String::from_utf8_lossy(&result.stderr)
                    .chars()
                    .take(600)
                    .collect::<String>()
            )));
        }
        requests
            .iter()
            .map(|request| {
                let (sample_rate, duration_secs) = probe_wav(&request.output).ok_or_else(|| {
                    FramechesterError::External(format!(
                        "narrador nao produziu WAV valido para {}",
                        request.output.display()
                    ))
                })?;
                Ok(TtsAudio {
                    scene_id: request.scene_id,
                    path: request.output.clone(),
                    duration_secs,
                    sample_rate,
                    voice: self.config.voice_name.clone(),
                })
            })
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn unknown_voices_and_legacy_engines_fail_before_python() {
        for (engine, voice) in [
            ("piper", "pf_dora"),
            ("kokoro", "pt_BR-faber-medium"),
            ("kokoro", "unreviewed"),
        ] {
            let config = TtsConfig {
                engine: engine.into(),
                voice_name: voice.into(),
                python_path: "nonexistent-python".into(),
                ..TtsConfig::default()
            };
            assert!(KokoroTts::new(&config)
                .err()
                .unwrap()
                .to_string()
                .contains("comercial"));
        }
    }
}
