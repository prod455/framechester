//! Framechester audiovisual design system: semantic paints resolved per look
//! (`crate::look`), a typographic scale per format and motion timings. Components never
//! pick raw colours; they ask for a role. `docs/DESIGN_SYSTEM_VIDEO.md` documents the choices.
use framechester_core::storyboard::Role;

// Semantic paints: resolved against the scene's look when a frame is written
// (`look::Theme::paint`). Components never see a colour value.
pub const BACKGROUND: &str = "@bg";
pub const BACKGROUND_RAISED: &str = "@raised";
pub const SURFACE: &str = "@surface";
pub const SURFACE_STRONG: &str = "@surface-strong";
pub const RULE: &str = "@rule";
pub const INK: &str = "@ink";
pub const INK_SOFT: &str = "@ink-soft";
pub const MUTED: &str = "@muted";
pub const ACCENT: &str = "@accent";
pub const PRIMARY: &str = "@primary";
pub const SECONDARY: &str = "@secondary";
pub const SUCCESS: &str = "@success";
pub const WARNING: &str = "@warning";
pub const DANGER: &str = "@danger";
pub const CAPTION_BOX: &str = "@caption-box";
/// Code editor window and its highlighted line.
pub const CODE_BG: &str = "@code-bg";
pub const CODE_LINE: &str = "@code-line";
/// Ink of the spoken caption word on its accent pill.
pub const CAPTION_INK_ON_ACCENT: &str = "@caption-ink";

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
            fill: "@fill-neutral",
            fill_top: "@fill-top-neutral",
            // Icons, bullets and lines of neutral objects: readable on the cards.
            stroke: "@neutral",
            text: INK,
            glow: ACCENT,
        },
        Role::Primary => RolePalette {
            fill: "@fill-primary",
            fill_top: "@fill-top-primary",
            stroke: PRIMARY,
            text: INK,
            glow: PRIMARY,
        },
        Role::Secondary => RolePalette {
            fill: "@fill-secondary",
            fill_top: "@fill-top-secondary",
            stroke: SECONDARY,
            text: INK,
            glow: SECONDARY,
        },
        Role::Accent => RolePalette {
            fill: "@fill-accent",
            fill_top: "@fill-top-accent",
            stroke: ACCENT,
            text: INK,
            glow: ACCENT,
        },
        Role::Success => RolePalette {
            fill: "@fill-success",
            fill_top: "@fill-top-success",
            stroke: SUCCESS,
            text: INK,
            glow: SUCCESS,
        },
        Role::Warning => RolePalette {
            fill: "@fill-warning",
            fill_top: "@fill-top-warning",
            stroke: WARNING,
            text: INK,
            glow: WARNING,
        },
        Role::Danger => RolePalette {
            fill: "@fill-danger",
            fill_top: "@fill-top-danger",
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

/// The role name of a card paint made by [`card_fill`], if `fill` is one.
pub fn card_role_name(fill: &str) -> Option<&str> {
    fill.strip_prefix("url(#fc-card-")?.strip_suffix(')')
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
