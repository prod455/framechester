use crate::error::{FramechesterError, Result};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

/// Local channel identity. Credentials and account state are not stored here.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ChannelProfile {
    pub id: String,
    #[serde(default)]
    pub youtube_channel_id: Option<String>,
    /// Narration and publishing language; absent means pt-BR, the language channels started with.
    #[serde(default)]
    pub language: Option<String>,
}

/// Languages with a reviewed commercial voice; the description template follows the same list.
pub const LANGUAGES: [&str; 3] = ["pt-BR", "en-US", "es"];

impl ChannelProfile {
    pub fn validate(&self) -> Result<()> {
        let id = self.id.as_str();
        let reserved = matches!(id, "con" | "prn" | "aux" | "nul")
            || (id.len() == 4
                && (id.starts_with("com") || id.starts_with("lpt"))
                && matches!(id.as_bytes()[3], b'1'..=b'9'));
        let alphanumeric = |byte: u8| byte.is_ascii_lowercase() || byte.is_ascii_digit();
        if id.is_empty()
            || id.len() > 64
            || reserved
            || !id.bytes().all(|byte| alphanumeric(byte) || byte == b'-')
            || !id.bytes().next().is_some_and(alphanumeric)
            || !id.bytes().last().is_some_and(alphanumeric)
        {
            return Err(FramechesterError::Config(
                "channel.id deve ser slug de 1 a 64 caracteres a-z, 0-9 e hifen, sem nomes reservados".into(),
            ));
        }
        if let Some(platform_id) = &self.youtube_channel_id {
            if platform_id.is_empty()
                || platform_id.len() > 128
                || !platform_id
                    .bytes()
                    .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-'))
            {
                return Err(FramechesterError::Config(
                    "youtube_channel_id invalido".into(),
                ));
            }
        }
        if let Some(language) = &self.language {
            if !LANGUAGES.contains(&language.as_str()) {
                return Err(FramechesterError::Config(
                    "language deve ser pt-BR, en-US ou es".into(),
                ));
            }
        }
        Ok(())
    }

    pub fn language(&self) -> &str {
        self.language.as_deref().unwrap_or("pt-BR")
    }

    pub fn scoped_workdir(&self, root: &Path) -> Result<PathBuf> {
        self.validate()?;
        Ok(root.join("channels").join(&self.id))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn profile(id: &str) -> ChannelProfile {
        ChannelProfile {
            id: id.into(),
            youtube_channel_id: None,
            language: None,
        }
    }

    #[test]
    fn a_channel_speaks_one_of_the_languages_with_a_reviewed_voice() {
        assert_eq!(profile("tech").language(), "pt-BR");
        for language in LANGUAGES {
            let channel = ChannelProfile {
                language: Some(language.into()),
                ..profile("tech")
            };
            assert!(channel.validate().is_ok());
            assert_eq!(channel.language(), language);
        }
        for language in ["de-DE", "en", "pt-br", ""] {
            let channel = ChannelProfile {
                language: Some(language.into()),
                ..profile("tech")
            };
            assert!(channel.validate().is_err(), "{language}");
        }
        let parsed: ChannelProfile = toml::from_str("id = 'tech'\nlanguage = 'en-US'").unwrap();
        assert_eq!(parsed.language(), "en-US");
    }

    #[test]
    fn channels_have_disjoint_output_directories_under_the_same_root() {
        let root = Path::new("artifacts/pilot");
        let tech = profile("tech").scoped_workdir(root).unwrap();
        let science = profile("science").scoped_workdir(root).unwrap();
        assert_eq!(tech, root.join("channels/tech"));
        assert_eq!(science, root.join("channels/science"));
        assert_ne!(tech, science);
    }

    #[test]
    fn traversal_absolute_paths_case_aliases_and_windows_devices_are_rejected() {
        for id in [
            "",
            "../science",
            "tech/other",
            "C:\\temp",
            "tech\\other",
            "TECH",
            "tech.",
            "con",
            "com1",
            "lpt9",
            "-tech",
            "tech-",
        ] {
            assert!(
                profile(id).scoped_workdir(Path::new("artifacts")).is_err(),
                "accepted: {id}"
            );
        }
        assert!(profile(&"a".repeat(65)).validate().is_err());
        assert!(profile("tech-2").validate().is_ok());
    }
}
