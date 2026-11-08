//! Music for faceless music channels: where each track came from, whether that origin
//! clears monetized use, and the tracklist, chapters and credits of a long mix.
//!
//! A track is only usable through [`MusicTrack::clearance`]. Its license is derived from
//! its source, never typed by the operator: a generated track takes the license of the
//! model family that made it, a library track the Creative Commons code its catalog
//! declared. Anything not on the short allow list is refused with the reason.
use crate::error::{FramechesterError, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::PathBuf;

/// Creative Commons codes as catalogs (Openverse) spell them.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum CcLicense {
    Cc0,
    /// Public Domain Mark: no known copyright.
    Pdm,
    By,
    BySa,
    ByNc,
    ByNd,
    ByNcSa,
    ByNcNd,
}

impl CcLicense {
    pub fn parse(code: &str) -> Option<Self> {
        Some(match code.trim().to_ascii_lowercase().as_str() {
            "cc0" => Self::Cc0,
            "pdm" => Self::Pdm,
            "by" => Self::By,
            "by-sa" => Self::BySa,
            "by-nc" => Self::ByNc,
            "by-nd" => Self::ByNd,
            "by-nc-sa" => Self::ByNcSa,
            "by-nc-nd" => Self::ByNcNd,
            _ => return None,
        })
    }

    pub fn label(self) -> &'static str {
        match self {
            Self::Cc0 => "CC0",
            Self::Pdm => "Public Domain Mark",
            Self::By => "CC BY",
            Self::BySa => "CC BY-SA",
            Self::ByNc => "CC BY-NC",
            Self::ByNd => "CC BY-ND",
            Self::ByNcSa => "CC BY-NC-SA",
            Self::ByNcNd => "CC BY-NC-ND",
        }
    }

    /// Codes a catalog search should ask for: the only ones [`clearance`] accepts.
    pub const MONETIZABLE: [CcLicense; 3] = [Self::Cc0, Self::Pdm, Self::By];

    pub fn code(self) -> &'static str {
        match self {
            Self::Cc0 => "cc0",
            Self::Pdm => "pdm",
            Self::By => "by",
            Self::BySa => "by-sa",
            Self::ByNc => "by-nc",
            Self::ByNd => "by-nd",
            Self::ByNcSa => "by-nc-sa",
            Self::ByNcNd => "by-nc-nd",
        }
    }
}

/// Local generators whose code and weights allow commercial use of the output, checked
/// against the primary source on the date noted. Matching is by model-name prefix, as
/// the generator reports it, lowercase.
///
/// ACE-Step 1.5: MIT, README of github.com/ace-step/ACE-Step-1.5, read 2026-11-08; the
/// card states generated music may be used commercially. Its DiT models are named
/// `acestep-v15-*` and its planner LMs `acestep-5hz-lm-*`.
pub const GENERATOR_MODELS: [(&str, &str); 2] = [("acestep-v15", "MIT"), ("acestep-5hz-lm", "MIT")];

/// The license of a known generator model, or `None` for a model this list never vetted.
pub fn generator_license(model: &str) -> Option<&'static str> {
    let model = model.trim().to_ascii_lowercase();
    GENERATOR_MODELS
        .iter()
        .find(|(prefix, _)| model.starts_with(prefix))
        .map(|(_, license)| *license)
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum TrackSource {
    /// Generated on the operator's machine.
    Generated {
        engine: String,
        /// Every model the generator reported using (DiT, planner LM...).
        models: Vec<String>,
        prompt: String,
        seed: i64,
    },
    /// Downloaded from a Creative Commons catalog.
    Library {
        provider: String,
        source_id: String,
        landing_url: String,
        creator: String,
        license: CcLicense,
        license_version: Option<String>,
        license_url: Option<String>,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum Clearance {
    /// Usable in a monetized video; `attribution` must go in the description when present.
    Clear {
        attribution: Option<String>,
    },
    Refused(String),
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct MusicTrack {
    /// Slug, unique in the channel library.
    pub id: String,
    pub title: String,
    /// Path relative to the channel's `music` directory.
    pub file: PathBuf,
    pub sha256: String,
    pub duration_secs: f32,
    pub source: TrackSource,
}

impl MusicTrack {
    pub fn clearance(&self) -> Clearance {
        match &self.source {
            TrackSource::Generated { models, .. } => {
                if models.is_empty() {
                    return Clearance::Refused(
                        "gerador nao informou o modelo; licenca desconhecida".into(),
                    );
                }
                match models
                    .iter()
                    .find(|model| generator_license(model).is_none())
                {
                    Some(model) => Clearance::Refused(format!(
                        "modelo {model} fora da lista conferida (GENERATOR_MODELS)"
                    )),
                    None => Clearance::Clear { attribution: None },
                }
            }
            TrackSource::Library {
                license,
                creator,
                landing_url,
                license_version,
                license_url,
                ..
            } => match license {
                CcLicense::Cc0 | CcLicense::Pdm => Clearance::Clear { attribution: None },
                CcLicense::By => {
                    let version = license_version
                        .as_deref()
                        .map(|version| format!(" {version}"))
                        .unwrap_or_default();
                    let url = license_url
                        .as_deref()
                        .map(|url| format!(" ({url})"))
                        .unwrap_or_default();
                    Clearance::Clear {
                        attribution: Some(format!(
                            "\"{}\" - {creator} - {landing_url} - CC BY{version}{url}",
                            self.title
                        )),
                    }
                }
                CcLicense::BySa | CcLicense::ByNcSa => Clearance::Refused(format!(
                    "{}: compartilha-igual obrigaria o video inteiro a sair sob a mesma licenca",
                    license.label()
                )),
                CcLicense::ByNc | CcLicense::ByNcNd => Clearance::Refused(format!(
                    "{}: uso nao comercial; video monetizado e uso comercial",
                    license.label()
                )),
                CcLicense::ByNd => Clearance::Refused(
                    "CC BY-ND: sem derivados; mixar e fazer crossfade altera a obra".into(),
                ),
            },
        }
    }

    pub fn is_generated(&self) -> bool {
        matches!(self.source, TrackSource::Generated { .. })
    }
}

/// A channel's catalog of cleared tracks, stored as `channels/<id>/music/library.json`.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct MusicLibrary {
    pub tracks: Vec<MusicTrack>,
}

impl MusicLibrary {
    /// Adds a track, refusing an uncleared one, a repeated id or a repeated file hash.
    pub fn add(&mut self, track: MusicTrack) -> Result<()> {
        if let Clearance::Refused(reason) = track.clearance() {
            return Err(FramechesterError::GateBlocked(format!(
                "faixa {}: {reason}",
                track.id
            )));
        }
        if self.tracks.iter().any(|other| other.id == track.id) {
            return Err(FramechesterError::InvalidInput(format!(
                "faixa {} ja existe na biblioteca",
                track.id
            )));
        }
        if let Some(other) = self
            .tracks
            .iter()
            .find(|other| other.sha256 == track.sha256)
        {
            return Err(FramechesterError::InvalidInput(format!(
                "faixa {} tem o mesmo audio de {}",
                track.id, other.id
            )));
        }
        self.tracks.push(track);
        Ok(())
    }

    /// The tracks with these ids, in this order; all tracks when `ids` is empty.
    pub fn select(&self, ids: &[String]) -> Result<Vec<MusicTrack>> {
        if ids.is_empty() {
            return Ok(self.tracks.clone());
        }
        ids.iter()
            .map(|id| {
                self.tracks
                    .iter()
                    .find(|track| &track.id == id)
                    .cloned()
                    .ok_or_else(|| FramechesterError::NotFound(format!("faixa {id}")))
            })
            .collect()
    }
}

/// YouTube turns description timestamps into chapters only with at least three of them,
/// the first at 0:00 and each at least ten seconds long.
pub const MIN_CHAPTERS: usize = 3;
pub const MIN_CHAPTER_SECS: f32 = 10.0;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Chapter {
    pub start_secs: f32,
    pub title: String,
}

/// A long mix: tracks played in order, each crossfading into the next.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct MusicMix {
    pub tracks: Vec<MusicTrack>,
    pub crossfade_secs: f32,
}

impl MusicMix {
    /// Validates the mix: every track cleared, no audio repeated (looping one track to
    /// pad length is the repetitive content monetization refuses), and each track long
    /// enough for the crossfades and a chapter of its own.
    pub fn new(tracks: Vec<MusicTrack>, crossfade_secs: f32) -> Result<Self> {
        if tracks.len() < MIN_CHAPTERS {
            return Err(FramechesterError::InvalidInput(format!(
                "mix precisa de pelo menos {MIN_CHAPTERS} faixas para virar capitulos; recebeu {}",
                tracks.len()
            )));
        }
        if !(0.0..=15.0).contains(&crossfade_secs) {
            return Err(FramechesterError::InvalidInput(
                "crossfade deve ficar entre 0 e 15 s".into(),
            ));
        }
        let mut hashes = HashSet::new();
        for track in &tracks {
            if let Clearance::Refused(reason) = track.clearance() {
                return Err(FramechesterError::GateBlocked(format!(
                    "faixa {}: {reason}",
                    track.id
                )));
            }
            if !hashes.insert(track.sha256.as_str()) {
                return Err(FramechesterError::GateBlocked(format!(
                    "faixa {} repetida no mix; repeticao de audio e conteudo repetitivo",
                    track.id
                )));
            }
            if track.duration_secs < MIN_CHAPTER_SECS + 2.0 * crossfade_secs {
                return Err(FramechesterError::InvalidInput(format!(
                    "faixa {} curta demais ({:.1}s) para crossfade de {crossfade_secs}s",
                    track.id, track.duration_secs
                )));
            }
        }
        Ok(Self {
            tracks,
            crossfade_secs,
        })
    }

    /// Each track starts one crossfade before the previous one ends.
    pub fn chapters(&self) -> Vec<Chapter> {
        let mut start = 0.0f32;
        self.tracks
            .iter()
            .map(|track| {
                let chapter = Chapter {
                    start_secs: start,
                    title: track.title.clone(),
                };
                start += track.duration_secs - self.crossfade_secs;
                chapter
            })
            .collect()
    }

    pub fn duration_secs(&self) -> f32 {
        let total: f32 = self.tracks.iter().map(|track| track.duration_secs).sum();
        total - self.crossfade_secs * (self.tracks.len() - 1) as f32
    }

    pub fn attributions(&self) -> Vec<String> {
        self.tracks
            .iter()
            .filter_map(|track| match track.clearance() {
                Clearance::Clear { attribution } => attribution,
                Clearance::Refused(_) => None,
            })
            .collect()
    }

    /// The models behind the generated tracks, deduplicated, for the AI disclosure.
    pub fn generator_models(&self) -> Vec<String> {
        let mut models: Vec<String> = Vec::new();
        for track in &self.tracks {
            if let TrackSource::Generated { models: used, .. } = &track.source {
                for model in used {
                    if !models.contains(model) {
                        models.push(model.clone());
                    }
                }
            }
        }
        models
    }

    /// Description body: tracklist with chapter timestamps, credits and AI disclosure.
    /// `language` follows [`crate::channel::LANGUAGES`].
    pub fn description(&self, language: &str) -> String {
        let words = DescriptionWords::for_language(language);
        let mut lines = vec![words.tracklist.to_string()];
        lines.extend(
            self.chapters()
                .iter()
                .map(|chapter| format!("{} {}", timestamp(chapter.start_secs), chapter.title)),
        );
        let attributions = self.attributions();
        if !attributions.is_empty() {
            lines.push(String::new());
            lines.push(words.credits.to_string());
            lines.extend(attributions);
        }
        let models = self.generator_models();
        if !models.is_empty() {
            lines.push(String::new());
            lines.push(format!("{} ({}).", words.generated, models.join(", ")));
        }
        lines.join("\n")
    }
}

struct DescriptionWords {
    tracklist: &'static str,
    credits: &'static str,
    generated: &'static str,
}

impl DescriptionWords {
    fn for_language(language: &str) -> Self {
        match language {
            "en-US" => Self {
                tracklist: "Tracklist",
                credits: "Music credits",
                generated: "Some tracks were AI-generated locally with ACE-Step 1.5 (MIT license)",
            },
            "es" => Self {
                tracklist: "Lista de canciones",
                credits: "Creditos musicales",
                generated:
                    "Algunas pistas se generaron con IA localmente con ACE-Step 1.5 (licencia MIT)",
            },
            _ => Self {
                tracklist: "Faixas",
                credits: "Creditos das musicas",
                generated:
                    "Parte das faixas foi gerada por IA localmente com ACE-Step 1.5 (licenca MIT)",
            },
        }
    }
}

/// `M:SS` below an hour, `H:MM:SS` from an hour on, as YouTube reads chapters.
pub fn timestamp(secs: f32) -> String {
    let total = secs.max(0.0).floor() as u64;
    let (hours, minutes, seconds) = (total / 3600, (total / 60) % 60, total % 60);
    if hours > 0 {
        format!("{hours}:{minutes:02}:{seconds:02}")
    } else {
        format!("{minutes}:{seconds:02}")
    }
}

/// A track id from a title: lowercase ASCII slug, at most 48 characters.
pub fn slug(title: &str) -> String {
    let mut slug = String::new();
    for character in title.chars().flat_map(char::to_lowercase) {
        if character.is_ascii_alphanumeric() {
            slug.push(character);
        } else if !slug.ends_with('-') && !slug.is_empty() {
            slug.push('-');
        }
        if slug.len() >= 48 {
            break;
        }
    }
    let slug = slug.trim_matches('-').to_string();
    if slug.is_empty() {
        "faixa".into()
    } else {
        slug
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn generated(id: &str, secs: f32, model: &str) -> MusicTrack {
        MusicTrack {
            id: id.into(),
            title: format!("Faixa {id}"),
            file: format!("generated/{id}.wav").into(),
            sha256: format!("hash-{id}"),
            duration_secs: secs,
            source: TrackSource::Generated {
                engine: "ace-step".into(),
                models: vec![model.into(), "acestep-5Hz-lm-1.7B".into()],
                prompt: "lofi piano, rain".into(),
                seed: 7,
            },
        }
    }

    fn library(id: &str, license: CcLicense) -> MusicTrack {
        MusicTrack {
            id: id.into(),
            title: "Night Walk".into(),
            file: format!("library/{id}.mp3").into(),
            sha256: format!("hash-{id}"),
            duration_secs: 180.0,
            source: TrackSource::Library {
                provider: "jamendo".into(),
                source_id: "abc".into(),
                landing_url: "https://example.org/track/abc".into(),
                creator: "Ana".into(),
                license,
                license_version: Some("4.0".into()),
                license_url: Some("https://creativecommons.org/licenses/by/4.0/".into()),
            },
        }
    }

    #[test]
    fn only_cc0_pdm_and_by_clear_and_by_carries_attribution() {
        assert_eq!(
            library("a", CcLicense::Cc0).clearance(),
            Clearance::Clear { attribution: None }
        );
        assert_eq!(
            library("a", CcLicense::Pdm).clearance(),
            Clearance::Clear { attribution: None }
        );
        let Clearance::Clear {
            attribution: Some(credit),
        } = library("a", CcLicense::By).clearance()
        else {
            panic!("CC BY deve passar com atribuicao");
        };
        assert!(
            credit.contains("Night Walk") && credit.contains("Ana") && credit.contains("CC BY 4.0")
        );
        for refused in [
            CcLicense::BySa,
            CcLicense::ByNc,
            CcLicense::ByNd,
            CcLicense::ByNcSa,
            CcLicense::ByNcNd,
        ] {
            assert!(
                matches!(library("a", refused).clearance(), Clearance::Refused(_)),
                "{refused:?}"
            );
        }
    }

    #[test]
    fn monetizable_codes_are_exactly_the_cleared_ones() {
        for code in [
            "cc0", "pdm", "by", "by-sa", "by-nc", "by-nd", "by-nc-sa", "by-nc-nd",
        ] {
            let license = CcLicense::parse(code).unwrap();
            assert_eq!(license.code(), code);
            let cleared = !matches!(library("a", license).clearance(), Clearance::Refused(_));
            assert_eq!(cleared, CcLicense::MONETIZABLE.contains(&license), "{code}");
        }
        assert_eq!(CcLicense::parse("sampling+"), None);
    }

    #[test]
    fn generated_track_clears_only_with_every_model_vetted() {
        assert_eq!(
            generated("a", 120.0, "acestep-v15-turbo").clearance(),
            Clearance::Clear { attribution: None }
        );
        assert!(matches!(
            generated("a", 120.0, "musicgen-large").clearance(),
            Clearance::Refused(reason) if reason.contains("musicgen-large")
        ));
        let mut unknown = generated("a", 120.0, "acestep-v15-turbo");
        unknown.source = TrackSource::Generated {
            engine: "ace-step".into(),
            models: vec![],
            prompt: String::new(),
            seed: 0,
        };
        assert!(matches!(unknown.clearance(), Clearance::Refused(_)));
    }

    #[test]
    fn library_refuses_uncleared_duplicate_id_and_duplicate_audio() {
        let mut library_of_channel = MusicLibrary::default();
        library_of_channel
            .add(generated("a", 120.0, "acestep-v15-base"))
            .unwrap();
        assert!(library_of_channel
            .add(library("b", CcLicense::ByNc))
            .is_err());
        assert!(library_of_channel
            .add(generated("a", 90.0, "acestep-v15-base"))
            .is_err());
        let mut same_audio = generated("c", 120.0, "acestep-v15-base");
        same_audio.sha256 = "hash-a".into();
        assert!(library_of_channel.add(same_audio).is_err());
        assert_eq!(library_of_channel.select(&[]).unwrap().len(), 1);
        assert!(library_of_channel.select(&["zzz".into()]).is_err());
    }

    #[test]
    fn chapters_start_one_crossfade_early_and_duration_subtracts_overlaps() {
        let mix = MusicMix::new(
            vec![
                generated("a", 200.0, "acestep-v15-turbo"),
                generated("b", 3500.0, "acestep-v15-turbo"),
                library("c", CcLicense::By),
            ],
            4.0,
        )
        .unwrap();
        let chapters = mix.chapters();
        assert_eq!(chapters[0].start_secs, 0.0);
        assert_eq!(chapters[1].start_secs, 196.0);
        assert_eq!(chapters[2].start_secs, 3692.0);
        assert_eq!(mix.duration_secs(), 200.0 + 3500.0 + 180.0 - 8.0);
        let description = mix.description("pt-BR");
        assert!(description.starts_with("Faixas\n0:00 Faixa a\n3:16 Faixa b\n1:01:32 Night Walk"));
        assert!(description.contains("Creditos das musicas\n\"Night Walk\" - Ana"));
        assert!(description.contains("ACE-Step 1.5"));
        assert!(description.contains("acestep-v15-turbo, acestep-5Hz-lm-1.7B"));
        assert!(mix.description("en-US").starts_with("Tracklist\n"));
    }

    #[test]
    fn mix_refuses_repeated_audio_short_tracks_and_too_few_chapters() {
        let a = generated("a", 120.0, "acestep-v15-turbo");
        let b = generated("b", 120.0, "acestep-v15-turbo");
        let mut repeat = a.clone();
        repeat.id = "a2".into();
        assert!(MusicMix::new(vec![a.clone(), b.clone(), repeat], 4.0).is_err());
        assert!(MusicMix::new(vec![a.clone(), b.clone()], 4.0).is_err());
        let short = generated("c", 15.0, "acestep-v15-turbo");
        assert!(MusicMix::new(vec![a.clone(), b.clone(), short], 4.0).is_err());
        let c = generated("c", 120.0, "acestep-v15-turbo");
        assert!(MusicMix::new(vec![a, b, c], 20.0).is_err());
    }

    #[test]
    fn timestamps_and_slugs() {
        assert_eq!(timestamp(0.0), "0:00");
        assert_eq!(timestamp(59.9), "0:59");
        assert_eq!(timestamp(3600.0), "1:00:00");
        assert_eq!(
            slug("Chuva na Janela — Lo-fi #3"),
            "chuva-na-janela-lo-fi-3"
        );
        assert_eq!(slug("***"), "faixa");
    }
}
