//! `run`: the full dry-run pipeline from topic to package.
use crate::cli::{load_config, EngineArg, LlmArg, ProduceArgs, RunArgs};
use crate::commands::report::{print_report, write_html_report};
use anyhow::{bail, Context};
use framechester_adapters::anthropic::AnthropicLlm;
use framechester_adapters::authored_script::AuthoredScriptLlm;
use framechester_adapters::ffmpeg::{AsrOptions, FfmpegQa, FfmpegRenderer};
use framechester_adapters::fixtures::{
    LocalEvidenceProvider, StaticTrendSource, SyntheticAssetProvider, TemplateLlm,
};
use framechester_adapters::kokoro::KokoroTts;
use framechester_adapters::local_assets::LocalAssetProvider;
use framechester_adapters::metrics::NullMetrics;
use framechester_adapters::publish::DryRunPublisher;
use framechester_core::config::Config;
use framechester_core::domain::{now_unix, PublishPrivacy, ScriptFormat, Stage, Topic};
use framechester_core::pipeline::{Pipeline, PipelineOptions, PipelineProviders};
use framechester_core::ports::{
    AssetProvider, GenerationBudget, LlmProvider, TrendRequest, TrendSource,
};
use std::path::PathBuf;

pub(crate) fn select_topic(args: &RunArgs) -> anyhow::Result<Topic> {
    if let Some(path) = &args.topic {
        let text = std::fs::read_to_string(path)
            .with_context(|| format!("ler topico {}", path.display()))?;
        let value: serde_json::Value = serde_json::from_str(&text)
            .with_context(|| format!("JSON invalido em {}", path.display()))?;
        if value.is_array() {
            let topics: Vec<Topic> = serde_json::from_value(value)?;
            return topics
                .get(args.topic_index)
                .cloned()
                .with_context(|| format!("indice {} fora da lista de topicos", args.topic_index));
        }
        return Ok(serde_json::from_value(value)?);
    }
    let source = StaticTrendSource::sample();
    let signals = source.fetch(&TrendRequest {
        since: "2026-01-01".into(),
        region: "BR".into(),
        limit: 10,
    })?;
    let signal = signals
        .get(args.topic_index)
        .with_context(|| format!("indice {} fora dos topicos disponiveis", args.topic_index))?;
    if !signal.blocked_reasons.is_empty() {
        bail!("topico bloqueado: {}", signal.blocked_reasons.join("; "));
    }
    Ok(signal.topic.clone())
}

pub(crate) fn build_llm(
    config: &Config,
    choice: Option<LlmArg>,
) -> anyhow::Result<Box<dyn LlmProvider>> {
    let provider = match choice {
        Some(LlmArg::Template) => "template",
        Some(LlmArg::Anthropic) => "anthropic",
        None => config.llm.provider.as_str(),
    };
    if provider == "anthropic" {
        Ok(Box::new(AnthropicLlm::from_config(&config.llm)?))
    } else {
        Ok(Box::new(TemplateLlm))
    }
}

pub(crate) fn run_pipeline(path: &Option<PathBuf>, args: RunArgs) -> anyhow::Result<i32> {
    let config = load_config(path)?;
    let engine = args.engine.unwrap_or(if config.motion.enabled {
        EngineArg::Motion
    } else {
        EngineArg::Legacy
    });
    if engine == EngineArg::Motion {
        if args.assets.is_some() {
            eprintln!(
                "aviso: --assets ignorado no motor motion; os visuais sao gerados do storyboard"
            );
        }
        if args.script.is_none() {
            bail!("o motor motion exige --script (roteiro autoral revisado)");
        }
        let format = match args
            .format
            .map(ScriptFormat::from)
            .unwrap_or(ScriptFormat::Short)
        {
            ScriptFormat::Short => "vertical",
            ScriptFormat::Long => "horizontal",
        };
        return crate::commands::produce::produce(
            path,
            ProduceArgs {
                script: args.script.clone(),
                storyboard: None,
                topic: args.topic.clone(),
                topic_index: args.topic_index,
                format: Some(format.into()),
                channel: args.channel.clone(),
                workdir: args.workdir.clone(),
                output: None,
                voice: args.voice.clone(),
                preview_only: args.preview_only,
                json: args.json,
            },
        );
    }
    let channel = config.select_channel(args.channel.as_deref())?;
    if args.script.is_none()
        && (matches!(args.llm, Some(LlmArg::Anthropic))
            || (args.llm.is_none() && config.llm.provider == "anthropic"))
    {
        eprintln!("Anthropic esta bloqueado ate existir cotacao e controle de custo; use --script para producao local");
    }
    if config.publish.enabled {
        eprintln!(
            "aviso: publish.enabled=true ignorado; publicacao real nao implementada (dry-run)"
        );
    }
    let format: ScriptFormat = args.format.map(Into::into).unwrap_or(ScriptFormat::Short);
    let max_scenes = args
        .max_scenes
        .unwrap_or_else(|| format.target_scene_count());
    if max_scenes == 0 {
        bail!("max_scenes deve ser maior que zero");
    }
    let workdir = args.workdir.clone().unwrap_or_else(|| {
        config
            .workdir_path()
            .join(format!("run-{}-{}", now_unix(), std::process::id()))
    });
    let voice = args
        .voice
        .clone()
        .unwrap_or_else(|| config.tts.voice_name.clone());
    let privacy: PublishPrivacy = args
        .privacy
        .map(Into::into)
        .unwrap_or(PublishPrivacy::Private);
    let topic = select_topic(&args)?;
    let budget = GenerationBudget {
        max_output_tokens: args.max_output_tokens,
        max_cost_cents: args.max_cost_cents,
    };
    let llm: Box<dyn LlmProvider> = match &args.script {
        Some(path) => Box::new(AuthoredScriptLlm::from_path(path)?),
        None => build_llm(&config, args.llm)?,
    };
    let assets: Box<dyn AssetProvider> = match &args.assets {
        Some(path) => Box::new(LocalAssetProvider::from_json_file(path)?),
        None => Box::new(SyntheticAssetProvider),
    };
    let mut tts_config = config.tts.clone();
    tts_config.voice_name = voice.clone();
    let tts = KokoroTts::new(&tts_config)?;
    let providers = PipelineProviders {
        trends: Box::new(StaticTrendSource::sample()),
        facts: Box::new(LocalEvidenceProvider),
        llm,
        assets,
        tts: Box::new(tts),
        renderer: Box::new(
            FfmpegRenderer::new(&config.render.ffmpeg_path, &config.render.ffprobe_path)
                .with_preview_watermark(args.preview_only),
        ),
        qa: Box::new({
            let qa = FfmpegQa::new(&config.render.ffmpeg_path, &config.render.ffprobe_path);
            if args.asr || config.asr.enabled {
                qa.with_asr(AsrOptions {
                    model: PathBuf::from(&config.asr.model),
                    language: config.asr.language.clone(),
                    min_coverage: config.asr.min_coverage,
                })
            } else {
                qa
            }
        }),
        publisher: Box::new(DryRunPublisher),
        metrics: Box::new(NullMetrics),
    };
    let pipeline = Pipeline::new(
        providers,
        PipelineOptions {
            channel,
            workdir: workdir.clone(),
            format,
            max_scenes,
            dry_run: true,
            voice,
            privacy,
            render_profile: config.render_profile_for(format),
            budget,
            burn_subtitles: args.burn_subtitles,
        },
    );
    let report = if args.preview_only {
        pipeline.preview(topic)?
    } else {
        pipeline.run(topic)?
    };
    write_html_report(&report, &report.artifacts_dir)?;
    if args.json {
        println!("{}", serde_json::to_string_pretty(&report)?);
    } else {
        print_report(&report);
        println!(
            "html: {}",
            report.artifacts_dir.join("report.html").display()
        );
    }
    Ok(if report.stage == Stage::Blocked { 2 } else { 0 })
}
