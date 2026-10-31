//! Character scene: a flat vector presenter beside a speech card. The figure is drawn in a
//! 110 × 160 unit box and scaled into the layout; nothing is loaded from disk. While the
//! narration plays the mouth moves, the eyes blink and the gesturing arm bobs.
use super::Ctx;
use crate::anim::Track;
use crate::format::Rect;
use crate::scene::{Anchor, Node, Shape};
use crate::tokens;
use framechester_core::narration::syllables;
use framechester_core::persona::{Beard, Colour, Hair, HairColour, Outfit, Persona, Prop, Skin};
use framechester_core::storyboard::{Character, Easing, Pose, StoryboardScene};

pub const BODY: &str = "character";
pub const EYES: &str = "character:eyes";
pub const MOUTH: &str = "character:mouth";
pub const ARM: &str = "character:arm";
pub const BROWS: &str = "character:brows";
pub const PROP: &str = "character:prop";
pub const SPEECH: &str = "speech";

const UNIT_W: f32 = 110.0;
const UNIT_H: f32 = 160.0;
const SKIN: &str = "#C98B5E";
const HAIR: &str = "#2A1F1A";
const LINE: &str = "#05080E";

/// Everything the drawing needs, from a preset character or a described persona.
struct Look {
    robot: bool,
    skin: &'static str,
    top: &'static str,
    sleeve: &'static str,
    outfit: Outfit,
    hair: Hair,
    hair_colour: &'static str,
    beard: Beard,
    beard_colour: &'static str,
    brow: &'static str,
    glasses: bool,
    laurel: bool,
    number: Option<u8>,
    prop: Prop,
}

fn preset(character: Character) -> Look {
    let base = Look {
        robot: false,
        skin: SKIN,
        top: tokens::PRIMARY,
        sleeve: tokens::PRIMARY,
        outfit: Outfit::Shirt,
        hair: Hair::Short,
        hair_colour: HAIR,
        beard: Beard::None,
        beard_colour: HAIR,
        brow: HAIR,
        glasses: false,
        laurel: false,
        number: None,
        prop: Prop::Microphone,
    };
    match character {
        Character::Presenter => base,
        Character::Developer => Look {
            top: tokens::SECONDARY,
            sleeve: tokens::SECONDARY,
            outfit: Outfit::Hoodie,
            glasses: true,
            prop: Prop::Laptop,
            ..base
        },
        Character::Scientist => Look {
            top: tokens::INK,
            sleeve: tokens::INK,
            outfit: Outfit::LabCoat,
            hair_colour: tokens::INK_SOFT,
            brow: tokens::MUTED,
            prop: Prop::Flask,
            ..base
        },
        Character::Robot => Look {
            robot: true,
            skin: tokens::MUTED,
            top: tokens::SURFACE_STRONG,
            sleeve: tokens::MUTED,
            hair: Hair::Bald,
            brow: tokens::SECONDARY,
            prop: Prop::None,
            ..base
        },
    }
}

fn hair_hex(colour: HairColour) -> &'static str {
    match colour {
        HairColour::Black => HAIR,
        HairColour::Brown => "#6B4423",
        HairColour::Blonde => "#E3C16F",
        HairColour::Red => "#B5502E",
        HairColour::Grey => "#9AA0A6",
        HairColour::White => "#E8EAED",
    }
}

fn colour_hex(colour: Colour) -> &'static str {
    match colour {
        Colour::Blue => tokens::PRIMARY,
        Colour::Red => "#E5484D",
        Colour::Green => "#30A46C",
        Colour::Yellow => "#F5C518",
        Colour::White => "#F1F3F5",
        Colour::Black => "#1C2024",
        Colour::Purple => "#8E4EC6",
        Colour::Orange => "#F76B15",
        Colour::Grey => "#8B8D98",
    }
}

fn described(persona: &Persona) -> Look {
    let top = colour_hex(persona.colour);
    let hair_colour = hair_hex(persona.hair_colour);
    Look {
        robot: false,
        skin: match persona.skin {
            Skin::Light => "#F1C9A5",
            Skin::Medium => "#D9A06F",
            Skin::Tan => SKIN,
            Skin::Dark => "#8D5524",
        },
        top,
        sleeve: top,
        outfit: persona.outfit,
        hair: persona.hair,
        hair_colour,
        beard: persona.beard,
        beard_colour: hair_hex(persona.beard_colour),
        // Bald heads keep brows the colour of the beard, or dark.
        brow: if persona.hair == Hair::Bald && persona.beard != Beard::None {
            hair_hex(persona.beard_colour)
        } else if persona.hair == Hair::Bald {
            HAIR
        } else {
            hair_colour
        },
        glasses: persona.glasses,
        laurel: persona.laurel,
        number: persona.number,
        prop: persona.prop,
    }
}

/// Maps the unit box into a figure rectangle.
struct Figure {
    x: f32,
    y: f32,
    k: f32,
    /// Facing left: the unit box is flipped horizontally.
    mirrored: bool,
}

impl Figure {
    fn fit(area: Rect, mirrored: bool) -> Self {
        let k = (area.w / UNIT_W).min(area.h / UNIT_H);
        Self {
            x: area.cx() - UNIT_W * k / 2.0,
            y: area.bottom() - UNIT_H * k,
            k,
            mirrored,
        }
    }
    fn p(&self, x: f32, y: f32) -> (f32, f32) {
        let x = if self.mirrored { UNIT_W - x } else { x };
        (self.x + x * self.k, self.y + y * self.k)
    }
    fn rect(&self, x: f32, y: f32, w: f32, h: f32) -> Rect {
        let x = if self.mirrored { UNIT_W - x - w } else { x };
        Rect::new(
            self.x + x * self.k,
            self.y + y * self.k,
            w * self.k,
            h * self.k,
        )
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
    /// A closed, filled polygon.
    fn shape(&self, object: &str, points: &[(f32, f32)], fill: &str) -> Node {
        let (d, _) = self.polyline(points);
        Node::new(
            object,
            Shape::Path {
                d: format!("{d} Z"),
                stroke: fill.into(),
                width: 0.5 * self.k,
                length: 0.0,
                fill: Some(fill.into()),
                dashed: false,
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

fn figure_nodes(figure: &Figure, look: &Look, pose: Pose) -> Vec<Node> {
    let mut nodes = Vec::new();
    // Torso and neck; a dress flares to the hem.
    if look.outfit == Outfit::Dress {
        nodes.push(figure.shape(
            BODY,
            &[(36.0, 80.0), (74.0, 80.0), (86.0, 160.0), (24.0, 160.0)],
            look.top,
        ));
    } else {
        nodes.push(figure.block(BODY, (32.0, 80.0, 46.0, 80.0), 16.0, look.top));
    }
    nodes.push(figure.block(BODY, (49.0, 70.0, 12.0, 14.0), 3.0, look.skin));
    if look.robot {
        nodes.push(figure.block(
            BODY,
            (43.0, 96.0, 24.0, 18.0),
            4.0,
            tokens::BACKGROUND_RAISED,
        ));
        nodes.push(figure.dot(BODY, 55.0, 105.0, 4.0, tokens::SECONDARY));
    } else {
        nodes.extend(outfit_details(figure, look));
    }
    // Arms over the torso; hands are dots at the ends.
    for (object, points) in arms(pose) {
        nodes.push(figure.stroke(object, &points, 10.0, look.sleeve).with_z(1));
        let (hx, hy) = points[points.len() - 1];
        nodes.push(figure.dot(object, hx, hy, 6.0, look.skin).with_z(1));
    }
    // Something in the resting hand; celebrating raises both hands, so nothing is held.
    if pose != Pose::Celebrate {
        nodes.extend(prop(figure, look.prop));
    }
    // Head.
    if look.robot {
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
        // Long hair and a bun sit behind the head.
        match look.hair {
            Hair::Long => {
                nodes.push(figure.block(BODY, (28.0, 34.0, 54.0, 46.0), 14.0, look.hair_colour));
            }
            Hair::Bun => nodes.push(figure.dot(BODY, 55.0, 20.0, 9.0, look.hair_colour)),
            _ => {}
        }
        nodes.push(figure.dot(BODY, 55.0, 48.0, 24.0, look.skin));
        match look.hair {
            Hair::Bald => {}
            Hair::Curly => {
                for (x, y) in [
                    (34.0, 40.0),
                    (38.0, 30.0),
                    (47.0, 24.0),
                    (55.0, 22.0),
                    (63.0, 24.0),
                    (72.0, 30.0),
                    (76.0, 40.0),
                ] {
                    nodes.push(figure.dot(BODY, x, y, 7.5, look.hair_colour));
                }
            }
            Hair::Short | Hair::Long | Hair::Bun => nodes.push(figure.stroke(
                BODY,
                &[
                    (32.0, 46.0),
                    (36.0, 30.0),
                    (55.0, 22.0),
                    (74.0, 30.0),
                    (78.0, 46.0),
                ],
                9.0,
                look.hair_colour,
            )),
        }
        // Beards sit under the mouth, which stays drawn on top.
        match look.beard {
            Beard::None => {}
            Beard::Moustache => nodes.push(
                figure
                    .stroke(
                        BODY,
                        &[(48.0, 56.5), (55.0, 55.0), (62.0, 56.5)],
                        3.5,
                        look.beard_colour,
                    )
                    .with_z(2),
            ),
            Beard::Goatee => nodes.push(
                figure
                    .dot(BODY, 55.0, 69.0, 4.5, look.beard_colour)
                    .with_z(2),
            ),
            Beard::Short => nodes.push(
                figure
                    .stroke(
                        BODY,
                        &[
                            (37.0, 58.0),
                            (43.0, 68.0),
                            (55.0, 73.0),
                            (67.0, 68.0),
                            (73.0, 58.0),
                        ],
                        6.0,
                        look.beard_colour,
                    )
                    .with_z(2),
            ),
            Beard::Long => nodes.push(
                figure
                    .shape(
                        BODY,
                        &[
                            (33.0, 50.0),
                            (40.0, 64.0),
                            (48.0, 64.0),
                            (62.0, 64.0),
                            (70.0, 64.0),
                            (77.0, 50.0),
                            (66.0, 96.0),
                            (55.0, 102.0),
                            (44.0, 96.0),
                        ],
                        look.beard_colour,
                    )
                    .with_z(2),
            ),
        }
        if look.laurel {
            for side in [
                [(31.0, 46.0), (34.0, 32.0), (44.0, 24.0)],
                [(79.0, 46.0), (76.0, 32.0), (66.0, 24.0)],
            ] {
                nodes.push(figure.stroke(BODY, &side, 4.5, LAUREL).with_z(2));
            }
        }
        if look.glasses {
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
    let (eye, mouth) = if look.robot {
        (tokens::SECONDARY, tokens::SECONDARY)
    } else {
        (LINE, LINE)
    };
    for x in [44.5, 62.5] {
        nodes.push(figure.block(EYES, (x, 44.0, 4.0, 7.0), 2.0, eye).with_z(3));
    }
    for points in brows(pose) {
        nodes.push(figure.stroke(BROWS, &points, 2.4, look.brow).with_z(3));
    }
    nodes.push(mouth_node(figure, pose, mouth));
    nodes
}

const LAUREL: &str = "#6E9F4E";

/// Collars, ties, strings, sashes and jersey numbers drawn over the torso.
fn outfit_details(figure: &Figure, look: &Look) -> Vec<Node> {
    match look.outfit {
        Outfit::Shirt => vec![figure.stroke(
            BODY,
            &[(46.0, 82.0), (55.0, 94.0), (64.0, 82.0)],
            2.5,
            tokens::INK,
        )],
        Outfit::LabCoat => vec![
            figure.stroke(
                BODY,
                &[(42.0, 82.0), (55.0, 112.0), (68.0, 82.0)],
                2.5,
                tokens::MUTED,
            ),
            figure.block(BODY, (52.0, 90.0, 6.0, 22.0), 2.0, tokens::ACCENT),
        ],
        Outfit::Hoodie => vec![
            figure.stroke(BODY, &[(48.0, 84.0), (48.0, 104.0)], 2.0, tokens::INK),
            figure.stroke(BODY, &[(62.0, 84.0), (62.0, 104.0)], 2.0, tokens::INK),
        ],
        Outfit::Suit => vec![
            figure.shape(
                BODY,
                &[(44.0, 81.0), (55.0, 104.0), (66.0, 81.0)],
                "#F1F3F5",
            ),
            figure.shape(
                BODY,
                &[
                    (53.0, 86.0),
                    (57.0, 86.0),
                    (58.5, 104.0),
                    (55.0, 108.0),
                    (51.5, 104.0),
                ],
                tokens::DANGER,
            ),
        ],
        Outfit::Toga => vec![figure.stroke(
            BODY,
            &[(36.0, 84.0), (55.0, 118.0), (72.0, 156.0)],
            6.0,
            tokens::MUTED,
        )],
        Outfit::Dress => {
            vec![figure.stroke(BODY, &[(36.0, 108.0), (74.0, 108.0)], 3.0, tokens::INK_SOFT)]
        }
        Outfit::Jersey => {
            let mut nodes = vec![figure.stroke(
                BODY,
                &[(46.0, 82.0), (55.0, 89.0), (64.0, 82.0)],
                3.0,
                tokens::INK_SOFT,
            )];
            if let Some(number) = look.number {
                let size = 26.0 * figure.k;
                let (x, y) = figure.p(55.0, 132.0);
                let content = number.to_string();
                let width = size * 0.62 * content.len() as f32;
                // Light jerseys get a dark number.
                let fill = if matches!(look.top, "#F5C518" | "#F1F3F5" | "#F76B15" | "#8B8D98") {
                    LINE
                } else {
                    tokens::INK
                };
                nodes.push(
                    Node::new(
                        BODY,
                        Shape::Text {
                            x,
                            y,
                            size,
                            weight: tokens::WEIGHT_BOLD,
                            family: tokens::FONT_SANS,
                            fill: fill.into(),
                            anchor: Anchor::Middle,
                            content,
                            bbox: Rect::new(x - width / 2.0, y - size, width, size),
                            counter: None,
                        },
                    )
                    .decorative(),
                );
            }
            nodes
        }
    }
}

/// Brows carry the expression: friendly arches to explain, level and firm to point, one
/// raised to think, both high to celebrate.
fn brows(pose: Pose) -> [Vec<(f32, f32)>; 2] {
    match pose {
        Pose::Explain => [
            vec![(43.0, 40.0), (46.5, 37.5), (50.0, 39.5)],
            vec![(61.0, 39.5), (64.5, 37.5), (68.0, 40.0)],
        ],
        Pose::Point => [
            vec![(43.0, 38.5), (50.0, 40.0)],
            vec![(61.0, 40.0), (68.0, 38.5)],
        ],
        Pose::Think => [
            vec![(43.0, 40.0), (50.0, 40.0)],
            vec![(61.0, 37.0), (64.5, 34.0), (68.0, 36.5)],
        ],
        Pose::Celebrate => [
            vec![(43.0, 37.0), (46.5, 33.5), (50.0, 36.0)],
            vec![(61.0, 36.0), (64.5, 33.5), (68.0, 37.0)],
        ],
    }
}

/// The mouth at rest: a smile to explain or celebrate, level to point, pushed to one side
/// to think. Talking scales it vertically from its top edge.
fn mouth_node(figure: &Figure, pose: Pose, colour: &str) -> Node {
    let node = match pose {
        Pose::Explain | Pose::Celebrate => {
            let (x0, y0) = figure.p(49.0, 59.0);
            let (x1, _) = figure.p(61.0, 59.0);
            let (cx, cy) = figure.p(55.0, 66.0);
            Node::new(
                MOUTH,
                Shape::Path {
                    d: format!("M{x0:.1} {y0:.1} Q{cx:.1} {cy:.1} {x1:.1} {y0:.1} Z"),
                    stroke: colour.into(),
                    width: 1.0 * figure.k,
                    length: 0.0,
                    fill: Some(colour.into()),
                    dashed: false,
                },
            )
            .with_origin(figure.p(55.0, 59.0))
            .decorative()
        }
        Pose::Point => figure.block(MOUTH, (50.0, 60.0, 10.0, 3.0), 1.5, colour),
        Pose::Think => figure.block(MOUTH, (53.0, 60.0, 8.0, 3.0), 1.5, colour),
    };
    node.with_z(3)
}

/// Objects held in the resting hand (at 26, 138 in the unit box).
fn prop(figure: &Figure, prop: Prop) -> Vec<Node> {
    match prop {
        Prop::None => Vec::new(),
        // A closed laptop carried under the arm, with a lit logo.
        Prop::Laptop => vec![
            figure
                .block(PROP, (12.0, 108.0, 9.0, 38.0), 2.5, tokens::SURFACE_STRONG)
                .with_z(2),
            figure
                .dot(PROP, 16.5, 127.0, 2.2, tokens::SECONDARY)
                .with_z(2),
        ],
        // An erlenmeyer flask with coloured liquid.
        Prop::Flask => {
            let (d, length) = figure.polyline(&[
                (23.0, 116.0),
                (23.0, 124.0),
                (16.0, 140.0),
                (36.0, 140.0),
                (29.0, 124.0),
                (29.0, 116.0),
            ]);
            let (liquid, _) =
                figure.polyline(&[(19.5, 132.0), (16.0, 140.0), (36.0, 140.0), (32.5, 132.0)]);
            vec![
                Node::new(
                    PROP,
                    Shape::Path {
                        d: format!("{liquid} Z"),
                        stroke: tokens::SECONDARY.into(),
                        width: 0.5 * figure.k,
                        length: 0.0,
                        fill: Some(tokens::SECONDARY.into()),
                        dashed: false,
                    },
                )
                .decorative()
                .with_z(2),
                Node::new(
                    PROP,
                    Shape::Path {
                        d,
                        stroke: tokens::INK_SOFT.into(),
                        width: 2.0 * figure.k,
                        length,
                        fill: None,
                        dashed: false,
                    },
                )
                .decorative()
                .with_z(2),
            ]
        }
        // A handheld microphone.
        Prop::Microphone => vec![
            figure
                .block(PROP, (23.5, 128.0, 5.0, 16.0), 2.0, tokens::SURFACE_STRONG)
                .with_z(2),
            figure.dot(PROP, 26.0, 126.0, 5.0, tokens::MUTED).with_z(2),
        ],
        // A rolled parchment with darker ends.
        Prop::Scroll => vec![
            figure
                .block(PROP, (14.0, 118.0, 24.0, 12.0), 3.0, "#EDE3C8")
                .with_z(2),
            figure.dot(PROP, 14.0, 124.0, 6.0, "#C9B98F").with_z(2),
            figure.dot(PROP, 38.0, 124.0, 6.0, "#C9B98F").with_z(2),
        ],
        // A closed book, spine towards the viewer.
        Prop::Book => vec![
            figure
                .block(PROP, (14.0, 114.0, 22.0, 28.0), 2.0, tokens::DANGER)
                .with_z(2),
            figure
                .block(PROP, (14.0, 114.0, 4.0, 28.0), 1.0, "#9E2F33")
                .with_z(2),
        ],
        // A ball under the hand, with a dark patch.
        Prop::Ball => vec![
            figure.dot(PROP, 24.0, 148.0, 10.0, "#F1F3F5").with_z(2),
            figure.dot(PROP, 24.0, 148.0, 3.5, LINE).with_z(2),
        ],
        // A whistle on a cord around the neck.
        Prop::Whistle => vec![
            figure
                .stroke(
                    PROP,
                    &[(48.0, 82.0), (58.0, 104.0), (64.0, 82.0)],
                    1.5,
                    tokens::INK,
                )
                .with_z(2),
            figure
                .block(PROP, (55.0, 102.0, 9.0, 6.0), 2.0, tokens::ACCENT)
                .with_z(2),
        ],
        // A trophy cup.
        Prop::Trophy => vec![
            figure
                .shape(
                    PROP,
                    &[(14.0, 110.0), (38.0, 110.0), (32.0, 128.0), (20.0, 128.0)],
                    tokens::ACCENT,
                )
                .with_z(2),
            figure
                .block(PROP, (24.0, 128.0, 4.0, 8.0), 1.0, tokens::ACCENT)
                .with_z(2),
            figure
                .block(PROP, (18.0, 136.0, 16.0, 5.0), 1.5, tokens::ACCENT)
                .with_z(2),
        ],
    }
}

/// The figure alone, scaled to fit `area` and standing on its bottom edge.
pub fn figure(area: Rect, character: Character, pose: Pose) -> Vec<Node> {
    figure_nodes(&Figure::fit(area, false), &preset(character), pose)
}

/// A described persona alone, for thumbnails.
pub fn persona_figure(area: Rect, persona: &Persona, pose: Pose) -> Vec<Node> {
    figure_nodes(&Figure::fit(area, false), &described(persona), pose)
}

/// `mirrored` alternates sides between scenes: the character faces left and, on wide
/// formats, stands to the right of the speech card.
pub fn build(
    ctx: &mut Ctx<'_>,
    area: Rect,
    character: Character,
    persona: Option<&Persona>,
    pose: Pose,
    text: &str,
    mirrored: bool,
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
        let speech_w = area.w - stage_w - gap * 2.0;
        let (speech_x, stage_x) = if mirrored {
            (area.x, area.right() - stage_w)
        } else {
            (area.x + stage_w + gap * 2.0, area.x)
        };
        (
            Rect::new(speech_x, area.y + area.h * 0.1, speech_w, area.h * 0.62),
            Rect::new(stage_x, area.y, stage_w, area.h),
        )
    };
    let figure = Figure::fit(stage, mirrored);
    let look = persona.map_or_else(|| preset(character), described);
    let mut nodes = figure_nodes(&figure, &look, pose);
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
        // The tail leaves the card edge that faces the character.
        let (base, tip) = if mirrored {
            (speech.right(), speech.right() + gap * 0.9)
        } else {
            (speech.x, speech.x - gap * 0.9)
        };
        let y = head_y.clamp(speech.y + gap, speech.bottom() - gap);
        format!(
            "M{base:.1} {:.1} L{tip:.1} {y:.1} L{base:.1} {:.1} Z",
            y - gap * 0.6,
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
    // A described character says who it is: the name sits on top of the speech card.
    let mut text_area = speech.inset(gap);
    if let Some(persona) = persona {
        nodes.push(ctx.kicker(SPEECH, &persona.name, text_area, tokens::ACCENT));
        let skip = ctx.line_height(scale.small) + gap * 0.4;
        text_area = Rect::new(
            text_area.x,
            text_area.y + skip,
            text_area.w,
            text_area.h - skip,
        );
    }
    let (text_nodes, _) = ctx.fitted(
        SPEECH,
        text,
        text_area,
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
/// while a narration segment plays and bobs the gesturing arm. In the hook it is already
/// standing at frame 0.
pub fn animate(nodes: &mut [Node], scene: &StoryboardScene, motion_scale: f32, hook: bool) {
    let end = scene.duration_secs.max(1.0);
    let enter = if hook { -0.6 } else { 0.0 };
    for node in nodes
        .iter_mut()
        .filter(|node| node.object.starts_with(BODY))
    {
        node.props
            .reveal(enter, 0.5, (0.0, 40.0 * motion_scale), Easing::EaseOut);
    }
    // Rectangles scale around their own centre: eyes close and the mouth opens in place.
    for node in nodes.iter_mut().filter(|node| node.object == EYES) {
        blink(&mut node.props.sy, end);
    }
    for node in nodes.iter_mut().filter(|node| node.object == MOUTH) {
        talk(&mut node.props.sy, scene);
    }
    // The brows lift briefly as each sentence starts, as people do when they begin a point.
    for node in nodes.iter_mut().filter(|node| node.object == BROWS) {
        for segment in &scene.segments {
            let at = segment.start_secs.max(0.0);
            node.props.dy.key(at, 0.0, Easing::Linear);
            node.props
                .dy
                .key(at + 0.15, -4.0 * motion_scale, Easing::EaseOut);
            node.props.dy.key(at + 0.45, 0.0, Easing::EaseInOut);
        }
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

#[cfg(test)]
mod tests {
    use super::*;

    fn paths_of(nodes: &[Node], object: &str) -> Vec<String> {
        nodes
            .iter()
            .filter(|node| node.object == object)
            .map(|node| match &node.shape {
                Shape::Path { d, .. } => d.clone(),
                Shape::Rect { rect, .. } => format!("rect {:.1} {:.1}", rect.x, rect.w),
                Shape::Circle { cx, cy, .. } => format!("dot {cx:.1} {cy:.1}"),
                Shape::Text { .. } => String::new(),
            })
            .collect()
    }

    #[test]
    fn each_pose_has_its_own_brows_and_mouth() {
        let area = Rect::new(0.0, 0.0, 220.0, 320.0);
        let faces: Vec<(Vec<String>, Vec<String>)> =
            [Pose::Explain, Pose::Point, Pose::Think, Pose::Celebrate]
                .into_iter()
                .map(|pose| {
                    let nodes = figure(area, Character::Presenter, pose);
                    (paths_of(&nodes, BROWS), paths_of(&nodes, MOUTH))
                })
                .collect();
        for (index, face) in faces.iter().enumerate() {
            assert_eq!(face.0.len(), 2, "two brows");
            for other in &faces[index + 1..] {
                assert_ne!(face, other, "two poses share the same expression");
            }
        }
    }

    #[test]
    fn props_fit_the_character_and_are_dropped_when_both_hands_are_up() {
        let area = Rect::new(0.0, 0.0, 220.0, 320.0);
        let props = |character, pose| paths_of(&figure(area, character, pose), PROP).len();
        assert!(props(Character::Developer, Pose::Explain) > 0, "laptop");
        assert!(props(Character::Scientist, Pose::Think) > 0, "flask");
        assert!(props(Character::Presenter, Pose::Point) > 0, "microphone");
        assert_eq!(props(Character::Robot, Pose::Explain), 0);
        assert_eq!(props(Character::Developer, Pose::Celebrate), 0);
    }

    #[test]
    fn a_described_persona_draws_its_traits() {
        let area = Rect::new(0.0, 0.0, 330.0, 480.0);
        let striker = framechester_core::persona::parse(
            "Camisa 10 (pele escura, cabelo cacheado preto, camisa 10 amarela, bola)",
        )
        .unwrap()
        .unwrap();
        let nodes = persona_figure(area, &striker, Pose::Explain);
        let texts: Vec<&str> = nodes
            .iter()
            .filter_map(|node| match &node.shape {
                Shape::Text { content, fill, .. } => {
                    assert_eq!(fill, LINE, "dark number on a yellow jersey");
                    Some(content.as_str())
                }
                _ => None,
            })
            .collect();
        assert_eq!(texts, vec!["10"]);
        let fills = |nodes: &[Node], colour: &str| {
            nodes
                .iter()
                .filter(|node| match &node.shape {
                    Shape::Circle { fill, .. } | Shape::Rect { fill, .. } => fill == colour,
                    Shape::Path { stroke, .. } => stroke == colour,
                    _ => false,
                })
                .count()
        };
        assert_eq!(
            fills(&nodes, "#8D5524"),
            4,
            "head, neck and both hands in the dark skin"
        );
        assert_eq!(fills(&nodes, HAIR), 7 + 2, "seven curls and two brows");
        assert!(fills(&nodes, "#F5C518") >= 3, "jersey torso and sleeves");

        let socrates = framechester_core::persona::parse(
            "Sócrates (careca, barba longa branca, toga branca, louros, pergaminho)",
        )
        .unwrap()
        .unwrap();
        let nodes = persona_figure(area, &socrates, Pose::Think);
        assert_eq!(fills(&nodes, LAUREL), 2, "laurel on both sides");
        assert!(fills(&nodes, "#EDE3C8") == 1, "the scroll");
        assert!(
            fills(&nodes, "#E8EAED") >= 3,
            "white beard and brows on a bald head"
        );
        let celebrating = persona_figure(area, &socrates, Pose::Celebrate);
        assert_eq!(fills(&celebrating, "#EDE3C8"), 0, "hands up, nothing held");
    }

    #[test]
    fn the_smile_opens_from_its_top_edge_while_talking() {
        let area = Rect::new(0.0, 0.0, 220.0, 320.0);
        let figure_box = Figure::fit(area, false);
        let nodes = figure(area, Character::Presenter, Pose::Explain);
        let mouth = nodes.iter().find(|node| node.object == MOUTH).unwrap();
        let (_, top) = figure_box.p(55.0, 59.0);
        assert!(
            (mouth.origin.1 - top).abs() < 0.01,
            "scales around the lips, not the canvas origin"
        );
    }
}
