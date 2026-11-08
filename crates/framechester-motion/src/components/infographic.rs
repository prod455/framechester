//! Infographic: a grid of stat cards (icon, value, label, detail).
use super::{cols, rows, Ctx};
use crate::format::Rect;
use crate::icons::icon_nodes;
use crate::scene::{Anchor, Node, Shape};
use crate::tokens::{self, palette};
use framechester_core::storyboard::{format_value_in, Icon, Role, VisualObject};

pub fn build(ctx: &mut Ctx<'_>, area: Rect, title: &str, objects: &[VisualObject]) -> Vec<Node> {
    let mut nodes = Vec::new();
    let gap = ctx.canvas.gap;
    let scale = ctx.canvas.type_scale;
    let title_h = scale.heading * 1.5;
    let (title_nodes, _) = ctx.fitted_display(
        "info-title",
        title,
        Rect::new(area.x, area.y, area.w, title_h),
        scale.heading * 0.8,
        scale.body,
        tokens::INK_SOFT,
        Anchor::Start,
        0.0,
    );
    nodes.extend(title_nodes);
    let grid = Rect::new(
        area.x,
        area.y + title_h + gap,
        area.w,
        area.h - title_h - gap,
    );
    let columns = if ctx.canvas.vertical {
        // Three stacked full-width cards read better than a 2 + 1 grid with a
        // half-empty row, and give long labels a whole line.
        if objects.len() == 3 {
            1
        } else {
            2
        }
    } else {
        objects.len().clamp(1, 3)
    };
    let row_count = objects.len().div_ceil(columns);
    // Tall enough for what a card holds (icon, value, one label line, two detail
    // lines, insets), so text never presses on the bottom edge at any zoom.
    // Full-width cards carry the icon beside the text instead of above it.
    let side_icon = columns == 1;
    let content_h = gap * 1.6
        + if side_icon {
            0.0
        } else {
            ctx.canvas.icon * 0.9 + gap * 0.5
        }
        + if objects.iter().any(|object| object.value.is_some()) && !side_icon {
            scale.heading * 1.25 * 1.1
        } else {
            0.0
        }
        + scale.body * tokens::LINE_HEIGHT
        + scale.small * (0.3 + 2.0 * tokens::LINE_HEIGHT)
        + gap * 0.4;
    let card_h = (grid.h / row_count as f32 - gap).min(content_h);
    let grid = Rect::new(
        grid.x,
        grid.y,
        grid.w,
        (card_h + gap) * row_count as f32 - gap,
    );
    let mut cells = Vec::new();
    for row in rows(grid, row_count, gap) {
        cells.extend(cols(row, columns, gap));
    }
    for (object, cell) in objects.iter().zip(cells) {
        let role = if object.role == Role::Neutral {
            Role::Primary
        } else {
            object.role
        };
        let colours = palette(role);
        nodes.push(
            ctx.card(&object.id, cell, Role::Neutral)
                .with_glow(colours.glow),
        );
        let inner = cell.inset(gap * 0.8);
        let icon = ctx.canvas.icon * 0.9;
        nodes.extend(icon_nodes(
            &object.id,
            ctx.icon_for(object, Icon::Chart),
            inner.x,
            inner.y,
            icon,
            colours.stroke,
        ));
        let (inner, top) = if side_icon {
            let shift = icon + gap * 0.8;
            (
                Rect::new(inner.x + shift, inner.y, inner.w - shift, inner.h),
                inner.y,
            )
        } else {
            (inner, inner.y + icon + gap * 0.5)
        };
        // Stat row: in a full-width card the number stands in its own column, as tall
        // as the card allows, with the label and detail beside it.
        let (inner, mut top) = match object.value {
            Some(value) if side_icon => {
                let text = format_value_in(value, object.unit.as_deref(), ctx.canvas.numerals);
                let size = ctx.display_size(scale.heading * 1.25).min(inner.h * 0.75);
                let (family, weight) = ctx.display();
                let width = ctx.ts.measure(&text, size, weight, family);
                let mut node = ctx.ts.line(
                    &object.id,
                    &text,
                    inner.x,
                    inner.y + (inner.h - size) / 2.0 + size * 0.85,
                    size,
                    weight,
                    family,
                    colours.stroke,
                    Anchor::Start,
                );
                if let Shape::Text { counter, .. } = &mut node.shape {
                    *counter = Some((value, object.unit.clone(), ctx.canvas.numerals));
                }
                nodes.push(node);
                let shift = width + gap;
                (
                    Rect::new(inner.x + shift, inner.y, inner.w - shift, inner.h),
                    top,
                )
            }
            _ => (inner, top),
        };
        if let (Some(value), false) = (object.value, side_icon) {
            let text = format_value_in(value, object.unit.as_deref(), ctx.canvas.numerals);
            // A card shorter than its content gives the space back from the big number,
            // never from the label or the detail.
            let deficit = (content_h - card_h).max(0.0);
            let mut size = (ctx.display_size(scale.heading * 1.25) - deficit / 1.1).max(scale.body);
            let (family, weight) = ctx.display();
            while size > scale.body && ctx.ts.measure(&text, size, weight, family) > inner.w {
                size -= 4.0;
            }
            let mut node = ctx.ts.line(
                &object.id,
                &text,
                inner.x,
                top + size * 0.85,
                size,
                weight,
                family,
                colours.stroke,
                Anchor::Start,
            );
            if let Shape::Text { counter, .. } = &mut node.shape {
                *counter = Some((value, object.unit.clone(), ctx.canvas.numerals));
            }
            nodes.push(node);
            top += size * 1.1;
        }
        let label_area = Rect::new(
            inner.x,
            top,
            inner.w,
            // Never stretched past the card: text that does not fit inside is reported.
            (inner.bottom() - top).max(0.0),
        );
        let (label_nodes, bottom) = ctx.fitted(
            &object.id,
            &object.label,
            label_area,
            scale.body,
            scale.small,
            tokens::WEIGHT_SEMIBOLD,
            tokens::INK,
            Anchor::Start,
            0.0,
        );
        nodes.extend(label_nodes);
        if let Some(detail) = &object.detail {
            let detail_area = Rect::new(
                inner.x,
                bottom + scale.small * 0.3,
                inner.w,
                (inner.bottom() - bottom - scale.small * 0.3).max(0.0),
            );
            let (detail_nodes, _) = ctx.fitted(
                &object.id,
                detail,
                detail_area,
                scale.small,
                scale.small * 0.8,
                tokens::WEIGHT_REGULAR,
                tokens::INK_SOFT,
                Anchor::Start,
                0.0,
            );
            nodes.extend(detail_nodes);
        }
    }
    nodes
}
