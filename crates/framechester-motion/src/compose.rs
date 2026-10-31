//! From storyboard to scene graphs: lays out each scene's composition for the canvas,
//! applies the storyboard animations at their resolved times, auto-animates edges, adds
//! captions and records layout issues for QA.
use crate::anim::Track;
use crate::captions;
use crate::components::{self, edge_id, Ctx, LayoutIssue, Severity};
use crate::format::{Canvas, Rect};
use crate::scene::{Anchor, Camera, Graph, Node, Shape, Z_CAPTIONS};
use crate::text::Typesetter;
use crate::tokens;
use framechester_core::error::Result;
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
    let (heading_nodes, bottom) = ctx.fitted(
        "heading",
        &scene.concept,
        heading_area,
        scale.heading * 0.72,
        scale.body * 0.9,
        tokens::WEIGHT_BOLD,
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
) -> Vec<Node> {
    match &scene.composition {
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
        Composition::Character {
            character,
            pose,
            text,
        } => components::character::build(ctx, area, *character, *pose, text, index % 2 == 1),
    }
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
                    *time += stagger as f32 * tokens::STAGGER;
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
            for node in nodes_of(graph, &animation.target) {
                node.props
                    .reveal(time, duration, direction, animation.easing);
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
    for (edge, at) in edges {
        for node in nodes_of(graph, &edge) {
            node.props.draw(at, 0.45, Easing::EaseOut);
            node.props.hidden_until(at);
        }
    }
    // Annotation notes follow their item.
    if let Composition::Annotation { objects, .. } = &scene.composition {
        for object in objects {
            let note = format!("note:{}", object.id);
            let at = entries.get(&object.id).copied().unwrap_or(0.0) + 0.3;
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

pub fn compose_scene(
    typesetter: &Typesetter,
    canvas: &Canvas,
    scene: &StoryboardScene,
    index: usize,
    total: usize,
) -> ComposedScene {
    let mut ctx = Ctx::new(canvas, typesetter, scene.id);
    let mut graph = Graph::default();
    // A title or a character speaks for itself: no heading bar above it.
    let is_title = matches!(
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
    let component = build_component(&mut ctx, scene, area, index);
    graph.extend(centre_vertically(component, area));
    graph.extend(captions::build(&mut ctx, scene));
    let mut entries: HashMap<String, f32> = HashMap::new();
    let mut animated_objects = Vec::new();
    let hook = index == 0;
    for (time, animation) in resolve_times(scene, hook) {
        if !animated_objects.contains(&animation.target) {
            animated_objects.push(animation.target.clone());
        }
        apply_animation(&mut graph, scene, time, animation, canvas, &mut entries);
    }
    auto_animate_edges(&mut graph, scene, &entries, hook);
    if matches!(scene.composition, Composition::Character { .. }) {
        components::character::animate(&mut graph.nodes, scene, canvas.motion_scale(), hook);
    }
    // Every scene gets a slow camera move, cycling so consecutive scenes differ.
    graph.camera = Some((
        Camera::for_scene(index),
        scene.duration_secs.max(1.0),
        (canvas.width as f32, canvas.height as f32),
    ));
    check_layout(&mut ctx, &graph);
    let change_times = graph.change_times();
    ComposedScene {
        id: scene.id,
        start_secs: scene.start_secs,
        duration_secs: scene.duration_secs,
        transition: scene.transition,
        graph,
        issues: ctx.issues,
        change_times,
        animated_objects,
    }
}

/// Composes every scene for the storyboard's format. Scenes need real timing
/// (`duration_secs > 0`) for cues to resolve; without it, cues fall back to the start.
pub fn compose(storyboard: &Storyboard, typesetter: &Typesetter) -> Result<Composed> {
    storyboard.validate()?;
    let canvas = Canvas::for_format(storyboard.format);
    let total = storyboard.scenes.len();
    let scenes = storyboard
        .scenes
        .iter()
        .enumerate()
        .map(|(index, scene)| compose_scene(typesetter, &canvas, scene, index, total))
        .collect();
    Ok(Composed { canvas, scenes })
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
        "<svg xmlns='http://www.w3.org/2000/svg' width='{width}' height='{height}' viewBox='0 0 {width} {height}'><rect width='100%' height='100%' fill='{}'/><g font-family='{}'>",
        tokens::BACKGROUND,
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
            (local / TRANSITION_SECS).clamp(0.0, 1.0)
        } else {
            1.0
        };
        if progress < 1.0 {
            let previous = &composed.scenes[index - 1];
            let eased = crate::anim::ease(Easing::EaseInOut, progress);
            let previous_t = previous.duration_secs;
            match scene.transition {
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
    svg.push_str("</g></svg>");
    svg
}

#[cfg(test)]
mod tests {
    use super::*;
    use framechester_core::domain::Scene;
    use framechester_core::narration::{assemble_scene, segment_narration, SegmentAudio};
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
            ("#codigo markdown | SKILL.md\n---\nname: revisar-pr\ndescription: Revisa PRs\n---\n1. Leia o diff\n2. Rode os testes", "O arquivo tem nome, descricao e os passos."),
            ("#transformacao Prompt gigante; Regras soltas => Skill versionada [skill]", "Um prompt gigante e regras soltas viram uma skill versionada."),
            ("#anotacao revisar-pr/SKILL.md: instrucoes e metadados; revisar-pr/scripts/check.py: codigo opcional; revisar-pr/exemplos: casos reais", "A pasta tem o SKILL.md com instrucoes, scripts opcionais e exemplos."),
            ("#infografico O que muda | Tokens=40%: do contexto [chart]; Passos=3: etapas fixas [check]; Erros [shield]: menos retrabalho", "Caem para 40% os tokens, sao 3 passos fixos e menos erros."),
            ("#causa Sem skill => O agente improvisa => Resultados variam => Mais retrabalho", "Sem skill, o agente improvisa, os resultados variam e ha mais retrabalho."),
            ("#personagem apresentador | explicar | Uma skill é uma receita que o agente segue", "Uma skill e uma receita. O agente segue os passos dela."),
            ("#personagem dev | apontar", "O arquivo fica na pasta do projeto, versionado com o codigo."),
            ("#personagem cientista | pensar | Dá para medir a diferença?", "Da para medir a diferenca? Vamos testar duas vezes."),
            ("#personagem robo | comemorar | Mesma tarefa, metade dos tokens", "Mesma tarefa, com menos tokens no contexto."),
        ]
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
            max_scale(&settled) < 1.02,
            "the punch-in has settled after 0.5 s; only the slow camera remains"
        );
        let storyboard = Storyboard {
            version: SCHEMA_VERSION,
            title: "Gancho".into(),
            channel: "Canal".into(),
            format: VideoFormat::Vertical,
            language: "pt-BR".into(),
            scenes: vec![first, second],
            source_hash: None,
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
}
