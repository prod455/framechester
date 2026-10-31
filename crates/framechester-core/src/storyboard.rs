//! Semantic storyboard: the renderer-independent plan of an explanatory video.
//!
//! The planner (a model or the deterministic `crate::planner`) describes *meaning*:
//! which concept each scene explains, which objects exist, how they relate, and which
//! animation events happen at which narration word. It never writes FFmpeg filters,
//! pixel coordinates or SVG. `docs/schemas/storyboard.schema.json` mirrors this
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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
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
    /// A character who talks while the narration plays, next to a speech card.
    Character {
        character: Character,
        pose: Pose,
        text: String,
        /// Drawn from the script's description instead of the preset `character`.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        persona: Option<crate::persona::Persona>,
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
            Composition::Character { .. } => "character",
        }
    }

    pub const KINDS: [&'static str; 12] = [
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
        "character",
    ];

    /// Every object id the composition defines, in order.
    pub fn object_ids(&self) -> Vec<&str> {
        match self {
            Composition::Title { .. } => vec!["title"],
            Composition::Character { .. } => vec!["character", "speech"],
            Composition::FlowDiagram { objects, .. }
            | Composition::Comparison { objects, .. }
            | Composition::Timeline { objects }
            | Composition::Chart { objects, .. }
            | Composition::Architecture { objects, .. }
            | Composition::Annotation { objects, .. }
            | Composition::Infographic { objects, .. }
            | Composition::CauseEffect { objects } => {
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

    fn objects(&self) -> Vec<&VisualObject> {
        match self {
            Composition::Title { .. }
            | Composition::Code { .. }
            | Composition::Character { .. } => Vec::new(),
            Composition::FlowDiagram { objects, .. }
            | Composition::Comparison { objects, .. }
            | Composition::Timeline { objects }
            | Composition::Chart { objects, .. }
            | Composition::Architecture { objects, .. }
            | Composition::Annotation { objects, .. }
            | Composition::Infographic { objects, .. }
            | Composition::CauseEffect { objects } => objects.iter().collect(),
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
        for animation in &self.animations {
            if animation.target != "*"
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
    narration.contains(&normalize(shown))
        || narration.contains(&compact.to_lowercase())
        || narration.contains(&digits)
        || narration
            .split(|c: char| !c.is_alphanumeric())
            .any(|token| token == plain)
}

#[cfg(test)]
mod tests {
    use super::*;

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
            source_hash: None,
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
