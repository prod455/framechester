//! Scene graph: shapes with animatable properties, emitted as SVG for one instant.
//! Components build graphs; the rasterizer turns `graph.svg(t)` into frames.
use crate::anim::Track;
use crate::format::Rect;
use crate::tokens;
use framechester_core::storyboard::Easing;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Anchor {
    Start,
    Middle,
    End,
}

#[derive(Debug, Clone, PartialEq)]
pub enum Shape {
    Rect {
        rect: Rect,
        rx: f32,
        fill: String,
        stroke: Option<(String, f32)>,
    },
    Circle {
        cx: f32,
        cy: f32,
        r: f32,
        fill: String,
        stroke: Option<(String, f32)>,
    },
    /// Open path drawn with `draw` progress (0..1) via stroke-dasharray.
    Path {
        d: String,
        stroke: String,
        width: f32,
        length: f32,
        fill: Option<String>,
        dashed: bool,
    },
    Text {
        x: f32,
        y: f32,
        size: f32,
        weight: u16,
        family: &'static str,
        fill: String,
        anchor: Anchor,
        content: String,
        /// Measured box, for QA.
        bbox: Rect,
        /// Animated number: the shown text is `value × draw progress`, formatted.
        counter: Option<(f64, Option<String>)>,
    },
}

/// Animatable properties of a node. Every value is a track; constants are cheap.
#[derive(Debug, Clone, PartialEq)]
pub struct Props {
    pub opacity: Track,
    pub dx: Track,
    pub dy: Track,
    pub scale: Track,
    /// Non-uniform scale, for bars growing from one edge.
    pub sx: Track,
    pub sy: Track,
    /// Stroke draw progress for paths and count progress for counters; ignored elsewhere.
    pub draw: Track,
    /// Glow ring intensity 0..1 (highlight).
    pub glow: Track,
    /// Characters shown for text (typewriter); `f32::MAX` means all.
    pub typed: Track,
}

impl Default for Props {
    fn default() -> Self {
        Self {
            opacity: Track::constant(1.0),
            dx: Track::constant(0.0),
            dy: Track::constant(0.0),
            scale: Track::constant(1.0),
            sx: Track::constant(1.0),
            sy: Track::constant(1.0),
            draw: Track::constant(1.0),
            glow: Track::constant(0.0),
            typed: Track::constant(f32::MAX),
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct Node {
    /// Storyboard object id this node belongs to (several nodes per object).
    pub object: String,
    pub shape: Shape,
    /// Scale origin.
    pub origin: (f32, f32),
    /// Static translation applied after layout (e.g. vertical centring of a component).
    pub offset: (f32, f32),
    pub props: Props,
    /// Glow colour when highlighted.
    pub glow_colour: String,
    pub z: i32,
    /// Whether QA must keep this inside the content/safe area and free of overlaps.
    pub readable: bool,
}

impl Node {
    pub fn new(object: &str, shape: Shape) -> Self {
        let origin = match &shape {
            Shape::Rect { rect, .. } => (rect.cx(), rect.cy()),
            Shape::Circle { cx, cy, .. } => (*cx, *cy),
            Shape::Path { .. } => (0.0, 0.0),
            Shape::Text { bbox, .. } => (bbox.cx(), bbox.cy()),
        };
        Self {
            object: object.to_string(),
            shape,
            origin,
            offset: (0.0, 0.0),
            props: Props::default(),
            glow_colour: tokens::ACCENT.into(),
            z: 0,
            readable: true,
        }
    }

    pub fn with_origin(mut self, origin: (f32, f32)) -> Self {
        self.origin = origin;
        self
    }

    pub fn with_z(mut self, z: i32) -> Self {
        self.z = z;
        self
    }

    pub fn with_glow(mut self, colour: &str) -> Self {
        self.glow_colour = colour.to_string();
        self
    }

    pub fn decorative(mut self) -> Self {
        self.readable = false;
        self
    }

    /// Static bounding box (before animation, after `offset`), for layout QA.
    pub fn bbox(&self) -> Rect {
        let base = match &self.shape {
            Shape::Rect { rect, .. } => *rect,
            Shape::Circle { cx, cy, r, .. } => Rect::new(cx - r, cy - r, 2.0 * r, 2.0 * r),
            Shape::Path { .. } => return Rect::new(0.0, 0.0, 0.0, 0.0),
            Shape::Text { bbox, .. } => *bbox,
        };
        Rect::new(
            base.x + self.offset.0,
            base.y + self.offset.1,
            base.w,
            base.h,
        )
    }

    /// Moves the node by (`dx`, `dy`) after layout.
    pub fn shift(&mut self, dx: f32, dy: f32) {
        self.offset.0 += dx;
        self.offset.1 += dy;
        self.origin.0 += dx;
        self.origin.1 += dy;
    }

    /// Bounding box at time `t` including translation and scale.
    pub fn bbox_at(&self, t: f32) -> Rect {
        let base = self.bbox();
        let scale = self.props.scale.eval(t);
        let sx = scale * self.props.sx.eval(t);
        let sy = scale * self.props.sy.eval(t);
        let dx = self.props.dx.eval(t);
        let dy = self.props.dy.eval(t);
        let (ox, oy) = self.origin;
        Rect::new(
            ox + (base.x - ox) * sx + dx,
            oy + (base.y - oy) * sy + dy,
            base.w * sx,
            base.h * sy,
        )
    }

    pub fn is_text(&self) -> bool {
        matches!(self.shape, Shape::Text { .. })
    }
}

pub fn xml(text: &str) -> String {
    text.chars()
        .filter(|c| !c.is_control() || c.is_whitespace())
        .collect::<String>()
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

fn fmt(value: f32) -> String {
    if value.fract() == 0.0 {
        format!("{}", value as i64)
    } else {
        format!("{value:.2}")
    }
}

#[derive(Debug, Clone, Default)]
pub struct Graph {
    pub nodes: Vec<Node>,
    pub background: Option<String>,
    /// Gentle vertical float (amplitude px, period s) so a still composition never
    /// freezes between animation events. Captions are excluded (`z >= 1000`).
    pub breathe: Option<(f32, f32)>,
}

/// Caption nodes sit at or above this z and are not affected by camera motion.
pub const Z_CAPTIONS: i32 = 1000;

impl Graph {
    pub fn push(&mut self, node: Node) {
        self.nodes.push(node);
    }

    pub fn extend(&mut self, nodes: impl IntoIterator<Item = Node>) {
        self.nodes.extend(nodes);
    }

    /// Mutable access to every node of an object.
    pub fn nodes_of<'a>(&'a mut self, object: &'a str) -> impl Iterator<Item = &'a mut Node> + 'a {
        self.nodes
            .iter_mut()
            .filter(move |node| node.object == object)
    }

    pub fn has_object(&self, object: &str) -> bool {
        self.nodes.iter().any(|node| node.object == object)
    }

    /// Object ids in first-appearance order.
    pub fn objects(&self) -> Vec<String> {
        let mut ids: Vec<String> = Vec::new();
        for node in &self.nodes {
            if !ids.contains(&node.object) {
                ids.push(node.object.clone());
            }
        }
        ids
    }

    /// Union of the static boxes of an object's nodes.
    pub fn object_bbox(&self, object: &str) -> Option<Rect> {
        let mut result: Option<Rect> = None;
        for node in self.nodes.iter().filter(|node| node.object == object) {
            let bbox = node.bbox();
            if bbox.w <= 0.0 && bbox.h <= 0.0 {
                continue;
            }
            result = Some(match result {
                None => bbox,
                Some(current) => {
                    let x = current.x.min(bbox.x);
                    let y = current.y.min(bbox.y);
                    Rect::new(
                        x,
                        y,
                        current.right().max(bbox.right()) - x,
                        current.bottom().max(bbox.bottom()) - y,
                    )
                }
            });
        }
        result
    }

    /// Times where any node changes, for the visual-change QA.
    pub fn change_times(&self) -> Vec<f32> {
        let mut times: Vec<f32> = self
            .nodes
            .iter()
            .flat_map(|node| {
                let props = &node.props;
                [
                    &props.opacity,
                    &props.dx,
                    &props.dy,
                    &props.scale,
                    &props.sx,
                    &props.sy,
                    &props.draw,
                    &props.glow,
                    &props.typed,
                ]
                .into_iter()
                .flat_map(|track| track.change_times())
                .collect::<Vec<_>>()
            })
            .collect();
        times.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
        times.dedup_by(|a, b| (*a - *b).abs() < 0.05);
        times
    }

    /// The SVG document for instant `t`.
    pub fn svg(&self, t: f32, width: u32, height: u32, font_family: &str) -> String {
        let mut svg = String::with_capacity(16 * 1024);
        svg.push_str(&format!(
            "<svg xmlns='http://www.w3.org/2000/svg' width='{width}' height='{height}' viewBox='0 0 {width} {height}'><rect width='100%' height='100%' fill='{}'/><g font-family='{}'>",
            self.background.as_deref().unwrap_or(tokens::BACKGROUND),
            xml(font_family)
        ));
        self.svg_inner(&mut svg, t, 0.0, 0.0, 1.0, 1.0);
        svg.push_str("</g></svg>");
        svg
    }

    /// Appends the scene content for instant `t`, shifted by (`dx`, `dy`), scaled by
    /// `scale` around the canvas centre and multiplied by `opacity`. Used for transitions.
    pub fn svg_inner(&self, svg: &mut String, t: f32, dx: f32, dy: f32, scale: f32, opacity: f32) {
        let mut order: Vec<&Node> = self.nodes.iter().collect();
        order.sort_by_key(|node| node.z);
        let breathe_dy = self
            .breathe
            .map(|(amplitude, period)| {
                amplitude * (2.0 * std::f32::consts::PI * t / period.max(0.5)).sin()
            })
            .unwrap_or(0.0);
        let outer =
            dx.abs() > 1e-3 || dy.abs() > 1e-3 || (scale - 1.0).abs() > 1e-3 || opacity < 0.999;
        if outer {
            svg.push_str(&format!(
                "<g transform='translate({} {}) scale({})' opacity='{}'>",
                fmt(dx),
                fmt(dy),
                fmt(scale),
                fmt(opacity)
            ));
        }
        for node in order {
            let node_opacity = node.props.opacity.eval(t);
            if node_opacity <= 0.002 {
                continue;
            }
            let ndx = node.props.dx.eval(t) + node.offset.0;
            let ndy = node.props.dy.eval(t)
                + node.offset.1
                + if node.z >= Z_CAPTIONS {
                    0.0
                } else {
                    breathe_dy
                };
            let scale = node.props.scale.eval(t);
            let sx = scale * node.props.sx.eval(t);
            let sy = scale * node.props.sy.eval(t);
            let glow = node.props.glow.eval(t);
            let (ox, oy) = node.origin;
            let mut transform = String::new();
            if ndx.abs() > 1e-3 || ndy.abs() > 1e-3 {
                transform.push_str(&format!("translate({} {}) ", fmt(ndx), fmt(ndy)));
            }
            if (sx - 1.0).abs() > 1e-3 || (sy - 1.0).abs() > 1e-3 {
                transform.push_str(&format!(
                    "translate({} {}) scale({} {}) translate({} {})",
                    fmt(ox),
                    fmt(oy),
                    fmt(sx.max(0.0)),
                    fmt(sy.max(0.0)),
                    fmt(-ox),
                    fmt(-oy)
                ));
            }
            svg.push_str("<g");
            if !transform.is_empty() {
                svg.push_str(&format!(" transform='{}'", transform.trim()));
            }
            if node_opacity < 0.999 {
                svg.push_str(&format!(" opacity='{}'", fmt(node_opacity)));
            }
            svg.push('>');
            if glow > 0.01 {
                node.glow_svg(svg, glow);
            }
            node.shape_svg(svg, t);
            svg.push_str("</g>");
        }
        if outer {
            svg.push_str("</g>");
        }
    }
}

impl Node {
    fn glow_svg(&self, svg: &mut String, glow: f32) {
        let colour = &self.glow_colour;
        match &self.shape {
            Shape::Rect { rect, rx, .. } => {
                let pad = 6.0 + 6.0 * glow;
                svg.push_str(&format!(
                    "<rect x='{}' y='{}' width='{}' height='{}' rx='{}' fill='none' stroke='{colour}' stroke-width='{}' opacity='{}'/>",
                    fmt(rect.x - pad),
                    fmt(rect.y - pad),
                    fmt(rect.w + 2.0 * pad),
                    fmt(rect.h + 2.0 * pad),
                    fmt(rx + pad),
                    fmt(3.0 + 3.0 * glow),
                    fmt(0.25 + 0.5 * glow)
                ));
            }
            Shape::Circle { r, .. } if *r < 18.0 => {}
            Shape::Circle { cx, cy, r, .. } => {
                let pad = 6.0 + 6.0 * glow;
                svg.push_str(&format!(
                    "<circle cx='{}' cy='{}' r='{}' fill='none' stroke='{colour}' stroke-width='{}' opacity='{}'/>",
                    fmt(*cx),
                    fmt(*cy),
                    fmt(r + pad),
                    fmt(3.0 + 3.0 * glow),
                    fmt(0.25 + 0.5 * glow)
                ));
            }
            Shape::Path { d, width, .. } => {
                svg.push_str(&format!(
                    "<path d='{}' fill='none' stroke='{colour}' stroke-width='{}' stroke-linecap='round' opacity='{}'/>",
                    xml(d),
                    fmt(width + 8.0 * glow),
                    fmt(0.35 * glow)
                ));
            }
            Shape::Text { .. } => {}
        }
    }

    fn shape_svg(&self, svg: &mut String, t: f32) {
        match &self.shape {
            Shape::Rect {
                rect,
                rx,
                fill,
                stroke,
            } => {
                svg.push_str(&format!(
                    "<rect x='{}' y='{}' width='{}' height='{}' rx='{}' fill='{fill}'",
                    fmt(rect.x),
                    fmt(rect.y),
                    fmt(rect.w),
                    fmt(rect.h),
                    fmt(*rx)
                ));
                if let Some((colour, width)) = stroke {
                    svg.push_str(&format!(
                        " stroke='{colour}' stroke-width='{}'",
                        fmt(*width)
                    ));
                }
                svg.push_str("/>");
            }
            Shape::Circle {
                cx,
                cy,
                r,
                fill,
                stroke,
            } => {
                svg.push_str(&format!(
                    "<circle cx='{}' cy='{}' r='{}' fill='{fill}'",
                    fmt(*cx),
                    fmt(*cy),
                    fmt(*r)
                ));
                if let Some((colour, width)) = stroke {
                    svg.push_str(&format!(
                        " stroke='{colour}' stroke-width='{}'",
                        fmt(*width)
                    ));
                }
                svg.push_str("/>");
            }
            Shape::Path {
                d,
                stroke,
                width,
                length,
                fill,
                dashed,
            } => {
                let draw = self.props.draw.eval(t).clamp(0.0, 1.0);
                if draw <= 0.001 {
                    return;
                }
                svg.push_str(&format!(
                    "<path d='{}' fill='{}' stroke='{stroke}' stroke-width='{}' stroke-linecap='round' stroke-linejoin='round'",
                    xml(d),
                    fill.as_deref().unwrap_or("none"),
                    fmt(*width)
                ));
                if draw < 0.999 {
                    svg.push_str(&format!(
                        " stroke-dasharray='{} {}' stroke-dashoffset='0'",
                        fmt(length * draw),
                        fmt(length * 2.0 + 10.0)
                    ));
                } else if *dashed {
                    svg.push_str(&format!(
                        " stroke-dasharray='{} {}'",
                        fmt(width * 3.0),
                        fmt(width * 2.5)
                    ));
                }
                svg.push_str("/>");
            }
            Shape::Text {
                x,
                y,
                size,
                weight,
                family,
                fill,
                anchor,
                content,
                counter,
                ..
            } => {
                let typed = self.props.typed.eval(t);
                let content = match counter {
                    Some((value, unit)) => {
                        let progress = self.props.draw.eval(t).clamp(0.0, 1.0) as f64;
                        framechester_core::storyboard::format_value(
                            value * progress,
                            unit.as_deref(),
                        )
                    }
                    None => content.clone(),
                };
                let shown: String = if typed >= content.chars().count() as f32 {
                    content
                } else {
                    content.chars().take(typed.max(0.0) as usize).collect()
                };
                if shown.is_empty() {
                    return;
                }
                let anchor = match anchor {
                    Anchor::Start => "start",
                    Anchor::Middle => "middle",
                    Anchor::End => "end",
                };
                svg.push_str(&format!(
                    "<text x='{}' y='{}' font-size='{}' font-weight='{weight}' font-family='{}' fill='{fill}' text-anchor='{anchor}' xml:space='preserve'>{}</text>",
                    fmt(*x),
                    fmt(*y),
                    fmt(*size),
                    xml(family),
                    xml(&shown)
                ));
            }
        }
    }
}

/// Helpers to build common motions on a node's props.
impl Props {
    /// Fade and slide in from `offset` pixels below (or beside) the final place.
    pub fn reveal(&mut self, at: f32, duration: f32, offset: (f32, f32), easing: Easing) {
        self.opacity.key(0.0, 0.0, Easing::Linear);
        self.opacity.to(at, duration * 0.8, 1.0, Easing::EaseOut);
        self.dx.key(0.0, offset.0, Easing::Linear);
        self.dx.to(at, duration, 0.0, easing);
        self.dy.key(0.0, offset.1, Easing::Linear);
        self.dy.to(at, duration, 0.0, easing);
    }

    pub fn pop(&mut self, at: f32, duration: f32, easing: Easing) {
        self.opacity.key(0.0, 0.0, Easing::Linear);
        self.opacity.to(at, duration * 0.5, 1.0, Easing::EaseOut);
        self.scale.key(0.0, 0.6, Easing::Linear);
        self.scale.to(at, duration, 1.0, easing);
    }

    pub fn hidden_until(&mut self, at: f32) {
        self.opacity.key(0.0, 0.0, Easing::Linear);
        self.opacity.to(at, 0.2, 1.0, Easing::EaseOut);
    }

    pub fn highlight(&mut self, at: f32, duration: f32) {
        self.glow.to(at, 0.25, 1.0, Easing::EaseOut);
        self.glow
            .to(at + duration.max(0.3), 0.5, 0.0, Easing::EaseInOut);
    }

    pub fn pulse(&mut self, at: f32, duration: f32) {
        let base = self.scale.eval(at);
        self.scale
            .to(at, duration * 0.45, base * 1.06, Easing::EaseOut);
        self.scale.to(
            at + duration * 0.45,
            duration * 0.55,
            base,
            Easing::EaseInOut,
        );
    }

    pub fn draw(&mut self, at: f32, duration: f32, easing: Easing) {
        self.draw.key(0.0, 0.0, Easing::Linear);
        self.draw.to(at, duration, 1.0, easing);
    }

    pub fn hide(&mut self, at: f32, duration: f32) {
        self.opacity.to(at, duration, 0.0, Easing::EaseIn);
    }

    /// Grow along x (bars) from zero to full width.
    pub fn grow_x(&mut self, at: f32, duration: f32, easing: Easing) {
        self.sx.key(0.0, 0.0, Easing::Linear);
        self.sx.to(at, duration, 1.0, easing);
    }

    /// Grow along y (columns) from zero to full height.
    pub fn grow_y(&mut self, at: f32, duration: f32, easing: Easing) {
        self.sy.key(0.0, 0.0, Easing::Linear);
        self.sy.to(at, duration, 1.0, easing);
    }

    pub fn type_in(&mut self, at: f32, duration: f32, characters: usize) {
        self.typed.key(0.0, 0.0, Easing::Linear);
        self.typed
            .to(at, duration, characters as f32 + 0.5, Easing::Linear);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn svg_skips_invisible_nodes_and_escapes_text() {
        let mut graph = Graph::default();
        let mut node = Node::new(
            "a",
            Shape::Text {
                x: 10.0,
                y: 20.0,
                size: 30.0,
                weight: 700,
                family: tokens::FONT_SANS,
                fill: tokens::INK.into(),
                anchor: Anchor::Start,
                content: "A < B & C".into(),
                bbox: Rect::new(10.0, 0.0, 100.0, 30.0),
                counter: None,
            },
        );
        node.props.hidden_until(1.0);
        graph.push(node);
        let before = graph.svg(0.5, 100, 100, "Inter");
        assert!(!before.contains("<text"));
        let after = graph.svg(2.0, 100, 100, "Inter");
        assert!(after.contains("A &lt; B &amp; C"));
        assert_eq!(graph.change_times(), vec![1.0]);
    }

    #[test]
    fn bbox_follows_scale_and_translation() {
        let mut node = Node::new(
            "r",
            Shape::Rect {
                rect: Rect::new(0.0, 0.0, 100.0, 50.0),
                rx: 0.0,
                fill: "#fff".into(),
                stroke: None,
            },
        );
        node.props.scale = Track::constant(2.0);
        node.props.dx = Track::constant(10.0);
        let bbox = node.bbox_at(0.0);
        assert_eq!(
            (bbox.x, bbox.y, bbox.w, bbox.h),
            (-40.0, -25.0, 200.0, 100.0)
        );
    }
}
