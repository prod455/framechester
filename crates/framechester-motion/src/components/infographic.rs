//! Infographic: a grid of stat cards (icon, value, label, detail).
use super::{cols, rows, Ctx};
use crate::format::Rect;
use crate::icons::icon_nodes;
use crate::scene::{Anchor, Node, Shape};
use crate::tokens::{self, palette};
use framechester_core::storyboard::{format_value, Icon, Role, VisualObject};

pub fn build(ctx: &mut Ctx<'_>, area: Rect, title: &str, objects: &[VisualObject]) -> Vec<Node> {
    let mut nodes = Vec::new();
    let gap = ctx.canvas.gap;
    let scale = ctx.canvas.type_scale;
    let title_h = scale.heading * 1.5;
    let (title_nodes, _) = ctx.fitted(
        "info-title",
        title,
        Rect::new(area.x, area.y, area.w, title_h),
        scale.heading * 0.8,
        scale.body,
        tokens::WEIGHT_SEMIBOLD,
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
        2
    } else {
        objects.len().clamp(1, 3)
    };
    let row_count = objects.len().div_ceil(columns);
    let card_h =
        (grid.h / row_count as f32 - gap).min(if ctx.canvas.vertical { 360.0 } else { 300.0 });
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
        let mut top = inner.y + icon + gap * 0.5;
        if let Some(value) = object.value {
            let text = format_value(value, object.unit.as_deref());
            let mut size = scale.heading * 1.25;
            while size > scale.body
                && ctx
                    .ts
                    .measure(&text, size, tokens::WEIGHT_BOLD, tokens::FONT_SANS)
                    > inner.w
            {
                size -= 4.0;
            }
            let mut node = ctx.ts.line(
                &object.id,
                &text,
                inner.x,
                top + size * 0.85,
                size,
                tokens::WEIGHT_BOLD,
                tokens::FONT_SANS,
                colours.stroke,
                Anchor::Start,
            );
            if let Shape::Text { counter, .. } = &mut node.shape {
                *counter = Some((value, object.unit.clone()));
            }
            nodes.push(node);
            top += size * 1.1;
        }
        let label_area = Rect::new(
            inner.x,
            top,
            inner.w,
            (inner.bottom() - top).max(scale.small),
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
                (inner.bottom() - bottom - scale.small * 0.3).max(scale.small),
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
