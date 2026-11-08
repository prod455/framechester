use crate::domain::{Claim, Script, ScriptFormat, Topic, TrendMetrics, TtsAudio};
use crate::error::Result;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdapterInfo {
    pub name: String,
    pub license: String,
    pub network: bool,
    pub unit_cost: String,
    pub secrets: Vec<String>,
    pub failure_modes: Vec<String>,
}

impl AdapterInfo {
    pub fn local(name: &str, license: &str) -> Self {
        Self {
            name: name.into(),
            license: license.into(),
            network: false,
            unit_cost: "R$ 0,00 incremental".into(),
            secrets: Vec::new(),
            failure_modes: vec!["entrada invalida".into(), "arquivo ausente".into()],
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrendSignal {
    pub topic: Topic,
    pub score: f64,
    pub blocked_reasons: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScriptPrompt {
    pub topic: Topic,
    pub format: ScriptFormat,
    pub max_scenes: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GenerationBudget {
    pub max_output_tokens: u32,
    pub max_cost_cents: u32,
}

impl Default for GenerationBudget {
    fn default() -> Self {
        Self {
            max_output_tokens: 4000,
            max_cost_cents: 0,
        }
    }
}

#[derive(Debug, Clone)]
pub struct TtsRequest {
    pub scene_id: u32,
    pub text: String,
    pub voice: String,
    pub output: PathBuf,
}

pub trait FactEvidenceProvider {
    fn info(&self) -> AdapterInfo;
    fn verify(&self, claims: &[Claim]) -> Result<Vec<Claim>>;
}

pub trait LlmProvider {
    fn info(&self) -> AdapterInfo;
    fn generate(&self, prompt: &ScriptPrompt, budget: &GenerationBudget) -> Result<Script>;
}

pub trait TtsEngine {
    fn info(&self) -> AdapterInfo;
    fn synthesize(&self, request: &TtsRequest) -> Result<TtsAudio>;
    /// Several requests at once; engines that load a model per call override this to
    /// load it once. The default is sequential and keeps the input order.
    fn synthesize_batch(&self, requests: &[TtsRequest]) -> Result<Vec<TtsAudio>> {
        requests
            .iter()
            .map(|request| self.synthesize(request))
            .collect()
    }
}

pub fn metrics_summary(metrics: &TrendMetrics) -> String {
    format!(
        "aceleracao={:.2} demanda={:.2} alinhamento={:.2} originalidade={:.2} visual={:.2} timing={:.2} cross={:.2}",
        metrics.acceleration,
        metrics.demand,
        metrics.alignment,
        metrics.originality,
        metrics.visual_feasibility,
        metrics.timing,
        metrics.cross_check
    )
}
