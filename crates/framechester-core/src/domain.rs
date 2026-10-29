use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

pub fn now_unix() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Stage {
    Idea,
    Sourced,
    ApprovedTopic,
    Written,
    FactChecked,
    Storyboarded,
    AssetReady,
    Narrated,
    Rendered,
    TechQa,
    EditorialQa,
    Scheduled,
    Published,
    Analyzed,
    Failed,
    Blocked,
    Retry,
}

impl Stage {
    pub fn can_transition_to(self, next: Stage) -> bool {
        use Stage::*;
        matches!(
            (self, next),
            (Idea, Sourced)
                | (Sourced, ApprovedTopic)
                | (ApprovedTopic, Written)
                | (Written, FactChecked)
                | (FactChecked, Storyboarded)
                | (Storyboarded, AssetReady)
                | (AssetReady, Narrated)
                | (Narrated, Rendered)
                | (Rendered, TechQa)
                | (TechQa, EditorialQa)
                | (EditorialQa, Scheduled)
                | (Scheduled, Published)
                | (Published, Analyzed)
                | (Idea, Blocked)
                | (Sourced, Blocked)
                | (ApprovedTopic, Blocked)
                | (Written, Blocked)
                | (FactChecked, Blocked)
                | (Storyboarded, Blocked)
                | (AssetReady, Blocked)
                | (Narrated, Blocked)
                | (Rendered, Blocked)
                | (TechQa, Blocked)
                | (EditorialQa, Blocked)
                | (Scheduled, Blocked)
                | (_, Failed)
                | (Failed, Retry)
                | (Blocked, Retry)
                | (Retry, Idea)
        )
    }

    pub fn is_terminal(self) -> bool {
        matches!(
            self,
            Stage::Published | Stage::Analyzed | Stage::Failed | Stage::Blocked
        )
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Source {
    pub title: String,
    pub url: String,
    pub publisher: String,
    pub retrieved_at: String,
    pub license: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ClaimStatus {
    Verified,
    Cited,
    Unverified,
    Contradicted,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Claim {
    pub text: String,
    pub status: ClaimStatus,
    pub source_urls: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrendMetrics {
    pub acceleration: f64,
    pub demand: f64,
    pub alignment: f64,
    pub originality: f64,
    pub visual_feasibility: f64,
    pub timing: f64,
    pub cross_check: f64,
}

impl Default for TrendMetrics {
    fn default() -> Self {
        Self {
            acceleration: 0.0,
            demand: 0.0,
            alignment: 0.0,
            originality: 0.0,
            visual_feasibility: 0.0,
            timing: 0.0,
            cross_check: 0.0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Topic {
    pub id: String,
    pub title: String,
    pub series: String,
    pub angle: String,
    pub sources: Vec<Source>,
    pub claims: Vec<Claim>,
    #[serde(default)]
    pub metrics: TrendMetrics,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ScriptFormat {
    Short,
    Long,
}

impl ScriptFormat {
    pub fn duration_range(self) -> (f32, f32) {
        match self {
            ScriptFormat::Short => (65.0, 90.0),
            ScriptFormat::Long => (420.0, 720.0),
        }
    }

    pub fn target_scene_count(self) -> usize {
        match self {
            ScriptFormat::Short => 4,
            ScriptFormat::Long => 8,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Scene {
    pub id: u32,
    pub heading: String,
    pub narration: String,
    pub visual_brief: String,
    pub duration_hint_secs: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Script {
    pub title: String,
    pub hook: String,
    pub series: String,
    pub format: ScriptFormat,
    pub scenes: Vec<Scene>,
    pub sources: Vec<Source>,
    pub claims: Vec<Claim>,
    /// The operator declared the editorial review: sources cross-checked and claims read
    /// against them. It is the human approval the editorial QA waits for.
    #[serde(default)]
    pub cross_checked: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssetManifest {
    pub scene_id: u32,
    pub kind: String,
    pub path: Option<PathBuf>,
    pub license: String,
    pub provenance: String,
    pub checksum: String,
    pub restrictions: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TtsAudio {
    pub scene_id: u32,
    pub path: PathBuf,
    pub duration_secs: f32,
    pub sample_rate: u32,
    pub voice: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimelineScene {
    pub scene_id: u32,
    pub heading: String,
    pub background: String,
    pub audio_path: PathBuf,
    pub duration_secs: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Timeline {
    pub scenes: Vec<TimelineScene>,
    #[serde(default)]
    pub captions: Option<PathBuf>,
}

impl Timeline {
    pub fn total_duration_secs(&self) -> f32 {
        self.scenes.iter().map(|scene| scene.duration_secs).sum()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RenderProfile {
    pub width: u32,
    pub height: u32,
    pub fps: u32,
    pub video_codec: String,
    pub crf: u32,
    pub preset: String,
    pub audio_bitrate_kbps: u32,
}

impl Default for RenderProfile {
    fn default() -> Self {
        Self {
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RenderOutput {
    pub path: PathBuf,
    pub duration_secs: f32,
    pub bytes: u64,
    pub sha256: String,
    pub video_codec: String,
    pub width: u32,
    pub height: u32,
    pub fps: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum QaStatus {
    Pass,
    Fail,
    NeedsHuman,
    Skipped,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QaCheck {
    pub id: String,
    pub name: String,
    pub status: QaStatus,
    pub detail: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QaReport {
    pub checks: Vec<QaCheck>,
}

impl QaReport {
    pub fn new(checks: Vec<QaCheck>) -> Self {
        Self { checks }
    }

    pub fn overall(&self) -> QaStatus {
        if self
            .checks
            .iter()
            .any(|check| check.status == QaStatus::Fail)
        {
            return QaStatus::Fail;
        }
        if self
            .checks
            .iter()
            .any(|check| check.status == QaStatus::NeedsHuman)
        {
            return QaStatus::NeedsHuman;
        }
        if self
            .checks
            .iter()
            .all(|check| check.status == QaStatus::Skipped)
        {
            return QaStatus::Skipped;
        }
        QaStatus::Pass
    }

    pub fn failed_checks(&self) -> Vec<&QaCheck> {
        self.checks
            .iter()
            .filter(|check| check.status == QaStatus::Fail)
            .collect()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PublishPrivacy {
    Private,
    Unlisted,
    Public,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PublishRequest {
    pub media_path: PathBuf,
    pub title: String,
    pub description: String,
    pub privacy: PublishPrivacy,
    pub dry_run: bool,
    pub channel: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PublishStatus {
    DryRun,
    Published,
    Blocked,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PublishReceipt {
    pub provider: String,
    pub status: PublishStatus,
    pub video_id: Option<String>,
    pub message: String,
    pub published_at_unix: Option<u64>,
    pub dry_run: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MetricSample {
    pub video_id: String,
    pub provider: String,
    pub views: u64,
    pub watch_hours: f64,
    pub revenue_cents: u64,
    pub monetized: bool,
    pub captured_at_unix: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupReceipt {
    pub provider: String,
    pub repository: String,
    pub status: String,
    pub snapshot_id: Option<String>,
    pub bytes: Option<u64>,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PublishPackage {
    pub subtitles: PathBuf,
    pub description: PathBuf,
    pub metadata: PathBuf,
    pub sources: PathBuf,
    pub thumbnail: Option<PathBuf>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PipelineReport {
    #[serde(default)]
    pub channel: Option<crate::channel::ChannelProfile>,
    pub topic_id: String,
    pub stage: Stage,
    pub artifacts_dir: PathBuf,
    pub script: Option<Script>,
    pub render: Option<RenderOutput>,
    pub technical_qa: Option<QaReport>,
    pub editorial_qa: Option<QaReport>,
    pub publish: Option<PublishReceipt>,
    pub package: Option<PublishPackage>,
    pub metrics: Vec<MetricSample>,
    pub warnings: Vec<String>,
}
