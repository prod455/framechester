//! Splits a narrated storyboard into Shorts: the same reviewed content, re-edited for a
//! vertical feed. The video is cut into consecutive parts that fit the duration budget, in
//! the original order. A scene longer than a Short is cut between its sentences into
//! pieces that keep its picture. Every part after the first opens with the video's hook
//! (its first sentences: the question that makes a viewer stay). Nothing is rewritten, so
//! the editorial review of the source video still covers every Short, and the narration of
//! every sentence comes back from the TTS cache.
use crate::error::{FramechesterError, Result};
use crate::storyboard::{Cue, Motion, Storyboard, StoryboardScene, Transition, VideoFormat};

/// Under a minute keeps the Short in the format's tightest loop; a few seconds of margin
/// absorb the re-narration of cached sentences.
pub const DEFAULT_MAX_SECS: f32 = 58.0;
/// One video feeds at most this many Shorts; the rest of a very long video is left out.
pub const MAX_PARTS: usize = 5;
/// A last part with less new content than this (beyond the hook) is left out: it would be
/// little more than the hook again.
pub const MIN_NEW_SECS: f32 = 15.0;

#[derive(Debug, Clone)]
pub struct ShortCut {
    pub storyboard: Storyboard,
    /// Source scene ids, in order (a scene cut into pieces repeats); the hook first.
    pub kept: Vec<u32>,
    /// Sum of the kept pieces' source durations.
    pub duration_secs: f32,
}

#[derive(Debug, Clone)]
pub struct ShortParts {
    pub parts: Vec<ShortCut>,
    /// Source scenes with content in no part: past the last part, or a sentence longer
    /// than a Short.
    pub dropped: Vec<u32>,
}

/// Start of each segment inside the scene and the end of the scene: segment `i` spans
/// `bounds[i]..bounds[i + 1]`, its pause before it included.
fn bounds(scene: &StoryboardScene) -> Vec<f32> {
    let mut bounds: Vec<f32> = scene
        .segments
        .iter()
        .enumerate()
        .map(|(index, segment)| if index == 0 { 0.0 } else { segment.start_secs })
        .collect();
    bounds.push(scene.duration_secs);
    bounds
}

/// The sentences `from..to` of `scene` as a scene of their own, with the same picture.
/// Animations keep their moment inside the piece; one that happened before the piece
/// starts already applied (a transient highlight or pulse is dropped), one after it ends
/// is dropped.
fn piece(scene: &StoryboardScene, from: usize, to: usize) -> StoryboardScene {
    if from == 0 && to == scene.segments.len() {
        return scene.clone();
    }
    let bounds = bounds(scene);
    let (start, end) = (bounds[from], bounds[to]);
    let mut piece = scene.clone();
    piece.narration = scene.segments[from..to]
        .iter()
        .map(|segment| segment.text.as_str())
        .collect::<Vec<_>>()
        .join(" ");
    piece.segments = scene.segments[from..to]
        .iter()
        .map(|segment| {
            let mut segment = segment.clone();
            segment.start_secs = (segment.start_secs - start).max(0.0);
            segment.end_secs = (segment.end_secs - start).max(0.0);
            for word in &mut segment.words {
                word.start_secs = (word.start_secs - start).max(0.0);
                word.end_secs = (word.end_secs - start).max(0.0);
            }
            segment
        })
        .collect();
    piece.duration_secs = end - start;
    piece.start_secs = 0.0;
    piece.animations = scene
        .animations
        .iter()
        .filter_map(|animation| {
            let at = scene.resolve_cue(&animation.at) - start;
            let transient = matches!(animation.motion, Motion::Highlight | Motion::Pulse);
            let mut animation = animation.clone();
            animation.at = if at >= piece.duration_secs {
                return None;
            } else if at < 0.0 {
                if transient {
                    return None;
                }
                Cue::Start
            } else {
                Cue::Time { secs: at }
            };
            Some(animation)
        })
        .collect();
    if from > 0 {
        // Same picture as the piece before it: a continuation cuts straight in.
        piece.transition = Transition::Cut;
    }
    piece
}

/// `scene` as pieces of at most `max_secs`, cut between sentences. A single sentence
/// longer than that fits nowhere and is left out (reported as `false`).
fn pieces(scene: &StoryboardScene, max_secs: f32) -> (Vec<StoryboardScene>, bool) {
    if scene.duration_secs <= max_secs {
        return (vec![scene.clone()], true);
    }
    if scene.segments.is_empty() {
        return (Vec::new(), false);
    }
    let bounds = bounds(scene);
    let mut pieces = Vec::new();
    let mut complete = true;
    let mut from = 0usize;
    while from < scene.segments.len() {
        let mut to = from;
        while to < scene.segments.len() && bounds[to + 1] - bounds[from] <= max_secs {
            to += 1;
        }
        if to == from {
            complete = false;
            from += 1;
            continue;
        }
        pieces.push(piece(scene, from, to));
        from = to;
    }
    (pieces, complete)
}

/// The opening sentences of the first scene that fit in a third of a Short; none when the
/// first sentence alone is longer.
fn hook(scene: &StoryboardScene, max_secs: f32) -> Option<StoryboardScene> {
    if scene.duration_secs <= max_secs / 3.0 {
        return Some(scene.clone());
    }
    let bounds = bounds(scene);
    let to = (1..=scene.segments.len())
        .take_while(|to| bounds[*to] <= max_secs / 3.0)
        .last()?;
    Some(piece(scene, 0, to))
}

/// Splits `source` (already narrated: scenes carry real durations) into parts of at most
/// `max_secs` each.
pub fn parts(source: &Storyboard, max_secs: f32) -> Result<ShortParts> {
    let scenes = &source.scenes;
    if scenes.is_empty() || scenes.iter().any(|scene| scene.duration_secs <= 0.0) {
        return Err(FramechesterError::InvalidInput(
            "o Short parte de um vídeo já narrado; gere a versão final antes".into(),
        ));
    }
    let hook = hook(&scenes[0], max_secs);
    let hook_secs = hook.as_ref().map_or(0.0, |hook| hook.duration_secs);
    // The first part starts at the hook itself; the others carry it in front.
    let mut groups: Vec<Vec<(u32, StoryboardScene)>> = vec![Vec::new()];
    let mut incomplete = Vec::new();
    let mut used = 0.0f32;
    for scene in scenes {
        let (pieces, complete) = pieces(scene, max_secs - hook_secs);
        if !complete {
            incomplete.push(scene.id);
        }
        for piece in pieces {
            let budget = if groups.len() == 1 {
                max_secs
            } else {
                max_secs - hook_secs
            };
            if used + piece.duration_secs > budget && !groups.last().expect("groups").is_empty() {
                groups.push(Vec::new());
                used = 0.0;
            }
            used += piece.duration_secs;
            groups.last_mut().expect("groups").push((scene.id, piece));
        }
    }
    let new_secs = |group: &Vec<(u32, StoryboardScene)>| -> f32 {
        group.iter().map(|(_, piece)| piece.duration_secs).sum()
    };
    let mut left_out: Vec<(u32, StoryboardScene)> = Vec::new();
    if groups.len() > 1 && new_secs(groups.last().expect("groups")) < MIN_NEW_SECS {
        left_out.extend(groups.pop().expect("groups"));
    }
    if groups.len() > MAX_PARTS {
        left_out.extend(groups.drain(MAX_PARTS..).flatten());
    }
    if groups[0].is_empty() {
        return Err(FramechesterError::InvalidInput(format!(
            "nenhuma frase do vídeo cabe num Short de {max_secs:.0} s"
        )));
    }
    let parts: Vec<ShortCut> = groups
        .into_iter()
        .enumerate()
        .map(|(index, group)| {
            let mut kept: Vec<(u32, StoryboardScene)> = Vec::new();
            if index > 0 {
                if let Some(hook) = &hook {
                    kept.push((scenes[0].id, hook.clone()));
                }
            }
            kept.extend(group);
            let mut storyboard = source.clone();
            storyboard.format = VideoFormat::Vertical;
            storyboard.source_hash = None;
            storyboard.scenes = kept.iter().map(|(_, piece)| piece.clone()).collect();
            // Pieces of one scene would share its id: number the Short's own scenes.
            for (number, scene) in storyboard.scenes.iter_mut().enumerate() {
                scene.id = number as u32 + 1;
            }
            // The opening cuts straight in; timing is rebuilt when the cut is narrated again.
            storyboard.scenes[0].transition = Transition::Cut;
            ShortCut {
                duration_secs: storyboard
                    .scenes
                    .iter()
                    .map(|scene| scene.duration_secs)
                    .sum(),
                kept: kept.iter().map(|(id, _)| *id).collect(),
                storyboard,
            }
        })
        .collect();
    let mut dropped: Vec<u32> = incomplete;
    for (id, _) in left_out {
        if !parts.iter().any(|part| part.kept.contains(&id)) {
            dropped.push(id);
        }
    }
    dropped.sort_unstable();
    dropped.dedup();
    Ok(ShortParts { parts, dropped })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storyboard::{Animation, Composition, NarrationSegment, StoryboardScene, TimedWord};

    fn scene(id: u32, secs: f32, composition: Composition) -> StoryboardScene {
        StoryboardScene {
            id,
            concept: format!("Cena {id}"),
            learning_goal: "Entender a cena.".into(),
            narration: format!("Fala da cena {id}."),
            segments: Vec::new(),
            duration_secs: secs,
            start_secs: 0.0,
            composition,
            animations: Vec::new(),
            captions: Default::default(),
            resources: Vec::new(),
            validation: Default::default(),
            transition: Transition::Push,
        }
    }
    fn title() -> Composition {
        Composition::Title {
            text: "Título".into(),
            kicker: None,
        }
    }
    fn chart() -> Composition {
        Composition::Chart {
            title: "Dados".into(),
            objects: Vec::new(),
            max_value: None,
        }
    }
    fn storyboard(scenes: Vec<StoryboardScene>) -> Storyboard {
        Storyboard {
            version: crate::storyboard::SCHEMA_VERSION,
            title: "Vídeo".into(),
            channel: "Canal".into(),
            format: VideoFormat::Horizontal,
            language: "pt-BR".into(),
            scenes,
            source_hash: None,
        }
    }

    #[test]
    fn consecutive_parts_each_open_with_the_hook_and_fit_the_budget() {
        let source = storyboard(vec![
            scene(0, 6.0, title()),
            scene(1, 20.0, title()),
            scene(2, 25.0, chart()),
            scene(3, 30.0, title()),
            scene(4, 15.0, chart()),
            scene(5, 8.0, title()),
        ]);
        let split = parts(&source, 58.0).unwrap();
        let kept: Vec<Vec<u32>> = split.parts.iter().map(|part| part.kept.clone()).collect();
        assert_eq!(kept, vec![vec![0, 1, 2], vec![0, 3, 4]]);
        assert_eq!(split.dropped, vec![5], "8 s of new content is not a Short");
        for part in &split.parts {
            assert!(part.duration_secs <= 58.0);
            assert_eq!(part.storyboard.format, VideoFormat::Vertical);
            assert_eq!(part.kept[0], 0, "the hook opens every part");
            assert_eq!(
                part.storyboard.scenes[0].id, 1,
                "the Short numbers its own scenes"
            );
            assert_eq!(part.storyboard.scenes[0].transition, Transition::Cut);
        }
        assert!((split.parts[0].duration_secs - 51.0).abs() < 1e-4);
    }

    #[test]
    fn a_scene_too_long_for_any_part_is_left_out_and_parts_are_capped() {
        let mut scenes = vec![scene(0, 5.0, title()), scene(1, 60.0, chart())];
        scenes.extend((2..20).map(|id| scene(id, 50.0, title())));
        let split = parts(&storyboard(scenes), 58.0).unwrap();
        assert_eq!(split.parts.len(), MAX_PARTS);
        assert_eq!(split.parts[0].kept, vec![0, 2]);
        assert_eq!(split.dropped[0], 1);
        assert_eq!(split.dropped.len(), 1 + 18 - MAX_PARTS);
    }

    #[test]
    fn an_unnarrated_storyboard_and_one_with_nothing_that_fits_are_refused() {
        let raw = storyboard(vec![scene(0, 0.0, title())]);
        assert!(parts(&raw, 58.0)
            .unwrap_err()
            .to_string()
            .contains("narrado"));
        let unsplittable = storyboard(vec![scene(0, 70.0, title())]);
        assert!(parts(&unsplittable, 58.0)
            .unwrap_err()
            .to_string()
            .contains("nenhuma frase"));
    }

    /// A scene of `count` sentences of `secs` each, a 0.3 s pause before each one, and an
    /// animation on every sentence (reveals and highlights in turn).
    fn spoken(id: u32, count: usize, secs: f32) -> StoryboardScene {
        let mut scene = scene(id, 0.0, title());
        let mut cursor = 0.0f32;
        let mut texts = Vec::new();
        for index in 0..count {
            cursor += 0.3;
            let text = format!("Frase {index} da cena {id}.");
            scene.segments.push(NarrationSegment {
                text: text.clone(),
                start_secs: cursor,
                end_secs: cursor + secs,
                words: vec![TimedWord {
                    text: format!("Frase{index}"),
                    start_secs: cursor,
                    end_secs: cursor + secs,
                }],
                aligned: false,
            });
            scene.animations.push(Animation {
                target: "*".into(),
                motion: if index % 2 == 0 {
                    Motion::Reveal
                } else {
                    Motion::Highlight
                },
                at: Cue::Segment { index },
                duration_secs: 0.5,
                easing: Default::default(),
                destination: None,
            });
            texts.push(text);
            cursor += secs;
        }
        scene.narration = texts.join(" ");
        scene.duration_secs = cursor + 0.2;
        scene
    }

    #[test]
    fn a_long_opening_is_cut_between_sentences_and_lends_its_first_ones_as_the_hook() {
        // The reported case: a 62 s opening no longer refuses the split.
        let source = storyboard(vec![
            spoken(0, 8, 7.5),
            spoken(1, 6, 9.0),
            scene(2, 20.0, title()),
        ]);
        assert!(source.scenes[0].duration_secs > 58.0);
        let split = parts(&source, 58.0).unwrap();
        assert!(split.parts.len() >= 2);
        assert!(split.dropped.is_empty(), "{:?}", split.dropped);
        for (index, part) in split.parts.iter().enumerate() {
            assert!(
                part.duration_secs <= 58.0 + 1e-3,
                "part {index}: {}",
                part.duration_secs
            );
            part.storyboard.validate().unwrap();
            let ids: Vec<u32> = part
                .storyboard
                .scenes
                .iter()
                .map(|scene| scene.id)
                .collect();
            assert_eq!(ids, (1..=ids.len() as u32).collect::<Vec<_>>());
            for scene in &part.storyboard.scenes {
                let texts = crate::narration::segment_narration(&scene.narration);
                let said: Vec<&str> = scene
                    .segments
                    .iter()
                    .map(|segment| segment.text.as_str())
                    .collect();
                if !said.is_empty() {
                    assert_eq!(
                        texts, said,
                        "the same sentences come back from the TTS cache"
                    );
                }
                for animation in &scene.animations {
                    assert!(scene.resolve_cue(&animation.at) < scene.duration_secs);
                }
            }
        }
        // The first two sentences (15.6 s) open every later part: a third of a Short at most.
        let hook = &split.parts[1].storyboard.scenes[0];
        assert_eq!(split.parts[1].kept[0], 0);
        assert!(hook.duration_secs <= 58.0 / 3.0);
        assert_eq!(hook.segments.len(), 2);
        assert!(hook.narration.starts_with("Frase 0 da cena 0."));
        // The opening's second piece starts at its own first sentence, cuts in, keeps what
        // already showed and drops highlights that already passed.
        let continuation = split
            .parts
            .iter()
            .flat_map(|part| part.storyboard.scenes.iter())
            .find(|scene| scene.narration.starts_with("Frase 5 da cena 0."))
            .expect("the opening is cut in two");
        assert!(continuation.segments[0].start_secs < 0.5);
        assert_eq!(continuation.transition, Transition::Cut);
        assert!(continuation
            .animations
            .iter()
            .any(|animation| animation.at == Cue::Start));
        assert!(continuation
            .animations
            .iter()
            .all(|animation| animation.motion != Motion::Highlight || animation.at != Cue::Start));
    }

    #[test]
    fn a_short_source_is_one_whole_part() {
        let source = storyboard(vec![
            scene(0, 5.0, title()),
            scene(1, 10.0, chart()),
            scene(2, 5.0, title()),
        ]);
        let split = parts(&source, 58.0).unwrap();
        assert_eq!(split.parts.len(), 1);
        assert_eq!(split.parts[0].kept, vec![0, 1, 2]);
        assert!(split.dropped.is_empty());
    }
}
