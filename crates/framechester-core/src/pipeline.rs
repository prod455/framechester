use crate::domain::{
    PipelineReport, PublishPrivacy, PublishRequest, PublishStatus, QaStatus, Script, ScriptFormat,
    Stage, Timeline, TimelineScene, Topic, TtsAudio,
};
use crate::editorial;
use crate::error::{FramechesterError, Result};
use crate::package;
use crate::ports::{
    AssetProvider, FactEvidenceProvider, GenerationBudget, LlmProvider, MetricsProvider, Publisher,
    QaGate, Renderer, ScriptPrompt, TrendSource, TtsEngine, TtsRequest,
};
use std::path::{Path, PathBuf};

pub struct PipelineProviders {
    pub trends: Box<dyn TrendSource>,
    pub facts: Box<dyn FactEvidenceProvider>,
    pub llm: Box<dyn LlmProvider>,
    pub assets: Box<dyn AssetProvider>,
    pub tts: Box<dyn TtsEngine>,
    pub renderer: Box<dyn Renderer>,
    pub qa: Box<dyn QaGate>,
    pub publisher: Box<dyn Publisher>,
    pub metrics: Box<dyn MetricsProvider>,
}

#[derive(Debug, Clone)]
pub struct PipelineOptions {
    pub channel: Option<crate::channel::ChannelProfile>,
    pub workdir: PathBuf,
    pub format: ScriptFormat,
    pub max_scenes: usize,
    pub dry_run: bool,
    pub voice: String,
    pub privacy: PublishPrivacy,
    pub render_profile: crate::domain::RenderProfile,
    pub budget: GenerationBudget,
    pub burn_subtitles: bool,
}

impl Default for PipelineOptions {
    fn default() -> Self {
        Self {
            channel: None,
            workdir: PathBuf::from("artifacts"),
            format: ScriptFormat::Short,
            max_scenes: 4,
            dry_run: true,
            voice: "pf_dora".into(),
            privacy: PublishPrivacy::Private,
            render_profile: crate::domain::RenderProfile::default(),
            budget: GenerationBudget::default(),
            burn_subtitles: false,
        }
    }
}

pub struct Pipeline {
    providers: PipelineProviders,
    options: PipelineOptions,
}

struct Tracker {
    stage: Stage,
}

impl Tracker {
    fn new() -> Self {
        Self { stage: Stage::Idea }
    }

    fn advance(&mut self, next: Stage) -> Result<()> {
        if !self.stage.can_transition_to(next) {
            return Err(FramechesterError::InvalidInput(format!(
                "transicao invalida: {:?} -> {:?}",
                self.stage, next
            )));
        }
        self.stage = next;
        Ok(())
    }

    fn block(&mut self) -> Result<()> {
        self.advance(Stage::Blocked)
    }
}

impl Pipeline {
    pub fn new(providers: PipelineProviders, mut options: PipelineOptions) -> Self {
        if let Some(channel) = &options.channel {
            // Validation happens before any I/O in run, including for direct API callers.
            options.workdir = options.workdir.join("channels").join(&channel.id);
        }
        Self { providers, options }
    }

    pub fn run(&self, topic: Topic) -> Result<PipelineReport> {
        if let Some(channel) = &self.options.channel {
            channel.validate()?;
        }
        if self.options.max_scenes == 0 {
            return Err(FramechesterError::InvalidInput(
                "max_scenes deve ser maior que zero".into(),
            ));
        }
        std::fs::create_dir_all(&self.options.workdir)?;
        let mut tracker = Tracker::new();
        let mut warnings = Vec::new();

        tracker.advance(Stage::Sourced)?;
        let signal = editorial::evaluate(&topic);
        if !signal.blocked_reasons.is_empty() {
            warnings.extend(signal.blocked_reasons.clone());
            tracker.block()?;
            return self.finish(
                &topic,
                tracker.stage,
                None,
                None,
                None,
                None,
                None,
                None,
                Vec::new(),
                warnings,
            );
        }
        tracker.advance(Stage::ApprovedTopic)?;

        let prompt = ScriptPrompt {
            topic: topic.clone(),
            format: self.options.format,
            max_scenes: self.options.max_scenes,
        };
        let generated = self.providers.llm.generate(&prompt, &self.options.budget)?;
        if generated.scenes.is_empty() {
            return Err(FramechesterError::InvalidInput(
                "LlmProvider retornou roteiro sem cenas".into(),
            ));
        }
        tracker.advance(Stage::Written)?;

        let mut script = generated;
        script.scenes.truncate(self.options.max_scenes);
        let mut scene_ids = std::collections::HashSet::new();
        if !script.scenes.iter().all(|scene| scene_ids.insert(scene.id)) {
            return Err(FramechesterError::InvalidInput(
                "roteiro com scene_id duplicado".into(),
            ));
        }
        script.format = self.options.format;
        script.series = topic.series.clone();
        script.sources = topic.sources.clone();
        script.claims = self.providers.facts.verify(&script.claims)?;
        tracker.advance(Stage::FactChecked)?;

        let scenes = script.scenes.clone();
        tracker.advance(Stage::Storyboarded)?;

        let mut assets = Vec::with_capacity(scenes.len());
        for (index, scene) in scenes.iter().enumerate() {
            assets.push(self.providers.assets.resolve(scene, index)?);
        }
        tracker.advance(Stage::AssetReady)?;

        let mut audios: Vec<TtsAudio> = Vec::with_capacity(scenes.len());
        for scene in &scenes {
            let output = self
                .options
                .workdir
                .join("audio")
                .join(format!("scene_{:03}.wav", scene.id));
            let audio = self.providers.tts.synthesize(&TtsRequest {
                scene_id: scene.id,
                text: scene.narration.clone(),
                voice: self.options.voice.clone(),
                output,
            })?;
            audios.push(audio);
        }
        tracker.advance(Stage::Narrated)?;

        let mut timeline_scenes = Vec::with_capacity(scenes.len());
        for (scene, audio) in scenes.iter().zip(audios.iter()) {
            let asset = assets
                .iter()
                .find(|asset| asset.scene_id == scene.id)
                .ok_or_else(|| {
                    FramechesterError::Unavailable(format!("asset ausente para cena {}", scene.id))
                })?;
            timeline_scenes.push(TimelineScene {
                scene_id: scene.id,
                heading: scene.heading.clone(),
                background: asset.kind.clone(),
                audio_path: audio.path.clone(),
                duration_secs: audio.duration_secs.max(0.6),
            });
        }
        let mut timeline = Timeline {
            scenes: timeline_scenes,
            captions: None,
        };
        if self.options.burn_subtitles {
            let captions_path = self.options.workdir.join("render").join("captions.srt");
            if let Some(parent) = captions_path.parent() {
                std::fs::create_dir_all(parent)?;
            }
            std::fs::write(&captions_path, package::build_srt(&script, &timeline))?;
            timeline.captions = Some(captions_path);
        }

        let render_path = self.options.workdir.join("render").join("final.mp4");
        let render = self.providers.renderer.render(
            &timeline,
            &assets,
            &self.options.render_profile,
            &render_path,
        )?;
        tracker.advance(Stage::Rendered)?;

        let mut technical = self
            .providers
            .qa
            .technical(&render, &self.options.render_profile)?;
        if let Some(asr) = self.providers.qa.transcript(&render, &script)? {
            technical.checks.extend(asr.checks);
        }
        tracker.advance(Stage::TechQa)?;

        let editorial_report = self.providers.qa.editorial(&script, &assets, &timeline)?;
        tracker.advance(Stage::EditorialQa)?;

        if technical.overall() == QaStatus::Fail {
            warnings.push("QA tecnico falhou; publicacao bloqueada".into());
            tracker.block()?;
            return self.finish(
                &topic,
                tracker.stage,
                Some(script),
                Some(render),
                Some(technical),
                Some(editorial_report),
                None,
                None,
                Vec::new(),
                warnings,
            );
        }
        if editorial_report.overall() == QaStatus::Fail {
            warnings.push("QA editorial falhou; publicacao bloqueada".into());
            tracker.block()?;
            return self.finish(
                &topic,
                tracker.stage,
                Some(script),
                Some(render),
                Some(technical),
                Some(editorial_report),
                None,
                None,
                Vec::new(),
                warnings,
            );
        }

        if !self.options.dry_run
            && (technical.overall() != QaStatus::Pass
                || editorial_report.overall() != QaStatus::Pass)
        {
            warnings.push(
                "publicacao real exige QA tecnico e editorial Pass e aprovacao humana explicita"
                    .into(),
            );
            tracker.block()?;
            return self.finish(
                &topic,
                tracker.stage,
                Some(script),
                Some(render),
                Some(technical),
                Some(editorial_report),
                None,
                None,
                Vec::new(),
                warnings,
            );
        }

        let thumbnail_path = self.options.workdir.join("render").join("thumbnail.png");
        let thumbnail = match self.providers.renderer.thumbnail(
            &script.title,
            &thumbnail_path,
            &self.options.render_profile,
        ) {
            Ok(path) => path,
            Err(error) => {
                warnings.push(format!("thumbnail nao gerada: {error}"));
                None
            }
        };
        let package = package::write_package(
            &self.options.workdir,
            &script,
            &topic,
            &timeline,
            &render,
            &technical,
            &editorial_report,
            self.options.privacy,
            thumbnail,
            self.options.channel.as_ref(),
        )?;

        let publish_request = PublishRequest {
            media_path: render.path.clone(),
            title: script.title.clone(),
            description: package::build_description(&script, &topic, &timeline),
            privacy: self.options.privacy,
            dry_run: self.options.dry_run,
            channel: self
                .options
                .channel
                .as_ref()
                .and_then(|channel| channel.youtube_channel_id.clone()),
        };
        let receipt = self.providers.publisher.publish(&publish_request)?;
        let metrics = if receipt.status == PublishStatus::Published {
            tracker.advance(Stage::Scheduled)?;
            tracker.advance(Stage::Published)?;
            let ids: Vec<String> = receipt.video_id.iter().cloned().collect();
            let samples = self.providers.metrics.fetch(&ids)?;
            if !samples.is_empty() {
                tracker.advance(Stage::Analyzed)?;
            }
            samples
        } else {
            if receipt.status == PublishStatus::DryRun {
                warnings.push("publicacao em dry-run; nenhum upload foi feito".into());
            }
            if receipt.status == PublishStatus::Blocked {
                warnings.push(receipt.message.clone());
                tracker.block()?;
            }
            Vec::new()
        };

        self.finish(
            &topic,
            tracker.stage,
            Some(script),
            Some(render),
            Some(technical),
            Some(editorial_report),
            Some(receipt),
            Some(package),
            metrics,
            warnings,
        )
    }

    #[allow(clippy::too_many_arguments)]
    fn finish(
        &self,
        topic: &Topic,
        stage: Stage,
        script: Option<Script>,
        render: Option<crate::domain::RenderOutput>,
        technical: Option<crate::domain::QaReport>,
        editorial_report: Option<crate::domain::QaReport>,
        publish: Option<crate::domain::PublishReceipt>,
        package: Option<crate::domain::PublishPackage>,
        metrics: Vec<crate::domain::MetricSample>,
        warnings: Vec<String>,
    ) -> Result<PipelineReport> {
        let report = PipelineReport {
            channel: self.options.channel.clone(),
            topic_id: topic.id.clone(),
            stage,
            artifacts_dir: self.options.workdir.clone(),
            script,
            render,
            technical_qa: technical,
            editorial_qa: editorial_report,
            publish,
            package,
            metrics,
            warnings,
        };
        write_report(&self.options.workdir, &report)?;
        Ok(report)
    }
}

pub fn write_report(workdir: &Path, report: &PipelineReport) -> Result<()> {
    std::fs::create_dir_all(workdir)?;
    let path = workdir.join("pipeline_report.json");
    let text = serde_json::to_string_pretty(report)?;
    std::fs::write(path, text)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::TtsAudio;
    use crate::domain::{
        AssetManifest, Claim, ClaimStatus, QaCheck, QaReport, RenderOutput, Source,
    };
    use crate::ports::AdapterInfo;

    struct FakeTrends;
    impl TrendSource for FakeTrends {
        fn info(&self) -> AdapterInfo {
            AdapterInfo::local("fake-trends", "test")
        }
        fn fetch(
            &self,
            _request: &crate::ports::TrendRequest,
        ) -> Result<Vec<crate::ports::TrendSignal>> {
            Ok(Vec::new())
        }
    }
    struct FakeFacts;
    impl FactEvidenceProvider for FakeFacts {
        fn info(&self) -> AdapterInfo {
            AdapterInfo::local("fake-facts", "test")
        }
        fn verify(&self, claims: &[Claim]) -> Result<Vec<Claim>> {
            Ok(claims.to_vec())
        }
    }
    struct FakeLlm;
    impl LlmProvider for FakeLlm {
        fn info(&self) -> AdapterInfo {
            AdapterInfo::local("fake-llm", "test")
        }
        fn generate(&self, prompt: &ScriptPrompt, _budget: &GenerationBudget) -> Result<Script> {
            Ok(Script {
                title: "Teste".into(),
                hook: "Hook".into(),
                series: prompt.topic.series.clone(),
                format: prompt.format,
                scenes: vec![
                    crate::domain::Scene {
                        id: 0,
                        heading: "A".into(),
                        narration: "primeira cena".into(),
                        visual_brief: "visual".into(),
                        duration_hint_secs: 1.0,
                    },
                    crate::domain::Scene {
                        id: 1,
                        heading: "B".into(),
                        narration: "segunda cena".into(),
                        visual_brief: "visual".into(),
                        duration_hint_secs: 1.0,
                    },
                ],
                sources: prompt.topic.sources.clone(),
                claims: prompt.topic.claims.clone(),
            })
        }
    }
    struct FakeAssets;
    impl AssetProvider for FakeAssets {
        fn info(&self) -> AdapterInfo {
            AdapterInfo::local("fake-assets", "test")
        }
        fn resolve(&self, scene: &crate::domain::Scene, _index: usize) -> Result<AssetManifest> {
            Ok(AssetManifest {
                scene_id: scene.id,
                kind: "testsrc2".into(),
                path: None,
                license: "synthetic".into(),
                provenance: "fake".into(),
                checksum: "abc".into(),
                restrictions: "none".into(),
            })
        }
    }
    struct FakeTts;
    impl TtsEngine for FakeTts {
        fn info(&self) -> AdapterInfo {
            AdapterInfo::local("fake-tts", "test")
        }
        fn synthesize(&self, request: &TtsRequest) -> Result<TtsAudio> {
            Ok(TtsAudio {
                scene_id: request.scene_id,
                path: request.output.with_extension("wav"),
                duration_secs: 35.0,
                sample_rate: 48_000,
                voice: request.voice.clone(),
            })
        }
    }
    struct FakeRenderer;
    impl Renderer for FakeRenderer {
        fn info(&self) -> AdapterInfo {
            AdapterInfo::local("fake-render", "test")
        }
        fn render(
            &self,
            _timeline: &Timeline,
            _assets: &[AssetManifest],
            profile: &crate::domain::RenderProfile,
            output: &Path,
        ) -> Result<RenderOutput> {
            Ok(RenderOutput {
                path: output.to_path_buf(),
                duration_secs: 70.0,
                bytes: 10,
                sha256: "abc".into(),
                video_codec: profile.video_codec.clone(),
                width: profile.width,
                height: profile.height,
                fps: profile.fps,
            })
        }
    }
    struct FakeQa;
    impl QaGate for FakeQa {
        fn info(&self) -> AdapterInfo {
            AdapterInfo::local("fake-qa", "test")
        }
        fn technical(
            &self,
            _output: &RenderOutput,
            _profile: &crate::domain::RenderProfile,
        ) -> Result<QaReport> {
            Ok(QaReport::new(vec![QaCheck {
                id: "tech".into(),
                name: "tech".into(),
                status: QaStatus::Pass,
                detail: "ok".into(),
            }]))
        }
        fn editorial(
            &self,
            script: &Script,
            assets: &[AssetManifest],
            timeline: &Timeline,
        ) -> Result<QaReport> {
            Ok(crate::qa::editorial(script, assets, timeline))
        }
    }
    struct FakePublisher;
    impl Publisher for FakePublisher {
        fn info(&self) -> AdapterInfo {
            AdapterInfo::local("fake-publish", "test")
        }
        fn publish(&self, request: &PublishRequest) -> Result<crate::domain::PublishReceipt> {
            Ok(crate::domain::PublishReceipt {
                provider: "fake".into(),
                status: PublishStatus::DryRun,
                video_id: None,
                message: "dry-run".into(),
                published_at_unix: None,
                dry_run: request.dry_run,
            })
        }
    }
    struct PendingTechnicalQa(QaStatus);
    impl QaGate for PendingTechnicalQa {
        fn info(&self) -> AdapterInfo {
            AdapterInfo::local("pending-technical-qa", "test")
        }
        fn technical(
            &self,
            _output: &RenderOutput,
            _profile: &crate::domain::RenderProfile,
        ) -> Result<QaReport> {
            Ok(QaReport::new(vec![QaCheck {
                id: "technical".into(),
                name: "technical".into(),
                status: self.0,
                detail: "verificacao incompleta".into(),
            }]))
        }
        fn editorial(
            &self,
            _script: &Script,
            _assets: &[AssetManifest],
            _timeline: &Timeline,
        ) -> Result<QaReport> {
            Ok(QaReport::new(vec![QaCheck {
                id: "editorial".into(),
                name: "editorial".into(),
                status: QaStatus::Pass,
                detail: "aprovado pelo operador de teste".into(),
            }]))
        }
    }
    struct FakeMetrics;
    impl MetricsProvider for FakeMetrics {
        fn info(&self) -> AdapterInfo {
            AdapterInfo::local("fake-metrics", "test")
        }
        fn fetch(&self, _ids: &[String]) -> Result<Vec<crate::domain::MetricSample>> {
            Ok(Vec::new())
        }
    }

    fn providers() -> PipelineProviders {
        PipelineProviders {
            trends: Box::new(FakeTrends),
            facts: Box::new(FakeFacts),
            llm: Box::new(FakeLlm),
            assets: Box::new(FakeAssets),
            tts: Box::new(FakeTts),
            renderer: Box::new(FakeRenderer),
            qa: Box::new(FakeQa),
            publisher: Box::new(FakePublisher),
            metrics: Box::new(FakeMetrics),
        }
    }

    fn topic() -> Topic {
        Topic {
            id: "t1".into(),
            title: "Topico".into(),
            series: "ia".into(),
            angle: "angulo".into(),
            sources: vec![
                Source {
                    title: "A".into(),
                    url: "https://example.com/a".into(),
                    publisher: "P".into(),
                    retrieved_at: "2026-10-27".into(),
                    license: "CC BY 4.0".into(),
                },
                Source {
                    title: "B".into(),
                    url: "https://example.com/b".into(),
                    publisher: "P".into(),
                    retrieved_at: "2026-10-27".into(),
                    license: "CC BY 4.0".into(),
                },
            ],
            claims: vec![Claim {
                text: "claim".into(),
                status: ClaimStatus::Cited,
                source_urls: vec!["https://example.com/a".into()],
            }],
            metrics: crate::domain::TrendMetrics {
                acceleration: 1.0,
                demand: 1.0,
                alignment: 1.0,
                originality: 1.0,
                visual_feasibility: 1.0,
                timing: 1.0,
                cross_check: 1.0,
            },
        }
    }

    #[test]
    fn blocked_topic_returns_blocked_stage() {
        let mut topic = topic();
        topic.sources.truncate(1);
        let pipeline = Pipeline::new(
            providers(),
            PipelineOptions {
                workdir: std::env::temp_dir().join("fc-pipeline-blocked"),
                ..PipelineOptions::default()
            },
        );
        let report = pipeline.run(topic).unwrap();
        assert_eq!(report.stage, Stage::Blocked);
        assert!(report.script.is_none());
    }

    #[test]
    fn dry_run_pipeline_completes_without_publish() {
        let workdir =
            std::env::temp_dir().join(format!("fc-pipeline-{}", crate::domain::now_unix()));
        let pipeline = Pipeline::new(
            providers(),
            PipelineOptions {
                workdir: workdir.clone(),
                ..PipelineOptions::default()
            },
        );
        let report = pipeline.run(topic()).unwrap();
        assert_eq!(report.stage, Stage::EditorialQa);
        assert_eq!(
            report.publish.as_ref().unwrap().status,
            PublishStatus::DryRun
        );
        let package = report.package.as_ref().unwrap();
        assert!(package.subtitles.is_file());
        assert!(package.metadata.is_file());
        assert!(workdir.join("publish/final.srt").exists());
        assert!(workdir.join("pipeline_report.json").exists());
        let _ = std::fs::remove_dir_all(workdir);
    }

    #[test]
    fn live_pipeline_blocks_incomplete_technical_qa() {
        for status in [QaStatus::NeedsHuman, QaStatus::Skipped] {
            let workdir = std::env::temp_dir().join(format!(
                "fc-pipeline-pending-technical-{:?}-{}",
                status,
                crate::domain::now_unix()
            ));
            let mut providers = providers();
            providers.qa = Box::new(PendingTechnicalQa(status));
            let pipeline = Pipeline::new(
                providers,
                PipelineOptions {
                    workdir: workdir.clone(),
                    dry_run: false,
                    ..PipelineOptions::default()
                },
            );
            let report = pipeline.run(topic()).unwrap();
            assert_eq!(report.stage, Stage::Blocked, "QA tecnico {status:?}");
            assert!(report.publish.is_none());
            assert!(report.package.is_none());
            let _ = std::fs::remove_dir_all(workdir);
        }
    }

    #[test]
    fn same_topic_keeps_channel_packages_reports_and_destinations_separate() {
        struct ChannelPublisher(String);
        impl Publisher for ChannelPublisher {
            fn info(&self) -> AdapterInfo {
                AdapterInfo::local("channel-test", "test")
            }
            fn publish(&self, request: &PublishRequest) -> Result<crate::domain::PublishReceipt> {
                assert_eq!(request.channel.as_deref(), Some(self.0.as_str()));
                FakePublisher.publish(request)
            }
        }
        let root = std::env::temp_dir().join(format!(
            "fc-multichannel-{}-{}",
            std::process::id(),
            crate::domain::now_unix()
        ));
        for id in ["tech", "science"] {
            let channel = crate::channel::ChannelProfile {
                id: id.into(),
                youtube_channel_id: Some(format!("synthetic-{id}")),
            };
            let mut adapters = providers();
            adapters.publisher = Box::new(ChannelPublisher(format!("synthetic-{id}")));
            let report = Pipeline::new(
                adapters,
                PipelineOptions {
                    channel: Some(channel.clone()),
                    workdir: root.clone(),
                    ..PipelineOptions::default()
                },
            )
            .run(topic())
            .unwrap();
            let expected = root.join("channels").join(id);
            assert_eq!(report.artifacts_dir, expected);
            assert_eq!(report.channel, Some(channel.clone()));
            assert!(expected.join("pipeline_report.json").is_file());
            let metadata: serde_json::Value = serde_json::from_str(
                &std::fs::read_to_string(report.package.unwrap().metadata).unwrap(),
            )
            .unwrap();
            assert_eq!(metadata["channel"]["id"], id);
            assert_eq!(
                metadata["channel"]["youtube_channel_id"],
                format!("synthetic-{id}")
            );
        }
        assert!(!root.join("pipeline_report.json").exists());
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn direct_pipeline_api_rejects_unsafe_channel_before_writing_files() {
        let root = std::env::temp_dir().join(format!("fc-channel-invalid-{}", std::process::id()));
        let result = Pipeline::new(
            providers(),
            PipelineOptions {
                channel: Some(crate::channel::ChannelProfile {
                    id: "../escape".into(),
                    youtube_channel_id: None,
                }),
                workdir: root.clone(),
                ..PipelineOptions::default()
            },
        )
        .run(topic());
        assert!(result.is_err());
        assert!(!root.exists());
    }

    #[test]
    fn authored_scene_ids_survive_pipeline_and_asset_resolution() {
        struct AuthoredIds;
        impl LlmProvider for AuthoredIds {
            fn info(&self) -> AdapterInfo {
                AdapterInfo::local("authored-ids", "test")
            }
            fn generate(&self, prompt: &ScriptPrompt, budget: &GenerationBudget) -> Result<Script> {
                let mut script = FakeLlm.generate(prompt, budget)?;
                script.scenes[0].id = 42;
                script.scenes[1].id = 99;
                Ok(script)
            }
        }
        let root = std::env::temp_dir().join(format!("fc-authored-ids-{}", std::process::id()));
        let mut adapters = providers();
        adapters.llm = Box::new(AuthoredIds);
        let report = Pipeline::new(
            adapters,
            PipelineOptions {
                workdir: root.clone(),
                ..PipelineOptions::default()
            },
        )
        .run(topic())
        .unwrap();
        let ids: Vec<u32> = report
            .script
            .unwrap()
            .scenes
            .iter()
            .map(|scene| scene.id)
            .collect();
        assert_eq!(ids, vec![42, 99]);
        std::fs::remove_dir_all(root).unwrap();
    }
}
