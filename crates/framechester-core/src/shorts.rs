//! Cuts a narrated storyboard into a Short: the same reviewed content, re-edited for a
//! vertical feed. The opening hook always stays (it is the first frame and the reason to keep
//! watching), the closing scene stays when it fits (it carries the payoff or the call to
//! action), and the middle keeps the scenes that hold attention best per second until the
//! duration budget runs out. Scenes keep their original order and words; nothing is
//! rewritten, so the editorial review of the source video still covers the Short.
use crate::error::{FramechesterError, Result};
use crate::storyboard::{Composition, Storyboard, Transition, VideoFormat};

/// Under a minute keeps the Short in the format's tightest loop; a few seconds of margin
/// absorb the re-narration of cached sentences.
pub const DEFAULT_MAX_SECS: f32 = 58.0;

#[derive(Debug, Clone)]
pub struct ShortCut {
    pub storyboard: Storyboard,
    pub kept: Vec<u32>,
    pub dropped: Vec<u32>,
    /// Sum of the kept scenes' source durations.
    pub duration_secs: f32,
}

/// How strongly a scene holds attention, before dividing by its length. Numbers and visible
/// change outrank a talking title.
fn retention(composition: &Composition) -> f32 {
    match composition {
        Composition::Chart { .. } | Composition::Infographic { .. } => 3.0,
        Composition::Comparison { .. }
        | Composition::Transformation { .. }
        | Composition::CauseEffect { .. }
        | Composition::FlowDiagram { .. } => 2.5,
        Composition::Character { .. } => 2.0,
        Composition::Code { .. }
        | Composition::Architecture { .. }
        | Composition::Annotation { .. }
        | Composition::Timeline { .. } => 1.5,
        Composition::Title { .. } => 1.0,
    }
}

/// Cuts `source` (already narrated: scenes carry real durations) to at most `max_secs`.
pub fn cut(source: &Storyboard, max_secs: f32) -> Result<ShortCut> {
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
    let mut keep = vec![false; scenes.len()];
    keep[0] = true;
    let mut used = hook;
    let last = scenes.len() - 1;
    if last > 0 && used + scenes[last].duration_secs <= max_secs {
        keep[last] = true;
        used += scenes[last].duration_secs;
    }
    // Best attention per second first; ties keep the earlier scene.
    let mut middle: Vec<usize> = (1..last).collect();
    middle.sort_by(|a, b| {
        let score =
            |index: &usize| retention(&scenes[*index].composition) / scenes[*index].duration_secs;
        score(b).total_cmp(&score(a)).then(a.cmp(b))
    });
    for index in middle {
        if used + scenes[index].duration_secs <= max_secs {
            keep[index] = true;
            used += scenes[index].duration_secs;
        }
    }
    let mut storyboard = source.clone();
    storyboard.format = VideoFormat::Vertical;
    storyboard.source_hash = None;
    storyboard.scenes = scenes
        .iter()
        .zip(&keep)
        .filter(|(_, kept)| **kept)
        .map(|(scene, _)| scene.clone())
        .collect();
    // The opening cuts straight in; timing is rebuilt when the cut is narrated again.
    if let Some(first) = storyboard.scenes.first_mut() {
        first.transition = Transition::Cut;
    }
    let (kept, dropped): (Vec<_>, Vec<_>) = scenes.iter().zip(&keep).partition(|(_, kept)| **kept);
    Ok(ShortCut {
        storyboard,
        kept: kept.into_iter().map(|(scene, _)| scene.id).collect(),
        dropped: dropped.into_iter().map(|(scene, _)| scene.id).collect(),
        duration_secs: used,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storyboard::{Character, Pose, StoryboardScene};

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
    fn keeps_hook_and_ending_then_the_most_engaging_middle_in_order() {
        let source = storyboard(vec![
            scene(
                0,
                6.0,
                Composition::Character {
                    character: Character::Robot,
                    pose: Pose::Think,
                    text: "Gancho?".into(),
                    persona: None,
                },
            ),
            scene(1, 20.0, title()),
            scene(2, 15.0, chart()),
            scene(3, 25.0, title()),
            scene(4, 14.0, chart()),
            scene(5, 8.0, title()),
        ]);
        let short = cut(&source, 58.0).unwrap();
        assert_eq!(
            short.kept,
            vec![0, 2, 4, 5],
            "hook, the two charts, the ending"
        );
        assert_eq!(short.dropped, vec![1, 3]);
        assert!((short.duration_secs - 43.0).abs() < 1e-4);
        assert_eq!(short.storyboard.format, VideoFormat::Vertical);
        assert_eq!(short.storyboard.scenes[0].transition, Transition::Cut);
        let ids: Vec<u32> = short
            .storyboard
            .scenes
            .iter()
            .map(|scene| scene.id)
            .collect();
        assert_eq!(ids, vec![0, 2, 4, 5], "original order");
    }

    #[test]
    fn a_hook_longer_than_the_budget_and_an_unnarrated_storyboard_are_refused() {
        let long = storyboard(vec![scene(0, 70.0, title()), scene(1, 5.0, title())]);
        assert!(cut(&long, 58.0)
            .unwrap_err()
            .to_string()
            .contains("abertura"));
        let raw = storyboard(vec![scene(0, 0.0, title())]);
        assert!(cut(&raw, 58.0).unwrap_err().to_string().contains("narrado"));
    }

    #[test]
    fn a_short_source_is_kept_whole() {
        let source = storyboard(vec![
            scene(0, 5.0, title()),
            scene(1, 10.0, chart()),
            scene(2, 5.0, title()),
        ]);
        let short = cut(&source, 58.0).unwrap();
        assert_eq!(short.kept, vec![0, 1, 2]);
        assert!(short.dropped.is_empty());
    }
}
