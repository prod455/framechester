//! Object transformation: "before" cards travel into the "after" cards. Vertical
//! formats stack before above after; horizontal formats put them side by side.
use super::{cols, rows, Ctx};
use crate::format::Rect;
use crate::scene::{Anchor, Node};
use crate::tokens;
use framechester_core::storyboard::VisualObject;

pub fn build(
    ctx: &mut Ctx<'_>,
    area: Rect,
    before: &[VisualObject],
    after: &[VisualObject],
    label: Option<&str>,
) -> Vec<Node> {
    let mut nodes = Vec::new();
    let gap = ctx.canvas.gap;
    let scale = ctx.canvas.type_scale;
    let arrow_room = gap * 3.5;
    let (before_area, after_area, arrow) = if ctx.canvas.vertical {
        let half = (area.h - arrow_room) / 2.0;
        let before_area = Rect::new(area.x, area.y, area.w, half);
        let after_area = Rect::new(area.x, area.y + half + arrow_room, area.w, half);
        let arrow = (
            (area.cx(), before_area.bottom() + gap * 0.6),
            (area.cx(), after_area.y - gap * 0.6),
        );
        (before_area, after_area, arrow)
    } else {
        let half = (area.w - arrow_room) / 2.0;
        let before_area = Rect::new(area.x, area.y, half, area.h);
        let after_area = Rect::new(area.x + half + arrow_room, area.y, half, area.h);
        let arrow = (
            (before_area.right() + gap * 0.6, area.cy()),
            (after_area.x - gap * 0.6, area.cy()),
        );
        (before_area, after_area, arrow)
    };
    nodes.push(ctx.arrow("transform-arrow", arrow.0, arrow.1, tokens::ACCENT));
    if let Some(label) = label {
        nodes.push(ctx.ts.line(
            "transform-arrow",
            label,
            if ctx.canvas.vertical {
                arrow.0 .0 + gap
            } else {
                (arrow.0 .0 + arrow.1 .0) / 2.0
            },
            if ctx.canvas.vertical {
                (arrow.0 .1 + arrow.1 .1) / 2.0 + scale.small * 0.35
            } else {
                arrow.0 .1 - gap
            },
            scale.small,
            tokens::WEIGHT_SEMIBOLD,
            tokens::FONT_SANS,
            tokens::ACCENT,
            if ctx.canvas.vertical {
                Anchor::Start
            } else {
                Anchor::Middle
            },
        ));
    }
    for (group, items, group_area, kicker) in [
        ("before", before, before_area, "Antes"),
        ("after", after, after_area, "Depois"),
    ] {
        nodes.push(ctx.kicker(
            &format!("{group}-kicker"),
            kicker,
            group_area,
            tokens::MUTED,
        ));
        let list_area = Rect::new(
            group_area.x,
            group_area.y + scale.small * 1.8,
            group_area.w,
            group_area.h - scale.small * 1.8,
        );
        let cells = if ctx.canvas.vertical || items.len() > 2 {
            let card_h =
                (scale.body * 2.6).min(list_area.h / items.len().max(1) as f32 - gap * 0.5);
            rows(
                Rect::new(
                    list_area.x,
                    list_area.y,
                    list_area.w,
                    (card_h + gap * 0.5) * items.len() as f32 - gap * 0.5,
                ),
                items.len(),
                gap * 0.5,
            )
        } else {
            let height = (scale.heading * 2.6).min(list_area.h);
            cols(
                Rect::new(list_area.x, list_area.y, list_area.w, height),
                items.len(),
                gap,
            )
        };
        for (object, cell) in items.iter().zip(cells) {
            nodes.extend(ctx.labelled_card(object, cell, scale.body, false));
        }
    }
    nodes
}
