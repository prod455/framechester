//! Openverse audio search (`GET /v1/audio/`), a Creative Commons catalog that indexes
//! Jamendo, Freesound, ccMixter and others. Anonymous access works with a lower rate
//! limit. The search asks only for the codes `music::CcLicense::MONETIZABLE` clears, and
//! every hit is checked again here, since the catalog's filter is not our gate.
//!
//! A CC license is not a Content ID whitelist: a CC track can still be claimed if its
//! author registered it with a distributor. The landing URL is kept so a claim can be
//! disputed with the license, and docs/CANAIS_MUSICA.md tells the operator to check.
use framechester_core::error::{FramechesterError, Result};
use framechester_core::music::{CcLicense, TrackSource};
use serde_json::Value;
use std::time::Duration;

const USER_AGENT: &str = "framechester/0.1 (+https://github.com/prod455/framechester)";
const MAX_AUDIO_BYTES: u64 = 200 * 1024 * 1024;

#[derive(Debug, Clone, PartialEq)]
pub struct OpenverseHit {
    pub id: String,
    pub title: String,
    pub creator: String,
    pub license: CcLicense,
    pub license_version: Option<String>,
    pub license_url: Option<String>,
    pub landing_url: String,
    pub audio_url: String,
    pub provider: String,
    pub filetype: Option<String>,
    /// Catalog value; the real length comes from ffprobe after download.
    pub duration_secs: Option<f32>,
}

impl OpenverseHit {
    pub fn source(&self) -> TrackSource {
        TrackSource::Library {
            provider: format!("openverse/{}", self.provider),
            source_id: self.id.clone(),
            landing_url: self.landing_url.clone(),
            creator: self.creator.clone(),
            license: self.license,
            license_version: self.license_version.clone(),
            license_url: self.license_url.clone(),
        }
    }
}

pub fn search_params(query: &str, page_size: u32) -> Vec<(&'static str, String)> {
    let licenses: Vec<&str> = CcLicense::MONETIZABLE.iter().map(|l| l.code()).collect();
    vec![
        ("q", query.trim().to_string()),
        ("license", licenses.join(",")),
        ("category", "music".into()),
        ("mature", "false".into()),
        ("page_size", page_size.clamp(1, 20).to_string()),
    ]
}

fn text(value: &Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .map(str::to_string)
}

/// Hits that can be used, and for each discarded one the reason.
pub fn parse_search(value: &Value) -> (Vec<OpenverseHit>, Vec<String>) {
    let mut hits = Vec::new();
    let mut skipped = Vec::new();
    for item in value
        .get("results")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        let id = text(item, "id").unwrap_or_else(|| "?".into());
        let license = text(item, "license").and_then(|code| CcLicense::parse(&code));
        let reason = match (
            &license,
            text(item, "url"),
            text(item, "foreign_landing_url"),
        ) {
            _ if item.get("mature").and_then(Value::as_bool) == Some(true) => {
                Some("conteudo adulto")
            }
            (None, _, _) => Some("licenca desconhecida"),
            (Some(license), _, _) if !CcLicense::MONETIZABLE.contains(license) => {
                Some("licenca nao monetizavel")
            }
            (_, None, _) => Some("sem URL de audio"),
            (_, _, None) => Some("sem pagina de origem"),
            _ => None,
        };
        if let Some(reason) = reason {
            skipped.push(format!("{id}: {reason}"));
            continue;
        }
        hits.push(OpenverseHit {
            title: text(item, "title").unwrap_or_else(|| id.clone()),
            creator: text(item, "creator").unwrap_or_else(|| "autor desconhecido".into()),
            license: license.expect("checked above"),
            license_version: text(item, "license_version"),
            license_url: text(item, "license_url"),
            landing_url: text(item, "foreign_landing_url").expect("checked above"),
            audio_url: text(item, "url").expect("checked above"),
            provider: text(item, "provider").unwrap_or_else(|| "openverse".into()),
            filetype: text(item, "filetype"),
            // Openverse reports audio duration in milliseconds.
            duration_secs: item
                .get("duration")
                .and_then(Value::as_f64)
                .map(|ms| (ms / 1000.0) as f32),
            id,
        });
    }
    (hits, skipped)
}

#[derive(Debug)]
pub struct OpenverseClient {
    base_url: String,
    client: reqwest::blocking::Client,
}

impl OpenverseClient {
    pub fn new(base_url: &str) -> Result<Self> {
        if !base_url.starts_with("https://") {
            return Err(FramechesterError::Config(
                "openverse_url deve usar https".into(),
            ));
        }
        let client = reqwest::blocking::Client::builder()
            .user_agent(USER_AGENT)
            .timeout(Duration::from_secs(120))
            .build()
            .map_err(|error| FramechesterError::Unavailable(error.to_string()))?;
        Ok(Self {
            base_url: base_url.trim_end_matches('/').to_string(),
            client,
        })
    }

    pub fn search(&self, query: &str, page_size: u32) -> Result<(Vec<OpenverseHit>, Vec<String>)> {
        if query.trim().is_empty() {
            return Err(FramechesterError::InvalidInput("busca vazia".into()));
        }
        let value: Value = self
            .client
            .get(format!("{}/v1/audio/", self.base_url))
            .query(&search_params(query, page_size))
            .send()
            .and_then(reqwest::blocking::Response::error_for_status)
            .map_err(|error| FramechesterError::Network(format!("Openverse: {error}")))?
            .json()
            .map_err(|error| FramechesterError::External(format!("Openverse: {error}")))?;
        Ok(parse_search(&value))
    }

    pub fn download(&self, hit: &OpenverseHit) -> Result<Vec<u8>> {
        if !hit.audio_url.starts_with("https://") {
            return Err(FramechesterError::External(format!(
                "audio de {} sem https",
                hit.id
            )));
        }
        let response = self
            .client
            .get(&hit.audio_url)
            .send()
            .and_then(reqwest::blocking::Response::error_for_status)
            .map_err(|error| FramechesterError::Network(format!("baixar {}: {error}", hit.id)))?;
        if response.content_length().unwrap_or(0) > MAX_AUDIO_BYTES {
            return Err(FramechesterError::External(format!(
                "audio de {} grande demais",
                hit.id
            )));
        }
        Ok(response
            .bytes()
            .map_err(|error| FramechesterError::Network(format!("baixar {}: {error}", hit.id)))?
            .to_vec())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn search_asks_only_for_monetizable_music() {
        let params = search_params(" lofi piano ", 50);
        assert!(params.contains(&("q", "lofi piano".into())));
        assert!(params.contains(&("license", "cc0,pdm,by".into())));
        assert!(params.contains(&("category", "music".into())));
        assert!(params.contains(&("page_size", "20".into())));
    }

    #[test]
    fn parse_keeps_cleared_hits_and_explains_the_rest() {
        let value = json!({"result_count": 4, "results": [
            {"id": "a1", "title": "Rain Loop", "creator": "Ana", "license": "by", "license_version": "4.0",
             "license_url": "https://creativecommons.org/licenses/by/4.0/", "foreign_landing_url": "https://www.jamendo.com/track/1",
             "url": "https://prod-1.storage.jamendo.com/?trackid=1", "provider": "jamendo", "filetype": "mp3", "duration": 185000, "mature": false},
            {"id": "a2", "title": "NC", "license": "by-nc", "url": "https://x.org/a.mp3", "foreign_landing_url": "https://x.org/a"},
            {"id": "a3", "title": "No url", "license": "cc0", "foreign_landing_url": "https://x.org/b"},
            {"id": "a4", "title": "Adult", "license": "cc0", "url": "https://x.org/c.mp3", "foreign_landing_url": "https://x.org/c", "mature": true}
        ]});
        let (hits, skipped) = parse_search(&value);
        assert_eq!(hits.len(), 1);
        let hit = &hits[0];
        assert_eq!(hit.license, CcLicense::By);
        assert_eq!(hit.duration_secs, Some(185.0));
        assert!(
            matches!(hit.source(), TrackSource::Library { ref provider, .. } if provider == "openverse/jamendo")
        );
        assert_eq!(skipped.len(), 3);
        assert!(skipped[0].contains("nao monetizavel"));
        assert!(skipped[1].contains("sem URL"));
        assert!(skipped[2].contains("adulto"));
    }
}
