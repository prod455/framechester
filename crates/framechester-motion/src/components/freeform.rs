//! Free-form scene: elements placed in percent of the content area. The storyboard
//! decides where things go; the design system still decides how they look, and every
//! text goes through `Ctx::fitted`, so overflow, safe-area and overlap QA apply as in
//! the fixed layouts.
use super::Ctx;
use crate::format::Rect;
use crate::icons::icon_nodes;
use crate::scene::{Anchor, Node, Shape};
use crate::tokens::{self, palette};
use framechester_core::storyboard::{
    Area, Element, ElementShape, Point, Role, TextSize, VisualObject,
};

pub fn build(ctx: &mut Ctx<'_>, area: Rect, elements: &[Element]) -> Vec<Node> {
    let place = |part: &Area| {
        Rect::new(
            area.x + area.w * part.x / 100.0,
            area.y + area.h * part.y / 100.0,
            area.w * part.w / 100.0,
            area.h * part.h / 100.0,
        )
    };
    let point = |at: &Point| {
        (
            area.x + area.w * at.x / 100.0,
            area.y + area.h * at.y / 100.0,
        )
    };
    let mut nodes = Vec::new();
    for element in elements {
        let id = element.id.as_str();
        match &element.shape {
            ElementShape::Card {
                area: part,
                text,
                role,
                icon,
            } => {
                let rect = place(part);
                match text {
                    Some(text) => {
                        let object = VisualObject {
                            id: id.to_string(),
                            label: text.clone(),
                            detail: None,
                            role: *role,
                            icon: *icon,
                            value: None,
                            unit: None,
                            group: None,
                            parent: None,
                        };
                        let size = ctx.canvas.type_scale.label;
                        nodes.extend(ctx.labelled_card(&object, rect, size, true));
                    }
                    None => {
                        nodes.push(ctx.card(id, rect, *role));
                        if let Some(icon) = icon {
                            nodes.extend(centred_icon(
                                id,
                                *icon,
                                rect.inset(ctx.canvas.gap * 0.5),
                                *role,
                            ));
                        }
                    }
                }
            }
            ElementShape::Circle {
                area: part,
                text,
                role,
            } => {
                let rect = place(part);
                let r = rect.w.min(rect.h) / 2.0;
                let colours = palette(*role);
                nodes.push(
                    Node::new(
                        id,
                        Shape::Circle {
                            cx: rect.cx(),
                            cy: rect.cy(),
                            r,
                            fill: tokens::card_fill(*role),
                            stroke: Some((tokens::card_edge(*role), ctx.canvas.stroke * 0.5)),
                        },
                    )
                    .with_glow(colours.glow)
                    .with_z(-1)
                    .decorative(),
                );
                if let Some(text) = text {
                    // Square inscribed in the circle.
                    let side = r * std::f32::consts::SQRT_2 * 0.92;
                    let inner =
                        Rect::new(rect.cx() - side / 2.0, rect.cy() - side / 2.0, side, side);
                    let (text_nodes, _) = ctx.fitted(
                        id,
                        text,
                        inner,
                        ctx.canvas.type_scale.label,
                        ctx.canvas.type_scale.small,
                        tokens::WEIGHT_SEMIBOLD,
                        colours.text,
                        Anchor::Middle,
                        0.5,
                    );
                    nodes.extend(text_nodes);
                }
            }
            ElementShape::Text {
                area: part,
                text,
                size,
                role,
            } => {
                let scale = ctx.canvas.type_scale;
                let (max, weight) = match size {
                    TextSize::Title => (scale.title, tokens::WEIGHT_BOLD),
                    TextSize::Heading => (scale.heading, tokens::WEIGHT_BOLD),
                    TextSize::Body => (scale.body, tokens::WEIGHT_REGULAR),
                    TextSize::Label => (scale.label, tokens::WEIGHT_SEMIBOLD),
                    TextSize::Small => (scale.small, tokens::WEIGHT_REGULAR),
                };
                let colour = match role {
                    Role::Neutral => tokens::INK,
                    other => palette(*other).stroke,
                };
                let (text_nodes, _) = ctx.fitted(
                    id,
                    text,
                    place(part),
                    max,
                    scale.small,
                    weight,
                    colour,
                    Anchor::Start,
                    0.0,
                );
                nodes.extend(text_nodes);
            }
            ElementShape::Icon {
                area: part,
                icon,
                role,
            } => nodes.extend(centred_icon(id, *icon, place(part), *role)),
            ElementShape::Arrow { from, to, role } => {
                let colour = match role {
                    Role::Neutral => tokens::MUTED,
                    other => palette(*other).stroke,
                };
                nodes.push(ctx.arrow(id, point(from), point(to), colour));
            }
        }
    }
    nodes
}

fn centred_icon(
    id: &str,
    icon: framechester_core::storyboard::Icon,
    rect: Rect,
    role: Role,
) -> Vec<Node> {
    let size = rect.w.min(rect.h);
    let colour = match role {
        Role::Neutral => tokens::INK,
        other => palette(other).stroke,
    };
    icon_nodes(
        id,
        icon,
        rect.cx() - size / 2.0,
        rect.cy() - size / 2.0,
        size,
        colour,
    )
}
