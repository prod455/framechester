use crate::domain::{
    AssetManifest, BackupReceipt, Claim, MetricSample, PublishReceipt, PublishRequest, QaReport,
    RenderOutput, RenderProfile, Scene, Script, ScriptFormat, Timeline, Topic, TrendMetrics,
    TtsAudio,
};
use crate::error::Result;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

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
pub struct TrendRequest {
    pub since: String,
    pub region: String,
    pub limit: usize,
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

pub trait TrendSource {
    fn info(&self) -> AdapterInfo;
    fn fetch(&self, request: &TrendRequest) -> Result<Vec<TrendSignal>>;
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
}

pub trait AssetProvider {
    fn info(&self) -> AdapterInfo;
    fn resolve(&self, scene: &Scene, index: usize) -> Result<AssetManifest>;
}

pub trait Renderer {
    fn info(&self) -> AdapterInfo;
    fn render(
        &self,
        timeline: &Timeline,
        assets: &[AssetManifest],
        profile: &RenderProfile,
        output: &Path,
    ) -> Result<RenderOutput>;

    fn thumbnail(
        &self,
        _title: &str,
        _output: &Path,
        _profile: &RenderProfile,
    ) -> Result<Option<PathBuf>> {
        Ok(None)
    }
}

pub trait QaGate {
    fn info(&self) -> AdapterInfo;
    fn technical(&self, output: &RenderOutput, profile: &RenderProfile) -> Result<QaReport>;
    /// Rendering intent can explain static frames; standalone QA remains strict.
    fn technical_with_timeline(
        &self,
        output: &RenderOutput,
        profile: &RenderProfile,
        _timeline: &Timeline,
    ) -> Result<QaReport> {
        self.technical(output, profile)
    }
    fn editorial(
        &self,
        script: &Script,
        assets: &[AssetManifest],
        timeline: &Timeline,
    ) -> Result<QaReport>;

    fn transcript(&self, _output: &RenderOutput, _script: &Script) -> Result<Option<QaReport>> {
        Ok(None)
    }
}

pub trait Publisher {
    fn info(&self) -> AdapterInfo;
    fn publish(&self, request: &PublishRequest) -> Result<PublishReceipt>;
}

pub trait MetricsProvider {
    fn info(&self) -> AdapterInfo;
    fn fetch(&self, video_ids: &[String]) -> Result<Vec<MetricSample>>;
}

pub trait BackupProvider {
    fn info(&self) -> AdapterInfo;
    fn check(&self) -> Result<BackupReceipt>;
    fn snapshot(&self, paths: &[PathBuf]) -> Result<BackupReceipt>;
    fn restore(&self, snapshot_id: &str, target: &Path) -> Result<BackupReceipt>;
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
