//! Highlights and annotations over a tree (folders, files, nodes): the tree is an
//! indented list with icons; each note is a callout beside its item.
use super::Ctx;
use crate::format::Rect;
use crate::icons::icon_nodes;
use crate::scene::{Anchor, Node, Shape};
use crate::tokens::{self, palette};
use framechester_core::storyboard::{Icon, Relation, VisualObject};
use std::collections::HashMap;

fn depth_of(object: &VisualObject, objects: &[VisualObject]) -> usize {
    let mut depth = 0;
    let mut current = object.parent.as_deref();
    while let Some(parent_id) = current {
        depth += 1;
        current = objects
            .iter()
            .find(|candidate| candidate.id == parent_id)
            .and_then(|parent| parent.parent.as_deref());
        if depth > 8 {
            break;
        }
    }
    depth
}

pub fn build(
    ctx: &mut Ctx<'_>,
    area: Rect,
    objects: &[VisualObject],
    notes: &[Relation],
) -> Vec<Node> {
    let mut nodes = Vec::new();
    let gap = ctx.canvas.gap;
    let scale = ctx.canvas.type_scale;
    let has_notes = objects.iter().any(|object| object.detail.is_some()) || !notes.is_empty();
    let row_h = scale.body * 1.75;
    let needed = objects.len() as f32 * row_h;
    let row_h = if needed > area.h {
        area.h / objects.len() as f32
    } else {
        row_h
    };
    let tree_w = if has_notes {
        if ctx.canvas.vertical {
            area.w * 0.56
        } else {
            area.w * 0.48
        }
    } else {
        area.w
    };
    let indent = scale.body * 1.3;
    let icon = scale.body * 1.1;
    let mut baselines: HashMap<String, f32> = HashMap::new();
    let tree_card = Rect::new(area.x, area.y, tree_w, row_h * objects.len() as f32 + gap);
    nodes.push(
        Node::new(
            "tree",
            Shape::Rect {
                rect: tree_card,
                rx: ctx.canvas.radius,
                fill: tokens::BACKGROUND_RAISED.into(),
                stroke: Some((tokens::RULE.into(), ctx.canvas.stroke * 0.5)),
            },
        )
        .with_z(-3)
        .decorative(),
    );
    for (index, object) in objects.iter().enumerate() {
        let depth = depth_of(object, objects) as f32;
        let x = area.x + gap * 0.8 + depth * indent;
        let top = area.y + gap * 0.5 + index as f32 * row_h;
        let cy = top + row_h / 2.0;
        let colours = palette(object.role);
        nodes.push(
            Node::new(
                &object.id,
                Shape::Rect {
                    rect: Rect::new(
                        area.x + ctx.canvas.stroke,
                        top,
                        tree_w - 2.0 * ctx.canvas.stroke,
                        row_h,
                    ),
                    rx: ctx.canvas.radius * 0.5,
                    fill: colours.fill.into(),
                    stroke: None,
                },
            )
            .with_z(-1)
            .with_glow(colours.glow)
            .decorative(),
        );
        nodes.last_mut().expect("band").props.opacity = crate::anim::Track::constant(0.0);
        let icon_kind = ctx.icon_for(
            object,
            if object.label.contains('.') {
                Icon::File
            } else {
                Icon::Folder
            },
        );
        nodes.extend(icon_nodes(
            &object.id,
            icon_kind,
            x,
            cy - icon / 2.0,
            icon,
            if object.icon == Some(Icon::Folder) || icon_kind == Icon::Folder {
                tokens::ACCENT
            } else {
                tokens::MUTED
            },
        ));
        let label_x = x + icon + gap * 0.5;
        let label_w = (area.x + tree_w - gap * 0.6 - label_x).max(40.0);
        let (label_nodes, _) = ctx.fitted(
            &object.id,
            &object.label,
            Rect::new(label_x, top, label_w, row_h),
            scale.body,
            scale.small,
            tokens::WEIGHT_SEMIBOLD,
            tokens::INK,
            Anchor::Start,
            0.5,
        );
        nodes.extend(label_nodes);
        baselines.insert(object.id.clone(), cy);
    }
    if has_notes {
        let note_x = area.x + tree_w + gap * 1.5;
        let note_w = area.right() - note_x;
        let mut last_bottom = area.y;
        for object in objects.iter().filter(|object| object.detail.is_some()) {
            let detail = object.detail.as_deref().unwrap_or_default();
            let cy = baselines[&object.id];
            let note_id = format!("note:{}", object.id);
            let fitted = ctx.ts.fit(
                detail,
                scale.body,
                scale.small,
                note_w - gap,
                row_h * 2.4,
                tokens::WEIGHT_REGULAR,
                tokens::FONT_SANS,
            );
            let (size, lines) = match fitted {
                Some(found) => found,
                None => {
                    ctx.issue(
                        super::Severity::Critical,
                        "text_overflow",
                        format!("nota de '{}' nao cabe; encurte-a", object.label),
                    );
                    (
                        scale.small,
                        ctx.ts.wrap(
                            detail,
                            scale.small,
                            tokens::WEIGHT_REGULAR,
                            tokens::FONT_SANS,
                            note_w - gap,
                        ),
                    )
                }
            };
            let height = crate::text::Typesetter::block_height(size, lines.len());
            let top = (cy - height / 2.0).max(last_bottom + gap * 0.4);
            last_bottom = top + height;
            nodes.push(
                Node::new(
                    &note_id,
                    Shape::Path {
                        d: format!(
                            "M{:.1} {cy:.1} L{:.1} {cy:.1} L{:.1} {:.1}",
                            area.x + tree_w,
                            note_x - gap * 0.5,
                            note_x - gap * 0.5,
                            top + height / 2.0
                        ),
                        stroke: tokens::ACCENT.into(),
                        width: ctx.canvas.stroke * 0.6,
                        length: gap * 1.5 + (cy - top - height / 2.0).abs(),
                        fill: None,
                        dashed: true,
                    },
                )
                .decorative(),
            );
            nodes.push(
                Node::new(
                    &note_id,
                    Shape::Path {
                        d: format!(
                            "M{:.1} {top:.1} L{:.1} {:.1}",
                            note_x - gap * 0.1,
                            note_x - gap * 0.1,
                            top + height
                        ),
                        stroke: tokens::ACCENT.into(),
                        width: ctx.canvas.stroke,
                        length: height,
                        fill: None,
                        dashed: false,
                    },
                )
                .decorative(),
            );
            nodes.extend(ctx.ts.block(
                &note_id,
                &lines,
                note_x + gap * 0.5,
                top,
                size,
                tokens::WEIGHT_REGULAR,
                tokens::FONT_SANS,
                tokens::INK_SOFT,
                Anchor::Start,
            ));
        }
    }
    nodes
}
