//! Progressive timeline: a rail with milestone dots; each milestone has a marker label
//! (a date or a stage) and a short text, revealed in order.
use super::Ctx;
use crate::format::Rect;
use crate::scene::{Anchor, Node, Shape};
use crate::tokens;
use framechester_core::storyboard::VisualObject;

pub fn build(ctx: &mut Ctx<'_>, area: Rect, objects: &[VisualObject]) -> Vec<Node> {
    let mut nodes = Vec::new();
    let count = objects.len().max(1);
    let gap = ctx.canvas.gap;
    let dot = ctx.canvas.stroke * 3.0;
    let scale = ctx.canvas.type_scale;
    if ctx.canvas.vertical {
        let rail_x = area.x + dot;
        let step = area.h / count as f32;
        nodes.push(
            Node::new(
                "rail",
                Shape::Path {
                    d: format!(
                        "M{rail_x:.1} {:.1} L{rail_x:.1} {:.1}",
                        area.y,
                        area.y + step * (count as f32 - 0.5)
                    ),
                    stroke: tokens::RULE.into(),
                    width: ctx.canvas.stroke,
                    length: step * (count as f32 - 0.5),
                    fill: None,
                    dashed: false,
                },
            )
            .decorative(),
        );
        for (index, object) in objects.iter().enumerate() {
            let y = area.y + index as f32 * step + dot;
            nodes.push(
                Node::new(
                    &object.id,
                    Shape::Circle {
                        cx: rail_x,
                        cy: y,
                        r: dot,
                        fill: tokens::ACCENT.into(),
                        stroke: Some((tokens::BACKGROUND.into(), ctx.canvas.stroke)),
                    },
                )
                .decorative(),
            );
            let text_x = rail_x + dot + gap * 1.2;
            let text_w = area.right() - text_x;
            let label = ctx.ts.line(
                &object.id,
                &object.label,
                text_x,
                y + scale.label * 0.35,
                scale.label,
                tokens::WEIGHT_BOLD,
                tokens::FONT_SANS,
                tokens::ACCENT,
                Anchor::Start,
            );
            nodes.push(label);
            if let Some(detail) = &object.detail {
                let detail_area = Rect::new(
                    text_x,
                    y + scale.label * 0.9,
                    text_w,
                    step - scale.label * 1.4 - gap * 0.5,
                );
                let (detail_nodes, _) = ctx.fitted(
                    &object.id,
                    detail,
                    detail_area,
                    scale.body,
                    scale.small,
                    tokens::WEIGHT_REGULAR,
                    tokens::INK,
                    Anchor::Start,
                    0.0,
                );
                nodes.extend(detail_nodes);
            }
        }
    } else {
        let column = area.w / count as f32;
        let rail_y = area.y + scale.label * 1.9 + gap;
        nodes.push(
            Node::new(
                "rail",
                Shape::Path {
                    d: format!(
                        "M{:.1} {rail_y:.1} L{:.1} {rail_y:.1}",
                        area.x,
                        area.right()
                    ),
                    stroke: tokens::RULE.into(),
                    width: ctx.canvas.stroke,
                    length: area.w,
                    fill: None,
                    dashed: false,
                },
            )
            .decorative(),
        );
        for (index, object) in objects.iter().enumerate() {
            let x = area.x + index as f32 * column;
            let cx = x + column * 0.5;
            nodes.push(
                Node::new(
                    &object.id,
                    Shape::Circle {
                        cx,
                        cy: rail_y,
                        r: dot,
                        fill: tokens::ACCENT.into(),
                        stroke: Some((tokens::BACKGROUND.into(), ctx.canvas.stroke)),
                    },
                )
                .decorative(),
            );
            let label_area =
                Rect::new(x + gap * 0.4, area.y, column - gap * 0.8, scale.label * 1.6);
            let (label_nodes, _) = ctx.fitted(
                &object.id,
                &object.label,
                label_area,
                scale.label,
                scale.small,
                tokens::WEIGHT_BOLD,
                tokens::ACCENT,
                Anchor::Middle,
                1.0,
            );
            nodes.extend(label_nodes);
            if let Some(detail) = &object.detail {
                let detail_area = Rect::new(
                    x + gap * 0.4,
                    rail_y + dot + gap,
                    column - gap * 0.8,
                    area.bottom() - rail_y - dot - gap,
                );
                let (detail_nodes, _) = ctx.fitted(
                    &object.id,
                    detail,
                    detail_area,
                    scale.body,
                    scale.small,
                    tokens::WEIGHT_REGULAR,
                    tokens::INK,
                    Anchor::Middle,
                    0.0,
                );
                nodes.extend(detail_nodes);
            }
        }
    }
    nodes
}
