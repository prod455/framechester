//! Stage: one continuing shot instead of a layout per scene. A fixed block headline, a
//! mascot cast told apart by accessory and badge, one physical metaphor (a coin that gets
//! bitten, a funnel that sorts, a wall that grows, a data card, an envelope), a gauge
//! that carries its value from scene to scene and tasks that fly in as labels and change
//! all of them when they land. The scene animates itself from the narration timing:
//! nothing here waits for storyboard `animations`.
use super::Ctx;
use crate::anim::Track;
use crate::format::Rect;
use crate::scene::{Anchor, Node, Shape};
use crate::tokens::{self, palette};
use framechester_core::storyboard::{
    format_value, narration_words, plain_headline, Actor, Composition, Easing, Hat, Meter,
    MeterStyle, Prop, StoryboardScene, Task, TimedWord,
};

/// What a stage scene inherits from the stage scenes before it.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct StageContext {
    /// Number of blocks (distinct consecutive headlines) in the whole storyboard.
    pub chapters: usize,
    /// This scene's block, from 0.
    pub chapter: usize,
    /// The previous scene is a stage with the same headline: nothing that is already on
    /// screen enters again, so the cut between the two scenes is invisible.
    pub continues: bool,
    /// Actor ids already on screen when the scene starts.
    pub carried_actors: Vec<String>,
    /// Hits the same prop took in the earlier scenes of the block (bites, bricks).
    pub hits_before: usize,
    /// First scene of the video: entries in the hook are already on screen at frame 0.
    pub hook: bool,
}

/// Computes each scene's [`StageContext`]; `None` for scenes that are not stages.
pub fn contexts(scenes: &[StoryboardScene]) -> Vec<Option<StageContext>> {
    let headline_of = |scene: &StoryboardScene| match &scene.composition {
        Composition::Stage { headline, .. } => Some(plain_headline(headline)),
        _ => None,
    };
    let mut chapters = 0usize;
    let mut previous: Option<String> = None;
    let mut chapter_of = Vec::with_capacity(scenes.len());
    for scene in scenes {
        let headline = headline_of(scene);
        if let Some(headline) = &headline {
            if previous.as_ref() != Some(headline) {
                chapters += 1;
            }
        }
        chapter_of.push(chapters.saturating_sub(1));
        previous = headline;
    }
    let mut hits_before = 0usize;
    let mut result = Vec::with_capacity(scenes.len());
    for (index, scene) in scenes.iter().enumerate() {
        let Composition::Stage {
            prop,
            tasks,
            actors,
            ..
        } = &scene.composition
        else {
            result.push(None);
            hits_before = 0;
            continue;
        };
        let before = index.checked_sub(1).map(|at| &scenes[at]);
        let continues = before.is_some_and(|before| headline_of(before) == headline_of(scene));
        let (carried_actors, same_prop) = match before.map(|before| &before.composition) {
            Some(Composition::Stage {
                actors: previous_actors,
                prop: previous_prop,
                ..
            }) if continues => (
                previous_actors
                    .iter()
                    .filter(|actor| actors.iter().any(|now| now.id == actor.id))
                    .map(|actor| actor.id.clone())
                    .collect(),
                previous_prop.as_ref() == prop.as_ref(),
            ),
            _ => (Vec::new(), false),
        };
        if !same_prop {
            hits_before = 0;
        }
        result.push(Some(StageContext {
            chapters,
            chapter: chapter_of[index],
            continues,
            carried_actors,
            hits_before,
            hook: index == 0,
        }));
        hits_before += prop_hits(prop.as_ref(), tasks, actors);
    }
    result
}

/// Hits that change the prop: tasks aimed at a coin, or every finished task for a wall.
fn prop_hits(prop: Option<&Prop>, tasks: &[Task], actors: &[Actor]) -> usize {
    match prop {
        Some(Prop::Coin { .. }) => tasks
            .iter()
            .filter(|task| task.target(actors) == "prop")
            .count(),
        Some(Prop::Wall) => tasks.len(),
        _ => 0,
    }
}

// Mascot and prop inks: drawn objects, the same in every look (like an illustration
// pasted on the page); text on them is checked against these.
const BODY: &str = "#E07A55";
const BODY_EDGE: &str = "#9C4A2E";
const FACE: &str = "#EE9671";
const FEET: &str = "#B85A3A";
const EYE: &str = "#1D1A18";
const HARD_HAT: &str = "#F2B630";
const HARD_HAT_EDGE: &str = "#B9851A";
const CAP: &str = "#2A2A2E";
const CROWN: &str = "#F2C230";
const COIN: &str = "#F2B630";
const COIN_EDGE: &str = "#B9851A";
const COIN_INK: &str = "#5E3B00";
const RIVAL: &str = "#4F86E8";
const RIVAL_EDGE: &str = "#2F5DB3";
const RIVAL_INK: &str = "#FFFFFF";
const BRICK: &str = "#C2452D";
const BRICK_EDGE: &str = "#8B2C1B";
const FUNNEL: &str = "#A8A39A";
const FUNNEL_EDGE: &str = "#6E6A63";
const MARK: &str = "#D7263D";

/// Seconds a task label shows where it appears before it flies.
const TASK_HOLD: f32 = 0.35;
/// Seconds a task label flies to its target.
const TASK_FLIGHT: f32 = 0.4;
/// Bites a coin can show before it is just a bitten coin.
const MAX_BITES: usize = 8;
const MAX_BRICKS: usize = 18;

const STOPWORDS: [&str; 24] = [
    "de", "do", "da", "dos", "das", "o", "a", "os", "as", "e", "que", "um", "uma", "no", "na",
    "em", "pra", "para", "com", "por", "se", "ao", "the", "of",
];

fn normal(text: &str) -> String {
    narration_words(text).join(" ")
}

fn stem(word: &str) -> String {
    word.chars().take(5).collect()
}

fn same_word(spoken: &str, wanted: &str) -> bool {
    spoken == wanted
        || (spoken.chars().count() >= 5
            && wanted.chars().count() >= 5
            && stem(spoken) == stem(wanted))
}

/// Start of the first narration word at or after `after` that is (or shares a stem with)
/// `wanted`.
fn word_time(words: &[&TimedWord], wanted: &str, after: f32) -> Option<f32> {
    let wanted = normal(wanted);
    if wanted.is_empty() {
        return None;
    }
    words
        .iter()
        .filter(|word| word.start_secs >= after - 1e-3)
        .find(|word| same_word(&normal(&word.text), &wanted))
        .map(|word| word.start_secs)
}

/// When a label is spoken: the earliest of its distinctive words, at or after `after`.
fn label_time(words: &[&TimedWord], label: &str, after: f32) -> Option<f32> {
    narration_words(label)
        .iter()
        .filter(|word| word.chars().count() >= 3 && !STOPWORDS.contains(&word.as_str()))
        .filter_map(|word| word_time(words, word, after))
        .reduce(f32::min)
}

/// One task's flight: shown at `launch`, lands at `hit`.
#[derive(Debug, Clone, PartialEq)]
pub struct Hit {
    pub launch: f32,
    pub hit: f32,
    pub target: String,
}

/// When each task flies: on its word (or label), else spread evenly; always in order and
/// at least a flight apart, and landed before the scene ends.
pub fn schedule(scene: &StoryboardScene, tasks: &[Task], actors: &[Actor]) -> Vec<Hit> {
    let duration = scene.duration_secs.max(1.0);
    let words = scene.timed_words();
    let count = tasks.len();
    let mut cursor = 0.0f32;
    let mut hits = Vec::with_capacity(count);
    let landing = TASK_HOLD + TASK_FLIGHT;
    for (index, task) in tasks.iter().enumerate() {
        let spread = duration * (0.12 + 0.72 * (index as f32 + 0.5) / count as f32);
        let spoken = match &task.at {
            Some(word) => word_time(&words, word, cursor),
            None => label_time(&words, &task.label, cursor),
        };
        let earliest = hits
            .last()
            .map_or(0.15, |previous: &Hit| previous.launch + 0.45);
        let launch = spoken
            .unwrap_or(spread)
            .max(earliest)
            .min((duration - landing - 0.1).max(0.0));
        cursor = launch;
        hits.push(Hit {
            launch,
            hit: launch + landing,
            target: task.target(actors).to_string(),
        });
    }
    hits
}

fn fill_path(object: &str, d: String, fill: &str, stroke: Option<(&str, f32)>) -> Node {
    let (stroke, width) = stroke.unwrap_or(("none", 0.0));
    Node::new(
        object,
        Shape::Path {
            d,
            stroke: stroke.into(),
            width,
            length: 1.0,
            fill: Some(fill.into()),
            dashed: false,
        },
    )
    .decorative()
}

fn rounded_d(rect: Rect, rx: f32) -> String {
    let rx = rx.min(rect.w / 2.0).min(rect.h / 2.0);
    let (x, y, w, h) = (rect.x, rect.y, rect.w, rect.h);
    format!(
        "M{:.1} {y:.1} H{:.1} A{rx:.1} {rx:.1} 0 0 1 {:.1} {:.1} V{:.1} A{rx:.1} {rx:.1} 0 0 1 {:.1} {:.1} H{:.1} A{rx:.1} {rx:.1} 0 0 1 {x:.1} {:.1} V{:.1} A{rx:.1} {rx:.1} 0 0 1 {:.1} {y:.1} Z",
        x + rx,
        x + w - rx,
        x + w,
        y + rx,
        y + h - rx,
        x + w - rx,
        y + h,
        x + rx,
        y + h - rx,
        y + rx,
        x + rx,
    )
}

fn ellipse_d(cx: f32, cy: f32, rx: f32, ry: f32) -> String {
    format!(
        "M{:.1} {cy:.1} A{rx:.1} {ry:.1} 0 1 0 {:.1} {cy:.1} A{rx:.1} {ry:.1} 0 1 0 {:.1} {cy:.1} Z",
        cx - rx,
        cx + rx,
        cx - rx
    )
}

/// Outline of a coin of radius `r` with `bites` round bites out of its rim, clockwise
/// from the upper right. Each bite is a circle centred on the rim; the outline follows
/// the coin between bites and the inside of each bite circle across it.
pub fn bitten_coin_d(cx: f32, cy: f32, r: f32, bites: usize) -> String {
    let bites = bites.min(MAX_BITES);
    if bites == 0 {
        return ellipse_d(cx, cy, r, r);
    }
    let bite = r * 0.2;
    // Half the angle a bite takes off the rim (chord of length `bite` at radius r... the
    // two circles cross where the chord from the rim point has length `bite`).
    let half = 2.0 * (bite / (2.0 * r)).asin();
    let point = |angle: f32| (cx + r * angle.cos(), cy + r * angle.sin());
    let first = (-60.0f32).to_radians();
    let step = 44.0f32.to_radians();
    let angles: Vec<f32> = (0..bites)
        .map(|index| first + step * index as f32)
        .collect();
    let start = point(angles[0] - half);
    let mut d = format!("M{:.1} {:.1}", start.0, start.1);
    for (index, angle) in angles.iter().enumerate() {
        let enter = point(angle - half);
        if index > 0 {
            d.push_str(&format!(
                " A{r:.1} {r:.1} 0 0 1 {:.1} {:.1}",
                enter.0, enter.1
            ));
        }
        let leave = point(angle + half);
        d.push_str(&format!(
            " A{bite:.1} {bite:.1} 0 0 0 {:.1} {:.1}",
            leave.0, leave.1
        ));
    }
    // Back around the untouched rest of the rim to the first bite.
    let last = angles[angles.len() - 1] + half;
    let remaining = (first - half + std::f32::consts::TAU) - last;
    let large = if remaining > std::f32::consts::PI {
        1
    } else {
        0
    };
    d.push_str(&format!(
        " A{r:.1} {r:.1} 0 {large} 1 {:.1} {:.1} Z",
        start.0, start.1
    ));
    d
}

/// Opacity of a node shown only from `from` (None: from the start) until `to` (None:
/// to the end), switching in 0.02 s.
fn show_between(node: &mut Node, from: Option<f32>, to: Option<f32>) {
    let opacity = &mut node.props.opacity;
    *opacity = Track::constant(if from.is_some() { 0.0 } else { 1.0 });
    if let Some(from) = from {
        opacity.key(from.max(0.0), 0.0, Easing::Linear);
        opacity.key(from.max(0.0) + 0.02, 1.0, Easing::Linear);
    }
    if let Some(to) = to {
        opacity.key(to.max(0.0), 1.0, Easing::Linear);
        opacity.key(to.max(0.0) + 0.02, 0.0, Easing::Linear);
    }
}

/// An entrance at `at`, or none (already on screen) when the block continues or the hook
/// has already shown it.
fn entrance(stage: &StageContext, carried: bool, at: f32) -> Option<f32> {
    if stage.continues && carried || stage.hook && at <= crate::compose::HOOK_SECS {
        None
    } else {
        Some(at)
    }
}

fn pop_in(nodes: &mut [Node], at: Option<f32>) {
    if let Some(at) = at {
        for node in nodes {
            node.props.pop(at, 0.45, Easing::Back);
        }
    }
}

fn slide_in(nodes: &mut [Node], at: Option<f32>, dy: f32) {
    if let Some(at) = at {
        for node in nodes {
            node.props.reveal(at, 0.45, (0.0, dy), Easing::EaseOut);
        }
    }
}

/// Splits `*accent*` runs: (text, accented) per word.
fn headline_words(headline: &str) -> Vec<(String, bool)> {
    let mut words = Vec::new();
    for (index, part) in headline.split('*').enumerate() {
        for word in part.split_whitespace() {
            words.push((word.to_uppercase(), index % 2 == 1));
        }
    }
    words
}

/// The block headline on a light pill, wrapped and centred, the accent words in colour.
fn headline(ctx: &mut Ctx<'_>, text: &str, top: f32, area: Rect) -> (Vec<Node>, f32) {
    let canvas = ctx.canvas;
    let scale = canvas.type_scale;
    let words = headline_words(text);
    let plain: String = words
        .iter()
        .map(|(word, _)| word.as_str())
        .collect::<Vec<_>>()
        .join(" ");
    let width = area.w * if canvas.vertical { 0.86 } else { 0.62 };
    let pad = canvas.gap * 0.6;
    let (family, weight) = ctx.display();
    let (size, lines) = ctx.fit_display(
        "headline",
        &plain,
        width - pad * 2.0,
        scale.heading * 2.6,
        scale.heading * 0.82,
        scale.label,
    );
    let line_height = size * tokens::LINE_HEIGHT;
    let widest = lines
        .iter()
        .map(|line| ctx.ts.measure(line, size, weight, family))
        .fold(0.0f32, f32::max);
    let height = line_height * lines.len() as f32 + pad * 1.2;
    let pill = Rect::new(
        area.cx() - (widest + pad * 2.0) / 2.0,
        top,
        widest + pad * 2.0,
        height,
    );
    let mut nodes = vec![Node::new(
        "headline",
        Shape::Rect {
            rect: pill,
            rx: canvas.radius * 0.45,
            fill: tokens::SURFACE.into(),
            stroke: Some((tokens::RULE.into(), canvas.stroke * 0.4)),
        },
    )
    .decorative()];
    // Each line is drawn as runs of one colour, placed by the measured prefix.
    let mut word_index = 0usize;
    for (line_index, line) in lines.iter().enumerate() {
        let line_words: Vec<&str> = line.split_whitespace().collect();
        let line_width = ctx.ts.measure(line, size, weight, family);
        let baseline = pill.y + pad * 0.6 + size * 0.88 + line_index as f32 * line_height;
        let left = area.cx() - line_width / 2.0;
        let mut run_start = 0usize;
        while run_start < line_words.len() {
            let accented = words
                .get(word_index + run_start)
                .is_some_and(|(_, accent)| *accent);
            let mut run_end = run_start + 1;
            while run_end < line_words.len()
                && words
                    .get(word_index + run_end)
                    .is_some_and(|(_, accent)| *accent == accented)
            {
                run_end += 1;
            }
            let prefix = line_words[..run_start].join(" ");
            let x = if run_start == 0 {
                left
            } else {
                left + ctx.ts.measure(&format!("{prefix} "), size, weight, family)
            };
            let run = line_words[run_start..run_end].join(" ");
            let colour = if accented {
                tokens::ACCENT
            } else {
                tokens::INK
            };
            nodes.push(ctx.ts.line(
                "headline",
                &run,
                x,
                baseline,
                size,
                weight,
                family,
                colour,
                Anchor::Start,
            ));
            run_start = run_end;
        }
        word_index += line_words.len();
    }
    (nodes, pill.bottom())
}

/// The block progress track: one dot per block, done ones ticked, the current one lit.
fn track(ctx: &Ctx<'_>, stage: &StageContext, y: f32, area: Rect) -> Vec<Node> {
    let canvas = ctx.canvas;
    let count = stage.chapters.max(1);
    let width = area.w * if canvas.vertical { 0.9 } else { 0.5 };
    let left = area.cx() - width / 2.0;
    let step = if count > 1 {
        width / (count - 1) as f32
    } else {
        0.0
    };
    let r = canvas.stroke * 2.6;
    let mut nodes = vec![Node::new(
        "track",
        Shape::Path {
            d: format!("M{left:.1} {y:.1} L{:.1} {y:.1}", left + width),
            stroke: tokens::RULE.into(),
            width: canvas.stroke * 0.8,
            length: width,
            fill: None,
            dashed: false,
        },
    )
    .decorative()
    .with_z(-3)];
    if stage.chapter > 0 {
        let done = left + step * stage.chapter as f32;
        nodes.push(
            Node::new(
                "track",
                Shape::Path {
                    d: format!("M{left:.1} {y:.1} L{done:.1} {y:.1}"),
                    stroke: tokens::ACCENT.into(),
                    width: canvas.stroke * 0.8,
                    length: done - left,
                    fill: None,
                    dashed: false,
                },
            )
            .decorative()
            .with_z(-3),
        );
    }
    for index in 0..count {
        let cx = left + step * index as f32;
        let (fill, radius, stroke) = match index.cmp(&stage.chapter) {
            std::cmp::Ordering::Less => (tokens::SUCCESS, r, None),
            std::cmp::Ordering::Equal => (
                tokens::ACCENT,
                r * 1.45,
                Some((tokens::SURFACE, canvas.stroke * 0.7)),
            ),
            std::cmp::Ordering::Greater => (
                tokens::SURFACE,
                r * 0.85,
                Some((tokens::RULE, canvas.stroke * 0.5)),
            ),
        };
        let mut dot = Node::new(
            "track",
            Shape::Circle {
                cx,
                cy: y,
                r: radius,
                fill: fill.into(),
                stroke: stroke.map(|(colour, width)| (colour.to_string(), width)),
            },
        )
        .decorative()
        .with_z(-2);
        if index == stage.chapter && !stage.continues {
            dot.props.pop(0.05, 0.4, Easing::Back);
        }
        nodes.push(dot);
        if index < stage.chapter {
            let s = r * 0.55;
            nodes.push(
                Node::new(
                    "track",
                    Shape::Path {
                        d: format!(
                            "M{:.1} {:.1} L{:.1} {:.1} L{:.1} {:.1}",
                            cx - s,
                            y,
                            cx - s * 0.25,
                            y + s * 0.7,
                            cx + s,
                            y - s * 0.6
                        ),
                        stroke: tokens::SURFACE.into(),
                        width: canvas.stroke * 0.6,
                        length: s * 4.0,
                        fill: None,
                        dashed: false,
                    },
                )
                .decorative()
                .with_z(-1),
            );
        }
    }
    nodes
}

/// Where a mascot stands: its feet centre and its body width.
#[derive(Debug, Clone, Copy)]
struct Spot {
    x: f32,
    feet: f32,
    size: f32,
}

impl Spot {
    fn body(&self) -> Rect {
        Rect::new(
            self.x - self.size / 2.0,
            self.feet - self.size * 0.92,
            self.size,
            self.size * 0.8,
        )
    }

    /// Where a task lands on it.
    fn chest(&self) -> (f32, f32) {
        let body = self.body();
        (body.cx(), body.cy())
    }
}

/// Height a mascot takes above its feet, per unit of body width (with its hat), and
/// below them in pixels (its badge).
fn mascot_extent(ctx: &Ctx<'_>) -> (f32, f32) {
    (
        1.25,
        ctx.canvas.gap * 0.35 + ctx.canvas.type_scale.small * 1.5,
    )
}

/// One mascot. Eyes come as three sets (open, blinking, tired) that the animation swaps.
fn mascot(ctx: &mut Ctx<'_>, actor: &Actor, spot: Spot) -> (Vec<Node>, [Vec<Node>; 3]) {
    let canvas = ctx.canvas;
    let id = actor.id.as_str();
    let s = spot.size;
    let body = spot.body();
    let edge = canvas.stroke * 0.8;
    let mut nodes = Vec::new();
    nodes.push(
        fill_path(
            id,
            ellipse_d(spot.x, spot.feet + s * 0.02, s * 0.55, s * 0.07),
            "rgba(0,0,0,0.16)",
            None,
        )
        .with_z(-2),
    );
    for offset in [-0.3f32, 0.0, 0.3] {
        let foot = Rect::new(
            spot.x + offset * s - s * 0.07,
            body.bottom() - s * 0.02,
            s * 0.14,
            s * 0.14,
        );
        nodes.push(fill_path(
            id,
            rounded_d(foot, s * 0.04),
            FEET,
            Some((BODY_EDGE, edge * 0.6)),
        ));
    }
    nodes.push(fill_path(
        id,
        rounded_d(body, s * 0.18),
        BODY,
        Some((BODY_EDGE, edge)),
    ));
    let face = Rect::new(body.x + s * 0.1, body.y + s * 0.12, s * 0.8, s * 0.46);
    nodes.push(fill_path(id, rounded_d(face, s * 0.14), FACE, None));
    let eye_y = face.y + face.h * 0.52;
    let eye_dx = s * 0.17;
    let mut open = Vec::new();
    let mut blink = Vec::new();
    let mut tired = Vec::new();
    for side in [-1.0f32, 1.0] {
        let ex = spot.x + side * eye_dx;
        open.push(fill_path(
            id,
            rounded_d(
                Rect::new(ex - s * 0.045, eye_y - s * 0.1, s * 0.09, s * 0.2),
                s * 0.045,
            ),
            EYE,
            None,
        ));
        blink.push(fill_path(
            id,
            rounded_d(
                Rect::new(ex - s * 0.06, eye_y - s * 0.012, s * 0.12, s * 0.025),
                s * 0.012,
            ),
            EYE,
            None,
        ));
        tired.push(fill_path(
            id,
            rounded_d(
                Rect::new(ex - s * 0.055, eye_y - s * 0.02, s * 0.11, s * 0.07),
                s * 0.03,
            ),
            EYE,
            None,
        ));
    }
    // A sweat drop that only the tired face shows.
    tired.push(fill_path(
        id,
        format!(
            "M{:.1} {:.1} Q{:.1} {:.1} {:.1} {:.1} A{:.1} {:.1} 0 1 1 {:.1} {:.1} Q{:.1} {:.1} {:.1} {:.1} Z",
            face.right() - s * 0.02,
            face.y - s * 0.02,
            face.right() + s * 0.03,
            face.y + s * 0.06,
            face.right() + s * 0.03,
            face.y + s * 0.09,
            s * 0.05,
            s * 0.05,
            face.right() - s * 0.07,
            face.y + s * 0.09,
            face.right() - s * 0.07,
            face.y + s * 0.06,
            face.right() - s * 0.02,
            face.y - s * 0.02,
        ),
        "#7EC8F2",
        None,
    ));
    match actor.hat {
        Hat::None => {}
        Hat::HardHat => {
            let r = s * 0.4;
            let cy = body.y + s * 0.04;
            nodes.push(fill_path(
                id,
                format!(
                    "M{:.1} {cy:.1} A{r:.1} {:.1} 0 0 1 {:.1} {cy:.1} Z",
                    spot.x - r,
                    r * 0.85,
                    spot.x + r
                ),
                HARD_HAT,
                Some((HARD_HAT_EDGE, edge)),
            ));
            nodes.push(fill_path(
                id,
                rounded_d(
                    Rect::new(spot.x - s * 0.55, cy - s * 0.02, s * 1.1, s * 0.09),
                    s * 0.04,
                ),
                HARD_HAT,
                Some((HARD_HAT_EDGE, edge)),
            ));
            nodes.push(fill_path(
                id,
                rounded_d(
                    Rect::new(spot.x - s * 0.05, cy - r * 0.84, s * 0.1, r * 0.8),
                    s * 0.03,
                ),
                HARD_HAT_EDGE,
                None,
            ));
        }
        Hat::Cap => {
            let r = s * 0.36;
            let cy = body.y + s * 0.05;
            nodes.push(fill_path(
                id,
                format!(
                    "M{:.1} {cy:.1} A{r:.1} {:.1} 0 0 1 {:.1} {cy:.1} Z",
                    spot.x - r,
                    r * 0.8,
                    spot.x + r
                ),
                CAP,
                None,
            ));
            nodes.push(fill_path(
                id,
                rounded_d(
                    Rect::new(spot.x - r * 1.05, cy - s * 0.04, r * 2.7, s * 0.08),
                    s * 0.04,
                ),
                CAP,
                None,
            ));
        }
        Hat::Glasses => {
            for side in [-1.0f32, 1.0] {
                let ex = spot.x + side * eye_dx;
                nodes.push(
                    Node::new(
                        id,
                        Shape::Rect {
                            rect: Rect::new(ex - s * 0.12, eye_y - s * 0.12, s * 0.24, s * 0.24),
                            rx: s * 0.05,
                            fill: "none".into(),
                            stroke: Some((EYE.into(), edge * 1.2)),
                        },
                    )
                    .decorative()
                    .with_z(1),
                );
            }
            nodes.push(fill_path(
                id,
                rounded_d(
                    Rect::new(
                        spot.x - eye_dx + s * 0.12,
                        eye_y - s * 0.02,
                        (eye_dx - s * 0.12) * 2.0,
                        s * 0.03,
                    ),
                    1.0,
                ),
                EYE,
                None,
            ));
        }
        Hat::Crown => {
            let w = s * 0.5;
            let base = body.y + s * 0.02;
            let h = s * 0.28;
            nodes.push(fill_path(
                id,
                format!(
                    "M{:.1} {base:.1} L{:.1} {:.1} L{:.1} {:.1} L{:.1} {:.1} L{:.1} {:.1} L{:.1} {:.1} L{:.1} {base:.1} Z",
                    spot.x - w / 2.0,
                    spot.x - w / 2.0,
                    base - h,
                    spot.x - w / 4.0,
                    base - h * 0.55,
                    spot.x,
                    base - h,
                    spot.x + w / 4.0,
                    base - h * 0.55,
                    spot.x + w / 2.0,
                    base - h,
                    spot.x + w / 2.0,
                ),
                CROWN,
                Some((HARD_HAT_EDGE, edge)),
            ));
        }
    }
    // Badge.
    let size = canvas.type_scale.small;
    let name_width = ctx
        .ts
        .measure(&actor.name, size, tokens::WEIGHT_BOLD, tokens::FONT_SANS);
    let badge = Rect::new(
        spot.x - name_width / 2.0 - size * 0.5,
        spot.feet + canvas.gap * 0.35,
        name_width + size,
        size * 1.4,
    );
    let role = palette(actor.role);
    nodes.push(
        Node::new(
            id,
            Shape::Rect {
                rect: badge,
                rx: badge.h / 2.0,
                fill: role.stroke.into(),
                stroke: None,
            },
        )
        .decorative(),
    );
    nodes.push(ctx.ts.line(
        id,
        &actor.name,
        spot.x,
        badge.y + badge.h * 0.5 + size * 0.36,
        size,
        tokens::WEIGHT_BOLD,
        tokens::FONT_SANS,
        tokens::BACKGROUND,
        Anchor::Middle,
    ));
    (nodes, [open, blink, tired])
}

/// Body animation shared by every node of a mascot: entrance, a slow bob and a squash at
/// each hit, all around its feet.
fn animate_mascot(nodes: &mut [Node], spot: Spot, enter: Option<f32>, hits: &[f32], duration: f32) {
    let origin = (spot.x, spot.feet);
    let amplitude = spot.size * 0.025;
    let start = enter.unwrap_or(0.0) + 0.45;
    let mut dy = Track::constant(0.0);
    let mut t = start;
    let mut up = true;
    while t < duration + 1.0 {
        dy.key(t, if up { -amplitude } else { 0.0 }, Easing::EaseInOut);
        t += 0.6;
        up = !up;
    }
    let mut sx = Track::constant(1.0);
    let mut sy = Track::constant(1.0);
    for hit in hits {
        sx.to(*hit, 0.08, 1.08, Easing::EaseOut);
        sy.to(*hit, 0.08, 0.88, Easing::EaseOut);
        sx.to(hit + 0.08, 0.3, 1.0, Easing::Back);
        sy.to(hit + 0.08, 0.3, 1.0, Easing::Back);
    }
    for node in nodes.iter_mut() {
        node.origin = origin;
        node.props.dy = dy.clone();
        node.props.sx = sx.clone();
        node.props.sy = sy.clone();
    }
    pop_in(nodes, enter);
}

/// Eye sets of a mascot: open with a blink every few seconds, tired from `tired_at`.
fn animate_eyes(
    eyes: &mut [Vec<Node>; 3],
    enter: Option<f32>,
    tired_at: Option<f32>,
    duration: f32,
    phase: f32,
) {
    let from = enter.map(|at| at + 0.1);
    let end = tired_at.unwrap_or(duration + 5.0);
    let mut blinks = Vec::new();
    let mut t = from.unwrap_or(0.0) + 1.1 + phase;
    while t + 0.12 < end {
        blinks.push(t);
        t += 2.7;
    }
    for node in eyes[0].iter_mut() {
        show_between(node, from, tired_at);
        for blink in &blinks {
            node.props.opacity.key(*blink, 1.0, Easing::Linear);
            node.props.opacity.key(blink + 0.01, 0.0, Easing::Linear);
            node.props.opacity.key(blink + 0.12, 0.0, Easing::Linear);
            node.props.opacity.key(blink + 0.13, 1.0, Easing::Linear);
        }
    }
    for node in eyes[1].iter_mut() {
        node.props.opacity = Track::constant(0.0);
        for blink in &blinks {
            node.props.opacity.key(*blink, 0.0, Easing::Linear);
            node.props.opacity.key(blink + 0.01, 1.0, Easing::Linear);
            node.props.opacity.key(blink + 0.12, 1.0, Easing::Linear);
            node.props.opacity.key(blink + 0.13, 0.0, Easing::Linear);
        }
    }
    for node in eyes[2].iter_mut() {
        match tired_at {
            Some(at) => show_between(node, Some(at), None),
            None => node.props.opacity = Track::constant(0.0),
        }
    }
}

/// Value of the gauge after each hit; with no task, one change on the spoken number.
fn meter_states(scene: &StoryboardScene, meter: &Meter, hits: &[Hit]) -> Vec<(f32, f64)> {
    let mut states = vec![(0.0, meter.from)];
    if hits.is_empty() {
        if (meter.to - meter.from).abs() > 1e-6 {
            let shown = format_value(meter.to.round(), None);
            let at = word_time(&scene.timed_words(), &shown, 0.0)
                .unwrap_or(scene.duration_secs.max(1.0) * 0.45);
            states.push((at, meter.to));
        }
        return states;
    }
    let count = hits.len() as f64;
    for (index, hit) in hits.iter().enumerate() {
        let value = meter.from + (meter.to - meter.from) * (index as f64 + 1.0) / count;
        states.push((hit.hit, value));
    }
    states
}

fn meter_colour(value: f64) -> &'static str {
    if value > 50.0 {
        tokens::SUCCESS
    } else if value > 25.0 {
        tokens::WARNING
    } else {
        tokens::DANGER
    }
}

fn meter_text(meter: &Meter, value: f64) -> String {
    format_value(value.round(), meter.unit.as_deref())
}

/// Bar gauge: a card with the label, the value and a bar, below `top`.
fn meter_bar(
    ctx: &mut Ctx<'_>,
    meter: &Meter,
    states: &[(f32, f64)],
    rect: Rect,
    enter: Option<f32>,
) -> Vec<Node> {
    let canvas = ctx.canvas;
    let size = canvas.type_scale.small;
    let pad = canvas.gap * 0.6;
    let mut nodes = vec![Node::new(
        "meter",
        Shape::Rect {
            rect,
            rx: canvas.radius * 0.5,
            fill: tokens::SURFACE.into(),
            stroke: Some((tokens::RULE.into(), canvas.stroke * 0.4)),
        },
    )
    .decorative()];
    let baseline = rect.y + pad + size * 0.85;
    let value_width = if meter.numeric {
        states
            .iter()
            .map(|(_, value)| {
                ctx.ts.measure(
                    &meter_text(meter, *value),
                    size * 1.1,
                    tokens::WEIGHT_BOLD,
                    tokens::FONT_SANS,
                )
            })
            .fold(0.0f32, f32::max)
    } else {
        0.0
    };
    let label_area = Rect::new(
        rect.x + pad,
        rect.y + pad * 0.6,
        rect.w - pad * 3.0 - value_width,
        size * 1.3,
    );
    let (label, _) = ctx.fitted(
        "meter",
        &meter.label,
        label_area,
        size,
        size,
        tokens::WEIGHT_SEMIBOLD,
        tokens::INK_SOFT,
        Anchor::Start,
        0.5,
    );
    nodes.extend(label);
    let mut timed: Vec<Node> = Vec::new();
    if meter.numeric {
        for (index, (at, value)) in states.iter().enumerate() {
            let mut text = ctx.ts.line(
                "meter",
                &meter_text(meter, *value),
                rect.right() - pad,
                baseline,
                size * 1.1,
                tokens::WEIGHT_BOLD,
                tokens::FONT_SANS,
                meter_colour(*value),
                Anchor::End,
            );
            let from = if index == 0 { enter } else { Some(*at) };
            let to = states.get(index + 1).map(|(next, _)| *next);
            show_between(&mut text, from, to);
            timed.push(text);
        }
    }
    let bar = Rect::new(
        rect.x + pad,
        rect.bottom() - pad - size * 0.55,
        rect.w - pad * 2.0,
        size * 0.55,
    );
    nodes.push(
        Node::new(
            "meter",
            Shape::Rect {
                rect: bar,
                rx: bar.h / 2.0,
                fill: tokens::SURFACE_STRONG.into(),
                stroke: None,
            },
        )
        .decorative(),
    );
    // The card enters as one; the fills and values keep their own visibility windows and
    // only share the slide.
    slide_in(&mut nodes, enter, -canvas.gap * 0.6);
    let mut sx = Track::constant((meter.from / 100.0) as f32);
    if let Some(at) = enter {
        sx = Track::constant(0.0);
        sx.key(at, 0.0, Easing::Linear);
        sx.to(at + 0.15, 0.6, (meter.from / 100.0) as f32, Easing::EaseOut);
    }
    for (at, value) in states.iter().skip(1) {
        sx.to(*at, 0.35, (*value / 100.0) as f32, Easing::EaseOut);
    }
    for colour in [tokens::SUCCESS, tokens::WARNING, tokens::DANGER] {
        let mut fill = Node::new(
            "meter",
            Shape::Rect {
                rect: bar,
                rx: bar.h / 2.0,
                fill: colour.into(),
                stroke: None,
            },
        )
        .decorative()
        .with_origin((bar.x, bar.cy()));
        fill.props.sx = sx.clone();
        let initial = meter_colour(states[0].1) == colour;
        fill.props.opacity = Track::constant(if initial && enter.is_none() { 1.0 } else { 0.0 });
        if let Some(at) = enter {
            fill.props.opacity.key(at, 0.0, Easing::Linear);
            fill.props
                .opacity
                .key(at + 0.02, if initial { 1.0 } else { 0.0 }, Easing::Linear);
        }
        for (at, value) in states.iter().skip(1) {
            let shown = if meter_colour(*value) == colour {
                1.0
            } else {
                0.0
            };
            fill.props.opacity.to(*at, 0.15, shown, Easing::Linear);
        }
        timed.push(fill);
    }
    for node in timed.iter_mut() {
        if let Some(at) = enter {
            node.props
                .dy
                .key(at.min(0.0), -canvas.gap * 0.6, Easing::Linear);
            node.props.dy.to(at, 0.45, 0.0, Easing::EaseOut);
        }
    }
    nodes.extend(timed);
    nodes
}

/// Badge gauge: a dark pill "label value" centred under `anchor`.
fn meter_badge(
    ctx: &mut Ctx<'_>,
    meter: &Meter,
    states: &[(f32, f64)],
    centre_x: f32,
    top: f32,
    enter: Option<f32>,
) -> Vec<Node> {
    let size = ctx.canvas.type_scale.small;
    let texts: Vec<String> = states
        .iter()
        .map(|(_, value)| {
            if meter.numeric {
                format!("{} {}", meter.label, meter_text(meter, *value))
            } else {
                meter.label.clone()
            }
        })
        .collect();
    let width = texts
        .iter()
        .map(|text| {
            ctx.ts
                .measure(text, size, tokens::WEIGHT_BOLD, tokens::FONT_SANS)
        })
        .fold(0.0f32, f32::max)
        + size * 1.2;
    let pill = Rect::new(centre_x - width / 2.0, top, width, size * 1.5);
    let mut nodes = vec![Node::new(
        "meter",
        Shape::Rect {
            rect: pill,
            rx: size * 0.3,
            fill: tokens::INK.into(),
            stroke: None,
        },
    )
    .decorative()];
    pop_in(&mut nodes, enter);
    for (index, text) in texts.iter().enumerate() {
        if index > 0 && !meter.numeric {
            break;
        }
        let mut node = ctx.ts.line(
            "meter",
            text,
            centre_x,
            pill.y + pill.h * 0.5 + size * 0.36,
            size,
            tokens::WEIGHT_BOLD,
            tokens::FONT_SANS,
            tokens::BACKGROUND,
            Anchor::Middle,
        );
        let from = if index == 0 {
            enter
        } else {
            Some(states[index].0)
        };
        let to = if meter.numeric {
            states.get(index + 1).map(|(next, _)| *next)
        } else {
            None
        };
        show_between(&mut node, from, to);
        nodes.push(node);
    }
    nodes
}

fn coin_nodes(
    ctx: &mut Ctx<'_>,
    object: &str,
    label: &str,
    centre: (f32, f32),
    r: f32,
    colours: (&str, &str),
) -> Vec<Node> {
    let (edge, ink) = colours;
    let canvas = ctx.canvas;
    let mut nodes = vec![Node::new(
        object,
        Shape::Circle {
            cx: centre.0,
            cy: centre.1,
            r: r * 0.74,
            fill: "none".into(),
            stroke: Some((edge.into(), canvas.stroke * 0.8)),
        },
    )
    .decorative()
    .with_z(1)];
    let star = r * 0.12;
    let sy = centre.1 - r * 0.34;
    let mut d = String::new();
    for angle in [0.0f32, 60.0, 120.0] {
        let (sin, cos) = angle.to_radians().sin_cos();
        d.push_str(&format!(
            "M{:.1} {:.1} L{:.1} {:.1} ",
            centre.0 - cos * star,
            sy - sin * star,
            centre.0 + cos * star,
            sy + sin * star
        ));
    }
    nodes.push(
        Node::new(
            object,
            Shape::Path {
                d,
                stroke: edge.into(),
                width: canvas.stroke,
                length: star * 6.0,
                fill: None,
                dashed: false,
            },
        )
        .decorative()
        .with_z(1),
    );
    let area = Rect::new(centre.0 - r * 0.62, centre.1 - r * 0.18, r * 1.24, r * 0.5);
    let max = r * 0.36;
    let (size, lines) =
        ctx.fit_display(object, label, area.w, area.h, max, canvas.type_scale.small);
    let (family, weight) = ctx.display();
    let mut text = ctx.ts.block(
        object,
        &lines,
        centre.0,
        area.y,
        size,
        weight,
        family,
        ink,
        Anchor::Middle,
    );
    for node in text.iter_mut() {
        node.z = 1;
    }
    nodes.extend(text);
    nodes
}

/// Moves and scales a group of nodes as one around `origin`; the shrink rides on
/// `sx`/`sy` so an entrance pop (on `scale`) still applies.
fn group_motion(nodes: &mut [Node], origin: (f32, f32), dx: &Track, scale: &Track) {
    for node in nodes.iter_mut() {
        node.origin = origin;
        node.props.dx = dx.clone();
        node.props.sx = scale.clone();
        node.props.sy = scale.clone();
    }
}

fn eval_point(
    point: (f32, f32),
    origin: (f32, f32),
    dx: &Track,
    scale: &Track,
    t: f32,
) -> (f32, f32) {
    let s = scale.eval(t);
    (
        origin.0 + (point.0 - origin.0) * s + dx.eval(t),
        origin.1 + (point.1 - origin.1) * s,
    )
}

/// A task label: a small pill that appears, flies to `to` and dissolves into it.
fn task_label(
    ctx: &Ctx<'_>,
    index: usize,
    label: &str,
    from: (f32, f32),
    to: (f32, f32),
    hit: &Hit,
    tilt: f32,
) -> Vec<Node> {
    let canvas = ctx.canvas;
    let size = canvas.type_scale.small * 0.95;
    let object = format!("task:{index}");
    let width = ctx
        .ts
        .measure(label, size, tokens::WEIGHT_SEMIBOLD, tokens::FONT_SANS)
        + size;
    let rect = Rect::new(from.0 - width / 2.0, from.1 - size * 0.7, width, size * 1.4);
    let mut nodes = vec![
        Node::new(
            &object,
            Shape::Rect {
                rect,
                rx: size * 0.25,
                fill: tokens::SURFACE.into(),
                stroke: Some((tokens::INK.into(), canvas.stroke * 0.35)),
            },
        )
        .decorative()
        .with_z(40),
        ctx.ts
            .line(
                &object,
                label,
                from.0,
                rect.y + rect.h * 0.5 + size * 0.36,
                size,
                tokens::WEIGHT_SEMIBOLD,
                tokens::FONT_SANS,
                tokens::INK,
                Anchor::Middle,
            )
            .decorative()
            .with_z(41),
    ];
    let fly = hit.launch + TASK_HOLD;
    for node in nodes.iter_mut() {
        node.origin = from;
        let props = &mut node.props;
        props.opacity = Track::constant(0.0);
        props.opacity.key(hit.launch, 0.0, Easing::Linear);
        props.opacity.to(hit.launch, 0.12, 1.0, Easing::EaseOut);
        props.opacity.to(hit.hit - 0.12, 0.12, 0.0, Easing::EaseIn);
        props.scale = Track::constant(0.6);
        props.scale.key(hit.launch, 0.6, Easing::Linear);
        props.scale.to(hit.launch, 0.25, 1.0, Easing::Back);
        props.scale.to(fly, TASK_FLIGHT, 0.45, Easing::EaseIn);
        props.rotate = Track::constant(tilt);
        props.rotate.key(fly, tilt, Easing::Linear);
        props.rotate.to(fly, TASK_FLIGHT, 0.0, Easing::EaseIn);
        props.dx.key(fly, 0.0, Easing::Linear);
        props.dx.to(fly, TASK_FLIGHT, to.0 - from.0, Easing::EaseIn);
        props.dy.key(fly, 0.0, Easing::Linear);
        props.dy.to(fly, TASK_FLIGHT, to.1 - from.1, Easing::EaseIn);
    }
    nodes
}

/// Where the n-th task aimed at the prop lands, at time t.
type PropTarget = Box<dyn Fn(usize, f32) -> (f32, f32)>;

/// Lays out and animates a stage scene inside `area` (the whole content area).
pub fn build(
    ctx: &mut Ctx<'_>,
    area: Rect,
    scene: &StoryboardScene,
    stage: &StageContext,
) -> Vec<Node> {
    let Composition::Stage {
        headline: headline_text,
        actors,
        prop,
        meter,
        tasks,
        stamp,
    } = &scene.composition
    else {
        return Vec::new();
    };
    let canvas = ctx.canvas;
    let gap = canvas.gap;
    let duration = scene.duration_secs.max(1.0);
    let block = |at: f32| entrance(stage, true, at);
    let mut nodes = Vec::new();
    let mut top = area.y;
    if stage.chapters > 1 {
        let y = top + canvas.stroke * 4.0;
        nodes.extend(track(ctx, stage, y, area));
        top = y + canvas.stroke * 4.0 + gap * 0.5;
    }
    let (mut head, bottom) = headline(ctx, headline_text, top, area);
    slide_in(&mut head, block(0.0), -gap);
    nodes.extend(head);
    top = bottom + gap * 0.6;
    let hits = schedule(scene, tasks, actors);
    let states = meter
        .as_ref()
        .map(|meter| meter_states(scene, meter, &hits));
    if let (Some(meter), Some(states)) = (meter, &states) {
        if meter.style == MeterStyle::Bar {
            let size = canvas.type_scale.small;
            let height = gap * 1.2 + size * 1.3 + size * 0.55 + gap * 0.4;
            let width = area.w * if canvas.vertical { 0.7 } else { 0.42 };
            let rect = Rect::new(area.cx() - width / 2.0, top, width, height);
            nodes.extend(meter_bar(ctx, meter, states, rect, block(0.15)));
            top = rect.bottom() + gap * 0.6;
        }
    }
    let zone = Rect::new(area.x, top, area.w, area.bottom() - top);
    // Cast placement depends on the metaphor: next to a coin, under a funnel, in front of
    // a wall, beside a card, or centre stage alone.
    let (above, below_px) = mascot_extent(ctx);
    let cast_size =
        |share_w: f32, share_h: f32| (zone.w * share_w).min((zone.h - below_px) * share_h / above);
    let feet = zone.bottom() - below_px;
    let spots: Vec<Spot> = match (prop, actors.len()) {
        (_, 0) => Vec::new(),
        (None, 1) => {
            let size = cast_size(0.36, 0.95);
            vec![Spot {
                x: zone.cx(),
                feet,
                size,
            }]
        }
        (None, _) => {
            let size = cast_size(0.28, 0.9);
            vec![
                Spot {
                    x: zone.x + zone.w * 0.27,
                    feet,
                    size,
                },
                Spot {
                    x: zone.x + zone.w * 0.73,
                    feet,
                    size,
                },
            ]
        }
        (Some(Prop::Coin { .. }), count) => {
            let size = cast_size(0.2, 0.55);
            (0..count)
                .map(|index| Spot {
                    x: zone.right() - size * 0.75 - index as f32 * size * 1.5,
                    feet,
                    size,
                })
                .collect()
        }
        (Some(Prop::Funnel { .. }), 1) => {
            let size = cast_size(0.26, 0.58);
            vec![Spot {
                x: zone.cx(),
                feet,
                size,
            }]
        }
        (Some(Prop::Funnel { .. }), _) => {
            let size = cast_size(0.24, 0.58);
            vec![
                Spot {
                    x: zone.x + zone.w * 0.2,
                    feet,
                    size,
                },
                Spot {
                    x: zone.x + zone.w * 0.8,
                    feet,
                    size,
                },
            ]
        }
        (Some(Prop::Wall), count) => {
            let size = cast_size(0.26, 0.62);
            (0..count)
                .map(|index| Spot {
                    x: zone.x + zone.w * (0.3 - 0.18 * index as f32).max(0.12),
                    feet,
                    size,
                })
                .collect()
        }
        (Some(Prop::Table { .. }), count) => {
            // The card spans the top; the cast stands under it, larger.
            let size = cast_size(0.26, 0.6);
            (0..count)
                .map(|index| Spot {
                    x: zone.x + zone.w * (0.3 + 0.4 * index as f32),
                    feet,
                    size,
                })
                .collect()
        }
        (Some(Prop::Envelope { .. }), count) => {
            let size = cast_size(0.2, 0.5);
            (0..count)
                .map(|index| Spot {
                    x: zone.x + size * 0.75 + index as f32 * size * 1.5,
                    feet,
                    size,
                })
                .collect()
        }
    };
    let cast_top = spots
        .iter()
        .map(|spot| spot.feet - spot.size * above)
        .fold(zone.bottom(), f32::min);
    // Where tasks land on the prop, and what each landing changes.
    let mut prop_target: Option<PropTarget> = None;
    let prop_enter = entrance(stage, stage.continues, 0.25);
    let prop_hit_times: Vec<f32> = hits
        .iter()
        .filter(|hit| hit.target == "prop")
        .map(|hit| hit.hit)
        .collect();
    let mut funnel_mouth: Option<(f32, f32)> = None;
    let mut tired_at: Option<f32> = None;
    if let (Some(meter), Some(states)) = (meter, &states) {
        if meter.style == MeterStyle::Bar {
            tired_at = states
                .iter()
                .find(|(_, value)| *value <= 25.0)
                .map(|(at, _)| at.max(0.0));
        }
    }
    match prop {
        Some(Prop::Coin { label, rival }) => {
            let badge_h = canvas.type_scale.small * 1.5 + gap * 0.5;
            let right_edge = spots
                .iter()
                .map(|spot| spot.x - spot.size * 0.7)
                .fold(zone.right(), f32::min);
            let r = ((right_edge - zone.x) * 0.48)
                .min((zone.h - badge_h) * 0.47)
                .max(gap * 2.0);
            let centre = (zone.x + (right_edge - zone.x) * 0.5, zone.y + r + gap * 0.2);
            let mut coin_group = Vec::new();
            let bites_before = stage.hits_before;
            let total = bites_before + prop_hit_times.len();
            for bites in bites_before..=total.min(bites_before + MAX_BITES) {
                let mut state = fill_path(
                    "prop",
                    bitten_coin_d(centre.0, centre.1, r, bites),
                    COIN,
                    Some((COIN_EDGE, canvas.stroke)),
                );
                let index = bites - bites_before;
                let from = if index == 0 {
                    None
                } else {
                    Some(prop_hit_times[index - 1])
                };
                let to = if bites < total.min(bites_before + MAX_BITES) {
                    prop_hit_times.get(index).copied()
                } else {
                    None
                };
                show_between(&mut state, from, to);
                coin_group.push(state);
            }
            coin_group.extend(coin_nodes(
                ctx,
                "prop",
                label,
                centre,
                r,
                (COIN_EDGE, COIN_INK),
            ));
            let mut badge = Vec::new();
            if let (Some(meter), Some(states)) = (meter, &states) {
                if meter.style == MeterStyle::Badge {
                    badge = meter_badge(
                        ctx,
                        meter,
                        states,
                        centre.0,
                        centre.1 + r + gap * 0.4,
                        block(0.2),
                    );
                }
            }
            if let Some(enter) = prop_enter {
                for node in coin_group.iter_mut() {
                    // Bitten states keep their own visibility windows.
                    let opacity = node.props.opacity.clone();
                    node.props.pop(enter, 0.5, Easing::Back);
                    if !opacity.is_constant() {
                        node.props.opacity = opacity;
                    }
                }
            }
            let mut dx = Track::constant(0.0);
            let mut scale = Track::constant(1.0);
            if let Some(rival) = rival {
                let at = label_time(&scene.timed_words(), rival, 0.0).unwrap_or(duration * 0.6);
                let shift = -(centre.0 - (zone.x + (right_edge - zone.x) * 0.3));
                dx.key(at, 0.0, Easing::Linear);
                dx.to(at, 0.5, shift, Easing::EaseInOut);
                scale.key(at, 1.0, Easing::Linear);
                scale.to(at, 0.5, 0.62, Easing::EaseInOut);
                let rival_r = r * 0.55;
                let rival_centre = (zone.x + (right_edge - zone.x) * 0.78, centre.1 - r * 0.25);
                let mut rival_nodes = vec![fill_path(
                    "rival",
                    ellipse_d(rival_centre.0, rival_centre.1, rival_r, rival_r),
                    RIVAL,
                    Some((RIVAL_EDGE, canvas.stroke)),
                )];
                rival_nodes.extend(coin_nodes(
                    ctx,
                    "rival",
                    rival,
                    rival_centre,
                    rival_r,
                    (RIVAL_EDGE, RIVAL_INK),
                ));
                for node in rival_nodes.iter_mut() {
                    node.origin = rival_centre;
                    node.props.pop(at + 0.2, 0.5, Easing::Back);
                }
                nodes.extend(rival_nodes);
            }
            group_motion(&mut coin_group, centre, &dx, &scale);
            group_motion(&mut badge, centre, &dx, &scale);
            nodes.extend(coin_group);
            nodes.extend(badge);
            let first_bite = bites_before;
            let (dx_t, scale_t) = (dx.clone(), scale.clone());
            prop_target = Some(Box::new(move |index: usize, t: f32| {
                let angle =
                    (-60.0f32 + 44.0 * (first_bite + index).min(MAX_BITES - 1) as f32).to_radians();
                let rim = (centre.0 + r * angle.cos(), centre.1 + r * angle.sin());
                eval_point(rim, centre, &dx_t, &scale_t, t)
            }));
        }
        Some(Prop::Funnel { label, note }) => {
            let height = (cast_top - zone.y - gap - size_note(ctx)).max(gap * 3.0);
            let top_w = zone.w * if canvas.vertical { 0.42 } else { 0.24 };
            let spout_w = top_w * 0.26;
            let cx = zone.cx();
            let neck = zone.y + height * 0.55;
            let d = format!(
                "M{:.1} {:.1} L{:.1} {:.1} L{:.1} {neck:.1} L{:.1} {:.1} L{:.1} {:.1} L{:.1} {neck:.1} Z",
                cx - top_w / 2.0,
                zone.y,
                cx + top_w / 2.0,
                zone.y,
                cx + spout_w / 2.0,
                cx + spout_w / 2.0,
                zone.y + height * 0.68,
                cx - spout_w / 2.0,
                zone.y + height * 0.68,
                cx - spout_w / 2.0,
            );
            let mut funnel = vec![fill_path(
                "prop",
                d,
                FUNNEL,
                Some((FUNNEL_EDGE, canvas.stroke * 0.8)),
            )];
            funnel.push(fill_path(
                "prop",
                ellipse_d(cx, zone.y, top_w / 2.0, top_w * 0.07),
                FUNNEL_EDGE,
                None,
            ));
            let size = canvas.type_scale.small;
            let label_text = label.to_uppercase();
            let label_w = ctx
                .ts
                .measure(&label_text, size, tokens::WEIGHT_BOLD, tokens::FONT_SANS)
                + size;
            // The label sits on the spout's mouth; the note hangs under it, clear of it.
            let pill_h = size * 1.45;
            let pill = Rect::new(
                cx - label_w / 2.0,
                zone.y + height * 0.68 - pill_h * 0.5,
                label_w,
                pill_h,
            );
            funnel.push(
                Node::new(
                    "prop",
                    Shape::Rect {
                        rect: pill,
                        rx: size * 0.25,
                        fill: tokens::INK.into(),
                        stroke: None,
                    },
                )
                .decorative()
                .with_z(1),
            );
            let mut label_node = ctx.ts.line(
                "prop",
                &label_text,
                cx,
                pill.y + pill.h * 0.5 + size * 0.36,
                size,
                tokens::WEIGHT_BOLD,
                tokens::FONT_SANS,
                tokens::SURFACE,
                Anchor::Middle,
            );
            label_node.z = 2;
            funnel.push(label_node);
            let mut mouth_y = pill.bottom() + gap * 0.2;
            if let Some(note) = note {
                let note_area = Rect::new(
                    cx - top_w * 0.6,
                    pill.bottom() + gap * 0.15,
                    top_w * 1.2,
                    size * 1.25,
                );
                let (note_nodes, note_bottom) = ctx.fitted(
                    "prop",
                    note,
                    note_area,
                    size,
                    size,
                    tokens::WEIGHT_REGULAR,
                    tokens::MUTED,
                    Anchor::Middle,
                    0.0,
                );
                funnel.extend(note_nodes);
                mouth_y = note_bottom + gap * 0.2;
            }
            pop_in(&mut funnel, prop_enter);
            for node in funnel.iter_mut() {
                node.origin = (cx, zone.y + height * 0.4);
            }
            for at in &prop_hit_times {
                for node in funnel.iter_mut() {
                    node.props.pulse(*at, 0.3);
                }
            }
            nodes.extend(funnel);
            funnel_mouth = Some((cx, mouth_y));
            let mouth = (cx, zone.y + height * 0.35);
            prop_target = Some(Box::new(move |_, _| mouth));
        }
        Some(Prop::Wall) => {
            let right = zone.right();
            let width = zone.w * 0.38;
            let left = right - width;
            let brick_w = width / 3.0;
            let brick_h = (zone.h / 6.0).min(brick_w * 0.55);
            let actor_hits: Vec<f32> = hits.iter().map(|hit| hit.hit).collect();
            let shown_before = stage.hits_before.min(MAX_BRICKS);
            for index in 0..(stage.hits_before + actor_hits.len()).min(MAX_BRICKS) {
                let row = index / 3;
                let col = index % 3;
                let rect = Rect::new(
                    left + col as f32 * brick_w + 2.0,
                    zone.bottom() - (row + 1) as f32 * brick_h + 2.0,
                    brick_w - 4.0,
                    brick_h - 4.0,
                );
                let mut brick = fill_path(
                    "prop",
                    rounded_d(rect, 4.0),
                    BRICK,
                    Some((BRICK_EDGE, canvas.stroke * 0.6)),
                )
                .with_origin((rect.cx(), rect.bottom()));
                if index >= shown_before {
                    let at = actor_hits[index - stage.hits_before] + 0.15;
                    brick
                        .props
                        .reveal(at, 0.3, (0.0, -brick_h * 1.5), Easing::Back);
                } else if let Some(at) = prop_enter {
                    brick.props.pop(at, 0.4, Easing::Back);
                }
                nodes.push(brick);
            }
        }
        Some(Prop::Table { title, rows, mark }) => {
            let width = zone.w * if canvas.vertical { 0.86 } else { 0.5 };
            let x = zone.cx() - width / 2.0;
            let size = canvas.type_scale.label;
            let small = canvas.type_scale.small;
            let row_h = size * 1.9;
            let height = gap * 1.0 + small * 1.4 + row_h * rows.len() as f32 + gap * 0.6;
            let rect = Rect::new(x, zone.y + gap * 0.2, width, height);
            let mut card = vec![Node::new(
                "prop",
                Shape::Rect {
                    rect,
                    rx: canvas.radius * 0.5,
                    fill: tokens::SURFACE.into(),
                    stroke: Some((tokens::RULE.into(), canvas.stroke * 0.4)),
                },
            )
            .decorative()];
            let pad = gap * 0.8;
            let (title_nodes, title_bottom) = ctx.fitted(
                "prop",
                title,
                Rect::new(
                    rect.x + pad,
                    rect.y + gap * 0.6,
                    rect.w - pad * 2.0,
                    small * 1.4,
                ),
                small,
                small,
                tokens::WEIGHT_BOLD,
                tokens::INK,
                Anchor::Start,
                0.5,
            );
            card.extend(title_nodes);
            let mut marked: Option<(Rect, String)> = None;
            for (index, row) in rows.iter().enumerate() {
                let baseline = title_bottom + gap * 0.3 + row_h * index as f32 + row_h * 0.62;
                let object = format!("row:{index}");
                card.push(ctx.ts.line(
                    &object,
                    &row.label,
                    rect.x + pad,
                    baseline,
                    size,
                    tokens::WEIGHT_SEMIBOLD,
                    tokens::FONT_SANS,
                    tokens::INK_SOFT,
                    Anchor::Start,
                ));
                let value = ctx.ts.line(
                    &object,
                    &row.value,
                    rect.right() - pad,
                    baseline,
                    size,
                    tokens::WEIGHT_BOLD,
                    tokens::FONT_SANS,
                    tokens::INK,
                    Anchor::End,
                );
                if *mark == Some(index) {
                    marked = Some((value.bbox(), row.value.clone()));
                }
                card.push(value);
            }
            slide_in(&mut card, prop_enter, gap);
            nodes.extend(card);
            if let Some((bbox, value)) = marked {
                let at = narration_words(&value)
                    .iter()
                    .find(|token| token.chars().any(|c| c.is_ascii_digit()))
                    .and_then(|token| word_time(&scene.timed_words(), token, 0.0))
                    .unwrap_or(duration * 0.5);
                let mut ring = Node::new(
                    "mark",
                    Shape::Path {
                        d: ellipse_d(
                            bbox.cx(),
                            bbox.cy(),
                            bbox.w * 0.62 + gap * 0.3,
                            bbox.h * 0.85,
                        ),
                        stroke: MARK.into(),
                        width: canvas.stroke * 1.1,
                        length: (bbox.w + bbox.h) * 2.4,
                        fill: None,
                        dashed: false,
                    },
                )
                .decorative()
                .with_z(5);
                ring.props.draw(at, 0.45, Easing::EaseOut);
                nodes.push(ring);
            }
            let centre = (rect.cx(), rect.cy());
            prop_target = Some(Box::new(move |_, _| centre));
        }
        Some(Prop::Envelope { comment }) => {
            let size = canvas.type_scale.small;
            let box_h = size * 2.1;
            let cast_left = spots
                .iter()
                .map(|spot| spot.x + spot.size * 0.75)
                .fold(zone.x, f32::max);
            let env_h = (zone.h - box_h - gap * 2.0 - below_px).min(zone.h * 0.45);
            let env_w = env_h * 1.45;
            let env = Rect::new(zone.cx() - env_w / 2.0, zone.y + gap * 0.3, env_w, env_h);
            let mut envelope = vec![
                fill_path(
                    "prop",
                    rounded_d(env, canvas.radius * 0.3),
                    "#F6F1E7",
                    Some(("#BDB4A3", canvas.stroke * 0.6)),
                ),
                Node::new(
                    "prop",
                    Shape::Path {
                        d: format!(
                            "M{:.1} {:.1} L{:.1} {:.1} L{:.1} {:.1}",
                            env.x + 6.0,
                            env.y + 6.0,
                            env.cx(),
                            env.y + env.h * 0.55,
                            env.right() - 6.0,
                            env.y + 6.0
                        ),
                        stroke: "#BDB4A3".into(),
                        width: canvas.stroke * 0.8,
                        length: env.w * 1.3,
                        fill: None,
                        dashed: false,
                    },
                )
                .decorative(),
                fill_path(
                    "prop",
                    rounded_d(
                        Rect::new(
                            env.cx() + env.w * 0.08,
                            env.cy() - env.h * 0.02,
                            env.w * 0.18,
                            env.h * 0.26,
                        ),
                        4.0,
                    ),
                    BODY,
                    None,
                ),
            ];
            pop_in(&mut envelope, prop_enter);
            nodes.extend(envelope);
            let badge_at = duration * 0.3;
            let badge_r = env.h * 0.14;
            let mut badge = vec![Node::new(
                "badge",
                Shape::Circle {
                    cx: env.right() - badge_r * 0.3,
                    cy: env.y + badge_r * 0.3,
                    r: badge_r,
                    fill: MARK.into(),
                    stroke: Some(("#FFFFFF".into(), canvas.stroke * 0.8)),
                },
            )
            .decorative()
            .with_z(3)];
            badge.push(
                ctx.ts
                    .line(
                        "badge",
                        "1",
                        env.right() - badge_r * 0.3,
                        env.y + badge_r * 0.3 + badge_r * 0.38,
                        badge_r * 1.1,
                        tokens::WEIGHT_BOLD,
                        tokens::FONT_SANS,
                        "#FFFFFF",
                        Anchor::Middle,
                    )
                    .decorative()
                    .with_z(4),
            );
            for node in badge.iter_mut() {
                node.origin = (env.right() - badge_r * 0.3, env.y + badge_r * 0.3);
                node.props.pop(badge_at, 0.4, Easing::Back);
            }
            nodes.extend(badge);
            let field = Rect::new(
                cast_left + gap * 0.3,
                env.bottom() + gap,
                zone.right() - cast_left - gap * 0.3,
                box_h,
            );
            let mut field_nodes = vec![Node::new(
                "comment",
                Shape::Rect {
                    rect: field,
                    rx: field.h / 2.0,
                    fill: tokens::SURFACE.into(),
                    stroke: Some((tokens::RULE.into(), canvas.stroke * 0.5)),
                },
            )
            .decorative()];
            let text_x = field.x + size * 0.9;
            let baseline = field.cy() + size * 0.36;
            let typing = duration * 0.45;
            let mut placeholder = ctx.ts.line(
                "comment",
                "Adicione um comentário…",
                text_x,
                baseline,
                size,
                tokens::WEIGHT_REGULAR,
                tokens::FONT_SANS,
                tokens::MUTED,
                Anchor::Start,
            );
            show_between(&mut placeholder, prop_enter, Some(typing));
            let mut typed = ctx.ts.line(
                "comment",
                &comment.to_uppercase(),
                text_x,
                baseline,
                size,
                tokens::WEIGHT_BOLD,
                tokens::FONT_SANS,
                tokens::INK,
                Anchor::Start,
            );
            let characters = comment.chars().count();
            typed.props.type_in(
                typing,
                (0.09 * characters as f32).min(duration * 0.35),
                characters,
            );
            let send = Node::new(
                "comment",
                Shape::Circle {
                    cx: field.right() - field.h * 0.5,
                    cy: field.cy(),
                    r: field.h * 0.3,
                    fill: tokens::ACCENT.into(),
                    stroke: None,
                },
            )
            .decorative();
            field_nodes.push(send);
            slide_in(&mut field_nodes, prop_enter, gap);
            if field.right() > canvas.content.right() + 1.0 {
                ctx.issue(
                    super::Severity::Critical,
                    "outside_safe_area",
                    "campo de comentario do palco sai da area".into(),
                );
            }
            nodes.extend(field_nodes);
            nodes.push(placeholder);
            nodes.push(typed);
        }
        None => {}
    }
    // The cast.
    let actor_hits = |id: &str| -> Vec<f32> {
        hits.iter()
            .filter(|hit| hit.target == id)
            .map(|hit| hit.hit)
            .collect()
    };
    let mut chests = Vec::new();
    for (index, (actor, spot)) in actors.iter().zip(spots.iter()).enumerate() {
        let carried = stage.carried_actors.contains(&actor.id);
        let enter = entrance(stage, carried, 0.35 + 0.12 * index as f32);
        let (mut body, mut eyes) = mascot(ctx, actor, *spot);
        let own_hits = actor_hits(&actor.id);
        animate_mascot(&mut body, *spot, enter, &own_hits, duration);
        for set in eyes.iter_mut() {
            animate_mascot(set, *spot, None, &own_hits, duration);
            if let Some(at) = enter {
                for node in set.iter_mut() {
                    node.props.scale.key(at.min(0.0), 0.6, Easing::Linear);
                    node.props.scale.to(at, 0.45, 1.0, Easing::Back);
                }
            }
        }
        animate_eyes(&mut eyes, enter, tired_at, duration, index as f32 * 0.9);
        nodes.extend(body);
        for set in eyes {
            nodes.extend(set);
        }
        chests.push((actor.id.clone(), spot.chest()));
    }
    // The tasks.
    let mut prop_index = 0usize;
    for (index, (task, hit)) in tasks.iter().zip(hits.iter()).enumerate() {
        let to = if hit.target == "prop" {
            let point = prop_target
                .as_ref()
                .map_or((zone.cx(), zone.cy()), |target| target(prop_index, hit.hit));
            prop_index += 1;
            point
        } else {
            chests
                .iter()
                .find(|(id, _)| *id == hit.target)
                .map_or((zone.cx(), zone.cy()), |(_, chest)| *chest)
        };
        let side = if index % 2 == 0 { -1.0 } else { 1.0 };
        let from = match funnel_mouth {
            Some(mouth) => (mouth.0, mouth.1 + canvas.type_scale.small),
            None => {
                let x = if side < 0.0 {
                    zone.x + zone.w * 0.2
                } else {
                    zone.right() - zone.w * 0.2
                };
                (
                    x,
                    zone.y + zone.h * 0.12 + (index / 2) as f32 * canvas.type_scale.small * 1.6,
                )
            }
        };
        nodes.extend(task_label(
            ctx,
            index,
            &task.label,
            from,
            to,
            hit,
            side * 6.0,
        ));
    }
    // The sticker.
    if let Some(stamp) = stamp {
        let size = canvas.type_scale.label;
        let text = stamp.to_uppercase();
        let width = ctx
            .ts
            .measure(&text, size, tokens::WEIGHT_BOLD, tokens::FONT_SANS)
            + size * 1.0;
        let height = size * 1.5;
        let x = (zone.right() - width - gap * 0.2).max(zone.x);
        let y = (cast_top - height - gap * 0.8).max(zone.y + zone.h * 0.35);
        let rect = Rect::new(x, y, width, height);
        let at = narration_words(stamp)
            .iter()
            .find_map(|token| word_time(&scene.timed_words(), token, 0.0))
            .unwrap_or(duration * 0.55);
        let mut sticker = vec![
            Node::new(
                "stamp",
                Shape::Rect {
                    rect,
                    rx: 6.0,
                    fill: tokens::SUCCESS.into(),
                    stroke: Some((tokens::SURFACE.into(), canvas.stroke * 0.8)),
                },
            )
            .decorative()
            .with_z(30),
            ctx.ts
                .line(
                    "stamp",
                    &text,
                    rect.cx(),
                    rect.cy() + size * 0.36,
                    size,
                    tokens::WEIGHT_BOLD,
                    tokens::FONT_SANS,
                    tokens::SURFACE,
                    Anchor::Middle,
                )
                .with_z(31),
        ];
        for node in sticker.iter_mut() {
            node.origin = (rect.cx(), rect.cy());
            node.props.pop(at, 0.4, Easing::Back);
            node.props.rotate = Track::constant(-12.0);
            node.props.rotate.key(at, -12.0, Easing::Linear);
            node.props.rotate.to(at, 0.4, -5.0, Easing::Back);
        }
        nodes.extend(sticker);
    }
    nodes
}

/// Room the funnel leaves under its spout for the label and the note.
fn size_note(ctx: &Ctx<'_>) -> f32 {
    ctx.canvas.type_scale.small * 1.6
}

#[cfg(test)]
mod tests {
    use super::*;
    use framechester_core::storyboard::{NarrationSegment, Task};

    #[test]
    fn a_coin_loses_one_bite_per_hit_and_closes_its_outline() {
        let whole = bitten_coin_d(100.0, 100.0, 50.0, 0);
        assert_eq!(whole.matches(" A").count(), 2);
        for bites in 1..=MAX_BITES {
            let d = bitten_coin_d(100.0, 100.0, 50.0, bites);
            // One bite arc per bite, one rim arc between bites and one back to the start.
            assert_eq!(d.matches(" A10.0 10.0").count(), bites, "{d}");
            assert!(d.ends_with('Z'));
        }
        assert_eq!(
            bitten_coin_d(100.0, 100.0, 50.0, 20),
            bitten_coin_d(100.0, 100.0, 50.0, MAX_BITES)
        );
    }

    fn timed(text: &str, words: &[(&str, f32)]) -> StoryboardScene {
        let mut scene: StoryboardScene = serde_json::from_value(serde_json::json!({
            "id": 1,
            "concept": "x",
            "learning_goal": "x",
            "narration": text,
            "composition": { "kind": "stage", "headline": "x", "actors": [{ "id": "opus", "name": "Opus" }] },
        }))
        .unwrap();
        scene.duration_secs = 6.0;
        scene.segments = vec![NarrationSegment {
            text: text.into(),
            start_secs: 0.0,
            end_secs: 6.0,
            words: words
                .iter()
                .map(|(word, at)| TimedWord {
                    text: (*word).into(),
                    start_secs: *at,
                    end_secs: at + 0.2,
                })
                .collect(),
            aligned: false,
        }];
        scene
    }

    #[test]
    fn tasks_fly_on_their_word_in_order_and_land_before_the_end() {
        let scene = timed(
            "listar pastas e ler logs",
            &[
                ("listar", 1.0),
                ("pastas", 1.2),
                ("e", 1.5),
                ("ler", 3.0),
                ("logs", 3.2),
            ],
        );
        let actors = vec![Actor {
            id: "opus".into(),
            name: "Opus".into(),
            hat: Hat::HardHat,
            role: Default::default(),
        }];
        let task = |label: &str| Task {
            label: label.into(),
            to: None,
            at: None,
        };
        let hits = schedule(
            &scene,
            &[task("listar pasta"), task("ler log"), task("sem palavra")],
            &actors,
        );
        assert_eq!(hits[0].launch, 1.0);
        assert_eq!(hits[1].launch, 3.0);
        assert!(hits.iter().all(|hit| hit.target == "opus"));
        assert!(hits
            .windows(2)
            .all(|pair| pair[1].launch >= pair[0].launch + 0.45));
        assert!(hits.iter().all(|hit| hit.hit <= 6.0));
    }

    #[test]
    fn the_context_carries_cast_and_bites_inside_a_block_only() {
        let stage = |headline: &str, tasks: usize| -> StoryboardScene {
            serde_json::from_value(serde_json::json!({
                "id": 1,
                "concept": "x",
                "learning_goal": "x",
                "narration": "x",
                "composition": {
                    "kind": "stage",
                    "headline": headline,
                    "actors": [{ "id": "opus", "name": "Opus" }],
                    "prop": { "kind": "coin", "label": "Opus" },
                    "tasks": (0..tasks).map(|_| serde_json::json!({ "label": "x", "to": "prop" })).collect::<Vec<_>>(),
                },
            }))
            .unwrap()
        };
        let scenes = vec![stage("A *b*", 2), stage("A b", 3), stage("C", 1)];
        let contexts = contexts(&scenes);
        let [Some(first), Some(second), Some(third)] = &contexts[..] else {
            panic!("{contexts:?}");
        };
        assert_eq!(
            (first.chapters, first.chapter, first.continues),
            (2, 0, false)
        );
        assert!(first.hook);
        assert_eq!(
            (second.chapter, second.continues, second.hits_before),
            (0, true, 2)
        );
        assert_eq!(second.carried_actors, vec!["opus".to_string()]);
        assert_eq!(
            (third.chapter, third.continues, third.hits_before),
            (1, false, 0)
        );
        assert!(third.carried_actors.is_empty());
    }
}
