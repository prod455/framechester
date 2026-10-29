//! Side-by-side comparison: two titled columns whose items are revealed one by one.
use super::{cols, rows, Ctx};
use crate::format::Rect;
use crate::scene::{Anchor, Node, Shape};
use crate::tokens::{self, palette};
use framechester_core::storyboard::{Role, VisualObject};

pub fn build(
    ctx: &mut Ctx<'_>,
    area: Rect,
    left_title: &str,
    right_title: &str,
    objects: &[VisualObject],
) -> Vec<Node> {
    let mut nodes = Vec::new();
    let gap = ctx.canvas.gap;
    let columns = cols(area, 2, gap * 2.0);
    let divider_x = area.cx();
    nodes.push(
        Node::new(
            "divider",
            Shape::Path {
                d: format!(
                    "M{divider_x:.1} {:.1} L{divider_x:.1} {:.1}",
                    area.y,
                    area.bottom()
                ),
                stroke: tokens::RULE.into(),
                width: ctx.canvas.stroke * 0.6,
                length: area.h,
                fill: None,
                dashed: false,
            },
        )
        .decorative(),
    );
    let title_size = ctx.canvas.type_scale.heading * 0.78;
    let title_height = title_size * 1.9;
    let sides = [
        ("left", left_title, Role::Primary),
        ("right", right_title, Role::Secondary),
    ];
    for (index, (group, title, role)) in sides.iter().enumerate() {
        let column = columns[index];
        let colours = palette(*role);
        let title_object = format!("{group}-title");
        let (title_nodes, _) = ctx.fitted(
            &title_object,
            title,
            Rect::new(column.x, column.y, column.w, title_height),
            title_size,
            ctx.canvas.type_scale.body,
            tokens::WEIGHT_BOLD,
            colours.stroke,
            Anchor::Start,
            0.0,
        );
        nodes.extend(title_nodes);
        let underline_y = column.y + title_height + gap * 0.3;
        nodes.push(
            Node::new(
                &title_object,
                Shape::Path {
                    d: format!(
                        "M{:.1} {underline_y:.1} L{:.1} {underline_y:.1}",
                        column.x,
                        column.right()
                    ),
                    stroke: colours.stroke.into(),
                    width: ctx.canvas.stroke,
                    length: column.w,
                    fill: None,
                    dashed: false,
                },
            )
            .decorative(),
        );
        let items: Vec<&VisualObject> = objects
            .iter()
            .filter(|object| object.group.as_deref() == Some(group))
            .collect();
        let list_area = Rect::new(
            column.x,
            underline_y + gap,
            column.w,
            column.bottom() - underline_y - gap,
        );
        let row_height =
            (ctx.canvas.type_scale.body * 2.6).min(list_area.h / items.len().max(1) as f32);
        let list_area = Rect::new(
            list_area.x,
            list_area.y,
            list_area.w,
            row_height * items.len() as f32 + gap * 0.5 * items.len().saturating_sub(1) as f32,
        );
        for (object, row) in items.iter().zip(rows(list_area, items.len(), gap * 0.5)) {
            nodes.extend(ctx.bullet_row(object, row, colours.stroke));
        }
    }
    nodes
}
