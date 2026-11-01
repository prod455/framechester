//! Splits a narrated storyboard into Shorts: the same reviewed content, re-edited for a
//! vertical feed. The video is cut into consecutive parts that fit the duration budget, in
//! the original order, and every part opens with the video's hook (the first scene: the
//! question that makes a viewer stay). Nothing is rewritten, so the editorial review of the
//! source video still covers every Short.
use crate::error::{FramechesterError, Result};
use crate::storyboard::{Storyboard, Transition, VideoFormat};

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
    /// Source scene ids, in order; the hook first.
    pub kept: Vec<u32>,
    /// Sum of the kept scenes' source durations.
    pub duration_secs: f32,
}

#[derive(Debug, Clone)]
pub struct ShortParts {
    pub parts: Vec<ShortCut>,
    /// Source scenes in no part: longer than a part can hold, or past the last part.
    pub dropped: Vec<u32>,
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
    let hook = scenes[0].duration_secs;
    if hook > max_secs {
        return Err(FramechesterError::InvalidInput(format!(
            "a abertura tem {hook:.0} s e o Short cabe em {max_secs:.0} s; encurte a primeira cena"
        )));
    }
    // Indexes of the body scenes of each part; the hook is added when the parts are built.
    let mut groups: Vec<Vec<usize>> = vec![Vec::new()];
    let mut dropped = Vec::new();
    let mut used = hook;
    for (index, scene) in scenes.iter().enumerate().skip(1) {
        if hook + scene.duration_secs > max_secs {
            dropped.push(index);
            continue;
        }
        if used + scene.duration_secs > max_secs {
            groups.push(Vec::new());
            used = hook;
        }
        groups.last_mut().expect("one group at least").push(index);
        used += scene.duration_secs;
    }
    let new_secs = |group: &Vec<usize>| -> f32 {
        group.iter().map(|index| scenes[*index].duration_secs).sum()
    };
    if groups.len() > 1 && new_secs(groups.last().expect("groups")) < MIN_NEW_SECS {
        dropped.extend(groups.pop().expect("groups"));
    }
    if groups.len() > MAX_PARTS {
        dropped.extend(groups.drain(MAX_PARTS..).flatten());
    }
    dropped.sort_unstable();
    let parts = groups
        .into_iter()
        .map(|group| {
            let indexes: Vec<usize> = std::iter::once(0).chain(group).collect();
            let mut storyboard = source.clone();
            storyboard.format = VideoFormat::Vertical;
            storyboard.source_hash = None;
            storyboard.scenes = indexes.iter().map(|index| scenes[*index].clone()).collect();
            // The opening cuts straight in; timing is rebuilt when the cut is narrated again.
            storyboard.scenes[0].transition = Transition::Cut;
            ShortCut {
                storyboard,
                kept: indexes.iter().map(|index| scenes[*index].id).collect(),
                duration_secs: indexes
                    .iter()
                    .map(|index| scenes[*index].duration_secs)
                    .sum(),
            }
        })
        .collect();
    Ok(ShortParts {
        parts,
        dropped: dropped.into_iter().map(|index| scenes[index].id).collect(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storyboard::{Composition, StoryboardScene};

    fn scene(id: u32, secs: f32, composition: Composition) -> StoryboardScene {
        StoryboardScene {
            id,
            concept: format!("Cena {id}"),
            learning_goal: String::new(),
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
            assert_eq!(part.storyboard.scenes[0].id, 0);
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
    fn a_hook_longer_than_the_budget_and_an_unnarrated_storyboard_are_refused() {
        let long = storyboard(vec![scene(0, 70.0, title()), scene(1, 5.0, title())]);
        assert!(parts(&long, 58.0)
            .unwrap_err()
            .to_string()
            .contains("abertura"));
        let raw = storyboard(vec![scene(0, 0.0, title())]);
        assert!(parts(&raw, 58.0)
            .unwrap_err()
            .to_string()
            .contains("narrado"));
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
