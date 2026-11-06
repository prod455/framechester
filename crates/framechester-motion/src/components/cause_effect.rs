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
    // Vertical formats stack the chain, or split it into two columns read top to bottom
    // when a stacked card would be too short for its text. Horizontal ones line up to
    // five steps, or snake them over two rows when there are more or the cards would be
    // narrower than nine body-size ems.
    let narrow = count > 5 || (count > 3 && area.w / (count as f32) < scale.body * 9.0);
    let cells: Vec<Rect> = if ctx.canvas.vertical {
        let stacked = column(area, count, arrow_room, scale.body * 3.4);
        if stacked.iter().all(|cell| holds_text(ctx, cell, objects)) {
            stacked
        } else {
            let left_count = count.div_ceil(2);
            let halves = cols(area, 2, arrow_room);
            let mut cells = column(halves[0], left_count, arrow_room, f32::INFINITY);
            cells.truncate(left_count);
            let mut right = column(halves[1], left_count, arrow_room, f32::INFINITY);
            right.truncate(count - left_count);
            cells.append(&mut right);
            cells
        }
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
        let badge = badge_size(ctx);
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
        let text_rect = text_box(ctx, cell);
        let text = card_text(object);
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
        } else if to_cell.x >= from_cell.right() {
            // Column turn: out of the card's side, along the gutter, into the next card.
            let mid_x = (from_cell.right() + to_cell.x) / 2.0;
            nodes.push(ctx.connector(
                &edge_id(&from.id, &to.id),
                &[
                    (from_cell.right(), from_cell.cy()),
                    (mid_x, from_cell.cy()),
                    (mid_x, to_cell.cy()),
                    (to_cell.x, to_cell.cy()),
                ],
                tokens::ACCENT,
            ));
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

/// `count` cards stacked in `area` with `arrow_room` between them, each at most `max_h`.
fn column(area: Rect, count: usize, arrow_room: f32, max_h: f32) -> Vec<Rect> {
    let card_h = ((area.h - arrow_room * (count as f32 - 1.0)) / count as f32).min(max_h);
    let total = card_h * count as f32 + arrow_room * (count as f32 - 1.0);
    rows(Rect::new(area.x, area.y, area.w, total), count, arrow_room)
}

fn badge_size(ctx: &Ctx<'_>) -> f32 {
    ctx.canvas.type_scale.body * 0.95
}

/// The text area of a card: right of its number badge, inset from the edges.
fn text_box(ctx: &Ctx<'_>, cell: &Rect) -> Rect {
    let gap = ctx.canvas.gap;
    let text_x = cell.x + gap * 0.8 + badge_size(ctx) + gap * 0.7;
    Rect::new(
        text_x,
        cell.y + gap * 0.4,
        cell.right() - gap * 0.7 - text_x,
        cell.h - gap * 0.8,
    )
}

fn card_text(object: &VisualObject) -> String {
    match &object.detail {
        Some(detail) => format!("{}\n{detail}", object.label),
        None => object.label.clone(),
    }
}

/// Whether every object's text fits a card the size of `cell` at a legible size.
fn holds_text(ctx: &Ctx<'_>, cell: &Rect, objects: &[VisualObject]) -> bool {
    let scale = ctx.canvas.type_scale;
    let min = scale.small.max(ctx.canvas.text_floor());
    let text = text_box(ctx, cell);
    objects.iter().all(|object| {
        ctx.ts
            .fit(
                &card_text(object),
                scale.body.max(min),
                min,
                text.w,
                text.h,
                tokens::WEIGHT_SEMIBOLD,
                tokens::FONT_SANS,
            )
            .is_some()
    })
}
