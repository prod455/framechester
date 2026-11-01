//! Dynamic captions synchronized to the narration: short chunks of words, the spoken
//! word in the accent colour, emphasis words always in the accent colour and bold.
//! Also exports SRT from the same timing so file captions and burned captions agree.
use crate::components::{Ctx, Severity};
use crate::format::Rect;
use crate::scene::{Anchor, Node, Shape, Z_CAPTIONS};
use crate::tokens;
use framechester_core::storyboard::{narration_words, Easing, StoryboardScene, TimedWord};

/// Words shown together; chosen so a chunk fits on at most two caption lines.
#[derive(Debug, Clone, PartialEq)]
pub struct CaptionChunk {
    pub words: Vec<TimedWord>,
    pub start_secs: f32,
    pub end_secs: f32,
}

fn is_clause_end(word: &str) -> bool {
    word.ends_with([',', '.', ';', ':', '!', '?', '…'])
}

/// Groups timed words into chunks of `max_words`, breaking earlier at punctuation and
/// never crossing a segment boundary. Each chunk lasts until the next starts (or a short
/// tail after its last word), so captions never flash.
pub fn chunk_words(scene: &StoryboardScene, max_words: usize) -> Vec<CaptionChunk> {
    let mut chunks = Vec::new();
    for segment in &scene.segments {
        let mut current: Vec<TimedWord> = Vec::new();
        for (index, word) in segment.words.iter().enumerate() {
            current.push(word.clone());
            let remaining = segment.words.len() - index - 1;
            let clause = is_clause_end(&word.text) && current.len() >= 2;
            if current.len() >= max_words || (clause && remaining >= 2) || remaining == 0 {
                // Avoid a lonely last word: merge it into this chunk.
                if remaining == 1 && current.len() < max_words + 1 {
                    current.push(segment.words[index + 1].clone());
                    chunks.push(CaptionChunk {
                        start_secs: current[0].start_secs,
                        end_secs: current[current.len() - 1].end_secs,
                        words: std::mem::take(&mut current),
                    });
                    break;
                }
                chunks.push(CaptionChunk {
                    start_secs: current[0].start_secs,
                    end_secs: current[current.len() - 1].end_secs,
                    words: std::mem::take(&mut current),
                });
            }
        }
    }
    // Consecutive chunks never overlap: a chunk holds until just before the next one
    // starts (at most 0.6 s after its last word), and the last one lingers half a second.
    let count = chunks.len();
    for index in 0..count {
        let next_start = chunks.get(index + 1).map(|chunk| chunk.start_secs);
        let chunk = &mut chunks[index];
        chunk.end_secs = match next_start {
            Some(next) => (next - 0.04)
                .max(chunk.end_secs.min(next - 0.04))
                .min(chunk.end_secs + 0.6),
            None => (chunk.end_secs + 0.5).min(scene.duration_secs.max(chunk.end_secs + 0.1)),
        };
        if chunk.end_secs <= chunk.start_secs {
            chunk.end_secs = chunk.start_secs + 0.05;
        }
    }
    chunks
}

fn clean(word: &str) -> String {
    narration_words(word).join(" ")
}

/// Caption nodes for one scene. Chunks are laid out in the caption band, one or two
/// lines, centred; each word has a base node and an accent copy that appears while the
/// word is spoken. Emphasis words stay in the accent colour.
/// Width of a caption line as it is drawn: word by word in bold, each word with its own
/// side bearings, joined by one space. Measuring the joined string instead counts the side
/// bearings once and lets the last words of a full line spill out of the band.
fn placed_width(ts: &crate::text::Typesetter, line: &str, size: f32, family: &'static str) -> f32 {
    let words: Vec<&str> = line.split_whitespace().collect();
    let widths: f32 = words
        .iter()
        .map(|word| ts.measure(word, size, tokens::WEIGHT_BOLD, family))
        .sum();
    widths + space_width(ts, size, family) * words.len().saturating_sub(1) as f32
}

fn space_width(ts: &crate::text::Typesetter, size: f32, family: &'static str) -> f32 {
    ts.measure("a a", size, tokens::WEIGHT_BOLD, family)
        - ts.measure("aa", size, tokens::WEIGHT_BOLD, family)
}

/// Greedy lines no wider than `max_width` as drawn; a single word wider than that stays on
/// its own line (the caller reports it).
fn wrap_placed(
    ts: &crate::text::Typesetter,
    text: &str,
    size: f32,
    family: &'static str,
    max_width: f32,
) -> Vec<String> {
    let mut lines: Vec<String> = Vec::new();
    let mut current = String::new();
    for word in text.split_whitespace() {
        let candidate = if current.is_empty() {
            word.to_string()
        } else {
            format!("{current} {word}")
        };
        if current.is_empty() || placed_width(ts, &candidate, size, family) <= max_width {
            current = candidate;
        } else {
            lines.push(std::mem::replace(&mut current, word.to_string()));
        }
    }
    if !current.is_empty() {
        lines.push(current);
    }
    lines
}

/// The largest size from `max_size` down to `min_size` whose drawn lines fit the box.
fn fit_placed(
    ts: &crate::text::Typesetter,
    text: &str,
    max_size: f32,
    min_size: f32,
    max_width: f32,
    max_height: f32,
    family: &'static str,
) -> Option<(f32, Vec<String>)> {
    let mut size = max_size;
    loop {
        let lines = wrap_placed(ts, text, size, family, max_width);
        let fits = lines.len() as f32 * size * tokens::LINE_HEIGHT <= max_height
            && lines
                .iter()
                .all(|line| placed_width(ts, line, size, family) <= max_width);
        if fits {
            return Some((size, lines));
        }
        if size <= min_size {
            return None;
        }
        size = (size - 2.0).max(min_size);
    }
}

pub fn build(ctx: &mut Ctx<'_>, scene: &StoryboardScene) -> Vec<Node> {
    if scene.captions.hidden {
        return Vec::new();
    }
    let canvas = ctx.canvas;
    let band = canvas.captions;
    let size = canvas.type_scale.caption;
    let family = tokens::FONT_SANS;
    let max_words = if canvas.vertical { 5 } else { 7 };
    let emphasis: Vec<String> = scene
        .captions
        .emphasis
        .iter()
        .map(|word| clean(word))
        .collect();
    let mut nodes = Vec::new();
    for (chunk_index, chunk) in chunk_words(scene, max_words).iter().enumerate() {
        let object = format!("caption:{chunk_index}");
        let text = chunk
            .words
            .iter()
            .map(|word| word.text.as_str())
            .collect::<Vec<_>>()
            .join(" ");
        let fitted = fit_placed(
            ctx.ts,
            &text,
            size,
            size * 0.72,
            band.w - canvas.gap,
            band.h,
            family,
        );
        let (size, lines) = match fitted {
            Some(found) => found,
            None => {
                ctx.issue(
                    Severity::Critical,
                    "caption_overflow",
                    format!("legenda '{text}' nao cabe na faixa de legendas"),
                );
                (
                    size * 0.72,
                    wrap_placed(ctx.ts, &text, size * 0.72, family, band.w - canvas.gap),
                )
            }
        };
        let line_h = size * tokens::LINE_HEIGHT;
        let block_h = line_h * lines.len() as f32;
        let top = band.y + (band.h - block_h) / 2.0;
        let pad = size * 0.4;
        let widest = lines
            .iter()
            .map(|line| placed_width(ctx.ts, line, size, family))
            .fold(0.0f32, f32::max);
        let box_rect = Rect::new(
            band.cx() - widest / 2.0 - pad,
            top - pad * 0.6,
            widest + 2.0 * pad,
            block_h + pad * 1.2,
        );
        let mut background = Node::new(
            &object,
            Shape::Rect {
                rect: box_rect,
                rx: size * 0.35,
                fill: "rgba(5,8,14,0.78)".into(),
                stroke: None,
            },
        )
        .with_z(Z_CAPTIONS)
        .decorative();
        let fade = 0.08f32;
        let visible_end = (chunk.end_secs - fade).max(chunk.start_secs + fade);
        background.props.opacity.key(0.0, 0.0, Easing::Linear);
        background
            .props
            .opacity
            .to(chunk.start_secs, fade, 1.0, Easing::EaseOut);
        background
            .props
            .opacity
            .to(visible_end, fade, 0.0, Easing::EaseIn);
        nodes.push(background);
        let mut word_cursor = 0usize;
        for (line_index, line) in lines.iter().enumerate() {
            let line_words: Vec<&str> = line.split_whitespace().collect();
            let line_width = placed_width(ctx.ts, line, size, family);
            let mut x = band.cx() - line_width / 2.0;
            let baseline = top + line_index as f32 * line_h + size * 0.85;
            let space = space_width(ctx.ts, size, family);
            for word_text in line_words {
                let timed = chunk.words.get(word_cursor);
                word_cursor += 1;
                let emphasized = emphasis.iter().any(|term| term == &clean(word_text));
                let weight = tokens::WEIGHT_BOLD;
                let base_colour = if emphasized {
                    tokens::ACCENT
                } else {
                    tokens::INK
                };
                let mut base = ctx.ts.line(
                    &object,
                    word_text,
                    x,
                    baseline,
                    size,
                    weight,
                    family,
                    base_colour,
                    Anchor::Start,
                );
                base.z = Z_CAPTIONS + 1;
                base.props.opacity.key(0.0, 0.0, Easing::Linear);
                base.props
                    .opacity
                    .to(chunk.start_secs, fade, 1.0, Easing::EaseOut);
                base.props
                    .opacity
                    .to(visible_end, fade, 0.0, Easing::EaseIn);
                let width = ctx.ts.measure(word_text, size, weight, family);
                if let Some(timed) = timed {
                    if !emphasized {
                        let mut accent = ctx.ts.line(
                            &object,
                            word_text,
                            x,
                            baseline,
                            size,
                            weight,
                            family,
                            tokens::ACCENT,
                            Anchor::Start,
                        );
                        accent.z = Z_CAPTIONS + 2;
                        let lit_start = timed.start_secs.clamp(chunk.start_secs, visible_end);
                        let lit_end = timed.end_secs.max(lit_start + 0.12).min(visible_end);
                        accent.props.opacity.key(0.0, 0.0, Easing::Linear);
                        accent
                            .props
                            .opacity
                            .to(lit_start, 0.06, 1.0, Easing::EaseOut);
                        accent.props.opacity.to(lit_end, 0.08, 0.0, Easing::EaseIn);
                        accent.readable = false;
                        nodes.push(accent);
                    } else {
                        base.props
                            .scale
                            .to(timed.start_secs, 0.12, 1.08, Easing::EaseOut);
                        base.props
                            .scale
                            .to(timed.start_secs + 0.12, 0.18, 1.0, Easing::EaseInOut);
                    }
                }
                nodes.push(base);
                x += width + space;
            }
        }
    }
    nodes
}

fn srt_time(seconds: f32) -> String {
    let total_ms = (seconds.max(0.0) * 1000.0).round() as u64;
    format!(
        "{:02}:{:02}:{:02},{:03}",
        total_ms / 3_600_000,
        (total_ms % 3_600_000) / 60_000,
        (total_ms % 60_000) / 1_000,
        total_ms % 1_000
    )
}

/// SRT with the same chunks the burned captions use, at absolute video times.
pub fn build_srt(scenes: &[StoryboardScene], vertical: bool) -> String {
    let max_words = if vertical { 5 } else { 7 };
    let mut output = String::new();
    let mut sequence = 1usize;
    for scene in scenes {
        for chunk in chunk_words(scene, max_words) {
            let text = chunk
                .words
                .iter()
                .map(|word| word.text.as_str())
                .collect::<Vec<_>>()
                .join(" ");
            output.push_str(&format!(
                "{sequence}\n{} --> {}\n{text}\n\n",
                srt_time(scene.start_secs + chunk.start_secs),
                srt_time(scene.start_secs + chunk.end_secs)
            ));
            sequence += 1;
        }
    }
    output
}

#[cfg(test)]
mod tests {
    use super::*;
    use framechester_core::narration::{assemble_scene, segment_narration, SegmentAudio};
    use framechester_core::storyboard::*;

    fn scene() -> StoryboardScene {
        scene_saying(
            "Um agente decide o proximo passo, usa uma ferramenta e observa o resultado. Depois repete tudo.",
        )
    }

    fn scene_saying(narration: &str) -> StoryboardScene {
        let texts = segment_narration(narration);
        let audio: Vec<SegmentAudio> = texts
            .iter()
            .map(|text| SegmentAudio {
                duration_secs: text.split_whitespace().count() as f32 * 0.35,
                leading_silence_secs: 0.05,
                trailing_silence_secs: 0.1,
                pauses: Vec::new(),
            })
            .collect();
        let (segments, duration) = assemble_scene(&texts, &audio, &[false, false]);
        StoryboardScene {
            id: 1,
            concept: "c".into(),
            learning_goal: "g".into(),
            narration: narration.to_string(),
            segments,
            duration_secs: duration,
            start_secs: 10.0,
            composition: Composition::Title {
                text: "x".into(),
                kicker: None,
            },
            animations: Vec::new(),
            captions: CaptionPlan {
                emphasis: vec!["repete".into()],
                hidden: false,
            },
            resources: Vec::new(),
            validation: ValidationCriteria::default(),
            transition: Transition::Cut,
        }
    }

    #[test]
    fn chunks_follow_punctuation_and_never_leave_a_lonely_word() {
        let chunks = chunk_words(&scene(), 5);
        assert!(
            chunks
                .iter()
                .all(|chunk| chunk.words.len() >= 2 && chunk.words.len() <= 6),
            "{chunks:?}"
        );
        for pair in chunks.windows(2) {
            assert!(pair[0].end_secs < pair[1].start_secs, "{pair:?}");
        }
        let total: usize = chunks.iter().map(|chunk| chunk.words.len()).sum();
        assert_eq!(total, 16);
    }

    #[test]
    fn srt_uses_absolute_times_and_the_same_text() {
        let srt = build_srt(&[scene()], true);
        assert!(srt.starts_with("1\n00:00:10,0"), "{srt}");
        assert!(srt.contains("Depois repete tudo."));
    }

    #[test]
    fn caption_nodes_stay_in_the_band_and_light_the_spoken_word() {
        let typesetter = crate::text::Typesetter::new().unwrap();
        let canvas = crate::format::Canvas::for_format(VideoFormat::Vertical);
        let mut ctx = Ctx::new(&canvas, &typesetter, 1);
        let scene = scene();
        let nodes = build(&mut ctx, &scene);
        assert!(ctx.issues.is_empty(), "{:?}", ctx.issues);
        for node in nodes.iter().filter(|node| node.is_text()) {
            assert!(
                canvas.captions.inset(-4.0).contains(&node.bbox()),
                "{:?} outside {:?}",
                node.bbox(),
                canvas.captions
            );
        }
        let word = scene.segments[0].words[1].clone();
        let mid = (word.start_secs + word.end_secs) / 2.0;
        let lit = nodes
            .iter()
            .filter(|node| node.z == Z_CAPTIONS + 2 && node.props.opacity.eval(mid) > 0.9)
            .count();
        assert_eq!(lit, 1, "exactly one accent word while speaking");
    }

    #[test]
    fn long_bold_lines_stay_inside_the_caption_band_in_every_format() {
        // Wide words fill a 7-word chunk to the edge of the band: the line is measured with
        // the weight it is drawn with, so the last word ('cores.') does not spill out.
        let typesetter = crate::text::Typesetter::new().unwrap();
        let words = [
            "modelos", "aprendem", "padroes", "em", "milhoes", "de", "imagens", "com", "pixels",
            "e", "camadas", "que", "separam", "formas", "texturas", "luzes",
        ];
        for format in [
            VideoFormat::Horizontal,
            VideoFormat::Vertical,
            VideoFormat::X,
        ] {
            let canvas = crate::format::Canvas::for_format(format);
            for start in 0..words.len() {
                for count in 3..=6 {
                    let mut chosen: Vec<&str> = words
                        .iter()
                        .cycle()
                        .skip(start)
                        .take(count)
                        .copied()
                        .collect();
                    chosen.push("cores.");
                    let narration = chosen.join(" ");
                    let mut ctx = Ctx::new(&canvas, &typesetter, 1);
                    let nodes = build(&mut ctx, &scene_saying(&narration));
                    let band = canvas.captions.inset(-6.0);
                    for node in nodes.iter().filter(|node| node.readable && node.is_text()) {
                        assert!(
                            band.contains(&node.bbox()),
                            "{format:?} '{narration}': {:?} outside {:?}",
                            node.bbox(),
                            canvas.captions
                        );
                    }
                }
            }
        }
    }
}
