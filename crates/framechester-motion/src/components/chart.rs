//! Charts and counters: a single value becomes a large counting number; several values
//! become horizontal bars that grow while their numbers count up.
use super::{rows, Ctx};
use crate::format::Rect;
use crate::scene::{Anchor, Node, Shape};
use crate::tokens::{self, palette};
use framechester_core::storyboard::{format_value, Role, VisualObject};

fn counter_node(
    ctx: &Ctx<'_>,
    object: &VisualObject,
    x: f32,
    baseline: f32,
    size: f32,
    colour: &str,
    anchor: Anchor,
) -> Node {
    let value = object.value.unwrap_or(0.0);
    let text = format_value(value, object.unit.as_deref());
    let mut node = ctx.ts.line(
        &object.id,
        &text,
        x,
        baseline,
        size,
        tokens::WEIGHT_BOLD,
        tokens::FONT_SANS,
        colour,
        anchor,
    );
    if let Shape::Text { counter, .. } = &mut node.shape {
        *counter = Some((value, object.unit.clone()));
    }
    node
}

pub fn build(
    ctx: &mut Ctx<'_>,
    area: Rect,
    title: &str,
    objects: &[VisualObject],
    max_value: Option<f64>,
) -> Vec<Node> {
    let mut nodes = Vec::new();
    let scale = ctx.canvas.type_scale;
    let gap = ctx.canvas.gap;
    let title_height = scale.heading * 1.5;
    let (title_nodes, _) = ctx.fitted(
        "chart-title",
        title,
        Rect::new(area.x, area.y, area.w, title_height),
        scale.heading * 0.8,
        scale.body,
        tokens::WEIGHT_SEMIBOLD,
        tokens::INK_SOFT,
        Anchor::Start,
        0.0,
    );
    nodes.extend(title_nodes);
    let body = Rect::new(
        area.x,
        area.y + title_height + gap,
        area.w,
        area.h - title_height - gap,
    );
    if objects.len() == 1 {
        let object = &objects[0];
        let text = format_value(object.value.unwrap_or(0.0), object.unit.as_deref());
        let mut size = scale.number;
        while size > scale.heading
            && ctx
                .ts
                .measure(&text, size, tokens::WEIGHT_BOLD, tokens::FONT_SANS)
                > body.w
        {
            size -= 8.0;
        }
        let baseline = body.y + size * 0.95;
        nodes.push(counter_node(
            ctx,
            object,
            body.x,
            baseline,
            size,
            tokens::ACCENT,
            Anchor::Start,
        ));
        let caption_area = Rect::new(
            body.x,
            baseline + gap,
            body.w,
            (body.bottom() - baseline - gap).max(scale.body),
        );
        let (caption_nodes, _) = ctx.fitted(
            &object.id,
            &object.label,
            caption_area,
            scale.heading * 0.8,
            scale.small,
            tokens::WEIGHT_REGULAR,
            tokens::INK,
            Anchor::Start,
            0.0,
        );
        nodes.extend(caption_nodes);
        return nodes;
    }
    let maximum = max_value.unwrap_or_else(|| {
        objects
            .iter()
            .filter_map(|object| object.value)
            .fold(0.0f64, f64::max)
            .max(1e-9)
    });
    let row_height = (scale.body * 3.0).min(body.h / objects.len() as f32);
    let rows_area = Rect::new(body.x, body.y, body.w, row_height * objects.len() as f32);
    let label_width = if ctx.canvas.vertical {
        body.w * 0.34
    } else {
        body.w * 0.26
    };
    let value_width = ctx.ts.measure(
        "000.000%",
        scale.body,
        tokens::WEIGHT_BOLD,
        tokens::FONT_SANS,
    );
    let bar_x = body.x + label_width + gap;
    let bar_w = (body.w - label_width - value_width - gap * 2.5).max(40.0);
    for (object, row) in objects.iter().zip(rows(rows_area, objects.len(), 0.0)) {
        let role = if object.role == Role::Neutral {
            Role::Primary
        } else {
            object.role
        };
        let colours = palette(role);
        let (label_nodes, _) = ctx.fitted(
            &object.id,
            &object.label,
            Rect::new(row.x, row.y, label_width, row.h),
            scale.body,
            scale.small,
            tokens::WEIGHT_SEMIBOLD,
            tokens::INK,
            Anchor::Start,
            0.5,
        );
        nodes.extend(label_nodes);
        let fraction = (object.value.unwrap_or(0.0) / maximum).clamp(0.0, 1.0) as f32;
        let bar_h = (row.h * 0.5).min(scale.body * 1.3);
        let bar = Rect::new(
            bar_x,
            row.cy() - bar_h / 2.0,
            (bar_w * fraction).max(ctx.canvas.stroke),
            bar_h,
        );
        nodes.push(
            Node::new(
                &object.id,
                Shape::Rect {
                    rect: Rect::new(bar_x, bar.y, bar_w, bar_h),
                    rx: bar_h / 2.0,
                    fill: tokens::SURFACE.into(),
                    stroke: None,
                },
            )
            .with_z(-2)
            .decorative(),
        );
        nodes.push(
            Node::new(
                &format!("{}:bar", object.id),
                Shape::Rect {
                    rect: bar,
                    rx: bar_h / 2.0,
                    fill: colours.stroke.into(),
                    stroke: None,
                },
            )
            .with_origin((bar_x, bar.cy()))
            .with_glow(colours.glow)
            .with_z(-1)
            .decorative(),
        );
        nodes.push(counter_node(
            ctx,
            object,
            bar_x + bar_w + gap * 0.8,
            row.cy() + scale.body * 0.35,
            scale.body,
            colours.stroke,
            Anchor::Start,
        ));
    }
    nodes
}
