//! Reusable animated components. Each one lays out a `Composition` inside an area of the
//! canvas and returns scene-graph nodes tagged with storyboard object ids; `compose`
//! applies the storyboard animations afterwards. Layout is recomputed per format.
pub mod annotation;
pub mod architecture;
pub mod cause_effect;
pub mod character;
pub mod chart;
pub mod code;
pub mod comparison;
pub mod flow;
pub mod infographic;
pub mod timeline;
pub mod title;
pub mod transformation;

use crate::format::{Canvas, Rect};
use crate::icons::icon_nodes;
use crate::scene::{Anchor, Node, Shape};
use crate::text::Typesetter;
use crate::tokens::{self, palette, LINE_HEIGHT};
use framechester_core::storyboard::{Icon, Role, VisualObject};
use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Severity {
    Critical,
    Warning,
}

#[derive(Debug, Clone, Serialize)]
pub struct LayoutIssue {
    pub scene_id: u32,
    pub severity: Severity,
    pub code: &'static str,
    pub detail: String,
}

pub struct Ctx<'a> {
    pub canvas: &'a Canvas,
    pub ts: &'a Typesetter,
    pub scene_id: u32,
    pub issues: Vec<LayoutIssue>,
}

/// Id of the edge object between two storyboard objects.
pub fn edge_id(from: &str, to: &str) -> String {
    format!("edge:{from}->{to}")
}

pub fn rows(area: Rect, count: usize, gap: f32) -> Vec<Rect> {
    let count = count.max(1);
    let height = (area.h - gap * (count as f32 - 1.0)) / count as f32;
    (0..count)
        .map(|index| {
            Rect::new(
                area.x,
                area.y + index as f32 * (height + gap),
                area.w,
                height,
            )
        })
        .collect()
}

pub fn cols(area: Rect, count: usize, gap: f32) -> Vec<Rect> {
    let count = count.max(1);
    let width = (area.w - gap * (count as f32 - 1.0)) / count as f32;
    (0..count)
        .map(|index| Rect::new(area.x + index as f32 * (width + gap), area.y, width, area.h))
        .collect()
}

impl<'a> Ctx<'a> {
    pub fn new(canvas: &'a Canvas, ts: &'a Typesetter, scene_id: u32) -> Self {
        Self {
            canvas,
            ts,
            scene_id,
            issues: Vec::new(),
        }
    }

    pub fn issue(&mut self, severity: Severity, code: &'static str, detail: String) {
        self.issues.push(LayoutIssue {
            scene_id: self.scene_id,
            severity,
            code,
            detail,
        });
    }

    fn overflow(&mut self, object: &str, text: &str) {
        self.issue(
            Severity::Critical,
            "text_overflow",
            format!("objeto '{object}': o texto '{text}' nao cabe sem truncar; encurte o rotulo"),
        );
    }

    /// Rounded card coloured by role.
    pub fn card(&self, object: &str, rect: Rect, role: Role) -> Node {
        let colours = palette(role);
        Node::new(
            object,
            Shape::Rect {
                rect,
                rx: self.canvas.radius,
                fill: colours.fill.into(),
                stroke: Some((colours.stroke.into(), self.canvas.stroke)),
            },
        )
        .with_glow(colours.glow)
        .with_z(-1)
        .decorative()
    }

    /// Text fitted inside `rect` between `max` and `min` sizes; records an overflow issue
    /// when it never fits (the text is still drawn at the minimum size, so a human sees it).
    #[allow(clippy::too_many_arguments)]
    pub fn fitted(
        &mut self,
        object: &str,
        text: &str,
        rect: Rect,
        max: f32,
        min: f32,
        weight: u16,
        colour: &str,
        anchor: Anchor,
        valign: f32,
    ) -> (Vec<Node>, f32) {
        let family = tokens::FONT_SANS;
        let (size, lines) = match self.ts.fit(text, max, min, rect.w, rect.h, weight, family) {
            Some(found) => found,
            None => {
                self.overflow(object, text);
                (min, self.ts.wrap(text, min, weight, family, rect.w))
            }
        };
        let height = Typesetter::block_height(size, lines.len());
        let top = rect.y + (rect.h - height).max(0.0) * valign;
        let x = match anchor {
            Anchor::Start => rect.x,
            Anchor::Middle => rect.cx(),
            Anchor::End => rect.right(),
        };
        (
            self.ts
                .block(object, &lines, x, top, size, weight, family, colour, anchor),
            top + height,
        )
    }

    /// A card with optional icon, label and detail. Returns the nodes.
    pub fn labelled_card(
        &mut self,
        object: &VisualObject,
        rect: Rect,
        label_size: f32,
        centred: bool,
    ) -> Vec<Node> {
        let mut nodes = vec![self.card(&object.id, rect, object.role)];
        let colours = palette(object.role);
        let pad = self.canvas.gap * 0.75;
        let mut inner = rect.inset(pad);
        if let Some(icon) = object.icon {
            let size = self.canvas.icon.min(inner.h);
            let (ix, iy) = if centred && inner.h > size * 2.6 {
                (inner.cx() - size / 2.0, inner.y)
            } else {
                (inner.x, inner.y + (inner.h - size) / 2.0)
            };
            nodes.extend(icon_nodes(&object.id, icon, ix, iy, size, colours.stroke));
            if centred && inner.h > size * 2.6 {
                inner = Rect::new(
                    inner.x,
                    iy + size + pad * 0.5,
                    inner.w,
                    inner.h - size - pad * 0.5,
                );
            } else {
                inner = Rect::new(inner.x + size + pad, inner.y, inner.w - size - pad, inner.h);
            }
        }
        let anchor = if centred {
            Anchor::Middle
        } else {
            Anchor::Start
        };
        let small = self.canvas.type_scale.small;
        match &object.detail {
            Some(detail) => {
                let label_area = Rect::new(inner.x, inner.y, inner.w, inner.h * 0.5);
                let (label_nodes, bottom) = self.fitted(
                    &object.id,
                    &object.label,
                    label_area,
                    label_size,
                    small,
                    tokens::WEIGHT_BOLD,
                    colours.text,
                    anchor,
                    if centred { 0.0 } else { 0.5 },
                );
                nodes.extend(label_nodes);
                let detail_area = Rect::new(
                    inner.x,
                    bottom + small * 0.2,
                    inner.w,
                    (inner.bottom() - bottom - small * 0.2).max(small),
                );
                let (detail_nodes, _) = self.fitted(
                    &object.id,
                    detail,
                    detail_area,
                    small * 1.1,
                    small * 0.8,
                    tokens::WEIGHT_REGULAR,
                    tokens::INK_SOFT,
                    anchor,
                    0.0,
                );
                nodes.extend(detail_nodes);
            }
            None => {
                let (label_nodes, _) = self.fitted(
                    &object.id,
                    &object.label,
                    inner,
                    label_size,
                    small,
                    tokens::WEIGHT_SEMIBOLD,
                    colours.text,
                    anchor,
                    0.5,
                );
                nodes.extend(label_nodes);
            }
        }
        nodes
    }

    /// Straight arrow from `from` to `to` with a head, drawable with `draw`.
    pub fn arrow(&self, object: &str, from: (f32, f32), to: (f32, f32), colour: &str) -> Node {
        let width = self.canvas.stroke;
        let head = width * 3.5;
        let (dx, dy) = (to.0 - from.0, to.1 - from.1);
        let length = (dx * dx + dy * dy).sqrt().max(1.0);
        let (ux, uy) = (dx / length, dy / length);
        let (px, py) = (-uy, ux);
        let base = (to.0 - ux * head, to.1 - uy * head);
        let left = (base.0 + px * head * 0.6, base.1 + py * head * 0.6);
        let right = (base.0 - px * head * 0.6, base.1 - py * head * 0.6);
        let d = format!(
            "M{:.1} {:.1} L{:.1} {:.1} M{:.1} {:.1} L{:.1} {:.1} L{:.1} {:.1}",
            from.0, from.1, base.0, base.1, left.0, left.1, to.0, to.1, right.0, right.1
        );
        Node::new(
            object,
            Shape::Path {
                d,
                stroke: colour.into(),
                width,
                length: length + head * 2.4,
                fill: None,
                dashed: false,
            },
        )
        .with_z(-2)
        .decorative()
    }

    /// Orthogonal connector through `points` (first to last) ending in an arrow head.
    pub fn connector(&self, object: &str, points: &[(f32, f32)], colour: &str) -> Node {
        let width = self.canvas.stroke;
        let head = width * 3.5;
        let mut d = String::new();
        let mut length = 0.0f32;
        for (index, point) in points.iter().enumerate() {
            if index == 0 {
                d.push_str(&format!("M{:.1} {:.1}", point.0, point.1));
            } else {
                let previous = points[index - 1];
                length += ((point.0 - previous.0).powi(2) + (point.1 - previous.1).powi(2)).sqrt();
                d.push_str(&format!(" L{:.1} {:.1}", point.0, point.1));
            }
        }
        if points.len() >= 2 {
            let to = points[points.len() - 1];
            let from = points[points.len() - 2];
            let (dx, dy) = (to.0 - from.0, to.1 - from.1);
            let len = (dx * dx + dy * dy).sqrt().max(1.0);
            let (ux, uy) = (dx / len, dy / len);
            let (px, py) = (-uy, ux);
            let base = (to.0 - ux * head, to.1 - uy * head);
            d.push_str(&format!(
                " M{:.1} {:.1} L{:.1} {:.1} L{:.1} {:.1}",
                base.0 + px * head * 0.6,
                base.1 + py * head * 0.6,
                to.0,
                to.1,
                base.0 - px * head * 0.6,
                base.1 - py * head * 0.6
            ));
            length += head * 2.4;
        }
        Node::new(
            object,
            Shape::Path {
                d,
                stroke: colour.into(),
                width,
                length,
                fill: None,
                dashed: false,
            },
        )
        .with_z(-2)
        .decorative()
    }

    /// Small accent kicker text (e.g. a section label) at the top-left of `area`.
    pub fn kicker(&self, object: &str, text: &str, area: Rect, colour: &str) -> Node {
        let size = self.canvas.type_scale.small;
        self.ts.line(
            object,
            &text.to_uppercase(),
            area.x,
            area.y + size,
            size,
            tokens::WEIGHT_SEMIBOLD,
            tokens::FONT_SANS,
            colour,
            Anchor::Start,
        )
    }

    /// A pill-shaped list row: bullet dot plus text; used by comparison and lists.
    pub fn bullet_row(&mut self, object: &VisualObject, rect: Rect, colour: &str) -> Vec<Node> {
        let size = self.canvas.type_scale.body;
        let dot = size * 0.28;
        let mut nodes = vec![Node::new(
            &object.id,
            Shape::Circle {
                cx: rect.x + dot,
                cy: rect.cy(),
                r: dot,
                fill: colour.into(),
                stroke: None,
            },
        )
        .decorative()];
        let text_rect = Rect::new(rect.x + dot * 3.2, rect.y, rect.w - dot * 3.2, rect.h);
        let text = match &object.detail {
            Some(detail) => format!("{} — {detail}", object.label),
            None => object.label.clone(),
        };
        let (text_nodes, _) = self.fitted(
            &object.id,
            &text,
            text_rect,
            size,
            self.canvas.type_scale.small,
            tokens::WEIGHT_REGULAR,
            tokens::INK,
            Anchor::Start,
            0.5,
        );
        nodes.extend(text_nodes);
        nodes
    }

    pub fn icon_for(&self, object: &VisualObject, fallback: Icon) -> Icon {
        object.icon.unwrap_or(fallback)
    }

    pub fn line_height(&self, size: f32) -> f32 {
        size * LINE_HEIGHT
    }
}
