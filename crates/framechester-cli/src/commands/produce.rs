//! `plan` and `produce`: the motion engine path. A reviewed script (or a ready
//! storyboard) becomes a semantic storyboard, is narrated segment by segment, rendered
//! with animated components for the chosen format, and gated by the extended QA. The
//! legacy still-image pipeline in `run` is untouched; `run --engine motion` delegates here.
use crate::cli::{load_config, ProduceArgs};
use crate::commands::report::{print_report, write_html_report};
use anyhow::{bail, Context};
use framechester_adapters::authored_script::AuthoredScriptLlm;
use framechester_adapters::ffmpeg::inspect_output;
use framechester_adapters::fixtures::{LocalEvidenceProvider, StaticTrendSource};
use framechester_adapters::kokoro::KokoroTts;
use framechester_core::config::Config;
use framechester_core::domain::{
    now_unix, AssetManifest, PipelineReport, PublishPrivacy, QaStatus, RenderProfile, Script,
    ScriptFormat, Stage, Timeline, TimelineScene, Topic,
};
use framechester_core::planner::plan_script;
use framechester_core::ports::{
    FactEvidenceProvider, GenerationBudget, LlmProvider, ScriptPrompt, TrendRequest, TrendSource,
};
use framechester_core::storyboard::{Storyboard, VideoFormat};
use framechester_motion::audio::LoudnessTarget;
use framechester_motion::narrate::narrate;
use framechester_motion::qa::{audit, QaInput};
use framechester_motion::raster::EncodeProfile;
use framechester_motion::render::{render, RenderRequest};
use std::path::{Path, PathBuf};

fn load_topic(path: Option<&Path>, index: usize) -> anyhow::Result<Topic> {
    if let Some(path) = path {
        let text = std::fs::read_to_string(path)
            .with_context(|| format!("ler topico {}", path.display()))?;
        let value: serde_json::Value = serde_json::from_str(&text)
            .with_context(|| format!("JSON invalido em {}", path.display()))?;
        if value.is_array() {
            let topics: Vec<Topic> = serde_json::from_value(value)?;
            return topics
                .get(index)
                .cloned()
                .with_context(|| format!("indice {index} fora da lista de topicos"));
        }
        return Ok(serde_json::from_value(value)?);
    }
    let signals = StaticTrendSource::sample().fetch(&TrendRequest {
        since: "2026-01-01".into(),
        region: "BR".into(),
        limit: 10,
    })?;
    let signal = signals
        .get(index)
        .with_context(|| format!("indice {index} fora dos topicos disponiveis"))?;
    if !signal.blocked_reasons.is_empty() {
        bail!("topico bloqueado: {}", signal.blocked_reasons.join("; "));
    }
    Ok(signal.topic.clone())
}

/// The declared format of an authored script document, so the same script can be
/// composed for any video format without rewriting its JSON.
fn declared_script_format(path: &Path) -> anyhow::Result<ScriptFormat> {
    let value: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(path)?)?;
    let format = value
        .get("script")
        .and_then(|script| script.get("format"))
        .cloned()
        .unwrap_or(serde_json::json!("short"));
    Ok(serde_json::from_value(format)?)
}

pub(crate) struct Planned {
    pub topic: Option<Topic>,
    pub script: Option<Script>,
    pub storyboard: Storyboard,
}

/// Builds the storyboard from `--storyboard` or from topic + authored script.
pub(crate) fn plan_from_args(
    config: &Config,
    args: &ProduceArgs,
    format: VideoFormat,
    channel_name: &str,
) -> anyhow::Result<Planned> {
    if let Some(path) = &args.storyboard {
        let text = std::fs::read_to_string(path)
            .with_context(|| format!("ler storyboard {}", path.display()))?;
        let mut storyboard: Storyboard =
            serde_json::from_str(&text).with_context(|| "storyboard JSON invalido")?;
        storyboard.format = format;
        storyboard.validate()?;
        return Ok(Planned {
            topic: None,
            script: None,
            storyboard,
        });
    }
    let Some(script_path) = &args.script else {
        bail!("informe --script (roteiro autoral) ou --storyboard");
    };
    let topic = load_topic(args.topic.as_deref(), args.topic_index)?;
    let script_format = declared_script_format(script_path)?;
    let provider = AuthoredScriptLlm::from_path(script_path)?;
    let prompt = ScriptPrompt {
        topic: topic.clone(),
        format: script_format,
        max_scenes: 64,
    };
    let mut script = provider.generate(&prompt, &GenerationBudget::default())?;
    script.claims = LocalEvidenceProvider.verify(&script.claims)?;
    let _ = config;
    let storyboard = plan_script(&script, channel_name, format)?;
    Ok(Planned {
        topic: Some(topic),
        script: Some(script),
        storyboard,
    })
}

fn resolve_format(args: &ProduceArgs) -> anyhow::Result<VideoFormat> {
    match &args.format {
        Some(value) => VideoFormat::parse(value).with_context(|| {
            format!("formato '{value}' desconhecido; use vertical, horizontal ou x")
        }),
        None => Ok(VideoFormat::Vertical),
    }
}

pub(crate) fn plan_command(
    config_path: &Option<PathBuf>,
    args: ProduceArgs,
) -> anyhow::Result<i32> {
    let config = load_config(config_path)?;
    let channel = config.select_channel(args.channel.as_deref())?;
    let format = resolve_format(&args)?;
    let channel_name = channel
        .as_ref()
        .map(|channel| channel.id.clone())
        .unwrap_or_else(|| "framechester".into());
    let planned = plan_from_args(&config, &args, format, &channel_name)?;
    let output = args
        .output
        .clone()
        .unwrap_or_else(|| PathBuf::from(format!("storyboard-{}.json", format.slug())));
    if let Some(parent) = output.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent)?;
        }
    }
    std::fs::write(&output, serde_json::to_string_pretty(&planned.storyboard)?)?;
    if args.json {
        println!("{}", serde_json::to_string_pretty(&planned.storyboard)?);
    } else {
        println!(
            "storyboard: {} cenas, formato {}, salvo em {}",
            planned.storyboard.scenes.len(),
            format.slug(),
            output.display()
        );
        for scene in &planned.storyboard.scenes {
            println!(
                "  cena {} [{}] {} animacoes: {}",
                scene.id,
                scene.composition.kind_name(),
                scene.animations.len(),
                scene.concept
            );
        }
    }
    Ok(0)
}

/// Legacy editorial QA still applies: the motion engine generates every visual, so each
/// scene gets a synthetic asset manifest and the timeline mirrors the storyboard.
fn editorial_inputs(storyboard: &Storyboard, voice: &Path) -> (Vec<AssetManifest>, Timeline) {
    let assets = storyboard
        .scenes
        .iter()
        .map(|scene| AssetManifest {
            scene_id: scene.id,
            kind: "motion".into(),
            path: None,
            license: "gerado localmente pelo motor Framechester (vetorial original)".into(),
            provenance: format!(
                "framechester-motion composicao {}",
                scene.composition.kind_name()
            ),
            checksum: storyboard
                .source_hash
                .clone()
                .unwrap_or_else(|| "n/a".into()),
            restrictions: "sem midia de terceiros".into(),
        })
        .collect();
    let timeline = Timeline {
        scenes: storyboard
            .scenes
            .iter()
            .map(|scene| TimelineScene {
                scene_id: scene.id,
                heading: scene.concept.clone(),
                background: "motion".into(),
                audio_path: voice.to_path_buf(),
                duration_secs: scene.duration_secs,
            })
            .collect(),
        captions: None,
    };
    (assets, timeline)
}

pub(crate) fn produce(config_path: &Option<PathBuf>, args: ProduceArgs) -> anyhow::Result<i32> {
    let config = load_config(config_path)?;
    let channel = config.select_channel(args.channel.as_deref())?;
    let format = resolve_format(&args)?;
    let channel_name = channel
        .as_ref()
        .map(|channel| channel.id.clone())
        .unwrap_or_else(|| "framechester".into());
    let mut workdir = args.workdir.clone().unwrap_or_else(|| {
        config.workdir_path().join(format!(
            "motion-{}-{}-{}",
            format.slug(),
            now_unix(),
            std::process::id()
        ))
    });
    if let Some(channel) = &channel {
        workdir = workdir.join("channels").join(&channel.id);
    }
    std::fs::create_dir_all(&workdir)?;
    let planned = plan_from_args(&config, &args, format, &channel_name)?;
    let mut storyboard = planned.storyboard;
    std::fs::write(
        workdir.join("storyboard.plan.json"),
        serde_json::to_string_pretty(&storyboard)?,
    )?;

    let voice = args
        .voice
        .clone()
        .unwrap_or_else(|| config.tts.voice_name.clone());
    let mut tts_config = config.tts.clone();
    tts_config.voice_name = voice.clone();
    let tts = KokoroTts::new(&tts_config)?;
    let cache_dir = config.workdir_path().join("cache");
    let narration = narrate(
        &mut storyboard,
        &tts,
        &voice,
        &workdir.join("audio"),
        Some(&cache_dir),
    )?;
    std::fs::write(
        workdir.join("storyboard.json"),
        serde_json::to_string_pretty(&storyboard)?,
    )?;

    let target = LoudnessTarget {
        integrated_lufs: config.audio.target_lufs,
        true_peak_dbtp: config.audio.true_peak_dbtp,
        range_lu: config.audio.loudness_range_lu,
    };
    let (width, height) = format.dimensions();
    let request = RenderRequest {
        voice: narration.voice.clone(),
        music: (!config.audio.music_path.trim().is_empty())
            .then(|| PathBuf::from(&config.audio.music_path)),
        music_gain_db: config.audio.music_gain_db,
        sfx: config.audio.transition_sfx,
        sfx_gain: config.audio.sfx_gain,
        target,
        encode: EncodeProfile {
            ffmpeg: config.render.ffmpeg_path.clone(),
            fps: config.render.fps,
            video_codec: config.render.video_codec.clone(),
            crf: config.render.crf,
            preset: config.render.preset.clone(),
            threads: config.motion.threads,
        },
        ffprobe: config.render.ffprobe_path.clone(),
        audio_bitrate_kbps: config.render.audio_bitrate_kbps,
        output_dir: workdir.join("render"),
        log: Some(workdir.join("render.log.jsonl")),
    };
    let artifacts = render(&storyboard, &request)?;

    let qa_document = audit(
        &storyboard,
        &artifacts.composed,
        &QaInput {
            ffmpeg: &config.render.ffmpeg_path,
            ffprobe: &config.render.ffprobe_path,
            video: &artifacts.video,
            srt: &artifacts.srt,
            contact_sheet: &artifacts.contact_sheet,
            target,
            expected_fps: config.render.fps,
            expected_codec: expected_codec(&config.render.video_codec),
        },
    )?;
    qa_document.write(&workdir.join("qa_report.json"))?;
    let technical = qa_document.report();

    let profile = RenderProfile {
        width,
        height,
        fps: config.render.fps,
        video_codec: config.render.video_codec.clone(),
        crf: config.render.crf,
        preset: config.render.preset.clone(),
        audio_bitrate_kbps: config.render.audio_bitrate_kbps,
    };
    let render_output = inspect_output(&config.render.ffprobe_path, &artifacts.video, &profile)?;
    let (assets, timeline) = editorial_inputs(&storyboard, &narration.voice);
    let (editorial, package) = match (&planned.script, &planned.topic) {
        (Some(script), Some(topic)) => {
            let editorial = framechester_core::qa::editorial(script, &assets, &timeline);
            let package = if technical.overall() != QaStatus::Fail {
                let package = framechester_core::package::write_package(
                    &workdir,
                    script,
                    topic,
                    &timeline,
                    &render_output,
                    &technical,
                    &editorial,
                    PublishPrivacy::Private,
                    None,
                    channel.as_ref(),
                )?;
                // Word-synced captions replace the estimated ones of the legacy package.
                std::fs::copy(&artifacts.srt, &package.subtitles)?;
                Some(package)
            } else {
                None
            };
            (Some(editorial), package)
        }
        _ => (None, None),
    };
    let mut warnings = vec![format!(
        "motor motion: {} segmentos narrados, {} do cache; timing por palavra estimado dentro de cada segmento",
        narration.segments_synthesized, narration.segments_cached
    )];
    let stage = if technical.overall() == QaStatus::Fail {
        warnings.push("QA tecnico falhou; render nao aprovado".into());
        Stage::Blocked
    } else {
        Stage::EditorialQa
    };
    let report = PipelineReport {
        channel: channel.clone(),
        topic_id: planned
            .topic
            .as_ref()
            .map(|topic| topic.id.clone())
            .unwrap_or_else(|| storyboard.title.clone()),
        stage,
        artifacts_dir: workdir.clone(),
        script: planned.script.clone(),
        render: Some(render_output),
        technical_qa: Some(technical.clone()),
        editorial_qa: editorial,
        publish: None,
        package,
        metrics: Vec::new(),
        warnings,
    };
    framechester_core::pipeline::write_report(&workdir, &report)?;
    write_html_report(&report, &workdir)?;
    if args.json {
        println!("{}", serde_json::to_string_pretty(&report)?);
    } else {
        print_report(&report);
        println!("storyboard: {}", workdir.join("storyboard.json").display());
        println!("legendas: {}", artifacts.srt.display());
        println!("contact sheet: {}", artifacts.contact_sheet.display());
        println!("qa: {}", workdir.join("qa_report.json").display());
        println!("manifesto: {}", artifacts.manifest_path.display());
        for timing in &artifacts.manifest.timings {
            println!("  {:<14} {:>7.2}s", timing.phase, timing.seconds);
        }
        if !qa_document.blocking.is_empty() {
            println!("bloqueios:");
            for item in &qa_document.blocking {
                println!("  - {item}");
            }
        }
    }
    Ok(if stage == Stage::Blocked { 2 } else { 0 })
}

fn expected_codec(encoder: &str) -> &'static str {
    match encoder {
        "libx265" | "hevc_amf" | "hevc_nvenc" => "hevc",
        "libvpx-vp9" => "vp9",
        "libaom-av1" | "libsvtav1" => "av1",
        _ => "h264",
    }
}
