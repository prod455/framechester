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
    /// Visual look of the channel's videos; absent means the default (`noite`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub look: Option<crate::storyboard::Look>,
    /// The channel's mascot and recurring cast (`[channels.identity]`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub identity: Option<crate::storyboard::Identity>,
    /// Affiliate links the description may carry (`[[channels.affiliates]]`).
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub affiliates: Vec<AffiliateLink>,
}

/// An affiliate link and the terms that make it relevant: the description lists it only
/// when one of `terms` is said or written in the video, so a link never appears on a
/// video that does not talk about it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AffiliateLink {
    pub label: String,
    pub url: String,
    pub terms: Vec<String>,
}

pub const MAX_AFFILIATES: usize = 10;
pub const MAX_AFFILIATE_TERMS: usize = 10;

fn single_line(text: &str, min: usize, max: usize) -> bool {
    let length = text.trim().chars().count();
    (min..=max).contains(&length) && !text.chars().any(char::is_control)
}

impl AffiliateLink {
    pub fn validate(&self) -> Result<()> {
        let url_ok = self.url.starts_with("https://")
            && self.url.len() > "https://".len()
            && self.url.len() <= 500
            && !self
                .url
                .chars()
                .any(|c| c.is_whitespace() || c.is_control());
        if !single_line(&self.label, 1, 80)
            || !url_ok
            || self.terms.is_empty()
            || self.terms.len() > MAX_AFFILIATE_TERMS
            || !self.terms.iter().all(|term| single_line(term, 2, 40))
        {
            return Err(FramechesterError::Config(format!(
                "link de afiliado invalido: nome de 1 a 80 caracteres, URL https de ate 500 e 1 a {MAX_AFFILIATE_TERMS} termos de 2 a 40"
            )));
        }
        Ok(())
    }

    /// Whether any term appears in `text` as whole words, ignoring case.
    pub fn matches(&self, text: &str) -> bool {
        let text = text.to_lowercase();
        self.terms.iter().any(|term| {
            let term = term.trim().to_lowercase();
            text.match_indices(&term).any(|(start, found)| {
                let before = text[..start].chars().next_back();
                let after = text[start + found.len()..].chars().next();
                !before.is_some_and(char::is_alphanumeric)
                    && !after.is_some_and(char::is_alphanumeric)
            })
        })
    }
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
        if let Some(identity) = &self.identity {
            identity
                .validate()
                .map_err(|error| FramechesterError::Config(error.to_string()))?;
        }
        if self.affiliates.len() > MAX_AFFILIATES {
            return Err(FramechesterError::Config(format!(
                "no maximo {MAX_AFFILIATES} links de afiliado por canal"
            )));
        }
        for link in &self.affiliates {
            link.validate()?;
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
            look: None,
            identity: None,
            affiliates: Vec::new(),
        }
    }

    #[test]
    fn the_studio_identity_toml_reads_as_the_channel_mascot_and_cast() {
        #[derive(Deserialize)]
        struct File {
            channels: Vec<ChannelProfile>,
        }
        // Exactly what web/server/runner.ts writes.
        let text = "[[channels]]\nid = \"tech\"\nlanguage = \"pt-BR\"\nlook = \"papel\"\n[channels.identity]\nbody = \"purple\"\nshape = \"tall\"\n[[channels.identity.cast]]\nname = \"Bit\"\nhat = \"glasses\"\n";
        let file: File = toml::from_str(text).unwrap();
        let identity = file.channels[0].identity.clone().unwrap();
        assert_eq!(identity.body, crate::storyboard::MascotBody::Purple);
        assert_eq!(identity.shape, crate::storyboard::MascotShape::Tall);
        assert_eq!(identity.cast[0].hat, crate::storyboard::Hat::Glasses);
        assert!(file.channels[0].validate().is_ok());
        let crowded = ChannelProfile {
            identity: Some(crate::storyboard::Identity {
                cast: ["a", "b", "c", "d"]
                    .iter()
                    .map(|name| crate::storyboard::CastMember {
                        name: (*name).into(),
                        hat: Default::default(),
                    })
                    .collect(),
                ..Default::default()
            }),
            ..profile("tech")
        };
        assert!(crowded.validate().is_err());
    }

    #[test]
    fn a_channel_speaks_one_of_the_languages_with_a_reviewed_voice() {
        assert_eq!(profile("tech").language(), "pt-BR");
        for language in LANGUAGES {
            let channel = ChannelProfile {
                language: Some(language.into()),
                look: None,
                ..profile("tech")
            };
            assert!(channel.validate().is_ok());
            assert_eq!(channel.language(), language);
        }
        for language in ["de-DE", "en", "pt-br", ""] {
            let channel = ChannelProfile {
                language: Some(language.into()),
                look: None,
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

    #[test]
    fn affiliate_links_match_whole_words_and_validate() {
        let link = AffiliateLink {
            label: "The Psychology of Money (book)".into(),
            url: "https://www.amazon.com/dp/0857197681?tag=example-20".into(),
            terms: vec!["compound interest".into(), "Rule of 72".into()],
        };
        assert!(link.validate().is_ok());
        assert!(link.matches("By the rule of 72, money doubles."));
        assert!(link.matches("Compound interest, explained"));
        assert!(!link.matches("Rule of 720 is not a thing"));
        assert!(!link.matches("Simple interest only"));
        for bad in [
            AffiliateLink {
                url: "http://amazon.com/x".into(),
                ..link.clone()
            },
            AffiliateLink {
                url: "https://a b".into(),
                ..link.clone()
            },
            AffiliateLink {
                label: String::new(),
                ..link.clone()
            },
            AffiliateLink {
                label: "a\nb".into(),
                ..link.clone()
            },
            AffiliateLink {
                terms: vec![],
                ..link.clone()
            },
            AffiliateLink {
                terms: vec!["x".into()],
                ..link.clone()
            },
        ] {
            assert!(bad.validate().is_err(), "{bad:?}");
        }
        let mut channel = profile("money");
        channel.affiliates = vec![link.clone(); MAX_AFFILIATES + 1];
        assert!(channel.validate().is_err());
        channel.affiliates.truncate(1);
        assert!(channel.validate().is_ok());
    }

    #[test]
    fn the_studio_affiliates_toml_reads_as_channel_links() {
        #[derive(Deserialize)]
        struct File {
            channels: Vec<ChannelProfile>,
        }
        // Exactly what web/server/runner.ts writes.
        let text = "[[channels]]\nid = \"money\"\nlanguage = \"en-US\"\n[[channels.affiliates]]\nlabel = \"Book\"\nurl = \"https://example.com/b\"\nterms = [\"budget\", \"index fund\"]\n";
        let file: File = toml::from_str(text).unwrap();
        assert_eq!(file.channels[0].affiliates[0].terms[1], "index fund");
        assert!(file.channels[0].validate().is_ok());
    }
}
