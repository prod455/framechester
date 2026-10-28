use framechester_core::domain::{
    AssetManifest, Claim, ClaimStatus, Scene, Script, ScriptFormat, Source, Topic, TrendMetrics,
};
use framechester_core::editorial;
use framechester_core::error::{FramechesterError, Result};
use framechester_core::ports::{
    AdapterInfo, AssetProvider, FactEvidenceProvider, GenerationBudget, LlmProvider, ScriptPrompt,
    TrendRequest, TrendSignal, TrendSource,
};
use sha2::{Digest, Sha256};
use std::path::Path;

fn hex_digest(value: &str) -> String {
    let digest = Sha256::digest(value.as_bytes());
    digest.iter().map(|byte| format!("{byte:02x}")).collect()
}

#[derive(Debug, Clone)]
pub struct StaticTrendSource {
    signals: Vec<TrendSignal>,
}

impl StaticTrendSource {
    pub fn new(signals: Vec<TrendSignal>) -> Self {
        Self { signals }
    }

    pub fn from_topics(topics: Vec<Topic>) -> Self {
        Self {
            signals: topics
                .into_iter()
                .map(|topic| editorial::evaluate(&topic))
                .collect(),
        }
    }

    pub fn from_json_file(path: &Path) -> Result<Self> {
        let text = std::fs::read_to_string(path)?;
        let topics: Vec<Topic> = serde_json::from_str(&text)?;
        Ok(Self::from_topics(topics))
    }

    pub fn sample() -> Self {
        Self::from_topics(sample_topics())
    }
}

impl TrendSource for StaticTrendSource {
    fn info(&self) -> AdapterInfo {
        AdapterInfo {
            name: "static-trends".into(),
            license: "fixture Apache-2.0".into(),
            network: false,
            unit_cost: "R$ 0,00".into(),
            secrets: Vec::new(),
            failure_modes: vec!["fixture invalida".into(), "fonte perigosa".into()],
        }
    }

    fn fetch(&self, request: &TrendRequest) -> Result<Vec<TrendSignal>> {
        if request.limit == 0 {
            return Err(FramechesterError::InvalidInput(
                "limit deve ser maior que zero".into(),
            ));
        }
        Ok(editorial::top_n(self.signals.clone(), request.limit))
    }
}

#[derive(Debug, Default)]
pub struct LocalEvidenceProvider;

impl FactEvidenceProvider for LocalEvidenceProvider {
    fn info(&self) -> AdapterInfo {
        AdapterInfo {
            name: "local-evidence".into(),
            license: "Apache-2.0".into(),
            network: false,
            unit_cost: "R$ 0,00".into(),
            secrets: Vec::new(),
            failure_modes: vec![
                "nao verifica fatos na internet".into(),
                "claim sem fonte permanece nao verificado".into(),
            ],
        }
    }

    fn verify(&self, claims: &[Claim]) -> Result<Vec<Claim>> {
        Ok(claims
            .iter()
            .map(|claim| {
                let mut updated = claim.clone();
                if updated.source_urls.is_empty() {
                    updated.status = ClaimStatus::Unverified;
                } else if updated.status == ClaimStatus::Unverified {
                    updated.status = ClaimStatus::Cited;
                }
                updated
            })
            .collect())
    }
}

#[derive(Debug, Default)]
pub struct TemplateLlm;

impl LlmProvider for TemplateLlm {
    fn info(&self) -> AdapterInfo {
        AdapterInfo {
            name: "template-llm".into(),
            license: "Apache-2.0".into(),
            network: false,
            unit_cost: "R$ 0,00".into(),
            secrets: Vec::new(),
            failure_modes: vec![
                "texto repetitivo".into(),
                "requer revisao editorial humana".into(),
            ],
        }
    }

    fn generate(&self, prompt: &ScriptPrompt, _budget: &GenerationBudget) -> Result<Script> {
        let topic = &prompt.topic;
        if topic.title.trim().is_empty() {
            return Err(FramechesterError::InvalidInput("topico sem titulo".into()));
        }
        let scene_count = prompt
            .format
            .target_scene_count()
            .min(prompt.max_scenes.max(1));
        let source_titles: Vec<String> = topic
            .sources
            .iter()
            .map(|source| format!("{} ({})", source.title, source.publisher))
            .collect();
        let source_refs = if source_titles.is_empty() {
            "fontes locais".to_string()
        } else {
            source_titles.join("; ")
        };
        let mut scenes = Vec::with_capacity(scene_count);
        for index in 0..scene_count {
            let heading = match index {
                0 => "Abertura".to_string(),
                value if value + 1 == scene_count => "Fechamento".to_string(),
                value => format!("Ponto {}", value),
            };
            let narration = match prompt.format {
                ScriptFormat::Short => match index {
                    0 => format!(
                        "Você já parou para pensar nisso? {}. {}. A ideia central é explicar o que realmente importa, sem prometer mais do que as fontes mostram. O compromisso é separar evidência de opinião. As fontes consultadas são: {}.",
                        topic.title, topic.angle, source_refs
                    ),
                    _ => format!(
                        "Agora vamos aprofundar. O ponto {index} conecta o tema {} à série {}. {}. Vamos olhar para o que está documentado, o que ainda é hipótese e o que muda na prática. As fontes consultadas são: {}.",
                        topic.title, topic.series, topic.angle, source_refs
                    ),
                },
                ScriptFormat::Long => format!(
                    "{} Neste bloco {}, o foco é: {}. O tema {} aparece na série {} com uma pergunta prática: o que muda para quem acompanha tecnologia? \
                     A análise parte de {} e separa o que está documentado do que ainda é hipótese. \
                     Primeiro, observamos o contexto e a data de cada fonte. Depois, comparamos os números citados e procuramos contradições. \
                     Em seguida, explicamos o mecanismo por trás do assunto sem transformar correlação em causalidade. \
                     Também listamos o que ainda não sabemos e quais evidências seriam necessárias para confirmar. \
                     O objetivo é entregar contexto útil, com limites claros e sem exagero. Também registramos quais evidências ainda faltam e qual seria o próximo teste útil. {}",
                    if index == 0 {
                        "Vamos começar pelo contexto."
                    } else {
                        "Continuando a explicação."
                    },
                    index + 1,
                    topic.angle,
                    topic.title,
                    topic.series,
                    source_refs,
                    source_refs
                ),
            };
            scenes.push(Scene {
                id: index as u32,
                heading,
                narration,
                visual_brief: format!(
                    "Fundo sintético com o título '{}' e destaque para o ponto {}",
                    topic.title, index
                ),
                duration_hint_secs: match prompt.format {
                    ScriptFormat::Short => 20.0,
                    ScriptFormat::Long => 55.0,
                },
            });
        }
        Ok(Script {
            title: format!("{}: {}", topic.series, topic.title),
            hook: format!("O que realmente importa em {}?", topic.title),
            series: topic.series.clone(),
            format: prompt.format,
            scenes,
            sources: topic.sources.clone(),
            claims: topic.claims.clone(),
        })
    }
}

#[derive(Debug, Default)]
pub struct SyntheticAssetProvider;

impl AssetProvider for SyntheticAssetProvider {
    fn info(&self) -> AdapterInfo {
        AdapterInfo {
            name: "synthetic-assets".into(),
            license: "gerado localmente; sem midia de terceiros".into(),
            network: false,
            unit_cost: "R$ 0,00".into(),
            secrets: Vec::new(),
            failure_modes: vec!["nao substitui footage licenciado".into()],
        }
    }

    fn resolve(&self, scene: &Scene, _index: usize) -> Result<AssetManifest> {
        let checksum = hex_digest(&format!("{}:{}", scene.id, scene.heading));
        Ok(AssetManifest {
            scene_id: scene.id,
            kind: "testsrc2".into(),
            path: None,
            license: "synthetic".into(),
            provenance: format!("framechester synthetic asset for scene {}", scene.id),
            checksum,
            restrictions: "sem footage real; usar apenas como placeholder".into(),
        })
    }
}

pub fn sample_topics() -> Vec<Topic> {
    vec![
        Topic {
            id: "sample-ia-local".into(),
            title: "IA local em hardware de consumidor".into(),
            series: "ia".into(),
            angle: "O que roda de verdade em uma GPU de entrada".into(),
            sources: vec![
                Source {
                    title: "Documentação de modelo aberto".into(),
                    url: "https://example.com/modelo-aberto".into(),
                    publisher: "Exemplo".into(),
                    retrieved_at: "2026-10-27".into(),
                    license: "CC BY 4.0 (exemplo sintético)".into(),
                },
                Source {
                    title: "Benchmark público de inferência".into(),
                    url: "https://example.com/benchmark".into(),
                    publisher: "Exemplo".into(),
                    retrieved_at: "2026-10-27".into(),
                    license: "CC BY 4.0 (exemplo sintético)".into(),
                },
            ],
            claims: vec![Claim {
                text: "Modelos quantizados reduzem requisitos de memória".into(),
                status: ClaimStatus::Cited,
                source_urls: vec!["https://example.com/benchmark".into()],
            }],
            metrics: TrendMetrics {
                acceleration: 0.8,
                demand: 0.7,
                alignment: 0.9,
                originality: 0.6,
                visual_feasibility: 0.7,
                timing: 0.8,
                cross_check: 0.8,
            },
        },
        Topic {
            id: "sample-ffmpeg".into(),
            title: "FFmpeg como motor de render reprodutível".into(),
            series: "tecnologia".into(),
            angle: "CPU, GPU e qualidade sem promessas mágicas".into(),
            sources: vec![
                Source {
                    title: "Documentação oficial do FFmpeg".into(),
                    url: "https://example.com/ffmpeg".into(),
                    publisher: "Exemplo".into(),
                    retrieved_at: "2026-10-27".into(),
                    license: "CC BY 4.0 (exemplo sintético)".into(),
                },
                Source {
                    title: "Guia de comparação de encoders".into(),
                    url: "https://example.com/encoders".into(),
                    publisher: "Exemplo".into(),
                    retrieved_at: "2026-10-27".into(),
                    license: "CC BY 4.0 (exemplo sintético)".into(),
                },
            ],
            claims: vec![Claim {
                text: "libx264 é baseline portável".into(),
                status: ClaimStatus::Cited,
                source_urls: vec!["https://example.com/encoders".into()],
            }],
            metrics: TrendMetrics {
                acceleration: 0.6,
                demand: 0.6,
                alignment: 0.9,
                originality: 0.8,
                visual_feasibility: 0.9,
                timing: 0.6,
                cross_check: 0.8,
            },
        },
        Topic {
            id: "sample-ciencia".into(),
            title: "Como ler um estudo científico sem exagerar".into(),
            series: "ciencia".into(),
            angle: "Amostra, incerteza e o que a manchete esconde".into(),
            sources: vec![
                Source {
                    title: "Guia de leitura crítica".into(),
                    url: "https://example.com/leitura-critica".into(),
                    publisher: "Exemplo".into(),
                    retrieved_at: "2026-10-27".into(),
                    license: "CC BY 4.0 (exemplo sintético)".into(),
                },
                Source {
                    title: "Nota sobre interpretação de intervalos".into(),
                    url: "https://example.com/intervalos".into(),
                    publisher: "Exemplo".into(),
                    retrieved_at: "2026-10-27".into(),
                    license: "CC BY 4.0 (exemplo sintético)".into(),
                },
            ],
            claims: vec![Claim {
                text: "Intervalo de confiança não é probabilidade da hipótese".into(),
                status: ClaimStatus::Cited,
                source_urls: vec!["https://example.com/intervalos".into()],
            }],
            metrics: TrendMetrics {
                acceleration: 0.5,
                demand: 0.8,
                alignment: 0.9,
                originality: 0.9,
                visual_feasibility: 0.6,
                timing: 0.7,
                cross_check: 0.9,
            },
        },
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sample_has_three_topics() {
        assert_eq!(sample_topics().len(), 3);
    }

    #[test]
    fn local_evidence_never_invents_verification() {
        let provider = LocalEvidenceProvider;
        let claims = vec![
            Claim {
                text: "com fonte".into(),
                status: ClaimStatus::Unverified,
                source_urls: vec!["https://example.com".into()],
            },
            Claim {
                text: "sem fonte".into(),
                status: ClaimStatus::Verified,
                source_urls: Vec::new(),
            },
        ];
        let verified = provider.verify(&claims).unwrap();
        assert_eq!(verified[0].status, ClaimStatus::Cited);
        assert_eq!(verified[1].status, ClaimStatus::Unverified);
    }

    #[test]
    fn local_evidence_preserves_contradiction() {
        let claims = vec![Claim {
            text: "contradito".into(),
            status: ClaimStatus::Contradicted,
            source_urls: vec!["https://example.com".into()],
        }];
        let verified = LocalEvidenceProvider.verify(&claims).unwrap();
        assert_eq!(verified[0].status, ClaimStatus::Contradicted);
    }

    #[test]
    fn template_llm_short_has_four_unique_scenes() {
        let topic = sample_topics().remove(0);
        let prompt = ScriptPrompt {
            topic,
            format: ScriptFormat::Short,
            max_scenes: 4,
        };
        let script = TemplateLlm
            .generate(&prompt, &GenerationBudget::default())
            .unwrap();
        assert_eq!(script.scenes.len(), 4);
        let mut narrations: Vec<&str> = script
            .scenes
            .iter()
            .map(|scene| scene.narration.as_str())
            .collect();
        narrations.sort();
        narrations.dedup();
        assert_eq!(narrations.len(), 4);
    }

    #[test]
    fn template_llm_long_has_eight_unique_scenes() {
        let topic = sample_topics().remove(0);
        let prompt = ScriptPrompt {
            topic,
            format: ScriptFormat::Long,
            max_scenes: 8,
        };
        let script = TemplateLlm
            .generate(&prompt, &GenerationBudget::default())
            .unwrap();
        assert_eq!(script.scenes.len(), 8);
        let mut narrations: Vec<&str> = script
            .scenes
            .iter()
            .map(|scene| scene.narration.as_str())
            .collect();
        narrations.sort();
        narrations.dedup();
        assert_eq!(narrations.len(), 8);
    }

    #[test]
    fn static_source_ranks_and_limits() {
        let source = StaticTrendSource::sample();
        let signals = source
            .fetch(&TrendRequest {
                since: "2026-10-01".into(),
                region: "BR".into(),
                limit: 2,
            })
            .unwrap();
        assert_eq!(signals.len(), 2);
        assert!(signals[0].score >= signals[1].score);
    }
}
