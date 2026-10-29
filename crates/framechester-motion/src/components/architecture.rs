//! Software architecture: layers (object groups) as horizontal bands, boxes inside each
//! band, and connections drawn between boxes.
use super::{cols, edge_id, rows, Ctx};
use crate::components::flow::anchor_points;
use crate::format::Rect;
use crate::scene::{Anchor, Node, Shape};
use crate::tokens;
use framechester_core::storyboard::{Relation, VisualObject};
use std::collections::HashMap;

pub fn build(
    ctx: &mut Ctx<'_>,
    area: Rect,
    objects: &[VisualObject],
    relations: &[Relation],
) -> Vec<Node> {
    let mut nodes = Vec::new();
    let gap = ctx.canvas.gap;
    let scale = ctx.canvas.type_scale;
    let mut layers: Vec<Option<String>> = Vec::new();
    for object in objects {
        if !layers.contains(&object.group) {
            layers.push(object.group.clone());
        }
    }
    let bands = rows(area, layers.len(), gap * 1.5);
    let mut places: HashMap<String, Rect> = HashMap::new();
    for (layer, band) in layers.iter().zip(&bands) {
        let members: Vec<&VisualObject> = objects
            .iter()
            .filter(|object| &object.group == layer)
            .collect();
        let layer_id = format!(
            "layer:{}",
            layer.clone().unwrap_or_else(|| "sem-camada".into())
        );
        nodes.push(
            Node::new(
                &layer_id,
                Shape::Rect {
                    rect: *band,
                    rx: ctx.canvas.radius,
                    fill: tokens::BACKGROUND_RAISED.into(),
                    stroke: Some((tokens::RULE.into(), ctx.canvas.stroke * 0.5)),
                },
            )
            .with_z(-3)
            .decorative(),
        );
        let mut inner = band.inset(gap * 0.6);
        if let Some(name) = layer {
            nodes.push(ctx.kicker(&layer_id, name, inner, tokens::MUTED));
            inner = Rect::new(
                inner.x,
                inner.y + scale.small * 1.7,
                inner.w,
                inner.h - scale.small * 1.7,
            );
        }
        let box_h = inner.h.min(scale.body * 3.2);
        let boxes_area = Rect::new(inner.x, inner.y + (inner.h - box_h) / 2.0, inner.w, box_h);
        for (object, cell) in members.iter().zip(cols(boxes_area, members.len(), gap)) {
            places.insert(object.id.clone(), cell);
            nodes.extend(ctx.labelled_card(object, cell, scale.body, true));
        }
    }
    for relation in relations {
        let (Some(from), Some(to)) = (places.get(&relation.from), places.get(&relation.to)) else {
            continue;
        };
        let (start, end) = anchor_points(from, to);
        let mut arrow = ctx.arrow(
            &edge_id(&relation.from, &relation.to),
            start,
            end,
            tokens::SECONDARY,
        );
        arrow.z = 5;
        nodes.push(arrow);
        if let Some(label) = &relation.label {
            let mid = ((start.0 + end.0) / 2.0, (start.1 + end.1) / 2.0);
            nodes.push(ctx.ts.line(
                &edge_id(&relation.from, &relation.to),
                label,
                mid.0 + gap * 0.4,
                mid.1 - gap * 0.3,
                scale.small,
                tokens::WEIGHT_REGULAR,
                tokens::FONT_SANS,
                tokens::SECONDARY,
                Anchor::Start,
            ));
        }
    }
    nodes
}
