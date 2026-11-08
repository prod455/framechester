use crate::channel::ChannelProfile;
use crate::domain::RenderProfile;
use crate::error::{FramechesterError, Result};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Config {
    pub channels: Vec<ChannelProfile>,
    pub app: AppConfig,
    pub render: RenderConfig,
    pub tts: TtsConfig,
    pub llm: LlmConfig,
    pub publish: PublishConfig,
    pub backup: BackupConfig,
    pub asr: AsrConfig,
    pub audio: AudioConfig,
    pub motion: MotionConfig,
}

/// Soundtrack export targets of the motion engine. Loudness values are editorial
/// starting points subject to listening tests, not platform guarantees.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct AudioConfig {
    pub target_lufs: f32,
    pub true_peak_dbtp: f32,
    pub loudness_range_lu: f32,
    /// Optional licensed music bed (local file); empty means no music.
    pub music_path: String,
    pub music_gain_db: f32,
    pub transition_sfx: bool,
    /// Linear gain of the procedural transition sound (0..1).
    pub sfx_gain: f32,
}

impl Default for AudioConfig {
    fn default() -> Self {
        Self {
            target_lufs: -14.0,
            true_peak_dbtp: -1.5,
            loudness_range_lu: 9.0,
            music_path: String::new(),
            music_gain_db: -22.0,
            transition_sfx: true,
            sfx_gain: 0.22,
        }
    }
}

/// Motion engine settings.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct MotionConfig {
    /// Rasterization threads; 0 uses every CPU up to eight.
    pub threads: usize,
    /// Enables the motion engine for `run`; the legacy still-image renderer stays default.
    pub enabled: bool,
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
    pub engine: String,
    pub python_path: String,
    pub voice_styles: String,
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
        let container = std::env::var("FRAMECHESTER_CONTAINER").as_deref() == Ok("1")
            && Path::new("/.dockerenv").is_file();
        Self {
            engine: "kokoro".into(),
            python_path: if container {
                "/opt/tts/bin/python"
            } else if cfg!(windows) {
                ".framechester/tts-venv/Scripts/python.exe"
            } else {
                ".framechester/tts-venv/bin/python"
            }
            .into(),
            voice_styles: if container {
                "/models/kokoro/voices-v1.0.bin"
            } else {
                "models/kokoro/voices-v1.0.bin"
            }
            .into(),
            piper_path: "piper".into(),
            voice_model: if container {
                "/models/kokoro/kokoro-v1.0.onnx"
            } else {
                "models/kokoro/kokoro-v1.0.onnx"
            }
            .into(),
            voice_name: "pf_dora".into(),
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
        let mut channel_ids = std::collections::HashSet::new();
        let mut platform_ids = std::collections::HashSet::new();
        for channel in &self.channels {
            channel.validate()?;
            if !channel_ids.insert(&channel.id)
                || channel
                    .youtube_channel_id
                    .as_ref()
                    .is_some_and(|id| !platform_ids.insert(id))
            {
                return Err(FramechesterError::Config(
                    "canal duplicado na configuracao".into(),
                ));
            }
        }
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
        if !(-30.0..=-8.0).contains(&self.audio.target_lufs)
            || !(-6.0..=0.0).contains(&self.audio.true_peak_dbtp)
            || !(0.0..=1.0).contains(&self.audio.sfx_gain)
        {
            return Err(FramechesterError::Config(
                "audio.target_lufs entre -30 e -8, true_peak_dbtp entre -6 e 0, sfx_gain entre 0 e 1".into(),
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

    pub fn render_profile_for(&self, format: crate::domain::ScriptFormat) -> RenderProfile {
        let mut profile = self.render_profile();
        let should_swap = match format {
            crate::domain::ScriptFormat::Short => profile.width > profile.height,
            crate::domain::ScriptFormat::Long => profile.width < profile.height,
        };
        if should_swap {
            std::mem::swap(&mut profile.width, &mut profile.height);
        }
        profile
    }

    pub fn workdir_path(&self) -> PathBuf {
        self.app.workdir.clone()
    }

    pub fn select_channel(&self, id: Option<&str>) -> Result<Option<ChannelProfile>> {
        self.validate()?;
        match id {
            Some(id) => self
                .channels
                .iter()
                .find(|channel| channel.id == id)
                .cloned()
                .map(Some)
                .ok_or_else(|| {
                    FramechesterError::Config("canal nao cadastrado; confira --channel".into())
                }),
            None if self.channels.is_empty() => Ok(None),
            None => Err(FramechesterError::Config(
                "selecione --channel para uma operacao multicanais".into(),
            )),
        }
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
    fn audio_targets_default_to_minus_14_lufs_and_are_bounded() {
        let config = Config::default();
        assert_eq!(config.audio.target_lufs, -14.0);
        assert_eq!(config.audio.true_peak_dbtp, -1.5);
        assert!(!config.motion.enabled);
        let mut invalid = Config::default();
        invalid.audio.true_peak_dbtp = 1.0;
        assert!(invalid.validate().is_err());
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

    #[test]
    fn registered_channels_require_explicit_selection() {
        let config =
            Config::from_toml("[[channels]]\nid = 'tech'\n[[channels]]\nid = 'science'\n").unwrap();
        assert!(config.select_channel(None).is_err());
        assert!(config.select_channel(Some("missing")).is_err());
        assert_eq!(
            config.select_channel(Some("science")).unwrap().unwrap().id,
            "science"
        );
        assert!(Config::default().select_channel(None).unwrap().is_none());
    }

    #[test]
    fn duplicate_or_unsafe_channel_identities_are_rejected() {
        for text in [
            "[[channels]]\nid = 'tech'\n[[channels]]\nid = 'tech'\n",
            "[[channels]]\nid = '../escape'\n",
            "[[channels]]\nid = 'tech'\nyoutube_channel_id = 'synthetic-id'\n[[channels]]\nid = 'science'\nyoutube_channel_id = 'synthetic-id'\n",
        ] {
            assert!(Config::from_toml(text).is_err());
        }
    }

    #[test]
    fn short_profile_is_vertical_and_long_profile_is_horizontal() {
        use crate::domain::ScriptFormat;
        let mut config = Config::default();
        let short = config.render_profile_for(ScriptFormat::Short);
        assert_eq!((short.width, short.height), (1080, 1920));
        let long = config.render_profile_for(ScriptFormat::Long);
        assert_eq!((long.width, long.height), (1920, 1080));
        config.render.width = 720;
        config.render.height = 1280;
        let long = config.render_profile_for(ScriptFormat::Long);
        assert_eq!((long.width, long.height), (1280, 720));
    }
}
