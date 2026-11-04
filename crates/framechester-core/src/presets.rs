//! Named motion presets: the single source for the duration, easing and
//! stagger of the standard motions. The deterministic planner stamps these
//! onto the [`Animation`](crate::storyboard::Animation)s it generates, and
//! the motion engine reads the same values for sibling stagger, so a preset
//! changed here changes both sides together. Every parameter is explicit;
//! nothing is derived from a clock or a random source.
use crate::storyboard::{Easing, Motion};

/// Arrival on a long tail (expo-like out): lands slowly, the craft default for
/// anything entering. A plain cubic ease-out on everything reads as generated.
pub const EASE_ARRIVE: Easing = Easing::cubic_bezier(0.16, 1.0, 0.3, 1.0);
/// Arrival with a premium overshoot (about a 0.75 damping ratio): position and
/// scale only, never opacity or colour.
pub const EASE_EMPHASIS: Easing = Easing::cubic_bezier(0.34, 1.56, 0.64, 1.0);

/// Duration, easing and sibling stagger of one named motion.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct MotionPreset {
    pub name: &'static str,
    pub duration_secs: f32,
    pub easing: Easing,
    /// Delay added between siblings that enter at the same cue.
    pub stagger_secs: f32,
}

/// Fade/slide entry (also the generic entry for draw/grow/type/count).
pub const REVEAL: MotionPreset = MotionPreset {
    name: "reveal",
    duration_secs: 0.6,
    easing: EASE_ARRIVE,
    // List items 40-80 ms apart: fully sequential looks robotic, all at once cheap.
    stagger_secs: 0.08,
};
/// Scale-from-small arrival with overshoot.
pub const POP: MotionPreset = MotionPreset {
    name: "pop",
    duration_secs: 0.6,
    easing: EASE_EMPHASIS,
    stagger_secs: 0.08,
};
/// Accent glow while the narration mentions the object.
pub const HIGHLIGHT: MotionPreset = MotionPreset {
    name: "highlight",
    duration_secs: 1.2,
    easing: Easing::EaseOut,
    stagger_secs: 0.0,
};
/// Travel of a copy from one object to another (transformation scenes).
pub const MOVE_TO: MotionPreset = MotionPreset {
    name: "move_to",
    duration_secs: 0.9,
    easing: Easing::EaseInOut,
    stagger_secs: 0.0,
};
/// Gentle continuous drift of a whole scene; duration is the period.
pub const BREATHE: MotionPreset = MotionPreset {
    name: "breathe",
    duration_secs: 4.0,
    easing: Easing::EaseInOut,
    stagger_secs: 0.0,
};
/// Kinetic typography: one word of a title/question at a time. The stagger
/// is only the fallback; when narration segments carry timed words, each
/// word is anchored on its spoken start instead (see motion `compose`).
pub const WORD_REVEAL: MotionPreset = MotionPreset {
    name: "word_reveal",
    duration_secs: 0.35,
    easing: EASE_ARRIVE,
    // Words 60-120 ms apart.
    stagger_secs: 0.08,
};

/// Cascade between the text lines of one entering target (titles).
pub const TITLE_CASCADE: MotionPreset = MotionPreset {
    name: "title_cascade",
    duration_secs: 0.6,
    easing: EASE_ARRIVE,
    stagger_secs: 0.08,
};

/// The preset that generates animations of `motion` in the planner.
/// Entering motions share the entry duration/stagger; only `Pop` differs,
/// by its overshooting easing.
pub const fn preset_for(motion: Motion) -> MotionPreset {
    match motion {
        Motion::Pop => POP,
        Motion::Highlight => HIGHLIGHT,
        Motion::MoveTo => MOVE_TO,
        Motion::Breathe => BREATHE,
        _ => REVEAL,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn presets_have_explicit_valid_parameters() {
        for preset in [
            REVEAL,
            POP,
            HIGHLIGHT,
            MOVE_TO,
            BREATHE,
            TITLE_CASCADE,
            WORD_REVEAL,
        ] {
            assert!(!preset.name.is_empty());
            assert!(preset.duration_secs > 0.0, "{}", preset.name);
            assert!(preset.stagger_secs >= 0.0, "{}", preset.name);
            assert!(preset.easing.is_valid(), "{}", preset.name);
        }
        assert_eq!(preset_for(Motion::Pop).easing, EASE_EMPHASIS);
        assert_eq!(preset_for(Motion::Reveal).easing, EASE_ARRIVE);
        assert_eq!(preset_for(Motion::Reveal).duration_secs, 0.6);
        assert_eq!(preset_for(Motion::MoveTo).duration_secs, 0.9);
        // Measured craft ranges: list items 40-80 ms apart, words 60-120 ms.
        assert!((0.04..=0.08).contains(&REVEAL.stagger_secs));
        assert!((0.06..=0.12).contains(&WORD_REVEAL.stagger_secs));
    }
}
