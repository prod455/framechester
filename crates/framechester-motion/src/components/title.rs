//! Title / question / statement: one idea, large type, an accent rule that draws in.
use super::Ctx;
use crate::format::Rect;
use crate::scene::{Anchor, Node, Shape};
use crate::tokens;

pub fn build(ctx: &mut Ctx<'_>, area: Rect, text: &str, kicker: Option<&str>) -> Vec<Node> {
    let mut nodes = Vec::new();
    let scale = ctx.canvas.type_scale;
    let mut top = area.y + area.h * 0.08;
    if let Some(kicker) = kicker {
        nodes.push(ctx.kicker(
            "title",
            kicker,
            Rect::new(area.x, top, area.w, scale.small * 2.0),
            tokens::ACCENT,
        ));
        top += scale.small * 2.2;
    }
    let text_area = Rect::new(area.x, top, area.w, area.bottom() - top - scale.body * 2.0);
    let (text_nodes, bottom) = ctx.fitted(
        "title",
        text,
        text_area,
        scale.title,
        scale.body,
        tokens::WEIGHT_BOLD,
        tokens::INK,
        Anchor::Start,
        0.0,
    );
    nodes.extend(text_nodes);
    let rule_y = bottom + scale.body * 0.8;
    let rule_width = (area.w * 0.28).max(120.0);
    nodes.push(
        Node::new(
            "title",
            Shape::Path {
                d: format!(
                    "M{:.1} {rule_y:.1} L{:.1} {rule_y:.1}",
                    area.x,
                    area.x + rule_width
                ),
                stroke: tokens::ACCENT.into(),
                width: ctx.canvas.stroke * 2.0,
                length: rule_width,
                fill: None,
                dashed: false,
            },
        )
        .decorative(),
    );
    nodes
}
