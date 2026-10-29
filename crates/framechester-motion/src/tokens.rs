//! Framechester audiovisual design system: one dark editorial theme, semantic colours,
//! a typographic scale per format and motion timings. Components never pick raw colours;
//! they ask for a role. `docs/DESIGN_SYSTEM_VIDEO.md` documents the choices.
use framechester_core::storyboard::Role;

pub const BACKGROUND: &str = "#0B0F17";
pub const BACKGROUND_RAISED: &str = "#121926";
pub const SURFACE: &str = "#182130";
pub const SURFACE_STRONG: &str = "#223044";
pub const RULE: &str = "#2B3A52";
pub const INK: &str = "#EEF2F8";
pub const INK_SOFT: &str = "#C7D0DE";
pub const MUTED: &str = "#8C99AE";
pub const ACCENT: &str = "#F2B544";
pub const PRIMARY: &str = "#5B9DFF";
pub const SECONDARY: &str = "#3DD6B5";
pub const SUCCESS: &str = "#58D68D";
pub const WARNING: &str = "#F2B544";
pub const DANGER: &str = "#FF6B6B";
pub const CAPTION_BOX: &str = "#05080E";

/// Fill, stroke and text colour of an object by role.
pub struct RolePalette {
    pub fill: &'static str,
    pub stroke: &'static str,
    pub text: &'static str,
    pub glow: &'static str,
}

pub fn palette(role: Role) -> RolePalette {
    match role {
        Role::Neutral => RolePalette {
            fill: SURFACE,
            stroke: RULE,
            text: INK,
            glow: ACCENT,
        },
        Role::Primary => RolePalette {
            fill: "#15294A",
            stroke: PRIMARY,
            text: INK,
            glow: PRIMARY,
        },
        Role::Secondary => RolePalette {
            fill: "#113A33",
            stroke: SECONDARY,
            text: INK,
            glow: SECONDARY,
        },
        Role::Accent => RolePalette {
            fill: "#3D2F10",
            stroke: ACCENT,
            text: INK,
            glow: ACCENT,
        },
        Role::Success => RolePalette {
            fill: "#143A24",
            stroke: SUCCESS,
            text: INK,
            glow: SUCCESS,
        },
        Role::Warning => RolePalette {
            fill: "#3D2F10",
            stroke: WARNING,
            text: INK,
            glow: WARNING,
        },
        Role::Danger => RolePalette {
            fill: "#44191C",
            stroke: DANGER,
            text: INK,
            glow: DANGER,
        },
    }
}

pub fn role_colour(role: Role) -> &'static str {
    palette(role).stroke
}

/// Bundled font families (OFL-1.1), loaded from `assets/fonts` for reproducible layout.
pub const FONT_SANS: &str = "Inter";
pub const FONT_MONO: &str = "Liberation Mono";

pub const WEIGHT_REGULAR: u16 = 400;
pub const WEIGHT_SEMIBOLD: u16 = 600;
pub const WEIGHT_BOLD: u16 = 700;

/// Line height as a multiple of the font size.
pub const LINE_HEIGHT: f32 = 1.22;

/// Typical durations in seconds; the storyboard may override per animation.
pub const DURATION_FAST: f32 = 0.28;
pub const DURATION_BASE: f32 = 0.55;
pub const DURATION_SLOW: f32 = 0.9;
/// Stagger between siblings that enter at the same cue.
pub const STAGGER: f32 = 0.16;
/// Slide distance of a reveal, in pixels at 1080 width.
pub const REVEAL_OFFSET: f32 = 28.0;
