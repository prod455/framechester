//! Looks: each one is the rules of a single medium (a night screen, a risograph print,
//! a blueprint), not a palette swap. Components paint with semantic references
//! (`tokens::INK` is `"@ink"`); the frame resolves them against the scene's look when it
//! writes SVG, so every layout renders in every look without knowing about it. The
//! display face is chosen at layout time (`Ctx::display`), because text is measured with
//! the face it is drawn in.
use framechester_core::storyboard::Look;

/// Elevation under cards.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Shadow {
    /// Two soft black layers below the card (screen light).
    Soft,
    /// A solid offset plate, like a second ink printed off register.
    Offset {
        paint: &'static str,
        dx: f32,
        dy: f32,
        opacity: f32,
    },
    /// Linework only: nothing under the card.
    None,
}

/// Fill of large headline text.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Headline {
    /// Vertical gradient, top colour to bottom colour.
    Gradient(&'static str, &'static str),
    /// One paint.
    Solid(&'static str),
}

/// A soft colour field behind the content: `(colour, opacity, cx, cy, radius)`, position
/// and radius as fractions of the frame.
pub type Field = (&'static str, f32, f32, f32, f32);

pub struct Theme {
    pub look: Look,
    /// Flat ground colour (hex): also what QA compares black frames against.
    pub ground: &'static str,
    /// Radial lift from the top centre: colour and opacity. Never a full-frame linear
    /// gradient, which bands under H.264.
    pub lift: Option<(&'static str, f32)>,
    /// Colour fields that drift slowly behind the content.
    pub atmosphere: &'static [Field],
    /// Spacing and stroke paint of a ruled grid on the ground (blueprint sheets).
    pub grid: Option<(f32, &'static str)>,
    /// Edge darkening, 0 for none.
    pub vignette: f32,
    /// Bottom opacity of the card edge gradient: below 1 the edge fades like lit glass,
    /// 1 is a printed outline.
    pub edge_fade: f32,
    pub shadow: Shadow,
    pub headline: Headline,
    /// Face and weight of titles, headings and big numbers.
    pub display_family: &'static str,
    pub display_weight: u16,
    /// Size multiplier of the display face: a condensed face needs a larger body to
    /// carry the same weight on screen. Fitting still shrinks it when it does not fit.
    pub display_scale: f32,
    /// Semantic paint → colour.
    paints: &'static [(&'static str, &'static str)],
}

impl Theme {
    /// The colour of a paint: semantic references (`@name`) resolve against this look,
    /// anything else (a hex, `url(#…)`, `rgba(…)`) is already a colour.
    pub fn paint<'a>(&self, paint: &'a str) -> &'a str
    where
        'static: 'a,
    {
        if !paint.starts_with('@') {
            return paint;
        }
        self.paints
            .iter()
            .find(|(name, _)| *name == paint)
            .map(|(_, colour)| *colour)
            .unwrap_or_else(|| panic!("look {:?} has no paint {paint}", self.look))
    }
}

pub fn theme(look: Look) -> &'static Theme {
    match look {
        Look::Noite => &NOITE,
        Look::Papel => &PAPEL,
        Look::Planta => &PLANTA,
    }
}

/// Every semantic paint a look must define (checked by test for each look).
pub const PAINTS: [&str; 37] = [
    "@bg",
    "@raised",
    "@surface",
    "@surface-strong",
    "@rule",
    "@ink",
    "@ink-soft",
    "@muted",
    "@accent",
    "@primary",
    "@secondary",
    "@success",
    "@warning",
    "@danger",
    "@neutral",
    "@caption-box",
    "@caption-ink",
    "@code-bg",
    "@code-line",
    "@fill-neutral",
    "@fill-primary",
    "@fill-secondary",
    "@fill-accent",
    "@fill-success",
    "@fill-warning",
    "@fill-danger",
    "@fill-top-neutral",
    "@fill-top-primary",
    "@fill-top-secondary",
    "@fill-top-accent",
    "@fill-top-success",
    "@fill-top-warning",
    "@fill-top-danger",
    "@edge-neutral",
    "@aurora-a",
    "@aurora-b",
    "@aurora-c",
];

/// Night screen: dark ground, cool light fields, lit-glass cards.
static NOITE: Theme = Theme {
    look: Look::Noite,
    ground: "#070B14",
    lift: Some(("#0D1630", 1.0)),
    atmosphere: &[
        ("@aurora-a", 0.30, 0.12, 0.08, 0.75),
        ("@aurora-b", 0.20, 0.95, 0.55, 0.65),
        ("@aurora-c", 0.14, 0.25, 1.0, 0.70),
    ],
    grid: None,
    vignette: 0.5,
    edge_fade: 0.3,
    shadow: Shadow::Soft,
    headline: Headline::Gradient("#FFFFFF", "#BFD0FF"),
    display_family: "Inter",
    display_weight: 700,
    display_scale: 1.0,
    paints: &[
        ("@bg", "#070B14"),
        ("@raised", "#121926"),
        ("@surface", "#182130"),
        ("@surface-strong", "#223044"),
        ("@rule", "#2B3A52"),
        ("@ink", "#EEF2F8"),
        ("@ink-soft", "#C7D0DE"),
        ("@muted", "#8C99AE"),
        ("@accent", "#F2B544"),
        ("@primary", "#5B9DFF"),
        ("@secondary", "#3DD6B5"),
        ("@success", "#58D68D"),
        ("@warning", "#F2B544"),
        ("@danger", "#FF6B6B"),
        ("@neutral", "#8EA2C8"),
        ("@caption-box", "rgba(5,8,14,0.78)"),
        ("@caption-ink", "#0B0F17"),
        ("@code-bg", "#0A0E16"),
        ("@code-line", "#1B2A3F"),
        ("@fill-neutral", "#182130"),
        ("@fill-primary", "#15294A"),
        ("@fill-secondary", "#113A33"),
        ("@fill-accent", "#3D2F10"),
        ("@fill-success", "#143A24"),
        ("@fill-warning", "#3D2F10"),
        ("@fill-danger", "#44191C"),
        ("@fill-top-neutral", "#26324A"),
        ("@fill-top-primary", "#24427A"),
        ("@fill-top-secondary", "#174A42"),
        ("@fill-top-accent", "#4E3F18"),
        ("@fill-top-success", "#1A4B30"),
        ("@fill-top-warning", "#4E3F18"),
        ("@fill-top-danger", "#712A30"),
        ("@edge-neutral", "#55688C"),
        ("@aurora-a", "#3D6BFF"),
        ("@aurora-b", "#8B5CF6"),
        ("@aurora-c", "#14B8A6"),
    ],
};

/// Risograph print: one flat paper, navy ink A for every word and structural line,
/// vermilion ink B for the one focus of the frame (deep enough to read as text: a true
/// fluorescent orange is under 3:1 on paper), cards printed flat with an ink
/// outline and the B plate offset under them.
static PAPEL: Theme = Theme {
    look: Look::Papel,
    ground: "#EFE8DA",
    lift: None,
    atmosphere: &[],
    grid: None,
    vignette: 0.0,
    edge_fade: 1.0,
    shadow: Shadow::Offset {
        paint: "@accent",
        dx: 9.0,
        dy: 9.0,
        opacity: 0.9,
    },
    headline: Headline::Solid("@ink"),
    display_family: "Archivo Black",
    display_weight: 400,
    display_scale: 1.0,
    paints: &[
        ("@bg", "#EFE8DA"),
        ("@raised", "#E6DECD"),
        ("@surface", "#F8F4EC"),
        ("@surface-strong", "#DDD4C1"),
        ("@rule", "#BFB6A3"),
        ("@ink", "#1F2A55"),
        ("@ink-soft", "#3B4675"),
        ("@muted", "#6B7394"),
        ("@accent", "#CC3314"),
        ("@primary", "#1F2A55"),
        ("@secondary", "#0E7C7B"),
        ("@success", "#2F7D32"),
        ("@warning", "#CC3314"),
        ("@danger", "#D7263D"),
        ("@neutral", "#1F2A55"),
        ("@caption-box", "rgba(255,252,245,0.95)"),
        ("@caption-ink", "#FFFCF5"),
        ("@code-bg", "#F8F4EC"),
        ("@code-line", "#E6DCC6"),
        ("@fill-neutral", "#F8F4EC"),
        ("@fill-primary", "#DDE1EE"),
        ("@fill-secondary", "#D3ECEA"),
        ("@fill-accent", "#FFDCD2"),
        ("@fill-success", "#DCEBD8"),
        ("@fill-warning", "#FFDCD2"),
        ("@fill-danger", "#F7D3D8"),
        ("@fill-top-neutral", "#F8F4EC"),
        ("@fill-top-primary", "#DDE1EE"),
        ("@fill-top-secondary", "#D3ECEA"),
        ("@fill-top-accent", "#FFDCD2"),
        ("@fill-top-success", "#DCEBD8"),
        ("@fill-top-warning", "#FFDCD2"),
        ("@fill-top-danger", "#F7D3D8"),
        ("@edge-neutral", "#1F2A55"),
        ("@aurora-a", "#CC3314"),
        ("@aurora-b", "#1F2A55"),
        ("@aurora-c", "#0E7C7B"),
    ],
};

/// Blueprint: a flat cobalt sheet with a ruled grid, white linework, translucent
/// panels, safety-yellow for the one focus, condensed capitals for titles.
static PLANTA: Theme = Theme {
    look: Look::Planta,
    ground: "#0F3D91",
    lift: Some(("#1A55BF", 0.55)),
    atmosphere: &[],
    grid: Some((60.0, "rgba(255,255,255,0.08)")),
    vignette: 0.25,
    edge_fade: 1.0,
    shadow: Shadow::None,
    headline: Headline::Solid("@ink"),
    display_family: "Bebas Neue",
    display_weight: 400,
    display_scale: 1.3,
    paints: &[
        ("@bg", "#0F3D91"),
        ("@raised", "#0D3580"),
        ("@surface", "rgba(255,255,255,0.06)"),
        ("@surface-strong", "rgba(255,255,255,0.14)"),
        ("@rule", "#5F86CF"),
        ("@ink", "#FFFFFF"),
        ("@ink-soft", "#D6E4FF"),
        ("@muted", "#9DB8EA"),
        ("@accent", "#FFD23F"),
        ("@primary", "#8FD3FF"),
        ("@secondary", "#7CF2C8"),
        ("@success", "#7CF2C8"),
        ("@warning", "#FFD23F"),
        ("@danger", "#FF9E96"),
        ("@neutral", "#FFFFFF"),
        ("@caption-box", "rgba(6,26,70,0.88)"),
        ("@caption-ink", "#0F3D91"),
        ("@code-bg", "#0A2C6B"),
        ("@code-line", "#164394"),
        ("@fill-neutral", "rgba(255,255,255,0.06)"),
        ("@fill-primary", "rgba(143,211,255,0.16)"),
        ("@fill-secondary", "rgba(124,242,200,0.14)"),
        ("@fill-accent", "rgba(255,210,63,0.16)"),
        ("@fill-success", "rgba(124,242,200,0.14)"),
        ("@fill-warning", "rgba(255,210,63,0.16)"),
        ("@fill-danger", "rgba(255,138,128,0.16)"),
        ("@fill-top-neutral", "rgba(255,255,255,0.06)"),
        ("@fill-top-primary", "rgba(143,211,255,0.16)"),
        ("@fill-top-secondary", "rgba(124,242,200,0.14)"),
        ("@fill-top-accent", "rgba(255,210,63,0.16)"),
        ("@fill-top-success", "rgba(124,242,200,0.14)"),
        ("@fill-top-warning", "rgba(255,210,63,0.16)"),
        ("@fill-top-danger", "rgba(255,138,128,0.16)"),
        ("@edge-neutral", "#FFFFFF"),
        ("@aurora-a", "#FFFFFF"),
        ("@aurora-b", "#FFFFFF"),
        ("@aurora-c", "#FFFFFF"),
    ],
};

/// An sRGB colour with alpha, parsed from `#RRGGBB` or `rgba(r,g,b,a)`.
fn rgba(colour: &str) -> Option<[f32; 4]> {
    if let Some(hex) = colour.strip_prefix('#') {
        if hex.len() != 6 {
            return None;
        }
        let channel = |at: usize| u8::from_str_radix(&hex[at..at + 2], 16).ok();
        return Some([
            channel(0)? as f32 / 255.0,
            channel(2)? as f32 / 255.0,
            channel(4)? as f32 / 255.0,
            1.0,
        ]);
    }
    let inner = colour.strip_prefix("rgba(")?.strip_suffix(')')?;
    let parts: Vec<f32> = inner
        .split(',')
        .map(|part| part.trim().parse().ok())
        .collect::<Option<_>>()?;
    match parts.as_slice() {
        [r, g, b, a] => Some([r / 255.0, g / 255.0, b / 255.0, *a]),
        _ => None,
    }
}

/// `top` composited over the opaque `base`.
fn over(top: [f32; 4], base: [f32; 3]) -> [f32; 3] {
    let a = top[3];
    [
        top[0] * a + base[0] * (1.0 - a),
        top[1] * a + base[1] * (1.0 - a),
        top[2] * a + base[2] * (1.0 - a),
    ]
}

/// WCAG 2 relative luminance.
fn luminance(colour: [f32; 3]) -> f32 {
    let linear = |c: f32| {
        if c <= 0.03928 {
            c / 12.92
        } else {
            ((c + 0.055) / 1.055).powf(2.4)
        }
    };
    0.2126 * linear(colour[0]) + 0.7152 * linear(colour[1]) + 0.0722 * linear(colour[2])
}

/// Minimum WCAG contrast for body text (and every reading line).
pub const CONTRAST_TEXT: f32 = 4.5;
/// Minimum WCAG contrast for large text: headings, numbers, kickers, emphasis (all
/// drawn at 21 px semibold or more).
pub const CONTRAST_LARGE: f32 = 3.0;

impl Theme {
    /// WCAG contrast ratio of `text` drawn on `surface`, both composited over the ground
    /// (translucent panels and captions are what the viewer actually sees).
    pub fn contrast(&self, text: &str, surface: &str) -> f32 {
        let parse = |paint: &str| {
            rgba(self.paint(paint))
                .unwrap_or_else(|| panic!("look {:?}: {paint} is not a colour", self.look))
        };
        let ground = parse("@bg");
        let base = over(parse(surface), [ground[0], ground[1], ground[2]]);
        let fore = over(parse(text), base);
        let (a, b) = (luminance(fore), luminance(base));
        (a.max(b) + 0.05) / (a.min(b) + 0.05)
    }

    /// Every (text, surface, minimum) pair the components draw, below its minimum.
    pub fn contrast_failures(&self) -> Vec<String> {
        let mut surfaces = vec!["@bg", "@surface", "@surface-strong"];
        // The top of the frame, under the heading, is the lift at full strength.
        if let Some((lift, _)) = self.lift {
            surfaces.push(lift);
        }
        for role in ROLE_NAMES {
            surfaces.push(role.0);
            surfaces.push(role.1);
        }
        let mut pairs: Vec<(&str, &str, f32)> = Vec::new();
        for surface in &surfaces {
            for text in ["@ink", "@ink-soft"] {
                pairs.push((text, surface, CONTRAST_TEXT));
            }
            for text in [
                "@muted",
                "@accent",
                "@primary",
                "@secondary",
                "@success",
                "@warning",
                "@danger",
                "@neutral",
            ] {
                pairs.push((text, surface, CONTRAST_LARGE));
            }
        }
        for surface in ["@code-bg", "@code-line"] {
            pairs.push(("@ink", surface, CONTRAST_TEXT));
            for text in ["@muted", "@primary", "@secondary", "@accent"] {
                pairs.push((text, surface, CONTRAST_LARGE));
            }
        }
        pairs.push(("@ink", "@caption-box", CONTRAST_TEXT));
        pairs.push(("@accent", "@caption-box", CONTRAST_LARGE));
        pairs.push(("@caption-ink", "@accent", CONTRAST_TEXT));
        pairs
            .into_iter()
            .filter_map(|(text, surface, minimum)| {
                let ratio = self.contrast(text, surface);
                (ratio < minimum).then(|| {
                    format!(
                        "{:?}: {text} sobre {surface} = {ratio:.2} < {minimum}",
                        self.look
                    )
                })
            })
            .collect()
    }
}

/// Card fill paints per role: (bottom, top).
const ROLE_NAMES: [(&str, &str); 7] = [
    ("@fill-neutral", "@fill-top-neutral"),
    ("@fill-primary", "@fill-top-primary"),
    ("@fill-secondary", "@fill-top-secondary"),
    ("@fill-accent", "@fill-top-accent"),
    ("@fill-success", "@fill-top-success"),
    ("@fill-warning", "@fill-top-warning"),
    ("@fill-danger", "@fill-top-danger"),
];

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_look_defines_every_paint_and_only_those() {
        for look in Look::ALL {
            let theme = theme(look);
            for paint in PAINTS {
                let colour = theme.paint(paint);
                assert!(!colour.starts_with('@'), "{look:?} {paint}");
            }
            assert_eq!(theme.paints.len(), PAINTS.len(), "{look:?}");
            assert_eq!(theme.look, look);
            assert!(theme.ground.starts_with('#') && theme.ground.len() == 7);
        }
        assert_eq!(theme(Look::Papel).paint("#123456"), "#123456");
    }

    #[test]
    fn every_look_meets_wcag_contrast_for_what_it_draws() {
        let failures: Vec<String> = Look::ALL
            .into_iter()
            .flat_map(|look| theme(look).contrast_failures())
            .collect();
        assert!(failures.is_empty(), "{failures:#?}");
    }

    #[test]
    fn contrast_math_matches_wcag() {
        let noite = theme(Look::Noite);
        // White on black is 21:1; a colour on itself is 1:1.
        assert!((noite.contrast("#FFFFFF", "#000000") - 21.0).abs() < 0.01);
        assert!((noite.contrast("@ink", "@ink") - 1.0).abs() < 0.01);
    }
}
