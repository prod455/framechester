//! Character scene: a flat vector presenter beside a speech card. The figure is drawn in a
//! 110 × 160 unit box and scaled into the layout; nothing is loaded from disk. While the
//! narration plays the mouth moves, the eyes blink and the gesturing arm bobs.
use super::Ctx;
use crate::anim::Track;
use crate::format::Rect;
use crate::scene::{Anchor, Node, Shape};
use crate::tokens;
use framechester_core::narration::syllables;
use framechester_core::storyboard::{Character, Easing, Pose, StoryboardScene};

pub const BODY: &str = "character";
pub const EYES: &str = "character:eyes";
pub const MOUTH: &str = "character:mouth";
pub const ARM: &str = "character:arm";
pub const SPEECH: &str = "speech";

const UNIT_W: f32 = 110.0;
const UNIT_H: f32 = 160.0;
const SKIN: &str = "#C98B5E";
const HAIR: &str = "#2A1F1A";
const LINE: &str = "#05080E";

struct Look {
    top: &'static str,
    sleeve: &'static str,
}

fn look(character: Character) -> Look {
    match character {
        Character::Presenter => Look {
            top: tokens::PRIMARY,
            sleeve: tokens::PRIMARY,
        },
        Character::Developer => Look {
            top: tokens::SECONDARY,
            sleeve: tokens::SECONDARY,
        },
        Character::Scientist => Look {
            top: tokens::INK,
            sleeve: tokens::INK,
        },
        Character::Robot => Look {
            top: tokens::SURFACE_STRONG,
            sleeve: tokens::MUTED,
        },
    }
}

/// Maps the unit box into a figure rectangle.
struct Figure {
    x: f32,
    y: f32,
    k: f32,
}

impl Figure {
    fn fit(area: Rect) -> Self {
        let k = (area.w / UNIT_W).min(area.h / UNIT_H);
        Self {
            x: area.cx() - UNIT_W * k / 2.0,
            y: area.bottom() - UNIT_H * k,
            k,
        }
    }
    fn p(&self, x: f32, y: f32) -> (f32, f32) {
        (self.x + x * self.k, self.y + y * self.k)
    }
    fn rect(&self, x: f32, y: f32, w: f32, h: f32) -> Rect {
        let (px, py) = self.p(x, y);
        Rect::new(px, py, w * self.k, h * self.k)
    }
    fn polyline(&self, points: &[(f32, f32)]) -> (String, f32) {
        let mut d = String::new();
        let mut length = 0.0;
        for (index, &(x, y)) in points.iter().enumerate() {
            let (px, py) = self.p(x, y);
            d.push_str(&format!(
                "{}{px:.1} {py:.1} ",
                if index == 0 { "M" } else { "L" }
            ));
            if index > 0 {
                let (qx, qy) = self.p(points[index - 1].0, points[index - 1].1);
                length += ((px - qx).powi(2) + (py - qy).powi(2)).sqrt();
            }
        }
        (d.trim_end().to_string(), length)
    }
    fn block(&self, object: &str, rect: (f32, f32, f32, f32), rx: f32, fill: &str) -> Node {
        Node::new(
            object,
            Shape::Rect {
                rect: self.rect(rect.0, rect.1, rect.2, rect.3),
                rx: rx * self.k,
                fill: fill.into(),
                stroke: None,
            },
        )
        .decorative()
    }
    fn dot(&self, object: &str, x: f32, y: f32, r: f32, fill: &str) -> Node {
        let (cx, cy) = self.p(x, y);
        Node::new(
            object,
            Shape::Circle {
                cx,
                cy,
                r: r * self.k,
                fill: fill.into(),
                stroke: None,
            },
        )
        .decorative()
    }
    fn stroke(&self, object: &str, points: &[(f32, f32)], width: f32, colour: &str) -> Node {
        let (d, length) = self.polyline(points);
        Node::new(
            object,
            Shape::Path {
                d,
                stroke: colour.into(),
                width: width * self.k,
                length,
                fill: None,
                dashed: false,
            },
        )
        .decorative()
    }
}

/// Arms for a pose: (object, shoulder → elbow → hand) for each arm drawn.
fn arms(pose: Pose) -> Vec<(&'static str, Vec<(f32, f32)>)> {
    let rest = (BODY, vec![(30.0, 90.0), (24.0, 116.0), (26.0, 138.0)]);
    match pose {
        Pose::Explain => vec![
            rest,
            (ARM, vec![(80.0, 90.0), (94.0, 112.0), (104.0, 98.0)]),
        ],
        Pose::Point => vec![rest, (ARM, vec![(80.0, 90.0), (94.0, 78.0), (106.0, 64.0)])],
        Pose::Think => vec![rest, (ARM, vec![(80.0, 90.0), (84.0, 112.0), (62.0, 76.0)])],
        Pose::Celebrate => vec![
            (ARM, vec![(30.0, 90.0), (16.0, 68.0), (12.0, 44.0)]),
            (ARM, vec![(80.0, 90.0), (94.0, 68.0), (98.0, 44.0)]),
        ],
    }
}

fn figure_nodes(figure: &Figure, character: Character, pose: Pose) -> Vec<Node> {
    let look = look(character);
    let robot = character == Character::Robot;
    let skin = if robot { tokens::MUTED } else { SKIN };
    let mut nodes = Vec::new();
    // Torso and neck.
    nodes.push(figure.block(BODY, (32.0, 80.0, 46.0, 80.0), 16.0, look.top));
    nodes.push(figure.block(BODY, (49.0, 70.0, 12.0, 14.0), 3.0, skin));
    match character {
        Character::Scientist => {
            nodes.push(figure.stroke(
                BODY,
                &[(42.0, 82.0), (55.0, 112.0), (68.0, 82.0)],
                2.5,
                tokens::MUTED,
            ));
            nodes.push(figure.block(BODY, (52.0, 90.0, 6.0, 22.0), 2.0, tokens::ACCENT));
        }
        Character::Developer => {
            nodes.push(figure.stroke(BODY, &[(48.0, 84.0), (48.0, 104.0)], 2.0, tokens::INK));
            nodes.push(figure.stroke(BODY, &[(62.0, 84.0), (62.0, 104.0)], 2.0, tokens::INK));
        }
        Character::Robot => {
            nodes.push(figure.block(
                BODY,
                (43.0, 96.0, 24.0, 18.0),
                4.0,
                tokens::BACKGROUND_RAISED,
            ));
            nodes.push(figure.dot(BODY, 55.0, 105.0, 4.0, tokens::SECONDARY));
        }
        Character::Presenter => {
            nodes.push(figure.stroke(
                BODY,
                &[(46.0, 82.0), (55.0, 94.0), (64.0, 82.0)],
                2.5,
                tokens::INK,
            ));
        }
    }
    // Arms over the torso; hands are dots at the ends.
    for (object, points) in arms(pose) {
        nodes.push(figure.stroke(object, &points, 10.0, look.sleeve).with_z(1));
        let (hx, hy) = points[points.len() - 1];
        nodes.push(figure.dot(object, hx, hy, 6.0, skin).with_z(1));
    }
    // Head.
    if robot {
        nodes.push(figure.stroke(BODY, &[(55.0, 26.0), (55.0, 14.0)], 2.5, tokens::MUTED));
        nodes.push(figure.dot(BODY, 55.0, 12.0, 4.0, tokens::ACCENT));
        nodes.push(figure.block(BODY, (31.0, 26.0, 48.0, 46.0), 10.0, tokens::SURFACE_STRONG));
        nodes.push(figure.block(
            BODY,
            (36.0, 34.0, 38.0, 30.0),
            7.0,
            tokens::BACKGROUND_RAISED,
        ));
    } else {
        nodes.push(figure.dot(BODY, 55.0, 48.0, 24.0, skin));
        let hair = if character == Character::Scientist {
            tokens::INK_SOFT
        } else {
            HAIR
        };
        nodes.push(figure.stroke(
            BODY,
            &[
                (32.0, 46.0),
                (36.0, 30.0),
                (55.0, 22.0),
                (74.0, 30.0),
                (78.0, 46.0),
            ],
            9.0,
            hair,
        ));
        if character == Character::Developer {
            for x in [40.0, 58.0] {
                nodes.push(
                    Node::new(
                        BODY,
                        Shape::Rect {
                            rect: figure.rect(x, 42.0, 13.0, 10.0),
                            rx: 3.0 * figure.k,
                            fill: "none".into(),
                            stroke: Some((LINE.into(), 1.8 * figure.k)),
                        },
                    )
                    .decorative()
                    .with_z(2),
                );
            }
        }
    }
    // Eyes and mouth animate on their own objects.
    let (eye, mouth) = if robot {
        (tokens::SECONDARY, tokens::SECONDARY)
    } else {
        (LINE, LINE)
    };
    for x in [44.5, 62.5] {
        nodes.push(figure.block(EYES, (x, 44.0, 4.0, 7.0), 2.0, eye).with_z(3));
    }
    nodes.push(
        figure
            .block(MOUTH, (50.0, 60.0, 10.0, 3.0), 1.5, mouth)
            .with_z(3),
    );
    nodes
}

/// The figure alone, scaled to fit `area` and standing on its bottom edge.
pub fn figure(area: Rect, character: Character, pose: Pose) -> Vec<Node> {
    figure_nodes(&Figure::fit(area), character, pose)
}

pub fn build(
    ctx: &mut Ctx<'_>,
    area: Rect,
    character: Character,
    pose: Pose,
    text: &str,
) -> Vec<Node> {
    let gap = ctx.canvas.gap;
    let (speech, stage) = if ctx.canvas.vertical {
        let speech_h = area.h * 0.34;
        (
            Rect::new(area.x, area.y, area.w, speech_h),
            Rect::new(
                area.x,
                area.y + speech_h + gap,
                area.w,
                area.h - speech_h - gap,
            ),
        )
    } else {
        let stage_w = area.w * 0.36;
        (
            Rect::new(
                area.x + stage_w + gap * 2.0,
                area.y + area.h * 0.1,
                area.w - stage_w - gap * 2.0,
                area.h * 0.62,
            ),
            Rect::new(area.x, area.y, stage_w, area.h),
        )
    };
    let figure = Figure::fit(stage);
    let mut nodes = figure_nodes(&figure, character, pose);
    // Speech card with a tail towards the character's head.
    nodes.push(ctx.card(SPEECH, speech, framechester_core::storyboard::Role::Neutral));
    let (head_x, head_y) = figure.p(55.0, 30.0);
    let tail = if ctx.canvas.vertical {
        let base = speech.bottom();
        format!(
            "M{:.1} {base:.1} L{:.1} {:.1} L{:.1} {base:.1} Z",
            head_x - gap * 0.6,
            head_x,
            base + gap * 0.9,
            head_x + gap * 0.6
        )
    } else {
        let base = speech.x;
        let y = head_y.clamp(speech.y + gap, speech.bottom() - gap);
        format!(
            "M{base:.1} {:.1} L{:.1} {y:.1} L{base:.1} {:.1} Z",
            y - gap * 0.6,
            base - gap * 0.9,
            y + gap * 0.6
        )
    };
    nodes.push(
        Node::new(
            SPEECH,
            Shape::Path {
                d: tail,
                stroke: tokens::RULE.into(),
                width: ctx.canvas.stroke,
                length: gap * 3.0,
                fill: Some(tokens::SURFACE.into()),
                dashed: false,
            },
        )
        .with_z(-1)
        .decorative(),
    );
    let scale = ctx.canvas.type_scale;
    let (text_nodes, _) = ctx.fitted(
        SPEECH,
        text,
        speech.inset(gap),
        scale.heading,
        scale.body,
        tokens::WEIGHT_BOLD,
        tokens::INK,
        Anchor::Start,
        0.5,
    );
    nodes.extend(text_nodes);
    nodes
}

/// Idle life of the character: it rises in, blinks every few seconds, moves the mouth
/// while a narration segment plays and bobs the gesturing arm.
pub fn animate(nodes: &mut [Node], scene: &StoryboardScene, motion_scale: f32) {
    let end = scene.duration_secs.max(1.0);
    for node in nodes
        .iter_mut()
        .filter(|node| node.object.starts_with(BODY))
    {
        node.props
            .reveal(0.0, 0.5, (0.0, 40.0 * motion_scale), Easing::EaseOut);
    }
    // Rectangles scale around their own centre: eyes close and the mouth opens in place.
    for node in nodes.iter_mut().filter(|node| node.object == EYES) {
        blink(&mut node.props.sy, end);
    }
    for node in nodes.iter_mut().filter(|node| node.object == MOUTH) {
        talk(&mut node.props.sy, scene);
    }
    for node in nodes.iter_mut().filter(|node| node.object == ARM) {
        let mut t = 0.6;
        let mut up = true;
        while t < end {
            node.props.dy.key(
                t,
                if up { -6.0 * motion_scale } else { 0.0 },
                Easing::EaseInOut,
            );
            up = !up;
            t += 0.7;
        }
    }
}

fn blink(track: &mut Track, end: f32) {
    let mut t = 1.4;
    while t + 0.2 < end {
        track.key(t, 1.0, Easing::Linear);
        track.key(t + 0.08, 0.1, Easing::EaseIn);
        track.key(t + 0.18, 1.0, Easing::EaseOut);
        t += 3.1;
    }
}

/// The mouth opens once per syllable of each timed word and rests in the pauses, so it
/// follows the same timing as the captions.
fn talk(track: &mut Track, scene: &StoryboardScene) {
    const OPENINGS: [f32; 4] = [1.7, 1.2, 1.9, 1.4];
    let words: Vec<_> = scene
        .segments
        .iter()
        .flat_map(|segment| &segment.words)
        .collect();
    let mut step = 0usize;
    for (index, word) in words.iter().enumerate() {
        let count = syllables(&word.text);
        let beat = (word.end_secs - word.start_secs).max(0.05) / count as f32;
        for syllable in 0..count {
            let at = word.start_secs + syllable as f32 * beat;
            track.key(at, 0.5, Easing::EaseInOut);
            track.key(
                at + beat * 0.5,
                OPENINGS[step % OPENINGS.len()],
                Easing::EaseInOut,
            );
            step += 1;
        }
        track.key(word.end_secs, 0.6, Easing::EaseInOut);
        let next = words
            .get(index + 1)
            .map_or(f32::MAX, |next| next.start_secs);
        if next - word.end_secs > 0.16 {
            track.key(word.end_secs + 0.1, 1.0, Easing::EaseOut);
        }
    }
}
