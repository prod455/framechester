//! Semantic storyboard: the renderer-independent plan of an explanatory video.
//!
//! The planner (a model or the deterministic `crate::planner`) describes *meaning*:
//! which concept each scene explains, which objects exist, how they relate, and which
//! animation events happen at which narration word. It never writes FFmpeg filters,
//! pixel coordinates or SVG (a `freeform` scene places elements in percent of the
//! content area, never in pixels). `docs/schemas/storyboard.schema.json` mirrors this
//! module for editors and models; `validate` is the authoritative gate.
use crate::error::{FramechesterError, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

/// Output canvas. Each one gets its own layout, type scale and safe areas.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum VideoFormat {
    /// Shorts, Reels and TikTok: 1080×1920.
    Vertical,
    /// YouTube: 1920×1080.
    Horizontal,
    /// X feed: 1280×720, larger type, shorter captions.
    X,
}

impl VideoFormat {
    pub fn dimensions(self) -> (u32, u32) {
        match self {
            VideoFormat::Vertical => (1080, 1920),
            VideoFormat::Horizontal => (1920, 1080),
            VideoFormat::X => (1280, 720),
        }
    }

    pub fn slug(self) -> &'static str {
        match self {
            VideoFormat::Vertical => "vertical",
            VideoFormat::Horizontal => "horizontal",
            VideoFormat::X => "x",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        match value.trim().to_ascii_lowercase().as_str() {
            "vertical" | "short" | "shorts" | "reels" | "tiktok" => Some(VideoFormat::Vertical),
            "horizontal" | "long" | "youtube" => Some(VideoFormat::Horizontal),
            "x" | "twitter" => Some(VideoFormat::X),
            _ => None,
        }
    }
}

/// Visual look of a video: ground, inks, accent, card treatment and display face, each
/// built from one medium. The renderer owns the values (`framechester-motion::look`);
/// the storyboard only names the look, so a channel keeps one identity.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum Look {
    /// Night screen: dark ground, cool light, lit cards (the original look).
    #[default]
    Noite,
    /// Risograph print: flat paper, navy ink, one fluorescent accent, off-register shadow.
    Papel,
    /// Blueprint: flat cobalt sheet, white linework, safety-yellow accent, condensed caps.
    Planta,
}

impl Look {
    pub const ALL: [Look; 3] = [Look::Noite, Look::Papel, Look::Planta];

    pub fn slug(self) -> &'static str {
        match self {
            Look::Noite => "noite",
            Look::Papel => "papel",
            Look::Planta => "planta",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        Self::ALL
            .into_iter()
            .find(|look| look.slug() == value.trim().to_ascii_lowercase())
    }
}

/// A word with its spoken interval, relative to the start of the scene.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TimedWord {
    pub text: String,
    pub start_secs: f32,
    pub end_secs: f32,
}

/// One narration segment of a scene: a sentence or beat synthesized on its own, so its
/// duration is real. Word timing inside the segment is estimated unless `aligned` is true.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct NarrationSegment {
    pub text: String,
    /// Start relative to the scene, including the semantic pause before this segment.
    pub start_secs: f32,
    pub end_secs: f32,
    #[serde(default)]
    pub words: Vec<TimedWord>,
    /// True when word boundaries came from a forced aligner, false when interpolated.
    #[serde(default)]
    pub aligned: bool,
}

/// When something happens, expressed in narration terms rather than frame numbers.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", deny_unknown_fields)]
pub enum Cue {
    /// Seconds after the scene starts.
    Time { secs: f32 },
    /// The n-th (0-based) occurrence of a word in the scene narration, case-insensitive.
    Word {
        word: String,
        #[serde(default)]
        occurrence: usize,
    },
    /// Start of the n-th (0-based) narration segment of the scene.
    Segment { index: usize },
    /// The scene start; a short offset is often added by the layout.
    Start,
    /// The scene end minus `before_secs`.
    End {
        #[serde(default)]
        before_secs: f32,
    },
    /// A fraction (0..1) of the scene duration, e.g. halfway through the explanation.
    Fraction { fraction: f32 },
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum Easing {
    Linear,
    #[default]
    EaseOut,
    EaseInOut,
    EaseIn,
    /// Overshoots slightly before settling; for pops and arrivals.
    Back,
    Spring,
    /// CSS-style cubic Bezier with control points `(x1, y1)` and `(x2, y2)`;
    /// the endpoints are fixed at `(0, 0)` and `(1, 1)`. Serializes as
    /// `{"cubic_bezier":{"x1":…,"y1":…,"x2":…,"y2":…}}`, so the existing
    /// string forms of the other variants are unchanged. `x1`/`x2` must stay
    /// in `0..=1` (validated in [`StoryboardScene::validate`]) so the curve's
    /// x is monotonic and the easing stays seekable; `y1`/`y2` may overshoot.
    CubicBezier {
        x1: f32,
        y1: f32,
        x2: f32,
        y2: f32,
    },
}

impl Easing {
    /// A cubic Bezier easing; see [`Easing::CubicBezier`].
    pub const fn cubic_bezier(x1: f32, y1: f32, x2: f32, y2: f32) -> Self {
        Self::CubicBezier { x1, y1, x2, y2 }
    }

    /// True when every control point is finite and `x1`/`x2` lie in `0..=1`.
    pub fn is_valid(self) -> bool {
        match self {
            Self::CubicBezier { x1, y1, x2, y2 } => {
                [x1, y1, x2, y2].iter().all(|v| v.is_finite())
                    && (0.0..=1.0).contains(&x1)
                    && (0.0..=1.0).contains(&x2)
            }
            _ => true,
        }
    }
}

/// What an animation does to its target.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Motion {
    /// Fade and slide into place.
    Reveal,
    /// Draw an edge or path from its start to its end.
    Draw,
    /// Scale from zero.
    Pop,
    /// Accent colour and a glow ring while the narration mentions it.
    Highlight,
    /// A single scale pulse.
    Pulse,
    /// Dim everything else.
    Focus,
    /// Count a number up from zero to its value.
    Count,
    /// Grow a bar or progress to its value.
    Grow,
    /// Move an object from its current place to another object's place.
    MoveTo,
    /// Type characters one by one.
    Type,
    /// Fade out.
    Hide,
    /// Gentle continuous drift so a still composition never freezes.
    Breathe,
}

/// One animation event of a scene.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Animation {
    /// Object id inside the composition; `*` means every object.
    pub target: String,
    pub motion: Motion,
    pub at: Cue,
    #[serde(default = "default_duration")]
    pub duration_secs: f32,
    #[serde(default)]
    pub easing: Easing,
    /// For `move_to`: the destination object id.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub destination: Option<String>,
}

fn default_duration() -> f32 {
    0.5
}

/// Visual role of an object; the design system maps roles to colours.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum Role {
    #[default]
    Neutral,
    Primary,
    Secondary,
    Accent,
    Success,
    Warning,
    Danger,
}

/// Flat vector character drawn by the renderer; never an external file or a likeness of a
/// real person.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Character {
    Presenter,
    Developer,
    Scientist,
    Robot,
}

/// Body language of a character scene.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Pose {
    /// Open hand towards the speech card.
    Explain,
    /// Arm extended at the speech card.
    Point,
    /// Hand on the chin.
    Think,
    /// Both arms raised.
    Celebrate,
}

/// Small vector icon from the closed catalog; never an external file.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Icon {
    Agent,
    Skill,
    Folder,
    File,
    Tool,
    Loop,
    Check,
    Cross,
    Bolt,
    Brain,
    Gear,
    Database,
    Cloud,
    User,
    Clock,
    Chart,
    Shield,
    Search,
    Arrow,
    Question,
    Code,
    Book,
}

/// A thing on screen: node, column, step, bar, line of code, card.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct VisualObject {
    pub id: String,
    pub label: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
    #[serde(default)]
    pub role: Role,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub icon: Option<Icon>,
    /// Numeric value for charts, counters and bars.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub value: Option<f64>,
    /// Unit shown after the value, e.g. `%` or `ms`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub unit: Option<String>,
    /// Group or column this object belongs to (comparison side, architecture layer, cause/effect stage).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub group: Option<String>,
    /// Nesting for trees (folders, architecture layers).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parent: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum RelationKind {
    #[default]
    Flow,
    Causes,
    Uses,
    Contains,
    Transforms,
    Compares,
    Loops,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Relation {
    pub from: String,
    pub to: String,
    #[serde(default)]
    pub kind: RelationKind,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
}

/// Rectangle in percent (0–100) of the format's content area, so one free-form scene
/// lays out in every format.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Area {
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub h: f32,
}

/// Point in percent (0–100) of the format's content area.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Point {
    pub x: f32,
    pub y: f32,
}

/// Type role of a free-form text; the design system maps it to a size per format.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum TextSize {
    Title,
    Heading,
    #[default]
    Body,
    Label,
    Small,
}

/// What a free-form element draws. Only the engine's own shapes: never SVG, HTML, a
/// file, a URL or a script from the storyboard.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", tag = "kind", deny_unknown_fields)]
pub enum ElementShape {
    /// Rounded card coloured by role, with an optional icon and label.
    Card {
        area: Area,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        text: Option<String>,
        #[serde(default)]
        role: Role,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        icon: Option<Icon>,
    },
    /// Circle inscribed in `area`, with an optional label inside.
    Circle {
        area: Area,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        text: Option<String>,
        #[serde(default)]
        role: Role,
    },
    /// Text fitted inside `area`.
    Text {
        area: Area,
        text: String,
        #[serde(default)]
        size: TextSize,
        #[serde(default)]
        role: Role,
    },
    /// Catalog icon centred in `area`.
    Icon {
        area: Area,
        icon: Icon,
        #[serde(default)]
        role: Role,
    },
    /// Arrow drawn from `from` to `to`.
    Arrow {
        from: Point,
        to: Point,
        #[serde(default)]
        role: Role,
    },
}

impl ElementShape {
    /// The text the element shows, if any.
    pub fn text(&self) -> Option<&str> {
        match self {
            ElementShape::Card { text, .. } | ElementShape::Circle { text, .. } => text.as_deref(),
            ElementShape::Text { text, .. } => Some(text),
            ElementShape::Icon { .. } | ElementShape::Arrow { .. } => None,
        }
    }
}

/// One element of a free-form scene; `id` is the animation target.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Element {
    pub id: String,
    pub shape: ElementShape,
}

/// What tells two cast members of a stage apart: the body is the same mascot, the
/// accessory and the badge say who is who.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum Hat {
    #[default]
    None,
    /// The heavy worker (the expensive model doing every job).
    HardHat,
    /// The light worker.
    Cap,
    /// The thinker.
    Glasses,
    Crown,
}

/// A cast member of a stage scene. The same `id` in consecutive stage scenes is the same
/// mascot: it stays in place instead of entering again.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Actor {
    pub id: String,
    /// Badge under the mascot (up to 16 characters).
    pub name: String,
    #[serde(default)]
    pub hat: Hat,
    /// Colour of the badge and the accessory.
    #[serde(default)]
    pub role: Role,
}

/// One row of a stage price/data table; `value` must be spoken when it has digits.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TableRow {
    pub label: String,
    pub value: String,
}

/// The physical metaphor of a stage scene: an object whose state changes with each task.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", tag = "kind", deny_unknown_fields)]
pub enum Prop {
    /// A coin that loses a bite for every task aimed at it; `rival` is a second coin
    /// that enters when its name is spoken.
    Coin {
        label: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        rival: Option<String>,
    },
    /// A funnel that sorts the tasks: each one drops out of it towards its actor.
    Funnel {
        label: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        note: Option<String>,
    },
    /// A wall that gains a brick for every task an actor finishes.
    Wall,
    /// A small data card; the `mark` row is circled when its value is spoken.
    Table {
        title: String,
        rows: Vec<TableRow>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        mark: Option<usize>,
    },
    /// Call to action: an envelope gets a notification and a comment is typed.
    Envelope { comment: String },
}

impl Prop {
    pub fn kind_name(&self) -> &'static str {
        match self {
            Prop::Coin { .. } => "coin",
            Prop::Funnel { .. } => "funnel",
            Prop::Wall => "wall",
            Prop::Table { .. } => "table",
            Prop::Envelope { .. } => "envelope",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum MeterStyle {
    /// Card with a label, the value and a bar that turns yellow, then red.
    #[default]
    Bar,
    /// Dark pill with the label and the value (under a coin).
    Badge,
}

/// A gauge from 0 to 100 that a stage scene moves from `from` to `to`, one step per task.
/// The next stage scene usually starts at this scene's `to`, so the number carries the
/// story. With `numeric`, the `to` value is printed and must be spoken in the narration.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Meter {
    pub label: String,
    pub from: f64,
    pub to: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub unit: Option<String>,
    #[serde(default = "default_true")]
    pub numeric: bool,
    #[serde(default)]
    pub style: MeterStyle,
}

/// A job that flies in as a label and hits an actor (or the prop): the hit moves the
/// meter one step, bites the coin or lays a brick.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Task {
    pub label: String,
    /// Actor id or `prop`; absent means the first actor (or the prop when there is none).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub to: Option<String>,
    /// Narration word that launches it; absent means the first word sharing a stem with
    /// the label, else evenly spread over the scene.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub at: Option<String>,
}

impl Task {
    /// The id the task hits, given the scene's actors.
    pub fn target<'a>(&'a self, actors: &'a [Actor]) -> &'a str {
        match &self.to {
            Some(to) => to,
            None => actors.first().map_or("prop", |actor| actor.id.as_str()),
        }
    }
}

/// Body colour of the channel's mascot.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum MascotBody {
    #[default]
    Coral,
    Blue,
    Green,
    Purple,
    Yellow,
    Graphite,
}

/// Silhouette of the channel's mascot.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum MascotShape {
    /// Rounded block on three feet.
    #[default]
    Block,
    /// Soft round blob on two feet.
    Round,
    /// Tall, narrow capsule on two feet.
    Tall,
}

/// A recurring cast member of a channel: the same name and accessory in every video.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CastMember {
    pub name: String,
    #[serde(default)]
    pub hat: Hat,
}

/// What makes a channel's videos its own beyond the look: how its mascot is drawn and the
/// cast that comes back in every video.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(deny_unknown_fields)]
pub struct Identity {
    #[serde(default)]
    pub body: MascotBody,
    #[serde(default)]
    pub shape: MascotShape,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub cast: Vec<CastMember>,
}

pub const MAX_CAST: usize = 3;

impl Identity {
    pub fn validate(&self) -> Result<()> {
        if self.cast.len() > MAX_CAST {
            return Err(FramechesterError::InvalidInput(format!(
                "identidade aceita ate {MAX_CAST} personagens no elenco"
            )));
        }
        let mut names = HashSet::new();
        for member in &self.cast {
            let name = member.name.trim();
            if name.is_empty() || name.chars().count() > 16 || !names.insert(name.to_lowercase()) {
                return Err(FramechesterError::InvalidInput(format!(
                    "nome do elenco vazio, repetido ou acima de 16 caracteres: '{name}'"
                )));
            }
        }
        Ok(())
    }
}

pub const MAX_STAGE_ACTORS: usize = 2;
pub const MAX_STAGE_TASKS: usize = 8;
pub const MAX_HEADLINE_CHARS: usize = 48;
pub const MAX_TASK_CHARS: usize = 24;

/// The headline without its `*accent*` markers.
pub fn plain_headline(headline: &str) -> String {
    headline.replace('*', "")
}

/// A reusable composition. The renderer owns its look and layout per format.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", tag = "kind", deny_unknown_fields)]
pub enum Composition {
    /// Hook or statement: a question or short sentence, optionally with a symbol pair.
    Title {
        text: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        kicker: Option<String>,
    },
    /// Animated flow diagram: nodes connected by edges, revealed progressively.
    FlowDiagram {
        objects: Vec<VisualObject>,
        relations: Vec<Relation>,
        /// Closed loop: the last node points back to the first.
        #[serde(default)]
        looped: bool,
    },
    /// Side-by-side comparison: two groups of objects.
    Comparison {
        left_title: String,
        right_title: String,
        objects: Vec<VisualObject>,
    },
    /// Progressive timeline: ordered milestones.
    Timeline { objects: Vec<VisualObject> },
    /// Bars and counters driven by `value`.
    Chart {
        title: String,
        objects: Vec<VisualObject>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        max_value: Option<f64>,
    },
    /// Software architecture: layers (groups) with boxes and connections.
    Architecture {
        objects: Vec<VisualObject>,
        relations: Vec<Relation>,
    },
    /// Code demonstration: lines typed and highlighted.
    Code {
        language: String,
        lines: Vec<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        file_name: Option<String>,
    },
    /// Object transformation: `before` objects become `after` objects.
    Transformation {
        before: Vec<VisualObject>,
        after: Vec<VisualObject>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        label: Option<String>,
    },
    /// Highlights and annotations over a tree of objects (folders, files, nodes).
    Annotation {
        objects: Vec<VisualObject>,
        #[serde(default)]
        notes: Vec<Relation>,
    },
    /// Infographic: stat cards with icons.
    Infographic {
        title: String,
        objects: Vec<VisualObject>,
    },
    /// Cause and consequence chain.
    CauseEffect { objects: Vec<VisualObject> },
    /// Numbered vertical checklist: steps ticked off in order.
    Steps { objects: Vec<VisualObject> },
    /// A character who talks while the narration plays, next to a speech card.
    Character {
        character: Character,
        pose: Pose,
        text: String,
        /// Drawn from the script's description instead of the preset `character`.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        persona: Option<crate::persona::Persona>,
    },
    /// Free layout for ideas no fixed layout expresses: elements placed in percent of
    /// the content area. Text is fitted and checked by the same layout QA.
    Freeform { elements: Vec<Element> },
    /// A continuing stage: a fixed block headline (`*word*` in the accent), a mascot cast,
    /// one physical metaphor, a gauge that carries over between scenes and tasks that fly
    /// in and change them. Consecutive stage scenes with the same headline read as one shot.
    Stage {
        headline: String,
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        actors: Vec<Actor>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        prop: Option<Prop>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        meter: Option<Meter>,
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        tasks: Vec<Task>,
        /// A sticker slapped on the scene ("90% MAIS BARATO"); digits must be spoken.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        stamp: Option<String>,
    },
}

impl Composition {
    pub fn kind_name(&self) -> &'static str {
        match self {
            Composition::Title { .. } => "title",
            Composition::FlowDiagram { .. } => "flow_diagram",
            Composition::Comparison { .. } => "comparison",
            Composition::Timeline { .. } => "timeline",
            Composition::Chart { .. } => "chart",
            Composition::Architecture { .. } => "architecture",
            Composition::Code { .. } => "code",
            Composition::Transformation { .. } => "transformation",
            Composition::Annotation { .. } => "annotation",
            Composition::Infographic { .. } => "infographic",
            Composition::CauseEffect { .. } => "cause_effect",
            Composition::Steps { .. } => "steps",
            Composition::Character { .. } => "character",
            Composition::Freeform { .. } => "freeform",
            Composition::Stage { .. } => "stage",
        }
    }

    pub const KINDS: [&'static str; 15] = [
        "title",
        "flow_diagram",
        "comparison",
        "timeline",
        "chart",
        "architecture",
        "code",
        "transformation",
        "annotation",
        "infographic",
        "cause_effect",
        "steps",
        "character",
        "freeform",
        "stage",
    ];

    /// Every object id the composition defines, in order.
    pub fn object_ids(&self) -> Vec<&str> {
        match self {
            Composition::Title { .. } => vec!["title"],
            Composition::Character { .. } => vec!["character", "speech"],
            Composition::Freeform { elements } => {
                elements.iter().map(|element| element.id.as_str()).collect()
            }
            Composition::Stage { actors, .. } => {
                let mut ids = vec!["headline", "prop", "meter", "stamp"];
                ids.extend(actors.iter().map(|actor| actor.id.as_str()));
                ids
            }
            Composition::FlowDiagram { objects, .. }
            | Composition::Comparison { objects, .. }
            | Composition::Timeline { objects }
            | Composition::Chart { objects, .. }
            | Composition::Architecture { objects, .. }
            | Composition::Annotation { objects, .. }
            | Composition::Infographic { objects, .. }
            | Composition::CauseEffect { objects }
            | Composition::Steps { objects } => {
                objects.iter().map(|object| object.id.as_str()).collect()
            }
            Composition::Code { lines, .. } => (0..lines.len()).map(|_| "line").collect(),
            Composition::Transformation { before, after, .. } => before
                .iter()
                .chain(after.iter())
                .map(|object| object.id.as_str())
                .collect(),
        }
    }

    /// Named sub-compositions: group name → object ids belonging to it, in
    /// composition order. An animation may target `group:<name>` to animate
    /// every member as one unit; this is the reusable-sub-composition
    /// mechanism, so no separate group object type is needed.
    pub fn groups(&self) -> std::collections::BTreeMap<String, Vec<String>> {
        let mut groups: std::collections::BTreeMap<String, Vec<String>> = Default::default();
        for object in self.objects() {
            if let Some(group) = &object.group {
                groups
                    .entry(group.clone())
                    .or_default()
                    .push(object.id.clone());
            }
        }
        groups
    }

    fn objects(&self) -> Vec<&VisualObject> {
        match self {
            Composition::Title { .. }
            | Composition::Code { .. }
            | Composition::Character { .. }
            | Composition::Freeform { .. }
            | Composition::Stage { .. } => Vec::new(),
            Composition::FlowDiagram { objects, .. }
            | Composition::Comparison { objects, .. }
            | Composition::Timeline { objects }
            | Composition::Chart { objects, .. }
            | Composition::Architecture { objects, .. }
            | Composition::Annotation { objects, .. }
            | Composition::Infographic { objects, .. }
            | Composition::CauseEffect { objects }
            | Composition::Steps { objects } => objects.iter().collect(),
            Composition::Transformation { before, after, .. } => {
                before.iter().chain(after.iter()).collect()
            }
        }
    }

    fn relations(&self) -> &[Relation] {
        match self {
            Composition::FlowDiagram { relations, .. }
            | Composition::Architecture { relations, .. } => relations,
            Composition::Annotation { notes, .. } => notes,
            _ => &[],
        }
    }
}

/// Caption styling hints per scene.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(deny_unknown_fields)]
pub struct CaptionPlan {
    /// Words shown in the accent colour when spoken; must appear in the narration.
    #[serde(default)]
    pub emphasis: Vec<String>,
    #[serde(default)]
    pub hidden: bool,
}

/// A licensed resource the scene needs (a screenshot, a logo the operator owns, a chart image).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RequiredResource {
    pub id: String,
    pub description: String,
    pub license: String,
    #[serde(default)]
    pub optional: bool,
}

/// What QA must confirm for the scene to be accepted.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ValidationCriteria {
    /// Every one of these must be spoken in the scene narration.
    #[serde(default)]
    pub spoken_terms: Vec<String>,
    /// Minimum distinct visual changes (animation events) in the scene.
    #[serde(default)]
    pub min_visual_changes: usize,
    /// Longest interval without visual change tolerated, in seconds.
    #[serde(default = "default_max_still")]
    pub max_still_secs: f32,
    /// The scene must be understandable with the sound off (captions + graphics).
    #[serde(default = "default_true")]
    pub readable_without_audio: bool,
}

fn default_max_still() -> f32 {
    5.0
}

impl Default for ValidationCriteria {
    fn default() -> Self {
        Self {
            spoken_terms: Vec::new(),
            min_visual_changes: 0,
            max_still_secs: default_max_still(),
            readable_without_audio: true,
        }
    }
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct StoryboardScene {
    pub id: u32,
    /// The concept this scene explains, one sentence.
    pub concept: String,
    /// What the viewer should be able to do or understand afterwards.
    pub learning_goal: String,
    pub narration: String,
    /// Real timing from the synthesized audio; empty until narrated.
    #[serde(default)]
    pub segments: Vec<NarrationSegment>,
    /// Total duration from the audio, including pauses; 0 until narrated.
    #[serde(default)]
    pub duration_secs: f32,
    /// Absolute start inside the video; 0 until narrated.
    #[serde(default)]
    pub start_secs: f32,
    pub composition: Composition,
    #[serde(default)]
    pub animations: Vec<Animation>,
    #[serde(default)]
    pub captions: CaptionPlan,
    #[serde(default)]
    pub resources: Vec<RequiredResource>,
    #[serde(default)]
    pub validation: ValidationCriteria,
    /// Transition into this scene.
    #[serde(default)]
    pub transition: Transition,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum Transition {
    #[default]
    Cut,
    Fade,
    /// Previous scene slides up while the new one enters from below.
    Push,
    /// Elements of the previous scene shrink into a corner before the new scene appears.
    Zoom,
    /// Fast horizontal whip: both scenes slide sideways while a simulated
    /// motion blur (non-uniform stretch plus an opacity dip, see
    /// `framechester-motion`) peaks mid-transition. A true SVG blur filter
    /// is not used: it would be rasterized per frame by resvg at high cost
    /// and its radius is not seekable from the transition progress alone.
    WhipPan,
    /// The object becomes the world: the outgoing scene's focal card grows past the
    /// frame, everything around it leaves, and its colour is the ground the next scene
    /// enters on.
    Expand,
    /// The next scene opens in a circle from the outgoing scene's focal point.
    Iris,
    /// Blur swap on one stage: the outgoing content blurs out, the incoming blurs in,
    /// and the ground never cuts.
    BlurSwap,
    /// Dip cut: the outgoing frame darkens about 40% for three frames before a hard cut,
    /// so the cut reads as meant.
    DipCut,
    /// Morph: the outgoing focal card reshapes into the incoming scene's first card
    /// (place, size, corners and colour), and the new content appears in it.
    Morph,
    /// Colour flood around a hero: an object both scenes share stays on screen and
    /// travels to its new place while the ground floods with its colour; the rest of the
    /// old scene leaves and the new one builds around it.
    Flood,
}

/// Ids of composition objects that are layout parts, not named things a viewer follows.
const GENERIC_OBJECT_IDS: [&str; 8] = [
    "title",
    "character",
    "speech",
    "line",
    "headline",
    "prop",
    "meter",
    "stamp",
];

/// Ids of the named things a viewer can follow across scenes (layout parts excluded).
pub fn followable_ids(composition: &Composition) -> Vec<String> {
    composition
        .object_ids()
        .into_iter()
        .filter(|id| !GENERIC_OBJECT_IDS.contains(id))
        .map(str::to_string)
        .collect()
}

/// The hero of a seam: the first object id `next` shares with `previous` (same label
/// gives the same id), ignoring layout parts.
pub fn shared_hero(previous: &Composition, next: &Composition) -> Option<String> {
    hero_of(&followable_ids(previous), &followable_ids(next))
}

/// The first of `previous` that `next` also has.
pub fn hero_of(previous: &[String], next: &[String]) -> Option<String> {
    previous.iter().find(|id| next.contains(id)).cloned()
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Storyboard {
    /// Schema version; bump when fields change meaning.
    pub version: u32,
    pub title: String,
    pub channel: String,
    pub format: VideoFormat,
    pub language: String,
    pub scenes: Vec<StoryboardScene>,
    /// Visual look; absent means the default (`noite`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub look: Option<Look>,
    /// The channel's mascot and recurring cast; absent means the default mascot.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub identity: Option<Identity>,
    /// Hash of the inputs that produced this plan, for caches and reproducibility.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_hash: Option<String>,
}

pub const SCHEMA_VERSION: u32 = 1;
pub const MAX_SCENES: usize = 64;
pub const MAX_OBJECTS: usize = 24;
pub const MAX_LABEL_CHARS: usize = 60;
pub const MAX_DETAIL_CHARS: usize = 120;

fn invalid(scene: u32, detail: impl std::fmt::Display) -> FramechesterError {
    FramechesterError::InvalidInput(format!("storyboard cena {scene}: {detail}"))
}

fn normalize(text: &str) -> String {
    text.split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase()
}

/// Words of a narration, lower-cased and stripped of punctuation, for cue lookups.
pub fn narration_words(text: &str) -> Vec<String> {
    text.split_whitespace()
        .map(|word| {
            word.chars()
                .filter(|character| character.is_alphanumeric() || *character == '-')
                .collect::<String>()
                .to_lowercase()
        })
        .filter(|word| !word.is_empty())
        .collect()
}

impl Storyboard {
    pub fn total_duration_secs(&self) -> f32 {
        self.scenes.iter().map(|scene| scene.duration_secs).sum()
    }

    pub fn validate(&self) -> Result<()> {
        if self.version != SCHEMA_VERSION {
            return Err(FramechesterError::InvalidInput(format!(
                "storyboard version {} nao suportada; esperado {SCHEMA_VERSION}",
                self.version
            )));
        }
        if self.title.trim().is_empty() || self.title.chars().count() > 200 {
            return Err(FramechesterError::InvalidInput(
                "storyboard sem titulo ou titulo acima de 200 caracteres".into(),
            ));
        }
        if self.scenes.is_empty() || self.scenes.len() > MAX_SCENES {
            return Err(FramechesterError::InvalidInput(format!(
                "storyboard precisa de 1 a {MAX_SCENES} cenas"
            )));
        }
        if let Some(identity) = &self.identity {
            identity.validate()?;
        }
        let mut ids = HashSet::new();
        for scene in &self.scenes {
            if !ids.insert(scene.id) {
                return Err(invalid(scene.id, "id duplicado"));
            }
            scene.validate()?;
        }
        Ok(())
    }
}

struct StageParts<'a> {
    headline: &'a str,
    actors: &'a [Actor],
    prop: Option<&'a Prop>,
    meter: Option<&'a Meter>,
    tasks: &'a [Task],
    stamp: Option<&'a str>,
}

fn text_between(scene: u32, what: &str, text: &str, max: usize) -> Result<()> {
    if text.trim().is_empty() || text.chars().count() > max {
        return Err(invalid(
            scene,
            format!("{what} vazio ou acima de {max} caracteres"),
        ));
    }
    Ok(())
}

/// Every token of `text` that carries a digit must be a word of the narration, so a
/// number shown on a stage reaches the claims review like any other number.
fn digits_spoken(scene: u32, what: &str, text: &str, words: &[String]) -> Result<()> {
    for token in narration_words(text) {
        // A sign is shown, not spoken: "-90%" is said "90% a menos".
        let token = token.trim_matches('-').to_string();
        if token.chars().any(|c| c.is_ascii_digit()) && !words.contains(&token) {
            return Err(invalid(
                scene,
                format!("o numero '{text}' {what} precisa ser dito na narracao"),
            ));
        }
    }
    Ok(())
}

fn validate_stage(
    scene: u32,
    words: &[String],
    parts: StageParts<'_>,
    narration: &str,
) -> Result<()> {
    text_between(scene, "titulo do palco", parts.headline, MAX_HEADLINE_CHARS)?;
    if parts.headline.matches('*').count() % 2 != 0
        || plain_headline(parts.headline).trim().is_empty()
    {
        return Err(invalid(
            scene,
            "titulo do palco com destaque *assim* desbalanceado",
        ));
    }
    digits_spoken(scene, "do titulo", parts.headline, words)?;
    if parts.actors.is_empty() && parts.prop.is_none() {
        return Err(invalid(scene, "palco exige ao menos um ator ou um objeto"));
    }
    if parts.actors.len() > MAX_STAGE_ACTORS {
        return Err(invalid(
            scene,
            format!("palco aceita ate {MAX_STAGE_ACTORS} atores"),
        ));
    }
    let reserved = ["headline", "prop", "meter", "stamp", "*"];
    let mut ids = HashSet::new();
    for actor in parts.actors {
        let name = actor.id.as_str();
        if name.trim().is_empty()
            || name.contains(char::is_whitespace)
            || reserved.contains(&name)
            || name.starts_with("group:")
            || name.chars().count() > MAX_LABEL_CHARS
            || !ids.insert(name)
        {
            return Err(invalid(
                scene,
                format!("ator com id vazio, reservado ou duplicado '{name}'"),
            ));
        }
        text_between(scene, "nome do ator", &actor.name, 16)?;
    }
    match parts.prop {
        Some(Prop::Coin { label, rival }) => {
            text_between(scene, "rotulo da moeda", label, 12)?;
            if let Some(rival) = rival {
                text_between(scene, "moeda rival", rival, 12)?;
            }
        }
        Some(Prop::Funnel { label, note }) => {
            text_between(scene, "rotulo do funil", label, 12)?;
            if let Some(note) = note {
                text_between(scene, "nota do funil", note, 24)?;
            }
        }
        Some(Prop::Table { title, rows, mark }) => {
            text_between(scene, "titulo da tabela", title, 40)?;
            if rows.is_empty() || rows.len() > 3 {
                return Err(invalid(scene, "tabela do palco exige 1 a 3 linhas"));
            }
            for row in rows {
                text_between(scene, "rotulo da linha", &row.label, 20)?;
                text_between(scene, "valor da linha", &row.value, 12)?;
                digits_spoken(scene, "da tabela", &row.value, words)?;
            }
            if mark.is_some_and(|mark| mark >= rows.len()) {
                return Err(invalid(scene, "mark aponta para linha inexistente"));
            }
        }
        Some(Prop::Envelope { comment }) => text_between(scene, "comentario", comment, 24)?,
        Some(Prop::Wall) | None => {}
    }
    if let Some(meter) = parts.meter {
        text_between(scene, "rotulo do medidor", &meter.label, 32)?;
        for value in [meter.from, meter.to] {
            if !value.is_finite() || !(0.0..=100.0).contains(&value) {
                return Err(invalid(scene, "medidor vai de 0 a 100"));
            }
        }
        if meter
            .unit
            .as_ref()
            .is_some_and(|unit| unit.chars().count() > 4)
        {
            return Err(invalid(scene, "unidade do medidor acima de 4 caracteres"));
        }
        if meter.numeric {
            let shown = format_value(meter.to.round(), meter.unit.as_deref());
            if !number_is_spoken(&shown, meter.to.round(), narration) {
                return Err(invalid(
                    scene,
                    format!("o numero '{shown}' do medidor precisa ser dito na narracao (ou use numeric: false)"),
                ));
            }
        }
    }
    if parts.tasks.len() > MAX_STAGE_TASKS {
        return Err(invalid(
            scene,
            format!("palco aceita ate {MAX_STAGE_TASKS} tarefas"),
        ));
    }
    for task in parts.tasks {
        text_between(scene, "tarefa", &task.label, MAX_TASK_CHARS)?;
        let target = task.target(parts.actors);
        let known = target == "prop" && parts.prop.is_some() || ids.contains(target);
        if !known {
            return Err(invalid(
                scene,
                format!("tarefa '{}' aponta para '{target}' inexistente", task.label),
            ));
        }
        if let Some(word) = &task.at {
            let wanted = narration_words(word).join(" ");
            if wanted.is_empty() || !words.contains(&wanted) {
                return Err(invalid(
                    scene,
                    format!(
                        "tarefa '{}' espera a palavra '{word}' ausente na narracao",
                        task.label
                    ),
                ));
            }
        }
    }
    if let Some(stamp) = parts.stamp {
        text_between(scene, "selo", stamp, 24)?;
        digits_spoken(scene, "do selo", stamp, words)?;
    }
    Ok(())
}

fn validate_freeform(scene: u32, elements: &[Element]) -> Result<()> {
    if elements.is_empty() || elements.len() > MAX_OBJECTS {
        return Err(invalid(
            scene,
            format!("cena livre exige 1 a {MAX_OBJECTS} elementos"),
        ));
    }
    let percent = |value: f32| value.is_finite() && (0.0..=100.0).contains(&value);
    let mut ids = HashSet::new();
    for element in elements {
        let name = &element.id;
        if name.trim().is_empty()
            || name.contains(char::is_whitespace)
            || name == "*"
            || name.starts_with("group:")
            || name.starts_with("line:")
            || name.chars().count() > MAX_LABEL_CHARS
            || !ids.insert(name.as_str())
        {
            return Err(invalid(
                scene,
                format!("elemento com id vazio, reservado ou duplicado '{name}'"),
            ));
        }
        let area = match &element.shape {
            ElementShape::Card { area, .. }
            | ElementShape::Circle { area, .. }
            | ElementShape::Text { area, .. }
            | ElementShape::Icon { area, .. } => Some(area),
            ElementShape::Arrow { from, to, .. } => {
                if ![from.x, from.y, to.x, to.y].into_iter().all(percent) || from == to {
                    return Err(invalid(
                        scene,
                        format!("seta '{name}' precisa de from e to distintos entre 0 e 100"),
                    ));
                }
                None
            }
        };
        if let Some(area) = area {
            let inside = [area.x, area.y, area.w, area.h].into_iter().all(percent)
                && area.w > 0.0
                && area.h > 0.0
                && area.x + area.w <= 100.0 + f32::EPSILON
                && area.y + area.h <= 100.0 + f32::EPSILON;
            if !inside {
                return Err(invalid(
                    scene,
                    format!("area de '{name}' precisa caber em 0..100 (x + w e y + h ate 100)"),
                ));
            }
        }
        let limit = match element.shape {
            ElementShape::Text { .. } => MAX_DETAIL_CHARS,
            _ => MAX_LABEL_CHARS,
        };
        if let Some(text) = element.shape.text() {
            if text.trim().is_empty() || text.chars().count() > limit {
                return Err(invalid(
                    scene,
                    format!("texto de '{name}' vazio ou acima de {limit} caracteres"),
                ));
            }
        }
    }
    Ok(())
}

impl StoryboardScene {
    pub fn validate(&self) -> Result<()> {
        let id = self.id;
        for (name, text) in [
            ("concept", &self.concept),
            ("learning_goal", &self.learning_goal),
            ("narration", &self.narration),
        ] {
            if text.trim().is_empty() {
                return Err(invalid(id, format!("{name} vazio")));
            }
        }
        if self.narration.chars().count() > 2000 {
            return Err(invalid(id, "narracao acima de 2000 caracteres"));
        }
        let narration = normalize(&self.narration);
        let words = narration_words(&self.narration);
        self.validate_composition(&narration)?;
        let object_ids: HashSet<&str> = self.composition.object_ids().into_iter().collect();
        let groups = self.composition.groups();
        for animation in &self.animations {
            let is_group = animation
                .target
                .strip_prefix("group:")
                .is_some_and(|name| groups.contains_key(name));
            if animation.target != "*"
                && !is_group
                && !object_ids.contains(animation.target.as_str())
                && !(animation.target.starts_with("line:")
                    && matches!(self.composition, Composition::Code { .. }))
            {
                return Err(invalid(
                    id,
                    format!(
                        "animacao aponta para objeto inexistente '{}'",
                        animation.target
                    ),
                ));
            }
            if !animation.duration_secs.is_finite()
                || animation.duration_secs <= 0.0
                || animation.duration_secs > 10.0
            {
                return Err(invalid(id, "duracao de animacao deve ficar entre 0 e 10 s"));
            }
            if !animation.easing.is_valid() {
                return Err(invalid(
                    id,
                    "cubic_bezier exige pontos finitos e x1/x2 entre 0 e 1",
                ));
            }
            if animation.motion == Motion::MoveTo {
                match &animation.destination {
                    Some(destination) if object_ids.contains(destination.as_str()) => {}
                    _ => return Err(invalid(id, "move_to exige destination existente")),
                }
            }
            match &animation.at {
                Cue::Time { secs } if !secs.is_finite() || *secs < 0.0 => {
                    return Err(invalid(id, "cue de tempo negativo"))
                }
                Cue::Word { word, occurrence } => {
                    let wanted = normalize(word);
                    let found = words
                        .iter()
                        .filter(|candidate| **candidate == wanted)
                        .count();
                    if wanted.is_empty() || found <= *occurrence {
                        return Err(invalid(
                            id,
                            format!("cue aponta para palavra '{word}' ausente na narracao"),
                        ));
                    }
                }
                Cue::Segment { index } => {
                    if !self.segments.is_empty() && *index >= self.segments.len() {
                        return Err(invalid(id, "cue aponta para segmento inexistente"));
                    }
                }
                Cue::End { before_secs } if !before_secs.is_finite() || *before_secs < 0.0 => {
                    return Err(invalid(id, "cue de fim invalido"))
                }
                Cue::Fraction { fraction }
                    if !fraction.is_finite() || !(0.0..=1.0).contains(fraction) =>
                {
                    return Err(invalid(id, "cue de fracao deve ficar entre 0 e 1"))
                }
                _ => {}
            }
        }
        for term in self
            .captions
            .emphasis
            .iter()
            .chain(self.validation.spoken_terms.iter())
        {
            if !contains_phrase(&words, term) {
                return Err(invalid(
                    id,
                    format!("termo '{term}' precisa ser dito na narracao da cena"),
                ));
            }
        }
        if !self.validation.max_still_secs.is_finite() || self.validation.max_still_secs <= 0.0 {
            return Err(invalid(id, "max_still_secs deve ser positivo"));
        }
        let mut cursor = 0.0f32;
        for (index, segment) in self.segments.iter().enumerate() {
            if segment.text.trim().is_empty()
                || !segment.start_secs.is_finite()
                || !segment.end_secs.is_finite()
                || segment.start_secs < cursor - 0.001
                || segment.end_secs <= segment.start_secs
            {
                return Err(invalid(
                    id,
                    format!("segmento {index} com tempos invalidos"),
                ));
            }
            cursor = segment.end_secs;
            let mut word_cursor = segment.start_secs;
            for word in &segment.words {
                if word.start_secs < word_cursor - 0.001
                    || word.end_secs < word.start_secs
                    || word.end_secs > segment.end_secs + 0.001
                {
                    return Err(invalid(
                        id,
                        format!("palavra '{}' fora do segmento", word.text),
                    ));
                }
                word_cursor = word.end_secs;
            }
        }
        if !self.segments.is_empty() && self.duration_secs + 0.001 < cursor {
            return Err(invalid(
                id,
                "duration_secs menor que o fim do ultimo segmento",
            ));
        }
        for resource in &self.resources {
            if resource.id.trim().is_empty() || resource.license.trim().is_empty() {
                return Err(invalid(id, "recurso sem id ou licenca"));
            }
        }
        Ok(())
    }

    fn validate_composition(&self, narration: &str) -> Result<()> {
        let id = self.id;
        let objects = self.composition.objects();
        if objects.len() > MAX_OBJECTS {
            return Err(invalid(id, format!("mais de {MAX_OBJECTS} objetos")));
        }
        let mut object_ids = HashSet::new();
        for object in &objects {
            if object.id.trim().is_empty()
                || object.id.contains(char::is_whitespace)
                || object.id == "*"
                || !object_ids.insert(object.id.as_str())
            {
                return Err(invalid(
                    id,
                    format!("objeto com id vazio ou duplicado '{}'", object.id),
                ));
            }
            if object.label.trim().is_empty() || object.label.chars().count() > MAX_LABEL_CHARS {
                return Err(invalid(
                    id,
                    format!(
                        "rotulo do objeto '{}' vazio ou acima de {MAX_LABEL_CHARS} caracteres",
                        object.id
                    ),
                ));
            }
            if object
                .detail
                .as_ref()
                .is_some_and(|detail| detail.chars().count() > MAX_DETAIL_CHARS)
            {
                return Err(invalid(
                    id,
                    format!(
                        "detalhe de '{}' acima de {MAX_DETAIL_CHARS} caracteres",
                        object.id
                    ),
                ));
            }
            if let Some(value) = object.value {
                if !value.is_finite() {
                    return Err(invalid(id, format!("valor de '{}' nao finito", object.id)));
                }
                // Numbers shown on screen must be spoken so they reach the claims review.
                let shown = format_value(value, object.unit.as_deref());
                if !number_is_spoken(&shown, value, narration) {
                    return Err(invalid(
                        id,
                        format!(
                            "o numero '{shown}' de '{}' precisa ser dito na narracao",
                            object.id
                        ),
                    ));
                }
            }
        }
        for object in &objects {
            if let Some(parent) = &object.parent {
                if !object_ids.contains(parent.as_str()) || parent == &object.id {
                    return Err(invalid(id, format!("parent '{parent}' inexistente")));
                }
            }
        }
        for relation in self.composition.relations() {
            if !object_ids.contains(relation.from.as_str())
                || !object_ids.contains(relation.to.as_str())
            {
                return Err(invalid(
                    id,
                    format!(
                        "relacao {} -> {} usa objeto inexistente",
                        relation.from, relation.to
                    ),
                ));
            }
        }
        match &self.composition {
            Composition::Title { text, .. } => {
                if text.trim().is_empty() || text.chars().count() > 140 {
                    return Err(invalid(id, "titulo vazio ou acima de 140 caracteres"));
                }
            }
            Composition::Character { text, persona, .. } => {
                if text.trim().is_empty() || text.chars().count() > 140 {
                    return Err(invalid(
                        id,
                        "fala do personagem vazia ou acima de 140 caracteres",
                    ));
                }
                if let Some(persona) = persona {
                    let name = persona.name.trim();
                    if name.is_empty() || name.chars().count() > crate::persona::MAX_NAME_CHARS {
                        return Err(invalid(id, "nome do personagem vazio ou longo demais"));
                    }
                    if persona
                        .number
                        .is_some_and(|number| !(1..=99).contains(&number))
                    {
                        return Err(invalid(id, "numero do uniforme fora de 1 a 99"));
                    }
                }
            }
            Composition::FlowDiagram {
                objects, relations, ..
            } => {
                if objects.len() < 2 || relations.is_empty() {
                    return Err(invalid(id, "fluxo exige ao menos 2 nos e 1 ligacao"));
                }
            }
            Composition::Comparison {
                left_title,
                right_title,
                objects,
            } => {
                let groups: HashSet<&str> = objects
                    .iter()
                    .filter_map(|object| object.group.as_deref())
                    .collect();
                if left_title.trim().is_empty()
                    || right_title.trim().is_empty()
                    || objects.is_empty()
                    || objects.iter().any(|object| object.group.is_none())
                    || groups.len() != 2
                {
                    return Err(invalid(
                        id,
                        "comparacao exige dois grupos nomeados e objetos com group",
                    ));
                }
            }
            Composition::Timeline { objects } | Composition::CauseEffect { objects } => {
                if objects.len() < 2 || objects.len() > 8 {
                    return Err(invalid(
                        id,
                        "linha do tempo e causa/efeito exigem 2 a 8 itens",
                    ));
                }
            }
            Composition::Steps { objects } => {
                if objects.len() < 2 || objects.len() > 6 {
                    return Err(invalid(id, "passos exigem 2 a 6 itens"));
                }
            }
            Composition::Freeform { elements } => validate_freeform(id, elements)?,
            Composition::Stage {
                headline,
                actors,
                prop,
                meter,
                tasks,
                stamp,
            } => validate_stage(
                id,
                &narration_words(narration),
                StageParts {
                    headline,
                    actors,
                    prop: prop.as_ref(),
                    meter: meter.as_ref(),
                    tasks,
                    stamp: stamp.as_deref(),
                },
                narration,
            )?,
            Composition::Chart {
                objects, max_value, ..
            } => {
                if objects.is_empty() || objects.iter().any(|object| object.value.is_none()) {
                    return Err(invalid(id, "grafico exige objetos com value"));
                }
                if max_value.is_some_and(|value| !value.is_finite() || value <= 0.0) {
                    return Err(invalid(id, "max_value deve ser positivo"));
                }
            }
            Composition::Architecture { objects, .. } => {
                if objects.is_empty() {
                    return Err(invalid(id, "arquitetura sem objetos"));
                }
            }
            Composition::Code {
                lines, language, ..
            } => {
                if lines.is_empty() || lines.len() > 18 || language.trim().is_empty() {
                    return Err(invalid(id, "codigo exige linguagem e 1 a 18 linhas"));
                }
                if lines.iter().any(|line| line.chars().count() > 48) {
                    return Err(invalid(id, "linha de codigo acima de 48 caracteres"));
                }
            }
            Composition::Transformation { before, after, .. } => {
                if before.is_empty() || after.is_empty() {
                    return Err(invalid(id, "transformacao exige objetos antes e depois"));
                }
            }
            Composition::Annotation { objects, .. } | Composition::Infographic { objects, .. } => {
                if objects.is_empty() {
                    return Err(invalid(id, "composicao sem objetos"));
                }
            }
        }
        Ok(())
    }

    /// Resolves a cue to seconds relative to the scene start. Requires narrated segments
    /// for word and segment cues; without them, those cues fall back to the scene start.
    pub fn resolve_cue(&self, cue: &Cue) -> f32 {
        match cue {
            Cue::Time { secs } => *secs,
            Cue::Start => 0.0,
            Cue::End { before_secs } => (self.duration_secs - before_secs).max(0.0),
            Cue::Fraction { fraction } => self.duration_secs * fraction.clamp(0.0, 1.0),
            Cue::Segment { index } => self
                .segments
                .get(*index)
                .map(|segment| segment.start_secs)
                .unwrap_or(0.0),
            Cue::Word { word, occurrence } => {
                let wanted = normalize(word);
                let wanted = narration_words(&wanted).join(" ");
                let mut seen = 0usize;
                for segment in &self.segments {
                    for timed in &segment.words {
                        if narration_words(&timed.text).join(" ") == wanted {
                            if seen == *occurrence {
                                return timed.start_secs;
                            }
                            seen += 1;
                        }
                    }
                }
                0.0
            }
        }
    }

    /// All timed words of the scene in order.
    pub fn timed_words(&self) -> Vec<&TimedWord> {
        self.segments
            .iter()
            .flat_map(|segment| segment.words.iter())
            .collect()
    }
}

/// True when the words of `phrase` appear contiguously in `words` (punctuation ignored).
pub fn contains_phrase(words: &[String], phrase: &str) -> bool {
    let wanted = narration_words(phrase);
    if wanted.is_empty() {
        return false;
    }
    words
        .windows(wanted.len())
        .any(|window| window.iter().zip(&wanted).all(|(a, b)| a == b))
}

/// Formats a value the way the renderer shows it: integers without decimals, otherwise
/// one decimal, with Brazilian thousand separators.
pub fn format_value(value: f64, unit: Option<&str>) -> String {
    let number = if (value.fract()).abs() < 1e-9 {
        let integer = value.round() as i64;
        let digits = integer.abs().to_string();
        let mut grouped = String::new();
        for (index, character) in digits.chars().enumerate() {
            if index > 0 && (digits.len() - index) % 3 == 0 {
                grouped.push('.');
            }
            grouped.push(character);
        }
        if integer < 0 {
            format!("-{grouped}")
        } else {
            grouped
        }
    } else {
        format!("{value:.1}").replace('.', ",")
    };
    match unit {
        Some(unit) => format!("{number}{unit}"),
        None => number,
    }
}

/// A number counts as spoken when its digits appear, or when its integer value appears,
/// in the narration (e.g. "3" for "3 passos", "175" for "175 bilhões").
fn number_is_spoken(shown: &str, value: f64, narration: &str) -> bool {
    let digits: String = shown
        .chars()
        .filter(|c| c.is_ascii_digit() || *c == ',')
        .collect();
    let plain = (value.round() as i64).to_string();
    let compact = shown.replace('.', "");
    let spelled = number_words(shown, value);
    narration.contains(&normalize(shown))
        || narration.contains(&compact.to_lowercase())
        || narration.contains(&digits)
        || narration
            .split(|c: char| !c.is_alphanumeric())
            .any(|token| token == plain || spelled.contains(&token))
}

/// How a small whole number with no unit is said in words, in Portuguese and English
/// ("3" is said "tres", "três" or "three"); empty for any other number, which must be
/// spoken in digits.
fn number_words(shown: &str, value: f64) -> &'static [&'static str] {
    const WORDS: [&[&str]; 21] = [
        &["zero"],
        &["um", "uma", "one"],
        &["dois", "duas", "two"],
        &["tres", "três", "three"],
        &["quatro", "four"],
        &["cinco", "five"],
        &["seis", "six"],
        &["sete", "seven"],
        &["oito", "eight"],
        &["nove", "nine"],
        &["dez", "ten"],
        &["onze", "eleven"],
        &["doze", "twelve"],
        &["treze", "thirteen"],
        &["quatorze", "catorze", "fourteen"],
        &["quinze", "fifteen"],
        &["dezesseis", "sixteen"],
        &["dezessete", "seventeen"],
        &["dezoito", "eighteen"],
        &["dezenove", "nineteen"],
        &["vinte", "twenty"],
    ];
    let whole = value.fract() == 0.0 && (0.0..=20.0).contains(&value);
    if whole && shown == (value as i64).to_string() {
        WORDS[value as usize]
    } else {
        &[]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn freeform(elements: serde_json::Value) -> Result<()> {
        let mut scene = scene();
        scene.animations.clear();
        scene.composition = serde_json::from_value(serde_json::json!({
            "kind": "freeform",
            "elements": elements,
        }))
        .unwrap();
        scene.validate()
    }

    #[test]
    fn freeform_elements_parse_and_stay_inside_the_content_area() {
        let ok = serde_json::json!([
            { "id": "a", "shape": { "kind": "card", "area": { "x": 0, "y": 0, "w": 50, "h": 30 }, "text": "Decide", "icon": "brain" } },
            { "id": "b", "shape": { "kind": "circle", "area": { "x": 60, "y": 0, "w": 40, "h": 40 }, "role": "accent" } },
            { "id": "c", "shape": { "kind": "text", "area": { "x": 0, "y": 60, "w": 100, "h": 40 }, "text": "Age e observa", "size": "heading" } },
            { "id": "d", "shape": { "kind": "icon", "area": { "x": 0, "y": 40, "w": 10, "h": 10 }, "icon": "loop" } },
            { "id": "e", "shape": { "kind": "arrow", "from": { "x": 50, "y": 15 }, "to": { "x": 60, "y": 20 } } }
        ]);
        freeform(ok).unwrap();
        let outside = serde_json::json!([
            { "id": "a", "shape": { "kind": "card", "area": { "x": 60, "y": 0, "w": 50, "h": 30 } } }
        ]);
        assert!(freeform(outside)
            .unwrap_err()
            .to_string()
            .contains("0..100"));
        let duplicate = serde_json::json!([
            { "id": "a", "shape": { "kind": "icon", "area": { "x": 0, "y": 0, "w": 10, "h": 10 }, "icon": "loop" } },
            { "id": "a", "shape": { "kind": "icon", "area": { "x": 20, "y": 0, "w": 10, "h": 10 }, "icon": "loop" } }
        ]);
        assert!(freeform(duplicate)
            .unwrap_err()
            .to_string()
            .contains("duplicado"));
        let long = serde_json::json!([
            { "id": "a", "shape": { "kind": "card", "area": { "x": 0, "y": 0, "w": 50, "h": 30 }, "text": "x".repeat(61) } }
        ]);
        assert!(freeform(long).unwrap_err().to_string().contains("60"));
        let point_arrow = serde_json::json!([
            { "id": "a", "shape": { "kind": "arrow", "from": { "x": 5, "y": 5 }, "to": { "x": 5, "y": 5 } } }
        ]);
        assert!(freeform(point_arrow).is_err());
        assert!(freeform(serde_json::json!([])).is_err());
        let unknown_field = serde_json::from_value::<Composition>(serde_json::json!({
            "kind": "freeform",
            "elements": [{ "id": "a", "shape": { "kind": "card", "area": { "x": 0, "y": 0, "w": 1, "h": 1 }, "svg": "<script/>" } }]
        }));
        assert!(unknown_field.is_err(), "no raw SVG/HTML field is accepted");
    }

    fn object(id: &str, label: &str) -> VisualObject {
        VisualObject {
            id: id.into(),
            label: label.into(),
            detail: None,
            role: Role::Neutral,
            icon: None,
            value: None,
            unit: None,
            group: None,
            parent: None,
        }
    }

    fn scene() -> StoryboardScene {
        StoryboardScene {
            id: 1,
            concept: "O loop do agente".into(),
            learning_goal: "Reconhecer as etapas".into(),
            narration: "O agente decide, age e observa. Depois repete.".into(),
            segments: Vec::new(),
            duration_secs: 0.0,
            start_secs: 0.0,
            composition: Composition::FlowDiagram {
                objects: vec![object("decide", "Decide"), object("age", "Age")],
                relations: vec![Relation {
                    from: "decide".into(),
                    to: "age".into(),
                    kind: RelationKind::Flow,
                    label: None,
                }],
                looped: true,
            },
            animations: vec![Animation {
                target: "age".into(),
                motion: Motion::Highlight,
                at: Cue::Word {
                    word: "age".into(),
                    occurrence: 0,
                },
                duration_secs: 0.6,
                easing: Easing::EaseOut,
                destination: None,
            }],
            captions: CaptionPlan {
                emphasis: vec!["repete".into()],
                hidden: false,
            },
            resources: Vec::new(),
            validation: ValidationCriteria::default(),
            transition: Transition::Cut,
        }
    }

    fn storyboard() -> Storyboard {
        Storyboard {
            version: SCHEMA_VERSION,
            title: "Teste".into(),
            channel: "demo".into(),
            format: VideoFormat::Vertical,
            language: "pt-BR".into(),
            scenes: vec![scene()],
            look: None,
            source_hash: None,
            identity: None,
        }
    }

    #[test]
    fn valid_storyboard_round_trips_through_json() {
        let board = storyboard();
        board.validate().unwrap();
        let text = serde_json::to_string_pretty(&board).unwrap();
        let back: Storyboard = serde_json::from_str(&text).unwrap();
        assert_eq!(back, board);
    }

    #[test]
    fn cubic_bezier_easing_round_trips_and_validates() {
        let mut board = storyboard();
        board.scenes[0].animations[0].easing = Easing::cubic_bezier(0.25, 0.1, 0.25, 1.0);
        board.validate().unwrap();
        let text = serde_json::to_string(&board).unwrap();
        assert!(text.contains("cubic_bezier"), "{text}");
        let back: Storyboard = serde_json::from_str(&text).unwrap();
        assert_eq!(back, board);
        // The pre-existing string forms still deserialize unchanged.
        let old: Easing = serde_json::from_str("\"ease_out\"").unwrap();
        assert_eq!(old, Easing::EaseOut);
        // x outside 0..=1 (or non-finite) is rejected by validation.
        board.scenes[0].animations[0].easing = Easing::cubic_bezier(1.5, 0.0, 0.5, 1.0);
        assert!(board.validate().is_err());
        board.scenes[0].animations[0].easing = Easing::cubic_bezier(f32::NAN, 0.0, 0.5, 1.0);
        assert!(board.validate().is_err());
    }

    #[test]
    fn group_target_and_whip_pan_round_trip_and_validate() {
        let mut board = storyboard();
        // Both flow objects form one named sub-composition.
        if let Composition::FlowDiagram { objects, .. } = &mut board.scenes[0].composition {
            for object in objects.iter_mut() {
                object.group = Some("loop".into());
            }
        }
        assert_eq!(
            board.scenes[0].composition.groups()["loop"],
            vec!["decide".to_string(), "age".to_string()]
        );
        board.scenes[0].animations[0].target = "group:loop".into();
        board.scenes[0].transition = Transition::WhipPan;
        board.validate().unwrap();
        let text = serde_json::to_string(&board).unwrap();
        assert!(text.contains("\"whip_pan\""), "{text}");
        assert!(text.contains("group:loop"), "{text}");
        let back: Storyboard = serde_json::from_str(&text).unwrap();
        assert_eq!(back, board);
        // An unknown group is rejected like an unknown object.
        board.scenes[0].animations[0].target = "group:ghost".into();
        assert!(board.validate().is_err());
    }

    #[test]
    fn unknown_fields_and_unknown_objects_are_rejected() {
        let mut text = serde_json::to_value(storyboard()).unwrap();
        text["scenes"][0]["ffmpeg"] = serde_json::json!("-vf scale");
        assert!(serde_json::from_value::<Storyboard>(text).is_err());
        let mut board = storyboard();
        board.scenes[0].animations[0].target = "ghost".into();
        assert!(board.validate().is_err());
    }

    #[test]
    fn cues_emphasis_and_numbers_must_be_spoken() {
        let mut board = storyboard();
        board.scenes[0].animations[0].at = Cue::Word {
            word: "inexistente".into(),
            occurrence: 0,
        };
        assert!(board.validate().is_err());
        let mut board = storyboard();
        board.scenes[0].captions.emphasis = vec!["silencio".into()];
        assert!(board.validate().is_err());
        let mut board = storyboard();
        let mut bar = object("tokens", "Tokens");
        bar.value = Some(40.0);
        bar.unit = Some("%".into());
        board.scenes[0].composition = Composition::Chart {
            title: "Uso".into(),
            objects: vec![bar],
            max_value: None,
        };
        board.scenes[0].animations.clear();
        board.scenes[0].captions.emphasis.clear();
        assert!(board.validate().is_err(), "40% is not in the narration");
        board.scenes[0].narration = "Cai para 40% do contexto.".into();
        board.validate().unwrap();
    }

    #[test]
    fn segments_resolve_word_cues_to_real_times() {
        let mut scene = scene();
        scene.segments = vec![NarrationSegment {
            text: "O agente decide, age e observa.".into(),
            start_secs: 0.0,
            end_secs: 2.0,
            words: vec![
                TimedWord {
                    text: "O".into(),
                    start_secs: 0.0,
                    end_secs: 0.2,
                },
                TimedWord {
                    text: "agente".into(),
                    start_secs: 0.2,
                    end_secs: 0.7,
                },
                TimedWord {
                    text: "decide,".into(),
                    start_secs: 0.7,
                    end_secs: 1.2,
                },
                TimedWord {
                    text: "age".into(),
                    start_secs: 1.2,
                    end_secs: 1.5,
                },
            ],
            aligned: false,
        }];
        scene.duration_secs = 2.4;
        scene.validate().unwrap();
        assert_eq!(scene.resolve_cue(&scene.animations[0].at), 1.2);
        assert_eq!(scene.resolve_cue(&Cue::End { before_secs: 0.4 }), 2.0);
    }

    #[test]
    fn formats_values_in_pt_br() {
        assert_eq!(format_value(175_000_000_000.0, None), "175.000.000.000");
        assert_eq!(format_value(42.0, Some("%")), "42%");
        assert_eq!(format_value(3.5, Some(" ms")), "3,5 ms");
    }

    fn stage(narration: &str, composition: serde_json::Value) -> Result<()> {
        let mut scene = scene();
        scene.animations.clear();
        scene.captions.emphasis.clear();
        scene.narration = narration.into();
        let mut composition = composition;
        composition["kind"] = "stage".into();
        scene.composition = serde_json::from_value(composition).unwrap();
        scene.validate()
    }

    #[test]
    fn a_small_whole_number_may_be_spoken_in_words() {
        let narration = normalize("Escolha três cores e duas fontes. Pick three colors.");
        assert!(number_is_spoken("3", 3.0, &narration));
        assert!(number_is_spoken("2", 2.0, &narration));
        assert!(number_is_spoken("3", 3.0, &normalize("Use tres cores.")));
        assert!(
            !number_is_spoken("4", 4.0, &narration),
            "another number is not spoken"
        );
        assert!(
            !number_is_spoken("3%", 3.0, &normalize("Sobram três.")),
            "a number with a unit is said in digits"
        );
        assert!(!number_is_spoken("2,5", 2.5, &normalize("Dois e meio.")));
        assert!(!number_is_spoken("30", 30.0, &normalize("Trinta dias.")));
        assert!(
            !number_is_spoken("3", 3.0, &normalize("Os trestes falham.")),
            "a word only counts whole"
        );
    }

    #[test]
    fn a_stage_carries_cast_gauge_tasks_and_a_prop() {
        let narration = "O Opus faz tudo, até renomear arquivo. Sobra 20% do plano.";
        stage(
            narration,
            serde_json::json!({
                "headline": "ATÉ O *FÁCIL*",
                "actors": [{ "id": "opus", "name": "Opus", "hat": "hard_hat" }],
                "meter": { "label": "Uso do plano restante", "from": 90, "to": 20, "unit": "%" },
                "tasks": [{ "label": "renomear arquivo", "at": "renomear" }, { "label": "ler log" }],
            }),
        )
        .unwrap();
    }

    #[test]
    fn a_stage_rejects_unspoken_numbers_and_dangling_targets() {
        let actors = serde_json::json!([{ "id": "opus", "name": "Opus" }]);
        let unspoken = stage(
            "O plano acaba rapido.",
            serde_json::json!({ "headline": "x", "actors": actors, "meter": { "label": "plano", "from": 90, "to": 20 } }),
        );
        assert!(unspoken.unwrap_err().to_string().contains("numeric: false"));
        stage(
            "O plano acaba rapido.",
            serde_json::json!({ "headline": "x", "actors": actors, "meter": { "label": "plano", "from": 90, "to": 20, "numeric": false } }),
        )
        .unwrap();
        let dangling = stage(
            "O plano acaba.",
            serde_json::json!({ "headline": "x", "actors": actors, "tasks": [{ "label": "ler", "to": "haiku" }] }),
        );
        assert!(dangling.unwrap_err().to_string().contains("haiku"));
        let no_prop = stage(
            "O plano acaba.",
            serde_json::json!({ "headline": "x", "actors": actors, "tasks": [{ "label": "ler", "to": "prop" }] }),
        );
        assert!(no_prop.is_err());
        let stamp = stage(
            "Um modelo mais barato.",
            serde_json::json!({ "headline": "x", "actors": actors, "stamp": "90% MAIS BARATO" }),
        );
        assert!(stamp.unwrap_err().to_string().contains("90%"));
        stage(
            "Um modelo 90% mais barato.",
            serde_json::json!({ "headline": "x", "actors": actors, "stamp": "90% MAIS BARATO" }),
        )
        .unwrap();
        let unbalanced = stage(
            "x y.",
            serde_json::json!({ "headline": "*x", "actors": actors }),
        );
        assert!(unbalanced.is_err());
        let empty = stage("x y.", serde_json::json!({ "headline": "x" }));
        assert!(empty.unwrap_err().to_string().contains("ator"));
        let table = stage(
            "Custa US$ 0,10 agora.",
            serde_json::json!({ "headline": "x", "prop": { "kind": "table", "title": "Preço", "rows": [{ "label": "Haiku", "value": "US$ 0,10" }, { "label": "Antes", "value": "US$ 1,00" }] } }),
        );
        assert!(table.unwrap_err().to_string().contains("1,00"));
        let wrong_word = stage(
            "x y.",
            serde_json::json!({ "headline": "x", "actors": actors, "tasks": [{ "label": "ler", "at": "log" }] }),
        );
        assert!(wrong_word.unwrap_err().to_string().contains("log"));
    }

    #[test]
    fn kinds_list_matches_the_enum() {
        for kind in Composition::KINDS {
            let json = match kind {
                "title" => serde_json::json!({"kind": kind, "text": "x"}),
                "character" => {
                    serde_json::json!({"kind": kind, "character": "robot", "pose": "point", "text": "x"})
                }
                "code" => serde_json::json!({"kind": kind, "language": "md", "lines": ["a"]}),
                "comparison" => {
                    serde_json::json!({"kind": kind, "left_title": "a", "right_title": "b", "objects": []})
                }
                "chart" | "infographic" => {
                    serde_json::json!({"kind": kind, "title": "t", "objects": []})
                }
                "transformation" => serde_json::json!({"kind": kind, "before": [], "after": []}),
                "freeform" => serde_json::json!({"kind": kind, "elements": []}),
                "stage" => serde_json::json!({"kind": kind, "headline": "x"}),
                "flow_diagram" | "architecture" => {
                    serde_json::json!({"kind": kind, "objects": [], "relations": []})
                }
                _ => serde_json::json!({"kind": kind, "objects": []}),
            };
            let parsed: Composition = serde_json::from_value(json).unwrap();
            assert_eq!(parsed.kind_name(), kind);
        }
    }
}

#[cfg(test)]
mod schema_tests {
    use super::*;

    /// The JSON Schema document is hand-written; keep its closed enumerations in step
    /// with the Rust types so editors and models validate against the same catalog.
    #[test]
    fn json_schema_mirrors_the_rust_catalog() {
        let schema: serde_json::Value =
            serde_json::from_str(include_str!("../../../docs/schemas/storyboard.schema.json"))
                .unwrap();
        let kinds: Vec<&str> = schema["$defs"]["composition"]["oneOf"]
            .as_array()
            .unwrap()
            .iter()
            .map(|variant| variant["properties"]["kind"]["const"].as_str().unwrap())
            .collect();
        assert_eq!(kinds, Composition::KINDS);
        let motions: Vec<String> = schema["$defs"]["animation"]["properties"]["motion"]["enum"]
            .as_array()
            .unwrap()
            .iter()
            .map(|value| value.as_str().unwrap().to_string())
            .collect();
        for motion in [
            Motion::Reveal,
            Motion::Draw,
            Motion::Pop,
            Motion::Highlight,
            Motion::Pulse,
            Motion::Focus,
            Motion::Count,
            Motion::Grow,
            Motion::MoveTo,
            Motion::Type,
            Motion::Hide,
            Motion::Breathe,
        ] {
            let name = serde_json::to_value(motion).unwrap();
            assert!(
                motions.contains(&name.as_str().unwrap().to_string()),
                "{name}"
            );
        }
        let icons = schema["$defs"]["object"]["properties"]["icon"]["enum"]
            .as_array()
            .unwrap();
        assert_eq!(icons.len(), 22);
        let formats = schema["properties"]["format"]["enum"].as_array().unwrap();
        for format in [
            VideoFormat::Vertical,
            VideoFormat::Horizontal,
            VideoFormat::X,
        ] {
            assert!(formats.contains(&serde_json::to_value(format).unwrap()));
        }
    }
}
