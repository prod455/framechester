use framechester_core::domain::{ClaimStatus, Script};
use framechester_core::error::{FramechesterError, Result};
use framechester_core::ports::{AdapterInfo, GenerationBudget, LlmProvider, ScriptPrompt};
use framechester_core::security::validate_source_url;
use serde::Deserialize;
use std::collections::HashSet;
use std::path::Path;

#[derive(Debug, Clone)]
pub struct AuthoredScriptLlm {
    document: AuthoredScriptDocument,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
struct AuthoredScriptDocument {
    topic_id: String,
    script: Script,
}

impl AuthoredScriptLlm {
    pub fn from_path(path: impl AsRef<Path>) -> Result<Self> {
        let text = std::fs::read_to_string(path)?;
        let document: AuthoredScriptDocument = serde_json::from_str(&text)?;
        if [
            &document.topic_id,
            &document.script.title,
            &document.script.hook,
            &document.script.series,
        ]
        .iter()
        .any(|text| text.trim().is_empty())
            || document.script.scenes.is_empty()
        {
            return Err(FramechesterError::InvalidInput(
                "roteiro autoral sem topico, titulo, gancho, serie ou cenas".into(),
            ));
        }
        let mut scene_ids = HashSet::new();
        for scene in &document.script.scenes {
            if [&scene.heading, &scene.narration, &scene.visual_brief]
                .iter()
                .any(|text| text.trim().is_empty())
                || !scene.duration_hint_secs.is_finite()
                || scene.duration_hint_secs <= 0.0
                || !scene_ids.insert(scene.id)
            {
                return Err(FramechesterError::InvalidInput(
                    "cena autoral vazia, duracao invalida ou id duplicado".into(),
                ));
            }
        }
        validate_provenance(&document.script)?;
        Ok(Self { document })
    }
}

impl LlmProvider for AuthoredScriptLlm {
    fn info(&self) -> AdapterInfo {
        AdapterInfo::local("authored-script", "Apache-2.0")
    }

    fn generate(&self, prompt: &ScriptPrompt, _budget: &GenerationBudget) -> Result<Script> {
        if self.document.topic_id != prompt.topic.id {
            return Err(FramechesterError::InvalidInput(
                "roteiro autoral pertence a outro topico".into(),
            ));
        }
        if self.document.script.format != prompt.format
            || self.document.script.series != prompt.topic.series
            || self.document.script.scenes.len() > prompt.max_scenes
        {
            return Err(FramechesterError::InvalidInput(
                "formato, serie ou limite de cenas incompativel com o roteiro autoral".into(),
            ));
        }
        for source in &self.document.script.sources {
            if !prompt.topic.sources.iter().any(|known| {
                source.url == known.url
                    && source.title == known.title
                    && source.publisher == known.publisher
                    && source.retrieved_at == known.retrieved_at
                    && source.license == known.license
            }) {
                return Err(FramechesterError::InvalidInput(
                    "fonte do roteiro autoral nao corresponde as fontes do topico".into(),
                ));
            }
        }
        let mut script = self.document.script.clone();
        script.claims = prompt.topic.claims.clone();
        for authored in &self.document.script.claims {
            if let Some(existing) = script
                .claims
                .iter_mut()
                .find(|claim| claim.text == authored.text)
            {
                existing.status = conservative_status(existing.status, authored.status);
                for url in &authored.source_urls {
                    if !existing.source_urls.contains(url) {
                        existing.source_urls.push(url.clone());
                    }
                }
            } else {
                let mut claim = authored.clone();
                if claim.status == ClaimStatus::Verified {
                    claim.status = if claim.source_urls.is_empty() {
                        ClaimStatus::Unverified
                    } else {
                        ClaimStatus::Cited
                    };
                }
                script.claims.push(claim);
            }
        }
        script.sources = prompt.topic.sources.clone();
        for claim in &mut script.claims {
            if claim.source_urls.is_empty() && claim.status != ClaimStatus::Contradicted {
                claim.status = ClaimStatus::Unverified;
            }
        }
        validate_provenance(&script)?;
        Ok(script)
    }
}

fn conservative_status(left: ClaimStatus, right: ClaimStatus) -> ClaimStatus {
    [
        ClaimStatus::Contradicted,
        ClaimStatus::Unverified,
        ClaimStatus::Cited,
        ClaimStatus::Verified,
    ]
    .into_iter()
    .find(|status| *status == left || *status == right)
    .unwrap_or(ClaimStatus::Unverified)
}

fn validate_provenance(script: &Script) -> Result<()> {
    let mut source_urls = HashSet::new();
    for source in &script.sources {
        validate_source_url(&source.url)?;
        if [
            &source.title,
            &source.publisher,
            &source.retrieved_at,
            &source.license,
        ]
        .iter()
        .any(|text| text.trim().is_empty())
            || !source_urls.insert(source.url.as_str())
        {
            return Err(FramechesterError::InvalidInput(
                "fonte autoral incompleta ou duplicada".into(),
            ));
        }
    }
    for claim in &script.claims {
        if claim.text.trim().is_empty()
            || claim
                .source_urls
                .iter()
                .any(|url| !source_urls.contains(url.as_str()))
        {
            return Err(FramechesterError::InvalidInput(
                "claim autoral vazio ou com fonte nao documentada".into(),
            ));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::fixtures::sample_topics;
    use framechester_core::domain::{ClaimStatus, Scene, ScriptFormat};
    use std::sync::atomic::{AtomicU64, Ordering};

    static NEXT_FILE: AtomicU64 = AtomicU64::new(0);

    struct TestFile(std::path::PathBuf);

    impl TestFile {
        fn new(contents: &str) -> Self {
            let path = std::env::temp_dir().join(format!(
                "framechester-authored-{}-{}.json",
                std::process::id(),
                NEXT_FILE.fetch_add(1, Ordering::Relaxed)
            ));
            std::fs::write(&path, contents).unwrap();
            Self(path)
        }
    }

    impl Drop for TestFile {
        fn drop(&mut self) {
            let _ = std::fs::remove_file(&self.0);
        }
    }

    fn prompt_and_document() -> (ScriptPrompt, serde_json::Value) {
        let topic = sample_topics().remove(0);
        let script = Script {
            title: "Minha análise autoral".into(),
            hook: "Qual comparação responde à sua pergunta?".into(),
            series: topic.series.clone(),
            format: ScriptFormat::Short,
            scenes: vec![Scene {
                id: 7,
                heading: "Uma pergunta específica".into(),
                narration: "Esta é uma fala autoral, com pausa e acentuação próprias.".into(),
                visual_brief: "Diagrama original com duas perguntas distintas".into(),
                duration_hint_secs: 12.0,
            }],
            sources: topic.sources.clone(),
            claims: topic.claims.clone(),
        };
        let document = serde_json::json!({"topic_id": topic.id, "script": script});
        (
            ScriptPrompt {
                topic,
                format: ScriptFormat::Short,
                max_scenes: 4,
            },
            document,
        )
    }

    #[test]
    fn local_script_preserves_authored_narration_without_network_or_budget() {
        let (prompt, document) = prompt_and_document();
        let file = TestFile::new(&document.to_string());
        let provider = AuthoredScriptLlm::from_path(&file.0).unwrap();
        let script = provider
            .generate(&prompt, &GenerationBudget::default())
            .unwrap();
        assert_eq!(
            script.scenes[0].narration,
            "Esta é uma fala autoral, com pausa e acentuação próprias."
        );
        assert_eq!(script.scenes[0].id, 7);
        assert!(!provider.info().network);
        assert_eq!(script.claims[0].status, ClaimStatus::Cited);
    }

    #[test]
    fn rejects_script_bound_to_another_topic() {
        let (mut prompt, document) = prompt_and_document();
        let file = TestFile::new(&document.to_string());
        let provider = AuthoredScriptLlm::from_path(&file.0).unwrap();
        prompt.topic.id = "different-topic".into();
        assert!(provider
            .generate(&prompt, &GenerationBudget::default())
            .is_err());
    }

    #[test]
    fn rejects_empty_narration_when_loading_a_local_script() {
        let (_, mut document) = prompt_and_document();
        document["script"]["scenes"][0]["narration"] = serde_json::json!("  ");
        let file = TestFile::new(&document.to_string());
        assert!(AuthoredScriptLlm::from_path(&file.0).is_err());
    }

    #[test]
    fn validates_script_and_scene_metadata_before_generation() {
        let (_, document) = prompt_and_document();
        let mutations = [
            ("topic_id", serde_json::json!(" ")),
            ("title", serde_json::json!(" ")),
            ("hook", serde_json::json!(" ")),
            ("series", serde_json::json!(" ")),
            ("scenes", serde_json::json!([])),
        ];
        for (field, value) in mutations {
            let mut invalid = document.clone();
            if field == "topic_id" {
                invalid[field] = value;
            } else {
                invalid["script"][field] = value;
            }
            let file = TestFile::new(&invalid.to_string());
            assert!(AuthoredScriptLlm::from_path(&file.0).is_err(), "{field}");
        }
        for (field, value) in [
            ("heading", serde_json::json!(" ")),
            ("visual_brief", serde_json::json!(" ")),
            ("duration_hint_secs", serde_json::json!(0)),
        ] {
            let mut invalid = document.clone();
            invalid["script"]["scenes"][0][field] = value;
            let file = TestFile::new(&invalid.to_string());
            assert!(AuthoredScriptLlm::from_path(&file.0).is_err(), "{field}");
        }
        let mut invalid = document;
        let duplicate = invalid["script"]["scenes"][0].clone();
        invalid["script"]["scenes"]
            .as_array_mut()
            .unwrap()
            .push(duplicate);
        let file = TestFile::new(&invalid.to_string());
        assert!(AuthoredScriptLlm::from_path(&file.0).is_err());
    }

    #[test]
    fn refuses_incompatible_format_series_and_scene_limit_without_truncating() {
        let (prompt, document) = prompt_and_document();
        let file = TestFile::new(&document.to_string());
        let provider = AuthoredScriptLlm::from_path(&file.0).unwrap();
        let mut wrong_format = prompt.clone();
        wrong_format.format = ScriptFormat::Long;
        assert!(provider
            .generate(&wrong_format, &GenerationBudget::default())
            .is_err());
        let mut wrong_series = prompt.clone();
        wrong_series.topic.series = "outra-serie".into();
        assert!(provider
            .generate(&wrong_series, &GenerationBudget::default())
            .is_err());
        let mut no_scenes = prompt;
        no_scenes.max_scenes = 0;
        assert!(provider
            .generate(&no_scenes, &GenerationBudget::default())
            .is_err());
    }

    #[test]
    fn keeps_topic_claims_and_authored_claims_without_promoting_unknown_evidence() {
        let (mut prompt, mut document) = prompt_and_document();
        prompt.topic.claims[0].status = ClaimStatus::Unverified;
        document["script"]["claims"][0]["status"] = serde_json::json!("verified");
        document["script"]["claims"]
            .as_array_mut()
            .unwrap()
            .push(serde_json::json!({
                "text": "Alegacao autoral ainda nao verificada",
                "status": "unverified",
                "source_urls": []
            }));
        prompt.topic.claims.push(framechester_core::domain::Claim {
            text: "Alegacao do topico nao pode desaparecer".into(),
            status: ClaimStatus::Contradicted,
            source_urls: vec![prompt.topic.sources[0].url.clone()],
        });
        let file = TestFile::new(&document.to_string());
        let script = AuthoredScriptLlm::from_path(&file.0)
            .unwrap()
            .generate(&prompt, &GenerationBudget::default())
            .unwrap();
        assert_eq!(script.claims.len(), 3);
        assert_eq!(
            script
                .claims
                .iter()
                .find(|claim| claim.text == prompt.topic.claims[0].text)
                .unwrap()
                .status,
            ClaimStatus::Unverified
        );
        assert_eq!(
            script
                .claims
                .iter()
                .find(|claim| claim.text == "Alegacao do topico nao pode desaparecer")
                .unwrap()
                .status,
            ClaimStatus::Contradicted
        );
        assert_eq!(
            script
                .claims
                .iter()
                .find(|claim| claim.text == "Alegacao autoral ainda nao verificada")
                .unwrap()
                .status,
            ClaimStatus::Unverified
        );
    }

    #[test]
    fn rejects_claims_without_documented_sources_and_sources_outside_the_topic() {
        let (prompt, document) = prompt_and_document();
        let mut missing = document.clone();
        missing["script"]["claims"][0]["source_urls"] =
            serde_json::json!(["https://example.com/not-documented"]);
        let file = TestFile::new(&missing.to_string());
        assert!(AuthoredScriptLlm::from_path(&file.0).is_err());
        let mut outside = document;
        outside["script"]["sources"][0]["url"] =
            serde_json::json!("https://example.com/other-source");
        let url = outside["script"]["sources"][1]["url"].clone();
        outside["script"]["claims"][0]["source_urls"] = serde_json::json!([url]);
        let file = TestFile::new(&outside.to_string());
        let provider = AuthoredScriptLlm::from_path(&file.0).unwrap();
        assert!(provider
            .generate(&prompt, &GenerationBudget::default())
            .is_err());
    }

    #[test]
    fn rejects_malformed_json_and_missing_files() {
        let file = TestFile::new("{malformed");
        assert!(AuthoredScriptLlm::from_path(&file.0).is_err());
        assert!(AuthoredScriptLlm::from_path(file.0.with_extension("missing")).is_err());
    }

    #[test]
    fn rejects_empty_claims_dangerous_sources_and_incomplete_provenance() {
        let (_, document) = prompt_and_document();
        for (location, field, value) in [
            ("claims", "text", " "),
            ("sources", "url", "http://127.0.0.1/private"),
            ("sources", "license", " "),
        ] {
            let mut invalid = document.clone();
            invalid["script"][location][0][field] = serde_json::json!(value);
            let file = TestFile::new(&invalid.to_string());
            assert!(
                AuthoredScriptLlm::from_path(&file.0).is_err(),
                "{location}/{field}"
            );
        }
    }

    #[test]
    fn new_authored_claim_cannot_self_certify_as_verified() {
        let (prompt, mut document) = prompt_and_document();
        document["script"]["claims"]
            .as_array_mut()
            .unwrap()
            .push(serde_json::json!({
                "text": "Alegacao nova exige revisao independente",
                "status": "verified",
                "source_urls": [prompt.topic.sources[0].url]
            }));
        let file = TestFile::new(&document.to_string());
        let script = AuthoredScriptLlm::from_path(&file.0)
            .unwrap()
            .generate(&prompt, &GenerationBudget::default())
            .unwrap();
        assert_eq!(script.claims.last().unwrap().status, ClaimStatus::Cited);
    }

    #[test]
    fn bundled_authored_example_matches_the_example_topic_and_stays_pending_review() {
        let topic =
            serde_json::from_str(include_str!("../../../examples/topico.exemplo.json")).unwrap();
        let file = TestFile::new(include_str!("../../../examples/roteiro.exemplo.json"));
        let script = AuthoredScriptLlm::from_path(&file.0)
            .unwrap()
            .generate(
                &ScriptPrompt {
                    topic,
                    format: ScriptFormat::Short,
                    max_scenes: 4,
                },
                &GenerationBudget::default(),
            )
            .unwrap();
        assert_eq!(script.scenes.len(), 4);
        assert!(script.scenes[0].narration.contains("exemplos ficticios"));
        assert_eq!(script.claims[0].status, ClaimStatus::Cited);
    }
}
