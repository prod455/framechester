//! Numbered vertical checklist: a spine with numbered badges and one card per
//! step, popped in order. Unlike the cause chain there are no arrows: steps are
//! a recipe to follow, not consequences.
use super::{cols, rows, Ctx};
use crate::format::Rect;
use crate::scene::{Anchor, Node, Shape};
use crate::tokens::{self, palette};
use framechester_core::storyboard::{Role, VisualObject};

pub fn build(ctx: &mut Ctx<'_>, area: Rect, objects: &[VisualObject]) -> Vec<Node> {
    let mut nodes = Vec::new();
    let gap = ctx.canvas.gap;
    let scale = ctx.canvas.type_scale;
    let count = objects.len();
    let row_gap = gap * 1.1;
    let badge = scale.body * 1.05;
    // One column of steps, or two read top to bottom when a single column's cards would
    // be too short for their text.
    let stacked = rows(area, count, row_gap);
    let columns: Vec<(Rect, usize)> = if stacked
        .iter()
        .all(|cell| holds_text(ctx, &card_of(ctx, cell, badge), objects))
    {
        vec![(area, count)]
    } else {
        let left = count.div_ceil(2);
        let halves = cols(area, 2, gap * 1.6);
        vec![(halves[0], left), (halves[1], count - left)]
    };
    let rows_per_column = columns[0].1;
    let mut cells = Vec::with_capacity(count);
    for (column, items) in &columns {
        let mut column_cells = rows(*column, rows_per_column, row_gap);
        column_cells.truncate(*items);
        // Spine behind the badges, from the first step centre to the last.
        if column_cells.len() > 1 {
            let badge_cx = column.x + badge / 2.0 + gap * 0.4;
            let top = column_cells[0].cy();
            let bottom = column_cells[column_cells.len() - 1].cy();
            nodes.push(
                Node::new(
                    &if cells.is_empty() {
                        "steps-spine".to_string()
                    } else {
                        format!("steps-spine-{}", cells.len())
                    },
                    Shape::Path {
                        d: format!("M{badge_cx:.1} {top:.1} L{badge_cx:.1} {bottom:.1}"),
                        stroke: tokens::RULE.into(),
                        width: ctx.canvas.stroke * 1.6,
                        length: bottom - top,
                        fill: None,
                        dashed: false,
                    },
                )
                .decorative()
                .with_z(-2),
            );
        }
        cells.extend(column_cells);
    }
    for (index, (object, cell)) in objects.iter().zip(&cells).enumerate() {
        let role = if object.role == Role::Neutral {
            if index + 1 == count {
                Role::Accent
            } else {
                Role::Primary
            }
        } else {
            object.role
        };
        let colours = palette(role);
        let badge_cx = cell.x + badge / 2.0 + gap * 0.4;
        let card = card_of(ctx, cell, badge);
        nodes.push(ctx.card(&object.id, card, role));
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
        let text_rect = text_box(ctx, &card);
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
    nodes
}

/// The card of a step in `cell`, right of its number badge on the spine.
fn card_of(ctx: &Ctx<'_>, cell: &Rect, badge: f32) -> Rect {
    let gap = ctx.canvas.gap;
    let left = cell.x + badge + gap * 1.3;
    Rect::new(left, cell.y, cell.right() - left, cell.h)
}

fn text_box(ctx: &Ctx<'_>, card: &Rect) -> Rect {
    let gap = ctx.canvas.gap;
    Rect::new(
        card.x + gap * 0.7,
        card.y + gap * 0.35,
        card.w - gap * 1.4,
        card.h - gap * 0.7,
    )
}

fn card_text(object: &VisualObject) -> String {
    match &object.detail {
        Some(detail) => format!("{}\n{detail}", object.label),
        None => object.label.clone(),
    }
}

/// Whether every step's text fits a card the size of `card` at a legible size.
fn holds_text(ctx: &Ctx<'_>, card: &Rect, objects: &[VisualObject]) -> bool {
    let scale = ctx.canvas.type_scale;
    let min = scale.small.max(ctx.canvas.text_floor());
    let text = text_box(ctx, card);
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
