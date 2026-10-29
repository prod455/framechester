//! Animated flow diagram: cards connected by arrows, optionally closed into a loop.
//! Vertical formats stack the steps; horizontal formats line them up. More than five
//! steps wrap into a snake of two columns or rows.
use super::{cols, edge_id, rows, Ctx};
use crate::format::Rect;
use crate::scene::Node;
use crate::tokens;
use framechester_core::storyboard::{Relation, VisualObject};
use std::collections::HashMap;

pub fn build(
    ctx: &mut Ctx<'_>,
    area: Rect,
    objects: &[VisualObject],
    relations: &[Relation],
    looped: bool,
) -> Vec<Node> {
    let mut nodes = Vec::new();
    let count = objects.len();
    let gap = ctx.canvas.gap;
    let arrow_room = if ctx.canvas.vertical {
        gap * 2.6
    } else {
        gap * 3.2
    };
    let loop_margin = if looped { gap * 2.4 } else { 0.0 };
    let mut places: HashMap<String, Rect> = HashMap::new();
    let cells: Vec<Rect> = if ctx.canvas.vertical {
        let column = Rect::new(area.x, area.y, area.w - loop_margin, area.h);
        if count <= 5 {
            rows(column, count, arrow_room)
        } else {
            let half = count.div_ceil(2);
            let [left, right] = <[Rect; 2]>::try_from(cols(column, 2, gap * 2.0)).expect("two");
            let mut cells = rows(left, half, arrow_room);
            let mut right_cells = rows(right, count - half, arrow_room);
            right_cells.reverse();
            cells.append(&mut right_cells);
            cells
        }
    } else {
        let row = Rect::new(area.x, area.y, area.w, area.h - loop_margin);
        if count <= 5 {
            let height = (row.h * 0.55).min(260.0);
            let top = row.y + (row.h - height) / 2.0;
            cols(Rect::new(row.x, top, row.w, height), count, arrow_room)
        } else {
            let half = count.div_ceil(2);
            let [upper, lower] = <[Rect; 2]>::try_from(rows(row, 2, gap * 2.0)).expect("two");
            let mut cells = cols(upper, half, arrow_room);
            let mut lower_cells = cols(lower, count - half, arrow_room);
            lower_cells.reverse();
            cells.append(&mut lower_cells);
            cells
        }
    };
    let label_size = if count > 5 {
        ctx.canvas.type_scale.body
    } else {
        ctx.canvas.type_scale.heading * 0.8
    };
    for (object, cell) in objects.iter().zip(&cells) {
        let cell = if ctx.canvas.vertical {
            let height = cell.h.min(ctx.canvas.type_scale.heading * 2.4);
            Rect::new(cell.x, cell.y + (cell.h - height) / 2.0, cell.w, height)
        } else {
            *cell
        };
        places.insert(object.id.clone(), cell);
        nodes.extend(ctx.labelled_card(object, cell, label_size, !ctx.canvas.vertical));
    }
    for relation in relations {
        let (Some(from), Some(to)) = (places.get(&relation.from), places.get(&relation.to)) else {
            continue;
        };
        let (start, end) = anchor_points(from, to);
        nodes.push(ctx.arrow(
            &edge_id(&relation.from, &relation.to),
            start,
            end,
            tokens::MUTED,
        ));
    }
    if looped && count >= 2 {
        let first = places[&objects[0].id];
        let last = places[&objects[count - 1].id];
        let points = if ctx.canvas.vertical {
            let x = area.right() - gap * 0.6;
            vec![
                (last.right(), last.cy()),
                (x, last.cy()),
                (x, first.cy()),
                (first.right(), first.cy()),
            ]
        } else {
            let y = area.bottom() - gap * 0.6;
            vec![
                (last.cx(), last.bottom()),
                (last.cx(), y),
                (first.cx(), y),
                (first.cx(), first.bottom()),
            ]
        };
        nodes.push(ctx.connector(
            &edge_id(&objects[count - 1].id, &objects[0].id),
            &points,
            tokens::ACCENT,
        ));
    }
    nodes
}

/// Edge end points on the facing sides of two rectangles.
pub fn anchor_points(from: &Rect, to: &Rect) -> ((f32, f32), (f32, f32)) {
    let dx = to.cx() - from.cx();
    let dy = to.cy() - from.cy();
    if dx.abs() > dy.abs() {
        if dx > 0.0 {
            ((from.right(), from.cy()), (to.x, to.cy()))
        } else {
            ((from.x, from.cy()), (to.right(), to.cy()))
        }
    } else if dy > 0.0 {
        ((from.cx(), from.bottom()), (to.cx(), to.y))
    } else {
        ((from.cx(), from.y), (to.cx(), to.bottom()))
    }
}
