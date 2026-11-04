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
    // Kinetic typography: the fitted layout (size, line breaks, top) is
    // exactly the one `Ctx::fitted` would produce, but the text is emitted
    // as one node per word so `compose` can reveal word by word. Word boxes
    // stay inside the fitted line boxes, so overflow QA is unchanged.
    let family = tokens::FONT_SANS;
    let (size, lines) = ctx.fit(
        "title",
        text,
        text_area.w,
        text_area.h,
        scale.title,
        scale.body,
        tokens::WEIGHT_BOLD,
    );
    let height = crate::text::Typesetter::block_height(size, lines.len());
    let bottom = text_area.y + height;
    nodes.extend(ctx.ts.word_block(
        "title",
        &lines,
        text_area.x,
        text_area.y,
        size,
        tokens::WEIGHT_BOLD,
        family,
        tokens::HEADLINE,
        Anchor::Start,
    ));
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
