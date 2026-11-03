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
    /// Rotation in degrees, clockwise (SVG convention), around `Node::origin`.
    pub rotate: Track,
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
            rotate: Track::constant(0.0),
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

    /// Bounding box at time `t` including translation, scale and rotation.
    /// Rotation is around `origin`, matching `svg_inner`'s transform
    /// (`translate(origin) rotate scale translate(-origin)`), so the box is
    /// the axis-aligned hull of the four rotated corners.
    pub fn bbox_at(&self, t: f32) -> Rect {
        let base = self.bbox();
        let scale = self.props.scale.eval(t);
        let sx = scale * self.props.sx.eval(t);
        let sy = scale * self.props.sy.eval(t);
        let dx = self.props.dx.eval(t);
        let dy = self.props.dy.eval(t);
        let (ox, oy) = self.origin;
        let degrees = self.props.rotate.eval(t);
        if degrees.abs() < 1e-4 {
            return Rect::new(
                ox + (base.x - ox) * sx + dx,
                oy + (base.y - oy) * sy + dy,
                base.w * sx.abs(),
                base.h * sy.abs(),
            );
        }
        let radians = degrees.to_radians();
        let (sin, cos) = radians.sin_cos();
        let corners = [
            (base.x, base.y),
            (base.right(), base.y),
            (base.x, base.bottom()),
            (base.right(), base.bottom()),
        ];
        let (mut min_x, mut min_y) = (f32::MAX, f32::MAX);
        let (mut max_x, mut max_y) = (f32::MIN, f32::MIN);
        for (x, y) in corners {
            let (lx, ly) = ((x - ox) * sx, (y - oy) * sy);
            let rx = ox + lx * cos - ly * sin + dx;
            let ry = oy + lx * sin + ly * cos + dy;
            min_x = min_x.min(rx);
            min_y = min_y.min(ry);
            max_x = max_x.max(rx);
            max_y = max_y.max(ry);
        }
        Rect::new(min_x, min_y, max_x - min_x, max_y - min_y)
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

/// Slow camera move across a whole scene; captions never move with it.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Camera {
    PushIn,
    PullOut,
    DriftLeft,
    DriftRight,
}

/// How far the camera travels over a scene: small enough that content stays in the safe
/// area, large enough to read as movement.
const CAMERA_ZOOM: f32 = 0.025;
const CAMERA_DRIFT: f32 = 14.0;

impl Camera {
    /// Cycle of moves so consecutive scenes never share one.
    pub fn for_scene(index: usize) -> Self {
        [
            Self::PushIn,
            Self::DriftLeft,
            Self::PullOut,
            Self::DriftRight,
        ][index % 4]
    }

    /// (dx, dy, scale) around the canvas centre at `progress` (0..1) of the scene.
    pub fn at(self, progress: f32, width: f32, height: f32) -> (f32, f32, f32) {
        let p = progress.clamp(0.0, 1.0);
        let (scale, shift) = match self {
            Camera::PushIn => (1.0 + CAMERA_ZOOM * p, 0.0),
            Camera::PullOut => (1.0 + CAMERA_ZOOM * (1.0 - p), 0.0),
            Camera::DriftLeft => (1.0 + CAMERA_ZOOM * 0.5, CAMERA_DRIFT * (1.0 - 2.0 * p)),
            Camera::DriftRight => (1.0 + CAMERA_ZOOM * 0.5, -CAMERA_DRIFT * (1.0 - 2.0 * p)),
        };
        (
            width * (1.0 - scale) / 2.0 + shift,
            height * (1.0 - scale) / 2.0,
            scale,
        )
    }
}

#[derive(Debug, Clone, Default)]
pub struct Graph {
    pub nodes: Vec<Node>,
    /// Named sub-compositions: group name → member object ids. Animating
    /// `group:<name>` animates every member as one unit (see `compose`);
    /// a group is a reusable bundle of objects, not a new node type.
    pub groups: std::collections::BTreeMap<String, Vec<String>>,
    pub background: Option<String>,
    /// Gentle vertical float (amplitude px, period s) so a still composition never
    /// freezes between animation events. Captions are excluded (`z >= 1000`).
    pub breathe: Option<(f32, f32)>,
    /// Camera move over the scene: the move, the scene duration and the canvas size.
    pub camera: Option<(Camera, f32, (f32, f32))>,
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

    /// Registers (or replaces) a named sub-composition over existing objects.
    pub fn define_group(
        &mut self,
        name: &str,
        objects: impl IntoIterator<Item = impl Into<String>>,
    ) {
        self.groups.insert(
            name.to_string(),
            objects.into_iter().map(Into::into).collect(),
        );
    }

    /// Member object ids of a group, when registered.
    pub fn group_members(&self, name: &str) -> Option<&Vec<String>> {
        self.groups.get(name)
    }

    /// True when `object` belongs to the group named by a `group:<name>` target.
    pub fn in_group(&self, target: &str, object: &str) -> bool {
        target
            .strip_prefix("group:")
            .and_then(|name| self.groups.get(name))
            .is_some_and(|members| members.iter().any(|member| member == object))
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
                    &props.rotate,
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

    /// Layered frame background: vertical gradient, a soft accent glow in the
    /// upper third and a vignette that darkens the edges. Decorative only; it is
    /// never a readable node, so layout QA is unaffected. `base` overrides the
    /// gradient mid-tone (per-graph background colour).
    pub fn background_svg(width: u32, height: u32, base: Option<&str>) -> String {
        let base = base.unwrap_or(tokens::BACKGROUND);
        format!(
            "<defs><linearGradient id='fc-bg' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='{}'/><stop offset='0.55' stop-color='{base}'/><stop offset='1' stop-color='{}'/></linearGradient><radialGradient id='fc-glow' cx='0.5' cy='0.22' r='0.75'><stop offset='0' stop-color='{}' stop-opacity='{}'/><stop offset='1' stop-color='{}' stop-opacity='0'/></radialGradient><radialGradient id='fc-vig' cx='0.5' cy='0.5' r='0.85'><stop offset='0.62' stop-color='#000000' stop-opacity='0'/><stop offset='1' stop-color='#000000' stop-opacity='0.38'/></radialGradient></defs><rect width='{width}' height='{height}' fill='url(#fc-bg)'/><rect width='{width}' height='{height}' fill='url(#fc-glow)'/><rect width='{width}' height='{height}' fill='url(#fc-vig)'/>",
            tokens::BACKGROUND_TOP,
            tokens::BACKGROUND_BOTTOM,
            tokens::ACCENT,
            tokens::BACKGROUND_GLOW_OPACITY,
            tokens::ACCENT,
        )
    }

    /// The SVG document for instant `t`.
    pub fn svg(&self, t: f32, width: u32, height: u32, font_family: &str) -> String {
        let mut svg = String::with_capacity(16 * 1024);
        svg.push_str(&format!(
            "<svg xmlns='http://www.w3.org/2000/svg' width='{width}' height='{height}' viewBox='0 0 {width} {height}'>{}<g font-family='{}'>",
            Self::background_svg(width, height, self.background.as_deref()),
            xml(font_family)
        ));
        self.svg_inner(&mut svg, t, 0.0, 0.0, 1.0, 1.0);
        svg.push_str("</g></svg>");
        svg
    }

    /// Camera travel factor of one parallax band: background layers (`z < 0`)
    /// travel less than the focal plane (`z == 0`), foreground (`z > 0`, below
    /// captions) travels more. Captions (`z >= Z_CAPTIONS`) never join the camera.
    fn parallax_factor(z: i32) -> f32 {
        if z < 0 {
            0.55
        } else if z > 0 {
            1.3
        } else {
            1.0
        }
    }

    fn parallax_band(z: i32) -> i32 {
        if z < 0 {
            -1
        } else if z > 0 {
            1
        } else {
            0
        }
    }

    /// Appends the scene content for instant `t`, shifted by (`dx`, `dy`), scaled by
    /// `scale` around the canvas centre and multiplied by `opacity`. Used for transitions.
    pub fn svg_inner(&self, svg: &mut String, t: f32, dx: f32, dy: f32, scale: f32, opacity: f32) {
        self.svg_inner_ex(svg, t, dx, dy, scale, scale, opacity);
    }

    /// Like [`Self::svg_inner`] but with non-uniform outer scale (`sx`, `sy`):
    /// the whip-pan transition stretches the frame horizontally mid-whip to
    /// simulate motion blur. Limit: this is a geometric stretch plus an
    /// opacity dip, not a true blur — resvg has no cheap seekable blur here.
    #[allow(clippy::too_many_arguments)]
    pub fn svg_inner_ex(
        &self,
        svg: &mut String,
        t: f32,
        dx: f32,
        dy: f32,
        sx: f32,
        sy: f32,
        opacity: f32,
    ) {
        let mut order: Vec<&Node> = self.nodes.iter().collect();
        order.sort_by_key(|node| node.z);
        let breathe_dy = self
            .breathe
            .map(|(amplitude, period)| {
                amplitude * (2.0 * std::f32::consts::PI * t / period.max(0.5)).sin()
            })
            .unwrap_or(0.0);
        let outer = dx.abs() > 1e-3
            || dy.abs() > 1e-3
            || (sx - 1.0).abs() > 1e-3
            || (sy - 1.0).abs() > 1e-3
            || opacity < 0.999;
        if outer {
            svg.push_str(&format!(
                "<g transform='translate({dx:.2} {dy:.2}) scale({sx:.4} {sy:.4})' opacity='{}'>",
                fmt(opacity)
            ));
        }
        // Camera with parallax bands: background (z < 0) travels 0.55x, the
        // focal plane (z == 0) 1x, foreground (0 < z < captions) 1.3x.
        // Captions never join the camera. Nodes are z-sorted, so bands are
        // contiguous and each band opens/closes one <g>.
        let camera_base = self.camera.map(|(camera, duration, (width, height))| {
            (
                camera.at(t / duration.max(0.1), width, height),
                width,
                height,
            )
        });
        let band_open = |svg: &mut String, band: i32| {
            if let Some(((cx, cy, cs), width, height)) = camera_base {
                let f = Self::parallax_factor(band);
                let s = 1.0 + (cs - 1.0) * f;
                let bx = width * (1.0 - s) / 2.0 + (cx - width * (1.0 - cs) / 2.0) * f;
                let by = height * (1.0 - s) / 2.0 + (cy - height * (1.0 - cs) / 2.0) * f;
                // Four decimals: a slow zoom in 0.01 steps would visibly jump.
                svg.push_str(&format!(
                    "<g transform='translate({bx:.2} {by:.2}) scale({s:.4})'>"
                ));
            }
        };
        let mut open_band: Option<i32> = None;
        for node in order {
            let wanted = if camera_base.is_some() && node.z < Z_CAPTIONS {
                Some(Self::parallax_band(node.z))
            } else {
                None
            };
            if wanted != open_band {
                if open_band.is_some() {
                    svg.push_str("</g>");
                }
                if let Some(band) = wanted {
                    band_open(svg, band);
                }
                open_band = wanted;
            }
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
            let rotate = node.props.rotate.eval(t);
            let glow = node.props.glow.eval(t);
            let (ox, oy) = node.origin;
            let mut transform = String::new();
            if ndx.abs() > 1e-3 || ndy.abs() > 1e-3 {
                transform.push_str(&format!("translate({} {}) ", fmt(ndx), fmt(ndy)));
            }
            if (sx - 1.0).abs() > 1e-3 || (sy - 1.0).abs() > 1e-3 || rotate.abs() > 1e-3 {
                transform.push_str(&format!(
                    "translate({} {}) rotate({}) scale({} {}) translate({} {})",
                    fmt(ox),
                    fmt(oy),
                    fmt(rotate),
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
            node.shadow_svg(svg);
            if glow > 0.01 {
                node.glow_svg(svg, glow);
            }
            node.shape_svg(svg, t);
            svg.push_str("</g>");
        }
        if open_band.is_some() {
            svg.push_str("</g>");
        }
        if outer {
            svg.push_str("</g>");
        }
    }
}

impl Node {
    /// Soft elevation under card-like rects: two offset black layers, cheaper
    /// than an SVG blur filter at 30 fps and stable across rasterizers.
    /// Captions and tiny chips are excluded; full-canvas backgrounds are not
    /// nodes, so every rounded rect here is scene content.
    fn shadow_svg(&self, svg: &mut String) {
        if self.z >= Z_CAPTIONS {
            return;
        }
        if let Shape::Rect { rect, rx, fill, .. } = &self.shape {
            if *rx < 6.0 || rect.w < 80.0 || rect.h < 40.0 {
                return;
            }
            if fill == tokens::CAPTION_BOX {
                return;
            }
            for (dy, opacity) in [(16.0, 0.16), (8.0, 0.22)] {
                svg.push_str(&format!(
                    "<rect x='{}' y='{}' width='{}' height='{}' rx='{}' fill='#000000' opacity='{}'/>",
                    fmt(rect.x),
                    fmt(rect.y + dy),
                    fmt(rect.w),
                    fmt(rect.h),
                    fmt(*rx),
                    fmt(opacity)
                ));
            }
        }
    }

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

/// Helpers to build common motions on a node's props. Each entering motion starts from its
/// hidden state at frame 0, or at its own start when that is earlier (the hook enters
/// before frame 0 so the opening is already on screen).
impl Props {
    /// Fade and slide in from `offset` pixels below (or beside) the final place.
    pub fn reveal(&mut self, at: f32, duration: f32, offset: (f32, f32), easing: Easing) {
        self.opacity.key(at.min(0.0), 0.0, Easing::Linear);
        self.opacity.to(at, duration * 0.8, 1.0, Easing::EaseOut);
        self.dx.key(at.min(0.0), offset.0, Easing::Linear);
        self.dx.to(at, duration, 0.0, easing);
        self.dy.key(at.min(0.0), offset.1, Easing::Linear);
        self.dy.to(at, duration, 0.0, easing);
    }

    pub fn pop(&mut self, at: f32, duration: f32, easing: Easing) {
        self.opacity.key(at.min(0.0), 0.0, Easing::Linear);
        self.opacity.to(at, duration * 0.5, 1.0, Easing::EaseOut);
        self.scale.key(at.min(0.0), 0.6, Easing::Linear);
        self.scale.to(at, duration, 1.0, easing);
    }

    pub fn hidden_until(&mut self, at: f32) {
        self.opacity.key(at.min(0.0), 0.0, Easing::Linear);
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
        self.draw.key(at.min(0.0), 0.0, Easing::Linear);
        self.draw.to(at, duration, 1.0, easing);
    }

    pub fn hide(&mut self, at: f32, duration: f32) {
        self.opacity.to(at, duration, 0.0, Easing::EaseIn);
    }

    /// Grow along x (bars) from zero to full width.
    pub fn grow_x(&mut self, at: f32, duration: f32, easing: Easing) {
        self.sx.key(at.min(0.0), 0.0, Easing::Linear);
        self.sx.to(at, duration, 1.0, easing);
    }

    /// Grow along y (columns) from zero to full height.
    pub fn grow_y(&mut self, at: f32, duration: f32, easing: Easing) {
        self.sy.key(at.min(0.0), 0.0, Easing::Linear);
        self.sy.to(at, duration, 1.0, easing);
    }

    /// Rotate from the current angle to `degrees` around the node's origin.
    pub fn rotate_to(&mut self, at: f32, duration: f32, degrees: f32, easing: Easing) {
        self.rotate.to(at, duration, degrees, easing);
    }

    pub fn type_in(&mut self, at: f32, duration: f32, characters: usize) {
        self.typed.key(at.min(0.0), 0.0, Easing::Linear);
        self.typed
            .to(at, duration, characters as f32 + 0.5, Easing::Linear);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_camera_moves_the_content_and_never_the_captions() {
        let shape = || Shape::Circle {
            cx: 10.0,
            cy: 10.0,
            r: 5.0,
            fill: "#fff".into(),
            stroke: None,
        };
        let graph = Graph {
            nodes: vec![
                Node::new("content", shape()),
                Node::new("caption", shape()).with_z(Z_CAPTIONS),
            ],
            camera: Some((Camera::PushIn, 4.0, (100.0, 100.0))),
            ..Graph::default()
        };
        let svg = graph.svg(4.0, 100, 100, "Inter");
        let camera = svg.find("scale(1.0250)").expect("camera applied");
        let content = svg.find("<circle").unwrap();
        let caption = svg.rfind("<circle").unwrap();
        let closed = camera + svg[camera..].find("</g></g>").unwrap();
        assert!(
            camera < content && content < closed && closed < caption,
            "{svg}"
        );
    }

    #[test]
    fn parallax_moves_background_less_than_the_focal_plane() {
        let shape = |z: i32| {
            Node::new(
                "n",
                Shape::Circle {
                    cx: 10.0,
                    cy: 10.0,
                    r: 5.0,
                    fill: "#fff".into(),
                    stroke: None,
                },
            )
            .with_z(z)
        };
        let graph = Graph {
            nodes: vec![shape(-1), shape(0), shape(Z_CAPTIONS)],
            camera: Some((Camera::PushIn, 4.0, (100.0, 100.0))),
            ..Graph::default()
        };
        let svg = graph.svg(4.0, 100, 100, "Inter");
        // Focal plane keeps the full 1.025 zoom; background gets 55% of it.
        assert!(svg.contains("scale(1.0250)"), "{svg}");
        assert!(svg.contains("scale(1.013"), "{svg}");
        // Three circles drawn; captions outside every camera group.
        assert_eq!(svg.matches("<circle").count(), 3, "{svg}");
    }

    #[test]
    fn frames_have_a_layered_background_instead_of_a_flat_fill() {
        let graph = Graph::default();
        let svg = graph.svg(0.0, 100, 100, "Inter");
        assert!(svg.contains("id='fc-bg'"), "{svg}");
        assert!(svg.contains("id='fc-glow'"), "{svg}");
        assert!(svg.contains("id='fc-vig'"), "{svg}");
        assert!(svg.contains("fill='url(#fc-bg)'"), "{svg}");
    }

    #[test]
    fn cards_get_elevation_but_captions_do_not() {
        let card = Node::new(
            "card",
            Shape::Rect {
                rect: Rect::new(10.0, 10.0, 200.0, 100.0),
                rx: 12.0,
                fill: tokens::SURFACE.into(),
                stroke: None,
            },
        );
        let mut with_card = Graph::default();
        with_card.push(card);
        let svg = with_card.svg(0.0, 300, 200, "Inter");
        assert_eq!(svg.matches("fill='#000000' opacity=").count(), 2, "{svg}");

        let mut caption = Node::new(
            "cap",
            Shape::Rect {
                rect: Rect::new(10.0, 10.0, 200.0, 100.0),
                rx: 12.0,
                fill: tokens::CAPTION_BOX.into(),
                stroke: None,
            },
        )
        .with_z(Z_CAPTIONS);
        caption.props = Props::default();
        let mut with_caption = Graph::default();
        with_caption.push(caption);
        let svg = with_caption.svg(0.0, 300, 200, "Inter");
        assert!(!svg.contains("opacity='0.22'"), "{svg}");
    }

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
    fn rotation_swaps_bbox_axes_at_ninety_degrees() {
        let mut node = Node::new(
            "r",
            Shape::Rect {
                rect: Rect::new(0.0, 0.0, 100.0, 50.0),
                rx: 0.0,
                fill: "#fff".into(),
                stroke: None,
            },
        );
        // Origin is the rect centre (50, 25): a 90 degree turn swaps w/h there.
        node.props.rotate = Track::constant(90.0);
        let bbox = node.bbox_at(0.0);
        assert!((bbox.x - 25.0).abs() < 1e-3, "{bbox:?}");
        assert!((bbox.y - -25.0).abs() < 1e-3, "{bbox:?}");
        assert!((bbox.w - 50.0).abs() < 1e-3, "{bbox:?}");
        assert!((bbox.h - 100.0).abs() < 1e-3, "{bbox:?}");
        // No rotation keeps the old box, and rotation is visible in the SVG.
        node.props.rotate = Track::constant(0.0);
        assert_eq!(node.bbox_at(0.0), Rect::new(0.0, 0.0, 100.0, 50.0));
        node.props.rotate_to(1.0, 1.0, 45.0, Easing::Linear);
        let mut graph = Graph::default();
        graph.push(node);
        assert!(graph.svg(2.0, 200, 200, "Inter").contains("rotate(45)"));
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
