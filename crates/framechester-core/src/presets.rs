//! Named motion presets: the single source for the duration, easing and
//! stagger of the standard motions. The deterministic planner stamps these
//! onto the [`Animation`](crate::storyboard::Animation)s it generates, and
//! the motion engine reads the same values for sibling stagger, so a preset
//! changed here changes both sides together. Every parameter is explicit;
//! nothing is derived from a clock or a random source.
use crate::storyboard::{Easing, Motion};

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
    duration_secs: 0.55,
    easing: Easing::EaseOut,
    stagger_secs: 0.16,
};
/// Scale-from-small arrival with overshoot.
pub const POP: MotionPreset = MotionPreset {
    name: "pop",
    duration_secs: 0.55,
    easing: Easing::Back,
    stagger_secs: 0.16,
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
    easing: Easing::EaseOut,
    stagger_secs: 0.07,
};

/// Cascade between the text lines of one entering target (titles).
pub const TITLE_CASCADE: MotionPreset = MotionPreset {
    name: "title_cascade",
    duration_secs: 0.55,
    easing: Easing::EaseOut,
    stagger_secs: 0.07,
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
        assert_eq!(preset_for(Motion::Pop).easing, Easing::Back);
        assert_eq!(preset_for(Motion::Reveal).duration_secs, 0.55);
        assert_eq!(preset_for(Motion::MoveTo).duration_secs, 0.9);
        assert_eq!(REVEAL.stagger_secs, 0.16);
    }
}
