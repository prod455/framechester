use crate::domain::RenderProfile;
use crate::error::{FramechesterError, Result};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Config {
    pub app: AppConfig,
    pub render: RenderConfig,
    pub tts: TtsConfig,
    pub llm: LlmConfig,
    pub publish: PublishConfig,
    pub backup: BackupConfig,
    pub asr: AsrConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct AppConfig {
    pub locale: String,
    pub dry_run: bool,
    pub telemetry: bool,
    pub workdir: PathBuf,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct RenderConfig {
    pub ffmpeg_path: String,
    pub ffprobe_path: String,
    pub width: u32,
    pub height: u32,
    pub fps: u32,
    pub video_codec: String,
    pub crf: u32,
    pub preset: String,
    pub audio_bitrate_kbps: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct TtsConfig {
    pub piper_path: String,
    pub voice_model: String,
    pub voice_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct LlmConfig {
    pub provider: String,
    pub model: String,
    pub api_key_env: String,
    pub base_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct PublishConfig {
    pub enabled: bool,
    pub network: String,
    pub privacy: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct BackupConfig {
    pub enabled: bool,
    pub provider: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct AsrConfig {
    pub enabled: bool,
    pub model: String,
    pub language: String,
    pub min_coverage: f32,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            locale: "pt-BR".into(),
            dry_run: true,
            telemetry: false,
            workdir: PathBuf::from("artifacts"),
        }
    }
}

impl Default for RenderConfig {
    fn default() -> Self {
        Self {
            ffmpeg_path: "ffmpeg".into(),
            ffprobe_path: "ffprobe".into(),
            width: 1920,
            height: 1080,
            fps: 30,
            video_codec: "libx264".into(),
            crf: 20,
            preset: "veryfast".into(),
            audio_bitrate_kbps: 160,
        }
    }
}

impl Default for TtsConfig {
    fn default() -> Self {
        Self {
            piper_path: "piper".into(),
            voice_model: String::new(),
            voice_name: "pt_BR-faber-medium".into(),
        }
    }
}

impl Default for LlmConfig {
    fn default() -> Self {
        Self {
            provider: "template".into(),
            model: String::new(),
            api_key_env: "ANTHROPIC_API_KEY".into(),
            base_url: "https://api.anthropic.com".into(),
        }
    }
}

impl Default for PublishConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            network: "youtube".into(),
            privacy: "private".into(),
        }
    }
}

impl Default for BackupConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            provider: "b2".into(),
        }
    }
}

impl Default for AsrConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            model: "C:/whisper/models/ggml-base.bin".into(),
            language: "pt".into(),
            min_coverage: 0.45,
        }
    }
}

impl Config {
    pub fn load(path: &Path) -> Result<Self> {
        let text = std::fs::read_to_string(path)
            .map_err(|error| FramechesterError::Config(format!("{}: {error}", path.display())))?;
        let config: Config = toml::from_str(&text)
            .map_err(|error| FramechesterError::Config(format!("{}: {error}", path.display())))?;
        config.validate()?;
        Ok(config)
    }

    pub fn load_or_default(path: Option<&Path>) -> Result<Self> {
        match path {
            Some(path) => Self::load(path),
            None => {
                let config = Config::default();
                config.validate()?;
                Ok(config)
            }
        }
    }

    pub fn validate(&self) -> Result<()> {
        if self.app.telemetry {
            return Err(FramechesterError::Config(
                "telemetry deve permanecer false; nenhum envio remoto e implementado".into(),
            ));
        }
        if self.render.width == 0 || self.render.height == 0 || self.render.fps == 0 {
            return Err(FramechesterError::Config(
                "width, height e fps devem ser maiores que zero".into(),
            ));
        }
        if self.render.width % 2 != 0 || self.render.height % 2 != 0 {
            return Err(FramechesterError::Config(
                "width e height devem ser pares para yuv420p".into(),
            ));
        }
        if self.render.crf > 51 {
            return Err(FramechesterError::Config(
                "crf deve estar entre 0 e 51".into(),
            ));
        }
        if !matches!(
            self.publish.privacy.as_str(),
            "private" | "unlisted" | "public"
        ) {
            return Err(FramechesterError::Config(
                "publish.privacy deve ser private, unlisted ou public".into(),
            ));
        }
        if !matches!(
            self.publish.network.as_str(),
            "youtube" | "tiktok" | "facebook"
        ) {
            return Err(FramechesterError::Config(
                "publish.network deve ser youtube, tiktok ou facebook".into(),
            ));
        }
        if !(0.0..=1.0).contains(&self.asr.min_coverage) {
            return Err(FramechesterError::Config(
                "asr.min_coverage deve estar entre 0 e 1".into(),
            ));
        }
        if self.asr.language.trim().is_empty() {
            return Err(FramechesterError::Config(
                "asr.language nao pode ser vazio".into(),
            ));
        }
        if !matches!(self.llm.provider.as_str(), "template" | "anthropic") {
            return Err(FramechesterError::Config(
                "llm.provider deve ser template ou anthropic".into(),
            ));
        }
        Ok(())
    }

    pub fn render_profile(&self) -> RenderProfile {
        RenderProfile {
            width: self.render.width,
            height: self.render.height,
            fps: self.render.fps,
            video_codec: self.render.video_codec.clone(),
            crf: self.render.crf,
            preset: self.render.preset.clone(),
            audio_bitrate_kbps: self.render.audio_bitrate_kbps,
        }
    }

    pub fn workdir_path(&self) -> PathBuf {
        self.app.workdir.clone()
    }

    pub fn to_pretty_json(&self) -> Result<String> {
        Ok(serde_json::to_string_pretty(self)?)
    }
}

impl Config {
    pub fn from_toml(text: &str) -> Result<Self> {
        let config: Config =
            toml::from_str(text).map_err(|error| FramechesterError::Config(error.to_string()))?;
        config.validate()?;
        Ok(config)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_is_dry_run_and_telemetry_off() {
        let config = Config::default();
        assert!(config.app.dry_run);
        assert!(!config.app.telemetry);
        assert!(!config.publish.enabled);
        assert!(!config.backup.enabled);
    }

    #[test]
    fn telemetry_true_is_rejected() {
        let mut config = Config::default();
        config.app.telemetry = true;
        assert!(config.validate().is_err());
    }

    #[test]
    fn partial_toml_uses_defaults() {
        let config = Config::from_toml("[app]\ndry_run = true\n").unwrap();
        assert_eq!(config.render.width, 1920);
        assert_eq!(config.publish.network, "youtube");
    }

    #[test]
    fn odd_dimensions_are_rejected() {
        let mut config = Config::default();
        config.render.width = 1921;
        assert!(config.validate().is_err());
        config.render.width = 1920;
        config.render.height = 1081;
        assert!(config.validate().is_err());
    }

    #[test]
    fn asr_defaults_off_and_coverage_is_validated() {
        let config = Config::default();
        assert!(!config.asr.enabled);
        let mut invalid = Config::default();
        invalid.asr.min_coverage = 1.5;
        assert!(invalid.validate().is_err());
        let mut empty_language = Config::default();
        empty_language.asr.language = " ".into();
        assert!(empty_language.validate().is_err());
    }

    #[test]
    fn invalid_privacy_is_rejected() {
        let mut config = Config::default();
        config.publish.privacy = "everyone".into();
        assert!(config.validate().is_err());
    }

    #[test]
    fn render_profile_matches_config() {
        let mut config = Config::default();
        config.render.width = 1280;
        config.render.height = 720;
        let profile = config.render_profile();
        assert_eq!(profile.width, 1280);
        assert_eq!(profile.height, 720);
    }
}
