//! Framechester audiovisual design system: one dark editorial theme, semantic colours,
//! a typographic scale per format and motion timings. Components never pick raw colours;
//! they ask for a role. `docs/DESIGN_SYSTEM_VIDEO.md` documents the choices.
use framechester_core::storyboard::Role;

pub const BACKGROUND: &str = "#070B14";
/// Radial lift from the top of the frame over the solid base (depth without banding).
pub const BACKGROUND_TOP: &str = "#0D1630";
/// Aurora: large soft colour fields behind the content, drifting slowly so even a
/// still layout breathes. Cool hues only: a warm glow over the dark base reads as mud.
/// `(colour, opacity, cx, cy, radius)`, positions as fractions of the frame.
pub const AURORA: [(&str, f32, f32, f32, f32); 3] = [
    ("#3D6BFF", 0.30, 0.12, 0.08, 0.75),
    ("#8B5CF6", 0.20, 0.95, 0.55, 0.65),
    ("#14B8A6", 0.14, 0.25, 1.0, 0.70),
];
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
/// Ink of the spoken caption word on its accent pill.
pub const CAPTION_INK_ON_ACCENT: &str = "#0B0F17";

/// Fill, stroke and text colour of an object by role.
pub struct RolePalette {
    /// Bottom of the card gradient (and flat fill where a gradient does not apply).
    pub fill: &'static str,
    /// Top of the card gradient: the same hue lifted, so cards read as lit glass.
    pub fill_top: &'static str,
    pub stroke: &'static str,
    pub text: &'static str,
    pub glow: &'static str,
}

pub fn palette(role: Role) -> RolePalette {
    match role {
        Role::Neutral => RolePalette {
            fill: SURFACE,
            fill_top: "#26324A",
            // Icons, bullets and lines of neutral objects: readable on the glass cards.
            stroke: "#8EA2C8",
            text: INK,
            glow: ACCENT,
        },
        Role::Primary => RolePalette {
            fill: "#15294A",
            fill_top: "#24427A",
            stroke: PRIMARY,
            text: INK,
            glow: PRIMARY,
        },
        Role::Secondary => RolePalette {
            fill: "#113A33",
            fill_top: "#1B5E52",
            stroke: SECONDARY,
            text: INK,
            glow: SECONDARY,
        },
        Role::Accent => RolePalette {
            fill: "#3D2F10",
            fill_top: "#64501F",
            stroke: ACCENT,
            text: INK,
            glow: ACCENT,
        },
        Role::Success => RolePalette {
            fill: "#143A24",
            fill_top: "#21603C",
            stroke: SUCCESS,
            text: INK,
            glow: SUCCESS,
        },
        Role::Warning => RolePalette {
            fill: "#3D2F10",
            fill_top: "#64501F",
            stroke: WARNING,
            text: INK,
            glow: WARNING,
        },
        Role::Danger => RolePalette {
            fill: "#44191C",
            fill_top: "#712A30",
            stroke: DANGER,
            text: INK,
            glow: DANGER,
        },
    }
}

/// Lowercase role name, used for the per-role gradient ids in every frame's `<defs>`.
pub fn role_name(role: Role) -> &'static str {
    match role {
        Role::Neutral => "neutral",
        Role::Primary => "primary",
        Role::Secondary => "secondary",
        Role::Accent => "accent",
        Role::Success => "success",
        Role::Warning => "warning",
        Role::Danger => "danger",
    }
}

pub const ROLES: [Role; 7] = [
    Role::Neutral,
    Role::Primary,
    Role::Secondary,
    Role::Accent,
    Role::Success,
    Role::Warning,
    Role::Danger,
];

/// Paint of a card or bubble of `role`: the lit-glass gradient defined per frame.
pub fn card_fill(role: Role) -> String {
    format!("url(#fc-card-{})", role_name(role))
}

/// Paint of a card edge of `role`: bright at the top, fading towards the bottom.
pub fn card_edge(role: Role) -> String {
    format!("url(#fc-edge-{})", role_name(role))
}

/// Paint of large headline text: white at the cap height easing into a cool tint.
pub const HEADLINE: &str = "url(#fc-headline)";

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
/// Named combinations of duration/easing/stagger live in
/// `framechester_core::presets` (planner and engine share them).
pub const DURATION_FAST: f32 = 0.28;
pub const DURATION_BASE: f32 = framechester_core::presets::REVEAL.duration_secs;
pub const DURATION_SLOW: f32 = 0.9;
/// Stagger between siblings that enter at the same cue.
pub const STAGGER: f32 = framechester_core::presets::REVEAL.stagger_secs;
/// Slide distance of a reveal, in pixels at 1080 width.
pub const REVEAL_OFFSET: f32 = 28.0;
