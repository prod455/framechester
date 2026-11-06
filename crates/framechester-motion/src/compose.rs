//! From storyboard to scene graphs: lays out each scene's composition for the canvas,
//! applies the storyboard animations at their resolved times, auto-animates edges, adds
//! captions and records layout issues for QA.
use crate::anim::Track;
use crate::captions;
use crate::components::stage::StageContext;
use crate::components::{self, edge_id, Ctx, LayoutIssue, Severity};
use crate::format::{Canvas, Rect};
use crate::scene::{Anchor, Camera, Graph, Node, Shape, Z_CAPTIONS};
use crate::text::Typesetter;
use crate::tokens;
use framechester_core::error::Result;
use framechester_core::narration::{
    assemble_scene, paragraph_breaks, segment_narration, SegmentAudio,
};
use framechester_core::storyboard::{
    Animation, Composition, Easing, Motion, Storyboard, StoryboardScene, Transition,
};
use std::collections::HashMap;

#[derive(Debug, Clone)]
pub struct ComposedScene {
    pub id: u32,
    pub start_secs: f32,
    pub duration_secs: f32,
    pub transition: Transition,
    pub graph: Graph,
    pub issues: Vec<LayoutIssue>,
    /// Times (relative to the scene) at which something visibly changes.
    pub change_times: Vec<f32>,
    /// Objects the storyboard animates, in order of first appearance.
    pub animated_objects: Vec<String>,
    /// What the viewer's eye is on when the scene ends: the cause of the transition out.
    pub focal: Option<Focal>,
    /// The first card (or object) to enter: where a `morph` into this scene lands.
    pub opening: Option<Focal>,
    /// Named objects a viewer can follow into the next scene (a `flood` hero).
    pub followable: Vec<String>,
}

/// The last object to enter a scene, where a caused transition starts from.
#[derive(Debug, Clone, PartialEq)]
pub struct Focal {
    /// Its box at rest, in frame coordinates.
    pub rect: Rect,
    /// Its card's paint when it is a card (the colour an `expand` floods with).
    pub paint: Option<String>,
}

/// A focal object of a composed scene, preferring cards: the latest entry with a box
/// (`latest`, where the eye is at the end) or the earliest (where the scene opens).
fn focal_of(graph: &Graph, entries: &HashMap<String, f32>, latest: bool) -> Option<Focal> {
    let mut ordered: Vec<(&String, &f32)> = entries.iter().collect();
    ordered.sort_by(|a, b| {
        let order = b.1.partial_cmp(a.1).unwrap_or(std::cmp::Ordering::Equal);
        // Ties (several entries on one cue) keep a stable, name-based order.
        let order = order.then_with(|| a.0.cmp(b.0));
        if latest {
            order
        } else {
            order.reverse()
        }
    });
    let card_paint = |object: &str| {
        graph
            .nodes
            .iter()
            .filter(|node| node.object == object && node.z < Z_CAPTIONS)
            .find_map(|node| match &node.shape {
                Shape::Rect { fill, .. } => tokens::card_role_name(fill)
                    .map(|role| (node.bbox(), format!("@fill-top-{role}"))),
                _ => None,
            })
    };
    if let Some((object, _)) = ordered
        .iter()
        .find(|(object, _)| card_paint(object).is_some())
    {
        let (rect, paint) = card_paint(object)?;
        return Some(Focal {
            rect,
            paint: Some(paint),
        });
    }
    ordered.iter().find_map(|(object, _)| {
        graph
            .object_bbox(object)
            .map(|rect| Focal { rect, paint: None })
    })
}

#[derive(Debug, Clone)]
pub struct Composed {
    pub canvas: Canvas,
    pub scenes: Vec<ComposedScene>,
}

impl Composed {
    pub fn total_duration_secs(&self) -> f32 {
        self.scenes.iter().map(|scene| scene.duration_secs).sum()
    }

    pub fn issues(&self) -> Vec<&LayoutIssue> {
        self.scenes
            .iter()
            .flat_map(|scene| scene.issues.iter())
            .collect()
    }
}

/// Duration of scene transitions, in seconds.
pub const TRANSITION_SECS: f32 = 0.42;

/// How long the seam into a scene lasts. Caused transitions take the durations measured
/// on reference films: an object growing into the world 0.65 s, an iris 0.45 s, a blur
/// swap 0.18 s out plus 0.18 s in, a dip three frames.
pub fn transition_secs(transition: Transition) -> f32 {
    match transition {
        Transition::Expand => 0.65,
        Transition::Iris => 0.45,
        Transition::BlurSwap => 0.36,
        Transition::DipCut => 0.1,
        Transition::Morph => 0.5,
        Transition::Flood => 0.6,
        _ => TRANSITION_SECS,
    }
}

/// Union of the boxes of an object's text nodes (its label lines), outside captions.
fn text_bbox(graph: &Graph, object: &str) -> Option<Rect> {
    graph
        .nodes
        .iter()
        .filter(|node| node.object == object && node.is_text() && node.z < Z_CAPTIONS)
        .map(Node::bbox)
        .reduce(|a, b| {
            let (x, y) = (a.x.min(b.x), a.y.min(b.y));
            Rect::new(
                x,
                y,
                a.right().max(b.right()) - x,
                a.bottom().max(b.bottom()) - y,
            )
        })
}

/// `a` mixed towards `b` by `t` (both `#RRGGBB`), for a colour that travels with a shape.
fn mix_hex(a: &str, b: &str, t: f32) -> String {
    let channel =
        |hex: &str, at: usize| u8::from_str_radix(&hex[1 + at..3 + at], 16).map_or(0.0, f32::from);
    let mixed: Vec<String> = [0, 2, 4]
        .into_iter()
        .map(|at| {
            let value = channel(a, at) + (channel(b, at) - channel(a, at)) * t.clamp(0.0, 1.0);
            format!("{:02X}", value.round() as u8)
        })
        .collect();
    format!("#{}", mixed.concat())
}

/// Opens a Gaussian blur group of `radius` px with a unique `id` (closed by `</g>`).
fn open_blur(svg: &mut String, id: &str, radius: f32) {
    svg.push_str(&format!(
        "<defs><filter id='{id}' x='-10%' y='-10%' width='120%' height='120%'><feGaussianBlur stdDeviation='{radius:.2}'/></filter></defs><g filter='url(#{id})'>"
    ));
}

fn heading(
    ctx: &mut Ctx<'_>,
    scene: &StoryboardScene,
    index: usize,
    total: usize,
) -> (Vec<Node>, Rect) {
    let canvas = ctx.canvas;
    let content = canvas.content;
    let scale = canvas.type_scale;
    let mut nodes = Vec::new();
    let counter = format!("{} / {total}", index + 1);
    nodes.push(ctx.ts.line(
        "heading",
        &counter,
        content.right(),
        content.y + scale.small,
        scale.small,
        tokens::WEIGHT_REGULAR,
        tokens::FONT_SANS,
        tokens::MUTED,
        Anchor::End,
    ));
    let counter_w = ctx.ts.measure(
        &counter,
        scale.small,
        tokens::WEIGHT_REGULAR,
        tokens::FONT_SANS,
    );
    let heading_area = Rect::new(
        content.x,
        content.y,
        content.w - counter_w - canvas.gap,
        scale.heading * 1.5,
    );
    let (heading_nodes, bottom) = ctx.fitted_display(
        "heading",
        &scene.concept,
        heading_area,
        scale.heading * 0.72,
        scale.body * 0.9,
        tokens::INK,
        Anchor::Start,
        0.0,
    );
    nodes.extend(heading_nodes);
    let rule_y = bottom + canvas.gap * 0.6;
    nodes.push(
        Node::new(
            "heading",
            Shape::Path {
                d: format!(
                    "M{:.1} {rule_y:.1} L{:.1} {rule_y:.1}",
                    content.x,
                    content.right()
                ),
                stroke: tokens::RULE.into(),
                width: canvas.stroke * 0.5,
                length: content.w,
                fill: None,
                dashed: false,
            },
        )
        .decorative(),
    );
    let area = Rect::new(
        content.x,
        rule_y + canvas.gap * 1.2,
        content.w,
        content.bottom() - rule_y - canvas.gap * 1.2,
    );
    (nodes, area)
}

fn build_component(
    ctx: &mut Ctx<'_>,
    scene: &StoryboardScene,
    area: Rect,
    index: usize,
    stage: Option<&StageContext>,
) -> Vec<Node> {
    match &scene.composition {
        Composition::Stage { .. } => {
            let alone = StageContext {
                chapters: 1,
                hook: index == 0,
                ..StageContext::default()
            };
            components::stage::build(ctx, area, scene, stage.unwrap_or(&alone))
        }
        Composition::Title { text, kicker } => {
            components::title::build(ctx, area, text, kicker.as_deref())
        }
        Composition::FlowDiagram {
            objects,
            relations,
            looped,
        } => components::flow::build(ctx, area, objects, relations, *looped),
        Composition::Comparison {
            left_title,
            right_title,
            objects,
        } => components::comparison::build(ctx, area, left_title, right_title, objects),
        Composition::Timeline { objects } => components::timeline::build(ctx, area, objects),
        Composition::Chart {
            title,
            objects,
            max_value,
        } => components::chart::build(ctx, area, title, objects, *max_value),
        Composition::Architecture { objects, relations } => {
            components::architecture::build(ctx, area, objects, relations)
        }
        Composition::Code {
            language,
            lines,
            file_name,
        } => components::code::build(ctx, area, language, lines, file_name.as_deref()),
        Composition::Transformation {
            before,
            after,
            label,
        } => components::transformation::build(ctx, area, before, after, label.as_deref()),
        Composition::Annotation { objects, notes } => {
            components::annotation::build(ctx, area, objects, notes)
        }
        Composition::Infographic { title, objects } => {
            components::infographic::build(ctx, area, title, objects)
        }
        Composition::CauseEffect { objects } => components::cause_effect::build(ctx, area, objects),
        Composition::Steps { objects } => components::steps::build(ctx, area, objects),
        Composition::Freeform { elements } => components::freeform::build(ctx, area, elements),
        Composition::Character {
            character,
            pose,
            text,
            persona,
        } => components::character::build(
            ctx,
            area,
            *character,
            persona.as_ref(),
            *pose,
            text,
            index % 2 == 1,
        ),
    }
}

/// Seconds a line needs on screen to be read: 0.5 s plus 0.3 s a word (measured on
/// reference films).
pub fn reading_hold(words: usize) -> f32 {
    0.5 + 0.3 * words as f32
}

/// Words of each text line of a graph, keyed by object and baseline: a line drawn as one
/// node counts its words, a kinetic line (one node per word) counts its nodes.
pub fn text_lines(graph: &Graph) -> HashMap<(String, i32), usize> {
    let mut lines: HashMap<(String, i32), usize> = HashMap::new();
    for node in graph
        .nodes
        .iter()
        .filter(|node| node.readable && node.z < Z_CAPTIONS)
    {
        if let Shape::Text { y, content, .. } = &node.shape {
            let words = content.split_whitespace().count();
            *lines
                .entry((node.object.clone(), (y + node.offset.1).round() as i32))
                .or_insert(0) += words;
        }
    }
    lines
}

/// The entry time brought forward so the text is readable for `hold` seconds before the
/// scene ends; the fade-in itself takes `READ_MARGIN` before the text is legible.
fn latest_entry(time: f32, hold: f32, duration: f32) -> f32 {
    const READ_MARGIN: f32 = 0.15;
    time.min((duration - hold - READ_MARGIN).max(0.0))
}

/// The reading hold of each object: its longest line, plus the cascade in which its text
/// nodes enter (one step per node, `apply_animation`).
fn reading_holds(graph: &Graph) -> HashMap<String, f32> {
    let mut longest: HashMap<String, usize> = HashMap::new();
    for ((object, _), words) in text_lines(graph) {
        let entry = longest.entry(object).or_insert(0);
        *entry = (*entry).max(words);
    }
    longest
        .into_iter()
        .map(|(object, words)| {
            let nodes = graph
                .nodes
                .iter()
                .filter(|node| node.object == object && node.is_text() && node.z < Z_CAPTIONS)
                .count();
            let cascade = framechester_core::presets::TITLE_CASCADE.stagger_secs
                * nodes.saturating_sub(1) as f32;
            (object, reading_hold(words) + cascade)
        })
        .collect()
}

/// Resolves every animation to a time, staggering those that land together.
/// The opening scene is the hook: whatever would enter in its first moments is already on
/// screen at frame 0 (the cover of a Short and the viewer's first impression), and a short
/// camera punch-in gives that frame motion.
pub const HOOK_SECS: f32 = 0.6;
const HOOK_PUNCH: f32 = 0.05;
const HOOK_PUNCH_SECS: f32 = 0.5;

/// When an entering motion that starts at `time` must have finished: before frame 0 in the
/// hook, else unchanged.
fn hooked(time: f32, duration: f32, hook: bool) -> f32 {
    if hook && time <= HOOK_SECS {
        -duration - 0.05
    } else {
        time
    }
}

fn resolve_times(scene: &StoryboardScene, hook: bool) -> Vec<(f32, &Animation)> {
    let mut resolved: Vec<(f32, &Animation)> = scene
        .animations
        .iter()
        .map(|animation| (scene.resolve_cue(&animation.at), animation))
        .collect();
    // Entering motions that share a cue are staggered in storyboard order.
    let mut last_entry: Option<f32> = None;
    let mut stagger = 0usize;
    for (time, animation) in resolved.iter_mut() {
        if matches!(
            animation.motion,
            Motion::Reveal | Motion::Pop | Motion::Grow | Motion::Type
        ) {
            match last_entry {
                Some(previous) if (*time - previous).abs() < 0.05 => {
                    stagger += 1;
                    *time += stagger as f32 * framechester_core::presets::REVEAL.stagger_secs;
                }
                _ => {
                    stagger = 0;
                    last_entry = Some(*time);
                }
            }
        }
    }
    // Entering objects never appear before the scene has started, except in the hook,
    // where early entries have already happened.
    for (time, animation) in resolved.iter_mut() {
        *time = time.max(0.0);
        if matches!(
            animation.motion,
            Motion::Reveal | Motion::Pop | Motion::Grow | Motion::Type
        ) {
            *time = hooked(*time, animation.duration_secs, hook);
        }
    }
    resolved
}

/// How `reveal` enters in a scene. Every scene entering the same way (and every
/// element fading and sliding up) is a tell of generated video, so consecutive scenes
/// rotate through three entrances.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Entrance {
    /// Fade while sliding in from below (vertical) or the side.
    Slide,
    /// No translate: words sharpen in from a 6 px blur, cards fade in place.
    Fade,
    /// Arrive slightly large and settle.
    Settle,
}

impl Entrance {
    fn for_scene(scene_id: u32) -> Self {
        [Self::Slide, Self::Fade, Self::Settle][scene_id as usize % 3]
    }
}

fn nodes_of<'a>(graph: &'a mut Graph, target: &str) -> Vec<&'a mut Node> {
    graph
        .nodes
        .iter_mut()
        .filter(|node| node.z < Z_CAPTIONS && (target == "*" || node.object == target))
        .collect()
}

fn apply_animation(
    graph: &mut Graph,
    scene: &StoryboardScene,
    time: f32,
    animation: &Animation,
    canvas: &Canvas,
    entries: &mut HashMap<String, f32>,
) {
    let duration = animation.duration_secs;
    let offset = tokens::REVEAL_OFFSET * canvas.motion_scale();
    match animation.motion {
        Motion::Reveal => {
            let direction = if canvas.vertical {
                (0.0, offset)
            } else {
                (-offset, 0.0)
            };
            // Text lines of one target cascade in 70 ms steps (titles read as
            // a build-up); shapes keep the shared entry time.
            let mut text_index = 0usize;
            for node in nodes_of(graph, &animation.target) {
                let at = if node.is_text() {
                    let staggered = time
                        + text_index as f32
                            * framechester_core::presets::TITLE_CASCADE.stagger_secs;
                    text_index += 1;
                    staggered
                } else {
                    time
                };
                match Entrance::for_scene(scene.id) {
                    Entrance::Slide => node.props.reveal(at, duration, direction, animation.easing),
                    // Text sharpens in place; shapes (cards, rules) just appear.
                    Entrance::Fade if node.is_text() => node.props.blur_in(at),
                    Entrance::Fade => node.props.fade_in(at, duration),
                    Entrance::Settle => node.props.settle(at, duration, animation.easing),
                }
            }
            entries.entry(animation.target.clone()).or_insert(time);
        }
        Motion::Pop => {
            for node in nodes_of(graph, &animation.target) {
                node.props.pop(time, duration, animation.easing);
            }
            entries.entry(animation.target.clone()).or_insert(time);
        }
        Motion::Draw => {
            for node in nodes_of(graph, &animation.target) {
                if matches!(node.shape, Shape::Path { .. }) {
                    node.props.draw(time, duration, animation.easing);
                } else {
                    node.props.hidden_until(time);
                }
            }
            entries.entry(animation.target.clone()).or_insert(time);
        }
        Motion::Highlight => {
            for node in nodes_of(graph, &animation.target) {
                if !node.is_text() {
                    node.props.highlight(time, duration);
                }
                if matches!(node.shape, Shape::Rect { .. })
                    && node.props.opacity.is_constant()
                    && node.props.opacity.eval(0.0) == 0.0
                {
                    // Bands (code lines, tree rows) that exist only to be highlighted.
                    node.props.opacity = Track::constant(0.0);
                    node.props.opacity.to(time, 0.2, 1.0, Easing::EaseOut);
                    node.props
                        .opacity
                        .to(time + duration.max(0.4), 0.3, 0.0, Easing::EaseIn);
                }
            }
        }
        Motion::Pulse => {
            for node in nodes_of(graph, &animation.target) {
                node.props.pulse(time, duration.min(0.8));
            }
        }
        Motion::Focus => {
            let target = animation.target.clone();
            for node in graph.nodes.iter_mut().filter(|node| {
                node.z < Z_CAPTIONS && node.object != target && node.object != "heading"
            }) {
                let before = node.props.opacity.eval(time);
                if before <= 0.01 {
                    continue;
                }
                node.props
                    .opacity
                    .to(time, 0.3, (before * 0.3).max(0.12), Easing::EaseOut);
                node.props
                    .opacity
                    .to(time + duration, 0.3, before, Easing::EaseInOut);
            }
        }
        Motion::Count | Motion::Grow => {
            for node in nodes_of(graph, &animation.target) {
                match &node.shape {
                    Shape::Text {
                        counter: Some(_), ..
                    } => {
                        node.props.hidden_until(time);
                        node.props.draw.key(0.0, 0.0, Easing::Linear);
                        node.props
                            .draw
                            .to(time, duration.max(0.8), 1.0, Easing::EaseOut);
                    }
                    Shape::Rect { .. } if node.object.ends_with(":bar") => {
                        node.props.grow_x(time, duration.max(0.8), Easing::EaseOut);
                    }
                    _ => node
                        .props
                        .reveal(time, duration, (0.0, offset * 0.5), Easing::EaseOut),
                }
            }
            // Bars are separate nodes named `<object>:bar`.
            let bar = format!("{}:bar", animation.target);
            for node in nodes_of(graph, &bar) {
                node.props.grow_x(time, duration.max(0.8), Easing::EaseOut);
            }
            entries.entry(animation.target.clone()).or_insert(time);
        }
        Motion::MoveTo => {
            let Some(destination) = animation.destination.as_deref() else {
                return;
            };
            let (Some(from), Some(to)) = (
                graph.object_bbox(&animation.target),
                graph.object_bbox(destination),
            ) else {
                return;
            };
            let (dx, dy) = (to.cx() - from.cx(), to.cy() - from.cy());
            // A copy travels and dissolves into the destination; the original stays as a
            // dimmed trace so the viewer still sees what was transformed.
            let ghosts: Vec<Node> = nodes_of(graph, &animation.target)
                .into_iter()
                .map(|node| {
                    let mut ghost = node.clone();
                    ghost.object = format!("ghost:{}", node.object);
                    ghost.readable = false;
                    ghost.z += 50;
                    ghost.props.dx.to(time, duration, dx, animation.easing);
                    ghost.props.dy.to(time, duration, dy, animation.easing);
                    ghost.props.scale.to(time, duration, 0.7, Easing::EaseIn);
                    ghost.props.opacity.to(
                        time + duration * 0.5,
                        duration * 0.5,
                        0.0,
                        Easing::EaseIn,
                    );
                    node.props
                        .opacity
                        .to(time, duration * 0.6, 0.3, Easing::EaseOut);
                    ghost
                })
                .collect();
            graph.extend(ghosts);
        }
        Motion::Type => {
            let is_code = matches!(scene.composition, Composition::Code { .. });
            for node in nodes_of(graph, &animation.target) {
                match &node.shape {
                    Shape::Text { content, .. } if is_code => {
                        let characters = content.chars().count();
                        node.props.type_in(
                            time,
                            duration.min(0.04 * characters as f32 + 0.1),
                            characters,
                        );
                    }
                    _ => node.props.hidden_until(time),
                }
            }
            entries.entry(animation.target.clone()).or_insert(time);
        }
        Motion::Hide => {
            for node in nodes_of(graph, &animation.target) {
                node.props.hide(time, duration);
            }
        }
        Motion::Breathe => {
            graph.breathe = Some((3.0 * canvas.motion_scale(), duration.max(2.0)));
        }
    }
}

/// Edges draw once both endpoints are on screen; nodes without an entering animation
/// are visible from the start.
fn auto_animate_edges(
    graph: &mut Graph,
    scene: &StoryboardScene,
    entries: &HashMap<String, f32>,
    hook: bool,
) {
    let relations: Vec<(String, String)> = match &scene.composition {
        Composition::FlowDiagram { relations, .. }
        | Composition::Architecture { relations, .. } => relations
            .iter()
            .map(|relation| (relation.from.clone(), relation.to.clone()))
            .collect(),
        Composition::CauseEffect { objects } => objects
            .windows(2)
            .map(|pair| (pair[0].id.clone(), pair[1].id.clone()))
            .collect(),
        _ => Vec::new(),
    };
    let mut edges: Vec<(String, f32)> = relations
        .iter()
        .map(|(from, to)| {
            let at = entries
                .get(from)
                .copied()
                .unwrap_or(0.0)
                .max(entries.get(to).copied().unwrap_or(0.0));
            (edge_id(from, to), at + 0.1)
        })
        .collect();
    if let Composition::FlowDiagram {
        objects,
        looped: true,
        ..
    } = &scene.composition
    {
        if objects.len() >= 2 {
            let last = &objects[objects.len() - 1].id;
            let first = &objects[0].id;
            let at = entries.get(last).copied().unwrap_or(0.0) + 0.25;
            edges.push((edge_id(last, first), at));
        }
    }
    let holds = reading_holds(graph);
    let readable = |object: &str, at: f32| match holds.get(object) {
        Some(hold) => latest_entry(at, *hold, scene.duration_secs),
        None => at,
    };
    for (edge, at) in edges {
        let at = readable(&edge, at);
        for node in nodes_of(graph, &edge) {
            node.props.draw(at, 0.45, Easing::EaseOut);
            node.props.hidden_until(at);
        }
    }
    // Annotation notes follow their item.
    if let Composition::Annotation { objects, .. } = &scene.composition {
        for object in objects {
            let note = format!("note:{}", object.id);
            let at = readable(&note, entries.get(&object.id).copied().unwrap_or(0.0) + 0.3);
            for node in nodes_of(graph, &note) {
                if matches!(node.shape, Shape::Path { .. }) {
                    node.props.draw(at, 0.4, Easing::EaseOut);
                }
                node.props.reveal(at, 0.4, (0.0, 0.0), Easing::EaseOut);
            }
        }
    }
    // Heading and chart/infographic titles enter first.
    for object in [
        "heading",
        "chart-title",
        "info-title",
        "left-title",
        "right-title",
        "divider",
        "rail",
        "window",
        "tree",
        "transform-arrow",
        "before-kicker",
        "after-kicker",
    ] {
        for node in nodes_of(graph, object) {
            if matches!(node.shape, Shape::Path { .. }) {
                node.props
                    .draw(hooked(0.05, 0.5, hook), 0.5, Easing::EaseOut);
            } else {
                node.props
                    .reveal(hooked(0.0, 0.4, hook), 0.4, (0.0, 0.0), Easing::EaseOut);
            }
        }
    }
    for (layer_index, layer) in graph
        .objects()
        .iter()
        .filter(|object| object.starts_with("layer:"))
        .enumerate()
    {
        for node in nodes_of(graph, layer) {
            node.props.reveal(
                0.1 + layer_index as f32 * tokens::STAGGER,
                0.4,
                (0.0, 0.0),
                Easing::EaseOut,
            );
        }
    }
}

/// Layout QA for one scene: readable nodes inside the safe area and no two readable
/// texts of different objects overlapping at any animation key time.
fn check_layout(ctx: &mut Ctx<'_>, graph: &Graph) {
    let canvas = ctx.canvas;
    for node in graph
        .nodes
        .iter()
        .filter(|node| node.readable && node.is_text())
    {
        let bbox = node.bbox();
        if bbox.w <= 0.0 {
            continue;
        }
        let allowed = if node.z >= Z_CAPTIONS {
            canvas.captions.inset(-6.0)
        } else {
            canvas.content.inset(-6.0)
        };
        if !allowed.contains(&bbox) {
            let text = match &node.shape {
                Shape::Text { content, .. } => content.clone(),
                _ => String::new(),
            };
            ctx.issue(
                Severity::Critical,
                "outside_safe_area",
                format!(
                    "texto '{text}' do objeto '{}' sai da area segura ({:.0},{:.0} {:.0}x{:.0})",
                    node.object, bbox.x, bbox.y, bbox.w, bbox.h
                ),
            );
        }
    }
    let texts: Vec<&Node> = graph
        .nodes
        .iter()
        .filter(|node| node.readable && node.is_text() && node.z < Z_CAPTIONS)
        .collect();
    // Sample settled states: just before each change and well after the last one. A card
    // crossing another while it travels is motion, not a layout defect.
    let changes = graph.change_times();
    let mut sample_times: Vec<f32> = changes.iter().map(|t| (t - 0.05).max(0.0)).collect();
    sample_times.push(changes.last().copied().unwrap_or(0.0) + 1.5);
    let moving = |node: &Node, t: f32| {
        (node.props.dx.eval(t) - node.props.dx.eval(t + 0.1)).abs() > 0.5
            || (node.props.dy.eval(t) - node.props.dy.eval(t + 0.1)).abs() > 0.5
            || (node.props.scale.eval(t) - node.props.scale.eval(t + 0.1)).abs() > 0.01
    };
    let mut reported = 0usize;
    for (index, a) in texts.iter().enumerate() {
        for b in texts.iter().skip(index + 1) {
            if a.object == b.object {
                continue;
            }
            for &t in &sample_times {
                if a.props.opacity.eval(t) < 0.5
                    || b.props.opacity.eval(t) < 0.5
                    || moving(a, t)
                    || moving(b, t)
                {
                    continue;
                }
                let ra = a.bbox_at(t).inset(2.0);
                let rb = b.bbox_at(t).inset(2.0);
                if ra.intersects(&rb) && reported < 5 {
                    reported += 1;
                    ctx.issue(
                        Severity::Critical,
                        "text_intersection",
                        format!(
                            "textos de '{}' e '{}' se sobrepoem em t={t:.1}s",
                            a.object, b.object
                        ),
                    );
                    break;
                }
            }
        }
    }
}

/// Components lay out from the top; when they leave more than a third of the area empty,
/// they are moved down part of the way so the frame reads balanced above the captions.
fn centre_vertically(mut nodes: Vec<Node>, area: Rect) -> Vec<Node> {
    let mut top = f32::MAX;
    let mut bottom = f32::MIN;
    for node in &nodes {
        let bbox = node.bbox();
        if bbox.w <= 0.0 && bbox.h <= 0.0 {
            continue;
        }
        top = top.min(bbox.y);
        bottom = bottom.max(bbox.bottom());
    }
    if top == f32::MAX {
        return nodes;
    }
    let free = area.bottom() - bottom;
    if free > area.h * 0.3 {
        let shift = (free * 0.5).min(area.h * 0.35);
        for node in &mut nodes {
            node.shift(0.0, shift);
        }
    }
    nodes
}

/// Layout zooms tried, largest first, for compositions that lay out cards and rows.
/// The component is rebuilt with type, icons and spacing scaled up, so it fills the
/// frame instead of sitting small in it; the scene keeps the largest zoom whose layout
/// fits the content area and passes every layout check.
const ZOOMS: [f32; 4] = [1.6, 1.45, 1.3, 1.15];

pub fn compose_scene(
    typesetter: &Typesetter,
    canvas: &Canvas,
    scene: &StoryboardScene,
    index: usize,
    total: usize,
) -> ComposedScene {
    compose_scene_on(typesetter, canvas, scene, index, total, None)
}

/// [`compose_scene`] with what a stage scene inherits from the stage scenes before it.
pub fn compose_scene_on(
    typesetter: &Typesetter,
    canvas: &Canvas,
    scene: &StoryboardScene,
    index: usize,
    total: usize,
    stage: Option<&StageContext>,
) -> ComposedScene {
    let base = compose_at(typesetter, canvas, scene, index, total, 1.0, stage);
    let zoomable = matches!(
        scene.composition,
        Composition::FlowDiagram { .. }
            | Composition::Comparison { .. }
            | Composition::Timeline { .. }
            | Composition::Architecture { .. }
            | Composition::Annotation { .. }
            | Composition::Infographic { .. }
            | Composition::CauseEffect { .. }
            | Composition::Steps { .. }
    ) || (matches!(scene.composition, Composition::Chart { .. })
        && !canvas.vertical);
    // In a tall frame a zoomed chart widens its labels at the bars' expense.
    // A scene that already has a problem keeps the reference layout, so its report
    // describes the plain design and a zoom never hides or changes a defect.
    if !zoomable
        || base
            .0
            .issues
            .iter()
            .any(|issue| issue.severity == Severity::Critical)
    {
        return base.0;
    }
    for zoom in ZOOMS {
        let (composed, fits) = compose_at(typesetter, canvas, scene, index, total, zoom, stage);
        if fits && composed.issues.is_empty() {
            return composed;
        }
    }
    base.0
}

/// One composition of the scene with the component laid out at `zoom`; also says
/// whether the component stayed inside its area.
fn compose_at(
    typesetter: &Typesetter,
    canvas: &Canvas,
    scene: &StoryboardScene,
    index: usize,
    total: usize,
    zoom: f32,
    stage: Option<&StageContext>,
) -> (ComposedScene, bool) {
    let mut ctx = Ctx::new(canvas, typesetter, scene.id);
    let mut graph = Graph {
        look: canvas.look,
        ..Graph::default()
    };
    // A title, a character or a stage speaks for itself: no heading bar above it.
    let is_stage = matches!(scene.composition, Composition::Stage { .. });
    let is_title = is_stage
        || matches!(
            scene.composition,
            Composition::Title { .. } | Composition::Character { .. }
        );
    let area = if is_title {
        canvas.content
    } else {
        let (nodes, area) = heading(&mut ctx, scene, index, total);
        graph.extend(nodes);
        area
    };
    let component = if zoom == 1.0 {
        build_component(&mut ctx, scene, area, index, stage)
    } else {
        let zoomed = canvas.zoomed(zoom);
        let mut zoomed_ctx = Ctx::new(&zoomed, typesetter, scene.id);
        let nodes = build_component(&mut zoomed_ctx, scene, area, index, stage);
        ctx.issues.extend(zoomed_ctx.issues);
        nodes
    };
    let fits = component
        .iter()
        .map(Node::bbox)
        .filter(|bbox| bbox.w > 0.0 || bbox.h > 0.0)
        .all(|bbox| area.inset(-2.0).contains(&bbox));
    // A stage fills its area on purpose: moving it would break the shot between scenes.
    if is_stage {
        graph.extend(component);
    } else {
        graph.extend(centre_vertically(component, area));
    }
    graph.extend(captions::build(&mut ctx, scene));
    let mut entries: HashMap<String, f32> = HashMap::new();
    let mut animated_objects = Vec::new();
    let hook = index == 0;
    let holds = reading_holds(&graph);
    for (time, animation) in resolve_times(scene, hook) {
        // A line must stay on screen long enough to be read before the scene ends: an
        // entry the narration cues too late is brought forward just enough.
        let time = match (animation.motion, holds.get(&animation.target)) {
            (
                Motion::Reveal | Motion::Pop | Motion::Grow | Motion::Type | Motion::Draw,
                Some(hold),
            ) => latest_entry(time, *hold, scene.duration_secs),
            _ => time,
        };
        if !animated_objects.contains(&animation.target) {
            animated_objects.push(animation.target.clone());
        }
        apply_animation(&mut graph, scene, time, animation, canvas, &mut entries);
    }
    auto_animate_edges(&mut graph, scene, &entries, hook);
    if matches!(scene.composition, Composition::Character { .. }) {
        components::character::animate(&mut graph.nodes, scene, canvas.motion_scale(), hook);
    }
    // Every scene gets a slow camera move, cycling so consecutive scenes differ; a stage
    // is one locked shot across its scenes, so its cuts stay invisible.
    graph.camera = (!is_stage).then(|| {
        (
            Camera::for_scene(index),
            scene.duration_secs.max(1.0),
            (canvas.width as f32, canvas.height as f32),
        )
    });
    check_layout(&mut ctx, &graph);
    let change_times = graph.change_times();
    let focal = focal_of(&graph, &entries, true);
    let opening = focal_of(&graph, &entries, false);
    (
        ComposedScene {
            id: scene.id,
            start_secs: scene.start_secs,
            duration_secs: scene.duration_secs,
            transition: scene.transition,
            graph,
            issues: ctx.issues,
            change_times,
            animated_objects,
            focal,
            opening,
            followable: framechester_core::storyboard::followable_ids(&scene.composition),
        },
        fits,
    )
}

/// Composes every scene for the storyboard's format. Scenes need real timing
/// (`duration_secs > 0`) for cues to resolve; without it, cues fall back to the start.
pub fn compose(storyboard: &Storyboard, typesetter: &Typesetter) -> Result<Composed> {
    storyboard.validate()?;
    let canvas = Canvas::for_storyboard(storyboard.format, storyboard.look.unwrap_or_default());
    let total = storyboard.scenes.len();
    let stages = components::stage::contexts(
        &storyboard.scenes,
        components::stage::MascotStyle::of(storyboard.identity.as_ref()),
    );
    let scenes = storyboard
        .scenes
        .iter()
        .zip(&stages)
        .enumerate()
        .map(|(index, (scene, stage))| {
            compose_scene_on(typesetter, &canvas, scene, index, total, stage.as_ref())
        })
        .collect();
    Ok(Composed { canvas, scenes })
}

/// Critical layout issues of a planned (not yet narrated) storyboard, found in
/// milliseconds instead of after the TTS and the full render. Text layout does not
/// depend on audio timing, so each scene is composed with estimated word timings
/// (`ESTIMATED_SECS_PER_WORD`); the storyboard itself is not changed.
pub fn layout_preflight(storyboard: &Storyboard, typesetter: &Typesetter) -> Vec<LayoutIssue> {
    const ESTIMATED_SECS_PER_WORD: f32 = 0.33;
    let canvas = Canvas::for_storyboard(storyboard.format, storyboard.look.unwrap_or_default());
    let total = storyboard.scenes.len();
    let stages = components::stage::contexts(
        &storyboard.scenes,
        components::stage::MascotStyle::of(storyboard.identity.as_ref()),
    );
    let mut issues = Vec::new();
    for (index, scene) in storyboard.scenes.iter().enumerate() {
        let mut scene = scene.clone();
        let texts = segment_narration(&scene.narration);
        let audio: Vec<SegmentAudio> = texts
            .iter()
            .map(|text| SegmentAudio {
                duration_secs: text.split_whitespace().count().max(1) as f32
                    * ESTIMATED_SECS_PER_WORD,
                leading_silence_secs: 0.0,
                trailing_silence_secs: 0.0,
                pauses: Vec::new(),
            })
            .collect();
        let breaks = paragraph_breaks(&scene.narration, &texts);
        let (segments, duration) = assemble_scene(&texts, &audio, &breaks);
        scene.segments = segments;
        scene.duration_secs = duration;
        issues.extend(
            compose_scene_on(
                typesetter,
                &canvas,
                &scene,
                index,
                total,
                stages[index].as_ref(),
            )
            .issues
            .into_iter()
            .filter(|issue| issue.severity == Severity::Critical),
        );
    }
    issues
}

/// SVG of the whole frame at absolute time `t`, including transitions between scenes.
const PREVIEW_MARK: &str = "PRÉVIA · REVISÃO PENDENTE";

/// Stamps the draft mark on a finished frame, top-left, above every layer.
pub fn stamp_preview(svg: &mut String, canvas_width: u32) {
    let closing = "</svg>";
    assert!(
        svg.ends_with(closing),
        "frame SVG must be complete before stamping"
    );
    svg.truncate(svg.len() - closing.len());
    let size = (canvas_width / 40).max(18) as f32;
    let pad = size * 0.5;
    let width = PREVIEW_MARK.chars().count() as f32 * size * 0.56 + pad * 2.0;
    svg.push_str(&format!(
        "<g font-family='{}' font-weight='700'><rect x='16' y='16' width='{width}' height='{}' rx='6' fill='#000000' fill-opacity='0.75'/><text x='{}' y='{}' font-size='{size}' fill='#FFFFFF'>{PREVIEW_MARK}</text></g></svg>",
        tokens::FONT_SANS,
        size + pad * 2.0,
        16.0 + pad,
        16.0 + pad + size * 0.82,
    ));
}

pub fn frame_svg(composed: &Composed, t: f32, font_family: &str) -> String {
    let canvas = &composed.canvas;
    let (width, height) = (canvas.width, canvas.height);
    let mut svg = String::with_capacity(32 * 1024);
    svg.push_str(&format!(
        "<svg xmlns='http://www.w3.org/2000/svg' width='{width}' height='{height}' viewBox='0 0 {width} {height}'>{}<g font-family='{}'>",
        Graph::background_svg(width, height, None, t, crate::look::theme(canvas.look)),
        font_family
    ));
    let index = composed
        .scenes
        .iter()
        .position(|scene| t < scene.start_secs + scene.duration_secs)
        .unwrap_or(composed.scenes.len().saturating_sub(1));
    if let Some(scene) = composed.scenes.get(index) {
        let local = (t - scene.start_secs).max(0.0);
        let progress = if index > 0 && scene.transition != Transition::Cut {
            (local / transition_secs(scene.transition)).clamp(0.0, 1.0)
        } else {
            1.0
        };
        if progress < 1.0 {
            let theme = crate::look::theme(canvas.look);
            let previous = &composed.scenes[index - 1];
            // The object both scenes show, and where it sits in each.
            let hero =
                framechester_core::storyboard::hero_of(&previous.followable, &scene.followable)
                    .and_then(|id| {
                        // Its label is what the eye follows: text box to text box.
                        let from = text_bbox(&previous.graph, &id)?;
                        let to = text_bbox(&scene.graph, &id)?;
                        Some((id, from, to))
                    });
            // A morph needs a card on both sides; without one the stage hands over.
            let transition = match scene.transition {
                Transition::Morph if previous.focal.is_none() || scene.opening.is_none() => {
                    Transition::BlurSwap
                }
                Transition::Flood if hero.is_none() => Transition::BlurSwap,
                other => other,
            };
            let eased = crate::anim::ease(Easing::EaseInOut, progress);
            let previous_t = previous.duration_secs;
            match transition {
                Transition::Push => {
                    let shift = if canvas.vertical {
                        height as f32
                    } else {
                        width as f32
                    } * eased;
                    if canvas.vertical {
                        previous
                            .graph
                            .svg_inner(&mut svg, previous_t, 0.0, -shift, 1.0, 1.0);
                        scene.graph.svg_inner(
                            &mut svg,
                            local,
                            0.0,
                            height as f32 - shift,
                            1.0,
                            1.0,
                        );
                    } else {
                        previous
                            .graph
                            .svg_inner(&mut svg, previous_t, -shift, 0.0, 1.0, 1.0);
                        scene
                            .graph
                            .svg_inner(&mut svg, local, width as f32 - shift, 0.0, 1.0, 1.0);
                    }
                }
                Transition::Fade => {
                    previous
                        .graph
                        .svg_inner(&mut svg, previous_t, 0.0, 0.0, 1.0, 1.0 - eased);
                    scene.graph.svg_inner(&mut svg, local, 0.0, 0.0, 1.0, eased);
                }
                Transition::Zoom => {
                    let scale = 1.0 - 0.08 * eased;
                    let dx = (width as f32) * (1.0 - scale) / 2.0;
                    let dy = (height as f32) * (1.0 - scale) / 2.0;
                    previous
                        .graph
                        .svg_inner(&mut svg, previous_t, dx, dy, scale, 1.0 - eased);
                    scene.graph.svg_inner(&mut svg, local, 0.0, 0.0, 1.0, eased);
                }
                Transition::Cut => scene.graph.svg_inner(&mut svg, local, 0.0, 0.0, 1.0, 1.0),
                Transition::DipCut => {
                    // The outgoing frame holds three frames, darkened, then the hard cut.
                    previous
                        .graph
                        .svg_inner(&mut svg, previous_t, 0.0, 0.0, 1.0, 1.0);
                    svg.push_str(&format!(
                        "<rect width='{width}' height='{height}' fill='#000000' opacity='0.4'/>"
                    ));
                }
                Transition::BlurSwap => {
                    // Out: fade with blur growing to 8 px; in: blur shrinking from 8 px.
                    // Only the content swaps; the ground under both never cuts.
                    if progress < 0.5 {
                        let out = progress / 0.5;
                        open_blur(&mut svg, "fc-swap", 8.0 * out);
                        previous
                            .graph
                            .svg_inner(&mut svg, previous_t, 0.0, 0.0, 1.0, 1.0 - out);
                    } else {
                        let into = (progress - 0.5) / 0.5;
                        open_blur(&mut svg, "fc-swap", 8.0 * (1.0 - into));
                        scene.graph.svg_inner(&mut svg, local, 0.0, 0.0, 1.0, into);
                    }
                    svg.push_str("</g>");
                }
                Transition::Iris => {
                    // The next world opens in a circle from where the eye already is,
                    // accelerating as it goes (a zoom through eases in).
                    let (cx, cy) = previous
                        .focal
                        .as_ref()
                        .map_or((width as f32 / 2.0, height as f32 / 2.0), |focal| {
                            (focal.rect.cx(), focal.rect.cy())
                        });
                    let reach = [(0.0, 0.0), (width as f32, 0.0), (0.0, height as f32)]
                        .into_iter()
                        .chain([(width as f32, height as f32)])
                        .map(|(x, y)| ((x - cx).powi(2) + (y - cy).powi(2)).sqrt())
                        .fold(0.0f32, f32::max);
                    let radius = reach * crate::anim::ease(Easing::EaseIn, progress);
                    previous
                        .graph
                        .svg_inner(&mut svg, previous_t, 0.0, 0.0, 1.0, 1.0);
                    svg.push_str(&format!(
                        "<defs><clipPath id='fc-iris'><circle cx='{cx:.1}' cy='{cy:.1}' r='{radius:.1}'/></clipPath></defs><g clip-path='url(#fc-iris)'>{}",
                        Graph::background_svg(width, height, None, t, theme)
                    ));
                    scene.graph.svg_inner(&mut svg, local, 0.0, 0.0, 1.0, 1.0);
                    svg.push_str("</g>");
                }
                Transition::Flood => {
                    let Some((id, from, to)) = &hero else {
                        unreachable!("a flood without a hero falls back to a blur swap");
                    };
                    let is_hero = |node: &Node| &node.object == id;
                    let rest = |node: &Node| &node.object != id;
                    // The ground floods with the hero's colour and recedes as the new
                    // scene builds; the hero never leaves the screen.
                    let wash = previous
                        .graph
                        .nodes
                        .iter()
                        .filter(|node| is_hero(node))
                        .find_map(|node| match &node.shape {
                            Shape::Rect { fill, .. } => tokens::card_role_name(fill),
                            _ => None,
                        })
                        .and_then(|name| {
                            tokens::ROLES
                                .into_iter()
                                .find(|role| tokens::role_name(*role) == name)
                        })
                        // A neutral hero floods with the look's accent, its one focus colour.
                        .filter(|role| *role != framechester_core::storyboard::Role::Neutral)
                        .map_or(tokens::ACCENT, |role| tokens::palette(role).stroke);
                    let flood = crate::anim::ease(Easing::EaseInOut, (progress / 0.5).min(1.0))
                        * (1.0 - ((progress - 0.5) / 0.5).clamp(0.0, 1.0));
                    svg.push_str(&format!(
                        "<rect id='fc-flood' width='{width}' height='{height}' fill='{}' opacity='{:.3}'/>",
                        theme.paint(wash),
                        0.32 * flood
                    ));
                    let leave = 1.0 - (progress / 0.4).min(1.0);
                    if leave > 0.0 {
                        previous
                            .graph
                            .svg_nodes(&mut svg, previous_t, 0.0, 0.0, 1.0, 1.0, leave, &rest);
                    }
                    let build = ((progress - 0.4) / 0.6).clamp(0.0, 1.0);
                    if build > 0.0 {
                        scene
                            .graph
                            .svg_nodes(&mut svg, local, 0.0, 0.0, 1.0, 1.0, build, &rest);
                    }
                    // The hero travels and rescales into its new place, then hands over
                    // to the incoming scene's own copy of itself.
                    let travel = crate::anim::ease(Easing::EaseInOut, (progress / 0.85).min(1.0));
                    // Uniform scale from label height to label height (text never
                    // stretches), so the label lands on the new label.
                    let fit = to.h / from.h.max(1.0);
                    let scale = 1.0 + (fit - 1.0) * travel;
                    let centre = (
                        from.cx() + (to.cx() - from.cx()) * travel,
                        from.cy() + (to.cy() - from.cy()) * travel,
                    );
                    let handover = ((progress - 0.8) / 0.2).clamp(0.0, 1.0);
                    previous.graph.svg_nodes(
                        &mut svg,
                        previous_t,
                        centre.0 - scale * from.cx(),
                        centre.1 - scale * from.cy(),
                        scale,
                        scale,
                        1.0 - handover,
                        &is_hero,
                    );
                    if handover > 0.0 {
                        scene
                            .graph
                            .svg_nodes(&mut svg, local, 0.0, 0.0, 1.0, 1.0, handover, &is_hero);
                    }
                }
                Transition::Morph => {
                    let (Some(from), Some(to)) = (previous.focal.as_ref(), scene.opening.as_ref())
                    else {
                        unreachable!("a morph without both cards falls back to a blur swap");
                    };
                    // The container reshapes on a long-tail arrival while the old content
                    // leaves fast; the new content appears in it and the shell dissolves
                    // once it sits exactly where the incoming card is.
                    let shape = crate::anim::ease(
                        framechester_core::presets::EASE_ARRIVE,
                        (progress / 0.8).min(1.0),
                    );
                    let lerp = |a: f32, b: f32| a + (b - a) * shape;
                    let rect = Rect::new(
                        lerp(from.rect.x, to.rect.x),
                        lerp(from.rect.y, to.rect.y),
                        lerp(from.rect.w, to.rect.w),
                        lerp(from.rect.h, to.rect.h),
                    );
                    let colour = mix_hex(
                        theme.flood(from.paint.as_deref()),
                        theme.flood(to.paint.as_deref()),
                        shape,
                    );
                    let leave = 1.0 - (progress / 0.35).min(1.0);
                    if leave > 0.0 {
                        previous
                            .graph
                            .svg_inner(&mut svg, previous_t, 0.0, 0.0, 1.0, leave);
                    }
                    let shell = 1.0 - ((progress - 0.75) / 0.25).clamp(0.0, 1.0);
                    svg.push_str(&format!(
                        "<rect id='fc-morph' x='{:.1}' y='{:.1}' width='{:.1}' height='{:.1}' rx='{:.1}' fill='{colour}' opacity='{shell:.3}'/>",
                        rect.x, rect.y, rect.w, rect.h, canvas.radius,
                    ));
                    let enter = ((progress - 0.5) / 0.5).clamp(0.0, 1.0);
                    if enter > 0.0 {
                        scene.graph.svg_inner(&mut svg, local, 0.0, 0.0, 1.0, enter);
                    }
                }
                Transition::Expand => {
                    let focal = previous.focal.as_ref();
                    let flood = theme.flood(focal.and_then(|focal| focal.paint.as_deref()));
                    let from = focal.map_or(
                        Rect::new(
                            width as f32 * 0.4,
                            height as f32 * 0.4,
                            width as f32 * 0.2,
                            height as f32 * 0.2,
                        ),
                        |focal| focal.rect,
                    );
                    // The card grows past the frame (its radius shrinking) while the
                    // rest leaves; once it is the ground, the next scene enters on it
                    // and its colour settles into the look's ground.
                    let grow = crate::anim::ease(Easing::EaseInOut, (progress / 0.7).min(1.0));
                    let lerp = |a: f32, b: f32| a + (b - a) * grow;
                    let rect = Rect::new(
                        lerp(from.x, -(width as f32) * 0.02),
                        lerp(from.y, -(height as f32) * 0.02),
                        lerp(from.w, width as f32 * 1.04),
                        lerp(from.h, height as f32 * 1.04),
                    );
                    let rest = 1.0 - (progress / 0.45).min(1.0);
                    if rest > 0.0 {
                        previous
                            .graph
                            .svg_inner(&mut svg, previous_t, 0.0, 0.0, 1.0, rest);
                    }
                    let settle = 1.0 - ((progress - 0.7) / 0.3).clamp(0.0, 1.0);
                    svg.push_str(&format!(
                        "<rect x='{:.1}' y='{:.1}' width='{:.1}' height='{:.1}' rx='{:.1}' fill='{flood}' opacity='{settle:.3}'/>",
                        rect.x,
                        rect.y,
                        rect.w,
                        rect.h,
                        canvas.radius * (1.0 - grow),
                    ));
                    let enter = ((progress - 0.55) / 0.45).clamp(0.0, 1.0);
                    if enter > 0.0 {
                        scene.graph.svg_inner(&mut svg, local, 0.0, 0.0, 1.0, enter);
                    }
                }
                Transition::WhipPan => {
                    // Fast sideways slide; mid-whip both frames stretch
                    // horizontally and dip in opacity (simulated motion blur:
                    // geometric stretch, not a true blur - see scene.rs).
                    let bell = (progress * std::f32::consts::PI).sin();
                    let stretch = 1.0 + 0.10 * bell;
                    let dip = 1.0 - 0.25 * bell;
                    let shift = width as f32 * eased;
                    previous
                        .graph
                        .svg_inner_ex(&mut svg, previous_t, -shift, 0.0, stretch, 1.0, dip);
                    scene.graph.svg_inner_ex(
                        &mut svg,
                        local,
                        width as f32 - shift,
                        0.0,
                        stretch,
                        1.0,
                        dip,
                    );
                }
            }
        } else if index == 0 && local < HOOK_PUNCH_SECS {
            let scale = 1.0
                + HOOK_PUNCH * (1.0 - crate::anim::ease(Easing::EaseOut, local / HOOK_PUNCH_SECS));
            let dx = (width as f32) * (1.0 - scale) / 2.0;
            let dy = (height as f32) * (1.0 - scale) / 2.0;
            scene.graph.svg_inner(&mut svg, local, dx, dy, scale, 1.0);
        } else {
            scene.graph.svg_inner(&mut svg, local, 0.0, 0.0, 1.0, 1.0);
        }
    }
    // Episode progress: a quiet top bar so long vertical videos always show
    // how far along they are. Decorative, above content, below nothing else.
    let total = composed.total_duration_secs().max(0.1);
    let done = (t / total).clamp(0.0, 1.0) * width as f32;
    let palette = crate::look::theme(canvas.look);
    svg.push_str(&format!(
        "<g id='fc-progress'><rect x='0' y='0' width='{width}' height='6' fill='{}' opacity='0.18'/><rect x='0' y='0' width='{done:.1}' height='6' fill='{accent}'/><circle cx='{done:.1}' cy='3' r='5' fill='{accent}'/></g>",
        palette.paint(tokens::INK),
        accent = palette.paint(tokens::ACCENT),
    ));
    svg.push_str("</g></svg>");
    svg
}

#[cfg(test)]
mod tests {
    use super::*;
    use framechester_core::domain::Scene;
    use framechester_core::planner::plan_scene;
    use framechester_core::storyboard::*;

    fn narrated(brief: &str, narration: &str) -> StoryboardScene {
        let mut scene = plan_scene(
            &Scene {
                id: 1,
                heading: "Conceito da cena".into(),
                narration: narration.into(),
                visual_brief: brief.into(),
                duration_hint_secs: 5.0,
            },
            1,
        )
        .unwrap();
        let texts = segment_narration(narration);
        let audio: Vec<SegmentAudio> = texts
            .iter()
            .map(|text| SegmentAudio {
                duration_secs: text.split_whitespace().count() as f32 * 0.33,
                leading_silence_secs: 0.05,
                trailing_silence_secs: 0.1,
                pauses: Vec::new(),
            })
            .collect();
        let (segments, duration) = assemble_scene(&texts, &audio, &vec![false; texts.len()]);
        scene.segments = segments;
        scene.duration_secs = duration;
        scene
    }

    pub(crate) fn sample_briefs() -> Vec<(&'static str, &'static str)> {
        vec![
            ("#pergunta Skill ou agente: qual a diferença na prática?", "Skill ou agente: qual a diferenca na pratica? Vamos ver."),
            ("#fluxo Objetivo [user] -> Decidir [brain] {primary} -> Agir [tool] -> Observar [search] -> loop", "O agente recebe o objetivo, decide o proximo passo, age com uma ferramenta e observa o resultado. Depois repete."),
            ("#comparacao Agente: decide o passo; executa ferramentas; observa | Skill: ensina o processo; versionada; reutilizavel", "O agente decide e executa. A skill ensina o processo e e reutilizavel."),
            ("#linha-do-tempo 2022: prompts soltos; 2024: agentes com ferramentas; 2025: skills empacotadas", "Em 2022 eram prompts soltos. Em 2024 vieram agentes com ferramentas. Em 2025, skills empacotadas."),
            ("#grafico Tokens no contexto | Sem skill=100%; Com skill=40%", "Sem skill, 100% das instrucoes entram no contexto. Com skill, cerca de 40%."),
            ("#arquitetura Agente/Planejador; Agente/Executor; Skills/SKILL.md; Skills/scripts; Planejador -> SKILL.md; Executor -> scripts", "O planejador le o SKILL.md e o executor roda os scripts."),
            ("#arquitetura Your request; Claude Code; Skill file: name, description, instructions; Your request -> Claude Code; Skill file -> Claude Code", "The first step is the file itself: a skill is written instructions in a file."),
            ("#codigo markdown | SKILL.md\n---\nname: revisar-pr\ndescription: Revisa PRs\n---\n1. Leia o diff\n2. Rode os testes", "O arquivo tem nome, descricao e os passos."),
            ("#transformacao Prompt gigante; Regras soltas => Skill versionada [skill]", "Um prompt gigante e regras soltas viram uma skill versionada."),
            ("#anotacao revisar-pr/SKILL.md: instrucoes e metadados; revisar-pr/scripts/check.py: codigo opcional; revisar-pr/exemplos: casos reais", "A pasta tem o SKILL.md com instrucoes, scripts opcionais e exemplos."),
            ("#infografico O que muda | Tokens=40%: do contexto [chart]; Passos=3: etapas fixas [check]; Erros [shield]: menos retrabalho", "Caem para 40% os tokens, sao 3 passos fixos e menos erros."),
            ("#causa Sem skill => O agente improvisa => Resultados variam => Mais retrabalho", "Sem skill, o agente improvisa, os resultados variam e ha mais retrabalho."),
            ("#passos Confira a amostra; Leia o intervalo; Veja as condicoes", "Confira a amostra, leia o intervalo e veja as condicoes."),
            ("#personagem apresentador | explicar | Uma skill é uma receita que o agente segue", "Uma skill e uma receita. O agente segue os passos dela."),
            ("#personagem dev | apontar", "O arquivo fica na pasta do projeto, versionado com o codigo."),
            ("#personagem cientista | pensar | Dá para medir a diferença?", "Da para medir a diferenca? Vamos testar duas vezes."),
            ("#personagem robo | comemorar | Mesma tarefa, metade dos tokens", "Mesma tarefa, com menos tokens no contexto."),
        ]
    }

    #[test]
    fn steps_draw_a_spine_with_numbered_badges() {
        let typesetter = Typesetter::new().unwrap();
        let canvas = Canvas::for_format(VideoFormat::Vertical);
        let scene = narrated(
            "#passos Confira a amostra; Leia o intervalo; Veja as condicoes",
            "Confira a amostra, leia o intervalo e veja as condicoes.",
        );
        let composed = compose_scene(&typesetter, &canvas, &scene, 0, 1);
        assert!(
            composed
                .graph
                .nodes
                .iter()
                .any(|node| node.object == "steps-spine"),
            "spine present"
        );
        let badges = composed
            .graph
            .nodes
            .iter()
            .filter(|node| matches!(node.shape, Shape::Circle { .. }))
            .count();
        assert_eq!(badges, 3, "one numbered badge per step");
        assert!(composed.issues.is_empty(), "{:?}", composed.issues);
    }

    #[test]
    fn title_text_lines_cascade_instead_of_entering_together() {
        let typesetter = Typesetter::new().unwrap();
        let canvas = Canvas::for_format(VideoFormat::Vertical);
        let scene = narrated(
            "#citacao Uma frase longa o bastante para ocupar mais de uma linha no quadro vertical | Autora",
            "Uma frase longa o bastante para ocupar mais de uma linha no quadro vertical.",
        );
        // Index 1: not the hook scene, whose entries have already happened.
        let composed = compose_scene(&typesetter, &canvas, &scene, 1, 2);
        let texts: Vec<f32> = composed
            .graph
            .nodes
            .iter()
            .filter(|node| node.object == "title" && node.is_text())
            .map(|node| node.props.opacity.eval(0.10))
            .collect();
        assert!(texts.len() >= 2, "title wrapped into lines: {texts:?}");
        assert!(
            texts[0] > texts[texts.len() - 1],
            "first line leads the cascade: {texts:?}"
        );
    }

    #[test]
    fn whip_pan_stretches_both_frames_mid_transition() {
        let typesetter = Typesetter::new().unwrap();
        let canvas = Canvas::for_format(VideoFormat::Vertical);
        let first = narrated("#pergunta Agente ou skill?", "Agente ou skill?");
        let mut second = narrated("#pergunta E agora?", "E agora?");
        second.start_secs = first.duration_secs;
        second.transition = Transition::WhipPan;
        let composed = Composed {
            canvas,
            scenes: vec![
                compose_scene(&typesetter, &canvas, &first, 0, 2),
                compose_scene(&typesetter, &canvas, &second, 1, 2),
            ],
        };
        // Middle of the 0.42 s transition window: bell = 1, stretch = 1.10.
        let mid = first.duration_secs + TRANSITION_SECS / 2.0;
        let svg = frame_svg(&composed, mid, "Inter");
        assert!(svg.contains("scale(1.1000 1.0000)"), "{svg}");
    }

    #[test]
    fn title_words_reveal_one_after_another() {
        let typesetter = Typesetter::new().unwrap();
        let canvas = Canvas::for_format(VideoFormat::Vertical);
        let scene = narrated(
            "#citacao Uma frase longa o bastante para ocupar mais de uma linha no quadro vertical | Autora",
            "Uma frase longa o bastante para ocupar mais de uma linha no quadro vertical.",
        );
        // Index 1: not the hook scene, whose entries have already happened.
        let composed = compose_scene(&typesetter, &canvas, &scene, 1, 2);
        let words: Vec<f32> = composed
            .graph
            .nodes
            .iter()
            .filter(|node| node.object == "title" && node.is_text())
            .map(|node| node.props.opacity.eval(0.12))
            .collect();
        assert!(words.len() >= 4, "one node per word: {words:?}");
        assert!(
            words[0] > words[words.len() - 1],
            "first word leads the reveal: {words:?}"
        );
    }

    #[test]
    fn every_frame_carries_the_episode_progress_bar() {
        let typesetter = Typesetter::new().unwrap();
        let canvas = Canvas::for_format(VideoFormat::Vertical);
        let scene = narrated("#pergunta Agente ou skill?", "Agente ou skill?");
        let composed = Composed {
            canvas,
            scenes: vec![compose_scene(&typesetter, &canvas, &scene, 0, 1)],
        };
        let svg = frame_svg(&composed, 0.0, "Inter");
        assert!(svg.contains("id='fc-progress'"), "{svg}");
        assert!(svg.contains("id='fc-bg'"), "{svg}");
    }

    #[test]
    fn preview_stamp_is_the_last_layer_of_a_complete_frame() {
        let mut svg = "<svg xmlns='http://www.w3.org/2000/svg'><g></g></svg>".to_string();
        stamp_preview(&mut svg, 1080);
        assert!(svg.ends_with("</text></g></svg>"));
        assert_eq!(svg.matches("</svg>").count(), 1);
        assert!(svg.contains(PREVIEW_MARK));
    }

    #[test]
    fn the_hook_shows_the_opening_at_frame_zero_with_a_punch_in_and_later_scenes_still_enter() {
        let typesetter = Typesetter::new().unwrap();
        let canvas = Canvas::for_format(VideoFormat::Vertical);
        let mut first = narrated(
            "#personagem robo | pensar | Agente ou skill?",
            "Agente ou skill? Vamos ver.",
        );
        let mut second = narrated(
            "#fluxo Objetivo -> Decidir -> Agir",
            "O agente recebe o objetivo, decide e age.",
        );
        second.start_secs = first.duration_secs;
        first.transition = Transition::Cut;
        let speech_at_zero = |scene: &ComposedScene, object: &str| {
            scene
                .graph
                .nodes
                .iter()
                .filter(|node| node.object == object && node.is_text())
                .map(|node| node.props.opacity.eval(0.0))
                .fold(0.0f32, f32::max)
        };
        let opening = compose_scene(&typesetter, &canvas, &first, 0, 2);
        assert!(
            speech_at_zero(&opening, "speech") > 0.99,
            "the hook line is on frame 0"
        );
        let robot = opening
            .graph
            .nodes
            .iter()
            .find(|node| node.object == "character")
            .unwrap();
        assert!(
            robot.props.opacity.eval(0.0) > 0.99,
            "the character is already standing"
        );
        let later = compose_scene(&typesetter, &canvas, &second, 1, 2);
        let first_step = &second.composition.object_ids()[0].to_string();
        assert!(
            speech_at_zero(&later, first_step) < 0.1,
            "later scenes keep their entrance"
        );
        let composed = Composed {
            canvas,
            scenes: vec![opening, later],
        };
        assert!(
            frame_svg(&composed, 0.0, tokens::FONT_SANS).contains("scale(1.05"),
            "punch-in at frame 0"
        );
        let max_scale = |svg: &str| {
            svg.split("scale(")
                .skip(1)
                .filter_map(|rest| rest.split([' ', ')']).next()?.parse::<f32>().ok())
                .fold(1.0f32, f32::max)
        };
        let settled = frame_svg(&composed, 0.6, tokens::FONT_SANS);
        assert!(
            max_scale(&settled) < 1.04,
            "the punch-in (1.05) has settled after 0.5 s; only the camera move remains"
        );
        let storyboard = Storyboard {
            version: SCHEMA_VERSION,
            title: "Gancho".into(),
            channel: "Canal".into(),
            format: VideoFormat::Vertical,
            language: "pt-BR".into(),
            scenes: vec![first, second],
            look: None,
            source_hash: None,
            identity: None,
        };
        let checks = crate::qa::hook_checks(&storyboard, &composed);
        assert!(
            checks
                .iter()
                .all(|check| check.status == framechester_core::domain::QaStatus::Pass),
            "{checks:?}"
        );
    }

    #[test]
    fn consecutive_scenes_get_different_slow_camera_moves_that_spare_the_captions() {
        let moves: Vec<Camera> = (0..4).map(Camera::for_scene).collect();
        for pair in moves.windows(2) {
            assert_ne!(pair[0], pair[1]);
        }
        let (dx, dy, scale) = Camera::PushIn.at(1.0, 1080.0, 1920.0);
        assert!((scale - 1.025).abs() < 1e-4);
        assert!(
            (dx + 1080.0 * 0.0125).abs() < 0.1 && (dy + 1920.0 * 0.0125).abs() < 0.1,
            "zoom keeps the centre"
        );
        let typesetter = Typesetter::new().unwrap();
        let canvas = Canvas::for_format(VideoFormat::Vertical);
        let scene = narrated(
            "#fluxo Objetivo -> Decidir -> Agir",
            "O agente recebe o objetivo, decide e age.",
        );
        let composed = compose_scene(&typesetter, &canvas, &scene, 1, 3);
        assert_eq!(
            composed.graph.camera.map(|camera| camera.0),
            Some(Camera::DriftLeft)
        );
    }

    #[test]
    fn a_character_talks_only_while_the_narration_plays_and_blinks() {
        let typesetter = Typesetter::new().unwrap();
        let canvas = Canvas::for_format(VideoFormat::Vertical);
        let scene = narrated(
            "#personagem robo | apontar | Mesma tarefa, metade dos tokens",
            "Mesma tarefa. Com menos tokens no contexto.",
        );
        let composed = compose_scene(&typesetter, &canvas, &scene, 0, 3);
        let mouth = composed
            .graph
            .nodes
            .iter()
            .find(|node| node.object == components::character::MOUTH)
            .unwrap();
        let segment = &scene.segments[0];
        let speaking: Vec<f32> = (0..8)
            .map(|step| {
                mouth
                    .props
                    .sy
                    .eval(segment.start_secs + 0.07 + step as f32 * 0.07)
            })
            .collect();
        assert!(
            speaking.iter().cloned().fold(f32::MIN, f32::max) > 1.1
                && speaking.iter().cloned().fold(f32::MAX, f32::min) < 0.9,
            "the mouth opens and closes while speaking: {speaking:?}"
        );
        let last = scene.segments.last().unwrap();
        assert_eq!(
            mouth.props.sy.eval(last.end_secs + 0.2),
            1.0,
            "silent after the narration"
        );
        let eye = composed
            .graph
            .nodes
            .iter()
            .find(|node| node.object == components::character::EYES)
            .unwrap();
        assert!(
            eye.props.sy.eval(1.4 + 0.08) < 0.2,
            "the eyes close in a blink"
        );
        let brow = composed
            .graph
            .nodes
            .iter()
            .find(|node| node.object == components::character::BROWS)
            .unwrap();
        assert!(
            brow.props.dy.eval(segment.start_secs + 0.15) < -1.0,
            "the brows lift as a sentence starts"
        );
        assert!(
            composed.issues.is_empty(),
            "speech card text fits and stays in the safe area: {:?}",
            composed.issues
        );
    }

    #[test]
    fn every_component_composes_in_every_format_without_layout_issues() {
        let typesetter = Typesetter::new().unwrap();
        for format in [
            VideoFormat::Vertical,
            VideoFormat::Horizontal,
            VideoFormat::X,
        ] {
            let canvas = Canvas::for_format(format);
            for (brief, narration) in sample_briefs() {
                let scene = narrated(brief, narration);
                let composed = compose_scene(&typesetter, &canvas, &scene, 1, 6);
                assert!(
                    composed.issues.is_empty(),
                    "{format:?} {}: {:?}",
                    scene.composition.kind_name(),
                    composed.issues
                );
                assert!(
                    composed.change_times.len() >= 2,
                    "{format:?} {} has motion",
                    scene.composition.kind_name()
                );
                let svg = composed
                    .graph
                    .svg(1.0, canvas.width, canvas.height, tokens::FONT_SANS);
                assert!(resvg::usvg::Tree::from_str(&svg, typesetter.options()).is_ok());
            }
        }
    }

    #[test]
    fn storyboard_objects_appear_when_their_word_is_spoken() {
        let typesetter = Typesetter::new().unwrap();
        let canvas = Canvas::for_format(VideoFormat::Vertical);
        let scene = narrated(
            "#fluxo Objetivo -> Decidir -> Agir -> Observar",
            "O agente recebe o objetivo, decide o proximo passo, age e observa.",
        );
        let composed = compose_scene(&typesetter, &canvas, &scene, 0, 1);
        let decide_at = scene.resolve_cue(&Cue::Word {
            word: "decide".into(),
            occurrence: 0,
        });
        assert!(decide_at > 0.5);
        let decidir: Vec<&Node> = composed
            .graph
            .nodes
            .iter()
            .filter(|node| node.object == "decidir")
            .collect();
        assert!(!decidir.is_empty());
        assert!(decidir
            .iter()
            .all(|node| node.props.opacity.eval(decide_at - 0.2) < 0.1));
        assert!(decidir
            .iter()
            .all(|node| node.props.opacity.eval(decide_at + 0.6) > 0.9));
        let edge: Vec<&Node> = composed
            .graph
            .nodes
            .iter()
            .filter(|node| node.object == edge_id("objetivo", "decidir"))
            .collect();
        assert_eq!(edge.len(), 1);
        assert!(edge[0].props.draw.eval(decide_at) < 0.5);
        assert!(edge[0].props.draw.eval(decide_at + 1.0) > 0.99);
    }

    #[test]
    fn overlapping_or_overflowing_text_is_reported_not_truncated() {
        let typesetter = Typesetter::new().unwrap();
        let canvas = Canvas::for_format(VideoFormat::X);
        let lines = (0..18)
            .map(|index| format!("linha_{index} = calcula(valor_{index})"))
            .collect::<Vec<_>>()
            .join("\n");
        let scene = narrated(
            &format!("#codigo python | demo.py\n{lines}"),
            "Dezoito linhas sao demais para esta tela.",
        );
        let composed = compose_scene(&typesetter, &canvas, &scene, 0, 1);
        assert!(
            composed
                .issues
                .iter()
                .any(|issue| issue.code == "code_overflow"),
            "{:?}",
            composed.issues
        );
        let svg = composed
            .graph
            .svg(5.0, canvas.width, canvas.height, tokens::FONT_SANS);
        assert!(!svg.contains('…'));
    }

    #[test]
    fn long_but_valid_texts_fit_in_every_format() {
        let typesetter = Typesetter::new().unwrap();
        let briefs: Vec<(String, String)> = vec![
            ("#pergunta Por que os modelos de linguagem alucinam quando não sabem a resposta correta para uma pergunta factual?".into(), "Por que alucinam? Vamos ver.".into()),
            ("#fluxo Usuário envia a pergunta [user] -> Modelo recupera documentos relevantes [search] -> Modelo gera a resposta final [brain] -> Verificador confere as fontes citadas [check] -> Resposta entregue ao usuário".into(), "O usuario envia, o modelo recupera, gera, o verificador confere e entrega.".into()),
            ("#comparacao Modelos pequenos rodando localmente: baratos e privados; latência baixa no dispositivo; qualidade menor em raciocínio | Modelos grandes na nuvem: mais capazes em tarefas complexas; custo por token alto; dependem de conexão".into(), "Modelos pequenos sao baratos. Modelos grandes sao mais capazes.".into()),
            ("#linha-do-tempo 1950: Turing propõe o jogo da imitação; 1997: Deep Blue vence Kasparov no xadrez; 2012: AlexNet revoluciona visão computacional; 2017: Transformers mudam o processamento de linguagem; 2022: ChatGPT populariza a IA generativa".into(), "Em 1950 Turing. Em 1997 Deep Blue. Em 2012 AlexNet. Em 2017 Transformers. Em 2022 ChatGPT.".into()),
            ("#transformacao Prompt gigante com todas as regras misturadas; Instruções repetidas em cada conversa; Contexto desperdiçado => Skill versionada e reutilizável entre projetos [skill]".into(), "O prompt gigante vira uma skill versionada.".into()),
            ("#causa Dados de treino desatualizados ou incompletos => O modelo preenche lacunas com padrões estatísticos => Respostas confiantes porém incorretas => Usuários perdem a confiança no sistema".into(), "Dados desatualizados, lacunas preenchidas, respostas incorretas, perda de confianca.".into()),
            ("#passos Defina claramente o objetivo da tarefa antes de começar; Escolha o modelo adequado ao orçamento disponível; Teste com exemplos reais e meça os resultados; Itere no prompt até atingir a qualidade desejada".into(), "Defina, escolha, teste e itere.".into()),
            ("#infografico Impacto da IA no trabalho em 2025 | Produtividade=40%: ganho médio em tarefas de escrita [chart]; Empresas=72%: já adotam alguma ferramenta de IA [check]; Empregos [shield]: novas funções surgem enquanto outras desaparecem".into(), "Produtividade sobe 40%, 72% das empresas adotam.".into()),
            ("#anotacao projeto/src/main.rs: ponto de entrada da aplicação que inicializa o servidor; projeto/Cargo.toml: dependências e metadados do pacote Rust; projeto/tests/integracao.rs: testes de integração ponta a ponta".into(), "O main inicializa, o Cargo lista dependencias, os testes cobrem.".into()),
            ("#arquitetura Frontend/Interface web em React; Frontend/Aplicativo móvel nativo; Backend/API REST de autenticação; Backend/Fila de processamento assíncrono; Interface web em React -> API REST de autenticação; Aplicativo móvel nativo -> Fila de processamento assíncrono".into(), "A interface fala com a API e o app com a fila.".into()),
            ("#personagem apresentador | explicar | Uma skill é como uma receita detalhada que o agente segue passo a passo sempre que encontra aquela tarefa específica".into(), "Uma skill e uma receita.".into()),
            ("#fluxo Coleta de dados brutos de várias fontes heterogêneas -> Limpeza e normalização dos registros duplicados -> Treinamento do modelo com validação cruzada -> Avaliação em conjunto de teste independente -> Implantação em produção com monitoramento contínuo -> Retreino periódico com dados novos".into(), "Coleta, limpeza, treinamento, avaliacao, implantacao e retreino.".into()),
            ("#linha-do-tempo 1943: McCulloch e Pitts descrevem o primeiro modelo matemático de neurônio artificial; 1958: Rosenblatt apresenta o perceptron como máquina capaz de aprender; 1986: Rumelhart populariza a retropropagação do erro em redes multicamadas; 2006: Hinton reacende o interesse em redes profundas pré-treinadas; 2012: AlexNet vence o ImageNet por larga margem; 2017: o artigo Attention Is All You Need apresenta o Transformer".into(), "Em 1943, 1958, 1986, 2006, 2012 e 2017.".into()),
            ("#personagem cientista | explicar | Quando treinamos uma rede neural, ajustamos milhões de pesos para reduzir o erro medido em exemplos que o modelo nunca viu antes".into(), "Treinar e ajustar pesos.".into()),
            ("#citacao A ciência é muito mais uma maneira de pensar do que um corpo de conhecimentos, e essa maneira de pensar exige ceticismo constante | Carl Sagan".into(), "A ciencia e uma maneira de pensar.".into()),
        ];
        for format in [
            VideoFormat::Vertical,
            VideoFormat::Horizontal,
            VideoFormat::X,
        ] {
            let canvas = Canvas::for_format(format);
            for (brief, narration) in &briefs {
                let scene = narrated(brief, narration);
                let composed = compose_scene(&typesetter, &canvas, &scene, 1, 6);
                assert!(
                    composed.issues.is_empty(),
                    "{format:?} {}: {:?}",
                    scene.composition.kind_name(),
                    composed.issues
                );
            }
        }
    }

    fn freeform_scene(elements: serde_json::Value, narration: &str) -> StoryboardScene {
        let mut scene = narrated("#pergunta Cena livre?", narration);
        scene.composition = serde_json::from_value(serde_json::json!({
            "kind": "freeform",
            "elements": elements,
        }))
        .unwrap();
        scene.animations.clear();
        scene.captions.emphasis.clear();
        framechester_core::planner::complete_scene(&mut scene);
        scene.validate().unwrap();
        scene
    }

    #[test]
    fn the_freeform_example_composes_in_every_format_and_reveals_on_the_spoken_word() {
        let typesetter = Typesetter::new().unwrap();
        let mut example: Storyboard =
            serde_json::from_str(include_str!("../../../examples/freeform.storyboard.json"))
                .unwrap();
        for scene in &mut example.scenes {
            framechester_core::planner::complete_scene(scene);
        }
        example.validate().unwrap();
        for format in [
            VideoFormat::Vertical,
            VideoFormat::Horizontal,
            VideoFormat::X,
        ] {
            example.format = format;
            let issues = layout_preflight(&example, &typesetter);
            assert!(issues.is_empty(), "{format:?}: {issues:?}");
        }
        let terra = example.scenes[0]
            .animations
            .iter()
            .find(|animation| animation.target == "terra")
            .unwrap();
        assert_eq!(
            terra.at,
            Cue::Word {
                word: "terra".into(),
                occurrence: 0
            },
            "an element enters when its text is spoken"
        );
        assert!(example.scenes[0]
            .animations
            .iter()
            .any(|animation| animation.target == "luz" && animation.motion == Motion::Draw));
    }

    #[test]
    fn freeform_text_that_does_not_fit_or_overlaps_is_reported() {
        let typesetter = Typesetter::new().unwrap();
        let canvas = Canvas::for_format(VideoFormat::Vertical);
        let cramped = freeform_scene(
            serde_json::json!([{ "id": "nota", "shape": { "kind": "text", "area": { "x": 0, "y": 0, "w": 8, "h": 3 }, "text": "Um texto longo demais para uma caixa minuscula" } }]),
            "Um texto longo demais.",
        );
        let composed = compose_scene(&typesetter, &canvas, &cramped, 1, 2);
        assert!(
            composed
                .issues
                .iter()
                .any(|issue| issue.code == "text_overflow"),
            "{:?}",
            composed.issues
        );
        let stacked = freeform_scene(
            serde_json::json!([
                { "id": "a", "shape": { "kind": "text", "area": { "x": 0, "y": 10, "w": 100, "h": 20 }, "text": "Primeira frase aqui" } },
                { "id": "b", "shape": { "kind": "text", "area": { "x": 0, "y": 10, "w": 100, "h": 20 }, "text": "Segunda frase aqui" } }
            ]),
            "Primeira frase e segunda frase.",
        );
        let composed = compose_scene(&typesetter, &canvas, &stacked, 1, 2);
        assert!(
            composed
                .issues
                .iter()
                .any(|issue| issue.code == "text_intersection"),
            "{:?}",
            composed.issues
        );
    }

    #[test]
    fn layout_preflight_finds_overflow_before_narration() {
        let typesetter = Typesetter::new().unwrap();
        let lines = (0..18)
            .map(|index| format!("linha_{index} = calcula(valor_{index})"))
            .collect::<Vec<_>>()
            .join("\n");
        let mut ok = narrated(
            "#passos Confira a amostra; Leia o intervalo",
            "Confira a amostra e leia o intervalo.",
        );
        let mut bad = narrated(
            &format!("#codigo python | demo.py\n{lines}"),
            "Dezoito linhas sao demais.",
        );
        for scene in [&mut ok, &mut bad] {
            scene.segments.clear();
            scene.duration_secs = 0.0;
        }
        bad.id = 2;
        let storyboard = |scenes: Vec<StoryboardScene>| Storyboard {
            version: SCHEMA_VERSION,
            title: "Preflight".into(),
            channel: "Canal".into(),
            format: VideoFormat::X,
            language: "pt-BR".into(),
            scenes,
            look: None,
            source_hash: None,
            identity: None,
        };
        assert!(layout_preflight(&storyboard(vec![ok.clone()]), &typesetter).is_empty());
        let storyboard = storyboard(vec![ok, bad]);
        let issues = layout_preflight(&storyboard, &typesetter);
        assert!(
            issues
                .iter()
                .any(|issue| issue.scene_id == 2 && issue.code == "code_overflow"),
            "{issues:?}"
        );
    }

    #[test]
    fn consecutive_scenes_enter_differently() {
        let kinds: Vec<Entrance> = (1..=3).map(Entrance::for_scene).collect();
        assert_ne!(kinds[0], kinds[1]);
        assert_ne!(kinds[1], kinds[2]);
        assert_ne!(kinds[0], kinds[2]);
    }

    #[test]
    fn vertical_text_stays_above_the_platform_overlay() {
        // Shorts/Reels/TikTok draw title, handle and audio over everything below 1330 px.
        let canvas = Canvas::for_format(VideoFormat::Vertical);
        assert!(canvas.content.bottom() <= 1330.0);
        assert!(canvas.captions.bottom() <= 1330.0);
        assert!(canvas.content.y >= 168.0);
    }

    #[test]
    fn every_component_composes_in_every_look_and_format() {
        let typesetter = Typesetter::new().unwrap();
        for look in Look::ALL {
            for format in [
                VideoFormat::Vertical,
                VideoFormat::Horizontal,
                VideoFormat::X,
            ] {
                let canvas = Canvas::for_storyboard(format, look);
                for (brief, narration) in sample_briefs() {
                    let scene = narrated(brief, narration);
                    let composed = compose_scene(&typesetter, &canvas, &scene, 1, 6);
                    assert!(
                        composed.issues.is_empty(),
                        "{look:?} {format:?} {}: {:?}",
                        scene.composition.kind_name(),
                        composed.issues
                    );
                    let svg =
                        composed
                            .graph
                            .svg(2.0, canvas.width, canvas.height, tokens::FONT_SANS);
                    assert!(
                        !svg.contains("'@") && !svg.contains("\"@"),
                        "{look:?} {format:?} {}: unresolved paint",
                        scene.composition.kind_name()
                    );
                    assert!(resvg::usvg::Tree::from_str(&svg, typesetter.options()).is_ok());
                }
            }
        }
    }

    fn seam(transition: Transition) -> (Composed, f32) {
        let typesetter = Typesetter::new().unwrap();
        let canvas = Canvas::for_format(VideoFormat::Horizontal);
        let first = narrated(
            "#fluxo Objetivo -> Decidir -> Agir -> Observar",
            "O agente recebe o objetivo, decide, age e observa.",
        );
        let mut second = narrated("#pergunta E se a skill decidir?", "E se a skill decidir?");
        second.id = 2;
        second.transition = transition;
        second.start_secs = first.duration_secs;
        let seam = first.duration_secs;
        (
            Composed {
                canvas,
                scenes: vec![
                    compose_scene(&typesetter, &canvas, &first, 1, 3),
                    compose_scene(&typesetter, &canvas, &second, 2, 3),
                ],
            },
            seam,
        )
    }

    #[test]
    fn the_focal_object_is_the_last_card_to_enter() {
        let (composed, _) = seam(Transition::Iris);
        let focal = composed.scenes[0]
            .focal
            .as_ref()
            .expect("a flow has a focal card");
        let observar = composed.scenes[0].graph.object_bbox("observar").unwrap();
        assert!(
            focal.rect.intersects(&observar),
            "{focal:?} vs {observar:?}"
        );
        assert_eq!(
            focal
                .paint
                .as_deref()
                .map(|paint| paint.starts_with("@fill-top-")),
            Some(true)
        );
    }

    #[test]
    fn caused_transitions_start_from_what_is_on_screen() {
        // Iris: the clip circle is centred on the outgoing focal object.
        let (composed, at) = seam(Transition::Iris);
        let focal = composed.scenes[0].focal.clone().unwrap();
        let svg = frame_svg(&composed, at + 0.2, tokens::FONT_SANS);
        assert!(
            svg.contains(&format!(
                "<circle cx='{:.1}' cy='{:.1}'",
                focal.rect.cx(),
                focal.rect.cy()
            )),
            "iris opens from the focal point"
        );
        // Expand: the focal card's own colour floods the frame.
        let (composed, at) = seam(Transition::Expand);
        let theme = crate::look::theme(composed.canvas.look);
        let paint = composed.scenes[0].focal.as_ref().unwrap().paint.as_deref();
        let flood = theme.flood(paint);
        assert_eq!(
            Some(flood),
            paint.map(|paint| theme.paint(paint)),
            "the card's own colour"
        );
        let svg = frame_svg(&composed, at + 0.45, tokens::FONT_SANS);
        assert!(
            svg.contains(&format!("fill='{flood}'")),
            "expand floods with the card"
        );
        // Blur swap: content blurs; the ground is drawn once and never fades.
        let (composed, at) = seam(Transition::BlurSwap);
        let svg = frame_svg(&composed, at + 0.1, tokens::FONT_SANS);
        assert!(svg.contains("feGaussianBlur"));
        assert_eq!(svg.matches("id='fc-bg'").count(), 1);
        // Dip cut: three darkened frames of the outgoing scene, then the hard cut.
        let (composed, at) = seam(Transition::DipCut);
        assert!(frame_svg(&composed, at + 0.05, tokens::FONT_SANS).contains("opacity='0.4'"));
        assert!(!frame_svg(&composed, at + 0.12, tokens::FONT_SANS)
            .contains("fill='#000000' opacity='0.4'"));
        for transition in [
            Transition::Expand,
            Transition::Iris,
            Transition::BlurSwap,
            Transition::DipCut,
        ] {
            let (composed, at) = seam(transition);
            let svg = frame_svg(
                &composed,
                at + transition_secs(transition) * 0.5,
                tokens::FONT_SANS,
            );
            assert!(
                resvg::usvg::Tree::from_str(&svg, Typesetter::new().unwrap().options()).is_ok()
            );
        }
    }

    fn sample_film(format: VideoFormat, look: Look) -> (Storyboard, Composed) {
        let typesetter = Typesetter::new().unwrap();
        let canvas = Canvas::for_storyboard(format, look);
        let mut scenes = Vec::new();
        let mut start = 0.0;
        for (index, (brief, narration)) in sample_briefs().into_iter().enumerate() {
            let mut scene = narrated(brief, narration);
            scene.id = index as u32 + 1;
            scene.start_secs = start;
            start += scene.duration_secs;
            scenes.push(scene);
        }
        let storyboard = Storyboard {
            version: SCHEMA_VERSION,
            title: "Filme".into(),
            channel: "Canal".into(),
            format,
            language: "pt-BR".into(),
            scenes,
            look: Some(look),
            identity: None,
            source_hash: None,
        };
        let total = storyboard.scenes.len();
        let composed = Composed {
            canvas,
            scenes: storyboard
                .scenes
                .iter()
                .enumerate()
                .map(|(index, scene)| compose_scene(&typesetter, &canvas, scene, index, total))
                .collect(),
        };
        (storyboard, composed)
    }

    #[test]
    fn every_layout_meets_the_measured_craft_in_every_look_and_format() {
        for look in Look::ALL {
            for format in [
                VideoFormat::Vertical,
                VideoFormat::Horizontal,
                VideoFormat::X,
            ] {
                let (storyboard, composed) = sample_film(format, look);
                for check in crate::qa::craft_checks(&storyboard, &composed) {
                    assert_eq!(
                        check.status,
                        framechester_core::domain::QaStatus::Pass,
                        "{look:?} {format:?} {}: {}",
                        check.id,
                        check.detail
                    );
                }
            }
        }
    }

    #[test]
    fn the_craft_guards_catch_what_the_engine_cannot_fix() {
        use framechester_core::domain::QaStatus;
        let (mut storyboard, mut composed) = sample_film(VideoFormat::Horizontal, Look::Noite);
        // A scene too short for its own text: nothing can make it readable.
        storyboard.scenes[2].duration_secs = 0.6;
        composed.scenes[2].duration_secs = 0.6;
        // Text drawn under the floor by hand (not through `Ctx::fit`).
        composed.scenes[0]
            .graph
            .nodes
            .push(Typesetter::new().unwrap().line(
                "tiny",
                "letra miuda",
                200.0,
                300.0,
                12.0,
                400,
                tokens::FONT_SANS,
                tokens::INK,
                Anchor::Start,
            ));
        let checks = crate::qa::craft_checks(&storyboard, &composed);
        let status = |id: &str| checks.iter().find(|check| check.id == id).unwrap().status;
        assert_eq!(status("text_below_floor"), QaStatus::Fail);
        assert_eq!(status("line_unread"), QaStatus::NeedsHuman);
    }

    #[test]
    fn words_sharpen_in_from_a_blur_and_land_dead_sharp() {
        let typesetter = Typesetter::new().unwrap();
        let canvas = Canvas::for_format(VideoFormat::Vertical);
        let mut scene = narrated(
            "#pergunta Skill ou agente: qual a diferença na prática?",
            "Skill ou agente: qual a diferenca na pratica? Vamos ver.",
        );
        // Scene 1 enters with the no-translate entrance (`Entrance::for_scene`).
        scene.id = 1;
        assert_eq!(Entrance::for_scene(1), Entrance::Fade);
        let composed = compose_scene(&typesetter, &canvas, &scene, 1, 3);
        let word = composed
            .graph
            .nodes
            .iter()
            .filter(|node| node.object == "title" && node.is_text())
            .nth(3)
            .unwrap();
        let entry = (0..200)
            .map(|step| step as f32 * 0.01)
            .find(|t| word.props.opacity.eval(*t) > 0.0)
            .unwrap();
        assert!(word.props.blur.eval(entry + 0.01) > 2.0, "arrives blurred");
        assert_eq!(word.props.blur.eval(entry + 0.2), 0.0, "lands sharp");
        assert_eq!(word.props.dx.eval(entry + 0.05), 0.0, "no translate");
        assert_eq!(word.props.dy.eval(entry + 0.05), 0.0, "no translate");
        let during =
            composed
                .graph
                .svg(entry + 0.03, canvas.width, canvas.height, tokens::FONT_SANS);
        assert!(during.contains("feGaussianBlur"));
        let landed = composed.graph.svg(
            scene.duration_secs,
            canvas.width,
            canvas.height,
            tokens::FONT_SANS,
        );
        assert!(
            !landed.contains("feGaussianBlur"),
            "no filter once everything landed"
        );
    }

    #[test]
    fn a_morph_reshapes_the_focal_card_into_the_next_opening_card() {
        let typesetter = Typesetter::new().unwrap();
        let canvas = Canvas::for_format(VideoFormat::Horizontal);
        let first = narrated(
            "#fluxo Objetivo -> Decidir -> Agir -> Observar",
            "O agente recebe o objetivo, decide, age e observa.",
        );
        let mut second = narrated(
            "#passos Confira a amostra; Leia o intervalo; Veja as condicoes",
            "Confira a amostra, leia o intervalo e veja as condicoes.",
        );
        second.id = 2;
        second.transition = Transition::Morph;
        second.start_secs = first.duration_secs;
        let composed = Composed {
            canvas,
            scenes: vec![
                compose_scene(&typesetter, &canvas, &first, 1, 3),
                compose_scene(&typesetter, &canvas, &second, 2, 3),
            ],
        };
        let from = composed.scenes[0].focal.clone().unwrap().rect;
        let to = composed.scenes[1].opening.clone().unwrap().rect;
        let seam = first.duration_secs;
        let shell_x = |t: f32| {
            let svg = frame_svg(&composed, t, tokens::FONT_SANS);
            let marker = "<rect id='fc-morph' x='";
            let at = svg.find(marker).unwrap() + marker.len();
            svg[at..]
                .split('\'')
                .next()
                .unwrap()
                .parse::<f32>()
                .unwrap()
        };
        // It starts on the outgoing card and travels to the incoming one.
        assert!((shell_x(seam) - from.x).abs() < 1.0);
        assert!((shell_x(seam + 0.38) - to.x).abs() < 25.0);
        // Without a card on the incoming side it hands over as a blur swap.
        let mut plain = composed.clone();
        plain.scenes[1].opening = None;
        assert!(frame_svg(&plain, seam + 0.1, tokens::FONT_SANS).contains("feGaussianBlur"));
    }

    #[test]
    fn a_flood_keeps_the_shared_hero_on_screen_while_the_ground_floods() {
        let typesetter = Typesetter::new().unwrap();
        let canvas = Canvas::for_format(VideoFormat::Horizontal);
        let first = narrated(
            "#fluxo Objetivo -> Decidir -> Agir -> Observar",
            "O agente recebe o objetivo, decide, age e observa.",
        );
        let mut second = narrated(
            "#passos Observar; Ajustar o plano; Repetir",
            "Observar o resultado, ajustar o plano e repetir.",
        );
        second.id = 2;
        second.transition = Transition::Flood;
        second.start_secs = first.duration_secs;
        let composed = Composed {
            canvas,
            scenes: vec![
                compose_scene(&typesetter, &canvas, &first, 1, 3),
                compose_scene(&typesetter, &canvas, &second, 2, 3),
            ],
        };
        assert!(composed.scenes[0]
            .followable
            .contains(&"observar".to_string()));
        let seam = first.duration_secs;
        let span = transition_secs(Transition::Flood);
        for fraction in [0.05f32, 0.3, 0.55, 0.8, 0.95] {
            let svg = frame_svg(&composed, seam + span * fraction, tokens::FONT_SANS);
            assert!(
                svg.contains(">Observar<"),
                "the hero is on screen at {fraction}"
            );
        }
        let mid = frame_svg(&composed, seam + span * 0.5, tokens::FONT_SANS);
        let wash = mid.find("id='fc-flood'").expect("the ground floods");
        let opacity: f32 = mid[wash..]
            .split("opacity='")
            .nth(1)
            .unwrap()
            .split('\'')
            .next()
            .unwrap()
            .parse()
            .unwrap();
        assert!(opacity > 0.2, "{opacity}");
        // The rest of the old scene has left by then.
        assert!(!mid.contains(">Objetivo<"));
        // Without a shared object a flood hands over as a blur swap.
        let mut alone = composed.clone();
        alone.scenes[1].followable.clear();
        assert!(frame_svg(&alone, seam + 0.1, tokens::FONT_SANS).contains("feGaussianBlur"));
    }
}
