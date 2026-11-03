//! Numbered vertical checklist: a spine with numbered badges and one card per
//! step, popped in order. Unlike the cause chain there are no arrows: steps are
//! a recipe to follow, not consequences.
use super::{rows, Ctx};
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
    let cells = rows(area, count, row_gap);
    let badge = scale.body * 1.05;
    let badge_cx = area.x + badge / 2.0 + gap * 0.4;
    // Spine behind the badges, from the first step centre to the last.
    if count > 1 {
        let top = cells[0].cy();
        let bottom = cells[count - 1].cy();
        nodes.push(
            Node::new(
                "steps-spine",
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
        let card = Rect::new(
            badge_cx + badge / 2.0 + gap * 0.9,
            cell.y,
            cell.right() - (badge_cx + badge / 2.0 + gap * 0.9),
            cell.h,
        );
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
        let text_rect = Rect::new(
            card.x + gap * 0.7,
            card.y + gap * 0.35,
            card.w - gap * 1.4,
            card.h - gap * 0.7,
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
    nodes
}
