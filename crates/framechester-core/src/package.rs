use crate::domain::{
    now_unix, PublishPackage, PublishPrivacy, QaReport, QaStatus, RenderOutput, Script, Timeline,
    Topic,
};
use crate::error::Result;
use crate::security::sanitize_text;
use std::path::{Path, PathBuf};

const MAX_CAPTION_CHARS: usize = 50;
const MAX_CAPTION_WORDS: usize = 12;

fn srt_time(milliseconds: u64) -> String {
    let hours = milliseconds / 3_600_000;
    let minutes = (milliseconds % 3_600_000) / 60_000;
    let seconds = (milliseconds % 60_000) / 1_000;
    let millis = milliseconds % 1_000;
    format!("{hours:02}:{minutes:02}:{seconds:02},{millis:03}")
}

pub fn chapter_time(seconds: f32) -> String {
    let total = seconds.max(0.0).round() as u64;
    let hours = total / 3600;
    let minutes = (total % 3600) / 60;
    let secs = total % 60;
    if hours > 0 {
        format!("{hours}:{minutes:02}:{secs:02}")
    } else {
        format!("{minutes:02}:{secs:02}")
    }
}

fn pack_words(sentence: &str, chunks: &mut Vec<String>) {
    let mut current = String::new();
    let mut words = 0usize;
    for word in sentence.split_whitespace() {
        let projected = if current.is_empty() {
            word.chars().count()
        } else {
            current.chars().count() + 1 + word.chars().count()
        };
        if !current.is_empty() && (projected > MAX_CAPTION_CHARS || words >= MAX_CAPTION_WORDS) {
            chunks.push(std::mem::take(&mut current));
            words = 0;
        }
        if !current.is_empty() {
            current.push(' ');
        }
        current.push_str(word);
        words += 1;
    }
    if !current.is_empty() {
        chunks.push(current);
    }
}

fn merge_tail(chunks: &mut Vec<String>, start: usize) {
    while chunks.len() > start + 1 {
        let last = chunks.last().expect("chunk").clone();
        let previous = chunks
            .get(chunks.len().saturating_sub(2))
            .expect("chunk anterior")
            .clone();
        let combined = previous.chars().count() + 1 + last.chars().count();
        if last.split_whitespace().count() <= 2 && combined <= MAX_CAPTION_CHARS + 12 {
            chunks.pop();
            let target = chunks.last_mut().expect("chunk anterior");
            target.push(' ');
            target.push_str(&last);
        } else {
            break;
        }
    }
}

fn caption_chunks(text: &str) -> Vec<String> {
    let normalized = text.split_whitespace().collect::<Vec<_>>().join(" ");
    if normalized.is_empty() {
        return Vec::new();
    }
    let mut chunks = Vec::new();
    let mut sentence = String::new();
    for character in normalized.chars() {
        sentence.push(character);
        if matches!(character, '.' | '!' | '?' | ';') {
            let trimmed = sentence.trim();
            if !trimmed.is_empty() {
                let start = chunks.len();
                pack_words(trimmed, &mut chunks);
                merge_tail(&mut chunks, start);
            }
            sentence.clear();
        }
    }
    let rest = sentence.trim();
    if !rest.is_empty() {
        let start = chunks.len();
        pack_words(rest, &mut chunks);
        merge_tail(&mut chunks, start);
    }
    chunks
}

fn allocate_chunks(chunks: &[String], duration_secs: f32) -> Vec<(u64, u64)> {
    if chunks.is_empty() {
        return Vec::new();
    }
    let total_ms = (duration_secs.max(0.1) * 1000.0).round() as u64;
    let weights: Vec<u64> = chunks
        .iter()
        .map(|chunk| (chunk.chars().count() as u64).max(1))
        .collect();
    let total_weight: u64 = weights.iter().sum::<u64>().max(1);
    let mut cursor = 0u64;
    let mut times = Vec::with_capacity(chunks.len());
    for (index, weight) in weights.iter().enumerate() {
        let end = if index + 1 == chunks.len() {
            total_ms
        } else {
            cursor + total_ms.saturating_mul(*weight) / total_weight
        };
        times.push((cursor, end.max(cursor + 1)));
        cursor = end.max(cursor + 1);
    }
    times
}

pub fn build_srt(script: &Script, timeline: &Timeline) -> String {
    let mut output = String::new();
    let mut sequence = 1usize;
    let mut offset_ms = 0u64;
    for timeline_scene in &timeline.scenes {
        let scene = script
            .scenes
            .iter()
            .find(|scene| scene.id == timeline_scene.scene_id);
        let Some(scene) = scene else {
            offset_ms += (timeline_scene.duration_secs.max(0.1) * 1000.0).round() as u64;
            continue;
        };
        let chunks = caption_chunks(&scene.narration);
        let times = allocate_chunks(&chunks, timeline_scene.duration_secs);
        for (chunk, (start, end)) in chunks.iter().zip(times.iter()) {
            output.push_str(&format!(
                "{sequence}\n{} --> {}\n{}\n\n",
                srt_time(offset_ms + *start),
                srt_time(offset_ms + *end),
                chunk
            ));
            sequence += 1;
        }
        offset_ms += (timeline_scene.duration_secs.max(0.1) * 1000.0).round() as u64;
    }
    output
}

/// Fixed text of the description, in the channel's language.
struct DescriptionText {
    chapters: &'static str,
    sources: &'static str,
    license: &'static str,
    none: &'static str,
    disclosure: &'static str,
    tags: [&'static str; 3],
}

fn description_text(language: &str) -> DescriptionText {
    match language {
        "en-US" => DescriptionText {
            chapters: "In this video:",
            sources: "Sources and licenses:",
            license: "license",
            none: "(none)",
            disclosure: "Disclosure: this video's narration was synthesized locally with Kokoro (Apache-2.0). \
                         The script, facts and sources require human review before publication. \
                         This content does not promise financial results, eligibility or revenue.",
            tags: ["technology", "science", "artificial intelligence"],
        },
        "es" => DescriptionText {
            chapters: "En este video:",
            sources: "Fuentes y licencias:",
            license: "licencia",
            none: "(ninguna)",
            disclosure: "Transparencia: la narración de este video se sintetizó localmente con Kokoro (Apache-2.0). \
                         El guion, los datos y las fuentes requieren revisión humana antes de publicarse. \
                         Este contenido no promete resultados financieros, elegibilidad ni ingresos.",
            tags: ["tecnología", "ciencia", "inteligencia artificial"],
        },
        _ => DescriptionText {
            chapters: "Neste vídeo:",
            sources: "Fontes e licenças:",
            license: "licença",
            none: "(nenhuma)",
            disclosure: "Transparência: a narração deste vídeo foi sintetizada localmente com Kokoro (Apache-2.0). \
                         O roteiro, os fatos e as fontes exigem revisão humana antes da publicação. \
                         Este conteúdo não promete resultados financeiros, elegibilidade ou receita.",
            tags: ["tecnologia", "ciencia", "inteligencia artificial"],
        },
    }
}

pub fn build_description(
    script: &Script,
    topic: &Topic,
    timeline: &Timeline,
    language: &str,
) -> String {
    let text = description_text(language);
    let mut chapters = String::new();
    let mut cursor = 0.0f32;
    for (index, scene) in script.scenes.iter().enumerate() {
        if index == 0 || cursor > 0.0 {
            chapters.push_str(&format!("{} {}\n", chapter_time(cursor), scene.heading));
        }
        if let Some(timeline_scene) = timeline
            .scenes
            .iter()
            .find(|timeline_scene| timeline_scene.scene_id == scene.id)
        {
            cursor += timeline_scene.duration_secs;
        }
    }
    let sources = topic
        .sources
        .iter()
        .map(|source| {
            format!(
                "- {} | {} | {} | {}: {}",
                source.title, source.publisher, source.url, text.license, source.license
            )
        })
        .collect::<Vec<_>>()
        .join("\n");
    format!(
        "{hook}\n\n{heading}\n{chapters}\n{sources_heading}\n{sources}\n\n{disclosure}",
        hook = script.hook,
        heading = text.chapters,
        chapters = chapters.trim_end(),
        sources_heading = text.sources,
        sources = if sources.is_empty() {
            text.none
        } else {
            &sources
        },
        disclosure = text.disclosure,
    )
}

pub fn build_tags(script: &Script, topic: &Topic, language: &str) -> Vec<String> {
    let mut tags = vec![topic.series.clone()];
    tags.extend(description_text(language).tags.map(str::to_string));
    for word in script
        .title
        .split(|character: char| !character.is_alphanumeric())
        .filter(|word| word.chars().count() >= 4)
    {
        tags.push(word.to_lowercase());
    }
    tags.sort();
    tags.dedup();
    tags.truncate(10);
    tags
}

fn qa_label(status: QaStatus) -> &'static str {
    match status {
        QaStatus::Pass => "pass",
        QaStatus::Fail => "fail",
        QaStatus::NeedsHuman => "needs_human",
        QaStatus::Skipped => "skipped",
    }
}

#[allow(clippy::too_many_arguments)]
pub fn build_metadata(
    script: &Script,
    topic: &Topic,
    timeline: &Timeline,
    render: &RenderOutput,
    technical: &QaReport,
    editorial: &QaReport,
    privacy: PublishPrivacy,
    thumbnail: Option<&Path>,
    language: &str,
) -> serde_json::Value {
    let description = build_description(script, topic, timeline, language);
    serde_json::json!({
        "title": script.title,
        "description": description,
        "language": language,
        "tags": build_tags(script, topic, language),
        "categoryId": "28",
        "privacyStatus": privacy,
        "madeForKids": false,
        "containsSyntheticMedia": true,
        "series": script.series,
        "sources": topic.sources,
        "claims": script.claims,
        "render": {
            "path": render.path,
            "duration_secs": render.duration_secs,
            "bytes": render.bytes,
            "sha256": render.sha256,
            "width": render.width,
            "height": render.height,
            "fps": render.fps,
            "subtitlesBurned": timeline.captions.is_some(),
        },
        "qa": {
            "technical": qa_label(technical.overall()),
            "editorial": qa_label(editorial.overall()),
            "asr": technical
                .checks
                .iter()
                .find(|check| check.id == "asr_coverage")
                .map(|check| serde_json::json!({
                    "status": qa_label(check.status),
                    "detail": check.detail,
                })),
        },
        "thumbnail": thumbnail.map(|path| path.display().to_string()),
        "generated_at_unix": now_unix(),
    })
}

pub fn build_sources_markdown(topic: &Topic, script: &Script) -> String {
    let mut output = format!(
        "# Fontes e licenças - {}\n\n| Fonte | Publicador | URL | Coletado em | Licença |\n|---|---|---|---|---|\n",
        script.title
    );
    for source in &topic.sources {
        output.push_str(&format!(
            "| {} | {} | {} | {} | {} |\n",
            source.title, source.publisher, source.url, source.retrieved_at, source.license
        ));
    }
    output.push_str("\n## Claims\n\n| Claim | Status | Fontes |\n|---|---|---|\n");
    for claim in &script.claims {
        output.push_str(&format!(
            "| {} | {:?} | {} |\n",
            claim.text,
            claim.status,
            claim.source_urls.join(", ")
        ));
    }
    output
}

#[allow(clippy::too_many_arguments)]
pub fn write_package(
    workdir: &Path,
    script: &Script,
    topic: &Topic,
    timeline: &Timeline,
    render: &RenderOutput,
    technical: &QaReport,
    editorial: &QaReport,
    privacy: PublishPrivacy,
    thumbnail: Option<PathBuf>,
    channel: Option<&crate::channel::ChannelProfile>,
) -> Result<PublishPackage> {
    let directory = workdir.join("publish");
    std::fs::create_dir_all(&directory)?;
    let subtitles = directory.join("final.srt");
    let description = directory.join("description.txt");
    let metadata = directory.join("metadata.json");
    let sources = directory.join("sources.md");
    std::fs::write(&subtitles, build_srt(script, timeline))?;
    let language = channel.map_or("pt-BR", |channel| channel.language());
    std::fs::write(
        &description,
        build_description(script, topic, timeline, language),
    )?;
    std::fs::write(&sources, build_sources_markdown(topic, script))?;
    let mut metadata_value = build_metadata(
        script,
        topic,
        timeline,
        render,
        technical,
        editorial,
        privacy,
        thumbnail.as_deref(),
        language,
    );
    if let Some(channel) = channel {
        metadata_value["channel"] = serde_json::to_value(channel)?;
    }
    std::fs::write(&metadata, serde_json::to_string_pretty(&metadata_value)?)?;
    Ok(PublishPackage {
        subtitles,
        description,
        metadata,
        sources,
        thumbnail,
    })
}

pub fn sanitize_caption(text: &str) -> String {
    sanitize_text(text).replace('\n', " ")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::{
        Claim, ClaimStatus, QaCheck, RenderOutput, Scene, ScriptFormat, Source, TimelineScene,
        TrendMetrics,
    };

    fn script() -> Script {
        Script {
            title: "Teste de legenda".into(),
            hook: "Hook".into(),
            series: "ia".into(),
            format: ScriptFormat::Short,
            scenes: vec![
                Scene {
                    id: 0,
                    heading: "Abertura".into(),
                    narration: "Primeira cena com uma frase curta.".into(),
                    visual_brief: "visual".into(),
                    duration_hint_secs: 10.0,
                },
                Scene {
                    id: 1,
                    heading: "Fechamento".into(),
                    narration: "Segunda cena, agora um pouco mais longa, para testar a divisao em blocos de legenda.".into(),
                    visual_brief: "visual".into(),
                    duration_hint_secs: 12.0,
                },
            ],
            sources: vec![Source {
                title: "Fonte".into(),
                url: "https://example.com".into(),
                publisher: "Pub".into(),
                retrieved_at: "2026-10-27".into(),
                license: "CC BY 4.0".into(),
            }],
            claims: vec![Claim {
                text: "claim".into(),
                status: ClaimStatus::Cited,
                source_urls: vec!["https://example.com".into()],
            }],
            cross_checked: false,
        }
    }

    fn timeline() -> Timeline {
        Timeline {
            captions: None,
            scenes: vec![
                TimelineScene {
                    scene_id: 0,
                    heading: "Abertura".into(),
                    background: "testsrc2".into(),
                    audio_path: "a.wav".into(),
                    duration_secs: 10.0,
                },
                TimelineScene {
                    scene_id: 1,
                    heading: "Fechamento".into(),
                    background: "testsrc2".into(),
                    audio_path: "b.wav".into(),
                    duration_secs: 12.0,
                },
            ],
        }
    }

    fn topic() -> Topic {
        Topic {
            id: "t".into(),
            title: "Tema".into(),
            series: "ia".into(),
            angle: "angulo".into(),
            sources: script().sources.clone(),
            claims: script().claims.clone(),
            metrics: TrendMetrics::default(),
        }
    }

    fn render() -> RenderOutput {
        RenderOutput {
            path: PathBuf::from("final.mp4"),
            duration_secs: 22.0,
            bytes: 100,
            sha256: "abc".into(),
            video_codec: "h264".into(),
            width: 1920,
            height: 1080,
            fps: 30,
        }
    }

    fn qa() -> QaReport {
        QaReport::new(vec![QaCheck {
            id: "x".into(),
            name: "x".into(),
            status: QaStatus::Pass,
            detail: "ok".into(),
        }])
    }

    #[test]
    fn srt_has_sequence_and_full_duration() {
        let srt = build_srt(&script(), &timeline());
        assert!(srt.starts_with("1\n00:00:00,000 -->"));
        assert!(srt.contains("00:00:22,000"));
        assert!(srt.contains("Segunda cena"));
    }

    #[test]
    fn merges_short_tail_into_previous_chunk() {
        let chunks = caption_chunks(
            "A ideia central é explicar o que realmente importa, sem prometer mais do que as fontes mostram.",
        );
        assert_eq!(chunks.len(), 2, "{chunks:?}");
        assert!(chunks[1].ends_with("mostram."), "{chunks:?}");
    }

    #[test]
    fn captions_respect_size_limit() {
        let chunks = caption_chunks(
            "uma frase muito longa com varias palavras para testar a quebra automatica em blocos menores de legenda",
        );
        assert!(chunks.len() > 1);
        for chunk in chunks {
            assert!(chunk.chars().count() <= MAX_CAPTION_CHARS + 12);
            assert!(chunk.split_whitespace().count() <= MAX_CAPTION_WORDS);
        }
    }

    #[test]
    fn description_contains_sources_and_disclosure() {
        let text = build_description(&script(), &topic(), &timeline(), "pt-BR");
        assert!(text.contains("https://example.com"));
        assert!(text.contains("Transparência"));
        assert!(text.contains("Neste vídeo"));
    }

    #[test]
    fn description_and_tags_follow_the_channel_language() {
        let english = build_description(&script(), &topic(), &timeline(), "en-US");
        assert!(english.contains("In this video:"));
        assert!(english.contains("Sources and licenses:"));
        assert!(english.contains("Disclosure:"));
        assert!(!english.contains("Fontes"));
        let spanish = build_description(&script(), &topic(), &timeline(), "es");
        assert!(spanish.contains("En este video:"));
        assert!(spanish.contains("licencia:"));
        assert!(build_tags(&script(), &topic(), "en-US").contains(&"technology".to_string()));
        assert!(!build_tags(&script(), &topic(), "en-US").contains(&"tecnologia".to_string()));
    }

    #[test]
    fn metadata_is_explicit_about_synthetic_media() {
        let value = build_metadata(
            &script(),
            &topic(),
            &timeline(),
            &render(),
            &qa(),
            &qa(),
            PublishPrivacy::Private,
            None,
            "pt-BR",
        );
        assert_eq!(value["containsSyntheticMedia"], true);
        assert_eq!(value["privacyStatus"], "private");
        assert_eq!(value["categoryId"], "28");
        assert_eq!(value["render"]["subtitlesBurned"], false);

        let mut burned = timeline();
        burned.captions = Some(PathBuf::from("captions.srt"));
        let value = build_metadata(
            &script(),
            &topic(),
            &burned,
            &render(),
            &qa(),
            &qa(),
            PublishPrivacy::Private,
            None,
            "pt-BR",
        );
        assert_eq!(value["render"]["subtitlesBurned"], true);
    }

    #[test]
    fn package_writes_all_files() {
        let dir = std::env::temp_dir().join(format!("framechester-package-{}", now_unix()));
        std::fs::create_dir_all(&dir).unwrap();
        let package = write_package(
            &dir,
            &script(),
            &topic(),
            &timeline(),
            &render(),
            &qa(),
            &qa(),
            PublishPrivacy::Private,
            None,
            None,
        )
        .unwrap();
        assert!(package.subtitles.is_file());
        assert!(package.description.is_file());
        assert!(package.metadata.is_file());
        assert!(package.sources.is_file());
        std::fs::remove_dir_all(dir).ok();
    }
}
