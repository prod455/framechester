//! Cause and consequence chain (also ordered steps): numbered cards linked by arrows,
//! revealed in sequence so the viewer follows the causality.
use super::{cols, edge_id, rows, Ctx};
use crate::components::flow::anchor_points;
use crate::format::Rect;
use crate::scene::{Anchor, Node, Shape};
use crate::tokens::{self, palette};
use framechester_core::storyboard::{Role, VisualObject};

pub fn build(ctx: &mut Ctx<'_>, area: Rect, objects: &[VisualObject]) -> Vec<Node> {
    let mut nodes = Vec::new();
    let gap = ctx.canvas.gap;
    let scale = ctx.canvas.type_scale;
    let count = objects.len();
    let arrow_room = gap * 2.6;
    // Vertical formats stack the chain. Horizontal ones line up to five steps, or snake
    // them over two rows when the cards would be narrower than nine body-size ems.
    let narrow = count > 3 && area.w / (count as f32) < scale.body * 9.0;
    let cells: Vec<Rect> = if ctx.canvas.vertical || count > 5 {
        let card_h =
            ((area.h - arrow_room * (count as f32 - 1.0)) / count as f32).min(scale.body * 3.4);
        let total = card_h * count as f32 + arrow_room * (count as f32 - 1.0);
        rows(Rect::new(area.x, area.y, area.w, total), count, arrow_room)
    } else if narrow {
        let upper_count = count.div_ceil(2);
        let card_h = ((area.h - arrow_room) / 2.0).min(scale.heading * 3.6);
        let total = card_h * 2.0 + arrow_room;
        let top = area.y + (area.h - total).max(0.0) / 2.0;
        let bands = rows(Rect::new(area.x, top, area.w, total), 2, arrow_room);
        let mut cells = cols(bands[0], upper_count, arrow_room);
        let mut lower = cols(bands[1], upper_count, arrow_room);
        lower.truncate(count - upper_count);
        lower.reverse();
        cells.append(&mut lower);
        cells
    } else {
        let height = (area.h * 0.6).min(scale.heading * if count >= 4 { 4.2 } else { 3.4 });
        cols(
            Rect::new(area.x, area.y + (area.h - height) / 2.0, area.w, height),
            count,
            arrow_room,
        )
    };
    for (index, (object, cell)) in objects.iter().zip(&cells).enumerate() {
        let role = if object.role == Role::Neutral {
            if index + 1 == count {
                Role::Accent
            } else {
                Role::Neutral
            }
        } else {
            object.role
        };
        let colours = palette(role);
        nodes.push(ctx.card(&object.id, *cell, role));
        let badge = scale.body * 0.95;
        let badge_cx = cell.x + gap * 0.8 + badge / 2.0;
        nodes.push(
            Node::new(
                &object.id,
                Shape::Circle {
                    cx: badge_cx,
                    cy: cell.cy(),
                    r: badge / 2.0,
                    fill: colours.stroke.into(),
                    stroke: None,
                },
            )
            .decorative(),
        );
        nodes.push(ctx.ts.line(
            &object.id,
            &format!("{}", index + 1),
            badge_cx,
            cell.cy() + scale.small * 0.36,
            scale.small,
            tokens::WEIGHT_BOLD,
            tokens::FONT_SANS,
            tokens::BACKGROUND,
            Anchor::Middle,
        ));
        let text_x = badge_cx + badge / 2.0 + gap * 0.7;
        let text_rect = Rect::new(
            text_x,
            cell.y + gap * 0.4,
            cell.right() - gap * 0.7 - text_x,
            cell.h - gap * 0.8,
        );
        let text = match &object.detail {
            Some(detail) => format!("{}\n{detail}", object.label),
            None => object.label.clone(),
        };
        let (text_nodes, _) = ctx.fitted(
            &object.id,
            &text,
            text_rect,
            scale.body,
            scale.small,
            tokens::WEIGHT_SEMIBOLD,
            tokens::INK,
            Anchor::Start,
            0.5,
        );
        nodes.extend(text_nodes);
    }
    for pair in objects.windows(2).zip(cells.windows(2)) {
        let (from, to) = (&pair.0[0], &pair.0[1]);
        let (from_cell, to_cell) = (&pair.1[0], &pair.1[1]);
        let same_row = (from_cell.cy() - to_cell.cy()).abs() < 1.0;
        let same_column = (from_cell.cx() - to_cell.cx()).abs() < 1.0;
        if same_row || same_column {
            let (start, end) = anchor_points(from_cell, to_cell);
            nodes.push(ctx.arrow(&edge_id(&from.id, &to.id), start, end, tokens::ACCENT));
        } else {
            // Snake turn: down from the card, across the gap, down into the next card.
            let mid_y = (from_cell.bottom() + to_cell.y) / 2.0;
            nodes.push(ctx.connector(
                &edge_id(&from.id, &to.id),
                &[
                    (from_cell.cx(), from_cell.bottom()),
                    (from_cell.cx(), mid_y),
                    (to_cell.cx(), mid_y),
                    (to_cell.cx(), to_cell.y),
                ],
                tokens::ACCENT,
            ));
        }
    }
    nodes
}
