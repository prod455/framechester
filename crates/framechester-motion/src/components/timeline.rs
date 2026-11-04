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
        // Milestones sit close together (a big accent marker over up to three lines of
        // text) instead of spreading thin over the whole frame; the block is centred
        // vertically by `compose`.
        // Big markers for a few milestones; long timelines keep the room for their text.
        let marker = if count <= 4 {
            scale.heading
        } else {
            scale.label
        };
        let step = (area.h / count as f32)
            .min(marker * 1.1 + scale.body * tokens::LINE_HEIGHT * 3.0 + gap * 1.5);
        nodes.push(
            Node::new(
                "rail",
                Shape::Path {
                    d: format!(
                        "M{rail_x:.1} {:.1} L{rail_x:.1} {:.1}",
                        area.y + marker * 0.55,
                        area.y + marker * 0.55 + step * (count as f32 - 1.0)
                    ),
                    stroke: tokens::RULE.into(),
                    width: ctx.canvas.stroke,
                    length: step * (count as f32 - 1.0),
                    fill: None,
                    dashed: false,
                },
            )
            .decorative(),
        );
        for (index, object) in objects.iter().enumerate() {
            // The marker is centred on the dot, so the first one starts inside the area.
            let y = area.y + index as f32 * step + marker * 0.55;
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
            // A long timeline sets the marker inline, left of its text, so each
            // milestone keeps every line of its row for the text.
            let inline = count > 4;
            let label_w = if inline {
                let (family, weight) = ctx.display();
                ctx.ts
                    .measure(&object.label, marker, weight, family)
                    .min(text_w * 0.3)
            } else {
                text_w
            };
            let (label_nodes, label_bottom) = ctx.fitted_display(
                &object.id,
                &object.label,
                Rect::new(text_x, y - marker * 0.55, label_w, marker * 1.25),
                marker,
                scale.small,
                tokens::ACCENT,
                Anchor::Start,
                0.0,
            );
            nodes.extend(label_nodes);
            if let Some(detail) = &object.detail {
                let (detail_x, detail_top) = if inline {
                    (text_x + label_w + gap * 0.6, y - marker * 0.55)
                } else {
                    (text_x, label_bottom + gap * 0.2)
                };
                let detail_area = Rect::new(
                    detail_x,
                    detail_top,
                    area.right() - detail_x,
                    // Never stretched past the milestone's row: overflow is reported.
                    (area.y + (index + 1) as f32 * step - detail_top - gap * 0.4).max(0.0),
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
            let (label_nodes, _) = ctx.fitted_display(
                &object.id,
                &object.label,
                label_area,
                scale.label,
                scale.small,
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
